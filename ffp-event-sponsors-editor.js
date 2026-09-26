/* FFP shared sponsor editor — leagues / tournaments / competitions partner consoles.
   window.FFPSponsors.render(hostEl, { scope:'league'|'tourn'|'comp', eventId, entrants })

   A BOARD BELONGS TO ONE OWNER. entrant_id null is the event's own board; set
   is that club's. The two are never merged — an event sponsor and a club's
   sponsor are different boards and never appear on screen together.

   Four tiers drive size and order ON a board. Tier is never a way to filter
   one.

   TRANSPARENCY. The broadcast board knocks each mark out to white so it sits
   on the club's colour with nothing behind it. A file with no alpha channel
   cannot be knocked out — it becomes a solid white rectangle — so it has to be
   shown on a plate instead. That is decided ONCE here, at upload, because CSS
   cannot inspect an image and the broadcast card runs no JavaScript. The
   organiser is also the only person who can ask the sponsor for a better file,
   and the only moment they will is this one.

   Uploads go to the public event-sponsors bucket via FFPUpload.pick; writes go
   through event_sponsor_save / event_sponsor_remove (owner-gated). */
(function () {
  var sb = function () { return window.supabase; };
  var toast = function (m, k) { if (window.showToast) showToast(m, k || 'info'); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }
  /* esc() does NOT escape a single quote, and a logo URL is rendered inside a
     CSS url('...'). A value carrying a quote or a bracket closes that url()
     and injects arbitrary CSS into the dashboard. The database refuses one
     now, but rows written before that rule exists still have to be safe to
     draw, so anything that is not a plain http(s) URL renders as no image. */
  function safeUrl(u) {
    var s = String(u == null ? '' : u).trim();
    return /^https?:\/\/[^\s"'()\\<>]+$/.test(s) ? s : '';
  }

  var TIERS = [['title', 'Title partner'], ['major', 'Major partner'],
               ['supporting', 'Official partner'], ['community', 'Community partner']];
  function tierName(k) {
    // 'partner' is what the old two-tier editor wrote
    var t = String(k || 'supporting'); if (t === 'partner') t = 'supporting';
    for (var i = 0; i < TIERS.length; i++) if (TIERS[i][0] === t) return TIERS[i][1];
    return 'Official partner';
  }
  function tierOpts(cur) {
    var c = String(cur || 'supporting'); if (c === 'partner') c = 'supporting';
    return TIERS.map(function (t) {
      return '<option value="' + t[0] + '"' + (t[0] === c ? ' selected' : '') + '>' + esc(t[1]) + '</option>';
    }).join('');
  }

  /* ── does this file actually have transparency? ──────────────────────
     Drawn to a canvas and every 4th byte checked. An image that is opaque
     everywhere cannot be knocked out. Reading pixels needs the image to be
     CORS-clean; the sponsor bucket is public and served with the right header,
     but if the read is ever refused we return null — unknown — rather than
     guessing, and the board falls back to the safe treatment (the plate). */
  function detectAlpha(url) {
    return new Promise(function (resolve) {
      try {
        var img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = function () {
          try {
            var w = Math.min(img.naturalWidth || 1, 160), h = Math.min(img.naturalHeight || 1, 160);
            var c = document.createElement('canvas'); c.width = w; c.height = h;
            var x = c.getContext('2d'); x.drawImage(img, 0, 0, w, h);
            var d = x.getImageData(0, 0, w, h).data;
            for (var i = 3; i < d.length; i += 4) { if (d[i] < 250) { resolve(true); return; } }
            resolve(false);
          } catch (e) { resolve(null); }
        };
        img.onerror = function () { resolve(null); };
        img.src = url;
      } catch (e) { resolve(null); }
    });
  }

  /* The optical multiplier for the mark's shape. Equal bounding boxes are not
     equal visual weight: a wide wordmark has to come down or it swamps the
     board, a stacked mark has to come up. Measured once here, stored on the
     row, because the broadcast card cannot measure an image. */
  function opticalScale(url) {
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () {
        var a = (img.naturalWidth || 1) / (img.naturalHeight || 1);
        resolve(a > 4 ? 0.80 : a > 2.5 ? 0.88 : a > 1.4 ? 1.0 : a > 0.8 ? 1.06 : 1.15);
      };
      img.onerror = function () { resolve(1); };
      img.src = url;
    });
  }

  function injectCss() {
    if (document.getElementById('ffp-spx-css')) return;
    var s = document.createElement('style'); s.id = 'ffp-spx-css';
    s.textContent =
      '.spx{max-width:860px}' +
      '.spx-hint{font-size:12.5px;color:#8a99a8;font-weight:600;margin:0 0 14px;line-height:1.5}' +
      '.spx-scope{display:flex;align-items:flex-end;gap:14px;padding:2px 0 16px;border-bottom:1px solid #e6ebf0;flex-wrap:wrap}' +
      '.spx-scope .f{display:flex;flex-direction:column;gap:6px;min-width:0;flex:0 0 340px}' +
      '.spx-scope label{font-size:11px;font-weight:800;color:#43525c}' +
      '.spx-count{font-size:12.5px;font-weight:800;color:#8a99a8;padding:12px 0 2px;line-height:1.5}' +
      '.spx-row{display:flex;align-items:flex-start;gap:14px;padding:14px 0;border-bottom:1px solid #e6ebf0}' +
      /* the thumbnail shows the treatment the BOARD will give it, so the
         organiser is looking at the outcome rather than at the file */
      '.spx-lg{width:96px;height:52px;border-radius:9px;flex:none;position:relative;overflow:hidden;background:#12293D}' +
      '.spx-lg:after{content:"";position:absolute;inset:7px;background-image:var(--u);background-size:contain;background-repeat:no-repeat;background-position:50%;filter:brightness(0) invert(1)}' +
      '.spx-lg.opaque{background:#fff;border:1px solid #e6ebf0}' +
      '.spx-lg.opaque:after{filter:none}' +
      '.spx-m{flex:1;min-width:0}' +
      '.spx-nm{font-weight:900;font-size:14.5px;color:#12232f}' +
      /* tier reads in weight and colour. The old editor drew it as a rounded
         chip, which is the pill the FFP checklist bans. */
      '.spx-tier{font-size:11px;font-weight:900;letter-spacing:.14em;margin-top:3px}' +
      '.spx-tier.t-title{color:#9a6a00}.spx-tier.t-major{color:#1980AD}' +
      '.spx-tier.t-supporting,.spx-tier.t-community{color:#7c8b97}' +
      '.spx-tr{margin-top:7px;font-size:12.5px;font-weight:600;line-height:1.45;display:flex;align-items:flex-start;gap:7px;max-width:640px}' +
      '.spx-tr .ms{font-size:17px;flex:none}' +
      '.spx-tr .tx{flex:1;min-width:0}' +
      '.spx-ok{color:#1c7a47}.spx-warn{color:#8a5a00}' +
      '.spx-link{font-size:11.5px;color:#8a99a8;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:300px;margin-top:4px}' +
      '.spx-del{background:none;border:none;color:#c0392b;font-weight:800;font-size:13px;cursor:pointer;flex:none}' +
      '.spx-empty{padding:16px 0;color:#8a99a8;font-size:13px;font-weight:600}' +
      '.spx-add{margin-top:18px;display:flex;align-items:flex-end;gap:14px;flex-wrap:wrap}' +
      '.spx-fld{display:flex;flex-direction:column;gap:6px;min-width:0}' +
      '.spx-fld.gr{flex:1 1 200px}.spx-fld.sm{flex:0 0 210px}' +
      '.spx-add label{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.4px;color:#8a99a8}' +
      '.spx-add input,.spx-add select{border:1px solid #dbe3ea;border-radius:10px;height:44px;padding:0 12px;font-family:inherit;font-size:14px;color:#12232f;background:#fff;box-sizing:border-box;min-width:0}' +
      '.spx-up{flex:0 0 160px;height:92px;border:1.5px dashed #cfd9e2;border-radius:12px;cursor:pointer;background:#fafcfe;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;color:#8a99a8}' +
      '.spx-up .pv{width:100%;height:100%;border-radius:10px;background:center/contain no-repeat;display:flex;align-items:center;justify-content:center;font-size:24px}' +
      '.spx-up b{font-size:12px;color:#12232f;font-weight:800}' +
      '.spx-btn{height:44px;background:linear-gradient(180deg,#ffce4d,#f2a900);color:#3a2600;border:none;border-radius:11px;padding:0 20px;font-weight:900;font-size:14px;cursor:pointer}' +
      '.spx-note{flex:1 1 100%;font-size:12.5px;font-weight:600;color:#7c8b97;margin-top:10px;line-height:1.5}' +
      '.spx-note b{color:#12232f;font-weight:800}';
    document.head.appendChild(s);
  }

  function boardOpts(entrants, cur) {
    var o = '<option value=""' + (!cur ? ' selected' : '') + '>Event sponsors</option>';
    (entrants || []).forEach(function (e) {
      o += '<option value="' + esc(e.id) + '"' + (e.id === cur ? ' selected' : '') + '>'
        + esc(e.team_name || e.name || 'Team') + '</option>';
    });
    return o;
  }

  var W = {
    _host: null, _scope: null, _event: null, _entrants: [],
    _board: null,           // null = the event's own board
    _logo: null, _alpha: null, _scale: null,

    render: async function (host, opt) {
      if (!host) return;
      injectCss();
      if (opt) {
        W._host = host; W._scope = opt.scope; W._event = opt.eventId;
        if (opt.entrants) W._entrants = opt.entrants;
      }
      host = W._host;
      W._logo = null; W._alpha = null; W._scale = null;
      host.innerHTML = '<div class="spx"><div class="spx-hint">Loading sponsors…</div></div>';

      var r;
      try {
        r = await sb().rpc('event_sponsors_list',
          { p_scope: W._scope, p_event: W._event, p_entrant: W._board });
      } catch (e) { r = { error: e }; }
      if (r && r.error) { toast(r.error.message || 'Could not load sponsors', 'error'); }
      var list = (r && !r.error && r.data) ? r.data : [];

      var whose = W._board
        ? (function () {
            for (var i = 0; i < W._entrants.length; i++)
              if (W._entrants[i].id === W._board) return W._entrants[i].team_name || W._entrants[i].name;
            return 'this club';
          })()
        : 'the event';

      var rowsHtml = list.length ? list.map(function (s) {
        var opaque = s.has_alpha === false;
        var treat = opaque
          ? '<div class="spx-tr spx-warn"><span class="ms">info</span><span class="tx">'
            + 'No transparency, so it shows on a white plate. '
            + '<b>Send a PNG with a transparent background</b> for the clean version.</span></div>'
          : (s.has_alpha === true
            ? '<div class="spx-tr spx-ok"><span class="ms">check_circle</span><span class="tx">'
              + 'Transparent PNG, knocks out clean on the broadcast board.</span></div>'
            : '<div class="spx-tr spx-warn"><span class="ms">info</span><span class="tx">'
              + 'Transparency not checked on this file — the board will play it safe and use a '
              + 'plate. Re-upload it to check.</span></div>');
        var tier = String(s.tier || 'supporting'); if (tier === 'partner') tier = 'supporting';
        return '<div class="spx-row">'
          + '<span class="spx-lg' + (opaque ? ' opaque' : '') + '" style="--u:url(&quot;' + esc(safeUrl(s.logo_url)) + '&quot;)"></span>'
          + '<div class="spx-m"><div class="spx-nm">' + esc(s.name || 'Sponsor') + '</div>'
          + '<div class="spx-tier t-' + esc(tier) + '">' + esc(tierName(tier).toUpperCase()) + '</div>'
          + (s.link_url ? '<div class="spx-link">' + esc(s.link_url) + '</div>' : '')
          + treat + '</div>'
          + '<button class="spx-del" onclick="FFPSponsors.remove(\'' + s.id + '\')">Remove</button>'
          + '</div>';
      }).join('') : '<div class="spx-empty">No sponsors on this board yet.</div>';

      host.innerHTML =
        '<div class="spx">' +
          '<div class="spx-hint">Sponsors show on your listing and on the livestream partner ' +
            'board. A sponsor belongs either to the event or to one club, and the two never ' +
            'share a board.</div>' +
          '<div class="spx-scope"><div class="f"><label>Who are these sponsors for?</label>' +
            '<select id="spx-board" onchange="FFPSponsors.setBoard(this.value)">' +
            boardOpts(W._entrants, W._board) + '</select></div></div>' +
          '<div class="spx-count">' + list.length + ' sponsor' + (list.length === 1 ? '' : 's')
            + ' for ' + esc(whose) + '. Event sponsors are a separate board and are never mixed '
            + 'in with a club\'s.</div>' +
          rowsHtml +
          '<div class="spx-add">' +
            '<div class="spx-up" id="spx-up" onclick="FFPSponsors.pick()">' +
              '<span class="pv" id="spx-pv">+</span></div>' +
            '<div class="spx-fld gr"><label>Sponsor name</label>' +
              '<input id="spx-name" placeholder="Sponsor name"></div>' +
            '<div class="spx-fld sm"><label>Tier</label>' +
              '<select id="spx-tier">' + tierOpts('supporting') + '</select></div>' +
            '<div class="spx-fld gr"><label>Link (optional)</label>' +
              '<input id="spx-link" placeholder="https://…"></div>' +
            '<button class="spx-btn" onclick="FFPSponsors.add()">Add sponsor</button>' +
            '<div class="spx-note" id="spx-note"><b>Send a PNG with a transparent background.</b> ' +
              'The broadcast board knocks each logo out in white so it sits on the club\'s colour ' +
              'with nothing behind it. A JPG carries its own white box, which cannot be removed, ' +
              'so it has to be shown on a white plate instead.</div>' +
          '</div>' +
        '</div>';
    },

    setBoard: function (v) { W._board = v || null; W.render(); },

    pick: function () {
      if (!window.FFPUpload || !FFPUpload.pick) { toast('Upload unavailable', 'error'); return; }
      FFPUpload.pick({
        bucket: 'event-sponsors', key: 'spon-' + W._event + '-' + Date.now(),
        title: 'Sponsor logo',
        onDone: async function (url) {
          W._logo = url;
          var pv = document.getElementById('spx-pv');
          var su = safeUrl(url);
          if (pv && su) { pv.style.backgroundImage = 'url("' + su + '")'; pv.textContent = ''; }
          // decided once, here: the board cannot work this out at play-out
          W._alpha = await detectAlpha(url);
          W._scale = await opticalScale(url);
          var note = document.getElementById('spx-note');
          if (note) {
            note.innerHTML = W._alpha === true
              ? '<b>Transparent background found.</b> This one knocks out clean on the broadcast board.'
              : (W._alpha === false
                ? '<b>No transparent background.</b> This logo will be shown on a white plate. '
                  + 'Ask the sponsor for a PNG with a transparent background if you want the clean version.'
                : '<b>Could not check this file for transparency.</b> The board will play it safe '
                  + 'and use a white plate.');
          }
        },
        onError: function () { toast('Upload failed', 'error'); }
      });
    },

    add: async function () {
      function v(id) { var e = document.getElementById(id); return e ? e.value : ''; }
      var name = (v('spx-name') || '').trim();
      if (!name && !W._logo) { toast('Add a name or a logo', 'error'); return; }
      var p = {
        name: name || null, logo_url: W._logo || null, link_url: v('spx-link') || null,
        tier: v('spx-tier') || 'supporting',
        entrant_id: W._board || null,
        has_alpha: W._alpha === null ? null : W._alpha,
        logo_scale: W._scale
      };
      var r;
      try {
        r = await sb().rpc('event_sponsor_save',
          { p_scope: W._scope, p_event: W._event, p_id: null, p: p });
      } catch (e) { r = { error: e }; }
      if (r && r.error) { toast(r.error.message || 'Could not save the sponsor', 'error'); return; }
      toast('Sponsor added', 'success');
      W.render();
    },

    remove: async function (id) {
      var r;
      try { r = await sb().rpc('event_sponsor_remove', { p_id: id }); } catch (e) { r = { error: e }; }
      if (r && r.error) { toast(r.error.message || 'Could not remove', 'error'); return; }
      W.render();
    }
  };

  window.FFPSponsors = W;
})();
