import { useCallback, useEffect, useMemo, useState } from 'react';
import { query, where } from 'firebase/firestore';
import { mod, paths, patchIn, removeIn, saveIn, todayISO, uid } from '../data/api';
import { useQuery } from '../data/hooks';
import type { Book, Loan, StudentProfile } from '../data/types';
import { friendlyError } from '../lib/errors';
import { useToast } from '../ui/toast';
import { useSchool } from '../school/SchoolContext';
import './ops.css';
import { PrintExport } from '../components/PrintExport';

const addDays = (iso: string, days: number) => {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};
const showDate = (iso: string) => (iso ? new Date(iso + 'T00:00:00').toLocaleDateString() : '—');

/** One form class worth of students, loaded for teachers who may not read the whole school. */
function ClassRoster({ classId, onLoad }: { classId: string; onLoad: (id: string, s: StudentProfile[]) => void }) {
  const { schoolId } = useSchool();
  const r = useQuery<StudentProfile>(query(paths.students(schoolId), where('classId', '==', classId)), `lib-roster:${schoolId}:${classId}`);
  useEffect(() => onLoad(classId, r.data), [classId, r.data, onLoad]);
  return null;
}

export function LibraryPage() {
  const { schoolId, isAdmin, formClasses, classes } = useSchool();
  const toast = useToast();
  const books = useQuery<Book>(mod(schoolId, 'books'), `books:${schoolId}`);
  const loans = useQuery<Loan>(mod(schoolId, 'loans'), `loans:${schoolId}`);

  // Students for the lending picker: all for admins, each form class for teachers.
  const allStudents = useQuery<StudentProfile>(isAdmin ? paths.students(schoolId) : null, `lib-all:${schoolId}:${isAdmin}`);
  const [byClass, setByClass] = useState<Record<string, StudentProfile[]>>({});
  const onRoster = useCallback((id: string, s: StudentProfile[]) => setByClass((p) => ({ ...p, [id]: s })), []);
  const students = isAdmin ? allStudents.data : Object.values(byClass).flat();
  const classNameOf = useMemo(() => Object.fromEntries(classes.map((c) => [c.id, c.name])), [classes]);

  const [find, setFind] = useState('');
  const active = loans.data.filter((l) => !l.returned);
  const outCount = (bookId: string) => active.filter((l) => l.bookId === bookId).length;

  // Book form (admins)
  const [editId, setEditId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [copies, setCopies] = useState('1');
  const [shelf, setShelf] = useState('');
  const resetBook = () => {
    setEditId(null);
    setTitle('');
    setAuthor('');
    setCopies('1');
    setShelf('');
  };
  const editBook = (b: Book) => {
    setEditId(b.id);
    setTitle(b.title);
    setAuthor(b.author);
    setCopies(String(b.copies));
    setShelf(b.shelf);
  };
  const saveBook = async () => {
    try {
      const book: Book = { id: editId ?? uid(), title: title.trim(), author: author.trim(), copies: Math.max(0, Number(copies) || 0), shelf: shelf.trim(), at: Date.now() };
      await saveIn(schoolId, 'books', book);
      toast(editId ? 'Book updated.' : 'Book added.');
      resetBook();
    } catch (e) {
      toast(friendlyError(e), 'error');
    }
  };
  const removeBook = async (b: Book) => {
    try {
      await removeIn(schoolId, 'books', b.id);
      if (editId === b.id) resetBook();
    } catch (e) {
      toast(friendlyError(e), 'error');
    }
  };

  // Lending (any staff)
  const [lendBookId, setLendBookId] = useState('');
  const [studentQ, setStudentQ] = useState('');
  const [picked, setPicked] = useState<StudentProfile | null>(null);
  const [due, setDue] = useState(addDays(todayISO(), 14));
  const matches = studentQ.trim()
    ? students.filter((s) => s.name.toLowerCase().includes(studentQ.trim().toLowerCase())).slice(0, 8)
    : [];
  const available = books.data.filter((b) => b.copies - outCount(b.id) > 0).sort((a, b) => a.title.localeCompare(b.title));
  const lend = async () => {
    if (!lendBookId || !picked) return;
    try {
      const loan: Loan = { id: uid(), bookId: lendBookId, studentId: picked.id, studentName: picked.name, out: todayISO(), due, at: Date.now() };
      await saveIn(schoolId, 'loans', loan);
      toast(`Lent to ${picked.name}.`);
      setLendBookId('');
      setPicked(null);
      setStudentQ('');
      setDue(addDays(todayISO(), 14));
    } catch (e) {
      toast(friendlyError(e), 'error');
    }
  };
  const markReturned = async (l: Loan) => {
    try {
      await patchIn(schoolId, 'loans', l.id, { returned: todayISO() });
    } catch (e) {
      toast(friendlyError(e), 'error');
    }
  };

  const bookTitleOf = useMemo(() => Object.fromEntries(books.data.map((b) => [b.id, b.title])), [books.data]);
  const today = todayISO();
  const catalogue = books.data
    .filter((b) => !find.trim() || `${b.title} ${b.author}`.toLowerCase().includes(find.trim().toLowerCase()))
    .sort((a, b) => a.title.localeCompare(b.title));
  const outNow = [...active].sort((a, b) => a.due.localeCompare(b.due));

  return (
    <div className="page">
      {!isAdmin && formClasses.map((c) => <ClassRoster key={c.id} classId={c.id} onLoad={onRoster} />)}
      <header className="page-head">
        <div>
          <h1 className="display-sm">Library</h1>
          <p className="lede">The book catalogue and what is out on loan.</p>
        </div>
        <label className="field search">
          <span className="mono">Find a book</span>
          <input value={find} onChange={(e) => setFind(e.target.value)} placeholder="Title or author" />
        </label>
        <PrintExport title="Library" fromTable />
      </header>

      <section className="panel wide">
        <h2 className="h3">Lend a book</h2>
        <div className="form-grid">
          <label className="field">
            <span className="mono">Book</span>
            <select value={lendBookId} onChange={(e) => setLendBookId(e.target.value)}>
              <option value="">Choose a book</option>
              {available.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.title} ({b.copies - outCount(b.id)} free)
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="mono">Due back</span>
            <input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </label>
        </div>
        <label className="field">
          <span className="mono">Student</span>
          <input
            value={picked ? picked.name : studentQ}
            onChange={(e) => {
              setPicked(null);
              setStudentQ(e.target.value);
            }}
            placeholder="Search by name"
          />
        </label>
        {!picked && matches.length > 0 && (
          <ul className="ops-pick">
            {matches.map((s) => (
              <li key={s.id}>
                <button type="button" onClick={() => setPicked(s)}>
                  <span>{s.name}</span>
                  <span className="muted small">{classNameOf[s.classId] ?? ''}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="row-actions">
          <span className="muted small">{available.length ? 'Any staff member can lend a book.' : 'No books have free copies right now.'}</span>
          <button className="ticket" onClick={lend} disabled={!lendBookId || !picked}>
            Lend book
          </button>
        </div>
      </section>

      <section className="panel wide">
        <h2 className="h3">Out now</h2>
        {outNow.length === 0 ? (
          <p className="muted">No books are out on loan.</p>
        ) : (
          <div className="table-wrap">
            <table className="gradebook">
              <thead>
                <tr>
                  <th scope="col">Student</th>
                  <th scope="col">Book</th>
                  <th scope="col">Lent</th>
                  <th scope="col">Due</th>
                  <th scope="col" aria-label="Action" />
                </tr>
              </thead>
              <tbody>
                {outNow.map((l) => {
                  const overdue = l.due < today;
                  return (
                    <tr key={l.id} className={overdue ? 'ops-overdue' : undefined}>
                      <td className="gb-name">{l.studentName}</td>
                      <td>{bookTitleOf[l.bookId] ?? 'Unknown book'}</td>
                      <td className="ops-num">{showDate(l.out)}</td>
                      <td className="ops-num">{showDate(l.due)}{overdue ? ' (overdue)' : ''}</td>
                      <td>
                        <button className="pill ghost" onClick={() => markReturned(l)}>
                          Mark returned
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {isAdmin && (
        <section className="panel wide">
          <h2 className="h3">{editId ? 'Edit book' : 'Add a book'}</h2>
          <div className="form-grid">
            <label className="field">
              <span className="mono">Title</span>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Things Fall Apart" />
            </label>
            <label className="field">
              <span className="mono">Author</span>
              <input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="e.g. Chinua Achebe" />
            </label>
            <label className="field">
              <span className="mono">Copies</span>
              <input type="number" min={0} value={copies} onChange={(e) => setCopies(e.target.value)} />
            </label>
            <label className="field">
              <span className="mono">Shelf</span>
              <input value={shelf} onChange={(e) => setShelf(e.target.value)} placeholder="e.g. Fiction, row 2" />
            </label>
          </div>
          <div className="row-actions">
            {editId ? (
              <button className="link" onClick={resetBook}>
                Cancel edit
              </button>
            ) : (
              <span />
            )}
            <button className="pill ink" onClick={saveBook} disabled={!title.trim()}>
              {editId ? 'Save changes' : 'Add book'}
            </button>
          </div>
        </section>
      )}

      <section className="panel wide">
        <h2 className="h3">Catalogue</h2>
        {catalogue.length === 0 ? (
          <p className="muted">{books.data.length ? 'No books match your search.' : 'No books in the catalogue yet.'}</p>
        ) : (
          <div className="table-wrap">
            <table className="gradebook">
              <thead>
                <tr>
                  <th scope="col">Title</th>
                  <th scope="col">Author</th>
                  <th scope="col">Shelf</th>
                  <th scope="col" className="num">Copies</th>
                  <th scope="col" className="num">Available</th>
                  {isAdmin && <th scope="col" aria-label="Actions" />}
                </tr>
              </thead>
              <tbody>
                {catalogue.map((b) => (
                  <tr key={b.id}>
                    <td className="gb-name">{b.title}</td>
                    <td>{b.author || '—'}</td>
                    <td>{b.shelf || '—'}</td>
                    <td className="num ops-num">{b.copies}</td>
                    <td className="num ops-num">{b.copies - outCount(b.id)}</td>
                    {isAdmin && (
                      <td>
                        <div className="head-actions">
                          <button className="link" onClick={() => editBook(b)}>
                            Edit
                          </button>
                          <button className="link danger" onClick={() => removeBook(b)}>
                            Remove
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
