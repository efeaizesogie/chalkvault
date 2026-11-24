import { useMemo, useRef, useState } from 'react';
import { Link, Navigate, useOutletContext, useSearchParams } from 'react-router-dom';
import { mod, paths, patchIn, removeIn, saveIn, saveStudent, todayISO, updateSchool } from '../data/api';
import { useQuery } from '../data/hooks';
import type { FeeItem, Invoice, Payment, StudentProfile } from '../data/types';
import { buildInvoice, DEFAULT_FEES, matchReceipt, naira, paidOf, receiptNo, siblingRanks } from '../lib/fees';
import { PrivacyBlock, readReceipt } from '../lib/ai';
import { friendlyError } from '../lib/errors';
import { SourceStamp } from '../components/SourceStamp';
import { useToast } from '../ui/toast';
import { useSchool } from '../school/SchoolContext';
import type { WorkspaceCtx } from '../school/Workspace';
import './fees.css';

type Tab = 'overview' | 'invoices' | 'payments' | 'items';
const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'invoices', label: 'Invoices' },
  { id: 'payments', label: 'Payments' },
  { id: 'items', label: 'Fee items and discounts' },
];

export function FeesPage() {
  const { schoolId, school, classes, terms, term, isAdmin, me, policy } = useSchool();
  const ws = useOutletContext<WorkspaceCtx>();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const tab = (TABS.find((t) => t.id === params.get('tab'))?.id ?? 'overview') as Tab;
  const canSee = isAdmin || me.role === 'bursar';
  const termId = term?.id ?? '';

  const items = useQuery<FeeItem>(canSee ? mod(schoolId, 'feeItems') : null, `fee-items:${schoolId}`);
  const invoices = useQuery<Invoice>(canSee ? mod(schoolId, 'invoices') : null, `fee-inv:${schoolId}`);
  const payments = useQuery<Payment>(canSee ? mod(schoolId, 'payments') : null, `fee-pay:${schoolId}`);
  const studentsQ = useQuery<StudentProfile>(canSee ? paths.students(schoolId) : null, `fee-st:${schoolId}`);
  const students = useMemo(() => studentsQ.data.filter((s) => (s.status ?? 'active') === 'active').sort((a, b) => a.name.localeCompare(b.name)), [studentsQ.data]);
  const feePolicy = { ...DEFAULT_FEES, ...(school.fees ?? {}) };
  const termInvoices = invoices.data.filter((i) => i.termId === termId);
  const fail = (e: unknown) => toast(friendlyError(e), 'error');

  if (!canSee) return <Navigate to={`/s/${schoolId}`} replace />;

  // Earlier terms, latest first: arrears come from the most recent earlier invoice, even if a term had none.
  const order = terms.find((t) => t.id === termId)?.order ?? 0;
  const earlier = terms.filter((t) => t.order < order).sort((a, b) => b.order - a.order).map((t) => t.id);
  const lastInvoice = (studentId: string) => earlier.map((t) => invoices.data.find((i) => i.id === `${t}_${studentId}`)).find(Boolean);

  const generate = async () => {
    try {
      const ranks = siblingRanks(students);
      let n = 0;
      for (const s of students) {
        const cls = classes.find((c) => c.id === s.classId);
        if (!cls) continue;
        const existing = invoices.data.find((i) => i.id === `${termId}_${s.id}`);
        const prev = lastInvoice(s.id);
        const inv = buildInvoice({
          student: s,
          level: cls.level,
          termId,
          items: items.data,
          optionalIds: existing?.optionalIds ?? [],
          siblingRank: ranks.get(s.id) ?? 0,
          policy: feePolicy,
          arrears: prev ? Math.max(0, prev.balance) : Math.max(0, s.openingBalance ?? 0),
          paid: paidOf(payments.data, s.id, termId),
        });
        await saveIn(schoolId, 'invoices', inv);
        n++;
      }
      toast(`Created or updated ${n} invoices for ${term?.name}. Arrears from last term are carried in.`);
    } catch (e) {
      fail(e);
    }
  };

  // ----- summary figures -----
  const expected = termInvoices.reduce((n, i) => n + i.total, 0);
  const collected = termInvoices.reduce((n, i) => n + i.paid, 0);
  const outstanding = termInvoices.reduce((n, i) => n + Math.max(0, i.balance), 0);
  const nameOf = (id: string) => studentsQ.data.find((s) => s.id === id)?.name ?? 'Student';
  const armOf = (id: string) => classes.find((c) => c.id === id)?.name ?? '';

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1 className="display-sm">Fees</h1>
          <p className="lede">
            {term?.name}
            {term?.session ? `, ${term.session}` : ''}. Part payments, discounts and arrears are tracked per child.
          </p>
        </div>
      </header>
      <nav className="class-tabs fee-tabs" aria-label="Fee views">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'on' : ''} aria-current={tab === t.id ? 'page' : undefined} onClick={() => setParams(t.id === 'overview' ? {} : { tab: t.id })}>
            {t.label}
          </button>
        ))}
      </nav>

      {tab === 'overview' && (
        <>
          <section className="stat-grid">
            <div className="stat">
              <span className="mono">Expected this term</span>
              <b>{naira(expected)}</b>
              <span className="muted small">{termInvoices.length} invoices</span>
            </div>
            <div className="stat">
              <span className="mono">Collected</span>
              <b>{naira(collected)}</b>
              <span className="muted small">{expected ? Math.round((collected / expected) * 100) : 0}% of expected</span>
            </div>
            <div className="stat">
              <span className="mono">Outstanding</span>
              <b>{naira(outstanding)}</b>
              <span className="muted small">{termInvoices.filter((i) => i.balance > 0).length} families owing</span>
            </div>
          </section>
          {!termInvoices.length && (
            <section className="panel">
              <h2 className="h3">No invoices for this term yet</h2>
              <p className="muted">Set up fee items, then create invoices. Each child’s invoice includes class fees, chosen levies, discounts and any arrears.</p>
              <div>
                <button className="ticket" onClick={generate} disabled={!items.data.length}>
                  Create this term’s invoices
                </button>
              </div>
            </section>
          )}
          <div className="record-grid">
            <section className="panel">
              <h2 className="h3">Collection by arm</h2>
              <ul className="progress-list">
                {classes.map((c) => {
                  const inv = termInvoices.filter((i) => i.classId === c.id);
                  const t = inv.reduce((n, i) => n + i.total, 0);
                  const p = inv.reduce((n, i) => n + i.paid, 0);
                  if (!inv.length) return null;
                  return (
                    <li key={c.id}>
                      <span>{c.name}</span>
                      <span className="bar" aria-hidden>
                        <i style={{ transform: `scaleX(${t ? p / t : 0})`, background: 'var(--ink)' }} />
                      </span>
                      <span className="muted small">{t ? Math.round((p / t) * 100) : 0}%</span>
                    </li>
                  );
                })}
              </ul>
            </section>
            <section className="panel">
              <div className="panel-head">
                <h2 className="h3">Largest balances</h2>
                <Link className="link" to={`/s/${schoolId}/messages?kind=fees`}>
                  Remind parents
                </Link>
              </div>
              <ol className="queue-list">
                {[...termInvoices]
                  .filter((i) => i.balance > 0)
                  .sort((a, b) => b.balance - a.balance)
                  .slice(0, 8)
                  .map((i) => (
                    <li key={i.id}>
                      <Link to={`/s/${schoolId}/fees?tab=invoices&student=${i.studentId}`}>{nameOf(i.studentId)}</Link>
                      <span className="muted">
                        {armOf(i.classId)}, owes {naira(i.balance)}
                      </span>
                    </li>
                  ))}
              </ol>
            </section>
          </div>
        </>
      )}

      {tab === 'items' && <FeeItems items={items.data} canEdit={isAdmin || me.role === 'bursar'} onRegenerate={generate} />}

      {tab === 'invoices' && (
        <InvoiceList
          invoices={termInvoices}
          students={studentsQ.data}
          payments={payments.data}
          items={items.data}
          initial={params.get('student')}
          onRegenerate={generate}
          onToggleOptional={async (inv, itemId) => {
            const optionalIds = inv.optionalIds.includes(itemId) ? inv.optionalIds.filter((x) => x !== itemId) : [...inv.optionalIds, itemId];
            await patchIn(schoolId, 'invoices', inv.id, { optionalIds }).catch(fail);
            toast('Saved. Recalculate invoices to apply the change.');
          }}
          onFamily={async (s, patch) => saveStudent(schoolId, { ...s, ...patch }).catch(fail)}
        />
      )}

      {tab === 'payments' && (
        <Payments
          students={students}
          invoices={termInvoices}
          payments={payments.data.filter((p) => p.termId === termId)}
          allowCloud={policy.cloudScanning}
          onRecorded={async (p) => {
            const inv = termInvoices.find((i) => i.studentId === p.studentId);
            if (inv) await patchIn(schoolId, 'invoices', inv.id, { paid: inv.paid + p.amount, balance: inv.balance - p.amount });
          }}
          log={ws.log}
          refreshDevice={ws.refreshDevice}
          receiptCount={payments.data.length}
        />
      )}

      {isAdmin && tab === 'items' && (
        <section className="panel">
          <h2 className="h3">Discount rules</h2>
          <DiscountRules
            value={feePolicy}
            onSave={(v) =>
              updateSchool(schoolId, { fees: v })
                .then(() => toast('Discount rules saved. Recalculate invoices to apply them.'))
                .catch(fail)
            }
          />
        </section>
      )}
    </div>
  );
}

function DiscountRules({ value, onSave }: { value: typeof DEFAULT_FEES; onSave: (v: typeof DEFAULT_FEES) => void }) {
  const [sib, setSib] = useState(String(value.siblingPercent));
  const [staff, setStaff] = useState(String(value.staffChildPercent));
  return (
    <div className="form-grid">
      <label className="field">
        <span className="mono">Sibling discount, % off for the second child onwards</span>
        <input inputMode="numeric" value={sib} onChange={(e) => setSib(e.target.value)} />
      </label>
      <label className="field">
        <span className="mono">Staff child discount, %</span>
        <input inputMode="numeric" value={staff} onChange={(e) => setStaff(e.target.value)} />
      </label>
      <div>
        <button className="pill ink" onClick={() => onSave({ ...value, siblingPercent: Math.min(100, Number(sib) || 0), staffChildPercent: Math.min(100, Number(staff) || 0) })}>
          Save discount rules
        </button>
      </div>
    </div>
  );
}

function FeeItems({ items, canEdit, onRegenerate }: { items: FeeItem[]; canEdit: boolean; onRegenerate: () => void }) {
  const { schoolId, school } = useSchool();
  const toast = useToast();
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [levels, setLevels] = useState<string[]>([]);
  const [optional, setOptional] = useState(false);
  const [discountable, setDiscountable] = useState(true);
  const add = async () => {
    try {
      await saveIn(schoolId, 'feeItems', { name: name.trim(), amount: Number(amount) || 0, levels, optional, discountable, createdAt: Date.now() } as FeeItem);
      setName('');
      setAmount('');
      setLevels([]);
      setOptional(false);
      setDiscountable(true);
    } catch (e) {
      toast(friendlyError(e), 'error');
    }
  };
  return (
    <div className="record-grid">
      <section className="panel wide">
        <div className="table-wrap">
          <table className="gradebook">
            <thead>
              <tr>
                <th scope="col">Item</th>
                <th scope="col" className="num">Amount</th>
                <th scope="col">Classes</th>
                <th scope="col">Type</th>
                <th scope="col" />
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id}>
                  <th scope="row">{i.name}</th>
                  <td className="num">{naira(i.amount)}</td>
                  <td>{i.levels.length ? i.levels.join(', ') : 'Every class'}</td>
                  <td>
                    {canEdit ? (
                      <span className="item-flags">
                        <label>
                          <input type="checkbox" checked={i.optional} onChange={(e) => patchIn(schoolId, 'feeItems', i.id, { optional: e.target.checked })} /> Optional
                        </label>
                        <label>
                          <input type="checkbox" checked={i.discountable} onChange={(e) => patchIn(schoolId, 'feeItems', i.id, { discountable: e.target.checked })} /> Discounts apply
                        </label>
                      </span>
                    ) : (
                      <>
                        {i.optional ? 'Optional' : 'Compulsory'}
                        {i.discountable ? ', discounts apply' : ''}
                      </>
                    )}
                  </td>
                  <td>
                    {canEdit && (
                      <button className="link danger" onClick={() => removeIn(schoolId, 'feeItems', i.id)}>
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {!items.length && (
                <tr>
                  <td colSpan={5} className="muted">
                    No fee items yet. Add tuition, development levy, uniform, books, PTA and so on.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {items.length > 0 && (
          <div>
            <button className="pill ghost" onClick={onRegenerate}>
              Recalculate this term’s invoices
            </button>
          </div>
        )}
      </section>
      {canEdit && (
        <section className="panel wide">
          <h2 className="h3">Add a fee item</h2>
          <div className="form-grid">
            <label className="field">
              <span className="mono">Name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Tuition" />
            </label>
            <label className="field">
              <span className="mono">Amount per term (₦)</span>
              <input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ''))} placeholder="85000" />
            </label>
          </div>
          <div className="field">
            <span className="mono">Classes it applies to (none chosen means every class)</span>
            <div className="chips">
              {school.levels.map((l) => (
                <button key={l} type="button" className={`chip ${levels.includes(l) ? 'on' : ''}`} onClick={() => setLevels((x) => (x.includes(l) ? x.filter((y) => y !== l) : [...x, l]))}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          <label className="switch">
            <input type="checkbox" checked={optional} onChange={(e) => setOptional(e.target.checked)} />
            <span>
              <b>Optional</b>
              <small>Only added to a child’s invoice when chosen, e.g. bus, lunch, extra lessons.</small>
            </span>
          </label>
          <label className="switch">
            <input type="checkbox" checked={discountable} onChange={(e) => setDiscountable(e.target.checked)} />
            <span>
              <b>Discounts apply</b>
              <small>Scholarship, sibling and staff-child discounts reduce this item.</small>
            </span>
          </label>
          <div>
            <button className="ticket" onClick={add} disabled={!name.trim() || !amount}>
              Add fee item
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

function InvoiceList(props: {
  invoices: Invoice[];
  students: StudentProfile[];
  payments: Payment[];
  items: FeeItem[];
  initial: string | null;
  onRegenerate: () => void;
  onToggleOptional: (inv: Invoice, itemId: string) => void;
  onFamily: (s: StudentProfile, patch: Partial<StudentProfile>) => void;
}) {
  const { classes, school, term } = useSchool();
  const [arm, setArm] = useState('');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(props.initial);
  const name = (id: string) => props.students.find((s) => s.id === id)?.name ?? 'Student';
  const list = props.invoices
    .filter((i) => (!arm || i.classId === arm) && (!q || name(i.studentId).toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => name(a.studentId).localeCompare(name(b.studentId)));
  const inv = props.invoices.find((i) => i.studentId === open);
  const st = props.students.find((s) => s.id === open);
  const cls = classes.find((c) => c.id === st?.classId);
  const optional = props.items.filter((i) => i.optional && (!i.levels.length || (cls && i.levels.includes(cls.level))));

  return (
    <div className="fee-split">
      <section className="panel">
        <div className="form-grid">
          <label className="field">
            <span className="mono">Arm</span>
            <select value={arm} onChange={(e) => setArm(e.target.value)}>
              <option value="">All arms</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="mono">Find a child</span>
            <input value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
        </div>
        <div className="table-wrap">
          <table className="gradebook">
            <thead>
              <tr>
                <th scope="col">Student</th>
                <th scope="col" className="num">Total</th>
                <th scope="col" className="num">Paid</th>
                <th scope="col" className="num">Balance</th>
              </tr>
            </thead>
            <tbody>
              {list.map((i) => (
                <tr key={i.id} className={open === i.studentId ? 'proposed' : ''} onClick={() => setOpen(i.studentId)} style={{ cursor: 'pointer' }}>
                  <th scope="row">
                    <button className="link" onClick={() => setOpen(i.studentId)}>
                      {name(i.studentId)}
                    </button>
                  </th>
                  <td className="num">{naira(i.total)}</td>
                  <td className="num">{naira(i.paid)}</td>
                  <td className={`num ${i.balance > 0 ? 'owing' : ''}`}>{i.balance > 0 ? naira(i.balance) : 'Paid'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!props.invoices.length && (
          <button className="ticket" onClick={props.onRegenerate}>
            Create this term’s invoices
          </button>
        )}
      </section>

      {inv && st && (
        <section className="panel invoice-sheet">
          <div className="invoice-head">
            <div>
              <h2 className="h3">{school.name}</h2>
              <p className="muted small">
                Invoice for {term?.name}
                {term?.session ? `, ${term.session}` : ''}
              </p>
            </div>
            <button className="pill ghost" onClick={() => window.print()}>
              Print invoice
            </button>
          </div>
          <p>
            <b>{st.name}</b>, {cls?.name}
          </p>
          <table className="rc-table">
            <tbody>
              {inv.lines.map((l) => (
                <tr key={l.name}>
                  <th scope="row">{l.name}</th>
                  <td className="num">{naira(l.amount)}</td>
                </tr>
              ))}
              {inv.discounts.map((d) => (
                <tr key={d.name}>
                  <th scope="row">Less: {d.name}</th>
                  <td className="num">−{naira(d.amount)}</td>
                </tr>
              ))}
              {inv.arrears > 0 && (
                <tr>
                  <th scope="row">Arrears from last term</th>
                  <td className="num">{naira(inv.arrears)}</td>
                </tr>
              )}
              <tr className="inv-total">
                <th scope="row">Total</th>
                <td className="num">{naira(inv.total)}</td>
              </tr>
              <tr>
                <th scope="row">Paid</th>
                <td className="num">{naira(inv.paid)}</td>
              </tr>
              <tr className="inv-total">
                <th scope="row">Balance</th>
                <td className="num">{naira(inv.balance)}</td>
              </tr>
            </tbody>
          </table>
          <h3 className="h3 small-h">Payments</h3>
          <ul className="queue-list">
            {props.payments
              .filter((p) => p.studentId === st.id && p.termId === inv.termId)
              .map((p) => (
                <li key={p.id}>
                  <span>
                    {new Date(p.date + 'T12:00').toLocaleDateString()} {naira(p.amount)}
                  </span>
                  <span className="muted">
                    {p.method}, receipt {p.receiptNo}
                  </span>
                </li>
              ))}
          </ul>
          {optional.length > 0 && (
            <div className="field">
              <span className="mono">Optional items for this child</span>
              <div className="chips">
                {optional.map((o) => (
                  <button key={o.id} className={`chip ${inv.optionalIds.includes(o.id) ? 'on' : ''}`} onClick={() => props.onToggleOptional(inv, o.id)}>
                    {o.name} ({naira(o.amount)})
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="form-grid no-print">
            <label className="field">
              <span className="mono">Family code, the same for siblings</span>
              <input defaultValue={st.familyId ?? ''} key={st.id + 'f'} placeholder="e.g. OKAFOR-1" onBlur={(e) => e.currentTarget.value !== (st.familyId ?? '') && props.onFamily(st, { familyId: e.currentTarget.value.trim().toUpperCase() || undefined })} />
            </label>
            <label className="field">
              <span className="mono">Scholarship %</span>
              <input inputMode="numeric" defaultValue={st.scholarshipPercent ?? ''} key={st.id + 's'} onBlur={(e) => props.onFamily(st, { scholarshipPercent: Math.min(100, Number(e.currentTarget.value) || 0) })} />
            </label>
            <label className="switch">
              <input type="checkbox" checked={!!st.staffChild} onChange={(e) => props.onFamily(st, { staffChild: e.target.checked })} />
              <span>
                <b>Child of a staff member</b>
              </span>
            </label>
          </div>
        </section>
      )}
    </div>
  );
}

function Payments(props: {
  students: StudentProfile[];
  invoices: Invoice[];
  payments: Payment[];
  allowCloud: boolean;
  onRecorded: (p: Payment) => Promise<void>;
  log: WorkspaceCtx['log'];
  refreshDevice: () => void;
  receiptCount: number;
}) {
  const { schoolId, school, term, me, classes } = useSchool();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [studentId, setStudentId] = useState('');
  const [q, setQ] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<Payment['method']>('transfer');
  const [reference, setReference] = useState('');
  const [payer, setPayer] = useState('');
  const [date, setDate] = useState(todayISO());
  const [read, setRead] = useState<{ source: 'on_device' | 'in_cloud'; ms: number; matched: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<Payment | null>(null);

  const matches = q ? props.students.filter((s) => s.name.toLowerCase().includes(q.toLowerCase()) || s.admissionNo.toLowerCase().includes(q.toLowerCase())).slice(0, 6) : [];
  const chosen = props.students.find((s) => s.id === studentId);
  const inv = props.invoices.find((i) => i.studentId === studentId);

  const scan = async (file: File) => {
    setBusy(true);
    try {
      const bmp = await createImageBitmap(file);
      const scale = Math.min(1, 1400 / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas');
      c.width = Math.round(bmp.width * scale);
      c.height = Math.round(bmp.height * scale);
      c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
      const res = await readReceipt({ base64: c.toDataURL('image/jpeg', 0.9).split(',')[1], mimeType: 'image/jpeg' }, props.allowCloud);
      const r = res.receipt;
      if (r.amount) setAmount(String(Math.round(r.amount)));
      if (r.date) setDate(r.date);
      setReference(r.reference);
      setPayer(r.payerName);
      setMethod('transfer');
      const s = matchReceipt(r, props.students);
      if (s) setStudentId(s.id);
      setRead({ source: res.source, ms: res.ms, matched: !!s });
      await props.log({
        task: 'Payment receipt photo',
        source: res.source,
        charsSent: 0,
        detail: res.source === 'on_device' ? 'Gemini Nano read the receipt on this device. The photo was not sent anywhere.' : 'Cloud reading allowed by the school’s admin; the receipt photo was sent to Gemini in the cloud.',
      });
    } catch (e) {
      if (e instanceof PrivacyBlock) toast(e.message, 'warn');
      else toast(`Couldn’t read the receipt. ${friendlyError(e)}`, 'error');
    } finally {
      setBusy(false);
      props.refreshDevice();
    }
  };

  const record = async () => {
    if (!chosen || !term) return;
    try {
      const p = await saveIn(schoolId, 'payments', {
        termId: term.id,
        studentId: chosen.id,
        classId: chosen.classId,
        amount: Number(amount),
        method,
        reference: reference.trim(),
        payer: payer.trim(),
        date,
        receiptNo: receiptNo(props.receiptCount + 1),
        receivedBy: me.name,
        ...(read ? { readBy: read.source } : {}),
        at: Date.now(),
      } as Payment);
      await props.onRecorded(p);
      setLast(p);
      setAmount('');
      setReference('');
      setPayer('');
      setRead(null);
      toast(`Recorded ${naira(p.amount)} for ${chosen.name}. Receipt ${p.receiptNo}.`);
    } catch (e) {
      toast(friendlyError(e), 'error');
    }
  };

  return (
    <div className="record-grid">
      <section className="panel">
        <div className="panel-head">
          <h2 className="h3">Record a payment</h2>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png" capture="environment" hidden onChange={(e) => e.target.files?.[0] && scan(e.target.files[0])} />
          <button className="pill ghost" onClick={() => fileRef.current?.click()} disabled={busy} title="Gemini Nano reads a teller, transfer receipt or POS slip on this computer">
            {busy ? 'Reading…' : 'Read a receipt photo'}
          </button>
        </div>
        {read && (
          <p className="slip-local">
            <SourceStamp source={read.source} ms={read.ms} namesSent /> {read.matched ? 'Filled in from the receipt and matched to a student. Check before saving.' : 'Filled in from the receipt. Choose the student.'}
          </p>
        )}
        <label className="field">
          <span className="mono">Student</span>
          {chosen ? (
            <span className="chosen">
              <b>{chosen.name}</b> {classes.find((c) => c.id === chosen.classId)?.name}
              {inv && <span className="muted"> owes {naira(inv.balance)}</span>}
              <button className="link" onClick={() => setStudentId('')}>
                Change
              </button>
            </span>
          ) : (
            <>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type a name or admission number" />
              {matches.length > 0 && (
                <ul className="pick-list">
                  {matches.map((s) => (
                    <li key={s.id}>
                      <button className="link" onClick={() => (setStudentId(s.id), setQ(''))}>
                        {s.name}
                      </button>{' '}
                      <span className="muted small">{classes.find((c) => c.id === s.classId)?.name}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </label>
        <div className="form-grid">
          <label className="field">
            <span className="mono">Amount (₦)</span>
            <input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ''))} />
          </label>
          <label className="field">
            <span className="mono">Date</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="field">
            <span className="mono">Method</span>
            <select value={method} onChange={(e) => setMethod(e.target.value as Payment['method'])}>
              <option value="transfer">Bank transfer</option>
              <option value="cash">Cash</option>
              <option value="pos">POS</option>
              <option value="online">Online</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label className="field">
            <span className="mono">Reference</span>
            <input value={reference} onChange={(e) => setReference(e.target.value)} />
          </label>
          <label className="field">
            <span className="mono">Paid by</span>
            <input value={payer} onChange={(e) => setPayer(e.target.value)} />
          </label>
        </div>
        <div>
          <button className="ticket" onClick={record} disabled={!chosen || !Number(amount)}>
            Record payment
          </button>
        </div>
      </section>

      <section className="panel">
        <h2 className="h3">Payments this term</h2>
        <ol className="queue-list">
          {[...props.payments]
            .sort((a, b) => b.at - a.at)
            .slice(0, 20)
            .map((p) => (
              <li key={p.id}>
                <span>
                  {props.students.find((s) => s.id === p.studentId)?.name ?? 'Student'} {naira(p.amount)}
                </span>
                <span className="muted small">
                  {new Date(p.date + 'T12:00').toLocaleDateString()}, {p.receiptNo}
                  {p.readBy === 'on_device' ? ', read on this device' : ''}
                </span>
                <button className="link small" onClick={() => setLast(p)}>
                  Receipt
                </button>
              </li>
            ))}
          {!props.payments.length && <li className="muted">No payments recorded this term.</li>}
        </ol>
      </section>

      {last && (
        <section className="panel wide receipt">
          <div className="invoice-head">
            <div>
              <h2 className="h3">{school.name}</h2>
              <p className="muted small">Official receipt {last.receiptNo}</p>
            </div>
            <div className="head-actions no-print">
              <button className="pill ghost" onClick={() => window.print()}>
                Print receipt
              </button>
              <button className="link" onClick={() => setLast(null)}>
                Close
              </button>
            </div>
          </div>
          <p>
            Received from {last.payer || 'the parent'} the sum of <b>{naira(last.amount)}</b> for {props.students.find((s) => s.id === last.studentId)?.name}, {term?.name}, by {last.method}
            {last.reference ? ` (ref. ${last.reference})` : ''} on {new Date(last.date + 'T12:00').toLocaleDateString()}.
          </p>
          <p className="muted small">Received by {last.receivedBy}.</p>
        </section>
      )}
    </div>
  );
}
