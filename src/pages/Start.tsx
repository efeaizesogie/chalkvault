import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { displayName, useAuth } from '../auth/AuthProvider';
import { createSchool } from '../data/api';
import { COUNTRIES, COUNTRY_PRESETS } from '../school/presets';
import { useToast } from '../ui/toast';
import { AuthShell } from './AuthShell';

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
  const [classes, setClasses] = useState<string>('');
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
      const classList = lines(classes).map((n) => {
        const level = levels.find((l) => n.toLowerCase().startsWith(l.toLowerCase())) ?? levels[0] ?? '';
        return { name: n, level, subject: '' };
      });
      const id = await createSchool(
        { uid: user.uid, name: displayName(user), email: user.email ?? '' },
        { name: name.trim(), country, termName: term.trim() || 'Term 1', levels, subjects: lines(subjects), classes: classList },
      );
      nav(`/s/${id}`, { replace: true });
    } catch (e) {
      toast(`Couldn't create the school: ${(e as Error).message}`, 'error');
      setBusy(false);
    }
  };

  return (
    <AuthShell note={`Step ${step + 1} of 3`} title={['Name your school', 'Set up your school year', 'Add your first classes'][step]} wide>
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
              <span className="mono">Class names, one per line (optional)</span>
              <textarea
                className="ruled"
                rows={6}
                value={classes}
                onChange={(e) => setClasses(e.target.value)}
                placeholder={`${levels[0] ?? 'Year 1'} A\n${levels[0] ?? 'Year 1'} B\n${levels[1] ?? 'Year 2'} A`}
                autoFocus
              />
              <small className="muted">You can add students to each class once you’re in.</small>
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
