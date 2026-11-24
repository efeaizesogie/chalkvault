import { useMemo, useState } from 'react';
import { getDoc, getDocs, writeBatch } from 'firebase/firestore';
import { mod, paths, type ModuleName } from '../data/api';
import { getDb } from '../lib/firebase';
import { useQuery } from '../data/hooks';
import type { StudentProfile } from '../data/types';
import { download } from '../lib/export';
import { friendlyError } from '../lib/errors';
import { useToast } from '../ui/toast';
import { useSchool } from './SchoolContext';

const MODULES: ModuleName[] = ['feeItems', 'invoices', 'payments', 'messages', 'lessons', 'incidents', 'applications', 'timetable', 'leave', 'books', 'loans', 'routes', 'inventory'];

/** End-of-session promotion and full data export (Settings, admins only). */
export function SessionTools() {
  const { schoolId, school, classes, term } = useSchool();
  const toast = useToast();
  const students = useQuery<StudentProfile>(paths.students(schoolId), `promo-st:${schoolId}`);
  const active = students.data.filter((s) => (s.status ?? 'active') === 'active');

  // Default plan: each arm moves to the next level's arm with the same arm name; the final level graduates.
  const defaults = useMemo(() => {
    const plan: Record<string, string> = {};
    for (const c of classes) {
      const i = school.levels.indexOf(c.level);
      const next = school.levels[i + 1];
      if (!next) plan[c.id] = 'graduate';
      else plan[c.id] = classes.find((x) => x.level === next && (x.arm ?? '') === (c.arm ?? ''))?.id ?? classes.find((x) => x.level === next)?.id ?? 'stay';
    }
    return plan;
  }, [classes, school.levels]);
  const [plan, setPlan] = useState<Record<string, string>>({});
  const dest = (id: string) => plan[id] ?? defaults[id];
  const [busy, setBusy] = useState(false);

  const promote = async () => {
    const graduating = active.filter((s) => dest(s.classId) === 'graduate').length;
    const moving = active.filter((s) => !['stay', 'graduate'].includes(dest(s.classId))).length;
    if (!confirm(`Promote ${moving} students to their next class and graduate ${graduating}? Do this once, at the end of the session, after report cards are published.`)) return;
    setBusy(true);
    try {
      // Every move is decided from the list as it is now, so nobody is promoted twice.
      const moves = active.map((s) => ({ s, to: dest(s.classId) })).filter((m) => m.to !== 'stay');
      for (let i = 0; i < moves.length; i += 400) {
        const b = writeBatch(getDb());
        for (const { s, to } of moves.slice(i, i + 400)) {
          if (to === 'graduate') b.update(paths.student(schoolId, s.id), { status: 'alumni', graduatedSession: term?.session ?? '' });
          else b.update(paths.student(schoolId, s.id), { classId: to });
        }
        await b.commit();
      }
      toast(`Done. ${moving} promoted and ${graduating} graduated. Start the new session’s first term in Terms above.`);
    } catch (e) {
      toast(friendlyError(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  const exportAll = async () => {
    setBusy(true);
    try {
      const out: Record<string, unknown> = { exportedAt: new Date().toISOString(), school: (await getDoc(paths.school(schoolId))).data() };
      const cols: [string, ReturnType<typeof paths.students>][] = [
        ['members', paths.members(schoolId)],
        ['terms', paths.terms(schoolId)],
        ['classes', paths.classes(schoolId)],
        ['offerings', paths.offerings(schoolId)],
        ['students', paths.students(schoolId)],
        ['records', paths.records(schoolId)],
        ['subjectRecords', paths.subjectRecords(schoolId)],
        ['attendance', paths.attendance(schoolId)],
        ['notices', paths.notices(schoolId)],
        ['ledger', paths.ledger(schoolId)],
        ...MODULES.map((m) => [m, mod(schoolId, m)] as [string, ReturnType<typeof paths.students>]),
      ];
      for (const [name, ref] of cols) out[name] = (await getDocs(ref)).docs.map((d) => d.data());
      const slug = school.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      download(`${slug}-chalkvault-export-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(out, null, 2), 'application/json');
      const q = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const rows = (out.students as StudentProfile[]).map((s) =>
        [s.name, s.admissionNo, classes.find((c) => c.id === s.classId)?.name, s.status ?? 'active', s.dob, s.guardians[0]?.name, s.guardians[0]?.phone, s.guardians[0]?.email].map(q).join(','),
      );
      download(`${slug}-students.csv`, '﻿Name,Admission no,Class,Status,Date of birth,Guardian,Phone,Email\r\n' + rows.join('\r\n'));
      toast('Exported everything: a JSON file with every record, and a students CSV.');
    } catch (e) {
      toast(friendlyError(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <section className="panel wide">
        <h2 className="h3">End of session: promote students</h2>
        <p className="muted small">
          Each arm moves up to the next class. Students in the final class become alumni. Change any arm below, then promote once, after the last term’s results are
          published.
        </p>
        <div className="table-wrap">
          <table className="gradebook">
            <thead>
              <tr>
                <th scope="col">From</th>
                <th scope="col" className="num">Students</th>
                <th scope="col">Moves to</th>
              </tr>
            </thead>
            <tbody>
              {classes.map((c) => (
                <tr key={c.id}>
                  <th scope="row">{c.name}</th>
                  <td className="num">{active.filter((s) => s.classId === c.id).length}</td>
                  <td>
                    <select value={dest(c.id)} onChange={(e) => setPlan((p) => ({ ...p, [c.id]: e.target.value }))}>
                      <option value="graduate">Graduate (alumni)</option>
                      <option value="stay">Stay in {c.name}</option>
                      {classes
                        .filter((x) => x.id !== c.id)
                        .map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.name}
                          </option>
                        ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <button className="pill ink" onClick={promote} disabled={busy || !active.length}>
            Promote students
          </button>
        </div>
      </section>
      <section className="panel wide">
        <h2 className="h3">Export all your data</h2>
        <p className="muted small">Your school owns its records. Download everything as JSON, plus a students CSV you can open in Excel. Free, any time.</p>
        <div>
          <button className="pill ghost" onClick={exportAll} disabled={busy}>
            Export everything
          </button>
        </div>
      </section>
    </>
  );
}
