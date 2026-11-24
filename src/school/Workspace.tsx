import { useCallback, useEffect, useRef, useState } from 'react';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { setLetterhead } from '../lib/print';
import { Link, NavLink, Navigate, Outlet, useNavigate, useParams } from 'react-router-dom';
import { query, where } from 'firebase/firestore';
import { useAuth } from '../auth/AuthProvider';
import { addLedger, ledgerQuery, paths } from '../data/api';
import { useQuery } from '../data/hooks';
import { CLASS_COLOURS, type LedgerEntry } from '../data/types';
import { deviceStatus, type DeviceStatus } from '../lib/ai';
import { DeviceChip } from '../components/DeviceChip';
import { Ledger } from '../components/Ledger';
import { usePrefs, type Prefs } from '../ui/prefs';
import { useToast } from '../ui/toast';
import { SchoolProvider, useSchool } from './SchoolContext';
import { AuthShell } from '../pages/AuthShell';

export interface WorkspaceCtx {
  device: DeviceStatus;
  refreshDevice: () => void;
  prefs: Prefs;
  setPrefs: (p: Partial<Prefs>) => void;
  log: (e: Omit<LedgerEntry, 'id' | 'at' | 'uid'>) => Promise<void>;
}

export function Workspace() {
  const { schoolId = '' } = useParams();
  const { user, ready } = useAuth();
  if (!ready) return null;
  if (!user) return <Navigate to={`/login?next=/s/${schoolId}`} replace />;
  return (
    <SchoolProvider
      schoolId={schoolId}
      fallback={(s) =>
        s === 'loading' ? (
          <div className="boot">Opening your school…</div>
        ) : (
          <AuthShell title="You’re not a member of this school.">
            <div className="auth-card">
              <p className="muted">Ask the school’s owner for an invite link, or pick another school.</p>
              <Link to="/schools" className="ticket">
                My schools
              </Link>
            </div>
          </AuthShell>
        )
      }
    >
      <Frame />
    </SchoolProvider>
  );
}

function Frame() {
  // The masthead sticks to the top; the side menu and the student desk stick just below it, whatever its height.
  const mastRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = mastRef.current;
    if (!el) return;
    const set = () => document.documentElement.style.setProperty('--mast-h', `${Math.round(el.getBoundingClientRect().height)}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const { school, schoolId, me, isAdmin, terms, term, currentTerm, viewingPast, termClosed, setViewTerm, formClasses, myOfferings, classes } = useSchool();
  // Everything printed from this school carries its letterhead.
  useEffect(() => {
    setLetterhead({ name: school.name, address: school.address, motto: school.motto, phone: school.phone, email: school.email, logo: school.logo });
    return () => setLetterhead(null);
  }, [school.name, school.address, school.motto, school.phone, school.email, school.logo]);
  const { user, signOut } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const [device, setDevice] = useState<DeviceStatus>('no-api');
  const [prefs, setPrefs] = usePrefs();
  const [showLedger, setShowLedger] = useState(false);
  const [menu, setMenu] = useState(false);

  const refreshDevice = useCallback(() => {
    deviceStatus().then(setDevice);
  }, []);
  useEffect(() => {
    refreshDevice();
    const t = setInterval(refreshDevice, 15000);
    return () => clearInterval(t);
  }, [refreshDevice]);

  const ledger = useQuery<LedgerEntry>(
    isAdmin ? ledgerQuery(schoolId) : query(paths.ledger(schoolId), where('uid', '==', me.uid)),
    `ledger:${schoolId}:${isAdmin}:${me.uid}`,
  );
  const entries = isAdmin ? ledger.data : [...ledger.data].sort((a, b) => b.at - a.at);

  const log = useCallback(
    async (e: Omit<LedgerEntry, 'id' | 'at' | 'uid'>) => {
      await addLedger(schoolId, { ...e, uid: me.uid });
    },
    [schoolId, me.uid],
  );

  const ctx: WorkspaceCtx = { device, refreshDevice, prefs, setPrefs, log };

  return (
    <div className="app ws">
      <header className="masthead" ref={mastRef}>
        <div className="brand">
          <Link to={`/s/${schoolId}`} className="wordmark">
            Chalkvault
          </Link>
          <span className="school-badge">{school.name}</span>
          {terms.length > 1 ? (
            <select
              className="term-select mono"
              value={term?.id ?? ''}
              onChange={(e) => setViewTerm(e.target.value === currentTerm?.id ? null : e.target.value)}
              aria-label="Term you are looking at"
            >
              {[...terms].reverse().map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {t.session ? `, ${t.session}` : ''}
                  {t.id === currentTerm?.id ? ' (current)' : t.status === 'closed' ? ' (closed)' : ''}
                </option>
              ))}
            </select>
          ) : (
            <span className="mono tagline">{term?.name}</span>
          )}
        </div>
        <div className="masthead-actions">
          <DeviceChip status={device} allowCloud={prefs.allowCloudFallback} onToggleCloud={(v) => setPrefs({ allowCloudFallback: v })} onRefresh={refreshDevice} toast={toast} />
          <button className="pill ghost" onClick={() => setShowLedger(true)}>
            Ledger <span className="mono count">{entries.length}</span>
          </button>
          <div className="menu-wrap">
            <button className="avatar" onClick={() => setMenu((m) => !m)} aria-label="Account menu">
              {(me.name || 'T').slice(0, 1).toUpperCase()}
            </button>
            {menu && (
              <div className="menu" onMouseLeave={() => setMenu(false)}>
                <p className="menu-head">
                  <b>{me.name}</b>
                  <span className="mono muted">{me.role}</span>
                  {user?.email && <span className="muted small">{user.email}</span>}
                </p>
                <button onClick={() => nav('/schools')}>Switch school</button>
                <button
                  onClick={async () => {
                    await signOut();
                    nav('/');
                  }}
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {viewingPast && (
        <div className="past-banner">
          You’re looking at {term?.name}
          {term?.session ? `, ${term.session}` : ''}
          {termClosed ? '. It’s closed, so nothing can be changed.' : '. Changes you make apply to that term.'}{' '}
          <button className="link" onClick={() => setViewTerm(null)}>
            Back to {currentTerm?.name}
          </button>
        </div>
      )}
      {school.demo && (
        <div className="demo-banner">
          <span className="mono">Demo school</span> Students and notes are made up. Everything you do here is private to this browser.{' '}
          <Link to="/start">Register your real school</Link>
        </div>
      )}

      <div className="shell">
        <nav className="side" aria-label="School">
          <NavLink end to={`/s/${schoolId}`} className="side-link">
            Overview
          </NavLink>
          <NavLink to={`/s/${schoolId}/ask`} className="side-link side-ask">
            Ask Chalkvault
          </NavLink>
          {isAdmin && (
            <NavLink to={`/s/${schoolId}/classes`} end className="side-link">
              Classes
            </NavLink>
          )}
          {formClasses.length > 0 && <div className="side-head mono">{formClasses.length > 1 ? 'My form classes' : 'My form class'}</div>}
          {formClasses.map((c) => (
            <NavLink key={c.id} to={`/s/${schoolId}/classes/${c.id}`} className="side-class" style={{ ['--c' as string]: CLASS_COLOURS[c.colour].bg }}>
              <span className="swatch-dot" aria-hidden />
              {c.name}
            </NavLink>
          ))}
          {!isAdmin && (
            <>
              <div className="side-head mono">My subjects</div>
              {myOfferings.map((o) => (
                <NavLink key={o.id} to={`/s/${schoolId}/subjects/${o.id}`} className="side-link side-subject">
                  {o.subject}
                  <span className="muted small">{classes.find((c) => c.id === o.classId)?.name}</span>
                </NavLink>
              ))}
              {myOfferings.length === 0 && formClasses.length === 0 && <p className="side-empty muted small">Nothing assigned to you yet.</p>}
            </>
          )}
          {me.role !== 'bursar' && (
            <>
              <div className="side-head mono">Teaching</div>
              <NavLink to={`/s/${schoolId}/lessons`} className="side-link">
                Lesson notes and quizzes
              </NavLink>
              <NavLink to={`/s/${schoolId}/timetable`} className="side-link">
                Timetable
              </NavLink>
            </>
          )}
          <div className="side-head mono">School</div>
          <NavLink to={`/s/${schoolId}/students`} className="side-link">
            Students
          </NavLink>
          {isAdmin && (
            <>
              <NavLink to={`/s/${schoolId}/results`} className="side-link">
                Results
              </NavLink>
              <NavLink to={`/s/${schoolId}/admissions`} className="side-link">
                Admissions
              </NavLink>
            </>
          )}
          {(isAdmin || me.role === 'bursar') && (
            <NavLink to={`/s/${schoolId}/fees`} className="side-link">
              Fees
            </NavLink>
          )}
          <NavLink to={`/s/${schoolId}/messages`} className="side-link">
            Messages to parents
          </NavLink>
          <NavLink to={`/s/${schoolId}/notices`} className="side-link">
            Notices
          </NavLink>
          <div className="side-head mono">Running the school</div>
          {isAdmin && (
            <NavLink to={`/s/${schoolId}/staff`} className="side-link">
              Staff
            </NavLink>
          )}
          <NavLink to={`/s/${schoolId}/leave`} className="side-link">
            Leave
          </NavLink>
          <NavLink to={`/s/${schoolId}/library`} className="side-link">
            Library
          </NavLink>
          <NavLink to={`/s/${schoolId}/transport`} className="side-link">
            Transport
          </NavLink>
          <NavLink to={`/s/${schoolId}/inventory`} className="side-link">
            Inventory
          </NavLink>
          {isAdmin && (
            <>
              <NavLink to={`/s/${schoolId}/alumni`} className="side-link">
                Alumni
              </NavLink>
              <NavLink to={`/s/${schoolId}/import`} className="side-link">
                Bring in records
              </NavLink>
              <NavLink to={`/s/${schoolId}/settings`} className="side-link">
                Settings
              </NavLink>
            </>
          )}
        </nav>
        <main className="ws-main">
          <ErrorBoundary resetKey={location.pathname}>
            <Outlet context={ctx} />
          </ErrorBoundary>
        </main>
      </div>

      {showLedger && <Ledger entries={entries} onClose={() => setShowLedger(false)} />}
    </div>
  );
}
