/* FFP Partner — Competitions organizer console (desktop). Create & run event leaderboards.
   Data model: Competition -> Divisions (individual team_size=1 OR team 2-8) -> each division OWNS its
   workouts -> athletes/teams -> scores = entrant x the division's workout. One scoring engine
   (comp_leaderboard). All writes are owner-gated RPCs (created_by = auth.uid()).
   Exposes window.ffpRenderCompetitions (panel hook) + window.FFPComp (button actions). */
(function () {
  var sb = function () { return window.supabase; };
  var prov = function () { return window.FFP_PROVIDER || {}; };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); };
  function toast(m, k) { if (typeof window.showToast === 'function') { try { window.showToast(m, k || 'info'); return; } catch (e) {} } console.log('[FFP Comp]', m); }
  function root() { return document.getElementById('comp-root'); }

  var S = { view: 'list', eventId: null, detail: null, tab: 'details', divId: null, wodId: null };

  // ---- styles (scoped .cx-) ----
  function injectCss() {
    if (document.getElementById('cx-css')) return;
    var css = document.createElement('style'); css.id = 'cx-css';
    css.textContent = [
      '.cx-wrap{max-width:1080px;}',
      '.cx-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;gap:12px;flex-wrap:wrap;}',
      '.cx-h1{font-size:20px;font-weight:900;color:var(--ffp-text);}',
      '.cx-sub{font-size:13px;color:var(--ffp-text-muted);font-weight:600;margin-top:2px;}',
      '.cx-btn{display:inline-flex;align-items:center;gap:7px;border:1px solid var(--ffp-border-mid);background:#fff;border-radius:10px;padding:10px 14px;font:inherit;font-size:13px;font-weight:800;color:var(--ffp-text);cursor:pointer;}',
      '.cx-btn .ms{font-size:18px;}',
      '.cx-btn.pri{background:var(--ffp-blue);border-color:var(--ffp-blue);color:#fff;}',
      '.cx-btn.gold{background:linear-gradient(180deg,#ffd15a,#f2a900);border:none;color:#3a2600;}',
      '.cx-btn.green{background:#12a05f;border-color:#12a05f;color:#fff;}',
      '.cx-btn.sm{padding:7px 11px;font-size:12px;border-radius:9px;}',
      '.cx-btn:disabled{opacity:.5;cursor:default;}',
      '.cx-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px;}',
      '.cx-card{border:1px solid var(--ffp-border-mid);border-radius:14px;overflow:hidden;cursor:pointer;background:#fff;box-shadow:0 4px 12px rgba(15,34,48,.06);}',
      '.cx-cover{height:110px;position:relative;background:#dde3e8 center/cover no-repeat;}',
      '.cx-cover .scr{position:absolute;left:0;right:0;bottom:0;height:56px;background:linear-gradient(transparent,rgba(8,18,26,.8));}',
      '.cx-cover .bd{position:absolute;top:8px;left:8px;font-size:10px;font-weight:900;padding:3px 8px;border-radius:20px;background:#fff;color:#d6353b;}',
      '.cx-cover .bd.live{background:#d6353b;color:#fff;} .cx-cover .bd.open{color:#0a8f5f;} .cx-cover .bd.draft{color:#5b6b75;} .cx-cover .bd.final{color:#5b6b75;}',
      '.cx-cbody{padding:11px 13px;} .cx-cbody b{font-size:14.5px;font-weight:900;color:var(--ffp-text);display:block;} .cx-cbody span{font-size:12px;color:var(--ffp-text-muted);font-weight:700;}',
      '.cx-new{border:2px dashed var(--ffp-border-mid);border-radius:14px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;min-height:180px;color:var(--ffp-blue);font-weight:800;cursor:pointer;background:#fff;}',
      '.cx-new .ms{font-size:30px;}',
      '.cx-editnav{display:flex;gap:6px;flex-wrap:wrap;border-bottom:1px solid var(--ffp-border);margin-bottom:18px;}',
      '.cx-editnav button{background:none;border:none;font:inherit;font-size:13.5px;font-weight:800;color:var(--ffp-text-muted);padding:11px 4px;margin-right:14px;border-bottom:2.5px solid transparent;cursor:pointer;}',
      '.cx-editnav button.on{color:var(--ffp-blue);border-bottom-color:var(--ffp-blue);}',
      '.cx-pill{font-size:11px;font-weight:800;padding:3px 10px;border-radius:20px;}',
      '.cx-pill.live{background:#fdeaea;color:#d6353b;} .cx-pill.open{background:#e3f6ec;color:#0a8f5f;} .cx-pill.draft{background:#eef2f5;color:#5b6b75;} .cx-pill.final{background:#eef2f5;color:#5b6b75;}',
      '.cx-lab{font-size:12px;font-weight:800;color:#43525c;margin:0 0 6px;}',
      '.cx-in,.cx-sel{width:100%;padding:10px 12px;border:1px solid #d7dee5;border-radius:10px;font:inherit;box-sizing:border-box;background:#fff;color:#12232f;}',
      '.cx-fld{margin-bottom:14px;} .cx-2{display:grid;grid-template-columns:1fr 1fr;gap:12px;}',
      '.cx-seg{display:inline-flex;border:1.5px solid var(--ffp-border-mid);border-radius:10px;overflow:hidden;}',
      '.cx-seg button{background:#fff;border:none;padding:9px 16px;font:inherit;font-size:13px;font-weight:800;color:var(--ffp-text-muted);cursor:pointer;}',
      '.cx-seg button.on{background:var(--ffp-blue);color:#fff;}',
      '.cx-sw{width:26px;height:26px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 0 1px #d7dee5;cursor:pointer;display:inline-block;margin-right:8px;}',
      '.cx-sw.on{box-shadow:0 0 0 2px #fff,0 0 0 4px var(--ffp-text);}',
      '.cx-row{display:flex;align-items:center;gap:12px;padding:12px 4px;border-bottom:1px solid var(--ffp-border);}',
      '.cx-row .g{flex:1;min-width:0;} .cx-row .g b{font-size:14px;font-weight:800;color:var(--ffp-text);} .cx-row .g span{display:block;font-size:12px;color:var(--ffp-text-muted);font-weight:700;margin-top:1px;text-transform:capitalize;}',
      '.cx-av{width:32px;height:32px;border-radius:50%;flex:none;background:#e7ecef center/cover no-repeat;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:900;color:#6a7681;}',
      '.cx-empty{padding:34px 16px;text-align:center;color:var(--ffp-text-muted);font-weight:600;font-size:13.5px;}',
      '.cx-toolbar{display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap;}',
      '.cx-toolbar .cx-sel{width:auto;min-width:180px;}',
      '.cx-sc{display:grid;grid-template-columns:26px 1fr 120px 70px 60px;align-items:center;gap:8px;padding:9px 4px;border-bottom:1px solid var(--ffp-border);}',
      '.cx-sc.head{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.3px;color:var(--ffp-text-muted);}',
      '.cx-sc input{width:100%;padding:8px;border:1.5px solid #d7dee5;border-radius:8px;font:inherit;font-weight:800;text-align:center;}',
      '.cx-sc .plc{text-align:center;font-weight:900;} .cx-sc .p1{color:#e0a83e;}.cx-sc .p2{color:#8a99a8;}.cx-sc .p3{color:#c08a52;}',
      '.cx-sc .pts{text-align:center;font-weight:900;color:#d6353b;}',
      '.cx-lb{display:grid;align-items:center;gap:8px;padding:9px 6px;border-bottom:1px solid var(--ffp-border);}',
      '.cx-lb.head{font-size:10px;font-weight:800;text-transform:uppercase;color:var(--ffp-text-muted);} .cx-lb .e{text-align:center;}',
      '.cx-lb.r1{background:linear-gradient(90deg,rgba(224,168,62,.14),transparent 60%);}',
      '.cx-lb.r2{background:linear-gradient(90deg,rgba(150,167,180,.12),transparent);}',
      '.cx-lb.r3{background:linear-gradient(90deg,rgba(200,140,90,.1),transparent);}',
      '.cx-lb .rk{text-align:center;font-weight:900;color:var(--ffp-text-muted);} .cx-lb.r1 .rk{color:#e0a83e;}.cx-lb.r2 .rk{color:#8a99a8;}.cx-lb.r3 .rk{color:#c08a52;}',
      '.cx-lb .at{display:flex;align-items:center;gap:8px;min-width:0;} .cx-lb .at b{font-size:13px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      '.cx-lb .tot{text-align:center;font-weight:900;color:#d6353b;} .cx-lb .c b{display:block;font-size:11px;font-weight:900;} .cx-lb .c b.p1{color:#e0a83e;}.cx-lb .c b.p2{color:#8a99a8;}.cx-lb .c b.p3{color:#c08a52;} .cx-lb .c span{font-size:8px;font-weight:800;color:var(--ffp-text-muted);}',
      '.cx-mbk{position:fixed;inset:0;background:rgba(8,18,26,.5);z-index:1200;display:flex;align-items:center;justify-content:center;padding:16px;}',
      '.cx-modal{background:#fff;border-radius:16px;width:100%;max-width:460px;max-height:90vh;overflow:auto;padding:22px;}',
      '.cx-modal h3{font-size:18px;font-weight:900;margin:0 0 16px;color:var(--ffp-text);}',
      '.cx-mfoot{display:flex;gap:10px;justify-content:flex-end;margin-top:18px;}'
    ].join('');
    document.head.appendChild(css);
  }

  // ---------- LIST ----------
  async function renderList() {
    injectCss(); S.view = 'list';
    var el = root(); if (!el) return;
    el.innerHTML = '<div class="cx-wrap"><div class="cx-head"><div><div class="cx-h1">Competitions</div><div class="cx-sub">Create and run your own event leaderboards.</div></div></div><div id="cx-list" class="cx-grid"><div class="cx-empty">Loading…</div></div></div>';
    var r; try { r = await sb().rpc('comp_my_events'); } catch (e) { r = { error: e }; }
    var rows = (r && !r.error && Array.isArray(r.data)) ? r.data : [];
    var g = document.getElementById('cx-list'); if (!g) return;
    var cards = rows.map(function (ev) {
      var cover = ev.cover_url || ev.logo_url;
      var st = ev.status || 'draft';
      return '<div class="cx-card" onclick="FFPComp.open(\'' + ev.id + '\')">' +
        '<div class="cx-cover" style="' + (cover ? 'background-image:url(\'' + esc(cover) + '\')' : 'background:linear-gradient(135deg,' + esc(ev.accent || '#d6353b') + ',#0f2230)') + '">' +
        '<div class="scr"></div><span class="cx-bd bd ' + st + '">' + st.toUpperCase() + '</span></div>' +
        '<div class="cx-cbody"><b>' + esc(ev.name) + '</b><span>' + (ev.divisions || 0) + ' divisions · ' + (ev.entrants || 0) + ' athletes' + (ev.city ? ' · ' + esc(ev.city) : '') + '</span></div></div>';
    }).join('');
    g.innerHTML = '<div class="cx-new" onclick="FFPComp.create()"><span class="ms">add_circle</span>Create competition</div>' + cards;
  }

  async function create() {
    var name = prompt('Name your competition'); if (!name) return;
    var p = { name: name, organizer_provider_id: prov().id || null };
    // seed brand identity from the provider profile
    try { var pp = (typeof providerProfile !== 'undefined') ? providerProfile : null; if (pp) { if (pp.logo_url) p.logo_url = pp.logo_url; if (pp.hero_photo_url) p.cover_url = pp.hero_photo_url; if (pp.city) p.city = pp.city; if (pp.country) p.country = pp.country; } } catch (e) {}
    var r; try { r = await sb().rpc('comp_event_save', { p_id: null, p: p }); } catch (e) { r = { error: e }; }
    if (r && !r.error && r.data) { toast('Competition created', 'check'); open(r.data); } else { toast('Could not create', 'error'); }
  }

  // ---------- EDITOR ----------
  async function open(id) {
    injectCss(); S.eventId = id; S.view = 'edit';
    var r; try { r = await sb().rpc('comp_detail', { p_event: id }); } catch (e) { r = { error: e }; }
    S.detail = (r && !r.error) ? r.data : null;
    var divs = (S.detail && S.detail.divisions) || [];
    if (!S.divId || !divs.some(function (d) { return d.id === S.divId; })) S.divId = divs[0] ? divs[0].id : null;
    if (!S.tab) S.tab = 'details';
    renderEditor();
  }
  function reload() { return open(S.eventId); }

  function renderEditor() {
    var el = root(); if (!el || !S.detail) return;
    var ev = S.detail.event || {};
    var tabs = [['details', 'Details'], ['divisions', 'Divisions'], ['workouts', 'Events'], ['athletes', 'Athletes'], ['scores', 'Scores'], ['standings', 'Standings']];
    el.innerHTML = '<div class="cx-wrap">' +
      '<div class="cx-head"><div style="display:flex;align-items:center;gap:12px;">' +
      '<button class="cx-btn sm" onclick="FFPComp.list()"><span class="ms">arrow_back</span></button>' +
      '<div><div class="cx-h1">' + esc(ev.name) + ' <span class="cx-pill ' + (ev.status || 'draft') + '">' + esc(ev.status || 'draft') + '</span></div>' +
      '<div class="cx-sub">' + ((S.detail.divisions || []).length) + ' divisions · ' + (ev.entrants || 0) + ' athletes</div></div></div></div>' +
      '<div class="cx-editnav">' + tabs.map(function (t) { return '<button class="' + (S.tab === t[0] ? 'on' : '') + '" onclick="FFPComp.tab(\'' + t[0] + '\')">' + t[1] + '</button>'; }).join('') + '</div>' +
      '<div id="cx-tab"></div></div>';
    renderTab();
  }

  function divPickerHtml(onchange) {
    var divs = (S.detail && S.detail.divisions) || [];
    if (!divs.length) return '<div class="cx-empty">Add a division first (Divisions tab).</div>';
    return '<select class="cx-sel" onchange="' + onchange + '">' + divs.map(function (d) {
      return '<option value="' + d.id + '"' + (d.id === S.divId ? ' selected' : '') + '>' + esc(d.name) + (d.team_size > 1 ? ' (teams of ' + d.team_size + ')' : '') + '</option>';
    }).join('') + '</select>';
  }

  function renderTab() {
    var c = document.getElementById('cx-tab'); if (!c) return;
    if (S.tab === 'details') return renderDetails(c);
    if (S.tab === 'divisions') return renderDivisions(c);
    if (S.tab === 'workouts') return renderWorkouts(c);
    if (S.tab === 'athletes') return renderAthletes(c);
    if (S.tab === 'scores') return renderScores(c);
    if (S.tab === 'standings') return renderStandings(c);
  }

  // Details
  function renderDetails(c) {
    var ev = S.detail.event || {};
    var accents = ['#d6353b', '#1980ad', '#0a8f5f', '#7a3ff2', '#f2a900', '#e0483d'];
    var dt = function (v) { return v ? String(v).slice(0, 16) : ''; };
    c.innerHTML =
      '<div class="cx-fld"><div class="cx-lab">Competition name</div><input id="cx-name" class="cx-in" value="' + esc(ev.name || '') + '"></div>' +
      '<div class="cx-fld"><div class="cx-lab">About (shown on the Info tab in the app)</div><textarea id="cx-desc" class="cx-in" rows="3" placeholder="What the day looks like, format, spectators…">' + esc(ev.description || '') + '</textarea></div>' +
      '<div class="cx-2"><div class="cx-fld"><div class="cx-lab">City</div><input id="cx-city" class="cx-in" value="' + esc(ev.city || '') + '"></div>' +
      '<div class="cx-fld"><div class="cx-lab">Country</div><input id="cx-country" class="cx-in" value="' + esc(ev.country || '') + '"></div></div>' +
      '<div class="cx-2"><div class="cx-fld"><div class="cx-lab">Starts</div><input id="cx-start" type="datetime-local" class="cx-in" value="' + dt(ev.starts_at) + '"></div>' +
      '<div class="cx-fld"><div class="cx-lab">Ends</div><input id="cx-end" type="datetime-local" class="cx-in" value="' + dt(ev.ends_at) + '"></div></div>' +
      '<div class="cx-fld"><div class="cx-lab">Scoring method</div><div class="cx-seg" id="cx-mode">' +
        '<button class="' + (ev.scoring_mode !== 'placement' ? 'on' : '') + '" data-v="points" onclick="FFPComp.pickMode(this)">Points (100,96,92…)</button>' +
        '<button class="' + (ev.scoring_mode === 'placement' ? 'on' : '') + '" data-v="placement" onclick="FFPComp.pickMode(this)">Placement (1,2,3…)</button></div>' +
        '<div class="cx-sub" style="margin-top:6px">Points = higher is better (F45/CrossFit style). Placement = lowest total wins.</div></div>' +
      '<div class="cx-2"><div class="cx-fld"><div class="cx-lab">Entry fee (0 = free)</div><input id="cx-fee" type="number" min="0" class="cx-in" value="' + (ev.entry_fee != null ? ev.entry_fee : '') + '"></div>' +
      '<div class="cx-fld"><div class="cx-lab">Currency</div><input id="cx-cur" class="cx-in" value="' + esc(ev.currency || 'USD') + '"></div></div>' +
      '<div class="cx-fld"><div class="cx-lab">Banner image <span style="font-weight:500;color:#8a99a8;">— wide photo, no words on the image</span></div>' +
        '<div id="listing-photo-slot" data-url="' + esc(ev.cover_url || '') + '"></div>' +
        '<div class="cx-sub" style="margin-top:6px">This is your event\'s banner across the top of the competition page in the app. Use a clean landscape photo with no text.</div></div>' +
      '<div class="cx-fld"><div class="cx-lab">Accent colour</div><div id="cx-accent">' + accents.map(function (a) { return '<span class="cx-sw' + ((ev.accent || '#d6353b') === a ? ' on' : '') + '" style="background:' + a + '" data-v="' + a + '" onclick="FFPComp.pickAccent(this)"></span>'; }).join('') + '</div>' +
        '<div class="cx-sub" style="margin-top:6px">Your logo comes from your business profile; the banner above is this event\'s own image.</div></div>' +
      '<div class="cx-fld"><div class="cx-lab">Status</div><select id="cx-status" class="cx-sel" style="max-width:240px">' +
        ['draft', 'open', 'live', 'final'].map(function (s) { return '<option value="' + s + '"' + ((ev.status || 'draft') === s ? ' selected' : '') + '>' + s.charAt(0).toUpperCase() + s.slice(1) + (s === 'draft' ? ' (hidden)' : s === 'open' ? ' (registration)' : s === 'live' ? ' (in progress)' : ' (results)') + '</option>'; }).join('') + '</select>' +
        '<div class="cx-sub" style="margin-top:6px">Open / Live / Final appear in the FFP App. Draft stays hidden.</div></div>' +
      '<button class="cx-btn pri" onclick="FFPComp.saveDetails()"><span class="ms">save</span> Save details</button>';
    if (typeof window.renderListingUploader === 'function') { try { window.renderListingUploader(ev.cover_url || ''); } catch (e) {} }
  }
  var _mode = null, _accent = null;
  function pickMode(b) { _mode = b.getAttribute('data-v'); Array.prototype.forEach.call(b.parentNode.children, function (x) { x.classList.remove('on'); }); b.classList.add('on'); }
  function pickAccent(b) { _accent = b.getAttribute('data-v'); Array.prototype.forEach.call(b.parentNode.children, function (x) { x.classList.remove('on'); }); b.classList.add('on'); }
  async function saveDetails() {
    var g = function (id) { var e = document.getElementById(id); return e ? e.value : undefined; };
    var slot = document.getElementById('listing-photo-slot');
    var cover = slot ? (slot.dataset.url || '') : '';
    var p = {
      name: g('cx-name'), description: g('cx-desc'), city: g('cx-city'), country: g('cx-country'),
      starts_at: g('cx-start'), ends_at: g('cx-end'),
      scoring_mode: _mode || (S.detail.event.scoring_mode || 'points'),
      accent: _accent || S.detail.event.accent || '#d6353b',
      cover_url: cover || null,
      entry_fee: g('cx-fee'), currency: g('cx-cur'), status: g('cx-status')
    };
    var r; try { r = await sb().rpc('comp_event_save', { p_id: S.eventId, p: p }); } catch (e) { r = { error: e }; }
    if (r && !r.error) { toast('Saved', 'check'); _mode = _accent = null; reload(); } else { toast('Save failed', 'error'); }
  }

  // Divisions
  function renderDivisions(c) {
    var divs = (S.detail.divisions || []);
    c.innerHTML = '<div class="cx-head"><div class="cx-sub">Each division is individual or a team of N, and has its OWN events.</div>' +
      '<button class="cx-btn pri sm" onclick="FFPComp.editDivision()"><span class="ms">add</span> Add division</button></div>' +
      (divs.length ? divs.map(function (d) {
        var meta = (d.team_size > 1 ? 'Teams of ' + d.team_size : 'Individual') + (d.gender ? ' · ' + d.gender : '') + ((d.min_age || d.max_age) ? ' · age ' + (d.min_age || 0) + '–' + (d.max_age || '+') : '') + ' · ' + (d.entrants || 0) + ' entered · ' + ((d.workouts || []).length) + ' events';
        return '<div class="cx-row"><div class="cx-av"><span class="ms" style="font-size:18px">military_tech</span></div>' +
          '<div class="g"><b>' + esc(d.name) + '</b><span>' + esc(meta) + '</span></div>' +
          '<button class="cx-btn sm" onclick="FFPComp.editDivision(\'' + d.id + '\')">Edit</button></div>';
      }).join('') : '<div class="cx-empty">No divisions yet. Add one to start.</div>');
  }
  function editDivision(id) {
    var d = (S.detail.divisions || []).find(function (x) { return x.id === id; }) || {};
    var sizes = ''; for (var i = 1; i <= 8; i++) sizes += '<option value="' + i + '"' + ((d.team_size || 1) === i ? ' selected' : '') + '>' + (i === 1 ? 'Individual' : 'Team of ' + i) + '</option>';
    openModal((id ? 'Edit' : 'Add') + ' division',
      '<div class="cx-fld"><div class="cx-lab">Name</div><input id="cd-name" class="cx-in" value="' + esc(d.name || '') + '" placeholder="e.g. RX Women"></div>' +
      '<div class="cx-fld"><div class="cx-lab">Type</div><select id="cd-size" class="cx-sel">' + sizes + '</select></div>' +
      '<div class="cx-2"><div class="cx-fld"><div class="cx-lab">Gender (optional)</div><select id="cd-gender" class="cx-sel"><option value="">Open</option>' +
        ['Female', 'Male'].map(function (x) { return '<option' + (d.gender === x ? ' selected' : '') + '>' + x + '</option>'; }).join('') + '</select></div>' +
      '<div class="cx-fld"><div class="cx-lab">Scaling (optional)</div><input id="cd-scaling" class="cx-in" value="' + esc(d.scaling || '') + '" placeholder="RX / Scaled"></div></div>' +
      '<div class="cx-2"><div class="cx-fld"><div class="cx-lab">Min age</div><input id="cd-min" type="number" class="cx-in" value="' + (d.min_age != null ? d.min_age : '') + '"></div>' +
      '<div class="cx-fld"><div class="cx-lab">Max age</div><input id="cd-max" type="number" class="cx-in" value="' + (d.max_age != null ? d.max_age : '') + '"></div></div>',
      '<button class="cx-btn" onclick="FFPComp.closeModal()">Cancel</button><button class="cx-btn pri" onclick="FFPComp.saveDivision(\'' + (id || '') + '\')">Save</button>');
  }
  async function saveDivision(id) {
    var g = function (x) { var e = document.getElementById(x); return e ? e.value : ''; };
    var p = { name: g('cd-name'), team_size: g('cd-size'), gender: g('cd-gender') || null, scaling: g('cd-scaling') || null, min_age: g('cd-min') || null, max_age: g('cd-max') || null };
    if (!p.name) { toast('Name the division'); return; }
    var r; try { r = await sb().rpc('comp_division_save', { p_event: S.eventId, p_id: id || null, p: p }); } catch (e) { r = { error: e }; }
    if (r && !r.error) { toast('Saved', 'check'); closeModal(); reload(); } else { toast('Save failed', 'error'); }
  }

  // Workouts (per division)
  function renderWorkouts(c) {
    var div = (S.detail.divisions || []).find(function (d) { return d.id === S.divId; });
    var wods = div ? (div.workouts || []) : [];
    c.innerHTML = '<div class="cx-toolbar">' + divPickerHtml('FFPComp.setDiv(this.value)') +
      (div ? '<button class="cx-btn pri sm" onclick="FFPComp.editWorkout()"><span class="ms">add</span> Add event</button>' : '') + '</div>' +
      (!div ? '' : (wods.length ? wods.map(function (w, i) {
        var meta = w.score_type + ' · ' + (w.direction === 'asc' ? 'lower wins' : 'higher wins') + (w.cap_seconds ? ' · cap ' + Math.floor(w.cap_seconds / 60) + ':' + ('' + (w.cap_seconds % 60)).padStart(2, '0') : '');
        return '<div class="cx-row"><div class="cx-av"><span class="ms" style="font-size:18px">fitness_center</span></div>' +
          '<div class="g"><b>Event ' + (i + 1) + ' · ' + esc(w.name) + '</b><span>' + esc(meta) + '</span></div>' +
          '<button class="cx-btn sm" onclick="FFPComp.editWorkout(\'' + w.id + '\')">Edit</button></div>';
      }).join('') : '<div class="cx-empty">No events in this division yet.</div>'));
  }
  function editWorkout(id) {
    var div = (S.detail.divisions || []).find(function (d) { return d.id === S.divId; }); if (!div) return;
    var w = (div.workouts || []).find(function (x) { return x.id === id; }) || {};
    var types = ['time', 'reps', 'weight', 'distance', 'points'];
    var cap = w.cap_seconds ? Math.floor(w.cap_seconds / 60) : '';
    openModal((id ? 'Edit' : 'Add') + ' event — ' + esc(div.name),
      '<div class="cx-fld"><div class="cx-lab">Name</div><input id="cw-name" class="cx-in" value="' + esc(w.name || '') + '" placeholder="e.g. Fran"></div>' +
      '<div class="cx-fld"><div class="cx-lab">Description (optional)</div><textarea id="cw-desc" class="cx-in" rows="3" placeholder="Movements, reps, standards…">' + esc(w.description || '') + '</textarea></div>' +
      '<div class="cx-2"><div class="cx-fld"><div class="cx-lab">Scored in</div><select id="cw-type" class="cx-sel" onchange="FFPComp.typeHint(this.value)">' +
        types.map(function (t) { return '<option value="' + t + '"' + ((w.score_type || 'time') === t ? ' selected' : '') + '>' + t + '</option>'; }).join('') + '</select></div>' +
      '<div class="cx-fld"><div class="cx-lab">Winner</div><select id="cw-dir" class="cx-sel">' +
        '<option value="asc"' + (w.direction === 'asc' ? ' selected' : '') + '>Lower wins (time)</option>' +
        '<option value="desc"' + (w.direction === 'desc' ? ' selected' : '') + '>Higher wins (reps/weight)</option></select></div></div>' +
      '<div class="cx-fld"><div class="cx-lab">Time cap minutes (optional)</div><input id="cw-cap" type="number" class="cx-in" value="' + cap + '" style="max-width:160px"></div>',
      '<button class="cx-btn" onclick="FFPComp.closeModal()">Cancel</button><button class="cx-btn pri" onclick="FFPComp.saveWorkout(\'' + (id || '') + '\')">Save</button>');
  }
  function typeHint(t) { var d = document.getElementById('cw-dir'); if (!d) return; d.value = (t === 'time') ? 'asc' : 'desc'; }
  async function saveWorkout(id) {
    var g = function (x) { var e = document.getElementById(x); return e ? e.value : ''; };
    var capMin = parseInt(g('cw-cap'), 10);
    var p = { name: g('cw-name'), description: g('cw-desc') || null, score_type: g('cw-type'), direction: g('cw-dir'), cap_seconds: isNaN(capMin) ? null : capMin * 60 };
    if (!p.name) { toast('Name the event'); return; }
    var r; try { r = await sb().rpc('comp_workout_save', { p_division: S.divId, p_id: id || null, p: p }); } catch (e) { r = { error: e }; }
    if (r && !r.error) { toast('Saved', 'check'); closeModal(); reload(); } else { toast('Save failed', 'error'); }
  }

  // Athletes (roster) per division
  async function renderAthletes(c) {
    c.innerHTML = '<div class="cx-toolbar">' + divPickerHtml('FFPComp.setDiv(this.value)') +
      (S.divId ? '<button class="cx-btn pri sm" onclick="FFPComp.addAthlete()"><span class="ms">person_add</span> Add manually</button>' : '') + '</div><div id="cx-roster"><div class="cx-empty">Loading…</div></div>';
    if (!S.divId) { document.getElementById('cx-roster').innerHTML = ''; return; }
    var r; try { r = await sb().rpc('comp_roster', { p_division: S.divId }); } catch (e) { r = { error: e }; }
    var rows = (r && !r.error && Array.isArray(r.data)) ? r.data : [];
    var box = document.getElementById('cx-roster'); if (!box) return;
    box.innerHTML = rows.length ? rows.map(function (a) {
      var av = a.photo ? '<span class="cx-av" style="background-image:url(\'' + esc(a.photo) + '\')"></span>' : '<span class="cx-av">' + esc((a.name || '?').slice(0, 1).toUpperCase()) + '</span>';
      return '<div class="cx-row">' + av + '<div class="g"><b>' + esc(a.name) + '</b><span>#' + (a.athlete_no || '—') + ' · ' + esc(a.status || '') + (a.is_member ? ' · FFP member' : ' · manual') + '</span></div></div>';
    }).join('') : '<div class="cx-empty">No athletes yet. Members register in the FFP App, or add manually.</div>';
  }
  function addAthlete() {
    openModal('Add athlete / team',
      '<div class="cx-sub" style="margin-bottom:12px">Members register themselves in the app with their FFP account. Use this for walk-ins / manual entries.</div>' +
      '<div class="cx-fld"><div class="cx-lab">Name (athlete or team)</div><input id="ca-name" class="cx-in" placeholder="e.g. Sarah King / Reef Raiders"></div>' +
      '<div class="cx-fld"><div class="cx-lab">Athlete # (optional)</div><input id="ca-no" type="number" class="cx-in" style="max-width:140px"></div>',
      '<button class="cx-btn" onclick="FFPComp.closeModal()">Cancel</button><button class="cx-btn pri" onclick="FFPComp.saveAthlete()">Add</button>');
  }
  async function saveAthlete() {
    var div = (S.detail.divisions || []).find(function (d) { return d.id === S.divId; });
    var name = (document.getElementById('ca-name') || {}).value || '';
    if (!name.trim()) { toast('Enter a name'); return; }
    var no = parseInt((document.getElementById('ca-no') || {}).value, 10);
    var p = { division_id: S.divId, kind: (div && div.team_size > 1) ? 'team' : 'individual', team_name: name.trim(), athlete_no: isNaN(no) ? null : no, status: 'checked_in' };
    var r; try { r = await sb().rpc('comp_entrant_add', { p_event: S.eventId, p: p }); } catch (e) { r = { error: e }; }
    if (r && !r.error) { toast('Added', 'check'); closeModal(); reload().then(function () { FFPComp.tab('athletes'); }); } else { toast('Failed', 'error'); }
  }

  // Scores: division + workout grid
  async function renderScores(c) {
    var div = (S.detail.divisions || []).find(function (d) { return d.id === S.divId; });
    var wods = div ? (div.workouts || []) : [];
    if (!S.wodId || !wods.some(function (w) { return w.id === S.wodId; })) S.wodId = wods[0] ? wods[0].id : null;
    var wodSel = wods.length ? '<select class="cx-sel" onchange="FFPComp.setWod(this.value)">' + wods.map(function (w) { return '<option value="' + w.id + '"' + (w.id === S.wodId ? ' selected' : '') + '>' + esc(w.name) + '</option>'; }).join('') + '</select>' : '';
    c.innerHTML = '<div class="cx-toolbar">' + divPickerHtml('FFPComp.setDiv(this.value)') + wodSel + '</div><div id="cx-scores"><div class="cx-empty">Loading…</div></div>';
    if (!S.divId || !S.wodId) { document.getElementById('cx-scores').innerHTML = '<div class="cx-empty">Add an event to this division first.</div>'; return; }
    var w = wods.find(function (x) { return x.id === S.wodId; });
    var r; try { r = await sb().rpc('comp_score_grid', { p_division: S.divId, p_workout: S.wodId }); } catch (e) { r = { error: e }; }
    var rows = (r && !r.error && Array.isArray(r.data)) ? r.data : [];
    var box = document.getElementById('cx-scores'); if (!box) return;
    if (!rows.length) { box.innerHTML = '<div class="cx-empty">No athletes in this division yet.</div>'; return; }
    var unit = w.score_type === 'time' ? 'seconds' : w.score_type === 'weight' ? 'kg' : w.score_type === 'distance' ? 'metres' : w.score_type;
    box.innerHTML = '<div class="cx-sub" style="margin-bottom:8px">Enter each score in <b>' + esc(unit) + '</b> (' + (w.direction === 'asc' ? 'lower wins' : 'higher wins') + '). Save recalculates the leaderboard.</div>' +
      '<div class="cx-sc head"><span>#</span><span>Athlete</span><span style="text-align:center">Score</span><span>&nbsp;</span><span>&nbsp;</span></div>' +
      rows.map(function (a) {
        var av = a.photo ? '<span class="cx-av" style="width:26px;height:26px;background-image:url(\'' + esc(a.photo) + '\')"></span>' : '<span class="cx-av" style="width:26px;height:26px">' + esc((a.name || '?').slice(0, 1).toUpperCase()) + '</span>';
        return '<div class="cx-sc"><span style="text-align:center;font-weight:800;color:var(--ffp-text-muted)">' + (a.athlete_no || '') + '</span>' +
          '<span style="display:flex;align-items:center;gap:8px;min-width:0">' + av + '<b style="font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(a.name) + '</b></span>' +
          '<input id="cs-' + a.entrant_id + '" type="number" step="any" value="' + (a.raw != null ? a.raw : '') + '" placeholder="—">' +
          '<span>&nbsp;</span><span>&nbsp;</span></div>';
      }).join('') +
      '<div style="margin-top:16px;display:flex;gap:10px"><button class="cx-btn pri" onclick="FFPComp.saveScores()"><span class="ms">bolt</span> Save scores</button>' +
      '<button class="cx-btn" onclick="FFPComp.tab(\'standings\')">View standings</button></div>';
  }
  async function saveScores() {
    var div = (S.detail.divisions || []).find(function (d) { return d.id === S.divId; });
    var rows = (div && div.workouts) ? [] : [];
    var inputs = document.querySelectorAll('[id^="cs-"]');
    var jobs = [];
    inputs.forEach(function (inp) {
      var eid = inp.id.slice(3);
      var v = inp.value === '' ? null : Number(inp.value);
      jobs.push(sb().rpc('comp_score_set', { p_workout: S.wodId, p_entrant: eid, p_raw: v, p_tiebreak: null, p_notes: null }));
    });
    try { await Promise.all(jobs); toast('Scores saved — leaderboard updated', 'check'); } catch (e) { toast('Some scores failed', 'error'); }
  }

  // Standings: leaderboard per division + publish
  async function renderStandings(c) {
    c.innerHTML = '<div class="cx-toolbar">' + divPickerHtml('FFPComp.setDiv(this.value)') +
      '<button class="cx-btn green sm" onclick="FFPComp.publish()"><span class="ms">public</span> Publish live to app</button>' +
      '<button class="cx-btn sm" onclick="FFPComp.finalise()"><span class="ms">emoji_events</span> Mark final</button></div><div id="cx-stand"><div class="cx-empty">Loading…</div></div>';
    if (!S.divId) { document.getElementById('cx-stand').innerHTML = ''; return; }
    var r; try { r = await sb().rpc('comp_leaderboard', { p_event: S.eventId, p_division: S.divId }); } catch (e) { r = { error: e }; }
    var b = (r && !r.error) ? r.data : null;
    var box = document.getElementById('cx-stand'); if (!box) return;
    var rows = (b && b.rows) || [], wods = (b && b.workouts) || [];
    if (!rows.length) { box.innerHTML = '<div class="cx-empty">No scores yet.</div>'; return; }
    var cols = '26px 1fr 46px ' + wods.map(function () { return '44px'; }).join(' ');
    var ordn = function (n) { var s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
    var pc = function (rk) { return rk === 1 ? 'p1' : rk === 2 ? 'p2' : rk === 3 ? 'p3' : ''; };
    var cell = function (row, wid) { return (row.cells || []).find(function (x) { return x.workout_id === wid; }); };
    box.innerHTML = '<div class="cx-lb head" style="grid-template-columns:' + cols + '"><span>#</span><span>Athlete</span><span class="e">Pts</span>' +
      wods.map(function (w, i) { return '<span class="e">W' + (i + 1) + '</span>'; }).join('') + '</div>' +
      rows.map(function (row, i) {
        var av = row.photo ? '<span class="cx-av" style="width:26px;height:26px;background-image:url(\'' + esc(row.photo) + '\')"></span>' : '<span class="cx-av" style="width:26px;height:26px">' + esc((row.name || '?').slice(0, 1).toUpperCase()) + '</span>';
        return '<div class="cx-lb r' + (i < 3 ? i + 1 : '') + '" style="grid-template-columns:' + cols + '">' +
          '<span class="rk">' + row.rank + '</span><span class="at">' + av + '<b>' + esc(row.name) + '</b></span><span class="tot">' + row.total + '</span>' +
          wods.map(function (w) { var cc = cell(row, w.id); return '<span class="c">' + (cc ? '<b class="' + pc(cc.rank) + '">' + ordn(cc.rank) + '</b><span>' + cc.points + '</span>' : '<b style="color:#c2ccd3">—</b>') + '</span>'; }).join('') +
          '</div>';
      }).join('') +
      '<div class="cx-sub" style="margin-top:12px">' + (b.mode === 'placement' ? 'Placement scoring — lowest total wins.' : 'Points scoring — highest total wins.') + '</div>';
  }
  async function setStatus(st, msg) {
    var r; try { r = await sb().rpc('comp_event_save', { p_id: S.eventId, p: { status: st } }); } catch (e) { r = { error: e }; }
    if (r && !r.error) { toast(msg, 'check'); reload().then(function () { FFPComp.tab('standings'); }); } else { toast('Failed', 'error'); }
  }
  function publish() { setStatus('live', 'Published — now live in the FFP App'); }
  function finalise() { setStatus('final', 'Marked final'); }

  // modal
  function openModal(title, body, foot) {
    closeModal();
    var bk = document.createElement('div'); bk.className = 'cx-mbk'; bk.id = 'cx-mbk';
    bk.innerHTML = '<div class="cx-modal"><h3>' + esc(title) + '</h3>' + body + '<div class="cx-mfoot">' + foot + '</div></div>';
    bk.addEventListener('click', function (e) { if (e.target === bk) closeModal(); });
    document.body.appendChild(bk);
  }
  function closeModal() { var b = document.getElementById('cx-mbk'); if (b) b.remove(); }

  // actions
  function setDiv(v) { S.divId = v; S.wodId = null; renderTab(); }
  function setWod(v) { S.wodId = v; renderTab(); }
  function tab(t) { S.tab = t; document.querySelectorAll('.cx-editnav button').forEach(function (b) { b.classList.remove('on'); }); var el = document.querySelector('.cx-editnav button[onclick*="\'' + t + '\'"]'); if (el) el.classList.add('on'); renderTab(); }

  window.FFPComp = { list: renderList, create: create, open: open, tab: tab, setDiv: setDiv, setWod: setWod,
    saveDetails: saveDetails, pickMode: pickMode, pickAccent: pickAccent,
    editDivision: editDivision, saveDivision: saveDivision,
    editWorkout: editWorkout, saveWorkout: saveWorkout, typeHint: typeHint,
    addAthlete: addAthlete, saveAthlete: saveAthlete, saveScores: saveScores,
    publish: publish, finalise: finalise, closeModal: closeModal };
  window.ffpRenderCompetitions = renderList;
})();
