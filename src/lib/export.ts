import type { ClassRoom, Student } from '../data/types';

export const finalText = (s: Student) => s.final ?? s.draft?.comment ?? '';

/** Students the batch button will write: undrafted ones first; if all are drafted, redo the non-final ones. */
export function batchQueue(students: Student[]) {
  const fresh = students.filter((s) => s.notes.trim() && !s.draft);
  return fresh.length ? fresh : students.filter((s) => s.notes.trim() && !s.final);
}

export function toCSV(cls: ClassRoom, students: Student[]) {
  const q = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const rows = [
    ['Class', 'Student', 'Strength', 'Growth area', 'Next step', 'Comment', 'Written on', 'Parent translation'],
    ...students.map((s) => [
      cls.name,
      s.name,
      s.draft?.strength ?? '',
      s.draft?.growthArea ?? '',
      s.draft?.nextStep ?? '',
      finalText(s),
      s.draft ? (s.draft.source === 'on_device' ? 'This device' : 'Cloud (names removed)') : '',
      s.translation ? `${s.translation.language}: ${s.translation.text}` : '',
    ]),
  ];
  return '﻿' + rows.map((r) => r.map(q).join(',')).join('\r\n');
}

export function download(filename: string, content: string, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function toPlain(cls: ClassRoom, students: Student[]) {
  return students
    .filter((s) => finalText(s))
    .map((s) => `${s.name}\n${finalText(s)}`)
    .join('\n\n')
    .concat(`\n\n— ${cls.name}`);
}

export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'class';
