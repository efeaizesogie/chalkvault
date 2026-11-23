import { useEffect, useMemo, useRef, useState } from 'react';
import { query, where } from 'firebase/firestore';
import { paths, saveAttendance, todayISO } from '../data/api';
import { useDoc, useQuery } from '../data/hooks';
import { MARK_LABEL, type AttendanceDay, type ClassRoom, type Mark, type StudentProfile } from '../data/types';
import { readRegister, PrivacyBlock } from '../lib/ai';
import { friendlyError } from '../lib/errors';
import { SourceStamp } from '../components/SourceStamp';
import { useToast } from '../ui/toast';
import { useSchool } from './SchoolContext';
import type { WorkspaceCtx } from './Workspace';

const MARKS: Mark[] = ['P', 'L', 'A'];

/** One-tap daily register for a class, with an on-device reader for photographed paper registers. */
export function AttendanceView({ cls, students, ws }: { cls: ClassRoom; students: StudentProfile[]; ws: WorkspaceCtx }) {
  const { schoolId, me, term } = useSchool();
  const toast = useToast();
  const [date, setDate] = useState(todayISO());
  const saved = useDoc<AttendanceDay>(paths.attendanceDay(schoolId, cls.id, date), `att:${cls.id}:${date}`);
  const [marks, setMarks] = useState<Record<string, Mark>>({});
  const [dirty, setDirty] = useState(false);
  const [reading, setReading] = useState(false);
  const [photoNote, setPhotoNote] = useState<{ ms: number; matched: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!dirty) setMarks(saved.data?.marks ?? {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved.data, date]);
  useEffect(() => {
    setDirty(false);
    setPhotoNote(null);
  }, [date]);

  // Term totals for the summary column.
  const termDays = useQuery<AttendanceDay>(
    term ? query(paths.attendance(schoolId), where('classId', '==', cls.id), where('termId', '==', term.id)) : null,
    `attTerm:${cls.id}:${term?.id}`,
  );
  const totals = useMemo(() => {
    const t = new Map<string, { present: number; days: number }>();
    for (const d of termDays.data) {
      for (const s of students) {
        const m = d.marks[s.id];
        if (!m) continue;
        const cur = t.get(s.id) ?? { present: 0, days: 0 };
        cur.days++;
        if (m !== 'A') cur.present++;
        t.set(s.id, cur);
      }
    }
    return t;
  }, [termDays.data, students]);

  const set = (id: string, m: Mark) => {
    setMarks((x) => ({ ...x, [id]: m }));
    setDirty(true);
  };
  const allPresent = () => {
    setMarks((cur) => Object.fromEntries(students.map((s) => [s.id, cur[s.id] ?? 'P'])));
    setDirty(true);
  };
  const save = async () => {
    if (!term) return;
    try {
      await saveAttendance(schoolId, { classId: cls.id, termId: term.id, date, marks, takenBy: me.uid });
      setDirty(false);
      toast(`Register saved for ${new Date(date + 'T12:00').toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}.`);
    } catch (e) {
      toast(friendlyError(e), 'error');
    }
  };

  const readPhoto = async (file: File) => {
    setReading(true);
    try {
      const img = await shrinkForModel(file);
      const roster = students.map((s) => s.name);
      const res = await readRegister(img, roster, date);
      const byName = new Map(students.map((s) => [norm(s.name), s.id]));
      const next = { ...marks };
      let matched = 0;
      for (const r of res.rows) {
        const id = byName.get(norm(r.name)) ?? students.find((s) => norm(s.name).includes(norm(r.name)) || norm(r.name).includes(norm(s.name)))?.id;
        if (id && MARKS.includes(r.mark)) {
          next[id] = r.mark;
          matched++;
        }
      }
      setMarks(next);
      setDirty(true);
      setPhotoNote({ ms: res.ms, matched });
      await ws.log({ task: `Register photo: ${cls.name}`, source: 'on_device', charsSent: 0, detail: `Gemini Nano read ${matched} of ${students.length} marks on this device in ${(res.ms / 1000).toFixed(1)} s. The photo was not sent anywhere.` });
    } catch (e) {
      if (e instanceof PrivacyBlock) {
        toast(e.message, 'warn');
        await ws.log({ task: `Register photo: ${cls.name}`, source: 'blocked', charsSent: 0, detail: e.message }).catch(() => {});
      } else toast(`Couldn’t read the photo. ${friendlyError(e)}`, 'error');
    } finally {
      setReading(false);
      ws.refreshDevice();
    }
  };

  const counts = MARKS.map((m) => students.filter((s) => marks[s.id] === m).length);
  const unmarked = students.filter((s) => !marks[s.id]).length;

  return (
    <section className="att">
      <header className="att-bar">
        <label className="field inline">
          <span className="mono">Date</span>
          <input type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value || todayISO())} />
        </label>
        <p className="att-counts">
          {counts[0]} present, {counts[1]} late, {counts[2]} absent{unmarked ? `, ${unmarked} not marked` : ''}
        </p>
        <div className="att-actions">
          <input ref={fileRef} type="file" accept="image/jpeg,image/png" capture="environment" hidden onChange={(e) => e.target.files?.[0] && readPhoto(e.target.files[0])} />
          <button className="pill ghost" onClick={() => fileRef.current?.click()} disabled={reading} title="Gemini Nano reads the photo on this computer. It is never uploaded.">
            {reading ? 'Reading photo…' : 'Read a paper register'}
          </button>
          <button className="pill ghost" onClick={allPresent} disabled={!students.length}>
            Mark the rest present
          </button>
          <button className="ticket" onClick={save} disabled={!dirty || !students.length}>
            {dirty ? 'Save register' : saved.data ? 'Saved' : 'Save register'}
          </button>
        </div>
      </header>
      {photoNote && (
        <p className="att-photo-note">
          <SourceStamp source="on_device" ms={photoNote.ms} /> Read {photoNote.matched} of {students.length} marks from the photo. Check them, then save.
        </p>
      )}
      {ws.device !== 'available' && <p className="muted small att-hint">Reading a paper register needs Gemini Nano in Chrome, because the photo is never sent to the cloud.</p>}
      <ol className="rows">
        <li className="row att-row row-head mono" aria-hidden>
          <span>#</span>
          <span>Student</span>
          <span>Today</span>
          <span>This term</span>
        </li>
        {students.map((s, i) => {
          const t = totals.get(s.id);
          return (
            <li key={s.id} className="row att-row">
              <span className="mono idx">{String(i + 1).padStart(2, '0')}</span>
              <span className="row-name">{s.name}</span>
              <span className="seg" role="radiogroup" aria-label={`${s.name} attendance`}>
                {MARKS.map((m) => (
                  <button key={m} role="radio" aria-checked={marks[s.id] === m} className={`mark-${m} ${marks[s.id] === m ? 'on' : ''}`} onClick={() => set(s.id, m)}>
                    {MARK_LABEL[m]}
                  </button>
                ))}
              </span>
              <span className="mono muted">{t ? `${t.present} of ${t.days} days` : 'No days yet'}</span>
            </li>
          );
        })}
        {students.length === 0 && <li className="row muted">Add students to this class first.</li>}
      </ol>
    </section>
  );
}

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\s]/gu, '').replace(/\s+/g, ' ').trim();

async function shrinkForModel(file: File) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1280 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  return { base64: c.toDataURL('image/jpeg', 0.88).split(',')[1], mimeType: 'image/jpeg' as const };
}
