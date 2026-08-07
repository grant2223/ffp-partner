/* ═══════════════════════════════════════════════════════════════
   FFP PROVIDER VENUE QR LOADER · v3
   File path: ffp-provider-venue-qr-loader.js (repo root)
   On-load log: [FFP Venue QR v3] Loaded ✓
   v3: Two-column Check-ins layout — QR now injects at the top of the left
       (#checkin-left) column, above the session check-in card. Falls back to
       the old anchor if #checkin-left isn't present.
   Shows the venue's check-in QR + FFP Passport number in the Check-ins panel,
   with a Download (PNG) button so the provider can print it and display it at
   the counter. The QR encodes the member check-in link
   (ffp-member-dashboard.html?venue=<provider_id>) — the same venue id the
   member scan flow reads. Reads providers.business_name (RLS lets a provider
   read their own row). QR rendered client-side via qrcodejs (CDN).

   v2 — Download now exports a PADDED, white, ROUNDED-CORNER PNG rendered at 4×
   for crisp printing (was a bare 200×200 canvas that cut off right at the
   square edge with no quiet-zone margin).
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  // Smart landing: members check in, new visitors join FFP (14-day trial) with this partner's referral code.
  var MEMBER_APP = 'https://findfitpeople.com/visit';
  var API = 'https://ffp-passport-backend.vercel.app';
  var refLink = '';
  var QR_LIB = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
  function esc(s) {
    if (typeof window.escHtml === 'function') return window.escHtml(s);
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function waitFor(check, ms) {
    return new Promise(function (resolve) {
      var t = 0, lim = Math.ceil((ms || 30000) / 150);
      var iv = setInterval(function () { if (check() || t++ >= lim) { clearInterval(iv); resolve(check()); } }, 150);
    });
  }
  function providerId() { return window.FFP_PROVIDER && window.FFP_PROVIDER.id; }
  var info = { passport_no: '', business_name: '' };
  function injectStyles() {
    if (document.getElementById('ffp-venue-qr-css')) return;
    var s = document.createElement('style');
    s.id = 'ffp-venue-qr-css';
    s.textContent = [
      '#ffp-venue-qr{margin-bottom:22px;}',
      '#ffp-venue-qr .vq-card{background:rgba(15,37,49,.05);border:1px solid var(--ffp-border,rgba(15,37,49,.08));border-radius:14px;padding:18px;text-align:center;}',
      '#ffp-venue-qr .vq-head{display:flex;align-items:center;justify-content:center;gap:8px;font-size:15px;font-weight:800;color:var(--ffp-text,#0e2531);margin-bottom:4px;}',
      '#ffp-venue-qr .vq-head .ms{color:var(--ffp-yellow,#2b3942);}',
      '#ffp-venue-qr .vq-sub{font-size:12px;color:var(--ffp-text-muted,#566069);margin-bottom:16px;line-height:1.5;}',
      '#ffp-venue-qr .vq-qrwrap{display:inline-block;background:#fff;padding:20px;border-radius:18px;}',
      '#ffp-venue-qr #venue-qr-box img,#ffp-venue-qr #venue-qr-box canvas{display:block;}',
      '#ffp-venue-qr .vq-name{font-size:15px;font-weight:800;color:var(--ffp-text,#0e2531);margin-top:14px;}',
      '#ffp-venue-qr .vq-pp{font-size:12px;font-weight:700;letter-spacing:1px;color:var(--ffp-yellow,#2b3942);margin-top:3px;}',
      '#ffp-venue-qr .vq-dl{margin-top:16px;}',
      '#ffp-venue-qr .vq-ref{margin-top:14px;text-align:left;}',
      '#ffp-venue-qr .vq-ref .vq-head{justify-content:flex-start;}',
      '#ffp-venue-qr .vq-ref .vq-sub{margin-bottom:12px;text-align:left;}',
      '#ffp-venue-qr .vq-reflink{display:flex;align-items:center;gap:8px;background:#fff;border:1px solid var(--ffp-border,rgba(15,37,49,.12));border-radius:10px;padding:9px 11px;}',
      '#ffp-venue-qr .vq-reflink span{flex:1;font-size:12.5px;font-weight:700;color:var(--ffp-text,#0e2531);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '#ffp-venue-qr .vq-reflink .btn{flex:none;display:inline-flex;align-items:center;gap:5px;font-size:12px;padding:7px 11px;}',
      // Dedicated "Refer & earn" panel (same look, reused classes).
      '#ffp-refer .vq-card{background:rgba(15,37,49,.05);border:1px solid var(--ffp-border,rgba(15,37,49,.08));border-radius:14px;padding:20px;text-align:center;margin-bottom:16px;}',
      '#ffp-refer .vq-hero{font-size:34px;font-weight:900;color:var(--ffp-text,#0e2531);letter-spacing:-1px;line-height:1;}',
      '#ffp-refer .vq-hero small{display:block;font-size:12px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;color:var(--ffp-text-muted,#566069);margin-top:6px;}',
      '#ffp-refer .vq-sub{font-size:13px;color:var(--ffp-text-muted,#566069);line-height:1.55;}',
      '#ffp-refer .vq-qrwrap{display:inline-block;background:#fff;padding:20px;border-radius:18px;margin-top:6px;}',
      '#ffp-refer #refer-qr-box img,#ffp-refer #refer-qr-box canvas{display:block;}',
      '#ffp-refer .vq-name{font-size:15px;font-weight:800;color:var(--ffp-text,#0e2531);margin-top:14px;}',
      '#ffp-refer .vq-dl{margin-top:16px;}',
      '#ffp-refer .vq-reflink{display:flex;align-items:center;gap:8px;background:#fff;border:1px solid var(--ffp-border,rgba(15,37,49,.12));border-radius:10px;padding:10px 12px;margin-top:12px;}',
      '#ffp-refer .vq-reflink span{flex:1;font-size:12.5px;font-weight:700;color:var(--ffp-text,#0e2531);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:left;}',
      '#ffp-refer .vq-reflink .btn{flex:none;display:inline-flex;align-items:center;gap:5px;font-size:12px;padding:8px 12px;}',
      '#ffp-refer .vq-steps{text-align:left;margin-top:8px;}',
      '#ffp-refer .vq-step{display:flex;gap:11px;align-items:flex-start;padding:9px 0;font-size:13px;color:var(--ffp-text,#0e2531);font-weight:600;line-height:1.5;}',
      '#ffp-refer .vq-step .n{flex:none;width:22px;height:22px;border-radius:50%;background:var(--ffp-yellow,#f2a900);color:#3a2d00;font-size:12px;font-weight:900;display:flex;align-items:center;justify-content:center;}',
      '#ffp-refer .vq-lock{display:flex;gap:9px;align-items:flex-start;background:rgba(242,169,0,.1);border-radius:12px;padding:13px 14px;font-size:12.5px;font-weight:600;color:var(--ffp-text,#0e2531);line-height:1.55;text-align:left;}',
      '#ffp-refer .vq-lock .ms{color:#c78700;flex:none;}'
    ].join('');
    document.head.appendChild(s);
  }
  function venueUrl() { return MEMBER_APP + '?venue=' + encodeURIComponent(providerId()); }
  function loadQrLib(cb) {
    if (window.QRCode) return cb();
    var s = document.createElement('script');
    s.src = QR_LIB;
    s.onload = function () { cb(); };
    s.onerror = function () { cb(new Error('qr lib failed')); };
    document.head.appendChild(s);
  }
  function ensureContainer() {
    var panel = document.getElementById('panel-checkins');
    if (!panel) return null;
    var el = document.getElementById('ffp-venue-qr');
    if (!el) {
      el = document.createElement('div');
      el.id = 'ffp-venue-qr';
      // v3: two-column Check-ins layout — drop the QR at the TOP of the left
      // ("check-in") column so it sits above the session check-in card.
      var left = document.getElementById('checkin-left');
      if (left) {
        left.insertBefore(el, left.firstChild);
      } else {
        // Fallback: original behaviour (after the panel intro, before the card)
        var anchor = panel.querySelector('.psub') || panel.querySelector('.checkin-card');
        if (anchor && anchor.nextSibling) anchor.parentNode.insertBefore(el, anchor.nextSibling);
        else if (anchor) anchor.parentNode.appendChild(el);
        else panel.appendChild(el);
      }
    }
    return el;
  }
  function render() {
    var el = ensureContainer();
    if (!el) return;
    el.innerHTML =
      '<div class="vq-card">' +
        '<div class="vq-head"><span class="ms">qr_code_2</span> Your venue QR</div>' +
        '<div class="vq-sub">Print this and display it at your counter. Members scan it to check in — and new visitors can join FFP.</div>' +
        '<div class="vq-qrwrap"><div id="venue-qr-box"></div></div>' +
        '<div class="vq-name">' + esc(info.business_name || 'Your venue') + '</div>' +
        (info.passport_no ? '<div class="vq-pp">FFP Passport No. ' + esc(info.passport_no) + '</div>' : '') +
        '<div class="vq-dl"><button class="btn btn-pri" onclick="FFPVenueQR.download()"><span class="ms">download</span> Download QR (PNG)</button></div>' +
      '</div>' +
      '<div class="vq-card vq-ref" id="vq-ref"><div class="vq-head"><span class="ms">redeem</span> Refer &amp; earn</div><div class="vq-refbody" id="vq-refbody"><div class="vq-sub">Checking your listing…</div></div></div>';
    renderRef();
    loadQrLib(function (err) {
      var box = document.getElementById('venue-qr-box');
      if (!box) return;
      box.innerHTML = '';
      if (err || !window.QRCode) { box.textContent = 'QR unavailable'; return; }
      try {
        new window.QRCode(box, {
          text: venueUrl(), width: 200, height: 200,
          colorDark: '#0a0a0a', colorLight: '#ffffff',
          correctLevel: window.QRCode.CorrectLevel.M
        });
      } catch (e) { box.textContent = 'QR unavailable'; }
    });
  }

  // Refer & earn card — gated on the SAME rule the backend enforces (claimed + admin-verified + complete profile).
  function renderRef() {
    var body = document.getElementById('vq-refbody');
    if (!body) return;
    fetch(API + '/api/venue/' + encodeURIComponent(providerId()) + '/join').then(function (r) { return r.json(); }).then(function (d) {
      if (!d || !d.ok) { body.innerHTML = '<div class="vq-sub">Couldn\'t load your referral status.</div>'; return; }
      if (d.unlocked && d.ref) {
        var link = 'findfitpeople.com/join?ref=' + d.ref;
        refLink = 'https://' + link;
        body.innerHTML =
          '<div class="vq-sub">Earn <b>10%</b> of every payment when someone joins FFP Passport through your QR or link — recurring. The check-in QR above is also your referral QR.</div>' +
          '<div class="vq-reflink"><span id="vq-reftext">' + esc(link) + '</span><button class="btn" onclick="FFPVenueQR.copyRef()"><span class="ms">content_copy</span> Copy link</button></div>';
      } else {
        body.innerHTML =
          '<div class="vq-sub">Refer members and earn <b>10%</b> commission, recurring. To unlock: get your listing <b>admin-verified</b> and complete your <b>profile</b> (name, category, city, about &amp; a photo) so you\'re live on FFP Explore.</div>';
      }
    }).catch(function () { body.innerHTML = '<div class="vq-sub">Couldn\'t load your referral status.</div>'; });
  }

  // Draw a rounded-rectangle path.
  function roundRectPath(ctx, x, y, w, h, r) {
    if (r > w / 2) r = w / 2;
    if (r > h / 2) r = h / 2;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // Build a print-ready PNG: white rounded card + generous quiet-zone padding
  // around the QR, rendered at 4× so it stays crisp when printed large.
  function buildPaddedPng(src) {
    var SCALE = 4;     // supersample for crisp print
    var QR = 200;      // logical QR size (matches render width/height)
    var PAD = 56;      // white quiet-zone padding around the QR (logical px)
    var RADIUS = 48;   // rounded corner radius (logical px)
    var sizeLogical = QR + PAD * 2;
    var size = sizeLogical * SCALE;
    var out = document.createElement('canvas');
    out.width = size;
    out.height = size;
    var ctx = out.getContext('2d');
    // White rounded background (gives both the padding AND the rounded corners)
    ctx.fillStyle = '#ffffff';
    roundRectPath(ctx, 0, 0, size, size, RADIUS * SCALE);
    ctx.fill();
    // Draw the QR centered, keeping crisp module edges (no smoothing)
    ctx.imageSmoothingEnabled = false;
    var dx = PAD * SCALE, dy = PAD * SCALE, dSize = QR * SCALE;
    ctx.drawImage(src, dx, dy, dSize, dSize);
    return out.toDataURL('image/png');
  }

  function triggerSave(dataUrl) {
    if (!dataUrl) { if (typeof window.showToast === 'function') window.showToast('QR not ready yet', 'error'); return; }
    var safe = String(info.passport_no || info.business_name || 'venue').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '') || 'venue';
    var a = document.createElement('a');
    a.href = dataUrl;
    a.download = 'FFP-Venue-QR-' + safe + '.png';
    document.body.appendChild(a); a.click(); a.remove();
  }

  function download() {
    var box = document.getElementById('venue-qr-box');
    if (!box) { triggerSave(null); return; }
    var canvas = box.querySelector('canvas');
    var img = box.querySelector('img');
    if (canvas) {
      try { triggerSave(buildPaddedPng(canvas)); }
      catch (e) { triggerSave(canvas.toDataURL('image/png')); }
      return;
    }
    if (img) {
      // qrcodejs may render an <img> on some browsers; load it fresh so it's
      // fully decoded before we draw it onto the padded canvas.
      var im = new Image();
      im.onload = function () {
        try { triggerSave(buildPaddedPng(im)); }
        catch (e) { triggerSave(img.src); }
      };
      im.onerror = function () { triggerSave(img.src); };
      im.src = img.src;
      return;
    }
    triggerSave(null);
  }

  function copyRef() {
    if (!refLink) return;
    try {
      navigator.clipboard.writeText(refLink).then(function () {
        var t = document.querySelector('#vq-refbody .vq-reflink .btn');
        if (t) { var h = t.innerHTML; t.innerHTML = '<span class="ms">check</span> Copied'; setTimeout(function () { t.innerHTML = h; }, 1600); }
      });
    } catch (e) {}
  }
  // ── Dedicated "Refer & earn" panel (its own nav item) ──────────────────────
  function downloadRefer() {
    var box = document.getElementById('refer-qr-box');
    if (!box) { triggerSave(null); return; }
    var canvas = box.querySelector('canvas'); var img = box.querySelector('img');
    if (canvas) { try { triggerSave(buildPaddedPng(canvas)); } catch (e) { triggerSave(canvas.toDataURL('image/png')); } return; }
    if (img) { var im = new Image(); im.onload = function () { try { triggerSave(buildPaddedPng(im)); } catch (e) { triggerSave(img.src); } }; im.onerror = function () { triggerSave(img.src); }; im.src = img.src; return; }
    triggerSave(null);
  }
  function copyReferLink() {
    if (!refLink) return;
    try {
      navigator.clipboard.writeText(refLink).then(function () {
        var t = document.querySelector('#ffp-refer .vq-reflink .btn');
        if (t) { var h = t.innerHTML; t.innerHTML = '<span class="ms">check</span> Copied'; setTimeout(function () { t.innerHTML = h; }, 1600); }
        if (typeof window.showToast === 'function') window.showToast('Referral link copied', 'success');
      });
    } catch (e) {}
  }
  async function renderRefer() {
    var panel = document.getElementById('panel-refer');
    if (!panel) return;
    injectStyles();
    var host = document.getElementById('ffp-refer');
    if (!host) { host = document.createElement('div'); host.id = 'ffp-refer'; panel.appendChild(host); }
    host.innerHTML = '<div class="vq-card"><div class="vq-sub">Loading your referral program…</div></div>';
    if (!info.business_name) { try { await fetchInfo(); } catch (e) {} }
    var pid = providerId();
    if (!pid) { host.innerHTML = '<div class="vq-card"><div class="vq-sub">Sign in to your venue to see your referral program.</div></div>'; return; }
    var d = null;
    try { d = await fetch(API + '/api/venue/' + encodeURIComponent(pid) + '/join').then(function (r) { return r.json(); }); } catch (e) {}
    if (!d || !d.ok) { host.innerHTML = '<div class="vq-card"><div class="vq-sub">Couldn\'t load your referral status — try again.</div></div>'; return; }

    if (d.unlocked && d.ref) {
      var link = 'findfitpeople.com/join?ref=' + d.ref;
      refLink = 'https://' + link;
      host.innerHTML =
        '<div class="vq-card">' +
          '<div class="vq-hero">10%<small>Recurring commission</small></div>' +
          '<div class="vq-sub" style="margin-top:12px;">Earn <b>10% of every payment</b> when someone joins FFP Passport through your QR or link — for as long as they stay a member.</div>' +
        '</div>' +
        '<div class="vq-card">' +
          '<div class="vq-head" style="justify-content:center;"><span class="ms">qr_code_2</span> Your referral QR</div>' +
          '<div class="vq-sub">Print it or show it at your counter. New visitors scan → join FFP Passport (14-day free trial) → you earn. It doubles as your check-in QR.</div>' +
          '<div class="vq-qrwrap"><div id="refer-qr-box"></div></div>' +
          '<div class="vq-name">' + esc(info.business_name || 'Your venue') + '</div>' +
          '<div class="vq-dl"><button class="btn btn-pri" onclick="FFPVenueQR.downloadRefer()"><span class="ms">download</span> Download QR (PNG)</button></div>' +
          '<div class="vq-reflink"><span>' + esc(link) + '</span><button class="btn" onclick="FFPVenueQR.copyReferLink()"><span class="ms">content_copy</span> Copy link</button></div>' +
        '</div>' +
        '<div class="vq-card" style="text-align:left;">' +
          '<div class="vq-head"><span class="ms">insights</span> How it works</div>' +
          '<div class="vq-steps">' +
            '<div class="vq-step"><span class="n">1</span><span>Display your QR at the venue, or share your link online.</span></div>' +
            '<div class="vq-step"><span class="n">2</span><span>A new visitor scans and joins FFP Passport (14-day free trial).</span></div>' +
            '<div class="vq-step"><span class="n">3</span><span>You earn <b>10%</b> of every payment they make — recurring, paid to your FFP earnings.</span></div>' +
          '</div>' +
        '</div>';
      loadQrLib(function (err) {
        var box = document.getElementById('refer-qr-box'); if (!box) return; box.innerHTML = '';
        if (err || !window.QRCode) { box.textContent = 'QR unavailable'; return; }
        try { new window.QRCode(box, { text: venueUrl(), width: 200, height: 200, colorDark: '#0a0a0a', colorLight: '#ffffff', correctLevel: window.QRCode.CorrectLevel.M }); }
        catch (e) { box.textContent = 'QR unavailable'; }
      });
    } else {
      host.innerHTML =
        '<div class="vq-card">' +
          '<div class="vq-hero">10%<small>Recurring commission</small></div>' +
          '<div class="vq-sub" style="margin-top:12px;">Refer members and earn <b>10%</b> of every FFP Passport payment they make — recurring.</div>' +
        '</div>' +
        '<div class="vq-card" style="text-align:left;">' +
          '<div class="vq-head"><span class="ms">lock</span> Unlock your referral program</div>' +
          '<div class="vq-steps">' +
            '<div class="vq-step"><span class="n">1</span><span>Complete your <b>profile</b> — name, category, city, about &amp; a photo — so you\'re live on FFP Explore.</span></div>' +
            '<div class="vq-step"><span class="n">2</span><span>Get your listing <b>verified</b> by the FFP team.</span></div>' +
          '</div>' +
          '<div class="vq-lock" style="margin-top:6px;"><span class="ms">bolt</span><span>Once verified &amp; complete, your QR and referral link appear here and start earning.</span></div>' +
        '</div>';
    }
  }

  window.FFPVenueQR = { download: download, copyRef: copyRef, renderRefer: renderRefer, downloadRefer: downloadRefer, copyReferLink: copyReferLink };
  async function fetchInfo() {
    var pid = providerId();
    if (!pid) return;
    try {
      // providers has no passport_no column (that's a members field) — selecting it 400'd the query
      // and left the QR card blank. Select only business_name.
      var res = await window.supabase.from('providers').select('business_name').eq('id', pid).maybeSingle();
      if (res.data) { info.business_name = res.data.business_name || ''; }
    } catch (e) {}
  }
  async function init() {
    var ok = await waitFor(function () {
      return window.supabase && document.getElementById('panel-checkins') && providerId();
    }, 30000);
    if (!ok) { console.warn('[FFP Venue QR] deps not ready'); return; }
    injectStyles();
    await fetchInfo();
    render();
    console.log('[FFP Venue QR v3] Loaded ✓');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
