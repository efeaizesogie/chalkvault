import { useMemo, useState } from 'react';
import { paths } from '../data/api';
import { useQuery } from '../data/hooks';
import type { StudentProfile } from '../data/types';
import { useSchool } from '../school/SchoolContext';
import './ops.css';

export function AlumniPage() {
  const { schoolId, isAdmin } = useSchool();
  // Only admins can read the whole student roster, which is where alumni live.
  const students = useQuery<StudentProfile>(isAdmin ? paths.students(schoolId) : null, `alumni:${schoolId}:${isAdmin}`);
  const [find, setFind] = useState('');

  const groups = useMemo(() => {
    const q = find.trim().toLowerCase();
    const alumni = students.data
      .filter((s) => s.status === 'alumni')
      .filter((s) => !q || s.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
    const by: Record<string, StudentProfile[]> = {};
    for (const s of alumni) {
      const key = s.graduatedSession || 'Session not recorded';
      (by[key] ??= []).push(s);
    }
    return Object.entries(by).sort((a, b) => b[0].localeCompare(a[0]));
  }, [students.data, find]);

  if (!isAdmin) {
    return (
      <div className="page">
        <header className="page-head">
          <div>
            <h1 className="display-sm">Alumni</h1>
            <p className="lede">Graduated students and their guardian contacts.</p>
          </div>
        </header>
        <section className="panel wide">
          <p className="muted">Only admins can see the alumni list.</p>
        </section>
      </div>
    );
  }

  const total = students.data.filter((s) => s.status === 'alumni').length;

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1 className="display-sm">Alumni</h1>
          <p className="lede">Graduated students and their guardian contacts.</p>
        </div>
        {total > 0 && (
          <label className="field search">
            <span className="mono">Find an old student</span>
            <input value={find} onChange={(e) => setFind(e.target.value)} placeholder="Name" />
          </label>
        )}
      </header>

      {total === 0 ? (
        <section className="panel wide">
          <h2 className="h3">No alumni yet</h2>
          <p className="muted">
            Students become alumni when the final class is promoted at the end of a session. You can run that end-of-session promotion in Settings.
          </p>
        </section>
      ) : groups.length === 0 ? (
        <p className="muted">No alumni match your search.</p>
      ) : (
        groups.map(([session, list]) => (
          <section className="panel wide ops-group" key={session}>
            <div className="panel-head">
              <h2 className="h3">{session}</h2>
              <span className="mono muted">{list.length} students</span>
            </div>
            <ul className="ops-riders">
              {list.map((s) => {
                const g = s.guardians[0];
                return (
                  <li key={s.id}>
                    <span>
                      {s.name}
                      {s.admissionNo ? <span className="muted small"> ({s.admissionNo})</span> : null}
                    </span>
                    <span className="muted">{g ? `${g.name || 'Guardian'}, ${g.phone || g.email || 'no contact'}` : 'No guardian on file'}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
