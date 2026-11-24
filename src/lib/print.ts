// One way to print anything in Chalkvault: copy the part being printed into a print area under the school's
// letterhead, turn form fields into plain text, drop buttons, and print that. The browser's "Save as PDF"
// gives a PDF with the same layout.

export interface Letterhead {
  name: string;
  address?: string;
  motto?: string;
  phone?: string;
  email?: string;
  logo?: string;
}

let head: Letterhead | null = null;
/** The workspace sets the current school's letterhead once it loads. */
export function setLetterhead(h: Letterhead | null) {
  head = h;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const initials = (name: string) =>
  name
    .replace(/\(.*?\)/g, '')
    .split(/\s+/)
    .filter((w) => /^[A-Za-z]/.test(w))
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');

const ICON =
  '<svg viewBox="0 0 512 512" width="18" height="18" aria-hidden="true"><rect width="512" height="512" rx="104" fill="var(--ticket)"/><g stroke="var(--ink)" stroke-width="34" stroke-linecap="round"><line x1="150" y1="188" x2="362" y2="188"/><line x1="150" y1="256" x2="362" y2="256"/><line x1="150" y1="324" x2="290" y2="324"/></g></svg>';

function letterheadHtml(title: string) {
  if (!head) return '';
  const contact = [head.address, head.phone, head.email].filter(Boolean).map((x) => esc(x!)).join(' &nbsp;|&nbsp; ');
  const crest = head.logo ? `<img class="ph-logo" src="${esc(head.logo)}" alt="">` : `<span class="ph-mono">${esc(initials(head.name))}</span>`;
  return `<header class="ph">
    ${crest}
    <div class="ph-school">
      <b>${esc(head.name)}</b>
      ${head.motto ? `<i>${esc(head.motto)}</i>` : ''}
      ${contact ? `<span>${contact}</span>` : ''}
    </div>
    <div class="ph-doc"><b>${esc(title)}</b><span>${new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}</span><span class="ph-cv">${ICON} Chalkvault</span></div>
  </header>`;
}

/** Replace form fields in the copy with their values as text, so a printout shows what was typed or chosen. */
function flatten(src: HTMLElement, copy: HTMLElement) {
  const a = src.querySelectorAll('input, select, textarea');
  const b = copy.querySelectorAll('input, select, textarea');
  a.forEach((el, i) => {
    const c = b[i] as HTMLElement | undefined;
    if (!c) return;
    let text = '';
    if (el instanceof HTMLSelectElement) text = el.selectedOptions[0]?.text ?? '';
    else if (el instanceof HTMLInputElement) {
      if (el.type === 'checkbox' || el.type === 'radio') text = el.checked ? '☑' : '☐';
      else if (el.type === 'file' || el.type === 'hidden') text = '';
      else text = el.value;
    } else if (el instanceof HTMLTextAreaElement) text = el.value;
    const span = document.createElement('span');
    span.className = 'pf-value';
    span.textContent = text;
    c.replaceWith(span);
  });
}

/**
 * Print one part of the page (or several) under the letterhead.
 * `title` names the document and becomes the PDF's file name; `letterhead: false` is for report cards, which carry their own.
 */
export function printParts(parts: (HTMLElement | string | null | undefined)[], opts: { title: string; letterhead?: boolean; landscape?: boolean }) {
  const nodes = parts.filter((p): p is HTMLElement | string => !!p);
  if (!nodes.length) return;
  document.getElementById('print-root')?.remove();
  document.getElementById('print-page')?.remove();
  const root = document.createElement('div');
  root.id = 'print-root';
  root.innerHTML = opts.letterhead === false ? '' : letterheadHtml(opts.title);
  for (const n of nodes) {
    if (typeof n === 'string') {
      // A purpose-built document (see printDoc).
      const box = document.createElement('div');
      box.className = 'pf-part doc';
      box.innerHTML = n;
      root.appendChild(box);
      continue;
    }
    const copy = n.cloneNode(true) as HTMLElement;
    flatten(n, copy);
    copy.classList.add('pf-part');
    root.appendChild(copy);
  }
  document.body.appendChild(root);
  // Page size and a footer in the page margin (it can't overlap content there), set per print.
  const page = document.createElement('style');
  page.id = 'print-page';
  const who = head ? `Printed from Chalkvault for ${head.name.replace(/["\\]/g, '')}` : 'Printed from Chalkvault';
  page.textContent = `@media print { @page { size: A4 ${opts.landscape ? 'landscape' : 'portrait'}; margin: ${opts.landscape ? '10mm 10mm 14mm' : '14mm 12mm 16mm'};
    @bottom-left { content: "${who}"; font: 9px sans-serif; color: #777b86; }
    @bottom-right { content: "Page " counter(page) " of " counter(pages); font: 9px sans-serif; color: #777b86; } } }`;
  document.head.appendChild(page);
  document.body.classList.add('printing');
  const before = document.title;
  document.title = `${head?.name ? `${head.name} - ` : ''}${opts.title}`;
  const done = () => {
    document.title = before;
    document.body.classList.remove('printing');
    root.remove();
    page.remove();
    window.removeEventListener('afterprint', done);
  };
  window.addEventListener('afterprint', done);
  // Let images (the crest) load before the print dialog opens.
  setTimeout(() => window.print(), 80);
}

/** Print a purpose-built document (HTML from one of the builders in printDocs.ts) under the letterhead. */
export function printDoc(title: string, html: string, opts: { landscape?: boolean; letterhead?: boolean } = {}) {
  printParts([html], { title, ...opts });
}

/** Print the current page's main content. */
export function printPage(title: string, opts: { landscape?: boolean } = {}) {
  printParts([document.querySelector<HTMLElement>('.ws-main .page') ?? document.querySelector<HTMLElement>('.ws-main')], { title, ...opts });
}

// ---------- Export ----------

export type Cell = string | number | null | undefined;

/** A spreadsheet-friendly CSV (opens in Excel with Naira signs and accents intact). */
export function csv(rows: Cell[][]) {
  const q = (v: Cell) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\r\n]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + rows.map((r) => r.map(q).join(',')).join('\r\n');
}

export function downloadCsv(name: string, rows: Cell[][]) {
  const slug = `${head?.name ? `${head.name} ` : ''}${name}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const url = URL.createObjectURL(new Blob([csv(rows)], { type: 'text/csv;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: `${slug}-${new Date().toISOString().slice(0, 10)}.csv` });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/** Rows from an HTML table on the page, for exporting what's on screen as it is. */
export function tableRows(table: HTMLTableElement | null): Cell[][] {
  if (!table) return [];
  // A cell with two lines (a subject and its teacher) becomes "Subject / Teacher".
  return [...table.rows].map((r) =>
    [...r.cells].map(
      (c) =>
        (c.querySelector('select') as HTMLSelectElement | null)?.selectedOptions[0]?.text ??
        (c.querySelector('input') as HTMLInputElement | null)?.value ??
        c.innerText.trim().replace(/\s*\n+\s*/g, ' / '),
    ),
  );
}
