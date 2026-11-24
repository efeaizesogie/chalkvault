import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { query, where } from 'firebase/firestore';
import { deleteStudent, paths, saveStudent } from '../data/api';
import { useDoc, useQuery } from '../data/hooks';
import type { Guardian, Pronoun, StudentProfile, TermRecord } from '../data/types';
import { LANGUAGES } from '../lib/ai';
import { useToast } from '../ui/toast';
import { useArm } from './useArm';
import { ReportCardView } from '../components/ReportCardView';
import { IncidentLog } from '../modules/IncidentLog';
import { whatsappLink } from '../lib/share';
import { useSchool } from './SchoolContext';
import { printParts } from '../lib/print';

const blankGuardian: Guardian = { name: '', relationship: '', phone: '', email: '', language: 'English' };

export function StudentRecord() {
  const { studentId = '' } = useParams();
  const { schoolId, school, classes, myClasses, isAdmin, terms, me, policy } = useSchool();
  const toast = useToast();
  const nav = useNavigate();
  const live = useDoc<StudentProfile>(paths.student(schoolId, studentId), `stu:${studentId}`);
  const [p, setP] = useState<StudentProfile | null>(null);
  const dirty = !!p && !!live.data && JSON.stringify(p) !== JSON.stringify(live.data);

  useEffect(() => {
    if (live.data && !dirty) setP(live.data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live.data]);

  const formView = !!live.data && (isAdmin || me.classIds.includes(live.data.classId));
  const arm = useArm(live.data?.classId ?? '', formView);
  const card = arm.cards.get(studentId);
  const records = useQuery<TermRecord>(
    live.data && formView ? query(paths.records(schoolId), where('studentId', '==', studentId), where('classId', '==', live.data.classId)) : null,
    `recs:${studentId}:${live.data?.classId}:${formView}`,
  );

  if (live.loading) return <div className="ws-empty muted">Loading record…</div>;
  if (!live.data || !p) return <div className="ws-empty muted">This student record isn’t available to you.</div>;

  const cls = classes.find((c) => c.id === p.classId);
  const set = (patch: Partial<StudentProfile>) => setP({ ...p, ...patch });
  const setG = (i: number, patch: Partial<Guardian>) => set({ guardians: p.guardians.map((g, j) => (j === i ? { ...g, ...patch } : g)) });
  const canEdit = isAdmin || (me.classIds.includes(p.classId) && policy.teachersManageStudents);
  const save = async () => {
    try {
      await saveStudent(schoolId, p);
      toast('Record saved.');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };
  const termName = (id: string) => terms.find((t) => t.id === id)?.name ?? 'Earlier term';
  const sorted = [...records.data].sort((a, b) => (terms.findIndex((t) => t.id === b.termId) - terms.findIndex((t) => t.id === a.termId)));

  return (
    <div className="page record">
      <header className="page-head">
        <div>
          <h1 className="display-sm">{p.name}</h1>
          <p className="lede">
            {cls?.name ?? 'No class'}
            {p.admissionNo ? `, admission no. ${p.admissionNo}` : ''}
          </p>
        </div>
        <div className="head-actions">
          <button className="pill ghost" onClick={() => printParts([document.querySelector<HTMLElement>('.ws-main .page')], { title: `Student record, ${p.name}` })}>
            Print record
          </button>
          <button className="ticket" onClick={save} disabled={!dirty || !canEdit} title={canEdit ? undefined : 'Only admins or the form teacher can edit this record'}>
            {!canEdit ? 'View only' : dirty ? 'Save changes' : 'Saved'}
          </button>
        </div>
      </header>

      <div className="record-grid">
        <section className="panel">
          <h2 className="h3">Profile</h2>
          <div className="form-grid">
            <label className="field">
              <span className="mono">Full name</span>
              <input value={p.name} onChange={(e) => set({ name: e.target.value })} />
            </label>
            <label className="field">
              <span className="mono">Preferred name</span>
              <input value={p.preferredName} onChange={(e) => set({ preferredName: e.target.value })} placeholder="Optional" />
            </label>
            <label className="field">
              <span className="mono">Pronouns</span>
              <select value={p.pronoun} onChange={(e) => set({ pronoun: e.target.value as Pronoun })}>
                <option value="she">she/her</option>
                <option value="he">he/him</option>
                <option value="they">they/them</option>
              </select>
            </label>
            <label className="field">
              <span className="mono">Date of birth</span>
              <input type="date" value={p.dob} onChange={(e) => set({ dob: e.target.value })} />
            </label>
            <label className="field">
              <span className="mono">Admission number</span>
              <input value={p.admissionNo} onChange={(e) => set({ admissionNo: e.target.value })} />
            </label>
            <label className="field">
              <span className="mono">Class</span>
              <select value={p.classId} onChange={(e) => set({ classId: e.target.value })} disabled={!isAdmin && myClasses.length < 2}>
                {(isAdmin ? classes : myClasses).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2 className="h3">Parents & guardians</h2>
            <button className="link" onClick={() => set({ guardians: [...p.guardians, blankGuardian] })}>
              + Add
            </button>
          </div>
          {p.guardians.length === 0 && <p className="muted small">No guardians added.</p>}
          {p.guardians.map((g, i) => (
            <div key={i} className="guardian">
              <div className="form-grid">
                <label className="field">
                  <span className="mono">Name</span>
                  <input value={g.name} onChange={(e) => setG(i, { name: e.target.value })} />
                </label>
                <label className="field">
                  <span className="mono">Relationship</span>
                  <input value={g.relationship} onChange={(e) => setG(i, { relationship: e.target.value })} placeholder="Mother, uncle…" />
                </label>
                <label className="field">
                  <span className="mono">Phone</span>
                  <input value={g.phone} onChange={(e) => setG(i, { phone: e.target.value })} />
                </label>
                <label className="field">
                  <span className="mono">Email</span>
                  <input type="email" value={g.email} onChange={(e) => setG(i, { email: e.target.value })} />
                </label>
                <label className="field">
                  <span className="mono">Reads reports in</span>
                  <select value={g.language} onChange={(e) => setG(i, { language: e.target.value })}>
                    {['English', ...LANGUAGES].map((l) => (
                      <option key={l}>{l}</option>
                    ))}
                  </select>
                </label>
              </div>
              <button className="link danger small" onClick={() => set({ guardians: p.guardians.filter((_, j) => j !== i) })}>
                Remove guardian
              </button>
            </div>
          ))}
        </section>

        {card && (
          <section className="panel wide">
            <h2 className="h3">This term’s report card</h2>
            <ReportCardView card={card} schoolName={school.name} schoolAddress={school.address} motto={school.motto} principalName={school.principalName} studentName={p.name} admissionNo={p.admissionNo} />
            {p.resultPin && <p className="muted small">Result PIN for parents: <b className="pin">{p.resultPin}</b></p>}
          </section>
        )}

        <IncidentLog studentId={p.id} classId={p.classId} studentName={p.name} />

        <section className="panel wide">
          <h2 className="h3">Reports by term</h2>
          {sorted.length === 0 && <p className="muted small">No notes or comments yet. Open the class to write this term’s comment.</p>}
          {sorted.map((r) => (
            <article key={r.termId} className="term-report">
              <div className="term-report-head">
                <span className="mono">{termName(r.termId)}</span>
                <span className="mono muted">{r.final ? 'Final' : r.draft ? 'Draft' : 'Notes only'}</span>
              </div>
              {(r.final || r.draft?.comment) && <p className="term-comment">{r.final ?? r.draft?.comment}</p>}
              {r.translation && (
                <p className="term-translation">
                  <span className="mono">{r.translation.language}</span> {r.translation.text}
                </p>
              )}
              {(r.final || r.draft?.comment) && (
                <a
                  className="pill ghost share"
                  target="_blank"
                  rel="noreferrer"
                  title={p.guardians[0]?.phone ? `Opens a WhatsApp chat with ${p.guardians[0].name}` : 'Opens WhatsApp so you can choose the parent'}
                  href={whatsappLink(
                    [`${school.name}: ${termName(r.termId)} report for ${p.name}`, r.final ?? r.draft?.comment ?? '', r.translation?.text ?? ''].filter(Boolean).join('\n\n'),
                    p.guardians[0]?.phone,
                  )}
                >
                  Share on WhatsApp
                </a>
              )}
              {r.notes && (
                <details>
                  <summary className="mono muted">Teacher’s private notes</summary>
                  <p className="small">{r.notes}</p>
                </details>
              )}
            </article>
          ))}
          {cls && (
            <Link to={`/s/${schoolId}/classes/${cls.id}`} className="link">
              Write comments in {cls.name}
            </Link>
          )}
        </section>

        {canEdit && (
        <section className="panel wide danger-zone">
          <button
            className="link danger"
            onClick={async () => {
              if (!confirm(`Delete ${p.name}'s record, notes and comments permanently? This cannot be undone.`)) return;
              await deleteStudent(schoolId, live.data!);
              nav(`/s/${schoolId}/students`);
            }}
          >
            Delete this student record
          </button>
        </section>
        )}
      </div>

      <div className="print-only report-card">
        <h1>{school.name}</h1>
        <p>
          {p.name}, {cls?.name}{p.admissionNo ? `, ${p.admissionNo}` : ''}
        </p>
        {sorted
          .filter((r) => r.final || r.draft)
          .map((r) => (
            <article key={r.termId}>
              <h2>{termName(r.termId)}</h2>
              <p>{r.final ?? r.draft?.comment}</p>
            </article>
          ))}
      </div>
    </div>
  );
}
