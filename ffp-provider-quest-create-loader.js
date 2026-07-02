/* FFP Provider Quest Create Loader — v1 (2026-06-04)
   Lets a provider CREATE quests for their own facility (#quests P1). Injects a
   "Your quests" card at the TOP of #panel-quests (above the quest check-in queue
   rendered by ffp-provider-quests-loader.js). Create/edit go through the
   provider_save_quest RPC (SECURITY DEFINER, trusts FFP_PROVIDER.id — same model
   as provider_save_listing). Quests go LIVE on submit (light-touch). Members
   complete them via the existing check-in → provider_quest_approve → stamp flow.

   Status mapping (quests_status_check allows draft/live/ended):
     live  = active        paused = 'draft'        removed = 'ended'
   Reuses platform helpers from the provider dashboard: openModalShell,
   renderListingUploader, closeModal, openConfirm, showToast, providerProfile.
*/
(function () {
  'use strict';

  var CATS = ['fitness', 'sports', 'wellness', 'recovery', 'adventure', 'food'];
  var myQuests = [];

  function toast(m, k) {
    if (typeof window.showToast === 'function') { try { window.showToast(m, k || 'info'); return; } catch (e) {} }
    console.log('[FFP Provider Quest]', m);
  }
  function esc(s) {
    if (typeof window.escHtml === 'function') return window.escHtml(s);
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  async function waitFor(check, ms) {
    var t = 0, l = Math.ceil((ms || 15000) / 100);
    while (!check() && t < l) { await new Promise(function (r) { setTimeout(r, 100); }); t++; }
    return check();
  }
  function provId() { return (window.FFP_PROVIDER || {}).id; }
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function statusLabel(st) { return st === 'live' ? 'Live' : st === 'draft' ? 'Paused' : 'Ended'; }

  function injectStyles() {
    if (document.getElementById('ffp-pq-css')) return;
    var css = document.createElement('style');
    css.id = 'ffp-pq-css';
    css.textContent = [
      '#ffp-pq-card{background:#ffffff;border:1px solid #d8dde2;border-radius:14px;padding:16px;margin-bottom:16px;}',
      '#ffp-pq-card .pq-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px;}',
      '#ffp-pq-card .pq-h-title{font-size:15px;font-weight:800;color:#0e2531;}',
      '#ffp-pq-card .pq-h-sub{font-size:12px;color:#566069;margin-top:2px;}',
      '#ffp-pq-card .pq-list{display:flex;flex-direction:column;gap:8px;}',
      '#ffp-pq-card .pq-empty{font-size:12px;color:#566069;padding:12px 4px;line-height:1.5;}',
      '#ffp-pq-card .pq-row{display:flex;align-items:center;justify-content:space-between;gap:10px;background:#ffffff;border:1px solid #d8dde2;border-radius:10px;padding:11px 13px;flex-wrap:wrap;}',
      '#ffp-pq-card .pq-title{font-size:13px;font-weight:700;color:#0e2531;}',
      '#ffp-pq-card .pq-sub{font-size:11px;color:#566069;margin-top:2px;}',
      '#ffp-pq-card .pq-actions{display:flex;align-items:center;gap:6px;}',
      '#ffp-pq-card .pq-pill{font-size:10px;font-weight:800;letter-spacing:1px;text-transform:uppercase;padding:4px 9px;border-radius:6px;white-space:nowrap;}',
      '#ffp-pq-card .pq-pill.live{background:rgba(74,222,128,0.15);color:#4ade80;border:1px solid rgba(74,222,128,0.4);}',
      '#ffp-pq-card .pq-pill.draft{background:rgba(15,37,49,0.12);color:var(--ffp-warn);border:1px solid rgba(15,37,49,0.35);}',
      '#ffp-pq-card .pq-pill.ended{background:rgba(138,153,168,0.12);color:#566069;border:1px solid rgba(138,153,168,0.35);}',
      '#ffp-pq-card .pq-btn{background:transparent;border:1px solid #2a4564;color:#cfe3f5;padding:6px 11px;border-radius:7px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;}',
      '#ffp-pq-card .pq-btn:hover{border-color:#1980AD;}',
      '#ffp-pq-card .pq-create{display:inline-flex;align-items:center;gap:5px;background:#1980AD;border:none;color:#06121f;padding:9px 14px;border-radius:9px;font-size:13px;font-weight:800;cursor:pointer;font-family:inherit;white-space:nowrap;}',
      '#ffp-pq-card .pq-create:hover{filter:brightness(1.05);}'
    ].join('');
    document.head.appendChild(css);
  }

  async function fetchMine() {
    if (!provId() || !window.supabase) return [];
    var res = await window.supabase
      .from('quests')
      .select('id, title, description, category, target_count, status, prize_text, hero_image_url, active_to, city, country')
      .eq('provider_id', provId()).eq('owner_type', 'provider')
      .neq('status', 'ended')
      .order('created_at', { ascending: false });
    if (res.error) { console.error('[FFP Provider Quest] fetch:', res.error); return []; }
    return res.data || [];
  }
  async function refresh() { myQuests = await fetchMine(); renderCard(); }

  function ensureCard() {
    var panel = document.getElementById('panel-quests');
    if (!panel) return null;
    var card = document.getElementById('ffp-pq-card');
    if (!card) { card = document.createElement('div'); card.id = 'ffp-pq-card'; panel.insertBefore(card, panel.firstChild); }
    return card;
  }

  function questRow(q) {
    var st = q.status || 'live';
    return '<div class="pq-row">' +
        '<div class="pq-info"><div class="pq-title">' + esc(q.title || 'Quest') + '</div>' +
          '<div class="pq-sub">' + esc(cap(q.category || '')) + ' &middot; visit ' + (q.target_count || 1) + '×' +
            (q.prize_text ? ' &middot; ' + esc(q.prize_text) : '') + '</div></div>' +
        '<div class="pq-actions">' +
          '<span class="pq-pill ' + st + '">' + statusLabel(st) + '</span>' +
          '<button class="pq-btn" onclick="FFPProviderQuest.toggle(\'' + q.id + '\')">' + (st === 'live' ? 'Pause' : 'Resume') + '</button>' +
          '<button class="pq-btn" onclick="FFPProviderQuest.edit(\'' + q.id + '\')">Edit</button>' +
        '</div>' +
      '</div>';
  }

  function renderCard() {
    var card = ensureCard();
    if (!card) return;
    var list = myQuests.length
      ? myQuests.map(questRow).join('')
      : '<div class="pq-empty">No quests yet. Create one so members can complete it at your venue and earn your stamp — a great reason for them to keep coming back.</div>';
    card.innerHTML =
      '<div class="pq-head"><div>' +
        '<div class="pq-h-title">Your quests</div>' +
        '<div class="pq-h-sub">Members complete these at your facility to earn your venue stamp</div>' +
      '</div>' +
      '<button class="pq-create" onclick="FFPProviderQuest.create()"><span class="ms">add</span>Create a quest</button></div>' +
      '<div class="pq-list">' + list + '</div>';
  }

  function openForm(editing) {
    var q = editing || { title: '', description: '', category: 'fitness', target_count: 5, prize_text: '', hero_image_url: '', active_to: '' };
    var endVal = q.active_to ? String(q.active_to).slice(0, 10) : '';
    var body =
      '<div class="help-strip"><span class="ms">info</span><div><b>Venue quest:</b> members check in at your facility the set number of times to complete it and earn your venue stamp. Optionally add a prize you provide yourself. It goes live as soon as you create it.</div></div>' +
      '<div class="form-section"><div class="form-section-title">Photo</div><div id="listing-photo-slot" data-url="' + esc(q.hero_image_url || '') + '"></div></div>' +
      '<div class="form-section"><div class="form-section-title">Basics</div><div class="form-grid">' +
        '<div class="field full"><div class="label">Title <span class="req">*</span></div>' +
          '<input class="input" id="pq-title" value="' + esc(q.title) + '" placeholder="e.g. Visit us 5 times this month"></div>' +
        '<div class="field"><div class="label">Category <span class="req">*</span></div><select class="select" id="pq-category">' +
          CATS.map(function (c) { return '<option value="' + c + '"' + (q.category === c ? ' selected' : '') + '>' + cap(c) + '</option>'; }).join('') +
        '</select></div>' +
        '<div class="field"><div class="label">Check-ins to complete <span class="req">*</span></div>' +
          '<input class="input" type="number" min="1" max="50" id="pq-target" value="' + (q.target_count || 5) + '"></div>' +
        '<div class="field full"><div class="label">Description</div>' +
          '<textarea class="textarea" id="pq-description" rows="3" placeholder="What members do at your venue">' + esc(q.description || '') + '</textarea></div>' +
      '</div></div>' +
      '<div class="form-section"><div class="form-section-title">Reward</div><div class="form-grid">' +
        '<div class="field full"><div class="label">Your prize <span class="label-hint">— optional, you provide it</span></div>' +
          '<input class="input" id="pq-prize" value="' + esc(q.prize_text || '') + '" placeholder="e.g. Free smoothie / class pass / 10% off"></div>' +
        '<div class="field"><div class="label">Runs until <span class="label-hint">— optional</span></div>' +
          '<input class="input" type="date" id="pq-end" value="' + esc(endVal) + '"></div>' +
      '</div></div>';
    var foot =
      (editing ? '<button class="btn btn-ghost left" onclick="FFPProviderQuest.del(\'' + editing.id + '\')"><span class="ms">delete</span> Remove</button>' : '') +
      '<button class="btn btn-ghost" onclick="closeModal()">Cancel</button>' +
      '<button class="btn btn-pri" onclick="FFPProviderQuest.save(\'' + (editing ? editing.id : '') + '\')">' + (editing ? 'Save changes' : 'Create quest') + '</button>';
    if (typeof window.openModalShell === 'function') window.openModalShell('lg', (editing ? 'Edit quest' : 'New quest'), body, foot);
    if (typeof window.renderListingUploader === 'function') { try { window.renderListingUploader(q.hero_image_url || null); } catch (e) {} }
  }

  async function save(id) {
    if (!provId()) { toast('Provider not loaded', 'error'); return; }
    var g = function (k) { var el = document.getElementById('pq-' + k); return el ? (el.value || '').trim() : ''; };
    var title = g('title');
    if (!title) { toast('Title is required', 'error'); return; }
    var target = parseInt(g('target'), 10) || 0;
    if (target < 1) { toast('Set how many check-ins complete it', 'error'); return; }
    var slot = document.getElementById('listing-photo-slot');
    var hero = (slot && slot.dataset.url) ? slot.dataset.url : '';
    var prof = window.providerProfile || {};
    var payload = {
      title: title,
      description: g('description') || null,
      category: g('category') || 'fitness',
      target_count: String(target),
      prize_text: g('prize') || null,
      hero_image_url: hero || null,
      active_to: g('end') ? new Date(g('end') + 'T23:59:59').toISOString() : null,
      city: prof.city || null,
      country: prof.country || null
    };
    try {
      var res = await window.supabase.rpc('provider_save_quest', { p_provider: provId(), p_id: id || null, p: payload });
      if (res.error) throw res.error;
      if (!res.data) throw new Error(id ? 'Update failed — not found or not permitted' : 'Create failed — please try again');
      if (typeof window.closeModal === 'function') window.closeModal();
      toast(id ? 'Quest updated' : 'Quest created — it’s live', 'success');
      await refresh();
    } catch (e) {
      console.error('[FFP Provider Quest] save:', e);
      toast(e.message || 'Save failed', 'error');
    }
  }

  async function toggle(id) {
    var q = myQuests.find(function (x) { return x.id === id; });
    if (!q) return;
    var next = (q.status === 'live') ? 'draft' : 'live';
    try {
      var res = await window.supabase.rpc('provider_save_quest', { p_provider: provId(), p_id: id, p: { status: next } });
      if (res.error) throw res.error;
      if (!res.data) throw new Error('Not permitted');
      toast(next === 'live' ? 'Quest resumed — live again' : 'Quest paused', 'success');
      await refresh();
    } catch (e) { console.error('[FFP Provider Quest] toggle:', e); toast(e.message || 'Could not update', 'error'); }
  }

  async function del(id) {
    var doDel = async function () {
      try {
        var res = await window.supabase.rpc('provider_save_quest', { p_provider: provId(), p_id: id, p: { status: 'ended' } });
        if (res.error) throw res.error;
        if (typeof window.closeModal === 'function') window.closeModal();
        toast('Quest removed', 'success');
        await refresh();
      } catch (e) { console.error('[FFP Provider Quest] remove:', e); toast(e.message || 'Could not remove', 'error'); }
    };
    if (typeof window.openConfirm === 'function') {
      window.openConfirm('Remove this quest?', 'Members keep any stamp they already earned, but no new check-ins will count and it disappears from your list.', doDel);
    } else if (confirm('Remove this quest?')) { await doDel(); }
  }

  window.FFPProviderQuest = {
    create: function () { openForm(null); },
    edit: function (id) { var q = myQuests.find(function (x) { return x.id === id; }); if (q) openForm(q); },
    save: save, toggle: toggle, del: del, refresh: refresh
  };

  async function init() {
    var ok = await waitFor(function () { return window.supabase && document.getElementById('panel-quests'); }, 15000);
    if (!ok) { console.error('[FFP Provider Quest] deps never loaded'); return; }
    var authed = await waitFor(function () { return !!provId(); }, 30000);
    if (!authed) { console.warn('[FFP Provider Quest] FFP_PROVIDER not set'); return; }
    injectStyles();
    try { await refresh(); console.log('[FFP Provider Quest v1] Loaded ✓'); }
    catch (e) { console.error('[FFP Provider Quest] initial load:', e); }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
