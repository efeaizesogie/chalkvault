import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { blankStudent, mod, newPin, patchIn, saveStudent } from '../data/api';
import { useQuery } from '../data/hooks';
import type { Application, ClassRoom } from '../data/types';
import { friendlyError } from '../lib/errors';
import { useToast } from '../ui/toast';
import { useSchool } from '../school/SchoolContext';
import './admissions.css';
import { PrintExport } from '../components/PrintExport';

const STATUSES: { key: Application['status']; label: string }[] = [
  { key: 'new', label: 'New' },
  { key: 'reviewing', label: 'Reviewing' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'declined', label: 'Declined' },
];

export function AdmissionsPage() {
  const { schoolId, classes, isAdmin } = useSchool();
  const toast = useToast();
  const nav = useNavigate();
  const apps = useQuery<Application>(mod(schoolId, 'applications'), `applications:${schoolId}`);
  const [tab, setTab] = useState<Application['status']>('new');
  const [openId, setOpenId] = useState<string | null>(null);
  const [armFor, setArmFor] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const link = `${location.origin}${import.meta.env.BASE_URL}apply/${schoolId}`;
  const copyLink = async () => {
    await navigator.clipboard.writeText(link).catch(() => {});
    toast('Application link copied. Share it with parents by email or WhatsApp.');
  };

  const counts = useMemo(() => {
    const c: Record<Application['status'], number> = { new: 0, reviewing: 0, accepted: 0, declined: 0 };
    for (const a of apps.data) c[a.status] = (c[a.status] ?? 0) + 1;
    return c;
  }, [apps.data]);

  const list = useMemo(
    () => apps.data.filter((a) => a.status === tab).sort((a, b) => b.at - a.at),
    [apps.data, tab],
  );

  const defaultArm = (app: Application): ClassRoom | undefined => {
    const t = app.level.trim().toLowerCase();
    if (t) {
      const byLevel = classes.find((c) => c.level.toLowerCase() === t);
      if (byLevel) return byLevel;
      const byName = classes.find((c) => c.name.toLowerCase().includes(t) || t.includes(c.level.toLowerCase()));
      if (byName) return byName;
    }
    return classes[0];
  };

  const setStatus = async (app: Application, status: Application['status']) => {
    try {
      await patchIn(schoolId, 'applications', app.id, { status });
      toast(status === 'declined' ? 'Application declined.' : 'Moved to reviewing.');
    } catch (e) {
      toast(friendlyError(e), 'error');
    }
  };

  const enrol = async (app: Application) => {
    const armId = armFor[app.id] || defaultArm(app)?.id;
    const cls = classes.find((c) => c.id === armId);
    if (!cls) {
      toast('Add a class first, then enrol this child.', 'warn');
      return;
    }
    setBusy(true);
    try {
      const student = {
        ...blankStudent(cls.id, app.childName, 999),
        dob: app.dob,
        guardians: [{ name: app.guardianName, relationship: 'Parent', phone: app.guardianPhone, email: app.guardianEmail, language: app.language }],
        resultPin: newPin(),
      };
      await saveStudent(schoolId, student);
      await patchIn(schoolId, 'applications', app.id, { status: 'accepted' });
      toast(`${app.childName} enrolled in ${cls.name}. Opening the record.`);
      nav(`/s/${schoolId}/students/${student.id}`);
    } catch (e) {
      toast(friendlyError(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  if (!isAdmin) return <div className="ws-empty muted">Only admins can review admissions.</div>;

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1 className="display-sm">Admissions</h1>
          <p className="lede">Share one link with parents. Every application lands here for you to review and enrol.</p>
        </div>
        <PrintExport title="Admissions" />
      </header>

      <section className="panel wide">
        <h2 className="h3">Application link</h2>
        <p className="muted small">Parents open this link, fill the form and submit. No account needed.</p>
        <div className="app-link">
          <code>{link}</code>
          <button className="pill ghost" onClick={copyLink}>
            Copy link
          </button>
        </div>
      </section>

      <section className="panel wide">
        <div className="row-actions">
          <h2 className="h3">Applications</h2>
          <div className="chips">
            {STATUSES.map((s) => (
              <button key={s.key} className={`chip ${tab === s.key ? 'on' : ''}`} onClick={() => setTab(s.key)} aria-pressed={tab === s.key}>
                {s.label} {counts[s.key]}
              </button>
            ))}
          </div>
        </div>

        {apps.loading && <p className="muted small">Loading applications…</p>}
        {!apps.loading && list.length === 0 && <p className="muted small">No {STATUSES.find((s) => s.key === tab)?.label.toLowerCase()} applications.</p>}

        <ul className="incident-list">
          {list.map((app) => {
            const open = openId === app.id;
            const arm = defaultArm(app);
            return (
              <li key={app.id} className="incident-item">
                <div className="incident-top">
                  <div>
                    <b>{app.childName}</b>
                    <span className="incident-meta"> {app.level || 'No class given'}</span>
                  </div>
                  <button className="link" onClick={() => setOpenId(open ? null : app.id)} aria-expanded={open}>
                    {open ? 'Hide details' : 'View details'}
                  </button>
                </div>
                <p className="incident-meta">
                  {app.guardianName}
                  {app.guardianPhone ? `, ${app.guardianPhone}` : ''}
                  {app.at ? `, applied ${new Date(app.at).toLocaleDateString()}` : ''}
                </p>

                {open && (
                  <div className="app-detail">
                    <dl className="app-fields">
                      <dt>Date of birth</dt>
                      <dd>{app.dob ? new Date(app.dob).toLocaleDateString() : 'Not given'}</dd>
                      <dt>Gender</dt>
                      <dd>{app.gender || 'Not given'}</dd>
                      <dt>Previous school</dt>
                      <dd>{app.previousSchool || 'None'}</dd>
                      <dt>Email</dt>
                      <dd>{app.guardianEmail || 'Not given'}</dd>
                      <dt>Reports read best in</dt>
                      <dd>{app.language || 'English'}</dd>
                      {app.notes && (
                        <>
                          <dt>Notes</dt>
                          <dd>{app.notes}</dd>
                        </>
                      )}
                    </dl>

                    {app.status !== 'accepted' && (
                      <label className="field">
                        <span className="mono">Enrol into</span>
                        <select value={armFor[app.id] ?? arm?.id ?? ''} onChange={(e) => setArmFor((m) => ({ ...m, [app.id]: e.target.value }))}>
                          {classes.length === 0 && <option value="">No classes yet</option>}
                          {classes.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}

                    <div className="row-actions">
                      <div className="head-actions">
                        {app.status === 'new' && (
                          <button className="pill ghost" onClick={() => setStatus(app, 'reviewing')}>
                            Mark reviewing
                          </button>
                        )}
                        {app.status !== 'declined' && app.status !== 'accepted' && (
                          <button className="pill ghost" onClick={() => setStatus(app, 'declined')}>
                            Decline
                          </button>
                        )}
                        {app.status === 'declined' && (
                          <button className="pill ghost" onClick={() => setStatus(app, 'reviewing')}>
                            Reopen
                          </button>
                        )}
                      </div>
                      {app.status !== 'accepted' && (
                        <button className="ticket" onClick={() => enrol(app)} disabled={busy || classes.length === 0}>
                          Accept and enrol
                        </button>
                      )}
                      {app.status === 'accepted' && <span className="muted small">Enrolled.</span>}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
