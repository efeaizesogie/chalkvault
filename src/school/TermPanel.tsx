import { useState } from 'react';
import { setDoc, updateDoc } from 'firebase/firestore';
import { addTerm, modDoc, paths, updateSchool } from '../data/api';
import type { Term } from '../data/types';
import { friendlyError } from '../lib/errors';
import { naira } from '../lib/fees';
import { useToast } from '../ui/toast';
import { useSchool } from './SchoolContext';
import { useTermStats } from './useTermStats';

const STATUS: Record<NonNullable<Term['status']>, string> = { planned: 'Planned', open: 'Open', results: 'Results season', closed: 'Closed' };
const NEXT: Record<string, string> = { 'first term': 'Second term', 'second term': 'Third term', 'third term': 'First term' };

/** Next session after 2026/2027 is 2027/2028. */
function nextSession(s?: string) {
  const m = s?.match(/^(\d{4})\s*\/\s*(\d{4})$/);
  return m ? `${Number(m[1]) + 1}/${Number(m[2]) + 1}` : s ?? '';
}

/** Terms and sessions: dates, status, and closing a term with a checklist. */
export function TermPanel() {
  const { schoolId, terms, currentTerm, me, setViewTerm } = useSchool();
  const toast = useToast();
  const [closing, setClosing] = useState(false);
  const [newTerm, setNewTerm] = useState('');
  const [newSession, setNewSession] = useState(currentTerm?.session ?? '');
  const fail = (e: unknown) => toast(friendlyError(e), 'error');
  const setField = (t: Term, patch: Partial<Term>) => updateDoc(paths.term(schoolId, t.id), patch).catch(fail);
  const ordered = [...terms].sort((a, b) => b.order - a.order);

  const startTerm = async () => {
    if (!newTerm.trim()) return;
    try {
      const id = await addTerm(schoolId, newTerm.trim(), Math.max(0, ...terms.map((t) => t.order)) + 1);
      await updateDoc(paths.term(schoolId, id), { status: 'open', ...(newSession.trim() ? { session: newSession.trim() } : {}) });
      await updateSchool(schoolId, { currentTermId: id });
      setViewTerm(null);
      setNewTerm('');
      toast(`${newTerm.trim()} is now the current term. Earlier terms stay on every student’s record.`);
    } catch (e) {
      fail(e);
    }
  };

  return (
    <section className="panel">
      <div className="panel-head">
        <h2 className="h3">Terms and sessions</h2>
        {currentTerm && currentTerm.status !== 'closed' && !closing && (
          <button className="pill ink" onClick={() => setClosing(true)}>
            Close {currentTerm.name.toLowerCase()}
          </button>
        )}
      </div>
      {closing && currentTerm && <CloseTerm term={currentTerm} onDone={() => setClosing(false)} />}
      <ol className="term-list">
        {ordered.map((t) => (
          <li key={t.id} className="term-block">
            <div className="term-row">
              <span>
                <b>{t.name}</b>
                {t.session ? `, ${t.session}` : ''}
              </span>
              <span className="mono">{t.id === currentTerm?.id ? 'Current' : ''}</span>
              {t.status === 'closed' ? (
                <span className="muted small">Closed{t.closedAt ? ` on ${new Date(t.closedAt).toLocaleDateString()}` : ''}{me.role === 'owner' ? '. Only you can still change it.' : '.'}</span>
              ) : (
                <label className="field inline small">
                  <span className="mono">Status</span>
                  <select value={t.status ?? 'open'} onChange={(e) => setField(t, { status: e.target.value as Term['status'] })}>
                    {(['planned', 'open', 'results'] as const).map((k) => (
                      <option key={k} value={k}>
                        {STATUS[k]}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {t.id !== currentTerm?.id && t.status !== 'closed' && (
                <button className="link small" onClick={() => updateSchool(schoolId, { currentTermId: t.id }).then(() => setViewTerm(null), fail)}>
                  Make current
                </button>
              )}
            </div>
            <details>
              <summary className="mono muted">Dates</summary>
              <div className="term-dates">
                {(
                  [
                    ['starts', 'Resumes'],
                    ['midtermFrom', 'Midterm break from'],
                    ['midtermTo', 'Midterm break to'],
                    ['examsFrom', 'Exams start'],
                    ['ends', 'Vacates'],
                    ['nextTermBegins', 'Next term begins'],
                  ] as const
                ).map(([k, label]) => (
                  <label key={k} className="field small">
                    <span className="mono">{label}</span>
                    <input type="date" defaultValue={t[k] ?? ''} onBlur={(e) => e.currentTarget.value !== (t[k] ?? '') && setField(t, { [k]: e.currentTarget.value })} />
                  </label>
                ))}
              </div>
            </details>
          </li>
        ))}
      </ol>
      <div className="inline-add">
        <input value={newTerm} onChange={(e) => setNewTerm(e.target.value)} placeholder="e.g. Second term" aria-label="New term name" />
        <input value={newSession} onChange={(e) => setNewSession(e.target.value)} placeholder="Session, e.g. 2026/2027" aria-label="Session" />
        <button className="pill" onClick={startTerm} disabled={!newTerm.trim()}>
          Start a term
        </button>
      </div>
    </section>
  );
}

/** Checks what is unfinished, saves the term's figures, locks it and opens the next term. */
function CloseTerm({ term, onDone }: { term: Term; onDone: () => void }) {
  const { schoolId, classes, terms, setViewTerm } = useSchool();
  const toast = useToast();
  const { stats, loading, invoices } = useTermStats(term);
  const s = stats?.summary;
  const nextName = NEXT[term.name.trim().toLowerCase()] ?? '';
  const [name, setName] = useState(nextName);
  const [session, setSession] = useState(term.name.trim().toLowerCase() === 'third term' ? nextSession(term.session) : term.session ?? '');
  const [anyway, setAnyway] = useState(false);
  const [busy, setBusy] = useState(false);

  const published = new Set(term.publishedArms ?? []);
  const owing = invoices.filter((i) => i.balance > 0);
  const checks = s
    ? [
        { ok: s.scoresEntered >= s.scoresExpected, text: s.scoresEntered >= s.scoresExpected ? 'Every subject score is in.' : `${s.scoresExpected - s.scoresEntered} subject scores are missing.` },
        { ok: s.commentsApproved >= s.students, text: s.commentsApproved >= s.students ? 'Every form comment is approved.' : `${s.students - s.commentsApproved} form comments are not approved yet.` },
        { ok: classes.every((c) => published.has(c.id)), text: classes.every((c) => published.has(c.id)) ? 'Every arm’s results are published.' : `Results not published for ${classes.filter((c) => !published.has(c.id)).map((c) => c.name).join(', ')}.` },
        { ok: true, text: owing.length ? `${owing.length} children owe ${naira(owing.reduce((n, i) => n + i.balance, 0))}. It carries into next term’s invoices as arrears.` : 'No fees outstanding.' },
      ]
    : [];
  const clean = checks.every((c) => c.ok);

  const close = async () => {
    if (!s || !name.trim()) return;
    setBusy(true);
    try {
      await setDoc(modDoc(schoolId, 'termSummaries', term.id), s);
      await updateDoc(paths.term(schoolId, term.id), { status: 'closed', closedAt: Date.now() });
      const id = await addTerm(schoolId, name.trim(), Math.max(0, ...terms.map((t) => t.order)) + 1);
      await updateDoc(paths.term(schoolId, id), { status: 'open', ...(session.trim() ? { session: session.trim() } : {}), ...(term.nextTermBegins ? { starts: term.nextTermBegins } : {}) });
      await updateSchool(schoolId, { currentTermId: id });
      setViewTerm(null);
      toast(`${term.name} is closed and its figures are saved. ${name.trim()} is now open.`);
      onDone();
    } catch (e) {
      toast(friendlyError(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="close-term">
      <p>
        Closing <b>{term.name}</b> saves its figures for the dashboard, locks its registers, scores and comments (only the owner can still correct them) and opens the next term. Students stay in their arms; promote them under Session tools after third term.
      </p>
      {loading || !s ? (
        <p className="muted">Checking this term’s records…</p>
      ) : (
        <ul className="check-list">
          {checks.map((c) => (
            <li key={c.text} className={c.ok ? 'ok' : 'todo'}>
              <span className="mono">{c.ok ? 'Done' : 'To do'}</span> {c.text}
            </li>
          ))}
        </ul>
      )}
      <div className="form-grid">
        <label className="field">
          <span className="mono">Next term</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Second term" />
        </label>
        <label className="field">
          <span className="mono">Session</span>
          <input value={session} onChange={(e) => setSession(e.target.value)} placeholder="e.g. 2026/2027" />
        </label>
      </div>
      {!clean && s && (
        <label className="check">
          <input type="checkbox" checked={anyway} onChange={(e) => setAnyway(e.target.checked)} /> Close it anyway
        </label>
      )}
      <div className="row-actions">
        <button className="pill ink" onClick={close} disabled={busy || !s || !name.trim() || (!clean && !anyway)}>
          {busy ? 'Closing…' : `Close ${term.name.toLowerCase()} and open ${name.trim() || 'the next term'}`}
        </button>
        <button className="link" onClick={onDone}>
          Not now
        </button>
      </div>
    </div>
  );
}
