import { useMemo, useState } from 'react';
import { getDoc, getDocs, query, where, writeBatch } from 'firebase/firestore';
import { mod, paths, type ModuleName } from '../data/api';
import { getDb } from '../lib/firebase';
import { useQuery } from '../data/hooks';
import type { StudentProfile, SubjectRecord } from '../data/types';
import { cumulativeFor, sessionTermsUpTo } from '../lib/cumulative';
import { assessmentsOf } from '../lib/results';
import { download } from '../lib/export';
import { friendlyError } from '../lib/errors';
import { useToast } from '../ui/toast';
import { useSchool } from './SchoolContext';

const MODULES: ModuleName[] = ['feeItems', 'invoices', 'payments', 'messages', 'lessons', 'incidents', 'applications', 'timetable', 'leave', 'books', 'loans', 'routes', 'inventory'];

/** End-of-session promotion and full data export (Settings, admins only). */
export function SessionTools() {
  const { schoolId, school, classes, term, terms, policy } = useSchool();
  const toast = useToast();
  const students = useQuery<StudentProfile>(paths.students(schoolId), `promo-st:${schoolId}`);
  const active = students.data.filter((s) => (s.status ?? 'active') === 'active');
  // The promotion rule, from the session's cumulative results.
  const sessionTerms = useMemo(() => sessionTermsUpTo(terms, term), [terms, term]);
  const sessionRecs = useQuery<SubjectRecord>(sessionTerms.length ? query(paths.subjectRecords(schoolId), where('termId', 'in', sessionTerms.map((t) => t.id).slice(0, 10))) : null, `promo-sr:${sessionTerms.map((t) => t.id).join(',')}`);
  const review = useMemo(
    () =>
      active
        .map((s) => ({ s, cum: cumulativeFor(s.id, sessionTerms, sessionRecs.data, assessmentsOf(school), policy) }))
        .filter((x) => x.cum && !x.cum.passes)
        .sort((a, b) => a.s.classId.localeCompare(b.s.classId) || a.s.name.localeCompare(b.s.name)),
    [active, sessionTerms, sessionRecs.data, school, policy],
  );
  const [repeat, setRepeat] = useState<Record<string, boolean>>({});
  const repeats = (id: string) => repeat[id] ?? true;

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
    const held = new Set(review.filter((r) => repeats(r.s.id)).map((r) => r.s.id));
    const graduating = active.filter((s) => !held.has(s.id) && dest(s.classId) === 'graduate').length;
    const moving = active.filter((s) => !held.has(s.id) && !['stay', 'graduate'].includes(dest(s.classId))).length;
    if (!confirm(`Promote ${moving} students to their next class, graduate ${graduating}${held.size ? ` and keep ${held.size} in their class to repeat` : ''}? Do this once, at the end of the session, after report cards are published.`)) return;
    setBusy(true);
    try {
      // Every move is decided from the list as it is now, so nobody is promoted twice.
      const moves = active.filter((s) => !held.has(s.id)).map((s) => ({ s, to: dest(s.classId) })).filter((m) => m.to !== 'stay');
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
      download(`${slug}-students.csv`, 'Name,Admission no,Class,Status,Date of birth,Guardian,Phone,Email\r\n' + rows.join('\r\n'));
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
        {review.length > 0 && (
          <div className="promo-review">
            <h3 className="h4">
              {review.length} student{review.length === 1 ? '' : 's'} did not meet the promotion rule
            </h3>
            <p className="muted small">
              The rule: a cumulative average of {policy.passMark}% or more{policy.creditSubjects.length ? `, and at least ${policy.creditMark}% in ${policy.creditSubjects.join(' and ')}` : ''}. Ticked students stay in their class. Untick anyone the school decides to promote anyway.
            </p>
            <ul className="queue-list">
              {review.map(({ s, cum }) => (
                <li key={s.id}>
                  <label className="check">
                    <input type="checkbox" checked={repeats(s.id)} onChange={(e) => setRepeat((r) => ({ ...r, [s.id]: e.target.checked }))} /> {s.name}, {classes.find((c) => c.id === s.classId)?.name}
                  </label>
                  <span className="muted small">{cum!.reasons.join('; ')}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
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
