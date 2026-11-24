import { useState } from 'react';
import { query, where } from 'firebase/firestore';
import { mod, removeIn, saveIn, todayISO } from '../data/api';
import { useQuery } from '../data/hooks';
import type { Incident } from '../data/types';
import { friendlyError } from '../lib/errors';
import { useToast } from '../ui/toast';
import { useSchool } from '../school/SchoolContext';
import './admissions.css';

const KINDS: { key: Incident['kind']; label: string }[] = [
  { key: 'merit', label: 'Merit' },
  { key: 'behaviour', label: 'Behaviour' },
  { key: 'health', label: 'Health' },
];
const kindLabel = (k: Incident['kind']) => KINDS.find((x) => x.key === k)?.label ?? k;

const blank = { kind: 'merit' as Incident['kind'], date: todayISO(), note: '', action: '' };

/** Behaviour and health log shown on a student's record. Rules limit who sees which entries. */
export function IncidentLog({ studentId, classId, studentName }: { studentId: string; classId: string; studentName: string }) {
  const { schoolId, me, isAdmin } = useSchool();
  const toast = useToast();
  const canSeeAll = isAdmin || me.classIds.includes(classId);
  const incidents = useQuery<Incident>(
    canSeeAll
      ? query(mod(schoolId, 'incidents'), where('studentId', '==', studentId))
      : query(mod(schoolId, 'incidents'), where('studentId', '==', studentId), where('by', '==', me.uid)),
    `incidents:${studentId}:${canSeeAll ? 'all' : me.uid}`,
  );
  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false);

  const set = (patch: Partial<typeof blank>) => setForm((f) => ({ ...f, ...patch }));
  const rows = [...incidents.data].sort((a, b) => b.at - a.at);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.note.trim()) return;
    setBusy(true);
    try {
      await saveIn(schoolId, 'incidents', {
        studentId,
        classId,
        kind: form.kind,
        note: form.note.trim(),
        action: form.action.trim(),
        date: form.date,
        by: me.uid,
        byName: me.name,
        at: Date.now(),
      } as Incident);
      setForm({ ...blank, date: form.date });
      toast(`Entry added for ${studentName}.`);
    } catch (err) {
      toast(friendlyError(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await removeIn(schoolId, 'incidents', id);
    } catch (err) {
      toast(friendlyError(err), 'error');
    }
  };

  return (
    <section className="panel wide">
      <h2 className="h3">Behaviour and health</h2>
      {!canSeeAll && <p className="muted small">You see the entries you added. The form teacher and admins see the full log.</p>}

      <form className="form-grid" onSubmit={add}>
        <label className="field">
          <span className="mono">Kind</span>
          <select value={form.kind} onChange={(e) => set({ kind: e.target.value as Incident['kind'] })}>
            {KINDS.map((k) => (
              <option key={k.key} value={k.key}>
                {k.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="mono">Date</span>
          <input type="date" value={form.date} onChange={(e) => set({ date: e.target.value })} />
        </label>
        <label className="field full">
          <span className="mono">What happened</span>
          <input value={form.note} onChange={(e) => set({ note: e.target.value })} maxLength={400} required />
        </label>
        <label className="field full">
          <span className="mono">Action taken</span>
          <input value={form.action} onChange={(e) => set({ action: e.target.value })} maxLength={400} placeholder="Optional" />
        </label>
        <div className="field full">
          <button className="pill ink" disabled={busy || !form.note.trim()}>
            {busy ? 'Saving…' : 'Add entry'}
          </button>
        </div>
      </form>

      {rows.length === 0 ? (
        <p className="muted small">No entries yet.</p>
      ) : (
        <ul className="incident-list">
          {rows.map((it) => (
            <li key={it.id} className="incident-item">
              <div className="incident-top">
                <div>
                  <span className="chip">{kindLabel(it.kind)}</span>{' '}
                  <span className="incident-meta">{it.date ? new Date(it.date).toLocaleDateString() : ''}</span>
                </div>
                {(isAdmin || it.by === me.uid) && (
                  <button className="link danger small" onClick={() => remove(it.id)}>
                    Delete
                  </button>
                )}
              </div>
              <p>{it.note}</p>
              {it.action && <p className="incident-meta">Action: {it.action}</p>}
              <p className="incident-meta">Logged by {it.byName}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
