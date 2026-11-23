import { useState } from 'react';
import { CLASS_COLOURS, uid, type ClassColour, type ClassRoom } from '../lib/db';

export function AddClassDialog(props: {
  initial: ClassRoom | null;
  usedColours: ClassColour[];
  onSave: (c: ClassRoom) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const i = props.initial;
  const firstFree = (Object.keys(CLASS_COLOURS) as ClassColour[]).find((k) => !props.usedColours.includes(k)) ?? 'chalk';
  const [name, setName] = useState(i?.name ?? '');
  const [subject, setSubject] = useState(i?.subject ?? '');
  const [term, setTerm] = useState(i?.term ?? '');
  const [colour, setColour] = useState<ClassColour>(i?.colour ?? firstFree);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    props.onSave({
      id: i?.id ?? uid(),
      name: name.trim(),
      subject: subject.trim(),
      term: term.trim(),
      colour,
      createdAt: i?.createdAt ?? Date.now(),
    });
  };

  return (
    <div className="scrim" onClick={props.onClose}>
      <form className="dialog" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <p className="mono eyebrow">{i ? 'Edit class' : 'New class'}</p>
        <h2 className="h2">{i ? i.name : 'Add a class'}</h2>
        <label className="field">
          <span className="mono">Class name</span>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Year 5 Maths, JSS2 Blue, Grade 3B" />
        </label>
        <div className="field-row">
          <label className="field">
            <span className="mono">Subject</span>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Mathematics" />
          </label>
          <label className="field">
            <span className="mono">Term</span>
            <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Autumn term" />
          </label>
        </div>
        <fieldset className="field">
          <legend className="mono">Colour</legend>
          <div className="swatches">
            {(Object.keys(CLASS_COLOURS) as ClassColour[]).map((k) => (
              <button
                type="button"
                key={k}
                className={`swatch ${colour === k ? 'on' : ''}`}
                style={{ background: CLASS_COLOURS[k].bg }}
                onClick={() => setColour(k)}
                aria-label={CLASS_COLOURS[k].label}
                aria-pressed={colour === k}
              />
            ))}
          </div>
        </fieldset>
        <div className="dialog-actions">
          {props.onDelete && (
            <button type="button" className="link danger" onClick={props.onDelete}>
              Delete class
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="pill ghost" onClick={props.onClose}>
            Cancel
          </button>
          <button type="submit" className="ticket" disabled={!name.trim()}>
            {i ? 'Save' : 'Add class'}
          </button>
        </div>
      </form>
    </div>
  );
}
