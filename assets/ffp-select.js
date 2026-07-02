/* FFP shared dark SELECT picker — v1 (2026-06-13)
 * One consistent dropdown look across the partner portal. Enhances a native <select> into a dark,
 * on-brand picker (the same style the Profile uses), with a search box when the list is long.
 * The native <select> stays in the DOM (hidden) and is kept in sync, so existing `.value` reads/writes
 * and change handlers keep working untouched.
 *
 * Usage:
 *   FFPSelect.enhance(rootElOrSelector)  // enhances every <select> under root (idempotent)
 *   FFPSelect.enhance(selectEl)          // enhances a single select
 *   FFPSelect.refresh(selectEl)          // re-sync the label after setting .value in code
 */
(function () {
  'use strict';
  function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  function injectCSS(){
    if (document.getElementById('ffp-select-css')) return;
    var c = document.createElement('style'); c.id = 'ffp-select-css';
    c.textContent = [
      '.ffp-sel{position:relative;width:100%;}',
      '.ffp-sel-btn{width:100%;display:flex;align-items:center;justify-content:space-between;gap:8px;background:rgba(43,168,224,0.06);border:1px solid rgba(43,168,224,0.30);border-radius:8px;color:#f5f7fa;padding:10px 12px;font-size:13px;font-weight:600;font-family:inherit;cursor:pointer;text-align:left;}',
      '.ffp-sel-btn:hover{border-color:#2ba8e0;}',
      '.ffp-sel-btn.placeholder{color:#8a99a8;}',
      '.ffp-sel-btn .ms{font-size:18px;color:#8a99a8;flex-shrink:0;}',
      '.ffp-sel-menu{position:absolute;top:calc(100% + 4px);left:0;right:0;background:#0f1e2e;border:1px solid rgba(43,168,224,0.30);border-radius:8px;max-height:260px;overflow-y:auto;z-index:9500;display:none;box-shadow:0 8px 24px rgba(0,0,0,0.4);padding:4px;}',
      '.ffp-sel-menu.open{display:block;}',
      '.ffp-sel-item{padding:9px 12px;border-radius:6px;font-size:13px;font-weight:600;color:#f5f7fa;cursor:pointer;}',
      '.ffp-sel-item:hover{background:rgba(43,168,224,0.10);}',
      '.ffp-sel-item.active{background:rgba(43,168,224,0.15);color:#2ba8e0;}',
      '.ffp-sel-search{position:sticky;top:-4px;background:#0f1e2e;padding:4px 4px 6px;margin:-4px -4px 4px;border-bottom:1px solid rgba(43,168,224,0.15);z-index:1;}',
      '.ffp-sel-input{width:100%;box-sizing:border-box;background:rgba(43,168,224,0.06);border:1px solid rgba(43,168,224,0.30);border-radius:6px;color:#f5f7fa;padding:8px 10px;font-size:13px;font-family:inherit;outline:none;}',
      '.ffp-sel-input:focus{border-color:#2ba8e0;}'
    ].join('');
    document.head.appendChild(c);
  }

  var SEARCH_AT = 12;

  function refresh(sel){
    if (!sel || sel.dataset.ffpSel !== '1') return;
    var wrap = sel.previousSibling;
    if (!wrap || !wrap.classList || !wrap.classList.contains('ffp-sel')) return;
    var btn = wrap.querySelector('.ffp-sel-btn'), label = wrap.querySelector('.ffp-sel-label');
    if (!btn || !label) return;
    var opt = sel.options[sel.selectedIndex];
    if (sel.value && opt && opt.value) { label.textContent = opt.textContent; btn.classList.remove('placeholder'); }
    else { label.textContent = (sel.options[0] ? sel.options[0].textContent : '') || 'Select…'; btn.classList.add('placeholder'); }
  }

  function wrap(sel){
    if (!sel || sel.tagName !== 'SELECT') return;
    if (sel.dataset.ffpSel === '1') { refresh(sel); return; }
    injectCSS();
    sel.dataset.ffpSel = '1';
    sel.style.display = 'none';
    var box = document.createElement('div'); box.className = 'ffp-sel';
    var btn = document.createElement('button'); btn.type = 'button'; btn.className = 'ffp-sel-btn placeholder';
    btn.innerHTML = '<span class="ffp-sel-label"></span><span class="ms">expand_more</span>';
    var menu = document.createElement('div'); menu.className = 'ffp-sel-menu';

    function build(filter){
      var withSearch = (function(){ var n=0; for (var i=0;i<sel.options.length;i++) if (sel.options[i].value) n++; return n > SEARCH_AT; })();
      var q = (filter || '').trim().toLowerCase(), html = '';
      if (withSearch) html += '<div class="ffp-sel-search"><input type="text" class="ffp-sel-input" placeholder="Search…" value="' + esc(filter||'') + '"></div>';
      Array.prototype.forEach.call(sel.options, function(o){
        if (!o.value) return;
        if (q && o.textContent.toLowerCase().indexOf(q) === -1) return;
        html += '<div class="ffp-sel-item' + (o.value===sel.value?' active':'') + '" data-v="' + esc(o.value) + '">' + esc(o.textContent) + '</div>';
      });
      menu.innerHTML = html;
      menu.querySelectorAll('.ffp-sel-item').forEach(function(it){
        it.addEventListener('click', function(){ sel.value = it.dataset.v; sel.dispatchEvent(new Event('change',{bubbles:true})); refresh(sel); menu.classList.remove('open'); });
      });
      if (withSearch){ var inp = menu.querySelector('.ffp-sel-input'); if (inp){ inp.addEventListener('click', function(e){ e.stopPropagation(); }); inp.addEventListener('input', function(){ build(inp.value); inp.focus(); }); setTimeout(function(){ try{ inp.focus(); }catch(e){} },0); } }
    }
    btn.addEventListener('click', function(e){ e.stopPropagation(); if (menu.classList.contains('open')) menu.classList.remove('open'); else { document.querySelectorAll('.ffp-sel-menu.open').forEach(function(m){ m.classList.remove('open'); }); build(''); menu.classList.add('open'); } });
    sel.parentNode.insertBefore(box, sel); box.appendChild(btn); box.appendChild(menu);
    sel.addEventListener('change', function(){ refresh(sel); });
    refresh(sel);
  }

  function enhance(root){
    var el = (typeof root === 'string') ? document.querySelector(root) : root;
    if (!el) return;
    if (el.tagName === 'SELECT') { wrap(el); return; }
    el.querySelectorAll && el.querySelectorAll('select').forEach(function(s){ wrap(s); });
  }

  document.addEventListener('click', function(){ document.querySelectorAll('.ffp-sel-menu.open').forEach(function(m){ m.classList.remove('open'); }); });
  window.FFPSelect = { enhance: enhance, refresh: refresh };
})();
