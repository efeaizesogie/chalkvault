import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { displayName, useAuth } from '../auth/AuthProvider';
import { createSchool } from '../data/api';
import { COUNTRIES, COUNTRY_PRESETS } from '../school/presets';
import { ARM_GROUPS, levelGroups, subjectGroups } from '../school/catalog';
import { ChipPicker } from '../components/Pickers';
import { useToast } from '../ui/toast';
import { AuthShell } from './AuthShell';
import type { SchoolPolicy } from '../data/types';

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
  const [subjects, setSubjects] = useState<string[]>(COUNTRY_PRESETS.Nigeria.subjects);
  const [armList, setArmList] = useState<string[]>(['A', 'B']);
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
    setSubjects(p.subjects);
  };

  const finish = async () => {
    setBusy(true);
    try {
      const classList = levels.flatMap((level) => armList.map((arm) => ({ name: `${level}${arm.length <= 2 ? '' : ' '}${arm}`, level, arm, subject: '' })));
      const id = await createSchool(
        { uid: user.uid, name: displayName(user), email: user.email ?? '' },
        {
          name: name.trim(),
          country,
          termName: term.trim() || 'Term 1',
          levels,
          arms: armList,
          subjects,
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
              <span className="mono">Class levels you run ({levels.length})</span>
              <ChipPicker label="Class levels" value={levels} onChange={setLevels} groups={levelGroups(country)} ordered placeholder="Search levels, or type your own (e.g. Year 7)" />
            </div>
            <div className="field">
              <span className="mono">Subjects you teach ({subjects.length})</span>
              <ChipPicker label="Subjects" value={subjects} onChange={setSubjects} groups={subjectGroups(country)} placeholder="Search subjects, e.g. Physics, or type your own" />
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div className="field">
              <span className="mono">Arms in each class ({armList.length})</span>
              <ChipPicker label="Arms" value={armList} onChange={setArmList} groups={ARM_GROUPS} placeholder="Search arm names, or type your own" />
              <small className="muted">
                Creates {levels.length * armList.length} arms, such as {levels[0] ?? 'JSS 1'}
                {armList[0] ?? 'A'}
                {armList[1] ? ` and ${levels[0] ?? 'JSS 1'}${armList[1].length <= 2 ? '' : ' '}${armList[1]}` : ''}, each with all {subjects.length} subjects. You can add or remove arms later.
              </small>
            </div>
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
            <button className="ticket" disabled={(step === 0 && !name.trim()) || (step === 1 && (!levels.length || !subjects.length))} onClick={() => setStep((step + 1) as Step)}>
              Continue
            </button>
          ) : (
            <button className="ticket" onClick={finish} disabled={busy || !armList.length}>
              {busy ? 'Setting up…' : 'Open my school'}
            </button>
          )}
        </div>
      </div>
    </AuthShell>
  );
}
