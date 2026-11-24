import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { readResult } from '../data/api';
import type { PublishedResult } from '../data/types';
import { ReportCardView } from '../components/ReportCardView';
import { AuthShell } from './AuthShell';

/** Public result checker: a parent enters the private PIN from the school's slip. No account needed. */
export function Portal() {
  const [params] = useSearchParams();
  const [pin, setPin] = useState(params.get('pin') ?? '');
  const [result, setResult] = useState<PublishedResult | null>(null);
  const [termId, setTermId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const check = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await readResult(pin.replace(/\s/g, ''));
      if (!r) throw new Error('No results for that PIN. Check it against the slip from the school.');
      setResult(r);
      const latest = Object.values(r.reports).sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0))[0];
      setTermId(latest?.termId ?? '');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (result) {
    const reports = Object.values(result.reports).sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0));
    const card = result.reports[termId] ?? reports[0];
    return (
      <div className="portal">
        <header className="auth-top portal-top">
          <Link to="/" className="wordmark">
            Chalkvault
          </Link>
          <div className="head-actions">
            {reports.length > 1 && (
              <select value={termId} onChange={(e) => setTermId(e.target.value)} aria-label="Term">
                {reports.map((r) => (
                  <option key={r.termId} value={r.termId}>
                    {r.termName}
                    {r.session ? `, ${r.session}` : ''}
                  </option>
                ))}
              </select>
            )}
            <button className="pill ghost" onClick={() => window.print()}>
              Print
            </button>
            <button className="link" onClick={() => setResult(null)}>
              Check another PIN
            </button>
          </div>
        </header>
        <main className="portal-main">
          {card && (card.attendance || result.fees) && (
            <section className="portal-summary" aria-label="Summary">
              {card.attendance && (
                <div>
                  <span className="mono">Attendance, {card.termName.toLowerCase()}</span>
                  <b>{Math.round((card.attendance.present / card.attendance.days) * 100)}%</b>
                  <span className="muted small">
                    Present on {card.attendance.present} of {card.attendance.days} school days
                  </span>
                </div>
              )}
              {result.fees && (
                <div>
                  <span className="mono">Fees, {result.fees.termName.toLowerCase()}</span>
                  <b>{result.fees.balance > 0 ? `₦${Math.round(result.fees.balance).toLocaleString('en-NG')} owed` : 'Paid in full'}</b>
                  <span className="muted small">
                    ₦{Math.round(result.fees.paid).toLocaleString('en-NG')} paid of ₦{Math.round(result.fees.total).toLocaleString('en-NG')}, as of {new Date(result.fees.asOf).toLocaleDateString()}. Ask the school’s bursar about any payment made since.
                  </span>
                </div>
              )}
            </section>
          )}
          {card ? (
            <ReportCardView card={card} schoolName={result.schoolName} schoolAddress={result.schoolAddress} studentName={result.studentName} admissionNo={result.admissionNo} />
          ) : (
            <p className="muted">No report has been published for this PIN yet.</p>
          )}
        </main>
      </div>
    );
  }

  return (
    <AuthShell title="Check a report card" note="Enter the result PIN from the slip your child’s school gave you.">
      <form className="auth-card" onSubmit={check}>
        <label className="field">
          <span className="mono">Result PIN</span>
          <input value={pin} onChange={(e) => setPin(e.target.value.toUpperCase())} placeholder="ABCD-EFGH-JKLM" autoComplete="off" spellCheck={false} />
        </label>
        {error && <p className="form-error">{error}</p>}
        <button className="ticket" disabled={busy || pin.replace(/[^A-Z0-9]/gi, '').length < 12}>
          {busy ? 'Checking…' : 'Show report card'}
        </button>
      </form>
    </AuthShell>
  );
}
