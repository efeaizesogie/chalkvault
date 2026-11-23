import { useState } from 'react';
import { Link } from 'react-router-dom';
import { query, where } from 'firebase/firestore';
import { paths, saveClass } from '../data/api';
import { useQuery } from '../data/hooks';
import { CLASS_COLOURS, type ClassRoom, type StudentProfile, type TermRecord } from '../data/types';
import { AddClassDialog } from '../components/AddClassDialog';
import { useToast } from '../ui/toast';
import { useSchool } from './SchoolContext';

export function Overview() {
  const { school, schoolId, me, isAdmin, myClasses, classes, members, term } = useSchool();
  const [adding, setAdding] = useState(false);
  const toast = useToast();
  const first = (me.name || '').split(' ')[0];

  const steps = [
    { done: classes.length > 0, label: 'Add your classes', to: null as string | null, action: () => setAdding(true) },
    { done: members.length > 1, label: 'Invite your teachers', to: `/s/${schoolId}/staff`, action: null },
    { done: false, label: 'Add students to a class', to: myClasses[0] ? `/s/${schoolId}/classes/${myClasses[0].id}` : null, action: null },
  ];

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1 className="display-sm">Good to see you{first ? `, ${first}` : ''}.</h1>
          <p className="lede">
            {isAdmin
              ? `${school.name} has ${classes.length} class${classes.length === 1 ? '' : 'es'} and ${members.length} staff member${members.length === 1 ? '' : 's'}.`
              : `You teach ${myClasses.length} class${myClasses.length === 1 ? '' : 'es'} at ${school.name}.`}
          </p>
        </div>
        {isAdmin && (
          <button className="ticket" onClick={() => setAdding(true)}>
            Add a class
          </button>
        )}
      </header>

      {isAdmin && !school.demo && classes.length === 0 && (
        <ol className="checklist">
          {steps.map((s, i) => (
            <li key={i} className={s.done ? 'done' : ''}>
              <span className="mono">{String(i + 1).padStart(2, '0')}</span>
              {s.to ? <Link to={s.to}>{s.label}</Link> : <button className="link" onClick={s.action ?? undefined}>{s.label}</button>}
            </li>
          ))}
        </ol>
      )}

      {isAdmin && <ApprovalQueue />}

      <section className="class-grid">
        {myClasses.map((c) => (
          <ClassCard key={c.id} schoolId={schoolId} cls={c} termId={term?.id ?? ''} />
        ))}
        {myClasses.length === 0 && (
          <p className="muted">{isAdmin ? 'No classes yet. Add your first class to get started.' : 'Your head teacher hasn’t assigned you a class yet.'}</p>
        )}
      </section>

      {adding && (
        <AddClassDialog
          initial={null}
          usedColours={classes.map((c) => c.colour)}
          levels={school.levels}
          subjects={school.subjects}
          onSave={(c) =>
            saveClass(schoolId, c)
              .then(() => setAdding(false))
              .catch((e) => toast((e as Error).message, 'error'))
          }
          onClose={() => setAdding(false)}
        />
      )}
    </div>
  );
}

/** Comments teachers have sent for approval this term, grouped by class. */
function ApprovalQueue() {
  const { schoolId, term, classes } = useSchool();
  const waiting = useQuery<TermRecord>(
    term ? query(paths.records(schoolId), where('termId', '==', term.id), where('status', '==', 'submitted')) : null,
    `queue:${term?.id}`,
  );
  if (!waiting.data.length) return null;
  const byClass = new Map<string, number>();
  for (const r of waiting.data) byClass.set(r.classId, (byClass.get(r.classId) ?? 0) + 1);
  return (
    <section className="panel queue">
      <h2 className="h3">
        {waiting.data.length} comment{waiting.data.length === 1 ? '' : 's'} waiting for your approval
      </h2>
      <ul className="queue-list">
        {[...byClass].map(([cid, n]) => (
          <li key={cid}>
            <Link to={`/s/${schoolId}/classes/${cid}`}>{classes.find((c) => c.id === cid)?.name ?? 'A class'}</Link>
            <span className="muted">{n} waiting</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ClassCard({ schoolId, cls, termId }: { schoolId: string; cls: ClassRoom; termId: string }) {
  const col = CLASS_COLOURS[cls.colour];
  const students = useQuery<StudentProfile>(query(paths.students(schoolId), where('classId', '==', cls.id)), `cc-s:${cls.id}`);
  const records = useQuery<TermRecord>(
    termId ? query(paths.records(schoolId), where('classId', '==', cls.id), where('termId', '==', termId)) : null,
    `cc-r:${cls.id}:${termId}`,
  );
  const ids = new Set(students.data.map((s) => s.id));
  const recs = records.data.filter((r) => ids.has(r.studentId));
  const finals = recs.filter((r) => r.final).length;
  const drafted = recs.filter((r) => r.draft).length;
  const total = students.data.length;
  return (
    <Link to={`/s/${schoolId}/classes/${cls.id}`} className="class-card" style={{ background: col.bg, color: col.ink }}>
      <span className="mono">{cls.subject || cls.level}</span>
      <span className="class-card-name">{cls.name}</span>
      <span className="class-card-meta mono">
        {total} students, {drafted} drafted, {finals} final
      </span>
      <span className="class-card-bar" aria-hidden>
        <i style={{ transform: `scaleX(${total ? finals / total : 0})`, background: col.ink }} />
      </span>
    </Link>
  );
}
