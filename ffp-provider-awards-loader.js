// ════════════════════════════════════════════════════════════════════════
// FFP Partner Portal — AWARDS module  (Engagement → Awards)
// Deferred loader: registered in _provLoaderSrc, lazy-loaded by
// ensureProviderLoader() the first time the Awards panel is opened.
//
// A governing body runs its own programme; FFP runs the global one on the
// same tables (award_programmes.ffp_official). Everything goes through the
// SECURITY DEFINER award_* RPCs, which enforce organizer / panel / entrant.
//
// SHELL NOTE: this renders inside index.html, whose icon class is `.ms`
// (Material Symbols Outlined) — there is no `.sym` here. The shell also
// forces input,select,textarea{font-size:16px!important}, so any font-size
// of our own on those needs !important to survive.
// ════════════════════════════════════════════════════════════════════════
var _awProg = null;          // the programme being worked on
var _awDash = null;          // award_organizer_dashboard payload
var _awList = [];            // this provider's programmes
var _awQueue = [];           // judge queue
var _awEntry = null;         // entry open in the review pane
var _awView = 'list';        // list | dash | judge | entry

function _awPid() { return (window.FFP_PROVIDER && window.FFP_PROVIDER.id) || null; }
function _awEsc(s) { return (typeof escHtml === 'function') ? escHtml(s == null ? '' : s) : String(s == null ? '' : s); }
function _awErr(e) {
  var m = String((e && e.message) || e || 'Something went wrong');
  var friendly = {
    forbidden: 'You do not have access to that',
    entries_closed: 'Entries are closed for this programme',
    evidence_closed: 'The evidence window has closed',
    scoring_closed: 'Scoring is closed at this stage',
    voting_closed: 'Voting is not open',
    stage_cannot_go_back: 'Stages only move forward',
    not_on_this_panel: 'You are not on this panel',
    score_out_of_range: 'That score is above the maximum for the criterion',
    pitch_required: 'The entry needs its written case before it can be submitted',
    evidence_required: 'At least one piece of evidence is needed',
    region_scope_is_ffp_only: 'Regional awards are run by FFP. Yours can cover a city or a country.',
    multi_country_is_ffp_only: 'A partner programme covers one country. FFP runs the multi-country ones.',
    city_required_for_city_scope: 'Choose the city this covers',
    country_required_for_country_scope: 'Choose the country this covers',
    region_required_for_region_scope: 'Choose the region this covers',
    activity_not_in_taxonomy: 'Pick the activity from the list',
    city_not_in_taxonomy: 'Pick the city from the list',
    country_not_in_taxonomy: 'Pick the country from the list'
  };
  for (var k in friendly) { if (m.indexOf(k) > -1) return friendly[k]; }
  return m;
}

// ── one-off scoped styles ───────────────────────────────────────────────
(function _awCss() {
  if (document.getElementById('aw-css')) return;
  var s = document.createElement('style');
  s.id = 'aw-css';
  // The modal renders OUTSIDE #panel-awards (openModalShell writes into #modal),
  // so rules scoped only to the panel silently do not apply inside it — which is
  // how the mystery report lost its score bars and ran "VISIT TOTAL" into "41 / 50".
  // Every rule is emitted for both roots.
  var _rules = [
    '#panel-awards .aw-key{border-radius:16px;padding:24px 28px;display:flex;align-items:center;gap:30px;flex-wrap:wrap;',
    '  background:linear-gradient(128deg,#0e2531 0%,#14475e 62%,#1980AD 100%);box-shadow:0 14px 36px rgba(14,37,49,.26);}',
    '#panel-awards .aw-key .k{font-size:9.5px;font-weight:800;letter-spacing:.18em;text-transform:uppercase;color:#9fd0e6;}',
    '#panel-awards .aw-key .big{font-size:50px;font-weight:900;color:#fff;letter-spacing:-2.1px;line-height:1;margin-top:7px;}',
    '#panel-awards .aw-key .of{font-size:11.5px;font-weight:700;color:#cfe6f2;margin-top:8px;}',
    '#panel-awards .aw-key .div{width:1px;height:84px;background:rgba(255,255,255,.18);}',
    '#panel-awards .aw-key .mini{display:flex;gap:26px;margin-left:auto;flex-wrap:wrap;}',
    '#panel-awards .aw-key .mini b{display:block;font-size:24px;font-weight:900;color:#fff;letter-spacing:-.9px;}',
    '#panel-awards .aw-key .mini b.gd{color:#F2A900;}',
    '#panel-awards .aw-key .mini u{display:block;text-decoration:none;font-size:9px;font-weight:800;letter-spacing:.11em;color:#9fd0e6;margin-top:4px;}',
    '#panel-awards .aw-ring{position:relative;width:96px;height:96px;flex:0 0 auto;}',
    '#panel-awards .aw-ring .hole{position:absolute;inset:12px;border-radius:36px;background:#133c50;display:grid;place-items:center;text-align:center;}',
    '#panel-awards .aw-ring .hole b{display:block;font-size:22px;font-weight:900;color:#fff;letter-spacing:-.9px;}',
    '#panel-awards .aw-ring .hole u{display:block;text-decoration:none;font-size:9px;font-weight:800;letter-spacing:.1em;color:#9fd0e6;}',
    '#panel-awards .aw-stg{display:flex;align-items:center;flex-wrap:wrap;gap:0;margin:22px 0 0;padding-bottom:18px;border-bottom:1px solid rgba(15,37,49,.08);}',
    '#panel-awards .aw-stg .s{flex:0 0 auto;padding-right:11px;display:flex;flex-direction:column;gap:6px;}',
    '#panel-awards .aw-stg .s u{text-decoration:none;font-size:9px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#566069;}',
    '#panel-awards .aw-stg .s i{font-style:normal;font-size:10px;font-weight:800;color:#1f9d57;}',
    '#panel-awards .aw-stg .s.on u{color:#0e2531;font-weight:900;} #panel-awards .aw-stg .s.on i{color:#c79a2e;}',
    '#panel-awards .aw-stg .s.off u,#panel-awards .aw-stg .s.off i{color:#8a96a1;font-weight:700;}',
    '#panel-awards .aw-stg .ln{flex:1 1 auto;min-width:20px;margin-right:11px;height:2px;background:#1f9d57;}',
    '#panel-awards .aw-stg .ln.dash{background:repeating-linear-gradient(90deg,rgba(15,37,49,.18) 0 5px,transparent 5px 10px);}',
    '#panel-awards .aw-h6{font-size:9.5px;font-weight:800;letter-spacing:.15em;text-transform:uppercase;color:#566069;margin:22px 0 0;}',
    '#panel-awards .aw-row{display:flex;align-items:center;gap:16px;padding:14px 0;border-top:1px solid rgba(15,37,49,.10);}',
    '#panel-awards .aw-row:last-child{border-bottom:1px solid rgba(15,37,49,.10);}',
    '#panel-awards .aw-row .bd{flex:1;min-width:0;}',
    '#panel-awards .aw-row .nm{font-size:13.5px;font-weight:800;color:#0e2531;letter-spacing:-.25px;}',
    '#panel-awards .aw-row .mt{font-size:11px;font-weight:700;color:#566069;margin-top:3px;}',
    '#panel-awards .aw-row .by{display:flex;align-items:center;gap:6px;font-size:11px;font-weight:800;flex:0 0 auto;}',
    '#panel-awards .aw-row .num{font-size:17px;font-weight:900;color:#0e2531;letter-spacing:-.6px;flex:0 0 auto;text-align:right;min-width:42px;}',
    '#panel-awards .aw-row .num.dim{color:#b6c1c9;}',
    '#panel-awards .aw-act{display:flex;gap:7px;flex:0 0 auto;flex-wrap:wrap;}',
    '#panel-awards .aw-act button{padding:8px 13px;border-radius:8px;font-family:inherit;font-size:11px;font-weight:800;',
    '  cursor:pointer;border:1px solid rgba(15,37,49,.14);background:#fff;color:#0e2531;}',
    '#panel-awards .aw-act button.go{border:0;background:#0e2531;color:#fff;}',
    '#panel-awards .aw-act button.pri{border:0;background:linear-gradient(135deg,#1980AD,#229ccf);color:#fff;}',
    '#panel-awards .aw-bar{height:9px;border-radius:5px;background:rgba(15,37,49,.08);overflow:hidden;margin-top:8px;}',
    '#panel-awards .aw-bar b{display:block;height:100%;border-radius:5px;background:linear-gradient(90deg,#c79a2e,#F2A900);box-shadow:0 0 11px rgba(242,169,0,.55);}',
    '#panel-awards .aw-split{display:flex;gap:34px;align-items:flex-start;flex-wrap:wrap;}',
    '#panel-awards .aw-main{flex:1 1 420px;min-width:0;} #panel-awards .aw-side{flex:0 0 320px;max-width:100%;}',
    '#panel-awards .aw-stage-img{position:relative;border-radius:14px;overflow:hidden;background:#0a2131;}',
    '#panel-awards .aw-stage-img img,#panel-awards .aw-stage-img video{display:block;width:100%;max-height:330px;object-fit:cover;}',
    '#panel-awards .aw-thumbs{display:flex;gap:10px;margin-top:12px;flex-wrap:wrap;}',
    '#panel-awards .aw-thumbs button{padding:0;border:0;background:none;cursor:pointer;line-height:0;}',
    '#panel-awards .aw-thumbs img{width:78px;height:56px;border-radius:9px;object-fit:cover;}',
    '#panel-awards .aw-thumbs button.on img{outline:3px solid #1980AD;outline-offset:2px;}',
    '#panel-awards .aw-crit .tp{display:flex;align-items:baseline;justify-content:space-between;gap:10px;}',
    '#panel-awards .aw-crit .c{padding:13px 0;border-top:1px solid rgba(15,37,49,.10);}',
    '#panel-awards .aw-crit input{width:74px;text-align:right;padding:6px 8px;border:1px solid rgba(15,37,49,.16);',
    '  border-radius:8px;font-family:inherit;font-size:14px!important;font-weight:800;color:#0e2531;}',
    '#panel-awards .aw-tot{margin-top:18px;padding-top:15px;border-top:2px solid #0e2531;display:flex;align-items:baseline;justify-content:space-between;}',
    '#panel-awards .aw-tot .v{font-size:32px;font-weight:900;color:#0e2531;letter-spacing:-1.3px;}',
    '#panel-awards .aw-tot .v u{text-decoration:none;font-size:15px;font-weight:700;color:#8a96a1;}',
    '#panel-awards .aw-plot{display:flex;align-items:flex-end;gap:16px;position:relative;',
    '  border-bottom:1px solid rgba(15,37,49,.14);height:190px;margin-top:20px;}',
    '#panel-awards .aw-plot .ymax{position:absolute;top:0;left:0;font-size:9.5px;font-weight:800;color:#8a96a1;}',
    '#panel-awards .aw-plot .b{flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;}',
    '#panel-awards .aw-plot .b em{font-style:normal;font-size:12.5px;font-weight:900;color:#0e2531;margin-bottom:5px;}',
    '#panel-awards .aw-plot .b i{display:block;width:100%;border-radius:6px 6px 0 0;',
    '  background:linear-gradient(180deg,#2ba8e0,#1980AD);}',
    '#panel-awards .aw-xs{display:flex;gap:16px;margin-top:9px;}',
    '#panel-awards .aw-xs div{flex:1;text-align:center;font-size:9.5px;font-weight:700;color:#566069;line-height:1.25;}',
    // ── FORMS ─────────────────────────────────────────────────────────
    // Four different compositions, not a stack of identical boxes: the identity
    // sits on the navy key panel, what it covers reads as a sentence, the dates
    // reuse the approved stage rail, and the look uses real image tiles.
    '#panel-awards .aw-idn{position:relative;overflow:hidden;border-radius:20px;padding:26px 28px 24px;',
    '  background:linear-gradient(118deg,#0a2131 0%,#123b52 52%,#1980AD 100%);box-shadow:0 14px 34px rgba(10,33,49,.22);}',
    '#panel-awards .aw-idn .k{font-size:9.5px;font-weight:800;letter-spacing:.18em;text-transform:uppercase;color:#F2A900;}',
    '#panel-awards .aw-idn input{display:block;width:100%;border:0;background:transparent;font-family:inherit;',
    '  color:#fff;padding:0;box-shadow:none;outline:none;}',
    '#panel-awards .aw-idn .nmi{font-size:34px!important;font-weight:900;letter-spacing:-1.3px;line-height:1.08;margin-top:8px;}',
    '#panel-awards .aw-idn .nmi::placeholder{color:rgba(255,255,255,.34);}',
    '#panel-awards .aw-idn .tgi{font-size:14px!important;font-weight:700;color:#cddfea;margin-top:12px;',
    '  border-bottom:1px solid rgba(255,255,255,.22);padding-bottom:8px;}',
    '#panel-awards .aw-idn .tgi::placeholder{color:rgba(205,223,234,.5);}',
    '#panel-awards .aw-idn .hint{font-size:11px;font-weight:700;color:#9fc3d8;margin-top:10px;}',

    '#panel-awards .aw-hd .k{font-size:9.5px;font-weight:800;letter-spacing:.18em;text-transform:uppercase;color:#8a99a6;}',
    '#panel-awards .aw-hd input{display:block;width:100%;min-width:0;box-sizing:border-box;border:0;',
    '  border-bottom:1.5px solid rgba(15,37,49,.18);background:transparent;font-family:inherit;',
    '  font-size:30px!important;font-weight:900;letter-spacing:-1.1px;color:#0e2531;padding:6px 0 12px;margin-top:6px;}',
    '#panel-awards .aw-hd input:focus{outline:none;border-bottom-color:#1980AD;}',
    '#panel-awards .aw-hd input::placeholder{color:#c3ced7;}',
    '#panel-awards .aw-q{font-size:13px;font-weight:800;color:#0e2531;letter-spacing:-.1px;line-height:1.45;}',
    '#panel-awards .aw-srch{display:block;width:100%;min-width:0;box-sizing:border-box;border:0;',
    '  border-bottom:1.5px solid rgba(15,37,49,.18);background:transparent;font-family:inherit;',
    '  font-weight:700;color:#0e2531;padding:10px 0;margin-top:10px;}',
    '#panel-awards .aw-srch:focus{outline:none;border-bottom-color:#1980AD;}',
    '#panel-awards .aw-sect{margin-top:30px;padding-top:22px;border-top:1px solid rgba(15,37,49,.12);}',
    '#panel-awards .aw-sect:first-child{margin-top:0;padding-top:0;border-top:0;}',
    // the heading block already ends in a rule, so the next section does not add one
    '#panel-awards .aw-hd + .aw-sect,#panel-awards .aw-idn + .aw-sect{margin-top:12px;padding-top:16px;border-top:0;}',

    '#panel-awards .aw-sent{font-size:20px;font-weight:800;color:#0e2531;line-height:2.05;letter-spacing:-.4px;margin-top:14px;}',
    '#panel-awards .aw-sent select{-webkit-appearance:none;appearance:none;border:0;border-bottom:2px solid #F2A900;',
    '  background:transparent;font-family:inherit;font-size:20px!important;font-weight:900;color:#1980AD;',
    '  padding:0 22px 2px 2px;margin:0 2px;cursor:pointer;max-width:100%;',
    '  background-image:url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'14\' height=\'14\' viewBox=\'0 0 24 24\' fill=\'%231980AD\'><path d=\'M7 10l5 5 5-5z\'/></svg>");',
    '  background-repeat:no-repeat;background-position:right 2px center;}',
    '#panel-awards .aw-sent select:focus{outline:none;border-bottom-color:#1980AD;}',

    '#panel-awards .aw-dts{display:flex;align-items:flex-start;gap:28px;margin-top:16px;flex-wrap:wrap;}',
    '#panel-awards .aw-dts .d{flex:1 1 150px;min-width:0;}',
    '#panel-awards .aw-dts .d input{min-width:0;box-sizing:border-box;}',
    '#panel-awards .aw-dts .d u{display:block;text-decoration:none;font-size:9.5px;font-weight:800;',
    '  letter-spacing:.14em;text-transform:uppercase;color:#566069;}',
    '#panel-awards .aw-dts .d input{width:100%;margin-top:9px;border:0;border-bottom:1.5px solid rgba(15,37,49,.18);',
    '  background:transparent;font-family:inherit;font-weight:800;color:#0e2531;padding:0 0 9px;}',
    '#panel-awards .aw-dts .d input:focus{outline:none;border-bottom-color:#1980AD;}',
    '#panel-awards .aw-dts .sep{flex:0 0 26px;align-self:center;height:1.5px;background:rgba(15,37,49,.14);margin-top:14px;}',
    '@media(max-width:700px){#panel-awards .aw-dts .sep{display:none;}#panel-awards .aw-dts .d{flex:1 1 100%;}}',

    '#panel-awards .aw-look{display:flex;gap:16px;align-items:stretch;margin-top:16px;flex-wrap:wrap;}',
    '#panel-awards .aw-tile{flex:0 0 104px;height:104px;border-radius:16px;border:1.5px dashed #c6d2dc;',
    '  background:#f7f9fb center/cover no-repeat;display:flex;flex-direction:column;align-items:center;',
    '  justify-content:center;gap:3px;color:#8a99a6;cursor:pointer;font-size:10px;font-weight:800;text-align:center;}',
    '#panel-awards .aw-tile .ms{font-size:24px;}',
    '#panel-awards .aw-tile.on{border-style:solid;border-color:#d7dee5;}',
    '#panel-awards .aw-cov{flex:1 1 300px;height:104px;border-radius:16px;border:1.5px dashed #c6d2dc;',
    '  background:#f7f9fb center/cover no-repeat;display:flex;flex-direction:column;align-items:center;',
    '  justify-content:center;gap:3px;color:#8a99a6;cursor:pointer;font-size:11px;font-weight:800;}',
    '#panel-awards .aw-cov .ms{font-size:26px;}',
    '#panel-awards .aw-cov.on{border-style:solid;border-color:#d7dee5;}',
    '#panel-awards .aw-sw{display:flex;gap:11px;margin-top:14px;flex-wrap:wrap;}',
    '#panel-awards .aw-sw button{width:38px;height:38px;border-radius:11px;border:0;cursor:pointer;padding:0;',
    '  box-shadow:inset 0 0 0 1px rgba(15,37,49,.10);}',
    '#panel-awards .aw-sw button.on{box-shadow:0 0 0 2.5px #0e2531;}',

    '#panel-awards .aw-pick{margin-top:14px;}',
    '#panel-awards .aw-pick button{display:flex;width:100%;align-items:center;gap:14px;text-align:left;',
    '  padding:16px 2px;border:0;border-top:1px solid rgba(15,37,49,.10);background:transparent;cursor:pointer;font-family:inherit;}',
    '#panel-awards .aw-pick button:last-child{border-bottom:1px solid rgba(15,37,49,.10);}',
    '#panel-awards .aw-pick .bd{flex:1;min-width:0;}',
    '#panel-awards .aw-pick .bd b{display:block;font-size:14.5px;font-weight:800;color:#0e2531;}',
    '#panel-awards .aw-pick .bd span{display:block;font-size:12px;font-weight:600;color:#566069;margin-top:3px;}',
    '#panel-awards .aw-pick .tick{flex:0 0 auto;font-size:24px;color:#c3ced7;}',
    '#panel-awards .aw-pick button.on .bd b{color:#1980AD;}',
    '#panel-awards .aw-pick button.on .tick{color:#F2A900;}',

    '#panel-awards .aw-n2{display:flex;gap:26px;margin-top:14px;flex-wrap:wrap;}',
    '#panel-awards .aw-n2 .n{flex:0 0 118px;min-width:0;}',
    '#panel-awards .aw-n2 .n u{display:block;text-decoration:none;font-size:9.5px;font-weight:800;',
    '  letter-spacing:.14em;text-transform:uppercase;color:#566069;}',
    '#panel-awards .aw-n2 .n input{width:100%;min-width:0;box-sizing:border-box;margin-top:8px;border:0;border-bottom:1.5px solid rgba(15,37,49,.18);',
    '  background:transparent;font-family:inherit;font-size:26px!important;font-weight:900;color:#0e2531;',
    '  letter-spacing:-1px;padding:0 0 7px;-moz-appearance:textfield;}',
    '#panel-awards .aw-n2 .n input::-webkit-outer-spin-button,#panel-awards .aw-n2 .n input::-webkit-inner-spin-button{-webkit-appearance:none;margin:0;}',
    '#panel-awards .aw-n2 .n input:focus{outline:none;border-bottom-color:#1980AD;}',

    '#panel-awards .aw-cr .r{display:flex;align-items:center;gap:12px;padding:12px 0;border-top:1px solid rgba(15,37,49,.10);}',
    '#panel-awards .aw-cr .r input.l{flex:1;min-width:0;width:100%;box-sizing:border-box;border:0;border-bottom:1.5px solid transparent;background:transparent;',
    '  font-family:inherit;font-weight:700;color:#0e2531;padding:5px 0;}',
    '#panel-awards .aw-cr .r input.m{flex:0 0 74px;width:74px;min-width:0;box-sizing:border-box;',
    '  border:0;border-bottom:1.5px solid rgba(15,37,49,.18);background:transparent;',
    '  font-family:inherit;font-weight:900;color:#0e2531;text-align:right;padding:5px 0;-moz-appearance:textfield;}',
    '#panel-awards .aw-cr .r input::-webkit-outer-spin-button,#panel-awards .aw-cr .r input::-webkit-inner-spin-button{-webkit-appearance:none;margin:0;}',
    '#panel-awards .aw-cr .r input:focus{outline:none;border-bottom-color:#1980AD;}',
    '#panel-awards .aw-cr .r .of{font-size:11px;font-weight:800;color:#8a99a6;flex:0 0 auto;}',
    '#panel-awards .aw-cr .r .x{flex:0 0 auto;font-size:19px;color:#c3ced7;cursor:pointer;}',
    '#panel-awards .aw-cr .r .x:hover{color:#c0392b;}',
    '#panel-awards .aw-cr .tot{display:flex;align-items:baseline;justify-content:space-between;',
    '  border-top:2px solid #0e2531;padding-top:14px;margin-top:4px;}',
    '#panel-awards .aw-cr .tot u{text-decoration:none;font-size:10px;font-weight:800;letter-spacing:.14em;',
    '  text-transform:uppercase;color:#566069;}',
    '#panel-awards .aw-cr .tot b{font-size:26px;font-weight:900;color:#0e2531;letter-spacing:-1px;}',
    '#panel-awards .btn-gold{border:0;background:linear-gradient(135deg,#c79a2e,#f2a900);color:#0e2531;',
    '  font-weight:900;padding:11px 18px;border-radius:10px;font-family:inherit;font-size:12.5px;cursor:pointer;}',
    '#panel-awards .btn-gold:hover{filter:brightness(1.05);}',
    '#panel-awards .aw-empty{padding:30px 0;color:#566069;font-size:13px;font-weight:600;}'
  ].join('\n');
  s.textContent = _rules.replace(/#panel-awards\s/g, function () { return '#panel-awards '; })
    .split('\n').map(function (line) {
      // duplicate each selector line for #modal; leave continuation lines alone
      if (line.indexOf('#panel-awards ') !== 0) return line;
      var brace = line.indexOf('{');
      if (brace < 0) return line;
      var sel = line.slice(0, brace);
      var rest = line.slice(brace);
      var both = sel.split(',').map(function (x) { return x.trim(); }).filter(Boolean)
        .map(function (x) { return x + ', ' + x.replace('#panel-awards', '#modal'); }).join(', ');
      return both + rest;
    }).join('\n');
  document.head.appendChild(s);
})();

// ── entry point ─────────────────────────────────────────────────────────
async function renderAwards() {
  var host = document.getElementById('awards-host');
  if (!host) return;
  if (!_awPid()) { host.innerHTML = '<div class="aw-empty">Sign in to manage awards.</div>'; return; }
  if (_awView === 'mystery') return _awRenderMystery();
  if (_awView === 'entry' && _awEntry) return _awRenderEntry();
  if (_awView === 'judge') return _awRenderJudge();
  if (_awView === 'dash' && _awProg) return _awRenderDash();
  return _awRenderList();
}

// ── programmes ──────────────────────────────────────────────────────────
async function _awRenderList() {
  var host = document.getElementById('awards-host');
  host.innerHTML = '<div class="aw-empty">Loading…</div>';
  try {
    var r = await window.supabase.from('award_programmes')
      .select('id,name,stage,status,year,city,announce_at')
      .eq('organizer_provider_id', _awPid())
      .order('created_at', { ascending: false });
    _awList = (r && r.data) ? r.data : [];
  } catch (e) { _awList = []; }

  var h = '<div style="display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap;">' +
    '<div><div class="ph" style="margin:0;">Awards</div>' +
    '<div class="psub" style="margin:5px 0 0;">Run your own awards programme. Entrants apply or are nominated, upload evidence, and your committee scores it.</div></div>' +
    '<button class="btn btn-pri" onclick="awNewProgramme()"><span class="ms">add</span> New programme</button></div>';

  if (!_awList.length) {
    h += '<div class="aw-empty">No programmes yet. Create one, add your categories, then open entries.</div>';
  } else {
    h += '<div class="aw-h6">Your programmes</div>';
    _awList.forEach(function (p) {
      h += '<div class="aw-row">' +
        '<div class="bd"><div class="nm">' + _awEsc(p.name) + '</div>' +
        '<div class="mt">' + _awEsc(p.city || '') + (p.year ? (p.city ? ', ' : '') + p.year : '') +
        (p.status !== 'published' ? ' — not published yet' : '') + '</div></div>' +
        '<div class="by" style="color:' + (p.stage === 'winners' || p.stage === 'closed' ? '#1f9d57' : '#c79a2e') + ';">' +
          _awEsc(_awStageLabel(p.stage)) + '</div>' +
        '<div class="aw-act"><button class="go" onclick="awOpen(\'' + p.id + '\')">Open</button></div></div>';
    });
  }
  host.innerHTML = h;
}

function _awStageLabel(s) {
  return ({ enter: 'Entries open', evidence: 'Evidence', committee: 'Committee scoring',
            shortlist: 'Shortlist', finals: 'Finals', winners: 'Winners announced', closed: 'Closed' })[s] || s;
}

// TAXONOMY, never free text: activity, category, city and country all come from
// window.FFP_TAX (hydrated from taxonomy_items). The database rejects anything
// off-list too, so a stale cached list cannot write a bad value.
var _awRegions = null;
async function _awTaxReady() {
  try { if (window.FFP_TAX_READY) await window.FFP_TAX_READY; } catch (e) {}
  return window.FFP_TAX || {};
}
// FFP_TAX keys cities BY COUNTRY and has no country array of its own, so the
// country list is those keys. Region is a newer taxonomy list the shared file
// does not hydrate yet, so read it straight from taxonomy_items.
function _awCountries(T) {
  try { return Object.keys(T.cities || {}).sort(function (a, b) { return a.localeCompare(b); }); }
  catch (e) { return []; }
}
async function _awRegionList() {
  if (_awRegions) return _awRegions;
  try {
    var r = await window.supabase.from('taxonomy_items')
      .select('value,label,sort_order').eq('list_key', 'region').eq('active', true)
      .order('sort_order');
    _awRegions = (r.data || []).map(function (x) { return x.label || x.value; });
  } catch (e) { _awRegions = []; }
  return _awRegions;
}
function _awOpts(list, sel, placeholder) {
  var h = '<option value="">' + (placeholder || 'Select') + '</option>';
  (list || []).forEach(function (v) {
    var val = (v && v.n) ? v.n : v;
    h += '<option value="' + _awEsc(val) + '"' + (sel === val ? ' selected' : '') + '>' + _awEsc(val) + '</option>';
  });
  return h;
}

// Region is only offered on an FFP-official programme; the database refuses it
// for a partner either way.
var _awOfficial = false;

// Starting a programme asks for a NAME and nothing else. Everything that shapes
// it — activity, how wide it runs, dates, look — is set on the programme itself,
// where there is room for it and it can be changed as the thinking changes.
async function awNewProgramme() {
  var body =
    '<div class="aw-hd">' +
      '<div class="k">What are these awards called</div>' +
      '<input id="aw-np-name" placeholder="Padel Awards 2026" autocomplete="off" ' +
      'onkeydown="if(event.key===\'Enter\'){event.preventDefault();awCreateProgramme();}">' +
    '</div>' +
    '<div class="psub" style="margin:14px 0 0;">You can change this later. Nothing is visible to members until you publish it.</div>';
  openModalShell('sm', 'New awards programme', body,
    '<button class="btn btn-outline" onclick="closeModal()">Cancel</button>' +
    '<button class="btn btn-pri" onclick="awCreateProgramme()">Create</button>');
  setTimeout(function () { var i = document.getElementById('aw-np-name'); if (i) i.focus(); }, 80);
}

async function awCreateProgramme() {
  var name = ((document.getElementById('aw-np-name') || {}).value || '').trim();
  if (!name) { showToast('Give the programme a name', 'error'); return; }
  try {
    var r = await window.supabase.rpc('award_programme_save',
      { p_programme: null, p_provider: _awPid(), p_patch: { name: name, year: new Date().getFullYear() } });
    if (r.error) throw r.error;
    closeModal();
    await awOpen(r.data);
    showToast('Created. Set it up below.', 'success');
  } catch (e) { showToast(_awErr(e), 'error'); }
}

async function awOpen(id) {
  _awProg = id; _awView = 'dash';
  await _awRenderDash();
}
function awBackToList() { _awView = 'list'; _awProg = null; _awRenderList(); }

// ── organizer dashboard ─────────────────────────────────────────────────
async function _awRenderDash() {
  var host = document.getElementById('awards-host');
  host.innerHTML = '<div class="aw-empty">Loading…</div>';
  try {
    var r = await window.supabase.rpc('award_organizer_dashboard', { p_programme: _awProg });
    if (r.error) throw r.error;
    _awDash = r.data;
  } catch (e) { host.innerHTML = '<div class="aw-empty">' + _awEsc(_awErr(e)) + '</div>'; return; }

  var d = _awDash, pr = d.programme || {};
  var total = Number(d.entries_total || 0), done = Number(d.entries_complete || 0);
  var pct = total ? Math.round((done / total) * 100) : 0;

  // Header. The approved mock puts exactly two actions here: the public page and
  // announcing the winners. Setup / Category / Judging / Mystery visits are
  // plumbing the mock never showed, so they sit above Categories, out of the way.
  var ceremony = _awDate(pr.announce_at);
  var h = '<div style="display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap;">' +
    '<div><button class="btn btn-sec btn-sm" onclick="awBackToList()"><span class="ms">arrow_back</span> All programmes</button>' +
    '<div class="ph" style="margin:10px 0 0;">' + _awEsc(pr.name) + '</div>' +
    '<div class="psub" style="margin:5px 0 0;">' + (d.categories || []).length + ' categories, ' + total + ' entries' +
      (ceremony ? ', ceremony ' + ceremony : '') + '</div></div>' +
    '<div style="display:flex;gap:9px;flex-wrap:wrap;">' +
      (pr.status !== 'published'
        ? '<button class="btn btn-pri" onclick="awPublish()">Publish</button>'
        : '<button class="btn btn-sec" onclick="awPublicPage()">Public page</button>') +
      '<button class="btn btn-gold" onclick="awAnnounce()">Announce winners</button>' +
    '</div></div>';

  // Key panel. Mock: total entries as the headline, complete / still-missing
  // beneath it, then the ring and three counts.
  h += '<div class="aw-key" style="margin-top:18px;">' +
    '<div><div class="k">Entries with evidence</div><div class="big">' + total + '</div>' +
    '<div class="of">' + done + ' complete' +
      (total - done > 0 ? ', ' + (total - done) + ' still missing files' : '') + '</div></div>' +
    '<div class="div"></div>' +
    '<div class="aw-ring"><div style="position:absolute;inset:0;border-radius:48px;background:conic-gradient(#F2A900 0% ' + pct + '%, rgba(255,255,255,.14) ' + pct + '% 100%);"></div>' +
    '<div class="hole"><div><b>' + pct + '%</b><u>COMPLETE</u></div></div></div>' +
    '<div class="mini">' +
      '<div><b>' + (d.judges || 0) + '</b><u>COMMITTEE</u></div>' +
      '<div><b>' + (d.shortlisted || 0) + '</b><u>SHORTLISTED</u></div>' +
      '<div><b class="gd">' + (d.finalists || 0) + '</b><u>FINALISTS</u></div>' +
    '</div></div>';

  h += _awStageRail(pr);

  // The approved layout: entries by category as a chart on the left, committee
  // progress on the right. Category management sits under it.
  var cats = d.categories || [];
  var maxE = Math.max(1, ...cats.map(function (c) { return Number(c.entries || 0); }));
  var yMax = Math.ceil(maxE / 5) * 5 || 5;
  var comCats   = cats.filter(function (c) { return c.decided_by === 'committee'; });
  var scoredTot = comCats.reduce(function (a, c) { return a + Number(c.scored || 0); }, 0);
  var entryTot  = comCats.reduce(function (a, c) { return a + Number(c.entries || 0); }, 0);

  h += '<div class="aw-split" style="margin-top:22px;">';

  h += '<div class="aw-main"><div class="aw-h6" style="margin-top:0;">Entries by category</div>';
  if (!cats.length) {
    h += '<div class="aw-empty">Add a category to start taking entries.</div>';
  } else {
    h += '<div class="aw-plot"><div class="ymax">' + yMax + '</div>';
    cats.forEach(function (c) {
      var n = Number(c.entries || 0);
      h += '<div class="b"><em>' + n + '</em><i style="height:' + Math.max(2, Math.round((n / yMax) * 160)) + 'px;"></i></div>';
    });
    h += '</div><div class="aw-xs">';
    cats.forEach(function (c) { h += '<div>' + _awEsc(c.name) + '</div>'; });
    h += '</div>';
  }
  h += '</div>';

  h += '<div class="aw-side"><div class="aw-h6" style="margin-top:0;">Committee progress</div><div class="aw-crit">';
  if (!comCats.length) {
    h += '</div><div class="aw-empty">No category is decided by the committee.</div>';
  } else {
    comCats.forEach(function (c) {
      var done = Number(c.scored || 0), all = Number(c.entries || 0);
      h += '<div class="c"><div class="tp">' +
        '<span style="font-size:12px;font-weight:800;color:#0e2531;">' + _awEsc(c.name) + '</span>' +
        '<span style="font-size:12.5px;font-weight:900;color:#0e2531;">' + done +
        '<span style="font-size:10.5px;font-weight:700;color:#8a96a1;"> / ' + all + '</span></span></div>' +
        '<div class="aw-bar"><b style="width:' + (all ? Math.round((done / all) * 100) : 0) + '%;"></b></div></div>';
    });
    h += '</div><div class="aw-tot">' +
      '<span style="font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#566069;">Scored</span>' +
      '<span class="v">' + scoredTot + '<u> / ' + entryTot + '</u></span></div>' +
      '<div class="aw-act" style="margin-top:16px;">' +
      '<button style="flex:1;padding:13px;" onclick="awNudgePanel()">Nudge panel</button>' +
      '<button class="pri" style="flex:1;padding:13px;" onclick="awAdvanceAll()">Lock shortlist</button></div>';
  }
  h += '</div></div>';

  // categories, for managing them
  h += '<div class="aw-h6" style="display:flex;align-items:baseline;justify-content:space-between;gap:14px;flex-wrap:wrap;">' +
    '<span>Categories</span>' +
    '<span style="display:flex;gap:9px;flex-wrap:wrap;text-transform:none;letter-spacing:0;">' +
      '<button class="btn btn-sec btn-sm" onclick="awSetup()"><span class="ms">tune</span> Setup</button>' +
      '<button class="btn btn-sec btn-sm" onclick="awAddCategory()"><span class="ms">add</span> Add category</button>' +
      '<button class="btn btn-sec btn-sm" onclick="awOpenJudge()"><span class="ms">gavel</span> Judging</button>' +
      '<button class="btn btn-sec btn-sm" onclick="awOpenMystery()"><span class="ms">travel_explore</span> Mystery visits</button>' +
      '<button class="btn btn-sec btn-sm" onclick="awNextStage()"><span class="ms">arrow_forward</span> Move on</button>' +
    '</span></div>';
  if (!cats.length) {
    h += '<div class="aw-empty">No categories yet. Add one to start taking entries.</div>';
  } else {
    cats.forEach(function (c) {
      var by = { members: ['Members', '#1980AD'], committee: ['Committee', '#0e2531'], data: ['Data', '#566069'] }[c.decided_by] ||
               [c.decided_by, '#566069'];
      h += '<div class="aw-row">' +
        '<div class="bd"><div class="nm">' + _awEsc(c.name) + '</div>' +
        '<div class="mt">' + c.entries + ' entries, ' + c.scored + ' scored</div></div>' +
        '<div class="by" style="color:' + by[1] + ';">' + _awEsc(by[0]) + '</div>' +
        '<div class="aw-act">' +
          '<button onclick="awEditCategory(\'' + c.id + '\')">Edit</button>' +
          '<button onclick="awEntries(\'' + c.id + '\',\'' + _awEsc(c.name).replace(/'/g, "\\'") + '\')">Entries</button>' +
          '<button class="pri" onclick="awAdvance(\'' + c.id + '\')">Advance</button>' +
        '</div></div>';
    });
  }
  host.innerHTML = h;
}

function _awStageRail(pr) {
  // Each stage carries the date it is governed by, exactly as the approved mock
  // shows it: a closed stage says Closed, the live one counts down, later ones
  // print the date they are due. Stages with no stored date print nothing.
  var stage = pr.stage;
  var ord = [['enter', 'Enter', pr.enter_closes_at], ['evidence', 'Evidence', pr.evidence_closes_at],
             ['committee', 'Committee', pr.committee_closes_at], ['shortlist', 'Shortlist', null],
             ['finals', 'Finals', null], ['winners', 'Winners', pr.announce_at]];
  var i = ord.findIndex(function (s) { return s[0] === stage; });
  var h = '<div class="aw-stg">';
  ord.forEach(function (s, n) {
    var cls = n < i ? '' : (n === i ? 'on' : 'off');
    var note;
    if (n < i) note = 'Closed';
    else if (n === i) note = _awDaysLeft(s[2]) || 'Now';
    else note = _awDate(s[2]) || '';
    h += '<div class="s ' + cls + '"><u>' + s[1] + '</u><i>' + _awEsc(note) + '</i></div>';
    if (n < ord.length - 1) h += '<div class="ln' + (n >= i ? ' dash' : '') + '"></div>';
  });
  h += '</div>';
  return h;
}

// 2026-03-14 -> "14 March". Blank for anything unparseable, so the rail simply
// stays quiet rather than printing "Invalid Date".
function _awDate(v) {
  if (!v) return '';
  var t = new Date(v);
  if (isNaN(t.getTime())) return '';
  return t.getDate() + ' ' + ['January','February','March','April','May','June','July',
    'August','September','October','November','December'][t.getMonth()];
}

function _awDaysLeft(v) {
  if (!v) return '';
  var t = new Date(v);
  if (isNaN(t.getTime())) return '';
  var n = Math.ceil((t.getTime() - Date.now()) / 86400000);
  if (n < 0) return 'Overdue';
  if (n === 0) return 'Today';
  if (n === 1) return '1 day left';
  return n + ' days left';
}

async function awPublish() {
  try {
    var r = await window.supabase.rpc('award_programme_save',
      { p_programme: _awProg, p_provider: _awPid(), p_patch: { status: 'published' } });
    if (r.error) throw r.error;
    showToast('Programme published', 'success');
    _awRenderDash();
  } catch (e) { showToast(_awErr(e), 'error'); }
}

// The public results page lives in the member app, on the same origin family as
// the portal. Organizers use it to check what entrants actually see.
function awPublicPage() {
  var pr = (_awDash && _awDash.programme) || {};
  if (!pr.id) return;
  window.open('https://app.findfitpeople.com/awards/' + pr.id, '_blank', 'noopener');
}

// "Announce winners" is the last stage move, so it is guarded harder than the
// others: it is the moment results become public and it cannot be taken back.
async function awAnnounce() {
  var pr = (_awDash && _awDash.programme) || {};
  if (pr.stage === 'winners' || pr.stage === 'closed') {
    showToast('Winners are already announced', 'error'); return;
  }
  if (pr.stage !== 'finals') {
    showToast('Finish the finals before announcing winners', 'error'); return;
  }
  if (!confirm('Announce the winners?\n\nResults become public to every member and this cannot be undone.')) return;
  try {
    var r = await window.supabase.rpc('award_set_stage', { p_programme: _awProg, p_stage: 'winners' });
    if (r.error) throw r.error;
    showToast('Winners announced', 'success');
    _awRenderDash();
  } catch (e) { showToast(_awErr(e), 'error'); }
}

// Reminds only the judges who still have entries waiting. A judge who is done
// gets nothing, so the nudge stays worth reading.
async function awNudgePanel() {
  try {
    var r = await window.supabase.rpc('award_nudge_panel', { p_programme: _awProg });
    if (r.error) throw r.error;
    var n = (r.data && r.data.sent) || 0;
    showToast(n ? 'Reminded ' + n + (n === 1 ? ' judge' : ' judges') : 'Every judge is up to date',
              n ? 'success' : 'info');
  } catch (e) { showToast(_awErr(e), 'error'); }
}

async function awNextStage() {
  var ord = ['enter', 'evidence', 'committee', 'shortlist', 'finals', 'winners', 'closed'];
  var cur = (_awDash && _awDash.programme && _awDash.programme.stage) || 'enter';
  var nxt = ord[Math.min(ord.indexOf(cur) + 1, ord.length - 1)];
  if (!confirm('Move this programme to "' + _awStageLabel(nxt) + '"?\n\nStages only move forward.')) return;
  try {
    var r = await window.supabase.rpc('award_set_stage', { p_programme: _awProg, p_stage: nxt });
    if (r.error) throw r.error;
    showToast('Now at ' + _awStageLabel(nxt), 'success');
    _awRenderDash();
  } catch (e) { showToast(_awErr(e), 'error'); }
}

// ── categories + criteria ───────────────────────────────────────────────
function awAddCategory() { _awCategoryModal(null); }
function awEditCategory(id) { _awCategoryModal(id); }

async function _awCategoryModal(id) {
  var cat = null, crit = [];
  if (id) {
    try {
      var r = await window.supabase.from('award_categories').select('*').eq('id', id).maybeSingle();
      cat = r.data;
      var rc = await window.supabase.from('award_criteria').select('*').eq('category_id', id).order('sort');
      crit = rc.data || [];
    } catch (e) {}
  }
  var T = await _awTaxReady();
  var v = function (k, d) { return cat && cat[k] != null ? cat[k] : (d == null ? '' : d); };
  var by = v('decided_by', 'committee');
  var DEC = [
    ['committee', 'A committee scores it', 'Judges you appoint score each entry against published criteria.'],
    ['members',   'Members vote',          'One vote each, open to every FFP member until voting closes.'],
    ['data',      'Platform data decides', 'Ranked automatically on what the platform already measures.']
  ];
  var crRows = crit.length ? crit : [{ label: '', max_score: 25 }];

  // The name is the heading, not a labelled box.
  var body =
    '<div class="aw-hd">' +
      '<div class="k">Category</div>' +
      '<input id="aw-c-name" value="' + _awEsc(v('name')) + '" placeholder="Club of the Year" autocomplete="off">' +
    '</div>';

  // Who decides is the category's defining choice, so it gets real rows with the
  // consequence spelled out, the same pattern members see when they vote.
  body +=
    '<div class="aw-sect">' +
      '<div class="aw-q">Who decides it?</div>' +
      '<div class="aw-pick" id="aw-c-by-wrap">' +
        DEC.map(function (d) {
          return '<button type="button" data-v="' + d[0] + '" class="' + (by === d[0] ? 'on' : '') + '" ' +
            'onclick="awPickDecider(\'' + d[0] + '\')" aria-pressed="' + (by === d[0]) + '">' +
            '<span class="bd"><b>' + d[1] + '</b><span>' + d[2] + '</span></span>' +
            '<span class="ms tick">' + (by === d[0] ? 'check_circle' : 'radio_button_unchecked') + '</span></button>';
        }).join('') +
      '</div>' +
      '<input type="hidden" id="aw-c-by" value="' + _awEsc(by) + '">' +
    '</div>';

  body +=
    '<div class="aw-sect">' +
      '<div class="aw-q">Which activity is it for?</div>' +
      '<div class="aw-sent">For <select id="aw-c-activity">' + _awOpts(T.activities, v('activity'), 'any activity') + '</select></div>' +
    '</div>' +
    '<div class="aw-sect">' +
      '<div class="aw-q">How many go through?</div>' +
      '<div class="aw-n2">' +
        '<div class="n"><u>Shortlist</u><input id="aw-c-sl" type="number" min="1" value="' + _awEsc(v('shortlist_size', 6)) + '"></div>' +
        '<div class="n"><u>Finals</u><input id="aw-c-fn" type="number" min="1" value="' + _awEsc(v('finals_size', 3)) + '"></div>' +
      '</div>' +
    '</div>';

  // Criteria were a textarea of "Label, max" lines. They are what judges score
  // against and what entrants read before entering, so they get real rows and a
  // running total out of which every entry is marked.
  body +=
    '<div class="aw-sect" id="aw-c-critsect">' +
      '<div class="aw-q">What are entries scored on?</div>' +
      '<div class="aw-cr" id="aw-c-cr">' + _awCritRows(crRows) + '</div>' +
      '<button class="btn btn-sec btn-sm" style="margin-top:14px;" onclick="awAddCrit()">' +
        '<span class="ms">add</span> Add a criterion</button>' +
      '<div class="aw-cr"><div class="tot"><u>Scored out of</u><b id="aw-c-tot">0</b></div></div>' +
      '<div class="psub" style="margin:12px 0 0;">Entrants see these before they enter, so the basis of the decision is published up front.</div>' +
    '</div>';

  body +=
    '<div class="aw-sect">' +
      '<div class="aw-q">Do mystery visits count toward the result?</div>' +
      '<div class="aw-pick">' +
        [['true', 'Yes, they are scored in', 'The assessor’s score is added to the committee’s.'],
         ['false', 'No, advisory only', 'Organisers read the reports, they do not affect the result.']]
        .map(function (d) {
          var on = (v('mystery_counts', true) !== false ? 'true' : 'false') === d[0];
          return '<button type="button" data-v="' + d[0] + '" class="' + (on ? 'on' : '') + '" ' +
            'onclick="awPickMystery(\'' + d[0] + '\')" aria-pressed="' + on + '">' +
            '<span class="bd"><b>' + d[1] + '</b><span>' + d[2] + '</span></span>' +
            '<span class="ms tick">' + (on ? 'check_circle' : 'radio_button_unchecked') + '</span></button>';
        }).join('') +
      '</div>' +
      '<input type="hidden" id="aw-c-ms" value="' + (v('mystery_counts', true) !== false ? 'true' : 'false') + '">' +
    '</div>';

  openModalShell('sm', id ? 'Edit category' : 'New category', body,
    '<button class="btn btn-outline" onclick="closeModal()">Cancel</button>' +
    '<button class="btn btn-pri" onclick="awSaveCategory(' + (id ? "'" + id + "'" : 'null') + ')">Save</button>');
  setTimeout(function () { awPickDecider(by); awCritTotal(); }, 40);
}

// One criterion per row: a label and the marks it carries. The total is what
// every entry is scored out of, so it is shown rather than left to be added up.
function _awCritRows(rows) {
  var h = (rows || []).map(function (c, i) {
    return '<div class="r" data-i="' + i + '">' +
      '<input class="l" value="' + _awEsc(c.label || '') + '" placeholder="Growth and reach" autocomplete="off" oninput="awCritTotal()">' +
      '<input class="m" type="number" min="1" value="' + _awEsc(c.max_score == null ? 25 : c.max_score) + '" oninput="awCritTotal()">' +
      '<span class="of">marks</span>' +
      '<span class="ms x" title="Remove" onclick="awDropCrit(this)">close</span></div>';
  }).join('');
  return h;
}

function awCritTotal() {
  var wrap = document.getElementById('aw-c-cr'); if (!wrap) return;
  var t = 0;
  Array.prototype.forEach.call(wrap.querySelectorAll('.r'), function (r) {
    var lab = r.querySelector('.l').value.trim();
    if (lab) t += Number(r.querySelector('.m').value || 0);
  });
  var named = !!wrap.querySelector('.r .l') &&
    Array.prototype.some.call(wrap.querySelectorAll('.r .l'), function (i) { return i.value.trim(); });
  var el = document.getElementById('aw-c-tot');
  if (el) el.textContent = named ? t : '\u2014';
}

function awAddCrit() {
  var wrap = document.getElementById('aw-c-cr'); if (!wrap) return;
  var d = document.createElement('div');
  d.className = 'r';
  d.innerHTML = '<input class="l" value="" placeholder="Growth and reach" autocomplete="off" oninput="awCritTotal()">' +
    '<input class="m" type="number" min="1" value="25" oninput="awCritTotal()">' +
    '<span class="of">marks</span>' +
    '<span class="ms x" title="Remove" onclick="awDropCrit(this)">close</span>';
  wrap.appendChild(d);
  var f = d.querySelector('.l'); if (f) f.focus();
  awCritTotal();
}

function awDropCrit(el) {
  var row = el.closest('.r'); if (!row) return;
  var wrap = document.getElementById('aw-c-cr');
  if (wrap && wrap.querySelectorAll('.r').length <= 1) {
    row.querySelector('.l').value = ''; awCritTotal(); return;
  }
  row.parentNode.removeChild(row);
  awCritTotal();
}

function awPickDecider(val) {
  var h = document.getElementById('aw-c-by'); if (h) h.value = val;
  _awPaintPick('aw-c-by-wrap', val);
  // Only a committee-scored category is marked against criteria.
  var sect = document.getElementById('aw-c-critsect');
  if (sect) sect.style.display = (val === 'committee') ? '' : 'none';
}

function awPickMystery(val) {
  var h = document.getElementById('aw-c-ms'); if (h) h.value = val;
  var wrap = h && h.parentNode ? h.parentNode.querySelector('.aw-pick') : null;
  if (wrap) _awPaintPickEl(wrap, val);
}

function _awPaintPick(wrapId, val) {
  var wrap = document.getElementById(wrapId); if (wrap) _awPaintPickEl(wrap, val);
}

function _awPaintPickEl(wrap, val) {
  Array.prototype.forEach.call(wrap.querySelectorAll('button'), function (b) {
    var on = b.getAttribute('data-v') === val;
    b.className = on ? 'on' : '';
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    var t = b.querySelector('.tick');
    if (t) t.textContent = on ? 'check_circle' : 'radio_button_unchecked';
  });
}

async function awSaveCategory(id) {
  var g = function (x) { return (document.getElementById(x) || {}).value || ''; };
  var patch = {
    name: g('aw-c-name').trim(),
    decided_by: g('aw-c-by'),
    activity: g('aw-c-activity'),
    mystery_counts: g('aw-c-ms') === 'true',
    shortlist_size: parseInt(g('aw-c-sl'), 10) || null,
    finals_size: parseInt(g('aw-c-fn'), 10) || null
  };
  if (!patch.name) { showToast('Give the category a name', 'error'); return; }
  try {
    var r = await window.supabase.rpc('award_category_save',
      { p_category: id, p_programme: _awProg, p_patch: patch });
    if (r.error) throw r.error;
    var cid = r.data;
    // Criteria come from the rows now. A row with no label is an empty row the
    // organiser never filled in, so it is dropped rather than saved blank.
    var list = [];
    var wrap = document.getElementById('aw-c-cr');
    if (wrap) {
      Array.prototype.forEach.call(wrap.querySelectorAll('.r'), function (row) {
        var lab = row.querySelector('.l').value.trim();
        if (!lab) return;
        var max = parseInt(row.querySelector('.m').value, 10);
        list.push({ label: lab, max_score: isNaN(max) || max < 1 ? 25 : max });
      });
    }
    var rc = await window.supabase.rpc('award_criteria_set', { p_category: cid, p_list: list });
    if (rc.error) throw rc.error;
    closeModal();
    showToast('Category saved', 'success');
    _awRenderDash();
  } catch (e) { showToast(_awErr(e), 'error'); }
}

async function awAdvance(catId) {
  var body = '<div class="psub" style="margin:0 0 14px;">Promotes the top entries by whatever that category is decided on — votes for a members category, average committee total for a judged one.</div>' +
    '<div class="aw-q">Where do the top entries go?</div>' +
    '<div class="aw-sent">Move them to the <select id="aw-adv-to">' +
      '<option value="shortlisted">shortlist</option>' +
      '<option value="finalist">finals</option>' +
      '<option value="winner">winner</option>' +
    '</select></div>';
  openModalShell('sm', 'Advance a category', body,
    '<button class="btn btn-outline" onclick="closeModal()">Cancel</button>' +
    '<button class="btn btn-pri" onclick="awDoAdvance(\'' + catId + '\')">Advance</button>');
}

// The approved panel's "Lock shortlist" acts on the whole programme, so it
// advances every category by whatever each one is decided on.
async function awAdvanceAll() {
  var cats = (_awDash && _awDash.categories) || [];
  var live = cats.filter(function (c) { return c.decided_by !== 'data'; });
  if (!live.length) { showToast('No categories to advance', 'error'); return; }
  if (!confirm('Lock the shortlist for ' + live.length + ' categories?\n\nEach one advances by what it is decided on, votes or committee score.')) return;
  var ok = 0, failed = 0;
  for (var i = 0; i < live.length; i++) {
    try {
      var r = await window.supabase.rpc('award_advance', { p_category: live[i].id, p_to: 'shortlisted' });
      if (r.error) throw r.error;
      ok += (r.data && r.data.advanced) || 0;
    } catch (e) { failed++; }
  }
  if (!failed) {
    try { await window.supabase.rpc('award_set_stage', { p_programme: _awProg, p_stage: 'shortlist' }); }
    catch (e) { /* categories are locked either way; the rail can be moved by hand */ }
  }
  showToast(ok + ' shortlisted' + (failed ? ', ' + failed + ' categories could not be advanced' : ''), failed ? 'error' : 'success');
  _awRenderDash();
}

async function awDoAdvance(catId) {
  var to = (document.getElementById('aw-adv-to') || {}).value || 'shortlisted';
  try {
    var r = await window.supabase.rpc('award_advance', { p_category: catId, p_to: to });
    if (r.error) throw r.error;
    closeModal();
    showToast((r.data && r.data.advanced ? r.data.advanced : 0) + ' moved, by ' + (r.data && r.data.by), 'success');
    _awRenderDash();
  } catch (e) { showToast(_awErr(e), 'error'); }
}

// ── entries queue for one category ──────────────────────────────────────
async function awEntries(catId, catName) {
  var host = document.getElementById('awards-host');
  host.innerHTML = '<div class="aw-empty">Loading…</div>';
  var rows = [];
  try {
    var r = await window.supabase.rpc('award_judge_queue', { p_programme: _awProg, p_category: catId });
    if (r.error) throw r.error;
    rows = r.data || [];
  } catch (e) { host.innerHTML = '<div class="aw-empty">' + _awEsc(_awErr(e)) + '</div>'; return; }

  var h = '<button class="btn btn-sec btn-sm" onclick="awOpen(\'' + _awProg + '\')"><span class="ms">arrow_back</span> Programme</button>' +
    '<div class="ph" style="margin:10px 0 0;">' + _awEsc(catName || 'Entries') + '</div>' +
    '<div class="psub" style="margin:5px 0 0;">' + rows.length + ' entries with evidence</div>';
  if (!rows.length) {
    h += '<div class="aw-empty">Nothing submitted in this category yet.</div>';
  } else {
    rows.forEach(function (e) {
      h += '<div class="aw-row">' +
        '<div class="bd"><div class="nm">' + _awEsc(e.name) + '</div>' +
        '<div class="mt">' + e.evidence + ' files' + (e.videos ? ', ' + e.videos + ' video' : '') + ' — ' + _awEsc(e.status) + '</div></div>' +
        '<div class="num' + (e.my_total == null ? ' dim' : '') + '">' + (e.my_total == null ? '—' : e.my_total) + '</div>' +
        '<div class="aw-act">' +
          '<button class="go" onclick="awReview(\'' + e.entry_id + '\')">Review</button>' +
          '<button onclick="awDecide(\'' + e.entry_id + '\',\'shortlisted\')">Shortlist</button>' +
        '</div></div>';
    });
  }
  host.innerHTML = h;
}

async function awDecide(entryId, status) {
  try {
    var r = await window.supabase.rpc('award_decide', { p_entry: entryId, p_status: status, p_note: null });
    if (r.error) throw r.error;
    showToast('Marked ' + status, 'success');
    if (_awView === 'entry') { awReview(entryId); } else { _awRenderDash(); }
  } catch (e) { showToast(_awErr(e), 'error'); }
}

// ── judging ─────────────────────────────────────────────────────────────
async function awOpenJudge() { _awView = 'judge'; await _awRenderJudge(); }

async function _awRenderJudge() {
  var host = document.getElementById('awards-host');
  host.innerHTML = '<div class="aw-empty">Loading…</div>';
  try {
    var r = await window.supabase.rpc('award_judge_queue', { p_programme: _awProg, p_category: null });
    if (r.error) throw r.error;
    _awQueue = r.data || [];
  } catch (e) { host.innerHTML = '<div class="aw-empty">' + _awEsc(_awErr(e)) + '</div>'; return; }

  var left = _awQueue.filter(function (e) { return !e.scored_by_me; }).length;
  var h = '<button class="btn btn-sec btn-sm" onclick="awOpen(\'' + _awProg + '\')"><span class="ms">arrow_back</span> Programme</button>' +
    '<div class="ph" style="margin:10px 0 0;">Judging</div>' +
    '<div class="psub" style="margin:5px 0 0;">' + left + ' of ' + _awQueue.length + ' still to score</div>';
  if (!_awQueue.length) {
    h += '<div class="aw-empty">Nothing to score yet.</div>';
  } else {
    _awQueue.forEach(function (e) {
      h += '<div class="aw-row">' +
        '<div class="bd"><div class="nm">' + _awEsc(e.name) + '</div>' +
        '<div class="mt">' + _awEsc(e.category) + ', ' + e.evidence + ' files</div></div>' +
        '<div class="num' + (e.my_total == null ? ' dim' : '') + '">' +
          (e.my_total == null ? '—' : e.my_total + (e.max_total ? '<span style="font-size:12px;font-weight:700;color:#8a96a1;"> / ' + e.max_total + '</span>' : '')) +
        '</div>' +
        '<div class="aw-act"><button class="go" onclick="awReview(\'' + e.entry_id + '\')">' +
          (e.scored_by_me ? 'Review' : 'Score') + '</button></div></div>';
    });
  }
  host.innerHTML = h;
}

// ── one entry: its evidence and the scorecard ───────────────────────────
async function awReview(entryId) {
  _awView = 'entry';
  var host = document.getElementById('awards-host');
  host.innerHTML = '<div class="aw-empty">Loading…</div>';
  try {
    var r = await window.supabase.rpc('award_entry_detail', { p_entry: entryId });
    if (r.error) throw r.error;
    _awEntry = r.data; _awEntry._id = entryId;
  } catch (e) { host.innerHTML = '<div class="aw-empty">' + _awEsc(_awErr(e)) + '</div>'; return; }
  // evidence sits in a private bucket, so each file needs a short-lived signed url
  var ev = (_awEntry.evidence || []);
  for (var i = 0; i < ev.length; i++) {
    if (ev[i].path && !ev[i].signed) {
      try {
        var s = await window.supabase.storage.from('award-evidence').createSignedUrl(ev[i].path, 3600);
        ev[i].signed = (s && s.data && s.data.signedUrl) || null;
      } catch (e) { ev[i].signed = null; }
    }
  }
  _awShownEvidence = 0;
  _awRenderEntry();
}

var _awShownEvidence = 0;

function _awRenderEntry() {
  var host = document.getElementById('awards-host');
  var d = _awEntry; if (!d) return;
  var ev = d.evidence || [], crit = d.criteria || [];
  var shown = ev[_awShownEvidence] || null;

  var h = '<div style="display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap;">' +
    '<div><button class="btn btn-sec btn-sm" onclick="awOpenJudge()"><span class="ms">arrow_back</span> Judging</button>' +
    '<div class="ph" style="margin:10px 0 0;">' + _awEsc(d.entry.name) + '</div>' +
    '<div class="psub" style="margin:5px 0 0;">' + _awEsc(d.category.name) + ', ' + _awEsc(d.entry.status) + '</div></div></div>';

  h += '<div class="aw-split" style="margin-top:18px;"><div class="aw-main">';

  if (d.entry.pitch) {
    h += '<div class="aw-h6" style="margin-top:0;">Their case</div>' +
      '<div style="font-size:13px;font-weight:600;color:#0e2531;line-height:1.65;margin-top:10px;">' +
      _awEsc(d.entry.pitch) + '</div>';
  }

  h += '<div class="aw-h6">Evidence</div>';
  if (!ev.length) {
    h += '<div class="aw-empty">No evidence attached.</div>';
  } else {
    if (shown && shown.kind === 'video' && shown.signed) {
      h += '<div class="aw-stage-img" style="margin-top:12px;"><video controls preload="metadata" src="' + _awEsc(shown.signed) + '"></video></div>';
    } else if (shown && shown.kind === 'image' && shown.signed) {
      h += '<div class="aw-stage-img" style="margin-top:12px;"><img alt="" src="' + _awEsc(shown.signed) + '"></div>';
    } else if (shown) {
      h += '<div style="margin-top:12px;display:flex;align-items:center;gap:12px;padding:16px 0;border-top:1px solid rgba(15,37,49,.10);border-bottom:1px solid rgba(15,37,49,.10);">' +
        '<span class="ms" style="color:#1980AD;">' + (shown.kind === 'link' ? 'link' : 'description') + '</span>' +
        '<div style="flex:1;font-size:13px;font-weight:800;color:#0e2531;">' + _awEsc(shown.title || shown.kind) + '</div>' +
        '<a class="btn btn-sec btn-sm" target="_blank" rel="noopener" href="' + _awEsc(shown.url || shown.signed || '#') + '">Open</a></div>';
    }
    h += '<div class="aw-thumbs">';
    ev.forEach(function (f, i) {
      var label = f.kind === 'video' ? 'movie' : f.kind === 'image' ? 'image' : f.kind === 'link' ? 'link' : 'description';
      if (f.kind === 'image' && f.signed) {
        h += '<button class="' + (i === _awShownEvidence ? 'on' : '') + '" onclick="awShowEvidence(' + i + ')" aria-label="' + _awEsc(f.title || 'Evidence') + '">' +
             '<img alt="" src="' + _awEsc(f.signed) + '"></button>';
      } else {
        h += '<button class="' + (i === _awShownEvidence ? 'on' : '') + '" onclick="awShowEvidence(' + i + ')" ' +
             'style="width:78px;height:56px;border-radius:9px;border:1px solid rgba(15,37,49,.16);display:grid;place-items:center;' +
             (i === _awShownEvidence ? 'outline:3px solid #1980AD;outline-offset:2px;' : '') + '" aria-label="' + _awEsc(f.title || 'Evidence') + '">' +
             '<span class="ms" style="color:#1980AD;">' + label + '</span></button>';
      }
    });
    h += '</div>';
  }
  h += '</div>';

  // scorecard
  h += '<div class="aw-side">';
  if (!crit.length) {
    h += '<div class="aw-h6" style="margin-top:0;">Scoring</div>' +
      '<div class="aw-empty">This category has no criteria, so it is not scored here.</div>';
  } else {
    var tot = 0, max = 0;
    h += '<div class="aw-h6" style="margin-top:0;">Your score</div><div class="aw-crit">';
    crit.forEach(function (c) {
      var mine = c.my_score == null ? '' : c.my_score;
      tot += Number(c.my_score || 0); max += Number(c.max_score || 0);
      h += '<div class="c"><div class="tp">' +
        '<span style="font-size:12px;font-weight:800;color:#0e2531;">' + _awEsc(c.label) + '</span>' +
        '<span><input type="number" min="0" max="' + c.max_score + '" value="' + mine + '" ' +
          'data-crit="' + c.id + '" oninput="awRecalc()" aria-label="' + _awEsc(c.label) + '">' +
          '<span style="font-size:11px;font-weight:700;color:#8a96a1;"> / ' + c.max_score + '</span></span></div>' +
        '<div class="aw-bar"><b data-bar="' + c.id + '" style="width:' +
          (c.max_score ? Math.round((Number(c.my_score || 0) / c.max_score) * 100) : 0) + '%;"></b></div></div>';
    });
    h += '</div><div class="aw-tot"><span style="font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#566069;">Your total</span>' +
      '<span class="v" id="aw-total">' + tot + '<u> / ' + max + '</u></span></div>' +
      '<div class="aw-act" style="margin-top:16px;">' +
      '<button class="pri" style="flex:1;padding:13px;" onclick="awSaveScore()">Save score</button>' +
      '<button style="flex:1;padding:13px;" onclick="awDecide(\'' + d._id + '\',\'finalist\')">Advance to finals</button></div>';
  }
  h += '</div></div>';
  host.innerHTML = h;
}

function awShowEvidence(i) { _awShownEvidence = i; _awRenderEntry(); }

function awRecalc() {
  var tot = 0, max = 0;
  document.querySelectorAll('#panel-awards .aw-crit input[data-crit]').forEach(function (inp) {
    var v = Number(inp.value || 0), m = Number(inp.getAttribute('max') || 0);
    if (v > m) { inp.value = m; v = m; }
    if (v < 0) { inp.value = 0; v = 0; }
    tot += v; max += m;
    var bar = document.querySelector('#panel-awards .aw-bar b[data-bar="' + inp.getAttribute('data-crit') + '"]');
    if (bar) bar.style.width = (m ? Math.round((v / m) * 100) : 0) + '%';
  });
  var el = document.getElementById('aw-total');
  if (el) el.innerHTML = tot + '<u> / ' + max + '</u>';
}

async function awSaveScore() {
  var scores = {};
  document.querySelectorAll('#panel-awards .aw-crit input[data-crit]').forEach(function (inp) {
    if (inp.value !== '') scores[inp.getAttribute('data-crit')] = Number(inp.value);
  });
  if (!Object.keys(scores).length) { showToast('Enter at least one score', 'error'); return; }
  try {
    var r = await window.supabase.rpc('award_score_set', { p_entry: _awEntry._id, p_scores: scores });
    if (r.error) throw r.error;
    showToast('Score saved, ' + (r.data && r.data.total) + ' total', 'success');
  } catch (e) { showToast(_awErr(e), 'error'); }
}

// ── mystery visits ──────────────────────────────────────────────────────
// Anonymous assessors. The organizer assigns, the assessor files, and the
// entrant is never shown any of it — award_can_see_visit enforces that server
// side, this screen just never offers it.
var _awVisits = [];

async function awOpenMystery() { _awView = 'mystery'; await _awRenderMystery(); }

async function _awRenderMystery() {
  var host = document.getElementById('awards-host');
  host.innerHTML = '<div class="aw-empty">Loading…</div>';
  try {
    var r = await window.supabase.rpc('award_mystery_list', { p_programme: _awProg });
    if (r.error) throw r.error;
    _awVisits = r.data || [];
  } catch (e) { host.innerHTML = '<div class="aw-empty">' + _awEsc(_awErr(e)) + '</div>'; return; }

  var filed = _awVisits.filter(function (v) { return v.status === 'submitted'; }).length;
  var h = '<button class="btn btn-sec btn-sm" onclick="awOpen(\'' + _awProg + '\')"><span class="ms">arrow_back</span> Programme</button>' +
    '<div style="display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap;">' +
    '<div><div class="ph" style="margin:10px 0 0;">Mystery visits</div>' +
    '<div class="psub" style="margin:5px 0 0;">' + filed + ' of ' + _awVisits.length + ' filed. The business never sees the assessor or the report.</div></div>' +
    '<button class="btn btn-pri" onclick="awAssignMystery()"><span class="ms">add</span> Send an assessor</button></div>';

  if (!_awVisits.length) {
    h += '<div class="aw-empty">No visits yet. Send an assessor to an entry and their score joins the panel’s.</div>';
  } else {
    _awVisits.forEach(function (v) {
      h += '<div class="aw-row">' +
        '<div class="bd"><div class="nm">' + _awEsc(v.entrant) + '</div>' +
        '<div class="mt">' + _awEsc(v.category) + ', ' + _awEsc(v.shopper) +
        (v.window_from ? ', ' + _awEsc(v.window_from) + ' to ' + _awEsc(v.window_to) : '') + '</div></div>' +
        '<div class="num' + (v.total == null ? ' dim' : '') + '">' +
          (v.total == null ? '—' : v.total + (v.max_total ? '<span style="font-size:12px;font-weight:700;color:#8a96a1;"> / ' + v.max_total + '</span>' : '')) +
        '</div>' +
        '<div class="by" style="color:' + (v.status === 'submitted' ? '#1f9d57' : v.status === 'declined' ? '#e2483d' : '#c79a2e') + ';">' +
          _awEsc(v.status === 'submitted' ? 'Filed' : v.status === 'accepted' ? 'Accepted' : v.status === 'declined' ? 'Declined' : 'Assigned') + '</div>' +
        '<div class="aw-act">' +
          (v.status === 'submitted'
            ? '<button class="go" onclick="awMysteryReport(\'' + v.visit_id + '\')">Read report</button>'
            : '<button disabled style="opacity:.5;">Waiting</button>') +
        '</div></div>';
    });
  }
  host.innerHTML = h;
}

async function awAssignMystery() {
  var entries = [];
  try {
    var r = await window.supabase.rpc('award_judge_queue', { p_programme: _awProg, p_category: null });
    entries = (r.data || []);
  } catch (e) {}
  if (!entries.length) { showToast('No submitted entries to visit yet', 'error'); return; }

  var opts = entries.map(function (e) {
    return '<option value="' + e.entry_id + '">' + _awEsc(e.name) + ' — ' + _awEsc(e.category) + '</option>';
  }).join('');

  var body =
    '<div class="psub" style="margin:0 0 14px;">The assessor goes as an ordinary customer. They never appear to the business, and their report is only ever visible to you.</div>' +
    '<div class="aw-sect">' +
      '<div class="aw-q">Who are they visiting?</div>' +
      '<div class="aw-sent"><select id="aw-ms-entry">' + opts + '</select></div>' +
    '</div>' +
    '<div class="aw-sect">' +
      '<div class="aw-q">Who is going?</div>' +
      '<input class="aw-srch" id="aw-ms-q" placeholder="Search members by name or email" autocomplete="off" oninput="awMysterySearch()">' +
      '<div id="aw-ms-results"></div>' +
      '<input type="hidden" id="aw-ms-member">' +
    '</div>' +
    '<div class="aw-sect">' +
      '<div class="aw-q">When should they go?</div>' +
      '<div class="aw-dts">' +
        '<div class="d"><u>Any time from</u><input id="aw-ms-from" type="date"></div>' +
        '<div class="d"><u>Up to</u><input id="aw-ms-to" type="date"></div>' +
      '</div>' +
    '</div>' +
    '<div id="aw-ms-msg" class="psub" style="margin:14px 0 0;"></div>';
  openModalShell('sm', 'Send an assessor', body,
    '<button class="btn btn-outline" onclick="closeModal()">Cancel</button>' +
    '<button class="btn btn-pri" onclick="awDoAssignMystery()">Assign</button>');
}

var _awMsT = null;
function awMysterySearch() {
  clearTimeout(_awMsT);
  _awMsT = setTimeout(async function () {
    var q = ((document.getElementById('aw-ms-q') || {}).value || '').trim();
    var box = document.getElementById('aw-ms-results');
    if (!box) return;
    if (q.length < 2) { box.innerHTML = ''; return; }
    try {
      var r = await window.supabase.rpc('award_member_search', { p_programme: _awProg, p_q: q });
      var rows = r.data || [];
      box.innerHTML = rows.length ? rows.map(function (m) {
        return '<button class="aw-row" style="width:100%;text-align:left;background:none;" ' +
          'onclick="awPickShopper(\'' + m.id + '\',\'' + _awEsc(m.name).replace(/'/g, "\\'") + '\')">' +
          '<div class="bd"><div class="nm">' + _awEsc(m.name) + '</div>' +
          '<div class="mt">' + _awEsc([m.city, m.email_hint].filter(Boolean).join(', ')) + '</div></div></button>';
      }).join('') : '<div class="psub" style="margin:8px 0 0;">No members match that</div>';
    } catch (e) {
      box.innerHTML = '<div class="psub" style="margin:8px 0 0;">' + _awEsc(_awErr(e)) + '</div>';
    }
  }, 280);
}

function awPickShopper(id, name) {
  var h = document.getElementById('aw-ms-member'); if (h) h.value = id;
  var q = document.getElementById('aw-ms-q'); if (q) q.value = name;
  var box = document.getElementById('aw-ms-results'); if (box) box.innerHTML = '';
}

async function awDoAssignMystery() {
  var g = function (x) { return ((document.getElementById(x) || {}).value || '').trim(); };
  var member = g('aw-ms-member');
  var msg = document.getElementById('aw-ms-msg');
  if (!member) { if (msg) { msg.textContent = 'Search for the assessor and tap their name'; msg.style.color = 'var(--ffp-red)'; } return; }
  try {
    var r = await window.supabase.rpc('award_mystery_assign', {
      p_entry: g('aw-ms-entry'), p_shopper: member,
      p_from: g('aw-ms-from') || null, p_to: g('aw-ms-to') || null
    });
    if (r.error) throw r.error;
    closeModal();
    showToast('Assessor assigned', 'success');
    _awRenderMystery();
  } catch (e) {
    if (msg) { msg.innerHTML = _awEsc(_awErr(e)); msg.style.color = 'var(--ffp-red)'; }
  }
}

async function awMysteryReport(visitId) {
  var d = null;
  try {
    var r = await window.supabase.rpc('award_mystery_report', { p_visit: visitId });
    if (r.error) throw r.error;
    d = r.data;
  } catch (e) { showToast(_awErr(e), 'error'); return; }
  if (!d) return;

  var crit = (d.criteria || []);
  var tot = crit.reduce(function (a, c) { return a + Number(c.score || 0); }, 0);
  var max = crit.reduce(function (a, c) { return a + Number(c.max_score || 0); }, 0);

  var body =
    '<div class="psub" style="margin:0 0 4px;">' + _awEsc(d.entrant) + ', ' + _awEsc(d.category) + '</div>' +
    '<div style="font-size:13px;font-weight:600;color:var(--ffp-text);line-height:1.65;margin:12px 0 18px;white-space:pre-line;">' +
      _awEsc(d.report || '') + '</div>' +
    crit.map(function (c) {
      var pctv = c.max_score ? Math.round((Number(c.score || 0) / c.max_score) * 100) : 0;
      return '<div style="padding:12px 0;border-top:1px solid rgba(15,37,49,.10);">' +
        '<div style="display:flex;align-items:baseline;justify-content:space-between;">' +
        '<span style="font-size:12px;font-weight:800;color:var(--ffp-text);">' + _awEsc(c.label) + '</span>' +
        '<span style="font-size:12.5px;font-weight:900;color:var(--ffp-text);">' + (c.score == null ? '—' : c.score) +
        '<span style="font-size:10.5px;font-weight:700;color:#8a96a1;"> / ' + c.max_score + '</span></span></div>' +
        '<div class="aw-bar"><b style="width:' + pctv + '%;"></b></div></div>';
    }).join('') +
    '<div class="aw-tot"><span style="font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#566069;">Visit total</span>' +
      '<span class="v">' + tot + '<u> / ' + max + '</u></span></div>' +
    (d.spend_aed != null ? '<div class="psub" style="margin:12px 0 0;">Spent on the visit: ' + _awEsc(d.spend_aed) + '</div>' : '') +
    (d.visited_at ? '<div class="psub" style="margin:4px 0 0;">Visited ' + _awEsc(String(d.visited_at).slice(0, 10)) + '</div>' : '');

  openModalShell('sm', 'Mystery visit report', body,
    '<button class="btn btn-pri" onclick="closeModal()">Close</button>');
}

// ── setup: everything that shapes the programme, on the programme ───────
async function awSetup() {
  var T = await _awTaxReady();
  var pr = {};
  try {
    var r = await window.supabase.from('award_programmes').select('*').eq('id', _awProg).maybeSingle();
    pr = r.data || {};
  } catch (e) {}
  _awOfficial = !!pr.ffp_official;

  var cities = (typeof T.allCities === 'function') ? T.allCities() : [];
  var countries = _awCountries(T);
  var regions = _awOfficial ? await _awRegionList() : [];
  var v = function (k) { return pr[k] == null ? '' : pr[k]; };
  var dt = function (k) { return pr[k] ? String(pr[k]).slice(0, 10) : ''; };

  var ACCENTS = ['#F2A900', '#1980AD', '#0e2531', '#1c9d54', '#c0392b', '#7d3cc4'];
  var acc = (v('accent') || '#F2A900').toUpperCase();

  // Identity carries the depth, the way the dashboard's key panel does. The name
  // is typed straight onto it rather than into a labelled white box.
  var body =
    '<div class="aw-idn">' +
      '<div class="k">Awards programme</div>' +
      '<input class="nmi" id="aw-s-name" value="' + _awEsc(v('name')) + '" placeholder="Padel Awards 2026" autocomplete="off">' +
      '<input class="tgi" id="aw-s-tagline" value="' + _awEsc(v('tagline')) + '" placeholder="One line about it, shown to entrants" autocomplete="off">' +
      '<div class="hint">Nothing is visible to members until you publish it.</div>' +
    '</div>';

  // What it covers reads as one sentence, so the choices make sense together
  // instead of arriving as four identical dropdowns in a column.
  body +=
    '<div class="aw-sect">' +
      '<div class="aw-q">What does it cover?</div>' +
      '<div class="aw-sent">' +
        'Awards for ' +
        '<select id="aw-s-activity">' + _awOpts(T.activities, v('activity'), 'any activity') + '</select>' +
        ' in ' +
        '<select id="aw-s-category">' + _awOpts(T.providerCategories || [], v('category'), 'any category') + '</select>' +   /* the 'category' taxonomy (what the DB checks); T.categories never existed, so this list was always empty */
        ', across ' +
        '<select id="aw-s-scope" onchange="awScopeChanged()">' +
          '<option value="city"' + (v('scope') === 'city' ? ' selected' : '') + '>one city</option>' +
          '<option value="country"' + (v('scope') === 'country' ? ' selected' : '') + '>one country</option>' +
          (_awOfficial ? '<option value="region"' + (v('scope') === 'region' ? ' selected' : '') + '>a region</option>' : '') +
        '</select>' +
        '<span id="aw-s-city-row">, <select id="aw-s-city">' + _awOpts(cities, v('city'), 'pick a city') + '</select></span>' +
        '<span id="aw-s-country-row">, <select id="aw-s-country">' + _awOpts(countries, v('country'), 'pick a country') + '</select></span>' +
        (_awOfficial
          ? '<span id="aw-s-region-row">, <select id="aw-s-region">' + _awOpts(regions, v('region'), 'pick a region') + '</select></span>'
          : '') +
      '</div>' +
      (_awOfficial ? '' : '<div class="psub" style="margin:10px 0 0;">A partner programme covers one city or one country. FFP runs the regional ones.</div>') +
    '</div>';

  // The dates sit on the same rail the dashboard shows them on, in the order
  // they happen, so the shape is familiar before anything is filled in.
  body +=
    '<div class="aw-sect">' +
      '<div class="aw-q">When does each stage close?</div>' +
      '<div class="aw-dts">' +
        '<div class="d"><u>Entries close</u><input id="aw-s-enter" type="date" value="' + dt('enter_closes_at') + '"></div>' +
        '<div class="d"><u>Evidence closes</u><input id="aw-s-evid" type="date" value="' + dt('evidence_closes_at') + '"></div>' +
        '<div class="d"><u>Scoring closes</u><input id="aw-s-committee" type="date" value="' + dt('committee_closes_at') + '"></div>' +
        '<div class="d"><u>Winners announced</u><input id="aw-s-announce" type="date" value="' + dt('announce_at') + '"></div>' +
      '</div>' +
    '</div>';

  // Images are chosen through the shared uploader, not pasted as URLs.
  var logo = v('logo_url'), cover = v('cover_url');
  body +=
    '<div class="aw-sect">' +
      '<div class="aw-q">How should it look?</div>' +
      '<div class="aw-look">' +
        '<div class="aw-tile' + (logo ? ' on' : '') + '" onclick="awPickArt(\'logo\')" title="Your logo, shown instead of the FFP mark"' +
          (logo ? ' style="background-image:url(\'' + _awEsc(logo) + '\')"' : '') + '>' +
          (logo ? '' : '<span class="ms">add_photo_alternate</span>Your logo') + '</div>' +
        '<div class="aw-cov' + (cover ? ' on' : '') + '" onclick="awPickArt(\'cover\')" title="Cover image"' +
          (cover ? ' style="background-image:url(\'' + _awEsc(cover) + '\')"' : '') + '>' +
          (cover ? '' : '<span class="ms">image</span>Cover image, 16:9') + '</div>' +
      '</div>' +
      '<div class="aw-sw" id="aw-s-sw">' +
        ACCENTS.map(function (c) {
          return '<button type="button" data-c="' + c + '" class="' + (c.toUpperCase() === acc ? 'on' : '') + '"' +
            ' style="background:' + c + '" onclick="awPickAccent(\'' + c + '\')" aria-label="Accent ' + c + '"></button>';
        }).join('') +
      '</div>' +
      '<input type="hidden" id="aw-s-accent" value="' + _awEsc(acc) + '">' +
      '<input type="hidden" id="aw-s-logo" value="' + _awEsc(logo) + '">' +
      '<input type="hidden" id="aw-s-cover" value="' + _awEsc(cover) + '">' +
    '</div>' +
    '<div id="aw-s-msg" class="psub" style="margin:16px 0 0;"></div>';

  openModalShell('sm', 'Programme setup', body,
    '<button class="btn btn-outline" onclick="closeModal()">Cancel</button>' +
    '<button class="btn btn-pri" onclick="awSaveSetup()">Save</button>');
  setTimeout(awScopeChanged, 40);
}

// only the field that matches the chosen width is shown
function awScopeChanged() {
  var v = (document.getElementById('aw-s-scope') || {}).value || 'city';
  ['city', 'country', 'region'].forEach(function (k) {
    var row = document.getElementById('aw-s-' + k + '-row');
    if (row) row.style.display = (v === k) ? 'inline' : 'none';
  });
}

// Accent is picked from the brand swatches rather than typed as a hex string.
function awPickAccent(c) {
  var h = document.getElementById('aw-s-accent'); if (h) h.value = c;
  var wrap = document.getElementById('aw-s-sw');
  if (wrap) Array.prototype.forEach.call(wrap.querySelectorAll('button'), function (b) {
    b.className = (b.getAttribute('data-c') === c) ? 'on' : '';
  });
}

// The shared uploader takes over the screen, so the form is saved first and
// reopened afterwards. Nothing typed is lost.
async function awPickArt(kind) {
  if (!window.FFPUpload) { showToast('Uploader not ready, refresh the page', 'error'); return; }
  var ok = await awSaveSetup(true);
  if (!ok) return;
  var isLogo = kind === 'logo';
  window.FFPUpload.pick({
    bucket: isLogo ? 'provider-logos' : 'listing-covers',
    key: (isLogo ? 'awlogo-' : 'awcover-') + _awProg + '-' + Date.now(),
    aspect: isLogo ? 1 : 16 / 9, outW: isLogo ? 512 : 1600, outH: isLogo ? 512 : 900,
    title: isLogo ? 'Programme logo (square)' : 'Cover image (16:9)',
    onDone: async function (url) {
      var patch = {}; patch[isLogo ? 'logo_url' : 'cover_url'] = url;
      try {
        await window.supabase.rpc('award_programme_save',
          { p_programme: _awProg, p_provider: _awPid(), p_patch: patch });
        showToast('Saved', 'success');
      } catch (e) { showToast(_awErr(e), 'error'); }
      awSetup();
    },
    onError: function () { showToast('Upload failed', 'error'); awSetup(); }
  });
}

async function awSaveSetup(quiet) {
  var g = function (x) { return ((document.getElementById(x) || {}).value || '').trim(); };
  var msg = document.getElementById('aw-s-msg');
  // The save RPC coalesces on the string it is given, so an empty string would
  // overwrite a stored value with blank. Only send what the form actually holds,
  // and only the place field that matches the chosen scope.
  var scope = g('aw-s-scope') || 'city';
  var patch = {
    name: g('aw-s-name'),
    tagline: g('aw-s-tagline'),
    activity: g('aw-s-activity'),
    category: g('aw-s-category'),
    scope: scope,
    accent: g('aw-s-accent'),
    enter_closes_at: g('aw-s-enter') || null,
    evidence_closes_at: g('aw-s-evid') || null,
    committee_closes_at: g('aw-s-committee') || null,
    announce_at: g('aw-s-announce') || null
  };
  if (scope === 'city') patch.city = g('aw-s-city');
  if (scope === 'country') patch.country = g('aw-s-country');
  if (scope === 'region') patch.region = g('aw-s-region');
  if (g('aw-s-logo')) patch.logo_url = g('aw-s-logo');
  if (g('aw-s-cover')) patch.cover_url = g('aw-s-cover');
  if (!patch.name) {
    if (msg) { msg.textContent = 'The programme needs a name'; msg.style.color = 'var(--ffp-red)'; }
    return false;
  }
  try {
    var r = await window.supabase.rpc('award_programme_save',
      { p_programme: _awProg, p_provider: _awPid(), p_patch: patch });
    if (r.error) throw r.error;
    if (quiet) return true;
    closeModal();
    showToast('Saved', 'success');
    _awRenderDash();
    return true;
  } catch (e) {
    if (msg) { msg.innerHTML = _awEsc(_awErr(e)); msg.style.color = 'var(--ffp-red)'; }
    return false;
  }
}

window.renderAwards = renderAwards;
