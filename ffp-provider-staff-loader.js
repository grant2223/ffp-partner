// ════════════════════════════════════════════════════════════════════════
// FFP Partner Portal — STAFF module  (Business → Staff) — v3 (2026-06-12)
// Deferred loader: registered in _provLoaderSrc, lazy-loaded by
// ensureProviderLoader() the first time the Staff panel is opened.
//
// v3: COACH PHOTO — staff get a photo (provider_staff.photo_url) via the shared uploader (pickStaffPhoto →
//     FFPUpload, quest-images bucket). Shows next to the coach + in the bio popup on their sessions.
//     Also: PHONE now uses the standard country-code component (.phone-cc from FFP_TAX.phoneCodes + .phone-num) —
//     was a plain text box. (Per the FORM FIELD STANDARDS checklist in FFP-MASTER.md.)
// v2: added a "Short bio" field (provider_staff.bio) captured when adding a coach — shown to members in a popup
//     on the sessions that coach runs (people book for the coach). Saved via provider_save_staff.
// v1 = staff directory (records, roles, access level). Real per-staff logins
// and permission enforcement come later. provider_staff via SECURITY DEFINER
// RPCs (p_provider scoped): provider_save_staff / provider_list_staff /
// provider_delete_staff.
// ════════════════════════════════════════════════════════════════════════
var _staff = [];
var STAFF_ROLES = ['Coach', 'Manager', 'Front desk', 'Owner', 'Other'];
var ACCESS_LEVELS = { full: 'Full access', manage: 'Manager', coach: 'Classes only', view: 'View only' };

function _staffProvId() {
  return (window.FFP_PROVIDER && window.FFP_PROVIDER.id) ||
         (typeof providerProfile !== 'undefined' && providerProfile.id) || null;
}

async function renderStaff() {
  var host = document.getElementById('staff-list');
  if (!host) return;
  var pid = _staffProvId();
  if (!pid) { host.innerHTML = '<div class="empty-sub" style="text-align:left;">Sign in to manage staff.</div>'; return; }
  host.innerHTML = '<div class="psub" style="margin:10px 0;">Loading…</div>';
  try {
    var r = await window.supabase.rpc('provider_list_staff', { p_provider: pid });
    _staff = (r && r.data) ? r.data : [];
  } catch (e) { _staff = []; }
  if (!_staff.length) {
    host.innerHTML = emptyState('No staff yet', 'Add your coaches and team members, each with a role and access level.', 'Add staff', 'openStaffModal()');
    return;
  }
  host.innerHTML = _staff.map(staffRow).join('');
}

function staffRow(s) {
  var initials = (s.full_name || '?').split(/\s+/).map(function (w) { return w[0] || ''; }).join('').slice(0, 2).toUpperCase();
  var contact = [];
  if (s.role) contact.push(escHtml(s.role));
  if (s.email) contact.push(escHtml(s.email));
  if (s.phone) contact.push(escHtml(s.phone));
  var inactive = s.status && s.status !== 'active';
  var accessLbl = ACCESS_LEVELS[s.access_level] || 'Classes only';
  return '<div style="background:var(--ffp-bg-2,#0f1f2c);border:1px solid var(--ffp-border,#1d3346);border-radius:12px;padding:11px 13px;margin-bottom:9px;display:flex;align-items:flex-start;gap:11px;' + (inactive ? 'opacity:.6;' : '') + '">' +
      '<div style="width:38px;height:38px;border-radius:10px;background:rgba(25,128,173,.16);color:#6fc6ef;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;flex-shrink:0;">' + escHtml(initials) + '</div>' +
      '<div style="min-width:0;flex:1;">' +
        '<div style="font-weight:800;color:var(--ffp-text,#eaf2f8);">' + escHtml(s.full_name || '—') + (inactive ? ' <span class="psub">(inactive)</span>' : '') + '</div>' +
        (contact.length ? '<div class="psub" style="margin:2px 0 0;">' + contact.join(' · ') + '</div>' : '') +
      '</div>' +
      '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:7px;flex-shrink:0;">' +
        '<span style="font-size:10px;font-weight:700;padding:3px 8px;border-radius:20px;background:rgba(15,37,49,.14);color:var(--ffp-warn);">' + accessLbl + '</span>' +
        '<div style="display:flex;gap:6px;">' +
          '<button class="btn btn-sec btn-sm" onclick="openStaffModal(\'' + s.id + '\')"><span class="ms">edit</span></button>' +
          '<button class="btn btn-ghost btn-sm" onclick="confirmDeleteStaff(\'' + s.id + '\')"><span class="ms">delete</span></button>' +
        '</div>' +
      '</div>' +
  '</div>';
}

// Coach photo upload — reuses the shared image uploader (quest-images bucket, like the profile/pro photo).
function pickStaffPhoto() {
  if (!window.FFPUpload || !FFPUpload.pick) { showToast('Uploader still loading — try again', 'error'); return; }
  FFPUpload.pick({ bucket: 'quest-images', key: 'staff-' + (_staffProvId() || 'x') + '-' + Date.now(), aspect: 1, outW: 512, outH: 512, title: 'Coach photo',
    onDone: function (url) {
      var h = document.getElementById('st-photo_url'); if (h) h.value = url || '';
      var box = document.getElementById('st-photo'); if (box && url) { box.style.background = "url('" + url + "') center/cover no-repeat"; box.innerHTML = ''; }
    } });
}

function openStaffModal(id) {
  var editing = id ? _staff.find(function (x) { return x.id === id; }) : null;
  var s = editing || { full_name: '', email: '', phone: '', role: 'Coach', access_level: 'coach', status: 'active', notes: '', bio: '' };
  var roleOpts = STAFF_ROLES.map(function (r) { return '<option' + (s.role === r ? ' selected' : '') + '>' + r + '</option>'; }).join('');
  var accessOpts = Object.keys(ACCESS_LEVELS).map(function (k) { return '<option value="' + k + '"' + (s.access_level === k ? ' selected' : '') + '>' + ACCESS_LEVELS[k] + '</option>'; }).join('');
  openModalShell('lg', (editing ? 'Edit staff' : 'Add staff'), `
    <div class="form-section">
      <div class="form-section-title">Person</div>
      <div class="form-grid">
        <div class="field full" style="display:flex;align-items:center;gap:14px;">
          <input type="hidden" id="st-photo_url" value="${escHtml(s.photo_url || '')}">
          <div id="st-photo" onclick="pickStaffPhoto()" style="width:72px;height:72px;border-radius:50%;flex:0 0 auto;cursor:pointer;background:${s.photo_url ? ("url('" + escHtml(s.photo_url) + "') center/cover no-repeat") : 'var(--ffp-bg-card,#0f1f2c)'};border:1px solid var(--ffp-border,#1d3346);display:flex;align-items:center;justify-content:center;color:var(--ffp-text-dim,#6c7f90);overflow:hidden;">${s.photo_url ? '' : '<span class="ms" style="font-size:24px;">add_a_photo</span>'}</div>
          <div><button class="btn btn-sec btn-sm" type="button" onclick="pickStaffPhoto()"><span class="ms">photo_camera</span> ${s.photo_url ? 'Change photo' : 'Add photo'}</button><div style="font-size:11px;color:var(--ffp-text-dim,#6c7f90);margin-top:6px;">Shown to members on this coach's sessions. Square works best.</div></div>
        </div>
        <div class="field full"><div class="label">Full name <span class="req">*</span></div><input class="input" id="st-full_name" value="${escHtml(s.full_name)}" placeholder="e.g. Lee Carter"></div>
        <div class="field"><div class="label">Email</div><input class="input" id="st-email" value="${escHtml(s.email || '')}" placeholder="name@email.com"></div>
        <div class="field"><div class="label">Phone</div><div class="phone-input"><select class="phone-cc" id="st-phone-cc"></select><input class="input phone-num" id="st-phone-num" placeholder="50 123 4567" inputmode="tel"></div></div>
      </div>
    </div>
    <div class="form-section">
      <div class="form-section-title">Role &amp; access</div>
      <div class="form-grid">
        <div class="field"><div class="label">Role</div><select class="select" id="st-role">${roleOpts}</select></div>
        <div class="field"><div class="label">Access level</div><select class="select" id="st-access_level">${accessOpts}</select></div>
        <div class="field"><div class="label">Status</div><select class="select" id="st-status"><option value="active"${s.status === 'active' ? ' selected' : ''}>Active</option><option value="inactive"${s.status !== 'active' ? ' selected' : ''}>Inactive</option></select></div>
        <div class="field full"><div class="label">Notes <span style="color:var(--ffp-text-dim,#6c7f90);">(internal — not shown to members)</span></div><textarea class="textarea" id="st-notes" rows="2" placeholder="Optional">${escHtml(s.notes || '')}</textarea></div>
      </div>
    </div>
    <div class="form-section">
      <div class="form-section-title">Coach bio</div>
      <div class="form-grid">
        <div class="field full"><div class="label">Short bio <span class="label-hint">— members see this on the sessions this coach runs</span></div><textarea class="textarea" id="st-bio" rows="3" placeholder="A couple of sentences members see about this coach — experience, style, specialties.">${escHtml(s.bio || '')}</textarea></div>
      </div>
    </div>
  `, `
    ${editing ? '<button class="btn btn-ghost left" onclick="confirmDeleteStaff(\'' + editing.id + '\')"><span class="ms">delete</span> Delete</button>' : ''}
    <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
    <button class="btn btn-pri" onclick="saveStaff('${editing ? editing.id : ''}')">${editing ? 'Save changes' : 'Add staff'}</button>
  `);

  // Phone — standard country-code picker (same component as the rest of the platform), populated from FFP_TAX.
  setTimeout(function () {
    var cc = document.getElementById('st-phone-cc'), num = document.getElementById('st-phone-num');
    if (!cc || !num) return;
    var codes = (window.FFP_TAX && window.FFP_TAX.phoneCodes && window.FFP_TAX.phoneCodes.length) ? window.FFP_TAX.phoneCodes : [{ code: '+971' }];
    if (!cc.options.length) codes.forEach(function (c) { var o = document.createElement('option'); o.value = c.code; o.textContent = (c.flag ? c.flag + ' ' : '') + c.code; cc.appendChild(o); });
    cc.value = '+971'; num.value = '';
    var full = (s.phone || '').trim();
    if (full) {
      var matched = false;
      codes.map(function (c) { return c.code; }).sort(function (a, b) { return b.length - a.length; }).forEach(function (code) {
        if (!matched && full.indexOf(code) === 0) { cc.value = code; num.value = full.slice(code.length).trim(); matched = true; }
      });
      if (!matched) num.value = full.replace(/^\+\d+\s*/, '').trim() || full;
    }
  }, 30);
}

async function saveStaff(id) {
  var g = function (i) { var el = document.getElementById('st-' + i); return el ? el.value.trim() : ''; };
  var name = g('full_name');
  if (!name) { showToast('Name is required', 'error'); return; }
  var pid = _staffProvId();
  if (!pid) { showToast('Not signed in', 'error'); return; }
  var ccEl = document.getElementById('st-phone-cc'), numEl = document.getElementById('st-phone-num');
  var phone = (numEl && numEl.value.trim()) ? ((ccEl ? ccEl.value : '+971') + ' ' + numEl.value.trim()) : '';
  var payload = { full_name: name, email: g('email'), phone: phone, role: g('role'), access_level: g('access_level') || 'coach', status: g('status') || 'active', notes: g('notes'), bio: g('bio'), photo_url: g('photo_url') };
  try {
    var r = await window.supabase.rpc('provider_save_staff', { p_provider: pid, p_id: id || null, p: payload });
    if (r && r.error) throw r.error;
    showToast(id ? 'Staff updated' : 'Staff added', 'success');
    closeModal();
    renderStaff();
  } catch (e) { showToast('Could not save staff', 'error'); }
}

function confirmDeleteStaff(id) {
  openModalShell('', 'Remove staff?', '<div class="psub" style="margin:6px 0;">This removes them from your staff list.</div>', '<button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-pri" onclick="doDeleteStaff(\'' + id + '\')">Remove</button>');
}

async function doDeleteStaff(id) {
  var pid = _staffProvId();
  try {
    var r = await window.supabase.rpc('provider_delete_staff', { p_provider: pid, p_id: id });
    if (r && r.error) throw r.error;
    showToast('Staff removed', 'success');
  } catch (e) { showToast('Could not remove staff', 'error'); }
  closeModal();
  renderStaff();
}

// First open: loaded by showPanel AFTER its synchronous render hook ran, so
// render now if the Staff panel (Staff list) is on screen.
try { if (document.getElementById('staff-list')) renderStaff(); } catch (e) {}
