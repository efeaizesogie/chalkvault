import type { ReportCard } from '../data/types';

/** A printable report card. Used in the app, in the parent portal, and for printing a whole arm. */
export function ReportCardView(props: {
  card: ReportCard;
  schoolName: string;
  schoolAddress?: string;
  motto?: string;
  principalName?: string;
  studentName: string;
  admissionNo: string;
}) {
  const c = props.card;
  return (
    <article className="report-card-sheet">
      <header className="rc-head">
        <div>
          <h2 className="rc-school">{props.schoolName}</h2>
          {props.schoolAddress && <p className="rc-sub">{props.schoolAddress}</p>}
          {props.motto && <p className="rc-sub rc-motto">{props.motto}</p>}
        </div>
        <div className="rc-term">
          <b>{c.termName}</b>
          {c.session && <span>{c.session} session</span>}
        </div>
      </header>

      <dl className="rc-who">
        <div>
          <dt>Student</dt>
          <dd>{props.studentName}</dd>
        </div>
        <div>
          <dt>Class</dt>
          <dd>{c.className}</dd>
        </div>
        <div>
          <dt>Admission no.</dt>
          <dd>{props.admissionNo || 'Not set'}</dd>
        </div>
        <div>
          <dt>Average</dt>
          <dd>{c.average ? `${c.average}%` : 'No scores yet'}</dd>
        </div>
        {c.position && (
          <div>
            <dt>Position</dt>
            <dd>{c.position}</dd>
          </div>
        )}
        {c.attendance && (
          <div>
            <dt>Attendance</dt>
            <dd>
              {c.attendance.present} of {c.attendance.days} days
            </dd>
          </div>
        )}
      </dl>

      <div className="rc-table-wrap">
        <table className="rc-table">
          <thead>
            <tr>
              <th scope="col">Subject</th>
              {c.assessments.map((a) => (
                <th key={a.key} scope="col" className="num">
                  {a.label} ({a.max})
                </th>
              ))}
              <th scope="col" className="num">Total</th>
              <th scope="col">Grade</th>
              {c.subjects.some((s) => s.position) && <th scope="col">Position</th>}
              <th scope="col">Remark</th>
            </tr>
          </thead>
          <tbody>
            {c.subjects.map((s) => (
              <tr key={s.subject}>
                <th scope="row">{s.subject}</th>
                {c.assessments.map((a) => (
                  <td key={a.key} className="num">
                    {s.scores[a.key] ?? ''}
                  </td>
                ))}
                <td className="num rc-total">{s.grade ? s.total : ''}</td>
                <td>{s.grade}</td>
                {c.subjects.some((x) => x.position) && <td>{s.position ?? ''}</td>}
                <td className="rc-remark">{s.teacherRemark || s.remark}</td>
              </tr>
            ))}
            {c.subjects.length === 0 && (
              <tr>
                <td colSpan={c.assessments.length + 4} className="muted">
                  No subjects yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <section className="rc-comments">
        <div>
          <h3>Form teacher’s comment</h3>
          <p>{c.formComment || <span className="muted">Not written yet.</span>}</p>
        </div>
        <div>
          <h3>{props.principalName ? `Principal’s comment (${props.principalName})` : 'Principal’s comment'}</h3>
          <p>{c.principalComment || <span className="muted">Not written yet.</span>}</p>
        </div>
      </section>

      <footer className="rc-foot">
        {c.nextTermBegins && (
          <p>
            Next term begins: <b>{new Date(c.nextTermBegins + 'T12:00').toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}</b>
          </p>
        )}
        <p className="rc-key">
          Grades:{' '}
          {c.gradeKey.map((b, i) => (
            <span key={b.grade}>
              {i > 0 && ', '}
              {b.grade} {b.min > 0 ? `${b.min}% and above` : `below ${c.gradeKey[i - 1]?.min ?? 0}%`}
            </span>
          ))}
        </p>
      </footer>
    </article>
  );
}
