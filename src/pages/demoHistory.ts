import { writeBatch } from 'firebase/firestore';
import { modDoc, paths } from '../data/api';
import type { AttendanceDay, ClassRoom, Mark, Offering, StudentProfile, SubjectRecord, Term, TermSummary } from '../data/types';
import { getDb } from '../lib/firebase';
import { assessmentsOf, bandsOf } from '../lib/results';
import { computeTermStats, weekOf } from '../lib/termStats';
import type { School } from '../data/types';

/** Small deterministic random numbers, so every demo school looks the same. */
function rng(seed: number) {
  let x = seed >>> 0;
  return () => ((x = (x * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

/** School days (Monday to Friday) from `weeks` weeks ago up to yesterday. */
function schoolDays(weeks: number) {
  const out: string[] = [];
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - 1);
  while (out.length < weeks * 5) {
    if (d.getDay() !== 0 && d.getDay() !== 6) out.unshift(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() - 1);
  }
  return out;
}

/**
 * Gives the demo school a history: six weeks of form registers this term, and a closed third term
 * from last session with its saved figures, so the dashboard can compare term against term.
 */
export async function seedDemoHistory(opts: { schoolId: string; school: School; term: Term; uid: string; classes: ClassRoom[]; offerings: Offering[]; students: StudentProfile[]; subjectRecords: SubjectRecord[] }) {
  const { schoolId, school, term, uid, classes, offerings, students, subjectRecords } = opts;
  const rand = rng(20261124);
  const days = schoolDays(6);
  // A few children are absent more often, so the at-risk list has someone in it.
  const weak = new Set(students.filter((_, i) => i % 14 === 5).map((s) => s.id));
  const attendance: AttendanceDay[] = [];
  const b = writeBatch(getDb());
  for (const c of classes) {
    const roster = students.filter((s) => s.classId === c.id);
    if (!roster.length) continue;
    for (const date of days) {
      // A rainy week in week 4 drops attendance across the school.
      const wk = Math.floor(days.indexOf(date) / 5);
      const marks: Record<string, Mark> = {};
      for (const s of roster) {
        const pAbsent = (weak.has(s.id) ? 0.3 : 0.04) + (wk === 3 ? 0.08 : 0);
        const r = rand();
        marks[s.id] = r < pAbsent ? 'A' : r < pAbsent + 0.05 ? 'L' : 'P';
      }
      const day: AttendanceDay = { id: `${c.id}_${date}`, classId: c.id, termId: term.id, date, marks, takenBy: uid, updatedAt: Date.now() };
      attendance.push(day);
      b.set(paths.attendanceDay(schoolId, c.id, date), day);
    }
  }

  // Last session's third term: figures a little lower than now, as if the school has improved since.
  const now = computeTermStats({
    term,
    students,
    classes,
    levels: school.levels,
    offerings,
    attendance,
    subjectRecords,
    records: [],
    invoices: [],
    assessments: assessmentsOf(school),
    bands: bandsOf(school),
  }).summary;
  const prevId = `${term.id}-prev`;
  const [y1, y2] = (term.session ?? '2026/2027').split('/').map(Number);
  const prevSession = y1 && y2 ? `${y1 - 1}/${y2 - 1}` : '';
  const nudge = (v: number, lo: number, hi: number) => Math.round(Math.max(0, Math.min(100, v - lo - rand() * (hi - lo))) * 10) / 10;
  const mapVals = (r: Record<string, number>, lo: number, hi: number) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, nudge(v, lo, hi)]));
  const prev: TermSummary = {
    ...now,
    id: prevId,
    termName: 'Third term',
    session: prevSession,
    students: Math.max(0, now.students - 3),
    byLevel: Object.fromEntries(Object.entries(now.byLevel).map(([k, v], i) => [k, Math.max(0, v - (i % 2 ? 2 : 1))])),
    attendancePct: now.attendancePct === null ? null : nudge(now.attendancePct, 1, 4),
    attendanceByArm: mapVals(now.attendanceByArm, -1, 5),
    weeklyAttendance: now.weeklyAttendance.map((w, i) => ({ week: w.week, pct: nudge(w.pct + (i === 3 ? 6 : 0), 0, 5) })),
    average: now.average === null ? null : nudge(now.average, 2, 6),
    subjectAverages: mapVals(now.subjectAverages, -3, 8),
    armAverages: mapVals(now.armAverages, -2, 7),
    grades: Object.fromEntries(Object.entries(now.grades).map(([g, n], i, all) => [g, Math.max(0, n + (i < all.length / 2 ? -1 : 1))])),
    atRisk: now.atRisk + 2,
    scoresEntered: now.scoresExpected,
    commentsWritten: now.students,
    commentsApproved: now.students,
    // Last term closed with most fees in: about the same roll, 88% collected.
    feesExpected: Math.round((now.students * 98000) / 500) * 500,
    feesCollected: Math.round((now.students * 98000 * 0.88) / 500) * 500,
    computedAt: Date.now(),
  };
  // Only weeks are needed for the chart; give the earlier term its own dates.
  prev.weeklyAttendance = prev.weeklyAttendance.map((w) => ({ ...w, week: weekOf(new Date(new Date(`${w.week}T12:00:00`).getTime() - 120 * 864e5).toISOString().slice(0, 10)) }));
  b.set(paths.term(schoolId, prevId), { id: prevId, name: 'Third term', order: 0, session: prevSession, status: 'closed', closedAt: Date.now() - 90 * 864e5 } satisfies Term);
  b.set(modDoc(schoolId, 'termSummaries', prevId), prev);
  b.update(paths.term(schoolId, term.id), { status: 'open', starts: days[0] });
  await b.commit();
}
