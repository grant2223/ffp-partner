/* FFP shared time helper — v1 (2026-06-12)
 * ONE source of truth for facility-timezone date/time handling across every partner listing
 * (Tours, Events, Trips, Sessions). Partners enter wall-clock time in THEIR facility's timezone;
 * we store the absolute instant (timestamptz / ISO-UTC) and render back in the facility tz.
 *
 * Facility tz comes from window.FFP_PROVIDER.timezone (set by ffp-provider-auth.js), default Asia/Dubai.
 * Library-free: uses Intl.DateTimeFormat to resolve the zone offset at a given instant (DST-correct).
 *
 * API:
 *   FFPTime.tz()                 -> current facility IANA tz string
 *   FFPTime.toUTC('2026-06-13T06:00')  -> ISO-UTC string (interprets input as wall time in facility tz)
 *   FFPTime.toUTC('2026-06-13')        -> ISO-UTC for local midnight (date-only inputs, e.g. Trips)
 *   FFPTime.toInput(iso)         -> 'YYYY-MM-DDTHH:MM' in facility tz (prefill <input type=datetime-local>)
 *   FFPTime.toDateInput(iso)     -> 'YYYY-MM-DD' in facility tz (prefill <input type=date>)
 *   FFPTime.toTimeInput(iso)     -> 'HH:MM' in facility tz (prefill <input type=time>)
 *   FFPTime.fmt(iso, opts)       -> localized display string in facility tz
 *   FFPTime.addMinutes(iso, n)   -> ISO-UTC shifted by n minutes (for end times)
 *   FFPTime.list()               -> array of selectable IANA zones (full where supported, else curated)
 */
(function () {
  'use strict';

  function tz() {
    return (window.FFP_PROVIDER && window.FFP_PROVIDER.timezone) ||
           window.FFP_TZ || 'Asia/Dubai';
  }

  // Offset in ms between the given instant's wall-clock in `zone` and UTC.
  function offsetMs(date, zone) {
    try {
      var dtf = new Intl.DateTimeFormat('en-US', {
        timeZone: zone, hourCycle: 'h23',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
      });
      var p = {};
      dtf.formatToParts(date).forEach(function (x) { p[x.type] = x.value; });
      var asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
      return asUTC - date.getTime();
    } catch (e) { return 0; }
  }

  // Wall-clock time (in facility tz) -> ISO-UTC string.
  function toUTC(local, zone) {
    zone = zone || tz();
    if (!local) return null;
    var s = String(local).trim().replace(' ', 'T');
    var seg = s.split('T');
    var d = (seg[0] || '').split('-');
    var t = (seg[1] || '00:00').split(':');
    var y = +d[0], mo = +d[1], da = +d[2], h = +(t[0] || 0), mi = +(t[1] || 0);
    if (!y || !mo || !da) return null;
    var asIfUTC = Date.UTC(y, mo - 1, da, h, mi, 0);
    // Two passes to settle DST/offset boundaries correctly.
    var off = offsetMs(new Date(asIfUTC), zone);
    off = offsetMs(new Date(asIfUTC - off), zone);
    return new Date(asIfUTC - off).toISOString();
  }

  function parts(iso, zone) {
    zone = zone || tz();
    var p = {};
    try {
      var dtf = new Intl.DateTimeFormat('en-CA', {
        timeZone: zone, hourCycle: 'h23',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit'
      });
      dtf.formatToParts(new Date(iso)).forEach(function (x) { p[x.type] = x.value; });
    } catch (e) {}
    return p;
  }

  function toInput(iso, zone) {
    if (!iso) return '';
    var p = parts(iso, zone);
    if (!p.year) return '';
    return p.year + '-' + p.month + '-' + p.day + 'T' + p.hour + ':' + p.minute;
  }
  function toDateInput(iso, zone) {
    if (!iso) return '';
    var p = parts(iso, zone);
    if (!p.year) return '';
    return p.year + '-' + p.month + '-' + p.day;
  }
  function toTimeInput(iso, zone) {
    if (!iso) return '';
    var p = parts(iso, zone);
    if (!p.hour) return '';
    return p.hour + ':' + p.minute;
  }

  function fmt(iso, opts, zone) {
    if (!iso) return '';
    zone = zone || tz();
    var o = {};
    if (opts) for (var k in opts) if (opts.hasOwnProperty(k)) o[k] = opts[k];
    o.timeZone = zone;
    try { return new Date(iso).toLocaleString([], o); } catch (e) { return ''; }
  }

  function addMinutes(iso, n) {
    if (!iso) return null;
    return new Date(new Date(iso).getTime() + (n || 0) * 60000).toISOString();
  }

  // Selectable timezone list — full IANA set where the browser supports it, else a curated fallback.
  function list() {
    try {
      if (typeof Intl.supportedValuesOf === 'function') {
        var v = Intl.supportedValuesOf('timeZone');
        if (v && v.length) return v.slice();
      }
    } catch (e) {}
    return [
      'Asia/Dubai', 'Asia/Riyadh', 'Asia/Qatar', 'Asia/Kuwait', 'Asia/Muscat', 'Asia/Bahrain',
      'Asia/Karachi', 'Asia/Kolkata', 'Asia/Dhaka', 'Asia/Bangkok', 'Asia/Singapore',
      'Asia/Hong_Kong', 'Asia/Tokyo', 'Asia/Shanghai', 'Australia/Sydney',
      'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Moscow', 'Europe/Istanbul',
      'Africa/Cairo', 'Africa/Johannesburg', 'Africa/Nairobi', 'Africa/Lagos',
      'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
      'America/Sao_Paulo', 'UTC'
    ];
  }

  window.FFPTime = {
    tz: tz, toUTC: toUTC, toInput: toInput, toDateInput: toDateInput,
    toTimeInput: toTimeInput, fmt: fmt, addMinutes: addMinutes, list: list
  };
})();
