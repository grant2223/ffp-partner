/* FFP Partner — Courts & screens (desktop).
   A venue's courts, each with a permanent court screen: score.findfitpeople.com/<code>.
   The TV on a court is set up once. It then shows whatever is played on that
   court: tournament matches and league fixtures allocated to it, and club-night
   matches players put on it from the scorer (by scanning the QR on the screen).
   Exposes window.ffpRenderCourts (panel hook) + window.FFPCourts (actions). Icons use .ms. */
(function () {
  var SCREEN_BASE = 'score.findfitpeople.com';
  var TABLET_BASE = 'https://app.findfitpeople.com/tablet/';
  var QR_LIB = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
  var sb = function () { return window.supabase; };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); };
  function toast(m, k) { if (typeof window.showToast === 'function') { try { window.showToast(m, k || 'info'); return; } catch (e) {} } console.log('[FFP Courts]', m); }
  function root() { return document.getElementById('vc-root'); }
  function ic(n) { return '<span class="ms">' + n + '</span>'; }
  function pid() { return window.FFP_PROVIDER && window.FFP_PROVIDER.id; }
  var S = { courts: [], edit: null, confirm: null };

  function css() {
    if (document.getElementById('vc-css')) return;
    var st = document.createElement('style'); st.id = 'vc-css';
    st.textContent = [
      '#vc-root{max-width:1060px;}',
      '#vc-root .vc-top{display:flex;align-items:flex-end;gap:16px;flex-wrap:wrap;margin-bottom:22px;}',
      '#vc-root .vc-h1{font-size:24px;font-weight:900;color:var(--ffp-text,#12232f);letter-spacing:-.4px;}',
      '#vc-root .vc-sub{font-size:13.5px;font-weight:600;color:var(--ffp-text-muted,#6a7c8a);margin-top:4px;}',
      '#vc-root .sp{flex:1;}',
      '#vc-root .vc-add{display:flex;gap:8px;align-items:center;}',
      '#vc-root .vc-in{height:42px;box-sizing:border-box;border:1px solid var(--ffp-border-mid,#d5dee5);border-radius:10px;padding:0 12px;font:inherit;font-size:16px!important;font-weight:700;color:#12232f;background:#fff;min-width:0;flex:none;}',
      '#vc-root .vc-sel{height:42px;box-sizing:border-box;border:1px solid var(--ffp-border-mid,#d5dee5);border-radius:10px;padding:0 30px 0 10px;font:inherit;font-size:16px!important;font-weight:700;color:#12232f;background:#fff;min-width:0;flex:none;}',
      '#vc-root .vc-btn,#vc-ov .vc-btn{display:inline-flex;align-items:center;gap:6px;height:42px;box-sizing:border-box;border:1px solid var(--ffp-border-mid,#d5dee5);background:#fff;border-radius:10px;padding:0 14px;font:inherit;font-size:13px;font-weight:800;color:#12232f;cursor:pointer;white-space:nowrap;}',
      '#vc-root .vc-btn .ms,#vc-ov .vc-btn .ms{font-size:18px;}',
      '#vc-root .vc-btn.pri,#vc-ov .vc-btn.pri{background:var(--ffp-blue,#1980AD);border-color:var(--ffp-blue,#1980AD);color:#fff;}',
      '#vc-root .vc-btn.gold,#vc-ov .vc-btn.gold{background:linear-gradient(135deg,#FFD66B,#F2A900);border-color:#F2A900;color:#1d1600;}',
      '#vc-root .vc-btn.red,#vc-ov .vc-btn.red{background:#d9534f;border-color:#d9534f;color:#fff;}',
      '#vc-root .vc-btn.ghost,#vc-ov .vc-btn.ghost{border-color:transparent;background:transparent;color:var(--ffp-text-muted,#6a7c8a);}',
      '#vc-root .vc-btn.icon,#vc-ov .vc-btn.icon{width:42px;padding:0;justify-content:center;}',
      /* court rows: a list on the page, not cards */
      '#vc-root .vc-list{border-top:2px solid #12232f;}',
      '#vc-root .vc-row{display:grid;grid-template-columns:minmax(140px,1fr) 140px minmax(200px,1.2fr) auto;align-items:center;gap:18px;padding:18px 4px;border-bottom:1px solid var(--ffp-border,#e7ecf0);}',
      '#vc-root .vc-nm{display:flex;align-items:center;gap:10px;min-width:0;}',
      '#vc-root .vc-nm .ms{font-size:26px;color:var(--ffp-blue,#1980AD);flex:none;}',
      '#vc-root .vc-nm b{font-size:17px;font-weight:900;color:#12232f;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '#vc-root .vc-code{font-size:26px;font-weight:900;letter-spacing:.22em;color:#c98f00;line-height:1;}',
      '#vc-root .vc-url{font-size:13px;font-weight:700;color:var(--ffp-text-muted,#6a7c8a);margin-top:5px;letter-spacing:0;}',
      '#vc-root .vc-acc{display:flex;flex-direction:column;gap:4px;min-width:0;}',
      '#vc-root .vc-acc .vc-sel{width:100%;max-width:260px;}',
      '#vc-root .vc-acc small{font-size:12px;font-weight:600;color:#9aa8b4;}',
      '#vc-root .vc-acts{display:flex;gap:6px;justify-content:flex-end;}',
      '#vc-root .vc-cfm{grid-column:1/-1;display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:12px 14px;border-left:4px solid #d9534f;background:#fff5f4;}',
      '#vc-root .vc-cfm.warn{border-left-color:#F2A900;background:#fffaf0;}',
      '#vc-root .vc-cfm>span{flex:1;min-width:220px;font-size:13.5px;font-weight:700;color:#43525c;}',
      '#vc-root .vc-empty{padding:40px 6px;border-top:2px solid #12232f;display:flex;align-items:center;gap:26px;flex-wrap:wrap;}',
      '#vc-root .vc-empty .big{font-size:64px;color:var(--ffp-blue,#1980AD);}',
      '#vc-root .vc-empty b{display:block;font-size:20px;font-weight:900;color:#12232f;}',
      '#vc-root .vc-empty p{font-size:14px;font-weight:600;color:#6a7c8a;margin:6px 0 14px;max-width:420px;line-height:1.5;}',
      /* how it works: a strip under the list */
      '#vc-root .vc-how{display:grid;grid-template-columns:repeat(3,1fr);gap:26px;margin-top:30px;padding-top:22px;border-top:1px solid var(--ffp-border,#e7ecf0);}',
      '#vc-root .vc-how>div{display:flex;gap:12px;align-items:flex-start;}',
      '#vc-root .vc-how i{font-style:normal;flex:none;width:28px;height:28px;border-radius:50%;background:var(--ffp-blue,#1980AD);color:#fff;font-size:13px;font-weight:900;display:flex;align-items:center;justify-content:center;}',
      '#vc-root .vc-how b{display:block;font-size:14px;font-weight:900;color:#12232f;}',
      '#vc-root .vc-how span{display:block;font-size:13px;font-weight:600;color:#6a7c8a;margin-top:3px;line-height:1.45;}',
      '.vc-ov{position:fixed;inset:0;z-index:9999;background:#fff;display:flex;overflow-y:auto;}',
      '.vc-ov .in{margin:auto;max-width:560px;width:100%;padding:34px 28px;text-align:center;}',
      '.vc-ov .ms.big{font-size:56px;color:var(--ffp-blue,#1980AD);}',
      '.vc-ov h2{font-size:24px;font-weight:900;color:#12232f;margin:8px 0 0;}',
      '.vc-ov p{font-size:14.5px;font-weight:600;color:#5a6b78;line-height:1.55;margin:10px 0 0;}',
      '.vc-ov .qr{display:inline-block;margin-top:22px;padding:14px;background:#fff;box-shadow:0 0 0 3px #F2A900,0 12px 30px rgba(0,0,0,.12);border-radius:12px;line-height:0;}',
      '.vc-ov .url{font-size:13px;font-weight:700;color:#6a7c8a;word-break:break-all;margin-top:14px;}',
      '.vc-ov .warn{font-size:13px;font-weight:700;color:#9a6b00;margin-top:10px;}',
      '.vc-ov .acts{display:flex;gap:10px;justify-content:center;margin-top:22px;flex-wrap:wrap;}',
      '.vc-ov .tl{margin-top:26px;border-top:1px solid var(--ffp-border,#e7ecf0);text-align:left;}',
      '.vc-ov .tl h3{font-size:12px;font-weight:900;letter-spacing:.14em;text-transform:uppercase;color:#6a7c8a;margin:16px 0 6px;}',
      '.vc-ov .tr{display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--ffp-border,#e7ecf0);}',
      '.vc-ov .tr span{flex:1;font-size:14px;font-weight:700;color:#12232f;}',
      '#vc-root .vc-acts .vc-btn .ms{font-size:18px;}',
      '@media (max-width:900px){#vc-root .vc-row{grid-template-columns:1fr 1fr;}#vc-root .vc-acts{justify-content:flex-start;}#vc-root .vc-how{grid-template-columns:1fr;}}'
    ].join('\n');
    document.head.appendChild(st);
  }

  async function load() {
    var p = pid(); if (!p) { S.courts = []; return; }
    var r; try { r = await sb().rpc('vc_list', { p_provider: p }); } catch (e) { r = { error: e }; }
    S.courts = (r && r.data) || [];
  }

  function rowHtml(c) {
    var nm = S.edit === c.id
      ? '<div class="vc-nm"><input class="vc-in" id="vc-ren" value="' + esc(c.name) + '" style="width:170px" onkeydown="if(event.key===\'Enter\')FFPCourts.saveName(\'' + c.id + '\');if(event.key===\'Escape\')FFPCourts.cancelEdit()">'
        + '<button class="vc-btn pri icon" title="Save" onclick="FFPCourts.saveName(\'' + c.id + '\')">' + ic('check') + '</button></div>'
      : '<div class="vc-nm">' + ic('connected_tv') + '<b>' + esc(c.name) + '</b></div>';
    var acc = '<div class="vc-acc"><select class="vc-sel" onchange="FFPCourts.setAccess(\'' + c.id + '\',this.value)">'
      + '<option value="open"' + (c.access === 'open' ? ' selected' : '') + '>Open to players</option>'
      + '<option value="staff"' + (c.access === 'staff' ? ' selected' : '') + '>Staff only</option>'
      + '</select><small>' + (c.access === 'open' ? 'The screen shows a QR to scan when the court is free' : 'Only your tournaments, leagues and staff') + '</small></div>';
    var acts = '<div class="vc-acts">'
      + '<button class="vc-btn" title="Copy the screen address" onclick="FFPCourts.copy(\'' + esc(c.screen_code) + '\')">' + ic('content_copy') + 'Copy</button>'
      + '<a class="vc-btn" title="Open this court\'s screen" href="https://' + SCREEN_BASE + '/' + esc(c.screen_code) + '" target="_blank" rel="noopener">' + ic('open_in_new') + 'Open</a>'
      + '<button class="vc-btn" title="The scoring tablet at this court" onclick="FFPCourts.tablet(\'' + c.id + '\')">' + ic('tablet_android') + 'Tablet</button>'
      + '<button class="vc-btn icon ghost" title="Rename" onclick="FFPCourts.edit(\'' + c.id + '\')">' + ic('edit') + '</button>'
      + '<button class="vc-btn icon ghost" title="New code" onclick="FFPCourts.ask(\'' + c.id + '\',\'code\')">' + ic('autorenew') + '</button>'
      + '<button class="vc-btn icon ghost" title="Remove" onclick="FFPCourts.ask(\'' + c.id + '\',\'remove\')">' + ic('delete') + '</button>'
      + '</div>';
    var cf = '';
    if (S.confirm && S.confirm.id === c.id) {
      cf = S.confirm.kind === 'remove'
        ? '<div class="vc-cfm"><span>Remove ' + esc(c.name) + '? Its screen stops working, and events using it go back to event-only screens.</span>'
          + '<button class="vc-btn" onclick="FFPCourts.cancelAsk()">Cancel</button><button class="vc-btn red" onclick="FFPCourts.remove(\'' + c.id + '\')">' + ic('delete') + 'Remove</button></div>'
        : '<div class="vc-cfm warn"><span>Give ' + esc(c.name) + ' a new code? The TV then needs the new address. Only do this if the old code got out.</span>'
          + '<button class="vc-btn" onclick="FFPCourts.cancelAsk()">Cancel</button><button class="vc-btn gold" onclick="FFPCourts.newCode(\'' + c.id + '\')">' + ic('autorenew') + 'New code</button></div>';
    }
    return '<div class="vc-row">' + nm
      + '<div><div class="vc-code">' + esc(c.screen_code) + '</div></div>'
      + '<div class="vc-acc-wrap">' + acc + '</div>'
      + acts + cf + '</div>';
  }

  function render() {
    var h = root(); if (!h) return;
    css();
    var top = '<div class="vc-top"><div><div class="vc-h1">Courts &amp; screens</div>'
      + '<div class="vc-sub">Each court has its own screen address. Type it into the TV once, and it shows every match on that court.</div></div>'
      + '<span class="sp"></span>'
      + (S.courts.length ? '<div class="vc-add"><input class="vc-in" id="vc-new" placeholder="Court name" style="width:190px" onkeydown="if(event.key===\'Enter\')FFPCourts.add()"><button class="vc-btn pri" onclick="FFPCourts.add()">' + ic('add') + 'Add court</button></div>' : '')
      + '</div>';
    var body = S.courts.length
      ? '<div class="vc-list">' + S.courts.map(rowHtml).join('') + '</div>'
      : '<div class="vc-empty"><span class="ms big">connected_tv</span><div><b>Set up your courts</b>'
        + '<p>How many courts do you have? Each one gets a screen address that never changes.</p>'
        + '<div class="vc-add"><input class="vc-in" id="vc-count" type="number" min="1" max="40" value="4" style="width:90px"><button class="vc-btn pri" onclick="FFPCourts.addMany()">' + ic('add') + 'Create courts</button></div></div></div>';
    var how = '<div class="vc-how">'
      + '<div><i>1</i><div><b>On the TV</b><span>Open the browser, or plug in a streaming stick, and go to ' + SCREEN_BASE + '</span></div></div>'
      + '<div><i>2</i><div><b>Type the court\'s code</b><span>Or the full address. Leave it open: the screen stays awake.</span></div></div>'
      + '<div><i>3</i><div><b>Play</b><span>Tournament and league matches on that court show up by themselves. At a club night, players scan the screen\'s QR code.</span></div></div>'
      + '</div>';
    h.innerHTML = top + body + how;
    var f = document.getElementById('vc-ren'); if (f) { f.focus(); f.select(); }
  }

  async function refresh() { await load(); render(); }

  async function add() {
    var el = document.getElementById('vc-new'); var nm = el && el.value.trim();
    if (!nm) { toast('Name the court first', 'error'); return; }
    var r; try { r = await sb().rpc('vc_save', { p_provider: pid(), p_id: null, p_name: nm, p_access: null }); } catch (e) { r = { error: e }; }
    if (r.error) { toast('Could not add the court', 'error'); return; }
    toast(nm + ' added: ' + SCREEN_BASE + '/' + ((r.data && r.data.screen_code) || ''), 'success'); refresh();
  }
  async function addMany() {
    var n = +((document.getElementById('vc-count') || {}).value) || 0;
    if (n < 1 || n > 40) { toast('Between 1 and 40 courts', 'error'); return; }
    var r; try { r = await sb().rpc('vc_add_many', { p_provider: pid(), p_count: n, p_prefix: 'Court' }); } catch (e) { r = { error: e }; }
    if (r.error) { toast('Could not create the courts', 'error'); return; }
    toast(n + ' courts created', 'success'); refresh();
  }
  function edit(id) { S.edit = id; S.confirm = null; render(); }
  function cancelEdit() { S.edit = null; render(); }
  async function saveName(id) {
    var el = document.getElementById('vc-ren'); var nm = el && el.value.trim(); if (!nm) return;
    var r; try { r = await sb().rpc('vc_save', { p_provider: pid(), p_id: id, p_name: nm, p_access: null }); } catch (e) { r = { error: e }; }
    if (r.error) { toast('Could not rename', 'error'); return; }
    S.edit = null; refresh();
  }
  async function setAccess(id, v) {
    var r; try { r = await sb().rpc('vc_save', { p_provider: pid(), p_id: id, p_name: null, p_access: v }); } catch (e) { r = { error: e }; }
    if (r.error) { toast('Could not change it', 'error'); return; }
    toast(v === 'open' ? 'Players can now put matches on this court' : 'Venue staff only', 'success'); refresh();
  }
  function ask(id, kind) { S.confirm = { id: id, kind: kind }; S.edit = null; render(); }
  function cancelAsk() { S.confirm = null; render(); }
  async function remove(id) {
    var r; try { r = await sb().rpc('vc_remove', { p_id: id }); } catch (e) { r = { error: e }; }
    S.confirm = null;
    if (r.error) { toast('Could not remove it', 'error'); render(); return; }
    toast('Court removed', 'success'); refresh();
  }
  async function newCode(id) {
    var r; try { r = await sb().rpc('vc_new_code', { p_id: id }); } catch (e) { r = { error: e }; }
    S.confirm = null;
    if (r.error) { toast('Could not change the code', 'error'); render(); return; }
    toast('New address: ' + SCREEN_BASE + '/' + r.data, 'success'); refresh();
  }
  function copy(code) {
    var t = 'https://' + SCREEN_BASE + '/' + code;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t);
      else { var ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); }
      toast('Copied ' + t, 'success');
    } catch (e) { toast(t, 'info'); }
  }

  // ── the scoring tablet at a court ───────────────────────────────────────
  // Pairing makes a link with a secret key. Open it on the tablet once (scan
  // the QR with the tablet's camera) and it scores this court's matches with
  // nobody signed in. Only matches on this court: unpair it here at any time.
  function loadQr(cb) {
    if (window.QRCode) { cb(); return; }
    var sc = document.createElement('script'); sc.src = QR_LIB; sc.onload = cb; sc.onerror = cb; document.head.appendChild(sc);
  }
  function closeOv() { var o = document.getElementById('vc-ov'); if (o) o.remove(); }
  async function tablet(id, key) {
    var c = S.courts.find(function (x) { return x.id === id; }) || { name: 'Court' };
    var tr; try { tr = await sb().rpc('vc_tablets', { p_court: id }); } catch (e) { tr = {}; }
    var list = (tr && tr.data) || [];
    closeOv();
    var ov = document.createElement('div'); ov.id = 'vc-ov'; ov.className = 'vc-ov';
    var fmt = function (t) { try { return t ? new Date(t).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Not used yet'; } catch (e) { return ''; } };
    var body = key
      ? '<h2>Pair the tablet, ' + esc(c.name) + '</h2>'
        + '<p>On the tablet, scan this with the camera and open the link. It stays paired to this court.</p>'
        + '<div class="qr" id="vc-qr"></div>'
        + '<div class="url" id="vc-turl">' + esc(TABLET_BASE + key) + '</div>'
        + '<div class="warn">This link is shown once. Anyone with it can score matches on this court, so do not share it.</div>'
        + '<div class="acts"><button class="vc-btn" onclick="FFPCourts.copyText(\'vc-turl\')">' + ic('content_copy') + 'Copy link</button>'
        + '<button class="vc-btn pri" onclick="FFPCourts.tablet(\'' + id + '\')">' + ic('check') + 'Done</button></div>'
      : '<span class="ms big">tablet_android</span><h2>Scoring tablet, ' + esc(c.name) + '</h2>'
        + '<p>A tablet at the court scores this court\'s tournament and league matches, and club matches between FFP members. Nobody signs in on it.</p>'
        + '<div class="acts"><button class="vc-btn gold" onclick="FFPCourts.pairTablet(\'' + id + '\')">' + ic('add') + 'Pair a tablet</button>'
        + '<button class="vc-btn" onclick="FFPCourts.closeOv()">Close</button></div>'
        + (list.length ? '<div class="tl"><h3>Paired tablets</h3>' + list.map(function (t) {
            return '<div class="tr"><span>Paired ' + esc(fmt(t.created_at)) + ', last used ' + esc(fmt(t.last_seen_at)) + '</span>'
              + '<button class="vc-btn red" onclick="FFPCourts.unpair(\'' + t.id + '\',\'' + id + '\')">' + ic('link_off') + 'Unpair</button></div>';
          }).join('') + '</div>' : '');
    ov.innerHTML = '<div class="in">' + body + '</div>';
    document.body.appendChild(ov);
    if (key) loadQr(function () {
      var h = document.getElementById('vc-qr');
      if (h && window.QRCode) { try { new window.QRCode(h, { text: TABLET_BASE + key, width: 240, height: 240, correctLevel: window.QRCode.CorrectLevel.M }); } catch (e) {} }
    });
  }
  async function pairTablet(id) {
    var r; try { r = await sb().rpc('vc_tablet_create', { p_court: id }); } catch (e) { r = { error: e }; }
    if (r.error || !r.data) { toast('Could not pair a tablet', 'error'); return; }
    tablet(id, r.data);
  }
  async function unpair(tid, id) {
    var r; try { r = await sb().rpc('vc_tablet_revoke', { p_id: tid }); } catch (e) { r = { error: e }; }
    if (r.error) { toast('Could not unpair it', 'error'); return; }
    toast('Tablet unpaired', 'success'); tablet(id);
  }
  function copyText(elId) {
    var el = document.getElementById(elId); if (!el) return;
    var t = el.textContent || '';
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t);
      else { var ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); }
      toast('Copied', 'success');
    } catch (e) { toast(t, 'info'); }
  }

  window.FFPCourts = { add: add, addMany: addMany, edit: edit, cancelEdit: cancelEdit, saveName: saveName, setAccess: setAccess,
    ask: ask, cancelAsk: cancelAsk, remove: remove, newCode: newCode, copy: copy, refresh: refresh,
    tablet: tablet, pairTablet: pairTablet, unpair: unpair, copyText: copyText, closeOv: closeOv };
  window.ffpRenderCourts = function () {
    var h = root(); if (h) { css(); h.innerHTML = '<div class="vc-sub" style="padding:20px 0">Loading courts…</div>'; }
    S.edit = null; S.confirm = null; refresh();
  };
  console.log('[FFP Courts v1] Loaded ✓');
})();
