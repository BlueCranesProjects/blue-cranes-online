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
    await A.setPersistence(auth, A.browserLocalPersistence).catch(() => {});
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
