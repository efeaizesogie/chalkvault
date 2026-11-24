import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { mod, removeIn, saveIn } from '../data/api';
import { useQuery } from '../data/hooks';
import type { Lesson, QuizQuestion } from '../data/types';
import { writeLessonNote, writeQuiz } from '../lib/ai';
import { download } from '../lib/export';
import { friendlyError } from '../lib/errors';
import { SourceStamp } from '../components/SourceStamp';
import { useToast } from '../ui/toast';
import { useSchool } from '../school/SchoolContext';
import type { WorkspaceCtx } from '../school/Workspace';
import './lessons.css';
import { printParts } from '../lib/print';

const LETTERS = ['A', 'B', 'C', 'D'];

/** Lesson notes and quizzes. No student data is involved, so AI runs on-device when it can and in the cloud otherwise. */
export function LessonsPage() {
  const { schoolId, school, myOfferings, classes, me, isAdmin } = useSchool();
  const ws = useOutletContext<WorkspaceCtx>();
  const toast = useToast();
  const lessons = useQuery<Lesson>(mod(schoolId, 'lessons'), `lessons:${schoolId}`);
  const mySubjects = [...new Set(myOfferings.map((o) => o.subject))];
  const subjects = mySubjects.length && !isAdmin ? mySubjects : school.subjects;
  const myLevels = [...new Set(myOfferings.map((o) => classes.find((c) => c.id === o.classId)?.level).filter(Boolean) as string[])];
  const levels = myLevels.length && !isAdmin ? myLevels : school.levels;

  const [subject, setSubject] = useState(subjects[0] ?? '');
  const [level, setLevel] = useState(levels[0] ?? '');
  const [topic, setTopic] = useState('');
  const [week, setWeek] = useState('');
  const [extra, setExtra] = useState('');
  const [count, setCount] = useState(10);
  const [notes, setNotes] = useState('');
  const [quiz, setQuiz] = useState<QuizQuestion[]>([]);
  const [noteSource, setNoteSource] = useState<'on_device' | 'in_cloud' | undefined>();
  const [quizSource, setQuizSource] = useState<'on_device' | 'in_cloud' | undefined>();
  const [busy, setBusy] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  const write = async () => {
    setBusy('Writing the lesson note…');
    setNotes('');
    setQuiz([]);
    try {
      const res = await writeLessonNote({ subject, level, topic, week, country: school.country, extra }, (t, s) => {
        setNotes(t);
        setNoteSource(s);
      });
      setNotes(res.text);
      setNoteSource(res.source);
      await ws.log({ task: `Lesson note: ${subject}`, source: res.source, charsSent: res.source === 'in_cloud' ? res.prompt.length : 0, detail: res.source === 'in_cloud' ? `No student data.\n${res.prompt}` : 'Written by Gemini Nano on this device.' });
      setBusy('Writing quiz questions…');
      const q = await writeQuiz({ subject, level, topic, notes: res.text, count });
      setQuiz(q.questions);
      setQuizSource(q.source);
      await ws.log({ task: `Quiz: ${subject}`, source: q.source, charsSent: q.source === 'in_cloud' ? q.prompt.length : 0, detail: q.source === 'in_cloud' ? `No student data.\n${q.prompt.slice(0, 800)}` : 'Written by Gemini Nano on this device.' });
    } catch (e) {
      toast(`Couldn’t finish. ${friendlyError(e)}`, 'error');
    } finally {
      setBusy('');
      ws.refreshDevice();
    }
  };

  const save = async () => {
    try {
      await saveIn(schoolId, 'lessons', {
        subject,
        level,
        topic: topic.trim(),
        week,
        objectives: notes
          .split('\n')
          .filter((l) => /should be able to/i.test(l))
          .map((l) => l.replace(/^[-•\d.\s]+/, '').trim()),
        notes,
        quiz,
        ...(noteSource ? { source: noteSource } : {}),
        by: me.uid,
        byName: me.name,
        at: Date.now(),
      } as Lesson);
      toast('Saved to the school’s lesson notes.');
      setNotes('');
      setQuiz([]);
      setTopic('');
    } catch (e) {
      toast(friendlyError(e), 'error');
    }
  };

  const exportCbt = (l: { topic: string; quiz: QuizQuestion[] }) => {
    const q = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const rows = l.quiz.map((x) => [x.question, ...x.options.concat(['', '', '', '']).slice(0, 4), LETTERS[x.answer], x.explanation].map(q).join(','));
    download(`${l.topic.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'quiz'}-cbt.csv`, '﻿Question,Option A,Option B,Option C,Option D,Answer,Explanation\r\n' + rows.join('\r\n'));
  };

  const open = lessons.data.find((l) => l.id === openId);
  const list = [...lessons.data].filter((l) => !filter || l.subject === filter).sort((a, b) => b.at - a.at);

  return (
    <div className="page lessons-page">
      <header className="page-head">
        <div>
          <h1 className="display-sm">Lesson notes and quizzes</h1>
          <p className="lede">Plan a lesson and get a ready quiz for class or your CBT system. No student data is used, so Gemini Nano writes on this computer when it can.</p>
        </div>
      </header>

      <section className="panel">
        <div className="form-grid">
          <label className="field">
            <span className="mono">Subject</span>
            <select value={subject} onChange={(e) => setSubject(e.target.value)}>
              {subjects.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="mono">Class</span>
            <select value={level} onChange={(e) => setLevel(e.target.value)}>
              {levels.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="mono">Topic</span>
            <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. Simple interest" />
          </label>
          <label className="field">
            <span className="mono">Week (optional)</span>
            <input value={week} onChange={(e) => setWeek(e.target.value)} placeholder="4" />
          </label>
        </div>
        <label className="field">
          <span className="mono">Anything to include (optional)</span>
          <input value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="e.g. use market examples, revise percentages first" />
        </label>
        <div className="row-actions">
          <label className="field inline">
            <span className="mono">Quiz questions</span>
            <select value={count} onChange={(e) => setCount(Number(e.target.value))}>
              {[5, 10, 15, 20].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </label>
          <button className="ticket" onClick={write} disabled={!topic.trim() || !!busy}>
            {busy || 'Write lesson note and quiz'}
          </button>
        </div>
      </section>

      {(notes || busy) && (
        <section className="panel lesson-out">
          <div className="panel-head">
            <h2 className="h3">
              {subject}, {level}: {topic}
            </h2>
            {noteSource && <SourceStamp source={noteSource} />}
          </div>
          <textarea className="lesson-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={16} aria-label="Lesson note" />
          {quiz.length > 0 && (
            <>
              <div className="panel-head">
                <h3 className="h3">Quiz ({quiz.length} questions)</h3>
                {quizSource && <SourceStamp source={quizSource} />}
              </div>
              <QuizEditor quiz={quiz} onChange={setQuiz} />
            </>
          )}
          <div className="row-actions">
            <span className="muted small">Edit anything before saving. Saved notes are shared with other staff.</span>
            <div className="head-actions">
              {quiz.length > 0 && (
                <button className="pill ghost" onClick={() => exportCbt({ topic, quiz })}>
                  Download for CBT
                </button>
              )}
              <button className="pill ink" onClick={save} disabled={!!busy || !notes}>
                Save
              </button>
            </div>
          </div>
        </section>
      )}

      <section className="panel">
        <div className="panel-head">
          <h2 className="h3">Saved lesson notes</h2>
          <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter by subject">
            <option value="">All subjects</option>
            {school.subjects.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
        <ul className="queue-list">
          {list.map((l) => (
            <li key={l.id}>
              <button className="link" onClick={() => setOpenId(openId === l.id ? null : l.id)}>
                {l.topic}
              </button>
              <span className="muted small">
                {l.subject}, {l.level}
                {l.week ? `, week ${l.week}` : ''}, {l.quiz.length} questions, by {l.byName}
              </span>
            </li>
          ))}
          {!list.length && <li className="muted">No lesson notes saved yet.</li>}
        </ul>
      </section>

      {open && (
        <section className="panel lesson-print">
          <div className="panel-head">
            <h2 className="h3">
              {open.subject}, {open.level}: {open.topic}
            </h2>
            <div className="head-actions no-print">
              <button className="pill ghost" onClick={() => printParts([document.querySelector<HTMLElement>('.lesson-print')], { title: 'Lesson note' })}>
                Print note and quiz
              </button>
              {open.quiz.length > 0 && (
                <button className="pill ghost" onClick={() => exportCbt(open)}>
                  Download for CBT
                </button>
              )}
              {(open.by === me.uid || isAdmin) && (
                <button className="link danger" onClick={() => removeIn(schoolId, 'lessons', open.id).then(() => setOpenId(null))}>
                  Delete
                </button>
              )}
            </div>
          </div>
          <div className="lesson-text">{open.notes}</div>
          {open.quiz.length > 0 && (
            <>
              <h3 className="h3">Quiz</h3>
              <ol className="quiz-print">
                {open.quiz.map((q, i) => (
                  <li key={i}>
                    <p>{q.question}</p>
                    <ol className="quiz-opts">
                      {q.options.map((o, j) => (
                        <li key={j}>
                          {LETTERS[j]}. {o}
                        </li>
                      ))}
                    </ol>
                  </li>
                ))}
              </ol>
              <p className="answer-key">
                Answers: {open.quiz.map((q, i) => `${i + 1} ${LETTERS[q.answer]}`).join(', ')}
              </p>
            </>
          )}
        </section>
      )}
    </div>
  );
}

function QuizEditor({ quiz, onChange }: { quiz: QuizQuestion[]; onChange: (q: QuizQuestion[]) => void }) {
  const set = (i: number, patch: Partial<QuizQuestion>) => onChange(quiz.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  return (
    <ol className="quiz-edit">
      {quiz.map((q, i) => (
        <li key={i}>
          <input aria-label={`Question ${i + 1}`} value={q.question} onChange={(e) => set(i, { question: e.target.value })} />
          <div className="quiz-opts-edit">
            {q.options.map((o, j) => (
              <label key={j} className={q.answer === j ? 'correct' : ''}>
                <input type="radio" name={`q${i}`} checked={q.answer === j} onChange={() => set(i, { answer: j })} aria-label={`Option ${LETTERS[j]} is correct`} />
                <span>{LETTERS[j]}.</span>
                <input value={o} aria-label={`Question ${i + 1} option ${LETTERS[j]}`} onChange={(e) => set(i, { options: q.options.map((x, k) => (k === j ? e.target.value : x)) })} />
              </label>
            ))}
          </div>
          <p className="muted small">{q.explanation}</p>
          <button className="link danger small" onClick={() => onChange(quiz.filter((_, j) => j !== i))}>
            Remove question
          </button>
        </li>
      ))}
    </ol>
  );
}
