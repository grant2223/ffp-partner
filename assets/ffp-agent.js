/* Grant — shared in-dashboard assistant UI (Partner + Professional). v1
   A floating launcher + slide-in chat. Detects role from window.FFP_PROVIDER, sends the conversation +
   light account context to the backend /api/agent/chat, renders the reply, and when the agent asks, opens
   the right screen via window.showPanel(panel). v1 guides / navigates / drafts — it does not change data. */
(function () {
  'use strict';
  if (window.__ffpAgentLoaded) return; window.__ffpAgentLoaded = true;
  var API = 'https://ffp-passport-backend.vercel.app';
  var BLUE = '#1980AD';
  var msgs = [];           // { role:'user'|'assistant'|'nav', content }
  var sessionId = 'ag-' + Math.random().toString(36).slice(2);
  var busy = false, greeted = false;

  function role() { try { return (window.FFP_PROVIDER && FFP_PROVIDER.role === 'professional') ? 'pro' : 'partner'; } catch (e) { return 'partner'; } }
  function P() { return window.FFP_PROVIDER || {}; }
  function ctx() { var p = P(); return { role: role(), name: p.business_name || p.display_name || '', payments_status: p.payments_status || '', currency: p.currency || '', city: p.city || '', country: p.country || '', timezone: p.timezone || '' }; }
  function memberId() { var p = P(); return p.member_id || null; }
  function jwt() { try { return (window.FFPAuth && FFPAuth.getJwt && FFPAuth.getJwt()) || null; } catch (e) { return null; } }
  function providerId() { var p = P(); return p.id || ''; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }
  function nl2br(s) { return esc(s).replace(/\n/g, '<br>'); }

  function injectStyles() {
    if (document.getElementById('ffp-agent-styles')) return;
    var s = document.createElement('style'); s.id = 'ffp-agent-styles'; s.textContent =
      '#ffpa-fab{position:fixed;right:18px;bottom:18px;width:58px;height:58px;border-radius:50%;background:' + BLUE + ';color:#fff;border:none;cursor:pointer;z-index:2147483600;box-shadow:0 8px 24px rgba(0,0,0,.28);display:flex;align-items:center;justify-content:center;}' +
      '#ffpa-fab svg{width:28px;height:28px;}' +
      '#ffpa-fab .dot{position:absolute;top:12px;right:12px;width:9px;height:9px;border-radius:50%;background:#FFCC00;border:2px solid ' + BLUE + ';}' +
      '#ffpa-panel{position:fixed;right:18px;bottom:18px;width:380px;max-width:calc(100vw - 24px);height:72vh;max-height:680px;background:#fff;border-radius:18px;z-index:2147483601;box-shadow:0 24px 70px rgba(0,0,0,.38);display:none;flex-direction:column;overflow:hidden;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;}' +
      '#ffpa-panel.open{display:flex;}' +
      '@media(max-width:560px){#ffpa-panel{right:0;bottom:0;width:100vw;max-width:100vw;height:88vh;border-radius:18px 18px 0 0;}}' +
      '@media(max-width:859px){#ffpa-fab{bottom:calc(82px + env(safe-area-inset-bottom));}}' +
      '.ffpa-head{display:flex;align-items:center;gap:10px;padding:14px 16px;background:' + BLUE + ';color:#fff;}' +
      '.ffpa-head .t{font-weight:800;font-size:15px;flex:1;}' +
      '.ffpa-head .sub{font-size:11px;font-weight:600;opacity:.85;}' +
      '.ffpa-x{background:rgba(255,255,255,.18);border:none;color:#fff;width:30px;height:30px;border-radius:50%;cursor:pointer;font-size:18px;line-height:1;}' +
      '.ffpa-body{flex:1;overflow-y:auto;padding:16px;background:#f4f7f9;}' +
      '.ffpa-msg{max-width:84%;padding:10px 13px;border-radius:14px;font-size:14px;line-height:1.5;margin-bottom:10px;word-wrap:break-word;}' +
      '.ffpa-msg.u{background:' + BLUE + ';color:#fff;margin-left:auto;border-bottom-right-radius:5px;}' +
      '.ffpa-msg.a{background:#fff;color:#15232e;border:1px solid #e4eaef;border-bottom-left-radius:5px;}' +
      '.ffpa-nav{font-size:12px;font-weight:700;color:' + BLUE + ';margin:0 0 12px 2px;display:flex;align-items:center;gap:5px;}' +
      '.ffpa-typing{display:inline-flex;gap:4px;padding:12px 14px;}' +
      '.ffpa-typing i{width:7px;height:7px;border-radius:50%;background:#b6c2cc;display:inline-block;animation:ffpaB 1s infinite;}' +
      '.ffpa-typing i:nth-child(2){animation-delay:.15s;}.ffpa-typing i:nth-child(3){animation-delay:.3s;}' +
      '@keyframes ffpaB{0%,60%,100%{opacity:.3;}30%{opacity:1;}}' +
      '.ffpa-confirm{background:#fff;border:1.5px solid ' + BLUE + ';border-radius:14px;padding:13px 14px;margin-bottom:12px;}' +
      '.ffpa-confirm .lab{font-size:10.5px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;color:' + BLUE + ';margin-bottom:4px;}' +
      '.ffpa-confirm .t{font-size:14px;font-weight:700;color:#15232e;margin-bottom:11px;line-height:1.4;}' +
      '.ffpa-confirm .b{display:flex;gap:8px;justify-content:flex-end;}' +
      '.ffpa-confirm .b button{border:none;border-radius:9px;padding:9px 16px;font-size:13px;font-weight:800;cursor:pointer;font-family:inherit;}' +
      '.ffpa-confirm .cancel{background:#eef2f5;color:#46545f;}' +
      '.ffpa-confirm .ok{background:' + BLUE + ';color:#fff;}' +
      '.ffpa-chips{display:flex;flex-wrap:wrap;gap:7px;margin:2px 0 4px;}' +
      '.ffpa-chip{font-size:12.5px;font-weight:600;padding:8px 12px;border-radius:999px;border:1px solid #cfdae2;background:#fff;color:#15232e;cursor:pointer;}' +
      '.ffpa-foot{display:flex;gap:8px;padding:12px;border-top:1px solid #e4eaef;background:#fff;}' +
      '.ffpa-in{flex:1;border:1px solid #cfdae2;border-radius:12px;padding:11px 13px;font-size:16px;font-family:inherit;color:#15232e;outline:none;resize:none;max-height:96px;}' +
      '.ffpa-send{background:' + BLUE + ';color:#fff;border:none;border-radius:12px;width:46px;flex:0 0 auto;cursor:pointer;font-size:18px;display:flex;align-items:center;justify-content:center;}' +
      '.ffpa-send:disabled{opacity:.5;}';
    document.head.appendChild(s);
  }

  function build() {
    injectStyles();
    var fab = document.createElement('button'); fab.id = 'ffpa-fab'; fab.setAttribute('aria-label', 'Ask Grant');
    fab.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg><span class="dot"></span>';
    fab.onclick = toggle;
    document.body.appendChild(fab);

    var panel = document.createElement('div'); panel.id = 'ffpa-panel';
    panel.innerHTML =
      '<div class="ffpa-head"><div><div class="t">Grant</div><div class="sub">Grow your business — setup &amp; day-to-day</div></div><button class="ffpa-x" aria-label="Close">&times;</button></div>' +
      '<div class="ffpa-body" id="ffpa-body"></div>' +
      '<div class="ffpa-foot"><textarea class="ffpa-in" id="ffpa-in" rows="1" placeholder="Ask anything about your account…"></textarea><button class="ffpa-send" id="ffpa-send" aria-label="Send">&#10148;</button></div>';
    document.body.appendChild(panel);
    panel.querySelector('.ffpa-x').onclick = close;
    var inp = panel.querySelector('#ffpa-in');
    panel.querySelector('#ffpa-send').onclick = function () { var v = inp.value.trim(); if (v) { inp.value = ''; send(v); } };
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); var v = inp.value.trim(); if (v) { inp.value = ''; send(v); } } });
  }

  function toggle() { var p = document.getElementById('ffpa-panel'); if (!p) return; if (p.classList.contains('open')) close(); else open(); }
  function open() {
    var p = document.getElementById('ffpa-panel'); if (!p) return;
    p.classList.add('open');
    var d = document.getElementById('ffpa-fab'); if (d) d.querySelector('.dot') && (d.querySelector('.dot').style.display = 'none');
    if (!greeted) { greeted = true; greet(); }
    var inp = document.getElementById('ffpa-in'); if (inp) setTimeout(function () { inp.focus(); }, 80);
  }
  function close() { var p = document.getElementById('ffpa-panel'); if (p) p.classList.remove('open'); }

  function greet() {
    var pro = role() === 'pro';
    var name = (P().business_name || P().display_name || '').split(' ')[0];
    var hi = 'Hi' + (name ? ' ' + name : '') + ' 👋 I’m Grant. I’m here to help you ' + (pro ? 'grow your coaching business and finish setting up your profile' : 'grow your business and promote your services') + ', plus handle the day-to-day. What would you like to do?';
    pushAssistant(hi);
    var chips = pro
      ? ['Help me finish setup', 'Connect payments (Stripe)', 'Add a service', 'How do bookings work?']
      : ['Help me finish setup', 'Connect payments (Stripe)', 'Add a session', 'What’s left to set up?'];
    renderChips(chips);
  }

  function renderChips(chips) {
    var body = document.getElementById('ffpa-body'); if (!body) return;
    var wrap = document.createElement('div'); wrap.className = 'ffpa-chips'; wrap.id = 'ffpa-chips';
    wrap.innerHTML = chips.map(function (c) { return '<button class="ffpa-chip">' + esc(c) + '</button>'; }).join('');
    body.appendChild(wrap);
    Array.prototype.forEach.call(wrap.querySelectorAll('.ffpa-chip'), function (b) { b.onclick = function () { send(b.textContent); }; });
    body.scrollTop = body.scrollHeight;
  }

  function pushAssistant(t) { msgs.push({ role: 'assistant', content: t }); render(); }
  function render() {
    var body = document.getElementById('ffpa-body'); if (!body) return;
    body.innerHTML = msgs.map(function (m) {
      if (m.role === 'nav') return '<div class="ffpa-nav">→ Opened ' + esc(m.content) + '</div>';
      return '<div class="ffpa-msg ' + (m.role === 'user' ? 'u' : 'a') + '">' + nl2br(m.content) + '</div>';
    }).join('') + (busy ? '<div class="ffpa-typing"><i></i><i></i><i></i></div>' : '');
    body.scrollTop = body.scrollHeight;
  }

  function send(text) {
    if (busy || !text.trim()) return;
    var chips = document.getElementById('ffpa-chips'); if (chips) chips.remove();
    msgs.push({ role: 'user', content: text }); busy = true; render();
    fetch(API + '/api/agent/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role: role(), member_id: memberId(), session: sessionId, context: ctx(), messages: msgs.filter(function (m) { return m.role !== 'nav'; }).slice(-16) }) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, status: r.status, j: j }; }, function () { return { ok: false, status: r.status, j: null }; }); })
      .then(function (res) {
        busy = false;
        if (res.status === 503) { pushAssistant('Grant isn’t available right now — check back shortly.'); return; }
        if (!res.ok || !res.j || (!res.j.reply && !res.j.proposal)) { pushAssistant('Sorry, I had trouble there. Please try again.'); return; }
        if (res.j.reply) pushAssistant(res.j.reply);
        var nav = res.j.navigate;
        if (nav && nav.panel && typeof window.showPanel === 'function') {
          try { window.showPanel(nav.panel); msgs.push({ role: 'nav', content: nav.panel }); render(); } catch (e) {}
        }
        if (res.j.proposal) renderConfirm(res.j.proposal);
      })
      .catch(function () { busy = false; pushAssistant('Network error — please try again.'); });
  }

  function renderConfirm(prop) {
    var body = document.getElementById('ffpa-body'); if (!body) return;
    var card = document.createElement('div'); card.className = 'ffpa-confirm';
    card.innerHTML = '<div class="lab">Confirm action</div><div class="t">' + esc(prop.summary || prop.action) + '</div>' +
      '<div class="b"><button class="cancel">Cancel</button><button class="ok">Confirm</button></div>';
    body.appendChild(card); body.scrollTop = body.scrollHeight;
    card.querySelector('.cancel').onclick = function () { card.remove(); pushAssistant('No problem — cancelled. Anything else?'); };
    card.querySelector('.ok').onclick = function () { card.querySelector('.b').innerHTML = '<span style="font-size:12px;color:#8a99a8;">Working…</span>'; execute(prop, card); };
  }

  function execute(prop, card) {
    fetch(API + '/api/agent/execute', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: prop.action, args: prop.args, provider_id: providerId(), jwt: jwt(), role: role(), member_id: memberId(), session: sessionId }) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, status: r.status, j: j }; }, function () { return { ok: false, status: r.status, j: null }; }); })
      .then(function (res) {
        if (card) card.remove();
        if (res.status === 401) { pushAssistant('I need you signed in to do that — please sign in again, then ask me once more.'); return; }
        if (!res.ok || !res.j) { pushAssistant('That didn’t go through — please try again.'); return; }
        if (res.j.ok === false) { pushAssistant(res.j.error || 'That didn’t go through — please try from the screen.'); return; }
        pushAssistant('✅ ' + (res.j.message || 'Done.'));
        if (res.j.navigate && typeof window.showPanel === 'function') { try { window.showPanel(res.j.navigate); msgs.push({ role: 'nav', content: res.j.navigate }); render(); } catch (e) {} }
      })
      .catch(function () { if (card) card.remove(); pushAssistant('Network error — please try again.'); });
  }

  // Only show once the user is signed into the dashboard (FFP_PROVIDER is set after auth) — never on the gate.
  function boot() {
    var tries = 0;
    (function chk() {
      if (document.getElementById('ffpa-fab')) return;
      var p = window.FFP_PROVIDER;
      if (p && (p.id || p.member_id)) { build(); return; }
      if (tries++ < 80) setTimeout(chk, 500);
    })();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
