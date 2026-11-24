import { Link } from 'react-router-dom';
import { query, where } from 'firebase/firestore';
import { paths, todayISO } from '../data/api';
import { useQuery } from '../data/hooks';
import { CLASS_COLOURS, SUPPORT_LABEL, type AttendanceDay, type ClassRoom, type Offering, type StudentProfile, type SubjectRecord, type TermRecord } from '../data/types';
import { rosterOf } from '../lib/reportCards';
import { useSchool } from './SchoolContext';
import { NoticeList, useNotices } from './NoticesPage';

export function Overview() {
  const { isAdmin } = useSchool();
  return isAdmin ? <AdminDashboard /> : <TeacherDashboard />;
}

function Greeting({ line }: { line: string }) {
  const { me, term } = useSchool();
  const first = (me.name || '').split(' ')[0];
  return (
    <header className="page-head">
      <div>
        <h1 className="display-sm">Good to see you{first ? `, ${first}` : ''}.</h1>
        <p className="lede">
          {term ? `${term.name}${term.session ? `, ${term.session}` : ''}. ` : ''}
          {line}
        </p>
      </div>
    </header>
  );
}

// ---------------- Admin ----------------

function AdminDashboard() {
  const { schoolId, school, classes, offerings, members, term } = useSchool();
  const termId = term?.id ?? '';
  const students = useQuery<StudentProfile>(paths.students(schoolId), `dash-st:${schoolId}`);
  const today = useQuery<AttendanceDay>(query(paths.attendance(schoolId), where('date', '==', todayISO())), `dash-att:${todayISO()}`);
  const subjectRecs = useQuery<SubjectRecord>(termId ? query(paths.subjectRecords(schoolId), where('termId', '==', termId)) : null, `dash-sr:${termId}`);
  const formRecs = useQuery<TermRecord>(termId ? query(paths.records(schoolId), where('termId', '==', termId)) : null, `dash-rec:${termId}`);
  const notices = useNotices();

  const byClass = (id: string) => students.data.filter((s) => s.classId === id);
  // Today's attendance: arms with a register (form) or any lesson register (subject) today.
  const registersToday = new Set(today.data.map((d) => d.classId));
  let present = 0;
  let marked = 0;
  for (const d of today.data) for (const m of Object.values(d.marks)) (marked++, m !== 'A' && present++);

  // Score entry: how many (student, subject) pairs have any score this term.
  let expected = 0;
  for (const o of offerings) expected += rosterOf(o, byClass(o.classId)).length;
  const entered = subjectRecs.data.filter((r) => Object.keys(r.scores ?? {}).length).length;
  const unstaffed = offerings.filter((o) => !o.teacherIds.length).length;
  const noForm = classes.filter((c) => !members.some((m) => m.classIds.includes(c.id))).length;
  const comments = formRecs.data.filter((r) => r.final || r.draft).length;
  const approved = formRecs.data.filter((r) => r.status === 'approved').length;
  const waiting = formRecs.data.filter((r) => r.status === 'submitted');
  const flagged = formRecs.data.filter((r) => r.draft?.supportFlag && r.draft.supportFlag !== 'none');
  const names = new Map(students.data.map((s) => [s.id, s.name]));

  return (
    <div className="page">
      <Greeting line={`${school.name}: ${students.data.length} students in ${classes.length} arms, ${members.length} staff.`} />

      <section className="stat-grid" aria-label="This term at a glance">
        <Stat label="Attendance today" value={marked ? `${Math.round((present / marked) * 100)}%` : 'Not taken'} note={`${registersToday.size} of ${classes.length} arms have a register today`} to={`/s/${schoolId}/classes`} />
        <Stat label="Scores entered" value={expected ? `${Math.round((entered / expected) * 100)}%` : '0%'} note={`${entered} of ${expected} subject scores this term`} to={`/s/${schoolId}/classes`} />
        <Stat label="Form comments" value={`${comments} of ${students.data.length}`} note={`${approved} approved`} to={`/s/${schoolId}/results`} />
        <Stat label="Gaps in staffing" value={`${unstaffed + noForm}`} note={`${unstaffed} subjects without a teacher, ${noForm} arms without a form teacher`} to={`/s/${schoolId}/staff`} />
      </section>

      {(classes.length === 0 || members.length < 2) && !school.demo && (
        <ol className="checklist">
          <li className={classes.length ? 'done' : ''}>
            <span className="mono">01</span>
            <Link to={`/s/${schoolId}/settings`}>Set up classes, arms and subjects</Link>
          </li>
          <li className={members.length > 1 ? 'done' : ''}>
            <span className="mono">02</span>
            <Link to={`/s/${schoolId}/staff`}>Invite teachers and assign their subjects and form classes</Link>
          </li>
          <li className={students.data.length ? 'done' : ''}>
            <span className="mono">03</span>
            <Link to={`/s/${schoolId}/classes`}>Add students to each arm</Link>
          </li>
        </ol>
      )}

      <div className="record-grid">
        {waiting.length > 0 && (
          <section className="panel queue">
            <h2 className="h3">
              {waiting.length} comment{waiting.length === 1 ? '' : 's'} waiting for your approval
            </h2>
            <ul className="queue-list">
              {[...new Set(waiting.map((r) => r.classId))].map((cid) => (
                <li key={cid}>
                  <Link to={`/s/${schoolId}/classes/${cid}`}>{classes.find((c) => c.id === cid)?.name ?? 'An arm'}</Link>
                  <span>{waiting.filter((r) => r.classId === cid).length} waiting</span>
                </li>
              ))}
            </ul>
          </section>
        )}
        {flagged.length > 0 && (
          <section className="panel">
            <h2 className="h3">
              {flagged.length} student{flagged.length === 1 ? '' : 's'} may need follow-up
            </h2>
            <ul className="queue-list">
              {flagged.map((r) => (
                <li key={r.studentId}>
                  <Link to={`/s/${schoolId}/students/${r.studentId}`}>{names.get(r.studentId) ?? 'Student'}</Link>
                  <span className="muted">
                    {classes.find((c) => c.id === r.classId)?.name}, {SUPPORT_LABEL[r.draft!.supportFlag!].toLowerCase()}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
        <section className="panel">
          <div className="panel-head">
            <h2 className="h3">Notices</h2>
            <Link className="link" to={`/s/${schoolId}/notices`}>
              Post a notice
            </Link>
          </div>
          <NoticeList notices={notices.data} limit={3} />
        </section>
        <section className="panel">
          <h2 className="h3">Score entry by arm</h2>
          <ul className="progress-list">
            {classes.map((c) => {
              const offs = offerings.filter((o) => o.classId === c.id);
              let exp = 0;
              for (const o of offs) exp += rosterOf(o, byClass(c.id)).length;
              const got = subjectRecs.data.filter((r) => r.classId === c.id && Object.keys(r.scores ?? {}).length).length;
              return (
                <li key={c.id}>
                  <Link to={`/s/${schoolId}/classes/${c.id}?tab=subjects`}>{c.name}</Link>
                  <span className="bar" aria-hidden>
                    <i style={{ transform: `scaleX(${exp ? got / exp : 0})`, background: CLASS_COLOURS[c.colour].bg }} />
                  </span>
                  <span className="muted small">{exp ? `${Math.round((got / exp) * 100)}%` : 'No students'}</span>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value, note, to }: { label: string; value: string; note: string; to: string }) {
  return (
    <Link to={to} className="stat">
      <span className="mono">{label}</span>
      <b>{value}</b>
      <span className="muted small">{note}</span>
    </Link>
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
