import readXlsxFile from 'read-excel-file';
import type { StudentProfile } from '../data/types';

export interface Table {
  headers: string[];
  rows: string[][];
}

/** Read a CBT export: CSV or Excel. Everything is parsed in the browser; nothing is uploaded. */
export async function readTable(file: File): Promise<Table> {
  if (/\.(xlsx|xlsm)$/i.test(file.name)) {
    const data = await readXlsxFile(file);
    const all = data.map((r) => r.map((c) => (c == null ? '' : String(c).trim())));
    return splitHeader(all);
  }
  const text = await file.text();
  return splitHeader(parseCsv(text));
}

function splitHeader(all: string[][]): Table {
  // The header is the first row with at least two non-empty cells.
  const i = all.findIndex((r) => r.filter(Boolean).length >= 2);
  if (i === -1) return { headers: [], rows: [] };
  return { headers: all[i], rows: all.slice(i + 1).filter((r) => r.some(Boolean)) };
}

export function parseCsv(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let q = false;
  const delim = (text.split('\n')[0].match(/;/g)?.length ?? 0) > (text.split('\n')[0].match(/,/g)?.length ?? 0) ? ';' : ',';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) {
      row.push(cell.trim());
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell.trim());
      out.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell.trim());
    out.push(row);
  }
  return out;
}

/** A best guess at the mapping without AI, used when the AI is unavailable or as a starting point. */
export function guessMapping(headers: string[], columns: { key: string; label: string }[]) {
  const h = headers.map((x) => x.toLowerCase());
  const find = (...words: string[]) => headers[h.findIndex((x) => words.some((w) => x.includes(w)))] ?? '';
  const map: Record<string, string> = {};
  for (const c of columns) {
    const label = c.label.toLowerCase();
    map[c.key] = headers[h.findIndex((x) => x === label || x.replace(/\s/g, '') === label.replace(/\s/g, ''))] ?? (/exam/.test(label) ? find('exam') : /score|total/.test(label) ? find('score', 'total', 'mark') : '');
  }
  return { nameColumn: find('name', 'student', 'candidate'), idColumn: find('adm', 'reg', 'matric', 'id', 'number'), map };
}

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();

/** Find which student a row belongs to: by admission number first, then by name (any word order). */
export function matchStudent(name: string, id: string, students: StudentProfile[]) {
  if (id) {
    const s = students.find((x) => x.admissionNo && norm(x.admissionNo) === norm(id));
    if (s) return s;
  }
  if (!name) return undefined;
  const n = norm(name);
  const words = new Set(n.split(' '));
  return (
    students.find((x) => norm(x.name) === n) ??
    students.find((x) => {
      const w = norm(x.name).split(' ');
      return w.length > 1 && w.every((p) => words.has(p));
    }) ??
    students.find((x) => n.includes(norm(x.name)) || norm(x.name).includes(n))
  );
}
