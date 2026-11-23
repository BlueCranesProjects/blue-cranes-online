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
      let p = null; try { p = await window.Cloud.getItem('profile'); } catch(e){}
      if (p && p.name){ p.uid = u.uid; BC.cacheProfile(p); }
      else if (cached && cached.uid === u.uid) p = cached;
      else { BC.goHome('?profile=1'); return; }
      if (!/[?&]embed=1/.test(location.search) && !/\/admin\/?/.test(location.pathname) && window.Cloud.isAdmin){ try { if (await window.Cloud.isAdmin()){ location.replace(BC.home + 'admin/'); return; } } catch(e){} }
      try { if (window.Cloud.saveUser) window.Cloud.saveUser({ email:String(u.email || '').toLowerCase(), name:(p && p.name) || '', seen:new Date().toISOString() }); } catch(e){}
      resolve({ user:u, profile:p });
    });
  });

  // Phones: share sheet (WhatsApp, Files, email…). Elsewhere: normal download. Several files go in one share.
  BC.saveFiles = async (files, title) => {
    const list = files.map(f => new File([f.blob], f.name, { type: f.type || f.blob.type || 'application/octet-stream' }));
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
    const map = [[/^Job_/i, 'Job PDF (print)'], [/^TECHNICIAN_Crane/i, 'Crane reports - technician'], [/^TECHNICIAN_Man_cage/i, 'Man cage reports - technician'], [/^Crane_hoist_reports/i, 'Crane reports'], [/^Man_cage_reports/i, 'Man cage reports'], [/^Man_Cage_Inspection/i, 'Man cage report'], [/^Forklift_reports/i, 'Forklift reports'],
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

  // Offline support for the whole app
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register(BC.home + 'sw.js', { scope: BC.home }).catch(() => {});
})();
