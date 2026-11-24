import { Link } from 'react-router-dom';
import { query, where } from 'firebase/firestore';
import { paths, todayISO } from '../data/api';
import { useQuery } from '../data/hooks';
import { CLASS_COLOURS, type AttendanceDay, type ClassRoom, type Offering, type StudentProfile, type SubjectRecord, type TermRecord } from '../data/types';
import { rosterOf } from '../lib/reportCards';
import { useSchool } from './SchoolContext';
import { NoticeList, useNotices } from './NoticesPage';
import { PrincipalDashboard } from './PrincipalDashboard';

export function Overview() {
  const { isAdmin } = useSchool();
  return isAdmin ? <PrincipalDashboard greeting={(line, actions) => <Greeting line={line} actions={actions} />} /> : <TeacherDashboard />;
}

function Greeting({ line, actions }: { line: string; actions?: React.ReactNode }) {
  const { me, term } = useSchool();
  const first = (me.name || '').split(' ')[0];
  return (
    <header className="page-head">
      <div>
        <h1 className="display-sm no-print">Good to see you{first ? `, ${first}` : ''}.</h1>
        <p className="lede">
          {term ? `${term.name}${term.session ? `, ${term.session}` : ''}. ` : ''}
          {line}
        </p>
      </div>
      {actions}
    </header>
  );
}

// ---------------- Teacher ----------------

function TeacherDashboard() {
  const { formClasses, myOfferings, classes, policy } = useSchool();
  const notices = useNotices();
  const parts = [
    formClasses.length ? `form teacher of ${formClasses.map((c) => c.name).join(' and ')}` : '',
    myOfferings.length ? `${myOfferings.length} subject${myOfferings.length === 1 ? '' : 's'} to teach` : '',
  ].filter(Boolean);
  return (
    <div className="page">
      <Greeting line={parts.length ? `You are ${parts.join(', with ')}.` : 'Your head teacher hasn’t assigned you a class or subject yet.'} />
      {formClasses.length > 0 && (
        <section>
          <h2 className="h3">{formClasses.length > 1 ? 'My form classes' : 'My form class'}</h2>
          <div className="class-grid">
            {formClasses.map((c) => (
              <FormCard key={c.id} cls={c} registerToday={policy.attendanceBy === 'form'} />
            ))}
          </div>
        </section>
      )}
      {myOfferings.length > 0 && (
        <section>
          <h2 className="h3">My subjects</h2>
          <div className="class-grid">
            {myOfferings.map((o) => (
              <SubjectCard key={o.id} o={o} cls={classes.find((c) => c.id === o.classId)} />
            ))}
          </div>
        </section>
      )}
      <section className="panel">
        <h2 className="h3">Notices</h2>
        <NoticeList notices={notices.data} limit={5} />
      </section>
    </div>
  );
}

function FormCard({ cls, registerToday }: { cls: ClassRoom; registerToday: boolean }) {
  const { schoolId, term } = useSchool();
  const col = CLASS_COLOURS[cls.colour];
  const st = useQuery<StudentProfile>(query(paths.students(schoolId), where('classId', '==', cls.id)), `fc-st:${cls.id}`);
  const recs = useQuery<TermRecord>(term ? query(paths.records(schoolId), where('classId', '==', cls.id), where('termId', '==', term.id)) : null, `fc-rec:${cls.id}:${term?.id}`);
  const day = useQuery<AttendanceDay>(query(paths.attendance(schoolId), where('classId', '==', cls.id), where('date', '==', todayISO())), `fc-day:${cls.id}`);
  const written = recs.data.filter((r) => r.final || r.draft).length;
  const taken = day.data.some((d) => !d.offeringId);
  return (
    <Link to={`/s/${schoolId}/classes/${cls.id}${registerToday && !taken ? '?tab=register' : ''}`} className="class-card" style={{ background: col.bg, color: col.ink }}>
      <span className="class-card-name">{cls.name}</span>
      <span className="small">{registerToday ? (taken ? 'Register taken today' : 'Take today’s register') : `${st.data.length} students`}</span>
      <span className="class-card-meta">
        {written} of {st.data.length} form comments written
      </span>
    </Link>
  );
}

function SubjectCard({ o, cls }: { o: Offering; cls?: ClassRoom }) {
  const { schoolId, term } = useSchool();
  const st = useQuery<StudentProfile>(cls ? query(paths.students(schoolId), where('classId', '==', cls.id)) : null, `sc-st:${cls?.id}`);
  const recs = useQuery<SubjectRecord>(term ? query(paths.subjectRecords(schoolId), where('offeringId', '==', o.id), where('termId', '==', term.id)) : null, `sc-rec:${o.id}:${term?.id}`);
  const roster = rosterOf(o, st.data);
  const done = recs.data.filter((r) => Object.keys(r.scores ?? {}).length).length;
  const col = cls ? CLASS_COLOURS[cls.colour] : CLASS_COLOURS.chalk;
  return (
    <Link to={`/s/${schoolId}/subjects/${o.id}`} className="class-card subject-card" style={{ borderTop: `8px solid ${col.bg}` }}>
      <span className="class-card-name">{o.subject}</span>
      <span className="small">{cls?.name}</span>
      <span className="class-card-meta">
        Scores for {done} of {roster.length} students
      </span>
    </Link>
  );
}
