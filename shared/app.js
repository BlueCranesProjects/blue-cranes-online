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
      if (!u){ BC.cacheProfile(null); BC.goHome(); return; }
      if (done) return; done = true;
      let p = null; try { p = await window.Cloud.getItem('profile'); } catch(e){}
      if (p && p.name){ p.uid = u.uid; BC.cacheProfile(p); }
      else if (cached && cached.uid === u.uid) p = cached;
      else { BC.goHome('?profile=1'); return; }
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

  // Offline support for the whole app
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register(BC.home + 'sw.js', { scope: BC.home }).catch(() => {});
})();
