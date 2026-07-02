/* FFP Provider Notifications + Session Loader — v3 (realtime; replaced 60s poll) (2026-05-31)
   v2: Sign out now does a REAL logout via ffpLogout() (clears session →
       login.html). v1 called the inline demo signOut() → blank page.
   PURPOSE
   1. Wires the topbar bell to REAL data:
        - New RSVPs to events this provider owns
        - New applications to experiences this provider owns
        - Listings that have been approved (status = 'live')
      Shows an unseen-count badge + a dropdown panel; "all caught up" empty state.
      Unseen tracking uses localStorage (no provider-side read flag in DB yet).
   2. Adds a clear "Sign out" button to the topbar (mirrors the admin dashboard).
   3. Hides the in-Settings "Sign out" button that sat right next to
      "Close my provider account" — removing the mis-click risk Grant flagged.

   DEPENDS ON: provider-read RLS policies on rsvps + applications
   (migration provider_read_rsvps_applications_for_owned_listings, 2026-05-31).

   ARCHITECTURE: this is a runtime patch loader, same pattern as the other
   ffp-provider-*-loader.js files. Add ONE <script> tag to the dashboard head.
*/
(function () {
  'use strict';

  var SEEN_KEY = 'ffp_provider_notifs_seen';

  // ── helpers ───────────────────────────────────────────────────────────────
  function toast(m, k) {
    if (typeof window.showToast === 'function') { try { window.showToast(m, k || 'info'); return; } catch (e) {} }
    console.log('[FFP Notifs]', m);
  }
  function esc(s) {
    if (typeof window.escHtml === 'function') return window.escHtml(s);
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function rel(ts) {
    if (typeof window.fmtRelative === 'function') { try { return window.fmtRelative(ts); } catch (e) {} }
    return '';
  }
  async function waitFor(check, ms) {
    var t = 0, lim = Math.ceil((ms || 15000) / 100);
    while (!check() && t < lim) { await new Promise(function (r) { setTimeout(r, 100); }); t++; }
    return check();
  }
  function getSeen() { try { return localStorage.getItem(SEEN_KEY) || '1970-01-01T00:00:00Z'; } catch (e) { return '1970-01-01T00:00:00Z'; } }
  function setSeen(iso) { try { localStorage.setItem(SEEN_KEY, iso); } catch (e) {} }

  // ── styles ────────────────────────────────────────────────────────────────
  function injectCss() {
    if (document.getElementById('ffp-notifs-css')) return;
    var s = document.createElement('style');
    s.id = 'ffp-notifs-css';
    s.textContent = [
      '.tb-bell.ffp-seen::after{display:none !important;}',
      '.ffp-bell-badge{position:absolute;top:-4px;right:-4px;min-width:17px;height:17px;padding:0 4px;border-radius:9px;background:var(--ffp-blue,#1980AD);color:#fff;font-size:10px;font-weight:800;line-height:1;display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 2px var(--ffp-bg-2,#ffffff);}',
      '.ffp-notif-pop{position:fixed;width:340px;max-width:calc(100vw - 24px);max-height:440px;background:var(--ffp-bg-2,#ffffff);border:1px solid var(--ffp-border-mid,rgba(25,128,173,.22));border-radius:14px;box-shadow:0 18px 50px rgba(0,0,0,.5);z-index:90;display:flex;flex-direction:column;overflow:hidden;}',
      '.ffp-notif-head{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid var(--ffp-border,rgba(25,128,173,.1));}',
      '.ffp-notif-head .t{font-size:13px;font-weight:800;color:var(--ffp-text,#0e2531);}',
      '.ffp-notif-head .c{font-size:11px;font-weight:700;color:var(--ffp-blue,#1980AD);cursor:pointer;}',
      '.ffp-notif-head .c:hover{color:var(--ffp-yellow,#2b3942);}',
      '.ffp-notif-list{overflow-y:auto;padding:6px 0;}',
      '.ffp-notif-list::-webkit-scrollbar{width:0;display:none;}',
      '.ffp-notif-item{display:flex;gap:11px;padding:11px 16px;border-bottom:1px dashed var(--ffp-border,rgba(25,128,173,.1));cursor:pointer;}',
      '.ffp-notif-item:last-child{border-bottom:none;}',
      '.ffp-notif-item:hover{background:rgba(25,128,173,.06);}',
      '.ffp-notif-item.unseen{background:rgba(15,37,49,.05);}',
      '.ffp-notif-ic{width:34px;height:34px;border-radius:9px;background:rgba(25,128,173,.12);color:var(--ffp-blue,#1980AD);display:flex;align-items:center;justify-content:center;flex-shrink:0;}',
      '.ffp-notif-ic.green{background:rgba(74,222,128,.12);color:var(--ffp-green,#4ade80);}',
      '.ffp-notif-ic.yellow{background:rgba(15,37,49,.12);color:var(--ffp-yellow,#2b3942);}',
      '.ffp-notif-ic .ms{font-size:18px;}',
      '.ffp-notif-tx{flex:1;min-width:0;}',
      '.ffp-notif-tx .m{font-size:12.5px;font-weight:600;color:var(--ffp-text,#0e2531);line-height:1.4;}',
      '.ffp-notif-tx .ti{font-size:10px;font-weight:700;color:var(--ffp-text-muted,#566069);margin-top:3px;letter-spacing:.3px;}',
      '.ffp-notif-empty{padding:34px 20px;text-align:center;color:var(--ffp-text-muted,#566069);font-size:13px;font-weight:600;}',
      '.ffp-notif-empty .ms{font-size:30px;display:block;margin:0 auto 8px;color:var(--ffp-green,#4ade80);}'
    ].join('');
    document.head.appendChild(s);
  }

  // ── build notification list from real data ─────────────────────────────────
  var cache = [];

  async function safeSelect(table, cols, applyFilters) {
    try {
      var q = window.supabase.from(table).select(cols);
      q = applyFilters(q);
      var res = await q;
      if (res.error) { console.warn('[FFP Notifs] ' + table + ':', res.error.message); return []; }
      return res.data || [];
    } catch (e) {
      console.warn('[FFP Notifs] ' + table + ' threw:', e);
      return [];
    }
  }

  async function buildNotifs() {
    var out = [];
    var pid = window.FFP_PROVIDER && window.FFP_PROVIDER.id;
    if (!pid) return out;

    var events = await safeSelect('events', 'id,title,status,updated_at', function (q) { return q.eq('provider_id', pid); });
    var exps   = await safeSelect('trips', 'id,title,status,updated_at', function (q) { return q.eq('provider_id', pid); });
    var chs    = await safeSelect('challenges', 'id,title,status,updated_at', function (q) { return q.eq('provider_id', pid); });

    var eTitle = {}; events.forEach(function (x) { eTitle[x.id] = x.title; });
    var xTitle = {}; exps.forEach(function (x) { xTitle[x.id] = x.title; });
    var eIds = events.map(function (x) { return x.id; });
    var xIds = exps.map(function (x) { return x.id; });

    if (eIds.length) {
      var rsvps = await safeSelect('rsvps', 'id,event_id,status,created_at', function (q) {
        return q.in('event_id', eIds).order('created_at', { ascending: false }).limit(30);
      });
      rsvps.forEach(function (row) {
        out.push({ id: 'r_' + row.id, icon: 'person_add', tone: 'green',
          text: 'New RSVP — ' + (eTitle[row.event_id] || 'your event'), ts: row.created_at, link: 'events' });
      });
    }

    if (xIds.length) {
      var apps = await safeSelect('applications', 'id,experience_id,status,created_at', function (q) {
        return q.in('experience_id', xIds).order('created_at', { ascending: false }).limit(30);
      });
      apps.forEach(function (row) {
        out.push({ id: 'a_' + row.id, icon: 'flight', tone: '',
          text: 'New application — ' + (xTitle[row.experience_id] || 'your experience'), ts: row.created_at, link: 'experiences' });
      });
    }

    // Approvals — anything that is now live
    events.forEach(function (x) { if (x.status === 'live') out.push({ id: 'ok_e_' + x.id, icon: 'check_circle', tone: 'yellow', text: '‘' + (x.title || 'Event') + '’ is approved and live', ts: x.updated_at, link: 'events' }); });
    exps.forEach(function (x)   { if (x.status === 'live') out.push({ id: 'ok_x_' + x.id, icon: 'check_circle', tone: 'yellow', text: '‘' + (x.title || 'Experience') + '’ is approved and live', ts: x.updated_at, link: 'experiences' }); });
    chs.forEach(function (x)    { if (x.status === 'live') out.push({ id: 'ok_c_' + x.id, icon: 'check_circle', tone: 'yellow', text: '‘' + (x.title || 'Challenge') + '’ is approved and live', ts: x.updated_at, link: 'challenges' }); });

    // Session bookings — members who booked one of this provider's sessions (SECURITY DEFINER RPC)
    try {
      var sb = await window.supabase.rpc('provider_recent_session_bookings', { p_provider: pid });
      ((sb && sb.data) || []).forEach(function (row) {
        out.push({ id: 'sb_' + row.booking_id, icon: 'event_available', tone: 'green',
          text: 'New booking — ' + (row.member_name || 'A member') + ' booked ‘' + (row.session_title || 'a session') + '’',
          ts: row.created_at, link: 'scheduling' });
      });
    } catch (e) { console.warn('[FFP Notifs] session bookings:', e); }

    out.sort(function (p, q) { return new Date(q.ts) - new Date(p.ts); });
    return out.slice(0, 40);
  }

  function unseenCount(list) {
    var seen = new Date(getSeen());
    return list.filter(function (n) { return n.ts && new Date(n.ts) > seen; }).length;
  }

  // ── bell badge + dropdown ───────────────────────────────────────────────────
  function renderBadge() {
    var bell = document.querySelector('.tb-bell');
    if (!bell) return;
    bell.style.position = 'relative';
    var n = unseenCount(cache);
    var b = bell.querySelector('.ffp-bell-badge');
    if (n > 0) {
      bell.classList.remove('ffp-seen');
      if (!b) { b = document.createElement('span'); b.className = 'ffp-bell-badge'; bell.appendChild(b); }
      b.textContent = n > 9 ? '9+' : String(n);
    } else {
      bell.classList.add('ffp-seen');
      if (b) b.remove();
    }
  }

  function closePop() {
    var p = document.getElementById('ffp-notif-pop');
    if (p) p.remove();
    document.removeEventListener('click', outside, true);
  }
  function outside(e) {
    var p = document.getElementById('ffp-notif-pop');
    var bell = document.querySelector('.tb-bell');
    if (p && !p.contains(e.target) && bell && !bell.contains(e.target)) closePop();
  }

  function openPop() {
    closePop();
    var bell = document.querySelector('.tb-bell');
    if (!bell) return;
    var seen = new Date(getSeen());
    var items = cache.length ? cache.map(function (n) {
      var u = n.ts && new Date(n.ts) > seen;
      return '<div class="ffp-notif-item' + (u ? ' unseen' : '') + '" data-link="' + esc(n.link) + '">' +
        '<div class="ffp-notif-ic ' + esc(n.tone || '') + '"><span class="ms">' + esc(n.icon) + '</span></div>' +
        '<div class="ffp-notif-tx"><div class="m">' + esc(n.text) + '</div><div class="ti">' + esc(rel(n.ts)) + '</div></div>' +
      '</div>';
    }).join('') : '<div class="ffp-notif-empty"><span class="ms">notifications_off</span>You’re all caught up</div>';

    var pop = document.createElement('div');
    pop.className = 'ffp-notif-pop';
    pop.id = 'ffp-notif-pop';
    pop.innerHTML =
      '<div class="ffp-notif-head"><div class="t">Notifications</div>' +
      (cache.length ? '<div class="c" id="ffp-notif-clear">Mark all read</div>' : '') +
      '</div><div class="ffp-notif-list">' + items + '</div>';
    document.body.appendChild(pop);

    var r = bell.getBoundingClientRect();
    pop.style.top = (r.bottom + 8) + 'px';
    pop.style.right = Math.max(12, (window.innerWidth - r.right)) + 'px';

    // Opening the panel marks everything as seen
    setSeen(new Date().toISOString());
    renderBadge();

    pop.querySelectorAll('.ffp-notif-item').forEach(function (el) {
      el.addEventListener('click', function () {
        var lk = el.dataset.link;
        closePop();
        if (lk && typeof window.showPanel === 'function') window.showPanel(lk);
      });
    });
    var clr = document.getElementById('ffp-notif-clear');
    if (clr) clr.addEventListener('click', function () { setSeen(new Date().toISOString()); renderBadge(); closePop(); });

    setTimeout(function () { document.addEventListener('click', outside, true); }, 0);
  }

  async function wireBell() {
    var bell = document.querySelector('.tb-bell');
    if (!bell) return;
    // Strip the inline demo onclick by replacing the node with a clean clone
    var clean = bell.cloneNode(true);
    bell.parentNode.replaceChild(clean, bell);
    clean.removeAttribute('onclick');
    clean.addEventListener('click', function (e) {
      e.stopPropagation();
      if (document.getElementById('ffp-notif-pop')) closePop(); else openPop();
    });
    cache = await buildNotifs();
    renderBadge();
    // Real-time (self-inject the helper — provider dashboard doesn't load it — then subscribe)
    (function () {
      function go() {
        ['rsvps','applications','events','trips','challenges'].forEach(function (t) {
          window.FFPRealtime.subscribe('provider-notif-' + t, t, null, async function () { try { cache = await buildNotifs(); renderBadge(); } catch (e) {} });
        });
      }
      if (window.FFPRealtime) { go(); return; }
      var _ex = document.getElementById('ffp-realtime-js');
      if (!_ex) { var _sc = document.createElement('script'); _sc.id = 'ffp-realtime-js'; _sc.src = 'assets/ffp-realtime.js'; _sc.onload = function () { if (window.FFPRealtime) go(); }; document.head.appendChild(_sc); }
      else { var _n = 0, _t = setInterval(function () { if (window.FFPRealtime) { clearInterval(_t); go(); } else if (++_n > 60) clearInterval(_t); }, 100); }
    })();
  }

  // ── sign-out: topbar button + hide the one next to Delete ───────────────────
  // v2: real logout — inline signOut() only shows a demo screen that does not
  // exist on the live build, causing a blank page. Use ffpLogout() (api-integration).
  function doLogout() {
    if (!confirm('Sign out of FFP Passport?')) return;
    if (typeof window.ffpLogout === 'function') { window.ffpLogout(); return; }
    try {
      localStorage.removeItem('ffp_token');
      localStorage.removeItem('ffp_member');
      localStorage.removeItem('ffp_jwt');
    } catch (e) {}
    window.location.href = 'login.html';
  }

  function fixSignOut() {
    window.signOut = doLogout; // any caller now does a real logout
    // 1) Add a Sign out button to the topbar actions (always visible, safe location)
    var actions = document.querySelector('.tb-actions');
    if (actions && !document.getElementById('ffp-tb-signout')) {
      var btn = document.createElement('button');
      btn.className = 'tb-btn';
      btn.id = 'ffp-tb-signout';
      btn.title = 'Sign out';
      btn.innerHTML = '<span class="ms">logout</span><span>Sign out</span>';
      btn.addEventListener('click', doLogout);
      actions.appendChild(btn);
    }
    // 2) Hide the Settings "Sign out" button (sat next to Close-account → mis-click risk)
    try {
      var settings = document.getElementById('panel-settings');
      if (settings) {
        var soBtn = settings.querySelector('button[onclick*="signOut"]');
        if (soBtn) {
          var field = soBtn.closest('.field');
          if (field) field.style.display = 'none';
        }
      }
    } catch (e) { /* non-fatal */ }
  }

  // ── init ────────────────────────────────────────────────────────────────────
  async function init() {
    var ready = await waitFor(function () {
      return window.supabase && document.querySelector('.tb-bell') &&
             typeof window.showPanel === 'function';
    }, 15000);
    if (!ready) { console.warn('[FFP Notifs] dependencies not ready'); return; }

    injectCss();
    fixSignOut(); // DOM-only, safe to run before auth resolves

    var authed = await waitFor(function () {
      return !!(window.FFP_PROVIDER && window.FFP_PROVIDER.id);
    }, 30000);
    if (!authed) { console.warn('[FFP Notifs] FFP_PROVIDER not set — bell left idle'); return; }

    try {
      await wireBell();
      console.log('[FFP Notifs v1] loaded ✓');
    } catch (e) {
      console.error('[FFP Notifs] init:', e);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
