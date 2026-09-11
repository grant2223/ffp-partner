/*  FFP PROVIDER LOYALTY LOADER · v3 (world-class .pc-* layout: card setup + live member-pass preview + at-the-till code)
    Desktop panel: set up a stamp OR points loyalty card + a live 6-digit staff code
    that rotates every 60 seconds (authenticator-style). Members enter the code at the
    till to earn a stamp/points; they can't add their own. Renders into #loy-root.
    Exposes window.ffpRenderLoyalty (panel hook) + window.FFPLoyalty (actions).       */
(function () {
  'use strict';
  var S = { prog: null, timer: null, type: 'stamp', image: '', biz: { name: '', logo: '' } };

  function root() { return document.getElementById('loy-root'); }
  function provId() {
    return (window.FFP_PROVIDER && window.FFP_PROVIDER.id) ||
           (typeof providerProfile !== 'undefined' && providerProfile && providerProfile.id) || null;
  }
  function bizInfo() {
    var p = (typeof providerProfile !== 'undefined' && providerProfile) ? providerProfile : (window.FFP_PROVIDER || {});
    return { name: (p && (p.business_name || p.name)) || 'Your business', logo: (p && p.logo_url) || '' };
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }
  function val(id) { var e = document.getElementById(id); return e ? e.value : ''; }
  function toast(m) { try { if (typeof showToast === 'function') showToast(m); } catch (e) {} }
  async function rpc(fn, args) { var r = await window.supabase.rpc(fn, args); if (r.error) throw r.error; return r.data; }

  function css() {
    if (document.getElementById('loy-css')) return;
    var s = document.createElement('style'); s.id = 'loy-css';
    s.textContent = [
      '#loy-root{max-width:1000px;--ink:#16242b;--muted:#5f727c;--faint:#93a4ad;--line:#e4eaee;--blue:#1980AD;--gold:#f2a900;}',
      '#loy-root .pc-h1{font-size:26px;font-weight:900;letter-spacing:-.6px;margin:0;color:var(--ink);}',
      '#loy-root .pc-sub{font-size:14px;font-weight:600;color:var(--muted);margin:6px 0 0;max-width:640px;}',
      '#loy-root .pc-sec{font-size:12px;font-weight:900;letter-spacing:1.2px;text-transform:uppercase;color:var(--faint);margin:34px 0 16px;padding-bottom:10px;border-bottom:1px solid var(--line);}',
      '#loy-root .pc-field{margin-bottom:20px;}',
      '#loy-root .pc-field label{display:block;font-size:11px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;color:var(--muted);margin-bottom:8px;}',
      '#loy-root .pc-field label .opt{color:var(--faint);font-weight:700;text-transform:none;letter-spacing:0;}',
      '#loy-root .pc-input,#loy-root .pc-select{width:100%;border:1.5px solid #cfd8de;border-radius:12px;padding:13px 14px;font-family:inherit;font-size:15px;font-weight:600;color:var(--ink);background:#fff;outline:none;transition:.14s;}',
      '#loy-root .pc-input:focus,#loy-root .pc-select:focus{border-color:var(--blue);box-shadow:0 0 0 3px rgba(25,128,173,.14);}',
      "#loy-root .pc-select{appearance:none;background-image:url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='22' height='22' fill='%235f727c'%3E%3Cpath d='M6 9l5 5 5-5z'/%3E%3C/svg%3E\");background-repeat:no-repeat;background-position:right 12px center;cursor:pointer;}",
      '#loy-root .pc-hint{font-size:12px;font-weight:600;color:var(--faint);margin-top:7px;}',
      '#loy-root .pc-2{display:flex;gap:16px;}#loy-root .pc-2>*{flex:1;}',
      '#loy-root .pc-grid{display:grid;grid-template-columns:1fr 340px;gap:44px;align-items:start;}',
      '@media(max-width:820px){#loy-root .pc-grid{grid-template-columns:1fr;}}',
      '#loy-root .pv-label{font-size:11px;font-weight:900;letter-spacing:1.2px;text-transform:uppercase;color:var(--faint);margin-bottom:14px;}',
      '#loy-root .pass{position:relative;border-radius:22px;overflow:hidden;color:#fff;padding:20px;min-height:230px;display:flex;flex-direction:column;background:linear-gradient(155deg,#1f5f86,#0c2f45);box-shadow:0 20px 44px -18px rgba(11,42,64,.7);}',
      '#loy-root .pass .art{position:absolute;inset:0;background:center/cover;opacity:.32;}',
      '#loy-root .pass .sc{position:absolute;inset:0;background:linear-gradient(180deg,rgba(7,20,30,.15),rgba(7,20,30,.72));}',
      '#loy-root .pass .in{position:relative;z-index:2;display:flex;flex-direction:column;flex:1;}',
      '#loy-root .pass .who{display:flex;align-items:center;gap:9px;}',
      '#loy-root .pass .lg{width:30px;height:30px;border-radius:9px;background:rgba(255,255,255,.22)center/cover;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:900;flex:none;}',
      '#loy-root .pass .who b{font-size:13.5px;font-weight:800;}',
      '#loy-root .pass .stamps{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-top:16px;}',
      '#loy-root .pass .tk{aspect-ratio:1;border-radius:50%;display:flex;align-items:center;justify-content:center;}',
      '#loy-root .pass .tk.on{background:linear-gradient(160deg,#ffd98a,#f2a900);}',
      '#loy-root .pass .tk.on .sym{font-size:15px;color:#4a3000;}',
      '#loy-root .pass .tk.off{background:rgba(255,255,255,.12);}',
      '#loy-root .pass .ptbar{height:10px;border-radius:6px;background:rgba(255,255,255,.14);overflow:hidden;margin-top:16px;}',
      '#loy-root .pass .ptbar i{display:block;height:100%;width:30%;border-radius:6px;background:linear-gradient(90deg,#ffd98a,#f2a900);}',
      '#loy-root .pass .foot{margin-top:auto;padding-top:16px;}',
      '#loy-root .pass .cnt{font-size:13px;font-weight:900;color:#bfe8ff;letter-spacing:.2px;}',
      '#loy-root .pass .rw{font-size:19px;font-weight:900;letter-spacing:-.3px;margin-top:3px;}',
      '#loy-root .pass .exp{font-size:11px;font-weight:700;color:rgba(255,255,255,.72);margin-top:5px;}',
      '#loy-root .pv-change{margin-top:12px;width:100%;border:1.5px solid #cfd8de;background:#fff;border-radius:12px;padding:11px;font-family:inherit;font-weight:800;font-size:13px;color:var(--blue);display:flex;align-items:center;justify-content:center;gap:7px;cursor:pointer;}',
      '#loy-root .pv-change .sym{font-size:18px;}',
      '#loy-root .pv-note{font-size:12px;font-weight:600;color:var(--faint);margin-top:9px;text-align:center;line-height:1.5;}',
      '#loy-root .till{border-radius:20px;overflow:hidden;position:relative;background:radial-gradient(120% 130% at 88% -10%,#1f608a,#123f5c 46%,#0b2a40);color:#fff;padding:26px 30px;display:flex;align-items:center;gap:34px;flex-wrap:wrap;}',
      '#loy-root .till .glow{position:absolute;right:-50px;top:-50px;width:230px;height:230px;border-radius:50%;background:radial-gradient(circle,rgba(255,204,0,.26),transparent 68%);}',
      '#loy-root .till .l{flex:none;position:relative;z-index:2;}',
      '#loy-root .till .k{font-size:11px;font-weight:900;letter-spacing:1.4px;text-transform:uppercase;color:#ffd98a;}',
      '#loy-root .till .digits{font-size:54px;font-weight:900;letter-spacing:10px;font-variant-numeric:tabular-nums;margin:10px 0 12px;line-height:1;}',
      '#loy-root .till .cd{width:260px;max-width:60vw;height:6px;border-radius:4px;background:rgba(255,255,255,.16);overflow:hidden;}',
      '#loy-root .till .cd i{display:block;height:100%;width:100%;background:linear-gradient(90deg,#ffd98a,#f2a900);transition:width 1s linear;}',
      '#loy-root .till .cs{font-size:11.5px;font-weight:700;color:rgba(255,255,255,.7);margin-top:8px;}',
      '#loy-root .till .r{position:relative;z-index:2;border-left:1px solid rgba(255,255,255,.16);padding-left:34px;}',
      '@media(max-width:640px){#loy-root .till .r{border-left:none;padding-left:0;}}',
      '#loy-root .till .r h4{margin:0 0 8px;font-size:15px;font-weight:900;}',
      '#loy-root .till .r p{margin:0;font-size:13px;font-weight:600;color:rgba(255,255,255,.82);line-height:1.6;max-width:340px;}',
      '#loy-root .till-wait{border:1.5px dashed var(--line);border-radius:20px;padding:26px;text-align:center;color:var(--muted);font-weight:700;font-size:13.5px;line-height:1.6;}',
      '#loy-root .pc-foot{display:flex;justify-content:flex-end;gap:12px;margin-top:34px;padding-top:22px;border-top:1px solid var(--line);}',
      '#loy-root .pc-btn{border:none;font-family:inherit;font-weight:900;font-size:15px;padding:14px 30px;border-radius:13px;cursor:pointer;}',
      '#loy-root .pc-btn.pri{background:linear-gradient(135deg,#2ba8e0,#1980AD);color:#fff;box-shadow:0 12px 24px -12px rgba(25,128,173,.7);}',
      '#loy-root .pc-btn.ghost{background:transparent;color:var(--muted);}'
    ].join('');
    document.head.appendChild(s);
  }

  function typeSelect() {
    return '<select id="loy-type" class="pc-select" onchange="FFPLoyalty.setType(this.value)">' +
      '<option value="stamp"' + (S.type === 'stamp' ? ' selected' : '') + '>Stamp card — buy N, get a reward</option>' +
      '<option value="points"' + (S.type === 'points' ? ' selected' : '') + '>Points card — earn points per $</option>' +
    '</select>';
  }
  function validField() {
    var p = S.prog || {};
    return '<div class="pc-field"><label>Reward valid until <span class="opt">(optional)</span></label>' +
      '<input id="loy-valid" class="pc-input" type="date" value="' + esc((p.valid_to || '')).slice(0, 10) + '" oninput="FFPLoyalty.sync()"></div>';
  }
  function formHtml() {
    var p = S.prog || {};
    var reward = esc(p.reward || '');
    var typeRow = '<div class="pc-field"><label>Card type</label>' + typeSelect() + '</div>';
    if (S.type === 'stamp') {
      return typeRow +
        '<div class="pc-2">' +
          '<div class="pc-field"><label>Stamps to earn</label><input id="loy-stamps" class="pc-input" type="number" min="2" max="30" value="' + (p.stamps_required || 10) + '" oninput="FFPLoyalty.sync()"></div>' +
          validField() +
        '</div>' +
        '<div class="pc-field"><label>Reward</label><input id="loy-reward" class="pc-input" type="text" placeholder="Free coffee" value="' + reward + '" oninput="FFPLoyalty.sync()"><div class="pc-hint">What the customer gets when the card is complete.</div></div>';
    }
    return typeRow +
      '<div class="pc-2">' +
        '<div class="pc-field"><label>Points per $1</label><input id="loy-ppc" class="pc-input" type="number" min="0" step="0.1" value="' + (p.points_per_currency || 1) + '"></div>' +
        '<div class="pc-field"><label>Points for reward</label><input id="loy-thr" class="pc-input" type="number" min="1" value="' + (p.points_threshold || 100) + '" oninput="FFPLoyalty.sync()"></div>' +
      '</div>' +
      '<div class="pc-2">' +
        '<div class="pc-field"><label>Reward</label><input id="loy-reward" class="pc-input" type="text" placeholder="$10 off" value="' + reward + '" oninput="FFPLoyalty.sync()"></div>' +
        validField() +
      '</div>';
  }

  function passInner() {
    var b = S.biz, reward = esc(val('loy-reward') || (S.prog && S.prog.reward) || 'Your reward');
    var vd = val('loy-valid');
    var logo = b.logo ? '<span class="lg" style="background-image:url(\'' + esc(b.logo) + '\')"></span>' : '<span class="lg">' + esc((b.name || '?').charAt(0)) + '</span>';
    var mid;
    if (S.type === 'stamp') {
      var n = Math.max(2, Math.min(30, parseInt(val('loy-stamps'), 10) || 10));
      var filled = Math.min(3, n);
      var cells = '';
      for (var i = 0; i < Math.min(n, 20); i++) cells += (i < filled ? '<span class="tk on"><span class="sym">check</span></span>' : '<span class="tk off"></span>');
      mid = '<div class="stamps">' + cells + '</div>';
      var cnt = '<div class="cnt">' + filled + '/' + n + '</div>';
    } else {
      mid = '<div class="ptbar"><i></i></div>';
      var thr = Math.max(1, parseInt(val('loy-thr'), 10) || 100);
      cnt = '<div class="cnt">0/' + thr + ' pts</div>';
    }
    var art = S.image ? "background-image:url('" + esc(S.image) + "')" : 'background-image:linear-gradient(135deg,#2a6f97,#123f5c)';
    return '<div class="art" style="' + art + '"></div><div class="sc"></div><div class="in">' +
      '<div class="who">' + logo + '<b>' + esc(b.name) + '</b></div>' + mid +
      '<div class="foot">' + cnt + '<div class="rw">' + reward + '</div>' +
      (vd ? '<div class="exp">Ends ' + esc(vd) + '</div>' : '') + '</div></div>';
  }
  function previewHtml() {
    return '<div class="pv-label">How customers see it</div>' +
      '<div class="pass" id="loy-pass">' + passInner() + '</div>' +
      '<button class="pv-change" onclick="FFPLoyalty.pickImg()"><span class="sym">photo_camera</span> ' + (S.image ? 'Change card image' : 'Add card image') + '</button>' +
      '<div class="pv-note">Add your own art, or we’ll use your brand colours.</div>';
  }
  function sync() { var el = document.getElementById('loy-pass'); if (el) el.innerHTML = passInner(); }

  function codeHtml() {
    if (!S.prog || !S.prog.exists) {
      return '<div class="till-wait">Save your card to activate the staff code.<br>It refreshes every 60 seconds — staff read it to the customer at the till.</div>';
    }
    return '<div class="till"><div class="glow"></div>' +
      '<div class="l">' +
        '<div class="k">Staff code — read it out</div>' +
        '<div class="digits" id="loy-digits">••• •••</div>' +
        '<div class="cd"><i id="loy-cd" style="width:100%"></i></div>' +
        '<div class="cs" id="loy-cs">Refreshing…</div>' +
      '</div>' +
      '<div class="r"><h4>How customers collect</h4><p>Read the live code to the customer at checkout — they type it into their FFP app to earn. It changes every 60 seconds, like an authenticator, so nobody can stamp themselves.</p></div>' +
    '</div>';
  }

  function draw() {
    var el = root(); if (!el) return;
    el.innerHTML =
      '<h1 class="pc-h1">Loyalty card</h1>' +
      '<p class="pc-sub">Set the reward and card art. Customers collect by entering your live till code — they can’t stamp themselves.</p>' +
      '<div class="pc-sec">Card setup</div>' +
      '<div class="pc-grid"><div>' + formHtml() + '</div><div>' + previewHtml() + '</div></div>' +
      '<div class="pc-sec">At the till</div>' + codeHtml() +
      '<div class="pc-foot"><button class="pc-btn ghost" onclick="FFPLoyalty.reload()">Cancel</button><button class="pc-btn pri" onclick="FFPLoyalty.save()">Save changes</button></div>';
    startCode();
  }

  function setType(t) { S.type = (t === 'points' ? 'points' : 'stamp'); draw(); }

  function pickImg() {
    if (!window.FFPUpload || !FFPUpload.pick) { toast('Upload unavailable'); return; }
    var pid = provId();
    FFPUpload.pick({
      bucket: 'loyalty-cards', key: 'card-' + pid + '-' + Date.now(), aspect: 1, outW: 800, outH: 800, title: 'Card image',
      onDone: function (url) { S.image = url; sync(); var b = document.querySelector('#loy-root .pv-change'); if (b) b.innerHTML = '<span class="sym">photo_camera</span> Change card image'; },
      onError: function () { toast('Couldn’t upload'); }
    });
  }

  async function save() {
    var pid = provId();
    if (!pid) { toast('No provider'); return; }
    var p = { type: S.type, reward: val('loy-reward') || '', image_url: S.image || null, valid_to: val('loy-valid') || null };
    if (S.type === 'stamp') {
      p.stamps_required = parseInt(val('loy-stamps'), 10) || 10;
    } else {
      p.points_per_currency = parseFloat(val('loy-ppc')) || 1;
      p.points_threshold = parseInt(val('loy-thr'), 10) || 100;
    }
    p.active = true;
    try {
      await rpc('loyalty_program_save', { p_provider: pid, p: p });
      toast('Loyalty card saved');
      S.prog = await rpc('loyalty_program_get', { p_provider: pid });
      S.type = (S.prog && S.prog.type) || S.type;
      S.image = (S.prog && S.prog.image_url) || '';
      draw();
    } catch (e) { toast('Couldn’t save'); }
  }

  function startCode() {
    if (S.timer) { clearInterval(S.timer); S.timer = null; }
    if (!S.prog || !S.prog.exists) return;
    var pid = provId();
    async function tick() {
      try {
        var d = await rpc('loyalty_current_code', { p_provider: pid });
        var dig = document.getElementById('loy-digits'); var cd = document.getElementById('loy-cd'); var cs = document.getElementById('loy-cs');
        if (!dig) { clearInterval(S.timer); S.timer = null; return; }
        var c = String(d.code || '').padStart(6, '0');
        dig.textContent = c.slice(0, 3) + ' ' + c.slice(3);
        var left = d.seconds_left || 0;
        if (cd) cd.style.width = Math.max(0, Math.round(100 * left / 60)) + '%';
        if (cs) cs.textContent = 'Refreshes in ' + left + 's';
      } catch (e) {}
    }
    tick();
    S.timer = setInterval(tick, 1000);
  }

  async function load() {
    css();
    var el = root(); if (el) el.innerHTML = '<p class="pc-sub">Loading…</p>';
    var pid = provId();
    if (!pid) { if (el) el.innerHTML = '<div class="till-wait">Complete your provider profile to set up loyalty.</div>'; return; }
    S.biz = bizInfo();
    try { S.prog = await rpc('loyalty_program_get', { p_provider: pid }); }
    catch (e) { S.prog = { exists: false }; }
    S.type = (S.prog && S.prog.exists && S.prog.type) || 'stamp';
    S.image = (S.prog && S.prog.image_url) || '';
    draw();
  }

  window.ffpRenderLoyalty = load;
  window.FFPLoyalty = { save: save, setType: setType, pickImg: pickImg, sync: sync, reload: load };
})();
