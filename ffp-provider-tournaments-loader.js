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

  var S = { view: 'list', eventId: null, detail: null, tab: 'details', divId: null, sports: null, creating: false, divEdit: null, entAdd: false, grpDraw: false, brkConfirm: false };

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
      '.lg-seg{display:inline-flex;border:1.5px solid var(--ffp-border-mid);border-radius:10px;overflow:hidden;} .lg-seg button{background:#fff;border:none;padding:9px 15px;font:inherit;font-size:12.5px;font-weight:800;color:var(--ffp-text-muted);cursor:pointer;} .lg-seg button.on{background:var(--ffp-blue);color:#fff;}',
      '.lg-row{display:flex;align-items:center;gap:12px;padding:13px 2px;border-bottom:1px solid var(--ffp-border);} .lg-row .drag{color:#c0cad2;font-size:20px;cursor:grab;} .lg-row .g{flex:1;min-width:0;} .lg-row .g b{font-size:14.5px;font-weight:800;color:var(--ffp-text);} .lg-row .g span{font-size:12.5px;color:var(--ffp-text-muted);font-weight:700;} .lg-row .act{color:#9aa8b4;font-size:20px;cursor:pointer;padding:4px;} .lg-row .act:hover{color:var(--ffp-blue);}',
      '.lg-av{width:34px;height:34px;border-radius:8px;flex:none;background:#e7ecef center/cover no-repeat;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:900;color:#6a7681;}',
      '.lg-empty{padding:40px 16px;text-align:center;color:var(--ffp-text-muted);font-weight:600;font-size:13.5px;}',
      '.lg-tool{display:flex;align-items:center;gap:12px;margin-bottom:16px;flex-wrap:wrap;} .lg-tool .lg-sel{width:auto;min-width:180px;} .lg-tool .sp{flex:1;} .lg-tool .lg-in{width:64px;}',
      '.lg-edit{display:flex;align-items:center;gap:10px;padding:12px 2px;border-bottom:1px solid var(--ffp-border);flex-wrap:wrap;} .lg-edit .lg-in{width:auto;flex:1;min-width:160px;}',
      '.lg-fx{display:grid;grid-template-columns:1fr 128px 1fr;align-items:center;gap:8px;padding:11px 2px;border-bottom:1px solid var(--ffp-border);} .lg-fx .t{font-size:13.5px;font-weight:800;color:var(--ffp-text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;} .lg-fx .t.a{text-align:right;} .lg-fx .sc{display:flex;gap:6px;justify-content:center;} .lg-fx .sc input{width:46px;padding:8px;border:1.5px solid #d7dee5;border-radius:8px;font:inherit;font-weight:800;text-align:center;}',
      '.lg-rndlab{font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.4px;color:var(--ffp-text-muted);margin:16px 0 4px;}'
    ].join('\n');
    document.head.appendChild(css);
  }
  function injectExtraCss() {
    if (document.getElementById('tgx-css')) return;
    var css = document.createElement('style'); css.id = 'tgx-css';
    css.textContent = [
      '.tg-brk{overflow-x:auto;padding:6px 2px 16px;} .tg-brkin{display:flex;gap:16px;min-width:max-content;} .tg-thirdwrap{margin-top:16px;border-top:1px solid var(--ffp-border);padding-top:16px;}',
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
      '.lg-brand{display:flex;gap:12px;align-items:stretch;} .lg-logo{width:76px;height:76px;flex:none;border-radius:12px;border:1.5px dashed #d7dee5;background:#f7f9fb center/cover no-repeat;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;color:#9aa8b4;cursor:pointer;font-size:10px;font-weight:800;} .lg-logo .ms{font-size:22px;} .lg-banner{flex:1;height:76px;border-radius:12px;border:1.5px dashed #d7dee5;background:#f7f9fb center/cover no-repeat;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;color:#9aa8b4;cursor:pointer;font-size:11px;font-weight:800;} .lg-banner .ms{font-size:22px;} .lg-row .act{margin-left:auto;color:#9aa8b4;font-size:19px;cursor:pointer;}',
      /* shared v7: crest / collapsible rounds / venues / schedule v2 / officials */
      '.lg-crest{width:32px;height:32px;border-radius:9px;flex:none;background:#241053 center/cover no-repeat;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:900;color:#fff;box-shadow:inset 0 0 0 1px rgba(0,0,0,.05),0 1px 2px rgba(0,0,0,.14);vertical-align:middle;}',
      '.lg-rnd{display:flex;align-items:center;gap:12px;margin:20px 0 2px;padding:12px 14px;background:linear-gradient(180deg,#f7fafc,#eef4f8);border:1px solid #e4edf3;border-radius:12px;cursor:pointer;user-select:none;} .lg-rnd:hover{background:linear-gradient(180deg,#f2f8fb,#e7f1f7);} .lg-rnd .chev{color:var(--ffp-blue);font-size:22px;transition:transform .2s;} .lg-rnd.collapsed .chev{transform:rotate(-90deg);} .lg-rnd .rt{font-size:14px;font-weight:900;color:var(--ffp-text);} .lg-rnd .rc{font-size:11px;font-weight:800;color:var(--ffp-blue);background:#e2eff6;padding:3px 10px;border-radius:20px;} .lg-rnd .rd{font-size:12px;font-weight:600;color:var(--ffp-text-muted);} .lg-rnd .sp{flex:1;} .lg-rbody.hidden{display:none;}',
      '.lg-venue{padding:18px 4px;border-bottom:1px solid var(--ffp-border);} .lg-vh{display:flex;align-items:center;gap:12px;} .lg-vpin{width:38px;height:38px;border-radius:11px;background:linear-gradient(180deg,#eaf4f9,#dcecf3);color:var(--ffp-blue);display:flex;align-items:center;justify-content:center;flex:none;} .lg-vpin .ms{font-size:21px;} .lg-vh .g{flex:1;min-width:0;} .lg-vh .g b{font-size:16px;font-weight:900;color:var(--ffp-text);} .lg-vh .g span{display:block;font-size:12.5px;color:var(--ffp-text-muted);font-weight:700;} .lg-vh .act{color:#9aa8b4;font-size:19px;cursor:pointer;padding:5px;border-radius:8px;} .lg-vh .act:hover{color:var(--ffp-blue);background:#f4f7f9;}',
      '.lg-surfs{margin:12px 0 0 51px;position:relative;} .lg-surfs:before{content:"";position:absolute;left:-13px;top:2px;bottom:18px;width:1.5px;background:#e4edf3;} .lg-surf{display:flex;align-items:center;gap:10px;padding:10px 0;font-size:14px;font-weight:600;border-bottom:1px solid #f4f7f9;} .lg-surf .ms{color:var(--ffp-blue);font-size:18px;opacity:.85;} .lg-surf .x{color:#c0cad2;cursor:pointer;font-size:18px;} .lg-surf .x:hover{color:#d64545;} .lg-addsurf{margin:12px 0 0 51px;} .lg-btn.ghostb{color:var(--ffp-blue);border-color:#d4e6ef;background:#f5fafc;} .lg-maplink{display:inline-flex;align-items:center;gap:3px;color:var(--ffp-blue);font-weight:800;text-decoration:none;} .lg-maplink .ms{font-size:15px;vertical-align:-3px;}',
      '.lg-srow2{display:grid;grid-template-columns:1.2fr 1fr;gap:22px;align-items:start;padding:16px 4px;border-bottom:1px solid var(--ffp-border);} .lg-srow2 .s-match b{font-size:15px;font-weight:800;} .lg-srow2 .s-match small{display:block;font-size:11px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#9aa8b4;margin-top:3px;} .lg-srow2 .s-when{display:flex;gap:8px;margin-top:11px;} .lg-srow2 .s-when .lg-in{padding:8px 9px;font-size:13px;} .lg-srow2 .s-right{display:flex;flex-direction:column;gap:9px;} .lg-srow2 .fl{font-size:11px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#9aa8b4;} .lg-srow2 .st-f{padding:9px 10px;font-size:13px;}',
      '.lg-offlist{display:flex;flex-direction:column;gap:6px;} .lg-offtag{display:flex;align-items:center;gap:9px;font-size:13px;padding:7px 10px;border:1px solid var(--ffp-border-mid);border-radius:9px;background:#fbfcfd;} .lg-offtag .role{font-size:10px;font-weight:900;letter-spacing:.05em;text-transform:uppercase;color:var(--ffp-blue);} .lg-offtag .nm{font-weight:700;} .lg-offtag .sp{flex:1;} .lg-offtag .x{color:#c0cad2;cursor:pointer;font-size:16px;} .lg-assign{display:flex;gap:7px;align-items:center;} .lg-assign .lg-sel{padding:7px 9px;font-size:12.5px;flex:1;} .lg-btn.sm{padding:7px 11px;font-size:12px;} .lg-maed{background:#f7fafc;border:1px solid #e4edf3;border-radius:12px;padding:12px;margin-bottom:14px;} .lg-scpill{display:inline-block;font-size:9px;font-weight:900;letter-spacing:.05em;color:#0a8f5f;background:#e3f6ec;padding:2px 7px;border-radius:20px;vertical-align:middle;margin-left:6px;} .lg-ocap{max-width:180px;padding:7px 9px;font-size:12.5px;}',
      /* match centre */
      '.lg-mcbtn{border:none;background:none;color:#9aa8b4;cursor:pointer;padding:4px;border-radius:8px;} .lg-mcbtn:hover{color:var(--ffp-blue);background:#f4f7f9;} .lg-mcbtn .ms{font-size:20px;} .tg-m .tg-mcbtn{position:absolute;top:4px;right:4px;} .tg-m{position:relative;}',
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
  function dlOpts(arr) { return (arr || []).map(function (x) { return '<option value="' + esc(x) + '">'; }).join(''); }
  function schemaForActivity(act) { var s = (S.sports || []).find(function (x) { return (x.match_activities || []).some(function (a) { return String(a).toLowerCase() === String(act || '').toLowerCase(); }); }); return s ? s.name : 'Generic points'; }
  function sportHint() { var a = (document.getElementById('tg-sport') || {}).value; var h = document.getElementById('tg-sporthint'); if (h) h.textContent = 'Stats set: ' + schemaForActivity(a); }

  async function renderList() {
    injectCss(); var el = root(); if (!el) return;
    var r; try { r = await sb().rpc('tourn_my_events'); } catch (e) { r = { error: e }; }
    var list = (r && r.data) || [];
    var cards = list.map(function (ev) {
      var cov = ev.cover_url || ev.logo_url;
      return '<div class="lg-card" onclick="FFPTourn.open(\'' + ev.id + '\')"><div class="lg-cover" style="' + (cov ? 'background-image:url(\'' + esc(cov) + '\')' : '') + '"><div class="scr"></div><div class="bd ' + esc(ev.status) + '">' + esc((ev.status || 'draft').toUpperCase()) + '</div></div><div class="lg-cbody"><b>' + esc(ev.name) + '</b><span>' + esc([ev.city, ev.sport].filter(Boolean).join(' · ')) + '</span></div></div>';
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
    S.eventId = id; S.view = 'editor'; S.tab = 'details'; S.divEdit = null; S.entAdd = false; S.grpDraw = false; S.brkConfirm = false;
    var r; try { r = await sb().rpc('tourn_detail', { p_tourn: id }); } catch (e) { r = { error: e }; }
    S.detail = (r && r.data) || null;
    S.divId = (S.detail && S.detail.divisions && S.detail.divisions[0] && S.detail.divisions[0].id) || null;
    renderEditor();
  }
  function renderEditor() {
    injectCss(); var el = root(); if (!el || !S.detail) return;
    var ev = S.detail.event || {};
    el.innerHTML = '<div class="lg-wrap"><div class="lg-head"><div><div class="lg-h1">' + esc(ev.name) + '<span class="lg-pill ' + esc(ev.status) + '">' + esc((ev.status || 'draft').toUpperCase()) + '</span></div><div class="lg-sub">' + esc([ev.city, ev.sport_key].filter(Boolean).join(' · ')) + '</div></div>'
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
    if (mn.toDateString() === mx.toDateString()) return fmtDay(mn) + ' · 1 day';
    var days = Math.round((new Date(mx.getFullYear(), mx.getMonth(), mx.getDate()) - new Date(mn.getFullYear(), mn.getMonth(), mn.getDate())) / 86400000) + 1;
    var span = (mn.getMonth() === mx.getMonth()) ? (mn.getDate() + '–' + mx.getDate() + ' ' + MON[mx.getMonth()]) : (mn.getDate() + ' ' + MON[mn.getMonth()] + ' – ' + mx.getDate() + ' ' + MON[mx.getMonth()]);
    return span + ' · ' + days + ' days';
  }
  function surfaceOpts(fields, selId) {
    var groups = {}; var order = [];
    (fields || []).forEach(function (x) { var g = x.venue || 'Other'; if (!groups[g]) { groups[g] = []; order.push(g); } groups[g].push(x); });
    return '<option value="">Surface…</option>' + order.map(function (g) {
      return '<optgroup label="' + esc(g) + '">' + groups[g].map(function (x) { return '<option value="' + x.id + '"' + (selId && x.id === selId ? ' selected' : '') + '>' + esc(x.name) + '</option>'; }).join('') + '</optgroup>';
    }).join('');
  }
  function togRound(btn) { btn.classList.toggle('collapsed'); var b = btn.nextElementSibling; if (b && b.classList.contains('lg-rbody')) b.classList.toggle('hidden'); }
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
      + '<div class="lg-edit"><input class="lg-in" id="tg-ofname" placeholder="Name" style="max-width:180px">' + capSel + '<input class="lg-in" id="tg-ofemail" placeholder="FFP email (for scorers)"><button class="lg-btn pri" onclick="FFPTourn.addOfficial()">' + ic('add') + 'Add official</button></div><div id="tg-oflist"><div class="lg-empty">Loading…</div></div>';
    var r; try { r = await sb().rpc('lt_officials_list', { p_scope: 'tourn', p_event: S.eventId }); } catch (e) { r = { error: e }; }
    var rows = (r && r.data) || []; var h2 = document.getElementById('tg-oflist');
    h2.innerHTML = rows.length ? rows.map(function (o) {
      var role = String(o.role || 'official').toLowerCase(); var sc = isScorerRole(role);
      var meta = sc
        ? (o.member_id ? 'Can score in the app' : (o.email ? esc(o.email) + ' · needs an FFP account to score' : 'Add their FFP email to enable scoring'))
        : (o.member_id ? 'FFP linked' : (o.email ? esc(o.email) : 'Match official'));
      return '<div class="lg-row"><span class="lg-av" style="' + (o.photo ? 'background-image:url(\'' + esc(o.photo) + '\')' : '') + '">' + (o.photo ? '' : esc((o.name || '?').slice(0, 1))) + '</span><div class="g"><b>' + esc(o.name || o.email || 'Official') + (sc ? ' <span class="lg-scpill">SCORER</span>' : '') + '</b><span>' + meta + '</span></div><select class="lg-sel lg-ocap" onchange="FFPTourn.setOfficialCap(\'' + o.id + '\',this.value)">' + capOpts(role) + '</select><span class="ms act" onclick="FFPTourn.removeOfficial(\'' + o.id + '\')">close</span></div>';
    }).join('') : '<div class="lg-empty">No officials yet.</div>';
  }
  async function addOfficial() {
    var nm = (document.getElementById('tg-ofname') || {}).value, em = (document.getElementById('tg-ofemail') || {}).value, cap = (document.getElementById('tg-ofcap') || {}).value || 'official';
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
    if (!vs.length && !S.venAdd) { h2.innerHTML = '<div class="lg-empty">No venues yet. Add a venue, then its courts.</div>'; return; }
    h2.innerHTML = vs.map(function (v2) {
      if (S.venEdit === v2.id) return venueEditor(v2);
      var surfaces = (v2.surfaces || []).map(function (s) {
        return '<div class="lg-surf"><span class="ms">sports_score</span>' + esc(s.name) + '<span class="sp"></span><span class="ms x" onclick="FFPTourn.removeSurface(\'' + s.id + '\')">delete</span></div>';
      }).join('');
      var vmeta = [v2.city, (v2.maps_url ? '<a class="lg-maplink" href="' + esc(v2.maps_url) + '" target="_blank" rel="noopener">' + ic('map') + 'Map</a>' : '')].filter(Boolean).join(' · ');
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
  function cancelSurface() { S.surfAdd = null; renderTab(); }
  async function saveSurface(vid) {
    var nm = v('tg-sfname'); if (!nm || !nm.trim()) return;
    var r; try { r = await sb().rpc('lt_field_save', { p_scope: 'tourn', p_event: S.eventId, p_id: null, p_name: nm.trim(), p_start: null, p_venue: vid }); } catch (e) { r = { error: e }; }
    if (r.error) { toast('Add failed', 'error'); return; } S.surfAdd = null; toast('Added', 'success'); renderTab();
  }
  async function removeSurface(id) { await sb().rpc('lt_field_remove', { p_id: id }); renderTab(); }

  // ---------- SCHEDULE ----------
  async function renderSchedule(host) {
    var divs = S.detail.divisions || [];
    if (!S.divId && divs.length) S.divId = divs[0].id;
    var fr; try { fr = await sb().rpc('lt_fields_list', { p_scope: 'tourn', p_event: S.eventId }); } catch (e) { fr = { error: e }; }
    var fields = (fr && fr.data) || [];
    if (S.divId) await loadEntrantsArr();
    host.innerHTML =
      '<div class="lg-tool">' + (divs.length > 1 ? '<select class="lg-sel" onchange="FFPTourn.setDiv(this.value,\'schedule\')">' + divOpts() + '</select>' : '')
      + '<span class="lg-lab" style="margin:0">Match length</span><input class="lg-in" id="tg-mlen" type="number" value="30" style="width:64px"><span style="font-size:12px;color:var(--ffp-text-muted)">min</span>'
      + '<span class="sp"></span><button class="lg-btn" onclick="FFPTourn.addMatch()">' + ic('add') + 'Add match</button><button class="lg-btn pri" onclick="FFPTourn.autoplan()">' + ic('auto_awesome') + 'Auto-plan</button></div>'
      + (S.addMatch ? matchEditor() : '') + '<div id="tg-schedlist"><div class="lg-empty">Loading…</div></div>';
    if (!fields.length) { document.getElementById('tg-schedlist').innerHTML = '<div class="lg-empty">Add a venue + surfaces on the <b>Venues</b> tab, then Auto-plan.</div>'; }
    if (!S.divId) { document.getElementById('tg-schedlist').innerHTML = '<div class="lg-empty">Add a division first.</div>'; return; }
    var names = await entrantNames(S.divId); await loadEntrantsArr();
    var mr; try { mr = await sb().from('tourn_matches').select('id,stage,group_label,round,slot,home_entrant,away_entrant,scheduled_at,court,field_id').eq('division_id', S.divId).order('round').order('slot'); } catch (e) { mr = { error: e }; }
    var ms = (mr && mr.data) || []; var offr = await sb().rpc('lt_officials_list', { p_scope: 'tourn', p_event: S.eventId }); var offs = (offr && offr.data) || [];
    S._fields = fields; S._offs = offs;
    var host2 = document.getElementById('tg-schedlist');
    if (!ms.length) { host2.innerHTML = '<div class="lg-empty">No matches yet — draw groups or build the bracket first, or add one manually.</div>'; return; }
    // per-match assigned officials (one query)
    var moMap = {};
    try {
      var ids = ms.map(function (m) { return m.id; });
      var mo = await sb().from('lt_match_officials').select('id,match_id,role,official_id').eq('scope', 'tourn').in('match_id', ids);
      var offName = {}; offs.forEach(function (o) { offName[o.id] = o.name || o.email; });
      (mo.data || []).forEach(function (x) { (moMap[x.match_id] = moMap[x.match_id] || []).push({ id: x.id, role: x.role, name: offName[x.official_id] || 'Official' }); });
    } catch (e) {}
    // two stages: all Group matches, then Knockout
    ms.forEach(function (m) { m._names = names; m._offs = moMap[m.id] || []; });
    var grp = ms.filter(function (m) { return m.stage === 'group'; });
    var ko = ms.filter(function (m) { return m.stage !== 'group'; });
    grp.sort(function (a, b) { return (a.group_label || '').localeCompare(b.group_label || '') || (a.round || 0) - (b.round || 0) || (a.slot || 0) - (b.slot || 0); });
    var koRank = { r64: 1, r32: 2, r16: 3, quarter: 4, semi: 5, third: 6, final: 7 };
    ko.sort(function (a, b) { return (koRank[a.stage] || 9) - (koRank[b.stage] || 9) || (a.slot || 0) - (b.slot || 0); });
    var html = '';
    if (grp.length) html += roundHead('Group stage', grp.length, roundRange(grp)) + '<div class="lg-rbody">' + grp.map(schedRow).join('') + '</div>';
    if (ko.length) html += roundHead('Knockout', ko.length, roundRange(ko)) + '<div class="lg-rbody">' + ko.map(schedRow).join('') + '</div>';
    host2.innerHTML = html || '<div class="lg-empty">No matches yet — draw groups or build the bracket.</div>';
  }
  function schedRow(m) {
    var names = m._names || {};
    var t = m.scheduled_at ? new Date(m.scheduled_at) : null;
    var tv = t ? fmtTime(t) : '';
    var dv = t ? (t.getFullYear() + '-' + ('0' + (t.getMonth() + 1)).slice(-2) + '-' + ('0' + t.getDate()).slice(-2)) : ((S.detail.event && S.detail.event.starts_at) || '');
    var lbl = m.stage === 'group' ? ('Group ' + (m.group_label || '')) : (STAGE[m.stage] || m.stage);
    var tags = (m._offs || []).map(function (o) {
      return '<div class="lg-offtag"><span class="role">' + esc(o.role || 'Official') + '</span><span class="nm">' + esc(o.name) + '</span><span class="sp"></span><span class="ms x" onclick="FFPTourn.offRemove(\'' + o.id + '\')">close</span></div>';
    }).join('');
    var roleOpts = '<option value="">Role…</option>' + ROLES.map(function (r) { return '<option>' + r + '</option>'; }).join('');
    var offOpts = '<option value="">Official…</option>' + (S._offs || []).map(function (x) { return '<option value="' + x.id + '">' + esc(x.name || x.email) + '</option>'; }).join('');
    return '<div class="lg-srow2" data-id="' + m.id + '"><div class="s-match"><b>' + esc(names[m.home_entrant] || 'TBD') + ' v ' + esc(names[m.away_entrant] || 'TBD') + '</b><small>' + esc(lbl) + '</small>'
      + '<div class="s-when"><input class="lg-in st-d" type="date" value="' + dv + '" onchange="FFPTourn.schedSet(\'' + m.id + '\')"><input class="lg-in st-t" type="time" value="' + tv + '" onchange="FFPTourn.schedSet(\'' + m.id + '\')"></div>'
      + '<button class="lg-btn sm ghostb" style="margin-top:8px" onclick="FFPTourn.openMatch(\'' + m.id + '\')">' + ic('scoreboard') + 'Match centre</button></div>'
      + '<div class="s-right"><div class="fl">Surface</div><select class="lg-sel st-f" onchange="FFPTourn.schedSet(\'' + m.id + '\')">' + surfaceOpts(S._fields, m.field_id) + '</select>'
      + '<div class="fl">Officials</div>' + (tags ? '<div class="lg-offlist">' + tags + '</div>' : '')
      + '<div class="lg-assign"><select class="lg-sel a-role">' + roleOpts + '</select><select class="lg-sel a-off">' + offOpts + '</select><button class="lg-btn sm pri" onclick="FFPTourn.offAdd(\'' + m.id + '\')">Add</button></div></div></div>';
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
  async function autoplan() {
    if (!S.divId) { toast('Pick a division', 'error'); return; }
    var len = +((document.getElementById('tg-mlen') || {}).value) || 30;
    var r; try { r = await sb().rpc('lt_autoplan', { p_scope: 'tourn', p_division: S.divId, p_match_len: len }); } catch (e) { r = { error: e }; }
    if (r.error) { toast(/no_fields/.test(r.error.message || '') ? 'Add a surface first (Venues tab)' : 'Could not plan', 'error'); return; }
    toast((r.data || 0) + ' matches planned', 'success'); renderTab();
  }
  async function schedSet(id) {
    var row = document.querySelector('.lg-srow2[data-id="' + id + '"]'); if (!row) return;
    var dv = (row.querySelector('.st-d') || {}).value, tv = row.querySelector('.st-t').value, fid = row.querySelector('.st-f').value || null;
    var base = dv || (S.detail.event && S.detail.event.starts_at) || new Date().toISOString().slice(0, 10);
    var when = (tv || dv) ? new Date(base + 'T' + (tv || '00:00') + ':00').toISOString() : null;
    await sb().rpc('lt_match_schedule', { p_scope: 'tourn', p_match: id, p_when: when, p_field: fid, p_court: null, p_official: null });
    toast('Rescheduled', 'success');
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
      '<div class="lg-fld"><div class="lg-lab">Logo &amp; banner</div><div class="lg-brand">'
      + '<div class="lg-logo" onclick="FFPTourn.pickImg(\'logo\')" style="' + (ev.logo_url ? 'background-image:url(\'' + esc(ev.logo_url) + '\')' : '') + '">' + (ev.logo_url ? '' : '<span class="ms">add_photo_alternate</span><span>Logo</span>') + '</div>'
      + '<div class="lg-banner" onclick="FFPTourn.pickImg(\'cover\')" style="' + (ev.cover_url ? 'background-image:url(\'' + esc(ev.cover_url) + '\')' : '') + '">' + (ev.cover_url ? '' : '<span class="ms">image</span><span>Add banner (16:9)</span>') + '</div></div></div>'
      + '<div class="lg-fld"><div class="lg-lab">Tournament name</div><input class="lg-in" id="tg-name" value="' + esc(ev.name) + '"></div>'
      + '<div class="lg-2"><div class="lg-fld"><div class="lg-lab">Sport</div><input class="lg-in" id="tg-sport" list="tg-actl" value="' + esc(ev.activity || '') + '" placeholder="Search sport…" oninput="FFPTourn.sportHint()"><datalist id="tg-actl">' + dlOpts(actNames()) + '</datalist><div class="lg-lab" id="tg-sporthint" style="margin:6px 0 0;font-weight:700;color:#6a7c8a">Stats set: ' + esc(schemaForActivity(ev.activity)) + '</div></div>'
      + '<div class="lg-fld"><div class="lg-lab">Group stage first</div><div class="lg-seg" id="tg-gs"><button data-v="true" class="' + (ev.group_stage ? 'on' : '') + '" onclick="FFPTourn.seg(this,\'tg-gs\')">Yes</button><button data-v="false" class="' + (!ev.group_stage ? 'on' : '') + '" onclick="FFPTourn.seg(this,\'tg-gs\')">Straight knockout</button></div></div></div>'
      + '<div class="lg-2"><div class="lg-fld"><div class="lg-lab">Advance per group</div><input class="lg-in" id="tg-adv" type="number" value="' + (ev.groups_advance != null ? ev.groups_advance : 2) + '"></div>'
      + '<div class="lg-fld"><div class="lg-lab">Seeding</div><select class="lg-sel" id="tg-seed"><option value="seeded"' + (ev.seeding_mode !== 'random' ? ' selected' : '') + '>Seeded</option><option value="random"' + (ev.seeding_mode === 'random' ? ' selected' : '') + '>Random</option></select></div></div>'
      + '<div class="lg-2"><div class="lg-fld"><div class="lg-lab">City</div><input class="lg-in" id="tg-city" list="tg-cityl" value="' + esc(ev.city || '') + '"><datalist id="tg-cityl">' + dlOpts(cityNames()) + '</datalist></div><div class="lg-fld"><div class="lg-lab">Country</div><input class="lg-in" id="tg-country" list="tg-cntl" value="' + esc(ev.country || '') + '"><datalist id="tg-cntl">' + dlOpts(countryNames()) + '</datalist></div></div>'
      + '<div class="lg-2"><div class="lg-fld"><div class="lg-lab">Starts</div><input class="lg-in" id="tg-start" type="date" value="' + esc(ev.starts_at || '') + '"></div><div class="lg-fld"><div class="lg-lab">Ends</div><input class="lg-in" id="tg-end" type="date" value="' + esc(ev.ends_at || '') + '"></div></div>'
      + '<div class="lg-fld"><div class="lg-lab">3rd-place play-off</div><div class="lg-seg" id="tg-third"><button data-v="true" class="' + (ev.third_place ? 'on' : '') + '" onclick="FFPTourn.seg(this,\'tg-third\')">Yes</button><button data-v="false" class="' + (!ev.third_place ? 'on' : '') + '" onclick="FFPTourn.seg(this,\'tg-third\')">No</button></div></div>'
      + '<div class="lg-fld"><div class="lg-lab">Status</div><select class="lg-sel" id="tg-status"><option value="draft"' + (ev.status === 'draft' ? ' selected' : '') + '>Draft (hidden)</option><option value="open"' + (ev.status === 'open' ? ' selected' : '') + '>Open</option><option value="live"' + (ev.status === 'live' ? ' selected' : '') + '>Live</option><option value="final"' + (ev.status === 'final' ? ' selected' : '') + '>Final</option></select></div>'
      + '<div class="lg-fld"><div class="lg-lab">About</div><textarea class="lg-in" id="tg-desc" rows="3">' + esc(ev.description || '') + '</textarea></div>'
      + '<div class="lg-fld"><div class="lg-lab">Rules</div><textarea class="lg-in" id="tg-rules" rows="3">' + esc(ev.rules || '') + '</textarea></div>'
      + '<div class="lg-fld"><div class="lg-lab">Live stream URL <span style="font-weight:500;color:#8a99a8;">— the tournament\'s main channel (YouTube, Twitch, Facebook…)</span></div><input class="lg-in" id="tg-stream" value="' + esc(ev.stream_url || '') + '" placeholder="https://…"></div>'
      + '<button class="lg-btn pri" onclick="FFPTourn.saveDetails()">' + ic('check') + 'Save</button>';
  }
  function segVal(id) { var b = document.querySelector('#' + id + ' button.on'); return b ? b.getAttribute('data-v') : null; }
  function v(id) { var e = document.getElementById(id); return e ? e.value : ''; }
  async function saveDetails() {
    var p = { name: v('tg-name'), activity: v('tg-sport'), group_stage: segVal('tg-gs') === 'true', groups_advance: +v('tg-adv'), seeding_mode: v('tg-seed'),
      city: v('tg-city'), country: v('tg-country'), starts_at: v('tg-start') || null, ends_at: v('tg-end') || null,
      third_place: segVal('tg-third') === 'true', status: v('tg-status'), description: v('tg-desc'), rules: v('tg-rules') };
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
      return '<div class="lg-row"><span class="ms drag">drag_indicator</span><div class="g"><b>' + esc(d.name) + '</b> <span>· ' + (d.kind === 'individual' ? 'Individual' : 'Team') + ' · ' + (d.entrant_count || 0) + ' in</span></div><span class="ms act" onclick="FFPTourn.editDivision(\'' + d.id + '\')">edit</span></div>';
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
  async function renderEntrants(host) {
    var divs = S.detail.divisions || [];
    if (!divs.length) { host.innerHTML = '<div class="lg-empty">Add a division first.</div>'; return; }
    if (!S.divId) S.divId = divs[0].id;
    var adder = S.entAdd
      ? '<div class="lg-edit"><input class="lg-in" id="tg-entname" placeholder="Team / player name" onkeydown="if(event.key===\'Enter\')FFPTourn.saveEntrant()"><button class="lg-btn pri" onclick="FFPTourn.saveEntrant()">' + ic('check') + 'Add</button><button class="lg-btn ghost" onclick="FFPTourn.cancelEntrant()">Cancel</button></div>'
      : '<button class="lg-btn" onclick="FFPTourn.addEntrant()">' + ic('add') + 'Add team / player</button>';
    host.innerHTML = '<div class="lg-tool"><select class="lg-sel" onchange="FFPTourn.setDiv(this.value,\'entrants\')">' + divOpts() + '</select><span class="sp"></span></div>' + adder + '<div id="tg-roster"><div class="lg-empty">Loading…</div></div>';
    var f = document.getElementById('tg-entname'); if (f) f.focus();
    var r; try { r = await sb().rpc('tourn_roster', { p_division: S.divId }); } catch (e) { r = { error: e }; }
    var rows = (r && r.data) || []; var host2 = document.getElementById('tg-roster');
    host2.innerHTML = rows.length ? rows.map(function (en) {
      var flag = en.nationality ? ' · ' + esc(en.nationality) : '';
      return '<div class="lg-row"><span class="lg-av" style="' + (en.logo ? 'background-image:url(\'' + esc(en.logo) + '\')' : '') + '">' + (en.logo ? '' : esc((en.name || '?').slice(0, 1))) + '</span><div class="g"><b>' + esc(en.name) + '</b> <span>· ' + esc(en.status) + (en.group_label ? ' · Group ' + esc(en.group_label) : '') + (en.kind === 'individual' ? flag : '') + '</span></div>' + (en.kind !== 'individual' ? '<span class="ms act" title="Team logo" onclick="FFPTourn.entLogo(\'' + en.id + '\')">add_a_photo</span>' : '') + '</div>';
    }).join('') : '<div class="lg-empty">No entrants yet. Members self-register in the app, or add them here.</div>';
  }
  function addEntrant() { S.entAdd = true; renderTab(); }
  function cancelEntrant() { S.entAdd = false; renderTab(); }
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
      return '<div class="tg-group"><div class="tg-grph">Group ' + esc(g.label) + ' · ' + (g.rows || []).length + ' team' + ((g.rows || []).length === 1 ? '' : 's') + '</div>' + tbl + '<div class="fxlab">Fixtures &amp; results · in play order</div>' + fx + '</div>';
    }).join('')
      + '<div class="lg-tool" style="margin-top:18px;border-top:1px solid var(--ffp-border);padding-top:14px"><span class="sp"></span><button class="lg-btn pri" onclick="FFPTourn.saveGroupResults()">' + ic('check') + 'Save results</button><button class="lg-btn green" onclick="FFPTourn.doBracket()">' + ic('account_tree') + 'Build knockout from groups</button></div>';
  }
  async function doGroups() {
    var n = parseInt((document.getElementById('tg-ng') || {}).value, 10) || 2; S._ng = n;
    var r; try { r = await sb().rpc('tourn_groups_generate', { p_division: S.divId, p_num_groups: n }); } catch (e) { r = { error: e }; }
    if (r.error) { toast(/not_owner/.test(r.error.message || '') ? 'Not your tournament' : 'Could not draw groups', 'error'); return; }
    if ((r.data || 0) === 0) { toast('Add at least 2 entrants first', 'error'); renderTab(); return; }
    toast(n + ' group' + (n === 1 ? '' : 's') + ' drawn · ' + r.data + ' fixtures', 'success'); renderTab();
  }
  async function saveGroupResults() {
    var rows = Array.prototype.slice.call(document.querySelectorAll('#tg-glist .tg-gfx')); var n = 0;
    for (var i = 0; i < rows.length; i++) { var el = rows[i]; var h = el.querySelector('.tg-hs').value, a = el.querySelector('.tg-as').value; if (h === '' || a === '') continue; try { await sb().rpc('tourn_result_save', { p_match: el.getAttribute('data-id'), p_home: +h, p_away: +a, p_sets: null, p_status: 'final' }); n++; } catch (e) {} }
    toast(n + ' results saved', 'success'); renderTab();
  }
  function confirmBracket() { S.brkConfirm = true; renderTab(); }
  function cancelBracket() { S.brkConfirm = false; renderTab(); }
  async function doBracket() {
    S.brkConfirm = false;
    var r; try { r = await sb().rpc('tourn_bracket_build', { p_division: S.divId }); } catch (e) { r = { error: e }; }
    if (r.error) { toast('Could not build bracket', 'error'); return; } toast('Bracket built', 'success'); S.tab = 'bracket'; refreshDetail();
  }

  // BRACKET
  async function renderBracket(host) {
    var divs = S.detail.divisions || []; if (!divs.length) { host.innerHTML = '<div class="lg-empty">Add a division first.</div>'; return; }
    if (!S.divId) S.divId = divs[0].id; var ev = S.detail.event || {};
    var buildCtl = S.brkConfirm
      ? '<button class="lg-btn green" onclick="FFPTourn.doBracket()">' + ic('check') + 'Confirm build</button><button class="lg-btn ghost" onclick="FFPTourn.cancelBracket()">Cancel</button>'
      : '<button class="lg-btn" onclick="FFPTourn.confirmBracket()">' + ic('account_tree') + (ev.group_stage ? 'Build from groups' : 'Draw bracket') + '</button>';
    host.innerHTML = '<div class="lg-tool"><select class="lg-sel" onchange="FFPTourn.setDiv(this.value,\'bracket\')">' + divOpts() + '</select><span class="sp"></span>' + buildCtl + '<button class="lg-btn pri" onclick="FFPTourn.saveBracketResults()">' + ic('check') + 'Save &amp; advance</button></div><div id="tg-brk"><div class="lg-empty">Loading…</div></div>';
    var r; try { r = await sb().rpc('tourn_bracket', { p_division: S.divId }); } catch (e) { r = { error: e }; }
    var ms = (r && r.data) || []; var host2 = document.getElementById('tg-brk');
    if (!ms.length) { host2.innerHTML = '<div class="lg-empty">No bracket yet — build it above.</div>'; return; }
    var byRound = {}; ms.filter(function (m) { return m.stage !== 'third'; }).forEach(function (m) { (byRound[m.round] = byRound[m.round] || []).push(m); });
    var cols = Object.keys(byRound).sort(function (a, b) { return a - b; }).map(function (rd) {
      var items = byRound[rd].sort(function (a, b) { return a.slot - b.slot; });
      return '<div class="tg-rnd"><div class="rh">' + esc(STAGE[items[0].stage] || items[0].stage) + '</div>' + items.map(mHtml).join('') + '</div>';
    }).join('');
    var third = ms.find(function (m) { return m.stage === 'third'; });
    host2.innerHTML = '<div class="tg-brk"><div class="tg-brkin">' + cols + '</div></div>'
      + (third ? '<div class="tg-thirdwrap"><div class="rh" style="text-align:left;margin-bottom:8px">3rd / 4th play-off</div><div style="max-width:230px">' + mHtml(third) + '</div></div>' : '');
  }
  function mHtml(m) {
    var hw = m.winner_entrant && m.home && m.home.id === m.winner_entrant, aw = m.winner_entrant && m.away && m.away.id === m.winner_entrant;
    var mc = (m.home && m.away) ? '<button class="lg-mcbtn tg-mcbtn" title="Match centre" onclick="FFPTourn.openMatch(\'' + m.id + '\')">' + ic('scoreboard') + '</button>' : '';
    return '<div class="tg-m" data-id="' + m.id + '"><div class="s ' + (hw ? 'win' : (m.home ? '' : 'tbd')) + '"><b>' + esc((m.home && m.home.name) || 'TBD') + '</b><input type="number" class="tg-hs" value="' + (m.home_score != null ? m.home_score : '') + '" placeholder="–"></div>'
      + '<div class="s ' + (aw ? 'win' : (m.away ? '' : 'tbd')) + '"><b>' + esc((m.away && m.away.name) || 'TBD') + '</b><input type="number" class="tg-as" value="' + (m.away_score != null ? m.away_score : '') + '" placeholder="–"></div>' + mc + '</div>';
  }
  async function saveBracketResults() {
    var cards = Array.prototype.slice.call(document.querySelectorAll('#tg-brk .tg-m')); var n = 0;
    for (var i = 0; i < cards.length; i++) { var el = cards[i]; var h = el.querySelector('.tg-hs').value, a = el.querySelector('.tg-as').value; if (h === '' || a === '') continue; try { await sb().rpc('tourn_result_save', { p_match: el.getAttribute('data-id'), p_home: +h, p_away: +a, p_sets: null, p_status: 'final' }); n++; } catch (e) {} }
    toast(n + ' saved — winners advanced', 'success'); renderTab();
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
  function openMatch(id) { S.matchOpen = id; S.mcTab = 'timeline'; S._mcDiv = null; S.mcStatPlayer = null; renderMatchCentre(); }
  function closeMatch() { S.matchOpen = null; renderTab(); }
  async function renderMatchCentre() {
    var host = document.getElementById('tg-tab'); if (!host) return;
    host.innerHTML = '<div class="lg-empty">Loading match…</div>';
    var r; try { r = await sb().rpc('lt_match_detail', { p_scope: 'tourn', p_match: S.matchOpen }); } catch (e) { r = { error: e }; }
    var m = (r && r.data) || null;
    if (!m) { host.innerHTML = '<div class="lg-empty">Could not load.</div>'; return; }
    S._mc = m;
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
      + '<div class="lg-mctabs"><button class="' + (tab === 'timeline' ? 'on' : '') + '" onclick="FFPTourn.mcTab(\'timeline\')">Scoring timeline</button><button class="' + (tab === 'stats' ? 'on' : '') + '" onclick="FFPTourn.mcTab(\'stats\')">Player stats</button><button class="' + (tab === 'team' ? 'on' : '') + '" onclick="FFPTourn.mcTab(\'team\')">Team stats</button></div>'
      + (tab === 'timeline'
        ? ('<div class="lg-mcadd"><input class="lg-in" id="mc-min" type="number" placeholder="Min" style="width:70px">'
          + '<select class="lg-sel" id="mc-kind">' + kindOpts + '</select>'
          + '<select class="lg-sel" id="mc-team">' + teamOpts + '</select><select class="lg-sel" id="mc-player"></select>'
          + '<button class="lg-btn pri" onclick="FFPTourn.addEvent()">' + ic('add') + 'Add</button></div>'
          + '<div class="lg-sub" style="margin:6px 0 0">Order: time · action · team · player</div><div id="mc-list"></div>')
        : tab === 'stats' ? '<div id="mc-stats"><div class="lg-empty">Loading…</div></div>'
        : '<div id="mc-team"><div class="lg-empty">Loading…</div></div>');
    if (tab === 'timeline') { mcFillPlayers(); document.getElementById('mc-team').addEventListener('change', mcFillPlayers); renderMcList(); }
    else if (tab === 'stats') { renderMcStats(); }
    else { renderMcTeam(); }
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
    host.innerHTML = '<div class="lg-teamstat"><div class="hd"><span>' + esc(m.home.name) + '</span><span class="lab"></span><span>' + esc(m.away.name) + '</span></div>'
      + fields.map(function (f) {
        return '<div class="lg-tsrow" data-key="' + esc(f.key) + '"><input class="lg-in ts-h" type="number" value="' + (hv[f.key] != null ? hv[f.key] : '') + '" placeholder="0"><span class="lab">' + esc(f.label) + (f.pct ? ' %' : '') + '</span><input class="lg-in ts-a" type="number" value="' + (av[f.key] != null ? av[f.key] : '') + '" placeholder="0"></div>';
      }).join('') + '</div><button class="lg-btn pri" style="margin-top:12px" onclick="FFPTourn.saveTeamStats()">' + ic('check') + 'Save team stats</button>';
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
  function mcFillPlayers() {
    var sel = document.getElementById('mc-player'); if (!sel) return;
    var sq = mcSquadFor(document.getElementById('mc-team').value);
    sel.innerHTML = sq.map(function (p) { return '<option value="' + p.player_id + '">' + esc(p.name) + '</option>'; }).join('') + '<option value="__other">Other (type name)…</option>';
  }
  function mcScoringKinds() { var m = S._mc || {}; var s = (S.sports || []).find(function (x) { return x.key === m.sport_key; }); return (s && s.scoring_kinds) || [{ key: 'point', label: 'Point', points: 1 }]; }
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
    var minute = parseInt((document.getElementById('mc-min') || {}).value, 10); if (isNaN(minute)) minute = null;
    var r; try { r = await sb().rpc('lt_event_add', { p_scope: 'tourn', p_match: S.matchOpen, p_entrant: team, p_player: pid, p_player_name: pname, p_minute: minute, p_kind: kind, p_points: pts }); } catch (e) { r = { error: e }; }
    if (r.error) { toast('Could not add', 'error'); return; }
    var mn = document.getElementById('mc-min'); if (mn) mn.value = ''; renderMatchCentre();
  }
  async function removeEvent(id) { await sb().rpc('lt_event_remove', { p_id: id }); renderMatchCentre(); }
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
    var pOpts = flat.map(function (x) { return '<option value="' + x.p.player_id + '">' + esc(x.p.name) + ' · ' + esc(x.team) + '</option>'; }).join('');
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
    setDiv: function (val, tab) { S.divId = val; S.tab = tab; renderTab(); },
    seg: function (btn, id) { document.querySelectorAll('#' + id + ' button').forEach(function (b) { b.classList.remove('on'); }); btn.classList.add('on'); },
    saveDetails: saveDetails, sportHint: sportHint, editDivision: editDivision, cancelDivision: cancelDivision, saveDivision: saveDivision,
    addEntrant: addEntrant, cancelEntrant: cancelEntrant, saveEntrant: saveEntrant,
    doGroups: doGroups, saveGroupResults: saveGroupResults,
    confirmBracket: confirmBracket, cancelBracket: cancelBracket, doBracket: doBracket, saveBracketResults: saveBracketResults,
    setFmt: setFmt, buildStructure: buildStructure, pickImg: pickImg, entLogo: entLogo, addOfficial: addOfficial, removeOfficial: removeOfficial, setOfficialCap: setOfficialCap,
    autoplan: autoplan, schedSet: schedSet,
    togRound: togRound, addMatch: addMatch, cancelMatch: cancelMatch, saveMatch: saveMatch,
    addVenue: addVenue, editVenue: editVenue, cancelVenue: cancelVenue, saveVenue: saveVenue, removeVenue: removeVenue,
    addSurface: addSurface, cancelSurface: cancelSurface, saveSurface: saveSurface, removeSurface: removeSurface,
    offAdd: offAdd, offRemove: offRemove,
    openMatch: openMatch, closeMatch: closeMatch, addEvent: addEvent, removeEvent: removeEvent, saveResultFromEvents: saveResultFromEvents,
    mcTab: mcTab, mcPickStatPlayer: mcPickStatPlayer, saveStats: saveStats, setLive: setLive, saveTeamStats: saveTeamStats, saveStream: saveStream,
    addCustomStat: addCustomStat, removeCustomStat: removeCustomStat
  };
  window.ffpRenderTournaments = function () { S.view = 'list'; S.creating = false; renderList(); };
})();
