import { useMemo, useRef, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { query, where } from 'firebase/firestore';
import { mod, paths, todayISO } from '../data/api';
import { useQuery } from '../data/hooks';
import { SUPPORT_LABEL, type AttendanceDay, type StudentProfile, type TermSummary } from '../data/types';
import { askSchool, PrivacyBlock } from '../lib/ai';
import { friendlyError } from '../lib/errors';
import { naira } from '../lib/fees';
import { rosterOf } from '../lib/reportCards';
import { summaryText, weekOf, type StudentRisk } from '../lib/termStats';
import { BarRows, ChartCard, Columns, Figure, LineChart, type Series } from '../components/Charts';
import { SourceStamp } from '../components/SourceStamp';
import { Prose } from '../components/Prose';
import { useSchool } from './SchoolContext';
import { useSavedSummary, useTermStats } from './useTermStats';
import { NoticeList, useNotices } from './NoticesPage';
import type { WorkspaceCtx } from './Workspace';
import '../modules/ask.css';

const BRIEF_Q =
  'Write this morning’s brief for the head of school: 3 to 5 short points. Say what changed since last term, what needs attention today (attendance gaps, missing scores, unpaid fees, students at risk) and one thing worth praising. Use the figures exactly.';

/** The principal's and owner's dashboard: this term against the last, with an AI brief written from the same figures. */
export function PrincipalDashboard({ greeting }: { greeting: (line: string) => JSX.Element }) {
  const { schoolId, school, classes, offerings, members, terms, term, policy, viewingPast } = useSchool();
  const ws = useOutletContext<WorkspaceCtx>();
  const students = useQuery<StudentProfile>(paths.students(schoolId), `dash-st:${schoolId}`);
  const today = useQuery<AttendanceDay>(query(paths.attendance(schoolId), where('date', '==', todayISO())), `dash-att:${todayISO()}`);
  const summaries = useQuery<TermSummary>(mod(schoolId, 'termSummaries'), `dash-sums:${schoolId}`);
  const notices = useNotices();

  // A closed term shows the figures saved when it closed; any other term is worked out live.
  const savedNow = useSavedSummary(term?.status === 'closed' ? term.id : undefined);
  const fromSaved = term?.status === 'closed' && (savedNow.loading || !!savedNow.data);
  const now = useTermStats(fromSaved ? null : term, students.data);
  const prevTerm = term ? [...terms].sort((a, b) => a.order - b.order).filter((t) => t.order < term.order).pop() ?? null : null;
  const savedPrev = useSavedSummary(prevTerm?.id);
  const livePrev = useTermStats(savedPrev.loading || savedPrev.data ? null : prevTerm, students.data);
  const before: TermSummary | null = savedPrev.data ?? livePrev.stats?.summary ?? null;
  const s = (fromSaved ? savedNow.data : now.stats?.summary) ?? null;
  const risks = now.stats?.risks ?? [];

  const armName = (id: string) => classes.find((c) => c.id === id)?.name ?? 'An arm';
  const active = students.data.filter((x) => (x.status ?? 'active') === 'active');
  const names = new Map(active.map((x) => [x.id, x.name]));
  // Arms with students; empty arms would only add blank rows to the charts.
  const peopled = classes.filter((c) => active.some((x) => x.classId === c.id));
  const series: Series[] = prevTerm && before ? [{ name: term?.name ?? 'This term', tone: 'now' }, { name: `${prevTerm.name}${prevTerm.session && prevTerm.session !== term?.session ? `, ${prevTerm.session}` : ''}`, tone: 'before' }] : [{ name: term?.name ?? 'This term', tone: 'now' }];
  const two = series.length > 1;
  const pair = (a: number | null | undefined, b: number | null | undefined) => (two ? [a ?? null, b ?? null] : [a ?? null]);

  // Today.
  let present = 0;
  let marked = 0;
  for (const d of today.data) for (const m of Object.values(d.marks)) (marked++, m !== 'A' && present++);
  const todayPct = marked ? Math.round((present / marked) * 1000) / 10 : null;
  const registersToday = new Set(today.data.map((d) => d.classId));

  const waiting = now.records.filter((r) => r.status === 'submitted');
  const flagged = now.records.filter((r) => r.draft?.supportFlag && r.draft.supportFlag !== 'none');

  // Weeks lined up by their place in the term (week 1, week 2...), so two terms can share one axis.
  const weeks = Math.max(s?.weeklyAttendance.length ?? 0, two ? before?.weeklyAttendance.length ?? 0 : 0);
  const weekPoints = Array.from({ length: weeks }, (_, i) => ({ label: `Wk ${i + 1}`, values: pair(s?.weeklyAttendance[i]?.pct, before?.weeklyAttendance[i]?.pct) }));
  const subjects = [...new Set([...Object.keys(s?.subjectAverages ?? {}), ...(two ? Object.keys(before?.subjectAverages ?? {}) : [])])].sort((a, b) => (s?.subjectAverages[a] ?? 0) - (s?.subjectAverages[b] ?? 0));
  const grades = Object.keys(s?.grades ?? before?.grades ?? {});
  const levels = school.levels.filter((l) => s?.byLevel[l] || (two && before?.byLevel[l]));

  // Fees per arm.
  const feeByArm = classes
    .map((c) => {
      const inv = now.invoices.filter((i) => i.classId === c.id);
      const total = inv.reduce((n, i) => n + i.total, 0);
      const paid = inv.reduce((n, i) => n + i.paid, 0);
      return { c, total, paid, owing: inv.filter((i) => i.balance > 0).length };
    })
    .filter((x) => x.total > 0);

  // Staff completion per arm: scores and form comments.
  const byClass = (id: string) => active.filter((x) => x.classId === id);
  const completion = peopled.map((c) => {
    let exp = 0;
    for (const o of offerings.filter((o) => o.classId === c.id)) exp += rosterOf(o, byClass(c.id)).length;
    const got = now.subjectRecords.filter((r) => r.classId === c.id && Object.keys(r.scores ?? {}).length).length;
    const comm = now.records.filter((r) => r.classId === c.id && (r.final || r.draft)).length;
    return { c, scores: exp ? Math.round((got / exp) * 100) : null, comments: byClass(c.id).length ? Math.round((comm / byClass(c.id).length) * 100) : null };
  });
  const unstaffed = offerings.filter((o) => !o.teacherIds.length).length;
  const noForm = classes.filter((c) => !members.some((m) => m.classIds.includes(c.id))).length;

  // Term by term: every saved summary plus this term live.
  const history = useMemo(() => {
    const map = new Map(summaries.data.map((x) => [x.id, x]));
    if (s) map.set(s.id, s);
    return [...terms]
      .sort((a, b) => a.order - b.order)
      .map((t) => map.get(t.id))
      .filter((x): x is TermSummary => !!x);
  }, [summaries.data, s, terms]);

  // ---------- AI brief ----------
  const [brief, setBrief] = useState<{ q: string; a: string; source?: 'on_device' | 'in_cloud'; ms?: number; sent?: string; busy: boolean } | null>(null);
  const briefRef = useRef<HTMLElement>(null);
  const figures = () => {
    const lines = [`School: ${school.name}. Today: ${new Date().toDateString()}.`];
    if (s) lines.push(summaryText(s, armName, 'This term'));
    if (before && two) lines.push(summaryText(before, armName, 'Last term'));
    lines.push(`Today: ${todayPct === null ? 'no registers taken yet' : `${todayPct}% present`}, registers in ${registersToday.size} of ${classes.length} arms.`);
    lines.push(`Staffing: ${unstaffed} subjects without a teacher, ${noForm} arms without a form teacher. ${waiting.length} form comments waiting for approval.`);
    if (risks.length) lines.push(`Students needing attention: ${risks.slice(0, 25).map((r) => `${r.name} (${armName(r.classId)}): ${r.reasons.join('; ')}`).join('. ')}.`);
    // Week by week for each arm, so a dip can be traced to the arms behind it.
    const armWeeks = peopled
      .map((c) => {
        const wk = new Map<string, { p: number; n: number }>();
        for (const d of now.attendance.filter((x) => x.classId === c.id && !x.offeringId)) {
          const k = weekOf(d.date);
          const cur = wk.get(k) ?? { p: 0, n: 0 };
          for (const m of Object.values(d.marks)) (cur.n++, m !== 'A' && cur.p++);
          wk.set(k, cur);
        }
        return wk.size ? `${c.name}: ${[...wk].sort().map(([k, v]) => `week of ${k} ${Math.round((v.p / v.n) * 100)}%`).join(', ')}` : '';
      })
      .filter(Boolean);
    if (armWeeks.length) lines.push(`Weekly attendance by arm:\n${armWeeks.join('\n')}`);
    if (feeByArm.length) lines.push(`Fees by arm: ${feeByArm.map((f) => `${f.c.name} ${Math.round((f.paid / f.total) * 100)}% collected, ${f.owing} owing`).join('; ')}.`);
    return lines.join('\n\n');
  };
  const explain = async (q: string) => {
    if (brief?.busy) return;
    setBrief({ q, a: '', busy: true });
    setTimeout(() => briefRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30);
    try {
      const res = await askSchool({
        question: q,
        brief: figures(),
        names: active.map((x) => x.name),
        history: [],
        allowCloud: policy.cloudCommentFallback && ws.prefs.allowCloudFallback,
        onText: (a, source) => setBrief({ q, a, source, busy: true }),
      });
      setBrief({ q, a: res.answer, source: res.source, ms: res.ms, sent: res.sent, busy: false });
      await ws.log({
        task: 'Dashboard brief',
        source: res.source,
        charsSent: res.sent.length,
        detail: res.source === 'on_device' ? `Written by Gemini Nano on this device in ${(res.ms / 1000).toFixed(1)} s. Nothing was sent.` : `Student names were replaced with codes before sending.\n${res.sent}`,
      });
    } catch (e) {
      setBrief({ q, a: e instanceof PrivacyBlock ? e.message : `Couldn’t write the brief: ${friendlyError(e)}`, busy: false });
    } finally {
      ws.refreshDevice();
    }
  };
  const ExplainBtn = ({ q }: { q: string }) => (
    <button className="link small" onClick={() => explain(q)} disabled={!s || brief?.busy}>
      Explain this
    </button>
  );

  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : null);

  return (
    <div className="page dashboard">
      {greeting(`${school.name}: ${active.length} students in ${classes.length} arms, ${members.length} staff.`)}

      <section className="panel brief" ref={briefRef} aria-live="polite">
        <div className="panel-head">
          <h2 className="h3">{brief ? (brief.q === BRIEF_Q ? 'This morning’s brief' : brief.q) : 'This morning’s brief'}</h2>
          {brief?.source && <SourceStamp source={brief.source} ms={brief.ms} />}
        </div>
        {brief ? (
          <div className="brief-text">
            {brief.a ? <Prose text={brief.a} /> : <span className="muted">Reading this term’s figures…</span>}
            {brief.busy && <span className="caret" aria-hidden />}
          </div>
        ) : (
          <p className="muted">
            A short read of where the school stands, written from the figures on this page.{' '}
            {ws.device === 'available' ? 'Gemini Nano writes it on this computer, so nothing leaves the device.' : 'Without Gemini Nano it comes from the cloud, with every student name replaced by a code first.'}
          </p>
        )}
        <div className="brief-actions">
          <button className="ticket" onClick={() => explain(BRIEF_Q)} disabled={!s || now.loading || brief?.busy}>
            {brief?.busy ? 'Writing…' : brief ? 'Write it again' : 'Write this morning’s brief'}
          </button>
          {brief?.sent && (
            <details>
              <summary className="mono muted">Exactly what was sent</summary>
              <pre className="ask-sent">{brief.sent}</pre>
            </details>
          )}
        </div>
      </section>

      <section className="stat-grid" aria-label="This term at a glance">
        {!viewingPast && <Figure label="Attendance today" value={todayPct} note={`${registersToday.size} of ${classes.length} arms have a register.`} to={`/s/${schoolId}/classes`} />}
        <Figure label="Attendance this term" value={s?.attendancePct ?? null} before={two ? before?.attendancePct : undefined} to={`/s/${schoolId}/classes`} />
        <Figure label="Average score" value={s?.average ?? null} before={two ? before?.average : undefined} note={s ? `${s.scoresEntered} of ${s.scoresExpected} scores in.` : ''} to={`/s/${schoolId}/results`} />
        <Figure label="Fees collected" value={s && s.feesExpected ? pct(s.feesCollected, s.feesExpected) : null} before={two && before?.feesExpected ? pct(before.feesCollected, before.feesExpected) : undefined} note={s?.feesExpected ? `${naira(s.feesCollected)} of ${naira(s.feesExpected)}.` : 'No invoices yet.'} to={`/s/${schoolId}/fees`} />
        <Figure label="Need attention" value={s ? s.atRisk : null} unit="" before={two ? before?.atRisk : undefined} better="down" note="Low average, failing two subjects, or attendance under 80%." />
      </section>

      {!school.demo && <SetupChecklist students={active.length} hasInvoices={now.invoices.length > 0} />}

      <div className="dash-lead">
        <ChartCard
          title="Attendance week by week"
          note={two ? 'Each week of this term against the same week of last term.' : 'Share of students marked present or late each week.'}
          series={series}
          action={<ExplainBtn q="Explain the week by week attendance: which weeks dipped, which arms caused it, and what to check." />}
          table={{ head: ['Week', ...series.map((x) => x.name)], rows: weekPoints.map((p) => [p.label, ...p.values.map((v) => (v === null ? '' : `${v}%`))]) }}
        >
          <LineChart points={weekPoints} series={series} floor={50} height={Math.min(380, Math.max(220, peopled.length * 28))} />
        </ChartCard>

        <ChartCard
          title="Attendance by arm"
          series={series}
          table={{ head: ['Arm', ...series.map((x) => x.name)], rows: peopled.map((c) => [c.name, ...pair(s?.attendanceByArm[c.id], before?.attendanceByArm[c.id]).map((v) => (v === null ? '' : `${v}%`))]) }}
        >
          <BarRows max={100} series={series} rows={peopled.map((c) => ({ label: c.name, to: `/s/${schoolId}/classes/${c.id}?tab=register`, values: pair(s?.attendanceByArm[c.id], before?.attendanceByArm[c.id]) }))} />
        </ChartCard>
      </div>

      <div className="dash-flow">

        <ChartCard
          title="Subject averages"
          note="Weakest first. Average of every student’s total in that subject, across all arms."
          series={series}
          action={<ExplainBtn q="Explain the subject averages: which subjects are weakest, how they compare with last term, and in which arms." />}
          table={{ head: ['Subject', ...series.map((x) => x.name)], rows: subjects.map((x) => [x, ...pair(s?.subjectAverages[x], before?.subjectAverages[x]).map((v) => (v === null ? '' : `${v}%`))]) }}
        >
          <BarRows max={100} series={series} rows={subjects.map((x) => ({ label: x, values: pair(s?.subjectAverages[x], before?.subjectAverages[x]) }))} />
        </ChartCard>

        <ChartCard
          title="Arm averages"
          series={series}
          table={{ head: ['Arm', ...series.map((x) => x.name)], rows: peopled.map((c) => [c.name, ...pair(s?.armAverages[c.id], before?.armAverages[c.id]).map((v) => (v === null ? '' : `${v}%`))]) }}
        >
          <BarRows max={100} series={series} rows={peopled.map((c) => ({ label: c.name, to: `/s/${schoolId}/classes/${c.id}?tab=cards`, values: pair(s?.armAverages[c.id], before?.armAverages[c.id]) }))} />
        </ChartCard>

        <ChartCard
          title="Grade spread"
          note="Subject grades given so far, using the school’s grade bands."
          series={series}
          table={{ head: ['Grade', ...series.map((x) => x.name)], rows: grades.map((g) => [g, ...pair(s?.grades[g], before?.grades[g]).map((v) => v ?? '')]) }}
        >
          <Columns series={series} cats={grades.map((g) => ({ label: g, values: pair(s?.grades[g] ?? 0, before?.grades[g] ?? 0) }))} />
        </ChartCard>

        <ChartCard
          title="Students by level"
          series={series}
          table={{ head: ['Level', ...series.map((x) => x.name)], rows: levels.map((l) => [l, ...pair(s?.byLevel[l], before?.byLevel[l]).map((v) => v ?? '')]) }}
        >
          <BarRows unit="" series={series} rows={levels.map((l) => ({ label: l, values: pair(s?.byLevel[l] ?? 0, before?.byLevel[l] ?? 0) }))} />
        </ChartCard>

        <RiskPanel risks={risks} armName={armName} explain={explain} busy={!!brief?.busy} />

        <ChartCard
          title="Fees collected by arm"
          note={feeByArm.length ? `${feeByArm.reduce((n, f) => n + f.owing, 0)} children still owe.` : undefined}
          series={[series[0]]}
          action={feeByArm.length ? <ExplainBtn q="Explain fee collection: which arms are furthest behind and what to do this week." /> : undefined}
          table={{ head: ['Arm', 'Collected', 'Expected', 'Share', 'Owing'], rows: feeByArm.map((f) => [f.c.name, naira(f.paid), naira(f.total), `${Math.round((f.paid / f.total) * 100)}%`, f.owing]) }}
        >
          {feeByArm.length ? <BarRows max={100} series={[series[0]]} rows={feeByArm.map((f) => ({ label: f.c.name, to: `/s/${schoolId}/fees`, values: [pct(f.paid, f.total)] }))} /> : <p className="muted small">No invoices this term. Bursars raise them under Fees.</p>}
        </ChartCard>

        <ChartCard
          title="Staff progress"
          note={`Scores entered and form comments written, by arm. ${unstaffed} subjects have no teacher and ${noForm} arms have no form teacher.`}
          series={[
            { name: 'Scores entered', tone: 'now' },
            { name: 'Form comments', tone: 'before' },
          ]}
          table={{ head: ['Arm', 'Scores entered', 'Form comments'], rows: completion.map((x) => [x.c.name, x.scores === null ? '' : `${x.scores}%`, x.comments === null ? '' : `${x.comments}%`]) }}
        >
          <BarRows
            max={100}
            series={[
              { name: 'Scores entered', tone: 'now' },
              { name: 'Form comments', tone: 'before' },
            ]}
            rows={completion.map((x) => ({ label: x.c.name, to: `/s/${schoolId}/classes/${x.c.id}?tab=subjects`, values: [x.scores, x.comments] }))}
          />
        </ChartCard>

        {waiting.length > 0 && (
          <section className="panel queue">
            <h2 className="h3">
              {waiting.length} comment{waiting.length === 1 ? '' : 's'} waiting for your approval
            </h2>
            <ul className="queue-list">
              {[...new Set(waiting.map((r) => r.classId))].map((cid) => (
                <li key={cid}>
                  <Link to={`/s/${schoolId}/classes/${cid}`}>{armName(cid)}</Link>
                  <span>{waiting.filter((r) => r.classId === cid).length} waiting</span>
                </li>
              ))}
            </ul>
          </section>
        )}
        {flagged.length > 0 && (
          <section className="panel">
            <h2 className="h3">
              {flagged.length} student{flagged.length === 1 ? '' : 's'} flagged by form teachers
            </h2>
            <ul className="queue-list">
              {flagged.map((r) => (
                <li key={r.studentId}>
                  <Link to={`/s/${schoolId}/students/${r.studentId}`}>{names.get(r.studentId) ?? 'Student'}</Link>
                  <span className="muted">
                    {armName(r.classId)}, {SUPPORT_LABEL[r.draft!.supportFlag!].toLowerCase()}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
        <section className="panel">
          <div className="panel-head">
            <h2 className="h3">Notices</h2>
            <Link className="link" to={`/s/${schoolId}/notices`}>
              Post a notice
            </Link>
          </div>
          <NoticeList notices={notices.data} limit={3} />
        </section>
      </div>

      {history.length > 1 && (
        <ChartCard
          title="Term by term"
          note="Every term the school has run on Chalkvault. Closed terms keep the figures they had when they closed."
          series={[
            { name: 'Attendance', tone: 'now' },
            { name: 'Average score', tone: 'before' },
          ]}
          table={{
            head: ['Term', 'Students', 'Attendance', 'Average', 'Fees collected', 'Need attention'],
            rows: history.map((h) => [`${h.termName}${h.session ? `, ${h.session}` : ''}`, h.students, h.attendancePct === null ? '' : `${h.attendancePct}%`, h.average === null ? '' : `${h.average}%`, h.feesExpected ? `${Math.round((h.feesCollected / h.feesExpected) * 100)}%` : '', h.atRisk]),
          }}
        >
          <LineChart
            series={[
              { name: 'Attendance', tone: 'now' },
              { name: 'Average score', tone: 'before' },
            ]}
            points={history.map((h) => ({ label: `${h.termName.replace(/ term$/i, '')}${h.session ? ` ${h.session.slice(2, 4)}/${h.session.slice(-2)}` : ''}`, values: [h.attendancePct, h.average] }))}
          />
        </ChartCard>
      )}
    </div>
  );
}

function RiskPanel({ risks, armName, explain, busy }: { risks: StudentRisk[]; armName: (id: string) => string; explain: (q: string) => void; busy: boolean }) {
  const { schoolId } = useSchool();
  const [all, setAll] = useState(false);
  const shown = all ? risks : risks.slice(0, 8);
  return (
    <section className="panel">
      <div className="panel-head">
        <h2 className="h3">{risks.length ? `${risks.length} student${risks.length === 1 ? '' : 's'} need attention` : 'No student needs attention yet'}</h2>
        {risks.length > 0 && (
          <button className="link small" onClick={() => explain('For the students needing attention, suggest what each form teacher should do this week. Group by arm.')} disabled={busy}>
            Suggest next steps
          </button>
        )}
      </div>
      {risks.length ? (
        <ul className="queue-list risk-list">
          {shown.map((r) => (
            <li key={r.studentId}>
              <Link to={`/s/${schoolId}/students/${r.studentId}`}>{r.name}</Link>
              <span className="muted small">
                {armName(r.classId)}: {r.reasons.join(', ')}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted small">Students show here when their average falls under 50%, they score under 40% in two subjects, or their attendance drops under 80%.</p>
      )}
      {risks.length > 8 && (
        <button className="link small" onClick={() => setAll((v) => !v)}>
          {all ? 'Show fewer' : `Show all ${risks.length}`}
        </button>
      )}
    </section>
  );
}

/** Setting up from scratch: stays on the dashboard until every step is done. */
function SetupChecklist({ students, hasInvoices }: { students: number; hasInvoices: boolean }) {
  const { schoolId, school, classes, members, currentTerm } = useSchool();
  const fees = useQuery<{ id: string }>(mod(schoolId, 'feeItems'), `setup-fees:${schoolId}`);
  const notices = useNotices();
  const steps = [
    { done: !!(school.address || school.motto || school.principalName), to: 'settings', text: 'School details and rules: address, motto, principal, who takes attendance' },
    { done: classes.length > 0, to: 'settings', text: 'Classes, arms and subjects' },
    { done: !!currentTerm?.starts, to: 'settings', text: 'Term calendar: resumption, midterm break, exams and vacation dates' },
    { done: members.length > 1, to: 'staff', text: 'Invite staff and give them their form classes and subjects' },
    { done: students > 0, to: 'import', text: 'Students: photograph your class lists or drop in a spreadsheet, or add them by hand under Classes' },
    { done: fees.data.length > 0, to: 'fees', text: 'Fees: items, discounts and opening balances' },
    { done: hasInvoices && notices.data.length > 0, to: 'fees', text: 'Go live: raise this term’s invoices and post a welcome notice' },
  ];
  if (steps.every((s) => s.done)) return null;
  return (
    <section className="setup">
      <h2 className="h3">
        Setting up: {steps.filter((s) => s.done).length} of {steps.length} done
      </h2>
      <ol className="checklist">
        {steps.map((s, i) => (
          <li key={s.text} className={s.done ? 'done' : ''}>
            <span className="mono">{String(i + 1).padStart(2, '0')}</span>
            <Link to={`/s/${schoolId}/${s.to}`}>{s.text}</Link>
          </li>
        ))}
      </ol>
      {students === 0 && (
        <p className="muted small">
          Have records on paper or in Excel? <Link to={`/s/${schoolId}/import`}>Bring them in</Link> and Chalkvault sorts them into classes, students, scores and balances for you to check.
        </p>
      )}
    </section>
  );
}
