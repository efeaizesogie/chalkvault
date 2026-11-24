import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDoc, getDocs, writeBatch } from 'firebase/firestore';
import { useAuth } from '../auth/AuthProvider';
import { addNotice, blankStudent, createSchool, deleteSchool, getUserSchools, newPin, paths, updateSchool } from '../data/api';
import { seedDemoHistory } from './demoHistory';
import { getDb } from '../lib/firebase';
import { DEMO_ARMS, DEMO_LEVELS, DEMO_STUDENTS, DEMO_SUBJECTS } from '../sample';
import type { ClassRoom, Offering, School, StudentProfile, SubjectRecord, Term, TermRecord } from '../data/types';
import { AuthShell } from './AuthShell';

/** Signs in anonymously and seeds a private demo school, so anyone can try Chalkvault without an account. */
export function Demo() {
  const { user, ready, signInDemo } = useAuth();
  const nav = useNavigate();
  const [status, setStatus] = useState('Opening the demo school…');
  const started = useRef(false);

  useEffect(() => {
    if (!ready || started.current) return;
    started.current = true;
    (async () => {
      try {
        const u = user ?? (await signInDemo());
        // Reuse this browser's demo school if it already has one in the current format.
        const mine = await getUserSchools(u.uid);
        for (const id of Object.keys(mine.schools)) {
          const s = (await getDoc(paths.school(id)).catch(() => null))?.data() as School | undefined;
          // Demo schools last a week; after that this browser gets a fresh one.
          if (s?.demo && Date.now() - (s.createdAt ?? 0) > 7 * 864e5) {
            await deleteSchool(id, u.uid).catch(() => undefined);
            continue;
          }
          if (s?.arms && (s.demoVersion ?? 0) >= 3) return nav(`/s/${id}`, { replace: true });
        }

        setStatus('Setting up Greenfield Academy (demo)…');
        const schoolId = await createSchool(
          { uid: u.uid, name: 'Demo head teacher', email: '' },
          {
            name: 'Greenfield Academy (demo)',
            country: 'Nigeria',
            termName: 'First term',
            levels: DEMO_LEVELS,
            arms: DEMO_ARMS,
            subjects: DEMO_SUBJECTS,
            classes: DEMO_LEVELS.flatMap((level) => DEMO_ARMS.map((arm) => ({ name: `${level}${arm}`, level, arm, subject: '' }))),
            demo: true,
          },
        );
        const school = (await getDoc(paths.school(schoolId))).data() as School;
        const termId = school.currentTermId;
        const classes = (await getDocs(paths.classes(schoolId))).docs.map((d) => d.data() as ClassRoom);
        const offerings = (await getDocs(paths.offerings(schoolId))).docs.map((d) => d.data() as Offering);

        setStatus('Adding students, notes and scores…');
        const b = writeBatch(getDb());
        const seededStudents: StudentProfile[] = [];
        const seededScores: SubjectRecord[] = [];
        for (const [armName, list] of Object.entries(DEMO_STUDENTS)) {
          const cls = classes.find((c) => c.name === armName);
          if (!cls) continue;
          list.forEach((src, i) => {
            const s = { ...blankStudent(cls.id, src.name, i + 1), pronoun: src.pronoun, admissionNo: src.admissionNo, guardians: src.guardians, resultPin: newPin() };
            b.set(paths.student(schoolId, s.id), s);
            seededStudents.push(s);
            b.set(paths.record(schoolId, termId, s.id), { termId, studentId: s.id, classId: cls.id, notes: src.notes, updatedAt: Date.now(), updatedBy: u.uid } satisfies TermRecord);
            for (const [subject, [ca1, ca2, exam]] of Object.entries(src.scores)) {
              const o = offerings.find((x) => x.classId === cls.id && x.subject === subject);
              if (!o) continue;
              const scores: Record<string, number> = { ca1, exam };
              if (ca2 > 0) scores.ca2 = ca2; // a missed test shows as a gap, as in a real score sheet
              const rec: SubjectRecord = {
                termId,
                offeringId: o.id,
                classId: cls.id,
                studentId: s.id,
                subject,
                scores,
                updatedAt: Date.now(),
                updatedBy: u.uid,
              };
              seededScores.push(rec);
              b.set(paths.subjectRecord(schoolId, termId, o.id, s.id), rec);
            }
          });
        }
        await b.commit();
        setStatus('Adding registers and last term’s figures…');
        const term = (await getDoc(paths.term(schoolId, termId))).data() as Term;
        await seedDemoHistory({ schoolId, school, term, uid: u.uid, classes, offerings, students: seededStudents, subjectRecords: seededScores });
        await updateSchool(schoolId, { demoVersion: 3 });
        await addNotice(schoolId, {
          title: 'Report cards due Friday',
          body: 'Please finish score sheets and form teacher comments by Friday. Results will be published to parents on Monday.',
          audience: 'staff',
          by: u.uid,
          byName: 'Demo head teacher',
        });
        nav(`/s/${schoolId}`, { replace: true });
      } catch (e) {
        setStatus(`The demo couldn’t open: ${(e as Error).message}`);
      }
    })();
  }, [ready, user, signInDemo, nav]);

  return (
    <AuthShell title="Opening the demo school.">
      <div className="auth-card">
        <p className="muted">{status}</p>
        <p className="small muted">The demo uses made-up students. It’s private to this browser and you can delete it any time from Settings.</p>
      </div>
    </AuthShell>
  );
}
