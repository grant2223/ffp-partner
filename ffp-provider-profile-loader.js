/* FFP Provider Profile Loader — v25
   v25 (2026-08-21): "What we offer" editor — each added activity is now a row with a DESCRIPTION
       textarea (placeholder "Describe this…"), saved per-activity to providers.activity_descriptions
       via provider_set_activity_desc (debounced). Loaded from profile.activity_descriptions. Powers the
       described list on the public provider profile. Label renamed "Activities we offer"→"What we offer".
   v15 (2026-06-12): TIMEZONE picker — searchable IANA list (assets/ffp-time.js) wired as a dark picker
       (wrapSelectAsPicker now adds a search box when options exceed 12); loads/validates/saves
       providers.timezone via provider_save_profile; updates window.FFP_PROVIDER.timezone on save so
       FFPTime immediately governs all listing date/time.
   v14 (2026-06-12): COMPLETION SYNC — providerProfile.activities is now kept live as chips are added/removed
       (activity is a profile-completion essential) and the completion % + "listings hidden until profile
       complete" banner re-render immediately; also refreshes that banner once the profile data loads.
   v13 (2026-06-05): Passport-member discount field — load/map/save providers.passport_discount_pct
       (the % off this provider's Find Fit People bookings for paid Passport members; '' = platform
       default). Read by the booking site at checkout. Save via provider_save_profile RPC.
   v12 (2026-06-02): Activities input now uses OUR styled dropdown under the field (filtered list
       of the activity taxonomy + an "Add ‘x’" custom option), replacing the ugly native
       <datalist> that rendered a full-height list on the right of the screen. Click to add a chip;
       outside-click / Esc closes it. (Tab order/labels handled in the dashboard: Business Details
       · Activities · Branding.)
   v11 (2026-06-02): TABBED profile (Branding / Business info / Activities). The "Activities we
       offer" field now injects into the Activities tab (#pf-activities-host); the "Google Maps
       link" (venue location) stays in Business info, after Address. Falls back to the old
       after-Address layout if #pf-activities-host isn't present.
   v10 (2026-06-02): SAVE now goes through the provider_save_profile SECURITY DEFINER RPC
       (updates providers incl. activities/latitude/longitude/maps_url + replaces provider_hours
       in one call). Fixes the auth.uid() trap: the old direct providers.update silently wrote 0
       rows (activities never saved) and the provider_hours insert hard-failed RLS (42501). RPC is
       GRANTed to anon+authenticated and verified to persist hours + profile fields.
   v9 (2026-06-02): moved "Activities we offer" + "Google Maps link" UP into the Business-info
       section, inserted right after the Address field (under venue/area + provider type) and
       styled as native form fields — no longer a separate block dumped at the bottom.
   v8 (2026-06-02): "Venue location" is now a Google Maps LINK field — provider pastes their
       Maps link (any format), "Find pin" calls backend /api/geo/resolve to extract the pin
       (providers.latitude/longitude) + stores the link (providers.maps_url) for member Directions.
   v7 (2026-06-02): added "Activities we offer" (chips → providers.activities[]) + "Venue
       location" (current-location capture → providers.latitude/longitude) to the profile,
       injected into #panel-profile. These feed the member venue check-in (activity list +
       GPS on-site verification). Also fixed: country was read but missing from the select.
   v6: country + city use the shared FFPLocation cascade (assets/ffp-location-picker.js) —
       no longer wraps pf-city as its own searchable picker; loads/saves provider.country.
   v5: hide native scrollbar on the panel (content still scrolls).
*/
(function () {
  'use strict';

  var DAY_TO_INT = {
    'Sunday': 0, 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3,
    'Thursday': 4, 'Friday': 5, 'Saturday': 6
  };
  var INT_TO_DAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  // Refined option lists — businesses/organizations, not individuals
  var CATEGORIES = [
    'Fitness studio',
    'Wellness centre',
    'Padel club',
    'Pilates / Yoga',
    'Climbing',
    'Combat sports',
    'Recovery / Spa',
    'Performance lab',
    'Nutrition / Cafe',
    'Adventure / Outdoor',
    'Personal Training',
    'Retail',
    'Other'
  ];

  var UAE_CITIES = [
    'Dubai', 'Abu Dhabi', 'Sharjah', 'Ajman',
    'Ras Al Khaimah', 'Fujairah', 'Al Ain', 'Umm Al Quwain'
  ];

  function toast(msg, kind) {
    if (typeof window.showToast === 'function') {
      try { window.showToast(msg, kind || 'info'); return; } catch (e) {}
    }
    console.log('[FFP Provider Profile]', msg);
  }
  async function waitFor(check, ms) {
    var tries = 0; var limit = Math.ceil((ms || 15000) / 100);
    while (!check() && tries < limit) {
      await new Promise(function (r) { setTimeout(r, 100); });
      tries++;
    }
    return check();
  }
  function trimTime(t) { return t ? String(t).slice(0, 5) : ''; }
  function defaultHoursObj() {
    var h = {};
    INT_TO_DAY.forEach(function (day) { h[day] = { open: '', close: '', closed: false }; });
    return h;
  }
  function escText(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ─── Inject CSS fixes ───
  function injectStyles() {
    if (document.getElementById('ffp-provider-profile-css')) return;
    var css = document.createElement('style');
    css.id = 'ffp-provider-profile-css';
    css.textContent = [
      // Kill all native scrollbars on this page (FFP-wide rule)
      '*::-webkit-scrollbar{display:none !important;width:0 !important;height:0 !important;}',
      '*{-ms-overflow-style:none !important;scrollbar-width:none !important;}',

      // Kill horizontal overflow
      '#panel-profile{overflow-x:hidden;}',
      '#panel-profile .form-grid{max-width:100%;}',

      // Native dropdowns → dark (color-scheme + option background)
      '#panel-profile select, #panel-profile .select{color-scheme:light;}',
      '#panel-profile select option{background:#ffffff !important;color:#0e2531 !important;}',
      '#panel-profile select option:checked{background:#1980AD !important;color:#082335 !important;}',

      // Custom picker (replaces native select look entirely)
      '.ffp-pp-pick{position:relative;width:100%;}',
      '.ffp-pp-pick-btn{width:100%;display:flex;align-items:center;justify-content:space-between;gap:8px;background:rgba(25,128,173,0.06);border:1px solid rgba(25,128,173,0.30);border-radius:8px;color:#0e2531;padding:10px 12px;font-size:13px;font-weight:600;font-family:inherit;cursor:pointer;text-align:left;}',
      '.ffp-pp-pick-btn:hover{border-color:#1980AD;}',
      '.ffp-pp-pick-btn.placeholder{color:#566069;}',
      '.ffp-pp-pick-btn .material-symbols-outlined,.ffp-pp-pick-btn .ms{font-size:18px;color:#566069;}',
      '.ffp-pp-pick-menu{position:absolute;top:calc(100% + 4px);left:0;right:0;background:#ffffff;border:1px solid rgba(25,128,173,0.30);border-radius:8px;max-height:260px;overflow-y:auto;z-index:9000;display:none;box-shadow:0 8px 24px rgba(0,0,0,0.4);padding:4px;}',
      '.ffp-pp-pick-menu.open{display:block;}',
      '.ffp-pp-pick-item{padding:9px 12px;border-radius:6px;font-size:13px;font-weight:600;color:#0e2531;cursor:pointer;}',
      '.ffp-pp-pick-item:hover{background:rgba(25,128,173,0.10);}',
      '.ffp-pp-pick-item.active{background:rgba(25,128,173,0.15);color:#1980AD;}',
      '.ffp-pp-pick-search{position:sticky;top:-4px;background:#ffffff;padding:4px 4px 6px;margin:-4px -4px 4px;border-bottom:1px solid rgba(25,128,173,0.15);z-index:1;}',
      '.ffp-pp-pick-input{width:100%;box-sizing:border-box;background:rgba(25,128,173,0.06);border:1px solid rgba(25,128,173,0.30);border-radius:6px;color:#0e2531;padding:8px 10px;font-size:13px;font-family:inherit;outline:none;direction:ltr;text-align:left;unicode-bidi:plaintext;}',
      '.ffp-pp-pick-input:focus{border-color:#1980AD;}',

      // Phone country-code picker: preserve flex layout side-by-side with .phone-num
      '#panel-profile .phone-input .ffp-pp-pick{width:152px;flex-shrink:0;}',
      '#panel-profile .phone-input .ffp-pp-pick-btn{border-radius:8px 0 0 8px;border-right:1px solid rgba(25,128,173,0.10);padding:11px 14px;}',
      '#panel-profile .phone-input .ffp-pp-pick-menu{min-width:260px;width:auto;left:0;right:auto;}',
      '#panel-profile .phone-input .input.phone-num{border-radius:0 8px 8px 0;border-left:none;}'
    ].join('');
    document.head.appendChild(css);
  }

  // ─── Refine panel UI: subtitle, category options, type options ───
  function refineUI() {
    // Subtitle clarity — businesses/organizations only
    var sub = document.querySelector('#panel-profile .psub');
    if (sub) {
      sub.innerHTML = 'For <b>businesses and organizations</b> only. Individual trainers and coaches should join as a member instead. Changes go to admin for review before going live.';
    }

    // Replace category options
    var catSel = document.getElementById('pf-category');
    if (catSel) {
      var current = catSel.value;
      catSel.innerHTML = '<option value="">Choose category</option>' +
        CATEGORIES.map(function (c) { return '<option value="' + escText(c) + '">' + escText(c) + '</option>'; }).join('');
      if (current) catSel.value = current;
    }

    // Timezone options — full IANA list (shared FFPTime helper), searchable picker
    var tzSel = document.getElementById('pf-timezone');
    if (tzSel) {
      var currentTz = tzSel.value || (window.FFP_PROVIDER && window.FFP_PROVIDER.timezone) || 'Asia/Dubai';
      var zones = (window.FFPTime && window.FFPTime.list) ? window.FFPTime.list() : ['Asia/Dubai', 'UTC'];
      if (zones.indexOf(currentTz) === -1) zones.unshift(currentTz);
      tzSel.innerHTML = '<option value="">Choose timezone…</option>' +
        zones.map(function (z) { return '<option value="' + escText(z) + '">' + escText(z.replace(/_/g, ' ')) + '</option>'; }).join('');
      tzSel.value = currentTz;
    }

    // Currency options — full 54-currency list (assets/ffp-currency.js), searchable picker
    var ccySel = document.getElementById('pf-currency');
    if (ccySel && window.FFPCurrency) {
      var curCcy = ccySel.value || (window.FFP_PROVIDER && window.FFP_PROVIDER.currency) || 'AED';
      ccySel.innerHTML = window.FFPCurrency.optionsHtml(curCcy);
      ccySel.value = curCcy;
    }

    // Wire up the custom dark pickers on top of existing <select>s
    wrapSelectAsPicker('pf-category',  'Choose category');
    wrapSelectAsPicker('pf-phone-cc',  'Code');
    wrapSelectAsPicker('pf-timezone',  'Choose timezone…');
    wrapSelectAsPicker('pf-currency',  'Choose currency');
  }

  // ─── Custom dark picker wrapper ───
  // Hides the native <select> and renders a dark dropdown that mirrors it. On selection,
  // the underlying <select>.value is set and a change event fires so existing handlers work.
  function wrapSelectAsPicker(selectId, placeholder) {
    var sel = document.getElementById(selectId);
    if (!sel) return;
    // If we've already wrapped this select, just refresh the label
    if (sel.dataset.ffpPickerWrapped === '1') {
      refreshPickerLabel(sel);
      return;
    }
    sel.dataset.ffpPickerWrapped = '1';
    sel.style.display = 'none';

    var wrap = document.createElement('div');
    wrap.className = 'ffp-pp-pick';
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ffp-pp-pick-btn placeholder';
    btn.innerHTML = '<span class="ffp-pp-pick-label">' + escText(placeholder) + '</span><span class="ms material-symbols-outlined">expand_more</span>';
    var menu = document.createElement('div');
    menu.className = 'ffp-pp-pick-menu';

    // Show a search box once the list is long enough to need one (e.g. timezones).
    var SEARCH_THRESHOLD = 12;
    function optionCount() { var n = 0; Array.prototype.forEach.call(sel.options, function (o) { if (o.value) n++; }); return n; }

    function rebuildMenu(filter) {
      var withSearch = optionCount() > SEARCH_THRESHOLD;
      var q = (filter || '').trim().toLowerCase();
      var html = '';
      if (withSearch) {
        html += '<div class="ffp-pp-pick-search"><input type="text" dir="ltr" class="ffp-pp-pick-input" placeholder="Search…" value="' + escText(filter || '') + '"></div>';
      }
      Array.prototype.forEach.call(sel.options, function (opt) {
        if (!opt.value) return; // skip the placeholder ("")
        if (q && opt.textContent.toLowerCase().indexOf(q) === -1 && opt.value.toLowerCase().indexOf(q) === -1) return;
        var active = (opt.value === sel.value) ? ' active' : '';
        html += '<div class="ffp-pp-pick-item' + active + '" data-value="' + escText(opt.value) + '">' + escText(opt.textContent) + '</div>';
      });
      menu.innerHTML = html;
      menu.querySelectorAll('.ffp-pp-pick-item').forEach(function (it) {
        it.addEventListener('click', function () {
          sel.value = it.dataset.value;
          sel.dispatchEvent(new Event('change', { bubbles: true }));
          refreshPickerLabel(sel);
          closeMenu();
        });
      });
      if (withSearch) {
        var input = menu.querySelector('.ffp-pp-pick-input');
        if (input) {
          input.addEventListener('click', function (e) { e.stopPropagation(); });
          input.addEventListener('input', function () { rebuildMenu(input.value); input.focus(); });
          setTimeout(function () { try { input.focus(); } catch (e) {} }, 0);
        }
      }
    }
    function openMenu() {
      // Close any other open menus
      document.querySelectorAll('.ffp-pp-pick-menu.open').forEach(function (m) { m.classList.remove('open'); });
      rebuildMenu('');
      menu.classList.add('open');
    }
    function closeMenu() { menu.classList.remove('open'); }

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (menu.classList.contains('open')) closeMenu(); else openMenu();
    });

    sel.parentNode.insertBefore(wrap, sel);
    wrap.appendChild(btn);
    wrap.appendChild(menu);

    // Refresh label whenever the underlying <select> changes (from code or user)
    sel.addEventListener('change', function () { refreshPickerLabel(sel); });

    refreshPickerLabel(sel);
  }

  function refreshPickerLabel(sel) {
    if (!sel || sel.dataset.ffpPickerWrapped !== '1') return;
    var wrap = sel.previousSibling;
    if (!wrap || !wrap.classList || !wrap.classList.contains('ffp-pp-pick')) return;
    var btn = wrap.querySelector('.ffp-pp-pick-btn');
    var label = wrap.querySelector('.ffp-pp-pick-label');
    if (!btn || !label) return;
    var selectedOpt = sel.options[sel.selectedIndex];
    var hasValue = sel.value && selectedOpt && selectedOpt.value;
    if (hasValue) {
      label.textContent = selectedOpt.textContent;
      btn.classList.remove('placeholder');
    } else {
      // Use the placeholder from the first option ("Choose ...") if present
      var placeholderText = sel.options[0] ? sel.options[0].textContent : '';
      label.textContent = placeholderText || '';
      btn.classList.add('placeholder');
    }
  }

  // Close pickers on outside click
  document.addEventListener('click', function () {
    document.querySelectorAll('.ffp-pp-pick-menu.open').forEach(function (m) { m.classList.remove('open'); });
  });

  // ─── Fetch ───
  async function fetchProfile() {
    if (!window.FFP_PROVIDER || !window.FFP_PROVIDER.id) return null;
    var id = window.FFP_PROVIDER.id;

    var provRes = await window.supabase
      .from('providers')
      .select('id, business_name, letter_mark, category, provider_type, country, city, area, address, contact_email, contact_phone, website, instagram, about, tagline, gallery, amenities, logo_url, hero_photo_url, tour_video_url, status, activities, activity_descriptions, latitude, longitude, maps_url, passport_discount_pct, timezone, currency, booking_mode, external_booking_url')
      .eq('id', id).single();
    if (provRes.error) throw provRes.error;

    var hoursRes = await window.supabase
      .from('provider_hours')
      .select('day_of_week, opens, closes, closed')
      .eq('provider_id', id);
    if (hoursRes.error) console.warn('[FFP Provider Profile] hours read error:', hoursRes.error.message);

    var p = provRes.data;
    var profile = {
      business_name: p.business_name || '',
      letter_mark:   p.letter_mark || (p.business_name ? p.business_name[0].toUpperCase() : 'P'),
      category:      p.category || '',
      provider_type: p.provider_type || '',
      timezone:      p.timezone || 'Asia/Dubai',
      currency:      p.currency || 'AED',
      city:          p.city || '',
      country:       p.country || '',
      area:          p.area || '',
      address:       p.address || '',
      phone:         p.contact_phone || '',
      website:       p.website || '',
      about:         p.about || '',
      tagline:       p.tagline || '',
      gallery:       Array.isArray(p.gallery) ? p.gallery : [],
      amenities:     Array.isArray(p.amenities) ? p.amenities : [],
      booking_mode:  p.booking_mode || 'native',
      external_booking_url: p.external_booking_url || '',
      status:        p.status,
      verified:      p.status === 'approved',
      logo_url:      p.logo_url || null,
      hero_url:      p.hero_photo_url || null,
      tour_video_url: p.tour_video_url || '',
      activities:    Array.isArray(p.activities) ? p.activities : [],
      activity_descriptions: (p.activity_descriptions && typeof p.activity_descriptions === 'object') ? p.activity_descriptions : {},
      latitude:      (p.latitude  != null) ? Number(p.latitude)  : null,
      longitude:     (p.longitude != null) ? Number(p.longitude) : null,
      maps_url:      p.maps_url || '',
      passport_discount_pct: (p.passport_discount_pct != null) ? Number(p.passport_discount_pct) : null,
      hours:         defaultHoursObj()
    };
    (hoursRes && hoursRes.data ? hoursRes.data : []).forEach(function (h) {
      var day = INT_TO_DAY[h.day_of_week];
      if (!day) return;
      profile.hours[day] = {
        open:   trimTime(h.opens),
        close:  trimTime(h.closes),
        closed: !!h.closed
      };
    });
    return profile;
  }

  // ─── Save ───
  async function realSaveProfile() {
    if (!window.FFP_PROVIDER || !window.FFP_PROVIDER.id) { toast('Provider not loaded', 'error'); return; }
    var id = window.FFP_PROVIDER.id;

    var businessName = (document.getElementById('pf-business-name').value || '').trim();
    // Brands use their PRODUCT TYPE (brand_category) as the category; venues use the venue category.
    var category     = _brand.is_brand
      ? (_brand.category || (document.getElementById('pf-brand-cat') || {}).value || '')
      : document.getElementById('pf-category').value;
    var city         = document.getElementById('pf-city').value;
    var country      = (document.getElementById('pf-country') || {}).value || '';
    var timezone     = (document.getElementById('pf-timezone') || {}).value || '';
    var currency     = (document.getElementById('pf-currency') || {}).value || '';
    var area         = (document.getElementById('pf-area').value || '').trim();
    var address      = (document.getElementById('pf-address').value || '').trim();
    var phone        = (typeof window.getPhoneValue === 'function') ? window.getPhoneValue() : '';
    var website      = (document.getElementById('pf-website').value || '').trim();
    var about        = (document.getElementById('pf-about').value || '').trim();
    var letterMark   = (businessName || 'P').charAt(0).toUpperCase();

    if (!businessName) { toast('Business name is required', 'error'); return; }
    if (!category)     { toast('Category is required', 'error'); return; }
    if (!city)         { toast('City is required', 'error'); return; }
    if (!timezone)     { toast('Timezone is required', 'error'); return; }

    // Hours — AUTO-CLOSE any day where times are empty (no invalid open-but-no-times state)
    var hoursRows = [];
    var autoClosedCount = 0;
    document.querySelectorAll('#hours-grid .hours-row').forEach(function (row) {
      var day = row.dataset.day;
      var dayInt = DAY_TO_INT[day];
      if (dayInt === undefined) return;
      var checkbox = row.querySelector('.hours-closed input[type="checkbox"]');
      var manuallyClosed = !!(checkbox && checkbox.checked) || row.classList.contains('is-closed');
      var openEl  = row.querySelector('[data-field="open"]');
      var closeEl = row.querySelector('[data-field="close"]');
      var openVal  = openEl ? (openEl.value || '').trim() : '';
      var closeVal = closeEl ? (closeEl.value || '').trim() : '';
      var noTimes = !openVal && !closeVal;
      var closed = manuallyClosed || noTimes;
      if (!manuallyClosed && noTimes) autoClosedCount++;
      hoursRows.push({
        provider_id: id,
        day_of_week: dayInt,
        opens:   closed ? null : (openVal || null),
        closes:  closed ? null : (closeVal || null),
        closed:      closed
      });
    });

    var logoUrl = (typeof providerProfile !== 'undefined' && providerProfile.logo_url) ? providerProfile.logo_url : null;
    var heroUrl = (typeof providerProfile !== 'undefined' && providerProfile.hero_url) ? providerProfile.hero_url : null;
    var saveBtn = document.querySelector('#panel-profile .btn-pri');
    if (saveBtn) saveBtn.disabled = true;

    try {
      // Providers/members use a custom JWT → auth.uid() doesn't resolve client-side, so a
      // direct providers.update silently affects 0 rows and provider_hours insert hits RLS
      // 42501. Save via the SECURITY DEFINER RPC that takes the provider id explicitly
      // (same trust model as provider_save_listing).
      var saveRes = await window.supabase.rpc('provider_save_profile', {
        p_provider: id,
        p: {
          business_name:  businessName,
          letter_mark:    letterMark,
          category:       category,
          timezone:       timezone || null,
          currency:       currency || null,
          city:           city,
          country:        country || null,
          area:           area || null,
          address:        address || null,
          contact_phone:  phone || null,
          website:        website || null,
          about:          about || null,
          tagline:        (function () { var e = document.getElementById('pf-tagline'); return e ? e.value.trim() : ''; })(),
          gallery:        (typeof providerProfile !== 'undefined' && Array.isArray(providerProfile.gallery)) ? providerProfile.gallery : [],
          amenities:      (function () { try { return Array.prototype.slice.call(document.querySelectorAll('#pf-amenities-host input:checked')).map(function (c) { return c.value; }); } catch (e) { return (typeof providerProfile !== 'undefined' && Array.isArray(providerProfile.amenities)) ? providerProfile.amenities : []; } })(),
          booking_mode:   (function () { var e = document.getElementById('pf-booking-mode'); return e ? (e.value || 'native') : 'native'; })(),
          external_booking_url: (function () { var e = document.getElementById('pf-booking-url'); return e ? e.value.trim() : ''; })(),
          logo_url:       logoUrl,
          hero_photo_url: heroUrl,
          tour_video_url: (function () { var e = document.getElementById('pf-tour-video'); return e ? e.value.trim() : ''; })(),
          activities:     _provExtras.activities || [],
          latitude:       (_provExtras.lat != null) ? _provExtras.lat : null,
          longitude:      (_provExtras.lng != null) ? _provExtras.lng : null,
          maps_url:       _provExtras.mapsUrl || null,
          // Passport-member discount % this provider offers on Find Fit People bookings ('' = platform default).
          passport_discount_pct: (function () { var e = document.getElementById('pf-passport-discount'); return e ? e.value.trim() : ''; })()
        },
        p_hours: hoursRows
      });
      if (saveRes.error) throw saveRes.error;
      if (saveRes.data !== true) throw new Error('Save did not complete — please try again');

      // Sync providerProfile in memory
      if (typeof providerProfile !== 'undefined') {
        providerProfile.business_name = businessName;
        providerProfile.letter_mark   = letterMark;
        providerProfile.category      = category;
        providerProfile.timezone      = timezone;
        providerProfile.city          = city;
        providerProfile.country       = country;
        providerProfile.area          = area;
        providerProfile.address       = address;
        providerProfile.phone         = phone;
        providerProfile.website       = website;
        providerProfile.about         = about;
        hoursRows.forEach(function (h) {
          var day = INT_TO_DAY[h.day_of_week];
          providerProfile.hours[day] = {
            open: trimTime(h.opens),
            close: trimTime(h.closes),
            closed: !!h.closed
          };
        });
      }

      // Update sidebar foot + topbar — mark shows the partner LOGO when set, else the initial.
      var sbName = document.getElementById('sb-foot-name');
      var sbMark = document.getElementById('sb-foot-mark');
      if (sbName) sbName.textContent = businessName || 'Your business';
      if (sbMark) {
        if (logoUrl) { sbMark.innerHTML = '<img src="' + logoUrl + '" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:9px;display:block;">'; sbMark.style.background = 'transparent'; }
        else { sbMark.textContent = letterMark; sbMark.style.background = ''; }
      }
      window.FFP_PROVIDER.business_name = businessName;
      if (timezone) window.FFP_PROVIDER.timezone = timezone;   // so FFPTime immediately uses the saved zone
      if (currency) window.FFP_PROVIDER.currency = currency;   // so price labels immediately use the saved currency

      if (typeof window.renderProfileCompletion === 'function') { try { window.renderProfileCompletion(); } catch (e) {} }
      if (typeof window.setSaveBar === 'function') { try { window.setSaveBar(false); } catch (e) {} }

      var msg = 'Profile saved';
      if (autoClosedCount > 0) msg += ' (' + autoClosedCount + ' day' + (autoClosedCount > 1 ? 's' : '') + ' auto-marked closed)';
      toast(msg, 'success');
    } catch (e) {
      console.error('[FFP Provider Profile] save:', e);
      var emsg = e.message || 'Save failed';
      if (/policy|permission|denied|rls/i.test(emsg)) {
        emsg = 'Save blocked by RLS — check provider/provider_hours policies';
      } else if (/does not exist/i.test(emsg)) {
        emsg = 'Schema mismatch — see console for details';
      }
      toast(emsg, 'error');
    } finally {
      if (saveBtn) saveBtn.disabled = false;
    }
  }

  // ─── Activities offered + venue location (injected into #panel-profile) ───
  var _provExtras = { activities: [], activity_descriptions: {}, lat: null, lng: null, mapsUrl: '' };
  var _actsAll = [];   // full activity taxonomy for the custom dropdown
  var GEO_API = 'https://ffp-passport-backend.vercel.app';

  function injectExtrasCss() {
    if (document.getElementById('pf-extras-css')) return;
    var s = document.createElement('style'); s.id = 'pf-extras-css';
    s.textContent =
      '.pf-extras-add{display:flex;gap:8px;align-items:center;flex-wrap:wrap;}' +
      '.pf-extras-add .input{flex:1;min-width:160px;}' +
      '.pf-extras-btn{background:var(--ffp-blue);color:#fff;border:none;border-radius:9px;padding:10px 16px;font-weight:800;font-size:13px;cursor:pointer;font-family:inherit;white-space:nowrap;}' +
      '.pf-chips{display:flex;flex-wrap:wrap;gap:7px;margin-top:8px;}' +
      '.pf-chip{display:inline-flex;align-items:center;gap:6px;background:rgba(25,128,173,.12);border:1px solid rgba(25,128,173,.28);border-radius:100px;padding:5px 6px 5px 12px;font-size:12px;font-weight:700;color:#0e2531;}' +
      '.pf-chip button{background:rgba(255,255,255,.12);border:none;color:#cfe0ec;border-radius:50%;width:18px;height:18px;cursor:pointer;font-size:13px;line-height:1;}' +
      '.pf-loc-status{display:block;margin-top:6px;font-size:12px;color:#566069;font-weight:600;}' +
      // "What we offer" — each activity is a row with a description the partner writes (mirrors the public profile)
      '.pf-actlist{display:flex;flex-direction:column;gap:10px;margin-top:10px;}' +
      '.pf-actrow{background:#f7f9fb;border:1px solid #e6ecf1;border-radius:12px;padding:11px 12px;}' +
      '.pf-actrow-top{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;}' +
      '.pf-actrow-name{font-size:14px;font-weight:800;color:#0e2531;}' +
      '.pf-actrow-x{background:#eef2f5;border:none;color:#8a97a2;border-radius:50%;width:22px;height:22px;cursor:pointer;font-size:15px;line-height:1;flex:none;}' +
      '.pf-actrow-x:hover{background:#e2452f;color:#fff;}' +
      '.pf-actrow-desc{width:100%;resize:vertical;min-height:44px;font-size:13px;line-height:1.5;}' +
      // Brand product highlights (shown in place of activities when is_brand)
      '.pf-prod-cap{display:flex;justify-content:space-between;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.3px;color:#9aa8b4;margin:2px 0 8px;}' +
      '.pf-prod-add{display:flex;gap:10px;margin-bottom:4px;}' +
      '.pf-prod{display:grid;grid-template-columns:76px 1fr;gap:13px;padding:15px 0;border-bottom:1px solid #e6ecf1;position:relative;}' +
      '.pf-prod .pimg{width:76px;height:76px;border-radius:11px;background:#eef2f5 center/cover no-repeat;border:1.5px dashed #d7dee5;display:flex;align-items:center;justify-content:center;color:#9aa8b4;cursor:pointer;flex:none;}' +
      '.pf-prod .pimg.has{border:none;} .pf-prod .pimg .ms{font-size:24px;}' +
      '.pf-prod .pcol{display:flex;flex-direction:column;gap:8px;min-width:0;}' +
      '.pf-prod .prow{display:flex;gap:10px;} .pf-prod .pnm{flex:1;min-width:0;} .pf-prod .ppr{width:104px;flex:none;}' +
      '.pf-prod input.input,.pf-prod textarea.input{font-size:13.5px;}' +
      '.pf-prod .pdel{position:absolute;top:12px;right:0;background:#eef2f5;border:none;color:#8a97a2;border-radius:50%;width:24px;height:24px;cursor:pointer;font-size:15px;line-height:1;}' +
      '.pf-prod .pdel:hover{background:#e2452f;color:#fff;}' +
      // our own activity dropdown (replaces the native <datalist>)
      '.pf-ac-wrap{position:relative;flex:1;min-width:160px;}' +
      '.pf-ac-dd{position:absolute;left:0;right:0;top:calc(100% + 5px);z-index:60;background:#ffffff;border:1px solid rgba(25,128,173,.3);border-radius:12px;max-height:260px;overflow-y:auto;box-shadow:0 18px 50px rgba(0,0,0,.55);padding:5px;}' +
      '.pf-ac-dd::-webkit-scrollbar{width:0;}' +
      '.pf-ac-item{padding:10px 12px;border-radius:8px;font-size:13px;font-weight:600;color:#0e2531;cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:8px;}' +
      '.pf-ac-item:hover{background:rgba(25,128,173,.15);}' +
      '.pf-ac-item .pf-ac-add{font-size:11px;font-weight:800;color:var(--ffp-blue);}' +
      '.pf-ac-empty{padding:11px 12px;font-size:12px;color:#566069;}';
    document.head.appendChild(s);
  }
  // Inject "Activities we offer" + "Google Maps link" as native form fields, placed right
  // AFTER the Address field (so they sit with venue/neighbourhood + provider type, not at
  // the bottom of the page). Styled like the rest of the form, not a separate block.
  function injectProviderExtras() {
    if (document.getElementById('pf-extras-acts')) return;
    var panel = document.getElementById('panel-profile'); if (!panel) return;
    injectExtrasCss();
    // Seed from FFP_TAX for an instant list, then refresh from the FULL DB taxonomy (the fallback can be
    // stale/incomplete — e.g. it was missing Canyoning, which IS in the taxonomy).
    _actsAll = ((window.FFP_TAX && window.FFP_TAX.activities) || []).map(function (a) { return (a && a.n) ? a.n : a; });
    loadActivityTaxonomy();

    var f1 = document.createElement('div'); f1.className = 'field full'; f1.id = 'pf-extras-acts';
    f1.innerHTML =
      '<div class="label">What we offer <span class="label-hint">— add each activity, then describe it (shows on your public profile)</span></div>' +
      '<div class="pf-extras-add">' +
        '<div class="pf-ac-wrap">' +
          '<input id="pf-act-input" class="input" autocomplete="off" placeholder="Search activities…">' +
          '<div id="pf-act-dd" class="pf-ac-dd" style="display:none;"></div>' +
        '</div>' +
        '<button type="button" id="pf-act-add" class="pf-extras-btn">Add</button>' +
      '</div>' +
      '<div id="pf-act-chips" class="pf-actlist"></div>';
    var f2 = document.createElement('div'); f2.className = 'field full'; f2.id = 'pf-extras-loc';
    f2.innerHTML =
      '<div class="label">Google Maps link <span class="label-hint">— sets your check-in pin + gives members Directions</span></div>' +
      '<div class="pf-extras-add"><input id="pf-maps-url" class="input" placeholder="Paste your Google Maps link (any format)"><button type="button" id="pf-loc-btn" class="pf-extras-btn">Find pin</button></div>' +
      '<span id="pf-loc-status" class="pf-loc-status">No location set</span>';

    // Bookings — take bookings on FFP, or send members out to your own booking platform.
    var f3 = document.createElement('div'); f3.className = 'field full'; f3.id = 'pf-extras-booking';
    f3.innerHTML =
      '<div class="label">Bookings <span class="label-hint">— how members book your classes &amp; services</span></div>' +
      '<select id="pf-booking-mode" class="select" style="margin-bottom:8px;">' +
        '<option value="native">Take bookings on FFP</option>' +
        '<option value="external">Send members to my own booking site</option>' +
      '</select>' +
      '<div id="pf-booking-url-wrap" style="display:none;">' +
        '<input id="pf-booking-url" class="input" placeholder="Your booking link — FareHarbor, Rezdy, Mindbody or your website">' +
        '<span class="pf-loc-status">Members tap “Book” and go straight to this link.</span>' +
      '</div>';

    // v11: tabbed profile — Activities (f1) lives in the Activities tab (#pf-activities-host);
    // the Google Maps link (f2) is venue location, so it sits in Business info after Address.
    var host = document.getElementById('pf-activities-host');
    if (host) { host.appendChild(f1); }
    var addr = document.getElementById('pf-address');
    var addrField = (addr && addr.closest) ? addr.closest('.field') : null;
    if (addrField && addrField.parentNode) {
      addrField.parentNode.insertBefore(f2, addrField.nextSibling);
      addrField.parentNode.insertBefore(f3, f2.nextSibling);
      if (!host) addrField.parentNode.insertBefore(f1, addrField.nextSibling);   // fallback: old layout
    } else {
      var saveBtn = panel.querySelector('.btn-pri');
      var anchor = saveBtn ? (saveBtn.closest('.form-actions') || saveBtn) : null;
      if (anchor && anchor.parentNode) { if (!host) anchor.parentNode.insertBefore(f1, anchor); anchor.parentNode.insertBefore(f2, anchor); anchor.parentNode.insertBefore(f3, anchor); }
      else { if (!host) panel.appendChild(f1); panel.appendChild(f2); panel.appendChild(f3); }
    }
    var bmSel = document.getElementById('pf-booking-mode');
    if (bmSel) bmSel.onchange = function () { var w = document.getElementById('pf-booking-url-wrap'); if (w) w.style.display = (this.value === 'external') ? '' : 'none'; };
    var actInput = document.getElementById('pf-act-input');
    document.getElementById('pf-act-add').onclick = function () { addAct(); };
    actInput.onfocus = function () { renderActDropdown(this.value); };
    actInput.oninput = function () { renderActDropdown(this.value); };
    actInput.onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); addAct(); } else if (e.key === 'Escape') { hideActDropdown(); } };
    // hide the dropdown when clicking outside it
    if (!window.__pfAcOutside) {
      window.__pfAcOutside = true;
      document.addEventListener('click', function (e) {
        var wrap = document.querySelector('.pf-ac-wrap');
        if (wrap && !wrap.contains(e.target)) hideActDropdown();
      });
    }
    document.getElementById('pf-loc-btn').onclick = resolveMapsLink;
    var mu = document.getElementById('pf-maps-url');
    if (mu) mu.onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); resolveMapsLink(); } };
    renderActChips();
  }
  // The activity list is the admin-managed `activity` taxonomy (single source of truth) — load it fully
  // from the DB so no real activity is ever missing (and partners can't free-text their own).
  function loadActivityTaxonomy() {
    try {
      window.supabase.from('taxonomy_items').select('label').eq('list_key', 'activity').eq('active', true).order('sort_order', { ascending: true }).then(function (r) {
        if (r && r.data && r.data.length) {
          _actsAll = r.data.map(function (x) { return x.label; });
          var dd = document.getElementById('pf-act-dd');
          var inp = document.getElementById('pf-act-input');
          if (dd && dd.style.display === 'block' && inp) renderActDropdown(inp.value);
        }
      });
    } catch (e) { console.error('[Profile] activity taxonomy:', e); }
  }
  function hideActDropdown() { var dd = document.getElementById('pf-act-dd'); if (dd) dd.style.display = 'none'; }
  function renderActDropdown(filter) {
    var dd = document.getElementById('pf-act-dd'); if (!dd) return;
    var f = (filter || '').toLowerCase().trim();
    var chosen = _provExtras.activities.map(function (a) { return a.toLowerCase(); });
    var matches = _actsAll.filter(function (a) {
      return chosen.indexOf(a.toLowerCase()) === -1 && (!f || a.toLowerCase().indexOf(f) !== -1);
    }).slice(0, 40);
    var html = matches.map(function (a) {
      return '<div class="pf-ac-item" onclick="__pfAddAct(&quot;' + escText(a).replace(/"/g, '') + '&quot;)"><span>' + escText(a) + '</span></div>';
    }).join('');
    // Taxonomy-only: NO free-text/custom activities (keeps them searchable + matchable platform-wide).
    // If an activity is missing, it must be added to the `activity` taxonomy in Admin.
    dd.innerHTML = html || '<div class="pf-ac-empty">No matching activity — it must be in the FFP activity list. Ask FFP to add it if it’s missing.</div>';
    dd.style.display = 'block';
  }
  // Only adds a value that exists in the activity taxonomy (case-insensitive), using its canonical label.
  window.__pfAddAct = function (v) {
    v = (v || '').trim(); if (!v) return;
    var canon = null;
    for (var i = 0; i < _actsAll.length; i++) { if (_actsAll[i].toLowerCase() === v.toLowerCase()) { canon = _actsAll[i]; break; } }
    if (!canon) { toast('Pick an activity from the list — custom activities aren’t allowed.', 'error'); return; }
    if (!_provExtras.activities.some(function (a) { return a.toLowerCase() === canon.toLowerCase(); })) _provExtras.activities.push(canon);
    var inp = document.getElementById('pf-act-input'); if (inp) { inp.value = ''; inp.focus(); }
    renderActChips(); renderActDropdown('');
  };
  function addAct() {
    var inp = document.getElementById('pf-act-input'); if (!inp) return;
    var v = (inp.value || '').trim(); if (!v) { hideActDropdown(); return; }
    window.__pfAddAct(v);
  }
  window.__pfRemoveAct = function (v) {
    _provExtras.activities = _provExtras.activities.filter(function (a) { return a !== v; });
    if (_provExtras.activity_descriptions) delete _provExtras.activity_descriptions[v];
    renderActChips();
  };
  // Persist one activity's description to providers.activity_descriptions (own-gated RPC). Debounced per keystroke.
  var _actDescTimers = {};
  window.__pfSaveActDesc = function (a, el) {
    var desc = (el && el.value != null) ? el.value : '';
    if (!_provExtras.activity_descriptions) _provExtras.activity_descriptions = {};
    _provExtras.activity_descriptions[a] = desc;
    if (typeof providerProfile !== 'undefined') providerProfile.activity_descriptions = Object.assign({}, _provExtras.activity_descriptions);
    var pid = (typeof providerProfile !== 'undefined' && providerProfile.id) ? providerProfile.id : (window.FFP_PROVIDER && window.FFP_PROVIDER.id);
    if (!pid) return;
    clearTimeout(_actDescTimers[a]);
    _actDescTimers[a] = setTimeout(function () {
      window.supabase.rpc('provider_set_activity_desc', { p_provider: pid, p_activity: a, p_desc: desc.trim() })
        .then(function (r) { if (r && r.error) console.error('[Profile] set activity desc:', r.error); });
    }, 700);
  };
  function renderActChips() {
    var c = document.getElementById('pf-act-chips'); if (!c) return;
    var descs = _provExtras.activity_descriptions || {};
    c.innerHTML = _provExtras.activities.length
      ? _provExtras.activities.map(function (a) {
          var safe = escText(a).replace(/"/g, '');
          var d = descs[a] ? escText(descs[a]) : '';
          return '<div class="pf-actrow">' +
                   '<div class="pf-actrow-top"><span class="pf-actrow-name">' + escText(a) + '</span>' +
                     '<button type="button" class="pf-actrow-x" onclick="__pfRemoveAct(&quot;' + safe + '&quot;)" aria-label="Remove">&times;</button></div>' +
                   '<textarea class="input pf-actrow-desc" rows="2" placeholder="Describe this — what it involves, who it suits, how long it runs" ' +
                     'oninput="__pfSaveActDesc(&quot;' + safe + '&quot;, this)">' + d + '</textarea>' +
                 '</div>';
        }).join('')
      : '<span class="pf-loc-status">None yet — add the activities members can do here.</span>';
    // Keep providerProfile.activities live so the profile-completion % + the "listings hidden" banner
    // update the moment a partner adds/removes an activity (activity is a completion essential).
    if (typeof providerProfile !== 'undefined') providerProfile.activities = _provExtras.activities.slice();
    if (typeof window.renderProfileCompletion === 'function') { try { window.renderProfileCompletion(); } catch (e) {} }
  }

  // ─── Brand product highlights (shown in the Activities tab when is_brand) ───
  function _pfPid() { return (window.FFP_PROVIDER && window.FFP_PROVIDER.id) || (typeof providerProfile !== 'undefined' && providerProfile.id) || null; }
  function injectProductsEditor() {
    if (document.getElementById('pf-products-wrap')) return;
    var host = document.getElementById('pf-activities-host'); if (!host) return;
    var w = document.createElement('div'); w.id = 'pf-products-wrap'; w.style.display = 'none';
    w.innerHTML =
      '<div class="pf-prod-cap"><span>Your products — add up to 6</span><span id="pf-prod-count">0 / 6</span></div>' +
      '<div class="pf-prod-add"><input id="pf-prod-name" class="input" placeholder="Product name…" style="flex:1"><button type="button" class="btn-pri" onclick="__pfProdAddNew()">Add</button></div>' +
      '<div id="pf-prod-list"></div>';
    host.appendChild(w);
    var ni = document.getElementById('pf-prod-name'); if (ni) ni.onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); window.__pfProdAddNew(); } };
  }
  function loadBrandProducts() {
    var pid = _pfPid(); if (!pid) return;
    window.supabase.rpc('brand_products_list', { p_provider: pid }).then(function (r) {
      _brand.products = (r && r.data) || []; renderBrandProducts();
    });
  }
  function renderBrandProducts() {
    var list = document.getElementById('pf-prod-list'); if (!list) return;
    var cnt = document.getElementById('pf-prod-count'); if (cnt) cnt.textContent = _brand.products.length + ' / 6';
    if (!_brand.products.length) { list.innerHTML = '<span class="pf-loc-status">None yet — add a few products you make.</span>'; return; }
    list.innerHTML = _brand.products.map(function (p) {
      var img = p.image_url ? 'has" style="background-image:url(\'' + escText(p.image_url) + '\')"' : '"';
      var imgInner = p.image_url ? '' : '<span class="ms">add_a_photo</span>';
      return '<div class="pf-prod">' +
        '<button type="button" class="pdel" onclick="__pfProdRemove(\'' + p.id + '\')" aria-label="Remove">&times;</button>' +
        '<div class="pimg ' + img + ' onclick="__pfProdImg(\'' + p.id + '\')">' + imgInner + '</div>' +
        '<div class="pcol">' +
          '<div class="prow"><input class="input pnm" value="' + escText(p.name || '') + '" placeholder="Product name" onchange="__pfProdField(\'' + p.id + '\',\'name\',this.value)">' +
            '<input class="input ppr" value="' + escText(p.price != null ? p.price : '') + '" placeholder="Price" onchange="__pfProdField(\'' + p.id + '\',\'price\',this.value)"></div>' +
          '<textarea class="input" rows="2" placeholder="One line — what it is (optional)" onchange="__pfProdField(\'' + p.id + '\',\'description\',this.value)">' + escText(p.description || '') + '</textarea>' +
          '<input class="input" value="' + escText(p.buy_url || '') + '" placeholder="Shop / buy link (optional)" onchange="__pfProdField(\'' + p.id + '\',\'buy_url\',this.value)">' +
        '</div></div>';
    }).join('');
  }
  window.__pfProdAddNew = function () {
    var pid = _pfPid(); if (!pid) return;
    var ni = document.getElementById('pf-prod-name'); var nm = ni ? (ni.value || '').trim() : '';
    if (!nm) { if (ni) ni.focus(); return; }
    window.supabase.rpc('brand_product_save', { p_provider: pid, p_id: null, p: { name: nm } }).then(function (r) {
      if (r && r.error) { toast(/max_products/.test(r.error.message || '') ? 'Up to 6 products' : 'Could not add', 'error'); return; }
      if (ni) ni.value = ''; loadBrandProducts();
    });
  };
  var _pfProdTimers = {};
  window.__pfProdField = function (id, field, value) {
    var pid = _pfPid(); if (!pid) return;
    var p = {}; p[field] = (field === 'price') ? (value === '' ? null : String(value).replace(/[^0-9.]/g, '')) : value;
    clearTimeout(_pfProdTimers[id + field]);
    _pfProdTimers[id + field] = setTimeout(function () {
      window.supabase.rpc('brand_product_save', { p_provider: pid, p_id: id, p: p }).then(function (r) { if (r && r.error) console.error('[Brand product]', r.error); });
    }, 500);
  };
  window.__pfProdRemove = function (id) {
    window.supabase.rpc('brand_product_remove', { p_id: id }).then(function (r) { if (r && r.error) { toast('Could not remove', 'error'); return; } loadBrandProducts(); });
  };
  window.__pfProdImg = function (id) {
    var pid = _pfPid(); if (!pid) return;
    if (!window.FFPUpload) { toast('Uploader not ready — refresh and retry', 'error'); return; }
    window.FFPUpload.pick({ bucket: 'brand-products', key: 'prod-' + pid + '-' + id + '-' + Date.now(), aspect: 1, outW: 800, outH: 800, title: 'Product photo (square)',
      onDone: function (url) { window.supabase.rpc('brand_product_save', { p_provider: pid, p_id: id, p: { image_url: url } }).then(function () { loadBrandProducts(); toast('Photo added', 'success'); }); },
      onError: function (err) { console.error('[prod upload]', err); toast('Upload failed', 'error'); } });
  };

  async function resolveMapsLink() {
    var inp = document.getElementById('pf-maps-url'), st = document.getElementById('pf-loc-status');
    var url = inp ? (inp.value || '').trim() : '';
    if (!url) { if (st) st.textContent = 'Paste your Google Maps link first'; return; }
    _provExtras.mapsUrl = url;  // stored for member "Directions" even if the pin can't be read
    if (st) st.textContent = 'Finding your pin…';
    try {
      var res = await fetch(GEO_API + '/api/geo/resolve?url=' + encodeURIComponent(url));
      var j = await res.json();
      if (!res.ok || j.lat == null) { if (st) st.textContent = (j && j.error) ? j.error : 'Couldn’t read a pin from that link'; return; }
      _provExtras.lat = j.lat; _provExtras.lng = j.lng;
      if (st) st.textContent = '✓ Pin set (' + j.lat.toFixed(5) + ', ' + j.lng.toFixed(5) + ') — Save to keep it';
    } catch (e) { console.error('[Profile] resolve maps link:', e); if (st) st.textContent = 'Couldn’t reach the resolver — try again'; }
  }
  function populateProviderExtras(profile) {
    _provExtras.activities = Array.isArray(profile.activities) ? profile.activities.slice() : [];
    _provExtras.activity_descriptions = (profile.activity_descriptions && typeof profile.activity_descriptions === 'object') ? Object.assign({}, profile.activity_descriptions) : {};
    _provExtras.lat = (profile.latitude != null) ? profile.latitude : null;
    _provExtras.lng = (profile.longitude != null) ? profile.longitude : null;
    _provExtras.mapsUrl = profile.maps_url || '';
    renderActChips();
    var mu = document.getElementById('pf-maps-url'); if (mu) mu.value = _provExtras.mapsUrl;
    var bm = document.getElementById('pf-booking-mode'); if (bm) bm.value = profile.booking_mode || 'native';
    var bu = document.getElementById('pf-booking-url'); if (bu) bu.value = profile.external_booking_url || '';
    var buw = document.getElementById('pf-booking-url-wrap'); if (buw) buw.style.display = ((profile.booking_mode || 'native') === 'external') ? '' : 'none';
    var tg = document.getElementById('pf-tagline'); if (tg) tg.value = profile.tagline || '';
    try { if (typeof window.renderProviderGallery === 'function') window.renderProviderGallery(); } catch (e) {}
    try { if (typeof window.renderProviderAmenities === 'function') window.renderProviderAmenities(); } catch (e) {}
    var st = document.getElementById('pf-loc-status');
    if (st) st.textContent = (_provExtras.lat != null && _provExtras.lng != null)
      ? ('✓ Pin set (' + _provExtras.lat + ', ' + _provExtras.lng + ')')
      : (_provExtras.mapsUrl ? 'Link saved — tap “Find pin” to set the pin' : 'No location set');
  }

  // ─── Brand mode + "Where it's sold" stockist manager (Brands v1) ───
  // A partner can flag themselves a product brand (is_brand). Brands pick the LOCATIONS
  // where they're sold (brand_locations) so members can discover them on Explore → Brands.
  var _brand = { is_brand: false, sess: Math.random().toString(36).slice(2), locs: [], products: [] };
  var _brandSugT = null;

  function injectBrandCss() {
    if (document.getElementById('pf-brand-css')) return;
    var s = document.createElement('style'); s.id = 'pf-brand-css';
    s.textContent =
      '.pf-switch{display:inline-flex;align-items:center;gap:10px;cursor:pointer;user-select:none;margin-top:4px;}' +
      '.pf-switch input{display:none;}' +
      '.pf-switch .pf-track{width:44px;height:26px;border-radius:100px;background:#cdd6dd;position:relative;transition:background .15s;flex:none;}' +
      '.pf-switch .pf-track:after{content:"";position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.3);transition:left .15s;}' +
      '.pf-switch input:checked + .pf-track{background:var(--ffp-blue);}' +
      '.pf-switch input:checked + .pf-track:after{left:21px;}' +
      '.pf-brand-body{margin-top:16px;}' +
      '.pf-loc-dd{position:absolute;left:0;right:0;top:calc(100% + 5px);z-index:60;background:#fff;border:1px solid rgba(25,128,173,.3);border-radius:12px;max-height:260px;overflow-y:auto;box-shadow:0 18px 50px rgba(0,0,0,.35);padding:5px;}' +
      '.pf-loc-item{padding:10px 12px;border-radius:8px;font-size:13px;font-weight:600;color:#0e2531;cursor:pointer;}' +
      '.pf-loc-item:hover{background:rgba(25,128,173,.15);}' +
      '.pf-loc-item small{display:block;color:#8a99a8;font-weight:600;font-size:11px;margin-top:1px;}' +
      '.pf-stockist{display:flex;align-items:center;gap:10px;padding:11px 0;border-bottom:1px solid #eef2f5;}' +
      '.pf-stockist .tx{flex:1;min-width:0;}' +
      '.pf-stockist .tx b{font-size:13.5px;font-weight:800;color:#0e2531;display:block;}' +
      '.pf-stockist .tx span{font-size:12px;color:#8a99a8;font-weight:600;}' +
      '.pf-stockist button{background:rgba(192,57,43,.1);border:none;color:#c0392b;border-radius:8px;padding:6px 11px;font-size:12px;font-weight:800;cursor:pointer;font-family:inherit;}';
    document.head.appendChild(s);
  }

  function injectBrandSection() {
    if (document.getElementById('pf-brand-field')) return;
    var panel = document.getElementById('panel-profile'); if (!panel) return;
    injectBrandCss();
    var f = document.createElement('div'); f.className = 'field full'; f.id = 'pf-brand-field';
    f.innerHTML =
      '<div class="label">Brand <span class="label-hint">— turn on if you sell a product (supplements, apparel, gear) rather than run a venue</span></div>' +
      '<label class="pf-switch"><input type="checkbox" id="pf-is-brand"><span class="pf-track"></span><span style="font-weight:700;font-size:13px;color:#0e2531;">We’re a product brand</span></label>' +
      '<div class="pf-brand-body" id="pf-brand-body" style="display:none;">' +
        '<div class="label" style="margin-top:2px;">Product type <span class="label-hint">— how members find you under Explore → Brands</span></div>' +
        '<select id="pf-brand-cat" class="select" style="margin-bottom:16px;"><option value="">Choose a product type…</option></select>' +
        '<div class="label" style="margin-top:2px;">Where it’s sold <span class="label-hint">— the stockists / places members can buy you</span></div>' +
        '<div class="pf-extras-add">' +
          '<div class="pf-ac-wrap" style="position:relative;">' +
            '<input id="pf-brand-loc-input" class="input" autocomplete="off" placeholder="Search a city, suburb or store…">' +
            '<div id="pf-brand-loc-dd" class="pf-loc-dd" style="display:none;"></div>' +
          '</div>' +
        '</div>' +
        '<div id="pf-brand-locs" style="margin-top:12px;"></div>' +
      '</div>';
    var cat = document.getElementById('pf-category');
    var catField = (cat && cat.closest) ? cat.closest('.field') : null;
    if (catField && catField.parentNode) { catField.parentNode.insertBefore(f, catField.nextSibling); }
    else { panel.appendChild(f); }
    document.getElementById('pf-is-brand').onchange = function () { setBrand(this.checked); };
    var catSel = document.getElementById('pf-brand-cat');
    if (catSel) catSel.onchange = function () { setBrandCategory(this.value); };
    loadBrandCatOptions();
    var inp = document.getElementById('pf-brand-loc-input');
    inp.oninput = function () { brandLocSuggest(this.value); };
    inp.onfocus = function () { if (this.value.trim()) brandLocSuggest(this.value); };
    if (!window.__pfBrandOutside) {
      window.__pfBrandOutside = true;
      document.addEventListener('click', function (e) {
        var w = document.getElementById('pf-brand-loc-input'), dd = document.getElementById('pf-brand-loc-dd');
        if (dd && w && e.target !== w && !dd.contains(e.target)) dd.style.display = 'none';
      });
    }
  }

  // Brands are NOT venues — hide the venue-only fields (venue category, timezone, area, address,
  // hours, map pin, bookings). The brand's Product type + "Where it's sold" live in the brand section.
  function _pfField(id) { var e = document.getElementById(id); return (e && e.closest) ? e.closest('.field') : null; }
  function applyBrandFieldMode(on) {
    var catF = _pfField('pf-category'); if (catF) catF.style.display = on ? 'none' : '';
    ['pf-timezone', 'pf-area', 'pf-address'].forEach(function (id) { var f = _pfField(id); if (f) f.style.display = on ? 'none' : ''; });
    var hg = document.getElementById('hours-grid'); var hs = (hg && hg.closest) ? hg.closest('.form-section') : null; if (hs) hs.style.display = on ? 'none' : '';
    ['pf-extras-loc', 'pf-extras-booking'].forEach(function (id) { var el = document.getElementById(id); if (el) el.style.display = on ? 'none' : ''; });
    // Brand mode: the Activities tab becomes Products — relabel the tab and swap its content.
    try { injectProductsEditor(); } catch (e) {}
    var actTab = document.querySelector('.pf-tab[data-pftab="activities"]');
    if (actTab) actTab.innerHTML = on ? '<span class="ms">sell</span> Products' : '<span class="ms">fitness_center</span> Activities';
    var actInp = document.getElementById('pf-act-input'); var actField = (actInp && actInp.closest) ? actInp.closest('.field') : null;
    if (actField) actField.style.display = on ? 'none' : '';
    var pw = document.getElementById('pf-products-wrap'); if (pw) pw.style.display = on ? '' : 'none';
    if (on) loadBrandProducts();
  }

  async function setBrand(on) {
    var body = document.getElementById('pf-brand-body'); if (body) body.style.display = on ? '' : 'none';
    applyBrandFieldMode(on);
    _brand.is_brand = on;
    try {
      await window.supabase.rpc('provider_set_is_brand', { p_provider: window.FFP_PROVIDER.id, p_on: on });
      if (on) loadBrandLocs();
      toast(on ? 'Brand mode on — add where you’re sold' : 'Brand mode off', 'success');
    } catch (e) { console.error('[Brand] set:', e); toast('Could not update brand mode', 'error'); }
  }

  async function loadBrandState() {
    try {
      var r = await window.supabase.from('providers').select('is_brand, category').eq('id', window.FFP_PROVIDER.id).maybeSingle();
      var on = !!(r.data && r.data.is_brand);
      _brand.is_brand = on;
      var cb = document.getElementById('pf-is-brand'); if (cb) cb.checked = on;
      var body = document.getElementById('pf-brand-body'); if (body) body.style.display = on ? '' : 'none';
      applyBrandFieldMode(on);
      _brand.category = (r.data && r.data.category) || '';
      var cs = document.getElementById('pf-brand-cat'); if (cs && _brand.category) cs.value = _brand.category;
      if (on) loadBrandLocs();
    } catch (e) { console.error('[Brand] state:', e); }
  }
  async function loadBrandCatOptions() {
    var sel = document.getElementById('pf-brand-cat'); if (!sel) return;
    try {
      var r = await window.supabase.from('taxonomy_items').select('label').eq('list_key', 'brand_category').eq('active', true).order('sort_order', { ascending: true });
      var items = Array.isArray(r.data) ? r.data : [];
      sel.innerHTML = '<option value="">Choose a product type…</option>' + items.map(function (it) { return '<option value="' + escText(it.label) + '">' + escText(it.label) + '</option>'; }).join('');
      if (_brand.category) sel.value = _brand.category;
    } catch (e) { console.error('[Brand] cat options:', e); }
  }
  async function setBrandCategory(v) {
    _brand.category = v || '';
    try { await window.supabase.rpc('provider_set_brand_category', { p_provider: window.FFP_PROVIDER.id, p_category: v || null }); toast('Product type saved', 'success'); }
    catch (e) { console.error('[Brand] set category:', e); toast('Could not save product type', 'error'); }
  }

  async function loadBrandLocs() {
    try {
      var r = await window.supabase.rpc('brand_locations_list', { p_provider: window.FFP_PROVIDER.id });
      _brand.locs = Array.isArray(r.data) ? r.data : [];
      renderBrandLocs();
    } catch (e) { console.error('[Brand] list:', e); }
  }
  function renderBrandLocs() {
    var host = document.getElementById('pf-brand-locs'); if (!host) return;
    if (!_brand.locs.length) { host.innerHTML = '<span class="pf-loc-status">No stockists yet — search above to add where you’re sold.</span>'; return; }
    host.innerHTML = _brand.locs.map(function (l) {
      var sub = [l.area, l.city, l.region, l.country].filter(Boolean).slice(0, 2).join(', ');
      return '<div class="pf-stockist"><div class="tx"><b>' + escText(l.label || l.city || 'Stockist') + '</b><span>' + escText(sub) + '</span></div>' +
             '<button type="button" onclick="__pfBrandRemove(&quot;' + l.id + '&quot;)">Remove</button></div>';
    }).join('');
  }
  window.__pfBrandRemove = async function (id) {
    try { await window.supabase.rpc('brand_location_remove', { p_id: id }); _brand.locs = _brand.locs.filter(function (l) { return l.id !== id; }); renderBrandLocs(); }
    catch (e) { console.error('[Brand] remove:', e); toast('Could not remove', 'error'); }
  };

  function brandLocSuggest(term) {
    term = (term || '').trim();
    var dd = document.getElementById('pf-brand-loc-dd'); if (!dd) return;
    if (term.length < 2) { dd.style.display = 'none'; return; }
    clearTimeout(_brandSugT);
    _brandSugT = setTimeout(async function () {
      try {
        var res = await fetch(GEO_API + '/api/places/suggest?q=' + encodeURIComponent(term) + '&session=' + _brand.sess);
        var j = await res.json();
        var items = (j && j.suggestions) || [];
        if (!items.length) { dd.innerHTML = '<div class="pf-loc-item" style="color:#8a99a8;cursor:default;">No matches</div>'; dd.style.display = 'block'; return; }
        dd.innerHTML = items.slice(0, 8).map(function (s) {
          return '<div class="pf-loc-item" data-pid="' + escText(s.place_id || '') + '" data-main="' + escText(s.main || '').replace(/"/g, '&quot;') + '">' +
                 escText(s.main || '') + (s.secondary ? '<small>' + escText(s.secondary) + '</small>' : '') + '</div>';
        }).join('');
        dd.style.display = 'block';
        Array.prototype.forEach.call(dd.querySelectorAll('.pf-loc-item[data-pid]'), function (el) {
          el.onclick = function () { brandLocPick(el.getAttribute('data-pid'), el.getAttribute('data-main')); };
        });
      } catch (e) { console.error('[Brand] suggest:', e); }
    }, 220);
  }
  async function brandLocPick(pid, main) {
    var dd = document.getElementById('pf-brand-loc-dd'); if (dd) dd.style.display = 'none';
    var inp = document.getElementById('pf-brand-loc-input'); if (inp) inp.value = '';
    if (!pid) return;
    try {
      var res = await fetch(GEO_API + '/api/places/details?place_id=' + encodeURIComponent(pid) + '&session=' + _brand.sess);
      var j = await res.json(); var c = (j && j.components) || {};
      await window.supabase.rpc('brand_location_add', {
        p_provider: window.FFP_PROVIDER.id,
        p_label: j.name || main || c.city || 'Stockist',
        p_city: c.city || null, p_area: c.area || null, p_region: c.region || null, p_country: c.country || null,
        p_lat: (j.lat != null ? Number(j.lat) : null), p_lng: (j.lng != null ? Number(j.lng) : null)
      });
      loadBrandLocs();
      toast('Stockist added', 'success');
    } catch (e) { console.error('[Brand] add:', e); toast('Could not add location', 'error'); }
  }

  // ─── Init ───
  async function init() {
    var ok = await waitFor(function () {
      return window.supabase && window.supabase.auth &&
             typeof window.loadProfile === 'function' &&
             typeof providerProfile !== 'undefined';
    }, 15000);
    if (!ok) { console.error('[FFP Provider Profile] dependencies never loaded'); return; }

    var authed = await waitFor(function () { return !!(window.FFP_PROVIDER && window.FFP_PROVIDER.id); }, 30000);
    if (!authed) { console.warn('[FFP Provider Profile] FFP_PROVIDER not set — provider not authenticated yet'); return; }

    injectStyles();
    try { refineUI(); } catch (e) { console.error('[Profile] refineUI:', e); }

    // 1) LOAD THE PROFILE FIRST — the core form MUST always populate, even if an add-on below errors.
    //    Retry a few times on a transient null (auth/session may have only just settled) so the form can
    //    NEVER render its empty "0% / Your business" state when the account actually has data.
    var real = null;
    for (var attempt = 0; attempt < 3 && !real; attempt++) {
      if (attempt > 0) await new Promise(function (r) { setTimeout(r, 700); });
      try { real = await fetchProfile(); } catch (e) { console.error('[Profile] fetchProfile #' + attempt + ':', e); }
    }

    try {
      if (real) {
        Object.assign(providerProfile, real);
        // Sidebar foot — show the partner LOGO (or initial) as soon as the profile loads on boot.
        (function () {
          var sbName = document.getElementById('sb-foot-name'); var sbMark = document.getElementById('sb-foot-mark');
          if (sbName) sbName.textContent = real.business_name || 'Your business';
          if (sbMark) {
            if (real.logo_url) { sbMark.innerHTML = '<img src="' + real.logo_url + '" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:9px;display:block;">'; sbMark.style.background = 'transparent'; }
            else { sbMark.textContent = real.letter_mark || 'P'; sbMark.style.background = ''; }
          }
        })();
        // Profile data is now loaded — refresh the "listings hidden until profile complete" banner
        // in case the partner is already sitting on a listing panel (Events/Experiences/etc.).
        if (typeof window.refreshListingGate === 'function') { try { window.refreshListingGate(); } catch (e) {} }
        // If user is on the profile panel, repaint
        var profilePanel = document.getElementById('panel-profile');
        if (profilePanel && profilePanel.classList.contains('active')) {
          try { window.loadProfile(); } catch (e) {}
          // After loadProfile, refresh picker labels (selects got new values)
          ['pf-category', 'pf-phone-cc', 'pf-timezone', 'pf-currency'].forEach(function (id) {
            var s = document.getElementById(id);
            if (s) refreshPickerLabel(s);
          });
        }
        console.log('[FFP Provider Profile v2] Loaded from Supabase \u2713');
      }
    } catch (e) {
      console.error('[FFP Provider Profile] load:', e);
      toast('Could not load profile', 'error');
    }

    // 2) ADD-ONS — activities picker, brand section, map/booking fields. Each guarded so a failure can
    //    NEVER block the profile load above (an add-on throwing was the cause of the blank "0%" screen).
    try { injectProviderExtras(); } catch (e) { console.error('[Profile] injectProviderExtras:', e); }
    try { injectBrandSection(); } catch (e) { console.error('[Profile] injectBrandSection:', e); }
    try { loadBrandState(); } catch (e) { console.error('[Profile] loadBrandState:', e); }
    if (real) { try { populateProviderExtras(real); } catch (e) { console.error('[Profile] populateProviderExtras:', e); } }
    try { ['pf-category', 'pf-phone-cc', 'pf-timezone', 'pf-currency'].forEach(function (id) { var s = document.getElementById(id); if (s) refreshPickerLabel(s); }); } catch (e) {}

    // Override saveProfile to write to Supabase
    window.saveProfile = realSaveProfile;

    // Re-run UI refinements after the dashboard calls loadProfile() (panel switch)
    var origLoadProfile = window.loadProfile;
    window.loadProfile = function () {
      try { origLoadProfile(); } catch (e) {}
      refineUI();
      ['pf-category', 'pf-phone-cc', 'pf-timezone', 'pf-currency'].forEach(function (id) {
        var s = document.getElementById(id);
        if (s) refreshPickerLabel(s);
      });
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
