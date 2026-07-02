/* FFP Provider Profile Loader — v15
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

  var PROVIDER_TYPES = [
    'Single location',
    'Multi-location',
    'Remote / Online',
    'Event organizer'
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
      '.ffp-pp-pick-input{width:100%;box-sizing:border-box;background:rgba(25,128,173,0.06);border:1px solid rgba(25,128,173,0.30);border-radius:6px;color:#0e2531;padding:8px 10px;font-size:13px;font-family:inherit;outline:none;}',
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

    // Replace provider type options
    var typeSel = document.getElementById('pf-type');
    if (typeSel) {
      var currentT = typeSel.value;
      typeSel.innerHTML = '<option value="">Choose type</option>' +
        PROVIDER_TYPES.map(function (t) { return '<option value="' + escText(t) + '">' + escText(t) + '</option>'; }).join('');
      if (currentT) typeSel.value = currentT;
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
    wrapSelectAsPicker('pf-type',      'Choose type');
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
        html += '<div class="ffp-pp-pick-search"><input type="text" class="ffp-pp-pick-input" placeholder="Search…" value="' + escText(filter || '') + '"></div>';
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
      .select('id, business_name, letter_mark, category, provider_type, country, city, area, address, contact_email, contact_phone, website, instagram, about, logo_url, hero_photo_url, status, activities, latitude, longitude, maps_url, passport_discount_pct, timezone, currency')
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
      status:        p.status,
      verified:      p.status === 'approved',
      logo_url:      p.logo_url || null,
      hero_url:      p.hero_photo_url || null,
      activities:    Array.isArray(p.activities) ? p.activities : [],
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
    var category     = document.getElementById('pf-category').value;
    var providerType = document.getElementById('pf-type').value;
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
          provider_type:  providerType || null,
          timezone:       timezone || null,
          currency:       currency || null,
          city:           city,
          country:        country || null,
          area:           area || null,
          address:        address || null,
          contact_phone:  phone || null,
          website:        website || null,
          about:          about || null,
          logo_url:       logoUrl,
          hero_photo_url: heroUrl,
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
        providerProfile.provider_type = providerType;
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
  var _provExtras = { activities: [], lat: null, lng: null, mapsUrl: '' };
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
    _actsAll = ((window.FFP_TAX && window.FFP_TAX.activities) || []).map(function (a) { return (a && a.n) ? a.n : a; });

    var f1 = document.createElement('div'); f1.className = 'field full'; f1.id = 'pf-extras-acts';
    f1.innerHTML =
      '<div class="label">Activities we offer <span class="label-hint">— what members pick when they check in here</span></div>' +
      '<div class="pf-extras-add">' +
        '<div class="pf-ac-wrap">' +
          '<input id="pf-act-input" class="input" autocomplete="off" placeholder="Search activities…">' +
          '<div id="pf-act-dd" class="pf-ac-dd" style="display:none;"></div>' +
        '</div>' +
        '<button type="button" id="pf-act-add" class="pf-extras-btn">Add</button>' +
      '</div>' +
      '<div id="pf-act-chips" class="pf-chips"></div>';
    var f2 = document.createElement('div'); f2.className = 'field full'; f2.id = 'pf-extras-loc';
    f2.innerHTML =
      '<div class="label">Google Maps link <span class="label-hint">— sets your check-in pin + gives members Directions</span></div>' +
      '<div class="pf-extras-add"><input id="pf-maps-url" class="input" placeholder="Paste your Google Maps link (any format)"><button type="button" id="pf-loc-btn" class="pf-extras-btn">Find pin</button></div>' +
      '<span id="pf-loc-status" class="pf-loc-status">No location set</span>';

    // v11: tabbed profile — Activities (f1) lives in the Activities tab (#pf-activities-host);
    // the Google Maps link (f2) is venue location, so it sits in Business info after Address.
    var host = document.getElementById('pf-activities-host');
    if (host) { host.appendChild(f1); }
    var addr = document.getElementById('pf-address');
    var addrField = (addr && addr.closest) ? addr.closest('.field') : null;
    if (addrField && addrField.parentNode) {
      addrField.parentNode.insertBefore(f2, addrField.nextSibling);
      if (!host) addrField.parentNode.insertBefore(f1, addrField.nextSibling);   // fallback: old layout
    } else {
      var saveBtn = panel.querySelector('.btn-pri');
      var anchor = saveBtn ? (saveBtn.closest('.form-actions') || saveBtn) : null;
      if (anchor && anchor.parentNode) { if (!host) anchor.parentNode.insertBefore(f1, anchor); anchor.parentNode.insertBefore(f2, anchor); }
      else { if (!host) panel.appendChild(f1); panel.appendChild(f2); }
    }
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
    // allow adding a custom activity that isn't in the list
    var exact = _actsAll.some(function (a) { return a.toLowerCase() === f; });
    if (f && !exact) {
      html += '<div class="pf-ac-item" onclick="__pfAddAct(&quot;' + escText(filter.trim()).replace(/"/g, '') + '&quot;)"><span>Add “' + escText(filter.trim()) + '”</span><span class="pf-ac-add">custom</span></div>';
    }
    dd.innerHTML = html || '<div class="pf-ac-empty">No matching activities.</div>';
    dd.style.display = 'block';
  }
  window.__pfAddAct = function (v) {
    v = (v || '').trim(); if (!v) return;
    if (!_provExtras.activities.some(function (a) { return a.toLowerCase() === v.toLowerCase(); })) _provExtras.activities.push(v);
    var inp = document.getElementById('pf-act-input'); if (inp) { inp.value = ''; inp.focus(); }
    renderActChips(); renderActDropdown('');
  };
  function addAct() {
    var inp = document.getElementById('pf-act-input'); if (!inp) return;
    var v = (inp.value || '').trim(); if (!v) { hideActDropdown(); return; }
    window.__pfAddAct(v);
  }
  window.__pfRemoveAct = function (v) { _provExtras.activities = _provExtras.activities.filter(function (a) { return a !== v; }); renderActChips(); };
  function renderActChips() {
    var c = document.getElementById('pf-act-chips'); if (!c) return;
    c.innerHTML = _provExtras.activities.length
      ? _provExtras.activities.map(function (a) { return '<span class="pf-chip">' + escText(a) + '<button type="button" onclick="__pfRemoveAct(&quot;' + escText(a).replace(/"/g, '') + '&quot;)">&times;</button></span>'; }).join('')
      : '<span class="pf-loc-status">None yet — add the activities members can do here.</span>';
    // Keep providerProfile.activities live so the profile-completion % + the "listings hidden" banner
    // update the moment a partner adds/removes an activity (activity is a completion essential).
    if (typeof providerProfile !== 'undefined') providerProfile.activities = _provExtras.activities.slice();
    if (typeof window.renderProfileCompletion === 'function') { try { window.renderProfileCompletion(); } catch (e) {} }
  }
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
    _provExtras.lat = (profile.latitude != null) ? profile.latitude : null;
    _provExtras.lng = (profile.longitude != null) ? profile.longitude : null;
    _provExtras.mapsUrl = profile.maps_url || '';
    renderActChips();
    var mu = document.getElementById('pf-maps-url'); if (mu) mu.value = _provExtras.mapsUrl;
    var st = document.getElementById('pf-loc-status');
    if (st) st.textContent = (_provExtras.lat != null && _provExtras.lng != null)
      ? ('✓ Pin set (' + _provExtras.lat + ', ' + _provExtras.lng + ')')
      : (_provExtras.mapsUrl ? 'Link saved — tap “Find pin” to set the pin' : 'No location set');
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

    // Refine UI as soon as the profile panel exists in the DOM
    refineUI();
    injectProviderExtras();

    try {
      var real = await fetchProfile();
      if (real) {
        Object.assign(providerProfile, real);
        populateProviderExtras(real);
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
          ['pf-category', 'pf-type', 'pf-phone-cc', 'pf-timezone', 'pf-currency'].forEach(function (id) {
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

    // Override saveProfile to write to Supabase
    window.saveProfile = realSaveProfile;

    // Re-run UI refinements after the dashboard calls loadProfile() (panel switch)
    var origLoadProfile = window.loadProfile;
    window.loadProfile = function () {
      try { origLoadProfile(); } catch (e) {}
      refineUI();
      ['pf-category', 'pf-type', 'pf-phone-cc', 'pf-timezone', 'pf-currency'].forEach(function (id) {
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
