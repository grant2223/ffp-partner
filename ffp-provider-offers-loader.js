/* FFP Partner — Offers (BOGO) management. A partner creates/manages Buy-1-Get-1-Free offers for their
   own venue. Writes to partner_offers (provider_id = this provider, source='partner'); auto-live and
   shown to Ambassador members, redeemed at the venue's check-in QR. Self-contained modal + CRUD.
   Exposes window.ffpRenderOffers (panel render hook) + window.ffpOffers (button actions). */
(function () {
  var sb = function () { return window.supabase; };
  var prov = function () { return window.FFP_PROVIDER || {}; };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); };
  var editingId = null, _info = null;
  function toast(m, k) { if (typeof window.showToast === 'function') { try { window.showToast(m, k || 'info'); return; } catch (e) {} } console.log('[FFP Offers]', m); }

  async function providerInfo() {
    if (_info) return _info;
    var pid = prov().id; if (!pid || !sb()) return {};
    try { var r = await sb().from('providers').select('business_name, city, area, region, country, logo_url, approved_by').eq('id', pid).maybeSingle(); _info = (r && r.data) || {}; } catch (e) { _info = {}; }
    return _info;
  }
  // Grant's model: a REGISTERED provider must COMPLETE their profile before loading offers, and every
  // offer is VERIFIED (admin-reviewed) before it goes live. Profile-complete = the fields an offer shows.
  function profileMissing() {
    var i = _info || {}, miss = [];
    if (!i.business_name) miss.push('business name');
    if (!i.city) miss.push('city');
    if (!i.logo_url) miss.push('logo');
    return miss;
  }
  function profileComplete() { return profileMissing().length === 0; }
  function statusBadge(s) {
    var map = { live: ['#e3f4ea', '#127a52', 'Live'], pending: ['#fff3d6', '#8a6100', 'Pending review'], paused: ['#f0f2f4', '#8a99a8', 'Paused'], rejected: ['#fdecea', '#c0392b', 'Rejected'] };
    var x = map[s] || ['#f0f2f4', '#8a99a8', s || '—'];
    return '<span style="font-size:11px;font-weight:800;padding:3px 9px;border-radius:20px;background:' + x[0] + ';color:' + x[1] + ';">' + esc(x[2]) + '</span>';
  }

  // Offer categories from the admin taxonomy (list_key='offer_category').
  var CATS = [];
  function loadCats() { try { sb().from('taxonomy_items').select('value,label,sort_order').eq('list_key', 'offer_category').eq('active', true).order('sort_order').then(function (r) { if (!r.error && r.data) CATS = r.data; }); } catch (e) {} }
  function selectHtml(id, v) { return '<select id="' + id + '" style="' + inCss + '"><option value="">Select a category…</option>' + CATS.map(function (c) { return '<option value="' + esc(c.value) + '"' + (c.value === v ? ' selected' : '') + '>' + esc(c.label) + '</option>'; }).join('') + '</select>'; }
  function tierRow(key, label, v) { return field(label + ' benefit', inp('po-tier-' + key, 'e.g. 10% off 1 class', 'text', v || '')) + '<div style="font-size:11px;color:#8a99a8;margin:-8px 0 12px;">Leave blank = not available to ' + label + ' tier.</div>'; }

  var inCss = 'width:100%;padding:10px 12px;border:1px solid #d7dee5;border-radius:10px;font:inherit;box-sizing:border-box;background:#fff;color:#12232f;';
  function field(label, inner) { return '<div style="margin-bottom:12px;"><label style="display:block;font-size:12px;font-weight:700;color:#43525c;margin-bottom:5px;">' + esc(label) + '</label>' + inner + '</div>'; }
  function inp(id, ph, type, v) { return '<input id="' + id + '" type="' + (type || 'text') + '" value="' + esc(v || '') + '" placeholder="' + esc(ph || '') + '" style="' + inCss + '">'; }
  function ta(id, ph, v) { return '<textarea id="' + id + '" placeholder="' + esc(ph || '') + '" rows="2" style="' + inCss + ';resize:vertical">' + esc(v || '') + '</textarea>'; }
  function val(id) { var e = document.getElementById(id); return e ? String(e.value || '').trim() : ''; }
  function closeModal() { var b = document.getElementById('po-modal'); if (b) b.remove(); }

  // Full-bleed modal (shared openModalShell) + a REQUIRED offer image (no words on the image).
  async function openForm(o) {
    o = o || {}; editingId = o.id || null;
    await providerInfo();
    if (!profileComplete()) { toast('Complete your business profile first — add your ' + profileMissing().join(', ') + ' — then you can add offers.', 'error'); return; }
    var T = o.tiers || {};
    var body =
      '<div style="font-size:12.5px;color:#8a99a8;margin:-2px 0 14px;">Shown to Passport members at your venue — the benefit can vary by tier.</div>' +
      field('Category', selectHtml('po-category', o.category)) +
      field('Offer title', inp('po-title', 'e.g. Meal discount', 'text', o.title)) +
      field('Description', ta('po-desc', 'Short description shown to members', o.description)) +
      '<div style="font-size:12px;font-weight:800;color:#43525c;margin:8px 0 6px;">Benefit by tier</div>' +
      tierRow('member', 'Member', T.member) +
      tierRow('supporter', 'Supporter', T.supporter) +
      tierRow('ambassador', 'Ambassador', T.ambassador) +
      field('How members redeem', ta('po-redeem', 'Your way — e.g. show the confirmation to staff, tell them the code, or scan at the desk', o.redeem_info)) +
      field('Terms / fine print', ta('po-terms', 'e.g. One per member, dine-in only', o.terms)) +
      '<div style="display:flex;gap:10px;flex-wrap:wrap;">' +
        '<div style="flex:1;min-width:150px">' + field('Valid from', inp('po-from', '', 'date', o.valid_from)) + '</div>' +
        '<div style="flex:1;min-width:150px">' + field('Valid to', inp('po-to', '', 'date', o.valid_to)) + '</div>' +
        '<div style="width:150px">' + field('Per-member limit', inp('po-limit', '1', 'number', o.per_member_limit != null ? o.per_member_limit : 1)) + '</div>' +
      '</div>' +
      '<div style="margin-top:4px;"><label style="display:block;font-size:12px;font-weight:700;color:#43525c;margin-bottom:5px;">Offer image <span style="color:#e04b3a;">*</span></label>' +
        '<div id="listing-photo-slot"></div>' +
        '<div style="font-size:12px;color:#8a99a8;margin-top:6px;line-height:1.5;">Required. A clean photo of the offer — <b>no words or text on the image.</b></div>' +
      '</div>';
    var foot =
      '<button class="btn btn-ghost" onclick="closeModal()">Cancel</button>' +
      '<button class="btn btn-pri" onclick="ffpOffers.save()">' + (editingId ? 'Save' : 'Add offer') + '</button>';
    if (typeof window.openModalShell === 'function') {
      window.openModalShell('lg', (editingId ? 'Edit offer' : 'Add offer'), body, foot);
    }
    if (typeof window.renderListingUploader === 'function') {
      try { window.renderListingUploader(o.image_url || ''); } catch (e) {}
    }
  }

  async function save() {
    if (!prov().id) { toast('Provider not ready — reload.', 'error'); return; }
    var info = await providerInfo();
    if (!profileComplete()) { toast('Complete your business profile first (' + profileMissing().join(', ') + ').', 'error'); return; }
    if (!val('po-title')) { toast('Offer title is required', 'error'); return; }
    var tiers = { member: val('po-tier-member') || null, supporter: val('po-tier-supporter') || null, ambassador: val('po-tier-ambassador') || null };
    if (!tiers.member && !tiers.supporter && !tiers.ambassador) { toast('Add a benefit for at least one tier', 'error'); return; }
    var slot = document.getElementById('listing-photo-slot');
    var imgUrl = slot ? (slot.dataset.url || '') : '';
    if (!imgUrl) { toast('Add an offer image (no words on the image)', 'error'); return; }
    var row = {
      provider_id: prov().id,
      partner_name: info.business_name || prov().business_name || null,
      city: info.city || prov().city || null,
      logo_url: info.logo_url || null,
      image_url: imgUrl,
      category: val('po-category') || null,
      tiers: tiers,
      title: val('po-title'),
      description: val('po-desc') || null,
      redeem_info: val('po-redeem') || null,
      terms: val('po-terms') || null,
      deal_type: 'bogo',
      valid_from: val('po-from') || null,
      valid_to: val('po-to') || null,
      per_member_limit: parseInt(val('po-limit') || '1', 10) || 1,
      source: 'partner',
      updated_at: new Date().toISOString()
    };
    try {
      // Every partner offer (new OR edited) is submitted for review — goes live only once an admin verifies it.
      row.status = 'pending';
      var res;
      if (editingId) res = await sb().from('partner_offers').update(row).eq('id', editingId);
      else res = await sb().from('partner_offers').insert(row);
      if (res.error) throw res.error;
      if (window.closeModal) window.closeModal();
      toast(editingId ? 'Offer updated — sent for review' : 'Offer submitted for review', 'success'); editingId = null; render();
    } catch (e) { toast(e.message || 'Save failed', 'error'); }
  }

  async function setStatus(id, status) { try { var r = await sb().from('partner_offers').update({ status: status, updated_at: new Date().toISOString() }).eq('id', id); if (r.error) throw r.error; render(); } catch (e) { toast(e.message || 'Update failed', 'error'); } }
  async function remove(id) { if (!window.confirm('Delete this offer?')) return; try { var r = await sb().from('partner_offers').delete().eq('id', id); if (r.error) throw r.error; toast('Offer deleted', 'success'); render(); } catch (e) { toast(e.message || 'Delete failed', 'error'); } }

  async function render() {
    var el = document.getElementById('partner-offers-list'); if (!el) return;
    if (!prov().id) { el.innerHTML = '<div style="padding:16px;color:#8a99a8;">Loading…</div>'; return; }
    el.innerHTML = '<div style="padding:16px;color:#8a99a8;">Loading offers…</div>';
    await providerInfo();
    var miss = profileMissing();
    var notice = miss.length ?
      '<div style="background:#fff8e6;border:1px solid #f2e2a8;border-radius:12px;padding:14px 16px;margin-bottom:14px;color:#7a5c00;font-size:13px;line-height:1.5;">' +
      '<b>Complete your profile to add offers.</b> Add your ' + esc(miss.join(', ')) + ' to your business profile, then you can create offers members can claim at your venue.</div>'
      : '<div style="background:#eef6fb;border:1px solid #cfe6f3;border-radius:12px;padding:12px 16px;margin-bottom:14px;color:#1b5b7a;font-size:12.5px;line-height:1.5;">' +
      'New and edited offers are <b>reviewed by FFP</b> before they go live to members — usually within a day.</div>';
    try {
      var r = await sb().from('partner_offers').select('*').eq('provider_id', prov().id).order('created_at', { ascending: false });
      if (r.error) throw r.error;
      var rows = r.data || [];
      if (!rows.length) { el.innerHTML = notice + '<div style="padding:20px;color:#8a99a8;">No offers yet. Add one with the button above.</div>'; return; }
      el.innerHTML = notice + rows.map(function (o) {
        var valid = [o.valid_from, o.valid_to].filter(Boolean).join(' → ') || 'No dates';
        // A partner can only pause a live offer / resume a paused one — both are already-approved states.
        var toggle = (o.status === 'live' || o.status === 'paused')
          ? '<button onclick="ffpOffers.setStatus(\'' + o.id + '\',\'' + (o.status === 'live' ? 'paused' : 'live') + '\')" title="' + (o.status === 'live' ? 'Pause' : 'Resume') + '" style="border:none;background:none;cursor:pointer;color:#5b6b75;"><span class="ms">' + (o.status === 'live' ? 'pause_circle' : 'play_circle') + '</span></button>'
          : '';
        return '<div style="background:#fff;border:1px solid #eef2f5;border-radius:12px;padding:12px 14px;margin-bottom:10px;display:flex;align-items:center;gap:10px;">' +
          '<div style="flex:1;min-width:0;"><div style="font-weight:800;color:#12232f;">' + esc(o.title) + '</div>' +
          '<div style="font-size:12px;color:#8a99a8;">' + esc(valid) + ' · ' + (o.redeemed_count || 0) + ' redeemed</div></div>' +
          statusBadge(o.status) +
          '<button onclick=\'ffpOffers.edit(' + JSON.stringify(o).replace(/'/g, "&#39;") + ')\' title="Edit" style="border:none;background:none;cursor:pointer;color:#1980AD;"><span class="ms">edit</span></button>' +
          toggle +
          '<button onclick="ffpOffers.remove(\'' + o.id + '\')" title="Delete" style="border:none;background:none;cursor:pointer;color:#d9534f;"><span class="ms">delete</span></button>' +
          '</div>';
      }).join('');
    } catch (e) { el.innerHTML = '<div style="padding:16px;color:#d9534f;">Couldn’t load offers: ' + esc(e.message || '') + '</div>'; }
  }

  window.ffpOffers = { add: function () { openForm(); }, edit: function (o) { openForm(o); }, save: save, setStatus: setStatus, remove: remove, _close: closeModal };
  window.ffpRenderOffers = render;
  loadCats();
  try { render(); } catch (e) {}
})();
