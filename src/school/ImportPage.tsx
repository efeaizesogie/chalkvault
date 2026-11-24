import { useMemo, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { getDocs, writeBatch } from 'firebase/firestore';
import { addArm, addOffering, blankStudent, createInvite, paths, saveSubjectRecord } from '../data/api';
import { useQuery } from '../data/hooks';
import { COLOUR_KEYS, type Offering, type StudentProfile } from '../data/types';
import { PAGE_KIND_LABEL, PrivacyBlock, readRecordPage } from '../lib/ai';
import { friendlyError } from '../lib/errors';
import { buildPlan, tableToReadings, type ImportPage as Page, type Plan } from '../lib/importPlan';
import { readTable } from '../lib/sheetImport';
import { assessmentsOf } from '../lib/results';
import { naira } from '../lib/fees';
import { getDb } from '../lib/firebase';
import { SourceStamp } from '../components/SourceStamp';
import { useToast } from '../ui/toast';
import { useSchool } from './SchoolContext';
import type { WorkspaceCtx } from './Workspace';
import './import.css';

/** Shrinks a photo for the model (and a thumbnail for the review screen). */
async function prepImage(file: File) {
  const bmp = await createImageBitmap(file);
  const draw = (max: number, q: number) => {
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k);
    c.height = Math.round(bmp.height * k);
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', q);
  };
  return { base64: draw(1600, 0.88).split(',')[1], mimeType: 'image/jpeg' as const, thumb: draw(280, 0.7) };
}

const FIELD_LABEL: Record<string, string> = { name: 'name', admissionNo: 'admission number', gender: 'gender', dob: 'date of birth', guardianName: 'parent', guardianPhone: 'phone', balance: 'balance' };

/** Bring a school's existing records in: photos of class lists, score sheets, ledgers and staff lists, or spreadsheets. */
export function ImportPage() {
  const { schoolId, school, classes, levelsOf, term, me, policy } = useImportCtx();
  const ws = useOutletContext<WorkspaceCtx>();
  const toast = useToast();
  const students = useQuery<StudentProfile>(paths.students(schoolId), `imp-st:${schoolId}`);
  const [pages, setPages] = useState<Page[]>([]);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [busy, setBusy] = useState(false);
  const [applying, setApplying] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const columns = assessmentsOf(school);
  const allowCloud = policy.cloudScanning;

  const patchPage = (id: string, p: Partial<Page>) => setPages((xs) => xs.map((x) => (x.id === id ? { ...x, ...p } : x)));

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setDone(null);
    const queue: { page: Page; file: File }[] = [...files].map((file, i) => ({ file, page: { id: `p${Date.now()}${i}`, file: file.name, status: 'waiting' } }));
    setPages((xs) => [...xs, ...queue.map((q) => q.page)]);
    setBusy(true);
    const readings: Page[] = [];
    // One page at a time, so each stays inside Gemini Nano's context window.
    for (const { file, page } of queue) {
      patchPage(page.id, { status: 'reading' });
      try {
        if (/\.(csv|xlsx|xlsm)$/i.test(file.name)) {
          const rs = tableToReadings(await readTable(file));
          if (!rs.length) throw new Error('No column of names was found in this file.');
          const parts = rs.map((reading, i) => ({ ...page, id: `${page.id}-${i}`, file: `${file.name}${rs.length > 1 ? `, ${reading.className || 'no class'}` : ''}`, status: 'done' as const, reading, source: 'file' as const }));
          setPages((xs) => xs.flatMap((x) => (x.id === page.id ? parts : [x])));
          readings.push(...parts);
        } else if (file.type.startsWith('image/')) {
          const img = await prepImage(file);
          patchPage(page.id, { thumb: img.thumb });
          const res = await readRecordPage(img, { levels: school.levels, subjects: school.subjects, columns }, allowCloud);
          const done: Page = { ...page, thumb: img.thumb, status: 'done', reading: res, source: res.source, ms: res.ms };
          patchPage(page.id, done);
          readings.push(done);
          await ws.log({
            task: 'Document import',
            source: res.source,
            charsSent: res.source === 'in_cloud' ? img.base64.length : 0,
            detail: res.source === 'on_device' ? `Gemini Nano sorted and read “${file.name}” on this device in ${(res.ms / 1000).toFixed(1)} s. Nothing was sent.` : `“${file.name}” was sent to the cloud to be read, because cloud scanning is switched on.`,
          });
        } else if (/\.pdf$/i.test(file.name)) {
          throw new Error('PDFs aren’t read yet. Take a photo or screenshot of each page instead.');
        } else {
          throw new Error('This kind of file can’t be read. Use photos, CSV or Excel.');
        }
      } catch (e) {
        patchPage(page.id, { status: 'error', error: e instanceof PrivacyBlock ? e.message : friendlyError(e) });
      }
    }
    setBusy(false);
    ws.refreshDevice();
    setPages((all) => {
      const ready = all.filter((x) => x.status === 'done');
      setPlan(buildPlan(ready.length ? ready : readings, classes, school.levels, students.data));
      return all;
    });
  };

  const counts = useMemo(() => {
    if (!plan) return null;
    const inc = plan.students.filter((s) => s.include);
    return {
      newStudents: inc.filter((s) => !s.matchId && !!plan.arms.find((a) => a.key === s.armKey)?.level).length,
      updates: inc.filter((s) => s.matchId).length,
      newArms: plan.arms.filter((a) => !a.classId && a.level && plan.students.some((s) => s.include && s.armKey === a.key)).length,
      scores: plan.scores.filter((s) => s.include).reduce((n, s) => n + s.rows.length, 0),
      balances: inc.filter((s) => typeof s.balance === 'number' && s.balance > 0).length,
      staff: plan.staff.filter((s) => s.include).length,
      noArm: inc.filter((s) => !s.matchId && !plan.arms.find((a) => a.key === s.armKey)?.level).length,
    };
  }, [plan]);

  const setArm = (key: string, p: Partial<Plan['arms'][number]>) => setPlan((x) => x && { ...x, arms: x.arms.map((a) => (a.key === key ? { ...a, ...p } : a)) });
  const setStudent = (key: string, p: Partial<Plan['students'][number]>) => setPlan((x) => x && { ...x, students: x.students.map((s) => (s.key === key ? { ...s, ...p } : s)) });

  const apply = async () => {
    if (!plan || !term) return;
    setApplying(true);
    try {
      // 1. Arms.
      const armIds = new Map<string, string>();
      let colour = classes.length;
      for (const a of plan.arms) {
        if (a.classId) armIds.set(a.key, a.classId);
        else if (a.level && plan.students.some((s) => s.include && s.armKey === a.key)) {
          const existing = classes.find((c) => c.level === a.level && (c.arm ?? '') === a.arm);
          armIds.set(a.key, existing ? existing.id : await addArm(schoolId, a.level, a.arm || 'A', school.subjects, COLOUR_KEYS[colour++ % COLOUR_KEYS.length]));
        }
      }
      // 2. Students: new ones created, matched ones filled in where blank.
      const ids = new Map<string, string>();
      let b = writeBatch(getDb());
      let n = 0;
      const flush = async () => {
        if (n) await b.commit();
        b = writeBatch(getDb());
        n = 0;
      };
      let order = students.data.length;
      for (const s of plan.students.filter((x) => x.include)) {
        const old = s.matchId ? students.data.find((x) => x.id === s.matchId) : undefined;
        const classId = old?.classId ?? armIds.get(s.armKey);
        if (!classId) continue;
        const base = old ?? blankStudent(classId, s.name, ++order);
        const guardians = base.guardians.length || !(s.guardianName || s.guardianPhone) ? base.guardians : [{ name: s.guardianName ?? '', relationship: 'Parent', phone: s.guardianPhone ?? '', email: '', language: 'English' }];
        const next: StudentProfile = {
          ...base,
          admissionNo: base.admissionNo || s.admissionNo || '',
          dob: base.dob || (/^\d{4}-\d{2}-\d{2}$/.test(s.dob ?? '') ? s.dob! : ''),
          pronoun: base.pronoun !== 'they' ? base.pronoun : s.gender === 'female' ? 'she' : s.gender === 'male' ? 'he' : 'they',
          guardians,
          ...(typeof s.balance === 'number' && s.balance > 0 ? { openingBalance: s.balance } : {}),
        };
        b.set(paths.student(schoolId, next.id), next);
        ids.set(s.key, next.id);
        if (++n >= 400) await flush();
      }
      await flush();
      // 3. Scores, into the current term, in each arm's subject.
      const offs = (await getDocs(paths.offerings(schoolId))).docs.map((d) => d.data() as Offering);
      let scoreCount = 0;
      for (const sp of plan.scores.filter((x) => x.include && x.subject)) {
        const classId = armIds.get(sp.armKey);
        if (!classId) continue;
        let o = offs.find((x) => x.classId === classId && x.subject.toLowerCase() === sp.subject.toLowerCase());
        if (!o) {
          await addOffering(schoolId, classId, sp.subject);
          o = (await getDocs(paths.offerings(schoolId))).docs.map((d) => d.data() as Offering).find((x) => x.classId === classId && x.subject === sp.subject);
        }
        if (!o) continue;
        for (const r of sp.rows) {
          const sid = ids.get(r.studentKey);
          if (!sid) continue;
          await saveSubjectRecord(schoolId, me.uid, { termId: term.id, offeringId: o.id, classId, studentId: sid, subject: o.subject, scores: r.scores });
          scoreCount++;
        }
      }
      // 4. Staff: an invite each, with their form class and subjects where they could be matched.
      let invites = 0;
      const allClasses = (await getDocs(paths.classes(schoolId))).docs.map((d) => d.data() as { id: string; name: string });
      for (const st of plan.staff.filter((x) => x.include)) {
        const formIds = allClasses.filter((c) => (st.classes ?? []).some((n) => n.replace(/\W/g, '').toLowerCase() === c.name.replace(/\W/g, '').toLowerCase())).map((c) => c.id);
        const subj = offs.filter((o) => (st.subjects ?? []).some((x) => x.toLowerCase() === o.subject.toLowerCase()) && (!formIds.length || formIds.includes(o.classId)));
        await createInvite(schoolId, me.uid, /admin|principal|head|vice/i.test(st.role ?? '') ? 'admin' : 'teacher', formIds, st.name, subj);
        invites++;
      }
      const msg = `Imported ${ids.size} students, ${scoreCount} scores and ${invites} staff invites.`;
      setDone(msg);
      toast(msg);
      setPlan(null);
      setPages([]);
    } catch (e) {
      toast(friendlyError(e), 'error');
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="page import">
      <header className="page-head">
        <div>
          <h1 className="display-sm">Bring in your records</h1>
          <p className="lede">
            Photograph class lists, score sheets, fee ledgers and staff lists, handwritten or typed, or drop in Excel and CSV files. Each photo is sorted and read {ws.device === 'available' ? 'by Gemini Nano on this computer, so no page leaves the device' : allowCloud ? 'in the cloud, because your school allows cloud scanning' : 'by Gemini Nano on this computer'}. Nothing is saved until you check it.
          </p>
        </div>
      </header>

      {done && (
        <p className="panel">
          {done} <Link to={`/s/${schoolId}/classes`}>See the classes</Link> or <Link to={`/s/${schoolId}/staff`}>send the staff invites</Link>.
        </p>
      )}

      <label className={`drop ${busy ? 'busy' : ''}`}>
        <input type="file" multiple accept="image/*,.csv,.xlsx,.xlsm" disabled={busy} onChange={(e) => addFiles(e.currentTarget.files).finally(() => (e.target.value = ''))} />
        <b>{busy ? 'Reading pages…' : 'Choose photos or spreadsheets'}</b>
        <span className="muted small">One photo per page. You can add more at any time before saving.</span>
      </label>

      {pages.length > 0 && (
        <ol className="page-list">
          {pages.map((p) => (
            <li key={p.id} className={`page-item ${p.status}`}>
              {p.thumb ? <img src={p.thumb} alt="" /> : <span className="page-ph mono">{p.file.split('.').pop()}</span>}
              <span className="page-body">
                <b>{p.file}</b>
                <span className="muted small">
                  {p.status === 'waiting' && 'Waiting'}
                  {p.status === 'reading' && 'Reading…'}
                  {p.status === 'error' && <span className="err">{p.error}</span>}
                  {p.status === 'done' && p.reading && (
                    <>
                      {PAGE_KIND_LABEL[p.reading.kind]}
                      {p.reading.className ? `, ${p.reading.className}` : ''}
                      {p.reading.subject ? `, ${p.reading.subject}` : ''}: {p.reading.kind === 'staff_list' ? `${p.reading.staff.length} staff` : `${p.reading.students.length} students`}
                    </>
                  )}
                </span>
              </span>
              {p.source && p.source !== 'file' && <SourceStamp source={p.source} ms={p.ms} />}
            </li>
          ))}
        </ol>
      )}

      {plan && counts && (
        <>
          <section className="panel">
            <h2 className="h3">Classes found</h2>
            {plan.arms.length === 0 && <p className="muted small">No class lists yet.</p>}
            <ul className="arm-plan">
              {plan.arms.map((a) => (
                <li key={a.key}>
                  <span>{a.label}</span>
                  <select
                    value={a.classId ?? `new:${a.level}`}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v.startsWith('new:')) setArm(a.key, { classId: null, level: v.slice(4) });
                      else setArm(a.key, { classId: v, level: classes.find((c) => c.id === v)?.level ?? '' });
                    }}
                    aria-label={`Arm for ${a.label}`}
                  >
                    <optgroup label="Existing arms">
                      {classes.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Create a new arm in">
                      {levelsOf.map((l) => (
                        <option key={l} value={`new:${l}`}>
                          {l}
                        </option>
                      ))}
                      <option value="new:">Not sure yet</option>
                    </optgroup>
                  </select>
                  {!a.classId && a.level && <input className="arm-letter" value={a.arm} onChange={(e) => setArm(a.key, { arm: e.target.value.toUpperCase() })} aria-label="Arm letter" placeholder="A" />}
                  <span className="muted small">{a.classId ? 'Existing arm' : a.level ? `New arm: ${a.level}${a.arm}` : 'Pick a level to create it'}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2 className="h3">Students ({plan.students.filter((s) => s.include).length})</h2>
              <span className="muted small">Highlighted fields were hard to read. Check them against the page.</span>
            </div>
            <div className="table-wrap">
              <table className="import-table">
                <thead>
                  <tr>
                    <th>Keep</th>
                    <th>Name</th>
                    <th>Admission no.</th>
                    <th>Class</th>
                    <th>Parent and phone</th>
                    <th>Owes</th>
                    <th>On the roll already?</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.students.map((s) => {
                    const u = (f: string) => (s.unsure?.includes(f) ? 'unsure' : '');
                    const match = s.matchId ? students.data.find((x) => x.id === s.matchId) : null;
                    return (
                      <tr key={s.key} className={s.include ? '' : 'off'}>
                        <td>
                          <input type="checkbox" checked={s.include} onChange={(e) => setStudent(s.key, { include: e.target.checked })} aria-label={`Keep ${s.name}`} />
                        </td>
                        <td>
                          <input className={u('name')} value={s.name} onChange={(e) => setStudent(s.key, { name: e.target.value })} aria-label="Name" />
                        </td>
                        <td>
                          <input className={u('admissionNo')} value={s.admissionNo ?? ''} onChange={(e) => setStudent(s.key, { admissionNo: e.target.value })} aria-label="Admission number" />
                        </td>
                        <td>
                          <select value={s.armKey} onChange={(e) => setStudent(s.key, { armKey: e.target.value })} aria-label="Class">
                            {plan.arms.map((a) => (
                              <option key={a.key} value={a.key}>
                                {a.classId ? classes.find((c) => c.id === a.classId)?.name : a.level ? `${a.level}${a.arm} (new)` : a.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="small">
                          <span className={u('guardianName')}>{s.guardianName}</span> <span className={u('guardianPhone')}>{s.guardianPhone}</span>
                        </td>
                        <td className={`small ${u('balance')}`}>{typeof s.balance === 'number' && s.balance > 0 ? naira(s.balance) : ''}</td>
                        <td className="small">
                          {match ? (
                            <>
                              Yes, {classes.find((c) => c.id === match.classId)?.name} (matched by {s.matchBy === 'admission' ? 'admission number' : 'name'}).{' '}
                              <button className="link" onClick={() => setStudent(s.key, { matchId: null, matchBy: null })}>
                                Add as a new student
                              </button>
                            </>
                          ) : (
                            'New'
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {plan.students.some((s) => s.unsure?.length) && (
              <p className="muted small">
                Hard to read:{' '}
                {plan.students
                  .filter((s) => s.unsure?.length)
                  .map((s) => `${s.name} (${s.unsure!.map((f) => FIELD_LABEL[f] ?? f).join(', ')})`)
                  .join('; ')}
                .
              </p>
            )}
          </section>

          {plan.scores.length > 0 && (
            <section className="panel">
              <h2 className="h3">Scores for {term?.name.toLowerCase()}</h2>
              <ul className="arm-plan">
                {plan.scores.map((sp) => (
                  <li key={sp.key}>
                    <input type="checkbox" checked={sp.include} onChange={(e) => setPlan((x) => x && { ...x, scores: x.scores.map((y) => (y.key === sp.key ? { ...y, include: e.target.checked } : y)) })} aria-label="Keep these scores" />
                    <span>{plan.arms.find((a) => a.key === sp.armKey)?.label}</span>
                    <select value={sp.subject} onChange={(e) => setPlan((x) => x && { ...x, scores: x.scores.map((y) => (y.key === sp.key ? { ...y, subject: e.target.value } : y)) })} aria-label="Subject">
                      <option value="">Which subject?</option>
                      {[...new Set([...school.subjects, sp.subject].filter(Boolean))].map((x) => (
                        <option key={x}>{x}</option>
                      ))}
                    </select>
                    <span className="muted small">{sp.rows.length} students</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {plan.staff.length > 0 && (
            <section className="panel">
              <h2 className="h3">Staff</h2>
              <p className="muted small">Each person kept here gets an invite link on the Staff page, set up with the classes and subjects found for them.</p>
              <ul className="arm-plan">
                {plan.staff.map((st) => (
                  <li key={st.key}>
                    <input type="checkbox" checked={st.include} onChange={(e) => setPlan((x) => x && { ...x, staff: x.staff.map((y) => (y.key === st.key ? { ...y, include: e.target.checked } : y)) })} aria-label={`Invite ${st.name}`} />
                    <span>{st.name}</span>
                    <span className="muted small">{[st.role, ...(st.subjects ?? []), ...(st.classes ?? [])].filter(Boolean).join(', ')}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="panel apply-bar">
            <p>
              This will add {counts.newStudents} new students{counts.updates ? `, fill in ${counts.updates} existing records` : ''}
              {counts.newArms ? `, create ${counts.newArms} arms` : ''}
              {counts.scores ? `, save ${counts.scores} scores` : ''}
              {counts.balances ? `, carry ${counts.balances} fee balances into this term’s invoices` : ''}
              {counts.staff ? ` and make ${counts.staff} staff invites` : ''}.
              {counts.noArm ? ` ${counts.noArm} students have no class yet and will be left out until you pick one.` : ''}
            </p>
            <button className="ticket" onClick={apply} disabled={applying || busy}>
              {applying ? 'Saving…' : 'Save to the school'}
            </button>
          </section>
        </>
      )}
    </div>
  );
}

function useImportCtx() {
  const s = useSchool();
  return { ...s, levelsOf: s.school.levels };
}
