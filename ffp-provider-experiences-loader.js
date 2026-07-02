/* FFP Provider Experiences Loader (TRIPS) — v7 (TAXONOMY: removed the dead, corrupted hardcoded FFP_CITIES
   list — country/city now come ONLY from the shared taxonomy window.FFP_TAX.cities via the searchable pickers.
   "Fitness level required" now reads window.FFP_TAX.attendeeLevels — Not Tried/Social/Competitive/
   Representative/Professional, plus "All Levels" — the SAME connected scale as a member's own ability.)
   v6 (GYG parity: + Highlights, + "Good to know" section: Languages,
   Min age, Not allowed, Meeting point + map coords, Wheelchair accessible + notes, Free-cancellation hours + policy.
   Saved via provider_save_listing kind='experience'. v5 (adds Currency selector + Deposit field; country/city via shared FFP_TAX.cities; create/edit via provider_save_listing RPC)
   close edit modal after delete
/*  Provider Experiences Loader — v3
   v3 changes (Grant's feedback):
   - Added "Experience type" field back with 6 clear, distinct options:
     Training camp / Competition trip / Spectator trip / Wellness retreat /
     Adventure trip / Active getaway. Helper text clarifies the choice.
     Saved to existing exp_type column.
   - Picker functions exposed as window.FFPPicker for events/deals loaders to reuse.

   v2: Activity picker + Country/City dropdowns + textareas + removed Format field.
   v1: Initial wiring.
*/
(function () {
  'use strict';

  // Cities/countries come ONLY from the shared taxonomy (window.FFP_TAX.cities,
  // assets/ffp-taxonomy.js — DB-hydrated, admin-managed). The old hardcoded
  // FFP_CITIES list (541 cities, and corrupted with stray doc text) was removed
  // in v7 — every form reads the one taxonomy source via the shared pickers.

  // Fallback only — the canonical list is window.FFP_TAX.attendeeLevels (the 5 levels + "All Levels"
  // for the "who can attend?" question). Kept identical here so the dropdown is never empty pre-hydration.
  var FITNESS_LEVELS = ['All Levels', 'Not Tried', 'Social', 'Competitive', 'Representative', 'Professional'];

  // Six clear experience types — replaces the old vague "Format" field
  var EXPERIENCE_TYPES = [
    'Training camp',
    'Competition trip',
    'Spectator trip',
    'Wellness retreat',
    'Adventure trip',
    'Active getaway'
  ];

  // Cache for activity_types fetched once per session
  window.FFP_ACTIVITIES_CACHE = window.FFP_ACTIVITIES_CACHE || null;

  // ════════════════════════════════════════════════════════════════════════
  // Utilities
  // ════════════════════════════════════════════════════════════════════════
  function toast(msg, kind) {
    if (typeof window.showToast === 'function') {
      try { window.showToast(msg, kind || 'info'); return; } catch (e) {}
    }
    console.log('[FFP Provider Experiences]', msg);
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
  function arrFromText(s) {
    if (!s) return [];
    return String(s).split('\n').map(function (x) { return x.trim(); }).filter(function (x) { return x.length > 0; });
  }
  function textFromArr(a) {
    if (!a || !a.length) return null;
    return a.filter(function (x) { return x && String(x).trim(); }).join('\n') || null;
  }

  // ════════════════════════════════════════════════════════════════════════
  // CSS injection
  // ════════════════════════════════════════════════════════════════════════
  function injectStyles() {
    if (document.getElementById('ffp-provider-experiences-css')) return;
    var css = document.createElement('style');
    css.id = 'ffp-provider-experiences-css';
    css.textContent = [
      // FFP rule: no native scrollbars
      '*::-webkit-scrollbar{display:none !important;width:0 !important;height:0 !important;}',
      '*{-ms-overflow-style:none !important;scrollbar-width:none !important;}',
      '#panel-experiences{overflow-x:hidden;}',

      // Native select styling — thin chevron (FFP brand)
      'select.select, select.input, .modal select, .modal-body select {' +
        'appearance:none;-webkit-appearance:none;-moz-appearance:none;' +
        'background-image:url("data:image/svg+xml;charset=UTF-8,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%238a99a8\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'%3E%3Cpolyline points=\'6 9 12 15 18 9\'%3E%3C/polyline%3E%3C/svg%3E");' +
        'background-repeat:no-repeat;background-position:right 12px center;background-size:16px;' +
        'padding-right:36px;color-scheme:light;}',
      '.modal select option{background:#ffffff !important;color:#0e2531 !important;}',
      'input.input[type="date"]{color-scheme:light;}',

      // Picker button (replaces the native select inside the experience modal)
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
      '.ffp-picker-btn .picked .group{color:#566069;font-size:11px;}',
      '.ffp-picker-btn[disabled]{opacity:0.5;cursor:not-allowed;}',

      // Picker overlay (sits ABOVE the experience modal)
      '.ffp-picker-overlay{' +
        'position:fixed;inset:0;background:rgba(0,8,20,0.75);z-index:100000;' +
        'display:flex;align-items:center;justify-content:center;padding:20px;' +
        'opacity:0;transition:opacity 150ms ease;}',
      '.ffp-picker-overlay.open{opacity:1;}',
      '.ffp-picker-modal{' +
        'background:#ffffff;border:1px solid #d8dde2;border-radius:16px;' +
        'width:100%;max-width:520px;max-height:80vh;display:flex;flex-direction:column;' +
        'box-shadow:0 20px 60px rgba(0,0,0,0.5);overflow:hidden;}',
      '.ffp-picker-header{display:flex;align-items:center;justify-content:space-between;padding:18px 20px;border-bottom:1px solid #d8dde2;}',
      '.ffp-picker-title{color:#0e2531;font-size:16px;font-weight:600;}',
      '.ffp-picker-close{background:transparent;border:none;color:#566069;cursor:pointer;font-size:24px;line-height:1;padding:0 4px;}',
      '.ffp-picker-close:hover{color:#0e2531;}',
      '.ffp-picker-search{padding:14px 20px;border-bottom:1px solid #d8dde2;}',
      '.ffp-picker-search input{' +
        'width:100%;background:#ffffff;border:1px solid #d8dde2;border-radius:10px;' +
        'padding:10px 14px;color:#0e2531;font-size:14px;font-family:inherit;outline:none;}',
      '.ffp-picker-search input:focus{border-color:#1980AD;}',
      '.ffp-picker-list{flex:1;overflow-y:auto;padding:8px 0;}',
      '.ffp-picker-group-hdr{padding:10px 20px 6px;color:#566069;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;}',
      '.ffp-picker-item{padding:11px 20px;color:#0e2531;font-size:14px;cursor:pointer;}',
      '.ffp-picker-item:hover{background:rgba(25,128,173,0.08);}',
      '.ffp-picker-item.selected{background:rgba(25,128,173,0.15);color:#1980AD;font-weight:500;}',
      '.ffp-picker-empty{padding:30px 20px;text-align:center;color:#8a96a1;font-size:14px;}'
    ].join('');
    document.head.appendChild(css);
  }

  // ════════════════════════════════════════════════════════════════════════
  // Fetch + cache activity_types
  // ════════════════════════════════════════════════════════════════════════
  async function getActivities() {
    if (window.FFP_ACTIVITIES_CACHE && window.FFP_ACTIVITIES_CACHE.length) {
      return window.FFP_ACTIVITIES_CACHE;
    }
    var res = await window.supabase
      .from('activity_types')
      .select('slug, name, category')
      .eq('active', true)
      .order('sort_order');
    if (res.error) {
      console.error('[FFP Experiences] fetch activities:', res.error);
      toast('Could not load activities', 'error');
      return [];
    }
    window.FFP_ACTIVITIES_CACHE = res.data || [];
    return window.FFP_ACTIVITIES_CACHE;
  }

  // ════════════════════════════════════════════════════════════════════════
  // Generic picker overlay — used for activities, countries, cities
  // ════════════════════════════════════════════════════════════════════════
  function openPicker(opts) {
    // opts: { title, items: [{name, label?, group?}], currentValue, placeholder, onSelect, groupBy }
    closePicker();
    var overlay = document.createElement('div');
    overlay.className = 'ffp-picker-overlay';
    overlay.id = 'ffp-picker-overlay';
    overlay.innerHTML =
      '<div class="ffp-picker-modal">' +
        '<div class="ffp-picker-header">' +
          '<div class="ffp-picker-title">' + escHtml(opts.title || 'Choose') + '</div>' +
          '<button type="button" class="ffp-picker-close" id="ffp-picker-close">&times;</button>' +
        '</div>' +
        '<div class="ffp-picker-search">' +
          '<input type="text" id="ffp-picker-search-input" placeholder="' + escHtml(opts.placeholder || 'Search…') + '" autocomplete="off">' +
        '</div>' +
        '<div class="ffp-picker-list" id="ffp-picker-list"></div>' +
      '</div>';
    document.body.appendChild(overlay);
    requestAnimationFrame(function () { overlay.classList.add('open'); });

    var input = document.getElementById('ffp-picker-search-input');
    var listEl = document.getElementById('ffp-picker-list');

    function renderList(filter) {
      var f = (filter || '').trim().toLowerCase();
      var items = opts.items || [];
      var matches = items.filter(function (it) {
        if (!f) return true;
        return (it.name || '').toLowerCase().indexOf(f) >= 0 ||
               (it.group || '').toLowerCase().indexOf(f) >= 0;
      });
      if (!matches.length) {
        listEl.innerHTML = '<div class="ffp-picker-empty">No matches</div>';
        return;
      }
      if (opts.groupBy) {
        // Group items
        var groups = {};
        var groupOrder = [];
        matches.forEach(function (it) {
          var g = it.group || 'Other';
          if (!groups[g]) { groups[g] = []; groupOrder.push(g); }
          groups[g].push(it);
        });
        var html = '';
        groupOrder.forEach(function (g) {
          html += '<div class="ffp-picker-group-hdr">' + escHtml(g) + '</div>';
          groups[g].forEach(function (it) {
            var sel = (it.name === opts.currentValue) ? ' selected' : '';
            html += '<div class="ffp-picker-item' + sel + '" data-value="' + escHtml(it.name) + '" data-group="' + escHtml(it.group || '') + '">' + escHtml(it.name) + '</div>';
          });
        });
        listEl.innerHTML = html;
      } else {
        var html2 = '';
        matches.forEach(function (it) {
          var sel = (it.name === opts.currentValue) ? ' selected' : '';
          html2 += '<div class="ffp-picker-item' + sel + '" data-value="' + escHtml(it.name) + '">' + escHtml(it.name) + '</div>';
        });
        listEl.innerHTML = html2;
      }
    }
    renderList('');

    input.addEventListener('input', function () { renderList(input.value); });
    input.focus();

    listEl.addEventListener('click', function (e) {
      var item = e.target.closest('.ffp-picker-item');
      if (!item) return;
      var value = item.dataset.value;
      var group = item.dataset.group || '';
      closePicker();
      if (opts.onSelect) opts.onSelect(value, group);
    });

    document.getElementById('ffp-picker-close').addEventListener('click', closePicker);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closePicker();
    });
    document.addEventListener('keydown', escClosePicker);
  }
  function escClosePicker(e) {
    if (e.key === 'Escape') closePicker();
  }
  function closePicker() {
    var ov = document.getElementById('ffp-picker-overlay');
    if (ov) ov.remove();
    document.removeEventListener('keydown', escClosePicker);
  }

  // Open activity picker
  async function openActivityPicker(currentValue, onSelect) {
    var activities = await getActivities();
    var items = activities.map(function (a) {
      return { name: a.name, group: a.category, slug: a.slug };
    });
    openPicker({
      title: 'Choose activity',
      placeholder: 'Search 379 activities…',
      items: items,
      currentValue: currentValue,
      groupBy: 'category',
      onSelect: onSelect
    });
  }

  // Open country picker
  function openCountryPicker(currentValue, onSelect) {
    var CITIES = (window.FFP_TAX && window.FFP_TAX.cities) || {};
    var items = Object.keys(CITIES).sort().map(function (c) { return { name: c }; });
    openPicker({
      title: 'Choose country',
      placeholder: 'Search countries…',
      items: items,
      currentValue: currentValue,
      onSelect: onSelect
    });
  }

  // Open city picker for a given country
  function openCityPicker(country, currentValue, onSelect) {
    var CITIES = (window.FFP_TAX && window.FFP_TAX.cities) || {};
    if (!country || !CITIES[country]) {
      toast('Choose a country first', 'info');
      return;
    }
    var items = CITIES[country].map(function (c) { return { name: c }; });
    openPicker({
      title: 'Choose city in ' + country,
      placeholder: 'Search cities…',
      items: items,
      currentValue: currentValue,
      onSelect: onSelect
    });
  }

  // ════════════════════════════════════════════════════════════════════════
  // DB ↔ UI mapping
  // ════════════════════════════════════════════════════════════════════════
  function mapForUi(row) {
    return {
      id: row.id,
      title: row.title || '',
      description: row.description || '',
      overview: row.overview || '',
      activity: row.activity || '',
      category: row.category || '',
      experience_type: row.exp_type || '',
      start_date: (window.FFPTime ? window.FFPTime.toDateInput(row.starts_at) : (row.starts_at || '')),
      end_date: (window.FFPTime ? window.FFPTime.toDateInput(row.ends_at) : (row.ends_at || '')),
      duration_days: row.duration_days || 0,
      country: row.country || '',
      destination: row.destination || '',
      price_aed: row.price_aed || '',
      pay_requirement: row.pay_requirement || 'required',
      currency: row.currency || 'AED',
      deposit: (row.deposit != null ? row.deposit : ''),
      price_includes: arrFromText(row.what_included),
      price_excludes: arrFromText(row.what_not_included),
      accommodation: row.accommodation || '',
      flights: row.flights_info || '',
      travel_reqs: row.travel_reqs || '',
      fitness_reqs: row.fitness_reqs || '',
      fitness_level: row.fitness_level || 'All Levels',
      itinerary: Array.isArray(row.itinerary) ? row.itinerary : [],
      highlights: Array.isArray(row.highlights) ? row.highlights : [],
      not_allowed: Array.isArray(row.not_allowed) ? row.not_allowed : [],
      languages: Array.isArray(row.languages) ? row.languages : [],
      min_age: (row.min_age != null ? row.min_age : ''),
      meeting_point: row.meeting_point || '',
      meeting_lat: (row.meeting_lat != null ? row.meeting_lat : ''),
      meeting_lng: (row.meeting_lng != null ? row.meeting_lng : ''),
      wheelchair_accessible: (row.wheelchair_accessible == null ? null : !!row.wheelchair_accessible),
      accessibility_notes: row.accessibility_notes || '',
      free_cancellation_hours: (row.free_cancellation_hours != null ? row.free_cancellation_hours : ''),
      cancellation_policy: row.cancellation_policy || '',
      hero_url: row.hero_image_url || null,
      gallery: Array.isArray(row.gallery) ? row.gallery : [],
      status: row.status || 'pending',
      verified: row.status === 'live',
      featured: !!row.featured,
      applications: 0,
      capacity: row.capacity || 0,
      created_at: row.created_at ? row.created_at.slice(0, 10) : '',
      _raw: row
    };
  }

  async function fetchExperiences() {
    if (!window.FFP_PROVIDER || !window.FFP_PROVIDER.id) return [];
    var res = await window.supabase
      .from('trips')
      .select('id, provider_id, title, description, overview, exp_type, activity, category, hero_image_url, gallery, destination, country, starts_at, ends_at, duration_days, price_aed, currency, deposit, what_not_included, what_included, itinerary, accommodation, flights_info, travel_reqs, fitness_reqs, fitness_level, capacity, status, featured, highlights, not_allowed, languages, min_age, meeting_point, meeting_lat, meeting_lng, wheelchair_accessible, accessibility_notes, free_cancellation_hours, cancellation_policy, pay_requirement, created_at, updated_at')
      .eq('provider_id', window.FFP_PROVIDER.id)
      .order('starts_at', { ascending: true });
    if (res.error) {
      console.error('[FFP Experiences] fetch:', res.error);
      toast('Could not load experiences', 'error');
      return [];
    }
    return (res.data || []).map(mapForUi);
  }

  async function refresh() {
    if (typeof experiences === 'undefined') return;
    var rows = await fetchExperiences();
    experiences.length = 0;
    rows.forEach(function (r) { experiences.push(r); });
    if (typeof window.renderExperiences === 'function') { try { window.renderExperiences(); } catch (e) {} }
    if (typeof window.renderNav === 'function')         { try { window.renderNav();         } catch (e) {} }
  }

  // ════════════════════════════════════════════════════════════════════════
  // Picker button helpers — update DOM state
  // ════════════════════════════════════════════════════════════════════════
  function setActivityBtn(activityName, category) {
    var btn = document.getElementById('xm-activity-btn');
    if (!btn) return;
    btn.dataset.value = activityName || '';
    btn.dataset.category = category || '';
    if (activityName) {
      btn.classList.remove('placeholder');
      btn.innerHTML =
        '<div class="picked"><div class="name">' + escHtml(activityName) + '</div>' +
        (category ? '<div class="group">' + escHtml(category) + '</div>' : '') +
        '</div>' +
        '<span class="ms caret">expand_more</span>';
    } else {
      btn.classList.add('placeholder');
      btn.innerHTML = '<span>Choose activity…</span><span class="ms caret">expand_more</span>';
    }
  }
  function setCountryBtn(country) {
    var btn = document.getElementById('xm-country-btn');
    if (!btn) return;
    btn.dataset.value = country || '';
    if (country) {
      btn.classList.remove('placeholder');
      btn.innerHTML = '<span>' + escHtml(country) + '</span><span class="ms caret">expand_more</span>';
    } else {
      btn.classList.add('placeholder');
      btn.innerHTML = '<span>Choose country…</span><span class="ms caret">expand_more</span>';
    }
    // Reset city when country changes
    var cityBtn = document.getElementById('xm-city-btn');
    if (cityBtn && cityBtn.dataset.country !== country) {
      cityBtn.dataset.country = country || '';
      setCityBtn('');
    }
  }
  function setCityBtn(city) {
    var btn = document.getElementById('xm-city-btn');
    if (!btn) return;
    btn.dataset.value = city || '';
    if (city) {
      btn.classList.remove('placeholder');
      btn.innerHTML = '<span>' + escHtml(city) + '</span><span class="ms caret">expand_more</span>';
    } else {
      btn.classList.add('placeholder');
      btn.innerHTML = '<span>Choose city…</span><span class="ms caret">expand_more</span>';
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // Modal — overrides openExperienceModal
  // ════════════════════════════════════════════════════════════════════════
  function realOpenExperienceModal(id) {
    var editing = id ? experiences.find(function (x) { return x.id === id; }) : null;
    var e = editing || {
      title: '', description: '', overview: '',
      activity: '', category: '',
      start_date: '', end_date: '',
      country: '', destination: '', price_aed: '', pay_requirement: 'required', currency: 'AED', deposit: '',
      price_includes: [], price_excludes: [],
      accommodation: '', flights: '', travel_reqs: '',
      fitness_reqs: '', fitness_level: 'All Levels',
      itinerary: [], hero_url: null, capacity: '', status: '',
      highlights: [], not_allowed: [], languages: [], min_age: '',
      meeting_point: '', meeting_lat: '', meeting_lng: '',
      wheelchair_accessible: null, accessibility_notes: '',
      free_cancellation_hours: '', cancellation_policy: ''
    };
    window.modalItinerary = JSON.parse(JSON.stringify(e.itinerary || []));

    var body =
      '<div id="tr-stepbar" style="font-size:11px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;color:var(--ffp-purple,#8b5cf6);margin:0 0 12px;">Step 1 of 2 · Trip details</div>' +
      '<div id="tr-step1">' +
      '<div class="form-section">' +
        '<div class="form-section-title">Photos <span class="label-hint" style="text-transform:none;letter-spacing:0;font-weight:600;">— drag to reorder; the first photo is the cover shown on the card</span></div>' +
        '<div id="xm-gallery"></div>' +
        '<button type="button" class="btn btn-ghost btn-sm" style="margin-top:10px;" onclick="FFPGallery.add(\'xm-gallery\')"><span class="ms">add_photo_alternate</span> Add photo</button>' +
      '</div>' +
      '<div class="form-section">' +
        '<div class="form-section-title">Overview</div>' +
        '<div class="form-grid">' +
          '<div class="field full">' +
            '<div class="label">Title <span class="req">*</span></div>' +
            '<input class="input" id="xm-title" value="' + escHtml(e.title) + '" placeholder="e.g. Hatta Mountain Endurance Camp">' +
          '</div>' +
          '<div class="field full">' +
            '<div class="label">Short description</div>' +
            '<input class="input" id="xm-description" value="' + escHtml(e.description) + '" placeholder="One-sentence summary">' +
          '</div>' +
          '<div class="field full">' +
            '<div class="label">Overview</div>' +
            '<textarea class="textarea" id="xm-overview" rows="4" placeholder="The full story — what makes this experience unique">' + escHtml(e.overview) + '</textarea>' +
          '</div>' +
          '<div class="field full">' +
            '<div class="label">Highlights <span class="label-hint">— short selling points, one per line</span></div>' +
            '<textarea class="textarea" id="xm-highlights" rows="4" placeholder="Summit sunrise with a certified guide\nAll trail snacks &amp; transport included\nSmall group — max 12">' + escHtml((e.highlights || []).join('\n')) + '</textarea>' +
          '</div>' +
          '<div class="field">' +
            '<div class="label">Activity <span class="req">*</span> <span class="label-hint">— what is it?</span></div>' +
            '<button type="button" class="ffp-picker-btn placeholder" id="xm-activity-btn" data-value="" data-category="">' +
              '<span>Choose activity…</span><span class="ms caret">expand_more</span>' +
            '</button>' +
          '</div>' +
          '<div class="field">' +
            '<div class="label">Experience type <span class="req">*</span> <span class="label-hint">— what kind of trip?</span></div>' +
            '<select class="select" id="xm-exp-type">' +
              '<option value="">Choose type…</option>' +
              ((window.FFP_TAX && window.FFP_TAX.experienceTypes && window.FFP_TAX.experienceTypes.length) ? window.FFP_TAX.experienceTypes : EXPERIENCE_TYPES).map(function (t) {
                return '<option value="' + escHtml(t) + '"' + (e.experience_type === t ? ' selected' : '') + '>' + escHtml(t) + '</option>';
              }).join('') +
            '</select>' +
          '</div>' +
          '<div class="field">' +
            '<div class="label">Fitness level <span class="label-hint">— optional</span></div>' +
            '<select class="select" id="xm-fitness-level">' +
              ((window.FFP_TAX && window.FFP_TAX.attendeeLevels && window.FFP_TAX.attendeeLevels.length) ? window.FFP_TAX.attendeeLevels : FITNESS_LEVELS).map(function (l) {
                return '<option value="' + escHtml(l) + '"' + (e.fitness_level === l ? ' selected' : '') + '>' + escHtml(l) + '</option>';
              }).join('') +
            '</select>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="form-section">' +
        '<div class="form-section-title">When &amp; where</div>' +
        '<div class="form-grid">' +
          '<div class="field"><div class="label">Start date <span class="req">*</span></div>' +
            '<input class="input" type="date" id="xm-start" value="' + escHtml(e.start_date) + '"></div>' +
          '<div class="field"><div class="label">End date <span class="req">*</span></div>' +
            '<input class="input" type="date" id="xm-end" value="' + escHtml(e.end_date) + '"></div>' +
          '<div class="field"><div class="label">Country <span class="req">*</span></div>' +
            '<button type="button" class="ffp-picker-btn placeholder" id="xm-country-btn" data-value="">' +
              '<span>Choose country…</span><span class="ms caret">expand_more</span>' +
            '</button></div>' +
          '<div class="field"><div class="label">City</div>' +
            '<button type="button" class="ffp-picker-btn placeholder" id="xm-city-btn" data-value="" data-country="">' +
              '<span>Choose city…</span><span class="ms caret">expand_more</span>' +
            '</button></div>' +
          '<div class="field full"><div class="label">Location pin <span class="label-hint">— paste a Google Maps link; we’ll set the pin so members get directions</span></div>' +
            '<div style="display:flex;gap:8px;align-items:center;">' +
              '<input class="input" id="xm-maps-url" placeholder="Paste your Google Maps link (any format)" style="flex:1;min-width:0;">' +
              '<button type="button" class="btn btn-ghost" style="flex:0 0 auto;" onclick="resolveTripMapsLink()"><span class="ms" style="font-size:16px;vertical-align:-3px;">place</span> Find pin</button>' +
            '</div>' +
            '<span id="xm-loc-status" class="psub" style="display:block;margin-top:6px;">' + ((e.meeting_lat !== '' && e.meeting_lng !== '' && e.meeting_lat != null && e.meeting_lng != null) ? ('✓ Pin set (' + Number(e.meeting_lat).toFixed(5) + ', ' + Number(e.meeting_lng).toFixed(5) + ')') : 'No pin set') + '</span>' +
            '<input type="hidden" id="xm-lat" value="' + escHtml((e.meeting_lat != null && e.meeting_lat !== '') ? e.meeting_lat : '') + '">' +
            '<input type="hidden" id="xm-lng" value="' + escHtml((e.meeting_lng != null && e.meeting_lng !== '') ? e.meeting_lng : '') + '">' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="form-section">' +
        '<div class="form-section-title">Price</div>' +
        '<div class="form-grid">' +
          '<div class="field"><div class="label">Currency <span class="req">*</span></div>' +
            '<select class="select" id="xm-currency">' +
              (window.FFPCurrency ? FFPCurrency.optionsHtml(e.currency || (window.FFP_PROVIDER && FFP_PROVIDER.currency) || 'AED') : ['AED','USD','EUR','GBP','AUD','SAR','INR','CAD'].map(function(cur){ return '<option' + (((e.currency||'AED')===cur)?' selected':'') + '>' + cur + '</option>'; }).join('')) +
            '</select></div>' +
          '<div class="field"><div class="label">Price per person <span class="req">*</span></div>' +
            '<input class="input" type="number" id="xm-price" value="' + escHtml(e.price_aed) + '" placeholder="e.g. 1850"></div>' +
          '<div class="field"><div class="label">Deposit <span class="label-hint">— to secure a spot</span></div>' +
            '<input class="input" type="number" id="xm-deposit" value="' + escHtml(e.deposit || '') + '" placeholder="e.g. 500"></div>' +
          '<div class="field full"><label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer;background:rgba(10,62,68,0.05);border:1px solid var(--ffp-border-mid,#dbe3ea);border-radius:10px;padding:11px 13px;">' +
            '<input type="checkbox" id="xm-allow-unpaid"' + (e.pay_requirement === 'optional' ? ' checked' : '') + ' style="width:18px;height:18px;margin-top:1px;flex:0 0 auto;cursor:pointer;">' +
            '<span style="font-size:12px;color:var(--ffp-text,#0e2531);font-weight:700;">Allow booking without upfront payment <span style="display:block;font-weight:500;color:var(--ffp-text-dim,#6c7f90);margin-top:2px;">By default a paid Trip must be paid for before it’s confirmed. Tick this to let members book and settle with you directly.</span></span>' +
          '</label></div>' +
          '<div class="field"><div class="label">Capacity</div>' +
            '<input class="input" type="number" id="xm-capacity" value="' + escHtml(e.capacity) + '" placeholder="e.g. 16"></div>' +
          '<div class="field full"><div class="label">What\'s included <span class="label-hint">— one per line</span></div>' +
            '<textarea class="textarea" id="xm-includes" rows="4" placeholder="Lodging (twin share)\nAll meals\nCoaching\nTransport from Dubai">' + escHtml((e.price_includes || []).join('\n')) + '</textarea></div>' +
          '<div class="field full"><div class="label">What\'s NOT included <span class="label-hint">— one per line</span></div>' +
            '<textarea class="textarea" id="xm-excludes" rows="3" placeholder="Personal gear\nTrail running shoes\nTravel insurance">' + escHtml((e.price_excludes || []).join('\n')) + '</textarea></div>' +
        '</div>' +
      '</div>' +
      '</div>' /* /tr-step1 */ +
      '<div id="tr-step2" style="display:none;">' +
      '<div class="form-section">' +
        '<div class="form-section-title">Itinerary</div>' +
        '<div class="itin-wrap" id="xm-itinerary"></div>' +
        '<button class="itin-add-day" type="button" onclick="addItinDay()"><span class="ms">add</span> Add a day</button>' +
      '</div>' +
      '<div class="form-section">' +
        '<div class="form-section-title">Practical info</div>' +
        '<div class="form-grid">' +
          '<div class="field full"><div class="label">Accommodation</div>' +
            '<textarea class="textarea" id="xm-accommodation" rows="2" placeholder="Where members stay, room type, amenities">' + escHtml(e.accommodation) + '</textarea></div>' +
          '<div class="field full"><div class="label">Flights / Transport</div>' +
            '<textarea class="textarea" id="xm-flights" rows="2" placeholder="Are flights included? Group transport? Self-arrival?">' + escHtml(e.flights) + '</textarea></div>' +
          '<div class="field full"><div class="label">Travel requirements</div>' +
            '<textarea class="textarea" id="xm-travel-reqs" rows="2" placeholder="Visas, vaccinations, insurance">' + escHtml(e.travel_reqs) + '</textarea></div>' +
          '<div class="field full"><div class="label">Fitness requirements</div>' +
            '<textarea class="textarea" id="xm-fitness-reqs" rows="2" placeholder="What members should be able to do before joining">' + escHtml(e.fitness_reqs) + '</textarea></div>' +
        '</div>' +
      '</div>' +
      '<div class="form-section">' +
        '<div class="form-section-title">Good to know</div>' +
        '<div class="form-grid">' +
          '<div class="field"><div class="label">Languages <span class="label-hint">— one per line</span></div>' +
            '<textarea class="textarea" id="xm-languages" rows="2" placeholder="English\nArabic">' + escHtml((e.languages || []).join('\n')) + '</textarea></div>' +
          '<div class="field"><div class="label">Minimum age</div>' +
            '<input class="input" type="number" id="xm-min-age" value="' + escHtml(e.min_age) + '" placeholder="e.g. 16"></div>' +
          '<div class="field full"><div class="label">Not allowed <span class="label-hint">— one per line</span></div>' +
            '<textarea class="textarea" id="xm-not-allowed" rows="2" placeholder="Pets (assistance dogs OK)\nOversized luggage">' + escHtml((e.not_allowed || []).join('\n')) + '</textarea></div>' +
          '<div class="field full"><div class="label">Meeting point <span class="label-hint">— where members assemble</span></div>' +
            '<input class="input" id="xm-meeting-point" value="' + escHtml(e.meeting_point) + '" placeholder="e.g. Hatta Dam car park, by the kiosk"></div>' +
          '<div class="field"><div class="label">Wheelchair accessible</div>' +
            '<select class="select" id="xm-wheelchair">' +
              '<option value="">—</option>' +
              '<option value="true"' + (e.wheelchair_accessible === true ? ' selected' : '') + '>Yes</option>' +
              '<option value="false"' + (e.wheelchair_accessible === false ? ' selected' : '') + '>No</option>' +
            '</select></div>' +
          '<div class="field full"><div class="label">Accessibility notes</div>' +
            '<input class="input" id="xm-accessibility" value="' + escHtml(e.accessibility_notes) + '" placeholder="e.g. Step-free access; accessible WC on site"></div>' +
          '<div class="field"><div class="label">Free cancellation <span class="label-hint">— hours before</span></div>' +
            '<input class="input" type="number" id="xm-cancel-hours" value="' + escHtml(e.free_cancellation_hours) + '" placeholder="e.g. 24"></div>' +
          '<div class="field full"><div class="label">Cancellation policy</div>' +
            '<input class="input" id="xm-cancel-policy" value="' + escHtml(e.cancellation_policy) + '" placeholder="e.g. Free cancellation up to 24h before; 50% after">' + '</div>' +
        '</div>' +
      '</div>' +
      '</div>' /* /tr-step2 */ +
      (editing && (e.status === 'live' || e.status === 'paused')
        ? ''
        : '');

    var foot =
      (editing ? '<button class="btn btn-ghost left tr-s2" style="display:none;" onclick="confirmDeleteExperience(\'' + editing.id + '\')"><span class="ms">delete</span> Delete</button>' : '') +
      '<button class="btn btn-ghost tr-s1" onclick="closeModal()">Cancel</button>' +
      '<button class="btn btn-ghost tr-s2" style="display:none;" onclick="trStep(1)"><span class="ms">chevron_left</span> Back</button>' +
      '<button class="btn btn-pri tr-s1" onclick="trStep(2)">Next: Itinerary &amp; details <span class="ms" style="font-size:16px;vertical-align:-3px;">chevron_right</span></button>' +
      '<button class="btn btn-pri tr-s2" style="display:none;" onclick="saveExperience(\'' + (editing ? editing.id : '') + '\')">' +
        (editing ? 'Save changes' : 'Submit for review') +
      '</button>';

    if (typeof window.openModalShell === 'function') {
      window.openModalShell('full', (editing ? 'Edit trip' : 'New trip'), body, foot);
      if (window.FFPGallery) window.FFPGallery.init('xm-gallery', (e.gallery && e.gallery.length) ? e.gallery : (e.hero_url ? [e.hero_url] : []));
      setTimeout(function () { if (window.FFPSelect) { var m = document.getElementById('modal'); if (m) window.FFPSelect.enhance(m); } }, 40);
    }
    if (typeof window.renderItinerary === 'function') {
      try { window.renderItinerary(); } catch (er) {}
    }

    // Wire up picker buttons
    setTimeout(function () {
      setActivityBtn(e.activity, e.category);
      setCountryBtn(e.country);
      var cityBtn = document.getElementById('xm-city-btn');
      if (cityBtn) cityBtn.dataset.country = e.country || '';
      setCityBtn(e.destination);

      var aBtn = document.getElementById('xm-activity-btn');
      if (aBtn) aBtn.addEventListener('click', function () {
        openActivityPicker(aBtn.dataset.value, function (name, cat) {
          setActivityBtn(name, cat);
        });
      });
      var coBtn = document.getElementById('xm-country-btn');
      if (coBtn) coBtn.addEventListener('click', function () {
        openCountryPicker(coBtn.dataset.value, function (name) {
          setCountryBtn(name);
        });
      });
      var ciBtn = document.getElementById('xm-city-btn');
      if (ciBtn) ciBtn.addEventListener('click', function () {
        var country = document.getElementById('xm-country-btn').dataset.value;
        openCityPicker(country, ciBtn.dataset.value, function (name) {
          setCityBtn(name);
        });
      });
    }, 50);
  }

  // ════════════════════════════════════════════════════════════════════════
  // Save
  // ════════════════════════════════════════════════════════════════════════
  function computeDurationDays(startDate, endDate) {
    if (!startDate || !endDate) return null;
    var s = new Date(startDate);
    var e = new Date(endDate);
    if (isNaN(s.getTime()) || isNaN(e.getTime())) return null;
    return Math.max(1, Math.round((e - s) / 86400000) + 1);
  }

  async function realSaveExperience(id) {
    if (!window.FFP_PROVIDER || !window.FFP_PROVIDER.id) { toast('Provider not loaded', 'error'); return; }
    var get = function (key) {
      var el = document.getElementById('xm-' + key);
      return el ? (el.value || '').trim() : '';
    };

    var title = get('title');
    var aBtn = document.getElementById('xm-activity-btn');
    var coBtn = document.getElementById('xm-country-btn');
    var ciBtn = document.getElementById('xm-city-btn');
    var activity = aBtn ? aBtn.dataset.value : '';
    var category = aBtn ? aBtn.dataset.category : '';
    var country  = coBtn ? coBtn.dataset.value : '';
    var city     = ciBtn ? ciBtn.dataset.value : '';
    var expType  = get('exp-type');
    var start = get('start');
    var end   = get('end');
    var price = get('price');

    if (!title)    { toast('Title is required', 'error'); return; }
    if (!activity) { toast('Activity is required', 'error'); return; }
    if (!expType)  { toast('Experience type is required', 'error'); return; }
    if (!country)  { toast('Country is required', 'error'); return; }
    if (!start)    { toast('Start date is required', 'error'); return; }
    if (!end)      { toast('End date is required', 'error'); return; }
    if (!price)    { toast('Price is required', 'error'); return; }

    var _pics = (window.FFPGallery ? window.FFPGallery.get('xm-gallery') : []);
    var heroUrl = (_pics && _pics.length) ? _pics[0] : null;

    var capRaw = get('capacity');
    var capacity = capRaw ? parseInt(capRaw, 10) : null;
    if (capacity != null && isNaN(capacity)) capacity = null;

    var priceNum = parseFloat(price);
    if (isNaN(priceNum)) priceNum = null;
    var currency = get('currency') || 'AED';
    var depositRaw = get('deposit');
    var depositNum = depositRaw ? parseFloat(depositRaw) : null;
    if (depositNum != null && isNaN(depositNum)) depositNum = null;

    // meeting-point coordinates — resolved pin (Find pin) first, fall back to any legacy "lat, lng" paste
    var mLat = null, mLng = null;
    var latEl = document.getElementById('xm-lat'), lngEl = document.getElementById('xm-lng');
    var latV = latEl ? (latEl.value || '').trim() : '', lngV = lngEl ? (lngEl.value || '').trim() : '';
    if (latV && lngV) {
      var la0 = parseFloat(latV), lo0 = parseFloat(lngV);
      if (!isNaN(la0)) mLat = la0;
      if (!isNaN(lo0)) mLng = lo0;
    } else {
      var llRaw = get('latlng');
      if (llRaw) {
        var llp = llRaw.split(',');
        if (llp.length >= 2) {
          var la = parseFloat(llp[0]), lo = parseFloat(llp[1]);
          if (!isNaN(la)) mLat = la;
          if (!isNaN(lo)) mLng = lo;
        }
      }
    }
    var minAgeRaw = get('min-age');
    var cancelHrsRaw = get('cancel-hours');
    var wheel = get('wheelchair');

    var payload = {
      title:           title,
      description:     get('description') || null,
      overview:        get('overview') || null,
      activity:        activity,
      category:        category || null,
      exp_type:        expType,
      pay_requirement: (document.getElementById('xm-allow-unpaid') && document.getElementById('xm-allow-unpaid').checked) ? 'optional' : 'required',
      fitness_level:   get('fitness-level') || null,
      // Store local midnight of the facility timezone (shared FFPTime) as UTC, so dates round-trip correctly.
      starts_at:       (window.FFPTime ? window.FFPTime.toUTC(start) : start),
      ends_at:         (window.FFPTime ? window.FFPTime.toUTC(end) : end),
      duration_days:   computeDurationDays(start, end),
      country:         country,
      destination:     city || null,
      price_aed:       priceNum,
      currency:        currency,
      deposit:         depositNum,
      capacity:        capacity,
      what_included:     textFromArr(arrFromText(get('includes'))),
      what_not_included: textFromArr(arrFromText(get('excludes'))),
      accommodation:   get('accommodation') || null,
      flights_info:    get('flights') || null,
      travel_reqs:     get('travel-reqs') || null,
      fitness_reqs:    get('fitness-reqs') || null,
      itinerary:       Array.isArray(window.modalItinerary) ? window.modalItinerary : [],
      highlights:      arrFromText(get('highlights')),
      languages:       arrFromText(get('languages')),
      not_allowed:     arrFromText(get('not-allowed')),
      meeting_point:   get('meeting-point') || null,
      meeting_lat:     mLat,
      meeting_lng:     mLng,
      min_age:         minAgeRaw ? parseInt(minAgeRaw, 10) : null,
      wheelchair_accessible: (wheel === '' ? null : wheel === 'true'),
      accessibility_notes:   get('accessibility') || null,
      free_cancellation_hours: cancelHrsRaw ? parseInt(cancelHrsRaw, 10) : null,
      cancellation_policy:     get('cancel-policy') || null,
      hero_image_url:  heroUrl,
      gallery: (window.FFPGallery ? window.FFPGallery.get('xm-gallery') : [])
    };

    // Gate: a PAID Trip requires payment before confirmation → connect Stripe, or allow booking without upfront payment.
    var _xAllowUnpaid = !!(document.getElementById('xm-allow-unpaid') && document.getElementById('xm-allow-unpaid').checked);
    if (priceNum && priceNum > 0 && !_xAllowUnpaid && (window.FFP_PROVIDER || {}).payments_status !== 'connected') {
      toast('Paid Trip: connect Stripe in the Payments tab to take payment — or tick “Allow booking without upfront payment”. Members can’t book a paid Trip until one of these is set.', 'error');
      return;
    }

    var reapprovalNote = '';
    try {
      if (id) {
        // edit via SECURITY DEFINER RPC (auth.uid trap blocks direct .update). Keeps current status.
        var upd = await window.supabase.rpc('provider_save_listing', { p_kind: 'experience', p_provider: (window.FFP_PROVIDER || {}).id, p_id: id, p: payload });
        if (upd.error) throw upd.error;
        if (!upd.data) throw new Error('Update failed — not found or not permitted');
        toast('Experience updated', 'success');
        if (typeof window.closeModal === 'function') window.closeModal();
      } else {
        var ins = await window.supabase.rpc('provider_save_listing', { p_kind: 'experience', p_provider: (window.FFP_PROVIDER || {}).id, p_id: null, p: payload });
        if (ins.error) throw ins.error;
        if (!ins.data) throw new Error('Submit failed — please try again');
        if (typeof window.closeModal === 'function') window.closeModal();
        if (typeof window.showSubmittedModal === 'function') {
          try { window.showSubmittedModal('experience'); } catch (er) {}
        } else {
          toast('Submitted for review', 'success');
        }
      }
      await refresh();
    } catch (e) {
      console.error('[FFP Experiences] save:', e);
      var msg = e.message || 'Save failed';
      if (/policy|permission|denied|rls/i.test(msg)) msg = 'Save blocked by RLS';
      else if (/does not exist/i.test(msg))         msg = 'Schema mismatch — see console';
      toast(msg, 'error');
    }
  }

  async function realDeleteExperience(id) {
    if (!id) return;
    var doDelete = async function () {
      try {
        var res = await window.supabase.rpc('provider_delete_listing', { p_kind: 'experience', p_provider: (window.FFP_PROVIDER||{}).id, p_id: id });
        if (!res.error && res.data !== 'deleted') throw new Error('Delete failed — not found or not permitted');
        if (res.error) throw res.error;
        toast('Experience deleted', 'success');
        if (typeof window.closeModal === 'function') window.closeModal();
        await refresh();
      } catch (e) {
        console.error('[FFP Experiences] delete:', e);
        toast(e.message || 'Delete failed', 'error');
      }
    };
    if (typeof window.openConfirm === 'function') {
      window.openConfirm('Delete this experience?', 'Members who applied keep their record, but no new applications can be made.', doDelete);
    } else {
      if (confirm('Delete this experience?')) await doDelete();
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // Two-step wizard nav + functional map pin
  // ════════════════════════════════════════════════════════════════════════
  window.trStep = function (n) {
    var g = function (i) { var el = document.getElementById('xm-' + i); return el ? (el.value || '').trim() : ''; };
    if (n === 2) {
      var ab = document.getElementById('xm-activity-btn'); var activity = ab ? (ab.dataset.value || '') : '';
      var cob = document.getElementById('xm-country-btn'); var country = cob ? (cob.dataset.value || '') : '';
      if (!g('title'))    { toast('Title is required', 'error'); return; }
      if (!activity)      { toast('Activity is required', 'error'); return; }
      if (!g('exp-type')) { toast('Experience type is required', 'error'); return; }
      if (!country)       { toast('Country is required', 'error'); return; }
      if (!g('start'))    { toast('Start date is required', 'error'); return; }
      if (!g('end'))      { toast('End date is required', 'error'); return; }
      if (!g('price'))    { toast('Price is required', 'error'); return; }
    }
    var s1 = document.getElementById('tr-step1'), s2 = document.getElementById('tr-step2');
    if (s1) s1.style.display = n === 1 ? '' : 'none';
    if (s2) s2.style.display = n === 2 ? '' : 'none';
    Array.prototype.forEach.call(document.querySelectorAll('.tr-s1'), function (x) { x.style.display = n === 1 ? '' : 'none'; });
    Array.prototype.forEach.call(document.querySelectorAll('.tr-s2'), function (x) { x.style.display = n === 2 ? '' : 'none'; });
    var bar = document.getElementById('tr-stepbar'); if (bar) bar.textContent = n === 1 ? 'Step 1 of 2 · Trip details' : 'Step 2 of 2 · Itinerary & details';
    var mb = document.querySelector('.modal-body'); if (mb) mb.scrollTop = 0;
  };

  window.resolveTripMapsLink = async function () {
    var inp = document.getElementById('xm-maps-url'), st = document.getElementById('xm-loc-status');
    var url = inp ? (inp.value || '').trim() : '';
    if (!url) { if (st) st.textContent = 'Paste your Google Maps link first'; return; }
    if (st) st.textContent = 'Finding your pin…';
    try {
      var res = await fetch('https://ffp-passport-backend.vercel.app/api/geo/resolve?url=' + encodeURIComponent(url));
      var j = await res.json();
      if (!res.ok || j.lat == null) { if (st) st.textContent = (j && j.error) ? j.error : 'Couldn’t read a pin from that link'; return; }
      var la = document.getElementById('xm-lat'), ln = document.getElementById('xm-lng');
      if (la) la.value = j.lat; if (ln) ln.value = j.lng;
      if (st) st.textContent = '✓ Pin set (' + Number(j.lat).toFixed(5) + ', ' + Number(j.lng).toFixed(5) + ')';
    } catch (e) { console.error('[Trip] resolve maps link:', e); if (st) st.textContent = 'Couldn’t reach the resolver — try again'; }
  };

  // ════════════════════════════════════════════════════════════════════════
  // Init
  // ════════════════════════════════════════════════════════════════════════
  async function init() {
    var ok = await waitFor(function () {
      return window.supabase && window.supabase.auth &&
             typeof window.renderExperiences === 'function' &&
             typeof experiences !== 'undefined';
    }, 15000);
    if (!ok) { console.error('[FFP Experiences] dependencies never loaded'); return; }

    var authed = await waitFor(function () {
      return !!(window.FFP_PROVIDER && window.FFP_PROVIDER.id);
    }, 30000);
    if (!authed) { console.warn('[FFP Experiences] FFP_PROVIDER not set'); return; }

    injectStyles();

    // Pre-warm activities cache so first picker open is instant
    getActivities().catch(function () {});

    try {
      await refresh();
      console.log('[FFP Experiences] loaded v8 \u2014 2-step wizard + functional map pin \u2713');
    } catch (e) {
      console.error('[FFP Experiences] initial load:', e);
    }

    window.openExperienceModal     = realOpenExperienceModal;
    window.saveExperience          = realSaveExperience;
    window.confirmDeleteExperience = realDeleteExperience;
    window.FFPReload = window.FFPReload || {};
    window.FFPReload.experience = refresh;   // used by the dashboard Duplicate flow

    // Expose pickers for events/deals loaders to reuse
    window.FFPPicker = {
      openActivity: openActivityPicker,
      openCountry:  openCountryPicker,
      openCity:     openCityPicker,
      getActivities: getActivities
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
