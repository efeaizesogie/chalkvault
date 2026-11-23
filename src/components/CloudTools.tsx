import { useMemo, useState } from 'react';
import type { LedgerEntry, Student } from '../data/types';
import { alignToStandards, LANGUAGES, prepareOutbound, SetupError, translateTemplate } from '../lib/ai';
import { restore } from '../lib/redact';
import { SourceStamp } from './SourceStamp';
import { friendlyError } from '../lib/errors';

type Task = 'translate' | 'align';

export function CloudTools(props: {
  student: Student;
  comment: string;
  roster: string[];
  onSave: (s: Student) => Promise<void>;
  onLedger: () => void;
  addLedger: (e: Omit<LedgerEntry, 'id' | 'at' | 'uid'>) => Promise<void>;
  onUseComment: (c: string) => void;
  toast: (t: string, k?: 'info' | 'warn' | 'error') => void;
}) {
  const s = props.student;
  const [task, setTask] = useState<Task | null>(null);
  const [language, setLanguage] = useState('Yoruba');
  const [framework, setFramework] = useState('Common Core State Standards for Mathematics');
  const [sending, setSending] = useState(false);
  const [aligned, setAligned] = useState<{ comment: string; standards: string[]; ms: number } | null>(null);
  const [lastMs, setLastMs] = useState<number | undefined>();

  const outbound = useMemo(() => prepareOutbound(props.comment, s.name, props.roster), [props.comment, s.name, props.roster]);

  const send = async () => {
    if (!task) return;
    setSending(true);
    try {
      if (task === 'translate') {
        const r = await translateTemplate(outbound.text, language);
        const text = restore(r.text, s.name); // the real name goes back in locally
        await props.onSave({ ...s, translation: { language, text, at: Date.now() } });
        await props.addLedger({ task: `Parent translation · ${language}`, source: 'in_cloud', charsSent: r.prompt.length, detail: r.prompt });
        setLastMs(r.ms);
      } else {
        const r = await alignToStandards(outbound.text, framework);
        setAligned({ comment: restore(r.comment, s.name), standards: r.standards, ms: r.ms });
        await props.addLedger({ task: 'Align to standards', source: 'in_cloud', charsSent: r.prompt.length, detail: r.prompt });
      }
      props.onLedger();
      setTask(null);
    } catch (e) {
      props.toast(e instanceof SetupError ? e.message : `Cloud request failed. ${friendlyError(e)}`, 'error');
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="cloud">
      <header className="cloud-head">
        <p className="mono eyebrow">Cloud helpers · names removed first</p>
        <div className="cloud-buttons">
          <button className={`pill ghost ${task === 'translate' ? 'on' : ''}`} onClick={() => setTask(task === 'translate' ? null : 'translate')}>
            Translate for parents
          </button>
          <button className={`pill ghost ${task === 'align' ? 'on' : ''}`} onClick={() => setTask(task === 'align' ? null : 'align')}>
            Align to standards
          </button>
        </div>
      </header>

      {task && (
        <div className="slip">
          <div className="slip-controls">
            {task === 'translate' ? (
              <label className="field inline">
                <span className="mono">Language</span>
                <select value={language} onChange={(e) => setLanguage(e.target.value)}>
                  {LANGUAGES.map((l) => (
                    <option key={l}>{l}</option>
                  ))}
                </select>
              </label>
            ) : (
              <label className="field inline grow">
                <span className="mono">Standards</span>
                <input value={framework} onChange={(e) => setFramework(e.target.value)} />
              </label>
            )}
          </div>
          <p className="mono slip-label">This is exactly what will leave this device</p>
          <blockquote className="slip-text">{outbound.text}</blockquote>
          {outbound.removed.length > 0 && (
            <p className="slip-removed">
              Removed on this device:{' '}
              {[...new Map(outbound.removed.map((r) => [r.original.toLowerCase(), r])).values()].map((r, i) => (
                <span key={i} className="removed">
                  <s>{r.original}</s> → {r.replacement}
                </span>
              ))}
            </p>
          )}
          <div className="slip-actions">
            <button className="pill ghost" onClick={() => setTask(null)}>
              Cancel
            </button>
            <button className="pill sienna" onClick={send} disabled={sending || !outbound.text.trim()}>
              {sending ? 'Sending…' : 'Send to cloud'}
            </button>
          </div>
        </div>
      )}

      {aligned && (
        <div className="cloud-result">
          <div className="result-top">
            <SourceStamp source="in_cloud" ms={aligned.ms} />
            <span className="mono meta">Aligned wording</span>
          </div>
          <p>{aligned.comment}</p>
          {aligned.standards.length > 0 && (
            <ul className="standards">
              {aligned.standards.map((x) => (
                <li key={x} className="mono">
                  {x}
                </li>
              ))}
            </ul>
          )}
          <div className="result-actions">
            <button className="link" onClick={() => setAligned(null)}>
              Discard
            </button>
            <button
              className="pill ink"
              onClick={() => {
                props.onUseComment(aligned.comment);
                setAligned(null);
              }}
            >
              Use this wording
            </button>
          </div>
        </div>
      )}

      {s.translation && (
        <div className="cloud-result">
          <div className="result-top">
            <SourceStamp source="in_cloud" ms={lastMs} />
            <span className="mono meta">For parents · {s.translation.language}</span>
          </div>
          <p lang={langCode(s.translation.language)}>{s.translation.text}</p>
          <div className="result-actions">
            <span className="mono hint">Name added back on this device.</span>
            <button
              className="pill ghost"
              onClick={async () => {
                await navigator.clipboard.writeText(s.translation!.text);
                props.toast('Translation copied.');
              }}
            >
              Copy
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function langCode(l: string) {
  return (
    { Yoruba: 'yo', Hausa: 'ha', Igbo: 'ig', Spanish: 'es', French: 'fr', Portuguese: 'pt', Arabic: 'ar', 'Mandarin Chinese': 'zh', 'Haitian Creole': 'ht', Vietnamese: 'vi' } as Record<string, string>
  )[l];
}
