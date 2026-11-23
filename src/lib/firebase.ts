import { initializeApp, type FirebaseApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider, ReCaptchaV3Provider } from 'firebase/app-check';
import { getAI, GoogleAIBackend, type AI } from 'firebase/ai';
import { getAuth, type Auth } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, type Firestore } from 'firebase/firestore';
import { appCheckProvider, appCheckSiteKey, firebaseConfig, isConfigured } from '../firebase-config';

let app: FirebaseApp | null = null;
let ai: AI | null = null;
let db: Firestore | null = null;

declare global {
  // eslint-disable-next-line no-var
  var FIREBASE_APPCHECK_DEBUG_TOKEN: boolean | string | undefined;
}

export class SetupError extends Error {
  constructor() {
    super('Firebase is not configured yet. Copy .env.example to .env.local and fill it in.');
  }
}

export function getFirebaseApp(): FirebaseApp {
  if (!isConfigured) throw new SetupError();
  if (app) return app;
  // On localhost, App Check uses a debug token (registered once in the Firebase console).
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
    self.FIREBASE_APPCHECK_DEBUG_TOKEN = (import.meta.env.VITE_APPCHECK_DEBUG_TOKEN as string | undefined) || true;
  }
  app = initializeApp(firebaseConfig);
  if (appCheckSiteKey) {
    initializeAppCheck(app, {
      provider:
        appCheckProvider === 'enterprise'
          ? new ReCaptchaEnterpriseProvider(appCheckSiteKey)
          : new ReCaptchaV3Provider(appCheckSiteKey),
      isTokenAutoRefreshEnabled: true,
    });
  }
  return app;
}

export function getFirebaseAI(): AI | null {
  if (!isConfigured) return null;
  ai ??= getAI(getFirebaseApp(), { backend: new GoogleAIBackend() });
  return ai;
}

/** Firestore with an on-disk cache, so records stay readable and writable offline. */
export function getDb(): Firestore {
  db ??= initializeFirestore(getFirebaseApp(), {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });
  return db;
}

export function getFirebaseAuth(): Auth {
  return getAuth(getFirebaseApp());
}
