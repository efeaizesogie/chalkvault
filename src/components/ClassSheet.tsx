import { useState } from 'react';
import { CLASS_COLOURS, type ClassRoom, type Student } from '../data/types';
import type { DeviceStatus } from '../lib/ai';
import { batchQueue, download, finalText, slug, toCSV, toPlain } from '../lib/export';
import { printDoc } from '../lib/print';
import { tableDoc } from '../lib/printDocs';

function status(s: Student) {
  if (s.status === 'approved') return 'Approved';
  if (s.status === 'submitted') return 'Waiting';
  if (s.final) return 'Final';
  if (s.draft) return 'Drafted';
  if (s.notes.trim()) return 'Notes';
  return 'Empty';
}

export function ClassSheet(props: {
  cls: ClassRoom;
  students: Student[];
  activeId: string | null;
  busyIds: Set<string>;
  batch: { done: number; total: number; current: string } | null;
  device: DeviceStatus;
  onSelect: (id: string) => void;
  onAddStudents: (names: string[]) => void;
  onBatch: () => void;
  onStopBatch: () => void;
  onEditClass?: () => void;
  termName: string;
  toast: (t: string) => void;
}) {
  const { cls, students, batch } = props;
  const col = CLASS_COLOURS[cls.colour];
  const [addingRaw, setAdding] = useState(false);
  const adding = addingRaw || students.length === 0;
  const [names, setNames] = useState('');
  const [exportOpen, setExportOpen] = useState(false);

  const withNotes = batchQueue(students).length;
  const finals = students.filter((s) => s.final).length;
  const drafted = students.filter((s) => s.draft).length;

  const submitNames = () => {
    const list = names
      .split(/\r?\n|,(?![^(]*\))/)
      .map((n) => n.trim())
      .filter(Boolean);
    if (!list.length) return;
    props.onAddStudents(list);
    setNames('');
    setAdding(false);
  };

  const copyAll = async () => {
    await navigator.clipboard.writeText(toPlain(cls, students));
    props.toast('All comments copied.');
    setExportOpen(false);
  };

  return (
    <section className="sheet" aria-label={`${cls.name} class sheet`}>
      <header className="sheet-head" style={{ background: col.bg, color: col.ink }}>
        <div className="sheet-title">
          <h1 className="display-sm">{cls.name}</h1>
          <p className="sheet-sub">
            {cls.subject || cls.level || 'Class'}
            {props.termName ? `, ${props.termName}` : ''}
          </p>
        </div>
        {props.onEditClass && (
          <button className="link on-colour" onClick={props.onEditClass} style={{ color: col.ink }}>
            Edit
          </button>
        )}
      </header>

      <div className="sheet-bar">
        <div className="tally mono">
          <span>
            <b>{students.length}</b> students
          </span>
          <span>
            <b>{drafted}</b> drafted
          </span>
          <span>
            <b>{finals}</b> final
          </span>
        </div>
        <div className="sheet-actions">
          {batch ? (
            <button className="pill ghost" onClick={props.onStopBatch}>
              Stop
            </button>
          ) : (
            <button className="pill ink" onClick={props.onBatch} disabled={!withNotes}>
              Write {withNotes || ''} comment{withNotes === 1 ? '' : 's'}
              <span className="pill-sub mono">{props.device === 'available' ? 'on this device' : 'names removed'}</span>
            </button>
          )}
          <div className="menu-wrap">
            <button className="pill ghost" onClick={() => setExportOpen((o) => !o)} disabled={!students.some(finalText)}>
              Export
            </button>
            {exportOpen && (
              <div className="menu" onMouseLeave={() => setExportOpen(false)}>
                <button onClick={copyAll}>Copy all comments</button>
                <button
                  onClick={() => {
                    download(`${slug(cls.name)}-comments.csv`, toCSV(cls, students));
                    setExportOpen(false);
                  }}
                >
                  Download CSV
                </button>
                <button
                  onClick={() => {
                    setExportOpen(false);
                    printDoc(`Form comments, ${cls.name}`, tableDoc(`${cls.name} form comments`, [['Student', 'Comment'], ...students.filter((s) => finalText(s)).map((s) => [s.name, finalText(s)])], { subtitle: props.termName, groupBy: false }));
                  }}
                >
                  Print / save as PDF
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {batch && (
        <div className="batch-bar" role="progressbar" aria-valuemin={0} aria-valuemax={batch.total} aria-valuenow={batch.done}>
          <div className="batch-fill" style={{ transform: `scaleX(${batch.done / batch.total})` }} />
          <span className="mono">
            Writing {batch.done + 1} of {batch.total}: {batch.current}
          </span>
        </div>
      )}

      <ol className="rows">
        <li className="row row-head mono" aria-hidden>
          <span>#</span>
          <span>Student</span>
          <span>Comment</span>
          <span>Status</span>
        </li>
        {students.map((s, i) => {
          const st = status(s);
          return (
            <li key={s.id}>
              <button
                className={`row ${s.id === props.activeId ? 'active' : ''} ${props.busyIds.has(s.id) ? 'busy' : ''}`}
                onClick={() => props.onSelect(s.id)}
              >
                <span className="mono idx">{String(i + 1).padStart(2, '0')}</span>
                <span className="row-name">{s.name}</span>
                <span className="row-preview">{finalText(s) || s.notes || <em>No notes yet</em>}</span>
                <span className={`mono row-status st-${st.toLowerCase()}`}>{props.busyIds.has(s.id) ? 'Writing…' : st}</span>
              </button>
            </li>
          );
        })}
      </ol>

      {adding ? (
        <div className="add-names">
          <label className="mono" htmlFor="names">
            Paste names, one per line
          </label>
          <textarea
            id="names"
            className="ruled"
            rows={5}
            value={names}
            onChange={(e) => setNames(e.target.value)}
            placeholder={'Adaeze Okafor\nTunde Bakare\nMaya Chen'}
            autoFocus
          />
          <div className="add-actions">
            <span className="mono hint">Names are saved in this browser only.</span>
            <button className="pill ghost" onClick={() => setAdding(false)}>
              Cancel
            </button>
            <button className="pill ink" onClick={submitNames} disabled={!names.trim()}>
              Add students
            </button>
          </div>
        </div>
      ) : (
        <button className="add-row" onClick={() => setAdding(true)}>
          + Add students
        </button>
      )}

    </section>
  );
}

