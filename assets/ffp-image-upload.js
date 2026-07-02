/* FFP Image Upload — shared uploader (v2, 2026-06-07)
   v2: PROPER member uploads. Direct Supabase upload still used for providers/admins (real auth session);
       MEMBERS (anon role) fall back to POST /api/storage/upload, which verifies their FFP refresh token
       and uploads with the service key. Lets us keep Storage write policies LOCKED (no anon/public write).
   (v1, 2026-06-05)
   ONE reusable image pipeline for every upload surface: pick → (optional crop) → resize → JPEG →
   Supabase Storage → return the public URL. Replaces the base64-in-DB pattern everywhere.

   WHY: user-uploaded images must live in Supabase Storage (CDN-served public URLs), NOT as base64 in
   Postgres columns. This module is the single source of truth for that. The existing avatar uploader
   (ffp-photo-upload.js) already does this for the `avatars` bucket; this generalises it for all other
   surfaces (provider logos/heroes, event/meetup/experience covers).

   STORAGE CONVENTION (matches the RLS on the new buckets):
     path = "{ownerUserId}/{key}.jpg"  where ownerUserId = the logged-in member id (auth.uid()).
     RLS lets a user write ONLY under their own "{auth.uid()}/" folder (admins can write anywhere).
     The caller is responsible for persisting the returned URL to its own table/column.

   PUBLIC API:
     window.FFPUpload.pick({ bucket, key, aspect, outW, outH, title, onDone(url), onError(e) })
        - opens the native file picker, crops to `aspect` (if Cropper.js is present), resizes to
          outW×outH (defaults 800×800), uploads, calls onDone(publicUrl).
        - aspect: number (w/h). 1 = square (logos/avatars), 16/9 ≈ 1.78 (cover banner), etc. Omit = free.
     await window.FFPUpload.uploadBlob(bucket, key, blob)  -> publicUrl   (low-level, no UI)

   PREREQS on the page (same as the avatar uploader):
     @supabase/supabase-js, assets/ffp-api-integration.js (JWT bridge → auth.uid()),
     and — only if you want cropping — cropperjs CSS+JS. Without Cropper, it resizes without cropping.
*/
(function () {
  'use strict';

  var cropper = null;
  var pending = null; // { bucket, key, outW, outH, aspect, pickRatio, onDone, onError }

  // Crop-ratio choices (shown only when the caller opts in with pickRatio:true). Each draws a little
  // proportional icon so the shape is obvious; tapping calls cropper.setAspectRatio.
  var RATIOS = [
    { label: 'Square',    r: 1,      w: 16, h: 16 },
    { label: 'Portrait',  r: 4 / 5,  w: 14, h: 18 },
    { label: 'Landscape', r: 4 / 3,  w: 22, h: 16 },
    { label: 'Wide',      r: 16 / 9, w: 24, h: 13 },
    { label: 'Free',      r: NaN,    w: 22, h: 16 }
  ];
  function approxEq(a, b) { if (isNaN(a) && isNaN(b)) return true; if (isNaN(a) || isNaN(b)) return false; return Math.abs(a - b) < 0.02; }
  function renderRatios() {
    var host = document.getElementById('ffp-imgup-ratios'); if (!host) return;
    var want = (pending && !isNaN(pending.aspect)) ? pending.aspect : NaN;
    host.innerHTML = RATIOS.map(function (rt, i) {
      var on = approxEq(rt.r, want) ? ' on' : '';
      return '<button type="button" class="iu-ratio' + on + '" data-i="' + i + '" onclick="window.FFPUpload._ratio(' + i + ')">' +
        '<span class="ic" style="width:' + rt.w + 'px;height:' + rt.h + 'px;"></span>' + rt.label + '</button>';
    }).join('');
  }
  function setRatio(i) {
    var rt = RATIOS[i]; if (!rt || !cropper) return;
    cropper.setAspectRatio(rt.r);
    if (pending) pending.aspect = rt.r;
    var host = document.getElementById('ffp-imgup-ratios');
    if (host) host.querySelectorAll('.iu-ratio').forEach(function (b) { b.classList.toggle('on', +b.dataset.i === i); });
  }

  function ownerId() {
    // The storage RLS requires the file's folder to equal auth.uid() — which is the `sub` claim of the
    // login JWT. Read it straight from the token so the folder ALWAYS matches the policy (members and
    // providers can have a record id that differs from their auth id, which caused a 400 on upload).
    try {
      var tok = window.FFPAuth && window.FFPAuth.getToken && window.FFPAuth.getToken();
      if (tok) {
        var parts = tok.split('.');
        if (parts.length === 3) {
          var b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
          while (b64.length % 4) b64 += '=';
          var payload = JSON.parse(atob(b64));
          if (payload && payload.sub) return String(payload.sub);
        }
      }
    } catch (e) { /* fall through to member id */ }
    try {
      var m = window.FFPAuth && window.FFPAuth.getMember && window.FFPAuth.getMember();
      return (m && m.id) || null;
    } catch (e2) { return null; }
  }

  // ── Low-level: upload a Blob and return the public URL ──
  // Providers/admins have a real Supabase session → direct owner-scoped upload works. MEMBERS are the
  // `anon` role (custom FFP JWT), so a direct upload is RLS-blocked → fall back to the server endpoint,
  // which verifies the member's token and uploads with the SERVICE key. Storage stays locked (no anon/public
  // write). The ?v= cache-bust makes a re-uploaded (stable-path) image actually refresh.
  function withV(url) { return url ? (url + '?v=' + Date.now()) : null; }
  async function uploadBlob(bucket, key, blob) {
    if (!bucket || !key) throw new Error('bucket and key are required');
    var safeKey = String(key).replace(/[^a-zA-Z0-9._-]/g, '_');
    var oid = (typeof ownerId === 'function') ? ownerId() : null;
    if (window.supabase && oid) {
      try {
        var path = oid + '/' + safeKey + '.jpg';
        var up = await window.supabase.storage.from(bucket).upload(path, blob, { contentType: 'image/jpeg', upsert: true, cacheControl: '3600' });
        if (!up.error) {
          var pub = window.supabase.storage.from(bucket).getPublicUrl(path);
          return withV((pub && pub.data && pub.data.publicUrl) || null);
        }
      } catch (e) { /* fall through to the server endpoint */ }
    }
    return await serverUpload(bucket, safeKey, blob);
  }
  function blobToB64(blob) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(String(r.result || '')); };
      r.onerror = function () { reject(new Error('Could not read image')); };
      r.readAsDataURL(blob);
    });
  }
  // Server-validated upload (members): the backend verifies the FFP refresh token + uploads with the service key.
  async function serverUpload(bucket, key, blob) {
    var refresh = null; try { refresh = localStorage.getItem('ffp_refresh'); } catch (e) {}
    if (!refresh) throw new Error('Please sign in again');
    var data = await blobToB64(blob);
    var API = window.FFP_API_BASE || 'https://ffp-passport-backend.vercel.app';
    var res = await fetch(API + '/api/storage/upload', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh: refresh, bucket: bucket, key: key, data: data })
    });
    var j = null; try { j = await res.json(); } catch (e) {}
    if (!res.ok || !j || !j.url) throw new Error((j && j.error) || 'Upload failed');
    return j.url;
  }

  // ── Resize an image source (data URL) to fit within maxW×maxH, return a JPEG blob ──
  function resizeToBlob(srcDataUrl, maxW, maxH) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () {
        var w = img.naturalWidth, h = img.naturalHeight;
        var scale = Math.min(1, maxW / w, maxH / h);
        var cw = Math.max(1, Math.round(w * scale)), ch = Math.max(1, Math.round(h * scale));
        var c = document.createElement('canvas'); c.width = cw; c.height = ch;
        var ctx = c.getContext('2d');
        ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
        ctx.fillStyle = '#0f1e2e'; ctx.fillRect(0, 0, cw, ch);
        ctx.drawImage(img, 0, 0, cw, ch);
        c.toBlob(function (b) { b ? resolve(b) : reject(new Error('Could not encode image')); }, 'image/jpeg', 0.85);
      };
      img.onerror = function () { reject(new Error('Could not read that image')); };
      img.src = srcDataUrl;
    });
  }

  function fileToDataUrl(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function (e) { resolve(e.target.result); };
      r.onerror = function () { reject(new Error('Could not read that file')); };
      r.readAsDataURL(file);
    });
  }

  // ── No-UI helper: take a File (from an <input> or drag-drop), resize, upload, return URL ──
  // For surfaces that already have their own file input/drag-drop and don't need a crop step.
  async function uploadFile(bucket, key, file, opts) {
    opts = opts || {};
    if (!file || !/^image\//.test(file.type || '')) throw new Error('Please pick an image');
    var dataUrl = await fileToDataUrl(file);
    var blob = await resizeToBlob(dataUrl, opts.maxW || 1280, opts.maxH || 1280);
    return uploadBlob(bucket, key, blob);
  }

  // ── Centre-crop to a square (size×size) JPEG blob — the default for fast multi-add ──
  function squareCropBlob(srcDataUrl, size) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () {
        var w = img.naturalWidth, h = img.naturalHeight;
        var s = Math.min(w, h);
        var sx = Math.round((w - s) / 2), sy = Math.round((h - s) / 2);
        var c = document.createElement('canvas'); c.width = size; c.height = size;
        var ctx = c.getContext('2d');
        ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
        ctx.fillStyle = '#0f1e2e'; ctx.fillRect(0, 0, size, size);
        ctx.drawImage(img, sx, sy, s, s, 0, 0, size, size);
        c.toBlob(function (b) { b ? resolve(b) : reject(new Error('Could not encode image')); }, 'image/jpeg', 0.85);
      };
      img.onerror = function () { reject(new Error('Could not read that image')); };
      img.src = srcDataUrl;
    });
  }

  // ── Pick MULTIPLE images at once, apply a DEFAULT crop, upload each, no per-photo modal ──
  //   pickMulti({ bucket, keyBase, mode:'square'|'full', outW, outH, limit, onEach(url,file), onAllDone(), onError(e) })
  //   - mode 'square' → centre-crop to a square; 'full' → keep aspect, just resize within the budget.
  //   - onEach fires as each upload finishes (so the caller's strip updates progressively).
  function pickMulti(opts) {
    opts = opts || {};
    if (!opts.bucket || !opts.keyBase) { (opts.onError || function () {})(new Error('bucket and keyBase required')); return; }
    if (!ownerId()) { (opts.onError || function (e) { alert(e.message); })(new Error('Please sign in again')); return; }
    var input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*'; input.multiple = true; input.style.display = 'none';
    input.addEventListener('change', async function (e) {
      var files = Array.prototype.slice.call((e.target && e.target.files) || []);
      if (e.target && e.target.parentNode) e.target.parentNode.removeChild(e.target);
      var limit = (opts.limit == null) ? files.length : Math.max(0, opts.limit);
      files = files.slice(0, limit);
      var mode = (opts.mode === 'full') ? 'full' : 'square';
      var budget = Math.max(opts.outW || 0, opts.outH || 0) || 1280;
      for (var i = 0; i < files.length; i++) {
        var f = files[i];
        if (!/^image\//.test(f.type || '')) continue;
        try {
          var dataUrl = await fileToDataUrl(f);
          var blob = (mode === 'square') ? await squareCropBlob(dataUrl, budget) : await resizeToBlob(dataUrl, budget, budget);
          if (blob && blob.size > 3 * 1024 * 1024) throw new Error('Image too large after compression');
          var key = String(opts.keyBase) + '-' + Date.now() + '-' + i;
          var url = await uploadBlob(opts.bucket, key, blob);
          if (opts.onEach) opts.onEach(url, f);
        } catch (err) { if (opts.onError) opts.onError(err); }
      }
      if (opts.onAllDone) opts.onAllDone();
    });
    document.body.appendChild(input);
    input.click();
  }

  // ── Crop modal (built once, reused), parametrised by aspect ──
  function ensureModal() {
    if (document.getElementById('ffp-imgup-modal')) return;
    var style = document.createElement('style');
    style.id = 'ffp-imgup-styles';
    style.textContent = [
      '#ffp-imgup-modal{display:none;position:fixed;inset:0;background:rgba(8,20,32,0.96);z-index:10000;flex-direction:column;}',
      '#ffp-imgup-modal.open{display:flex;}',
      '#ffp-imgup-modal .iu-header{padding:14px 18px;border-bottom:1px solid rgba(43,168,224,0.2);display:flex;justify-content:space-between;align-items:center;color:#fff;}',
      '#ffp-imgup-modal .iu-title{font-size:16px;font-weight:700;}',
      '#ffp-imgup-modal .iu-close{background:transparent;border:none;color:#fff;font-size:28px;cursor:pointer;padding:0 8px;line-height:1;}',
      '#ffp-imgup-modal .iu-body{flex:1;display:flex;align-items:center;justify-content:center;padding:16px;overflow:hidden;min-height:0;}',
      '#ffp-imgup-img{display:block;max-width:100%;max-height:62vh;}',
      '#ffp-imgup-modal .iu-footer{padding:14px 18px;border-top:1px solid rgba(43,168,224,0.2);display:flex;gap:10px;justify-content:flex-end;}',
      '#ffp-imgup-modal .iu-btn{padding:11px 22px;border-radius:8px;border:1px solid rgba(43,168,224,0.4);background:transparent;color:#fff;font-size:14px;font-weight:600;cursor:pointer;min-width:96px;}',
      '#ffp-imgup-modal .iu-btn-primary{background:#2ba8e0;border-color:#2ba8e0;}',
      '#ffp-imgup-modal .iu-btn:disabled{opacity:0.55;cursor:not-allowed;}',
      '#ffp-imgup-modal .iu-ratios{display:none;gap:8px;justify-content:center;flex-wrap:wrap;padding:12px 16px 2px;}',
      '#ffp-imgup-modal.show-ratios .iu-ratios{display:flex;}',
      '#ffp-imgup-modal .iu-ratio{background:transparent;border:1px solid rgba(43,168,224,0.35);color:#cfe0ee;border-radius:9px;padding:8px 10px 6px;font-size:11px;font-weight:800;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:5px;min-width:58px;font-family:inherit;}',
      '#ffp-imgup-modal .iu-ratio .ic{border:2px solid currentColor;border-radius:3px;display:block;}',
      '#ffp-imgup-modal .iu-ratio.on{background:#2ba8e0;border-color:#2ba8e0;color:#fff;}',
      '#ffp-imgup-modal .iu-hint{text-align:center;color:#8a99a8;font-size:11px;font-weight:600;padding:8px 16px 0;}',
      '@media (max-width:600px){#ffp-imgup-modal .iu-btn{flex:1;min-width:0;}#ffp-imgup-img{max-height:58vh;}}'
    ].join('\n');
    document.head.appendChild(style);
    var modal = document.createElement('div');
    modal.id = 'ffp-imgup-modal';
    modal.innerHTML = [
      '<div class="iu-header"><div class="iu-title" id="ffp-imgup-title">Crop image</div>',
      '<button class="iu-close" aria-label="Close" onclick="window.FFPUpload._close()">&times;</button></div>',
      '<div class="iu-body"><img id="ffp-imgup-img" alt=""></div>',
      '<div class="iu-ratios" id="ffp-imgup-ratios"></div>',
      '<div class="iu-hint" id="ffp-imgup-hint">Drag the photo to reposition &middot; scroll or pinch to zoom</div>',
      '<div class="iu-footer"><button class="iu-btn" onclick="window.FFPUpload._close()">Cancel</button>',
      '<button id="ffp-imgup-save" class="iu-btn iu-btn-primary" onclick="window.FFPUpload._save()">Save</button></div>'
    ].join('\n');
    document.body.appendChild(modal);
  }

  function openCrop(dataUrl) {
    ensureModal();
    var modal = document.getElementById('ffp-imgup-modal');
    var img = document.getElementById('ffp-imgup-img');
    var titleEl = document.getElementById('ffp-imgup-title');
    if (titleEl && pending && pending.title) titleEl.textContent = pending.title;
    // The modal is built once and reused. A successful upload closes it WITHOUT resetting the Save
    // button, so reset it every open — otherwise the 2nd+ crop is stuck on "Uploading…" / disabled.
    var saveBtn = document.getElementById('ffp-imgup-save');
    if (saveBtn) { saveBtn.textContent = 'Save'; saveBtn.disabled = false; }
    var wantRatios = !!(pending && pending.pickRatio);
    modal.classList.toggle('show-ratios', wantRatios);
    if (wantRatios) renderRatios();
    if (window.Cropper) {
      img.onload = function () {
        if (cropper) { cropper.destroy(); cropper = null; }
        cropper = new Cropper(img, {
          aspectRatio: (pending && !isNaN(pending.aspect)) ? pending.aspect : NaN,
          viewMode: 1, autoCropArea: 0.9, dragMode: 'move',
          background: false, zoomable: true, wheelZoomRatio: 0.15,
          guides: true, center: true, highlight: true, modal: true   // clearer crop frame (grid + dimmed surround)
        });
      };
      img.src = dataUrl;
      modal.classList.add('open');
      document.body.style.overflow = 'hidden';
    } else {
      // No Cropper on this page → skip crop, resize the raw image directly
      finish(dataUrl);
    }
  }

  function closeModal() {
    var modal = document.getElementById('ffp-imgup-modal');
    if (modal) modal.classList.remove('open');
    document.body.style.overflow = '';
    if (cropper) { cropper.destroy(); cropper = null; }
  }

  async function saveCrop() {
    if (!pending) return;
    var btn = document.getElementById('ffp-imgup-save');
    var orig = btn ? btn.textContent : '';
    if (btn) { btn.textContent = 'Uploading…'; btn.disabled = true; }
    try {
      if (!cropper) throw new Error('Crop not ready — close and try again');
      // When the ratio picker is on, the user may have chosen any shape → size the output to the actual
      // crop box (cap the long side to the caller's budget) so portrait/landscape aren't squashed back to a fixed box.
      var ow = pending.outW, oh = pending.outH;
      if (pending.pickRatio) {
        var d = cropper.getData(true);
        var ar = (d && d.width && d.height) ? (d.width / d.height) : 1;
        var budget = Math.max(pending.outW || 0, pending.outH || 0) || 1280;
        if (ar >= 1) { ow = budget; oh = Math.max(1, Math.round(budget / ar)); }
        else { oh = budget; ow = Math.max(1, Math.round(budget * ar)); }
      }
      var canvas = cropper.getCroppedCanvas({
        width: ow, height: oh,
        imageSmoothingEnabled: true, imageSmoothingQuality: 'high', fillColor: '#0f1e2e'
      });
      if (!canvas) throw new Error('Could not read the crop area');
      // Get the JPEG blob DIRECTLY off the cropped canvas — no dataURL round-trip (that re-decode
      // could stall and leave the upload hanging, which looked like "crop won't save").
      var blob = await new Promise(function (resolve, reject) {
        canvas.toBlob(function (b) { b ? resolve(b) : reject(new Error('Could not create the image')); }, 'image/jpeg', 0.85);
      });
      await uploadAndDone(blob);
      closeModal();
    } catch (e) {
      if (btn) { btn.textContent = orig; btn.disabled = false; }
      if (pending && pending.onError) pending.onError(e);
      else alert('Upload failed: ' + (e.message || 'unknown error'));
    }
  }

  async function uploadAndDone(blob) {
    if (!blob) throw new Error('Could not create the image');
    if (blob.size > 3 * 1024 * 1024) throw new Error('Image too large after compression — try a smaller one.');
    var url = await uploadBlob(pending.bucket, pending.key, blob);
    if (pending.onDone) pending.onDone(url);
  }

  // No-crop fallback (only used when Cropper.js isn't on the page): resize the raw image, then upload.
  async function finish(dataUrl) {
    var blob = await resizeToBlob(dataUrl, pending.outW, pending.outH);
    await uploadAndDone(blob);
  }

  function handleFile(file) {
    if (!/^image\/(jpeg|jpg|png|webp)$/i.test(file.type)) { alert('Please pick a JPEG, PNG, or WebP image.'); return; }
    if (file.size > 10 * 1024 * 1024) { alert('Image too large. Pick one under 10MB.'); return; }
    var reader = new FileReader();
    reader.onload = function (ev) { openCrop(ev.target.result); };
    reader.onerror = function () { alert('Could not read that file.'); };
    reader.readAsDataURL(file);
  }

  // ── High-level entry: open picker for a given target ──
  function pick(opts) {
    opts = opts || {};
    if (!opts.bucket || !opts.key) { (opts.onError || function () {})(new Error('bucket and key required')); return; }
    if (!ownerId()) { (opts.onError || function (e) { alert(e.message); })(new Error('Please sign in again')); return; }
    pending = {
      bucket: opts.bucket, key: String(opts.key),
      aspect: opts.aspect || NaN, pickRatio: !!opts.pickRatio,
      outW: opts.outW || 800, outH: opts.outH || 800,
      title: opts.title || 'Crop image',
      onDone: opts.onDone, onError: opts.onError
    };
    var input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*'; input.style.display = 'none';
    input.addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0];
      if (f) handleFile(f);
      if (e.target.parentNode) e.target.parentNode.removeChild(e.target);
    });
    document.body.appendChild(input);
    input.click();
  }

  // ── Crop a file the caller already has (e.g. from drag-drop) — opens the crop modal ──
  function cropFile(file, opts) {
    opts = opts || {};
    if (!opts.bucket || !opts.key) { (opts.onError || function () {})(new Error('bucket and key required')); return; }
    if (!ownerId()) { (opts.onError || function (e) { alert(e.message); })(new Error('Please sign in again')); return; }
    if (!file || !/^image\//.test(file.type || '')) { (opts.onError || function () {})(new Error('Please pick an image')); return; }
    pending = {
      bucket: opts.bucket, key: String(opts.key), aspect: opts.aspect || NaN, pickRatio: !!opts.pickRatio,
      outW: opts.outW || 800, outH: opts.outH || 800, title: opts.title || 'Crop image',
      onDone: opts.onDone, onError: opts.onError
    };
    handleFile(file);
  }

  window.FFPUpload = {
    pick: pick,
    pickMulti: pickMulti,
    cropFile: cropFile,
    uploadFile: uploadFile,
    uploadBlob: uploadBlob,
    squareCropBlob: squareCropBlob,
    _close: closeModal,
    _save: saveCrop,
    _ratio: setRatio
  };
})();
