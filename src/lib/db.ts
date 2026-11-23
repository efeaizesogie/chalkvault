import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

export type Pronoun = 'she' | 'he' | 'they';
export type Source = 'on_device' | 'in_cloud';

export interface ClassRoom {
  id: string;
  name: string;
  subject: string;
  term: string;
  colour: ClassColour;
  createdAt: number;
}

export interface Draft {
  strength: string;
  growthArea: string;
  nextStep: string;
  comment: string;
  source: Source;
  tone: string;
  level: string;
  updatedAt: number;
}

export interface Student {
  id: string;
  classId: string;
  name: string;
  pronoun: Pronoun;
  notes: string;
  draft?: Draft;
  final?: string;
  translation?: { language: string; text: string; at: number };
  order: number;
}

export interface LedgerEntry {
  id: string;
  at: number;
  task: string;
  source: Source | 'blocked';
  charsSent: number;
  detail: string;
}

export const CLASS_COLOURS = {
  chalk: { bg: '#dfef4f', ink: '#17191c', label: 'Chalk' },
  cobalt: { bg: '#2440e6', ink: '#ffffff', label: 'Cobalt' },
  vermilion: { bg: '#ff6b3d', ink: '#17191c', label: 'Vermilion' },
  moss: { bg: '#2f6b4f', ink: '#ffffff', label: 'Moss' },
  lilac: { bg: '#c9b8ff', ink: '#17191c', label: 'Lilac' },
  teal: { bg: '#0f7f86', ink: '#ffffff', label: 'Teal' },
} as const;
export type ClassColour = keyof typeof CLASS_COLOURS;

interface ChalkDB extends DBSchema {
  classes: { key: string; value: ClassRoom };
  students: { key: string; value: Student; indexes: { byClass: string } };
  ledger: { key: string; value: LedgerEntry };
  settings: { key: string; value: unknown };
}

let dbp: Promise<IDBPDatabase<ChalkDB>> | null = null;
function db() {
  dbp ??= openDB<ChalkDB>('chalkvault', 1, {
    upgrade(d) {
      d.createObjectStore('classes', { keyPath: 'id' });
      const s = d.createObjectStore('students', { keyPath: 'id' });
      s.createIndex('byClass', 'classId');
      d.createObjectStore('ledger', { keyPath: 'id' });
      d.createObjectStore('settings');
    },
  });
  return dbp;
}

export const uid = () => crypto.randomUUID();

export async function listClasses() {
  return (await (await db()).getAll('classes')).sort((a, b) => a.createdAt - b.createdAt);
}
export async function saveClass(c: ClassRoom) {
  await (await db()).put('classes', c);
}
export async function deleteClass(id: string) {
  const d = await db();
  const tx = d.transaction(['classes', 'students'], 'readwrite');
  const ids = await tx.objectStore('students').index('byClass').getAllKeys(id);
  await Promise.all([...ids.map((k) => tx.objectStore('students').delete(k)), tx.objectStore('classes').delete(id)]);
  await tx.done;
}
export async function listStudents(classId: string) {
  return (await (await db()).getAllFromIndex('students', 'byClass', classId)).sort((a, b) => a.order - b.order);
}
export async function saveStudent(s: Student) {
  await (await db()).put('students', s);
}
export async function deleteStudent(id: string) {
  await (await db()).delete('students', id);
}
export async function addLedger(e: Omit<LedgerEntry, 'id' | 'at'>) {
  const entry = { ...e, id: uid(), at: Date.now() };
  await (await db()).put('ledger', entry);
  return entry;
}
export async function listLedger() {
  return (await (await db()).getAll('ledger')).sort((a, b) => b.at - a.at);
}
export async function clearLedger() {
  await (await db()).clear('ledger');
}
export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const v = await (await db()).get('settings', key);
  return (v as T) ?? fallback;
}
export async function setSetting(key: string, value: unknown) {
  await (await db()).put('settings', value, key);
}
export async function wipeEverything() {
  const d = await db();
  await Promise.all([d.clear('classes'), d.clear('students'), d.clear('ledger'), d.clear('settings')]);
}
