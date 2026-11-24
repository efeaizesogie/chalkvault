# Chalkvault: how a real school would use it, what's missing, and what to build next

Prepared 2026-11-24, six days before the deadline (Nov 30, 11:00 PM Lagos).

## 1. The short version
Chalkvault now has the breadth of a school system: records, classes, attendance, scores, report cards, results by PIN, fees, messages, lessons, admissions, timetable and operations. What it lacks is the **shape of a school year**. Today it behaves like a set of modules that all point at "the current term".

A real school lives in a rhythm: resumption week → daily registers → CA weeks → mid-term → exams → result computation → publishing → PTA → vacation, three times a year, then promotion. Managers need to look back across terms and years. The four biggest gaps:

1. **Getting a school's existing data in.** Today it's typing or CSV only. Schools' real data lives in exercise books, Excel sheets, photographed broadsheets and PDFs.
2. **Term and session history.** You can't look at last term without switching the whole school's current term, and there's no term-on-term or year-on-year comparison, no cumulative (annual) result, and no promotion rule.
3. **A principal's dashboard with trends.** Today's overview shows four numbers for this term. A manager needs trends, comparisons and "what needs my attention".
4. **Production hardening.** Error handling, cost-safe data loading, enforced App Check, cleanup of demo schools, and tests for the security rules.

Each one is also an opportunity to use Firebase AI Logic hybrid inference visibly, which is what the judges score.

## 2. How the platform is used: a year in a Nigerian school

| When | Who | What they do in Chalkvault | AI involved |
|---|---|---|---|
| **Before first use** | Owner | Register → **import existing records** (photos, PDFs, Excel) or start from scratch → set rules → invite staff | Document import (on-device) |
| **Resumption week** | Admin, bursar | Start the term, set term dates, generate invoices, publish the timetable, post the welcome notice, enrol new admissions | Fee reminders in each family's language |
| **Every morning** | Form teachers | Take the register (one tap, or photograph the paper one) | Register photo (on-device) |
| **Every morning** | Principal | Open the overview: who hasn't taken the register, absences, today's notices | **Morning brief** (on-device) |
| **Daily** | Admins | Message parents of absent children | Absence messages (name-free template, translated) |
| **Weekly** | Subject teachers | Lesson notes, class quizzes | Lesson notes and quizzes (hybrid) |
| **Weekly** | Bursar | Record payments as tellers arrive | Receipt reading (on-device) |
| **CA weeks (4 and 8)** | Subject teachers | Enter CA 1 and CA 2: type them, scan the paper sheet, or import from the CBT | Score-sheet scan (on-device); CBT column mapping (headers only) |
| **Mid-term** | Principal | Mid-term review: attendance and CA trends, at-risk students; message parents | Ask Chalkvault, follow-up flags |
| **Exams (weeks 10–11)** | Exam officer, teachers | Exam scores in, broadsheets checked | Scan, import |
| **Result week** | Form teachers, principal | Form comments, principal's comments, approval, report cards printed, results published, PIN slips sent | Comments (on-device, streamed), remarks |
| **PTA / end of term** | Principal | Term summary to the board: performance, attendance, fees, staffing | **Term report** (AI-written from the term's figures) |
| **Close of term** | Admin | Close-term checklist: all scores in, comments approved, results published, fee balances carried forward. The term locks and stays viewable | Close-term assistant |
| **Third term** | Admin | Cumulative (annual) results across three terms, promotion by the school's rule, graduation, start the new session | Promotion suggestions, explained |
| **Any time** | Everyone | Look back at any earlier term or session, read-only | Ask Chalkvault on any term |

## 3. Onboarding: two paths

### Path A: from existing documents (the AI path)
For schools with records in exercise books, Excel, PDFs or photos.

1. **Drop everything in.**
   - Photos (JPEG/PNG) of class lists, registers, broadsheets, admission forms, fee ledgers, staff lists.
   - PDFs: typed or scanned. The browser turns each page into an image.
   - Excel and CSV files are read directly.
2. **Gemini Nano sorts each page, on the device.**
   - It classifies each page (enum output): class list, register, score sheet or broadsheet, student bio-data form, fee ledger, staff list, timetable, or other.
   - Then it extracts the page into JSON with the right shape for that kind. Every page has children's names on it, so this runs **`ONLY_ON_DEVICE`**. The cloud is used only if the owner allows it, with a clear warning.
   - Pages are processed one at a time so each stays inside Nano's 9,216-token limit, with a progress bar.
3. **Review before anything is saved.** A staging screen shows each proposed item next to a thumbnail of the page it came from:
   - students with arm, guardian and phone
   - inferred classes, arms and subjects
   - scores per subject and term
   - opening fee balances
   - staff
   Possible duplicates are matched by admission number, then by name, and the admin decides on each. Low-confidence fields (common with handwriting) are highlighted.
4. **Apply.** Arms, subjects, students, scores and balances are created in one go, and the ledger records that it all ran on-device.

Why this wins: it turns the hardest part of switching systems into a few minutes. Reviews of other systems name migration as the main reason implementations fail. And it shows hybrid multimodal AI doing real work, privately.

### Path B: from scratch (guided setup)
A setup checklist on the overview that stays until it's done:
1. **School details and rules.** Name, address, motto, principal, and every policy. Already built.
2. **Classes, arms and subjects.** Wizard presets. Already built.
3. **Term calendar.** Session, three terms, resumption, mid-term, exam weeks, closing date. New.
4. **Staff.** Invite, then assign form classes and subjects. Already built.
5. **Students.** Paste names, upload a CSV, or **photograph a class list** (on-device). The photo option is new.
6. **Fees.** Items, discounts, opening balances. Already built.
7. **Go live.** Generate invoices, publish the timetable, post a welcome notice.

## 4. Terms and sessions (new model)
- **Session** (2026/2027) contains **First, Second and Third term**, each with dates and a **status**: *planned → open → results → closed*.
- **"Viewing" term switcher for every user.** Anyone can look at any earlier term, read-only, without changing the school's current term. Closed terms are locked by the security rules.
- **Close-term checklist.** Lists missing scores, unapproved comments and unpublished arms, and carries fee balances into the next term. The AI writes a short "what's left" summary.
- **Cumulative (annual) result in third term.** Average of the three terms per subject and overall, the way Nigerian schools present it, plus the school's **promotion rule** (e.g. a 50% cumulative average, the common Nigerian pass mark, plus credits in English and Mathematics for SS). The promotion tool uses it, with "suggested to repeat" flagged for review.
- **Term-on-term comparison** everywhere it matters: a student's record (subjects across terms), arm averages, the school dashboard.

## 5. The principal's dashboard (with charts)
Charts are small, fast inline graphics in the app's own style.

| Area | Metrics | Chart |
|---|---|---|
| **Today** | Registers taken vs due, present %, absentees, staff on leave, the AI morning brief | Checklist + one-line brief |
| **Enrolment** | Total, by class level, new admissions, withdrawals, boys and girls | Bars by level; trend across terms |
| **Attendance** | This term %, weekly trend, by arm, chronic absentees (below 90%) | Weekly line; arm-by-week heat grid |
| **Academics** | School average, by subject, by arm, grade spread A1–F9, at-risk students, most improved | Subject bars; grade-spread stacked bar; **this term vs last term** |
| **Fees** | Collected vs expected, weekly collection, owing by age (0–30, 31–60, 60+ days), by arm | Progress bar; weekly line; ageing bars |
| **Staff work** | Score-sheet completion per teacher, comments written and approved, register compliance | Completion bars per teacher |
| **Operations** | Pending applications, pending leave, low stock, overdue library books | Counts with links |
| **Term comparison** | Choose two terms: attendance, averages, fees collected, enrolment side by side | Grouped bars |

**AI on the dashboard (the showcase):**
- **Morning brief and term report.** Gemini Nano writes four lines from the dashboard figures, streaming on the device, e.g. "JSS 2B attendance fell 9 points this week; 3 arms haven't entered CA 2 for Mathematics; fee collection is 12 points behind last term at this week." On the cloud path names are coded, as in Ask Chalkvault.
- **"Explain this"** on any chart: a single on-device answer about that chart's figures.
- **Ask Chalkvault on any term**, so "how did JSS 1 do this term compared with last?" works.

## 6. Compared with other platforms
Products checked: Edves, SAFSMS, FlexiSAF, Arbor, Bromcom, PowerSchool, Classe365, Eduka, Fedena/OpenSIS. Vendors publish little detail, so much of this comes from review sites (Capterra, G2), support docs and the Nigerian press. Edves, Schoolable and Termly specifics are mostly unverified.

| Area | What the others do | Where Chalkvault stands | Opportunity |
|---|---|---|---|
| **Getting data in** | Spreadsheet templates and CSV import (Arbor's Entity Importer). Bromcom offers vendor-led migration from other systems. **No mainstream product reads paper or scanned records with AI**; schools buy separate OCR tools (ABBYY, Nanonets, Klippa). Dirty data takes days to weeks; reviews blame brittle importers and duplicates | CSV and CBT import only | **AI document import is open ground.** Building it on-device is both a real differentiator and the best hybrid demo |
| **Principal dashboards** | Attendance and trend, performance by class and subject, fees vs target, enrolment, behaviour, at-risk students, staff attendance, **comparison with past terms** (Bromcom), revenue vs spending | Four numbers for this term, approvals, follow-ups | Trend charts, term comparison, staff work, AI brief (section 5) |
| **Terms and cumulative results** | Year rollover and term benchmarks (UK). In Nigeria the **cumulative result** (average of three terms) decides promotion; a typical pass mark is 50%; SS often requires credits in English, Maths and 3 majors. FlexiSAF and SAFSMS sell on automated result computation and transcripts; promotion-rule engines look under-built | One current term; no cumulative result; manual promotion | Term model, cumulative results, school-set promotion rule (section 4) |
| **Daily workflow** | Register, CA weeks, exams, result computation, PTA broadcasts (Edves sent 450k SMS in 2021) | Register, scores, results, messages are in; no term calendar | Term calendar and close-term checklist |
| **Offline** | The main African weak spot; most cloud systems fail on poor connections | Firestore offline cache, on-device AI, installable app | Say so loudly: **comments, registers and scans work with the Wi-Fi off** |
| **Mobile** | Native apps are expected (Edves, Classe365) | Installable web app, works on phones | Good enough this week |
| **SMS** | Bulk SMS ≈ ₦1.70–₦2.50 per message, sender ID and DND rules, fines for breaking them | WhatsApp links and SMS CSV | Keep: no cost to the school, and Chalkvault holds no SMS liability |
| **Data protection** | NDPA 2023 + GAID 2025: impact assessments, encryption, access control, data-subject access and deletion | Role rules, export, delete school, AI audit ledger, names kept off the cloud | Add a short **NDPA page** (what we store, where, who sees it, how to export and delete) |
| **Reliability** | SAFSMS reviews: slow, reloads lose work, aggressive timeouts, heavy data use when printing, failed uploads, support 2/5 | Live sync, offline cache, scores saved per cell | **"Never loses a score"** is a real selling point; make sure every editor autosaves |

**Net:** Chalkvault can already beat incumbents on privacy, offline use and AI writing. The two gaps that most separate it from a real school system are **term history with cumulative results** and **getting existing records in**. The second is where no one else has an answer.

## 7. Production readiness: gaps found in the code audit

| Severity | Gap | Fix |
|---|---|---|
| High | **No error boundaries**: a crash in one panel blanks the screen | Add error boundaries per page with a friendly retry |
| High | **Dashboards, Ask Chalkvault, fees and alumni load whole collections**. At 1,000 students one admin visit reads thousands of documents, and Firebase's free tier allows 50,000 reads a day | A **term summary document** per arm, rebuilt when scores or attendance change (client-side, no paid Cloud Functions); pagination on long lists |
| High | **App Check not enforced**; the public admissions form could be spammed | Turn on enforcement for Firestore and AI Logic; App Check on the apply page |
| High | **No tests for the security rules** | Rules tests with the Firestore emulator for every role (owner, admin, bursar, form teacher, subject teacher, parent) |
| Medium | **One global current term**; no read-only past terms | Term model in section 4 |
| Medium | **Demo schools pile up** (one per visitor) | Expire demo schools after 7 days; one per browser |
| Medium | **No audit of record edits** (who changed a score) | Write `updatedBy`/`updatedAt` everywhere (mostly done) and show "last changed by" on scores and comments |
| Medium | **Staff attendance** not tracked | A daily staff sign-in (admins) |
| Medium | **Parents only see results**, not attendance or fees | Extend the PIN portal: attendance summary, fee balance, notices for parents |
| Low | **Bulk WhatsApp is one tap per parent** | Keep (WhatsApp forbids automated sending without the Business API). Offer the SMS CSV for gateways like Termii |
| Low | **No online fee payment** | Paystack payment links later (needs the school's merchant account) |
| Low | No multi-campus view, no native app | Installable web app covers phones; multi-campus later |

## 8. How Firebase AI Logic is used, and the additions above

| Feature | Mode | Why it's a strong hybrid example |
|---|---|---|
| Report comments | `PREFER_ON_DEVICE`, streamed, JSON + enum | Names stay on-device; names removed on the cloud path |
| Register, score sheet and receipt photos | `ONLY_ON_DEVICE` image to JSON | Names never leave; cloud only with the owner's consent |
| **Document import (new)** | `ONLY_ON_DEVICE` image to enum (page type), then JSON | The flagship onboarding moment; multimodal, private |
| Ask Chalkvault | `PREFER_ON_DEVICE`, streamed | Every name part coded on the cloud path |
| **Morning brief, term report, "explain this" (new)** | `PREFER_ON_DEVICE`, streamed | AI on the screen the principal opens every day |
| Parent messages | `PREFER_ON_DEVICE` template; on-device or cloud translation with placeholder checks | Languages Nano supports run on-device |
| Lesson notes and quizzes | `PREFER_ON_DEVICE`, JSON | No student data |
| Subject and principal remarks | `PREFER_ON_DEVICE` | Name-free prompts |
| CBT column mapping | `PREFER_ON_DEVICE` | Headers only |

## 9. Recommended plan for the remaining days

| Day | Build | Why |
|---|---|---|
| **Nov 25** | Term model (viewing switcher, term status, close-term checklist) + **principal's dashboard with charts and term comparison** + **AI morning brief** | Answers "how is the school doing", and puts AI on the most-used screen |
| **Nov 26** | **AI document import** (photos and PDFs, classify, extract, review, apply) + guided setup checklist | The strongest demo moment and the biggest real-world barrier |
| **Nov 27** | Cumulative annual results and promotion rule; parent portal shows attendance and fees; production hardening (error boundaries, summary docs, App Check, demo expiry, rules tests) | Ready for real schools |
| **Nov 28** | **Record the on-device clips on the borrowed laptop**, fix what they reveal, write the Devpost text | Must happen with time to spare |
| **Nov 29** | Edit the 3-minute video, upload to YouTube, final deploy | |
| **Nov 30** | Buffer; submit before 11:00 PM Lagos | |

**Left out on purpose this week:** online payments (needs a merchant account), an SMS gateway (costs money per message), a native app, multi-campus, Google Drive import.
