import { initializeApp, type FirebaseApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider, ReCaptchaV3Provider } from 'firebase/app-check';
import { getAI, GoogleAIBackend, type AI } from 'firebase/ai';
import { appCheckProvider, appCheckSiteKey, firebaseConfig, isConfigured } from '../firebase-config';

let app: FirebaseApp | null = null;
let ai: AI | null = null;

declare global {
  // eslint-disable-next-line no-var
  var FIREBASE_APPCHECK_DEBUG_TOKEN: boolean | string | undefined;
}

export function getFirebaseAI(): AI | null {
  if (!isConfigured) return null;
  if (ai) return ai;
  // On localhost, App Check uses a debug token (register it in the Firebase console once).
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
  ai = getAI(app, { backend: new GoogleAIBackend() });
  return ai;
}
