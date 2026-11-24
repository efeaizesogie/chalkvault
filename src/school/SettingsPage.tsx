import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { addArm, addSubjectEverywhere, deleteClass, deleteOffering, deleteSchool, saveClass, updateSchool } from '../data/api';
import { CLASS_COLOURS, COLOUR_KEYS, type ClassRoom, type SchoolPolicy } from '../data/types';
import { COUNTRIES } from './presets';
import { assessmentsOf, bandsOf, parseAssessments, parseBands } from '../lib/results';
import { AddClassDialog } from '../components/AddClassDialog';
import { useAuth } from '../auth/AuthProvider';
import { useToast } from '../ui/toast';
import { useSchool } from './SchoolContext';
import { SessionTools } from './SessionTools';
import { TermPanel } from './TermPanel';

export function SettingsPage() {
  const { school, schoolId, classes, offerings, members, me, policy } = useSchool();
  const { signOut, user } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const [name, setName] = useState(school.name);
  const [country, setCountry] = useState(school.country);
  const [address, setAddress] = useState(school.address ?? '');
  const [motto, setMotto] = useState(school.motto ?? '');
  const [principal, setPrincipal] = useState(school.principalName ?? '');
  const [levels, setLevels] = useState(school.levels.join('\n'));
  const [newSubject, setNewSubject] = useState('');
  const [assess, setAssess] = useState(assessmentsOf(school).map((a) => `${a.label}, ${a.max}`).join('\n'));
  const [bands, setBands] = useState(bandsOf(school).map((b) => `${b.grade}, ${b.min}, ${b.remark}`).join('\n'));
  const [limit, setLimit] = useState(String(school.commentLimit ?? 600));
  const [rules, setRules] = useState<SchoolPolicy>(policy);
  const [editing, setEditing] = useState<ClassRoom | null>(null);
  const [addingArm, setAddingArm] = useState<Record<string, string>>({});
  const lines = (s: string) => s.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  const fail = (e: unknown) => toast((e as Error).message, 'error');

  const saveDetails = async () => {
    try {
      const assessments = parseAssessments(assess);
      const gradeBands = parseBands(bands);
      if (!assessments.length || !gradeBands.length) throw new Error('Add at least one assessment and one grade band.');
      await updateSchool(schoolId, {
        name: name.trim() || school.name,
        country,
        address: address.trim(),
        motto: motto.trim(),
        principalName: principal.trim(),
        levels: lines(levels),
        assessments,
        gradeBands,
        commentLimit: Math.max(100, Number(limit) || 600),
        policy: rules,
      });
      toast('Settings saved.');
    } catch (e) {
      fail(e);
    }
  };

  const addSubject = async () => {
    const s = newSubject.trim();
    if (!s) return;
    try {
      if (!school.subjects.includes(s)) await updateSchool(schoolId, { subjects: [...school.subjects, s] });
      await addSubjectEverywhere(schoolId, s, classes, offerings);
      setNewSubject('');
      toast(`${s} added to every arm.`);
    } catch (e) {
      fail(e);
    }
  };
  const removeSubject = async (s: string) => {
    if (!confirm(`Remove ${s} from every arm? Scores already entered stay on file but the subject disappears from score sheets and report cards.`)) return;
    try {
      for (const o of offerings.filter((x) => x.subject === s)) await deleteOffering(schoolId, o, members);
      await updateSchool(schoolId, { subjects: school.subjects.filter((x) => x !== s) });
    } catch (e) {
      fail(e);
    }
  };

  const rule = <K extends keyof SchoolPolicy>(k: K, v: SchoolPolicy[K]) => setRules((r) => ({ ...r, [k]: v }));
  const toggle = (k: keyof SchoolPolicy, label: string, hint: string) => (
    <label className="switch">
      <input type="checkbox" checked={rules[k] as boolean} onChange={(e) => rule(k, e.target.checked as never)} />
      <span>
        <b>{label}</b>
        <small>{hint}</small>
      </span>
    </label>
  );

  const levelList = lines(levels);

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1 className="display-sm">Settings</h1>
          <p className="lede">Every rule here is your school’s choice.</p>
        </div>
        <button className="ticket" onClick={saveDetails}>
          Save settings
        </button>
      </header>

      <div className="record-grid">
        <section className="panel">
          <h2 className="h3">How your school runs</h2>
          <label className="field">
            <span className="mono">Who takes attendance</span>
            <select value={rules.attendanceBy} onChange={(e) => rule('attendanceBy', e.target.value as SchoolPolicy['attendanceBy'])}>
              <option value="form">The form teacher, once a day</option>
              <option value="subject">Each subject teacher, every lesson</option>
              <option value="admin">Admins only</option>
            </select>
          </label>
          <label className="field">
            <span className="mono">A teacher can be form teacher of</span>
            <select value={rules.formClassesPerTeacher} onChange={(e) => rule('formClassesPerTeacher', e.target.value as SchoolPolicy['formClassesPerTeacher'])}>
              <option value="one">One arm only</option>
              <option value="many">More than one arm</option>
            </select>
          </label>
          {toggle('teachersManageStudents', 'Form teachers can add and edit students', 'Otherwise only admins manage the student list.')}
          {toggle('approvalRequired', 'Comments need approval before results are published', 'Admins approve and lock each form teacher’s comment.')}
          {toggle('subjectRemarks', 'Subject teachers write a remark per subject', 'Shown beside each subject on the report card.')}
          {toggle('showPositions', 'Show positions on report cards', 'Class position and position in each subject.')}
          {toggle('cloudCommentFallback', 'Cloud help for comments, with names removed', 'Used only when a teacher’s computer can’t run Gemini Nano.')}
          {toggle('cloudScanning', 'Read score-sheet photos in the cloud', 'A score sheet shows names, so this sends names to Google’s cloud. Leave off to read sheets on-device only.')}
          <h3 className="h4">Promotion rule for third term</h3>
          <div className="form-grid">
            <label className="field">
              <span className="mono">Pass mark for the cumulative average (%)</span>
              <input type="number" min={0} max={100} value={rules.passMark} onChange={(e) => rule('passMark', Number(e.target.value) || 0)} />
            </label>
            <label className="field">
              <span className="mono">Credit mark in key subjects (%)</span>
              <input type="number" min={0} max={100} value={rules.creditMark} onChange={(e) => rule('creditMark', Number(e.target.value) || 0)} />
            </label>
          </div>
          <label className="field">
            <span className="mono">Subjects that need a credit, separated by commas</span>
            <input value={rules.creditSubjects.join(', ')} onChange={(e) => rule('creditSubjects', e.target.value.split(',').map((x) => x.trim()).filter(Boolean))} placeholder="English Language, Mathematics" />
          </label>
        </section>

        <section className="panel">
          <h2 className="h3">School details</h2>
          <label className="field">
            <span className="mono">Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="field">
            <span className="mono">Address, shown on report cards</span>
            <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="12 Admiralty Way, Lekki, Lagos" />
          </label>
          <label className="field">
            <span className="mono">Motto</span>
            <input value={motto} onChange={(e) => setMotto(e.target.value)} />
          </label>
          <label className="field">
            <span className="mono">Principal or head teacher</span>
            <input value={principal} onChange={(e) => setPrincipal(e.target.value)} />
          </label>
          <label className="field">
            <span className="mono">Country</span>
            <select value={country} onChange={(e) => setCountry(e.target.value)}>
              {COUNTRIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
        </section>

        <section className="panel wide">
          <h2 className="h3">Classes and arms</h2>
          <div className="arm-grid">
            {levelList.map((level, li) => {
              const arms = classes.filter((c) => c.level === level);
              return (
                <div key={level} className="arm-row">
                  <span className="arm-level">{level}</span>
                  <div className="chips">
                    {arms.map((c) => (
                      <button key={c.id} className="chip" onClick={() => setEditing(c)} title="Edit arm">
                        <span className="swatch-dot" style={{ ['--c' as string]: CLASS_COLOURS[c.colour].bg }} aria-hidden />
                        {c.name}
                      </button>
                    ))}
                    <span className="arm-add">
                      <input
                        value={addingArm[level] ?? ''}
                        onChange={(e) => setAddingArm((x) => ({ ...x, [level]: e.target.value }))}
                        placeholder={school.arms?.[arms.length] ?? String.fromCharCode(65 + arms.length)}
                        aria-label={`New arm for ${level}`}
                      />
                      <button
                        className="link"
                        onClick={async () => {
                          const arm = (addingArm[level] || school.arms?.[arms.length] || String.fromCharCode(65 + arms.length)).trim();
                          await addArm(schoolId, level, arm, school.subjects, COLOUR_KEYS[(li + arms.length) % COLOUR_KEYS.length]).catch(fail);
                          setAddingArm((x) => ({ ...x, [level]: '' }));
                        }}
                      >
                        Add arm
                      </button>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
          <label className="field">
            <span className="mono">Class levels, one per line</span>
            <textarea className="ruled" rows={4} value={levels} onChange={(e) => setLevels(e.target.value)} />
          </label>
        </section>

        <section className="panel">
          <h2 className="h3">Subjects</h2>
          <p className="muted small">Each subject is taught in every arm unless you remove it from an arm on the class page.</p>
          <ul className="settings-classes">
            {school.subjects.map((s) => (
              <li key={s}>
                <span>{s}</span>
                <span className="mono muted">{offerings.filter((o) => o.subject === s).length} arms</span>
                <button className="link danger" onClick={() => removeSubject(s)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
          <div className="inline-add">
            <input value={newSubject} onChange={(e) => setNewSubject(e.target.value)} placeholder="e.g. Further Mathematics" />
            <button className="pill ink" onClick={addSubject} disabled={!newSubject.trim()}>
              Add subject
            </button>
          </div>
        </section>

        <TermPanel />

        <section className="panel">
          <h2 className="h3">Score sheet and grades</h2>
          <label className="field">
            <span className="mono">Score sheet columns: name, maximum score (one per line)</span>
            <textarea className="ruled" rows={4} value={assess} onChange={(e) => setAssess(e.target.value)} />
          </label>
          <label className="field">
            <span className="mono">Grade bands: grade, minimum %, remark (one per line)</span>
            <textarea className="ruled" rows={6} value={bands} onChange={(e) => setBands(e.target.value)} />
          </label>
          <label className="field">
            <span className="mono">Longest form teacher comment, in characters</span>
            <input inputMode="numeric" value={limit} onChange={(e) => setLimit(e.target.value)} />
          </label>
        </section>

        <SessionTools />

        <section className="panel wide danger-zone">
          <h2 className="h3">Your data</h2>
          <p className="muted small">
            Records are stored in this school’s private space in Firebase. Only staff you invite can open them, and each teacher sees only their own arms and
            subjects. The AI never receives a student’s name unless you switch on cloud reading of score sheets above.
          </p>
          {me.role === 'owner' && (
            <button
              className="pill ghost danger"
              onClick={async () => {
                const typed = prompt(`This permanently deletes ${school.name}: every class, student record, score and comment. Type the school name to confirm.`);
                if (typed?.trim() !== school.name) return;
                try {
                  await deleteSchool(schoolId, me.uid);
                  if (user?.isAnonymous) await signOut();
                  nav('/', { replace: true });
                } catch (e) {
                  fail(e);
                }
              }}
            >
              Delete this school and all its records
            </button>
          )}
        </section>
      </div>

      {editing && (
        <AddClassDialog
          initial={editing}
          usedColours={classes.map((c) => c.colour)}
          levels={school.levels}
          subjects={school.subjects}
          onSave={(c) =>
            saveClass(schoolId, c)
              .then(() => setEditing(null))
              .catch(fail)
          }
          onDelete={() => {
            if (!confirm(`Delete ${editing.name}? Only do this if the arm has no students.`)) return;
            Promise.all(offerings.filter((o) => o.classId === editing.id).map((o) => deleteOffering(schoolId, o, members)))
              .then(() => deleteClass(schoolId, editing.id))
              .then(() => setEditing(null))
              .catch(fail);
          }}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
