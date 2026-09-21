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
  var STAGE = { r64: 'Round of 64', r32: 'Round of 32', r16: 'Round of 16', quarter: 'Quarter-finals', semi: 'Semi-finals', final: 'Final', third: '3rd place' };
  function stageLbl(m) { return m.stage === 'round' ? 'Round ' + (m.round || 1) : (STAGE[m.stage] || m.stage); }
  // Extra draws a knockout can carry. Every loser of the named round plays on
  // in the next draw down, so nobody travels to an event for one match.
  var SIDE_DRAWS = [
    ['none', 'Main draw only'],
    ['plate', 'Plate, first-round losers'],
    ['plate_bowl', 'Cup, Plate, Bowl'],
    ['plate_bowl_shield', 'Cup, Plate, Bowl, Shield'],
    ['qf_plate', 'Plate, quarter-final losers'],
    ['consolation', 'Feed-in consolation'],
    ['places', 'Every place played off (compass)']
  ];

  var S = { plan: { len: 30, start: '09:00', end: '21:00', gap: 0, rest: 15 }, view: 'list', eventId: null, detail: null, tab: 'details', divId: null, sports: null, creating: false, divEdit: null, entAdd: false, entEdit: null, entDel: null, grpDraw: false, brkConfirm: false };

  function injectBaseCss() {
    if (document.getElementById('lgx-css')) return;
    var css = document.createElement('style'); css.id = 'lgx-css';
    css.textContent = [
      '.lg-wrap{max-width:1000px;}',
      '.lg-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;gap:12px;flex-wrap:wrap;}',
      '.lg-h1{font-size:21px;font-weight:900;color:var(--ffp-text);} .lg-sub{font-size:13px;color:var(--ffp-text-muted);font-weight:600;margin-top:2px;}',
      '.lg-btn{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--ffp-border-mid);background:#fff;border-radius:10px;padding:9px 14px;font:inherit;font-size:13px;font-weight:800;color:var(--ffp-text);cursor:pointer;} .lg-btn .ms{font-size:18px;}',
      '.lg-btn.pri{background:var(--ffp-blue);border-color:var(--ffp-blue);color:#fff;} .lg-btn.gold{background:linear-gradient(180deg,#ffd15a,#f2a900);border:none;color:#3a2600;} .lg-btn.green{background:#12a05f;border-color:#12a05f;color:#fff;} .lg-btn.ghost{background:none;border-color:transparent;color:var(--ffp-text-muted);} .lg-btn:disabled{opacity:.5;cursor:default;}',
      '.lg-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:14px;}',
      '.lg-card{border:1px solid var(--ffp-border-mid);border-radius:14px;overflow:hidden;cursor:pointer;background:#fff;box-shadow:0 4px 12px rgba(15,34,48,.06);}',
      '.lg-cover{height:104px;position:relative;background:linear-gradient(150deg,#5a2fb0,#241053) center/cover no-repeat;} .lg-cover .scr{position:absolute;inset:0;background:linear-gradient(transparent,rgba(8,18,26,.6));} .lg-cover .bd{position:absolute;top:8px;left:8px;font-size:10px;font-weight:900;padding:3px 8px;border-radius:20px;background:#fff;color:#d6353b;} .lg-cover .bd.live{background:#d6353b;color:#fff;} .lg-cover .bd.open{color:#0a8f5f;} .lg-cover .bd.draft,.lg-cover .bd.final{color:#5b6b75;}',
      '.lg-cbody{padding:11px 13px;} .lg-cbody b{font-size:14.5px;font-weight:900;color:var(--ffp-text);display:block;} .lg-cbody span{font-size:12px;color:var(--ffp-text-muted);font-weight:700;text-transform:capitalize;}',
      '.lg-new{border:2px dashed var(--ffp-border-mid);border-radius:14px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;min-height:168px;color:var(--ffp-blue);font-weight:800;cursor:pointer;background:#fff;} .lg-new .ms{font-size:28px;}',
      '.lg-nav{display:flex;gap:22px;border-bottom:1px solid var(--ffp-border);margin-bottom:20px;flex-wrap:wrap;} .lg-nav button{background:none;border:none;font:inherit;font-size:13.5px;font-weight:800;color:var(--ffp-text-muted);padding:11px 0;border-bottom:2.5px solid transparent;cursor:pointer;} .lg-nav button.on{color:var(--ffp-blue);border-bottom-color:var(--ffp-blue);}',
      '.lg-pill{font-size:11px;font-weight:800;padding:3px 10px;border-radius:20px;margin-left:8px;vertical-align:middle;} .lg-pill.live{background:#fdeaea;color:#d6353b;} .lg-pill.open{background:#e3f6ec;color:#0a8f5f;} .lg-pill.draft,.lg-pill.final{background:#eef2f5;color:#5b6b75;}',
      '.lg-lab{font-size:12px;font-weight:800;color:#43525c;margin:0 0 6px;} .lg-in,.lg-sel{width:100%;padding:10px 12px;border:1px solid #d7dee5;border-radius:10px;font:inherit;box-sizing:border-box;background:#fff;color:#12232f;} .lg-fld{margin-bottom:16px;} .lg-2{display:grid;grid-template-columns:1fr 1fr;gap:14px;} .lg-3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;}',
      '.lg-seg{display:inline-flex;border:1.5px solid var(--ffp-border-mid);border-radius:10px;overflow:hidden;} .lg-seg button{background:#fff;border:none;padding:9px 15px;font:inherit;font-size:12.5px;font-weight:800;color:var(--ffp-text-muted);cursor:pointer;} .lg-seg button.on{background:var(--ffp-blue);color:#fff;} .lg-status4 button{padding:9px 18px;} .lg-status4 button.on.st-draft{background:#6a7c8a;color:#fff;} .lg-status4 button.on.st-open{background:#1980AD;color:#fff;} .lg-status4 button.on.st-live{background:#1c9d54;color:#fff;} .lg-status4 button.on.st-final{background:#e0a400;color:#2a2200;} .lg-cfm{position:fixed;inset:0;z-index:9999;background:#fff;display:flex;} .lg-cfm-in{margin:auto;max-width:460px;width:100%;padding:34px 30px;text-align:center;display:flex;flex-direction:column;align-items:center;} .lg-cfm-ic{font-size:60px;margin-bottom:14px;} .lg-cfm-ic.tone-live{color:#1c9d54;} .lg-cfm-ic.tone-final{color:#e0a400;} .lg-cfm-ic.tone-draft{color:#6a7c8a;} .lg-cfm-t{font-size:24px;font-weight:900;color:#12232f;} .lg-cfm-b{font-size:14.5px;font-weight:600;color:#5a6b78;line-height:1.55;margin-top:12px;} .lg-cfm-a{display:flex;gap:12px;margin-top:28px;width:100%;} .lg-cfm-a .lg-btn{flex:1;justify-content:center;} .lg-cfm-a .lg-btn.st-live{background:#1c9d54;color:#fff;} .lg-cfm-a .lg-btn.st-final{background:#e0a400;color:#2a2200;} .lg-cfm-a .lg-btn.st-draft{background:#6a7c8a;color:#fff;}',
      '.lg-row{display:flex;align-items:center;gap:12px;padding:13px 2px;border-bottom:1px solid var(--ffp-border);} .lg-row .drag{color:#c0cad2;font-size:20px;cursor:grab;} .lg-row .g{flex:1;min-width:0;} .lg-row .g b{font-size:14.5px;font-weight:800;color:var(--ffp-text);} .lg-row .g span{font-size:12.5px;color:var(--ffp-text-muted);font-weight:700;} .lg-row .act{color:#9aa8b4;font-size:20px;cursor:pointer;padding:4px;} .lg-row .act:hover{color:var(--ffp-blue);}',
      '.lg-av{position:relative;width:34px;height:34px;border-radius:8px;flex:none;background:#e7ecef center/cover no-repeat;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:900;color:#6a7681;}',
      '.lg-avedit{cursor:pointer;}',
      '.lg-avplus{position:absolute;right:-5px;bottom:-5px;width:17px;height:17px;border-radius:50%;background:var(--ffp-blue,#2ba8e0);color:#fff;font-size:12px;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 3px rgba(0,0,0,.3);border:1.5px solid #fff;}',
      '.lg-empty{padding:40px 16px;text-align:center;color:var(--ffp-text-muted);font-weight:600;font-size:13.5px;}',
      '.lg-tool{display:flex;align-items:center;gap:12px;margin-bottom:16px;flex-wrap:wrap;} .lg-tool .lg-sel{width:auto;min-width:180px;} .lg-tool .sp{flex:1;} .lg-tool .lg-in{width:64px;}',
      '.lg-edit{display:flex;align-items:center;gap:10px;padding:12px 2px;border-bottom:1px solid var(--ffp-border);flex-wrap:wrap;} .lg-edit .lg-in{width:auto;flex:1;min-width:160px;}',
      /* add players from FFP: one search, a grade, and a plain list of matches */
      '.tg-ea{padding:14px 2px 6px;border-bottom:2px solid var(--ffp-text,#12232f);} .tg-ea .bar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;} .tg-ea .bar .lg-in{flex:1 1 280px;min-width:0;} .tg-ea .bar .lg-sel{flex:none;width:170px;min-width:0;}',
      '.tg-ea .res{margin-top:6px;} .tg-ea .opt{display:flex;align-items:center;gap:12px;padding:10px 2px;border-bottom:1px solid var(--ffp-border);} .tg-ea .opt .av{width:36px;height:36px;border-radius:50%;flex:none;background:#e7ecef center/cover no-repeat;display:flex;align-items:center;justify-content:center;font-weight:900;color:#6a7c8a;} .tg-ea .opt .g{flex:1;min-width:0;} .tg-ea .opt .g b{display:block;font-size:14.5px;font-weight:800;color:var(--ffp-text);} .tg-ea .opt .g span{font-size:12.5px;font-weight:700;color:var(--ffp-text-muted);} .tg-ea .opt .in{font-size:12.5px;font-weight:800;color:#1f9d57;}',
      '.tg-ea .none{font-size:13px;font-weight:700;color:var(--ffp-text-muted);padding:10px 2px;}',
      '.lg-row .g .gr{color:#c98f00;font-weight:800;}',
      /* entrants: a column for every detail the organiser needs at a glance */
      '.tg-et{border-top:2px solid var(--ffp-text,#12232f);}',
      '.tg-er{display:grid;grid-template-columns:42px minmax(210px,1.6fr) 92px 1.15fr 108px 74px 1.15fr 96px 24px;gap:12px;align-items:center;padding:11px 4px;border-bottom:1px solid var(--ffp-border);font-size:13.5px;font-weight:700;color:#43525c;cursor:pointer;}',
      '.tg-er.hd{cursor:default;padding:8px 4px;} .tg-er.hd span{font-size:11px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;color:#7c8b97;}',
      '.tg-er .sd{font-size:17px;font-weight:900;color:#c98f00;text-align:center;}',
      '.tg-er .pl{display:flex;align-items:center;gap:10px;min-width:0;} .tg-er .pl b{font-size:14.5px;font-weight:800;color:#12232f;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '.tg-er .pl .vf{color:#1980AD;font-size:16px;}',
      '.tg-er .cel{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;} .tg-er .mut{color:#9aa8b4;font-weight:700;}',
      '.tg-er.open{background:linear-gradient(90deg,rgba(25,128,173,.07),transparent 62%);border-bottom:none;}',
      '.tg-dt{display:grid;grid-template-columns:120px 1fr 1.1fr;gap:30px;padding:18px 6px 22px 56px;border-bottom:1px solid var(--ffp-border);background:linear-gradient(90deg,rgba(25,128,173,.07),transparent 62%);}',
      '.tg-dt .ph{width:120px;height:120px;border-radius:50%;background:#e7ecef center/cover no-repeat;box-shadow:0 10px 26px rgba(0,0,0,.15);display:flex;align-items:center;justify-content:center;font-size:40px;font-weight:900;color:#93a2ad;}',
      '.tg-dt .src{font-size:12px;font-weight:800;color:#1980AD;display:flex;align-items:center;gap:5px;margin-bottom:12px;} .tg-dt .src .ms{font-size:16px;}',
      '.tg-kv{display:grid;grid-template-columns:118px 1fr;row-gap:9px;column-gap:14px;align-content:start;} .tg-kv span{font-size:11px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;color:#7c8b97;padding-top:2px;} .tg-kv b{font-size:14px;font-weight:800;color:#12232f;}',
      '.tg-fg{display:grid;grid-template-columns:1fr 1fr;gap:12px 14px;align-content:start;} .tg-fg label{display:flex;flex-direction:column;gap:5px;min-width:0;} .tg-fg .lg-in,.tg-fg .lg-sel{width:100%;height:42px;padding:0 12px;min-width:0;flex:none;box-sizing:border-box;} .tg-fg .full{grid-column:1/-1;}',
      '.tg-dt .acts{display:flex;gap:10px;align-items:center;margin-top:16px;grid-column:1/-1;} .tg-dt .acts .sp{flex:1;} .tg-dt .msg{font-size:12.5px;font-weight:700;color:#c0392b;}',
      '.tg-af{display:grid;grid-template-columns:repeat(4,1fr);gap:12px 14px;margin-top:6px;} .tg-af label{display:flex;flex-direction:column;gap:5px;min-width:0;} .tg-af .lg-in,.tg-af .lg-sel{width:100%;height:42px;padding:0 12px;min-width:0;flex:none;box-sizing:border-box;} .tg-af .w2{grid-column:span 2;}',
      '.tg-or{font-size:13px;font-weight:700;color:#6a7c8a;margin:14px 0 2px;} .tg-or b{color:#1980AD;cursor:pointer;}',
      /* open draw */
      '.tg-dw{display:flex;align-items:baseline;gap:16px;margin:2px 0 14px;flex-wrap:wrap;} .tg-dw b{font-size:26px;font-weight:900;} .tg-dw span{font-size:13px;font-weight:700;color:#6a7c8a;}',
      '.tg-pool{margin-top:18px;padding-top:12px;border-top:1px solid var(--ffp-border);font-size:13.5px;font-weight:800;display:flex;gap:14px;flex-wrap:wrap;align-items:baseline;}',
      '.tg-m .slotsel{width:100%;height:34px;padding:0 8px;border:1px dashed #b9cbd8;border-radius:8px;font:inherit;font-size:12.5px;font-weight:800;color:#1980AD;background:#fff;box-sizing:border-box;min-width:0;}',
      /* schedule: days, coverage, the court grid */
      '.tg-days{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:10px 0 12px;border-bottom:1px solid var(--ffp-border);margin-bottom:14px;}',
      '.tg-days .d{display:flex;align-items:center;gap:8px;} .tg-days .d b{font-size:12px;font-weight:900;color:#c98f00;letter-spacing:.05em;} .tg-days .lg-in{width:170px;height:40px;min-width:0;flex:none;}',
      '.tg-cov{display:flex;align-items:center;gap:14px;margin-bottom:16px;flex-wrap:wrap;} .tg-cov .n{font-size:24px;font-weight:900;} .tg-cov .t{font-size:13px;font-weight:700;color:#6a7c8a;} .tg-cov .warn{color:#b07800;font-weight:800;font-size:13px;}',
      '.tg-meter{flex:1;max-width:340px;height:10px;border-radius:6px;background:#eef2f5;overflow:hidden;} .tg-meter i{display:block;height:100%;background:linear-gradient(90deg,#1980AD,#43b4e6);box-shadow:0 0 12px rgba(25,128,173,.45);}',
      '.tg-grid{display:grid;border-top:2px solid var(--ffp-text,#12232f);}',
      '.tg-grid .th{font-size:12px;font-weight:900;letter-spacing:.06em;text-transform:uppercase;color:#43525c;padding:10px 8px;border-bottom:1px solid var(--ffp-border);}',
      '.tg-grid .tm{font-size:14px;font-weight:900;padding:10px 8px;border-bottom:1px solid var(--ffp-border);}',
      '.tg-grid .c{padding:6px;border-bottom:1px solid var(--ffp-border);border-left:1px solid #f0f3f5;min-height:52px;}',
      '.tg-gm{height:100%;border-left:4px solid var(--dc);padding:6px 9px;background:linear-gradient(90deg,var(--db),transparent);border-radius:3px;cursor:pointer;}',
      '.tg-gm u{text-decoration:none;display:block;font-size:10.5px;font-weight:900;letter-spacing:.07em;text-transform:uppercase;color:var(--dc);}',
      '.tg-gm b{display:block;font-size:12.5px;font-weight:800;line-height:1.3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '.tg-sr{display:grid;grid-template-columns:1.6fr 116px 150px 160px;gap:10px;align-items:center;padding:9px 4px;border-bottom:1px solid var(--ffp-border);}',
      '.tg-sr .lg-in,.tg-sr .lg-sel{width:100%;height:38px;padding:0 10px;font-size:13.5px;min-width:0;flex:none;box-sizing:border-box;}',
      '.tg-sr .m b{font-size:14px;font-weight:800;color:#12232f;} .tg-sr .m u{text-decoration:none;display:block;font-size:10.5px;font-weight:900;letter-spacing:.07em;text-transform:uppercase;color:var(--dc,#9aa8b4);} .tg-sr .m small{display:block;font-size:11px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#9aa8b4;}',
      '.tg-sr.no .lg-sel,.tg-sr.no .lg-in{border-color:#e0a400;background:#fffaf0;}',
      '.tg-dh{display:flex;align-items:center;gap:12px;padding:16px 4px 9px;border-bottom:2px solid var(--dc,#12232f);} .tg-dh b{font-size:16px;font-weight:900;} .tg-dh .ok{font-size:13px;font-weight:800;color:#1f9d57;} .tg-dh .warn{font-size:13px;font-weight:800;color:#b07800;} .tg-dh .sp{flex:1;} .tg-dh .lab{font-size:11px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;color:#7c8b97;}',
      '.tg-unh{display:flex;align-items:center;gap:10px;padding:10px 4px;border-top:2px solid #b07800;font-size:12px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;color:#b07800;}',
      '.tg-d0{--dc:#c98f00;--db:rgba(242,169,0,.12);} .tg-d1{--dc:#1980AD;--db:rgba(25,128,173,.10);} .tg-d2{--dc:#7a4fc2;--db:rgba(122,79,194,.10);} .tg-d3{--dc:#1f9d57;--db:rgba(31,157,87,.10);} .tg-d4{--dc:#c0392b;--db:rgba(192,57,43,.10);} .tg-d5{--dc:#0f7b8a;--db:rgba(15,123,138,.10);}',
      '.tg-sdiv{display:block;font-size:11px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;color:#c98f00;margin-bottom:2px;}',
      '.lg-entform{align-items:flex-end;gap:12px;padding:16px 2px;} .lg-entform .crest{align-self:flex-end;padding-bottom:5px;} .lg-entform .f{display:flex;flex-direction:column;gap:5px;min-width:0;} .lg-entform .f label{height:14px;line-height:14px;font-size:11px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:#7c8b97;} .lg-entform .f.gr{flex:1 1 200px;} .lg-entform .f.sm{flex:0 0 92px;} .lg-entform .f .lg-in,.lg-entform .f .lg-sel{width:100%;min-width:0;max-width:100%;flex:none;box-sizing:border-box;height:44px;padding:0 12px;line-height:44px;} .lg-entform .f .lg-in{-webkit-appearance:none;appearance:none;} .lg-entform .f input[type=number]{-moz-appearance:textfield;} .lg-entform .f input[type=number]::-webkit-outer-spin-button,.lg-entform .f input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none;margin:0;} .lg-entform .f .ro{height:44px;display:flex;align-items:center;font-size:14.5px;font-weight:800;color:var(--ffp-text);} .lg-entform .acts{display:flex;align-items:center;gap:9px;flex:1 1 100%;margin-top:4px;} .lg-entform .acts .sp{flex:1;} .lg-entform .lg-btn.danger{color:#c0392b;} .lg-entform .lg-btn.danger:hover{background:#fdf1ef;} .lg-entform .lg-btn.danger.solid{background:#c0392b;border-color:#c0392b;color:#fff;} .lg-entform .delq{font-size:13px;font-weight:800;color:var(--ffp-text);} .lg-entform .note{flex:1 1 100%;font-size:12.5px;font-weight:600;color:#7c8b97;margin-top:2px;} .lg-entform .msg{flex:1 1 100%;font-size:12.5px;font-weight:700;color:#c0392b;} @media(max-width:820px){.lg-entform .f.gr,.lg-entform .f{flex:1 1 100%;}}',
      '.lg-fx{display:grid;grid-template-columns:1fr 128px 1fr;align-items:center;gap:8px;padding:11px 2px;border-bottom:1px solid var(--ffp-border);} .lg-fx .t{font-size:13.5px;font-weight:800;color:var(--ffp-text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;} .lg-fx .t.a{text-align:right;} .lg-fx .sc{display:flex;gap:6px;justify-content:center;} .lg-fx .sc input{width:46px;padding:8px;border:1.5px solid #d7dee5;border-radius:8px;font:inherit;font-weight:800;text-align:center;}',
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
      '.tg-m{background:#fff;border:1px solid #d7dee5;border-radius:11px;overflow:hidden;} .tg-m .s{display:flex;align-items:center;gap:7px;padding:7px 9px;} .tg-m .s+.s{border-top:1px solid #eef1f6;} .tg-m .s b{flex:1;font-size:12.5px;font-weight:700;color:#12232f;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;} .tg-m .s input{width:40px;padding:5px;border:1.5px solid #d7dee5;border-radius:7px;font:inherit;font-weight:800;text-align:center;} .tg-m .s.win b{color:#0a8f5f;} .tg-m .s.tbd b{color:#9aa8b4;font-weight:600;}',
      '.tg-grph{font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:.4px;color:#12232f;margin:16px 0 4px;}',
      '.tg-group{border-bottom:1px solid var(--ffp-border);padding-bottom:14px;margin-bottom:8px;} .tg-gteams{display:flex;flex-wrap:wrap;gap:8px;margin:2px 0 12px;} .tg-gteam{display:inline-flex;align-items:center;gap:7px;background:#f4f7f9;border:1px solid var(--ffp-border);border-radius:20px;padding:5px 12px 5px 6px;font-size:13px;font-weight:700;} .tg-gteam .lg-crest{width:22px;height:22px;border-radius:6px;font-size:9px;}',
      '.tg-phase{font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#9aa8b4;padding:0 6px;} .tg-navsep{display:inline-block;width:1px;height:20px;background:var(--ffp-border);margin:0 4px;vertical-align:middle;}',
      '.tg-tbl{width:100%;border-collapse:collapse;margin-bottom:12px;} .tg-tbl th{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:#9aa8b4;text-align:center;padding:6px 4px;border-bottom:1px solid var(--ffp-border);} .tg-tbl th.nm{text-align:left} .tg-tbl td{font-size:13px;padding:9px 4px;text-align:center;border-bottom:1px solid #f0f3f6;} .tg-tbl td.nm{text-align:left;font-weight:700} .tg-tbl td.nm .in{display:flex;align-items:center;gap:9px} .tg-tbl td.pts{font-weight:900;color:var(--ffp-blue)} .tg-tbl tr.adv td{background:#eafaf3} .tg-tbl .rk{color:#9aa8b4;font-weight:800;width:24px} .tg-tbl .lg-crest{width:22px;height:22px;border-radius:6px;font-size:9px;}',
      '.tg-rlbl{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#b7c2cc;margin:9px 0 1px;} .tg-gfx{display:grid;grid-template-columns:1fr 116px 1fr auto;align-items:center;gap:8px;padding:9px 2px;border-bottom:1px solid #f0f3f6;} .tg-gfx .t{font-size:13.5px;font-weight:700} .tg-gfx .t.a{text-align:right} .tg-gfx .sc{display:flex;gap:6px;justify-content:center} .tg-gfx .sc input{width:42px;height:34px;text-align:center;border:1.5px solid #d7dee5;border-radius:8px;font:inherit;font-weight:800;} .fxlab{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:#9aa8b4;margin:10px 0 2px;}',
      '.tg-fmts{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;} .tg-fmt{border:1.5px solid var(--ffp-border);border-radius:14px;padding:16px 12px;cursor:pointer;text-align:center;} .tg-fmt.on{border-color:var(--ffp-blue);box-shadow:0 0 0 3px rgba(25,128,173,.12);} .tg-fmt .dia{height:74px;display:flex;align-items:center;justify-content:center;margin-bottom:10px;} .tg-fmt b{display:block;font-size:13.5px;font-weight:900;} .tg-fmt span{display:block;font-size:11.5px;color:var(--ffp-text-muted);font-weight:600;margin-top:3px;line-height:1.4;} .tgd rect{fill:none;stroke:#c3ced6;stroke-width:2.4;} .tgd line{stroke:#c3ced6;stroke-width:2.4;} .tg-fmt.on .tgd rect,.tg-fmt.on .tgd line{stroke:var(--ffp-blue);}',
      '.tg-fmtset{margin-top:18px;border-top:1px solid var(--ffp-border);padding-top:16px;}',
      '.lg-fldbar{display:flex;gap:10px;flex-wrap:wrap;align-items:center;} .lg-fldchip{display:inline-flex;align-items:center;gap:7px;border:1px solid var(--ffp-border-mid);border-radius:12px;padding:7px 11px;font-size:12.5px;font-weight:800;} .lg-fldchip .t{color:var(--ffp-text-muted);font-weight:700;} .lg-fldchip .x{color:#9aa8b4;font-size:16px;cursor:pointer;} .lg-fldchip.add{border-style:dashed;gap:4px;}',
      '.lg-srow{display:grid;grid-template-columns:1fr 132px 92px 120px 140px;gap:9px;align-items:center;padding:10px 2px;border-bottom:1px solid var(--ffp-border);} .lg-srow .mt{font-size:13.5px;font-weight:800;color:var(--ffp-text);min-width:0;} .lg-srow .mt span{display:block;font-size:11px;color:var(--ffp-text-muted);font-weight:600;} .lg-srow .lg-in,.lg-srow .lg-sel{padding:8px 9px;font-size:12.5px;width:100%;}',
      '.lg-brand{display:flex;gap:12px;align-items:stretch;} .lg-logo{width:76px;height:76px;flex:none;border-radius:12px;border:1.5px dashed #d7dee5;background:#f7f9fb center/cover no-repeat;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;color:#9aa8b4;cursor:pointer;font-size:10px;font-weight:800;} .lg-logo .ms{font-size:22px;} .lg-banner{flex:1;height:76px;border-radius:12px;border:1.5px dashed #d7dee5;background:#f7f9fb center/cover no-repeat;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;color:#9aa8b4;cursor:pointer;font-size:11px;font-weight:800;} .lg-banner .ms{font-size:22px;} .lg-row .act{margin-left:auto;color:#9aa8b4;font-size:19px;cursor:pointer;} .lg-banner16{width:100%;max-width:520px;aspect-ratio:16/9;border-radius:12px;border:1.5px dashed #d7dee5;background:#f7f9fb center/cover no-repeat;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;color:#9aa8b4;cursor:pointer;font-size:12px;font-weight:800;} .lg-banner16 .ms{font-size:28px;} .lg-offadd{display:flex;flex-direction:column;gap:10px;margin-bottom:14px;} .lg-offsrch{position:relative;} .lg-offres{margin-top:6px;display:flex;flex-direction:column;gap:4px;} .lg-offopt{display:flex;align-items:center;gap:10px;width:100%;text-align:left;border:1px solid #e6ecf1;background:#fff;border-radius:11px;padding:8px 11px;cursor:pointer;} .lg-offopt .av{width:34px;height:34px;border-radius:8px;flex:none;background:#e7ecef center/cover no-repeat;} .lg-offopt .g{flex:1;min-width:0;} .lg-offopt .g b{font-size:14px;font-weight:800;color:#12232f;display:block;} .lg-offopt .g span{font-size:11.5px;color:#7c8b97;font-weight:600;} .lg-offopt .pk{font-size:12px;font-weight:800;color:#1980AD;} .lg-offnone{font-size:12.5px;color:#7c8b97;font-weight:600;padding:8px 4px;} .lg-offpicked{display:flex;align-items:center;gap:6px;font-size:13px;font-weight:800;color:#0a8f5f;padding:6px 4px;} .lg-offrow{display:flex;gap:10px;align-items:center;flex-wrap:wrap;}',
      /* shared v7: crest / collapsible rounds / venues / schedule v2 / officials */
      '.lg-crest{width:32px;height:32px;border-radius:9px;flex:none;background:#241053 center/cover no-repeat;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:900;color:#fff;box-shadow:inset 0 0 0 1px rgba(0,0,0,.05),0 1px 2px rgba(0,0,0,.14);vertical-align:middle;}',
      '.lg-rnd{display:flex;align-items:center;gap:12px;margin:20px 0 2px;padding:12px 14px;background:linear-gradient(180deg,#f7fafc,#eef4f8);border:1px solid #e4edf3;border-radius:12px;cursor:pointer;user-select:none;} .lg-rnd:hover{background:linear-gradient(180deg,#f2f8fb,#e7f1f7);} .lg-rnd .chev{color:var(--ffp-blue);font-size:22px;transition:transform .2s;} .lg-rnd.collapsed .chev{transform:rotate(-90deg);} .lg-rnd .rt{font-size:14px;font-weight:900;color:var(--ffp-text);} .lg-rnd .rc{font-size:11px;font-weight:800;color:var(--ffp-blue);background:#e2eff6;padding:3px 10px;border-radius:20px;} .lg-rnd .rd{font-size:12px;font-weight:600;color:var(--ffp-text-muted);} .lg-rnd .sp{flex:1;} .lg-rbody.hidden{display:none;}',
      '.lg-venue{padding:18px 4px;border-bottom:1px solid var(--ffp-border);} .lg-vh{display:flex;align-items:center;gap:12px;} .lg-vpin{width:38px;height:38px;border-radius:11px;background:linear-gradient(180deg,#eaf4f9,#dcecf3);color:var(--ffp-blue);display:flex;align-items:center;justify-content:center;flex:none;} .lg-vpin .ms{font-size:21px;} .lg-vh .g{flex:1;min-width:0;} .lg-vh .g b{font-size:16px;font-weight:900;color:var(--ffp-text);} .lg-vh .g span{display:block;font-size:12.5px;color:var(--ffp-text-muted);font-weight:700;} .lg-vh .act{color:#9aa8b4;font-size:19px;cursor:pointer;padding:5px;border-radius:8px;} .lg-vh .act:hover{color:var(--ffp-blue);background:#f4f7f9;}',
      '.tg-kind{position:absolute;left:8px;top:8px;font-size:10px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;color:#a86a08;background:#fff4e0;padding:3px 7px;border-radius:6px;} .tg-awgrid{width:100%;text-align:left;margin-top:18px;} .tg-awrow{display:flex;gap:8px;margin-top:7px;} .tg-awrow.wrap{flex-wrap:wrap;} .tg-awrow .lg-btn{flex:1;justify-content:center;min-width:110px;} .tg-awrow .lg-btn.on{background:var(--ffp-blue);border-color:var(--ffp-blue);color:#fff;}',
      '.lg-scrbtn{display:inline-flex;align-items:center;gap:6px;border:1.5px solid #cfe0ea;background:#f5fafc;color:var(--ffp-blue);border-radius:9px;padding:5px 10px;font:inherit;font-size:12px;font-weight:900;letter-spacing:.06em;cursor:pointer;margin-right:10px;} .lg-scrbtn .ms{font-size:16px;} .lg-scrbtn.perm{border-color:#f2c14e;background:#fffaf0;color:#9a6b00;} .lg-vclink{width:230px!important;min-width:0;flex:none;margin-left:auto;height:36px!important;padding:0 30px 0 10px!important;font-size:16px!important;margin-right:10px;box-sizing:border-box;} .lg-scr{max-width:520px;} .lg-scrlab{font-size:12.5px;font-weight:800;color:#7c8b97;margin-top:16px;} .lg-scrurl{font-size:26px;font-weight:900;color:#12232f;letter-spacing:-.4px;margin-top:6px;word-break:break-all;} .lg-scrnote{font-size:12px;font-weight:600;color:#9aa8b4;margin-top:10px;} .lg-scrsteps{text-align:left;margin-top:20px;display:flex;flex-direction:column;gap:11px;width:100%;} .lg-scrsteps div{display:flex;gap:11px;align-items:flex-start;font-size:13.5px;font-weight:600;color:#43525c;line-height:1.5;} .lg-scrsteps b{flex:none;width:22px;height:22px;border-radius:50%;background:var(--ffp-blue);color:#fff;font-size:12px;display:flex;align-items:center;justify-content:center;}',
      '.lg-surfs{margin:12px 0 0 51px;position:relative;} .lg-surfs:before{content:"";position:absolute;left:-13px;top:2px;bottom:18px;width:1.5px;background:#e4edf3;} .lg-surf{display:flex;align-items:center;gap:10px;padding:10px 0;font-size:14px;font-weight:600;border-bottom:1px solid #f4f7f9;} .lg-surf .ms{color:var(--ffp-blue);font-size:18px;opacity:.85;} .lg-surf .x{color:#c0cad2;cursor:pointer;font-size:18px;} .lg-surf .x:hover{color:#d64545;} .lg-addsurf{margin:12px 0 0 51px;} .lg-btn.ghostb{color:var(--ffp-blue);border-color:#d4e6ef;background:#f5fafc;} .lg-maplink{display:inline-flex;align-items:center;gap:3px;color:var(--ffp-blue);font-weight:800;text-decoration:none;} .lg-maplink .ms{font-size:15px;vertical-align:-3px;}',
      '.lg-srow2{display:grid;grid-template-columns:1.2fr 1fr;gap:22px;align-items:start;padding:16px 4px;border-bottom:1px solid var(--ffp-border);} .lg-srow2 .s-match b{font-size:15px;font-weight:800;} .lg-srow2 .s-match small{display:block;font-size:11px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#9aa8b4;margin-top:3px;} .lg-srow2 .s-when{display:flex;gap:8px;margin-top:11px;} .lg-srow2 .s-when .lg-in{padding:8px 9px;font-size:13px;} .lg-srow2 .s-right{display:flex;flex-direction:column;gap:9px;} .lg-srow2 .fl{font-size:11px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#9aa8b4;} .lg-srow2 .st-f{padding:9px 10px;font-size:13px;}',
      '.lg-offlist{display:flex;flex-direction:column;gap:6px;} .lg-offtag{display:flex;align-items:center;gap:9px;font-size:13px;padding:7px 10px;border:1px solid var(--ffp-border-mid);border-radius:9px;background:#fbfcfd;} .lg-offtag .role{font-size:10px;font-weight:900;letter-spacing:.05em;text-transform:uppercase;color:var(--ffp-blue);} .lg-offtag .nm{font-weight:700;} .lg-offtag .sp{flex:1;} .lg-offtag .x{color:#c0cad2;cursor:pointer;font-size:16px;} .lg-assign{display:flex;gap:7px;align-items:center;} .lg-assign .lg-sel{padding:7px 9px;font-size:12.5px;flex:1;} .lg-btn.sm{padding:7px 11px;font-size:12px;} .lg-maed{background:#f7fafc;border:1px solid #e4edf3;border-radius:12px;padding:12px;margin-bottom:14px;} .lg-scpill{display:inline-block;font-size:9px;font-weight:900;letter-spacing:.05em;color:#0a8f5f;background:#e3f6ec;padding:2px 7px;border-radius:20px;vertical-align:middle;margin-left:6px;} .lg-scpill.inv{color:#8a6d00;background:#fff4d6;} .lg-scpill.txt{color:#5b6b75;background:#eef2f5;} .lg-ocap{max-width:180px;padding:7px 9px;font-size:12.5px;}',
      '.lg-sq{background:#f7fafc;border:1px solid #e4edf3;border-radius:12px;padding:12px 14px;margin:0 0 12px 46px;} .lg-sqsrch{display:flex;align-items:center;gap:8px;border:1.5px solid #d7dee5;background:#fff;border-radius:10px;padding:9px 12px;} .lg-sqsrch .ms{color:#9aa8b4;font-size:19px;} .lg-sqsrch input{border:none;outline:none;font:inherit;font-weight:600;font-size:13.5px;flex:1;background:none;} .lg-sqres{background:#fff;border:1px solid #eef2f5;border-radius:10px;margin-top:8px;padding:2px 12px;} .lg-sqres .row{display:flex;align-items:center;gap:10px;padding:8px 2px;border-bottom:1px solid #f2f5f7;} .lg-sqres .row:last-child{border-bottom:none;} .lg-sqres .av{width:32px;height:32px;border-radius:50%;background:#dfe7ec center/cover no-repeat;flex:none;} .lg-sqres .g{flex:1;min-width:0;} .lg-sqres .g b{font-size:13.5px;font-weight:800;display:block;} .lg-sqres .g span{font-size:11px;color:#8a99a6;font-weight:600;} .lg-sqadd2{display:flex;gap:8px;margin-top:8px;} .lg-sqlist{margin-top:8px;} .lg-sqrow{display:flex;align-items:center;gap:8px;padding:9px 2px;border-bottom:1px solid #f0f3f6;font-size:13.5px;font-weight:700;} .lg-sqrow:last-child{border-bottom:none;} .lg-sqrow .sp{flex:1;} .lg-sqrow .x{color:#c0cad2;cursor:pointer;font-size:17px;}',
      '.lg-per{display:flex;align-items:center;gap:10px;margin-bottom:14px;} .lg-per .sp{flex:1;} .lg-perchip{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:900;letter-spacing:.04em;text-transform:uppercase;padding:7px 12px;border-radius:20px;background:#eef2f5;color:#5b6b75;} .lg-perchip.live{background:#fdeaea;color:#d6353b;} .lg-perchip.live .d{width:7px;height:7px;border-radius:50%;background:#d6353b;} .lg-perchip.ht{background:#fff4d6;color:#8a6d00;} .lg-perchip.ft{background:#e3f6ec;color:#0a8f5f;} .lg-perset{display:flex;align-items:center;gap:10px;margin-bottom:14px;font-size:13px;font-weight:700;color:var(--ffp-text-muted);}',
      '.lg-trk{background:#f7fafc;border:1px solid #e4edf3;border-radius:12px;padding:14px 16px;margin-bottom:18px;} .lg-trk-clock{display:flex;align-items:center;gap:12px;margin-bottom:14px;} .lg-trk-clock .t{font-size:30px;font-weight:900;font-variant-numeric:tabular-nums;color:var(--ffp-text);} .lg-trk-clock .sp{flex:1;} .lg-trk-grp{margin-bottom:12px;} .lg-trk-lab{font-size:11px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#8a99a6;margin-bottom:6px;} .lg-trk-btns{display:flex;gap:10px;} .lg-trk-b{flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;border:1.5px solid #d7dee5;background:#fff;border-radius:10px;padding:11px 10px;font:inherit;font-size:13.5px;font-weight:800;color:var(--ffp-text);cursor:pointer;} .lg-trk-b span{font-size:12px;font-weight:900;color:#8a99a6;} .lg-trk-b.on{border-color:var(--ffp-blue);background:#eaf4fb;color:var(--ffp-blue);} .lg-trk-b.on span{color:var(--ffp-blue);} .lg-trk-apply{display:flex;align-items:center;gap:12px;margin-top:4px;flex-wrap:wrap;} .lg-trk-apply .sum{flex:1;font-size:12.5px;font-weight:700;color:var(--ffp-text-muted);min-width:180px;} .lg-livebtn{color:#d6353b;border-color:#f3c6c6;background:#fdeff0;}',
      /* match centre */
      '.lg-mcbtn{border:none;background:none;color:#9aa8b4;cursor:pointer;padding:4px;border-radius:8px;} .lg-mcbtn:hover{color:var(--ffp-blue);background:#f4f7f9;} .lg-mcbtn .ms{font-size:20px;} .tg-m .tg-macts{position:absolute;top:4px;right:4px;display:flex;gap:2px;} .tg-mcbtn{position:static;} .tg-m{position:relative;}',
      '.lg-mchd{display:flex;align-items:center;justify-content:center;gap:16px;padding:16px 4px;border-bottom:1px solid var(--ffp-border);} .lg-mchd .tm{display:flex;align-items:center;gap:9px;font-size:15px;font-weight:800;} .lg-mchd .tm.a{flex-direction:row-reverse;} .lg-mchd .scr{font-size:26px;font-weight:900;color:var(--ffp-text);min-width:80px;text-align:center;}',
      '.lg-mctabs{display:flex;gap:20px;border-bottom:1px solid var(--ffp-border);margin:8px 0 4px;} .lg-mctabs button{background:none;border:none;font:inherit;font-size:13.5px;font-weight:800;color:var(--ffp-text-muted);padding:11px 0;border-bottom:2.5px solid transparent;cursor:pointer;} .lg-mctabs button.on{color:var(--ffp-blue);border-bottom-color:var(--ffp-blue);}',
      '.lg-mcadd{display:flex;gap:8px;flex-wrap:wrap;align-items:center;padding:14px 2px;border-bottom:1px solid var(--ffp-border);} .lg-mcadd .lg-sel{width:auto;flex:1;min-width:120px;padding:8px 10px;font-size:13px;} .lg-mcadd .lg-in{padding:8px 10px;font-size:13px;}',
      '.lg-mcrow{display:flex;align-items:center;gap:10px;padding:11px 2px;border-bottom:1px solid #f0f3f6;font-size:13px;} .lg-mcrow .mn{width:34px;font-weight:800;color:#9aa8b4;} .lg-mcrow .kd{font-size:10px;font-weight:900;letter-spacing:.04em;padding:3px 8px;border-radius:6px;background:#eef2f5;color:#5b6b75;} .lg-mcrow .kd.try{background:#e3f0ff;color:#0b4a8f;} .lg-mcrow .kd.penalty,.lg-mcrow .kd.drop_goal{background:#fff1e3;color:#b45309;} .lg-mcrow .kd.yellow_card{background:#fff7d6;color:#8a6d00;} .lg-mcrow .kd.red_card{background:#ffe0e0;color:#a11111;} .lg-mcrow .pl{font-weight:700;} .lg-mcrow .tn{color:#8a99a6;font-weight:600;} .lg-mcrow .rs{margin-left:auto;font-weight:900;} .lg-mcrow .x{color:#c0cad2;cursor:pointer;font-size:17px;}',
      '.lg-mcfields{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px;margin-top:6px;} .lg-mcf{display:flex;flex-direction:column;gap:5px;} .lg-mcf label{font-size:12px;font-weight:800;color:#43525c;} .lg-mcf .lg-in{padding:9px 11px;}',
      '.lg-livebtn{color:#d6353b;border-color:#f3c6c6;background:#fdeff0;} .lg-mcstat.final{font-size:12px;font-weight:800;color:#5b6b75;background:#eef2f5;padding:8px 12px;border-radius:10px;}',
      '.lg-teamstat .hd{display:grid;grid-template-columns:1fr 1.4fr 1fr;align-items:center;padding:8px 2px 12px;border-bottom:1px solid var(--ffp-border);} .lg-teamstat .hd span{font-size:13px;font-weight:800;text-align:center;} .lg-teamstat .hd span:first-child{text-align:left;} .lg-teamstat .hd span:last-child{text-align:right;}',
      '.lg-tsrow{display:grid;grid-template-columns:1fr 1.4fr 1fr;align-items:center;gap:10px;padding:9px 2px;border-bottom:1px solid #f0f3f6;} .lg-tsrow .lab{text-align:center;font-size:12.5px;font-weight:700;color:#43525c;} .lg-tsrow .lg-in{padding:8px 10px;text-align:center;}'
    ].join('\n');
    document.head.appendChild(css);
  }
  function injectCss() { injectBaseCss(); injectExtraCss(); }

  async function loadSports() { if (S.sports) return S.sports; var r = await sb().from('lt_sport_schemas').select('key,name,icon,match_activities,player_fields,team_match_fields,scoring_kinds').eq('active', true).order('sort'); S.sports = r.data || []; return S.sports; }
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
  // A plain list to pick from, never free text. The current value is matched
  // ignoring case, and one that is not on the list is kept visible until changed.
  function selOpts(arr, cur, ph) {
    var c = String(cur || '').toLowerCase(), hit = false;
    var o = (arr || []).map(function (x) { var on = String(x).toLowerCase() === c; if (on) hit = true; return '<option value="' + esc(x) + '"' + (on ? ' selected' : '') + '>' + esc(x) + '</option>'; }).join('');
    return '<option value="">' + esc(ph || 'Select') + '</option>' + (cur && !hit ? '<option value="' + esc(cur) + '" selected>' + esc(cur) + '</option>' : '') + o;
  }
  function citiesOf(country) {
    var t = window.FFP_TAX || {}; var l = (t.cities && country) ? (t.cities[country] || t.cities[Object.keys(t.cities).find(function (k) { return k.toLowerCase() === String(country).toLowerCase(); })] || []) : [];
    return l.map(function (x) { return x && x.n ? x.n : x; });
  }
  function dlOpts(arr) { return (arr || []).map(function (x) { return '<option value="' + esc(x) + '">'; }).join(''); }
  function schemaForActivity(act) { var s = (S.sports || []).find(function (x) { return (x.match_activities || []).some(function (a) { return String(a).toLowerCase() === String(act || '').toLowerCase(); }); }); return s ? s.name : 'Generic points'; }
  function cityFill() {
    var c = (document.getElementById('tg-country') || {}).value, el = document.getElementById('tg-city'); if (!el) return;
    el.innerHTML = selOpts(citiesOf(c), '', c ? 'Select city' : 'Pick the country first');
  }
  function sportHint() { var a = (document.getElementById('tg-sport') || {}).value; var h = document.getElementById('tg-sporthint'); if (h) h.textContent = 'Stats set: ' + schemaForActivity(a); }

  async function renderList() {
    injectCss(); var el = root(); if (!el) return;
    var r; try { r = await sb().rpc('tourn_my_events'); } catch (e) { r = { error: e }; }
    var list = (r && r.data) || [];
    var cards = list.map(function (ev) {
      var cov = ev.cover_url || ev.logo_url;
      return '<div class="lg-card" onclick="FFPTourn.open(\'' + ev.id + '\')"><div class="lg-cover" style="' + (cov ? 'background-image:url(\'' + esc(cov) + '\')' : '') + '"><div class="scr"></div><div class="bd ' + esc(ev.status) + '">' + esc((ev.status || 'draft').toUpperCase()) + '</div></div><div class="lg-cbody"><b>' + esc(ev.name) + '</b><span>' + esc([ev.city, ev.sport].filter(Boolean).join(', ')) + '</span></div></div>';
    }).join('');
    var newCard = S.creating
      ? '<div class="lg-card" style="cursor:default"><div class="lg-cover"><div class="scr"></div></div><div class="lg-cbody"><input class="lg-in" id="tg-newname" placeholder="Tournament name" onkeydown="if(event.key===\'Enter\')FFPTourn.doCreate()"><div style="display:flex;gap:8px;margin-top:8px"><button class="lg-btn pri" onclick="FFPTourn.doCreate()">Create</button><button class="lg-btn ghost" onclick="FFPTourn.cancelCreate()">Cancel</button></div></div></div>'
      : '<div class="lg-new" onclick="FFPTourn.startCreate()">' + ic('add') + 'Create a tournament</div>';
    el.innerHTML = '<div class="lg-wrap"><div class="lg-head"><div><div class="lg-h1">Tournaments</div><div class="lg-sub">Groups + knockout bracket.</div></div></div><div class="lg-grid">' + cards + newCard + '</div></div>';
    if (S.creating) { var i = document.getElementById('tg-newname'); if (i) i.focus(); }
  }
  function startCreate() { S.creating = true; renderList(); }
  function cancelCreate() { S.creating = false; renderList(); }
  async function doCreate() {
    var nm = (document.getElementById('tg-newname') || {}).value; if (!nm || !nm.trim()) return;
    var r; try { r = await sb().rpc('tourn_event_save', { p_id: null, p: { name: nm.trim() } }); } catch (e) { r = { error: e }; }
    if (r.error) { toast('Could not create', 'error'); return; } S.creating = false; open(r.data);
  }
  async function open(id) {
    S.eventId = id; S.view = 'editor'; S.tab = 'details'; S.schedDiv = null; S.divEdit = null; S.entAdd = false; S.grpDraw = false; S.brkConfirm = false;
    var r; try { r = await sb().rpc('tourn_detail', { p_tourn: id }); } catch (e) { r = { error: e }; }
    S.detail = (r && r.data) || null;
    S.divId = (S.detail && S.detail.divisions && S.detail.divisions[0] && S.detail.divisions[0].id) || null;
    renderEditor();
  }
  function renderEditor() {
    injectCss(); var el = root(); if (!el || !S.detail) return;
    var ev = S.detail.event || {};
    el.innerHTML = '<div class="lg-wrap"><div class="lg-head"><div><div class="lg-h1">' + esc(ev.name) + '<span class="lg-pill ' + esc(ev.status) + '">' + esc((ev.status || 'draft').toUpperCase()) + '</span></div><div class="lg-sub">' + esc([ev.city, ev.sport_key].filter(Boolean).join(', ')) + '</div></div>'
      + '<button class="lg-btn" onclick="FFPTourn.back()">' + ic('arrow_back') + 'All tournaments</button></div>'
      + '<div class="lg-nav"><span class="tg-phase">Set up</span>' + tabBtn('details', 'Details') + tabBtn('divisions', 'Divisions') + tabBtn('entrants', 'Entrants') + tabBtn('venues', 'Venues') + tabBtn('officials', 'Officials')
      + '<span class="tg-navsep"></span><span class="tg-phase">Run</span>' + (ev.group_stage ? tabBtn('groups', 'Group stage') : '') + tabBtn('bracket', 'Knockout') + tabBtn('schedule', 'Schedule') + tabBtn('sponsors', 'Sponsors') + '</div><div id="tg-tab"></div></div>';
    renderTab();
  }
  function tabBtn(id, label) { return '<button class="' + (S.tab === id ? 'on' : '') + '" onclick="FFPTourn.tab(\'' + id + '\')">' + label + '</button>'; }
  function renderTab() {
    var host = document.getElementById('tg-tab'); if (!host) return;
    if (S.tab === 'details') return renderDetails(host);
    if (S.tab === 'divisions') return renderDivisions(host);
    if (S.tab === 'entrants') return renderEntrants(host);
    if (S.tab === 'groups') return renderGroups(host);
    if (S.tab === 'bracket') return renderBracket(host);
    if (S.tab === 'venues') return renderVenues(host);
    if (S.tab === 'officials') return renderOfficials(host);
    if (S.tab === 'schedule') return renderSchedule(host);
    if (S.tab === 'sponsors') return renderSponsors(host);
  }
  function renderSponsors(host) {
    if (window.FFPSponsors) window.FFPSponsors.render(host, { scope: 'tourn', eventId: S.eventId });
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
  var SCREEN_BASE = 'score.findfitpeople.com';   // the scoreboard address (Vercel, ffp-app)
  function screenPanel(code, court, permanent) {
    var url = SCREEN_BASE + '/' + code;
    var old = document.getElementById('tg-scr'); if (old) old.remove();
    var bk = document.createElement('div'); bk.id = 'tg-scr'; bk.className = 'lg-cfm';
    bk.innerHTML = '<div class="lg-cfm-in lg-scr">'
      + '<span class="ms lg-cfm-ic" style="color:var(--ffp-blue)">cast</span>'
      + '<div class="lg-cfm-t">Scoreboard, ' + esc(court) + '</div>'
      + '<div class="lg-scrlab">On the TV, open a browser and go to</div>'
      + '<div class="lg-scrurl" id="tg-scrurl">' + esc(url) + '</div>'
      + '<div class="lg-scrnote">' + (permanent ? 'This is the court\'s own screen. The code never changes, and it shows every match played on this court.' : 'This screen is for this event only.') + '</div>'
      + '<div class="lg-scrsteps">'
      +   '<div><b>1</b><span>Open the browser on the TV, or on a stick plugged into it.</span></div>'
      +   '<div><b>2</b><span>Type that address and leave it. The board keeps its own screen awake.</span></div>'
      +   '<div><b>3</b><span>Casting from a tablet instead? Tap the board, turn on 16:9, then full screen.</span></div>'
      + '</div>'
      + '<div class="lg-cfm-a"><button class="lg-btn ghost" id="tg-scr-x">Close</button>'
      +   '<button class="lg-btn pri" id="tg-scr-c">' + ic('content_copy') + 'Copy the address</button></div>'
      + '</div>';
    document.body.appendChild(bk);
    bk.querySelector('#tg-scr-x').onclick = function () { bk.remove(); };
    bk.querySelector('#tg-scr-c').onclick = function () { copyScreen('tg-scrurl'); };
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

  // ---------- STRUCTURE (visual format picker) ----------
  function renderStructure(host) {
    var ev = S.detail.event || {};
    if (!S.divId && (S.detail.divisions || []).length) S.divId = S.detail.divisions[0].id;
    var fmt = S.fmt || (ev.group_stage ? 'gk' : 'ko');
    S.fmt = fmt;
    var card = function (key, title, sub, svg) {
      return '<div class="tg-fmt' + (fmt === key ? ' on' : '') + '" onclick="FFPTourn.setFmt(\'' + key + '\')"><div class="dia">' + svg + '</div><b>' + title + '</b><span>' + sub + '</span></div>';
    };
    var grpSvg = '<svg width="56" height="60" viewBox="0 0 56 60" class="tgd"><rect x="2" y="4" width="52" height="12" rx="2"/><rect x="2" y="18" width="52" height="12" rx="2"/><rect x="2" y="32" width="52" height="12" rx="2"/><rect x="2" y="46" width="52" height="12" rx="2"/></svg>';
    var gkSvg = '<svg width="86" height="74" viewBox="0 0 86 74" class="tgd"><rect x="2" y="4" width="34" height="10"/><rect x="2" y="17" width="34" height="10"/><rect x="2" y="30" width="34" height="10"/><rect x="52" y="10" width="32" height="10"/><line x1="36" y1="9" x2="52" y2="15"/><line x1="36" y1="35" x2="52" y2="15"/><rect x="16" y="52" width="24" height="9"/><rect x="16" y="63" width="24" height="9"/><rect x="48" y="57" width="24" height="9"/><line x1="40" y1="56" x2="48" y2="61"/><line x1="40" y1="67" x2="48" y2="61"/></svg>';
    var koSvg = '<svg width="80" height="66" viewBox="0 0 80 66" class="tgd"><rect x="2" y="8" width="26" height="10"/><rect x="2" y="22" width="26" height="10"/><rect x="2" y="40" width="26" height="10"/><rect x="2" y="54" width="26" height="10"/><rect x="40" y="14" width="26" height="10"/><rect x="40" y="46" width="26" height="10"/><line x1="28" y1="13" x2="40" y2="19"/><line x1="28" y1="27" x2="40" y2="19"/><line x1="28" y1="45" x2="40" y2="51"/><line x1="28" y1="59" x2="40" y2="51"/></svg>';
    host.innerHTML =
      '<div class="lg-tool" style="margin-bottom:14px">' + (S.detail.divisions.length ? '<select class="lg-sel" onchange="FFPTourn.setDiv(this.value,\'structure\')">' + divOpts() + '</select>' : '<span class="lg-empty" style="padding:0">Add a division first.</span>') + '</div>'
      + '<div class="tg-fmts">' + card('grp', 'Group only', 'Round-robin, final table', grpSvg) + card('gk', 'Groups → Knockout', 'Top N advance to a bracket', gkSvg) + card('ko', 'Knockout only', 'Straight single elimination', koSvg) + '</div>'
      + '<div class="tg-fmtset">'
      + (fmt !== 'ko' ? '<div class="lg-2"><div class="lg-fld"><div class="lg-lab">Number of groups</div><input class="lg-in" id="tg-ng2" type="number" min="1" value="2"></div><div class="lg-fld"><div class="lg-lab">Advance per group</div><input class="lg-in" id="tg-adv2" type="number" min="1" value="' + (ev.groups_advance || 2) + '"></div></div>' : '')
      + '<div class="lg-fld" style="margin-top:6px"><div class="lg-lab">3rd-place play-off</div><div class="lg-seg" id="tg-third2"><button data-v="true" class="' + (ev.third_place ? 'on' : '') + '" onclick="FFPTourn.seg(this,\'tg-third2\')">Yes</button><button data-v="false" class="' + (!ev.third_place ? 'on' : '') + '" onclick="FFPTourn.seg(this,\'tg-third2\')">No</button></div></div>'
      + '<button class="lg-btn pri" style="margin-top:14px" onclick="FFPTourn.buildStructure()">' + ic('bolt') + 'Build structure</button>'
      + '<div class="lg-empty" style="text-align:left;padding:10px 0 0">' + (fmt === 'grp' ? 'Draws round-robin groups, ranked into a final table.' : fmt === 'ko' ? 'Draws a single-elimination bracket from your seeds.' : 'Draws groups, then the top entrants seed into a knockout bracket.') + '</div></div>';
  }
  function setFmt(k) { S.fmt = k; renderTab(); }
  async function buildStructure() {
    if (!S.divId) { toast('Pick a division', 'error'); return; }
    var fmt = S.fmt || 'ko'; var third = segVal('tg-third2') === 'true';
    try { await sb().rpc('tourn_event_save', { p_id: S.eventId, p: { group_stage: (fmt !== 'ko'), groups_advance: +((document.getElementById('tg-adv2') || {}).value || 2), third_place: third } }); } catch (e) {}
    if (fmt !== 'ko') {
      var ng = +((document.getElementById('tg-ng2') || {}).value) || 2;
      var g; try { g = await sb().rpc('tourn_groups_generate', { p_division: S.divId, p_num_groups: ng }); } catch (e) { g = { error: e }; }
      if (g.error) { toast('Could not draw groups', 'error'); return; }
      toast((g.data || 0) + ' group fixtures drawn', 'success'); S.tab = 'groups'; refreshDetail(); return;
    }
    var r; try { r = await sb().rpc('tourn_bracket_build', { p_division: S.divId }); } catch (e) { r = { error: e }; }
    if (r.error) { toast('Could not build bracket', 'error'); return; }
    toast('Bracket built', 'success'); S.tab = 'bracket'; refreshDetail();
  }

  // ---------- OFFICIALS ----------
  var CAPS = [['official', 'Match official'], ['scorer', 'Scorer only'], ['both', 'Match official + Scorer']];
  function capOpts(sel) { return CAPS.map(function (c) { return '<option value="' + c[0] + '"' + (c[0] === sel ? ' selected' : '') + '>' + c[1] + '</option>'; }).join(''); }
  function isScorerRole(r) { r = String(r || '').toLowerCase(); return r === 'scorer' || r === 'both'; }
  async function renderOfficials(host) {
    var capSel = '<select class="lg-sel" id="tg-ofcap" style="max-width:210px">' + capOpts('official') + '</select>';
    host.innerHTML = '<div class="lg-sub" style="margin-bottom:12px">Add each official to the pool and set what they can do. Their <b>match role</b> (referee, touch judge…) is set <b>per match</b> on the Schedule tab. <b>Only people with Scorer access</b> can enter scores from their FFP App — add their <b>FFP email</b> so their account links.</div>'
      + '<div class="lg-offadd"><div class="lg-offsrch"><input class="lg-in" id="tg-ofname" autocomplete="off" placeholder="Name — search FFP members, or type a new name" oninput="FFPTourn.ofSearch(this.value)"><div id="tg-ofres" class="lg-offres"></div></div>'
      + '<div class="lg-offrow"><input class="lg-in" id="tg-ofemail" placeholder="Or FFP email (for scorers)">' + capSel + '<button class="lg-btn pri" onclick="FFPTourn.addOfficial()">' + ic('add') + 'Add</button></div></div>'
      + '<div id="tg-oflist"><div class="lg-empty">Loading…</div></div>';
    var r; try { r = await sb().rpc('lt_officials_list', { p_scope: 'tourn', p_event: S.eventId }); } catch (e) { r = { error: e }; }
    var rows = (r && r.data) || []; var h2 = document.getElementById('tg-oflist');
    h2.innerHTML = rows.length ? rows.map(function (o) {
      var role = String(o.role || 'official').toLowerCase(); var sc = isScorerRole(role);
      var meta = sc
        ? (o.member_id ? 'Can score in the app' : (o.email ? esc(o.email) + ', needs an FFP account to score' : 'Add their FFP email to enable scoring'))
        : (o.member_id ? 'FFP linked' : (o.email ? esc(o.email) : 'Match official'));
      return '<div class="lg-row"><span class="lg-av" style="' + (o.photo ? 'background-image:url(\'' + esc(o.photo) + '\')' : '') + '">' + (o.photo ? '' : esc((o.name || '?').slice(0, 1))) + '</span><div class="g"><b>' + esc(o.name || o.email || 'Official') + (sc ? ' <span class="lg-scpill">SCORER</span>' : '') + '</b><span>' + meta + '</span></div><select class="lg-sel lg-ocap" onchange="FFPTourn.setOfficialCap(\'' + o.id + '\',this.value)">' + capOpts(role) + '</select><span class="ms act" onclick="FFPTourn.removeOfficial(\'' + o.id + '\')">close</span></div>';
    }).join('') : '<div class="lg-empty">No officials yet.</div>';
  }
  var _ofTmr;
  function ofSearch(q) {
    S._ofSel = null;
    clearTimeout(_ofTmr);
    if (!q || q.trim().length < 2) { S._ofRes = []; var el0 = document.getElementById('tg-ofres'); if (el0) el0.innerHTML = ''; return; }
    _ofTmr = setTimeout(async function () {
      var r; try { r = await sb().rpc('lt_member_search', { p_q: q.trim() }); } catch (e) { r = null; }
      S._ofRes = (r && r.data) || [];
      var el = document.getElementById('tg-ofres'); if (!el) return;
      el.innerHTML = S._ofRes.length ? S._ofRes.map(function (m) {
        return '<button type="button" class="lg-offopt" onclick="FFPTourn.ofPick(\'' + m.id + '\')"><span class="av" style="' + (m.photo ? 'background-image:url(\'' + esc(m.photo) + '\')' : '') + '"></span><span class="g"><b>' + esc(m.name) + '</b><span>' + esc([m.city, m.email_hint].filter(Boolean).join(', ')) + '</span></span><span class="pk">Select</span></button>';
      }).join('') : '<div class="lg-offnone">No FFP member found — you can still add this name, or use their email.</div>';
    }, 300);
  }
  function ofPick(id) {
    var m = (S._ofRes || []).find(function (x) { return x.id === id; }); if (!m) return;
    S._ofSel = { member_id: m.id, name: m.name };
    var nmI = document.getElementById('tg-ofname'); if (nmI) nmI.value = m.name;
    var el = document.getElementById('tg-ofres'); if (el) el.innerHTML = '<div class="lg-offpicked">' + ic('check') + esc(m.name) + ' — FFP member linked</div>';
  }
  async function addOfficial() {
    var sel = S._ofSel;
    var nm = (document.getElementById('tg-ofname') || {}).value, em = (document.getElementById('tg-ofemail') || {}).value, cap = (document.getElementById('tg-ofcap') || {}).value || 'official';
    if (sel && sel.member_id) {
      var r0; try { r0 = await sb().rpc('lt_official_add', { p_scope: 'tourn', p_event: S.eventId, p_member: sel.member_id, p_name: sel.name || nm, p_email: null, p_role: cap }); } catch (e) { r0 = { error: e }; }
      if (r0 && r0.error) { toast('Could not add', 'error'); return; }
      S._ofSel = null; S._ofRes = []; toast('Official added', 'success'); renderTab(); return;
    }
    if (!nm && !em) return;
    if (isScorerRole(cap) && !em) { toast('Scorer access needs their FFP email to link their account', 'error'); return; }
    var r; try { r = await sb().rpc('lt_official_add', { p_scope: 'tourn', p_event: S.eventId, p_member: null, p_name: nm, p_email: em, p_role: cap }); } catch (e) { r = { error: e }; }
    if (r.error) { toast('Could not add', 'error'); return; } toast('Added', 'success'); renderTab();
  }
  async function setOfficialCap(id, cap) { var r; try { r = await sb().rpc('lt_official_set_role', { p_id: id, p_role: cap }); } catch (e) { r = { error: e }; } if (r && r.error) { toast('Could not update', 'error'); return; } toast('Updated', 'success'); renderTab(); }
  async function removeOfficial(id) { await sb().rpc('lt_official_remove', { p_id: id }); renderTab(); }

  // ---------- VENUES ----------
  async function renderVenues(host) {
    host.innerHTML = '<div class="lg-tool"><div><div class="lg-h1" style="font-size:18px">Venues &amp; surfaces</div><div class="lg-sub">A venue can hold many courts, pitches or ovals</div></div><span class="sp"></span><button class="lg-btn pri" onclick="FFPTourn.addVenue()">' + ic('add') + 'Add venue</button></div>'
      + (S.venAdd ? venueEditor(null) : '') + '<div id="tg-venlist"><div class="lg-empty">Loading…</div></div>';
    var r; try { r = await sb().rpc('lt_venues_list', { p_scope: 'tourn', p_event: S.eventId }); } catch (e) { r = { error: e }; }
    var vs = (r && r.data) || []; var h2 = document.getElementById('tg-venlist');
    // The organiser's own venue courts (Partner > Courts & screens). A court
    // stood on one of them uses that court's permanent screen, so the TV on
    // the wall shows this event without being set up again.
    var mc; try { mc = await sb().rpc('vc_mine'); } catch (e) { mc = {}; }
    var mine = (mc && mc.data) || []; S._vcMine = mine;
    var provs = []; mine.forEach(function (c) { if (!provs.some(function (p) { return p.id === c.provider_id; })) provs.push({ id: c.provider_id, name: c.venue }); });
    var useBar = provs.length ? '<div class="lg-tool" style="margin-top:0">' + provs.map(function (p) {
        return '<button class="lg-btn" onclick="FFPTourn.useMyCourts(\'' + p.id + '\')">' + ic('connected_tv') + 'Add courts from ' + esc(p.name) + '</button>';
      }).join('') + '</div>' : '';
    if (useBar) h2.insertAdjacentHTML('beforebegin', '<div id="tg-vcbar">' + useBar + '</div>');
    if (!vs.length && !S.venAdd) { h2.innerHTML = '<div class="lg-empty">No venues yet. Add a venue, then its courts.</div>'; return; }
    h2.innerHTML = vs.map(function (v2) {
      if (S.venEdit === v2.id) return venueEditor(v2);
      var surfaces = (v2.surfaces || []).map(function (s) {
        var link = (S._vcMine || []).length
          ? '<select class="lg-sel lg-vclink" title="Which screen shows this court" onchange="FFPTourn.linkCourt(\'' + s.id + '\',this.value)">'
            + '<option value="">Event-only screen</option>'
            + S._vcMine.map(function (c) { var one = S._vcMine.every(function (x) { return x.provider_id === c.provider_id; }); return '<option value="' + c.id + '"' + (c.id === s.venue_court_id ? ' selected' : '') + '>' + esc(one ? c.name + ' screen' : c.name + ', ' + c.venue) + '</option>'; }).join('')
            + '</select>' : '';
        return '<div class="lg-surf"><span class="ms">sports_score</span>' + esc(s.name)
          + '<span class="sp"></span>' + link
          // The code a TV is set up with — see screenPanel().
          + (s.screen_code ? '<button class="lg-scrbtn' + (s.permanent ? ' perm' : '') + '" title="Scoreboard for this court" onclick="FFPTourn.screenPanel(\'' + esc(s.screen_code) + '\',\'' + esc(s.name) + '\',' + (s.permanent ? 'true' : 'false') + ')"><span class="ms">' + (s.permanent ? 'connected_tv' : 'cast') + '</span>' + esc(s.screen_code) + '</button>' : '')
          + '<span class="ms x" onclick="FFPTourn.removeSurface(\'' + s.id + '\')">delete</span></div>';
      }).join('');
      var vmeta = [v2.city, (v2.maps_url ? '<a class="lg-maplink" href="' + esc(v2.maps_url) + '" target="_blank" rel="noopener">' + ic('map') + 'Map</a>' : '')].filter(Boolean).join(', ');
      var addS = (S.surfAdd === v2.id)
        ? '<div class="lg-edit" style="margin-left:44px;border:none;padding-top:8px"><input class="lg-in" id="tg-sfname" placeholder="Court / pitch / oval name" style="max-width:260px" onkeydown="if(event.key===\'Enter\')FFPTourn.saveSurface(\'' + v2.id + '\')"><button class="lg-btn pri" onclick="FFPTourn.saveSurface(\'' + v2.id + '\')">' + ic('check') + 'Add</button><button class="lg-btn ghost" onclick="FFPTourn.cancelSurface()">Cancel</button></div>'
        : '<div class="lg-addsurf"><button class="lg-btn ghostb" onclick="FFPTourn.addSurface(\'' + v2.id + '\')">' + ic('add') + 'Add surface</button></div>';
      return '<div class="lg-venue"><div class="lg-vh"><span class="lg-vpin"><span class="ms">location_on</span></span><div class="g"><b>' + esc(v2.name) + '</b><span>' + vmeta + '</span></div><span class="ms act" onclick="FFPTourn.editVenue(\'' + v2.id + '\')">edit</span><span class="ms act" onclick="FFPTourn.removeVenue(\'' + v2.id + '\')">delete</span></div>'
        + (surfaces ? '<div class="lg-surfs">' + surfaces + '</div>' : '') + addS + '</div>';
    }).join('');
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
    if (r.error) { toast('Could not add the courts', 'error'); return; }
    toast(r.data ? (r.data + ' court' + (r.data === 1 ? '' : 's') + ' added, on their own screens') : 'All your courts are already here', 'success');
    renderTab();
  }
  async function linkCourt(fid, cid) {
    var r; try { r = await sb().rpc('lt_field_link', { p_field: fid, p_court: cid || null }); } catch (e) { r = { error: e }; }
    if (r.error) { toast('Could not change the screen', 'error'); return; }
    toast(cid ? 'Now on that court\'s screen' : 'Back to an event-only screen', 'success');
    renderTab();
  }
  function cancelSurface() { S.surfAdd = null; renderTab(); }
  async function saveSurface(vid) {
    var nm = v('tg-sfname'); if (!nm || !nm.trim()) return;
    var r; try { r = await sb().rpc('lt_field_save', { p_scope: 'tourn', p_event: S.eventId, p_id: null, p_name: nm.trim(), p_start: null, p_venue: vid }); } catch (e) { r = { error: e }; }
    if (r.error) { toast('Add failed', 'error'); return; } S.surfAdd = null; toast('Added', 'success'); renderTab();
  }
  async function removeSurface(id) { await sb().rpc('lt_field_remove', { p_id: id }); renderTab(); }

  // ---------- SCHEDULE ----------
  // ── SCHEDULE ────────────────────────────────────────────────────────────
  // Divisions run side by side across the courts, so the schedule opens on all
  // of them at once. Dates are set once, as Day 1, Day 2… and each match is
  // given a day, a time and a court.
  function evDays() {
    var ev = (S.detail && S.detail.event) || {};
    var st = ev.starts_at ? new Date(ev.starts_at + 'T00:00:00') : new Date();
    var en = ev.ends_at ? new Date(ev.ends_at + 'T00:00:00') : st;
    var n = Math.max(1, Math.round((en - st) / 86400000) + 1);
    var out = [];
    for (var i = 0; i < n; i++) { var d = new Date(st.getTime() + i * 86400000); out.push({ n: i + 1, date: ymd(d), d: d }); }
    return out;
  }
  function ymd(d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function dayOf(when) {
    if (!when) return 0;
    var k = ymd(new Date(when));
    var days = evDays();
    for (var i = 0; i < days.length; i++) if (days[i].date === k) return days[i].n;
    return 0;
  }
  function divColour(id) { var l = (S.detail.divisions || []).map(function (d) { return d.id; }); return 'tg-d' + (Math.max(0, l.indexOf(id)) % 6); }
  function divName(id) { var d = (S.detail.divisions || []).find(function (x) { return x.id === id; }); return d ? d.name : ''; }
  function daysRow() {
    var days = evDays();
    return '<div class="tg-days"><span class="lg-lab" style="margin:0">Days</span>'
      + days.map(function (d) { return '<span class="d"><b>DAY ' + d.n + '</b><input class="lg-in" type="date" value="' + d.date + '" onchange="FFPTourn.setDayDate(' + d.n + ',this.value)"></span>'; }).join('')
      + '<button class="lg-btn ghost" onclick="FFPTourn.addDay()">' + ic('add') + 'Add day</button>'
      + (days.length > 1 ? '<button class="lg-btn ghost" onclick="FFPTourn.removeDay()">' + ic('remove') + 'Remove last</button>' : '')
      + '</div>';
  }
  async function setDayDate(n, v) {
    if (!v) return;
    var days = evDays(); var base = new Date(v + 'T00:00:00');
    var starts = n === 1 ? v : ymd(new Date(base.getTime() - (n - 1) * 86400000));
    var ends = ymd(new Date(new Date(starts + 'T00:00:00').getTime() + (days.length - 1) * 86400000));
    await saveDays(starts, ends);
  }
  async function addDay() {
    var days = evDays(); var ev = S.detail.event || {};
    var ends = ymd(new Date(new Date(days[0].date + 'T00:00:00').getTime() + days.length * 86400000));
    await saveDays(ev.starts_at || days[0].date, ends);
  }
  async function removeDay() {
    var days = evDays(); if (days.length < 2) return;
    await saveDays(days[0].date, days[days.length - 2].date);
  }
  async function saveDays(starts, ends) {
    var r; try { r = await sb().rpc('tourn_event_save', { p_id: S.eventId, p: { starts_at: starts, ends_at: ends } }); } catch (e) { r = { error: e }; }
    if (r.error) { toast('Could not save the days', 'error'); return; }
    refreshDetail();
  }
  async function renderSchedule(host) {
    var divs = S.detail.divisions || [];
    if (!divs.length) { host.innerHTML = '<div class="lg-empty">Add a division first.</div>'; return; }
    if (!S.divId) S.divId = divs[0].id;
    if (!S.schedView) S.schedView = 'court';
    if (S.schedDiv == null) S.schedDiv = divs.length > 1 ? 'all' : divs[0].id;
    if (S.schedDay == null) S.schedDay = 1;
    var days = evDays();
    if (S.schedDay > days.length) S.schedDay = 1;
    var fr; try { fr = await sb().rpc('lt_fields_list', { p_scope: 'tourn', p_event: S.eventId }); } catch (e) { fr = { error: e }; }
    var fields = (fr && fr.data) || []; S._fields = fields;
    var viewSel = '<select class="lg-sel" style="width:auto;min-width:150px" onchange="FFPTourn.setSchedView(this.value)">'
      + [['court', 'By court'], ['division', 'By division'], ['time', 'By time']].map(function (v) { return '<option value="' + v[0] + '"' + (S.schedView === v[0] ? ' selected' : '') + '>' + v[1] + '</option>'; }).join('') + '</select>';
    var divSel = '<select class="lg-sel" style="width:auto;min-width:180px" onchange="FFPTourn.setSchedDiv(this.value)">'
      + (divs.length > 1 ? '<option value="all"' + (S.schedDiv === 'all' ? ' selected' : '') + '>All divisions</option>' : '')
      + divs.map(function (d) { return '<option value="' + d.id + '"' + (d.id === S.schedDiv ? ' selected' : '') + '>' + esc(d.name) + '</option>'; }).join('') + '</select>';
    var daySel = S.schedView === 'court'
      ? '<select class="lg-sel" style="width:auto;min-width:170px" onchange="FFPTourn.setSchedDay(this.value)">'
        + days.map(function (d) { return '<option value="' + d.n + '"' + (d.n === S.schedDay ? ' selected' : '') + '>Day ' + d.n + ', ' + fmtDay(d.d) + '</option>'; }).join('') + '</select>' : '';
    host.innerHTML = '<div class="lg-tool"><span class="lg-lab" style="margin:0">View</span>' + viewSel + divSel + daySel
      + '<span class="sp"></span><button class="lg-btn" onclick="FFPTourn.planSettings()">' + ic('tune') + 'Plan settings</button>'
      + (S.schedView === 'division' && S.schedDiv !== 'all' ? '<button class="lg-btn" onclick="FFPTourn.addMatch()">' + ic('add') + 'Add match</button>' : '')
      + '<button class="lg-btn pri" onclick="FFPTourn.autoplan()">' + ic('auto_awesome') + 'Auto-plan</button></div>'
      + daysRow() + (S.planOpen ? planHtml() : '')
      + (S.addMatch && S.schedDiv !== 'all' ? matchEditor() : '')
      + '<div id="tg-schedlist"><div class="lg-empty">Loading…</div></div>';
    var host2 = document.getElementById('tg-schedlist');
    if (!fields.length) { host2.innerHTML = '<div class="lg-empty">Add a venue and its courts on the <b>Venues</b> tab, then Auto-plan.</div>'; return; }

    var sdivs = S.schedDiv === 'all' ? divs : divs.filter(function (d) { return d.id === S.schedDiv; });
    var names = {};
    await Promise.all(sdivs.map(async function (d) {
      var nm = await entrantNames(d.id); Object.keys(nm).forEach(function (k) { names[k] = nm[k]; });
    }));
    if (S.schedDiv !== 'all') await loadEntrantsArr();
    var q = sb().from('tourn_matches').select('id,division_id,stage,group_label,round,play_round,draw,slot,status,home_entrant,away_entrant,scheduled_at,court,field_id').neq('status', 'void').neq('status', 'bye');
    q = S.schedDiv === 'all' ? q.eq('tourn_id', S.eventId) : q.eq('division_id', S.schedDiv);
    var mr; try { mr = await q.order('round').order('slot'); } catch (e) { mr = { error: e }; }
    var ms = (mr && mr.data) || [];
    ms.forEach(function (m) { m._names = names; m._day = dayOf(m.scheduled_at); });
    if (!ms.length) { host2.innerHTML = '<div class="lg-empty">No matches yet. Create the draw first, or add one by hand.</div>'; return; }

    var done = ms.filter(function (m) { return !!m.scheduled_at && !!m.field_id; }).length;
    var cov = '<div class="tg-cov"><span class="n">' + done + '</span><span class="t">of ' + ms.length + ' matches scheduled</span>'
      + '<span class="tg-meter"><i style="width:' + Math.round(done / ms.length * 100) + '%"></i></span>'
      + (done < ms.length ? '<span class="warn">' + (ms.length - done) + ' to place</span>' : '<span class="t" style="color:#1f9d57;font-weight:800">All placed</span>') + '</div>';
    var un = ms.filter(function (m) { return !m.scheduled_at || !m.field_id; });
    var unHtml = un.length ? '<div class="tg-unh">' + un.length + ' not scheduled</div>' + un.map(schedRow).join('') : '';

    if (S.schedView === 'court') {
      var day = days.find(function (d) { return d.n === S.schedDay; }) || days[0];
      var on = ms.filter(function (m) { return m._day === S.schedDay; });
      var times = [...new Set(on.map(function (m) { return new Date(m.scheduled_at).getTime(); }))].sort(function (a, b) { return a - b; });
      var cells = '<div class="th"></div>' + fields.map(function (f) { return '<div class="th">' + esc(f.name) + '</div>'; }).join('');
      times.forEach(function (t) {
        cells += '<div class="tm">' + fmtTime(new Date(t)) + '</div>';
        fields.forEach(function (f) {
          var m = on.find(function (x) { return x.field_id === f.id && new Date(x.scheduled_at).getTime() === t; });
          cells += '<div class="c">' + (m ? gridCell(m) : '') + '</div>';
        });
      });
      host2.innerHTML = cov + unHtml
        + (times.length ? '<div class="tg-grid" style="grid-template-columns:76px repeat(' + fields.length + ',1fr)">' + cells + '</div>'
                        : '<div class="lg-empty">Nothing on court on day ' + S.schedDay + ', ' + esc(fmtDay(day.d)) + ' yet.</div>');
      return;
    }
    if (S.schedView === 'division') {
      host2.innerHTML = cov + sdivs.map(function (d) {
        var list = ms.filter(function (m) { return m.division_id === d.id; })
          .sort(function (a, b) { return (a.scheduled_at ? Date.parse(a.scheduled_at) : Infinity) - (b.scheduled_at ? Date.parse(b.scheduled_at) : Infinity) || (a.round - b.round) || (a.slot - b.slot); });
        var ok = list.filter(function (m) { return m.scheduled_at && m.field_id; }).length;
        return '<div class="' + divColour(d.id) + '"><div class="tg-dh"><b>' + esc(d.name) + '</b>'
          + (list.length && ok === list.length ? '<span class="ok">' + ok + ' of ' + list.length + ' scheduled</span>' : '<span class="warn">' + ok + ' of ' + list.length + ' scheduled</span>')
          + '<span class="sp"></span><span class="lab" style="width:116px">Day</span><span class="lab" style="width:150px">Time</span><span class="lab" style="width:160px">Court</span></div>'
          + (list.length ? list.map(schedRow).join('') : '<div class="lg-empty">No matches in this division yet.</div>') + '</div>';
      }).join('');
      return;
    }
    // by time: one running order for the whole tournament, a day at a time
    var byDay = {}, order = [];
    ms.slice().sort(function (a, b) {
      var ta = a.scheduled_at ? Date.parse(a.scheduled_at) : Infinity, tb = b.scheduled_at ? Date.parse(b.scheduled_at) : Infinity;
      return (ta - tb) || String(a.court || '').localeCompare(String(b.court || ''), undefined, { numeric: true });
    }).forEach(function (m) {
      var k = m.scheduled_at ? ('Day ' + m._day + ', ' + fmtDay(new Date(m.scheduled_at))) : 'Not scheduled';
      if (!byDay[k]) { byDay[k] = []; order.push(k); } byDay[k].push(m);
    });
    host2.innerHTML = cov + order.map(function (k) {
      var dv2 = {}; byDay[k].forEach(function (m) { dv2[m.division_id] = 1; });
      return roundHead(k, byDay[k].length, Object.keys(dv2).length + (Object.keys(dv2).length === 1 ? ' division' : ' divisions'))
        + '<div class="lg-rbody">' + byDay[k].map(schedRow).join('') + '</div>';
    }).join('');
  }
  function matchTitle(m) {
    var names = m._names || {};
    var lbl = m.stage === 'group' ? ('Group ' + (m.group_label || '')) : stageLbl(m);
    return { t: (names[m.home_entrant] || 'TBD') + ' v ' + (names[m.away_entrant] || 'TBD'), s: lbl };
  }
  function gridCell(m) {
    var t = matchTitle(m);
    return '<div class="tg-gm ' + divColour(m.division_id) + '" onclick="FFPTourn.openMatch(\'' + m.id + '\')" title="' + esc(t.t) + '">'
      + '<u>' + esc(divName(m.division_id)) + '</u><b>' + esc(t.t) + '</b></div>';
  }
  // one match: which day, what time, which court
  function schedRow(m) {
    var t = matchTitle(m);
    var days = evDays();
    var tv = m.scheduled_at ? fmtTime(new Date(m.scheduled_at)) : '';
    var no = !m.scheduled_at || !m.field_id;
    return '<div class="tg-sr' + (no ? ' no' : '') + ' ' + divColour(m.division_id) + '" data-id="' + m.id + '">'
      + '<div class="m">' + (S.schedDiv === 'all' && S.schedView !== 'division' ? '<u>' + esc(divName(m.division_id)) + '</u>' : '')
      + '<b>' + esc(t.t) + '</b><small>' + esc(t.s) + '</small></div>'
      + '<select class="lg-sel st-day" onchange="FFPTourn.schedSet(\'' + m.id + '\')"><option value="">Day</option>'
      + days.map(function (d) { return '<option value="' + d.n + '"' + (m._day === d.n ? ' selected' : '') + '>Day ' + d.n + '</option>'; }).join('') + '</select>'
      + '<input class="lg-in st-t" type="time" value="' + tv + '" onchange="FFPTourn.schedSet(\'' + m.id + '\')">'
      + '<select class="lg-sel st-f" onchange="FFPTourn.schedSet(\'' + m.id + '\')">' + surfaceOpts(S._fields, m.field_id) + '</select></div>';
  }
  function planHtml() {
    return '<div class="lg-maed"><div class="lg-tool" style="margin:0">'
      + '<span class="lg-lab" style="margin:0">Match length</span><input class="lg-in" id="tg-mlen" type="number" value="' + (S.plan.len || 30) + '" style="width:76px;min-width:0;flex:none">'
      + '<span class="lg-lab" style="margin:0">Each day</span><input class="lg-in" id="tg-dstart" type="time" value="' + (S.plan.start || '09:00') + '" style="width:140px;min-width:0;flex:none">'
      + '<span class="lg-lab" style="margin:0">to</span><input class="lg-in" id="tg-dend" type="time" value="' + (S.plan.end || '21:00') + '" style="width:140px;min-width:0;flex:none">'
      + '<span class="lg-lab" style="margin:0">Between rounds</span><input class="lg-in" id="tg-rgap" type="number" min="0" value="' + (S.plan.gap || 0) + '" style="width:76px;min-width:0;flex:none">'
      + '<span class="lg-lab" style="margin:0">Player rest</span><input class="lg-in" id="tg-rest" type="number" min="0" value="' + (S.plan.rest != null ? S.plan.rest : 15) + '" style="width:76px;min-width:0;flex:none">'
      + '<span class="sp"></span><button class="lg-btn" onclick="FFPTourn.planSettings()">' + ic('check') + 'Done</button></div></div>';
  }
  function planSettings() {
    if (S.planOpen) {
      var g = function (k, d) { var el = document.getElementById(k); var v = el ? String(el.value || '').trim() : ''; return v || d; };
      S.plan = { len: +g('tg-mlen', '30'), start: g('tg-dstart', '09:00'), end: g('tg-dend', '21:00'), gap: +g('tg-rgap', '0'), rest: +g('tg-rest', '15') };
    }
    S.planOpen = !S.planOpen; renderTab();
  }
  function matchEditor() {
    return '<div class="lg-edit lg-maed"><select class="lg-sel" id="tg-mm-h" style="flex:1;min-width:150px">' + entOpts(null) + '</select>'
      + '<span style="font-weight:800;color:#8a99a6">v</span><select class="lg-sel" id="tg-mm-a" style="flex:1;min-width:150px">' + entOpts(null) + '</select>'
      + '<input class="lg-in" id="tg-mm-r" type="number" placeholder="Round" value="1" style="width:90px">'
      + '<button class="lg-btn pri" onclick="FFPTourn.saveMatch()">' + ic('check') + 'Add</button>'
      + '<button class="lg-btn ghost" onclick="FFPTourn.cancelMatch()">Cancel</button></div>';
  }
  function addMatch() { S.addMatch = true; renderTab(); }
  function cancelMatch() { S.addMatch = false; renderTab(); }
  async function saveMatch() {
    var h = (document.getElementById('tg-mm-h') || {}).value || null, a = (document.getElementById('tg-mm-a') || {}).value || null, rd = +((document.getElementById('tg-mm-r') || {}).value) || 1;
    if (!h || !a || h === a) { toast('Pick two different entrants', 'error'); return; }
    var r; try { r = await sb().rpc('lt_match_add', { p_scope: 'tourn', p_division: S.divId, p_round: rd, p_home: h, p_away: a, p_when: null, p_field: null, p_stage: 'bracket' }); } catch (e) { r = { error: e }; }
    if (r.error) { toast('Could not add', 'error'); return; } S.addMatch = false; toast('Match added', 'success'); renderTab();
  }
  // Plans the chosen divisions together across every court: the next free court
  // takes whichever match can start soonest, from any division.
  async function autoplan() {
    if (!S.divId) { toast('Add a division first', 'error'); return; }
    if (S.planOpen) planSettings();                 // take what is on screen first
    var tz = 'Asia/Dubai'; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || tz; } catch (e) {}
    var pl = S.plan || {};
    var args = { p_tourn: S.eventId, p_match_len: Math.max(5, pl.len || 30),
      p_day_start: pl.start || '09:00', p_day_end: pl.end || '21:00',
      p_days: evDays().length,
      p_round_gap: Math.max(0, pl.gap || 0), p_rest: Math.max(0, pl.rest != null ? pl.rest : 15),
      p_divisions: S.schedDiv === 'all' ? null : [S.schedDiv], p_tz: tz };
    var r; try { r = await sb().rpc('tourn_autoplan_all', args); } catch (e) { r = { error: e }; }
    if (r.error) { toast(/no_fields/.test(r.error.message || '') ? 'Add courts first (Venues tab)' : 'Could not plan', 'error'); return; }
    var d = r.data || {};
    toast(d.over ? (d.placed + ' matches planned, ' + d.over + ' run past the last day. Add a day or longer hours') : (d.placed + ' matches planned'), d.over ? 'error' : 'success');
    renderTab();
  }
  // a match is set by day and time, so dates are only ever typed once
  async function schedSet(id) {
    var row = document.querySelector('.tg-sr[data-id="' + id + '"]'); if (!row) return;
    var dn = +((row.querySelector('.st-day') || {}).value || 0);
    var tv = (row.querySelector('.st-t') || {}).value || '';
    var fid = (row.querySelector('.st-f') || {}).value || null;
    var days = evDays();
    var day = days.find(function (d) { return d.n === dn; }) || days[0];
    var when = (dn && tv) ? new Date(day.date + 'T' + tv + ':00').toISOString() : null;
    if ((dn && !tv) || (!dn && tv)) { toast('Pick both a day and a time', 'error'); return; }
    var r; try { r = await sb().rpc('lt_match_schedule', { p_scope: 'tourn', p_match: id, p_when: when, p_field: fid, p_court: null, p_official: null }); } catch (e) { r = { error: e }; }
    if (r && r.error) { toast('Could not reschedule', 'error'); return; }
    toast(when ? 'Day ' + dn + ', ' + tv : 'Taken off the schedule', 'success');
    renderTab();
  }
  async function offAdd(matchId) {
    var row = document.querySelector('.lg-srow2[data-id="' + matchId + '"]'); if (!row) return;
    var role = (row.querySelector('.a-role') || {}).value || null, off = (row.querySelector('.a-off') || {}).value || null;
    if (!off) { toast('Pick an official', 'error'); return; }
    var r; try { r = await sb().rpc('lt_match_official_add', { p_scope: 'tourn', p_match: matchId, p_official: off, p_role: role }); } catch (e) { r = { error: e }; }
    if (r.error) { toast('Could not assign', 'error'); return; } toast('Assigned', 'success'); renderTab();
  }
  async function offRemove(id) { await sb().rpc('lt_match_official_remove', { p_id: id }); renderTab(); }

  async function renderDetails(host) {
    var ev = S.detail.event || {}; await loadSports(); await taxReady();
    host.innerHTML =
      '<div class="lg-fld"><div class="lg-lab">Status</div><div class="lg-seg lg-status4" id="tg-status">' + statusSegBtns(ev.status, 'FFPTourn') + '</div></div>'
      + '<div class="lg-fld"><div class="lg-lab">Tournament name</div><input class="lg-in" id="tg-name" value="' + esc(ev.name) + '"></div>'
      + '<div class="lg-fld"><div class="lg-lab">Logo</div><div class="lg-logo" onclick="FFPTourn.pickImg(\'logo\')" style="' + (ev.logo_url ? 'background-image:url(\'' + esc(ev.logo_url) + '\')' : '') + '">' + (ev.logo_url ? '' : '<span class="ms">add_photo_alternate</span><span>Logo</span>') + '</div></div>'
      + '<div class="lg-fld"><div class="lg-lab">Banner (16:9, as shown in the app)</div><div class="lg-banner16" onclick="FFPTourn.pickImg(\'cover\')" style="' + (ev.cover_url ? 'background-image:url(\'' + esc(ev.cover_url) + '\')' : '') + '">' + (ev.cover_url ? '' : '<span class="ms">image</span><span>Add banner</span>') + '</div></div>'
      + '<div class="lg-2"><div class="lg-fld"><div class="lg-lab">Sport</div><select class="lg-sel" id="tg-sport" onchange="FFPTourn.sportHint()">' + selOpts(actNames(), ev.activity, 'Select sport') + '</select><div class="lg-lab" id="tg-sporthint" style="margin:6px 0 0;font-weight:700;color:#6a7c8a">Stats set: ' + esc(schemaForActivity(ev.activity)) + '</div></div>'
      + '<div class="lg-fld"><div class="lg-lab">Group stage first</div><div class="lg-seg" id="tg-gs"><button data-v="true" class="' + (ev.group_stage ? 'on' : '') + '" onclick="FFPTourn.seg(this,\'tg-gs\')">Yes</button><button data-v="false" class="' + (!ev.group_stage ? 'on' : '') + '" onclick="FFPTourn.seg(this,\'tg-gs\')">Straight knockout</button></div></div></div>'
      + '<div class="lg-2"><div class="lg-fld"><div class="lg-lab">Advance per group</div><input class="lg-in" id="tg-adv" type="number" value="' + (ev.groups_advance != null ? ev.groups_advance : 2) + '"></div>'
      + '<div class="lg-fld"><div class="lg-lab">Seeding</div><select class="lg-sel" id="tg-seed"><option value="seeded"' + (ev.seeding_mode !== 'random' ? ' selected' : '') + '>Seeded</option><option value="random"' + (ev.seeding_mode === 'random' ? ' selected' : '') + '>Random</option></select></div></div>'
      + '<div class="lg-2"><div class="lg-fld"><div class="lg-lab">Country</div><select class="lg-sel" id="tg-country" onchange="FFPTourn.cityFill()">' + selOpts(countryNames().sort(), ev.country, 'Select country') + '</select></div><div class="lg-fld"><div class="lg-lab">City</div><select class="lg-sel" id="tg-city">' + selOpts(citiesOf(ev.country), ev.city, ev.country ? 'Select city' : 'Pick the country first') + '</select></div></div>'
      + '<div class="lg-2"><div class="lg-fld"><div class="lg-lab">Starts</div><input class="lg-in" id="tg-start" type="date" value="' + esc(ev.starts_at || '') + '"></div><div class="lg-fld"><div class="lg-lab">Ends</div><input class="lg-in" id="tg-end" type="date" value="' + esc(ev.ends_at || '') + '"></div></div>'
      + '<div class="lg-fld"><div class="lg-lab">3rd-place play-off</div><div class="lg-seg" id="tg-third"><button data-v="true" class="' + (ev.third_place ? 'on' : '') + '" onclick="FFPTourn.seg(this,\'tg-third\')">Yes</button><button data-v="false" class="' + (!ev.third_place ? 'on' : '') + '" onclick="FFPTourn.seg(this,\'tg-third\')">No</button></div></div>'
      + '<div class="lg-fld"><div class="lg-lab">About</div><textarea class="lg-in" id="tg-desc" rows="3">' + esc(ev.description || '') + '</textarea></div>'
      + '<div class="lg-fld"><div class="lg-lab">Rules</div><textarea class="lg-in" id="tg-rules" rows="3">' + esc(ev.rules || '') + '</textarea></div>'
      + '<div class="lg-fld"><div class="lg-lab">Live stream URL <span style="font-weight:500;color:#8a99a8;">— the tournament\'s main channel (YouTube, Twitch, Facebook…)</span></div><input class="lg-in" id="tg-stream" value="' + esc(ev.stream_url || '') + '" placeholder="https://…"></div>'
      + '<button class="lg-btn pri" onclick="FFPTourn.saveDetails()">' + ic('check') + 'Save</button>';
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
  async function saveDetails() {
    var p = { name: v('tg-name'), activity: v('tg-sport'), group_stage: segVal('tg-gs') === 'true', groups_advance: +v('tg-adv'), seeding_mode: v('tg-seed'),
      city: v('tg-city'), country: v('tg-country'), starts_at: v('tg-start') || null, ends_at: v('tg-end') || null,
      third_place: segVal('tg-third') === 'true', status: segVal('tg-status') || 'draft', description: v('tg-desc'), rules: v('tg-rules') };
    var r; try { r = await sb().rpc('tourn_event_save', { p_id: S.eventId, p: p }); } catch (e) { r = { error: e }; }
    if (r.error) { var em = String(r.error.message || ''); toast(/not in the (activity|country|city) list/.test(em) ? em.charAt(0).toUpperCase() + em.slice(1) : 'Save failed', 'error'); return; }
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
    d = d || {}; var isTeam = (d.kind || 'team') !== 'individual';
    var gOpts = '<option value="">Open / any</option>' + genderNames().map(function (g) { return '<option' + (d.gender === g ? ' selected' : '') + '>' + esc(g) + '</option>'; }).join('');
    return '<div class="lg-edit"><input class="lg-in" id="tg-dvname" placeholder="Division name" value="' + esc(d.name || '') + '">'
      + '<div class="lg-seg" id="tg-dvkind"><button data-v="team" class="' + (isTeam ? 'on' : '') + '" onclick="FFPTourn.seg(this,\'tg-dvkind\')">Team / pair</button><button data-v="individual" class="' + (!isTeam ? 'on' : '') + '" onclick="FFPTourn.seg(this,\'tg-dvkind\')">Individual</button></div>'
      + '<select class="lg-sel" id="tg-dvgender" style="width:auto">' + gOpts + '</select>'
      + '<input class="lg-in" id="tg-dvmin" type="number" placeholder="Min age" value="' + (d.min_age != null ? d.min_age : '') + '" style="width:88px">'
      + '<input class="lg-in" id="tg-dvmax" type="number" placeholder="Max age" value="' + (d.max_age != null ? d.max_age : '') + '" style="width:88px">'
      + '<button class="lg-btn pri" onclick="FFPTourn.saveDivision(\'' + (d.id || '') + '\')">' + ic('check') + 'Save</button><button class="lg-btn ghost" onclick="FFPTourn.cancelDivision()">Cancel</button></div>';
  }
  function editDivision(id) { S.divEdit = id; renderTab(); }
  function cancelDivision() { S.divEdit = null; renderTab(); }
  async function saveDivision(id) {
    var nm = (document.getElementById('tg-dvname') || {}).value; if (!nm || !nm.trim()) { toast('Name required', 'error'); return; }
    var kind = segVal('tg-dvkind') || 'team';
    var p = { name: nm.trim(), kind: kind, team_size: kind === 'team' ? 2 : 1, gender: v('tg-dvgender') || 'any', min_age: v('tg-dvmin') || null, max_age: v('tg-dvmax') || null };
    var r; try { r = await sb().rpc('tourn_division_save', { p_tourn: S.eventId, p_id: id || null, p: p }); } catch (e) { r = { error: e }; }
    if (r.error) { toast('Save failed', 'error'); return; } S.divEdit = null; toast('Saved', 'success'); refreshDetail();
  }

  // ENTRANTS (inline)
  // ── ENTRANTS ────────────────────────────────────────────────────────────
  // Players come from FFP. Anyone not on FFP yet is entered with their own
  // details and links to their account when they join with the same email.
  function age(dob) { if (!dob) return ''; var d = new Date(dob); if (isNaN(d)) return ''; var t = new Date(); var a = t.getFullYear() - d.getFullYear(); var m = t.getMonth() - d.getMonth(); if (m < 0 || (m === 0 && t.getDate() < d.getDate())) a--; return a > 0 && a < 120 ? String(a) : ''; }
  function gShort(g) { return g ? String(g).charAt(0).toUpperCase() : ''; }
  function entAvatar(en, big) {
    var i = (en.name || '?').trim().charAt(0).toUpperCase();
    return en.logo ? '<span class="' + (big ? 'ph' : 'lg-av') + '" style="background-image:url(\'' + esc(en.logo) + '\')"></span>'
                   : '<span class="' + (big ? 'ph' : 'lg-av') + '">' + esc(i) + '</span>';
  }
  async function renderEntrants(host) {
    var divs = S.detail.divisions || [];
    if (!divs.length) { host.innerHTML = '<div class="lg-empty">Add a division first.</div>'; return; }
    if (!S.divId) S.divId = divs[0].id;
    var dv = divs.find(function (d) { return d.id === S.divId; }) || {};
    var indiv = dv.kind === 'individual';
    await taxReady(); if (indiv) await gradeNames();
    host.innerHTML = '<div class="lg-tool"><select class="lg-sel" onchange="FFPTourn.setDiv(this.value,\'entrants\')">' + divOpts() + '</select>'
      + '<span class="lg-sub" style="margin:0" id="tg-entcount"></span><span class="sp"></span>'
      + (indiv ? '<button class="lg-btn" onclick="FFPTourn.seedByGrade()" title="Seed 1 is the best grade">' + ic('format_list_numbered') + 'Seed by grade</button>' : '')
      + '<button class="lg-btn" onclick="FFPTourn.bulkAthletes()">' + ic('upload_file') + 'Bulk add</button>'
      + '<button class="lg-btn pri" onclick="FFPTourn.addEntrant()">' + ic('person_add') + (indiv ? 'Add player' : 'Add team') + '</button></div>'
      + (S.entAdd ? adderHtml(indiv) : '')
      + '<div id="tg-roster"><div class="lg-empty">Loading…</div></div>';
    var f = document.getElementById('tg-entq') || document.getElementById('tg-entname'); if (f) f.focus();
    var r; try { r = await sb().rpc('tourn_roster', { p_division: S.divId }); } catch (e) { r = { error: e }; }
    try { var sq = await sb().rpc('lt_squad_list', { p_scope: 'tourn', p_event: S.eventId }); S._squad = (sq && sq.data) || []; } catch (e) { S._squad = []; }
    try {
      var gm = await sb().from('tourn_matches').select('group_label').eq('division_id', S.divId);
      S._grpLabels = [...new Set(((gm && gm.data) || []).map(function (x) { return x.group_label; }).filter(Boolean))];
    } catch (e) { S._grpLabels = []; }
    var rows = (r && r.data) || []; S._roster = rows;
    var cnt = document.getElementById('tg-entcount'); if (cnt) cnt.textContent = rows.length + (rows.length === 1 ? ' entered' : ' entered');
    var host2 = document.getElementById('tg-roster');
    if (!rows.length) { host2.innerHTML = '<div class="lg-empty">Nobody entered yet. Members self-register in the app, or add them here.</div>'; return; }
    host2.innerHTML = '<div class="tg-et"><div class="tg-er hd"><span>Seed</span><span>' + (indiv ? 'Player' : 'Team') + '</span><span>Grade</span><span>Club</span><span>Nationality</span><span>Age</span><span>Contact</span><span>Status</span><span></span></div>'
      + rows.map(entRow).join('') + '</div>';
  }
  function entRow(en) {
    var open = S.entEdit === en.id;
    var isTeam = en.kind !== 'individual';
    var ct = en.on_ffp ? (en.email || en.phone || 'On FFP') : ('Not on FFP' + (en.email ? ', ' + en.email : ''));
    var a = age(en.dob);
    var row = '<div class="tg-er' + (open ? ' open' : '') + '" onclick="FFPTourn.editEntrant(\'' + en.id + '\')">'
      + '<span class="sd">' + (en.seed != null ? en.seed : '<span class="mut">–</span>') + '</span>'
      + '<span class="pl">' + entAvatar(en) + '<b>' + esc(en.name || 'Player') + '</b>' + (en.on_ffp ? '<span class="ms vf" title="FFP member">verified</span>' : '') + '</span>'
      + '<span class="cel">' + (en.grade ? '<span class="gr">' + esc(en.grade) + '</span>' : '<span class="mut">Not set</span>') + '</span>'
      + '<span class="cel">' + (en.club ? esc(en.club) : '<span class="mut">Add club</span>') + '</span>'
      + '<span class="cel">' + (en.nationality ? esc(en.nationality) : '<span class="mut">–</span>') + '</span>'
      + '<span class="cel">' + esc([gShort(en.gender), a].filter(Boolean).join(', ') || '–') + '</span>'
      + '<span class="cel">' + esc(ct) + '</span>'
      + '<span class="cel">' + esc(cap1(en.status)) + '</span>'
      + '<span class="ms mut">' + (open ? 'expand_less' : 'expand_more') + '</span></div>';
    if (open) row += entDetail(en, isTeam);
    if (open && isTeam && S.sqOpen === en.id) row += '<div class="lg-sq" id="lg-sq-' + en.id + '"><div class="lg-sqsrch">' + ic('search') + '<input id="lg-sqq-' + en.id + '" placeholder="Search FFP or type a name" value="' + esc((S._sqQ || {})[en.id] || '') + '" oninput="FFPTourn.sqSearch(\'' + en.id + '\',this.value)"></div><div id="lg-sqres-' + en.id + '">' + sqResHtml(en.id) + '</div></div>';
    return row;
  }
  function cap1(x) { x = String(x || ''); return x.charAt(0).toUpperCase() + x.slice(1); }
  function kv(k, v) { return '<span>' + esc(k) + '</span><b>' + (v ? esc(v) : '<span class="mut" style="color:#9aa8b4;font-weight:700">Not set</span>') + '</b>'; }
  // Their FFP profile is theirs: it is shown, not edited here. What the
  // organiser owns — division, seed, grade, club, notes — is on the right.
  function entDetail(en, isTeam) {
    var ffp = en.on_ffp;
    var rec = (S._entRec || {})[en.id];
    var profile = ffp
      ? '<div class="src">' + ic('verified') + 'From their FFP profile</div><div class="tg-kv">'
        + kv('Name', en.name) + kv('Email', en.email) + kv('Phone', en.phone) + kv('Gender', en.gender)
        + kv('Born', en.dob ? fmtDay(new Date(en.dob)) + ' ' + new Date(en.dob).getFullYear() + ', ' + age(en.dob) : '')
        + kv('Nationality', en.nationality) + kv('City', en.city)
        + kv('FFP record', rec ? (rec.played + ' matches, ' + rec.won + ' won, ' + rec.events + ' events') : 'Loading…')
        + '</div>'
      : '<div class="src" style="color:#b07800">' + ic('person') + 'Not on FFP yet</div><div class="tg-fg">'
        + '<label><span class="lg-lab">First name</span><input class="lg-in" id="tg-ee-first" value="' + esc(en.first_name || '') + '"></label>'
        + '<label><span class="lg-lab">Surname</span><input class="lg-in" id="tg-ee-last" value="' + esc(en.surname || '') + '"></label>'
        + '<label><span class="lg-lab">Email</span><input class="lg-in" id="tg-ee-email" value="' + esc(en.email || '') + '"></label>'
        + '<label><span class="lg-lab">Phone</span><input class="lg-in" id="tg-ee-phone" value="' + esc(en.phone || '') + '"></label>'
        + '<label><span class="lg-lab">Gender</span><select class="lg-sel" id="tg-ee-gender">' + selOpts(genderNames(), en.gender, 'Not set') + '</select></label>'
        + '<label><span class="lg-lab">Date of birth</span><input class="lg-in" id="tg-ee-dob" type="date" value="' + esc(en.dob || '') + '"></label>'
        + '<label class="full"><span class="lg-lab">Nationality</span><select class="lg-sel" id="tg-ee-nat">' + selOpts(natNames(), en.nationality, 'Not set') + '</select></label>'
        + '</div>';
    var gl = groupLabels();
    var fields = '<div class="lg-lab" style="margin-bottom:10px">In this tournament</div><div class="tg-fg">'
      + (isTeam ? '<label class="full"><span class="lg-lab">Team name</span><input class="lg-in" id="tg-ee-name" value="' + esc(en.team_name || en.name || '') + '"></label>' : '')
      + '<label><span class="lg-lab">Division</span><select class="lg-sel" id="tg-ee-div">' + (S.detail.divisions || []).map(function (d) { return '<option value="' + d.id + '"' + (d.id === S.divId ? ' selected' : '') + '>' + esc(d.name) + '</option>'; }).join('') + '</select></label>'
      + '<label><span class="lg-lab">Status</span><select class="lg-sel" id="tg-ee-status">' + ENT_STATUS.map(function (x) { return '<option value="' + x[0] + '"' + (x[0] === en.status ? ' selected' : '') + '>' + x[1] + '</option>'; }).join('') + '</select></label>'
      + (isTeam ? '' : '<label><span class="lg-lab">Grade</span><select class="lg-sel" id="tg-ee-grade">' + selOpts(_grades || [], en.grade, 'Not set') + '</select></label>')
      + '<label><span class="lg-lab">Seed</span><input class="lg-in" id="tg-ee-seed" type="number" min="1" value="' + (en.seed == null ? '' : en.seed) + '"></label>'
      + (gl.length ? '<label><span class="lg-lab">Group</span><select class="lg-sel" id="tg-ee-group"><option value="">None</option>' + gl.map(function (g) { return '<option value="' + esc(g) + '"' + (g === en.group_label ? ' selected' : '') + '>' + esc(g) + '</option>'; }).join('') + '</select></label>' : '')
      + '<label class="full"><span class="lg-lab">Club</span><input class="lg-in" id="tg-ee-club" value="' + esc(en.club || '') + '" placeholder="Their club or gym"></label>'
      + '<label class="full"><span class="lg-lab">Notes</span><input class="lg-in" id="tg-ee-notes" value="' + esc(en.notes || '') + '" placeholder="Anything the organiser needs to know"></label>'
      + '</div>';
    var acts = S.entDel === en.id
      ? '<div class="acts"><span class="lg-lab" style="margin:0">Remove ' + esc(en.name) + ' from the tournament?</span><span class="sp"></span>'
        + '<button class="lg-btn" onclick="FFPTourn.cancelRemoveEntrant()">Keep them</button>'
        + '<button class="lg-btn danger solid" onclick="FFPTourn.removeEntrant()">' + ic('delete_forever') + 'Remove</button></div>'
      : '<div class="acts"><button class="lg-btn pri" onclick="FFPTourn.saveEntrantEdit()">' + ic('check') + 'Save</button>'
        + '<button class="lg-btn ghost" onclick="FFPTourn.cancelEntrantEdit()">Cancel</button>'
        + (isTeam ? '<button class="lg-btn" onclick="FFPTourn.sqToggle(\'' + en.id + '\')">' + ic('groups') + 'Squad (' + squadFor(en.id).length + ')</button>' : '')
        + '<span class="sp"></span><button class="lg-btn ghost danger" onclick="FFPTourn.askRemoveEntrant()">' + ic('delete') + 'Remove</button></div>';
    return '<div class="tg-dt" onclick="event.stopPropagation()">'
      + '<div>' + entAvatar(en, true) + (isTeam ? '<div style="margin-top:10px"><button class="lg-btn sm" onclick="FFPTourn.entLogo(\'' + en.id + '\')">' + ic('add_photo_alternate') + 'Logo</button></div>' : '') + '</div>'
      + '<div>' + profile + '</div><div>' + fields + '</div>' + acts + '<div class="msg" id="tg-ee-msg"></div></div>';
  }
  function natNames() { return ((window.FFP_TAX && window.FFP_TAX.nationalities) || []).map(function (x) { return x && x.n ? x.n : x; }); }
  // ── ADDING PLAYERS ──────────────────────────────────────────────────────
  function adderHtml(indiv) {
    if (!indiv) return '<div class="lg-edit"><input class="lg-in" id="tg-entname" placeholder="Team name" onkeydown="if(event.key===\'Enter\')FFPTourn.saveEntrant()"><button class="lg-btn pri" onclick="FFPTourn.saveEntrant()">' + ic('check') + 'Add</button><button class="lg-btn ghost" onclick="FFPTourn.cancelEntrant()">Cancel</button></div>';
    return '<div class="tg-ea"><div class="bar"><input class="lg-in" id="tg-entq" autocomplete="off" placeholder="Search FFP members by name or email" oninput="FFPTourn.entSearch(this.value)">'
      + '<select class="lg-sel" id="tg-entgrade" title="Grade, used for seeding">' + selOpts(_grades || [], '', 'Grade') + '</select>'
      + '<button class="lg-btn ghost" onclick="FFPTourn.cancelEntrant()">Close</button></div><div class="res" id="tg-entres"></div>'
      + (S.entManual ? manualHtml() : '<div class="tg-or">Not on FFP yet? <b onclick="FFPTourn.entManual(true)">Add their details</b></div>') + '</div>';
  }
  function manualHtml() {
    return '<div class="tg-or">Not on FFP yet. They link to their account when they join with the same email.</div><div class="tg-af">'
      + '<label><span class="lg-lab">First name</span><input class="lg-in" id="tg-mf-first"></label>'
      + '<label><span class="lg-lab">Surname</span><input class="lg-in" id="tg-mf-last"></label>'
      + '<label><span class="lg-lab">Email</span><input class="lg-in" id="tg-mf-email" placeholder="Links their account later"></label>'
      + '<label><span class="lg-lab">Phone</span><input class="lg-in" id="tg-mf-phone"></label>'
      + '<label><span class="lg-lab">Gender</span><select class="lg-sel" id="tg-mf-gender">' + selOpts(genderNames(), '', 'Not set') + '</select></label>'
      + '<label><span class="lg-lab">Date of birth</span><input class="lg-in" id="tg-mf-dob" type="date"></label>'
      + '<label><span class="lg-lab">Nationality</span><select class="lg-sel" id="tg-mf-nat">' + selOpts(natNames(), '', 'Not set') + '</select></label>'
      + '<label><span class="lg-lab">Club</span><input class="lg-in" id="tg-mf-club"></label>'
      + '<label><span class="lg-lab">Grade</span><select class="lg-sel" id="tg-mf-grade">' + selOpts(_grades || [], '', 'Not set') + '</select></label>'
      + '<label><span class="lg-lab">Seed</span><input class="lg-in" id="tg-mf-seed" type="number" min="1" placeholder="Auto"></label>'
      + '<label class="w2"><span class="lg-lab">Notes</span><input class="lg-in" id="tg-mf-notes" placeholder="Optional"></label>'
      + '</div><div class="acts" style="display:flex;gap:10px;margin-top:14px"><button class="lg-btn pri" onclick="FFPTourn.saveManual()">' + ic('person_add') + 'Add player</button>'
      + '<button class="lg-btn ghost" onclick="FFPTourn.entManual(false)">Cancel</button></div>';
  }
  // ---------- EDIT ONE ENTRANT ----------
  // An individual entrant is a member's own record, so their name and
  // nationality come from their FFP profile and are not the organiser's to
  // rewrite here — only the division, seed, group and status are.
  var ENT_STATUS = [['registered', 'Registered'], ['pending', 'Pending'], ['withdrawn', 'Withdrawn']];

  // Group labels come from the draw, so the choices are the groups this division
  // actually has. Before a draw there is nothing to pick and the field is hidden
  // rather than shown empty.
  function groupLabels() {
    var seen = {};
    (S._roster || []).forEach(function (x) { if (x.group_label) seen[x.group_label] = 1; });
    (S._grpLabels || []).forEach(function (g) { if (g) seen[g] = 1; });
    return Object.keys(seen).sort();
  }

  // Clicking the row opens their details; clicking it again closes them.
  function editEntrant(id) {
    if (S.entEdit === id) { S.entEdit = null; S.entDel = null; renderTab(); return; }
    S.entEdit = id; S.entDel = null; S.sqOpen = null;
    renderTab();
    var en = (S._roster || []).find(function (x) { return x.id === id; });
    if (en && en.on_ffp && !((S._entRec || {})[id])) {
      sb().rpc('tourn_entrant_record', { p_id: id }).then(function (r) {
        S._entRec = S._entRec || {}; S._entRec[id] = (r && r.data) || { played: 0, won: 0, events: 0 };
        if (S.entEdit === id) renderTab();
      });
    }
    if (!_grades) gradeNames().then(function () { if (S.entEdit === id) renderTab(); });
  }
  function cancelEntrantEdit() { S.entEdit = null; S.entDel = null; renderTab(); }
  function askRemoveEntrant() { S.entDel = S.entEdit; renderTab(); }
  function cancelRemoveEntrant() { S.entDel = null; renderTab(); }

  async function saveEntrantEdit() {
    var id = S.entEdit; if (!id) return;
    var en = (S._roster || []).find(function (x) { return x.id === id; }) || {};
    var g = function (k) { var el = document.getElementById(k); return el ? String(el.value || '').trim() : ''; };
    var msg = document.getElementById('tg-ee-msg');
    var patch = { division_id: g('tg-ee-div'), seed: g('tg-ee-seed'), status: g('tg-ee-status'),
                  club: g('tg-ee-club'), notes: g('tg-ee-notes') };
    if (document.getElementById('tg-ee-grade')) patch.grade = g('tg-ee-grade');
    if (document.getElementById('tg-ee-group')) patch.group_label = g('tg-ee-group');
    // their own details, for a player who is not on FFP
    if (document.getElementById('tg-ee-first')) {
      patch.first_name = g('tg-ee-first'); patch.surname = g('tg-ee-last');
      patch.invite_email = g('tg-ee-email'); patch.phone = g('tg-ee-phone');
      patch.gender = g('tg-ee-gender'); patch.date_of_birth = g('tg-ee-dob'); patch.nationality = g('tg-ee-nat');
    }
    if (en.kind !== 'individual') {
      var nm = g('tg-ee-name');
      if (!nm) { if (msg) msg.textContent = 'The team needs a name'; return; }
      patch.team_name = nm;
    }
    var r; try { r = await sb().rpc('tourn_entrant_update', { p_id: id, p: patch }); } catch (e) { r = { error: e }; }
    if (r.error) { var em = String(r.error.message || ''); if (msg) msg.textContent = /not in the (gender|nationality|player_grade|grade)/.test(em) ? cap1(em) : 'Could not save'; return; }
    // A team already drawn in cannot be moved or regrouped without redoing the
    // fixtures, so say what is in the way instead of failing quietly.
    if (r.data && r.data.ok === false) {
      if (msg) {
        msg.textContent = r.data.reason === 'has_group_matches'
          ? 'Already drawn into ' + r.data.matches + ' group matches. Redraw the groups to change this.'
          : 'Already in ' + r.data.matches + ' matches in this division. Clear them first to move the team.';
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
    if (res.length) out += '<div class="lg-sqres">' + res.map(function (r) {
      return '<div class="row"><span class="av" style="' + (r.photo ? 'background-image:url(\'' + esc(r.photo) + '\')' : '') + '"></span><div class="g"><b>' + esc(r.name) + '</b><span>' + esc([r.city, r.email_hint].filter(Boolean).join(', ')) + '</span></div><button class="lg-btn sm pri" onclick="FFPTourn.sqAddMember(\'' + entId + '\',\'' + r.id + '\')">Add</button></div>';
    }).join('') + '</div>';
    else if (q.trim().length >= 2) out += '<div class="lg-sqadd2"><button class="lg-btn sm" onclick="FFPTourn.sqInvite(\'' + entId + '\')">' + ic('mail') + 'Invite by email</button><button class="lg-btn sm" onclick="FFPTourn.sqNameOnly(\'' + entId + '\')">' + ic('edit') + 'Add name only</button></div>';
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
  async function _sqReload(id) { try { var sq = await sb().rpc('lt_squad_list', { p_scope: 'tourn', p_event: S.eventId }); S._squad = (sq && sq.data) || []; } catch (e) {} S._sqQ = S._sqQ || {}; S._sqQ[id] = ''; S._sqRes = S._sqRes || {}; S._sqRes[id] = []; var inp = document.getElementById('lg-sqq-' + id); if (inp) inp.value = ''; paintSqRes(id); renderEntrants(root()); }
  async function sqAddMember(id, memberId) { try { await sb().rpc('lt_squad_add_member', { p_scope: 'tourn', p_event: S.eventId, p_entrant: id, p_member: memberId }); } catch (e) { toast('Could not add', 'error'); return; } _sqReload(id); }
  async function sqNameOnly(id) { var nm = ((S._sqQ || {})[id] || '').trim(); if (!nm) return; try { await sb().rpc('lt_squad_add', { p_scope: 'tourn', p_event: S.eventId, p_entrant: id, p_name: nm }); } catch (e) { toast('Could not add', 'error'); return; } _sqReload(id); }
  async function sqInvite(id) { var txt = ((S._sqQ || {})[id] || '').trim(); var em = txt.indexOf('@') > -1 ? txt : prompt('Their FFP email (we\'ll link their account)'); if (!em || em.indexOf('@') < 0) return; var nm = txt.indexOf('@') > -1 ? '' : txt; try { await sb().rpc('lt_squad_invite', { p_scope: 'tourn', p_event: S.eventId, p_entrant: id, p_name: nm, p_email: em }); } catch (e) { toast('Could not invite', 'error'); return; } try { var rf = (window.FFPAuth && FFPAuth.getRefresh && FFPAuth.getRefresh()) || null; if (rf) { var r = await fetch('https://ffp-passport-backend.vercel.app/api/lt/squad-invite', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh: rf, scope: 'tourn', event_id: S.eventId, name: nm, email: em }) }); var jd = await r.json().catch(function () { return {}; }); toast(jd && jd.linked ? 'Member linked' : 'Invited — email sent', 'check'); } } catch (e) { /* email best-effort */ } _sqReload(id); }
  async function sqRemove(sqid) { try { await sb().rpc('lt_squad_remove', { p_id: sqid }); } catch (e) { return; } if (S.sqOpen) _sqReload(S.sqOpen); }
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
  var _entTmr;
  function entSearch(q) {
    clearTimeout(_entTmr);
    var el = document.getElementById('tg-entres'); if (!el) return;
    q = (q || '').trim();
    if (q.length < 2) { el.innerHTML = ''; return; }
    _entTmr = setTimeout(async function () {
      var r; try { r = await sb().rpc('lt_member_search', { p_q: q }); } catch (e) { r = null; }
      var res = (r && r.data) || [];
      var inIds = {}; (S._roster || []).forEach(function (x) { if (x.member_id && x.status !== 'withdrawn') inIds[x.member_id] = 1; });
      var html = res.map(function (m) {
        var av = m.photo ? '<span class="av" style="background-image:url(\'' + esc(m.photo) + '\')"></span>' : '<span class="av">' + esc((m.name || '?').slice(0, 1)) + '</span>';
        return '<div class="opt">' + av + '<span class="g"><b>' + esc(m.name) + '</b><span>' + esc([m.city, m.email_hint].filter(Boolean).join(', ')) + '</span></span>'
          + (inIds[m.id] ? '<span class="in">Entered</span>' : '<button class="lg-btn pri sm" onclick="FFPTourn.entPick(\'' + m.id + '\')">' + ic('add') + 'Add</button>') + '</div>';
      }).join('');
      var isEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(q);
      if (!res.length) html = '<div class="none">' + (isEmail ? 'No FFP account with that email yet.' : 'No FFP member found. Type their email to invite them.') + '</div>';
      if (isEmail && !res.length) html += '<div class="opt"><span class="av">' + ic('mail') + '</span><span class="g"><b>' + esc(q) + '</b><span>Linked when they join findfitpeople.com with this email</span></span><button class="lg-btn sm" onclick="FFPTourn.entInvite()">' + ic('send') + 'Invite</button></div>';
      if ((document.getElementById('tg-entq') || {}).value.trim() === q) el.innerHTML = html;
    }, 280);
  }
  async function entPick(memberId) {
    var grade = (document.getElementById('tg-entgrade') || {}).value || '';
    var r; try { r = await sb().rpc('tourn_entrant_add', { p_tourn: S.eventId, p_division: S.divId, p: { kind: 'individual', member_id: memberId, grade: grade } }); } catch (e) { r = { error: e }; }
    if (r.error) { toast(/already_entered/.test(r.error.message || '') ? 'Already in this division' : 'Could not add', 'error'); return; }
    toast('Added', 'success'); await _entReload();
  }
  async function entInvite() {
    var q = ((document.getElementById('tg-entq') || {}).value || '').trim(); if (!q) return;
    var grade = (document.getElementById('tg-entgrade') || {}).value || '';
    var r; try { r = await sb().rpc('tourn_entrant_add', { p_tourn: S.eventId, p_division: S.divId, p: { kind: 'individual', invite_email: q, status: 'invited', grade: grade } }); } catch (e) { r = { error: e }; }
    if (r.error) { toast(/already_entered/.test(r.error.message || '') ? 'Already invited' : 'Could not invite', 'error'); return; }
    toast('Added. Linked when they join FFP with that email', 'success'); await _entReload();
  }
  // keep the search open and the grade picked, so a whole division goes in quickly
  async function _entReload() {
    var q = document.getElementById('tg-entq'), g = document.getElementById('tg-entgrade');
    var qv = q ? q.value : '', gv = g ? g.value : '';
    await renderEntrants(document.getElementById('tg-tab'));
    var q2 = document.getElementById('tg-entq'), g2 = document.getElementById('tg-entgrade');
    if (g2) g2.value = gv;
    if (q2) { q2.value = qv; q2.focus(); q2.select(); entSearch(qv); }
  }
  function entManual(on) { S.entManual = !!on; renderTab(); }
  async function saveManual() {
    var g = function (k) { var el = document.getElementById(k); return el ? String(el.value || '').trim() : ''; };
    var first = g('tg-mf-first'), last = g('tg-mf-last'), em = g('tg-mf-email');
    if (!first && !last) { toast('Give them a name', 'error'); return; }
    var p = { kind: 'individual', first_name: first, surname: last, invite_email: em, phone: g('tg-mf-phone'),
      gender: g('tg-mf-gender'), date_of_birth: g('tg-mf-dob'), nationality: g('tg-mf-nat'),
      club: g('tg-mf-club'), grade: g('tg-mf-grade'), seed: g('tg-mf-seed'), notes: g('tg-mf-notes'),
      status: em ? 'invited' : 'registered' };
    var r; try { r = await sb().rpc('tourn_entrant_add', { p_tourn: S.eventId, p_division: S.divId, p: p }); } catch (e) { r = { error: e }; }
    if (r.error) {
      var e2 = String(r.error.message || '');
      toast(/already_entered/.test(e2) ? 'Already in this division' : (/not in the (gender|nationality)/.test(e2) ? cap1(e2) : 'Could not add'), 'error');
      return;
    }
    toast(em ? 'Added. Linked when they join FFP with that email' : 'Added', 'success');
    S.entManual = false; renderTab();
  }
  async function seedByGrade() {
    var r; try { r = await sb().rpc('tourn_seed_by_grade', { p_division: S.divId }); } catch (e) { r = { error: e }; }
    if (r.error) { toast('Could not seed', 'error'); return; }
    toast('Seeded ' + (r.data || 0) + ' players by grade', 'success'); renderTab();
  }
  async function saveEntrant() {
    var nm = (document.getElementById('tg-entname') || {}).value; if (!nm || !nm.trim()) return;
    var kind = (S.detail.divisions.find(function (d) { return d.id === S.divId; }) || {}).kind || 'team';
    var r; try { r = await sb().rpc('tourn_entrant_add', { p_tourn: S.eventId, p_division: S.divId, p: { team_name: nm.trim(), kind: kind } }); } catch (e) { r = { error: e }; }
    if (r.error) { toast('Add failed', 'error'); return; } S.entAdd = false; toast('Added', 'success'); refreshDetail();
  }

  // GROUP STAGE (inline draw count)
  async function renderGroups(host) {
    var divs = S.detail.divisions || []; if (!divs.length) { host.innerHTML = '<div class="lg-empty">Add a division first, then add entrants.</div>'; return; }
    if (!S.divId) S.divId = divs[0].id;
    var er; try { er = await sb().rpc('tourn_roster', { p_division: S.divId }); } catch (e) { er = null; }
    var roster = (er && er.data) || [];
    var eligible = roster.filter(function (r) { return ['registered', 'paid', 'invited'].indexOf(r.status) >= 0; });
    var suggested = S._ng || Math.max(1, Math.round(eligible.length / 4)) || 2;
    host.innerHTML = '<div class="lg-tool">' + (divs.length > 1 ? '<select class="lg-sel" onchange="FFPTourn.setDiv(this.value,\'groups\')">' + divOpts() + '</select>' : '')
      + '<span class="lg-lab" style="margin:0">Number of groups</span><input class="lg-in" id="tg-ng" type="number" min="1" value="' + suggested + '" style="width:70px">'
      + '<button class="lg-btn pri" onclick="FFPTourn.doGroups()">' + ic('shuffle') + 'Draw groups</button><span class="sp"></span>'
      + '<span class="lg-sub" style="margin:0">' + eligible.length + ' entrant' + (eligible.length === 1 ? '' : 's') + '</span></div>'
      + '<div id="tg-glist"><div class="lg-empty">Loading…</div></div>';
    var host2 = document.getElementById('tg-glist');
    if (eligible.length < 2) { host2.innerHTML = '<div class="lg-empty">Add at least 2 entrants (Entrants tab) before drawing groups.</div>'; return; }
    var mr; try { mr = await sb().from('tourn_matches').select('*').eq('division_id', S.divId).eq('stage', 'group').order('group_label').order('round').order('slot'); } catch (e) { mr = { error: e }; }
    var ms = (mr && mr.data) || []; var names = {}; roster.forEach(function (r) { names[r.id] = r.name; });
    var gt; try { gt = await sb().rpc('tourn_group_tables', { p_division: S.divId }); } catch (e) { gt = null; }
    var tables = (gt && gt.data && gt.data.groups) || [];
    if (!tables.length) { host2.innerHTML = '<div class="lg-empty"><span class="ms" style="font-size:34px;color:#c0cad2;display:block;margin-bottom:6px">groups</span><b>No groups drawn yet</b><div style="margin-top:4px">Set the number of groups above and tap <b>Draw groups</b> — your ' + eligible.length + ' entrants are split evenly with round-robin fixtures in each group.</div></div>'; return; }
    var byMatch = {}; ms.forEach(function (m) { (byMatch[m.group_label] = byMatch[m.group_label] || []).push(m); });
    host2.innerHTML = tables.map(function (g) {
      var tbl = '<table class="tg-tbl"><tr><th class="rk"></th><th class="nm">Team</th><th>P</th><th>W</th><th>D</th><th>L</th><th>+/-</th><th>Pts</th></tr>'
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
      }).join('') : '<div class="lg-sub" style="padding:8px 2px">Single entrant — no fixtures.</div>';
      return '<div class="tg-group"><div class="tg-grph">Group ' + esc(g.label) + ', ' + (g.rows || []).length + ' team' + ((g.rows || []).length === 1 ? '' : 's') + '</div>' + tbl + '<div class="fxlab">Fixtures and results, in play order</div>' + fx + '</div>';
    }).join('')
      + '<div class="lg-tool" style="margin-top:18px;border-top:1px solid var(--ffp-border);padding-top:14px"><span class="sp"></span><button class="lg-btn pri" onclick="FFPTourn.saveGroupResults()">' + ic('check') + 'Save results</button><button class="lg-btn green" onclick="FFPTourn.doBracket()">' + ic('account_tree') + 'Build knockout from groups</button></div>';
  }
  async function doGroups() {
    var n = parseInt((document.getElementById('tg-ng') || {}).value, 10) || 2; S._ng = n;
    var r; try { r = await sb().rpc('tourn_groups_generate', { p_division: S.divId, p_num_groups: n }); } catch (e) { r = { error: e }; }
    if (r.error) { toast(/not_owner/.test(r.error.message || '') ? 'Not your tournament' : 'Could not draw groups', 'error'); return; }
    if ((r.data || 0) === 0) { toast('Add at least 2 entrants first', 'error'); renderTab(); return; }
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
  async function monradRound() {
    var r; try { r = await sb().rpc('tourn_monrad_round', { p_division: S.divId }); } catch (e) { r = { error: e }; }
    if (r.error) { toast('Could not draw the round', 'error'); return; }
    var d = r.data || {};
    if (d.ok === false) {
      toast(d.reason === 'complete' ? 'All ' + d.rounds + ' rounds are drawn'
          : d.reason === 'round_unfinished' ? 'Finish round ' + d.round + ' first'
          : d.reason === 'not_enough_entrants' ? 'Needs at least two entrants'
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
    if (r.error) { toast('Could not build bracket', 'error'); return; }
    // built from the seeds, so it is already settled and fixed
    try { await sb().rpc('tourn_draw_confirm', { p_division: S.divId }); } catch (e) {}
    toast('Bracket built', 'success'); S.tab = 'bracket'; refreshDetail();
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
    var fmtCtl = '<select class="lg-sel" style="width:auto;min-width:210px" onchange="FFPTourn.setDrawFormat(this.value)">'
      + '<option value="ko"' + (fmt === 'ko' ? ' selected' : '') + '>Knockout draw</option>'
      + '<option value="monrad"' + (fmt === 'monrad' ? ' selected' : '') + '>Monrad, everyone keeps playing</option>'
      + '</select>';
    var side = dv.side_draws || 'none';
    var sideCtl = fmt === 'monrad' ? '' : '<select class="lg-sel" style="width:auto;min-width:230px" title="Extra draws for players knocked out" onchange="FFPTourn.setSideDraws(this.value)">'
      + SIDE_DRAWS.map(function (o) { return '<option value="' + o[0] + '"' + (side === o[0] ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('')
      + '</select>';
    // The draw appears as soon as the format is set: pick the size, then the
    // names go into the slots. Nothing is settled until it is confirmed.
    var open = dv.draw_locked === false;
    var ents = dv.entrant_count || 0;
    var auto = 2; while (auto < Math.max(ents, 2)) auto *= 2;
    var sizeCtl = fmt === 'monrad' ? '' : '<select class="lg-sel" id="tg-dsize" style="width:auto;min-width:150px">'
      + [4, 8, 16, 32, 64].map(function (n) { return '<option value="' + n + '"' + (n === auto ? ' selected' : '') + '>' + n + ' draw' + (n === auto ? ', fits ' + ents : '') + '</option>'; }).join('')
      + '</select>';
    var anyPlayed = (S._bracket || []).some(function (m) { return m.status === 'final' || m.status === 'live'; });
    var reopenCtl = (!open && fmt !== 'monrad') ? '<button class="lg-btn ghost" onclick="FFPTourn.drawReopen()" title="Move names around again">' + ic('lock_open') + 'Reopen draw</button>' : '';
    var openCtl = open
      ? '<button class="lg-btn" onclick="FFPTourn.drawFill()">' + ic('shuffle') + 'Fill empty slots</button>'
        + '<button class="lg-btn gold" onclick="FFPTourn.drawConfirm()">' + ic('check') + 'Confirm draw</button>'
      : '';
    var buildCtl = fmt === 'monrad'
      ? '<button class="lg-btn" onclick="FFPTourn.monradRound()">' + ic('playlist_add') + 'Draw next round</button>'
      : open ? openCtl
      : (S.brkConfirm
        ? '<button class="lg-btn green" onclick="FFPTourn.doBracket()">' + ic('check') + 'Confirm build</button><button class="lg-btn ghost" onclick="FFPTourn.cancelBracket()">Cancel</button>'
        : reopenCtl + sizeCtl + '<button class="lg-btn" onclick="FFPTourn.openDraw()">' + ic('account_tree') + 'Create draw</button>'
          + '<button class="lg-btn" onclick="FFPTourn.confirmBracket()">' + ic('bolt') + (ev.group_stage ? 'Build from groups' : 'Draw by seeds') + '</button>');
    host.innerHTML = '<div class="lg-tool"><select class="lg-sel" onchange="FFPTourn.setDiv(this.value,\'bracket\')">' + divOpts() + '</select>' + fmtCtl + sideCtl + '<span class="sp"></span>' + buildCtl + '<button class="lg-btn pri" onclick="FFPTourn.saveBracketResults()">' + ic('check') + 'Save &amp; advance</button></div><div id="tg-brk"><div class="lg-empty">Loading…</div></div>';
    if (open || !(S._roster || []).length || S._rosterDiv !== S.divId) {
      try { var rr = await sb().rpc('tourn_roster', { p_division: S.divId }); S._roster = (rr && rr.data) || []; S._rosterDiv = S.divId; } catch (e) {}
    }
    var r; try { r = await sb().rpc('tourn_bracket', { p_division: S.divId }); } catch (e) { r = { error: e }; }
    var ms = (r && r.data) || []; S._bracket = ms; S._drawOpen = open; var host2 = document.getElementById('tg-brk');
    if (!ms.length) { host2.innerHTML = '<div class="lg-empty">No draw yet. Pick the size and create it, and the names go in afterwards.</div>'; return; }
    // who is placed already, so a name cannot stand in two slots
    var placed = {}; ms.forEach(function (m) { if (m.round === 1) { if (m.home) placed[m.home.id] = 1; if (m.away) placed[m.away.id] = 1; } });
    S._placed = placed;
    if (open) {
      var free = (S._roster || []).filter(function (e) { return e.status !== 'withdrawn' && !placed[e.id]; });
      var slots = ms.filter(function (m) { return m.round === 1; }).length * 2;
      var head = '<div class="tg-dw"><b>' + slots + ' draw</b><span>' + (dv.entrant_count || 0) + ' players, ' + Math.max(0, slots - Object.keys(placed).length) + ' open slots. Pick a name into each slot, or fill them in seed order. Empty slots become byes when you confirm.</span></div>';
      host2.insertAdjacentHTML('beforebegin', head);
    }
    // One bracket per draw: Main / Cup, then Plate, Bowl, Consolation or the
    // placement draws. A dropdown picks which one is on screen.
    var draws = [], seen = {};
    ms.forEach(function (m) { var k = m.draw || 'main'; if (!seen[k]) { seen[k] = 1; draws.push({ key: k, name: m.draw_name || 'Main Draw', sort: m.draw_sort || 0 }); } });
    draws.sort(function (a, b) { return a.sort - b.sort; });
    if (!seen[S.drawKey || '']) S.drawKey = draws[0].key;
    var dms = ms.filter(function (m) { return (m.draw || 'main') === S.drawKey; });
    var drawCtl = draws.length > 1
      ? '<div class="lg-tool" style="margin-top:0"><span class="lg-lab" style="margin:0">Draw</span><select class="lg-sel" style="width:auto;min-width:200px" onchange="FFPTourn.setDraw(this.value)">'
        + draws.map(function (d) { var c = ms.filter(function (m) { return (m.draw || 'main') === d.key && m.status !== 'void'; }).length;
            return '<option value="' + d.key + '"' + (d.key === S.drawKey ? ' selected' : '') + '>' + esc(d.name) + ' (' + c + ' matches)</option>'; }).join('')
        + '</select></div>' : '';
    var byRound = {}; dms.filter(function (m) { return m.stage !== 'third'; }).forEach(function (m) { (byRound[m.round] = byRound[m.round] || []).push(m); });
    var cols = Object.keys(byRound).sort(function (a, b) { return a - b; }).map(function (rd) {
      var items = byRound[rd].sort(function (a, b) { return a.slot - b.slot; });
      return '<div class="tg-rnd"><div class="rh">' + esc(stageLbl(items[0])) + '</div>' + items.map(mHtml).join('') + '</div>';
    }).join('');
    var third = dms.find(function (m) { return m.stage === 'third'; });
    host2.innerHTML = drawCtl + '<div class="tg-brk"><div class="tg-brkin">' + cols + '</div></div>'
      + (third ? '<div class="tg-thirdwrap"><div class="rh" style="text-align:left;margin-bottom:8px">3rd / 4th play-off</div><div style="max-width:230px">' + mHtml(third) + '</div></div>' : '');
  }
  function slotSel(m, side) {
    var cur = side === 'home' ? m.home : m.away;
    var opts = '<option value="">Add name</option>'
      + (S._roster || []).filter(function (e) { return e.status !== 'withdrawn' && (!S._placed[e.id] || (cur && cur.id === e.id)); })
        .map(function (e) { return '<option value="' + e.id + '"' + (cur && cur.id === e.id ? ' selected' : '') + '>' + esc(e.name) + (e.seed != null ? ' [' + e.seed + ']' : '') + '</option>'; }).join('');
    return '<select class="slotsel" onchange="FFPTourn.drawPlace(\'' + m.id + '\',\'' + side + '\',this.value)">' + opts + '</select>';
  }
  function mHtml(m) {
    if (m.status === 'void') return '<div class="tg-m tg-void"></div>';
    // while the draw is open, the first round is a row of name pickers
    if (S._drawOpen && m.round === 1) {
      return '<div class="tg-m" data-id="' + m.id + '"><div class="s">' + slotSel(m, 'home') + '</div><div class="s">' + slotSel(m, 'away') + '</div></div>';
    }
    var hw = m.winner_entrant && m.home && m.home.id === m.winner_entrant, aw = m.winner_entrant && m.away && m.away.id === m.winner_entrant;
    var mc = (m.home && m.away) ? '<button class="lg-mcbtn tg-mcbtn" title="Match centre" onclick="FFPTourn.openMatch(\'' + m.id + '\')">' + ic('scoreboard') + '</button>' : '';
    // A no-show, retirement or disqualification still has a winner, and in a
    // knockout that winner has to advance or the draw stalls.
    var aw2 = (m.home && m.away && m.status !== 'final')
      ? '<button class="lg-mcbtn tg-mcbtn" title="Walkover, retirement or disqualification" onclick="FFPTourn.awardPanel(\'' + m.id + '\')">' + ic('gavel') + '</button>' : '';
    var kindTag = m.result_kind && m.result_kind !== 'played'
      ? '<span class="tg-kind">' + esc(AWARD_SHORT[m.result_kind] || m.result_kind) + '</span>' : '';
    return '<div class="tg-m" data-id="' + m.id + '"><div class="s ' + (hw ? 'win' : (m.home ? '' : 'tbd')) + '"><b>' + esc((m.home && m.home.name) || 'TBD') + '</b><input type="number" class="tg-hs" value="' + (m.home_score != null ? m.home_score : '') + '" placeholder="–"></div>'
      + '<div class="s ' + (aw ? 'win' : (m.away ? '' : 'tbd')) + '"><b>' + esc((m.away && m.away.name) || 'TBD') + '</b><input type="number" class="tg-as" value="' + (m.away_score != null ? m.away_score : '') + '" placeholder="–"></div>' + kindTag
      + ((aw2 || mc) ? '<div class="tg-macts">' + aw2 + mc + '</div>' : '') + '</div>';
  }
  async function openDraw() {
    var n = +((document.getElementById('tg-dsize') || {}).value) || 0;
    if (!n) { toast('Pick a draw size', 'error'); return; }
    var r; try { r = await sb().rpc('tourn_bracket_open', { p_division: S.divId, p_size: n }); } catch (e) { r = { error: e }; }
    if (r.error) { toast(/matches_played/.test(r.error.message || '') ? 'Matches have been played in this draw' : 'Could not create the draw', 'error'); return; }
    toast(r.data + ' draw created. Add the names', 'success'); refreshDetail();
  }
  async function drawPlace(matchId, side, entrantId) {
    var r; try { r = await sb().rpc('tourn_draw_place', { p_match: matchId, p_side: side, p_entrant: entrantId || null }); } catch (e) { r = { error: e }; }
    if (r.error) { toast('Could not place them', 'error'); }
    renderTab();
  }
  async function drawFill() {
    var r; try { r = await sb().rpc('tourn_draw_fill', { p_division: S.divId }); } catch (e) { r = { error: e }; }
    if (r.error) { toast('Could not fill the draw', 'error'); return; }
    toast((r.data || 0) + ' placed', 'success'); renderTab();
  }
  async function drawConfirm() {
    var r; try { r = await sb().rpc('tourn_draw_confirm', { p_division: S.divId }); } catch (e) { r = { error: e }; }
    if (r.error) { toast(/draw_empty/.test(r.error.message || '') ? 'Put some names in first' : 'Could not confirm', 'error'); return; }
    toast('Draw confirmed', 'success'); refreshDetail();
  }
  async function drawReopen() {
    var r; try { r = await sb().rpc('tourn_draw_reopen', { p_division: S.divId }); } catch (e) { r = { error: e }; }
    if (r.error) { toast(/matches_played/.test(r.error.message || '') ? 'Matches have been played, so the draw is fixed' : 'Could not reopen', 'error'); return; }
    toast('Draw open. Move the names, then confirm', 'success'); refreshDetail();
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
    if (!m) { toast('Reload the bracket first', 'error'); return; }
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

  function pickImg(kind) {
    if (!window.FFPUpload) { toast('Uploader not ready — refresh', 'error'); return; }
    var isLogo = kind === 'logo';
    window.FFPUpload.pick({ bucket: isLogo ? 'provider-logos' : 'listing-covers', key: (isLogo ? 'tglogo-' : 'tgcover-') + S.eventId + '-' + Date.now(),
      aspect: isLogo ? 1 : 16 / 9, outW: isLogo ? 512 : 1600, outH: isLogo ? 512 : 900, title: isLogo ? 'Tournament logo (square)' : 'Banner (16:9)',
      onDone: function (url) { var p = {}; p[isLogo ? 'logo_url' : 'cover_url'] = url; sb().rpc('tourn_event_save', { p_id: S.eventId, p: p }).then(function () { toast('Saved', 'success'); open(S.eventId); }); },
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
  function openMatch(id) { S.matchOpen = id; S.mcTab = 'timeline'; S._mcDiv = null; S.mcStatPlayer = null; if (S._trkInt) { clearInterval(S._trkInt); S._trkInt = null; } S._tracker = null; S._htSnap = null; S._mcSetTime = '40:00'; renderMatchCentre(); }
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
      '<div class="lg-tool"><button class="lg-btn" onclick="FFPTourn.closeMatch()">' + ic('arrow_back') + 'Back</button><span class="sp"></span>' + liveBtn + '<button class="lg-btn pri" onclick="FFPTourn.saveResultFromEvents()">' + ic('check') + 'Save result</button></div>'
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
    if (!fields.length) { host.innerHTML = '<div class="lg-empty">This sport has no team match-stat fields.</div>'; return; }
    var gr; try { gr = await sb().rpc('lt_team_match_stats_get', { p_scope: 'tourn', p_match: S.matchOpen }); } catch (e) { gr = null; }
    var saved = (gr && gr.data) || {}; var hv = saved[m.home.id] || {}, av = saved[m.away.id] || {};
    if (!S._mcDiv) { try { var dr = await sb().from('tourn_matches').select('division_id').eq('id', S.matchOpen).single(); S._mcDiv = dr.data && dr.data.division_id; } catch (e) {} }
    var hasPoss = fields.some(function (f) { return f.key === 'possession'; }), hasTerr = fields.some(function (f) { return f.key === 'territory'; });
    host.innerHTML = mcPeriodHtml(m) + (hasPoss || hasTerr ? trkHtml(m, hasTerr) : '')
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
  function trkHtml(m, hasTerr) {
    var t = _trk();
    var terr = hasTerr ? '<div class="lg-trk-grp"><div class="lg-trk-lab">Field position — which half the ball is in</div><div class="lg-trk-btns">'
      + '<button class="lg-trk-b" data-half="home" onclick="FFPTourn.trkHalf(\'home\')">' + esc(m.home.name) + ' half</button>'
      + '<button class="lg-trk-b" data-half="away" onclick="FFPTourn.trkHalf(\'away\')">' + esc(m.away.name) + ' half</button></div></div>' : '';
    return '<div class="lg-trk"><div class="lg-trk-clock"><div class="t" id="trk-clock">' + fmtClock(t.total) + '</div><span class="sp"></span>'
      + '<button class="lg-btn" id="trk-toggle" onclick="FFPTourn.trkToggle()">Start</button>'
      + '<button class="lg-btn ghost" onclick="FFPTourn.trkReset()">Reset</button></div>'
      + '<div class="lg-trk-grp"><div class="lg-trk-lab">Possession — who has the ball</div><div class="lg-trk-btns">'
      + '<button class="lg-trk-b" data-poss="home" onclick="FFPTourn.trkPoss(\'home\')">' + esc(m.home.name) + ' <span>0%</span></button>'
      + '<button class="lg-trk-b" data-poss="away" onclick="FFPTourn.trkPoss(\'away\')">' + esc(m.away.name) + ' <span>0%</span></button></div></div>'
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
  function mcPeriods(m) {
    var q = ['netball', 'basketball', 'afl'].indexOf((m || {}).sport_key) > -1;
    return q
      ? [['pre', 'Not started', false], ['q1', '1st quarter', true], ['qt1', 'Quarter-time', false], ['q2', '2nd quarter', true], ['ht', 'Half-time', false], ['q3', '3rd quarter', true], ['qt3', '3-quarter time', false], ['q4', '4th quarter', true], ['ft', 'Full time', false]]
      : [['pre', 'Not started', false], ['h1', '1st half', true], ['ht', 'Half-time', false], ['h2', '2nd half', true], ['ft', 'Full time', false]];
  }
  function mcPeriodHtml(m) {
    var seq = mcPeriods(m); var period = (S._mc && S._mc.status === 'final') ? 'ft' : ((S._mc && S._mc.period) || 'pre');
    var idx = 0; for (var i = 0; i < seq.length; i++) { if (seq[i][0] === period) { idx = i; break; } }
    var cur = seq[idx], next = seq[idx + 1];
    var chip = period === 'pre' ? '' : (cur[2] ? 'live' : (period === 'ft' ? 'ft' : 'ht'));
    var st = (S._mcSetTime == null ? '40:00' : S._mcSetTime);
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
    else if (isPlay) { var q = String(S._mcSetTime || '40:00').split(':'); t.total = (parseInt(q[0] || '0', 10) * 60) + (parseInt(q[1] || '0', 10) || 0); if (!t.running) trkToggle(); }
    else if (p !== 'ft') { if (t.running) trkToggle(); }
    try { await sb().rpc('lt_match_set_period', { p_scope: 'tourn', p_match: S.matchOpen, p_period: p }); } catch (e) {}
    if (p === 'ft') { if ((m.events || []).length) { try { await saveResultFromEvents(); } catch (e) {} } else { try { await sb().rpc('lt_match_status', { p_scope: 'tourn', p_match: S.matchOpen, p_status: 'final' }); } catch (e) {} } }
    else { try { await sb().rpc('lt_match_status', { p_scope: 'tourn', p_match: S.matchOpen, p_status: p === 'pre' ? 'scheduled' : 'live' }); } catch (e) {} }
    if (S._mc) S._mc.period = p;
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
  async function refreshDetail() { var r; try { r = await sb().rpc('tourn_detail', { p_tourn: S.eventId }); } catch (e) { r = { error: e }; } S.detail = (r && r.data) || S.detail; renderTab(); }
  function divOpts() { return (S.detail.divisions || []).map(function (d) { return '<option value="' + d.id + '"' + (d.id === S.divId ? ' selected' : '') + '>' + esc(d.name) + '</option>'; }).join(''); }

  window.FFPTourn = {
    open: open, startCreate: startCreate, cancelCreate: cancelCreate, doCreate: doCreate,
    back: function () { S.view = 'list'; renderList(); }, tab: function (t) { S.tab = t; S.matchOpen = null; renderEditor(); },
    cityFill: cityFill,
    setSchedDiv: function (val) { S.schedDiv = val; if (val !== 'all') S.divId = val; renderTab(); },
    setSchedView: function (val) { S.schedView = val; renderTab(); },
    setSchedDay: function (val) { S.schedDay = +val || 1; renderTab(); },
    setDayDate: setDayDate, addDay: addDay, removeDay: removeDay, planSettings: planSettings,
    entSearch: entSearch, entPick: entPick, entInvite: entInvite, seedByGrade: seedByGrade,
    entManual: entManual, saveManual: saveManual,
    openDraw: openDraw, drawPlace: drawPlace, drawFill: drawFill, drawConfirm: drawConfirm, drawReopen: drawReopen,
    setDiv: function (val, tab) { S.divId = val; S.tab = tab; S.entEdit = null; S.entDel = null; S.sqOpen = null; renderTab(); },
    seg: function (btn, id) { document.querySelectorAll('#' + id + ' button').forEach(function (b) { b.classList.remove('on'); }); btn.classList.add('on'); },
    statusPick: statusPick,
    saveDetails: saveDetails, sportHint: sportHint, editDivision: editDivision, cancelDivision: cancelDivision, saveDivision: saveDivision,
    addEntrant: addEntrant, bulkAthletes: bulkAthletes, cancelEntrant: cancelEntrant, saveEntrant: saveEntrant,
    editEntrant: editEntrant, cancelEntrantEdit: cancelEntrantEdit, saveEntrantEdit: saveEntrantEdit,
    askRemoveEntrant: askRemoveEntrant, cancelRemoveEntrant: cancelRemoveEntrant, removeEntrant: removeEntrant,
    sqToggle: sqToggle, sqSearch: sqSearch, sqAddMember: sqAddMember, sqNameOnly: sqNameOnly, sqInvite: sqInvite, sqRemove: sqRemove,
    doGroups: doGroups, saveGroupResults: saveGroupResults,
    confirmBracket: confirmBracket, cancelBracket: cancelBracket, doBracket: doBracket, setDrawFormat: setDrawFormat, setSideDraws: setSideDraws, setDraw: setDraw, monradRound: monradRound, awardPanel: awardPanel, doAward: doAward, saveBracketResults: saveBracketResults,
    setFmt: setFmt, buildStructure: buildStructure, pickImg: pickImg, entLogo: entLogo, addOfficial: addOfficial, ofSearch: ofSearch, ofPick: ofPick, removeOfficial: removeOfficial, setOfficialCap: setOfficialCap,
    autoplan: autoplan, schedSet: schedSet,
    togRound: togRound, addMatch: addMatch, cancelMatch: cancelMatch, saveMatch: saveMatch,
    addVenue: addVenue, editVenue: editVenue, cancelVenue: cancelVenue, saveVenue: saveVenue, removeVenue: removeVenue,
    addSurface: addSurface, cancelSurface: cancelSurface, saveSurface: saveSurface, removeSurface: removeSurface, screenPanel: screenPanel, useMyCourts: useMyCourts, linkCourt: linkCourt, copyScreen: copyScreen,
    offAdd: offAdd, offRemove: offRemove,
    openMatch: openMatch, closeMatch: closeMatch, addEvent: addEvent, removeEvent: removeEvent, saveResultFromEvents: saveResultFromEvents, addSub: addSub, removeSub: removeSub,
    trkToggle: trkToggle, trkReset: trkReset, trkPoss: trkPoss, trkHalf: trkHalf, trkApply: trkApply, mcSetPeriod: mcSetPeriod, _mcSetTime: _mcSetTime,
    mcTab: mcTab, mcPickStatPlayer: mcPickStatPlayer, saveStats: saveStats, setLive: setLive, saveTeamStats: saveTeamStats, saveStream: saveStream,
    addCustomStat: addCustomStat, removeCustomStat: removeCustomStat,
    pbpAward: pbpAward, pbpUndo: pbpUndo, pbpServer: pbpServer, pbpDecide: pbpDecide, pbpFinish: pbpFinish
  };
  window.ffpRenderTournaments = function () { S.view = 'list'; S.creating = false; renderList(); };
})();
