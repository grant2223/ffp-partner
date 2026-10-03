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
      /* BULK UPLOAD. The portal's index.html forces input,select,textarea to
         16px with !important, so every size here carries !important too or it
         is silently overridden. No icon font is used: the shell's class is
         .ms and a stray .sym would render as its ligature word. */
      '.spx-bulk{max-width:1180px}' +
      '.spx-drop{border:2px dashed #c3d2de;border-radius:14px;padding:26px;text-align:center;' +
        'background:linear-gradient(180deg,#fbfdff,#f3f7fa);cursor:pointer}' +
      '.spx-drop.on{border-color:#F2A900;background:linear-gradient(180deg,#fffaef,#fff4da)}' +
      '.spx-drop b{display:block;font-size:17px;font-weight:900;color:#0b2136}' +
      '.spx-drop span{display:block;font-size:13px;color:#51657a;margin-top:6px}' +
      '.spx-bar{display:flex;align-items:flex-end;gap:18px;flex-wrap:wrap;' +
        'border-top:1px solid #e3e9ef;border-bottom:1px solid #e3e9ef;padding:16px 2px;margin:22px 0 0}' +
      '.spx-bar .f{display:flex;flex-direction:column;gap:6px;min-width:0}' +
      '.spx-bar label{font-size:10.5px;font-weight:900;letter-spacing:.14em;color:#51657a}' +
      '.spx-bar select{font-size:14px!important;font-weight:700;height:40px;min-width:0;flex:none;' +
        'padding:0 10px;border:1.5px solid #d7e0e8;border-radius:9px;background:#fff;color:#0b2136}' +
      '.spx-bar .note{margin-left:auto;font-size:12.5px;color:#51657a;align-self:center;max-width:300px;line-height:1.45}' +
      '.spx-bh,.spx-br{display:grid;grid-template-columns:72px 1fr 190px 1fr 34px;gap:16px;align-items:center}' +
      '.spx-bh{padding:18px 2px 10px;font-size:10.5px;font-weight:900;letter-spacing:.14em;' +
        'color:#51657a;border-bottom:1px solid #e3e9ef}' +
      '.spx-br{padding:12px 2px;border-bottom:1px solid #eef3f7}' +
      '.spx-blg{width:72px;height:54px;border-radius:9px;background:#0b2136;display:flex;' +
        'align-items:center;justify-content:center;overflow:hidden}' +
      '.spx-blg img{max-width:84%;max-height:76%;display:block}' +
      '.spx-br input.nm{font-size:15px!important;font-weight:800;border:1.5px solid #d7e0e8;' +
        'border-radius:9px;height:40px;padding:0 10px;width:100%;color:#0b2136}' +
      '.spx-br select{font-size:14px!important;font-weight:700;height:40px;width:100%;padding:0 8px;' +
        'border:1.5px solid #d7e0e8;border-radius:9px;background:#fff;color:#0b2136}' +
      '.spx-file{display:block;font-size:11px;color:#8aa0b4;margin-top:4px;overflow:hidden;' +
        'text-overflow:ellipsis;white-space:nowrap}' +
      /* STEP 1 -- WHO THE LOGOS ARE FOR.
         The board used to be a per-row control: an opacity:0 native multi
         select revealed only on focus. Nobody found it, so every logo landed
         on one board and a club sponsor could not reach the 2nd and 3rd side
         at all. The board is now chosen ONCE, up front, for the whole batch. */
      '.spx-steps{display:flex;align-items:baseline;gap:10px;font-size:11px;font-weight:900;' +
        'letter-spacing:.14em;margin:0 0 18px;padding:0 0 14px;border-bottom:1px solid #e3e9ef}' +
      '.spx-steps b{color:#0b2136}.spx-steps s{text-decoration:none;color:#8aa0b4}' +
      '.spx-steps em{font-style:normal;color:#c3d2de}' +
      '.spx-srch{display:flex;align-items:center;gap:10px;margin:0 0 4px}' +
      '.spx-srch input{font-size:14px!important;font-weight:700;height:42px;flex:1;min-width:0;' +
        'padding:0 12px;border:1.5px solid #d7e0e8;border-radius:10px;background:#fff;' +
        'box-sizing:border-box;color:#0b2136}' +
      '.spx-srch .n{font-size:12.5px;font-weight:800;color:#51657a;white-space:nowrap}' +
      '.spx-grp{font-size:10.5px;font-weight:900;letter-spacing:.14em;color:#8aa0b4;' +
        'padding:18px 2px 7px;border-bottom:1px solid #e3e9ef}' +
      '.spx-grp u{text-decoration:none;color:#1980AD;float:right;cursor:pointer;letter-spacing:.06em}' +
      '.spx-trow{display:grid;grid-template-columns:30px 1fr 150px;gap:14px;align-items:center;' +
        'padding:11px 2px;border-bottom:1px solid #eef3f7;cursor:pointer}' +
      '.spx-trow:hover{background:#f7fafc}.spx-trow.on{background:#fffdf6}' +
      '.spx-tk{width:21px;height:21px;border-radius:6px;border:2px solid #cfdae4;background:#fff;' +
        'position:relative}' +
      '.spx-trow.on .spx-tk{border-color:#F2A900;background:#F2A900}' +
      '.spx-trow.on .spx-tk:after{content:"";position:absolute;left:6px;top:2px;width:5px;height:10px;' +
        'border:solid #12212c;border-width:0 2.5px 2.5px 0;transform:rotate(43deg)}' +
      '.spx-tnm{font-size:15px;font-weight:800;min-width:0;color:#0b2136}' +
      '.spx-tnm i{font-style:normal;font-weight:700;color:#8aa0b4;font-size:13px}' +
      '.spx-tnm.evt{color:#1980AD}' +
      '.spx-has{font-size:12.5px;font-weight:800;color:#51657a;text-align:right}' +
      '.spx-has.none{color:#b6c3cf;font-weight:700}' +
      '.spx-sel{position:sticky;bottom:0;background:#fff;border-top:2px solid #e3e9ef;display:flex;' +
        'align-items:center;gap:18px;padding:16px 2px;margin-top:4px}' +
      '.spx-sel .t{font-size:13.5px;color:#51657a;min-width:0;line-height:1.5}' +
      '.spx-sel .t b{color:#0b2136;font-weight:800}' +
      '.spx-for{display:flex;align-items:baseline;gap:12px;padding:0 0 16px;margin:0 0 4px;' +
        'border-bottom:1px solid #e3e9ef;font-size:13.5px;color:#51657a;line-height:1.5}' +
      '.spx-for b{color:#0b2136;font-weight:800}' +
      '.spx-for u{text-decoration:none;color:#1980AD;font-weight:800;cursor:pointer;margin-left:auto;' +
        'white-space:nowrap}' +
      '.spx-ok{font-size:11.5px;font-weight:700;color:#5d8a5f}' +
      '.spx-wn{font-size:11.5px;font-weight:800;color:#a8620a;line-height:1.3}' +
      '.spx-up{font-size:11.5px;font-weight:700;color:#8aa0b4}' +
      '.spx-x{width:28px;height:28px;border-radius:50%;border:1.5px solid #e0e7ee;background:#fff;' +
        'color:#93a7ba;font-size:15px;font-weight:900;line-height:1;cursor:pointer}' +
      '.spx-foot{display:flex;align-items:center;gap:16px;margin-top:24px}' +
      '.spx-go{height:48px;padding:0 26px;border:0;border-radius:11px;background:#F2A900;color:#12212c;' +
        'font-size:15px;font-weight:900;cursor:pointer}' +
      '.spx-go[disabled]{opacity:.45;cursor:default}' +
      '.spx-gh{height:48px;padding:0 20px;border:1.5px solid #d7e0e8;border-radius:11px;background:#fff;' +
        'color:#0b2136;font-size:14px;font-weight:800;cursor:pointer}' +
      '.spx-count{font-size:13.5px;color:#51657a;margin-left:auto}' +
      '.spx-count b{color:#0b2136}' +
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

  function boardOpts(entrants, cur, eventCount) {
    var o = '<option value=""' + (!cur ? ' selected' : '') + '>Event sponsors'
      + (eventCount ? ' (' + eventCount + ')' : '') + '</option>';
    (entrants || []).forEach(function (e) {
      var n = (e.sponsors != null) ? e.sponsors : null;
      o += '<option value="' + esc(e.id) + '"' + (e.id === cur ? ' selected' : '') + '>'
        + esc(e.team_name || e.name || 'Team') + (n ? ' (' + n + ')' : '') + '</option>';
    });
    return o;
  }

  var W = {
    _host: null, _scope: null, _event: null, _entrants: [],
    _board: null,           // null = the event's own board
    _eventCount: 0,
    _logo: null, _alpha: null, _scale: null,

    /* EVERY INTERNAL REFRESH WAS A NO-OP.
       add(), remove(), setBoard(), bulkClose() and bulkSave() all finish by
       calling W.render() with NO arguments, and the first line here was
       `if (!host) return;` -- so every one of them returned immediately and
       the screen was never rebuilt. The row really was written and the toast
       really did fire, but the list never changed, which reads as "it doesn't
       save"; switching the board did nothing at all, which reads as "I can't
       manage sponsors" and as sponsors having disappeared. It is also why a
       finished bulk upload looked like it had done nothing, and got clicked a
       second time -- 6 logos stored as 12 rows.
       The host is remembered whenever one is given, and only a call that has
       no host AND no remembered host gives up. */
    render: async function (host, opt) {
      if (opt) {
        W._host = host; W._scope = opt.scope; W._event = opt.eventId;
        if (opt.entrants) W._entrants = opt.entrants;
      } else if (host) {
        W._host = host;
      }
      host = W._host;
      if (!host) return;
      injectCss();
      W._logo = null; W._alpha = null; W._scale = null;
      host.innerHTML = '<div class="spx"><div class="spx-hint">Loading sponsors…</div></div>';

      /* The clubs come from the database, not from the loader. S._entrants is
         only filled by the Entrants tab and only for the division being
         viewed, so opening Sponsors first left the team picker empty and a
         team sponsor could not be added at all - with nothing on screen to say
         why. This asks for every club in the event, across every division. */
      var br;
      try {
        br = await sb().rpc('event_sponsor_boards',
          { p_scope: W._scope, p_event: W._event });
      } catch (e) { br = { error: e }; }
      if (br && br.error) {
        toast(br.error.message || 'Could not load the teams', 'error');
      } else if (br && br.data && Array.isArray(br.data.teams)) {
        W._entrants = br.data.teams;
        W._eventCount = Number(br.data.event_sponsors) || 0;
      }

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
              if (W._entrants[i].id === W._board) return W._entrants[i].team_name || W._entrants[i].name || 'this club';
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
            boardOpts(W._entrants, W._board, W._eventCount) + '</select></div>' +
            /* A whole club's sponsors arrive as a folder of logos, not one at a
               time. The single form below stays for adding or fixing one. */
            '<div class="f" style="flex:0 0 auto"><label>&nbsp;</label>' +
            '<button class="spx-gh" style="height:44px" onclick="FFPSponsors.bulkOpen()">' +
            'Upload several logos</button></div></div>' +
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

    /* ── BULK UPLOAD ──────────────────────────────────────────────────
       One sponsor at a time, with a separate click for the logo, is fine for
       one and miserable for a club with twelve. Drop the lot: each file
       becomes a row, named from its filename, and the tier and the board are
       set once for the batch or per row.

       A board belongs to ONE owner, so a sponsor on three clubs is three
       rows. The footer says so before you press the button rather than after.

       Transparency is checked HERE, at upload, the same way the single-add
       path already does it -- the broadcast board knocks each logo out in
       white and cannot work that out at play-out. A file without alpha is
       flagged on screen instead of surprising somebody mid-match. */
    bulkOpen: function () {
      W._bulk = []; W._bulkTier = 'partner';
      W._bulkStep = 1; W._bulkBoards = []; W._bulkQ = ''; W._bulkBusy = false;
      W.renderBulk();
    },

    /* The approved screen, built once and used by leagues, tournaments and
       competitions -- they all render through this component. */
    /* A club runs a 1st, 2nd and 3rd side, and a club sponsor belongs on all
       three. Step 1 picks the boards once; step 2 is just the logos. */
    _clubOf: function (nm) {
      var m = String(nm || '').match(/^(.*?)[\s-]+(\d+)(?:st|nd|rd|th)?(?:\s*(?:XV|XI|XIII|s|team))?$/i);
      if (m && m[1]) return { club: m[1].trim(), n: parseInt(m[2], 10) || 1 };
      return { club: String(nm || 'Team').trim(), n: 1 };
    },
    _ord: function (n) {
      var e = ['th', 'st', 'nd', 'rd'], v = n % 100;
      return n + (e[(v - 20) % 10] || e[v] || e[0]);
    },
    _boardName: function (id) {
      if (!id) return 'Event board';
      for (var i = 0; i < (W._entrants || []).length; i++)
        if (W._entrants[i].id === id)
          return W._entrants[i].team_name || W._entrants[i].name || 'Team';
      return 'Team';
    },
    _chosenNames: function () {
      return (W._bulkBoards || []).map(function (id) { return W._boardName(id); });
    },

    renderBulk: function () {
      var host = W._host; if (!host) return;
      injectCss();
      return W._bulkStep === 2 ? W._renderBulkLogos(host) : W._renderBulkTeams(host);
    },

    /* ── STEP 1 ─────────────────────────────────────────────────────────── */
    _renderBulkTeams: function (host) {
      var q = String(W._bulkQ || '').trim().toLowerCase();
      var hit = function (nm) { return !q || String(nm || '').toLowerCase().indexOf(q) >= 0; };
      var on = function (id) { return (W._bulkBoards || []).indexOf(id) >= 0; };

      /* group the sides under their club, keeping the order the event gives */
      var groups = [], byClub = {};
      (W._entrants || []).forEach(function (e) {
        var nm = e.team_name || e.name || 'Team';
        if (!hit(nm)) return;
        var c = W._clubOf(nm);
        if (!byClub[c.club]) { byClub[c.club] = { club: c.club, sides: [] }; groups.push(byClub[c.club]); }
        byClub[c.club].sides.push({ id: e.id, name: nm, n: c.n,
                                    sponsors: Number(e.sponsors) || 0 });
      });

      var teamsN = (W._entrants || []).length;
      var body = '';

      if (!q || 'event board'.indexOf(q) >= 0) {
        body += '<div class="spx-grp">THE EVENT ITSELF</div>'
          + '<div class="spx-trow' + (on(null) ? ' on' : '') + '" onclick="FFPSponsors.bulkTeam(\'\')">'
            + '<span class="spx-tk"></span>'
            + '<span class="spx-tnm evt">Event board <i>&mdash; the event&#39;s own sponsors, '
              + 'never mixed with a club&#39;s</i></span>'
            + '<span class="spx-has' + (W._eventCount ? '' : ' none') + '">'
              + (W._eventCount ? W._eventCount + ' sponsor' + (W._eventCount === 1 ? '' : 's')
                               : 'no sponsors yet') + '</span>'
          + '</div>';
      }

      groups.forEach(function (g) {
        var ids = g.sides.map(function (x) { return x.id; });
        var allOn = ids.every(on);
        body += '<div class="spx-grp">' + esc(g.club.toUpperCase())
          + (ids.length > 1
              ? '<u onclick="FFPSponsors.bulkClub(\'' + esc(ids.join(',')) + '\',' + (allOn ? 'false' : 'true') + ')">'
                + (allOn ? 'Clear all ' : 'Select all ') + ids.length + '</u>'
              : '')
          + '</div>';
        g.sides.forEach(function (t) {
          /* the side is labelled from the data -- never an invented "XV", because
             this same screen serves netball, football and touch */
          var side = ids.length > 1 ? W._ord(t.n) : '';
          body += '<div class="spx-trow' + (on(t.id) ? ' on' : '') + '" '
              + 'onclick="FFPSponsors.bulkTeam(\'' + esc(t.id) + '\')">'
            + '<span class="spx-tk"></span>'
            + '<span class="spx-tnm">' + esc(W._clubOf(t.name).club)
              + (side ? ' <i>' + side + '</i>' : '') + '</span>'
            + '<span class="spx-has' + (t.sponsors ? '' : ' none') + '">'
              + (t.sponsors ? t.sponsors + ' sponsor' + (t.sponsors === 1 ? '' : 's')
                            : 'no sponsors yet') + '</span>'
          + '</div>';
        });
      });

      if (!body) body = '<p class="spx-hint">No team matches that search.</p>';

      var chosen = W._chosenNames();
      host.innerHTML = '<div class="spx-bulk">'
        + '<div class="spx-steps"><b>1 CHOOSE TEAMS</b><em>&rarr;</em><s>2 ADD LOGOS</s></div>'
        + '<p class="spx-hint">Pick who the logos are for, then drop them all in once. A sponsor on '
          + 'four teams is saved four times, because a board belongs to one club &mdash; you only '
          + 'pick it once.</p>'
        + '<div class="spx-srch">'
          + '<input id="spx-q" type="text" value="' + esc(W._bulkQ || '') + '" '
            + 'placeholder="Search ' + teamsN + ' team' + (teamsN === 1 ? '' : 's') + '" '
            + 'oninput="FFPSponsors.bulkSearch(this.value)">'
          + '<span class="n">' + groups.length + ' club' + (groups.length === 1 ? '' : 's') + ', '
            + teamsN + ' team' + (teamsN === 1 ? '' : 's') + '</span>'
        + '</div>'
        + body
        + '<div class="spx-sel">'
          + '<span class="t">' + (chosen.length
              ? '<b>' + chosen.length + ' team' + (chosen.length === 1 ? '' : 's') + '</b> &mdash; '
                + esc(chosen.join(', '))
              : 'Nothing picked yet') + '</span>'
          + (chosen.length ? '<button class="spx-gh" onclick="FFPSponsors.bulkClear()">Clear</button>' : '')
          + '<button class="spx-go" style="margin-left:auto"' + (chosen.length ? '' : ' disabled')
            + ' onclick="FFPSponsors.bulkNext()">Next, add the logos</button>'
          + '<button class="spx-gh" onclick="FFPSponsors.bulkClose()">Cancel</button>'
        + '</div>'
      + '</div>';

      /* a re-render on every keystroke would otherwise drop the caret */
      var qi = document.getElementById('spx-q');
      if (qi && W._bulkQ) { qi.focus(); qi.setSelectionRange(qi.value.length, qi.value.length); }
    },

    /* ── STEP 2 ─────────────────────────────────────────────────────────── */
    _renderBulkLogos: function (host) {
      var rows = W._bulk || [];
      var ready = rows.filter(function (r) { return r.state === 'ready'; });
      var nb = (W._bulkBoards || []).length || 1;
      var saves = ready.length * nb;
      var chosen = W._chosenNames();

      var body = rows.map(function (r, i) {
        var state = r.state === 'up' ? '<span class="spx-up">Uploading&hellip;</span>'
          : r.state === 'failed' ? '<span class="spx-wn">Upload failed. Remove it and try again.</span>'
          : (r.alpha === true ? '<span class="spx-ok">Transparent &mdash; ready</span>'
            : r.alpha === false
              ? '<span class="spx-wn"><b>No transparency.</b> Shown on a white plate, or send a PNG.</span>'
              : '<span class="spx-wn">Could not check this file. The board will use a white plate.</span>');
        var su = r.url ? safeUrl(r.url) : null;
        return '<div class="spx-br">'
          + '<span class="spx-blg">' + (su ? '<img src="' + su + '" alt="">' : '') + '</span>'
          + '<span><input class="nm" value="' + esc(r.name) + '" aria-label="Sponsor name" '
            + 'oninput="FFPSponsors._bulk[' + i + '].name=this.value">'
            + '<span class="spx-file">' + esc(r.file.name) + '</span></span>'
          + '<span><select aria-label="Tier" onchange="FFPSponsors.bulkSet(' + i + ',\'tier\',this.value)">'
            + tierOpts(r.tier) + '</select></span>'
          + '<span>' + state + '</span>'
          + '<span><button class="spx-x" aria-label="Remove" '
            + 'onclick="FFPSponsors.bulkDrop(' + i + ')">&times;</button></span>'
          + '</div>';
      }).join('');

      host.innerHTML = '<div class="spx-bulk">'
        + '<div class="spx-steps"><s>1 CHOOSE TEAMS</s><em>&rarr;</em><b>2 ADD LOGOS</b></div>'
        + '<div class="spx-for"><span>For <b>' + esc(chosen.join(', ')) + '</b></span>'
          + '<u onclick="FFPSponsors.bulkBack()">Change teams</u></div>'
        + '<input type="file" id="spx-files" accept="image/*" multiple style="display:none" '
          + 'onchange="FFPSponsors.bulkFiles(this.files)">'
        + '<div class="spx-drop" id="spx-drop" onclick="FFPSponsors.bulkPick()">'
          + '<b>Drop sponsor logos here</b>'
          + '<span>or click to choose files &mdash; PNG with a transparent background, up to 40 at a time</span>'
          + '</div>'
        + (rows.length ? ''
            + '<div class="spx-bar">'
              + '<div class="f"><label>SET TIER FOR ALL</label>'
                + '<select onchange="FFPSponsors.bulkAll(\'tier\',this.value)">' + tierOpts(W._bulkTier) + '</select></div>'
              + '<p class="note">The broadcast board knocks each logo out in white, so a file without '
                + 'transparency is shown on a white plate instead.</p>'
            + '</div>'
            + '<div class="spx-bh"><span>LOGO</span><span>SPONSOR NAME</span><span>TIER</span>'
              + '<span>FILE</span><span></span></div>'
            + body
            + '<div class="spx-foot">'
              /* THE GUARD. This save is a loop of awaits several seconds long.
                 With the button still live a second click started a SECOND run
                 over the same list and every sponsor was written twice -- it
                 happened on the first real batch, 6 logos stored as 12 rows. */
              + '<button class="spx-go"' + ((saves && !W._bulkBusy) ? '' : ' disabled')
                + ' onclick="FFPSponsors.bulkSave()">'
                + (W._bulkBusy ? 'Adding&hellip;'
                   : 'Add ' + ready.length + ' sponsor' + (ready.length === 1 ? '' : 's')
                     + ' to ' + nb + ' team' + (nb === 1 ? '' : 's')) + '</button>'
              + '<button class="spx-gh"' + (W._bulkBusy ? ' disabled' : '')
                + ' onclick="FFPSponsors.bulkClose()">Cancel</button>'
              + '<span class="spx-count">' + ready.length + ' file' + (ready.length === 1 ? '' : 's')
                + ' &times; ' + nb + ' team' + (nb === 1 ? '' : 's') + ' = '
                + '<b>' + saves + ' sponsor row' + (saves === 1 ? '' : 's') + '</b></span>'
            + '</div>'
          : '')
        + '</div>';

      var dz = document.getElementById('spx-drop');
      if (dz) {
        ['dragenter','dragover'].forEach(function (e) {
          dz.addEventListener(e, function (ev) { ev.preventDefault(); dz.classList.add('on'); });
        });
        ['dragleave','drop'].forEach(function (e) {
          dz.addEventListener(e, function (ev) { ev.preventDefault(); dz.classList.remove('on'); });
        });
        dz.addEventListener('drop', function (ev) {
          if (ev.dataTransfer && ev.dataTransfer.files) W.bulkFiles(ev.dataTransfer.files);
        });
      }
    },

    bulkSearch: function (v) { W._bulkQ = v || ''; W.renderBulk(); },
    bulkTeam: function (id) {
      var b = W._bulkBoards || (W._bulkBoards = []);
      var key = id ? id : null;
      var i = b.indexOf(key);
      if (i >= 0) b.splice(i, 1); else b.push(key);
      W.renderBulk();
    },
    bulkClub: function (ids, add) {
      var b = W._bulkBoards || (W._bulkBoards = []);
      String(ids || '').split(',').forEach(function (id) {
        if (!id) return;
        var i = b.indexOf(id);
        if (add && i < 0) b.push(id);
        if (!add && i >= 0) b.splice(i, 1);
      });
      W.renderBulk();
    },
    bulkClear: function () { W._bulkBoards = []; W.renderBulk(); },
    bulkNext: function () {
      if (!(W._bulkBoards || []).length) { toast('Pick at least one team', 'error'); return; }
      W._bulkStep = 2; W.renderBulk();
    },
    bulkBack: function () { W._bulkStep = 1; W.renderBulk(); },

    bulkClose: function () { W._bulk = null; W.render(); },

    bulkPick: function () {
      var inp = document.getElementById('spx-files');
      if (inp) inp.click();
    },

    bulkFiles: async function (files) {
      files = Array.prototype.slice.call(files || []).filter(function (f) {
        return /^image\//.test(f.type || '');
      }).slice(0, 40);
      if (!files.length) return;
      if (!window.FFPUpload || !FFPUpload.uploadBlob) { toast('Upload unavailable', 'error'); return; }
      W._bulk = W._bulk || [];
      files.forEach(function (f) {
        W._bulk.push({ file: f, name: W.nameFromFile(f.name), tier: W._bulkTier || 'partner',
                       url: null, alpha: null, scale: 1, state: 'up' });
      });
      W.renderBulk();
      for (var i = 0; i < W._bulk.length; i++) {
        var row = W._bulk[i];
        if (row.state !== 'up') continue;
        try {
          var key = 'spon-' + W._event + '-' + Date.now() + '-' + i;
          row.url = await FFPUpload.uploadBlob('event-sponsors', key, row.file);
          row.alpha = await detectAlpha(row.url);
          row.scale = await opticalScale(row.url);
          row.state = 'ready';
        } catch (e) { row.state = 'failed'; }
        W.renderBulk();
      }
    },

    /* "emirates-nbd-logo.png" -> "Emirates NBD". The operator corrects a name
       rather than types twelve of them. Words the file name carries but the
       sponsor does not are dropped. */
    nameFromFile: function (fn) {
      var n = String(fn || '').replace(/\.[a-z0-9]+$/i, '');
      n = n.replace(/[_\-]+/g, ' ').replace(/\s+/g, ' ').trim();
      n = n.replace(/\b(logo|logos|final|rgb|cmyk|white|black|transparent|hi ?res|v\d+|copy)\b/gi, '');
      n = n.replace(/\s+/g, ' ').trim();
      /* A token the file spells in capitals is an acronym -- NBD, FC, UAE --
         and title-casing it to "Nbd" is just a typo the operator has to undo.
         Anything else is title-cased. A lower-case acronym is unknowable, so
         it is left for them to correct; the name is editable on the row. */
      return n.split(' ').map(function (w) {
        return (w === w.toUpperCase() && /[A-Z]/.test(w)) ? w
             : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
      }).join(' ');
    },

    bulkSet: function (i, k, v) {
      if (!W._bulk || !W._bulk[i]) return;
      W._bulk[i][k] = v;
      W.renderBulk();
    },
    bulkDrop: function (i) { if (W._bulk) { W._bulk.splice(i, 1); W.renderBulk(); } },
    bulkAll: function (what, v) {
      if (what !== 'tier') return;   // the board is chosen in step 1, for the batch
      (W._bulk || []).forEach(function (r) { r.tier = v; });
      W._bulkTier = v;
      W.renderBulk();
    },

    /* ONE RUN AT A TIME. This is a loop of awaits that takes seconds, and the
       button sat live throughout it: a second click re-entered here with the
       same list still in hand and wrote every sponsor a second time. The first
       real batch went in as 12 rows for 6 logos. The flag is set BEFORE the
       first await and cleared in a finally, and the button reads "Adding..."
       while it holds. */
    bulkSave: async function () {
      if (W._bulkBusy) return;
      var rows = (W._bulk || []).filter(function (r) { return r.state === 'ready'; });
      if (!rows.length) { toast('Nothing ready to add', 'error'); return; }
      var boards = (W._bulkBoards || []).length ? W._bulkBoards : [null];
      W._bulkBusy = true;
      W.renderBulk();
      var made = 0, failed = 0;
      try {
        for (var i = 0; i < rows.length; i++) {
          var r = rows[i];
          for (var b = 0; b < boards.length; b++) {
            var p = { name: r.name || null, logo_url: r.url, link_url: null, tier: r.tier || 'partner',
                      entrant_id: boards[b] || null,
                      has_alpha: r.alpha === null ? null : r.alpha, logo_scale: r.scale };
            var res;
            try {
              res = await sb().rpc('event_sponsor_save',
                { p_scope: W._scope, p_event: W._event, p_id: null, p: p });
            } catch (e) { res = { error: e }; }
            if (res && res.error) failed++; else made++;
          }
        }
      } finally { W._bulkBusy = false; }
      toast(failed ? (made + ' added, ' + failed + ' failed')
                   : (made + ' sponsor row' + (made === 1 ? '' : 's') + ' added'),
            failed ? 'error' : 'success');
      /* land on the first board that was just written, so the logos are on
         screen instead of behind a board filter showing something else */
      W._board = boards[0] || null;
      W._bulk = null; W._bulkStep = 1; W._bulkBoards = [];
      W.render();
    },


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
