import type { ClassRoom, StudentProfile } from '../data/types';
import type { ImportedStaff, ImportedStudent, PageReading } from './ai';
import type { Table } from './sheetImport';

/** One source the admin dropped in: a photo, or one sheet of a spreadsheet. */
export interface ImportPage {
  id: string;
  file: string;
  thumb?: string;
  status: 'waiting' | 'reading' | 'done' | 'error';
  error?: string;
  reading?: PageReading;
  source?: 'on_device' | 'in_cloud' | 'file';
  ms?: number;
}

export interface ArmPlan {
  key: string;
  label: string;
  classId: string | null;
  level: string;
  arm: string;
}
export interface StudentPlan extends ImportedStudent {
  key: string;
  include: boolean;
  armKey: string;
  /** Existing student this row matches (admission number first, then name). */
  matchId: string | null;
  matchBy: 'admission' | 'name' | null;
  pages: string[];
}
export interface ScorePlan {
  key: string;
  include: boolean;
  armKey: string;
  subject: string;
  rows: { studentKey: string; scores: Record<string, number> }[];
  pages: string[];
}
export interface StaffPlan extends ImportedStaff {
  key: string;
  include: boolean;
}
export interface Plan {
  arms: ArmPlan[];
  students: StudentPlan[];
  scores: ScorePlan[];
  staff: StaffPlan[];
}

export const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const nameKey = (s: string) => s.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(Boolean).sort().join(' ');

/** Match "JSS 1 A", "jss1a" or "J.S.S 1A" to an arm, or work out the level and arm letter for a new one. */
export function matchArm(label: string, classes: ClassRoom[], levels: string[]): Omit<ArmPlan, 'key' | 'label'> {
  const n = norm(label);
  const hit = classes.find((c) => norm(c.name) === n || norm(`${c.level}${c.arm ?? ''}`) === n);
  if (hit) return { classId: hit.id, level: hit.level, arm: hit.arm ?? '' };
  const level = [...levels].sort((a, b) => b.length - a.length).find((l) => n.startsWith(norm(l)));
  if (level) return { classId: null, level, arm: label.slice(label.length - (n.length - norm(level).length)).trim().toUpperCase() || 'A' };
  return { classId: null, level: '', arm: '' };
}

/** Turn a spreadsheet into readings, one per class column value, by guessing columns from the headers. */
export function tableToReadings(t: Table): PageReading[] {
  const find = (re: RegExp) => t.headers.findIndex((h) => re.test(h.toLowerCase()));
  const col = {
    name: find(/name|student|pupil/),
    admissionNo: find(/adm|reg|matric|number|no\.?$/),
    className: find(/class|arm|form/),
    gender: find(/sex|gender/),
    dob: find(/birth|dob/),
    guardianName: find(/parent|guardian|father|mother/),
    guardianPhone: find(/phone|tel|mobile|gsm/),
    balance: find(/balance|owing|arrear|outstanding|debt/),
  };
  if (col.name < 0) return [];
  const groups = new Map<string, ImportedStudent[]>();
  for (const r of t.rows) {
    const get = (i: number) => (i >= 0 ? (r[i] ?? '').trim() : '');
    const name = get(col.name);
    if (!name) continue;
    const bal = Number(get(col.balance).replace(/[^0-9.-]/g, ''));
    const g = get(col.gender).toLowerCase();
    const s: ImportedStudent = {
      name,
      ...(get(col.admissionNo) ? { admissionNo: get(col.admissionNo) } : {}),
      ...(g ? { gender: g.startsWith('f') ? 'female' : g.startsWith('m') ? 'male' : '' } : {}),
      ...(get(col.dob) ? { dob: get(col.dob) } : {}),
      ...(get(col.guardianName) ? { guardianName: get(col.guardianName) } : {}),
      ...(get(col.guardianPhone) ? { guardianPhone: get(col.guardianPhone) } : {}),
      ...(col.balance >= 0 && Number.isFinite(bal) ? { balance: bal } : {}),
    };
    const cls = get(col.className);
    groups.set(cls, [...(groups.get(cls) ?? []), s]);
  }
  return [...groups].map(([className, students]) => ({ kind: col.balance >= 0 ? 'fee_ledger' : 'class_list', className, students, staff: [] }));
}

/** Merge every page into one plan: arms, students (deduplicated), score sets and staff. */
export function buildPlan(pages: ImportPage[], classes: ClassRoom[], levels: string[], existing: StudentProfile[]): Plan {
  const arms = new Map<string, ArmPlan>();
  const students = new Map<string, StudentPlan>();
  const scores = new Map<string, ScorePlan>();
  const staff = new Map<string, StaffPlan>();
  const byAdm = new Map(existing.filter((s) => s.admissionNo).map((s) => [norm(s.admissionNo), s]));
  const byName = new Map(existing.map((s) => [nameKey(s.name), s]));

  for (const p of pages) {
    const r = p.reading;
    if (!r || r.kind === 'other') continue;
    for (const st of r.staff) {
      const k = nameKey(st.name);
      if (!staff.has(k)) staff.set(k, { ...st, key: k, include: true });
    }
    if (!r.students.length) continue;
    const armKey = norm(r.className ?? '') || 'unknown';
    if (!arms.has(armKey)) arms.set(armKey, { key: armKey, label: r.className || 'No class written', ...(armKey === 'unknown' ? { classId: null, level: '', arm: '' } : matchArm(r.className!, classes, levels)) });
    const score = r.kind === 'score_sheet' ? (() => {
      const k = `${armKey}|${norm(r.subject ?? '')}`;
      if (!scores.has(k)) scores.set(k, { key: k, include: true, armKey, subject: r.subject ?? '', rows: [], pages: [] });
      const sp = scores.get(k)!;
      sp.pages.push(p.id);
      return sp;
    })() : null;

    for (const s of r.students) {
      // The same child on two pages: match by admission number, then by name, within the import.
      const adm = s.admissionNo ? norm(s.admissionNo) : '';
      let key = [...students.values()].find((x) => (adm && x.admissionNo && norm(x.admissionNo) === adm) || nameKey(x.name) === nameKey(s.name))?.key;
      if (!key) {
        key = `s${students.size + 1}`;
        const hit = (adm && byAdm.get(adm)) || byName.get(nameKey(s.name));
        students.set(key, {
          ...s,
          scores: undefined,
          key,
          include: true,
          armKey,
          matchId: hit ? hit.id : null,
          matchBy: hit ? (adm && byAdm.get(adm) ? 'admission' : 'name') : null,
          pages: [],
          unsure: [...(s.unsure ?? [])],
        });
      }
      const cur = students.get(key)!;
      for (const f of ['admissionNo', 'gender', 'dob', 'guardianName', 'guardianPhone', 'balance'] as const) if (cur[f] === undefined || cur[f] === '') (cur as unknown as Record<string, unknown>)[f] = s[f];
      if (cur.armKey === 'unknown' && armKey !== 'unknown') cur.armKey = armKey;
      if (!cur.pages.includes(p.id)) cur.pages.push(p.id);
      for (const u of s.unsure ?? []) if (!cur.unsure!.includes(u)) cur.unsure!.push(u);
      if (score && s.scores && Object.keys(s.scores).length) score.rows.push({ studentKey: key, scores: s.scores });
    }
  }
  return { arms: [...arms.values()], students: [...students.values()], scores: [...scores.values()].filter((s) => s.rows.length), staff: [...staff.values()] };
}
