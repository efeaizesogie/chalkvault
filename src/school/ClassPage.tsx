import { useMemo, useState } from 'react';
import { Link, Navigate, useOutletContext, useParams, useSearchParams } from 'react-router-dom';
import { addOffering, addStudents, deleteStudent, saveClass, deleteClass, saveRecord, saveStudent, setTeaching } from '../data/api';
import { CLASS_COLOURS, type ReportCard, type Student, type StudentProfile, type TermRecord } from '../data/types';
import { ClassSheet } from '../components/ClassSheet';
import { StudentDesk } from '../components/StudentDesk';
import { AddClassDialog } from '../components/AddClassDialog';
import { ReportCardView } from '../components/ReportCardView';
import { factsFromCard, rosterOf } from '../lib/reportCards';
import { writeRemark } from '../lib/ai';
import { friendlyError } from '../lib/errors';
import { useToast } from '../ui/toast';
import { useSchool } from './SchoolContext';
import { useCommentWriter } from './useCommentWriter';
import { useArm } from './useArm';
import { AttendanceView } from './AttendanceView';
import { PublishButton } from './Results';
import type { WorkspaceCtx } from './Workspace';

type Tab = 'register' | 'comments' | 'subjects' | 'reports' | 'students';

/** Join a student's profile with this term's form record into the shape the sheet and desk use. */
function merge(p: StudentProfile, r?: TermRecord): Student {
  return { id: p.id, classId: p.classId, name: p.name, pronoun: p.pronoun, notes: r?.notes ?? '', draft: r?.draft, final: r?.final, translation: r?.translation, status: r?.status, order: p.order };
}

export function ClassPage() {
  const { classId = '' } = useParams();
  const { schoolId, school, classes, myClasses, isAdmin, term, me, policy, members, offerings: allOfferings } = useSchool();
  const ws = useOutletContext<WorkspaceCtx>();
  const toast = useToast();
  const allowed = myClasses.some((c) => c.id === classId);
  const arm = useArm(classId, allowed);
  const { cls, offerings, cards } = arm;
  const termId = term?.id ?? '';
  const [activeId, setActiveId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [params, setParams] = useSearchParams();

  const showRegister = policy.attendanceBy === 'form' || isAdmin;
  const tabs: { id: Tab; label: string }[] = [
    ...(showRegister && policy.attendanceBy !== 'subject' ? [{ id: 'register' as Tab, label: 'Register' }] : []),
    { id: 'comments', label: 'Form comments' },
    { id: 'subjects', label: 'Subjects' },
    { id: 'reports', label: 'Report cards' },
    { id: 'students', label: 'Students' },
  ];
  const tab = (tabs.find((t) => t.id === params.get('tab'))?.id ?? 'comments') as Tab;

  const profileById = useMemo(() => new Map(arm.students.map((p) => [p.id, p])), [arm.students]);
  const students = useMemo(() => {
    const recs = new Map(arm.formRecords.map((r) => [r.studentId, r]));
    return arm.students.map((p) => merge(p, recs.get(p.id)));
  }, [arm.students, arm.formRecords]);

  const save = async (s: Student) => {
    const p = profileById.get(s.id);
    if (p && p.pronoun !== s.pronoun) await saveStudent(schoolId, { ...p, pronoun: s.pronoun });
    await saveRecord(schoolId, me.uid, {
      termId,
      studentId: s.id,
      classId,
      notes: s.notes,
      draft: s.draft,
      final: s.final,
      translation: s.translation,
      status: s.status,
      approvedBy: s.status === 'approved' ? me.uid : undefined,
    });
  };

  const writer = useCommentWriter({
    cls,
    termName: term?.name ?? '',
    students,
    prefs: { ...ws.prefs, allowCloudFallback: ws.prefs.allowCloudFallback && policy.cloudCommentFallback },
    save,
    addLedger: ws.log,
    toast,
    onDeviceChanged: ws.refreshDevice,
    getFacts: (s) => factsFromCard(cards.get(s.id)),
  });

  if (!allowed) return <Navigate to={`/s/${schoolId}`} replace />;
  if (!cls) return <div className="ws-empty muted">This class no longer exists.</div>;

  const active = students.find((s) => s.id === activeId) ?? students[0] ?? null;
  const col = CLASS_COLOURS[cls.colour];
  const formTeachers = members.filter((m) => m.classIds.includes(cls.id)).map((m) => m.name);

  return (
    <div className="class-wrap">
      <header className="subject-head" style={{ borderTopColor: col.bg }}>
        <div>
          <h1 className="display-sm">{cls.name}</h1>
          <p className="sheet-sub">
            {arm.students.length} students, {offerings.length} subjects. {formTeachers.length ? `Form teacher: ${formTeachers.join(' and ')}.` : 'No form teacher assigned yet.'}
          </p>
        </div>
        {isAdmin && (
          <button className="pill ghost" onClick={() => setEditing(true)}>
            Edit arm
          </button>
        )}
      </header>
      <nav className="class-tabs" aria-label="Class views">
        {tabs.map((t) => (
          <button key={t.id} className={tab === t.id ? 'on' : ''} aria-current={tab === t.id ? 'page' : undefined} onClick={() => setParams(t.id === 'comments' ? {} : { tab: t.id })}>
            {t.label}
          </button>
        ))}
      </nav>

      {tab === 'register' && <AttendanceView cls={cls} students={arm.students} ws={ws} />}

      {tab === 'comments' && (
        <div className="class-page">
          <ClassSheet
            cls={cls}
            termName={term?.name ?? ''}
            students={students}
            activeId={active?.id ?? null}
            busyIds={writer.busyIds}
            batch={writer.batch}
            device={ws.device}
            onSelect={setActiveId}
            onAddStudents={(names) =>
              addStudents(schoolId, classId, names, students.reduce((m, s) => Math.max(m, s.order), 0))
                .then((made) => made[0] && setActiveId(made[0].id))
                .catch((e) => toast(friendlyError(e), 'error'))
            }
            onBatch={writer.runBatch}
            onStopBatch={writer.stopBatch}
            toast={toast}
          />
          <StudentDesk
            key={active?.id ?? 'none'}
            cls={cls}
            student={active}
            roster={students.map((s) => s.name)}
            prefs={ws.prefs}
            onPrefs={ws.setPrefs}
            device={ws.device}
            busy={!!active && writer.busyIds.has(active.id)}
            live={active ? writer.live[active.id] : undefined}
            isAdmin={isAdmin}
            limit={school.commentLimit ?? 600}
            onSave={save}
            onWrite={writer.run}
            onLedger={() => {}}
            addLedger={ws.log}
            onRemove={async (s) => {
              const p = profileById.get(s.id);
              if (p) await deleteStudent(schoolId, p);
              setActiveId(null);
            }}
            toast={toast}
          />
        </div>
      )}

      {tab === 'subjects' && (
        <section className="page">
          <div className="table-wrap">
            <table className="gradebook">
              <thead>
                <tr>
                  <th scope="col">Subject</th>
                  <th scope="col">Teacher</th>
                  <th scope="col" className="num">Students</th>
                  <th scope="col" className="num">Scores entered</th>
                  <th scope="col" />
                </tr>
              </thead>
              <tbody>
                {offerings.map((o) => {
                  const roster = rosterOf(o, arm.students);
                  const done = roster.filter((s) => arm.subjectRecords.some((r) => r.offeringId === o.id && r.studentId === s.id && Object.keys(r.scores ?? {}).length)).length;
                  const teachers = members.filter((m) => o.teacherIds.includes(m.uid));
                  return (
                    <tr key={o.id}>
                      <th scope="row" className="gb-name">{o.subject}</th>
                      <td>
                        {isAdmin ? (
                          <select
                            value={teachers[0]?.uid ?? ''}
                            onChange={async (e) => {
                              try {
                                for (const t of teachers) await setTeaching(schoolId, t, o, false, allOfferings);
                                const m = members.find((x) => x.uid === e.target.value);
                                if (m) await setTeaching(schoolId, m, o, true, allOfferings);
                              } catch (err) {
                                toast(friendlyError(err), 'error');
                              }
                            }}
                          >
                            <option value="">No teacher</option>
                            {members.map((m) => (
                              <option key={m.uid} value={m.uid}>
                                {m.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          teachers.map((t) => t.name).join(', ') || <span className="muted">No teacher</span>
                        )}
                      </td>
                      <td className="num">{roster.length}</td>
                      <td className="num">
                        {done} of {roster.length}
                      </td>
                      <td>
                        {(isAdmin || (me.offeringIds ?? []).includes(o.id)) && (
                          <Link className="link" to={`/s/${schoolId}/subjects/${o.id}`}>
                            Open score sheet
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {isAdmin && (
            <AddSubjectToArm
              missing={school.subjects.filter((s) => !offerings.some((o) => o.subject === s))}
              onAdd={(s) => addOffering(schoolId, classId, s).catch((e) => toast(friendlyError(e), 'error'))}
            />
          )}
        </section>
      )}

      {tab === 'reports' && <ReportCards classId={classId} cards={cards} students={arm.students} records={arm.formRecords} ws={ws} />}

      {tab === 'students' && (
        <section className="page">
          <ol className="rows">
            {arm.students.map((s, i) => (
              <li key={s.id}>
                <Link to={`/s/${schoolId}/students/${s.id}`} className="row record-row">
                  <span className="row-name">
                    <span className="mono idx">{String(i + 1).padStart(2, '0')}</span> {s.name}
                  </span>
                  <span className="mono muted">{s.admissionNo || 'No admission no.'}</span>
                  <span className="muted small">{s.guardians[0] ? `${s.guardians[0].name}, ${s.guardians[0].phone || 'no phone'}` : 'No guardian added'}</span>
                  <span className="mono row-status">Open</span>
                </Link>
              </li>
            ))}
          </ol>
          {(isAdmin || policy.teachersManageStudents) && (
            <AddNames
              onAdd={(names) =>
                addStudents(schoolId, classId, names, arm.students.reduce((m, s) => Math.max(m, s.order), 0)).catch((e) => toast(friendlyError(e), 'error'))
              }
            />
          )}
        </section>
      )}

      {editing && (
        <AddClassDialog
          initial={cls}
          usedColours={classes.map((c) => c.colour)}
          levels={school.levels}
          subjects={school.subjects}
          onSave={(c) => saveClass(schoolId, c).then(() => setEditing(false))}
          onDelete={
            arm.students.length
              ? undefined
              : () => {
                  if (confirm(`Delete ${cls.name}? It has no students.`)) deleteClass(schoolId, cls.id).then(() => setEditing(false));
                }
          }
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  );
}

function AddSubjectToArm({ missing, onAdd }: { missing: string[]; onAdd: (s: string) => void }) {
  const [s, setS] = useState('');
  if (!missing.length) return null;
  return (
    <div className="inline-add">
      <select value={s} onChange={(e) => setS(e.target.value)}>
        <option value="">Add a school subject to this arm…</option>
        {missing.map((m) => (
          <option key={m}>{m}</option>
        ))}
      </select>
      <button className="pill ink" disabled={!s} onClick={() => (onAdd(s), setS(''))}>
        Add subject
      </button>
    </div>
  );
}

function AddNames({ onAdd }: { onAdd: (names: string[]) => void }) {
  const [names, setNames] = useState('');
  return (
    <div className="add-names">
      <label className="mono" htmlFor="new-names">
        Add students, one name per line
      </label>
      <textarea id="new-names" className="ruled" rows={4} value={names} onChange={(e) => setNames(e.target.value)} />
      <div className="add-actions">
        <span className="hint">Each new student gets a private result PIN for parents.</span>
        <button
          className="pill ink"
          disabled={!names.trim()}
          onClick={() => {
            onAdd(names.split(/\r?\n/).map((n) => n.trim()).filter(Boolean));
            setNames('');
          }}
        >
          Add students
        </button>
      </div>
    </div>
  );
}

/** Report cards for the arm: summary table, the principal's comment, print, publish. */
function ReportCards({ classId, cards, students, records, ws }: { classId: string; cards: Map<string, ReportCard>; students: StudentProfile[]; records: TermRecord[]; ws: WorkspaceCtx }) {
  const { schoolId, school, isAdmin, term, me, policy } = useSchool();
  const toast = useToast();
  const [open, setOpen] = useState<string | null>(null);
  const [printAll, setPrintAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const ranked = [...students].sort((a, b) => (cards.get(b.id)?.average ?? 0) - (cards.get(a.id)?.average ?? 0));
  const recOf = (id: string) => records.find((r) => r.studentId === id);

  const setPrincipal = (s: StudentProfile, text: string) =>
    saveRecord(schoolId, me.uid, { termId: term!.id, studentId: s.id, classId, principalComment: text }).catch((e) => toast(friendlyError(e), 'error'));

  const draftPrincipal = async () => {
    setBusy(true);
    let n = 0;
    try {
      for (const s of students) {
        const c = cards.get(s.id);
        if (!c?.average || recOf(s.id)?.principalComment) continue;
        const res = await writeRemark({ kind: 'principal', facts: factsFromCard(c), note: recOf(s.id)?.final, roster: students.map((x) => x.name), studentName: s.name });
        await setPrincipal(s, res.text);
        await ws.log({ task: 'Principal’s comment', source: res.source, charsSent: res.source === 'in_cloud' ? res.prompt.length : 0, detail: res.source === 'in_cloud' ? res.prompt : 'Written by Gemini Nano on this device.' });
        n++;
      }
      toast(n ? `Drafted ${n} principal’s comment${n === 1 ? '' : 's'}.` : 'Every student with scores already has a principal’s comment.');
    } catch (e) {
      toast(friendlyError(e), 'error');
    } finally {
      setBusy(false);
      ws.refreshDevice();
    }
  };

  const unapproved = policy.approvalRequired ? students.filter((s) => recOf(s.id)?.status !== 'approved').length : 0;

  return (
    <section className="page">
      <div className="row-actions">
        <p className="muted">
          {term?.name}
          {term?.session ? `, ${term.session} session` : ''}. {unapproved ? `${unapproved} form comment${unapproved === 1 ? '' : 's'} still need approval.` : ''}
        </p>
        <div className="head-actions">
          {isAdmin && (
            <button className="pill ghost" onClick={draftPrincipal} disabled={busy}>
              {busy ? 'Drafting…' : 'Draft principal’s comments'}
            </button>
          )}
          <button
            className="pill ghost"
            onClick={() => {
              setPrintAll(true);
              setTimeout(() => {
                window.print();
                setPrintAll(false);
              }, 100);
            }}
          >
            Print all report cards
          </button>
          {isAdmin && <PublishButton classId={classId} students={students} cards={cards} blocked={unapproved > 0} />}
        </div>
      </div>
      <div className="table-wrap">
        <table className="gradebook">
          <thead>
            <tr>
              {policy.showPositions && <th scope="col">Position</th>}
              <th scope="col">Student</th>
              <th scope="col" className="num">Average</th>
              <th scope="col" className="num">Subjects graded</th>
              <th scope="col">Form comment</th>
              <th scope="col">Principal’s comment</th>
              <th scope="col" />
            </tr>
          </thead>
          <tbody>
            {ranked.map((s) => {
              const c = cards.get(s.id);
              const r = recOf(s.id);
              return (
                <tr key={s.id}>
                  {policy.showPositions && <td>{c?.position ?? ''}</td>}
                  <th scope="row" className="gb-name">{s.name}</th>
                  <td className="num gb-total">{c?.average ? `${c.average}%` : ''}</td>
                  <td className="num">
                    {c?.subjects.filter((x) => x.grade).length ?? 0} of {c?.subjects.length ?? 0}
                  </td>
                  <td>{r?.status === 'approved' ? 'Approved' : r?.status === 'submitted' ? 'Waiting' : r?.final || r?.draft ? 'Draft' : <span className="muted">Not written</span>}</td>
                  <td className="remark-cell">
                    {isAdmin ? (
                      <input defaultValue={r?.principalComment ?? ''} key={r?.principalComment ?? ''} placeholder="Write or draft with AI" onBlur={(e) => e.currentTarget.value !== (r?.principalComment ?? '') && setPrincipal(s, e.currentTarget.value)} />
                    ) : (
                      r?.principalComment ?? ''
                    )}
                  </td>
                  <td>
                    <button className="link" onClick={() => setOpen(open === s.id ? null : s.id)}>
                      {open === s.id ? 'Close' : 'View card'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {open && cards.get(open) && (
        <ReportCardView
          card={cards.get(open)!}
          schoolName={school.name}
          schoolAddress={school.address}
          motto={school.motto}
          principalName={school.principalName}
          studentName={students.find((s) => s.id === open)!.name}
          admissionNo={students.find((s) => s.id === open)!.admissionNo}
        />
      )}
      {printAll && (
        <div className="print-cards">
          {ranked.map((s) => (
            <ReportCardView
              key={s.id}
              card={cards.get(s.id)!}
              schoolName={school.name}
              schoolAddress={school.address}
              motto={school.motto}
              principalName={school.principalName}
              studentName={s.name}
              admissionNo={s.admissionNo}
            />
          ))}
        </div>
      )}
    </section>
  );
}

