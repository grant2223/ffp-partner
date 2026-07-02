/* ═══════════════════════════════════════════════════════════════
   FFP PROVIDER CHECK-IN CONSOLE LOADER · v4
   File path: ffp-provider-quests-loader.js (repo root)
   On-load log: [FFP Provider Check-ins v4] Loaded ✓

   v4: the three queues now live in their OWN panels (Grant's restructure) —
       Quest check-ins → #panel-quests (#ffp-q-quests),
       Challenge results → #panel-challenges (#ffp-q-challenges, above #ch-tabs),
       Event check-ins → #panel-checkins (#ffp-q-events, above Recent check-ins).
       One data load (load()), three rendered cards. Was: all three in #panel-checkins.

   Injects (v3 history) three cards:
     • Quest check-ins   — pending members who submitted a quest step → Approve / Decline
                           (provider_quest_approve stamps the step; on completion awards the
                            quest stamp + marks quest_progress completed).
     • Challenge results — pending scorecard entries → Verify.
     • Event check-ins   — read-only attendance log for this venue's events.

   v3: REPLACED the old Express endpoints (/api/quests/... — never existed → 404s) with
       Supabase SECURITY DEFINER RPCs: provider_quest_checkins / provider_quest_approve /
       provider_quest_decline / provider_challenge_entries / provider_challenge_verify /
       provider_event_checkins. Rows now read the RPCs' flat JSON shape.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  function sb() { return window.supabase; }
  function toast(m, k) {
    if (typeof window.showToast === 'function') { try { window.showToast(m, k || 'info'); return; } catch (e) {} }
    console.log('[FFP Provider Check-ins]', m);
  }
  function esc(s) {
    if (typeof window.escHtml === 'function') return window.escHtml(s);
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function waitFor(check, ms) {
    return new Promise(function (resolve) {
      var t = 0, lim = Math.ceil((ms || 30000) / 150);
      var iv = setInterval(function () {
        if (check() || t++ >= lim) { clearInterval(iv); resolve(check()); }
      }, 150);
    });
  }
  function letterFor(name) { return String(name || 'Member').charAt(0).toUpperCase(); }
  function relTime(iso) {
    if (!iso) return '';
    var d = Date.now() - new Date(iso).getTime();
    var mn = Math.floor(d / 60000);
    if (mn < 1) return 'just now';
    if (mn < 60) return mn + 'm ago';
    var h = Math.floor(mn / 60);
    if (h < 24) return h + 'h ago';
    return Math.floor(h / 24) + 'd ago';
  }
  function avatarHtml(name, photo) {
    return photo
      ? '<div class="checkin-avatar" style="background:#ffffff url(' + esc(photo) + ') center/cover;"></div>'
      : '<div class="checkin-avatar">' + esc(letterFor(name)) + '</div>';
  }

  function providerId() { return window.FFP_PROVIDER && window.FFP_PROVIDER.id; }
  function approverId() { return (window.FFP_PROVIDER && (window.FFP_PROVIDER.member_id || window.FFP_PROVIDER.id)) || null; }

  function injectStyles() {
    if (document.getElementById('ffp-q-checkins-css')) return;
    var s = document.createElement('style');
    s.id = 'ffp-q-checkins-css';
    s.textContent = [
      '#ffp-q-checkins{margin-bottom:22px;}',
      '#ffp-q-checkins .qc-card{margin-bottom:18px;}',
      '#ffp-q-checkins .qc-head{display:flex;align-items:center;gap:8px;font-size:15px;font-weight:800;margin-bottom:4px;}',
      '#ffp-q-checkins .qc-head .ms{color:var(--ffp-yellow,#2b3942);}',
      '#ffp-q-checkins .qc-pill{font-size:11px;font-weight:800;background:rgba(25,128,173,0.18);color:var(--ffp-blue,#1980AD);border-radius:20px;padding:2px 9px;}',
      '#ffp-q-checkins .qc-sub{font-size:12px;color:var(--ffp-text-muted,#566069);margin-bottom:14px;}',
      '#ffp-q-checkins .qc-actions{display:flex;gap:8px;flex-shrink:0;}',
      '#ffp-q-checkins .qc-empty{font-size:13px;color:var(--ffp-text-muted,#566069);padding:10px 2px;}',
      '#ffp-q-checkins .qc-score{font-size:11px;font-weight:800;background:rgba(15,37,49,.14);color:var(--ffp-yellow,#2b3942);border-radius:8px;padding:3px 8px;flex-shrink:0;}',
      '#ffp-q-checkins .qc-badge{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.3px;color:#22c55e;flex-shrink:0;}',
      '#ffp-q-checkins .qc-visitors{display:flex;align-items:center;gap:8px;margin-top:14px;padding-top:14px;border-top:1px solid var(--ffp-border,rgba(25,128,173,0.10));font-size:12px;font-weight:700;color:var(--ffp-text-muted,#566069);}',
      '#ffp-q-checkins .qc-visitors b{color:var(--ffp-text,#0e2531);font-size:15px;}',
      '#ffp-q-checkins .qc-visitors .ms{color:var(--ffp-yellow,#2b3942);font-size:18px;}'
    ].join('');
    document.head.appendChild(s);
  }

  var qRows = [], qApproved = 0, cRows = [], eRows = [];

  // v4: each queue lives in its OWN panel — Quests → #panel-quests, Challenge results →
  // #panel-challenges, Event check-ins → #panel-checkins. One data load, three cards.
  function ensureCard(panelId, elId, beforeSelector) {
    var panel = document.getElementById(panelId);
    if (!panel) return null;
    var el = document.getElementById(elId);
    if (!el) {
      el = document.createElement('div');
      el.id = elId;
      var before = beforeSelector ? panel.querySelector(beforeSelector) : null;
      if (before) panel.insertBefore(el, before); else panel.appendChild(el);
    }
    return el;
  }

  function questRowHtml(r) {
    return '<div class="checkin-row" id="qrow-' + r.id + '">' +
        avatarHtml(r.member_name, r.member_photo) +
        '<div class="checkin-info">' +
          '<div class="checkin-name">' + esc(r.member_name || 'Member') + '</div>' +
          '<div class="checkin-listing">' + esc(r.quest_title || 'Quest') + ' · ' + relTime(r.requested_at) + '</div>' +
        '</div>' +
        '<div class="qc-actions">' +
          '<button class="btn btn-ghost" onclick="FFPQuestCheckins.decline(\'' + r.id + '\')">Decline</button>' +
          '<button class="btn btn-pri" onclick="FFPQuestCheckins.approve(\'' + r.id + '\')"><span class="ms">check</span> Approve</button>' +
        '</div>' +
      '</div>';
  }

  function challengeRowHtml(r) {
    var score = (r.score_text != null && r.score_text !== '') ? r.score_text
              : (r.score != null ? String(r.score) : '');
    return '<div class="checkin-row" id="crow-' + r.id + '">' +
        avatarHtml(r.member_name, r.member_photo) +
        '<div class="checkin-info">' +
          '<div class="checkin-name">' + esc(r.member_name || 'Member') + '</div>' +
          '<div class="checkin-listing">' + esc(r.challenge_title || 'Challenge') + ' · ' + relTime(r.submitted_at) + '</div>' +
        '</div>' +
        (score ? '<span class="qc-score">' + esc(score) + (r.metric ? (' ' + esc(r.metric)) : '') + '</span>' : '') +
        '<div class="qc-actions">' +
          '<button class="btn btn-pri" onclick="FFPQuestCheckins.verify(\'' + r.id + '\')"><span class="ms">check</span> Verify</button>' +
        '</div>' +
      '</div>';
  }

  function eventRowHtml(r) {
    return '<div class="checkin-row">' +
        avatarHtml(r.member_name, r.member_photo) +
        '<div class="checkin-info">' +
          '<div class="checkin-name">' + esc(r.member_name || 'Member') + '</div>' +
          '<div class="checkin-listing">' + esc(r.event_title || 'Event') + ' · ' + relTime(r.checked_in_at) + '</div>' +
        '</div>' +
        (r.verified ? '<span class="qc-badge">on-site</span>' : '') +
      '</div>';
  }

  function card(title, icon, sub, count, rowsHtml, footer) {
    var pill = count ? '<span class="qc-pill">' + count + '</span>' : '';
    return '<div class="qc-card">' +
      '<div class="qc-head"><span class="ms">' + icon + '</span> ' + title + ' ' + pill + '</div>' +
      '<div class="qc-sub">' + sub + '</div>' +
      rowsHtml + (footer || '') +
    '</div>';
  }

  function render() {
    // QUESTS → #panel-quests
    var qEl = ensureCard('panel-quests', 'ffp-q-quests', null);
    if (qEl) {
      var qList = qRows.length
        ? '<div class="checkin-list">' + qRows.map(questRowHtml).join('') + '</div>'
        : '<div class="qc-empty">No pending quest check-ins right now.</div>';
      var qFoot = '<div class="qc-visitors"><span class="ms">flag</span> <b>' +
        (qApproved >= 100 ? '100+' : qApproved) + '</b> quest check-ins approved at your venue</div>';
      qEl.innerHTML = card('Quest check-ins', 'flag', 'Members who submitted a quest step. Approve to stamp it.', qRows.length, qList, qFoot);
    }

    // CHALLENGE RESULTS → #panel-challenges (above the listings)
    var cEl = ensureCard('panel-challenges', 'ffp-q-challenges', '#ch-tabs');
    if (cEl) {
      var cList = cRows.length
        ? '<div class="checkin-list">' + cRows.map(challengeRowHtml).join('') + '</div>'
        : '<div class="qc-empty">No challenge results waiting to verify.</div>';
      cEl.innerHTML = card('Challenge results', 'emoji_events', 'Scorecards members submitted. Verify to confirm.', cRows.length, cList, '');
    }

    // EVENT CHECK-INS → #panel-checkins (attendance, above "Recent check-ins")
    var eEl = ensureCard('panel-checkins', 'ffp-q-events', '.section-head');
    if (eEl) {
      eEl.innerHTML = eRows.length
        ? card('Event check-ins', 'event', 'Members who checked in to your events.', eRows.length,
               '<div class="checkin-list">' + eRows.map(eventRowHtml).join('') + '</div>', '')
        : '';
    }
  }

  // ── data ──
  async function rpc(name, args) {
    try { var r = await sb().rpc(name, args); if (r.error) return null; return r.data; }
    catch (e) { return null; }
  }
  async function load() {
    var pid = providerId();
    if (!pid) return;
    var pend = await rpc('provider_quest_checkins', { p_provider: pid, p_status: 'pending' });
    var appr = await rpc('provider_quest_checkins', { p_provider: pid, p_status: 'approved' });
    var chal = await rpc('provider_challenge_entries', { p_provider: pid, p_only_unverified: true });
    var evs  = await rpc('provider_event_checkins', { p_provider: pid });
    qRows = pend || []; qApproved = (appr || []).length; cRows = chal || []; eRows = evs || [];
    render();
  }

  // ── actions ──
  async function approve(id) {
    var r = await rpc('provider_quest_approve', { p_checkin: id, p_approver: approverId() });
    if (!r || r.ok === false) { toast('Approve failed', 'error'); return; }
    toast(r.completed ? 'Approved — quest complete! Stamp awarded.' : 'Approved — step stamped.', 'success');
    load();
  }
  async function decline(id) {
    var r = await rpc('provider_quest_decline', { p_checkin: id });
    if (!r || r.ok === false) { toast('Decline failed', 'error'); return; }
    toast('Declined', 'info'); load();
  }
  async function verify(id) {
    var r = await rpc('provider_challenge_verify', { p_entry: id, p_approver: approverId() });
    if (!r || r.ok === false) { toast('Verify failed', 'error'); return; }
    toast('Result verified ✓', 'success'); load();
  }

  window.FFPQuestCheckins = { approve: approve, decline: decline, verify: verify, reload: load };

  async function init() {
    var ok = await waitFor(function () {
      return (document.getElementById('panel-quests') || document.getElementById('panel-challenges') || document.getElementById('panel-checkins'))
        && providerId() && window.supabase;
    }, 30000);
    if (!ok) { console.warn('[FFP Provider Check-ins] panels / provider / supabase not ready'); return; }
    injectStyles();
    await load();
    setInterval(load, 20000);   // light poll so new requests appear without a manual refresh
    console.log('[FFP Provider Check-ins v4] Loaded ✓ (Quests / Challenge results / Event check-ins split into panels)');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
