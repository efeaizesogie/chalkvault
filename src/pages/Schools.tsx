import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { getUserSchools } from '../data/api';
import type { UserSchools } from '../data/types';
import { AuthShell } from './AuthShell';

export function Schools() {
  const { user, ready, signOut } = useAuth();
  const [list, setList] = useState<UserSchools | null>(null);

  useEffect(() => {
    if (user) getUserSchools(user.uid).then(setList).catch(() => setList({ schools: {} }));
  }, [user]);

  if (!ready) return null;
  if (!user) return <Navigate to="/login" replace />;
  const entries = Object.entries(list?.schools ?? {});
  if (list && entries.length === 1) return <Navigate to={`/s/${entries[0][0]}`} replace />;

  return (
    <AuthShell note={user.email ? `Signed in as ${user.email}` : undefined} title={entries.length ? 'Choose a school.' : 'You’re not in a school yet.'}>
      <div className="auth-card">
        {!list && <p className="muted">Loading your schools…</p>}
        {entries.length > 0 && (
          <ul className="school-list">
            {entries.map(([id, s]) => (
              <li key={id}>
                <Link to={`/s/${id}`} className="school-row">
                  <span className="school-name">{s.name}</span>
                  <span className="mono muted">{s.role}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {list && entries.length === 0 && (
          <p className="muted">
            Ask your head teacher for an invite link, or register your own school.
          </p>
        )}
        <div className="wizard-actions">
          <button className="link" onClick={signOut}>
            Sign out
          </button>
          <span className="spacer" />
          <Link to="/start" className="ticket">
            Register a school
          </Link>
        </div>
      </div>
    </AuthShell>
  );
}
