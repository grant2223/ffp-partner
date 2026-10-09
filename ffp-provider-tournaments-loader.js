/* FFP Partner — Tournaments organiser console (desktop).
   Model: Tournament -> Categories -> Entrants -> optional Group stage -> Knockout bracket (auto-advance).
   Stats via lt_sport_schemas. Owner-gated RPCs. All editing inline — no browser prompts. Icons use .ms.
   Reuses the .lg- base styles from the leagues loader; adds .tg- bracket styles.
   Exposes window.ffpRenderTournaments (panel hook) + window.FFPTourn (actions). */
(function () {
  var sb = function () { return window.supabase; };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); };
  function toast(m, k) { if (typeof window.showToast === 'function') { try { window.showToast(m, k || 'info'); return; } catch (e) {} } console.log('[FFP Tourn]', m); }
  function root() { return document.getElementById('tg-root'); }
  function ic(n) { return '<span class="ms">' + n + '</span>'; }
  /* WHO COMPETES decides the language of the whole console. Setup asks
     Individuals, Teams or Both, and every screen has to speak it back: a teams
     event must never say "players" where it means teams. A division's own kind
     wins where there is one, because a Both event holds divisions of each kind;
     otherwise the event's answer does, and a Both event with no division in
     hand stays on the neutral word. Constants carry {one}/{many}/{One}/{Many}
     tokens and say() fills them in at render time. */
  function nouns(d) {
    var mode = (S.detail && S.detail.event && S.detail.event.entrant_mode) || 'individual';
    var team;
    if (d && d.kind) team = d.kind !== 'individual';
    else if (mode === 'mixed') return { one: 'entrant', many: 'entrants', One: 'Entrant', Many: 'Entrants', poss: 'an entrant\u2019s' };
    else team = (mode === 'team');
    return team
      ? { one: 'team', many: 'teams', One: 'Team', Many: 'Teams', poss: 'a team\u2019s' }
      : { one: 'player', many: 'players', One: 'Player', Many: 'Players', poss: 'a player\u2019s' };
  }
  function curDv() {
    return ((S.detail && S.detail.divisions) || []).find(function (d) { return d.id === S.divId; }) || null;
  }
  function say(s, d) {
    var n = nouns(d === undefined ? curDv() : d);
    return String(s).replace(/\{(one|many|One|Many|poss)\}/g, function (_, k) { return n[k]; });
  }
  var STAGE = { r64: 'Round of 64', r32: 'Round of 32', r16: 'Round of 16', quarter: 'Quarter-finals', semi: 'Semi-finals', final: 'Final', third: '3rd place' };
  /* A PLAY-OFF IS NAMED BY THE PLACE IT DECIDES. Every band of a tiered draw
     has one, and calling them all "3rd place" is wrong everywhere but the Cup:
     the play-off under Places 5-8 is for 7th. plays_for carries the answer. */
  function ordNum(n) {
    n = Number(n); if (!n) return '';
    var t = n % 100, s = (t >= 11 && t <= 13) ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th');
    return n + s;
  }
  function stageLbl(m) {
    if (m.stage === 'round') return 'Round ' + (m.round || 1);
    if (m.stage === 'third') return (m.plays_for ? ordNum(m.plays_for) : '3rd') + ' place';
    return STAGE[m.stage] || m.stage;
  }
  // Extra draws a knockout can carry. Every loser of the named round plays on
  // in the next draw down, so nobody travels to an event for one match.
  var SIDE_DRAWS = [
    ['none', 'No, one loss and they are out', 'The shortest event. Lose your first match and you are finished.'],
    ['plate', 'Plate, for first-round losers', 'Everyone beaten in round 1 moves into a second draw, so nobody travels for one match.'],
    ['plate_bowl', 'Plate and Bowl', 'Two draws below the main one. Most {many} get at least three matches.'],
    ['plate_bowl_shield', 'Plate, Bowl and Shield', 'Three draws below the main one. Nearly everyone plays in every round.'],
    ['qf_plate', 'Plate, for quarter-final losers', 'Only the {many} who reach the quarter-finals and lose get a second draw.'],
    ['consolation', 'Feed-in consolation', 'A loser joins the second draw at the round they went out, not back at its start.'],
    ['places', 'Every place played off', 'Nobody stops until their exact finishing position is decided, 1st to last.']
  ];

  // ── CONNECT A SCORING TABLET ──────────────────────────────────────────
  // One 6-digit PIN works the same at every venue and every event. The QR is
  // the shortcut; the PIN is what works when the camera will not play.
  var TABLET_URL = 'https://app.findfitpeople.com/tablet';
  var QR_LIB = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
  function drawPinQr(url) {
    var h = document.getElementById('tg-qr'); if (!h) return;
    var go = function () {
      var h2 = document.getElementById('tg-qr');
      if (h2 && window.QRCode) { h2.innerHTML = ''; try { new window.QRCode(h2, { text: url, width: 132, height: 132, correctLevel: window.QRCode.CorrectLevel.M }); } catch (e) {} }
    };
    if (window.QRCode) { go(); return; }
    var sc = document.createElement('script'); sc.src = QR_LIB; sc.onload = go; sc.onerror = function () {}; document.head.appendChild(sc);
  }

  var S = { view: 'list', eventId: null, detail: null, tab: 'information', divId: null, sports: null, creating: false, divEdit: null, divDel: null, _divUse: null, _potm: null, entAdd: false, entEdit: null, entDel: null, grpDraw: false, brkConfirm: false,
    /* SERIES: the list for the dropdowns, the one being edited, and the
       panel that picks which series teams play a round. */
    seriesList: null, seriesId: null, series: null, serTab: 'rounds', serTeamEdit: null,
    serAddRound: false, serCreating: false, serEnter: null, freeEvents: null };

  function injectBaseCss() {
    if (document.getElementById('tgx-base')) return;
    var css = document.createElement('style'); css.id = 'tgx-base';
    css.textContent = [
      '.lg-wrap{max-width:1000px;}',
      '.lg-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;gap:12px;flex-wrap:wrap;}',
      '.lg-h1{font-size:21px;font-weight:900;color:var(--ffp-text);} .lg-sub{font-size:13px;color:var(--ffp-text-muted);font-weight:600;margin-top:2px;}',
      '.lg-btn{display:inline-flex;align-items:center;gap:6px;border:none;background:#e3ebf1;border-radius:11px;padding:10px 15px;font:inherit;font-size:13px;font-weight:800;color:#14384f;cursor:pointer;} .lg-btn:hover{background:#d7e3ec;} .lg-btn .ms{font-size:18px;}',
      '.lg-btn.pri{background:var(--ffp-blue);border-color:var(--ffp-blue);color:#fff;} .lg-btn.gold{background:linear-gradient(180deg,#ffd15a,#f2a900);border:none;color:#3a2600;} .lg-btn.green{background:#12a05f;border-color:#12a05f;color:#fff;} .lg-btn.ghost{background:none;border-color:transparent;color:var(--ffp-text-muted);} .lg-btn:disabled{opacity:.5;cursor:default;}',
      '.lg-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:14px;}',
      '.lg-card{border:1px solid var(--ffp-border-mid);border-radius:14px;overflow:hidden;cursor:pointer;background:#fff;box-shadow:0 4px 12px rgba(15,34,48,.06);}',
      '#tg-root .lg-cover{height:104px;position:relative;background:linear-gradient(150deg,#5a2fb0,#241053) center/cover no-repeat;} .lg-cover .scr{position:absolute;inset:0;background:linear-gradient(transparent,rgba(8,18,26,.6));} .lg-cover .bd{position:absolute;top:8px;left:8px;font-size:10px;font-weight:900;padding:3px 8px;border-radius:20px;background:#fff;color:#d6353b;} .lg-cover .bd.live{background:#d6353b;color:#fff;} .lg-cover .bd.open{color:#0a8f5f;} .lg-cover .bd.draft,.lg-cover .bd.final{color:#5b6b75;}',
      '.lg-cbody{padding:11px 13px;} .lg-cbody b{font-size:14.5px;font-weight:900;color:var(--ffp-text);display:block;} .lg-cbody span{font-size:12px;color:var(--ffp-text-muted);font-weight:700;text-transform:capitalize;}',
      '.lg-new{border:2px dashed var(--ffp-border-mid);border-radius:14px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;min-height:168px;color:var(--ffp-blue);font-weight:800;cursor:pointer;background:#fff;} .lg-new .ms{font-size:28px;}',
      '.lg-nav{display:flex;gap:22px;border-bottom:1px solid var(--ffp-border);margin-bottom:20px;flex-wrap:wrap;} .lg-nav button{background:none;border:none;font:inherit;font-size:13.5px;font-weight:800;color:var(--ffp-text-muted);padding:11px 0;border-bottom:2.5px solid transparent;cursor:pointer;} .lg-nav button.on{color:var(--ffp-blue);border-bottom-color:var(--ffp-blue);}',
      '.lg-pill{font-size:11px;font-weight:800;padding:3px 10px;border-radius:20px;margin-left:8px;vertical-align:middle;} .lg-pill.live{background:#fdeaea;color:#d6353b;} .lg-pill.open{background:#e3f6ec;color:#0a8f5f;} .lg-pill.draft,.lg-pill.final{background:#eef2f5;color:#5b6b75;}',
      '.lg-lab{font-size:12px;font-weight:800;color:#43525c;margin:0 0 6px;} .lg-in,.lg-sel{width:100%;padding:11px 13px;border:none;border-radius:11px;font:inherit;box-sizing:border-box;background:#eaf0f5;color:#12232f;} .lg-in:focus,.lg-sel:focus{outline:none;background:#fff;box-shadow:0 0 0 2.5px rgba(25,128,173,.45);} .lg-in::placeholder{color:#8a99a8;} .lg-fld{margin-bottom:16px;} .lg-2{display:grid;grid-template-columns:1fr 1fr;gap:14px;} .lg-3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;}',
      '.lg-seg{display:inline-flex;border:1.5px solid var(--ffp-border-mid);border-radius:10px;overflow:hidden;} .lg-seg button{background:#fff;border:none;padding:9px 15px;font:inherit;font-size:12.5px;font-weight:800;color:var(--ffp-text-muted);cursor:pointer;} .lg-seg button.on{background:var(--ffp-blue);color:#fff;} .lg-status4 button{padding:9px 18px;} .lg-status4 button.on.st-draft{background:#6a7c8a;color:#fff;} .lg-status4 button.on.st-open{background:#1980AD;color:#fff;} .lg-status4 button.on.st-live{background:#1c9d54;color:#fff;} .lg-status4 button.on.st-final{background:#e0a400;color:#2a2200;} .lg-cfm{position:fixed;inset:0;z-index:9999;background:#fff;display:flex;} .lg-cfm-in{margin:auto;max-width:460px;width:100%;padding:34px 30px;text-align:center;display:flex;flex-direction:column;align-items:center;} .lg-cfm-ic{font-size:60px;margin-bottom:14px;} .lg-cfm-ic.tone-live{color:#1c9d54;} .lg-cfm-ic.tone-final{color:#e0a400;} .lg-cfm-ic.tone-draft{color:#6a7c8a;} .lg-cfm-t{font-size:24px;font-weight:900;color:#12232f;} .lg-cfm-b{font-size:14.5px;font-weight:600;color:#5a6b78;line-height:1.55;margin-top:12px;} .lg-cfm-a{display:flex;gap:12px;margin-top:28px;width:100%;} .lg-cfm-a .lg-btn{flex:1;justify-content:center;} .lg-cfm-a .lg-btn.st-live{background:#1c9d54;color:#fff;} .lg-cfm-a .lg-btn.st-final{background:#e0a400;color:#2a2200;} .lg-cfm-a .lg-btn.st-draft{background:#6a7c8a;color:#fff;}',
      '.lg-row{display:flex;align-items:center;gap:12px;padding:13px 2px;border-bottom:1px solid var(--ffp-border);} .lg-row .drag{color:#c0cad2;font-size:20px;cursor:grab;} .lg-row .g{flex:1;min-width:0;} .lg-row .g b{font-size:14.5px;font-weight:800;color:var(--ffp-text);} .lg-row .g span{font-size:12.5px;color:var(--ffp-text-muted);font-weight:700;} #tg-root .lg-row .act{color:#9aa8b4;font-size:20px;cursor:pointer;padding:4px;} .lg-row .act:hover{color:var(--ffp-blue);}',
      '.lg-av{position:relative;width:34px;height:34px;border-radius:8px;flex:none;background:#e7ecef center/cover no-repeat;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:900;color:#6a7681;}',
      '.lg-avedit{cursor:pointer;}',
      '.lg-avplus{position:absolute;right:-5px;bottom:-5px;width:17px;height:17px;border-radius:50%;background:var(--ffp-blue,#2ba8e0);color:#fff;font-size:12px;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 3px rgba(0,0,0,.3);border:1.5px solid #fff;}',
      '.lg-empty{padding:40px 16px;text-align:center;color:var(--ffp-text-muted);font-weight:600;font-size:13.5px;}',
      '.lg-tool{display:flex;align-items:center;gap:12px;margin-bottom:16px;flex-wrap:wrap;} .lg-tool .lg-sel{width:auto;min-width:180px;} .lg-tool .sp{flex:1;} #tg-root .lg-tool .lg-in{width:64px;}',
      '.lg-edit{display:flex;align-items:center;gap:10px;padding:12px 2px;border-bottom:1px solid var(--ffp-border);flex-wrap:wrap;} .lg-edit .lg-in{width:auto;flex:1;min-width:160px;}',
      '.lg-entform{align-items:flex-end;gap:12px;padding:16px 2px;} .lg-entform .crest{align-self:flex-end;padding-bottom:5px;} .lg-entform .f{display:flex;flex-direction:column;gap:5px;min-width:0;} #tg-root .lg-entform .f label{height:14px;line-height:14px;font-size:11px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:#7c8b97;} .lg-entform .f.gr{flex:1 1 200px;} #tg-root .lg-entform .f.sm{flex:0 0 92px;} .lg-entform .f .lg-in,.lg-entform .f .lg-sel{width:100%;min-width:0;max-width:100%;flex:none;box-sizing:border-box;height:44px;padding:0 12px;line-height:44px;} .lg-entform .f .lg-in{-webkit-appearance:none;appearance:none;} .lg-entform .f input[type=number]{-moz-appearance:textfield;} .lg-entform .f input[type=number]::-webkit-outer-spin-button,.lg-entform .f input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none;margin:0;} .lg-entform .f .ro{height:44px;display:flex;align-items:center;font-size:14.5px;font-weight:800;color:var(--ffp-text);} .lg-entform .acts{display:flex;align-items:center;gap:9px;flex:1 1 100%;margin-top:4px;} .lg-entform .acts .sp{flex:1;} .lg-entform .lg-btn.danger{color:#c0392b;} .lg-entform .lg-btn.danger:hover{background:#fdf1ef;} .lg-entform .lg-btn.danger.solid{background:#c0392b;border-color:#c0392b;color:#fff;} .lg-entform .delq{font-size:13px;font-weight:800;color:var(--ffp-text);} .lg-entform .note{flex:1 1 100%;font-size:12.5px;font-weight:600;color:#7c8b97;margin-top:2px;} .lg-entform .msg{flex:1 1 100%;font-size:12.5px;font-weight:700;color:#c0392b;} @media(max-width:820px){.lg-entform .f.gr,.lg-entform .f{flex:1 1 100%;}}',
      '.lg-fx{display:grid;grid-template-columns:1fr 128px 1fr;align-items:center;gap:8px;padding:11px 2px;border-bottom:1px solid var(--ffp-border);} .lg-fx .t{font-size:13.5px;font-weight:800;color:var(--ffp-text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;} .lg-fx .t.a{text-align:right;} .lg-fx .sc{display:flex;gap:6px;justify-content:center;} .lg-fx .sc input{width:46px;padding:8px;border:none;border-radius:9px;background:#eaf0f5;font:inherit;font-weight:800;text-align:center;}',
      '.lg-rndlab{font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.4px;color:var(--ffp-text-muted);margin:16px 0 4px;}'
    ].join('\n');
    document.head.appendChild(css);
  }
  function injectExtraCss() {
    if (document.getElementById('tgx-css')) return;
    var css = document.createElement('style'); css.id = 'tgx-css';
    css.textContent = [
      '.tg-brk{overflow-x:auto;padding:6px 2px 16px;} .tg-brkin{display:flex;gap:16px;min-width:max-content;} .tg-thirdwrap{margin-top:16px;border-top:1px solid var(--ffp-border);padding-top:16px;} .tg-m.tg-void{visibility:hidden;}',
      '.tg-rnd{display:flex;flex-direction:column;justify-content:space-around;gap:14px;min-width:200px;} .tg-rnd .rh{font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.5px;color:#9aa8b4;text-align:center;margin-bottom:2px;}',
      '.tg-m{background:#fff;border:1px solid #d7dee5;border-radius:11px;overflow:hidden;} .tg-m .s{display:flex;align-items:center;gap:7px;padding:7px 9px;} .tg-m .s+.s{border-top:1px solid #eef1f6;} .tg-m .s b{flex:1;font-size:12.5px;font-weight:700;color:#12232f;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;} .tg-m .s input{width:40px;padding:5px;border:none;border-radius:8px;background:#eaf0f5;font:inherit;font-weight:800;text-align:center;} .tg-m .s.win b{color:#0a8f5f;} .tg-m .s.tbd b{color:#9aa8b4;font-weight:600;}',
      '.tg-grph{font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:.4px;color:#12232f;margin:16px 0 4px;}',
      '.tg-group{border-bottom:1px solid var(--ffp-border);padding-bottom:14px;margin-bottom:8px;} .tg-gteams{display:flex;flex-wrap:wrap;gap:8px;margin:2px 0 12px;} .tg-gteam{display:inline-flex;align-items:center;gap:7px;background:#f4f7f9;border:1px solid var(--ffp-border);border-radius:20px;padding:5px 12px 5px 6px;font-size:13px;font-weight:700;} .tg-gteam .lg-crest{width:22px;height:22px;border-radius:6px;font-size:9px;}',
      '.tg-phase{font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#9aa8b4;padding:0 6px;} .tg-navsep{display:inline-block;width:1px;height:20px;background:var(--ffp-border);margin:0 4px;vertical-align:middle;}',
      '.tg-tbl{width:100%;border-collapse:collapse;margin-bottom:12px;} .tg-tbl th{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:#9aa8b4;text-align:center;padding:6px 4px;border-bottom:1px solid var(--ffp-border);} .tg-tbl th.nm{text-align:left} .tg-tbl td{font-size:13px;padding:9px 4px;text-align:center;border-bottom:1px solid #f0f3f6;} .tg-tbl td.nm{text-align:left;font-weight:700} .tg-tbl td.nm .in{display:flex;align-items:center;gap:9px} .tg-tbl td.pts{font-weight:900;color:var(--ffp-blue)} .tg-tbl tr.adv td{background:#eafaf3} .tg-tbl .rk{color:#9aa8b4;font-weight:800;width:24px} .tg-tbl .lg-crest{width:22px;height:22px;border-radius:6px;font-size:9px;}',
      '.tg-rlbl{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#b7c2cc;margin:9px 0 1px;} .tg-gfx{display:grid;grid-template-columns:1fr 116px 1fr auto;align-items:center;gap:8px;padding:9px 2px;border-bottom:1px solid #f0f3f6;} .tg-gfx .t{font-size:13.5px;font-weight:700} .tg-gfx .t.a{text-align:right} .tg-gfx .sc{display:flex;gap:6px;justify-content:center} .tg-gfx .sc input{width:42px;height:34px;text-align:center;border:none;border-radius:9px;background:#eaf0f5;font:inherit;font-weight:800;} .fxlab{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:#9aa8b4;margin:10px 0 2px;}',
      '.tg-fmts{display:grid;grid-template-columns:repeat(auto-fit,minmax(168px,1fr));gap:14px;} .tg-fmt{border:1.5px solid var(--ffp-border);border-radius:14px;padding:16px 12px;cursor:pointer;text-align:center;} .tg-fmt.on{border-color:var(--ffp-blue);box-shadow:0 0 0 3px rgba(25,128,173,.12);} .tg-fmt .dia{height:74px;display:flex;align-items:center;justify-content:center;margin-bottom:10px;} .tg-fmt b{display:block;font-size:13.5px;font-weight:900;} .tg-fmt span{display:block;font-size:11.5px;color:var(--ffp-text-muted);font-weight:600;margin-top:3px;line-height:1.4;} .tgd rect{fill:none;stroke:#c3ced6;stroke-width:2.4;} .tgd line{stroke:#c3ced6;stroke-width:2.4;} .tg-fmt.on .tgd rect,.tg-fmt.on .tgd line{stroke:var(--ffp-blue);}',
      '.tg-fmtset{margin-top:18px;border-top:1px solid var(--ffp-border);padding-top:16px;}',
      /* TIERED POOLS. Flat rows on the canvas, hairline separated - the tier
         chip and the band's lit edge carry the weight, so nothing is a card
         inside a card. A one-digit count does not need the full field width,
         hence tg-num, scoped so .lg-in is untouched everywhere else. */
      '.tg-num{max-width:118px;min-width:0;box-sizing:border-box;text-align:center;}',
      '.tg-quota{margin-top:4px;} .tg-qrow{display:flex;align-items:center;gap:13px;padding:11px 2px;border-bottom:1px solid var(--ffp-border);} .tg-qrow:last-child{border-bottom:0;}',
      '.tg-qp{width:26px;height:26px;flex:none;display:grid;place-items:center;border-radius:8px;font-size:13px;font-weight:900;color:#7a5600;background:linear-gradient(160deg,#ffd868,#f2a900);}',
      '.tg-qrow:nth-child(2) .tg-qp{background:linear-gradient(160deg,#ffe6a8,#f6c95e);} .tg-qrow:nth-child(n+3) .tg-qp{background:#e7edf1;color:#7b8f9c;}',
      '.tg-qn{flex:1;min-width:0;font-size:14px;font-weight:800;color:#12232f;} .tg-qn small{display:block;font-size:11.5px;font-weight:700;color:var(--ffp-text-muted);}',
      '.tg-qin{width:74px;flex:none;min-width:0;box-sizing:border-box;text-align:center;}',
      '.tg-lhead{margin-top:18px;} .tg-ladder{margin:2px 0 4px;} .tg-intake{margin-bottom:4px;} .tg-xhint{margin:-6px 0 2px;}',
      /* THE SCHEDULE SETTINGS. Labels above fields, a unit beside the box,
         and the hint only where a number came from somewhere else. No grey
         prose with holes punched in it. */
      '.sc-set{margin-top:4px;} .sc-set .lg-3{gap:14px;} .sc-set .lg-fld{margin-bottom:10px;}',
      '.sc-unit{display:flex;align-items:center;gap:9px;} .sc-unit .lg-in{width:96px;min-width:0;flex:none;box-sizing:border-box;height:44px;} .sc-unit span{font-size:13px;font-weight:700;color:var(--ffp-text-muted);}',
      '.sc-tin{width:168px!important;min-width:0;flex:none;box-sizing:border-box;height:44px;}',
      '.tg-finat{display:flex;align-items:center;gap:11px;margin-top:11px;} .tg-finat span{font-size:13px;font-weight:700;color:#43525c;} .tg-tin{width:178px;min-width:0;flex:none;box-sizing:border-box;}',
      /* the vote settings. The leagues loader draws these with .sz/.szf, which
         this file does not define - so they get their own, scoped names. */
      '.tp-vrow{display:flex;gap:14px;flex-wrap:wrap;} .tp-vrow .f{flex:1 1 280px;min-width:0;display:flex;flex-direction:column;gap:5px;} .tp-vrow .f label{font-size:11px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:#7c8b97;} .tp-vrow .f .lg-sel{width:100%;min-width:0;flex:none;box-sizing:border-box;height:44px;padding:0 12px;}',
      '.tp-vnote{display:flex;gap:9px;align-items:flex-start;margin-top:13px;font-size:12.5px;font-weight:600;color:var(--ffp-text-muted);line-height:1.5;} .tp-vnote .ms{font-size:18px;color:var(--ffp-blue);flex:none;margin-top:1px;}',
      '.tg-lrow{display:flex;align-items:center;gap:14px;padding:12px 2px 12px 12px;border-bottom:1px solid var(--ffp-border);position:relative;} .tg-lrow:last-child{border-bottom:0;}',
      '.tg-lrow::before{content:"";position:absolute;left:0;top:10px;bottom:10px;width:3px;border-radius:2px;background:#d7dee5;} .tg-lrow.tg-top::before{background:linear-gradient(180deg,#ffd868,#f2a900);}',
      '.tg-lpl{width:74px;flex:none;font-size:15px;font-weight:900;color:#12232f;font-variant-numeric:tabular-nums;} .tg-lpl small{display:block;font-size:10px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;color:#a86a00;}',
      '.tg-lties{flex:1;min-width:0;display:flex;flex-wrap:wrap;gap:8px 16px;} .tg-tie{font-size:13.5px;font-weight:800;color:#33485a;font-variant-numeric:tabular-nums;} .tg-tie i{font-style:normal;font-weight:700;color:#9aa8b4;padding:0 2px;} .tg-tie.tg-none{font-weight:700;color:var(--ffp-text-muted);}',
      '.lg-fldbar{display:flex;gap:10px;flex-wrap:wrap;align-items:center;} .lg-fldchip{display:inline-flex;align-items:center;gap:7px;border:1px solid var(--ffp-border-mid);border-radius:12px;padding:7px 11px;font-size:12.5px;font-weight:800;} .lg-fldchip .t{color:var(--ffp-text-muted);font-weight:700;} .lg-fldchip .x{color:#9aa8b4;font-size:16px;cursor:pointer;} .lg-fldchip.add{border-style:dashed;gap:4px;}',
      '.lg-srow{display:grid;grid-template-columns:1fr 132px 92px 120px 140px;gap:9px;align-items:center;padding:10px 2px;border-bottom:1px solid var(--ffp-border);} .lg-srow .mt{font-size:13.5px;font-weight:800;color:var(--ffp-text);min-width:0;} .lg-srow .mt span{display:block;font-size:11px;color:var(--ffp-text-muted);font-weight:600;} .lg-srow .lg-in,.lg-srow .lg-sel{padding:8px 9px;font-size:12.5px;width:100%;}',
      '.lg-brand{display:flex;gap:12px;align-items:stretch;} .lg-logo{width:76px;height:76px;flex:none;border-radius:12px;border:1.5px dashed #d7dee5;background:#f7f9fb center/cover no-repeat;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;color:#9aa8b4;cursor:pointer;font-size:10px;font-weight:800;} .lg-logo .ms{font-size:22px;} .lg-banner{flex:1;height:76px;border-radius:12px;border:1.5px dashed #d7dee5;background:#f7f9fb center/cover no-repeat;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;color:#9aa8b4;cursor:pointer;font-size:11px;font-weight:800;} .lg-banner .ms{font-size:22px;} .lg-row .act{margin-left:auto;color:#9aa8b4;font-size:19px;cursor:pointer;} .lg-banner16{width:100%;max-width:520px;aspect-ratio:16/9;border-radius:12px;border:1.5px dashed #d7dee5;background:#f7f9fb center/cover no-repeat;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;color:#9aa8b4;cursor:pointer;font-size:12px;font-weight:800;} .lg-banner16 .ms{font-size:28px;} .lg-offadd{display:flex;flex-direction:column;gap:10px;margin-bottom:14px;} .lg-offsrch{position:relative;} .lg-offres{margin-top:6px;display:flex;flex-direction:column;gap:4px;} .lg-offopt{display:flex;align-items:center;gap:10px;width:100%;text-align:left;border:1px solid #e6ecf1;background:#fff;border-radius:11px;padding:8px 11px;cursor:pointer;} .lg-offopt .av{width:34px;height:34px;border-radius:8px;flex:none;background:#e7ecef center/cover no-repeat;} .lg-offopt .g{flex:1;min-width:0;} .lg-offopt .g b{font-size:14px;font-weight:800;color:#12232f;display:block;} .lg-offopt .g span{font-size:11.5px;color:#7c8b97;font-weight:600;} .lg-offopt .pk{font-size:12px;font-weight:800;color:#1980AD;} .lg-offnone{font-size:12.5px;color:#7c8b97;font-weight:600;padding:8px 4px;} .lg-offpicked{display:flex;align-items:center;gap:6px;font-size:13px;font-weight:800;color:#0a8f5f;padding:6px 4px;} .lg-offrow{display:flex;gap:10px;align-items:center;flex-wrap:wrap;} .og-sec{padding:2px 0 16px;border-bottom:1px solid var(--ffp-border);margin-bottom:16px;} .og-hd{display:flex;align-items:flex-start;gap:11px;margin-bottom:12px;} .og-hd>.ms{font-size:21px;color:var(--ffp-purple,#0a3e44);opacity:.75;flex:none;margin-top:1px;} .og-hd .t{flex:1;min-width:0;} .og-hd .t b{display:block;font-size:15px;font-weight:900;color:var(--ffp-text);} .og-hd .t span{display:block;margin-top:3px;font-size:12.5px;font-weight:600;color:var(--ffp-text-muted);line-height:1.5;} .og-pool{display:flex;flex-wrap:wrap;gap:8px;} .og-chip{display:inline-flex;align-items:center;gap:8px;padding:5px 11px 5px 5px;border:1px solid var(--ffp-border-mid);border-radius:999px;font-size:13px;font-weight:800;} .og-chip.noacct{border-style:dashed;} .og-chip .lg-av{width:26px;height:26px;font-size:10px;} .og-chip em{font-style:normal;font-size:17px;color:#9aa8b4;cursor:pointer;} .og-chip em:hover{color:var(--ffp-blue);} .og-foot{margin-top:11px;font-size:12px;font-weight:600;color:var(--ffp-text-muted);} .og-crewwrap{background:var(--ffp-bg-3,#eef3f4);border-radius:14px;padding:16px 18px;} .og-lead{display:flex;align-items:flex-start;gap:11px;margin-bottom:6px;} .og-lead>.ms{font-size:21px;color:var(--ffp-purple,#0a3e44);opacity:.75;flex:none;margin-top:1px;} .og-lead b{display:block;font-size:15px;font-weight:900;} .og-lead span{display:block;margin-top:3px;font-size:12.5px;font-weight:600;color:var(--ffp-text-muted);line-height:1.5;} .og-crew{margin-top:16px;padding-top:14px;border-top:1px solid var(--ffp-border-mid);} .og-crew:first-of-type{border-top:none;padding-top:4px;} .og-ch{display:flex;align-items:center;gap:9px;margin-bottom:6px;} .og-ch b{font-size:12px;font-weight:900;letter-spacing:.13em;text-transform:uppercase;} .og-ch .og-app{font-size:12px;font-weight:700;color:var(--ffp-text-muted);}/* NOT .app: the dashboard shell owns .app{display:flex;height:100vh} as its ROOT layout, so a label wearing that class was 100vh tall and blew the crew header apart. */ .og-ch .sp{flex:1;} .og-note{display:flex;gap:8px;align-items:flex-start;font-size:12px;font-weight:600;color:var(--ffp-text-muted);line-height:1.5;padding:2px 2px 0;} .og-note .ms{font-size:16px;flex:none;opacity:.6;} #tg-root .og-acc{max-width:190px;flex:none;} #tg-root .og-acc.on{border-color:var(--ffp-blue);background:#f2f8fb;color:#1b5f85;} .og-pick{margin:0 0 12px 46px;padding:12px 14px;border-left:2px solid var(--ffp-yellow,#FFCC00);background:#fff;border-radius:0 10px 10px 0;} .og-pickh{font-size:13px;font-weight:900;margin-bottom:8px;} .og-pl{font-size:10px;font-weight:900;letter-spacing:.14em;text-transform:uppercase;color:var(--ffp-text-dim);margin:10px 0 4px;} .og-opt{display:flex;align-items:center;gap:10px;padding:7px 2px;border-bottom:1px solid #eef2f5;font-size:13px;font-weight:700;cursor:pointer;} .og-opt:last-of-type{border-bottom:none;} .og-opt input{width:17px;height:17px;flex:none;margin:0;} .og-opt span{flex:1;min-width:0;} .og-opt em{font-style:normal;font-size:11.5px;font-weight:700;color:var(--ffp-text-muted);} .og-pickb{display:flex;gap:9px;margin-top:12px;} .og-crew .lg-row .g b{display:block;} .og-crew .lg-row .g span{display:block;margin-top:1px;} .lg-pdf{display:flex;align-items:center;gap:12px;margin-top:10px;padding:12px 2px;border-top:1px solid var(--ffp-border);} .lg-pdf>.ms{font-size:22px;color:#9aa8b4;flex:none;} .lg-pdf.has>.ms{color:var(--ffp-blue);} .lg-pdf .g{flex:1;min-width:0;} .lg-pdf .g b{display:block;font-size:14px;font-weight:800;color:var(--ffp-text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;} .lg-pdf .g span{display:block;margin-top:2px;font-size:12px;font-weight:600;color:var(--ffp-text-muted);} .lg-pdf .lg-btn{flex:none;text-decoration:none;} #tg-root .lg-pdf .x{flex:none;font-size:20px;color:#9aa8b4;cursor:pointer;padding:4px;} #tg-root .lg-pdf .x:hover{color:#c0392b;}',
      '.og-mgr .og-team{flex:none;display:inline-flex;align-items:center;gap:6px;max-width:210px; background:#eef4f8;border:1px solid #d9e4ec;border-radius:9px;padding:6px 10px; font-size:12.5px;font-weight:800;color:#17789f;} .og-mgr .og-team .ms{font-size:16px;flex:none;} .og-mgr .og-team b{font-weight:800;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;} .og-mgr .og-two{display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;} .og-mgr .og-two .f{flex:1 1 220px;min-width:0;display:flex;flex-direction:column;gap:5px;} .og-mgr .og-two .f label{font-size:11px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:#7c8b97;} .og-mgr .og-two .f .lg-in,.og-mgr .og-two .f .lg-sel{width:100%;min-width:0;flex:none;box-sizing:border-box;height:44px;padding:0 12px;} .og-mgr .og-two .lg-btn{flex:none;height:44px;} .og-mgr .og-note{display:flex;align-items:flex-start;gap:8px;margin-top:12px;font-size:12px; font-weight:700;color:#5c6f7c;line-height:1.5;} .og-mgr .og-note .ms{font-size:17px;color:#17789f;flex:none;margin-top:1px;} .og-mgr .lg-row .g{flex:1;min-width:0;} .og-mgr .lg-row .g b{display:block;font-size:14px;font-weight:800;color:#12232f; overflow:hidden;text-overflow:ellipsis;white-space:nowrap;} .og-mgr .lg-row .g span{display:block;font-size:12px;font-weight:600;color:#7c8b97;margin-top:2px; overflow:hidden;text-overflow:ellipsis;white-space:nowrap;} .og-mgr .og-team{max-width:none;} .og-mgr .og-team b{max-width:300px;} .og-mgr .og-two{align-items:flex-start;} .og-mgr .og-two .lg-btn{margin-top:22px;} @media(max-width:720px){.og-mgr .lg-row{flex-wrap:wrap;} .og-mgr .og-team{order:3;margin-left:46px;}}',
      /* shared v7: crest / collapsible rounds / venues / schedule v2 / officials */
      '.lg-crest{width:32px;height:32px;border-radius:9px;flex:none;background:#241053 center/cover no-repeat;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:900;color:#fff;box-shadow:inset 0 0 0 1px rgba(0,0,0,.05),0 1px 2px rgba(0,0,0,.14);vertical-align:middle;}',
      '.lg-rnd{display:flex;align-items:center;gap:12px;margin:20px 0 2px;padding:12px 14px;background:linear-gradient(180deg,#f7fafc,#eef4f8);border:1px solid #e4edf3;border-radius:12px;cursor:pointer;user-select:none;} .lg-rnd:hover{background:linear-gradient(180deg,#f2f8fb,#e7f1f7);} .lg-rnd .chev{color:var(--ffp-blue);font-size:22px;transition:transform .2s;} .lg-rnd.collapsed .chev{transform:rotate(-90deg);} .lg-rnd .rt{font-size:14px;font-weight:900;color:var(--ffp-text);} .lg-rnd .rc{font-size:11px;font-weight:800;color:var(--ffp-blue);background:#e2eff6;padding:3px 10px;border-radius:20px;} .lg-rnd .rd{font-size:12px;font-weight:600;color:var(--ffp-text-muted);} .lg-rnd .sp{flex:1;} .lg-rbody.hidden{display:none;}',
      '.lg-venue{padding:18px 4px;border-bottom:1px solid var(--ffp-border);} .lg-vh{display:flex;align-items:center;gap:12px;} .lg-vpin{width:38px;height:38px;border-radius:11px;background:linear-gradient(180deg,#eaf4f9,#dcecf3);color:var(--ffp-blue);display:flex;align-items:center;justify-content:center;flex:none;} .lg-vpin .ms{font-size:21px;} .lg-vh .g{flex:1;min-width:0;} .lg-vh .g b{font-size:16px;font-weight:900;color:var(--ffp-text);} .lg-vh .g span{display:block;font-size:12.5px;color:var(--ffp-text-muted);font-weight:700;} .lg-vh .act{color:#9aa8b4;font-size:19px;cursor:pointer;padding:5px;border-radius:8px;} .lg-vh .act:hover{color:var(--ffp-blue);background:#f4f7f9;}',
      '.tg-kind{position:absolute;left:8px;top:8px;font-size:10px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;color:#a86a08;background:#fff4e0;padding:3px 7px;border-radius:6px;} .tg-awgrid{width:100%;text-align:left;margin-top:18px;} .tg-awrow{display:flex;gap:8px;margin-top:7px;} .tg-awrow.wrap{flex-wrap:wrap;} .tg-awrow .lg-btn{flex:1;justify-content:center;min-width:110px;} .tg-awrow .lg-btn.on{background:var(--ffp-blue);border-color:var(--ffp-blue);color:#fff;}',
      '.lg-scrbtn{display:inline-flex;align-items:center;gap:6px;border:none;background:#dceaf2;color:var(--ffp-blue);border-radius:9px;padding:5px 10px;font:inherit;font-size:12px;font-weight:900;letter-spacing:.06em;cursor:pointer;margin-right:10px;} .lg-scrbtn .ms{font-size:16px;} .lg-scrbtn.perm{border-color:#f2c14e;background:#fffaf0;color:#9a6b00;} .lg-vclink{width:230px!important;min-width:0;flex:none;margin-left:auto;height:36px!important;padding:0 30px 0 10px!important;font-size:16px!important;margin-right:10px;box-sizing:border-box;} .lg-scr{max-width:520px;} .lg-scrlab{font-size:12.5px;font-weight:800;color:#7c8b97;margin-top:16px;} .lg-scrurl{font-size:26px;font-weight:900;color:#12232f;letter-spacing:-.4px;margin-top:6px;word-break:break-all;} .lg-scrurl.gfx{font-size:19px;letter-spacing:-.2px;} .lg-hex{display:flex;gap:6px;align-items:center;} .lg-hex .sw{width:38px;height:38px;flex:none;padding:2px;border:1.5px solid #d7dee5;border-radius:8px;background:#fff;cursor:pointer;} .lg-scrnote{font-size:12px;font-weight:600;color:#9aa8b4;margin-top:10px;} .lg-scrsteps{text-align:left;margin-top:20px;display:flex;flex-direction:column;gap:11px;width:100%;} .lg-scrsteps div{display:flex;gap:11px;align-items:flex-start;font-size:13.5px;font-weight:600;color:#43525c;line-height:1.5;} .lg-scrsteps b{flex:none;width:22px;height:22px;border-radius:50%;background:var(--ffp-blue);color:#fff;font-size:12px;display:flex;align-items:center;justify-content:center;}',
      '.lg-surfs{margin:12px 0 0 51px;position:relative;} .lg-surfs:before{content:"";position:absolute;left:-13px;top:2px;bottom:18px;width:1.5px;background:#e4edf3;} .lg-surf{display:flex;align-items:center;gap:10px;padding:10px 0;font-size:14px;font-weight:600;border-bottom:1px solid #f4f7f9;} .lg-surf .ms{color:var(--ffp-blue);font-size:18px;opacity:.85;} .lg-surf .x{color:#c0cad2;cursor:pointer;font-size:18px;} .lg-surf .x:hover{color:#d64545;} .lg-addsurf{margin:12px 0 0 51px;} .lg-btn.ghostb{color:var(--ffp-blue);border-color:#d4e6ef;background:#f5fafc;} .lg-maplink{display:inline-flex;align-items:center;gap:3px;color:var(--ffp-blue);font-weight:800;text-decoration:none;} .lg-maplink .ms{font-size:15px;vertical-align:-3px;}',
      '.lg-srow2{display:grid;grid-template-columns:1.2fr 1fr;gap:22px;align-items:start;padding:16px 4px;border-bottom:1px solid var(--ffp-border);} .lg-srow2 .s-match b{font-size:15px;font-weight:800;} .lg-srow2 .s-match small{display:block;font-size:11px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#9aa8b4;margin-top:3px;} .lg-srow2 .s-when{display:flex;gap:8px;margin-top:11px;} .lg-srow2 .s-when .lg-in{padding:8px 9px;font-size:13px;} .lg-srow2 .s-right{display:flex;flex-direction:column;gap:9px;} .lg-srow2 .fl{font-size:11px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#9aa8b4;} .lg-srow2 .st-f{padding:9px 10px;font-size:13px;}',
      '.lg-offlist{display:flex;flex-direction:column;gap:6px;} .lg-offtag{display:flex;align-items:center;gap:9px;font-size:13px;padding:7px 10px;border:1px solid var(--ffp-border-mid);border-radius:9px;background:#fbfcfd;} .lg-offtag .role{font-size:10px;font-weight:900;letter-spacing:.05em;text-transform:uppercase;color:var(--ffp-blue);} .lg-offtag .nm{font-weight:700;} .lg-offtag .sp{flex:1;} .lg-offtag .x{color:#c0cad2;cursor:pointer;font-size:16px;} .lg-assign{display:flex;gap:7px;align-items:center;} .lg-assign .lg-sel{padding:7px 9px;font-size:12.5px;flex:1;} .lg-btn.sm{padding:7px 11px;font-size:12px;} .lg-maed{background:#f7fafc;border:1px solid #e4edf3;border-radius:12px;padding:12px;margin-bottom:14px;} .lg-scpill{display:inline-block;font-size:9px;font-weight:900;letter-spacing:.05em;color:#0a8f5f;background:#e3f6ec;padding:2px 7px;border-radius:20px;vertical-align:middle;margin-left:6px;} .lg-scpill.inv{color:#8a6d00;background:#fff4d6;} .lg-scpill.txt{color:#5b6b75;background:#eef2f5;} .lg-ocap{max-width:180px;padding:7px 9px;font-size:12.5px;}',
      '.lg-sq{background:#f7fafc;border:1px solid #e4edf3;border-radius:12px;padding:12px 14px;margin:0 0 12px 46px;} .lg-sqsrch{display:flex;align-items:center;gap:8px;border:none;background:#eaf0f5;border-radius:11px;padding:10px 13px;} .lg-sqsrch .ms{color:#9aa8b4;font-size:19px;} .lg-sqsrch input{border:none;outline:none;font:inherit;font-weight:600;font-size:13.5px;flex:1;background:none;} .lg-sqres{background:#fff;border:1px solid #eef2f5;border-radius:10px;margin-top:8px;padding:2px 12px;} .lg-sqres .row{display:flex;align-items:center;gap:10px;padding:8px 2px;border-bottom:1px solid #f2f5f7;} .lg-sqres .row:last-child{border-bottom:none;} .lg-sqres .av{width:32px;height:32px;border-radius:50%;background:#dfe7ec center/cover no-repeat;flex:none;} .lg-sqres .g{flex:1;min-width:0;} .lg-sqres .g b{font-size:13.5px;font-weight:800;display:block;} .lg-sqres .g span{font-size:11px;color:#8a99a6;font-weight:600;} .lg-sqhint{margin-top:10px;font-size:10.5px;font-weight:900;letter-spacing:.1em;text-transform:uppercase;color:#8a99a6;} .lg-sqadd2{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;} .lg-sqlist{margin-top:8px;} .lg-sqrow{display:flex;align-items:center;gap:8px;padding:9px 2px;border-bottom:1px solid #f0f3f6;font-size:13.5px;font-weight:700;} .lg-sqrow:last-child{border-bottom:none;} .lg-sqrow .sp{flex:1;} .lg-sqrow .x{color:#c0cad2;cursor:pointer;font-size:17px;}',
      '.lg-per{display:flex;align-items:center;gap:10px;margin-bottom:14px;} .lg-per .sp{flex:1;} .lg-perchip{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:900;letter-spacing:.04em;text-transform:uppercase;padding:7px 12px;border-radius:20px;background:#eef2f5;color:#5b6b75;} .lg-perchip.live{background:#fdeaea;color:#d6353b;} .lg-perchip.live .d{width:7px;height:7px;border-radius:50%;background:#d6353b;} .lg-perchip.ht{background:#fff4d6;color:#8a6d00;} .lg-perchip.ft{background:#e3f6ec;color:#0a8f5f;} .lg-perset{display:flex;align-items:center;gap:10px;margin-bottom:14px;font-size:13px;font-weight:700;color:var(--ffp-text-muted);}',
      '.lg-trk{background:#f7fafc;border:1px solid #e4edf3;border-radius:12px;padding:14px 16px;margin-bottom:18px;} .lg-trk-clock{display:flex;align-items:center;gap:12px;margin-bottom:14px;} .lg-trk-clock .t{font-size:30px;font-weight:900;font-variant-numeric:tabular-nums;color:var(--ffp-text);} .lg-trk-clock .sp{flex:1;} .lg-trk-grp{margin-bottom:12px;} .lg-trk-lab{font-size:11px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#8a99a6;margin-bottom:6px;} .lg-trk-btns{display:flex;gap:10px;} .lg-trk-b{flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;border:none;background:#eaf0f5;border-radius:11px;padding:11px 10px;font:inherit;font-size:13.5px;font-weight:800;color:var(--ffp-text);cursor:pointer;} .lg-trk-b span{font-size:12px;font-weight:900;color:#8a99a6;} .lg-trk-b.on{border-color:var(--ffp-blue);background:#eaf4fb;color:var(--ffp-blue);} .lg-trk-b.on span{color:var(--ffp-blue);} .lg-trk-apply{display:flex;align-items:center;gap:12px;margin-top:4px;flex-wrap:wrap;} .lg-trk-apply .sum{flex:1;font-size:12.5px;font-weight:700;color:var(--ffp-text-muted);min-width:180px;} .lg-livebtn{color:#d6353b;border-color:#f3c6c6;background:#fdeff0;}',
      /* match centre */
      '.lg-mcbtn{border:none;background:none;color:#9aa8b4;cursor:pointer;padding:4px;border-radius:8px;} .lg-mcbtn:hover{color:var(--ffp-blue);background:#f4f7f9;} .lg-mcbtn .ms{font-size:20px;} .tg-m .tg-macts{position:absolute;top:4px;right:4px;display:flex;gap:2px;}.tg-m .s .sd{flex:none;min-width:17px;height:17px;padding:0 4px;border-radius:4px;background:#eef2f5;color:#5b6b75;font-size:10px;font-weight:900;line-height:17px;text-align:center;}.tg-m .s.win .sd{background:rgba(31,157,87,.14);color:var(--ffp-green);}.tg-mf{display:flex;align-items:center;gap:8px;padding:5px 9px;border-top:1px solid #eef2f5;background:#fafbfc;}.tg-mf .wh{flex:1;min-width:0;font-size:10.5px;font-weight:700;color:#6a7c8a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}.tg-mf .wh.dim{color:#a7b3bd;}.tg-mcb{flex:none;border:0;background:none;padding:0;cursor:pointer;color:var(--ffp-blue);line-height:0;}.tg-mcb .ms{font-size:18px;} .tg-mcbtn{position:static;} .tg-m{position:relative;}',
      '.lg-mchd{display:flex;align-items:center;justify-content:center;gap:16px;padding:16px 4px;border-bottom:1px solid var(--ffp-border);} .lg-mchd .tm{display:flex;align-items:center;gap:9px;font-size:15px;font-weight:800;} .lg-mchd .tm.a{flex-direction:row-reverse;} .lg-mchd .scr{font-size:26px;font-weight:900;color:var(--ffp-text);min-width:80px;text-align:center;}',
      '.lg-mctabs{display:flex;gap:20px;border-bottom:1px solid var(--ffp-border);margin:8px 0 4px;} .lg-mctabs button{background:none;border:none;font:inherit;font-size:13.5px;font-weight:800;color:var(--ffp-text-muted);padding:11px 0;border-bottom:2.5px solid transparent;cursor:pointer;} .lg-mctabs button.on{color:var(--ffp-blue);border-bottom-color:var(--ffp-blue);}',
      '.lg-mcadd{display:flex;gap:8px;flex-wrap:wrap;align-items:center;padding:14px 2px;border-bottom:1px solid var(--ffp-border);} .lg-mcadd .lg-sel{width:auto;flex:1;min-width:120px;padding:8px 10px;font-size:13px;} .lg-mcadd .lg-in{padding:8px 10px;font-size:13px;}',
      '.lg-mcrow{display:flex;align-items:center;gap:10px;padding:11px 2px;border-bottom:1px solid #f0f3f6;font-size:13px;} .lg-mcrow .mn{width:34px;font-weight:800;color:#9aa8b4;} .lg-mcrow .kd{font-size:10px;font-weight:900;letter-spacing:.04em;padding:3px 8px;border-radius:6px;background:#eef2f5;color:#5b6b75;} .lg-mcrow .kd.try{background:#e3f0ff;color:#0b4a8f;} .lg-mcrow .kd.penalty,.lg-mcrow .kd.drop_goal{background:#fff1e3;color:#b45309;} .lg-mcrow .kd.yellow_card{background:#fff7d6;color:#8a6d00;} .lg-mcrow .kd.red_card{background:#ffe0e0;color:#a11111;} .lg-mcrow .pl{font-weight:700;} .lg-mcrow .tn{color:#8a99a6;font-weight:600;} .lg-mcrow .rs{margin-left:auto;font-weight:900;} .lg-mcrow .x{color:#c0cad2;cursor:pointer;font-size:17px;}',
      '.lg-mcfields{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px;margin-top:6px;} .lg-mcf{display:flex;flex-direction:column;gap:5px;} .lg-mcf label{font-size:12px;font-weight:800;color:#43525c;} .lg-mcf .lg-in{padding:9px 11px;}',
      '.lg-livebtn{color:#d6353b;border-color:#f3c6c6;background:#fdeff0;} .lg-mcstat.final{font-size:12px;font-weight:800;color:#5b6b75;background:#eef2f5;padding:8px 12px;border-radius:10px;}',
      '.lg-teamstat .hd{display:grid;grid-template-columns:1fr 1.4fr 1fr;align-items:center;padding:8px 2px 12px;border-bottom:1px solid var(--ffp-border);} .lg-teamstat .hd span{font-size:13px;font-weight:800;text-align:center;} .lg-teamstat .hd span:first-child{text-align:left;} .lg-teamstat .hd span:last-child{text-align:right;}',
      '.lg-tsrow{display:grid;grid-template-columns:1fr 1.4fr 1fr;align-items:center;gap:10px;padding:9px 2px;border-bottom:1px solid #f0f3f6;} .lg-tsrow .lab{text-align:center;font-size:12.5px;font-weight:700;color:#43525c;} .lg-tsrow .lg-in{padding:8px 10px;text-align:center;}',
      '#tg-root .lg-nav{gap:15px;align-items:center;}#tg-root .lg-nav .tg-phase{padding:0 2px 0 0;}#tg-root .lg-nav .tg-navsep{margin:0 2px;}',
      /* the day strip takes a match: drop one on a day and it parks there */
      + '.md-strip .md-dbtn{position:relative;}'
      + '.md-strip .md-dbtn.dz{background:#FFF4DC;box-shadow:inset 0 3px 0 #F2A900,inset 0 0 0 2px #F2A900;}'
      + '.md-strip .md-dbtn .dzl{display:flex;align-items:center;gap:5px;font-size:10px;'
        + 'font-weight:900;letter-spacing:.09em;color:#B87A00;margin-top:4px;}'
      + '.md-strip .md-dbtn .dzl .ms{font-size:14px;color:#B87A00 !important;}'
      /* TO PLACE: every match still waiting for a time and a court */
      + '.md-tray{border-top:1px solid var(--ffp-border);border-bottom:1px solid var(--ffp-border);'
        + 'padding:13px 2px 14px;margin:14px 0 0;}'
      + '.md-tray.dz{background:#FFF4DC;box-shadow:inset 0 0 0 2px #F2A900;border-color:transparent;}'
      + '.md-tray .th{display:flex;align-items:center;gap:9px;flex-wrap:wrap;}'
      + '.md-tray .th .ms{font-size:19px;color:var(--ffp-text-dim) !important;}'
      + '.md-tray .th b{font-size:10.5px;font-weight:900;letter-spacing:.14em;color:var(--ffp-blue);}'
      + '.md-tray .th span{font-size:12.5px;font-weight:600;color:var(--ffp-text-muted);}'
      + '.md-tray .tr{display:flex;gap:10px;flex-wrap:wrap;margin-top:11px;}'
      /* the card only. The empty-tray prompt is a sibling and must not inherit
         a border, or it draws as a white box on a white background. */
      + '.md-tray .tr>div:not(.mt){width:208px;border:1px solid var(--ffp-border-mid);'
        + 'border-radius:8px;padding:9px 10px 10px;background:#fff;cursor:grab;}'
      + '.md-tray .tr>div:not(.mt):active{cursor:grabbing;}'
      + '.md-tray .tr>div.dragging{opacity:.4;}'
      + '.md-tray .mt{display:flex;align-items:center;gap:8px;font-size:12.5px;font-weight:700;'
        + 'color:var(--ffp-text-dim);padding:14px 0 4px;}'
      + '.md-tray .mt .ms{font-size:18px;color:var(--ffp-text-dim) !important;}'
      /* THE CARD LIVES OUTSIDE .md-g HERE, so every rule it leans on is
         repeated. Without this it renders as italic, underlined run-on text. */
      + '.md-tray .tr .mno{display:inline-block;font-style:normal;font-size:10px;font-weight:900;'
        + 'letter-spacing:.06em;color:var(--ffp-text-muted);background:#EEF2F6;padding:2px 6px;'
        + 'border-radius:3px;margin-bottom:5px;}'
      + '.md-tray .tr .tag{display:block;font-size:9px;font-weight:900;letter-spacing:.08em;margin-bottom:1px;}'
      + '.md-tray .tr .rnd{display:block;font-style:normal;font-size:10px;font-weight:800;'
        + 'color:var(--ffp-text-muted);margin-bottom:5px;line-height:1.25;}'
      + '.md-tray .tr .who{text-decoration:none;display:block;font-size:11.5px;font-weight:800;'
        + 'line-height:1.3;color:var(--ffp-text);overflow-wrap:anywhere;}'
      + '.md-tray .tr s.who{font-weight:700;color:var(--ffp-text-muted);}'
      + '.md-tray .tr .who .vs{display:block;font-style:normal;font-size:9px;font-weight:900;'
        + 'letter-spacing:.14em;color:#9AA8B4;margin:2px 0;}'
      + '.md-tray .tr s.who.tbd i{display:block;font-style:normal;font-size:10.5px;font-weight:700;'
        + 'color:#9AA8B4;margin-top:3px;}'
      /* dropping on an occupied cell trades the two, and now says so */
      + 'table.md-g td.dz.swap{position:relative;}'
      + 'table.md-g td.dz.swap>div{opacity:.4;}'
      + 'table.md-g td.dz.swap:after{content:"THESE TWO TRADE PLACES";position:absolute;left:50%;'
        + 'top:50%;transform:translate(-50%,-50%);font-size:9px;font-weight:900;letter-spacing:.1em;'
        + 'color:#fff;background:#1980AD;padding:6px 9px;border-radius:4px;text-align:center;'
        + 'line-height:1.35;width:92px;}'
      /* one spare slot on the end, so a match can go later than anything booked */
      + 'table.md-g th.nx{background:#FBFCFD;color:var(--ffp-text-muted);}'
      + 'table.md-g th.nx .nwx{display:block;font-size:8.5px;font-weight:900;letter-spacing:.12em;'
        + 'color:var(--ffp-text-dim);margin-top:3px;}'
      + 'table.md-g td.free.nx{background:repeating-linear-gradient(135deg,#F7F9FB 0 6px,#fff 6px 12px);}'
      + '.md-top{padding:2px 0 0;}.md-day{display:flex;align-items:center;gap:8px;padding:2px 0 14px;}.md-day b{font-size:17px;font-weight:900;color:var(--ffp-text);}.md-day .tz{font-size:11.5px;font-weight:700;color:var(--ffp-text-muted);margin-left:6px;}.md-day .sp{flex:1;}.md-cnt{display:flex;align-items:stretch;border-top:1px solid var(--ffp-border);border-bottom:1px solid var(--ffp-border);margin-bottom:6px;}.md-cn{padding:12px 22px 11px;border-right:1px solid var(--ffp-border);min-width:104px;}.md-cn:last-child{border-right:0;}.md-cn u{text-decoration:none;display:block;font-size:22px;font-weight:900;letter-spacing:-.03em;line-height:1;font-variant-numeric:tabular-nums;color:var(--ffp-text);}.md-cn s{text-decoration:none;display:block;font-size:10px;font-weight:800;letter-spacing:.12em;color:var(--ffp-text-muted);margin-top:6px;}.md-cn.ok u{color:#1F7A5C;}.md-cn.warn u{color:#B87A00;}.md-cn.blue u{color:var(--ffp-blue);}/* THE WHOLE DAY, as approved: surfaces down the side, slots across, the slot   being played bracketed in gold rather than a line struck through the names. */.md-dy{background:#fff;border-radius:12px;overflow:hidden;position:relative;box-shadow:0 1px 0 var(--ffp-border),0 8px 22px rgba(14,40,66,.06);}.md-dy .sc{overflow-x:auto;}table.md-g{border-collapse:collapse;width:100%;}table.md-g th,table.md-g td{border-right:1px solid var(--ffp-border);border-bottom:1px solid var(--ffp-border);vertical-align:top;}table.md-g th.cl,table.md-g td.cl{width:104px;min-width:104px;border-right:2px solid var(--ffp-border-mid);}table.md-g thead th{background:#F8FAFC;padding:11px 8px;font-size:11.5px;font-weight:900;letter-spacing:.05em;color:var(--ffp-blue);font-variant-numeric:tabular-nums;text-align:center;min-width:132px;}table.md-g thead th.cl{text-align:left;padding-left:14px;font-size:9.5px;letter-spacing:.13em;color:var(--ffp-text-muted);}table.md-g td.cl{padding:11px 14px;background:#FBFCFD;}table.md-g td.cl b{display:block;font-size:13.5px;font-weight:900;color:var(--ffp-text);}table.md-g td.cl s{text-decoration:none;display:block;font-size:9px;font-weight:700;letter-spacing:.12em;color:var(--ffp-text-muted);margin-top:3px;}table.md-g td{padding:0;}table.md-g td>div{padding:8px 9px 9px;min-height:50px;}table.md-g td.dbl>div:first-child{border-bottom:2px dashed #B87A00;}table.md-g td.dbl>div{min-height:0;}table.md-g th.now,table.md-g td.now{border-left:2px solid #F2A900;border-right:2px solid #F2A900;}table.md-g th.now{border-top:3px solid #F2A900;}table.md-g th.now .nw{display:block;font-size:8.5px;font-weight:900;letter-spacing:.12em;color:#B87A00;margin-top:3px;}table.md-g tr:last-child td.now{border-bottom:3px solid #F2A900;}.md-g .tag{display:block;font-size:9px;font-weight:900;letter-spacing:.08em;margin-bottom:1px;}.md-g .rnd{display:block;font-style:normal;font-size:10px;font-weight:800;color:var(--ffp-text-muted);margin-bottom:5px;line-height:1.25;}.md-g .who{text-decoration:none;display:block;font-size:11.5px;font-weight:800;line-height:1.3;color:var(--ffp-text);overflow-wrap:anywhere;}.md-g s.who{font-weight:700;color:var(--ffp-text-muted);}.md-g .who .vs{display:block;font-style:normal;font-size:9px;font-weight:900;letter-spacing:.14em;color:#9AA8B4;margin:2px 0;}.md-g s.who.tbd{font-weight:800;color:var(--ffp-text-muted);}.md-g s.who.tbd i{display:block;font-style:normal;font-size:10.5px;font-weight:700;color:#9AA8B4;margin-top:3px;}.md-g .sc2{font-style:normal;display:block;font-size:12px;font-weight:900;margin-top:4px;color:#1F7A5C;font-variant-numeric:tabular-nums;}.md-g .c-done{background:#E8F5EF;}.md-g .c-live{background:#FFF4DC;box-shadow:inset 0 0 0 2px #F2A900;}.md-g .c-late{background:#FDF6E6;}.md-g .c-wait{background:#fff;}.md-g .c-none{background:repeating-linear-gradient(135deg,#EEF2F6 0 6px,#F7F9FB 6px 12px);}table.md-g td.free{min-height:50px;}table.md-g td.free:after{content:"";display:block;min-height:50px;}table.md-g td[data-fid]{transition:background .12s;}table.md-g td.dz{background:#FFF4DC;box-shadow:inset 0 0 0 2px #F2A900;}table.md-g td.dz.swap{box-shadow:inset 0 0 0 2px #1980AD;background:#eaf4fa;}.md-g td>div[draggable]{cursor:grab;}.md-g td>div[draggable]:active{cursor:grabbing;}.md-g td>div.dragging{opacity:.4;}.md-nowtag{position:absolute;top:3px;font-size:10.5px;font-weight:900;letter-spacing:.09em;z-index:4;color:#B87A00;white-space:nowrap;transform:translateX(-50%);padding-bottom:7px;}.md-key{display:flex;flex-wrap:wrap;gap:20px;margin:14px 2px 0;font-size:10.5px;font-weight:800;letter-spacing:.07em;color:var(--ffp-text-muted);}.md-key span{display:flex;align-items:center;gap:8px;}.md-key i{width:18px;height:11px;border-radius:3px;display:block;flex:none;}.md-strip{display:flex;align-items:stretch;flex-wrap:wrap;border-top:1px solid var(--ffp-border);border-bottom:1px solid var(--ffp-border);margin:0 0 4px;}.md-dbtn{border:0;background:none;font:inherit;cursor:pointer;text-align:left;padding:11px 18px 10px;border-right:1px solid var(--ffp-border);box-shadow:inset 0 3px 0 transparent;}.md-dbtn:hover{background:#f6f9fb;}.md-dbtn b{display:block;font-size:12.5px;font-weight:800;color:var(--ffp-text-muted);}.md-dbtn s{text-decoration:none;display:block;font-size:10px;font-weight:800;letter-spacing:.09em;color:var(--ffp-text-dim);margin-top:4px;font-variant-numeric:tabular-nums;}.md-dbtn.on{box-shadow:inset 0 3px 0 #F2A900;}.md-dbtn.on b{color:var(--ffp-text);font-weight:900;}.md-dbtn.on s{color:var(--ffp-text-muted);}.md-none{display:flex;align-items:flex-start;gap:12px;padding:16px 2px 4px;}.md-none .ms{font-size:21px;color:var(--ffp-text-dim);flex:none;}.md-none .g b{display:block;font-size:14.5px;font-weight:800;color:var(--ffp-text);}.md-none .g p{margin:5px 0 0;font-size:12.5px;font-weight:600;color:var(--ffp-text-muted);line-height:1.5;}.md-none .g a{display:inline-block;margin-top:10px;}.md-sh{display:flex;align-items:flex-end;gap:13px;margin:30px 0 12px;}.md-sh h3{font-size:12.5px;font-weight:900;letter-spacing:.16em;color:var(--ffp-blue);margin:0;}.md-sh p{font-size:12.5px;font-weight:600;color:var(--ffp-text-muted);margin:0;padding-bottom:1px;}.md-sh .ln{flex:1;height:1px;background:var(--ffp-border);margin-bottom:5px;}.md-clear{display:flex;align-items:center;gap:11px;padding:16px 2px;font-size:14px;font-weight:800;color:#1F7A5C;}.md-clear .ms{font-size:21px;}.md-rail{position:relative;padding-left:100px;}.md-rail:before{content:"";position:absolute;left:88px;top:6px;bottom:6px;width:2px;background:linear-gradient(180deg,#F2A900,#E4EBF1);}.md-jb{position:relative;display:flex;align-items:center;gap:22px;padding:12px 0 13px;border-bottom:1px solid var(--ffp-border);}.md-jb:last-child{border-bottom:0;}.md-jb .tm{position:absolute;left:-100px;top:13px;width:80px;text-align:right;}.md-jb .tm u{text-decoration:none;display:block;font-size:14.5px;font-weight:900;font-variant-numeric:tabular-nums;color:var(--ffp-text);}.md-jb .tm s{text-decoration:none;display:block;font-size:9.5px;font-weight:800;letter-spacing:.1em;color:var(--ffp-text-muted);margin-top:3px;}.md-jb .dot{position:absolute;left:-18px;top:18px;width:13px;height:13px;border-radius:50%;background:#fff;box-shadow:0 0 0 3px #9aa8b4;}.md-jb.k-clash .dot,.md-jb.k-finish .dot{box-shadow:0 0 0 3px #B87A00;}.md-jb.k-result .dot{box-shadow:0 0 0 3px #F2A900;}.md-jb.k-official .dot,.md-jb.k-sheet .dot,.md-jb.k-entrants .dot{box-shadow:0 0 0 3px #7FB2D9;}.md-jb .mid{flex:1;min-width:0;max-width:620px;}.md-jb .mid .where{display:inline-block;font-size:10px;font-weight:900;letter-spacing:.12em;color:#B87A00;margin-bottom:5px;}.md-jb .mid b{display:block;font-size:15px;font-weight:800;line-height:1.3;color:var(--ffp-text);overflow-wrap:anywhere;}.md-jb .mid p{margin:4px 0 0;font-size:12.5px;font-weight:600;color:var(--ffp-text-muted);line-height:1.45;overflow-wrap:anywhere;}.md-jb .acts{flex:none;margin-left:auto;display:flex;gap:8px;}.md-board{background:#fff;border-radius:3px 3px 12px 12px;overflow:hidden;position:relative;box-shadow:0 1px 0 var(--ffp-border),0 8px 22px rgba(14,40,66,.06);}.md-board:before{content:"";position:absolute;left:0;right:0;top:0;height:4px;background:linear-gradient(90deg,var(--ffp-blue),#7FB2D9);}.md-bh,.md-row{display:grid;grid-template-columns:134px 292px 1fr 196px;align-items:center;}.md-bh{padding:14px 20px 11px;border-bottom:1px solid var(--ffp-border);margin-top:4px;}.md-bh span{font-size:9.5px;font-weight:900;letter-spacing:.13em;color:var(--ffp-text-muted);}.md-row{padding:14px 20px;border-bottom:1px solid var(--ffp-border);position:relative;}.md-row:last-child{border-bottom:0;}.md-row:before{content:"";position:absolute;left:0;top:0;bottom:0;width:4px;background:#C3D3E0;}.md-row.e-live:before{background:#F2A900;}.md-row.e-late:before{background:#FFD46B;}.md-row.e-live{background:linear-gradient(90deg,rgba(242,169,0,.10),rgba(242,169,0,0) 62%);}.md-row .c b{display:block;font-size:15.5px;font-weight:900;color:var(--ffp-text);}.md-row .c s{text-decoration:none;display:block;font-size:9.5px;font-weight:700;letter-spacing:.11em;color:var(--ffp-text-muted);margin-top:4px;}.md-row .on u,.md-row .nx u,.md-row .rf u{text-decoration:none;display:block;font-size:13.5px;font-weight:800;line-height:1.25;color:var(--ffp-text);overflow-wrap:anywhere;}.md-row .on u.free,.md-row .nx u.free{color:var(--ffp-text-muted);font-weight:700;}.md-row .rf u.none{color:#B87A00;}.md-row .on s,.md-row .nx s,.md-row .rf s{text-decoration:none;display:block;font-size:11px;font-weight:700;color:var(--ffp-text-muted);margin-top:4px;line-height:1.35;}.md-row .nx s.bad{color:#B87A00;}.md-divs{display:grid;grid-template-columns:repeat(auto-fit,minmax(272px,1fr));background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 0 var(--ffp-border),0 8px 22px rgba(14,40,66,.06);}.md-dv{padding:17px 20px 19px;background:#fff;box-shadow:inset -1px -1px 0 var(--ffp-border);}.md-dv .r1{display:flex;align-items:baseline;gap:9px;}.md-dv .r1 i{width:10px;height:10px;border-radius:2px;display:block;flex:none;background:var(--dc,var(--ffp-blue));align-self:center;}.md-dv .r1 b{font-size:15px;font-weight:900;color:var(--ffp-text);}.md-dv .r1 span{margin-left:auto;font-size:10px;font-weight:900;letter-spacing:.11em;}.md-dv .r1 span.ok{color:#1F7A5C;}.md-dv .r1 span.no{color:#B87A00;}.md-dv .mt{display:flex;gap:24px;margin-top:13px;}.md-dv .mt u{text-decoration:none;display:block;font-size:24px;font-weight:900;line-height:1;letter-spacing:-.03em;font-variant-numeric:tabular-nums;color:var(--ffp-text);}.md-dv .mt u.bad{color:#B87A00;}.md-dv .mt s{text-decoration:none;display:block;font-size:9.5px;font-weight:800;letter-spacing:.12em;color:var(--ffp-text-muted);margin-top:6px;}.md-dv .pips{display:flex;flex-wrap:wrap;gap:3px;margin-top:16px;}.md-dv .pips i{width:10px;height:14px;border-radius:2px;display:block;background:repeating-linear-gradient(135deg,#E6ECF2 0 4px,#F2F6F9 4px 8px);}.md-dv .pips i.todo{background:#E6ECF2;}.md-dv .pips i.won{background:linear-gradient(180deg,#2E9B77,#1F7A5C);}.md-dv .nt{font-size:12px;font-weight:700;color:var(--ffp-text-muted);margin-top:11px;line-height:1.45;}.md-dv .nt.bad{color:#B87A00;font-weight:800;}.md-sim{margin:28px 0 40px;padding:16px 2px 0;border-top:1px solid var(--ffp-border);display:flex;align-items:flex-start;gap:14px;flex-wrap:wrap;}.md-sim>.ms{font-size:21px;color:#B87A00;flex:none;margin-top:1px;}.md-sim .g{flex:1;min-width:260px;}.md-sim .g b{display:block;font-size:14px;font-weight:900;color:var(--ffp-text);}.md-sim .g p{margin:4px 0 0;font-size:12.5px;font-weight:600;color:var(--ffp-text-muted);line-height:1.5;}.md-sim .acts{display:flex;gap:9px;flex:none;}',
      '.tg-unit{font-size:12px;color:var(--ffp-text-muted);}.sc-day{font-size:16px;font-weight:900;color:var(--ffp-text);margin:26px 0 2px;}.sc-day:first-child{margin-top:8px;}.sc-ch{display:flex;align-items:center;gap:11px;padding:10px 14px;border-radius:9px;margin:12px 0 0;background:linear-gradient(92deg,#12242f,#21404f);box-shadow:0 2px 8px rgba(14,37,49,.18);}.sc-ch b{font-size:13.5px;font-weight:900;color:#fff;letter-spacing:.01em;}.sc-ch .mn{font-size:10px;font-weight:900;letter-spacing:.07em;text-transform:uppercase;color:#f0b736;}.sc-mkm{border:0;background:none;padding:0;font:inherit;font-size:11.5px;font-weight:700;color:#7ec9e8;cursor:pointer;}.sc-mkm:hover{color:#fff;}.sc-ch .ct{margin-left:auto;font-size:11.5px;font-weight:700;color:rgba(255,255,255,.58);}.sc-add{display:inline-flex;align-items:center;gap:5px;border:1px solid rgba(255,255,255,.26);background:rgba(255,255,255,.12);border-radius:8px;padding:5px 10px;font:inherit;font-size:12px;font-weight:800;color:#fff;cursor:pointer;}.sc-add:hover{background:rgba(255,255,255,.2);}.sc-add .ms{font-size:16px;}.sc-day .tz{margin-left:9px;font-size:11px;font-weight:700;color:#9aa8b4;}.sc-m{display:flex;align-items:center;gap:10px;padding:9px 2px;border-bottom:1px solid var(--ffp-border);}.sc-m.open{border-bottom:0;}.sc-m .t{width:136px;flex:none;min-width:0;box-sizing:border-box;padding:7px 8px;font-size:13px;}.sc-m .tm{display:flex;align-items:center;justify-content:center;height:36px;padding:0;border-radius:10px;background:#eaf0f5;border:none;color:var(--ffp-text);font-size:13.5px;font-weight:800;font-variant-numeric:tabular-nums;}.sc-m .tm.none{color:var(--ffp-text-dim);font-weight:700;font-size:12px;}.sc-plan{display:flex;align-items:center;flex-wrap:wrap;gap:7px;font-size:13px;font-weight:700;color:var(--ffp-text-muted);padding:2px 2px 6px;}.sc-plan .lg-in{width:64px;flex:none;min-width:0;box-sizing:border-box;padding:7px 8px;font-size:13px;}.sc-plan .lg-in.w{width:136px;}.sc-m .g{flex:1;min-width:0;}.sc-m .g b{display:block;font-size:13.5px;font-weight:800;color:var(--ffp-text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}.sc-m .g span{display:block;font-size:11.5px;font-weight:600;color:var(--ffp-text-muted);margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}.sc-m .c{width:170px;flex:none;min-width:0;box-sizing:border-box;padding:7px 8px;font-size:13px;}.sc-ic{flex:none;border:0;background:none;padding:4px;cursor:pointer;color:#8a99a8;line-height:0;border-radius:6px;}.sc-ic:hover{background:#eef2f5;color:var(--ffp-text);}.sc-ic:disabled{opacity:.28;cursor:default;background:none;}.sc-ic .ms{font-size:19px;}.sc-more{display:flex;align-items:center;gap:9px;flex-wrap:wrap;padding:4px 2px 14px 146px;border-bottom:1px solid var(--ffp-border);}.sc-more .lg-in,.sc-more .lg-sel{padding:7px 9px;font-size:13px;width:auto;min-width:0;flex:none;height:36px;box-sizing:border-box;}.sc-more .st-d{width:158px;}.sc-more .st-f{width:196px;}.sc-more .a-role{width:168px;}.sc-more .a-off{width:186px;}#lg-root .sc-more .st-off{width:178px;flex:none;}.sc-more .sp{flex:1;}',
      /* the venue the court belongs to, on the court bar rather than repeated
         down every row underneath it */
      '.sc-ch .vn{font-size:11.5px;font-weight:700;color:rgba(255,255,255,.62);}',
      '.sc-m .g span.off{color:var(--ffp-text-dim);}',
      /* a match with no court yet has no bar above it to say where it is, so it
         carries the venue over the surface itself */
      '.sc-m .v{width:178px;flex:none;min-width:0;text-align:right;}',
      '.sc-m .v b{display:block;font-size:12.5px;font-weight:800;color:var(--ffp-text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      '.sc-m .v span{display:block;font-size:11.5px;font-weight:600;color:var(--ffp-text-muted);margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      '.sc-m .v.none b{color:var(--ffp-text-dim);font-weight:700;}',
      /* the main field, chosen on the Venues tab */
      '.lg-mainb{display:inline-flex;align-items:center;gap:5px;border:1px solid var(--ffp-border-mid);background:#fff;color:var(--ffp-text-muted);border-radius:9px;padding:5px 10px;font:inherit;font-size:11.5px;font-weight:800;cursor:pointer;margin-right:10px;}',
      '.lg-mainb .ms{font-size:15px;}',
      '.lg-mainb.on{border-color:var(--ffp-gold);background:#fdf6e6;color:#8a6200;}',
      '.tg-sec{padding:2px 0 22px;}.tg-sec+.tg-sec{border-top:none;padding-top:22px;}.tg-sech{display:inline-block;font-size:11px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;color:#fff;background:linear-gradient(92deg,#12242f,#21404f);padding:7px 13px;border-radius:7px;margin:0 0 16px;}.tg-hint{font-size:12px;font-weight:700;color:#6a7c8a;margin-top:7px;}.tg-dvrow{display:flex;align-items:center;gap:12px;padding:13px 2px;border-top:1px solid var(--ffp-border);cursor:pointer;}.tg-dvrow:last-of-type{border-bottom:1px solid var(--ffp-border);}.tg-dvrow .g{flex:1;min-width:0;}.tg-dvrow .g b{display:block;font-size:14px;font-weight:800;color:var(--ffp-text);}.tg-dvrow .g span{display:block;font-size:12px;font-weight:600;color:var(--ffp-text-muted);margin-top:2px;}.tg-dvrow .st{font-size:11px;font-weight:800;color:#8a99a8;white-space:nowrap;}.tg-dvrow .st.done{color:var(--ffp-green);}.tg-dvrow.on{box-shadow:inset 3px 0 0 var(--ffp-blue);padding-left:12px;}.tg-dvrow.on .g b{color:var(--ffp-blue);}.tg-fmts{margin-top:18px;}.tg-dvrow .cv{font-size:20px;color:#9aa8b4;}.tg-dvrow.on .cv{color:var(--ffp-blue);}.tg-dvedit{padding:4px 0 22px 32px;border-bottom:1px solid var(--ffp-border);}.tg-dvedit .tg-fmts{margin-top:4px;}.tg-fmtnow{display:inline-flex;align-items:center;gap:10px;font-size:13px;font-weight:800;color:var(--ffp-text);}.tg-fmtnow a{font-size:12px;font-weight:700;color:var(--ffp-blue);cursor:pointer;}.tg-shape{font-size:12.5px;font-weight:700;color:#6a7c8a;margin:14px 0 0;}.tg-acts{display:flex;gap:10px;margin-top:16px;flex-wrap:wrap;}',
      /* ── CONNECT A SCORING TABLET ─────────────────────────────────── */
      '.tg-conn{border-top:2px solid #1980AD;margin:10px 0 4px;padding:16px 4px 6px;display:flex;gap:26px;align-items:flex-start;flex-wrap:wrap;}',
      '.tg-conn .qr{width:132px;height:132px;flex:0 0 auto;border-radius:12px;background:#fff;box-shadow:0 3px 12px rgba(15,34,48,.12);display:grid;place-items:center;padding:8px;box-sizing:border-box;line-height:0;}',
      '.tg-conn .qr img,.tg-conn .qr canvas{width:100%!important;height:100%!important;}',
      '.tg-conn .g{flex:1 1 300px;min-width:0;}',
      '.tg-conn .lb{font-size:11px;font-weight:900;letter-spacing:.09em;text-transform:uppercase;color:#13657f;}',
      '.tg-conn .code{font-size:42px;font-weight:900;letter-spacing:.16em;color:#12232f;margin:8px 0 2px;font-variant-numeric:tabular-nums;}',
      '.tg-conn .exp{font-size:12.5px;font-weight:700;color:#5b6b75;}',
      '.tg-conn .how{font-size:13px;font-weight:700;color:#43525c;margin-top:12px;line-height:1.5;max-width:460px;} .tg-conn .how b{font-weight:900;color:#12232f;}',
      '.tg-conn .acts{display:flex;gap:8px;margin-top:14px;flex-wrap:wrap;}',
      '.lg-btn.sm{padding:7px 11px;font-size:12.5px;} .lg-btn.sm .ms{font-size:16px;}',
      /* ── CONTRAST REPAIRS ── */
      '.tg-m .s.tbd b{color:#5c6f7c;}',
      '.tg-m .s.win b{color:#0a7d52;}',
      '.tg-rnd .rh{color:#5c6f7c;}',
      '.tg-kind{color:#8a5508;}',
      '.tg-band{display:flex;align-items:center;gap:8px;margin:16px 0 8px;}',
      '.tg-band b{font-size:10.5px;font-weight:900;letter-spacing:.09em;text-transform:uppercase;color:#43525c;white-space:nowrap;}',
      '.tg-band i{flex:1;height:2px;border-radius:2px;background:#e3e9ee;}',
      '.tg-band.top b{color:#8a6200;} .tg-band.top i{background:linear-gradient(90deg,#f2a900,rgba(242,169,0,.12));}',
      '.tg-band.fin b{color:#12232f;font-size:12px;letter-spacing:.12em;}',
      '.tg-band.fin i{background:linear-gradient(90deg,#f2a900,rgba(242,169,0,.12));height:3px;}',
      '.tg-pend{border:1.5px solid #e6d3a6;border-radius:12px;background:#fffdf6;padding:12px 14px;margin-bottom:16px;}',
      '.tg-pend .hd{font-size:11px;font-weight:900;letter-spacing:.09em;text-transform:uppercase;color:#8a5a00;margin-bottom:8px;}',
      '.tg-pend .row{display:flex;align-items:center;gap:10px;padding:8px 0;border-top:1px solid #f0e6cc;flex-wrap:wrap;}',
      '.tg-pend .row:first-of-type{border-top:none;}',
      '.tg-pend .row b{font-size:14px;font-weight:800;color:#12232f;}',
      '.tg-pend .row .sub{font-size:12px;font-weight:700;color:#6a7c8a;}',
      '.tg-pend .row .sp{flex:1;}',
      '.tg-paid{display:inline-flex;align-items:center;gap:5px;flex:none;border:none;background:#eaf0f5;color:#51657a;border-radius:9px;padding:4px 9px;font:inherit;font-size:11.5px;font-weight:800;cursor:pointer;}',
      '.tg-paid .ms{font-size:16px;}',
      '.tg-paid.on{border-color:#a8d5bd;background:#eef9f3;color:#0a7d52;}',
      '/* ── ALL DIVISIONS ON ONE SCHEDULE ──────────────────────────────── */',
      '/* A court takes whatever fits, so one row\'s division is not the next',
      '   one\'s. Each row carries its division colour on its leading edge and',
      '   a key says which is which. */',
      '.sc-key{display:flex;flex-wrap:wrap;gap:8px 18px;align-items:center;margin:14px 0 2px;}',
      '.sc-key .k{display:flex;align-items:center;gap:7px;font-size:11.5px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#43525c;}',
      '.sc-key .k i{width:13px;height:13px;border-radius:4px;background:var(--dc);flex:none;}',
      '.sc-m{border-left:5px solid var(--dc);padding-left:11px;background:linear-gradient(90deg,var(--db),rgba(255,255,255,0) 42%);}',
      '.sc-m .g span{color:var(--dcd);font-weight:700;}',
      '.tg-d0{--dc:#c98f00;--db:rgba(242,169,0,.12);--dcd:#8a6200;}',
      '.tg-d1{--dc:#1980AD;--db:rgba(25,128,173,.10);--dcd:#14607f;}',
      '.tg-d2{--dc:#7a4fc2;--db:rgba(122,79,194,.10);--dcd:#5b3a93;}',
      '.tg-d3{--dc:#1f9d57;--db:rgba(31,157,87,.10);--dcd:#17743f;}',
      '.tg-d4{--dc:#0f8b8d;--db:rgba(15,139,141,.10);--dcd:#0a6a6c;}',
      '.tg-d5{--dc:#c0392b;--db:rgba(192,57,43,.10);--dcd:#a32b1f;}',
      '.tg-d6{--dc:#3f51b5;--db:rgba(63,81,181,.10);--dcd:#333f96;}',
      '.tg-d7{--dc:#8d6e35;--db:rgba(141,110,53,.10);--dcd:#6b5327;}',
      '.tg-d8{--dc:#b5399b;--db:rgba(181,57,155,.10);--dcd:#8e2a79;}',
      '.tg-d9{--dc:#4a6572;--db:rgba(74,101,114,.10);--dcd:#3a515b;}',
      '.sc-day .tz{font-size:12.5px;font-weight:700;color:#5c6f7c;}',
      '.lg-btn.ghost.sc-rb .ms{color:var(--ffp-gold);}',
      '.sc-plan+.sc-plan{padding-top:0;}',
      '.sc-plan .mlen{font-weight:900;color:var(--ffp-text);}',
      '.sc-mlenb{border:0;background:none;padding:0 0 0 7px;font:inherit;font-size:12px;font-weight:800;color:var(--ffp-blue);cursor:pointer;}',
      '.sc-mlenb:hover{text-decoration:underline;}',
      '.sc-why{font-size:11.5px;font-weight:600;color:var(--ffp-text-muted);padding:6px 2px 0;}',
      '/* Breaks: a court shut for part of a day. Saved, not typed, so a later',
      '   Rebuild steps over the same ones. */',
      '.sc-brk{display:flex;align-items:center;flex-wrap:wrap;gap:8px 10px;padding:4px 2px 14px;border-bottom:1px solid var(--ffp-border);margin-bottom:4px;}',
      '.sc-brk .lb{flex:1 0 100%;font-size:11px;font-weight:900;letter-spacing:.05em;text-transform:uppercase;color:#5c6f7c;margin-bottom:1px;}',
      '.sc-brk .b{display:inline-flex;align-items:center;gap:6px;background:#eef3f7;border:none;border-radius:10px;padding:5px 6px 5px 8px;}',
      '.sc-brk .b em{font-style:normal;font-size:12.5px;font-weight:700;color:#5c6f7c;}',
      '.sc-brk .b .lg-sel{width:auto;min-width:118px;padding:6px 26px 6px 9px;font-size:12.5px;}',
      '.sc-brk .b .lg-sel.dy{min-width:124px;}',
      '.sc-brk .b .lg-in{padding:6px 8px;font-size:12.5px;}',
      '.sc-brk .b .lg-in.w{width:112px;}',
      '.sc-brk .b .lg-in.nm{width:140px;}',
      '.sc-brk .b .sc-ic{color:#8a99a8;}',
      '.sc-brk .sc-abk{padding:7px 12px;font-size:12.5px;}',
      /* Playing times, day by day. Same furniture as the breaks above it: a
         filled chip per day, solid fields, no hairline outlines. */
      '.sc-day .b .dd{font-style:normal;font-size:12.5px;font-weight:900;color:#12232f;min-width:86px;}',
      '.sc-day .b.off{opacity:.62;}',
      '.sc-day .b.off .lg-in{color:#8a99a8;}',
      '.sc-day .dw-t{border:none;border-radius:8px;background:linear-gradient(180deg,#ffd15a,#f2a900);color:#3a2600;font:inherit;font-size:11.5px;font-weight:900;letter-spacing:.06em;text-transform:uppercase;padding:6px 11px;cursor:pointer;}',
      '.sc-day .dw-t.off{background:#dbe7ef;color:#55707f;}',
      '.sc-daynote{flex:1 0 100%;font-size:12px;font-weight:600;color:#8a99a8;margin-top:2px;}',
      /* Save. Gold while there is something to save, stood down when there is
         not, so the tab always says plainly whether the work is in. */
      '.sc-save{border:none;background:#e3ebf1;color:#7c8b97;}',
      '.sc-save.on{background:var(--ffp-gold,#FFC847);color:#3a2600;}',
      '.sc-save[disabled]{cursor:default;}',
      /* Who plays, on the row and in the sheet. Solid fills throughout: gold
         where a choice is on, light blue where it is not. */
      '.sc-day .dw-w{border:none;border-radius:8px;background:#e8eef3;color:#55707f;font:inherit;font-size:11.5px;font-weight:800;padding:6px 11px;cursor:pointer;max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '.sc-day .dw-w.set{background:#123a52;color:#fff;}',
      '.lg-who{max-width:620px;text-align:left;align-items:stretch;}',
      '.lg-who .lg-cfm-t,.lg-who .lg-cfm-b{text-align:center;}',
      '.dw-lab{font-size:11px;font-weight:900;letter-spacing:.05em;text-transform:uppercase;color:#5c6f7c;margin:22px 0 9px;}',
      '.dw-row{display:flex;flex-wrap:wrap;gap:9px;}',
      '.dw-c{border:none;border-radius:10px;background:#e8eef3;color:#2c3f4c;font:inherit;font-size:13px;font-weight:800;padding:10px 15px;cursor:pointer;}',
      '.sc-ic.pin.on{color:#b07d08;}',
      '.sc-ic.pin.on .ms{font-variation-settings:"FILL" 1;}',
      '.sc-m .tm.pin{background:linear-gradient(180deg,#ffd15a,#f2a900);color:#3a2600;}',
      '.tg-oop .lg-vh .g b{display:block;}',
      '.tg-oop .lg-vh .g span.addr{display:block;margin-top:3px;font-size:15px;font-weight:800;'
        + 'color:var(--ffp-blue);letter-spacing:.01em;}',
      '.tg-oop .lg-btn,.tg-oop .lg-scrbtn{margin-left:auto;flex:none;margin-right:0;}',
      '.tg-oop .lg-scrbtn{font-size:15px;letter-spacing:.12em;padding:8px 14px;}',
      '.tg-oopdays{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin-top:10px;}',
      /* Scoped to .md-g, which is what the table is actually called. Scoped
         to .md-grid it never matched, and the number fell back to a big
         italic em that took a line of its own above the division. */
      '.md-g .mno{display:inline-block;font-style:normal;font-weight:900;font-size:9px;'
        + 'line-height:1.35;color:#56606b;background:#eef2f5;border-radius:4px;'
        + 'padding:0 4px;margin-right:4px;vertical-align:1px;letter-spacing:.02em;'
        + 'font-variant-numeric:tabular-nums;}',
      /* the division sits beside it rather than under it, so the number
         costs the cell no height at all */
      '.md-g .mno + .tag{display:inline-block;}',
      '.sc-m .g b .mno{display:inline-block;font-style:normal;font-weight:900;font-size:11px;'
        + 'color:#56606b;background:#eef2f5;border-radius:5px;padding:1px 6px;margin-right:7px;'
        + 'vertical-align:1px;font-variant-numeric:tabular-nums;}',
      '.lg-scrurl .seg{font-style:normal;white-space:nowrap;}',
      '.tg-mail{background:#fff;border-radius:14px;padding:18px 20px 16px;margin:0 0 18px;box-shadow:0 1px 0 var(--ffp-border),0 6px 18px rgba(14,40,66,.06);}',
      '.tg-mail .hd{display:flex;align-items:center;gap:9px;margin-bottom:14px;}',
      '.tg-mail .hd>.ms{font-size:20px;color:var(--ffp-blue);}',
      '.tg-mail .hd b{font-size:15px;font-weight:900;color:var(--ffp-text);}',
      '.tg-mail .nums{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px;}',
      '.tg-mail .nums span{flex:1 1 130px;background:#eef3f7;border-radius:11px;padding:12px 14px;}',
      '.tg-mail .nums span.bad{background:#fff4e0;}',
      '.tg-mail .nums u{text-decoration:none;display:block;font-size:24px;font-weight:900;line-height:1;color:var(--ffp-text);font-variant-numeric:tabular-nums;}',
      '.tg-mail .nums span.bad u{color:#b07d08;}',
      '.tg-mail .nums s{text-decoration:none;display:block;margin-top:6px;font-size:9.5px;font-weight:900;letter-spacing:.12em;color:var(--ffp-text-muted);}',
      '.tg-mail .note{display:flex;align-items:flex-start;gap:8px;font-size:12.5px;font-weight:600;color:#6b5a38;line-height:1.5;margin-bottom:14px;}',
      '.tg-mail .note .ms{font-size:17px;color:#b07d08;flex:none;}',
      '.tg-mail .tg-chg{border-top:1px solid var(--ffp-border);border-bottom:1px solid var(--ffp-border);'
        + 'padding:14px 0;margin:0 0 15px;}',
      '.tg-mail .tg-chg .g{display:flex;align-items:flex-start;gap:10px;}',
      '.tg-mail .tg-chg .g>.ms{font-size:20px;color:#b07d08;flex:none;margin-top:1px;}',
      '.tg-mail .tg-chg b{display:block;font-size:14px;font-weight:900;color:var(--ffp-text);line-height:1.35;}',
      '.tg-mail .tg-chg span{display:block;margin-top:4px;font-size:12.5px;font-weight:600;'
        + 'color:var(--ffp-text-muted);line-height:1.5;}',
      '.tg-mail .tg-chg .a{display:flex;gap:9px;flex-wrap:wrap;margin:13px 0 0 30px;}',
      '@media (max-width:560px){.tg-mail .tg-chg .a{margin-left:0;}'
        + '.tg-mail .tg-chg .a .lg-btn{flex:1 1 100%;justify-content:center;}}',
      '.tg-mail .acts{display:flex;gap:9px;flex-wrap:wrap;align-items:center;}',
      '.tg-mail .acts .sp{flex:1;}',
      '#tg-root .tg-mailta{width:100%;min-width:0;height:auto;padding:12px 14px;font-size:14px;line-height:1.6;resize:vertical;margin-top:18px;}',
      '.tg-mailprev{margin:auto;width:100%;max-width:680px;height:100%;display:flex;flex-direction:column;padding:18px 16px;}',
      '.tg-mailprev .bar{display:flex;align-items:center;gap:10px;padding-bottom:12px;}',
      '.tg-mailprev .bar b{font-size:15px;font-weight:900;color:var(--ffp-text);}',
      '.tg-mailprev .bar .sp{flex:1;}',
      '.tg-mailprev iframe{flex:1;width:100%;border:0;border-radius:14px;background:#eef2f6;}',
      '.tg-dvhd .st.stale{background:#fff1d6;color:#8a5a00;}',
      '.tg-stale{display:flex;align-items:center;gap:12px;padding:13px 16px;background:#fff8ea;border-top:2px solid #f2a900;}',
      '.tg-stale>.ms{font-size:21px;color:#b07d08;flex:none;}',
      '.tg-stale .g{flex:1;min-width:0;}',
      '.tg-stale .g b{display:block;font-size:13.5px;font-weight:900;color:#12232f;}',
      '.tg-stale .g span{display:block;margin-top:3px;font-size:12.5px;font-weight:600;color:#6b5a38;line-height:1.45;}',
      '.tg-stale .lg-btn{flex:none;}',
      '.dw-note{font-size:12px;font-weight:600;color:#7c8b97;line-height:1.5;margin-top:18px;max-width:430px;text-align:center;}',
      '.dw-c.on{background:linear-gradient(180deg,#ffd15a,#f2a900);color:#3a2600;}',
      '/* A break shown where it falls, so the gap in the day is not a mystery. */',
      '.sc-bar{display:flex;align-items:center;gap:9px;padding:9px 11px;margin:2px 0;border-radius:8px;background:repeating-linear-gradient(135deg,#f1f5f8,#f1f5f8 9px,#e7edf2 9px,#e7edf2 18px);border:1px dashed #c8d4dd;}',
      '.sc-bar .ms{color:#5c6f7c;font-size:17px;}',
      /* A break with matches still booked inside it. Gold, because it is the
         organiser's to act on - not red, nothing is broken yet. */
      '.sc-bar.clash{border-style:solid;border-color:var(--ffp-gold);background:repeating-linear-gradient(135deg,#fff9ec,#fff9ec 9px,#fdf1d6 9px,#fdf1d6 18px);}',
      '.sc-bar.clash .ms{color:#9a6b00;} .sc-bar.clash b{color:#7a5400;} .sc-bar.clash span{color:#8a6410;}',
      '.sc-bar .fix{margin-left:auto;flex:none;border:0;background:var(--ffp-gold);color:#12232f;border-radius:8px;padding:5px 11px;font:inherit;font-size:12px;font-weight:800;cursor:pointer;}',
      '.sc-bar .fix:hover{background:#e0af3a;}',
      '.sc-m .g span.clash{color:#9a6b00;font-weight:800;}',
      '.sc-brkwarn{display:flex;align-items:center;gap:9px;padding:10px 13px;margin:10px 0 0;border-radius:9px;background:linear-gradient(92deg,#12242f,#21404f);box-shadow:inset 4px 0 0 var(--ffp-gold),0 2px 8px rgba(14,37,49,.18);}',
      '.sc-brkwarn .ms{flex:none;color:var(--ffp-gold);font-size:18px;}',
      '.sc-brkwarn b{font-size:13px;font-weight:900;color:#fff;}',
      '.sc-brkwarn i{font-style:normal;font-size:12px;font-weight:700;color:rgba(255,255,255,.62);}',
      '.sc-brkwarn .sp{flex:1;}',
      '.sc-brkwarn button{flex:none;border:0;background:var(--ffp-gold);color:#12232f;border-radius:8px;padding:6px 12px;font:inherit;font-size:12px;font-weight:800;cursor:pointer;}',
      '.sc-brkwarn button:hover{background:#e0af3a;}',
      '.sc-bar b{font-size:12.5px;font-weight:900;color:#3c4d59;}',
      '.sc-bar span{font-size:12px;font-weight:700;color:#475763;}',
      '/* Nothing should sit here: Auto-plan places every match, decided or not. */',
      '.sc-ch.warn{box-shadow:inset 4px 0 0 var(--ffp-gold),0 2px 8px rgba(14,37,49,.18);}',
      /* Where an event ends. Plain rows on the canvas, not a boxed "danger
         zone": the weight comes from the wording and from red being reserved
         for the one action that cannot be undone. */
      '.lg-end{border-top:1px solid var(--ffp-border);margin-top:34px;padding-top:18px;}',
      '.lg-end .hd{font-size:11px;font-weight:900;letter-spacing:.07em;text-transform:uppercase;color:#8a99a8;margin-bottom:6px;}',
      '.lg-end .row{display:flex;align-items:flex-start;gap:16px;padding:13px 0;border-bottom:1px solid var(--ffp-border);}',
      '.lg-end .row:last-child{border-bottom:0;}',
      '.lg-end .g{flex:1;min-width:0;}',
      '.lg-end .g b{display:block;font-size:13.5px;font-weight:800;color:var(--ffp-text);}',
      '.lg-end .g span{display:block;font-size:12px;font-weight:600;color:var(--ffp-text-muted);margin-top:3px;line-height:1.55;}',
      '.lg-end .lg-btn{flex:none;margin-top:1px;}',
      '.lg-end .lg-btn:disabled{opacity:.38;cursor:default;}',
      '.lg-cover .bd.archived,.lg-cover .bd.cancelled{color:#8a99a8;}',
      '.lg-pill.archived{background:#eef2f5;color:#8a99a8;}',
      '.lg-pill.cancelled{background:#fdeaea;color:#d6353b;}',
      '.lg-archrow{margin-top:20px;}',
      '.sc-ch.warn .sc-add{background:var(--ffp-gold);border-color:var(--ffp-gold);color:#12232f;}',
      '.sc-ch.warn .sc-add:hover{background:#e0af3a;}',
      '.lg-surf .lg-vcnote{font-size:12px;font-weight:700;color:#7c8b97;margin-left:8px;}',
      '/* Open an empty draw: the format decides the shape, not the entry list. */',
      '.tg-opendraw{display:flex;align-items:center;flex-wrap:wrap;gap:10px;margin-top:14px;padding-top:14px;border-top:1px solid var(--ffp-border);}'
      /* which FFP account a player is. A sentence, so it sits on its own
         line rather than squeezed in beside Seed and Status. */
      + '.tg-acctf{flex:1 1 100% !important;}'
      + '.tg-acct{display:flex;align-items:center;gap:11px;background:#eaf0f5;border-radius:11px;padding:10px 12px;}'
      + '.tg-acct>.ms{font-size:21px;color:var(--ffp-text-dim) !important;flex:none;}'
      + '.tg-acct.on>.ms{color:var(--ffp-green) !important;}'
      + '.tg-acct .g{flex:1;min-width:0;}'
      + '.tg-acct .g b{display:block;font-size:13.5px;font-weight:800;color:var(--ffp-text);}'
      + '.tg-acct .g span{display:block;margin-top:1px;font-size:12px;font-weight:600;'
        + 'color:var(--ffp-text-muted);line-height:1.45;}'
      + '.tg-acct .lg-btn.sm{flex:none;padding:7px 12px;font-size:12px;}'
      + '.tg-find{width:100%;margin-top:22px;}'
      + '.tg-find .hd{font-size:11px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;'
        + 'color:var(--ffp-text-dim);margin-bottom:8px;}'
      + '.tg-find .hd.sp{margin-top:24px;}'
      + '.tg-find .r{display:flex;align-items:center;gap:12px;padding:12px 0;flex-wrap:wrap;'
        + 'border-top:1px solid var(--ffp-border-mid);}'
      + '.tg-find .r:last-of-type{border-bottom:1px solid var(--ffp-border-mid);}'
      + '.tg-find .r .g{flex:1 1 220px;min-width:0;}'
      + '.tg-find .r .g b{display:block;font-size:14.5px;font-weight:800;color:var(--ffp-text);}'
      + '.tg-find .r .g span{display:block;margin-top:2px;font-size:12.5px;font-weight:600;color:var(--ffp-text-muted);}'
      + '.tg-find .r .g span i{font-style:normal;display:block;margin-top:1px;color:var(--ffp-text-dim);font-size:12px;}'
      + '.tg-find .r .same{display:flex;align-items:center;gap:3px;font-style:normal;font-size:11.5px;'
        + 'font-weight:800;color:var(--ffp-green);flex:none;}'
      + '.tg-find .r .same .ms{font-size:15px;color:var(--ffp-green) !important;}'
      + '.tg-find .r .taken{font-style:normal;font-size:11.5px;font-weight:800;color:var(--ffp-warn);flex:none;}'
      + '.tg-find .r .lg-btn.sm{flex:none;padding:8px 16px;font-size:13px;}'
      + '.tg-find .row{display:flex;gap:10px;align-items:center;}'
      + '.tg-find .row .lg-in{flex:1 1 auto;min-width:0;box-sizing:border-box;}'
      + '.tg-find .row .lg-btn{flex:none;}'
      + '.tg-find .note{display:flex;gap:8px;align-items:flex-start;margin-top:12px;font-size:12px;'
        + 'font-weight:700;color:var(--ffp-text-dim);line-height:1.5;}'
      + '.tg-find .note .ms{font-size:16px;color:var(--ffp-text-dim) !important;flex:none;margin-top:1px;}'
      + '.tg-find .none{font-size:13px;font-weight:700;color:var(--ffp-text-dim);padding:10px 0;}'
      + '@media (max-width:560px){.tg-find .r .lg-btn.sm{flex:1 1 100%;justify-content:center;}'
        + '.tg-acct{flex-wrap:wrap;}'
        + '.tg-acct .g{flex:1 1 calc(100% - 32px);}'
        + '.tg-acct .lg-btn.sm{flex:1 1 100%;justify-content:center;margin-top:4px;}}'
      /* the organiser's own words for the draws: a label saying what each
         draw IS, then the field, so nobody has to know which one "Shield"
         was. The only tag is on a division that has gone its own way. */
      + '.tg-dnames{border-top:1px solid var(--ffp-border-mid);}'
      + '.tg-dnames .r{display:flex;align-items:center;gap:14px;padding:11px 0;flex-wrap:wrap;'
        + 'border-bottom:1px solid var(--ffp-border);}'
      + '.tg-dnames .r .g{flex:0 1 330px;min-width:0;}'
      + '.tg-dnames .r .g b{display:block;font-size:13.5px;font-weight:800;color:var(--ffp-text);}'
      + '.tg-dnames .r .g span{display:block;margin-top:1px;font-size:12px;font-weight:600;'
        + 'color:var(--ffp-text-muted);line-height:1.45;}'
      + '.tg-dnames .r .f{flex:0 1 260px;min-width:0;}'
      + '.tg-dnames .r .f .lg-in{width:100%;min-width:0;box-sizing:border-box;}'
      + '.tg-dnames .r .f .own{display:flex;align-items:center;gap:4px;margin-top:5px;'
        + 'font-style:normal;font-size:11.5px;font-weight:800;color:var(--ffp-gold);}'
      + '.tg-dnames .r .f .own .ms{font-size:15px;color:var(--ffp-gold) !important;}'
      + '.tg-dnscope{max-width:320px;}'
      + '@media (max-width:560px){.tg-dnames .r .g,.tg-dnames .r .f{flex:1 1 100%;}}'
      /* a division is a block with a header that stands out, not a plain row */
      + '.tg-dv{margin-bottom:16px;}'
      + '.tg-dvhd{display:flex;align-items:center;gap:13px;padding:13px 17px;border-radius:12px;cursor:pointer;background:linear-gradient(95deg,var(--ffp-blue-darker),var(--ffp-blue));color:#fff;}'
      /* collapsed is still a division: the same blue, flatter */
      + '.tg-dvhd.off{background:linear-gradient(95deg,#2a7ba0,#3f9ac2);}'
      + '.tg-dvhd .g{flex:1;min-width:0;}'
      + '.tg-dvhd .g b{display:block;font-size:15px;font-weight:900;letter-spacing:-.2px;color:#fff;}'
      + '.tg-dvhd .g span{display:block;font-size:12px;font-weight:600;color:rgba(255,255,255,.82);margin-top:3px;}'
      + '.tg-dvhd .st{font-size:11px;font-weight:900;letter-spacing:.06em;text-transform:uppercase;white-space:nowrap;color:rgba(255,255,255,.72);}'
      + '.tg-dvhd .st.done{color:#8ff0c0;}'
      + '.tg-dvhd .cv{font-size:22px;color:rgba(255,255,255,.85);}'
      + '.tg-dvhd .ed{border:none;background:none;padding:2px;cursor:pointer;color:rgba(255,255,255,.85);line-height:1;display:flex;}'
      + '.tg-dvhd .ed .ms{font-size:19px;}'
      + '.tg-dvbody{padding:4px 2px 0;}'
      /* the info affordance is a bare icon, never a tile behind it */
      + '.tg-fmt{position:relative;}'
      + '.tg-fmt .nfo{position:absolute;top:9px;right:9px;border:none;background:none;padding:2px;cursor:pointer;color:#9aa8b4;line-height:1;display:flex;}'
      + '.tg-fmt .nfo .ms{font-size:19px;}'
      + '.tg-fmt.on .nfo{color:var(--ffp-blue);}'
      /* and it opens under the WHOLE row, so no tile grows a box inside it */
      + '.tg-nfobox{grid-column:1 / -1;background:#eff7fb;border:1px solid #cfe4ef;border-left:3px solid var(--ffp-blue);border-radius:12px;padding:15px 17px;margin-top:6px;}'
      + '.tg-nfobox h4{font-size:14px;font-weight:900;color:var(--ffp-text);margin-bottom:8px;display:flex;align-items:center;gap:8px;}'
      + '.tg-nfobox h4 .ms{font-size:19px;color:var(--ffp-blue);}'
      + '.tg-nfobox p{font-size:13px;font-weight:600;color:#3f5765;line-height:1.6;max-width:760px;}'
      + '.tg-nfobox p+p{margin-top:7px;}'
      + '.tg-nfobox p b{color:var(--ffp-text);font-weight:800;}'
      + '.tg-nfobox .close{float:right;border:none;background:none;cursor:pointer;color:#7b93a3;padding:2px;display:flex;}'
      /* the same field used on its own under a field label, not across the grid */
      + '.tg-nfobox.solo{grid-column:auto;margin:8px 0 0;}'
      + '.tg-nfobox .opt{display:flex;gap:10px;align-items:flex-start;padding:7px 0;border-top:1px solid #d9e8f1;}'
      + '.tg-nfobox .opt:first-of-type{border-top:0;padding-top:2px;}'
      + '.tg-nfobox .opt b{flex:0 0 190px;font-size:12.5px;font-weight:800;color:var(--ffp-text);}'
      + '.tg-nfobox .opt span{flex:1;min-width:0;font-size:12.5px;font-weight:600;color:#3f5765;line-height:1.55;}'
      /* an info button beside a field label, a bare icon with no tile behind it */
      + '.lg-lab .nfo-i{border:none;background:none;padding:0 5px 0 0;cursor:pointer;color:#9aa8b4;line-height:1;vertical-align:-4px;}'
      + '.lg-lab .nfo-i .ms{font-size:17px;}'
      + '.lg-lab .nfo-i:hover{color:var(--ffp-blue);}'
      + '.tg-nfobox .close .ms{font-size:20px;}'
      /* the two dead ends carry the action that fixes them */
      + '.lg-empty.act{padding:30px 10px 26px;text-align:center;}'
      + '.lg-empty.act .t{font-size:15px;font-weight:900;color:var(--ffp-text);margin-bottom:6px;}'
      + '.lg-empty.act .s{font-size:13px;font-weight:600;color:var(--ffp-text-muted);max-width:430px;margin:0 auto 16px;line-height:1.55;}'
      + '.lg-empty.act .row{display:flex;align-items:center;justify-content:center;gap:10px;flex-wrap:wrap;}'
      + '.lg-empty.act .lb{font-size:11px;font-weight:900;letter-spacing:.05em;text-transform:uppercase;color:#5c6f7c;}',
      '.tg-opendraw .lb{font-size:11px;font-weight:900;letter-spacing:.05em;text-transform:uppercase;color:#5c6f7c;}',
      '.tg-opendraw .hint{flex:1 1 100%;font-size:12.5px;font-weight:600;color:#5c6f7c;}',
      '.tg-opendraw.warn{background:#fff7e6;border:1px solid #e8cf9a;border-radius:12px;padding:12px 14px;}',
      '.tg-opendraw.warn b{font-size:14px;font-weight:900;color:#12232f;}',
      '.tg-opendraw.warn span:not(.sp){font-size:12.5px;font-weight:600;color:#5c4a22;}',
      '.bp-blk .bp-r{display:flex;align-items:center;gap:9px;padding:9px 0;border-bottom:1px solid var(--ffp-border);}',
      '.bp-blk .bp-r:first-of-type{border-top:1px solid var(--ffp-border);}',
      '/* an input renders 45px and a select 43px in this shell; they have never sat on one line before */',
      '.bp-blk .bp-r .lg-in,.bp-blk .bp-r .lg-sel{height:44px;box-sizing:border-box;}',
      '.bp-blk .bp-t{width:182px;flex:none;min-width:0;}',
      '.bp-blk .bp-mid{flex:1;min-width:0;display:flex;align-items:center;gap:8px;flex-wrap:wrap;}',
      '.bp-blk .bp-k{width:148px;flex:none;min-width:0;}',
      '.bp-blk .bp-n{width:72px;flex:none;min-width:0;text-align:center;}',
      '.bp-blk .bp-pts .bp-n{width:60px;}',
      '.bp-blk .bp-w{font-size:13px;font-weight:700;color:#5c6f7c;white-space:nowrap;}',
      '.bp-blk .bp-pts{flex:none;display:flex;align-items:center;gap:7px;}',
      '.bp-blk .bp-x{flex:none;font-size:19px;color:#93a3ae;cursor:pointer;}',
      '.bp-blk .bp-add{margin-top:12px;}',
      '.bp-blk .bp-none{font-size:13px;font-weight:600;color:#5c6f7c;padding:11px 0;border-top:1px solid var(--ffp-border);border-bottom:1px solid var(--ffp-border);}',
      '.tg-opendraw .sp{flex:1;}',
      /* ── SERIES ───────────────────────────────────────────────────── */
      '.ts-rd{display:flex;align-items:center;gap:13px;padding:13px 0;border-bottom:1px solid var(--ffp-border);flex-wrap:wrap;}',
      '.ts-rd .pic{width:74px;height:50px;border-radius:9px;flex:none;background:#dbe7ef center/cover no-repeat;}',
      '.ts-rd .ic{width:74px;flex:none;display:flex;align-items:center;justify-content:center;}',
      '.ts-rd .ic .ms{font-size:26px;color:#93a3ae;}',
      '.lg-row.ts-trow .g b{display:block;font-size:14.5px;font-weight:800;color:#12232f;}',
      '.lg-row.ts-trow .g span{display:block;font-size:12px;font-weight:600;color:#5c6f7c;margin-top:2px;}',
      '.ts-rd .g{flex:1 1 220px;min-width:0;}',
      '.ts-rd .g b{display:block;font-size:14.5px;font-weight:800;color:#12232f;}',
      '.ts-rd .g span{display:block;font-size:12px;font-weight:600;color:#5c6f7c;margin-top:2px;}',
      '.ts-rd .g i.warn{font-style:normal;color:#b4610b;font-weight:800;}',
      '.ts-rd .st{flex:none;font-size:9.5px;font-weight:900;letter-spacing:.6px;color:#5c6f7c;}',
      '.ts-rd .st.live{color:#d6353b;}',
      '.ts-rd .ax{display:flex;align-items:center;gap:8px;flex-wrap:wrap;flex:1 1 100%;}',
      '.ts-num,.ts-chk{display:flex;align-items:center;gap:7px;font-size:12.5px;font-weight:700;color:#12232f;}',
      '.ts-num .lg-in{width:74px;min-width:0;flex:none;box-sizing:border-box;}',
      '.ts-chk input{width:17px;height:17px;}',
      '.ts-code{font-size:10px;font-weight:900;letter-spacing:.7px;color:#5c6f7c;margin-left:6px;}',
      '.ts-sw{display:flex;gap:4px;flex:none;}',
      '.ts-sw .sw{width:13px;height:20px;border-radius:3px;display:block;border:1px solid rgba(0,0,0,.12);}',
      '.lg-row.ts-off{opacity:.55;}',
      '.lg-row .g i.warn{font-style:normal;color:#b4610b;font-weight:800;}',
      '.ts-imp{display:flex;align-items:center;gap:11px;flex-wrap:wrap;margin-top:14px;padding:13px 15px;border-radius:12px;background:#fff6e2;border:1px solid #f0d9a6;}',
      '.ts-imp .ms{color:#b4610b;}',
      '.ts-imp .g{flex:1 1 230px;min-width:0;}',
      '.ts-imp .g b{display:block;font-size:13.5px;font-weight:800;color:#6b4306;}',
      '.ts-imp .g span{display:block;font-size:12px;font-weight:600;color:#8a6a2f;margin-top:2px;}',
      /* the points table: one row per finishing place, nothing boxed inside
         anything else -- it sits straight on the section */
      '.ts-pts{display:flex;flex-direction:column;gap:0;max-width:430px;}',
      '.ts-pt{display:flex;align-items:center;gap:12px;padding:9px 0;border-bottom:1px solid var(--ffp-border);}',
      '.ts-pt .pl{flex:1;font-size:13.5px;font-weight:800;color:#12232f;}',
      '.ts-pt .lg-in{width:92px;min-width:0;flex:none;box-sizing:border-box;text-align:right;}',
      '.ts-pt .u{flex:none;width:52px;font-size:12px;font-weight:700;color:#5c6f7c;}',
      '.ts-pt.other{border-top:2px solid var(--ffp-border);border-bottom:0;}',
      '.ts-pt.other .pl{color:#5c6f7c;}',
      '.ts-ptrow{display:flex;align-items:center;gap:14px;margin-top:14px;flex-wrap:wrap;}',
      '.ts-imgs{display:flex;gap:18px;flex-wrap:wrap;margin:6px 0 16px;}',
      '.ts-imgs .im .lg-lab{margin-bottom:6px;}',
      '.ts-imgs .bx{width:210px;height:118px;border-radius:12px;background:#eef2f6 center/cover no-repeat;border:1px dashed #c3ced6;display:flex;align-items:center;justify-content:center;cursor:pointer;}',
      '.ts-imgs .bx.sq{width:118px;}',
      '.ts-imgs .bx .ms{font-size:30px;color:#93a3ae;}',
      /* picking who plays this round */
      '.ts-pick{margin:14px 0;border-top:1px solid var(--ffp-border);border-bottom:1px solid var(--ffp-border);}',
      '.ts-pick .hd{display:flex;align-items:center;gap:9px;padding:13px 0 11px;font-size:13.5px;font-weight:800;color:#12232f;}',
      '.ts-pick .hd .ms{color:#1980AD;}',
      '.ts-pick .bd{display:flex;flex-wrap:wrap;gap:9px;padding:0 0 14px;}',
      '.ts-pick .tm{display:flex;align-items:center;gap:9px;padding:8px 13px 8px 10px;border:1px solid var(--ffp-border);border-radius:100px;font-size:13px;font-weight:700;color:#12232f;cursor:pointer;background:#fff;}',
      '.ts-pick .tm.on{border-color:#1980AD;background:#eaf3fa;}',
      '.ts-pick .tm input{width:17px;height:17px;flex:none;}',
      '.ts-pick .tm .lg-av{width:26px;height:26px;font-size:11px;}',
      '.ts-pick .ft{display:flex;gap:9px;padding:0 0 15px;}'
    ].join('\n');
    document.head.appendChild(css);
  }
  function injectCss() { injectBaseCss(); injectExtraCss(); }

  async function loadSports() { if (S.sports) return S.sports; var r = await sb().from('lt_sport_schemas').select('key,name,icon,match_activities,player_fields,team_match_fields,scoring_kinds,game_rules,period_minutes,period_count,break_minutes,slot_minutes,turnaround_minutes,surface_word,surface_word_plural').eq('active', true).order('sort'); S.sports = r.data || []; return S.sports; }
  async function taxReady() { try { if (window.FFP_TAX_READY) await window.FFP_TAX_READY; } catch (e) {} return window.FFP_TAX || {}; }
  function actNames() { return ((window.FFP_TAX && window.FFP_TAX.activities) || []).map(function (a) { return a && a.n ? a.n : a; }); }
  function genderNames() { return ((window.FFP_TAX && window.FFP_TAX.genders) || ['Male', 'Female']).filter(function (g) { return g !== 'Prefer not to say'; }); }
  function cityNames() { var t = window.FFP_TAX; return (t && t.allCities) ? t.allCities() : []; }
  function countryNames() { var t = window.FFP_TAX; return t && t.cities ? Object.keys(t.cities) : []; }
  // A player's grade is their playing standard, and is NOT the division they are
  // entered in. FFP_TAX exposes no player-grade list, so it is read straight from
  // taxonomy_items (list_key 'player_grade') and cached for the session.
  var _grades = null;
  async function gradeNames() {
    if (_grades) return _grades;
    var r;
    try {
      r = await sb().from('taxonomy_items').select('value').eq('list_key', 'player_grade')
             .eq('active', true).order('sort_order');
    } catch (e) { r = { data: null }; }
    _grades = ((r && r.data) || []).map(function (x) { return x.value; });
    return _grades;
  }
  function dlOpts(arr) { return (arr || []).map(function (x) { return '<option value="' + esc(x) + '">'; }).join(''); }
  // The sport can only ever be a value from the activity taxonomy: the database
  // refuses anything else, so the form must not be able to offer anything else.
  // A stored value that has since left the list is kept at the top rather than
  // silently dropped when an old event is opened.

  /* ── THE SPORT PICKER ──────────────────────────────────────────────────
     Reads taxonomy_items list_key='sport', whose value is the scoring
     schema's own key. It used to read the 185-entry ACTIVITY list and then
     guess the sport from the activity, which is how American football came
     out scored as Australian rules. A sport that is stored but no longer on
     the list is kept at the top rather than silently dropped. */

  /* The database refuses with a reason - "unknown sport: quidditch", "a bonus
     rule is worth 1 to 10 points". Showing "Save failed" throws that away and
     leaves the organiser guessing. Postgres codes and RLS noise are not for
     them, so only a readable message is passed through. */
  function said(e) {
    var m = (e && (e.message || e.msg || e.details)) || '';
    m = String(m).replace(/^.*violates row-level security.*$/i, '');
    if (!m || /^[A-Z0-9_]+$/.test(m) || m.length > 160) return '';
    return m.charAt(0).toUpperCase() + m.slice(1);
  }
  /* Three sources, best first. The taxonomy is what admin edits, but it is
     one fetch that can fail; lt_sport_schemas is a SEPARATE live query this
     loader already makes for the hint, so it covers a taxonomy outage; and
     the hardcoded list in ffp-taxonomy.js covers both being unreachable.
     An organiser must never be unable to choose a sport. */

  /* ── HOW THIS COMPETITION IS RUN ────────────────────────────────────────
     The ruleset and the match length are the competition's DEFAULTS. A match
     still overrides its own from the scorer, and a division can override the
     competition; this is what both fall back to.

     The rulesets on offer come from the SPORT (lt_sport_schemas.game_rules
     .variants), so a sport with one ruleset shows no picker and nothing about
     which sports have rulesets is written down here. The database validates
     the choice as well, so a stale page cannot store one the scorer would not
     understand. */
  function sportVariants(k) {
    var s = (S.sports || []).find(function (x) { return x.key === k; });
    var v = s && s.game_rules && s.game_rules.variants;
    if (!v) return [];
    return Object.keys(v).map(function (id) {
      return { id: id, label: (v[id] && v[id].label) || id, note: (v[id] && v[id].note) || '' }; });
  }
  var LEN_COUNTS = [['', 'Sport default'], ['1', 'One period'], ['2', 'Two halves'], ['4', 'Four quarters']];
  function rulesBlock(ev) {
    var vs = sportVariants(ev.sport_key), out = '';
    if (vs.length > 1) {
      var cur = vs.find(function (x) { return x.id === ev.rules_variant; }) || vs[0];
      out += '<div class="lg-fld"><div class="lg-lab">Ruleset</div>'
        + '<select class="lg-sel" id="tgr-variant" onchange="FFPTourn.rulesHint()">'
        +   vs.map(function (x) {
              return '<option value="' + esc(x.id) + '"' + (x.id === cur.id ? ' selected' : '')
                   + '>' + esc(x.label) + '</option>'; }).join('')
        + '</select><div class="tg-hint" id="tgr-varianthint">' + esc(cur.note) + '</div></div>';
    }
    var cnt = ev.period_count == null ? '' : String(ev.period_count);
    return out + '<div class="lg-2">'
      + '<div class="lg-fld"><div class="lg-lab">Minutes a period</div>'
      +   '<input class="lg-in" id="tgr-min" type="number" min="1" max="60" placeholder="Sport default" value="'
      +   (ev.period_minutes == null ? '' : ev.period_minutes) + '"></div>'
      + '<div class="lg-fld"><div class="lg-lab">How many</div><select class="lg-sel" id="tgr-cnt">'
      +   LEN_COUNTS.map(function (x) {
            return '<option value="' + x[0] + '"' + (cnt === x[0] ? ' selected' : '') + '>' + x[1] + '</option>'; }).join('')
      +   '</select></div></div>'
      + '<div class="tg-hint">Left empty, a match runs to whatever the sport plays. '
      + 'A single match can still be changed from the scorer.</div>';
  }
  function rulesHint() {
    var s = document.getElementById('tgr-variant'), h = document.getElementById('tgr-varianthint');
    if (!s || !h) return;
    var ev = (S.detail && S.detail.event) || {};
    var x = sportVariants(ev.sport_key).find(function (y) { return y.id === s.value; });
    h.textContent = (x && x.note) || '';
  }
  /* The three keys are always sent, so clearing a field back to empty actually
     clears it - the save RPCs use `p ? key` for exactly this reason. */
  function rulesPayload() {
    var p = { period_minutes: v('tgr-min') || null, period_count: v('tgr-cnt') || null };
    var s = document.getElementById('tgr-variant');
    if (s) p.rules_variant = s.value || null;
    return p;
  }

  function sportList() {
    var t = (window.FFP_TAX && window.FFP_TAX.sports) || [];
    if (t.length) return t;
    var s = (S.sports || []).map(function (x) { return { key: x.key, label: x.name || x.key }; });
    return s.length ? s : [];
  }
  function sportOpts(cur) {
    var a = sportList().slice();
    if (cur && !a.some(function (s) { return s.key === cur; })) a.unshift({ key: cur, label: cur });
    return a.map(function (s) {
      return '<option value="' + esc(s.key) + '"' + (s.key === cur ? ' selected' : '')
           + '>' + esc(s.label) + '</option>'; }).join('');
  }
  /* a direct lookup now the key is stored, instead of matching the activity
     against every schema's match_activities and hoping */
  function schemaNameForSport(k) {
    var s = (S.sports || []).find(function (x) { return x.key === k; });
    return s ? s.name : 'Generic points';
  }
  /* A tournament no longer carries a sport until the organiser picks one: it
     used to be born as Padel, whatever the tournament was. Nothing is shown
     for an unchosen sport rather than a sport nobody chose. */
  function sportLabelFor(k) {
    if (!k) return '';
    var s = sportList().find(function (x) { return x.key === k; });
    return (s && s.label) || k;
  }
  function sportSetHint(k) {
    return k ? 'Scoring and stats set: ' + schemaNameForSport(k)
             : 'Pick a sport and the scoring and stats set follows.';
  }

  function actOpts(cur) {
    var a = actNames().slice();
    if (cur && a.indexOf(cur) < 0) a.unshift(cur);
    return a.map(function (n) {
      return '<option value="' + esc(n) + '"' + (n === cur ? ' selected' : '') + '>' + esc(n) + '</option>';
    }).join('');
  }
  function schemaForActivity(act) { var s = (S.sports || []).find(function (x) { return (x.match_activities || []).some(function (a) { return String(a).toLowerCase() === String(act || '').toLowerCase(); }); }); return s ? s.name : 'Generic points'; }
  function sportHint() { var a = (document.getElementById('tg-sport') || {}).value; var h = document.getElementById('tg-sporthint'); if (h) h.textContent = sportSetHint(a); }

  // The one place that turns a supabase error into something a human can act on.
  // code is what tells us whether it is the schema cache (PGRST202), a missing
  // grant (42501) or the function itself.
  function errText(e, fallback) {
    if (!e) return fallback;
    var bits = [e.message || e.error_description || e.error || '', e.code ? '[' + e.code + ']' : '',
                e.details || '', e.hint || ''].filter(Boolean);
    return bits.length ? bits.join(' ') : fallback;
  }

  async function renderList() {
    injectCss(); var el = root(); if (!el) return;
    var r; try { r = await sb().rpc('tourn_my_events'); } catch (e) { r = { error: e }; }
    // A failed list used to render as "you have no tournaments", which is the
    // same picture as a working empty account. Never again.
    if (r && r.error) { toast(errText(r.error, 'Could not load your tournaments'), 'error'); }
    var list = (r && r.data) || [];
    // Archived tournaments are out of the way by default, but never out of reach.
    var arch = list.filter(function (ev) { return ev.status === 'archived'; });
    if (!S.showArchived) list = list.filter(function (ev) { return ev.status !== 'archived'; });
    var cards = list.map(function (ev) {
      var cov = ev.cover_url || ev.logo_url;
      return '<div class="lg-card" onclick="FFPTourn.open(\'' + ev.id + '\')"><div class="lg-cover" style="' + (cov ? 'background-image:url(\'' + esc(cov) + '\')' : '') + '"><div class="scr"></div><div class="bd ' + esc(ev.status) + '">' + esc((ev.status || 'draft').toUpperCase()) + '</div></div><div class="lg-cbody"><b>' + esc(ev.name) + '</b><span>' + esc([ev.city, ev.sport].filter(Boolean).join(', ')) + '</span></div></div>';
    }).join('');
    var newCard = S.creating
      ? '<div class="lg-card" style="cursor:default"><div class="lg-cover"><div class="scr"></div></div><div class="lg-cbody"><input class="lg-in" id="tg-newname" placeholder="Tournament name" onkeydown="if(event.key===\'Enter\')FFPTourn.doCreate()"><div style="display:flex;gap:8px;margin-top:8px"><button class="lg-btn pri" onclick="FFPTourn.doCreate()">Create</button><button class="lg-btn ghost" onclick="FFPTourn.cancelCreate()">Cancel</button></div></div></div>'
      : '<div class="lg-new" onclick="FFPTourn.startCreate()">' + ic('add') + 'Create a tournament</div>';
    /* SERIES first: a run of tournaments that share their teams. Its rounds
       still appear in the grid below -- a round IS a tournament -- so this is
       a way in, not a second copy of the list. */
    var sers = await loadMySeries();
    var serHtml = (sers || []).map(function (x) {
      var nx = x.next_round || null;
      return '<div class="ts-rd" style="cursor:pointer" onclick="FFPTourn.openSeries(\'' + x.id + '\')">'
        + '<span class="pic" style="' + (x.cover_url ? 'background-image:url(\'' + esc(x.cover_url) + '\')' : '') + '"></span>'
        + '<div class="g"><b>' + esc(x.name) + '</b><span>'
        +   esc([(x.rounds || 0) + ((x.rounds === 1) ? ' round' : ' rounds'),
                 (x.teams || 0) + ((x.teams === 1) ? ' team' : ' teams'), x.city].filter(Boolean).join(', '))
        + '</span><span>' + (nx ? 'Next: ' + esc(nx.name) : 'No round open') + '</span></div>'
        + '<span class="ms" style="color:#93a3ae">chevron_right</span></div>';
    }).join('');
    var serAdd = S.serCreating
      ? '<div class="lg-edit"><input class="lg-in" id="ts-newname" placeholder="Series name" onkeydown="if(event.key===\'Enter\')FFPTourn.serCreate()"><button class="lg-btn pri" onclick="FFPTourn.serCreate()">' + ic('check') + 'Create</button><button class="lg-btn ghost" onclick="FFPTourn.serCreateCancel()">Cancel</button></div>'
      : '<button class="lg-btn" onclick="FFPTourn.serCreateOpen()">' + ic('add') + 'Create a series</button>';
    el.innerHTML = '<div class="lg-wrap"><div class="lg-head"><div><div class="lg-h1">Tournaments</div><div class="lg-sub">Groups + knockout bracket.</div></div></div>'
      + '<div class="tg-sec"><div class="tg-sech">Series</div>'
      + '<div class="tg-hint" style="margin:0 0 10px">A series carries its teams from one round to the next, and adds up where each team finishes.</div>'
      + serHtml + serAdd + '</div>'
      + '<div class="tg-sech" style="margin-top:22px">All tournaments</div><div class="lg-grid">' + cards + newCard + '</div>'
      + (arch.length ? '<div class="lg-archrow"><button class="lg-btn ghost" onclick="FFPTourn.toggleArchived()">'
          + ic(S.showArchived ? 'visibility_off' : 'inventory_2')
          + (S.showArchived ? 'Hide archived' : arch.length + ' archived') + '</button></div>' : '')
      + '</div>';
    if (S.creating) { var i = document.getElementById('tg-newname'); if (i) i.focus(); }
    if (S.serCreating) { var si = document.getElementById('ts-newname'); if (si) si.focus(); }
  }
  function startCreate() { S.creating = true; renderList(); }
  function cancelCreate() { S.creating = false; renderList(); }
  async function doCreate() {
    var nm = (document.getElementById('tg-newname') || {}).value; if (!nm || !nm.trim()) return;
    var r; try { r = await sb().rpc('tourn_event_save', { p_id: null, p: { name: nm.trim() } }); } catch (e) { r = { error: e }; }
    // Say what actually went wrong. "Could not create" hid a real error for long
    // enough that the database had to be cleared of suspicion by hand.
    if (r.error) { toast(errText(r.error, 'Could not create'), 'error'); return; }
    S.creating = false; open(r.data);
  }
  async function open(id) {
    S.eventId = id; S.view = 'editor'; S.tab = 'information'; S.divEdit = null; S.entAdd = false; S.grpDraw = false; S.brkConfirm = false;
    S.plan = null; S._autoPlanned = false;   // a different event, a different playing day
    var r; try { r = await sb().rpc('tourn_detail', { p_tourn: id }); } catch (e) { r = { error: e }; }
    S.detail = (r && r.data) || null; snapFormats();
    S.divId = (S.detail && S.detail.divisions && S.detail.divisions[0] && S.detail.divisions[0].id) || null;
    renderEditor();
  }
  function renderEditor() {
    injectCss(); var el = root(); if (!el || !S.detail) return;
    var ev = S.detail.event || {};
    el.innerHTML = '<div class="lg-wrap"><div class="lg-head"><div><div class="lg-h1">' + esc(ev.name) + '<span class="lg-pill ' + esc(ev.status) + '">' + esc((ev.status || 'draft').toUpperCase()) + '</span></div><div class="lg-sub">' + esc([ev.city, ev.activity || sportLabelFor(ev.sport_key)].filter(Boolean).join(', ')) + '</div></div>'
      + '<button class="lg-btn" onclick="FFPTourn.back()">' + ic('arrow_back') + 'All tournaments</button></div>'
      + '<div class="lg-nav"><span class="tg-phase">Set up</span>' + tabBtn('information', 'Information') + tabBtn('setup', 'Setup') + tabBtn('entrants', nouns(null).Many) + tabBtn('venues', 'Venues') + tabBtn('officials', 'Officials')
      + '<span class="tg-navsep"></span><span class="tg-phase">Run</span>' + tabBtn('matchday', 'Match day') + (anyGroups() ? tabBtn('groups', 'Group stage') : '') + tabBtn('bracket', 'Draw') + tabBtn('schedule', 'Schedule') + tabBtn('sponsors', 'Sponsors') + '</div><div id="tg-tab"></div></div>';
    renderTab();
  }
  function snapFormats() { S._fmtSaved = {}; ((S.detail && S.detail.divisions) || []).forEach(function (d) { S._fmtSaved[d.id] = fmtOfDiv(d); }); }
  function anyGroups() { return (S.detail && S.detail.divisions || []).some(function (d) { return !!d.group_stage; }) || !!(S.detail && S.detail.event && S.detail.event.group_stage); }
  function tabBtn(id, label) { return '<button class="' + (S.tab === id ? 'on' : '') + '" onclick="FFPTourn.tab(\'' + id + '\')">' + label + '</button>'; }
  function renderTab() {
    var host = document.getElementById('tg-tab'); if (!host) return;
    if (S.tab === 'information' || S.tab === 'details') return renderInformation(host);
    if (S.tab === 'setup') return renderSetup(host);
    if (S.tab === 'matchday') return renderMatchDay(host);
    /* Divisions had its own tab, but a division's format and its draw already
       live on Setup, so it is set up there in one place. An old link or a
       stale tab still lands somewhere sensible. */
    if (S.tab === 'divisions') { S.tab = 'setup'; }
    if (S.tab === 'entrants') return renderEntrants(host);
    if (S.tab === 'groups') return renderGroups(host);
    if (S.tab === 'bracket') return renderBracket(host);
    if (S.tab === 'venues') return renderVenues(host);
    if (S.tab === 'officials') return renderOfficials(host);
    if (S.tab === 'schedule') return renderSchedule(host);
    if (S.tab === 'sponsors') return renderSponsors(host);
  }
  /* ───────────────────────── MATCH DAY ─────────────────────────
     The one screen an organiser stands on all day. It asks the database for
     the day through tourn_day, which hands over to THIS sport's own day
     function, so what comes back already speaks the sport: courts or pitches,
     markers or referees, games or points. Nothing in here decides anything
     about a sport. */
  var MD_DCOL = ['#1B4A73','#7A4FA3','#0F7A6B','#B23A48','#8A5A00',
                 '#5B3E8E','#0F6E7A','#2F6B2F','#A4454F','#B06A00'];
  var MD_KIND = { clash: 'CLASH', result: 'NO RESULT', finish: 'STILL LIVE',
                  official: 'OFFICIAL', sheet: 'TEAM SHEET', entrants: 'NO PLAYERS' };

  function mdDayLabel(ymd) {
    var a = String(ymd || '').split('-'); if (a.length !== 3) return 'Today';
    var dt = new Date(Date.UTC(+a[0], +a[1] - 1, +a[2], 12, 0, 0));
    var D = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    var M = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return D[dt.getUTCDay()] + ' ' + dt.getUTCDate() + ' ' + M[dt.getUTCMonth()] + ' ' + dt.getUTCFullYear();
  }
  function mdShiftDay(ymd, delta) {
    var a = String(ymd || '').split('-'); if (a.length !== 3) return ymd;
    var dt = new Date(Date.UTC(+a[0], +a[1] - 1, +a[2], 12, 0, 0));
    dt.setUTCDate(dt.getUTCDate() + delta);
    return dt.toISOString().slice(0, 10);
  }

  async function renderMatchDay(host) {
    host.innerHTML = '<div class="lg-empty">Loading the day\u2026</div>';
    /* THE CHOSEN DAY BELONGS TO THE EVENT BEING LOOKED AT. Keeping it across
       events is how this screen ended up reporting 1 December at a tournament
       that played in October, and then calling that empty day a clean one. */
    if (S.mdFor !== S.eventId) { S.mdFor = S.eventId; S.mdDay = null; }

    var d = await mdFetch(S.mdDay);
    if (!d) { host.innerHTML = '<div class="lg-empty">Could not load the day.</div>'; return; }

    /* land on a day that actually has matches rather than on an empty one */
    if (!S.mdDay && !(d.headline && d.headline.total) && (d.days || []).length) {
      var pick = mdNearestDay(d.days, d.day);
      if (pick && pick !== d.day) { var d2 = await mdFetch(pick); if (d2) d = d2; }
    }
    S.mdDay = d.day || S.mdDay;
    S.md = d;

    if (d.unsupported) {
      host.innerHTML = mdHead(d) + mdDays(d)
        + '<div class="lg-empty">There is no match day panel for this sport yet.</div>';
      return;
    }
    host.innerHTML = mdHead(d) + mdDays(d) + mdTray(d) + mdGrid(d) + mdJobs(d)
      + mdSurfaces(d) + mdDivisions(d) + mdKey(d) + mdSimStrip(d);
  }

  /* THE MOVE ITSELF. The grid is the organiser's picture of the day, so a
     match is moved on it the way it would be moved on a whiteboard. Like the
     arrows on the Schedule tab this is an ACT, not a setting, so it is
     written when it is dropped. */
  function mdDrag(e, id) {
    S.mdDragId = id;
    try { e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', id); } catch (x) {}
    if (e.target && e.target.classList) e.target.classList.add('dragging');
  }
  function mdDragEnd(e) {
    S.mdDragId = null;
    if (e.target && e.target.classList) e.target.classList.remove('dragging');
    var q = document.querySelectorAll('.md-g td.dz');
    for (var i = 0; i < q.length; i++) { q[i].classList.remove('dz'); q[i].classList.remove('swap'); }
  }
  function mdCell(e) {
    var n = e.target;
    while (n && !(n.tagName === 'TD' && n.hasAttribute('data-fid'))) n = n.parentNode;
    return n && n.tagName === 'TD' ? n : null;
  }
  function mdOver(e) {
    if (!S.mdDragId) return;
    e.preventDefault();
    try { e.dataTransfer.dropEffect = 'move'; } catch (x) {}
    var td = mdCell(e); if (!td) return;
    td.classList.add('dz');
    /* dropping onto a match is a swap, so it does not look like an empty slot */
    td.classList.toggle('swap', !!td.querySelector('div[draggable]'));
  }
  function mdLeave(e) { var td = mdCell(e); if (td) { td.classList.remove('dz'); td.classList.remove('swap'); } }
  async function mdDrop(e) {
    e.preventDefault();
    var td = mdCell(e); if (td) { td.classList.remove('dz'); td.classList.remove('swap'); }
    var id = S.mdDragId || (function () { try { return e.dataTransfer.getData('text/plain'); } catch (x) { return null; } })();
    S.mdDragId = null;
    if (!td || !id) return;
    var fid = td.getAttribute('data-fid'), at = td.getAttribute('data-at');
    var day = (S.md && S.md.day) || S.mdDay;
    if (!fid || !at || !day) return;

    /* a card being placed FROM the tray is not in the day's matches, so it is
       looked for there too rather than treated as a drag that went nowhere */
    var all = ((S.md && S.md.matches) || []);
    var me = all.filter(function (x) { return x.match_id === id; })[0]
          || ((S.md && S.md.to_place) || []).filter(function (x) { return x.match_id === id; })[0];
    if (!me) return;
    if ((me.field_id || null) === fid && me.at === at) return;   // put back where it was

    var when = evIso(day, at);
    var surf = ((S.md && S.md.surfaces) || []).filter(function (x) { return x.field_id === fid; })[0];
    var where = (surf && surf.name) || Surf();

    /* what is already sitting in the cell being dropped on */
    var sitting = all.filter(function (x) {
      return x.match_id !== id && (x.field_id || null) === fid && x.at === at; });

    var put = async function (mid, w, fld) {
      var q; try {
        q = await sb().rpc('lt_match_schedule', { p_scope: 'tourn', p_match: mid, p_when: w,
              p_field: fld, p_court: null, p_official: null });
      } catch (x) { q = { error: x }; }
      return !(q && q.error);
    };

    /* ONE MATCH THERE -> THE TWO TRADE PLACES. Two or more is already a clash
       the organiser is looking at, and guessing which of them to send away
       would be worse than saying so. */
    if (sitting.length === 1) {
      var other = sitting[0];
      var backWhen = me.at ? evIso(day, me.at) : null;
      var backFid = me.field_id || null;
      /* A MATCH COMING OUT OF TO PLACE HAS NOWHERE TO SEND THE SITTING ONE,
         because it has no slot of its own to trade. Rather than refuse the
         drop and leave the organiser guessing, the sitting match goes back to
         TO PLACE and the dragged one takes the cell. Still never two on one
         court, and nothing is lost. */
      if (!backWhen || !backFid) {
        if (!(await mdPark(other.match_id))) return;
        if (!(await put(id, when, fid))) { toast('Could not place it', 'error'); return; }
        toast('Placed. ' + (other.no ? 'M' + other.no : 'The match that was there')
          + ' went back to TO PLACE.', 'success');
        renderTab(); return;
      }
      if (!(await put(id, when, fid))) { toast('Could not swap them', 'error'); return; }
      if (!(await put(other.match_id, backWhen, backFid))) {
        /* put the first one back rather than leave both on one court */
        await put(id, backWhen, backFid);
        toast('Could not swap them', 'error'); return;
      }
      var hereBk = inBreak({ scheduled_at: when, field_id: fid });
      var thereBk = inBreak({ scheduled_at: backWhen, field_id: backFid });
      if (hereBk || thereBk) toast('Swapped, but one of them is now inside '
        + breakName(hereBk || thereBk), 'error');
      else toast('Swapped with ' + (other.home || 'TBD') + ' v ' + (other.away || 'TBD'), 'success');
      renderTab(); return;
    }

    if (!(await put(id, when, fid))) { toast('Could not move it', 'error'); return; }
    var bk = inBreak({ scheduled_at: when, field_id: fid });
    if (bk) toast('Moved to ' + at + ' on ' + where + ', but that is inside ' + breakName(bk), 'error');
    else if (sitting.length) toast('Moved to ' + at + ' on ' + where + ', where ' + sitting.length
      + ' other matches are already booked', 'error');
    else toast('Moved to ' + at + ' on ' + where, 'success');
    renderTab();
  }

  /* PARKING. Dropping a match on a day, or into TO PLACE, takes it off the
     grid: its time and its court are cleared and the slot it was in goes
     free. It is not given a new time, because the organiser places it. */
  async function mdPark(id) {
    var r; try { r = await sb().rpc('tourn_match_park', { p_match: id }); }
    catch (e) { r = { error: e }; }
    if (r.error || !(r.data && r.data.ok)) {
      toast((r.data && r.data.detail) || 'Could not take it off the grid', 'error');
      return false;
    }
    return true;
  }
  function mdDayOver(e, day) {
    if (!S.mdDragId) return;
    e.preventDefault();
    try { e.dataTransfer.dropEffect = 'move'; } catch (x) {}
    if (S.mdDayHot !== day) { S.mdDayHot = day; renderTab(); }
  }
  function mdDayLeave(e, day) { if (S.mdDayHot === day) { S.mdDayHot = null; renderTab(); } }
  async function mdDayDrop(e, day) {
    e.preventDefault();
    S.mdDayHot = null;
    var id = S.mdDragId || (function () {
      try { return e.dataTransfer.getData('text/plain'); } catch (x) { return null; } })();
    S.mdDragId = null;
    if (!id || !day) { renderTab(); return; }
    if (!(await mdPark(id))) { renderTab(); return; }
    toast('Parked on ' + mdDayShort(day) + '. Place it from TO PLACE.', 'success');
    mdPick(day);
  }
  function mdTrayOver(e) {
    if (!S.mdDragId) return;
    e.preventDefault();
    try { e.dataTransfer.dropEffect = 'move'; } catch (x) {}
    if (!S.mdTrayHot) { S.mdTrayHot = true; renderTab(); }
  }
  function mdTrayLeave(e) { if (S.mdTrayHot) { S.mdTrayHot = false; renderTab(); } }
  async function mdTrayDrop(e) {
    e.preventDefault();
    S.mdTrayHot = false;
    var id = S.mdDragId || (function () {
      try { return e.dataTransfer.getData('text/plain'); } catch (x) { return null; } })();
    S.mdDragId = null;
    if (!id) { renderTab(); return; }
    var all = ((S.md && S.md.matches) || []);
    var me = all.filter(function (x) { return x.match_id === id; })[0];
    if (!me) { renderTab(); return; }                 /* already in the tray */
    if (!(await mdPark(id))) { renderTab(); return; }
    toast('Taken off the grid. That slot is free.', 'success');
    renderTab();
  }

  async function mdFetch(day) {
    var r; try {
      r = await sb().rpc('tourn_day', { p_event: S.eventId, p_day: day || null, p_now: null });
    } catch (e) { r = { error: e }; }
    return (r && !r.error) ? (r.data || {}) : null;
  }
  /* the next day that has matches, or the last one if they are all behind us */
  function mdNearestDay(days, from) {
    var up = (days || []).filter(function (x) { return x.matches > 0 && x.day >= from; });
    if (up.length) return up[0].day;
    var back = (days || []).filter(function (x) { return x.matches > 0; });
    return back.length ? back[back.length - 1].day : null;
  }
  /* HH:MM to minutes and back, so the spare slot lands on a real time rather
     than on a string with a number glued to the end of it. */
  function mdMins(t) {
    var a = String(t || '').split(':');
    return (+a[0] || 0) * 60 + (+a[1] || 0);
  }
  function mdHhmm(n) {
    n = Math.max(0, Math.min(24 * 60 - 1, n | 0));
    var h = Math.floor(n / 60), m = n % 60;
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  }
  function mdDayShort(ymd) {
    var a = String(ymd || '').split('-'); if (a.length !== 3) return '';
    var dt = new Date(Date.UTC(+a[0], +a[1] - 1, +a[2], 12, 0, 0));
    var D = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    var M = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return D[dt.getUTCDay()] + ' ' + dt.getUTCDate() + ' ' + M[dt.getUTCMonth()];
  }
  /* EVERY DAY THIS EVENT PLAYS ON, so nobody has to find them with the arrows. */
  function mdDays(d) {
    var days = (d.days || []).filter(function (x) { return x.matches > 0; });
    if (days.length < 2) return '';
    return '<div class="md-strip">' + days.map(function (x) {
      var hot = (S.mdDayHot === x.day);
      return '<button class="md-dbtn' + (x.day === d.day ? ' on' : '') + (hot ? ' dz' : '') + '"'
        + ' onclick="FFPTourn.mdPick(\'' + x.day + '\')"'
        + ' data-day="' + x.day + '"'
        + ' ondragover="FFPTourn.mdDayOver(event,\'' + x.day + '\')"'
        + ' ondragleave="FFPTourn.mdDayLeave(event,\'' + x.day + '\')"'
        + ' ondrop="FFPTourn.mdDayDrop(event,\'' + x.day + '\')">'
        + '<b>' + esc(mdDayShort(x.day)) + '</b>'
        + (hot ? '<em class="dzl">' + ic('inventory_2') + 'Park here</em>'
               : '<s>' + (x.played || 0) + ' OF ' + x.matches + '</s>') + '</button>';
    }).join('') + '</div>';
  }

  /* ONE MATCH CARD, drawn the same whether it sits in a cell or in the tray.
     It was written inline inside mdGrid, which is why a card could not exist
     anywhere else on the panel. */
  function mdCard(m, dcol, dnm, ready) {
    var k = m.status === 'final' ? 'c-done'
          : m.status === 'live' ? 'c-live'
          : (ready && ready[m.division_id] === false ? 'c-none'
          : (m.late ? 'c-late' : 'c-wait'));
    var named = m.home && m.away && !/^TBD$/.test(m.home) && !/^TBD$/.test(m.away);
    return '<div class="' + k + '" draggable="true"'
      + ' ondragstart="FFPTourn.mdDrag(event,\'' + m.match_id + '\')"'
      + ' ondragend="FFPTourn.mdDragEnd(event)">'
      + (m.no ? '<em class="mno">M' + m.no + '</em>' : '')
      + '<b class="tag" style="color:' + ((dcol && dcol[m.division_id]) || 'var(--ffp-blue)')
        + '">' + esc((dnm && dnm[m.division_id]) || '') + '</b>'
      + (m.label ? '<em class="rnd">' + esc(m.label) + '</em>' : '')
      + (named
          ? '<u class="who">' + esc(m.home) + '<i class="vs">v</i>' + esc(m.away) + '</u>'
          : '<s class="who tbd"><i>To be decided</i></s>')
      + (m.score ? '<em class="sc2">' + esc(m.score) + '</em>' : '')
      + '</div>';
  }

  /* TO PLACE. Every match in the event still waiting for a time and a court,
     whatever day it belongs to, because a match without a time does not belong
     to one. It is also where a match goes when it is dragged off the grid, so
     the slot it was in goes free. */
  function mdTray(d) {
    var list = d.to_place || [];
    var dcol = {}, dnm = {};
    (d.divisions || []).forEach(function (x, i) {
      dcol[x.division_id] = MD_DCOL[i % MD_DCOL.length];
      dnm[x.division_id] = x.division || '';
    });
    return '<div class="md-tray' + (S.mdTrayHot ? ' dz' : '') + '"'
      + ' ondragover="FFPTourn.mdTrayOver(event)"'
      + ' ondragleave="FFPTourn.mdTrayLeave(event)"'
      + ' ondrop="FFPTourn.mdTrayDrop(event)">'
      + '<div class="th">' + ic('inventory_2') + '<b>TO PLACE</b><span>'
      + (list.length
          ? list.length + (list.length === 1 ? ' match has' : ' matches have')
            + ' no time or ' + surfWord() + ' yet. Drag one into the grid.'
          : 'Nothing waiting. Drag a match here to take it off the grid and free its slot.')
      + '</span></div>'
      + '<div class="tr">'
      + (list.length
          ? list.map(function (m) { return mdCard(m, dcol, dnm, null); }).join('')
          : '<div class="mt">' + ic('drag_pan') + 'Drop a match here</div>')
      + '</div></div>';
  }

  /* THE WHOLE DAY, the element the approved panel leads on: one row per
     surface, one column per slot, so the organiser sees the shape of the day
     before they read a word. Hatched means that division has nobody entered.
     Two matches in one cell is a clash and is drawn as one. */
  /* One place that writes the drop attributes, so a cell with a match in it
     and an empty one behave identically. A null court is not a target. */
  function drop(fid, at) {
    if (!fid) return '';
    return ' data-fid="' + fid + '" data-at="' + at + '"'
      + ' ondragover="FFPTourn.mdOver(event)"'
      + ' ondragleave="FFPTourn.mdLeave(event)"'
      + ' ondrop="FFPTourn.mdDrop(event)"';
  }
  function mdGrid(d) {
    var ms = (d.matches || []).filter(function (m) { return m.at; });
    if (!ms.length) return '';
    /* a round tag wears its division's colour, as approved, so a court
       hosting three divisions in a day can be read down the column */
    var ready = {}, dcol = {}, dnm = {};
    (d.divisions || []).forEach(function (x, i) {
      ready[x.division_id] = !!x.ready;
      dcol[x.division_id] = MD_DCOL[i % MD_DCOL.length];
      dnm[x.division_id] = x.division || '';
    });

    var slots = [];
    ms.forEach(function (m) { if (slots.indexOf(m.at) < 0) slots.push(m.at); });
    slots.sort();

    /* ONE SPARE SLOT ON THE END. The grid only ever drew columns that already
       had a match in them, so there was no cell for a time later than anything
       booked and a match could not be moved later in the day. The step is the
       smallest gap the day already uses, so it matches how this event is run
       rather than a number we picked. */
    var step = 30;
    for (var si = 1; si < slots.length; si++) {
      var g = mdMins(slots[si]) - mdMins(slots[si - 1]);
      if (g > 0 && g < step) step = g;
    }
    var spare = slots.length ? mdHhmm(mdMins(slots[slots.length - 1]) + step) : null;
    if (spare) slots.push(spare);

    /* a match with no surface now lives in TO PLACE, not in a row of its own */
    var rows = (d.surfaces || []).map(function (x) {
      return { key: x.field_id, name: x.name, code: x.screen_code };
    });
    if (!rows.length || !slots.length) return '';

    var head = '<tr><th class="cl">' + esc(Surf().toUpperCase()) + '</th>'
      + slots.map(function (t) {
          return '<th' + (t === spare ? ' class="nx"' : '') + '>' + esc(t)
            + (t === spare ? '<span class="nwx">SPARE</span>' : '') + '</th>';
        }).join('') + '</tr>';

    var body = rows.map(function (r) {
      return '<tr><td class="cl"><b>' + esc(r.name) + '</b>'
        + (r.code ? '<s>' + esc(r.code) + '</s>' : '') + '</td>'
        + slots.map(function (t) {
            var cell = ms.filter(function (m) {
              return m.at === t && (m.field_id || null) === (r.key || null); });
            var cls = '';
            if (!cell.length) return '<td class="free' + (t === spare ? ' nx' : '') + ' ' + cls + '"'
              + drop(r.key, t) + '></td>';
            if (cell.length > 1) cls += ' dbl';
            /* mdCard draws it, here and in TO PLACE, so a card cannot look
               like two different things depending on where it is sitting.
               TWO NAMES, NOT THREE: the v says which two are playing whom, and
               a round nobody has reached yet says so rather than drawing blank. */
            return '<td class="' + cls + '"' + drop(r.key, t) + '>' + cell.map(function (m) {
              return mdCard(m, dcol, dnm, ready);
            }).join('') + '</td>';
          }).join('') + '</tr>';
    }).join('');

    return '<div class="md-sh"><h3>THE WHOLE DAY</h3><p>'
      + rows.length + ' ' + esc(rows.length === 1 ? surfWord() : surfWord(true))
      + ' down, ' + slots.length + ' slots across</p><span class="ln"></span></div>'
      + '<div class="md-dy"><div class="sc"><table class="md-g"><thead>' + head
      + '</thead><tbody>' + body + '</tbody></table></div></div>';
  }

  /* the key, at the foot of the panel as approved */
  function mdKey() {
    return ''
      + '<div class="md-key">'
      + '<span><i style="background:#E8F5EF;box-shadow:inset 0 0 0 1px #BFE0D2"></i>PLAYED</span>'
      + '<span><i style="background:#FFF4DC;box-shadow:inset 0 0 0 2px #F2A900"></i>BEING PLAYED</span>'
      + '<span><i style="background:#FDF6E6;box-shadow:inset 0 0 0 1px #E8D9B0"></i>PAST ITS TIME</span>'
      + '<span><i style="background:#fff;box-shadow:inset 0 0 0 1px var(--ffp-border-mid)"></i>TO COME</span>'
      + '<span><i style="background:repeating-linear-gradient(135deg,#EEF2F6 0 6px,#F7F9FB 6px 12px);box-shadow:inset 0 0 0 1px var(--ffp-border-mid)"></i>NOBODY ENTERED</span>'
      + '</div>';
  }

  function mdHead(d) {
    var h = d.headline || {};
    var sw = (d.surface_word || 'court').toUpperCase();
    var empty = (d.divisions || []).filter(function (x) { return !x.ready; })
                 .reduce(function (a, x) { return a + (x.matches || 0); }, 0);
    var cn = function (v, lab, tone) {
      return '<div class="md-cn' + (tone ? ' ' + tone : '') + '"><u>' + (v || 0) + '</u><s>'
           + esc(lab) + '</s></div>';
    };
    return '<div class="md-top"><div class="md-day">'
      + '<button class="sc-ic" title="The day before" onclick="FFPTourn.mdDay(-1)">' + ic('chevron_left') + '</button>'
      + '<b>' + esc(mdDayLabel(d.day || S.mdDay)) + '</b>'
      + '<button class="sc-ic" title="The day after" onclick="FFPTourn.mdDay(1)">' + ic('chevron_right') + '</button>'
      + (d.as_at ? '<span class="tz">as at ' + esc(d.as_at) + ', ' + esc(d.timezone || '') + '</span>' : '')
      + '<span class="sp"></span>'
      + (d.simulated ? '<span class="tz" style="color:#B87A00;font-weight:900;">SIMULATED ENTRIES IN THIS EVENT</span>' : '')
      + '<button class="lg-btn sm" onclick="FFPTourn.mdRefresh()">' + ic('refresh') + 'Refresh</button>'
      + '</div><div class="md-cnt">'
      + cn(h.played, 'COMPLETED', 'ok')
      + cn(h.live, 'ON ' + sw, 'warn')
      + cn(h.late, 'LATE', 'warn')
      + cn(h.clashes, 'CLASHES', 'warn')
      + cn(empty, 'NO PLAYERS', 'blue')
      + cn(h.total, 'TODAY')
      + '</div></div>';
  }

  function mdJobs(d) {
    var t = d.todo || [];
    /* NO MATCHES IS NOT THE SAME AS NOTHING WRONG. Saying every match has what
       it needs, on a day with no matches at all, is how this panel told an
       organiser their tournament was fine when it was not even being read. */
    if (!(d.headline && d.headline.total)) {
      var near = mdNearestDay(d.days, d.day);
      return '<div class="md-sh"><h3>NOTHING ON THIS DAY</h3><span class="ln"></span></div>'
        + '<div class="md-none">' + ic('event_busy') + '<div class="g">'
        + '<b>No matches are scheduled on ' + esc(mdDayLabel(d.day)) + '.</b>'
        + (near && near !== d.day
            ? '<p>The nearest day with matches is ' + esc(mdDayLabel(near)) + '.</p>'
              + '<a class="lg-btn sm" onclick="FFPTourn.mdPick(\'' + near + '\')">Go to that day</a>'
            : '<p>Nothing on this event has a date and time yet. Set them on the Schedule tab.</p>')
        + '</div></div>';
    }
    if (!t.length) {
      return '<div class="md-sh"><h3>NOTHING NEEDS YOU</h3><span class="ln"></span></div>'
        + '<div class="md-clear">' + ic('check_circle')
        + '<b>Every match today has a time, a ' + esc(d.surface_word || 'court')
        + ' and somebody to run it.</b></div>';
    }
    return '<div class="md-sh"><h3>NEEDS ATTENTION</h3><p>' + t.length
      + (t.length === 1 ? ' job' : ' jobs') + ', soonest first</p><span class="ln"></span></div>'
      + '<div class="md-rail">' + t.map(mdJob).join('') + '</div>';
  }
  function mdJob(j) {
    var act = j.action || '';
    var btn = j.match_id
      ? '<button class="lg-btn sm" onclick="FFPTourn.mdGo(\'' + j.match_id + '\')">Open match</button>'
      : '<button class="lg-btn sm" onclick="FFPTourn.tab(\'entrants\')">Add ' + esc(nouns(null).Many) + '</button>';
    return '<div class="md-jb k-' + esc(act) + '">'
      + '<div class="tm"><u>' + esc(j.at || '') + '</u><s>' + esc(MD_KIND[act] || act.toUpperCase()) + '</s></div>'
      + '<i class="dot"></i>'
      + '<div class="mid">'
      + (j.surface || j.label ? '<span class="where">' + esc(j.surface || j.label) + '</span>' : '')
      + '<b>' + esc(j.match || '') + '</b>'
      + '<p>' + esc(j.need || '') + '</p></div>'
      + '<div class="acts">' + btn + '</div></div>';
  }

  function mdSurfaces(d) {
    var list = d.surfaces || [];
    if (!list.length) return '';
    var marking = d.sport === 'squash' ? 'MARKING' : 'SCORER';
    return '<div class="md-sh"><h3>EVERY ' + esc((d.surface_word || 'court').toUpperCase())
      + ', RIGHT NOW</h3><span class="ln"></span></div>'
      + '<div class="md-board"><div class="md-bh"><span>' + esc(Surf()) + '</span>'
      + '<span>ON NOW</span><span>NEXT UP</span><span>' + marking + '</span></div>'
      + list.map(function (x) {
          var on = x.on_now, nx = x.next;
          var edge = on ? ' e-live' : ((nx && nx.late) ? ' e-late' : '');
          return '<div class="md-row' + edge + '">'
            + '<div class="c"><b>' + esc(x.name || '') + '</b><s>'
              + esc(x.screen_code || '') + '&nbsp;&nbsp;' + (x.played || 0) + ' of ' + (x.matches || 0) + '</s></div>'
            + '<div class="on">' + (on
                ? '<u>' + esc(on.match || '') + '</u><s>' + esc([on.label, on.score].filter(Boolean).join(', ')) + '</s>'
                : '<u class="free">' + esc(Surf()) + ' free</u>') + '</div>'
            + '<div class="nx">' + (nx
                /* "TBD v TBD" is how a slot reads before it has anybody in it,
                   whether that is a knockout waiting on the round before or a
                   division nobody has entered. Either way it is not a name. */
                ? '<u>' + esc([nx.at, (/^TBD v TBD$/.test(nx.match || '') ? 'Not decided yet' : nx.match)]
                    .filter(Boolean).join('  ')) + '</u>'
                  + '<s' + (nx.late ? ' class="bad"' : '') + '>'
                  + esc(nx.late ? 'Past its time, nobody on yet' : (nx.label || '')) + '</s>'
                : '<u class="free">Nothing more today</u>') + '</div>'
            + '<div class="rf">' + (x.marks_next
                ? '<u>' + esc(x.marks_next) + '</u><s>lost the last one, marks next</s>'
                : (x.scorer ? '<u>' + esc(x.scorer) + '</u>' : '<u class="none">Nobody</u>')) + '</div>'
            + '</div>';
        }).join('') + '</div>';
  }

  function mdDivisions(d) {
    var v = d.divisions || [];
    if (!v.length) return '';
    return '<div class="md-sh"><h3>DIVISIONS</h3><span class="ln"></span></div>'
      + '<div class="md-divs">' + v.map(function (x, i) {
          return '<div class="md-dv tg-d' + (i % 10) + '">'
            + '<div class="r1"><i></i><b>' + esc(x.division || '') + '</b>'
            + '<span class="' + (x.ready ? 'ok' : 'no') + '">'
            + (x.ready ? 'RUNNING' : 'NOBODY IN IT') + '</span></div>'
            + '<div class="mt">'
            + '<div><u' + (x.ready ? '' : ' class="bad"') + '>' + (x.entrants || 0) + '</u><s>IN</s></div>'
            + '<div><u>' + (x.matches || 0) + '</u><s>MATCHES</s></div>'
            + '<div><u>' + (x.today || 0) + '</u><s>TODAY</s></div>'
            + '</div>' + mdPips(x) + mdNote(x) + '</div>';
        }).join('') + '</div>';
  }

  /* SEE THE WHOLE THING BEFORE ANYBODY HAS ENTERED IT. The organiser sets the
     format, the divisions, the surfaces and the times, then asks for a
     simulation: temporary sides go in, the draw is built, and the schedule,
     the app, the board and the graphics all show the real thing. Clearing it
     takes every invented row back out and leaves the slots exactly as set. */
  function mdSimStrip(d) {
    var empty = (d.divisions || []).filter(function (x) { return !x.ready; }).length;
    if (S.mdClearAsk) {
      return '<div class="md-sim">' + ic('warning') + '<div class="g">'
        + '<b>Clear the simulation?</b>'
        + '<p>Every invented ' + esc(nouns(null).many) + ', player and result comes out. '
        + 'Your days, times and ' + esc(surfWord(true)) + ' are left exactly as they are, '
        + 'and anything really entered is never touched.</p></div>'
        + '<div class="acts"><button class="lg-btn" onclick="FFPTourn.mdSimCancel()">Keep it</button>'
        + '<button class="lg-btn pri" onclick="FFPTourn.mdSimClear()">Yes, clear it</button></div></div>';
    }
    if (d.simulated) {
      return '<div class="md-sim">' + ic('science') + '<div class="g">'
        + '<b>This event is holding a simulation</b>'
        + '<p>The sides on this screen were invented so you can see how the day reads. '
        + 'Play it out to watch the draw fill and the graphics follow, then clear it before you open entries.</p></div>'
        + '<div class="acts"><button class="lg-btn" onclick="FFPTourn.mdSimPlay()">Play it out</button>'
        + '<button class="lg-btn" onclick="FFPTourn.mdSimAsk()">Clear it</button></div></div>';
    }
    if (!empty) return '';
    return '<div class="md-sim">' + ic('science') + '<div class="g">'
      + '<b>' + empty + (empty === 1 ? ' division has' : ' divisions have') + ' nobody in them</b>'
      + '<p>Fill them with temporary ' + esc(nouns(null).many)
      + ' and the draw, the schedule, the app and the graphics all come to life, '
      + 'so you can check the whole day before you open entries.</p></div>'
      + '<div class="acts"><button class="lg-btn pri" onclick="FFPTourn.mdSimFill()">Simulate the event</button></div></div>';
  }

  /* ONE MARK PER MATCH, filled when it is played. A thin bar at 1 of 48 says
     nothing; 48 marks with one filled says it exactly. */
  function mdPips(x) {
    var total = x.matches || 0;
    if (!total || total > 120) return '';
    var done = x.played || 0, out = [];
    for (var i = 0; i < total; i++) {
      out.push('<i class="' + (i < done ? 'won' : (x.ready ? 'todo' : '')) + '"></i>');
    }
    return '<div class="pips">' + out.join('') + '</div>';
  }
  function mdNote(x) {
    if (!x.ready) {
      return '<div class="nt bad">' + (x.matches || 0)
        + ' matches are booked and not one entry is in. Add them or hand the slots back.</div>';
    }
    var left = (x.matches || 0) - (x.played || 0);
    return '<div class="nt">' + (x.entrants || 0) + ' in, ' + (x.played || 0)
      + ' played, ' + left + ' to go.</div>';
  }

  function mdDay(delta) { S.mdDay = mdShiftDay(S.mdDay, delta); renderTab(); }
  function mdPick(day) { S.mdDay = day; renderTab(); }
  function mdRefresh() { renderTab(); }
  function mdGo(id) { S.tab = 'schedule'; S.schedOpen = id; openMatch(id); }
  function mdSimAsk() { S.mdClearAsk = true; renderTab(); }
  function mdSimCancel() { S.mdClearAsk = false; renderTab(); }

  async function mdSimFill() {
    if (S.mdBusy) return; S.mdBusy = true;
    var r; try { r = await sb().rpc('tourn_sim_fill', { p_event: S.eventId }); }
    catch (e) { r = { error: e }; }
    S.mdBusy = false;
    if (!r || r.error) { toast('Could not simulate', 'error'); return; }
    var d = r.data || {};
    if (!d.entrants_added) { toast('Nothing to simulate, every division already has entries', 'error'); return; }
    toast(d.entrants_added + ' temporary ' + nouns(null).many
      + (d.players_added ? ' and ' + d.players_added + ' players' : '') + ' put in', 'success');
    if (S.detail && S.detail.event) S.detail.event.sim_at = new Date().toISOString();
    renderTab();
  }
  async function mdSimPlay() {
    if (S.mdBusy) return; S.mdBusy = true;
    var r; try { r = await sb().rpc('tourn_sim_play', { p_event: S.eventId }); }
    catch (e) { r = { error: e }; }
    S.mdBusy = false;
    if (!r || r.error) { toast('Could not play it out', 'error'); return; }
    var d = r.data || {};
    toast((d.played || 0) + ((d.played === 1) ? ' match played' : ' matches played'), 'success');
    renderTab();
  }
  async function mdSimClear() {
    if (S.mdBusy) return; S.mdBusy = true;
    var r; try { r = await sb().rpc('tourn_sim_clear', { p_event: S.eventId }); }
    catch (e) { r = { error: e }; }
    S.mdBusy = false; S.mdClearAsk = false;
    if (!r || r.error) { toast('Could not clear it', 'error'); return; }
    var d = r.data || {};
    toast(d.cleared ? (d.entrants_removed || 0) + ' temporary entries taken out' : 'There was nothing to clear',
          d.cleared ? 'success' : 'error');
    if (S.detail && S.detail.event) S.detail.event.sim_at = null;
    renderTab();
  }

  function renderSponsors(host) {
    if (window.FFPSponsors) window.FFPSponsors.render(host, { scope: 'tourn', eventId: S.eventId,
      // the editor needs the clubs so it can offer a board per team.
      // A board belongs to ONE owner: the event's own, or a club's.
      entrants: (S._entrants || []) });
    else host.innerHTML = '<div style="padding:20px;color:#8a99a8;">Sponsor editor unavailable.</div>';
  }

  // ---------- shared helpers (rounds / logos / venues) ----------
  var MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  var ROLES = ['Referee','Assistant referee','Umpire','Line judge','Chair umpire','Timekeeper','Scorer','TMO'];
  function fmtDay(d) { return DOW[d.getDay()] + ' ' + d.getDate() + ' ' + MON[d.getMonth()]; }
  function fmtTime(d) { return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }
  function crest(o) {
    o = o || {}; var nm = o.name || 'TBD';
    if (o.logo) return '<span class="lg-crest" style="background-image:url(\'' + esc(o.logo) + '\')"></span>';
    return '<span class="lg-crest">' + esc(nm.replace(/[^A-Za-z ]/g, '').split(' ').map(function (w) { return w[0] || ''; }).join('').slice(0, 2).toUpperCase() || '?') + '</span>';
  }
  function roundRange(list) {
    var ds = list.map(function (f) { return f.scheduled_at ? new Date(f.scheduled_at) : null; }).filter(Boolean);
    if (!ds.length) return 'Not scheduled';
    var mn = new Date(Math.min.apply(null, ds)), mx = new Date(Math.max.apply(null, ds));
    if (mn.toDateString() === mx.toDateString()) return fmtDay(mn) + ', 1 day';
    var days = Math.round((new Date(mx.getFullYear(), mx.getMonth(), mx.getDate()) - new Date(mn.getFullYear(), mn.getMonth(), mn.getDate())) / 86400000) + 1;
    var span = (mn.getMonth() === mx.getMonth()) ? (mn.getDate() + '–' + mx.getDate() + ' ' + MON[mx.getMonth()]) : (mn.getDate() + ' ' + MON[mn.getMonth()] + ' – ' + mx.getDate() + ' ' + MON[mx.getMonth()]);
    return span + ', ' + days + ' days';
  }
  function surfaceOpts(fields, selId) {
    var groups = {}; var order = [];
    (fields || []).forEach(function (x) { var g = x.venue || 'Other'; if (!groups[g]) { groups[g] = []; order.push(g); } groups[g].push(x); });
    return '<option value="">Surface…</option>' + order.map(function (g) {
      return '<optgroup label="' + esc(g) + '">' + groups[g].map(function (x) { return '<option value="' + x.id + '"' + (selId && x.id === selId ? ' selected' : '') + '>' + esc(x.name) + '</option>'; }).join('') + '</optgroup>';
    }).join('');
  }
  function togRound(btn) { btn.classList.toggle('collapsed'); var b = btn.nextElementSibling; if (b && b.classList.contains('lg-rbody')) b.classList.toggle('hidden'); }
  // ── COURT SCOREBOARD ───────────────────────────────────────────────────
  // A scoreboard is set up by typing an address into a TV's browser with a
  // remote, so the court's five-character code is the thing that matters. The
  // full /display/<uuid> link is no use to anyone holding a remote control.
  var SCREEN_BASE = 'scoreboard.findfitpeople.com';  // the ONE board host, as the courts
                                                     // and leagues panels already use
  var GFX_BASE    = 'gfx.findfitpeople.com';     // the broadcast graphics source, same code, all day
  /* THE WHOLE DAY ON ONE TV, the screen people walk up to to find their
     match. Not a court board: that is one court, mounted on it. */
  function oopCode() {
    return ((S.detail && S.detail.event && S.detail.event.screen_code) || '').toUpperCase();
  }
  function oopUrl(day) {
    if (!day && oopCode()) return SCREEN_BASE + '/' + oopCode();
    return SCREEN_BASE + '/display/schedule/' + S.eventId + (day ? '?day=' + day : '');
  }
  function oopNote(day) {
    return day
      ? 'Held on that one day, whatever the date is. It brings itself up to '
        + 'date every twenty seconds and nobody has to sign in.'
      : (oopCode()
        ? 'Five characters, typed straight in with the remote. It shows the day '
          + 'it is on, keeps itself up to date, and turns between morning and '
          + 'afternoon on its own. Nobody has to sign in.'
        : 'It shows the day it is on, brings itself up to date every twenty '
          + 'seconds, and turns between morning and afternoon on its own. '
          + 'Nobody has to sign in.');
  }
  function oopCard() {
    if (!S.eventId) return '';
    return '<div class="lg-venue tg-oop"><div class="lg-vh">'
      + '<span class="lg-vpin"><span class="ms">calendar_view_week</span></span>'
      + '<div class="g"><b>Order of play, the whole tournament on one screen</b>'
      + '<span class="addr">' + esc(oopUrl(null)) + '</span></div>'
      + (oopCode()
        ? '<button class="lg-scrbtn perm" title="The address for this board" '
          + 'onclick="FFPTourn.oopPanel()"><span class="ms">connected_tv</span>'
          + esc(oopCode()) + '</button>'
        : '<button class="lg-btn" onclick="FFPTourn.oopPanel()">' + ic('connected_tv')
          + 'Get the address</button>')
      + '</div></div>';
  }
  /* Same sheet as a court board, so the two read as one thing. */
  function oopPanel() {
    var old = document.getElementById('tg-scr'); if (old) old.remove();
    var days = eventDays();
    var bk = document.createElement('div');
    bk.id = 'tg-scr'; bk.className = 'lg-cfm';
    bk.innerHTML = '<div class="lg-cfm-in lg-scr">'
      + '<span class="ms lg-cfm-ic" style="color:var(--ffp-blue)">calendar_view_week</span>'
      + '<div class="lg-cfm-t">Order of play</div>'
      + '<div class="lg-scrlab">On the TV, open a browser and go to</div>'
      + '<div class="lg-scrurl" id="tg-scrurl">' + urlHtml(oopUrl(null)) + '</div>'
      + '<div class="lg-scrnote" id="tg-oopnote">' + esc(oopNote(null)) + '</div>'
      + (days.length > 1
        ? '<div class="lg-scrlab">Which day it shows</div>'
          + '<div class="tg-oopdays" id="tg-oopdays">'
          + '<button class="lg-btn sm gold" data-d="" onclick="FFPTourn.oopDay(\'\')">'
          +   'Today, whichever it is</button>'
          + days.map(function (d) {
              return '<button class="lg-btn sm" data-d="' + d + '" onclick="FFPTourn.oopDay(\''
                   + d + '\')">' + esc(dayShortYmd(d)) + '</button>'; }).join('')
          + '</div>'
        : '')
      + '<div class="lg-scrsteps">'
      +   '<div><b>1</b><span>Open the browser on the TV, or on a stick plugged into it.</span></div>'
      +   '<div><b>2</b><span>Type that address and leave it. The board keeps its own screen awake.</span></div>'
      +   '<div><b>3</b><span>' + Surf(true) + ' run down the side and the times across the top, '
      +     'so anyone can find their match from across the room.</span></div>'
      + '</div>'
      + '<div class="lg-cfm-a"><button class="lg-btn ghost" id="tg-oop-x">Close</button>'
      +   '<button class="lg-btn" id="tg-oop-c">' + ic('content_copy') + 'Copy the address</button>'
      +   '<button class="lg-btn pri" id="tg-oop-o">' + ic('open_in_new') + 'Open it here</button>'
      + '</div></div>';
    document.body.appendChild(bk);
    bk.querySelector('#tg-oop-x').onclick = function () { bk.remove(); };
    bk.querySelector('#tg-oop-c').onclick = function () { copyScreen('tg-scrurl'); };
    bk.querySelector('#tg-oop-o').onclick = function () { openScreen('tg-scrurl'); };
  }
  /* The address is shown without its scheme, the way it gets typed into a
     TV. Opening it needs the scheme back, or the browser reads it as a path
     off the portal and lands on a 404. */
  function openScreen(id) {
    var el = document.getElementById(id); if (!el) return;
    var t = String(el.textContent || '').trim(); if (!t) return;
    window.open(/^https?:/.test(t) ? t : 'https://' + t, '_blank', 'noopener');
  }
  function oopDay(d) {
    var el = document.getElementById('tg-scrurl'); if (!el) return;
    el.innerHTML = urlHtml(oopUrl(d));
    /* the address is a different SHAPE for a pinned day, so what is said
       under it has to change with it rather than describe the other one */
    el.className = 'lg-scrurl' + (d ? ' gfx' : '');
    var nt = document.getElementById('tg-oopnote');
    if (nt) nt.textContent = oopNote(d);
    var row = document.getElementById('tg-oopdays'); if (!row) return;
    Array.prototype.forEach.call(row.children, function (b) {
      if (b.getAttribute('data-d') === (d || '')) b.classList.add('gold');
      else b.classList.remove('gold');
    });
  }
  function screenPanel(code, court, permanent) {
    var url = SCREEN_BASE + '/' + code;
    var old = document.getElementById('tg-scr'); if (old) old.remove();
    var bk = document.createElement('div'); bk.id = 'tg-scr'; bk.className = 'lg-cfm';
    bk.innerHTML = '<div class="lg-cfm-in lg-scr">'
      + '<span class="ms lg-cfm-ic" style="color:var(--ffp-blue)">cast</span>'
      + '<div class="lg-cfm-t">Scoreboard, ' + esc(court) + '</div>'
      + '<div class="lg-scrlab">On the TV, open a browser and go to</div>'
      + '<div class="lg-scrurl" id="tg-scrurl">' + urlHtml(url) + '</div>'
      + '<div class="lg-scrnote">' + (permanent ? 'This is the ' + surfWord() + '\'s own screen. The code never changes, and it shows every match played on this ' + surfWord() + '.' : 'This screen is for this event only.') + '</div>'
      + '<div class="lg-scrlab">Streaming this ' + surfWord() + '? The graphics source is</div>'
      + '<div class="lg-scrurl gfx" id="tg-gfxurl">' + urlHtml(GFX_BASE + '/f/' + code) + '</div>'
      + '<div class="lg-scrnote">Paste that into OBS, vMix or a YoloBox once, at 1920x1080. It follows the '
      +   surfWord() + ' all day on its own, so it picks up each match as it starts.</div>'
      + '<div class="lg-scrsteps">'
      +   '<div><b>1</b><span>Open the browser on the TV, or on a stick plugged into it.</span></div>'
      +   '<div><b>2</b><span>Type that address and leave it. The board keeps its own screen awake.</span></div>'
      +   '<div><b>3</b><span>Casting from a tablet instead? Tap the board, turn on 16:9, then full screen.</span></div>'
      + '</div>'
      + '<div class="lg-cfm-a"><button class="lg-btn ghost" id="tg-scr-x">Close</button>'
      +   '<button class="lg-btn" id="tg-scr-c">' + ic('content_copy') + 'Copy TV address</button>'
      +   '<button class="lg-btn" id="tg-gfx-c">' + ic('content_copy') + 'Copy graphics</button>'
      +   '<button class="lg-btn pri" id="tg-scr-o">' + ic('open_in_new') + 'Open the board</button></div>'
      + '</div>';
    document.body.appendChild(bk);
    bk.querySelector('#tg-scr-x').onclick = function () { bk.remove(); };
    bk.querySelector('#tg-scr-c').onclick = function () { copyScreen('tg-scrurl'); };
    bk.querySelector('#tg-gfx-c').onclick = function () { copyScreen('tg-gfxurl'); };
    // look at the board yourself, without setting up a TV first
    bk.querySelector('#tg-scr-o').onclick = function () { openScreen('tg-scrurl'); };
  }
  function urlHtml(u) {
    u = String(u || '');
    var i = u.lastIndexOf('/');
    var tail = i < 0 ? '' : u.slice(i + 1);
    if (!tail || tail.length > 12) return esc(u);
    return esc(u.slice(0, i + 1)) + '<em class="seg">' + esc(tail) + '</em>';
  }
  function copyScreen(id) {
    var el = document.getElementById(id); if (!el) return;
    var t = el.textContent || '';
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t);
      else {
        var ta = document.createElement('textarea');
        ta.value = t; document.body.appendChild(ta); ta.select();
        document.execCommand('copy'); document.body.removeChild(ta);
      }
      toast('Address copied', 'success');
    } catch (e) { toast('Could not copy, type it instead', 'error'); }
  }

  function roundHead(label, count, range) {
    return '<div class="lg-rnd" onclick="FFPTourn.togRound(this)"><span class="ms chev">expand_more</span><span class="rt">' + esc(label) + '</span><span class="rc">' + count + (count === 1 ? ' match' : ' matches') + '</span><span class="sp"></span><span class="rd"><span class="ms" style="font-size:14px;vertical-align:-2px">event</span> ' + esc(range) + '</span></div>';
  }
  function entOpts(sel, skip) {
    return '<option value="">Select…</option>' + (S._entrants || []).filter(function (e) { return e.id !== skip; }).map(function (e) { return '<option value="' + e.id + '"' + (sel === e.id ? ' selected' : '') + '>' + esc(e.name) + '</option>'; }).join('');
  }
  async function loadEntrantsArr() { var r; try { r = await sb().rpc('tourn_roster', { p_division: S.divId }); } catch (e) { r = null; } S._entrants = (r && r.data) || []; return S._entrants; }

  // ---------- OFFICIALS & CREW ----------
  /* TWO different kinds of person, and the panel must never let them read as
     one list (Grant, locked).
       OFFICIALS  an FFP account OR just a name and photo. Picked per match on
                  the Schedule tab. Nothing opens on their phone.
       CREW       Scorers and Livestream GFX. They sign in to an FFP app, so
                  they can ONLY be picked from real FFP accounts - lt_official_add
                  raises crew_needs_ffp_account otherwise - and each one carries
                  an access scope: the whole event, or chosen days / matches. */
  var CREW_KINDS = [['scorer', 'Scorers', 'opens FFP Scorer'],
                    ['livestream', 'Livestream GFX', 'opens FFP GFX']];
  function isCrewRole(r) { r = String(r || '').toLowerCase(); return r === 'scorer' || r === 'both' || r === 'livestream'; }
  function crewKind(r) { return String(r || '').toLowerCase() === 'livestream' ? 'livestream' : 'scorer'; }
  function fmtDay(s) {
    try { return new Date(String(s) + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }); }
    catch (e) { return String(s); }
  }
  function accessLabel(o) {
    if (String(o.access || 'full') !== 'limited') return 'Full access';
    var d = (o.days || []).length, m = (o.matches || []).length;
    if (d && !m) return d === 1 ? fmtDay(o.days[0]) + ' only' : d + ' days only';
    if (m && !d) return m === 1 ? '1 match only' : m + ' matches only';
    if (d || m) return 'Limited';
    return 'Limited (nothing picked)';
  }
  function accSel(o) {
    var lim = String(o.access || 'full') === 'limited';
    return '<select class="lg-sel og-acc' + (lim ? ' on' : '') + '" onchange="FFPTourn.setAccess(\'' + o.id + '\',this.value)">'
      + '<option value="full"' + (lim ? '' : ' selected') + '>Full access</option>'
      + '<option value="limited"' + (lim ? ' selected' : '') + '>' + esc(lim ? accessLabel(o) : 'Limited…') + '</option>'
      + '</select>';
  }
  function ofAvatar(o) {
    return '<span class="lg-av" style="' + (o.photo ? 'background-image:url(\'' + esc(o.photo) + '\')' : '') + '">'
      + (o.photo ? '' : esc(String(o.name || o.email || '?').slice(0, 1).toUpperCase())) + '</span>';
  }

  async function renderOfficials(host) {
    host.innerHTML = '<div id="tg-ofwrap"><div class="lg-empty">Loading…</div></div>';
    var r; try { r = await sb().rpc('lt_officials_list', { p_scope: 'tourn', p_event: S.eventId }); } catch (e) { r = { error: e }; }
    var rows = (r && r.data) || []; S._officials = rows;
    try { var mg = await sb().rpc('lt_team_managers_list', { p_scope: 'tourn', p_event: S.eventId }); S._mgrs = (mg && mg.data) || []; } catch (e) { S._mgrs = []; }
    try { var tl = await sb().rpc('lt_team_list', { p_scope: 'tourn', p_event: S.eventId }); S._mgTeams = (((tl && tl.data) || {}).teams) || []; } catch (e) { S._mgTeams = []; }
    var wrap = document.getElementById('tg-ofwrap'); if (!wrap) return;
    wrap.innerHTML = poolHtml(rows.filter(function (o) { return !isCrewRole(o.role); }))
      + '<div class="og-crewwrap">'
      + '<div class="og-lead">' + ic('smartphone') + '<div><b>Crew</b><span>Picked from FFP members only. Set how much of the event each one can reach.</span></div></div>'
      + CREW_KINDS.map(function (k) {
          return crewSecHtml(k, rows.filter(function (o) { return isCrewRole(o.role) && crewKind(o.role) === k[0]; }));
        }).join('')
      + '</div>'
      + mgrSecHtml();
  }

  /* -- TEAM MANAGERS -----------------------------------------------------
     One row per ASSIGNMENT, not per person: the same member appears once for
     every team they manage, because that is exactly what the permission is.
     lt_member_search hands back a member id and a MASKED email, so the write
     is lt_team_manager_assign (member id in) and NOT the email-keyed
     lt_team_manager_add -- the dashboard never sees a real address. */
  function mgrSecHtml() {
    var open = !!S.mgAdd, rows = S._mgrs || [];
    return '<div class="og-sec og-mgr">'
      + '<div class="og-hd">' + ic('badge')
      + '<div class="t"><b>Team managers</b><span>An FFP member who can set one team&rsquo;s sheet, and nobody else&rsquo;s.</span></div>'
      + '<button class="lg-btn' + (open ? ' on' : '') + '" onclick="FFPTourn.mgOpen(' + (open ? 'false' : 'true') + ')">'
      + ic(open ? 'close' : 'add') + (open ? 'Cancel' : 'Add') + '</button></div>'
      + (open ? mgrAddHtml() : '')
      + (rows.length ? rows.map(mgrRowHtml).join('') : '<div class="lg-empty">No team managers yet.</div>')
      + '<div class="og-foot">They set their own team sheet in the FFP app. They cannot score, and they cannot touch another team.</div>'
      + '</div>';
  }

  function mgrRowHtml(m) {
    var bg = m.photo_url ? 'background-image:url(\'' + esc(m.photo_url) + '\')' : '';
    return '<div class="lg-row"><span class="lg-av" style="' + bg + '">'
      /* two initials, as the approved row shows -- not the one letter the
         officials avatar uses, where a pool entry may be a single name */
      + (m.photo_url ? '' : esc(String(m.name || '?').trim().split(/\s+/).slice(0, 2)
          .map(function (w) { return w[0] || ''; }).join('').toUpperCase())) + '</span>'
      + '<div class="g"><b>' + esc(m.name || 'Member') + '</b><span>' + esc(m.email || 'FFP member') + '</span></div>'
      + '<span class="og-team">' + ic('groups') + '<b>' + esc(m.team || 'Team') + '</b></span>'
      + '<span class="ms act" title="Remove" onclick="FFPTourn.mgRemove(\'' + m.id + '\')">close</span></div>';
  }

  function mgrAddHtml() {
    var ts = S._mgTeams || [];
    return '<div class="lg-offadd"><div class="og-two">'
      + '<div class="f"><label>FFP member</label><div class="lg-offsrch">'
      + '<input class="lg-in" id="tg-root-mgq" autocomplete="off" placeholder="Search FFP members by name or email" oninput="FFPTourn.mgSearch(this.value)">'
      + '<div id="tg-root-mgres" class="lg-offres"></div></div></div>'
      + '<div class="f"><label>Team they manage</label><select class="lg-sel" onchange="FFPTourn.mgTeam(this.value)">'
      + '<option value="">Choose a team&hellip;</option>'
      + ts.map(function (t) {
          return '<option value="' + t.entrant_id + '"' + (S.mgEnt === t.entrant_id ? ' selected' : '') + '>'
            + esc(t.name) + (t.division ? ' (' + esc(t.division) + ')' : '') + '</option>';
        }).join('')
      + '</select></div>'
      + '<button class="lg-btn pri" onclick="FFPTourn.mgAssign()">' + ic('check') + 'Assign</button>'
      + '</div><div class="og-note">' + ic('info')
      + 'They must already have an FFP account. A manager names real people on a sheet, so we know who they are before they can.</div></div>';
  }

  function mgOpen(on) { S.mgAdd = !!on; S.mgSel = null; S.mgEnt = null; S._mgRes = []; renderTab(); }
  function mgTeam(v) { S.mgEnt = v || null; }

  var _mgTmr;
  function mgSearch(q) {
    S.mgSel = null;
    clearTimeout(_mgTmr);
    if (!q || q.trim().length < 2) {
      S._mgRes = [];
      var b0 = document.getElementById('tg-root-mgres'); if (b0) b0.innerHTML = '';
      return;
    }
    _mgTmr = setTimeout(async function () {
      var r; try { r = await sb().rpc('lt_member_search', { p_q: q.trim() }); } catch (e) { r = null; }
      S._mgRes = (r && r.data) || [];
      var b = document.getElementById('tg-root-mgres'); if (!b) return;
      b.innerHTML = S._mgRes.length ? S._mgRes.map(function (m) {
        return '<button type="button" class="lg-offopt" onclick="FFPTourn.mgPick(\'' + m.id + '\')">'
          + '<span class="av" style="' + (m.photo ? 'background-image:url(\'' + esc(m.photo) + '\')' : '') + '"></span>'
          + '<span class="g"><b>' + esc(m.name) + '</b><span>' + esc([m.city, m.email_hint].filter(Boolean).join(', ')) + '</span></span>'
          + '<span class="pk">Select</span></button>';
      }).join('') : '<div class="lg-offnone">No FFP account for that name. They register at findfitpeople.com first.</div>';
    }, 300);
  }

  function mgPick(id) {
    var m = (S._mgRes || []).find(function (x) { return x.id === id; }); if (!m) return;
    S.mgSel = { id: m.id, name: m.name };
    var i = document.getElementById('tg-root-mgq'); if (i) i.value = m.name;
    var b = document.getElementById('tg-root-mgres');
    if (b) b.innerHTML = '<div class="lg-offpicked">' + ic('check') + esc(m.name) + ' selected</div>';
  }

  async function mgAssign() {
    if (!S.mgSel) { toast('Pick an FFP member first', 'error'); return; }
    if (!S.mgEnt) { toast('Pick the team they manage', 'error'); return; }
    var r; try {
      r = await sb().rpc('lt_team_manager_assign', { p_scope: 'tourn', p_event: S.eventId, p_entrant: S.mgEnt, p_member: S.mgSel.id });
    } catch (e) { r = { error: e }; }
    if (r && r.error) {
      var t = String(r.error.message || r.error);
      toast(/no_ffp_account/.test(t) ? 'That person has no FFP account'
          : /not_owner/.test(t) ? 'Only the organiser can assign managers'
          : /entrant_not_in_this_event/.test(t) ? 'That team is not in this event'
          : 'Could not assign', 'error');
      return;
    }
    S.mgAdd = false; S.mgSel = null; S.mgEnt = null; S._mgRes = [];
    toast('Manager assigned', 'success'); renderTab();
  }

  async function mgRemove(id) {
    var r; try { r = await sb().rpc('lt_team_manager_remove', { p_id: id }); } catch (e) { r = { error: e }; }
    if (r && r.error) { toast('Could not remove', 'error'); return; }
    toast('Removed', 'success'); renderTab();
  }

  function poolHtml(rows) {
    var open = S.ofMode === 'pool';
    return '<div class="og-sec">'
      + '<div class="og-hd">' + ic('shield') + '<div class="t"><b>Officials</b><span>An FFP account, or just a name and photo. Picked per match on the Schedule tab.</span></div>'
      + '<button class="lg-btn" onclick="FFPTourn.openAdd(' + (open ? 'null' : "'pool'") + ')">' + ic(open ? 'close' : 'add') + (open ? 'Cancel' : 'Add') + '</button></div>'
      + (open ? addFormHtml('pool') : '')
      + (rows.length
          ? '<div class="og-pool">' + rows.map(function (o) {
              return '<span class="og-chip' + (o.member_id ? '' : ' noacct') + '">' + ofAvatar(o)
                + '<b>' + esc(o.name || o.email || 'Official') + '</b>'
                + '<em class="ms" title="Photo" onclick="FFPTourn.ofPhoto(\'' + o.id + '\')">photo_camera</em>'
                + '<em class="ms" onclick="FFPTourn.removeOfficial(\'' + o.id + '\')">close</em></span>';
            }).join('') + '</div>'
          : '<div class="lg-empty">No officials yet.</div>')
      + '<div class="og-foot">They appear on the match sheet and the broadcast graphics. No app.</div>'
      + '</div>';
  }

  function crewSecHtml(k, rows) {
    var open = S.ofMode === k[0];
    return '<div class="og-crew">'
      + '<div class="og-ch"><b>' + esc(k[1]) + '</b><span class="og-app">' + esc(k[2]) + '</span><span class="sp"></span>'
      + '<button class="lg-btn' + (open ? ' on' : '') + '" onclick="FFPTourn.openAdd(' + (open ? 'null' : "'" + k[0] + "'") + ')">'
      + ic(open ? 'close' : 'add') + (open ? 'Cancel' : 'Add') + '</button></div>'
      + (open ? addFormHtml(k[0]) : '')
      + (rows.length ? rows.map(function (o) {
          return '<div class="lg-row">' + ofAvatar(o)
            + '<div class="g"><b>' + esc(o.name || 'Crew') + '</b><span>' + esc(o.email || 'FFP member') + '</span></div>'
            + accSel(o)
            + '<span class="ms act" onclick="FFPTourn.removeOfficial(\'' + o.id + '\')">close</span></div>'
            + (S.accFor === o.id ? accPickerHtml(o) : '');
        }).join('') : '<div class="lg-empty">Nobody yet.</div>')
      + '</div>';
  }

  /* One add form, reused. For the pool a typed name is enough; for crew the
     only way through is picking a real FFP member. */
  function addFormHtml(mode) {
    var crew = mode !== 'pool';
    return '<div class="lg-offadd"><div class="lg-offsrch">'
      + '<input class="lg-in" id="tg-ofname" autocomplete="off" placeholder="'
      + (crew ? 'Search FFP members by name or email' : 'Search FFP members, or type a new name')
      + '" oninput="FFPTourn.ofSearch(this.value)"><div id="tg-ofres" class="lg-offres"></div></div>'
      + (crew ? '<div class="og-note">' + ic('info') + 'They must already have an FFP account. Someone without one registers at findfitpeople.com first.</div>'
              : '<div class="lg-offrow"><button class="lg-btn pri" onclick="FFPTourn.addPoolOfficial()">' + ic('add') + 'Add to the pool</button></div>')
      + '</div>';
  }

  function openAdd(mode) { S.ofMode = mode || null; S._ofSel = null; S._ofRes = []; S.accFor = null; renderTab(); }

  var _ofTmr;
  function ofSearch(q) {
    S._ofSel = null;
    clearTimeout(_ofTmr);
    if (!q || q.trim().length < 2) { S._ofRes = []; var el0 = document.getElementById('tg-ofres'); if (el0) el0.innerHTML = ''; return; }
    _ofTmr = setTimeout(async function () {
      var r; try { r = await sb().rpc('lt_member_search', { p_q: q.trim() }); } catch (e) { r = null; }
      S._ofRes = (r && r.data) || [];
      var el = document.getElementById('tg-ofres'); if (!el) return;
      var crew = S.ofMode && S.ofMode !== 'pool';
      el.innerHTML = S._ofRes.length ? S._ofRes.map(function (m) {
        return '<button type="button" class="lg-offopt" onclick="FFPTourn.ofPick(\'' + m.id + '\')"><span class="av" style="' + (m.photo ? 'background-image:url(\'' + esc(m.photo) + '\')' : '') + '"></span><span class="g"><b>' + esc(m.name) + '</b><span>' + esc([m.city, m.email_hint].filter(Boolean).join(', ')) + '</span></span><span class="pk">' + (crew ? 'Add' : 'Select') + '</span></button>';
      }).join('') : '<div class="lg-offnone">' + (crew
        ? 'No FFP account for that name. They register at findfitpeople.com first.'
        : 'No FFP member found — you can still add this name.') + '</div>';
    }, 300);
  }

  async function ofPick(id) {
    var m = (S._ofRes || []).find(function (x) { return x.id === id; }); if (!m) return;
    if (S.ofMode && S.ofMode !== 'pool') { await addCrew(m); return; }   // crew: one tap adds
    S._ofSel = { member_id: m.id, name: m.name };
    var nmI = document.getElementById('tg-ofname'); if (nmI) nmI.value = m.name;
    var el = document.getElementById('tg-ofres'); if (el) el.innerHTML = '<div class="lg-offpicked">' + ic('check') + esc(m.name) + ' — FFP member linked</div>';
  }

  async function addCrew(m) {
    var role = S.ofMode;
    var r; try { r = await sb().rpc('lt_official_add', { p_scope: 'tourn', p_event: S.eventId, p_member: m.id, p_name: m.name, p_email: null, p_role: role }); }
    catch (e) { r = { error: e }; }
    if (r && r.error) {
      toast(/crew_needs_ffp_account/.test(String(r.error.message || r.error)) ? 'That person has no FFP account' : 'Could not add', 'error');
      return;
    }
    S.ofMode = null; S._ofSel = null; S._ofRes = [];
    toast('Added', 'success'); renderTab();
  }

  async function addPoolOfficial() {
    var sel = S._ofSel, nm = ((document.getElementById('tg-ofname') || {}).value || '').trim();
    if (!sel && !nm) return;
    var r; try {
      r = await sb().rpc('lt_official_add', sel && sel.member_id
        ? { p_scope: 'tourn', p_event: S.eventId, p_member: sel.member_id, p_name: sel.name || nm, p_email: null, p_role: 'official' }
        : { p_scope: 'tourn', p_event: S.eventId, p_member: null, p_name: nm, p_email: null, p_role: 'official' });
    } catch (e) { r = { error: e }; }
    if (r && r.error) { toast('Could not add', 'error'); return; }
    S.ofMode = null; S._ofSel = null; S._ofRes = [];
    toast('Added', 'success'); renderTab();
  }

  // ---- access scope ----
  async function setAccess(id, val) {
    if (val === 'full') {
      var r; try { r = await sb().rpc('lt_official_set_access', { p_id: id, p_access: 'full', p_days: null, p_matches: null }); } catch (e) { r = { error: e }; }
      if (r && r.error) { toast('Could not update', 'error'); return; }
      S.accFor = null; toast('Full access', 'success'); renderTab(); return;
    }
    var o = (S._officials || []).find(function (x) { return x.id === id; }) || {};
    S.accFor = id;
    S.accDays = (o.days || []).slice();
    S.accMatches = (o.matches || []).slice();
    if (!S._days) {
      try { var d = await sb().rpc('lt_event_days', { p_scope: 'tourn', p_event: S.eventId }); S._days = (d && d.data) || []; } catch (e) { S._days = []; }
      try { var mm = await sb().rpc('lt_event_matches', { p_scope: 'tourn', p_event: S.eventId }); S._matches = (mm && mm.data) || []; } catch (e) { S._matches = []; }
    }
    renderTab();
  }
  function accPickerHtml(o) {
    var days = S._days || [], ms = S._matches || [];
    return '<div class="og-pick">'
      + '<div class="og-pickh">What can ' + esc((o.name || 'they').split(' ')[0]) + ' reach?</div>'
      + (days.length ? '<div class="og-pl">Days</div>' + days.map(function (d) {
          var on = (S.accDays || []).indexOf(d.day) >= 0;
          return '<label class="og-opt"><input type="checkbox"' + (on ? ' checked' : '') + ' onchange="FFPTourn.accDay(\'' + d.day + '\')"><span>' + esc(fmtDay(d.day)) + '</span><em>' + d.n + ' matches</em></label>';
        }).join('') : '')
      + (ms.length ? '<div class="og-pl">Or single matches</div>' + ms.slice(0, 60).map(function (m) {
          var on = (S.accMatches || []).indexOf(m.id) >= 0;
          return '<label class="og-opt"><input type="checkbox"' + (on ? ' checked' : '') + ' onchange="FFPTourn.accMatch(\'' + m.id + '\')"><span>' + esc(m.home + ' v ' + m.away) + '</span><em>' + esc(m.division || '') + '</em></label>';
        }).join('') : '')
      + '<div class="og-pickb"><button class="lg-btn pri" onclick="FFPTourn.accSave()">' + ic('check') + 'Save access</button>'
      + '<button class="lg-btn" onclick="FFPTourn.accCancel()">Cancel</button></div></div>';
  }
  function accDay(d) { S.accDays = S.accDays || []; var i = S.accDays.indexOf(d); if (i >= 0) S.accDays.splice(i, 1); else S.accDays.push(d); }
  function accMatch(id) { S.accMatches = S.accMatches || []; var i = S.accMatches.indexOf(id); if (i >= 0) S.accMatches.splice(i, 1); else S.accMatches.push(id); }
  function accCancel() { S.accFor = null; renderTab(); }
  async function accSave() {
    var id = S.accFor; if (!id) return;
    if (!(S.accDays || []).length && !(S.accMatches || []).length) { toast('Pick at least one day or match', 'error'); return; }
    var r; try {
      r = await sb().rpc('lt_official_set_access', { p_id: id, p_access: 'limited', p_days: S.accDays || [], p_matches: S.accMatches || [] });
    } catch (e) { r = { error: e }; }
    if (r && r.error) { toast('Could not save access', 'error'); return; }
    S.accFor = null; toast('Access saved', 'success'); renderTab();
  }

  /* An official's photo. It shows beside them on the match screen in the app
     and fills their cell on the broadcast officials card. An official linked
     to an FFP account already falls back to their profile picture, so this is
     only needed for someone without one - or to override it. */
  function ofPhoto(id) {
    if (!window.FFPUpload) { toast('Uploader not ready — refresh', 'error'); return; }
    window.FFPUpload.pick({
      bucket: 'provider-logos', key: 'tgofficial-' + id + '-' + Date.now(),
      aspect: 1, outW: 400, outH: 400, title: 'Official photo (square)',
      onDone: function (url) {
        sb().rpc('lt_official_set_photo', { p_id: id, p_url: url }).then(function (r) {
          if (r && r.error) { toast(r.error.message || 'Could not save the photo', 'error'); return; }
          toast('Photo saved', 'success'); renderTab();
        });
      },
      onError: function () { toast('Upload failed', 'error'); }
    });
  }
  async function removeOfficial(id) { await sb().rpc('lt_official_remove', { p_id: id }); renderTab(); }

  // ---------- VENUES ----------
  /* THE TAB HOST IS #tg-tab. The id these three call sites looked up does not
     exist and never did, so the `|| document.body` fallback won every time, and
     renderVenues' `host.innerHTML = ...` then DELETED THE WHOLE DASHBOARD --
     sidebar, topbar, tabs -- leaving the venues panel alone on a blank page
     with no way back. It fired on "Connect a tablet" and on closing that PIN
     panel. Re-render through here. Never hand renderVenues the page body. */
  function reVenues() { var h = document.getElementById('tg-tab'); if (h) return renderVenues(h); }
  async function renderVenues(host) {
    host.innerHTML = '<div class="lg-tool"><div><div class="lg-h1" style="font-size:18px">Venues &amp; surfaces</div><div class="lg-sub">A venue can hold many ' + surfWord(true) + '</div></div><span class="sp"></span><button class="lg-btn pri" onclick="FFPTourn.addVenue()">' + ic('add') + 'Add venue</button></div>'
      + (S.venAdd ? venueEditor(null) : '') + '<div id="tg-venlist"><div class="lg-empty">Loading…</div></div>';
    var r; try { r = await sb().rpc('lt_venues_list', { p_scope: 'tourn', p_event: S.eventId }); } catch (e) { r = { error: e }; }
    var vs = (r && r.data) || []; var h2 = document.getElementById('tg-venlist');
    // The organiser's own venue courts (Partner > Courts & screens). A court
    // stood on one of them uses that court's permanent screen, so the TV on
    // the wall shows this event without being set up again.
    var mc; try { mc = await sb().rpc('vc_mine'); } catch (e) { mc = {}; }
    var mine = (mc && mc.data) || []; S._vcMine = mine;
    // Every surface on the event, including any that belongs to no venue.
    var af; try { af = await sb().rpc('lt_fields_list', { p_scope: 'tourn', p_event: S.eventId }); } catch (e) { af = {}; }
    var allFields = (af && af.data) || [];
    var provs = []; mine.forEach(function (c) { if (!provs.some(function (p) { return p.id === c.provider_id; })) provs.push({ id: c.provider_id, name: c.venue }); });
    var useBar = provs.length ? '<div class="lg-tool" style="margin-top:0">' + provs.map(function (p) {
        return '<button class="lg-btn" onclick="FFPTourn.useMyCourts(\'' + p.id + '\')">' + ic('connected_tv') + 'Add ' + surfWord(true) + ' from ' + esc(p.name) + '</button>';
      }).join('') + '</div>' : '';
    if (useBar) h2.insertAdjacentHTML('beforebegin', '<div id="tg-vcbar">' + useBar + '</div>');
    h2.insertAdjacentHTML('beforebegin', '<div id="tg-oopbar">' + oopCard() + '</div>');
    var claimed = {};
    vs.forEach(function (v2) { (v2.surfaces || []).forEach(function (x) { claimed[x.id] = true; }); });
    var orphans = allFields.filter(function (f2) { return !claimed[f2.id]; });
    if (!vs.length && !orphans.length && !S.venAdd) { h2.innerHTML = '<div class="lg-empty">No venues yet. Add a venue, then its ' + surfWord(true) + '.</div>'; return; }
    // A surface that belongs to no venue is still a surface: it has a screen,
    // it can take a tablet, and Auto-plan will put matches on it. Shown here
    // so it can be seen and removed, rather than only turning up on the grid.
    function orphanCard() {
      if (!orphans.length) return '';
      return '<div class="lg-venue"><div class="lg-vh"><span class="lg-vpin"><span class="ms">connected_tv</span></span>'
        + '<div class="g"><b>' + Surf(true) + ' added from your own venue</b><span>Not under a venue above. Remove any you did not mean to add, then Auto-plan again.</span></div></div>'
        + '<div class="lg-surfs">' + orphans.map(function (s) {
            var vc = (S._vcMine || []).find(function (c) { return c.id === s.venue_court_id; });
            return '<div class="lg-surf"><span class="ms">sports_score</span>' + esc(s.name)
              + (vc && vc.name !== s.name ? '<span class="lg-vcnote">' + esc(vc.name) + ' at ' + esc(vc.venue) + '</span>' : '')
              + '<span class="sp"></span>'
              + (s.screen_code ? '<button class="lg-scrbtn perm" title="Scoreboard for this ' + surfWord() + '" onclick="FFPTourn.screenPanel(\'' + esc(s.screen_code) + '\',\'' + esc(s.name) + '\',true)"><span class="ms">connected_tv</span>' + esc(s.screen_code) + '</button>' : '')
              + '<button class="lg-btn sm" title="Connect a scoring tablet to this ' + surfWord() + '" onclick="FFPTourn.pinPanel(\'' + s.id + '\',\'' + esc(s.name) + '\')"><span class="ms">tablet_android</span>Connect a tablet</button>'
              + '<span class="ms x" onclick="FFPTourn.removeSurface(\'' + s.id + '\')">delete</span></div>'
              + (S.pinFor === s.id ? pinHtml(s) : '');
          }).join('') + '</div></div>';
    }
    h2.innerHTML = vs.map(function (v2) {
      if (S.venEdit === v2.id) return venueEditor(v2);
      var surfaces = (v2.surfaces || []).map(function (s) {
        var link = (S._vcMine || []).length
          ? '<select class="lg-sel lg-vclink" title="Which screen shows this ' + surfWord() + '" onchange="FFPTourn.linkCourt(\'' + s.id + '\',this.value)">'
            + '<option value="">Event-only screen</option>'
            + S._vcMine.map(function (c) { var one = S._vcMine.every(function (x) { return x.provider_id === c.provider_id; }); return '<option value="' + c.id + '"' + (c.id === s.venue_court_id ? ' selected' : '') + '>' + esc(one ? c.name + ' screen' : c.name + ', ' + c.venue) + '</option>'; }).join('')
            + '</select>' : '';
        return '<div class="lg-surf"><span class="ms">sports_score</span>' + esc(s.name)
          + '<span class="sp"></span>'
          + '<button class="lg-mainb' + (s.is_main ? ' on' : '') + '"'
          +   ' title="' + (s.is_main ? 'The final is played here' : 'Make this the main ' + surfWord() + ', where the final is played') + '"'
          +   ' onclick="FFPTourn.setMainCourt(\'' + s.id + '\',' + (s.is_main ? 'false' : 'true') + ')">'
          +   ic('stadium') + (s.is_main ? 'Main ' + surfWord() : 'Set as main') + '</button>' + link
          // The code a TV is set up with — see screenPanel().
          + (s.screen_code ? '<button class="lg-scrbtn' + (s.permanent ? ' perm' : '') + '" title="Scoreboard for this ' + surfWord() + '" onclick="FFPTourn.screenPanel(\'' + esc(s.screen_code) + '\',\'' + esc(s.name) + '\',' + (s.permanent ? 'true' : 'false') + ')"><span class="ms">' + (s.permanent ? 'connected_tv' : 'cast') + '</span>' + esc(s.screen_code) + '</button>' : '')
          + '<button class="lg-btn sm" title="Connect a scoring tablet to this ' + surfWord() + '" onclick="FFPTourn.pinPanel(\'' + s.id + '\',\'' + esc(s.name) + '\')"><span class="ms">tablet_android</span>Connect a tablet</button>'
          + '<span class="ms x" onclick="FFPTourn.removeSurface(\'' + s.id + '\')">delete</span></div>'
          + (S.pinFor === s.id ? pinHtml(s) : '');
      }).join('');
      var vmeta = [v2.city, (v2.maps_url ? '<a class="lg-maplink" href="' + esc(v2.maps_url) + '" target="_blank" rel="noopener">' + ic('map') + 'Map</a>' : '')].filter(Boolean).join(', ');
      var addS = (S.surfAdd === v2.id)
        ? '<div class="lg-edit" style="margin-left:44px;border:none;padding-top:8px"><input class="lg-in" id="tg-sfname" placeholder="' + Surf() + ' name" style="max-width:260px" onkeydown="if(event.key===\'Enter\')FFPTourn.saveSurface(\'' + v2.id + '\')"><button class="lg-btn pri" onclick="FFPTourn.saveSurface(\'' + v2.id + '\')">' + ic('check') + 'Add</button><button class="lg-btn ghost" onclick="FFPTourn.cancelSurface()">Cancel</button></div>'
        : '<div class="lg-addsurf"><button class="lg-btn ghostb" onclick="FFPTourn.addSurface(\'' + v2.id + '\')">' + ic('add') + 'Add surface</button></div>';
      return '<div class="lg-venue"><div class="lg-vh"><span class="lg-vpin"><span class="ms">location_on</span></span><div class="g"><b>' + esc(v2.name) + '</b><span>' + vmeta + '</span></div><span class="ms act" onclick="FFPTourn.editVenue(\'' + v2.id + '\')">edit</span><span class="ms act" onclick="FFPTourn.removeVenue(\'' + v2.id + '\')">delete</span></div>'
        + (surfaces ? '<div class="lg-surfs">' + surfaces + '</div>' : '') + addS + '</div>';
    }).join('') + orphanCard();
    var f = document.getElementById('tg-vname'); if (f) f.focus();
    var sf = document.getElementById('tg-sfname'); if (sf) sf.focus();
  }
  function venueEditor(v2) {
    v2 = v2 || {};
    return '<div class="lg-edit"><input class="lg-in" id="tg-vname" placeholder="Venue name" value="' + esc(v2.name || '') + '" style="flex:2;min-width:170px">'
      + '<input class="lg-in" id="tg-vcity" list="tg-cityl" placeholder="City" value="' + esc(v2.city || '') + '" style="flex:1;min-width:110px"><datalist id="tg-cityl">' + dlOpts(cityNames()) + '</datalist>'
      + '<input class="lg-in" id="tg-vmaps" placeholder="Google Maps link (optional)" value="' + esc(v2.maps_url || '') + '" style="flex:2;min-width:180px">'
      + '<button class="lg-btn pri" onclick="FFPTourn.saveVenue(\'' + (v2.id || '') + '\')">' + ic('check') + 'Save</button>'
      + '<button class="lg-btn ghost" onclick="FFPTourn.cancelVenue()">Cancel</button></div>';
  }
  function addVenue() { S.venAdd = true; S.venEdit = null; renderTab(); }
  function editVenue(id) { S.venEdit = id; S.venAdd = false; renderTab(); }
  function cancelVenue() { S.venAdd = false; S.venEdit = null; renderTab(); }
  async function saveVenue(id) {
    var nm = v('tg-vname'); if (!nm || !nm.trim()) { toast('Name required', 'error'); return; }
    var r; try { r = await sb().rpc('lt_venue_save', { p_scope: 'tourn', p_event: S.eventId, p_id: id || null, p_name: nm.trim(), p_city: v('tg-vcity') || null, p_maps: v('tg-vmaps') || null }); } catch (e) { r = { error: e }; }
    if (r.error) { toast('Save failed', 'error'); return; } S.venAdd = false; S.venEdit = null; toast('Saved', 'success'); renderTab();
  }
  async function removeVenue(id) { await sb().rpc('lt_venue_remove', { p_id: id }); toast('Removed', 'success'); renderTab(); }
  function addSurface(vid) { S.surfAdd = vid; renderTab(); }
  async function useMyCourts(pid) {
    var r; try { r = await sb().rpc('lt_fields_from_venue', { p_scope: 'tourn', p_event: S.eventId, p_provider: pid }); } catch (e) { r = { error: e }; }
    if (r.error) { toast('Could not add the ' + surfWord(true), 'error'); return; }
    toast(r.data ? (r.data + ' ' + (r.data === 1 ? surfWord() : surfWord(true)) + ' added, on their own screens') : 'All your ' + surfWord(true) + ' are already here', 'success');
    renderTab();
  }
  function pinHtml(s2) {
    var p = S.pin || {};
    if (p.err) return '<div class="tg-conn"><span class="g"><span class="lb">' + esc(s2.name) + '</span>'
      + '<div class="exp" style="color:#b23b2e;font-weight:800">' + esc(p.err) + '</div>'
      + '<div class="acts"><button class="lg-btn" onclick="FFPTourn.pinPanel(\'' + s2.id + '\',\'' + esc(s2.name) + '\')">Try again</button>'
      + '<button class="lg-btn ghost" onclick="FFPTourn.pinClose()">Close</button></div></span></div>';
    if (!p.pin) return '<div class="tg-conn"><span class="g"><span class="lb">' + esc(s2.name) + '</span><div class="exp">Making a PIN\u2026</div></span></div>';
    var url = TABLET_URL + '?pin=' + encodeURIComponent(p.pin);
    return '<div class="tg-conn">'
      + '<span class="qr" id="tg-qr"></span>'
      + '<span class="g"><span class="lb">' + esc(s2.name) + ', connect a tablet</span>'
      + '<div class="code">' + esc(p.pin.slice(0, 3) + ' ' + p.pin.slice(3)) + '</div>'
      + '<div class="exp">Good for 15 minutes. Anyone with the PIN can connect a tablet to this ' + surfWord() + '.</div>'
      + '<div class="how">On the tablet open <b>' + esc(TABLET_URL.replace(/^https?:\/\//, '')) + '</b> and type the PIN, or point its camera at this square. It stays here until you disconnect it.</div>'
      + '<div class="acts"><button class="lg-btn" onclick="FFPTourn.pinPanel(\'' + s2.id + '\',\'' + esc(s2.name) + '\')"><span class="ms">refresh</span>New PIN</button>'
      + '<button class="lg-btn" onclick="FFPTourn.copy(\'' + esc(url) + '\')"><span class="ms">content_copy</span>Copy the link</button>'
      + '<button class="lg-btn ghost" onclick="FFPTourn.pinClose()"><span class="ms">close</span>Done</button></div></span></div>';
  }

  async function linkCourt(fid, cid) {
    var r; try { r = await sb().rpc('lt_field_link', { p_field: fid, p_court: cid || null }); } catch (e) { r = { error: e }; }
    if (r.error) { toast('Could not change the screen', 'error'); return; }
    toast(cid ? 'Now on that ' + surfWord() + '\'s screen' : 'Back to an event-only screen', 'success');
    renderTab();
  }
  function cancelSurface() { S.surfAdd = null; renderTab(); }
  async function saveSurface(vid) {
    var nm = v('tg-sfname'); if (!nm || !nm.trim()) return;
    var r; try { r = await sb().rpc('lt_field_save', { p_scope: 'tourn', p_event: S.eventId, p_id: null, p_name: nm.trim(), p_start: null, p_venue: vid }); } catch (e) { r = { error: e }; }
    if (r.error) { toast('Add failed', 'error'); return; } S.surfAdd = null; toast('Added', 'success'); renderTab();
  }
  async function removeSurface(id) { await sb().rpc('lt_field_remove', { p_id: id }); renderTab(); }

  // ---------- EVENT TIME ----------
  // Every stored time is a UTC instant. The organiser thinks in the
  // tournament's own clock, and lt_autoplan already plans in it, so the panel
  // reads and writes that clock rather than whatever the laptop is set to.
  function evTz() {
    var t = (S.detail && S.detail.event && S.detail.event.timezone) || '';
    if (t) { try { new Intl.DateTimeFormat('en-GB', { timeZone: t }); return t; } catch (e) {} }
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch (e) { return 'UTC'; }
  }
  var _tzFmt = {};
  function _fmt(tz) {
    if (!_tzFmt[tz]) _tzFmt[tz] = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    return _tzFmt[tz];
  }
  // The wall clock in the event's zone for a given instant.
  function tzWall(ms, tz) {
    var g = {}; _fmt(tz).formatToParts(new Date(ms)).forEach(function (p) { g[p.type] = p.value; });
    return { y: +g.year, mo: +g.month, d: +g.day, hh: +g.hour % 24, mi: +g.minute, ss: +g.second };
  }
  function tzShift(ms, tz) { var w = tzWall(ms, tz); return Date.UTC(w.y, w.mo - 1, w.d, w.hh, w.mi, w.ss) - ms; }
  // The instant for a wall-clock time in the event's zone. Two passes so the
  // hour either side of a daylight-saving change lands on the right instant.
  function wallToMs(y, mo, d, hh, mi, tz) {
    var guess = Date.UTC(y, mo - 1, d, hh, mi, 0);
    var ms = guess - tzShift(guess, tz);
    return guess - tzShift(ms, tz);
  }
  function evWall(iso) { var ms = new Date(iso).getTime(); return isNaN(ms) ? null : tzWall(ms, evTz()); }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function evTimeStr(iso) { var w = evWall(iso); return w ? pad2(w.hh) + ':' + pad2(w.mi) : ''; }
  function evDateStr(iso) { var w = evWall(iso); return w ? w.y + '-' + pad2(w.mo) + '-' + pad2(w.d) : ''; }
  function evDayShort(iso) {
    var w = evWall(iso); if (!w) return '';
    var probe = new Date(Date.UTC(w.y, w.mo - 1, w.d, 12, 0, 0));
    return DOW[probe.getUTCDay()] + ' ' + w.d + ' ' + MON[w.mo - 1];
  }
  function evDayLong(ymd) {
    var a = String(ymd).split('-'); if (a.length !== 3) return String(ymd);
    var probe = new Date(Date.UTC(+a[0], +a[1] - 1, +a[2], 12, 0, 0));
    return ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][probe.getUTCDay()]
      + ' ' + (+a[2]) + ' ' + MON[+a[1] - 1];
  }
  function evIso(dateStr, timeStr) {
    var a = String(dateStr || '').split('-'); if (a.length !== 3) return null;
    var b = String(timeStr || '00:00').split(':');
    var ms = wallToMs(+a[0], +a[1], +a[2], +b[0] || 0, +b[1] || 0, evTz());
    return isNaN(ms) ? null : new Date(ms).toISOString();
  }
  // "Australia/Brisbane" reads as "Brisbane" to a human.
  function tzLabel() { return evTz().split('/').pop().replace(/_/g, ' '); }
  // ---------- SCHEDULE — order of play ----------
  // The organiser's question is "what is on, on which court, in what order".
  // So the page is built day by day, court by court, in playing order, and
  // every move is one control on the row that is being moved.
  var KO_RANK = { r64: 1, r32: 2, r16: 3, quarter: 4, semi: 5, third: 6, final: 7 };
  function playRank(m) {
    if (m.stage === 'group') return -1;
    return ((m.play_round || m.round || 0) * 100) + (KO_RANK[m.stage] || 8) + (m._dsort || 0) * 0.01;
  }
  function dayKey(m) { return m.scheduled_at ? evDateStr(m.scheduled_at) : ''; }
  function matchLabel(m) {
    if (m.stage === 'group') return 'Group ' + (m.group_label || '');
    return (m._draw ? m._draw + ', ' : '') + stageLbl(m);
  }
  // The schedule belongs to the tournament, not to one division. A court takes
  // whatever fits, so every division is laid out together in one pass and each
  // row carries its division's colour. Auto-plan is pressed once; after that the
  // grid is edited by hand, and Rebuild has to be asked for.
  function hm(t) { return String(t || '').slice(0, 5); }
  function dayShortYmd(ymd) {
    var a = String(ymd).split('-'); if (a.length !== 3) return String(ymd);
    var p = new Date(Date.UTC(+a[0], +a[1] - 1, +a[2], 12, 0, 0));
    return DOW[p.getUTCDay()] + ' ' + (+a[2]) + ' ' + MON[+a[1] - 1];
  }
  function sportRow() {
    var k = (S.detail && S.detail.event && S.detail.event.sport_key) || null;
    return (S.sports || []).filter(function (s) { return s.key === k; })[0] || null;
  }
  /* NOT EVERYTHING IS A COURT. A rugby club plays on a pitch, an AFL club on an
     oval, a table tennis club on a table. The sport supplies the word and a
     venue may override it, so no label assumes. */
  function surfWord(plural) {
    var v = (S._fields || []).filter(function (x) { return x.surface_word; })[0];
    if (v) {
      var w = String(v.surface_word).trim();
      return plural ? (/(ch|sh|s|x|z)$/.test(w) ? w + 'es' : w + 's') : w;
    }
    var s = sportRow();
    var sw = s && (plural ? s.surface_word_plural : s.surface_word);
    return sw || (plural ? 'courts' : 'court');
  }
  function Surf(plural) { var w = surfWord(plural); return w.charAt(0).toUpperCase() + w.slice(1); }
  // an oval, a pitch: the article follows the word, not the other way round
  function aSurf(plural) { var w = surfWord(plural); return (/^[aeiou]/i.test(w) ? 'an ' : 'a ') + w; }

  /* THE SPORT KNOWS HOW LONG ITS MATCH TAKES, so nobody is asked to type it.
     A sport played to a clock states its periods and its break; one played to a
     score states how long a court is held for. Either way the organiser is left
     with the one thing the sport cannot know: the gap on the surface afterwards.
     An explicit override still wins, and is only stored once it is made. */
  function matchMins() {
    var ev = (S.detail && S.detail.event) || {}, s = sportRow() || {};
    if (ev.plan_match_len) return +ev.plan_match_len;
    var pm = ev.period_minutes || s.period_minutes, pc = ev.period_count || s.period_count;
    if (pm && pc) return (pm * pc) + (+s.break_minutes || 0);
    return +s.slot_minutes || 30;
  }
  function matchMinsWhy() {
    var ev = (S.detail && S.detail.event) || {}, s = sportRow() || {};
    if (ev.plan_match_len) return 'Saved for this tournament';
    var pm = ev.period_minutes || s.period_minutes, pc = ev.period_count || s.period_count;
    if (pm && pc) return pc + ' periods of ' + pm + ' min'
      + (s.break_minutes ? ', plus ' + s.break_minutes + ' at the break' : '') + ', from the sport';
    if (s.slot_minutes) return 'What ' + (s.name || 'this sport') + ' is usually given';
    return 'No sport set yet, so 30 min is assumed';
  }
  /* TIME BETWEEN MATCHES. A tournament runs matches back to back on the same
     surface, so the default gap is 5 minutes (Grant) whatever the sport says it
     wants between fixtures. The organiser can set any number on the Schedule. */
  function turnMins() {
    var ev = (S.detail && S.detail.event) || {};
    return ev.plan_turnaround != null ? +ev.plan_turnaround : 5;
  }
  function mlenEdit() { S.mlenEdit = !S.mlenEdit; renderTab(); }
  /* back to the sport's own figure: clear the stored override, then re-derive */
  async function mlenSport() {
    var ev = (S.detail && S.detail.event) || null;
    var r; try { r = await sb().rpc('tourn_event_save',
      { p_id: S.eventId, p: { plan_match_len: '' } }); } catch (e) { r = { error: e }; }
    if (r && r.error) { toast('Could not reset the match length', 'error'); return; }
    if (ev) ev.plan_match_len = null;
    S.plan = planFromEvent(ev, 1);
    renderTab();
  }
  function planNow() {
    var g = function (id, d) { var el = document.getElementById(id); var v = el ? String(el.value || '').trim() : ''; return v || d; };
    var ml = document.getElementById('tg-mlen');
    return { len: ml ? Math.max(5, +ml.value || matchMins()) : matchMins(),
             start: g('tg-dstart', '09:00'), end: g('tg-dend', '21:00'),
             days: Math.max(1, +g('tg-days', '1') || 1), gap: Math.max(0, +g('tg-rgap', '0') || 0),
             rest: Math.max(0, +g('tg-rest', '0') || 0),
             turn: Math.max(0, +g('tg-turn', String(turnMins())) || 0) };
  }
  function hm5(t) { return t ? String(t).slice(0, 5) : null; }
  /* THE PLAYING DAY IS A SETTING, NOT A FORM. It used to be typed into this tab
     and thrown away on reload, so nobody could rely on it and the schedule could
     never lay itself out. It lives on the event now and is saved as it is
     changed. */
  /* THE DAYS THE EVENT RUNS. Its start date, for as many days as it was
     given, and never past the end date it was given. A day that merely has
     a match on it is not one of them - that is how a match pushed past the
     last day used to invent a Monday. */
  function eventDays() {
    var ev = (S.detail && S.detail.event) || {};
    var base = ev.starts_at || evDateStr(new Date().toISOString());
    var a = String(base).split('-');
    var ends = ev.ends_at || null;
    var n = +ev.plan_days || (S.plan && S.plan.days) || 1;
    var out = [];
    for (var k = 0; k < Math.max(1, n); k++) {
      var d = new Date(Date.UTC(+a[0], +a[1] - 1, +a[2] + k, 12, 0, 0));
      var key = d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate());
      if (ends && key > ends) break;
      out.push(key);
    }
    return out;
  }
  function planFromEvent(ev, defDays) {
    ev = ev || {};
    return { len:   matchMins(),
             start: hm5(ev.plan_day_start) || '09:00',
             end:   hm5(ev.plan_day_end)   || '21:00',
             days:  +ev.plan_days || defDays || 1,
             gap:   +ev.plan_round_gap || 0,
             rest:  +ev.plan_rest || 0,
             turn:  turnMins() };
  }
  var _planBad = false;
  /* WHAT IS ON SCREEN IS WHAT IS STORED.
     This used to save only what the organiser TYPED, and only the match length
     if they had pressed "change". So a panel showing 45 min, 09:00 to 21:00 and
     a 5 min turnaround had none of it in the database: those were numbers
     derived from the sport each time the tab opened. Nothing was wrong until
     something underneath moved, and then the schedule was built on figures
     nobody had ever seen. Every value the panel shows is written now, the
     result is READ, and a failure says so instead of disappearing. */
  async function planSave() {
    var P = S.plan || planNow();
    var ev = (S.detail && S.detail.event) || null;
    if (ev) {
      ev.plan_day_start = P.start; ev.plan_day_end = P.end;
      ev.plan_days = P.days; ev.plan_round_gap = P.gap; ev.plan_rest = P.rest;
      ev.plan_turnaround = P.turn; ev.plan_match_len = P.len;
    }
    var patch = { plan_match_len: String(P.len),
      plan_day_start: P.start, plan_day_end: P.end, plan_days: String(P.days),
      plan_round_gap: String(P.gap), plan_rest: String(P.rest), plan_turnaround: String(P.turn) };
    var r; try { r = await sb().rpc('tourn_event_save', { p_id: S.eventId, p: patch }); }
    catch (e) { r = { error: e }; }
    if (r && r.error) {
      // once per run of failures, not once per keystroke
      if (!_planBad) { _planBad = true; toast('Could not save the schedule settings', 'error'); }
      return false;
    }
    _planBad = false;
    return true;
  }
  /* The first time the tab is opened on an event that has never had these
     saved, write the derived figures down so the panel is showing stored
     settings from the start rather than a guess it will forget. */
  async function planSeed() {
    var ev = (S.detail && S.detail.event) || null;
    if (!ev || ev.plan_match_len != null) return;
    S.plan = planFromEvent(ev, 1);
    await planSave();
  }
  /* NOTHING IN THIS TAB SAVES ITSELF. A typed figure, a day's window and a
     break all sit pending until the organiser presses Save, so a half-typed
     number is never written and the schedule never moves behind their back. */
  function pend() { return (S._pend = S._pend || { plan: false, days: {}, breaks: {}, away: {} }); }
  function schedDirty() {
    var q = pend();
    return !!(q.plan || Object.keys(q.days).length || Object.keys(q.breaks).length
              || Object.keys(q.away || {}).length);
  }
  /* Touched straight on the button rather than through a re-render, because a
     re-render on every keystroke takes the focus out of the field. */
  function schedBar() {
    var b = document.getElementById('tg-save'); if (!b) return;
    var d = schedDirty();
    b.disabled = !d; b.classList.toggle('on', d);
    b.textContent = d ? 'Save changes' : 'Saved';
  }
  function planSet() { S.plan = planNow(); pend().plan = true; schedBar(); }
  /* One press writes the lot: the day's settings, every playing window that
     changed, and every break that changed. */
  async function scheduleSave() {
    var q = pend(), ok = true, moved = false;
    if (q.plan) { if (!(await planSave())) ok = false; }
    var ds = Object.keys(q.days);
    for (var i = 0; i < ds.length; i++) {
      var r; try {
        r = await sb().from('tourn_days').upsert(q.days[ds[i]], { onConflict: 'tourn_id,on_date' });
      } catch (e) { r = { error: e }; }
      if (r && r.error) { ok = false; }
    }
    var bs = Object.keys(q.breaks);
    for (var j = 0; j < bs.length; j++) {
      var r2; try { r2 = await sb().from('tourn_breaks').update(q.breaks[bs[j]]).eq('id', bs[j]); }
      catch (e) { r2 = { error: e }; }
      if (r2 && r2.error) { ok = false; } else { moved = true; }
    }
    var av = Object.keys(q.away || {});
    for (var k = 0; k < av.length; k++) {
      var r3; try { r3 = await sb().from('tourn_unavail').update(q.away[av[k]]).eq('id', av[k]); }
      catch (e) { r3 = { error: e }; }
      if (r3 && r3.error) { ok = false; }
    }
    if (!ok) { toast('Could not save everything', 'error'); return; }
    S._pend = null; S._dayWin = null; S._breaks = null; S._unavail = null;
    if (moved) await applyBreaks(false);
    toast('Saved', 'success');
    renderTab();
  }
  function setSchedDiv(v) { S.schedDiv = v || ''; renderTab(); }

  async function renderSchedule(host) {
    /* The sport supplies the match length and the word for a playing surface,
       and S.sports is only filled by the Setup tab, so a schedule opened first
       had no sport at all and fell back to "30 min" and "court". */
    await loadSports();
    await planSeed();
    var divs = S.detail.divisions || [];
    if (!S.divId && divs.length) S.divId = divs[0].id;
    var P = S.plan || (S.plan = planFromEvent(S.detail.event, 1));
    var fr; try { fr = await sb().rpc('lt_fields_list', { p_scope: 'tourn', p_event: S.eventId }); } catch (e) { fr = { error: e }; }
    var fields = (fr && fr.data) || []; S._fields = fields;
    host.innerHTML = '<div id="tg-schedtop"></div><div id="tg-schedlist"><div class="lg-empty">Loading…</div></div>';
    var top = document.getElementById('tg-schedtop'), box = document.getElementById('tg-schedlist');
    if (!divs.length) { box.innerHTML = '<div class="lg-empty">Add a division first.</div>'; return; }

    var divIx = {}, divNm = {};
    divs.forEach(function (d, i) { divIx[d.id] = i % 10; divNm[d.id] = d.name; });
    S._divIx = divIx; S._divNm = divNm;

    // Names and draw labels are per division, so they are gathered per division
    // and merged. Draw keys repeat between divisions, hence the composite key.
    var names = {}, dnm = {}, dsort = {};
    for (var i = 0; i < divs.length; i++) {
      var did = divs[i].id;
      var nm = await entrantNames(did);
      Object.keys(nm).forEach(function (k) { names[k] = nm[k]; });
      try {
        var dl = await sb().rpc('tourn_draws_list', { p_division: did });
        ((dl && dl.data) || []).forEach(function (d) { dnm[did + '|' + d.key] = d.name; dsort[did + '|' + d.key] = d.sort; });
      } catch (e) {}
    }
    await loadEntrantsArr();

    var mr; try {
      mr = await sb().from('tourn_matches')
        .select('id,division_id,stage,group_label,round,play_round,draw,slot,status,home_entrant,away_entrant,scheduled_at,court,field_id,pinned,match_no,next_match_id,next_slot,loser_next_match_id,loser_next_slot')
        .eq('tourn_id', S.eventId);
    } catch (e) { mr = { error: e }; }
    // A bye is not a match: nobody turns up for it and it takes no court,
    // so it has no place on a schedule. A void one is cancelled.
    var ms = ((mr && mr.data) || []).filter(function (m) { return m.status !== 'void' && m.status !== 'bye'; });
    S._schedMs = ms;
    if (!ms.length) { box.innerHTML = openDrawEmpty('schedule'); return; }
    /* Courts only matter once there is something to put on them, so this is
       asked after the draw, not before it. */
    if (!fields.length) { box.innerHTML = '<div class="lg-empty">Add a venue and its ' + surfWord(true) + ' on the <b>Venues</b> tab and the schedule builds itself.</div>'; return; }
    if (!(S.detail.event && S.detail.event.starts_at)) {
      box.innerHTML = '<div class="lg-empty act"><div class="t">When does it start?</div>'
        + '<div class="s">Set the start date on Information and every match is given a time and a court straight away, '
        + 'before a single entry is in.</div>'
        + '<div class="row"><button class="lg-btn pri" onclick="FFPTourn.tab(\'information\')">' + ic('event') + 'Go to Information</button></div></div>';
      return;
    }
    /* THE SCHEDULE BUILDS ITSELF. Once the draw exists, the courts exist and the
       event has a start date, there is nothing left to decide: every match can
       be given a time and a court before anybody has entered, and the names drop
       into the slots as entrants are seeded and as groups finish. It runs ONLY
       when nothing at all is placed, so it can never move a schedule that has
       been edited or handed out. */
    if (!S._autoPlanned && !ms.some(function (m) { return m.scheduled_at; })) {
      S._autoPlanned = true;
      var ap; try {
        ap = await sb().rpc('tourn_autoplan_all', { p_tourn: S.eventId, p_match_len: P.len,
          p_day_start: P.start, p_day_end: P.end, p_days: P.days, p_round_gap: P.gap,
          p_rest: P.rest, p_divisions: null, p_tz: evTz(), p_turnaround: P.turn });
      } catch (e) { ap = null; }
      if (ap && !ap.error && ap.data && (ap.data.placed || 0) > 0) {
        toast(ap.data.placed + ' matches given a time and ' + aSurf(), 'success');
        return renderSchedule(host);
      }
    }

    var offr = await sb().rpc('lt_officials_list', { p_scope: 'tourn', p_event: S.eventId }); S._offs = (offr && offr.data) || [];
    var moMap = {};
    try {
      var mo = await sb().from('lt_match_officials').select('id,match_id,role,official_id').eq('scope', 'tourn').in('match_id', ms.map(function (m) { return m.id; }));
      var offName = {}; S._offs.forEach(function (o) { offName[o.id] = o.name || o.email; });
      ((mo && mo.data) || []).forEach(function (x) { (moMap[x.match_id] = moMap[x.match_id] || []).push({ id: x.id, official_id: x.official_id, role: x.role, name: offName[x.official_id] || 'Official' }); });
    } catch (e) {}
    ms.forEach(function (m) {
      m._names = names; m._offs = moMap[m.id] || [];
      var dk = m.division_id + '|' + m.draw;
      m._draw = (m.draw && m.draw !== 'main') ? (dnm[dk] || '') : ''; m._dsort = dsort[dk] || 0;
      m._dix = divIx[m.division_id] || 0; m._dnm = divNm[m.division_id] || '';
    });
    S._sched = ms;
    S._entNames = names;

    /* S._days is already the event's match days from lt_event_days - these are
       the organiser's playing windows, which is a different thing. */
    var dy; try { dy = await sb().from('tourn_days').select('id,on_date,opens,closes,closed,only_divisions,only_rounds,only_stages').eq('tourn_id', S.eventId); } catch (e) { dy = { error: e }; }
    S._dayWin = (dy && dy.data) || [];

    var un; try { un = await sb().from('tourn_unavail')
      .select('id,entrant_id,on_date,from_at,to_at').eq('tourn_id', S.eventId); }
      catch (e) { un = { error: e }; }
    S._unavail = (un && un.data) || [];

    var br; try { br = await sb().from('tourn_breaks').select('id,field_id,on_date,starts_at,ends_at,label,sort').eq('tourn_id', S.eventId); } catch (e) { br = { error: e }; }
    var breaks = ((br && br.data) || []).sort(function (a, b) { return (a.sort - b.sort) || String(a.starts_at).localeCompare(String(b.starts_at)); });
    S._breaks = breaks;

    var fById = {}; fields.forEach(function (f) { fById[f.id] = f; });
    // A match with no court and no time is not scheduled, so the schedule is
    // not built yet. Auto-plan gives every match a slot whether or not anyone
    // knows who is playing it, so the answer is always the one press.
    var placed = function (m) { return !!(m.scheduled_at && m.field_id && fById[m.field_id]); };
    var built = ms.length > 0 && ms.every(placed);
    var shown = S.schedDiv ? ms.filter(function (m) { return m.division_id === S.schedDiv; }) : ms;

    var days = {}, loose = [];
    shown.forEach(function (m) {
      if (!placed(m)) { loose.push(m); return; }
      var d = dayKey(m); (days[d] = days[d] || {}); (days[d][m.field_id] = days[d][m.field_id] || []).push(m);
    });

    // The days a break can be pinned to: the ones in play, or failing that the
    // ones the event is planned to run for.
    var dayList = Object.keys(days).sort();
    if (!dayList.length) {
      var base = (S.detail.event && S.detail.event.starts_at) || evDateStr(new Date().toISOString());
      var a = String(base).split('-');
      for (var k = 0; k < P.days; k++) {
        var p = new Date(Date.UTC(+a[0], +a[1] - 1, +a[2] + k, 12, 0, 0));
        dayList.push(p.getUTCFullYear() + '-' + pad2(p.getUTCMonth() + 1) + '-' + pad2(p.getUTCDate()));
      }
    }

    /* THE DAYS A PLAYING WINDOW CAN BE SET FOR ARE THE DAYS THE EVENT RUNS -
       its start date for as many days as it is given, never further than the
       end date it was given. A day that merely has a match on it does NOT
       join this list: that is how a match pushed past the last day used to
       add a Monday here, and offering to set its hours made the invented day
       look like part of the tournament. A Sunday with nothing on it yet is
       still listed, because it IS one of the event's days. */
    S._planDays = eventDays();

    top.innerHTML = schedTop(built, divs, fields, breaks, dayList, P) + (built ? divKey(divs) : '');

    var html = '';
    dayList.forEach(function (d) {
      if (!days[d]) return;
      html += '<div class="sc-day">' + esc(evDayLong(d)) + '<span class="tz">' + esc(tzLabel()) + ' time</span></div>';
      fields.forEach(function (f) {
        var list = days[d][f.id]; if (!list || !list.length) return;
        list.sort(function (a, b) { return new Date(a.scheduled_at) - new Date(b.scheduled_at) || playRank(a) - playRank(b); });
        var slot = d + '|' + f.id;
        // Breaks that apply to this court on this day, shown where they fall so
        // the gap in the day is not a mystery.
        var bks = breaks.filter(function (b) { return (!b.field_id || b.field_id === f.id) && (!b.on_date || b.on_date === d); });
        var items = list.map(function (m) { return { t: evTimeStr(m.scheduled_at), m: m }; })
          .concat(bks.map(function (b) { return { t: hm(b.starts_at), b: b }; }))
          .sort(function (x, y) { return String(x.t).localeCompare(String(y.t)); });
        var mi = -1;
        /* The bar already says which court this is, so the venue goes here
           rather than being repeated on all twelve rows beneath it. The main
           field is chosen once on the Venues tab, so this only reports it. */
        html += '<div class="sc-ch"><b>' + esc(f.name) + '</b>'
          + (f.venue ? '<span class="vn">' + esc(f.venue) + '</span>' : '')
          + (f.is_main ? '<span class="mn">Main ' + surfWord() + '</span>' : '')
          + '<span class="ct">' + list.length + (list.length === 1 ? ' match' : ' matches') + '</span>'
          + '<button class="sc-add" onclick="FFPTourn.addMatch(\'' + slot + '\')">' + ic('add') + 'Add match</button></div>'
          + items.map(function (it) {
              if (it.b) return breakBar(it.b, list.filter(function (x) { return inBreak(x) === it.b; }).length);
              mi++; return schedRow(it.m, f.id, mi === 0, mi === list.length - 1);
            }).join('')
          + (S.addMatch === slot ? matchEditor() : '');
      });
    });
    if (loose.length) {
      loose.sort(function (a, b) { return playRank(a) - playRank(b) || (a.slot || 0) - (b.slot || 0); });
      html += '<div class="sc-day">Not on the schedule yet</div>'
        + '<div class="sc-ch warn"><b>' + loose.length + (loose.length === 1 ? ' match has' : ' matches have') + ' no ' + surfWord() + ' and no time</b>'
        + '<span class="ct">Auto-plan gives them one</span>'
        + '<button class="sc-add" onclick="FFPTourn.autoplan()">' + ic('auto_awesome') + 'Auto-plan now</button></div>'
        + loose.map(function (m) { return schedRow(m, null, true, true); }).join('')
        + (S.addMatch === 'loose' ? matchEditor() : '');
    }
    if (!html) html = '<div class="lg-empty">No schedule yet. Auto-plan builds every division in one go, so no two are given the same ' + surfWord() + ' at the same moment.</div>';
    box.innerHTML = html + (S.rbAsk ? rebuildConfirm() : '');
  }

  function divKey(divs) {
    if (divs.length < 2) return '';
    return '<div class="sc-key">' + divs.map(function (d, i) {
      return '<span class="k tg-d' + (i % 10) + '"><i></i>' + esc(d.name) + '</span>';
    }).join('') + '</div>';
  }

  function schedTop(built, divs, fields, breaks, dayList, P) {
    var dopt = '<option value="">All divisions</option>' + divs.map(function (d) {
      return '<option value="' + d.id + '"' + (S.schedDiv === d.id ? ' selected' : '') + '>' + esc(d.name) + '</option>';
    }).join('');
    return '<div class="lg-tool">'
      + (divs.length > 1 ? '<select class="lg-sel" style="width:auto;min-width:190px" title="Filters what you are looking at. Auto-plan always builds every division." onchange="FFPTourn.setSchedDiv(this.value)">' + dopt + '</select>' : '')
      + '<span class="sp"></span>'
      + '<button class="lg-btn sc-save' + (schedDirty() ? ' on' : '') + '" id="tg-save"'
      +   (schedDirty() ? '' : ' disabled') + ' onclick="FFPTourn.scheduleSave()">'
      +   (schedDirty() ? 'Save changes' : 'Saved') + '</button>'
      + (built
        ? '<button class="lg-btn ghost sc-rb" onclick="FFPTourn.rebuildAsk()">' + ic('warning') + 'Rebuild schedule</button>'
        : '<button class="lg-btn pri" onclick="FFPTourn.autoplan()">' + ic('auto_awesome') + 'Auto-plan the tournament</button>')
      + '</div>'
      /* ── THE DAY'S SETTINGS, AS FIELDS. ───────────────────────────────
         These were a paragraph with input boxes punched through it - grey
         text, grey borders, grey hints, no hierarchy, and no way to see at a
         glance what was set. Every other tab in this portal states a setting
         as a LABEL above a field, and that is what every tournament tool
         does with match duration too. Same furniture here. */
      + '<div class="tg-sec sc-set"><div class="tg-sech">How the day runs</div>'
      +   '<div class="lg-3">'
      +     '<div class="lg-fld"><div class="lg-lab">A match takes</div>'
      +       '<div class="sc-unit"><input class="lg-in" id="tg-mlen" type="number" min="5" value="'
      +         P.len + '" oninput="FFPTourn.planSet()"><span>min</span></div>'
      +       '<div class="sc-why">' + esc(matchMinsWhy())
      +         (matchMinsWhy() === 'Saved for this tournament'
            ? ' <button class="sc-mlenb" onclick="FFPTourn.mlenSport()">use the sport default</button>' : '')
      +       '</div></div>'
      +     '<div class="lg-fld"><div class="lg-lab">Between matches on ' + esc(aSurf()) + '</div>'
      +       '<div class="sc-unit"><input class="lg-in" id="tg-turn" type="number" min="0" value="'
      +         P.turn + '" oninput="FFPTourn.planSet()"><span>min</span></div></div>'
      +     '<div class="lg-fld"><div class="lg-lab">Days</div>'
      +       '<div class="sc-unit"><input class="lg-in" id="tg-days" type="number" min="1" value="'
      +         P.days + '" oninput="FFPTourn.planSet()"><span>' + (P.days === 1 ? 'day' : 'days') + '</span></div></div>'
      +   '</div>'
      +   '<div class="lg-3">'
      +     '<div class="lg-fld"><div class="lg-lab">Play starts</div>'
      +       '<input class="lg-in sc-tin" id="tg-dstart" type="time" value="' + esc(P.start) + '" oninput="FFPTourn.planSet()"></div>'
      +     '<div class="lg-fld"><div class="lg-lab">Play ends</div>'
      +       '<input class="lg-in sc-tin" id="tg-dend" type="time" value="' + esc(P.end) + '" oninput="FFPTourn.planSet()"></div>'
      +     '<div class="lg-fld"></div>'
      +   '</div>'
      +   '<div class="lg-3">'
      +     '<div class="lg-fld"><div class="lg-lab">Between rounds</div>'
      +       '<div class="sc-unit"><input class="lg-in" id="tg-rgap" type="number" min="0" value="'
      +         P.gap + '" oninput="FFPTourn.planSet()"><span>min</span></div></div>'
      +     '<div class="lg-fld"><div class="lg-lab">Rest between ' + nouns(curDv()).poss + ' matches</div>'
      +       '<div class="sc-unit"><input class="lg-in" id="tg-rest" type="number" min="0" value="'
      +         P.rest + '" oninput="FFPTourn.planSet()"><span>min</span></div></div>'
      +     '<div class="lg-fld"></div>'
      +   '</div>'
      + '</div>'
      + dayBlock(P)
      + breakBlock(fields, breaks, dayList)
      + awayBlock(dayList)
      + fitWarn()
      + dayWhoSheet();
  }

  /* PLAYING TIMES, DAY BY DAY. The event's own start and end above are the
     default; a day listed here overrides them, and a day switched off is not
     played at all. Saved, not typed into the planner, so a later Rebuild uses
     the same windows. Breaks below still shut a single court mid-day - this is
     only when the whole day opens and closes. */
  function dayBlock(P) {
    var list = S._planDays || [];
    if (!list.length) return '';
    var by = {}; (S._dayWin || []).forEach(function (r) { by[r.on_date] = r; });
    // anything waiting on Save is what the organiser should be looking at
    var held = (S._pend && S._pend.days) || {};
    Object.keys(held).forEach(function (k) { by[k] = held[k]; });
    return '<div class="sc-brk sc-day"><span class="lb">Playing times, day by day</span>'
      + list.map(function (d) {
          var r = by[d] || {}, shut = !!r.closed;
          return '<span class="b' + (shut ? ' off' : '') + '" data-d="' + d + '">'
            + '<em class="dd">' + esc(dayShortYmd(d)) + '</em>'
            + '<input class="lg-in w dw-s" type="time" value="' + esc(hm(r.opens) || P.start) + '"'
              + (shut ? ' disabled' : '') + ' onchange="FFPTourn.daySave(\'' + d + '\')">'
            + '<em>to</em>'
            + '<input class="lg-in w dw-e" type="time" value="' + esc(hm(r.closes) || P.end) + '"'
              + (shut ? ' disabled' : '') + ' onchange="FFPTourn.daySave(\'' + d + '\')">'
            + '<button class="dw-t' + (shut ? ' off' : '') + '" onclick="FFPTourn.dayShut(\'' + d + '\')">'
              + (shut ? 'Closed' : 'Playing') + '</button>'
            + (shut ? '' : '<button class="dw-w' + (dayWhoLabel(r, S.detail.divisions || []) === 'Everyone' ? '' : ' set')
                + '" onclick="FFPTourn.dayWhoOpen(\'' + d + '\')">'
                + esc(dayWhoLabel(r, S.detail.divisions || [])) + '</button>')
            + '</span>';
        }).join('')
      + '<div class="sc-daynote">A day you have not changed plays '
      + esc(P.start || '09:00') + ' to ' + esc(P.end || '21:00') + '.</div>'
      + '</div>';
  }
  /* WHO MAY PLAY IN A DAY'S WINDOW. Friday evening for Division 1 and 2's
     first round means two things at once: those matches go there, and nothing
     else may. Null is everyone, which is what every day means until it is
     told otherwise. */
  function roundsInEvent() {
    var r = {};
    (S._sched || []).forEach(function (m) {
      var n = m.play_round || m.round; if (n) r[n] = 1;
    });
    var out = Object.keys(r).map(Number).sort(function (a, b) { return a - b; });
    return out.length ? out : [1];
  }
  var STAGE_LAB = { group: 'Group stage', monrad: 'Monrad', r64: 'Round of 64',
                    r32: 'Round of 32', r16: 'Round of 16', quarter: 'Quarter-finals',
                    semi: 'Semi-finals', final: 'Finals' };
  var STAGE_ORD = ['group','monrad','r64','r32','r16','quarter','semi','final'];
  function stagesInEvent() {
    var seen = {};
    (S._sched || []).forEach(function (m) { if (m.stage) seen[m.stage] = 1; });
    var out = STAGE_ORD.filter(function (k) { return seen[k]; });
    Object.keys(seen).forEach(function (k) { if (out.indexOf(k) < 0) out.push(k); });
    return out;
  }
  function stageLab(k) { return STAGE_LAB[k] || k; }
  /* Only prune when we actually know the stages. Before the schedule has
     loaded, stagesInEvent() is empty and pruning would erase a real choice. */
  function liveStages(list) {
    var have = stagesInEvent();
    if (!have.length) return (list || []).slice();
    return (list || []).filter(function (k) { return have.indexOf(k) >= 0; });
  }
  function dayWhoLabel(r, divs) {
    var dv = r.only_divisions, rd = r.only_rounds, st = r.only_stages;
    if ((!dv || !dv.length) && (!rd || !rd.length) && (!st || !st.length)) return 'Everyone';
    var bits = [];
    if (dv && dv.length) bits.push(dv.map(function (id) {
      return ((divs.filter(function (x) { return x.id === id; })[0] || {}).name || '?');
    }).join(', '));
    st = liveStages(st);
    if (st && st.length) bits.push(st.slice().sort(function (a, b) {
      return STAGE_ORD.indexOf(a) - STAGE_ORD.indexOf(b); }).map(stageLab).join(', '));
    if (rd && rd.length) bits.push(rd.length === 1 ? 'Round ' + rd[0] : 'Rounds ' + rd.join(', '));
    return bits.join(' \u2013 ');
  }
  function dayWhoOpen(d) { S.dayWho = d; renderTab(); }
  function dayWhoClose() { S.dayWho = null; S._whoD = null; S._whoR = null; S._whoS = null; renderTab(); }
  /* The picker is full bleed, like every other sheet in this portal. */
  function dayWhoSheet() {
    var d = S.dayWho; if (!d) return '';
    var divs = S.detail.divisions || [];
    var held = (S._pend && S._pend.days && S._pend.days[d]) || null;
    var cur = held || ((S._dayWin || []).filter(function (r) { return r.on_date === d; })[0]) || {};
    var selD = S._whoD || (S._whoD = (cur.only_divisions || []).slice());
    var selR = S._whoR || (S._whoR = (cur.only_rounds || []).slice());
    var selS = S._whoS || (S._whoS = liveStages(cur.only_stages));
    var chip = function (on, label, call) {
      return '<button class="dw-c' + (on ? ' on' : '') + '" onclick="' + call + '">' + esc(label) + '</button>';
    };
    return '<div class="lg-cfm"><div class="lg-cfm-in lg-who">'
      + '<div class="lg-cfm-t">Who plays on ' + esc(dayShortYmd(d)) + '?</div>'
      + '<div class="lg-cfm-b">Pick nothing and the day is open to everyone.</div>'
      + '<div class="dw-lab">Divisions</div><div class="dw-row">'
      +   divs.map(function (x) {
            return chip(selD.indexOf(x.id) >= 0, x.name, "FFPTourn.dayWhoTog('d','" + x.id + "')");
          }).join('')
      + '</div>'
      + '<div class="dw-lab">Stage</div><div class="dw-row">'
      +   stagesInEvent().map(function (k) {
            return chip(selS.indexOf(k) >= 0, stageLab(k), "FFPTourn.dayWhoTog('s','" + k + "')");
          }).join('')
      + '</div>'
      + '<div class="dw-lab">Rounds</div><div class="dw-row">'
      +   roundsInEvent().map(function (n) {
            return chip(selR.indexOf(n) >= 0, 'Round ' + n, "FFPTourn.dayWhoTog('r','" + n + "')");
          }).join('')
      + '</div>'
      /* A round number means a different thing in every division, so say so
         where the choice is made rather than letting an organiser find out
         from the schedule. */
      + '<div class="dw-note">Each division counts its own rounds, so round 3 can be a '
      + 'semi-final in one division and the final in another. Pick a stage for a finals day.</div>'
      + '<div class="lg-cfm-a"><button class="lg-btn ghost" onclick="FFPTourn.dayWhoClose()">Cancel</button>'
      + '<button class="lg-btn pri" onclick="FFPTourn.dayWhoApply()">Apply</button></div>'
      + '</div></div>';
  }
  function dayWhoTog(kind, v) {
    var arr = kind === 'd' ? (S._whoD = S._whoD || [])
            : kind === 's' ? (S._whoS = S._whoS || [])
            : (S._whoR = S._whoR || []);
    var val = (kind === 'd' || kind === 's') ? v : Number(v);
    var i = arr.indexOf(val);
    if (i >= 0) arr.splice(i, 1); else arr.push(val);
    renderTab();
  }
  /* Held with the rest of the tab's edits - nothing here saves itself. */
  function dayWhoApply() {
    var d = S.dayWho; if (!d) return;
    var base = dayBase(d);
    base.only_divisions = (S._whoD && S._whoD.length) ? S._whoD : null;
    base.only_rounds    = (S._whoR && S._whoR.length) ? S._whoR : null;
    var keepS = liveStages(S._whoS);
    base.only_stages    = keepS.length ? keepS : null;
    pend().days[d] = base;
    S.dayWho = null; S._whoD = null; S._whoR = null; S._whoS = null;
    renderTab();
  }

  /* THE ROW AS IT STANDS: whatever is waiting on Save, else what is stored,
     else the event's own times. Every writer below starts here, so one
     change to a day never drops another. */
  function dayBase(d) {
    var held = (S._pend && S._pend.days && S._pend.days[d]) || null;
    if (held) return held;
    var cur = ((S._dayWin || []).filter(function (r) { return r.on_date === d; })[0]) || {};
    var P = S.plan || {};
    return { tourn_id: S.eventId, on_date: d,
             opens: cur.closed ? null : (hm(cur.opens) || P.start || '09:00'),
             closes: cur.closed ? null : (hm(cur.closes) || P.end || '21:00'),
             closed: !!cur.closed,
             only_divisions: cur.only_divisions || null,
             only_rounds: cur.only_rounds || null,
             only_stages: cur.only_stages || null };
  }
  /* One row, held until Save. The window is written whole so the row either
     holds both ends or is not there at all. */
  async function daySave(d) {
    var row = document.querySelector('.sc-day .b[data-d="' + d + '"]'); if (!row) return;
    var a = row.querySelector('.dw-s').value, b = row.querySelector('.dw-e').value;
    if (!a || !b || b <= a) { toast('A day has to end after it starts', 'error'); return; }
    var row0 = dayBase(d);
    row0.opens = a; row0.closes = b; row0.closed = false;
    pend().days[d] = row0;
    schedBar();
  }
  /* Switching a day off and on again. A day switched off is stored closed
     rather than deleted, because "not played" is a decision, and a deleted
     row would quietly fall back to the event's own times. */
  async function dayShut(d) {
    var row0 = dayBase(d), P = S.plan || {}, was = !!row0.closed;
    row0.closed = !was;
    row0.opens = was ? (row0.opens || P.start || '09:00') : null;
    row0.closes = was ? (row0.closes || P.end || '21:00') : null;
    pend().days[d] = row0;
    renderTab();
  }

  // A court can be shut for part of a day. Breaks are saved, not typed into the
  // planner, so a later Rebuild steps over the same ones.
  function breakBlock(fields, breaks, dayList) {
    var courtOpts = function (sel) {
      return '<option value="">All ' + surfWord(true) + '</option>' + fields.map(function (f) {
        return '<option value="' + f.id + '"' + (sel === f.id ? ' selected' : '') + '>' + esc(f.name) + '</option>';
      }).join('');
    };
    var dayOpts = function (sel) {
      return '<option value="">Every day</option>' + dayList.map(function (d) {
        return '<option value="' + d + '"' + (sel === d ? ' selected' : '') + '>' + esc(dayShortYmd(d)) + '</option>';
      }).join('');
    };
    return '<div class="sc-brk"><span class="lb">Breaks, when a ' + surfWord() + ' is not in play</span>'
      + breaks.map(function (b) {
          return '<span class="b" data-id="' + b.id + '">'
            + '<select class="lg-sel bk-f" onchange="FFPTourn.breakSave(\'' + b.id + '\')">' + courtOpts(b.field_id) + '</select>'
            + '<select class="lg-sel dy bk-d" onchange="FFPTourn.breakSave(\'' + b.id + '\')">' + dayOpts(b.on_date) + '</select>'
            + '<input class="lg-in w bk-s" type="time" value="' + hm(b.starts_at) + '" onchange="FFPTourn.breakSave(\'' + b.id + '\')"><em>to</em>'
            + '<input class="lg-in w bk-e" type="time" value="' + hm(b.ends_at) + '" onchange="FFPTourn.breakSave(\'' + b.id + '\')">'
            + '<input class="lg-in nm bk-l" value="' + esc(b.label || '') + '" placeholder="What for" onchange="FFPTourn.breakSave(\'' + b.id + '\')">'
            + '<button class="sc-ic" title="Remove break" onclick="FFPTourn.breakRemove(\'' + b.id + '\')">' + ic('close') + '</button></span>';
        }).join('')
      + '<button class="lg-btn ghostb sc-abk" onclick="FFPTourn.breakAdd()">' + ic('add') + 'Add break</button>'
      + breakWarn() + '</div>';
  }
  /* A MATCH WITH NOWHERE TO GO IS SAID ON THE PAGE, not only in a toast that
     has already gone by the time anyone looks. The planner is bounded by the
     days the event actually runs and will not invent a fourth day for a
     three-day tournament, so this is how an organiser finds out the room
     they have given is too tight - and what to do about it. */
  function fitWarn() {
    var all = S._sched || [];
    var n = all.filter(function (m) { return !m.scheduled_at; }).length;
    /* nothing planned yet is not the same as nothing fitting */
    if (!n || n === all.length) return '';
    return '<div class="sc-brkwarn">' + ic('event_busy')
      + '<b>' + n + (n === 1 ? ' match does not fit' : ' matches do not fit')
      + ' in the days this event runs</b>'
      + '<i>Add a day, open the days for longer, or add ' + aSurf()
      + ', then rebuild</i></div>';
  }
  /* WHO CANNOT BE THERE, AND WHEN. A court closing is a fact about the venue
     and lives in Breaks; a player who cannot make Friday evening is a fact
     about the person, and the planner has to keep their matches out of that
     window or it produces a fixture nobody turns up to. Leaving the times
     empty means the whole day. */
  function awayBlock(dayList) {
    var nm = S._entNames || {};
    var ents = Object.keys(nm).map(function (id) { return { id: id, name: nm[id] }; })
      .sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
    var held = (S._pend && S._pend.away) || {};
    var rows = (S._unavail || []).map(function (u) {
      return held[u.id] ? Object.assign({}, u, held[u.id]) : u; });
    var entOptsFor = function (sel) {
      return '<option value="">Who\u2026</option>' + ents.map(function (e) {
        return '<option value="' + e.id + '"' + (sel === e.id ? ' selected' : '') + '>'
             + esc(e.name) + '</option>'; }).join('');
    };
    var dayOptsFor = function (sel) {
      return '<option value="">Every day</option>' + dayList.map(function (d) {
        return '<option value="' + d + '"' + (sel === d ? ' selected' : '') + '>'
             + esc(dayShortYmd(d)) + '</option>'; }).join('');
    };
    return '<div class="sc-brk"><span class="lb">Who cannot play, and when</span>'
      + rows.map(function (u) {
          return '<span class="b" data-uid="' + u.id + '">'
            + '<select class="lg-sel av-e" onchange="FFPTourn.awaySave(\'' + u.id + '\')">'
            +   entOptsFor(u.entrant_id) + '</select>'
            + '<select class="lg-sel dy av-d" onchange="FFPTourn.awaySave(\'' + u.id + '\')">'
            +   dayOptsFor(u.on_date) + '</select>'
            + '<input class="lg-in w av-s" type="time" value="' + esc(hm(u.from_at)) + '"'
            +   ' onchange="FFPTourn.awaySave(\'' + u.id + '\')"><em>to</em>'
            + '<input class="lg-in w av-t" type="time" value="' + esc(hm(u.to_at)) + '"'
            +   ' onchange="FFPTourn.awaySave(\'' + u.id + '\')">'
            + '<button class="sc-ic" title="Remove" onclick="FFPTourn.awayRemove(\'' + u.id + '\')">'
            +   ic('close') + '</button></span>';
        }).join('')
      + '<button class="lg-btn ghostb sc-abk" onclick="FFPTourn.awayAdd()">'
      +   ic('add') + 'Someone cannot make it</button>'
      + '<div class="sc-daynote">Leave the times empty and they are out for the whole day. '
      + 'Auto-plan keeps their matches clear of it.</div>'
      + '</div>';
  }
  /* Added straight away because a row with nothing in it has nothing to save;
     what goes IN it waits for Save like everything else on this tab. */
  async function awayAdd() {
    var r; try {
      r = await sb().from('tourn_unavail').insert({ tourn_id: S.eventId,
            entrant_id: null, on_date: null }).select('id').single();
    } catch (e) { r = { error: e }; }
    if (r && r.error) { toast('Could not add that', 'error'); return; }
    S._unavail = null; renderTab();
  }
  function awaySave(id) {
    var row = document.querySelector('.sc-brk .b[data-uid="' + id + '"]'); if (!row) return;
    var e = row.querySelector('.av-e').value || null;
    var d = row.querySelector('.av-d').value || null;
    var a = row.querySelector('.av-s').value || null;
    var b = row.querySelector('.av-t').value || null;
    if (a && b && b <= a) { toast('It has to end after it starts', 'error'); return; }
    if ((a && !b) || (b && !a)) { toast('Give both times, or neither', 'error'); return; }
    var q = pend(); q.away = q.away || {};
    q.away[id] = { entrant_id: e, on_date: d, from_at: a, to_at: b };
    schedBar();
  }
  async function awayRemove(id) {
    var r; try { r = await sb().from('tourn_unavail').delete().eq('id', id); }
    catch (e) { r = { error: e }; }
    if (r && r.error) { toast('Could not remove it', 'error'); return; }
    if (S._pend && S._pend.away) delete S._pend.away[id];
    S._unavail = null; toast('Removed', 'success'); renderTab();
  }
  /* Said once, where the breaks are edited, so it is read even by an organiser
     who never scrolls down to the court it happened on. */
  function breakWarn() {
    var n = breakClashes().length;
    if (!n) return '';
    return '<div class="sc-brkwarn">' + ic('warning')
      + '<b>' + n + (n === 1 ? ' match is' : ' matches are') + ' booked inside a break</b>'
      + '<i>They cannot be played, the ' + surfWord() + ' is closed</i><span class="sp"></span>'
      + '<button onclick="FFPTourn.breaksMoveOut()">Move them out</button></div>';
  }
  /* A MATCH INSIDE A BREAK IS A CLASH THE ORGANISER HAS TO SEE. The surface is
     shut in that window, so a match booked across it cannot be played. Adding a
     break moves what it displaces, but a time typed by hand afterwards lands
     straight back in one - so this is checked every time the row is drawn,
     never once at save time. */
  function hmMins(t) { var a = String(t || '').split(':'); return ((+a[0]) || 0) * 60 + ((+a[1]) || 0); }
  function inBreak(m) {
    if (!m || !m.scheduled_at) return null;
    var d = evDateStr(m.scheduled_at), t = evTimeStr(m.scheduled_at);
    if (!d || !t) return null;
    var s0 = hmMins(t), e0 = s0 + matchMins();
    return (S._breaks || []).filter(function (b) {
      return (!b.field_id || b.field_id === m.field_id)
          && (!b.on_date || b.on_date === d)
          && hmMins(b.starts_at) < e0 && hmMins(b.ends_at) > s0;
    })[0] || null;
  }
  function breakClashes() { return (S._sched || []).filter(function (m) { return !!inBreak(m); }); }
  /* The row carries its own time and the bar above carries the break's, so the
     row only has to name WHICH break - and "the Break break" is not a name. */
  function breakName(b) {
    var l = String((b || {}).label || '').trim();
    return (!l || l.toLowerCase() === 'break') ? 'a break' : 'the ' + l + ' break';
  }
  function breakBar(b, n) {
    n = n || 0;
    return '<div class="sc-bar' + (n ? ' clash' : '') + '">' + ic(n ? 'warning' : 'pause')
      + '<b>' + esc(b.label || 'Break') + '</b>'
      + '<span>' + hm(b.starts_at) + ' to ' + hm(b.ends_at) + ', ' + surfWord() + ' closed</span>'
      + (n ? '<span><b>' + n + (n === 1 ? ' match is' : ' matches are') + ' still booked in it</b></span>'
           + '<button class="fix" onclick="FFPTourn.breaksMoveOut()">Move them out</button>' : '')
      + '</div>';
  }
  async function breakAdd() {
    var r; try { r = await sb().from('tourn_breaks').insert({ tourn_id: S.eventId, starts_at: '13:00', ends_at: '14:00', label: 'Break', sort: (S._breaks || []).length }); } catch (e) { r = { error: e }; }
    if (r && r.error) { toast('Could not add the break', 'error'); return; }
    /* A break that changes nothing is just a drawing. Anything already booked
       inside it comes out the moment it is added - the same as saving one. */
    S._breaks = null; await applyBreaks(true);
    renderTab();
  }
  // Saving a break is not enough on its own: anything already booked inside it
  // has to come out. Only the matches a break displaces move, and the ones
  // behind them follow, so the order of play is kept. Courts without a break
  // are never touched.
  async function applyBreaks(said) {
    var P = S.plan || {};
    var r; try {
      r = await sb().rpc('tourn_breaks_apply', { p_tourn: S.eventId, p_match_len: P.len || 30, p_tz: evTz(), p_turnaround: P.turn || 0 });
    } catch (e) { r = { error: e }; }
    if (r && r.error) { toast('Breaks saved, but the matches could not be moved', 'error'); return 0; }
    var n = r.data || 0;
    if (said) toast(n ? n + (n === 1 ? ' match moved out of the break' : ' matches moved out of the breaks') : 'No match was inside a break', 'success');
    return n;
  }
  // Moves what a break displaces and everything behind it, keeping the order
  // of play. A match already played or in progress never moves.
  async function breaksMoveOut() { await applyBreaks(true); renderTab(); }
  async function breakSave(id) {
    var row = document.querySelector('.sc-brk .b[data-id="' + id + '"]'); if (!row) return;
    var st = row.querySelector('.bk-s').value, en = row.querySelector('.bk-e').value;
    if (!st || !en || en <= st) { toast('A break has to end after it starts', 'error'); return; }
    pend().breaks[id] = { field_id: row.querySelector('.bk-f').value || null,
                          on_date: row.querySelector('.bk-d').value || null,
                          starts_at: st, ends_at: en,
                          label: row.querySelector('.bk-l').value || null };
    schedBar();
  }
  async function breakRemove(id) {
    var r; try { r = await sb().from('tourn_breaks').delete().eq('id', id); } catch (e) { r = { error: e }; }
    if (r && r.error) { toast('Could not remove it', 'error'); return; }
    // Matches are not pulled back into the freed time: a schedule people have
    // already been given only ever moves when the organiser asks for it.
    renderTab();
  }

  function rebuildAsk() { S.rbAsk = true; renderTab(); }
  function rebuildCancel() { S.rbAsk = false; renderTab(); }
  function rebuildConfirm() {
    return '<div class="lg-cfm"><div class="lg-cfm-in">'
      + '<span class="ms lg-cfm-ic" style="color:var(--ffp-gold)">warning</span>'
      + '<div class="lg-cfm-t">Rebuild the whole schedule?</div>'
      + '<div class="lg-cfm-b">This replans every match in every division and will move matches that ' + nouns(curDv()).many + ' and officials have already been given times for. Results already entered are kept.'
      /* A pin is a promise. Say here that it is kept, before the press, not
         after - an organiser who has fixed the opening match is asking this
         exact question. */
      + (pinnedCount() ? ' <b>' + pinnedCount() + (pinnedCount() === 1 ? ' pinned match stays' : ' pinned matches stay')
          + ' exactly where ' + (pinnedCount() === 1 ? 'it is' : 'they are') + '.</b>' : '')
      + '</div>'
      + '<div class="lg-cfm-a"><button class="lg-btn ghost" onclick="FFPTourn.rebuildCancel()">Cancel</button>'
      + '<button class="lg-btn pri" onclick="FFPTourn.autoplan(1)">Yes, rebuild</button></div></div></div>';
  }
  function slotFrom(all, m, slot) {
    if (!all || !m) return '';
    for (var i = 0; i < all.length; i++) {
      var f2 = all[i];
      if (!f2.match_no) continue;
      if (f2.next_match_id === m.id && f2.next_slot === slot) return 'Winner M' + f2.match_no;
    }
    for (var j = 0; j < all.length; j++) {
      var f3 = all[j];
      if (!f3.match_no) continue;
      if (f3.loser_next_match_id === m.id && f3.loser_next_slot === slot) return 'Loser M' + f3.match_no;
    }
    return '';
  }
  function schedRow(m, fieldId, isFirst, isLast) {
    var names = m._names || {};
    var tv = m.scheduled_at ? evTimeStr(m.scheduled_at) : '';
    var open = S.schedOpen === m.id;
    var offTxt = (m._offs || []).map(function (o) {
      return ((SLOT_LABEL[o.role] || o.role || '') + ' ' + o.name).trim(); }).join(', ');
    /* One court hosts several divisions in a day, so the row says which this
       is, and the officials get a line of their own rather than trailing off
       the end of it. Moving the match to another court is a decision and lives
       in the menu; a row already sits under the bar that names its court, so
       only a match with no court yet says where it is. */
    var sub = (m._dnm ? m._dnm + ', ' : '') + matchLabel(m);
    var bk = inBreak(m);
    var place = schedPlace(m, fieldId);
    var row = '<div class="sc-m tg-d' + (m._dix || 0) + (open ? ' open' : '') + '" data-id="' + m.id + '">'
      /* THE TIME IS SHOWN HERE AND CHANGED IN THE MENU, with the day, the
         court and the officials. An input loose in the row meant a stray
         scroll over it re-timed a match, and every change rebuilt the list
         under the organiser's cursor. */
      + '<div class="t tm' + (tv ? '' : ' none') + (m.pinned ? ' pin' : '') + '">' + esc(tv || 'No time') + '</div>'
      + '<div class="g"><b>' + (m.match_no ? '<em class="mno">M' + m.match_no + '</em>' : '')
      +   esc(names[m.home_entrant] || slotFrom(S._schedMs, m, 1) || 'TBD') + ' v '
      +   esc(names[m.away_entrant] || slotFrom(S._schedMs, m, 2) || 'TBD') + '</b>'
      + '<span>' + esc(sub) + '</span>'
      + '<span class="clash"' + (bk ? '' : ' style="display:none"') + '>' + (bk ? 'Inside ' + esc(breakName(bk)) : '') + '</span>'
      + '<span class="off"' + (offTxt ? '' : ' style="display:none"') + '>' + esc(offTxt) + '</span></div>'
      + place
      /* Nothing to hold until it has a slot, so the pin is off rather than
         offered and refused. */
      + '<button class="sc-ic pin' + (m.pinned ? ' on' : '') + '"'
        + ((m.pinned || (m.scheduled_at && m.field_id)) ? '' : ' disabled')
        + ' title="' + (m.pinned ? 'Pinned here, a rebuild will not move it'
            : (m.scheduled_at && m.field_id) ? 'Pin this match here'
            : 'Give it a time and ' + aSurf() + ' first') + '"'
        + ' onclick="FFPTourn.pinMatch(\'' + m.id + '\')">' + ic('push_pin') + '</button>'
      + '<button class="sc-ic" title="Earlier" ' + (isFirst ? 'disabled' : '') + ' onclick="FFPTourn.schedMove(\'' + m.id + '\',-1)">' + ic('arrow_upward') + '</button>'
      + '<button class="sc-ic" title="Later" ' + (isLast ? 'disabled' : '') + ' onclick="FFPTourn.schedMove(\'' + m.id + '\',1)">' + ic('arrow_downward') + '</button>'
      + '<button class="sc-ic" title="More" onclick="FFPTourn.schedToggle(\'' + m.id + '\')">' + ic(open ? 'expand_less' : 'more_horiz') + '</button>'
      + '</div>';
    return open ? row + schedMore(m) : row;
  }

  function schedPlace(m, fieldId) {
    if (fieldId) return '';
    var fld = (S._fields || []).filter(function (f) { return f.id === m.field_id; })[0] || null;
    return fld
      ? '<div class="v"><b>' + esc(fld.venue || 'Venue not set') + '</b><span>' + esc(fld.name || '') + '</span></div>'
      : '<div class="v none"><b>No ' + surfWord() + ' yet</b><span>Set it in the menu</span></div>';
  }

  /* THE MENU IS BUILT ON ITS OWN so it can be put in and taken out without
     touching anything else on the page. Every control that changes a match
     lives in here, the time included. */
  function schedMore(m) {
    var tv = m.scheduled_at ? evTimeStr(m.scheduled_at) : '';
    var dv = (m.scheduled_at ? evDateStr(m.scheduled_at) : '') || ((S.detail.event && S.detail.event.starts_at) || '');
    var roleOpts = '<option value="">Role…</option>' + ROLES.map(function (r) { return '<option>' + r + '</option>'; }).join('');
    var offOpts = '<option value="">Official…</option>' + (S._offs || []).map(function (x) { return '<option value="' + x.id + '">' + esc(x.name || x.email) + '</option>'; }).join('');
    var tags = (m._offs || []).filter(function (o) { return SLOTS.indexOf(o.role) < 0; }).map(function (o) {
      return '<div class="lg-offtag"><span class="role">' + esc(o.role || 'Official') + '</span><span class="nm">' + esc(o.name) + '</span><span class="sp"></span><span class="ms x" onclick="FFPTourn.offRemove(\'' + o.id + '\')">close</span></div>';
    }).join('');
    return '<div class="sc-more" data-id="' + m.id + '">'
      + '<span class="lg-lab" style="margin:0">Time</span><input class="lg-in st-t" type="time" value="' + tv + '" onchange="FFPTourn.schedSet(\'' + m.id + '\')">'
      + '<span class="lg-lab" style="margin:0">Day</span><input class="lg-in st-d" type="date" value="' + dv + '" onchange="FFPTourn.schedSet(\'' + m.id + '\')">'
      + '<span class="lg-lab" style="margin:0">' + Surf() + '</span>'
      + '<select class="lg-sel st-f" onchange="FFPTourn.schedSet(\'' + m.id + '\')">' + surfaceOpts(S._fields, m.field_id) + '</select>'
      + '<button class="lg-btn sm" onclick="FFPTourn.openMatch(\'' + m.id + '\')">' + ic('scoreboard') + 'Match centre</button>'
      + '<span class="sp"></span>' + (tags ? '<div class="lg-offlist">' + tags + '</div>' : '')
      + offSlot(m, 'referee', 'Referee') + offSlot(m, 'ar1', 'Assistant 1') + offSlot(m, 'ar2', 'Assistant 2')
      + '</div>';
  }
  /* THE MATCH SHEET'S THREE STANDARD SLOTS. Grant: a Referee and two Assistant Referees,
     always there and ready to type into. A slot left empty writes NO ROW, so it is absent
     from _lt_match_officials and never reaches the FFP app or the broadcast graphics -
     "an empty field just will not show". Any other role an organiser added still appears
     as a tag above. The options come from lt_officials_list, which the database now
     returns A to Z. */
  var SLOTS = ['referee', 'ar1', 'ar2'];
  var SLOT_LABEL = { referee: 'Referee', ar1: 'Assistant 1', ar2: 'Assistant 2' };
  function offSlot(m, role, label) {
    var cur = (m._offs || []).filter(function (o) { return o.role === role; })[0];
    var sel = cur ? cur.official_id : '';
    return '<span class="lg-lab" style="margin:0">' + label + '</span>'
      + '<select class="lg-sel st-off" data-role="' + role + '" onchange="FFPTourn.offSet(\'' + m.id + '\')">'
      + '<option value="">Not set</option>'
      + (S._offs || []).map(function (x) {
          return '<option value="' + x.id + '"' + (x.id === sel ? ' selected' : '') + '>'
               + esc(x.name || x.email || 'Official') + '</option>'; }).join('')
      + '</select>';
  }
  async function offSet(matchId) {
    var row = document.querySelector('.sc-more[data-id="' + matchId + '"]'); if (!row) return;
    var pick = function (r) {
      var el = row.querySelector('.st-off[data-role="' + r + '"]');
      return (el && el.value) ? el.value : null;
    };
    var r;
    try {
      r = await sb().rpc('lt_match_officials_set', { p_scope: 'tourn', p_match: matchId,
            p_referee: pick('referee'), p_ar1: pick('ar1'), p_ar2: pick('ar2') });
    } catch (e) { r = { error: e }; }
    if (r.error) { toast('Could not save the officials', 'error'); return; }
    /* The officials just saved are put onto the match in memory and the row
       is redrawn on its own, so the menu stays open and the page stays put. */
    var m = (S._sched || []).filter(function (x) { return x.id === matchId; })[0];
    if (m) {
      var nameOf = {};
      (S._offs || []).forEach(function (o) { nameOf[o.id] = o.name || o.email || 'Official'; });
      var kept = (m._offs || []).filter(function (o) { return SLOTS.indexOf(o.role) < 0; });
      SLOTS.forEach(function (rl) {
        var v = pick(rl);
        if (v) kept.push({ id: null, official_id: v, role: rl, name: nameOf[v] || 'Official' });
      });
      m._offs = kept;
    }
    toast('Officials saved', 'success'); schedPatch(matchId);
  }

  /* KEEP THE ORGANISER'S PLACE where a rebuild is genuinely needed. */
  function schedKeepPlace(fn) {
    var keep = [], el = document.getElementById('lg-tab');
    while (el && el !== document.body) { if (el.scrollTop > 0) keep.push([el, el.scrollTop]); el = el.parentElement; }
    var y = window.scrollY || document.documentElement.scrollTop || 0;
    fn();
    var put = function () {
      keep.forEach(function (k) { k[0].scrollTop = k[1]; });
      window.scrollTo(0, y);
    };
    put();
    if (window.requestAnimationFrame) window.requestAnimationFrame(put);
  }

  /* ONE ROW REDRAWN WHERE IT STANDS. The list is deliberately not re-sorted:
     moving a match out from under the cursor the moment it is edited is the
     thing that made this screen unusable. It sorts again next time the tab is
     drawn, or when the organiser moves it with the arrows. */
  function schedPatch(id) {
    var m = (S._sched || []).filter(function (x) { return x.id === id; })[0];
    var row = document.querySelector('.sc-m[data-id="' + id + '"]');
    if (!m || !row) return;
    var tv = m.scheduled_at ? evTimeStr(m.scheduled_at) : '';
    var t = row.querySelector('.tm');
    if (t) { t.textContent = tv || 'No time'; t.className = 't tm' + (tv ? '' : ' none'); }
    var bk = inBreak(m);
    var cl = row.querySelector('.g .clash');
    if (cl) { cl.textContent = bk ? 'Inside ' + breakName(bk) : ''; cl.style.display = bk ? '' : 'none'; }
    var v = row.querySelector('.v');
    if (v) { var box = document.createElement('div'); box.innerHTML = schedPlace(m, null);
             if (box.firstChild) row.replaceChild(box.firstChild, v); }
    var off = row.querySelector('.g .off');
    if (off) {
      var txt = (m._offs || []).map(function (o) {
        return ((SLOT_LABEL[o.role] || o.role || '') + ' ' + o.name).trim(); }).join(', ');
      off.textContent = txt; off.style.display = txt ? '' : 'none';
    }
  }

  /* OPENING A ROW IS NOT A REASON TO REBUILD THE PAGE. The menu is inserted
     after the row and taken out again on its own, so nothing above it moves
     and the page stays exactly where it was. */
  function schedToggle(id) {
    var prev = S.schedOpen;
    if (prev) {
      var pm = document.querySelector('.sc-more[data-id="' + prev + '"]');
      if (pm && pm.parentNode) pm.parentNode.removeChild(pm);
      var pr = document.querySelector('.sc-m[data-id="' + prev + '"]');
      if (pr) { pr.classList.remove('open');
                var pb = pr.querySelectorAll('.sc-ic'); pb = pb[pb.length - 1];
                if (pb) pb.innerHTML = ic('more_horiz'); }
    }
    if (prev === id) { S.schedOpen = null; return; }
    S.schedOpen = id;
    var row = document.querySelector('.sc-m[data-id="' + id + '"]');
    var m = (S._sched || []).filter(function (x) { return x.id === id; })[0];
    if (!row || !m) { schedKeepPlace(renderTab); return; }
    row.classList.add('open');
    var bs = row.querySelectorAll('.sc-ic'); var b = bs[bs.length - 1];
    if (b) b.innerHTML = ic('expand_less');
    row.insertAdjacentHTML('afterend', schedMore(m));
  }
  // Reordering swaps this match's time with its neighbour on the same court,
  // so the order of play changes without anyone typing a time.
  async function pinMatch(id) {
    var m = (S._sched || []).filter(function (x) { return x.id === id; })[0]; if (!m) return;
    var want = !m.pinned;
    var r; try { r = await sb().rpc('tourn_match_pin', { p_match: id, p_on: want }); }
    catch (e) { r = { error: e }; }
    if (r.error || !(r.data && r.data.ok)) {
      toast((r.data && r.data.detail) === 'give it a time and a court first'
        ? 'Give it a time and ' + aSurf() + ' first' : 'Could not pin it', 'error');
      return;
    }
    m.pinned = want;
    toast(want ? 'Pinned, a rebuild will leave it where it is' : 'Unpinned', 'success');
    schedKeepPlace(renderTab);
  }
  function pinnedCount() {
    return (S._sched || []).filter(function (m) { return m.pinned; }).length;
  }
  async function schedMove(id, dir) {
    var all = S._sched || [];
    var me = all.find(function (x) { return x.id === id; }); if (!me || !me.scheduled_at) return;
    var mine = all.filter(function (x) { return x.field_id === me.field_id && x.scheduled_at && dayKey(x) === dayKey(me); })
      .sort(function (a, b) { return new Date(a.scheduled_at) - new Date(b.scheduled_at); });
    var i = mine.findIndex(function (x) { return x.id === id; });
    var j = i + dir;
    if (i < 0 || j < 0 || j >= mine.length) return;
    var other = mine[j], a = me.scheduled_at, b = other.scheduled_at;
    try {
      await sb().rpc('lt_match_schedule', { p_scope: 'tourn', p_match: me.id, p_when: b, p_field: me.field_id, p_court: null, p_official: null });
      await sb().rpc('lt_match_schedule', { p_scope: 'tourn', p_match: other.id, p_when: a, p_field: other.field_id, p_court: null, p_official: null });
    } catch (e) { toast('Could not move it', 'error'); return; }
    me.scheduled_at = b; other.scheduled_at = a;
    /* The arrows DO reorder the list, so this one is drawn again, but the page
       is put back exactly where it was. */
    schedKeepPlace(renderTab);
  }
  /* The main field is a property of the venue, not of a day's grid, and the
     plan needs to know it BEFORE the draw is made so the final is sent there.
     So it is set on the Venues tab and only reported on the schedule. */
  async function setMainCourt(fieldId, on) {
    try { await sb().rpc('lt_field_set_main', { p_id: fieldId, p_on: on !== false }); }
    catch (e) { toast('Could not set the main ' + surfWord(), 'error'); return; }
    toast(on === false ? 'No main ' + surfWord() + ' set' : 'Main ' + Surf() + ' set, the final will be played there', 'success');
    renderTab();
  }
  function matchEditor() {
    // The schedule shows every division at once, so an added match has to say
    // which division it belongs to rather than inherit whichever was last open.
    var divs = (S.detail && S.detail.divisions) || [];
    var dsel = divs.length < 2 ? '' :
      '<select class="lg-sel" style="flex:0 0 170px;min-width:0" onchange="FFPTourn.setAddDiv(this.value)">'
      + divs.map(function (d) { return '<option value="' + d.id + '"' + (d.id === S.divId ? ' selected' : '') + '>' + esc(d.name) + '</option>'; }).join('')
      + '</select>';
    return '<div class="lg-edit lg-maed">' + dsel + '<select class="lg-sel" id="tg-mm-h" style="flex:1;min-width:150px">' + entOpts(null) + '</select>'
      + '<span style="font-weight:800;color:#8a99a6">v</span><select class="lg-sel" id="tg-mm-a" style="flex:1;min-width:150px">' + entOpts(null) + '</select>'
      + '<input class="lg-in" id="tg-mm-r" type="number" placeholder="Round" value="1" style="width:90px">'
      + '<button class="lg-btn pri" onclick="FFPTourn.saveMatch()">' + ic('check') + 'Add</button>'
      + '<button class="lg-btn ghost" onclick="FFPTourn.cancelMatch()">Cancel</button></div>';
  }
  function addMatch(slot) { S.addMatch = slot || 'loose'; renderTab(); }
  // Changing the division changes who can be picked, so the roster is reloaded.
  async function setAddDiv(id) { S.divId = id; await loadEntrantsArr(); renderTab(); }
  function cancelMatch() { S.addMatch = null; renderTab(); }
  async function saveMatch() {
    var h = (document.getElementById('tg-mm-h') || {}).value || null, a = (document.getElementById('tg-mm-a') || {}).value || null, rd = +((document.getElementById('tg-mm-r') || {}).value) || 1;
    if (!h || !a || h === a) { toast('Pick two different ' + nouns(curDv()).many, 'error'); return; }
    var r; try { r = await sb().rpc('lt_match_add', { p_scope: 'tourn', p_division: S.divId, p_round: rd, p_home: h, p_away: a, p_when: null, p_field: null, p_stage: 'bracket' }); } catch (e) { r = { error: e }; }
    if (r.error) { toast('Could not add', 'error'); return; }
    // Added from a court means it belongs on that court, after what is already on it.
    var slot = String(S.addMatch || ''), newId = (r.data && r.data.id) || r.data;
    if (slot.indexOf('|') > -1 && newId) {
      var day = slot.split('|')[0], fid = slot.split('|')[1];
      var same = (S._sched || []).filter(function (x) { return x.field_id === fid && x.scheduled_at && evDateStr(x.scheduled_at) === day; });
      var lastMs = same.reduce(function (acc, x) { return Math.max(acc, new Date(x.scheduled_at).getTime()); }, 0);
      var len = Math.max(5, +((document.getElementById('tg-mlen') || {}).value) || 30);
      var when = lastMs ? new Date(lastMs + len * 60000).toISOString() : evIso(day, '09:00');
      try { await sb().rpc('lt_match_schedule', { p_scope: 'tourn', p_match: newId, p_when: when, p_field: fid, p_court: null, p_official: null }); } catch (e) {}
    }
    S.addMatch = null; toast('Match added', 'success'); renderTab();
  }
  // One press builds every division at once, so two divisions cannot be handed
  // the same court at the same moment, and nothing is left waiting for a court
  // that another division is quietly sitting on. Pressed once; after that the
  // grid is edited by hand and replanning has to be asked for.
  async function autoplan(isRebuild) {
    var P = planNow(); S.plan = P;
    var args = { p_tourn: S.eventId, p_match_len: P.len, p_day_start: P.start, p_day_end: P.end,
                 p_days: P.days, p_round_gap: P.gap, p_rest: P.rest, p_divisions: null,
                 p_tz: evTz(), p_turnaround: P.turn };
    var r; try { r = await sb().rpc('tourn_autoplan_all', args); } catch (e) { r = { error: e }; }
    S.rbAsk = false;
    if (r.error) { toast(/no_fields/.test(r.error.message || '') ? 'Add ' + aSurf() + ' first (Venues tab)' : 'Could not plan', 'error'); renderTab(); return; }
    var d = r.data || {}, n = d.placed || 0, over = d.over || 0;
    toast(n + (n === 1 ? ' match planned' : ' matches planned')
      + (over ? ', ' + over + (over === 1 ? ' would not fit' : ' would not fit')
                + ' - add a day, open the days for longer, or add '
                + aSurf() : ''), over ? 'error' : 'success');
    renderTab();
  }
  async function schedSet(id) {
    /* Time, day and court all live in the menu now, so a closed menu means
       nothing was touched and the match keeps what it already had. */
    var more = document.querySelector('.sc-more[data-id="' + id + '"]');
    var cur0 = (S._sched || []).filter(function (x) { return x.id === id; })[0] || {};
    var val = function (sel) { var el = more && more.querySelector(sel); return el ? el.value : null; };
    var tv = val('.st-t'); if (tv === null) tv = cur0.scheduled_at ? evTimeStr(cur0.scheduled_at) : '';
    var dv = val('.st-d'); if (dv === null) dv = cur0.scheduled_at ? evDateStr(cur0.scheduled_at) : '';
    var fsel = more && more.querySelector('.st-f');
    var fid = fsel ? (fsel.value || null) : (cur0.field_id || null);
    var was = cur0.scheduled_at ? evDateStr(cur0.scheduled_at) : '';
    var base = dv || (S.detail.event && S.detail.event.starts_at) || evDateStr(new Date().toISOString());
    var when = (tv || dv) ? evIso(base, tv || '00:00') : null;
    var r; try {
      r = await sb().rpc('lt_match_schedule', { p_scope: 'tourn', p_match: id, p_when: when,
            p_field: fid, p_court: null, p_official: null });
    } catch (e) { r = { error: e }; }
    if (r && r.error) { toast('Could not reschedule', 'error'); return; }
    cur0.scheduled_at = when; cur0.field_id = fid;
    // typed straight into a break: say so now, not when someone turns up to play
    var bk = inBreak({ scheduled_at: when, field_id: fid });
    if (bk) toast('Rescheduled, but that is inside ' + breakName(bk), 'error');
    else toast('Rescheduled', 'success');
    /* A change of DAY moves the match under a different heading, so the list
       has to be drawn again. Everything else is redrawn where it stands. */
    if (base !== was) { schedKeepPlace(renderTab); return; }
    schedPatch(id);
  }
  async function offAdd(matchId) {
    var row = document.querySelector('.sc-more[data-id="' + matchId + '"]'); if (!row) return;
    var role = (row.querySelector('.a-role') || {}).value || null, off = (row.querySelector('.a-off') || {}).value || null;
    if (!off) { toast('Pick an official', 'error'); return; }
    var r; try { r = await sb().rpc('lt_match_official_add', { p_scope: 'tourn', p_match: matchId, p_official: off, p_role: role }); } catch (e) { r = { error: e }; }
    if (r.error) { toast('Could not assign', 'error'); return; } toast('Assigned', 'success'); renderTab();
  }
  async function offRemove(id) {
    await sb().rpc('lt_match_official_remove', { p_id: id });
    schedKeepPlace(renderTab);
  }

  // ---------- INFORMATION (what members see in the app) ----------
  async function renderInformation(host) {
    var ev = S.detail.event || {}; await taxReady();
    host.innerHTML =
      '<div class="lg-fld"><div class="lg-lab">Status</div><div class="lg-seg lg-status4" id="tg-status">' + statusSegBtns(ev.status, 'FFPTourn') + '</div></div>'
      + '<div class="lg-fld"><div class="lg-lab">Tournament name</div><input class="lg-in" id="tg-name" value="' + esc(ev.name) + '"></div>'
      + '<div class="lg-2"><div class="lg-fld"><div class="lg-lab">Logo</div><div class="lg-logo" onclick="FFPTourn.pickImg(\'logo\')" style="' + (ev.logo_url ? 'background-image:url(\'' + esc(ev.logo_url) + '\')' : '') + '">' + (ev.logo_url ? '' : '<span class="ms">add_photo_alternate</span><span>Logo</span>') + '</div></div>'
      + '<div class="lg-fld"><div class="lg-lab">Banner, 16:9, as shown in the app</div><div class="lg-banner16" onclick="FFPTourn.pickImg(\'cover\')" style="' + (ev.cover_url ? 'background-image:url(\'' + esc(ev.cover_url) + '\')' : '') + '">' + (ev.cover_url ? '' : '<span class="ms">image</span><span>Add banner</span>') + '</div></div></div>'
      + '<div class="lg-2"><div class="lg-fld"><div class="lg-lab">City</div><input class="lg-in" id="tg-city" list="tg-cityl" value="' + esc(ev.city || '') + '"><datalist id="tg-cityl">' + dlOpts(cityNames()) + '</datalist></div><div class="lg-fld"><div class="lg-lab">Country</div><input class="lg-in" id="tg-country" list="tg-cntl" value="' + esc(ev.country || '') + '"><datalist id="tg-cntl">' + dlOpts(countryNames()) + '</datalist></div></div>'
      + '<div class="lg-2"><div class="lg-fld"><div class="lg-lab">Starts</div><input class="lg-in" id="tg-start" type="date" value="' + esc(ev.starts_at || '') + '"></div><div class="lg-fld"><div class="lg-lab">Ends</div><input class="lg-in" id="tg-end" type="date" value="' + esc(ev.ends_at || '') + '"></div></div>'
      // Sign up: when entries open and close, what it costs, and how they pay.
      // reg_opens_at / reg_closes_at are timestamps, so date and time are two
      // fields and joinDT() puts them back together on save.
      + '<div class="lg-fld"><div class="lg-lab">Sign up opens</div><div class="lg-2">'
      +   '<input class="lg-in" id="tg-ro-d" type="date" value="' + esc(dPart(ev.reg_opens_at)) + '">'
      +   '<input class="lg-in" id="tg-ro-t" type="time" value="' + esc(tPart(ev.reg_opens_at)) + '"></div></div>'
      + '<div class="lg-fld"><div class="lg-lab">Sign up closes</div><div class="lg-2">'
      +   '<input class="lg-in" id="tg-rc-d" type="date" value="' + esc(dPart(ev.reg_closes_at)) + '">'
      +   '<input class="lg-in" id="tg-rc-t" type="time" value="' + esc(tPart(ev.reg_closes_at)) + '"></div></div>'
      + '<div class="lg-2"><div class="lg-fld"><div class="lg-lab">Entry fee, per entry</div><input class="lg-in" id="tg-fee" type="number" min="0" step="0.01" value="' + (ev.entry_fee != null ? esc(ev.entry_fee) : '') + '"></div>'
      +   '<div class="lg-fld"><div class="lg-lab">Currency</div><input class="lg-in" id="tg-cur" maxlength="3" placeholder="AED" value="' + esc(ev.currency || '') + '"></div></div>'
      + '<div class="lg-fld"><div class="lg-lab">How to pay <span style="font-weight:500;color:#8a99a8;">\u2014 shown after they sign up</span></div>'
      +   '<textarea class="lg-in" id="tg-payhow" rows="2" placeholder="Bank transfer to\u2026 , or pay on the day at the desk">' + esc(ev.pay_instructions || '') + '</textarea></div>'
      + '<div class="lg-fld"><div class="lg-lab">About</div><textarea class="lg-in" id="tg-desc" rows="3">' + esc(ev.description || '') + '</textarea></div>'
      + '<div class="lg-fld"><div class="lg-lab">Rules</div><textarea class="lg-in" id="tg-rules" rows="3">' + esc(ev.rules || '') + '</textarea>'
      +   '<div id="tg-pdfwrap">' + rulesPdfHtml(ev) + '</div></div>'
      + '<div class="lg-fld"><div class="lg-lab">Live stream URL <span style="font-weight:500;color:#8a99a8;">— the tournament\'s main channel, YouTube, Twitch or Facebook</span></div><input class="lg-in" id="tg-stream" value="' + esc(ev.stream_url || '') + '" placeholder="https://…"></div>'
      + '<button class="lg-btn pri" onclick="FFPTourn.saveDetails()">' + ic('check') + 'Save</button>'
      + endBlock(ev);
  }

  // ---------- SETUP (how the tournament is run) ----------
  // Sport and who competes are set once for the whole tournament; the format
  // is per division, because a club event runs its A grade and its juniors
  // differently on the same weekend.
  var ENTRANT_MODES = [
    ['individual', 'Individuals', 'One player per entry'],
    ['team', 'Teams', 'A squad per entry'],
    ['mixed', 'Both', 'Singles and doubles, like tennis']
  ];
  /* An organiser reading "Monrad" learns nothing. Each format carries an info
     icon that says what it IS, a worked example at a real size, and when to
     PICK it. Kept in one place so the wording is edited once. */
  var FMT_INFO = {
    grp: ['Everyone in a pool plays everyone else in that pool. The final table decides it and there is no knockout after it.',
          'With 8 {many} in 2 pools that is 6 matches a pool, 12 in all, and every {one} plays 3 times.',
          'Pick it when guaranteed games matter more than a final, like a social league day.'],
    gk: ['Pools first, then the top few of each pool cross into a knockout bracket. You choose how many advance per pool.',
         'With 16 in 4 pools taking the top 2, that is 24 pool matches and then an 8-{one} bracket to the final.',
         'The usual shape for a weekend tournament: everyone is guaranteed pool games, and it still ends in a final.'],
    ko: ['A straight bracket. Lose once and you are out. The draw is built to the next power of two and anyone short of a first-round opponent gets a bye.',
         'With 4 {many} that is 2 semi-finals and a final, 3 matches. With 12 it builds a 16 draw and 4 {many} get byes.',
         'Pick it when time is short, or when the seeding already tells you who should meet late.'],
    monrad: ['Nobody goes home. After each round winners are paired with winners and losers with losers, so every place from 1st to last is played off.',
             'With 8 {many} every one plays 3 rounds and finishes with a ranking of 1 to 8, not just a champion.',
             'Pick it for a one-day club event where everyone wants a full day of matches.'],
    tiered: ['{Many} are banded by ability first, then pooled inside their band, so matches stay even.',
             'With 12 {many} in 3 bands of 4, a strong {one} never draws a beginner in round one.',
             'Pick it for a mixed-ability field where a lopsided first round would spoil the day.'] // sport-words-ok -- the field is the entrants, not the ground
  };
  function fmtInfoBox(k) {
    var f = FORMATS.find(function (x) { return x[0] === k; }), i = FMT_INFO[k];
    if (!f || !i) return '';
    return '<div class="tg-nfobox">'
      + '<button class="close" onclick="FFPTourn.fmtInfo(null)" title="Close">' + ic('close') + '</button>'
      + '<h4>' + ic('info') + esc(f[1]) + '</h4>'
      + '<p>' + esc(say(i[0])) + '</p>'
      + '<p><b>For example.</b> ' + esc(say(i[1])) + '</p>'
      + '<p><b>When to pick it.</b> ' + esc(say(i[2])) + '</p></div>';
  }
  function fmtInfo(k) { S.fmtInfo = (S.fmtInfo === k) ? null : k; renderTab(); }
  /* Every extra draw in one place, so an organiser can compare them instead of
     clicking through the dropdown one at a time to read each hint. */
  function sideInfoBox(dv) {
    return '<div class="tg-nfobox solo">'
      + '<button class="close" onclick="FFPTourn.sideInfo()" title="Close">' + ic('close') + '</button>'
      + '<h4>' + ic('info') + 'What happens to a beaten ' + nouns(dv).one + '</h4>'
      + SIDE_DRAWS.map(function (x) {
          return '<div class="opt"><b>' + esc(x[1]) + '</b><span>' + esc(say(x[2], dv)) + '</span></div>';
        }).join('')
      + '</div>';
  }
  function sideInfo() { S.sideInfo = !S.sideInfo; renderTab(); }

  var FORMATS = [
    ['grp', 'Groups only', 'Round-robin, final table'],
    ['gk', 'Groups, then knockout', 'Top {many} advance to a bracket'],
    ['ko', 'Knockout', 'Single elimination, losers are out'],
    ['monrad', 'Monrad', 'Everyone keeps playing, every place decided'],
    ['tiered', 'Tiered pools', 'Pools by ability, every {one} placed']
  ];

  /* ── BONUS POINTS ───────────────────────────────────────────────────────
     A rule is one sentence the organiser completes: a type, a number, a
     scoring kind where the type needs one, and what it is worth. The kinds
     come from the sport's own scoring_kinds - never typed - and the database
     validates the whole array again on save, so a stale page cannot store a
     rule the table is unable to evaluate.

     One wrinkle worth knowing: rugby's default counts ["try","penalty_try"]
     together, because a penalty try IS a try. The picker shows one kind, so
     leaving it alone keeps the pair, and changing it replaces the pair with
     the single kind chosen. */
  var BP_TYPES = [['kind_count', 'Scoring bonus'], ['losing_margin', 'Losing bonus'],
                  ['kind_diff', 'Scoring difference'], ['winning_margin', 'Winning margin']];
  function bpKinds() {
    var s = (S.detail && S.detail.schema) || {};
    return (s.scoring_kinds || []).filter(function (k) {
      return k && k.key && Number(k.points || 0) > 0;
    });
  }
  function bpInherited(d) {
    var ev = (S.detail && S.detail.event) || {}, sc = (S.detail && S.detail.schema) || {};
    var r = (d && d.bonus_rules) || ev.bonus_rules || sc.bonus_rules || [];
    return Array.isArray(r) ? r.slice(0, 8) : [];
  }
  function bpStart(d) {
    S._bp = bpInherited(d).map(function (r) { return JSON.parse(JSON.stringify(r)); });
  }
  /* read the rows back into the working copy BEFORE re-rendering, or changing
     a type would throw away the number beside it */
  function bpSync() {
    (S._bp || []).forEach(function (r, i) {
      var t = v('bp' + i + '-t'); if (t) r.type = t;
      var n = v('bp' + i + '-n'); if (n !== '' && n != null) r.n = +n;
      var p = v('bp' + i + '-p'); if (p !== '' && p != null) r.pts = +p;
      var k = v('bp' + i + '-k');
      if (k && !(r.kinds && r.kinds[0] === k)) r.kinds = [k];
    });
  }
  function bpRow(r, i) {
    var kinds = bpKinds();
    var kv = (r.kinds && r.kinds[0]) || (kinds[0] && kinds[0].key) || '';
    var ksel = '<select class="lg-sel bp-k" id="bp' + i + '-k">'
      + kinds.map(function (k) {
          return '<option value="' + esc(k.key) + '"' + (k.key === kv ? ' selected' : '')
               + '>' + esc(k.label || k.key) + '</option>'; }).join('')
      + '</select>';
    var n = '<input class="lg-in bp-n" id="bp' + i + '-n" type="number" min="1" value="' + (r.n || 1) + '">';
    var mid = r.type === 'losing_margin'
        ? '<span class="bp-w">lose by</span>' + n + '<span class="bp-w">or fewer</span>'
      : r.type === 'winning_margin'
        ? '<span class="bp-w">win by</span>' + n + '<span class="bp-w">or more</span>'
      : r.type === 'kind_diff'
        ? n + '<span class="bp-w">or more</span>' + ksel + '<span class="bp-w">than the opponent</span>'
        : n + '<span class="bp-w">or more</span>' + ksel;
    return '<div class="bp-r">'
      + '<select class="lg-sel bp-t" id="bp' + i + '-t" onchange="FFPTourn.bpType()">'
      +   BP_TYPES.map(function (t) {
            return '<option value="' + t[0] + '"' + (t[0] === r.type ? ' selected' : '')
                 + '>' + t[1] + '</option>'; }).join('')
      + '</select>'
      + '<div class="bp-mid">' + mid + '</div>'
      + '<div class="bp-pts"><input class="lg-in bp-n" id="bp' + i + '-p" type="number" min="1" value="'
      +   (r.pts || 1) + '"><span class="bp-w">pt</span></div>'
      + '<span class="ms bp-x" title="Remove" onclick="FFPTourn.bpDel(' + i + ')">close</span>'
      + '</div>';
  }
  function bpHtml() {
    return (S._bp || []).map(bpRow).join('')
      || '<div class="bp-none">No bonus points. ' + nouns(curDv()).Many + ' score on the win, draw and loss values above.</div>';
  }
  function bpRender() { var h = document.getElementById('bp-list'); if (h) h.innerHTML = bpHtml(); }
  function bpType() { bpSync(); bpRender(); }
  function bpDel(i) { bpSync(); (S._bp || []).splice(i, 1); bpRender(); }
  function bpAdd() {
    bpSync(); S._bp = S._bp || [];
    if (S._bp.length >= 8) { toast('Eight bonus points is the limit', 'error'); return; }
    var k = bpKinds()[0];
    S._bp.push(k ? { type: 'kind_count', n: 4, pts: 1, kinds: [k.key] }
                 : { type: 'losing_margin', n: 7, pts: 1 });
    bpRender();
  }
  /* what goes to the database. A scoring rule with no kind cannot be
     evaluated, so it is dropped here rather than being refused on save. */
  function bpRead() {
    bpSync();
    return (S._bp || []).map(function (r) {
      var o = { type: r.type, n: Math.max(1, +r.n || 1), pts: Math.max(1, +r.pts || 1) };
      if (r.type === 'kind_count' || r.type === 'kind_diff') {
        o.kinds = (r.kinds && r.kinds.length) ? r.kinds : null;
      }
      return o;
    }).filter(function (o) {
      return (o.type === 'kind_count' || o.type === 'kind_diff') ? !!o.kinds : true;
    });
  }
  function bpBlock(d) {
    bpStart(d);
    return '<div class="lg-fld bp-blk"><div class="lg-lab">Bonus points</div>'
      + '<div id="bp-list">' + bpHtml() + '</div>'
      + '<button class="lg-btn bp-add" onclick="FFPTourn.bpAdd()">' + ic('add') + 'Add a bonus point</button>'
      + '<div class="tg-hint">Counted from what the scorer records. A scoring bonus reads the events '
      + 'logged in the match, named player or not. A margin bonus reads the final score.</div></div>';
  }

  /* A tournament could never set its own points: the table used whatever the
     sport said. These resolve the same way leagues do - division, then event,
     then the sport - and they are only offered where there is a table to
     rank. A straight knockout has nothing for points to do. */
  function tgPts(dv) {
    var ev = (S.detail && S.detail.event) || {}, sc = (S.detail && S.detail.schema) || {};
    var pick = function (a, b, c, d) {
      return a != null && a !== '' ? a : (b != null && b !== '' ? b : (c != null && c !== '' ? c : d)); };
    return { win: pick(dv.win_pts, ev.win_pts, sc.win_pts, 3),
             draw: pick(dv.draw_pts, ev.draw_pts, sc.draw_pts, 1),
             loss: pick(dv.loss_pts, ev.loss_pts, sc.loss_pts, 0) };
  }
  function tgPtsBlock(dv) {
    var p = tgPts(dv);
    return '<div class="lg-3">'
      + '<div class="lg-fld"><div class="lg-lab">Win pts</div><input class="lg-in" id="tg-win" type="number" value="' + p.win + '"></div>'
      + '<div class="lg-fld"><div class="lg-lab">Draw pts</div><input class="lg-in" id="tg-draw" type="number" value="' + p.draw + '"></div>'
      + '<div class="lg-fld"><div class="lg-lab">Loss pts</div><input class="lg-in" id="tg-loss" type="number" value="' + p.loss + '"></div></div>'
      + bpBlock(dv);
  }

  /* WHAT THE FORMAT ASKS FOR versus WHAT IS ON THE GROUND. Returns null when
     they agree, else the plain-English difference. */
  var SIDE_LAB = { plate: 'Plate', bowl: 'Bowl', shield: 'Shield', places: 'Placings' };
  function sideDrawsWanted(d) {
    var v = d.side_draws || 'none';
    if (v === 'none' || v === 'places') return [];
    return v.split('_').filter(function (x) { return x && SIDE_LAB[x]; });
  }
  function drawStale(d) {
    var bad = [];
    var pools = d.built_pools || 0;
    var have = d.built_draws || [];
    /* pools on the ground that the format does not ask for */
    if (!d.group_stage && pools > 0) {
      bad.push(pools + (pools === 1 ? ' group match' : ' group matches')
               + ' from a format this division no longer uses');
    }
    /* side draws the format asks for that were never built */
    var missing = sideDrawsWanted(d).filter(function (k) { return have.indexOf(k) < 0; });
    if (missing.length) {
      bad.push('no ' + missing.map(function (k) { return SIDE_LAB[k]; }).join(', ') + ' draw');
    }
    return bad.length ? bad : null;
  }
  function staleBar(d, bad) {
    return '<div class="tg-stale">' + ic('sync_problem')
      + '<div class="g"><b>This draw does not match the format</b>'
      + '<span>' + esc(bad.join(', and ')) + '. The format is saved, the draw was built before it.</span></div>'
      + '<button class="lg-btn gold" onclick="event.stopPropagation();FFPTourn.setDiv(\'' + d.id + '\',\'setup\')">'
      + 'Open and rebuild</button></div>';
  }
  function fmtOfDiv(d) {
    if (d.draw_format === 'tiered') return 'tiered';
    return d.draw_format === 'monrad' ? 'monrad' : (d.group_stage ? (d.groups_advance ? 'gk' : 'grp') : 'ko');
  }

  /* ── THE TIERED LADDER ──────────────────────────────────────────────────
     The same rule the database runs, so the preview cannot promise a draw the
     engine would not build. Pools are TIERS, A strongest. Each sends the
     number its tier earns into the top band; everyone left is ranked by
     FINISHING POSITION first and pool tier second, then cut into bands. That
     ordering is the whole thing - 1C sorts above 3A, so the bottom pool's
     winner meets the top pool's straggler.
     An odd band gives its foot to the lowest slot on pool record and the rest
     cross above it, never the middle team. */
  function tierSizes(n, g) {
    var base = Math.floor(n / g), rem = n % g, out = [];
    for (var i = 0; i < g; i++) out.push(base + (i >= g - rem ? 1 : 0));
    return out;
  }
  function tierBands(sizes, quota, bandSize) {
    var all = [], cup = [], i, pos;
    for (i = 0; i < sizes.length; i++) {
      for (pos = 1; pos <= sizes[i]; pos++) all.push({ pos: pos, tier: i });
      for (pos = 1; pos <= Math.min(quota[i] || 0, sizes[i]); pos++) cup.push({ pos: pos, tier: i });
    }
    var nm = function (s) { return s.pos + String.fromCharCode(65 + s.tier); };
    var by = function (a, b) { return (a.pos - b.pos) || (a.tier - b.tier); };
    var taken = {}; cup.forEach(function (s) { taken[nm(s)] = 1; });
    var rest = all.filter(function (s) { return !taken[nm(s)]; }).sort(by);
    var bands = [cup.slice().sort(by)];
    for (i = 0; i < rest.length; i += bandSize) bands.push(rest.slice(i, i + bandSize));
    var place = 1;
    return bands.filter(function (b) { return b.length; }).map(function (b) {
      var from = place, to = place + b.length - 1; place = to + 1;
      var play = b.length % 2 === 1 ? b.slice(0, -1) : b, ties = [];
      for (var j = 0; j < play.length / 2; j++) ties.push([nm(play[j]), nm(play[play.length - 1 - j])]);
      return { from: from, to: to, slots: b.map(nm), ties: ties };
    });
  }
  function tierCfg(dv) {
    var g = Math.max(2, +(document.getElementById('tg-np') || {}).value || dv.num_groups || 3);
    var bs = Math.max(2, +(document.getElementById('tg-bs') || {}).value || dv.band_size || 4);
    var q = [], el, i;
    for (i = 0; i < g; i++) {
      el = document.getElementById('tg-q' + i);
      q.push(el ? Math.max(0, +el.value || 0) : ((dv.tier_quota || [])[i] != null ? dv.tier_quota[i] : (i < 2 ? 2 : 0)));
    }
    return { g: g, bs: bs, q: q, n: dv.entrant_count || 0, mode: intakeOf(dv) };
  }
  function intakeOf(dv) { return dv.cup_intake === 'cross' ? 'cross' : 'quota'; }

  /* ── WHEN THE FINALS SERIES PLAYS ───────────────────────────────────────
     The finals series is the last three rounds of the draw - quarter-final,
     semi-final and final, with the 3rd-place play-off beside the final.
     Left alone, a small division races through its rounds and crowns a
     champion while a bigger one is still playing pool matches. */
  function finalsOf(dv) {
    return dv.finals_when === 'last' ? 'last' : (dv.finals_when === 'at' ? 'at' : 'asap');
  }
  function finalsAtOf(dv) {
    var t = dv.finals_at ? String(dv.finals_at) : '';
    return /^\d{2}:\d{2}/.test(t) ? t.slice(0, 5) : '15:00';
  }
  function finalsBlock(dv) {
    var w = finalsOf(dv);
    return '<div class="lg-fld tg-fin"><div class="lg-lab">When the finals series plays</div>'
      + '<select class="lg-sel" id="tg-fwhen" onchange="FFPTourn.finalsWhen(this)">'
      +   '<option value="asap"' + (w === 'asap' ? ' selected' : '') + '>As soon as each round is ready</option>'
      +   '<option value="last"' + (w === 'last' ? ' selected' : '') + '>Last, after every other match</option>'
      +   '<option value="at"'   + (w === 'at'   ? ' selected' : '') + '>Not before a set time</option>'
      + '</select>'
      + (w === 'at'
          ? '<div class="tg-finat"><span>Not before</span>'
            /* NOT tg-num: that caps at 118px, and a 12-hour time field plus
               its clock icon rendered "03:00 P" with the M cut off. */
            + '<input class="lg-in tg-tin" id="tg-fat" type="time" value="' + esc(finalsAtOf(dv)) + '"></div>'
          : '')
      + '<div class="tg-hint">Quarter-final, semi-final and final, with the 3rd-place play-off beside the final. '
      + (w === 'last'
          ? 'Held until every other match in the tournament has a time, so the day ends on the finals and the highest category&rsquo;s final is the last match on.'
          : w === 'at'
          ? 'Nothing in the series starts before that time. Everything else fills the courts until then.'
          : 'Each round goes out as soon as the one before it is done, which can crown one category&rsquo;s champion while another is still playing its pools.')
      + '</div></div>';
  }
  function finalsWhen(sel) {
    var dv = (S.detail.divisions || []).find(function (x) { return x.id === S.divId; }); if (!dv) return;
    /* the time field appears and disappears with the choice, so the block is
       laid out again - reading the time back first, so it is not lost */
    var t = document.getElementById('tg-fat');
    if (t && t.value) dv.finals_at = t.value;
    dv.finals_when = (sel && /^(last|at)$/.test(sel.value)) ? sel.value : 'asap';
    renderTab();
  }

  /* ── RANKED ACROSS THE POOLS ────────────────────────────────────────────
     The database orders every team by FINISHING POSITION first and then by
     record per match played (_tourn_cross_rank), so seed n belongs to a known
     position: with pools of 3, 3 and 4 the first three seeds are the pool
     winners, the next three the runners-up, and so on. Naming each slot that
     way is the only honest preview - a bare "seed 4" is nothing an organiser
     can plan against, and it is not what the sport calls it either. */
  function crossSeeds(sizes) {
    var POS = ['pool winner', 'runner-up', '3rd-placed', '4th-placed', '5th-placed', '6th-placed'];
    var NTH = ['Best', '2nd-best', '3rd-best', '4th-best', '5th-best', '6th-best'];
    var maxPos = Math.max.apply(null, sizes), out = [], pos, within, n, word, txt;
    for (pos = 1; pos <= maxPos; pos++) {
      n = sizes.filter(function (s) { return s >= pos; }).length;
      word = POS[pos - 1] || (pos + 'th-placed');
      for (within = 1; within <= n; within++) {
        txt = n === 1 ? word : (NTH[within - 1] || (within + 'th-best')) + ' ' + word;
        out.push(txt.charAt(0).toUpperCase() + txt.slice(1));
      }
    }
    return out;
  }
  function crossBands(sizes, bandSize) {
    var seeds = crossSeeds(sizes), bands = [], place = 1, i, j;
    for (i = 0; i < seeds.length; i += bandSize) {
      var b = seeds.slice(i, i + bandSize), from = place, to = place + b.length - 1;
      place = to + 1;
      var play = b.length % 2 === 1 ? b.slice(0, -1) : b, ties = [];
      for (j = 0; j < play.length / 2; j++) ties.push([play[j], play[play.length - 1 - j]]);
      bands.push({ from: from, to: to, slots: b, ties: ties });
    }
    return bands;
  }
  function tierQuotaHtml(dv) {
    var c = tierCfg(dv), sizes = tierSizes(c.n, c.g), N = nouns(dv);
    return sizes.map(function (sz, i) {
      return '<div class="tg-qrow"><span class="tg-qp">' + String.fromCharCode(65 + i) + '</span>'
        + '<span class="tg-qn">Pool ' + String.fromCharCode(65 + i)
        + '<small>' + sz + ' ' + (sz === 1 ? N.one : N.many) + (i === 0 ? ', strongest' : '') + '</small></span>'
        + '<input class="lg-in tg-qin" id="tg-q' + i + '" type="number" min="0" max="' + sz + '" value="'
        + Math.min(c.q[i], sz) + '" oninput="FFPTourn.tierPreview()"></div>';
    }).join('');
  }
  function tierLadderHtml(dv) {
    var c = tierCfg(dv);
    if (!c.n) return '<div class="tg-hint">Add ' + nouns(dv).many + ' and the bands appear here.</div>';
    var sizes = tierSizes(c.n, c.g);
    var bands = c.mode === 'cross' ? crossBands(sizes, c.bs) : tierBands(sizes, c.q, c.bs);
    return bands.map(function (b, i) {
      var range = b.from + (b.to > b.from ? '&ndash;' + b.to : '');
      var ties = b.ties.length
        ? b.ties.map(function (t) { return '<span class="tg-tie">' + esc(t[0]) + ' <i>v</i> ' + esc(t[1]) + '</span>'; }).join('')
        : '<span class="tg-tie tg-none">decided on ' + (c.mode === 'cross' ? 'record' : 'pool record') + '</span>';
      return '<div class="tg-lrow' + (i === 0 ? ' tg-top' : '') + '"><span class="tg-lpl">' + range
        + '<small>' + (i === 0 ? 'Cup' : '') + '</small></span><span class="tg-lties">' + ties + '</span></div>';
    }).join('');
  }
  function tierPreview() {
    var dv = (S.detail.divisions || []).find(function (x) { return x.id === S.divId; }); if (!dv) return;
    var l = document.getElementById('tg-ladder'); if (l) l.innerHTML = tierLadderHtml(dv);
  }
  /* switching the intake takes the quota rows off the screen or puts them
     back, so the whole block is laid out again rather than patched */
  function tierIntake(sel) {
    var dv = (S.detail.divisions || []).find(function (x) { return x.id === S.divId; }); if (!dv) return;
    /* the block is laid out again, so anything typed into the pool count, the
       band size or the quota boxes and not yet saved is read off the screen
       FIRST - switching the intake must not quietly undo it */
    var c = tierCfg(dv);
    dv.num_groups = c.g; dv.band_size = c.bs; dv.tier_quota = c.q;
    dv.cup_intake = (sel && sel.value === 'cross') ? 'cross' : 'quota';
    renderTab();
  }
  /* the pool count changes how many quota rows there are, so that one rebuilds
     the rows as well - and only that one, or typing in a quota box would tear
     the box out from under the cursor */
  function tierPools() {
    var dv = (S.detail.divisions || []).find(function (x) { return x.id === S.divId; }); if (!dv) return;
    var q = document.getElementById('tg-quota'); if (q) q.innerHTML = tierQuotaHtml(dv);
    tierPreview();
  }
  function fmtLabel(k) { var f = FORMATS.find(function (x) { return x[0] === k; }); return f ? f[1] : 'Knockout'; }
  function koRounds(n) {
    if (!n || n < 2) return [];
    var sz = 2; while (sz < n) sz *= 2;
    var out = [], r = sz;
    while (r >= 2) { out.push(STAGE[_bracketStage(r / 2)] || _bracketStage(r / 2)); r = r / 2; }
    return out;
  }
  function _bracketStage(half) {
    return half >= 32 ? 'r64' : half >= 16 ? 'r32' : half >= 8 ? 'r16' : half >= 4 ? 'quarter' : half >= 2 ? 'semi' : 'final';
  }
  function monradRounds(n) { return (!n || n < 2) ? 0 : Math.ceil(Math.log(n) / Math.log(2)); }
  function shapeLine(d) {
    var n = d.entrant_count || 0, k = fmtOfDiv(d), N = nouns(d);
    if (!n) return 'no ' + N.many + ' yet';
    if (k === 'monrad') { var r = monradRounds(n); return n + ' ' + N.many + ', ' + r + ' rounds, every place from 1 to ' + n + ' is played off'; }
    if (k === 'ko') { var rr = koRounds(n); return n + ' ' + N.many + ', ' + rr.length + ' rounds, ' + rr.join(' to ').toLowerCase(); }
    var ng = d.num_groups || Math.max(2, Math.round(n / 4));
    if (k === 'tiered') return n + ' ' + N.many + ' in ' + ng + ' pools by ability, every ' + N.one + ' placed 1 to ' + n;
    if (k === 'grp') return n + ' ' + N.many + ' in ' + ng + ' groups, ranked into one table';
    return n + ' ' + N.many + ' in ' + ng + ' groups, top ' + (d.groups_advance || 2) + ' of each into a knockout';
  }
  /* THE TWO WAYS A MATCH GETS A REFEREE. The wording is the answer to the
     question above it, so the hint changes with the choice rather than
     describing the option that was not taken. */
  var REFS = [
    ['previous_match', 'Players from the previous match',
     'The two who have just come off that court mark the next match on it, and they can '
     + 'enter the score from their own phone. The first match of the day on each court still '
     + 'needs someone named, and the day check lists them.'],
    ['named', 'Officials I name myself',
     'Nobody is put on a match automatically. Name your officials on the Officials tab and '
     + 'give them the days or matches they cover.']
  ];
  function refsOf(ev) {
    var k = (ev && ev.refs_source) || 'named';
    return REFS.find(function (x) { return x[0] === k; }) || REFS[1];
  }
  function refsHint() {
    var el = document.getElementById('tg-refshint'); if (!el) return;
    var k = v('tg-refs');
    el.textContent = (REFS.find(function (x) { return x[0] === k; }) || REFS[1])[2];
  }
  function refsInfoBox() {
    return '<div class="tg-nfobox solo">'
      + '<button class="close" onclick="FFPTourn.refsInfo()" title="Close">' + ic('close') + '</button>'
      + '<h4>' + ic('info') + 'Who ends up marking what</h4>'
      + '<p><b>Players from the previous match.</b> Whoever has just finished on that court marks '
      + 'the next match on it, so nobody has to be rostered. The <b>first match of the day on each '
      + 'court</b> has no previous match, so it is the one you still name somebody for. The day '
      + 'check on the Match day tab lists exactly those and nothing else.</p>'
      + '<p>Entering the score from a phone needs an FFP account, so an entrant added by name '
      + 'alone marks on the court screen instead.</p>'
      + '<p><b>Officials I name myself.</b> Nobody is put on a match automatically. Name them on '
      + 'the Officials tab and give each one the days or matches they cover.</p>'
      + '<p>Naming an official on a single match always wins, whichever of the two is set, so a '
      + 'final can have a real referee on it.</p>'
      + '</div>';
  }
  function refsInfo() { S.refsInfo = !S.refsInfo; renderTab(); }
  function refsField(ev) {
    var cur = refsOf(ev);
    return '<div class="lg-fld"><div class="lg-lab">'
      + '<button class="nfo-i" title="Who ends up marking what"'
      +   ' onclick="FFPTourn.refsInfo()">' + ic('info') + '</button>'
      + 'Who marks each match?</div>'
      + '<select class="lg-sel" id="tg-refs" onchange="FFPTourn.refsHint()">'
      + REFS.map(function (x) {
          return '<option value="' + x[0] + '"' + (x[0] === cur[0] ? ' selected' : '') + '>'
            + esc(x[1]) + '</option>';
        }).join('')
      + '</select><div class="tg-hint" id="tg-refshint">' + esc(cur[2]) + '</div>'
      /* the explainer opens UNDER the field, so the dropdown never gets pushed
         away from the question it answers */
      + (S.refsInfo ? refsInfoBox() : '') + '</div>';
  }

  async function renderSetup(host) {
    await loadSports(); await taxReady(); await loadMySeries(); await loadPotm();
    await loadDrawNames();
    var ev = S.detail.event || {}, divs = S.detail.divisions || [];
    var mode = ev.entrant_mode || 'individual';
    if (!S.divId && divs.length) S.divId = divs[0].id;
    var dv = divs.find(function (x) { return x.id === S.divId; }) || null;

    var modeSeg = ENTRANT_MODES.map(function (m) {
      return '<button data-v="' + m[0] + '" class="' + (m[0] === mode ? 'on' : '') + '" onclick="FFPTourn.setEntrantMode(\'' + m[0] + '\')">' + m[1] + '</button>';
    }).join('');
    var modeHint = (ENTRANT_MODES.find(function (m) { return m[0] === mode; }) || ENTRANT_MODES[0])[2];

    var head =
      '<div class="tg-sec">'
      + '<div class="lg-fld"><div class="lg-lab">Which sport is this tournament for?</div>'
      + '<select class="lg-sel" id="tg-sport" onchange="FFPTourn.sportHint()">'
      +   '<option value="">Choose a sport\u2026</option>'
      +   sportOpts(ev.sport_key)
      + '</select>'
      + '<div class="tg-hint" id="tg-sporthint">' + esc(sportSetHint(ev.sport_key)) + '</div></div>'
      + rulesBlock(ev)
      + serSetupHtml(ev)
      + '<div class="lg-fld"><div class="lg-lab">Who competes?</div><div class="lg-seg" id="tg-mode">' + modeSeg + '</div>'
      + '<div class="tg-hint" id="tg-modehint">' + esc(modeHint) + '</div></div>'
      + refsField(ev)
      + '<button class="lg-btn pri" onclick="FFPTourn.saveSetup()">' + ic('check') + 'Save</button>'
      + '</div>';

    if (!divs.length) {
      host.innerHTML = head + '<div class="tg-sec"><div class="tg-sech">Format</div><div class="lg-empty" style="text-align:left;padding:4px 0">Add a division first, then set how each one is run.</div></div>';
      return;
    }

    /* A division reads as one block now: a blue header states which division
       it is, its shape and whether it is drawn, then its format and its draw
       sit underneath. The old plain rows ran into one another. */
    var rows = divs.map(function (d) {
      if (S.divEdit === d.id) return divEditor(d);
      var on = d.id === S.divId;
      var built = (d.match_count || 0) > 0;
      var stale = built ? drawStale(d) : null;
      var hd = '<div class="tg-dvhd' + (on ? '' : ' off') + '" onclick="FFPTourn.setDiv(\'' + d.id + '\',\'setup\')">'
        + '<span class="ms cv">' + (on ? 'expand_more' : 'chevron_right') + '</span>'
        + '<div class="g"><b>' + esc(d.name) + '</b><span>' + esc(fmtLabel(fmtOfDiv(d))) + ', ' + esc(shapeLine(d)) + '</span></div>'
        + '<span class="st' + (stale ? ' stale' : built ? ' done' : '') + '">'
        +   (stale ? 'Out of date' : built ? 'Drawn' : 'Not drawn') + '</span>'
        + '<button class="ed" title="Rename or change who it is for"'
        +   ' onclick="event.stopPropagation();FFPTourn.editDivision(\'' + d.id + '\')">' + ic('edit') + '</button></div>';
      return '<div class="tg-dv">' + hd + (stale ? staleBar(d, stale) : '')
        + (on ? '<div class="tg-dvbody">' + divFormatEditor(d) + '</div>' : '') + '</div>';
    }).join('');
    var adder = S.divEdit === 'new' ? divEditor(null)
      : '<button class="lg-btn" style="margin-top:4px" onclick="FFPTourn.editDivision(\'new\')">'
        + ic('add') + 'Add a division</button>';

    host.innerHTML = head
      + potmVoteHtml()
      + drawNamesHtml()
      + '<div class="tg-sec"><div class="tg-sech">Divisions</div>' + rows + adder + '</div>';
  }

  /* ── FANS' PLAYER OF THE MATCH ──────────────────────────────────────────
     Two choices and nothing else: whether the people watching get a vote, and
     whether it closes on the whistle or fifteen minutes after it. Everything
     else about the award is decided elsewhere - who is eligible is the team
     sheet, and the coach's own pick is made on the sheet.

     A tournament is its OWN section with its own RPCs (tourn_potm_settings,
     tourn_set_potm_vote). It does not borrow the league's. */
  async function loadPotm() {
    try { var r = await sb().rpc('tourn_potm_settings', { p_tourn: S.eventId }); S._potm = (r && r.data) || null; }
    catch (e) { S._potm = null; }
    return S._potm;
  }
  function potmVoteHtml() {
    var d = S._potm;
    if (!d || d.error) return '';
    var on = !!d.on, close = d.close || 'whistle';
    return '<div class="og-sec tp-vote">'
      + '<div class="og-hd">' + ic('how_to_vote')
      +   '<div class="t"><b>Player of the Match</b><span>Everyone named on either team sheet is eligible. '
      +   'Members vote in the FFP app, one vote each, and the winner is announced the moment voting closes.</span></div></div>'
      + '<div class="tp-vrow">'
      +   '<div class="f"><label>Fan voting</label>'
      +     '<select class="lg-sel" id="tg-pvon" onchange="FFPTourn.potmVoteSave()">'
      +       '<option value="on"' + (on ? ' selected' : '') + '>On for every match in this tournament</option>'
      +       '<option value="off"' + (on ? '' : ' selected') + '>Off</option>'
      +     '</select></div>'
      +   (on
          ? '<div class="f"><label>Voting closes</label>'
            + '<select class="lg-sel" id="tg-pvcl" onchange="FFPTourn.potmVoteSave()">'
            +   '<option value="whistle"' + (close === 'whistle' ? ' selected' : '') + '>At the end of the match</option>'
            +   '<option value="plus15"' + (close === 'plus15' ? ' selected' : '') + '>15 minutes after the end</option>'
            + '</select></div>'
          : '')
      + '</div>'
      /* the note answers the rule that is actually SET. Printing the case for
         fifteen minutes while the whistle is selected reads as a mistake. */
      + (on
        ? '<div class="tp-vnote">' + ic('schedule')
          + '<div>' + (close === 'plus15'
              ? 'Fifteen minutes gives anyone still at the venue, or watching the stream, time to vote after the end. '
              : 'Voting shuts the moment the match is over, so the winner is known while everyone is still there. ')
          + 'Totals stay hidden until voting closes, so nobody votes the bandwagon.</div></div>'
        : '')
      + '</div>';
  }
  async function potmVoteSave() {
    var onEl = document.getElementById('tg-pvon');
    var clEl = document.getElementById('tg-pvcl');
    var on = onEl ? onEl.value === 'on' : null;
    var cl = clEl ? clEl.value : null;
    var r; try { r = (await sb().rpc('tourn_set_potm_vote',
      { p_tourn: S.eventId, p_on: on, p_close: cl })).data; } catch (e) { r = null; }
    if (!r || r.error) { toast('Could not save the voting settings', 'error'); return; }
    toast(r.on ? 'Fan voting on, closing ' + (r.close === 'plus15' ? '15 minutes after the end' : 'at the end of the match')
               : 'Fan voting off', 'success');
    await loadPotm(); renderTab();
  }
  /* ── THE ORGANISER'S OWN WORDS FOR THE DRAWS ────────────────────────────
     The label on the left says what the draw IS, in terms that stay true
     whatever it gets called: "Beaten in round one". Rows run in the order the
     draws feed each other, which is the order tourn_draws already sorts them,
     so the Bowl sits under the draw it comes off.

     Only what the organiser CHANGED is sent. Rendering the inherited word in
     the box and posting the lot back would quietly give a division its own
     copy of a word it was merely inheriting, and the next event-wide rename
     would then skip it. */
  var DN_KEYS = ['main', 'plate', 'bowl', 'shield'];
  var DN_ROLE = {
    main:   ['Top draw', 'everyone starts here'],
    plate:  ['Beaten in round one', 'a knockout of their own'],
    bowl:   ['Beaten in the draw above', 'a third chance for the earliest out'],
    shield: ['Beaten in the quarter-finals', 'so nobody who came in on a bye finishes on two']
  };
  async function loadDrawNames() {
    try { var r = await sb().rpc('tourn_draw_names_get', { p_tourn: S.eventId });
          S._dn = (r && r.data) || null; }
    catch (e) { S._dn = null; }
    return S._dn;
  }
  function dnDivs() { return ((S._dn && S._dn.divisions) || []); }
  function dnDrawOf(div, key) {
    return ((div && div.draws) || []).find(function (x) { return x.key === key; }) || null;
  }
  /* the keys actually in play: one division's own, or every key any division
     has, so a rename across the event cannot miss a draw */
  function dnKeys(scope) {
    var ds = dnDivs(), want = {};
    ds.forEach(function (d) {
      if (scope && d.id !== scope) return;
      ((d.draws) || []).forEach(function (x) { want[x.key] = 1; });
    });
    return DN_KEYS.filter(function (k) { return want[k]; });
  }
  function dnValue(scope, key) {
    var ds = dnDivs();
    if (scope) { var d0 = dnDrawOf(ds.find(function (d) { return d.id === scope; }), key);
                 return d0 ? d0.name : ''; }
    if (S._dn && S._dn.event && S._dn.event[key]) return S._dn.event[key];
    for (var i = 0; i < ds.length; i++) {
      var dr = dnDrawOf(ds[i], key); if (dr) return dr.name;
    }
    return '';
  }
  /* which divisions have gone their own way on this draw - said plainly,
     because the event-wide box above will not change them */
  function dnOwn(scope, key) {
    if (scope) return '';
    var names = dnDivs().filter(function (d) {
      var dr = dnDrawOf(d, key); return dr && dr.source === 'division';
    }).map(function (d) { return d.name; });
    if (!names.length) return '';
    return names.join(', ') + (names.length > 1 ? ' use their own words' : ' uses its own word');
  }
  function drawNamesHtml() {
    var ds = dnDivs(); if (!ds.length) return '';
    var scope = S.dnScope || '';
    if (scope && !ds.some(function (d) { return d.id === scope; })) { scope = ''; S.dnScope = ''; }
    var keys = dnKeys(scope); if (!keys.length) return '';
    var rows = keys.map(function (k) {
      var role = DN_ROLE[k] || [k, ''], val = dnValue(scope, k), own = dnOwn(scope, k);
      return '<div class="r"><div class="g"><b>' + esc(role[0]) + '</b><span>' + esc(role[1]) + '</span></div>'
        + '<div class="f"><input class="lg-in dn-in" data-k="' + esc(k) + '" maxlength="40"'
        +   ' value="' + esc(val) + '" placeholder="' + esc(val) + '"'
        +   ' data-was="' + esc(val) + '">'
        + (own ? '<em class="own">' + ic('call_split') + esc(own) + '</em>' : '')
        + '</div></div>';
    }).join('');
    return '<div class="tg-sec">'
      + '<div class="tg-sech">What the draws are called</div>'
      + '<div class="og-hd">' + ic('label')
      +   '<div class="t"><b>Your words, not ours</b>'
      +   '<span>Cup, Plate, Shield and Bowl are squash and rugby words. Whatever you type here is '
      +   'what appears on the draw, the schedule, the venue screens and every player\'s app.</span></div></div>'
      + '<div class="lg-fld tg-dnscope"><div class="lg-lab">Applies to</div>'
      +   '<select class="lg-sel" id="tg-dnscope" onchange="FFPTourn.dnScope(this.value)">'
      +     '<option value=""' + (scope ? '' : ' selected') + '>All divisions</option>'
      +     ds.map(function (d) {
            return '<option value="' + d.id + '"' + (d.id === scope ? ' selected' : '') + '>'
              + esc(d.name) + ' only</option>'; }).join('')
      +   '</select></div>'
      + '<div class="tg-dnames">' + rows + '</div>'
      + '<div class="lg-fldbar" style="margin-top:15px">'
      +   '<button class="lg-btn pri" onclick="FFPTourn.dnSave()">' + ic('check') + 'Save</button>'
      +   '<button class="lg-btn" onclick="FFPTourn.dnReset()">' + ic('restart_alt')
      +     'Back to standard names</button>'
      + '</div></div>';
  }
  function dnScope(val) { S.dnScope = val || ''; renderTab(); }
  async function dnPost(rows, msg) {
    var r; try { r = await sb().rpc('tourn_draw_names_set',
      { p_tourn: S.eventId, p_division: S.dnScope || null, p_rows: rows }); }
    catch (e) { r = { error: e }; }
    if (r.error) { toast(said(r.error) || 'Could not save the draw names', 'error'); return false; }
    await loadDrawNames(); toast(msg, 'success'); await refreshDetail(); renderTab();
    return true;
  }
  async function dnSave() {
    var rows = {}, n = 0;
    document.querySelectorAll('.tg-dnames .dn-in').forEach(function (el) {
      var was = el.getAttribute('data-was') || '';
      var now = String(el.value || '').trim();
      if (now !== was) { rows[el.getAttribute('data-k')] = now; n++; }
    });
    if (!n) { toast('Nothing changed', 'success'); return; }
    await dnPost(rows, 'Saved');
  }
  async function dnReset() {
    var rows = {};
    dnKeys(S.dnScope || '').forEach(function (k) { rows[k] = ''; });
    await dnPost(rows, 'Back to the standard names');
  }
  function divFormatEditor(dv) {
    var k = fmtOfDiv(dv), n = dv.entrant_count || 0, N = nouns(dv);
    var changed = !!(S._fmtSaved && S._fmtSaved[dv.id] && S._fmtSaved[dv.id] !== k);
    var cards = FORMATS.map(function (f) {
      return '<div class="tg-fmt' + (f[0] === k ? ' on' : '') + '" onclick="FFPTourn.setDivFmt(\'' + f[0] + '\')">'
        + '<button class="nfo" title="How ' + esc(f[1]) + ' runs"'
        +   ' onclick="event.stopPropagation();FFPTourn.fmtInfo(\'' + f[0] + '\')">' + ic('info') + '</button>'
        + '<div class="dia">' + fmtDia(f[0]) + '</div><b>' + f[1] + '</b><span>' + esc(say(f[2], dv)) + '</span></div>';
    }).join('') + (S.fmtInfo ? fmtInfoBox(S.fmtInfo) : '');
    var incl = '';
    if (k === 'grp' || k === 'gk') {
      incl += '<div class="' + (k === 'gk' ? 'lg-3' : 'lg-2') + '">' + capField(dv)
        + '<div class="lg-fld"><div class="lg-lab">Number of groups</div><input class="lg-in" id="tg-ng" type="number" min="1" value="' + (dv.num_groups || Math.max(2, Math.round((n || 8) / 4))) + '" oninput="FFPTourn.capHint()"></div>'
        + (k === 'gk' ? '<div class="lg-fld"><div class="lg-lab">Advance per group</div><input class="lg-in" id="tg-adv" type="number" min="1" value="' + (dv.groups_advance || 2) + '" oninput="FFPTourn.capHint()"></div>' : '') + '</div>'
        + capHintRow(dv, k);
    }
    if (k === 'ko' || k === 'monrad') {
      incl += '<div class="lg-2">' + capField(dv) + '<div></div></div>' + capHintRow(dv, k);
    }
    // Extra draws only mean something in a knockout. Monrad already keeps
    // everyone playing, and a group table has nobody to knock out.
    if (k === 'ko' || k === 'gk') {
      var side = dv.side_draws || 'none';
      var cur = SIDE_DRAWS.find(function (x) { return x[0] === side; }) || SIDE_DRAWS[0];
      incl += '<div class="lg-fld"><div class="lg-lab">'
        + '<button class="nfo-i" title="What each of these means"'
        +   ' onclick="FFPTourn.sideInfo()">' + ic('info') + '</button>'
        + 'Do beaten ' + N.many + ' keep playing?</div>'
        + '<select class="lg-sel" id="tg-side" onchange="FFPTourn.sideHint()">'
        + SIDE_DRAWS.map(function (x) { return '<option value="' + x[0] + '"' + (x[0] === side ? ' selected' : '') + '>' + esc(x[1]) + '</option>'; }).join('')
        + '</select><div class="tg-hint" id="tg-sidehint">' + esc(say(cur[2], dv)) + '</div>'
        // the explainer opens UNDER the field, so the dropdown never gets
        // pushed away from the question it answers
        + (S.sideInfo ? sideInfoBox(dv) : '') + '</div>';
      incl += '<div class="lg-fld"><div class="lg-lab">3rd-place play-off</div><div class="lg-seg" id="tg-third"><button data-v="true" class="' + (dv.third_place ? 'on' : '') + '" onclick="FFPTourn.seg(this,\'tg-third\')">Yes</button><button data-v="false" class="' + (!dv.third_place ? 'on' : '') + '" onclick="FFPTourn.seg(this,\'tg-third\')">No</button></div></div>';
    }
    if (k === 'tiered') {
      var tc = tierCfg(dv);
      incl += '<div class="lg-3">' + capField(dv)
        + '<div class="lg-fld"><div class="lg-lab">Number of pools</div>'
        +   '<input class="lg-in tg-num" id="tg-np" type="number" min="2" max="8" value="' + tc.g + '" oninput="FFPTourn.tierPools()"></div>'
        + '<div class="lg-fld"><div class="lg-lab">Places per band</div>'
        +   '<input class="lg-in tg-num" id="tg-bs" type="number" min="2" max="8" value="' + tc.bs + '" oninput="FFPTourn.tierPreview()"></div></div>'
        + capHintRow(dv, k)
        + '<div class="lg-fld tg-intake"><div class="lg-lab">How the top band is filled</div>'
        +   '<select class="lg-sel" id="tg-intake" onchange="FFPTourn.tierIntake(this)">'
        +     '<option value="quota"' + (tc.mode === 'quota' ? ' selected' : '') + '>Pool by pool, a set number from each</option>'
        +     '<option value="cross"' + (tc.mode === 'cross' ? ' selected' : '') + '>Ranked across the pools</option>'
        +   '</select></div>'
        /* Ranked across the pools has no quota to set, and the ladder below
           already names every slot - a second list of the same thing would be
           the same fact twice down one screen. */
        + (tc.mode === 'cross'
            ? '<div class="tg-hint tg-xhint">Every pool winner is compared with every other pool winner, then the runners-up with the runners-up, and so on down. Pools of different sizes play different numbers of matches, so records are compared per match played &mdash; points, then difference, then points scored.</div>'
            : '<div class="lg-fld"><div class="lg-lab">Into the top band</div>'
              + '<div class="tg-quota" id="tg-quota">' + tierQuotaHtml(dv) + '</div>'
              + '<div class="tg-hint">Pools are listed strongest first. A pool set to none sends nobody to the top band however well it plays &mdash; that is what makes it tiered rather than even.</div></div>')
        + '<div class="lg-lab tg-lhead">What that gives you</div>'
        + '<div class="tg-ladder" id="tg-ladder">' + tierLadderHtml(dv) + '</div>'
        /* ranked across the pools has no pool slots to fill - every place is
           settled from the one ranking once the last pool game is played */
        + '<div class="tg-hint">Every ' + N.one + ' finishes with a place. Winners meet winners and losers meet losers down each band, and the '
        + (tc.mode === 'cross' ? 'slots fill in once the pools are done' : 'pool slots fill in as results land') + '.</div>';
    }
    /* every format that ends in a knockout gets to say when its last three
       rounds are played. A pool-only format has no finals series. */
    if (k === 'ko' || k === 'gk' || k === 'tiered') incl += finalsBlock(dv);
    if (k === 'grp' || k === 'gk') incl += tgPtsBlock(dv);
    if (k === 'monrad') incl += '<div class="tg-hint">Monrad re-ranks everyone after every round, so nobody is knocked out and every place is decided. There are no extra draws to add.</div>';
    if (k === 'grp') incl += '<div class="tg-hint">Everyone plays everyone in their group and the table decides it. Nothing follows the groups.</div>';
    return '<div class="tg-dvedit"><div class="tg-fmts">' + cards + '</div>'
      + '<div class="tg-fmtset">' + incl
      + (changed ? '<div class="tg-shape">Becomes ' + esc(shapeLine(dv)) + '</div>' : '')
      + '<div class="tg-hint">Saving lays the draw out to match. Building and redrawing it live on the Draw tab.</div>'
      + '<div class="tg-acts"><button class="lg-btn pri" onclick="FFPTourn.saveDivFormat()">' + ic('check') + 'Save format</button>'
      + '</div></div></div>';
  }
  /* Three states, three different jobs. An OPEN draw with nobody in it is
     filled, which drops entrants into the slots and leaves every time and court
     alone. Rebuilding would delete every match and take the schedule with it,
     so it is only offered once somebody is actually standing in the draw. */
  /* Three different jobs, and the label has to say which one.
       nothing there yet          -> lay it out from the format
       laid out, nobody in it     -> drop the entrants into the slots, which
                                     keeps every time and court already set
       entrants standing in it    -> a real re-draw, which rebuilds it
     A pooled format is never "filled" from a seed list: its slots are pool
     places that resolve as the pools finish, so it only ever lays out again. */
  function drawBtnLabel(dv) {
    var kk = fmtOfDiv(dv), pooled = (kk === 'tiered' || kk === 'grp' || kk === 'gk');
    if (!(dv.match_count || 0)) return pooled ? 'Lay out the draw' : 'Make the draw';
    if (pooled) return 'Lay it out again';
    if (!(dv.placed_count || 0)) return 'Fill the draw';
    return 'Draw again';
  }
  /* CAPACITY IS A PLAIN NUMBER. A field of 10 is a field of 10: the draw is
     built to the next power of two above it and the byes go to the top seeds,
     so 4, 8, 16 was never a real constraint and offering only those numbers
     made organisers round their own event up. The line underneath says exactly
     what the number they typed will produce, so nobody has to guess. */
  function nextPow2(n) { var b = 2; while (b < n) b *= 2; return b; }
  function andList(a) {
    return a.length < 2 ? String(a[0] || '')
      : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];
  }
  function poolSizes(n, g) {
    var base = Math.floor(n / g), rem = n % g, out = [];
    for (var i = 1; i <= g; i++) out.push(base + (i > g - rem ? 1 : 0));
    return out;
  }
  function capNow(dv) {
    var el = document.getElementById('tg-dsize');
    return +((el && el.value) || dv.draw_size || 0) || 0;
  }
  function numNow(id, fallback) {
    var el = document.getElementById(id);
    return +((el && el.value) || fallback || 0) || 0;
  }
  function capShape(dv, k) {
    var n = capNow(dv), N = nouns(dv);
    if (!n || n < 2) return 'Type any number. It does not have to be 4, 8, 16 and so on.';
    if (k === 'ko') {
      var b = nextPow2(n), byes = b - n, r1 = b / 2 - byes;
      return n + ' ' + N.many + ' builds a draw of ' + b + '. Seeds 1 to ' + n + ' are placed'
        + (byes ? ', the top ' + byes + ' seed' + (byes === 1 ? '' : 's') + ' get a bye' : ', nobody gets a bye')
        + ', and round 1 is ' + r1 + ' match' + (r1 === 1 ? '' : 'es') + '.';
    }
    if (k === 'monrad') {
      var rd = Math.ceil(Math.log(n) / Math.log(2));
      return n + ' ' + N.many + ' plays ' + rd + ' rounds and finishes ranked 1 to ' + n + '.';
    }
    var g = numNow(k === 'tiered' ? 'tg-np' : 'tg-ng', dv.num_groups || 2);
    if (g < 1) return 'Set the number of ' + (k === 'tiered' ? 'pools' : 'groups') + '.';
    if (n < g * 2) return n + ' ' + N.many + ' will not fill ' + g + ' '
      + (k === 'tiered' ? 'pools' : 'groups') + '. Each one needs at least 2, so this takes '
      + (g * 2) + ' or more, or fewer ' + (k === 'tiered' ? 'pools' : 'groups') + '.';
    var sz = poolSizes(n, g), fx = 0;
    sz.forEach(function (s) { fx += s * (s - 1) / 2; });
    var word = k === 'tiered' ? 'pools' : 'groups';
    var line = n + ' ' + N.many + ' in ' + g + ' ' + word + ' of ' + andList(sz)
      + ', which is ' + fx + ' pool matches';
    if (k === 'grp') return line + ', and the table decides it.';
    if (k === 'tiered') return line + ', then every ' + N.one + ' is placed 1 to ' + n + '.';
    var adv = numNow('tg-adv', dv.groups_advance || 2), q = 0;
    sz.forEach(function (s) { q += Math.min(adv, s); });
    return line + '. The top ' + adv + ' of each gives ' + q + ' qualifiers, into a bracket of '
      + nextPow2(q) + '.';
  }
  function capField(dv) {
    return '<div class="lg-fld"><div class="lg-lab">Maximum ' + nouns(dv).many + ' expected</div>'
      + '<input class="lg-in" id="tg-dsize" type="number" min="2" max="512" step="1" placeholder="Any number"'
      + ' value="' + (dv.draw_size || '') + '" oninput="FFPTourn.capHint()"></div>';
  }
  function capHintRow(dv, k) {
    return '<div class="tg-hint" id="tg-caphint" style="margin:-6px 0 16px">' + esc(capShape(dv, k)) + '</div>';
  }
  function capHint() {
    var el = document.getElementById('tg-caphint'); if (!el) return;
    var dv = curDv() || {};
    el.textContent = capShape(dv, fmtOfDiv(dv));
  }
  // The order of play is set from the format, not from who has entered: an
  // empty draw of a chosen size gives every round its matches, so the whole
  // tournament can be scheduled and the names dropped in as results come.
  /* Draw used to say "build it above" when the control was on another tab, and
     Schedule sent you to Setup. Both now carry the thing that fixes them. The
     select keeps the id openDivDraw already reads, and only one tab is on
     screen at a time, so there is never two of it. */
  function openDrawEmpty(which) {
    var dv = ((S.detail && S.detail.divisions) || []).find(function (d) { return d.id === S.divId; }) || {};
    var cap = dv.draw_size || 0, N = nouns(dv);
    /* The maximum lives in one place, on Setup, beside the rest of the format.
       With it set this just builds; without it, it says where to set it rather
       than offering a second field that can drift from the first. */
    var row = cap
      ? '<span class="lb">Maximum ' + N.many + ', ' + cap + '</span>'
        + '<button class="lg-btn pri" onclick="FFPTourn.openDivDraw()">' + ic('grid_on') + 'Open the draw</button>'
      : '<button class="lg-btn pri" onclick="FFPTourn.tab(\'setup\')">' + ic('tune') + 'Go to Setup</button>';
    var need = cap ? '' : ' First set the format and the maximum number of ' + N.many + ' on Setup.';
    if (which === 'schedule') {
      return '<div class="lg-empty act"><div class="t">Nothing to schedule yet</div>'
        + '<div class="s">The schedule is built from the draw. Open the draw and every round appears here, '
        + 'ready for times and ' + surfWord(true) + '.' + need + '</div>'
        + '<div class="row">' + row + '</div></div>';
    }
    return '<div class="lg-empty act"><div class="t">This division has no draw yet</div>'
      + '<div class="s">Open it and every round is created empty, so the whole tournament can be scheduled '
      + 'before a single entry is in. Names drop into the slots as ' + N.many + ' are seeded.' + need + '</div>'
      + '<div class="row">' + row + '</div></div>';
  }
  /* Say what was actually made, because "Saved" tells an organiser nothing
     about whether their whole event now exists. */
  function laidOutMsg(d) {
    d = d || {};
    var pool = d.pool_matches || 0, draw = d.draw_matches || 0;
    var bits = [];
    if (pool) bits.push(pool + ' pool match' + (pool === 1 ? '' : 'es'));
    if (draw) bits.push(draw + ' in the draw');
    if (!bits.length) return 'Nothing to lay out yet';
    return 'Laid out: ' + bits.join(' and ') + ', ready to schedule';
  }
  function openDrawCancel() { S.openDrawAsk = null; renderTab(); }
  async function openDivDraw(confirmed) {
    var dv = ((S.detail && S.detail.divisions) || []).find(function (d) { return d.id === S.divId; }) || {};
    if ((dv.match_count || 0) > 0 && !confirmed) { S.openDrawAsk = dv.id; renderTab(); return; }
    var el = document.getElementById('tg-dsize');
    var size = +((el && el.value) || dv.draw_size || 0) || 0;
    S.openDrawAsk = null;
    /* No size given is fine: the database works it out from the entrants the
       division already holds, rounded up to the next power of two. It only
       asks when there is nobody to work it out from. */
    /* ONE call, whatever the format is. The database lays out the pools, the
       ladder, the bracket and every round from the shape the organiser set, on
       slot names rather than entrants, so it can all be scheduled before a
       single entry arrives. The options are saved first so it lays out to what
       is on screen, not to what was last stored. */
    var r, em;
    if (!(await saveDivFormat(true))) return;
    var args = { p_division: S.divId }; if (size) args.p_size = size;
    try { r = await sb().rpc('tourn_draw_open', args); } catch (e) { r = { error: e }; }
    if (r.error) {
      em = r.error.message || '';
      toast(/matches_played/.test(em) ? 'A match has already been played in this division'
          : /no_size/.test(em)  ? 'Set how many this division takes first'
          : /no_groups/.test(em) ? 'Set the number of pools first'
          : (said(r.error) || 'Could not lay out the draw'), 'error');
      renderTab(); return;
    }
    toast(laidOutMsg(r.data), 'success');
    S.tab = (((r.data && r.data.pool_matches) || 0) > 0 && !((r.data && r.data.draw_matches) || 0))
      ? 'groups' : 'bracket';
    S.drawKey = null; await refreshDetail();
  }
  function sideHint() {
    var sel = document.getElementById('tg-side'), h = document.getElementById('tg-sidehint');
    if (!sel || !h) return;
    var x = SIDE_DRAWS.find(function (o) { return o[0] === sel.value; });
    h.textContent = x ? say(x[2]) : '';
  }
  function fmtDia(k) {
    if (k === 'grp') return '<svg width="56" height="60" viewBox="0 0 56 60" class="tgd"><rect x="2" y="4" width="52" height="12" rx="2"/><rect x="2" y="18" width="52" height="12" rx="2"/><rect x="2" y="32" width="52" height="12" rx="2"/><rect x="2" y="46" width="52" height="12" rx="2"/></svg>';
    if (k === 'gk') return '<svg width="86" height="74" viewBox="0 0 86 74" class="tgd"><rect x="2" y="4" width="34" height="10"/><rect x="2" y="17" width="34" height="10"/><rect x="2" y="30" width="34" height="10"/><rect x="52" y="10" width="32" height="10"/><line x1="36" y1="9" x2="52" y2="15"/><line x1="36" y1="35" x2="52" y2="15"/><rect x="16" y="52" width="24" height="9"/><rect x="16" y="63" width="24" height="9"/><rect x="48" y="57" width="24" height="9"/><line x1="40" y1="56" x2="48" y2="61"/><line x1="40" y1="67" x2="48" y2="61"/></svg>';
    if (k === 'tiered') return '<svg width="80" height="70" viewBox="0 0 80 70" class="tgd"><rect x="2" y="6" width="26" height="10"/><rect x="2" y="19" width="26" height="10"/><rect x="2" y="36" width="26" height="10"/><rect x="2" y="49" width="26" height="10"/><rect x="52" y="6" width="26" height="10"/><rect x="52" y="19" width="26" height="10"/><rect x="52" y="36" width="26" height="10"/><rect x="52" y="49" width="26" height="10"/><line x1="28" y1="11" x2="52" y2="11"/><line x1="28" y1="24" x2="52" y2="24"/><line x1="28" y1="41" x2="52" y2="41"/><line x1="28" y1="54" x2="52" y2="54"/></svg>';
    if (k === 'monrad') return '<svg width="80" height="70" viewBox="0 0 80 70" class="tgd"><rect x="2" y="6" width="24" height="9"/><rect x="2" y="19" width="24" height="9"/><rect x="2" y="36" width="24" height="9"/><rect x="2" y="49" width="24" height="9"/><rect x="38" y="6" width="24" height="9"/><rect x="38" y="19" width="24" height="9"/><rect x="38" y="36" width="24" height="9"/><rect x="38" y="49" width="24" height="9"/><line x1="26" y1="10" x2="38" y2="10"/><line x1="26" y1="23" x2="38" y2="40"/><line x1="26" y1="40" x2="38" y2="23"/><line x1="26" y1="53" x2="38" y2="53"/></svg>';
    return '<svg width="80" height="66" viewBox="0 0 80 66" class="tgd"><rect x="2" y="8" width="26" height="10"/><rect x="2" y="22" width="26" height="10"/><rect x="2" y="40" width="26" height="10"/><rect x="2" y="54" width="26" height="10"/><rect x="40" y="14" width="26" height="10"/><rect x="40" y="46" width="26" height="10"/><line x1="28" y1="13" x2="40" y2="19"/><line x1="28" y1="27" x2="40" y2="19"/><line x1="28" y1="45" x2="40" y2="51"/><line x1="28" y1="59" x2="40" y2="51"/></svg>';
  }
  function setEntrantMode(m) {
    var ev = S.detail.event || {}; ev.entrant_mode = m;
    document.querySelectorAll('#tg-mode button').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-v') === m); });
    // NOT renderTab(): that rebuilds the sport input from the SAVED activity,
    // so picking Teams wiped whatever sport had just been typed and put the old
    // one back. The buttons above already toggled themselves; the only other
    // thing the mode changes on this tab is the line underneath.
    var h = document.getElementById('tg-modehint');
    if (h) h.textContent = (ENTRANT_MODES.find(function (x) { return x[0] === m; }) || ENTRANT_MODES[0])[2];
  }
  async function saveSetup() {
    var k = v('tg-sport');
    if (!k) { toast('Choose a sport first', 'error'); return; }
    var p = rulesPayload();
    p.sport_key = k; p.entrant_mode = (S.detail.event || {}).entrant_mode || 'individual';
    if (document.getElementById('tg-refs')) p.refs_source = v('tg-refs');
    var r; try { r = await sb().rpc('tourn_event_save', { p_id: S.eventId, p: p }); } catch (e) { r = { error: e }; }
    if (r.error) { toast(said(r.error) || 'Could not save the sport', 'error'); return; }
    await serSaveLink();
    toast('Saved', 'success'); refreshDetail();
  }
  function setDivFmt(k) {
    var divs = S.detail.divisions || [];
    var dv = divs.find(function (x) { return x.id === S.divId; }); if (!dv) return;
    dv.draw_format = (k === 'monrad') ? 'monrad' : (k === 'tiered' ? 'tiered' : 'ko');
    dv.group_stage = (k === 'grp' || k === 'gk' || k === 'tiered');
    if (k === 'grp') dv.groups_advance = 0; else if (!dv.groups_advance) dv.groups_advance = 2;
    if (k === 'tiered') {
      if (!dv.num_groups) dv.num_groups = 3;
      if (!dv.band_size) dv.band_size = 4;
      if (!dv.tier_quota) dv.tier_quota = [2, 2, 0].slice(0, dv.num_groups);
      if (!dv.cup_intake) dv.cup_intake = 'quota';
    }
    renderTab();
  }
  async function saveDivFormat(quiet) {
    var divs = S.detail.divisions || [];
    var dv = divs.find(function (x) { return x.id === S.divId; }); if (!dv) return;
    var k = fmtOfDiv(dv);
    var p = {
      draw_format: k === 'monrad' ? 'monrad' : (k === 'tiered' ? 'tiered' : 'ko'),
      group_stage: (k === 'grp' || k === 'gk' || k === 'tiered'),
      num_groups: +v('tg-ng') || null,
      groups_advance: k === 'gk' ? (+v('tg-adv') || 2) : (k === 'grp' ? 0 : (dv.groups_advance || 2)),
      // the most players this division takes, and the shape its draw is built
      // to — it belongs with the rest of the format, not only with the draw
      draw_size: +v('tg-dsize') || null
    };
    /* Only what was on screen. An absent key leaves the stored value alone,
       which is the whole point of the presence idiom the RPC implements. */
    if (document.getElementById('tg-third')) p.third_place = segVal('tg-third') === 'true';
    if (document.getElementById('tg-side'))  p.side_draws  = v('tg-side') || 'none';
    // only sent when the block is on screen; leaving the keys out leaves the
    // stored values alone, which is how a knockout keeps whatever it had
    if (k === 'grp' || k === 'gk') {
      p.win_pts = v('tg-win'); p.draw_pts = v('tg-draw'); p.loss_pts = v('tg-loss');
      p.bonus_rules = bpRead();
    }
    /* the ladder. Sent on EVERY save so switching a division back to an
       ordinary format clears it rather than leaving a stale ladder behind -
       the RPC uses the presence idiom for exactly this. */
    if (k === 'tiered') {
      var tc = tierCfg(dv);
      p.num_groups = tc.g; p.band_size = tc.bs; p.tier_quota = tc.q;
      p.cup_intake = tc.mode;
      p.groups_advance = tc.n || 2;   // everyone is placed, so everyone goes on
      p.side_draws = 'places';        // set deliberately, not read off a field
    } else { p.tier_quota = null; p.band_size = null; p.cup_intake = 'quota'; }
    /* when the finals series plays. Sent on every save of a format that HAS a
       knockout; a pool-only format is put back to asap so a stale rule cannot
       sit on a division that no longer has finals. */
    if (k === 'ko' || k === 'gk' || k === 'tiered') {
      p.finals_when = v('tg-fwhen') || finalsOf(dv);
      p.finals_at = p.finals_when === 'at' ? (v('tg-fat') || finalsAtOf(dv)) : null;
    } else { p.finals_when = 'asap'; p.finals_at = null; }
    var r; try { r = await sb().rpc('tourn_division_save', { p_tourn: S.eventId, p_id: S.divId, p: p }); } catch (e) { r = { error: e }; }
    if (r.error) { toast(said(r.error) || 'Could not save the format', 'error'); return false; }
    if (quiet) return true;
    /* Setting the format is how an organiser says what this division is. For a
       knockout that is the whole shape, so the empty draw is opened there and
       then: the Draw and Schedule tabs have something in them immediately and
       the event can be scheduled before a single entry arrives. Only when the
       division has no matches yet, so this never touches a live draw. */
    /* The draw follows the format. Change the pools, the number who advance or
       the band size and the whole thing is laid out again to match, because a
       draw that still shows the old shape is worse than no draw.

       Two things stop it: a result already entered, and entrants already
       standing in the draw. Past that point the draw is real and is only
       rebuilt when the organiser asks for it. */
    var laid = null, o, sizeNow = (dv.draw_size || +v('tg-dsize') || 0);
    if (sizeNow && !(dv.played_count || 0) && !(dv.placed_count || 0)) {
      var a2 = { p_division: S.divId, p_size: sizeNow };
      try { o = await sb().rpc('tourn_draw_open', a2); } catch (e) { o = { error: e }; }
      if (o && !o.error && o.data) { laid = o.data; }
    }
    toast(laid ? ('Format saved. ' + laidOutMsg(laid)) : 'Format saved', 'success');
    await refreshDetail(); return true;
  }
  function buildDivDraw() {
    var divs = S.detail.divisions || [];
    var dv = divs.find(function (x) { return x.id === S.divId; }); if (!dv) return;
    /* No entrants is not a blocker any more: the draw is laid out from the
       format and the entrants drop into it later. */
    if ((dv.played_count || 0) > 0) {
      showConfirm('replay', 'Draw ' + dv.name + ' again?',
        (dv.played_count === 1 ? 'One result has' : dv.played_count + ' results have')
          + ' already been entered in this draw. Drawing again builds it from scratch and those scores are lost.',
        'Yes, draw it again', 'final', function () { _buildDivDraw(dv); });
      return;
    }
    _buildDivDraw(dv);
  }
  async function _buildDivDraw(dv) {
    if (!(await saveDivFormat(true))) return;
    var k = fmtOfDiv(dv), r;
    /* Nobody has entered yet: lay the whole thing out from the format instead.
       One call builds the pools, the ladder or the bracket on slot names, so
       the event exists and can be scheduled before the first entry. Once there
       are entrants the builders below deal them into it properly. */
    if (!(dv.entrant_count || 0)) {
      var sz0 = (dv.draw_size || +v('tg-dsize') || 0);
      var a0 = { p_division: S.divId }; if (sz0) a0.p_size = sz0;
      try { r = await sb().rpc('tourn_draw_open', a0); } catch (e) { r = { error: e }; }
      if (r.error) {
        var e0 = r.error.message || '';
        toast(/no_size/.test(e0)   ? 'Set how many this division takes first'
            : /no_groups/.test(e0) ? 'Set the number of pools first'
            : /matches_played/.test(e0) ? 'A match has already been played in this division'
            : (said(r.error) || 'Could not lay out the draw'), 'error');
        return;
      }
      toast(laidOutMsg(r.data), 'success');
      S.tab = (((r.data && r.data.pool_matches) || 0) > 0 && !((r.data && r.data.draw_matches) || 0))
        ? 'groups' : 'bracket';
      S.drawKey = null; await refreshDetail(); return;
    }
    if (k === 'monrad') {
      try { r = await sb().rpc('tourn_monrad_open', { p_division: S.divId }); } catch (e) { r = { error: e }; }
      if (r.error) { toast('Could not make the draw', 'error'); return; }
      toast('Draw made', 'success'); S.tab = 'bracket'; S.drawKey = null; await refreshDetail(); return;
    }
    /* A tiered draw is TWO steps and the order matters: the pools are dealt in
       ability blocks first, then the ladder is built on top of the pools that
       produces. Building the ladder first would have nothing to hang the slots
       on. */
    if (k === 'tiered') {
      var tg = tierCfg(dv).g;
      try { r = await sb().rpc('tourn_groups_generate', { p_division: S.divId, p_num_groups: tg }); } catch (e) { r = { error: e }; }
      if (r.error) { toast(said(r.error) || 'Could not draw the pools', 'error'); return; }
      try { r = await sb().rpc('tourn_tiered_build', { p_division: S.divId }); } catch (e) { r = { error: e }; }
      if (r.error) { toast(said(r.error) || 'Could not build the ladder', 'error'); return; }
      toast('Pools and placings drawn', 'success'); S.tab = 'groups'; S.drawKey = null; await refreshDetail(); return;
    }
    if (k === 'grp' || k === 'gk') {
      var ng = +v('tg-ng') || Math.max(2, Math.round((dv.entrant_count || 8) / 4));
      try { r = await sb().rpc('tourn_groups_generate', { p_division: S.divId, p_num_groups: ng }); } catch (e) { r = { error: e }; }
      if (r.error) { toast('Could not draw groups', 'error'); return; }
      toast((r.data || 0) + ' group fixtures drawn', 'success'); S.tab = 'groups'; S.drawKey = null; await refreshDetail(); return;
    }
    /* an open draw nobody is standing in yet: fill it, which keeps the times
       and courts already assigned. Rebuilding deletes every match. */
    if ((dv.match_count || 0) > 0 && !(dv.placed_count || 0)) {
      try { r = await sb().rpc('tourn_draw_fill', { p_division: S.divId }); } catch (e) { r = { error: e }; }
      if (r.error) {
        toast(/draw_locked/.test(r.error.message || '') ? 'This draw is locked' : 'Could not fill the draw', 'error');
        return;
      }
      toast((r.data || 0) + ' placed into the draw', 'success');
      S.tab = 'bracket'; S.drawKey = null; await refreshDetail(); return;
    }
    try { r = await sb().rpc('tourn_bracket_build', { p_division: S.divId }); } catch (e) { r = { error: e }; }
    if (r.error) { toast('Could not make the draw', 'error'); return; }
    toast('Draw made', 'success'); S.tab = 'bracket'; S.drawKey = null; await refreshDetail();
  }
  function segVal(id) { var b = document.querySelector('#' + id + ' button.on'); return b ? b.getAttribute('data-v') : null; }
  var STATUSES = [['draft', 'Draft'], ['live', 'Go Live'], ['final', 'Completed']];
  function statusSegBtns(cur, ns) { cur = (cur === 'open' ? 'live' : cur) || 'draft'; return STATUSES.map(function (s) { return '<button data-v="' + s[0] + '" class="st-' + s[0] + (s[0] === cur ? ' on' : '') + '" onclick="' + ns + '.statusPick(this,\'' + s[0] + '\')">' + s[1] + '</button>'; }).join(''); }
  var STATUS_MSG = {
    live: ['confirmation_number', 'Go live?', 'This publishes the tournament to the FFP app — members can see it, register and follow it live. You can move it back to Draft anytime.', 'Yes, go live'],
    final: ['emoji_events', 'Mark as completed?', 'This closes the tournament — the final bracket and results become the landing view for members. Only do this once every match is played.', 'Yes, mark completed'],
    draft: ['visibility_off', 'Move back to Draft?', 'The tournament will be hidden from members in the FFP app until you go live again.', 'Yes, move to Draft']
  };
  function statusPick(btn, v) {
    if (segVal('tg-status') === v) return;
    var m = STATUS_MSG[v] || ['help', 'Change status?', '', 'Confirm'];
    showConfirm(m[0], m[1], m[2], m[3], v, function () {
      document.querySelectorAll('#tg-status button').forEach(function (b) { b.classList.remove('on'); });
      btn.classList.add('on');
      saveDetails();
    });
  }
  /* WHERE AN EVENT ENDS. There was nowhere at all before this: a mistyped
     tournament sat in the list for ever. Three different jobs, and they are
     not interchangeable.
       ARCHIVE   hides it from members and from this list, keeps everything,
                 and Restore brings it back.
       CANCEL    keeps it in the app with a cancelled banner and shuts sign-ups,
                 because anyone already registered has to be told rather than
                 watch it disappear.
       DELETE    is the mistake case only: a draft with nobody in it. The
                 database refuses anything else, so this cannot destroy a
                 member's record even if the button were reached another way. */
  function endBlock(ev) {
    var st = ev.status || 'draft';
    if (st === 'archived' || st === 'cancelled') {
      return '<div class="lg-end"><div class="hd">This tournament is ' + esc(st) + '</div>'
        + '<div class="row"><div class="g"><b>Bring it back</b><span>'
        + (st === 'archived'
            ? 'It returns as a draft, hidden from members until you go live again. Nothing was lost.'
            : 'It returns as a draft and the cancelled banner comes off. Nothing was lost.')
        + '</span></div>'
        + '<button class="lg-btn" onclick="FFPTourn.eventState(\'draft\')">' + ic('undo') + 'Restore</button></div></div>';
    }
    var canDelete = st === 'draft';
    return '<div class="lg-end"><div class="hd">Ending this tournament</div>'
      + '<div class="row"><div class="g"><b>Archive it</b>'
      +   '<span>Hides it from members and from your list. Every entrant, fixture and result is kept, and you can bring it back.</span></div>'
      +   '<button class="lg-btn" onclick="FFPTourn.eventState(\'archived\')">' + ic('inventory_2') + 'Archive</button></div>'
      + '<div class="row"><div class="g"><b>Call it off</b>'
      +   '<span>Stays in the app with a cancelled banner and sign-ups close, so anyone already registered is told rather than finding it gone.</span></div>'
      +   '<button class="lg-btn" onclick="FFPTourn.eventState(\'cancelled\')">' + ic('event_busy') + 'Call it off</button></div>'
      + '<div class="row"><div class="g"><b>Delete it</b><span>' + (canDelete
            ? 'Only while it is a draft with nobody entered and nothing drawn. It is gone for good.'
            : 'Not available. This has been published or already holds entrants, so archive it instead.')
      +   '</span></div>'
      +   '<button class="lg-btn danger"' + (canDelete ? '' : ' disabled')
      +     ' onclick="FFPTourn.eventDelete()">' + ic('delete_forever') + 'Delete</button></div></div>';
  }
  async function eventState(state) {
    var ev = (S.detail && S.detail.event) || {}, nm = esc(ev.name || 'this tournament');
    var M = {
      archived:  ['inventory_2', 'Archive ' + nm + '?', 'It disappears from the FFP app and from your list. Every entrant, fixture and result is kept, and Restore brings it back as a draft.', 'Yes, archive it', 'final'],
      cancelled: ['event_busy', 'Call off ' + nm + '?', 'Members keep seeing it, with a cancelled banner, and sign-ups close. Nothing is deleted and you can restore it.', 'Yes, call it off', 'final'],
      draft:     ['undo', 'Restore ' + nm + '?', 'It comes back as a draft, hidden from members until you go live again.', 'Yes, restore it', 'draft']
    }[state];
    if (!M) return;
    showConfirm(M[0], M[1], M[2], M[3], M[4], async function () {
      var r; try { r = await sb().rpc('lt_event_set_state', { p_scope: 'tourn', p_id: S.eventId, p_state: state }); } catch (e) { r = { error: e }; }
      if (r.error) { toast(/not_owner/.test(r.error.message || '') ? 'Not your tournament' : 'Could not change it', 'error'); return; }
      toast(state === 'draft' ? 'Restored as a draft' : (state === 'archived' ? 'Archived' : 'Called off'), 'success');
      if (state === 'archived') { S.view = 'list'; renderList(); } else { refreshDetail(); }
    });
  }
  async function eventDelete() {
    var ev = (S.detail && S.detail.event) || {}, nm = esc(ev.name || 'this tournament');
    showConfirm('delete_forever', 'Delete ' + nm + '?',
      'This removes the tournament and everything set up on it. It cannot be undone.',
      'Yes, delete it', 'final', async function () {
      var r; try { r = await sb().rpc('lt_event_delete', { p_scope: 'tourn', p_id: S.eventId }); } catch (e) { r = { error: e }; }
      if (r.error) { toast(/not_owner/.test(r.error.message || '') ? 'Not your tournament' : 'Could not delete it', 'error'); return; }
      var d = r.data || {};
      if (d.ok === false) {
        toast(d.reason === 'not_draft'
            ? 'Only a draft can be deleted. Archive it instead.'
            : 'It already holds ' + (d.entrants || 0) + ' entrants and ' + (d.matches || 0) + ' matches. Archive it instead.', 'error');
        return;
      }
      toast('Deleted', 'success'); S.view = 'list'; renderList();
    });
  }
  function toggleArchived() { S.showArchived = !S.showArchived; renderList(); }
  function showConfirm(icon, title, body, okLabel, tone, onOk) {
    var old = document.getElementById('tg-cfm'); if (old) old.remove();
    var bk = document.createElement('div'); bk.id = 'tg-cfm'; bk.className = 'lg-cfm';
    bk.innerHTML = '<div class="lg-cfm-in"><span class="ms lg-cfm-ic tone-' + tone + '">' + icon + '</span><div class="lg-cfm-t">' + title + '</div><div class="lg-cfm-b">' + body + '</div><div class="lg-cfm-a"><button class="lg-btn ghost" id="tg-cfm-no">Cancel</button><button class="lg-btn pri st-' + tone + '" id="tg-cfm-yes">' + okLabel + '</button></div></div>';
    document.body.appendChild(bk);
    bk.querySelector('#tg-cfm-no').onclick = function () { bk.remove(); };
    bk.querySelector('#tg-cfm-yes').onclick = function () { bk.remove(); onOk(); };
    bk.onclick = function (e) { if (e.target === bk) bk.remove(); };
  }
  function v(id) { var e = document.getElementById(id); return e ? e.value : ''; }
  // a timestamptz split into the two inputs a person actually fills in
  function dPart(ts) { return ts ? String(ts).slice(0, 10) : ''; }
  function tPart(ts) { if (!ts) return ''; var d = new Date(ts); if (isNaN(d)) return '';
    return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }
  function joinDT(dId, tId) {
    var d = v(dId); if (!d) return '';
    var t = v(tId) || '00:00';
    return new Date(d + 'T' + t).toISOString();
  }

  async function saveDetails() {
    var p = { name: v('tg-name'),
      city: v('tg-city'), country: v('tg-country'), starts_at: v('tg-start') || null, ends_at: v('tg-end') || null,
      status: segVal('tg-status') || 'draft', description: v('tg-desc'), rules: v('tg-rules'),
      reg_opens_at: joinDT('tg-ro-d', 'tg-ro-t'), reg_closes_at: joinDT('tg-rc-d', 'tg-rc-t'),
      entry_fee: v('tg-fee') === '' ? null : v('tg-fee'), currency: (v('tg-cur') || '').toUpperCase(),
      pay_instructions: v('tg-payhow') };
    var r; try { r = await sb().rpc('tourn_event_save', { p_id: S.eventId, p: p }); } catch (e) { r = { error: e }; }
    if (r.error) { toast('Save failed', 'error'); return; }
    try { await sb().rpc('tourn_set_stream', { p_event: S.eventId, p_url: v('tg-stream') }); } catch (e) {}
    toast('Saved', 'success'); open(S.eventId);
  }

  // CATEGORIES (inline)
  function renderDivisions(host) {
    var divs = S.detail.divisions || [];
    var rows = divs.map(function (d) {
      if (S.divEdit === d.id) return divEditor(d);
      return '<div class="lg-row"><span class="ms drag">drag_indicator</span><div class="g"><b>' + esc(d.name) + '</b> <span>' + (d.kind === 'individual' ? 'Individual' : 'Team') + ', ' + (d.entrant_count || 0) + ' in</span></div><span class="ms act" onclick="FFPTourn.editDivision(\'' + d.id + '\')">edit</span></div>';
    }).join('');
    var adder = S.divEdit === 'new' ? divEditor(null) : '<button class="lg-btn" style="margin-top:12px" onclick="FFPTourn.editDivision(\'new\')">' + ic('add') + 'Add division</button>';
    host.innerHTML = rows + adder; var f = document.getElementById('tg-dvname'); if (f) f.focus();
  }
  function divEditor(d) {
    d = d || {};
    var mode = (S.detail && S.detail.event && S.detail.event.entrant_mode) || 'individual';
    var isTeam = d.id ? (d.kind !== 'individual') : (mode === 'team');
    var gOpts = '<option value="">Open / any</option>' + genderNames().map(function (g) { return '<option' + (d.gender === g ? ' selected' : '') + '>' + esc(g) + '</option>'; }).join('');
    // Only a mixed tournament asks per division; otherwise Setup already said.
    var kindCtl = mode === 'mixed'
      ? '<div class="lg-seg" id="tg-dvkind"><button data-v="team" class="' + (isTeam ? 'on' : '') + '" onclick="FFPTourn.divKind(this)">Team / pair</button><button data-v="individual" class="' + (!isTeam ? 'on' : '') + '" onclick="FFPTourn.divKind(this)">Individual</button></div>'
      : '<span class="lg-seg" id="tg-dvkind" style="display:none"><button data-v="' + (isTeam ? 'team' : 'individual') + '" class="on"></button></span>';
    var teamCtl = isTeam
      ? '<input class="lg-in" id="tg-dvsize" type="number" min="1" placeholder="Players per team" title="Players per team" value="' + (d.team_size != null ? d.team_size : 2) + '" style="width:150px">'
      : '';
    return '<div class="lg-edit' + (d.id && S.divDel === d.id ? ' lg-entform' : '') + '" id="tg-dved"><input class="lg-in" id="tg-dvname" placeholder="' + (isTeam ? 'Team division name' : 'Division name') + '" value="' + esc(d.name || '') + '">'
      + kindCtl + teamCtl
      + '<select class="lg-sel" id="tg-dvgender" style="width:auto">' + gOpts + '</select>'
      + '<input class="lg-in" id="tg-dvmin" type="number" placeholder="Min age" value="' + (d.min_age != null ? d.min_age : '') + '" style="width:88px">'
      + '<input class="lg-in" id="tg-dvmax" type="number" placeholder="Max age" value="' + (d.max_age != null ? d.max_age : '') + '" style="width:88px">'
      + divActs(d) + '</div>';
  }
  /* REMOVING A DIVISION. The same shape the entrant delete already uses: a
     ghost red Remove in the editor, a question that names exactly what goes,
     and a solid red confirm. A division that has matches drawn is NOT deleted
     -- the draw and the results are the record of what was played -- so the
     question becomes a refusal that says what is in the way. */
  function divActs(d) {
    if (!d.id || S.divDel !== d.id) {
      return '<button class="lg-btn pri" onclick="FFPTourn.saveDivision(\'' + (d.id || '') + '\')">' + ic('check') + 'Save</button>'
        + '<button class="lg-btn ghost" onclick="FFPTourn.cancelDivision()">Cancel</button>'
        + (d.id ? '<span class="sp"></span><button class="lg-btn ghost danger" onclick="FFPTourn.askRemoveDivision(\'' + d.id + '\')">' + ic('delete') + 'Remove</button>' : '');
    }
    var u = S._divUse || {};
    if (u.loading) return '<span class="delq">Checking what is in ' + esc(d.name) + '…</span>';
    if (u.matches > 0) {
      return '<div class="acts"><span class="delq">' + esc(d.name) + ' cannot be removed</span>'
        + '<span class="sp"></span>'
        + '<button class="lg-btn" onclick="FFPTourn.cancelRemoveDivision()">Back</button></div>'
        + '<div class="msg">' + usageLine(u) + '</div>'
        + '<div class="note">Rename it, or move its ' + (d.kind === 'individual' ? 'players' : 'teams')
        + ' to another division and finish the event. Nothing that has been played is ever thrown away.</div>';
    }
    return '<div class="acts"><span class="delq">Remove ' + esc(d.name) + ' from the tournament?</span>'
      + '<span class="sp"></span>'
      + '<button class="lg-btn" onclick="FFPTourn.cancelRemoveDivision()">Keep it</button>'
      + '<button class="lg-btn danger solid" onclick="FFPTourn.removeDivision(\'' + d.id + '\')">' + ic('delete_forever') + 'Remove</button></div>'
      + '<div class="note">' + (u.entrants > 0
          ? usageLine(u) + ' Nothing has been drawn, so the division and those entries go together.'
          : 'Nothing has been drawn in this division and nobody is entered, so it goes on its own.') + '</div>';
  }
  function usageLine(u) {
    var p = [];
    if (u.entrants > 0) p.push(u.entrants + (u.entrants === 1 ? ' entry' : ' entries'));
    if (u.matches > 0) p.push(u.matches + (u.matches === 1 ? ' match drawn' : ' matches drawn'));
    if (u.played > 0) p.push(u.played + ' of them played');
    return p.length ? p.join(', ') + '.' : '';
  }
  async function askRemoveDivision(id) {
    S.divDel = id; S._divUse = { loading: true }; renderTab();
    var r; try { r = await sb().rpc('tourn_division_usage', { p_division: id }); } catch (e) { r = { error: e }; }
    S._divUse = (r && r.data) || { entrants: 0, matches: 0, played: 0 };
    renderTab();
  }
  function cancelRemoveDivision() { S.divDel = null; S._divUse = null; renderTab(); }
  async function removeDivision(id) {
    var r; try { r = await sb().rpc('tourn_division_remove', { p_division: id }); } catch (e) { r = { error: e }; }
    if (r.error) { toast('Could not remove it', 'error'); return; }
    S.divDel = null; S._divUse = null; S.divEdit = null;
    if (S.divId === id) S.divId = null;
    toast('Division removed', 'success'); refreshDetail();
  }
  // Switching a division to a team needs the team fields there and then.
  function divKind(btn) {
    document.querySelectorAll('#tg-dvkind button').forEach(function (b) { b.classList.remove('on'); });
    btn.classList.add('on');
    var team = btn.getAttribute('data-v') === 'team';
    var ed = document.getElementById('tg-dved'); if (!ed) return;
    var sz = document.getElementById('tg-dvsize');
    if (team && !sz) {
      sz = document.createElement('input');
      sz.className = 'lg-in'; sz.id = 'tg-dvsize'; sz.type = 'number'; sz.min = '1';
      sz.placeholder = 'Players per team'; sz.title = 'Players per team'; sz.value = '2';
      sz.style.width = '150px';
      ed.insertBefore(sz, document.getElementById('tg-dvgender'));
    } else if (!team && sz) { sz.remove(); }
  }
  function editDivision(id) { S.divEdit = id; S.divDel = null; S._divUse = null; renderTab(); }
  function cancelDivision() { S.divEdit = null; S.divDel = null; S._divUse = null; renderTab(); }
  async function saveDivision(id) {
    var nm = (document.getElementById('tg-dvname') || {}).value; if (!nm || !nm.trim()) { toast('Name required', 'error'); return; }
    var mode = (S.detail && S.detail.event && S.detail.event.entrant_mode) || 'individual';
    var kind = segVal('tg-dvkind') || (mode === 'team' ? 'team' : 'individual');
    var p = { name: nm.trim(), kind: kind, team_size: kind === 'team' ? (Math.max(1, +v('tg-dvsize') || 2)) : 1, gender: v('tg-dvgender') || 'any', min_age: v('tg-dvmin') || null, max_age: v('tg-dvmax') || null };
    var r; try { r = await sb().rpc('tourn_division_save', { p_tourn: S.eventId, p_id: id || null, p: p }); } catch (e) { r = { error: e }; }
    if (r.error) { toast('Save failed', 'error'); return; } S.divEdit = null; toast('Saved', 'success'); refreshDetail();
  }

  // ENTRANTS (inline)
  // Paid or not, and what it was paid by. One tap marks it, so the desk can
  // take cash and move on without opening anything.
  function paidCell(en) {
    var on = !!en.paid;
    var t = on ? ('Paid' + (en.paid_method_label ? ', ' + en.paid_method_label : '')) : 'Not paid';
    return '<button class="tg-paid' + (on ? ' on' : '') + '" title="' + esc(t) + '"'
      + ' onclick="FFPTourn.togglePaid(\'' + en.id + '\',' + (on ? 'false' : 'true') + ')">'
      + ic(on ? 'paid' : 'radio_button_unchecked') + (on ? 'Paid' : 'Unpaid') + '</button>';
  }

  /* EMAILING THE PLAYERS. The count shown here comes from the same database
     function the mailer sends from, so the number on the button is the number
     of emails that go out - not an estimate of it. */
  function mailPanel() {
    var m = S._mail;
    if (!m || !m.ok) return '';
    var can = m.with_email || 0, none = m.no_email || 0, go = m.to_send || 0, done = m.sent || 0;
    var chg = m.changed || 0;
    return '<div class="tg-mail">'
      + '<div class="hd">' + ic('mail') + '<b>Tell the players it is in the app</b></div>'
      + '<div class="nums">'
      +   '<span><u>' + can + '</u><s>CAN BE EMAILED</s></span>'
      +   '<span' + (none ? ' class="bad"' : '') + '><u>' + none + '</u><s>NO EMAIL YET</s></span>'
      +   '<span><u>' + done + '</u><s>ALREADY SENT</s></span>'
      + '</div>'
      + (none
        ? '<div class="note">' + ic('info') + none + (none === 1 ? ' player has' : ' players have')
          + ' no address, so they cannot be told. Paste them in below or add one on the ' + nouns(null).one + '.</div>'
        : '')
      + (chg
        ? '<div class="tg-chg">'
          +   '<div class="g">' + ic('schedule') + '<div>'
          +     '<b>' + chg + (chg === 1 ? ' player is' : ' players are')
          +       ' holding a time that has changed</b>'
          +     '<span>Their match moved after they were emailed. Nothing is sent on its own, '
          +       'so they do not know yet.</span></div></div>'
          +   '<div class="a">'
          +     '<button class="lg-btn sm" onclick="FFPTourn.updPreview()">'
          +       ic('visibility') + 'See it</button>'
          +     '<button class="lg-btn sm" onclick="FFPTourn.updTest()">'
          +       ic('send') + 'Send one to me</button>'
          +     '<button class="lg-btn gold sm" onclick="FFPTourn.updAsk()">'
          +       ic('notifications_active') + 'Notify ' + chg
          +       (chg === 1 ? ' player' : ' players') + '</button>'
          +   '</div></div>'
        : '')
      + '<div class="acts">'
      +   '<button class="lg-btn" onclick="FFPTourn.mailPaste()">' + ic('content_paste') + 'Paste in emails</button>'
      +   '<button class="lg-btn" onclick="FFPTourn.mailPreview()"' + (can ? '' : ' disabled') + '>'
      +     ic('visibility') + 'See the email</button>'
      +   '<button class="lg-btn" onclick="FFPTourn.mailTest()"' + (can ? '' : ' disabled') + '>'
      +     ic('send') + 'Send one to me</button>'
      +   '<span class="sp"></span>'
      +   '<button class="lg-btn gold" onclick="FFPTourn.mailSendAsk()"' + (go ? '' : ' disabled') + '>'
      +     (go ? 'Email ' + go + (go === 1 ? ' player' : ' players') : 'Nobody left to email') + '</button>'
      + '</div></div>'
      + mailPasteSheet() + mailPreviewSheet() + mailSendSheet() + updAskSheet();
  }
  async function mailLoad() {
    var r; try { r = await sb().rpc('tourn_player_mail_stats', { p_tourn: S.eventId }); }
    catch (e) { r = null; }
    S._mail = (r && r.data) || null;
  }
  function mailPaste() { S.mailSheet = 'paste'; renderTab(); }
  function mailClose() { S.mailSheet = null; S._mailHtml = null; renderTab(); }
  function mailPasteSheet() {
    if (S.mailSheet !== 'paste') return '';
    return '<div class="lg-cfm"><div class="lg-cfm-in lg-who">'
      + '<div class="lg-cfm-t">Paste in their emails</div>'
      + '<div class="lg-cfm-b">One per line, name then email. A name that is already '
      + 'in the draw gets the address; anything that does not match is reported back '
      + 'rather than guessed at.</div>'
      + '<textarea class="lg-in tg-mailta" id="tg-mailpaste" rows="9" '
      + 'placeholder="Jon Down, jon@example.com"></textarea>'
      + '<div class="lg-cfm-a"><button class="lg-btn ghost" onclick="FFPTourn.mailClose()">Cancel</button>'
      + '<button class="lg-btn pri" onclick="FFPTourn.mailPasteApply()">Add these</button></div>'
      + '</div></div>';
  }
  async function mailPasteApply() {
    var el = document.getElementById('tg-mailpaste');
    var txt = el ? String(el.value || '') : '';
    var rows = txt.split(/\n+/).map(function (ln) {
      var parts = ln.split(/[,\t;]+/).map(function (x) { return x.trim(); }).filter(Boolean);
      if (!parts.length) return null;
      var em = '', nm = [];
      parts.forEach(function (x) { if (!em && x.indexOf('@') > -1) em = x; else nm.push(x); });
      return { name: nm.join(' '), email: em };
    }).filter(function (x) { return x && x.name; });
    if (!rows.length) { toast('Nothing to add', 'error'); return; }
    var r; try { r = await sb().rpc('tourn_entrant_emails_bulk', { p_tourn: S.eventId, p_rows: rows }); }
    catch (e) { r = { error: e }; }
    if (r.error || !(r.data && r.data.ok)) { toast('Could not add those', 'error'); return; }
    var d = r.data, miss = (d.unmatched || []).length, bad = (d.bad_email || []).length;
    toast(d.set + (d.set === 1 ? ' email added' : ' emails added')
      + (miss ? ', ' + miss + ' did not match anyone' : '')
      + (bad ? ', ' + bad + ' not a valid address' : ''), (miss || bad) ? 'error' : 'success');
    S.mailSheet = null; await mailLoad(); renderTab();
  }
  /* Seen before it is sent, exactly as it will arrive. */
  async function mailPreview() {
    var r = await mailFn({ preview: true });
    if (!r) return;
    S._mailHtml = r.html || ''; S.mailSheet = 'preview'; renderTab();
  }
  function mailPreviewSheet() {
    if (S.mailSheet !== 'preview') return '';
    return '<div class="lg-cfm"><div class="tg-mailprev">'
      + '<div class="bar"><b>This is what they get</b><span class="sp"></span>'
      + '<button class="lg-btn ghost" onclick="FFPTourn.mailClose()">' + ic('close') + 'Close</button></div>'
      + '<iframe title="The email" srcdoc="' + esc(S._mailHtml || '') + '"></iframe>'
      + '</div></div>';
  }
  async function mailTest() {
    var me = (window.FFPAuth && FFPAuth.email && FFPAuth.email()) || '';
    if (!me) { me = prompt('Send the test to which address?') || ''; }
    if (!me || me.indexOf('@') < 0) return;
    var r = await mailFn({ test_to: me });
    if (r) toast(r.ok ? 'Sent to ' + me : 'Could not send it', r.ok ? 'success' : 'error');
  }
  function mailSendAsk() { S.mailSheet = 'send'; renderTab(); }
  function mailSendSheet() {
    if (S.mailSheet !== 'send') return '';
    var go = (S._mail && S._mail.to_send) || 0;
    return '<div class="lg-cfm"><div class="lg-cfm-in">'
      + '<span class="ms lg-cfm-ic" style="color:var(--ffp-gold)">mail</span>'
      + '<div class="lg-cfm-t">Email ' + go + (go === 1 ? ' player?' : ' players?') + '</div>'
      + '<div class="lg-cfm-b">This sends now, to the address each of them registered with. '
      + 'Nobody is emailed twice: anyone already sent is left out unless you ask for them again.</div>'
      + '<div class="lg-cfm-a"><button class="lg-btn ghost" onclick="FFPTourn.mailClose()">Cancel</button>'
      + '<button class="lg-btn pri" onclick="FFPTourn.mailSend()">Yes, send</button></div>'
      + '</div></div>';
  }
  async function mailSend() {
    S.mailSheet = null; renderTab();
    toast('Sending\u2026', 'info');
    var r = await mailFn({});
    if (!r) return;
    toast((r.sent || 0) + ' sent' + ((r.failed || []).length ? ', ' + r.failed.length + ' did not go' : ''),
      (r.failed || []).length ? 'error' : 'success');
    await mailLoad(); renderTab();
  }
  /* THE UPDATE, WHICH ONLY EVER GOES WHEN IT IS ASKED FOR. Same mailer, same
     guard; the updates flag swaps the list for the players whose first match
     has moved since they were told about it. */
  async function updPreview() {
    var r = await mailFn({ updates: true, preview: true });
    if (!r) return;
    if (!r.to_send) { toast('Nobody is holding a changed time', 'info'); return; }
    S._mailHtml = r.html || ''; S.mailSheet = 'preview'; renderTab();
  }
  async function updTest() {
    var me = (window.FFPAuth && FFPAuth.email && FFPAuth.email()) || '';
    if (!me) { me = prompt('Send the test to which address?') || ''; }
    if (!me || me.indexOf('@') < 0) return;
    var r = await mailFn({ updates: true, test_to: me });
    if (r) toast(r.ok ? 'Sent to ' + me : 'Could not send it', r.ok ? 'success' : 'error');
  }
  function updAsk() { S.mailSheet = 'upd'; renderTab(); }
  function updAskSheet() {
    if (S.mailSheet !== 'upd') return '';
    var chg = (S._mail && S._mail.changed) || 0;
    return '<div class="lg-cfm"><div class="lg-cfm-in">'
      + '<span class="ms lg-cfm-ic" style="color:var(--ffp-gold)">notifications_active</span>'
      + '<div class="lg-cfm-t">Tell ' + chg + (chg === 1 ? ' player?' : ' players?') + '</div>'
      + '<div class="lg-cfm-b">Only the ones whose match has moved since they were emailed. '
      + 'They get the new time and a notification in the app, and the old time struck through. '
      + 'Nobody else hears anything.</div>'
      + '<div class="lg-cfm-a"><button class="lg-btn ghost" onclick="FFPTourn.mailClose()">Cancel</button>'
      + '<button class="lg-btn pri" onclick="FFPTourn.updSend()">Yes, tell them</button></div>'
      + '</div></div>';
  }
  async function updSend() {
    S.mailSheet = null; renderTab();
    toast('Telling them\u2026', 'info');
    var r = await mailFn({ updates: true });
    if (!r) return;
    toast((r.sent || 0) + ' told'
      + ((r.notified || 0) ? ', ' + r.notified + ' also in the app' : '')
      + ((r.failed || []).length ? ', ' + r.failed.length + ' did not go' : ''),
      (r.failed || []).length ? 'error' : 'success');
    await mailLoad(); renderTab();
  }

  /* One place that calls the mailer, so the guard and the error handling are
     not written four times. */
  async function mailFn(extra) {
    var url = (window.FFP_SUPABASE_URL || 'https://kxzyuofecmtymablnmak.supabase.co')
      + '/functions/v1/tourn-players-email';
    var body = Object.assign({ key: 'FFP-TOURN-PLAYERS-2026', tourn_id: S.eventId }, extra || {});
    var r; try {
      r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
                             body: JSON.stringify(body) });
    } catch (e) { toast('Could not reach the mailer', 'error'); return null; }
    var d; try { d = await r.json(); } catch (e) { d = null; }
    if (!r.ok || !d) { toast((d && d.error) || 'The mailer refused that', 'error'); return null; }
    return d;
  }

  async function renderEntrants(host) {
    var divs = S.detail.divisions || [];
    if (!divs.length) { host.innerHTML = '<div class="lg-empty">Add a division first.</div>'; return; }
    if (!S.divId) S.divId = divs[0].id;
    var N = nouns(curDv());
    var adder = S.entAdd
      ? '<div class="lg-edit"><input class="lg-in" id="tg-entname" placeholder="' + N.One + ' name" onkeydown="if(event.key===\'Enter\')FFPTourn.saveEntrant()"><button class="lg-btn pri" onclick="FFPTourn.saveEntrant()">' + ic('check') + 'Add</button><button class="lg-btn ghost" onclick="FFPTourn.cancelEntrant()">Cancel</button></div>'
      : '<button class="lg-btn" onclick="FFPTourn.addEntrant()">' + ic('add') + 'Add a ' + N.one + '</button>';
    /* A round of a series starts from the series list, not a blank form. */
    var inSeries = !!(S.detail && S.detail.event && S.detail.event.series_id);
    var serBtn = (inSeries && S.divId && !S.serEnter)
      ? '<button class="lg-btn" onclick="FFPTourn.serEnterOpen()">' + ic('groups') + 'Add from the series</button>' : '';
    host.innerHTML = '<div id="tg-mailwrap"></div><div class="lg-tool"><select class="lg-sel" onchange="FFPTourn.setDiv(this.value,\'entrants\')">' + divOpts() + '</select><span class="sp"></span>' + serBtn + (S.divId ? '<button class="lg-btn" onclick="FFPTourn.bulkAthletes()">' + ic('upload_file') + 'Bulk add</button>' : '') + '</div>' + serEnterHtml() + adder + '<div id="tg-roster"><div class="lg-empty">Loading…</div></div>';
    var f = document.getElementById('tg-entname'); if (f) f.focus();
    await mailLoad();
    var mp = document.getElementById('tg-mailwrap'); if (mp) mp.innerHTML = mailPanel();
    var r; try { r = await sb().rpc('tourn_roster', { p_division: S.divId }); } catch (e) { r = { error: e }; }
    try { var sq = await sb().rpc('lt_squad_list', { p_scope: 'tourn', p_event: S.eventId }); S._squad = (sq && sq.data) || []; } catch (e) { S._squad = []; }
    try {
      var gm = await sb().from('tourn_matches').select('group_label').eq('division_id', S.divId);
      S._grpLabels = [...new Set(((gm && gm.data) || []).map(function (x) { return x.group_label; }).filter(Boolean))];
    } catch (e) { S._grpLabels = []; }
    var rows = (r && r.data) || []; var host2 = document.getElementById('tg-roster');
    // Entries that have signed up but are not in yet. A team is made by its
    // captain and waits here until the organiser lets it in.
    var waiting = rows.filter(function (en) { return en.status === 'pending'; });
    var pend = waiting.length
      ? '<div class="tg-pend"><div class="hd">' + waiting.length + (waiting.length === 1 ? ' entry waiting' : ' entries waiting') + '</div>'
        + waiting.map(function (en) {
            return '<div class="row"><b>' + esc(en.name) + '</b>'
              + '<span class="sub">' + esc(en.kind === 'individual' ? 'Individual' : 'Team') + (en.club ? ', ' + esc(en.club) : '') + '</span>'
              + '<span class="sp"></span>'
              + '<button class="lg-btn sm" onclick="FFPTourn.decide(\'' + en.id + '\',true)">' + ic('check') + 'Approve</button>'
              + '<button class="lg-btn sm ghost" onclick="FFPTourn.decide(\'' + en.id + '\',false)">Decline</button></div>';
          }).join('') + '</div>'
      : '';
    host2.innerHTML = pend + (rows.length ? rows.map(function (en) {
      var flag = en.nationality ? ', ' + esc(en.nationality) : '';
      var isTeam = en.kind !== 'individual';
      var sqBtn = isTeam ? '<button class="lg-btn sm" onclick="FFPTourn.sqToggle(\'' + en.id + '\')">' + ic('groups') + 'Squad (' + squadFor(en.id).length + ')</button>' : '';
      var tInit = en.logo ? '' : esc((en.name || '?').slice(0, 1));
      var tBg = en.logo ? 'background-image:url(\'' + esc(en.logo) + '\')' : '';
      var tCrest = isTeam
        ? '<span class="lg-av lg-avedit" title="Add / change logo" onclick="FFPTourn.entLogo(\'' + en.id + '\')" style="' + tBg + '">' + tInit + '<span class="lg-avplus ms">add</span></span>'
        : '<span class="lg-av" style="' + tBg + '">' + tInit + '</span>';
      // Editing replaces the row in place, so the list never jumps.
      if (S.entEdit === en.id) return entEditHtml(en);
      var edBtn = '<span class="ms act" title="Edit details" onclick="FFPTourn.editEntrant(\'' + en.id + '\')">edit</span>';
      var row = '<div class="lg-row">' + tCrest + paidCell(en) + '<div class="g"><b>' + esc(en.name) + '</b> <span>' + esc(en.status) + (hasGroups() && en.group_label ? ', Group ' + esc(en.group_label) : '') + (en.kind === 'individual' ? flag : '') + '</span></div>' + sqBtn + edBtn + '</div>';
      return row + (isTeam && S.sqOpen === en.id ? '<div class="lg-sq" id="lg-sq-' + en.id + '"><div class="lg-sqsrch">' + ic('search') + '<input id="lg-sqq-' + en.id + '" placeholder="Search FFP or type a name" value="' + esc((S._sqQ || {})[en.id] || '') + '" oninput="FFPTourn.sqSearch(\'' + en.id + '\',this.value)" onkeydown="FFPTourn.sqKey(\'' + en.id + '\',event)"></div><div id="lg-sqres-' + en.id + '">' + sqResHtml(en.id) + '</div></div>' : '');
    }).join('') : '<div class="lg-empty">No ' + N.many + ' yet. Members self-register in the app, or add them here.</div>');
    S._roster = rows;
    host2.innerHTML += findSheet();
  }

  function entOf(id) { return (S._roster || []).find(function (x) { return x.id === id; }) || null; }
  function findRow(c, same) {
    return '<div class="r"><div class="g"><b>' + esc(c.name || 'Member') + '</b>'
      + '<span>' + esc(c.email || '') + (c.city ? '<i>' + esc(c.city) + '</i>' : '') + '</span></div>'
      + (same && !c.taken_by ? '<em class="same">' + ic('done') + 'Same name</em>' : '')
      + (c.taken_by
        ? '<em class="taken">Already ' + esc(c.taken_by) + '</em>'
        : '<button class="lg-btn pri sm" onclick="FFPTourn.entLink(\'' + c.id + '\')">Link</button>')
      + '</div>';
  }
  function findSheet() {
    if (!S.entFind) return '';
    var en = entOf(S.entFind); if (!en) return '';
    var d = S._entAcc || {}, sug = d.suggested || [], got = d.found;
    return '<div class="lg-cfm"><div class="lg-cfm-in lg-who">'
      + '<div class="lg-cfm-t">Which account is ' + esc(en.name) + '?</div>'
      + '<div class="lg-cfm-b">Linking puts the tournament in their app and lets them score their '
      + 'own matches. Nothing is sent to them.</div>'
      + '<div class="tg-find">'
      +   '<div class="hd">Same name on FFP</div>'
      +   (sug.length ? sug.map(function (c) { return findRow(c, true); }).join('')
                      : '<div class="none">No account on FFP under that name.</div>')
      +   '<div class="hd sp">Or type the address their FFP account uses</div>'
      +   '<div class="row"><input class="lg-in" id="tg-findem" type="email" '
      +     'placeholder="their.address@example.com" value="' + esc(S._entAccQ || '') + '" '
      +     'onkeydown="if(event.key===\'Enter\')FFPTourn.entFindEmail()">'
      +     '<button class="lg-btn" onclick="FFPTourn.entFindEmail()">' + ic('search') + 'Find</button></div>'
      +   (got === null || got === undefined ? ''
         : (got ? findRow(got, false)
                : '<div class="none">No FFP account uses that address.</div>'))
      +   '<div class="note">' + ic('lock')
      +     '<div>An exact address only. The member list is not browsable from here.</div></div>'
      + '</div>'
      + '<div class="lg-cfm-a"><button class="lg-btn ghost" onclick="FFPTourn.entFindClose()">Cancel</button></div>'
      + '</div></div>';
  }
  async function loadAcc(id, email) {
    var r; try { r = await sb().rpc('tourn_entrant_accounts',
      { p_entrant: id, p_email: email || null }); } catch (e) { r = { error: e }; }
    if (r.error || !(r.data && r.data.ok)) {
      toast((r.data && r.data.detail) || 'Could not look that up', 'error'); return false;
    }
    S._entAcc = r.data; return true;
  }
  async function entFind(id) {
    S.entFind = id; S._entAcc = null; S._entAccQ = '';
    if (await loadAcc(id, null)) renderTab();
  }
  function entFindClose() { S.entFind = null; S._entAcc = null; S._entAccQ = ''; renderTab(); }
  async function entFindEmail() {
    var el = document.getElementById('tg-findem');
    S._entAccQ = el ? String(el.value || '').trim() : '';
    if (!S._entAccQ) { toast('Type the address first', 'error'); return; }
    if (await loadAcc(S.entFind, S._entAccQ)) renderTab();
  }
  async function entLink(memberId) {
    var id = S.entFind; if (!id) return;
    var r; try { r = await sb().rpc('tourn_entrant_link',
      { p_entrant: id, p_member: memberId }); } catch (e) { r = { error: e }; }
    if (r.error || !(r.data && r.data.ok)) {
      toast((r.data && r.data.detail) || 'Could not link that account', 'error'); return;
    }
    S.entFind = null; S._entAcc = null; S._entAccQ = '';
    toast('Linked', 'success'); renderTab();
  }
  async function entUnlink(id) {
    var r; try { r = await sb().rpc('tourn_entrant_link',
      { p_entrant: id, p_member: null }); } catch (e) { r = { error: e }; }
    if (r.error || !(r.data && r.data.ok)) { toast('Could not unlink', 'error'); return; }
    toast('Unlinked', 'success'); renderTab();
  }

  // ---------- EDIT ONE ENTRANT ----------
  // An individual entrant is a member's own record, so their name and
  // nationality come from their FFP profile and are not the organiser's to
  // rewrite here — only the division, seed, group and status are.
  var ENT_STATUS = [['registered', 'Registered'], ['pending', 'Pending'], ['withdrawn', 'Withdrawn']];

  /* Group labels come from the DRAW - the division's group matches - and from
     nowhere else. Reading them off the entrants as well is what let a pool
     that no longer exists keep naming itself: one stale row was enough to put
     the Group picker back on screen. No group matches, no groups. */
  function hasGroups() { return ((S._grpLabels || []).length > 0); }
  function groupLabels() {
    var seen = {};
    (S._grpLabels || []).forEach(function (g) { if (g) seen[g] = 1; });
    return Object.keys(seen).sort();
  }

  /* WHERE THE PLAYER AND THE PERSON MEET. The copy says plainly that this is
     usually automatic, so nobody links by hand when they do not need to. */
  function acctField(en) {
    return '<div class="f gr tg-acctf"><label>FFP account</label>'
      + (en.member_id
        ? '<div class="tg-acct on">' + ic('verified')
          + '<div class="g"><b>' + esc(en.account_name || en.name || 'Linked') + '</b>'
          + '<span>' + esc(en.account_email || '') + '</span></div>'
          + '<button class="lg-btn ghost sm" onclick="FFPTourn.entUnlink(\'' + en.id + '\')">Unlink</button></div>'
        : '<div class="tg-acct">' + ic('person_search')
          + '<div class="g"><b>Not linked</b><span>They will link themselves when they sign up with '
          + 'the email above. Only do this by hand if theirs is different.</span></div>'
          + '<button class="lg-btn pri sm" onclick="FFPTourn.entFind(\'' + en.id + '\')">Find their account</button></div>')
      + '</div>';
  }
  function entEditHtml(en) {
    var isTeam = en.kind !== 'individual';
    var opts = (S.detail.divisions || []).map(function (d) {
      return '<option value="' + d.id + '"' + (d.id === S.divId ? ' selected' : '') + '>' + esc(d.name) + '</option>';
    }).join('');
    var stOpts = ENT_STATUS.map(function (x) {
      return '<option value="' + x[0] + '"' + (x[0] === en.status ? ' selected' : '') + '>' + x[1] + '</option>';
    }).join('');
    var grOpts = '<option value="">Not set</option>' + (_grades || []).map(function (x) {
      return '<option value="' + esc(x) + '"' + (x === en.grade ? ' selected' : '') + '>' + esc(x) + '</option>';
    }).join('');
    var gl = groupLabels();
    var grpField = gl.length
      ? '<div class="f sm"><label>Group</label><select class="lg-sel" id="tg-ee-group">' +
        '<option value="">None</option>' +
        gl.map(function (g) {
          return '<option value="' + esc(g) + '"' + (g === en.group_label ? ' selected' : '') + '>' + esc(g) + '</option>';
        }).join('') + '</select></div>'
      : '';
    var tInit = en.logo ? '' : esc((en.name || '?').slice(0, 1));
    var tBg = en.logo ? 'background-image:url(\'' + esc(en.logo) + '\')' : '';
    var crest = isTeam
      ? '<span class="lg-av lg-avedit" title="Add / change logo" onclick="FFPTourn.entLogo(\'' + en.id + '\')" style="' + tBg + '">' + tInit + '<span class="lg-avplus ms">add</span></span>'
      : '<span class="lg-av" style="' + tBg + '">' + tInit + '</span>';
    return '<div class="lg-edit lg-entform">' +
      '<span class="crest">' + crest + '</span>' +
      (isTeam
        ? '<div class="f gr"><label>Team name</label><input class="lg-in" id="tg-ee-name" value="' + esc(en.team_name || en.name || '') + '" onkeydown="if(event.key===\'Enter\')FFPTourn.saveEntrantEdit()"></div>'
        : '<div class="f gr"><label>Player</label><div class="ro">' + esc(en.name) + (en.nationality ? ', ' + esc(en.nationality) : '') + '</div></div>') +
      '<div class="f"><label>Division</label><select class="lg-sel" id="tg-ee-div">' + opts + '</select></div>' +
      '<div class="f sm"><label>Seed</label><input class="lg-in" id="tg-ee-seed" type="number" min="1" value="' + (en.seed == null ? '' : en.seed) + '"></div>' +
      '<div class="f gr"><label>Email</label><input class="lg-in" id="tg-ee-email" type="email" placeholder="Where to reach them" value="' + esc(en.invite_email || '') + '"></div>' +
      acctField(en) +
      (isTeam ? '' : '<div class="f"><label>Grade</label><select class="lg-sel" id="tg-ee-grade">' + grOpts + '</select></div>') +
      grpField +
      '<div class="f"><label>Status</label><select class="lg-sel" id="tg-ee-status">' + stOpts + '</select></div>' +
      /* What the broadcast graphics draw this team in. The columns were always
         on tourn_entrants and the scorebug, team sheet and lower third all read
         them; only the editor was missing, so a tournament team went to air in
         the default navy while the same club in a league had its own colours. */
      (isTeam
        ? '<div class="f sm"><label>Code</label><input class="lg-in" id="tg-ee-code" maxlength="4" placeholder="KNI" value="' + esc(en.code || '') + '"></div>' +
          '<div class="f sm"><label>Home colour</label><div class="lg-hex"><input class="sw" type="color" value="' + esc(en.color1 || '#0C2E63') + '" oninput="FFPTourn.hexSync(\'tg-ee-c1\',this.value)"><input class="lg-in" id="tg-ee-c1" maxlength="7" placeholder="#000000" value="' + esc(en.color1 || '') + '"></div></div>' +
          '<div class="f sm"><label>Away colour</label><div class="lg-hex"><input class="sw" type="color" value="' + esc(en.color2 || '#1B57AE') + '" oninput="FFPTourn.hexSync(\'tg-ee-c2\',this.value)"><input class="lg-in" id="tg-ee-c2" maxlength="7" placeholder="#000000" value="' + esc(en.color2 || '') + '"></div></div>'
        : '') +
      (S.entDel === en.id
        ? '<div class="acts"><span class="delq">Remove ' + esc(en.name) + ' from the tournament?</span>' +
            '<span class="sp"></span>' +
            '<button class="lg-btn" onclick="FFPTourn.cancelRemoveEntrant()">Keep them</button>' +
            '<button class="lg-btn danger solid" onclick="FFPTourn.removeEntrant()">' + ic('delete_forever') + 'Remove</button></div>' +
          '<div class="note">Anything drawn into matches or holding a win is marked withdrawn instead, so the bracket and results stay intact.</div>'
        : '<div class="acts">' +
            '<button class="lg-btn pri" onclick="FFPTourn.saveEntrantEdit()">' + ic('check') + 'Save</button>' +
            '<button class="lg-btn ghost" onclick="FFPTourn.cancelEntrantEdit()">Cancel</button>' +
            '<span class="sp"></span>' +
            '<button class="lg-btn ghost danger" onclick="FFPTourn.askRemoveEntrant()">' + ic('delete') + 'Remove</button>' +
          '</div>') +
      '<div class="msg" id="tg-ee-msg"></div></div>';
  }

  // the swatch and the hex box are two views of one value
  function hexSync(id, val) { var el = document.getElementById(id); if (el) el.value = String(val || '').toUpperCase(); }
  function editEntrant(id) {
    S.entEdit = id; S.entDel = null; S.sqOpen = null;
    // The grade list is fetched once; draw now, then redraw when it lands so the
    // dropdown is never an empty select.
    if (_grades) { renderTab(); return; }
    renderTab();
    gradeNames().then(function () { if (S.entEdit === id) renderTab(); });
  }
  function cancelEntrantEdit() { S.entEdit = null; S.entDel = null; renderTab(); }
  function askRemoveEntrant() { S.entDel = S.entEdit; renderTab(); }
  function cancelRemoveEntrant() { S.entDel = null; renderTab(); }

  async function saveEntrantEdit() {
    var id = S.entEdit; if (!id) return;
    var en = (S._roster || []).find(function (x) { return x.id === id; }) || {};
    var g = function (k) { var el = document.getElementById(k); return el ? String(el.value || '').trim() : ''; };
    var msg = document.getElementById('tg-ee-msg');
    var patch = { division_id: g('tg-ee-div'), seed: g('tg-ee-seed'), status: g('tg-ee-status') };
    if (document.getElementById('tg-ee-grade')) patch.grade = g('tg-ee-grade');
    if (document.getElementById('tg-ee-group')) patch.group_label = g('tg-ee-group');
    if (en.kind !== 'individual') {
      var nm = g('tg-ee-name');
      if (!nm) { if (msg) msg.textContent = 'The ' + nouns(en).one + ' needs a name'; return; }
      patch.team_name = nm;
      patch.code = g('tg-ee-code');
      patch.color1 = g('tg-ee-c1');
      patch.color2 = g('tg-ee-c2');
      var bad = [patch.color1, patch.color2].filter(function (c) { return c && !/^#[0-9a-fA-F]{6}$/.test(c); });
      if (bad.length) { if (msg) msg.textContent = 'Colours are hex codes like #101820'; return; }
    }
    /* the address is written through its own gate, which checks the shape of
       it, so a typo never becomes a silent dead end */
    if (document.getElementById('tg-ee-email')) {
      var em = g('tg-ee-email');
      if (em !== String(en.invite_email || '')) {
        var re; try { re = await sb().rpc('tourn_entrant_email', { p_entrant: id, p_email: em || null }); }
        catch (e) { re = { error: e }; }
        if (re.error || !(re.data && re.data.ok)) {
          if (msg) msg.textContent = (re.data && re.data.detail) || 'Could not save the email';
          return;
        }
      }
    }
    var r; try { r = await sb().rpc('tourn_entrant_update', { p_id: id, p: patch }); } catch (e) { r = { error: e }; }
    if (r.error) { if (msg) msg.textContent = (String(r.error.message || '').indexOf('bad_hex') > -1) ? 'Colours are hex codes like #101820' : 'Could not save'; return; }
    // A team already drawn in cannot be moved or regrouped without redoing the
    // fixtures, so say what is in the way instead of failing quietly.
    if (r.data && r.data.ok === false) {
      if (msg) {
        msg.textContent = r.data.reason === 'has_group_matches'
          ? 'Already drawn into ' + r.data.matches + ' group matches. Redraw the groups to change this.'
          : 'Already in ' + r.data.matches + ' matches in this division. Clear them first to move the ' + nouns(en).one + '.';
      }
      return;
    }
    S.entEdit = null; S.entDel = null; toast('Saved', 'success');
    S._entrants = null; refreshDetail();
  }

  async function removeEntrant() {
    var id = S.entEdit; if (!id) return;
    var r; try { r = await sb().rpc('tourn_entrant_remove', { p_id: id }); } catch (e) { r = { error: e }; }
    if (r.error) { var m = document.getElementById('tg-ee-msg'); if (m) m.textContent = 'Could not remove'; return; }
    toast((r.data && r.data.action === 'withdrawn')
      ? 'Marked withdrawn, ' + r.data.matches + ' matches kept'
      : 'Removed', 'success');
    S.entEdit = null; S.entDel = null; S._entrants = null; refreshDetail();
  }
  function squadFor(entId) { return (S._squad || []).filter(function (x) { return x.entrant_id === entId; }); }
  function sqResHtml(entId) {
    var q = ((S._sqQ || {})[entId] || ''); var res = ((S._sqRes || {})[entId] || []);
    var out = '';
    /* THE TYPED NAME IS ALWAYS ON OFFER.
       "Add name only" used to be an ELSE: it appeared only when the FFP
       search found NOBODY. Type a real person's name, the search matches
       somebody -- anybody -- and the only thing on screen is an Add button
       against a different person, so the name just typed cannot be saved at
       all. Checked against the live data: across a whole tournament, every
       squad member came from an FFP match and NOT ONE typed name had ever
       been saved. The matches and the typed name are now both offered, and
       Enter in the box adds the typed name. */
    if (res.length) out += '<div class="lg-sqhint">Already on FFP</div><div class="lg-sqres">' + res.map(function (r) {
      return '<div class="row"><span class="av" style="' + (r.photo ? 'background-image:url(\'' + esc(r.photo) + '\')' : '') + '"></span><div class="g"><b>' + esc(r.name) + '</b><span>' + esc([r.city, r.email_hint].filter(Boolean).join(', ')) + '</span></div><button class="lg-btn sm pri" onclick="FFPTourn.sqAddMember(\'' + entId + '\',\'' + r.id + '\')">Add</button></div>';
    }).join('') + '</div>';
    if (q.trim().length >= 2) out += '<div class="lg-sqadd2"><button class="lg-btn sm pri" onclick="FFPTourn.sqNameOnly(\'' + entId + '\')">' + ic('person_add') + 'Add &ldquo;' + esc(q.trim()) + '&rdquo;</button><button class="lg-btn sm" onclick="FFPTourn.sqInvite(\'' + entId + '\')">' + ic('mail') + 'Invite by email</button></div>';
    var list = squadFor(entId);
    out += '<div class="lg-sqlist">' + (list.length ? list.map(function (p) {
      var b = p.member_id ? '<span class="lg-scpill">FFP</span>' : (p.invite_email ? '<span class="lg-scpill inv">INVITED</span>' : '<span class="lg-scpill txt">NAME</span>');
      return '<div class="lg-sqrow"><span class="nm">' + esc(p.name) + '</span>' + b + '<span class="sp"></span><span class="ms x" onclick="FFPTourn.sqRemove(\'' + p.id + '\')">close</span></div>';
    }).join('') : '<div class="lg-empty" style="padding:12px">No players yet.</div>') + '</div>';
    return out;
  }
  function paintSqRes(entId) { var el = document.getElementById('lg-sqres-' + entId); if (el) el.innerHTML = sqResHtml(entId); }
  function sqToggle(id) { S.sqOpen = (S.sqOpen === id) ? null : id; renderTab(); }
  var _sqTimer = {};
  function sqSearch(id, q) {
    S._sqQ = S._sqQ || {}; S._sqQ[id] = q; clearTimeout(_sqTimer[id]);
    if (q.trim().length < 2) { S._sqRes = S._sqRes || {}; S._sqRes[id] = []; paintSqRes(id); return; }
    _sqTimer[id] = setTimeout(async function () { var r; try { r = await sb().rpc('lt_member_search', { p_q: q.trim() }); } catch (e) { r = null; } S._sqRes = S._sqRes || {}; S._sqRes[id] = (r && r.data) || []; paintSqRes(id); }, 300);
  }
  /* THE SUPABASE CLIENT DOES NOT THROW ON A DATABASE ERROR -- it resolves with
     { data, error }. Every squad writer was wrapped in try/catch alone, so a
     refused write resolved normally, the catch never ran, no toast appeared,
     and the list was simply repainted from the old data. A failure looked
     EXACTLY like a success. That is why "it's not saving" came with no error
     on screen. This checks `error` as well as catching, and says what the
     database actually said. */
  function sqWhy(e) {
    var m = (e && (e.message || e.hint || e.details)) || '';
    if (/not_owner/.test(m)) return 'you are not listed as an organiser or scorer on this event';
    if (/empty_name/.test(m)) return 'type a name first';
    if (/duplicate|unique/i.test(m)) return 'that player is already in this squad';
    return m || 'the database refused it';
  }
  async function sqCall(fn, args, what) {
    var r = null;
    try { r = await sb().rpc(fn, args); }
    catch (e) { toast(what + ' \u2014 ' + sqWhy(e), 'error'); return false; }
    if (r && r.error) { toast(what + ' \u2014 ' + sqWhy(r.error), 'error'); return false; }
    return true;
  }
  function sqKey(id, ev) {
    if (!ev || ev.key !== 'Enter') return;
    ev.preventDefault();
    if ((((S._sqQ || {})[id]) || '').trim().length >= 2) sqNameOnly(id);
  }
  async function _sqReload(id) { try { var sq = await sb().rpc('lt_squad_list', { p_scope: 'tourn', p_event: S.eventId }); S._squad = (sq && sq.data) || []; } catch (e) {} S._sqQ = S._sqQ || {}; S._sqQ[id] = ''; S._sqRes = S._sqRes || {}; S._sqRes[id] = []; var inp = document.getElementById('lg-sqq-' + id); if (inp) inp.value = ''; paintSqRes(id); renderEntrants(root()); }
  async function sqAddMember(id, memberId) {
    if (!await sqCall('lt_squad_add_member', { p_scope: 'tourn', p_event: S.eventId, p_entrant: id, p_member: memberId }, 'Could not add them')) return;
    toast('Added to the squad', 'check'); _sqReload(id);
  }
  async function sqNameOnly(id) {
    var nm = ((S._sqQ || {})[id] || '').trim();
    if (!nm) { toast('Type a name first', 'error'); return; }
    if (!await sqCall('lt_squad_add', { p_scope: 'tourn', p_event: S.eventId, p_entrant: id, p_name: nm }, 'Could not add ' + nm)) return;
    toast(nm + ' added to the squad', 'check'); _sqReload(id);
  }
  async function sqInvite(id) { var txt = ((S._sqQ || {})[id] || '').trim(); var em = txt.indexOf('@') > -1 ? txt : prompt('Their FFP email (we\'ll link their account)'); if (!em || em.indexOf('@') < 0) return; var nm = txt.indexOf('@') > -1 ? '' : txt; if (!await sqCall('lt_squad_invite', { p_scope: 'tourn', p_event: S.eventId, p_entrant: id, p_name: nm, p_email: em }, 'Could not invite them')) return; try { var rf = (window.FFPAuth && FFPAuth.getRefresh && FFPAuth.getRefresh()) || null; if (rf) { var r = await fetch('https://ffp-passport-backend.vercel.app/api/lt/squad-invite', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh: rf, scope: 'tourn', event_id: S.eventId, name: nm, email: em }) }); var jd = await r.json().catch(function () { return {}; }); toast(jd && jd.linked ? 'Member linked' : 'Invited — email sent', 'check'); } } catch (e) { /* email best-effort */ } _sqReload(id); }
  async function sqRemove(sqid) {
    if (!await sqCall('lt_squad_remove', { p_id: sqid }, 'Could not take them out')) return;
    if (S.sqOpen) _sqReload(S.sqOpen);
  }
  function addEntrant() { S.entAdd = true; renderTab(); }
  function bulkAthletes() {
    var divs = ((S.detail && S.detail.divisions) || []).map(function (d) { return { id: d.id, name: d.name }; });
    if (!divs.length) { toast('Add a division first', 'error'); return; }
    _ensureBulkTool(function () {
      FFPBulkAthletes.open({ scope: 'tourn', eventId: S.eventId, eventName: (S.detail && S.detail.event && S.detail.event.name) || '', divisions: divs, divisionId: S.divId,
        teams: (S._entrants || []).map(function (e) { return { id: e.id, name: e.team_name || e.name || 'Team' }; }),
        defaultMode: 'team',
        onDone: function () { renderEntrants(root()); } });
    });
  }
  function _ensureBulkTool(cb) {
    if (window.FFPBulkAthletes) return cb();
    var ex = document.getElementById('ffp-bulk-js'); if (ex) { ex.addEventListener('load', cb); return; }
    var sc = document.createElement('script'); sc.id = 'ffp-bulk-js'; sc.src = 'ffp-bulk-athletes.js?v=3'; sc.onload = cb; sc.onerror = function () { toast('Could not load bulk tool', 'error'); }; document.head.appendChild(sc);
  }
  function cancelEntrant() { S.entAdd = false; renderTab(); }
  async function saveEntrant() {
    var nm = (document.getElementById('tg-entname') || {}).value; if (!nm || !nm.trim()) return;
    var kind = (S.detail.divisions.find(function (d) { return d.id === S.divId; }) || {}).kind || 'team';
    var r; try { r = await sb().rpc('tourn_entrant_add', { p_tourn: S.eventId, p_division: S.divId, p: { team_name: nm.trim(), kind: kind } }); } catch (e) { r = { error: e }; }
    if (r.error) { toast('Add failed', 'error'); return; } S.entAdd = false; toast('Added', 'success'); refreshDetail();
  }

  // GROUP STAGE (inline draw count)
  async function renderGroups(host) {
    var divs = S.detail.divisions || []; if (!divs.length) { host.innerHTML = '<div class="lg-empty">Add a division first, then add ' + nouns(null).many + '.</div>'; return; }
    if (!S.divId) S.divId = divs[0].id;
    var N = nouns(curDv());
    var er; try { er = await sb().rpc('tourn_roster', { p_division: S.divId }); } catch (e) { er = null; }
    var roster = (er && er.data) || [];
    var eligible = roster.filter(function (r) { return ['registered', 'paid', 'invited'].indexOf(r.status) >= 0; });
    var suggested = S._ng || Math.max(1, Math.round(eligible.length / 4)) || 2;
    host.innerHTML = '<div class="lg-tool">' + (divs.length > 1 ? '<select class="lg-sel" onchange="FFPTourn.setDiv(this.value,\'groups\')">' + divOpts() + '</select>' : '')
      + '<span class="lg-lab" style="margin:0">Number of groups</span><input class="lg-in" id="tg-ng" type="number" min="1" value="' + suggested + '" style="width:70px">'
      + '<button class="lg-btn pri" onclick="FFPTourn.doGroups()">' + ic('shuffle') + 'Draw groups</button><span class="sp"></span>'
      + '<span class="lg-sub" style="margin:0">' + eligible.length + ' ' + (eligible.length === 1 ? N.one : N.many) + '</span></div>'
      + '<div id="tg-glist"><div class="lg-empty">Loading…</div></div>';
    var host2 = document.getElementById('tg-glist');
    if (eligible.length < 2) { host2.innerHTML = '<div class="lg-empty">Add at least 2 ' + N.many + ' (' + nouns(null).Many + ' tab) before drawing groups.</div>'; return; }
    var mr; try { mr = await sb().from('tourn_matches').select('*').eq('division_id', S.divId).eq('stage', 'group').order('group_label').order('round').order('slot'); } catch (e) { mr = { error: e }; }
    var ms = (mr && mr.data) || []; var names = {}; roster.forEach(function (r) { names[r.id] = r.name; });
    var gt; try { gt = await sb().rpc('tourn_group_tables', { p_division: S.divId }); } catch (e) { gt = null; }
    var tables = (gt && gt.data && gt.data.groups) || [];
    if (!tables.length) { host2.innerHTML = '<div class="lg-empty"><span class="ms" style="font-size:34px;color:#c0cad2;display:block;margin-bottom:6px">groups</span><b>No groups drawn yet</b><div style="margin-top:4px">Set the number of groups above and tap <b>Draw groups</b> — your ' + eligible.length + ' ' + N.many + ' are split evenly with round-robin fixtures in each group.</div></div>'; return; }
    var byMatch = {}; ms.forEach(function (m) { (byMatch[m.group_label] = byMatch[m.group_label] || []).push(m); });
    host2.innerHTML = tables.map(function (g) {
      var tbl = '<table class="tg-tbl"><tr><th class="rk"></th><th class="nm">' + N.One + '</th><th>P</th><th>W</th><th>D</th><th>L</th><th>+/-</th><th>Pts</th></tr>'
        + (g.rows || []).map(function (r) {
          return '<tr class="' + (r.advances ? 'adv' : '') + '"><td class="rk">' + r.rank + '</td><td class="nm"><span class="in">' + crest(r) + esc(r.name) + '</span></td><td>' + r.p + '</td><td>' + r.w + '</td><td>' + r.d + '</td><td>' + r.l + '</td><td>' + (r.gd > 0 ? '+' + r.gd : r.gd) + '</td><td class="pts">' + r.pts + '</td></tr>';
        }).join('') + '</table>';
      var rounds = {}; var rord = [];
      (byMatch[g.label] || []).forEach(function (m) { var rd = m.round || 1; if (!rounds[rd]) { rounds[rd] = []; rord.push(rd); } rounds[rd].push(m); });
      rord.sort(function (a, b) { return a - b; });
      var fx = rord.length ? rord.map(function (rd) {
        return '<div class="tg-rlbl">Round ' + rd + '</div>' + rounds[rd].map(function (m) {
          return '<div class="tg-gfx" data-id="' + m.id + '"><span class="t a">' + esc(names[m.home_entrant] || 'TBD') + '</span><span class="sc"><input type="number" class="tg-hs" value="' + (m.home_score != null ? m.home_score : '') + '" placeholder="–"><input type="number" class="tg-as" value="' + (m.away_score != null ? m.away_score : '') + '" placeholder="–"></span><span class="t">' + esc(names[m.away_entrant] || 'TBD') + '</span><button class="lg-btn ghostb sm" onclick="FFPTourn.openMatch(\'' + m.id + '\')">' + ic('scoreboard') + 'Match centre</button></div>';
        }).join('');
      }).join('') : '<div class="lg-sub" style="padding:8px 2px">Single ' + N.one + ' — no fixtures.</div>';
      return '<div class="tg-group"><div class="tg-grph">Group ' + esc(g.label) + ', ' + (g.rows || []).length + ' ' + ((g.rows || []).length === 1 ? N.one : N.many) + '</div>' + tbl + '<div class="fxlab">Fixtures and results, in play order</div>' + fx + '</div>';
    }).join('')
      + '<div class="lg-tool" style="margin-top:18px;border-top:1px solid var(--ffp-border);padding-top:14px"><span class="sp"></span><button class="lg-btn pri" onclick="FFPTourn.saveGroupResults()">' + ic('check') + 'Save results</button><button class="lg-btn green" onclick="FFPTourn.doBracket()">' + ic('account_tree') + 'Build knockout from groups</button></div>';
  }
  async function doGroups() {
    var n = parseInt((document.getElementById('tg-ng') || {}).value, 10) || 2; S._ng = n;
    var r; try { r = await sb().rpc('tourn_groups_generate', { p_division: S.divId, p_num_groups: n }); } catch (e) { r = { error: e }; }
    if (r.error) { toast(/not_owner/.test(r.error.message || '') ? 'Not your tournament' : 'Could not draw groups', 'error'); return; }
    if ((r.data || 0) === 0) { toast('Add at least 2 ' + nouns(curDv()).many + ' first', 'error'); renderTab(); return; }
    toast(n + ' group' + (n === 1 ? '' : 's') + ' drawn, ' + r.data + ' fixtures', 'success'); renderTab();
  }
  async function saveGroupResults() {
    var rows = Array.prototype.slice.call(document.querySelectorAll('#tg-glist .tg-gfx')); var n = 0;
    for (var i = 0; i < rows.length; i++) { var el = rows[i]; var h = el.querySelector('.tg-hs').value, a = el.querySelector('.tg-as').value; if (h === '' || a === '') continue; try { await sb().rpc('tourn_result_save', { p_match: el.getAttribute('data-id'), p_home: +h, p_away: +a, p_sets: null, p_status: 'final' }); n++; } catch (e) {} }
    toast(n + ' results saved', 'success'); renderTab();
  }
  async function setDrawFormat(v) {
    var r;
    try { r = await sb().rpc('tourn_division_save', { p_tourn: S.eventId, p_id: S.divId, p: { draw_format: v } }); }
    catch (e) { r = { error: e }; }
    if (r.error) { toast('Could not change the format', 'error'); return; }
    toast(v === 'monrad' ? 'Monrad: everyone keeps playing' : 'Knockout draw', 'success');
    refreshDetail();
  }
  async function setSideDraws(v) {
    var r;
    try { r = await sb().rpc('tourn_division_save', { p_tourn: S.eventId, p_id: S.divId, p: { side_draws: v } }); }
    catch (e) { r = { error: e }; }
    if (r.error) { toast('Could not change the draws', 'error'); return; }
    var built = (S._bracket || []).length > 0;
    toast(built ? 'Saved. Draw the bracket again to apply it' : 'Saved', 'success');
    refreshDetail();
  }
  function setDraw(k) { S.drawKey = k; renderTab(); }
  async function monradOpen() {
    S.brkConfirm = false;
    var r; try { r = await sb().rpc('tourn_monrad_open', { p_division: S.divId }); } catch (e) { r = { error: e }; }
    if (r.error) { toast(String(r.error.message || '').indexOf('matches_played') > -1 ? 'Results are already in, the draw cannot be redrawn' : 'Could not make the draw', 'error'); renderTab(); return; }
    var d = r.data || {};
    if (d.ok === false) { toast('Needs at least two ' + nouns(curDv()).many, 'error'); renderTab(); return; }
    toast(d.entrants + ' ' + nouns(curDv()).many + ', ' + d.rounds + ' rounds', 'success');
    S.drawKey = null; await refreshDetail();
  }
  async function monradRound() {
    var r; try { r = await sb().rpc('tourn_monrad_round', { p_division: S.divId }); } catch (e) { r = { error: e }; }
    if (r.error) { toast('Could not draw the round', 'error'); return; }
    var d = r.data || {};
    if (d.ok === false) {
      toast(d.reason === 'complete' ? 'All ' + d.rounds + ' rounds are drawn'
          : d.reason === 'round_unfinished' ? 'Finish round ' + d.round + ' first'
          : d.reason === 'not_enough_entrants' ? 'Needs at least two ' + nouns(curDv()).many
          : 'Could not draw the round', 'error');
      return;
    }
    toast('Round ' + d.round + ' of ' + d.of + ': ' + d.matches + ' matches'
      + (d.bye ? ', one bye' : '') + (d.rematch_forced ? ' (a rematch was unavoidable)' : ''), 'success');
    refreshDetail();
  }

  function confirmBracket() { S.brkConfirm = true; renderTab(); }
  function cancelBracket() { S.brkConfirm = false; renderTab(); }
  async function doBracket() {
    S.brkConfirm = false;
    var r; try { r = await sb().rpc('tourn_bracket_build', { p_division: S.divId }); } catch (e) { r = { error: e }; }
    if (r.error) { toast('Could not make the draw', 'error'); renderTab(); return; }
    toast('Draw made', 'success'); S.tab = 'bracket'; S.drawKey = null; await refreshDetail();
  }

  // BRACKET
  async function renderBracket(host) {
    var divs = S.detail.divisions || []; if (!divs.length) { host.innerHTML = '<div class="lg-empty">Add a division first.</div>'; return; }
    if (!S.divId) S.divId = divs[0].id; var ev = S.detail.event || {};
    // The draw format is per division: a straight knockout, or Monrad where
    // nobody goes home — everyone is re-ranked each round and plays on, which
    // is what a one-day club squash event usually wants.
    var dv = divs.find(function (x) { return x.id === S.divId; }) || {};
    var fmt = dv.draw_format || 'ko';
    // Format and extra draws belong to Setup; this tab runs the draw.
    var fmtCtl = '<span class="tg-fmtnow">' + esc(fmtLabel(fmtOfDiv(dv))) + '</span>';
    var sideCtl = '';
    // Drawing is set up in Setup. This tab runs what was drawn, so the only
    // build action here is the one that belongs to running a Monrad: the next
    // round, which can only be paired once the last one is played.
    /* ONE button that says what pressing it will do. Wiping a built draw back
       to empty is a different, destructive job, so it only appears once there
       is a draw to wipe. */
    var buildCtl = (fmt === 'monrad'
      ? '<button class="lg-btn" onclick="FFPTourn.monradRound()">' + ic('playlist_add') + 'Draw next round</button>' : '')
      + '<button class="lg-btn" onclick="FFPTourn.buildDivDraw()">' + ic('bolt') + drawBtnLabel(dv) + '</button>'
      + ((dv.match_count || 0)
          ? '<button class="lg-btn ghost" onclick="FFPTourn.openDivDraw()">' + ic('grid_on')
            + 'Open an empty draw</button>' : '');
    /* Replacing a built draw with an empty one throws away every match in it,
       so it asks first, here, where the button was pressed. */
    var askRow = S.openDrawAsk === dv.id
      ? '<div class="tg-opendraw warn"><b>Replace the draw with an empty one?</b>'
        + '<span>Every match in this division is rebuilt with no names in it. Results already entered stop this.</span>'
        + '<span class="sp"></span>'
        + '<button class="lg-btn ghost" onclick="FFPTourn.openDrawCancel()">Cancel</button>'
        + '<button class="lg-btn pri" onclick="FFPTourn.openDivDraw(1)">Yes, open it empty</button></div>'
      : '';
    host.innerHTML = '<div class="lg-tool"><select class="lg-sel" onchange="FFPTourn.setDiv(this.value,\'bracket\')">' + divOpts() + '</select>' + fmtCtl + sideCtl + '<span class="sp"></span>' + buildCtl + '<button class="lg-btn pri" onclick="FFPTourn.saveBracketResults()">' + ic('check') + 'Save &amp; advance</button></div>' + askRow + '<div id="tg-brk"><div class="lg-empty">Loading…</div></div>';
    var r; try { r = await sb().rpc('tourn_bracket', { p_division: S.divId }); } catch (e) { r = { error: e }; }
    var ms = (r && r.data) || []; S._bracket = ms; var host2 = document.getElementById('tg-brk');
    if (!ms.length) { host2.innerHTML = openDrawEmpty('draw'); return; }
    // One bracket per draw: Main / Cup, then Plate, Bowl, Consolation or the
    // placement draws. A dropdown picks which one is on screen.
    var draws = [], seen = {};
    ms.forEach(function (m) { var k = m.draw || 'main'; if (!seen[k]) { seen[k] = 1; draws.push({ key: k, name: m.draw_name || 'Main Draw', sort: m.draw_sort || 0 }); } });
    draws.sort(function (a, b) { return a.sort - b.sort; });
    if (!seen[S.drawKey || '']) S.drawKey = draws[0].key;
    var dms = ms.filter(function (m) { return (m.draw || 'main') === S.drawKey; });
    var drawCtl = draws.length > 1
      ? '<div class="lg-tool" style="margin-top:0"><span class="lg-lab" style="margin:0">View</span><select class="lg-sel" style="width:auto;min-width:220px" onchange="FFPTourn.setDraw(this.value)">'
        + draws.map(function (d) { var c = ms.filter(function (m) { return (m.draw || 'main') === d.key && m.status !== 'void'; }).length;
            return '<option value="' + d.key + '"' + (d.key === S.drawKey ? ' selected' : '') + '>' + esc(d.name) + ', ' + c + ' matches</option>'; }).join('')
        + '</select></div>' : '';
    // A division switched to Monrad can still carry knockout rows from an
    // earlier build. They are not part of this draw, so they are not drawn.
    var monradHere = dms.some(function (m) { return m.stage === 'monrad'; });
    if (monradHere) dms = dms.filter(function (m) { return m.stage === 'monrad'; });
    var byRound = {}; dms.filter(function (m) { return m.stage !== 'third'; }).forEach(function (m) { (byRound[m.round] = byRound[m.round] || []).push(m); });
    var rkeys = Object.keys(byRound).sort(function (a, b) { return a - b; });
    var isMonrad = monradHere;
    var cols = rkeys.map(function (rd) {
      var items = byRound[rd].sort(function (a, b) { return a.slot - b.slot; });
      var lab = items[0].round_label || stageLbl(items[0]);
      if (isMonrad) lab = 'Round ' + rd + ' of ' + rkeys.length;
      // Nobody goes home in a Monrad, so a round is not one contest but several:
      // say what each group of matches is being played for.
      if (isMonrad && items.some(function (m) { return m.place_lo != null; })) {
        var bands = [], bseen = {};
        items.forEach(function (m) {
          var k = m.place_lo + '-' + m.place_hi;
          if (!bseen[k]) { bseen[k] = 1; bands.push({ k: k, lo: Number(m.place_lo), hi: Number(m.place_hi) }); }
        });
        bands.sort(function (a, b) { return (a.lo - b.lo) || (a.hi - b.hi); });
        var body = bands.map(function (b) {
          var list = items.filter(function (m) { return m.place_lo + '-' + m.place_hi === b.k; });
          // gold marks the group still alive for the title
          var cls = (b.hi - b.lo === 1) ? (b.lo === 1 ? ' fin' : ' top') : (b.lo === 1 ? ' top' : '');
          return '<div class="tg-band' + cls + '"><b>' + esc(bandLabel(b.lo, b.hi)) + '</b><i></i></div>'
            + list.map(mHtml).join('');
        }).join('');
        return '<div class="tg-rnd"><div class="rh">' + esc(lab) + '</div>' + body + '</div>';
      }
      return '<div class="tg-rnd"><div class="rh">' + esc(lab) + '</div>' + items.map(mHtml).join('') + '</div>';
    }).join('');
    var third = dms.find(function (m) { return m.stage === 'third'; });
    host2.innerHTML = drawCtl + '<div class="tg-brk"><div class="tg-brkin">' + cols + '</div></div>'
      + (third ? '<div class="tg-thirdwrap"><div class="rh" style="text-align:left;margin-bottom:8px">' + esc(thirdLbl(third)) + '</div><div style="max-width:230px">' + mHtml(third) + '</div></div>' : '');
  }
  function thirdLbl(m) {
    var n = Number((m || {}).plays_for || 3);
    return ordNum(n) + ' / ' + ordNum(n + 1) + ' play-off';
  }
  function seedTag(side) { return (side && side.seed != null) ? '<span class="sd">' + esc(side.seed) + '</span>' : ''; }
  function whenLine(m) {
    var bits = [];
    // A time that will not parse is no time at all; never print NaN at anyone.
    if (m.scheduled_at) { var w = evDayShort(m.scheduled_at); if (w) bits.push(w + ', ' + evTimeStr(m.scheduled_at)); }
    if (m.court) bits.push(m.court);
    return bits.join(', ');
  }
  function ordNum(n) { var t = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (t[(v - 20) % 10] || t[v] || t[0]); }
  // What a match decides: the finishing places still open to the two in it.
  // tourn_bracket sends the band, from the draw's own first place and size
  // narrowed by the round. Down to two, the match names those two places.
  function bandLabel(lo, hi) {
    if (lo == null || hi == null) return 'Playing on';
    if (hi <= lo) return ordNum(lo) + ' place';
    if (hi - lo === 1) return lo === 1 ? 'Final' : ordNum(lo) + ' and ' + ordNum(hi);
    return 'Playing for ' + lo + ' to ' + hi;
  }
  function mHtml(m) {
    if (m.status === 'void') return '<div class="tg-m tg-void"></div>';
    var hw = m.winner_entrant && m.home && m.home.id === m.winner_entrant, aw = m.winner_entrant && m.away && m.away.id === m.winner_entrant;
    var kindTag = m.result_kind && m.result_kind !== 'played'
      ? '<span class="tg-kind">' + esc(AWARD_SHORT[m.result_kind] || m.result_kind) + '</span>' : '';
    var when = whenLine(m);
    // The match-centre button sits in its own strip under the players, never
    // over a name.
    var foot = (m.home && m.away) || when
      ? '<div class="tg-mf">' + (when ? '<span class="wh">' + esc(when) + '</span>' : '<span class="wh dim">Not scheduled</span>')
        + ((m.home && m.away) ? '<button class="tg-mcb" title="Match centre" onclick="FFPTourn.openMatch(\'' + m.id + '\')">' + ic('scoreboard') + '</button>' : '')
        + '</div>' : '';
    return '<div class="tg-m" data-id="' + m.id + '">'
      + '<div class="s ' + (hw ? 'win' : (m.home ? '' : 'tbd')) + '">' + seedTag(m.home) + '<b>' + esc((m.home && m.home.name) || 'TBD') + '</b><input type="number" class="tg-hs" value="' + (m.home_score != null ? m.home_score : '') + '" placeholder="\u2013"></div>'
      + '<div class="s ' + (aw ? 'win' : (m.away ? '' : 'tbd')) + '">' + seedTag(m.away) + '<b>' + esc((m.away && m.away.name) || ((m.status === 'bye' || (m.stage === 'monrad' && m.slot === 0)) ? 'Bye' : 'TBD')) + '</b><input type="number" class="tg-as" value="' + (m.away_score != null ? m.away_score : '') + '" placeholder="\u2013"></div>'
      + kindTag + foot + '</div>';
  }
  // ── AWARD A MATCH THAT WAS NOT PLAYED OUT ─────────────────────────────
  var AWARD_KINDS = [['walkover', 'Walkover', 'Opponent did not show'],
                     ['retired', 'Retired', 'Could not finish, injury or illness'],
                     ['default', 'Default', 'Removed by the organiser'],
                     ['disqualified', 'Disqualified', 'Removed for conduct']];
  var AWARD_SHORT = { walkover: 'w/o', retired: 'ret', default: 'def', disqualified: 'dsq' };
  var _awardM = null;
  function awardPanel(id) {
    var m = (S._bracket || []).find(function (x) { return x.id === id; });
    if (!m && S._mc && S._mc.id === id) m = S._mc;
    if (!m || !m.home || !m.away) { toast('Both ' + nouns(curDv()).many + ' must be in the match first', 'error'); return; }
    _awardM = m;
    var old = document.getElementById('tg-aw'); if (old) old.remove();
    var bk = document.createElement('div'); bk.id = 'tg-aw'; bk.className = 'lg-cfm';
    bk.innerHTML = '<div class="lg-cfm-in lg-scr">'
      + '<span class="ms lg-cfm-ic" style="color:#c47f00">gavel</span>'
      + '<div class="lg-cfm-t">Award the match</div>'
      + '<div class="lg-cfm-b">' + esc(m.home.name) + ' v ' + esc(m.away.name)
      +   '<br>The winner still advances in the draw.</div>'
      + '<div class="tg-awgrid">'
      +   '<div class="lg-lab" style="margin:0">Who goes through</div>'
      +   '<div class="tg-awrow">'
      +     '<button class="lg-btn tg-awwin on" data-w="' + m.home.id + '">' + esc(m.home.name) + '</button>'
      +     '<button class="lg-btn tg-awwin" data-w="' + m.away.id + '">' + esc(m.away.name) + '</button>'
      +   '</div>'
      +   '<div class="lg-lab" style="margin:12px 0 0">Why</div>'
      +   '<div class="tg-awrow wrap">'
      +     AWARD_KINDS.map(function (k, i) {
              return '<button class="lg-btn tg-awkind' + (i === 0 ? ' on' : '') + '" data-k="' + k[0] + '" title="' + esc(k[2]) + '">' + esc(k[1]) + '</button>';
            }).join('')
      +   '</div>'
      + '</div>'
      + '<div class="lg-cfm-a"><button class="lg-btn ghost" id="tg-aw-x">Cancel</button>'
      +   '<button class="lg-btn pri" id="tg-aw-go">' + ic('check') + 'Award it</button></div>'
      + '</div>';
    document.body.appendChild(bk);
    var pick = function (sel, el) {
      Array.prototype.slice.call(bk.querySelectorAll(sel)).forEach(function (b) { b.classList.remove('on'); });
      el.classList.add('on');
    };
    Array.prototype.slice.call(bk.querySelectorAll('.tg-awwin')).forEach(function (b) {
      b.onclick = function () { pick('.tg-awwin', b); };
    });
    Array.prototype.slice.call(bk.querySelectorAll('.tg-awkind')).forEach(function (b) {
      b.onclick = function () { pick('.tg-awkind', b); };
    });
    bk.querySelector('#tg-aw-x').onclick = function () { bk.remove(); _awardM = null; };
    bk.querySelector('#tg-aw-go').onclick = function () {
      var w = bk.querySelector('.tg-awwin.on'), k = bk.querySelector('.tg-awkind.on');
      bk.remove();
      doAward(_awardM.id, w && w.getAttribute('data-w'), k && k.getAttribute('data-k'));
    };
  }
  async function doAward(id, winner, kind) {
    if (!id || !winner || !kind) { toast('Pick a winner and a reason', 'error'); return; }
    var r;
    try { r = await sb().rpc('lt_match_award', { p_scope: 'tourn', p_match: id, p_winner: winner, p_kind: kind }); }
    catch (e) { r = { error: e }; }
    if (r.error) { toast('Could not award the match', 'error'); return; }
    toast((r.data && r.data.advanced) ? 'Awarded, winner advanced' : 'Awarded', 'success');
    _awardM = null; renderTab();
  }

  async function saveBracketResults() {
    var cards = Array.prototype.slice.call(document.querySelectorAll('#tg-brk .tg-m[data-id]')); var n = 0;
    for (var i = 0; i < cards.length; i++) { var el = cards[i]; var h = el.querySelector('.tg-hs').value, a = el.querySelector('.tg-as').value; if (h === '' || a === '') continue; try { await sb().rpc('tourn_result_save', { p_match: el.getAttribute('data-id'), p_home: +h, p_away: +a, p_sets: null, p_status: 'final' }); n++; } catch (e) {} }
    toast(n + ' saved, winners advanced', 'success'); renderTab();
  }


  // ---------- RULES PDF ----------
  // The typed Rules box carries the short version. Organisers also hand out a
  // real rulebook, so ONE PDF rides with the tournament: the file goes to the
  // event-docs bucket (PDF only, 20 MB, public read, write scoped to the
  // uploader's own folder) and its URL lands on tourn_set_rules_pdf, which the
  // detail RPC already returns inside `event`. Same shape as the logo/banner
  // uploads: pick, store, save, reopen.
  function rulesPdfHtml(ev) {
    if (S.pdfBusy) {
      return '<div class="lg-pdf">' + ic('description')
        + '<div class="g"><b>Uploading\u2026</b><span>' + esc(S.pdfBusy) + '</span></div></div>';
    }
    if (ev && ev.rules_pdf_url) {
      return '<div class="lg-pdf has">' + ic('description')
        + '<div class="g"><b>' + esc(ev.rules_pdf_name || 'Rules.pdf') + '</b>'
        + '<span>Entrants can open this from the app</span></div>'
        + '<a class="lg-btn" href="' + esc(ev.rules_pdf_url) + '" target="_blank" rel="noopener">'
        + ic('open_in_new') + 'View</a>'
        + '<span class="ms x" title="Remove" onclick="FFPTourn.removeRulesPdf()">close</span></div>';
    }
    return '<div class="lg-pdf">' + ic('description')
      + '<div class="g"><b>No rules PDF</b><span>PDF up to 20 MB, sits with the rules in the app</span></div>'
      + '<button class="lg-btn" onclick="FFPTourn.pickRulesPdf()">' + ic('upload_file') + 'Attach PDF</button></div>';
  }
  // Repaint just the strip, so an upload in progress does not wipe whatever the
  // organiser has typed into the other fields on this tab.
  function paintRulesPdf() {
    var h = document.getElementById('tg-pdfwrap');
    if (h) h.innerHTML = rulesPdfHtml((S.detail && S.detail.event) || {});
  }
  function pickRulesPdf() {
    var inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'application/pdf,.pdf'; inp.style.display = 'none';
    inp.addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0];
      if (inp.parentNode) inp.parentNode.removeChild(inp);
      if (f) uploadRulesPdf(f);
    });
    document.body.appendChild(inp); inp.click();
  }
  // The shared image uploader cannot carry this: it hardcodes image/jpeg and a
  // .jpg path, and rejects anything that is not an image. So this is a direct
  // owner-scoped storage write, which is what a provider session can do.
  async function uploadRulesPdf(f) {
    if (!((f.type === 'application/pdf') || /\.pdf$/i.test(f.name || ''))) { toast('That file is not a PDF', 'error'); return; }
    if (f.size > 20 * 1024 * 1024) { toast('That PDF is over 20 MB', 'error'); return; }
    var uid = pdfOwnerId();
    if (!uid) { toast('Please sign in again', 'error'); return; }
    S.pdfBusy = f.name; paintRulesPdf();
    var path = uid + '/tgrules-' + S.eventId + '-' + Date.now() + '.pdf';
    try {
      var up = await sb().storage.from('event-docs').upload(path, f, { contentType: 'application/pdf', upsert: true, cacheControl: '3600' });
      if (up && up.error) throw up.error;
      var pub = sb().storage.from('event-docs').getPublicUrl(path);
      var url = pub && pub.data && pub.data.publicUrl;
      if (!url) throw new Error('no_public_url');
      var r = await sb().rpc('tourn_set_rules_pdf', { p_event: S.eventId, p_url: url, p_name: f.name });
      if (r && r.error) throw r.error;
    } catch (e) { S.pdfBusy = null; paintRulesPdf(); toast('Upload failed', 'error'); return; }
    S.pdfBusy = null; toast('Rules PDF attached', 'success'); open(S.eventId);
  }
  async function removeRulesPdf() {
    var r; try { r = await sb().rpc('tourn_set_rules_pdf', { p_event: S.eventId, p_url: null, p_name: null }); } catch (e) { r = { error: e }; }
    if (r && r.error) { toast('Could not remove', 'error'); return; }
    toast('Rules PDF removed', 'success'); open(S.eventId);
  }
  // The storage path must begin with auth.uid(), which is the JWT `sub`. A
  // provider's record id is not always that value, and a mismatch is a 400 on
  // upload, so read the claim itself.
  function pdfOwnerId() {
    try {
      var tok = window.FFPAuth && window.FFPAuth.getToken && window.FFPAuth.getToken();
      if (tok) {
        var parts = String(tok).split('.');
        if (parts.length === 3) {
          var b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
          while (b64.length % 4) b64 += '=';
          var pl = JSON.parse(atob(b64));
          if (pl && pl.sub) return String(pl.sub);
        }
      }
    } catch (e) {}
    try { var m = window.FFPAuth && window.FFPAuth.getMember && window.FFPAuth.getMember(); return (m && m.id) || null; } catch (e2) { return null; }
  }
  function pickImg(kind) {
    if (!window.FFPUpload) { toast('Uploader not ready — refresh', 'error'); return; }
    var isLogo = kind === 'logo';
    window.FFPUpload.pick({ bucket: isLogo ? 'provider-logos' : 'listing-covers', key: (isLogo ? 'tglogo-' : 'tgcover-') + S.eventId + '-' + Date.now(),
      aspect: isLogo ? 1 : 16 / 9, outW: isLogo ? 512 : 1600, outH: isLogo ? 512 : 900, title: isLogo ? 'Tournament logo (square)' : 'Banner (16:9)',
      onDone: function (url) { var p = {}; p[isLogo ? 'logo_url' : 'cover_url'] = url; sb().rpc('tourn_event_save', { p_id: S.eventId, p: p }).then(function () { toast('Saved', 'success'); open(S.eventId); }); },
      onError: function () { toast('Upload failed', 'error'); } });
  }
  function serImg(field) {
    if (!window.FFPUpload) { toast('Uploader not ready \u2014 refresh', 'error'); return; }
    var isLogo = field === 'logo_url';
    window.FFPUpload.pick({
      bucket: isLogo ? 'provider-logos' : 'listing-covers',
      key: (isLogo ? 'tslogo-' : 'tscover-') + S.seriesId + '-' + Date.now(),
      aspect: isLogo ? 1 : 16 / 9, outW: isLogo ? 512 : 1600, outH: isLogo ? 512 : 900,
      title: isLogo ? 'Series crest (square)' : 'Series banner (16:9)',
      onDone: function (url) {
        var p = {}; p[field] = url;
        sb().rpc('tourn_series_save', { p_id: S.seriesId, p: p }).then(function () {
          S.seriesList = null; toast('Saved', 'success'); reloadSeries();
        });
      },
      onError: function () { toast('Upload failed', 'error'); } });
  }
  function serTeamLogo(id) {
    if (!window.FFPUpload) { toast('Uploader not ready \u2014 refresh', 'error'); return; }
    window.FFPUpload.pick({ bucket: 'provider-logos', key: 'tsteam-' + id + '-' + Date.now(),
      aspect: 1, outW: 400, outH: 400, title: 'Team crest (square)',
      onDone: function (url) {
        sb().rpc('tourn_series_team_save', { p_id: id, p_series: null, p: { logo_url: url } }).then(function () {
          toast('Crest saved', 'success'); reloadSeries();
        });
      },
      onError: function () { toast('Upload failed', 'error'); } });
  }
  function entLogo(id) {
    if (!window.FFPUpload) { toast('Uploader not ready — refresh', 'error'); return; }
    window.FFPUpload.pick({ bucket: 'provider-logos', key: 'tgteam-' + id + '-' + Date.now(), aspect: 1, outW: 400, outH: 400, title: 'Team logo (square)',
      onDone: function (url) { sb().rpc('tourn_entrant_set_logo', { p_id: id, p_logo: url }).then(function () { toast('Logo saved', 'success'); renderTab(); }); },
      onError: function () { toast('Upload failed', 'error'); } });
  }
  // ---------- MATCH CENTRE (organiser enters timeline + player stats) ----------
  var KIND_PTS = { try: 5, conversion: 2, penalty: 3, drop_goal: 3, goal: 1, point: 1, yellow_card: 0, red_card: 0 };
  var KIND_LBL = { try: 'Try', conversion: 'Conversion', penalty: 'Penalty', drop_goal: 'Drop goal', goal: 'Goal', point: 'Point', yellow_card: 'Yellow card', red_card: 'Red card' };
  function openMatch(id) { S.matchOpen = id; S.mcTab = 'timeline'; S._mcDiv = null; S.mcStatPlayer = null; if (S._trkInt) { clearInterval(S._trkInt); S._trkInt = null; } S._tracker = null; S._htSnap = null; S._mcSetTime = null; renderMatchCentre(); }
  function closeMatch() { S.matchOpen = null; renderTab(); }
  async function renderMatchCentre() {
    var host = document.getElementById('tg-tab'); if (!host) return;
    host.innerHTML = '<div class="lg-empty">Loading match…</div>';
    var r; try { r = await sb().rpc('lt_match_detail', { p_scope: 'tourn', p_match: S.matchOpen }); } catch (e) { r = { error: e }; }
    var m = (r && r.data) || null;
    if (!m) { host.innerHTML = '<div class="lg-empty">Could not load.</div>'; return; }
    S._mc = m;
    if (mcIsSet(m)) { S._cfg = pbpCfg(m); pbpInit(m); return renderPBP(m, host); }
    var ev = m.events || []; var last = ev.length ? ev[ev.length - 1] : null; var score = last ? last.rs : '0–0';
    var teamOpts = '<option value="' + m.home.id + '">' + esc(m.home.name) + '</option><option value="' + m.away.id + '">' + esc(m.away.name) + '</option>';
    var kinds = mcScoringKinds();
    var kindOpts = kinds.map(function (k) { return '<option value="' + esc(k.key) + '" data-pts="' + (k.points || 0) + '">' + esc(k.label) + '</option>'; }).join('');
    var tab = S.mcTab || 'timeline';
    var liveBtn = m.status === 'final' ? '<span class="lg-mcstat final">Full time</span>'
      : (m.status === 'live' ? '<button class="lg-btn lg-livebtn" onclick="FFPTourn.setLive(\'scheduled\')">● LIVE</button>'
        : '<button class="lg-btn" onclick="FFPTourn.setLive(\'live\')">' + ic('sensors') + 'Go live</button>');
    host.innerHTML =
      '<div class="lg-tool"><button class="lg-btn" onclick="FFPTourn.closeMatch()">' + ic('arrow_back') + 'Back</button><span class="sp"></span>'
      + '<button class="lg-btn" title="Walkover, retirement or disqualification" onclick="FFPTourn.awardPanel(\'' + m.id + '\')">' + ic('gavel') + 'Not played out</button>'
      + liveBtn + '<button class="lg-btn pri" onclick="FFPTourn.saveResultFromEvents()">' + ic('check') + 'Save result</button></div>'
      + '<div class="lg-mchd"><div class="tm">' + crest(m.home) + '<b>' + esc(m.home.name) + '</b></div><div class="scr">' + esc(score) + '</div><div class="tm a"><b>' + esc(m.away.name) + '</b>' + crest(m.away) + '</div></div>'
      + '<div class="lg-mcstream" style="display:flex;gap:8px;align-items:center;margin:10px 0"><input class="lg-in" id="mc-stream" placeholder="Live stream URL (YouTube, Twitch, Facebook…)" value="' + esc(m.stream_url || '') + '" style="flex:1"><button class="lg-btn" onclick="FFPTourn.saveStream()">' + ic('live_tv') + 'Save stream</button></div>'
      + '<div class="lg-mctabs"><button class="' + (tab === 'timeline' ? 'on' : '') + '" onclick="FFPTourn.mcTab(\'timeline\')">Scoring timeline</button><button class="' + (tab === 'subs' ? 'on' : '') + '" onclick="FFPTourn.mcTab(\'subs\')">Substitutions</button><button class="' + (tab === 'stats' ? 'on' : '') + '" onclick="FFPTourn.mcTab(\'stats\')">Player stats</button><button class="' + (tab === 'team' ? 'on' : '') + '" onclick="FFPTourn.mcTab(\'team\')">Team stats</button></div>'
      + (tab === 'timeline'
        ? ('<div class="lg-mcadd"><input class="lg-in" id="mc-min" type="number" placeholder="Min" style="width:70px">'
          + '<select class="lg-sel" id="mc-kind">' + kindOpts + '</select>'
          + '<select class="lg-sel" id="mc-team">' + teamOpts + '</select><select class="lg-sel" id="mc-player"></select>'
          + '<button class="lg-btn pri" onclick="FFPTourn.addEvent()">' + ic('add') + 'Add</button></div>'
          + '<div class="lg-sub" style="margin:6px 0 0">Order: time, action, team, player</div><div id="mc-list"></div>')
        : tab === 'subs'
        ? ('<div class="lg-mcadd"><input class="lg-in" id="sub-min" type="number" placeholder="Min" style="width:70px">'
          + '<select class="lg-sel" id="sub-team">' + teamOpts + '</select>'
          + '<select class="lg-sel" id="sub-off"></select><select class="lg-sel" id="sub-on"></select>'
          + '<button class="lg-btn pri" onclick="FFPTourn.addSub()">' + ic('swap_horiz') + 'Record</button></div>'
          + '<div class="lg-sub" style="margin:6px 0 0">Player OFF ▼ – Player ON ▲</div><div id="mc-subs"></div>')
        : tab === 'stats' ? '<div id="mc-stats"><div class="lg-empty">Loading…</div></div>'
        : '<div id="mc-team"><div class="lg-empty">Loading…</div></div>');
    if (tab === 'timeline') { mcFillPlayers(); document.getElementById('mc-team').addEventListener('change', mcFillPlayers); document.getElementById('mc-kind').addEventListener('change', mcFillPlayers); renderMcList(); }
    else if (tab === 'subs') { mcFillSubPlayers(); document.getElementById('sub-team').addEventListener('change', mcFillSubPlayers); renderMcSubs(); }
    else if (tab === 'stats') { renderMcStats(); }
    else { renderMcTeam(); }
  }
  // ---------- RACKET PLAY-BY-PLAY (point-by-point) — padel/tennis + rally sports ----------
  var SET_SPORTS = ['padel', 'tennis', 'racket', 'volleyball'];
  function mcIsSet(m) { return SET_SPORTS.indexOf((m || {}).sport_key) > -1; }
  function setsWon(sets, side) { var n = 0; (sets || []).forEach(function (s) { if (s[0] == null || s[1] == null) return; if (side === 0 ? s[0] > s[1] : s[1] > s[0]) n++; }); return n; }
  function pbpCfg(m) {
    var a = ((m && m.activity) || '').toLowerCase(), sk = (m && m.sport_key) || '';
    if (sk === 'padel' || a.indexOf('padel') > -1) return { engine: 'tennis', golden: true, needSets: 2 };
    if (a.indexOf('table') > -1) return { engine: 'rally', target: 11, needGames: 3 };
    if (a.indexOf('badminton') > -1) return { engine: 'rally', target: 21, needGames: 2 };
    if (a.indexOf('squash') > -1) return { engine: 'rally', target: 11, needGames: 3, squash: true };
    if (a.indexOf('pickle') > -1) return { engine: 'rally', target: 11, needGames: 2 };
    if (a.indexOf('racquet') > -1 || a.indexOf('racket') > -1) return { engine: 'rally', target: 15, needGames: 2 };
    if (a.indexOf('volley') > -1) return { engine: 'rally', target: 25, needGames: 3 };
    if (sk === 'tennis' || a.indexOf('tennis') > -1) return { engine: 'tennis', golden: false, needSets: 2 };
    return { engine: 'rally', target: 11, needGames: 2 };
  }
  function ptL(x, y, tb, golden) { if (tb) return String(x); if (golden && x >= 3 && y >= 3) return '40'; if (x >= 3 && y >= 3) return x === y ? '40' : (x > y ? 'Ad' : '40'); return ['0', '15', '30', '40'][Math.min(x, 3)]; }
  function pbpInit(m) {
    var L = m.live, sets = Array.isArray(m.sets) ? m.sets.map(function (s) { return [s[0], s[1]]; }) : [];
    var b = { sets: sets, gh: 0, ga: 0, ph: 0, pa: 0, tb: false, server: 'home', done: m.status === 'final' };
    if (L && typeof L.ph === 'number') { b.gh = L.gh || 0; b.ga = L.ga || 0; b.ph = L.ph || 0; b.pa = L.pa || 0; b.tb = !!L.tb; b.server = L.server === 'away' ? 'away' : 'home'; if (Array.isArray(L.sets) && L.sets.length >= sets.length) b.sets = L.sets.map(function (s) { return [s[0], s[1]]; }); }
    S._live = b; S._lhist = [];
  }
  function pbpPersist() {
    clearTimeout(S._lTmr);
    S._lTmr = setTimeout(function () { var t = S._live; sb().rpc('lt_match_save_sets', { p_scope: 'tourn', p_match: S.matchOpen, p_sets: t.sets, p_home: setsWon(t.sets, 0), p_away: setsWon(t.sets, 1), p_live: { gh: t.gh, ga: t.ga, ph: t.ph, pa: t.pa, tb: t.tb, server: t.server, sets: t.sets } }); }, 350);
  }
  function pbpSnap() { S._lhist.push(JSON.stringify(S._live)); if (S._lhist.length > 300) S._lhist.shift(); }
  function pbpDone() { var need = S._cfg.engine === 'rally' ? S._cfg.needGames : S._cfg.needSets; if (setsWon(S._live.sets, 0) >= need || setsWon(S._live.sets, 1) >= need) S._live.done = true; }
  function pbpAward(side) {
    var t = S._live, cfg = S._cfg; if (t.done) return; pbpSnap();
    if (cfg.engine === 'rally') {
      var me = side === 'home' ? 'ph' : 'pa', op = side === 'home' ? 'pa' : 'ph';
      t[me]++; if (t[me] >= cfg.target && t[me] - t[op] >= 2) { t.sets.push([t.ph, t.pa]); t.ph = 0; t.pa = 0; pbpDone(); }
    } else {
      var g = cfg.golden, m2 = side === 'home' ? 'ph' : 'pa', o2 = side === 'home' ? 'pa' : 'ph', gm = side === 'home' ? 'gh' : 'ga', go = side === 'home' ? 'ga' : 'gh';
      t[m2]++;
      if (t.tb) { if (t[m2] >= 7 && t[m2] - t[o2] >= 2) { t.sets.push(side === 'home' ? [7, 6] : [6, 7]); t.gh = 0; t.ga = 0; t.ph = 0; t.pa = 0; t.tb = false; pbpDone(); } }
      else if (t[m2] >= 4 && (t[m2] - t[o2] >= 2 || (g && t[o2] >= 3))) { t[gm]++; t.ph = 0; t.pa = 0; t.server = t.server === 'home' ? 'away' : 'home'; if (t[gm] >= 6 && t[gm] - t[go] >= 2) { t.sets.push([t.gh, t.ga]); t.gh = 0; t.ga = 0; pbpDone(); } else if (t.gh === 6 && t.ga === 6) { t.tb = true; } }
    }
    pbpPersist(); renderPBP(S._mc, document.getElementById('tg-tab'));
  }
  function pbpUndo() { var h = S._lhist.pop(); if (h) { S._live = JSON.parse(h); pbpPersist(); renderPBP(S._mc, document.getElementById('tg-tab')); } }
  function pbpServer() { S._live.server = S._live.server === 'home' ? 'away' : 'home'; pbpPersist(); renderPBP(S._mc, document.getElementById('tg-tab')); }
  function pbpDecide(k) { if (k === 'let') return; var srv = S._live.server; pbpAward(k === 'stroke' ? srv : (srv === 'home' ? 'away' : 'home')); }
  async function pbpFinish() { var t = S._live; try { await sb().rpc('tourn_result_save', { p_match: S.matchOpen, p_home: setsWon(t.sets, 0), p_away: setsWon(t.sets, 1), p_sets: t.sets, p_status: 'final' }); toast('Result saved', 'success'); renderMatchCentre(); } catch (e) { toast('Could not save result', 'error'); } }
  var PBP_CSS = ".pbp-board{background:linear-gradient(158deg,#1c3e52,#0d1e2a);color:#fff;border-radius:16px;padding:16px 18px;margin-bottom:16px;max-width:660px}.pbp-hd{display:flex;align-items:center;padding:0 2px 8px;border-bottom:1px solid rgba(255,255,255,.12)}.pbp-hd .sp{flex:1}.pbp-hd .lb{width:60px;text-align:center;font-size:9px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:rgba(255,255,255,.5)}.pbp-hd .lb.g{width:52px}.pbp-hd .lb.p{width:60px}.pbp-r{display:flex;align-items:center;padding:12px 2px}.pbp-r+.pbp-r{border-top:1px solid rgba(255,255,255,.08)}.pbp-r .clr{width:5px;height:34px;border-radius:3px;margin-right:12px}.pbp-r.home .clr{background:linear-gradient(180deg,#25a6d8,#12557a)}.pbp-r.away .clr{background:linear-gradient(180deg,#6a7e8c,#243645)}.pbp-r .who{flex:1;min-width:0}.pbp-r .who b{font-size:16px;font-weight:800}.pbp-r .who .srv{display:block;font-size:10px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#7bf0bd;margin-top:2px}.pbp-r .cells{width:60px;display:flex;gap:8px;justify-content:center;font-size:15px;font-weight:700;color:rgba(255,255,255,.5)}.pbp-r .cells .w{color:#fff}.pbp-r .gm{width:52px;text-align:center;font-size:19px;font-weight:800}.pbp-r .pt{width:60px;text-align:center;font-size:34px;font-weight:900;line-height:1}.pbp-flags{text-align:center;margin-top:10px}.pbp-tag{display:inline-block;font-size:10px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;padding:5px 11px;border-radius:20px;background:rgba(242,169,0,.22);color:#ffe2a0}.pbp-serve{text-align:center;font-size:12px;font-weight:700;color:rgba(255,255,255,.82);margin-top:9px}.pbp-serve .ms{font-size:15px;vertical-align:-3px;color:#ffce4d;margin-right:4px}.pbp-clab{max-width:660px;text-align:center;font-size:11px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:#6b7f8b;margin:0 0 12px}.pbp-btns{max-width:660px;display:flex;gap:14px;margin-bottom:12px}.pbp-pb{flex:1;border:0;border-radius:18px;color:#fff;cursor:pointer;padding:26px 12px;display:flex;flex-direction:column;align-items:center;gap:8px;box-shadow:0 10px 24px rgba(15,34,48,.18)}.pbp-pb.home{background:linear-gradient(160deg,#25a6d8,#0f5578)}.pbp-pb.away{background:linear-gradient(160deg,#4a6172,#243645)}.pbp-pb:active{filter:brightness(1.07)}.pbp-pb:disabled{opacity:.5;cursor:default}.pbp-pb .pl{font-size:13px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;opacity:.9;display:flex;align-items:center;gap:6px}.pbp-pb .pl .ms{font-size:20px}.pbp-pb .nm{font-size:22px;font-weight:900}.pbp-decide{max-width:660px;display:flex;gap:10px;margin-bottom:12px}.pbp-decide button{flex:1;border:0;border-radius:12px;padding:13px;font:inherit;font-weight:800;cursor:pointer}.pbp-decide .let{background:rgba(25,128,173,.14);color:#1980AD}.pbp-decide .stroke{background:rgba(242,169,0,.2);color:#c47f00}.pbp-decide .nolet{background:#eef2f5;color:#5b6b75}.pbp-srow{max-width:660px;display:flex;gap:10px}.pbp-srow button{flex:1;border:1px solid var(--ffp-border-mid);background:#fff;border-radius:12px;padding:12px;font:inherit;font-weight:800;color:var(--ffp-text);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px}.pbp-srow button .ms{font-size:19px;color:#c47f00}";
  function renderPBP(m, host) {
    if (!document.getElementById('pbp-css')) { var st = document.createElement('style'); st.id = 'pbp-css'; st.textContent = PBP_CSS; document.head.appendChild(st); }
    var t = S._live, cfg = S._cfg, rally = cfg.engine === 'rally';
    var wonH = setsWon(t.sets, 0), wonA = setsWon(t.sets, 1);
    var dH = rally ? { c: t.sets.map(function (s) { return s[0]; }), gm: wonH, pt: t.ph } : { c: t.sets.map(function (s) { return s[0]; }), gm: t.gh, pt: ptL(t.ph, t.pa, t.tb, cfg.golden) };
    var dA = rally ? { c: t.sets.map(function (s) { return s[1]; }), gm: wonA, pt: t.pa } : { c: t.sets.map(function (s) { return s[1]; }), gm: t.ga, pt: ptL(t.pa, t.ph, t.tb, cfg.golden) };
    var flag = t.tb ? 'Tiebreak' : (!rally && t.ph >= 3 && t.pa >= 3 ? (cfg.golden ? 'Golden point' : (t.ph === t.pa ? 'Deuce' : 'Advantage')) : '');
    var serveName = t.server === 'home' ? m.home.name : m.away.name;
    var liveBtn = m.status === 'final' ? '<span class="lg-mcstat final">Full time</span>' : (m.status === 'live' ? '<button class="lg-btn lg-livebtn" onclick="FFPTourn.setLive(\'scheduled\')">● LIVE</button>' : '<button class="lg-btn" onclick="FFPTourn.setLive(\'live\')">' + ic('sensors') + 'Go live</button>');
    function row(side, d, nm, sv) { var cells = d.c.map(function (v, i) { return '<span class="' + (i === d.c.length - 1 ? 'w' : '') + '">' + v + '</span>'; }).join(''); return '<div class="pbp-r ' + side + '"><span class="clr"></span><span class="who"><b>' + esc(nm) + '</b>' + (sv ? '<span class="srv">● Serving</span>' : '') + '</span><span class="cells">' + cells + '</span><span class="gm">' + d.gm + '</span><span class="pt">' + d.pt + '</span></div>'; }
    var decide = cfg.squash ? '<div class="pbp-decide"><button class="let" onclick="FFPTourn.pbpDecide(\'let\')">Let</button><button class="stroke" onclick="FFPTourn.pbpDecide(\'stroke\')">Stroke</button><button class="nolet" onclick="FFPTourn.pbpDecide(\'nolet\')">No let</button></div>' : '';
    host.innerHTML =
      '<div class="lg-tool"><button class="lg-btn" onclick="FFPTourn.closeMatch()">' + ic('arrow_back') + 'Back</button><span class="sp"></span>' + liveBtn + '<button class="lg-btn pri" onclick="FFPTourn.pbpFinish()">' + ic('check') + 'Finish and save result</button></div>'
      + '<div class="pbp-board"><div class="pbp-hd"><span class="sp"></span><span class="lb">Sets</span><span class="lb g">' + (rally ? 'Games' : 'Gm') + '</span><span class="lb p">Pts</span></div>'
      + row('away', dA, m.away.name, t.server === 'away') + row('home', dH, m.home.name, t.server === 'home')
      + (flag ? '<div class="pbp-flags"><span class="pbp-tag">' + flag + '</span></div>' : '')
      + '<div class="pbp-serve">' + ic('sports_tennis') + esc(serveName) + ' to serve</div></div>'
      + '<div class="pbp-clab">Tap who won the ' + (rally ? 'rally' : 'point') + '</div>'
      + '<div class="pbp-btns"><button class="pbp-pb away" ' + (t.done ? 'disabled' : '') + ' onclick="FFPTourn.pbpAward(\'away\')"><span class="pl">' + ic('add') + 'Point</span><span class="nm">' + esc(m.away.name) + '</span></button>'
      + '<button class="pbp-pb home" ' + (t.done ? 'disabled' : '') + ' onclick="FFPTourn.pbpAward(\'home\')"><span class="pl">' + ic('add') + 'Point</span><span class="nm">' + esc(m.home.name) + '</span></button></div>'
      + decide
      + '<div class="pbp-srow"><button onclick="FFPTourn.pbpUndo()">' + ic('undo') + 'Undo</button><button onclick="FFPTourn.pbpServer()">' + ic('swap_horiz') + 'Change server</button></div>'
      + '<div class="lg-mcstream" style="display:flex;gap:8px;align-items:center;margin:14px 0 0;max-width:660px"><input class="lg-in" id="mc-stream" placeholder="Live stream URL (YouTube, Twitch, Facebook…)" value="' + esc(m.stream_url || '') + '" style="flex:1"><button class="lg-btn" onclick="FFPTourn.saveStream()">' + ic('live_tv') + 'Save stream</button></div>'
      + '<div class="lg-sub" style="margin:10px 0 0">Point-by-point — every tap streams live to followers. Same board as the FFP App scorer.</div>';
  }

  async function saveStream() {
    var el = document.getElementById('mc-stream'); if (!el) return;
    try { await sb().rpc('lt_match_set_stream', { p_scope: 'tourn', p_match: S.matchOpen, p_url: el.value.trim() }); toast('Stream link saved', 'success'); }
    catch (e) { toast('Could not save stream link', 'error'); }
  }
  async function setLive(status) {
    try { await sb().rpc('lt_match_status', { p_scope: 'tourn', p_match: S.matchOpen, p_status: status }); } catch (e) { toast('Could not update', 'error'); return; }
    toast(status === 'live' ? 'Match is now LIVE' : 'Match set to pending', 'success'); renderMatchCentre();
  }
  function mcTeamFields() { var m = S._mc || {}; var s = (S.sports || []).find(function (x) { return x.key === m.sport_key; }); return (s && s.team_match_fields) || []; }
  async function renderMcTeam() {
    var host = document.getElementById('mc-team'); if (!host) return; var m = S._mc || {}; await loadSports();
    var fields = mcTeamFields();
    if (!fields.length) { host.innerHTML = '<div class="lg-empty">This sport has no team match-stat fields.</div>'; return; } // sport-words-ok -- a stat field, not a playing surface
    var gr; try { gr = await sb().rpc('lt_team_match_stats_get', { p_scope: 'tourn', p_match: S.matchOpen }); } catch (e) { gr = null; }
    var saved = (gr && gr.data) || {}; var hv = saved[m.home.id] || {}, av = saved[m.away.id] || {};
    if (!S._mcDiv) { try { var dr = await sb().from('tourn_matches').select('division_id').eq('id', S.matchOpen).single(); S._mcDiv = dr.data && dr.data.division_id; } catch (e) {} }
    var fPoss = fields.filter(function (f) { return f.key === 'possession'; })[0];
    var fTerr = fields.filter(function (f) { return f.key === 'territory'; })[0];
    var hasPoss = !!fPoss, hasTerr = !!fTerr;
    host.innerHTML = mcPeriodHtml(m) + (hasPoss || hasTerr ? trkHtml(m, fPoss, fTerr) : '')
      + '<div class="lg-teamstat"><div class="hd"><span>' + esc(m.home.name) + '</span><span class="lab"></span><span>' + esc(m.away.name) + '</span></div>'
      + fields.map(function (f) {
        return '<div class="lg-tsrow" data-key="' + esc(f.key) + '"><input class="lg-in ts-h" type="number" value="' + (hv[f.key] != null ? hv[f.key] : '') + '" placeholder="0"><span class="lab">' + esc(f.label) + (f.pct ? ' %' : '') + '</span><input class="lg-in ts-a" type="number" value="' + (av[f.key] != null ? av[f.key] : '') + '" placeholder="0"></div>';
      }).join('') + '</div><button class="lg-btn pri" style="margin-top:12px" onclick="FFPTourn.saveTeamStats()">' + ic('check') + 'Save team stats</button>';
    if (hasPoss || hasTerr) { trkRefresh(); if (_trk().running && !S._trkInt) S._trkInt = setInterval(trkTick, 1000); }
  }
  async function saveTeamStats() {
    var m = S._mc || {}; var rows = Array.prototype.slice.call(document.querySelectorAll('.lg-tsrow')); var n = 0;
    for (var i = 0; i < rows.length; i++) {
      var key = rows[i].getAttribute('data-key'); var hv = rows[i].querySelector('.ts-h').value, av = rows[i].querySelector('.ts-a').value;
      try { await sb().rpc('lt_team_stat_set', { p_scope: 'tourn', p_event: S.eventId, p_division: S._mcDiv, p_match: S.matchOpen, p_entrant: m.home.id, p_key: key, p_value: hv === '' ? null : +hv }); } catch (e) {}
      try { await sb().rpc('lt_team_stat_set', { p_scope: 'tourn', p_event: S.eventId, p_division: S._mcDiv, p_match: S.matchOpen, p_entrant: m.away.id, p_key: key, p_value: av === '' ? null : +av }); } catch (e) {}
      if (hv !== '' || av !== '') n++;
    }
    toast(n + ' team stats saved', 'success');
  }
  function mcTab(t) { S.mcTab = t; S.mcStatPlayer = null; renderMatchCentre(); }
  function mcSquadFor(entrantId) { var m = S._mc || {}; return (m.home && m.home.id === entrantId) ? (m.home_squad || []) : (m.away_squad || []); }
  function mcScoringKinds() { var m = S._mc || {}; var s = (S.sports || []).find(function (x) { return x.key === m.sport_key; }); return (s && s.scoring_kinds) || [{ key: 'point', label: 'Point', points: 1 }]; }
  function mcKindTeamOnly(k) { var f = mcScoringKinds().find(function (x) { return x.key === k; }); return !!(f && f.team_only); }
  function mcFillPlayers() {
    var sel = document.getElementById('mc-player'); if (!sel) return;
    var kEl = document.getElementById('mc-kind');
    if (kEl && mcKindTeamOnly(kEl.value)) { sel.innerHTML = '<option value="">Team score — no scorer</option>'; sel.disabled = true; return; }
    sel.disabled = false;
    var sq = mcSquadFor(document.getElementById('mc-team').value);
    sel.innerHTML = sq.map(function (p) { return '<option value="' + p.player_id + '">' + esc(p.name) + '</option>'; }).join('') + '<option value="__other">Other (type name)…</option>';
  }
  function mcFillSubPlayers() {
    var offSel = document.getElementById('sub-off'), onSel = document.getElementById('sub-on'); if (!offSel || !onSel) return;
    var sq = mcSquadFor(document.getElementById('sub-team').value);
    var opts = sq.map(function (p) { return '<option value="' + esc(p.name) + '">' + esc(p.name) + '</option>'; }).join('') + '<option value="__other">Other (type name)…</option>';
    offSel.innerHTML = '<option value="">Player OFF…</option>' + opts;
    onSel.innerHTML = '<option value="">Player ON…</option>' + opts;
  }
  function _subVal(id) { var s = document.getElementById(id); if (!s) return ''; var v = s.value; if (v === '__other') { v = (prompt('Player name') || '').trim(); } return v; }
  async function addSub() {
    var team = document.getElementById('sub-team').value;
    var off = _subVal('sub-off'), on = _subVal('sub-on');
    if (!off && !on) { toast('Pick who is coming off and/or on', 'error'); return; }
    var minute = parseInt((document.getElementById('sub-min') || {}).value, 10); if (isNaN(minute)) minute = null;
    var r; try { r = await sb().rpc('lt_sub_add', { p_scope: 'tourn', p_match: S.matchOpen, p_entrant: team, p_off: off || null, p_on: on || null, p_minute: minute }); } catch (e) { r = { error: e }; }
    if (r && r.error) { toast('Could not record', 'error'); return; }
    var mn = document.getElementById('sub-min'); if (mn) mn.value = ''; renderMatchCentre();
  }
  function renderMcSubs() {
    var host = document.getElementById('mc-subs'); if (!host) return; var m = S._mc || {}; var subs = m.subs || [];
    if (!subs.length) { host.innerHTML = '<div class="lg-empty">No substitutions yet.</div>'; return; }
    host.innerHTML = subs.map(function (s) {
      var sideName = s.side === 'home' ? m.home.name : m.away.name;
      return '<div class="lg-mcrow"><span class="mn">' + (s.minute != null ? s.minute + "'" : '') + '</span><span class="kd">▲ ' + esc(s.on || '—') + ' – ▼ ' + esc(s.off || '—') + '</span><span class="tn">' + esc(sideName) + '</span><span class="ms x" onclick="FFPTourn.removeSub(\'' + s.id + '\')">close</span></div>';
    }).join('');
  }
  async function removeSub(id) { try { await sb().rpc('lt_sub_remove', { p_id: id }); } catch (e) {} renderMatchCentre(); }
  function mcKindLabel(k) { var f = mcScoringKinds().find(function (x) { return x.key === k; }); return f ? f.label : (k || '').replace(/_/g, ' '); }
  function renderMcList() {
    var host = document.getElementById('mc-list'); if (!host) return; var m = S._mc || {}; var ev = m.events || [];
    if (!ev.length) { host.innerHTML = '<div class="lg-empty">No scores yet — add them above. The app timeline and player stats update from these.</div>'; return; }
    host.innerHTML = ev.map(function (e) {
      var sideName = e.side === 'home' ? m.home.name : m.away.name;
      return '<div class="lg-mcrow"><span class="mn">' + (e.minute != null ? e.minute + "'" : '') + '</span><span class="kd ' + esc(e.kind) + '">' + esc(mcKindLabel(e.kind)) + '</span><span class="pl">' + esc(e.player) + '</span><span class="tn">' + esc(sideName) + '</span><span class="rs">' + esc(e.rs) + '</span><span class="ms x" onclick="FFPTourn.removeEvent(\'' + e.id + '\')">close</span></div>';
    }).join('');
  }
  async function addEvent() {
    var team = document.getElementById('mc-team').value; var psel = document.getElementById('mc-player'); var pv = psel.value;
    var pid = (pv && pv !== '__other') ? pv : null; var pname = null;
    if (pv === '__other') { pname = prompt('Player name'); if (!pname) return; } else { pname = psel.options[psel.selectedIndex] ? psel.options[psel.selectedIndex].text : null; }
    var ksel = document.getElementById('mc-kind'); var kind = ksel.value;
    var pts = parseInt(ksel.options[ksel.selectedIndex] ? ksel.options[ksel.selectedIndex].getAttribute('data-pts') : '0', 10); if (isNaN(pts)) pts = 0;
    if (mcKindTeamOnly(kind)) { pid = null; pname = null; }   // penalty try / own goal — team score, no named scorer
    var minute = parseInt((document.getElementById('mc-min') || {}).value, 10); if (isNaN(minute)) minute = null;
    var r; try { r = await sb().rpc('lt_event_add', { p_scope: 'tourn', p_match: S.matchOpen, p_entrant: team, p_player: pid, p_player_name: pname, p_minute: minute, p_kind: kind, p_points: pts }); } catch (e) { r = { error: e }; }
    if (r.error) { toast('Could not add', 'error'); return; }
    var mn = document.getElementById('mc-min'); if (mn) mn.value = ''; renderMatchCentre();
  }
  async function removeEvent(id) { await sb().rpc('lt_event_remove', { p_id: id }); renderMatchCentre(); }
  // ---- live possession/territory tracker + match period (ported from leagues) ----
  function _trk() { if (!S._tracker) S._tracker = { running: false, poss: null, half: null, ph: 0, pa: 0, hh: 0, ha: 0, total: 0 }; return S._tracker; }
  function fmtClock(s) { s = s || 0; var m = Math.floor(s / 60), ss = s % 60; return (m < 10 ? '0' : '') + m + ':' + (ss < 10 ? '0' : '') + ss; }
  function trkPct(a, b) { var s = a + b; return s ? Math.round(a / s * 100) : 0; }
  function trkHtml(m, fPoss, fTerr) {
    var t = _trk();
    var terr = fTerr ? '<div class="lg-trk-grp"><div class="lg-trk-lab">' + esc(fTerr.label) + ' — which half the ball is in</div><div class="lg-trk-btns">'
      + '<button class="lg-trk-b" data-half="home" onclick="FFPTourn.trkHalf(\'home\')">' + esc(m.home.name) + ' half</button>'
      + '<button class="lg-trk-b" data-half="away" onclick="FFPTourn.trkHalf(\'away\')">' + esc(m.away.name) + ' half</button></div></div>' : '';
    return '<div class="lg-trk"><div class="lg-trk-clock"><div class="t" id="trk-clock">' + fmtClock(t.total) + '</div><span class="sp"></span>'
      + '<button class="lg-btn" id="trk-toggle" onclick="FFPTourn.trkToggle()">Start</button>'
      + '<button class="lg-btn ghost" onclick="FFPTourn.trkReset()">Reset</button></div>'
      + (fPoss ? '<div class="lg-trk-grp"><div class="lg-trk-lab">' + esc(fPoss.label) + ' — who has the ball</div><div class="lg-trk-btns">'
      + '<button class="lg-trk-b" data-poss="home" onclick="FFPTourn.trkPoss(\'home\')">' + esc(m.home.name) + ' <span>0%</span></button>'
      + '<button class="lg-trk-b" data-poss="away" onclick="FFPTourn.trkPoss(\'away\')">' + esc(m.away.name) + ' <span>0%</span></button></div></div>' : '')
      + terr
      + '<div class="lg-trk-apply"><span class="sum" id="trk-sum"></span><button class="lg-btn pri" onclick="FFPTourn.trkApply()">' + ic('done_all') + 'Apply to fields</button></div></div>';
  }
  function trkRefresh() {
    var t = _trk();
    var clk = document.getElementById('trk-clock'); if (!clk) return;
    clk.textContent = fmtClock(t.total);
    var tog = document.getElementById('trk-toggle'); if (tog) { tog.textContent = t.running ? 'Stop' : 'Start'; tog.classList.toggle('pri', !t.running); tog.classList.toggle('lg-livebtn', t.running); }
    var pHome = trkPct(t.ph, t.pa), pAway = (t.ph + t.pa) ? 100 - pHome : 0;
    document.querySelectorAll('.lg-trk-b[data-poss]').forEach(function (b) { var s = b.getAttribute('data-poss'); b.classList.toggle('on', t.poss === s); var sp = b.querySelector('span'); if (sp) sp.textContent = (s === 'home' ? pHome : pAway) + '%'; });
    document.querySelectorAll('.lg-trk-b[data-half]').forEach(function (b) { b.classList.toggle('on', t.half === b.getAttribute('data-half')); });
    var teH = trkPct(t.ha, t.hh), teA = (t.hh + t.ha) ? 100 - teH : 0;
    var sum = document.getElementById('trk-sum'); if (sum) sum.textContent = 'Possession ' + pHome + '–' + pAway + '    Territory ' + teH + '–' + teA;
  }
  function trkTick() { var t = _trk(); if (!t.running) return; t.total++; if (t.poss === 'home') t.ph++; else if (t.poss === 'away') t.pa++; if (t.half === 'home') t.hh++; else if (t.half === 'away') t.ha++; trkRefresh(); }
  function trkToggle() { var t = _trk(); t.running = !t.running; if (S._trkInt) { clearInterval(S._trkInt); S._trkInt = null; } if (t.running) S._trkInt = setInterval(trkTick, 1000); trkRefresh(); }
  function trkReset() { if (S._trkInt) { clearInterval(S._trkInt); S._trkInt = null; } S._tracker = { running: false, poss: null, half: null, ph: 0, pa: 0, hh: 0, ha: 0, total: 0 }; renderMatchCentre(); }
  function trkPoss(s) { var t = _trk(); t.poss = s; trkRefresh(); }
  function trkHalf(s) { var t = _trk(); t.half = s; trkRefresh(); }
  function trkApply() {
    var t = _trk();
    var setRow = function (key, hVal, aVal) { var row = document.querySelector('.lg-tsrow[data-key="' + key + '"]'); if (!row) return; row.querySelector('.ts-h').value = hVal; row.querySelector('.ts-a').value = aVal; };
    if (t.ph + t.pa > 0) { var pH = trkPct(t.ph, t.pa); setRow('possession', pH, 100 - pH); }
    if (t.hh + t.ha > 0) { var teH = trkPct(t.ha, t.hh); setRow('territory', teH, 100 - teH); }
    toast('Applied — tap Save team stats to store', 'success');
  }
  /* THE CLOCK BELONGS TO THE SPORT, NOT TO RUGBY. lt_match_detail hands down
     period_minutes + period_count (match -> division -> event -> sport schema),
     so netball runs four 15s and sevens two 7s. Nothing here is hardcoded. */
  function mcPeriodCount(m) { return parseInt((m || {}).period_count, 10) || 2; }
  function mcPeriodMins(m) {
    var pm = parseInt((m || {}).period_minutes, 10) || 0;
    if (pm) return pm;
    return Math.max(1, Math.round(matchMins() / mcPeriodCount(m)));
  }
  function mcPeriods(m) {
    var n = mcPeriodCount(m);
    if (n === 4) return [['pre', 'Not started', false], ['q1', '1st quarter', true], ['qt1', 'Quarter-time', false], ['q2', '2nd quarter', true], ['ht', 'Half-time', false], ['q3', '3rd quarter', true], ['qt3', '3-quarter time', false], ['q4', '4th quarter', true], ['ft', 'Full time', false]];
    if (n <= 1) return [['pre', 'Not started', false], ['h1', 'Match', true], ['ft', 'Full time', false]];
    if (n === 2) return [['pre', 'Not started', false], ['h1', '1st half', true], ['ht', 'Half-time', false], ['h2', '2nd half', true], ['ft', 'Full time', false]];
    var ORD = ['', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'], seq = [['pre', 'Not started', false]];
    for (var i = 1; i <= n; i++) {
      seq.push(['p' + i, (ORD[i] || i + 'th') + ' period', true]);
      if (i < n) seq.push([i * 2 === n ? 'ht' : 'b' + i, i * 2 === n ? 'Half-time' : 'Break', false]);
    }
    seq.push(['ft', 'Full time', false]);
    return seq;
  }
  /* "Resume clock at" = the minutes already played, from the sport's own period
     length: 40:00 at rugby half-time, 15:00 at netball quarter-time. */
  function mcResumeAt(m) {
    var seq = mcPeriods(m), period = (S._mc && S._mc.period) || 'pre', mins = mcPeriodMins(m), done = 0;
    for (var i = 0; i < seq.length; i++) { if (seq[i][0] === period) break; if (seq[i][2]) done++; }
    var t = done * mins;
    return (t < 10 ? '0' : '') + t + ':00';
  }
  function mcPeriodHtml(m) {
    var seq = mcPeriods(m); var period = (S._mc && S._mc.status === 'final') ? 'ft' : ((S._mc && S._mc.period) || 'pre');
    var idx = 0; for (var i = 0; i < seq.length; i++) { if (seq[i][0] === period) { idx = i; break; } }
    var cur = seq[idx], next = seq[idx + 1];
    var chip = period === 'pre' ? '' : (cur[2] ? 'live' : (period === 'ft' ? 'ft' : 'ht'));
    var st = (S._mcSetTime == null ? mcResumeAt(m) : S._mcSetTime);
    var btn = '';
    if (next) {
      var nk = next[0], nlab = next[1], nplay = next[2];
      var label = nk === 'ft' ? 'Full-time' : (nplay ? (idx === 0 ? 'Kick off' : 'Start ' + nlab) : nlab);
      var cls = nk === 'ft' ? 'red' : (nplay ? 'pri' : 'gold');
      btn = '<button class="lg-btn ' + (cls === 'red' ? '' : cls) + '"' + (cls === 'red' ? ' style="background:#d6353b;border-color:#d6353b;color:#fff"' : '') + ' onclick="FFPTourn.mcSetPeriod(\'' + nk + '\')">' + esc(label) + '</button>';
    }
    var showSet = !cur[2] && period !== 'pre' && period !== 'ft';
    return '<div class="lg-per"><span class="lg-perchip ' + chip + '">' + (chip === 'live' ? '<span class="d"></span>' : '') + esc(cur[1]) + '</span><span class="sp"></span>' + btn + '</div>'
      + (showSet ? '<div class="lg-perset"><span>Resume clock at</span><input class="lg-in" id="mc-settime" value="' + esc(st) + '" onchange="FFPTourn._mcSetTime(this.value)" style="width:110px"></div>' : '');
  }
  function _mcSetTime(v) { S._mcSetTime = v; }
  function mcSaveHalf(half, key, hv, av) {
    var m = S._mc || {};
    try { sb().rpc('lt_team_stat_set', { p_scope: 'tourn', p_event: S.eventId, p_division: S._mcDiv, p_match: S.matchOpen, p_entrant: m.home.id, p_key: key, p_value: hv, p_half: half }); } catch (e) {}
    try { sb().rpc('lt_team_stat_set', { p_scope: 'tourn', p_event: S.eventId, p_division: S._mcDiv, p_match: S.matchOpen, p_entrant: m.away.id, p_key: key, p_value: av, p_half: half }); } catch (e) {}
  }
  function mcSaveHalves(half) {
    var t = _trk();
    if (half === 1) {
      S._htSnap = { ph: t.ph, pa: t.pa, hh: t.hh, ha: t.ha };
      var posH = trkPct(t.ph, t.pa), teH = trkPct(t.ha, t.hh);
      mcSaveHalf(1, 'possession', posH, (t.ph + t.pa) ? 100 - posH : 0);
      mcSaveHalf(1, 'territory', teH, (t.hh + t.ha) ? 100 - teH : 0);
    } else {
      var s = S._htSnap; if (!s) return;
      var dph = t.ph - s.ph, dpa = t.pa - s.pa, dhh = t.hh - s.hh, dha = t.ha - s.ha;
      var p2 = trkPct(dph, dpa), t2 = trkPct(dha, dhh);
      mcSaveHalf(2, 'possession', p2, (dph + dpa) ? 100 - p2 : 0);
      mcSaveHalf(2, 'territory', t2, (dhh + dha) ? 100 - t2 : 0);
    }
  }
  async function mcSetPeriod(p) {
    var t = _trk(), m = S._mc || {}; var seq = mcPeriods(m);
    var inf = null, firstPlay = ''; for (var i = 0; i < seq.length; i++) { if (seq[i][2] && !firstPlay) firstPlay = seq[i][0]; if (seq[i][0] === p) inf = seq[i]; }
    var isPlay = inf && inf[2];
    if (p === 'ht') { if (t.running) trkToggle(); mcSaveHalves(1); }
    else if (p === 'ft') { if (t.running) trkToggle(); mcSaveHalves(2); }
    else if (isPlay && p === firstPlay) { if (!t.running) trkToggle(); }
    else if (isPlay) { var q = String(S._mcSetTime || mcResumeAt(m)).split(':'); t.total = (parseInt(q[0] || '0', 10) * 60) + (parseInt(q[1] || '0', 10) || 0); if (!t.running) trkToggle(); }
    else if (p !== 'ft') { if (t.running) trkToggle(); }
    try { await sb().rpc('lt_match_set_period', { p_scope: 'tourn', p_match: S.matchOpen, p_period: p }); } catch (e) {}
    if (p === 'ft') { if ((m.events || []).length) { try { await saveResultFromEvents(); } catch (e) {} } else { try { await sb().rpc('lt_match_status', { p_scope: 'tourn', p_match: S.matchOpen, p_status: 'final' }); } catch (e) {} } }
    else { try { await sb().rpc('lt_match_status', { p_scope: 'tourn', p_match: S.matchOpen, p_status: p === 'pre' ? 'scheduled' : 'live' }); } catch (e) {} }
    if (S._mc) S._mc.period = p;
    S._mcSetTime = null;
    renderMatchCentre();
  }
  async function saveResultFromEvents() {
    var m = S._mc || {}; var ev = m.events || [];
    if (!ev.length) { toast('Add scoring events first', 'error'); return; }
    var last = ev[ev.length - 1];
    var r; try { r = await sb().rpc('tourn_result_save', { p_match: S.matchOpen, p_home: last.hs, p_away: last.as, p_sets: null, p_status: 'final' }); } catch (e) { r = { error: e }; }
    if (r.error) { toast('Save failed', 'error'); return; } toast('Result saved: ' + last.hs + '–' + last.as + ' — winner advanced', 'success');
  }
  function mcSchemaFields() { var m = S._mc || {}; var s = (S.sports || []).find(function (x) { return x.key === m.sport_key; }); return (s && s.player_fields) || [{ key: 'points', label: 'Points' }]; }
  async function renderMcStats() {
    var host = document.getElementById('mc-stats'); if (!host) return; var m = S._mc || {}; await loadSports();
    if (!S._mcDiv) { try { var dr = await sb().from('tourn_matches').select('division_id').eq('id', S.matchOpen).single(); S._mcDiv = dr.data && dr.data.division_id; } catch (e) {} }
    var sr; try { sr = await sb().rpc('lt_match_stats', { p_scope: 'tourn', p_match: S.matchOpen }); } catch (e) { sr = null; }
    S._mcStats = (sr && sr.data) || {};
    var flat = []; [{ t: m.home, list: m.home_squad || [] }, { t: m.away, list: m.away_squad || [] }].forEach(function (g) { g.list.forEach(function (p) { flat.push({ p: p, ent: g.t.id, team: g.t.name }); }); });
    if (!flat.length) { host.innerHTML = '<div class="lg-empty">Add players to the team rosters (Entrants tab) to record detailed stats.</div>'; return; }
    var custom = (m.custom_fields || []);
    var fields = mcSchemaFields().concat(custom);
    var pOpts = flat.map(function (x) { return '<option value="' + x.p.player_id + '">' + esc(x.p.name) + ', ' + esc(x.team) + '</option>'; }).join('');
    if (!S.mcStatPlayer) S.mcStatPlayer = flat[0].p.player_id;
    var cur = flat.find(function (x) { return x.p.player_id === S.mcStatPlayer; }) || flat[0];
    var saved = S._mcStats[S.mcStatPlayer] || {};
    host.innerHTML = '<div class="lg-sub" style="margin:4px 0 12px">Enter each player’s match stats for <b>' + esc(m.activity || 'this sport') + '</b>. These power the player &amp; team stat pages.</div>'
      + '<div class="lg-mcadd" style="border:none"><select class="lg-sel" id="mc-sp" onchange="FFPTourn.mcPickStatPlayer(this.value)" style="flex:1;min-width:180px">' + pOpts + '</select></div>'
      + '<div class="lg-mcfields">' + fields.map(function (f) { return '<div class="lg-mcf"><label>' + esc(f.label) + (f.custom ? ' <span class="ms" style="font-size:14px;color:#c0cad2;cursor:pointer;vertical-align:-2px" onclick="FFPTourn.removeCustomStat(\'' + esc(f.key) + '\')">close</span>' : '') + '</label><input class="lg-in mc-f" data-key="' + esc(f.key) + '" type="number" value="' + (saved[f.key] != null ? saved[f.key] : '') + '" placeholder="0"></div>'; }).join('') + '</div>'
      + '<div style="display:flex;gap:10px;align-items:center;margin-top:14px"><button class="lg-btn pri" onclick="FFPTourn.saveStats()">' + ic('check') + 'Save ' + esc(cur.p.name.split(' ')[0]) + '’s stats</button><button class="lg-btn ghostb" onclick="FFPTourn.addCustomStat()">' + ic('add') + 'Add your own stat</button></div>';
    var sp = document.getElementById('mc-sp'); if (sp) sp.value = S.mcStatPlayer;
  }
  async function addCustomStat() {
    var label = prompt('New stat name (e.g. Turnovers, Kicks, Tackles)'); if (!label || !label.trim()) return;
    var r; try { r = await sb().rpc('lt_event_custom_stat', { p_scope: 'tourn', p_event: S.eventId, p_label: label.trim() }); } catch (e) { r = { error: e }; }
    if (r.error) { toast('Could not add', 'error'); return; }
    if (S._mc) S._mc.custom_fields = r.data; toast('Stat added', 'success'); renderMcStats();
  }
  async function removeCustomStat(key) {
    var r; try { r = await sb().rpc('lt_event_custom_stat_remove', { p_scope: 'tourn', p_event: S.eventId, p_key: key }); } catch (e) { r = { error: e }; }
    if (r && !r.error && S._mc) S._mc.custom_fields = r.data; renderMcStats();
  }
  function mcPickStatPlayer(vv) { S.mcStatPlayer = vv; renderMcStats(); }
  async function saveStats() {
    var m = S._mc || {}; var pid = S.mcStatPlayer;
    var squads = (m.home_squad || []).concat(m.away_squad || []); var pl = squads.find(function (p) { return p.player_id === pid; }) || {};
    var ent = (m.home_squad || []).some(function (p) { return p.player_id === pid; }) ? m.home.id : m.away.id;
    var inputs = Array.prototype.slice.call(document.querySelectorAll('.mc-f')); var n = 0;
    for (var i = 0; i < inputs.length; i++) { var key = inputs[i].getAttribute('data-key'); var val = inputs[i].value; if (val === '' || val == null) continue;
      try { await sb().rpc('lt_player_stat_set', { p_scope: 'tourn', p_event: S.eventId, p_division: S._mcDiv, p_match: S.matchOpen, p_entrant: ent, p_player: pid, p_player_name: pl.name || null, p_key: key, p_value: +val }); n++; } catch (e) {} }
    toast(n + ' stats saved for ' + (pl.name || 'player'), 'success'); renderMcStats();
  }

  async function entrantNames(divId) { var r = await sb().rpc('tourn_roster', { p_division: divId }); var map = {}; (r.data || []).forEach(function (e) { map[e.id] = e.name; }); return map; }
  async function refreshDetail() { var r; try { r = await sb().rpc('tourn_detail', { p_tourn: S.eventId }); } catch (e) { r = { error: e }; } S.detail = (r && r.data) || S.detail; snapFormats(); renderEditor(); }
  function divOpts() { return (S.detail.divisions || []).map(function (d) { return '<option value="' + d.id + '"' + (d.id === S.divId ? ' selected' : '') + '>' + esc(d.name) + '</option>'; }).join(''); }

  // Printed on load so a deploy can be confirmed in one look, without
  // guessing from the screen: open the console and read this line.
  var BUILD = '2026-09-30.2';
  console.log('[FFP Tournaments] build ' + BUILD);
  // ══════════════════════════════════════════════════════════════════════
  // SERIES — a run of tournaments that share their teams.
  //
  // The point of a series is that a team is entered ONCE. Round 2 starts from
  // the series list -- tick who is playing and the name, short name, code,
  // colours and crest come with them -- instead of ten teams being retyped.
  // Everything is edited inline; this console never uses a browser prompt.
  // ══════════════════════════════════════════════════════════════════════
  var SER_TABS = [['rounds', 'Rounds'], ['teams', 'Teams'], ['points', 'Points table'], ['details', 'Details']];
  /* The World Rugby Sevens Series shape, offered as a starting point and then
     the organiser's to change. It is NEVER applied without them asking. */
  var PTS_PRESET = { '1': 20, '2': 18, '3': 16, '4': 14, '5': 12, '6': 10, '7': 8, '8': 6, 'other': 2 };

  function serTabBtn(id, label) {
    return '<button class="' + (S.serTab === id ? 'on' : '') + '" onclick="FFPTourn.serTab(\'' + id + '\')">' + label + '</button>';
  }
  function ser() { return (S.series && S.series.series) || {}; }
  function serRounds() { return (S.series && S.series.rounds) || []; }
  function serTeams() { return (S.series && S.series.teams) || []; }
  function roundLbl(r) {
    return r.is_finals ? 'Finals' : (r.series_round === null || r.series_round === undefined ? r.name : 'Round ' + r.series_round);
  }
  function dOnly(s) {
    if (!s) return '';
    try { return new Date(s + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }); }
    catch (e) { return ''; }
  }

  async function loadMySeries(force) {
    if (S.seriesList && !force) return S.seriesList;
    var r; try { r = await sb().rpc('tourn_my_series'); } catch (e) { r = { error: e }; }
    if (r && r.error) toast(errText(r.error, 'Could not load your series'), 'error');
    S.seriesList = (r && r.data) || [];
    return S.seriesList;
  }

  async function openSeries(id) {
    S.view = 'series'; S.seriesId = id;
    S.serTab = S.serTab || 'rounds'; S.serTeamEdit = null; S.serAddRound = false; S.serEnter = null;
    await reloadSeries(true);
  }
  async function reloadSeries(first) {
    var r; try { r = await sb().rpc('tourn_series_admin', { p_series: S.seriesId }); } catch (e) { r = { error: e }; }
    /* A failed read used to render as "this series is empty", which is the same
       picture as a working empty series. Never again. */
    if (!r || r.error || !r.data) {
      toast(errText(r && r.error, 'Could not open that series'), 'error');
      if (first) { S.view = 'list'; return renderList(); }
      return;
    }
    S.series = r.data; renderSeries();
  }

  function renderSeries() {
    injectCss(); var el = root(); if (!el || !S.series) return;
    var s = ser(), rs = serRounds(), ts = serTeams();
    var live = rs.filter(function (r) { return r.status === 'live'; }).length;
    el.innerHTML = '<div class="lg-wrap"><div class="lg-head"><div>'
      + '<div class="lg-h1">' + esc(s.name || 'Series') + '<span class="lg-pill ' + esc(s.status || 'open') + '">SERIES</span></div>'
      + '<div class="lg-sub">' + esc([
          rs.length + (rs.length === 1 ? ' round' : ' rounds'),
          ts.filter(function (t) { return t.status === 'active'; }).length + ' teams',
          live ? live + ' live now' : '', s.city
        ].filter(Boolean).join(', ')) + '</div></div>'
      + '<button class="lg-btn" onclick="FFPTourn.back()">' + ic('arrow_back') + 'All tournaments</button></div>'
      + '<div class="lg-nav">' + SER_TABS.map(function (t) { return serTabBtn(t[0], t[1]); }).join('') + '</div>'
      + '<div id="tg-tab"></div></div>';
    renderSerTab();
  }
  function renderSerTab() {
    var host = document.getElementById('tg-tab'); if (!host) return;
    if (S.serTab === 'teams') return renderSerTeams(host);
    if (S.serTab === 'points') return renderSerPoints(host);
    if (S.serTab === 'details') return renderSerDetails(host);
    return renderSerRounds(host);
  }

  // ── ROUNDS ────────────────────────────────────────────────────────────
  function renderSerRounds(host) {
    var rs = serRounds();
    var rows = rs.length ? rs.map(function (r) {
      var cov = r.cover_url || r.logo_url;
      var unlinked = (r.entrants || 0) - (r.linked || 0);
      return '<div class="ts-rd">'
        + (cov ? '<span class="pic" style="background-image:url(\'' + esc(cov) + '\')"></span>'
               : '<span class="ic">' + ic('emoji_events') + '</span>')
        + '<div class="g"><b>' + esc(roundLbl(r)) + '</b>'
        +   '<span>' + esc([r.name, dOnly(r.starts_at) || 'Date to be confirmed', r.city].filter(Boolean).join(', ')) + '</span>'
        +   '<span>' + (r.entrants || 0) + (r.entrants === 1 ? ' team' : ' teams')
        +     (unlinked > 0 ? ', <i class="warn">' + unlinked + ' not linked to the series</i>' : '') + '</span></div>'
        + '<span class="st ' + esc(r.status) + '">' + esc(String(r.status || 'draft').toUpperCase()) + '</span>'
        + '<div class="ax">'
        +   '<label class="ts-num">Round <input class="lg-in" type="number" min="0" id="ts-rn-' + r.id + '" value="' + (r.series_round === null || r.series_round === undefined ? '' : r.series_round) + '"></label>'
        +   '<label class="ts-chk"><input type="checkbox" id="ts-rf-' + r.id + '"' + (r.is_finals ? ' checked' : '') + '> Finals</label>'
        +   '<button class="lg-btn sm" onclick="FFPTourn.serRoundSave(\'' + r.id + '\')">' + ic('check') + 'Save</button>'
        +   '<button class="lg-btn sm" onclick="FFPTourn.open(\'' + r.id + '\')">' + ic('open_in_new') + 'Open</button>'
        +   (unlinked > 0 ? '<button class="lg-btn sm" onclick="FFPTourn.serAdopt(\'' + r.id + '\')">' + ic('playlist_add') + 'Import its teams</button>' : '')
        +   '<button class="lg-btn sm ghost" onclick="FFPTourn.serRoundOut(\'' + r.id + '\')">Remove from series</button>'
        + '</div></div>';
    }).join('') : '<div class="lg-empty" style="text-align:left;padding:4px 0">No rounds yet. Add a tournament below and it becomes Round 1.</div>';

    var adder;
    if (S.serAddRound) {
      var mine = (S.freeEvents || []).filter(function (e) { return !e.series_id; });
      adder = '<div class="lg-edit" style="flex-wrap:wrap">'
        + (mine.length
            ? '<select class="lg-sel" id="ts-newrd" style="max-width:360px">'
              + mine.map(function (e) { return '<option value="' + e.id + '">' + esc(e.name) + (e.starts_at ? ' (' + esc(dOnly(e.starts_at)) + ')' : '') + '</option>'; }).join('')
              + '</select>'
              + '<label class="ts-num">Round <input class="lg-in" type="number" min="0" id="ts-newrn" value="' + (rs.length + 1) + '"></label>'
              + '<label class="ts-chk"><input type="checkbox" id="ts-newrf"> Finals</label>'
              + '<button class="lg-btn pri" onclick="FFPTourn.serRoundAdd()">' + ic('check') + 'Add round</button>'
            : '<div class="lg-empty" style="text-align:left;padding:4px 10px">Every tournament you own is already in a series. Create a tournament first, then add it here.</div>')
        + '<button class="lg-btn ghost" onclick="FFPTourn.serAddRoundCancel()">Cancel</button></div>';
    } else {
      adder = '<button class="lg-btn" onclick="FFPTourn.serAddRoundOpen()">' + ic('add') + 'Add a round</button>';
    }
    host.innerHTML = '<div class="tg-sec"><div class="tg-sech">Rounds</div>'
      + '<div class="tg-hint" style="margin:0 0 10px">A round is an ordinary tournament. It keeps its own draw, schedule and crew; the series only decides the order and adds up the points.</div>'
      + rows + adder + '</div>';
  }

  // ── TEAMS ─────────────────────────────────────────────────────────────
  function teamRow(t) {
    if (S.serTeamEdit === t.id) return teamForm(t);
    var init = t.logo_url ? '' : esc((t.team_name || '?').slice(0, 1));
    var bg = t.logo_url ? 'background-image:url(\'' + esc(t.logo_url) + '\')' : '';
    var sw = (t.color1 ? '<i class="sw" style="background:' + esc(t.color1) + '"></i>' : '')
           + (t.color2 ? '<i class="sw" style="background:' + esc(t.color2) + '"></i>' : '');
    var n = (t.in_rounds || []).length;
    var gaps = !t.code || !t.color1;
    var bits = [t.code || '', t.status === 'active' ? (n ? 'in ' + n + (n === 1 ? ' round' : ' rounds') : 'not in a round yet') : 'stood down'].filter(Boolean);
    return '<div class="lg-row ts-trow' + (t.status === 'active' ? '' : ' ts-off') + '">'
      + '<span class="lg-av" style="' + bg + '">' + init + '</span>'
      + '<div class="g"><b>' + esc(t.team_name) + '</b>'
      +   '<span>' + esc(bits.join(', '))
      +     (gaps ? ', <i class="warn">' + (!t.code && !t.color1 ? 'no code or colours' : !t.code ? 'no code' : 'no colours') + ' for the graphics</i>' : '') + '</span></div>'
      + '<span class="ts-sw">' + sw + '</span>'
      + '<span class="ms act" title="Edit" onclick="FFPTourn.serTeamEdit(\'' + t.id + '\')">edit</span></div>';
  }
  function teamForm(t) {
    var id = t ? t.id : 'new';
    var v = t || {};
    var init = v.logo_url ? '' : esc((v.team_name || '?').slice(0, 1));
    var bg = v.logo_url ? 'background-image:url(\'' + esc(v.logo_url) + '\')' : '';
    return '<div class="lg-edit lg-entform">'
      + '<span class="crest"><span class="lg-av' + (t ? ' lg-avedit' : '') + '"' + (t ? ' title="Add / change crest" onclick="FFPTourn.serTeamLogo(\'' + t.id + '\')"' : '') + ' style="' + bg + '">' + init + (t ? '<span class="lg-avplus ms">add</span>' : '') + '</span></span>'
      + '<div class="f gr"><label>Team name</label><input class="lg-in" id="ts-t-name-' + id + '" value="' + esc(v.team_name || '') + '" onkeydown="if(event.key===\'Enter\')FFPTourn.serTeamSave(\'' + id + '\')"></div>'
      + '<div class="f"><label>Short name</label><input class="lg-in" id="ts-t-short-' + id + '" placeholder="For the scorebug" value="' + esc(v.short_name || '') + '"></div>'
      + '<div class="f sm"><label>Code</label><input class="lg-in" id="ts-t-code-' + id + '" maxlength="4" placeholder="BAT" value="' + esc(v.code || '') + '"></div>'
      + '<div class="f sm"><label>Home colour</label><div class="lg-hex"><input class="sw" type="color" value="' + esc(v.color1 || '#0C2E63') + '" oninput="FFPTourn.hexSync(\'ts-t-c1-' + id + '\',this.value)"><input class="lg-in" id="ts-t-c1-' + id + '" maxlength="7" placeholder="#000000" value="' + esc(v.color1 || '') + '"></div></div>'
      + '<div class="f sm"><label>Away colour</label><div class="lg-hex"><input class="sw" type="color" value="' + esc(v.color2 || '#1B57AE') + '" oninput="FFPTourn.hexSync(\'ts-t-c2-' + id + '\',this.value)"><input class="lg-in" id="ts-t-c2-' + id + '" maxlength="7" placeholder="#000000" value="' + esc(v.color2 || '') + '"></div></div>'
      + '<div class="acts"><button class="lg-btn pri" onclick="FFPTourn.serTeamSave(\'' + id + '\')">' + ic('check') + 'Save</button>'
      +   (t ? '<button class="lg-btn ghost" onclick="FFPTourn.serTeamStatus(\'' + t.id + '\',\'' + (t.status === 'active' ? 'retired' : 'active') + '\')">' + (t.status === 'active' ? 'Stand down' : 'Bring back') + '</button>' : '')
      +   '<button class="lg-btn ghost" onclick="FFPTourn.serTeamCancel()">Cancel</button></div></div>';
  }
  function renderSerTeams(host) {
    var ts = serTeams();
    var on = ts.filter(function (t) { return t.status === 'active'; });
    var off = ts.filter(function (t) { return t.status !== 'active'; });
    var importers = serRounds().filter(function (r) { return (r.entrants || 0) > (r.linked || 0); });
    host.innerHTML = '<div class="tg-sec"><div class="tg-sech">Teams in the series</div>'
      + '<div class="tg-hint" style="margin:0 0 10px">Entered once. Every round you add them to brings the name, code, colours and crest with it.</div>'
      + (on.length ? on.map(teamRow).join('') : '<div class="lg-empty" style="text-align:left;padding:4px 0">No teams yet.</div>')
      + (S.serTeamEdit === 'new' ? teamForm(null) : '<button class="lg-btn" onclick="FFPTourn.serTeamEdit(\'new\')">' + ic('add') + 'Add a team</button>')
      + (importers.length
          ? '<div class="ts-imp">' + ic('playlist_add')
            + '<div class="g"><b>Teams already typed into a round</b><span>Lift them into the series instead of entering them again. Running it twice changes nothing.</span></div>'
            + importers.map(function (r) { return '<button class="lg-btn sm" onclick="FFPTourn.serAdopt(\'' + r.id + '\')">' + esc(roundLbl(r)) + ' (' + ((r.entrants || 0) - (r.linked || 0)) + ')</button>'; }).join('')
            + '</div>'
          : '')
      + '</div>'
      + (off.length ? '<div class="tg-sec"><div class="tg-sech">Stood down</div>'
          + '<div class="tg-hint" style="margin:0 0 10px">Still part of the series and still on past results. They just are not offered when you pick who is playing.</div>'
          + off.map(teamRow).join('') + '</div>' : '');
  }

  // ── POINTS TABLE ──────────────────────────────────────────────────────
  function renderSerPoints(host) {
    var pt = ser().points_table || {};
    var places = Object.keys(pt).filter(function (k) { return /^[0-9]+$/.test(k); })
                   .map(Number).sort(function (a, b) { return a - b; });
    if (!places.length) places = [1, 2, 3, 4];
    var rows = places.map(function (p) {
      return '<div class="ts-pt"><span class="pl">' + ordNum(p) + '</span>'
        + '<input class="lg-in" type="number" min="0" step="1" id="ts-p-' + p + '" value="' + (pt[String(p)] == null ? '' : pt[String(p)]) + '">'
        + '<span class="u">points</span></div>';
    }).join('');
    host.innerHTML = '<div class="tg-sec"><div class="tg-sech">Series points table</div>'
      + '<div class="tg-hint" style="margin:0 0 12px">Points come from where a team FINISHES each round, not from match results. A round still being played scores nothing until it is decided.</div>'
      + '<div class="ts-pts">' + rows
      + '<div class="ts-pt other"><span class="pl">Every other place</span>'
      +   '<input class="lg-in" type="number" min="0" step="1" id="ts-p-other" value="' + (pt.other == null ? '' : pt.other) + '">'
      +   '<span class="u">points</span></div></div>'
      + '<div class="ts-ptrow">'
      +   '<button class="lg-btn sm ghost" onclick="FFPTourn.serPtsPlace(1)">' + ic('add') + 'Another place</button>'
      +   (places.length > 1 ? '<button class="lg-btn sm ghost" onclick="FFPTourn.serPtsPlace(-1)">' + ic('remove') + 'One fewer</button>' : '')
      +   '<button class="lg-btn sm ghost" onclick="FFPTourn.serPtsPreset()">Use the standard 7s table</button>'
      + '</div>'
      + '<button class="lg-btn pri" style="margin-top:14px" onclick="FFPTourn.serPtsSave()">' + ic('check') + 'Save points table</button>'
      + '</div>';
  }

  // ── DETAILS ───────────────────────────────────────────────────────────
  function renderSerDetails(host) {
    var s = ser();
    var cov = s.cover_url, lg = s.logo_url;
    host.innerHTML = '<div class="tg-sec"><div class="tg-sech">Details</div>'
      + '<div class="lg-2"><div class="lg-fld"><div class="lg-lab">Series name</div><input class="lg-in" id="ts-d-name" value="' + esc(s.name || '') + '"></div>'
      +   '<div class="lg-fld"><div class="lg-lab">Status</div><select class="lg-sel" id="ts-d-status">'
      +     ['open', 'live', 'final', 'archived'].map(function (k) { return '<option value="' + k + '"' + (s.status === k ? ' selected' : '') + '>' + k.charAt(0).toUpperCase() + k.slice(1) + '</option>'; }).join('')
      +   '</select></div></div>'
      + '<div class="lg-fld"><div class="lg-lab">Description</div><input class="lg-in" id="ts-d-desc" value="' + esc(s.description || '') + '"></div>'
      + '<div class="lg-3"><div class="lg-fld"><div class="lg-lab">City</div><input class="lg-in" id="ts-d-city" list="ts-cities" value="' + esc(s.city || '') + '"><datalist id="ts-cities">' + dlOpts(cityNames()) + '</datalist></div>'
      +   '<div class="lg-fld"><div class="lg-lab">Country</div><input class="lg-in" id="ts-d-country" list="ts-countries" value="' + esc(s.country || '') + '"><datalist id="ts-countries">' + dlOpts(countryNames()) + '</datalist></div>'
      +   '<div class="lg-fld"><div class="lg-lab">Time zone</div><input class="lg-in" id="ts-d-tz" placeholder="Asia/Dubai" value="' + esc(s.timezone || '') + '"></div></div>'
      + '<div class="lg-fld"><div class="lg-lab">Accent colour</div><div class="lg-hex" style="max-width:220px"><input class="sw" type="color" value="' + esc(s.accent || '#1980AD') + '" oninput="FFPTourn.hexSync(\'ts-d-accent\',this.value)"><input class="lg-in" id="ts-d-accent" maxlength="7" placeholder="#000000" value="' + esc(s.accent || '') + '"></div></div>'
      + '<div class="ts-imgs">'
      +   '<div class="im"><div class="lg-lab">Cover</div><div class="bx" style="' + (cov ? 'background-image:url(\'' + esc(cov) + '\')' : '') + '" onclick="FFPTourn.serImg(\'cover_url\')">' + (cov ? '' : ic('add_photo_alternate')) + '</div></div>'
      +   '<div class="im"><div class="lg-lab">Crest</div><div class="bx sq" style="' + (lg ? 'background-image:url(\'' + esc(lg) + '\')' : '') + '" onclick="FFPTourn.serImg(\'logo_url\')">' + (lg ? '' : ic('add_photo_alternate')) + '</div></div>'
      + '</div>'
      + '<button class="lg-btn pri" style="margin-top:4px" onclick="FFPTourn.serDetailsSave()">' + ic('check') + 'Save</button></div>';
  }

  // ── ACTIONS ───────────────────────────────────────────────────────────
  function gv(id) { var e = document.getElementById(id); return e ? String(e.value || '').trim() : ''; }
  function gck(id) { var e = document.getElementById(id); return !!(e && e.checked); }

  async function serCreate() {
    var nm = gv('ts-newname'); if (!nm) { toast('Name the series first', 'error'); return; }
    var r; try { r = await sb().rpc('tourn_series_save', { p_id: null, p: { name: nm, status: 'open' } }); }
    catch (e) { r = { error: e }; }
    if (!r || r.error || !r.data) { toast(errText(r && r.error, 'Could not create the series'), 'error'); return; }
    S.serCreating = false; S.seriesList = null; await loadMySeries(true);
    openSeries(r.data);
  }
  async function serRoundSave(id) {
    var n = parseInt(gv('ts-rn-' + id), 10); if (isNaN(n)) n = null;
    var r; try { r = await sb().rpc('tourn_series_set_event', { p_series: S.seriesId, p_event: id, p_round: n, p_is_finals: gck('ts-rf-' + id) }); }
    catch (e) { r = { error: e }; }
    if (r && r.error) { toast(errText(r.error, 'Could not save that round'), 'error'); return; }
    toast('Round saved'); S.seriesList = null; reloadSeries();
  }
  async function serRoundAdd() {
    var id = gv('ts-newrd'); if (!id) return;
    var n = parseInt(gv('ts-newrn'), 10); if (isNaN(n)) n = null;
    var r; try { r = await sb().rpc('tourn_series_set_event', { p_series: S.seriesId, p_event: id, p_round: n, p_is_finals: gck('ts-newrf') }); }
    catch (e) { r = { error: e }; }
    if (r && r.error) { toast(errText(r.error, 'Could not add that round'), 'error'); return; }
    S.serAddRound = false; S.seriesList = null; S.freeEvents = null;
    toast('Round added'); reloadSeries();
  }
  async function serRoundOut(id) {
    var r; try { r = await sb().rpc('tourn_series_unset_event', { p_event: id }); } catch (e) { r = { error: e }; }
    if (r && r.error) { toast(errText(r.error, 'Could not remove that round'), 'error'); return; }
    S.seriesList = null; S.freeEvents = null;
    toast('Removed from the series. The tournament itself is untouched.');
    reloadSeries();
  }
  async function serAddRoundOpen() {
    S.serAddRound = true;
    if (!S.freeEvents) {
      var r; try { r = await sb().rpc('tourn_my_events'); } catch (e) { r = { error: e }; }
      S.freeEvents = ((r && r.data) || []).filter(function (e) { return e.status !== 'archived'; });
    }
    renderSerTab();
  }
  async function serAdopt(roundId) {
    var r; try { r = await sb().rpc('tourn_series_adopt_round', { p_series: S.seriesId, p_tourn: roundId }); }
    catch (e) { r = { error: e }; }
    if (!r || r.error) { toast(errText(r && r.error, 'Could not import those teams'), 'error'); return; }
    var d = r.data || {};
    toast(d.created ? d.created + ' team' + (d.created === 1 ? '' : 's') + ' added to the series' : 'Nothing new to import');
    reloadSeries();
  }
  async function serTeamSave(id) {
    var isNew = (id === 'new');
    var p = {
      team_name: gv('ts-t-name-' + id), short_name: gv('ts-t-short-' + id),
      code: gv('ts-t-code-' + id).toUpperCase(), color1: gv('ts-t-c1-' + id), color2: gv('ts-t-c2-' + id)
    };
    if (!p.team_name) { toast('Name the team first', 'error'); return; }
    var r; try { r = await sb().rpc('tourn_series_team_save', { p_id: isNew ? null : id, p_series: isNew ? S.seriesId : null, p: p }); }
    catch (e) { r = { error: e }; }
    if (!r || r.error) { toast(errText(r && r.error, 'Could not save that team'), 'error'); return; }
    S.serTeamEdit = null; toast('Team saved'); reloadSeries();
  }
  async function serTeamStatus(id, st) {
    var r; try { r = await sb().rpc('tourn_series_team_save', { p_id: id, p_series: null, p: { status: st } }); }
    catch (e) { r = { error: e }; }
    if (!r || r.error) { toast(errText(r && r.error, 'Could not change that team'), 'error'); return; }
    S.serTeamEdit = null; reloadSeries();
  }
  async function serPtsSave() {
    var pt = {}, bad = false;
    document.querySelectorAll('[id^="ts-p-"]').forEach(function (el) {
      var k = el.id.slice('ts-p-'.length), v = String(el.value || '').trim();
      if (v === '') return;
      var n = Number(v); if (!isFinite(n) || n < 0) { bad = true; return; }
      pt[k] = n;
    });
    if (bad) { toast('Points must be zero or more', 'error'); return; }
    var r; try { r = await sb().rpc('tourn_series_save', { p_id: S.seriesId, p: { points_table: pt } }); }
    catch (e) { r = { error: e }; }
    if (!r || r.error) { toast(errText(r && r.error, 'Could not save the points table'), 'error'); return; }
    S.seriesList = null; toast('Points table saved'); reloadSeries();
  }
  /* Adding or removing a place must never discard what is already typed, so the
     screen is read back into the table before it is rebuilt. */
  function serPtsPlace(d) {
    var pt = {};
    document.querySelectorAll('[id^="ts-p-"]').forEach(function (el) {
      var k = el.id.slice('ts-p-'.length), v = String(el.value || '').trim();
      if (v !== '') pt[k] = Number(v);
    });
    var places = Object.keys(pt).filter(function (k) { return /^[0-9]+$/.test(k); }).map(Number).sort(function (a, b) { return a - b; });
    var top = places.length ? places[places.length - 1] : 0;
    if (d > 0) { if (pt[String(top + 1)] == null) pt[String(top + 1)] = 0; }
    else if (top > 1) { delete pt[String(top)]; }
    S.series.series.points_table = pt; renderSerTab();
  }
  function serPtsPreset() { S.series.series.points_table = JSON.parse(JSON.stringify(PTS_PRESET)); renderSerTab(); }
  async function serDetailsSave() {
    var p = {
      name: gv('ts-d-name'), description: gv('ts-d-desc'), city: gv('ts-d-city'),
      country: gv('ts-d-country'), timezone: gv('ts-d-tz'), accent: gv('ts-d-accent'),
      status: gv('ts-d-status')
    };
    if (!p.name) { toast('A series needs a name', 'error'); return; }
    var r; try { r = await sb().rpc('tourn_series_save', { p_id: S.seriesId, p: p }); } catch (e) { r = { error: e }; }
    if (!r || r.error) { toast(errText(r && r.error, 'Could not save'), 'error'); return; }
    S.seriesList = null; toast('Saved'); reloadSeries();
  }

  // ── TICK WHO IS PLAYING THIS ROUND (inside a tournament) ──────────────
  async function serEnterOpen() {
    var sid = (S.detail && S.detail.event && S.detail.event.series_id) || null;
    if (!sid) return;
    var r; try { r = await sb().rpc('tourn_series_admin', { p_series: sid }); } catch (e) { r = { error: e }; }
    if (!r || r.error || !r.data) { toast(errText(r && r.error, 'Could not read the series teams'), 'error'); return; }
    S.serEnter = { series: r.data, picked: {} };
    renderTab();
  }
  function serEnterCancel() { S.serEnter = null; renderTab(); }
  function serEnterToggle(id) {
    if (!S.serEnter) return;
    if (S.serEnter.picked[id]) delete S.serEnter.picked[id]; else S.serEnter.picked[id] = true;
    renderTab();
  }
  function serEnterAll(on) {
    if (!S.serEnter) return;
    S.serEnter.picked = {};
    if (on) serEnterAvailable().forEach(function (t) { S.serEnter.picked[t.id] = true; });
    renderTab();
  }
  /* A team already in THIS tournament is not offered again -- the database
     refuses a double entry anyway, but offering it is the thing that makes an
     organiser think it did not work. */
  function serEnterAvailable() {
    if (!S.serEnter) return [];
    var inHere = {};
    (S._roster || []).forEach(function (e) { if (e.series_team_id) inHere[e.series_team_id] = true; });
    return ((S.serEnter.series || {}).teams || []).filter(function (t) {
      return t.status === 'active' && !inHere[t.id];
    });
  }
  function serEnterHtml() {
    if (!S.serEnter) return '';
    var av = serEnterAvailable(), n = Object.keys(S.serEnter.picked).length;
    if (!av.length) {
      return '<div class="ts-pick"><div class="hd">' + ic('check_circle') + 'Every team in the series is already in this round'
        + '<button class="lg-btn sm ghost" style="margin-left:auto" onclick="FFPTourn.serEnterCancel()">Close</button></div></div>';
    }
    return '<div class="ts-pick"><div class="hd">' + ic('groups') + 'Who is playing this round'
      + '<button class="lg-btn sm ghost" style="margin-left:auto" onclick="FFPTourn.serEnterAll(true)">All</button>'
      + '<button class="lg-btn sm ghost" onclick="FFPTourn.serEnterAll(false)">None</button></div>'
      + '<div class="bd">' + av.map(function (t) {
          var init = t.logo_url ? '' : esc((t.team_name || '?').slice(0, 1));
          var bg = t.logo_url ? 'background-image:url(\'' + esc(t.logo_url) + '\')' : '';
          return '<label class="tm' + (S.serEnter.picked[t.id] ? ' on' : '') + '">'
            + '<input type="checkbox"' + (S.serEnter.picked[t.id] ? ' checked' : '') + ' onchange="FFPTourn.serEnterToggle(\'' + t.id + '\')">'
            + '<span class="lg-av" style="' + bg + '">' + init + '</span>'
            + '<b>' + esc(t.team_name) + '</b>' + (t.code ? '<span class="ts-code">' + esc(t.code) + '</span>' : '') + '</label>';
        }).join('') + '</div>'
      + '<div class="ft"><button class="lg-btn pri" onclick="FFPTourn.serEnterDo()"' + (n ? '' : ' disabled') + '>'
      +   ic('check') + 'Add ' + (n || 'the selected') + ' team' + (n === 1 ? '' : 's') + '</button>'
      +   '<button class="lg-btn ghost" onclick="FFPTourn.serEnterCancel()">Cancel</button></div></div>';
  }
  async function serEnterDo() {
    if (!S.serEnter || !S.divId) return;
    var ids = Object.keys(S.serEnter.picked); if (!ids.length) return;
    var r; try { r = await sb().rpc('tourn_series_enter', { p_division: S.divId, p_teams: ids }); } catch (e) { r = { error: e }; }
    if (!r || r.error) { toast(errText(r && r.error, 'Could not add those teams'), 'error'); return; }
    var d = r.data || {};
    toast((d.added || 0) + ' team' + (d.added === 1 ? '' : 's') + ' added');
    S.serEnter = null; renderTab();
  }

  // ── LINK A TOURNAMENT TO A SERIES (the Setup tab) ─────────────────────
  function serSetupHtml(ev) {
    var opts = '<option value="">One-off tournament</option>'
      + (S.seriesList || []).map(function (s) {
          return '<option value="' + s.id + '"' + (ev.series_id === s.id ? ' selected' : '') + '>' + esc(s.name) + '</option>';
        }).join('');
    return '<div class="lg-fld"><div class="lg-lab">Is this part of a series?</div>'
      + '<select class="lg-sel" id="tg-ser" style="max-width:360px" onchange="FFPTourn.serPick(this.value)">' + opts + '</select>'
      + '<div id="tg-ser-extra" style="' + (ev.series_id ? '' : 'display:none;') + 'margin-top:10px">'
      +   '<div class="lg-2"><div class="lg-fld"><div class="lg-lab">Round number</div><input class="lg-in" id="tg-ser-round" type="number" min="0" value="' + (ev.series_round === null || ev.series_round === undefined ? '' : ev.series_round) + '" style="max-width:140px"></div>'
      +   '<div class="lg-fld"><div class="lg-lab">&nbsp;</div><label class="ts-chk" style="padding-top:10px"><input type="checkbox" id="tg-ser-finals"' + (ev.is_finals ? ' checked' : '') + '> This round is the finals</label></div></div></div>'
      + '<div class="tg-hint">A series carries its teams between rounds, so the next one starts from a list instead of a blank form. Saved with the rest of this tab.</div></div>';
  }
  function serPick(v) { var x = document.getElementById('tg-ser-extra'); if (x) x.style.display = v ? '' : 'none'; }
  async function serSaveLink() {
    var ev = (S.detail && S.detail.event) || {};
    var sel = document.getElementById('tg-ser'); if (!sel) return;
    var v = sel.value || '';
    var n = parseInt(gv('tg-ser-round'), 10); if (isNaN(n)) n = null;
    var fin = gck('tg-ser-finals');
    try {
      if (!v) { if (ev.series_id) await sb().rpc('tourn_series_unset_event', { p_event: S.eventId }); }
      else { await sb().rpc('tourn_series_set_event', { p_series: v, p_event: S.eventId, p_round: n, p_is_finals: fin }); }
      S.seriesList = null;
    } catch (e) { console.error('[tourn series link]', e); }
  }

  window.FFPTourn = {
    mgOpen: mgOpen, mgSearch: mgSearch, mgPick: mgPick, mgTeam: mgTeam, mgAssign: mgAssign, mgRemove: mgRemove,
    rulesHint: rulesHint,
    openSeries: openSeries, serTab: function (t) { S.serTab = t; S.serTeamEdit = null; S.serAddRound = false; renderSerTab(); },
    serCreateOpen: function () { S.serCreating = true; renderList(); }, serCreateCancel: function () { S.serCreating = false; renderList(); }, serCreate: serCreate,
    serRoundSave: serRoundSave, serRoundAdd: serRoundAdd, serRoundOut: serRoundOut,
    serAddRoundOpen: serAddRoundOpen, serAddRoundCancel: function () { S.serAddRound = false; renderSerTab(); },
    serAdopt: serAdopt, serTeamEdit: function (id) { S.serTeamEdit = id; renderSerTab(); }, serTeamCancel: function () { S.serTeamEdit = null; renderSerTab(); },
    serTeamSave: serTeamSave, serTeamStatus: serTeamStatus,
    serPtsSave: serPtsSave, serPtsPlace: serPtsPlace, serPtsPreset: serPtsPreset, serDetailsSave: serDetailsSave,
    serPick: serPick, serImg: serImg, serTeamLogo: serTeamLogo,
    serEnterOpen: serEnterOpen, serEnterCancel: serEnterCancel, serEnterToggle: serEnterToggle, serEnterAll: serEnterAll, serEnterDo: serEnterDo,
    tierPreview: tierPreview, tierPools: tierPools, tierIntake: tierIntake,
    refsHint: refsHint, refsInfo: refsInfo,
    mdDayOver: mdDayOver, mdDayLeave: mdDayLeave, mdDayDrop: mdDayDrop,
    mdTrayOver: mdTrayOver, mdTrayLeave: mdTrayLeave, mdTrayDrop: mdTrayDrop,
    entFind: entFind, entFindClose: entFindClose, entFindEmail: entFindEmail,
    entLink: entLink, entUnlink: entUnlink,
    dnScope: dnScope, dnSave: dnSave, dnReset: dnReset,
    finalsWhen: finalsWhen, potmVoteSave: potmVoteSave,
    build: BUILD,
    open: open, startCreate: startCreate, cancelCreate: cancelCreate, doCreate: doCreate,
    back: function () { S.view = 'list'; renderList(); }, tab: function (t) { S.tab = t; S.matchOpen = null; renderEditor(); },
    setDiv: function (val, tab) { if (S.divId !== val) S.drawKey = null; S.divId = val; S.tab = tab; S.entEdit = null; S.entDel = null; S.sqOpen = null; renderTab(); },
    seg: function (btn, id) { document.querySelectorAll('#' + id + ' button').forEach(function (b) { b.classList.remove('on'); }); btn.classList.add('on'); },
    statusPick: statusPick, eventState: eventState, eventDelete: eventDelete, toggleArchived: toggleArchived,
    openAdd: openAdd, addPoolOfficial: addPoolOfficial,
    setAccess: setAccess, accDay: accDay, accMatch: accMatch, accSave: accSave, accCancel: accCancel,
    pinPanel: async function (fid, nm) {
      S.pinFor = fid; S.pin = {}; reVenues();
      var r; try { r = await sb().rpc('tablet_pair_start', { p_court: null, p_field: fid }); } catch (e) { r = { error: e }; }
      var m = String((r.error && r.error.message) || '');
      S.pin = r.error
        ? { err: /not_yours/.test(m) ? 'That ' + surfWord() + ' is not yours to connect.' : /too_many_codes/.test(m) ? 'Too many PINs live for this ' + surfWord() + '. Wait a few minutes.' : 'Could not make a PIN.' }
        : { pin: r.data && r.data.pin };
      await reVenues();
      if (S.pin && S.pin.pin) drawPinQr(TABLET_URL + '?pin=' + encodeURIComponent(S.pin.pin));
    },
    decide: async function (id, ok) {
      var r; try { r = await sb().rpc('tourn_entrant_approve', { p_id: id, p_approve: !!ok }); } catch (e) { r = { error: e }; }
      if (r.error) { toast(ok ? 'Could not approve' : 'Could not decline', 'error'); return; }
      toast(ok ? 'In' : 'Declined', 'success'); renderTab();
    },
    togglePaid: async function (id, paid) {
      var r; try { r = await sb().rpc('tourn_entrant_pay', { p_id: id, p_paid: !!paid, p_method: null, p_ref: null, p_amount: null }); } catch (e) { r = { error: e }; }
      if (r.error) { toast('Could not change that', 'error'); return; }
      toast(paid ? 'Marked paid' : 'Marked unpaid', 'success'); renderTab();
    },
    pinClose: function () { S.pinFor = null; S.pin = null; reVenues(); },
    copy: function (t) { try { navigator.clipboard.writeText(t); toast('Copied', 'success'); } catch (e) {} },
    saveDetails: saveDetails, sportHint: sportHint,
    divKind: divKind, setEntrantMode: setEntrantMode, saveSetup: saveSetup, sideHint: sideHint, capHint: capHint, setDivFmt: setDivFmt, fmtInfo: fmtInfo, sideInfo: sideInfo, mlenEdit: mlenEdit, mlenSport: mlenSport, bpAdd: bpAdd, bpDel: bpDel, bpType: bpType, saveDivFormat: saveDivFormat, buildDivDraw: buildDivDraw, editDivision: editDivision, cancelDivision: cancelDivision, saveDivision: saveDivision,
    askRemoveDivision: askRemoveDivision, cancelRemoveDivision: cancelRemoveDivision, removeDivision: removeDivision,
    addEntrant: addEntrant, bulkAthletes: bulkAthletes, cancelEntrant: cancelEntrant, saveEntrant: saveEntrant,
    editEntrant: editEntrant, cancelEntrantEdit: cancelEntrantEdit, saveEntrantEdit: saveEntrantEdit, hexSync: hexSync,
    askRemoveEntrant: askRemoveEntrant, cancelRemoveEntrant: cancelRemoveEntrant, removeEntrant: removeEntrant,
    sqToggle: sqToggle, sqSearch: sqSearch, sqKey: sqKey, sqAddMember: sqAddMember, sqNameOnly: sqNameOnly, sqInvite: sqInvite, sqRemove: sqRemove,
    doGroups: doGroups, saveGroupResults: saveGroupResults,
    confirmBracket: confirmBracket, cancelBracket: cancelBracket, doBracket: doBracket, monradOpen: monradOpen, setDrawFormat: setDrawFormat, setSideDraws: setSideDraws, setDraw: setDraw, monradRound: monradRound, awardPanel: awardPanel, doAward: doAward, saveBracketResults: saveBracketResults,
    pickImg: pickImg, pickRulesPdf: pickRulesPdf, removeRulesPdf: removeRulesPdf, entLogo: entLogo, ofSearch: ofSearch, ofPick: ofPick, removeOfficial: removeOfficial, ofPhoto: ofPhoto,
    autoplan: autoplan, schedSet: schedSet,
    setSchedDiv: setSchedDiv, planSet: planSet, setAddDiv: setAddDiv, applyBreaks: applyBreaks,
    openDivDraw: openDivDraw, openDrawCancel: openDrawCancel,
    breakAdd: breakAdd, breakSave: breakSave, breakRemove: breakRemove, breaksMoveOut: breaksMoveOut,
    daySave: daySave, dayShut: dayShut, scheduleSave: scheduleSave,
    dayWhoOpen: dayWhoOpen, dayWhoClose: dayWhoClose, dayWhoTog: dayWhoTog,
    dayWhoApply: dayWhoApply, pinMatch: pinMatch,
    awayAdd: awayAdd, awaySave: awaySave, awayRemove: awayRemove,
    oopPanel: oopPanel, oopDay: oopDay,
    mailPaste: mailPaste, mailPasteApply: mailPasteApply, mailClose: mailClose,
    mailPreview: mailPreview, mailTest: mailTest, mailSendAsk: mailSendAsk, mailSend: mailSend,
    updPreview: updPreview, updTest: updTest, updAsk: updAsk, updSend: updSend,
    mdDrag: mdDrag, mdDragEnd: mdDragEnd, mdOver: mdOver, mdLeave: mdLeave, mdDrop: mdDrop,
    rebuildAsk: rebuildAsk, rebuildCancel: rebuildCancel,
    schedToggle: schedToggle, schedMove: schedMove, setMainCourt: setMainCourt,
    mdDay: mdDay, mdPick: mdPick, mdRefresh: mdRefresh, mdGo: mdGo, mdSimFill: mdSimFill, mdSimPlay: mdSimPlay,
    mdSimAsk: mdSimAsk, mdSimCancel: mdSimCancel, mdSimClear: mdSimClear,
    togRound: togRound, addMatch: addMatch, cancelMatch: cancelMatch, saveMatch: saveMatch,
    addVenue: addVenue, editVenue: editVenue, cancelVenue: cancelVenue, saveVenue: saveVenue, removeVenue: removeVenue,
    addSurface: addSurface, cancelSurface: cancelSurface, saveSurface: saveSurface, removeSurface: removeSurface, screenPanel: screenPanel, useMyCourts: useMyCourts, linkCourt: linkCourt, copyScreen: copyScreen,
    offAdd: offAdd, offRemove: offRemove, offSet: offSet,
    openMatch: openMatch, closeMatch: closeMatch, addEvent: addEvent, removeEvent: removeEvent, saveResultFromEvents: saveResultFromEvents, addSub: addSub, removeSub: removeSub,
    trkToggle: trkToggle, trkReset: trkReset, trkPoss: trkPoss, trkHalf: trkHalf, trkApply: trkApply, mcSetPeriod: mcSetPeriod, _mcSetTime: _mcSetTime,
    mcTab: mcTab, mcPickStatPlayer: mcPickStatPlayer, saveStats: saveStats, setLive: setLive, saveTeamStats: saveTeamStats, saveStream: saveStream,
    addCustomStat: addCustomStat, removeCustomStat: removeCustomStat,
    pbpAward: pbpAward, pbpUndo: pbpUndo, pbpServer: pbpServer, pbpDecide: pbpDecide, pbpFinish: pbpFinish
  };
  window.ffpRenderTournaments = function () { S.view = 'list'; S.creating = false; renderList(); };
})();
