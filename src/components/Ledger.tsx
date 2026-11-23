import type { LedgerEntry } from '../data/types';
import { SourceStamp } from './SourceStamp';

export function Ledger({ entries, onClose, onClear }: { entries: LedgerEntry[]; onClose: () => void; onClear?: () => Promise<void> }) {
  const local = entries.filter((e) => e.source === 'on_device').length;
  const cloud = entries.filter((e) => e.source === 'in_cloud');
  const chars = cloud.reduce((n, e) => n + e.charsSent, 0);
  return (
    <div className="scrim" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()} aria-label="Request ledger">
        <header className="drawer-head">
          <div>
            <h2 className="h2">Ledger</h2>
            <p className="muted small">Every AI request, where it ran, and what left the device.</p>
          </div>
          <button className="pill ghost" onClick={onClose}>
            Close
          </button>
        </header>
        <div className="ledger-sum">
          <div>
            <b className="big">{local}</b>
            <span className="mono">on this device</span>
          </div>
          <div>
            <b className="big">{cloud.length}</b>
            <span className="mono">cloud, names removed</span>
          </div>
          <div>
            <b className="big">{chars.toLocaleString()}</b>
            <span className="mono">characters sent</span>
          </div>
        </div>
        <ol className="ledger-list">
          {entries.length === 0 && <li className="ledger-empty">No requests yet.</li>}
          {entries.map((e) => (
            <li key={e.id} className={`ledger-row ${e.source}`}>
              <div className="ledger-top">
                <span className="mono">{new Date(e.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                <span className="ledger-task">{e.task}</span>
                <SourceStamp source={e.source} />
              </div>
              <details>
                <summary className="mono">{e.source === 'in_cloud' ? 'Exactly what was sent' : 'Details'}</summary>
                <pre>{e.detail}</pre>
              </details>
            </li>
          ))}
        </ol>
        {entries.length > 0 && onClear && (
          <button
            className="link"
            onClick={async () => {
              await onClear?.();
            }}
          >
            Clear ledger
          </button>
        )}
      </aside>
    </div>
  );
}
