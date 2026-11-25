// Cloud saving through Firebase (Auth + Firestore with offline cache).
// Exposes window.Cloud for the app. If no config is set, Cloud.ready resolves to false.
const V = '10.14.1';
const base = `https://www.gstatic.com/firebasejs/${V}/`;

let resolveReady;
const ready = new Promise(r => { resolveReady = r; });
const listeners = [];
let current;            // undefined = not known yet, null = signed out
// whose work is on this phone / tablet
const OWNER = 'bco-owner';
const WIPE = /^(dts-|bco|bc-|bc_)/;
async function wipeDevice(){
  try { Object.keys(localStorage).filter(k => WIPE.test(k) && k !== OWNER).forEach(k => localStorage.removeItem(k)); } catch(e){}
  await Promise.all(['bc-forklift', 'bc-crane', 'bc-mancage', 'bc-photos'].map(n => new Promise(r => { try { const q = indexedDB.deleteDatabase(n); q.onsuccess = q.onerror = q.onblocked = () => r(); setTimeout(r, 1500); } catch(e){ r(); } })));
}
const api = {
  ready,
  user: () => current || null,
  onAuth(cb){ listeners.push(cb); if (current !== undefined) cb(current); },
  signIn: () => Promise.reject(new Error('Cloud not set up')),
  signUp: () => Promise.reject(new Error('Cloud not set up')),
  resetPassword: () => Promise.reject(new Error('Cloud not set up')),
  signOut: () => Promise.resolve(),
  collection: () => { throw new Error('Cloud not set up'); }
};
window.Cloud = api;

(async () => {
  const cfg = window.FIREBASE_CONFIG;
  if (!cfg || !cfg.apiKey){ resolveReady(false); return; }
  try {
    const [{ initializeApp }, A, F] = await Promise.all([
      import(base + 'firebase-app.js'), import(base + 'firebase-auth.js'), import(base + 'firebase-firestore.js')
    ]);
    const app = initializeApp(cfg);
    const auth = A.getAuth(app);
    // hidden helper pages (used by Admin to make PDFs) must not touch the sign-in storage: that can sign the main page out for a moment
    if (!/[?&]embed=1/.test(location.search)) await A.setPersistence(auth, A.browserLocalPersistence).catch(() => {});
    let fs;
    try { fs = F.initializeFirestore(app, { ignoreUndefinedProperties: true, localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }) }); }
    catch (e) { fs = F.getFirestore(app); }
    const report = e => { console.error('Cloud save failed', e); if (api.onError) api.onError(e); };
    // the save icon: how many changes are still on their way to the server, and the last problem
    const sync = { pending:0, error:null, last:0 }, syncL = [];
    const emit = () => syncL.forEach(cb => { try { cb(Object.assign({}, sync)); } catch(e){} });
    api.onSync = cb => { syncL.push(cb); cb(Object.assign({}, sync)); };
    // a write counts as saved once the server has it (with no signal it stays "on its way" and is kept on the phone)
    const track = p => { sync.pending++; emit(); return p.then(v => { sync.pending--; sync.error = null; sync.last = Date.now(); emit(); return v; },
      e => { sync.pending--; sync.error = (e && (e.code || e.message)) || 'error'; emit(); throw e; }); };
    // inventories: combine with the copy already there (newest result per item), so an older copy can never undo newer work
    const chains = {};
    const putList = (ref, key, data) => { const run = async () => {
        let cur = null; try { const c = await F.getDocFromCache(ref); if (c.exists()) cur = c.data(); } catch(e){}
        if (!cur){ try { const c = await Promise.race([F.getDoc(ref), new Promise((_, rj) => setTimeout(() => rj(new Error('slow')), 5000))]); if (c.exists()) cur = c.data(); } catch(e){} }
        const fn = data.kind === 'sheet' ? (window.BC && window.BC.mergeSheet) : (window.BC && window.BC.mergeList);
        const merged = cur && fn ? Object.assign(fn(cur, data), { kind:data.kind }) : data;
        return track(F.setDoc(ref, JSON.parse(JSON.stringify(merged)))); };
      const p = (chains[key] || Promise.resolve()).then(run, run); chains[key] = p.catch(() => {}); return p; };

    // Same shape the app already uses: collection().doc(id).set/delete and collection().get()
    api.collection = () => {
      const u = auth.currentUser; if (!u) throw new Error('Not signed in');
      const col = F.collection(fs, 'users', u.uid, 'items');
      return {
        // Writes land in the phone's offline cache straight away and sync when there is signal.
        // We don't wait for the server, otherwise saves would stall with no signal.
        doc: id => ({
          set: data => { const ref = F.doc(col, id); (data && data.kind === 'sheet' && Array.isArray(data.jobs) ? putList(ref, (auth.currentUser && auth.currentUser.uid) + '/' + id, data) : track(F.setDoc(ref, data))).catch(report); return Promise.resolve(); },
          delete: () => { track(F.deleteDoc(F.doc(col, id))).catch(report); return Promise.resolve(); }
        }),
        get: async () => {
          let snap;
          try { snap = await F.getDocs(col); } catch (e) { snap = await F.getDocsFromCache(col); }
          return { docs: snap.docs.map(d => ({ id: d.id, data: () => d.data() })) };
        }
      };
    };
    const itemsCol = () => { const u = auth.currentUser; if (!u) throw new Error('Not signed in'); return F.collection(fs, 'users', u.uid, 'items'); };
    // one document, e.g. the profile (server when online, phone cache when not)
    api.getItem = async id => {
      const ref = F.doc(itemsCol(), id); let s;
      try { s = await F.getDoc(ref); } catch (e) { try { s = await F.getDocFromCache(ref); } catch (_) { return null; } }
      return s.exists() ? s.data() : null;
    };
    // wait for the server for important saves (profile); falls back to "saved on phone" after a few seconds
    api.setItem = (id, data) => {
      const p = track(F.setDoc(F.doc(itemsCol(), id), data));
      return Promise.race([p, new Promise(r => setTimeout(r, 6000))]);
    };
    api.deleteItem = id => { track(F.deleteDoc(F.doc(itemsCol(), id))).catch(report); return Promise.resolve(); };
    api.putItem = (id, data) => { const ref = F.doc(itemsCol(), id);
      (data && data.kind === 'equipment' && Array.isArray(data.rows) ? putList(ref, auth.currentUser.uid + '/' + id, data) : track(F.setDoc(ref, data))).catch(report); return Promise.resolve(); };
    // all documents of one kind, e.g. 'forklift'
    api.listKind = async kind => {
      const q = F.query(itemsCol(), F.where('kind', '==', kind)); let s;
      try { s = await F.getDocs(q); } catch (e) { s = await F.getDocsFromCache(q); }
      return s.docs.map(d => ({ id: d.id, data: d.data() }));
    };
    // ---- shared: jobs loaded by the office, admin role, user directory ----
    api.email = () => String((auth.currentUser && auth.currentUser.email) || '').trim().toLowerCase();
    // shared settings (settings/{id}): every signed-in technician reads them, only admins change them – e.g. 'email' = the Google script that sends the client emails
    api.getSetting = async id => { try { const s = await F.getDoc(F.doc(fs, 'settings', id)); return s.exists() ? s.data() : null; } catch (e) { try { const c = await F.getDocFromCache(F.doc(fs, 'settings', id)); return c.exists() ? c.data() : null; } catch (_) { return null; } } };
    api.setSetting = (id, data) => F.setDoc(F.doc(fs, 'settings', id), data);
    api.isAdmin = async () => { try { const s = await F.getDoc(F.doc(fs, 'admins', api.email())); return s.exists(); } catch (e) { return false; } };
    api.saveUser = data => { const u = auth.currentUser; if (!u) return Promise.resolve(); return F.setDoc(F.doc(fs, 'users', u.uid), data, { merge:true }).catch(() => {}); };
    // a technician's jobs (null when they can't be read, e.g. rules not set up yet)
    api.myJobs = async () => {
      const q = F.query(F.collection(fs, 'jobs'), F.where('tech', '==', api.email())); let s;
      try { s = await F.getDocs(q); } catch (e) { try { s = await F.getDocsFromCache(q); } catch (_) { return null; } }
      return s.docs.map(d => Object.assign({ id: d.id }, d.data()));
    };
    api.updateJob = (id, fields) => { track(F.updateDoc(F.doc(fs, 'jobs', id), fields)).catch(report); return Promise.resolve(); };
    // admin only
    api.allJobs = async () => (await F.getDocs(F.collection(fs, 'jobs'))).docs.map(d => Object.assign({ id: d.id }, d.data()));
    api.putJobs = async list => {
      for (let i = 0; i < list.length; i += 400){
        const b = F.writeBatch(fs); list.slice(i, i + 400).forEach(j => { const { id, ...data } = j; b.set(F.doc(fs, 'jobs', id), data, { merge:true }); });
        await track(b.commit());
      }
    };
    api.deleteJob = id => F.deleteDoc(F.doc(fs, 'jobs', id));
    api.listUsers = async () => (await F.getDocs(F.collection(fs, 'users'))).docs.map(d => Object.assign({ uid: d.id }, d.data()));
    // one item of another user (Admin reading a technician's photo)
    api.getItemOf = async (uid, id) => { const s = await F.getDoc(F.doc(fs, 'users', uid, 'items', id)); return s.exists() ? s.data() : null; };
    api.listKindOf = async (uid, kind) => (await F.getDocs(F.query(F.collection(fs, 'users', uid, 'items'), F.where('kind', '==', kind)))).docs.map(d => ({ id: d.id, data: d.data() }));
    api.signIn = (email, pw) => A.signInWithEmailAndPassword(auth, email, pw);
    // a new account gets a "confirm your email" link: only confirmed emails can open jobs or Admin
    api.signUp = async (email, pw) => { const c = await A.createUserWithEmailAndPassword(auth, email, pw); try { localStorage.setItem('bco-vsent-' + c.user.uid, String(Date.now())); await A.sendEmailVerification(c.user); } catch(e){} return c; };
    api.sendVerify = () => auth.currentUser ? A.sendEmailVerification(auth.currentUser) : Promise.reject(new Error('Not signed in'));
    // after the person opened the link: refresh the account (and its sign-in token, which the security rules check)
    api.checkVerified = async () => { const u = auth.currentUser; if (!u) return false; await u.reload(); if (!u.emailVerified) return false;
      await u.getIdToken(true); current = { uid: u.uid, email: u.email, verified: true }; return true; };
    api.resetPassword = email => A.sendPasswordResetEmail(auth, email);
    // signing out empties this phone / tablet (inventories, reports, drafts, photos): everything stays in the account
    api.signOut = async () => {
      try { await Promise.race([F.waitForPendingWrites(fs), new Promise(r => setTimeout(r, 6000))]); } catch(e){}
      await wipeDevice(); try { localStorage.removeItem(OWNER); } catch(e){}
      return A.signOut(auth);
    };
    A.onAuthStateChanged(auth, async u => {
      // another person signing in on this phone / tablet: clear what the last person left here first
      if (u){ let o = null; try { o = localStorage.getItem(OWNER); } catch(e){}
        if (o && o !== u.uid){ await wipeDevice(); try { localStorage.setItem(OWNER, u.uid); localStorage.setItem('bco-restore', '1'); } catch(e){} location.reload(); return; }
        // first sign-in on this phone / tablet (or after signing out): bring the person's work back from the account
        if (!o) try { localStorage.setItem(OWNER, u.uid); if (!localStorage.getItem('bco-equipment')) localStorage.setItem('bco-restore', '1'); } catch(e){} }
      current = u ? { uid: u.uid, email: u.email, verified: !!u.emailVerified } : null;
      if (u) track(F.waitForPendingWrites(fs)).catch(() => {});
      listeners.forEach(cb => { try { cb(current); } catch (e) { console.error(e); } });
    });
    resolveReady(true);
  } catch (e) {
    console.error('Firebase failed to load', e);
    api.loadError = e;
    resolveReady(false);
  }
})();
