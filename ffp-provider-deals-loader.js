/* FFP Provider Deals Loader — v3
   v3 changes (Grant's feedback):
   - Activity picker (379 activities) replaces broad-category dropdown.
     A padel-court deal tags as "Padel", not "Racquet sports".
   - Reuses window.FFPPicker exposed by experiences loader.
   - Stores both activity + category on each deal.
   v2: Cleaner form (Headline perk + Details + Type + Booking link + Valid),
       max_redemptions_per_member auto-set to 1, re-approval rule.
   v1: Initial wiring.
*/
(function () {
  'use strict';

  // FFP master taxonomy — 23 categories. Used on EVERY content creation form.
  var FFP_CATEGORIES = [
    'Running & walking', 'Athletics & track', 'Cycling', 'Swimming', 'Watersports',
    'Racquet sports', 'Team sports', 'Combat sports', 'Gymnastics', 'Strength & fitness',
    'Mind-body & yoga', 'Dance & rhythm', 'Outdoor & adventure', 'Recovery & wellness',
    'Golf', 'Equestrian', 'Shooting & target sports', 'Cue & precision sports',
    'Air & extreme', 'Snow sports', 'Motorsports', 'Skateboard & roller', 'Multi-sport & events'
  ];

  function toast(msg, kind) {
    if (typeof window.showToast === 'function') {
      try { window.showToast(msg, kind || 'info'); return; } catch (e) {}
    }
    console.log('[FFP Provider Deals]', msg);
  }
  async function waitFor(check, ms) {
    var tries = 0; var limit = Math.ceil((ms || 15000) / 100);
    while (!check() && tries < limit) {
      await new Promise(function (r) { setTimeout(r, 100); });
      tries++;
    }
    return check();
  }
  function escHtml(s) {
    if (typeof window.escHtml === 'function') return window.escHtml(s);
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function injectStyles() {
    if (document.getElementById('ffp-provider-deals-css')) return;
    var css = document.createElement('style');
    css.id = 'ffp-provider-deals-css';
    css.textContent = [
      // Kill all native scrollbars — FFP-wide rule
      '*::-webkit-scrollbar{display:none !important;width:0 !important;height:0 !important;}',
      '*{-ms-overflow-style:none !important;scrollbar-width:none !important;}',
      '#panel-deals{overflow-x:hidden;}',
      // Dark dropdowns inside modal
      '.modal select, .modal .select, .modal-body select, .modal-body .select{color-scheme:light;}',
      '.modal select option, .modal-body select option{background:#ffffff !important;color:#0e2531 !important;}',
      '.modal select option:checked, .modal-body select option:checked{background:#1980AD !important;color:#082335 !important;}',
      // Picker button — matches experiences/events styling
      '.ffp-picker-btn{' +
        'width:100%;display:flex;align-items:center;justify-content:space-between;' +
        'background:#ffffff;border:1px solid #d8dde2;border-radius:10px;' +
        'padding:11px 14px;color:#0e2531;font-size:14px;font-family:inherit;cursor:pointer;' +
        'text-align:left;}',
      '.ffp-picker-btn:hover{border-color:#2a4564;}',
      '.ffp-picker-btn.placeholder{color:#8a96a1;}',
      '.ffp-picker-btn .caret{flex-shrink:0;margin-left:10px;color:#566069;}',
      '.ffp-picker-btn .picked{display:flex;flex-direction:column;line-height:1.3;gap:1px;overflow:hidden;}',
      '.ffp-picker-btn .picked .name{color:#0e2531;font-weight:500;}',
      '.ffp-picker-btn .picked .group{color:#566069;font-size:11px;}'
    ].join('');
    document.head.appendChild(css);
  }

  // ─── DB → UI shape ───
  function mapForUi(row) {
    return {
      id: row.id,
      perk: row.title || '',
      breakdown: '',  // No longer collected — display fallback to about/description
      about: row.description || '',
      activity: row.activity || '',
      category: row.category || '',
      offering_type: row.offering_type || '',
      service: row.service || '',  // legacy column, no longer in form
      valid: row.valid_when || '',
      booking: row.booking_method || '',
      limits: row.limits || '',
      frequency: row.frequency || '',
      hero_url: row.hero_image_url || null,
      status: row.status || 'pending',
      featured: !!row.featured,
      claims: 0,
      claims_this_month: 0,
      created_at: row.created_at ? row.created_at.slice(0, 10) : '',
      _raw: row
    };
  }

  async function fetchDeals() {
    if (!window.FFP_PROVIDER || !window.FFP_PROVIDER.id) return [];
    var providerId = window.FFP_PROVIDER.id;
    var res = await window.supabase
      .from('deals')
      .select('id, provider_id, title, description, activity, category, hero_image_url, offer_label, offer_price_aed, original_price_aed, terms, status, featured, starts_at, ends_at, max_redemptions_per_member, service, valid_when, booking_method, limits, frequency, offering_type, created_at, updated_at')
      .eq('provider_id', providerId)
      .order('created_at', { ascending: false });
    if (res.error) {
      console.error('[FFP Provider Deals] fetch:', res.error);
      toast('Could not load deals', 'error');
      return [];
    }
    return (res.data || []).map(mapForUi);
  }

  async function refresh() {
    if (typeof deals === 'undefined') {
      console.warn('[FFP Provider Deals] in-memory deals array not defined yet');
      return;
    }
    var rows = await fetchDeals();
    deals.length = 0;
    rows.forEach(function (r) { deals.push(r); });
    if (typeof window.renderDeals === 'function') { try { window.renderDeals(); } catch (e) {} }
    if (typeof window.renderNav === 'function')   { try { window.renderNav();   } catch (e) {} }
  }

  // ─── New modal — replaces openDealModal entirely ───
  function realOpenDealModal(id) {
    var editing = id ? deals.find(function (x) { return x.id === id; }) : null;
    var d = editing || {
      perk: '', about: '', category: '', offering_type: '',
      valid: '', booking: '', hero_url: null, status: ''
    };
    var typeOpts = ['', 'Service', 'Product'];
    var catOpts = FFP_CATEGORIES;

    var body =
      '<div class="form-section">' +
        '<div class="form-section-title">Photo</div>' +
        '<div id="listing-photo-slot" data-url="' + escHtml(d.hero_url || '') + '"></div>' +
      '</div>' +
      '<div class="form-section">' +
        '<div class="form-section-title">The perk</div>' +
        '<div class="form-grid">' +
          '<div class="field full">' +
            '<div class="label">Headline perk <span class="req">*</span> <span class="label-hint">— what gets a member to come in</span></div>' +
            '<input class="input" id="dm-perk" value="' + escHtml(d.perk) + '" placeholder="e.g. Bring a friend free · First class free · 20% off monthly">' +
          '</div>' +
          '<div class="field full">' +
            '<div class="label">Details</div>' +
            '<textarea class="textarea" id="dm-about" rows="3" placeholder="What the member gets, the value, any conditions">' + escHtml(d.about) + '</textarea>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="form-section">' +
        '<div class="form-section-title">Categorization</div>' +
        '<div class="form-grid">' +
          '<div class="field">' +
            '<div class="label">Activity <span class="req">*</span> <span class="label-hint">— what is it?</span></div>' +
            '<button type="button" class="ffp-picker-btn placeholder" id="dm-activity-btn" data-value="" data-category="">' +
              '<span>Choose activity…</span><span class="ms caret">expand_more</span>' +
            '</button>' +
          '</div>' +
          '<div class="field">' +
            '<div class="label">Type <span class="label-hint">— optional</span></div>' +
            '<select class="select" id="dm-offering-type">' +
              typeOpts.map(function (t) {
                var label = t || 'Not specified';
                return '<option value="' + escHtml(t) + '"' + (d.offering_type === t ? ' selected' : '') + '>' + escHtml(label) + '</option>';
              }).join('') +
            '</select>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="form-section">' +
        '<div class="form-section-title">Logistics</div>' +
        '<div class="form-grid">' +
          '<div class="field full">' +
            '<div class="label">Valid when <span class="label-hint">— be specific: days, times, member tier, date range</span></div>' +
            '<input class="input" id="dm-valid" value="' + escHtml(d.valid) + '" placeholder="e.g. Weekdays 8am–5pm, FFP members only, until 31 Dec 2026">' +
          '</div>' +
          '<div class="field full">' +
            '<div class="label">Booking link <span class="label-hint">— URL to book or redeem</span></div>' +
            '<input class="input" type="url" id="dm-booking" value="' + escHtml(d.booking) + '" placeholder="https://yourbusiness.com/book">' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="help-strip" style="margin-top:14px;">' +
        '<span class="ms">info</span>' +
        '<div>One claim per member is the default. ' +
          (editing && (d.status === 'live' || d.status === 'paused')
            ? '<b>This deal is approved.</b> Saving changes will send it back to admin for re-approval.'
            : 'New deals are reviewed by admin within 24 hours before going live.') +
        '</div>' +
      '</div>';

    var foot =
      (editing ? '<button class="btn btn-ghost left" onclick="confirmDeleteDeal(\'' + editing.id + '\'); closeModal()"><span class="ms">delete</span> Delete</button>' : '') +
      '<button class="btn btn-ghost" onclick="closeModal()">Cancel</button>' +
      '<button class="btn btn-pri" onclick="saveDeal(\'' + (editing ? editing.id : '') + '\')">' +
        (editing ? 'Save changes' : 'Submit for review') +
      '</button>';

    if (typeof window.openModalShell === 'function') {
      window.openModalShell('lg', (editing ? 'Edit deal' : 'New deal'), body, foot);
    }
    if (typeof window.renderListingUploader === 'function') {
      try { window.renderListingUploader(d.hero_url); } catch (e) {}
    }

    // Wire activity picker button
    setTimeout(function () {
      var btn = document.getElementById('dm-activity-btn');
      if (!btn) return;
      // Pre-fill if editing
      if (d.activity || d.category) {
        setActivityBtn(btn, d.activity || d.category, d.category);
      }
      btn.addEventListener('click', function () {
        if (window.FFPPicker && typeof window.FFPPicker.openActivity === 'function') {
          window.FFPPicker.openActivity(btn.dataset.value, function (name, cat) {
            setActivityBtn(btn, name, cat);
          });
        } else {
          console.error('[FFP Deals] FFPPicker not loaded');
          toast('Activity picker not ready', 'error');
        }
      });
    }, 50);
  }

  function setActivityBtn(btn, name, category) {
    btn.dataset.value = name || '';
    btn.dataset.category = category || '';
    if (name) {
      btn.classList.remove('placeholder');
      btn.innerHTML =
        '<div class="picked"><div class="name">' + escHtml(name) + '</div>' +
        (category ? '<div class="group">' + escHtml(category) + '</div>' : '') +
        '</div>' +
        '<span class="ms caret">expand_more</span>';
    } else {
      btn.classList.add('placeholder');
      btn.innerHTML = '<span>Choose activity…</span><span class="ms caret">expand_more</span>';
    }
  }

  // ─── Save (INSERT / UPDATE) ───
  async function realSaveDeal(id) {
    if (!window.FFP_PROVIDER || !window.FFP_PROVIDER.id) {
      toast('Provider not loaded', 'error');
      return;
    }
    var get = function (key) {
      var el = document.getElementById('dm-' + key);
      return el ? (el.value || '').trim() : '';
    };

    var perk     = get('perk');
    var actBtn   = document.getElementById('dm-activity-btn');
    var activity = actBtn ? actBtn.dataset.value : '';
    var category = actBtn ? actBtn.dataset.category : '';

    if (!perk)     { toast('Headline perk is required', 'error'); return; }
    if (!activity) { toast('Activity is required', 'error'); return; }

    var photoSlot = document.getElementById('listing-photo-slot');
    var heroUrl = (photoSlot && photoSlot.dataset.url) ? photoSlot.dataset.url : null;
    if (heroUrl === '') heroUrl = null;

    var typeEl = document.getElementById('dm-offering-type');
    var offeringType = typeEl ? (typeEl.value || null) : null;
    if (offeringType === '') offeringType = null;

    var payload = {
      title:            perk,
      description:      get('about') || null,
      activity:         activity,
      category:         category || null,
      offering_type:    offeringType,
      valid_when:       get('valid') || null,
      booking_method:   get('booking') || null,
      hero_image_url:   heroUrl
    };

    var reapprovalNote = '';
    try {
      if (id) {
        // Check existing status → re-approval rule
        var existing = deals.find(function (x) { return x.id === id; });
        if (existing && (existing.status === 'live' || existing.status === 'paused')) {
          payload.status = 'pending';
          reapprovalNote = ' (sent back for re-approval)';
        }
        var upd = await window.supabase.from('deals').update(payload).eq('id', id);
        if (upd.error) throw upd.error;
        toast('Deal updated' + reapprovalNote, 'success');
        if (typeof window.closeModal === 'function') window.closeModal();
      } else {
        payload.provider_id = window.FFP_PROVIDER.id;
        payload.status = 'pending';
        payload.featured = false;
        payload.max_redemptions_per_member = 1;  // FFP rule: 1 claim per member
        var ins = await window.supabase.from('deals').insert(payload).select().single();
        if (ins.error) throw ins.error;
        if (typeof window.closeModal === 'function') window.closeModal();
        if (typeof window.showSubmittedModal === 'function') {
          try { window.showSubmittedModal('deal'); } catch (e) {}
        } else {
          toast('Submitted for review', 'success');
        }
      }
      await refresh();
    } catch (e) {
      console.error('[FFP Provider Deals] save:', e);
      var msg = e.message || 'Save failed';
      if (/policy|permission|denied|rls/i.test(msg)) {
        msg = 'Save blocked by RLS — check deals policies + provider status';
      } else if (/does not exist/i.test(msg)) {
        msg = 'Schema mismatch — run the offering_type SQL';
      }
      toast(msg, 'error');
    }
  }

  async function realToggleDeal(id, newStatus) {
    if (!id || (newStatus !== 'live' && newStatus !== 'paused')) return;
    try {
      var res = await window.supabase.from('deals').update({ status: newStatus }).eq('id', id);
      if (res.error) throw res.error;
      toast(newStatus === 'paused' ? 'Deal paused' : 'Deal resumed', 'success');
      await refresh();
    } catch (e) {
      console.error('[FFP Provider Deals] toggle:', e);
      toast(e.message || 'Status change failed', 'error');
    }
  }

  async function realDeleteDeal(id) {
    if (!id) return;
    var doDelete = async function () {
      try {
        var res = await window.supabase.from('deals').delete().eq('id', id);
        if (res.error) throw res.error;
        toast('Deal deleted', 'success');
        await refresh();
      } catch (e) {
        console.error('[FFP Provider Deals] delete:', e);
        toast(e.message || 'Delete failed', 'error');
      }
    };
    if (typeof window.openConfirm === 'function') {
      window.openConfirm('Delete this deal?', 'Members who already claimed it keep their record, but no new claims can be made.', doDelete);
    } else {
      if (confirm('Delete this deal?')) await doDelete();
    }
  }

  // ─── Init ───
  async function init() {
    var ok = await waitFor(function () {
      return window.supabase && window.supabase.auth &&
             typeof window.renderDeals === 'function' &&
             typeof deals !== 'undefined';
    }, 15000);
    if (!ok) { console.error('[FFP Provider Deals] dependencies never loaded'); return; }

    var authed = await waitFor(function () {
      return !!(window.FFP_PROVIDER && window.FFP_PROVIDER.id);
    }, 30000);
    if (!authed) { console.warn('[FFP Provider Deals] FFP_PROVIDER not set'); return; }

    injectStyles();

    try {
      await refresh();
      console.log('[FFP Provider Deals v2] Loaded from Supabase \u2713');
    } catch (e) {
      console.error('[FFP Provider Deals] initial load:', e);
    }

    window.openDealModal       = realOpenDealModal;
    window.saveDeal            = realSaveDeal;
    window.toggleDeal          = realToggleDeal;
    window.confirmDeleteDeal   = realDeleteDeal;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
