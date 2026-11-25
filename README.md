# Chalkvault

**Run the whole school, with a private AI.** Admissions, registers, scores, report cards, fees, timetables, parent messages and the principal's dashboard in one place, for Nigerian primary and secondary schools. The AI that helps runs on the teacher's own laptop, through **Firebase AI Logic hybrid inference** with **Gemini Nano in Chrome**, so children's names stay in school.

- **Live:** https://efeaizesogie.github.io/chalkvault/ (choose **Try the demo school**; no sign-up)
- **Demo video:** see the Devpost entry (3 minutes or less)
- Built for Google's #BuildHybridAI hackathon. Apache-2.0.

## Why

Most Nigerian schools still run on exercise books, Excel sheets and WhatsApp groups. At report time, teachers paste rough notes, names and all, into public chatbots to keep up. Chalkvault brings the records together and gives staff the same AI help, but **the work that touches a child's name runs on the device**. Only name-free work goes to the cloud, and every request is shown in a ledger.

## For judges: a two-minute tour

1. Open the live site in **desktop Chrome** and click **Try the demo school**. A school with 84 students, 12 arms and 15 staff opens in about 5 seconds.
2. The chip at the top right says **Gemini Nano ready** when on-device AI is available (see "On-device setup" below). Without it, every feature still works through the cloud path, with names removed first.
3. On the **Overview**, click **Write this morning's brief**.
4. Open **Classes → Primary 5A → Form comments**, pick a student and click **Write comment**. Then use **Translate for parents → Yoruba** to see exactly what leaves the device before it is sent.
5. Open **Bring in records** and drop in a photo of a handwritten class list.
6. Click **Ledger** (top right) to see every AI request, where it ran and what was sent.

Measured on a 2018 laptop (i7-8750H, 16 GB RAM, Gemini Nano on the CPU path in Chrome 158):

| Task | Where it ran | Time |
|---|---|---|
| Morning brief | On-device | 89 s |
| Report comment, streamed | On-device | about 90 s |
| Yoruba translation of a comment | Cloud, names removed | 2.4 s |
| Handwritten register photo, 8 students | On-device | 138 s |
| Parent message template | On-device | about 30 s |

A newer laptop with a supported GPU is several times faster.

## The school platform

Chalkvault is now a multi-school records system. Each school registers its own private space in Cloud Firestore, and security rules (`firestore.rules`) limit each teacher to their own classes.

- **Setup and staff:** a setup wizard with country presets (Nigeria, Ghana, Kenya, UK, US); invite links; owner, admin and teacher roles.
- **Student records:** profiles, guardians and the language each family reads in, plus every term's comment.
- **Attendance:** a one-tap daily register with term totals. A photographed paper register is read **on-device only** (`ONLY_ON_DEVICE`, image + JSON schema), because a register shows every child's name.
- **Gradebook:** CA and exam scores, totals, WAEC (A1–F9) or letter grades, positions, class average and a printable broadsheet.
- **Report comments:** streamed as they're written (`generateContentStream`, on-device or cloud). Grounded in the student's score and attendance. Each also carries an on-device **support flag** (enum output) for head-teacher follow-up.
- **Approval:** teachers send comments for approval; owners and admins approve, which locks the record (enforced in the rules). A school-set character limit applies.
- **Parents:** French and Spanish are translated **on-device** (`expectedOutputs`). Other languages go to the cloud after names are removed. **Share on WhatsApp** from the record.
- **Ledger:** every AI request, where it ran, and what (if anything) left the device.

The research behind these choices is in [RESEARCH.md](RESEARCH.md).

### v4: day to day, term to term, year to year ([REPORT-production.md](REPORT-production.md))
- **Bring in your records:** photograph class lists, score sheets, fee ledgers and staff lists, handwritten or typed, or drop in PDFs (each page is turned into an image in the browser with pdf.js), Excel and CSV. Gemini Nano first sorts each page (enum output), then reads it into JSON shaped for that kind of page, **on-device only** (`ONLY_ON_DEVICE`), one page at a time. A review screen merges pages, matches arms, spots children already on the roll and highlights fields that were hard to read. Nothing is saved until the admin says so.
- **Principal's dashboard:** attendance week by week and by arm, subject and arm averages, grade spread, students by level, fees by arm, staff progress, and students who need attention, each against last term. Every chart has a table view.
- **Morning brief and "Explain this":** a short streamed read of where the school stands, written from the dashboard's own figures by Gemini Nano on the device, or in the cloud with every name coded first.
- **Terms and sessions:** dates and status for each term, a switcher to look back at any term, a close-term checklist that saves the term's figures, and closed terms locked by the security rules.
- **Third term:** cumulative results on the report card and a school-set promotion rule (pass mark plus credits in named subjects) that flags students to repeat.
- **Parents' portal:** attendance and fee balance beside the report card.
- **Guided setup** for schools starting from scratch.

### v3: the rest of a school system ([FEATURES-GAP.md](FEATURES-GAP.md))
- **Ask Chalkvault:** staff ask questions about attendance, results, fees and follow-ups.
  - Figures are compiled in the browser.
  - Gemini Nano streams the answer on-device (`PREFER_ON_DEVICE`, `generateContentStream`).
  - On the cloud path, every first name, surname and full name becomes a code like `[S7]` and is restored locally.
- **Fees:**
  - fee items per class, optional levies
  - sibling, staff and scholarship discounts
  - part payments, arrears carried across terms, receipts
  - collection dashboard and a **bursar** role
  - **Receipt photo reading:** `ONLY_ON_DEVICE` image to JSON for teller, transfer and POS slips.
- **Messages to parents:**
  - Absence, fees, results and custom messages.
  - One placeholder template (no names, `PREFER_ON_DEVICE`) is translated per family language: on-device for fr/es/de/ja via `expectedOutputs`, cloud for Yoruba, Hausa and Igbo. Translations are checked to keep every placeholder.
  - Names and amounts are filled in locally; sent by WhatsApp or SMS CSV.
- **Lesson notes** (streamed) and **quizzes** (structured JSON with `responseConstraint` on-device), with CBT CSV export.
- **Admissions:** public application form and accept-and-enrol.
- **Timetable:** clash-free generator.
- **Records and operations:** behaviour and health log, library, transport, inventory, staff leave, alumni, end-of-session promotion.
- **Data and devices:** full data export, installable web app.

### v2: run the way Nigerian schools run ([PLAN-v2.md](PLAN-v2.md))
- **Classes, arms and subjects:** JSS 1A, JSS 1B…, each with subject offerings. Electives can have chosen students.
- **Form teachers and subject teachers:** each subject teacher sees only their subjects and those students. Enforced in `firestore.rules`.
- **School rules in Settings:**
  - who takes attendance (form teacher daily, per lesson, or admins)
  - one or many form classes per teacher
  - whether teachers manage students
  - approval, subject remarks, positions
  - cloud scanning (off by default)
  - score-sheet columns and grade bands
- **Score sheets:**
  - type scores directly
  - **scan a photo** with Gemini Nano (`ONLY_ON_DEVICE`; cloud only if the admin allows it)
  - **import a CBT export** (CSV/Excel). AI maps the columns from the header row only (`PREFER_ON_DEVICE`, no names), then students are matched by admission number or name.
- **Report cards:** every subject, positions, AI-drafted subject remarks and principal's comments (name-free prompts), attendance, next term date. Print a whole arm.
- **Results portal (`/results`):** admins publish; each student has a private result PIN printed on a slip. Parents view and print without an account.
- **Dashboards:**
  - Admin: attendance today, score-entry progress, comments and approvals, staffing gaps, follow-ups, notices.
  - Teacher: my subjects, my form class, notices.

## How the hybrid inference works

`src/lib/ai.ts`

| Task | Firebase AI Logic mode | What it sees |
|---|---|---|
| Write a comment (single or batch) | `PREFER_ON_DEVICE`, streamed, with `responseConstraint` JSON schema on-device and `responseSchema` in the cloud | **On-device:** real name, raw notes, photo. **Cloud fallback** (no Nano, teacher allowed it): the de-identified notes only; photos are refused. |
| Support flag on each comment | `PREFER_ON_DEVICE`, enum output | The comment, on the same path |
| Register, score-sheet and receipt photos | `ONLY_ON_DEVICE`, image to JSON | The photo; cloud only if the owner turns on cloud scanning |
| Bring in records (photos and PDF pages) | `ONLY_ON_DEVICE`: enum to sort the page, then JSON for that kind of page | One page at a time |
| Morning brief, "Explain this", Ask Chalkvault | `PREFER_ON_DEVICE`, streamed | Figures worked out in code; on the cloud path every name becomes a code like `[S7]` |
| Parent message template | `PREFER_ON_DEVICE` | No names: placeholders only, filled in locally |
| Parent translation | On-device for French and Spanish (`expectedOutputs`); `ONLY_IN_CLOUD` for Yoruba, Hausa, Igbo and others | The finished text with `[STUDENT]` placeholders |
| Align to standards | `ONLY_IN_CLOUD` (JSON output) | Same de-identified comment |
| Lesson notes and quizzes | `PREFER_ON_DEVICE`; quizzes in batches of five with a cloud fallback | No student data |
| CBT column mapping | `PREFER_ON_DEVICE` | The header row only |

**Privacy router:** before each comment, Chalkvault checks `LanguageModel.availability()` with the same options the SDK uses.
- If Gemini Nano is available, the SDK runs the request on-device, and the real name is used.
- Otherwise Chalkvault de-identifies the notes locally (`src/lib/redact.ts`) before the request is built. Whichever way the SDK routes it, no name can leave the device.
- The teacher can switch the cloud fallback off completely.

Every result carries a visible **On this device** or **Cloud · names removed** stamp, taken from the SDK's `inferenceSource`.

Prompts are capped at 2,400 characters of notes plus a 1024px JPEG, well within Gemini Nano's 9,216-token limit.

## Run it

```bash
npm install
npm run dev     # http://localhost:5178
```

1. Create a Firebase project. Enable **Firebase AI Logic** with the Gemini Developer API and register a web app.
2. Copy `.env.example` to `.env.local` and fill in the web config and your App Check (reCAPTCHA Enterprise) site key. For GitHub Pages, add the same `VITE_*` values as repository secrets; the deploy workflow passes them to the build.
3. On localhost, App Check uses a debug token. Copy the token printed in the console into Firebase console → App Check → Manage debug tokens.

### On-device setup

To get on-device inference, use desktop Chrome with Gemini Nano:
- Chrome 139+ with these flags enabled:
  - `chrome://flags/#prompt-api-for-gemini-nano`
  - `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input`
  - `chrome://flags/#optimization-guide-on-device-model`
- Hardware: 22 GB free disk, and 16 GB RAM or a GPU with more than 4 GB VRAM.
- Click the status chip in the app to download the model.

Without Nano, Chalkvault still works through the names-removed cloud path.

## Stack

Vite + TypeScript + React, Firebase JS SDK v13 (`firebase/ai`, `firebase/app-check`), `idb`. Design notes are in [DESIGN.md](DESIGN.md).

## License

Apache-2.0
