import { useMemo, useState } from 'react';
import { Navigate, useOutletContext, useParams, useSearchParams } from 'react-router-dom';
import { query, where } from 'firebase/firestore';
import { addStudents, deleteStudent, paths, saveClass, deleteClass, saveRecord, saveStudent } from '../data/api';
import { useQuery } from '../data/hooks';
import type { Student, StudentProfile, TermRecord } from '../data/types';
import { ClassSheet } from '../components/ClassSheet';
import { StudentDesk } from '../components/StudentDesk';
import { AddClassDialog } from '../components/AddClassDialog';
import { useToast } from '../ui/toast';
import { useSchool } from './SchoolContext';
import { useCommentWriter } from './useCommentWriter';
import type { WorkspaceCtx } from './Workspace';
import { AttendanceView } from './AttendanceView';

type Tab = 'comments' | 'attendance' | 'scores';
const TABS: { id: Tab; label: string }[] = [
  { id: 'comments', label: 'Comments' },
  { id: 'attendance', label: 'Attendance' },
];

/** Join a student's profile with this term's record into the shape the sheet and desk use. */
function merge(p: StudentProfile, r?: TermRecord): Student {
  return {
    id: p.id,
    classId: p.classId,
    name: p.name,
    pronoun: p.pronoun,
    notes: r?.notes ?? '',
    draft: r?.draft,
    final: r?.final,
    translation: r?.translation,
    order: p.order,
  };
}

export function ClassPage() {
  const { classId = '' } = useParams();
  const { schoolId, school, classes, myClasses, isAdmin, term, me } = useSchool();
  const ws = useOutletContext<WorkspaceCtx>();
  const toast = useToast();
  const cls = classes.find((c) => c.id === classId) ?? null;
  const allowed = myClasses.some((c) => c.id === classId);
  const termId = term?.id ?? '';
  const [activeId, setActiveId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [params, setParams] = useSearchParams();
  const tab = (TABS.find((t) => t.id === params.get('tab'))?.id ?? 'comments') as Tab;

  const profiles = useQuery<StudentProfile>(allowed ? query(paths.students(schoolId), where('classId', '==', classId)) : null, `students:${schoolId}:${classId}:${allowed}`);
  const records = useQuery<TermRecord>(
    allowed && termId ? query(paths.records(schoolId), where('classId', '==', classId), where('termId', '==', termId)) : null,
    `records:${schoolId}:${classId}:${termId}:${allowed}`,
  );

  const profileById = useMemo(() => new Map(profiles.data.map((p) => [p.id, p])), [profiles.data]);
  const students = useMemo(() => {
    const recs = new Map(records.data.map((r) => [r.studentId, r]));
    return profiles.data.map((p) => merge(p, recs.get(p.id))).sort((a, b) => a.order - b.order);
  }, [profiles.data, records.data]);

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
    });
  };

  const writer = useCommentWriter({
    cls,
    termName: term?.name ?? '',
    students,
    prefs: ws.prefs,
    save,
    addLedger: ws.log,
    toast,
    onDeviceChanged: ws.refreshDevice,
  });

  if (!cls) return <div className="ws-empty muted">This class no longer exists.</div>;
  if (!allowed) return <Navigate to={`/s/${schoolId}`} replace />;

  const active = students.find((s) => s.id === activeId) ?? students[0] ?? null;

  return (
    <div className="class-wrap">
      <nav className="class-tabs" aria-label="Class views">
        <span className="class-tabs-name">{cls.name}</span>
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'on' : ''} aria-current={tab === t.id ? 'page' : undefined} onClick={() => setParams(t.id === 'comments' ? {} : { tab: t.id })}>
            {t.label}
          </button>
        ))}
      </nav>
      {tab === 'attendance' ? (
        <AttendanceView cls={cls} students={profiles.data.slice().sort((a, b) => a.order - b.order)} ws={ws} />
      ) : (
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
            .catch((e) => toast((e as Error).message, 'error'))
        }
        onBatch={writer.runBatch}
        onStopBatch={writer.stopBatch}
        onEditClass={isAdmin ? () => setEditing(true) : undefined}
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
      {editing && (
        <AddClassDialog
          initial={cls}
          usedColours={classes.map((c) => c.colour)}
          levels={school.levels}
          subjects={school.subjects}
          onSave={(c) => saveClass(schoolId, c).then(() => setEditing(false))}
          onDelete={
            students.length
              ? undefined
              : () => {
                  if (confirm(`Delete ${cls.name}? It has no students.`)) deleteClass(schoolId, cls.id).then(() => setEditing(false));
                }
          }
          onClose={() => setEditing(false)}
        />
      )}
    </div>
      )}
    </div>
  );
}
