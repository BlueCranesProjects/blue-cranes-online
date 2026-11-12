# Blue Cranes – Daily Time Sheet

Installable phone app (PWA) for the daily vehicle inspection, jobs, end-of-day odometer and clock times, PDF time sheet, WhatsApp message and a weekly job schedule.

- Works offline once opened.
- Saves to Firebase (cloud) when `firebase-config.js` is filled in; otherwise saves on the phone only.
- **History → Back up data / Restore backup** moves all data between phones or from the old Claude version.

## Files

| File | What it is |
|---|---|
| `index.html` | The app |
| `cloud.js` | Firebase sign-in and saving |
| `firebase-config.js` | **Your Firebase keys go here** |
| `sw.js` | Offline support. Change `VERSION` after every update so phones get the new files |
| `manifest.webmanifest`, `icons/` | App name and home-screen icon |
| `vendor/jspdf.umd.min.js` | PDF maker (kept locally so PDFs work offline) |
| `firestore.rules` | Database security rules to paste into Firebase |

## 1. Put it on GitHub Pages

1. The repository must be **public** for free GitHub Pages (no data is stored in the code – your time sheets live in Firebase).
2. On GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: `main` / `(root)` → Save**.
3. After a minute the app is at `https://<your-github-name>.github.io/<repo-name>/`.

## 2. Set up Firebase (free)

1. Go to <https://console.firebase.google.com> → **Add project** (e.g. `blue-cranes-timesheet`). Google Analytics can be off.
2. **Build → Authentication → Get started → Sign-in method → Email/Password → Enable → Save.**
3. **Authentication → Settings → Authorized domains → Add domain** → `<your-github-name>.github.io`.
4. **Build → Firestore Database → Create database** → pick location `africa-south1 (Johannesburg)` → start in **production mode**.
5. **Firestore → Rules** → replace everything with the contents of `firestore.rules` → **Publish**.
6. **Project settings (gear) → General → Your apps → Web (`</>`)** → register app (no hosting) → copy the `firebaseConfig` values.
7. Paste them into `firebase-config.js` (replace `window.FIREBASE_CONFIG = null;`), commit, and bump `VERSION` in `sw.js`.

These Firebase web keys are meant to be public; the security rules are what protect the data.

## 3. Install on the phone

- **Android (Chrome):** open the link → History tab → **Install app on this phone**, or menu ⋮ → *Install app*.
- **iPhone (Safari):** open the link → Share → **Add to Home Screen**.

## 4. Move your old data

1. In the old Claude version: **History → Back up data**.
2. In the new app (signed in): **History → Restore backup** → pick the file.
