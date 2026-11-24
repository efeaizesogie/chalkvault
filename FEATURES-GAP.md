# What a school platform must have vs what Chalkvault has (2026-11-24)

Sources:
- The guides the user shared: Scholaria, JibuERP, Dotcube, ThinkWave, Skolera.
- The Edves buyer's guide for Nigeria.
- Eduka's 10 must-haves.
- Classe365's 20 essential features.
- PowerSchool's site couldn't be read automatically. From general knowledge, it sells SIS, LMS (Schoology), enrolment, finance/HR, analytics, and an AI assistant called PowerBuddy.

## Already in Chalkvault
- **SIS:** profiles, guardians and languages, arms, subjects, electives.
- **Attendance:** daily or per lesson, plus an on-device register photo reader.
- **Gradebook:** custom columns, WAEC grades, positions, broadsheet. Score-sheet photo scan, CBT import.
- **Report cards:** subject remarks, form and principal comments, approval, printing.
- **Parent results portal** by PIN.
- **Roles:** owner, admin, form teacher, subject teacher. School rules. Notices. Dashboards.
- **AI audit ledger.**

## Missing, ranked for Chalkvault
"AI showcase" means how strongly it shows Firebase AI Logic hybrid inference, which is the judging criterion that decides the winner.

| # | Feature | Why schools need it | AI showcase | Effort |
|---|---|---|---|---|
| 1 | **Fees and payments**: fee items per class, sibling and staff discounts, part payments, arrears carried across terms, receipts, balances, collection dashboard | Edves: "the fastest way to eliminate unsuitable vendors", the #1 reason Nigerian schools abandon systems | **High.** Photograph a bank teller or transfer receipt; Gemini Nano reads payer, amount and date **on-device** (names never leave) and matches it to the student | Medium |
| 2 | **Ask Chalkvault**: a school assistant for admins and teachers ("Which arm has the worst attendance this term?", "Who is failing Maths?") | Every guide asks for analytics dashboards; PowerSchool's PowerBuddy | **Very high.** Figures are computed in the browser; Gemini Nano answers **on-device**. The cloud fallback gets only aggregates with names removed | Medium |
| 3 | **Parent messages**: absence alerts, fee reminders, result-ready notices, in the parent's language, sent by WhatsApp or SMS | All five sources: automated messaging, WhatsApp in Nigeria | **High.** AI drafts each message; French and Spanish on-device, Yoruba, Hausa and Igbo in the cloud from a name-free template, with the name filled in locally | Low |
| 4 | **Promotion to the next session** (JSS 1A to JSS 2A, graduate the last class) | Scholaria and JibuERP: promotions; Edves: sessions | None | Low |
| 5 | **Full data export** (CSV/JSON) for the NDPA and leaving the platform | Edves: "Who owns the data? … full export at termination" | None, but a trust point | Low |
| 6 | **Lesson notes and quiz generator** from the scheme of work | Scholaria: lesson plans, CBT; Edves: pedagogy with AI | **High.** No student data at all, so `PREFER_ON_DEVICE` with a cloud fallback; structured quiz JSON | Low–medium |
| 7 | **Behaviour and health log** per student | Classe365 #1 SIS; JibuERP: medical and discipline notes | Medium: an on-device summary of a student's incidents | Low |
| 8 | **Online admissions form**: applications, documents, review, enrol | Classe365 #5–8; Eduka #4 | Medium: on-device reading of a birth certificate or previous report photo | Medium |
| 9 | Timetable generation without clashes | Scholaria, Classe365 #4 | Low (a solver, not AI) | High |
| 10 | Staff leave and HR, library, transport, inventory, alumni, e-signature, mobile app | Add-ons | Low | High |

## How Chalkvault would use Firebase AI Logic (the deciding factor)
One rule is visible everywhere: **anything with a child's name runs on-device, and anything that goes to the cloud carries no name.**

| Capability | Where |
|---|---|
| `PREFER_ON_DEVICE` with a de-identified fallback | Comments, remarks, CBT column mapping, Ask Chalkvault, parent messages, lesson notes |
| `ONLY_ON_DEVICE` multimodal (image to JSON) | Register photo, score-sheet photo, **payment receipt photo**, admission documents |
| Structured output (JSON schema, enums) on-device | Comments + support flag, register, score sheet, receipts, quiz questions |
| Streaming (`generateContentStream`) | Comments, **Ask Chalkvault answers**, lesson notes |
| On-device output languages (fr, es, de, ja) | Parent translations and messages |
| `ONLY_IN_CLOUD` on de-identified text | Yoruba, Hausa and Igbo, standards alignment |
| App Check, audit ledger of every request | Throughout |

## Recommended for this week
Build **1–6** (fees with receipt reading, Ask Chalkvault, parent messages, promotion, export, lesson notes and quizzes).

Defer 7–10 and list them as "Coming soon" on the landing page.

Leave a day for the Devpost text, the video and the on-device recording.
