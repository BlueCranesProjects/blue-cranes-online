// Shared helpers for every Blue Cranes Online tool.
// Load after firebase-config.js and cloud.js:  <script src="../shared/app.js"></script>
(function(){
  'use strict';
  const PKEY = 'bco-profile';
  const BC = window.BC = {};

  // Where the home screen is, from any tool folder
  BC.home = (function(){ const s = document.currentScript && document.currentScript.src; return s ? new URL('../', s).href : '../'; })();

  // The signed-in person's profile, kept on the phone so tools open instantly (and offline)
  BC.cachedProfile = () => { try { const p = JSON.parse(localStorage.getItem(PKEY) || 'null'); return p && p.name ? p : null; } catch(e){ return null; } };
  BC.cacheProfile = p => { try { if (p) localStorage.setItem(PKEY, JSON.stringify(p)); else localStorage.removeItem(PKEY); } catch(e){} };
  BC.goHome = q => { location.href = BC.home + (q || ''); };

  // For tool pages: make sure someone is signed in with a profile, otherwise send them to the home screen.
  // Resolves with { user, profile } once confirmed (or straight away from the phone's copy when offline).
  BC.requireUser = () => new Promise(async resolve => {
    const cached = BC.cachedProfile();
    if (!window.Cloud && document.readyState === 'loading') await new Promise(r => document.addEventListener('DOMContentLoaded', r, { once:true }));
    const on = window.Cloud ? await window.Cloud.ready : false;
    if (!on){ resolve({ user:null, profile: cached || { name:'' } }); return; }   // cloud not set up: work on the phone
    let done = false;
    window.Cloud.onAuth(async u => {
      if (!u && done){   // already signed in on this page: a short sign-in hiccup (e.g. another frame starting up) is not a sign-out
        await new Promise(r => setTimeout(r, 3000)); if (window.Cloud.user && window.Cloud.user()) return; }
      if (!u){ BC.cacheProfile(null); const f = location.href.startsWith(BC.home) ? location.href.slice(BC.home.length).split(/[?#]/)[0].replace(/index\.html$/, '') : '';
        BC.goHome(/^[a-z]+\/$/.test(f) ? '?next=' + f.slice(0, -1) : ''); return; }   // come back here after signing in
      if (done) return; done = true;
      if (u.verified === false && window.Cloud.checkVerified){ BC.goHome(); return; }
      let p = null; try { p = await window.Cloud.getItem('profile'); } catch(e){}
      if (p && p.name){ p.uid = u.uid; BC.cacheProfile(p); }
      else if (cached && cached.uid === u.uid) p = cached;
      else { BC.goHome('?profile=1'); return; }
      // admins use the technician tools too (paper jobs, their own jobs) – no longer sent to Admin from these pages
      try { if (window.Cloud.saveUser) window.Cloud.saveUser({ email:String(u.email || '').toLowerCase(), name:(p && p.name) || '', seen:new Date().toISOString() }); } catch(e){}
      resolve({ user:u, profile:p });
    });
  });

  // After the phone / tablet was emptied (sign-out, or another person signed in): put the person's inventories,
  // saved reports and unfinished reports back on it from the account, so the job pages show them straight away.
  // Only fills in what is missing or older; returns how many things came back.
  BC.restoreDevice = async () => {
    let flag = null; try { flag = localStorage.getItem('bco-restore'); } catch(e){}
    if (!flag || !window.Cloud || !window.Cloud.listKind || !(window.Cloud.user && window.Cloud.user())) return 0;
    if (BC._restoring) return BC._restoring;
    BC._restoring = (async () => { let n = 0;
      const newer = (a, b) => !b || (a.savedAt || 0) > (b.savedAt || 0);
      // inventories
      const eq = await window.Cloud.listKind('equipment'); let lists = {}; try { lists = JSON.parse(localStorage.getItem('bco-equipment') || '{}') || {}; } catch(e){}
      eq.forEach(d => { const r = d.data; if (!r || !r.id) return; delete r.kind; const was = JSON.stringify(lists[r.id] || null); lists[r.id] = BC.mergeList(lists[r.id], r); if (JSON.stringify(lists[r.id]) !== was) n++; });
      BC.lsSet('bco-equipment', JSON.stringify(lists));
      // unfinished reports
      for (const [kind, key] of [['crane-draft', 'bc-crane-drafts'], ['forklift-draft', 'bc-forklift-drafts'], ['mancage-draft', 'bc-mancage-drafts']]){
        const rem = await window.Cloud.listKind(kind); let d = {}; try { d = JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch(e){}
        let ch = false; rem.forEach(x => { const r = x.data; if (r && r.id && r.state && newer(r, d[r.id])){ delete r.kind; d[r.id] = r; ch = true; n++; } });
        if (ch) try { localStorage.setItem(key, JSON.stringify(d)); } catch(e){}
      }
      // saved reports (same store the report pages use)
      for (const kind of ['crane', 'forklift', 'mancage']){
        const rem = await window.Cloud.listKind(kind); if (!rem.length) continue;
        const db = await new Promise((res, rej) => { const q = indexedDB.open('bc-' + kind, 1); q.onupgradeneeded = () => q.result.createObjectStore('reports', { keyPath:'id' }); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
        const have = await new Promise(res => { const out = {}; const c = db.transaction('reports').objectStore('reports').openCursor(); c.onsuccess = () => { const k = c.result; if (k){ out[k.value.id] = k.value; k.continue(); } else res(out); }; c.onerror = () => res(out); });
        await new Promise(res => { const t = db.transaction('reports', 'readwrite'), st = t.objectStore('reports');
          rem.forEach(x => { const r = x.data; if (r && r.id && newer(r, have[r.id])){ delete r.kind; st.put(r); n++; } }); t.oncomplete = t.onerror = t.onabort = () => res(); });
        db.close();
      }
      try { localStorage.removeItem('bco-restore'); } catch(e){}
      return n; })();
    try { return await BC._restoring; } catch(e){ console.error('Restore failed', e); return 0; } finally { BC._restoring = null; }
  };

  // Phones: share sheet (WhatsApp, Files, email…). Elsewhere: normal download. Several files go in one share.
  BC.saveFiles = async (files, title) => {
    const list = files.map(f => new File([f.blob], f.name, { type: f.type || f.blob.type || 'application/octet-stream' }));
    BC._dlAt = Date.now();
    if (navigator.canShare && navigator.share && navigator.canShare({ files:list })){
      try { await navigator.share({ files:list, title: title || list[0].name }); return 'shared'; }
      catch(e){ if (e && e.name === 'AbortError') return null; }
    }
    list.forEach((f, i) => setTimeout(() => {
      const url = URL.createObjectURL(f); const a = document.createElement('a');
      a.href = url; a.download = f.name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    }, i * 400));
    return 'downloaded';
  };
  BC.saveFile = (blob, name, type, title) => BC.saveFiles([{ blob, name, type }], title);

  // Short names inside zip folders: Windows can't unzip paths longer than 260 characters, and the folder already says
  // which job it is, so files are just "Inventory.pdf", "Certificates.pdf", "Crane reports.pdf", "Load test certificate C7101-5.pdf" …
  BC.zipFile = n => { n = String(n || 'file'); const ext = (/\.[a-z0-9]{2,4}$/i.exec(n) || [''])[0], b = n.slice(0, n.length - ext.length);
    const map = [[/^Job_/i, 'Job PDF (print)'], [/^TECHNICIAN_Crane/i, 'Crane reports - technician'], [/^TECHNICIAN_Man_cage/i, 'Man cage reports - technician'], [/^TECHNICIAN_Equipment_for_quote/i, 'Equipment for quote - technician'], [/^Report_and_time_card/i, 'Report and time card'], [/^Crane_hoist_reports/i, 'Crane reports'], [/^Man_cage_reports/i, 'Man cage reports'], [/^Man_Cage_Inspection/i, 'Man cage report'], [/^Forklift_reports/i, 'Forklift reports'],
      [/^Certificates/i, 'Certificates'], [/^Inventory/i, 'Inventory'], [/^Time.?sheet/i, 'Time sheet']];
    for (const [re, t] of map) if (re.test(b)) return t + ext;
    const m = /^(.+?)_((?:CR|C|F)\d[\w.-]*?)(?=_|$)/.exec(b);
    if (m) return (m[1].replace(/_/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase().replace(/^./, c => c.toUpperCase()) + ' ' + m[2]).slice(0, 60) + ext;
    return b.replace(/_/g, ' ').slice(0, 50).trim() + ext; };
  // In-page screens (time sheet views, Admin tabs and job forms, inventory screens, report lists) get their own steps in the browser history,
  // so the phone's back button and the on-screen ‹ go to the previous screen instead of leaving the page.
  // BC.viewHistory({ snap:() => {…where am I…}, restore:s => {…go there…}, render }) → { note(), canBack(), back(fallback) }; call note() after every render.
  BC.viewHistory = ({ snap, restore, render }) => {
    let restoring = false; const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const api = {
      start(){ try { const h = history.state; if (h && h.bcv){ restoring = true; try { restore(h.bcv); } finally { restoring = false; } } else history.replaceState({ bcv:snap(), d:0, y:0 }, ''); } catch(e){} },
      note(){ if (restoring) return; let s; try { s = snap(); } catch(e){ return; } const h = history.state; if (h && h.bcv && same(h.bcv, s)) return;
        try { if (h && h.bcv) history.replaceState(Object.assign({}, h, { y:window.scrollY }), ''); history.pushState({ bcv:s, d:((h && h.d) || 0) + 1, y:0 }, ''); } catch(e){} },
      canBack: () => !!(history.state && history.state.bcv && history.state.d > 0),
      back(fallback){ if (api.canBack()) history.back(); else if (fallback) fallback(); }
    };
    window.addEventListener('popstate', e => { const h = e.state; if (!h || !h.bcv) return; restoring = true; try { restore(h.bcv); render(); } catch(err){ console.error(err); } finally { restoring = false; }
      const y = h.y || 0; setTimeout(() => window.scrollTo(0, y), 30); });
    return api;
  };

  // a job's folder: "C124699 PERDEBERG CELLARS" (+ the date in front for exports of many jobs)
  BC.zipDir = (job, customer, date) => [date || '', String(job || 'no nr').replace(/\s+/g, ''), String(customer || '').trim().slice(0, 24).trim()]
    .filter(Boolean).join(' ').replace(/[\\/:*?"<>|]+/g, '-');

  // Report "Job details" that fold up into a short summary – used by every report (forklift, crane, future ones).
  // BC.foldDetails({ head, body, sum, badge, missing:() => ['customer', …], lines:() => ['line 1', 'line 2'] })
  // → { render(), reset() }: opens by itself when something is missing when a report loads, otherwise folded;
  //   after that only a tap on the header or summary opens / closes it. Page CSS: .sech/.sc/.chev and .jdsum.
  BC.foldDetails = o => {
    const E = t => String(t == null ? '' : t).replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));
    let open = null;
    const render = () => {
      if (!o.head) return; const miss = o.missing(); if (open === null) open = miss.length > 0;
      o.head.classList.toggle('open', open); o.head.setAttribute('aria-expanded', open); o.body.style.display = open ? '' : 'none';
      o.badge.textContent = miss.length ? miss.length + ' to fill in' : '✓ Done'; o.badge.classList.toggle('full', !miss.length);
      o.sum.style.display = open ? 'none' : '';
      o.sum.innerHTML = open ? '' : o.lines().filter(Boolean).map(E).join('<br>') + (miss.length ? '<br><span class="miss">Still to fill in: ' + E(miss.join(', ')) + '</span>' : '');
    };
    const tog = () => { open = !open; render(); };
    if (o.head){ o.head.onclick = tog; o.sum.onclick = tog; }
    // a "Fold up" button at the bottom of the details (data-jdclose), so it can be closed without scrolling back up
    if (o.body) o.body.querySelectorAll('[data-jdclose]').forEach(b => b.onclick = () => { open = false; render(); const t = o.head.getBoundingClientRect().top; if (t < 80) window.scrollTo({ top:Math.max(0, window.scrollY + t - 100) }); });
    return { render, reset(){ open = null; render(); } };
  };

  // Turn a photo/scan of a signature into a trimmed PNG with a see-through background
  BC.fileToSig = async file => {
    if (file.type && !/^image\//.test(file.type) && !/\.(heic|heif|jpe?g|png|webp|gif|bmp)$/i.test(file.name)) throw new Error('type');
    const im = await new Promise((res, rej) => { const fr = new FileReader(); fr.onerror = () => rej(new Error('read')); fr.onload = () => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('decode')); i.src = fr.result; }; fr.readAsDataURL(file); });
    const W0 = im.naturalWidth || im.width, H0 = im.naturalHeight || im.height; if (!W0 || !H0) throw new Error('decode');
    const sc = Math.min(1, 1000 / Math.max(W0, H0)), w = Math.max(1, Math.round(W0 * sc)), h = Math.max(1, Math.round(H0 * sc));
    const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.drawImage(im, 0, 0, w, h);
    const d = x.getImageData(0, 0, w, h), p = d.data, n = w * h, lum = new Uint8Array(n);
    for (let k = 0; k < n; k++) lum[k] = (p[k*4]*0.3 + p[k*4+1]*0.59 + p[k*4+2]*0.11) | 0;
    const hist = new Uint32Array(256); for (let k = 0; k < n; k++) hist[lum[k]]++; let acc = 0, paper = 255; for (let v = 0; v < 256; v++){ acc += hist[v]; if (acc >= n * 0.8){ paper = v; break; } }
    const cut = Math.max(40, paper - Math.max(35, paper * 0.22));
    let minX = w, minY = h, maxX = -1, maxY = -1, ink = 0;
    for (let k = 0; k < n; k++){ const i = k*4; if (lum[k] > cut){ p[i+3] = 0; } else { ink++; const a = Math.min(255, Math.round((cut - lum[k]) / Math.max(1, cut) * 255 * 2.2)); p[i] = 19; p[i+1] = 34; p[i+2] = 79; p[i+3] = Math.max(90, a); const X = k % w, Y = (k - X) / w; if (X < minX) minX = X; if (X > maxX) maxX = X; if (Y < minY) minY = Y; if (Y > maxY) maxY = Y; } }
    if (maxX < 0 || ink < 20) return c.toDataURL('image/png');
    x.putImageData(d, 0, 0); const pad = 8; minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad); maxX = Math.min(w - 1, maxX + pad); maxY = Math.min(h - 1, maxY + pad);
    const o = document.createElement('canvas'); o.width = maxX - minX + 1; o.height = maxY - minY + 1; o.getContext('2d').drawImage(c, minX, minY, o.width, o.height, 0, 0, o.width, o.height);
    return o.toDataURL('image/png');
  };

  // Back buttons marked data-back go back in the phone's history when the previous page was the one they lead to,
  // so the time sheet / inventory opens where you were instead of adding another page to go back through.
  // data-back="auto": back to whatever app page opened this one; data-back="match": only when that page is the link's target
  document.addEventListener('click', e => {
    const a = e.target && e.target.closest && e.target.closest('a[data-back]'); if (!a) return;
    let ref = null; try { ref = document.referrer ? new URL(document.referrer) : null; } catch(_){}
    if (!ref || ref.origin !== location.origin || ref.pathname === location.pathname || history.length < 2 || /[?&]embed=1/.test(ref.search)) return;
    if (!ref.pathname.startsWith(new URL(BC.home).pathname)) return;
    const clean = p => p.replace(/index\.html$/, '');
    if (a.dataset.back === 'match' && clean(ref.pathname) !== clean(new URL(a.href, location.href).pathname)) return;
    e.preventDefault(); history.back();
  });

  // Spell check on every page: words are checked (red underline, tap for the right spelling) and the phone's keyboard
  // corrects typing in notes, descriptions, locations and remarks. Numbers, codes, serial / job / cert numbers, emails and
  // registrations are left alone; names (customer, contact, technician, manufacturer) are underlined but never changed automatically.
  // A field can opt out with data-nospell.
  const SKIP_TYPE = /^(email|password|number|tel|url|date|time|datetime-local|month|week|color|range|file|checkbox|radio|hidden|button|submit|reset|image|search)$/i;
  const CODE = /serial|card|job|docno|doc|cert|reg|odo|swl|wll|lmi|ton|kg|mass|load|year|dom|phone|cell|tel|email|mail|pass|code|vin|plate|qty|count|hrs|hour|km|no$|nr|num|item|ref|search|model|^q$/i;
  const NAME = /name|cust|contact|client|tech|assist|company|who|sign|witness|eng|under|make|manuf/i;
  function tuneField(el){
    if (!el || el.dataset.spell || el.hasAttribute('data-nospell')) return;
    el.dataset.spell = '1';
    if (el.tagName === 'INPUT' && SKIP_TYPE.test(el.type || 'text')) return;
    const im = el.getAttribute('inputmode'); if (im && im !== 'text') return;
    if (el.classList.contains('num') || el.readOnly) return;
    const key = [el.id, el.name, el.dataset.f, el.dataset.k, el.getAttribute('autocomplete')].filter(Boolean).join(' ');
    if (el.tagName === 'INPUT' && CODE.test(key) && !/desc|note|remark|reason|loc|comment/i.test(key)) { el.spellcheck = false; el.setAttribute('autocorrect', 'off'); return; }
    el.spellcheck = true;
    if (el.tagName === 'INPUT' && NAME.test(key)) { el.setAttribute('autocorrect', 'off'); if (!el.hasAttribute('autocapitalize')) el.setAttribute('autocapitalize', 'words'); return; }
    if (!el.hasAttribute('autocorrect')) el.setAttribute('autocorrect', 'on');
    if (!el.hasAttribute('autocapitalize')) el.setAttribute('autocapitalize', 'sentences');
  }
  const tuneAll = root => { (root.querySelectorAll ? root.querySelectorAll('input, textarea') : []).forEach(tuneField); if (root.matches && root.matches('input, textarea')) tuneField(root); };
  function startSpell(){
    if (!document.documentElement.lang || document.documentElement.lang === 'en') document.documentElement.lang = 'en-ZA';   // South African English spelling (colour, metre…)
    tuneAll(document);
    new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType === 1) tuneAll(n); }))).observe(document.documentElement, { childList:true, subtree:true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startSpell, { once:true }); else startSpell();

  // ---------- inventories: never let an older copy undo newer work ----------
  // Every item (row) carries t = when it was last changed. Two copies of the same inventory are combined item by item:
  // the newer item wins, items only in one copy are kept, items deleted (l.del[id] = time) stay deleted.
  BC.mergeList = (a, b) => {
    if (!a || !a.rows) return b; if (!b || !b.rows) return a;
    const [nw, od] = (b.savedAt || 0) >= (a.savedAt || 0) ? [b, a] : [a, b];
    const out = Object.assign({}, od, nw);
    const del = Object.assign({}, od.del || {}); Object.entries(nw.del || {}).forEach(([k, v]) => { if (!del[k] || v > del[k]) del[k] = v; });
    const byO = new Map((od.rows || []).filter(r => r && r.id).map(r => [r.id, r])), inN = new Set();
    const rows = [];
    (nw.rows || []).forEach(r => { if (!r) return; if (!r.id){ rows.push(r); return; } inN.add(r.id); const o = byO.get(r.id); rows.push(o && (o.t || 0) > (r.t || 0) ? o : r); });
    (od.rows || []).forEach(r => { if (r && r.id && !inN.has(r.id)) rows.push(r); });
    out.rows = rows.filter(r => !(r.id && del[r.id] && del[r.id] >= (r.t || 0)));
    if (Object.keys(del).length) out.del = del;
    ['locs', 'pre', 'also'].forEach(k => { const u = [...new Set([...(od[k] || []), ...(nw[k] || [])])]; if (u.length) out[k] = u; });
    out.savedAt = Math.max(a.savedAt || 0, b.savedAt || 0);
    return out;
  };

  // ---------- time sheet days: two devices can't undo each other ----------
  // A day keeps when each of its fields last changed (ft) and each job carries t; jobs are matched by jid.
  // Combining two copies of the same day takes the newest value per field and per job; deleted jobs (del) stay deleted.
  BC.jobKey = (j, i) => j.jid || ('j_' + (j.startedAt || j.sched || ((j.card || '') + '_' + i)));
  BC.mergeSheet = (a, b) => {
    if (!a || typeof a !== 'object') return b; if (!b || typeof b !== 'object') return a;
    const [nw, od] = (b.savedAt || 0) >= (a.savedAt || 0) ? [b, a] : [a, b];
    const out = {}, fa = nw.ft || {}, fb = od.ft || {};
    new Set([...Object.keys(od), ...Object.keys(nw)]).forEach(k => { if (k === 'jobs' || k === 'del' || k === 'ft') return;
      out[k] = !(k in nw) ? od[k] : !(k in od) ? nw[k] : ((fb[k] || 0) > (fa[k] || 0) ? od[k] : nw[k]); });
    const ft = {}; new Set([...Object.keys(fa), ...Object.keys(fb)]).forEach(k => { ft[k] = Math.max(fa[k] || 0, fb[k] || 0); }); if (Object.keys(ft).length) out.ft = ft;
    const del = Object.assign({}, od.del || {}); Object.entries(nw.del || {}).forEach(([k, v]) => { if (!del[k] || v > del[k]) del[k] = v; });
    const jn = (nw.jobs || []).map((j, i) => [BC.jobKey(j, i), j]), jo = (od.jobs || []).map((j, i) => [BC.jobKey(j, i), j]);
    const mo = new Map(jo), seen = new Set(), jobs = [];
    jn.forEach(([k, j]) => { seen.add(k); const o = mo.get(k); jobs.push(Object.assign({}, o && (o.t || 0) > (j.t || 0) ? o : j, { jid:k })); });
    jo.forEach(([k, j]) => { if (!seen.has(k)) jobs.push(Object.assign({}, j, { jid:k })); });
    const live = jobs.filter(j => !(del[j.jid] && del[j.jid] >= (j.t || 0)));
    // keep the day in the order the jobs were started
    live.forEach((j, i) => j._o = i); live.sort((x, y) => (x.startedAt && y.startedAt ? String(x.startedAt).localeCompare(String(y.startedAt)) : 0) || x._o - y._o); live.forEach(j => delete j._o);
    out.jobs = live; if (Object.keys(del).length) out.del = del;
    out.savedAt = Math.max(a.savedAt || 0, b.savedAt || 0);
    return out;
  };
  // "Sync now" (tap the ☁ icon) and coming back to the app: pages listen for 'bc-sync' and fetch the latest from the server
  BC.lastSync = 0;
  BC.syncDone = () => { BC.lastSync = Date.now(); window.dispatchEvent(new Event('bc-synced')); };
  // just after a download or share (PDF viewer, share sheet, Downloads): coming back must not redraw the page – it stays exactly as it was
  BC._dlAt = 0; document.addEventListener('click', e => { const a = e.target && e.target.closest && e.target.closest('a[download]'); if (a) BC._dlAt = Date.now(); }, true);
  BC.justDownloaded = () => Date.now() - (BC._dlAt || 0) < 120000;
  { let last = 0; const fire = force => { if (/[?&]embed=1/.test(location.search)) return; if (!force && BC.justDownloaded()) return; if (!force && Date.now() - last < 15000) return; last = Date.now(); window.dispatchEvent(new Event('bc-sync')); };
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') fire(false); });
    window.addEventListener('pageshow', e => { if (e.persisted) fire(false); });
    BC.syncNow = () => fire(true); }
  // pages that fetch something set BC._syncHandled; on other pages "Sync now" is done straight away
  window.addEventListener('bc-sync', () => { if (!BC._syncHandled) setTimeout(BC.syncDone, 300); });
  // a page is busy when the person is typing or a box is open: then new data waits instead of redrawing under their fingers
  BC.busyTyping = () => { const a = document.activeElement; return !!(a && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable)) || !!document.querySelector('.modal-bg, #modal.show, .mbg'); };
  BC.toastSync = () => { const t = document.createElement('div'); t.setAttribute('role', 'status'); t.textContent = '✓ Up to date with the server';
    t.style.cssText = 'position:fixed;left:50%;top:16px;transform:translateX(-50%);z-index:9002;background:#15703D;color:#fff;border-radius:999px;padding:9px 16px;font:700 14px Inter,Arial,sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.2)';
    document.body.appendChild(t); setTimeout(() => t.remove(), 2200); };

  // ---------- the phone's own storage: never fail without saying so ----------
  // Photos live in the large photo store (IndexedDB), not in the small 5 MB storage the inventories and time sheets use.
  const PDB = () => BC._pdb || (BC._pdb = new Promise((res, rej) => { const q = indexedDB.open('bc-photos', 1); q.onupgradeneeded = () => q.result.createObjectStore('p'); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }));
  BC.photoStore = {
    get: async k => { try { const db = await PDB(); return await new Promise(r => { const g = db.transaction('p').objectStore('p').get(k); g.onsuccess = () => r(g.result || null); g.onerror = () => r(null); }); } catch(e){ return null; } },
    put: async (k, v) => { try { const db = await PDB(); await new Promise(r => { const t = db.transaction('p', 'readwrite'); t.objectStore('p').put(v, k); t.oncomplete = t.onerror = t.onabort = () => r(); }); return true; } catch(e){ return false; } },
    del: async k => { try { const db = await PDB(); await new Promise(r => { const t = db.transaction('p', 'readwrite'); t.objectStore('p').delete(k); t.oncomplete = t.onerror = t.onabort = () => r(); }); } catch(e){} }
  };
  // move photos an older version kept in the small storage over to the photo store (frees the space)
  BC.freeSpace = async () => {
    let keys = []; try { keys = Object.keys(localStorage).filter(k => /^bco-eqp-/.test(k)); } catch(e){ return 0; }
    let n = 0; for (const k of keys){ const v = localStorage.getItem(k); if (v != null && await BC.photoStore.put(k.slice(8), v)){ try { localStorage.removeItem(k); n++; } catch(e){} } }
    return n;
  };
  // save to the phone's storage; if it is full: free space and try again, and if that still fails say so loudly
  const failed = {};
  BC.lsSet = (k, v) => {
    try { localStorage.setItem(k, v); delete failed[k]; if (!Object.keys(failed).length && document.getElementById('bcStoreWarn')) BC.storageWarn(false); return true; } catch(e){
      failed[k] = v; BC.freeSpace().then(() => { Object.keys(failed).forEach(x => { try { localStorage.setItem(x, failed[x]); delete failed[x]; } catch(_){} }); if (Object.keys(failed).length) BC.storageWarn(); else BC.storageWarn(false); });
      return false; }
  };
  BC.storageWarn = (on = true) => {
    let b = document.getElementById('bcStoreWarn');
    if (!on){ if (b) b.remove(); return; }
    if (!document.body) return; if (!b){ b = document.createElement('div'); b.id = 'bcStoreWarn'; b.setAttribute('role', 'alert');
      b.style.cssText = 'position:fixed;left:8px;right:8px;top:8px;z-index:99999;background:#A12A1F;color:#fff;border-radius:12px;padding:12px 14px;font:600 14px/1.4 Inter,Arial,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.3)';
      document.body.appendChild(b); }
    b.innerHTML = '⚠ <b>This phone\'s storage is full.</b> Your latest changes are being saved to the server only – keep the app open with signal until the ☁ icon shows <b>Saved</b>. Then free space on the phone (old photos, apps) or ask the office for help. <button type="button" style="margin-left:6px;border:0;background:#fff;color:#A12A1F;border-radius:8px;padding:4px 10px;font-weight:800">OK</button>';
    b.querySelector('button').onclick = () => b.remove();
  };
  // start: move old photos out of the small storage (in the background)
  setTimeout(() => { BC.freeSpace().catch(() => {}); }, 1500);

  // ---------- save icon: is everything on the server? ----------
  // Cloud reports { pending, error, online }: ☁✓ Saved · ☁… Saving · ☁ Waiting for signal (kept on this phone) · ⚠ Not saved
  BC.saveIcon = () => {
    if (/[?&]embed=1/.test(location.search) || document.getElementById('bcSave')) return;
    const el = document.createElement('button'); el.type = 'button'; el.id = 'bcSave';
    el.style.cssText = 'position:fixed;left:8px;z-index:40;display:none;align-items:center;gap:5px;border:1px solid #D9E0EA;border-radius:999px;padding:4px 9px 4px 7px;font:700 11.5px Inter,Arial,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.12);cursor:pointer;background:#fff';
    document.body.appendChild(el);
    let st = { pending:0, error:null, online:navigator.onLine, last:0 }, shown = '';
    const cloud = d => `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.5 19a4.5 4.5 0 0 0 0-9h-1.3A7 7 0 1 0 4 15.3"/>${d}</svg>`;
    const view = () => {
      const s = st.error ? 'err' : st.pending && !st.online ? 'wait' : st.pending ? 'busy' : 'ok';
      const t = { ok:['#15703D', cloud('<path d="M8 17l2.5 2.5L16 14"/>'), 'Saved'], busy:['#7a5600', cloud('<path d="M8 18h.01M12 18h.01M16 18h.01"/>'), 'Saving…'],
        wait:['#7a5600', cloud('<path d="M9 15l6 6M15 15l-6 6"/>'), 'No signal'], err:['#A12A1F', cloud('<path d="M12 14v3M12 20h.01"/>'), 'Not saved'] }[s];
      el.style.color = t[0]; el.style.borderColor = s === 'ok' ? '#b9dcc5' : s === 'err' ? '#e3a59f' : '#f0dc8a'; el.style.background = s === 'ok' ? '#F2FAF4' : s === 'err' ? '#FDEDEC' : '#FFF8E1';
      el.innerHTML = t[1] + '<span>' + t[2] + '</span>'; el.setAttribute('aria-label', t[2]); shown = s; el.style.display = 'inline-flex'; place(); };
    // sit just above the bottom bar of the page (tabs, Submit report…)
    const place = () => { let h = 0; document.querySelectorAll('body *').forEach(n => { if (n === el) return; const cs = getComputedStyle(n); if (cs.position === 'fixed' && cs.bottom === '0px' && n.offsetHeight < 220 && n.offsetHeight > 0) h = Math.max(h, n.offsetHeight); });
      el.style.bottom = 'calc(' + (h + 8) + 'px + env(safe-area-inset-bottom, 0px))'; };
    el.onclick = () => { const m = { ok:'Everything is saved on the server' + (st.last ? ' (last save ' + new Date(st.last).toLocaleTimeString('en-ZA', { hour:'2-digit', minute:'2-digit' }) + ')' : '') + '.',
        busy:'Saving to the server…', wait:'No signal: your work is kept on this phone and goes to the server by itself as soon as there is signal. Don\'t sign out until it shows Saved.',
        err:'The last change could not be saved to the server' + (st.error ? ' (' + st.error + ')' : '') + '. It is kept on this phone – keep the app open with signal, or tell the office.' }[shown];
      let tip = document.getElementById('bcSaveTip'); if (!tip){ tip = document.createElement('div'); tip.id = 'bcSaveTip'; tip.setAttribute('role', 'status');
        tip.style.cssText = 'position:fixed;left:8px;right:8px;z-index:9001;background:#0B3575;color:#fff;border-radius:12px;padding:11px 14px;font:500 13.5px/1.45 Inter,Arial,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.25)'; document.body.appendChild(tip); }
      const ls = BC.lastSync ? ' Last checked with the server at ' + new Date(BC.lastSync).toLocaleTimeString('en-ZA', { hour:'2-digit', minute:'2-digit' }) + '.' : '';
      tip.innerHTML = ''; const tx = document.createElement('div'); tx.textContent = m + ls; tip.appendChild(tx);
      const sb = document.createElement('button'); sb.type = 'button'; sb.textContent = '↻ Sync now – get the latest from the server';
      sb.style.cssText = 'margin-top:8px;width:100%;border:0;border-radius:10px;padding:10px;background:#FBD220;color:#0B3575;font:800 14px Inter,Arial,sans-serif;cursor:pointer';
      sb.onclick = () => { sb.textContent = 'Syncing…'; sb.disabled = true; const done = () => { window.removeEventListener('bc-synced', done); tip.remove(); if (BC.toastSync) BC.toastSync(); }; window.addEventListener('bc-synced', done); BC.syncNow(); setTimeout(done, 12000); };
      tip.appendChild(sb);
      tip.style.bottom = 'calc(' + (parseFloat(el.style.bottom) || 8) + 'px + 40px)'; clearTimeout(BC._tipT); BC._tipT = setTimeout(() => tip.remove(), 8000); };
    window.addEventListener('resize', place); window.addEventListener('online', () => { st.online = true; view(); }); window.addEventListener('offline', () => { st.online = false; view(); });
    const hook = () => { if (window.Cloud && window.Cloud.onSync){ window.Cloud.onSync(s => { st = Object.assign(st, s, { online:navigator.onLine }); view(); }); return true; } return false; };
    if (!hook()){ const iv = setInterval(() => { if (hook()) clearInterval(iv); }, 300); setTimeout(() => clearInterval(iv), 15000); }
    setInterval(place, 3000);
  };
  { const go = () => { if (window.FIREBASE_CONFIG && window.FIREBASE_CONFIG.apiKey) BC.saveIcon(); }; if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go, { once:true }); else go(); }

  // Offline support for the whole app
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register(BC.home + 'sw.js', { scope: BC.home }).catch(() => {});
})();
