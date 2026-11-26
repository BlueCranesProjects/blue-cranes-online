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
- `admins/{email}` – a document whose ID is the admin's email in lower case makes that account an admin (fields: name, addedBy, added).
- The **owner** is the admin document with the field `owner: true` (boolean), set once by hand in Firebase. Only the owner sees Admin → **Admins** and adds or removes other admins there; nobody can make another owner or change the owner's own document (firestore.rules).
- Admins see the Admin tile **and** the technician tools on the home screen; the tool pages no longer send admins to Admin.
- Technicians read the jobs with their email and can only change the progress fields.

## Firebase settings that must stay in place

- Authentication → Sign-in method → **Email/Password** enabled
- Authentication → Settings → Authorized domains → **bluecranesprojects.github.io**
- Firestore → Rules → contents of `firestore.rules`
- Firestore → `admins` collection → one document per admin, ID = email in lower case
- Firestore → `admins` → the owner's document has the field `owner` = true (boolean)

## Admin layout (rule)

- Main tabs: **Jobs** (schedule, ＋ New job, ⬆ New job from client's file, ⬆ Add inventory per job), **Paper jobs**, **Print run**, **Export** (backup reminder only here; a red dot on Export when a backup is due), and **⚙ Settings** with Technicians, Email and Admins (owner only).
- Admin opens on Jobs.

## Technicians and LMI numbers (rule)

- Admin → **Technicians** is the office's list (`settings/technicians` = { list:[{ id, name, email, lmi, sig }] }): name and surname, sign-in email (only if they use the app), own LMI number, signature (drawn, uploaded or taken from their app profile). Only admins change it; every signed-in phone reads it (`BC.loadTechs`, kept in `bco-techs`).
- A technician **with an LMI number** tests on their own: on every load test certificate (inventory and forklift) their LMI goes under their name and there is **no UNDERSTUDY line**; the app doesn't ask for an understudy (`techLmiOf`, `needsUt`; forklift `f.engLmi`; Admin `lmiFor`, `stWithUt(…, lmi)`).
- Paper jobs pick the technician from this list first (also people without an app account), then app users not on it; the paper job keeps `techRec`, `techLmi`, `techSig` and refreshes them from the list when opened.

## Paper jobs (rule)

- For jobs that were done on paper in the past. Admin → **Paper jobs**: choose the technician who did the job, the job number, the date from the paper, the client and the site, then **Start paper job**.
- The inventory page opens in paper mode (`equipment/?paper=<id>`): the client's inventory with Safe / Unsafe and reasons, and the understudy typed in for that job. No reports (crane, forklift, man cage), no time card or time sheet, no client sign-off.
- Downloads: certificates PDF, inventory PDF and Excel, equipment for quote – the same layout as a technician's job.
- Certificates: the **technician's name and signature** (from their profile, refreshed when the job is opened) and the **paper job's date** (test date, next test and 6-monthly inspection dates worked out from it).
- The understudy belongs only to that paper job – it is not remembered for the next job.
- Stored in the admin's own account: kind `paper`, id `eq-paper-<job>-<code>`, and on the computer in `bco-paper` (kept apart from `bco-equipment`).
- A paper job can start from the client's digital inventory (optional file on New paper job – the same reader as Import jobs), and **⬆ Import inventory** on a paper job adds a file's items later; items already on it (same item no) are left out. The items come in unmarked (office:true) – mark each Safe or Unsafe as on the paper.
- **Inspection or Load test:** a new paper job must be one of the two (also changeable on the paper job's inventory). Load test: lifting machinery gets load test certificates, forklifts and stackers too – made from the inventory item with load centre, attachment type, attachment serial and SWL typed in from the paper (`paperFlState` → forklift `buildCert`, `f.certNoText`). Inspection: lifting machinery and forklifts get the INSPECTION CERTIFICATE – Lifting Machinery (no understudy, LMI under the name). Lifting tackle, harnesses and safety gear always get their inspection certificate.
- **Previous test date** (load test paper jobs): one for the whole job at the top of the paper job, and optionally per item; printed on the load test certificates (forklift too).
- **Understudy on paper jobs** is remembered (per technician, else the last one; `bco-paper-ut` and the admin's item `paper-ut`) and filled in on the next paper jobs until the office changes it (Edit / Change understudy).
- Admin → Paper jobs: each paper job has the same downloads as a job: **⬇ Inventory** (census layout), **⬇ Excel**, **⬇ Certificates**, **⬇ Equipment for quote** and **⬇ All files (zip)** (`paperFiles`, through the hidden inventory page).
- **Report number** on a paper job's machinery, forklift and man cage items (typed from the paper, e.g. CR7101.1): stored as the item's `report.no`, shown in the inventory's REPORT column and as SEE REPORT on its certificate (then no reason on the certificate).
- Paper jobs are **not** in the print run, Schedule jobs or the exports – they are downloaded by hand.

## Downloads on a tablet (rule)

- Android may restart the Admin page when a PDF is opened or shared. Admin keeps the files it just made for 30 minutes (IndexedDB `bc-admin-files`) and shows the **Files ready** box again after the restart ("Still here"); Close removes them.
- After a restart Admin shows the same tab, technician filter, period and open days, with this tab's last copy of the jobs straight away (sessionStorage `bco-admin-cache`, `bco-admin-view`), then the latest.
- After any download or share the app does not redraw the page when you come back (`BC.justDownloaded`, 2 minutes).

## Import the inventory afterwards (rule)

- Admin → Schedule jobs: every job that is not done has **⬆ Add inventory** (or **⬆ Inventory (n)** when it has items). Choose the client's file (census layout or their own list – the same reader as Import jobs), check the preview, **Add n items**.
- The items are added to the job's office list (`job.inv`); items already on it (same item no, or for items without a number the same description, location, make and SWL) are left out, so loading the same file twice does nothing.
- The technician's Client's inventory picks the new items up when it is opened (`loadOffice`, also while the job is busy); items the technician already added with the same item no are not doubled.

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

## Client email after sign-off (rule)

- Straight after the client signs (Finish job / Save sign-off with an email address), the phone emails the client: the **inventory list**, the **client's reports** (forklift, crane / hoist, man cage – one PDF per kind, no technician's quote copies) and the **signed report & time card**. No certificates, no copy to the office.
- Sent from the office's Google account by a small Google Apps Script web app (Admin → **Email** has the script with its secret key and the steps). Setting: `settings/email` = { url, key, fromName, replyTo } – read by every signed-in user, changed only by admins (firestore.rules). `BC.sendMail` posts the PDFs (base64) as text/plain JSON.
- No signal or the script fails: `signoff.mail` stays `waiting` (with `mailErr`), and the inventory page tries again when opened or when the app comes back (`retryMail`: 20 s after the inventory opens, one job per visit; the try is saved before the PDFs are made, so a phone that restarts the page doesn't loop; at most 3 tries, 6 hours apart; a job the office already sent from Admin (`mailSentAt`) is marked sent without making PDFs). Sent: `mail = 'sent'`, `mailAt`.
- Admin → Email lists the signed-off jobs of the last 30 days (✓ Emailed / ⏳ Waiting / no address) with **Send now / Send again** (Admin builds the same files; marks the job `mailSentAt`, `mailTo`).

## Backup (rule)

- Admin shows a reminder bar when there is no backup or the last one is 7+ days old. Export jobs → Weekly backup → Back up now makes one zip of every job since a day before the last backup (first time: from 1 Jan 2026); it counts once the zip is saved. The last backup is kept per admin (users/{uid}/items/backup). Save the zip to Google Drive / OneDrive.
- When the project is on the Blaze plan: also switch on Firestore daily backups and point-in-time recovery.

## Refurbish (rule)

- No Refurbish condition button any more (only Safe / Unsafe); items marked Refurbish before 24 Nov (K) still show it and get no certificate until marked Safe or Unsafe.
- Man cage and crane / hoist reports have "Refurbished by" (Blue Cranes offered) and "Year refurbished" under the manufacturer; printed on the report and, via the inventory row (refurbBy / refurbYear), on the certificate as REFURBISHED BY … (year) – only when filled in.

## Print run (rule)

- Admin → **Print run** lists finished jobs (status done) of the last 7 days that have no `printedAt`. Older jobs are never printed by themselves; "Printed in the last 7 days" has **Print again**.
- For each job it downloads `BC-PRINT_<yyyy-mm-dd_HHMM>_<nn>_<job>_<client>_1-CLIENT.pdf` (client's copies, printed one-sided), `_2-TECH.pdf` (technician's copies: time card, time sheet, quote pages, equipment for quote – printed one-sided too) and `_3-BLUE.pdf` (the certificates, one-sided), then `BC-PRINT_DONE_<stamp>.txt`, and sets `printedAt` / `printedBy` on the job.
- `admin/?printrun=auto` does the same by itself once the page has loaded (opened by the office computer).
- The office print program is in `print/` (downloaded as a zip from the Print run tab): `bc-print.ps1` opens the auto page in Chrome, waits for the DONE file, prints CLIENT and TECH files to `$WhiteTray` (TECH with `$TechSides` = simplex, one side; set duplexlong for both sides) and BLUE files to `$BlueTray` on `$Printer` (default Groot printer) with SumatraPDF (`-print-settings noscale,simplex|duplexlong,bin=<tray>`), and moves them to `C:\BlueCranes\Printed\<date>` (or `Failed`). Logs in `C:\BlueCranes\Logs`.
- `Install print program.bat` copies it to `C:\BlueCranes` and puts "Blue Cranes – Print now" on the desktop (prints what is in Downloads, no Chrome). `Switch on 6am print.bat` adds the Windows task "Blue Cranes 6am print run", weekdays 05:55 – only after a test print.
- Admin reads a technician's profile (name, signature for certificates) with `profOf(uid)`: the item with id `profile` first, then any item of kind `profile`. Older accounts saved their profile without `kind`, and searching by kind alone left the signature off Admin's certificates (Certificates, All files zip, Print run).
- Understudy on load test certificates: the job's own understudy (`l.ut`). If it was saved without a signature or LMI number, the same person's saved understudy (phone: `bc-forklift-understudy`; Admin: cloud item `understudy`, then the latest forklift load test) fills the gap (`utFull` in equipment, `utFor` in Admin). Admin's Certificates button, All files zip and Print run all use `utFor`. Forklift load test certificates too: a forklift report without an understudy gets the job's understudy (`withUt` / `flCertSt` in equipment, `stWithUt` in Admin; the forklift page itself uses the understudy saved on the phone). Change the understudy in **Job details & understudy**: ✎ Edit (fix the name / LMI number / signature) or ⇄ Change understudy (another person: empty form, or pick an understudy used before). The job's understudy always replaces the one on a forklift report, on every load test certificate of the job (phone, forklift page, Admin, print run). The inventory's "Job details & understudy" shows **Understudy to fill in** (red) while a job with load test items has no understudy with a signature.
- Description drop-downs (26 Nov H): the client's inventory has a description list (`data-descpick`) built from descriptions already used (`S.descs`); typing still works. Crane / hoist and man cage: the yellow "For quote" box is folded by default (`qOpen`) with a short summary, each part is a drop-down (`PARTS` plus the technician's own parts in `bc-parts-own`, "Other – type it below" for anything new), and every section ends with "▴ Fold up this section" (`data-secup`).
- Type of work on the time card has **N/A** for other work (breakdowns, repairs): the work-done text is left for the technician to type, and the card / email leave the type out. Client email takes several addresses with a comma between (`BC.mailList`); `BC.sendMail` sends one email to each, so the Google script is unchanged. Admin's job email fields take several too.
