import { useMemo } from 'react';
import { query, where } from 'firebase/firestore';
import { paths } from '../data/api';
import { useQuery } from '../data/hooks';
import type { AttendanceDay, Mark, ReportCard, StudentProfile, SubjectRecord, TermRecord } from '../data/types';
import { assessmentsOf, bandsOf } from '../lib/results';
import { compileArm } from '../lib/reportCards';
import { cumulativeFor, sessionTermsUpTo, showsCumulative } from '../lib/cumulative';
import { useSchool } from './SchoolContext';

/** Everything a form teacher or admin needs about one arm this term, plus compiled report cards. */
export function useArm(classId: string, enabled = true) {
  const { schoolId, school, classes, offerings, term, terms, policy } = useSchool();
  const cls = classes.find((c) => c.id === classId) ?? null;
  const termId = term?.id ?? '';
  const on = enabled && !!cls;
  const students = useQuery<StudentProfile>(on ? query(paths.students(schoolId), where('classId', '==', classId)) : null, `arm-st:${classId}:${on}`);
  const formRecords = useQuery<TermRecord>(
    on && termId ? query(paths.records(schoolId), where('classId', '==', classId), where('termId', '==', termId)) : null,
    `arm-rec:${classId}:${termId}:${on}`,
  );
  const subjectRecords = useQuery<SubjectRecord>(
    on && termId ? query(paths.subjectRecords(schoolId), where('classId', '==', classId), where('termId', '==', termId)) : null,
    `arm-sr:${classId}:${termId}:${on}`,
  );
  const attendance = useQuery<AttendanceDay>(
    on && termId ? query(paths.attendance(schoolId), where('classId', '==', classId), where('termId', '==', termId)) : null,
    `arm-att:${classId}:${termId}:${on}`,
  );
  // Earlier terms of the session, for the cumulative result in third term.
  const sessionTerms = useMemo(() => sessionTermsUpTo(terms, term), [terms, term]);
  const cumulativeOn = on && showsCumulative(sessionTerms, term);
  const sessionRecords = useQuery<SubjectRecord>(
    cumulativeOn ? query(paths.subjectRecords(schoolId), where('classId', '==', classId), where('termId', 'in', sessionTerms.map((t) => t.id).slice(0, 10))) : null,
    `arm-cum:${classId}:${sessionTerms.map((t) => t.id).join(',')}:${cumulativeOn}`,
  );
  const armOfferings = useMemo(() => offerings.filter((o) => o.classId === classId), [offerings, classId]);
  const sortedStudents = useMemo(() => [...students.data.filter((s) => (s.status ?? 'active') === 'active')].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name)), [students.data]);

  // Subject-by-subject registers collapse to one mark per day: present if marked present or late in any lesson.
  const days = useMemo(() => {
    const byDate = new Map<string, AttendanceDay>();
    for (const d of attendance.data) {
      const cur = byDate.get(d.date);
      if (!cur) {
        byDate.set(d.date, { ...d, marks: { ...d.marks } });
        continue;
      }
      for (const [sid, m] of Object.entries(d.marks)) {
        const prev = cur.marks[sid];
        cur.marks[sid] = prev === 'P' || m === 'P' ? 'P' : prev === 'L' || m === 'L' ? 'L' : (m as Mark);
      }
    }
    return [...byDate.values()];
  }, [attendance.data]);

  const cards = useMemo(
    () => {
      const out =
      cls && term
        ? compileArm({
            className: cls.name,
            term,
            students: sortedStudents,
            offerings: armOfferings,
            subjectRecords: subjectRecords.data,
            formRecords: formRecords.data,
            attendance: days,
            assessments: assessmentsOf(school),
            bands: bandsOf(school),
            policy,
          })
        : new Map<string, ReportCard>();
      if (cumulativeOn) {
        for (const [sid, card] of out) {
          const cum = cumulativeFor(sid, sessionTerms, sessionRecords.data, assessmentsOf(school), policy);
          if (cum) card.cumulative = cum;
        }
      }
      return out;
    },
    [cls, term, sortedStudents, armOfferings, subjectRecords.data, formRecords.data, days, school, policy, cumulativeOn, sessionTerms, sessionRecords.data],
  );

  return {
    cls,
    students: sortedStudents,
    offerings: armOfferings,
    formRecords: formRecords.data,
    subjectRecords: subjectRecords.data,
    attendance: attendance.data,
    cards,
    loading: students.loading || formRecords.loading || subjectRecords.loading,
  };
}
