import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { displayName, useAuth } from '../auth/AuthProvider';
import { createSchool } from '../data/api';
import { COUNTRIES, COUNTRY_PRESETS } from '../school/presets';
import { useToast } from '../ui/toast';
import { AuthShell } from './AuthShell';
import type { SchoolPolicy } from '../data/types';

const armNames = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);

type Step = 0 | 1 | 2;

export function Start() {
  const { user, ready } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const [step, setStep] = useState<Step>(0);
  const [name, setName] = useState('');
  const [country, setCountry] = useState('Nigeria');
  const [term, setTerm] = useState(COUNTRY_PRESETS.Nigeria.term);
  const [levels, setLevels] = useState<string[]>(COUNTRY_PRESETS.Nigeria.levels);
  const [subjects, setSubjects] = useState<string>(COUNTRY_PRESETS.Nigeria.subjects.join('\n'));
  const [arms, setArms] = useState('A, B');
  const [attendanceBy, setAttendanceBy] = useState<SchoolPolicy['attendanceBy']>('form');
  const [formPer, setFormPer] = useState<SchoolPolicy['formClassesPerTeacher']>('one');
  const [busy, setBusy] = useState(false);

  if (!ready) return null;
  if (!user || user.isAnonymous) return <Navigate to="/login?next=/start" replace />;

  const pickCountry = (c: string) => {
    setCountry(c);
    const p = COUNTRY_PRESETS[c];
    setTerm(p.term);
    setLevels(p.levels);
    setSubjects(p.subjects.join('\n'));
  };

  const lines = (s: string) => s.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);

  const finish = async () => {
    setBusy(true);
    try {
      const armList = armNames(arms);
      const classList = levels.flatMap((level) => armList.map((arm) => ({ name: `${level}${arm.length <= 2 ? '' : ' '}${arm}`, level, arm, subject: '' })));
      const id = await createSchool(
        { uid: user.uid, name: displayName(user), email: user.email ?? '' },
        {
          name: name.trim(),
          country,
          termName: term.trim() || 'Term 1',
          levels,
          arms: armList,
          subjects: lines(subjects),
          classes: classList,
          policy: { attendanceBy, formClassesPerTeacher: formPer },
        },
      );
      nav(`/s/${id}`, { replace: true });
    } catch (e) {
      toast(`Couldn't create the school: ${(e as Error).message}`, 'error');
      setBusy(false);
    }
  };

  return (
    <AuthShell note={`Step ${step + 1} of 3`} title={['Name your school', 'Classes and subjects', 'Arms and school rules'][step]} wide>
      <div className="auth-card wizard">
        {step === 0 && (
          <>
            <label className="field">
              <span className="mono">School name</span>
              <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Greenfield Academy, Lekki" />
            </label>
            <label className="field">
              <span className="mono">Country</span>
              <select value={country} onChange={(e) => pickCountry(e.target.value)}>
                {COUNTRIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
              <small className="muted">Sets sensible class levels, term names and subjects. You can change all of them.</small>
            </label>
            <p className="muted small">
              You’ll be the school’s <b>owner</b>, signed in as {user.email}. You can invite teachers and other admins next.
            </p>
          </>
        )}

        {step === 1 && (
          <>
            <label className="field">
              <span className="mono">Current term</span>
              <input value={term} onChange={(e) => setTerm(e.target.value)} />
            </label>
            <div className="field">
              <span className="mono">Class levels</span>
              <div className="chips">
                {COUNTRY_PRESETS[country].levels.map((l) => {
                  const on = levels.includes(l);
                  return (
                    <button
                      key={l}
                      type="button"
                      className={`chip ${on ? 'on' : ''}`}
                      onClick={() => setLevels(on ? levels.filter((x) => x !== l) : COUNTRY_PRESETS[country].levels.filter((x) => x === l || levels.includes(x)))}
                    >
                      {l}
                    </button>
                  );
                })}
              </div>
            </div>
            <label className="field">
              <span className="mono">Subjects, one per line</span>
              <textarea className="ruled" rows={6} value={subjects} onChange={(e) => setSubjects(e.target.value)} />
            </label>
          </>
        )}

        {step === 2 && (
          <>
            <label className="field">
              <span className="mono">Arms in each class, separated by commas</span>
              <input value={arms} onChange={(e) => setArms(e.target.value)} placeholder="A, B, C or Gold, Diamond" autoFocus />
              <small className="muted">
                Creates {levels.length * armNames(arms).length} arms, such as {levels[0] ?? 'JSS 1'}
                {armNames(arms)[0] ?? 'A'} and {levels[0] ?? 'JSS 1'}
                {armNames(arms)[1] ?? 'B'}, each with all {lines(subjects).length} subjects. You can add or remove arms later.
              </small>
            </label>
            <label className="field">
              <span className="mono">Who takes attendance</span>
              <select value={attendanceBy} onChange={(e) => setAttendanceBy(e.target.value as SchoolPolicy['attendanceBy'])}>
                <option value="form">The form teacher, once a day</option>
                <option value="subject">Each subject teacher, every lesson</option>
                <option value="admin">Admins only</option>
              </select>
            </label>
            <label className="field">
              <span className="mono">A teacher can be form teacher of</span>
              <select value={formPer} onChange={(e) => setFormPer(e.target.value as SchoolPolicy['formClassesPerTeacher'])}>
                <option value="one">One arm only</option>
                <option value="many">More than one arm</option>
              </select>
              <small className="muted">You can change every rule later in Settings.</small>
            </label>
          </>
        )}

        <div className="wizard-actions">
          {step > 0 && (
            <button className="pill ghost" onClick={() => setStep((step - 1) as Step)} disabled={busy}>
              Back
            </button>
          )}
          <span className="spacer" />
          {step < 2 ? (
            <button className="ticket" disabled={step === 0 && !name.trim()} onClick={() => setStep((step + 1) as Step)}>
              Continue
            </button>
          ) : (
            <button className="ticket" onClick={finish} disabled={busy}>
              {busy ? 'Setting up…' : 'Open my school'}
            </button>
          )}
        </div>
      </div>
    </AuthShell>
  );
}
