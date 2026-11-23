import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { addTerm, deleteSchool, saveClass, updateSchool } from '../data/api';
import { CLASS_COLOURS, type ClassRoom } from '../data/types';
import { COUNTRIES } from './presets';
import { assessmentsOf, bandsOf, parseAssessments, parseBands } from '../lib/results';
import { AddClassDialog } from '../components/AddClassDialog';
import { useAuth } from '../auth/AuthProvider';
import { useToast } from '../ui/toast';
import { useSchool } from './SchoolContext';

export function SettingsPage() {
  const { school, schoolId, terms, term, classes, me } = useSchool();
  const { signOut, user } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const [name, setName] = useState(school.name);
  const [country, setCountry] = useState(school.country);
  const [levels, setLevels] = useState(school.levels.join('\n'));
  const [subjects, setSubjects] = useState(school.subjects.join('\n'));
  const [newTerm, setNewTerm] = useState('');
  const [assess, setAssess] = useState(assessmentsOf(school).map((a) => `${a.label}, ${a.max}`).join('\n'));
  const [bands, setBands] = useState(bandsOf(school).map((b) => `${b.grade}, ${b.min}, ${b.remark}`).join('\n'));
  const [limit, setLimit] = useState(String(school.commentLimit ?? 600));
  const [editing, setEditing] = useState<ClassRoom | 'new' | null>(null);
  const lines = (s: string) => s.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);

  const saveDetails = async () => {
    try {
      const assessments = parseAssessments(assess);
      const gradeBands = parseBands(bands);
      if (!assessments.length || !gradeBands.length) throw new Error('Add at least one assessment and one grade band.');
      await updateSchool(schoolId, {
        name: name.trim() || school.name,
        country,
        levels: lines(levels),
        subjects: lines(subjects),
        assessments,
        gradeBands,
        commentLimit: Math.max(100, Number(limit) || 600),
      });
      toast('School details saved.');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const startTerm = async () => {
    if (!newTerm.trim()) return;
    const id = await addTerm(schoolId, newTerm.trim(), terms.length + 1);
    await updateSchool(schoolId, { currentTermId: id });
    setNewTerm('');
    toast(`${newTerm.trim()} is now the current term. Earlier terms’ comments are kept on each student's record.`);
  };

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1 className="display-sm">Settings</h1>
          <p className="lede">{school.name}</p>
        </div>
        <button className="ticket" onClick={saveDetails}>
          Save details
        </button>
      </header>

      <div className="record-grid">
        <section className="panel">
          <h2 className="h3">School</h2>
          <label className="field">
            <span className="mono">Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="field">
            <span className="mono">Country</span>
            <select value={country} onChange={(e) => setCountry(e.target.value)}>
              {COUNTRIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="mono">Class levels, one per line</span>
            <textarea className="ruled" rows={6} value={levels} onChange={(e) => setLevels(e.target.value)} />
          </label>
          <label className="field">
            <span className="mono">Subjects, one per line</span>
            <textarea className="ruled" rows={6} value={subjects} onChange={(e) => setSubjects(e.target.value)} />
          </label>
        </section>

        <section className="panel">
          <h2 className="h3">Terms</h2>
          <ol className="term-list">
            {terms.map((t) => (
              <li key={t.id}>
                <span>{t.name}</span>
                {t.id === term?.id ? (
                  <span className="mono final-tag">Current</span>
                ) : (
                  <button className="link" onClick={() => updateSchool(schoolId, { currentTermId: t.id })}>
                    Make current
                  </button>
                )}
              </li>
            ))}
          </ol>
          <div className="inline-add">
            <input value={newTerm} onChange={(e) => setNewTerm(e.target.value)} placeholder="e.g. Second term" />
            <button className="pill ink" onClick={startTerm} disabled={!newTerm.trim()}>
              Start new term
            </button>
          </div>

          <div className="panel-head">
            <h2 className="h3">Classes</h2>
            <button className="link" onClick={() => setEditing('new')}>
              + Add class
            </button>
          </div>
          <ul className="settings-classes">
            {classes.map((c) => (
              <li key={c.id}>
                <i className="swatch-dot" style={{ ['--c' as string]: CLASS_COLOURS[c.colour].bg }} />
                <span>{c.name}</span>
                <span className="mono muted">{c.level}</span>
                <button className="link" onClick={() => setEditing(c)}>
                  Edit
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel">
          <h2 className="h3">Scores and grades</h2>
          <label className="field">
            <span className="mono">Assessments: name, maximum score (one per line)</span>
            <textarea className="ruled" rows={4} value={assess} onChange={(e) => setAssess(e.target.value)} />
          </label>
          <label className="field">
            <span className="mono">Grade bands: grade, minimum %, remark (one per line)</span>
            <textarea className="ruled" rows={6} value={bands} onChange={(e) => setBands(e.target.value)} />
          </label>
        </section>

        <section className="panel">
          <h2 className="h3">Report comments</h2>
          <label className="field">
            <span className="mono">Longest comment allowed, in characters</span>
            <input inputMode="numeric" value={limit} onChange={(e) => setLimit(e.target.value)} />
          </label>
          <p className="muted small">Teachers see a live count. A comment over the limit can’t be sent for approval.</p>
        </section>

        <section className="panel wide danger-zone">
          <h2 className="h3">Your data</h2>
          <p className="muted small">
            Records are stored in this school’s private space in Firebase. Only staff you invite can open them, and teachers only see their own classes. The AI never
            receives a student’s name.
          </p>
          {me.role === 'owner' && (
            <button
              className="pill ghost danger"
              onClick={async () => {
                const typed = prompt(`This permanently deletes ${school.name}: every class, student record, note and comment. Type the school name to confirm.`);
                if (typed?.trim() !== school.name) return;
                try {
                  await deleteSchool(schoolId, me.uid);
                  if (user?.isAnonymous) await signOut();
                  nav('/', { replace: true });
                } catch (e) {
                  toast((e as Error).message, 'error');
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
          initial={editing === 'new' ? null : editing}
          usedColours={classes.map((c) => c.colour)}
          levels={school.levels}
          subjects={school.subjects}
          onSave={(c) => saveClass(schoolId, c).then(() => setEditing(null))}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
