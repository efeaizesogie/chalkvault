import { useCallback, useRef, useState } from 'react';
import { PrivacyBlock, writeComment, type PartialDraft } from '../lib/ai';
import { SetupError } from '../lib/firebase';
import { friendlyError } from '../lib/errors';
import { batchQueue } from '../lib/export';
import type { ClassRoom, LedgerEntry, Student } from '../data/types';
import type { Prefs } from '../ui/prefs';

type Img = { base64: string; mimeType: 'image/jpeg' | 'image/png' };

/** The privacy-routed comment writer, shared by the class page (single + batch). */
export function useCommentWriter(opts: {
  cls: ClassRoom | null;
  termName: string;
  students: Student[];
  prefs: Prefs;
  save: (s: Student) => Promise<void>;
  addLedger: (e: Omit<LedgerEntry, 'id' | 'at' | 'uid'>) => Promise<void>;
  toast: (t: string, k?: 'info' | 'warn' | 'error') => void;
  onDeviceChanged: () => void;
  /** Facts from the records (scores, attendance) to ground the comment. Never names. */
  getFacts?: (s: Student) => string;
}) {
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [batch, setBatch] = useState<{ done: number; total: number; current: string } | null>(null);
  const [live, setLive] = useState<Record<string, { draft: PartialDraft; source: 'on_device' | 'in_cloud' }>>({});
  const stop = useRef(false);
  const o = useRef(opts);
  o.current = opts;

  const run = useCallback(async (s: Student, image?: Img) => {
    const { cls, termName, students, prefs, save, addLedger, toast } = o.current;
    if (!cls) return false;
    if (s.status === 'approved') {
      toast(`${s.name}’s comment is approved and locked. Ask an admin to unlock it first.`, 'warn');
      return false;
    }
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
        subject: cls.subject || cls.level,
        term: termName,
        tone: prefs.tone,
        level: prefs.level,
        roster: students.map((x) => x.name),
        image,
        allowCloudFallback: prefs.allowCloudFallback,
        facts: o.current.getFacts?.(s),
        onPartial: (draft, source) => setLive((l) => ({ ...l, [s.id]: { draft, source } })),
      });
      await save({ ...s, draft: res.draft, final: undefined, status: undefined });
      await addLedger({
        task: `Comment${image ? ' + photo' : ''} · ${cls.name}`,
        source: res.draft.source,
        charsSent: res.sent ? res.sent.text.length : 0,
        detail:
          res.draft.source === 'on_device'
            ? `Gemini Nano on this device · ${(res.ms / 1000).toFixed(1)}s · 0 bytes sent to AI`
            : `Cloud Gemini · names removed (${res.sent?.removed.length ?? 0}) · ${(res.ms / 1000).toFixed(1)}s\n${res.sent?.text ?? ''}`,
      });
      return true;
    } catch (e) {
      if (e instanceof PrivacyBlock) {
        await addLedger({ task: `Comment · ${cls.name}`, source: 'blocked', charsSent: 0, detail: e.message }).catch(() => {});
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
      setLive((l) => {
        const n = { ...l };
        delete n[s.id];
        return n;
      });
      o.current.onDeviceChanged();
    }
  }, []);

  const runBatch = useCallback(async () => {
    const queue = batchQueue(o.current.students);
    if (!queue.length) {
      o.current.toast('Add notes to students first. Students marked final are skipped.');
      return;
    }
    stop.current = false;
    let done = 0;
    for (const s of queue) {
      if (stop.current) break;
      setBatch({ done, total: queue.length, current: s.name });
      // Re-read the latest version of this student (notes may have been edited during the batch).
      const latest = o.current.students.find((x) => x.id === s.id) ?? s;
      if (await run(latest)) done++;
    }
    setBatch(null);
    o.current.toast(stop.current ? `Stopped after ${done} comments.` : `Wrote ${done} comment${done === 1 ? '' : 's'}.`);
  }, [run]);

  return { run, runBatch, stopBatch: () => (stop.current = true), busyIds, batch, live };
}
