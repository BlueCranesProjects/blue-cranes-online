# Blue Cranes Online

One installable phone app (PWA) with all Blue Cranes technician tools. One sign-in; each person has a profile (name, cell number, signature) that fills in the technician on every tool.

Live: https://bluecranesprojects.github.io/blue-cranes-online/

## Tools

| Folder | Tool |
|---|---|
| `timesheet/` | Daily Time Sheet – vehicle check, jobs, schedule, PDF, WhatsApp |
| `forklift/` | Forklift Inspection / Load Test report and load test certificate |
| `mancage/` | Man cage (work platform) inspection report to SANS 583:2015 – MC<job>.1 numbers, opens from a man cage on the client's inventory or the job's Man cage tab; W / X items take up to 3 photos (camera or gallery), printed on a PHOTOS page after the report |
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

## Certificates (rule)

- Load test certificate: lifting machinery – cranes, gantries, hoists, chain blocks, lever hoists, winches / Tirfors. With a report: SEE REPORT … under the remarks, no reason.
- Inspection certificate: lifting tackle, safety harnesses / lanyards, man cages (SANS 583:2015, SEE REPORT MC…, next inspection due, 3 inspection lines) and any other equipment that is not lifting machinery.
- Forklifts and stackers: their own certificate from the forklift report.
- Unsafe items that can't be repaired (shackles, round / web / wire rope slings, eye bolts, eye nuts, harnesses, lanyards, fall arrestors) are condemned: no further inspection lines and a faint red CONDEMNED / REMOVED FROM SITE watermark across the certificate; repairable items (man cages, chain slings, chain blocks, other equipment) keep their inspection lines.

## Equipment for quote (rule)

- Technician's copy for the office, never in the client's files: TECHNICIAN_Equipment_for_quote (equipment/ quoteDoc). Replace = condemned items counted per description / manufacturer / SWL / length or HOL with their item numbers; Repair = other unsafe items (what's wrong, report nr); Refurbish = items marked Refurbish.
- In the app: red link under the inventory download links when there are unsafe or refurbish items. In Admin: ⬇ Equipment for quote button, and in the Job PDF, All files zip and period export.

## Inventory (rule)

- Search box above the items (item number, description, make, location, report number).
- Item number in bold, the description underneath.
- Inside To do / Completed the items are grouped by type (man cages, cranes, chain blocks, lever hoists, hoists, shackles, eye bolts, eye nuts, round / web / chain / wire rope slings, harnesses, lanyards …); anything else is grouped by its description. The census PDF and Excel use the same groups, each with a heading.
- Inside each group the items go from the lowest to the highest SWL; items with the same SWL keep the order they were listed in (new items at the bottom of their SWL). Same order in the app, census PDF / Excel and certificate numbers.
- Certificate numbers follow the list: C<job>/<n> where n is the item's line on the inventory (by group, then SWL, then as listed; worked out each time – lineNos / certN in equipment/). The numbers are not printed on the census PDF / Excel. Forklift load test certificates get their line number too (flCertNo). The certificates PDF prints in that order.
- Groups can be renamed per job (l.gnames, shown in the app, search, PDF and Excel) and an item can be moved to another or a new group (r.grp; the automatic group still decides slings / certificates).
- Slings (web, endless round, chain, steel wire rope) have a length in metres: in the app, a LENGTH column on the census and a LENGTH line on the certificate (the description on the certificate leaves the length out).
- Fall arrestors (inertia reels, self-retracting lifelines, rescue devices) have a height of lift in metres: "HOL 10 m" in the app, in the LENGTH column on the census and a HEIGHT OF LIFT line on the certificate. Lanyards and harnesses do not.
- Man cages: W / X items have a For quote box (parts, repair notes); the technician's copy adds the quote page(s) (TECHNICIAN_Man_cage_reports_for_quote in Admin).

## Security (rule)

- New accounts get a "confirm your email" link; until it is opened the app shows the Confirm your email screen (existing accounts get their link once, by themselves). Jobs and Admin need a confirmed email – in the app and in firestore.rules (verified()).
- Signing out empties the phone / tablet (inventories, reports, drafts, photos, time sheet); everything stays in the account. If another account signs in on a device holding someone else's work, that work is cleared first (bco-owner).
- After a device was emptied, the next sign-in brings the person's inventories, saved reports and unfinished reports back from the account by themselves (BC.restoreDevice, flag bco-restore).

## Saving (rule)

- Two devices on one account: when the app comes to the front (or ↻ Sync now in the ☁ icon) every page fetches the latest from the server ('bc-sync' event). Time sheet days are combined field by field (ft) and job by job (jid, t, del) with BC.mergeSheet, on the phone and on the server (Cloud collection set merges sheets before writing).
- Save icon bottom left on every page (BC.saveIcon, Cloud.onSync): Saved / Saving… / No signal (kept on the phone) / Not saved.
- Inventories are combined item by item (BC.mergeList): every row has t (last change), deleted rows are kept in l.del; the newest result per item wins on the phone, between pages and on the server (Cloud.putItem merges equipment lists before writing). Reports only change their own item.
- The phone's small storage is written with BC.lsSet: if it is full, photos move to the photo store (IndexedDB bc-photos) and a red warning shows. Inventory photos live in bc-photos, not in localStorage.
- Opening an inventory puts back results that are in a saved report but missing on the inventory (repairFromReports). Small-equipment groups have "Mark all Safe".

## Client sign-off (rule)

- The sign-off is the Technicians Report and Time Card, like the paper card: customer, job no, site, order no, technician, report to, date, type of work (Inspection / Service / Load test), equipment, work done, materials used, file updated / new file needed, time record (from the time sheet, changeable), customer's certificate with print name and signature, email.
- A job with an order nr from the office (Admin) is a quoted job: the time record starts switched off (the technician can switch it on).
- The PDF (Report_and_time_card_…) is laid out like the paper card; it is in the job zip / whole-job PDF on the phone and in Admin (own button, Job PDF, All files).

## Backup (rule)

- Admin shows a reminder bar when there is no backup or the last one is 7+ days old. Export jobs → Weekly backup → Back up now makes one zip of every job since a day before the last backup (first time: from 1 Jan 2026); it counts once the zip is saved. The last backup is kept per admin (users/{uid}/items/backup). Save the zip to Google Drive / OneDrive.
- When the project is on the Blaze plan: also switch on Firestore daily backups and point-in-time recovery.

## Refurbish (rule)

- No Refurbish condition button any more (only Safe / Unsafe); items marked Refurbish before 24 Nov (K) still show it and get no certificate until marked Safe or Unsafe.
- Man cage and crane / hoist reports have "Refurbished by" (Blue Cranes offered) and "Year refurbished" under the manufacturer; printed on the report and, via the inventory row (refurbBy / refurbYear), on the certificate as REFURBISHED BY … (year) – only when filled in.

## Print run (rule)

- Admin → **Print run** lists finished jobs (status done) of the last 7 days that have no `printedAt`. Older jobs are never printed by themselves; "Printed in the last 7 days" has **Print again**.
- For each job it downloads `BC-PRINT_<yyyy-mm-dd_HHMM>_<nn>_<job>_<client>_1-CLIENT.pdf` (client's copies, printed one-sided), `_2-TECH.pdf` (technician's copies: time card, time sheet, quote pages, equipment for quote – printed both sides) and `_3-BLUE.pdf` (the certificates, one-sided), then `BC-PRINT_DONE_<stamp>.txt`, and sets `printedAt` / `printedBy` on the job.
- `admin/?printrun=auto` does the same by itself once the page has loaded (opened by the office computer).
- The office print program is in `print/` (downloaded as a zip from the Print run tab): `bc-print.ps1` opens the auto page in Chrome, waits for the DONE file, prints CLIENT and TECH files to `$WhiteTray` (TECH with `$TechSides` = duplexlong) and BLUE files to `$BlueTray` on `$Printer` (default Groot printer) with SumatraPDF (`-print-settings noscale,simplex|duplexlong,bin=<tray>`), and moves them to `C:\BlueCranes\Printed\<date>` (or `Failed`). Logs in `C:\BlueCranes\Logs`.
- `Install print program.bat` copies it to `C:\BlueCranes` and puts "Blue Cranes – Print now" on the desktop (prints what is in Downloads, no Chrome). `Switch on 6am print.bat` adds the Windows task "Blue Cranes 6am print run", weekdays 05:55 – only after a test print.
- Admin reads a technician's profile (name, signature for certificates) with `profOf(uid)`: the item with id `profile` first, then any item of kind `profile`. Older accounts saved their profile without `kind`, and searching by kind alone left the signature off Admin's certificates (Certificates, All files zip, Print run).
