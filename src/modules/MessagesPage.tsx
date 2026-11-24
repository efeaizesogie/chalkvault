import { useMemo, useState } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { query, where } from 'firebase/firestore';
import { mod, paths, saveIn, todayISO } from '../data/api';
import { useQuery } from '../data/hooks';
import type { AttendanceDay, Invoice, ParentMessage, StudentProfile } from '../data/types';
import { draftParentMessage, PrivacyBlock } from '../lib/ai';
import { naira } from '../lib/fees';
import { whatsappLink } from '../lib/share';
import { download } from '../lib/export';
import { friendlyError } from '../lib/errors';
import { SourceStamp } from '../components/SourceStamp';
import { useToast } from '../ui/toast';
import { useSchool } from '../school/SchoolContext';
import type { WorkspaceCtx } from '../school/Workspace';
import './messages.css';
import { PrintExport } from '../components/PrintExport';

type Kind = ParentMessage['kind'];
type Recipient = { student: StudentProfile; guardian: string; phone: string; language: string; amount?: number };

const KINDS: { id: Kind; label: string; hint: string }[] = [
  { id: 'absence', label: 'Absent today', hint: 'Parents of children marked absent in today’s register.' },
  { id: 'fees', label: 'Fees reminder', hint: 'Parents with an outstanding balance this term.' },
  { id: 'results', label: 'Results are ready', hint: 'Every parent in the chosen arms, with their child’s result PIN.' },
  { id: 'custom', label: 'Your own message', hint: 'Every parent in the chosen arms.' },
];

/** Messages to parents, written once by the AI with placeholders and filled in per family on this computer; sent by WhatsApp or through an SMS service. */
export function MessagesPage() {
  const { schoolId, school, classes, formClasses, isAdmin, me, term } = useSchool();
  const ws = useOutletContext<WorkspaceCtx>();
  const toast = useToast();
  const [params] = useSearchParams();
  const finance = isAdmin || me.role === 'bursar';
  const [kind, setKind] = useState<Kind>((params.get('kind') as Kind) || 'absence');
  const arms = isAdmin || me.role === 'bursar' ? classes : formClasses;
  const [armIds, setArmIds] = useState<string[]>([]);
  const [gist, setGist] = useState('');
  const [templates, setTemplates] = useState<Record<string, { text: string; source: 'on_device' | 'in_cloud' }>>({});
  const [busy, setBusy] = useState('');
  const [sentIds, setSentIds] = useState<string[]>([]);

  const studentsQ = useQuery<StudentProfile>(isAdmin || me.role === 'bursar' ? paths.students(schoolId) : null, `msg-st:${schoolId}`);
  const formStudents = useQuery<StudentProfile>(!isAdmin && me.role !== 'bursar' && formClasses[0] ? query(paths.students(schoolId), where('classId', '==', formClasses[0].id)) : null, `msg-fst:${formClasses[0]?.id}`);
  const students = (isAdmin || me.role === 'bursar' ? studentsQ.data : formStudents.data).filter((s) => (s.status ?? 'active') === 'active');
  const today = useQuery<AttendanceDay>(query(paths.attendance(schoolId), where('date', '==', todayISO()), ...(isAdmin ? [] : [where('classId', '==', formClasses[0]?.id ?? '-')])), `msg-att:${todayISO()}:${isAdmin}`);
  const invoices = useQuery<Invoice>(finance && term ? query(mod(schoolId, 'invoices'), where('termId', '==', term.id)) : null, `msg-inv:${term?.id}:${finance}`);
  const history = useQuery<ParentMessage>(isAdmin ? mod(schoolId, 'messages') : query(mod(schoolId, 'messages'), where('by', '==', me.uid)), `msg-hist:${me.uid}:${isAdmin}`);

  const recipients: Recipient[] = useMemo(() => {
    const inArms = (s: StudentProfile) => !armIds.length || armIds.includes(s.classId);
    let list: { s: StudentProfile; amount?: number }[] = [];
    if (kind === 'absence') {
      const absent = new Set(today.data.flatMap((d) => Object.entries(d.marks).filter(([, m]) => m === 'A').map(([id]) => id)));
      list = students.filter((s) => absent.has(s.id) && inArms(s)).map((s) => ({ s }));
    } else if (kind === 'fees') {
      list = invoices.data.filter((i) => i.balance > 0).map((i) => ({ s: students.find((s) => s.id === i.studentId)!, amount: i.balance })).filter((x) => x.s && inArms(x.s));
    } else {
      list = students.filter(inArms).map((s) => ({ s }));
    }
    return list.flatMap(({ s, amount }) => {
      const g = s.guardians.find((x) => x.phone) ?? s.guardians[0];
      return g ? [{ student: s, guardian: g.name, phone: g.phone, language: g.language || 'English', amount }] : [];
    });
  }, [kind, armIds, students, today.data, invoices.data]);
  const portal = new URL(`${import.meta.env.BASE_URL}results`, location.origin).toString();

  const fill = (template: string, r: Recipient) =>
    template
      .split('[GUARDIAN]').join(r.guardian)
      .split('[STUDENT]').join(r.student.preferredName || r.student.name.split(' ')[0])
      .split('[CLASS]').join(classes.find((c) => c.id === r.student.classId)?.name ?? '')
      .split('[DATE]').join(new Date().toLocaleDateString())
      .split('[AMOUNT]').join(r.amount ? naira(r.amount) : '')
      .split('[PIN]').join(r.student.resultPin ?? '(ask the school)')
      .split('[LINK]').join(portal);

  const draft = async () => {
    setBusy('Writing the message…');
    setTemplates({});
    try {
      const base = await draftParentMessage(kind, gist, school.name);
      const out: Record<string, { text: string; source: 'on_device' | 'in_cloud' }> = { English: { text: base.text, source: base.source } };
      await ws.log({ task: 'Parent message draft', source: base.source, charsSent: base.source === 'in_cloud' ? base.prompt.length : 0, detail: base.source === 'in_cloud' ? base.prompt : 'Written by Gemini Nano on this device.' });
      setTemplates(out);
    } catch (e) {
      toast(e instanceof PrivacyBlock ? e.message : `Couldn’t write the message. ${friendlyError(e)}`, 'error');
    } finally {
      setBusy('');
      ws.refreshDevice();
    }
  };

  const save = async () => {
    try {
      await saveIn(schoolId, 'messages', {
        kind,
        title: KINDS.find((k) => k.id === kind)!.label,
        recipients: recipients.map((r) => ({ studentId: r.student.id, guardian: r.guardian, phone: r.phone, language: r.language, text: fill((templates[r.language] ?? templates.English).text, r) })),
        by: me.uid,
        byName: me.name,
        at: Date.now(),
      } as ParentMessage);
    } catch (e) {
      toast(friendlyError(e), 'error');
    }
  };

  const ready = Object.keys(templates).length > 0;
  const rows = recipients.map((r) => ({ r, text: ready ? fill((templates[r.language] ?? templates.English).text, r) : '' }));
  const kinds = KINDS.filter((k) => finance || k.id !== 'fees');

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1 className="display-sm">Messages to parents</h1>
          <p className="lede">The AI writes one message without any names, and each family’s names, amounts and result PIN are filled in on this computer.</p>
        </div>
        <PrintExport
          title="Messages to parents"
          rows={() =>
            ready
              ? [['Parent or guardian', 'Child', 'Phone', 'Message'], ...rows.map(({ r, text }) => [r.guardian, r.student.name, r.phone, text])]
              : [
                  ['Sent', 'Message', 'By', 'Parent or guardian', 'Phone', 'Text'],
                  ...[...history.data]
                    .sort((a, b) => b.at - a.at)
                    .flatMap((m) => m.recipients.map((x) => [new Date(m.at).toLocaleDateString(), m.title, m.byName, x.guardian, x.phone, x.text])),
                ]
          }
        />
      </header>

      <section className="panel">
        <div className="chips" role="radiogroup" aria-label="Message type">
          {kinds.map((k) => (
            <button key={k.id} role="radio" aria-checked={kind === k.id} className={`chip ${kind === k.id ? 'on' : ''}`} onClick={() => (setKind(k.id), setTemplates({}))}>
              {k.label}
            </button>
          ))}
        </div>
        <p className="muted small">{KINDS.find((k) => k.id === kind)!.hint}</p>
        {arms.length > 1 && (
          <div className="field">
            <span className="mono">Arms (none chosen means all)</span>
            <div className="chips">
              {arms.map((c) => (
                <button key={c.id} className={`chip ${armIds.includes(c.id) ? 'on' : ''}`} onClick={() => setArmIds((x) => (x.includes(c.id) ? x.filter((y) => y !== c.id) : [...x, c.id]))}>
                  {c.name}
                </button>
              ))}
            </div>
          </div>
        )}
        {(kind === 'custom' || kind === 'fees') && (
          <label className="field">
            <span className="mono">{kind === 'fees' ? 'How to pay (account details, deadline)' : 'What do you want to tell parents?'}</span>
            <textarea className="ruled" rows={3} value={gist} onChange={(e) => setGist(e.target.value)} placeholder={kind === 'fees' ? 'Pay into Greenfield Academy, GTBank 0123456789, by Friday 4 December.' : 'Mid-term break starts Thursday. School resumes Monday 2 November.'} />
          </label>
        )}
        <div className="row-actions">
          <span className="muted small">
            {recipients.length} parent{recipients.length === 1 ? '' : 's'}
            .
          </span>
          <button className="ticket" onClick={draft} disabled={!!busy || !recipients.length}>
            {busy || 'Write the message'}
          </button>
        </div>
      </section>

      {ready && (
        <section className="panel">
          <div className="panel-head">
            <h2 className="h3">Ready to send</h2>
            <div className="head-actions">
              <button
                className="pill ghost"
                onClick={() => {
                  download(`messages-${todayISO()}.csv`, '﻿phone,message\r\n' + rows.map(({ r, text }) => `"${r.phone}","${text.replace(/"/g, '""')}"`).join('\r\n'));
                  save();
                }}
              >
                Download for SMS
              </button>
            </div>
          </div>
          <ul className="template-list">
            {Object.entries(templates).map(([lang, t]) => (
              <li key={lang}>
                <span className="mono">{lang}</span> <SourceStamp source={t.source} />
                <p>{t.text}</p>
              </li>
            ))}
          </ul>
          <ol className="msg-list">
            {rows.map(({ r, text }) => (
              <li key={r.student.id} className={sentIds.includes(r.student.id) ? 'sent' : ''}>
                <div className="msg-who">
                  <b>{r.guardian}</b>
                  <span className="muted small">
                    {r.student.name}, {r.phone || 'no phone'}
                  </span>
                </div>
                <p className="msg-text">{text}</p>
                {r.phone ? (
                  <a
                    className="pill ghost"
                    href={whatsappLink(text, r.phone)}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => {
                      setSentIds((x) => [...x, r.student.id]);
                      if (!sentIds.length) save();
                    }}
                  >
                    {sentIds.includes(r.student.id) ? 'Opened in WhatsApp' : 'Send on WhatsApp'}
                  </a>
                ) : (
                  <span className="muted small">Add a phone number on the student’s record.</span>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className="panel">
        <h2 className="h3">Sent before</h2>
        <ul className="queue-list">
          {[...history.data]
            .sort((a, b) => b.at - a.at)
            .slice(0, 10)
            .map((m) => (
              <li key={m.id}>
                <span>{m.title}</span>
                <span className="muted small">
                  {m.recipients.length} parents, {new Date(m.at).toLocaleDateString()}, {m.byName}
                </span>
              </li>
            ))}
          {!history.data.length && <li className="muted">Nothing sent yet.</li>}
        </ul>
      </section>
    </div>
  );
}
