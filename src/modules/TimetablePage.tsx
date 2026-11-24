import { useEffect, useMemo, useState } from 'react';
import { modDoc, saveIn } from '../data/api';
import { useDoc } from '../data/hooks';
import type { Offering, Timetable, TimetableSettings, TimetableSlot } from '../data/types';
import { friendlyError } from '../lib/errors';
import { defaultPerWeek, defaultSettings, generateTimetable, validateTimetable } from '../lib/timetable';
import { useSchool } from '../school/SchoolContext';
import { useToast } from '../ui/toast';
import { downloadCsv, printDoc, tableRows } from '../lib/print';
import { timetableDoc, type TimetablePage } from '../lib/printDocs';
import './TimetablePage.css';

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function TimetablePage() {
  const { schoolId, school, isAdmin, me, classes, offerings, members } = useSchool();
  const toast = useToast();
  const live = useDoc<Timetable>(modDoc(schoolId, 'timetable', 'current'), `timetable:${schoolId}`);
  const timetable = live.data;

  const iTeach = useMemo(() => offerings.some((o) => (o.teacherIds ?? []).includes(me.uid)), [offerings, me.uid]);
  const [mode, setMode] = useState<'class' | 'teacher'>(isAdmin ? 'class' : iTeach ? 'teacher' : 'class');
  const [armId, setArmId] = useState('');
  const [teacherId, setTeacherId] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);

  // Who can be shown in the teacher view: anyone who teaches a subject.
  const teachers = useMemo(() => {
    const ids = new Set<string>();
    for (const o of offerings) for (const t of o.teacherIds ?? []) ids.add(t);
    return members.filter((m) => ids.has(m.uid)).sort((a, b) => a.name.localeCompare(b.name));
  }, [offerings, members]);

  // Sensible defaults for the two selects once data is in.
  useEffect(() => {
    if (!armId && classes.length) setArmId(classes[0].id);
  }, [classes, armId]);
  useEffect(() => {
    if (teacherId) return;
    if (iTeach) setTeacherId(me.uid);
    else if (teachers.length) setTeacherId(teachers[0].uid);
  }, [iTeach, me.uid, teachers, teacherId]);

  const savedSettings = timetable?.settings ?? defaultSettings(school.subjects);

  const generate = async () => {
    setBusy(true);
    try {
      const { slots, unplaced } = generateTimetable(savedSettings, classes, offerings);
      const next: Timetable = { id: 'current', settings: savedSettings, slots, unplaced, generatedAt: Date.now() };
      await saveIn(schoolId, 'timetable', next);
      toast('Timetable generated.', 'info');
    } catch (e) {
      toast(friendlyError(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  const saveSettings = async (settings: TimetableSettings) => {
    try {
      const next: Timetable = {
        id: 'current',
        settings,
        slots: timetable?.slots ?? {},
        unplaced: timetable?.unplaced ?? [],
        generatedAt: timetable?.generatedAt ?? 0,
      };
      await saveIn(schoolId, 'timetable', next);
      setEditing(false);
      toast('Timetable settings saved. Generate again to use them.', 'info');
    } catch (e) {
      toast(friendlyError(e), 'error');
    }
  };

  const viewName = () => (mode === 'class' ? classes.find((c) => c.id === armId)?.name ?? 'Timetable' : nameOf(teacherId));
  /** The timetable on screen, on a landscape page under the school's letterhead. */
  const formTeacher = (classId: string) => members.find((m) => m.classIds.includes(classId))?.name;
  /** One page for an arm: each lesson with its teacher. */
  const armPage = (classId: string): TimetablePage => {
    const cls = classes.find((c) => c.id === classId);
    return {
      title: `${cls?.name ?? 'Arm'} timetable`,
      subtitle: [formTeacher(classId) ? `Form teacher: ${formTeacher(classId)}` : '', timetable?.generatedAt ? `Week plan from ${new Date(timetable.generatedAt).toLocaleDateString()}` : ''].filter(Boolean).join('. '),
      cells: (timetable?.slots[classId] ?? []).map((s) => {
        const o = offeringById.get(s.offeringId);
        return { day: s.day, period: s.period, main: o?.subject ?? 'Lesson', sub: o ? teacherLabel(o) : '' };
      }),
    };
  };
  /** One page for a teacher: each lesson with its arm. */
  const teacherPage = (uid: string): TimetablePage => ({
    title: `${nameOf(uid)}: teaching timetable`,
    cells: Object.entries(timetable?.slots ?? {}).flatMap(([classId, list]) =>
      list
        .filter((s) => (offeringById.get(s.offeringId)?.teacherIds ?? []).includes(uid))
        .map((s) => ({ day: s.day, period: s.period, main: offeringById.get(s.offeringId)?.subject ?? 'Lesson', sub: classes.find((c) => c.id === classId)?.name })),
    ),
  });
  /** The arm or teacher on screen, on one landscape page. */
  const print = () => {
    if (!timetable) return;
    printDoc(`Timetable, ${viewName()}`, timetableDoc(timetable.settings, [mode === 'class' ? armPage(armId) : teacherPage(teacherId)]), { landscape: true });
  };
  /** Every arm, one landscape page each. */
  const printAll = () => {
    if (!timetable) return;
    printDoc('Timetables, all arms', timetableDoc(timetable.settings, classes.filter((c) => timetable.slots[c.id]?.length).map((c) => armPage(c.id))), { landscape: true });
  };
  const exportView = () => downloadCsv(`Timetable ${viewName()}`, tableRows(document.querySelector<HTMLTableElement>('.tt-print-area table')));

  const offeringById = useMemo(() => new Map(offerings.map((o) => [o.id, o])), [offerings]);
  const nameOf = (uid: string) => members.find((m) => m.uid === uid)?.name ?? 'Unassigned';
  const teacherLabel = (o: Offering | undefined) => {
    const ids = o?.teacherIds ?? [];
    if (!ids.length) return 'No teacher yet';
    return ids.map(nameOf).join(', ');
  };

  const clashes = useMemo(() => {
    if (!timetable) return [];
    return validateTimetable({ settings: timetable.settings, slots: timetable.slots, offerings, classes, members });
  }, [timetable, offerings, classes, members]);

  const hasTimetable = !!timetable && !!timetable.generatedAt;

  return (
    <div className="page">
      <header className="page-head tt-noprint">
        <div>
          <h1 className="display-sm">Timetable</h1>
          <p className="lede">The week at a glance for every arm and every teacher.</p>
        </div>
        {hasTimetable && (
          <div className="head-actions">
            <button className="pill ghost" onClick={print}>
              Print
            </button>
            <button className="pill ghost" onClick={printAll}>
              Print all arms
            </button>
            <button className="pill ghost" onClick={exportView}>
              Export CSV
            </button>
            {isAdmin && (
              <button className="ticket" onClick={generate} disabled={busy}>
                {busy ? 'Generating…' : 'Generate timetable'}
              </button>
            )}
          </div>
        )}
      </header>

      {isAdmin && (
        <SettingsPanel
          subjects={school.subjects}
          saved={savedSettings}
          editing={editing}
          onEdit={() => setEditing(true)}
          onCancel={() => setEditing(false)}
          onSave={saveSettings}
        />
      )}

      {!hasTimetable ? (
        <section className="panel tt-noprint">
          <h2 className="h3">No timetable yet</h2>
          <p className="muted">
            {isAdmin
              ? 'Generate one from your subjects and periods. Every subject is placed its weekly number of times, keeping each arm and teacher to one lesson at a time.'
              : 'An admin hasn’t generated the timetable yet. Once they do, your week will show here.'}
          </p>
          {isAdmin && (
            <div className="row-actions">
              <span className="muted small">You can adjust days, periods and per-subject counts in the settings above first.</span>
              <button className="ticket" onClick={generate} disabled={busy || !classes.length}>
                {busy ? 'Generating…' : 'Generate timetable'}
              </button>
            </div>
          )}
        </section>
      ) : (
        <>
          <section className="tt-noprint">
            <div className="chips tt-modes">
              <button className={`chip ${mode === 'class' ? 'on' : ''}`} onClick={() => setMode('class')} aria-pressed={mode === 'class'}>
                By class
              </button>
              <button className={`chip ${mode === 'teacher' ? 'on' : ''}`} onClick={() => setMode('teacher')} aria-pressed={mode === 'teacher'}>
                By teacher
              </button>
            </div>
            <label className="field tt-pick">
              <span className="mono">{mode === 'class' ? 'Arm' : 'Teacher'}</span>
              {mode === 'class' ? (
                <select value={armId} onChange={(e) => setArmId(e.target.value)}>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              ) : (
                <select value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
                  {teachers.length === 0 && <option value="">No teachers assigned yet</option>}
                  {teachers.map((t) => (
                    <option key={t.uid} value={t.uid}>
                      {t.name}
                      {t.uid === me.uid ? ' (you)' : ''}
                    </option>
                  ))}
                </select>
              )}
            </label>
          </section>

          <div className="tt-print-area">
            <p className="tt-print-title">
              {mode === 'class' ? classes.find((c) => c.id === armId)?.name ?? 'Timetable' : nameOf(teacherId)}
            </p>
            {mode === 'class' ? (
              <ClassGrid settings={timetable.settings} slots={timetable.slots[armId] ?? []} offeringById={offeringById} teacherLabel={teacherLabel} />
            ) : (
              <TeacherGrid settings={timetable.settings} slots={timetable.slots} offeringById={offeringById} classes={classes} teacherId={teacherId} />
            )}
          </div>

          <section className="record-grid tt-noprint">
            <div className="panel">
              <h2 className="h3">Clash check</h2>
              {clashes.length === 0 ? (
                <p className="muted">No clashes. No arm or teacher is double-booked.</p>
              ) : (
                <ul className="tt-list">
                  {clashes.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              )}
            </div>
            <div className="panel">
              <h2 className="h3">Lessons not placed</h2>
              {(timetable.unplaced ?? []).length === 0 ? (
                <p className="muted">Every lesson found a period.</p>
              ) : (
                <ul className="tt-list">
                  {timetable.unplaced.map((u) => {
                    const o = offeringById.get(u.offeringId);
                    const arm = classes.find((c) => c.id === o?.classId)?.name ?? 'an arm';
                    return (
                      <li key={u.offeringId}>
                        {o?.subject ?? 'A subject'} in {arm}: {u.missing} {u.missing === 1 ? 'period' : 'periods'} short.
                      </li>
                    );
                  })}
                </ul>
              )}
              <p className="muted small">
                Generated {new Date(timetable.generatedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}.
              </p>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function ClassGrid({
  settings,
  slots,
  offeringById,
  teacherLabel,
}: {
  settings: TimetableSettings;
  slots: TimetableSlot[];
  offeringById: Map<string, Offering>;
  teacherLabel: (o: Offering | undefined) => string;
}) {
  const at = useMemo(() => {
    const m = new Map<string, TimetableSlot>();
    for (const s of slots) m.set(`${s.day}:${s.period}`, s);
    return m;
  }, [slots]);

  return (
    <div className="tt-scroll">
      <table className="tt-grid">
        <thead>
          <tr>
            <th scope="col" className="tt-time">
              Period
            </th>
            {settings.days.map((d, di) => (
              <th scope="col" key={di}>
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {settings.periods.map((p, pi) =>
            p.isBreak ? (
              <tr className="tt-break" key={pi}>
                <th scope="row" className="tt-time">
                  {p.start}
                </th>
                <td colSpan={settings.days.length}>{p.label}</td>
              </tr>
            ) : (
              <tr key={pi}>
                <th scope="row" className="tt-time">
                  <span className="tt-plabel">{p.label}</span>
                  <span className="tt-prange">
                    {p.start} to {p.end}
                  </span>
                </th>
                {settings.days.map((_, di) => {
                  const s = at.get(`${di}:${pi}`);
                  const o = s ? offeringById.get(s.offeringId) : undefined;
                  return (
                    <td key={di}>
                      {o ? (
                        <>
                          <span className="tt-cell-subject">{o.subject}</span>
                          <span className="tt-cell-teacher">{teacherLabel(o)}</span>
                        </>
                      ) : (
                        <span className="tt-empty-cell">Free</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ),
          )}
        </tbody>
      </table>
    </div>
  );
}

function TeacherGrid({
  settings,
  slots,
  offeringById,
  classes,
  teacherId,
}: {
  settings: TimetableSettings;
  slots: Record<string, TimetableSlot[]>;
  offeringById: Map<string, Offering>;
  classes: { id: string; name: string }[];
  teacherId: string;
}) {
  const at = useMemo(() => {
    const m = new Map<string, { subject: string; arm: string }>();
    for (const [classId, list] of Object.entries(slots)) {
      for (const s of list) {
        const o = offeringById.get(s.offeringId);
        if (!o || !(o.teacherIds ?? []).includes(teacherId)) continue;
        m.set(`${s.day}:${s.period}`, { subject: o.subject, arm: classes.find((c) => c.id === classId)?.name ?? 'Arm' });
      }
    }
    return m;
  }, [slots, offeringById, classes, teacherId]);

  return (
    <div className="tt-scroll">
      <table className="tt-grid">
        <thead>
          <tr>
            <th scope="col" className="tt-time">
              Period
            </th>
            {settings.days.map((d, di) => (
              <th scope="col" key={di}>
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {settings.periods.map((p, pi) =>
            p.isBreak ? (
              <tr className="tt-break" key={pi}>
                <th scope="row" className="tt-time">
                  {p.start}
                </th>
                <td colSpan={settings.days.length}>{p.label}</td>
              </tr>
            ) : (
              <tr key={pi}>
                <th scope="row" className="tt-time">
                  <span className="tt-plabel">{p.label}</span>
                  <span className="tt-prange">
                    {p.start} to {p.end}
                  </span>
                </th>
                {settings.days.map((_, di) => {
                  const cell = at.get(`${di}:${pi}`);
                  return (
                    <td key={di}>
                      {cell ? (
                        <>
                          <span className="tt-cell-subject">{cell.subject}</span>
                          <span className="tt-cell-teacher">{cell.arm}</span>
                        </>
                      ) : (
                        <span className="tt-empty-cell">Free</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ),
          )}
        </tbody>
      </table>
    </div>
  );
}

function SettingsPanel({
  subjects,
  saved,
  editing,
  onEdit,
  onCancel,
  onSave,
}: {
  subjects: string[];
  saved: TimetableSettings;
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (s: TimetableSettings) => void;
}) {
  const [draft, setDraft] = useState<TimetableSettings>(saved);

  // Re-seed the form from the saved settings each time it opens.
  useEffect(() => {
    if (editing) setDraft(clone(saved));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  if (!editing) {
    const teaching = saved.periods.filter((p) => !p.isBreak).length;
    return (
      <section className="panel tt-noprint">
        <div className="row-actions">
          <div>
            <h2 className="h3">Settings</h2>
            <p className="muted small">
              {saved.days.length} days, {teaching} teaching periods a day. Mathematics and English get more periods by default.
            </p>
          </div>
          <button className="pill ghost" onClick={onEdit}>
            Edit settings
          </button>
        </div>
      </section>
    );
  }

  const toggleDay = (day: string) => {
    const has = draft.days.includes(day);
    const days = has ? draft.days.filter((d) => d !== day) : [...draft.days, day];
    days.sort((a, b) => WEEKDAYS.indexOf(a) - WEEKDAYS.indexOf(b));
    setDraft({ ...draft, days });
  };
  const setPeriod = (i: number, patch: Partial<TimetableSettings['periods'][number]>) => {
    const periods = draft.periods.map((p, pi) => (pi === i ? { ...p, ...patch } : p));
    setDraft({ ...draft, periods });
  };
  const addPeriod = (isBreak: boolean) => {
    const last = draft.periods[draft.periods.length - 1];
    const start = last?.end ?? '08:00';
    setDraft({ ...draft, periods: [...draft.periods, { label: isBreak ? 'Break' : `Period ${draft.periods.filter((p) => !p.isBreak).length + 1}`, start, end: start, ...(isBreak ? { isBreak: true } : {}) }] });
  };
  const removePeriod = (i: number) => setDraft({ ...draft, periods: draft.periods.filter((_, pi) => pi !== i) });
  const setPerWeek = (subject: string, n: number) => setDraft({ ...draft, perWeek: { ...draft.perWeek, [subject]: Math.max(0, Math.min(20, Math.round(n || 0))) } });

  return (
    <section className="panel tt-noprint">
      <h2 className="h3">Settings</h2>

      <div>
        <span className="mono tt-group-label">Teaching days</span>
        <div className="chips">
          {WEEKDAYS.map((d) => (
            <button key={d} type="button" className={`chip ${draft.days.includes(d) ? 'on' : ''}`} onClick={() => toggleDay(d)} aria-pressed={draft.days.includes(d)}>
              {d}
            </button>
          ))}
        </div>
      </div>

      <div>
        <span className="mono tt-group-label">Periods</span>
        <div className="tt-scroll">
          <table className="tt-grid tt-settings">
            <thead>
              <tr>
                <th scope="col">Label</th>
                <th scope="col">Start</th>
                <th scope="col">End</th>
                <th scope="col">Break</th>
                <th scope="col" aria-label="Remove" />
              </tr>
            </thead>
            <tbody>
              {draft.periods.map((p, i) => (
                <tr key={i}>
                  <td>
                    <input value={p.label} onChange={(e) => setPeriod(i, { label: e.target.value })} aria-label={`Period ${i + 1} label`} />
                  </td>
                  <td>
                    <input type="time" value={p.start} onChange={(e) => setPeriod(i, { start: e.target.value })} aria-label={`Period ${i + 1} start`} />
                  </td>
                  <td>
                    <input type="time" value={p.end} onChange={(e) => setPeriod(i, { end: e.target.value })} aria-label={`Period ${i + 1} end`} />
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      checked={!!p.isBreak}
                      onChange={(e) => setPeriod(i, { isBreak: e.target.checked || undefined })}
                      aria-label={`Period ${i + 1} is a break`}
                    />
                  </td>
                  <td>
                    <button className="link danger small" onClick={() => removePeriod(i)} type="button">
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="head-actions tt-add-row">
          <button className="pill ghost" type="button" onClick={() => addPeriod(false)}>
            Add period
          </button>
          <button className="pill ghost" type="button" onClick={() => addPeriod(true)}>
            Add break
          </button>
        </div>
      </div>

      <div>
        <span className="mono tt-group-label">Periods per week for each subject</span>
        <div className="form-grid tt-perweek">
          {subjects.map((s) => (
            <label className="field" key={s}>
              <span className="mono">{s}</span>
              <input
                type="number"
                min={0}
                max={20}
                value={draft.perWeek[s] ?? defaultPerWeek(s)}
                onChange={(e) => setPerWeek(s, Number(e.target.value))}
              />
            </label>
          ))}
        </div>
      </div>

      <div className="row-actions">
        <button className="link" type="button" onClick={onCancel}>
          Cancel
        </button>
        <button className="pill ink" type="button" onClick={() => onSave(draftWithTeaching(draft))} disabled={!draft.days.length || !draft.periods.some((p) => !p.isBreak)}>
          Save settings
        </button>
      </div>
    </section>
  );
}

const clone = (s: TimetableSettings): TimetableSettings => ({ days: [...s.days], periods: s.periods.map((p) => ({ ...p })), perWeek: { ...s.perWeek } });
/** Drop empty-string labels so the grid never shows blanks. */
const draftWithTeaching = (s: TimetableSettings): TimetableSettings => ({
  ...s,
  periods: s.periods.map((p, i) => ({ ...p, label: p.label.trim() || (p.isBreak ? 'Break' : `Period ${i + 1}`) })),
});
