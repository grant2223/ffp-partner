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
      '.cx-btn{display:inline-flex;align-items:center;gap:7px;border:1px solid #cfe0ec;background:#eaf3fa;border-radius:10px;padding:10px 14px;font:inherit;font-size:13px;font-weight:800;color:#1980AD;cursor:pointer;}',
      '.cx-btn:hover{background:#dfeef8;}',
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
      '.cx-seg{display:inline-flex;border:1.5px solid var(--ffp-border-mid);border-radius:10px;overflow:hidden;} .cx-seg button{background:#fff;border:none;padding:8px 13px;font:inherit;font-size:12px;font-weight:800;color:var(--ffp-text-muted);cursor:pointer;} .cx-seg button.on{background:var(--ffp-blue);color:#fff;}',
      '.cx-btn.sm,.cx-in.sm,.cx-sel.sm{padding:7px 10px;font-size:12px;} .cx-in.sm{width:auto;}',
      '.cx-heath{display:flex;align-items:center;gap:10px;padding:18px 0 8px;border-bottom:2px solid var(--ffp-text);margin-top:6px;} .cx-heath b{font-size:15px;font-weight:900;} .cx-heath .fin{font-size:9.5px;font-weight:900;letter-spacing:.4px;color:#3a2600;background:var(--ffp-yellow,#f2a900);padding:3px 9px;border-radius:20px;} .cx-heath .r{margin-left:auto;display:flex;gap:8px;align-items:center;}',
      '.cx-lrow{display:flex;align-items:center;gap:12px;padding:10px 2px;border-bottom:1px solid var(--ffp-border);} .cx-lrow .ln{width:22px;text-align:center;font-size:13px;font-weight:900;color:var(--ffp-text-muted);} .cx-lrow .pl{font-size:11px;font-weight:900;color:var(--ffp-blue);width:34px;} .cx-lrow b{flex:1;font-size:14px;font-weight:800;} .cx-lrow .cx-sel{width:auto;}',
      '.cx-av{width:32px;height:32px;border-radius:50%;background:#e7ecef center/cover;flex:none;display:flex;align-items:center;justify-content:center;font-weight:900;color:#6a7681;font-size:12px;} .cx-row .g{flex:1;} .cx-row .g b{font-size:14px;font-weight:800;} .cx-row .g span{display:block;font-size:12px;color:var(--ffp-text-muted);font-weight:700;}',
      '.cx-pill{font-size:11px;font-weight:800;padding:3px 10px;border-radius:20px;}',
      '.cx-pill.live{background:#fdeaea;color:#d6353b;} .cx-pill.open{background:#e3f6ec;color:#0a8f5f;} .cx-pill.draft{background:#eef2f5;color:#5b6b75;} .cx-pill.final{background:#eef2f5;color:#5b6b75;}',
      '.cx-lab{font-size:10.5px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;color:#8a97a2;margin:0 0 7px;}',
      '.cx-in,.cx-sel{width:100%;padding:10px 12px;border:1px solid #d7dee5;border-radius:10px;font:inherit;box-sizing:border-box;background:#fff;color:#12232f;}',
      '.cx-fld{margin-bottom:14px;} .cx-2{display:grid;grid-template-columns:1fr 1fr;gap:12px;}',
      '.cx-seg{display:inline-flex;border:1.5px solid var(--ffp-border-mid);border-radius:10px;overflow:hidden;}',
      '.cx-seg button{background:#fff;border:none;padding:9px 16px;font:inherit;font-size:13px;font-weight:800;color:var(--ffp-text-muted);cursor:pointer;}',
      '.cx-seg button.on{background:var(--ffp-blue);color:#fff;}',
      '.cx-sw{width:26px;height:26px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 0 1px #d7dee5;cursor:pointer;display:inline-block;margin-right:8px;}',
      '.cx-sw.on{box-shadow:0 0 0 2px #fff,0 0 0 4px var(--ffp-text);}',
      '.cx-row{display:flex;align-items:center;gap:12px;padding:12px 4px;border-bottom:1px solid var(--ffp-border);}',
      '.cx-drow{cursor:default;border-radius:8px;transition:background .12s,box-shadow .12s;}',
      '.cx-drow .cx-drag{color:#b6c2cc;cursor:grab;font-size:20px;flex:none;}',
      '.cx-drow.dragging{opacity:.4;}',
      '.cx-drow.dragover{background:#eaf3fa;box-shadow:inset 0 2px 0 #1980AD;}',
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
      '.cx-mbk{position:fixed;inset:0;background:#fff;z-index:1200;overflow-y:auto;-webkit-overflow-scrolling:touch;}',
      '.cx-modal{width:100%;max-width:640px;margin:0 auto;min-height:100dvh;background:#fff;padding:0 18px calc(env(safe-area-inset-bottom) + 30px);box-sizing:border-box;display:flex;flex-direction:column;}',
      '.cx-mhead{position:sticky;top:0;background:#fff;z-index:2;display:flex;align-items:center;gap:10px;padding:calc(env(safe-area-inset-top) + 12px) 0 12px;border-bottom:1px solid var(--ffp-border,#e7ecf0);margin-bottom:18px;}',
      '.cx-mback{width:38px;height:38px;flex:none;border:none;background:none;border-radius:50%;color:var(--ffp-text,#12232f);display:flex;align-items:center;justify-content:center;cursor:pointer;} .cx-mback .ms{font-size:24px;}',
      '.cx-modal h3{font-size:20px;font-weight:900;margin:0;color:var(--ffp-text);}',
      '.cx-mfoot{display:flex;gap:10px;justify-content:flex-end;margin-top:auto;padding-top:22px;}',
      '.cx-mfoot .cx-btn{flex:1;justify-content:center;}'
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
    var tabs = [['details', 'Details'], ['divisions', 'Divisions'], ['workouts', 'Events'], ['athletes', 'Athletes'], ['heats', 'Heats & lanes'], ['judges', 'Judges'], ['scores', 'Scores'], ['standings', 'Standings'], ['sponsors', 'Sponsors']];
    if (ev.club_mode) tabs.push(['clubs', 'Clubs']);
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
    if (S.tab === 'heats') return renderHeats(c);
    if (S.tab === 'judges') return renderJudges(c);
    if (S.tab === 'scores') return renderScores(c);
    if (S.tab === 'standings') return renderStandings(c);
    if (S.tab === 'sponsors') return (window.FFPSponsors ? window.FFPSponsors.render(c, { scope: 'comp', eventId: S.eventId }) : (c.innerHTML = '<div class="cx-empty">Sponsor editor unavailable.</div>'));
    if (S.tab === 'clubs') return renderClubs(c);
  }

  // Details
  function renderDetails(c) {
    var ev = S.detail.event || {};
    var accents = ['#d6353b', '#1980ad', '#0a8f5f', '#7a3ff2', '#f2a900', '#e0483d'];
    var dt = function (v) { return v ? String(v).slice(0, 16) : ''; };
    if (!S.seriesList) { S.seriesList = []; sb().rpc('comp_my_series').then(function (r) { S.seriesList = (r && !r.error && r.data) || []; if (S.tab === 'details') renderTab(); }, function () {}); }
    var seriesOpts = '<option value="">One-off competition</option>' +
      (S.seriesList || []).map(function (s) { return '<option value="' + s.id + '"' + (ev.series_id === s.id ? ' selected' : '') + '>' + esc(s.name) + '</option>'; }).join('') +
      '<option value="__new">+ New series…</option>';
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
      '<div class="cx-fld"><div class="cx-lab">Live stream URL <span style="font-weight:500;color:#8a99a8;">— YouTube, Twitch, Facebook…</span></div><input id="cx-stream" class="cx-in" value="' + esc(ev.stream_url || '') + '" placeholder="https://…">' +
        '<div class="cx-sub" style="margin-top:6px">Shows a "Watch live" button on the competition page in the app.</div></div>' +
      '<div class="cx-fld"><div class="cx-lab">Accent colour</div><div id="cx-accent">' + accents.map(function (a) { return '<span class="cx-sw' + ((ev.accent || '#d6353b') === a ? ' on' : '') + '" style="background:' + a + '" data-v="' + a + '" onclick="FFPComp.pickAccent(this)"></span>'; }).join('') + '</div>' +
        '<div class="cx-sub" style="margin-top:6px">Your logo comes from your business profile; the banner above is this event\'s own image.</div></div>' +
      '<div class="cx-fld"><div class="cx-lab">Status</div><select id="cx-status" class="cx-sel" style="max-width:240px">' +
        ['draft', 'open', 'live', 'final'].map(function (s) { return '<option value="' + s + '"' + ((ev.status || 'draft') === s ? ' selected' : '') + '>' + s.charAt(0).toUpperCase() + s.slice(1) + (s === 'draft' ? ' (hidden)' : s === 'open' ? ' (registration)' : s === 'live' ? ' (in progress)' : ' (results)') + '</option>'; }).join('') + '</select>' +
        '<div class="cx-sub" style="margin-top:6px">Open / Live / Final appear in the FFP App. Draft stays hidden.</div></div>' +
      '<div class="cx-fld"><div class="cx-lab">Club championship</div><div class="cx-seg" id="cx-club">' +
        '<button class="' + (!ev.club_mode ? 'on' : '') + '" data-v="0" onclick="FFPComp.pickClub(this)">Off</button>' +
        '<button class="' + (ev.club_mode ? 'on' : '') + '" data-v="1" onclick="FFPComp.pickClub(this)">On — clubs compete</button></div>' +
        '<div class="cx-sub" style="margin-top:6px">When on, each entry picks the partner club it represents at registration, and a Clubs leaderboard ranks clubs by their entries\' final positions (1st = 1 point, 2nd = 2 …) — lowest total wins.</div></div>' +
      '<div class="cx-fld"><div class="cx-lab">Athlete self-scoring</div><div class="cx-seg" id="cx-self">' +
        '<button class="' + (!ev.self_score ? 'on' : '') + '" data-v="0" onclick="FFPComp.pickSelf(this)">Off</button>' +
        '<button class="' + (ev.self_score ? 'on' : '') + '" data-v="1" onclick="FFPComp.pickSelf(this)">On — athletes enter their own</button></div>' +
        '<div class="cx-sub" style="margin-top:6px">Athletes submit their result per event from the FFP App. It counts immediately — you can edit, hide or remove any score in the Scores tab.</div>' +
        '<div style="margin-top:10px"><div class="cx-lab">Proof</div><select id="cx-proof" class="cx-sel" style="max-width:260px">' +
          ['off', 'optional', 'required'].map(function (o) { return '<option value="' + o + '"' + ((ev.self_score_proof || 'off') === o ? ' selected' : '') + '>' + ({ off: 'No proof needed', optional: 'Optional photo / video', required: 'Require photo / video' })[o] + '</option>'; }).join('') + '</select></div></div>' +
      '<div class="cx-fld"><div class="cx-lab">Rules (optional)</div><textarea id="cx-rules" class="cx-in" rows="4" placeholder="Movement standards, scoring, tie-breaks, equipment…">' + esc(ev.rules || '') + '</textarea>' +
        '<div class="cx-sub" style="margin-top:6px">Shown to athletes on the competition Info tab.</div></div>' +
      '<div class="cx-fld"><div class="cx-lab">Waiver / disclaimer (optional)</div><textarea id="cx-waiver" class="cx-in" rows="4" placeholder="The waiver athletes must accept when they register…">' + esc(ev.waiver || '') + '</textarea>' +
        '<div class="cx-sub" style="margin-top:6px">Athletes must accept this to complete registration.</div></div>' +
      '<div class="cx-fld"><div class="cx-lab">Series / Season</div><select id="cx-series" class="cx-sel" style="max-width:340px" onchange="FFPComp.seriesPick(this.value)">' + seriesOpts + '</select>' +
        '<div id="cx-series-extra" style="' + (ev.series_id ? '' : 'display:none;') + 'margin-top:10px">' +
          '<div class="cx-2"><div class="cx-fld"><div class="cx-lab">Round number</div><input id="cx-series-round" type="number" min="1" class="cx-in" value="' + (ev.series_round || '') + '" style="max-width:120px"></div>' +
          '<div class="cx-fld"><div class="cx-lab">&nbsp;</div><label style="display:flex;align-items:center;gap:8px;font-weight:700;font-size:13.5px;color:#12232f;padding-top:10px"><input type="checkbox" id="cx-series-finals" ' + (ev.is_finals ? 'checked' : '') + ' style="width:18px;height:18px"> This is the finals event</label></div></div></div>' +
        '<div class="cx-sub" style="margin-top:6px">One-off = a standalone competition. Add it to a series to carry its final results into a season leaderboard.</div></div>' +
      '<button class="cx-btn pri" onclick="FFPComp.saveDetails()"><span class="ms">save</span> Save details</button>';
    if (typeof window.renderListingUploader === 'function') { try { window.renderListingUploader(ev.cover_url || ''); } catch (e) {} }
  }
  function seriesPick(v) { var x = document.getElementById('cx-series-extra'); if (x) x.style.display = (v && v !== '') ? '' : 'none'; }
  var _mode = null, _accent = null, _club = null, _self = null;
  function pickMode(b) { _mode = b.getAttribute('data-v'); Array.prototype.forEach.call(b.parentNode.children, function (x) { x.classList.remove('on'); }); b.classList.add('on'); }
  function pickClub(b) { _club = b.getAttribute('data-v'); Array.prototype.forEach.call(b.parentNode.children, function (x) { x.classList.remove('on'); }); b.classList.add('on'); }
  function pickSelf(b) { _self = b.getAttribute('data-v'); Array.prototype.forEach.call(b.parentNode.children, function (x) { x.classList.remove('on'); }); b.classList.add('on'); }
  function pickAccent(b) { _accent = b.getAttribute('data-v'); Array.prototype.forEach.call(b.parentNode.children, function (x) { x.classList.remove('on'); }); b.classList.add('on'); }
  async function saveDetails() {
    var g = function (id) { var e = document.getElementById(id); return e ? e.value : undefined; };
    var slot = document.getElementById('listing-photo-slot');
    var cover = slot ? (slot.dataset.url || '') : '';
    var p = {
      name: g('cx-name'), description: g('cx-desc'), city: g('cx-city'), country: g('cx-country'),
      starts_at: g('cx-start'), ends_at: g('cx-end'),
      rules: g('cx-rules') || null, waiver: g('cx-waiver') || null,
      club_mode: (_club != null ? _club === '1' : !!S.detail.event.club_mode),
      self_score: (_self != null ? _self === '1' : !!S.detail.event.self_score),
      self_score_proof: g('cx-proof') || (S.detail.event.self_score_proof || 'off'),
      scoring_mode: _mode || (S.detail.event.scoring_mode || 'points'),
      accent: _accent || S.detail.event.accent || '#d6353b',
      cover_url: cover || null,
      entry_fee: g('cx-fee'), currency: g('cx-cur'), status: g('cx-status')
    };
    var r; try { r = await sb().rpc('comp_event_save', { p_id: S.eventId, p: p }); } catch (e) { r = { error: e }; }
    if (r && !r.error) {
      try { await sb().rpc('comp_set_stream', { p_event: S.eventId, p_url: g('cx-stream') || '' }); } catch (e) {}
      // Series / Season linking
      try {
        var sv = g('cx-series');
        if (sv !== undefined) {
          var round = parseInt(g('cx-series-round'), 10); if (isNaN(round)) round = null;
          var finals = !!(document.getElementById('cx-series-finals') || {}).checked;
          if (sv === '' ) { await sb().rpc('comp_series_unset_event', { p_event: S.eventId }); }
          else if (sv === '__new') {
            var nm = window.prompt('Name this series / season'); if (nm) {
              var rs = await sb().rpc('comp_series_save', { p_id: null, p: { name: nm, organizer_provider_id: (S.detail.event.organizer_provider_id || null), status: 'open' } });
              if (rs && !rs.error && rs.data) { await sb().rpc('comp_series_set_event', { p_series: rs.data, p_event: S.eventId, p_round: round, p_is_finals: finals }); S.seriesList = null; }
            }
          } else { await sb().rpc('comp_series_set_event', { p_series: sv, p_event: S.eventId, p_round: round, p_is_finals: finals }); }
        }
      } catch (e) { console.error('[comp series]', e); }
      toast('Saved', 'check'); _mode = _accent = _club = _self = null; reload();
    } else { toast('Save failed', 'error'); }
  }

  // Divisions
  function renderDivisions(c) {
    var divs = (S.detail.divisions || []);
    c.innerHTML = '<div class="cx-head"><div class="cx-sub">Each division is individual or a team of N, and has its OWN events.</div>' +
      '<button class="cx-btn pri sm" onclick="FFPComp.editDivision()"><span class="ms">add</span> Add division</button></div>' +
      (divs.length ? divs.map(function (d, i) {
        var meta = (d.team_size > 1 ? 'Teams of ' + d.team_size : 'Individual') + (d.gender ? ' · ' + d.gender : '') + ((d.min_age || d.max_age) ? ' · age ' + (d.min_age || 0) + '–' + (d.max_age || '+') : '') + ' · ' + (d.entrants || 0) + ' entered · ' + ((d.workouts || []).length) + ' events';
        return '<div class="cx-row"><div class="cx-av"><span class="ms" style="font-size:18px">military_tech</span></div>' +
          '<div class="g"><b>' + esc(d.name) + '</b><span>' + esc(meta) + '</span></div>' +
          '<button class="cx-btn sm" onclick="FFPComp.moveDivision(\'' + d.id + '\',-1)"' + (i === 0 ? ' disabled' : '') + ' title="Move up"><span class="ms">arrow_upward</span></button>' +
          '<button class="cx-btn sm" onclick="FFPComp.moveDivision(\'' + d.id + '\',1)"' + (i === divs.length - 1 ? ' disabled' : '') + ' title="Move down"><span class="ms">arrow_downward</span></button>' +
          '<button class="cx-btn sm" onclick="FFPComp.editDivision(\'' + d.id + '\')">Edit</button></div>';
      }).join('') : '<div class="cx-empty">No divisions yet. Add one to start.</div>');
  }
  async function moveDivision(id, dir) {
    var divs = (S.detail.divisions || []).slice();
    var i = divs.findIndex(function (x) { return x.id === id; });
    var j = i + dir;
    if (i < 0 || j < 0 || j >= divs.length) return;
    var tmp = divs[i]; divs[i] = divs[j]; divs[j] = tmp;
    S.detail.divisions = divs; renderTab();
    var ids = divs.map(function (x) { return x.id; });
    var r; try { r = await sb().rpc('comp_divisions_reorder', { p_event: S.eventId, p_ids: ids }); } catch (e) { r = { error: e }; }
    if (!r || r.error) { toast('Reorder failed', 'error'); reload(); }
  }
  // Drag-to-reorder events (desktop console). HTML5 DnD; persists via comp_workouts_reorder.
  function wDragStart(e, id) { S.dragWid = id; try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', id); } catch (_) {} var row = e.target.closest ? e.target.closest('.cx-drow') : null; if (row) setTimeout(function () { row.classList.add('dragging'); }, 0); }
  function wDragOver(e, id) { e.preventDefault(); try { e.dataTransfer.dropEffect = 'move'; } catch (_) {} var row = e.currentTarget; if (row && id !== S.dragWid) row.classList.add('dragover'); }
  function wDragLeave(e) { if (e.currentTarget) e.currentTarget.classList.remove('dragover'); }
  function wDragEnd() { S.dragWid = null; Array.prototype.forEach.call(document.querySelectorAll('.cx-drow'), function (r) { r.classList.remove('dragging'); r.classList.remove('dragover'); }); }
  async function wDrop(e, targetId) {
    e.preventDefault();
    var from = S.dragWid; wDragEnd();
    if (!from || from === targetId) return;
    var div = (S.detail.divisions || []).find(function (d) { return d.id === S.divId; }); if (!div) return;
    var wods = (div.workouts || []).slice();
    var fi = wods.findIndex(function (x) { return x.id === from; });
    var ti = wods.findIndex(function (x) { return x.id === targetId; });
    if (fi < 0 || ti < 0) return;
    var moved = wods.splice(fi, 1)[0];
    wods.splice(ti, 0, moved);
    div.workouts = wods; renderTab();
    var ids = wods.map(function (x) { return x.id; });
    var r; try { r = await sb().rpc('comp_workouts_reorder', { p_division: S.divId, p_ids: ids }); } catch (e2) { r = { error: e2 }; }
    if (!r || r.error) { toast('Reorder failed', 'error'); reload(); } else { toast('Order updated', 'check'); }
  }
  function editDivision(id) {
    var d = (S.detail.divisions || []).find(function (x) { return x.id === id; }) || {};
    var sizes = ''; for (var i = 1; i <= 8; i++) sizes += '<option value="' + i + '"' + ((d.team_size || 1) === i ? ' selected' : '') + '>' + (i === 1 ? 'Individual' : 'Team of ' + i) + '</option>';
    openModal((id ? 'Edit' : 'Add') + ' division',
      '<div class="cx-fld"><div class="cx-lab">Name</div><input id="cd-name" class="cx-in" value="' + esc(d.name || '') + '" placeholder="e.g. RX Women"></div>' +
      '<div class="cx-fld"><div class="cx-lab">Type</div><select id="cd-size" class="cx-sel">' + sizes + '</select></div>' +
      '<div class="cx-2"><div class="cx-fld"><div class="cx-lab">Gender (optional)</div><select id="cd-gender" class="cx-sel"><option value="">Open</option>' +
        (((window.FFP_TAX && window.FFP_TAX.genders) || ['Female', 'Male']).filter(function (g) { return g !== 'Prefer not to say'; })).map(function (x) { return '<option' + (d.gender === x ? ' selected' : '') + '>' + x + '</option>'; }).join('') + '</select></div>' +
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
        return '<div class="cx-row cx-drow" draggable="true" data-wid="' + w.id + '"' +
          ' ondragstart="FFPComp.wDragStart(event,\'' + w.id + '\')" ondragover="FFPComp.wDragOver(event,\'' + w.id + '\')" ondragleave="FFPComp.wDragLeave(event)" ondrop="FFPComp.wDrop(event,\'' + w.id + '\')" ondragend="FFPComp.wDragEnd(event)">' +
          '<span class="ms cx-drag" title="Drag to reorder">drag_indicator</span>' +
          '<div class="cx-av"><span class="ms" style="font-size:18px">fitness_center</span></div>' +
          '<div class="g"><b>Event ' + (i + 1) + ' · ' + esc(w.name) + '</b><span>' + esc(meta) + '</span></div>' +
          '<button class="cx-btn sm" onclick="FFPComp.editWorkout(\'' + w.id + '\')">Edit</button></div>';
      }).join('') + '<div class="cx-sub" style="margin-top:8px">Drag <span class="ms" style="font-size:14px;vertical-align:-2px">drag_indicator</span> to reorder events.</div>' : '<div class="cx-empty">No events in this division yet.</div>'));
  }
  function editWorkout(id) {
    var div = (S.detail.divisions || []).find(function (d) { return d.id === S.divId; }); if (!div) return;
    var w = (div.workouts || []).find(function (x) { return x.id === id; }) || {};
    var types = ['time', 'reps', 'weight', 'distance', 'points'];
    var cap = w.cap_seconds ? Math.floor(w.cap_seconds / 60) : '';
    var allDivs = (S.detail.divisions || []);
    var multi = !id && allDivs.length > 1 ?
      '<div class="cx-fld"><div class="cx-lab">Add this event to</div><div id="cw-divs" style="display:flex;flex-direction:column;gap:8px">' +
        allDivs.map(function (d) { return '<label style="display:flex;align-items:center;gap:9px;font-weight:700;font-size:14px;color:#12232f;cursor:pointer"><input type="checkbox" value="' + d.id + '"' + (d.id === S.divId ? ' checked' : '') + ' style="width:18px;height:18px">' + esc(d.name) + '</label>'; }).join('') +
        '</div><div class="cx-sub" style="margin-top:6px">Tick every division this event runs in — it\'s added to each. Scores are still entered per division.</div></div>' : '';
    // Editing: let the organiser COPY this event into other divisions (a fresh copy each — scores stay per division).
    var others = allDivs.filter(function (d) { return d.id !== S.divId; });
    var copy = id && others.length ?
      '<div class="cx-fld"><div class="cx-lab">Copy this event to other divisions</div><div id="cw-copy" style="display:flex;flex-direction:column;gap:8px">' +
        others.map(function (d) { return '<label style="display:flex;align-items:center;gap:9px;font-weight:700;font-size:14px;color:#12232f;cursor:pointer"><input type="checkbox" value="' + d.id + '" style="width:18px;height:18px">' + esc(d.name) + (d.team_size > 1 ? ' (teams of ' + d.team_size + ')' : '') + '</label>'; }).join('') +
        '</div><div class="cx-sub" style="margin-top:6px">Ticked divisions get their own copy of this event (name + details above). Save your edits and the copies in one go.</div></div>' : '';
    // transient media/sponsor state for this modal
    S.cw = { banner: w.banner_url || '', imgs: (Array.isArray(w.image_urls) ? w.image_urls.slice() : []), sponLogo: w.sponsor_logo_url || '' };
    var pw = (w.points_weight != null && Number(w.points_weight) !== 1) ? w.points_weight : '';
    openModal((id ? 'Edit' : 'Add') + ' event — ' + esc(div.name),
      '<div class="cx-fld"><div class="cx-lab">Name</div><input id="cw-name" class="cx-in" value="' + esc(w.name || '') + '" placeholder="e.g. Fran"></div>' +
      '<div class="cx-fld"><div class="cx-lab">Description (optional)</div><textarea id="cw-desc" class="cx-in" rows="3" placeholder="Movements, reps, standards…">' + esc(w.description || '') + '</textarea></div>' +
      '<div class="cx-2"><div class="cx-fld"><div class="cx-lab">Scored in</div><select id="cw-type" class="cx-sel" onchange="FFPComp.typeHint(this.value)">' +
        types.map(function (t) { return '<option value="' + t + '"' + ((w.score_type || 'time') === t ? ' selected' : '') + '>' + t + '</option>'; }).join('') + '</select></div>' +
      '<div class="cx-fld"><div class="cx-lab">Winner</div><select id="cw-dir" class="cx-sel">' +
        '<option value="asc"' + (w.direction === 'asc' ? ' selected' : '') + '>Lower wins (time)</option>' +
        '<option value="desc"' + (w.direction === 'desc' ? ' selected' : '') + '>Higher wins (reps/weight)</option></select></div></div>' +
      '<div class="cx-fld"><div class="cx-lab">Time cap minutes (optional)</div><input id="cw-cap" type="number" class="cx-in" value="' + cap + '" style="max-width:160px"></div>' +
      '<div class="cx-fld"><div class="cx-lab">Points weighting (optional)</div><input id="cw-pw" type="number" step="0.1" class="cx-in" value="' + pw + '" placeholder="1" style="max-width:160px"><div class="cx-sub" style="margin-top:6px">Multiplies this event\'s points (e.g. 2 = worth double). Leave blank for normal.</div></div>' +
      '<div id="cw-media">' + cwMediaHtml() + '</div>' +
      '<div class="cx-fld"><div class="cx-lab">Explainer video link (optional)</div><input id="cw-video" class="cx-in" value="' + esc(w.video_url || '') + '" placeholder="YouTube / Vimeo link"></div>' +
      '<div class="cx-fld"><div class="cx-lab">Event sponsor (optional)</div><input id="cw-spon-name" class="cx-in" value="' + esc(w.sponsor_name || '') + '" placeholder="Sponsor name" style="margin-bottom:8px">' +
        '<div id="cw-spon-media">' + cwSponHtml() + '</div>' +
        '<input id="cw-spon-url" class="cx-in" value="' + esc(w.sponsor_url || '') + '" placeholder="Sponsor link (optional)" style="margin-top:8px"></div>' +
      multi + copy,
      '<button class="cx-btn" onclick="FFPComp.closeModal()">Cancel</button><button class="cx-btn pri" onclick="FFPComp.saveWorkout(\'' + (id || '') + '\')">Save</button>');
  }
  // ---- event media (banner + gallery) + sponsor logo, rendered from S.cw ----
  function cwMediaHtml() {
    var cw = S.cw || { banner: '', imgs: [] };
    var banner = cw.banner
      ? '<div style="height:120px;border-radius:12px;background:#eef2f5 center/cover no-repeat;background-image:url(\'' + esc(cw.banner) + '\');position:relative"><button class="cx-btn sm" style="position:absolute;top:8px;right:8px" onclick="FFPComp.cwBanner()">Change</button></div>'
      : '<button class="cx-btn" onclick="FFPComp.cwBanner()"><span class="ms">image</span> Add banner</button>';
    var imgs = (cw.imgs || []).map(function (u, i) {
      return '<div style="position:relative;flex:none"><img src="' + esc(u) + '" style="width:84px;height:64px;object-fit:cover;border-radius:9px"><button onclick="FFPComp.cwRmImg(' + i + ')" style="position:absolute;top:-6px;right:-6px;width:20px;height:20px;border-radius:50%;border:none;background:#e0553f;color:#fff;font-weight:900;cursor:pointer">&times;</button></div>';
    }).join('');
    return '<div class="cx-fld"><div class="cx-lab">Event banner (optional)</div>' + banner + '<div class="cx-sub" style="margin-top:6px">The hero image at the top of the event in the app. Clean landscape, no text.</div></div>' +
      '<div class="cx-fld"><div class="cx-lab">Description images (optional)</div><div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">' + imgs +
        '<button class="cx-btn sm" onclick="FFPComp.cwAddImg()"><span class="ms">add_photo_alternate</span> Add</button></div></div>';
  }
  function cwSponHtml() {
    var cw = S.cw || {};
    return cw.sponLogo
      ? '<div style="display:flex;align-items:center;gap:10px"><img src="' + esc(cw.sponLogo) + '" style="height:44px;max-width:150px;object-fit:contain;background:#fff;border:1px solid #eef2f5;border-radius:8px;padding:4px"><button class="cx-btn sm" onclick="FFPComp.cwSpon()">Change</button><button class="cx-btn sm" onclick="FFPComp.cwRmSpon()">Remove</button></div>'
      : '<button class="cx-btn sm" onclick="FFPComp.cwSpon()"><span class="ms">image</span> Add sponsor logo</button>';
  }
  function _cwRefresh() { var m = document.getElementById('cw-media'); if (m) m.innerHTML = cwMediaHtml(); var s = document.getElementById('cw-spon-media'); if (s) s.innerHTML = cwSponHtml(); }
  function cwBanner() { if (!window.FFPUpload) { toast('Upload unavailable', 'error'); return; } FFPUpload.pick({ bucket: 'listing-covers', key: 'cw-ban-' + S.eventId + '-' + Date.now(), title: 'Event banner', onDone: function (u) { S.cw.banner = u; _cwRefresh(); } }); }
  function cwAddImg() { if (!window.FFPUpload) { toast('Upload unavailable', 'error'); return; } FFPUpload.pick({ bucket: 'listing-covers', key: 'cw-img-' + S.eventId + '-' + Date.now(), title: 'Description image', onDone: function (u) { S.cw.imgs = (S.cw.imgs || []); S.cw.imgs.push(u); _cwRefresh(); } }); }
  function cwRmImg(i) { S.cw.imgs.splice(i, 1); _cwRefresh(); }
  function cwSpon() { if (!window.FFPUpload) { toast('Upload unavailable', 'error'); return; } FFPUpload.pick({ bucket: 'event-sponsors', key: 'cw-spon-' + S.eventId + '-' + Date.now(), title: 'Sponsor logo', onDone: function (u) { S.cw.sponLogo = u; _cwRefresh(); } }); }
  function cwRmSpon() { S.cw.sponLogo = ''; _cwRefresh(); }
  function typeHint(t) { var d = document.getElementById('cw-dir'); if (!d) return; d.value = (t === 'time') ? 'asc' : 'desc'; }
  async function saveWorkout(id) {
    var g = function (x) { var e = document.getElementById(x); return e ? e.value : ''; };
    var capMin = parseInt(g('cw-cap'), 10);
    var pwv = parseFloat(g('cw-pw'));
    var cw = S.cw || {};
    var p = { name: g('cw-name'), description: g('cw-desc') || null, score_type: g('cw-type'), direction: g('cw-dir'), cap_seconds: isNaN(capMin) ? null : capMin * 60,
      points_weight: (isNaN(pwv) || pwv <= 0) ? 1 : pwv,
      banner_url: cw.banner || null, image_urls: (cw.imgs || []), video_url: g('cw-video') || null,
      sponsor_name: g('cw-spon-name') || null, sponsor_logo_url: cw.sponLogo || null, sponsor_url: g('cw-spon-url') || null };
    if (!p.name) { toast('Name the event'); return; }
    // New event can be allocated to multiple divisions at once
    var targets = [S.divId];
    if (!id) {
      var box = document.getElementById('cw-divs');
      if (box) {
        targets = Array.prototype.slice.call(box.querySelectorAll('input:checked')).map(function (c) { return c.value; });
        if (!targets.length) targets = [S.divId];
      }
    }
    var ok = true;
    for (var i = 0; i < targets.length; i++) {
      var r; try { r = await sb().rpc('comp_workout_save', { p_division: targets[i], p_id: id || null, p: p }); } catch (e) { r = { error: e }; }
      if (!r || r.error) ok = false;
    }
    // Editing: also COPY into any ticked other divisions (fresh event each, p_id null)
    var copied = 0;
    if (id) {
      var cbox = document.getElementById('cw-copy');
      if (cbox) {
        var copyTargets = Array.prototype.slice.call(cbox.querySelectorAll('input:checked')).map(function (c) { return c.value; });
        for (var j = 0; j < copyTargets.length; j++) {
          var rc; try { rc = await sb().rpc('comp_workout_save', { p_division: copyTargets[j], p_id: null, p: p }); } catch (e) { rc = { error: e }; }
          if (!rc || rc.error) ok = false; else copied++;
        }
      }
    }
    if (ok) {
      var msg = copied ? ('Saved · copied to ' + copied + ' division' + (copied === 1 ? '' : 's')) : (targets.length > 1 ? 'Added to ' + targets.length + ' divisions' : 'Saved');
      toast(msg, 'check'); closeModal(); reload();
    } else { toast('Save failed', 'error'); }
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
      var tag = a.is_member ? ' · FFP member' : (a.status === 'invited' ? ' · invited' + (a.invite_email ? ' · ' + esc(a.invite_email) : '') : ' · manual');
      return '<div class="cx-row">' + av + '<div class="g"><b>' + esc(a.name) + '</b><span>#' + (a.athlete_no || '—') + ' · ' + esc(a.status || '') + tag + '</span></div></div>';
    }).join('') : '<div class="cx-empty">No athletes yet. Members register themselves in the FFP App, or add them here.</div>';
  }
  var _caT = null;
  function addAthlete() {
    openModal('Add athlete',
      '<div class="cx-sub" style="margin-bottom:14px">Everyone on the platform has an FFP account. Search for the member to link their real profile — or invite someone new by email and they\'ll be entered as soon as they sign up.</div>' +
      '<div class="cx-fld"><div class="cx-lab">Find an FFP member</div><input id="ca-search" class="cx-in" placeholder="Search by name or email" oninput="FFPComp.searchAthlete(this.value)" autocomplete="off"></div>' +
      '<div id="ca-results"></div>' +
      '<div style="height:1px;background:var(--ffp-border,#e7ecf0);margin:22px 0"></div>' +
      '<div class="cx-lab" style="font-size:13px;font-weight:900;color:#12232f">Not on FFP yet? Invite them</div>' +
      '<div class="cx-sub" style="margin:2px 0 12px">They\'re entered now and emailed a link to create a free account. Their entry links automatically when they sign up with that email.</div>' +
      '<div class="cx-fld"><div class="cx-lab">Name</div><input id="ca-inv-name" class="cx-in" placeholder="e.g. Sarah King"></div>' +
      '<div class="cx-fld"><div class="cx-lab">Email</div><input id="ca-inv-email" type="email" class="cx-in" placeholder="name@email.com"></div>',
      '<button class="cx-btn" onclick="FFPComp.closeModal()">Cancel</button><button class="cx-btn pri" onclick="FFPComp.inviteAthlete()"><span class="ms">mail</span> Invite &amp; email</button>');
  }
  function searchAthlete(q) {
    var box = document.getElementById('ca-results'); if (!box) return;
    clearTimeout(_caT);
    q = (q || '').trim();
    if (q.length < 2) { box.innerHTML = ''; return; }
    box.innerHTML = '<div class="cx-empty" style="padding:14px">Searching…</div>';
    _caT = setTimeout(async function () {
      var r; try { r = await sb().rpc('comp_member_search', { p_event: S.eventId, p_q: q }); } catch (e) { r = { error: e }; }
      var rows = (r && !r.error && Array.isArray(r.data)) ? r.data : [];
      if (!rows.length) { box.innerHTML = '<div class="cx-empty" style="padding:14px">No members found. Invite them below.</div>'; return; }
      box.innerHTML = rows.map(function (m) {
        var av = m.photo ? '<span class="cx-av" style="background-image:url(\'' + esc(m.photo) + '\')"></span>' : '<span class="cx-av">' + esc((m.name || '?').slice(0, 1).toUpperCase()) + '</span>';
        var sub = [m.city, m.email_hint].filter(Boolean).join(' · ');
        return '<div class="cx-row">' + av + '<div class="g"><b>' + esc(m.name) + '</b><span>' + esc(sub) + '</span></div>' +
          '<button class="cx-btn pri sm" onclick="FFPComp.linkAthlete(\'' + m.id + '\',this)">Add</button></div>';
      }).join('');
    }, 280);
  }
  async function linkAthlete(memberId, btn) {
    if (btn) { btn.disabled = true; btn.textContent = 'Adding…'; }
    var div = (S.detail.divisions || []).find(function (d) { return d.id === S.divId; });
    var p = { division_id: S.divId, kind: (div && div.team_size > 1) ? 'team' : 'individual', member_id: memberId, status: 'registered' };
    var r; try { r = await sb().rpc('comp_entrant_add', { p_event: S.eventId, p: p }); } catch (e) { r = { error: e }; }
    if (r && !r.error) { toast('Added', 'check'); closeModal(); reload().then(function () { FFPComp.tab('athletes'); }); }
    else { toast('Could not add', 'error'); if (btn) { btn.disabled = false; btn.textContent = 'Add'; } }
  }
  async function inviteAthlete() {
    var name = ((document.getElementById('ca-inv-name') || {}).value || '').trim();
    var email = ((document.getElementById('ca-inv-email') || {}).value || '').trim();
    if (!name) { toast('Enter a name'); return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { toast('Enter a valid email'); return; }
    var refresh = (window.FFPAuth && FFPAuth.getRefresh && FFPAuth.getRefresh()) || null;
    if (!refresh) { toast('Please sign in again', 'error'); return; }
    var d = null;
    try {
      var res = await fetch('https://ffp-passport-backend.vercel.app/api/comp/invite-athlete', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh: refresh, event_id: S.eventId, division_id: S.divId, name: name, email: email })
      });
      d = await res.json().catch(function () { return {}; });
    } catch (e) { d = { error: 'network' }; }
    if (d && d.ok) {
      toast(d.already ? 'Already entered' : d.linked ? 'Member linked' : 'Invited — email sent', 'check');
      closeModal(); reload().then(function () { FFPComp.tab('athletes'); });
    } else { toast((d && d.error) || 'Could not invite', 'error'); }
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
    box.innerHTML = '<div class="cx-sub" style="margin-bottom:8px">Enter each score in <b>' + esc(unit) + '</b> (' + (w.direction === 'asc' ? 'lower wins' : 'higher wins') + '). Save recalculates the leaderboard. <b>SELF</b> = the athlete entered it themselves — you can edit, hide or clear any score.</div>' +
      '<div class="cx-sc head"><span>#</span><span>Athlete</span><span style="text-align:center">Score</span><span style="text-align:center">Proof</span><span style="text-align:center">Show</span></div>' +
      rows.map(function (a) {
        var av = a.photo ? '<span class="cx-av" style="width:26px;height:26px;background-image:url(\'' + esc(a.photo) + '\')"></span>' : '<span class="cx-av" style="width:26px;height:26px">' + esc((a.name || '?').slice(0, 1).toUpperCase()) + '</span>';
        var proof = a.proof_url ? '<a href="' + esc(a.proof_url) + '" target="_blank" rel="noopener" style="color:#1980ad;font-weight:800;font-size:11px">View</a>' : (a.source === 'self' ? '<span style="font-size:10px;font-weight:800;color:#8a99a8">SELF</span>' : '');
        var hide = (a.raw != null) ? '<button class="cx-btn sm" style="padding:5px 9px" onclick="FFPComp.toggleHide(\'' + a.entrant_id + '\',' + (a.hidden ? 'false' : 'true') + ')">' + (a.hidden ? 'Show' : 'Hide') + '</button>' : '';
        return '<div class="cx-sc"' + (a.hidden ? ' style="opacity:.5"' : '') + '><span style="text-align:center;font-weight:800;color:var(--ffp-text-muted)">' + (a.athlete_no || '') + '</span>' +
          '<span style="display:flex;align-items:center;gap:8px;min-width:0">' + av + '<b style="font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(a.name) + '</b></span>' +
          '<input id="cs-' + a.entrant_id + '" type="number" step="any" value="' + (a.raw != null ? a.raw : '') + '" placeholder="—">' +
          '<span style="text-align:center">' + proof + '</span><span style="text-align:center">' + hide + '</span></div>';
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
  // Clubs standings (club championship)
  async function renderClubs(c) {
    c.innerHTML = '<div class="cx-sub" style="margin-bottom:12px">Clubs ranked by their entries\' final positions across every division (1st = 1 point, 2nd = 2 …) — lowest total wins. Updates live as scores go in.</div><div id="cx-clubs"><div class="cx-empty">Loading…</div></div>';
    var r; try { r = await sb().rpc('comp_club_leaderboard', { p_event: S.eventId }); } catch (e) { r = { error: e }; }
    var clubs = (r && !r.error && r.data && Array.isArray(r.data.clubs)) ? r.data.clubs : [];
    var box = document.getElementById('cx-clubs'); if (!box) return;
    if (!clubs.length) { box.innerHTML = '<div class="cx-empty">No club points yet — they appear once entries are linked to a club and scored.</div>'; return; }
    var ordn = function (n) { var s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
    box.innerHTML = clubs.map(function (cl) {
      var lg = cl.logo ? '<span class="cx-av" style="width:40px;height:40px;border-radius:11px;background-image:url(\'' + esc(cl.logo) + '\')"></span>' : '<span class="cx-av" style="width:40px;height:40px;border-radius:11px">' + esc((cl.name || '?').slice(0, 1).toUpperCase()) + '</span>';
      var entries = (cl.rows || []).map(function (e) {
        return '<div style="display:flex;align-items:center;gap:10px;padding:7px 0 7px 52px;border-top:1px solid var(--ffp-border)">' +
          '<div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:700;color:#222">' + esc(e.entry) + '</div><div style="font-size:11px;color:#2ba8e0;font-weight:600">' + esc(e.division) + '</div></div>' +
          '<div style="text-align:right;white-space:nowrap"><b style="font-size:15px;font-weight:800;color:#222">' + e.points + '</b> <span style="font-size:11px;color:#222">' + ordn(e.rank) + '</span></div></div>';
      }).join('');
      return '<div class="cx-row" style="border-bottom:none;align-items:center">' +
        '<span class="rk" style="width:24px;text-align:center;font-size:17px;font-weight:700;color:#222">' + cl.rank + '</span>' + lg +
        '<div class="g"><b>' + esc(cl.name) + '</b><span>' + esc([cl.city, (cl.entries || 0) + ' entries'].filter(Boolean).join(' · ')) + '</span></div>' +
        '<div style="text-align:right"><b style="display:block;font-size:18px;font-weight:800;color:#222">' + cl.total + '</b><span style="font-size:10px;text-transform:uppercase;letter-spacing:.4px;color:#9aa8b4;font-weight:700">points</span></div></div>' +
        entries;
    }).join('');
  }
  async function setStatus(st, msg) {
    var r; try { r = await sb().rpc('comp_event_save', { p_id: S.eventId, p: { status: st } }); } catch (e) { r = { error: e }; }
    if (r && !r.error) { toast(msg, 'check'); reload().then(function () { FFPComp.tab('standings'); }); } else { toast('Failed', 'error'); }
  }
  function publish() { setStatus('live', 'Published — now live in the FFP App'); }
  function finalise() { setStatus('final', 'Marked final'); }
  async function toggleHide(entrant, on) {
    var r; try { r = await sb().rpc('comp_score_hide', { p_workout: S.wodId, p_entrant: entrant, p_on: on }); } catch (e) { r = { error: e }; }
    if (!r || !r.error) { toast(on ? 'Hidden from leaderboard' : 'Shown', 'check'); renderTab(); } else { toast('Failed', 'error'); }
  }

  // modal
  function openModal(title, body, foot) {
    closeModal();
    var bk = document.createElement('div'); bk.className = 'cx-mbk'; bk.id = 'cx-mbk';
    bk.innerHTML = '<div class="cx-modal"><div class="cx-mhead"><button class="cx-mback" onclick="FFPComp.closeModal()" aria-label="Back"><span class="ms">arrow_back</span></button><h3>' + esc(title) + '</h3></div>' + body + '<div class="cx-mfoot">' + foot + '</div></div>';
    document.body.appendChild(bk);
  }
  function closeModal() { var b = document.getElementById('cx-mbk'); if (b) b.remove(); }

  // ---------- HEATS & LANES ----------
  async function renderHeats(c) {
    var div = (S.detail.divisions || []).find(function (d) { return d.id === S.divId; });
    var wods = div ? (div.workouts || []) : [];
    if (!S.wodId || !wods.some(function (w) { return w.id === S.wodId; })) S.wodId = wods[0] ? wods[0].id : null;
    var wodSel = wods.length ? '<select class="cx-sel" onchange="FFPComp.setWod(this.value)">' + wods.map(function (w) { return '<option value="' + w.id + '"' + (w.id === S.wodId ? ' selected' : '') + '>' + esc(w.name) + '</option>'; }).join('') + '</select>' : '';
    var w = wods.find(function (x) { return x.id === S.wodId; });
    var lanes = (w && w.lanes) || S._lanes || 8;
    var mode = S._heatMode || 'position';
    c.innerHTML = '<div class="cx-toolbar">' + divPickerHtml('FFPComp.setDiv(this.value)') + wodSel + '</div>'
      + (!S.wodId ? '<div class="cx-empty">Add an event to this division first.</div>'
        : '<div class="cx-toolbar"><span style="font-size:12px;font-weight:800;color:#43525c">Lanes</span><input class="cx-in" id="cx-lanes" value="' + lanes + '" style="width:60px">'
          + '<span style="font-size:12px;font-weight:800;color:#43525c;margin-left:6px">Seed by</span><div class="cx-seg" id="cx-hmode"><button data-v="position" class="' + (mode === 'position' ? 'on' : '') + '" onclick="FFPComp.hmode(this)">Current position</button><button data-v="random" class="' + (mode === 'random' ? 'on' : '') + '" onclick="FFPComp.hmode(this)">Random</button></div>'
          + '<span style="flex:1"></span><button class="cx-btn pri sm" onclick="FFPComp.genHeats()"><span class="ms">auto_awesome</span> Generate</button></div><div id="cx-heats"><div class="cx-empty">Loading…</div></div>');
    if (!S.wodId) return;
    var hr; try { hr = await sb().rpc('comp_heats_view', { p_workout: S.wodId }); } catch (e) { hr = { error: e }; }
    var heats = (hr && hr.data) || [];
    var jr = await sb().rpc('comp_judges_list', { p_event: S.eventId }); var judges = (jr && jr.data) || [];
    var host = document.getElementById('cx-heats');
    if (!heats.length) { host.innerHTML = '<div class="cx-empty">No heats yet — set lanes and Generate.</div>'; return; }
    var jOpts = function (sel) { return '<option value="">Judge…</option>' + judges.map(function (j) { return '<option value="' + j.member_id + '"' + (sel === j.member_id ? ' selected' : '') + '>' + esc(j.name) + '</option>'; }).join(''); };
    host.innerHTML = heats.map(function (h) {
      var t = h.start_at ? new Date(h.start_at) : null; var tv = t ? (('0' + t.getHours()).slice(-2) + ':' + ('0' + t.getMinutes()).slice(-2)) : '';
      var laneOpts = function (cur) { var o = ''; for (var i = 1; i <= lanes; i++) o += '<option value="' + i + '"' + (i === cur ? ' selected' : '') + '>Lane ' + i + '</option>'; return o; };
      var rows = (h.lanes || []).map(function (l) {
        return '<div class="cx-lrow"><span class="ln">' + l.lane + '</span><span class="pl">' + (l.pos != null ? '#' + l.pos : '') + '</span><b>' + esc(l.name || 'Athlete') + '</b>'
          + '<select class="cx-sel sm" onchange="FFPComp.heatMove(\'' + h.id + '\',\'' + l.entrant_id + '\',this.value)">' + laneOpts(l.lane) + '</select></div>';
      }).join('');
      return '<div class="cx-heath" data-h="' + h.id + '"><b>' + esc(h.name) + '</b>' + (h.ord === heats.length ? '<span class="fin">FINAL</span>' : '')
        + '<span class="r"><input class="cx-in sm" type="time" value="' + tv + '" onchange="FFPComp.heatSet(\'' + h.id + '\')"><select class="cx-sel sm cx-hjudge" onchange="FFPComp.heatSet(\'' + h.id + '\')">' + jOpts(h.judge_id) + '</select></span></div>' + rows;
    }).join('');
  }
  function hmode(btn) { document.querySelectorAll('#cx-hmode button').forEach(function (b) { b.classList.remove('on'); }); btn.classList.add('on'); S._heatMode = btn.getAttribute('data-v'); }
  async function genHeats() {
    var lanes = +((document.getElementById('cx-lanes') || {}).value) || 8;
    var mode = S._heatMode || 'position'; S._lanes = lanes;
    var r; try { r = await sb().rpc('comp_heats_generate', { p_workout: S.wodId, p_lanes: lanes, p_mode: mode }); } catch (e) { r = { error: e }; }
    if (r.error) { toast('Could not generate', 'error'); return; } toast((r.data || 0) + ' heats created', 'success'); renderTab();
  }
  async function heatMove(heat, entrant, lane) { await sb().rpc('comp_heat_lane_move', { p_heat: heat, p_lane: +lane, p_entrant: entrant }); renderTab(); }
  async function heatSet(heat) {
    var row = document.querySelector('.cx-heath[data-h="' + heat + '"]'); if (!row) return;
    var tv = (row.querySelector('input[type=time]') || {}).value, jid = (row.querySelector('.cx-hjudge') || {}).value || null;
    var base = (S.detail.event && S.detail.event.starts_at) || new Date().toISOString().slice(0, 10);
    var when = tv ? new Date(base + 'T' + tv + ':00').toISOString() : null;
    await sb().rpc('comp_heat_set', { p_heat: heat, p_start: when, p_judge: jid }); toast('Saved', 'success');
  }

  // ---------- JUDGES ----------
  async function renderJudges(c) {
    c.innerHTML = '<div class="cx-sub" style="margin-bottom:12px">Judges enter scores from their own login. Add by their FFP account email.</div>'
      + '<div class="cx-toolbar"><input class="cx-in" id="cx-jemail" placeholder="Judge\'s FFP email" style="flex:1;min-width:180px"><button class="cx-btn pri sm" onclick="FFPComp.addJudge()"><span class="ms">add</span> Add judge</button></div><div id="cx-judges"><div class="cx-empty">Loading…</div></div>';
    var r; try { r = await sb().rpc('comp_judges_list', { p_event: S.eventId }); } catch (e) { r = { error: e }; }
    var rows = (r && r.data) || []; var host = document.getElementById('cx-judges');
    host.innerHTML = rows.length ? rows.map(function (j) {
      return '<div class="cx-row"><span class="cx-av" style="' + (j.photo ? 'background-image:url(\'' + esc(j.photo) + '\')' : '') + '">' + (j.photo ? '' : esc((j.name || '?').slice(0, 1))) + '</span><div class="g"><b>' + esc(j.name) + '</b><span>' + esc(j.email || '') + ' · can score</span></div><span class="ms" style="color:#9aa8b4;cursor:pointer" onclick="FFPComp.removeJudge(\'' + j.member_id + '\')">close</span></div>';
    }).join('') : '<div class="cx-empty">No judges yet.</div>';
  }
  async function addJudge() {
    var em = (document.getElementById('cx-jemail') || {}).value; if (!em) return;
    var r; try { r = await sb().rpc('comp_judge_add', { p_event: S.eventId, p_email: em, p_name: null }); } catch (e) { r = { error: e }; }
    if (r.error || (r.data && r.data.error)) { toast('No FFP account with that email', 'error'); return; } toast('Judge added', 'success'); renderTab();
  }
  async function removeJudge(mid) { await sb().rpc('comp_judge_remove', { p_event: S.eventId, p_member: mid }); renderTab(); }

  // actions
  function setDiv(v) { S.divId = v; S.wodId = null; renderTab(); }
  function setWod(v) { S.wodId = v; renderTab(); }
  function tab(t) { S.tab = t; document.querySelectorAll('.cx-editnav button').forEach(function (b) { b.classList.remove('on'); }); var el = document.querySelector('.cx-editnav button[onclick*="\'' + t + '\'"]'); if (el) el.classList.add('on'); renderTab(); }

  window.FFPComp = { list: renderList, create: create, open: open, tab: tab, setDiv: setDiv, setWod: setWod,
    saveDetails: saveDetails, seriesPick: seriesPick, pickMode: pickMode, pickAccent: pickAccent, pickClub: pickClub, pickSelf: pickSelf, toggleHide: toggleHide,
    editDivision: editDivision, saveDivision: saveDivision, moveDivision: moveDivision,
    editWorkout: editWorkout, saveWorkout: saveWorkout, wDragStart: wDragStart, wDragOver: wDragOver, wDragLeave: wDragLeave, wDrop: wDrop, wDragEnd: wDragEnd, typeHint: typeHint,
    cwBanner: cwBanner, cwAddImg: cwAddImg, cwRmImg: cwRmImg, cwSpon: cwSpon, cwRmSpon: cwRmSpon,
    addAthlete: addAthlete, searchAthlete: searchAthlete, linkAthlete: linkAthlete, inviteAthlete: inviteAthlete, saveScores: saveScores,
    hmode: hmode, genHeats: genHeats, heatMove: heatMove, heatSet: heatSet, addJudge: addJudge, removeJudge: removeJudge,
    publish: publish, finalise: finalise, closeModal: closeModal };
  window.ffpRenderCompetitions = renderList;
})();
