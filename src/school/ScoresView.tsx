import { useMemo, useState } from 'react';
import { saveRecord } from '../data/api';
import type { ClassRoom, StudentProfile, TermRecord } from '../data/types';
import { assessmentsOf, bandsOf, computeResults, ordinal } from '../lib/results';
import { friendlyError } from '../lib/errors';
import { useToast } from '../ui/toast';
import { useSchool } from './SchoolContext';

/** Gradebook for one class and term: scores per assessment, totals, grades, positions, printable broadsheet. */
export function ScoresView({ cls, students, records }: { cls: ClassRoom; students: StudentProfile[]; records: TermRecord[] }) {
  const { schoolId, school, term, me } = useSchool();
  const toast = useToast();
  const assessments = assessmentsOf(school);
  const bands = bandsOf(school);
  const recs = useMemo(() => new Map(records.map((r) => [r.studentId, r])), [records]);
  // Unsaved edits, keyed `${studentId}:${assessmentKey}`.
  const [edits, setEdits] = useState<Record<string, string>>({});

  const scores = useMemo(() => {
    const out: Record<string, Record<string, number>> = {};
    for (const s of students) {
      const base = { ...(recs.get(s.id)?.scores ?? {}) };
      for (const a of assessments) {
        const e = edits[`${s.id}:${a.key}`];
        if (e !== undefined) {
          if (e.trim() === '') delete base[a.key];
          else if (!Number.isNaN(Number(e))) base[a.key] = Number(e);
        }
      }
      out[s.id] = base;
    }
    return out;
  }, [students, recs, edits, assessments]);

  const results = computeResults(
    students.map((s) => s.id),
    scores,
    assessments,
    bands,
  );

  const commit = async (s: StudentProfile, a: { key: string; max: number }, raw: string) => {
    const k = `${s.id}:${a.key}`;
    const stored = recs.get(s.id)?.scores?.[a.key];
    if (!term || raw === (stored ?? '').toString()) return;
    const n = Number(raw);
    if (raw.trim() !== '' && (Number.isNaN(n) || n < 0 || n > a.max)) {
      toast(`Scores for this column must be between 0 and ${a.max}.`, 'warn');
      return;
    }
    const next = { ...(recs.get(s.id)?.scores ?? {}) };
    if (raw.trim() === '') delete next[a.key];
    else next[a.key] = n;
    try {
      await saveRecord(schoolId, me.uid, { termId: term.id, studentId: s.id, classId: cls.id, scores: next });
      setEdits((e) => {
        const c = { ...e };
        delete c[k];
        return c;
      });
    } catch (e) {
      toast(friendlyError(e), 'error');
    }
  };

  return (
    <section className="scores">
      <header className="att-bar">
        <p className="att-counts">
          Out of {results.maxTotal}. Class average {results.average}, highest {results.highest}, lowest {results.lowest}.
        </p>
        <div className="att-actions">
          <button className="pill ghost" onClick={() => window.print()} disabled={!results.ranked}>
            Print broadsheet
          </button>
        </div>
      </header>
      <div className="table-wrap">
        <table className="gradebook">
          <thead>
            <tr>
              <th scope="col">Student</th>
              {assessments.map((a) => (
                <th key={a.key} scope="col" className="num">
                  {a.label} <span className="muted">/{a.max}</span>
                </th>
              ))}
              <th scope="col" className="num">Total</th>
              <th scope="col">Grade</th>
              <th scope="col" className="num">Position</th>
            </tr>
          </thead>
          <tbody>
            {students.map((s) => {
              const r = results.rows.get(s.id)!;
              return (
                <tr key={s.id}>
                  <th scope="row" className="gb-name">{s.name}</th>
                  {assessments.map((a) => {
                    const k = `${s.id}:${a.key}`;
                    const v = edits[k] ?? (scores[s.id][a.key] ?? '').toString();
                    return (
                      <td key={a.key} className="num">
                        <input
                          inputMode="decimal"
                          aria-label={`${s.name} ${a.label}`}
                          value={v}
                          onChange={(e) => setEdits((x) => ({ ...x, [k]: e.target.value }))}
                          onBlur={(e) => commit(s, a, e.currentTarget.value)}
                          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                        />
                      </td>
                    );
                  })}
                  <td className="num gb-total">{r.grade ? r.total : ''}</td>
                  <td>
                    {r.grade && (
                      <>
                        <b>{r.grade}</b> <span className="muted small">{r.remark}</span>
                      </>
                    )}
                  </td>
                  <td className="num">{r.position ? ordinal(r.position) : ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {students.length === 0 && <p className="muted ws-empty">Add students to this class first.</p>}

      <div className="print-only broadsheet">
        <h1>{school.name}</h1>
        <p>
          Broadsheet: {cls.name}, {term?.name}. Class average {results.average} out of {results.maxTotal}.
        </p>
        <table>
          <thead>
            <tr>
              <th>Position</th>
              <th>Student</th>
              {assessments.map((a) => (
                <th key={a.key}>
                  {a.label} ({a.max})
                </th>
              ))}
              <th>Total</th>
              <th>Grade</th>
              <th>Remark</th>
            </tr>
          </thead>
          <tbody>
            {[...students]
              .sort((a, b) => (results.rows.get(a.id)!.position || 999) - (results.rows.get(b.id)!.position || 999))
              .map((s) => {
                const r = results.rows.get(s.id)!;
                return (
                  <tr key={s.id}>
                    <td>{r.position ? ordinal(r.position) : ''}</td>
                    <td>{s.name}</td>
                    {assessments.map((a) => (
                      <td key={a.key}>{scores[s.id][a.key] ?? ''}</td>
                    ))}
                    <td>{r.grade ? r.total : ''}</td>
                    <td>{r.grade}</td>
                    <td>{r.remark}</td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
