/* FFP Analytics — Google Analytics 4 (GA4)  [created 2026-06-08]
   Single shared include for the whole platform. Add this to each page's <head>:
       <script src="assets/ffp-analytics.js"></script>
   The Measurement ID lives ONLY here, so changing/rotating it is a one-line edit.

   This is the standard gtag.js install: it loads the GA library async and fires the
   automatic page_view on load. (The app dashboards are single-page — panel switches are
   NOT separate page loads, so they won't auto-fire page_views. If we want per-panel
   tracking later, call:  window.gtag('event','page_view',{page_title:'<panel>', page_path:'/<panel>'})
   on panel change — gtag is exposed globally below.) */
(function () {
  var GA_ID = 'G-VBHD4M7YSP';

  // Don't double-install if the page already loaded this (e.g. include added twice).
  if (window.__ffpGaLoaded) return;
  window.__ffpGaLoaded = true;

  var s = document.createElement('script');
  s.async = true;
  s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
  (document.head || document.documentElement).appendChild(s);

  window.dataLayer = window.dataLayer || [];
  function gtag() { dataLayer.push(arguments); }
  window.gtag = gtag;
  gtag('js', new Date());
  gtag('config', GA_ID);

  // SPA helper — the app dashboards don't reload the page when switching panels, so GA only sees
  // ONE page_view (on load). Call this on each panel switch to record a virtual page_view, so the GA4
  // Pages/Screens report shows which panels members/partners/admins actually use.
  //   window.ffpTrackView('member/fitness-stats', 'Member · Fitness Stats')
  window.ffpTrackView = function (path, title) {
    try {
      if (typeof window.gtag !== 'function') return;
      var p = '/' + String(path || '').replace(/^\/+/, '');
      window.gtag('event', 'page_view', { page_title: title || p, page_path: p, page_location: location.origin + p });
    } catch (e) {}
  };
})();
