import { useEffect, useRef, useState } from 'react';
import { downloadDeviceModel, type DeviceStatus } from '../lib/ai';
import { SetupError } from '../lib/ai';

const LABEL: Record<DeviceStatus, string> = {
  available: 'Gemini Nano ready',
  downloadable: 'Nano not downloaded',
  downloading: 'Nano downloading',
  unavailable: 'No on-device AI',
  'no-api': 'No on-device AI',
};

export function DeviceChip(props: {
  status: DeviceStatus;
  allowCloud: boolean;
  onToggleCloud: (v: boolean) => void;
  onRefresh: () => void;
  toast: (t: string, k?: 'info' | 'warn' | 'error') => void;
}) {
  const { status, allowCloud } = props;
  const [open, setOpen] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const download = async () => {
    setProgress(0);
    try {
      await downloadDeviceModel((p) => setProgress(p));
      props.toast('Gemini Nano is ready. Comments now stay on this device.');
    } catch (e) {
      props.toast(e instanceof SetupError ? e.message : `Download failed: ${(e as Error).message}`, 'error');
    } finally {
      setProgress(null);
      props.onRefresh();
    }
  };

  const ok = status === 'available';
  return (
    <div className="device-wrap" ref={ref}>
      <button className={`device-chip ${ok ? 'ok' : 'off'}`} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <i className="dot" />
        <span className="mono">{LABEL[status]}</span>
      </button>
      {open && (
        <div className="popover">
          <p className="pop-title">{ok ? 'Comments are written on this device.' : 'This browser can’t run AI on-device.'}</p>
          {ok ? (
            <p className="pop-body">
              Gemini Nano runs inside Chrome. Student names, notes and photos never leave this computer. You can switch off
              Wi-Fi and keep working.
            </p>
          ) : status === 'downloadable' || status === 'downloading' ? (
            <>
              <p className="pop-body">Chrome can run Gemini Nano here, but the model (about 4 GB) isn’t downloaded yet.</p>
              <button className="pill ink" onClick={download} disabled={progress !== null}>
                {progress !== null ? `Downloading… ${Math.round(progress * 100)}%` : 'Download Gemini Nano'}
              </button>
            </>
          ) : (
            <p className="pop-body">
              On-device AI needs desktop Chrome with Gemini Nano (Chrome 139+, 22 GB free disk, 16 GB RAM or a GPU with more than
              4 GB). Until then, Chalkvault can use cloud Gemini, but only after removing every name and contact detail.
            </p>
          )}
          <label className="switch">
            <input type="checkbox" checked={allowCloud} onChange={(e) => props.onToggleCloud(e.target.checked)} />
            <span>
              <b>Cloud fallback, names removed</b>
              <small>When off, nothing is written unless it can be done on this device.</small>
            </span>
          </label>
        </div>
      )}
    </div>
  );
}
