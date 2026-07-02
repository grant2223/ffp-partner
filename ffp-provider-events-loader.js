/* FFP Provider Events Loader — v10 (2026-06-12)
   v10: UNIFIED FIELDS — Country/City now use the shared searchable picker (window.FFPPicker), the same
        component as the Trips form and the activity field (no more native dropdowns). "Level" reads the
        shared window.FFP_TAX.attendeeLevels (the dashboard em-intensity select). One look across all forms.
   v9: GYG PARITY — injectEventDetail() adds a "Good to know" section to the event modal (DOM-injected, so only
       this loader deploys): Highlights, What's included / NOT included, Meeting point + map coords, Min age,
       Not allowed, Know before you go, Languages, Wheelchair accessible + notes, Free-cancellation hours + policy.
       Saved as arrays/scalars via provider_save_listing kind='event'. Pre-fills on edit (mapForUi + fetch select extended).
   --- prior ---
   v8 (2026-06-05)
   v8: CATEGORY STANDARDISATION — removed the dead 23-granular FFP_CATEGORIES array (unused since v4 swapped
       the category dropdown for the activity picker). Events now derive their category from the activity
       picker, which reads activity_types.category — standardised platform-wide to the 6
       (fitness/sports/wellness/recovery/adventure/food). The granular values are preserved in
       activity_types.subcategory. No live behaviour change; dead-code + comment cleanup only.
   v7: GUEST LIST inside the event modal — injectEventRoster() calls provider_event_roster(p_me,p_event)
       (owner-gated SECURITY DEFINER RPC) and shows each RSVP'd member (photo + name + city) with a
       "Going" / "Checked in" badge + a "N going · M checked in" header. Lets providers see who's coming
       and who actually showed up (via venue-QR check-in). node-checked.
   v6 (rebuilt form: Country/City taxonomy cascade required, Area+Venue optional,
   Location pin, End date/time, numeric Price (AED); flow Basics→When→Where→Pricing→Good-to-know; save via provider_save_listing RPC)
    — v3 close edit modal after delete; v4
   v4 changes (Grant's feedback):
   - Activity picker (379 activities, searchable, grouped by category) replaces
     the broad-category dropdown — pick "Padel" not "Racquet sports".
   - Reuses window.FFPPicker exposed by the experiences loader (no extra script tag).
   - Stores both activity + category on each event row.
   v3: Removed "Who is this for?" + thin chevron CSS.
   v2: FFP 23-category taxonomy + re-approval rule.
   v1: Initial wiring.
*/
(function () {
  'use strict';

  // Categories are standardised platform-wide to the 6 (fitness/sports/wellness/recovery/adventure/food)
  // and derived from the activity picker (activity_types.category). No hard-coded category list here.

  function toast(msg, kind) {
    if (typeof window.showToast === 'function') {
      try { window.showToast(msg, kind || 'info'); return; } catch (e) {}
    }
    console.log('[FFP Provider Events]', msg);
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
    if (document.getElementById('ffp-provider-events-css')) return;
    var css = document.createElement('style');
    css.id = 'ffp-provider-events-css';
    css.textContent = [
      '*::-webkit-scrollbar{display:none !important;width:0 !important;height:0 !important;}',
      '*{-ms-overflow-style:none !important;scrollbar-width:none !important;}',
      '#panel-events{overflow-x:hidden;}',
      '.modal select, .modal .select, .modal-body select, .modal-body .select{color-scheme:light;}',
      '.modal select option, .modal-body select option{background:#ffffff !important;color:#0e2531 !important;}',
      '.modal select option:checked, .modal-body select option:checked{background:#1980AD !important;color:#082335 !important;}',

      // FFP thin chevron-down on all selects in dashboard panels + modals
      // (replaces native OS block arrow with brand-standard line chevron)
      'select.select, select.input,' +
      ' #panel-overview select, #panel-profile select, #panel-deals select, #panel-events select,' +
      ' #panel-experiences select, #panel-challenges select, #panel-checkins select,' +
      ' .modal select, .modal-body select {' +
        'appearance:none;-webkit-appearance:none;-moz-appearance:none;' +
        'background-image:url("data:image/svg+xml;charset=UTF-8,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%238a99a8\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'%3E%3Cpolyline points=\'6 9 12 15 18 9\'%3E%3C/polyline%3E%3C/svg%3E");' +
        'background-repeat:no-repeat;' +
        'background-position:right 12px center;' +
        'background-size:16px;' +
        'padding-right:36px;' +
      '}',
      // Hide IE/Edge legacy select arrow
      'select.select::-ms-expand, select.input::-ms-expand{display:none;}',

      // Picker button (matches experiences loader styling)
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

  function mapForUi(row) {
    var pad = function (n) { return String(n).padStart(2, '0'); };
    // Split stored UTC into [date, time] in the FACILITY timezone (shared FFPTime), not the browser's.
    var fmt = function (v) { if (!v) return ['', '']; if (window.FFPTime) { var di = window.FFPTime.toDateInput(v), ti = window.FFPTime.toTimeInput(v); if (di) return [di, ti]; } var x = new Date(v); if (isNaN(x.getTime())) return ['', '']; return [x.getFullYear() + '-' + pad(x.getMonth() + 1) + '-' + pad(x.getDate()), pad(x.getHours()) + ':' + pad(x.getMinutes())]; };
    var sd = fmt(row.starts_at), ed = fmt(row.ends_at);
    var d = sd[0], t = sd[1];
    return {
      id: row.id,
      title: row.title || '',
      description: row.description || '',
      about: row.about || '',
      activity: row.activity || '',
      category: row.category || '',
      intensity: row.fitness_level || 'Social',
      event_date: d || '',
      event_time: t,
      end_date: ed[0] || '',
      end_time: ed[1] || '',
      country: row.country || '',
      venue: row.venue || '',
      city: row.city || '',
      area: row.area || '',
      setting: row.setting || '',
      capacity: row.capacity || 0,
      price_aed: (row.price_aed != null ? row.price_aed : ''),
      pay_requirement: row.pay_requirement || 'required',
      cost: row.cost || '',
      parking: row.parking || '',
      facilities: row.facilities || '',
      bring: row.bring || '',
      who: row.who_for || '',
      highlights: Array.isArray(row.highlights) ? row.highlights : [],
      included: Array.isArray(row.what_included) ? row.what_included : [],
      not_included: Array.isArray(row.what_not_included) ? row.what_not_included : [],
      not_allowed: Array.isArray(row.not_allowed) ? row.not_allowed : [],
      know_before: Array.isArray(row.know_before) ? row.know_before : [],
      languages: Array.isArray(row.languages) ? row.languages : [],
      meeting_point: row.meeting_point || '',
      meeting_lat: (row.meeting_lat != null ? row.meeting_lat : ''),
      meeting_lng: (row.meeting_lng != null ? row.meeting_lng : ''),
      min_age: (row.min_age != null ? row.min_age : ''),
      wheelchair_accessible: (row.wheelchair_accessible == null ? null : !!row.wheelchair_accessible),
      accessibility_notes: row.accessibility_notes || '',
      free_cancellation_hours: (row.free_cancellation_hours != null ? row.free_cancellation_hours : ''),
      cancellation_policy: row.cancellation_policy || '',
      hero_url: row.hero_image_url || null,
      status: row.status || 'pending',
      verified: row.status === 'live',
      featured: !!row.featured,
      rsvps: 0,
      capacity_pct: 0,
      created_at: row.created_at ? row.created_at.slice(0, 10) : '',
      _raw: row
    };
  }

  async function fetchEvents() {
    if (!window.FFP_PROVIDER || !window.FFP_PROVIDER.id) return [];
    var providerId = window.FFP_PROVIDER.id;
    var res = await window.supabase
      .from('events')
      .select('id, provider_id, title, description, about, activity, category, fitness_level, group_filter, hero_image_url, gallery, country, city, venue, area, setting, starts_at, ends_at, capacity, price_aed, cost, parking, facilities, bring, who_for, status, featured, highlights, what_included, what_not_included, meeting_point, meeting_lat, meeting_lng, not_allowed, know_before, languages, min_age, wheelchair_accessible, accessibility_notes, free_cancellation_hours, cancellation_policy, pay_requirement, created_at, updated_at')
      .eq('provider_id', providerId)
      .order('starts_at', { ascending: true });
    if (res.error) {
      console.error('[FFP Provider Events] fetch:', res.error);
      toast('Could not load events', 'error');
      return [];
    }
    return (res.data || []).map(mapForUi);
  }

  async function refresh() {
    if (typeof events === 'undefined') return;
    var rows = await fetchEvents();
    events.length = 0;
    rows.forEach(function (r) { events.push(r); });
    if (typeof window.renderEvents === 'function') { try { window.renderEvents(); } catch (e) {} }
    if (typeof window.renderNav === 'function')   { try { window.renderNav();   } catch (e) {} }
  }

  function buildStartsAt(dateStr, timeStr) {
    if (!dateStr) return null;
    var t = (timeStr && timeStr.length >= 4) ? timeStr : '00:00';
    // Interpret the entered date+time in the FACILITY timezone (shared FFPTime), then store UTC.
    if (window.FFPTime) return window.FFPTime.toUTC(dateStr + 'T' + t);
    var d = new Date(dateStr + 'T' + t + ':00');
    return isNaN(d.getTime()) ? null : d.toISOString();
  }

  function escHtmlSafe(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function setActivityBtn(btn, name, category) {
    btn.dataset.value = name || '';
    btn.dataset.category = category || '';
    if (name) {
      btn.classList.remove('placeholder');
      btn.innerHTML =
        '<div class="picked"><div class="name">' + escHtmlSafe(name) + '</div>' +
        (category ? '<div class="group">' + escHtmlSafe(category) + '</div>' : '') +
        '</div>' +
        '<span class="ms caret">expand_more</span>';
    } else {
      btn.classList.add('placeholder');
      btn.innerHTML = '<span>Choose activity…</span><span class="ms caret">expand_more</span>';
    }
  }

  // Replace the category <select> with an activity picker button
  function swapCategoryForPicker(currentActivity, currentCategory) {
    var sel = document.getElementById('em-category');
    if (!sel) return;
    var fieldDiv = sel.closest('.field');
    if (!fieldDiv) return;

    // Update label
    var labelDiv = fieldDiv.querySelector('.label');
    if (labelDiv) {
      labelDiv.innerHTML = 'Activity <span class="req">*</span> <span class="label-hint">— what is it?</span>';
    }

    // Build picker button
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ffp-picker-btn placeholder';
    btn.id = 'em-activity-btn';
    btn.dataset.value = '';
    btn.dataset.category = '';
    btn.innerHTML = '<span>Choose activity…</span><span class="ms caret">expand_more</span>';

    // Replace the select element
    sel.parentNode.replaceChild(btn, sel);

    // Initialize state
    if (currentActivity) {
      setActivityBtn(btn, currentActivity, currentCategory);
    }

    // Wire click
    btn.addEventListener('click', function () {
      if (window.FFPPicker && typeof window.FFPPicker.openActivity === 'function') {
        window.FFPPicker.openActivity(btn.dataset.value, function (name, cat) {
          setActivityBtn(btn, name, cat);
        });
      } else {
        console.error('[FFP Events] FFPPicker not loaded — is experiences loader present?');
        toast('Activity picker not ready', 'error');
      }
    });
  }

  // Country + City via the shared searchable picker (window.FFPPicker) — the SAME component as the Trips
  // form and the activity field, reading the one shared taxonomy (FFP_TAX.cities). No native dropdowns.
  function fillEventLocation(existing) {
    var prof = window.providerProfile || {};
    var coBtn = document.getElementById('em-country-btn');
    var ciBtn = document.getElementById('em-city-btn');
    if (!coBtn || !ciBtn) return;
    var setBtn = function (btn, val, ph) {
      btn.dataset.value = val || '';
      if (val) { btn.classList.remove('placeholder'); btn.innerHTML = '<span>' + escHtmlSafe(val) + '</span><span class="ms caret">expand_more</span>'; }
      else { btn.classList.add('placeholder'); btn.innerHTML = '<span>' + ph + '</span><span class="ms caret">expand_more</span>'; }
    };
    var initCountry = (existing && existing.country) || prof.country || '';
    var initCity = (existing && existing.city) || '';
    if (initCountry) setBtn(coBtn, initCountry, 'Choose country…');
    ciBtn.dataset.country = initCountry;
    if (initCity) setBtn(ciBtn, initCity, 'Choose city…');
    coBtn.addEventListener('click', function () {
      if (!(window.FFPPicker && window.FFPPicker.openCountry)) { toast('Picker not ready', 'error'); return; }
      window.FFPPicker.openCountry(coBtn.dataset.value, function (name) {
        setBtn(coBtn, name, 'Choose country…');
        if (ciBtn.dataset.country !== name) { ciBtn.dataset.country = name; setBtn(ciBtn, '', 'Choose city…'); }
      });
    });
    ciBtn.addEventListener('click', function () {
      if (!(window.FFPPicker && window.FFPPicker.openCity)) { toast('Picker not ready', 'error'); return; }
      window.FFPPicker.openCity(ciBtn.dataset.country || coBtn.dataset.value, ciBtn.dataset.value, function (name) { setBtn(ciBtn, name, 'Choose city…'); });
    });
  }

  // ── Ticket types (event_tickets) — optional per-tier pricing & allocation ──
  var _emTixDel = [];
  function _emCcy() { return (window.FFPCurrency && window.FFPCurrency.providerCode) ? window.FFPCurrency.providerCode() : 'AED'; }
  function emTicketRowHtml(t) {
    t = t || {};
    return '<div class="em-tk-row" data-id="' + escHtmlSafe(t.id || '') + '" style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;margin-bottom:10px;border:1px solid var(--ffp-border);border-radius:10px;padding:10px;">' +
      '<div style="flex:2;min-width:150px;"><div class="label">Name</div><input class="input em-tk-name" value="' + escHtmlSafe(t.name || '') + '" placeholder="e.g. Competitor"></div>' +
      '<div style="flex:1;min-width:88px;"><div class="label">Price (' + _emCcy() + ')</div><input class="input em-tk-price" type="number" value="' + escHtmlSafe(t.price_aed != null ? t.price_aed : '') + '" placeholder="0 = free"></div>' +
      '<div style="flex:1;min-width:88px;"><div class="label">Allocation</div><input class="input em-tk-cap" type="number" value="' + escHtmlSafe(t.capacity != null ? t.capacity : '') + '" placeholder="∞"></div>' +
      '<div style="flex:1;min-width:88px;"><div class="label">Max/order</div><input class="input em-tk-max" type="number" value="' + escHtmlSafe(t.max_per_order != null ? t.max_per_order : '') + '" placeholder="—"></div>' +
      '<button type="button" class="btn btn-ghost btn-sm" title="Remove" onclick="emRemoveTicket(this)"><span class="ms">delete</span></button>' +
    '</div>';
  }
  window.emAddTicket = function (t) { var w = document.getElementById('em-tickets'); if (!w) return; w.insertAdjacentHTML('beforeend', emTicketRowHtml(t)); };
  window.emRemoveTicket = function (btn) { var r = btn.closest('.em-tk-row'); if (!r) return; var idv = r.getAttribute('data-id'); if (idv) _emTixDel.push(idv); r.remove(); };
  function prefillEventTickets(editingId) {
    _emTixDel = [];
    var w = document.getElementById('em-tickets'); if (!w) return;
    w.innerHTML = '';
    if (!editingId) return;
    window.supabase.rpc('provider_list_event_tickets', { p_provider: (window.FFP_PROVIDER || {}).id, p_event: editingId })
      .then(function (r) { ((r && r.data) ? r.data : []).forEach(function (t) { window.emAddTicket(t); }); })
      .catch(function () {});
  }
  async function saveEventTickets(eventId) {
    if (!eventId) return;
    var prov = (window.FFP_PROVIDER || {}).id;
    var rows = Array.prototype.slice.call(document.querySelectorAll('#em-tickets .em-tk-row'));
    var ord = 0;
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var nameEl = r.querySelector('.em-tk-name'); var name = nameEl ? (nameEl.value || '').trim() : '';
      if (!name) continue;
      var price = (r.querySelector('.em-tk-price') || {}).value || '0';
      var cap = (r.querySelector('.em-tk-cap') || {}).value || '';
      var mx = (r.querySelector('.em-tk-max') || {}).value || '';
      var idv = r.getAttribute('data-id') || null;
      var p = { name: name, price_aed: price, capacity: cap, max_per_order: mx, sort_order: ord++ };
      try { await window.supabase.rpc('provider_save_event_ticket', { p_provider: prov, p_event: eventId, p_id: idv, p: p }); }
      catch (e) { console.warn('[FFP Events] ticket save', e); }
    }
    for (var j = 0; j < _emTixDel.length; j++) {
      try { await window.supabase.rpc('provider_delete_event_ticket', { p_provider: prov, p_id: _emTixDel[j] }); } catch (e) {}
    }
    _emTixDel = [];
  }

  function patchModalAfterOpen(editingId) {
    // Find the activity/category for editing event
    var existing = editingId ? events.find(function (x) { return x.id === editingId; }) : null;
    var currentActivity = existing ? (existing.activity || '') : '';
    var currentCategory = existing ? (existing.category || '') : '';

    swapCategoryForPicker(currentActivity, currentCategory);
    fillEventLocation(existing);

    // Remove "Who is this for?" field — every event is for FFP members anyway
    var whoEl = document.getElementById('em-who');
    if (whoEl) {
      var fieldEl = whoEl.closest('.field');
      if (fieldEl && fieldEl.parentNode) fieldEl.parentNode.removeChild(fieldEl);
    }

    // Inject the GYG-parity "Good to know" detail section
    injectEventDetail(existing);

    // Prefill ticket types (edit) / clear (new)
    prefillEventTickets(editingId);

    // Gallery (shared helper)
    if (window.FFPGallery) window.FFPGallery.init('em-gallery', (existing && existing.gallery && existing.gallery.length) ? existing.gallery : ((existing && (existing.hero_image_url || existing.hero_url)) ? [existing.hero_image_url || existing.hero_url] : []));

    // Standardise all native selects in this modal to the shared dark picker (matches Sessions/Profile).
    setTimeout(function () { if (window.FFPSelect) { var m = document.querySelector('.modal'); if (m) window.FFPSelect.enhance(m); } }, 60);

    // Clean prior re-approval note
    var modal = document.querySelector('.modal');
    if (!modal) return;
    var existingNote = modal.querySelector('.ffp-reapproval-note');
    if (existingNote) existingNote.remove();
  }

  // Inject GYG-parity detail fields into the open event modal (kept here so only the loader deploys).
  function injectEventDetail(existing) {
    var modalBody = document.querySelector('.modal .modal-body, .modal-body');
    if (!modalBody || document.getElementById('em-highlights')) return;
    var e = existing || {};
    var arr = function (a) { return (Array.isArray(a) ? a : []).join('\n'); };
    var latlng = (e.meeting_lat != null && e.meeting_lat !== '' && e.meeting_lng != null && e.meeting_lng !== '') ? (e.meeting_lat + ', ' + e.meeting_lng) : '';
    var wheel = e.wheelchair_accessible;
    var sec = document.createElement('div');
    sec.className = 'form-section';
    sec.innerHTML =
      '<div class="form-section-title">Good to know</div>' +
      '<div class="form-grid">' +
        '<div class="field full"><div class="label">Highlights <span class="label-hint">— one per line</span></div>' +
          '<textarea class="textarea" id="em-highlights" rows="3" placeholder="Live DJ &amp; finisher medal\nChip timing\nFree parking">' + escHtmlSafe(arr(e.highlights)) + '</textarea></div>' +
        '<div class="field full"><div class="label">What\'s included <span class="label-hint">— one per line</span></div>' +
          '<textarea class="textarea" id="em-includes" rows="3" placeholder="Race bib\nFinisher medal\nHydration stations">' + escHtmlSafe(arr(e.included)) + '</textarea></div>' +
        '<div class="field full"><div class="label">What\'s NOT included <span class="label-hint">— one per line</span></div>' +
          '<textarea class="textarea" id="em-excludes" rows="2" placeholder="Parking\nMeals">' + escHtmlSafe(arr(e.not_included)) + '</textarea></div>' +
        '<div class="field full"><div class="label">Meeting point <span class="label-hint">— where to gather</span></div>' +
          '<input class="input" id="em-meeting-point" value="' + escHtmlSafe(e.meeting_point) + '" placeholder="e.g. Kite Beach, north entrance"></div>' +
        '<div class="field"><div class="label">Minimum age</div>' +
          '<input class="input" type="number" id="em-min-age" value="' + escHtmlSafe(e.min_age) + '" placeholder="e.g. 12"></div>' +
        '<div class="field full"><div class="label">Not allowed <span class="label-hint">— one per line</span></div>' +
          '<textarea class="textarea" id="em-not-allowed" rows="2" placeholder="Pets (assistance dogs OK)\nGlass bottles">' + escHtmlSafe(arr(e.not_allowed)) + '</textarea></div>' +
        '<div class="field full"><div class="label">Know before you go <span class="label-hint">— one per line</span></div>' +
          '<textarea class="textarea" id="em-know-before" rows="2" placeholder="Arrive 30 min early\nBring photo ID">' + escHtmlSafe(arr(e.know_before)) + '</textarea></div>' +
        '<div class="field"><div class="label">Languages <span class="label-hint">— one per line</span></div>' +
          '<textarea class="textarea" id="em-languages" rows="2" placeholder="English\nArabic">' + escHtmlSafe(arr(e.languages)) + '</textarea></div>' +
        '<div class="field"><div class="label">Wheelchair accessible</div>' +
          '<select class="select" id="em-wheelchair"><option value="">—</option><option value="true"' + (wheel === true ? ' selected' : '') + '>Yes</option><option value="false"' + (wheel === false ? ' selected' : '') + '>No</option></select></div>' +
        '<div class="field full"><div class="label">Accessibility notes</div>' +
          '<input class="input" id="em-accessibility" value="' + escHtmlSafe(e.accessibility_notes) + '" placeholder="e.g. Step-free access; accessible WC on site"></div>' +
        '<div class="field"><div class="label">Free cancellation <span class="label-hint">— hours before</span></div>' +
          '<input class="input" type="number" id="em-cancel-hours" value="' + escHtmlSafe(e.free_cancellation_hours) + '" placeholder="e.g. 24"></div>' +
        '<div class="field full"><div class="label">Cancellation policy</div>' +
          '<input class="input" id="em-cancel-policy" value="' + escHtmlSafe(e.cancellation_policy) + '" placeholder="e.g. Free cancellation up to 24h before"></div>' +
      '</div>';
    (document.getElementById('ev-step2') || modalBody).appendChild(sec);
  }

  function showReapprovalNoteIfNeeded(id) {
    if (!id) return;
    var existing = events.find(function (x) { return x.id === id; });
    if (!existing) return;
    if (existing.status !== 'live' && existing.status !== 'paused') return;
    // Inject a help strip into the modal body
    var modalBody = document.querySelector('.modal .modal-body, .modal-body');
    if (!modalBody) return;
    if (modalBody.querySelector('.ffp-reapproval-note')) return;
    var note = document.createElement('div');
    note.className = 'help-strip ffp-reapproval-note';
    note.style.marginTop = '14px';
    note.innerHTML = '<span class="ms">info</span><div><b>This event is approved.</b> Saving changes will send it back to admin for re-approval.</div>';
    (document.getElementById('ev-step2') || modalBody).appendChild(note);
  }

  // ─── Save (INSERT / UPDATE) ───
  async function realSaveEvent(id) {
    if (!window.FFP_PROVIDER || !window.FFP_PROVIDER.id) { toast('Provider not loaded', 'error'); return; }
    var get = function (key) {
      var el = document.getElementById('em-' + key);
      return el ? (el.value || '').trim() : '';
    };
    var title    = get('title');
    var date     = get('date');
    var actBtn   = document.getElementById('em-activity-btn');
    var activity = actBtn ? actBtn.dataset.value : '';
    var category = actBtn ? actBtn.dataset.category : '';
    var coBtn    = document.getElementById('em-country-btn');
    var ciBtn    = document.getElementById('em-city-btn');
    var country  = coBtn ? (coBtn.dataset.value || '') : '';
    var city     = ciBtn ? (ciBtn.dataset.value || '') : '';
    if (!title)    { toast('Title is required', 'error'); return; }
    if (!activity) { toast('Activity is required', 'error'); return; }
    if (!date)     { toast('Start date is required', 'error'); return; }
    if (!country)  { toast('Country is required', 'error'); return; }
    if (!city)     { toast('City is required', 'error'); return; }

    var startsAt = buildStartsAt(date, get('time'));
    var endDate  = get('end-date');
    var endsAt   = endDate ? buildStartsAt(endDate, get('end-time')) : null;
    var _pics = (window.FFPGallery ? window.FFPGallery.get('em-gallery') : []);
    var heroUrl = (_pics && _pics.length) ? _pics[0] : null;
    var capRaw = get('capacity');
    var capacity = capRaw ? parseInt(capRaw, 10) : null;
    if (capacity != null && isNaN(capacity)) capacity = null;
    var priceRaw = get('price');
    var priceNum = priceRaw ? parseFloat(priceRaw) : null;
    if (priceNum != null && isNaN(priceNum)) priceNum = null;
    var desc = get('description');

    // GYG-parity detail fields (injected "Good to know" section)
    var arrFrom = function (key) { var v = get(key); return v ? v.split('\n').map(function (x) { return x.trim(); }).filter(function (x) { return x.length; }) : []; };
    var mLat = null, mLng = null;
    var latEl = document.getElementById('em-lat'), lngEl = document.getElementById('em-lng');
    var latV = latEl ? (latEl.value || '').trim() : '', lngV = lngEl ? (lngEl.value || '').trim() : '';
    if (latV && lngV) { var a = parseFloat(latV), b = parseFloat(lngV); if (!isNaN(a)) mLat = a; if (!isNaN(b)) mLng = b; }
    else { var llRaw = get('latlng'); if (llRaw) { var pp = llRaw.split(','); if (pp.length >= 2) { var a1 = parseFloat(pp[0]), b1 = parseFloat(pp[1]); if (!isNaN(a1)) mLat = a1; if (!isNaN(b1)) mLng = b1; } } }
    var wheel = get('wheelchair'), minAgeRaw = get('min-age'), cancelHrsRaw = get('cancel-hours');

    var payload = {
      title: title,
      description: desc || null,
      about: desc || null,
      activity: activity,
      category: category || null,
      fitness_level: get('intensity') || null,
      starts_at: startsAt,
      ends_at: endsAt,
      country: country || null,
      city: city || null,
      area: get('area') || null,
      venue: get('venue') || null,
      capacity: capacity,
      price_aed: priceNum,
      pay_requirement: (document.getElementById('em-allow-unpaid') && document.getElementById('em-allow-unpaid').checked) ? 'optional' : 'required',
      parking: get('parking') || null,
      facilities: get('facilities') || null,
      bring: get('bring') || null,
      highlights: arrFrom('highlights'),
      what_included: arrFrom('includes'),
      what_not_included: arrFrom('excludes'),
      not_allowed: arrFrom('not-allowed'),
      know_before: arrFrom('know-before'),
      languages: arrFrom('languages'),
      meeting_point: get('meeting-point') || null,
      meeting_lat: mLat,
      meeting_lng: mLng,
      min_age: minAgeRaw ? parseInt(minAgeRaw, 10) : null,
      wheelchair_accessible: (wheel === '' ? null : wheel === 'true'),
      accessibility_notes: get('accessibility') || null,
      free_cancellation_hours: cancelHrsRaw ? parseInt(cancelHrsRaw, 10) : null,
      cancellation_policy: get('cancel-policy') || null,
      hero_image_url: heroUrl,
      gallery: (window.FFPGallery ? window.FFPGallery.get('em-gallery') : [])
    };

    // Gate: a PAID Event requires payment before confirmation → the partner must connect Stripe to publish it.
    var _evPaid = (priceNum && priceNum > 0) || Array.prototype.some.call(document.querySelectorAll('.em-tk-price'), function (i) { return parseFloat(i.value) > 0; });
    if (_evPaid && (window.FFP_PROVIDER || {}).payments_status !== 'connected') {
      toast('Paid Event: connect Stripe in the Payments tab before publishing — members must pay to confirm a paid booking.', 'error');
      return;
    }

    var reapprovalNote = '';
    try {
      if (id) {
        // edit via SECURITY DEFINER RPC (auth.uid trap blocks direct .update). Keeps current status.
        var upd = await window.supabase.rpc('provider_save_listing', { p_kind: 'event', p_provider: (window.FFP_PROVIDER || {}).id, p_id: id, p: payload });
        if (upd.error) throw upd.error;
        if (!upd.data) throw new Error('Update failed — not found or not permitted');
        await saveEventTickets(id);
        toast('Event updated', 'success');
        if (typeof window.closeModal === 'function') window.closeModal();
      } else {
        var ins = await window.supabase.rpc('provider_save_listing', { p_kind: 'event', p_provider: (window.FFP_PROVIDER || {}).id, p_id: null, p: payload });
        if (ins.error) throw ins.error;
        if (!ins.data) throw new Error('Submit failed — please try again');
        await saveEventTickets(ins.data);
        if (typeof window.closeModal === 'function') window.closeModal();
        if (typeof window.showSubmittedModal === 'function') {
          try { window.showSubmittedModal('event'); } catch (e) {}
        } else {
          toast('Submitted for review', 'success');
        }
      }
      await refresh();
    } catch (e) {
      console.error('[FFP Provider Events] save:', e);
      var msg = e.message || 'Save failed';
      if (/policy|permission|denied|rls/i.test(msg)) msg = 'Save blocked by RLS';
      else if (/does not exist/i.test(msg))         msg = 'Schema mismatch — see console';
      toast(msg, 'error');
    }
  }

  async function realDeleteEvent(id) {
    if (!id) return;
    var doDelete = async function () {
      try {
        var res = await window.supabase.rpc('provider_delete_listing', { p_kind: 'event', p_provider: (window.FFP_PROVIDER||{}).id, p_id: id });
        if (!res.error && res.data !== 'deleted') throw new Error('Delete failed — not found or not permitted');
        if (res.error) throw res.error;
        toast('Event deleted', 'success');
        if (typeof window.closeModal === 'function') window.closeModal();
        await refresh();
      } catch (e) {
        console.error('[FFP Provider Events] delete:', e);
        toast(e.message || 'Delete failed', 'error');
      }
    };
    if (typeof window.openConfirm === 'function') {
      window.openConfirm('Delete this event?', 'Members with RSVPs will be notified. This cannot be undone.', doDelete);
    } else {
      if (confirm('Delete this event?')) await doDelete();
    }
  }

  // ─── Init ───
  async function init() {
    var ok = await waitFor(function () {
      return window.supabase && window.supabase.auth &&
             typeof window.renderEvents === 'function' &&
             typeof events !== 'undefined' &&
             typeof window.openEventModal === 'function';
    }, 15000);
    if (!ok) { console.error('[FFP Provider Events] dependencies never loaded'); return; }

    var authed = await waitFor(function () {
      return !!(window.FFP_PROVIDER && window.FFP_PROVIDER.id);
    }, 30000);
    if (!authed) { console.warn('[FFP Provider Events] FFP_PROVIDER not set'); return; }

    injectStyles();

    try {
      await refresh();
      console.log('[FFP Provider Events] loaded v6 \u2014 rebuilt form (taxonomy country/city, end, price) \u2713');
    } catch (e) {
      console.error('[FFP Provider Events] initial load:', e);
    }

    // v2: GUEST LIST — show who RSVP'd (passport info) + who's checked in, inside the event modal.
    async function injectEventRoster(editingId) {
      if (!editingId) return;   // only for existing events
      var modalBody = document.querySelector('.modal .modal-body, .modal-body');
      if (!modalBody || document.getElementById('ffp-ev-roster')) return;
      var me = (window.FFPAuth && window.FFPAuth.getMember && window.FFPAuth.getMember()) || null;
      var meId = me && me.id; if (!meId) return;
      function esc(s){ return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
      var sec = document.createElement('div');
      sec.id = 'ffp-ev-roster'; sec.className = 'field';
      sec.innerHTML = '<div class="label">Guest list</div><div id="ffp-ev-roster-body" style="font-size:13px;color:#9fb4c4;padding:4px 0;">Loading…</div>';
      (document.getElementById('ev-step2') || modalBody).appendChild(sec);
      try {
        var res = await window.supabase.rpc('provider_event_roster', { p_me: meId, p_event: editingId });
        var rows = (res && res.data) || [];
        var body = document.getElementById('ffp-ev-roster-body'); if (!body) return;
        if (!rows.length) {
          body.innerHTML = 'No RSVPs yet. When members RSVP, their FFP Passport appears here — they check in with it at the venue on the day.';
          return;
        }
        var inCount = rows.filter(function (r) { return r.checked_in; }).length;
        body.innerHTML = '<div style="margin-bottom:8px;font-weight:700;color:#cfe0ee;">' + rows.length + ' going · ' + inCount + ' checked in</div>' + rows.map(function (p) {
          var nm = p.full_name || ((p.given_names || '') + ' ' + (p.surname || '')).trim() || 'Member';
          var av = p.photo_url
            ? '<span style="width:36px;height:36px;border-radius:50%;flex-shrink:0;background:#ffffff url(\'' + p.photo_url + '\') center/cover;"></span>'
            : '<span style="width:36px;height:36px;border-radius:50%;flex-shrink:0;background:#13324a;color:#cfe0ee;display:flex;align-items:center;justify-content:center;font-weight:800;">' + esc(nm.charAt(0).toUpperCase()) + '</span>';
          var badge = p.checked_in
            ? '<span style="background:#16a34a;color:#fff;font-size:11px;font-weight:700;border-radius:6px;padding:3px 9px;flex-shrink:0;">Checked in</span>'
            : '<span style="background:rgba(25,128,173,0.12);color:#1980AD;font-size:11px;font-weight:700;border-radius:6px;padding:3px 9px;flex-shrink:0;">Going</span>';
          var loc = [p.city, p.country].filter(Boolean).join(', ');
          return '<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.07);">' + av +
            '<div style="flex:1;min-width:0;"><div style="font-size:14px;font-weight:600;color:#0e2531;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(nm) + '</div>' +
            (loc ? '<div style="font-size:11px;color:#566069;">' + esc(loc) + '</div>' : '') + '</div>' + badge + '</div>';
        }).join('');
      } catch (e) {
        var b = document.getElementById('ffp-ev-roster-body'); if (b) b.innerHTML = 'Could not load the guest list.';
      }
    }

    // Wrap openEventModal to swap category → activity picker + remove who_for + show re-approval note
    var origOpenEventModal = window.openEventModal;
    window.openEventModal = function (id) {
      try { origOpenEventModal(id); } catch (e) { console.error('[FFP Provider Events] orig modal:', e); }
      setTimeout(function () {
        patchModalAfterOpen(id);
        showReapprovalNoteIfNeeded(id);
        try { injectEventRoster(id); } catch (e) { console.error('[FFP Provider Events] roster:', e); }
      }, 50);
    };

    window.saveEvent = realSaveEvent;
    window.confirmDeleteEvent = realDeleteEvent;
    window.FFPReload = window.FFPReload || {};
    window.FFPReload.event = refresh;   // used by the dashboard Duplicate flow
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
