/* FFP Location Picker - v1 (2026-05-31)
   v1: ONE shared country -> city cascade used identically by every form that asks for
       country + city (member signup/profile, provider profile, apply, listings). Behavioural
       only (no injected styling) so each form keeps its own look but the INTERACTION is the
       same everywhere. Data comes from window.FFP_TAX (assets/ffp-taxonomy.js).

   USAGE — give the two <select>s matching data attributes:
     <select id="pf-country" data-ffp-loc="country" data-ffp-group="profile"></select>
     <select id="pf-city"    data-ffp-loc="city"    data-ffp-group="profile"></select>
   Then on load, to prefill: FFPLocation.setValue('profile', countryName, cityName);
   To read: var v = FFPLocation.getValue('profile');  // {country, city}
*/
(function () {
  'use strict';

  function tax() { return (window.FFP_TAX && window.FFP_TAX.cities) ? window.FFP_TAX.cities : {}; }
  function countries() { return Object.keys(tax()).sort(); }
  function citiesFor(country) { var c = tax()[country]; return (c && c.slice) ? c.slice().sort() : []; }

  function opt(value, label, selected) {
    var o = document.createElement('option');
    o.value = value; o.textContent = (label == null ? value : label);
    if (selected) o.selected = true;
    return o;
  }

  function findGroup(group) {
    return {
      country: document.querySelector('[data-ffp-loc="country"][data-ffp-group="' + group + '"]'),
      city: document.querySelector('[data-ffp-loc="city"][data-ffp-group="' + group + '"]')
    };
  }

  function fillCountries(sel) {
    var cur = sel.value;
    sel.innerHTML = '';
    sel.appendChild(opt('', 'Choose country'));
    countries().forEach(function (c) { sel.appendChild(opt(c)); });
    sel.appendChild(opt('Other', 'Other'));
    if (cur) sel.value = cur;
  }

  function fillCities(citySel, country, keepCity) {
    var list = citiesFor(country);
    citySel.innerHTML = '';
    citySel.appendChild(opt('', list.length ? 'Choose city' : 'City'));
    list.forEach(function (c) { citySel.appendChild(opt(c)); });
    // allow a previously-saved / non-listed city to remain selectable
    if (keepCity && list.indexOf(keepCity) === -1) citySel.appendChild(opt(keepCity, keepCity, true));
    citySel.appendChild(opt('Other', 'Other / not listed'));
    if (keepCity) citySel.value = keepCity;
  }

  function wire(country, city) {
    if (!country || !city || country._ffpWired) return;
    country._ffpWired = true;
    fillCountries(country);
    fillCities(city, country.value, city.getAttribute('data-ffp-value') || '');
    country.addEventListener('change', function () { fillCities(city, country.value, ''); });
  }

  function initAll() {
    var seen = {};
    document.querySelectorAll('[data-ffp-loc="country"][data-ffp-group]').forEach(function (cEl) {
      var g = cEl.getAttribute('data-ffp-group');
      if (seen[g]) return; seen[g] = 1;
      var grp = findGroup(g);
      wire(grp.country, grp.city);
    });
  }

  window.FFPLocation = {
    init: initAll,
    setValue: function (group, country, city) {
      var grp = findGroup(group);
      if (!grp.country || !grp.city) return;
      if (!grp.country._ffpWired) wire(grp.country, grp.city);
      if (country) {
        if (![].slice.call(grp.country.options).some(function (o) { return o.value === country; }))
          grp.country.appendChild(opt(country));
        grp.country.value = country;
      }
      fillCities(grp.city, grp.country.value, city || '');
    },
    getValue: function (group) {
      var grp = findGroup(group);
      return { country: grp.country ? grp.country.value : '', city: grp.city ? grp.city.value : '' };
    },
    refresh: initAll
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initAll);
  else initAll();
  // Re-init when the DB taxonomy finishes hydrating FFP_TAX.cities, so admin edits to
  // Countries/Cities appear in the dropdowns without a hard refresh.
  document.addEventListener('ffp-tax-ready', function () { try { initAll(); } catch (e) {} });
})();
