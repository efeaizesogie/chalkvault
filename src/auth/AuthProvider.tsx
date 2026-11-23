import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  GoogleAuthProvider,
  isSignInWithEmailLink,
  onAuthStateChanged,
  sendSignInLinkToEmail,
  signInAnonymously,
  signInWithEmailLink,
  signInWithPopup,
  signOut as fbSignOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import { getFirebaseAuth } from '../lib/firebase';
import { isConfigured } from '../firebase-config';

interface AuthState {
  user: User | null;
  ready: boolean;
  signInGoogle: () => Promise<void>;
  sendLink: (email: string, next: string) => Promise<void>;
  signInDemo: () => Promise<User>;
  signOut: () => Promise<void>;
  setName: (name: string) => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);
const EMAIL_KEY = 'chalkvault.emailForSignIn';
const NEXT_KEY = 'chalkvault.nextAfterSignIn';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(!isConfigured);

  useEffect(() => {
    if (!isConfigured) return;
    const auth = getFirebaseAuth();
    // Finish an email-link sign-in if this page load came from the link.
    if (isSignInWithEmailLink(auth, location.href)) {
      const email = safeGet(EMAIL_KEY) ?? prompt('Confirm your email address to finish signing in') ?? '';
      if (email) {
        signInWithEmailLink(auth, email, location.href)
          .then(() => {
            safeDel(EMAIL_KEY);
            const next = safeGet(NEXT_KEY);
            safeDel(NEXT_KEY);
            history.replaceState(null, '', next || location.pathname);
          })
          .catch((e) => alert(`That sign-in link didn't work: ${(e as Error).message}`));
      }
    }
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setReady(true);
    });
  }, []);

  const value: AuthState = {
    user,
    ready,
    async signInGoogle() {
      await signInWithPopup(getFirebaseAuth(), new GoogleAuthProvider());
    },
    async sendLink(email, next) {
      const url = new URL(import.meta.env.BASE_URL + 'login', location.origin).toString();
      await sendSignInLinkToEmail(getFirebaseAuth(), email, { url, handleCodeInApp: true });
      safeSet(EMAIL_KEY, email);
      safeSet(NEXT_KEY, next);
    },
    async signInDemo() {
      const cred = await signInAnonymously(getFirebaseAuth());
      return cred.user;
    },
    async signOut() {
      await fbSignOut(getFirebaseAuth());
    },
    async setName(name) {
      if (getFirebaseAuth().currentUser) await updateProfile(getFirebaseAuth().currentUser!, { displayName: name });
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}

export function displayName(u: User | null) {
  if (!u) return '';
  if (u.isAnonymous) return 'Demo teacher';
  return u.displayName || u.email?.split('@')[0] || 'Teacher';
}

function safeGet(k: string) {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function safeSet(k: string, v: string) {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* ignore */
  }
}
function safeDel(k: string) {
  try {
    localStorage.removeItem(k);
  } catch {
    /* ignore */
  }
}
