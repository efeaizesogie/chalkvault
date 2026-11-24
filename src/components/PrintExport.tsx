import { downloadCsv, printParts, tableRows, type Cell } from '../lib/print';

/**
 * Print and Export buttons for a page head. Print uses the school's letterhead; Export downloads a CSV that
 * opens in Excel. Without `rows`, Export takes the first table on the page as it is.
 */
export function PrintExport({
  title,
  rows,
  target,
  landscape,
  printLabel = 'Print',
  exportLabel = 'Export CSV',
  fromTable = false,
}: {
  title: string;
  rows?: () => Cell[][] | Promise<Cell[][]>;
  target?: () => (HTMLElement | null)[];
  landscape?: boolean;
  printLabel?: string;
  exportLabel?: string;
  /** Export the first table on the page when no rows are given. */
  fromTable?: boolean;
}) {
  const doPrint = () => printParts(target ? target() : [document.querySelector<HTMLElement>('.ws-main .page')], { title, landscape });
  const doExport = async () => {
    const data = rows ? await rows() : tableRows(document.querySelector<HTMLTableElement>('.ws-main table'));
    if (data.length) downloadCsv(title, data);
  };
  return (
    <div className="head-actions print-export no-print">
      <button type="button" className="pill ghost" onClick={doPrint}>
        {printLabel}
      </button>
      {(rows || fromTable) && (
        <button type="button" className="pill ghost" onClick={doExport}>
          {exportLabel}
        </button>
      )}
    </div>
  );
}
