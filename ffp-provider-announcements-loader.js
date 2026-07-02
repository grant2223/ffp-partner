// ════════════════════════════════════════════════════════════════════════
// FFP Partner Portal — ANNOUNCEMENTS module  (Business → Announcements)
// Own panel (#panel-announcements). Extracted from the members loader.
// Compose + target + log only — delivery (email/push/SMS) wired later.
// RPCs (p_provider scoped): provider_list_broadcasts / provider_save_broadcast /
// provider_delete_broadcast / provider_audience_count / provider_list_teams.
// Renders into #comms-list. Top-level fn declarations (global onclick handlers).
// ════════════════════════════════════════════════════════════════════════
function _memProvId() {
  return (window.FFP_PROVIDER && window.FFP_PROVIDER.id) ||
         (typeof providerProfile !== 'undefined' && providerProfile.id) || null;
}
var _teams = [];
var _broadcasts = [];
var COMMS_CHANNELS = { email: 'Email', push: 'Push', sms: 'SMS' };
var COMMS_STATUSES = { active: 'Active', trial: 'Trial', lapsed: 'Lapsed', prospect: 'Prospect' };

function _cmVal(i) { var el = document.getElementById('cm-' + i); return el ? el.value : ''; }

async function renderComms() {
  var host = document.getElementById('comms-list');
  if (!host) return;
  var pid = _memProvId();
  if (!pid) { host.innerHTML = '<div class="empty-sub" style="text-align:left;">Sign in to message members.</div>'; return; }
  host.innerHTML = '<div class="psub" style="margin:10px 0;">Loading…</div>';
  try {
    var r = await window.supabase.rpc('provider_list_broadcasts', { p_provider: pid });
    _broadcasts = (r && r.data) ? r.data : [];
  } catch (e) { _broadcasts = []; }
  if (!_broadcasts.length) {
    host.innerHTML = emptyState('No announcements yet', 'Compose an announcement or reminder and choose who it goes to. Delivery switches on when channels are connected.', 'New announcement', 'openComposeModal()');
    return;
  }
  host.innerHTML = _broadcasts.map(broadcastRow).join('');
}

function broadcastRow(b) {
  var when = b.created_at ? String(b.created_at).slice(0, 10) : '';
  var sub = [];
  sub.push(b.audience_label || 'Everyone');
  sub.push((b.recipient_count || 0) + ' recipients');
  sub.push(COMMS_CHANNELS[b.channel] || 'Email');
  if (when) sub.push(when);
  return '<div style="background:var(--ffp-bg-2,#0f1f2c);border:1px solid var(--ffp-border,#1d3346);border-radius:12px;padding:11px 13px;margin-bottom:9px;display:flex;justify-content:space-between;align-items:flex-start;gap:10px;">' +
      '<div style="min-width:0;">' +
        '<div style="font-weight:800;color:var(--ffp-text,#eaf2f8);">' + escHtml(b.subject || '(no subject)') + '</div>' +
        '<div class="psub" style="margin:2px 0 0;">' + sub.map(escHtml).join(' · ') + '</div>' +
      '</div>' +
      '<div style="display:flex;align-items:center;gap:7px;flex-shrink:0;">' +
        '<span style="font-size:10px;font-weight:700;padding:3px 8px;border-radius:20px;background:rgba(255,255,255,.08);color:#9fb0bf;">Logged</span>' +
        '<button class="btn btn-ghost btn-sm" onclick="confirmDeleteBroadcast(\'' + b.id + '\')"><span class="ms">delete</span></button>' +
      '</div>' +
  '</div>';
}

async function openComposeModal() {
  var pid = _memProvId();
  if (!pid) return;
  if (!_teams.length) {
    try { var rt = await window.supabase.rpc('provider_list_teams', { p_provider: pid }); _teams = (rt && rt.data) ? rt.data : []; } catch (e) {}
  }
  var teamOpts = _teams.map(function (t) { return '<option value="' + t.id + '">' + escHtml(t.name) + '</option>'; }).join('');
  var statusOpts = Object.keys(COMMS_STATUSES).map(function (k) { return '<option value="' + k + '">' + COMMS_STATUSES[k] + '</option>'; }).join('');
  openModalShell('lg', 'New announcement', `
    <div class="form-section">
      <div class="form-section-title">Channel</div>
      <div class="form-grid">
        <div class="field full">
          <select class="select" id="cm-channel">
            <option value="email">Email</option>
            <option value="push">Push notification</option>
            <option value="sms">SMS</option>
          </select>
          <div class="psub" style="margin:6px 2px 0;">Delivery switches on when channels are connected. For now this composes the message and logs who it would reach.</div>
        </div>
      </div>
    </div>
    <div class="form-section">
      <div class="form-section-title">Audience</div>
      <div class="form-grid">
        <div class="field"><div class="label">Send to</div><select class="select" id="cm-aud-type" onchange="commsAudienceChange()"><option value="all">Everyone</option><option value="team">A team</option><option value="status">By status</option></select></div>
        <div class="field" id="cm-aud-team-wrap" style="display:none;"><div class="label">Team</div><select class="select" id="cm-aud-team" onchange="_updateAudienceCount()">${teamOpts || '<option value="">No teams yet</option>'}</select></div>
        <div class="field" id="cm-aud-status-wrap" style="display:none;"><div class="label">Status</div><select class="select" id="cm-aud-status" onchange="_updateAudienceCount()">${statusOpts}</select></div>
        <div class="field full"><div class="psub" id="cm-count" style="margin:0;">Recipients: …</div></div>
      </div>
    </div>
    <div class="form-section">
      <div class="form-section-title">Message</div>
      <div class="form-grid">
        <div class="field full"><div class="label">Subject</div><input class="input" id="cm-subject" placeholder="e.g. Class cancelled tomorrow"></div>
        <div class="field full"><div class="label">Message</div><textarea class="textarea" id="cm-body" rows="5" placeholder="What do you want to tell them?"></textarea></div>
      </div>
    </div>
  `, `
    <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
    <button class="btn btn-pri" onclick="sendBroadcast()">Save announcement</button>
  `);
  _updateAudienceCount();
}

function commsAudienceChange() {
  var t = _cmVal('aud-type');
  var tw = document.getElementById('cm-aud-team-wrap');
  var sw = document.getElementById('cm-aud-status-wrap');
  if (tw) tw.style.display = (t === 'team') ? '' : 'none';
  if (sw) sw.style.display = (t === 'status') ? '' : 'none';
  _updateAudienceCount();
}

async function _updateAudienceCount() {
  var pid = _memProvId();
  if (!pid) return;
  var t = _cmVal('aud-type');
  var ref = t === 'team' ? _cmVal('aud-team') : t === 'status' ? _cmVal('aud-status') : '';
  var lbl = document.getElementById('cm-count');
  if (lbl) lbl.textContent = 'Recipients: …';
  try {
    var r = await window.supabase.rpc('provider_audience_count', { p_provider: pid, p_type: t, p_ref: ref });
    var n = (r && r.data != null) ? r.data : 0;
    if (lbl) lbl.textContent = 'Recipients: ' + n;
  } catch (e) { if (lbl) lbl.textContent = 'Recipients: —'; }
}

async function sendBroadcast() {
  var pid = _memProvId();
  if (!pid) return;
  var t = _cmVal('aud-type');
  var ref = '', label = 'Everyone';
  if (t === 'team') {
    ref = _cmVal('aud-team');
    var team = _teams.find(function (x) { return x.id === ref; });
    label = 'Team: ' + (team ? team.name : '');
  } else if (t === 'status') {
    ref = _cmVal('aud-status');
    label = 'Status: ' + (COMMS_STATUSES[ref] || ref);
  }
  var subject = _cmVal('subject').trim();
  var body = _cmVal('body').trim();
  if (!body) { showToast('Write a message first', 'error'); return; }
  var payload = { channel: _cmVal('channel') || 'email', audience_type: t, audience_ref: ref, audience_label: label, subject: subject, body: body };
  try {
    var r = await window.supabase.rpc('provider_save_broadcast', { p_provider: pid, p: payload });
    if (r && r.error) throw r.error;
    showToast('Announcement saved', 'success');
    closeModal();
    renderComms();
  } catch (e) { showToast('Could not save announcement', 'error'); }
}

function confirmDeleteBroadcast(id) {
  openModalShell('', 'Delete announcement?', '<div class="psub" style="margin:6px 0;">This removes it from your announcement history.</div>', '<button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-pri" onclick="doDeleteBroadcast(\'' + id + '\')">Delete</button>');
}

async function doDeleteBroadcast(id) {
  var pid = _memProvId();
  try {
    var r = await window.supabase.rpc('provider_delete_broadcast', { p_provider: pid, p_id: id });
    if (r && r.error) throw r.error;
    showToast('Deleted', 'success');
  } catch (e) { showToast('Could not delete', 'error'); }
  closeModal();
  renderComms();
}

// First open: render now if the panel host is already on screen.
try { if (document.getElementById('comms-list')) renderComms(); } catch (e) {}
