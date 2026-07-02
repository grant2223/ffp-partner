/* FFP Feedback Widget - v5 (2026-06-04)
   v5: FIX — widget didn't open from the member topbar button. window.FFPFeedback was only defined at the
       END of build() (which runs on DOMContentLoaded), so the button's `window.FFPFeedback && .open()`
       could no-op silently. Now the API is exposed synchronously at load and open() builds the modal
       lazily (build() is idempotent). Robust regardless of load timing. (Member ref → ?v=5, provider too.)
   v4 (2026-06-03)
   v4: "Add photo" — users can attach a screenshot for visual support. Image is compressed
       client-side (canvas: max 1200px long edge, JPEG q0.7) to a small data URL and stored
       inline on the feedback row (feedback.photo_url) via submit_feedback's new p_photo_url
       arg — no storage bucket/RLS needed for this low-volume widget. Thumbnail preview +
       remove in the modal; admin Feedback panel shows the image (click to zoom).
   v3: category chips are now TEXT-ONLY (removed Material icon spans) so they render
       cleanly on both dashboards regardless of which icon font the host loads
       (provider uses Material Symbols, member uses Material Icons).
   v2: exposes window.FFPFeedback.open()/close() so a host page can trigger the modal;
       data-fab="off" suppresses the floating button (used on member/provider topbars).
   Shared widget included by BOTH the member and provider dashboards. Injects a
   floating "Feedback" button + modal, and writes a row to public.feedback via the
   JWT-authenticated window.supabase client. Admin reads these live in the Feedback panel.

   Include (member):   <script src="assets/ffp-feedback-widget.js" data-source="member"></script>
   Include (provider): <script src="assets/ffp-feedback-widget.js" data-source="provider"></script>

   Identity: members use the custom JWT (members.id via FFPAuth/localStorage); providers
   use a real Supabase auth session (auth.users.id via supabase.auth.getUser()).
   member_id must equal auth.uid() for the RLS insert, so we read it per source.
*/
(function () {
  'use strict';

  var SOURCE = 'member';
  var SHOW_FAB = true;
  try {
    var cs = document.currentScript;
    if (cs && cs.dataset && cs.dataset.source) SOURCE = cs.dataset.source;
    if (cs && cs.dataset && cs.dataset.fab === 'off') SHOW_FAB = false;
  } catch (e) {}

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function toast(msg, kind) {
    if (typeof window.showToast === 'function') { try { window.showToast(msg, kind || 'success'); return; } catch (e) {} }
    console.log('[FFP Feedback]', msg);
  }
  function getMember() {
    try { if (window.FFPAuth && typeof window.FFPAuth.getMember === 'function') return window.FFPAuth.getMember(); } catch (e) {}
    try { return JSON.parse(localStorage.getItem('ffp_member') || 'null'); } catch (e) { return null; }
  }

  var CATS = [
    { id: 'bug', label: 'Something broke', icon: 'bug_report' },
    { id: 'idea', label: 'Idea / request', icon: 'lightbulb' },
    { id: 'complaint', label: 'Complaint', icon: 'sentiment_dissatisfied' },
    { id: 'praise', label: 'Praise', icon: 'favorite' },
    { id: 'other', label: 'Other', icon: 'chat' }
  ];
  var picked = 'bug';
  var photoData = null;   // compressed JPEG data URL of an attached screenshot (optional)

  function injectCss() {
    if (document.getElementById('ffp-fb-css')) return;
    var st = document.createElement('style');
    st.id = 'ffp-fb-css';
    st.textContent = [
      '.ffp-fb-fab{position:fixed;right:18px;bottom:84px;z-index:9000;display:inline-flex;align-items:center;gap:7px;height:42px;padding:0 16px;border-radius:100px;background:#2ba8e0;color:#fff;font-family:inherit;font-size:13px;font-weight:800;letter-spacing:.3px;border:none;cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,.4);}',
      '.ffp-fb-fab:hover{background:#1980AD;}',
      '.ffp-fb-fab .material-icons,.ffp-fb-fab .ms{font-size:18px;}',
      '@media(min-width:769px){.ffp-fb-fab{bottom:24px;}}',
      '.ffp-fb-back{position:fixed;inset:0;background:rgba(0,0,0,.72);z-index:9001;display:none;align-items:center;justify-content:center;padding:20px;}',
      '.ffp-fb-back.open{display:flex;}',
      '.ffp-fb-modal{width:100%;max-width:440px;background:#0f1e2e;border:1px solid rgba(43,168,224,.22);border-radius:16px;overflow:hidden;box-shadow:0 18px 50px rgba(0,0,0,.5);color:#e8eef4;font-family:inherit;}',
      '.ffp-fb-head{padding:18px 20px;border-bottom:1px solid rgba(43,168,224,.1);display:flex;align-items:center;justify-content:space-between;}',
      '.ffp-fb-head .t{font-size:16px;font-weight:800;}',
      '.ffp-fb-x{background:#142a3f;border:none;color:#8a99a8;width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:18px;line-height:1;}',
      '.ffp-fb-body{padding:18px 20px;}',
      '.ffp-fb-lbl{font-size:10px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase;color:#8a99a8;margin:0 0 8px;}',
      '.ffp-fb-cats{display:flex;flex-wrap:wrap;gap:7px;margin-bottom:16px;}',
      '.ffp-fb-cat{display:inline-flex;align-items:center;gap:6px;padding:7px 12px;border-radius:100px;background:#142a3f;border:1px solid rgba(43,168,224,.22);color:#8a99a8;font-family:inherit;font-size:12px;font-weight:700;cursor:pointer;}',
      '.ffp-fb-cat.on{background:rgba(43,168,224,.16);border-color:#2ba8e0;color:#e8eef4;}',
      '.ffp-fb-cat .material-icons,.ffp-fb-cat .ms{font-size:15px;}',
      '.ffp-fb-ta{width:100%;min-height:110px;resize:vertical;background:#081420;border:1px solid rgba(43,168,224,.22);border-radius:10px;padding:12px 14px;color:#e8eef4;font-family:inherit;font-size:14px;font-weight:500;line-height:1.5;}',
      '.ffp-fb-ta:focus{outline:none;border-color:#2ba8e0;}',
      '.ffp-fb-foot{padding:14px 20px;border-top:1px solid rgba(43,168,224,.1);display:flex;justify-content:flex-end;gap:10px;}',
      '.ffp-fb-btn{height:40px;padding:0 18px;border-radius:10px;font-family:inherit;font-size:12px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;border:none;cursor:pointer;}',
      '.ffp-fb-btn.ghost{background:transparent;color:#8a99a8;border:1px solid rgba(43,168,224,.22);}',
      '.ffp-fb-btn.pri{background:#FFCC00;color:#000;}',
      '.ffp-fb-btn[disabled]{opacity:.5;cursor:not-allowed;}',
      '.ffp-fb-note{font-size:11px;color:#8a99a8;font-weight:600;margin-top:10px;line-height:1.5;}',
      '.ffp-fb-photo{margin-top:14px;}',
      '.ffp-fb-addphoto{display:inline-flex;align-items:center;gap:7px;height:36px;padding:0 14px;border-radius:9px;background:#142a3f;border:1px solid rgba(43,168,224,.22);color:#9dbdd0;font-family:inherit;font-size:12px;font-weight:700;cursor:pointer;}',
      '.ffp-fb-addphoto:hover{border-color:#2ba8e0;color:#e8eef4;}',
      '.ffp-fb-addphoto .material-icons,.ffp-fb-addphoto .ms{font-size:17px;}',
      '.ffp-fb-thumb{position:relative;display:inline-block;margin-top:4px;}',
      '.ffp-fb-thumb img{max-width:120px;max-height:120px;border-radius:9px;border:1px solid rgba(43,168,224,.22);display:block;}',
      '.ffp-fb-thumb-x{position:absolute;top:-8px;right:-8px;width:24px;height:24px;border-radius:50%;background:#ef4444;color:#fff;border:2px solid #0f1e2e;cursor:pointer;font-size:14px;line-height:1;display:flex;align-items:center;justify-content:center;}'
    ].join('');
    document.head.appendChild(st);
  }

  function catChips() {
    return CATS.map(function (c) {
      return '<button type="button" class="ffp-fb-cat' + (c.id === picked ? ' on' : '') +
        '" data-cat="' + c.id + '">' + esc(c.label) + '</button>';
    }).join('');
  }

  function build() {
    if (document.getElementById('ffp-fb-back')) return;   // v5: idempotent — modal already built
    injectCss();

    if (SHOW_FAB) {
      var fab = document.createElement('button');
      fab.className = 'ffp-fb-fab';
      fab.type = 'button';
      fab.innerHTML = 'Feedback';
      fab.onclick = open;
      document.body.appendChild(fab);
    }

    var back = document.createElement('div');
    back.className = 'ffp-fb-back';
    back.id = 'ffp-fb-back';
    back.innerHTML =
      '<div class="ffp-fb-modal" role="dialog" aria-label="Send feedback">' +
        '<div class="ffp-fb-head"><div class="t">Send feedback</div>' +
          '<button class="ffp-fb-x" type="button" aria-label="Close">&times;</button></div>' +
        '<div class="ffp-fb-body">' +
          '<div class="ffp-fb-lbl">What is this about?</div>' +
          '<div class="ffp-fb-cats" id="ffp-fb-cats">' + catChips() + '</div>' +
          '<div class="ffp-fb-lbl">Your message</div>' +
          '<textarea class="ffp-fb-ta" id="ffp-fb-msg" placeholder="Tell us what happened, what you would like, or what is working well."></textarea>' +
          '<div class="ffp-fb-photo">' +
            '<input type="file" id="ffp-fb-file" accept="image/*" style="display:none">' +
            '<button type="button" class="ffp-fb-addphoto" id="ffp-fb-addphoto"><span class="material-icons">add_a_photo</span>Add photo</button>' +
            '<div class="ffp-fb-thumb" id="ffp-fb-thumb" style="display:none"><img id="ffp-fb-thumb-img" alt="attachment preview"><button type="button" class="ffp-fb-thumb-x" id="ffp-fb-thumb-x" aria-label="Remove photo">&times;</button></div>' +
          '</div>' +
          '<div class="ffp-fb-note">Goes straight to the FFP team. We read every message. Add a screenshot to show us exactly what you mean.</div>' +
        '</div>' +
        '<div class="ffp-fb-foot">' +
          '<button class="ffp-fb-btn ghost" type="button" id="ffp-fb-cancel">Cancel</button>' +
          '<button class="ffp-fb-btn pri" type="button" id="ffp-fb-send">Send</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(back);

    back.addEventListener('click', function (e) { if (e.target === back) close(); });
    back.querySelector('.ffp-fb-x').onclick = close;
    document.getElementById('ffp-fb-cancel').onclick = close;
    document.getElementById('ffp-fb-send').onclick = submit;
    document.getElementById('ffp-fb-cats').addEventListener('click', function (e) {
      var b = e.target.closest('.ffp-fb-cat'); if (!b) return;
      picked = b.dataset.cat;
      document.querySelectorAll('#ffp-fb-cats .ffp-fb-cat').forEach(function (x) { x.classList.toggle('on', x.dataset.cat === picked); });
    });
    // Photo attachment: pick → compress client-side → preview
    var fileInput = document.getElementById('ffp-fb-file');
    document.getElementById('ffp-fb-addphoto').onclick = function () { fileInput.value = ''; fileInput.click(); };
    fileInput.onchange = function () { var f = fileInput.files && fileInput.files[0]; if (f) compressImage(f, applyPhoto); };
    document.getElementById('ffp-fb-thumb-x').onclick = clearPhoto;

    // Let host pages trigger the modal from their own UI (e.g. topbar icon)
    window.FFPFeedback = { open: open, close: close };
  }

  function open() {
    // v5: build lazily on first open so the API never depends on DOMContentLoaded having fired.
    if (!document.getElementById('ffp-fb-back')) { try { build(); } catch (e) { console.error('[FFP Feedback] build-on-open failed:', e); } }
    var back = document.getElementById('ffp-fb-back');
    if (!back) return;
    back.classList.add('open');
    setTimeout(function () { var t = document.getElementById('ffp-fb-msg'); if (t) t.focus(); }, 50);
  }
  function close() { var b = document.getElementById('ffp-fb-back'); if (b) b.classList.remove('open'); }
  // v5: expose the API SYNCHRONOUSLY at script load (was only set at the end of build(), which runs on
  // DOMContentLoaded — so the host topbar button could fire before FFPFeedback existed → silent no-op).
  window.FFPFeedback = { open: open, close: close };

  async function resolveIdentity() {
    if (SOURCE === 'provider') {
      var uid = null, email = null;
      try {
        var u = await window.supabase.auth.getUser();
        if (u && u.data && u.data.user) { uid = u.data.user.id; email = u.data.user.email || null; }
      } catch (e) {}
      var prov = window.FFP_PROVIDER || {};
      return { uid: uid, name: prov.business_name || (email ? email.split('@')[0] : 'Provider'), email: email, provider_id: prov.id || null };
    }
    var m = getMember() || {};
    var name = m.full_name || ([m.given_names, m.surname].filter(Boolean).join(' ')) || (m.email ? m.email.split('@')[0] : 'Member');
    return { uid: m.id || null, name: name, email: m.email || null, provider_id: null };
  }

  // Resize/compress an image file to a JPEG data URL (keeps payloads small — feedback is low
  // volume and stored inline, so no storage bucket/RLS needed). Max 1200px long edge, q0.7.
  function compressImage(file, cb) {
    if (!file || !/^image\//.test(file.type)) { toast('Please choose an image', 'error'); return; }
    var reader = new FileReader();
    reader.onload = function () {
      var img = new Image();
      img.onload = function () {
        var max = 1200, w = img.width, h = img.height;
        if (w > h && w > max) { h = Math.round(h * max / w); w = max; }
        else if (h >= w && h > max) { w = Math.round(w * max / h); h = max; }
        try {
          var c = document.createElement('canvas'); c.width = w; c.height = h;
          c.getContext('2d').drawImage(img, 0, 0, w, h);
          cb(c.toDataURL('image/jpeg', 0.7));
        } catch (e) { console.error('[FFP Feedback] compress', e); toast('Could not read that image', 'error'); }
      };
      img.onerror = function () { toast('Could not read that image', 'error'); };
      img.src = reader.result;
    };
    reader.onerror = function () { toast('Could not read that file', 'error'); };
    reader.readAsDataURL(file);
  }
  function applyPhoto(dataUrl) {
    photoData = dataUrl;
    var thumb = document.getElementById('ffp-fb-thumb'), imgEl = document.getElementById('ffp-fb-thumb-img');
    var addBtn = document.getElementById('ffp-fb-addphoto');
    if (imgEl) imgEl.src = dataUrl;
    if (thumb) thumb.style.display = 'inline-block';
    if (addBtn) addBtn.style.display = 'none';
  }
  function clearPhoto() {
    photoData = null;
    var thumb = document.getElementById('ffp-fb-thumb'), addBtn = document.getElementById('ffp-fb-addphoto');
    if (thumb) thumb.style.display = 'none';
    if (addBtn) addBtn.style.display = 'inline-flex';
  }

  async function submit() {
    var msg = (document.getElementById('ffp-fb-msg').value || '').trim();
    if (msg.length < 3) { toast('Add a short message first', 'error'); return; }
    if (!window.supabase) { toast('Connection not ready - try again', 'error'); return; }

    var btn = document.getElementById('ffp-fb-send');
    btn.disabled = true; btn.textContent = 'Sending...';

    try {
      var who = await resolveIdentity();
      if (!who.uid) { toast('Please sign in first', 'error'); return; }
      // v2: submit via SECURITY DEFINER RPC — members can't satisfy the feedback RLS
      // (member_id = auth.uid()) because custom-JWT members don't resolve auth.uid().
      var res = await window.supabase.rpc('submit_feedback', {
        p_source: SOURCE,
        p_member_id: who.uid,
        p_provider_id: who.provider_id,
        p_name: who.name,
        p_email: who.email,
        p_category: picked,
        p_message: msg,
        p_photo_url: photoData || null
      });
      if (res.error) {
        console.error('[FFP Feedback]', res.error);
        toast('Could not send - please try again', 'error');
      } else {
        document.getElementById('ffp-fb-msg').value = '';
        picked = 'bug';
        clearPhoto();
        close();
        toast('Thanks - your feedback is in', 'success');
      }
    } catch (e) {
      console.error('[FFP Feedback]', e);
      toast('Could not send - please try again', 'error');
    } finally {
      btn.disabled = false; btn.textContent = 'Send';
    }
  }

  function start() { if (document.body) build(); else document.addEventListener('DOMContentLoaded', build); }
  start();
})();
