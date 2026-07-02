// ════════════════════════════════════════════════════════════════════════
// FFP Partner Portal — APPOINTMENTS module — v1 (2026-06-16)
// 1-on-1 / coaching appointments, separate from the group-class Sessions timetable.
// Tabs: Calendar (book / check-in / trainer-done / facility-confirm / reschedule / cancel),
//       Services & Coaches (service + per-service tax + coach links w/ % or flat commission),
//       Availability (recurring weekly trainer slots), Packages (catalog + sell + sessions-remaining).
// DB (Phase 1/2): provider_services, provider_service_coaches, provider_trainer_slots,
//   provider_packages, provider_client_packages, provider_appointments + RPCs.
// Coach commission is frozen + released only on facility confirmation (provider_confirm_appointment).
// ════════════════════════════════════════════════════════════════════════
var _apStaff = [], _apServices = [], _apPackages = [], _apSlots = [], _apMembers = [], _apAppts = [], _apBlocks = [];
var _apWeekStart = null;          // (legacy)
var _apAnchor = null;             // focused date — source of truth for all views
var _apView = 'day';              // 'day' | 'week' | 'month' (default day)
var _apCalCoach = '';             // calendar coach filter ('' = all)
var _apClientPkgCache = {};       // member_id -> [active client packages] (for booking)

var DOW_AP = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function apProvId() {
  return (window.FFP_PROVIDER && window.FFP_PROVIDER.id) ||
         (typeof providerProfile !== 'undefined' && providerProfile.id) || null;
}
function apEsc(s) {
  if (window.escHtml) return window.escHtml(s);
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function apMoney(n) {
  try { return window.FFPCurrency ? window.FFPCurrency.formatProvider(n) : ('AED ' + (n || 0)); }
  catch (e) { return 'AED ' + (n || 0); }
}
function apCcy() { try { return window.FFPCurrency ? window.FFPCurrency.providerCode() : 'AED'; } catch (e) { return 'AED'; } }
function apToast(m, t) { try { showToast(m, t || 'success'); } catch (e) {} }
function apEnhance(ids) {
  if (!window.FFPSelect) return;
  setTimeout(function () {
    (ids || []).forEach(function (id) { var el = document.getElementById(id); if (el) { try { window.FFPSelect.enhance(el); } catch (e) {} } });
  }, 30);
}
function apMondayOf(d) {
  var x = new Date(d); x.setHours(0, 0, 0, 0);
  var day = x.getDay(); var diff = (day === 0 ? -6 : 1 - day); // make Monday the start
  x.setDate(x.getDate() + diff); return x;
}

// ── entry ──
function _apInjectStyle() {
  if (document.getElementById('ap-cal-style')) return;
  var st = document.createElement('style'); st.id = 'ap-cal-style';
  st.textContent = 'input.input[type="date"],input.input[type="time"],input.input[type="datetime-local"]{color-scheme:light;}';
  (document.head || document.body).appendChild(st);
}
async function renderAppointments() {
  _apInjectStyle();
  if (!_apAnchor) _apAnchor = _apFacilityToday();
  await _apLoadConfig();
  apRenderCalendar();
}

async function _apLoadConfig() {
  var pid = apProvId(); if (!pid) return;
  try {
    var res = await Promise.all([
      window.supabase.rpc('provider_list_staff', { p_provider: pid }),
      window.supabase.rpc('provider_list_services', { p_provider: pid }),
      window.supabase.rpc('provider_list_packages', { p_provider: pid }),
      window.supabase.rpc('provider_list_trainer_slots', { p_provider: pid }),
      window.supabase.rpc('provider_searchable_members', { p_provider: pid, p_q: '' }),
      window.supabase.rpc('provider_list_trainer_blocks', { p_provider: pid })
    ]);
    _apStaff    = (res[0] && res[0].data) ? res[0].data : [];
    _apServices = (res[1] && res[1].data) ? res[1].data : [];
    _apPackages = (res[2] && res[2].data) ? res[2].data : [];
    _apSlots    = (res[3] && res[3].data) ? res[3].data : [];
    _apMembers  = (res[4] && res[4].data) ? res[4].data : [];
    _apBlocks   = (res[5] && res[5].data) ? res[5].data : [];
  } catch (e) { /* leave whatever loaded */ }
}

// helper option builders
function _apStaffOpts(sel) {
  return '<option value="">Select a coach…</option>' + _apStaff.map(function (s) {
    return '<option value="' + s.id + '"' + (sel === s.id ? ' selected' : '') + '>' + apEsc(s.full_name || 'Coach') + (s.role ? ' · ' + apEsc(s.role) : '') + '</option>';
  }).join('');
}
function _apServiceOpts(sel, withAny) {
  return (withAny ? '<option value="">Any service</option>' : '<option value="">Select a service…</option>') +
    _apServices.map(function (s) {
      return '<option value="' + s.id + '"' + (sel === s.id ? ' selected' : '') + '>' + apEsc(s.name) + ' · ' + apMoney(s.price_aed) + '</option>';
    }).join('');
}
function _apMemberOpts(sel) {
  return '<option value="">Select a client…</option>' + _apMembers.map(function (m) {
    return '<option value="' + m.member_id + '"' + (sel === m.member_id ? ' selected' : '') + '>' + apEsc(m.full_name || m.email || '—') + '</option>';
  }).join('');
}

// ════════════════════════════════════════════════════════════════════════
// CALENDAR (booked appointments, by day) + week nav + actions
// ════════════════════════════════════════════════════════════════════════
function apSetView(v) { _apView = v; apRenderCalendar(); }
function apToday() { _apAnchor = _apFacilityToday(); apRenderCalendar(); }
function apThisWeek() { apToday(); }   // back-compat
function apCalCoachChange(v) { _apCalCoach = v || ''; apRenderCalendar(); }
function apNavPrev() { _apShiftAnchor(-1); }
function apNavNext() { _apShiftAnchor(1); }
function _apShiftAnchor(dir) {
  var d = new Date(_apAnchor || new Date());
  if (_apView === 'day') d.setDate(d.getDate() + dir);
  else if (_apView === 'month') d.setMonth(d.getMonth() + dir);
  else d.setDate(d.getDate() + dir * 7);
  _apAnchor = d; apRenderCalendar();
}
function _apViewDays() {
  if (_apView === 'day') return [new Date(_apAnchor)];
  var ms = apMondayOf(_apAnchor); var arr = [];
  for (var i = 0; i < 7; i++) { var d = new Date(ms); d.setDate(d.getDate() + i); arr.push(d); }
  return arr;
}
function _apRangeBounds() {
  var from, to;
  if (_apView === 'month') {
    var first = new Date(_apAnchor.getFullYear(), _apAnchor.getMonth(), 1);
    from = apMondayOf(first); to = new Date(from); to.setDate(to.getDate() + 42);
  } else {
    var days = _apViewDays();
    from = new Date(days[0]); from.setHours(0, 0, 0, 0);
    to = new Date(days[days.length - 1]); to.setHours(0, 0, 0, 0); to.setDate(to.getDate() + 1);
  }
  // Pad ±1 day: the fetch window is in the viewer's tz but we bucket appts in the FACILITY tz,
  // so over-fetch a day on each side to be sure the facility-local day's appts are included.
  from = new Date(from); from.setDate(from.getDate() - 1);
  to = new Date(to); to.setDate(to.getDate() + 1);
  return { from: from, to: to };
}
function _apTitle() {
  var a = _apAnchor;
  if (_apView === 'day') return a.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  if (_apView === 'month') return a.toLocaleDateString([], { month: 'long', year: 'numeric' });
  var days = _apViewDays();
  return days[0].toLocaleDateString([], { day: 'numeric', month: 'short' }) + ' – ' + days[6].toLocaleDateString([], { day: 'numeric', month: 'short' });
}
function _apHeader() {
  var vbtn = function (v, label) { return '<button class="btn ' + (_apView === v ? 'btn-pri' : 'btn-ghost') + ' btn-sm" onclick="apSetView(\'' + v + '\')">' + label + '</button>'; };
  var coach = '';
  if (_apStaff.length) {
    coach = '<select class="select" id="ap-cal-coach" onchange="apCalCoachChange(this.value)" style="max-width:180px;">' +
      '<option value="">All coaches</option>' +
      _apStaff.map(function (st) { return '<option value="' + st.id + '"' + (_apCalCoach === st.id ? ' selected' : '') + '>' + apEsc(st.full_name || 'Coach') + '</option>'; }).join('') + '</select>';
  }
  return '<div style="display:flex;align-items:center;gap:4px;">' + vbtn('day', 'Day') + vbtn('week', 'Week') + vbtn('month', 'Month') + '</div>' +
    '<div style="display:flex;align-items:center;gap:4px;">' +
      '<button class="btn btn-ghost btn-sm" onclick="apNavPrev()"><span class="ms">chevron_left</span></button>' +
      '<b style="color:var(--ffp-text,#eaf2f8);min-width:140px;text-align:center;display:inline-block;">' + _apTitle() + '</b>' +
      '<button class="btn btn-ghost btn-sm" onclick="apNavNext()"><span class="ms">chevron_right</span></button>' +
      '<button class="btn btn-ghost btn-sm" onclick="apToday()">Today</button>' +
    '</div>' + (coach ? '<div>' + coach + '</div>' : '');
}
async function apRenderCalendar() {
  var pid = apProvId();
  var nav = document.getElementById('ap-week-nav');
  var host = document.getElementById('ap-calendar-host');
  if (!host) return;
  if (!_apAnchor) _apAnchor = new Date();
  var rb = _apRangeBounds();
  if (nav) {
    nav.innerHTML = _apHeader();
    if (window.FFPSelect) { setTimeout(function () { var el = document.getElementById('ap-cal-coach'); if (el) { try { window.FFPSelect.enhance(el); } catch (e) {} } }, 30); }
  }
  host.innerHTML = '<div class="psub" style="margin:10px 0;">Loading…</div>';
  try {
    var r = await window.supabase.rpc('provider_list_appointments', { p_provider: pid, p_from: rb.from.toISOString(), p_to: rb.to.toISOString() });
    _apAppts = (r && r.data) ? r.data : [];
  } catch (e) { _apAppts = []; }
  if (!_apServices.length && !_apStaff.length) {
    host.innerHTML = _apEmpty('Set up your coaching first', 'Add a service and link a coach (Services tab), then book appointments here.');
    return;
  }
  if (_apView === 'month') _apRenderMonth(host);
  else if (_apView === 'day') _apRenderDay(host, new Date(_apAnchor));
  else _apRenderGrid(host, _apViewDays());
}

// minutes helpers + open-slot generation (browser-local clock, matching how appts are grouped)
function _apMin(hhmm) { if (!hhmm) return null; var p = hhmm.split(':'); return (+p[0]) * 60 + (+p[1]); }
function _apHHMM(m) { var h = Math.floor(m / 60), x = m % 60; return (h < 10 ? '0' : '') + h + ':' + (x < 10 ? '0' : '') + x; }
function _apDateStr(d) { var p = function (n) { return (n < 10 ? '0' : '') + n; }; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }
// ── facility-timezone helpers: render appointments in the FACILITY's clock, not the viewer's ──
function _apFacilityTz() {
  return (window.FFP_PROVIDER && window.FFP_PROVIDER.timezone) ||
         (window.FFPTime && window.FFPTime.tz && window.FFPTime.tz()) ||
         (Intl.DateTimeFormat().resolvedOptions().timeZone) || 'UTC';
}
// {dateStr:'YYYY-MM-DD', min:<minutes since midnight>} for an ISO instant, in facility tz
function _apLocalParts(iso) {
  try {
    var parts = new Intl.DateTimeFormat('en-CA', { timeZone: _apFacilityTz(), year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
      .formatToParts(new Date(iso)).reduce(function (o, p) { o[p.type] = p.value; return o; }, {});
    var hh = +parts.hour; if (hh === 24) hh = 0;
    return { dateStr: parts.year + '-' + parts.month + '-' + parts.day, min: hh * 60 + (+parts.minute) };
  } catch (e) {
    var d = new Date(iso); return { dateStr: _apDateStr(d), min: d.getHours() * 60 + d.getMinutes() };
  }
}
function _apFacilityToday() { var d = _apLocalParts(new Date().toISOString()).dateStr.split('-'); return new Date(+d[0], +d[1] - 1, +d[2]); }
function _apBlockedAt(staffId, weekday, dateStr, sMin, eMin) {
  return (_apBlocks || []).some(function (b) {
    if (b.staff_id !== staffId) return false;
    var match = (b.block_type === 'recurring' && b.day_of_week === weekday) || (b.block_type === 'date' && b.block_date === dateStr);
    if (!match) return false;
    if (!b.start_time || !b.end_time) return true; // whole day
    return sMin < _apMin(b.end_time) && eMin > _apMin(b.start_time);
  });
}
// does a recurring/one-off availability window apply on a given Date?
function _apSlotOnDate(w, day) {
  if (w.status === 'inactive') return false;
  if (w.slot_date) return w.slot_date === _apDateStr(day);
  return w.day_of_week === day.getDay();
}
// availability windows for a coach on a given Date (recurring weekday + one-off date)
function _apAvailForDayCoach(coachId, day) {
  return (_apSlots || []).filter(function (w) { return w.staff_id === coachId && _apSlotOnDate(w, day); });
}
function _apOpenSlots(day, apptsForDay) {
  var out = [], dateStr = _apDateStr(day), weekday = day.getDay();
  (_apSlots || []).forEach(function (w) {
    if (!_apSlotOnDate(w, day)) return;
    if (_apCalCoach && w.staff_id !== _apCalCoach) return;
    var s = _apMin(w.start_time), e = _apMin(w.end_time);
    if (s == null || e == null || e <= s) return;
    var step = w.duration_min || 60;
    for (var m = s; m + step <= e; m += step) {
      var sMin = m, eMin = m + step;
      if (_apBlockedAt(w.staff_id, weekday, dateStr, sMin, eMin)) continue;
      var taken = (apptsForDay || []).some(function (a) {
        if (a.staff_id !== w.staff_id) return false;
        if (['cancelled', 'no_show'].indexOf(a.status) !== -1) return false;
        var aS = _apLocalParts(a.start_at).min; var aE = aS + (a.duration_min || 60);
        return sMin < aE && eMin > aS;
      });
      if (taken) continue;
      out.push({ staff_id: w.staff_id, coach_name: w.coach_name, service_id: w.service_id || '', service_name: w.service_name || '', time: _apHHMM(m), duration: step, dateStr: dateStr });
    }
  });
  out.sort(function (a, b) { return a.time < b.time ? -1 : a.time > b.time ? 1 : (a.coach_name || '').localeCompare(b.coach_name || ''); });
  return out;
}
function _apSlotChip(s) {
  return '<button class="btn btn-ghost btn-sm" style="border-style:dashed;" onclick="apBookFromSlot(\'' + s.staff_id + '\',\'' + (s.service_id || '') + '\',\'' + s.dateStr + '\',\'' + s.time + '\',' + s.duration + ')">' +
    '<span class="ms">add</span> ' + s.time + ' · ' + apEsc(s.coach_name || 'Coach') + (s.service_name ? ' · ' + apEsc(s.service_name) : '') + '</button>';
}
function apBookFromSlot(staffId, serviceId, dateStr, time, duration) {
  apBookModal({ start: dateStr + 'T' + time, staff_id: staffId, service_id: serviceId || '', duration: duration });
}

// ── TIME GRID (Day / Week): time down Y, days across X ──
var _AP_HH = 44; // px per hour row
// Calendar legend (solid, high-contrast): AVAILABLE = yellow · BOOKED = green · BLOCKED = dark grey.
var AP_AVAIL  = { bg: '#FFE08A', bd: '#E3A700', fg: '#5a4500' };   // available / free to book
var AP_BLOCK  = { bg: '#3b4750', bd: '#2b343b', fg: '#dfe6ea' };   // blocked off
function _apBlockColor(st) {
  if (st === 'no_show')   return { bd: '#b23a4e', bg: '#9c2f43', fg: '#ffffff' };
  if (st === 'cancelled') return { bd: '#ccd9da', bg: '#eef1f3', fg: '#7d8c92' };
  // every active/booked state → SOLID green with white text
  return { bd: '#15833f', bg: '#1f9d57', fg: '#ffffff' };
}
// Blocked windows for a coach on a given Date (recurring weekday + one-off date). Whole-day if no times.
function _apBlocksForDayCoach(coachId, day) {
  var dateStr = _apDateStr(day), wd = day.getDay();
  return (_apBlocks || []).filter(function (b) {
    if (coachId && b.staff_id !== coachId) return false;
    return (b.block_type === 'recurring' && b.day_of_week === wd) || (b.block_type === 'date' && b.block_date === dateStr);
  });
}
// Is [sMin,eMin) fully inside a SET availability window for this coach/date AND not blocked? (gate for booking)
function _apWithinAvailability(coachId, dateStr, sMin, eMin) {
  var p = dateStr.split('-'); var day = new Date(+p[0], +p[1] - 1, +p[2]);
  var inside = _apAvailForDayCoach(coachId, day).some(function (w) {
    var s = _apMin(w.start_time), e = _apMin(w.end_time);
    return s != null && e != null && sMin >= s && eMin <= e;
  });
  if (!inside) return false;
  if (_apBlockedAt(coachId, day.getDay(), dateStr, sMin, eMin)) return false;
  return true;
}
function _apGridItems(day, coachF) {
  var dateStr = _apDateStr(day);
  var appts = (_apAppts || []).filter(function (a) { return (!coachF || a.staff_id === coachF) && _apLocalParts(a.start_at).dateStr === dateStr; });
  var items = [];
  appts.forEach(function (a) {
    if (a.status === 'cancelled') return;
    var sM = _apLocalParts(a.start_at).min;
    items.push({ kind: 'appt', a: a, startMin: sM, endMin: sM + (a.duration_min || 60) });
  });
  var open = _apOpenSlots(day, appts.filter(function (a) { return ['cancelled', 'no_show'].indexOf(a.status) === -1; }));
  open.forEach(function (s) { var sM = _apMin(s.time); items.push({ kind: 'open', s: s, startMin: sM, endMin: sM + (s.duration || 60) }); });
  return items;
}
function _apLanePack(items) {
  items.sort(function (a, b) { return a.startMin - b.startMin || a.endMin - b.endMin; });
  var i = 0;
  while (i < items.length) {
    var cluster = [items[i]], maxEnd = items[i].endMin, j = i + 1;
    while (j < items.length && items[j].startMin < maxEnd) { cluster.push(items[j]); maxEnd = Math.max(maxEnd, items[j].endMin); j++; }
    var lanes = [];
    cluster.forEach(function (it) {
      var placed = false;
      for (var L = 0; L < lanes.length; L++) { if (lanes[L] <= it.startMin) { it.lane = L; lanes[L] = it.endMin; placed = true; break; } }
      if (!placed) { it.lane = lanes.length; lanes.push(it.endMin); }
    });
    cluster.forEach(function (it) { it.lanes = lanes.length; });
    i = j;
  }
}
function _apGridBlock(it, top, hgt, leftPct, wPct) {
  var base = 'position:absolute;top:' + top + 'px;height:' + hgt + 'px;left:calc(' + leftPct + '% + 2px);width:calc(' + wPct + '% - 4px);border-radius:7px;padding:3px 6px;overflow:hidden;font-size:11px;line-height:1.2;cursor:pointer;box-sizing:border-box;';
  if (it.kind === 'open') {
    var s = it.s;
    return '<div onclick="event.stopPropagation(); apBookFromSlot(\'' + s.staff_id + '\',\'' + (s.service_id || '') + '\',\'' + s.dateStr + '\',\'' + s.time + '\',' + s.duration + ')" title="Available — book ' + s.time + ' · ' + apEsc(s.coach_name || '') + '" style="' + base + 'border:1px solid ' + AP_AVAIL.bd + ';background:' + AP_AVAIL.bg + ';color:' + AP_AVAIL.fg + ';font-weight:700;display:flex;align-items:center;justify-content:center;gap:4px;"><span class="ms" style="font-size:13px;">add</span>' + s.time + (it.lanes < 2 ? (' · ' + apEsc(s.coach_name || '')) : '') + '</div>';
  }
  var a = it.a, col = _apBlockColor(a.status), name = apEsc(a.member_name || a.member_email || 'Client');
  return '<div onclick="event.stopPropagation(); apApptDetail(\'' + a.id + '\')" title="' + name + '" style="' + base + 'border:1px solid ' + col.bd + ';background:' + col.bg + ';color:' + col.fg + ';font-weight:700;">' +
    '<div style="font-weight:800;">' + _apHHMM(it.startMin) + '</div>' +
    '<div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + name + '</div>' +
    (hgt > 42 ? '<div style="opacity:.9;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + apEsc(a.coach_name || '') + '</div>' : '') +
  '</div>';
}
function _apRenderGrid(host, days) {
  var coachF = _apCalCoach;
  // Full 24-hour day is always viewable (scrolls).
  var startH = 0, endH = 24, rangeStart = 0, rows = 24;
  var todayStr = _apDateStr(_apFacilityToday());
  var colW = days.length === 1 ? '1fr' : 'repeat(' + days.length + ',1fr)';
  var minW = days.length > 1 ? 660 : 300;
  var html = '<div style="overflow-x:auto;"><div style="min-width:' + minW + 'px;">';
  // day header
  html += '<div style="display:grid;grid-template-columns:54px ' + colW + ';">';
  html += '<div></div>';
  days.forEach(function (day) {
    var isT = _apDateStr(day) === todayStr;
    html += '<div style="text-align:center;padding:6px 2px;border-left:1px solid var(--ffp-border,#1d3346);">' +
      '<div style="font-weight:800;font-size:12px;color:' + (isT ? '#1980AD' : 'var(--ffp-text,#eaf2f8)') + ';">' + day.toLocaleDateString([], { weekday: 'short' }) + '</div>' +
      '<div style="font-size:15px;font-weight:800;color:' + (isT ? '#1980AD' : 'var(--ffp-text,#eaf2f8)') + ';">' + day.getDate() + '</div></div>';
  });
  html += '</div>';
  // body
  html += '<div style="display:grid;grid-template-columns:54px ' + colW + ';">';
  html += '<div>';
  for (var h = startH; h < endH; h++) html += '<div style="height:' + _AP_HH + 'px;font-size:11px;color:#9fb3c2;text-align:right;padding-right:6px;"><span style="position:relative;top:-7px;">' + _apHHMM(h * 60) + '</span></div>';
  html += '</div>';
  days.forEach(function (day) {
    var isT = _apDateStr(day) === todayStr;
    var items = _apGridItems(day, coachF); _apLanePack(items);
    var col = '<div style="position:relative;border-left:1px solid var(--ffp-border,#1d3346);height:' + (rows * _AP_HH) + 'px;background:' + (isT ? 'rgba(25,128,173,.04)' : 'transparent') + ';">';
    // blocked windows — dark grey bands behind everything
    _apBlocksForDayCoach(coachF, day).forEach(function (b) {
      var bs = b.start_time ? _apMin(b.start_time) : rangeStart, be = b.end_time ? _apMin(b.end_time) : endH * 60;
      if (bs == null || be == null || be <= bs) { bs = rangeStart; be = endH * 60; }
      col += '<div title="Blocked" style="position:absolute;left:0;right:0;top:' + (((bs - rangeStart) / 60) * _AP_HH) + 'px;height:' + (((be - bs) / 60) * _AP_HH) + 'px;background:' + AP_BLOCK.bg + ';opacity:.85;pointer-events:none;"></div>';
    });
    for (var h2 = startH; h2 < endH; h2++) col += '<div style="position:absolute;left:0;right:0;top:' + ((h2 - startH) * _AP_HH) + 'px;border-top:1px solid var(--ffp-border,#1d3346);opacity:.45;"></div>';
    items.forEach(function (it) {
      var top = ((it.startMin - rangeStart) / 60) * _AP_HH;
      var hgt = Math.max(20, ((it.endMin - it.startMin) / 60) * _AP_HH - 2);
      var lw = 100 / (it.lanes || 1), left = (it.lane || 0) * lw;
      col += _apGridBlock(it, top, hgt, left, lw);
    });
    col += '</div>';
    html += col;
  });
  html += '</div></div></div>';
  host.innerHTML = html;
}

// ── MONTH grid ──
function _apRenderMonth(host) {
  var first = new Date(_apAnchor.getFullYear(), _apAnchor.getMonth(), 1);
  var gs = apMondayOf(first), todayStr = _apDateStr(_apFacilityToday()), coachF = _apCalCoach;
  var byDate = {};
  (_apAppts || []).forEach(function (a) {
    if (coachF && a.staff_id !== coachF) return; if (a.status === 'cancelled') return;
    var k = _apLocalParts(a.start_at).dateStr; (byDate[k] = byDate[k] || []).push(a);
  });
  var dows = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  var html = '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;">';
  dows.forEach(function (d) { html += '<div class="psub" style="text-align:center;font-weight:700;">' + d + '</div>'; });
  for (var i = 0; i < 42; i++) {
    var day = new Date(gs); day.setDate(day.getDate() + i);
    var inMonth = day.getMonth() === _apAnchor.getMonth();
    var k = _apDateStr(day);
    var list = (byDate[k] || []).sort(function (a, b) { return new Date(a.start_at) - new Date(b.start_at); });
    var isT = k === todayStr;
    html += '<div onclick="apOpenDay(\'' + k + '\')" style="min-height:94px;cursor:pointer;border:1px solid ' + (isT ? '#1980AD' : 'var(--ffp-border,#1d3346)') + ';border-radius:8px;padding:5px 6px;background:' + (inMonth ? 'var(--ffp-bg-2,#0f1f2c)' : 'transparent') + ';opacity:' + (inMonth ? 1 : .45) + ';overflow:hidden;">';
    html += '<div style="font-weight:800;font-size:12px;color:' + (isT ? '#1980AD' : 'var(--ffp-text,#eaf2f8)') + ';">' + day.getDate() + '</div>';
    list.slice(0, 3).forEach(function (a) {
      var t = _apHHMM(_apLocalParts(a.start_at).min);
      html += '<div style="font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:' + _apBlockColor(a.status).fg + ';">' + t + ' ' + apEsc(a.member_name || a.member_email || '') + '</div>';
    });
    if (list.length > 3) html += '<div class="psub" style="font-size:10px;">+' + (list.length - 3) + ' more</div>';
    html += '</div>';
  }
  html += '</div>';
  host.innerHTML = html;
}
function apOpenDay(dateStr) { var p = dateStr.split('-'); _apAnchor = new Date(+p[0], +p[1] - 1, +p[2]); _apView = 'day'; apRenderCalendar(); }

// ── DAY view: a column per coach, 30-min rows, shaded availability, click empty space to book ──
function _apDayCoaches() {
  var list = (_apStaff || []).slice();
  if (_apCalCoach) list = list.filter(function (s) { return s.id === _apCalCoach; });
  return list;
}
function _apRenderDay(host, day) {
  var coaches = _apDayCoaches();
  if (!coaches.length) { host.innerHTML = _apEmpty('No coaches', 'Add a coach in Staff, then set their availability — they’ll each get a column here.'); return; }
  var dateStr = _apDateStr(day), key = day.toDateString();
  // Full 24-hour day is always viewable (scrolls).
  var startH = 0, endH = 24;
  var HH = _AP_HH, halfH = HH / 2, rangeStart = 0, halfRows = 48;
  var colW = 'repeat(' + coaches.length + ',150px)';
  var minW = 56 + coaches.length * 150;
  var html = '<div style="overflow-x:auto;"><div style="min-width:' + minW + 'px;">';
  // coach header
  html += '<div style="display:grid;grid-template-columns:54px ' + colW + ';"><div></div>';
  coaches.forEach(function (c) {
    html += '<div style="text-align:center;padding:9px 4px;border-left:2px solid var(--ffp-border-mid,#ccd9da);background:var(--ffp-bg-3,#eef1f3);font-weight:800;font-size:12px;color:var(--ffp-text,#0e2531);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + apEsc(c.full_name || 'Coach') + '</div>';
  });
  html += '</div>';
  // body
  html += '<div style="display:grid;grid-template-columns:54px ' + colW + ';">';
  // time gutter (30-min)
  html += '<div>';
  for (var r = 0; r < halfRows; r++) { var mm = rangeStart + r * 30; html += '<div style="height:' + halfH + 'px;font-size:10px;color:#9fb3c2;text-align:right;padding-right:6px;"><span style="position:relative;top:-6px;">' + _apHHMM(mm) + '</span></div>'; }
  html += '</div>';
  coaches.forEach(function (c) {
    var avail = _apAvailForDayCoach(c.id, day);
    var appts = (_apAppts || []).filter(function (a) { return a.staff_id === c.id && _apLocalParts(a.start_at).dateStr === dateStr && a.status !== 'cancelled'; });
    var col = '<div onclick="apDayColClick(event,this,\'' + c.id + '\',\'' + dateStr + '\',' + startH + ')" style="position:relative;border-left:2px solid var(--ffp-border-mid,#ccd9da);height:' + (halfRows * halfH) + 'px;cursor:copy;">';
    // availability shading (behind) — YELLOW = available / free to book
    avail.forEach(function (w) {
      var s = _apMin(w.start_time), e = _apMin(w.end_time); if (s == null || e == null) return;
      var top = ((s - rangeStart) / 60) * HH, h = ((e - s) / 60) * HH;
      col += '<div style="position:absolute;left:0;right:0;top:' + top + 'px;height:' + h + 'px;background:#FFE8A3;border-left:4px solid ' + AP_AVAIL.bd + ';pointer-events:none;"></div>';
    });
    // blocked windows — DARK GREY, above availability
    _apBlocksForDayCoach(c.id, day).forEach(function (b) {
      var bs = b.start_time ? _apMin(b.start_time) : rangeStart, be = b.end_time ? _apMin(b.end_time) : endH * 60;
      if (bs == null || be == null || be <= bs) { bs = rangeStart; be = endH * 60; }
      col += '<div title="Blocked" style="position:absolute;left:0;right:0;top:' + (((bs - rangeStart) / 60) * HH) + 'px;height:' + (((be - bs) / 60) * HH) + 'px;background:' + AP_BLOCK.bg + ';opacity:.92;pointer-events:none;"></div>';
    });
    // 30-min gridlines
    for (var r2 = 0; r2 < halfRows; r2++) { col += '<div style="position:absolute;left:0;right:0;top:' + (r2 * halfH) + 'px;border-top:1px ' + (r2 % 2 === 0 ? 'solid' : 'dashed') + ' var(--ffp-border,#1d3346);opacity:' + (r2 % 2 === 0 ? .5 : .3) + ';pointer-events:none;"></div>'; }
    // appointment blocks
    var items = appts.map(function (a) { var sM = _apLocalParts(a.start_at).min; return { kind: 'appt', a: a, startMin: sM, endMin: sM + (a.duration_min || 60) }; });
    _apLanePack(items);
    items.forEach(function (it) { var top = ((it.startMin - rangeStart) / 60) * HH; var hgt = Math.max(20, ((it.endMin - it.startMin) / 60) * HH - 2); var lw = 100 / (it.lanes || 1), left = (it.lane || 0) * lw; col += _apGridBlock(it, top, hgt, left, lw); });
    col += '</div>';
    html += col;
  });
  html += '</div></div></div>';
  html += '<div class="psub" style="margin:8px 2px 0;display:flex;flex-wrap:wrap;gap:12px;align-items:center;">' +
    '<span style="display:inline-flex;align-items:center;gap:5px;"><span style="width:13px;height:13px;border-radius:3px;background:#FFE8A3;border:1px solid ' + AP_AVAIL.bd + ';"></span>Available</span>' +
    '<span style="display:inline-flex;align-items:center;gap:5px;"><span style="width:13px;height:13px;border-radius:3px;background:#1f9d57;"></span>Booked</span>' +
    '<span style="display:inline-flex;align-items:center;gap:5px;"><span style="width:13px;height:13px;border-radius:3px;background:' + AP_BLOCK.bg + ';"></span>Blocked</span>' +
    '<span style="opacity:.8;">· tap an available (yellow) slot to book</span></div>';
  host.innerHTML = html;
}
function apDayColClick(ev, el, coachId, dateStr, startH) {
  var rect = el.getBoundingClientRect();
  var y = (ev.clientY != null ? ev.clientY : 0) - rect.top;
  var mins = startH * 60 + Math.round(((y / _AP_HH) * 60) / 30) * 30;
  if (mins < startH * 60) mins = startH * 60;
  var p = dateStr.split('-'); var day = new Date(+p[0], +p[1] - 1, +p[2]);
  var svc = '', dur = 60, inAvail = false;
  _apAvailForDayCoach(coachId, day).forEach(function (w) {
    var s = _apMin(w.start_time), e = _apMin(w.end_time);
    if (s != null && e != null && mins >= s && mins < e) { svc = w.service_id || svc; dur = w.duration_min || dur; inAvail = true; }
  });
  // An appointment can only be booked inside SET availability (and not in a blocked window).
  if (!inAvail || _apBlockedAt(coachId, day.getDay(), dateStr, mins, mins + dur)) {
    apToast('No availability set there — set the coach’s availability first, then book the yellow slot', 'error');
    return;
  }
  apBookModal({ start: dateStr + 'T' + _apHHMM(mins), staff_id: coachId, service_id: svc, duration: dur });
}

// ── Appointment detail + actions (opened from a grid block) ──
function apApptDetail(id) {
  var a = (_apAppts || []).find(function (x) { return x.id === id; }); if (!a) return;
  var lp = _apLocalParts(a.start_at); var dp = lp.dateStr.split('-'); var dd = new Date(+dp[0], +dp[1] - 1, +dp[2]);
  var when = dd.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'short' }) + ' · ' + _apHHMM(lp.min);
  var _nm = apEsc(a.member_name || a.member_email || 'Client');
  var body = '<div class="form-section">' +
    '<div style="display:flex;gap:6px;margin-bottom:12px;">' + _apStatusChip(a.status) + _apPayChip(a) + '</div>' +
    '<div style="background:var(--ffp-bg-3,#eef1f3);border:1px solid var(--ffp-border-mid,#ccd9da);border-radius:12px;padding:14px 16px;">' +
      (a.member_id && window.openClientProfile
        ? '<div onclick="openClientProfile(\'' + a.member_id + '\')" style="font-size:17px;font-weight:800;color:#1980AD;cursor:pointer;display:inline-flex;align-items:center;gap:4px;" title="Open client profile">' + _nm + '<span class="ms" style="font-size:16px;">chevron_right</span></div>'
        : '<div style="font-size:17px;font-weight:800;color:var(--ffp-text,#0f2327);">' + _nm + '</div>') +
      '<div style="font-size:13.5px;font-weight:700;color:var(--ffp-text,#0f2327);margin-top:7px;">' + apEsc(a.service_name || 'Service') + ' · ' + apEsc(a.coach_name || 'Coach') + '</div>' +
      '<div style="font-size:13.5px;font-weight:600;color:var(--ffp-text-muted,#5a6b6e);margin-top:3px;">' + when + ' · ' + (a.duration_min || 60) + ' min</div>' +
      (a.status === 'completed' ? '<div style="font-size:13px;font-weight:600;color:var(--ffp-text,#0f2327);margin-top:9px;">Value ' + apMoney(a.price_aed) + ' · tax ' + apMoney(a.tax_aed) + ' · coach ' + apMoney(a.commission_aed) + ' · facility net <b style="color:#15833f;">' + apMoney(a.payout_aed) + '</b></div>' : '') +
      (a.notes ? '<div style="font-size:13px;font-style:italic;color:var(--ffp-text-muted,#5a6b6e);margin-top:9px;">“' + apEsc(a.notes) + '”</div>' : '') +
    '</div></div>';
  var B = function (fn, label, cls, icon) { return '<button class="btn ' + (cls || 'btn-ghost') + ' btn-sm" onclick="closeModal(); ' + fn + '(\'' + a.id + '\')"><span class="ms">' + icon + '</span> ' + label + '</button>'; };
  var acts = [];
  if (a.status === 'scheduled') { acts = [B('apCheckin', 'Check in', 'btn-sec', 'how_to_reg'), B('apTrainerDone', 'Mark done', 'btn-ghost', 'task_alt'), B('apReschedule', 'Reschedule', 'btn-ghost', 'edit_calendar'), B('apNoShow', 'No-show', 'btn-ghost', 'person_off'), B('apCancel', 'Cancel', 'btn-ghost', 'close')]; }
  else if (a.status === 'checked_in') { acts = [B('apTrainerDone', 'Mark done', 'btn-sec', 'task_alt'), B('apNoShow', 'No-show', 'btn-ghost', 'person_off'), B('apCancel', 'Cancel', 'btn-ghost', 'close')]; }
  else if (a.status === 'completed_pending') { acts = [B('apConfirm', 'Confirm completed', 'btn-pri', 'verified'), B('apCancel', 'Cancel', 'btn-ghost', 'close')]; }
  body += '<div style="display:flex;gap:6px;flex-wrap:wrap;">' + acts.join('') + '</div>';
  openModalShell('', 'Appointment', body, '<button class="btn btn-ghost" onclick="closeModal()">Close</button>');
}

function _apStatusChip(st) {
  // [label, text colour, SOLID background]
  var map = {
    scheduled:         ['Scheduled', '#ffffff', '#1980AD'],
    checked_in:        ['Checked in', '#ffffff', '#1f9d57'],
    completed_pending: ['Awaiting confirm', '#3a2c00', '#F2B807'],
    completed:         ['Completed', '#ffffff', '#15833f'],
    no_show:           ['No-show', '#ffffff', '#c0392b'],
    cancelled:         ['Cancelled', '#ffffff', '#6b7a82']
  };
  var c = map[st] || [st, '#ffffff', '#6b7a82'];
  return '<span style="display:inline-flex;align-items:center;font-size:11.5px;font-weight:800;padding:4px 10px;border-radius:999px;color:' + c[1] + ';background:' + c[2] + ';">' + c[0] + '</span>';
}
function _apPayChip(a) {
  var p = a.payment_status;
  // [label, text colour, SOLID background]
  var map = {
    package: ['Package', '#ffffff', '#1980AD'],
    paid:    ['Paid', '#ffffff', '#15833f'],
    comp:    ['Comp', '#ffffff', '#6b7a82'],
    unpaid:  ['Unpaid', '#ffffff', '#c0392b']
  };
  var c = map[p] || ['Unpaid', '#ffffff', '#c0392b'];
  return '<span style="display:inline-flex;align-items:center;font-size:11.5px;font-weight:800;padding:4px 10px;border-radius:999px;color:' + c[1] + ';background:' + c[2] + ';">' + c[0] + '</span>';
}

function apApptCard(a) {
  var t = _apHHMM(_apLocalParts(a.start_at).min);
  var dim = (a.status === 'cancelled' || a.status === 'no_show');
  var acts = [];
  if (a.status === 'scheduled') {
    acts.push(_apBtn('apCheckin', a.id, 'how_to_reg', 'Check in', 'btn-sec'));
    acts.push(_apBtn('apTrainerDone', a.id, 'task_alt', 'Mark done', 'btn-ghost'));
    acts.push(_apBtn('apReschedule', a.id, 'edit_calendar', '', 'btn-ghost', 'Reschedule'));
    acts.push(_apBtn('apNoShow', a.id, 'person_off', '', 'btn-ghost', 'No-show'));
    acts.push(_apBtn('apCancel', a.id, 'close', '', 'btn-ghost', 'Cancel'));
  } else if (a.status === 'checked_in') {
    acts.push(_apBtn('apTrainerDone', a.id, 'task_alt', 'Mark done', 'btn-sec'));
    acts.push(_apBtn('apNoShow', a.id, 'person_off', '', 'btn-ghost', 'No-show'));
    acts.push(_apBtn('apCancel', a.id, 'close', '', 'btn-ghost', 'Cancel'));
  } else if (a.status === 'completed_pending') {
    acts.push(_apBtn('apConfirm', a.id, 'verified', 'Confirm completed', 'btn-pri'));
    acts.push(_apBtn('apCancel', a.id, 'close', '', 'btn-ghost', 'Cancel'));
  }
  var payoutLine = '';
  if (a.status === 'completed') {
    payoutLine = '<div class="psub" style="margin:6px 0 0;font-size:12px;">Value ' + apMoney(a.price_aed) +
      ' · tax ' + apMoney(a.tax_aed) + ' · coach ' + apMoney(a.commission_aed) + ' · facility net <b style="color:#7ee0a8;">' + apMoney(a.payout_aed) + '</b></div>';
  } else if (a.status === 'completed_pending') {
    payoutLine = '<div class="psub" style="margin:6px 0 0;font-size:12px;">Trainer marked done — confirm to release coach commission.</div>';
  }
  return '<div style="background:var(--ffp-bg-2,#0f1f2c);border:1px solid var(--ffp-border,#1d3346);border-radius:12px;padding:11px 13px;margin-bottom:9px;' + (dim ? 'opacity:.6;' : '') + '">' +
      '<div style="display:flex;align-items:flex-start;gap:12px;flex-wrap:wrap;">' +
        '<div style="min-width:54px;font-weight:800;color:var(--ffp-text,#eaf2f8);">' + t + '</div>' +
        '<div style="flex:1;min-width:160px;">' +
          '<div style="font-weight:800;color:var(--ffp-text,#eaf2f8);">' + apEsc(a.member_name || a.member_email || 'Client') + '</div>' +
          '<div class="psub" style="margin:2px 0 0;">' + apEsc(a.service_name || 'Service') + ' · ' + apEsc(a.coach_name || 'Coach') + ' · ' + (a.duration_min || 60) + ' min</div>' +
          payoutLine +
        '</div>' +
        '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;">' +
          '<div style="display:flex;gap:5px;flex-wrap:wrap;justify-content:flex-end;">' + _apStatusChip(a.status) + _apPayChip(a) + '</div>' +
        '</div>' +
      '</div>' +
      (acts.length ? '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:9px;justify-content:flex-end;">' + acts.join('') + '</div>' : '') +
  '</div>';
}
function _apBtn(fn, id, icon, label, cls, title) {
  return '<button class="btn ' + (cls || 'btn-ghost') + ' btn-sm"' + (title ? ' title="' + title + '"' : '') +
    ' onclick="' + fn + '(\'' + id + '\')"><span class="ms">' + icon + '</span>' + (label ? ' ' + label : '') + '</button>';
}
function _apEmpty(title, sub) {
  return '<div style="text-align:center;padding:30px 16px;border:1px dashed var(--ffp-border,#1d3346);border-radius:12px;">' +
    '<div style="font-weight:800;color:var(--ffp-text,#eaf2f8);">' + title + '</div>' +
    '<div class="psub" style="margin:6px 0 0;">' + sub + '</div></div>';
}

// ── calendar action handlers ──
async function _apRpc(fn, args, okMsg) {
  var pid = apProvId();
  try {
    var r = await window.supabase.rpc(fn, args);
    if (r && r.error) throw r.error;
    var res = (r && r.data) ? r.data : null;
    if (res && res.ok === false) {
      var em = {
        coach_busy: 'That coach already has a session at this time',
        coach_unavailable: 'The coach is blocked / unavailable at that time',
        no_sessions_left: 'No sessions left on that package',
        package_expired: 'That package has expired',
        no_package_selected: 'Pick which package to use',
        bad_state: 'That action isn’t available for this appointment',
        bad_window: 'End time must be after the start time',
        need_date: 'Pick a date',
        already_booked: 'Already booked'
      };
      apToast(em[res.error] || 'Could not complete that', 'error');
      return null;
    }
    if (okMsg) apToast(okMsg, 'success');
    return res || { ok: true };
  } catch (e) { apToast('Something went wrong', 'error'); return null; }
}
async function apCheckin(id)     { if (await _apRpc('provider_checkin_appointment', { p_provider: apProvId(), p_id: id }, 'Checked in')) apRenderCalendar(); }
async function apTrainerDone(id) {
  var a = _apAppts.find(function (x) { return x.id === id; }) || {};
  if (await _apRpc('provider_trainer_complete_appointment', { p_provider: apProvId(), p_id: id, p_staff: a.staff_id || null }, 'Marked done — awaiting facility confirmation')) apRenderCalendar();
}
async function apConfirm(id) {
  var by = (window.FFP_PROVIDER && window.FFP_PROVIDER.name) || 'Facility';
  var res = await _apRpc('provider_confirm_appointment', { p_provider: apProvId(), p_id: id, p_by: by }, 'Session confirmed — commission released');
  if (res) apRenderCalendar();
}
async function apNoShow(id) {
  if (!confirm('Mark this appointment as a no-show? The package session stays used.')) return;
  if (await _apRpc('provider_appointment_no_show', { p_provider: apProvId(), p_id: id, p_restore: false }, 'Marked no-show')) apRenderCalendar();
}
async function apCancel(id) {
  if (!confirm('Cancel this appointment? If it used a package session it will be credited back.')) return;
  if (await _apRpc('provider_cancel_appointment', { p_provider: apProvId(), p_id: id, p_restore: true }, 'Appointment cancelled')) apRenderCalendar();
}

// ── reschedule ──
function apReschedule(id) {
  var a = _apAppts.find(function (x) { return x.id === id; }) || {};
  var local = _apToLocalInput(a.start_at);
  var body =
    '<div class="form-section"><div class="form-grid">' +
      '<div class="field"><div class="label">New date &amp; time</div><input class="input" type="datetime-local" id="ap-rs-when" value="' + local + '"></div>' +
      '<div class="field"><div class="label">Coach</div><select class="select" id="ap-rs-coach">' + _apStaffOpts(a.staff_id) + '</select></div>' +
    '</div></div>';
  openModalShell('', 'Reschedule appointment',
    '<div class="psub" style="margin:0 0 10px;">' + apEsc(a.member_name || 'Client') + ' · ' + apEsc(a.service_name || '') + '</div>' + body,
    '<button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-pri" onclick="apSaveReschedule(\'' + id + '\')">Save</button>');
  apEnhance(['ap-rs-coach']);
}
async function apSaveReschedule(id) {
  var when = (document.getElementById('ap-rs-when') || {}).value;
  var coach = (document.getElementById('ap-rs-coach') || {}).value || null;
  if (!when) { apToast('Pick a date and time', 'error'); return; }
  var iso = _apToISO(when);
  var res = await _apRpc('provider_reschedule_appointment', { p_provider: apProvId(), p_id: id, p_start: iso, p_staff: coach, p_duration: null }, 'Rescheduled');
  if (res) { closeModal(); apRenderCalendar(); }
}
function _apToLocalInput(iso) {
  if (!iso) return '';
  var p = _apLocalParts(iso);   // facility-local, matches FFPTime.toUTC on save
  return p.dateStr + 'T' + _apHHMM(p.min);
}
function _apToISO(localVal) {
  try { if (window.FFPTime && window.FFPTime.toUTC) return window.FFPTime.toUTC(localVal); } catch (e) {}
  return new Date(localVal).toISOString();
}

// ════════════════════════════════════════════════════════════════════════
// BOOK APPOINTMENT
// ════════════════════════════════════════════════════════════════════════
function _apServiceCoachOpts(serviceId, sel) {
  var sv = _apServices.find(function (s) { return s.id === serviceId; });
  if (sv && sv.coaches && sv.coaches.length) {
    return '<option value="">Select a coach…</option>' + sv.coaches.map(function (c) {
      return '<option value="' + c.staff_id + '"' + (sel === c.staff_id ? ' selected' : '') + '>' + apEsc(c.coach_name) + '</option>';
    }).join('');
  }
  return _apStaffOpts(sel);
}
function apBookModal(prefill) {
  if (!_apServices.length) { apToast('Add a service first (Services tab)', 'error'); return; }
  if (!_apStaff.length) { apToast('Add a coach in Staff first', 'error'); return; }
  prefill = (prefill && typeof prefill === 'object') ? prefill : {};
  var when = prefill.start || _apToLocalInput(new Date(Date.now() + 3600000).toISOString());
  var whenDate = (when.split('T')[0] || ''), whenTime = (when.split('T')[1] || '09:00');
  var selSvc = prefill.service_id || '', selCoach = prefill.staff_id || '', dur = prefill.duration || 60;
  var coachOpts = selSvc ? _apServiceCoachOpts(selSvc, selCoach) : _apStaffOpts(selCoach);
  var body =
    '<div class="form-section"><div class="form-grid">' +
      '<div class="field"><div class="label">Date <span class="req">*</span></div><input class="input" type="date" id="ap-bk-date" value="' + whenDate + '"></div>' +
      '<div class="field"><div class="label">Time <span class="req">*</span></div><input class="input" type="time" step="300" id="ap-bk-time" value="' + whenTime + '"></div>' +
      '<div class="field"><div class="label">Service <span class="req">*</span></div><select class="select" id="ap-bk-service" onchange="apBkServiceChange()">' + _apServiceOpts(selSvc) + '</select></div>' +
      '<div class="field"><div class="label">Coach <span class="req">*</span></div><select class="select" id="ap-bk-coach">' + coachOpts + '</select></div>' +
      '<div class="field"><div class="label">Client <span class="req">*</span></div><select class="select" id="ap-bk-client" onchange="apBkClientChange()">' + _apMemberOpts('') + '</select></div>' +
      '<div class="field"><div class="label">Duration (min)</div><input class="input" type="number" min="5" step="5" id="ap-bk-duration" value="' + dur + '"></div>' +
      '<div class="field"><div class="label">Payment</div><select class="select" id="ap-bk-pay" onchange="apBkPayChange()">' +
        '<option value="package">Use a package</option><option value="cash">Cash</option><option value="card">Card</option><option value="comp">Comp (free)</option><option value="unpaid">Unpaid / bill later</option>' +
      '</select></div>' +
    '</div>' +
    '<div class="field" id="ap-bk-pkg-wrap" style="margin-top:10px;"><div class="label">Package to use</div><select class="select" id="ap-bk-pkg"><option value="">Select a client first…</option></select></div>' +
    '<div class="field" style="margin-top:10px;"><div class="label">Notes <span class="label-hint">— optional</span></div><input class="input" id="ap-bk-notes" placeholder="Anything the coach should know"></div>' +
    '</div>';
  openModalShell('lg', 'Book appointment', body,
    '<button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-pri" onclick="apSaveBooking()"><span class="ms">event_available</span> Book</button>');
  apEnhance(['ap-bk-service', 'ap-bk-coach', 'ap-bk-client', 'ap-bk-pay', 'ap-bk-pkg']);
}
function apBkServiceChange() {
  var sid = (document.getElementById('ap-bk-service') || {}).value;
  var sv = _apServices.find(function (s) { return s.id === sid; });
  if (sv) {
    var dur = document.getElementById('ap-bk-duration'); if (dur && sv.duration_min) dur.value = sv.duration_min;
    // narrow coach list to linked coaches if any
    var coachSel = document.getElementById('ap-bk-coach');
    if (coachSel && sv.coaches && sv.coaches.length) {
      coachSel.innerHTML = '<option value="">Select a coach…</option>' + sv.coaches.map(function (c) {
        return '<option value="' + c.staff_id + '">' + apEsc(c.coach_name) + '</option>';
      }).join('');
      if (window.FFPSelect) { try { window.FFPSelect.enhance(coachSel); } catch (e) {} }
    }
  }
}
function apBkClientChange() { apRefreshBkPackages(); }
function apBkPayChange() {
  var wrap = document.getElementById('ap-bk-pkg-wrap');
  var pay = (document.getElementById('ap-bk-pay') || {}).value;
  if (wrap) wrap.style.display = (pay === 'package') ? '' : 'none';
  if (pay === 'package') apRefreshBkPackages();
}
async function apRefreshBkPackages() {
  var pay = (document.getElementById('ap-bk-pay') || {}).value;
  if (pay !== 'package') return;
  var mid = (document.getElementById('ap-bk-client') || {}).value;
  var sel = document.getElementById('ap-bk-pkg'); if (!sel) return;
  if (!mid) { sel.innerHTML = '<option value="">Select a client first…</option>'; return; }
  sel.innerHTML = '<option value="">Loading…</option>';
  var list = [];
  try {
    var r = await window.supabase.rpc('provider_list_client_packages', { p_provider: apProvId(), p_member: mid });
    list = ((r && r.data) ? r.data : []).filter(function (p) { return p.status === 'active' && p.sessions_remaining > 0; });
  } catch (e) {}
  _apClientPkgCache[mid] = list;
  if (!list.length) { sel.innerHTML = '<option value="">No active package — choose another payment</option>'; }
  else {
    sel.innerHTML = list.map(function (p) {
      return '<option value="' + p.id + '">' + apEsc(p.name || 'Package') + ' · ' + p.sessions_remaining + '/' + p.sessions_total + ' left</option>';
    }).join('');
  }
  if (window.FFPSelect) { try { window.FFPSelect.enhance(sel); } catch (e) {} }
}
async function apSaveBooking() {
  var service = (document.getElementById('ap-bk-service') || {}).value;
  var coach = (document.getElementById('ap-bk-coach') || {}).value;
  var client = (document.getElementById('ap-bk-client') || {}).value;
  var date = (document.getElementById('ap-bk-date') || {}).value;
  var time = (document.getElementById('ap-bk-time') || {}).value;
  var dur = parseInt((document.getElementById('ap-bk-duration') || {}).value, 10) || 60;
  var pay = (document.getElementById('ap-bk-pay') || {}).value;
  var pkg = (document.getElementById('ap-bk-pkg') || {}).value;
  var notes = (document.getElementById('ap-bk-notes') || {}).value;
  if (!service || !coach || !client || !date || !time) { apToast('Date, time, service, coach and client are required', 'error'); return; }
  var when = date + 'T' + time;
  // An appointment can only be booked inside the coach's SET availability (and not in a blocked window).
  var _sMin = _apMin(time);
  if (_sMin == null || !_apWithinAvailability(coach, date, _sMin, _sMin + dur)) {
    apToast('That time is outside the coach’s set availability — set availability first, or pick an available (yellow) slot', 'error');
    return;
  }
  if (pay === 'package' && !pkg) { apToast('Pick which package to use (or change the payment method)', 'error'); return; }
  var payload = {
    staff_id: coach, service_id: service, member_id: client, start_at: _apToISO(when),
    duration_min: dur, pay_with: pay, notes: notes
  };
  if (pay === 'package') payload.client_package_id = pkg;
  var res = await _apRpc('provider_book_appointment', { p_provider: apProvId(), p: payload }, 'Appointment booked');
  if (res) { closeModal(); apRenderCalendar(); }
}

// ════════════════════════════════════════════════════════════════════════
// SERVICES & COACHES
// ════════════════════════════════════════════════════════════════════════
function apRenderServices() {
  var host = document.getElementById('ap-services-host'); if (!host) return;
  if (!_apServices.length) { host.innerHTML = _apEmpty('No services yet', 'Add a service like “Personal Training (60 min)”, then link the coaches who deliver it.'); return; }
  host.innerHTML = _apServices.map(function (s) {
    var coaches = (s.coaches || []).map(function (c) {
      var comm = c.commission_type === 'flat' ? (apMoney(c.commission_value) + ' flat') : (c.commission_value + '%');
      return '<span style="display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:700;padding:4px 9px;border-radius:999px;color:#cbd6df;background:rgba(255,255,255,.06);margin:3px 4px 0 0;">' +
        apEsc(c.coach_name) + ' · ' + comm +
        '<button class="lk-x" title="Remove" onclick="apRemoveCoach(\'' + c.link_id + '\')" style="background:none;border:none;color:#ff9b9b;cursor:pointer;font-weight:800;">×</button></span>';
    }).join('');
    return '<div style="background:var(--ffp-bg-2,#0f1f2c);border:1px solid var(--ffp-border,#1d3346);border-radius:12px;padding:13px 15px;margin-bottom:10px;">' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap;">' +
        '<div style="min-width:180px;">' +
          '<div style="font-weight:800;color:var(--ffp-text,#eaf2f8);">' + apEsc(s.name) + (s.status !== 'active' ? ' <span class="psub">(inactive)</span>' : '') + '</div>' +
          '<div class="psub" style="margin:2px 0 0;">' + apMoney(s.price_aed) + ' · ' + (s.duration_min || 60) + ' min · tax ' + (s.tax_rate || 0) + '%' + (s.capacity > 1 ? ' · up to ' + s.capacity : '') + '</div>' +
        '</div>' +
        '<div style="display:flex;gap:6px;">' +
          '<button class="btn btn-sec btn-sm" onclick="apServiceModal(\'' + s.id + '\')"><span class="ms">edit</span></button>' +
          '<button class="btn btn-ghost btn-sm" onclick="apDeleteService(\'' + s.id + '\')"><span class="ms">delete</span></button>' +
        '</div>' +
      '</div>' +
      '<div style="margin-top:10px;">' +
        '<div class="psub" style="margin:0 0 4px;">Coaches &amp; commission</div>' +
        (coaches || '<span class="psub">No coaches linked yet.</span>') +
        '<div style="margin-top:8px;"><button class="btn btn-ghost btn-sm" onclick="apAddCoachModal(\'' + s.id + '\')"><span class="ms">person_add</span> Link a coach</button></div>' +
      '</div>' +
    '</div>';
  }).join('');
}
function apServiceModal(id) {
  var s = _apServices.find(function (x) { return x.id === id; }) || { name: '', service_type: 'one_on_one', price_aed: '', duration_min: 60, capacity: 1, tax_rate: '', status: 'active' };
  var types = [['one_on_one', '1-on-1'], ['group', 'Group'], ['assessment', 'Assessment'], ['other', 'Other']];
  var body =
    '<div class="form-section"><div class="form-grid">' +
      '<div class="field" style="grid-column:1/-1;"><div class="label">Service name <span class="req">*</span></div><input class="input" id="ap-sv-name" value="' + apEsc(s.name) + '" placeholder="e.g. Personal Training (60 min)"></div>' +
      '<div class="field"><div class="label">Type</div><select class="select" id="ap-sv-type">' + types.map(function (t) { return '<option value="' + t[0] + '"' + (s.service_type === t[0] ? ' selected' : '') + '>' + t[1] + '</option>'; }).join('') + '</select></div>' +
      '<div class="field"><div class="label">Price (' + apCcy() + ') <span class="req">*</span></div><input class="input" type="number" min="0" id="ap-sv-price" value="' + apEsc(String(s.price_aed || '')) + '" placeholder="0 = free"></div>' +
      '<div class="field"><div class="label">Duration (min)</div><input class="input" type="number" min="5" step="5" id="ap-sv-duration" value="' + apEsc(String(s.duration_min || 60)) + '"></div>' +
      '<div class="field"><div class="label">Tax rate (%)</div><input class="input" type="number" min="0" step="0.5" id="ap-sv-tax" value="' + apEsc(String(s.tax_rate || '')) + '" placeholder="e.g. 5"></div>' +
      '<div class="field"><div class="label">Capacity</div><input class="input" type="number" min="1" id="ap-sv-capacity" value="' + apEsc(String(s.capacity || 1)) + '"></div>' +
      '<div class="field"><div class="label">Status</div><select class="select" id="ap-sv-status"><option value="active"' + (s.status === 'active' ? ' selected' : '') + '>Active</option><option value="inactive"' + (s.status !== 'active' ? ' selected' : '') + '>Inactive</option></select></div>' +
    '</div></div>';
  openModalShell('', id ? 'Edit service' : 'Add service', body,
    '<button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-pri" onclick="apSaveService(\'' + (id || '') + '\')">Save</button>');
  apEnhance(['ap-sv-type', 'ap-sv-status']);
}
async function apSaveService(id) {
  var name = (document.getElementById('ap-sv-name') || {}).value.trim();
  if (!name) { apToast('Service name is required', 'error'); return; }
  var p = {
    name: name, service_type: (document.getElementById('ap-sv-type') || {}).value,
    price_aed: (document.getElementById('ap-sv-price') || {}).value || '0',
    duration_min: (document.getElementById('ap-sv-duration') || {}).value || '60',
    tax_rate: (document.getElementById('ap-sv-tax') || {}).value || '0',
    capacity: (document.getElementById('ap-sv-capacity') || {}).value || '1',
    status: (document.getElementById('ap-sv-status') || {}).value || 'active'
  };
  var r = await _apRpc('provider_save_service', { p_provider: apProvId(), p_id: id || null, p: p }, 'Service saved');
  if (r) { closeModal(); await _apLoadConfig(); apRenderServices(); }
}
async function apDeleteService(id) {
  if (!confirm('Delete this service? Its coach links are removed too. Past appointments are kept.')) return;
  var r = await _apRpc('provider_delete_service', { p_provider: apProvId(), p_id: id }, 'Service deleted');
  if (r) { await _apLoadConfig(); apRenderServices(); }
}
function apAddCoachModal(serviceId) {
  if (!_apStaff.length) { apToast('Add a coach in Staff first', 'error'); return; }
  var body =
    '<div class="form-section"><div class="form-grid">' +
      '<div class="field" style="grid-column:1/-1;"><div class="label">Coach <span class="req">*</span></div><select class="select" id="ap-cc-staff">' + _apStaffOpts('') + '</select></div>' +
      '<div class="field"><div class="label">Commission type</div><select class="select" id="ap-cc-type" onchange="apCcTypeChange()"><option value="percent">% of session price</option><option value="flat">Flat amount</option></select></div>' +
      '<div class="field"><div class="label"><span id="ap-cc-vlabel">Percentage (%)</span></div><input class="input" type="number" min="0" step="0.5" id="ap-cc-value" value="" placeholder="e.g. 60"></div>' +
    '</div></div>';
  openModalShell('', 'Link a coach', body,
    '<button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-pri" onclick="apSaveCoach(\'' + serviceId + '\')">Link</button>');
  apEnhance(['ap-cc-staff', 'ap-cc-type']);
}
function apCcTypeChange() {
  var t = (document.getElementById('ap-cc-type') || {}).value;
  var l = document.getElementById('ap-cc-vlabel'); if (l) l.textContent = (t === 'flat') ? ('Flat amount (' + apCcy() + ')') : 'Percentage (%)';
}
async function apSaveCoach(serviceId) {
  var staff = (document.getElementById('ap-cc-staff') || {}).value;
  var type = (document.getElementById('ap-cc-type') || {}).value || 'percent';
  var val = parseFloat((document.getElementById('ap-cc-value') || {}).value) || 0;
  if (!staff) { apToast('Pick a coach', 'error'); return; }
  var r = await _apRpc('provider_save_service_coach', { p_provider: apProvId(), p_service: serviceId, p_staff: staff, p_commission_type: type, p_commission_value: val }, 'Coach linked');
  if (r) { closeModal(); await _apLoadConfig(); apRenderServices(); }
}
async function apRemoveCoach(linkId) {
  var r = await _apRpc('provider_delete_service_coach', { p_provider: apProvId(), p_link: linkId }, 'Coach unlinked');
  if (r) { await _apLoadConfig(); apRenderServices(); }
}

// ════════════════════════════════════════════════════════════════════════
// AVAILABILITY (recurring trainer slots)
// ════════════════════════════════════════════════════════════════════════
var _AP_CHIP = 'display:inline-flex;align-items:center;gap:8px;background:var(--ffp-bg-2,#0f1f2c);border:1px solid var(--ffp-border,#1d3346);border-radius:10px;padding:7px 11px;';
function apRenderAvailability() {
  var host = document.getElementById('ap-availability-host'); if (!host) return;
  if (!_apSlots.length && !_apBlocks.length) {
    host.innerHTML = _apEmpty('No availability set', 'Set each trainer’s weekly available hours (day + start–end time), then add any blocked times or days off.');
    return;
  }
  var coaches = {};
  _apSlots.forEach(function (s) { (coaches[s.coach_name || 'Coach'] = coaches[s.coach_name || 'Coach'] || { slots: [], blocks: [] }).slots.push(s); });
  _apBlocks.forEach(function (b) { (coaches[b.coach_name || 'Coach'] = coaches[b.coach_name || 'Coach'] || { slots: [], blocks: [] }).blocks.push(b); });
  var html = '';
  Object.keys(coaches).sort().forEach(function (name) {
    var c = coaches[name];
    html += '<div style="background:var(--ffp-bg-2,#0f1f2c);border:1px solid var(--ffp-border,#1d3346);border-radius:12px;padding:13px 15px;margin-bottom:12px;">';
    html += '<div style="font-weight:800;color:var(--ffp-text,#eaf2f8);margin-bottom:8px;">' + apEsc(name) + '</div>';
    html += '<div class="psub" style="margin:0 0 5px;">Available hours</div>';
    if (!c.slots.length) html += '<div class="psub" style="margin:0 0 6px;opacity:.7;">No weekly hours set.</div>';
    else html += '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:6px;">' + c.slots.map(function (s) {
      var rng = s.end_time ? (s.start_time + '–' + s.end_time) : s.start_time;
      var label = s.slot_date ? (s.slot_date + ' (one-off)') : ('Every ' + DOW_AP[s.day_of_week]);
      return '<span style="' + _AP_CHIP + '"><b style="color:var(--ffp-text,#eaf2f8);">' + label + ' ' + rng + '</b>' +
        '<span class="psub">' + (s.service_name ? apEsc(s.service_name) : 'Any') + ' · ' + (s.duration_min || 60) + 'm</span>' +
        '<button class="btn btn-ghost btn-sm" onclick="apSlotModal(\'' + s.id + '\')"><span class="ms">edit</span></button>' +
        '<button class="btn btn-ghost btn-sm" onclick="apDeleteSlot(\'' + s.id + '\')"><span class="ms">delete</span></button></span>';
    }).join('') + '</div>';
    if (c.blocks.length) {
      html += '<div class="psub" style="margin:10px 0 5px;">Blocked / unavailable</div>';
      html += '<div style="display:flex;flex-wrap:wrap;gap:8px;">' + c.blocks.map(function (b) {
        var when = b.block_type === 'recurring' ? ('Every ' + DOW_AP[b.day_of_week]) : (b.block_date || '');
        var time = (b.start_time && b.end_time) ? (b.start_time + '–' + b.end_time) : 'All day';
        return '<span style="' + _AP_CHIP + 'border-color:rgba(243,156,18,.4);">' +
          '<span class="ms" style="color:#ffcf8f;font-size:16px;">block</span>' +
          '<b style="color:#ffcf8f;">' + when + ' · ' + time + '</b>' +
          (b.reason ? '<span class="psub">' + apEsc(b.reason) + '</span>' : '') +
          '<button class="btn btn-ghost btn-sm" onclick="apBlockModal(\'' + b.id + '\')"><span class="ms">edit</span></button>' +
          '<button class="btn btn-ghost btn-sm" onclick="apDeleteBlock(\'' + b.id + '\')"><span class="ms">delete</span></button></span>';
      }).join('') + '</div>';
    }
    html += '</div>';
  });
  host.innerHTML = html;
}

// ── Availability hours (window: day + start–end) ──
function apSlotModal(id) {
  if (!_apStaff.length) { apToast('Add a coach in Staff first', 'error'); return; }
  var s = _apSlots.find(function (x) { return x.id === id; }) || { staff_id: '', service_id: '', day_of_week: 1, slot_date: '', start_time: '09:00', end_time: '17:00', duration_min: 60 };
  var oneOff = !!s.slot_date;
  var dows = [1, 2, 3, 4, 5, 6, 0];
  var body =
    '<div class="psub" style="margin:0 0 10px;">The hours this trainer is available for appointments.</div>' +
    '<div class="form-section"><div class="form-grid">' +
      '<div class="field"><div class="label">Coach <span class="req">*</span></div><select class="select" id="ap-sl-staff">' + _apStaffOpts(s.staff_id) + '</select></div>' +
      '<div class="field"><div class="label">Repeats</div><select class="select" id="ap-sl-repeat" onchange="apSlotRepeatChange()">' +
        '<option value="weekly"' + (!oneOff ? ' selected' : '') + '>Every week</option>' +
        '<option value="once"' + (oneOff ? ' selected' : '') + '>One-off date</option>' +
      '</select></div>' +
      '<div class="field" id="ap-sl-dow-wrap"' + (oneOff ? ' style="display:none;"' : '') + '><div class="label">Day <span class="req">*</span></div><select class="select" id="ap-sl-dow">' + dows.map(function (d) { return '<option value="' + d + '"' + (s.day_of_week === d ? ' selected' : '') + '>' + DOW_AP[d] + '</option>'; }).join('') + '</select></div>' +
      '<div class="field" id="ap-sl-date-wrap"' + (!oneOff ? ' style="display:none;"' : '') + '><div class="label">Date <span class="req">*</span></div><input class="input" type="date" id="ap-sl-date" value="' + apEsc(s.slot_date || '') + '"></div>' +
      '<div class="field"><div class="label">Start time <span class="req">*</span></div><input class="input" type="time" id="ap-sl-start" value="' + apEsc(s.start_time || '09:00') + '"></div>' +
      '<div class="field"><div class="label">End time <span class="req">*</span></div><input class="input" type="time" id="ap-sl-end" value="' + apEsc(s.end_time || '17:00') + '"></div>' +
      '<div class="field"><div class="label">Service <span class="label-hint">— optional</span></div><select class="select" id="ap-sl-service">' + _apServiceOpts(s.service_id, true) + '</select></div>' +
      '<div class="field"><div class="label">Default session (min)</div><input class="input" type="number" min="5" step="5" id="ap-sl-duration" value="' + apEsc(String(s.duration_min || 60)) + '"></div>' +
    '</div></div>';
  openModalShell('', id ? 'Edit available hours' : 'Add available hours', body,
    '<button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-pri" onclick="apSaveSlot(\'' + (id || '') + '\')">Save</button>');
  apEnhance(['ap-sl-staff', 'ap-sl-repeat', 'ap-sl-service', 'ap-sl-dow']);
}
function apSlotRepeatChange() {
  var v = (document.getElementById('ap-sl-repeat') || {}).value;
  var dw = document.getElementById('ap-sl-dow-wrap'), dt = document.getElementById('ap-sl-date-wrap');
  if (dw) dw.style.display = (v === 'weekly') ? '' : 'none';
  if (dt) dt.style.display = (v === 'once') ? '' : 'none';
}
async function apSaveSlot(id) {
  var staff = (document.getElementById('ap-sl-staff') || {}).value;
  var repeat = (document.getElementById('ap-sl-repeat') || {}).value || 'weekly';
  var start = (document.getElementById('ap-sl-start') || {}).value;
  var end = (document.getElementById('ap-sl-end') || {}).value;
  if (!staff || !start || !end) { apToast('Coach, start and end time are required', 'error'); return; }
  if (end <= start) { apToast('End time must be after the start time', 'error'); return; }
  var p = {
    staff_id: staff, service_id: (document.getElementById('ap-sl-service') || {}).value || '',
    start_time: start, end_time: end, duration_min: (document.getElementById('ap-sl-duration') || {}).value || '60'
  };
  if (repeat === 'once') {
    p.slot_date = (document.getElementById('ap-sl-date') || {}).value;
    if (!p.slot_date) { apToast('Pick a date', 'error'); return; }
  } else {
    p.day_of_week = (document.getElementById('ap-sl-dow') || {}).value;
  }
  var r = await _apRpc('provider_save_trainer_slot', { p_provider: apProvId(), p_id: id || null, p: p }, 'Availability saved');
  if (r) { closeModal(); await _apLoadConfig(); apRenderAvailability(); }
}
async function apDeleteSlot(id) {
  if (!confirm('Remove these available hours?')) return;
  var r = await _apRpc('provider_delete_trainer_slot', { p_provider: apProvId(), p_id: id }, 'Removed');
  if (r) { await _apLoadConfig(); apRenderAvailability(); }
}

// ── Blocks / day off ──
function apBlockModal(id) {
  if (!_apStaff.length) { apToast('Add a coach in Staff first', 'error'); return; }
  var b = _apBlocks.find(function (x) { return x.id === id; }) || { staff_id: '', block_type: 'date', day_of_week: 1, block_date: '', start_time: '', end_time: '', reason: '' };
  var allDay = !(b.start_time && b.end_time);
  var dows = [1, 2, 3, 4, 5, 6, 0];
  var body =
    '<div class="psub" style="margin:0 0 10px;">Mark a time the trainer is <b>not</b> available — a one-off day/time, or every week. Clients can’t be booked then.</div>' +
    '<div class="form-section"><div class="form-grid">' +
      '<div class="field"><div class="label">Coach <span class="req">*</span></div><select class="select" id="ap-blk-staff">' + _apStaffOpts(b.staff_id) + '</select></div>' +
      '<div class="field"><div class="label">Repeats</div><select class="select" id="ap-blk-type" onchange="apBlkTypeChange()">' +
        '<option value="date"' + (b.block_type === 'date' ? ' selected' : '') + '>One-off date</option>' +
        '<option value="recurring"' + (b.block_type === 'recurring' ? ' selected' : '') + '>Every week</option>' +
      '</select></div>' +
      '<div class="field" id="ap-blk-date-wrap"><div class="label">Date</div><input class="input" type="date" id="ap-blk-date" value="' + apEsc(b.block_date || '') + '"></div>' +
      '<div class="field" id="ap-blk-dow-wrap" style="display:none;"><div class="label">Day</div><select class="select" id="ap-blk-dow">' + dows.map(function (d) { return '<option value="' + d + '"' + (b.day_of_week === d ? ' selected' : '') + '>' + DOW_AP[d] + '</option>'; }).join('') + '</select></div>' +
    '</div>' +
    '<label style="display:flex;align-items:center;gap:8px;margin:10px 0;cursor:pointer;"><input type="checkbox" id="ap-blk-allday" ' + (allDay ? 'checked' : '') + ' onchange="apBlkAllDayChange()"> <span>Whole day off</span></label>' +
    '<div class="form-grid" id="ap-blk-time-wrap" style="' + (allDay ? 'display:none;' : '') + '">' +
      '<div class="field"><div class="label">From</div><input class="input" type="time" id="ap-blk-start" value="' + apEsc(b.start_time || '12:00') + '"></div>' +
      '<div class="field"><div class="label">To</div><input class="input" type="time" id="ap-blk-end" value="' + apEsc(b.end_time || '13:00') + '"></div>' +
    '</div>' +
    '<div class="field" style="margin-top:10px;"><div class="label">Reason <span class="label-hint">— optional</span></div><input class="input" id="ap-blk-reason" value="' + apEsc(b.reason || '') + '" placeholder="e.g. Lunch, leave, training"></div>' +
    '</div>';
  openModalShell('', id ? 'Edit block' : 'Add block / day off', body,
    '<button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-pri" onclick="apSaveBlock(\'' + (id || '') + '\')">Save</button>');
  apEnhance(['ap-blk-staff', 'ap-blk-type', 'ap-blk-dow']);
  apBlkTypeChange();
}
function apBlkTypeChange() {
  var t = (document.getElementById('ap-blk-type') || {}).value;
  var dw = document.getElementById('ap-blk-date-wrap'), ow = document.getElementById('ap-blk-dow-wrap');
  if (dw) dw.style.display = (t === 'date') ? '' : 'none';
  if (ow) ow.style.display = (t === 'recurring') ? '' : 'none';
}
function apBlkAllDayChange() {
  var on = (document.getElementById('ap-blk-allday') || {}).checked;
  var w = document.getElementById('ap-blk-time-wrap'); if (w) w.style.display = on ? 'none' : '';
}
async function apSaveBlock(id) {
  var staff = (document.getElementById('ap-blk-staff') || {}).value;
  var type = (document.getElementById('ap-blk-type') || {}).value || 'date';
  var allDay = (document.getElementById('ap-blk-allday') || {}).checked;
  if (!staff) { apToast('Pick a coach', 'error'); return; }
  var p = { staff_id: staff, block_type: type, reason: (document.getElementById('ap-blk-reason') || {}).value || '' };
  if (type === 'date') { p.block_date = (document.getElementById('ap-blk-date') || {}).value; if (!p.block_date) { apToast('Pick a date', 'error'); return; } }
  else { p.day_of_week = (document.getElementById('ap-blk-dow') || {}).value; }
  if (!allDay) {
    p.start_time = (document.getElementById('ap-blk-start') || {}).value;
    p.end_time = (document.getElementById('ap-blk-end') || {}).value;
    if (!p.start_time || !p.end_time) { apToast('Set a from/to time, or tick Whole day off', 'error'); return; }
    if (p.end_time <= p.start_time) { apToast('End time must be after the start time', 'error'); return; }
  }
  var r = await _apRpc('provider_save_trainer_block', { p_provider: apProvId(), p_id: id || null, p: p }, 'Block saved');
  if (r) { closeModal(); await _apLoadConfig(); apRenderAvailability(); }
}
async function apDeleteBlock(id) {
  if (!confirm('Remove this block?')) return;
  var r = await _apRpc('provider_delete_trainer_block', { p_provider: apProvId(), p_id: id }, 'Block removed');
  if (r) { await _apLoadConfig(); apRenderAvailability(); }
}

// ════════════════════════════════════════════════════════════════════════
// PACKAGES (catalog + sell + client packages with sessions remaining)
// ════════════════════════════════════════════════════════════════════════
async function apRenderPackages() {
  var host = document.getElementById('ap-packages-host');
  var chost = document.getElementById('ap-client-packages-host');
  if (host) {
    if (!_apPackages.length) { host.innerHTML = _apEmpty('No packages yet', 'Create a package like “10 PT Sessions” that clients can buy.'); }
    else {
      host.innerHTML = _apPackages.map(function (p) {
        return '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;background:var(--ffp-bg-2,#0f1f2c);border:1px solid var(--ffp-border,#1d3346);border-radius:12px;padding:12px 14px;margin-bottom:9px;flex-wrap:wrap;">' +
          '<div style="min-width:180px;"><div style="font-weight:800;color:var(--ffp-text,#eaf2f8);">' + apEsc(p.name) + (p.status !== 'active' ? ' <span class="psub">(inactive)</span>' : '') + '</div>' +
          '<div class="psub" style="margin:2px 0 0;">' + p.sessions_count + ' sessions · ' + apMoney(p.price_aed) + ' · tax ' + (p.tax_rate || 0) + '%' + (p.service_name ? ' · ' + apEsc(p.service_name) : ' · any service') + (p.validity_days ? ' · valid ' + p.validity_days + 'd' : '') + '</div></div>' +
          '<div style="display:flex;gap:6px;">' +
            '<button class="btn btn-sec btn-sm" onclick="apSellModal(\'' + p.id + '\')"><span class="ms">sell</span> Sell</button>' +
            '<button class="btn btn-ghost btn-sm" onclick="apPackageModal(\'' + p.id + '\')"><span class="ms">edit</span></button>' +
            '<button class="btn btn-ghost btn-sm" onclick="apDeletePackage(\'' + p.id + '\')"><span class="ms">delete</span></button>' +
          '</div></div>';
      }).join('');
    }
  }
  if (chost) {
    chost.innerHTML = '<div class="psub" style="margin:8px 0;">Loading…</div>';
    var list = [];
    try { var r = await window.supabase.rpc('provider_list_client_packages', { p_provider: apProvId() }); list = (r && r.data) ? r.data : []; } catch (e) {}
    if (!list.length) { chost.innerHTML = '<div class="psub" style="margin:6px 0;">No client packages sold yet.</div>'; }
    else {
      chost.innerHTML = list.map(function (cp) {
        var pct = cp.sessions_total ? Math.round(100 * cp.sessions_remaining / cp.sessions_total) : 0;
        var low = cp.sessions_remaining <= 1;
        var statusTxt = cp.status === 'active' ? '' : ' · ' + cp.status;
        return '<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;background:var(--ffp-bg-2,#0f1f2c);border:1px solid var(--ffp-border,#1d3346);border-radius:12px;padding:11px 14px;margin-bottom:8px;flex-wrap:wrap;">' +
          '<div style="min-width:170px;"><div style="font-weight:700;color:var(--ffp-text,#eaf2f8);">' + apEsc(cp.member_name || cp.member_email || '—') + '</div>' +
          '<div class="psub" style="margin:2px 0 0;">' + apEsc(cp.name || 'Package') + (cp.expiry_date ? ' · exp ' + cp.expiry_date : '') + statusTxt + '</div></div>' +
          '<div style="display:flex;align-items:center;gap:10px;">' +
            '<div style="width:120px;height:7px;border-radius:4px;background:rgba(255,255,255,.08);overflow:hidden;"><div style="height:100%;width:' + pct + '%;background:' + (low ? '#f39c12' : '#1980AD') + ';"></div></div>' +
            '<b style="color:' + (low ? '#ffcf8f' : 'var(--ffp-text,#eaf2f8)') + ';min-width:54px;text-align:right;">' + cp.sessions_remaining + ' / ' + cp.sessions_total + '</b>' +
          '</div></div>';
      }).join('');
    }
  }
}
function apPackageModal(id) {
  if (!id && !_apServices.length) { apToast('Add a service first — a package pays for a service (Services tab)', 'error'); return; }
  var p = _apPackages.find(function (x) { return x.id === id; }) || { name: '', service_id: '', sessions_count: 10, price_aed: '', tax_rate: '', validity_days: '', status: 'active' };
  var body =
    '<div class="form-section"><div class="form-grid">' +
      '<div class="field" style="grid-column:1/-1;"><div class="label">Package name <span class="req">*</span></div><input class="input" id="ap-pk-name" value="' + apEsc(p.name) + '" placeholder="e.g. 10 PT Sessions"></div>' +
      '<div class="field"><div class="label">Service <span class="req">*</span></div><select class="select" id="ap-pk-service">' + _apServiceOpts(p.service_id, false) + '</select></div>' +
      '<div class="field"><div class="label">Sessions <span class="req">*</span></div><input class="input" type="number" min="1" id="ap-pk-sessions" value="' + apEsc(String(p.sessions_count || 1)) + '"></div>' +
      '<div class="field"><div class="label">Price (' + apCcy() + ')</div><input class="input" type="number" min="0" id="ap-pk-price" value="' + apEsc(String(p.price_aed || '')) + '"></div>' +
      '<div class="field"><div class="label">Tax rate (%)</div><input class="input" type="number" min="0" step="0.5" id="ap-pk-tax" value="' + apEsc(String(p.tax_rate || '')) + '"></div>' +
      '<div class="field"><div class="label">Validity (days) <span class="label-hint">— blank = no expiry</span></div><input class="input" type="number" min="1" id="ap-pk-validity" value="' + apEsc(String(p.validity_days || '')) + '"></div>' +
      '<div class="field"><div class="label">Status</div><select class="select" id="ap-pk-status"><option value="active"' + (p.status === 'active' ? ' selected' : '') + '>Active</option><option value="inactive"' + (p.status !== 'active' ? ' selected' : '') + '>Inactive</option></select></div>' +
    '</div></div>';
  openModalShell('', id ? 'Edit package' : 'Add package', body,
    '<button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-pri" onclick="apSavePackage(\'' + (id || '') + '\')">Save</button>');
  apEnhance(['ap-pk-service', 'ap-pk-status']);
}
async function apSavePackage(id) {
  var name = (document.getElementById('ap-pk-name') || {}).value.trim();
  if (!name) { apToast('Package name is required', 'error'); return; }
  var _pkSvc = (document.getElementById('ap-pk-service') || {}).value || '';
  if (!_pkSvc) { apToast('Choose the service this package pays for', 'error'); return; }
  var p = {
    name: name, service_id: _pkSvc,
    sessions_count: (document.getElementById('ap-pk-sessions') || {}).value || '1',
    price_aed: (document.getElementById('ap-pk-price') || {}).value || '0',
    tax_rate: (document.getElementById('ap-pk-tax') || {}).value || '0',
    validity_days: (document.getElementById('ap-pk-validity') || {}).value || '',
    status: (document.getElementById('ap-pk-status') || {}).value || 'active'
  };
  var r = await _apRpc('provider_save_package', { p_provider: apProvId(), p_id: id || null, p: p }, 'Package saved');
  if (r) { closeModal(); await _apLoadConfig(); apRenderPackages(); }
}
async function apDeletePackage(id) {
  if (!confirm('Delete this package? Already-sold client packages are kept.')) return;
  var r = await _apRpc('provider_delete_package', { p_provider: apProvId(), p_id: id }, 'Package deleted');
  if (r) { await _apLoadConfig(); apRenderPackages(); }
}
function apSellModal(packageId) {
  if (!_apPackages.length) { apToast('Create a package first', 'error'); return; }
  var pkgOpts = _apPackages.filter(function (p) { return p.status === 'active'; }).map(function (p) {
    return '<option value="' + p.id + '"' + (packageId === p.id ? ' selected' : '') + '>' + apEsc(p.name) + ' · ' + p.sessions_count + ' sessions · ' + apMoney(p.price_aed) + '</option>';
  }).join('');
  var body =
    '<div class="form-section"><div class="form-grid">' +
      '<div class="field" style="grid-column:1/-1;"><div class="label">Client <span class="req">*</span></div><select class="select" id="ap-sell-client">' + _apMemberOpts('') + '</select></div>' +
      '<div class="field" style="grid-column:1/-1;"><div class="label">Package <span class="req">*</span></div><select class="select" id="ap-sell-pkg">' + pkgOpts + '</select></div>' +
      '<div class="field"><div class="label">Payment taken</div><select class="select" id="ap-sell-pay"><option value="cash">Cash</option><option value="card">Card</option><option value="online">Online</option><option value="comp">Comp</option></select></div>' +
    '</div>' +
    '<div class="psub" style="margin-top:6px;">This records the sale and credits the sessions to the client. Each booked appointment counts one down.</div>' +
    '</div>';
  openModalShell('', 'Sell a package', body,
    '<button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-pri" onclick="apDoSell()"><span class="ms">sell</span> Sell</button>');
  apEnhance(['ap-sell-client', 'ap-sell-pkg', 'ap-sell-pay']);
}
async function apDoSell() {
  var client = (document.getElementById('ap-sell-client') || {}).value;
  var pkg = (document.getElementById('ap-sell-pkg') || {}).value;
  var pay = (document.getElementById('ap-sell-pay') || {}).value || 'cash';
  if (!client || !pkg) { apToast('Pick a client and a package', 'error'); return; }
  var r = await _apRpc('provider_sell_package', { p_provider: apProvId(), p_member: client, p_package: pkg, p_pay_with: pay }, 'Package sold');
  if (r) { closeModal(); apRenderPackages(); }
}

// ════════════════════════════════════════════════════════════════════════
// REPORTS (completed sessions, revenue, tax, commission, net — by coach & service)
// ════════════════════════════════════════════════════════════════════════
function _apReportRange(key) {
  var now = new Date(), from = null, to = null;
  var startOfMonth = function (y, m) { return new Date(y, m, 1, 0, 0, 0); };
  if (key === 'this_month') { from = startOfMonth(now.getFullYear(), now.getMonth()); to = startOfMonth(now.getFullYear(), now.getMonth() + 1); }
  else if (key === 'last_month') { from = startOfMonth(now.getFullYear(), now.getMonth() - 1); to = startOfMonth(now.getFullYear(), now.getMonth()); }
  else if (key === 'last_30') { to = new Date(now.getTime() + 86400000); from = new Date(now.getTime() - 30 * 86400000); }
  else if (key === 'this_year') { from = new Date(now.getFullYear(), 0, 1); to = new Date(now.getFullYear() + 1, 0, 1); }
  else { from = null; to = null; } // all time
  return { from: from ? from.toISOString() : null, to: to ? to.toISOString() : null };
}
async function apRenderReports() {
  var host = document.getElementById('ap-reports-host'); if (!host) return;
  var key = (document.getElementById('ap-rep-range') || {}).value || 'this_month';
  var b = _apReportRange(key);
  host.innerHTML = '<div class="psub" style="margin:10px 0;">Loading…</div>';
  var rep = null;
  try {
    var r = await window.supabase.rpc('provider_appointments_report', { p_provider: apProvId(), p_from: b.from, p_to: b.to });
    rep = (r && r.data) ? r.data : null;
  } catch (e) {}
  if (!rep) { host.innerHTML = _apEmpty('No report', 'Could not load the report — try again.'); return; }
  var s = rep.summary || {};
  var kpi = function (label, val, color) {
    return '<div style="flex:1;min-width:130px;background:var(--ffp-bg-2,#0f1f2c);border:1px solid var(--ffp-border,#1d3346);border-radius:12px;padding:13px 15px;">' +
      '<div class="psub" style="margin:0 0 4px;font-size:12px;">' + label + '</div>' +
      '<div style="font-weight:800;font-size:20px;color:' + (color || 'var(--ffp-text,#eaf2f8)') + ';">' + val + '</div></div>';
  };
  var money = apMoney;
  var html = '';
  // money KPIs
  html += '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px;">' +
    kpi('Gross revenue', money(s.gross_aed)) +
    kpi('Tax', money(s.tax_aed)) +
    kpi('Coach commission', money(s.commission_aed), '#ffcf8f') +
    kpi('Facility net', money(s.net_aed), '#7ee0a8') +
  '</div>';
  // session-count KPIs
  html += '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:8px;">' +
    kpi('Completed', s.completed || 0, '#7ee0a8') +
    kpi('Awaiting confirm', s.completed_pending || 0, '#ffcf8f') +
    kpi('No-shows', s.no_show || 0, '#ff9b9b') +
    kpi('Cancelled', s.cancelled || 0) +
    kpi('Unpaid', (s.unpaid_count || 0) + ' · ' + money(s.unpaid_aed), (s.unpaid_count ? '#ff9b9b' : null)) +
  '</div>';
  // by coach
  html += '<div class="form-section-title" style="margin-top:18px;">By coach</div>';
  var coaches = rep.by_coach || [];
  if (!coaches.length) html += '<div class="psub" style="margin:6px 0;">No completed sessions in this period.</div>';
  else {
    html += '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:13px;">' +
      '<thead><tr style="text-align:left;color:#9fb3c2;">' +
      '<th style="padding:7px 8px;">Coach</th><th style="padding:7px 8px;">Sessions</th><th style="padding:7px 8px;">Gross</th><th style="padding:7px 8px;">Commission</th><th style="padding:7px 8px;">Facility net</th></tr></thead><tbody>';
    coaches.forEach(function (c) {
      html += '<tr style="border-top:1px solid var(--ffp-border,#1d3346);">' +
        '<td style="padding:7px 8px;font-weight:700;color:var(--ffp-text,#eaf2f8);">' + apEsc(c.coach_name) + '</td>' +
        '<td style="padding:7px 8px;">' + c.sessions + '</td>' +
        '<td style="padding:7px 8px;">' + money(c.gross_aed) + '</td>' +
        '<td style="padding:7px 8px;color:#ffcf8f;">' + money(c.commission_aed) + '</td>' +
        '<td style="padding:7px 8px;color:#7ee0a8;">' + money(c.net_aed) + '</td></tr>';
    });
    html += '</tbody></table></div>';
  }
  // by service
  html += '<div class="form-section-title" style="margin-top:18px;">By service</div>';
  var svcs = rep.by_service || [];
  if (!svcs.length) html += '<div class="psub" style="margin:6px 0;">No completed sessions in this period.</div>';
  else {
    html += '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:13px;">' +
      '<thead><tr style="text-align:left;color:#9fb3c2;">' +
      '<th style="padding:7px 8px;">Service</th><th style="padding:7px 8px;">Sessions</th><th style="padding:7px 8px;">Gross</th><th style="padding:7px 8px;">Tax</th><th style="padding:7px 8px;">Facility net</th></tr></thead><tbody>';
    svcs.forEach(function (sv) {
      html += '<tr style="border-top:1px solid var(--ffp-border,#1d3346);">' +
        '<td style="padding:7px 8px;font-weight:700;color:var(--ffp-text,#eaf2f8);">' + apEsc(sv.service_name) + '</td>' +
        '<td style="padding:7px 8px;">' + sv.sessions + '</td>' +
        '<td style="padding:7px 8px;">' + money(sv.gross_aed) + '</td>' +
        '<td style="padding:7px 8px;">' + money(sv.tax_aed) + '</td>' +
        '<td style="padding:7px 8px;color:#7ee0a8;">' + money(sv.net_aed) + '</td></tr>';
    });
    html += '</tbody></table></div>';
  }
  host.innerHTML = html;
}

// First open: showPanel('appointments') calls renderAppointments(); this also covers the case
// where the script loads after the panel is already shown.
try { if (document.getElementById('ap-calendar-host') && document.getElementById('panel-appointments') && document.getElementById('panel-appointments').classList.contains('active')) renderAppointments(); } catch (e) {}
