import { useState } from 'react';
import { createInvite, paths, removeMember, revokeInvite, setTeaching, updateMember } from '../data/api';
import { useQuery } from '../data/hooks';
import { CLASS_COLOURS, type Invite, type Member, type Offering, type Role } from '../data/types';
import { friendlyError } from '../lib/errors';
import { useToast } from '../ui/toast';
import { useSchool } from './SchoolContext';
import { PrintExport } from '../components/PrintExport';

export function StaffPage() {
  const { schoolId, school, members, classes, offerings, me, policy } = useSchool();
  const toast = useToast();
  const invites = useQuery<Invite>(paths.invites(schoolId), `invites:${schoolId}`);
  const [role, setRole] = useState<Invite['role']>('teacher');
  const [label, setLabel] = useState('');
  const [formIds, setFormIds] = useState<string[]>([]);
  const [offIds, setOffIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [openUid, setOpenUid] = useState<string | null>(null);
  const one = policy.formClassesPerTeacher === 'one';

  const link = (code: string) => new URL(`${import.meta.env.BASE_URL}join/${schoolId}/${code}`, location.origin).toString();
  const copy = async (code: string) => {
    await navigator.clipboard.writeText(link(code)).catch(() => {});
    toast('Invite link copied. Send it to your teacher by email or WhatsApp.');
  };
  const fail = (e: unknown) => toast(friendlyError(e), 'error');

  const create = async () => {
    setBusy(true);
    try {
      const code = await createInvite(schoolId, me.uid, role, formIds, label.trim() || (role === 'admin' ? 'Admin invite' : 'Teacher invite'), offerings.filter((o) => offIds.includes(o.id)));
      await copy(code);
      setLabel('');
      setFormIds([]);
      setOffIds([]);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const setForm = async (m: Member, classId: string, on: boolean) => {
    const next = on ? (one ? [classId] : [...new Set([...m.classIds, classId])]) : m.classIds.filter((x) => x !== classId);
    await updateMember(schoolId, m.uid, { classIds: next }).catch(fail);
  };
  const toggleSubject = (m: Member, o: Offering) => setTeaching(schoolId, m, o, !(m.offeringIds ?? []).includes(o.id), offerings).catch(fail);

  const rank = (r: string) => ['owner', 'admin', 'teacher', 'bursar'].indexOf(r);
  const sorted = [...members].sort((a, b) => rank(a.role) - rank(b.role) || a.name.localeCompare(b.name));

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1 className="display-sm">Staff</h1>
          <p className="lede">
            Form teachers see their arm’s students, register and report cards. Subject teachers see only their subjects. {one ? 'Your school allows one form class per teacher.' : 'Your school allows several form classes per teacher.'}
          </p>
        </div>
        <PrintExport
          title="Staff list"
          rows={() => [
            ['Name', 'Role', 'Email', 'Form class', 'Subjects taught'],
            ...sorted.map((m) => [
              m.name,
              m.role,
              m.email,
              classes.filter((c) => m.classIds.includes(c.id)).map((c) => c.name).join(', '),
              offerings
                .filter((o) => (m.offeringIds ?? []).includes(o.id))
                .map((o) => `${o.subject} (${classes.find((c) => c.id === o.classId)?.name ?? ''})`)
                .join('; '),
            ]),
          ]}
        />
      </header>

      <section className="panel">
        <h2 className="h3">Invite someone</h2>
        <div className="form-grid">
          <label className="field">
            <span className="mono">Role</span>
            <select value={role} onChange={(e) => setRole(e.target.value as Invite['role'])}>
              <option value="teacher">Teacher</option>
              <option value="bursar">Bursar (fees only)</option>
              <option value="admin">Admin (sees everything)</option>
            </select>
          </label>
          <label className="field">
            <span className="mono">Who it’s for (a label only you see)</span>
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Mrs Ade, Mathematics" />
          </label>
        </div>
        {role === 'teacher' && (
          <>
            <div className="field">
              <span className="mono">Form teacher of</span>
              <ArmChips selected={formIds} onToggle={(id) => setFormIds((x) => (x.includes(id) ? x.filter((y) => y !== id) : one ? [id] : [...x, id]))} />
            </div>
            <div className="field">
              <span className="mono">Subjects they teach</span>
              <SubjectPicker selected={offIds} onToggle={(o) => setOffIds((x) => (x.includes(o.id) ? x.filter((y) => y !== o.id) : [...x, o.id]))} />
            </div>
          </>
        )}
        <div className="row-actions">
          <span className="muted small">You’ll get a private link to send. Whoever opens it and signs in joins with exactly these assignments.</span>
          <button className="ticket" onClick={create} disabled={busy}>
            Create invite link
          </button>
        </div>
        {invites.data.length > 0 && (
          <ul className="invite-list">
            {invites.data.map((i) => (
              <li key={i.code}>
                <span>
                  <b>{i.label}</b> <span className="muted">{i.role}</span>
                </span>
                <span className="spacer" />
                <button className="link" onClick={() => copy(i.code)}>
                  Copy link
                </button>
                <button className="link danger" onClick={() => revokeInvite(schoolId, i.code)}>
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel staff-panel">
        <h2 className="h3">Staff ({members.length})</h2>
        <ol className="staff-list">
          {sorted.map((m) => {
            const forms = classes.filter((c) => m.classIds.includes(c.id)).map((c) => c.name);
            const subs = offerings.filter((o) => (m.offeringIds ?? []).includes(o.id));
            const open = openUid === m.uid;
            return (
              <li key={m.uid} className="staff-block">
                <div className="staff-row">
                  <div className="staff-who">
                    <b>{m.name}</b>
                    <span className="muted small">{m.email || 'No email'}</span>
                  </div>
                  {m.role === 'owner' ? (
                    <span className="mono">Owner</span>
                  ) : (
                    <select value={m.role} onChange={(e) => updateMember(schoolId, m.uid, { role: e.target.value as Role }).catch(fail)}>
                      <option value="teacher">Teacher</option>
                      <option value="bursar">Bursar (fees only)</option>
                      <option value="admin">Admin</option>
                    </select>
                  )}
                  <span className="muted small">
                    {forms.length ? `Form: ${forms.join(', ')}. ` : ''}
                    {subs.length ? `${subs.length} subject${subs.length === 1 ? '' : 's'}.` : m.role === 'teacher' && !forms.length ? 'Nothing assigned.' : ''}
                  </span>
                  <span className="head-actions">
                    <button className="link" onClick={() => setOpenUid(open ? null : m.uid)}>
                      {open ? 'Done' : 'Assign'}
                    </button>
                    {m.role !== 'owner' && m.uid !== me.uid && (
                      <button className="link danger" onClick={() => confirm(`Remove ${m.name} from ${school.name}? They lose access immediately.`) && removeMember(schoolId, m.uid)}>
                        Remove
                      </button>
                    )}
                  </span>
                </div>
                {open && (
                  <div className="assign">
                    <div className="field">
                      <span className="mono">Form teacher of</span>
                      <ArmChips selected={m.classIds} onToggle={(id) => setForm(m, id, !m.classIds.includes(id))} />
                    </div>
                    <div className="field">
                      <span className="mono">Subjects</span>
                      <SubjectPicker selected={m.offeringIds ?? []} onToggle={(o) => toggleSubject(m, o)} />
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );

  function ArmChips({ selected, onToggle }: { selected: string[]; onToggle: (id: string) => void }) {
    if (!classes.length) return <span className="muted small">Add arms in Settings first.</span>;
    return (
      <div className="chips">
        {classes.map((c) => (
          <button key={c.id} type="button" className={`chip ${selected.includes(c.id) ? 'on' : ''}`} onClick={() => onToggle(c.id)}>
            <span className="swatch-dot" style={{ ['--c' as string]: CLASS_COLOURS[c.colour].bg }} aria-hidden />
            {c.name}
          </button>
        ))}
      </div>
    );
  }

  /** Subjects grouped by subject, with one chip per arm: "Mathematics: JSS 1A, JSS 1B". */
  function SubjectPicker({ selected, onToggle }: { selected: string[]; onToggle: (o: Offering) => void }) {
    if (!offerings.length) return <span className="muted small">Add subjects in Settings first.</span>;
    const subjects = [...new Set(offerings.map((o) => o.subject))].sort();
    return (
      <div className="subject-picker">
        {subjects.map((s) => (
          <div key={s} className="subject-pick-row">
            <span className="subject-pick-name">{s}</span>
            <div className="chips">
              {offerings
                .filter((o) => o.subject === s)
                .sort((a, b) => classes.findIndex((c) => c.id === a.classId) - classes.findIndex((c) => c.id === b.classId))
                .map((o) => (
                  <button key={o.id} type="button" className={`chip ${selected.includes(o.id) ? 'on' : ''}`} onClick={() => onToggle(o)}>
                    {classes.find((c) => c.id === o.classId)?.name ?? 'Arm'}
                  </button>
                ))}
            </div>
          </div>
        ))}
      </div>
    );
  }
}
