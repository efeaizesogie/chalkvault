import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { saveIn } from '../data/api';
import type { Application } from '../data/types';
import { friendlyError } from '../lib/errors';
import { AuthShell } from '../pages/AuthShell';
import { SuggestInput } from '../components/Pickers';
import { levelGroups } from '../school/catalog';
import './admissions.css';

const LANGUAGE_OPTIONS = ['English', 'Yoruba', 'Hausa', 'Igbo', 'French', 'Arabic', 'Other'];

type Form = Omit<Application, 'id' | 'status' | 'at'>;

const blankForm: Form = {
  childName: '',
  dob: '',
  gender: '',
  level: '',
  previousSchool: '',
  guardianName: '',
  guardianPhone: '',
  guardianEmail: '',
  language: 'English',
  notes: '',
};

/** Public admission form (`/apply/:schoolId`). No account needed; parents fill it and the school reviews it. */
export function ApplyPage() {
  const { schoolId = '' } = useParams();
  const [form, setForm] = useState<Form>(blankForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));
  const ready = form.childName.trim().length > 1 && form.guardianName.trim().length > 1 && (form.guardianPhone.trim() !== '' || form.guardianEmail.trim() !== '');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schoolId || !ready) return;
    setBusy(true);
    setError('');
    try {
      await saveIn(schoolId, 'applications', {
        childName: form.childName.trim(),
        dob: form.dob,
        gender: form.gender,
        level: form.level.trim(),
        previousSchool: form.previousSchool.trim(),
        guardianName: form.guardianName.trim(),
        guardianPhone: form.guardianPhone.trim(),
        guardianEmail: form.guardianEmail.trim(),
        language: form.language,
        notes: form.notes.trim(),
        status: 'new',
        at: Date.now(),
      } as Application);
      setDone(true);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <AuthShell title="Application received" note="Thank you. The school has your child’s details and will be in touch about the next steps." wide>
        <div className="apply-done">
          <p className="muted">You can close this page now. If you need to apply for another child, start a fresh form.</p>
          <div className="head-actions">
            <button
              className="pill ghost"
              onClick={() => {
                setForm(blankForm);
                setDone(false);
              }}
            >
              Apply for another child
            </button>
            <Link className="link" to="/">
              Back to Chalkvault
            </Link>
          </div>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Admission application" note="Tell us about your child and how to reach you. Every field marked with your child’s name and a way to contact you helps the school reply quickly." wide>
      <form className="auth-card" onSubmit={submit}>
        <div className="form-grid">
          <label className="field full">
            <span className="mono">Child’s full name</span>
            <input value={form.childName} onChange={(e) => set({ childName: e.target.value })} maxLength={119} autoComplete="off" required />
          </label>
          <label className="field">
            <span className="mono">Date of birth</span>
            <input type="date" value={form.dob} onChange={(e) => set({ dob: e.target.value })} />
          </label>
          <label className="field">
            <span className="mono">Gender</span>
            <select value={form.gender} onChange={(e) => set({ gender: e.target.value })}>
              <option value="">Prefer not to say</option>
              <option>Female</option>
              <option>Male</option>
            </select>
          </label>
          <label className="field">
            <span className="mono">Class applying for</span>
            <SuggestInput value={form.level} onChange={(v) => set({ level: v })} groups={levelGroups('Nigeria')} placeholder="e.g. JSS 1 or Primary 3" label="Class applying for" />
          </label>
          <label className="field">
            <span className="mono">Previous school</span>
            <input value={form.previousSchool} onChange={(e) => set({ previousSchool: e.target.value })} placeholder="If any" />
          </label>
          <label className="field">
            <span className="mono">Parent or guardian name</span>
            <input value={form.guardianName} onChange={(e) => set({ guardianName: e.target.value })} autoComplete="off" required />
          </label>
          <label className="field">
            <span className="mono">Reports read best in</span>
            <select value={form.language} onChange={(e) => set({ language: e.target.value })}>
              {LANGUAGE_OPTIONS.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="mono">Phone</span>
            <input type="tel" value={form.guardianPhone} onChange={(e) => set({ guardianPhone: e.target.value })} autoComplete="off" />
          </label>
          <label className="field">
            <span className="mono">Email</span>
            <input type="email" value={form.guardianEmail} onChange={(e) => set({ guardianEmail: e.target.value })} autoComplete="off" />
          </label>
          <label className="field full">
            <span className="mono">Anything the school should know</span>
            <textarea value={form.notes} onChange={(e) => set({ notes: e.target.value })} maxLength={1999} rows={4} placeholder="Allergies, support needs, or questions" />
          </label>
        </div>
        {error && <p className="form-error">{error}</p>}
        <button className="ticket" disabled={busy || !ready}>
          {busy ? 'Sending…' : 'Send application'}
        </button>
        <p className="muted small">The school keeps these details private and uses them only to consider your child’s admission.</p>
      </form>
    </AuthShell>
  );
}
