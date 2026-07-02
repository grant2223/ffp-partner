/* FFP Provider TOURS Loader (the `classes` table — ONE-OFF TOURS ONLY; Sessions/Classes are a SEPARATE tab) — v8 (2026-06-12)
   v8: FEATURE button on each tour card (window.featureBtn → applyFeature; $99/mo apply → admin approve). fetch +featured.
   v7: TOURS NEED APPROVAL — a new tour is submitted for review (status 'pending' via provider_set_listing_status)
       instead of self-publishing; removed the partner "Go live"/"Unpublish" buttons (admin approves now); cards
       show "Pending admin review"; modal button = "Submit for review". Admin approves in the new admin Tours tab.
   v6: CLEAN SEPARATION — removed the listing_subtype crossover entirely. Tours and Sessions are separate things in
       separate storage: this module = TOURS only (classes table); Sessions/Classes live in their own Sessions tab
       (provider_sessions). A Tour is bookable via its date (class_sessions; members book item_type='class_session').
       Kept the date capture; dropped the subtype field, the Tours/Classes toggle and the Class routing.
   v4: TOURS-ONLY — this module is now the partner "Tours" tab (one-off activities: jet ski, bungy, canyoning).
       Recurring CLASSES moved to the Sessions tab (provider_sessions). Default listing_subtype='tour'; all
       user-facing copy/toasts say "tour"; empty state → New tour.
   v3: CLASS vs TOUR — openClassModal(id, newSubtype) tags new listings as 'class' (recurring: yoga/tennis/group
       class) or 'tour' (one-off: jet ski/bungy/canyoning); modal title says "New class"/"New tour"/"Edit …";
       hidden #cm-subtype carries it; on save, provider_set_class_subtype persists classes.listing_subtype (the
       shared field the booking platform splits Classes vs Tours on). Cards show a Class/Tour tag; fetch includes it.
   v2: LEVELS + CITY PICKER — (1) replaced the orphan "Difficulty" box (Beginner/Intermediate/Advanced/All
       levels) with "Fitness level required" reading window.FFP_TAX.attendeeLevels (Not Tried/Social/
       Competitive/Representative/Professional + All Levels) and saving to fitness_level — the SAME connected
       scale as a member's own ability (verified provider_save_listing class branch persists fitness_level).
       (2) Country/City native dropdowns replaced with the shared searchable picker (window.FFPPicker) — the
       same component as Trips and the activity field — so every listing form looks and behaves identically.
   v1 (2026-06-12)
   The partner create/edit form for single-session classes & tours (the `classes` table, shown to members as
   "Experiences" on findfitpeople.com). Self-contained modal via openModalShell, full GetYourGuide-parity fields.
   Save: provider_save_listing kind='class' (new rows insert as DRAFT). Publish/unpublish: provider_set_listing_status.
   Delete: provider_delete_listing kind='class'. Duplicate: dashboard duplicateListing('class', id) → provider_duplicate_listing.
   Renders cards into #cls-grid (panel-classes). Lazy-loaded by ensureProviderLoader('classes'). */
(function () {
  'use strict';
  function sb() { return window.supabase; }
  function provId() { return (window.FFP_PROVIDER || {}).id; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  function toast(m, k) { if (typeof window.showToast === 'function') { try { window.showToast(m, k || 'info'); return; } catch (e) {} } console.log('[FFP Classes]', m); }
  function arrFromText(s) { return s ? String(s).split('\n').map(function (x) { return x.trim(); }).filter(function (x) { return x.length; }) : []; }
  function joinArr(a) { return (Array.isArray(a) ? a : []).join('\n'); }
  function intn(v) { return v ? (isNaN(parseInt(v, 10)) ? null : parseInt(v, 10)) : null; }
  function num(v) { return v ? (isNaN(parseFloat(v)) ? null : parseFloat(v)) : null; }

  // Fallback only — the canonical level list is window.FFP_TAX.attendeeLevels (the member ability scale +
  // "All Levels"). The form saves the chosen value to fitness_level so it connects to a member's ability.
  var FITNESS_LEVELS = ['All Levels', 'Not Tried', 'Social', 'Competitive', 'Representative', 'Professional'];

  // Gallery image URLs + the currently-loaded upcoming departures for the open modal.
  var _cmGallery = [], _cmUpcoming = [], _cmQuestions = [];

  // ── data ──
  async function fetchClasses() {
    if (!provId()) return [];
    var res = await sb().from('experiences')
      .select('id, provider_id, title, description, category, activity, venue, city, country, duration_min, capacity, price_aed, hero_image_url, gallery, schedule_rule, booking_questions, status, booking_source, highlights, what_included, what_not_included, meeting_point, meeting_lat, meeting_lng, what_to_bring, not_allowed, know_before, languages, min_age, difficulty, fitness_level, wheelchair_accessible, accessibility_notes, free_cancellation_hours, cancellation_policy, distance_km, featured, pay_requirement, created_at')
      .eq('provider_id', provId())
      .order('created_at', { ascending: false });
    if (res.error) { console.error('[FFP Classes] fetch', res.error); toast('Could not load experiences', 'error'); return []; }
    return res.data || [];
  }
  async function refresh() {
    var rows = await fetchClasses();
    if (!Array.isArray(window.classesList)) window.classesList = [];
    window.classesList.length = 0;
    rows.forEach(function (r) { window.classesList.push(r); });
    renderClasses();
    if (typeof window.renderNav === 'function') { try { window.renderNav(); } catch (e) {} }
  }

  // ── list render (TOURS only) ──
  function renderClasses() {
    var grid = document.getElementById('cls-grid');
    if (!grid) return;
    var list = Array.isArray(window.classesList) ? window.classesList : [];
    var sEl = document.getElementById('cls-search');
    var q = (sEl && sEl.value || '').trim().toLowerCase();
    var items = q ? list.filter(function (c) { return (c.title || '').toLowerCase().indexOf(q) >= 0 || (c.activity || '').toLowerCase().indexOf(q) >= 0; }) : list;
    if (!items.length) {
      if (typeof window.emptyState === 'function') {
        grid.innerHTML = list.length
          ? window.emptyState('No matches', 'Try a different search.', '', '')
          : window.emptyState('No experiences yet', 'One-off activities members book — jet ski, bungy, canyoning, a guided experience. Add your first one (with its date).', 'New experience', 'openClassModal()');
      } else {
        grid.innerHTML = '<div style="padding:40px;text-align:center;color:#13657f;">' + (list.length ? 'No matches' : 'No experiences yet') + '</div>';
      }
      return;
    }
    grid.innerHTML = items.map(classCard).join('');
  }
  function heroStyle(url) { return url ? ('style="background-image:url(\'' + esc(url) + '\')"') : ''; }
  function classCard(c) {
    var st = c.status || 'draft';
    return '<div class="listing-card">' +
      '<div class="lc-hero" ' + heroStyle(c.hero_image_url) + '>' +
        '<div class="lc-status-pill ' + esc(st) + '">' + esc(st) + '</div>' +
        (c.activity ? '<div class="lc-cat-pill">' + esc(c.activity) + '</div>' : '') +
      '</div>' +
      '<div class="lc-body">' +
        '<div class="lc-title">' + esc(c.title || 'Untitled') + '</div>' +
        '<div class="lc-sub">' + esc(c.description || '') + '</div>' +
        '<div class="lc-meta">' +
          (c.city ? '<span><span class="ms">place</span>' + esc(c.city) + '</span>' : '') +
          (c.duration_min ? '<span><span class="ms">schedule</span>' + c.duration_min + ' min</span>' : '') +
          (c.booking_source && c.booking_source !== 'native' ? '<span><span class="ms">sync</span>' + esc(c.booking_source) + '</span>' : '') +
        '</div>' +
        '<div class="lc-stat-row">' +
          '<div class="lc-stat"><div class="lc-stat-val">' + FFPCurrency.formatProvider(c.price_aed || 0) + '</div><div class="lc-stat-lbl">Per person</div></div>' +
          '<div class="lc-stat"><div class="lc-stat-val">' + (c.capacity || 0) + '</div><div class="lc-stat-lbl">Capacity</div></div>' +
          '<div class="lc-stat"><div class="lc-stat-val">' + (c.min_age || '—') + '</div><div class="lc-stat-lbl">Min age</div></div>' +
        '</div>' +
      '</div>' +
      '<div class="lc-actions">' +
        '<button class="btn btn-sec btn-sm" title="Edit" onclick="openClassModal(\'' + c.id + '\')"><span class="ms">edit</span></button>' +
        (st === 'pending' ? '<span class="lc-review-note" style="font-size:12px;color:var(--ffp-warn);align-self:center;"><span class="ms" style="font-size:15px;vertical-align:-2px;">schedule</span> Pending admin review</span>' : '') +
        (typeof window.featureBtn === 'function' ? window.featureBtn('class', c.id, c.featured) : '') +
        '<button class="btn btn-sec btn-sm" title="Bookings &amp; guest details" onclick="openClassBookings(\'' + c.id + '\')"><span class="ms">groups</span></button>' +
        '<button class="btn btn-ghost btn-sm" title="Duplicate" onclick="duplicateListing(\'class\',\'' + c.id + '\')"><span class="ms">content_copy</span></button>' +
        '<button class="btn btn-ghost btn-sm" title="Delete" onclick="confirmDeleteClass(\'' + c.id + '\')"><span class="ms">delete</span></button>' +
      '</div>' +
    '</div>';
  }

  // ── modal (create / edit) ──
  function openClassModal(id) {
    var c = (id && Array.isArray(window.classesList)) ? window.classesList.find(function (x) { return x.id === id; }) : null;
    var e = c || {};
    var ll = (e.meeting_lat != null && e.meeting_lng != null) ? (e.meeting_lat + ', ' + e.meeting_lng) : '';
    var TAX = window.FFP_TAX || {};
    var cities = TAX.cities || {};
    var countries = Object.keys(cities).sort();
    var selCountry = e.country || (window.providerProfile || {}).country || 'United Arab Emirates';
    if (countries.length && countries.indexOf(selCountry) === -1) selCountry = countries[0];

    var body =
      '<div id="cl-stepbar" style="font-size:11px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;color:var(--ffp-purple,#8b5cf6);margin:0 0 12px;">Step 1 of 3 · Details</div>' +
      '<div id="cl-step1">' +
      '<div class="form-section"><div class="form-section-title">Photos <span class="label-hint" style="text-transform:none;letter-spacing:0;font-weight:600;">— drag to reorder; the first photo is the cover shown on the card</span></div>' +
        '<div id="cm-gallery" style="display:flex;flex-wrap:wrap;gap:10px;"></div>' +
        '<button type="button" class="btn btn-ghost btn-sm" style="margin-top:10px;" onclick="cmAddGalleryImage()"><span class="ms">add_photo_alternate</span> Add photo</button>' +
      '</div>' +
      '<div class="form-section"><div class="form-section-title">Basics</div><div class="form-grid">' +
        '<div class="field full"><div class="label">Title <span class="req">*</span></div>' +
          '<input class="input" id="cm-title" value="' + esc(e.title || '') + '" placeholder="e.g. Sunset Kayak Tour"></div>' +
        '<div class="field full"><div class="label">Short description</div>' +
          '<input class="input" id="cm-description" value="' + esc(e.description || '') + '" placeholder="One-sentence summary members see on the card"></div>' +
        '<div class="field"><div class="label">Activity <span class="req">*</span></div>' +
          '<button type="button" class="ffp-picker-btn placeholder" id="cm-activity-btn" data-value="" data-category=""><span>Choose activity…</span><span class="ms caret">expand_more</span></button></div>' +
        '<div class="field"><div class="label">Fitness level <span class="label-hint">— optional</span></div>' +
          '<select class="select" id="cm-fitness-level">' + ((window.FFP_TAX && window.FFP_TAX.attendeeLevels && window.FFP_TAX.attendeeLevels.length) ? window.FFP_TAX.attendeeLevels : FITNESS_LEVELS).map(function (d) { return '<option' + (((e.fitness_level || 'All Levels') === d) ? ' selected' : '') + '>' + d + '</option>'; }).join('') + '</select></div>' +
      '</div></div>' +
      '<div class="form-section"><div class="form-section-title">When &amp; where</div><div class="form-grid">' +
        '<div class="field"><div class="label">Country <span class="req">*</span></div>' +
          '<button type="button" class="ffp-picker-btn placeholder" id="cm-country-btn" data-value=""><span>Choose country…</span><span class="ms caret">expand_more</span></button></div>' +
        '<div class="field"><div class="label">City</div>' +
          '<button type="button" class="ffp-picker-btn placeholder" id="cm-city-btn" data-value="" data-country=""><span>Choose city…</span><span class="ms caret">expand_more</span></button></div>' +
        '<div class="field"><div class="label">Venue</div><input class="input" id="cm-venue" value="' + esc(e.venue || '') + '" placeholder="e.g. Kite Beach"></div>' +
        '<div class="field"><div class="label">Duration (min)</div><input class="input" type="number" id="cm-duration" value="' + esc(e.duration_min || '') + '" placeholder="e.g. 60"></div>' +
        '<div class="field"><div class="label">Price per person (' + FFPCurrency.providerCode() + ') <span class="req">*</span></div><input class="input" type="number" id="cm-price" value="' + esc(e.price_aed != null ? e.price_aed : '') + '" placeholder="e.g. 150"></div>' +
        '<div class="field full"><label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer;background:rgba(10,62,68,0.05);border:1px solid var(--ffp-border-mid,#dbe3ea);border-radius:10px;padding:11px 13px;">' +
          '<input type="checkbox" id="cm-allow-unpaid"' + (e.pay_requirement === 'optional' ? ' checked' : '') + ' style="width:18px;height:18px;margin-top:1px;flex:0 0 auto;cursor:pointer;">' +
          '<span style="font-size:12px;color:var(--ffp-text,#0e2531);font-weight:700;">Allow booking without upfront payment <span style="display:block;font-weight:500;color:var(--ffp-text-dim,#6c7f90);margin-top:2px;">By default a paid Experience must be paid for before it’s confirmed. Tick this to let members book and settle with you directly (cash / off-platform).</span></span>' +
        '</label></div>' +
        '<div class="field full"><div class="label">Location pin <span class="label-hint">— paste a Google Maps link; we’ll set the pin so members get directions</span></div>' +
          '<div style="display:flex;gap:8px;align-items:center;">' +
            '<input class="input" id="cm-maps-url" placeholder="Paste your Google Maps link (any format)" style="flex:1;min-width:0;">' +
            '<button type="button" class="btn btn-ghost" style="flex:0 0 auto;" onclick="resolveClassMapsLink()"><span class="ms" style="font-size:16px;vertical-align:-3px;">place</span> Find pin</button>' +
          '</div>' +
          '<span id="cm-loc-status" class="psub" style="display:block;margin-top:6px;">' + ((e.meeting_lat != null && e.meeting_lng != null) ? ('✓ Pin set (' + Number(e.meeting_lat).toFixed(5) + ', ' + Number(e.meeting_lng).toFixed(5) + ')') : 'No pin set') + '</span>' +
          '<input type="hidden" id="cm-lat" value="' + esc(e.meeting_lat != null ? e.meeting_lat : '') + '">' +
          '<input type="hidden" id="cm-lng" value="' + esc(e.meeting_lng != null ? e.meeting_lng : '') + '">' +
        '</div>' +
      '</div></div>' +
      '</div>' /* /cl-step1 */ +
      '<div id="cl-step2" style="display:none;">' +
      '<div class="form-section"><div class="form-section-title">Details</div><div class="form-grid">' +
        '<div class="field full"><div class="label">Highlights <span class="label-hint">— one per line</span></div><textarea class="textarea" id="cm-highlights" rows="3" placeholder="Eiffel-tower views\nAudio guide in 14 languages\nSmall group">' + esc(joinArr(e.highlights)) + '</textarea></div>' +
        '<div class="field full"><div class="label">What\'s included <span class="label-hint">— one per line</span></div><textarea class="textarea" id="cm-includes" rows="3" placeholder="Kayak &amp; paddle\nLife vest\nLocal guide">' + esc(joinArr(e.what_included)) + '</textarea></div>' +
        '<div class="field full"><div class="label">What\'s NOT included <span class="label-hint">— one per line</span></div><textarea class="textarea" id="cm-excludes" rows="2" placeholder="Hotel pickup\nGratuities">' + esc(joinArr(e.what_not_included)) + '</textarea></div>' +
        '<div class="field full"><div class="label">What to bring <span class="label-hint">— one per line</span></div><textarea class="textarea" id="cm-bring" rows="2" placeholder="Swimwear\nTowel\nWater">' + esc(joinArr(e.what_to_bring)) + '</textarea></div>' +
      '</div></div>' +
      '<div class="form-section"><div class="form-section-title">Good to know</div><div class="form-grid">' +
        '<div class="field full"><div class="label">Meeting point</div><input class="input" id="cm-meeting-point" value="' + esc(e.meeting_point || '') + '" placeholder="e.g. Pier 3, by the Bateaux Parisiens sign"></div>' +
        '<div class="field"><div class="label">Minimum age</div><input class="input" type="number" id="cm-min-age" value="' + esc(e.min_age || '') + '" placeholder="e.g. 12"></div>' +
        '<div class="field"><div class="label">Languages <span class="label-hint">— one per line</span></div><textarea class="textarea" id="cm-languages" rows="2" placeholder="English\nArabic">' + esc(joinArr(e.languages)) + '</textarea></div>' +
        '<div class="field"><div class="label">Distance (km) <span class="label-hint">— optional</span></div><input class="input" type="number" id="cm-distance" value="' + esc(e.distance_km || '') + '" placeholder="e.g. 4"></div>' +
        '<div class="field full"><div class="label">Not allowed <span class="label-hint">— one per line</span></div><textarea class="textarea" id="cm-not-allowed" rows="2" placeholder="Oversized luggage\nPets (assistance dogs OK)">' + esc(joinArr(e.not_allowed)) + '</textarea></div>' +
        '<div class="field full"><div class="label">Know before you go <span class="label-hint">— one per line</span></div><textarea class="textarea" id="cm-know-before" rows="2" placeholder="Departures every 30 min\nArrive 15 min early">' + esc(joinArr(e.know_before)) + '</textarea></div>' +
        '<div class="field"><div class="label">Wheelchair accessible</div><select class="select" id="cm-wheelchair"><option value="">—</option><option value="true"' + (e.wheelchair_accessible === true ? ' selected' : '') + '>Yes</option><option value="false"' + (e.wheelchair_accessible === false ? ' selected' : '') + '>No</option></select></div>' +
        '<div class="field"><div class="label">Free cancellation <span class="label-hint">— hours before</span></div><input class="input" type="number" id="cm-cancel-hours" value="' + esc(e.free_cancellation_hours || '') + '" placeholder="e.g. 24"></div>' +
        '<div class="field full"><div class="label">Accessibility notes</div><input class="input" id="cm-accessibility" value="' + esc(e.accessibility_notes || '') + '" placeholder="e.g. Step-free boarding; accessible WC"></div>' +
        '<div class="field full"><div class="label">Cancellation policy</div><input class="input" id="cm-cancel-policy" value="' + esc(e.cancellation_policy || '') + '" placeholder="e.g. Free cancellation up to 24h before"></div>' +
      '</div></div>' +
      '<div class="form-section"><div class="form-section-title">Booking questions <span class="label-hint" style="text-transform:none;letter-spacing:0;font-weight:600;">— extra info collected when members book (e.g. helmet size). Leave empty for none.</span></div>' +
        '<div id="cm-questions"></div>' +
        '<button type="button" class="btn btn-ghost btn-sm" style="margin-top:10px;" onclick="cmAddQuestion()"><span class="ms">add</span> Add a question</button>' +
      '</div>' +
      '</div>' /* /cl-step2 */ +
      '<div id="cl-step3" style="display:none;">' +
      '<div class="form-section"><div class="form-section-title">Availability pattern</div>' +
        '<div class="psub" style="margin:-4px 0 12px;">Pick the days and departure times this runs — we create the bookable slots automatically. ' + (window.FFPTime ? 'Times in ' + esc(window.FFPTime.tz().replace(/_/g, " ")) + '.' : '') + '</div>' +
        '<div class="form-grid">' +
          '<div class="field full"><div class="label">Days of the week</div>' +
            '<div id="cm-sched-days" style="display:flex;gap:6px;flex-wrap:wrap;">' +
              ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(function (dn, ix) { return '<button type="button" class="cm-day" data-dow="' + ix + '" data-on="0" onclick="cmToggleDay(this)" style="padding:8px 13px;border-radius:999px;border:1px solid var(--ffp-border-mid);background:transparent;color:var(--ffp-text-muted);font-size:13px;font-weight:700;cursor:pointer;">' + dn + '</button>'; }).join('') +
            '</div>' +
          '</div>' +
          '<div class="field full"><div class="label">Departure times</div>' +
            '<div id="cm-sched-times" style="display:flex;flex-wrap:wrap;gap:8px;"></div>' +
            '<button type="button" class="btn btn-ghost btn-sm" style="margin-top:8px;" onclick="cmAddTime()"><span class="ms">add</span> Add a time</button>' +
          '</div>' +
          '<div class="field"><div class="label">Capacity per departure</div><input class="input" type="number" id="cm-capacity" value="' + esc(e.capacity || '') + '" placeholder="e.g. 8"></div>' +
          '<div class="field"><div class="label">Start date</div><input class="input" type="date" id="cm-sched-start" style="color-scheme:light;"></div>' +
          '<div class="field"><div class="label">End date <span class="label-hint">— optional</span></div><input class="input" type="date" id="cm-sched-end" style="color-scheme:light;" disabled></div>' +
          '<div class="field full"><label style="display:flex;gap:8px;align-items:flex-start;cursor:pointer;font-size:13px;color:var(--ffp-text);"><input type="checkbox" id="cm-sched-ongoing" checked onchange="cmToggleOngoing()" style="margin-top:2px;flex:0 0 auto;"><span>Keep this running — automatically stays bookable a year ahead (recommended). Untick to set a fixed end date.</span></label></div>' +
        '</div>' +
      '</div>' +
      '<div class="form-section"><div class="form-section-title">Scheduled departures</div>' +
        '<div class="psub" style="margin:-4px 0 10px;">Manage individual departures — cancel a trip, close a whole day, or see who\'s booked.</div>' +
        '<div id="cm-upcoming"></div>' +
      '</div>' +
      '</div>' /* /cl-step3 */;

    var foot =
      (c ? '<button class="btn btn-ghost left" id="cl-del" style="display:none;" onclick="confirmDeleteClass(\'' + c.id + '\')"><span class="ms">delete</span> Delete</button>' : '') +
      '<button class="btn btn-ghost" id="cl-cancel" onclick="closeModal()">Cancel</button>' +
      '<button class="btn btn-ghost" id="cl-back" style="display:none;" onclick="clBack()"><span class="ms">chevron_left</span> Back</button>' +
      '<button class="btn btn-pri" id="cl-next" onclick="clNext()">Next <span class="ms" style="font-size:16px;vertical-align:-3px;">chevron_right</span></button>' +
      '<button class="btn btn-pri" id="cl-save" style="display:none;" onclick="saveClass(\'' + (c ? c.id : '') + '\')">' + (c ? 'Save changes' : 'Submit for review') + '</button>';

    if (typeof window.openModalShell === 'function') window.openModalShell('full', (c ? 'Edit experience' : 'New experience'), body, foot);
    setTimeout(function () { if (window.FFPSelect) { var m = document.getElementById('modal'); if (m) window.FFPSelect.enhance(m); } }, 40);
    if (typeof window.renderListingUploader === 'function') { try { window.renderListingUploader(e.hero_image_url || ''); } catch (er) {} }

    setTimeout(function () {
      var aBtn = document.getElementById('cm-activity-btn');
      if (aBtn) {
        if (e.activity) {
          aBtn.classList.remove('placeholder'); aBtn.dataset.value = e.activity; aBtn.dataset.category = e.category || '';
          aBtn.innerHTML = '<div class="picked"><div class="name">' + esc(e.activity) + '</div>' + (e.category ? '<div class="group">' + esc(e.category) + '</div>' : '') + '</div><span class="ms caret">expand_more</span>';
        }
        aBtn.addEventListener('click', function () {
          if (window.FFPPicker && window.FFPPicker.openActivity) {
            window.FFPPicker.openActivity(aBtn.dataset.value, function (name, cat) {
              aBtn.classList.remove('placeholder'); aBtn.dataset.value = name || ''; aBtn.dataset.category = cat || '';
              aBtn.innerHTML = '<div class="picked"><div class="name">' + esc(name) + '</div>' + (cat ? '<div class="group">' + esc(cat) + '</div>' : '') + '</div><span class="ms caret">expand_more</span>';
            });
          } else { toast('Activity picker not ready', 'error'); }
        });
      }
      // Country + City — shared searchable pickers (same component as Trips & the activity field).
      var coBtn = document.getElementById('cm-country-btn');
      var ciBtn = document.getElementById('cm-city-btn');
      var setBtn = function (btn, val, ph) {
        if (!btn) return;
        btn.dataset.value = val || '';
        if (val) { btn.classList.remove('placeholder'); btn.innerHTML = '<span>' + esc(val) + '</span><span class="ms caret">expand_more</span>'; }
        else { btn.classList.add('placeholder'); btn.innerHTML = '<span>' + ph + '</span><span class="ms caret">expand_more</span>'; }
      };
      var initCountry = e.country || selCountry || '';
      if (initCountry) setBtn(coBtn, initCountry, 'Choose country…');
      if (ciBtn) ciBtn.dataset.country = initCountry;
      if (e.city) setBtn(ciBtn, e.city, 'Choose city…');
      if (coBtn) coBtn.addEventListener('click', function () {
        if (!(window.FFPPicker && window.FFPPicker.openCountry)) { toast('Picker not ready', 'error'); return; }
        window.FFPPicker.openCountry(coBtn.dataset.value, function (name) {
          setBtn(coBtn, name, 'Choose country…');
          if (ciBtn && ciBtn.dataset.country !== name) { ciBtn.dataset.country = name; setBtn(ciBtn, '', 'Choose city…'); }
        });
      });
      if (ciBtn) ciBtn.addEventListener('click', function () {
        if (!(window.FFPPicker && window.FFPPicker.openCity)) { toast('Picker not ready', 'error'); return; }
        window.FFPPicker.openCity(ciBtn.dataset.country || (coBtn ? coBtn.dataset.value : ''), ciBtn.dataset.value, function (name) { setBtn(ciBtn, name, 'Choose city…'); });
      });

      // ── Gallery ──
      _cmGallery = (Array.isArray(e.gallery) && e.gallery.length) ? e.gallery.slice() : (e.hero_image_url ? [e.hero_image_url] : []);
      window.cmRenderGallery();

      // ── Booking questions (Step 2) ──
      _cmQuestions = Array.isArray(e.booking_questions) ? e.booking_questions.slice() : [];
      window.cmRenderQuestions();

      // ── Schedule (Step 3) ──
      var todayStr = new Date().toISOString().slice(0, 10);
      var maxD = new Date(); maxD.setFullYear(maxD.getFullYear() + 1);
      var maxStr = maxD.toISOString().slice(0, 10);
      var rule = (e.schedule_rule && typeof e.schedule_rule === 'object') ? e.schedule_rule : null;
      var startEl = document.getElementById('cm-sched-start');
      var endEl = document.getElementById('cm-sched-end');
      if (startEl) { startEl.min = todayStr; startEl.max = maxStr; startEl.value = (rule && rule.start_date) ? rule.start_date : todayStr; }
      if (endEl)   { endEl.min = todayStr; endEl.max = maxStr; if (rule && rule.end_date) endEl.value = rule.end_date; }
      var ongEl = document.getElementById('cm-sched-ongoing'); if (ongEl) ongEl.checked = !(rule && rule.end_date);
      window.cmToggleOngoing();
      if (rule && Array.isArray(rule.weekdays)) {
        rule.weekdays.forEach(function (d) { var b = document.querySelector('#cm-sched-days .cm-day[data-dow="' + d + '"]'); if (b) { b.dataset.on = '1'; b.style.background = 'var(--ffp-purple,#8b5cf6)'; b.style.color = '#fff'; b.style.borderColor = 'var(--ffp-purple,#8b5cf6)'; } });
      }
      var tWrap = document.getElementById('cm-sched-times');
      if (tWrap) {
        if (rule && Array.isArray(rule.times) && rule.times.length) rule.times.forEach(function (t) { window.cmAddTime(t); });
        else if (!tWrap.children.length) window.cmAddTime();
      }
      if (rule && rule.capacity != null) { var capEl = document.getElementById('cm-capacity'); if (capEl && !capEl.value) capEl.value = rule.capacity; }

      // ── Existing departures (edit only) — cancel / reopen / delete / close-day ──
      window._cmEditId = (c && c.id) ? c.id : null;
      if (window._cmEditId) window.cmLoadUpcoming(window._cmEditId);

      window.clStep(1);
    }, 50);
  }

  // ── save / status / delete ──
  async function saveClass(id) {
    if (!provId()) { toast('Provider not loaded', 'error'); return; }
    if (window.cmSyncQuestions) { try { window.cmSyncQuestions(); } catch (e) {} }
    var g = function (k) { var el = document.getElementById('cm-' + k); return el ? (el.value || '').trim() : ''; };
    var title = g('title');
    var aBtn = document.getElementById('cm-activity-btn');
    var activity = aBtn ? aBtn.dataset.value : '';
    var category = aBtn ? aBtn.dataset.category : '';
    if (!title) { toast('Title is required', 'error'); return; }
    if (!activity) { toast('Activity is required', 'error'); return; }
    var price = g('price'); if (!price) { toast('Price is required', 'error'); return; }
    var coBtn = document.getElementById('cm-country-btn'), ciBtn = document.getElementById('cm-city-btn');
    var country = coBtn ? (coBtn.dataset.value || '') : '', city = ciBtn ? (ciBtn.dataset.value || '') : '';
    if (!country) { toast('Country is required', 'error'); return; }
    // Schedule (Step 3): recurring weekly rule. End date optional — ongoing = rolling 1yr (auto-extends daily).
    var schedDays = Array.prototype.slice.call(document.querySelectorAll('#cm-sched-days .cm-day')).filter(function (b) { return b.dataset.on === '1'; }).map(function (b) { return parseInt(b.dataset.dow, 10); });
    var schedTimes = Array.prototype.slice.call(document.querySelectorAll('#cm-sched-times .cm-time')).map(function (i) { return (i.value || '').trim(); }).filter(Boolean);
    var ongEl = document.getElementById('cm-sched-ongoing'); var schedOngoing = ongEl ? ongEl.checked : true;
    var schedStart = g('sched-start') || null; var schedEnd = schedOngoing ? null : (g('sched-end') || null);
    var hasSched = schedDays.length && schedTimes.length;
    if (hasSched && !schedOngoing && !schedEnd) { toast('Add an end date, or tick “Keep this running”', 'error'); return; }
    var heroUrl = (_cmGallery && _cmGallery.length) ? _cmGallery[0] : null;
    var mLat = null, mLng = null;
    var latEl = document.getElementById('cm-lat'), lngEl = document.getElementById('cm-lng');
    var latV = latEl ? (latEl.value || '').trim() : '', lngV = lngEl ? (lngEl.value || '').trim() : '';
    if (latV && lngV) { var a0 = parseFloat(latV), b0 = parseFloat(lngV); if (!isNaN(a0)) mLat = a0; if (!isNaN(b0)) mLng = b0; }
    else { var llv = g('latlng'); if (llv) { var pp = llv.split(','); if (pp.length >= 2) { var a = parseFloat(pp[0]), b = parseFloat(pp[1]); if (!isNaN(a)) mLat = a; if (!isNaN(b)) mLng = b; } } }
    var wheel = g('wheelchair');

    var payload = {
      title: title, description: g('description') || null, activity: activity, category: category || null,
      fitness_level: g('fitness-level') || null, country: country || null, city: city || null, venue: g('venue') || null,
      duration_min: intn(g('duration')), capacity: intn(g('capacity')), price_aed: num(price), hero_image_url: heroUrl,
      highlights: arrFromText(g('highlights')), what_included: arrFromText(g('includes')), what_not_included: arrFromText(g('excludes')),
      what_to_bring: arrFromText(g('bring')), not_allowed: arrFromText(g('not-allowed')), know_before: arrFromText(g('know-before')),
      languages: arrFromText(g('languages')), meeting_point: g('meeting-point') || null, meeting_lat: mLat, meeting_lng: mLng,
      min_age: intn(g('min-age')), distance_km: num(g('distance')), wheelchair_accessible: (wheel === '' ? null : wheel === 'true'),
      accessibility_notes: g('accessibility') || null, free_cancellation_hours: intn(g('cancel-hours')), cancellation_policy: g('cancel-policy') || null,
      pay_requirement: (document.getElementById('cm-allow-unpaid') && document.getElementById('cm-allow-unpaid').checked) ? 'optional' : 'required',
      gallery: _cmGallery
    };
    // Gate: a PAID Experience needs payment before confirmation → the partner must connect Stripe, or explicitly allow booking without upfront payment.
    var _connected = (window.FFP_PROVIDER || {}).payments_status === 'connected';
    var _allowUnpaid = !!(document.getElementById('cm-allow-unpaid') && document.getElementById('cm-allow-unpaid').checked);
    if (num(price) > 0 && !_allowUnpaid && !_connected) {
      toast('Paid Experience: connect Stripe in the Payments tab to take payment — or tick “Allow booking without upfront payment”. Members can’t book a paid listing until one of these is set.', 'error');
      return;
    }
    try {
      var res = await sb().rpc('provider_save_listing', { p_kind: 'class', p_provider: provId(), p_id: id || null, p: payload });
      if (res.error) throw res.error;
      if (!res.data) throw new Error('Save failed — not found or not permitted');
      var _cid = res.data;
      // Save booking questions (Step 2).
      try { await sb().rpc('provider_set_booking_questions', { p_provider: provId(), p_kind: 'class', p_id: _cid, p: (_cmQuestions || []) }); } catch (eq) { console.warn('[FFP Tours] questions', eq); }
      // Save the recurring schedule rule + generate slots (ongoing rule self-extends daily via cron).
      if (hasSched) {
        try {
          await sb().rpc('provider_set_class_schedule', { p_provider: provId(), p_class: _cid, p_rule: {
            weekdays: schedDays, times: schedTimes, capacity: intn(g('capacity')),
            start_date: schedStart, end_date: schedEnd
          } });
        } catch (e3) { console.warn('[FFP Tours] schedule', e3); }
      }
      // Tours require admin approval — a NEW tour is submitted for review (status 'pending').
      if (!id) { try { await sb().rpc('provider_set_listing_status', { p_kind: 'class', p_provider: provId(), p_id: res.data, p_status: 'pending' }); } catch (e5) { console.warn('[FFP Tours] submit', e5); } }
      if (typeof window.closeModal === 'function') window.closeModal();
      toast(id ? 'Saved' : 'Submitted — pending admin review (you’ll go live once approved)', 'success');
      await refresh();
    } catch (er) { console.error('[FFP Tours] save', er); toast(er.message || 'Save failed', 'error'); }
  }

  async function setClassStatus(id, status) {
    try {
      var res = await sb().rpc('provider_set_listing_status', { p_kind: 'class', p_provider: provId(), p_id: id, p_status: status });
      if (res.error) throw res.error;
      await refresh();
    } catch (er) { console.error('[FFP Tours] status', er); toast('Could not update status', 'error'); }
  }

  function confirmDeleteClass(id) {
    var doIt = async function () {
      try {
        var res = await sb().rpc('provider_delete_listing', { p_kind: 'class', p_provider: provId(), p_id: id });
        if (res.error) throw res.error;
        toast('Experience deleted', 'success');
        if (typeof window.closeModal === 'function') window.closeModal();
        await refresh();
      } catch (er) { console.error('[FFP Classes] delete', er); toast('Delete failed', 'error'); }
    };
    if (typeof window.openConfirm === 'function') window.openConfirm('Delete this experience?', 'This cannot be undone.', doIt);
    else if (confirm('Delete this experience?')) doIt();
  }

  // ── Gallery (multi-image; first = cover) ──
  window.cmRenderGallery = function () {
    var wrap = document.getElementById('cm-gallery'); if (!wrap) return;
    if (!_cmGallery.length) { wrap.innerHTML = '<div class="psub">No extra photos yet. Add a few to show this experience off.</div>'; return; }
    wrap.innerHTML = _cmGallery.map(function (url, i) {
      return '<div style="position:relative;width:128px;height:84px;border-radius:10px;overflow:hidden;border:1px solid var(--ffp-border-mid);background:#ffffff center/cover no-repeat;background-image:url(\'' + esc(url) + '\');">' +
        (i === 0 ? '<span style="position:absolute;top:4px;left:4px;background:var(--ffp-purple,#8b5cf6);color:#fff;font-size:10px;font-weight:800;padding:2px 6px;border-radius:6px;">COVER</span>' : '') +
        '<div style="position:absolute;bottom:0;left:0;right:0;display:flex;background:rgba(0,8,20,.6);">' +
          '<button type="button" title="Move left" onclick="cmMoveGalleryImage(' + i + ',-1)" style="flex:1;border:none;background:transparent;color:#fff;cursor:pointer;font-size:16px;line-height:1;padding:5px 0;">‹</button>' +
          '<button type="button" title="Remove" onclick="cmRemoveGalleryImage(' + i + ')" style="flex:1;border:none;background:transparent;color:#fff;cursor:pointer;padding:5px 0;"><span class="ms" style="font-size:15px;vertical-align:-2px;">delete</span></button>' +
          '<button type="button" title="Move right" onclick="cmMoveGalleryImage(' + i + ',1)" style="flex:1;border:none;background:transparent;color:#fff;cursor:pointer;font-size:16px;line-height:1;padding:5px 0;">›</button>' +
        '</div>' +
      '</div>';
    }).join('');
  };
  window.cmAddGalleryImage = function () {
    if (!window.FFPUpload) { toast('Uploader not ready — refresh and retry', 'error'); return; }
    var pid = provId() || 'provider';
    window.FFPUpload.pick({ bucket: 'listing-covers', key: 'gallery-' + pid + '-' + Date.now(), aspect: 16 / 9, outW: 1600, outH: 900, title: 'Add a photo',
      onDone: function (url) { _cmGallery.push(url); window.cmRenderGallery(); },
      onError: function (er) { toast('Upload failed: ' + ((er && er.message) || 'try again'), 'error'); } });
  };
  window.cmRemoveGalleryImage = function (i) { _cmGallery.splice(i, 1); window.cmRenderGallery(); };
  window.cmMoveGalleryImage = function (i, dir) { var j = i + dir; if (j < 0 || j >= _cmGallery.length) return; var t = _cmGallery[i]; _cmGallery[i] = _cmGallery[j]; _cmGallery[j] = t; window.cmRenderGallery(); };

  // ── Schedule builder controls ──
  window.cmToggleDay = function (btn) {
    var on = btn.dataset.on === '1'; btn.dataset.on = on ? '0' : '1';
    if (on) { btn.style.background = 'transparent'; btn.style.color = 'var(--ffp-text-muted)'; btn.style.borderColor = 'var(--ffp-border-mid)'; }
    else { btn.style.background = 'var(--ffp-purple,#8b5cf6)'; btn.style.color = '#fff'; btn.style.borderColor = 'var(--ffp-purple,#8b5cf6)'; }
  };
  window.cmAddTime = function (t) {
    var wrap = document.getElementById('cm-sched-times'); if (!wrap) return;
    var row = document.createElement('div'); row.style.cssText = 'display:flex;align-items:center;gap:2px;';
    row.innerHTML = '<input class="input cm-time" type="time" value="' + esc(t || '') + '" style="width:128px;color-scheme:light;">' +
      '<button type="button" title="Remove" onclick="this.closest(\'div\').remove()" style="border:none;background:transparent;color:var(--ffp-text-muted);cursor:pointer;"><span class="ms" style="font-size:16px;">close</span></button>';
    wrap.appendChild(row);
  };

  window.cmLoadUpcoming = function (classId) {
    var wrap = document.getElementById('cm-upcoming'); if (!wrap) return;
    wrap.innerHTML = '<div class="psub">Loading scheduled departures…</div>';
    sb().rpc('provider_list_class_sessions', { p_provider: provId(), p_class: classId }).then(function (r) {
      var rows = (r && r.data) ? r.data.slice() : [];
      rows.sort(function (a, b) { return new Date(a.starts_at) - new Date(b.starts_at); });
      _cmUpcoming = rows;
      if (!rows.length) { wrap.innerHTML = '<div class="psub">No departures yet. Set the days + times above, then Save to generate them.</div>'; return; }
      var di = function (ts) { return (window.FFPTime && window.FFPTime.toDateInput) ? window.FFPTime.toDateInput(ts) : String(ts).slice(0, 10); };
      var ti = function (ts) { return (window.FFPTime && window.FFPTime.toTimeInput) ? window.FFPTime.toTimeInput(ts) : String(ts).slice(11, 16); };
      var groups = {}, order = [];
      rows.forEach(function (s) { var k = di(s.starts_at); if (!groups[k]) { groups[k] = []; order.push(k); } groups[k].push(s); });
      var html = '<div class="label" style="margin-bottom:8px;">Scheduled departures (' + rows.length + ')</div>';
      order.forEach(function (k) {
        html += '<div style="margin-bottom:10px;border:1px solid var(--ffp-border);border-radius:10px;overflow:hidden;">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:rgba(8,20,32,.5);">' +
            '<b style="font-size:13px;">' + esc(k) + '</b>' +
            '<button type="button" class="btn btn-ghost btn-sm" onclick="cmCloseDay(\'' + esc(k) + '\')">Close this day</button>' +
          '</div>';
        groups[k].forEach(function (s) {
          var cancelled = s.status === 'cancelled';
          html += '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:8px 12px;border-top:1px solid var(--ffp-border);' + (cancelled ? 'opacity:.55;' : '') + '">' +
            '<span style="font-size:13px;">' + esc(ti(s.starts_at)) + ' · ' + (s.spots_taken || 0) + '/' + (s.capacity || 0) + (cancelled ? ' · <b style="color:#e0556b;">Cancelled</b>' : '') + '</span>' +
            '<span style="display:flex;gap:6px;flex-shrink:0;">' +
              (cancelled
                ? '<button type="button" class="btn btn-ghost btn-sm" onclick="cmReopenDeparture(\'' + s.id + '\')">Reopen</button>'
                : '<button type="button" class="btn btn-ghost btn-sm" onclick="cmCancelDeparture(\'' + s.id + '\')">Cancel</button>') +
              '<button type="button" class="btn btn-ghost btn-sm" title="Delete" onclick="cmDeleteDeparture(\'' + s.id + '\')"><span class="ms" style="font-size:15px;">delete</span></button>' +
            '</span>' +
          '</div>';
        });
        html += '</div>';
      });
      wrap.innerHTML = html;
    }).catch(function () { wrap.innerHTML = '<div class="psub">Could not load departures.</div>'; });
  };
  function _cmReload() { if (window._cmEditId) window.cmLoadUpcoming(window._cmEditId); }
  window.cmCancelDeparture = function (idv) { sb().rpc('provider_set_class_session_status', { p_provider: provId(), p_id: idv, p_status: 'cancelled' }).then(_cmReload); };
  window.cmReopenDeparture = function (idv) { sb().rpc('provider_set_class_session_status', { p_provider: provId(), p_id: idv, p_status: 'scheduled' }).then(_cmReload); };
  window.cmDeleteDeparture = function (idv) { sb().rpc('provider_delete_class_session', { p_provider: provId(), p_id: idv }).then(_cmReload); };
  window.cmCloseDay = function (k) {
    var di = function (ts) { return (window.FFPTime && window.FFPTime.toDateInput) ? window.FFPTime.toDateInput(ts) : String(ts).slice(0, 10); };
    var ids = (_cmUpcoming || []).filter(function (s) { return di(s.starts_at) === k && s.status !== 'cancelled'; }).map(function (s) { return s.id; });
    if (!ids.length) return;
    Promise.all(ids.map(function (idv) { return sb().rpc('provider_set_class_session_status', { p_provider: provId(), p_id: idv, p_status: 'cancelled' }); })).then(_cmReload);
  };

  var _clTitles = ['Step 1 of 3 · Details', 'Step 2 of 3 · Good to know', 'Step 3 of 3 · Schedule'];
  function _clShow(id, on) { var x = document.getElementById(id); if (x) x.style.display = on ? '' : 'none'; }
  window.clStep = function (n) {
    n = Math.min(3, Math.max(1, n || 1));
    window._clStep = n;
    _clShow('cl-step1', n === 1); _clShow('cl-step2', n === 2); _clShow('cl-step3', n === 3);
    _clShow('cl-cancel', n === 1);
    _clShow('cl-back', n > 1);
    _clShow('cl-next', n < 3);
    _clShow('cl-save', n === 3);
    _clShow('cl-del', n === 3);
    var nx = document.getElementById('cl-next'); if (nx) nx.innerHTML = (n === 1 ? 'Next' : 'Next: Schedule') + ' <span class="ms" style="font-size:16px;vertical-align:-3px;">chevron_right</span>';
    var bar = document.getElementById('cl-stepbar'); if (bar) bar.textContent = _clTitles[n - 1];
    var mb = document.querySelector('.modal-body'); if (mb) mb.scrollTop = 0;
  };
  window.clBack = function () { window.clStep((window._clStep || 1) - 1); };
  window.clNext = function () {
    var g = function (i) { var el = document.getElementById('cm-' + i); return el ? (el.value || '').trim() : ''; };
    var step = window._clStep || 1;
    if (step === 1) {
      var ab = document.getElementById('cm-activity-btn'); var activity = ab ? (ab.dataset.value || '') : '';
      var cob = document.getElementById('cm-country-btn'); var country = cob ? (cob.dataset.value || '') : '';
      if (!g('title'))   { toast('Title is required', 'error'); return; }
      if (!activity)     { toast('Activity is required', 'error'); return; }
      if (!country)      { toast('Country is required', 'error'); return; }
      if (!g('price'))   { toast('Price is required', 'error'); return; }
    }
    window.clStep(step + 1);
  };
  window.cmToggleOngoing = function () {
    var on = document.getElementById('cm-sched-ongoing'); var end = document.getElementById('cm-sched-end');
    if (!end) return;
    var ongoing = on ? on.checked : true;
    end.disabled = ongoing;
    if (ongoing) { end.value = ''; end.style.opacity = '0.5'; } else { end.style.opacity = '1'; }
  };
  window.cmRenderQuestions = function () {
    var w = document.getElementById('cm-questions'); if (!w) return;
    if (!_cmQuestions.length) { w.innerHTML = '<div class="psub" style="color:var(--ffp-text-muted);">No questions yet. Add one to collect info like helmet size at booking.</div>'; return; }
    w.innerHTML = _cmQuestions.map(function (q, i) {
      var opts = Array.isArray(q.options) ? q.options.join(', ') : '';
      return '<div style="border:1px solid var(--ffp-border);border-radius:10px;padding:10px;margin-bottom:10px;display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end;">' +
        '<div style="flex:2;min-width:150px;"><div class="label">Question</div><input class="input cmq-label" value="' + esc(q.label || '') + '" placeholder="e.g. Helmet size"></div>' +
        '<div style="flex:1;min-width:110px;"><div class="label">Type</div><select class="select cmq-type" onchange="cmSyncQuestions()"><option value="select"' + (q.type === 'select' ? ' selected' : '') + '>Choose from list</option><option value="text"' + (q.type === 'text' ? ' selected' : '') + '>Text</option><option value="number"' + (q.type === 'number' ? ' selected' : '') + '>Number</option></select></div>' +
        '<div style="flex:2;min-width:150px;' + (q.type === 'select' ? '' : 'display:none;') + '" class="cmq-opts-wrap"><div class="label">Options <span class="label-hint">— comma separated</span></div><input class="input cmq-opts" value="' + esc(opts) + '" placeholder="S, M, L, XL"></div>' +
        '<label style="display:flex;gap:5px;align-items:center;font-size:12px;cursor:pointer;"><input type="checkbox" class="cmq-required"' + (q.required ? ' checked' : '') + '> Required</label>' +
        '<label style="display:flex;gap:5px;align-items:center;font-size:12px;cursor:pointer;"><input type="checkbox" class="cmq-perguest"' + (q.per_guest ? ' checked' : '') + '> Per guest</label>' +
        '<button type="button" class="btn btn-ghost btn-sm" title="Remove" onclick="cmRemoveQuestion(' + i + ')"><span class="ms" style="font-size:15px;">delete</span></button>' +
      '</div>';
    }).join('');
  };
  window.cmSyncQuestions = function () {
    var rows = Array.prototype.slice.call(document.querySelectorAll('#cm-questions > div'));
    if (!rows.length || !document.querySelector('#cm-questions .cmq-label')) return;
    _cmQuestions = rows.filter(function (r) { return r.querySelector('.cmq-label'); }).map(function (r) {
      var label = (r.querySelector('.cmq-label') || {}).value || '';
      var type = (r.querySelector('.cmq-type') || {}).value || 'text';
      var optsRaw = (r.querySelector('.cmq-opts') || {}).value || '';
      var key = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || ('q' + Math.random().toString(36).slice(2, 6));
      var q = { key: key, label: label.trim(), type: type, required: !!(r.querySelector('.cmq-required') || {}).checked, per_guest: !!(r.querySelector('.cmq-perguest') || {}).checked };
      if (type === 'select') q.options = optsRaw.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
      return q;
    }).filter(function (q) { return q.label; });
    window.cmRenderQuestions();
  };
  window.cmAddQuestion = function () { window.cmSyncQuestions(); _cmQuestions.push({ key: '', label: '', type: 'select', options: [], required: false, per_guest: true }); window.cmRenderQuestions(); };
  window.cmRemoveQuestion = function (i) { window.cmSyncQuestions(); _cmQuestions.splice(i, 1); window.cmRenderQuestions(); };

  window.resolveClassMapsLink = async function () {
    var inp = document.getElementById('cm-maps-url'), st = document.getElementById('cm-loc-status');
    var url = inp ? (inp.value || '').trim() : '';
    if (!url) { if (st) st.textContent = 'Paste your Google Maps link first'; return; }
    if (st) st.textContent = 'Finding your pin…';
    try {
      var res = await fetch('https://ffp-passport-backend.vercel.app/api/geo/resolve?url=' + encodeURIComponent(url));
      var j = await res.json();
      if (!res.ok || j.lat == null) { if (st) st.textContent = (j && j.error) ? j.error : 'Couldn’t read a pin from that link'; return; }
      var la = document.getElementById('cm-lat'), ln = document.getElementById('cm-lng');
      if (la) la.value = j.lat; if (ln) ln.value = j.lng;
      if (st) st.textContent = '✓ Pin set (' + Number(j.lat).toFixed(5) + ', ' + Number(j.lng).toFixed(5) + ')';
    } catch (e) { console.error('[Tour] resolve maps link:', e); if (st) st.textContent = 'Couldn’t reach the resolver — try again'; }
  };

  // ── expose ──
  window.renderClasses = renderClasses;
  // Guest-intake renderer (given/surname, gender, age + custom answers like shirt size).
  function _cbIntake(d) {
    if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) { return ''; } }
    if (!d || typeof d !== 'object') return '';
    var pretty = function (k) { return String(k).replace(/_/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); }); };
    var rows = [];
    (Array.isArray(d.guests) ? d.guests : []).forEach(function (g, i) {
      var nm = [g.first_name || g.given_names, g.last_name || g.surname].filter(Boolean).join(' ').trim();
      var meta = []; if (g.gender) meta.push(pretty(g.gender)); if (g.age != null && g.age !== '') meta.push('age ' + g.age);
      var ans = (g.answers && typeof g.answers === 'object') ? Object.keys(g.answers).filter(function (k) { return g.answers[k] != null && g.answers[k] !== ''; }).map(function (k) { return pretty(k) + ': ' + g.answers[k]; }) : [];
      var line = '<b>Guest ' + (i + 1) + '</b>' + (nm ? ' · ' + esc(nm) : '') + (meta.length ? ' (' + esc(meta.join(', ')) + ')' : '');
      if (ans.length) line += ' — ' + esc(ans.join(' · '));
      rows.push('<div>' + line + '</div>');
    });
    var ba = (d.booking_answers && typeof d.booking_answers === 'object') ? d.booking_answers : null;
    if (ba) { Object.keys(ba).forEach(function (k) { if (ba[k] != null && ba[k] !== '') rows.push('<div>' + esc(pretty(k)) + ': ' + esc(String(ba[k])) + '</div>'); }); }
    if (!rows.length) return '';
    return '<div style="margin-top:5px;padding:7px 9px;background:var(--ffp-bg-3);border-radius:8px;font-size:11.5px;color:var(--ffp-text-muted);line-height:1.6;">' +
      '<div style="font-weight:800;color:var(--ffp-text);margin-bottom:2px;font-size:10px;letter-spacing:.4px;text-transform:uppercase;">Booking details</div>' + rows.join('') + '</div>';
  }
  window.openClassBookings = function (classId) {
    openModalShell('lg', 'Bookings & guest details', '<div id="cb-body"><div class="psub" style="margin:10px 0;">Loading…</div></div>', '<button class="btn btn-ghost" onclick="closeModal()">Close</button>');
    sb().rpc('provider_class_bookings', { p_provider: provId(), p_class: classId }).then(function (r) {
      var rows = (r && r.data) || [];
      var host = document.getElementById('cb-body'); if (!host) return;
      if (!rows.length) { host.innerHTML = '<div class="psub" style="margin:10px 0;">No bookings yet. When members book a date, they appear here with the details they entered.</div>'; return; }
      var groups = {}, order = [];
      rows.forEach(function (b) { var k = b.session_id || 'x'; if (!groups[k]) { groups[k] = { starts_at: b.starts_at, rows: [] }; order.push(k); } groups[k].rows.push(b); });
      order.sort(function (a, b) { return String(groups[a].starts_at || '') < String(groups[b].starts_at || '') ? -1 : 1; });
      host.innerHTML = order.map(function (k) {
        var g = groups[k];
        var when = g.starts_at ? new Date(g.starts_at).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Date TBC';
        return '<div style="margin:0 0 16px;"><div style="font-weight:800;color:var(--ffp-text);border-bottom:1px solid var(--ffp-border-mid);padding-bottom:6px;margin-bottom:8px;">' + esc(when) + ' · ' + g.rows.length + ' booked</div>' +
          g.rows.map(function (b) {
            return '<div style="padding:8px 2px;border-bottom:1px solid var(--ffp-border);">' +
              '<div style="display:flex;justify-content:space-between;gap:8px;align-items:baseline;"><span style="font-weight:700;color:var(--ffp-text);">' + esc(b.member_name || 'Member') + (b.quantity > 1 ? ' ×' + b.quantity : '') + '</span>' +
              '<span style="font-size:11px;font-weight:800;color:' + (b.payment_status === 'paid' ? '#1f9d57' : 'var(--ffp-text-dim)') + ';">' + esc(b.payment_status || '') + '</span></div>' +
              _cbIntake(b.details) + '</div>';
          }).join('') + '</div>';
      }).join('');
    }).catch(function () { var host = document.getElementById('cb-body'); if (host) host.innerHTML = '<div class="psub" style="margin:10px 0;">Could not load bookings.</div>'; });
  };
  window.openClassModal = openClassModal;
  window.saveClass = saveClass;
  window.setClassStatus = setClassStatus;
  window.confirmDeleteClass = confirmDeleteClass;
  window.FFPReload = window.FFPReload || {};
  window.FFPReload['class'] = refresh;

  // ── init ──
  function waitFor(cond, ms) { return new Promise(function (resolve) { var t0 = Date.now(); (function poll() { if (cond()) return resolve(true); if (Date.now() - t0 > ms) return resolve(false); setTimeout(poll, 200); })(); }); }
  (async function init() {
    var ok = await waitFor(function () { return window.supabase && window.FFP_PROVIDER && window.FFP_PROVIDER.id; }, 30000);
    if (!ok) { console.warn('[FFP Classes] deps not ready'); return; }
    await refresh();
    console.log('[FFP Provider Classes] loaded v12 — 3-step editor + rolling schedule + booking questions');
  })();
})();
