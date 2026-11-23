# Research findings and build order (2026-11-23)

Two research passes:
1. What teachers, school admins and owners say they need from a school management system.
2. How to use Firebase AI Logic hybrid inference more fully.

**Sourcing note:** search rarely surfaced raw Reddit threads. Most evidence on school systems comes from review sites (Capterra, G2), UK practitioner forums (EduGeek, Mumsnet), teacher blogs and education journalism (Chalkbeat, EdWeek, Schools Week). Nigerian market evidence comes from SAFSMS reviews, BusinessDay, Nairametrics, TechCabal and headteacher.ng.

## What schools need

| # | Need | Evidence |
|---|---|---|
| 1 | Everything in one place: attendance, grades, records, reports. No re-entry. | Chalkbeat (2024-03-15); Edsby on multi-app stacks |
| 2 | **Fast attendance**: one or two taps per class, taken while teaching | Chalkbeat op-ed on attendance tools |
| 3 | **Low-click grade entry** | G2 reviews (TeacherEase), Capterra |
| 4 | **Result computation without errors**: totals, averages, positions, broadsheets. This is the headline reason Nigerian schools buy. | SAFSMS reviews (Capterra, Software Advice), Nairametrics |
| 5 | Report comments: a bank plus per-student detail; **character limits with a live counter**; comments linked to grades | Gradelink and Aspen help docs, Teach Starter, Simply Graded |
| 6 | **Head teacher approval that locks the comment** before parents see it | Insight Tracking knowledge base |
| 7 | Parent communication that actually arrives. In Nigeria that means **WhatsApp**, not email. | TechCabal (Schulup), dev.to (Pulse Connect) |
| 8 | **Works offline** on poor connections | dev.to (Pulse Connect), BusinessDay |

Pain points to avoid: too many clicks, cluttered screens, slow or lost data, weak built-in reporting, data-entry overload.

## What Firebase AI Logic can do that we weren't using

| Capability | On-device? | Use in Chalkvault |
|---|---|---|
| `generateContentStream` | **Yes** | Stream each comment as Nano writes it, so the teacher watches it appear even offline |
| Image input (JPEG/PNG) + JSON `responseConstraint` | **Yes** | Photograph a handwritten register; Nano reads names and marks into attendance, and the photo never leaves the device |
| Enum output | **Yes** | Flag students who need support (academic, attendance, wellbeing) from the notes, on-device |
| Output languages | en, es, fr, de, ja only | French and Spanish parent translation can run on-device; Yoruba, Hausa and Igbo stay cloud-only, on de-identified text |
| Chrome Translator API | Yes (separate built-in API) | On-device translation for supported pairs before falling back to the cloud |
| Multi-turn chat, function calling, grounding, thinking | No (cloud only) | Not used with names |

Gotchas:
- The model download needs a user click.
- While the model is downloading, `PREFER_ON_DEVICE` falls back to the cloud. Our privacy router already de-identifies first, so this is safe.
- The schema counts toward the 9,216-token limit.
- Firebase AI monitoring only shows cloud calls.

## Build order (impact first, then effort)

1. **Streaming comments.** `generateContentStream` on both paths. Small change, big visible win.
2. **Attendance.** A one-tap daily register per class, saved offline, with term attendance totals on the student record. Plus **photograph the paper register**, read on-device only (multimodal + JSON).
3. **Gradebook and results.** Per-class scores (CA1, CA2, exam; maximums set per school), totals, class average, **position**, grade band, a **printable broadsheet**. Scores and attendance feed the comment prompt.
4. **Approval workflow.** A teacher submits; an admin approves and the comment locks. A school-set **character limit** with a live counter.
5. **Parent delivery.** **Share on WhatsApp** for a student's report (the teacher sends it themselves). French and Spanish translations run **on-device** (Prompt API `expectedOutputs`, or the Chrome Translator API); other languages go to the cloud after de-identification.
6. **Support flags.** An on-device enum classification of each student's notes (`none`, `academic`, `attendance`, `wellbeing`), shown to admins as a list of students who may need follow-up.

Deferred: comment bank, Remote Config switching, fee bills and payments, a full offline PWA. Firestore's offline cache already covers reads and writes.
