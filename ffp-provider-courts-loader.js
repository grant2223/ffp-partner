/* FFP Partner — Courts & screens (desktop).
   A venue's courts, each with a permanent court screen: score.findfitpeople.com/<code>.
   The TV on a court is set up once. It then shows whatever is played on that
   court: tournament matches and league fixtures allocated to it, and club-night
   matches players put on it from the scorer (by scanning the QR on the screen).
   Exposes window.ffpRenderCourts (panel hook) + window.FFPCourts (actions). Icons use .ms. */
(function () {
  var SCREEN_BASE = 'score.findfitpeople.com';
  var TABLET_URL = 'https://app.findfitpeople.com/tablet';
  var QR_LIB = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
  var sb = function () { return window.supabase; };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); };
  function toast(m, k) { if (typeof window.showToast === 'function') { try { window.showToast(m, k || 'info'); return; } catch (e) {} } console.log('[FFP Courts]', m); }
  function root() { return document.getElementById('vc-root'); }
  function ic(n) { return '<span class="ms">' + n + '</span>'; }
  function pid() { return window.FFP_PROVIDER && window.FFP_PROVIDER.id; }
  var S = { courts: [], edit: null, confirm: null, promos: [], pdel: null, draft: null };

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
      /* the PIN is the thing you read out; the QR is the shortcut */
      '.vc-ov .pin{margin-top:20px;font-size:52px;font-weight:900;letter-spacing:.18em;color:#12232f;font-variant-numeric:tabular-nums;line-height:1.05;}',
      '.vc-ov .url{font-size:13px;font-weight:700;color:#6a7c8a;word-break:break-all;margin-top:14px;}',
      '.vc-ov .warn{font-size:13px;font-weight:700;color:#9a6b00;margin-top:10px;}',
      '.vc-ov .acts{display:flex;gap:10px;justify-content:center;margin-top:22px;flex-wrap:wrap;}',
      '.vc-ov .tl{margin-top:26px;border-top:1px solid var(--ffp-border,#e7ecf0);text-align:left;}',
      '.vc-ov .tl h3{font-size:12px;font-weight:900;letter-spacing:.14em;text-transform:uppercase;color:#6a7c8a;margin:16px 0 6px;}',
      '.vc-ov .tr{display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--ffp-border,#e7ecf0);}',
      '.vc-ov .tr span{flex:1;font-size:14px;font-weight:700;color:#12232f;}',
      '#vc-root .vc-acts .vc-btn .ms{font-size:18px;}',
      /* promos on free screens */
      '#vc-root .vp{margin-top:34px;}',
      '#vc-root .vp-hd{display:flex;align-items:flex-end;gap:16px;flex-wrap:wrap;margin-bottom:14px;}',
      '#vc-root .vp-h2{font-size:19px;font-weight:900;color:#12232f;letter-spacing:-.3px;}',
      '#vc-root .vp-list{border-top:2px solid #12232f;}',
      '#vc-root .vp-row{display:grid;grid-template-columns:34px 120px minmax(180px,1fr) 170px 150px auto;align-items:center;gap:18px;padding:14px 4px;border-bottom:1px solid var(--ffp-border,#e7ecf0);}',
      '#vc-root .vp-row.off{opacity:.55;}',
      '#vc-root .vp-th{width:120px;height:100px;border-radius:10px;overflow:hidden;background:#0a2436;position:relative;}',
      '#vc-root .vp-th img{width:100%;height:100%;object-fit:cover;display:block;}',
      '#vc-root .vp-tx{min-width:0;}',
      '#vc-root .vp-tg{display:inline-block;font-size:11px;font-weight:900;letter-spacing:.14em;text-transform:uppercase;background:#FFC847;color:#12212c;border-radius:5px;padding:3px 7px;margin-bottom:5px;}',
      '#vc-root .vp-tx b{display:block;font-size:16px;font-weight:900;color:#12232f;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '#vc-root .vp-tx span{display:block;font-size:13px;font-weight:600;color:#6a7c8a;margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '#vc-root .vp-tx .vp-tg{display:block;margin:0 0 3px;padding:0;background:none;font-size:11px;font-weight:900;letter-spacing:.14em;color:#c98f00;}',
      '#vc-root .vp-n{font-size:22px;font-weight:900;color:#c98f00;text-align:center;}',
      '#vc-root .vp-mv{display:flex;flex-direction:column;}',
      '#vc-root .vp-mv .vc-btn{height:30px;width:34px;}',
      '#vc-root .vp-mv .vc-btn:disabled{opacity:.25;cursor:default;}',
      '#vc-root .vp-meta{font-size:13px;font-weight:700;color:#43525c;line-height:1.45;}',
      '#vc-root .vp-meta small{display:block;font-size:12px;font-weight:600;color:#9aa8b4;}',
      '#vc-root .vp-empty{padding:26px 6px;border-top:2px solid #12232f;font-size:14px;font-weight:600;color:#6a7c8a;display:flex;align-items:center;gap:18px;flex-wrap:wrap;}',
      '#vc-root .vp-empty .ms{font-size:44px;color:var(--ffp-blue,#1980AD);}',
      '.vc-ov .in.wide{max-width:980px;text-align:left;}',
      '.vc-ov .pe{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,1fr);gap:30px;margin-top:18px;align-items:start;}',
      '.vc-ov .pv{position:relative;width:100%;aspect-ratio:6/5;border-radius:12px;overflow:hidden;background:#0a2436;cursor:pointer;}',
      '.vc-ov .pv img{width:100%;height:100%;object-fit:cover;display:block;}',
      '.vc-ov .pv .ov{position:absolute;inset:0;background:linear-gradient(0deg,rgba(3,12,20,.92) 0,rgba(3,12,20,.2) 60%,transparent);}',
      '.vc-ov .pv .tx{position:absolute;left:22px;right:22px;bottom:20px;color:#fff;}',
      '.vc-ov .pv .tg{display:inline-block;font-size:12px;font-weight:900;letter-spacing:.14em;text-transform:uppercase;background:#FFC847;color:#12212c;border-radius:6px;padding:4px 9px;}',
      '.vc-ov .pv h4{font-size:30px;font-weight:900;line-height:1.05;margin:9px 0 5px;letter-spacing:-.02em;}',
      '.vc-ov .pv p{font-size:15px;font-weight:800;color:#cfe8f6;margin:0;}',
      '.vc-ov .pv .up{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;color:#cfe8f6;font-size:15px;font-weight:800;}',
      '.vc-ov .pv .up .ms{font-size:46px;}',
      '.vc-ov .pv .chg{position:absolute;top:12px;right:12px;}',
      '.vc-ov .pvn{font-size:12.5px;font-weight:600;color:#8a96a1;margin-top:8px;}',
      '.vc-ov .fl{display:block;margin-bottom:14px;}',
      '.vc-ov .fl>span{display:block;font-size:12px;font-weight:900;letter-spacing:.1em;text-transform:uppercase;color:#6a7c8a;margin-bottom:6px;}',
      '.vc-ov .fl input[type=text],.vc-ov .fl input[type=date]{width:100%;height:44px;box-sizing:border-box;border:1px solid var(--ffp-border-mid,#d5dee5);border-radius:10px;padding:0 12px;font:inherit;font-size:16px!important;font-weight:700;color:#12232f;background:#fff;}',
      '.vc-ov .fl small{display:block;font-size:12px;font-weight:600;color:#9aa8b4;margin-top:4px;}',
      '.vc-ov .cks{display:flex;flex-wrap:wrap;gap:6px 22px;}',
      '.vc-ov .ck{display:inline-flex;align-items:center;gap:8px;height:34px;font-size:15px;font-weight:800;color:#12232f;cursor:pointer;}',
      '.vc-ov .ck.on{color:var(--ffp-blue,#1980AD);}',
      '.vc-ov .ck input{margin:0;width:18px;height:18px;accent-color:var(--ffp-blue,#1980AD);}',
      '.vc-ov .acts.l{justify-content:flex-start;}',
      '@media (max-width:900px){#vc-root .vp-row{grid-template-columns:100px 1fr;}.vc-ov .pe{grid-template-columns:1fr;}}',
      '@media (max-width:900px){#vc-root .vc-row{grid-template-columns:1fr 1fr;}#vc-root .vc-acts{justify-content:flex-start;}#vc-root .vc-how{grid-template-columns:1fr;}}',
      /* both shipped just under AA on this panel: the warning line at 4.49:1 and
         the connected-tablets heading at 4.32:1. Last in the array so they win. */
      '.vc-ov .warn{color:#8c5f00;}',
      '.vc-ov .tl h3{color:#61737f;}'
    ].join('\n');
    document.head.appendChild(st);
  }

  async function load() {
    var p = pid(); if (!p) { S.courts = []; return; }
    var r; try { r = await sb().rpc('vc_list', { p_provider: p }); } catch (e) { r = { error: e }; }
    S.courts = (r && r.data) || [];
    var q; try { q = await sb().rpc('vp_list', { p_provider: p }); } catch (e) { q = { error: e }; }
    S.promos = (q && q.data) || [];
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
    h.innerHTML = top + body + (S.courts.length ? promosHtml() : '') + how;
    var f = document.getElementById('vc-ren'); if (f) { f.focus(); f.select(); }
  }

  // ── promos on free screens ──────────────────────────────────────────────
  // A free court shows the court, then each promo for 8 seconds, full height
  // across the left two thirds. The QR to link a match never leaves the screen.
  function courtNames(ids) {
    if (!ids || !ids.length) return 'All courts';
    var n = S.courts.filter(function (c) { return ids.indexOf(c.id) >= 0; }).map(function (c) { return c.name; });
    return n.length ? n.join(', ') : 'No courts';
  }
  function day(t) { try { return new Date(t).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' }); } catch (e) { return ''; } }
  function promoRow(p, i) {
    var ended = p.ends_at && new Date(p.ends_at) < new Date();
    var state = !p.active ? 'Paused' : ended ? 'Ended' : 'Showing';
    var last = i === S.promos.length - 1;
    var row = '<div class="vp-row' + (state === 'Showing' ? '' : ' off') + '">'
      + '<div class="vp-mv"><button class="vc-btn icon ghost" title="Earlier in the rotation"' + (i === 0 ? ' disabled' : '') + ' onclick="FFPCourts.promoMove(\'' + p.id + '\',-1)">' + ic('keyboard_arrow_up') + '</button>'
      + '<div class="vp-n">' + (i + 1) + '</div>'
      + '<button class="vc-btn icon ghost" title="Later in the rotation"' + (last ? ' disabled' : '') + ' onclick="FFPCourts.promoMove(\'' + p.id + '\',1)">' + ic('keyboard_arrow_down') + '</button></div>'
      + '<div class="vp-th"><img src="' + esc(p.image_url) + '" alt=""></div>'
      + '<div class="vp-tx">' + (p.tag ? '<span class="vp-tg">' + esc(p.tag) + '</span>' : '')
      + '<b>' + esc(p.headline || 'Photo only') + '</b>' + (p.body ? '<span>' + esc(p.body) + '</span>' : '') + '</div>'
      + '<div class="vp-meta">' + esc(courtNames(p.court_ids)) + '<small>' + (p.ends_at ? 'Until ' + esc(day(p.ends_at)) : 'No end date') + '</small></div>'
      + '<div class="vc-acc"><select class="vc-sel" onchange="FFPCourts.promoActive(\'' + p.id + '\',this.value)">'
      + '<option value="1"' + (p.active ? ' selected' : '') + '>' + (ended ? 'Ended' : 'Showing') + '</option>'
      + '<option value="0"' + (!p.active ? ' selected' : '') + '>Paused</option></select></div>'
      + '<div class="vc-acts"><button class="vc-btn" onclick="FFPCourts.promoEdit(\'' + p.id + '\')">' + ic('edit') + 'Edit</button>'
      + '<button class="vc-btn icon ghost" title="Delete" onclick="FFPCourts.promoAsk(\'' + p.id + '\')">' + ic('delete') + '</button></div>';
    if (S.pdel === p.id) row += '<div class="vc-cfm"><span>Delete this promo? It comes off every screen straight away.</span>'
      + '<button class="vc-btn" onclick="FFPCourts.promoAsk(null)">Cancel</button><button class="vc-btn red" onclick="FFPCourts.promoRemove(\'' + p.id + '\')">' + ic('delete') + 'Delete</button></div>';
    return row + '</div>';
  }
  function promosHtml() {
    return '<div class="vp"><div class="vp-hd"><div><div class="vp-h2">Promos on free screens</div>'
      + '<div class="vc-sub">Free courts rotate through these in order, 8 seconds each.</div></div>'
      + '<span class="sp"></span><button class="vc-btn gold" onclick="FFPCourts.promoEdit(null)">' + ic('add') + 'Add promo</button></div>'
      + (S.promos.length ? '<div class="vp-list">' + S.promos.map(promoRow).join('') + '</div>'
        : '<div class="vp-empty"><span class="ms">campaign</span><div>No promos yet. Add club nights, tournaments, deals or partners, and they show on your free courts.</div></div>')
      + '</div>';
  }
  function promoEdit(id) {
    var p = id ? S.promos.find(function (x) { return x.id === id; }) : null;
    S.draft = p ? { id: p.id, image_url: p.image_url, tag: p.tag || '', headline: p.headline || '', body: p.body || '',
                    court_ids: (p.court_ids || []).slice(), ends_at: p.ends_at ? String(p.ends_at).slice(0, 10) : '' }
                : { id: null, image_url: '', tag: '', headline: '', body: '', court_ids: [], ends_at: '' };
    closeOv();
    var ov = document.createElement('div'); ov.id = 'vc-ov'; ov.className = 'vc-ov';
    document.body.appendChild(ov);
    drawEditor();
  }
  function drawEditor() {
    var ov = document.getElementById('vc-ov'); var d = S.draft; if (!ov || !d) return;
    var all = !d.court_ids.length;
    ov.innerHTML = '<div class="in wide"><h2>' + (d.id ? 'Edit promo' : 'Add a promo') + '</h2>'

      + '<div class="pe"><div><div class="pv" id="vp-pv" onclick="FFPCourts.promoPick()"></div>'
      + '<div class="pvn">Words sit at the bottom of the photo.</div></div>'
      + '<div>'
      + '<label class="fl"><span>Tag (optional)</span><input type="text" id="vp-tag" maxlength="24" placeholder="Tonight" value="' + esc(d.tag) + '" oninput="FFPCourts.promoField(\'tag\',this.value)"></label>'
      + '<label class="fl"><span>Headline</span><input type="text" id="vp-hl" maxlength="60" placeholder="Club Night Doubles" value="' + esc(d.headline) + '" oninput="FFPCourts.promoField(\'headline\',this.value)"></label>'
      + '<label class="fl"><span>One line</span><input type="text" id="vp-bd" maxlength="90" placeholder="Thursdays 7pm. Book in the FFP app" value="' + esc(d.body) + '" oninput="FFPCourts.promoField(\'body\',this.value)"></label>'
      + '<div class="fl"><span>Courts</span><div class="cks">'
      + '<label class="ck' + (all ? ' on' : '') + '"><input type="checkbox"' + (all ? ' checked' : '') + ' onchange="FFPCourts.promoCourt(null)">All courts</label>'
      + S.courts.map(function (c) { var on = d.court_ids.indexOf(c.id) >= 0;
          return '<label class="ck' + (on ? ' on' : '') + '"><input type="checkbox"' + (on ? ' checked' : '') + ' onchange="FFPCourts.promoCourt(\'' + c.id + '\')">' + esc(c.name) + '</label>'; }).join('')
      + '</div></div>'
      + '<label class="fl"><span>Show until (optional)</span><input type="date" id="vp-end" value="' + esc(d.ends_at) + '" onchange="FFPCourts.promoField(\'ends_at\',this.value)"></label>'
      + '<div class="acts l"><button class="vc-btn pri" onclick="FFPCourts.promoSave()">' + ic('check') + 'Save promo</button>'
      + '<button class="vc-btn" onclick="FFPCourts.closeOv()">Cancel</button></div>'
      + '</div></div></div>';
    drawPreview();
  }
  function drawPreview() {
    var v = document.getElementById('vp-pv'); var d = S.draft; if (!v || !d) return;
    if (!d.image_url) { v.innerHTML = '<div class="up"><span class="ms">add_photo_alternate</span>Upload a photo</div>'; return; }
    var words = d.tag || d.headline || d.body;
    v.innerHTML = '<img src="' + esc(d.image_url) + '" alt="">'
      + (words ? '<div class="ov"></div><div class="tx">' + (d.tag ? '<span class="tg">' + esc(d.tag) + '</span>' : '')
        + (d.headline ? '<h4>' + esc(d.headline) + '</h4>' : '') + (d.body ? '<p>' + esc(d.body) + '</p>' : '') + '</div>' : '')
      + '<span class="vc-btn chg">' + ic('photo_camera') + 'Change</span>';
  }
  function promoField(k, v) { if (!S.draft) return; S.draft[k] = v; if (k !== 'ends_at') drawPreview(); }
  function promoCourt(id) {
    var d = S.draft; if (!d) return;
    if (id === null) d.court_ids = [];
    else { var i = d.court_ids.indexOf(id); if (i >= 0) d.court_ids.splice(i, 1); else d.court_ids.push(id); }
    if (d.court_ids.length === S.courts.length) d.court_ids = [];   // every court is all courts
    drawEditor();
  }
  function promoPick() {
    if (!window.FFPUpload) { toast('Uploader not ready, refresh and retry', 'error'); return; }
    window.FFPUpload.pick({ bucket: 'listing-covers', key: 'promo-' + pid() + '-' + Date.now(), aspect: 6 / 5, outW: 1200, outH: 1000,
      title: 'Promo photo (6:5)',
      onDone: function (url) { if (S.draft) { S.draft.image_url = url; drawPreview(); } },
      onError: function () { toast('Upload failed', 'error'); } });
  }
  async function promoSave() {
    var d = S.draft; if (!d) return;
    if (!d.image_url) { toast('Add a photo first', 'error'); return; }
    var end = d.ends_at ? new Date(d.ends_at + 'T23:59:59').toISOString() : '';
    var p = { image_url: d.image_url, tag: d.tag, headline: d.headline, body: d.body, court_ids: d.court_ids, ends_at: end };
    var r; try { r = await sb().rpc('vp_save', { p_provider: pid(), p_id: d.id, p: p }); } catch (e) { r = { error: e }; }
    if (r.error) { toast('Could not save the promo', 'error'); return; }
    S.draft = null; closeOv(); toast(d.id ? 'Promo saved' : 'Promo added. It shows on free screens within a minute', 'success'); refresh();
  }
  async function promoActive(id, v) {
    var r; try { r = await sb().rpc('vp_save', { p_provider: pid(), p_id: id, p: { active: v === '1' } }); } catch (e) { r = { error: e }; }
    if (r.error) { toast('Could not change it', 'error'); return; }
    toast(v === '1' ? 'Promo showing' : 'Promo paused', 'success'); refresh();
  }
  async function promoMove(id, dir) {
    var r; try { r = await sb().rpc('vp_move', { p_id: id, p_dir: dir }); } catch (e) { r = { error: e }; }
    if (r.error) { toast('Could not move it', 'error'); return; }
    refresh();
  }
  function promoAsk(id) { S.pdel = id; render(); }
  async function promoRemove(id) {
    var r; try { r = await sb().rpc('vp_remove', { p_id: id }); } catch (e) { r = { error: e }; }
    S.pdel = null;
    if (r.error) { toast('Could not delete it', 'error'); render(); return; }
    toast('Promo deleted', 'success'); refresh();
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
      ? '<h2>Connect a tablet, ' + esc(c.name) + '</h2>'
        + '<p>On the tablet open <b>' + esc(TABLET_URL.replace(/^https?:\/\//, '')) + '</b> and type this PIN, or point its camera at the square.</p>'
        + '<div class="pin" id="vc-turl">' + esc(String(key).slice(0, 3) + ' ' + String(key).slice(3)) + '</div>'
        + '<div class="qr" id="vc-qr"></div>'
        + '<div class="warn">Good for 15 minutes, and works once. Anyone with the PIN can connect a tablet to this court.</div>'
        + '<div class="acts"><button class="vc-btn" onclick="FFPCourts.pairTablet(\'' + id + '\')">' + ic('refresh') + 'New PIN</button>'
        + '<button class="vc-btn pri" onclick="FFPCourts.tablet(\'' + id + '\')">' + ic('check') + 'Done</button></div>'
      : '<span class="ms big">tablet_android</span><h2>Scoring tablet, ' + esc(c.name) + '</h2>'
        + '<p>A tablet at the court scores this court\'s tournament and league matches, and open play between FFP members. Nobody signs in on it.</p>'
        + '<div class="acts"><button class="vc-btn gold" onclick="FFPCourts.pairTablet(\'' + id + '\')">' + ic('add') + 'Connect a tablet</button>'
        + '<button class="vc-btn" onclick="FFPCourts.closeOv()">Close</button></div>'
        + (list.length ? '<div class="tl"><h3>Connected tablets</h3>' + list.map(function (t) {
            return '<div class="tr"><span>Connected ' + esc(fmt(t.created_at)) + ', last seen ' + esc(fmt(t.last_seen_at)) + '</span>'
              + '<button class="vc-btn red" onclick="FFPCourts.unpair(\'' + t.id + '\',\'' + id + '\')">' + ic('link_off') + 'Disconnect</button></div>';
          }).join('') + '</div>' : '');
    ov.innerHTML = '<div class="in">' + body + '</div>';
    document.body.appendChild(ov);
    if (key) loadQr(function () {
      var h = document.getElementById('vc-qr');
      if (h && window.QRCode) { try { new window.QRCode(h, { text: TABLET_URL + '?pin=' + encodeURIComponent(key), width: 208, height: 208, correctLevel: window.QRCode.CorrectLevel.M }); } catch (e) {} }
    });
  }
  // ONE way to connect a tablet, wherever it is: six digits. A tournament pitch
  // uses the same tablet_pair_start, so a volunteer learns this once.
  async function pairTablet(id) {
    var r; try { r = await sb().rpc('tablet_pair_start', { p_court: id, p_field: null }); } catch (e) { r = { error: e }; }
    var m = String((r.error && r.error.message) || '');
    if (r.error || !(r.data && r.data.pin)) {
      toast(/not_yours/.test(m) ? 'That court is not yours' : /too_many_codes/.test(m) ? 'Too many PINs live for this court. Wait a few minutes.' : 'Could not make a PIN', 'error');
      return;
    }
    tablet(id, r.data.pin);
  }
  async function unpair(tid, id) {
    var r; try { r = await sb().rpc('tablet_revoke', { p_id: tid }); } catch (e) { r = { error: e }; }
    if (r.error || (r.data && r.data.error)) { toast('Could not disconnect it', 'error'); return; }
    toast('Tablet disconnected', 'success'); tablet(id);
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
    tablet: tablet, pairTablet: pairTablet, unpair: unpair, copyText: copyText, closeOv: closeOv,
    promoEdit: promoEdit, promoField: promoField, promoCourt: promoCourt, promoPick: promoPick, promoSave: promoSave,
    promoActive: promoActive, promoMove: promoMove, promoAsk: promoAsk, promoRemove: promoRemove };
  window.ffpRenderCourts = function () {
    var h = root(); if (h) { css(); h.innerHTML = '<div class="vc-sub" style="padding:20px 0">Loading courts…</div>'; }
    S.edit = null; S.confirm = null; refresh();
  };
  console.log('[FFP Courts v3] Loaded ✓');
})();
