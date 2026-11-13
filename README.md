# Blue Cranes Online

One installable phone app (PWA) with all Blue Cranes technician tools. One sign-in; each person has a profile (name, cell number, signature) that fills in the technician on every tool.

Live: https://bluecranesprojects.github.io/blue-cranes-online/

## Tools

| Folder | Tool |
|---|---|
| `timesheet/` | Daily Time Sheet – vehicle check, jobs, schedule, PDF, WhatsApp |
| `forklift/` | Forklift Inspection / Load Test report and load test certificate |
| `equipment/` | Equipment list per job (serial nr, description, manufacturer, SWL) and customer inventory |

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

## Shared files

| File | What it is |
|---|---|
| `index.html` | Home screen: sign in, create account + profile, tool tiles |
| `shared/firebase-config.js` | Firebase project keys |
| `shared/cloud.js` | Firebase sign-in and saving (works offline, syncs later) |
| `shared/app.js` | Profile, sign-in check, share/download, signature upload, offline worker |
| `sw.js` | Offline support. **Change `VERSION` after every update** |
| `vendor/` | jsPDF, pdf-lib, JSZip (kept locally so PDFs work offline) |
| `firestore.rules` | Database rules: each person only sees their own data |

## Data in Firebase

Everything for a person is under `users/{uid}/items/`:
`profile`, `settings`, `sheet-YYYY-MM-DD`, `sched-<id>` (time sheet), `fl-<doc no>` (forklift reports), `eq-<date>_<job>` (equipment lists).

## Firebase settings that must stay in place

- Authentication → Sign-in method → **Email/Password** enabled
- Authentication → Settings → Authorized domains → **bluecranesprojects.github.io**
- Firestore → Rules → contents of `firestore.rules`
