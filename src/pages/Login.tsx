import { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { useToast } from '../ui/toast';
import { AuthShell } from './AuthShell';

export function Login() {
  const { user, ready, signInGoogle, sendLink } = useAuth();
  const [params] = useSearchParams();
  const next = params.get('next') || '/schools';
  const nav = useNavigate();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  if (ready && user && !user.isAnonymous) return <Navigate to={next} replace />;

  const google = async () => {
    setBusy(true);
    try {
      await signInGoogle();
      nav(next, { replace: true });
    } catch (e) {
      toast(`Google sign-in didn't finish: ${(e as Error).message}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  const link = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await sendLink(email.trim(), next);
      setSent(true);
    } catch (err) {
      toast(`Couldn't send the link: ${(err as Error).message}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell eyebrow="Sign in" title="Welcome back to your school.">
      {sent ? (
        <div className="auth-card">
          <p className="h3">Check your inbox.</p>
          <p className="muted">
            We sent a sign-in link to <b>{email}</b>. Open it on this device to continue. No password needed.
          </p>
          <button className="link" onClick={() => setSent(false)}>
            Use a different email
          </button>
        </div>
      ) : (
        <div className="auth-card">
          <button className="pill ghost wide" onClick={google} disabled={busy}>
            <GoogleMark /> Continue with Google
          </button>
          <div className="or mono">or</div>
          <form onSubmit={link} className="stack">
            <label className="field">
              <span className="mono">School email</span>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@yourschool.edu" />
            </label>
            <button className="ticket" disabled={busy || !email}>
              Email me a sign-in link
            </button>
          </form>
        </div>
      )}
      <p className="auth-foot">
        New here? <Link to="/start">Register your school</Link> · or <Link to="/demo">try the demo school</Link>
      </p>
    </AuthShell>
  );
}

export function GoogleMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
