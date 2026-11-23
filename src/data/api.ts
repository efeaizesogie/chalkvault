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
import type {
  ClassRoom,
  Invite,
  LedgerEntry,
  Member,
  Role,
  School,
  StudentProfile,
  Term,
  TermRecord,
  UserSchools,
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
  classes: { name: string; level: string; subject: string }[];
  demo?: boolean;
}

export async function createSchool(user: { uid: string; name: string; email: string }, s: NewSchool) {
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
    subjects: s.subjects,
    colour: 'chalk',
    createdAt: now(),
    ...(s.demo ? { demo: true } : {}),
  };
  await setDoc(paths.school(schoolId), school);
  // 2) The owner's membership (rules allow it because the caller owns the school).
  const member: Member = { uid: user.uid, name: user.name, email: user.email, role: 'owner', classIds: [], joinedAt: now() };
  await setDoc(paths.member(schoolId, user.uid), member);
  // 3) Everything else, now that the caller is a member.
  const b = writeBatch(getDb());
  b.set(paths.term(schoolId, termId), { id: termId, name: s.termName, order: 1 } satisfies Term);
  s.classes.forEach((c, i) => {
    const id = uid();
    b.set(paths.class(schoolId, id), { id, ...c, colour: colours[i % colours.length], createdAt: now() + i } satisfies ClassRoom);
  });
  await b.commit();
  await rememberSchool(user.uid, schoolId, s.name, 'owner');
  return schoolId;
}

export async function updateSchool(schoolId: string, patch: Partial<Omit<School, 'id' | 'ownerId'>>) {
  await updateDoc(paths.school(schoolId), patch);
}

/** Deletes a school and its records. Only the owner can do this (enforced by rules). */
export async function deleteSchool(schoolId: string, ownerUid: string) {
  const db = getDb();
  for (const col of [paths.records, paths.students, paths.classes, paths.terms, paths.invites, paths.ledger]) {
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
export async function createInvite(schoolId: string, by: string, role: Invite['role'], classIds: string[], label: string) {
  const code = uid() + uid();
  await setDoc(paths.invite(schoolId, code), { code, role, classIds, label, createdBy: by, createdAt: now() } satisfies Invite);
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
    inviteCode: invite.code,
    joinedAt: now(),
  };
  await setDoc(paths.member(schoolId, user.uid), member);
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
export async function saveRecord(schoolId: string, by: string, r: Omit<TermRecord, 'updatedAt' | 'updatedBy'>) {
  // Firestore rejects undefined values, so drop them.
  const clean = Object.fromEntries(Object.entries(r).filter(([, v]) => v !== undefined));
  await setDoc(paths.record(schoolId, r.termId, r.studentId), { ...clean, updatedAt: now(), updatedBy: by });
}


// ---------- Ledger ----------
export async function addLedger(schoolId: string, e: Omit<LedgerEntry, 'id' | 'at'>) {
  const entry: LedgerEntry = { ...e, id: uid(), at: now() };
  await setDoc(doc(paths.ledger(schoolId), entry.id), entry);
  return entry;
}
export const ledgerQuery = (schoolId: string) => query(paths.ledger(schoolId), orderBy('at', 'desc'), limit(200));
