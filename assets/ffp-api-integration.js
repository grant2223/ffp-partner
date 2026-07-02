/* =============================================================
   v12 FFP Passport — API Integration Module
   v12 (2026-06-04): KEEP MEMBERS SIGNED IN + silent refresh + single client.
     - ONE Supabase client (created once) with a dynamic-header fetch wrapper that injects the current
       member JWT per request → kills the "Multiple GoTrueClient instances" warning AND lets a refreshed
       JWT take effect immediately (no client rebuild).
     - "Keep me signed in" toggle: when ON (default) tokens live in localStorage (survive browser close);
       when OFF they live in sessionStorage (cleared when the browser closes — for shared/public devices).
     - Silent refresh: long-lived ffp_refresh token is exchanged at /api/auth/refresh for a fresh 7-day
       access JWT, on app boot (best-effort) and once on a 401 before giving up. A refresh MISS never logs
       the member out (fail-safe), so deploy order (backend-first) is non-fragile.
=========== */
(function (window) {
  'use strict';
  var SUPABASE_URL = 'https://kxzyuofecmtymablnmak.supabase.co';
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt4enl1b2ZlY210eW1hYmxubWFrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0NDM1MTYsImV4cCI6MjA5NTAxOTUxNn0.cWn0x1AeD-x9C-HHf9MShXbFRWdkWi5RMgHLgWJwOuE';
  var SUPABASE_SDK = null;

  var API_BASE   = 'https://ffp-passport-backend.vercel.app';
  var TOKEN_KEY   = 'ffp_token';
  var MEMBER_KEY  = 'ffp_member';
  var JWT_KEY     = 'ffp_jwt';        // short-lived Supabase HS256 JWT for RLS auth.uid()
  var REFRESH_KEY = 'ffp_refresh';    // v12: long-lived refresh token
  var PERSIST_KEY = 'ffp_persist';    // v12: '1' = keep signed in (localStorage), '0' = session-only

  // ── v12: storage abstraction ──────────────────────────────────────────────
  // The PERSIST flag itself ALWAYS lives in localStorage, so a reload knows which store to read.
  // Default is "keep me signed in" (ON) — so members already signed in (tokens in localStorage) are
  // NOT logged out by this upgrade.
  function persistOn() {
    try { return localStorage.getItem(PERSIST_KEY) !== '0'; } catch (e) { return true; }
  }
  function store() {
    try { return persistOn() ? window.localStorage : window.sessionStorage; }
    catch (e) { return window.localStorage; }
  }
  function sget(k) { try { return store().getItem(k); } catch (e) { return null; } }
  function sset(k, v) { try { store().setItem(k, v); } catch (e) {} }
  function sdelBoth(k) { try { localStorage.removeItem(k); } catch (e) {} try { sessionStorage.removeItem(k); } catch (e) {} }

  // ── v12: single Supabase client with a dynamic Authorization header ─────────
  function buildSupabaseClient() {
    if (!SUPABASE_SDK || !SUPABASE_SDK.createClient) return;
    try {
      window.supabase = SUPABASE_SDK.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        global: {
          fetch: function (input, init) {
            init = init || {};
            var headers;
            try { headers = new Headers(init.headers || {}); } catch (e) { headers = new Headers(); }
            var _url = (typeof input === 'string') ? input : ((input && input.url) || '');
            var jwt = FFPAuth.getJwt();
            // Inject the member JWT for DATA (RLS) calls ONLY. Supabase AUTH endpoints (/auth/v1/*) MUST keep the
            // anon key — sending a member JWT there makes GoTrue reject it (403 on verify/login). This is why
            // re-login failed once a token was stored: the stored JWT was being sent on /auth/v1/verify.
            if (jwt && _url.indexOf('/auth/v1/') === -1) headers.set('Authorization', 'Bearer ' + jwt);   // member identity for RLS (data only)
            init.headers = headers;
            return fetch(input, init);
          }
        }
      });
      console.log('[FFP v12] Supabase client ready (single instance; JWT injected per-request)');
    } catch (e) {
      console.error('[FFP v12] Supabase init failed:', e);
    }
  }

  if (window.supabase && window.supabase.createClient) {
    SUPABASE_SDK = window.supabase;   // cache the SDK BEFORE overwriting window.supabase with the client
    buildSupabaseClient();
  } else {
    console.warn('[FFP] Supabase SDK not found — ensure the CDN script tag loads BEFORE ffp-api-integration.js');
  }

  var FFPAuth = {
    // persistence choice
    setPersist: function (on) {
      try { localStorage.setItem(PERSIST_KEY, on ? '1' : '0'); } catch (e) {}
    },
    getPersist: function () { return persistOn(); },

    getToken:  function () { return sget(TOKEN_KEY); },
    setToken:  function (t) { sset(TOKEN_KEY, t); },
    getMember: function () { try { var raw = sget(MEMBER_KEY); return raw ? JSON.parse(raw) : null; } catch (e) { return null; } },
    setMember: function (m) { try { sset(MEMBER_KEY, JSON.stringify(m)); } catch (e) {} },
    getJwt:     function () { return sget(JWT_KEY); },
    setJwt:     function (j) { sset(JWT_KEY, j || ''); },
    getRefresh: function () { return sget(REFRESH_KEY); },
    setRefresh: function (r) { sset(REFRESH_KEY, r || ''); },

    // v12: kept for API compatibility. The single client now injects the JWT per-request, so there is
    // nothing to rebuild — a stored JWT is used automatically on the next query.
    applySupabaseSession: function () {
      if (!window.supabase && SUPABASE_SDK) buildSupabaseClient();
      return Promise.resolve({ success: true });
    },

    // v12: exchange the long-lived refresh token for a fresh access JWT. Fail-safe: a miss returns null
    // and leaves the current session untouched (never logs the member out on a refresh failure).
    refreshSession: function () {
      var rt = this.getRefresh();
      if (!rt) return Promise.resolve(null);
      return fetch(API_BASE + '/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ refresh: rt })
      }).then(function (r) { return r.ok ? r.json() : null; }).then(function (res) {
        if (res && res.jwt) {
          FFPAuth.setJwt(res.jwt);
          if (res.refresh) FFPAuth.setRefresh(res.refresh);   // rotate
          if (res.member) FFPAuth.setMember(res.member);
          return res;
        }
        return null;
      }).catch(function () { return null; });
    },

    clear: function () {
      sdelBoth(TOKEN_KEY); sdelBoth(MEMBER_KEY); sdelBoth(JWT_KEY); sdelBoth(REFRESH_KEY);
      // leave PERSIST_KEY (the device preference) alone
      buildSupabaseClient();   // back to anon (the fetch wrapper now sees no JWT)
    },
    isAuthenticated: function () { return !!this.getMember(); }
  };

  function call(path, options) {
    options = options || {};
    var headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
    var token = FFPAuth.getToken();
    if (token) headers['Authorization'] = 'Bearer ' + token;
    var fetchOpts = { method: options.method || 'GET', headers: headers, mode: 'cors', credentials: 'omit' };
    if (options.body) fetchOpts.body = JSON.stringify(options.body);
    return fetch(API_BASE + path, fetchOpts).then(function (res) {
      if (res.status === 401) {
        // v12: try a silent refresh ONCE before logging the member out.
        if (!options._retried) {
          return FFPAuth.refreshSession().then(function (r) {
            if (r && r.jwt) { options._retried = true; return call(path, options); }
            FFPAuth.clear();
            if (!/login\.html$/.test(window.location.pathname)) window.location.href = 'login.html';
            return { error: 'Unauthorized' };
          });
        }
        FFPAuth.clear();
        if (!/login\.html$/.test(window.location.pathname)) window.location.href = 'login.html';
        return { error: 'Unauthorized' };
      }
      return res.json().catch(function () { return { error: 'Invalid JSON response' }; });
    }).catch(function (err) {
      console.error('FFPApi call failed:', path, err);
      return { error: err && err.message ? err.message : 'Network error' };
    });
  }

  var FFPApi = {
    requestCode: function (email, fullName, flow) {
      var path; var body = { email: email };
      if (flow === 'signup') { path = '/api/auth/signup'; if (fullName) body.full_name = fullName; }
      else if (flow === 'reset' || flow === 'signin') { path = '/api/auth/reset'; }
      else { return Promise.resolve({ error: 'Unknown flow: ' + flow }); }
      return call(path, { method: 'POST', body: body });
    },
    verifyCode: function (email, code, flow) {
      return call('/api/auth/signin', { method: 'POST', body: { email: email, code: code } }).then(function (res) {
        if (res && res.token) {
          FFPAuth.setToken(res.token);
          if (res.member) FFPAuth.setMember(res.member);
          if (res.refresh) FFPAuth.setRefresh(res.refresh);   // v12
          if (res.jwt) {
            FFPAuth.setJwt(res.jwt);
            return FFPAuth.applySupabaseSession().then(function () { return res; });
          }
        }
        return res;
      });
    },
    applyOnboardResponse: function (res) {
      if (!res) return Promise.resolve(res);
      if (res.member) FFPAuth.setMember(res.member);
      if (res.refresh) FFPAuth.setRefresh(res.refresh);   // v12
      if (res.jwt) {
        FFPAuth.setJwt(res.jwt);
        return FFPAuth.applySupabaseSession().then(function () { return res; });
      }
      return Promise.resolve(res);
    },
    getMemberProfile: function () { return call('/api/members/me'); },
    getDeals: function (filters) { var q = filters ? '?' + new URLSearchParams(filters).toString() : ''; return call('/api/deals' + q); },
    redeemDeal: function (dealId) { return call('/api/deals/' + dealId + '/redeem', { method: 'POST' }); },
    getVenueProfile: function () { return call('/api/provider/venue'); },
    getVenueStats: function () { return call('/api/provider/stats'); },
    getAdminDashboard: function () { return call('/api/admin/dashboard'); }
  };

  function handleAPIError(error, fallback) {
    console.error('FFP API error:', error);
    var msg = (error && error.message) || fallback || 'Something went wrong.';
    alert(msg);
  }

  function autoInit() {
    // v12: best-effort silent refresh on every boot → active members get a fresh 7-day JWT and are
    // effectively never logged out (as long as they open the app within the refresh token's 365-day life).
    // Non-blocking; loaders already poll for window.supabase. A failure leaves the existing session intact.
    if (FFPAuth.getRefresh()) { FFPAuth.refreshSession(); }

    var path = window.location.pathname.toLowerCase();
    if (path.indexOf('ffp-member-dashboard') !== -1) {
      if (!FFPAuth.isAuthenticated()) { if (path.indexOf('login') === -1) window.location.href = 'login.html'; return; }
      var stored = FFPAuth.getMember();
      if (stored) applyProfileToDashboard(stored);
      return;
    }
    if (path.indexOf('ffp-provider') !== -1) {
      if (!FFPAuth.isAuthenticated()) return;
      var v = FFPAuth.getMember();
      if (v) {
        var nameEl = document.querySelector('[data-venue-name]');
        if (nameEl && v.full_name) nameEl.textContent = v.full_name;
      }
      return;
    }
  }

  function applyProfileToDashboard(profile) {
    var map = {
      'pass-name': profile.full_name,
      'pass-passport-num': profile.passport_no || profile.passport_number,
      'pass-email': profile.email
    };
    Object.keys(map).forEach(function (id) {
      var el = document.getElementById(id);
      if (el && map[id]) el.textContent = map[id];
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoInit);
  } else {
    autoInit();
  }

  window.FFPAuth = FFPAuth;
  window.FFPApi = FFPApi;
  window.handleAPIError = handleAPIError;
  window.ffpLogout = function () {
    FFPAuth.clear();
    window.location.href = 'login.html';
  };
})(window);
