/** Turn SDK/network errors into one short sentence a teacher can act on. */
export function friendlyError(e: unknown) {
  const m = (e as Error)?.message ?? String(e);
  if (/app-check|appCheck|App Check|\b401\b/i.test(m)) return 'App Check rejected this browser. Register the debug token (localhost) or check the reCAPTCHA domain list.';
  if (/\b403\b|PERMISSION|permission/.test(m)) return 'Firebase refused the request (403). Check that Firebase AI Logic is enabled and App Check allows this site.';
  if (/high demand|overloaded|\b50[03]\b/i.test(m)) return "Google's cloud model is very busy right now. Wait a few seconds and try again.";
  if (/\b429\b|quota|RESOURCE_EXHAUSTED/i.test(m)) return 'The free cloud quota is used up for now. Try again in a minute.';
  if (/Failed to fetch|NetworkError|network/i.test(m)) return 'No connection to the cloud. On-device writing still works when Gemini Nano is available.';
  return m.length > 180 ? m.slice(0, 180) + '…' : m;
}
