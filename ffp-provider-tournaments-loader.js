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
      '.tg-brk{overflow-x:auto;padding:6px 2px 16px;} .tg-brkin{display:flex;gap:16px;min-width:max-content;}',
      '.tg-rnd{display:flex;flex-direction:column;justify-content:space-around;gap:14px;min-width:200px;} .tg-rnd .rh{font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.5px;color:#9aa8b4;text-align:center;margin-bottom:2px;}',
      '.tg-m{background:#fff;border:1px solid #d7dee5;border-radius:11px;overflow:hidden;} .tg-m .s{display:flex;align-items:center;gap:7px;padding:7px 9px;} .tg-m .s+.s{border-top:1px solid #eef1f6;} .tg-m .s b{flex:1;font-size:12.5px;font-weight:700;color:#12232f;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;} .tg-m .s input{width:40px;padding:5px;border:1.5px solid #d7dee5;border-radius:7px;font:inherit;font-weight:800;text-align:center;} .tg-m .s.win b{color:#0a8f5f;} .tg-m .s.tbd b{color:#9aa8b4;font-weight:600;}',
      '.tg-grph{font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:.4px;color:#12232f;margin:16px 0 4px;}',
      '.tg-fmts{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;} .tg-fmt{border:1.5px solid var(--ffp-border);border-radius:14px;padding:16px 12px;cursor:pointer;text-align:center;} .tg-fmt.on{border-color:var(--ffp-blue);box-shadow:0 0 0 3px rgba(25,128,173,.12);} .tg-fmt .dia{height:74px;display:flex;align-items:center;justify-content:center;margin-bottom:10px;} .tg-fmt b{display:block;font-size:13.5px;font-weight:900;} .tg-fmt span{display:block;font-size:11.5px;color:var(--ffp-text-muted);font-weight:600;margin-top:3px;line-height:1.4;} .tgd rect{fill:none;stroke:#c3ced6;stroke-width:2.4;} .tgd line{stroke:#c3ced6;stroke-width:2.4;} .tg-fmt.on .tgd rect,.tg-fmt.on .tgd line{stroke:var(--ffp-blue);}',
      '.tg-fmtset{margin-top:18px;border-top:1px solid var(--ffp-border);padding-top:16px;}',
      '.lg-fldbar{display:flex;gap:10px;flex-wrap:wrap;align-items:center;} .lg-fldchip{display:inline-flex;align-items:center;gap:7px;border:1px solid var(--ffp-border-mid);border-radius:12px;padding:7px 11px;font-size:12.5px;font-weight:800;} .lg-fldchip .t{color:var(--ffp-text-muted);font-weight:700;} .lg-fldchip .x{color:#9aa8b4;font-size:16px;cursor:pointer;} .lg-fldchip.add{border-style:dashed;gap:4px;}',
      '.lg-srow{display:grid;grid-template-columns:1fr 108px 128px 148px;gap:10px;align-items:center;padding:10px 2px;border-bottom:1px solid var(--ffp-border);} .lg-srow .mt{font-size:13.5px;font-weight:800;color:var(--ffp-text);min-width:0;} .lg-srow .mt span{display:block;font-size:11px;color:var(--ffp-text-muted);font-weight:600;} .lg-srow .lg-in,.lg-srow .lg-sel{padding:8px 9px;font-size:12.5px;width:100%;}'
    ].join('\n');
    document.head.appendChild(css);
  }
  function injectCss() { injectBaseCss(); injectExtraCss(); }

  async function loadSports() { if (S.sports) return S.sports; var r = await sb().from('lt_sport_schemas').select('key,name,icon,match_activities').eq('active', true).order('sort'); S.sports = r.data || []; return S.sports; }
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
      + '<div class="lg-nav">' + tabBtn('details', 'Details') + tabBtn('divisions', 'Categories') + tabBtn('entrants', 'Entrants') + tabBtn('structure', 'Structure') + (ev.group_stage ? tabBtn('groups', 'Group stage') : '') + tabBtn('bracket', 'Bracket & results') + tabBtn('officials', 'Officials') + tabBtn('schedule', 'Schedule') + '</div><div id="tg-tab"></div></div>';
    renderTab();
  }
  function tabBtn(id, label) { return '<button class="' + (S.tab === id ? 'on' : '') + '" onclick="FFPTourn.tab(\'' + id + '\')">' + label + '</button>'; }
  function renderTab() {
    var host = document.getElementById('tg-tab'); if (!host) return;
    if (S.tab === 'details') return renderDetails(host);
    if (S.tab === 'divisions') return renderDivisions(host);
    if (S.tab === 'entrants') return renderEntrants(host);
    if (S.tab === 'structure') return renderStructure(host);
    if (S.tab === 'groups') return renderGroups(host);
    if (S.tab === 'bracket') return renderBracket(host);
    if (S.tab === 'officials') return renderOfficials(host);
    if (S.tab === 'schedule') return renderSchedule(host);
  }

  // ---------- STRUCTURE (visual format picker) ----------
  function renderStructure(host) {
    var ev = S.detail.event || {};
    var fmt = S.fmt || (ev.group_stage ? 'gk' : 'ko');
    S.fmt = fmt;
    var card = function (key, title, sub, svg) {
      return '<div class="tg-fmt' + (fmt === key ? ' on' : '') + '" onclick="FFPTourn.setFmt(\'' + key + '\')"><div class="dia">' + svg + '</div><b>' + title + '</b><span>' + sub + '</span></div>';
    };
    var grpSvg = '<svg width="56" height="60" viewBox="0 0 56 60" class="tgd"><rect x="2" y="4" width="52" height="12" rx="2"/><rect x="2" y="18" width="52" height="12" rx="2"/><rect x="2" y="32" width="52" height="12" rx="2"/><rect x="2" y="46" width="52" height="12" rx="2"/></svg>';
    var gkSvg = '<svg width="86" height="74" viewBox="0 0 86 74" class="tgd"><rect x="2" y="4" width="34" height="10"/><rect x="2" y="17" width="34" height="10"/><rect x="2" y="30" width="34" height="10"/><rect x="52" y="10" width="32" height="10"/><line x1="36" y1="9" x2="52" y2="15"/><line x1="36" y1="35" x2="52" y2="15"/><rect x="16" y="52" width="24" height="9"/><rect x="16" y="63" width="24" height="9"/><rect x="48" y="57" width="24" height="9"/><line x1="40" y1="56" x2="48" y2="61"/><line x1="40" y1="67" x2="48" y2="61"/></svg>';
    var koSvg = '<svg width="80" height="66" viewBox="0 0 80 66" class="tgd"><rect x="2" y="8" width="26" height="10"/><rect x="2" y="22" width="26" height="10"/><rect x="2" y="40" width="26" height="10"/><rect x="2" y="54" width="26" height="10"/><rect x="40" y="14" width="26" height="10"/><rect x="40" y="46" width="26" height="10"/><line x1="28" y1="13" x2="40" y2="19"/><line x1="28" y1="27" x2="40" y2="19"/><line x1="28" y1="45" x2="40" y2="51"/><line x1="28" y1="59" x2="40" y2="51"/></svg>';
    host.innerHTML =
      '<div class="lg-tool" style="margin-bottom:14px">' + (S.detail.divisions.length ? '<select class="lg-sel" onchange="FFPTourn.setDiv(this.value,\'structure\')">' + divOpts() + '</select>' : '<span class="lg-empty" style="padding:0">Add a category first.</span>') + '</div>'
      + '<div class="tg-fmts">' + card('grp', 'Group only', 'Round-robin, final table', grpSvg) + card('gk', 'Groups → Knockout', 'Top N advance to a bracket', gkSvg) + card('ko', 'Knockout only', 'Straight single elimination', koSvg) + '</div>'
      + '<div class="tg-fmtset">'
      + (fmt !== 'ko' ? '<div class="lg-2"><div class="lg-fld"><div class="lg-lab">Groups</div><input class="lg-in" id="tg-ng2" type="number" value="' + (ev.groups_advance ? 4 : 4) + '"></div><div class="lg-fld"><div class="lg-lab">Advance per group</div><input class="lg-in" id="tg-adv2" type="number" value="' + (ev.groups_advance || 2) + '"></div></div>' : '')
      + '<div class="lg-fld" style="margin-top:6px"><div class="lg-lab">3rd-place play-off</div><div class="lg-seg" id="tg-third2"><button data-v="true" class="' + (ev.third_place ? 'on' : '') + '" onclick="FFPTourn.seg(this,\'tg-third2\')">Yes</button><button data-v="false" class="' + (!ev.third_place ? 'on' : '') + '" onclick="FFPTourn.seg(this,\'tg-third2\')">No</button></div></div>'
      + '<button class="lg-btn pri" style="margin-top:14px" onclick="FFPTourn.buildStructure()">' + ic('bolt') + 'Build structure</button>'
      + '<div class="lg-empty" style="text-align:left;padding:10px 0 0">' + (fmt === 'grp' ? 'Draws round-robin groups, ranked into a final table.' : fmt === 'ko' ? 'Draws a single-elimination bracket from your seeds.' : 'Draws groups, then the top entrants seed into a knockout bracket.') + '</div></div>';
  }
  function setFmt(k) { S.fmt = k; renderTab(); }
  async function buildStructure() {
    if (!S.divId) { toast('Pick a category', 'error'); return; }
    var fmt = S.fmt || 'ko'; var third = segVal('tg-third2') === 'true';
    await sb().rpc('tourn_event_save', { p_id: S.eventId, p: { group_stage: (fmt !== 'ko'), groups_advance: +((document.getElementById('tg-adv2') || {}).value || 2), third_place: third } });
    if (fmt !== 'ko') {
      var ng = +((document.getElementById('tg-ng2') || {}).value) || 2;
      var g; try { g = await sb().rpc('tourn_groups_generate', { p_division: S.divId, p_num_groups: ng }); } catch (e) { g = { error: e }; }
      if (g.error) { toast('Could not draw groups', 'error'); return; }
      toast('Groups drawn — enter results, then build the bracket', 'success'); S.tab = 'groups'; open(S.eventId); return;
    }
    var r; try { r = await sb().rpc('tourn_bracket_build', { p_division: S.divId }); } catch (e) { r = { error: e }; }
    if (r.error) { toast('Could not build bracket', 'error'); return; }
    toast('Bracket built', 'success'); S.tab = 'bracket'; open(S.eventId);
  }

  // ---------- OFFICIALS ----------
  async function renderOfficials(host) {
    host.innerHTML = '<div class="lg-sub" style="margin-bottom:12px">Officials can enter results from their own login. Add by FFP email to link their account.</div>'
      + '<div class="lg-edit"><input class="lg-in" id="tg-ofname" placeholder="Name" style="max-width:200px"><input class="lg-in" id="tg-ofemail" placeholder="FFP email (optional)"><button class="lg-btn pri" onclick="FFPTourn.addOfficial()">' + ic('add') + 'Add official</button></div><div id="tg-oflist"><div class="lg-empty">Loading…</div></div>';
    var r; try { r = await sb().rpc('lt_officials_list', { p_scope: 'tourn', p_event: S.eventId }); } catch (e) { r = { error: e }; }
    var rows = (r && r.data) || []; var h2 = document.getElementById('tg-oflist');
    h2.innerHTML = rows.length ? rows.map(function (o) {
      return '<div class="lg-row"><span class="lg-av" style="' + (o.photo ? 'background-image:url(\'' + esc(o.photo) + '\')' : '') + '">' + (o.photo ? '' : esc((o.name || '?').slice(0, 1))) + '</span><div class="g"><b>' + esc(o.name || o.email || 'Official') + '</b><span>' + (o.member_id ? 'FFP account linked · can score' : (o.email ? esc(o.email) + ' · not linked' : 'Manual')) + '</span></div><span class="ms act" onclick="FFPTourn.removeOfficial(\'' + o.id + '\')">close</span></div>';
    }).join('') : '<div class="lg-empty">No officials yet.</div>';
  }
  async function addOfficial() {
    var nm = (document.getElementById('tg-ofname') || {}).value, em = (document.getElementById('tg-ofemail') || {}).value;
    if (!nm && !em) return;
    var r; try { r = await sb().rpc('lt_official_add', { p_scope: 'tourn', p_event: S.eventId, p_member: null, p_name: nm, p_email: em }); } catch (e) { r = { error: e }; }
    if (r.error) { toast('Could not add', 'error'); return; } toast('Added', 'success'); renderTab();
  }
  async function removeOfficial(id) { await sb().rpc('lt_official_remove', { p_id: id }); renderTab(); }

  // ---------- SCHEDULE ----------
  async function renderSchedule(host) {
    var divs = S.detail.divisions || [];
    if (!S.divId && divs.length) S.divId = divs[0].id;
    var fr; try { fr = await sb().rpc('lt_fields_list', { p_scope: 'tourn', p_event: S.eventId }); } catch (e) { fr = { error: e }; }
    var fields = (fr && fr.data) || [];
    var chips = fields.map(function (f) { return '<span class="lg-fldchip"><span class="ms" style="font-size:15px;color:var(--ffp-blue)">stadium</span>' + esc(f.name) + ' <span class="t">· from ' + esc(f.start_time) + '</span><span class="ms x" onclick="FFPTourn.removeField(\'' + f.id + '\')">close</span></span>'; }).join('');
    host.innerHTML =
      '<div class="lg-fldbar">' + chips
      + '<span class="lg-fldchip add"><input class="lg-in" id="tg-fldname" placeholder="Field / court" style="width:130px;border:none;padding:4px"><input class="lg-in" id="tg-fldtime" type="time" value="08:00" style="width:96px;border:none;padding:4px"><button class="lg-btn sm pri" onclick="FFPTourn.addField()">Add</button></span></div>'
      + '<div class="lg-tool" style="margin-top:12px">' + (divs.length > 1 ? '<select class="lg-sel" onchange="FFPTourn.setDiv(this.value,\'schedule\')">' + divOpts() + '</select>' : '')
      + '<span class="lg-lab" style="margin:0">Match length</span><input class="lg-in" id="tg-mlen" type="number" value="30" style="width:64px"><span style="font-size:12px;color:var(--ffp-text-muted)">min</span>'
      + '<span class="sp"></span><button class="lg-btn pri" onclick="FFPTourn.autoplan()">' + ic('auto_awesome') + 'Auto-plan</button></div><div id="tg-schedlist"><div class="lg-empty">Loading…</div></div>';
    if (!fields.length) { document.getElementById('tg-schedlist').innerHTML = '<div class="lg-empty">Add a field/court above, then Auto-plan.</div>'; return; }
    if (!S.divId) { document.getElementById('tg-schedlist').innerHTML = '<div class="lg-empty">Add a category first.</div>'; return; }
    var names = await entrantNames(S.divId);
    var mr; try { mr = await sb().from('tourn_matches').select('id,stage,round,slot,home_entrant,away_entrant,scheduled_at,court,official_id').eq('division_id', S.divId).order('round').order('slot'); } catch (e) { mr = { error: e }; }
    var ms = (mr && mr.data) || []; var offr = await sb().rpc('lt_officials_list', { p_scope: 'tourn', p_event: S.eventId }); var offs = (offr && offr.data) || [];
    var host2 = document.getElementById('tg-schedlist');
    if (!ms.length) { host2.innerHTML = '<div class="lg-empty">No matches yet — draw groups or build the bracket first.</div>'; return; }
    host2.innerHTML = ms.map(function (m) {
      var t = m.scheduled_at ? new Date(m.scheduled_at) : null;
      var tv = t ? (('0' + t.getHours()).slice(-2) + ':' + ('0' + t.getMinutes()).slice(-2)) : '';
      var fldOpts = '<option value="">Court…</option>' + fields.map(function (x) { return '<option value="' + x.id + '"' + (m.court === x.name ? ' selected' : '') + '>' + esc(x.name) + '</option>'; }).join('');
      var ofOpts = '<option value="">Official…</option>' + offs.map(function (x) { return '<option value="' + x.id + '"' + (m.official_id === x.id ? ' selected' : '') + '>' + esc(x.name || x.email) + '</option>'; }).join('');
      var lbl = m.stage === 'group' ? ('Group ' + (m.group_label || '')) : (STAGE[m.stage] || m.stage);
      return '<div class="lg-srow" data-id="' + m.id + '"><div class="mt">' + esc(names[m.home_entrant] || 'TBD') + ' v ' + esc(names[m.away_entrant] || 'TBD') + '<span>' + esc(lbl) + '</span></div>'
        + '<input class="lg-in st-t" type="time" value="' + tv + '" onchange="FFPTourn.schedSet(\'' + m.id + '\')"><select class="lg-sel st-f" onchange="FFPTourn.schedSet(\'' + m.id + '\')">' + fldOpts + '</select><select class="lg-sel st-o" onchange="FFPTourn.schedSet(\'' + m.id + '\')">' + ofOpts + '</select></div>';
    }).join('');
  }
  async function addField() {
    var nm = (document.getElementById('tg-fldname') || {}).value, tm = (document.getElementById('tg-fldtime') || {}).value || '08:00';
    if (!nm || !nm.trim()) return;
    await sb().rpc('lt_field_save', { p_scope: 'tourn', p_event: S.eventId, p_id: null, p_name: nm.trim(), p_start: tm }); renderTab();
  }
  async function removeField(id) { await sb().rpc('lt_field_remove', { p_id: id }); renderTab(); }
  async function autoplan() {
    if (!S.divId) { toast('Pick a category', 'error'); return; }
    var len = +((document.getElementById('tg-mlen') || {}).value) || 30;
    var r; try { r = await sb().rpc('lt_autoplan', { p_scope: 'tourn', p_division: S.divId, p_match_len: len }); } catch (e) { r = { error: e }; }
    if (r.error) { toast(/no_fields/.test(r.error.message || '') ? 'Add a field first' : 'Could not plan', 'error'); return; }
    toast((r.data || 0) + ' matches planned', 'success'); renderTab();
  }
  async function schedSet(id) {
    var row = document.querySelector('.lg-srow[data-id="' + id + '"]'); if (!row) return;
    var tv = row.querySelector('.st-t').value, fid = row.querySelector('.st-f').value || null, oid = row.querySelector('.st-o').value || null;
    var when = null;
    if (tv) { var base = (S.detail.event && S.detail.event.starts_at) || new Date().toISOString().slice(0, 10); when = new Date(base + 'T' + tv + ':00').toISOString(); }
    await sb().rpc('lt_match_schedule', { p_scope: 'tourn', p_match: id, p_when: when, p_field: fid, p_court: null, p_official: oid });
    toast('Saved', 'success');
  }

  async function renderDetails(host) {
    var ev = S.detail.event || {}; await loadSports(); await taxReady();
    host.innerHTML =
      '<div class="lg-fld"><div class="lg-lab">Tournament name</div><input class="lg-in" id="tg-name" value="' + esc(ev.name) + '"></div>'
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
      + '<button class="lg-btn pri" onclick="FFPTourn.saveDetails()">' + ic('check') + 'Save</button>';
  }
  function segVal(id) { var b = document.querySelector('#' + id + ' button.on'); return b ? b.getAttribute('data-v') : null; }
  function v(id) { var e = document.getElementById(id); return e ? e.value : ''; }
  async function saveDetails() {
    var p = { name: v('tg-name'), activity: v('tg-sport'), group_stage: segVal('tg-gs') === 'true', groups_advance: +v('tg-adv'), seeding_mode: v('tg-seed'),
      city: v('tg-city'), country: v('tg-country'), starts_at: v('tg-start') || null, ends_at: v('tg-end') || null,
      third_place: segVal('tg-third') === 'true', status: v('tg-status'), description: v('tg-desc'), rules: v('tg-rules') };
    var r; try { r = await sb().rpc('tourn_event_save', { p_id: S.eventId, p: p }); } catch (e) { r = { error: e }; }
    if (r.error) { toast('Save failed', 'error'); return; } toast('Saved', 'success'); open(S.eventId);
  }

  // CATEGORIES (inline)
  function renderDivisions(host) {
    var divs = S.detail.divisions || [];
    var rows = divs.map(function (d) {
      if (S.divEdit === d.id) return divEditor(d);
      return '<div class="lg-row"><span class="ms drag">drag_indicator</span><div class="g"><b>' + esc(d.name) + '</b> <span>· ' + (d.kind === 'individual' ? 'Individual' : 'Team') + ' · ' + (d.entrant_count || 0) + ' in</span></div><span class="ms act" onclick="FFPTourn.editDivision(\'' + d.id + '\')">edit</span></div>';
    }).join('');
    var adder = S.divEdit === 'new' ? divEditor(null) : '<button class="lg-btn" style="margin-top:12px" onclick="FFPTourn.editDivision(\'new\')">' + ic('add') + 'Add category</button>';
    host.innerHTML = rows + adder; var f = document.getElementById('tg-dvname'); if (f) f.focus();
  }
  function divEditor(d) {
    d = d || {}; var isTeam = (d.kind || 'team') !== 'individual';
    var gOpts = '<option value="">Open / any</option>' + genderNames().map(function (g) { return '<option' + (d.gender === g ? ' selected' : '') + '>' + esc(g) + '</option>'; }).join('');
    return '<div class="lg-edit"><input class="lg-in" id="tg-dvname" placeholder="Category name" value="' + esc(d.name || '') + '">'
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
    if (!divs.length) { host.innerHTML = '<div class="lg-empty">Add a category first.</div>'; return; }
    if (!S.divId) S.divId = divs[0].id;
    var adder = S.entAdd
      ? '<div class="lg-edit"><input class="lg-in" id="tg-entname" placeholder="Team / player name" onkeydown="if(event.key===\'Enter\')FFPTourn.saveEntrant()"><button class="lg-btn pri" onclick="FFPTourn.saveEntrant()">' + ic('check') + 'Add</button><button class="lg-btn ghost" onclick="FFPTourn.cancelEntrant()">Cancel</button></div>'
      : '<button class="lg-btn" onclick="FFPTourn.addEntrant()">' + ic('add') + 'Add team / player</button>';
    host.innerHTML = '<div class="lg-tool"><select class="lg-sel" onchange="FFPTourn.setDiv(this.value,\'entrants\')">' + divOpts() + '</select><span class="sp"></span></div>' + adder + '<div id="tg-roster"><div class="lg-empty">Loading…</div></div>';
    var f = document.getElementById('tg-entname'); if (f) f.focus();
    var r; try { r = await sb().rpc('tourn_roster', { p_division: S.divId }); } catch (e) { r = { error: e }; }
    var rows = (r && r.data) || []; var host2 = document.getElementById('tg-roster');
    host2.innerHTML = rows.length ? rows.map(function (en) { return '<div class="lg-row"><span class="lg-av" style="' + (en.logo ? 'background-image:url(\'' + esc(en.logo) + '\')' : '') + '">' + (en.logo ? '' : esc((en.name || '?').slice(0, 1))) + '</span><div class="g"><b>' + esc(en.name) + '</b> <span>· ' + esc(en.status) + (en.group_label ? ' · Group ' + esc(en.group_label) : '') + '</span></div></div>'; }).join('') : '<div class="lg-empty">No entrants yet. Members self-register in the app, or add them here.</div>';
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
    var divs = S.detail.divisions || []; if (!divs.length) { host.innerHTML = '<div class="lg-empty">Add a category first.</div>'; return; }
    if (!S.divId) S.divId = divs[0].id;
    var drawCtl = S.grpDraw
      ? '<span class="lg-lab" style="margin:0">Groups</span><input class="lg-in" id="tg-ng" type="number" value="2" min="1"><button class="lg-btn pri" onclick="FFPTourn.doGroups()">' + ic('check') + 'Draw</button><button class="lg-btn ghost" onclick="FFPTourn.cancelGroups()">Cancel</button>'
      : '<button class="lg-btn" onclick="FFPTourn.startGroups()">' + ic('shuffle') + 'Draw groups</button>';
    var brkCtl = S.brkConfirm
      ? '<button class="lg-btn green" onclick="FFPTourn.doBracket()">' + ic('check') + 'Confirm build</button><button class="lg-btn ghost" onclick="FFPTourn.cancelBracket()">Cancel</button>'
      : '<button class="lg-btn green" onclick="FFPTourn.confirmBracket()">' + ic('account_tree') + 'Build bracket from groups</button>';
    host.innerHTML = '<div class="lg-tool"><select class="lg-sel" onchange="FFPTourn.setDiv(this.value,\'groups\')">' + divOpts() + '</select><span class="sp"></span>' + drawCtl + '<button class="lg-btn pri" onclick="FFPTourn.saveGroupResults()">' + ic('check') + 'Save results</button>' + brkCtl + '</div><div id="tg-glist"><div class="lg-empty">Loading…</div></div>';
    if (S.grpDraw) { var gi = document.getElementById('tg-ng'); if (gi) gi.focus(); }
    var r; try { r = await sb().from('tourn_matches').select('*').eq('division_id', S.divId).eq('stage', 'group').order('group_label').order('slot'); } catch (e) { r = { error: e }; }
    var ms = (r && r.data) || []; var host2 = document.getElementById('tg-glist');
    if (!ms.length) { host2.innerHTML = '<div class="lg-empty">No groups yet — draw groups to assign entrants and fixtures.</div>'; return; }
    var names = await entrantNames(S.divId);
    var byG = {}; ms.forEach(function (m) { (byG[m.group_label] = byG[m.group_label] || []).push(m); });
    host2.innerHTML = Object.keys(byG).sort().map(function (g) {
      return '<div class="tg-grph">Group ' + esc(g) + '</div>' + byG[g].map(function (m) {
        return '<div class="lg-fx" data-id="' + m.id + '"><div class="t a">' + esc(names[m.home_entrant] || 'TBD') + '</div><div class="sc"><input type="number" class="tg-hs" value="' + (m.home_score != null ? m.home_score : '') + '" placeholder="–"><input type="number" class="tg-as" value="' + (m.away_score != null ? m.away_score : '') + '" placeholder="–"></div><div class="t">' + esc(names[m.away_entrant] || 'TBD') + '</div></div>';
      }).join('');
    }).join('');
  }
  function startGroups() { S.grpDraw = true; renderTab(); }
  function cancelGroups() { S.grpDraw = false; renderTab(); }
  async function doGroups() {
    var n = parseInt((document.getElementById('tg-ng') || {}).value, 10) || 2; S.grpDraw = false;
    var r; try { r = await sb().rpc('tourn_groups_generate', { p_division: S.divId, p_num_groups: n }); } catch (e) { r = { error: e }; }
    if (r.error) { toast('Could not draw groups', 'error'); return; } toast('Groups drawn', 'success'); open(S.eventId);
  }
  async function saveGroupResults() {
    var rows = Array.prototype.slice.call(document.querySelectorAll('#tg-glist .lg-fx')); var n = 0;
    for (var i = 0; i < rows.length; i++) { var el = rows[i]; var h = el.querySelector('.tg-hs').value, a = el.querySelector('.tg-as').value; if (h === '' || a === '') continue; try { await sb().rpc('tourn_result_save', { p_match: el.getAttribute('data-id'), p_home: +h, p_away: +a, p_sets: null, p_status: 'final' }); n++; } catch (e) {} }
    toast(n + ' results saved', 'success'); renderTab();
  }
  function confirmBracket() { S.brkConfirm = true; renderTab(); }
  function cancelBracket() { S.brkConfirm = false; renderTab(); }
  async function doBracket() {
    S.brkConfirm = false;
    var r; try { r = await sb().rpc('tourn_bracket_build', { p_division: S.divId }); } catch (e) { r = { error: e }; }
    if (r.error) { toast('Could not build bracket', 'error'); return; } toast('Bracket built', 'success'); S.tab = 'bracket'; open(S.eventId);
  }

  // BRACKET
  async function renderBracket(host) {
    var divs = S.detail.divisions || []; if (!divs.length) { host.innerHTML = '<div class="lg-empty">Add a category first.</div>'; return; }
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
    var thirdHtml = third ? '<div class="tg-rnd"><div class="rh">3rd place</div>' + mHtml(third) + '</div>' : '';
    host2.innerHTML = '<div class="tg-brk"><div class="tg-brkin">' + cols + thirdHtml + '</div></div>';
  }
  function mHtml(m) {
    var hw = m.winner_entrant && m.home && m.home.id === m.winner_entrant, aw = m.winner_entrant && m.away && m.away.id === m.winner_entrant;
    return '<div class="tg-m" data-id="' + m.id + '"><div class="s ' + (hw ? 'win' : (m.home ? '' : 'tbd')) + '"><b>' + esc((m.home && m.home.name) || 'TBD') + '</b><input type="number" class="tg-hs" value="' + (m.home_score != null ? m.home_score : '') + '" placeholder="–"></div>'
      + '<div class="s ' + (aw ? 'win' : (m.away ? '' : 'tbd')) + '"><b>' + esc((m.away && m.away.name) || 'TBD') + '</b><input type="number" class="tg-as" value="' + (m.away_score != null ? m.away_score : '') + '" placeholder="–"></div></div>';
  }
  async function saveBracketResults() {
    var cards = Array.prototype.slice.call(document.querySelectorAll('#tg-brk .tg-m')); var n = 0;
    for (var i = 0; i < cards.length; i++) { var el = cards[i]; var h = el.querySelector('.tg-hs').value, a = el.querySelector('.tg-as').value; if (h === '' || a === '') continue; try { await sb().rpc('tourn_result_save', { p_match: el.getAttribute('data-id'), p_home: +h, p_away: +a, p_sets: null, p_status: 'final' }); n++; } catch (e) {} }
    toast(n + ' saved — winners advanced', 'success'); renderTab();
  }

  async function entrantNames(divId) { var r = await sb().rpc('tourn_roster', { p_division: divId }); var map = {}; (r.data || []).forEach(function (e) { map[e.id] = e.name; }); return map; }
  async function refreshDetail() { var r; try { r = await sb().rpc('tourn_detail', { p_tourn: S.eventId }); } catch (e) { r = { error: e }; } S.detail = (r && r.data) || S.detail; renderTab(); }
  function divOpts() { return (S.detail.divisions || []).map(function (d) { return '<option value="' + d.id + '"' + (d.id === S.divId ? ' selected' : '') + '>' + esc(d.name) + '</option>'; }).join(''); }

  window.FFPTourn = {
    open: open, startCreate: startCreate, cancelCreate: cancelCreate, doCreate: doCreate,
    back: function () { S.view = 'list'; renderList(); }, tab: function (t) { S.tab = t; renderEditor(); },
    setDiv: function (val, tab) { S.divId = val; S.tab = tab; renderTab(); },
    seg: function (btn, id) { document.querySelectorAll('#' + id + ' button').forEach(function (b) { b.classList.remove('on'); }); btn.classList.add('on'); },
    saveDetails: saveDetails, sportHint: sportHint, editDivision: editDivision, cancelDivision: cancelDivision, saveDivision: saveDivision,
    addEntrant: addEntrant, cancelEntrant: cancelEntrant, saveEntrant: saveEntrant,
    startGroups: startGroups, cancelGroups: cancelGroups, doGroups: doGroups, saveGroupResults: saveGroupResults,
    confirmBracket: confirmBracket, cancelBracket: cancelBracket, doBracket: doBracket, saveBracketResults: saveBracketResults,
    setFmt: setFmt, buildStructure: buildStructure, addOfficial: addOfficial, removeOfficial: removeOfficial,
    addField: addField, removeField: removeField, autoplan: autoplan, schedSet: schedSet
  };
  window.ffpRenderTournaments = function () { S.view = 'list'; S.creating = false; renderList(); };
})();
