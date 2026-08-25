/* FFP Partner — Tournaments organiser console (desktop).
   Model: Tournament -> Categories(divisions) -> Entrants -> optional Group stage -> Knockout bracket.
   Results auto-advance the winner. Stats via lt_sport_schemas. Owner-gated RPCs (created_by=auth.uid()).
   Reuses the .lg- base styles from the leagues loader; adds .tg- bracket/group styles.
   Exposes window.ffpRenderTournaments (panel hook) + window.FFPTourn (actions). */
(function () {
  var sb = function () { return window.supabase; };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); };
  function toast(m, k) { if (typeof window.showToast === 'function') { try { window.showToast(m, k || 'info'); return; } catch (e) {} } console.log('[FFP Tourn]', m); }
  function root() { return document.getElementById('tg-root'); }
  var STAGE = { r64: 'Round of 64', r32: 'Round of 32', r16: 'Round of 16', quarter: 'Quarter-finals', semi: 'Semi-finals', final: 'Final', third: '3rd place' };

  var S = { view: 'list', eventId: null, detail: null, tab: 'details', divId: null, sports: null };

  function injectBaseCss() {
    if (document.getElementById('lgx-css')) return;
    var css = document.createElement('style'); css.id = 'lgx-css';
    css.textContent = [
      '.lg-wrap{max-width:1080px;}',
      '.lg-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;gap:12px;flex-wrap:wrap;}',
      '.lg-h1{font-size:20px;font-weight:900;color:var(--ffp-text);} .lg-sub{font-size:13px;color:var(--ffp-text-muted);font-weight:600;margin-top:2px;}',
      '.lg-btn{display:inline-flex;align-items:center;gap:7px;border:1px solid var(--ffp-border-mid);background:#fff;border-radius:10px;padding:10px 14px;font:inherit;font-size:13px;font-weight:800;color:var(--ffp-text);cursor:pointer;} .lg-btn .ms{font-size:18px;}',
      '.lg-btn.pri{background:var(--ffp-blue);border-color:var(--ffp-blue);color:#fff;} .lg-btn.gold{background:linear-gradient(180deg,#ffd15a,#f2a900);border:none;color:#3a2600;} .lg-btn.green{background:#12a05f;border-color:#12a05f;color:#fff;} .lg-btn.sm{padding:7px 11px;font-size:12px;} .lg-btn:disabled{opacity:.5;cursor:default;}',
      '.lg-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px;}',
      '.lg-card{border:1px solid var(--ffp-border-mid);border-radius:14px;overflow:hidden;cursor:pointer;background:#fff;box-shadow:0 4px 12px rgba(15,34,48,.06);}',
      '.lg-cover{height:108px;position:relative;background:#dde3e8 center/cover no-repeat;} .lg-cover .scr{position:absolute;inset:0;background:linear-gradient(transparent,rgba(8,18,26,.75));} .lg-cover .bd{position:absolute;top:8px;left:8px;font-size:10px;font-weight:900;padding:3px 8px;border-radius:20px;background:#fff;color:#d6353b;} .lg-cover .bd.live{background:#d6353b;color:#fff;} .lg-cover .bd.open{color:#0a8f5f;} .lg-cover .bd.draft,.lg-cover .bd.final{color:#5b6b75;}',
      '.lg-cbody{padding:11px 13px;} .lg-cbody b{font-size:14.5px;font-weight:900;color:var(--ffp-text);display:block;} .lg-cbody span{font-size:12px;color:var(--ffp-text-muted);font-weight:700;}',
      '.lg-new{border:2px dashed var(--ffp-border-mid);border-radius:14px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;min-height:180px;color:var(--ffp-blue);font-weight:800;cursor:pointer;background:#fff;} .lg-new .ms{font-size:30px;}',
      '.lg-nav{display:flex;gap:6px;flex-wrap:wrap;border-bottom:1px solid var(--ffp-border);margin-bottom:18px;} .lg-nav button{background:none;border:none;font:inherit;font-size:13.5px;font-weight:800;color:var(--ffp-text-muted);padding:11px 4px;margin-right:14px;border-bottom:2.5px solid transparent;cursor:pointer;} .lg-nav button.on{color:var(--ffp-blue);border-bottom-color:var(--ffp-blue);}',
      '.lg-pill{font-size:11px;font-weight:800;padding:3px 10px;border-radius:20px;} .lg-pill.live{background:#fdeaea;color:#d6353b;} .lg-pill.open{background:#e3f6ec;color:#0a8f5f;} .lg-pill.draft,.lg-pill.final{background:#eef2f5;color:#5b6b75;}',
      '.lg-lab{font-size:12px;font-weight:800;color:#43525c;margin:0 0 6px;} .lg-in,.lg-sel{width:100%;padding:10px 12px;border:1px solid #d7dee5;border-radius:10px;font:inherit;box-sizing:border-box;background:#fff;color:#12232f;} .lg-fld{margin-bottom:14px;} .lg-2{display:grid;grid-template-columns:1fr 1fr;gap:12px;} .lg-3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;}',
      '.lg-seg{display:inline-flex;border:1.5px solid var(--ffp-border-mid);border-radius:10px;overflow:hidden;} .lg-seg button{background:#fff;border:none;padding:9px 16px;font:inherit;font-size:13px;font-weight:800;color:var(--ffp-text-muted);cursor:pointer;} .lg-seg button.on{background:var(--ffp-blue);color:#fff;}',
      '.lg-row{display:flex;align-items:center;gap:12px;padding:11px 4px;border-bottom:1px solid var(--ffp-border);} .lg-row .g{flex:1;min-width:0;} .lg-row .g b{font-size:14px;font-weight:800;color:var(--ffp-text);} .lg-row .g span{display:block;font-size:12px;color:var(--ffp-text-muted);font-weight:700;margin-top:1px;}',
      '.lg-av{width:32px;height:32px;border-radius:8px;flex:none;background:#e7ecef center/cover no-repeat;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:900;color:#6a7681;}',
      '.lg-empty{padding:34px 16px;text-align:center;color:var(--ffp-text-muted);font-weight:600;font-size:13.5px;}',
      '.lg-toolbar{display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap;} .lg-toolbar .lg-sel{width:auto;min-width:200px;}',
      '.lg-fx{display:grid;grid-template-columns:1fr 130px 1fr;align-items:center;gap:8px;padding:10px 4px;border-bottom:1px solid var(--ffp-border);} .lg-fx .t{font-size:13.5px;font-weight:800;color:var(--ffp-text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;} .lg-fx .t.a{text-align:right;} .lg-fx .sc{display:flex;gap:6px;justify-content:center;} .lg-fx .sc input{width:44px;padding:8px;border:1.5px solid #d7dee5;border-radius:8px;font:inherit;font-weight:800;text-align:center;}',
      '.lg-tb{display:grid;grid-template-columns:26px 1fr 30px 30px 30px 42px 40px;align-items:center;gap:6px;padding:9px 6px;border-bottom:1px solid var(--ffp-border);font-size:13px;} .lg-tb span{text-align:center;} .lg-tb .nm{text-align:left;font-weight:800;} .lg-tb.head{font-size:10px;font-weight:800;text-transform:uppercase;color:var(--ffp-text-muted);} .lg-tb .pts{font-weight:900;color:#d6353b;}',
      '.lg-divi{display:flex;align-items:center;gap:10px;background:#fff;border:1px solid #d7dee5;border-radius:10px;padding:9px 12px;margin-bottom:8px;} .lg-divi .h{font-size:18px;color:#c0cad2;cursor:grab;} .lg-divi .nmn{flex:1;font-size:14px;font-weight:800;color:#12232f;} .lg-divi .mt{font-size:12px;color:#6a7c8a;font-weight:700;} .lg-divi .ic{font-size:18px;color:#9aa8b4;cursor:pointer;}'
    ].join('\n');
    document.head.appendChild(css);
  }
  function injectExtraCss() {
    if (document.getElementById('tgx-css')) return;
    var css = document.createElement('style'); css.id = 'tgx-css';
    css.textContent = [
      '.tg-brk{overflow-x:auto;padding:6px 2px 16px;} .tg-brkin{display:flex;gap:14px;min-width:max-content;}',
      '.tg-rnd{display:flex;flex-direction:column;justify-content:space-around;gap:14px;min-width:190px;} .tg-rnd .rh{font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.5px;color:#9aa8b4;text-align:center;margin-bottom:2px;}',
      '.tg-m{background:#fff;border:1px solid #d7dee5;border-radius:11px;overflow:hidden;} .tg-m .s{display:flex;align-items:center;gap:7px;padding:7px 9px;} .tg-m .s+.s{border-top:1px solid #eef1f6;} .tg-m .s b{flex:1;font-size:12.5px;font-weight:700;color:#12232f;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;} .tg-m .s input{width:38px;padding:5px;border:1.5px solid #d7dee5;border-radius:7px;font:inherit;font-weight:800;text-align:center;} .tg-m .s.win b{color:#0a8f5f;} .tg-m .s.tbd b{color:#9aa8b4;font-weight:600;}',
      '.tg-grp{margin-bottom:16px;} .tg-grph{font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:.4px;color:#12232f;margin:8px 0 4px;}'
    ].join('\n');
    document.head.appendChild(css);
  }
  function injectCss() { injectBaseCss(); injectExtraCss(); }

  function statusBadge(s) { return '<span class="lg-pill ' + esc(s) + '">' + esc((s || 'draft').toUpperCase()) + '</span>'; }
  async function loadSports() { if (S.sports) return S.sports; var r = await sb().from('lt_sport_schemas').select('key,name,icon').eq('active', true).order('sort'); S.sports = r.data || []; return S.sports; }

  async function renderList() {
    injectCss(); var el = root(); if (!el) return;
    el.innerHTML = '<div class="lg-wrap"><div class="lg-head"><div><div class="lg-h1">Tournaments</div><div class="lg-sub">Group stage + knockout bracket for your sport.</div></div></div><div class="lg-empty">Loading…</div></div>';
    var r; try { r = await sb().rpc('tourn_my_events'); } catch (e) { r = { error: e }; }
    var list = (r && r.data) || [];
    var cards = list.map(function (ev) {
      var cov = ev.cover_url || ev.logo_url;
      return '<div class="lg-card" onclick="FFPTourn.open(\'' + ev.id + '\')"><div class="lg-cover" style="' + (cov ? 'background-image:url(\'' + esc(cov) + '\')' : '') + '"><div class="scr"></div><div class="bd ' + esc(ev.status) + '">' + esc((ev.status || 'draft').toUpperCase()) + '</div></div><div class="lg-cbody"><b>' + esc(ev.name) + '</b><span>' + esc([ev.city, ev.sport].filter(Boolean).join(' · ')) + '</span></div></div>';
    }).join('');
    el.innerHTML = '<div class="lg-wrap"><div class="lg-head"><div><div class="lg-h1">Tournaments</div><div class="lg-sub">Group stage + knockout bracket for your sport.</div></div></div><div class="lg-grid">' + cards + '<div class="lg-new" onclick="FFPTourn.create()"><span class="ms material-symbols-rounded">add</span>Create a tournament</div></div></div>';
  }

  async function create() {
    var name = prompt('Tournament name'); if (!name) return;
    var r; try { r = await sb().rpc('tourn_event_save', { p_id: null, p: { name: name } }); } catch (e) { r = { error: e }; }
    if (r.error) { toast('Could not create', 'error'); return; } open(r.data);
  }
  async function open(id) {
    S.eventId = id; S.view = 'editor'; S.tab = 'details';
    var r; try { r = await sb().rpc('tourn_detail', { p_tourn: id }); } catch (e) { r = { error: e }; }
    S.detail = (r && r.data) || null;
    S.divId = (S.detail && S.detail.divisions && S.detail.divisions[0] && S.detail.divisions[0].id) || null;
    renderEditor();
  }
  function renderEditor() {
    injectCss(); var el = root(); if (!el || !S.detail) return;
    var ev = S.detail.event || {};
    el.innerHTML = '<div class="lg-wrap"><div class="lg-head"><div><div class="lg-h1">' + esc(ev.name) + ' ' + statusBadge(ev.status) + '</div><div class="lg-sub">' + esc([ev.city, ev.sport_key].filter(Boolean).join(' · ')) + '</div></div>'
      + '<button class="lg-btn" onclick="FFPTourn.back()"><span class="ms material-symbols-rounded">arrow_back</span>All tournaments</button></div>'
      + '<div class="lg-nav">' + tabBtn('details', 'Details') + tabBtn('divisions', 'Categories') + tabBtn('entrants', 'Entrants')
      + (ev.group_stage ? tabBtn('groups', 'Group stage') : '') + tabBtn('bracket', 'Bracket & results') + '</div><div id="tg-tab"></div></div>';
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
  }

  async function renderDetails(host) {
    var ev = S.detail.event || {}; var sports = await loadSports();
    var sportOpts = sports.map(function (s) { return '<option value="' + s.key + '"' + (ev.sport_key === s.key ? ' selected' : '') + '>' + esc(s.name) + '</option>'; }).join('');
    host.innerHTML =
      '<div class="lg-fld"><div class="lg-lab">Tournament name</div><input class="lg-in" id="tg-name" value="' + esc(ev.name) + '"></div>'
      + '<div class="lg-2"><div class="lg-fld"><div class="lg-lab">Sport (sets the stats)</div><select class="lg-sel" id="tg-sport">' + sportOpts + '</select></div>'
      + '<div class="lg-fld"><div class="lg-lab">Group stage first?</div><div class="lg-seg" id="tg-gs"><button data-v="true" class="' + (ev.group_stage ? 'on' : '') + '" onclick="FFPTourn.seg(this,\'tg-gs\')">Yes</button><button data-v="false" class="' + (!ev.group_stage ? 'on' : '') + '" onclick="FFPTourn.seg(this,\'tg-gs\')">No — straight knockout</button></div></div></div>'
      + '<div class="lg-2"><div class="lg-fld"><div class="lg-lab">Advance per group</div><input class="lg-in" id="tg-adv" type="number" value="' + (ev.groups_advance != null ? ev.groups_advance : 2) + '"></div>'
      + '<div class="lg-fld"><div class="lg-lab">Seeding</div><select class="lg-sel" id="tg-seed"><option value="seeded"' + (ev.seeding_mode !== 'random' ? ' selected' : '') + '>Seeded</option><option value="random"' + (ev.seeding_mode === 'random' ? ' selected' : '') + '>Random</option></select></div></div>'
      + '<div class="lg-2"><div class="lg-fld"><div class="lg-lab">City</div><input class="lg-in" id="tg-city" value="' + esc(ev.city || '') + '"></div><div class="lg-fld"><div class="lg-lab">Country</div><input class="lg-in" id="tg-country" value="' + esc(ev.country || '') + '"></div></div>'
      + '<div class="lg-2"><div class="lg-fld"><div class="lg-lab">Starts</div><input class="lg-in" id="tg-start" type="date" value="' + esc(ev.starts_at || '') + '"></div><div class="lg-fld"><div class="lg-lab">Ends</div><input class="lg-in" id="tg-end" type="date" value="' + esc(ev.ends_at || '') + '"></div></div>'
      + '<div class="lg-fld"><div class="lg-lab">3rd-place play-off</div><div class="lg-seg" id="tg-third"><button data-v="true" class="' + (ev.third_place ? 'on' : '') + '" onclick="FFPTourn.seg(this,\'tg-third\')">Yes</button><button data-v="false" class="' + (!ev.third_place ? 'on' : '') + '" onclick="FFPTourn.seg(this,\'tg-third\')">No</button></div></div>'
      + '<div class="lg-fld"><div class="lg-lab">Status</div><select class="lg-sel" id="tg-status"><option value="draft"' + (ev.status === 'draft' ? ' selected' : '') + '>Draft (hidden)</option><option value="open"' + (ev.status === 'open' ? ' selected' : '') + '>Open (registrations)</option><option value="live"' + (ev.status === 'live' ? ' selected' : '') + '>Live</option><option value="final"' + (ev.status === 'final' ? ' selected' : '') + '>Final</option></select></div>'
      + '<div class="lg-fld"><div class="lg-lab">About</div><textarea class="lg-in" id="tg-desc" rows="3">' + esc(ev.description || '') + '</textarea></div>'
      + '<div class="lg-fld"><div class="lg-lab">Rules</div><textarea class="lg-in" id="tg-rules" rows="3">' + esc(ev.rules || '') + '</textarea></div>'
      + '<div style="display:flex;gap:8px;margin-top:6px"><button class="lg-btn pri" onclick="FFPTourn.saveDetails()"><span class="ms material-symbols-rounded">bolt</span>Save</button></div>';
  }
  function segVal(id) { var b = document.querySelector('#' + id + ' button.on'); return b ? b.getAttribute('data-v') : null; }
  async function saveDetails() {
    var p = { name: v('tg-name'), sport_key: v('tg-sport'), group_stage: segVal('tg-gs') === 'true', groups_advance: +v('tg-adv'), seeding_mode: v('tg-seed'),
      city: v('tg-city'), country: v('tg-country'), starts_at: v('tg-start') || null, ends_at: v('tg-end') || null,
      third_place: segVal('tg-third') === 'true', status: v('tg-status'), description: v('tg-desc'), rules: v('tg-rules') };
    var r; try { r = await sb().rpc('tourn_event_save', { p_id: S.eventId, p: p }); } catch (e) { r = { error: e }; }
    if (r.error) { toast('Save failed', 'error'); return; } toast('Saved', 'success'); open(S.eventId);
  }
  function v(id) { var e = document.getElementById(id); return e ? e.value : ''; }

  function renderDivisions(host) {
    var divs = S.detail.divisions || [];
    host.innerHTML = '<div class="lg-sub" style="margin-bottom:12px">Each category runs its own draw, bracket &amp; stats — e.g. Men\'s Open, Women\'s, Mixed.</div>'
      + divs.map(function (d) { return '<div class="lg-divi"><span class="h material-symbols-rounded">drag_indicator</span><span class="nmn">' + esc(d.name) + '</span><span class="mt">' + (d.kind === 'individual' ? 'Individual' : 'Team') + ' · ' + (d.entrant_count || 0) + ' in</span><span class="ic material-symbols-rounded" onclick="FFPTourn.editDivision(\'' + d.id + '\')">edit</span></div>'; }).join('')
      + '<button class="lg-btn" style="margin-top:6px" onclick="FFPTourn.editDivision(null)"><span class="ms material-symbols-rounded">add</span>Add category</button>';
  }
  function editDivision(id) {
    var d = (S.detail.divisions || []).find(function (x) { return x.id === id; }) || {};
    var name = prompt('Category name', d.name || ''); if (name == null) return;
    var kind = confirm('OK = Team/pair, Cancel = Individual') ? 'team' : 'individual';
    sb().rpc('tourn_division_save', { p_tourn: S.eventId, p_id: id, p: { name: name, kind: kind, team_size: kind === 'team' ? (d.team_size || 2) : 1 } }).then(function (r) {
      if (r.error) { toast('Save failed', 'error'); return; } toast('Saved', 'success'); open(S.eventId);
    });
  }

  async function renderEntrants(host) {
    var divs = S.detail.divisions || [];
    if (!divs.length) { host.innerHTML = '<div class="lg-empty">Add a category first.</div>'; return; }
    if (!S.divId) S.divId = divs[0].id;
    host.innerHTML = '<div class="lg-toolbar"><select class="lg-sel" id="tg-edv" onchange="FFPTourn.setDiv(this.value,\'entrants\')">' + divOpts() + '</select><button class="lg-btn" onclick="FFPTourn.addEntrant()"><span class="ms material-symbols-rounded">add</span>Add team / player</button></div><div id="tg-roster"><div class="lg-empty">Loading…</div></div>';
    var r; try { r = await sb().rpc('tourn_roster', { p_division: S.divId }); } catch (e) { r = { error: e }; }
    var rows = (r && r.data) || []; var host2 = document.getElementById('tg-roster');
    host2.innerHTML = rows.length ? rows.map(function (en) { return '<div class="lg-row"><span class="lg-av" style="' + (en.logo ? 'background-image:url(\'' + esc(en.logo) + '\')' : '') + '">' + (en.logo ? '' : esc((en.name || '?').slice(0, 1))) + '</span><div class="g"><b>' + esc(en.name) + '</b><span>' + esc(en.status) + (en.group_label ? ' · Group ' + esc(en.group_label) : '') + '</span></div></div>'; }).join('') : '<div class="lg-empty">No entrants yet. Members self-register in the app, or add them here.</div>';
  }
  function addEntrant() {
    var nm = prompt('Team / player name'); if (!nm) return;
    sb().rpc('tourn_entrant_add', { p_tourn: S.eventId, p_division: S.divId, p: { team_name: nm, kind: (S.detail.divisions.find(function (d) { return d.id === S.divId; }) || {}).kind || 'team' } }).then(function (r) { if (r.error) { toast('Add failed', 'error'); return; } toast('Added', 'success'); renderTab(); });
  }

  // GROUP STAGE
  async function renderGroups(host) {
    var divs = S.detail.divisions || []; if (!divs.length) { host.innerHTML = '<div class="lg-empty">Add a category first.</div>'; return; }
    if (!S.divId) S.divId = divs[0].id;
    host.innerHTML = '<div class="lg-toolbar"><select class="lg-sel" id="tg-edv" onchange="FFPTourn.setDiv(this.value,\'groups\')">' + divOpts() + '</select>'
      + '<button class="lg-btn" onclick="FFPTourn.genGroups()"><span class="ms material-symbols-rounded">auto_awesome</span>Draw groups</button>'
      + '<button class="lg-btn pri" onclick="FFPTourn.saveGroupResults()"><span class="ms material-symbols-rounded">bolt</span>Save results</button>'
      + '<button class="lg-btn green" onclick="FFPTourn.buildBracket()"><span class="ms material-symbols-rounded">account_tree</span>Build bracket from groups</button></div><div id="tg-glist"><div class="lg-empty">Loading…</div></div>';
    var r; try { r = await sb().from('tourn_matches').select('*').eq('division_id', S.divId).eq('stage', 'group').order('group_label').order('slot'); } catch (e) { r = { error: e }; }
    var ms = (r && r.data) || []; var host2 = document.getElementById('tg-glist');
    if (!ms.length) { host2.innerHTML = '<div class="lg-empty">No groups yet — press “Draw groups”. It asks how many groups and assigns entrants (snake seeding) with round-robin fixtures.</div>'; return; }
    var names = await entrantNames(S.divId);
    var byG = {}; ms.forEach(function (m) { (byG[m.group_label] = byG[m.group_label] || []).push(m); });
    host2.innerHTML = Object.keys(byG).sort().map(function (g) {
      return '<div class="tg-grp"><div class="tg-grph">Group ' + esc(g) + '</div>' + byG[g].map(function (m) {
        return '<div class="lg-fx" data-id="' + m.id + '"><div class="t a">' + esc(names[m.home_entrant] || 'TBD') + '</div><div class="sc"><input type="number" class="tg-hs" value="' + (m.home_score != null ? m.home_score : '') + '" placeholder="–"><input type="number" class="tg-as" value="' + (m.away_score != null ? m.away_score : '') + '" placeholder="–"></div><div class="t">' + esc(names[m.away_entrant] || 'TBD') + '</div></div>';
      }).join('') + '</div>';
    }).join('');
  }
  async function genGroups() {
    var n = prompt('How many groups?', '2'); if (!n) return; n = parseInt(n, 10) || 2;
    var r; try { r = await sb().rpc('tourn_groups_generate', { p_division: S.divId, p_num_groups: n }); } catch (e) { r = { error: e }; }
    if (r.error) { toast('Could not draw groups', 'error'); return; } toast('Groups drawn (' + (r.data || 0) + ' matches)', 'success'); open(S.eventId);
  }
  async function saveGroupResults() {
    var rows = Array.prototype.slice.call(document.querySelectorAll('#tg-glist .lg-fx')); var n = 0;
    for (var i = 0; i < rows.length; i++) { var el = rows[i]; var h = el.querySelector('.tg-hs').value, a = el.querySelector('.tg-as').value; if (h === '' || a === '') continue; try { await sb().rpc('tourn_result_save', { p_match: el.getAttribute('data-id'), p_home: +h, p_away: +a, p_sets: null, p_status: 'final' }); n++; } catch (e) {} }
    toast(n + ' results saved', 'success'); renderTab();
  }
  async function buildBracket() {
    if (!confirm('Build the knockout bracket now? Uses group qualifiers (or seeds). Replaces any existing bracket.')) return;
    var r; try { r = await sb().rpc('tourn_bracket_build', { p_division: S.divId }); } catch (e) { r = { error: e }; }
    if (r.error) { toast('Could not build bracket', 'error'); return; } toast('Bracket built', 'success'); S.tab = 'bracket'; open(S.eventId);
  }

  // BRACKET
  async function renderBracket(host) {
    var divs = S.detail.divisions || []; if (!divs.length) { host.innerHTML = '<div class="lg-empty">Add a category first.</div>'; return; }
    if (!S.divId) S.divId = divs[0].id;
    var ev = S.detail.event || {};
    host.innerHTML = '<div class="lg-toolbar"><select class="lg-sel" id="tg-edv" onchange="FFPTourn.setDiv(this.value,\'bracket\')">' + divOpts() + '</select>'
      + '<button class="lg-btn" onclick="FFPTourn.buildBracket()"><span class="ms material-symbols-rounded">account_tree</span>' + (ev.group_stage ? 'Build from groups' : 'Draw bracket') + '</button>'
      + '<button class="lg-btn pri" onclick="FFPTourn.saveBracketResults()"><span class="ms material-symbols-rounded">bolt</span>Save &amp; advance</button></div><div id="tg-brk"><div class="lg-empty">Loading…</div></div>';
    var r; try { r = await sb().rpc('tourn_bracket', { p_division: S.divId }); } catch (e) { r = { error: e }; }
    var ms = (r && r.data) || []; var host2 = document.getElementById('tg-brk');
    if (!ms.length) { host2.innerHTML = '<div class="lg-empty">No bracket yet — press the button above to draw it.</div>'; return; }
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
    toast(n + ' results saved — winners advanced', 'success'); renderTab();
  }

  async function entrantNames(divId) { var r = await sb().rpc('tourn_roster', { p_division: divId }); var map = {}; (r.data || []).forEach(function (e) { map[e.id] = e.name; }); return map; }
  function divOpts() { return (S.detail.divisions || []).map(function (d) { return '<option value="' + d.id + '"' + (d.id === S.divId ? ' selected' : '') + '>' + esc(d.name) + '</option>'; }).join(''); }

  window.FFPTourn = {
    open: open, create: create, back: function () { S.view = 'list'; renderList(); }, tab: function (t) { S.tab = t; renderEditor(); },
    setDiv: function (val, tab) { S.divId = val; S.tab = tab; renderTab(); }, seg: function (btn, id) { document.querySelectorAll('#' + id + ' button').forEach(function (b) { b.classList.remove('on'); }); btn.classList.add('on'); },
    saveDetails: saveDetails, editDivision: editDivision, addEntrant: addEntrant, genGroups: genGroups, saveGroupResults: saveGroupResults, buildBracket: buildBracket, saveBracketResults: saveBracketResults
  };
  window.ffpRenderTournaments = function () { S.view = 'list'; renderList(); };
})();
