import { useEffect, useRef, useState } from 'react';
import { deleteStudent, type ClassRoom, type Pronoun, type Student } from '../lib/db';
import { LEVELS, TONES, type DeviceStatus } from '../lib/ai';
import type { Prefs } from '../App';
import { SourceStamp } from './SourceStamp';
import { CloudTools } from './CloudTools';

type Img = { base64: string; mimeType: 'image/jpeg' | 'image/png'; url: string };

export function StudentDesk(props: {
  cls: ClassRoom;
  student: Student | null;
  roster: string[];
  prefs: Prefs;
  onPrefs: (p: Partial<Prefs>) => void;
  device: DeviceStatus;
  busy: boolean;
  onSave: (s: Student) => Promise<void>;
  onWrite: (s: Student, image?: { base64: string; mimeType: 'image/jpeg' | 'image/png' }) => Promise<boolean>;
  onLedger: () => void;
  onRemoved: (id: string) => void;
  toast: (t: string, k?: 'info' | 'warn' | 'error') => void;
}) {
  const s = props.student;
  const [notes, setNotes] = useState(s?.notes ?? '');
  const [comment, setComment] = useState(s?.final ?? s?.draft?.comment ?? '');
  const [img, setImg] = useState<Img | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Keep local edits in sync when the stored draft changes (e.g. after batch writing).
  useEffect(() => setComment(s?.final ?? s?.draft?.comment ?? ''), [s?.draft?.updatedAt, s?.final]);

  // Autosave notes locally.
  useEffect(() => {
    if (!s || notes === s.notes) return;
    const t = setTimeout(() => props.onSave({ ...s, notes }), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes]);

  if (!s)
    return (
      <aside className="desk desk-empty">
        <p className="mono eyebrow">Student</p>
        <p className="lede">Add students to this class, then pick one to write their comment.</p>
      </aside>
    );

  const setPronoun = (pronoun: Pronoun) => props.onSave({ ...s, pronoun });

  const pickImage = async (file: File) => {
    try {
      setImg(await shrink(file));
    } catch {
      props.toast('That photo could not be read. Try a JPEG or PNG.', 'error');
    }
  };

  const write = async () => {
    const latest = { ...s, notes };
    await props.onSave(latest);
    const ok = await props.onWrite(latest, img ? { base64: img.base64, mimeType: img.mimeType } : undefined);
    if (ok) setImg(null);
  };

  const commentChanged = s.draft && comment !== (s.final ?? s.draft.comment);
  const isFinal = !!s.final && !commentChanged;

  const remove = async () => {
    if (!confirm(`Remove ${s.name} and their notes from this class? This cannot be undone.`)) return;
    await deleteStudent(s.id);
    props.onRemoved(s.id);
  };

  return (
    <aside className="desk" aria-label={`${s.name}`}>
      <header className="desk-head">
        <div>
          <p className="mono eyebrow">Student</p>
          <h2 className="display-xs">{s.name}</h2>
        </div>
        <div className="seg" role="radiogroup" aria-label="Pronouns">
          {(['she', 'he', 'they'] as Pronoun[]).map((p) => (
            <button key={p} role="radio" aria-checked={s.pronoun === p} className={s.pronoun === p ? 'on' : ''} onClick={() => setPronoun(p)}>
              {p}
            </button>
          ))}
        </div>
      </header>

      <label className="field">
        <span className="mono field-label">
          Your notes <small>private shorthand is fine</small>
        </span>
        <textarea
          className="ruled notes"
          rows={5}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. strong at fractions, rushes tests, 2 hw missing, great in group work"
          maxLength={2400}
        />
      </label>

      <div className="photo-row">
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png"
          capture="environment"
          hidden
          onChange={(e) => e.target.files?.[0] && pickImage(e.target.files[0])}
        />
        {img ? (
          <div className="photo-chip">
            <img src={img.url} alt="Handwritten notes" />
            <span>Photo of notes · read on-device only</span>
            <button className="link" onClick={() => setImg(null)}>
              Remove
            </button>
          </div>
        ) : (
          <button className="link" onClick={() => fileRef.current?.click()}>
            + Add a photo of handwritten notes
          </button>
        )}
      </div>

      <div className="controls">
        <div className="control">
          <span className="mono field-label">Tone</span>
          <div className="seg wrap">
            {TONES.map((t) => (
              <button key={t} className={props.prefs.tone === t ? 'on' : ''} onClick={() => props.onPrefs({ tone: t })}>
                {t}
              </button>
            ))}
          </div>
        </div>
        <div className="control">
          <span className="mono field-label">Reading level</span>
          <div className="seg wrap">
            {LEVELS.map((l) => (
              <button key={l.id} className={props.prefs.level === l.id ? 'on' : ''} onClick={() => props.onPrefs({ level: l.id })}>
                {l.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="write-row">
        <button className="ticket" onClick={write} disabled={props.busy || (!notes.trim() && !img)}>
          {props.busy ? 'Writing…' : s.draft ? 'Rewrite comment' : 'Write comment'}
        </button>
        <span className="mono hint">
          {props.device === 'available'
            ? 'Runs on this device. Works offline.'
            : props.prefs.allowCloudFallback
              ? 'No on-device AI here: names will be removed first.'
              : 'Cloud fallback is off.'}
        </span>
      </div>

      {props.busy && <div className="writing" aria-hidden><span /><span /><span /></div>}

      {s.draft && !props.busy && (
        <article className="result">
          <div className="result-top">
            <SourceStamp source={s.draft.source} />
            <span className="mono meta">
              {s.draft.tone} · {LEVELS.find((l) => l.id === s.draft!.level)?.label}
            </span>
          </div>
          <dl className="parts">
            <div>
              <dt className="mono">Strength</dt>
              <dd>{s.draft.strength}</dd>
            </div>
            <div>
              <dt className="mono">Growth area</dt>
              <dd>{s.draft.growthArea}</dd>
            </div>
            <div>
              <dt className="mono">Next step</dt>
              <dd>{s.draft.nextStep}</dd>
            </div>
          </dl>
          <label className="field">
            <span className="mono field-label">Comment {isFinal && <b className="final-tag">Final</b>}</span>
            <textarea className="comment" rows={7} value={comment} onChange={(e) => setComment(e.target.value)} />
          </label>
          <div className="result-actions">
            <span className="mono hint">{comment.trim().split(/\s+/).filter(Boolean).length} words</span>
            <button
              className="pill ghost"
              onClick={async () => {
                await navigator.clipboard.writeText(comment);
                props.toast('Comment copied.');
              }}
            >
              Copy
            </button>
            <button className="pill ink" disabled={isFinal} onClick={() => props.onSave({ ...s, final: comment })}>
              {isFinal ? 'Marked final' : 'Mark final'}
            </button>
          </div>
        </article>
      )}

      {s.draft && !props.busy && (
        <CloudTools student={s} comment={comment} roster={props.roster} onSave={props.onSave} onLedger={props.onLedger} toast={props.toast} onUseComment={setComment} />
      )}

      <button className="link danger remove" onClick={remove}>
        Remove student
      </button>
    </aside>
  );
}

/** Downscale a photo to max 1024px JPEG, so it stays small and within the on-device input limits. */
async function shrink(file: File): Promise<Img> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1024 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  const url = c.toDataURL('image/jpeg', 0.85);
  return { base64: url.split(',')[1], mimeType: 'image/jpeg', url };
}
