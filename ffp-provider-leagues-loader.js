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
      '.lg-tb{display:grid;grid-template-columns:26px 1fr 30px 30px 30px 44px 40px;align-items:center;gap:6px;padding:10px 6px;border-bottom:1px solid var(--ffp-border);font-size:13px;} .lg-tb span{text-align:center;} .lg-tb .nm{text-align:left;font-weight:800;} .lg-tb.head{font-size:10px;font-weight:800;text-transform:uppercase;color:var(--ffp-text-muted);} .lg-tb .pts{font-weight:900;color:var(--ffp-blue);}'
    ].join('\n');
    document.head.appendChild(css);
  }

  async function loadSports() { if (S.sports) return S.sports; var r = await sb().from('lt_sport_schemas').select('key,name,icon').eq('active', true).order('sort'); S.sports = r.data || []; return S.sports; }

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
      + '<div class="lg-nav">' + tabBtn('details', 'Details') + tabBtn('divisions', 'Divisions') + tabBtn('entrants', 'Entrants') + tabBtn('fixtures', 'Fixtures & results') + tabBtn('table', 'Table') + '</div><div id="lg-tab"></div></div>';
    renderTab();
  }
  function tabBtn(id, label) { return '<button class="' + (S.tab === id ? 'on' : '') + '" onclick="FFPLeague.tab(\'' + id + '\')">' + label + '</button>'; }
  function renderTab() {
    var host = document.getElementById('lg-tab'); if (!host) return;
    if (S.tab === 'details') return renderDetails(host);
    if (S.tab === 'divisions') return renderDivisions(host);
    if (S.tab === 'entrants') return renderEntrants(host);
    if (S.tab === 'fixtures') return renderFixtures(host);
    if (S.tab === 'table') return renderTable(host);
  }

  // ---------- DETAILS ----------
  async function renderDetails(host) {
    var ev = S.detail.event || {}; var sports = await loadSports();
    var sportOpts = sports.map(function (s) { return '<option value="' + s.key + '"' + (ev.sport_key === s.key ? ' selected' : '') + '>' + esc(s.name) + '</option>'; }).join('');
    host.innerHTML =
      '<div class="lg-fld"><div class="lg-lab">League name</div><input class="lg-in" id="lg-name" value="' + esc(ev.name) + '"></div>'
      + '<div class="lg-2"><div class="lg-fld"><div class="lg-lab">Sport</div><select class="lg-sel" id="lg-sport">' + sportOpts + '</select></div>'
      + '<div class="lg-fld"><div class="lg-lab">Schedule</div><div class="lg-seg" id="lg-mode"><button data-v="single" class="' + (ev.schedule_mode !== 'home_away' ? 'on' : '') + '" onclick="FFPLeague.seg(this,\'lg-mode\')">Single</button><button data-v="home_away" class="' + (ev.schedule_mode === 'home_away' ? 'on' : '') + '" onclick="FFPLeague.seg(this,\'lg-mode\')">Home &amp; away</button></div></div></div>'
      + '<div class="lg-2"><div class="lg-fld"><div class="lg-lab">City</div><input class="lg-in" id="lg-city" value="' + esc(ev.city || '') + '"></div><div class="lg-fld"><div class="lg-lab">Country</div><input class="lg-in" id="lg-country" value="' + esc(ev.country || '') + '"></div></div>'
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
    var p = { name: v('lg-name'), sport_key: v('lg-sport'), schedule_mode: segVal('lg-mode'), city: v('lg-city'), country: v('lg-country'),
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
    return '<div class="lg-edit">'
      + '<input class="lg-in" id="lg-dvname" placeholder="Division name" value="' + esc(d.name || '') + '">'
      + '<div class="lg-seg" id="lg-dvkind"><button data-v="team" class="' + (isTeam ? 'on' : '') + '" onclick="FFPLeague.seg(this,\'lg-dvkind\')">Team</button><button data-v="individual" class="' + (!isTeam ? 'on' : '') + '" onclick="FFPLeague.seg(this,\'lg-dvkind\')">Individual</button></div>'
      + '<button class="lg-btn pri" onclick="FFPLeague.saveDivision(\'' + (d.id || '') + '\')">' + ic('check') + 'Save</button>'
      + '<button class="lg-btn ghost" onclick="FFPLeague.cancelDivision()">Cancel</button></div>';
  }
  function editDivision(id) { S.divEdit = id; renderTab(); }
  function cancelDivision() { S.divEdit = null; renderTab(); }
  async function saveDivision(id) {
    var nm = (document.getElementById('lg-dvname') || {}).value; if (!nm || !nm.trim()) { toast('Name required', 'error'); return; }
    var kind = segVal('lg-dvkind') || 'team';
    var r; try { r = await sb().rpc('league_division_save', { p_league: S.eventId, p_id: id || null, p: { name: nm.trim(), kind: kind, team_size: kind === 'team' ? 5 : 1 } }); } catch (e) { r = { error: e }; }
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
    host2.innerHTML = rows.length ? rows.map(function (en) { return '<div class="lg-row"><span class="lg-av" style="' + (en.logo ? 'background-image:url(\'' + esc(en.logo) + '\')' : '') + '">' + (en.logo ? '' : esc((en.name || '?').slice(0, 1))) + '</span><div class="g"><b>' + esc(en.name) + '</b> <span>· ' + esc(en.status) + '</span></div></div>'; }).join('') : '<div class="lg-empty">No entrants yet. Members self-register in the app, or add them here.</div>';
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
    host.innerHTML = '<div class="lg-tool"><select class="lg-sel" onchange="FFPLeague.setDiv(this.value,\'fixtures\')">' + divOpts() + '</select><span class="sp"></span>' + genBtn + '<button class="lg-btn pri" onclick="FFPLeague.saveResults()">' + ic('check') + 'Save results</button></div><div id="lg-fixlist"></div>';
    var host2 = document.getElementById('lg-fixlist');
    if (!fx.length) { host2.innerHTML = '<div class="lg-empty">No fixtures yet — auto-generate the round-robin.</div>'; return; }
    var byRound = {}; fx.forEach(function (f) { (byRound[f.round] = byRound[f.round] || []).push(f); });
    host2.innerHTML = Object.keys(byRound).sort(function (a, b) { return a - b; }).map(function (rd) {
      return '<div class="lg-rndlab">Round ' + rd + '</div>' + byRound[rd].map(function (f) {
        return '<div class="lg-fx" data-id="' + f.id + '"><div class="t a">' + esc((f.home && f.home.name) || 'TBD') + '</div><div class="sc"><input type="number" class="lg-hs" value="' + (f.home_score != null ? f.home_score : '') + '" placeholder="–"><input type="number" class="lg-as" value="' + (f.away_score != null ? f.away_score : '') + '" placeholder="–"></div><div class="t">' + esc((f.away && f.away.name) || 'TBD') + '</div></div>';
      }).join('');
    }).join('');
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

  async function refreshDetail() { var r; try { r = await sb().rpc('league_detail', { p_league: S.eventId }); } catch (e) { r = { error: e }; } S.detail = (r && r.data) || S.detail; renderTab(); }
  function divOpts() { return (S.detail.divisions || []).map(function (d) { return '<option value="' + d.id + '"' + (d.id === S.divId ? ' selected' : '') + '>' + esc(d.name) + '</option>'; }).join(''); }

  window.FFPLeague = {
    open: open, startCreate: startCreate, cancelCreate: cancelCreate, doCreate: doCreate,
    back: function () { S.view = 'list'; renderList(); }, tab: function (t) { S.tab = t; renderEditor(); },
    setDiv: function (val, tab) { S.divId = val; S.tab = tab; renderTab(); },
    seg: function (btn, id) { document.querySelectorAll('#' + id + ' button').forEach(function (b) { b.classList.remove('on'); }); btn.classList.add('on'); },
    saveDetails: saveDetails, editDivision: editDivision, cancelDivision: cancelDivision, saveDivision: saveDivision,
    addEntrant: addEntrant, cancelEntrant: cancelEntrant, saveEntrant: saveEntrant,
    confirmGen: confirmGen, cancelGen: cancelGen, doGen: doGen, saveResults: saveResults
  };
  window.ffpRenderLeagues = function () { S.view = 'list'; S.creating = false; renderList(); };
})();
