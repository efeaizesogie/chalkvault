# Chalkvault v2: run like a real Nigerian school (2026-11-24)

## Structure
- **Class (level):** JSS 1, SS 2, Primary 5, from the school's level list.
- **Arm:** JSS 1A, JSS 1B, Primary 5 Gold. Students belong to one arm. Stored in the `classes` collection with `level` and `arm`.
- **Subject offering:** one subject taught in one arm, e.g. Mathematics in JSS 1A. It has one or more subject teachers and a roster: every student in the arm, or chosen students for electives.
- **Form teacher:** the class teacher of an arm. Sees every student in that arm, takes the daily register (if the school chooses), and writes the form teacher's comment.
- **Subject teacher:** sees only their offerings and the students taking them. Enters scores and writes subject remarks.
- **Owner and admins:** see everything. Write the principal's comment, approve, publish results.

## School rules (Settings, chosen by each school)
| Rule | Options |
|---|---|
| Who takes attendance | Form teacher daily · Subject teacher each lesson · Admin only |
| How many arms a teacher can be form teacher of | One · Several |
| Can teachers add or remove students | Yes · No (admins only) |
| Comments need approval before publishing | Yes · No |
| Subject teachers write a remark per subject | Yes · No |
| Show positions on report cards | Yes · No |
| Cloud scanning of score sheets (contain names) | Off by default; admin can turn on, with a warning |
| Cloud fallback for comments (names removed) | On · Off |
| Score sheet columns, grade bands, comment length | Free-form |

## Data (Firestore, per school)
- `classes` (arms)
- `offerings` (arm + subject + teachers + roster)
- `members` (`role`, `formClassIds`, `offeringIds`, `subjectClassIds`)
- `students`
- `records` (form-teacher record per student per term: notes, AI comment, principal comment, approval)
- `subjectRecords` (per student per subject per term: scores, remark)
- `attendance` (per arm per day, or per offering per day)
- `notices`
- Top-level `results/{pin}`: published report cards. A parent reads one only with its private PIN.

## Screens
- **Admin dashboard:** students, staff, arms; today's attendance; score-entry progress per subject; comments progress; approvals; follow-ups; notices.
- **Teacher dashboard:** my subjects (with progress), my form class, today's register, notices.
- **Subject page:** score sheet (school's columns) with scan-a-sheet (AI) and CBT import (CSV/Excel, AI maps columns from headers only); subject remarks; register if the school takes it per lesson.
- **Form class page:** register; form teacher comments (the existing AI desk, streamed, grounded in all subject results and attendance); report cards.
- **Report card:** every subject (columns, total, grade, subject position, remark), average, class position, attendance, form teacher's comment, principal's comment, next term date, grade key. Printable; published with a result PIN.
- **Result portal** (`/results`): a parent enters the PIN and sees and prints the report.
- **Settings:** school rules; levels, arms, subjects; assessments; grade bands; terms and sessions.

## AI (Firebase AI Logic hybrid)
- **Form comment:** `PREFER_ON_DEVICE`, streamed, names removed on the cloud path, plus a support flag (as now), grounded in every subject's grade.
- **Subject remark:** short, `PREFER_ON_DEVICE`, from the score and the teacher's note, de-identified on the cloud path.
- **Score sheet scan:** image to JSON with the school's own columns. `ONLY_ON_DEVICE`, unless the admin turned cloud scanning on.
- **CBT import mapping:** headers only (no names) go to `PREFER_ON_DEVICE`, which suggests which column is which.
- **Register photo:** `ONLY_ON_DEVICE` (as now).

## Later
Google Drive connection for CBT files, fees, timetable, promotion to next session.
