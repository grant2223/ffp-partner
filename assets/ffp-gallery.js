/* FFP Gallery — shared multi-image gallery for listing editors (v1, 2026-06-16)
   One reusable, namespaced gallery. Each editor mounts a container <div id="X-gallery"></div> and an
   "Add photo" button that calls FFPGallery.add('X-gallery'). The helper keeps the URL array per container,
   renders thumbnails (first = cover, ‹ › to reorder, delete to remove), and the editor reads it back on save
   via FFPGallery.get('X-gallery'). Images upload through the shared FFPUpload pipeline to the listing-covers
   bucket; the array is stored to the row's `gallery` jsonb column by the editor's save RPC.

   API:
     FFPGallery.init(containerId, urls)   -> seed + render (call when the modal opens)
     FFPGallery.get(containerId)          -> string[] (call on save)
     FFPGallery.add(containerId)          -> opens the picker, appends on success
     FFPGallery.remove(containerId, i)    -> remove
     FFPGallery.move(containerId, i, dir) -> reorder (-1 / +1)
*/
(function () {
  'use strict';
  var store = {};
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }
  function toast(m, k) { if (typeof window.showToast === 'function') { try { window.showToast(m, k || 'info'); return; } catch (e) {} } console.log('[FFPGallery]', m); }
  function render(cid) {
    var w = document.getElementById(cid); if (!w) return;
    var arr = store[cid] || [];
    if (!arr.length) {
      w.innerHTML = '<div style="font-size:13px;color:var(--ffp-text-muted,#8a99a8);padding:2px 0;">No extra photos yet. Add a few to show this off — the first is the cover.</div>';
      return;
    }
    w.innerHTML = arr.map(function (url, i) {
      return '<div style="position:relative;width:128px;height:84px;border-radius:10px;overflow:hidden;border:1px solid var(--ffp-border-mid,#1a2f44);background:#0a1825 center/cover no-repeat;background-image:url(\'' + esc(url) + '\');">' +
        (i === 0 ? '<span style="position:absolute;top:4px;left:4px;background:var(--ffp-purple,#8b5cf6);color:#fff;font-size:10px;font-weight:800;padding:2px 6px;border-radius:6px;">COVER</span>' : '') +
        '<div style="position:absolute;bottom:0;left:0;right:0;display:flex;background:rgba(0,8,20,.6);">' +
          '<button type="button" title="Move left" onclick="FFPGallery.move(\'' + cid + '\',' + i + ',-1)" style="flex:1;border:none;background:transparent;color:#fff;cursor:pointer;font-size:16px;line-height:1;padding:5px 0;">‹</button>' +
          '<button type="button" title="Remove" onclick="FFPGallery.remove(\'' + cid + '\',' + i + ')" style="flex:1;border:none;background:transparent;color:#fff;cursor:pointer;padding:5px 0;"><span class="ms" style="font-size:15px;vertical-align:-2px;">delete</span></button>' +
          '<button type="button" title="Move right" onclick="FFPGallery.move(\'' + cid + '\',' + i + ',1)" style="flex:1;border:none;background:transparent;color:#fff;cursor:pointer;font-size:16px;line-height:1;padding:5px 0;">›</button>' +
        '</div>' +
      '</div>';
    }).join('');
  }
  window.FFPGallery = {
    init: function (cid, urls) { store[cid] = Array.isArray(urls) ? urls.slice() : []; render(cid); },
    get: function (cid) { return (store[cid] || []).slice(); },
    render: render,
    add: function (cid) {
      if (!window.FFPUpload) { toast('Uploader not ready — refresh and retry', 'error'); return; }
      var pid = (window.FFP_PROVIDER && window.FFP_PROVIDER.id) || 'provider';
      window.FFPUpload.pick({ bucket: 'listing-covers', key: 'gallery-' + pid + '-' + Date.now(), aspect: 16 / 9, outW: 1600, outH: 900, title: 'Add a photo',
        onDone: function (url) { (store[cid] = store[cid] || []).push(url); render(cid); },
        onError: function (er) { toast('Upload failed: ' + ((er && er.message) || 'try again'), 'error'); } });
    },
    remove: function (cid, i) { if (store[cid]) { store[cid].splice(i, 1); render(cid); } },
    move: function (cid, i, dir) { var a = store[cid]; if (!a) return; var j = i + dir; if (j < 0 || j >= a.length) return; var t = a[i]; a[i] = a[j]; a[j] = t; render(cid); }
  };
})();
