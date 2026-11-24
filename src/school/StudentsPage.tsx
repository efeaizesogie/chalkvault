import { useState } from 'react';
import { Link } from 'react-router-dom';
import { query, where } from 'firebase/firestore';
import { paths } from '../data/api';
import { useQuery } from '../data/hooks';
import { CLASS_COLOURS, type ClassRoom, type StudentProfile } from '../data/types';
import { useSchool } from './SchoolContext';

export function StudentsPage() {
  const { classes, isAdmin, me } = useSchool();
  const myClasses = isAdmin ? classes : classes.filter((c) => me.classIds.includes(c.id) || (me.subjectClassIds ?? []).includes(c.id));
  const [q, setQ] = useState('');
  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1 className="display-sm">Students</h1>
          <p className="lede">{isAdmin ? 'Every student record in the school, grouped by class.' : 'Students in the classes you teach.'}</p>
        </div>
        <label className="field search">
          <span className="mono">Find a student</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or admission number" />
        </label>
      </header>
      {myClasses.map((c) => (
        <ClassStudents key={c.id} cls={c} q={q.trim().toLowerCase()} />
      ))}
      {myClasses.length === 0 && <p className="muted">No classes yet.</p>}
    </div>
  );
}

function ClassStudents({ cls, q }: { cls: ClassRoom; q: string }) {
  const { schoolId } = useSchool();
  const s = useQuery<StudentProfile>(query(paths.students(schoolId), where('classId', '==', cls.id)), `sp:${cls.id}`);
  const rows = s.data.filter((x) => (x.status ?? 'active') === 'active')
    .filter((x) => !q || x.name.toLowerCase().includes(q) || x.admissionNo.toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name));
  if (q && rows.length === 0) return null;
  const col = CLASS_COLOURS[cls.colour];
  return (
    <section className="roster">
      <h2 className="roster-head">
        <span className="swatch-dot" style={{ ['--c' as string]: col.bg }} aria-hidden /> {cls.name}
        <span className="mono muted">{s.data.filter((x) => (x.status ?? 'active') === 'active').length} students</span>
      </h2>
      <ol className="rows">
        {rows.map((x) => (
          <li key={x.id}>
            <Link to={`/s/${schoolId}/students/${x.id}`} className="row record-row">
              <span className="row-name">{x.name}</span>
              <span className="mono muted">{x.admissionNo || '—'}</span>
              <span className="muted small">{x.guardians[0] ? `${x.guardians[0].name}, reads in ${x.guardians[0].language || 'English'}` : 'No guardian added'}</span>
              <span className="mono row-status">Open</span>
            </Link>
          </li>
        ))}
        {rows.length === 0 && <li className="row muted">No students in this class yet.</li>}
      </ol>
    </section>
  );
}
