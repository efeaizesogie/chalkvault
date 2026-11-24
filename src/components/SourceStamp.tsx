import type { Source } from '../data/types';

/** Where an AI request ran. `namesSent` marks cloud scanning, where the school chose to send the page as it is. */
export function SourceStamp({ source, ms, namesSent }: { source: Source | 'blocked'; ms?: number; namesSent?: boolean }) {
  if (source === 'in_cloud' && namesSent)
    return (
      <span className="stamp cloud" title="Read by Gemini in the cloud, because the school switched on cloud scanning. The page was sent as it is.">
        Cloud scan{ms ? `, ${(ms / 1000).toFixed(1)} s` : ''}
      </span>
    );
  if (source === 'on_device')
    return (
      <span className="stamp device" title="Written by Gemini Nano inside Chrome. Nothing was sent over the network.">
        On this device{ms ? `, ${(ms / 1000).toFixed(1)} s` : ''}
      </span>
    );
  if (source === 'in_cloud')
    return (
      <span className="stamp cloud" title="Written by Gemini in the cloud from a de-identified version. Names were removed before sending.">
        Cloud, names removed{ms ? `, ${(ms / 1000).toFixed(1)} s` : ''}
      </span>
    );
  return <span className="stamp blocked">Blocked, nothing sent</span>;
}
