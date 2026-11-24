import type { SchoolPolicy, SubjectRecord, Term } from '../data/types';
import type { Assessment } from './results';

export interface Cumulative {
  termNames: string[];
  subjects: { subject: string; totals: (number | null)[]; average: number }[];
  average: number;
  /** Meets the school's promotion rule. */
  passes: boolean;
  reasons: string[];
}

/** Terms of the same session up to and including this one, in order. */
export function sessionTermsUpTo(terms: Term[], term: Term | null) {
  if (!term) return [];
  return terms.filter((t) => (t.session ?? '') === (term.session ?? '') && t.order <= term.order).sort((a, b) => a.order - b.order);
}

/** True when a cumulative (annual) result belongs on the card: third term, or the third term of a session. */
export const showsCumulative = (sessionTerms: Term[], term: Term | null) => !!term && sessionTerms.length >= 2 && (/third/i.test(term.name) || sessionTerms.length >= 3);

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * The annual result the way Nigerian schools present it: each subject's percentage per term, the average
 * of the terms taken, and the overall average. Then the school's promotion rule: a pass mark on the
 * overall average and a credit in the named subjects.
 */
export function cumulativeFor(studentId: string, sessionTerms: Term[], records: SubjectRecord[], assessments: Assessment[], policy: SchoolPolicy): Cumulative | null {
  const max = assessments.reduce((n, a) => n + a.max, 0) || 100;
  const mine = records.filter((r) => r.studentId === studentId);
  if (!mine.length) return null;
  const subjects = [...new Set(mine.map((r) => r.subject))].sort();
  const rows = subjects.map((subject) => {
    const totals = sessionTerms.map((t) => {
      const r = mine.find((x) => x.termId === t.id && x.subject === subject);
      const vals = assessments.map((a) => r?.scores?.[a.key]).filter((v): v is number => typeof v === 'number');
      return vals.length ? round1((vals.reduce((a, b) => a + b, 0) / max) * 100) : null;
    });
    const got = totals.filter((v): v is number => v !== null);
    return { subject, totals, average: got.length ? round1(got.reduce((a, b) => a + b, 0) / got.length) : 0 };
  }).filter((r) => r.totals.some((v) => v !== null));
  if (!rows.length) return null;
  const average = round1(rows.reduce((n, r) => n + r.average, 0) / rows.length);
  const reasons: string[] = [];
  if (average < policy.passMark) reasons.push(`average ${average}% is under ${policy.passMark}%`);
  for (const c of policy.creditSubjects) {
    const r = rows.find((x) => x.subject.toLowerCase() === c.toLowerCase());
    if (r && r.average < policy.creditMark) reasons.push(`${r.subject} ${r.average}% is under ${policy.creditMark}%`);
  }
  return { termNames: sessionTerms.map((t) => t.name), subjects: rows, average, passes: !reasons.length, reasons };
}
