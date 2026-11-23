import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';

const FEATURES: { title: string; body: string; soon?: boolean }[] = [
  { title: 'Your school, your private space', body: 'Register once and set up terms, class levels and subjects. Every school is a separate, locked space.' },
  { title: 'Staff and roles', body: 'Invite teachers with a private link. Teachers only see the classes you assign them; owners and admins see everything.' },
  { title: 'Classes and student records', body: 'Profiles, admission numbers, guardians and the language each family reads in, all in one record per child.' },
  { title: 'Report comments, written on the laptop', body: 'Type rough notes or photograph your gradebook. Gemini Nano in Chrome turns them into a warm, specific comment you can edit.' },
  { title: 'A whole class in one click', body: 'Batch-write comments for every student. On-device writing costs nothing per comment and works with the Wi-Fi off.' },
  { title: 'Parents in their own language', body: 'Translate finished comments into Yoruba, Hausa, Igbo, Spanish, French and more, after every name is removed.' },
  { title: 'Reports by term', body: 'Each student keeps a record of every term’s comment. Print report pages or export a class to CSV.' },
  { title: 'An audit ledger', body: 'Every AI request is logged: where it ran, and exactly what (if anything) left the device.' },
  { title: 'Student files', body: 'Upload past reports, certificates and forms to a student’s record.', soon: true },
  { title: 'Attendance and gradebook', body: 'Daily registers and scores that feed straight into report comments.', soon: true },
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
          <h1 className="lp-display">School records with a private AI.</h1>
          <p className="lede">Classes, students and report comments, drafted on the teacher’s own laptop.</p>
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
          At report time a teacher writes a comment for every child. To keep up, many paste their notes, names and all, into a chatbot. Many schools and
          districts now forbid it. Chalkvault gives teachers the same help without the child’s name ever reaching the AI.
        </p>
      </section>

      <section className="lp-section" id="how">
        <h2 className="lp-h2">From a blank school to finished reports</h2>
        <ol className="lp-steps">
          <li>
            <span className="step-no">1</span>
            <h3>Set up your school</h3>
            <p>Name it, pick your country, and Chalkvault suggests class levels, term names and subjects. Change anything.</p>
          </li>
          <li>
            <span className="step-no">2</span>
            <h3>Invite staff, add students</h3>
            <p>Send teachers a private invite link and assign their classes. Paste a class list to create student records.</p>
          </li>
          <li>
            <span className="step-no">3</span>
            <h3>Write and export reports</h3>
            <p>Teachers jot notes, Gemini Nano drafts each comment on their laptop, and you print or export the term’s reports.</p>
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
        <div className="lp-features">
          {FEATURES.map((f) => (
            <article key={f.title} className={`lp-feature ${f.soon ? 'soon' : ''}`}>
              <h3>{f.title}</h3>
              {f.soon && <span className="soon-tag">Coming soon</span>}
              <p>{f.body}</p>
            </article>
          ))}
        </div>
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
            <p>One place for classes, staff and student records, with control over who sees what and an audit ledger of AI use.</p>
          </div>
          <div>
            <h3>For teachers</h3>
            <p>Your classes, your notes, and first drafts of every comment in your tone and reading level. You always edit and approve.</p>
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
