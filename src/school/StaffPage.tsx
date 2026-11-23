import { useState } from 'react';
import { assignClass, createInvite, paths, removeMember, revokeInvite, updateMember } from '../data/api';
import { useQuery } from '../data/hooks';
import { CLASS_COLOURS, type Invite, type Role } from '../data/types';
import { useToast } from '../ui/toast';
import { useSchool } from './SchoolContext';

export function StaffPage() {
  const { schoolId, school, members, classes, me } = useSchool();
  const toast = useToast();
  const invites = useQuery<Invite>(paths.invites(schoolId), `invites:${schoolId}`);
  const [role, setRole] = useState<Invite['role']>('teacher');
  const [label, setLabel] = useState('');
  const [inviteClasses, setInviteClasses] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const link = (code: string) => new URL(`${import.meta.env.BASE_URL}join/${schoolId}/${code}`, location.origin).toString();
  const copy = async (code: string) => {
    await navigator.clipboard.writeText(link(code));
    toast('Invite link copied. Send it to your teacher by email or WhatsApp.');
  };

  const create = async () => {
    setBusy(true);
    try {
      const code = await createInvite(schoolId, me.uid, role, inviteClasses, label.trim() || (role === 'admin' ? 'Admin invite' : 'Teacher invite'));
      await copy(code);
      setLabel('');
      setInviteClasses([]);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const sorted = [...members].sort((a, b) => ['owner', 'admin', 'teacher'].indexOf(a.role) - ['owner', 'admin', 'teacher'].indexOf(b.role) || a.name.localeCompare(b.name));

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="mono eyebrow">Staff</p>
          <h1 className="display-sm">Who can open {school.name}.</h1>
          <p className="lede">Teachers only see the classes you assign them. Owners and admins see everything.</p>
        </div>
      </header>

      <section className="panel">
        <h2 className="h3">Invite someone</h2>
        <div className="form-grid">
          <label className="field">
            <span className="mono">Role</span>
            <select value={role} onChange={(e) => setRole(e.target.value as Invite['role'])}>
              <option value="teacher">Teacher</option>
              <option value="admin">Admin (sees everything)</option>
            </select>
          </label>
          <label className="field">
            <span className="mono">Who is it for? (just a label)</span>
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Mrs Ade, Primary 5" />
          </label>
        </div>
        {role === 'teacher' && (
          <div className="field">
            <span className="mono">Classes they'll teach</span>
            <ClassChips selected={inviteClasses} onToggle={(id) => setInviteClasses((x) => (x.includes(id) ? x.filter((y) => y !== id) : [...x, id]))} />
          </div>
        )}
        <div className="row-actions">
          <span className="muted small">You'll get a private link to send. Whoever opens it and signs in joins with this role.</span>
          <button className="ticket" onClick={create} disabled={busy}>
            Create invite link
          </button>
        </div>
        {invites.data.length > 0 && (
          <ul className="invite-list">
            {invites.data.map((i) => (
              <li key={i.code}>
                <span>
                  <b>{i.label}</b> <span className="mono muted">{i.role}</span>
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

      <section className="panel">
        <h2 className="h3">Staff ({members.length})</h2>
        <ol className="staff-list">
          {sorted.map((m) => (
            <li key={m.uid} className="staff-row">
              <div className="staff-who">
                <b>{m.name}</b>
                <span className="muted small">{m.email || 'No email'}</span>
              </div>
              {m.role === 'owner' ? (
                <span className="mono">Owner</span>
              ) : (
                <select
                  className="mono"
                  value={m.role}
                  onChange={(e) => updateMember(schoolId, m.uid, { role: e.target.value as Role }).catch((err) => toast((err as Error).message, 'error'))}
                >
                  <option value="teacher">Teacher</option>
                  <option value="admin">Admin</option>
                </select>
              )}
              {m.role === 'teacher' ? (
                <ClassChips selected={m.classIds} onToggle={(id) => assignClass(schoolId, m.uid, id, !m.classIds.includes(id)).catch((err) => toast((err as Error).message, 'error'))} />
              ) : (
                <span className="muted small">All classes</span>
              )}
              {m.role !== 'owner' && m.uid !== me.uid && (
                <button
                  className="link danger"
                  onClick={() => confirm(`Remove ${m.name} from ${school.name}? They lose access immediately.`) && removeMember(schoolId, m.uid)}
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );

  function ClassChips({ selected, onToggle }: { selected: string[]; onToggle: (id: string) => void }) {
    if (!classes.length) return <span className="muted small">Add classes in Settings first.</span>;
    return (
      <div className="chips">
        {classes.map((c) => (
          <button key={c.id} type="button" className={`chip ${selected.includes(c.id) ? 'on' : ''}`} onClick={() => onToggle(c.id)}>
            <i className="swatch-dot" style={{ ['--c' as string]: CLASS_COLOURS[c.colour].bg }} />
            {c.name}
          </button>
        ))}
      </div>
    );
  }
}
