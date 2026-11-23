# Chalkvault for schools: plan

Status: **draft for approval. Nothing is built yet.**

## 1. What it becomes (one line)

**Chalkvault is a school records system where every school runs its own private space for classes, students and files, and its AI never sees a child's name.**

The report-comment writer stays the headline feature. It becomes one module of a full school workspace instead of a single-teacher tool.

## 2. Who uses it

| Role | Can do |
|---|---|
| **School owner** (registers the school) | Set up the school, terms, class levels and subjects; invite staff; see everything; export; delete the school |
| **Admin / head teacher** | Same as the owner except deleting the school and changing billing (later) |
| **Teacher** | See and edit only the classes they are assigned to: students, notes, files, comments |
| *(Phase 3)* **Parent** | Read-only view of their own child's published report and translated comment |

## 3. Modules

**Phase 1: by the hackathon deadline (Nov 30)**
1. **Landing page**: public, explains the product accurately (see section 6).
2. **Register a school**: sign in (Google or email link), then a setup wizard:
   - school name, country, logo
   - terms or semesters
   - class levels (e.g. JSS1–SS3 or Grade 1–12)
   - subjects
3. **Staff**: invite teachers by email or invite link, assign roles, remove staff.
4. **Classes**: create classes per term, assign a form teacher and subject teachers, enrol students.
5. **Student records**: profile (name, preferred name, pronouns, date of birth, admission number), guardians (name, phone, email, preferred language), enrolment history, and private teacher notes per subject and term.
6. **Report comments** (today's feature, now saved to the record): on-device Gemini Nano drafts from notes or a photo; batch the whole class; cloud AI only on de-identified text for parent translation and standards alignment.
7. **Report export**: per student and per class (PDF, CSV), with school logo and the term's comments.
8. **Audit ledger**: per school, showing every AI request, where it ran, and what (if anything) left the device.
9. **Demo school**: "Try the demo school" with no sign-up, so judges can use it immediately.

**Phase 2: after the hackathon**
- **Student files**: uploads per student, e.g. past reports, certificates, medical forms (see decision C).
- Attendance register, gradebook (scores, then comments drawn from scores), timetable.
- Bulk import of students from CSV or Excel.

**Phase 3: later**
- Parent portal: published reports, translated comments.
- Analytics per class and term.
- Billing, if it ever charges schools.

## 4. Architecture

- **Front end:** the current Vite + React + TypeScript app, plus routing:
  - `/` landing
  - `/start` register a school
  - `/login`
  - `/s/:schoolId/...` the workspace
  - `/demo`
- **Sign-in:** Firebase Authentication (Google + email link). Free.
- **Data:** Cloud Firestore, one tenant per school:
  ```
  schools/{schoolId}
    members/{uid}            role, name, classIds[]
    invites/{code}
    terms/{termId}
    classes/{classId}        termId, level, teacherIds[]
    students/{studentId}     profile, guardians
      notes/{noteId}         subject, term, author (private to staff)
      comments/{termId}      draft, final, source, translations
      files/{fileId}         metadata (Phase 2)
    ledger/{entryId}
  ```
- **Security rules:** a user can read a school only if they are in its `members`. Teachers can only touch students in classes listed on their membership. Owner and admin see everything. Rules are tested with the Firestore emulator.
- **AI:** unchanged privacy router. The browser loads a student's notes, and Gemini Nano writes on the device. Cloud Gemini only receives de-identified text. App Check stays on.
- **Hosting:** move from GitHub Pages to **Firebase Hosting** (free tier), which handles app routes properly and sits on the same project.
- **Data protection stance:** we state what is true. Records are stored in the school's Firebase project region and access is limited by role. The AI never receives names. Each school can export or delete all its data. Relevant laws named on the landing page and FAQ: Nigeria's NDPA 2023, FERPA in the US, GDPR in the UK/EU. **We do not claim certification.**

### The honest trade-off
Today's pitch is "names never leave the device". A shared school system has to store names on a server so staff can share records. The new, still-true pitch is:

> **Your records live in your school's private space. Our AI never sees a child's name.**

The demo video keeps the airplane-mode moment: writing comments works offline on-device.

## 5. Free-tier limits that matter

- **Firestore (Spark plan):** about 50k reads and 20k writes per day, 1 GiB stored. Fine for a pilot of a few schools.
- **Auth:** free for email and Google sign-in.
- **Cloud Storage** (needed for student files) requires the **Blaze plan**, which means a card on file; usage within the free quota costs $0. That's why files are Phase 2 (decision C).
- **Gemini cloud via AI Logic:** free-tier quota. On-device calls cost nothing.

## 6. Landing page (accurate, no overclaiming)

Same design system (warm paper, serif, ruled lines, flat class colours, yellow ticket). Sections:
1. **Hero:** "Run your school's records. Write every report comment. Never hand a child's name to an AI." Main action: *Register your school*. Secondary: *Try the demo school*.
2. **The problem:** report season is hundreds of comments per teacher; teachers paste student notes into chatbots; districts ban it.
3. **How it works:** set up your school, then add classes and students, then write comments on-device and export reports.
4. **Privacy, drawn out:** a simple diagram. Notes and names stay with Gemini Nano in Chrome; only placeholder text like `[STUDENT]` goes to the cloud. A live sample of the "exactly what will leave this device" slip.
5. **What's inside:** records, classes, staff roles, report comments, parent translations (Yoruba, Hausa, Igbo, Spanish…), exports, audit ledger. Upcoming features are clearly labelled "Coming soon".
6. **Works offline:** browser requirements for on-device AI, stated plainly, with the names-removed cloud fallback.
7. **For whom:** school owners and heads, teachers.
8. **FAQ:** where data is stored, who can see it, what the AI sees, how to delete a school, cost (free during pilot), open source.
9. **Footer:** GitHub link, licence, contact.

## 7. Build order (Phase 1, ~6 days)

| Day | Work |
|---|---|
| Nov 24 | Routing, Firebase Auth, Firestore schema + security rules + emulator tests, school setup wizard |
| Nov 25 | Staff invites and roles, classes, student records UI |
| Nov 26 | Move comment writer onto Firestore records, per-term comments, batch, ledger per school |
| Nov 27 | Report export (PDF/CSV), demo school, landing page |
| Nov 28 | Firebase Hosting, polish, mobile check, README + Devpost text; **film on-device clip on borrowed laptop** |
| Nov 29 | Edit video, upload to YouTube, buffer for fixes |
| Nov 30 | Submit before 11:00 PM Lagos |

**Risk:** this is a big jump in a week. If we slip, the fallback is to submit the current working Chalkvault (already live) plus whatever modules are done, and keep building afterwards.

## 8. Decisions (made 2026-11-23)

- **A. Records:** in the cloud. Firestore, per-school tenant, shared by staff and limited by role.
- **B. Timing:** build Phase 1 for the Nov 30 submission, with the current live app as the fallback.
- **C. Files:** no uploads in Phase 1. Shown as "Coming soon"; no Blaze plan.
- **D. Sign-in:** Google + email link.
