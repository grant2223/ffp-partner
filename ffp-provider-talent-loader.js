// ════════════════════════════════════════════════════════════════════════
// FFP Partner Portal — TALENT  (Engagement → Talent) — v1 (2026-11-04)
// Book MCs, commentators, photographers and crew through FFP Talent.
// Approved mock: talent-partner-mock.png (Grant, 2026-11-04 "Go").
//
//   Roles               every role this partner posted, with the one thing to do next
//   Post a role         four full-bleed steps: role, when and where, budget band + fee, brief
//   A role              Applied / You asked / Find talent; reels, offers, asked-for fees
//   Bookings            each booking with its two invoices (FFP bank transfer) and a rating after
//
// Every read and write is a SECURITY DEFINER RPC checked against this provider
// (_talent_can_manage: owner, staff at full/manage/organiser, or FFP admin):
//   provider_talent_requests, provider_talent_request_save, provider_talent_request_cancel,
//   provider_talent_applicants, provider_talent_search, provider_talent_invite,
//   provider_talent_offer, provider_talent_counter, provider_talent_bookings,
//   provider_talent_review, talent_conversation.
// Money is by bank transfer to FFP: the deposit landing is what books the talent.
// The same file runs inside the FFP admin (Talent roles), loaded from this host, with
// window.FFP_TALENT_ADMIN = true and window.FFP_PROVIDER = the partner FFP is running it for.
// Every screen is FULL BLEED. Nothing saves until the button that says so.
// ════════════════════════════════════════════════════════════════════════
(function () {
if (window.__ffpTalentLoaded) return;
window.__ffpTalentLoaded = true;

var TZ = 'Asia/Dubai';
var TIERS = ['', 'Rising', 'Pro', 'Premier', 'Headline'];
var TIER_NOTE = ['', 'Newer talent with a checked reel.', 'Regular event work, strong reviews.', 'Major events and broadcast credits.', 'Household names. FFP confirms the price.'];
var LEVEL = { rules: 'knows the rules', played: 'played it', expert: 'expert' };
var S = { roles: null, bookings: null, bank: null, tab: 'roles', skills: [], acts: [], cities: [] };

function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function pid() { return (window.FFP_PROVIDER || {}).id; }
function db() { return window.supabase; }
function toast(m, t) { if (typeof showToast === 'function') showToast(m, t || 'success'); }
function aed(n) { return 'AED ' + Number(n || 0).toLocaleString('en-US'); }
function part(iso, o) { return new Date(iso).toLocaleString('en-GB', Object.assign({ timeZone: TZ }, o)); }
function dd(iso) { return part(iso, { day: '2-digit' }); }
function mon(iso) { return part(iso, { month: 'short' }); }
function dayLine(iso) { return part(iso, { weekday: 'short' }) + ' ' + part(iso, { day: 'numeric' }) + ' ' + part(iso, { month: 'short' }); }
function clock(iso) { return part(iso, { hour: '2-digit', minute: '2-digit', hour12: false }); }
function hours(a, b) { return Math.round((new Date(b) - new Date(a)) / 1800000) / 2; }
function dubaiIso(date, time) { return date && time ? date + 'T' + time + ':00+04:00' : null; }
function dubaiDate(iso) { return iso ? new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ }) : ''; }
function dubaiTime(iso) { return iso ? clock(iso) : ''; }
function skillLabel(v) { var s = S.skills.find(function (x) { return x.value === v; }); return s ? s.label : v; }
function actLabel(v) { var s = S.acts.find(function (x) { return x.value === v; }); return s ? s.label : String(v).replace(/_/g, ' '); }
async function rpc(fn, args) {
  var r = await db().rpc(fn, args);
  if (r.error) throw new Error(r.error.message);
  return r.data;
}

/* ── styles: scoped to .tal ── */
(function () {
  if (document.getElementById('tal-css')) return;
  var st = document.createElement('style'); st.id = 'tal-css';
  st.textContent = [
'#panel-talent .tal-top{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;flex-wrap:wrap}',
'.tal-rows{margin-top:10px;border-top:1px solid var(--ffp-border)}',
'.tal-rw{display:flex;align-items:center;gap:16px;padding:16px 4px;border-bottom:1px solid var(--ffp-border);cursor:pointer;width:100%;background:none;border-left:0;border-right:0;border-top:0;text-align:left;font-family:inherit}',
'.tal-rw:hover{background:#f7f9fa}',
'.tal-dt{width:54px;flex:none;text-align:center}',
'.tal-dt b{display:block;font:900 26px/1 Montserrat,sans-serif;letter-spacing:-.03em;color:var(--ffp-text)}',
'.tal-dt i{display:block;font:800 10px/1 Montserrat,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:var(--ffp-text-dim);margin-top:4px;font-style:normal}',
'.tal-sp{width:3px;align-self:stretch;border-radius:2px;background:var(--ffp-border-mid);flex:none}',
'.tal-sp.w{background:#f2a900}.tal-sp.b{background:var(--ffp-blue)}.tal-sp.g{background:var(--ffp-green)}',
'.tal-g{flex:1;min-width:0}',
'.tal-g b{display:block;font:800 16px/1.25 Montserrat,sans-serif;color:var(--ffp-text)}',
'.tal-g span{display:block;font:500 13px/1.4 Montserrat,sans-serif;color:var(--ffp-text-muted);margin-top:3px}',
'.tal-g em{display:block;font:700 13px/1.3 Montserrat,sans-serif;font-style:normal;margin-top:6px;color:var(--ffp-blue)}',
'.tal-g em.w{color:#b36b00}.tal-g em.g{color:var(--ffp-green)}.tal-g em.d{color:var(--ffp-text-dim)}',
'.tal-amt{flex:none;text-align:right;font:900 17px/1.1 Montserrat,sans-serif;color:var(--ffp-text)}',
'.tal-amt small{display:block;font:600 11.5px/1.3 Montserrat,sans-serif;color:var(--ffp-text-dim);margin-top:3px}',
'.tal-cv{flex:none;color:var(--ffp-text-dim);font-size:22px}',
'.tal-lbl{font:800 11px/1 Montserrat,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:var(--ffp-text-dim);margin:26px 0 0}',
'.tal-empty{padding:34px 0 10px;font:500 14px/1.5 Montserrat,sans-serif;color:var(--ffp-text-muted)}',
'.tal-empty b{display:block;font:800 17px/1.3 Montserrat,sans-serif;color:var(--ffp-text);margin-bottom:4px}',
'.tal-how{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:22px;margin-top:30px;padding-top:22px;border-top:1px solid var(--ffp-border)}',
'.tal-how div b{display:block;font:800 14px/1.3 Montserrat,sans-serif;color:var(--ffp-text)}',
'.tal-how div span:not(.ms){display:block;font:500 13px/1.45 Montserrat,sans-serif;color:var(--ffp-text-muted);margin-top:4px}',
'.tal-how .ms{font-size:26px;color:var(--ffp-blue);margin-bottom:8px}',
/* full bleed */
'.tal-fb{position:fixed;inset:0;z-index:9000;background:#fff;display:flex;flex-direction:column}',
'.tal-fbh{flex:none;background:var(--ffp-blue);color:#fff;display:flex;align-items:center;gap:14px;padding:calc(env(safe-area-inset-top,0px) + 16px) 28px 16px}',
'.tal-fbh button{background:none;border:0;color:#fff;cursor:pointer;width:40px;height:40px;display:flex;align-items:center;justify-content:center;flex:none}',
'.tal-fbh button .ms{font-size:26px}',
'.tal-fbh h2{font:900 20px/1.2 Montserrat,sans-serif;flex:1;min-width:0}',
'.tal-fbh small{display:block;font:600 12.5px/1.35 Montserrat,sans-serif;opacity:.85;margin-top:3px}',
'.tal-fbb{flex:1;overflow:auto;padding:22px 28px 30px;-webkit-overflow-scrolling:touch}',
'.tal-fbf{flex:none;border-top:1px solid var(--ffp-border);padding:14px 28px calc(env(safe-area-inset-bottom,0px) + 14px);display:flex;gap:12px;align-items:center;justify-content:flex-end;background:#fff;flex-wrap:wrap}',
'.tal-fbf .tal-left{margin-right:auto}',
'.tal-fbf:empty{display:none}',
'.tal-wrap{max-width:980px;margin:0 auto}',
'.tal-steps{display:flex;gap:6px;margin-top:10px}.tal-steps i{flex:1;height:4px;border-radius:2px;background:rgba(255,255,255,.3)}.tal-steps i.on{background:#fff}',
'.tal-h3{font:900 24px/1.2 Montserrat,sans-serif;color:var(--ffp-text)}',
'.tal-p{font:500 14px/1.5 Montserrat,sans-serif;color:var(--ffp-text-muted);margin-top:6px}',
'.tal-fld{margin-top:20px}',
'.tal-fld label{display:block;font:800 11px/1 Montserrat,sans-serif;letter-spacing:.1em;text-transform:uppercase;color:var(--ffp-text-dim);margin-bottom:8px}',
'.tal-in{width:100%;height:50px;border-radius:10px;background:var(--ffp-bg-3);border:0;padding:0 16px;font:700 16px/1 Montserrat,sans-serif;color:var(--ffp-text);outline:none}',
'textarea.tal-in{height:auto;min-height:96px;padding:14px 16px;line-height:1.45;font-weight:600;resize:vertical}',
'.tal-in:focus{box-shadow:inset 0 0 0 2px var(--ffp-blue)}',
'.tal-in.bad{box-shadow:inset 0 0 0 2px var(--ffp-red)}',
'.tal-two{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 18px}',
'.tal-three{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:0 18px}',
'.tal-hint{font:600 12.5px/1.4 Montserrat,sans-serif;color:var(--ffp-text-dim);margin-top:8px}.tal-hint.bad{color:var(--ffp-red)}',
'.tal-err{margin-top:16px;background:#fdecea;color:#a3271b;border-radius:8px;padding:12px 14px;font:700 13.5px/1.4 Montserrat,sans-serif}',
'.tal-pick{display:flex;align-items:center;gap:12px;width:100%;min-height:54px;padding:0 4px;border:0;border-bottom:1px solid var(--ffp-border);background:none;cursor:pointer;font:700 15px/1.3 Montserrat,sans-serif;color:var(--ffp-text);text-align:left}',
'.tal-pick .tal-bx{margin-left:auto;width:26px;height:26px;border-radius:7px;background:var(--ffp-bg-3);display:flex;align-items:center;justify-content:center;color:#fff;flex:none}',
'.tal-pick.on .tal-bx{background:var(--ffp-blue)}.tal-pick .tal-bx .ms{font-size:19px}',
'.tal-bands{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-top:14px}',
'.tal-band{background:var(--ffp-bg-3);border-radius:10px;padding:18px 16px;cursor:pointer;border:2px solid transparent;text-align:left;font-family:inherit;display:flex;flex-direction:column;justify-content:flex-start}',
'.tal-band b{display:block;font:900 18px/1.2 Montserrat,sans-serif;color:var(--ffp-text)}',
'.tal-band u{display:block;text-decoration:none;font:800 15px/1.2 Montserrat,sans-serif;color:var(--ffp-blue);margin-top:8px}',
'.tal-band span{display:block;font:500 12.5px/1.45 Montserrat,sans-serif;color:var(--ffp-text-muted);margin-top:8px}',
'.tal-band.on{background:#e3f1f8;border-color:var(--ffp-blue)}',
'.tal-seg{display:flex;gap:8px;flex-wrap:wrap}',
'.tal-seg button{height:44px;padding:0 16px;border-radius:10px;border:0;background:var(--ffp-bg-3);font:800 13.5px/1 Montserrat,sans-serif;color:var(--ffp-text);cursor:pointer}',
'.tal-seg button.on{background:var(--ffp-blue);color:#fff}',
'.tal-sum{display:flex;gap:30px;flex-wrap:wrap;padding:4px 0 18px;border-bottom:1px solid var(--ffp-border)}',
'.tal-sum div b{display:block;font:900 20px/1.1 Montserrat,sans-serif;color:var(--ffp-text)}',
'.tal-sum div span{display:block;font:700 11px/1 Montserrat,sans-serif;letter-spacing:.1em;text-transform:uppercase;color:var(--ffp-text-dim);margin-top:6px}',
'.tal-ap{display:grid;grid-template-columns:72px minmax(0,1fr) 220px auto;gap:18px;align-items:center;padding:18px 0;border-bottom:1px solid var(--ffp-border)}',
'.tal-ph{width:72px;height:72px;border-radius:8px;background:#dfe6eb center/cover}',
'.tal-who b{display:block;font:800 17px/1.2 Montserrat,sans-serif;color:var(--ffp-text)}',
'.tal-who .tier{display:inline-block;font:800 11px/1 Montserrat,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:var(--ffp-blue);margin-top:6px}',
'.tal-who .st{font:600 12.5px/1.4 Montserrat,sans-serif;color:var(--ffp-text-muted);margin-top:5px}',
'.tal-who q{display:block;font:500 13.5px/1.45 Montserrat,sans-serif;color:var(--ffp-text);margin-top:8px;quotes:none}',
'.tal-who .state{font:700 12.5px/1.3 Montserrat,sans-serif;color:var(--ffp-blue);margin-top:8px}',
'.tal-reel{position:relative;height:124px;border-radius:8px;background:#1b252c;cursor:pointer;overflow:hidden;border:0;padding:0;width:100%}',
'.tal-reel video,.tal-reel img{width:100%;height:100%;object-fit:cover;display:block;pointer-events:none}',
'.tal-reel::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,0) 40%,rgba(0,0,0,.6))}',
'.tal-reel .ms{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);font-size:44px;color:#fff;z-index:2;font-variation-settings:"FILL" 1,"wght" 400,"GRAD" 0,"opsz" 48}',
'.tal-reel i{position:absolute;right:10px;bottom:8px;z-index:2;font:800 11px/1 Montserrat,sans-serif;letter-spacing:.08em;color:#fff;font-style:normal}',
'.tal-noreel{height:124px;border-radius:8px;background:var(--ffp-bg-3);display:flex;align-items:center;justify-content:center;font:700 12.5px/1.3 Montserrat,sans-serif;color:var(--ffp-text-dim);text-align:center;padding:10px}',
'.tal-act{display:flex;flex-direction:column;gap:8px;align-items:stretch;min-width:150px}',
'.tal-ask{grid-column:2/-1;display:flex;align-items:center;gap:14px;background:#fff6e0;border-left:3px solid #f2a900;padding:12px 14px;border-radius:0 8px 8px 0;flex-wrap:wrap}',
'.tal-ask b{font:800 14px/1.3 Montserrat,sans-serif;color:#5c3d00;flex:1;min-width:180px}',
'.tal-ask b span{display:block;font:500 12.5px/1.4 Montserrat,sans-serif;color:#7a5a17;margin-top:2px}',
'.tal-player{position:fixed;inset:0;z-index:9500;background:#000;display:flex;flex-direction:column}',
'.tal-player .tal-fbh{background:#000}',
'.tal-player video{flex:1;width:100%;min-height:0;background:#000}',
'.tal-inv{display:grid;grid-template-columns:minmax(0,5fr) minmax(0,6fr);gap:44px}',
'.tal-due{font:800 12px/1 Montserrat,sans-serif;letter-spacing:.1em;text-transform:uppercase;color:#b36b00}.tal-due.g{color:var(--ffp-green)}',
'.tal-big{font:900 54px/1 Montserrat,sans-serif;letter-spacing:-.03em;color:var(--ffp-text);margin-top:12px}',
'.tal-big small{font:800 18px/1 Montserrat,sans-serif;color:var(--ffp-text-dim);margin-right:8px;vertical-align:20px}',
'.tal-for{font:600 14px/1.5 Montserrat,sans-serif;color:var(--ffp-text-muted);margin-top:10px}',
'.tal-bank{border-top:1px solid var(--ffp-border)}',
'.tal-bk{display:flex;align-items:center;gap:12px;padding:14px 0;border-bottom:1px solid var(--ffp-border)}',
'.tal-bk>span{width:130px;flex:none;font:700 12px/1.2 Montserrat,sans-serif;color:var(--ffp-text-dim);text-transform:uppercase;letter-spacing:.08em}',
'.tal-bk b{flex:1;font:800 16px/1.3 Montserrat,sans-serif;color:var(--ffp-text);letter-spacing:.01em;word-break:break-word}',
'.tal-copy{flex:none;background:var(--ffp-bg-3);border:0;border-radius:8px;height:36px;padding:0 12px;font:800 12px/1 Montserrat,sans-serif;color:var(--ffp-blue);display:flex;align-items:center;gap:6px;cursor:pointer}',
'.tal-ref{margin-top:18px;background:#fff6e0;border-left:3px solid #f2a900;padding:14px 16px;font:600 14px/1.45 Montserrat,sans-serif;color:#5c3d00}',
'.tal-ref.g{background:#e7f6ee;border-left-color:var(--ffp-green);color:#145c34}',
'.tal-invrow{display:flex;align-items:center;gap:14px;padding:14px 0;border-bottom:1px solid var(--ffp-border);cursor:pointer}',
'.tal-invrow b{flex:1;font:800 15px/1.3 Montserrat,sans-serif;color:var(--ffp-text)}',
'.tal-invrow b span{display:block;font:600 12.5px/1.4 Montserrat,sans-serif;color:var(--ffp-text-muted);margin-top:2px}',
'.tal-stars{display:flex;gap:10px;margin-top:10px}',
'.tal-stars button{width:56px;height:56px;border-radius:10px;border:0;background:var(--ffp-bg-3);cursor:pointer;color:#b9c3cb}',
'.tal-stars button .ms{font-size:30px;font-variation-settings:"FILL" 1,"wght" 400,"GRAD" 0,"opsz" 48}',
'.tal-stars button.on{background:#fff3cf;color:#f2a900}',
'@media (max-width:760px){.tal-bk>span{width:92px}.tal-ap{grid-template-columns:64px minmax(0,1fr)}.tal-reel,.tal-noreel{grid-column:1/-1;height:190px}.tal-act{grid-column:1/-1;flex-direction:row}.tal-act .btn{flex:1;justify-content:center}.tal-ask{grid-column:1/-1}.tal-bands{grid-template-columns:repeat(2,minmax(0,1fr))}.tal-inv{grid-template-columns:1fr;gap:24px}.tal-fbh,.tal-fbb,.tal-fbf{padding-left:18px;padding-right:18px}.tal-how{grid-template-columns:1fr}.tal-sum{gap:18px}.tal-two,.tal-three{grid-template-columns:1fr}.tal-amt small{display:none}.tal-amt{font-size:15px}.tal-rw{gap:12px}.tal-dt{width:42px}.tal-big{font-size:44px}}',
'@media print{body>*:not(.tal-fb){display:none!important}.tal-fb{position:static}.tal-fbf,.tal-fbh button,.tal-copy{display:none!important}.tal-fbh{background:#fff;color:#0e2531;border-bottom:2px solid #0e2531}}'
  ].join('\n');
  document.head.appendChild(st);
})();

/* ── taxonomy: the same lists the talent picked from ── */
var _taxLoaded = false;
async function loadTax() {
  if (_taxLoaded) return;
  var q = function (k) { return db().from('taxonomy_items').select('value,label,sort_order').eq('list_key', k).eq('active', true).order('sort_order').order('label'); };
  var r = await Promise.all([q('talent_skill'), q('activity'), q('city')]);
  S.skills = (r[0].data || []); S.acts = (r[1].data || []); S.cities = (r[2].data || []);
  _taxLoaded = true;
}

/* ── full-bleed screen ── */
function screen(title, sub, body, foot, extraHead) {
  var el = document.createElement('div'); el.className = 'tal-fb'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
  el.innerHTML = '<div class="tal-fbh"><button type="button" data-x aria-label="Back"><span class="ms">arrow_back</span></button>' +
    '<h2>' + title + (sub ? '<small>' + sub + '</small>' : '') + (extraHead || '') + '</h2>' +
    '<button type="button" data-x aria-label="Close"><span class="ms">close</span></button></div>' +
    '<div class="tal-fbb"><div class="tal-wrap">' + body + '</div></div><div class="tal-fbf">' + (foot || '') + '</div>';
  el.querySelectorAll('[data-x]').forEach(function (b) { b.onclick = function () { close(el); }; });
  document.body.appendChild(el);
  document.body.style.overflow = 'hidden';
  return el;
}
function close(el) { if (el && el.parentNode) el.parentNode.removeChild(el); if (!document.querySelector('.tal-fb,.tal-player')) document.body.style.overflow = ''; }
function setBody(el, html) { el.querySelector('.tal-wrap').innerHTML = html; }
function setFoot(el, html) { var f = el.querySelector('.tal-fbf'); if (f) f.innerHTML = html; }
function confirmScreen(title, text, yes, onYes, danger) {
  var el = screen(title, '', '<p class="tal-p" style="font-size:15px;color:var(--ffp-text)">' + text + '</p><div data-err></div>',
    '<button class="btn btn-sec" data-no>Cancel</button><button class="btn ' + (danger ? 'btn-sec' : 'btn-pri') + '" data-yes' + (danger ? ' style="background:#d6353b;color:#fff;border-color:#d6353b"' : '') + '>' + yes + '</button>');
  el.querySelector('[data-no]').onclick = function () { close(el); };
  el.querySelector('[data-yes]').onclick = async function () {
    this.disabled = true;
    try { await onYes(); close(el); } catch (e) { el.querySelector('[data-err]').innerHTML = '<div class="tal-err">' + esc(e.message) + '</div>'; this.disabled = false; }
  };
}

/* ════════════════════ PANEL ════════════════════ */
window.renderTalent = async function () {
  var root = document.getElementById('talent-root');
  if (!root || !pid()) return;
  root.innerHTML =
    '<div class="tal-top"><div><div class="ph">Talent</div><div class="psub">Book MCs, commentators, photographers and crew for your events. Every one is reviewed by FFP.</div></div>' +
    '<button class="btn btn-pri" data-post><span class="ms">add</span> Post a role</button></div>' +
    '<div class="biz-tabs"><button class="biz-tab' + (S.tab === 'roles' ? ' active' : '') + '" data-tab="roles">Roles</button>' +
    '<button class="biz-tab' + (S.tab === 'bookings' ? ' active' : '') + '" data-tab="bookings">Bookings and invoices</button></div>' +
    '<div data-body><div class="tal-empty">Loading…</div></div>';
  root.querySelector('[data-post]').onclick = function () { postRole(null); };
  root.querySelectorAll('[data-tab]').forEach(function (b) { b.onclick = function () { S.tab = b.getAttribute('data-tab'); window.renderTalent(); }; });
  try {
    await loadTax();
    var r = await Promise.all([rpc('provider_talent_requests', { p_provider: pid() }), rpc('provider_talent_bookings', { p_provider: pid() })]);
    S.roles = r[0] || []; S.bookings = (r[1] && r[1].bookings) || []; S.bank = (r[1] && r[1].bank) || {};
  } catch (e) {
    root.querySelector('[data-body]').innerHTML = '<div class="tal-err">' + esc(e.message) + '</div>'; return;
  }
  root.querySelector('[data-body]').innerHTML = S.tab === 'roles' ? rolesHtml() : bookingsHtml();
  root.querySelectorAll('[data-role]').forEach(function (b) { b.onclick = function () { openRole(b.getAttribute('data-role')); }; });
  root.querySelectorAll('[data-book]').forEach(function (b) { b.onclick = function () { openBooking(b.getAttribute('data-book')); }; });
  root.querySelectorAll('[data-post2]').forEach(function (b) { b.onclick = function () { postRole(null); }; });
};

function roleState(r) {
  var b = r.booking;
  if (b) {
    if (b.status === 'awaiting_deposit') return ['Pay the deposit to confirm ' + (b.name || 'your talent'), 'w', 'w'];
    if (b.status === 'completed') return ['Done: ' + (b.name || ''), 'd', ''];
    return ['Booked: ' + (b.name || ''), 'g', 'g'];
  }
  if (r.status === 'draft') return ['Draft, not posted yet', 'd', ''];
  if (Number(r.counters)) return [r.counters + (r.counters == 1 ? ' talent asked' : ' talent asked') + ' for a different fee. Answer now', 'w', 'w'];
  if (Number(r.offers_out)) return ['Offer sent, waiting on their reply', '', 'b'];
  var a = Number(r.applicants) || 0, i = Number(r.invited) || 0;
  if (a || i) return [a + ' applied' + (i ? ', ' + i + ' you asked' : ''), '', 'b'];
  if (r.status === 'filled' || r.status === 'closed') return ['Closed', 'd', ''];
  return ['Waiting for applicants. Find talent and ask them', 'd', 'b'];
}
function rolesHtml() {
  var now = Date.now();
  var up = S.roles.filter(function (r) { return new Date(r.ends_at).getTime() > now; });
  var past = S.roles.filter(function (r) { return new Date(r.ends_at).getTime() <= now; });
  var row = function (r) {
    var s = roleState(r);
    return '<button class="tal-rw" data-role="' + r.id + '"><div class="tal-dt"><b>' + dd(r.starts_at) + '</b><i>' + mon(r.starts_at) + '</i></div><i class="tal-sp ' + s[2] + '"></i>' +
      '<div class="tal-g"><b>' + esc(skillLabel(r.skill)) + '</b><span>' + esc([r.title, r.venue || r.city].filter(Boolean).join(', ')) + '</span><em class="' + s[1] + '">' + esc(s[0]) + '</em></div>' +
      '<div class="tal-amt">' + aed(r.booking ? r.booking.client_total_aed : r.fee_aed) + '<small>' + hours(r.starts_at, r.ends_at) + ' hours</small></div><span class="ms tal-cv">chevron_right</span></button>';
  };
  var how = '<div class="tal-how"><div><span class="ms">campaign</span><b>Post the role</b><span>Pick the skill, the day and your budget. Matching talent see it straight away.</span></div>' +
    '<div><span class="ms">play_circle</span><b>Watch their reels</b><span>Everyone who applies has a showreel FFP has checked. Ask anyone else to apply.</span></div>' +
    '<div><span class="ms">account_balance</span><b>Pay the deposit</b><span>Pay FFP by bank transfer. The deposit landing confirms your booking.</span></div></div>';
  if (!S.roles.length) return '<div class="tal-empty"><b>No roles yet</b>Post your first role and FFP talent who match it can apply.</div>' +
    '<button class="btn btn-pri" data-post2><span class="ms">add</span> Post a role</button>' + how;
  return (up.length ? '<div class="tal-lbl">Coming up</div><div class="tal-rows">' + up.map(row).join('') + '</div>' : '<div class="tal-empty"><b>Nothing coming up</b>Post a role for your next event.</div>') +
    (past.length ? '<div class="tal-lbl">Past</div><div class="tal-rows">' + past.reverse().map(row).join('') + '</div>' : '') + how;
}
function bookingState(b) {
  var inv = b.invoices || [];
  var dep = inv.find(function (i) { return i.kind === 'deposit'; }), bal = inv.find(function (i) { return i.kind === 'balance'; });
  if (b.status === 'completed') return [b.reviewed ? 'Done and rated' : 'Done. Rate ' + (b.name || 'them'), b.reviewed ? 'd' : 'w', b.reviewed ? '' : 'w'];
  if (dep && dep.status === 'issued') return ['Deposit ' + aed(dep.amount_aed) + ' due ' + dayLine(dep.due_on), 'w', 'w'];
  if (bal && bal.status === 'issued' && new Date(b.ends_at) < new Date()) return ['Balance ' + aed(bal.amount_aed) + ' due', 'w', 'w'];
  if (new Date(b.ends_at) < new Date() && !b.reviewed) return ['Rate ' + (b.name || 'them'), 'w', 'w'];
  return ['Booked. Balance ' + aed(bal ? bal.amount_aed : 0) + ' due ' + (bal ? dayLine(bal.due_on) : ''), 'g', 'g'];
}
function bookingsHtml() {
  if (!S.bookings.length) return '<div class="tal-empty"><b>No bookings yet</b>When a talent accepts your offer, the booking and its invoices appear here.</div>';
  return '<div class="tal-rows" style="margin-top:20px">' + S.bookings.map(function (b) {
    var s = bookingState(b);
    return '<button class="tal-rw" data-book="' + b.id + '"><div class="tal-dt"><b>' + dd(b.starts_at) + '</b><i>' + mon(b.starts_at) + '</i></div><i class="tal-sp ' + s[2] + '"></i>' +
      '<div class="tal-g"><b>' + esc(skillLabel(b.skill)) + ', ' + esc(b.name || '') + '</b><span>' + esc([b.title, b.venue || b.city].filter(Boolean).join(', ')) + '</span><em class="' + s[1] + '">' + esc(s[0]) + '</em></div>' +
      '<div class="tal-amt">' + aed(b.total_aed) + '<small>Total</small></div><span class="ms tal-cv">chevron_right</span></button>';
  }).join('') + '</div>';
}

/* ════════════════════ POST A ROLE ════════════════════ */
function postRole(existing) {
  var r = existing || {};
  var f = {
    id: r.id || null, skill: r.skill || '', title: r.title || '', date: dubaiDate(r.starts_at), start: dubaiTime(r.starts_at), end: dubaiTime(r.ends_at),
    venue: r.venue || '', city: r.city || 'Dubai', tier: r.min_tier || 0, fee: r.fee_aed ? String(r.fee_aed) : '', brief: r.brief || '',
    tasks: (r.tasks || []).join('\n'), sports: ((r.needs || []).filter(function (n) { return String(n.key || '').indexOf('activity:') === 0; }).map(function (n) { return n.key.slice(9); })),
    question: r.question || '', closes: dubaiDate(r.closes_at), q: '', bands: []
  };
  var step = 1;
  var el = screen(existing ? 'Edit role' : 'Post a role', 'Step 1 of 4', '', '', '<div class="tal-steps" data-steps></div>');
  async function loadBands() {
    if (!f.skill) { f.bands = []; return; }
    var b = await db().from('talent_bands').select('tier,min_aed,max_aed,city').eq('skill', f.skill).eq('city', 'Dubai').order('tier');
    f.bands = b.data || [];
  }
  function band(t) { return f.bands.find(function (b) { return b.tier === t; }); }
  function bandLine(b) { return !b ? '' : !b.max_aed ? aed(b.min_aed) + ' and up' : !Number(b.min_aed) ? 'Up to ' + aed(b.max_aed) : aed(b.min_aed) + ' to ' + Number(b.max_aed).toLocaleString('en-US'); }
  function feeErr() {
    var b = band(f.tier), v = Number(f.fee);
    if (!f.fee) return '';
    if (!(v > 0)) return 'Enter the fee in dirhams.';
    if (b && v < Number(b.min_aed)) return TIERS[f.tier] + ' starts at ' + aed(b.min_aed) + ' a day. Lower the band or raise the fee.';
    return '';
  }
  function draw(err) {
    el.querySelector('[data-steps]').innerHTML = [1, 2, 3, 4].map(function (i) { return '<i class="' + (i <= step ? 'on' : '') + '"></i>'; }).join('');
    el.querySelector('.tal-fbh small').textContent = 'Step ' + step + ' of 4';
    var h = '';
    if (step === 1) {
      h = '<div class="tal-h3">Who do you need?</div><div class="tal-p">One role per post. Post again for a second person.</div><div style="margin-top:14px">' +
        S.skills.map(function (s) { return '<button class="tal-pick' + (f.skill === s.value ? ' on' : '') + '" data-skill="' + esc(s.value) + '"><span>' + esc(s.label) + '</span><span class="tal-bx">' + (f.skill === s.value ? '<span class="ms">check</span>' : '') + '</span></button>'; }).join('') + '</div>';
    }
    if (step === 2) {
      h = '<div class="tal-h3">When and where?</div><div class="tal-p">The times they need to be there, on site.</div>' +
        '<div class="tal-fld"><label for="tal-title">Event name</label><input id="tal-title" class="tal-in" data-f="title" value="' + esc(f.title) + '" placeholder="e.g. PAF Fall league finals"></div>' +
        '<div class="tal-three"><div class="tal-fld"><label for="tal-date">Date</label><input id="tal-date" type="date" class="tal-in" data-f="date" value="' + esc(f.date) + '"></div>' +
        '<div class="tal-fld"><label for="tal-start">Start</label><input id="tal-start" type="time" class="tal-in" data-f="start" value="' + esc(f.start) + '"></div>' +
        '<div class="tal-fld"><label for="tal-end">Finish</label><input id="tal-end" type="time" class="tal-in" data-f="end" value="' + esc(f.end) + '"></div></div>' +
        '<div class="tal-two"><div class="tal-fld"><label for="tal-venue">Venue</label><input id="tal-venue" class="tal-in" data-f="venue" value="' + esc(f.venue) + '" placeholder="e.g. Dubai Sports City, Pitch 3"></div>' +
        '<div class="tal-fld"><label for="tal-city">City</label><input id="tal-city" class="tal-in" data-f="city" list="tal-cities" value="' + esc(f.city) + '"><datalist id="tal-cities">' +
        S.cities.slice(0, 600).map(function (c) { return '<option value="' + esc(c.label) + '">'; }).join('') + '</datalist></div></div>';
    }
    if (step === 3) {
      h = '<div class="tal-h3">What\'s your budget?</div><div class="tal-p">Pick a band. Only talent FFP placed in that band or above will see the role.</div><div class="tal-bands">' +
        [1, 2, 3, 4].map(function (t) { var b = band(t); return '<button class="tal-band' + (f.tier === t ? ' on' : '') + '" data-tier="' + t + '"><b>' + TIERS[t] + '</b><u>' + bandLine(b) + '</u><span>' + TIER_NOTE[t] + '</span></button>'; }).join('') + '</div>' +
        '<div class="tal-fld" style="max-width:420px"><label for="tal-fee">Your fee for the role, AED</label><input id="tal-fee" class="tal-in' + (feeErr() ? ' bad' : '') + '" inputmode="numeric" data-f="fee" value="' + esc(f.fee) + '">' +
        '<div class="tal-hint' + (feeErr() ? ' bad' : '') + '" data-feehint>' + (feeErr() || (f.tier ? TIERS[f.tier] + ' band: ' + bandLine(band(f.tier)) + ' a day' : 'Pick a band first')) + '</div></div>';
    }
    if (step === 4) {
      var s = f.q.trim().toLowerCase();
      var hits = S.acts.filter(function (a) { return f.sports.indexOf(a.value) < 0 && (!s || a.label.toLowerCase().indexOf(s) >= 0); }).slice(0, s ? 30 : 8);
      h = '<div class="tal-h3">The brief</div><div class="tal-p">Say what the day is and what they\'ll do. Talent see this before they apply.</div>' +
        '<div class="tal-fld"><label for="tal-brief">What\'s the event?</label><textarea id="tal-brief" class="tal-in" data-f="brief" placeholder="e.g. Finals night for 2,000 fans, four teams, live on YouTube.">' + esc(f.brief) + '</textarea></div>' +
        '<div class="tal-fld"><label for="tal-tasks">What they\'ll do, one per line</label><textarea id="tal-tasks" class="tal-in" data-f="tasks" placeholder="Walk-on intros for 4 teams&#10;Two half-time giveaways&#10;Trophy presentation">' + esc(f.tasks) + '</textarea></div>' +
        '<div class="tal-fld"><label>Sports they must know</label>' +
        f.sports.map(function (v) { return '<button class="tal-pick on" data-sport="' + esc(v) + '"><span>' + esc(actLabel(v)) + '</span><span class="tal-bx"><span class="ms">check</span></span></button>'; }).join('') +
        '<input class="tal-in" data-q placeholder="Search ' + S.acts.length + ' sports and activities" value="' + esc(f.q) + '" style="margin-top:10px">' +
        hits.map(function (a) { return '<button class="tal-pick" data-sport="' + esc(a.value) + '"><span>' + esc(a.label) + '</span><span class="tal-bx"></span></button>'; }).join('') + '</div>' +
        '<div class="tal-two"><div class="tal-fld"><label for="tal-qn">One question for applicants (optional)</label><input id="tal-qn" class="tal-in" data-f="question" value="' + esc(f.question) + '" placeholder="e.g. Have you hosted American football before?"></div>' +
        '<div class="tal-fld"><label for="tal-closes">Applications close</label><input id="tal-closes" type="date" class="tal-in" data-f="closes" value="' + esc(f.closes) + '"></div></div>';
    }
    setBody(el, h + (err ? '<div class="tal-err">' + esc(err) + '</div>' : ''));
    setFoot(el, (step > 1 ? '<button class="btn btn-sec tal-left" data-back>Back</button>' : '<span class="tal-left"></span>') +
      (step === 4 && !existing ? '<button class="btn btn-sec" data-draft>Save as draft</button>' : '') +
      '<button class="btn btn-pri" data-next>' + (step < 4 ? 'Next' : existing ? 'Save changes' : 'Post the role') + '</button>');
    // wire
    el.querySelectorAll('[data-skill]').forEach(function (b) { b.onclick = async function () { f.skill = b.getAttribute('data-skill'); await loadBands(); draw(); }; });
    el.querySelectorAll('[data-tier]').forEach(function (b) { b.onclick = function () { f.tier = Number(b.getAttribute('data-tier')); var bb = band(f.tier); if (!f.fee && bb) f.fee = String(bb.min_aed || bb.max_aed || ''); draw(); }; });
    el.querySelectorAll('[data-f]').forEach(function (i) {
      i.oninput = function () {
        var k = i.getAttribute('data-f'); f[k] = k === 'fee' ? i.value.replace(/[^0-9]/g, '') : i.value;
        if (k === 'fee') { i.value = f.fee; var e = feeErr(); var hint = el.querySelector('[data-feehint]'); i.classList.toggle('bad', !!e); hint.classList.toggle('bad', !!e); hint.textContent = e || (f.tier ? TIERS[f.tier] + ' band: ' + bandLine(band(f.tier)) + ' a day' : 'Pick a band first'); }
      };
    });
    var qi = el.querySelector('[data-q]'); if (qi) qi.oninput = function () { f.q = qi.value; var pos = qi.selectionStart; draw(); var n = el.querySelector('[data-q]'); n.focus(); try { n.setSelectionRange(pos, pos); } catch (e) {} };
    el.querySelectorAll('[data-sport]').forEach(function (b) { b.onclick = function () { var v = b.getAttribute('data-sport'); var i = f.sports.indexOf(v); if (i >= 0) f.sports.splice(i, 1); else { f.sports.push(v); f.q = ''; } draw(); }; });
    var bk = el.querySelector('[data-back]'); if (bk) bk.onclick = function () { step--; draw(); };
    el.querySelector('[data-next]').onclick = function () { next(false); };
    var dr = el.querySelector('[data-draft]'); if (dr) dr.onclick = function () { next(true); };
  }
  async function next(draft) {
    if (step === 1 && !f.skill) return draw('Pick who you need.');
    if (step === 2) {
      if (!f.date || !f.start || !f.end) return draw('Add the date, start and finish.');
      var a = new Date(dubaiIso(f.date, f.start)), b = new Date(dubaiIso(f.date, f.end));
      if (b <= a) b = new Date(b.getTime() + 86400000);   // finishes after midnight
      if (a < new Date()) return draw('That time has already passed.');
      if (!f.venue.trim() && !f.city.trim()) return draw('Add the venue or the city.');
    }
    if (step === 3) { if (!f.tier) return draw('Pick a budget band.'); if (!f.fee || feeErr()) return draw(feeErr() || 'Enter your fee.'); }
    if (step < 4) { step++; return draw(); }
    if (!f.brief.trim()) return draw('Say what the event is.');
    var s = new Date(dubaiIso(f.date, f.start)), e = new Date(dubaiIso(f.date, f.end)); if (e <= s) e = new Date(e.getTime() + 86400000);
    var payload = {
      id: f.id, provider_id: pid(), skill: f.skill, title: f.title.trim(), brief: f.brief.trim(),
      tasks: f.tasks.split('\n').map(function (x) { return x.trim(); }).filter(Boolean),
      needs: f.sports.map(function (v) { return { key: 'activity:' + v, label: 'Knows ' + actLabel(v).toLowerCase() }; }),
      question: f.question.trim(), starts_at: s.toISOString(), ends_at: e.toISOString(), venue: f.venue.trim(), city: f.city.trim(),
      fee_aed: Number(f.fee), min_tier: f.tier, closes_at: f.closes ? new Date(f.closes + 'T23:59:00+04:00').toISOString() : null,
      status: draft ? 'draft' : 'open'
    };
    // FFP admin running the role for this partner (admin.findfitpeople.com → Talent roles): the client pays FFP's markup
    if (window.FFP_TALENT_ADMIN && !existing) payload.handled_by_ffp = true;
    var btn = el.querySelector('[data-next]'); btn.disabled = true;
    try {
      var r = await rpc('provider_talent_request_save', { p: payload });
      if (!r || !r.ok) {
        var m = { below_band: 'The fee is below the band. The band starts at ' + aed(r && r.min) + '.', past: 'That time has already passed.', times: 'Check the start and finish.', booked: 'This role is booked, so it can no longer be changed.', skill: 'Pick who you need.' };
        btn.disabled = false; return draw(m[r && r.error] || 'That did not save. Try again.');
      }
      close(el); toast(draft ? 'Saved as a draft' : existing ? 'Saved' : 'Role posted. Matching talent can see it now.');
      S.tab = 'roles'; window.renderTalent();
      if (!draft && !existing) openRole(r.id);
    } catch (err) { btn.disabled = false; draw(err.message); }
  }
  (async function () { await loadTax(); await loadBands(); draw(); })();
}

/* ════════════════════ A ROLE ════════════════════ */
async function openRole(id, tab) {
  var el = screen('Loading…', '', '<div class="tal-empty">Loading…</div>', '');
  var state = { tab: tab || 'applied', q: '', found: null };
  var data;
  async function load() { data = await rpc('provider_talent_applicants', { p_request: id }); }
  function needsLine(card) {
    var acts = (data.request.needs || []).filter(function (n) { return String(n.key || '').indexOf('activity:') === 0; }).map(function (n) { return n.key.slice(9); });
    return acts.map(function (a) { var lv = (card.activity_levels || {})[a]; return 'knows ' + actLabel(a).toLowerCase() + ': ' + (lv ? LEVEL[lv] : ((card.activities || []).indexOf(a) >= 0 ? 'yes' : 'not listed')); }).join(', ');
  }
  function stats(c) {
    var p = [];
    if (c.rating) p.push(c.rating + ' from ' + c.reviews + (c.reviews == 1 ? ' review' : ' reviews')); else p.push('New on FFP');
    if (Number(c.events)) p.push(c.events + ' events');
    if ((c.credits || []).length) p.push(c.credits.length + ' credits');
    var n = needsLine(c); if (n) p.push(n);
    return p.join(', ');
  }
  function reelBox(c) {
    if (c.reel) return '<button class="tal-reel" data-reel="' + esc(c.reel) + '" data-name="' + esc(c.name || '') + '"><video src="' + esc(c.reel) + '#t=1" preload="metadata" muted playsinline></video><span class="ms">play_circle</span><i>REEL' + (c.reel_seconds ? ' ' + Math.floor(c.reel_seconds / 60) + ':' + String(c.reel_seconds % 60).padStart(2, '0') : '') + '</i></button>';
    if ((c.photos || []).length) return '<button class="tal-reel" data-photos="' + esc(JSON.stringify(c.photos)) + '" data-name="' + esc(c.name || '') + '"><img src="' + esc(c.photos[0]) + '" alt=""><span class="ms">photo_library</span><i>' + c.photos.length + ' PHOTOS</i></button>';
    if (c.link) return '<a class="tal-noreel" href="' + esc(c.link) + '" target="_blank" rel="noopener"><span class="ms">open_in_new</span>&nbsp;Their work</a>';
    return '<div class="tal-noreel">No reel yet</div>';
  }
  function person(p, mode) {
    var c = p.card || {}, booked = !!(data.request.status === 'filled');
    var acts = '', extra = '', stateLine = '';
    if (mode === 'find') {
      acts = '<button class="btn btn-pri" data-invite="' + c.member_id + '"><span class="ms">person_add</span> Ask to apply</button>';
    } else {
      if (p.offer_status === 'pending') stateLine = 'Offer sent: ' + aed(p.offer_fee) + ', reply by ' + dayLine(p.reply_by) + ' ' + clock(p.reply_by);
      else if (p.offer_status === 'accepted') stateLine = 'Accepted your offer of ' + aed(p.offer_fee);
      else if (p.offer_status === 'declined') stateLine = 'Declined';
      else if (p.offer_status === 'expired') stateLine = 'Your offer ran out of time';
      else if (p.invited && !p.applied) stateLine = 'You asked them to apply';
      if (p.offer_status === 'countered') extra = '<div class="tal-ask"><b>Asked for ' + aed(p.counter_fee) + (p.counter_note ? '<span>"' + esc(p.counter_note) + '"</span>' : '') + '</b>' +
        '<button class="btn btn-sec" data-counter="decline" data-offer="' + p.offer_id + '">Decline</button><button class="btn btn-pri" data-counter="accept" data-offer="' + p.offer_id + '" data-fee="' + p.counter_fee + '" data-name="' + esc(c.name || '') + '">Accept ' + aed(p.counter_fee) + '</button></div>';
      var canOffer = !booked && data.request.status !== 'cancelled' && ['pending', 'accepted', 'countered'].indexOf(p.offer_status) < 0;
      acts = (canOffer ? '<button class="btn btn-pri" data-offer-to="' + c.member_id + '" data-name="' + esc(c.name || '') + '"><span class="ms">send</span> ' + (p.offer_status ? 'New offer' : 'Make offer') + '</button>' : '') +
        '<button class="btn btn-sec" data-msg="' + c.member_id + '"><span class="ms">chat</span> Message</button>';
    }
    return '<div class="tal-ap"><i class="tal-ph" style="background-image:url(\'' + esc(c.photo || '') + '\')"></i>' +
      '<div class="tal-who"><b>' + esc(c.name || 'Talent') + '</b><span class="tier">' + (TIERS[c.tier] || '') + '</span><div class="st">' + esc(stats(c)) + '</div>' +
      (p.answer ? '<q>"' + esc(p.answer) + '"</q>' : '') + (stateLine ? '<div class="state">' + esc(stateLine) + '</div>' : '') + '</div>' +
      reelBox(c) + '<div class="tal-act">' + acts + '</div>' + extra + '</div>';
  }
  function draw(err) {
    var r = data.request, people = data.people || [];
    var applied = people.filter(function (p) { return p.applied; }), asked = people.filter(function (p) { return p.invited && !p.applied; });
    el.querySelector('.tal-fbh h2').innerHTML = esc(skillLabel(r.skill)) + '<small>' + esc([r.title, dayLine(r.starts_at) + ', ' + clock(r.starts_at) + ' to ' + clock(r.ends_at), r.venue || r.city].filter(Boolean).join(', ')) + '</small>';
    var h = '<div class="tal-sum"><div><b>' + aed(r.fee_aed) + '</b><span>Your fee</span></div><div><b>' + TIERS[r.min_tier] + '</b><span>Budget band</span></div>' +
      '<div><b>' + applied.length + '</b><span>Applied</span></div><div><b>' + (r.closes_at ? dayLine(r.closes_at) : 'Open') + '</b><span>Applications close</span></div>' +
      (r.status === 'draft' ? '<div><b>Draft</b><span>Not posted yet</span></div>' : '') + '</div>' +
      '<div class="biz-tabs" style="margin-top:6px"><button class="biz-tab' + (state.tab === 'applied' ? ' active' : '') + '" data-t="applied">Applied ' + applied.length + '</button>' +
      '<button class="biz-tab' + (state.tab === 'asked' ? ' active' : '') + '" data-t="asked">You asked ' + asked.length + '</button>' +
      (r.status === 'open' ? '<button class="biz-tab' + (state.tab === 'find' ? ' active' : '') + '" data-t="find">Find talent</button>' : '') + '</div>';
    if (state.tab === 'applied') h += applied.length ? applied.map(function (p) { return person(p); }).join('') : '<div class="tal-empty"><b>No one has applied yet</b>Matching talent were told when you posted. Use Find talent to ask people directly.</div>';
    if (state.tab === 'asked') h += asked.length ? asked.map(function (p) { return person(p); }).join('') : '<div class="tal-empty"><b>You haven\'t asked anyone yet</b>Use Find talent to ask the people you want.</div>';
    if (state.tab === 'find') {
      h += '<div class="tal-fld" style="max-width:420px"><input class="tal-in" data-findq placeholder="Search by name" value="' + esc(state.q) + '"></div>';
      h += state.found === null ? '<div class="tal-empty">Loading…</div>' : state.found.length ? state.found.map(function (c) { return person({ card: c }, 'find'); }).join('') :
        '<div class="tal-empty"><b>No one else free that day</b>Everyone live in this band who is free on ' + dayLine(r.starts_at) + ' has applied or been asked.</div>';
    }
    setBody(el, h + (err ? '<div class="tal-err">' + esc(err) + '</div>' : ''));
    setFoot(el, (r.status !== 'filled' ? '<button class="btn btn-sec tal-left" data-cancel>Cancel role</button>' : '<span class="tal-left"></span>') +
      (r.status !== 'filled' ? '<button class="btn btn-sec" data-edit>Edit</button>' : '') +
      (r.status === 'draft' ? '<button class="btn btn-pri" data-publish>Post the role</button>' : ''));
    wire();
  }
  function wire() {
    el.querySelectorAll('[data-t]').forEach(function (b) { b.onclick = async function () { state.tab = b.getAttribute('data-t'); draw(); if (state.tab === 'find' && state.found === null) find(); }; });
    var fq = el.querySelector('[data-findq]'); if (fq) { var t; fq.oninput = function () { state.q = fq.value; clearTimeout(t); t = setTimeout(function () { find(true); }, 350); }; }
    el.querySelectorAll('[data-reel]').forEach(function (b) { b.onclick = function () { player(b.getAttribute('data-reel'), b.getAttribute('data-name')); }; });
    el.querySelectorAll('[data-photos]').forEach(function (b) { b.onclick = function () { photos(JSON.parse(b.getAttribute('data-photos')), b.getAttribute('data-name')); }; });
    el.querySelectorAll('[data-invite]').forEach(function (b) { b.onclick = async function () {
      b.disabled = true;
      try { var r = await rpc('provider_talent_invite', { p_request: id, p_member: b.getAttribute('data-invite') }); if (!r.ok) throw new Error('They could not be asked: ' + r.error);
        toast('Asked. They have been told.'); await load(); state.found = state.found.filter(function (c) { return c.member_id !== b.getAttribute('data-invite'); }); draw(); }
      catch (e) { b.disabled = false; draw(e.message); } }; });
    el.querySelectorAll('[data-offer-to]').forEach(function (b) { b.onclick = function () { makeOffer(data.request, b.getAttribute('data-offer-to'), b.getAttribute('data-name'), async function () { await load(); draw(); window.renderTalent(); }); }; });
    el.querySelectorAll('[data-msg]').forEach(function (b) { b.onclick = function () { message(id, b.getAttribute('data-msg')); }; });
    el.querySelectorAll('[data-counter]').forEach(function (b) { b.onclick = function () {
      var acc = b.getAttribute('data-counter') === 'accept';
      confirmScreen(acc ? 'Accept ' + aed(b.getAttribute('data-fee')) + '?' : 'Decline their fee?',
        acc ? 'This books <b>' + esc(b.getAttribute('data-name')) + '</b> at ' + aed(b.getAttribute('data-fee')) + '. FFP sends you the deposit invoice straight away, and they are booked once it is paid.'
            : 'They are told you kept your offer closed. You can make a new offer later.',
        acc ? 'Accept and book' : 'Decline',
        async function () { var r = await rpc('provider_talent_counter', { p_offer: b.getAttribute('data-offer'), p_action: acc ? 'accept' : 'decline' });
          if (!r.ok) throw new Error(r.error === 'booked' ? 'This role is already booked.' : 'That did not go through.');
          toast(acc ? 'Booked. Your deposit invoice is ready.' : 'Declined'); close(el); window.renderTalent(); if (acc && r.booking) openBooking(r.booking); });
    }; });
    var c = el.querySelector('[data-cancel]'); if (c) c.onclick = function () {
      confirmScreen('Cancel this role?', 'Anyone who applied or has an offer is told it is off. This cannot be undone.', 'Cancel role', async function () {
        var r = await rpc('provider_talent_request_cancel', { p_request: id }); if (!r.ok) throw new Error(r.error === 'booked' ? 'This role is booked. Message FFP to cancel a booking.' : 'That did not go through.');
        toast('Role cancelled'); close(el); window.renderTalent(); }, true); };
    var ed = el.querySelector('[data-edit]'); if (ed) ed.onclick = function () { close(el); postRole(data.request); };
    var pb = el.querySelector('[data-publish]'); if (pb) pb.onclick = async function () {
      pb.disabled = true; var r = data.request;
      try { var res = await rpc('provider_talent_request_save', { p: Object.assign({}, r, { provider_id: pid(), status: 'open' }) });
        if (!res.ok) throw new Error(res.error === 'past' ? 'That time has passed. Edit the date first.' : res.error === 'below_band' ? 'The fee is below the band. Edit it first.' : 'That did not go through.');
        toast('Role posted'); await load(); draw(); window.renderTalent(); } catch (e) { pb.disabled = false; draw(e.message); } };
  }
  async function find(force) {
    try { state.found = await rpc('provider_talent_search', { p_request: id, p_q: state.q || null }) || []; } catch (e) { state.found = []; }
    if (state.tab === 'find') { var fq = document.activeElement && document.activeElement.hasAttribute && document.activeElement.hasAttribute('data-findq'); draw(); if (fq || force) { var n = el.querySelector('[data-findq]'); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } } }
  }
  try { await load(); draw(); if (state.tab === 'find') find(); }
  catch (e) { el.querySelector('.tal-fbh h2').textContent = 'Role'; setBody(el, '<div class="tal-err">' + esc(e.message) + '</div>'); }
}

function player(src, name) {
  var el = document.createElement('div'); el.className = 'tal-player';
  el.innerHTML = '<div class="tal-fbh"><button type="button" data-x aria-label="Back"><span class="ms">arrow_back</span></button><h2>' + esc(name || 'Reel') + '</h2>' +
    '<button type="button" data-x aria-label="Close"><span class="ms">close</span></button></div><video src="' + esc(src) + '" controls autoplay playsinline></video>';
  el.querySelectorAll('[data-x]').forEach(function (b) { b.onclick = function () { el.remove(); if (!document.querySelector('.tal-fb')) document.body.style.overflow = ''; }; });
  document.body.appendChild(el);
}
function photos(list, name) {
  screen(esc(name || 'Photos'), list.length + ' photos', '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:6px">' +
    list.map(function (u) { return '<a href="' + esc(u) + '" target="_blank" rel="noopener"><img src="' + esc(u) + '" alt="" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:6px;display:block"></a>'; }).join('') + '</div>', '');
}
async function message(requestId, memberId) {
  try {
    var r = await rpc('talent_conversation', { p_request: requestId, p_member: memberId });
    if (!r || !r.conversation_id) throw new Error('The chat could not be opened.');
    window.open('https://app.findfitpeople.com/passport/messages?c=' + r.conversation_id, '_blank', 'noopener');
  } catch (e) { toast(e.message, 'error'); }
}

/* ── make an offer ── */
function makeOffer(req, memberId, name, done) {
  var f = { fee: String(req.fee_aed), within: 48 };
  var el = screen('Offer to ' + esc(name || 'talent'), esc(skillLabel(req.skill) + ', ' + (req.title || dayLine(req.starts_at))), '', '');
  function draw(err) {
    var fee = Number(f.fee) || 0, dep = Math.round(fee * (req.deposit_pct || 30) / 100);
    setBody(el, '<div class="tal-fld" style="max-width:420px;margin-top:0"><label for="tal-ofee">Fee, AED</label><input id="tal-ofee" class="tal-in" inputmode="numeric" value="' + esc(f.fee) + '"></div>' +
      '<div class="tal-fld"><label>They have to reply within</label><div class="tal-seg">' + [24, 48, 72].map(function (h) { return '<button class="' + (f.within === h ? 'on' : '') + '" data-w="' + h + '">' + h + ' hours</button>'; }).join('') + '</div></div>' +
      '<div class="tal-ref" style="max-width:640px">If they accept, FFP invoices you <b>' + aed(dep) + '</b> as the deposit, due within a few days, and <b>' + aed(fee - dep) + '</b> on the day. They are booked once the deposit lands.</div>' +
      (err ? '<div class="tal-err">' + esc(err) + '</div>' : ''));
    setFoot(el, '<button class="btn btn-sec" data-no>Cancel</button><button class="btn btn-pri" data-send><span class="ms">send</span> Send offer</button>');
    var fi = el.querySelector('#tal-ofee'); fi.oninput = function () { f.fee = fi.value.replace(/[^0-9]/g, ''); var p = fi.selectionStart; draw(); var n = el.querySelector('#tal-ofee'); n.focus(); try { n.setSelectionRange(p, p); } catch (e) {} };
    el.querySelectorAll('[data-w]').forEach(function (b) { b.onclick = function () { f.within = Number(b.getAttribute('data-w')); draw(); }; });
    el.querySelector('[data-no]').onclick = function () { close(el); };
    el.querySelector('[data-send]').onclick = async function () {
      if (!(Number(f.fee) > 0)) return draw('Enter the fee.');
      this.disabled = true;
      var by = new Date(Math.min(Date.now() + f.within * 3600000, new Date(req.starts_at).getTime()));
      try { await rpc('provider_talent_offer', { p_request: req.id, p_member: memberId, p_fee: Number(f.fee), p_reply_by: by.toISOString() });
        close(el); toast('Offer sent. They have been told.'); if (done) done(); }
      catch (e) { this.disabled = false; draw(/already booked/.test(e.message) ? 'This role is already booked.' : e.message); }
    };
  }
  draw();
}

/* ════════════════════ A BOOKING: invoices + rating ════════════════════ */
function openBooking(id) {
  var b = (S.bookings || []).find(function (x) { return x.id === id; });
  if (!b) { rpc('provider_talent_bookings', { p_provider: pid() }).then(function (r) { S.bookings = r.bookings || []; S.bank = r.bank || {}; var x = S.bookings.find(function (y) { return y.id === id; }); if (x) openBooking(id); }); return; }
  var inv = b.invoices || [];
  var over = new Date(b.ends_at) < new Date();
  var row = function (i) {
    var paid = i.status === 'paid';
    return '<div class="tal-invrow" data-inv="' + i.id + '"><span class="ms" style="font-size:24px;color:' + (paid ? 'var(--ffp-green)' : '#b36b00') + '">' + (paid ? 'check_circle' : 'receipt_long') + '</span>' +
      '<b>' + (i.kind === 'deposit' ? 'Deposit' : 'Balance') + ', ' + aed(i.amount_aed) + '<span>' + esc(i.number) + ', ' + (paid ? 'paid ' + dayLine(i.paid_at) : 'due ' + dayLine(i.due_on)) + '</span></b><span class="ms tal-cv">chevron_right</span></div>';
  };
  var el = screen(esc(skillLabel(b.skill)) + ', ' + esc(b.name || ''), esc([b.title, dayLine(b.starts_at) + ', ' + clock(b.starts_at) + ' to ' + clock(b.ends_at), b.venue || b.city].filter(Boolean).join(', ')),
    '<div class="tal-sum"><div><b>' + aed(b.total_aed) + '</b><span>Total</span></div><div><b>' + (b.status === 'awaiting_deposit' ? 'Waiting on deposit' : b.status === 'completed' ? 'Done' : 'Booked') + '</b><span>Status</span></div></div>' +
    '<div class="tal-lbl">Invoices</div>' + inv.map(row).join('') +
    (over ? '<div class="tal-lbl">How did they do?</div>' + (b.reviewed ? '<div class="tal-empty">You rated this booking. Thank you.</div>' : '<button class="btn btn-pri" data-rate style="margin-top:12px"><span class="ms">star</span> Rate ' + esc(b.name || 'them') + '</button>') : ''),
    '<button class="btn btn-sec" data-msg><span class="ms">chat</span> Message ' + esc((b.name || '').split(' ')[0] || 'them') + '</button>');
  el.querySelectorAll('[data-inv]').forEach(function (r) { r.onclick = function () { invoice(b, inv.find(function (i) { return i.id === r.getAttribute('data-inv'); })); }; });
  el.querySelector('[data-msg]').onclick = function () { message(b.request_id, b.member_id); };
  var rt = el.querySelector('[data-rate]'); if (rt) rt.onclick = function () { rate(b, function () { close(el); }); };
  var first = inv.find(function (i) { return i.status === 'issued'; });
  if (first && b.status === 'awaiting_deposit' && first.kind === 'deposit') invoice(b, first);
}
function invoice(b, i) {
  var k = S.bank || {}, paid = i.status === 'paid';
  var bal = (b.invoices || []).find(function (x) { return x.kind === 'balance'; });
  var bk = function (l, v) { return v ? '<div class="tal-bk"><span>' + l + '</span><b>' + esc(v) + '</b><button class="tal-copy" data-copy="' + esc(String(v).replace(/\s/g, '')) + '"><span class="ms">content_copy</span>Copy</button></div>' : ''; };
  var iban = String(k.iban || '').replace(/(.{4})/g, '$1 ').trim();
  var el = screen((i.kind === 'deposit' ? 'Deposit' : 'Balance') + ' invoice', esc(i.number + ', ' + skillLabel(b.skill) + ', ' + (b.title || '')),
    '<div class="tal-inv"><div><div class="tal-due' + (paid ? ' g' : '') + '">' + (paid ? 'Paid ' + dayLine(i.paid_at) : 'Due ' + dayLine(i.due_on)) + '</div>' +
    '<div class="tal-big"><small>AED</small>' + Number(i.amount_aed).toLocaleString('en-US') + '</div>' +
    '<div class="tal-for">' + (i.kind === 'deposit'
      ? 'Deposit to confirm <b>' + esc(b.name || '') + '</b> as your ' + esc(skillLabel(b.skill).toLowerCase()) + ' on ' + dayLine(b.starts_at) + '.' + (bal ? ' The ' + aed(bal.amount_aed) + ' balance is due on the day.' : '')
      : 'Balance for <b>' + esc(b.name || '') + '</b>, ' + esc(skillLabel(b.skill).toLowerCase()) + ' on ' + dayLine(b.starts_at) + '.') + '</div>' +
    (paid ? '<div class="tal-ref g">Received. Thank you.</div>'
      : '<div class="tal-ref">Use <b>' + esc(i.number) + '</b> as the payment reference.' + (i.kind === 'deposit' ? ' ' + esc((b.name || '').split(' ')[0] || 'They') + ' is booked as soon as FFP sees it land, and you are told.' : '') + '</div>') +
    '<div class="tal-for" style="margin-top:18px;font-size:12.5px">Find Fit People, invoice ' + esc(i.number) + ', issued to ' + esc(((document.getElementById('sb-foot-name') || {}).textContent || '').trim() || 'you') + '.</div></div>' +
    '<div><div class="tal-lbl" style="margin:0 0 10px">Pay by bank transfer to</div><div class="tal-bank">' +
    bk('Account name', k.account_name) + bk('Bank', k.bank_name) + bk('Account no.', k.account_number) + bk('IBAN', iban) + bk('SWIFT', k.swift) + bk('Reference', i.number) +
    '</div></div></div>',
    '<button class="btn btn-sec" data-print><span class="ms">print</span> Print invoice</button>');
  el.querySelectorAll('[data-copy]').forEach(function (c) { c.onclick = function () {
    var v = c.getAttribute('data-copy');
    (navigator.clipboard ? navigator.clipboard.writeText(v) : Promise.reject()).then(function () { toast('Copied'); }, function () { toast(v, 'info'); }); }; });
  el.querySelector('[data-print]').onclick = function () { window.print(); };
}
function rate(b, done) {
  var f = { stars: 0, body: '' };
  var el = screen('Rate ' + esc(b.name || 'them'), esc(skillLabel(b.skill) + ', ' + (b.title || '')), '', '');
  function draw(err) {
    setBody(el, '<div class="tal-h3">How did they do?</div><div class="tal-stars">' + [1, 2, 3, 4, 5].map(function (n) { return '<button class="' + (n <= f.stars ? 'on' : '') + '" data-s="' + n + '" aria-label="' + n + ' stars"><span class="ms">star</span></button>'; }).join('') + '</div>' +
      '<div class="tal-fld" style="max-width:640px"><label for="tal-rv">A line other organisers will see (optional)</label><textarea id="tal-rv" class="tal-in">' + esc(f.body) + '</textarea></div>' +
      (err ? '<div class="tal-err">' + esc(err) + '</div>' : ''));
    setFoot(el, '<button class="btn btn-sec" data-no>Cancel</button><button class="btn btn-pri" data-save>Save rating</button>');
    el.querySelectorAll('[data-s]').forEach(function (s) { s.onclick = function () { f.body = el.querySelector('#tal-rv').value; f.stars = Number(s.getAttribute('data-s')); draw(); }; });
    el.querySelector('[data-no]').onclick = function () { close(el); };
    el.querySelector('[data-save]').onclick = async function () {
      f.body = el.querySelector('#tal-rv').value;
      if (!f.stars) return draw('Pick from 1 to 5 stars.');
      this.disabled = true;
      try { var r = await rpc('provider_talent_review', { p_booking: b.id, p_rating: f.stars, p_body: f.body.trim() || null });
        if (!r.ok) throw new Error(r.error === 'not_yet' ? 'You can rate them once the event is over.' : 'That did not save.');
        close(el); toast('Saved'); if (done) done(); window.renderTalent(); }
      catch (e) { this.disabled = false; draw(e.message); }
    };
  }
  draw();
}

/* opened from a notification link (…/#talent) */
if (document.getElementById('panel-talent') && document.getElementById('panel-talent').classList.contains('active')) window.renderTalent();
})();
