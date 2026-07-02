// ════════════════════════════════════════════════════════════════════════
// FFP Partner Portal — MEMBERSHIPS & PACKAGES module  (Business → Memberships & Packages)
// Own panel (#panel-plans). Extracted from the members loader so each panel
// has its own loader. Renders the plan/pack CATALOG into #plans-list; the
// per-member assignment lives with the Directory (members loader).
// RPCs (p_provider scoped): provider_list_plans / provider_save_plan /
// provider_delete_plan / provider_list_session_templates.
// Top-level function declarations so inline onclick handlers resolve globally.
// ════════════════════════════════════════════════════════════════════════
function _memProvId() {
  return (window.FFP_PROVIDER && window.FFP_PROVIDER.id) ||
         (typeof providerProfile !== 'undefined' && providerProfile.id) || null;
}
var PLAN_TYPES = { recurring: 'Recurring membership', pack: 'Class pack', term: 'Term membership' };
var _plans = [];

async function renderPlans() {
  var host = document.getElementById('plans-list');
  if (!host) return;
  var pid = _memProvId();
  if (!pid) { host.innerHTML = '<div class="empty-sub" style="text-align:left;">Sign in to manage plans.</div>'; return; }
  host.innerHTML = '<div class="psub" style="margin:10px 0;">Loading…</div>';
  try {
    var r = await window.supabase.rpc('provider_list_plans', { p_provider: pid });
    _plans = (r && r.data) ? r.data : [];
  } catch (e) { _plans = []; }
  if (!_plans.length) {
    host.innerHTML = emptyState('No plans yet', 'Create a membership or class-pack, then assign it to members from the Directory.', 'New plan', 'openPlanModal()');
    return;
  }
  host.innerHTML = _plans.map(planRow).join('');
}

function planRow(p) {
  var meta = [PLAN_TYPES[p.plan_type] || 'Plan'];
  if (p.price_aed != null && p.price_aed !== '') meta.push(FFPCurrency.formatProvider(p.price_aed));
  if (p.plan_type === 'pack' && p.credits) meta.push(p.credits + ' credits');
  if (p.period_days) meta.push(p.period_days + ' days');
  var n = p.member_count || 0;
  return '<div style="background:var(--ffp-bg-2,#0f1f2c);border:1px solid var(--ffp-border,#1d3346);border-radius:12px;padding:11px 13px;margin-bottom:9px;display:flex;justify-content:space-between;align-items:flex-start;gap:10px;">' +
      '<div style="min-width:0;">' +
        '<div style="font-weight:800;color:var(--ffp-text,#eaf2f8);">' + escHtml(p.name) + '</div>' +
        '<div class="psub" style="margin:2px 0 0;">' + meta.join(' · ') + '</div>' +
        '<div class="psub" style="margin:2px 0 0;">' + n + ' on this plan</div>' +
      '</div>' +
      '<div style="display:flex;gap:6px;flex-shrink:0;">' +
        '<button class="btn btn-sec btn-sm" onclick="openPlanModal(\'' + p.id + '\')"><span class="ms">edit</span></button>' +
        '<button class="btn btn-ghost btn-sm" onclick="confirmDeletePlan(\'' + p.id + '\')"><span class="ms">delete</span></button>' +
      '</div>' +
  '</div>';
}

// Explanation for the "How do clients book + pay?" control — opened by the info icon (stacked overlay).
function _payHelp(){
  var old=document.getElementById('pay-help-ov'); if(old) old.remove();
  var ov=document.createElement('div'); ov.id='pay-help-ov';
  ov.setAttribute('style','position:fixed;inset:0;z-index:2000000000;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:20px;');
  ov.onclick=function(e){ if(e.target===ov) ov.remove(); };
  var row=function(t,d){ return '<div style="margin-bottom:13px;"><div style="font-weight:800;font-size:13.5px;color:var(--ffp-purple);">'+t+'</div><div class="psub" style="margin:2px 0 0;line-height:1.5;">'+d+'</div></div>'; };
  ov.innerHTML='<div style="max-width:430px;width:100%;background:var(--ffp-bg-2,#fff);border:1px solid var(--ffp-border-mid);border-radius:16px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.3);">'+
    '<div style="display:flex;justify-content:space-between;align-items:center;padding:14px 18px;border-bottom:1px solid var(--ffp-border);"><div style="font-weight:800;font-size:15px;color:var(--ffp-text);">How do clients book + pay?</div><button onclick="var e=document.getElementById(\'pay-help-ov\');if(e)e.remove();" style="background:var(--ffp-bg-3,#eef3f4);border:none;width:30px;height:30px;border-radius:50%;cursor:pointer;color:var(--ffp-text-muted);font-size:14px;">&#10005;</button></div>'+
    '<div style="padding:16px 18px;">'+
      row('Free to book','No payment required — the client just books, nothing is charged.')+
      row('Pay online to book','The client pays by card online before the booking is confirmed. Requires your Stripe account to be connected.')+
      row('Book now, pay later','The booking is confirmed straight away and you collect payment yourself — cash, card in person, bank transfer or direct debit. (If Stripe is connected, the client can also choose to pay online.)')+
    '</div></div>';
  document.body.appendChild(ov);
}
async function openPlanModal(id) {
  var editing = id ? _plans.find(function (x) { return x.id === id; }) : null;
  var p = editing || { name: '', plan_type: 'recurring', price_aed: '', credits: '', period_days: '', notes: '', pay_requirement: 'optional' };
  var _tpls = [];
  try { var _tr = await window.supabase.rpc('provider_list_session_templates', { p_provider: _memProvId() }); if (_tr && _tr.data) _tpls = _tr.data; } catch (e) {}
  var _selT = (p.template_ids && p.template_ids.length) ? p.template_ids : [];
  var _tplBoxes = _tpls.length
    ? _tpls.map(function (t) { var on = _selT.indexOf(t.id) >= 0; return '<label style="display:flex;align-items:center;gap:9px;padding:9px 11px;border:1px solid var(--ffp-border-mid,#dbe3ea);border-radius:9px;cursor:pointer;background:' + (on ? 'rgba(25,128,173,0.07)' : 'transparent') + ';"><input type="checkbox" class="pm-works-cb" value="' + t.id + '"' + (on ? ' checked' : '') + ' style="width:17px;height:17px;flex:0 0 auto;cursor:pointer;"><span style="font-size:13px;font-weight:700;">' + escHtml(t.title || 'Session') + '</span></label>'; }).join('')
    : '<div class="psub" style="margin:0;">No sessions yet — create one in Scheduling, then it can be added to this plan.</div>';
  openModalShell('lg', (editing ? 'Edit plan' : 'New plan'), `
    <div class="form-section">
      <div class="form-section-title">Plan</div>
      <div class="form-grid">
        <div class="field full"><div class="label">Plan name <span class="req">*</span></div><input class="input" id="pl-name" value="${escHtml(p.name)}" placeholder="e.g. Monthly Unlimited"></div>
        <div class="field">
          <div class="label">Type</div>
          <select class="select" id="pl-plan_type">
            <option value="recurring"${p.plan_type === 'recurring' ? ' selected' : ''}>Recurring membership</option>
            <option value="pack"${p.plan_type === 'pack' ? ' selected' : ''}>Class pack</option>
            <option value="term"${p.plan_type === 'term' ? ' selected' : ''}>Term membership</option>
          </select>
        </div>
        <div class="field"><div class="label">Price (${FFPCurrency.providerCode()})</div><input class="input" type="number" id="pl-price_aed" value="${escHtml(String(p.price_aed || ''))}" placeholder="e.g. 300"></div>
        <div class="field"><div class="label">Credits <span style="color:var(--ffp-text-dim,#6c7f90);">(class packs)</span></div><input class="input" type="number" id="pl-credits" value="${escHtml(String(p.credits || ''))}" placeholder="e.g. 10"></div>
        <div class="field"><div class="label">Length in days <span style="color:var(--ffp-text-dim,#6c7f90);">(membership/term)</span></div><input class="input" type="number" id="pl-period_days" value="${escHtml(String(p.period_days || ''))}" placeholder="e.g. 30"></div>
        <div class="field full"><div class="label">How do clients book + pay? <button type="button" onclick="_payHelp()" aria-label="What do these mean?" style="background:none;border:none;color:var(--ffp-purple);cursor:pointer;padding:0 0 0 3px;vertical-align:-3px;"><span class="ms" style="font-size:16px;">info</span></button></div>
          <select class="select" id="pl-pay_requirement">
            <option value="free"${p.pay_requirement === 'free' ? ' selected' : ''}>Free to book</option>
            <option value="required"${p.pay_requirement === 'required' ? ' selected' : ''}>Pay online to book</option>
            <option value="optional"${(p.pay_requirement === 'optional' || !p.pay_requirement) ? ' selected' : ''}>Book now, pay later</option>
          </select>
        </div>
        <div class="field full"><div class="label">Works for which sessions?</div>
          <div style="display:flex;flex-direction:column;gap:6px;">${_tplBoxes}</div>
          <div style="font-size:11px;color:var(--ffp-text-dim,#6c7f90);font-weight:600;margin-top:5px;">Tick the sessions this plan can be used for. Leave all unticked to cover every session. (A membership = unlimited; a class pack spends one credit per booking.)</div>
        </div>
        <div class="field full"><div class="label">Notes</div><textarea class="textarea" id="pl-notes" rows="2" placeholder="Optional">${escHtml(p.notes || '')}</textarea></div>
      </div>
    </div>
  `, `
    ${editing ? '<button class="btn btn-ghost left" onclick="confirmDeletePlan(\'' + editing.id + '\')"><span class="ms">delete</span> Delete</button>' : ''}
    <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
    <button class="btn btn-pri" onclick="savePlan('${editing ? editing.id : ''}')">${editing ? 'Save changes' : 'Create plan'}</button>
  `);
}

async function savePlan(id) {
  var g = function (i) { var el = document.getElementById('pl-' + i); return el ? el.value.trim() : ''; };
  var name = g('name');
  if (!name) { showToast('Plan name is required', 'error'); return; }
  var pid = _memProvId();
  if (!pid) { showToast('Not signed in', 'error'); return; }
  var tids = Array.prototype.slice.call(document.querySelectorAll('.pm-works-cb')).filter(function (c) { return c.checked; }).map(function (c) { return c.value; });
  var payload = { name: name, plan_type: g('plan_type') || 'recurring', price_aed: g('price_aed'), credits: g('credits'), period_days: g('period_days'), notes: g('notes'), pay_requirement: g('pay_requirement') || 'optional', template_ids: tids };
  try {
    var r = await window.supabase.rpc('provider_save_plan', { p_provider: pid, p_id: id || null, p: payload });
    if (r && r.error) throw r.error;
    showToast(id ? 'Plan updated' : 'Plan created', 'success');
    closeModal();
    renderPlans();
  } catch (e) { showToast('Could not save plan', 'error'); }
}

function confirmDeletePlan(id) {
  openModalShell('', 'Delete plan?', '<div class="psub" style="margin:6px 0;">This removes the plan. Members already assigned keep their membership record.</div>', '<button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-pri" onclick="doDeletePlan(\'' + id + '\')">Delete</button>');
}

async function doDeletePlan(id) {
  var pid = _memProvId();
  try {
    var r = await window.supabase.rpc('provider_delete_plan', { p_provider: pid, p_id: id });
    if (r && r.error) throw r.error;
    showToast('Plan deleted', 'success');
  } catch (e) { showToast('Could not delete plan', 'error'); }
  closeModal();
  renderPlans();
}

// First open: render now if the panel host is already on screen.
try { if (document.getElementById('plans-list')) renderPlans(); } catch (e) {}
