import { useCallback, useEffect, useRef, useState } from 'react';
import {
  addLedger,
  CLASS_COLOURS,
  deleteClass,
  listClasses,
  listLedger,
  listStudents,
  saveClass,
  saveStudent,
  getSetting,
  setSetting,
  uid,
  type ClassColour,
  type ClassRoom,
  type LedgerEntry,
  type Student,
} from './lib/db';
import { deviceStatus, PrivacyBlock, SetupError, writeComment, type DeviceStatus } from './lib/ai';
import { isConfigured } from './firebase-config';
import { SAMPLE_CLASS, SAMPLE_STUDENTS } from './sample';
import { batchQueue } from './lib/export';
import { friendlyError } from './lib/errors';
import { ClassSheet } from './components/ClassSheet';
import { StudentDesk } from './components/StudentDesk';
import { DeviceChip } from './components/DeviceChip';
import { Ledger } from './components/Ledger';
import { AddClassDialog } from './components/AddClassDialog';
import { Toasts, type Toast } from './components/Toasts';

export interface Prefs {
  tone: string;
  level: string;
  allowCloudFallback: boolean;
}

export function App() {
  const [classes, setClasses] = useState<ClassRoom[]>([]);
  const [activeClassId, setActiveClassId] = useState<string | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [activeStudentId, setActiveStudentId] = useState<string | null>(null);
  const [device, setDevice] = useState<DeviceStatus>('no-api');
  const [prefs, setPrefs] = useState<Prefs>({ tone: 'Warm', level: 'plain', allowCloudFallback: true });
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [showLedger, setShowLedger] = useState(false);
  const [addingClass, setAddingClass] = useState<ClassRoom | 'new' | null>(null);
  const [batch, setBatch] = useState<{ done: number; total: number; current: string } | null>(null);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [loaded, setLoaded] = useState(false);
  const stopBatch = useRef(false);

  const toast = useCallback((text: string, kind: Toast['kind'] = 'info') => {
    const id = uid();
    setToasts((t) => [...t, { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 6000);
  }, []);

  const refreshDevice = useCallback(async () => setDevice(await deviceStatus()), []);
  const refreshLedger = useCallback(async () => setLedger(await listLedger()), []);

  useEffect(() => {
    (async () => {
      const cs = await listClasses();
      setClasses(cs);
      const last = await getSetting<string | null>('activeClass', null);
      setActiveClassId(cs.find((c) => c.id === last)?.id ?? cs[0]?.id ?? null);
      setPrefs(await getSetting<Prefs>('prefs', { tone: 'Warm', level: 'plain', allowCloudFallback: true }));
      await refreshDevice();
      await refreshLedger();
      setLoaded(true);
    })();
    const t = setInterval(refreshDevice, 15000);
    return () => clearInterval(t);
  }, [refreshDevice, refreshLedger]);

  useEffect(() => {
    if (!activeClassId) {
      setStudents([]);
      return;
    }
    setSetting('activeClass', activeClassId);
    listStudents(activeClassId).then((s) => {
      setStudents(s);
      setActiveStudentId((cur) => (s.some((x) => x.id === cur) ? cur : s[0]?.id ?? null));
    });
  }, [activeClassId]);

  const updatePrefs = (p: Partial<Prefs>) => {
    const next = { ...prefs, ...p };
    setPrefs(next);
    setSetting('prefs', next);
  };

  const activeClass = classes.find((c) => c.id === activeClassId) ?? null;
  const activeStudent = students.find((s) => s.id === activeStudentId) ?? null;

  const putStudent = async (s: Student) => {
    await saveStudent(s);
    setStudents((list) => {
      const i = list.findIndex((x) => x.id === s.id);
      if (i === -1) return [...list, s].sort((a, b) => a.order - b.order);
      const copy = list.slice();
      copy[i] = s;
      return copy;
    });
  };

  const addStudents = async (names: string[]) => {
    if (!activeClassId) return;
    let order = students.reduce((m, s) => Math.max(m, s.order), 0);
    const created: Student[] = [];
    for (const name of names) {
      const s: Student = { id: uid(), classId: activeClassId, name, pronoun: 'they', notes: '', order: ++order };
      await saveStudent(s);
      created.push(s);
    }
    setStudents((l) => [...l, ...created]);
    if (!activeStudentId && created[0]) setActiveStudentId(created[0].id);
  };

  const saveClassDialog = async (c: ClassRoom) => {
    await saveClass(c);
    setClasses((cs) => (cs.some((x) => x.id === c.id) ? cs.map((x) => (x.id === c.id ? c : x)) : [...cs, c]));
    setActiveClassId(c.id);
    setAddingClass(null);
  };

  const removeClass = async (c: ClassRoom) => {
    if (!confirm(`Delete ${c.name} and all its students and comments from this device? This cannot be undone.`)) return;
    await deleteClass(c.id);
    const rest = classes.filter((x) => x.id !== c.id);
    setClasses(rest);
    setActiveClassId(rest[0]?.id ?? null);
    setAddingClass(null);
  };

  const loadSample = async () => {
    const used = new Set(classes.map((c) => c.colour));
    const colour = (Object.keys(CLASS_COLOURS) as ClassColour[]).find((k) => !used.has(k)) ?? 'chalk';
    const c: ClassRoom = { id: uid(), ...SAMPLE_CLASS, colour, createdAt: Date.now() };
    await saveClass(c);
    let order = 0;
    for (const s of SAMPLE_STUDENTS) await saveStudent({ id: uid(), classId: c.id, ...s, order: ++order });
    setClasses((cs) => [...cs, c]);
    setActiveClassId(c.id);
  };

  /** Write one comment through the privacy router. Returns false if it failed. */
  const runComment = async (s: Student, image?: { base64: string; mimeType: 'image/jpeg' | 'image/png' }) => {
    if (!activeClass) return false;
    if (!s.notes.trim() && !image) {
      toast(`Add some notes for ${s.name} first.`);
      return false;
    }
    setBusyIds((b) => new Set(b).add(s.id));
    try {
      const res = await writeComment({
        name: s.name,
        pronoun: s.pronoun,
        notes: s.notes,
        subject: activeClass.subject,
        term: activeClass.term,
        tone: prefs.tone,
        level: prefs.level,
        roster: students.map((x) => x.name),
        image,
        allowCloudFallback: prefs.allowCloudFallback,
      });
      const fresh = { ...s, draft: res.draft, final: undefined };
      await putStudent(fresh);
      await addLedger({
        task: `Comment${image ? ' + photo' : ''}`,
        source: res.draft.source,
        charsSent: res.sent ? res.sent.text.length : 0,
        detail:
          res.draft.source === 'on_device'
            ? `Gemini Nano on this device · ${(res.ms / 1000).toFixed(1)}s · 0 bytes sent`
            : `Cloud Gemini · names removed (${res.sent?.removed.length ?? 0}) · ${(res.ms / 1000).toFixed(1)}s\n${res.sent?.text ?? ''}`,
      });
      refreshLedger();
      return true;
    } catch (e) {
      if (e instanceof PrivacyBlock) {
        await addLedger({ task: 'Comment', source: 'blocked', charsSent: 0, detail: e.message });
        refreshLedger();
        toast(e.message, 'warn');
      } else if (e instanceof SetupError) toast(e.message, 'warn');
      else toast(`Could not write ${s.name}'s comment. ${friendlyError(e)}`, 'error');
      return false;
    } finally {
      setBusyIds((b) => {
        const n = new Set(b);
        n.delete(s.id);
        return n;
      });
      refreshDevice();
    }
  };

  const runBatch = async () => {
    const queue = batchQueue(students);
    if (!queue.length) {
      toast('Add notes to students first. Students marked final are skipped.');
      return;
    }
    stopBatch.current = false;
    let done = 0;
    for (const s of queue) {
      if (stopBatch.current) break;
      setBatch({ done, total: queue.length, current: s.name });
      const ok = await runComment(s);
      if (!ok && !isConfigured) break;
      done++;
    }
    setBatch(null);
    toast(stopBatch.current ? `Stopped after ${done} comments.` : `Wrote ${done} comments.`, 'info');
  };

  if (!loaded) return <div className="boot">Opening your markbook…</div>;

  return (
    <div className="app">
      <header className="masthead">
        <div className="brand">
          <span className="wordmark">Chalkvault</span>
          <span className="mono tagline">Report comments · names stay on this device</span>
        </div>
        <div className="masthead-actions">
          <DeviceChip
            status={device}
            allowCloud={prefs.allowCloudFallback}
            onToggleCloud={(v) => updatePrefs({ allowCloudFallback: v })}
            onRefresh={refreshDevice}
            toast={toast}
          />
          <button className="pill ghost" onClick={() => setShowLedger(true)}>
            Ledger <span className="mono count">{ledger.length}</span>
          </button>
        </div>
      </header>

      {!isConfigured && (
        <div className="setup-banner">
          <span className="mono">Setup</span> Firebase isn't connected yet, so comments can't be written. Add your project values to{' '}
          <code>src/firebase-config.ts</code>. Everything else works.
        </div>
      )}

      <div className="board">
        <nav className="rail" aria-label="Classes">
          <div className="rail-head mono">Classes</div>
          {classes.map((c) => {
            const col = CLASS_COLOURS[c.colour];
            return (
              <button
                key={c.id}
                className={`class-tab ${c.id === activeClassId ? 'active' : ''}`}
                style={{ background: col.bg, color: col.ink }}
                onClick={() => setActiveClassId(c.id)}
                onDoubleClick={() => setAddingClass(c)}
              >
                <span className="class-tab-name">{c.name}</span>
                <span className="mono class-tab-meta">{c.subject}</span>
              </button>
            );
          })}
          <button className="rail-add" onClick={() => setAddingClass('new')}>
            + Add a class
          </button>
          {classes.length > 0 && (
            <button className="rail-add quiet" onClick={loadSample}>
              + Sample class
            </button>
          )}
        </nav>

        {activeClass ? (
          <>
            <ClassSheet
              cls={activeClass}
              students={students}
              activeId={activeStudentId}
              busyIds={busyIds}
              batch={batch}
              onSelect={setActiveStudentId}
              onAddStudents={addStudents}
              onBatch={runBatch}
              onStopBatch={() => (stopBatch.current = true)}
              onEditClass={() => setAddingClass(activeClass)}
              device={device}
              toast={toast}
            />
            <StudentDesk
              key={activeStudent?.id ?? 'none'}
              cls={activeClass}
              student={activeStudent}
              roster={students.map((s) => s.name)}
              prefs={prefs}
              onPrefs={updatePrefs}
              device={device}
              busy={!!activeStudent && busyIds.has(activeStudent.id)}
              onSave={putStudent}
              onWrite={runComment}
              onLedger={refreshLedger}
              onRemoved={(id) => {
                const rest = students.filter((x) => x.id !== id);
                setStudents(rest);
                setActiveStudentId(rest[0]?.id ?? null);
              }}
              toast={toast}
            />
          </>
        ) : (
          <section className="empty">
            <p className="mono eyebrow">An empty markbook</p>
            <h1 className="display">
              Write every report comment <em>without</em> sending a child's name anywhere.
            </h1>
            <p className="lede">
              Chalkvault turns your rough notes into warm, specific report comments using Gemini Nano, the AI built into Chrome.
              Names and notes are stored only in this browser. Cloud AI is only used for wording and translation, and only after
              names are removed.
            </p>
            <div className="empty-actions">
              <button className="ticket" onClick={() => setAddingClass('new')}>
                Add your first class
              </button>
              <button className="pill ghost" onClick={loadSample}>
                Try a sample class
              </button>
            </div>
          </section>
        )}
      </div>

      <footer className="foot mono">
        <span>Stored in this browser only (IndexedDB). Nothing is synced.</span>
        <a href="https://github.com/efeaizesogie/chalkvault" target="_blank" rel="noreferrer">
          Open source · Apache-2.0
        </a>
      </footer>

      {showLedger && <Ledger entries={ledger} onClose={() => setShowLedger(false)} onCleared={refreshLedger} />}
      {addingClass && (
        <AddClassDialog
          initial={addingClass === 'new' ? null : addingClass}
          usedColours={classes.map((c) => c.colour)}
          onSave={saveClassDialog}
          onDelete={addingClass === 'new' ? undefined : () => removeClass(addingClass)}
          onClose={() => setAddingClass(null)}
        />
      )}
      <Toasts items={toasts} />
    </div>
  );
}
