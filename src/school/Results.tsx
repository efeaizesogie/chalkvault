import { useState } from 'react';
import { Link } from 'react-router-dom';
import { arrayUnion, getDoc, query, updateDoc, where } from 'firebase/firestore';
import { modDoc, newPin, paths, publishResult, readResult, saveStudent } from '../data/api';
import { useQuery } from '../data/hooks';
import { CLASS_COLOURS, type ClassRoom, type Invoice, type ReportCard, type StudentProfile } from '../data/types';
import { friendlyError } from '../lib/errors';
import { useToast } from '../ui/toast';
import { useSchool } from './SchoolContext';
import { printDoc } from '../lib/print';
import { slipsDoc } from '../lib/printDocs';

/** Publish an arm's report cards to the result portal. Each student keeps the same private PIN every term. */
export function PublishButton({ classId, students, cards, blocked }: { classId: string; students: StudentProfile[]; cards: Map<string, ReportCard>; blocked: boolean }) {
  const { schoolId, school, term } = useSchool();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const publish = async () => {
    if (!term) return;
    if (blocked && !confirm('Some form comments are not approved yet. Publish anyway?')) return;
    setBusy(true);
    let n = 0;
    try {
      for (const s of students) {
        const card = cards.get(s.id);
        if (!card || !card.subjects.some((x) => x.grade)) continue;
        let pin = s.resultPin;
        if (!pin) {
          pin = newPin();
          await saveStudent(schoolId, { ...s, resultPin: pin });
        }
        const existing = await readResult(pin).catch(() => null);
        const inv = (await getDoc(modDoc(schoolId, 'invoices', `${term.id}_${s.id}`)).catch(() => null))?.data() as Invoice | undefined;
        await publishResult({
          pin,
          schoolId,
          schoolName: school.name,
          ...(school.address ? { schoolAddress: school.address } : {}),
          ...(school.logo ? { schoolLogo: school.logo } : {}),
          ...(school.motto ? { schoolMotto: school.motto } : {}),
          studentName: s.name,
          admissionNo: s.admissionNo,
          reports: { ...(existing?.reports ?? {}), [term.id]: { ...card, publishedAt: Date.now() } },
          ...(inv ? { fees: { termName: term.name, total: inv.total, paid: inv.paid, balance: inv.balance, asOf: Date.now() } } : {}),
          updatedAt: Date.now(),
        });
        n++;
      }
      if (n) await updateDoc(paths.term(schoolId, term.id), { publishedArms: arrayUnion(classId) });
      toast(n ? `Published ${n} report card${n === 1 ? '' : 's'}. Parents can now open them with their result PIN.` : 'No report cards with scores to publish yet.');
    } catch (e) {
      toast(friendlyError(e), 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <button className="ticket" onClick={publish} disabled={busy}>
      {busy ? 'Publishing…' : 'Publish to parents'}
    </button>
  );
}

/** Admin page: every arm's results, PIN slips for parents. */
export function ResultsPage() {
  const { schoolId, classes, school } = useSchool();
  const [slips, setSlips] = useState<ClassRoom | null>(null);
  const portal = new URL(`${import.meta.env.BASE_URL}results`, location.origin).toString();
  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1 className="display-sm">Results</h1>
          <p className="lede">
            Compile and publish report cards arm by arm. Parents open them at <b>{portal}</b> with their child’s private result PIN.
          </p>
        </div>
      </header>
      <ul className="results-list">
        {classes.map((c) => (
          <li key={c.id}>
            <span className="swatch-dot" style={{ ['--c' as string]: CLASS_COLOURS[c.colour].bg }} aria-hidden />
            <span className="results-name">{c.name}</span>
            <Link className="link" to={`/s/${schoolId}/classes/${c.id}?tab=reports`}>
              Report cards
            </Link>
            <button className="link" onClick={() => setSlips(c)}>
              Print PIN slips
            </button>
          </li>
        ))}
      </ul>
      {slips && <PinSlips cls={slips} schoolName={school.name} portal={portal} onDone={() => setSlips(null)} />}
    </div>
  );
}

function PinSlips({ cls, schoolName, portal, onDone }: { cls: ClassRoom; schoolName: string; portal: string; onDone: () => void }) {
  const { schoolId } = useSchool();
  const toast = useToast();
  const st = useQuery<StudentProfile>(query(paths.students(schoolId), where('classId', '==', cls.id)), `slips:${cls.id}`);
  const list = [...st.data].sort((a, b) => a.name.localeCompare(b.name));
  const missing = list.filter((s) => !s.resultPin);
  return (
    <section className="panel slips-panel">
      <div className="row-actions">
        <h2 className="h3">PIN slips for {cls.name}</h2>
        <div className="head-actions">
          {missing.length > 0 && (
            <button
              className="pill ghost"
              onClick={async () => {
                try {
                  for (const s of missing) await saveStudent(schoolId, { ...s, resultPin: newPin() });
                } catch (e) {
                  toast(friendlyError(e), 'error');
                }
              }}
            >
              Create {missing.length} missing PIN{missing.length === 1 ? '' : 's'}
            </button>
          )}
          <button className="pill ghost" onClick={() => printDoc(`Result PIN slips, ${cls.name}`, slipsDoc({ schoolName, arm: cls.name, portal, students: list.map((s) => ({ name: s.name, pin: s.resultPin })) }), { letterhead: false })}>
            Print slips
          </button>
          <button className="link" onClick={onDone}>
            Close
          </button>
        </div>
      </div>
      <div className="slips">
        {list.map((s) => (
          <div key={s.id} className="slip-card">
            <b>{schoolName}</b>
            <span>{s.name}</span>
            <span className="muted small">{cls.name}</span>
            <span className="pin">{s.resultPin ?? 'No PIN yet'}</span>
            <span className="muted small">Check results at {portal}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
