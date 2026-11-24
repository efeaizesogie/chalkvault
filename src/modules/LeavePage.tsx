import { useState } from 'react';
import { query, where } from 'firebase/firestore';
import { mod, patchIn, removeIn, saveIn, todayISO, uid } from '../data/api';
import { useQuery } from '../data/hooks';
import type { LeaveRequest } from '../data/types';
import { friendlyError } from '../lib/errors';
import { useToast } from '../ui/toast';
import { useSchool } from '../school/SchoolContext';
import './ops.css';
import { PrintExport } from '../components/PrintExport';

const showDate = (iso: string) => (iso ? new Date(iso + 'T00:00:00').toLocaleDateString() : '—');
const statusLabel: Record<LeaveRequest['status'], string> = { pending: 'Pending', approved: 'Approved', declined: 'Declined' };

export function LeavePage() {
  const { schoolId, isAdmin, me } = useSchool();
  const toast = useToast();
  // Rules let non-admins read only their own requests; admins read the whole collection.
  const q = isAdmin ? mod(schoolId, 'leave') : query(mod(schoolId, 'leave'), where('uid', '==', me.uid));
  const leave = useQuery<LeaveRequest>(q, `leave:${schoolId}:${isAdmin ? 'all' : me.uid}`);

  const [from, setFrom] = useState(todayISO());
  const [to, setTo] = useState(todayISO());
  const [reason, setReason] = useState('');

  const request = async () => {
    if (from > to) {
      toast('The end date is before the start date.', 'warn');
      return;
    }
    try {
      const req: LeaveRequest = { id: uid(), uid: me.uid, name: me.name, from, to, reason: reason.trim(), status: 'pending', at: Date.now() };
      await saveIn(schoolId, 'leave', req);
      toast('Leave request sent.');
      setReason('');
    } catch (e) {
      toast(friendlyError(e), 'error');
    }
  };
  const decide = async (r: LeaveRequest, status: LeaveRequest['status']) => {
    try {
      await patchIn(schoolId, 'leave', r.id, { status });
    } catch (e) {
      toast(friendlyError(e), 'error');
    }
  };
  const withdraw = async (r: LeaveRequest) => {
    try {
      await removeIn(schoolId, 'leave', r.id);
    } catch (e) {
      toast(friendlyError(e), 'error');
    }
  };

  const today = todayISO();
  const sorted = [...leave.data].sort((a, b) => b.at - a.at);
  const awayToday = sorted.filter((r) => r.status === 'approved' && r.from <= today && r.to >= today);

  const statusChip = (s: LeaveRequest['status']) => (
    <span className={`chip ${s === 'approved' ? 'on' : s === 'declined' ? 'ops-danger' : ''}`}>{statusLabel[s]}</span>
  );

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1 className="display-sm">Leave</h1>
          <p className="lede">{isAdmin ? 'Requests from staff, and who is away today.' : 'Ask for time off and track your requests.'}</p>
        </div>
        <PrintExport title="Staff leave" />
      </header>

      <section className="panel wide">
        <h2 className="h3">Request leave</h2>
        <div className="form-grid">
          <label className="field">
            <span className="mono">From</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="field">
            <span className="mono">To</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
        </div>
        <label className="field">
          <span className="mono">Reason</span>
          <textarea className="ruled" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Medical appointment" />
        </label>
        <div className="row-actions">
          <span className="muted small">An admin reviews every request.</span>
          <button className="ticket" onClick={request} disabled={!from || !to}>
            Send request
          </button>
        </div>
      </section>

      {isAdmin && (
        <section className="panel wide">
          <h2 className="h3">Away today</h2>
          {awayToday.length === 0 ? (
            <p className="muted">Everyone is in today.</p>
          ) : (
            <div className="ops-chiprow">
              {awayToday.map((r) => (
                <span className="chip" key={r.id}>
                  {r.name}
                </span>
              ))}
            </div>
          )}
        </section>
      )}

      <section className="panel wide">
        <h2 className="h3">{isAdmin ? 'All requests' : 'Your requests'}</h2>
        {sorted.length === 0 ? (
          <p className="muted">No leave requests yet.</p>
        ) : (
          <ul className="rows">
            {sorted.map((r) => {
              const mine = r.uid === me.uid;
              return (
                <li key={r.id} className="row record-row">
                  <span className="row-name">{isAdmin ? r.name : `${showDate(r.from)} to ${showDate(r.to)}`}</span>
                  {isAdmin && (
                    <span className="muted small">
                      {showDate(r.from)} to {showDate(r.to)}
                    </span>
                  )}
                  <span className="muted small">{r.reason || 'No reason given'}</span>
                  <span className="ops-chiprow">
                    {statusChip(r.status)}
                    {isAdmin && r.status === 'pending' && (
                      <>
                        <button className="pill ink" onClick={() => decide(r, 'approved')}>
                          Approve
                        </button>
                        <button className="pill ghost" onClick={() => decide(r, 'declined')}>
                          Decline
                        </button>
                      </>
                    )}
                    {mine && r.status === 'pending' && (
                      <button className="link danger" onClick={() => withdraw(r)}>
                        Withdraw
                      </button>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
