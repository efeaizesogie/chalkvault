import type { FeeItem, FeePolicy, Invoice, InvoiceLine, Payment, StudentProfile } from '../data/types';

export const DEFAULT_FEES: FeePolicy = { currency: '₦', siblingPercent: 10, staffChildPercent: 50 };
export const naira = (n: number) => `₦${Math.round(n).toLocaleString('en-NG')}`;

/**
 * Build one student's invoice for a term, the way Nigerian schools charge:
 * class fees, chosen optional levies, scholarship, sibling and staff-child discounts on discountable items,
 * plus arrears carried from last term.
 */
export function buildInvoice(opts: {
  student: StudentProfile;
  level: string;
  termId: string;
  items: FeeItem[];
  optionalIds: string[];
  siblingRank: number; // 0 for the eldest/first enrolled child in a family
  policy: FeePolicy;
  arrears: number;
  paid: number;
}): Invoice {
  const { student, items, policy } = opts;
  const applies = items.filter((i) => !i.levels.length || i.levels.includes(opts.level));
  const chosen = applies.filter((i) => !i.optional || opts.optionalIds.includes(i.id));
  const lines: InvoiceLine[] = chosen.map((i) => ({ name: i.name, amount: i.amount }));
  const discountBase = chosen.filter((i) => i.discountable).reduce((n, i) => n + i.amount, 0);
  const discounts: InvoiceLine[] = [];
  if (student.scholarshipPercent) discounts.push({ name: `Scholarship (${student.scholarshipPercent}%)`, amount: Math.round((discountBase * student.scholarshipPercent) / 100) });
  if (student.staffChild && policy.staffChildPercent) discounts.push({ name: `Staff child (${policy.staffChildPercent}%)`, amount: Math.round((discountBase * policy.staffChildPercent) / 100) });
  else if (opts.siblingRank > 0 && policy.siblingPercent) discounts.push({ name: `Sibling (${policy.siblingPercent}%)`, amount: Math.round((discountBase * policy.siblingPercent) / 100) });
  const gross = lines.reduce((n, l) => n + l.amount, 0);
  const off = Math.min(discountBase, discounts.reduce((n, d) => n + d.amount, 0));
  const total = Math.max(0, gross - off) + opts.arrears;
  return {
    id: `${opts.termId}_${student.id}`,
    termId: opts.termId,
    studentId: student.id,
    classId: student.classId,
    lines,
    discounts,
    arrears: opts.arrears,
    total,
    paid: opts.paid,
    balance: total - opts.paid,
    optionalIds: opts.optionalIds,
    updatedAt: Date.now(),
  };
}

/** Sibling order: within each familyId, the earliest-enrolled child is rank 0. */
export function siblingRanks(students: StudentProfile[]) {
  const ranks = new Map<string, number>();
  const families = new Map<string, StudentProfile[]>();
  for (const s of students) if (s.familyId) families.set(s.familyId, [...(families.get(s.familyId) ?? []), s]);
  for (const list of families.values()) list.sort((a, b) => a.createdAt - b.createdAt).forEach((s, i) => ranks.set(s.id, i));
  return ranks;
}

export const paidOf = (payments: Payment[], studentId: string, termId: string) => payments.filter((p) => p.studentId === studentId && p.termId === termId).reduce((n, p) => n + p.amount, 0);

export function receiptNo(n: number) {
  return `CV-${new Date().getFullYear()}-${String(n).padStart(5, '0')}`;
}

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\s]/gu, ' ').replace(/\s+/g, ' ').trim();

/** Suggest which student a receipt belongs to, from the narration and payer name (matched on this device). */
export function matchReceipt(r: { payerName: string; narration: string }, students: StudentProfile[]) {
  const text = norm(`${r.narration} ${r.payerName}`);
  const words = new Set(text.split(' '));
  let best: { s: StudentProfile; score: number } | null = null;
  for (const s of students) {
    let score = 0;
    for (const w of norm(s.name).split(' ')) if (w.length > 2 && words.has(w)) score += 2;
    for (const g of s.guardians) for (const w of norm(g.name).split(' ')) if (w.length > 2 && words.has(w)) score += 1;
    if (s.admissionNo && text.includes(norm(s.admissionNo))) score += 5;
    if (score > (best?.score ?? 0)) best = { s, score };
  }
  return best && best.score >= 2 ? best.s : null;
}
