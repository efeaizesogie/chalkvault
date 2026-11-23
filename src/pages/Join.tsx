import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { displayName, useAuth } from '../auth/AuthProvider';
import { acceptInvite, readInvite } from '../data/api';
import type { Invite } from '../data/types';
import { useToast } from '../ui/toast';
import { AuthShell } from './AuthShell';

export function Join() {
  const { schoolId = '', code = '' } = useParams();
  const { user, ready } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const [invite, setInvite] = useState<Invite | null | 'missing'>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user && !user.isAnonymous) readInvite(schoolId, code).then((i) => setInvite(i ?? 'missing')).catch(() => setInvite('missing'));
  }, [user, schoolId, code]);

  if (!ready) return null;
  if (!user || user.isAnonymous) return <Navigate to={`/login?next=/join/${schoolId}/${code}`} replace />;

  const accept = async () => {
    if (!invite || invite === 'missing') return;
    setBusy(true);
    try {
      await acceptInvite({ uid: user.uid, name: displayName(user), email: user.email ?? '' }, schoolId, invite);
      nav(`/s/${schoolId}`, { replace: true });
    } catch (e) {
      toast(`Couldn't join: ${(e as Error).message}`, 'error');
      setBusy(false);
    }
  };

  return (
    <AuthShell eyebrow="Invitation" title={invite === 'missing' ? 'This invite has expired.' : 'You’ve been invited to a school.'}>
      <div className="auth-card">
        {invite === null && <p className="muted">Checking the invite…</p>}
        {invite === 'missing' && <p className="muted">Ask the person who invited you for a new link. Invites stop working once they're revoked.</p>}
        {invite && invite !== 'missing' && (
          <>
            <p>
              You'll join as <b>{invite.role === 'admin' ? 'an admin' : 'a teacher'}</b>
              {invite.classIds.length ? ` with ${invite.classIds.length} class${invite.classIds.length === 1 ? '' : 'es'} assigned` : ''}, signed in as{' '}
              <b>{user.email}</b>.
            </p>
            <button className="ticket" onClick={accept} disabled={busy}>
              {busy ? 'Joining…' : 'Join school'}
            </button>
          </>
        )}
      </div>
    </AuthShell>
  );
}
