// Firebase web config, read from environment variables at build time.
// Locally: copy .env.example to .env.local and fill it in.
// On GitHub Pages: the deploy workflow passes repository secrets with the same names.
const env = import.meta.env;

export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY ?? '',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN ?? '',
  projectId: env.VITE_FIREBASE_PROJECT_ID ?? '',
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET ?? '',
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '',
  appId: env.VITE_FIREBASE_APP_ID ?? '',
};

// App Check site key (reCAPTCHA Enterprise by default).
export const appCheckSiteKey: string = env.VITE_APPCHECK_SITE_KEY ?? '';
export const appCheckProvider: 'enterprise' | 'v3' = env.VITE_APPCHECK_PROVIDER === 'v3' ? 'v3' : 'enterprise';

export const isConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.appId);
