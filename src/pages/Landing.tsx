import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';

type Feature = { title: string; body: string; soon?: boolean };
const GROUPS: { title: string; items: Feature[] }[] = [
  {
    title: 'Setting up and running the school',
    items: [
      { title: 'Bring in your old records', body: 'Photos, PDFs, Excel or CSV. Gemini Nano sorts each page (class list, score sheet, ledger, staff list) and reads it on the laptop. You check every row before it is saved.' },
      { title: 'Guided setup with suggestions', body: 'Pick levels from Creche to SS 3, arms from A to Gold or Diamond, and every Nigerian subject from ready lists instead of typing them.' },
      { title: 'Classes, arms and subjects', body: 'JSS 1A, JSS 1B, SS 2 Gold: each arm with its subjects. Electives can have their own students.' },
      { title: 'Your school, your rules', body: 'Who takes attendance, how many form classes a teacher holds, whether comments need approval, the score sheet, the grade bands and the promotion rule.' },
      { title: 'Form and subject teachers', body: 'A subject teacher sees only their subjects and those students, a form teacher their arm, admins everything. Enforced by the database rules.' },
      { title: 'Terms and sessions', body: 'Dates and status for each term, a checklist to close it, records locked once closed, and any earlier term one click away.' },
      { title: 'Timetable', body: 'A clash-free week for every arm and teacher, with lessons and free periods spread through the day. Print one arm or all of them.' },
      { title: 'Admissions and the rest', body: 'Online applications with accept-and-enrol, behaviour and health log, library, transport, inventory, staff leave and alumni.' },
    ],
  },
  {
    title: 'For the principal',
    items: [
      { title: 'A dashboard of the term', body: 'Attendance week by week and by arm, subject and arm averages, grade spread, fees by arm, staff progress and students who need attention, each against last term.' },
      { title: 'This morning’s brief', body: 'A short read of where the school stands, written from the dashboard’s own figures by Gemini Nano on the laptop. “Explain this” on any chart.' },
      { title: 'Ask Chalkvault', body: 'Ask “Who is failing two subjects?” or “Which arm has the lowest attendance?” and get an answer from your own records.' },
      { title: 'Term against term, year against year', body: 'Closing a term saves its figures, so every later dashboard can compare. Third term report cards carry the cumulative result.' },
    ],
  },
  {
    title: 'Teaching and results',
    items: [
      { title: 'Registers in one tap', body: 'Daily or lesson by lesson, as your school chooses. Or photograph the paper register and Gemini Nano reads it on the laptop.' },
      { title: 'Score sheets that fill themselves', body: 'Type scores, scan a photographed score sheet, or import results from your CBT system. The AI matches the columns for you.' },
      { title: 'Report comments, written on the laptop', body: 'Gemini Nano turns rough notes, scores and attendance into a warm, specific comment, streaming as you watch. A whole class in one click.' },
      { title: 'Approval and follow-up', body: 'Comments go to the head for approval and lock once approved. The AI flags academic, attendance or wellbeing concerns as it writes.' },
      { title: 'Report cards and broadsheets', body: 'Every subject, total, grade, position and remark, with form teacher and principal comments, and the cumulative result in third term.' },
      { title: 'Promotion by your rule', body: 'Set a pass mark and the subjects that need a credit. Students who miss it are flagged to repeat, and you decide.' },
      { title: 'Lesson notes and quizzes', body: 'Lesson notes in the scheme-of-work format and quizzes you can print or load into your CBT system.' },
    ],
  },
  {
    title: 'Money, parents and paperwork',
    items: [
      { title: 'Fees the way you charge them', body: 'Class fees, optional levies, sibling, staff and scholarship discounts, part payments and arrears. Photograph a bank teller and the payment fills itself in.' },
      { title: 'Results for parents by PIN', body: 'Publish report cards and print a private result PIN for each student. Parents see the card, attendance and fee balance online without an account.' },
      { title: 'Messages in every family’s language', body: 'Absence alerts, fee reminders and results notices in English, Yoruba, Hausa, Igbo and more, sent by WhatsApp or SMS.' },
      { title: 'Print and export anything', body: 'Overview, report cards, broadsheets, timetables, fees statements, receipts and class lists print under your letterhead, and every list exports to Excel.' },
      { title: 'An audit ledger', body: 'Every AI request is logged: where it ran, and exactly what, if anything, left the device.' },
      { title: 'Google Drive import', body: 'Pull CBT results straight from Google Drive.', soon: true },
    ],
  },
];

const FAQ: { q: string; a: string }[] = [
  {
    q: 'Where are our student records stored?',
    a: 'In your school’s private space in Google Firebase (Cloud Firestore). Only people you invite can open it, and security rules limit each teacher to their own classes. Records are also cached in the browser so teachers can keep working offline.',
  },
  {
    q: 'What does the AI actually see?',
    a: 'When Chrome’s built-in Gemini Nano is available, comments are written entirely on the teacher’s computer, so the AI runs locally and nothing is sent anywhere. When it isn’t, or when you translate or align a comment to standards, Chalkvault first replaces every student name on the class list (and emails, phone numbers and ID numbers) with placeholders like [STUDENT]. You see exactly what will be sent before it goes. The name is put back on your device afterwards.',
  },
  {
    q: 'Which browsers can write comments on-device?',
    a: 'Desktop Chrome with Gemini Nano enabled (Chrome 139 or newer, about 22 GB of free disk space, and 16 GB of RAM or a graphics card with more than 4 GB). Other browsers still work: they use the names-removed cloud path, and you can switch that off so nothing is written unless it can be done on-device.',
  },
  {
    q: 'Does this make us compliant with data protection law?',
    a: 'Chalkvault is built to help: data minimisation for AI, role-based access, an audit ledger and one-click deletion. It does not make a school compliant by itself and holds no certification. Check your obligations under the laws that apply to you, such as Nigeria’s NDPA 2023, FERPA in the US or UK GDPR.',
  },
  {
    q: 'Can we delete everything?',
    a: 'Yes. The school owner can delete the school from Settings, which removes every class, student record, note, comment and staff membership.',
  },
  {
    q: 'How do parents see results?',
    a: 'When the school publishes a term’s report cards, each student has a private result PIN, printed on a slip. A parent enters it on the Chalkvault results page to view and print the report card. No account or app is needed.',
  },
  {
    q: 'We keep records on paper and in Excel. Can we bring them in?',
    a: 'Yes. Photograph class lists, score sheets, fee ledgers and staff lists, handwritten or typed, or drop in PDFs, Excel and CSV files. Gemini Nano sorts each page and reads it on the laptop; you check everything, including possible duplicates and hard-to-read fields, before anything is saved.',
  },
  {
    q: 'Can we import scores from our CBT system?',
    a: 'Yes. Upload the CSV or Excel export. Chalkvault reads only the header row with AI to match columns to your score sheet, then matches students by admission number or name for you to check before saving.',
  },
  {
    q: 'Can we print with our own letterhead?',
    a: 'Yes. Upload your crest in Settings. Report cards, broadsheets, timetables, fees statements, receipts, class lists and the termly overview all print under your school’s name, motto and contact details, and every list exports to Excel.',
  },
  {
    q: 'How do terms and sessions work?',
    a: 'Each term has its dates and a status. Closing a term checks for missing scores, unapproved comments and unpublished results, saves the term’s figures and locks its records. Anyone can look back at an earlier term, and third term report cards show the cumulative result with your promotion rule.',
  },
  { q: 'What does it cost?', a: 'Chalkvault is free during the pilot, and the code is open source under the Apache 2.0 licence.' },
];

export function Landing() {
  const { user } = useAuth();
  const signedIn = !!user && !user.isAnonymous;
  return (
    <div className="landing">
      <header className="lp-nav">
        <Link to="/" className="wordmark">
          Chalkvault
        </Link>
        <nav className="lp-links">
          <a href="#how">How it works</a>
          <a href="#privacy">Privacy</a>
          <a href="#features">Features</a>
          <a href="#faq">FAQ</a>
        </nav>
        <div className="lp-cta">
          {signedIn ? (
            <Link to="/schools" className="pill ghost">
              Open my school
            </Link>
          ) : (
            <Link to="/login" className="pill ghost">
              Sign in
            </Link>
          )}
          <Link to="/start" className="ticket">
            Register your school
          </Link>
        </div>
      </header>

      <section className="lp-hero">
        <div className="lp-hero-copy">
          <h1 className="lp-display">Run the whole school, with a private AI.</h1>
          <p className="lede">Admissions, registers, scores, report cards, fees, timetables and the principal’s dashboard in one place. The AI that helps runs on the teacher’s own laptop, so children’s names stay in school.</p>
          <div className="lp-hero-actions">
            <Link to="/start" className="ticket">
              Register your school
            </Link>
            <Link to="/demo" className="pill ghost">
              Try the demo school
            </Link>
          </div>
        </div>
        <HeroSheet />
      </section>

      <section className="lp-problem">
        <p>
          Most schools still run on exercise books, Excel sheets and WhatsApp groups. At report time teachers paste notes, names and all, into chatbots to keep
          up. Chalkvault brings the records together and gives staff the same AI help without a child’s name ever reaching the cloud.
        </p>
      </section>

      <section className="lp-section" id="how">
        <h2 className="lp-h2">From day one to the end of the session</h2>
        <ol className="lp-steps">
          <li>
            <span className="step-no">1</span>
            <h3>Set up, or bring in what you have</h3>
            <p>Pick classes, arms and subjects from ready lists, or photograph your class lists, score sheets and fee ledgers. Gemini Nano sorts and reads them on the laptop for you to check.</p>
          </li>
          <li>
            <span className="step-no">2</span>
            <h3>Run the term</h3>
            <p>Teachers take registers and enter scores; bursars raise invoices and record payments; parents get messages in their own language. The principal sees it all on one dashboard.</p>
          </li>
          <li>
            <span className="step-no">3</span>
            <h3>Close the term, look back</h3>
            <p>Comments, report cards and broadsheets, published to parents by PIN. Closing a term saves its figures, so you can compare term against term and year against year.</p>
          </li>
        </ol>
      </section>

      <section className="lp-section lp-privacy" id="privacy">
        <div>
          <h2 className="lp-h2">The AI works with notes, never with names.</h2>
          <p className="lede">
            Records live in your school’s private space, and only staff you invite can open them. Writing comments happens on the teacher’s computer with Gemini
            Nano, Chrome’s built-in AI. Anything that does need the cloud, like a Yoruba translation for a parent, has every name swapped for a placeholder
            first, and the teacher sees exactly what will be sent.
          </p>
          <ul className="lp-ticks">
            <li>Names, notes and gradebook photos are read on-device</li>
            <li>Cloud requests carry placeholders like [STUDENT], never names</li>
            <li>Every request is logged in the school’s audit ledger</li>
            <li>Switch the cloud off entirely if you prefer</li>
          </ul>
        </div>
        <PrivacyDiagram />
      </section>

      <section className="lp-section" id="features">
        <h2 className="lp-h2">What’s inside</h2>
        {GROUPS.map((g) => (
          <div key={g.title} className="lp-group">
            <h3 className="lp-group-title">{g.title}</h3>
            <div className="lp-features">
              {g.items.map((f) => (
                <article key={f.title} className={`lp-feature ${f.soon ? 'soon' : ''}`}>
                  <h3>{f.title}</h3>
                  {f.soon && <span className="soon-tag">Coming soon</span>}
                  <p>{f.body}</p>
                </article>
              ))}
            </div>
          </div>
        ))}
      </section>

      <section className="lp-section lp-offline">
        <div className="lp-offline-card">
          <h2 className="lp-h2">Works with the Wi-Fi off</h2>
          <p>
            Records are cached in the browser, and Gemini Nano runs locally, so a teacher can write a whole class’s comments with the Wi-Fi off. Changes sync
            when the connection comes back.
          </p>
        </div>
        <div className="lp-who">
          <div>
            <h3>For school owners and heads</h3>
            <p>A dashboard of attendance, results, fees and staff progress against last term, a morning brief written from your own figures, and control over who sees what.</p>
          </div>
          <div>
            <h3>For teachers and bursars</h3>
            <p>Your classes, registers and score sheets, first drafts of every comment, lesson notes and quizzes. Bursars get invoices, receipts read from photos and a fees statement to print.</p>
          </div>
        </div>
      </section>

      <section className="lp-section" id="faq">
        <h2 className="lp-h2">Questions schools ask</h2>
        <div className="lp-faq">
          {FAQ.map((f) => (
            <details key={f.q}>
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="lp-final">
        <h2 className="lp-display small">Give your teachers their evenings back.</h2>
        <div className="lp-hero-actions">
          <Link to="/start" className="ticket">
            Register your school
          </Link>
          <Link to="/demo" className="pill ghost">
            Try the demo school
          </Link>
        </div>
      </section>

      <footer className="foot">
        <span>Chalkvault, built with Firebase AI Logic and Gemini Nano</span>
        <a href="https://github.com/efeaizesogie/chalkvault" target="_blank" rel="noreferrer">
          Open source (Apache-2.0)
        </a>
      </footer>
    </div>
  );
}

function HeroSheet() {
  return (
    <div className="hero-sheet" aria-label="Example: a class sheet with an on-device comment">
      <div className="hs-head">
        <span className="mono">Mathematics, first term</span>
        <b>Primary 5 Maths</b>
      </div>
      <ol className="hs-rows">
        <li>
          <span className="mono">01</span>Adaeze Okafor<span className="mono">Final</span>
        </li>
        <li className="on">
          <span className="mono">02</span>Tunde Bakare<span className="mono">Drafted</span>
        </li>
        <li>
          <span className="mono">03</span>Maya Chen<span className="mono">Notes</span>
        </li>
      </ol>
      <div className="hs-note">
        <span className="mono">Your notes</span>
        <p>lazy. hw rarely in. BUT built the best fractions model in the class project…</p>
      </div>
      <div className="hs-comment">
        <span className="stamp device">
          On this device, nothing sent
        </span>
        <p>
          Tunde built the strongest fractions model in our class project and explained it brilliantly to younger visitors. Handing homework in every week
          and showing his working will help his marks match his understanding.
        </p>
      </div>
    </div>
  );
}

function PrivacyDiagram() {
  return (
    <figure className="pd">
      <div className="pd-box device">
        <span className="mono">The teacher’s laptop, in Chrome</span>
        <b>Gemini Nano</b>
        <p>“Tunde Bakare: lazy, hw rarely in, best fractions model…”</p>
        <span className="stamp device">
          Names stay here
        </span>
      </div>
      <div className="pd-arrow" aria-hidden>
        <span className="mono">only placeholders cross</span>
      </div>
      <div className="pd-box cloud">
        <span className="mono">The cloud, for translation</span>
        <b>Gemini</b>
        <p>“[STUDENT] built the strongest fractions model in our class…”</p>
        <span className="stamp cloud">Names removed</span>
      </div>
      <figcaption className="muted small">What the cloud receives when a teacher asks for a parent translation.</figcaption>
    </figure>
  );
}
