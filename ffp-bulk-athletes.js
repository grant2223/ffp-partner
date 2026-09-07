/* FFP — Bulk add athletes/players (shared across Competitions / Leagues / Tournaments organiser consoles).
   window.FFPBulkAthletes.open({ scope:'comp'|'league'|'tourn', eventId, eventName, divisions:[{id,name}], divisionId,
                                 teams:[{id,name}] (optional, L/T only → "into a team" squad mode), onDone })
   Individual mode: entrants inserted by comp_entrants_bulk / lt_entrants_bulk. Team mode: players inserted into a
   team's squad by lt_squad_bulk. All owner-gated (organiser JWT); genuinely-new invitees emailed via the backend. */
(function () {
  if (window.FFPBulkAthletes) return;
  var BACKEND = 'https://ffp-passport-backend.vercel.app';

  function sb() { return window.supabase; }
  function refreshTok() { try { return (window.FFPAuth && FFPAuth.getRefresh && FFPAuth.getRefresh()) || null; } catch (e) { return null; } }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function validEmail(e) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e); }

  if (!document.getElementById('fba-css')) {
    var st = document.createElement('style'); st.id = 'fba-css';
    st.textContent = [
      '.fba-bk{position:fixed;inset:0;background:#fff;z-index:100000;overflow-y:auto;font-family:Montserrat,system-ui,sans-serif;color:#12232f}',
      '.fba-wrap{max-width:720px;margin:0 auto;min-height:100vh;display:flex;flex-direction:column}',
      '.fba-head{position:sticky;top:0;background:#fff;border-bottom:1px solid #e7edf1;padding:16px 22px;display:flex;align-items:center;gap:12px;z-index:2}',
      '.fba-head .bk{width:34px;height:34px;border-radius:9px;border:1px solid #dce4e9;background:#fff;display:grid;place-items:center;cursor:pointer;color:#42535e;font-size:18px}',
      '.fba-head h1{font-size:19px;font-weight:900;margin:0}',
      '.fba-head .sub{font-size:12.5px;color:#6a7c8a;font-weight:600}',
      '.fba-body{flex:1;padding:22px}',
      '.fba-sec{font-size:12px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#6a7c8a;margin:4px 2px 10px}',
      '.fba-sec.mt{margin-top:26px}',
      '.fba-fld{display:block;width:100%;font-family:inherit;font-size:14px;font-weight:600;color:#12232f;background:#f5f8fa;border:1px solid #dce4e9;border-radius:11px;padding:12px 14px}',
      '.fba-modes{display:flex;gap:8px;margin-bottom:16px}',
      '.fba-mode{flex:1;border:2px solid #dce4e9;background:#fff;border-radius:12px;padding:12px;font-family:inherit;font-size:14px;font-weight:800;color:#42535e;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:7px}',
      '.fba-mode.on{border-color:#1980AD;color:#1980AD;background:#eef6fb}',
      '.fba-row2{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:12px}',
      '.fba-tmpl{font-size:13px;font-weight:800;color:#1980AD;text-decoration:none;cursor:pointer;background:none;border:0;padding:0}',
      '.fba-drop{border:2px dashed #cbd6de;border-radius:14px;padding:24px;text-align:center;background:#f8fafb;cursor:pointer}',
      '.fba-drop .ic{font-size:32px;color:#1980AD}',
      '.fba-drop b{display:block;font-size:15px;font-weight:800;margin-top:8px}',
      '.fba-drop span{display:block;font-size:12.5px;color:#6a7c8a;font-weight:600;margin-top:3px}',
      '.fba-or{text-align:center;font-size:12px;font-weight:700;color:#9aa9b3;margin:12px 0}',
      'textarea.fba-fld{min-height:96px;resize:vertical;font-family:ui-monospace,Menlo,monospace;font-size:12.5px}',
      '.fba-counts{display:flex;gap:8px;flex-wrap:wrap;margin:2px 0 12px}',
      '.fba-pill{font-size:12px;font-weight:800;padding:6px 11px;border-radius:20px}',
      '.fba-pill.g{background:#e6f6ee;color:#1c7a45}.fba-pill.a{background:#fef3e2;color:#a5691a}.fba-pill.r{background:#fdecec;color:#c0392b}',
      '.fba-tbl{width:100%;border-collapse:collapse}',
      '.fba-tbl th{text-align:left;font-size:10.5px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:#8a9aa5;padding:8px 10px;border-bottom:1px solid #e7edf1}',
      '.fba-tbl td{font-size:13.5px;font-weight:600;padding:11px 10px;border-bottom:1px solid #f0f4f6}',
      '.fba-tbl .nm{font-weight:800}.fba-tbl .em{color:#6a7c8a;font-size:12.5px}',
      '.fba-st{display:inline-flex;align-items:center;gap:5px;font-size:11.5px;font-weight:800;padding:5px 10px;border-radius:20px}',
      '.fba-st.ready{background:#e6f6ee;color:#1c7a45}.fba-st.dupe{background:#fef3e2;color:#a5691a}.fba-st.bad{background:#fdecec;color:#c0392b}',
      '.fba-hint{font-size:12px;color:#6a7c8a;font-weight:600;margin-top:10px;line-height:1.5}',
      '.fba-foot{position:sticky;bottom:0;background:#fff;border-top:1px solid #e7edf1;padding:14px 22px;display:flex;gap:12px}',
      '.fba-btn{flex:1;border:0;border-radius:12px;padding:14px;font-family:inherit;font-size:15px;font-weight:900;cursor:pointer}',
      '.fba-btn.ghost{background:#eef2f4;color:#42535e;flex:0 0 auto;padding:14px 22px}',
      '.fba-btn.go{background:linear-gradient(180deg,#ffd868,#f2a900);color:#3a2600}',
      '.fba-btn:disabled{opacity:.5;cursor:not-allowed}',
      '.fba-done{text-align:center;padding:40px 20px}',
      '.fba-done .ic{font-size:52px;color:#1c7a45}',
      '.fba-done h2{font-size:20px;font-weight:900;margin:12px 0 6px}',
      '.fba-done p{font-size:14px;color:#5a6b76;font-weight:600}'
    ].join('\n');
    document.head.appendChild(st);
  }

  var S = null;

  function close() { var el = document.getElementById('fba-root'); if (el) el.remove(); S = null; }

  function parseText(text) {
    var rows = [];
    (text || '').split(/\r?\n/).forEach(function (line) {
      line = line.trim(); if (!line) return;
      var parts = line.split(/[,\t;]+/).map(function (p) { return p.trim(); }).filter(function (p) { return p !== ''; });
      if (!parts.length) return;
      if (/email/i.test(line) && /(given|first|name|surname|last)/i.test(line)) return; // header
      var email = '', names = [];
      parts.forEach(function (p) { if (!email && p.indexOf('@') > -1) email = p.toLowerCase(); else names.push(p); });
      rows.push({ given: names[0] || '', surname: names.slice(1).join(' '), email: email });
    });
    return rows;
  }

  function classify(rows, teamMode) {
    var seen = {};
    return rows.map(function (r) {
      var name = (r.given + ' ' + r.surname).trim();
      var st;
      if (!name) st = 'bad';
      else if (r.email && !validEmail(r.email)) st = 'bad';
      else if (!r.email && !teamMode) st = 'bad';                 // entrants need an email; squad players don't
      else if (r.email && seen[r.email]) st = 'dupe';
      else st = 'ready';
      if (r.email) seen[r.email] = 1;
      return { given: r.given, surname: r.surname, email: r.email, name: name, st: st };
    });
  }

  function renderPreview() {
    var box = document.getElementById('fba-preview'); if (!box) return;
    var rows = S.rows || [];
    if (!rows.length) { box.innerHTML = ''; setImportEnabled(0); return; }
    var nReady = rows.filter(function (r) { return r.st === 'ready'; }).length;
    var nDupe = rows.filter(function (r) { return r.st === 'dupe'; }).length;
    var nBad = rows.filter(function (r) { return r.st === 'bad'; }).length;
    var stLbl = { ready: ['ready', 'Ready to add'], dupe: ['dupe', 'Duplicate in list'], bad: ['bad', 'Check name / email'] };
    box.innerHTML =
      '<div class="fba-sec mt">Preview · ' + rows.length + ' rows</div>' +
      '<div class="fba-counts">' +
      '<span class="fba-pill g">' + nReady + ' ready</span>' +
      (nDupe ? '<span class="fba-pill a">' + nDupe + ' duplicate</span>' : '') +
      (nBad ? '<span class="fba-pill r">' + nBad + ' need attention</span>' : '') + '</div>' +
      '<table class="fba-tbl"><thead><tr><th>' + (S.mode === 'team' ? 'Player' : 'Athlete') + '</th><th>Email</th><th>Status</th></tr></thead><tbody>' +
      rows.map(function (r) {
        var s = stLbl[r.st];
        return '<tr><td><span class="nm">' + (esc(r.name) || '<span class="em">— no name —</span>') + '</span></td><td class="em">' + esc(r.email || (S.mode === 'team' ? '(name only)' : '—')) + '</td><td><span class="fba-st ' + s[0] + '">' + s[1] + '</span></td></tr>';
      }).join('') +
      '</tbody></table>' +
      '<div class="fba-hint">' + (S.mode === 'team'
        ? 'Players with an email get an invite to join FFP and appear in the line-up (existing members are linked directly). No email = added as a name only.'
        : 'Each person gets an email to join FFP and see the event; existing members are linked directly. When a new person signs up with their email, their entry is claimed automatically.') +
      ' Rows that need attention are skipped.</div>';
    setImportEnabled(nReady);
  }

  function setImportEnabled(n) {
    var b = document.getElementById('fba-import'); if (!b) return;
    var noun = S.mode === 'team' ? 'player' : 'athlete';
    b.disabled = !n; b.textContent = n ? ('Add ' + n + ' ' + noun + (n === 1 ? '' : 's') + (S.mode === 'team' ? '' : ' & send invites')) : ('Add ' + noun + 's');
  }

  function reparse() {
    var ta = document.getElementById('fba-paste');
    S.rows = classify(parseText(ta ? ta.value : ''), S.mode === 'team');
    renderPreview();
  }

  function setMode(m) {
    S.mode = m;
    document.querySelectorAll('.fba-mode').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-m') === m); });
    var pick = document.getElementById('fba-picker'); if (pick) pick.innerHTML = pickerHtml();
    reparse();
  }

  function pickerHtml() {
    if (S.mode === 'team') {
      var topts = (S.teams || []).map(function (t) { return '<option value="' + t.id + '"' + (t.id === S.teamId ? ' selected' : '') + '>' + esc(t.name) + '</option>'; }).join('');
      return '<div class="fba-sec">Add to team</div><select class="fba-fld" id="fba-team" onchange="FFPBulkAthletes._setTeam(this.value)">' + topts + '</select>';
    }
    var dopts = (S.divisions || []).map(function (d) { return '<option value="' + d.id + '"' + (d.id === S.divisionId ? ' selected' : '') + '>' + esc(d.name) + '</option>'; }).join('');
    return dopts ? '<div class="fba-sec">Add to division</div><select class="fba-fld" id="fba-div" onchange="FFPBulkAthletes._setDiv(this.value)">' + dopts + '</select>' : '';
  }

  async function doImport() {
    var b = document.getElementById('fba-import'); if (!b || b.disabled) return;
    var valid = (S.rows || []).filter(function (r) { return r.st === 'ready'; })
      .map(function (r) { return { given: r.given, surname: r.surname, email: r.email }; });
    if (!valid.length) return;
    var rf = refreshTok();
    b.disabled = true; b.textContent = 'Adding…';
    var rpc, args, emailUrl, emailPayload;
    if (S.mode === 'team') {
      if (!S.teamId) { b.disabled = false; alert('Pick a team first'); return; }
      rpc = 'lt_squad_bulk'; args = { p_scope: S.scope, p_event: S.eventId, p_entrant: S.teamId, p_rows: valid };
    } else if (S.scope === 'comp') {
      if (!S.divisionId) { b.disabled = false; alert('Pick a division first'); return; }
      rpc = 'comp_entrants_bulk'; args = { p_event: S.eventId, p_division: S.divisionId, p_rows: valid };
    } else {
      if (!S.divisionId) { b.disabled = false; alert('Pick a division first'); return; }
      rpc = 'lt_entrants_bulk'; args = { p_scope: S.scope, p_event: S.eventId, p_division: S.divisionId, p_rows: valid };
    }
    var r; try { r = await sb().rpc(rpc, args); } catch (e) { r = { error: e }; }
    if (!r || r.error) { b.disabled = false; setImportEnabled(valid.length); alert('Could not add: ' + ((r && r.error && r.error.message) || 'error')); return; }
    var results = Array.isArray(r.data) ? r.data : [];
    var invited = results.filter(function (x) { return x.result === 'invited'; });
    if (invited.length && rf) {
      if (S.mode === 'team' || S.scope !== 'comp') {
        emailUrl = '/api/lt/bulk-athletes';
        emailPayload = { refresh: rf, scope: S.scope, event_id: S.eventId, squad: S.mode === 'team', invites: invited.map(function (x) { return { name: x.name, email: x.email }; }) };
      } else {
        emailUrl = '/api/comp/bulk-athletes';
        emailPayload = { refresh: rf, event_id: S.eventId, invites: invited.map(function (x) { return { name: x.name, email: x.email, claim_token: x.claim_token }; }) };
      }
      try { await fetch(BACKEND + emailUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(emailPayload) }); } catch (e) { /* email best-effort */ }
    }
    var count = function (k) { return results.filter(function (x) { return x.result === k; }).length; };
    try { if (typeof S.onDone === 'function') S.onDone(); } catch (e) {}
    renderDone(invited.length, count('linked'), count('added'), count('duplicate'), count('invalid'));
  }

  function renderDone(nInv, nLinked, nAdded, nDupe, nBad) {
    var wrap = document.getElementById('fba-main'); if (!wrap) return;
    var bits = [];
    if (nInv) bits.push(nInv + ' invited by email');
    if (nLinked) bits.push(nLinked + ' existing member' + (nLinked === 1 ? '' : 's') + ' linked');
    if (nAdded) bits.push(nAdded + ' added by name');
    if (nDupe) bits.push(nDupe + ' already in');
    if (nBad) bits.push(nBad + ' skipped');
    wrap.innerHTML = '<div class="fba-done"><span class="ms ic">task_alt</span><h2>' + (S.mode === 'team' ? 'Players added' : 'Athletes added') + '</h2><p>' + (bits.join(' · ') || 'Nothing to add') + '</p></div>';
    var foot = document.getElementById('fba-foot');
    if (foot) foot.innerHTML = '<button class="fba-btn go" onclick="FFPBulkAthletes.close()">Done</button>';
  }

  function open(opts) {
    opts = opts || {};
    S = {
      scope: opts.scope, eventId: opts.eventId, eventName: opts.eventName || '',
      divisions: opts.divisions || [], divisionId: opts.divisionId || (opts.divisions && opts.divisions[0] && opts.divisions[0].id) || null,
      teams: opts.teams || [], teamId: (opts.teams && opts.teams[0] && opts.teams[0].id) || null,
      mode: 'ind', onDone: opts.onDone, rows: []
    };
    var canTeam = S.scope !== 'comp' && S.teams.length > 0;
    close();
    var root = document.createElement('div'); root.id = 'fba-root'; root.className = 'fba-bk';
    root.innerHTML =
      '<div class="fba-wrap"><div id="fba-main">' +
      '<div class="fba-head"><button class="bk ms" onclick="FFPBulkAthletes.close()">arrow_back</button>' +
      '<div><h1>Bulk add</h1><div class="sub">' + (esc(S.eventName) || 'Add many at once') + '</div></div></div>' +
      '<div class="fba-body">' +
      (canTeam ? '<div class="fba-modes">' +
        '<button class="fba-mode on" data-m="ind" onclick="FFPBulkAthletes._mode(\'ind\')"><span class="ms">person_add</span>Individual entrants</button>' +
        '<button class="fba-mode" data-m="team" onclick="FFPBulkAthletes._mode(\'team\')"><span class="ms">groups</span>Into a team</button></div>' : '') +
      '<div id="fba-picker">' + pickerHtml() + '</div>' +
      '<div class="fba-sec mt">Upload your list</div>' +
      '<div class="fba-row2"><div style="font-size:13px;font-weight:600;color:#6a7c8a">Columns: <b style="color:#12232f">Given name, Surname, Email</b></div>' +
      '<button class="fba-tmpl" id="fba-tmpl">Download CSV template</button></div>' +
      '<label class="fba-drop" for="fba-file"><span class="ms ic">upload_file</span><b>Choose a CSV file</b><span>.csv &middot; Given name, Surname, Email</span></label>' +
      '<input type="file" id="fba-file" accept=".csv,text/csv,text/plain" style="display:none">' +
      '<div class="fba-or">— or paste rows —</div>' +
      '<textarea class="fba-fld" id="fba-paste" placeholder="Sarah, Nguyen, sarah@email.com&#10;James, Okoye, james@email.com"></textarea>' +
      '<div id="fba-preview"></div>' +
      '</div></div>' +
      '<div class="fba-foot" id="fba-foot"><button class="fba-btn ghost" onclick="FFPBulkAthletes.close()">Cancel</button>' +
      '<button class="fba-btn go" id="fba-import" disabled onclick="FFPBulkAthletes._import()">Add</button></div>' +
      '</div>';
    document.body.appendChild(root);
    setImportEnabled(0);
    var ta = document.getElementById('fba-paste'); if (ta) ta.addEventListener('input', reparse);
    var file = document.getElementById('fba-file');
    if (file) file.addEventListener('change', function () {
      var f = file.files && file.files[0]; if (!f) return;
      var rd = new FileReader(); rd.onload = function () { if (ta) { ta.value = String(rd.result || ''); reparse(); } }; rd.readAsText(f);
    });
    var tmpl = document.getElementById('fba-tmpl');
    if (tmpl) tmpl.addEventListener('click', function () {
      var csv = 'Given name,Surname,Email\nSarah,Nguyen,sarah@email.com\nJames,Okoye,james@email.com\n';
      var a = document.createElement('a'); a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
      a.download = 'ffp-athletes-template.csv'; document.body.appendChild(a); a.click(); a.remove();
    });
  }

  window.FFPBulkAthletes = {
    open: open, close: close, _import: doImport, _mode: setMode,
    _setDiv: function (v) { S.divisionId = v; }, _setTeam: function (v) { S.teamId = v; }
  };
})();
