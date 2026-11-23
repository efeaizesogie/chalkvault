import type { School } from '../data/types';

export interface Assessment {
  key: string;
  label: string;
  max: number;
}
export interface GradeBand {
  grade: string;
  min: number; // percentage, inclusive
  remark: string;
}

// West African Senior School Certificate style bands, used by most Nigerian and Ghanaian schools.
const WAEC_BANDS: GradeBand[] = [
  { grade: 'A1', min: 75, remark: 'Excellent' },
  { grade: 'B2', min: 70, remark: 'Very good' },
  { grade: 'B3', min: 65, remark: 'Good' },
  { grade: 'C4', min: 60, remark: 'Credit' },
  { grade: 'C5', min: 55, remark: 'Credit' },
  { grade: 'C6', min: 50, remark: 'Credit' },
  { grade: 'D7', min: 45, remark: 'Pass' },
  { grade: 'E8', min: 40, remark: 'Pass' },
  { grade: 'F9', min: 0, remark: 'Fail' },
];
const LETTER_BANDS: GradeBand[] = [
  { grade: 'A', min: 90, remark: 'Excellent' },
  { grade: 'B', min: 80, remark: 'Good' },
  { grade: 'C', min: 70, remark: 'Satisfactory' },
  { grade: 'D', min: 60, remark: 'Needs improvement' },
  { grade: 'F', min: 0, remark: 'Not yet meeting standard' },
];

export function defaultAssessments(country: string): Assessment[] {
  if (['Nigeria', 'Ghana'].includes(country))
    return [
      { key: 'ca1', label: 'CA 1', max: 20 },
      { key: 'ca2', label: 'CA 2', max: 20 },
      { key: 'exam', label: 'Exam', max: 60 },
    ];
  return [
    { key: 'coursework', label: 'Coursework', max: 40 },
    { key: 'exam', label: 'Exam', max: 60 },
  ];
}
export function defaultBands(country: string): GradeBand[] {
  return ['Nigeria', 'Ghana'].includes(country) ? WAEC_BANDS : LETTER_BANDS;
}
export const assessmentsOf = (s: School) => s.assessments?.length ? s.assessments : defaultAssessments(s.country);
export const bandsOf = (s: School) => (s.gradeBands?.length ? s.gradeBands : defaultBands(s.country)).slice().sort((a, b) => b.min - a.min);

export interface ResultRow {
  studentId: string;
  total: number;
  pct: number;
  complete: boolean;
  grade: string;
  remark: string;
  position: number;
}

export function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/** Totals, grades and positions for a class. Students with no scores at all get no position. */
export function computeResults(ids: string[], scores: Record<string, Record<string, number> | undefined>, assessments: Assessment[], bands: GradeBand[]) {
  const maxTotal = assessments.reduce((n, a) => n + a.max, 0) || 100;
  const rows: ResultRow[] = ids.map((id) => {
    const sc = scores[id] ?? {};
    const entered = assessments.filter((a) => typeof sc[a.key] === 'number');
    const total = entered.reduce((n, a) => n + (sc[a.key] ?? 0), 0);
    const pct = Math.round((total / maxTotal) * 1000) / 10;
    const band = bands.find((b) => pct >= b.min) ?? bands[bands.length - 1];
    return { studentId: id, total, pct, complete: entered.length === assessments.length, grade: entered.length ? band.grade : '', remark: entered.length ? band.remark : '', position: 0 };
  });
  const ranked = rows.filter((r) => r.grade).sort((a, b) => b.total - a.total);
  ranked.forEach((r, i) => {
    r.position = i > 0 && ranked[i - 1].total === r.total ? ranked[i - 1].position : i + 1;
  });
  const totals = ranked.map((r) => r.total);
  return {
    rows: new Map(rows.map((r) => [r.studentId, r])),
    maxTotal,
    ranked: ranked.length,
    average: totals.length ? Math.round((totals.reduce((a, b) => a + b, 0) / totals.length) * 10) / 10 : 0,
    highest: totals.length ? Math.max(...totals) : 0,
    lowest: totals.length ? Math.min(...totals) : 0,
  };
}

export function parseAssessments(text: string): Assessment[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l, i) => {
      const [label, max] = l.split(/\s*,\s*/);
      return { key: label.toLowerCase().replace(/[^a-z0-9]+/g, '') || `c${i}`, label, max: Math.max(1, Number(max) || 0) };
    });
}
export function parseBands(text: string): GradeBand[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [grade, min, ...rest] = l.split(/\s*,\s*/);
      return { grade, min: Number(min) || 0, remark: rest.join(', ') };
    });
}
