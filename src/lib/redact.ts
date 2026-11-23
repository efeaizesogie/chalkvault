// De-identification that runs locally, before anything can leave the device.
// Every name on the roster (full names and each part) is replaced with a placeholder,
// along with emails, phone numbers and long ID-like numbers.

export const STUDENT_TOKEN = '[STUDENT]';

export interface Redaction {
  text: string;
  removed: { original: string; replacement: string }[];
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function redact(input: string, studentName: string, roster: string[]): Redaction {
  const removed: Redaction['removed'] = [];
  let text = input;

  // Build name parts: the student's own name parts map to [STUDENT]; classmates map to [CLASSMATE n].
  const own = new Set(namePartsOf(studentName));
  const others = new Map<string, string>();
  let n = 0;
  for (const full of roster) {
    if (full.trim().toLowerCase() === studentName.trim().toLowerCase()) continue;
    const label = `[CLASSMATE ${String.fromCharCode(65 + (n++ % 26))}]`;
    for (const part of namePartsOf(full)) if (!own.has(part) && !others.has(part)) others.set(part, label);
  }

  const replaceParts = (parts: string[], to: (p: string) => string) => {
    // Longest first so "Ada Obi" is replaced before "Ada".
    for (const part of parts.sort((a, b) => b.length - a.length)) {
      const re = new RegExp(`(?<![\\p{L}])${escape(part)}(?:'s|’s)?(?![\\p{L}])`, 'giu');
      text = text.replace(re, (m) => {
        const rep = to(part) + (/'s$|’s$/i.test(m) ? "'s" : '');
        removed.push({ original: m, replacement: rep });
        return rep;
      });
    }
  };
  const fullOwn = studentName.trim();
  if (fullOwn) replaceParts([fullOwn.toLowerCase()], () => STUDENT_TOKEN);
  replaceParts([...own], () => STUDENT_TOKEN);
  replaceParts([...others.keys()], (p) => others.get(p)!);

  const patterns: [RegExp, string][] = [
    [/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[EMAIL]'],
    [/\+?\d[\d\s-]{7,}\d/g, '[NUMBER]'],
    [/\b\d{5,}\b/g, '[ID]'],
  ];
  for (const [re, rep] of patterns) {
    text = text.replace(re, (m) => {
      removed.push({ original: m, replacement: rep });
      return rep;
    });
  }
  return { text, removed };
}

function namePartsOf(name: string) {
  return name
    .toLowerCase()
    .split(/[\s,]+/)
    .map((p) => p.trim())
    .filter((p) => p.length >= 2);
}

/** Put the real name back into text that came back from the cloud. Runs locally. */
export function restore(text: string, studentName: string) {
  const first = studentName.trim().split(/\s+/)[0] || studentName;
  return text.replaceAll(STUDENT_TOKEN, first).replace(/\[CLASSMATE [A-Z]\]/g, 'a classmate');
}
