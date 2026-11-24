import { Link } from 'react-router-dom';
import { useQuery } from '../data/hooks';
import { paths } from '../data/api';
import { CLASS_COLOURS, type StudentProfile } from '../data/types';
import { useSchool } from './SchoolContext';
import { PrintExport } from '../components/PrintExport';

/** Admin view of every class level and its arms. */
export function ClassesPage() {
  const { schoolId, school, classes, offerings, members } = useSchool();
  const students = useQuery<StudentProfile>(paths.students(schoolId), `all-students:${schoolId}`);
  const count = (classId: string) => students.data.filter((s) => s.classId === classId && (s.status ?? 'active') === 'active').length;
  const levels = [...school.levels, ...new Set(classes.map((c) => c.level).filter((l) => !school.levels.includes(l)))];

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1 className="display-sm">Classes</h1>
          <p className="lede">
            {classes.length} arms across {levels.filter((l) => classes.some((c) => c.level === l)).length} classes, {students.data.length} students.
          </p>
        </div>
        <Link className="pill ghost" to={`/s/${schoolId}/settings`}>
          Add arms or subjects
        </Link>
        <PrintExport title="Classes" />
      </header>
      {levels.map((level) => {
        const arms = classes.filter((c) => c.level === level);
        if (!arms.length) return null;
        return (
          <section key={level} className="level-block">
            <h2 className="h3">{level}</h2>
            <div className="class-grid">
              {arms.map((c) => {
                const col = CLASS_COLOURS[c.colour];
                const offs = offerings.filter((o) => o.classId === c.id);
                const staffed = offs.filter((o) => o.teacherIds.length).length;
                const form = members.filter((m) => m.classIds.includes(c.id)).map((m) => m.name);
                return (
                  <Link key={c.id} to={`/s/${schoolId}/classes/${c.id}`} className="class-card" style={{ background: col.bg, color: col.ink }}>
                    <span className="class-card-name">{c.name}</span>
                    <span className="small">{form.length ? `Form teacher: ${form.join(', ')}` : 'No form teacher yet'}</span>
                    <span className="class-card-meta">
                      {count(c.id)} students, {staffed} of {offs.length} subjects have a teacher
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
