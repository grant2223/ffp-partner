/* FFP Provider Auth Gate — v5 (PROVIDER-ROW LOOKUP)
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
    console.warn('[FFP Provider Auth v4] Could not parse ffp_member:', e);
  }

  // ─── No signed-in member at all → bounce to /login ───
  if (!member || !member.id) {
    console.warn('[FFP Provider Auth v4] No signed-in member — redirecting to /login');
    location.href = '/login';
    return;
  }

  // ─── Wrong role → bounce to whichever dashboard matches their role ───
  if (member.role !== 'provider') {
    console.warn('[FFP Provider Auth v4] role="' + member.role + '" is not provider — redirecting');
    if (member.role === 'admin') {
      location.href = '/ffp-admin-dashboard.html';
    } else {
      location.href = '/ffp-member-dashboard.html';
    }
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
  async function bootProvider() {
    var supabase = window.supabase;
    if (!supabase || !supabase.from) {
      console.warn('[FFP Provider Auth v5] window.supabase not ready — waiting 200ms');
      setTimeout(bootProvider, 200);
      return;
    }
    var lookup = await supabase
      .from('providers')
      .select('id, business_name, status, owner_user_id, timezone, currency, payments_status, stripe_account_id')
      .eq('owner_user_id', member.id)
      .maybeSingle();

    if (lookup.error) {
      console.error('[FFP Provider Auth v5] providers lookup failed:', lookup.error);
      location.href = '/login';
      return;
    }
    if (!lookup.data) {
      console.warn('[FFP Provider Auth v5] No providers row for member.id=' + member.id + ' — provider has signed up but no provider record exists yet. Bouncing to /login. Admin or onboarding flow must create the providers row.');
      // TODO post-launch: redirect to a "provider application pending"
      // page instead of /login, so the user gets context not a sign-in screen.
      location.href = '/login';
      return;
    }

    window.FFP_PROVIDER = {
      id:            lookup.data.id,            // v5: providers ROW id (not member.id)
      member_id:     member.id,                 // v5: kept for RLS lookups + member-side queries
      email:         member.email,
      role:          'provider',
      business_name: lookup.data.business_name || member.full_name || '',
      status:        lookup.data.status || 'pending',
      timezone:      lookup.data.timezone || 'Asia/Dubai',  // facility timezone — governs all listing date/time (Tours, Events, Trips, Sessions)
      currency:      lookup.data.currency || 'AED',          // facility currency — governs all price labels + charges
      payments_status:   lookup.data.payments_status || 'not_connected',  // Stripe Connect state — gates publishing PAID listings
      stripe_account_id: lookup.data.stripe_account_id || null
    };
    console.log('[FFP Provider Auth v5] Access granted ✓ ' + member.email + ' · provider_id=' + lookup.data.id);

    // Call dashboard's enterDashboard() if available (existing v3-era function).
    if (typeof window.enterDashboard === 'function') {
      try { window.enterDashboard(); } catch (e) {
        console.warn('[FFP Provider Auth v5] enterDashboard() threw:', e);
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
