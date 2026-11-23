# Blue Cranes Online

One installable phone app (PWA) with all Blue Cranes technician tools. One sign-in; each person has a profile (name, cell number, signature) that fills in the technician on every tool.

Live: https://bluecranesprojects.github.io/blue-cranes-online/

## Tools

| Folder | Tool |
|---|---|
| `timesheet/` | Daily Time Sheet – vehicle check, jobs, schedule, PDF, WhatsApp |
| `forklift/` | Forklift Inspection / Load Test report and load test certificate |
| `mancage/` | Man cage (work platform) inspection report to SANS 583:2015 – MC<job>.1 numbers, opens from a man cage on the client's inventory or the job's Man cage tab |
| `equipment/` | Client's inventory per job (location, serial nr, description, manufacturer, SWL, safe/unsafe) and all client inventories |
| `admin/` | Admin: schedule jobs (with client inventories from Excel), change/remove jobs, download per job the inventory PDF/Excel, certificates and forklift reports, export client inventories |

## Adding a new tool

1. Make a folder, e.g. `crane/`, with an `index.html`.
2. In its `<head>` load the shared files:
   ```html
   <script src="../shared/firebase-config.js"></script>
   <script type="module" src="../shared/cloud.js"></script>
   <script src="../shared/app.js"></script>
   ```
3. Call `BC.requireUser()` → `{ user, profile }` (sends people to the home screen if not signed in).
   Save with `Cloud.putItem('crane-<id>', { kind:'crane', ... })`, list with `Cloud.listKind('crane')`.
   Share or download files with `BC.saveFiles([{ blob, name }])`.
4. Add a tile to the `TOOLS` list at the top of the script in the root `index.html`.
5. Add the new files to `SHELL` in `sw.js` and change `VERSION`.
6. Report rules for every new report: Job details fold up with `BC.foldDetails(...)` (see `forklift/`), N/A boxes grey on the PDF, Submit report with a green Submitted indicator, Safe / Unsafe picked from the checklist, checklist groups fold up. After Submit report, a report opened from the client's inventory offers "Back to the client's inventory" (see `afterSave` in `forklift/` and `crane/`); otherwise "Next … → <next doc no>". Job details have a "▴ Fold up job details" button at the bottom (`data-jdclose`). No customer's name / signature on the report screen – the client signs once at Finish job. Report PDFs start every page (also the technician's quote pages) with `letterhead(doc,L,R)`, which ends with the navy rule 35 mm from the top. Back: every in-page screen is a browser-history step (`BC.viewHistory` in shared/app.js – time sheet, inventory, Admin; the reports' saved-reports list), so the phone's back and the on-screen ‹ go to the previous screen; new pages must use it too. Jobs carry an Order nr and a Site (Admin → time sheet job → inventory Site → report Site address; once the inventory's Site is filled in it wins). Report numbers run per kind within the job (CR<job>.1, .2… cranes; F<job>.1… forklifts; S<job>.1… stackers; MC<job>.1… man cages; a new kind gets its own letter and series) – the certificate number C<job>/<n> stays the item's own number. On the PDF the technician's name sits with the signature underneath it (the client's name and signature the same way beside it, once signed).

## Shared files

| File | What it is |
|---|---|
| `index.html` | Home screen: sign in, create account + profile, tool tiles |
| `shared/firebase-config.js` | Firebase project keys |
| `shared/cloud.js` | Firebase sign-in and saving (works offline, syncs later) |
| `shared/app.js` | Profile, sign-in check, share/download, signature upload, offline worker |
| `sw.js` | Offline support. **Change `VERSION` after every update** |
| `vendor/` | jsPDF, pdf-lib, JSZip, SheetJS, ExcelJS (kept locally; ExcelJS makes the styled census export) |
| `firestore.rules` | Database rules: each person only sees their own data |

## Data in Firebase

Everything for a person is under `users/{uid}/items/`:
`profile`, `settings`, `sheet-YYYY-MM-DD`, `sched-<id>` (time sheet), `fl-<doc no>` (forklift reports), `eq-<date>_<job>` (equipment lists).

## Admin and shared jobs

- `jobs/{id}` – jobs loaded by the office: date, time, card, customer, contact, notes, `tech` (email, lower case), status (planned / busy / done).
- `users/{uid}` – name and email of everyone who has signed in (for the admin's technician list).
- `admins/{email}` – an empty document whose ID is the admin's email in lower case makes that account an admin.
- Technicians read the jobs with their email and can only change the progress fields.

## Firebase settings that must stay in place

- Authentication → Sign-in method → **Email/Password** enabled
- Authentication → Settings → Authorized domains → **bluecranesprojects.github.io**
- Firestore → Rules → contents of `firestore.rules`
- Firestore → `admins` collection → one document per admin, ID = email in lower case
