/**
 * Makes Chalkvault installable. Call once at start-up (from main.tsx).
 * - Injects the manifest link and a theme-color meta if the HTML doesn't already have them.
 * - Registers the service worker, but only in a production build.
 */
export function registerPwa() {
  const base = import.meta.env.BASE_URL;

  if (typeof document !== 'undefined') {
    if (!document.querySelector('link[rel="manifest"]')) {
      const link = document.createElement('link');
      link.rel = 'manifest';
      link.href = `${base}manifest.webmanifest`;
      document.head.appendChild(link);
    }
    if (!document.querySelector('meta[name="theme-color"]')) {
      const meta = document.createElement('meta');
      meta.name = 'theme-color';
      meta.content = '#17191c';
      document.head.appendChild(meta);
    }
  }

  if (import.meta.env.PROD && typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register(`${base}sw.js`).catch(() => {});
    });
  }
}
