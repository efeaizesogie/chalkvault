import type { AttendanceDay, ClassRoom, Invoice, Offering, StudentProfile, SubjectRecord, Term, TermRecord, TermSummary } from '../data/types';
import type { Assessment, GradeBand } from './results';
import { rosterOf } from './reportCards';

export interface TermInputs {
  term: Term;
  students: StudentProfile[];
  classes: ClassRoom[];
  levels: string[];
  offerings: Offering[];
  attendance: AttendanceDay[];
  subjectRecords: SubjectRecord[];
  records: TermRecord[];
  invoices: Invoice[];
  assessments: Assessment[];
  bands: GradeBand[];
}

export interface StudentRisk {
  studentId: string;
  name: string;
  classId: string;
  average: number | null;
  attendance: number | null;
  failing: string[];
  reasons: string[];
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** Monday of the week a date falls in, as YYYY-MM-DD. */
export function weekOf(date: string) {
  const d = new Date(`${date}T12:00:00`);
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  return d.toISOString().slice(0, 10);
}

/** Every figure the dashboard needs for one term, computed in the browser from that term's records. */
export function computeTermStats(x: TermInputs) {
  const active = x.students.filter((s) => (s.status ?? 'active') === 'active');
  const maxTotal = x.assessments.reduce((n, a) => n + a.max, 0) || 100;
  const pctOf = (r: SubjectRecord) => {
    const vals = x.assessments.map((a) => r.scores?.[a.key]).filter((v): v is number => typeof v === 'number');
    return vals.length ? (vals.reduce((a, b) => a + b, 0) / maxTotal) * 100 : null;
  };
  const gradeOf = (pct: number) => (x.bands.find((b) => pct >= b.min) ?? x.bands[x.bands.length - 1])?.grade ?? '';

  // Enrolment by level, in the school's level order.
  const byLevel: Record<string, number> = {};
  for (const lvl of x.levels) byLevel[lvl] = 0;
  for (const s of active) {
    const lvl = x.classes.find((c) => c.id === s.classId)?.level ?? 'Other';
    byLevel[lvl] = (byLevel[lvl] ?? 0) + 1;
  }
  for (const k of Object.keys(byLevel)) if (!byLevel[k]) delete byLevel[k];

  // Attendance: form registers when there are any, otherwise lesson registers.
  const formDays = x.attendance.filter((d) => !d.offeringId);
  const days = formDays.length ? formDays : x.attendance;
  const perStudent = new Map<string, { p: number; n: number }>();
  const perArm = new Map<string, { p: number; n: number }>();
  const perWeek = new Map<string, { p: number; n: number }>();
  let p = 0;
  let n = 0;
  for (const d of days) {
    for (const [sid, m] of Object.entries(d.marks)) {
      const ok = m !== 'A' ? 1 : 0;
      p += ok;
      n++;
      for (const [map, key] of [
        [perStudent, sid],
        [perArm, d.classId],
        [perWeek, weekOf(d.date)],
      ] as const) {
        const cur = map.get(key) ?? { p: 0, n: 0 };
        cur.p += ok;
        cur.n++;
        map.set(key, cur);
      }
    }
  }
  const pctMap = (m: Map<string, { p: number; n: number }>) => Object.fromEntries([...m].map(([k, v]) => [k, round1((v.p / v.n) * 100)]));
  const attendanceByArm = pctMap(perArm);
  const studentAttendance = pctMap(perStudent);
  const weeklyAttendance = [...perWeek]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([week, v]) => ({ week, pct: round1((v.p / v.n) * 100) }));

  // Scores.
  const activeIds = new Set(active.map((s) => s.id));
  const scored = x.subjectRecords.filter((r) => activeIds.has(r.studentId)).map((r) => ({ r, pct: pctOf(r) })).filter((v): v is { r: SubjectRecord; pct: number } => v.pct !== null);
  const group = (key: (r: SubjectRecord) => string) => {
    const g = new Map<string, number[]>();
    for (const { r, pct } of scored) g.set(key(r), [...(g.get(key(r)) ?? []), pct]);
    return Object.fromEntries([...g].map(([k, v]) => [k, round1(mean(v)!)]));
  };
  const subjectAverages = group((r) => r.subject);
  const armAverages = group((r) => r.classId);
  const studentAverages = group((r) => r.studentId);
  const grades: Record<string, number> = {};
  for (const b of x.bands) grades[b.grade] = 0;
  for (const { pct } of scored) grades[gradeOf(pct)] = (grades[gradeOf(pct)] ?? 0) + 1;
  const average = mean(scored.map((v) => v.pct));

  let scoresExpected = 0;
  for (const o of x.offerings) scoresExpected += rosterOf(o, active.filter((s) => s.classId === o.classId)).length;

  // Students who need attention: average under 50%, two or more subjects under 40%, or attendance under 80%.
  const risks: StudentRisk[] = [];
  for (const s of active) {
    const mine = scored.filter((v) => v.r.studentId === s.id);
    const failing = mine.filter((v) => v.pct < 40).map((v) => v.r.subject);
    const avg = studentAverages[s.id] ?? null;
    const att = studentAttendance[s.id] ?? null;
    const reasons: string[] = [];
    if (avg !== null && avg < 50) reasons.push(`average ${avg}%`);
    if (failing.length >= 2) reasons.push(`below 40% in ${failing.join(', ')}`);
    if (att !== null && att < 80) reasons.push(`attendance ${att}%`);
    if (reasons.length) risks.push({ studentId: s.id, name: s.name, classId: s.classId, average: avg, attendance: att, failing, reasons });
  }
  risks.sort((a, b) => b.reasons.length - a.reasons.length || (a.average ?? 100) - (b.average ?? 100));

  const feesExpected = x.invoices.reduce((s, i) => s + i.total, 0);
  const feesCollected = x.invoices.reduce((s, i) => s + i.paid, 0);

  const summary: TermSummary = {
    id: x.term.id,
    termName: x.term.name,
    session: x.term.session ?? '',
    students: active.length,
    byLevel,
    attendancePct: n ? round1((p / n) * 100) : null,
    attendanceByArm,
    weeklyAttendance,
    average: average === null ? null : round1(average),
    subjectAverages,
    armAverages,
    grades,
    atRisk: risks.length,
    scoresEntered: scored.length,
    scoresExpected,
    commentsWritten: x.records.filter((r) => r.final || r.draft).length,
    commentsApproved: x.records.filter((r) => r.status === 'approved').length,
    feesExpected,
    feesCollected,
    computedAt: Date.now(),
  };
  return { summary, risks, studentAverages, studentAttendance };
}

/** A short plain-text digest of one term for the AI brief. Arm ids are turned into names. */
export function summaryText(s: TermSummary, armName: (id: string) => string, label: string) {
  const list = (r: Record<string, number>, suffix = '%') =>
    Object.entries(r)
      .map(([k, v]) => `${k} ${v}${suffix}`)
      .join(', ');
  const arms = (r: Record<string, number>) =>
    Object.entries(r)
      .map(([k, v]) => `${armName(k)} ${v}%`)
      .join(', ');
  return [
    `${label}: ${s.termName}${s.session ? `, ${s.session}` : ''}.`,
    `Students: ${s.students} (${list(s.byLevel, '')}).`,
    `Attendance: ${s.attendancePct ?? 'no registers'}${s.attendancePct !== null ? '%' : ''}. By arm: ${arms(s.attendanceByArm) || 'none'}.`,
    s.weeklyAttendance.length ? `Weekly attendance: ${s.weeklyAttendance.map((w) => `week of ${w.week} ${w.pct}%`).join(', ')}.` : '',
    `Average score: ${s.average ?? 'no scores'}${s.average !== null ? '%' : ''}. Subjects: ${list(s.subjectAverages) || 'none'}. Arms: ${arms(s.armAverages) || 'none'}.`,
    `Grades given: ${list(s.grades, '')}.`,
    `Scores entered: ${s.scoresEntered} of ${s.scoresExpected}. Form comments written: ${s.commentsWritten}, approved ${s.commentsApproved}.`,
    s.feesExpected ? `Fees: expected ${Math.round(s.feesExpected)}, collected ${Math.round(s.feesCollected)} naira (${Math.round((s.feesCollected / s.feesExpected) * 100)}%).` : 'Fees: no invoices yet.',
    `Students needing attention: ${s.atRisk}.`,
  ]
    .filter(Boolean)
    .join('\n');
}
