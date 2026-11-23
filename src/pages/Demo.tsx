import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { addStudents, createSchool, getUserSchools, saveRecord, saveStudent } from '../data/api';
import { getDoc, getDocs, query } from 'firebase/firestore';
import { paths } from '../data/api';
import { DEMO_CLASSES } from '../sample';
import type { ClassRoom, School } from '../data/types';
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
        // Reuse this browser's demo school if it already has one.
        const mine = await getUserSchools(u.uid);
        const existing = Object.keys(mine.schools)[0];
        if (existing) return nav(`/s/${existing}`, { replace: true });

        setStatus('Setting up Greenfield Academy (demo)…');
        const schoolId = await createSchool(
          { uid: u.uid, name: 'Demo teacher', email: '' },
          {
            name: 'Greenfield Academy (demo)',
            country: 'Nigeria',
            termName: 'First term',
            levels: ['Primary 5', 'JSS 1'],
            subjects: ['Mathematics', 'English Language', 'Basic Science'],
            classes: DEMO_CLASSES.map((c) => ({ name: c.name, level: c.level, subject: c.subject })),
            demo: true,
          },
        );
        const school = (await getDoc(paths.school(schoolId))).data() as School;
        const classes = (await getDocs(query(paths.classes(schoolId)))).docs.map((d) => d.data() as ClassRoom);
        setStatus('Adding students and notes…');
        for (const dc of DEMO_CLASSES) {
          const cls = classes.find((c) => c.name === dc.name)!;
          const created = await addStudents(schoolId, cls.id, dc.students.map((s) => s.name), 0);
          for (let i = 0; i < created.length; i++) {
            const src = dc.students[i];
            await saveStudent(schoolId, { ...created[i], pronoun: src.pronoun, admissionNo: src.admissionNo, guardians: src.guardians });
            await saveRecord(schoolId, u.uid, { termId: school.currentTermId, studentId: created[i].id, classId: cls.id, notes: src.notes });
          }
        }
        nav(`/s/${schoolId}`, { replace: true });
      } catch (e) {
        setStatus(`The demo couldn't open: ${(e as Error).message}`);
      }
    })();
  }, [ready, user, signInDemo, nav]);

  return (
    <AuthShell eyebrow="Demo school" title="One moment.">
      <div className="auth-card">
        <p className="muted">{status}</p>
        <p className="small muted">The demo uses made-up students. It's private to this browser and you can delete it any time from Settings.</p>
      </div>
    </AuthShell>
  );
}
