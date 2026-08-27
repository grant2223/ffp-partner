/* FFP Partner — Leagues organiser console (desktop).
   Model: League -> Divisions (team or individual) -> Entrants -> Fixtures (round-robin) -> Table.
   Stats via lt_sport_schemas (sport-specific). Owner-gated RPCs (created_by=auth.uid()).
   All editing is inline on the page — no browser prompts. Icons use the app .ms font.
   Exposes window.ffpRenderLeagues (panel hook) + window.FFPLeague (actions). */
(function () {
  var sb = function () { return window.supabase; };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); };
  function toast(m, k) { if (typeof window.showToast === 'function') { try { window.showToast(m, k || 'info'); return; } catch (e) {} } console.log('[FFP League]', m); }
  function root() { return document.getElementById('lg-root'); }
  function ic(n) { return '<span class="ms">' + n + '</span>'; }

  var S = { view: 'list', eventId: null, detail: null, tab: 'details', divId: null, sports: null, creating: false, divEdit: null, entAdd: false, fxConfirm: false };

  function injectCss() {
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
      '.lg-cover{height:104px;position:relative;background:linear-gradient(150deg,#2f7fa8,#0d3550) center/cover no-repeat;} .lg-cover .scr{position:absolute;inset:0;background:linear-gradient(transparent,rgba(8,18,26,.6));} .lg-cover .bd{position:absolute;top:8px;left:8px;font-size:10px;font-weight:900;padding:3px 8px;border-radius:20px;background:#fff;color:#d6353b;} .lg-cover .bd.live{background:#d6353b;color:#fff;} .lg-cover .bd.open{color:#0a8f5f;} .lg-cover .bd.draft,.lg-cover .bd.final{color:#5b6b75;}',
      '.lg-cbody{padding:11px 13px;} .lg-cbody b{font-size:14.5px;font-weight:900;color:var(--ffp-text);display:block;} .lg-cbody span{font-size:12px;color:var(--ffp-text-muted);font-weight:700;text-transform:capitalize;}',
      '.lg-new{border:2px dashed var(--ffp-border-mid);border-radius:14px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;min-height:168px;color:var(--ffp-blue);font-weight:800;cursor:pointer;background:#fff;} .lg-new .ms{font-size:28px;}',
      '.lg-nav{display:flex;gap:22px;border-bottom:1px solid var(--ffp-border);margin-bottom:20px;flex-wrap:wrap;} .lg-nav button{background:none;border:none;font:inherit;font-size:13.5px;font-weight:800;color:var(--ffp-text-muted);padding:11px 0;border-bottom:2.5px solid transparent;cursor:pointer;} .lg-nav button.on{color:var(--ffp-blue);border-bottom-color:var(--ffp-blue);}',
      '.lg-pill{font-size:11px;font-weight:800;padding:3px 10px;border-radius:20px;margin-left:8px;vertical-align:middle;} .lg-pill.live{background:#fdeaea;color:#d6353b;} .lg-pill.open{background:#e3f6ec;color:#0a8f5f;} .lg-pill.draft,.lg-pill.final{background:#eef2f5;color:#5b6b75;}',
      '.lg-lab{font-size:12px;font-weight:800;color:#43525c;margin:0 0 6px;} .lg-in,.lg-sel{width:100%;padding:10px 12px;border:1px solid #d7dee5;border-radius:10px;font:inherit;box-sizing:border-box;background:#fff;color:#12232f;} .lg-fld{margin-bottom:16px;} .lg-2{display:grid;grid-template-columns:1fr 1fr;gap:14px;} .lg-3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;}',
      '.lg-seg{display:inline-flex;border:1.5px solid var(--ffp-border-mid);border-radius:10px;overflow:hidden;} .lg-seg button{background:#fff;border:none;padding:9px 15px;font:inherit;font-size:12.5px;font-weight:800;color:var(--ffp-text-muted);cursor:pointer;} .lg-seg button.on{background:var(--ffp-blue);color:#fff;}',
      '.lg-row{display:flex;align-items:center;gap:12px;padding:13px 2px;border-bottom:1px solid var(--ffp-border);} .lg-row .drag{color:#c0cad2;font-size:20px;cursor:grab;} .lg-row .g{flex:1;min-width:0;} .lg-row .g b{font-size:14.5px;font-weight:800;color:var(--ffp-text);} .lg-row .g span{font-size:12.5px;color:var(--ffp-text-muted);font-weight:700;} .lg-row .act{color:#9aa8b4;font-size:20px;cursor:pointer;padding:4px;} .lg-row .act:hover{color:var(--ffp-blue);}',
      '.lg-av{width:34px;height:34px;border-radius:8px;flex:none;background:#e7ecef center/cover no-repeat;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:900;color:#6a7681;}',
      '.lg-empty{padding:40px 16px;text-align:center;color:var(--ffp-text-muted);font-weight:600;font-size:13.5px;}',
      '.lg-tool{display:flex;align-items:center;gap:12px;margin-bottom:16px;flex-wrap:wrap;} .lg-tool .lg-sel{width:auto;min-width:180px;} .lg-tool .sp{flex:1;}',
      '.lg-edit{display:flex;align-items:center;gap:10px;padding:12px 2px;border-bottom:1px solid var(--ffp-border);flex-wrap:wrap;} .lg-edit .lg-in{width:auto;flex:1;min-width:160px;}',
      '.lg-fx{display:grid;grid-template-columns:1fr 128px 1fr;align-items:center;gap:8px;padding:11px 2px;border-bottom:1px solid var(--ffp-border);} .lg-fx .t{font-size:13.5px;font-weight:800;color:var(--ffp-text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;} .lg-fx .t.a{text-align:right;} .lg-fx .sc{display:flex;gap:6px;justify-content:center;} .lg-fx .sc input{width:46px;padding:8px;border:1.5px solid #d7dee5;border-radius:8px;font:inherit;font-weight:800;text-align:center;}',
      '.lg-rndlab{font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.4px;color:var(--ffp-text-muted);margin:16px 0 4px;}',
      '.lg-tb{display:grid;grid-template-columns:26px 1fr 30px 30px 30px 44px 40px;align-items:center;gap:6px;padding:10px 6px;border-bottom:1px solid var(--ffp-border);font-size:13px;} .lg-tb span{text-align:center;} .lg-tb .nm{text-align:left;font-weight:800;} .lg-tb.head{font-size:10px;font-weight:800;text-transform:uppercase;color:var(--ffp-text-muted);} .lg-tb .pts{font-weight:900;color:var(--ffp-blue);}',
      '.lg-brand{display:flex;gap:12px;align-items:stretch;} .lg-logo{width:76px;height:76px;flex:none;border-radius:12px;border:1.5px dashed #d7dee5;background:#f7f9fb center/cover no-repeat;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;color:#9aa8b4;cursor:pointer;font-size:10px;font-weight:800;} .lg-logo .ms{font-size:22px;} .lg-banner{flex:1;height:76px;border-radius:12px;border:1.5px dashed #d7dee5;background:#f7f9fb center/cover no-repeat;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;color:#9aa8b4;cursor:pointer;font-size:11px;font-weight:800;} .lg-banner .ms{font-size:22px;} .lg-row .act{margin-left:auto;color:#9aa8b4;font-size:19px;cursor:pointer;}',
      '.lg-fldbar{display:flex;gap:10px;flex-wrap:wrap;align-items:center;} .lg-fldchip{display:inline-flex;align-items:center;gap:7px;border:1px solid var(--ffp-border-mid);border-radius:12px;padding:7px 11px;font-size:12.5px;font-weight:800;} .lg-fldchip .t{color:var(--ffp-text-muted);font-weight:700;} .lg-fldchip .x{color:#9aa8b4;font-size:16px;cursor:pointer;} .lg-fldchip.add{border-style:dashed;gap:4px;}',
      '.lg-srow{display:grid;grid-template-columns:1fr 132px 92px 120px 140px;gap:9px;align-items:center;padding:10px 2px;border-bottom:1px solid var(--ffp-border);} .lg-srow .mt{font-size:13.5px;font-weight:800;color:var(--ffp-text);min-width:0;} .lg-srow .mt span{display:block;font-size:11px;color:var(--ffp-text-muted);font-weight:600;} .lg-srow .lg-in,.lg-srow .lg-sel{padding:8px 9px;font-size:12.5px;width:100%;}',
      /* crest + fixtures v2 */
      '.lg-crest{width:32px;height:32px;border-radius:9px;flex:none;background:#0d3550 center/cover no-repeat;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:900;color:#fff;box-shadow:inset 0 0 0 1px rgba(0,0,0,.05),0 1px 2px rgba(0,0,0,.14);vertical-align:middle;} .lg-crest.big{width:38px;height:38px;}',
      '.lg-fx2{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:16px;padding:14px 4px;border-bottom:1px solid #f0f3f6;} .lg-fx2 .tm{display:flex;align-items:center;gap:10px;min-width:0;font-size:14.5px;font-weight:800;color:var(--ffp-text);} .lg-fx2 .tm.a{flex-direction:row-reverse;text-align:right;} .lg-fx2 .tm span:not(.lg-crest){white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      '.lg-fx2 .mid{display:flex;flex-direction:column;align-items:center;gap:4px;} .lg-fx2 .fxday{font-size:11px;font-weight:700;color:#9aa8b4;white-space:nowrap;} .lg-fx2 .sc{display:flex;align-items:center;gap:7px;} .lg-fx2 .sc input{width:46px;height:42px;text-align:center;border:1.5px solid #d7dee5;border-radius:9px;font:inherit;font-weight:800;font-size:15px;} .lg-fx2 .sc .v{font-size:12px;font-weight:800;color:#b7c2cc;}',
      /* bye */
      '.lg-bye{display:flex;align-items:center;gap:11px;padding:13px 4px;border-bottom:1px solid #f0f3f6;} .lg-bye b{font-size:14px;font-weight:800;} .lg-bye .lg-crest{opacity:.5;} .lg-bye .tag{font-size:10px;font-weight:900;letter-spacing:.09em;color:#a86a08;background:#fff4e0;padding:4px 10px;border-radius:20px;} .lg-bye .msg{font-size:12.5px;color:#9aa8b4;font-weight:600;}',
      /* collapsible round header */
      '.lg-rnd{display:flex;align-items:center;gap:12px;margin:20px 0 2px;padding:12px 14px;background:linear-gradient(180deg,#f7fafc,#eef4f8);border:1px solid #e4edf3;border-radius:12px;cursor:pointer;user-select:none;} .lg-rnd:hover{background:linear-gradient(180deg,#f2f8fb,#e7f1f7);} .lg-rnd .chev{color:var(--ffp-blue);font-size:22px;transition:transform .2s;} .lg-rnd.collapsed .chev{transform:rotate(-90deg);} .lg-rnd .rt{font-size:14px;font-weight:900;color:var(--ffp-text);} .lg-rnd .rc{font-size:11px;font-weight:800;color:var(--ffp-blue);background:#e2eff6;padding:3px 10px;border-radius:20px;} .lg-rnd .rd{font-size:12px;font-weight:600;color:var(--ffp-text-muted);} .lg-rnd .sp{flex:1;} .lg-rbody.hidden{display:none;}',
      /* venues */
      '.lg-venue{padding:18px 4px;border-bottom:1px solid var(--ffp-border);} .lg-vh{display:flex;align-items:center;gap:12px;} .lg-vpin{width:38px;height:38px;border-radius:11px;background:linear-gradient(180deg,#eaf4f9,#dcecf3);color:var(--ffp-blue);display:flex;align-items:center;justify-content:center;flex:none;} .lg-vpin .ms{font-size:21px;} .lg-vh .g{flex:1;min-width:0;} .lg-vh .g b{font-size:16px;font-weight:900;color:var(--ffp-text);} .lg-vh .g span{display:block;font-size:12.5px;color:var(--ffp-text-muted);font-weight:700;} .lg-vh .act{color:#9aa8b4;font-size:19px;cursor:pointer;padding:5px;border-radius:8px;} .lg-vh .act:hover{color:var(--ffp-blue);background:#f4f7f9;}',
      '.lg-surfs{margin:12px 0 0 51px;position:relative;} .lg-surfs:before{content:"";position:absolute;left:-13px;top:2px;bottom:18px;width:1.5px;background:#e4edf3;} .lg-surf{display:flex;align-items:center;gap:10px;padding:10px 0;font-size:14px;font-weight:600;border-bottom:1px solid #f4f7f9;} .lg-surf .ms{color:var(--ffp-blue);font-size:18px;opacity:.85;} .lg-surf .x{color:#c0cad2;cursor:pointer;font-size:18px;} .lg-surf .x:hover{color:#d64545;} .lg-addsurf{margin:12px 0 0 51px;} .lg-btn.ghostb{color:var(--ffp-blue);border-color:#d4e6ef;background:#f5fafc;} .lg-maplink{display:inline-flex;align-items:center;gap:3px;color:var(--ffp-blue);font-weight:800;text-decoration:none;} .lg-maplink .ms{font-size:15px;vertical-align:-3px;}',
      /* schedule v2 */
      '.lg-srow2{display:grid;grid-template-columns:1.2fr 1fr;gap:22px;align-items:start;padding:16px 4px;border-bottom:1px solid var(--ffp-border);} .lg-srow2 .s-match b{font-size:15px;font-weight:800;} .lg-srow2 .s-match small{display:block;font-size:11px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#9aa8b4;margin-top:3px;} .lg-srow2 .s-when{display:flex;gap:8px;margin-top:11px;} .lg-srow2 .s-when .lg-in{padding:8px 9px;font-size:13px;} .lg-srow2 .s-right{display:flex;flex-direction:column;gap:9px;} .lg-srow2 .fl{font-size:11px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#9aa8b4;} .lg-srow2 .st-f{padding:9px 10px;font-size:13px;}',
      '.lg-offlist{display:flex;flex-direction:column;gap:6px;} .lg-offtag{display:flex;align-items:center;gap:9px;font-size:13px;padding:7px 10px;border:1px solid var(--ffp-border-mid);border-radius:9px;background:#fbfcfd;} .lg-offtag .role{font-size:10px;font-weight:900;letter-spacing:.05em;text-transform:uppercase;color:var(--ffp-blue);} .lg-offtag .nm{font-weight:700;} .lg-offtag .sp{flex:1;} .lg-offtag .x{color:#c0cad2;cursor:pointer;font-size:16px;} .lg-assign{display:flex;gap:7px;align-items:center;} .lg-assign .lg-sel{padding:7px 9px;font-size:12.5px;flex:1;} .lg-btn.sm{padding:7px 11px;font-size:12px;}',
      '.lg-maed{background:#f7fafc;border:1px solid #e4edf3;border-radius:12px;padding:12px;margin-bottom:14px;}'
    ].join('\n');
    document.head.appendChild(css);
  }

  async function loadSports() { if (S.sports) return S.sports; var r = await sb().from('lt_sport_schemas').select('key,name,icon,match_activities').eq('active', true).order('sort'); S.sports = r.data || []; return S.sports; }
  // ---- Taxonomy (shared window.FFP_TAX — activity / gender / city / country) ----
  async function taxReady() { try { if (window.FFP_TAX_READY) await window.FFP_TAX_READY; } catch (e) {} return window.FFP_TAX || {}; }
  function actNames() { return ((window.FFP_TAX && window.FFP_TAX.activities) || []).map(function (a) { return a && a.n ? a.n : a; }); }
  function genderNames() { return ((window.FFP_TAX && window.FFP_TAX.genders) || ['Male', 'Female']).filter(function (g) { return g !== 'Prefer not to say'; }); }
  function cityNames() { var t = window.FFP_TAX; return (t && t.allCities) ? t.allCities() : []; }
  function countryNames() { var t = window.FFP_TAX; return t && t.cities ? Object.keys(t.cities) : []; }
  function dlOpts(arr) { return (arr || []).map(function (x) { return '<option value="' + esc(x) + '">'; }).join(''); }
  function schemaForActivity(act) { var s = (S.sports || []).find(function (x) { return (x.match_activities || []).some(function (a) { return String(a).toLowerCase() === String(act || '').toLowerCase(); }); }); return s ? s.name : 'Generic points'; }
  function sportHint() { var a = (document.getElementById('lg-sport') || {}).value; var h = document.getElementById('lg-sporthint'); if (h) h.textContent = 'Stats set: ' + schemaForActivity(a); }

  // ---------- LIST ----------
  async function renderList() {
    injectCss(); var el = root(); if (!el) return;
    var r; try { r = await sb().rpc('league_my_events'); } catch (e) { r = { error: e }; }
    var list = (r && r.data) || [];
    var cards = list.map(function (ev) {
      var cov = ev.cover_url || ev.logo_url;
      return '<div class="lg-card" onclick="FFPLeague.open(\'' + ev.id + '\')"><div class="lg-cover" style="' + (cov ? 'background-image:url(\'' + esc(cov) + '\')' : '') + '"><div class="scr"></div><div class="bd ' + esc(ev.status) + '">' + esc((ev.status || 'draft').toUpperCase()) + '</div></div><div class="lg-cbody"><b>' + esc(ev.name) + '</b><span>' + esc([ev.city, ev.sport].filter(Boolean).join(' · ')) + '</span></div></div>';
    }).join('');
    var newCard = S.creating
      ? '<div class="lg-card" style="cursor:default"><div class="lg-cover"><div class="scr"></div></div><div class="lg-cbody"><input class="lg-in" id="lg-newname" placeholder="League name" autofocus onkeydown="if(event.key===\'Enter\')FFPLeague.doCreate()"><div style="display:flex;gap:8px;margin-top:8px"><button class="lg-btn pri" onclick="FFPLeague.doCreate()">Create</button><button class="lg-btn ghost" onclick="FFPLeague.cancelCreate()">Cancel</button></div></div></div>'
      : '<div class="lg-new" onclick="FFPLeague.startCreate()">' + ic('add') + 'Create a league</div>';
    el.innerHTML = '<div class="lg-wrap"><div class="lg-head"><div><div class="lg-h1">Leagues</div><div class="lg-sub">Season table + fixtures.</div></div></div><div class="lg-grid">' + cards + newCard + '</div></div>';
    if (S.creating) { var i = document.getElementById('lg-newname'); if (i) i.focus(); }
  }
  function startCreate() { S.creating = true; renderList(); }
  function cancelCreate() { S.creating = false; renderList(); }
  async function doCreate() {
    var nm = (document.getElementById('lg-newname') || {}).value; if (!nm || !nm.trim()) return;
    var r; try { r = await sb().rpc('league_event_save', { p_id: null, p: { name: nm.trim() } }); } catch (e) { r = { error: e }; }
    if (r.error) { toast('Could not create', 'error'); return; }
    S.creating = false; open(r.data);
  }

  async function open(id) {
    S.eventId = id; S.view = 'editor'; S.tab = 'details'; S.divEdit = null; S.entAdd = false; S.fxConfirm = false;
    var r; try { r = await sb().rpc('league_detail', { p_league: id }); } catch (e) { r = { error: e }; }
    S.detail = (r && r.data) || null;
    S.divId = (S.detail && S.detail.divisions && S.detail.divisions[0] && S.detail.divisions[0].id) || null;
    renderEditor();
  }

  function renderEditor() {
    injectCss(); var el = root(); if (!el || !S.detail) return;
    var ev = S.detail.event || {};
    el.innerHTML = '<div class="lg-wrap"><div class="lg-head"><div><div class="lg-h1">' + esc(ev.name) + '<span class="lg-pill ' + esc(ev.status) + '">' + esc((ev.status || 'draft').toUpperCase()) + '</span></div><div class="lg-sub">' + esc([ev.city, ev.sport_key].filter(Boolean).join(' · ')) + '</div></div>'
      + '<button class="lg-btn" onclick="FFPLeague.back()">' + ic('arrow_back') + 'All leagues</button></div>'
      + '<div class="lg-nav">' + tabBtn('details', 'Details') + tabBtn('divisions', 'Divisions') + tabBtn('entrants', 'Entrants') + tabBtn('fixtures', 'Fixtures & results') + tabBtn('venues', 'Venues') + tabBtn('officials', 'Officials') + tabBtn('schedule', 'Schedule') + tabBtn('table', 'Table') + '</div><div id="lg-tab"></div></div>';
    renderTab();
  }
  function tabBtn(id, label) { return '<button class="' + (S.tab === id ? 'on' : '') + '" onclick="FFPLeague.tab(\'' + id + '\')">' + label + '</button>'; }
  function renderTab() {
    var host = document.getElementById('lg-tab'); if (!host) return;
    if (S.tab === 'details') return renderDetails(host);
    if (S.tab === 'divisions') return renderDivisions(host);
    if (S.tab === 'entrants') return renderEntrants(host);
    if (S.tab === 'fixtures') return renderFixtures(host);
    if (S.tab === 'venues') return renderVenues(host);
    if (S.tab === 'officials') return renderOfficials(host);
    if (S.tab === 'schedule') return renderSchedule(host);
    if (S.tab === 'table') return renderTable(host);
  }

  // ---------- shared helpers (rounds / logos / venues) ----------
  var MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  var ROLES = ['Referee','Assistant referee','Umpire','Touch judge','Line judge','Timekeeper','Scorer','TMO'];
  function fmtDay(d) { return DOW[d.getDay()] + ' ' + d.getDate() + ' ' + MON[d.getMonth()]; }
  function fmtTime(d) { return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }
  function crest(o, big) {
    o = o || {}; var nm = o.name || 'TBD'; var cls = 'lg-crest' + (big ? ' big' : '');
    if (o.logo) return '<span class="' + cls + '" style="background-image:url(\'' + esc(o.logo) + '\')"></span>';
    return '<span class="' + cls + '">' + esc(nm.replace(/[^A-Za-z ]/g, '').split(' ').map(function (w) { return w[0] || ''; }).join('').slice(0, 2).toUpperCase() || '?') + '</span>';
  }
  function roundRange(list) {
    var ds = list.map(function (f) { return f.scheduled_at ? new Date(f.scheduled_at) : null; }).filter(Boolean);
    if (!ds.length) return 'Not scheduled';
    var mn = new Date(Math.min.apply(null, ds)), mx = new Date(Math.max.apply(null, ds));
    var sameDay = mn.toDateString() === mx.toDateString();
    if (sameDay) return fmtDay(mn) + ' · 1 day';
    var days = Math.round((new Date(mx.getFullYear(), mx.getMonth(), mx.getDate()) - new Date(mn.getFullYear(), mn.getMonth(), mn.getDate())) / 86400000) + 1;
    var span = (mn.getMonth() === mx.getMonth()) ? (mn.getDate() + '–' + mx.getDate() + ' ' + MON[mx.getMonth()]) : (mn.getDate() + ' ' + MON[mn.getMonth()] + ' – ' + mx.getDate() + ' ' + MON[mx.getMonth()]);
    return span + ' · ' + days + ' days';
  }
  function surfaceOpts(fields, selId) {
    var groups = {}; var order = [];
    (fields || []).forEach(function (x) { var g = x.venue || 'Other'; if (!groups[g]) { groups[g] = []; order.push(g); } groups[g].push(x); });
    var body = order.map(function (g) {
      return '<optgroup label="' + esc(g) + '">' + groups[g].map(function (x) {
        return '<option value="' + x.id + '"' + (selId && x.id === selId ? ' selected' : '') + '>' + esc(x.name) + '</option>';
      }).join('') + '</optgroup>';
    }).join('');
    return '<option value="">Surface…</option>' + body;
  }
  function togRound(btn) {
    btn.classList.toggle('collapsed');
    var b = btn.nextElementSibling; if (b && b.classList.contains('lg-rbody')) b.classList.toggle('hidden');
  }
  function roundHead(label, count, range) {
    return '<div class="lg-rnd" onclick="FFPLeague.togRound(this)"><span class="ms chev">expand_more</span><span class="rt">' + esc(label) + '</span><span class="rc">' + count + (count === 1 ? ' match' : ' matches') + '</span><span class="sp"></span><span class="rd"><span class="ms" style="font-size:14px;vertical-align:-2px">event</span> ' + esc(range) + '</span></div>';
  }
  function entOpts(sel, skip) {
    return '<option value="">Select…</option>' + (S._entrants || []).filter(function (e) { return e.id !== skip; }).map(function (e) {
      return '<option value="' + e.id + '"' + (sel === e.id ? ' selected' : '') + '>' + esc(e.name) + '</option>';
    }).join('');
  }
  async function loadEntrants() { var r; try { r = await sb().rpc('league_roster', { p_division: S.divId }); } catch (e) { r = null; } S._entrants = (r && r.data) || []; return S._entrants; }

  // ---------- OFFICIALS ----------
  async function renderOfficials(host) {
    host.innerHTML = '<div class="lg-sub" style="margin-bottom:12px">Officials can enter results from their own login. Add by FFP email to link their account.</div>'
      + '<div class="lg-edit"><input class="lg-in" id="lg-ofname" placeholder="Name" style="max-width:200px"><input class="lg-in" id="lg-ofemail" placeholder="FFP email (optional)"><button class="lg-btn pri" onclick="FFPLeague.addOfficial()">' + ic('add') + 'Add official</button></div>'
      + '<div id="lg-oflist"><div class="lg-empty">Loading…</div></div>';
    var r; try { r = await sb().rpc('lt_officials_list', { p_scope: 'league', p_event: S.eventId }); } catch (e) { r = { error: e }; }
    var rows = (r && r.data) || []; var h2 = document.getElementById('lg-oflist');
    h2.innerHTML = rows.length ? rows.map(function (o) {
      return '<div class="lg-row"><span class="lg-av" style="' + (o.photo ? 'background-image:url(\'' + esc(o.photo) + '\')' : '') + '">' + (o.photo ? '' : esc((o.name || '?').slice(0, 1))) + '</span><div class="g"><b>' + esc(o.name || o.email || 'Official') + '</b><span>' + (o.member_id ? 'FFP account linked · can score' : (o.email ? esc(o.email) + ' · not linked' : 'Manual')) + '</span></div><span class="ms act" onclick="FFPLeague.removeOfficial(\'' + o.id + '\')">close</span></div>';
    }).join('') : '<div class="lg-empty">No officials yet.</div>';
  }
  async function addOfficial() {
    var nm = (document.getElementById('lg-ofname') || {}).value, em = (document.getElementById('lg-ofemail') || {}).value;
    if (!nm && !em) return;
    var r; try { r = await sb().rpc('lt_official_add', { p_scope: 'league', p_event: S.eventId, p_member: null, p_name: nm, p_email: em }); } catch (e) { r = { error: e }; }
    if (r.error) { toast('Could not add', 'error'); return; } toast('Added', 'success'); renderTab();
  }
  async function removeOfficial(id) { await sb().rpc('lt_official_remove', { p_id: id }); renderTab(); }

  // ---------- VENUES ----------
  async function renderVenues(host) {
    host.innerHTML = '<div class="lg-tool"><div><div class="lg-h1" style="font-size:18px">Venues &amp; surfaces</div><div class="lg-sub">A venue can hold many pitches, courts, ovals or lanes</div></div><span class="sp"></span><button class="lg-btn pri" onclick="FFPLeague.addVenue()">' + ic('add') + 'Add venue</button></div>'
      + (S.venAdd ? venueEditor(null) : '') + '<div id="lg-venlist"><div class="lg-empty">Loading…</div></div>';
    var r; try { r = await sb().rpc('lt_venues_list', { p_scope: 'league', p_event: S.eventId }); } catch (e) { r = { error: e }; }
    var vs = (r && r.data) || []; var h2 = document.getElementById('lg-venlist');
    if (!vs.length && !S.venAdd) { h2.innerHTML = '<div class="lg-empty">No venues yet. Add a venue, then its pitches/courts.</div>'; return; }
    h2.innerHTML = vs.map(function (v) {
      if (S.venEdit === v.id) return venueEditor(v);
      var surfaces = (v.surfaces || []).map(function (s) {
        return '<div class="lg-surf"><span class="ms">sports_score</span>' + esc(s.name) + '<span class="sp"></span><span class="ms x" onclick="FFPLeague.removeSurface(\'' + s.id + '\')">delete</span></div>';
      }).join('');
      var vmeta = [v.city, (v.maps_url ? '<a class="lg-maplink" href="' + esc(v.maps_url) + '" target="_blank" rel="noopener">' + ic('map') + 'Map</a>' : '')].filter(Boolean).join(' · ');
      var addS = (S.surfAdd === v.id)
        ? '<div class="lg-edit" style="margin-left:44px;border:none;padding-top:8px"><input class="lg-in" id="lg-sfname" placeholder="Pitch / court / oval name" style="max-width:260px" onkeydown="if(event.key===\'Enter\')FFPLeague.saveSurface(\'' + v.id + '\')"><button class="lg-btn pri" onclick="FFPLeague.saveSurface(\'' + v.id + '\')">' + ic('check') + 'Add</button><button class="lg-btn ghost" onclick="FFPLeague.cancelSurface()">Cancel</button></div>'
        : '<div class="lg-addsurf"><button class="lg-btn ghostb" onclick="FFPLeague.addSurface(\'' + v.id + '\')">' + ic('add') + 'Add surface</button></div>';
      return '<div class="lg-venue"><div class="lg-vh"><span class="lg-vpin"><span class="ms">location_on</span></span><div class="g"><b>' + esc(v.name) + '</b><span>' + vmeta + '</span></div><span class="ms act" onclick="FFPLeague.editVenue(\'' + v.id + '\')">edit</span><span class="ms act" onclick="FFPLeague.removeVenue(\'' + v.id + '\')">delete</span></div>'
        + (surfaces ? '<div class="lg-surfs">' + surfaces + '</div>' : '') + addS + '</div>';
    }).join('');
    var f = document.getElementById('lg-vname'); if (f) f.focus();
    var sf = document.getElementById('lg-sfname'); if (sf) sf.focus();
  }
  function venueEditor(v) {
    v = v || {};
    return '<div class="lg-edit"><input class="lg-in" id="lg-vname" placeholder="Venue name" value="' + esc(v.name || '') + '" style="flex:2;min-width:170px">'
      + '<input class="lg-in" id="lg-vcity" list="lg-cityl" placeholder="City" value="' + esc(v.city || '') + '" style="flex:1;min-width:110px"><datalist id="lg-cityl">' + dlOpts(cityNames()) + '</datalist>'
      + '<input class="lg-in" id="lg-vmaps" placeholder="Google Maps link (optional)" value="' + esc(v.maps_url || '') + '" style="flex:2;min-width:180px">'
      + '<button class="lg-btn pri" onclick="FFPLeague.saveVenue(\'' + (v.id || '') + '\')">' + ic('check') + 'Save</button>'
      + '<button class="lg-btn ghost" onclick="FFPLeague.cancelVenue()">Cancel</button></div>';
  }
  function addVenue() { S.venAdd = true; S.venEdit = null; renderTab(); }
  function editVenue(id) { S.venEdit = id; S.venAdd = false; renderTab(); }
  function cancelVenue() { S.venAdd = false; S.venEdit = null; renderTab(); }
  async function saveVenue(id) {
    var nm = v('lg-vname'); if (!nm || !nm.trim()) { toast('Name required', 'error'); return; }
    var r; try { r = await sb().rpc('lt_venue_save', { p_scope: 'league', p_event: S.eventId, p_id: id || null, p_name: nm.trim(), p_city: v('lg-vcity') || null, p_maps: v('lg-vmaps') || null }); } catch (e) { r = { error: e }; }
    if (r.error) { toast('Save failed', 'error'); return; } S.venAdd = false; S.venEdit = null; toast('Saved', 'success'); renderTab();
  }
  async function removeVenue(id) { await sb().rpc('lt_venue_remove', { p_id: id }); toast('Removed', 'success'); renderTab(); }
  function addSurface(vid) { S.surfAdd = vid; renderTab(); }
  function cancelSurface() { S.surfAdd = null; renderTab(); }
  async function saveSurface(vid) {
    var nm = v('lg-sfname'); if (!nm || !nm.trim()) return;
    var r; try { r = await sb().rpc('lt_field_save', { p_scope: 'league', p_event: S.eventId, p_id: null, p_name: nm.trim(), p_start: null, p_venue: vid }); } catch (e) { r = { error: e }; }
    if (r.error) { toast('Add failed', 'error'); return; } S.surfAdd = null; toast('Added', 'success'); renderTab();
  }
  async function removeSurface(id) { await sb().rpc('lt_field_remove', { p_id: id }); renderTab(); }

  // ---------- SCHEDULE ----------
  async function renderSchedule(host) {
    var divs = S.detail.divisions || [];
    if (!S.divId && divs.length) S.divId = divs[0].id;
    var fr; try { fr = await sb().rpc('lt_fields_list', { p_scope: 'league', p_event: S.eventId }); } catch (e) { fr = { error: e }; }
    var fields = (fr && fr.data) || [];
    if (S.divId) await loadEntrants();
    host.innerHTML =
      '<div class="lg-tool">' + (divs.length > 1 ? '<select class="lg-sel" onchange="FFPLeague.setDiv(this.value,\'schedule\')">' + divOpts() + '</select>' : '')
      + '<span class="lg-lab" style="margin:0">Match length</span><input class="lg-in" id="lg-mlen" type="number" value="30" style="width:64px"><span style="font-size:12px;color:var(--ffp-text-muted)">min</span>'
      + '<span class="sp"></span><button class="lg-btn" onclick="FFPLeague.addMatch(\'schedule\')">' + ic('add') + 'Add match</button><button class="lg-btn pri" onclick="FFPLeague.autoplan()">' + ic('auto_awesome') + 'Auto-plan</button></div>'
      + (S.addMatch === 'schedule' ? matchEditor() : '')
      + '<div id="lg-schedlist"><div class="lg-empty">Loading…</div></div>';
    if (!fields.length) { document.getElementById('lg-schedlist').innerHTML = '<div class="lg-empty">Add a venue + surfaces on the <b>Venues</b> tab, then Auto-plan.</div>'; }
    if (!S.divId) { document.getElementById('lg-schedlist').innerHTML = '<div class="lg-empty">Add a division + generate fixtures first.</div>'; return; }
    await loadEntrants();
    var r; try { r = await sb().rpc('league_fixtures_list', { p_division: S.divId }); } catch (e) { r = { error: e }; }
    var fx = ((r && r.data) || []).filter(function (f) { return !f.bye; });
    var offr; try { offr = await sb().rpc('lt_officials_list', { p_scope: 'league', p_event: S.eventId }); } catch (e) { offr = null; }
    var offs = (offr && offr.data) || [];
    var host2 = document.getElementById('lg-schedlist');
    if (!fx.length) { host2.innerHTML = '<div class="lg-empty">No fixtures yet — generate them on the Fixtures tab.</div>'; return; }
    S._fields = fields; S._offs = offs;
    var byRound = {}; var order = [];
    fx.forEach(function (f) { if (!byRound[f.round]) { byRound[f.round] = []; order.push(f.round); } byRound[f.round].push(f); });
    order.sort(function (a, b) { return a - b; });
    host2.innerHTML = order.map(function (rd) {
      var list = byRound[rd];
      return roundHead('Round ' + rd, list.length, roundRange(list)) + '<div class="lg-rbody">' + list.map(schedRow).join('') + '</div>';
    }).join('');
  }
  function schedRow(f) {
    var t = f.scheduled_at ? new Date(f.scheduled_at) : null;
    var tv = t ? fmtTime(t) : '';
    var dv = t ? (t.getFullYear() + '-' + ('0' + (t.getMonth() + 1)).slice(-2) + '-' + ('0' + t.getDate()).slice(-2)) : ((S.detail.event && S.detail.event.starts_at) || '');
    var offs = f.officials || [];
    var tags = offs.map(function (o) {
      return '<div class="lg-offtag"><span class="role">' + esc(o.role || 'Official') + '</span><span class="nm">' + esc(o.name) + '</span><span class="sp"></span><span class="ms x" onclick="FFPLeague.offRemove(\'' + o.id + '\')">close</span></div>';
    }).join('');
    var roleOpts = '<option value="">Role…</option>' + ROLES.map(function (r) { return '<option>' + r + '</option>'; }).join('');
    var offOpts = '<option value="">Official…</option>' + (S._offs || []).map(function (x) { return '<option value="' + x.id + '">' + esc(x.name || x.email) + '</option>'; }).join('');
    return '<div class="lg-srow2" data-id="' + f.id + '"><div class="s-match"><b>' + esc((f.home && f.home.name) || 'TBD') + ' v ' + esc((f.away && f.away.name) || 'TBD') + '</b><small>Round ' + f.round + '</small>'
      + '<div class="s-when"><input class="lg-in st-d" type="date" value="' + dv + '" onchange="FFPLeague.schedSet(\'' + f.id + '\')"><input class="lg-in st-t" type="time" value="' + tv + '" onchange="FFPLeague.schedSet(\'' + f.id + '\')"></div></div>'
      + '<div class="s-right"><div class="fl">Surface</div><select class="lg-sel st-f" onchange="FFPLeague.schedSet(\'' + f.id + '\')">' + surfaceOpts(S._fields, f.field_id) + '</select>'
      + '<div class="fl">Officials</div>' + (tags ? '<div class="lg-offlist">' + tags + '</div>' : '')
      + '<div class="lg-assign"><select class="lg-sel a-role">' + roleOpts + '</select><select class="lg-sel a-off">' + offOpts + '</select><button class="lg-btn sm pri" onclick="FFPLeague.offAdd(\'' + f.id + '\')">Add</button></div></div></div>';
  }
  async function autoplan() {
    if (!S.divId) { toast('Pick a division', 'error'); return; }
    var len = +((document.getElementById('lg-mlen') || {}).value) || 30;
    var r; try { r = await sb().rpc('lt_autoplan', { p_scope: 'league', p_division: S.divId, p_match_len: len }); } catch (e) { r = { error: e }; }
    if (r.error) { toast(/no_fields/.test(r.error.message || '') ? 'Add a surface first (Venues tab)' : 'Could not plan', 'error'); return; }
    toast((r.data || 0) + ' matches planned', 'success'); renderTab();
  }
  async function schedSet(id) {
    var row = document.querySelector('.lg-srow2[data-id="' + id + '"]'); if (!row) return;
    var dv = (row.querySelector('.st-d') || {}).value, tv = row.querySelector('.st-t').value, fid = row.querySelector('.st-f').value || null;
    var base = dv || (S.detail.event && S.detail.event.starts_at) || new Date().toISOString().slice(0, 10);
    var when = (tv || dv) ? new Date(base + 'T' + (tv || '00:00') + ':00').toISOString() : null;
    await sb().rpc('lt_match_schedule', { p_scope: 'league', p_match: id, p_when: when, p_field: fid, p_court: null, p_official: null });
    toast('Rescheduled', 'success');
  }
  async function offAdd(matchId) {
    var row = document.querySelector('.lg-srow2[data-id="' + matchId + '"]'); if (!row) return;
    var role = (row.querySelector('.a-role') || {}).value || null, off = (row.querySelector('.a-off') || {}).value || null;
    if (!off) { toast('Pick an official', 'error'); return; }
    var r; try { r = await sb().rpc('lt_match_official_add', { p_scope: 'league', p_match: matchId, p_official: off, p_role: role }); } catch (e) { r = { error: e }; }
    if (r.error) { toast('Could not assign', 'error'); return; } toast('Assigned', 'success'); renderTab();
  }
  async function offRemove(id) { await sb().rpc('lt_match_official_remove', { p_id: id }); renderTab(); }

  // ---------- DETAILS ----------
  async function renderDetails(host) {
    var ev = S.detail.event || {}; await loadSports(); await taxReady();
    host.innerHTML =
      '<div class="lg-fld"><div class="lg-lab">Logo &amp; banner</div><div class="lg-brand">'
      + '<div class="lg-logo" onclick="FFPLeague.pickImg(\'logo\')" style="' + (ev.logo_url ? 'background-image:url(\'' + esc(ev.logo_url) + '\')' : '') + '">' + (ev.logo_url ? '' : '<span class="ms">add_photo_alternate</span><span>Logo</span>') + '</div>'
      + '<div class="lg-banner" onclick="FFPLeague.pickImg(\'cover\')" style="' + (ev.cover_url ? 'background-image:url(\'' + esc(ev.cover_url) + '\')' : '') + '">' + (ev.cover_url ? '' : '<span class="ms">image</span><span>Add banner (16:9)</span>') + '</div></div></div>'
      + '<div class="lg-fld"><div class="lg-lab">League name</div><input class="lg-in" id="lg-name" value="' + esc(ev.name) + '"></div>'
      + '<div class="lg-2"><div class="lg-fld"><div class="lg-lab">Sport</div><input class="lg-in" id="lg-sport" list="lg-actl" value="' + esc(ev.activity || '') + '" placeholder="Search sport…" oninput="FFPLeague.sportHint()"><datalist id="lg-actl">' + dlOpts(actNames()) + '</datalist><div class="lg-lab" id="lg-sporthint" style="margin:6px 0 0;font-weight:700;color:#6a7c8a">Stats set: ' + esc(schemaForActivity(ev.activity)) + '</div></div>'
      + '<div class="lg-fld"><div class="lg-lab">Schedule</div><div class="lg-seg" id="lg-mode"><button data-v="single" class="' + (ev.schedule_mode !== 'home_away' ? 'on' : '') + '" onclick="FFPLeague.seg(this,\'lg-mode\')">Single</button><button data-v="home_away" class="' + (ev.schedule_mode === 'home_away' ? 'on' : '') + '" onclick="FFPLeague.seg(this,\'lg-mode\')">Home &amp; away</button></div></div></div>'
      + '<div class="lg-2"><div class="lg-fld"><div class="lg-lab">City</div><input class="lg-in" id="lg-city" list="lg-cityl" value="' + esc(ev.city || '') + '"><datalist id="lg-cityl">' + dlOpts(cityNames()) + '</datalist></div><div class="lg-fld"><div class="lg-lab">Country</div><input class="lg-in" id="lg-country" list="lg-cntl" value="' + esc(ev.country || '') + '"><datalist id="lg-cntl">' + dlOpts(countryNames()) + '</datalist></div></div>'
      + '<div class="lg-2"><div class="lg-fld"><div class="lg-lab">Season starts</div><input class="lg-in" id="lg-start" type="date" value="' + esc(ev.starts_at || '') + '"></div><div class="lg-fld"><div class="lg-lab">Season ends</div><input class="lg-in" id="lg-end" type="date" value="' + esc(ev.ends_at || '') + '"></div></div>'
      + '<div class="lg-3"><div class="lg-fld"><div class="lg-lab">Win pts</div><input class="lg-in" id="lg-win" type="number" value="' + (ev.win_pts != null ? ev.win_pts : 3) + '"></div><div class="lg-fld"><div class="lg-lab">Draw pts</div><input class="lg-in" id="lg-draw" type="number" value="' + (ev.draw_pts != null ? ev.draw_pts : 1) + '"></div><div class="lg-fld"><div class="lg-lab">Loss pts</div><input class="lg-in" id="lg-loss" type="number" value="' + (ev.loss_pts != null ? ev.loss_pts : 0) + '"></div></div>'
      + '<div class="lg-2"><div class="lg-fld"><div class="lg-lab">Finals series</div><select class="lg-sel" id="lg-finals"><option value="none"' + (ev.finals_mode === 'none' ? ' selected' : '') + '>None</option><option value="top4"' + (ev.finals_mode === 'top4' ? ' selected' : '') + '>Top 4</option><option value="top8"' + (ev.finals_mode === 'top8' ? ' selected' : '') + '>Top 8</option></select></div>'
      + '<div class="lg-fld"><div class="lg-lab">3rd-place play-off</div><div class="lg-seg" id="lg-third"><button data-v="true" class="' + (ev.third_place ? 'on' : '') + '" onclick="FFPLeague.seg(this,\'lg-third\')">Yes</button><button data-v="false" class="' + (!ev.third_place ? 'on' : '') + '" onclick="FFPLeague.seg(this,\'lg-third\')">No</button></div></div></div>'
      + '<div class="lg-fld"><div class="lg-lab">Status</div><select class="lg-sel" id="lg-status"><option value="draft"' + (ev.status === 'draft' ? ' selected' : '') + '>Draft (hidden)</option><option value="open"' + (ev.status === 'open' ? ' selected' : '') + '>Open</option><option value="live"' + (ev.status === 'live' ? ' selected' : '') + '>Live</option><option value="final"' + (ev.status === 'final' ? ' selected' : '') + '>Final</option></select></div>'
      + '<div class="lg-fld"><div class="lg-lab">About</div><textarea class="lg-in" id="lg-desc" rows="3">' + esc(ev.description || '') + '</textarea></div>'
      + '<div class="lg-fld"><div class="lg-lab">Rules</div><textarea class="lg-in" id="lg-rules" rows="3">' + esc(ev.rules || '') + '</textarea></div>'
      + '<button class="lg-btn pri" onclick="FFPLeague.saveDetails()">' + ic('check') + 'Save</button>';
  }
  function segVal(id) { var b = document.querySelector('#' + id + ' button.on'); return b ? b.getAttribute('data-v') : null; }
  function v(id) { var e = document.getElementById(id); return e ? e.value : ''; }
  async function saveDetails() {
    var p = { name: v('lg-name'), activity: v('lg-sport'), schedule_mode: segVal('lg-mode'), city: v('lg-city'), country: v('lg-country'),
      starts_at: v('lg-start') || null, ends_at: v('lg-end') || null, win_pts: +v('lg-win'), draw_pts: +v('lg-draw'), loss_pts: +v('lg-loss'),
      finals_mode: v('lg-finals'), third_place: segVal('lg-third') === 'true', status: v('lg-status'), description: v('lg-desc'), rules: v('lg-rules') };
    var r; try { r = await sb().rpc('league_event_save', { p_id: S.eventId, p: p }); } catch (e) { r = { error: e }; }
    if (r.error) { toast('Save failed', 'error'); return; } toast('Saved', 'success'); open(S.eventId);
  }

  // ---------- DIVISIONS (inline, no popups) ----------
  function renderDivisions(host) {
    var divs = S.detail.divisions || [];
    var rows = divs.map(function (d) {
      if (S.divEdit === d.id) return divEditor(d);
      return '<div class="lg-row">' + '<span class="ms drag">drag_indicator</span>' + '<div class="g"><b>' + esc(d.name) + '</b> <span>· ' + (d.kind === 'individual' ? 'Individual' : 'Team') + ' · ' + (d.entrant_count || 0) + ' in</span></div>' + '<span class="ms act" onclick="FFPLeague.editDivision(\'' + d.id + '\')">edit</span></div>';
    }).join('');
    var adder = S.divEdit === 'new' ? divEditor(null) : '<button class="lg-btn" style="margin-top:12px" onclick="FFPLeague.editDivision(\'new\')">' + ic('add') + 'Add division</button>';
    host.innerHTML = rows + adder;
    var f = document.getElementById('lg-dvname'); if (f) f.focus();
  }
  function divEditor(d) {
    d = d || {}; var isTeam = (d.kind || 'team') !== 'individual';
    var gOpts = '<option value="">Open / any</option>' + genderNames().map(function (g) { return '<option' + (d.gender === g ? ' selected' : '') + '>' + esc(g) + '</option>'; }).join('');
    return '<div class="lg-edit">'
      + '<input class="lg-in" id="lg-dvname" placeholder="Division name" value="' + esc(d.name || '') + '">'
      + '<div class="lg-seg" id="lg-dvkind"><button data-v="team" class="' + (isTeam ? 'on' : '') + '" onclick="FFPLeague.seg(this,\'lg-dvkind\')">Team</button><button data-v="individual" class="' + (!isTeam ? 'on' : '') + '" onclick="FFPLeague.seg(this,\'lg-dvkind\')">Individual</button></div>'
      + '<select class="lg-sel" id="lg-dvgender" style="width:auto">' + gOpts + '</select>'
      + '<input class="lg-in" id="lg-dvmin" type="number" placeholder="Min age" value="' + (d.min_age != null ? d.min_age : '') + '" style="width:88px">'
      + '<input class="lg-in" id="lg-dvmax" type="number" placeholder="Max age" value="' + (d.max_age != null ? d.max_age : '') + '" style="width:88px">'
      + '<button class="lg-btn pri" onclick="FFPLeague.saveDivision(\'' + (d.id || '') + '\')">' + ic('check') + 'Save</button>'
      + '<button class="lg-btn ghost" onclick="FFPLeague.cancelDivision()">Cancel</button></div>';
  }
  function editDivision(id) { S.divEdit = id; renderTab(); }
  function cancelDivision() { S.divEdit = null; renderTab(); }
  async function saveDivision(id) {
    var nm = (document.getElementById('lg-dvname') || {}).value; if (!nm || !nm.trim()) { toast('Name required', 'error'); return; }
    var kind = segVal('lg-dvkind') || 'team';
    var p = { name: nm.trim(), kind: kind, team_size: kind === 'team' ? 5 : 1, gender: v('lg-dvgender') || 'any', min_age: v('lg-dvmin') || null, max_age: v('lg-dvmax') || null };
    var r; try { r = await sb().rpc('league_division_save', { p_league: S.eventId, p_id: id || null, p: p }); } catch (e) { r = { error: e }; }
    if (r.error) { toast('Save failed', 'error'); return; }
    S.divEdit = null; toast('Saved', 'success'); refreshDetail();
  }

  // ---------- ENTRANTS (inline) ----------
  async function renderEntrants(host) {
    var divs = S.detail.divisions || [];
    if (!divs.length) { host.innerHTML = '<div class="lg-empty">Add a division first.</div>'; return; }
    if (!S.divId) S.divId = divs[0].id;
    var adder = S.entAdd
      ? '<div class="lg-edit"><input class="lg-in" id="lg-entname" placeholder="Team / player name" onkeydown="if(event.key===\'Enter\')FFPLeague.saveEntrant()"><button class="lg-btn pri" onclick="FFPLeague.saveEntrant()">' + ic('check') + 'Add</button><button class="lg-btn ghost" onclick="FFPLeague.cancelEntrant()">Cancel</button></div>'
      : '<button class="lg-btn" onclick="FFPLeague.addEntrant()">' + ic('add') + 'Add team / player</button>';
    host.innerHTML = '<div class="lg-tool"><select class="lg-sel" onchange="FFPLeague.setDiv(this.value,\'entrants\')">' + divOpts() + '</select><span class="sp"></span></div>' + adder + '<div id="lg-roster"><div class="lg-empty">Loading…</div></div>';
    var f = document.getElementById('lg-entname'); if (f) f.focus();
    var r; try { r = await sb().rpc('league_roster', { p_division: S.divId }); } catch (e) { r = { error: e }; }
    var rows = (r && r.data) || []; var host2 = document.getElementById('lg-roster');
    host2.innerHTML = rows.length ? rows.map(function (en) {
      var flag = en.nationality ? ' · ' + esc(en.nationality) : '';
      return '<div class="lg-row"><span class="lg-av" style="' + (en.logo ? 'background-image:url(\'' + esc(en.logo) + '\')' : '') + '">' + (en.logo ? '' : esc((en.name || '?').slice(0, 1))) + '</span><div class="g"><b>' + esc(en.name) + '</b> <span>· ' + esc(en.status) + (en.kind === 'individual' ? flag : '') + '</span></div>' + (en.kind !== 'individual' ? '<span class="ms act" title="Team logo" onclick="FFPLeague.entLogo(\'' + en.id + '\')">add_a_photo</span>' : '') + '</div>';
    }).join('') : '<div class="lg-empty">No entrants yet. Members self-register in the app, or add them here.</div>';
  }
  function addEntrant() { S.entAdd = true; renderTab(); }
  function cancelEntrant() { S.entAdd = false; renderTab(); }
  async function saveEntrant() {
    var nm = (document.getElementById('lg-entname') || {}).value; if (!nm || !nm.trim()) return;
    var kind = (S.detail.divisions.find(function (d) { return d.id === S.divId; }) || {}).kind || 'team';
    var r; try { r = await sb().rpc('league_entrant_add', { p_league: S.eventId, p_division: S.divId, p: { team_name: nm.trim(), kind: kind } }); } catch (e) { r = { error: e }; }
    if (r.error) { toast('Add failed', 'error'); return; } S.entAdd = false; toast('Added', 'success'); refreshDetail();
  }

  // ---------- FIXTURES & RESULTS ----------
  async function renderFixtures(host) {
    var divs = S.detail.divisions || [];
    if (!divs.length) { host.innerHTML = '<div class="lg-empty">Add a division first.</div>'; return; }
    if (!S.divId) S.divId = divs[0].id;
    var r; try { r = await sb().rpc('league_fixtures_list', { p_division: S.divId }); } catch (e) { r = { error: e }; }
    var fx = (r && r.data) || [];
    var genBtn = fx.length
      ? (S.fxConfirm ? '<button class="lg-btn" onclick="FFPLeague.doGen()">' + ic('warning') + 'Replace fixtures?</button><button class="lg-btn ghost" onclick="FFPLeague.cancelGen()">Cancel</button>'
        : '<button class="lg-btn" onclick="FFPLeague.confirmGen()">' + ic('autorenew') + 'Regenerate</button>')
      : '<button class="lg-btn" onclick="FFPLeague.doGen()">' + ic('auto_awesome') + 'Auto-generate fixtures</button>';
    await loadEntrants();
    host.innerHTML = '<div class="lg-tool"><select class="lg-sel" onchange="FFPLeague.setDiv(this.value,\'fixtures\')">' + divOpts() + '</select><span class="sp"></span><button class="lg-btn" onclick="FFPLeague.addMatch(\'fixtures\')">' + ic('add') + 'Add match</button>' + genBtn + '<button class="lg-btn pri" onclick="FFPLeague.saveResults()">' + ic('check') + 'Save results</button></div>'
      + (S.addMatch === 'fixtures' ? matchEditor() : '') + '<div id="lg-fixlist"></div>';
    var host2 = document.getElementById('lg-fixlist');
    if (!fx.length) { host2.innerHTML = '<div class="lg-empty">No fixtures yet — auto-generate the round-robin, or add one manually.</div>'; return; }
    var byRound = {}; var order = [];
    fx.forEach(function (f) { if (!byRound[f.round]) { byRound[f.round] = []; order.push(f.round); } byRound[f.round].push(f); });
    order.sort(function (a, b) { return a - b; });
    host2.innerHTML = order.map(function (rd) {
      var list = byRound[rd]; var games = list.filter(function (f) { return !f.bye; });
      return roundHead('Round ' + rd, games.length, roundRange(games)) + '<div class="lg-rbody">' + list.map(function (f) {
        if (f.bye) return '<div class="lg-bye">' + crest(f.home) + '<b>' + esc((f.home && f.home.name) || '') + '</b><span class="tag">BYE</span><span class="msg">no match this round</span></div>';
        var day = f.scheduled_at ? '<div class="fxday">' + fmtDay(new Date(f.scheduled_at)) + ' · ' + fmtTime(new Date(f.scheduled_at)) + '</div>' : '';
        return '<div class="lg-fx2" data-id="' + f.id + '"><div class="tm a">' + esc((f.home && f.home.name) || 'TBD') + crest(f.home) + '</div>'
          + '<div class="mid">' + day + '<div class="sc"><input type="number" class="lg-hs" value="' + (f.home_score != null ? f.home_score : '') + '" placeholder="–"><span class="v">v</span><input type="number" class="lg-as" value="' + (f.away_score != null ? f.away_score : '') + '" placeholder="–"></div></div>'
          + '<div class="tm">' + crest(f.away) + esc((f.away && f.away.name) || 'TBD') + '</div></div>';
      }).join('') + '</div>';
    }).join('');
  }
  function matchEditor() {
    return '<div class="lg-edit lg-maed"><select class="lg-sel" id="lg-mm-h" style="flex:1;min-width:150px">' + entOpts(null) + '</select>'
      + '<span style="font-weight:800;color:#8a99a6">v</span><select class="lg-sel" id="lg-mm-a" style="flex:1;min-width:150px">' + entOpts(null) + '</select>'
      + '<input class="lg-in" id="lg-mm-r" type="number" placeholder="Round" value="1" style="width:96px">'
      + '<button class="lg-btn pri" onclick="FFPLeague.saveMatch()">' + ic('check') + 'Add</button>'
      + '<button class="lg-btn ghost" onclick="FFPLeague.cancelMatch()">Cancel</button></div>';
  }
  function addMatch(tab) { S.addMatch = tab; renderTab(); }
  function cancelMatch() { S.addMatch = null; renderTab(); }
  async function saveMatch() {
    var h = (document.getElementById('lg-mm-h') || {}).value || null, a = (document.getElementById('lg-mm-a') || {}).value || null, rd = +((document.getElementById('lg-mm-r') || {}).value) || 1;
    if (!h || !a || h === a) { toast('Pick two different teams', 'error'); return; }
    var r; try { r = await sb().rpc('lt_match_add', { p_scope: 'league', p_division: S.divId, p_round: rd, p_home: h, p_away: a, p_when: null, p_field: null, p_stage: 'regular' }); } catch (e) { r = { error: e }; }
    if (r.error) { toast('Could not add', 'error'); return; } S.addMatch = null; toast('Match added', 'success'); renderTab();
  }
  function confirmGen() { S.fxConfirm = true; renderTab(); }
  function cancelGen() { S.fxConfirm = false; renderTab(); }
  async function doGen() {
    S.fxConfirm = false;
    var r; try { r = await sb().rpc('league_fixtures_generate', { p_division: S.divId }); } catch (e) { r = { error: e }; }
    if (r.error) { toast('Could not generate', 'error'); return; } toast((r.data || 0) + ' fixtures created', 'success'); renderTab();
  }
  async function saveResults() {
    var rows = Array.prototype.slice.call(document.querySelectorAll('.lg-fx')); var n = 0;
    for (var i = 0; i < rows.length; i++) { var el = rows[i]; var h = el.querySelector('.lg-hs').value, a = el.querySelector('.lg-as').value; if (h === '' || a === '') continue; try { await sb().rpc('league_result_save', { p_fixture: el.getAttribute('data-id'), p_home: +h, p_away: +a, p_sets: null, p_status: 'final' }); n++; } catch (e) {} }
    toast(n + ' results saved', 'success'); renderTab();
  }

  // ---------- TABLE ----------
  async function renderTable(host) {
    var divs = S.detail.divisions || [];
    if (!divs.length) { host.innerHTML = '<div class="lg-empty">Add a division first.</div>'; return; }
    if (!S.divId) S.divId = divs[0].id;
    host.innerHTML = '<div class="lg-tool"><select class="lg-sel" onchange="FFPLeague.setDiv(this.value,\'table\')">' + divOpts() + '</select></div><div id="lg-tbl"><div class="lg-empty">Loading…</div></div>';
    var r; try { r = await sb().rpc('league_table', { p_division: S.divId }); } catch (e) { r = { error: e }; }
    var rows = ((r && r.data) || {}).rows || []; var host2 = document.getElementById('lg-tbl');
    if (!rows.length) { host2.innerHTML = '<div class="lg-empty">No results yet — the table fills as games are played.</div>'; return; }
    host2.innerHTML = '<div class="lg-tb head"><span>#</span><span class="nm">Entrant</span><span>P</span><span>W</span><span>D</span><span>+/-</span><span>Pts</span></div>'
      + rows.map(function (r2, i) { return '<div class="lg-tb"><span>' + (i + 1) + '</span><span class="nm">' + esc(r2.name) + '</span><span>' + r2.p + '</span><span>' + r2.w + '</span><span>' + r2.d + '</span><span>' + (r2.gd > 0 ? '+' + r2.gd : r2.gd) + '</span><span class="pts">' + r2.pts + '</span></div>'; }).join('');
  }

  function pickImg(kind) {
    if (!window.FFPUpload) { toast('Uploader not ready — refresh', 'error'); return; }
    var isLogo = kind === 'logo';
    window.FFPUpload.pick({ bucket: isLogo ? 'provider-logos' : 'listing-covers', key: (isLogo ? 'lglogo-' : 'lgcover-') + S.eventId + '-' + Date.now(),
      aspect: isLogo ? 1 : 16 / 9, outW: isLogo ? 512 : 1600, outH: isLogo ? 512 : 900, title: isLogo ? 'League logo (square)' : 'Banner (16:9)',
      onDone: function (url) { var p = {}; p[isLogo ? 'logo_url' : 'cover_url'] = url; sb().rpc('league_event_save', { p_id: S.eventId, p: p }).then(function () { toast('Saved', 'success'); open(S.eventId); }); },
      onError: function (e) { toast('Upload failed', 'error'); } });
  }
  function entLogo(id) {
    if (!window.FFPUpload) { toast('Uploader not ready — refresh', 'error'); return; }
    window.FFPUpload.pick({ bucket: 'provider-logos', key: 'lgteam-' + id + '-' + Date.now(), aspect: 1, outW: 400, outH: 400, title: 'Team logo (square)',
      onDone: function (url) { sb().rpc('league_entrant_set_logo', { p_id: id, p_logo: url }).then(function () { toast('Logo saved', 'success'); renderTab(); }); },
      onError: function () { toast('Upload failed', 'error'); } });
  }
  async function refreshDetail() { var r; try { r = await sb().rpc('league_detail', { p_league: S.eventId }); } catch (e) { r = { error: e }; } S.detail = (r && r.data) || S.detail; renderTab(); }
  function divOpts() { return (S.detail.divisions || []).map(function (d) { return '<option value="' + d.id + '"' + (d.id === S.divId ? ' selected' : '') + '>' + esc(d.name) + '</option>'; }).join(''); }

  window.FFPLeague = {
    open: open, startCreate: startCreate, cancelCreate: cancelCreate, doCreate: doCreate,
    back: function () { S.view = 'list'; renderList(); }, tab: function (t) { S.tab = t; renderEditor(); },
    setDiv: function (val, tab) { S.divId = val; S.tab = tab; renderTab(); },
    seg: function (btn, id) { document.querySelectorAll('#' + id + ' button').forEach(function (b) { b.classList.remove('on'); }); btn.classList.add('on'); },
    saveDetails: saveDetails, sportHint: sportHint, pickImg: pickImg, entLogo: entLogo, editDivision: editDivision, cancelDivision: cancelDivision, saveDivision: saveDivision,
    addEntrant: addEntrant, cancelEntrant: cancelEntrant, saveEntrant: saveEntrant,
    confirmGen: confirmGen, cancelGen: cancelGen, doGen: doGen, saveResults: saveResults,
    addOfficial: addOfficial, removeOfficial: removeOfficial, autoplan: autoplan, schedSet: schedSet,
    togRound: togRound, addMatch: addMatch, cancelMatch: cancelMatch, saveMatch: saveMatch,
    addVenue: addVenue, editVenue: editVenue, cancelVenue: cancelVenue, saveVenue: saveVenue, removeVenue: removeVenue,
    addSurface: addSurface, cancelSurface: cancelSurface, saveSurface: saveSurface, removeSurface: removeSurface,
    offAdd: offAdd, offRemove: offRemove
  };
  window.ffpRenderLeagues = function () { S.view = 'list'; S.creating = false; renderList(); };
})();
