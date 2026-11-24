import { useMemo, useRef, useState } from 'react';
import { Navigate, useOutletContext, useParams, useSearchParams } from 'react-router-dom';
import { query, where } from 'firebase/firestore';
import { paths, saveOffering, saveSubjectRecord } from '../data/api';
import { useQuery } from '../data/hooks';
import { CLASS_COLOURS, type Offering, type StudentProfile, type SubjectRecord } from '../data/types';
import { assessmentsOf, bandsOf, computeResults, ordinal } from '../lib/results';
import { mapColumns, PrivacyBlock, readScoreSheet, writeRemark } from '../lib/ai';
import { friendlyError } from '../lib/errors';
import { guessMapping, matchStudent, readTable, type Table } from '../lib/sheetImport';
import { SourceStamp } from '../components/SourceStamp';
import { useToast } from '../ui/toast';
import { useSchool } from './SchoolContext';
import { rosterOf } from '../lib/reportCards';
import { AttendanceView } from './AttendanceView';
import type { WorkspaceCtx } from './Workspace';

type Tab = 'scores' | 'register' | 'students';
type Pending = { studentId: string; scores: Record<string, number> }[];

export function SubjectPage() {
  const { offeringId = '' } = useParams();
  const { schoolId, school, classes, offerings, myOfferings, members, isAdmin, term, me, policy } = useSchool();
  const ws = useOutletContext<WorkspaceCtx>();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const o = offerings.find((x) => x.id === offeringId) ?? null;
  const allowed = myOfferings.some((x) => x.id === offeringId);
  const cls = classes.find((c) => c.id === o?.classId) ?? null;
  const termId = term?.id ?? '';
  const assessments = assessmentsOf(school);
  const bands = bandsOf(school);

  const armStudents = useQuery<StudentProfile>(allowed && o ? query(paths.students(schoolId), where('classId', '==', o.classId)) : null, `sub-st:${o?.classId}:${allowed}`);
  const recs = useQuery<SubjectRecord>(
    allowed && termId ? query(paths.subjectRecords(schoolId), where('offeringId', '==', offeringId), where('termId', '==', termId)) : null,
    `sub-rec:${offeringId}:${termId}:${allowed}`,
  );
  const students = useMemo(() => (o ? rosterOf(o, [...armStudents.data.filter((s) => (s.status ?? 'active') === 'active')].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))) : []), [o, armStudents.data]);
  const byStudent = useMemo(() => new Map(recs.data.map((r) => [r.studentId, r])), [recs.data]);

  const [edits, setEdits] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<{ rows: Pending; from: string; source?: 'on_device' | 'in_cloud'; ms?: number; unmatched: string[] } | null>(null);
  const [mapping, setMapping] = useState<{ table: Table; nameColumn: string; idColumn: string; map: Record<string, string>; source?: 'on_device' | 'in_cloud' } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const tabs: { id: Tab; label: string }[] = [
    { id: 'scores', label: 'Score sheet' },
    ...(policy.attendanceBy === 'subject' ? [{ id: 'register' as Tab, label: 'Register' }] : []),
    { id: 'students', label: 'Students taking it' },
  ];
  const tab = (tabs.find((t) => t.id === params.get('tab'))?.id ?? 'scores') as Tab;

  const scores = useMemo(() => {
    const out: Record<string, Record<string, number>> = {};
    for (const s of students) {
      const base = { ...(byStudent.get(s.id)?.scores ?? {}) };
      for (const a of assessments) {
        const e = edits[`${s.id}:${a.key}`];
        if (e === undefined) continue;
        if (e.trim() === '') delete base[a.key];
        else if (!Number.isNaN(Number(e))) base[a.key] = Number(e);
      }
      out[s.id] = base;
    }
    return out;
  }, [students, byStudent, edits, assessments]);
  const results = computeResults(students.map((s) => s.id), scores, assessments, bands);

  if (!o || !cls) return <div className="ws-empty muted">This subject no longer exists.</div>;
  if (!allowed) return <Navigate to={`/s/${schoolId}`} replace />;

  const base = { termId, offeringId: o.id, classId: o.classId, subject: o.subject };
  const saveScores = (studentId: string, next: Record<string, number>) => saveSubjectRecord(schoolId, me.uid, { ...base, studentId, scores: next });

  const commit = async (s: StudentProfile, a: { key: string; max: number }, raw: string) => {
    const k = `${s.id}:${a.key}`;
    const stored = byStudent.get(s.id)?.scores?.[a.key];
    if (!term || raw === (stored ?? '').toString()) return;
    const n = Number(raw);
    if (raw.trim() !== '' && (Number.isNaN(n) || n < 0 || n > a.max)) {
      toast(`Scores in this column must be between 0 and ${a.max}.`, 'warn');
      return;
    }
    const next = { ...(byStudent.get(s.id)?.scores ?? {}) };
    if (raw.trim() === '') delete next[a.key];
    else next[a.key] = n;
    try {
      await saveScores(s.id, next);
      setEdits((e) => {
        const c = { ...e };
        delete c[k];
        return c;
      });
    } catch (e) {
      toast(friendlyError(e), 'error');
    }
  };

  const saveRemark = (s: StudentProfile, remark: string, source?: 'on_device' | 'in_cloud') =>
    saveSubjectRecord(schoolId, me.uid, { ...base, studentId: s.id, scores: byStudent.get(s.id)?.scores ?? {}, remark, remarkSource: source }).catch((e) => toast(friendlyError(e), 'error'));

  // ---- Scan a photo of a score sheet ----
  const scan = async (file: File) => {
    setBusy('Reading the score sheet…');
    try {
      const img = await shrink(file);
      const res = await readScoreSheet(img, students.map((s) => s.name), assessments, policy.cloudScanning);
      const rows: Pending = [];
      const unmatched: string[] = [];
      for (const r of res.rows) {
        const s = matchStudent(r.name, '', students);
        if (s && Object.keys(r.scores).length) rows.push({ studentId: s.id, scores: r.scores });
        else if (r.name) unmatched.push(r.name);
      }
      setPending({ rows, from: 'photo', source: res.source, ms: res.ms, unmatched });
      await ws.log({
        task: `Score sheet photo: ${o.subject}, ${cls.name}`,
        source: res.source,
        charsSent: 0,
        detail: res.source === 'on_device' ? `Gemini Nano read ${rows.length} rows on this device. The photo was not sent anywhere.` : `Cloud reading allowed by the school’s admin. The photo, which shows names, was sent to Gemini in the cloud.`,
      });
    } catch (e) {
      if (e instanceof PrivacyBlock) toast(e.message, 'warn');
      else toast(`Couldn’t read the sheet. ${friendlyError(e)}`, 'error');
    } finally {
      setBusy(null);
      ws.refreshDevice();
    }
  };

  // ---- Import a CBT export ----
  const importFile = async (file: File) => {
    setBusy('Reading the file…');
    try {
      const table = await readTable(file);
      if (!table.headers.length) throw new Error('That file has no header row.');
      let m: { nameColumn: string; idColumn: string; map: Record<string, string>; source?: 'on_device' | 'in_cloud' } = guessMapping(table.headers, assessments);
      try {
        const ai = await mapColumns(table.headers, assessments);
        m = { nameColumn: ai.nameColumn || m.nameColumn, idColumn: ai.idColumn || m.idColumn, map: Object.fromEntries(assessments.map((a) => [a.key, ai.map[a.key] || m.map[a.key]])), source: ai.source };
        await ws.log({ task: `CBT import: ${o.subject}, ${cls.name}`, source: ai.source, charsSent: ai.source === 'in_cloud' ? table.headers.join(',').length : 0, detail: `Matched columns from the header row only: ${table.headers.join(', ')}. No student rows were sent.` });
      } catch {
        /* keep the guess */
      }
      setMapping({ table, ...m });
    } catch (e) {
      toast(`Couldn’t read the file. ${friendlyError(e)}`, 'error');
    } finally {
      setBusy(null);
    }
  };
  const previewImport = () => {
    if (!mapping) return;
    const idx = (h: string) => mapping.table.headers.indexOf(h);
    const rows: Pending = [];
    const unmatched: string[] = [];
    for (const r of mapping.table.rows) {
      const name = mapping.nameColumn ? r[idx(mapping.nameColumn)] ?? '' : '';
      const id = mapping.idColumn ? r[idx(mapping.idColumn)] ?? '' : '';
      const s = matchStudent(name, id, students);
      const sc: Record<string, number> = {};
      for (const a of assessments) {
        const h = mapping.map[a.key];
        const v = h ? Number(String(r[idx(h)] ?? '').replace(/[^\d.]/g, '')) : NaN;
        if (h && !Number.isNaN(v) && String(r[idx(h)] ?? '').trim() !== '') sc[a.key] = Math.min(a.max, Math.max(0, v));
      }
      if (s && Object.keys(sc).length) rows.push({ studentId: s.id, scores: sc });
      else if (name || id) unmatched.push(name || id);
    }
    setPending({ rows, from: 'file', unmatched });
    setMapping(null);
  };

  const applyPending = async () => {
    if (!pending) return;
    setBusy('Saving scores…');
    try {
      for (const r of pending.rows) await saveScores(r.studentId, { ...(byStudent.get(r.studentId)?.scores ?? {}), ...r.scores });
      toast(`Saved scores for ${pending.rows.length} student${pending.rows.length === 1 ? '' : 's'}.`);
      setPending(null);
    } catch (e) {
      toast(friendlyError(e), 'error');
    } finally {
      setBusy(null);
    }
  };

  // ---- Remarks ----
  const draftRemarks = async () => {
    setBusy('Writing remarks…');
    let n = 0;
    try {
      for (const s of students) {
        const r = results.rows.get(s.id);
        if (!r?.grade || byStudent.get(s.id)?.remark) continue;
        const res = await writeRemark({
          kind: 'subject',
          subject: o.subject,
          facts: `Score ${r.total} out of ${results.maxTotal}, grade ${r.grade} (${r.remark})${policy.showPositions ? `, ${ordinal(r.position)} of ${results.ranked}` : ''}; class average ${results.average}.`,
          roster: students.map((x) => x.name),
          studentName: s.name,
        });
        await saveRemark(s, res.text, res.source);
        await ws.log({ task: `Subject remark: ${o.subject}`, source: res.source, charsSent: res.source === 'in_cloud' ? res.prompt.length : 0, detail: res.source === 'in_cloud' ? res.prompt : 'Written by Gemini Nano on this device.' });
        n++;
      }
      toast(n ? `Wrote ${n} remark${n === 1 ? '' : 's'}. Edit any you’d phrase differently.` : 'Every student with scores already has a remark.');
    } catch (e) {
      toast(`Stopped after ${n}. ${friendlyError(e)}`, 'error');
    } finally {
      setBusy(null);
      ws.refreshDevice();
    }
  };

  const teacherNames = members.filter((m) => o.teacherIds.includes(m.uid)).map((m) => m.name);
  const col = CLASS_COLOURS[cls.colour];

  return (
    <div className="class-wrap">
      <header className="subject-head" style={{ borderTopColor: col.bg }}>
        <div>
          <h1 className="display-sm">{o.subject}</h1>
          <p className="sheet-sub">
            {cls.name}, {term?.name}. {teacherNames.length ? `Taught by ${teacherNames.join(' and ')}.` : 'No teacher assigned yet.'}
          </p>
        </div>
      </header>
      <nav className="class-tabs" aria-label="Subject views">
        {tabs.map((t) => (
          <button key={t.id} className={tab === t.id ? 'on' : ''} aria-current={tab === t.id ? 'page' : undefined} onClick={() => setParams(t.id === 'scores' ? {} : { tab: t.id })}>
            {t.label}
          </button>
        ))}
      </nav>

      {tab === 'register' && <AttendanceView cls={cls} students={students} ws={ws} offering={o} />}

      {tab === 'students' && <RosterEditor offering={o} armStudents={[...armStudents.data.filter((s) => (s.status ?? 'active') === 'active')].sort((a, b) => a.name.localeCompare(b.name))} canEdit={isAdmin} />}

      {tab === 'scores' && (
        <section className="scores">
          <header className="att-bar">
            <p className="att-counts">
              {students.length} students. Out of {results.maxTotal}. Average {results.average}, highest {results.highest}, lowest {results.lowest}.
            </p>
            <div className="att-actions">
              <input ref={photoRef} type="file" accept="image/jpeg,image/png" capture="environment" hidden onChange={(e) => e.target.files?.[0] && scan(e.target.files[0])} />
              <input ref={fileRef} type="file" accept=".csv,.xlsx,text/csv" hidden onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} />
              <button className="pill ghost" onClick={() => photoRef.current?.click()} disabled={!!busy} title="Read a photographed score sheet with AI">
                Scan a score sheet
              </button>
              <button className="pill ghost" onClick={() => fileRef.current?.click()} disabled={!!busy} title="CSV or Excel exported from a CBT system">
                Import CBT results
              </button>
              {policy.subjectRemarks && (
                <button className="pill ink" onClick={draftRemarks} disabled={!!busy || !results.ranked}>
                  Draft remarks
                </button>
              )}
            </div>
          </header>
          {busy && <p className="att-photo-note">{busy}</p>}

          {mapping && (
            <div className="slip local import-map">
              <p className="slip-local">
                {mapping.source && <SourceStamp source={mapping.source} />} Check which column holds what. Only the header row was read by the AI.
              </p>
              <div className="form-grid">
                {(['nameColumn', 'idColumn'] as const).map((k) => (
                  <label key={k} className="field">
                    <span className="mono">{k === 'nameColumn' ? 'Student name' : 'Admission number'}</span>
                    <select value={mapping[k]} onChange={(e) => setMapping({ ...mapping, [k]: e.target.value })}>
                      <option value="">Not in this file</option>
                      {mapping.table.headers.map((h) => (
                        <option key={h}>{h}</option>
                      ))}
                    </select>
                  </label>
                ))}
                {assessments.map((a) => (
                  <label key={a.key} className="field">
                    <span className="mono">
                      {a.label} (out of {a.max})
                    </span>
                    <select value={mapping.map[a.key]} onChange={(e) => setMapping({ ...mapping, map: { ...mapping.map, [a.key]: e.target.value } })}>
                      <option value="">Not in this file</option>
                      {mapping.table.headers.map((h) => (
                        <option key={h}>{h}</option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
              <div className="slip-actions">
                <span className="muted small">{mapping.table.rows.length} rows in the file.</span>
                <button className="pill ghost" onClick={() => setMapping(null)}>
                  Cancel
                </button>
                <button className="pill ink" onClick={previewImport} disabled={!mapping.nameColumn && !mapping.idColumn}>
                  Match students
                </button>
              </div>
            </div>
          )}

          {pending && (
            <div className="slip local import-map">
              <p className="slip-local">
                {pending.source && <SourceStamp source={pending.source} ms={pending.ms} />}
                Found scores for {pending.rows.length} of {students.length} students{pending.from === 'photo' ? ' in the photo' : ' in the file'}. Check them below, then save.
              </p>
              {pending.unmatched.length > 0 && <p className="muted small">Couldn’t match: {pending.unmatched.join(', ')}.</p>}
              <div className="slip-actions">
                <button className="pill ghost" onClick={() => setPending(null)}>
                  Discard
                </button>
                <button className="ticket" onClick={applyPending} disabled={!pending.rows.length || !!busy}>
                  Save these scores
                </button>
              </div>
            </div>
          )}

          <div className="table-wrap">
            <table className="gradebook">
              <thead>
                <tr>
                  <th scope="col">Student</th>
                  {assessments.map((a) => (
                    <th key={a.key} scope="col" className="num">
                      {a.label} <span className="muted">/{a.max}</span>
                    </th>
                  ))}
                  <th scope="col" className="num">Total</th>
                  <th scope="col">Grade</th>
                  {policy.showPositions && <th scope="col" className="num">Position</th>}
                  {policy.subjectRemarks && <th scope="col">Remark</th>}
                </tr>
              </thead>
              <tbody>
                {students.map((s) => {
                  const r = results.rows.get(s.id)!;
                  const p = pending?.rows.find((x) => x.studentId === s.id);
                  const rec = byStudent.get(s.id);
                  return (
                    <tr key={s.id} className={p ? 'proposed' : ''}>
                      <th scope="row" className="gb-name">{s.name}</th>
                      {assessments.map((a) => {
                        const k = `${s.id}:${a.key}`;
                        const proposed = p?.scores[a.key];
                        return (
                          <td key={a.key} className="num">
                            {proposed !== undefined ? (
                              <span className="proposed-val" title="From the scan or file, not saved yet">
                                {proposed}
                              </span>
                            ) : (
                              <input
                                inputMode="decimal"
                                aria-label={`${s.name} ${a.label}`}
                                value={edits[k] ?? (scores[s.id][a.key] ?? '').toString()}
                                onChange={(e) => setEdits((x) => ({ ...x, [k]: e.target.value }))}
                                onBlur={(e) => commit(s, a, e.currentTarget.value)}
                                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                              />
                            )}
                          </td>
                        );
                      })}
                      <td className="num gb-total">{r.grade ? r.total : ''}</td>
                      <td>{r.grade && <b>{r.grade}</b>}</td>
                      {policy.showPositions && <td className="num">{r.position ? ordinal(r.position) : ''}</td>}
                      {policy.subjectRemarks && (
                        <td className="remark-cell">
                          <input
                            aria-label={`${s.name} remark`}
                            defaultValue={rec?.remark ?? ''}
                            key={rec?.remark ?? ''}
                            placeholder={r.remark}
                            onBlur={(e) => e.currentTarget.value !== (rec?.remark ?? '') && saveRemark(s, e.currentTarget.value)}
                          />
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {students.length === 0 && <p className="muted ws-empty">No students take this subject yet.</p>}
        </section>
      )}
    </div>
  );
}

function RosterEditor({ offering, armStudents, canEdit }: { offering: Offering; armStudents: StudentProfile[]; canEdit: boolean }) {
  const { schoolId } = useSchool();
  const toast = useToast();
  const everyone = offering.studentIds === null;
  const set = (ids: string[] | null) => saveOffering(schoolId, { ...offering, studentIds: ids }).catch((e) => toast(friendlyError(e), 'error'));
  return (
    <section className="page">
      <label className="switch">
        <input type="checkbox" checked={everyone} disabled={!canEdit} onChange={(e) => set(e.target.checked ? null : armStudents.map((s) => s.id))} />
        <span>
          <b>Everyone in the arm takes this subject</b>
          <small>Untick for an elective, then choose the students.</small>
        </span>
      </label>
      <ul className="roster-pick">
        {armStudents.map((s) => {
          const on = everyone || offering.studentIds!.includes(s.id);
          return (
            <li key={s.id}>
              <label>
                <input
                  type="checkbox"
                  checked={on}
                  disabled={!canEdit || everyone}
                  onChange={(e) => set(e.target.checked ? [...(offering.studentIds ?? []), s.id] : (offering.studentIds ?? []).filter((x) => x !== s.id))}
                />
                {s.name}
              </label>
            </li>
          );
        })}
      </ul>
      {!canEdit && <p className="muted small">Only admins change who takes a subject.</p>}
    </section>
  );
}

async function shrink(file: File) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  return { base64: c.toDataURL('image/jpeg', 0.9).split(',')[1], mimeType: 'image/jpeg' as const };
}
