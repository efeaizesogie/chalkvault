import { downloadCsv, printDoc, type Cell } from '../lib/print';
import { tableDoc } from '../lib/printDocs';

/**
 * Print and Export buttons for a page head. Every print is a document laid out for paper, never a copy of the
 * screen: either a purpose-built one (`onPrint`) or the export rows set as tables under the letterhead.
 * Export downloads the same rows as a CSV that opens in Excel.
 */
export function PrintExport({
  title,
  rows,
  onPrint,
  landscape,
  printLabel = 'Print',
  exportLabel = 'Export CSV',
}: {
  title: string;
  rows: () => Cell[][] | Promise<Cell[][]>;
  /** A purpose-built document instead of the rows as tables. */
  onPrint?: () => void;
  landscape?: boolean;
  printLabel?: string;
  exportLabel?: string;
}) {
  const doPrint = async () => (onPrint ? onPrint() : printDoc(title, tableDoc(title, await rows()), { landscape }));
  const doExport = async () => {
    const data = await rows();
    if (data.length) downloadCsv(title, data);
  };
  return (
    <div className="head-actions print-export no-print">
      <button type="button" className="pill ghost" onClick={doPrint}>
        {printLabel}
      </button>
      <button type="button" className="pill ghost" onClick={doExport}>
        {exportLabel}
      </button>
    </div>
  );
}
