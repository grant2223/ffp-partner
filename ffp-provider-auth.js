/* FFP Provider Auth Gate — v8 (STAFF CAN ACTUALLY GET IN)
   v8 (2026-10-22): THE PORTAL DOOR WAS OWNER ONLY, so the access levels and the
       per-person sections built on top of them were unreachable — a coach or an
       organiser was turned away before any of it ran. Three things did it, all
       here: (1) members.role had to be 'provider', and a staff member's row says
       'member'; (2) the business was looked up by owner_user_id = member.id, and
       a staff member owns nothing; (3) provider_staff.member_id was never filled,
       so the row only ever matched on an email string.
       All three are now one call to provider_portal_entry(), which answers with
       every business this person may run — owned first, then the ones they are
       staff of — each carrying their access level and the sections behind it, and
       links their staff row to the account on the way through.
       A signed-in person with no business attached is no longer bounced back to
       the form they just came from. That was a dead end and, with a live session,
       a loop. They get a page that says so and offers a way out.
       v7 (RENEWS THE SESSION INSTEAD OF SIGNING OUT)
   v7 (2026-10-10): THE PARTNER PORTAL WAS IN AN INFINITE REDIRECT LOOP.
       Measured live on partner.findfitpeople.com with a JWT that had expired
       44 hours earlier: the providers lookup came back 401 PGRST303 'JWT
       expired', v6 read any lookup error as "not signed in" and bounced to
       '/login', and login.html treats a merely PRESENT token string as a live
       session and sent the browser straight back to '/'. The two pages then
       ping-ponged — 4,000+ requests, an empty body, and no way out but
       clearing site data.
       The refresh token was in localStorage the whole time, unused.
       ffp-api-integration v12 does fire refreshSession() on boot, but it never
       awaits it, and this guard only waited for window.supabase to EXIST before
       querying — so every loop killed its own in-flight refresh.
       Three changes, all in this file:
         (a) an expired stored JWT is renewed BEFORE the first query, so the
             guard no longer races the boot refresh;
         (b) a session error FROM PostgREST triggers one refresh and one retry,
             instead of a sign-out;
         (c) every exit goes to '/login?switch=1'. The '?switch=1' flag already
             exists in login.html and makes it SHOW the sign-in form rather than
             bounce a stale session back here, so the loop cannot re-form.
       login.html needs no change. Its weak session test is only reachable with
       a dead token, and nothing sends one there any more.
   v6 (2026-07-02): Wrong-role redirects now point at absolute ffppassport.com
       URLs instead of same-origin '/ffp-*-dashboard.html' paths. The provider
       dashboard now runs on its own origin (partner.findfitpeople.com) where
       those paths don't exist and, under the SPA '/*'→index.html fallback,
       would loop forever. No-session still bounces to '/login' (relative) —
       which on partner.* is the new self-contained partner login.html, and on
       ffppassport.com is the Passport login. Correct on both origins.
   v5 (2026-05-29): v4 was setting FFP_PROVIDER.id = member.id which the
       provider profile loader then used as the providers row PK in
       .from('providers').eq('id', member.id) — returning 0 rows because
       providers.id is its own UUID, separate from members.id. v5 looks
       up the providers row by owner_user_id = member.id and exposes
       FFP_PROVIDER.id as the actual provider record id, plus member_id
       for reference. If no providers row exists (provider has not been
       onboarded into the providers table yet), bounce to a "provider
       application pending" state or /login. JWT bridge required (v8 of
       ffp-api-integration) — supabase queries authenticated via header.
   v4: COMPLETE REWRITE. Replaces the Supabase Auth OTP integration (v3,
       311 lines) with a tiny role-check page guard, mirroring the admin
       v5 pattern. All sign-in for ALL roles (member / provider / admin)
       now goes through the same /login → "Get My Code" → 6-digit code
       flow.

   The provider dashboard HTML still contains an old #auth-screen / "Apply
   to join" overlay (from v3 design). This v4 hides it via CSS on load to
   prevent flicker — new provider applications should go through a separate
   apply flow page when that's built (Phase 4 work). The dashboard's
   built-in enterDashboard() function is called to transition the view
   cleanly into the dashboard mode.

   Prerequisite: the user's row in `members` must have role = 'provider'.

   Drop in to ffp-provider-dashboard.html — same script tag as before:
     <script src="ffp-provider-auth.js"></script>
*/
(function () {
  'use strict';

  // ─── Hide the legacy #auth-screen overlay immediately to prevent flicker ───
  // The provider dashboard HTML carries an inline auth UI from v3. Unified
  // auth doesn't use it; the user is already signed in by the time they reach
  // this page (otherwise the role check below bounces them to /login).
  var hideCss = document.createElement('style');
  hideCss.id = 'ffp-provider-auth-hide-legacy';
  hideCss.textContent = '#auth-screen{display:none !important;}';
  if (document.head) document.head.appendChild(hideCss);

  // ─── Read the signed-in member from localStorage (set by /api/auth/signin) ───
  var member = null;
  try {
    var raw = localStorage.getItem('ffp_member');
    if (raw) member = JSON.parse(raw);
  } catch (e) {
    console.warn('[FFP Provider Auth v7] Could not parse ffp_member:', e);
  }

  // ─── No signed-in member at all → bounce to /login ───
  if (!member || !member.id) {
    console.warn('[FFP Provider Auth v7] No signed-in member — showing the partner sign-in form');
    location.replace('/login?switch=1');
    return;
  }

  // ─── Wrong role → send them to their proper ORIGIN (not a same-origin path) ───
  // v6 (2026-07-02): the provider dashboard now lives on its own origin
  // (partner.findfitpeople.com). Members/admins belong on ffppassport.com, and a
  // same-origin path like '/ffp-member-dashboard.html' doesn't exist here — with the
  // SPA '/*' fallback it would serve index.html, re-run this guard, and loop forever.
  // Absolute ffppassport.com URLs are correct on BOTH origins (on ffppassport.com they
  // resolve locally; on partner.* they cross back to Passport where the session lives).
  // v8: role alone no longer decides. A coach or an organiser is a 'member' who
  // works for a business, and the old test threw every one of them out. Admins
  // still belong on their own origin; everyone else is asked of the database,
  // which is the only thing that actually knows whether they run a business.
  if (member.role === 'admin' || member.role === 'super_admin' || member.role === 'super') {
    console.warn('[FFP Provider Auth v8] role="' + member.role + '" — sending to the admin origin');
    location.href = 'https://ffppassport.com/login#admin';
    return;
  }

  // ─── Provider role verified — now look up their providers record ───
  // v5: providers table is separate from members. providers.id is the
  // record PK; providers.owner_user_id is the FK to members.id. The
  // provider loaders need FFP_PROVIDER.id to be the providers row id
  // (not member.id) so .from('providers').eq('id', FFP_PROVIDER.id)
  // resolves correctly. Wait for window.supabase to be JWT-rebuilt
  // (ffp-api-integration v8 autoInit fires on DOMContentLoaded) before
  // querying, so RLS sees auth.uid() = member.id and the policy passes.
  // ─── v7: session helpers ───
  function auth() { return window.FFPAuth || null; }

  // True ONLY when the token's own exp says it is spent. An unreadable token
  // returns false on purpose — then the server decides, and (b) below covers it.
  function jwtExpired(tok) {
    if (!tok) return false;
    try {
      var seg = String(tok).split('.')[1];
      if (!seg) return false;
      seg = seg.replace(/-/g, '+').replace(/_/g, '/');
      while (seg.length % 4) { seg += '='; }
      var exp = JSON.parse(atob(seg)).exp;
      if (!exp) return false;
      return (exp - 60) * 1000 <= Date.now();   // 60s of clock skew
    } catch (e) { return false; }
  }

  // PostgREST says PGRST303 for an expired JWT and PGRST301 for an invalid one.
  function isSessionError(err) {
    if (!err) return false;
    var code = String(err.code || '');
    var msg  = String(err.message || '').toLowerCase();
    return code === 'PGRST301' || code === 'PGRST303' ||
           String(err.status || '') === '401' ||
           msg.indexOf('jwt') !== -1 || msg.indexOf('token') !== -1;
  }

  // One refresh per page load, never more — a refresh that fails must not spin.
  var refreshTried = false;
  function refreshOnce() {
    var A = auth();
    if (refreshTried || !A || !A.refreshSession || !A.getRefresh || !A.getRefresh()) {
      return Promise.resolve(null);
    }
    refreshTried = true;
    return A.refreshSession();
  }

  // Every exit from this guard lands on the partner sign-in FORM.
  // 'replace' rather than 'href' so the dead page is not left in history.
  function toLogin(why) {
    console.warn('[FFP Provider Auth v7] ' + why + ' — showing the partner sign-in form');
    location.replace('/login?switch=1');
  }

  // v8: one call, and it covers owners AND staff. provider_portal_entry() returns
  // an array of the businesses this person may run, owned ones first, each with
  // their access level and the sections behind it, and links their staff row to
  // this account while it is there.
  function lookupProvider(supabase) {
    return supabase.rpc('provider_portal_entry');
  }

  // Which business to open. One is the answer; with more than one, the owned one
  // wins, and the rest stay on FFP_PROVIDER.available so a switcher can use them.
  function pickBusiness(rows) {
    if (!Array.isArray(rows) || !rows.length) return null;
    return rows.find(function (r) { return r.owned; }) || rows[0];
  }

  // A signed-in person with no business attached used to be sent back to the sign
  // in form they had just come from, which with a live session is a loop and with
  // a dead one is a dead end. Say what is wrong and give them the way out.
  function noBusiness() {
    var style = document.createElement('style');
    style.textContent = '#ffp-nobiz{position:fixed;inset:0;z-index:99999;background:#0e2531;color:#eaf2f8;' +
      'display:flex;align-items:center;justify-content:center;padding:28px;' +
      "font-family:Montserrat,system-ui,sans-serif}" +
      '#ffp-nobiz .bx{max-width:460px;width:100%}' +
      '#ffp-nobiz h1{font-size:21px;font-weight:800;margin:0 0 10px}' +
      '#ffp-nobiz p{font-size:14px;line-height:1.55;color:#b9ccd8;margin:0 0 8px;font-weight:400}' +
      '#ffp-nobiz b{color:#f2a900;font-weight:700}' +
      '#ffp-nobiz .act{display:flex;gap:10px;flex-wrap:wrap;margin-top:22px}' +
      '#ffp-nobiz button,#ffp-nobiz a{appearance:none;border:none;border-radius:12px;padding:13px 18px;' +
      'font:800 13px/1 Montserrat,sans-serif;cursor:pointer;text-decoration:none;display:inline-block}' +
      '#ffp-nobiz .pri{background:linear-gradient(180deg,#ffd868,#f2a900);color:#33230a}' +
      '#ffp-nobiz .sec{background:#1b3a4d;color:#eaf2f8}';
    document.head.appendChild(style);
    var d = document.createElement('div');
    d.id = 'ffp-nobiz';
    d.innerHTML = '<div class="bx"><h1>This account is not attached to a business</h1>' +
      '<p>You are signed in as <b>' + String(member.email || '').replace(/[<>&]/g, '') + '</b>, ' +
      'and no business on FFP lists that address as its owner or as staff.</p>' +
      '<p>If your manager has just added you, they need to use this exact address. ' +
      'If you have another account, sign in with that one.</p>' +
      '<div class="act"><button class="pri" id="ffp-nobiz-switch">Use a different account</button>' +
      '<a class="sec" href="https://ffppassport.com/">Go to FFP Passport</a></div></div>';
    document.body.appendChild(d);
    var b = document.getElementById('ffp-nobiz-switch');
    if (b) b.onclick = function () {
      try { localStorage.removeItem('ffp_member'); } catch (e) {}
      location.replace('/login?switch=1');
    };
  }

  async function bootProvider() {
    var supabase = window.supabase;
    if (!supabase || !supabase.from) {
      console.warn('[FFP Provider Auth v7] window.supabase not ready, waiting 200ms');
      setTimeout(bootProvider, 200);
      return;
    }
    // (a) v7: the stored JWT is already spent — renew it before asking
    // PostgREST anything, so this guard never races the boot refresh.
    var A = auth();
    if (A && A.getJwt && jwtExpired(A.getJwt())) {
      var renewed = await refreshOnce();
      if (!renewed) {
        toLogin('the stored session had expired and could not be renewed');
        return;
      }
      console.log('[FFP Provider Auth v7] stored JWT had expired, session renewed before lookup');
    }

    var lookup = await lookupProvider(supabase);

    // (b) v7: PostgREST rejected the token — one refresh, one retry. The single
    // client injects the stored JWT per request, so the retry carries the new one.
    if (lookup.error && isSessionError(lookup.error)) {
      var again = await refreshOnce();
      if (again) {
        console.log('[FFP Provider Auth v7] session renewed after ' + (lookup.error.code || '401') + ', retrying the lookup');
        lookup = await lookupProvider(supabase);
      }
    }

    if (lookup.error) {
      console.error('[FFP Provider Auth v8] portal entry failed:', lookup.error);
      toLogin('the partner record could not be read (' + (lookup.error.code || 'error') + ')');
      return;
    }

    var rows = Array.isArray(lookup.data) ? lookup.data : [];
    var biz  = pickBusiness(rows);
    if (!biz) {
      // Signed in, but nothing on FFP lists this address. Not a sign-in problem,
      // so do not send them back to the form: say what is wrong, on the page.
      console.warn('[FFP Provider Auth v8] ' + member.email + ' owns no business and is staff of none');
      noBusiness();
      return;
    }

    window.FFP_PROVIDER = {
      id:            biz.provider_id,          // the providers ROW id, not member.id
      member_id:     member.id,                 // kept for RLS lookups + member-side queries
      email:         member.email,
      role:          'provider',
      business_name: biz.business_name || member.full_name || '',
      status:        biz.status || 'pending',
      timezone:      biz.timezone || 'Asia/Dubai',  // facility timezone — governs all listing date/time (Tours, Events, Trips, Sessions)
      currency:      biz.currency || 'AED',          // facility currency — governs all price labels + charges
      payments_status:   biz.payments_status || 'not_connected',  // Stripe Connect state — gates publishing PAID listings
      stripe_account_id: biz.stripe_account_id || null,
      // The $99 Business gate reads this. It used to be fetched from the providers
      // row, which a staff member cannot select under RLS, so a coach was paywalled
      // out of Members, Sessions and Appointments — the sections their level grants.
      business_access:   !!biz.business_access,
      is_organizer:      !!biz.is_organizer,
      // v8: who this person is INSIDE that business.
      owned:         !!biz.owned,
      access_level:  biz.level || (biz.owned ? 'owner' : 'coach'),
      available:     rows        // every business they may run, for a switcher
    };
    // The sections arrive with the entry call, so the nav is correct on the first
    // paint instead of rendering whole and then shrinking a moment later.
    window.FFP_SECTIONS = Array.isArray(biz.sections) ? biz.sections : null;
    console.log('[FFP Provider Auth v8] Access granted ✓ ' + member.email + ' as ' +
                (biz.owned ? 'owner' : biz.level) + ' of ' + biz.business_name + ', ' +
                (window.FFP_SECTIONS ? window.FFP_SECTIONS.length : '?') + ' sections' +
                (rows.length > 1 ? ', ' + rows.length + ' businesses available' : ''));

    // Call dashboard's enterDashboard() if available (existing v3-era function).
    if (typeof window.enterDashboard === 'function') {
      try { window.enterDashboard(); } catch (e) {
        console.warn('[FFP Provider Auth v7] enterDashboard() threw:', e);
      }
    }
    document.dispatchEvent(new CustomEvent('ffp-provider-ready', { detail: window.FFP_PROVIDER }));
  }

  function ready() {
    bootProvider();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ready);
  } else {
    ready();
  }
})();
