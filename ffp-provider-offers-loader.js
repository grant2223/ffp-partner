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
    // SOURCE OF TRUTH = the same in-memory profile the completion banner reads (has the saved logo/city/
    // category the moment the partner saves). This avoids a separate read that can lag or return empty.
    // NB providerProfile is a top-level `let` (not on window) — reach it by name with a typeof guard.
    var pp = null; try { if (typeof providerProfile !== 'undefined') pp = providerProfile; } catch (e) {}
    if (pp && pp.business_name) {
      _info = {
        business_name: pp.business_name || '', city: pp.city || '', logo_url: pp.logo_url || '',
        category: pp.category || '', is_brand: (pp.is_brand != null ? pp.is_brand : (prov().is_brand || false)),
        approved_by: pp.approved_by
      };
      await _resolveBrandLocation(); return _info;
    }
    if (_info && _info.business_name) { await _resolveBrandLocation(); return _info; }
    var pid = prov().id; if (!pid || !sb()) return _info || {};
    try {
      var r = await sb().from('providers').select('business_name, city, logo_url, is_brand, category').eq('id', pid).maybeSingle();
      var d = (r && r.data) || {}; var p = prov();
      if (d.business_name || d.city || d.logo_url) {
        _info = { business_name: d.business_name || '', city: d.city || '', logo_url: d.logo_url || '', category: d.category || '', is_brand: d.is_brand || false };
      } else {
        _info = null;   // read gave nothing — don't cache, retry next time
      }
    } catch (e) { _info = null; }
    await _resolveBrandLocation();
    return _info || {};
  }
  // A brand offer is redeemed at a stockist, so a brand needs >=1 stockist location before it can offer.
  async function _resolveBrandLocation() {
    if (!_info || !_info.is_brand) return;
    var pid = prov().id; if (!pid || !sb()) return;
    try { var r = await sb().rpc('brand_has_location', { p_provider: pid }); _info.has_location = !!(r && r.data); } catch (e) {}
  }
  // Grant's model: a REGISTERED provider must COMPLETE their profile before loading offers, and every
  // offer is VERIFIED (admin-reviewed) before it goes live. Profile-complete = the fields an offer shows.
  // Brands sell across stockists (no single venue city), so a brand needs a product type instead of a city.
  function profileMissing() {
    var i = _info || {}, miss = [];
    if (!i.business_name) miss.push('business name');
    if (!i.logo_url) miss.push('logo');
    if (i.is_brand) { if (!i.category) miss.push('product type'); if (!i.has_location) miss.push('a stockist location'); }
    else if (!i.city) miss.push('city');
    return miss;
  }
  function profileComplete() { return profileMissing().length === 0; }
  function statusBadge(s) {
    var map = { live: ['#e3f4ea', '#127a52', 'Live'], pending: ['#fff3d6', '#8a6100', 'Pending review'], paused: ['#f0f2f4', '#8a99a8', 'Paused'], rejected: ['#fdecea', '#c0392b', 'Rejected'], draft: ['#eef2f5', '#5b6b75', 'Draft'] };
    var x = map[s] || ['#f0f2f4', '#8a99a8', s || '—'];
    return '<span style="font-size:11px;font-weight:800;padding:3px 9px;border-radius:20px;background:' + x[0] + ';color:' + x[1] + ';">' + esc(x[2]) + '</span>';
  }

  // Offer categories from the admin taxonomy (list_key='offer_category').
  var CATS = [];
  function loadCats() { try { sb().from('taxonomy_items').select('value,label,sort_order').eq('list_key', 'offer_category').eq('active', true).order('sort_order').then(function (r) { if (!r.error && r.data) CATS = r.data; }); } catch (e) {} }
  function selectHtml(id, v) { return '<select id="' + id + '" style="' + inCss + '"><option value="">Select a category…</option>' + CATS.map(function (c) { return '<option value="' + esc(c.value) + '"' + (c.value === v ? ' selected' : '') + '>' + esc(c.label) + '</option>'; }).join('') + '</select>'; }
  function tierRow(key, label, v) { return field(label + ' benefit', inp('po-tier-' + key, 'e.g. 10% off 1 class', 'text', v || '')) + '<div style="font-size:11px;color:#8a99a8;margin:-8px 0 12px;">Leave blank = not available to ' + label + ' tier.</div>'; }

  // Filled fields, NO resting stroke (focus ring only). One style everywhere.
  var inCss = 'width:100%;padding:14px 15px;border:none;border-radius:12px;font-family:inherit;font-size:15px;font-weight:600;box-sizing:border-box;background:#eef2f5;color:#12232f;';
  function field(label, inner) { return '<div style="margin-bottom:18px;"><label style="display:block;font-size:12.5px;font-weight:700;color:#6c7c87;margin-bottom:8px;letter-spacing:.1px;">' + esc(label) + '</label>' + inner + '</div>'; }
  function inp(id, ph, type, v) { return '<input id="' + id + '" type="' + (type || 'text') + '" value="' + esc(v || '') + '" placeholder="' + esc(ph || '') + '" style="' + inCss + '">'; }
  function ta(id, ph, v) { return '<textarea id="' + id + '" placeholder="' + esc(ph || '') + '" rows="2" style="' + inCss + ';min-height:120px;line-height:1.55;resize:vertical">' + esc(v || '') + '</textarea>'; }
  function secT(t) { return '<div class="po-sec">' + esc(t) + '</div>'; }
  function val(id) { var e = document.getElementById(id); return e ? String(e.value || '').trim() : ''; }
  function closeModal() { var b = document.getElementById('po-modal'); if (b) b.remove(); }

  // Full-bleed modal (shared openModalShell) + a REQUIRED offer image (no words on the image).
  async function openForm(o) {
    o = o || {}; editingId = o.id || null;
    var pinfo = await providerInfo();
    var cityName = (pinfo && pinfo.city) || prov().city || 'your city';
    var incomplete = !profileComplete();
    injectOfferCss();
    var T = o.tiers || {};
    var typ = (o.deal_type === 'perk') ? 'perk' : 'bogo';
    var benefit = T.member || '';
    var body =
      (incomplete ? '<div style="background:#fff8e6;border-radius:12px;padding:12px 14px;margin:0 0 14px;color:#7a5c00;font-size:12.5px;line-height:1.5;">You can <b>save this as a draft</b> now. To <b>submit it for review</b>, first add your ' + esc(profileMissing().join(', ')) + ' to your business profile.</div>' : '') +
      '<div id="po-form" data-type="' + typ + '">' +
      '<div class="po-sec" style="margin-top:2px">Offer type</div>' +
      '<div class="po-typerow">' +
        '<button type="button" class="po-typebtn' + (typ === 'bogo' ? ' on' : '') + '" data-t="bogo" onclick="ffpOffers.setType(\'bogo\')"><span class="ic ms">local_offer</span><span class="ct"><b>Signature Deal</b><span>2-for-1, one-time. $20+ saving.</span></span><span class="tk"><span class="ms">check</span></span></button>' +
        '<button type="button" class="po-typebtn' + (typ === 'perk' ? ' on' : '') + '" data-t="perk" onclick="ffpOffers.setType(\'perk\')"><span class="ic ms">verified</span><span class="ct"><b>Member Perk</b><span>Always-on discount, shown by Passport.</span></span><span class="tk"><span class="ms">check</span></span></button>' +
      '</div>' +
      secT('The offer') +
      field('Category', selectHtml('po-category', o.category)) +
      field('What members get', inp('po-benefit', 'e.g. Buy one main meal and get the second free', 'text', benefit)) +
      '<div class="only-bogo">' + secT('Signature Deal') +
        '<div style="display:flex;gap:24px;flex-wrap:wrap;">' +
          '<div style="width:150px">' + field('Member\'s saving ($)', inp('po-saving', '20', 'number', o.saving_amount != null ? o.saving_amount : '')) + '<div id="po-savehint" style="font-size:12px;font-weight:700;color:#8a99a8;margin:-10px 0 0;">Minimum $20 saving.</div></div>' +
          '<div style="width:150px">' + field('Uses per member', inp('po-limit', '1', 'number', o.per_member_limit != null ? o.per_member_limit : 1)) + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="only-perk">' + secT('Member Perk') + '<div style="background:#eef7fb;border-radius:12px;padding:14px 16px;font-size:12.5px;font-weight:600;color:#155e96;line-height:1.5;">Verified by Golden Passport — members show their live Passport in-store to claim. No code, use it every visit. You honour the discount at the till.</div></div>' +
      secT('Fine print') +
      field('Terms (optional)', ta('po-terms', 'e.g. One per member. Dine-in only. Not valid on public holidays.', o.terms)) +
      secT('When it runs') +
      '<div style="display:flex;gap:24px;flex-wrap:wrap;">' +
        '<div style="width:220px">' + field('Valid from', inp('po-from', '', 'date', o.valid_from)) + '</div>' +
        '<div style="width:220px">' + field('Valid to', inp('po-to', '', 'date', o.valid_to)) + '</div>' +
      '</div>' +
      secT('Photo') +
      '<div id="listing-photo-slot"></div>' +
      '<div style="font-size:12px;color:#8a99a8;margin-top:8px;line-height:1.5;">A clean photo of the offer — <b>no words or text on the image.</b></div>' +
      '<div class="po-feat">' +
        '<div class="fx"><span class="kick"><span class="ms">star</span> Featured placement</span>' +
        '<h3>Be the first offer members see in ' + esc(cityName) + '</h3>' +
        '<div class="sub">Top of the Offers page all month — in front of every active member in your area.</div>' +
        '<span class="urg"><span class="ms">bolt</span> Only 1 spot left this month</span></div>' +
        '<div class="fbuy"><div class="price"><b>$99</b><span>/month</span></div>' +
        '<button type="button" class="fbtn" onclick="ffpOffers.feature()">Feature my offer</button>' +
        '<span class="paynote">Pay now, live instantly</span></div>' +
      '</div>' +
      '</div>';
    var foot =
      '<button class="btn po-cancel" onclick="closeModal()">Cancel</button>' +
      '<button class="btn po-draft" onclick="ffpOffers.save(\'draft\')">Save draft</button>' +
      '<button class="btn po-submit" onclick="ffpOffers.save(\'pending\')">Submit for review</button>';
    if (typeof window.openModalShell === 'function') {
      window.openModalShell('lg', (editingId ? 'Edit offer' : 'Add offer'), body, foot);
    }
    if (typeof window.renderListingUploader === 'function') {
      try { window.renderListingUploader(o.image_url || ''); } catch (e) {}
    }
    var sv = document.getElementById('po-saving'); if (sv) { sv.oninput = savingHint; savingHint(); }
  }

  function currentType() { var f = document.getElementById('po-form'); return (f && f.dataset.type === 'perk') ? 'perk' : 'bogo'; }
  function setType(t) {
    var f = document.getElementById('po-form'); if (!f) return;
    f.dataset.type = (t === 'perk') ? 'perk' : 'bogo';
    Array.prototype.forEach.call(document.querySelectorAll('.po-typebtn'), function (b) { b.classList.toggle('on', b.getAttribute('data-t') === f.dataset.type); });
  }
  function savingHint() {
    var el = document.getElementById('po-savehint'); if (!el) return;
    var s = parseFloat(val('po-saving'));
    if (!s) { el.style.color = '#8a99a8'; el.textContent = 'Minimum $20 saving for a Signature Deal.'; }
    else if (s < 20) { el.style.color = '#c0392b'; el.textContent = 'A Signature Deal needs at least a $20 saving.'; }
    else { el.style.color = '#0a8f5f'; el.textContent = '✓ Meets the $20 minimum saving.'; }
  }
  function injectOfferCss() {
    if (document.getElementById('ffp-offer-css')) return;
    var s = document.createElement('style'); s.id = 'ffp-offer-css';
    s.textContent = '#po-form[data-type=perk] .only-bogo{display:none}#po-form[data-type=bogo] .only-perk{display:none}'
      /* section title: bold dark, dominant over labels */
      + '.po-sec{font-size:18px;font-weight:900;color:#0e2531;letter-spacing:-.2px;margin:30px 0 16px}'
      /* offer-type selector: grey filled unselected, bold BLUE fill selected (white text), no strokes */
      + '.po-typerow{display:flex;gap:14px;margin-bottom:6px;flex-wrap:wrap}'
      + '.po-typebtn{flex:1;min-width:220px;display:flex;gap:13px;align-items:flex-start;text-align:left;background:#e3eaf0;border:none;border-radius:15px;box-shadow:0 3px 10px rgba(15,37,49,.09);padding:18px;cursor:pointer;font-family:inherit;position:relative;transition:.15s}'
      + '.po-typebtn:hover{background:#d8e1e9}'
      + '.po-typebtn.on{background:linear-gradient(135deg,#2aa2d2 0%,#1a83b3 48%,#0f6088 100%);box-shadow:0 14px 30px -8px rgba(20,110,155,.6)}'
      + '.po-typebtn .ic{font-size:25px;color:#8494a0;flex:none;margin-top:1px}'
      + '.po-typebtn.on .ic{color:#fff}'
      + '.po-typebtn .ct{flex:1;min-width:0}'
      + '.po-typebtn .ct b{display:block;font-size:16px;font-weight:900;color:#12232f;letter-spacing:-.2px}'
      + '.po-typebtn .ct span{display:block;font-size:12.5px;color:#5a6a75;font-weight:600;margin-top:4px;line-height:1.4}'
      + '.po-typebtn.on .ct b{color:#fff}.po-typebtn.on .ct span{color:rgba(255,255,255,.88)}'
      + '.po-typebtn .tk{position:absolute;top:16px;right:16px;width:22px;height:22px;border-radius:50%;background:#fff;color:#1980AD;display:none;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.25)}'
      + '.po-typebtn .tk .ms{font-size:15px}.po-typebtn.on .tk{display:flex}'
      /* fields: fill only, focus ring (no resting stroke) */
      + '#po-form input::placeholder,#po-form textarea::placeholder{color:#a2b0bb;font-weight:500}'
      + '#po-form input:focus,#po-form select:focus,#po-form textarea:focus{outline:none;background:#fff;box-shadow:0 0 0 4px rgba(25,128,173,.17)}'
      + '#po-form select{appearance:none;-webkit-appearance:none;color:#12232f;background-image:url("data:image/svg+xml;utf8,<svg xmlns=%27http://www.w3.org/2000/svg%27 width=%2713%27 height=%2713%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%27%2393a1ad%27 stroke-width=%272.5%27><polyline points=%276 9 12 15 18 9%27/></svg>");background-repeat:no-repeat;background-position:right 15px center;padding-right:40px}'
      /* premium featured panel — navy + gold, sells the $99 spot */
      + '.po-feat{position:relative;overflow:hidden;border-radius:20px;padding:28px 30px;display:flex;align-items:center;gap:26px;flex-wrap:wrap;margin-top:36px;background:radial-gradient(130% 150% at 88% -10%,#1f608a 0%,#123f5c 46%,#0b2a40 100%);box-shadow:0 20px 44px -18px rgba(11,42,64,.75)}'
      + '.po-feat::after{content:"star";font-family:\'Material Symbols Outlined\';position:absolute;right:-24px;bottom:-52px;font-size:210px;line-height:1;color:rgba(255,204,0,.10);pointer-events:none}'
      + '.po-feat .fx{flex:1;min-width:240px;position:relative;z-index:1}'
      + '.po-feat .kick{display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:900;letter-spacing:1.5px;text-transform:uppercase;color:#FFCC00}'
      + '.po-feat .kick .ms{font-size:16px}'
      + '.po-feat h3{margin:9px 0 6px;font-size:23px;font-weight:900;color:#fff;letter-spacing:-.5px;line-height:1.12}'
      + '.po-feat .sub{font-size:13px;font-weight:600;color:rgba(255,255,255,.74);line-height:1.45;max-width:360px}'
      + '.po-feat .urg{display:inline-flex;align-items:center;gap:6px;margin-top:14px;background:rgba(255,204,0,.15);color:#ffdc55;font-size:12px;font-weight:800;padding:6px 13px;border-radius:20px}'
      + '.po-feat .urg .ms{font-size:15px}'
      + '.po-feat .fbuy{flex:none;position:relative;z-index:1;display:flex;flex-direction:column;align-items:flex-end;gap:13px}'
      + '.po-feat .price{color:#fff;line-height:1;display:flex;align-items:baseline;gap:4px}'
      + '.po-feat .price b{font-size:44px;font-weight:900;letter-spacing:-1.5px}'
      + '.po-feat .price span{font-size:15px;font-weight:700;color:rgba(255,255,255,.7)}'
      + '.po-feat .fbtn{height:52px;padding:0 30px;border:none;border-radius:14px;font-family:inherit;font-weight:900;font-size:14.5px;cursor:pointer;background:linear-gradient(135deg,#ffe488 0%,#f7c02a 45%,#e59000 100%);color:#3a2600;box-shadow:inset 0 1.5px 0 rgba(255,255,255,.6),0 9px 22px rgba(230,150,0,.55)}'
      + '.po-feat .fbtn:hover{filter:brightness(1.05)}'
      + '.po-feat .paynote{font-size:11.5px;font-weight:700;color:rgba(255,255,255,.6)}'
      /* footer buttons (approved) — dimensional gradient, never flat */
      + '.po-cancel,.po-draft,.po-submit{height:48px;padding:0 26px;border-radius:13px;font-weight:800;letter-spacing:.2px;font-size:13.5px;text-transform:none;border:none;cursor:pointer}'
      + '.po-cancel{background:#fff;box-shadow:inset 0 0 0 1.5px #c9d3db;color:#516069}'
      + '.po-cancel:hover{box-shadow:inset 0 0 0 1.5px #9fb0bd;background:#f6f9fb}'
      + '.po-draft{background:linear-gradient(135deg,#ffe488,#fac52f 45%,#e59000);color:#3a2600;box-shadow:inset 0 1.5px 0 rgba(255,255,255,.6),0 7px 18px rgba(230,150,0,.45)}'
      + '.po-draft:hover{filter:brightness(1.05)}'
      + '.po-submit{background:linear-gradient(135deg,#40b8e4,#1e8cbb 45%,#0e6188);color:#fff;box-shadow:inset 0 1.5px 0 rgba(255,255,255,.35),0 7px 18px rgba(20,110,155,.5)}'
      + '.po-submit:hover{filter:brightness(1.06)}';
    document.head.appendChild(s);
  }
  async function save(mode) {
    mode = (mode === 'draft') ? 'draft' : 'pending';
    if (!prov().id) { toast('Provider not ready — reload.', 'error'); return; }
    var info = await providerInfo();
    if (!val('po-benefit')) { toast('Add what members get', 'error'); return; }
    var typ = currentType();
    var benefit = val('po-benefit') || null;
    var tiers = { member: benefit, supporter: null, ambassador: null };
    var saving = typ === 'bogo' ? (parseFloat(val('po-saving')) || null) : null;
    var perLimit = typ === 'perk' ? 0 : (parseInt(val('po-limit') || '1', 10) || 1);
    var slot = document.getElementById('listing-photo-slot');
    var imgUrl = slot ? (slot.dataset.url || '') : '';
    // Full checks only when SUBMITTING for review. Drafts save with just a title.
    if (mode === 'pending') {
      if (!profileComplete()) { toast('Add your ' + profileMissing().join(', ') + ' to your profile to submit — or Save draft for now.', 'error'); return; }
      if (!benefit) { toast('Add what members get to submit', 'error'); return; }
      if (typ === 'bogo' && (!saving || saving < 20)) { toast('A Signature Deal needs at least a $20 saving', 'error'); return; }
      if (!imgUrl) { toast('Add an offer image to submit (no words on the image)', 'error'); return; }
    }
    var row = {
      provider_id: prov().id,
      partner_name: info.business_name || prov().business_name || null,
      city: info.city || prov().city || null,
      logo_url: info.logo_url || null,
      image_url: imgUrl,
      category: val('po-category') || null,
      tiers: tiers,
      title: val('po-benefit'),
      description: null,
      redeem_info: typ === 'perk' ? 'Show your Golden Passport in-store' : null,
      terms: val('po-terms') || null,
      deal_type: typ,
      saving_amount: saving,
      valid_from: val('po-from') || null,
      valid_to: val('po-to') || null,
      per_member_limit: perLimit,
      source: 'partner',
      updated_at: new Date().toISOString()
    };
    try {
      // Draft = saved but not submitted (never shown to members). Pending = submitted for admin review.
      row.status = mode;   // 'draft' | 'pending'
      var res;
      if (editingId) res = await sb().from('partner_offers').update(row).eq('id', editingId);
      else res = await sb().from('partner_offers').insert(row);
      if (res.error) throw res.error;
      if (window.closeModal) window.closeModal();
      toast(mode === 'draft' ? 'Draft saved' : (editingId ? 'Offer updated — sent for review' : 'Offer submitted for review'), 'success'); editingId = null; render();
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
        // Draft or rejected → let the partner submit it for review in one tap.
        var submit = (o.status === 'draft' || o.status === 'rejected')
          ? '<button onclick="ffpOffers.setStatus(\'' + o.id + '\',\'pending\')" style="border:1px solid #1980AD;background:#eef6fb;color:#1980AD;border-radius:18px;padding:6px 12px;font-family:inherit;font-weight:800;font-size:12px;cursor:pointer;">Submit</button>'
          : '';
        return '<div style="background:#fff;border:1px solid #eef2f5;border-radius:12px;padding:12px 14px;margin-bottom:10px;display:flex;align-items:center;gap:10px;">' +
          '<div style="flex:1;min-width:0;"><div style="font-weight:800;color:#12232f;">' + esc(o.title) + '</div>' +
          '<div style="font-size:12px;color:#8a99a8;">' + esc(valid) + ' · ' + (o.redeemed_count || 0) + ' redeemed</div></div>' +
          statusBadge(o.status) +
          submit +
          '<button onclick=\'ffpOffers.edit(' + JSON.stringify(o).replace(/'/g, "&#39;") + ')\' title="Edit" style="border:none;background:none;cursor:pointer;color:#1980AD;"><span class="ms">edit</span></button>' +
          toggle +
          '<button onclick="ffpOffers.remove(\'' + o.id + '\')" title="Delete" style="border:none;background:none;cursor:pointer;color:#d9534f;"><span class="ms">delete</span></button>' +
          '</div>';
      }).join('');
    } catch (e) { el.innerHTML = '<div style="padding:16px;color:#d9534f;">Couldn’t load offers: ' + esc(e.message || '') + '</div>'; }
  }

  function feature() { toast('Save your offer first, then feature it for $99/month — featured checkout is being set up.', 'success'); }
  window.ffpOffers = { add: function () { openForm(); }, edit: function (o) { openForm(o); }, save: save, setType: setType, savingHint: savingHint, setStatus: setStatus, remove: remove, feature: feature, _close: closeModal };
  window.ffpRenderOffers = render;
  loadCats();
  try { render(); } catch (e) {}
})();
