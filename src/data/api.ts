import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { getDb } from '../lib/firebase';
import {
  DEFAULT_POLICY,
  type AttendanceDay,
  type ClassRoom,
  type Invite,
  type LedgerEntry,
  type Member,
  type Notice,
  type Offering,
  type PublishedResult,
  type Role,
  type School,
  type SchoolPolicy,
  type StudentProfile,
  type SubjectRecord,
  type Term,
  type TermRecord,
  type UserSchools,
} from './types';

export const uid = () => crypto.randomUUID().replace(/-/g, '').slice(0, 20);
const now = () => Date.now();

// ---------- Paths ----------
export const paths = {
  school: (s: string) => doc(getDb(), 'schools', s),
  members: (s: string) => collection(getDb(), 'schools', s, 'members'),
  member: (s: string, u: string) => doc(getDb(), 'schools', s, 'members', u),
  invites: (s: string) => collection(getDb(), 'schools', s, 'invites'),
  invite: (s: string, c: string) => doc(getDb(), 'schools', s, 'invites', c),
  terms: (s: string) => collection(getDb(), 'schools', s, 'terms'),
  term: (s: string, t: string) => doc(getDb(), 'schools', s, 'terms', t),
  classes: (s: string) => collection(getDb(), 'schools', s, 'classes'),
  class: (s: string, c: string) => doc(getDb(), 'schools', s, 'classes', c),
  students: (s: string) => collection(getDb(), 'schools', s, 'students'),
  student: (s: string, st: string) => doc(getDb(), 'schools', s, 'students', st),
  records: (s: string) => collection(getDb(), 'schools', s, 'records'),
  record: (s: string, t: string, st: string) => doc(getDb(), 'schools', s, 'records', `${t}_${st}`),
  ledger: (s: string) => collection(getDb(), 'schools', s, 'ledger'),
  attendance: (s: string) => collection(getDb(), 'schools', s, 'attendance'),
  attendanceDay: (s: string, groupId: string, date: string) => doc(getDb(), 'schools', s, 'attendance', `${groupId}_${date}`),
  offerings: (s: string) => collection(getDb(), 'schools', s, 'offerings'),
  offering: (s: string, o: string) => doc(getDb(), 'schools', s, 'offerings', o),
  subjectRecords: (s: string) => collection(getDb(), 'schools', s, 'subjectRecords'),
  subjectRecord: (s: string, t: string, o: string, st: string) => doc(getDb(), 'schools', s, 'subjectRecords', `${t}_${o}_${st}`),
  notices: (s: string) => collection(getDb(), 'schools', s, 'notices'),
  notice: (s: string, n: string) => doc(getDb(), 'schools', s, 'notices', n),
  result: (pin: string) => doc(getDb(), 'results', pin),
  user: (u: string) => doc(getDb(), 'users', u),
};

// ---------- Users ----------
export async function getUserSchools(u: string): Promise<UserSchools> {
  const snap = await getDoc(paths.user(u));
  return (snap.data() as UserSchools | undefined) ?? { schools: {} };
}
async function rememberSchool(u: string, schoolId: string, name: string, role: Role) {
  await setDoc(paths.user(u), { schools: { [schoolId]: { name, role } } }, { merge: true });
}
export async function forgetSchool(u: string, schoolId: string) {
  await updateDoc(paths.user(u), { [`schools.${schoolId}`]: deleteField() });
}

// ---------- Schools ----------
export interface NewSchool {
  name: string;
  country: string;
  termName: string;
  levels: string[];
  subjects: string[];
  /** Arms to create, e.g. JSS 1A. Each gets every subject as an offering. */
  classes: { name: string; level: string; arm?: string; subject: string }[];
  arms?: string[];
  session?: string;
  policy?: Partial<SchoolPolicy>;
  demo?: boolean;
  demoVersion?: number;
}

export async function createSchool(user: { uid: string; name: string; email: string }, s: NewSchool) {
  return (await createSchoolFull(user, s)).schoolId;
}

/** Creates a school and returns what it wrote, so callers don't need to read it back. */
export async function createSchoolFull(user: { uid: string; name: string; email: string }, s: NewSchool) {
  const schoolId = uid();
  const termId = uid();
  const colours = ['chalk', 'cobalt', 'vermilion', 'moss', 'lilac', 'teal'] as const;
  // 1) The school (rules allow create only when ownerId is the caller).
  const school: School = {
    id: schoolId,
    name: s.name,
    country: s.country,
    ownerId: user.uid,
    currentTermId: termId,
    levels: s.levels,
    arms: s.arms ?? ['A', 'B'],
    subjects: s.subjects,
    colour: 'chalk',
    createdAt: now(),
    policy: { ...DEFAULT_POLICY, ...(s.policy ?? {}) },
    ...(s.demo ? { demo: true } : {}),
    ...(s.demoVersion ? { demoVersion: s.demoVersion } : {}),
  };
  await setDoc(paths.school(schoolId), school);
  // 2) The owner's membership (rules allow it because the caller owns the school).
  const member: Member = { uid: user.uid, name: user.name, email: user.email, role: 'owner', classIds: [], joinedAt: now() };
  await setDoc(paths.member(schoolId, user.uid), member);
  // 3) Everything else, now that the caller is a member: the term, arms and their subject offerings,
  //    in batches under Firestore's 500-write limit, all sent at once.
  const term: Term = { id: termId, name: s.termName, order: 1, session: s.session ?? defaultSession() };
  const classes: ClassRoom[] = [];
  const offerings: Offering[] = [];
  const commits: Promise<void>[] = [];
  let batch = writeBatch(getDb());
  batch.set(paths.term(schoolId, termId), term);
  let n = 1;
  const flush = () => {
    if (n) commits.push(batch.commit());
    batch = writeBatch(getDb());
    n = 0;
  };
  for (const [i, c] of s.classes.entries()) {
    const id = uid();
    const cls: ClassRoom = { id, ...c, colour: colours[i % colours.length], createdAt: now() + i };
    classes.push(cls);
    batch.set(paths.class(schoolId, id), cls);
    n++;
    for (const subject of s.subjects) {
      const oid = uid();
      const o: Offering = { id: oid, classId: id, subject, teacherIds: [], studentIds: null, createdAt: now() };
      offerings.push(o);
      batch.set(paths.offering(schoolId, oid), o);
      if (++n >= 450) flush();
    }
  }
  flush();
  await Promise.all([...commits, rememberSchool(user.uid, schoolId, s.name, 'owner')]);
  return { schoolId, school, term, classes, offerings };
}

export async function updateSchool(schoolId: string, patch: Partial<Omit<School, 'id' | 'ownerId'>>) {
  await updateDoc(paths.school(schoolId), patch);
}

/** Deletes a school and its records. Only the owner can do this (enforced by rules). */
export async function deleteSchool(schoolId: string, ownerUid: string) {
  const db = getDb();
  const modules: ModuleName[] = ['feeItems', 'invoices', 'payments', 'messages', 'lessons', 'incidents', 'applications', 'timetable', 'leave', 'books', 'loans', 'routes', 'inventory', 'termSummaries'];
  for (const col of [paths.records, paths.subjectRecords, paths.attendance, paths.offerings, paths.notices, ...modules.map((m) => (s: string) => mod(s, m)), paths.students, paths.classes, paths.terms, paths.invites, paths.ledger]) {
    const snap = await getDocs(col(schoolId));
    for (let i = 0; i < snap.docs.length; i += 400) {
      const b = writeBatch(db);
      snap.docs.slice(i, i + 400).forEach((d) => b.delete(d.ref));
      await b.commit();
    }
  }
  const members = await getDocs(paths.members(schoolId));
  const others = members.docs.filter((m) => m.id !== ownerUid);
  if (others.length) {
    const b = writeBatch(db);
    others.forEach((m) => b.delete(m.ref));
    await b.commit();
  }
  await deleteDoc(paths.school(schoolId));
  await deleteDoc(paths.member(schoolId, ownerUid));
  await forgetSchool(ownerUid, schoolId);
}

// ---------- Terms ----------
export async function addTerm(schoolId: string, name: string, order: number) {
  const id = uid();
  await setDoc(paths.term(schoolId, id), { id, name, order } satisfies Term);
  return id;
}

// ---------- Classes ----------
export async function saveClass(schoolId: string, c: ClassRoom) {
  await setDoc(paths.class(schoolId, c.id), c);
}
export async function deleteClass(schoolId: string, classId: string) {
  await deleteDoc(paths.class(schoolId, classId));
}

// ---------- Members & invites ----------
export async function createInvite(
  schoolId: string,
  by: string,
  role: Invite['role'],
  classIds: string[],
  label: string,
  offerings: Offering[] = [],
) {
  const code = uid() + uid();
  const offeringIds = offerings.map((o) => o.id);
  const subjectClassIds = [...new Set(offerings.map((o) => o.classId))];
  await setDoc(paths.invite(schoolId, code), { code, role, classIds, offeringIds, subjectClassIds, label, createdBy: by, createdAt: now() } satisfies Invite);
  return code;
}
export async function revokeInvite(schoolId: string, code: string) {
  await deleteDoc(paths.invite(schoolId, code));
}
export async function readInvite(schoolId: string, code: string) {
  const snap = await getDoc(paths.invite(schoolId, code));
  return snap.exists() ? (snap.data() as Invite) : null;
}
export async function acceptInvite(user: { uid: string; name: string; email: string }, schoolId: string, invite: Invite) {
  const member: Member = {
    uid: user.uid,
    name: user.name,
    email: user.email,
    role: invite.role,
    classIds: invite.classIds,
    offeringIds: invite.offeringIds ?? [],
    subjectClassIds: invite.subjectClassIds ?? [],
    inviteCode: invite.code,
    joinedAt: now(),
  };
  await setDoc(paths.member(schoolId, user.uid), member);
  // Show this teacher on the subjects they were invited to teach (rules allow a teacher to add only themselves).
  for (const oid of invite.offeringIds ?? []) await updateDoc(paths.offering(schoolId, oid), { teacherIds: arrayUnion(user.uid) }).catch(() => {});
  const school = (await getDoc(paths.school(schoolId))).data() as School;
  await rememberSchool(user.uid, schoolId, school.name, invite.role);
}
export async function updateMember(schoolId: string, u: string, patch: Partial<Pick<Member, 'role' | 'classIds' | 'name'>>) {
  await updateDoc(paths.member(schoolId, u), patch);
}
export async function assignClass(schoolId: string, u: string, classId: string, on: boolean) {
  await updateDoc(paths.member(schoolId, u), { classIds: on ? arrayUnion(classId) : arrayRemove(classId) });
}
export async function removeMember(schoolId: string, u: string) {
  await deleteDoc(paths.member(schoolId, u));
}

// ---------- Students ----------
export function blankStudent(classId: string, name: string, order: number): StudentProfile {
  return {
    id: uid(),
    classId,
    name,
    preferredName: '',
    pronoun: 'they',
    dob: '',
    admissionNo: '',
    guardians: [],
    order,
    createdAt: now(),
  };
}
export async function saveStudent(schoolId: string, s: StudentProfile) {
  await setDoc(paths.student(schoolId, s.id), s);
}
export async function addStudents(schoolId: string, classId: string, names: string[], startOrder: number) {
  const b = writeBatch(getDb());
  const out: StudentProfile[] = [];
  names.forEach((n, i) => {
    const s = blankStudent(classId, n, startOrder + i + 1);
    b.set(paths.student(schoolId, s.id), s);
    out.push(s);
  });
  await b.commit();
  return out;
}
export async function deleteStudent(schoolId: string, student: StudentProfile) {
  const recs = await getDocs(query(paths.records(schoolId), where('studentId', '==', student.id), where('classId', '==', student.classId)));
  const b = writeBatch(getDb());
  recs.docs.forEach((r) => b.delete(r.ref));
  b.delete(paths.student(schoolId, student.id));
  await b.commit();
}

// ---------- Term records ----------
export async function saveRecord(schoolId: string, by: string, r: Partial<TermRecord> & Pick<TermRecord, 'termId' | 'studentId' | 'classId'>) {
  // Merge, so fields owned by other screens (scores, approval) survive. A key passed as undefined is cleared.
  const patch = Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v === undefined ? deleteField() : v]));
  await setDoc(paths.record(schoolId, r.termId, r.studentId), { ...patch, updatedAt: now(), updatedBy: by }, { merge: true });
}


// ---------- Attendance ----------
export async function saveAttendance(schoolId: string, day: Omit<AttendanceDay, 'id' | 'updatedAt'>) {
  const group = day.offeringId ?? day.classId;
  const id = `${group}_${day.date}`;
  await setDoc(paths.attendanceDay(schoolId, group, day.date), { ...day, id, updatedAt: now() } satisfies AttendanceDay);
}
export const todayISO = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

// ---------- Policy ----------
export const policyOf = (s: School): SchoolPolicy => ({ ...DEFAULT_POLICY, ...(s.policy ?? {}) });
export function defaultSession() {
  const d = new Date();
  const y = d.getMonth() >= 7 ? d.getFullYear() : d.getFullYear() - 1; // Nigerian sessions start in September
  return `${y}/${y + 1}`;
}

// ---------- Offerings (a subject in an arm) ----------
export async function saveOffering(schoolId: string, o: Offering) {
  await setDoc(paths.offering(schoolId, o.id), o);
}
export async function deleteOffering(schoolId: string, o: Offering, members: Member[]) {
  for (const m of members.filter((x) => x.offeringIds?.includes(o.id))) await setTeaching(schoolId, m, o, false, []);
  await deleteDoc(paths.offering(schoolId, o.id));
}
/** Assign or unassign a teacher to a subject offering, keeping both sides in step (rules read the member side). */
export async function setTeaching(schoolId: string, m: Member, o: Offering, on: boolean, allOfferings: Offering[]) {
  const offeringIds = on ? [...new Set([...(m.offeringIds ?? []), o.id])] : (m.offeringIds ?? []).filter((x) => x !== o.id);
  const subjectClassIds = [...new Set(allOfferings.filter((x) => offeringIds.includes(x.id)).map((x) => x.classId).concat(on ? [o.classId] : []))];
  const b = writeBatch(getDb());
  b.update(paths.member(schoolId, m.uid), { offeringIds, subjectClassIds });
  b.update(paths.offering(schoolId, o.id), { teacherIds: on ? arrayUnion(m.uid) : arrayRemove(m.uid) });
  await b.commit();
}

/** Add an arm (e.g. JSS 1C) with every school subject as an offering. */
export async function addArm(schoolId: string, level: string, arm: string, subjects: string[], colour: ClassRoom['colour']) {
  const id = uid();
  const b = writeBatch(getDb());
  b.set(paths.class(schoolId, id), { id, name: `${level}${arm.length <= 2 ? '' : ' '}${arm}`, level, arm, subject: '', colour, createdAt: now() } satisfies ClassRoom);
  for (const subject of subjects) {
    const oid = uid();
    b.set(paths.offering(schoolId, oid), { id: oid, classId: id, subject, teacherIds: [], studentIds: null, createdAt: now() } satisfies Offering);
  }
  await b.commit();
  return id;
}
/** Add a subject to the school and to every arm that doesn't have it yet. */
export async function addSubjectEverywhere(schoolId: string, subject: string, classes: ClassRoom[], offerings: Offering[]) {
  const b = writeBatch(getDb());
  for (const c of classes) {
    if (offerings.some((o) => o.classId === c.id && o.subject === subject)) continue;
    const oid = uid();
    b.set(paths.offering(schoolId, oid), { id: oid, classId: c.id, subject, teacherIds: [], studentIds: null, createdAt: now() } satisfies Offering);
  }
  await b.commit();
}
/** Add one subject to one arm (for electives or a class that was set up before subjects existed). */
export async function addOffering(schoolId: string, classId: string, subject: string) {
  const oid = uid();
  await setDoc(paths.offering(schoolId, oid), { id: oid, classId, subject, teacherIds: [], studentIds: null, createdAt: now() } satisfies Offering);
}

// ---------- Subject records ----------
export async function saveSubjectRecord(schoolId: string, by: string, r: Partial<SubjectRecord> & Pick<SubjectRecord, 'termId' | 'offeringId' | 'classId' | 'studentId' | 'subject'>) {
  const patch = Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v === undefined ? deleteField() : v]));
  await setDoc(paths.subjectRecord(schoolId, r.termId, r.offeringId, r.studentId), { ...patch, updatedAt: now(), updatedBy: by }, { merge: true });
}

// ---------- Notices ----------
export async function addNotice(schoolId: string, n: Omit<Notice, 'id' | 'at'>) {
  const id = uid();
  await setDoc(paths.notice(schoolId, id), { ...n, id, at: now() } satisfies Notice);
}
export async function deleteNotice(schoolId: string, id: string) {
  await deleteDoc(paths.notice(schoolId, id));
}

// ---------- Result PINs and publishing ----------
const PIN_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function newPin() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const s = [...bytes].map((b) => PIN_ALPHABET[b % PIN_ALPHABET.length]).join('');
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}`;
}
export async function publishResult(r: PublishedResult) {
  // Firestore rejects undefined values anywhere in a document; a JSON round trip drops them.
  await setDoc(paths.result(r.pin), JSON.parse(JSON.stringify(r)) as PublishedResult);
}
export async function readResult(pin: string) {
  const snap = await getDoc(paths.result(pin.trim().toUpperCase()));
  return snap.exists() ? (snap.data() as PublishedResult) : null;
}

// ---------- Generic module collections (fees, lessons, library…) ----------
export type ModuleName =
  | 'feeItems'
  | 'invoices'
  | 'payments'
  | 'messages'
  | 'lessons'
  | 'incidents'
  | 'applications'
  | 'timetable'
  | 'leave'
  | 'books'
  | 'loans'
  | 'routes'
  | 'inventory'
  | 'termSummaries';
export const mod = (s: string, name: ModuleName) => collection(getDb(), 'schools', s, name);
export const modDoc = (s: string, name: ModuleName, id: string) => doc(getDb(), 'schools', s, name, id);
/** Create or replace a document in a module collection. Gives it an id if it has none. */
export async function saveIn<T extends { id?: string }>(s: string, name: ModuleName, obj: T): Promise<T & { id: string }> {
  const withId = { ...obj, id: obj.id || uid() } as T & { id: string };
  await setDoc(modDoc(s, name, withId.id), JSON.parse(JSON.stringify(withId)));
  return withId;
}
export async function patchIn(s: string, name: ModuleName, id: string, patch: Record<string, unknown>) {
  await updateDoc(modDoc(s, name, id), JSON.parse(JSON.stringify(patch)));
}
export async function removeIn(s: string, name: ModuleName, id: string) {
  await deleteDoc(modDoc(s, name, id));
}

// ---------- Ledger ----------
export async function addLedger(schoolId: string, e: Omit<LedgerEntry, 'id' | 'at'>) {
  const entry: LedgerEntry = { ...e, id: uid(), at: now() };
  await setDoc(doc(paths.ledger(schoolId), entry.id), entry);
  return entry;
}
export const ledgerQuery = (schoolId: string) => query(paths.ledger(schoolId), orderBy('at', 'desc'), limit(200));
