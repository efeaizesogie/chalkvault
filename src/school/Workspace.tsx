import { useCallback, useEffect, useState } from 'react';
import { Link, NavLink, Navigate, Outlet, useNavigate, useParams } from 'react-router-dom';
import { query, where } from 'firebase/firestore';
import { useAuth } from '../auth/AuthProvider';
import { addLedger, ledgerQuery, paths, updateSchool } from '../data/api';
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
          <AuthShell eyebrow="No access" title="You’re not a member of this school.">
            <div className="auth-card">
              <p className="muted">Ask the school's owner for an invite link, or pick another school.</p>
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
  const { school, schoolId, me, isAdmin, myClasses, terms, term } = useSchool();
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
      <header className="masthead">
        <div className="brand">
          <Link to={`/s/${schoolId}`} className="wordmark">
            Chalkvault
          </Link>
          <span className="school-badge">{school.name}</span>
          {isAdmin && terms.length > 1 ? (
            <select
              className="term-select mono"
              value={term?.id ?? ''}
              onChange={(e) => updateSchool(schoolId, { currentTermId: e.target.value }).catch((err) => toast((err as Error).message, 'error'))}
              aria-label="Current term"
            >
              {terms.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
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

      {school.demo && (
        <div className="demo-banner">
          <span className="mono">Demo school</span> Students and notes are made up. Everything you do here is private to this browser.{' '}
          <Link to="/start">Register your real school →</Link>
        </div>
      )}

      <div className="shell">
        <nav className="side" aria-label="School">
          <NavLink end to={`/s/${schoolId}`} className="side-link">
            Overview
          </NavLink>
          <div className="side-head mono">{isAdmin ? 'Classes' : 'My classes'}</div>
          {myClasses.map((c) => {
            const col = CLASS_COLOURS[c.colour];
            return (
              <NavLink key={c.id} to={`/s/${schoolId}/classes/${c.id}`} className="side-class" style={{ ['--c' as string]: col.bg }}>
                <i className="swatch-dot" />
                {c.name}
              </NavLink>
            );
          })}
          {myClasses.length === 0 && <p className="side-empty muted small">{isAdmin ? 'No classes yet.' : 'No classes assigned to you yet.'}</p>}
          <div className="side-head mono">School</div>
          <NavLink to={`/s/${schoolId}/students`} className="side-link">
            Students
          </NavLink>
          {isAdmin && (
            <>
              <NavLink to={`/s/${schoolId}/staff`} className="side-link">
                Staff
              </NavLink>
              <NavLink to={`/s/${schoolId}/settings`} className="side-link">
                Settings
              </NavLink>
            </>
          )}
        </nav>
        <main className="ws-main">
          <Outlet context={ctx} />
        </main>
      </div>

      {showLedger && <Ledger entries={entries} onClose={() => setShowLedger(false)} />}
    </div>
  );
}
