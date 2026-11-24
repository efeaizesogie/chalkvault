import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDoc, getDocs, writeBatch, type DocumentReference } from 'firebase/firestore';
import { useAuth } from '../auth/AuthProvider';
import { addNotice, blankStudent, createSchool, deleteSchool, getUserSchools, modDoc, newPin, paths, updateSchool } from '../data/api';
import { seedDemoHistory } from './demoHistory';
import { getDb } from '../lib/firebase';
import { DEMO_ARMS, DEMO_LEVELS, DEMO_STAFF, DEMO_SUBJECTS, demoComment, demoRoster, rng } from './demoData';
import { DEMO_STUDENTS } from '../sample';
import type { ClassRoom, FeeItem, Invoice, Member, Offering, Payment, Role, School, StudentProfile, SubjectRecord, Term, TermRecord } from '../data/types';

/** Writes in batches of 400, Firestore's limit being 500 per batch. */
function batcher() {
  const ops: [DocumentReference, object][] = [];
  return {
    set: (ref: DocumentReference, data: object) => ops.push([ref, data]),
    commit: async () => {
      for (let i = 0; i < ops.length; i += 400) {
        const b = writeBatch(getDb());
        for (const [ref, data] of ops.slice(i, i + 400)) b.set(ref, data);
        await b.commit();
      }
    },
  };
}
const DEMO_VERSION = 4;
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
          // Older, smaller demo schools are replaced by the current one.
          if (s?.demo && (s.demoVersion ?? 0) < DEMO_VERSION) {
            await deleteSchool(id, u.uid).catch(() => undefined);
            continue;
          }
          if (s?.arms) return nav(`/s/${id}`, { replace: true });
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

        setStatus(`Adding ${DEMO_LEVELS.length * DEMO_ARMS.length} arms of students, notes and scores…`);
        const b = batcher();
        const r = rng(7);
        const seededStudents: StudentProfile[] = [];
        const seededScores: SubjectRecord[] = [];
        const handWritten = new Set(Object.values(DEMO_STUDENTS).flat().map((s) => s.name));
        // Form comments at different stages per arm, so staff progress shows a real spread.
        const written = [1, 1, 0.85, 0.7, 1, 0.55, 0.9, 0.4, 1, 0.75, 0.6, 0.3];
        const roster = demoRoster();
        for (const [ai, [armName, list]] of Object.entries(roster).entries()) {
          const cls = classes.find((c) => c.name === armName);
          if (!cls) continue;
          list.forEach((src, i) => {
            const s = { ...blankStudent(cls.id, src.name, i + 1), pronoun: src.pronoun, admissionNo: src.admissionNo, guardians: src.guardians, resultPin: newPin() };
            b.set(paths.student(schoolId, s.id), s);
            seededStudents.push(s);
            const avg = Object.values(src.scores).reduce((n, [x, y, z]) => n + x + y + z, 0) / Object.keys(src.scores).length;
            // The hand-written students keep their notes for the AI to write from; invented ones get a comment.
            const write = !handWritten.has(src.name) && i / list.length < written[ai % written.length];
            b.set(paths.record(schoolId, termId, s.id), {
              termId,
              studentId: s.id,
              classId: cls.id,
              notes: src.notes,
              ...(write ? { final: demoComment(src.name.split(' ')[0], src.pronoun, avg, src.notes), status: written[ai % written.length] === 1 ? ('approved' as const) : ('submitted' as const) } : {}),
              updatedAt: Date.now(),
              updatedBy: u.uid,
            } satisfies TermRecord);
            for (const [subject, [ca1, ca2, exam]] of Object.entries(src.scores)) {
              const o = offerings.find((x) => x.classId === cls.id && x.subject === subject);
              if (!o) continue;
              const scores: Record<string, number> = { ca1, exam };
              if (ca2 > 0) scores.ca2 = ca2; // a missed test shows as a gap, as in a real score sheet
              const rec: SubjectRecord = { termId, offeringId: o.id, classId: cls.id, studentId: s.id, subject, scores, updatedAt: Date.now(), updatedBy: u.uid };
              seededScores.push(rec);
              b.set(paths.subjectRecord(schoolId, termId, o.id, s.id), rec);
            }
          });
        }

        // Staff: primary form teachers teach every subject in their arm; JSS has subject specialists.
        const sorted = [...classes].sort((a, c) => DEMO_LEVELS.indexOf(a.level) - DEMO_LEVELS.indexOf(c.level) || a.name.localeCompare(c.name));
        const primary = sorted.filter((c) => c.level.startsWith('Primary'));
        const jss = sorted.filter((c) => c.level.startsWith('JSS'));
        const staff = batcher();
        const teach = new Map<string, string[]>(); // offeringId -> teacher uids
        const member = (i: number, name: string, role: Role, classIds: string[], offeringIds: string[]) => {
          const uidX = `demo-staff-${i}`;
          for (const o of offeringIds) teach.set(o, [...(teach.get(o) ?? []), uidX]);
          const subjectClassIds = [...new Set(offerings.filter((o) => offeringIds.includes(o.id)).map((o) => o.classId))];
          staff.set(paths.member(schoolId, uidX), { uid: uidX, name, email: `${name.split(' ').slice(1).join('.').toLowerCase()}@greenfield.example`, role, classIds, offeringIds, subjectClassIds, joinedAt: Date.now() } satisfies Member);
        };
        DEMO_STAFF.primary.forEach((name, i) => primary[i] && member(i, name, 'teacher', [primary[i].id], offerings.filter((o) => o.classId === primary[i].id).map((o) => o.id)));
        DEMO_STAFF.jss.forEach((t, i) => member(10 + i, t.name, 'teacher', jss[i] ? [jss[i].id] : [], t.subject ? offerings.filter((o) => o.subject === t.subject && jss.some((c) => c.id === o.classId)).map((o) => o.id) : []));
        member(20, DEMO_STAFF.admin, 'admin', [], []);
        member(21, DEMO_STAFF.bursar, 'bursar', [], []);
        for (const o of offerings) if (teach.has(o.id)) staff.set(paths.offering(schoolId, o.id), { ...o, teacherIds: teach.get(o.id)! });

        // Fees: tuition by level, most families paid, some part-paid, a few not yet.
        const fee = (id: string, name: string, amount: number, levels: string[]): FeeItem => ({ id, name, amount, levels, optional: false, discountable: true, createdAt: Date.now() });
        const items = [fee('tuition-primary', 'Tuition (primary)', 85000, DEMO_LEVELS.slice(0, 3)), fee('tuition-jss', 'Tuition (JSS)', 110000, DEMO_LEVELS.slice(3)), fee('books', 'Books and stationery', 15000, [])];
        for (const it of items) b.set(modDoc(schoolId, 'feeItems', it.id), it);
        let receipt = 0;
        for (const s of seededStudents) {
          const level = classes.find((c) => c.id === s.classId)!.level;
          const lines = items.filter((it) => !it.levels.length || it.levels.includes(level)).map((it) => ({ name: it.name, amount: it.amount }));
          const total = lines.reduce((n, l) => n + l.amount, 0);
          const roll = r();
          const paid = roll < 0.64 ? total : roll < 0.9 ? Math.round((total * (0.3 + r() * 0.4)) / 500) * 500 : 0;
          const inv: Invoice = { id: `${termId}_${s.id}`, termId, studentId: s.id, classId: s.classId, lines, discounts: [], arrears: 0, total, paid, balance: total - paid, optionalIds: [], updatedAt: Date.now() };
          b.set(modDoc(schoolId, 'invoices', inv.id), inv);
          if (paid) {
            receipt++;
            const p: Payment = {
              id: `demo-pay-${receipt}`,
              termId,
              studentId: s.id,
              classId: s.classId,
              amount: paid,
              method: r() < 0.7 ? 'transfer' : 'pos',
              reference: `TRF${100000 + receipt}`,
              payer: s.guardians[0]?.name ?? '',
              date: new Date(Date.now() - Math.floor(r() * 40) * 864e5).toISOString().slice(0, 10),
              receiptNo: `RCP-${String(receipt).padStart(4, '0')}`,
              receivedBy: u.uid,
              at: Date.now(),
            };
            b.set(modDoc(schoolId, 'payments', p.id), p);
          }
        }
        await b.commit();
        // Placeholder staff need the demo rule in firestore.rules; without it the demo still opens, just without staff.
        await staff.commit().catch((e) => console.warn('Demo staff not added:', e));
        setStatus('Adding registers and last term’s figures…');
        const term = (await getDoc(paths.term(schoolId, termId))).data() as Term;
        await seedDemoHistory({ schoolId, school, term, uid: u.uid, classes, offerings, students: seededStudents, subjectRecords: seededScores });
        await updateSchool(schoolId, { demoVersion: DEMO_VERSION });
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
