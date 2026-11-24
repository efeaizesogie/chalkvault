import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { query, where } from 'firebase/firestore';
import { mod, paths } from '../data/api';
import { useQuery } from '../data/hooks';
import type { Invoice, Offering, StudentProfile, SubjectRecord } from '../data/types';
import { SUPPORT_LABEL } from '../data/types';
import { askSchool, PrivacyBlock } from '../lib/ai';
import { assessmentsOf, bandsOf, computeResults } from '../lib/results';
import { rosterOf } from '../lib/reportCards';
import { naira } from '../lib/fees';
import { friendlyError } from '../lib/errors';
import { SourceStamp } from '../components/SourceStamp';
import { useToast } from '../ui/toast';
import { useSchool } from '../school/SchoolContext';
import { useArm } from '../school/useArm';
import type { WorkspaceCtx } from '../school/Workspace';
import './ask.css';

type Part = { text: string; names: string[] };
type Turn = { q: string; a: string; source?: 'on_device' | 'in_cloud'; ms?: number; sent?: string; pending?: boolean };

const SUGGEST_ADMIN = [
  'Which arm has the lowest attendance this term?',
  'Who is failing two or more subjects?',
  'Which subjects have the weakest class averages?',
  'Which families owe the most in fees?',
  'Who has been flagged for follow-up, and why?',
];
const SUGGEST_TEACHER = ['Who in my classes is below 50%?', 'Which of my students missed the most days?', 'How does each of my subjects compare?', 'Who improved enough to praise this week?'];

/** Ask Chalkvault: questions about the school, answered from figures compiled in this browser. */
export function AskPage() {
  const { isAdmin, classes, formClasses, myOfferings, me, policy, schoolId, term } = useSchool();
  const ws = useOutletContext<WorkspaceCtx>();
  const toast = useToast();
  const [parts, setParts] = useState<Record<string, Part>>({});
  const [q, setQ] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const report = useCallback((key: string, p: Part) => setParts((x) => (x[key]?.text === p.text ? x : { ...x, [key]: p })), []);

  const arms = isAdmin ? classes : formClasses;
  const offerings = isAdmin ? [] : myOfferings.filter((o) => !formClasses.some((c) => c.id === o.classId));
  const finance = isAdmin || me.role === 'bursar';
  const invoices = useQuery<Invoice>(finance && term ? query(mod(schoolId, 'invoices'), where('termId', '==', term.id)) : null, `ask-inv:${term?.id}:${finance}`);
  const allStudents = useQuery<StudentProfile>(finance ? paths.students(schoolId) : null, `ask-st:${finance}`);

  const feeText = useMemo(() => {
    if (!finance || !invoices.data.length) return '';
    const name = (id: string) => allStudents.data.find((s) => s.id === id)?.name ?? 'Unknown';
    const owing = invoices.data.filter((i) => i.balance > 0).sort((a, b) => b.balance - a.balance);
    const total = invoices.data.reduce((n, i) => n + i.total, 0);
    const paid = invoices.data.reduce((n, i) => n + i.paid, 0);
    return [
      `FEES this term: expected ${naira(total)}, collected ${naira(paid)} (${total ? Math.round((paid / total) * 100) : 0}%), ${owing.length} children owing.`,
      `Balances owed: ${owing
        .slice(0, 40)
        .map((i) => `${name(i.studentId)} (${classes.find((c) => c.id === i.classId)?.name}) ${naira(i.balance)}`)
        .join('; ')}.`,
    ].join('\n');
  }, [finance, invoices.data, allStudents.data, classes]);

  const brief = useMemo(() => {
    const lines = [`Term: ${term?.name ?? ''}${term?.session ? `, ${term.session}` : ''}. Today: ${new Date().toLocaleDateString()}.`];
    for (const p of Object.values(parts)) lines.push(p.text);
    if (feeText) lines.push(feeText);
    return lines.join('\n\n');
  }, [parts, feeText, term]);
  const names = useMemo(() => [...new Set([...Object.values(parts).flatMap((p) => p.names), ...allStudents.data.map((s) => s.name)])], [parts, allStudents.data]);
  const ready = Object.keys(parts).length >= arms.length + offerings.length;

  const ask = async (question: string) => {
    if (!question.trim() || busy) return;
    setBusy(true);
    setQ('');
    const history = turns.filter((t) => !t.pending).map((t) => ({ q: t.q, a: t.a }));
    setTurns((t) => [...t, { q: question, a: '', pending: true }]);
    const update = (patch: Partial<Turn>) => setTurns((t) => t.map((x, i) => (i === t.length - 1 ? { ...x, ...patch } : x)));
    try {
      const res = await askSchool({
        question,
        brief,
        names,
        history,
        allowCloud: policy.cloudCommentFallback && ws.prefs.allowCloudFallback,
        onText: (a, source) => update({ a, source }),
      });
      update({ a: res.answer, source: res.source, ms: res.ms, sent: res.sent, pending: false });
      await ws.log({
        task: 'Ask Chalkvault',
        source: res.source,
        charsSent: res.sent.length,
        detail: res.source === 'on_device' ? `Answered by Gemini Nano on this device in ${(res.ms / 1000).toFixed(1)} s. Nothing was sent.` : `Student names were replaced with codes before sending.\n${res.sent}`,
      });
    } catch (e) {
      update({ a: e instanceof PrivacyBlock ? e.message : `Couldn’t answer: ${friendlyError(e)}`, pending: false });
      if (!(e instanceof PrivacyBlock)) toast(friendlyError(e), 'error');
    } finally {
      setBusy(false);
      ws.refreshDevice();
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), 50);
    }
  };

  return (
    <div className="page ask">
      <header className="page-head">
        <div>
          <h1 className="display-sm">Ask Chalkvault</h1>
          <p className="lede">
            Ask about attendance, results{finance ? ', fees' : ''} and follow-ups. The figures are put together on this computer.{' '}
            {ws.device === 'available' ? 'Gemini Nano answers here too, so nothing leaves the device.' : 'Without Gemini Nano, answers come from the cloud with every student name replaced by a code.'}
          </p>
        </div>
      </header>

      {arms.map((c) => (
        <ArmBrief key={c.id} classId={c.id} onReport={report} />
      ))}
      {offerings.map((o) => (
        <OfferingBrief key={o.id} o={o} onReport={report} />
      ))}

      <section className="ask-thread" aria-live="polite">
        {turns.length === 0 && (
          <div className="ask-suggest">
            {(isAdmin ? SUGGEST_ADMIN : SUGGEST_TEACHER).filter((s) => finance || !/fees/i.test(s)).map((s) => (
              <button key={s} className="chip" onClick={() => ask(s)} disabled={!ready || busy}>
                {s}
              </button>
            ))}
          </div>
        )}
        {turns.map((t, i) => (
          <article key={i} className="ask-turn">
            <p className="ask-q">{t.q}</p>
            <div className="ask-a">
              <div className="ask-meta">{t.source && <SourceStamp source={t.source} ms={t.ms} />}</div>
              <div className="ask-text">
                {t.a || <span className="muted">Reading the figures…</span>}
                {t.pending && <span className="caret" aria-hidden />}
              </div>
              {t.sent && (
                <details>
                  <summary className="mono muted">Exactly what was sent</summary>
                  <pre className="ask-sent">{t.sent}</pre>
                </details>
              )}
            </div>
          </article>
        ))}
        <div ref={endRef} />
      </section>

      <form
        className="ask-box"
        onSubmit={(e) => {
          e.preventDefault();
          ask(q);
        }}
      >
        <label className="sr-only" htmlFor="ask-q">
          Your question
        </label>
        <input id="ask-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder={ready ? 'Ask about your school…' : 'Putting the figures together…'} disabled={!ready} />
        <button className="ticket" disabled={!q.trim() || busy || !ready}>
          {busy ? 'Answering…' : 'Ask'}
        </button>
      </form>
      <details className="ask-brief">
        <summary className="mono muted">The figures Chalkvault answers from ({brief.length.toLocaleString()} characters)</summary>
        <pre>{brief}</pre>
      </details>
    </div>
  );
}

/** Compiles one arm's figures: attendance, subject averages, each student's average, position, attendance, flags. */
function ArmBrief({ classId, onReport }: { classId: string; onReport: (k: string, p: Part) => void }) {
  const { members } = useSchool();
  const arm = useArm(classId);
  useEffect(() => {
    if (!arm.cls || arm.loading) return;
    const form = members.filter((m) => m.classIds.includes(classId)).map((m) => m.name);
    const cards = arm.cards;
    let present = 0;
    let days = 0;
    const lines: string[] = [];
    for (const s of arm.students) {
      const c = cards.get(s.id);
      const rec = arm.formRecords.find((r) => r.studentId === s.id);
      if (c?.attendance) {
        present += c.attendance.present;
        days += c.attendance.days;
      }
      const weak = c?.subjects.filter((x) => x.grade && x.total / (c.assessments.reduce((n, a) => n + a.max, 0) || 100) < 0.5).map((x) => x.subject) ?? [];
      const flag = rec?.draft?.supportFlag && rec.draft.supportFlag !== 'none' ? `; flagged: ${SUPPORT_LABEL[rec.draft.supportFlag]} (${rec.draft.growthArea})` : '';
      lines.push(
        `- ${s.name}: average ${c?.average ?? 0}%${c?.position ? `, ${c.position}` : ''}; ${c?.subjects.filter((x) => x.grade).map((x) => `${x.subject} ${x.total} ${x.grade}`).join(', ') || 'no scores'}${weak.length ? `; below 50% in ${weak.join(', ')}` : ''}${c?.attendance ? `; present ${c.attendance.present}/${c.attendance.days} days` : ''}${flag}`,
      );
    }
    const subjAvg = arm.offerings
      .map((o) => {
        const totals = [...cards.values()].map((c) => c.subjects.find((x) => x.subject === o.subject)).filter((x) => x?.grade).map((x) => x!.total);
        return totals.length ? `${o.subject} ${Math.round(totals.reduce((a, b) => a + b, 0) / totals.length)}` : '';
      })
      .filter(Boolean);
    const text = [
      `CLASS ${arm.cls.name} (${arm.students.length} students; form teacher ${form.join(', ') || 'none'}).`,
      days ? `Attendance this term ${Math.round((present / days) * 100)}% of student-days.` : 'No attendance taken this term.',
      subjAvg.length ? `Subject averages: ${subjAvg.join(', ')}.` : '',
      ...lines,
    ]
      .filter(Boolean)
      .join('\n');
    onReport(`arm:${classId}`, { text, names: arm.students.map((s) => s.name) });
  }, [arm.cls, arm.loading, arm.cards, arm.students, arm.formRecords, arm.offerings, classId, members, onReport]);
  return null;
}

/** A subject teacher's view of one subject in an arm they don't form-teach. */
function OfferingBrief({ o, onReport }: { o: Offering; onReport: (k: string, p: Part) => void }) {
  const { schoolId, school, classes, term } = useSchool();
  const st = useQuery<StudentProfile>(query(paths.students(schoolId), where('classId', '==', o.classId)), `ask-ost:${o.id}`);
  const recs = useQuery<SubjectRecord>(term ? query(paths.subjectRecords(schoolId), where('offeringId', '==', o.id), where('termId', '==', term.id)) : null, `ask-orec:${o.id}:${term?.id}`);
  useEffect(() => {
    if (st.loading || recs.loading) return;
    const roster = rosterOf(o, st.data);
    const res = computeResults(roster.map((s) => s.id), Object.fromEntries(recs.data.map((r) => [r.studentId, r.scores])), assessmentsOf(school), bandsOf(school));
    const lines = roster.map((s) => {
      const r = res.rows.get(s.id);
      return `- ${s.name}: ${r?.grade ? `${r.total}/${res.maxTotal} ${r.grade}, ${r.position} of ${res.ranked}` : 'no score yet'}`;
    });
    onReport(`off:${o.id}`, {
      text: [`SUBJECT ${o.subject} in ${classes.find((c) => c.id === o.classId)?.name} (${roster.length} students). Average ${res.average}, highest ${res.highest}, lowest ${res.lowest}.`, ...lines].join('\n'),
      names: roster.map((s) => s.name),
    });
  }, [st.loading, recs.loading, st.data, recs.data, o, school, classes, onReport]);
  return null;
}
