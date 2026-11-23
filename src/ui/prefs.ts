import { useState } from 'react';

export interface Prefs {
  tone: string;
  level: string;
  allowCloudFallback: boolean;
}
const KEY = 'chalkvault.prefs';
const DEFAULTS: Prefs = { tone: 'Warm', level: 'plain', allowCloudFallback: true };

function load(): Prefs {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return DEFAULTS;
  }
}

/** Per-teacher writing preferences, kept in this browser. */
export function usePrefs() {
  const [prefs, setPrefs] = useState<Prefs>(load);
  const update = (p: Partial<Prefs>) => {
    const next = { ...prefs, ...p };
    setPrefs(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };
  return [prefs, update] as const;
}
