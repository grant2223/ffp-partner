// ════════════════════════════════════════════════════════════════════════
// FFP Partner Portal — PAYMENTS & INVOICES module  (Business → Payments)
// Deferred loader: registered in _provLoaderSrc, lazy-loaded by
// ensureProviderLoader() the first time the Payments panel is opened.
//
// Manual revenue logging (no Stripe processing yet). provider_payments table
// via SECURITY DEFINER RPCs (p_provider scoped): provider_save_payment /
// provider_list_payments / provider_delete_payment / provider_mark_paid /
// provider_payment_summary.  status 'paid' = collected, 'pending' = invoice.
// ════════════════════════════════════════════════════════════════════════
var _billPayments = [];
var _billInvoices = [];
var _payMembers = [];
var PAY_METHODS = { cash: 'Cash', card: 'Card', transfer: 'Bank transfer', bank_deposit: 'Bank deposit', direct_debit: 'Direct debit', cheque: 'Cheque', online: 'Online', other: 'Other' };

function _billProvId() {
  return (window.FFP_PROVIDER && window.FFP_PROVIDER.id) ||
         (typeof providerProfile !== 'undefined' && providerProfile.id) || null;
}

async function _ensureBillMembers() {
  if (_payMembers.length) return;
  var pid = _billProvId();
  if (!pid) return;
  try { var r = await window.supabase.rpc('provider_list_members', { p_provider: pid }); _payMembers = (r && r.data) ? r.data : []; } catch (e) { _payMembers = []; }
}

// Plans (memberships / class packs) — a manual payment can record a PLAN purchase, which grants the
// membership/credits to the member (off-system: cash, bank deposit, direct debit, etc.). Mirrors the pro side.
var _billPlans = [];
async function _ensureBillPlans() {
  if (_billPlans.length) return;
  var pid = _billProvId();
  if (!pid) return;
  try { var r = await window.supabase.rpc('provider_list_plans', { p_provider: pid }); _billPlans = (r && r.data) ? r.data : []; } catch (e) { _billPlans = []; }
}
function _payPlanPick() {
  var sel = document.getElementById('pm-plan_id'); if (!sel) return;
  var opt = sel.options[sel.selectedIndex];
  if (!sel.value || !opt) return;
  var price = opt.getAttribute('data-price'); var nm = opt.getAttribute('data-name');
  var amtEl = document.getElementById('pm-amount_aed'); var descEl = document.getElementById('pm-description');
  if (amtEl && price) amtEl.value = price;
  if (descEl && nm && !descEl.value) descEl.value = nm;
}

function _ccy() { return (window.FFP_PROVIDER && FFP_PROVIDER.currency) || 'AED'; }
function _money(v) {
  var n = Number(v || 0);
  if (window.FFPCurrency) return FFPCurrency.format(isNaN(n) ? 0 : n, _ccy());
  return _ccy() + ' ' + (isNaN(n) ? 0 : n).toLocaleString();
}

function _metric(label, val) {
  return '<div style="flex:1;min-width:140px;background:var(--ffp-bg-3);border:1px solid var(--ffp-border);border-radius:10px;padding:11px 13px;">' +
    '<div class="psub" style="margin:0 0 3px;">' + label + '</div>' +
    '<div style="font-size:18px;font-weight:800;color:var(--ffp-text);">' + val + '</div></div>';
}

async function renderPayments() {
  var host = document.getElementById('pay-list');
  if (!host) return;
  var pid = _billProvId();
  if (!pid) { host.innerHTML = '<div class="empty-sub" style="text-align:left;">Sign in to manage payments.</div>'; return; }
  host.innerHTML = '<div class="psub" style="margin:10px 0;">Loading…</div>';
  var sum = {};
  try {
    var r = await window.supabase.rpc('provider_list_payments', { p_provider: pid, p_status: 'paid' });
    _billPayments = (r && r.data) ? r.data : [];
    var rs = await window.supabase.rpc('provider_payment_summary', { p_provider: pid });
    sum = (rs && rs.data) ? rs.data : {};
  } catch (e) { _billPayments = []; }
  var head = '<div style="display:flex;gap:10px;margin-bottom:12px;flex-wrap:wrap;">' +
    _metric('Collected (all time)', _money(sum.collected_total)) +
    _metric('This month', _money(sum.collected_month)) + '</div>';
  if (!_billPayments.length) {
    host.innerHTML = head + emptyState('No payments yet', 'Record your first payment — cash, card or transfer.', 'Record payment', "openPaymentModal('','payment')");
    return;
  }
  host.innerHTML = head + _billPayments.map(function (p) { return payRow(p, 'payment'); }).join('');
}

async function renderInvoices() {
  var host = document.getElementById('inv-list');
  if (!host) return;
  var pid = _billProvId();
  if (!pid) { host.innerHTML = '<div class="empty-sub" style="text-align:left;">Sign in to manage invoices.</div>'; return; }
  host.innerHTML = '<div class="psub" style="margin:10px 0;">Loading…</div>';
  var sum = {};
  try {
    var r = await window.supabase.rpc('provider_list_payments', { p_provider: pid, p_status: 'pending' });
    _billInvoices = (r && r.data) ? r.data : [];
    var rs = await window.supabase.rpc('provider_payment_summary', { p_provider: pid });
    sum = (rs && rs.data) ? rs.data : {};
  } catch (e) { _billInvoices = []; }
  var head = '<div style="display:flex;gap:10px;margin-bottom:12px;flex-wrap:wrap;">' +
    _metric('Outstanding', _money(sum.outstanding_total)) +
    _metric('Unpaid invoices', String(sum.outstanding_count || 0)) + '</div>';
  if (!_billInvoices.length) {
    host.innerHTML = head + emptyState('No invoices', 'Issue an invoice for money owed — mark it paid when it comes in.', 'New invoice', "openPaymentModal('','invoice')");
    return;
  }
  host.innerHTML = head + _billInvoices.map(function (p) { return payRow(p, 'invoice'); }).join('');
}

async function renderBillReports() {
  var host = document.getElementById('bill-reports');
  if (!host) return;
  var pid = _billProvId();
  if (!pid) { host.innerHTML = '<div class="empty-sub" style="text-align:left;">Sign in to view reports.</div>'; return; }
  host.innerHTML = '<div class="psub" style="margin:10px 0;">Loading…</div>';
  var d = {};
  try { var rs = await window.supabase.rpc('provider_business_report', { p_provider: pid }); d = (rs && rs.data) ? rs.data : {}; } catch (e) {}
  function sec(t) { return '<div class="psub" style="margin:18px 2px 8px;font-weight:800;letter-spacing:.4px;text-transform:uppercase;font-size:11px;">' + t + '</div>'; }
  function grid(cards) { return '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;">' + cards.join('') + '</div>'; }
  function num(v) { return String(v || 0); }
  host.innerHTML =
    sec('Revenue') + grid([
      _metric('Collected (all time)', _money(d.collected_total)),
      _metric('This month', _money(d.collected_month)),
      _metric('Outstanding', _money(d.outstanding_total))
    ]) +
    sec('Members') + grid([
      _metric('Total', num(d.members_total)),
      _metric('Active', num(d.members_active)),
      _metric('Trial', num(d.members_trial)),
      _metric('Lapsed', num(d.members_lapsed)),
      _metric('New this month', num(d.members_new_month))
    ]) +
    sec('Memberships') + grid([
      _metric('Active plans', num(d.memberships_active)),
      _metric('Expiring (30 days)', num(d.memberships_expiring_30d))
    ]) +
    sec('Attendance & activity') + grid([
      _metric('Check-ins (all time)', num(d.attendance_total)),
      _metric('Check-ins this month', num(d.attendance_month)),
      _metric('Upcoming sessions', num(d.sessions_upcoming)),
      _metric('Teams', num(d.teams_count)),
      _metric('Staff', num(d.staff_active))
    ]);
}

function payRow(p, mode) {
  var date = mode === 'invoice' ? (p.due_date ? 'due ' + p.due_date : '') : (p.paid_on ? p.paid_on : '');
  var sub = [];
  if (p.member_name) sub.push(escHtml(p.member_name));
  if (mode === 'payment' && p.method) sub.push(PAY_METHODS[p.method] || p.method);
  if (date) sub.push(date);
  var actions = '';
  if (mode === 'invoice') actions += '<button class="btn btn-pri btn-sm" onclick="markPaid(\'' + p.id + '\')"><span class="ms">check</span> Mark paid</button>';
  actions += '<button class="btn btn-sec btn-sm" onclick="openPaymentModal(\'' + p.id + '\',\'' + mode + '\')"><span class="ms">edit</span></button>';
  actions += '<button class="btn btn-ghost btn-sm" onclick="confirmDeletePayment(\'' + p.id + '\',\'' + mode + '\')"><span class="ms">delete</span></button>';
  return '<div style="background:var(--ffp-bg-2,#0f1f2c);border:1px solid var(--ffp-border,#1d3346);border-radius:12px;padding:11px 13px;margin-bottom:9px;display:flex;justify-content:space-between;align-items:flex-start;gap:10px;">' +
      '<div style="min-width:0;">' +
        '<div style="font-weight:800;color:var(--ffp-text,#eaf2f8);">' + escHtml(p.description || 'Payment') + '</div>' +
        (sub.length ? '<div class="psub" style="margin:2px 0 0;">' + sub.join(' · ') + '</div>' : '') +
      '</div>' +
      '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:7px;flex-shrink:0;">' +
        '<div style="font-weight:800;color:var(--ffp-text,#eaf2f8);">' + _money(p.amount_aed) + '</div>' +
        '<div style="display:flex;gap:6px;">' + actions + '</div>' +
      '</div>' +
  '</div>';
}

async function openPaymentModal(id, mode) {
  await _ensureBillMembers();
  if (mode === 'payment') await _ensureBillPlans();
  var editing = id ? (mode === 'invoice' ? _billInvoices : _billPayments).find(function (x) { return x.id === id; }) : null;
  var today = new Date();
  var todayStr = today.getFullYear() + '-' + ('0' + (today.getMonth() + 1)).slice(-2) + '-' + ('0' + today.getDate()).slice(-2);
  var p = editing || { member_id: '', description: '', amount_aed: '', method: 'cash', paid_on: todayStr, due_date: '' };
  var memberOpts = '<option value="">— No member —</option>' + _payMembers.map(function (m) {
    return '<option value="' + m.id + '"' + (p.member_id === m.id ? ' selected' : '') + '>' + escHtml(m.full_name || '—') + '</option>';
  }).join('');
  var whenField = mode === 'invoice'
    ? '<div class="field"><div class="label">Due date</div><input class="input" type="date" id="pm-due_date" value="' + (p.due_date ? String(p.due_date).slice(0, 10) : '') + '"></div>'
    : '<div class="field"><div class="label">Method</div><select class="select" id="pm-method">' +
        Object.keys(PAY_METHODS).map(function (k) { return '<option value="' + k + '"' + (p.method === k ? ' selected' : '') + '>' + PAY_METHODS[k] + '</option>'; }).join('') +
      '</select></div>' +
      '<div class="field"><div class="label">Paid on</div><input class="input" type="date" id="pm-paid_on" value="' + (p.paid_on ? String(p.paid_on).slice(0, 10) : todayStr) + '"></div>';
  var planField = (mode !== 'payment') ? '' : (
    '<div class="field full"><div class="label">Plan purchased <span style="color:var(--ffp-text-dim,#6c7f90);font-weight:600;">(optional — grants the membership/credits to the member)</span></div>' +
    '<select class="select" id="pm-plan_id" onchange="_payPlanPick()">' +
      '<option value="">Other / one-off (no plan)</option>' +
      _billPlans.map(function (pl) { return '<option value="' + pl.id + '" data-price="' + (pl.price_aed != null ? pl.price_aed : '') + '" data-name="' + escHtml(pl.name || 'Plan') + '"' + ((editing && editing.plan_id === pl.id) ? ' selected' : '') + '>' + escHtml(pl.name || 'Plan') + (pl.price_aed != null ? (' · ' + _money(pl.price_aed)) : '') + '</option>'; }).join('') +
    '</select></div>'
  );
  openModalShell('lg', (editing ? 'Edit ' : '') + (mode === 'invoice' ? 'Invoice' : 'Payment'), `
    <div class="form-section">
      <div class="form-section-title">${mode === 'invoice' ? 'Invoice' : 'Payment'}</div>
      <div class="form-grid">
        ${planField}
        <div class="field full"><div class="label">Description <span class="req">*</span></div><input class="input" id="pm-description" value="${escHtml(p.description || '')}" placeholder="${mode === 'invoice' ? 'e.g. June monthly membership' : 'e.g. Drop-in class'}"></div>
        <div class="field"><div class="label">Member</div><select class="select" id="pm-member_id">${memberOpts}</select></div>
        <div class="field"><div class="label">Amount (${_ccy()}) <span class="req">*</span></div><input class="input" type="number" id="pm-amount_aed" value="${escHtml(String(p.amount_aed || ''))}" placeholder="e.g. 50"></div>
        ${whenField}
      </div>
    </div>
  `, `
    ${editing ? '<button class="btn btn-ghost left" onclick="confirmDeletePayment(\'' + editing.id + '\',\'' + mode + '\')"><span class="ms">delete</span> Delete</button>' : ''}
    <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
    <button class="btn btn-pri" onclick="savePayment('${editing ? editing.id : ''}','${mode}')">${editing ? 'Save changes' : (mode === 'invoice' ? 'Create invoice' : 'Record payment')}</button>
  `);
}

async function savePayment(id, mode) {
  var g = function (i) { var el = document.getElementById('pm-' + i); return el ? el.value.trim() : ''; };
  var desc = g('description');
  var amount = g('amount_aed');
  if (!desc) { showToast('Description is required', 'error'); return; }
  if (!amount) { showToast('Amount is required', 'error'); return; }
  var pid = _billProvId();
  if (!pid) { showToast('Not signed in', 'error'); return; }
  var planId = (document.getElementById('pm-plan_id') || {}).value || '';
  if (mode === 'payment' && planId && !g('member_id')) { showToast('Choose the member who bought this plan', 'error'); return; }
  var payload = {
    description: desc, amount_aed: amount, member_id: g('member_id'),
    status: mode === 'invoice' ? 'pending' : 'paid'
  };
  if (mode === 'invoice') {
    payload.due_date = g('due_date');
  } else {
    payload.method = g('method') || 'cash';
    payload.paid_on = g('paid_on');
    if (planId) payload.plan_id = planId;
  }
  try {
    var r = await window.supabase.rpc('provider_save_payment', { p_provider: pid, p_id: id || null, p: payload });
    if (r && r.error) throw r.error;
    // A plan purchase grants the membership/credits to the member (off-system payment just recorded above).
    var granted_ok = true;
    if (mode === 'payment' && planId && g('member_id')) {
      try {
        var gr = await window.supabase.rpc('provider_assign_plan', { p_provider: pid, p_member: g('member_id'), p_plan: planId, p_start: g('paid_on') || null });
        granted_ok = !!(gr && gr.data && !gr.error);
      } catch (e2) { granted_ok = false; }
    }
    showToast(
      granted_ok ? (id ? 'Saved' : (mode === 'invoice' ? 'Invoice created' : (planId ? 'Payment recorded · plan granted' : 'Payment recorded')))
                 : 'Payment saved — but the plan could not be granted',
      granted_ok ? 'success' : 'error');
    closeModal();
    if (mode === 'invoice') renderInvoices(); else renderPayments();
  } catch (e) { showToast('Could not save', 'error'); }
}

function markPaid(id) {
  openModalShell('', 'Mark as paid',
    '<div class="form-section"><div class="form-section-title">Payment method</div><div class="form-grid"><div class="field full"><select class="select" id="mp-method">' +
      Object.keys(PAY_METHODS).map(function (k) { return '<option value="' + k + '">' + PAY_METHODS[k] + '</option>'; }).join('') +
    '</select></div></div></div>',
    '<button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-pri" onclick="doMarkPaid(\'' + id + '\')">Mark paid</button>');
}

async function doMarkPaid(id) {
  var pid = _billProvId();
  var m = document.getElementById('mp-method');
  try {
    var r = await window.supabase.rpc('provider_mark_paid', { p_provider: pid, p_id: id, p_method: m ? m.value : 'cash' });
    if (r && r.error) throw r.error;
    showToast('Marked paid', 'success');
  } catch (e) { showToast('Could not update', 'error'); }
  closeModal();
  renderInvoices();
  renderPayments();
}

function confirmDeletePayment(id, mode) {
  openModalShell('', (mode === 'invoice' ? 'Delete invoice?' : 'Delete payment?'), '<div class="psub" style="margin:6px 0;">This removes the record from your books.</div>', '<button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-pri" onclick="doDeletePayment(\'' + id + '\',\'' + mode + '\')">Delete</button>');
}

async function doDeletePayment(id, mode) {
  var pid = _billProvId();
  try {
    var r = await window.supabase.rpc('provider_delete_payment', { p_provider: pid, p_id: id });
    if (r && r.error) throw r.error;
    showToast('Deleted', 'success');
  } catch (e) { showToast('Could not delete', 'error'); }
  closeModal();
  if (mode === 'invoice') renderInvoices(); else renderPayments();
}

// First open: loaded by showPanel AFTER its synchronous render hook ran, so
// render the default (Payments) tab now if the panel is on screen.
try { if (document.getElementById('pay-list')) renderPayments(); } catch (e) {}
