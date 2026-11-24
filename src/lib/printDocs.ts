// Documents laid out for paper. Each builder takes plain figures and returns HTML for printDoc():
// tables, short labels and small marks instead of screenshots of the app's cards.

import type { TermSummary, TimetableSettings, TimetableSlot } from '../data/types';

const esc = (v: unknown) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const pc = (v: number | null | undefined) => (v === null || v === undefined ? '' : `${Math.round(v * 10) / 10}%`);
const naira = (n: number) => `₦${Math.round(n).toLocaleString('en-NG')}`;
const bar = (v: number | null | undefined) => (v === null || v === undefined ? '' : `<span class="bar"><i style="width:${Math.max(0, Math.min(100, v))}%"></i></span>`);
/** "Up 2.3" / "Down 1.1", coloured by whether higher is better. */
function delta(now: number | null | undefined, before: number | null | undefined, unit = ' pts', better: 'up' | 'down' = 'up') {
  if (now === null || now === undefined || before === null || before === undefined) return '';
  const d = Math.round((now - before) * 10) / 10;
  if (!d) return '<i>No change</i>';
  const good = better === 'up' ? d > 0 : d < 0;
  return `<i class="${good ? 'up' : 'down'}">${d > 0 ? 'Up' : 'Down'} ${Math.abs(d)}${unit}</i>`;
}

/** A small two-line chart of weekly attendance, as SVG. */
function spark(now: (number | null)[], before: (number | null)[]) {
  const n = Math.max(now.length, before.length);
  if (!n) return '';
  const all = [...now, ...before].filter((v): v is number => v !== null);
  const lo = Math.max(0, Math.floor((Math.min(...all) - 5) / 10) * 10);
  const W = 600;
  const H = 90;
  const pad = { l: 30, r: 22, t: 6, b: 16 };
  const x = (i: number) => pad.l + (n === 1 ? (W - pad.l - pad.r) / 2 : (i / (n - 1)) * (W - pad.l - pad.r));
  const y = (v: number) => pad.t + (1 - (v - lo) / (100 - lo)) * (H - pad.t - pad.b);
  const line = (vals: (number | null)[]) =>
    vals
      .map((v, i) => (v === null ? null : `${x(i).toFixed(1)},${y(v).toFixed(1)}`))
      .filter(Boolean)
      .join(' ');
  const grid = [lo, 100].map((t) => `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(t)}" y2="${y(t)}"/><text x="${pad.l - 4}" y="${y(t) + 3}" text-anchor="end">${t}%</text>`).join('');
  const labels = Array.from({ length: n }, (_, i) => `<text x="${x(i)}" y="${H - 3}" text-anchor="middle">Wk ${i + 1}</text>`).join('');
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${grid}${labels}<polyline class="before" points="${line(before)}"/><polyline class="now" points="${line(now)}"/></svg>`;
}

export interface OverviewDocInput {
  termLabel: string;
  beforeLabel: string | null;
  s: TermSummary;
  before: TermSummary | null;
  todayPct: number | null;
  arms: { id: string; name: string; students: number; scores: number | null; comments: number | null; fees: number | null; owing: number }[];
  subjects: string[];
  risks: { name: string; arm: string; reasons: string[] }[];
  waiting: number;
  unstaffed: number;
  noForm: number;
  brief?: string;
}

/** The term at a glance, for a governor's pack or a staff meeting: figures, then each arm, each subject, who needs help. */
export function overviewDoc(x: OverviewDocInput) {
  const { s, before } = x;
  const fee = s.feesExpected ? (s.feesCollected / s.feesExpected) * 100 : null;
  const feeBefore = before?.feesExpected ? (before.feesCollected / before.feesExpected) * 100 : null;
  const weeks = Math.max(s.weeklyAttendance.length, before?.weeklyAttendance.length ?? 0);
  const brief = x.brief
    ? `<section class="brief"><h2>This morning’s brief</h2>${x.brief
        .split('\n')
        .filter((l) => l.trim())
        .map((l) => `<p>${esc(l.replace(/^\s*[*-]\s*/, '• ').replace(/\*\*/g, ''))}</p>`)
        .join('')}</section>`
    : '';
  return `
  <h1>The term at a glance</h1>
  <p class="doc-sub">${esc(x.termLabel)}${x.beforeLabel ? `, compared with ${esc(x.beforeLabel)}` : ''}. ${s.students} students in ${x.arms.length} arms.</p>
  <div class="doc-kpis">
    <div><span>Attendance this term</span><b>${pc(s.attendancePct) || 'None yet'}</b>${delta(s.attendancePct, before?.attendancePct)}</div>
    <div><span>Average score</span><b>${pc(s.average) || 'None yet'}</b>${delta(s.average, before?.average)}</div>
    <div><span>Scores entered</span><b>${s.scoresExpected ? Math.round((s.scoresEntered / s.scoresExpected) * 100) : 0}%</b><i>${s.scoresEntered} of ${s.scoresExpected}</i></div>
    <div><span>Fees collected</span><b>${pc(fee) || 'No invoices'}</b>${s.feesExpected ? `<i>${naira(s.feesCollected)} of ${naira(s.feesExpected)}</i>` : ''}</div>
    <div><span>Need attention</span><b>${s.atRisk}</b>${delta(s.atRisk, before?.atRisk, '', 'down')}</div>
  </div>
  ${brief}
  <section>
    <h2>Attendance week by week</h2>
    ${spark(s.weeklyAttendance.slice(0, weeks).map((w) => w.pct), before?.weeklyAttendance.slice(0, weeks).map((w) => w.pct) ?? [])}
    <div class="key"><span><i style="background:var(--series-now)"></i>${esc(x.termLabel)}</span>${x.beforeLabel ? `<span><i style="background:var(--series-before)"></i>${esc(x.beforeLabel)}</span>` : ''}${x.todayPct !== null ? `<span>Today: ${pc(x.todayPct)} present</span>` : ''}</div>
  </section>
  <section>
    <h2>Each arm</h2>
    <table class="arms">
      <thead><tr><th>Arm</th><th class="num">Students</th><th>Attendance</th><th class="num">Change</th><th>Average</th><th class="num">Change</th><th class="num">Scores in</th><th class="num">Comments</th><th class="num">Fees paid</th><th class="num">Owing</th></tr></thead>
      <tbody>${x.arms
        .map(
          (a) => `<tr><td>${esc(a.name)}</td><td class="num">${a.students}</td>
          <td>${bar(s.attendanceByArm[a.id])}${pc(s.attendanceByArm[a.id])}</td><td class="num">${delta(s.attendanceByArm[a.id], before?.attendanceByArm[a.id], '')}</td>
          <td>${bar(s.armAverages[a.id])}${pc(s.armAverages[a.id])}</td><td class="num">${delta(s.armAverages[a.id], before?.armAverages[a.id], '')}</td>
          <td class="num">${pc(a.scores)}</td><td class="num">${pc(a.comments)}</td><td class="num">${pc(a.fees)}</td><td class="num">${a.owing || ''}</td></tr>`,
        )
        .join('')}</tbody>
    </table>
    <p class="note">${x.unstaffed || x.noForm ? `${x.unstaffed} subjects have no teacher and ${x.noForm} arms have no form teacher.` : 'Every subject and every arm has a teacher.'} ${x.waiting ? `${x.waiting} form comments are waiting for approval.` : ''}</p>
  </section>
  <div class="cols">
    <section>
      <h2>Subjects, weakest first</h2>
      <table>
        <thead><tr><th>Subject</th><th>This term</th>${before ? '<th class="num">Last term</th>' : ''}</tr></thead>
        <tbody>${x.subjects.map((sub) => `<tr><td>${esc(sub)}</td><td>${bar(s.subjectAverages[sub])}${pc(s.subjectAverages[sub])}</td>${before ? `<td class="num">${pc(before.subjectAverages[sub])}</td>` : ''}</tr>`).join('')}</tbody>
      </table>
    </section>
    <section>
      <h2>Grades given</h2>
      <table>
        <thead><tr><th>Grade</th><th class="num">This term</th>${before ? '<th class="num">Last term</th>' : ''}</tr></thead>
        <tbody>${Object.keys(s.grades).map((g) => `<tr><td>${esc(g)}</td><td class="num">${s.grades[g]}</td>${before ? `<td class="num">${before.grades[g] ?? 0}</td>` : ''}</tr>`).join('')}</tbody>
      </table>
    </section>
  </div>
  <section>
    <h2>Students who need attention (${x.risks.length})</h2>
    ${
      x.risks.length
        ? `<table><thead><tr><th>Student</th><th>Arm</th><th>Why</th></tr></thead><tbody>${x.risks.map((r) => `<tr><td>${esc(r.name)}</td><td>${esc(r.arm)}</td><td>${esc(r.reasons.join('; '))}</td></tr>`).join('')}</tbody></table>`
        : '<p class="note">No student is below the attention thresholds.</p>'
    }
    <p class="note">A student is listed when their average is under 50%, they score under 40% in two subjects, or their attendance is under 80%.</p>
  </section>
  <section>
    <h2>Fees by arm</h2>
    <table><thead><tr><th>Arm</th><th>Collected</th><th class="num">Children owing</th></tr></thead>
    <tbody>${x.arms.filter((a) => a.fees !== null).map((a) => `<tr><td>${esc(a.name)}</td><td>${bar(a.fees)}${pc(a.fees)}</td><td class="num">${a.owing}</td></tr>`).join('') || '<tr><td colspan="3">No invoices this term.</td></tr>'}</tbody></table>
    ${feeBefore !== null && fee !== null ? `<p class="note">Last term closed with ${pc(feeBefore)} collected.</p>` : ''}
  </section>`;
}

export interface TimetablePage {
  title: string;
  subtitle?: string;
  /** Lessons placed for this arm or teacher: day, period and what to show. */
  cells: { day: number; period: number; main: string; sub?: string }[];
}

/** One landscape page per arm or teacher: days across, periods down, breaks as thin rows. */
export function timetableDoc(settings: TimetableSettings, pages: TimetablePage[]) {
  return pages
    .map((pg) => {
      const rows = settings.periods
        .map((p, pi) => {
          if (p.isBreak) return `<tr class="brk"><th>${esc(p.start)}</th><td colspan="${settings.days.length}">${esc(p.label)}</td></tr>`;
          const cells = settings.days
            .map((_, di) => {
              const c = pg.cells.find((x) => x.day === di && x.period === pi);
              return c ? `<td><b>${esc(c.main)}</b>${c.sub ? `<small>${esc(c.sub)}</small>` : ''}</td>` : '<td class="free">Free</td>';
            })
            .join('');
          return `<tr><th class="time">${esc(p.label)}<small>${esc(p.start)} to ${esc(p.end)}</small></th>${cells}</tr>`;
        })
        .join('');
      return `<div class="tt-page"><h1>${esc(pg.title)}</h1>${pg.subtitle ? `<p class="doc-sub">${esc(pg.subtitle)}</p>` : ''}
      <table class="tt"><thead><tr><th class="time">Period</th>${settings.days.map((d) => `<th>${esc(d)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`;
    })
    .join('');
}

export type { TimetableSlot };

/**
 * A list as a document: the same rows a CSV export gives, set as tables. Blank rows split sections; each
 * section's first row is its header. A long list with an Arm or Class column is grouped by it, one heading per
 * arm with a count and subtotals, and grand totals at the end. Numbers are right-aligned.
 */
export function tableDoc(
  title: string,
  rows: (string | number | null | undefined)[][],
  opts: { subtitle?: string; intro?: string; groupBy?: string | false; sum?: string[] } = {},
) {
  type Row = (string | number | null | undefined)[];
  const sections: Row[][] = [[]];
  for (const r of rows) {
    if (!r.length || r.every((c) => c === '' || c === null || c === undefined)) {
      if (sections[sections.length - 1].length) sections.push([]);
    } else sections[sections.length - 1].push(r);
  }
  const isNum = (v: unknown) => typeof v === 'number' || (/^[₦\d,.%\s-]+$/.test(String(v ?? '')) && /\d/.test(String(v ?? '')));
  const fmt = (v: unknown) => (typeof v === 'number' ? v.toLocaleString('en-NG') : esc(v));
  const table = (head: Row, body: Row[], totals?: Row, cls = '') => {
    const sample = body.length ? body : totals ? [totals.map((v, i) => (i === 0 ? 0 : v))] : [];
    const num = head.map((_, i) => sample.length > 0 && sample.every((r) => r[i] === '' || r[i] === null || r[i] === undefined || isNum(r[i])));
    const tr = (r: Row, cls = '') => `<tr${cls ? ` class="${cls}"` : ''}>${head.map((_, i) => `<td${num[i] ? ' class="num"' : ''}>${fmt(r[i])}</td>`).join('')}</tr>`;
    return `<table${cls ? ` class="${cls}"` : ''}><thead><tr>${head.map((h, i) => `<th${num[i] ? ' class="num"' : ''}>${esc(h)}</th>`).join('')}</tr></thead><tbody>${body.map((r) => tr(r)).join('')}${totals ? tr(totals, 'subtotal') : ''}</tbody></table>`;
  };
  const sumRow = (head: Row, body: Row[], label: string) => {
    if (!opts.sum?.length) return undefined;
    const out: Row = head.map(() => '');
    out[0] = label;
    head.forEach((h, i) => {
      if (opts.sum!.includes(String(h))) out[i] = body.reduce<number>((n, r) => n + (typeof r[i] === 'number' ? (r[i] as number) : 0), 0);
    });
    return out;
  };

  const body = sections
    .filter((sec) => sec.length)
    .map((sec) => {
      const [head, ...rest] = sec;
      if (!rest.length) return `<p class="doc-sub">${head.map(esc).join(' ')}</p>`;
      const gName = opts.groupBy === false ? null : opts.groupBy ?? head.find((h) => h === 'Arm' || h === 'Class');
      const gi = gName ? head.indexOf(gName) : -1;
      if (gi < 0 || rest.length < 12) return `<section>${table(head, rest, sumRow(head, rest, 'Total'))}</section>`;
      // Grouped: drop the group column from each table; its name is the heading.
      const keep = head.map((_, i) => i).filter((i) => i !== gi);
      const pick = (r: Row) => keep.map((i) => r[i]);
      const groups = new Map<string, Row[]>();
      for (const r of rest) groups.set(String(r[gi] ?? ''), [...(groups.get(String(r[gi] ?? '')) ?? []), r]);
      const h2 = pick(head);
      const parts = [...groups].map(([g, list]) => {
        const sub = sumRow(h2, list.map(pick), `${g} total`);
        return `<section><h2>${esc(g || 'No arm')}</h2><p class="group-sum">${list.length} ${list.length === 1 ? 'entry' : 'entries'}</p>${table(h2, list.map(pick), sub, 'grp')}</section>`;
      });
      const grand = sumRow(h2, rest.map(pick), 'All arms');
      return parts.join('') + (grand ? `<section class="keep"><h2>All arms</h2>${table(h2, [], grand, 'grp')}</section>` : '');
    })
    .join('');
  return `<h1>${esc(title)}</h1>${opts.subtitle ? `<p class="doc-sub">${esc(opts.subtitle)}</p>` : ''}${opts.intro ?? ''}${body}`;
}
