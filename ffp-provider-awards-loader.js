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
  s.textContent = [
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
    '#panel-awards .aw-empty{padding:30px 0;color:#566069;font-size:13px;font-weight:600;}'
  ].join('\n');
  document.head.appendChild(s);
})();

// ── entry point ─────────────────────────────────────────────────────────
async function renderAwards() {
  var host = document.getElementById('awards-host');
  if (!host) return;
  if (!_awPid()) { host.innerHTML = '<div class="aw-empty">Sign in to manage awards.</div>'; return; }
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

// Scope: a governing body runs their own city or country. Anything spanning
// countries is FFP's to run, so Region is only offered on an official programme
// and the database refuses it either way.
var _awOfficial = false;
function awScopeChanged() {
  var v = (document.getElementById('aw-np-scope') || {}).value || 'city';
  ['city', 'country', 'region'].forEach(function (k) {
    var row = document.getElementById('aw-np-' + k + '-row');
    if (row) row.style.display = (v === k) ? '' : 'none';
  });
}

async function awNewProgramme() {
  var T = await _awTaxReady();
  var cities = (typeof T.allCities === 'function') ? T.allCities() : [];
  var regions = _awOfficial ? await _awRegionList() : [];
  var countries = _awCountries(T);
  var body =
    '<div class="field"><div class="label">Programme name</div>' +
    '<input class="input" id="aw-np-name" placeholder="Padel Awards 2026" autocomplete="off"></div>' +
    '<div class="field"><div class="label">Activity</div>' +
    '<select class="input" id="aw-np-activity">' + _awOpts(T.activities, '', 'Select an activity') + '</select></div>' +
    '<div class="field"><div class="label">Category</div>' +
    '<select class="input" id="aw-np-category">' + _awOpts(T.categories, '', 'Select a category') + '</select></div>' +
    '<div class="field"><div class="label">How wide is it</div>' +
    '<select class="input" id="aw-np-scope" onchange="awScopeChanged()">' +
      '<option value="city">One city</option>' +
      '<option value="country">A whole country</option>' +
      (_awOfficial ? '<option value="region">A region, several countries</option>' : '') +
    '</select></div>' +
    '<div class="field" id="aw-np-city-row"><div class="label">City</div>' +
    '<select class="input" id="aw-np-city">' + _awOpts(cities, '', 'Select a city') + '</select></div>' +
    '<div class="field" id="aw-np-country-row" style="display:none;"><div class="label">Country</div>' +
    '<select class="input" id="aw-np-country">' + _awOpts(countries, '', 'Select a country') + '</select></div>' +
    '<div class="field" id="aw-np-region-row" style="display:none;"><div class="label">Region</div>' +
    '<select class="input" id="aw-np-region">' + _awOpts(regions, '', 'Select a region') + '</select></div>' +
    '<div class="psub" style="margin:12px 0 0;">' +
      (_awOfficial ? 'Categories, criteria and dates come next.'
                   : 'A partner programme covers one city or one country. Regional awards are run by FFP.') +
    ' Nothing is visible to members until you publish it.</div>';
  openModalShell('sm', 'New awards programme', body,
    '<button class="btn btn-outline" onclick="closeModal()">Cancel</button>' +
    '<button class="btn btn-pri" onclick="awCreateProgramme()">Create</button>');
}

async function awCreateProgramme() {
  var g = function (x) { return ((document.getElementById(x) || {}).value || '').trim(); };
  var name = g('aw-np-name');
  if (!name) { showToast('Give the programme a name', 'error'); return; }
  try {
    var r = await window.supabase.rpc('award_programme_save',
      { p_programme: null, p_provider: _awPid(), p_patch: {
          name: name, scope: g('aw-np-scope') || 'city',
          city: g('aw-np-city'), country: g('aw-np-country'), region: g('aw-np-region'),
          activity: g('aw-np-activity'), category: g('aw-np-category'),
          year: new Date().getFullYear() } });
    if (r.error) throw r.error;
    closeModal();
    showToast('Programme created', 'success');
    await awOpen(r.data);
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

  var h = '<div style="display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap;">' +
    '<div><button class="btn btn-sec btn-sm" onclick="awBackToList()"><span class="ms">arrow_back</span> All programmes</button>' +
    '<div class="ph" style="margin:10px 0 0;">' + _awEsc(pr.name) + '</div>' +
    '<div class="psub" style="margin:5px 0 0;">' + (d.categories || []).length + ' categories, ' + total + ' entries</div></div>' +
    '<div style="display:flex;gap:9px;flex-wrap:wrap;">' +
      (pr.status !== 'published'
        ? '<button class="btn btn-pri" onclick="awPublish()">Publish programme</button>'
        : '<button class="btn btn-sec" onclick="awAddCategory()"><span class="ms">add</span> Category</button>') +
      '<button class="btn btn-sec" onclick="awOpenJudge()"><span class="ms">gavel</span> Judging</button>' +
    '</div></div>';

  h += '<div class="aw-key" style="margin-top:18px;">' +
    '<div><div class="k">Entries with evidence</div><div class="big">' + done + '</div>' +
    '<div class="of">' + total + ' total' + (Number(d.pending_accept) ? ', ' + d.pending_accept + ' awaiting the nominee' : '') + '</div></div>' +
    '<div class="div"></div>' +
    '<div class="aw-ring"><div style="position:absolute;inset:0;border-radius:48px;background:conic-gradient(#F2A900 0% ' + pct + '%, rgba(255,255,255,.14) ' + pct + '% 100%);"></div>' +
    '<div class="hole"><div><b>' + pct + '%</b><u>COMPLETE</u></div></div></div>' +
    '<div class="mini">' +
      '<div><b>' + (d.judges || 0) + '</b><u>COMMITTEE</u></div>' +
      '<div><b>' + (d.shortlisted || 0) + '</b><u>SHORTLISTED</u></div>' +
      '<div><b class="gd">' + (d.finalists || 0) + '</b><u>FINALISTS</u></div>' +
      '<div><b>' + (d.votes || 0) + '</b><u>VOTES</u></div>' +
    '</div></div>';

  h += _awStageRail(pr.stage);

  h += '<div class="aw-h6">Categories</div>';
  if (!(d.categories || []).length) {
    h += '<div class="aw-empty">No categories yet. Add one to start taking entries.</div>';
  } else {
    d.categories.forEach(function (c) {
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

function _awStageRail(stage) {
  var ord = [['enter', 'Enter'], ['evidence', 'Evidence'], ['committee', 'Committee'],
             ['shortlist', 'Shortlist'], ['finals', 'Finals'], ['winners', 'Winners']];
  var i = ord.findIndex(function (s) { return s[0] === stage; });
  var h = '<div class="aw-stg">';
  ord.forEach(function (s, n) {
    var cls = n < i ? '' : (n === i ? 'on' : 'off');
    var note = n < i ? 'Done' : (n === i ? 'Now' : '');
    h += '<div class="s ' + cls + '"><u>' + s[1] + '</u><i>' + note + '</i></div>';
    if (n < ord.length - 1) h += '<div class="ln' + (n >= i ? ' dash' : '') + '"></div>';
  });
  h += '<button class="btn btn-sec btn-sm" onclick="awNextStage()">Move on</button></div>';
  return h;
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
  var body =
    '<div class="field"><div class="label">Category name</div>' +
    '<input class="input" id="aw-c-name" value="' + _awEsc(v('name')) + '" placeholder="Club of the Year"></div>' +
    '<div class="field"><div class="label">Who decides it</div>' +
    '<select class="input" id="aw-c-by">' +
      '<option value="committee"' + (v('decided_by', 'committee') === 'committee' ? ' selected' : '') + '>Committee scores it</option>' +
      '<option value="members"' + (v('decided_by') === 'members' ? ' selected' : '') + '>Members vote</option>' +
      '<option value="data"' + (v('decided_by') === 'data' ? ' selected' : '') + '>Platform data, automatic</option>' +
    '</select></div>' +
    '<div class="field"><div class="label">Activity</div>' +
    '<select class="input" id="aw-c-activity">' + _awOpts(T.activities, v('activity'), 'Any activity') + '</select></div>' +
    '<div class="field"><div class="label">Mystery visits count toward the result</div>' +
    '<select class="input" id="aw-c-ms">' +
      '<option value="true"' + (v('mystery_counts', true) !== false ? ' selected' : '') + '>Yes, they are scored in</option>' +
      '<option value="false"' + (v('mystery_counts', true) === false ? ' selected' : '') + '>No, advisory only</option>' +
    '</select></div>' +
    '<div class="field"><div class="label">Shortlist size</div>' +
    '<input class="input" id="aw-c-sl" type="number" min="1" value="' + _awEsc(v('shortlist_size', 6)) + '"></div>' +
    '<div class="field"><div class="label">Finals size</div>' +
    '<input class="input" id="aw-c-fn" type="number" min="1" value="' + _awEsc(v('finals_size', 3)) + '"></div>' +
    '<div class="label" style="margin-top:14px;">Scoring criteria, one per line as "Label, max"</div>' +
    '<textarea class="input" id="aw-c-crit" rows="5" placeholder="Growth and reach, 25">' +
      _awEsc(crit.map(function (c) { return c.label + ', ' + c.max_score; }).join('\n')) + '</textarea>' +
    '<div class="psub" style="margin:8px 0 0;">Entrants see these before they enter, so the basis of the decision is published up front.</div>';
  openModalShell('sm', id ? 'Edit category' : 'New category', body,
    '<button class="btn btn-outline" onclick="closeModal()">Cancel</button>' +
    '<button class="btn btn-pri" onclick="awSaveCategory(' + (id ? "'" + id + "'" : 'null') + ')">Save</button>');
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
    var lines = g('aw-c-crit').split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
    var list = lines.map(function (l) {
      var bits = l.split(',');
      var max = parseInt((bits[1] || '').trim(), 10);
      return { label: bits[0].trim(), max_score: isNaN(max) ? 25 : max };
    });
    var rc = await window.supabase.rpc('award_criteria_set', { p_category: cid, p_list: list });
    if (rc.error) throw rc.error;
    closeModal();
    showToast('Category saved', 'success');
    _awRenderDash();
  } catch (e) { showToast(_awErr(e), 'error'); }
}

async function awAdvance(catId) {
  var body = '<div class="psub" style="margin:0 0 14px;">Promotes the top entries by whatever that category is decided on — votes for a members category, average committee total for a judged one.</div>' +
    '<div class="field"><div class="label">Move the top entries to</div>' +
    '<select class="input" id="aw-adv-to">' +
      '<option value="shortlisted">Shortlist</option>' +
      '<option value="finalist">Finals</option>' +
      '<option value="winner">Winner</option>' +
    '</select></div>';
  openModalShell('sm', 'Advance a category', body,
    '<button class="btn btn-outline" onclick="closeModal()">Cancel</button>' +
    '<button class="btn btn-pri" onclick="awDoAdvance(\'' + catId + '\')">Advance</button>');
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

window.renderAwards = renderAwards;
