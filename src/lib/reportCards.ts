import type { AttendanceDay, Offering, ReportCard, SchoolPolicy, StudentProfile, SubjectRecord, Term, TermRecord } from '../data/types';
import { computeResults, ordinal, type Assessment, type GradeBand } from './results';

export interface ArmInputs {
  className: string;
  term: Term;
  students: StudentProfile[];
  offerings: Offering[];
  subjectRecords: SubjectRecord[];
  formRecords: TermRecord[];
  attendance: AttendanceDay[];
  assessments: Assessment[];
  bands: GradeBand[];
  policy: SchoolPolicy;
}

/** Students taking an offering: its roster, or everyone in the arm. */
export const rosterOf = (o: Offering, students: StudentProfile[]) => (o.studentIds ? students.filter((s) => o.studentIds!.includes(s.id)) : students);

/** Compile every student's report card for one arm and term, with subject and class positions. */
export function compileArm(x: ArmInputs): Map<string, ReportCard> {
  const bySubject = new Map<string, ReturnType<typeof computeResults>>();
  for (const o of x.offerings) {
    const roster = rosterOf(o, x.students);
    const scores = Object.fromEntries(x.subjectRecords.filter((r) => r.offeringId === o.id).map((r) => [r.studentId, r.scores]));
    bySubject.set(o.id, computeResults(roster.map((s) => s.id), scores, x.assessments, x.bands));
  }

  // Average across subjects with at least one score, then class position by average.
  const averages = new Map<string, number>();
  for (const s of x.students) {
    const pcts: number[] = [];
    for (const o of x.offerings) {
      const r = bySubject.get(o.id)?.rows.get(s.id);
      if (r?.grade) pcts.push(r.pct);
    }
    if (pcts.length) averages.set(s.id, Math.round((pcts.reduce((a, b) => a + b, 0) / pcts.length) * 10) / 10);
  }
  const ranked = [...averages.entries()].sort((a, b) => b[1] - a[1]);
  const classPos = new Map<string, number>();
  ranked.forEach(([id, avg], i) => classPos.set(id, i > 0 && ranked[i - 1][1] === avg ? classPos.get(ranked[i - 1][0])! : i + 1));

  const cards = new Map<string, ReportCard>();
  for (const s of x.students) {
    const subjects: ReportCard['subjects'] = [];
    for (const o of x.offerings) {
      const res = bySubject.get(o.id)!;
      const r = res.rows.get(s.id);
      if (!r) continue; // not taking this subject
      const rec = x.subjectRecords.find((sr) => sr.offeringId === o.id && sr.studentId === s.id);
      subjects.push({
        subject: o.subject,
        scores: rec?.scores ?? {},
        total: r.total,
        grade: r.grade,
        remark: r.remark,
        position: x.policy.showPositions && r.position ? `${ordinal(r.position)} of ${res.ranked}` : undefined,
        teacherRemark: x.policy.subjectRemarks ? rec?.remark : undefined,
      });
    }
    let days = 0;
    let present = 0;
    for (const d of x.attendance) {
      const m = d.marks[s.id];
      if (!m) continue;
      days++;
      if (m !== 'A') present++;
    }
    const form = x.formRecords.find((r) => r.studentId === s.id);
    cards.set(s.id, {
      termId: x.term.id,
      termName: x.term.name,
      session: x.term.session ?? '',
      className: x.className,
      assessments: x.assessments,
      subjects: subjects.sort((a, b) => a.subject.localeCompare(b.subject)),
      average: averages.get(s.id) ?? 0,
      position: x.policy.showPositions && classPos.get(s.id) ? `${ordinal(classPos.get(s.id)!)} of ${ranked.length}` : undefined,
      classSize: x.students.length,
      attendance: days ? { present, days } : undefined,
      formComment: form?.final ?? form?.draft?.comment,
      principalComment: form?.principalComment,
      nextTermBegins: x.term.nextTermBegins,
      gradeKey: x.bands,
    });
  }
  return cards;
}

/** Facts for the AI to ground a form teacher's comment. No names. */
export function factsFromCard(c: ReportCard | undefined) {
  if (!c) return '';
  const out: string[] = [];
  if (c.subjects.some((s) => s.grade)) {
    out.push(`Term average ${c.average}%${c.position ? `, ${c.position} in the class` : ''}.`);
    out.push(
      'Subjects: ' +
        c.subjects
          .filter((s) => s.grade)
          .map((s) => `${s.subject} ${s.total} (${s.grade})`)
          .join('; ') +
        '.',
    );
  }
  if (c.attendance) out.push(`Attendance: present on ${c.attendance.present} of ${c.attendance.days} school days.`);
  return out.join(' ');
}
