import { useMemo } from 'react';
import { query, where } from 'firebase/firestore';
import { mod, modDoc, paths } from '../data/api';
import { useDoc, useQuery } from '../data/hooks';
import type { AttendanceDay, Invoice, StudentProfile, SubjectRecord, Term, TermRecord, TermSummary } from '../data/types';
import { assessmentsOf, bandsOf } from '../lib/results';
import { computeTermStats } from '../lib/termStats';
import { useSchool } from './SchoolContext';

/** Live figures for one term, computed in this browser from that term's records. Admins only. */
export function useTermStats(term: Term | null, students?: StudentProfile[]) {
  const { schoolId, school, classes, offerings } = useSchool();
  const id = term?.id ?? '';
  const st = useQuery<StudentProfile>(students || !id ? null : paths.students(schoolId), `ts-st:${schoolId}:${!!students}:${!!id}`);
  const att = useQuery<AttendanceDay>(id ? query(paths.attendance(schoolId), where('termId', '==', id)) : null, `ts-att:${id}`);
  const sr = useQuery<SubjectRecord>(id ? query(paths.subjectRecords(schoolId), where('termId', '==', id)) : null, `ts-sr:${id}`);
  const rec = useQuery<TermRecord>(id ? query(paths.records(schoolId), where('termId', '==', id)) : null, `ts-rec:${id}`);
  const inv = useQuery<Invoice>(id ? query(mod(schoolId, 'invoices'), where('termId', '==', id)) : null, `ts-inv:${id}`);
  const studentList = students ?? st.data;
  const loading = st.loading || att.loading || sr.loading || rec.loading || inv.loading;
  const stats = useMemo(
    () =>
      term
        ? computeTermStats({
            term,
            students: studentList,
            classes,
            levels: school.levels,
            offerings,
            attendance: att.data,
            subjectRecords: sr.data,
            records: rec.data,
            invoices: inv.data,
            assessments: assessmentsOf(school),
            bands: bandsOf(school),
          })
        : null,
    [term, studentList, classes, school, offerings, att.data, sr.data, rec.data, inv.data],
  );
  return { stats, loading, students: studentList, attendance: att.data, subjectRecords: sr.data, records: rec.data, invoices: inv.data };
}

/** The saved summary of a term (written when the term is closed), or null. */
export function useSavedSummary(termId: string | undefined) {
  const { schoolId } = useSchool();
  return useDoc<TermSummary>(termId ? modDoc(schoolId, 'termSummaries', termId) : null, `tsum:${termId}`);
}
