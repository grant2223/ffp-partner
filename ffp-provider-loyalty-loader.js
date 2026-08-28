/*  FFP PROVIDER LOYALTY LOADER · v1
    Desktop panel: set up a stamp OR points loyalty card + a live 6-digit staff code
    that rotates every 60 seconds (authenticator-style). Members enter the code at the
    till to earn a stamp/points; they can't add their own. Renders into #loy-root.
    Exposes window.ffpRenderLoyalty (panel hook) + window.FFPLoyalty (actions).       */
(function () {
  'use strict';
  var S = { prog: null, timer: null, type: 'stamp' };

  function root() { return document.getElementById('loy-root'); }
  function provId() {
    return (window.FFP_PROVIDER && window.FFP_PROVIDER.id) ||
           (typeof providerProfile !== 'undefined' && providerProfile && providerProfile.id) || null;
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }
  function toast(m) { try { if (typeof showToast === 'function') showToast(m); } catch (e) {} }
  async function rpc(fn, args) {
    var r = await window.supabase.rpc(fn, args);
    if (r.error) throw r.error;
    return r.data;
  }

  function css() {
    if (document.getElementById('loy-css')) return;
    var s = document.createElement('style'); s.id = 'loy-css';
    s.textContent = [
      '#loy-root{max-width:760px;}',
      '.loy-h{font-size:24px;font-weight:900;letter-spacing:-.5px;color:var(--ffp-text,#16242b);}',
      '.loy-sub{font-size:14px;font-weight:600;color:var(--ffp-text-muted,#7c8a91);margin-top:5px;}',
      '.loy-grid{display:grid;grid-template-columns:1fr 1fr;gap:44px;margin-top:26px;align-items:start;}',
      '@media(max-width:720px){.loy-grid{grid-template-columns:1fr;gap:26px;}}',
      '.loy-uf{border-bottom:2px solid var(--ffp-border,#e7ecf0);padding:11px 0;display:flex;align-items:center;justify-content:space-between;gap:12px;}',
      '.loy-uf label{font-size:12px;font-weight:800;color:var(--ffp-text-muted,#7c8a91);}',
      '.loy-uf input,.loy-uf select{border:none;background:transparent;font-family:inherit;font-size:18px;font-weight:900;color:var(--ffp-text,#16242b);text-align:right;outline:none;max-width:60%;}',
      '.loy-u2{display:flex;gap:30px;}.loy-u2>div{flex:1;}',
      '.loy-code{position:relative;border-radius:20px;overflow:hidden;padding:26px;color:#fff;background:radial-gradient(120% 100% at 85% 0%,#22506c,#0b1a24 62%);box-shadow:0 22px 46px rgba(11,26,36,.34);}',
      '.loy-code .k{position:relative;z-index:2;font-size:11px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;color:#FFCC00;}',
      '.loy-code .digits{position:relative;z-index:2;font-size:46px;font-weight:900;letter-spacing:8px;font-variant-numeric:tabular-nums;margin-top:14px;}',
      '.loy-code .cd{position:relative;z-index:2;height:6px;border-radius:4px;background:rgba(255,255,255,.16);margin-top:16px;overflow:hidden;}',
      '.loy-code .cd i{display:block;height:100%;background:#FFCC00;transition:width 1s linear;}',
      '.loy-code .hint{position:relative;z-index:2;font-size:12.5px;font-weight:600;color:#c3d2dc;margin-top:14px;line-height:1.5;}',
      '.loy-code .glow{position:absolute;right:-40px;top:-40px;width:200px;height:200px;border-radius:50%;background:radial-gradient(circle,rgba(255,204,0,.3),transparent 68%);}',
      '.loy-codewait{border:1.5px dashed var(--ffp-border,#e7ecf0);border-radius:20px;padding:26px;text-align:center;color:var(--ffp-text-muted,#7c8a91);font-weight:700;font-size:13.5px;line-height:1.6;}',
      '.loy-foot{margin-top:32px;display:flex;justify-content:flex-end;}'
    ].join('');
    document.head.appendChild(s);
  }

  function fieldsHtml() {
    var p = S.prog || {};
    var t = S.type;
    var reward = esc(p.reward || '');
    if (t === 'stamp') {
      return '' +
        '<div class="loy-uf"><label>Card type</label>' + typeSelect() + '</div>' +
        '<div class="loy-u2">' +
          '<div class="loy-uf"><label>Stamps to earn</label><input id="loy-stamps" type="number" min="2" max="30" value="' + (p.stamps_required || 9) + '"></div>' +
          '<div class="loy-uf"><label>Reward</label><input id="loy-reward" type="text" placeholder="Free coffee" value="' + reward + '"></div>' +
        '</div>';
    }
    return '' +
      '<div class="loy-uf"><label>Card type</label>' + typeSelect() + '</div>' +
      '<div class="loy-u2">' +
        '<div class="loy-uf"><label>Points per $1</label><input id="loy-ppc" type="number" min="0" step="0.1" value="' + (p.points_per_currency || 1) + '"></div>' +
        '<div class="loy-uf"><label>Points for reward</label><input id="loy-thr" type="number" min="1" value="' + (p.points_threshold || 100) + '"></div>' +
      '</div>' +
      '<div class="loy-uf"><label>Reward</label><input id="loy-reward" type="text" placeholder="$10 off" value="' + reward + '"></div>';
  }
  function typeSelect() {
    return '<select id="loy-type" onchange="FFPLoyalty.setType(this.value)">' +
      '<option value="stamp"' + (S.type === 'stamp' ? ' selected' : '') + '>Stamp card</option>' +
      '<option value="points"' + (S.type === 'points' ? ' selected' : '') + '>Points card</option>' +
    '</select>';
  }
  function codeHtml() {
    if (!S.prog || !S.prog.exists) {
      return '<div class="loy-codewait">Save your card to activate the staff code.<br>It refreshes every 60 seconds — staff read it to the customer at the till.</div>';
    }
    return '<div class="loy-code"><div class="glow"></div>' +
      '<div class="k">Staff code · read at the till</div>' +
      '<div class="digits" id="loy-digits">••• •••</div>' +
      '<div class="cd"><i id="loy-cd" style="width:100%"></i></div>' +
      '<div class="hint">Changes every 60 seconds, like an authenticator. Customers can’t add their own — staff read the live code.</div>' +
    '</div>';
  }

  function draw() {
    var el = root(); if (!el) return;
    el.innerHTML =
      '<div class="loy-h">Loyalty card</div>' +
      '<div class="loy-sub">Reward repeat customers with a stamp or points card.</div>' +
      '<div class="loy-grid">' +
        '<div>' + fieldsHtml() + '</div>' +
        '<div>' + codeHtml() + '</div>' +
      '</div>' +
      '<div class="loy-foot"><button class="btn btn-pri" onclick="FFPLoyalty.save()">Save loyalty card</button></div>';
    startCode();
  }

  function setType(t) { S.type = (t === 'points' ? 'points' : 'stamp'); draw(); }

  async function save() {
    var pid = provId();
    if (!pid) { toast('No provider'); return; }
    var p = { type: S.type, reward: (document.getElementById('loy-reward') || {}).value || '' };
    if (S.type === 'stamp') {
      p.stamps_required = parseInt((document.getElementById('loy-stamps') || {}).value, 10) || 9;
    } else {
      p.points_per_currency = parseFloat((document.getElementById('loy-ppc') || {}).value) || 1;
      p.points_threshold = parseInt((document.getElementById('loy-thr') || {}).value, 10) || 100;
    }
    p.active = true;
    try {
      await rpc('loyalty_program_save', { p_provider: pid, p: p });
      toast('Loyalty card saved');
      S.prog = await rpc('loyalty_program_get', { p_provider: pid });
      S.type = (S.prog && S.prog.type) || S.type;
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
        var dig = document.getElementById('loy-digits'); var cd = document.getElementById('loy-cd');
        if (!dig) { clearInterval(S.timer); S.timer = null; return; }   // panel left
        var c = String(d.code || '').padStart(6, '0');
        dig.textContent = c.slice(0, 3) + ' ' + c.slice(3);
        if (cd) cd.style.width = Math.max(0, Math.round(100 * (d.seconds_left || 0) / 60)) + '%';
      } catch (e) {}
    }
    tick();
    S.timer = setInterval(tick, 1000);
  }

  async function load() {
    css();
    var el = root(); if (el) el.innerHTML = '<div class="loy-sub">Loading…</div>';
    var pid = provId();
    if (!pid) { if (el) el.innerHTML = '<div class="loy-codewait">Complete your provider profile to set up loyalty.</div>'; return; }
    try { S.prog = await rpc('loyalty_program_get', { p_provider: pid }); }
    catch (e) { S.prog = { exists: false }; }
    S.type = (S.prog && S.prog.exists && S.prog.type) || 'stamp';
    draw();
  }

  window.ffpRenderLoyalty = load;
  window.FFPLoyalty = { save: save, setType: setType };
})();
