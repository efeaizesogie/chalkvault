import { useState } from 'react';
import { orderBy, query } from 'firebase/firestore';
import { addNotice, deleteNotice, paths } from '../data/api';
import { useQuery } from '../data/hooks';
import type { Notice } from '../data/types';
import { friendlyError } from '../lib/errors';
import { useToast } from '../ui/toast';
import { useSchool } from './SchoolContext';

export function useNotices() {
  const { schoolId } = useSchool();
  return useQuery<Notice>(query(paths.notices(schoolId), orderBy('at', 'desc')), `notices:${schoolId}`);
}

/** Staff notice board. Admins post; everyone reads. */
export function NoticesPage() {
  const { schoolId, isAdmin, me } = useSchool();
  const toast = useToast();
  const notices = useNotices();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');

  const post = async () => {
    try {
      await addNotice(schoolId, { title: title.trim(), body: body.trim(), audience: 'staff', by: me.uid, byName: me.name });
      setTitle('');
      setBody('');
    } catch (e) {
      toast(friendlyError(e), 'error');
    }
  };

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1 className="display-sm">Notices</h1>
          <p className="lede">Announcements for every member of staff.</p>
        </div>
      </header>
      {isAdmin && (
        <section className="panel">
          <label className="field">
            <span className="mono">Title</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Staff meeting on Friday at 2 pm" />
          </label>
          <label className="field">
            <span className="mono">Message</span>
            <textarea className="ruled" rows={4} value={body} onChange={(e) => setBody(e.target.value)} />
          </label>
          <div className="row-actions">
            <span className="muted small">Everyone on staff sees this on their overview.</span>
            <button className="ticket" onClick={post} disabled={!title.trim()}>
              Post notice
            </button>
          </div>
        </section>
      )}
      <NoticeList notices={notices.data} canDelete={isAdmin} onDelete={(id) => deleteNotice(schoolId, id).catch((e) => toast(friendlyError(e), 'error'))} />
    </div>
  );
}

export function NoticeList({ notices, canDelete, onDelete, limit }: { notices: Notice[]; canDelete?: boolean; onDelete?: (id: string) => void; limit?: number }) {
  const list = limit ? notices.slice(0, limit) : notices;
  if (!list.length) return <p className="muted">No notices yet.</p>;
  return (
    <ul className="notice-list">
      {list.map((n) => (
        <li key={n.id}>
          <div className="notice-top">
            <b>{n.title}</b>
            <span className="muted small">
              {n.byName}, {new Date(n.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
            </span>
          </div>
          {n.body && <p>{n.body}</p>}
          {canDelete && (
            <button className="link danger small" onClick={() => onDelete?.(n.id)}>
              Remove
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
