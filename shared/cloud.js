// Cloud saving through Firebase (Auth + Firestore with offline cache).
// Exposes window.Cloud for the app. If no config is set, Cloud.ready resolves to false.
const V = '10.14.1';
const base = `https://www.gstatic.com/firebasejs/${V}/`;

let resolveReady;
const ready = new Promise(r => { resolveReady = r; });
const listeners = [];
let current;            // undefined = not known yet, null = signed out
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

    // Same shape the app already uses: collection().doc(id).set/delete and collection().get()
    api.collection = () => {
      const u = auth.currentUser; if (!u) throw new Error('Not signed in');
      const col = F.collection(fs, 'users', u.uid, 'items');
      return {
        // Writes land in the phone's offline cache straight away and sync when there is signal.
        // We don't wait for the server, otherwise saves would stall with no signal.
        doc: id => ({
          set: data => { F.setDoc(F.doc(col, id), data).catch(report); return Promise.resolve(); },
          delete: () => { F.deleteDoc(F.doc(col, id)).catch(report); return Promise.resolve(); }
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
      const p = F.setDoc(F.doc(itemsCol(), id), data);
      return Promise.race([p, new Promise(r => setTimeout(r, 6000))]);
    };
    api.deleteItem = id => { F.deleteDoc(F.doc(itemsCol(), id)).catch(report); return Promise.resolve(); };
    api.putItem = (id, data) => { F.setDoc(F.doc(itemsCol(), id), data).catch(report); return Promise.resolve(); };
    // all documents of one kind, e.g. 'forklift'
    api.listKind = async kind => {
      const q = F.query(itemsCol(), F.where('kind', '==', kind)); let s;
      try { s = await F.getDocs(q); } catch (e) { s = await F.getDocsFromCache(q); }
      return s.docs.map(d => ({ id: d.id, data: d.data() }));
    };
    // ---- shared: jobs loaded by the office, admin role, user directory ----
    api.email = () => String((auth.currentUser && auth.currentUser.email) || '').trim().toLowerCase();
    api.isAdmin = async () => { try { const s = await F.getDoc(F.doc(fs, 'admins', api.email())); return s.exists(); } catch (e) { return false; } };
    api.saveUser = data => { const u = auth.currentUser; if (!u) return Promise.resolve(); return F.setDoc(F.doc(fs, 'users', u.uid), data, { merge:true }).catch(() => {}); };
    // a technician's jobs (null when they can't be read, e.g. rules not set up yet)
    api.myJobs = async () => {
      const q = F.query(F.collection(fs, 'jobs'), F.where('tech', '==', api.email())); let s;
      try { s = await F.getDocs(q); } catch (e) { try { s = await F.getDocsFromCache(q); } catch (_) { return null; } }
      return s.docs.map(d => Object.assign({ id: d.id }, d.data()));
    };
    api.updateJob = (id, fields) => { F.updateDoc(F.doc(fs, 'jobs', id), fields).catch(report); return Promise.resolve(); };
    // admin only
    api.allJobs = async () => (await F.getDocs(F.collection(fs, 'jobs'))).docs.map(d => Object.assign({ id: d.id }, d.data()));
    api.putJobs = async list => {
      for (let i = 0; i < list.length; i += 400){
        const b = F.writeBatch(fs); list.slice(i, i + 400).forEach(j => { const { id, ...data } = j; b.set(F.doc(fs, 'jobs', id), data, { merge:true }); });
        await b.commit();
      }
    };
    api.deleteJob = id => F.deleteDoc(F.doc(fs, 'jobs', id));
    api.listUsers = async () => (await F.getDocs(F.collection(fs, 'users'))).docs.map(d => Object.assign({ uid: d.id }, d.data()));
    api.listKindOf = async (uid, kind) => (await F.getDocs(F.query(F.collection(fs, 'users', uid, 'items'), F.where('kind', '==', kind)))).docs.map(d => ({ id: d.id, data: d.data() }));
    api.signIn = (email, pw) => A.signInWithEmailAndPassword(auth, email, pw);
    api.signUp = (email, pw) => A.createUserWithEmailAndPassword(auth, email, pw);
    api.resetPassword = email => A.sendPasswordResetEmail(auth, email);
    api.signOut = () => A.signOut(auth);
    A.onAuthStateChanged(auth, u => {
      current = u ? { uid: u.uid, email: u.email } : null;
      listeners.forEach(cb => { try { cb(current); } catch (e) { console.error(e); } });
    });
    resolveReady(true);
  } catch (e) {
    console.error('Firebase failed to load', e);
    api.loadError = e;
    resolveReady(false);
  }
})();
