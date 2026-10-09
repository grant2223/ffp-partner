/* FFP Partner — Leagues organiser console (desktop).
   Model: League -> Divisions (team or individual) -> Entrants -> Fixtures (round-robin) -> Table.
   Stats via lt_sport_schemas (sport-specific). Owner-gated RPCs (created_by=auth.uid()).
   All editing is inline on the page — no browser prompts. Icons use the app .ms font.
   Exposes window.ffpRenderLeagues (panel hook) + window.FFPLeague (actions). */
(function () {
  var sb = function () { return window.supabase; };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); };
  function toast(m, k) { if (typeof window.showToast === 'function') { try { window.showToast(m, k || 'info'); return; } catch (e) {} } console.log('[FFP League]', m); }
  function root() { return document.getElementById('lg-root'); }
  function ic(n) { return '<span class="ms">' + n + '</span>'; }
  /* A division says whether it is for teams or for individuals, so the console
     has to speak that back: a teams division must never say "players" where it
     means teams. nouns() answers for one division, evNouns() for the whole
     league, which stays on the neutral word when its divisions are of both
     kinds rather than picking one and being wrong half the time. */
  function nouns(d) {
    var team = (d && d.kind) ? d.kind !== 'individual' : true;
    return team
      ? { one: 'team', many: 'teams', One: 'Team', Many: 'Teams', poss: 'a team\u2019s' }
      : { one: 'player', many: 'players', One: 'Player', Many: 'Players', poss: 'a player\u2019s' };
  }
  function curDv() {
    var ds = (S.detail && S.detail.divisions) || [];
    return ds.filter(function (d) { return d.id === S.divId; })[0] || ds[0] || null;
  }
  function evNouns() {
    var ds = (S.detail && S.detail.divisions) || [], kinds = [];
    ds.forEach(function (d) {
      var k = d.kind === 'individual' ? 'individual' : 'team';
      if (kinds.indexOf(k) < 0) kinds.push(k);
    });
    if (kinds.length > 1) return { one: 'entrant', many: 'entrants', One: 'Entrant', Many: 'Entrants', poss: 'an entrant\u2019s' };
    return nouns({ kind: kinds[0] || 'team' });
  }

  var S = { view: 'list', eventId: null, detail: null, tab: 'information', divId: null, sports: null, creating: false, divEdit: null, divDel: null, _divUse: null, _potm: null, entAdd: false, entEdit: null, entDel: null, rb: null, rbDiv: null, rbInfo: null, rbByes: null };

  function injectCss() {
    if (document.getElementById('lgb-css')) return;
    var css = document.createElement('style'); css.id = 'lgb-css';
    css.textContent = [
      '.lg-wrap{max-width:1000px;}',
      /* ── SCHEDULE, the tournament layout ────────────────────────────────
         A day, then a court, then the order of play down it. One row per
         match: its time, who is in it, which court, and a menu for the rest.
         Same shapes as the tournaments console so an organiser running both
         is never learning two screens. */
      /* MATCH DAY. The leagues console keeps its own copy of these rules, as it
         does for every other screen: leagues and tournaments are different
         sections and neither reaches into the other's file. */
      '.md-top{padding:2px 0 0;}.md-day{display:flex;align-items:center;gap:8px;padding:2px 0 14px;}.md-day b{font-size:17px;font-weight:900;color:var(--ffp-text);}.md-day .tz{font-size:11.5px;font-weight:700;color:var(--ffp-text-muted);margin-left:6px;}.md-day .sp{flex:1;}.md-cnt{display:flex;align-items:stretch;border-top:1px solid var(--ffp-border);border-bottom:1px solid var(--ffp-border);margin-bottom:6px;}.md-cn{padding:12px 22px 11px;border-right:1px solid var(--ffp-border);min-width:104px;}.md-cn:last-child{border-right:0;}.md-cn u{text-decoration:none;display:block;font-size:22px;font-weight:900;letter-spacing:-.03em;line-height:1;font-variant-numeric:tabular-nums;color:var(--ffp-text);}.md-cn s{text-decoration:none;display:block;font-size:10px;font-weight:800;letter-spacing:.12em;color:var(--ffp-text-muted);margin-top:6px;}.md-cn.ok u{color:#1F7A5C;}.md-cn.warn u{color:#B87A00;}.md-cn.blue u{color:var(--ffp-blue);}/* THE WHOLE DAY, as approved: surfaces down the side, slots across, the slot   being played bracketed in gold rather than a line struck through the names. */.md-dy{background:#fff;border-radius:12px;overflow:hidden;position:relative;box-shadow:0 1px 0 var(--ffp-border),0 8px 22px rgba(14,40,66,.06);}.md-dy .sc{overflow-x:auto;}table.md-g{border-collapse:collapse;width:100%;}table.md-g th,table.md-g td{border-right:1px solid var(--ffp-border);border-bottom:1px solid var(--ffp-border);vertical-align:top;}table.md-g th.cl,table.md-g td.cl{width:104px;min-width:104px;border-right:2px solid var(--ffp-border-mid);}table.md-g thead th{background:#F8FAFC;padding:11px 8px;font-size:11.5px;font-weight:900;letter-spacing:.05em;color:var(--ffp-blue);font-variant-numeric:tabular-nums;text-align:center;min-width:132px;}table.md-g thead th.cl{text-align:left;padding-left:14px;font-size:9.5px;letter-spacing:.13em;color:var(--ffp-text-muted);}table.md-g td.cl{padding:11px 14px;background:#FBFCFD;}table.md-g td.cl b{display:block;font-size:13.5px;font-weight:900;color:var(--ffp-text);}table.md-g td.cl s{text-decoration:none;display:block;font-size:9px;font-weight:700;letter-spacing:.12em;color:var(--ffp-text-muted);margin-top:3px;}table.md-g td{padding:0;}table.md-g td>div{padding:8px 9px 9px;min-height:50px;}table.md-g td.dbl>div:first-child{border-bottom:2px dashed #B87A00;}table.md-g td.dbl>div{min-height:0;}table.md-g th.now,table.md-g td.now{border-left:2px solid #F2A900;border-right:2px solid #F2A900;}table.md-g th.now{border-top:3px solid #F2A900;}table.md-g th.now .nw{display:block;font-size:8.5px;font-weight:900;letter-spacing:.12em;color:#B87A00;margin-top:3px;}table.md-g tr:last-child td.now{border-bottom:3px solid #F2A900;}.md-g .tag{display:block;font-size:8.5px;font-weight:900;letter-spacing:.1em;margin-bottom:5px;}.md-g .who{text-decoration:none;display:block;font-size:11.5px;font-weight:800;line-height:1.3;color:var(--ffp-text);overflow-wrap:anywhere;}.md-g s.who{font-weight:700;color:var(--ffp-text-muted);}.md-g .sc2{font-style:normal;display:block;font-size:12px;font-weight:900;margin-top:4px;color:#1F7A5C;font-variant-numeric:tabular-nums;}.md-g .c-done{background:#E8F5EF;}.md-g .c-live{background:#FFF4DC;box-shadow:inset 0 0 0 2px #F2A900;}.md-g .c-late{background:#FDF6E6;}.md-g .c-wait{background:#fff;}.md-g .c-none{background:repeating-linear-gradient(135deg,#EEF2F6 0 6px,#F7F9FB 6px 12px);}table.md-g td.free>s{display:block;padding:20px 9px;font-size:11px;font-weight:700;color:#BCC9D6;text-decoration:none;text-align:center;}.md-nowtag{position:absolute;top:3px;font-size:10.5px;font-weight:900;letter-spacing:.09em;z-index:4;color:#B87A00;white-space:nowrap;transform:translateX(-50%);padding-bottom:7px;}.md-key{display:flex;flex-wrap:wrap;gap:20px;margin:14px 2px 0;font-size:10.5px;font-weight:800;letter-spacing:.07em;color:var(--ffp-text-muted);}.md-key span{display:flex;align-items:center;gap:8px;}.md-key i{width:18px;height:11px;border-radius:3px;display:block;flex:none;}.md-strip{display:flex;align-items:stretch;flex-wrap:wrap;border-top:1px solid var(--ffp-border);border-bottom:1px solid var(--ffp-border);margin:0 0 4px;}.md-dbtn{border:0;background:none;font:inherit;cursor:pointer;text-align:left;padding:11px 18px 10px;border-right:1px solid var(--ffp-border);box-shadow:inset 0 3px 0 transparent;}.md-dbtn:hover{background:#f6f9fb;}.md-dbtn b{display:block;font-size:12.5px;font-weight:800;color:var(--ffp-text-muted);}.md-dbtn s{text-decoration:none;display:block;font-size:10px;font-weight:800;letter-spacing:.09em;color:var(--ffp-text-dim);margin-top:4px;font-variant-numeric:tabular-nums;}.md-dbtn.on{box-shadow:inset 0 3px 0 #F2A900;}.md-dbtn.on b{color:var(--ffp-text);font-weight:900;}.md-dbtn.on s{color:var(--ffp-text-muted);}.md-none{display:flex;align-items:flex-start;gap:12px;padding:16px 2px 4px;}.md-none .ms{font-size:21px;color:var(--ffp-text-dim);flex:none;}.md-none .g b{display:block;font-size:14.5px;font-weight:800;color:var(--ffp-text);}.md-none .g p{margin:5px 0 0;font-size:12.5px;font-weight:600;color:var(--ffp-text-muted);line-height:1.5;}.md-none .g a{display:inline-block;margin-top:10px;}.md-sh{display:flex;align-items:flex-end;gap:13px;margin:30px 0 12px;}.md-sh h3{font-size:12.5px;font-weight:900;letter-spacing:.16em;color:var(--ffp-blue);margin:0;}.md-sh p{font-size:12.5px;font-weight:600;color:var(--ffp-text-muted);margin:0;padding-bottom:1px;}.md-sh .ln{flex:1;height:1px;background:var(--ffp-border);margin-bottom:5px;}.md-clear{display:flex;align-items:center;gap:11px;padding:16px 2px;font-size:14px;font-weight:800;color:#1F7A5C;}.md-clear .ms{font-size:21px;}.md-rail{position:relative;padding-left:100px;}.md-rail:before{content:"";position:absolute;left:88px;top:6px;bottom:6px;width:2px;background:linear-gradient(180deg,#F2A900,#E4EBF1);}.md-jb{position:relative;display:flex;align-items:center;gap:22px;padding:12px 0 13px;border-bottom:1px solid var(--ffp-border);}.md-jb:last-child{border-bottom:0;}.md-jb .tm{position:absolute;left:-100px;top:13px;width:80px;text-align:right;}.md-jb .tm u{text-decoration:none;display:block;font-size:14.5px;font-weight:900;font-variant-numeric:tabular-nums;color:var(--ffp-text);}.md-jb .tm s{text-decoration:none;display:block;font-size:9.5px;font-weight:800;letter-spacing:.1em;color:var(--ffp-text-muted);margin-top:3px;}.md-jb .dot{position:absolute;left:-18px;top:18px;width:13px;height:13px;border-radius:50%;background:#fff;box-shadow:0 0 0 3px #9aa8b4;}.md-jb.k-clash .dot,.md-jb.k-finish .dot{box-shadow:0 0 0 3px #B87A00;}.md-jb.k-result .dot{box-shadow:0 0 0 3px #F2A900;}.md-jb.k-official .dot,.md-jb.k-sheet .dot,.md-jb.k-entrants .dot,.md-jb.k-surface .dot{box-shadow:0 0 0 3px #7FB2D9;}.md-jb .mid{flex:1;min-width:0;max-width:620px;}.md-jb .mid .where{display:inline-block;font-size:10px;font-weight:900;letter-spacing:.12em;color:#B87A00;margin-bottom:5px;}.md-jb .mid b{display:block;font-size:15px;font-weight:800;line-height:1.3;color:var(--ffp-text);overflow-wrap:anywhere;}.md-jb .mid p{margin:4px 0 0;font-size:12.5px;font-weight:600;color:var(--ffp-text-muted);line-height:1.45;overflow-wrap:anywhere;}.md-jb .acts{flex:none;margin-left:auto;display:flex;gap:8px;}.md-board{background:#fff;border-radius:3px 3px 12px 12px;overflow:hidden;position:relative;box-shadow:0 1px 0 var(--ffp-border),0 8px 22px rgba(14,40,66,.06);}.md-board:before{content:"";position:absolute;left:0;right:0;top:0;height:4px;background:linear-gradient(90deg,var(--ffp-blue),#7FB2D9);}.md-bh,.md-row{display:grid;grid-template-columns:134px 292px 1fr 196px;align-items:center;}.md-bh{padding:14px 20px 11px;border-bottom:1px solid var(--ffp-border);margin-top:4px;}.md-bh span{font-size:9.5px;font-weight:900;letter-spacing:.13em;color:var(--ffp-text-muted);}.md-row{padding:14px 20px;border-bottom:1px solid var(--ffp-border);position:relative;}.md-row:last-child{border-bottom:0;}.md-row:before{content:"";position:absolute;left:0;top:0;bottom:0;width:4px;background:#C3D3E0;}.md-row.e-live:before{background:#F2A900;}.md-row.e-late:before{background:#FFD46B;}.md-row.e-live{background:linear-gradient(90deg,rgba(242,169,0,.10),rgba(242,169,0,0) 62%);}.md-row .c b{display:block;font-size:15.5px;font-weight:900;color:var(--ffp-text);}.md-row .c s{text-decoration:none;display:block;font-size:9.5px;font-weight:700;letter-spacing:.11em;color:var(--ffp-text-muted);margin-top:4px;}.md-row .on u,.md-row .nx u,.md-row .rf u{text-decoration:none;display:block;font-size:13.5px;font-weight:800;line-height:1.25;color:var(--ffp-text);overflow-wrap:anywhere;}.md-row .on u.free,.md-row .nx u.free{color:var(--ffp-text-muted);font-weight:700;}.md-row .rf u.none{color:#B87A00;}.md-row .on s,.md-row .nx s,.md-row .rf s{text-decoration:none;display:block;font-size:11px;font-weight:700;color:var(--ffp-text-muted);margin-top:4px;line-height:1.35;}.md-row .nx s.bad{color:#B87A00;}.md-divs{display:grid;grid-template-columns:repeat(auto-fit,minmax(272px,1fr));background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 0 var(--ffp-border),0 8px 22px rgba(14,40,66,.06);}.md-dv{padding:17px 20px 19px;background:#fff;box-shadow:inset -1px -1px 0 var(--ffp-border);}.md-dv .r1{display:flex;align-items:baseline;gap:9px;}.md-dv .r1 i{width:10px;height:10px;border-radius:2px;display:block;flex:none;background:var(--dc,var(--ffp-blue));align-self:center;}.md-dv .r1 b{font-size:15px;font-weight:900;color:var(--ffp-text);}.md-dv .r1 span{margin-left:auto;font-size:10px;font-weight:900;letter-spacing:.11em;}.md-dv .r1 span.ok{color:#1F7A5C;}.md-dv .r1 span.no{color:#B87A00;}.md-dv .mt{display:flex;gap:24px;margin-top:13px;}.md-dv .mt u{text-decoration:none;display:block;font-size:24px;font-weight:900;line-height:1;letter-spacing:-.03em;font-variant-numeric:tabular-nums;color:var(--ffp-text);}.md-dv .mt u.bad{color:#B87A00;}.md-dv .mt s{text-decoration:none;display:block;font-size:9.5px;font-weight:800;letter-spacing:.12em;color:var(--ffp-text-muted);margin-top:6px;}.md-dv .pips{display:flex;flex-wrap:wrap;gap:3px;margin-top:16px;}.md-dv .pips i{width:10px;height:14px;border-radius:2px;display:block;background:repeating-linear-gradient(135deg,#E6ECF2 0 4px,#F2F6F9 4px 8px);}.md-dv .pips i.todo{background:#E6ECF2;}.md-dv .pips i.won{background:linear-gradient(180deg,#2E9B77,#1F7A5C);}.md-dv .nt{font-size:12px;font-weight:700;color:var(--ffp-text-muted);margin-top:11px;line-height:1.45;}.md-dv .nt.bad{color:#B87A00;font-weight:800;}',
      '.sc-day{font-size:16px;font-weight:900;color:var(--ffp-text);margin:26px 0 2px;}.sc-day:first-child{margin-top:8px;}',
      '.sc-day .tz{margin-left:9px;font-size:11px;font-weight:700;color:#9aa8b4;}',
      '.sc-ch{display:flex;align-items:center;gap:11px;padding:10px 14px;border-radius:9px;margin:12px 0 0;background:linear-gradient(92deg,#12242f,#21404f);box-shadow:0 2px 8px rgba(14,37,49,.18);}',
      '.sc-ch b{font-size:13.5px;font-weight:900;color:#fff;letter-spacing:.01em;}',
      '.sc-ch .mn{font-size:10px;font-weight:900;letter-spacing:.07em;text-transform:uppercase;color:#f0b736;}',
      '.sc-ch .ct{margin-left:auto;font-size:11.5px;font-weight:700;color:rgba(255,255,255,.58);}',
      '.sc-add{display:inline-flex;align-items:center;gap:5px;border:1px solid rgba(255,255,255,.26);background:rgba(255,255,255,.12);border-radius:8px;padding:5px 10px;font:inherit;font-size:12px;font-weight:800;color:#fff;cursor:pointer;}.sc-add:hover{background:rgba(255,255,255,.2);}.sc-add .ms{font-size:16px;}',
      /* Nothing on the schedule yet is the SAME bar, marked by a gold edge and
         a gold action. The old mustard block was neither blue nor gold and
         read as a different product. */
      '.sc-ch.warn{box-shadow:inset 4px 0 0 var(--ffp-gold),0 2px 8px rgba(14,37,49,.18);}',
      /* Where an event ends. Plain rows on the canvas, not a boxed "danger
         zone": the weight comes from the wording and from red being reserved
         for the one action that cannot be undone. */
      '.lg-end{border-top:1px solid var(--ffp-border);margin-top:34px;padding-top:18px;}',
      '.lg-end .hd{font-size:11px;font-weight:900;letter-spacing:.07em;text-transform:uppercase;color:#8a99a8;margin-bottom:6px;}',
      '.lg-end .row{display:flex;align-items:flex-start;gap:16px;padding:13px 0;border-bottom:1px solid var(--ffp-border);}',
      '.lg-end .row:last-child{border-bottom:0;}',
      '.lg-end .g{flex:1;min-width:0;}',
      '.lg-end .g b{display:block;font-size:13.5px;font-weight:800;color:var(--ffp-text);}',
      '.lg-end .g span{display:block;font-size:12px;font-weight:600;color:var(--ffp-text-muted);margin-top:3px;line-height:1.55;}',
      '.lg-end .lg-btn{flex:none;margin-top:1px;}',
      '.lg-end .lg-btn:disabled{opacity:.38;cursor:default;}',
      '.lg-cover .bd.archived,.lg-cover .bd.cancelled{color:#8a99a8;}',
      '.lg-pill.archived{background:#eef2f5;color:#8a99a8;}',
      '.lg-pill.cancelled{background:#fdeaea;color:#d6353b;}',
      '.lg-archrow{margin-top:20px;}',
      '.sc-ch.warn .sc-add{background:var(--ffp-gold);border-color:var(--ffp-gold);color:#12232f;}',
      '.sc-ch.warn .sc-add:hover{background:#e0af3a;}',
      '.sc-m{display:flex;align-items:center;gap:10px;padding:9px 2px 9px 9px;border-bottom:1px solid var(--ffp-border);border-left:3px solid var(--dc,transparent);}',
      '.sc-m.open{border-bottom:0;}',
      '.sc-m .t{width:136px;flex:none;min-width:0;box-sizing:border-box;padding:7px 8px;font-size:13px;}',
      '.sc-m .tm{display:flex;align-items:center;justify-content:center;height:36px;padding:0;border-radius:10px;background:#f2f6f9;border:1px solid var(--ffp-border);color:var(--ffp-text);font-size:13.5px;font-weight:800;font-variant-numeric:tabular-nums;}',
      '.sc-m .tm.none{color:var(--ffp-text-dim);font-weight:700;font-size:12px;}',
      '.sc-m .g{flex:1;min-width:0;}',
      '.sc-m .g b{display:block;font-size:13.5px;font-weight:800;color:var(--ffp-text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      '.sc-m .g span{display:block;font-size:11.5px;font-weight:600;color:var(--ffp-text-muted);margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      '.sc-m .g span.off{color:var(--ffp-text-dim);}',
      /* Where it is played, stated rather than offered: the venue over the
         surface. Changing it is a decision, so it lives in the row menu. */
      '.sc-m .v{width:178px;flex:none;min-width:0;text-align:right;}',
      '.sc-m .v b{display:block;font-size:12.5px;font-weight:800;color:var(--ffp-text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      '.sc-m .v span{display:block;font-size:11.5px;font-weight:600;color:var(--ffp-text-muted);margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      '.sc-m .v.none b{color:var(--ffp-text-dim);font-weight:700;}',
      '.sc-ic{flex:none;border:0;background:none;padding:4px;cursor:pointer;color:#8a99a8;line-height:0;border-radius:6px;}.sc-ic:hover{background:#eef2f5;color:var(--ffp-text);}.sc-ic:disabled{opacity:.28;cursor:default;background:none;}.sc-ic .ms{font-size:19px;}',
      '.sc-more{display:flex;align-items:center;gap:9px;flex-wrap:wrap;padding:4px 2px 14px 155px;border-bottom:1px solid var(--ffp-border);}',
      /* These sit in a flex row, and .lg-in/.lg-sel are width:100% by default,
         so each one grabbed a line of its own and left a hole beside it. Fixed
         widths, min-width:0 and one shared height keep them on one line. */
      '.sc-more .lg-in,.sc-more .lg-sel{padding:7px 9px;font-size:13px;width:auto;min-width:0;flex:none;height:36px;box-sizing:border-box;}',
      '.sc-more .st-d{width:158px;}.sc-more .st-f{width:186px;}',
      '.sc-more .a-role{width:168px;}.sc-more .a-off{width:186px;}#lg-root .sc-more .st-off{width:178px;flex:none;}',
      '.sc-more .sp{flex:1;}',
      '.sc-plan{display:flex;align-items:center;flex-wrap:wrap;gap:7px;font-size:13px;font-weight:700;color:var(--ffp-text-muted);padding:2px 2px 6px;}',
      '.sc-plan .lg-in{width:64px;flex:none;min-width:0;box-sizing:border-box;padding:7px 8px;font-size:13px;}.sc-plan .lg-in.w{width:136px;}',
      '.sc-plan+.sc-plan{padding-top:0;}',
      '.sc-plan .mlen{font-weight:900;color:var(--ffp-text);}',
      '.sc-mlenb{border:0;background:none;padding:0 0 0 7px;font:inherit;font-size:12px;font-weight:800;color:var(--ffp-blue);cursor:pointer;}',
      '.sc-mlenb:hover{text-decoration:underline;}',
      '.sc-why{font-size:11.5px;font-weight:600;color:var(--ffp-text-dim);padding:0 2px 8px;}',
      '.sc-rd{font-size:11px;font-weight:900;letter-spacing:.07em;text-transform:uppercase;color:#5c6f7c;padding:14px 2px 5px;}',
      '.sc-key{display:flex;flex-wrap:wrap;gap:8px 16px;padding:4px 2px 10px;}',
      '.sc-key .k{display:inline-flex;align-items:center;gap:6px;font-size:11.5px;font-weight:800;color:var(--ffp-text-muted);}',
      '.sc-key .k i{width:10px;height:10px;border-radius:3px;background:var(--dc);display:block;}',
      '.lg-d0{--dc:#1980AD;}.lg-d1{--dc:#127a52;}.lg-d2{--dc:#c79a2e;}.lg-d3{--dc:#8e44ad;}.lg-d4{--dc:#c0392b;}',
      '.lg-d5{--dc:#2c7a7b;}.lg-d6{--dc:#b7791f;}.lg-d7{--dc:#4a5568;}.lg-d8{--dc:#2b6cb0;}.lg-d9{--dc:#9b2c2c;}',
      '.lg-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;gap:12px;flex-wrap:wrap;}',
      '.lg-h1{font-size:21px;font-weight:900;color:var(--ffp-text);} .lg-sub{font-size:13px;color:var(--ffp-text-muted);font-weight:600;margin-top:2px;}',
      '.lg-btn{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--ffp-border-mid);background:#fff;border-radius:10px;padding:9px 14px;font:inherit;font-size:13px;font-weight:800;color:var(--ffp-text);cursor:pointer;} .lg-btn .ms{font-size:18px;}',
      '.lg-btn.pri{background:var(--ffp-blue);border-color:var(--ffp-blue);color:#fff;} .lg-btn.gold{background:linear-gradient(180deg,#ffd15a,#f2a900);border:none;color:#3a2600;} .lg-btn.green{background:#12a05f;border-color:#12a05f;color:#fff;} .lg-btn.ghost{background:none;border-color:transparent;color:var(--ffp-text-muted);} .lg-btn:disabled{opacity:.5;cursor:default;}',
      '.lg-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:14px;}',
      '.lg-card{border:1px solid var(--ffp-border-mid);border-radius:14px;overflow:hidden;cursor:pointer;background:#fff;box-shadow:0 4px 12px rgba(15,34,48,.06);}',
      '#lg-root .lg-cover{height:104px;position:relative;background:linear-gradient(150deg,#2f7fa8,#0d3550) center/cover no-repeat;} .lg-cover .scr{position:absolute;inset:0;background:linear-gradient(transparent,rgba(8,18,26,.6));} .lg-cover .bd{position:absolute;top:8px;left:8px;font-size:10px;font-weight:900;padding:3px 8px;border-radius:20px;background:#fff;color:#d6353b;} .lg-cover .bd.live{background:#d6353b;color:#fff;} .lg-cover .bd.open{color:#0a8f5f;} .lg-cover .bd.draft,.lg-cover .bd.final{color:#5b6b75;}',
      '.lg-cbody{padding:11px 13px;} .lg-cbody b{font-size:14.5px;font-weight:900;color:var(--ffp-text);display:block;} .lg-cbody span{font-size:12px;color:var(--ffp-text-muted);font-weight:700;text-transform:capitalize;}',
      '.lg-new{border:2px dashed var(--ffp-border-mid);border-radius:14px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;min-height:168px;color:var(--ffp-blue);font-weight:800;cursor:pointer;background:#fff;} .lg-new .ms{font-size:28px;}',
      '.lg-nav{display:flex;gap:22px;border-bottom:1px solid var(--ffp-border);margin-bottom:20px;flex-wrap:wrap;} .lg-nav button{background:none;border:none;font:inherit;font-size:13.5px;font-weight:800;color:var(--ffp-text-muted);padding:11px 0;border-bottom:2.5px solid transparent;cursor:pointer;} .lg-nav button.on{color:var(--ffp-blue);border-bottom-color:var(--ffp-blue);}',
      '.lg-pill{font-size:11px;font-weight:800;padding:3px 10px;border-radius:20px;margin-left:8px;vertical-align:middle;} .lg-pill.live{background:#fdeaea;color:#d6353b;} .lg-pill.open{background:#e3f6ec;color:#0a8f5f;} .lg-pill.draft,.lg-pill.final{background:#eef2f5;color:#5b6b75;}',
      '.lg-lab{font-size:12px;font-weight:800;color:#43525c;margin:0 0 6px;} .lg-in,.lg-sel{width:100%;padding:10px 12px;border:1px solid #d7dee5;border-radius:10px;font:inherit;box-sizing:border-box;background:#fff;color:#12232f;} .lg-fld{margin-bottom:16px;} .lg-2{display:grid;grid-template-columns:1fr 1fr;gap:14px;} .lg-3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;}',
      '.lg-seg{display:inline-flex;border:1.5px solid var(--ffp-border-mid);border-radius:10px;overflow:hidden;} .lg-seg button{background:#fff;border:none;padding:9px 15px;font:inherit;font-size:12.5px;font-weight:800;color:var(--ffp-text-muted);cursor:pointer;} .lg-seg button.on{background:var(--ffp-blue);color:#fff;} .lg-status4 button{padding:9px 18px;} .lg-status4 button.on.st-draft{background:#6a7c8a;color:#fff;} .lg-status4 button.on.st-open{background:#1980AD;color:#fff;} .lg-status4 button.on.st-live{background:#1c9d54;color:#fff;} .lg-status4 button.on.st-final{background:#e0a400;color:#2a2200;} .lg-cfm{position:fixed;inset:0;z-index:9999;background:#fff;display:flex;} .lg-cfm-in{margin:auto;max-width:460px;width:100%;padding:34px 30px;text-align:center;display:flex;flex-direction:column;align-items:center;} .lg-cfm-ic{font-size:60px;margin-bottom:14px;} .lg-cfm-ic.tone-live{color:#1c9d54;} .lg-cfm-ic.tone-final{color:#e0a400;} .lg-cfm-ic.tone-draft{color:#6a7c8a;} .lg-cfm-t{font-size:24px;font-weight:900;color:#12232f;} .lg-cfm-b{font-size:14.5px;font-weight:600;color:#5a6b78;line-height:1.55;margin-top:12px;} .lg-cfm-a{display:flex;gap:12px;margin-top:28px;width:100%;} .lg-cfm-a .lg-btn{flex:1;justify-content:center;} .lg-cfm-a .lg-btn.st-live{background:#1c9d54;color:#fff;} .lg-cfm-a .lg-btn.st-final{background:#e0a400;color:#2a2200;} .lg-cfm-a .lg-btn.st-draft{background:#6a7c8a;color:#fff;}',
      '.lg-row{display:flex;align-items:center;gap:12px;padding:13px 2px;border-bottom:1px solid var(--ffp-border);} .lg-row .drag{color:#c0cad2;font-size:20px;cursor:grab;} .lg-row .g{flex:1;min-width:0;} .lg-row .g b{font-size:14.5px;font-weight:800;color:var(--ffp-text);} .lg-row .g span{font-size:12.5px;color:var(--ffp-text-muted);font-weight:700;} #lg-root .lg-row .act{color:#9aa8b4;font-size:20px;cursor:pointer;padding:4px;} .lg-row .act:hover{color:var(--ffp-blue);}',
      '.lg-av{position:relative;width:34px;height:34px;border-radius:8px;flex:none;background:#e7ecef center/cover no-repeat;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:900;color:#6a7681;}',
      '.lg-avedit{cursor:pointer;}',
      '.lg-avplus{position:absolute;right:-5px;bottom:-5px;width:17px;height:17px;border-radius:50%;background:var(--ffp-blue,#2ba8e0);color:#fff;font-size:12px;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 3px rgba(0,0,0,.3);border:1.5px solid #fff;}',
      '.lg-empty{padding:40px 16px;text-align:center;color:var(--ffp-text-muted);font-weight:600;font-size:13.5px;}',
      '.lg-tool{display:flex;align-items:center;gap:12px;margin-bottom:16px;flex-wrap:wrap;} .lg-tool .lg-sel{width:auto;min-width:180px;} .lg-tool .sp{flex:1;}',
      '.lg-edit{display:flex;align-items:center;gap:10px;padding:12px 2px;border-bottom:1px solid var(--ffp-border);flex-wrap:wrap;} .lg-edit .lg-in{width:auto;flex:1;min-width:160px;}',
      '.lg-entform{align-items:flex-end;gap:12px;padding:16px 2px;} .lg-entform .crest{align-self:flex-end;padding-bottom:5px;} .lg-entform .f{display:flex;flex-direction:column;gap:5px;min-width:0;} #lg-root .lg-entform .f label{height:14px;line-height:14px;} .lg-entform .f label{font-size:11px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:#7c8b97;} .lg-entform .f.gr{flex:1 1 200px;} #lg-root .lg-entform .f.sm{flex:0 0 84px;} .lg-entform .f .lg-in,.lg-entform .f .lg-sel{width:100%;min-width:0;max-width:100%;flex:none;box-sizing:border-box;height:44px;padding:0 12px;line-height:44px;} .lg-entform .f .lg-in{-webkit-appearance:none;appearance:none;} .lg-entform .f input[type=number]{-moz-appearance:textfield;} .lg-entform .f input[type=number]::-webkit-outer-spin-button,.lg-entform .f input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none;margin:0;} .lg-entform .f .ro{height:44px;display:flex;align-items:center;font-size:14.5px;font-weight:800;color:var(--ffp-text);} .lg-entform .acts{display:flex;align-items:center;gap:9px;flex:1 1 100%;margin-top:4px;} .lg-entform .acts .sp{flex:1;} .lg-entform .lg-btn.danger{color:#c0392b;} .lg-entform .lg-btn.danger:hover{background:#fdf1ef;} .lg-entform .lg-btn.danger.solid{background:#c0392b;border-color:#c0392b;color:#fff;} .lg-entform .delq{font-size:13px;font-weight:800;color:var(--ffp-text);} .lg-entform .note{flex:1 1 100%;font-size:12.5px;font-weight:600;color:#7c8b97;margin-top:2px;} .lg-entform .msg{flex:1 1 100%;font-size:12.5px;font-weight:700;color:#c0392b;} @media(max-width:760px){.lg-entform .f.gr,.lg-entform .f{flex:1 1 100%;}}',
      '.lg-fx{display:grid;grid-template-columns:1fr 128px 1fr;align-items:center;gap:8px;padding:11px 2px;border-bottom:1px solid var(--ffp-border);} .lg-fx .t{font-size:13.5px;font-weight:800;color:var(--ffp-text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;} .lg-fx .t.a{text-align:right;} .lg-fx .sc{display:flex;gap:6px;justify-content:center;} .lg-fx .sc input{width:46px;padding:8px;border:1.5px solid #d7dee5;border-radius:8px;font:inherit;font-weight:800;text-align:center;}',
      '.lg-rndlab{font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.4px;color:var(--ffp-text-muted);margin:16px 0 4px;}',
      '.lg-tb{display:grid;grid-template-columns:26px 1fr 30px 30px 30px 44px 40px;align-items:center;gap:6px;padding:10px 6px;border-bottom:1px solid var(--ffp-border);font-size:13px;} .lg-tb span{text-align:center;} .lg-tb .nm{text-align:left;font-weight:800;} .lg-tb.head{font-size:10px;font-weight:800;text-transform:uppercase;color:var(--ffp-text-muted);} .lg-tb .pts{font-weight:900;color:var(--ffp-blue);}',
      '.lg-brand{display:flex;gap:12px;align-items:stretch;} .lg-logo{width:76px;height:76px;flex:none;border-radius:12px;border:1.5px dashed #d7dee5;background:#f7f9fb center/cover no-repeat;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;color:#9aa8b4;cursor:pointer;font-size:10px;font-weight:800;} .lg-logo .ms{font-size:22px;} .lg-banner{flex:1;height:76px;border-radius:12px;border:1.5px dashed #d7dee5;background:#f7f9fb center/cover no-repeat;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;color:#9aa8b4;cursor:pointer;font-size:11px;font-weight:800;} .lg-banner .ms{font-size:22px;} .lg-row .act{margin-left:auto;color:#9aa8b4;font-size:19px;cursor:pointer;} .lg-banner16{width:100%;max-width:520px;aspect-ratio:16/9;border-radius:12px;border:1.5px dashed #d7dee5;background:#f7f9fb center/cover no-repeat;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;color:#9aa8b4;cursor:pointer;font-size:12px;font-weight:800;} .lg-banner16 .ms{font-size:28px;} .lg-offadd{display:flex;flex-direction:column;gap:10px;margin-bottom:14px;} .lg-offsrch{position:relative;} .lg-offres{margin-top:6px;display:flex;flex-direction:column;gap:4px;} .lg-offopt{display:flex;align-items:center;gap:10px;width:100%;text-align:left;border:1px solid #e6ecf1;background:#fff;border-radius:11px;padding:8px 11px;cursor:pointer;} .lg-offopt .av{width:34px;height:34px;border-radius:8px;flex:none;background:#e7ecef center/cover no-repeat;} .lg-offopt .g{flex:1;min-width:0;} .lg-offopt .g b{font-size:14px;font-weight:800;color:#12232f;display:block;} .lg-offopt .g span{font-size:11.5px;color:#7c8b97;font-weight:600;} .lg-offopt .pk{font-size:12px;font-weight:800;color:#1980AD;} .lg-offnone{font-size:12.5px;color:#7c8b97;font-weight:600;padding:8px 4px;} .lg-offpicked{display:flex;align-items:center;gap:6px;font-size:13px;font-weight:800;color:#0a8f5f;padding:6px 4px;} .lg-offrow{display:flex;gap:10px;align-items:center;flex-wrap:wrap;} .og-sec{padding:2px 0 16px;border-bottom:1px solid var(--ffp-border);margin-bottom:16px;} .og-hd{display:flex;align-items:flex-start;gap:11px;margin-bottom:12px;} .og-hd>.ms{font-size:21px;color:var(--ffp-purple,#0a3e44);opacity:.75;flex:none;margin-top:1px;} .og-hd .t{flex:1;min-width:0;} .og-hd .t b{display:block;font-size:15px;font-weight:900;color:var(--ffp-text);} .og-hd .t span{display:block;margin-top:3px;font-size:12.5px;font-weight:600;color:var(--ffp-text-muted);line-height:1.5;} .og-pool{display:flex;flex-wrap:wrap;gap:8px;} .og-chip{display:inline-flex;align-items:center;gap:8px;padding:5px 11px 5px 5px;border:1px solid var(--ffp-border-mid);border-radius:999px;font-size:13px;font-weight:800;} .og-chip.noacct{border-style:dashed;} .og-chip .lg-av{width:26px;height:26px;font-size:10px;} .og-chip em{font-style:normal;font-size:17px;color:#9aa8b4;cursor:pointer;} .og-chip em:hover{color:var(--ffp-blue);} .og-foot{margin-top:11px;font-size:12px;font-weight:600;color:var(--ffp-text-muted);} .og-crewwrap{background:var(--ffp-bg-3,#eef3f4);border-radius:14px;padding:16px 18px;} .og-lead{display:flex;align-items:flex-start;gap:11px;margin-bottom:6px;} .og-lead>.ms{font-size:21px;color:var(--ffp-purple,#0a3e44);opacity:.75;flex:none;margin-top:1px;} .og-lead b{display:block;font-size:15px;font-weight:900;} .og-lead span{display:block;margin-top:3px;font-size:12.5px;font-weight:600;color:var(--ffp-text-muted);line-height:1.5;} .og-crew{margin-top:16px;padding-top:14px;border-top:1px solid var(--ffp-border-mid);} .og-crew:first-of-type{border-top:none;padding-top:4px;} .og-ch{display:flex;align-items:center;gap:9px;margin-bottom:6px;} .og-ch b{font-size:12px;font-weight:900;letter-spacing:.13em;text-transform:uppercase;} .og-ch .og-app{font-size:12px;font-weight:700;color:var(--ffp-text-muted);}/* NOT .app: the dashboard shell owns .app{display:flex;height:100vh} as its ROOT layout, so a label wearing that class was 100vh tall and blew the crew header apart. */ .og-ch .sp{flex:1;} .og-note{display:flex;gap:8px;align-items:flex-start;font-size:12px;font-weight:600;color:var(--ffp-text-muted);line-height:1.5;padding:2px 2px 0;} .og-note .ms{font-size:16px;flex:none;opacity:.6;} #lg-root .og-acc{max-width:190px;flex:none;} #lg-root .og-acc.on{border-color:var(--ffp-blue);background:#f2f8fb;color:#1b5f85;} .og-pick{margin:0 0 12px 46px;padding:12px 14px;border-left:2px solid var(--ffp-yellow,#FFCC00);background:#fff;border-radius:0 10px 10px 0;} .og-pickh{font-size:13px;font-weight:900;margin-bottom:8px;} .og-pl{font-size:10px;font-weight:900;letter-spacing:.14em;text-transform:uppercase;color:var(--ffp-text-dim);margin:10px 0 4px;} .og-opt{display:flex;align-items:center;gap:10px;padding:7px 2px;border-bottom:1px solid #eef2f5;font-size:13px;font-weight:700;cursor:pointer;} .og-opt:last-of-type{border-bottom:none;} .og-opt input{width:17px;height:17px;flex:none;margin:0;} .og-opt span{flex:1;min-width:0;} .og-opt em{font-style:normal;font-size:11.5px;font-weight:700;color:var(--ffp-text-muted);} .og-pickb{display:flex;gap:9px;margin-top:12px;} .og-crew .lg-row .g b{display:block;} .og-crew .lg-row .g span{display:block;margin-top:1px;} .lg-pdf{display:flex;align-items:center;gap:12px;margin-top:10px;padding:12px 2px;border-top:1px solid var(--ffp-border);} .lg-pdf>.ms{font-size:22px;color:#9aa8b4;flex:none;} .lg-pdf.has>.ms{color:var(--ffp-blue);} .lg-pdf .g{flex:1;min-width:0;} .lg-pdf .g b{display:block;font-size:14px;font-weight:800;color:var(--ffp-text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;} .lg-pdf .g span{display:block;margin-top:2px;font-size:12px;font-weight:600;color:var(--ffp-text-muted);} .lg-pdf .lg-btn{flex:none;text-decoration:none;} #lg-root .lg-pdf .x{flex:none;font-size:20px;color:#9aa8b4;cursor:pointer;padding:4px;} #lg-root .lg-pdf .x:hover{color:#c0392b;} .lg-cfm-in.rb-wide{max-width:560px;text-align:left;align-items:stretch;} .rb-t{font-size:23px;font-weight:900;color:#12232f;} .rb-lead{font-size:13.5px;font-weight:600;color:var(--ffp-text-muted);line-height:1.55;margin:10px 0 20px;} #lg-root .rb-dv{width:auto;min-width:200px;margin:0 0 18px;} .rb-ch{display:flex;align-items:flex-start;gap:15px;width:100%;text-align:left;padding:17px 4px;border:none;border-top:1px solid var(--ffp-border);background:none;font:inherit;cursor:pointer;} .rb-ch:last-of-type{border-bottom:1px solid var(--ffp-border);} .rb-ch>.ms{font-size:24px;color:var(--ffp-blue);flex:none;margin-top:1px;} .rb-ch .g{flex:1;min-width:0;} .rb-ch .g b{display:block;font-size:15.5px;font-weight:900;color:var(--ffp-text);} .rb-ch .g span{display:block;margin-top:4px;font-size:13px;font-weight:600;color:var(--ffp-text-muted);line-height:1.5;} .rb-ch .g em{display:block;margin-top:7px;font-style:normal;font-size:12.5px;font-weight:800;color:var(--ffp-gold,#c79a2e);} .rb-ch>.go{font-size:20px;color:#b9c6cb;flex:none;align-self:center;} .rb-ch:hover:not(.off){background:#f7fafb;} .rb-ch.off{cursor:not-allowed;} .rb-ch.off>.ms,.rb-ch.off .g b{color:#a8b6bb;} .rb-ch.off .g span{color:#b3c0c5;} .rb-ch.off .g em{color:#8b9a9f;font-weight:700;} .rb-ch.off>.go{visibility:hidden;} .rb-a{display:flex;gap:12px;margin-top:28px;width:100%;} .rb-a.one .lg-btn{flex:none;} .rb-a .lg-btn{flex:1;justify-content:center;} .rb-by{display:flex;align-items:center;gap:14px;padding:11px 4px;border-top:1px solid var(--ffp-border);} .rb-by:last-of-type{border-bottom:1px solid var(--ffp-border);} .rb-by .r{width:92px;flex:none;font-size:13px;font-weight:900;color:var(--ffp-text);} .rb-by .d{flex:none;width:118px;font-size:12px;font-weight:700;color:var(--ffp-text-dim);} #lg-root .rb-by .lg-sel{flex:1;min-width:0;height:42px;padding:0 12px;font-size:14px;} .rb-by.lock{opacity:.55;} #lg-root .rb-by.lock .lg-sel{background:#f2f5f6;color:#6d8088;} .rb-by .pl{flex:none;width:58px;text-align:right;font-size:11px;font-weight:900;letter-spacing:.09em;text-transform:uppercase;color:var(--ffp-gold,#c79a2e);} .rb-note{display:flex;gap:9px;align-items:flex-start;margin-top:16px;font-size:12.5px;font-weight:600;color:var(--ffp-text-muted);line-height:1.55;} .rb-note .ms{font-size:17px;flex:none;opacity:.6;color:var(--ffp-blue);} .rb-kept{display:flex;gap:9px;align-items:flex-start;margin-top:18px;padding-top:16px;border-top:1px solid var(--ffp-border);font-size:13px;font-weight:700;color:#3d4f56;line-height:1.5;text-align:left;} .rb-kept .ms{font-size:19px;flex:none;color:var(--ffp-gold,#c79a2e);}',
      '.og-mgr .og-team{flex:none;display:inline-flex;align-items:center;gap:6px;max-width:210px; background:#eef4f8;border:1px solid #d9e4ec;border-radius:9px;padding:6px 10px; font-size:12.5px;font-weight:800;color:#17789f;} .og-mgr .og-team .ms{font-size:16px;flex:none;} .og-mgr .og-team b{font-weight:800;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;} .og-mgr .og-two{display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;} .og-mgr .og-two .f{flex:1 1 220px;min-width:0;display:flex;flex-direction:column;gap:5px;} .og-mgr .og-two .f label{font-size:11px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:#7c8b97;} .og-mgr .og-two .f .lg-in,.og-mgr .og-two .f .lg-sel{width:100%;min-width:0;flex:none;box-sizing:border-box;height:44px;padding:0 12px;} .og-mgr .og-two .lg-btn{flex:none;height:44px;} .og-mgr .og-note{display:flex;align-items:flex-start;gap:8px;margin-top:12px;font-size:12px; font-weight:700;color:#5c6f7c;line-height:1.5;} .og-mgr .og-note .ms{font-size:17px;color:#17789f;flex:none;margin-top:1px;} .og-mgr .lg-row .g{flex:1;min-width:0;} .og-mgr .lg-row .g b{display:block;font-size:14px;font-weight:800;color:#12232f; overflow:hidden;text-overflow:ellipsis;white-space:nowrap;} .og-mgr .lg-row .g span{display:block;font-size:12px;font-weight:600;color:#7c8b97;margin-top:2px; overflow:hidden;text-overflow:ellipsis;white-space:nowrap;} .og-mgr .og-team{max-width:none;} .og-mgr .og-team b{max-width:300px;} .og-mgr .og-two{align-items:flex-start;} .og-mgr .og-two .lg-btn{margin-top:22px;} @media(max-width:720px){.og-mgr .lg-row{flex-wrap:wrap;} .og-mgr .og-team{order:3;margin-left:46px;}}',
      '.lg-fldbar{display:flex;gap:10px;flex-wrap:wrap;align-items:center;} .lg-fldchip{display:inline-flex;align-items:center;gap:7px;border:1px solid var(--ffp-border-mid);border-radius:12px;padding:7px 11px;font-size:12.5px;font-weight:800;} .lg-fldchip .t{color:var(--ffp-text-muted);font-weight:700;} .lg-fldchip .x{color:#9aa8b4;font-size:16px;cursor:pointer;} .lg-fldchip.add{border-style:dashed;gap:4px;}',
      '.lg-srow{display:grid;grid-template-columns:1fr 132px 92px 120px 140px;gap:9px;align-items:center;padding:10px 2px;border-bottom:1px solid var(--ffp-border);} .lg-srow .mt{font-size:13.5px;font-weight:800;color:var(--ffp-text);min-width:0;} .lg-srow .mt span{display:block;font-size:11px;color:var(--ffp-text-muted);font-weight:600;} .lg-srow .lg-in,.lg-srow .lg-sel{padding:8px 9px;font-size:12.5px;width:100%;}',
      /* crest + fixtures v2 */
      '.lg-crest{width:32px;height:32px;border-radius:9px;flex:none;background:#0d3550 center/cover no-repeat;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:900;color:#fff;box-shadow:inset 0 0 0 1px rgba(0,0,0,.05),0 1px 2px rgba(0,0,0,.14);vertical-align:middle;} .lg-crest.big{width:38px;height:38px;}',
      '.lg-fx2{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:16px;padding:14px 4px;border-bottom:1px solid #f0f3f6;} .lg-fx2 .tm{display:flex;align-items:center;gap:10px;min-width:0;font-size:14.5px;font-weight:800;color:var(--ffp-text);} .lg-fx2 .tm.a{flex-direction:row-reverse;text-align:right;} .lg-fx2 .tm span:not(.lg-crest){white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      '.lg-fx2 .mid{display:flex;flex-direction:column;align-items:center;gap:4px;} .lg-fx2 .fxday{font-size:11px;font-weight:700;color:#9aa8b4;white-space:nowrap;} .lg-fx2 .sc{display:flex;align-items:center;gap:7px;} .lg-fx2 .sc input{width:46px;height:42px;text-align:center;border:1.5px solid #d7dee5;border-radius:9px;font:inherit;font-weight:800;font-size:15px;} .lg-fx2 .sc .v{font-size:12px;font-weight:800;color:#b7c2cc;}',
      /* team sheet size -- the organiser's own two numbers. The shell forces
         input{font-size:16px!important}, so the big figures need !important of
         their own or they render at the shell's size. */
      '.sz{display:flex;gap:26px;flex-wrap:wrap;align-items:flex-end;margin:4px 0 2px;} .sz .f{display:flex;flex-direction:column;gap:6px;} .sz .f>label{font-size:11px;font-weight:900;letter-spacing:.05em;text-transform:uppercase;color:#7c8b97;} #lg-root .sz .f .lg-in{width:92px;min-width:0;flex:none;box-sizing:border-box;height:44px;padding:0;text-align:center;font-size:19px!important;font-weight:900;} .sz .eq{display:flex;align-items:center;height:44px;font-size:21px;font-weight:700;color:#c0cad2;} .sz .out{display:flex;flex-direction:column;gap:2px;height:44px;justify-content:center;} .sz .out b{font-size:21px;font-weight:900;color:#12232f;line-height:1;} .sz .out span{font-size:11px;font-weight:900;letter-spacing:.05em;text-transform:uppercase;color:#7c8b97;} .sz .def{margin-left:auto;align-self:center;} .szf{display:flex;gap:9px;align-items:flex-start;margin-top:16px;padding-top:14px;border-top:1px solid var(--ffp-border);font-size:12.5px;font-weight:600;color:var(--ffp-text-muted);line-height:1.5;} .szf .ms{font-size:17px;flex:none;color:var(--ffp-gold,#c79a2e);}',
      /* bye */
      '.lg-bye{display:flex;align-items:center;gap:11px;padding:13px 4px;border-bottom:1px solid #f0f3f6;} .lg-bye b{font-size:14px;font-weight:800;} .lg-bye .lg-crest{opacity:.5;} .lg-bye .tag{font-size:10px;font-weight:900;letter-spacing:.09em;color:#a86a08;background:#fff4e0;padding:4px 10px;border-radius:20px;} .lg-bye .msg{font-size:12.5px;color:#9aa8b4;font-weight:600;}',
      /* collapsible round header */
      '.lg-rnd{display:flex;align-items:center;gap:12px;margin:20px 0 2px;padding:12px 14px;background:linear-gradient(180deg,#f7fafc,#eef4f8);border:1px solid #e4edf3;border-radius:12px;cursor:pointer;user-select:none;} .lg-rnd:hover{background:linear-gradient(180deg,#f2f8fb,#e7f1f7);} .lg-rnd .chev{color:var(--ffp-blue);font-size:22px;transition:transform .2s;} .lg-rnd.collapsed .chev{transform:rotate(-90deg);} .lg-rnd .rt{font-size:14px;font-weight:900;color:var(--ffp-text);} .lg-rnd .rc{font-size:11px;font-weight:800;color:var(--ffp-blue);background:#e2eff6;padding:3px 10px;border-radius:20px;} .lg-rnd .rd{font-size:12px;font-weight:600;color:var(--ffp-text-muted);} .lg-rnd .sp{flex:1;} .lg-rbody.hidden{display:none;}',
      /* venues */
      '.lg-venue{padding:18px 4px;border-bottom:1px solid var(--ffp-border);} .lg-vh{display:flex;align-items:center;gap:12px;} .lg-vpin{width:38px;height:38px;border-radius:11px;background:linear-gradient(180deg,#eaf4f9,#dcecf3);color:var(--ffp-blue);display:flex;align-items:center;justify-content:center;flex:none;} .lg-vpin .ms{font-size:21px;} .lg-vh .g{flex:1;min-width:0;} .lg-vh .g b{font-size:16px;font-weight:900;color:var(--ffp-text);} .lg-vh .g span{display:block;font-size:12.5px;color:var(--ffp-text-muted);font-weight:700;} .lg-vh .act{color:#9aa8b4;font-size:19px;cursor:pointer;padding:5px;border-radius:8px;} .lg-vh .act:hover{color:var(--ffp-blue);background:#f4f7f9;}',
      '.lg-scrbtn{display:inline-flex;align-items:center;gap:6px;border:1.5px solid #cfe0ea;background:#f5fafc;color:var(--ffp-blue);border-radius:9px;padding:5px 10px;font:inherit;font-size:12px;font-weight:900;letter-spacing:.06em;cursor:pointer;margin-right:10px;} .lg-scrbtn .ms{font-size:16px;} .lg-scrbtn.perm{border-color:#f2c14e;background:#fffaf0;color:#9a6b00;} .lg-vclink{width:230px!important;min-width:0;flex:none;margin-left:auto;height:36px!important;padding:0 30px 0 10px!important;font-size:16px!important;margin-right:10px;box-sizing:border-box;} .lg-scr{max-width:520px;} .lg-scrlab{font-size:12.5px;font-weight:800;color:#7c8b97;margin-top:16px;} .lg-scrurl{font-size:26px;font-weight:900;color:#12232f;letter-spacing:-.4px;margin-top:6px;word-break:break-all;} .lg-scrurl.gfx{font-size:19px;letter-spacing:-.2px;} .lg-scrnote{font-size:12px;font-weight:600;color:#9aa8b4;margin-top:10px;} .lg-scrsteps{text-align:left;margin-top:20px;display:flex;flex-direction:column;gap:11px;width:100%;} .lg-scrsteps div{display:flex;gap:11px;align-items:flex-start;font-size:13.5px;font-weight:600;color:#43525c;line-height:1.5;} .lg-scrsteps b{flex:none;width:22px;height:22px;border-radius:50%;background:var(--ffp-blue);color:#fff;font-size:12px;display:flex;align-items:center;justify-content:center;}',
      '.lg-surfs{margin:12px 0 0 51px;position:relative;} .lg-surfs:before{content:"";position:absolute;left:-13px;top:2px;bottom:18px;width:1.5px;background:#e4edf3;} .lg-surf{display:flex;align-items:center;gap:10px;padding:10px 0;font-size:14px;font-weight:600;border-bottom:1px solid #f4f7f9;} .lg-surf .ms{color:var(--ffp-blue);font-size:18px;opacity:.85;} .lg-surf .x{color:#c0cad2;cursor:pointer;font-size:18px;} .lg-surf .x:hover{color:#d64545;} .lg-addsurf{margin:12px 0 0 51px;} .lg-btn.ghostb{color:var(--ffp-blue);border-color:#d4e6ef;background:#f5fafc;} .lg-maplink{display:inline-flex;align-items:center;gap:3px;color:var(--ffp-blue);font-weight:800;text-decoration:none;} .lg-maplink .ms{font-size:15px;vertical-align:-3px;}',
      /* schedule v2 */
      '.lg-srow2{display:grid;grid-template-columns:1.2fr 1fr;gap:22px;align-items:start;padding:16px 4px;border-bottom:1px solid var(--ffp-border);} .lg-srow2 .s-match b{font-size:15px;font-weight:800;} .lg-srow2 .s-match small{display:block;font-size:11px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#9aa8b4;margin-top:3px;} .lg-srow2 .s-when{display:flex;gap:8px;margin-top:11px;} .lg-srow2 .s-when .lg-in{padding:8px 9px;font-size:13px;} .lg-srow2 .s-right{display:flex;flex-direction:column;gap:9px;} .lg-srow2 .fl{font-size:11px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#9aa8b4;} .lg-srow2 .st-f{padding:9px 10px;font-size:13px;}',
      '.lg-offlist{display:flex;flex-direction:column;gap:6px;} .lg-offtag{display:flex;align-items:center;gap:9px;font-size:13px;padding:7px 10px;border:1px solid var(--ffp-border-mid);border-radius:9px;background:#fbfcfd;} .lg-offtag .role{font-size:10px;font-weight:900;letter-spacing:.05em;text-transform:uppercase;color:var(--ffp-blue);} .lg-offtag .nm{font-weight:700;} .lg-offtag .sp{flex:1;} .lg-offtag .x{color:#c0cad2;cursor:pointer;font-size:16px;} .lg-assign{display:flex;gap:7px;align-items:center;} .lg-assign .lg-sel{padding:7px 9px;font-size:12.5px;flex:1;} .lg-btn.sm{padding:7px 11px;font-size:12px;}',
      '.lg-scpill{display:inline-block;font-size:9px;font-weight:900;letter-spacing:.05em;color:#0a8f5f;background:#e3f6ec;padding:2px 7px;border-radius:20px;vertical-align:middle;margin-left:6px;} .lg-scpill.inv{color:#8a6d00;background:#fff4d6;} .lg-scpill.txt{color:#5b6b75;background:#eef2f5;} .lg-ocap{max-width:180px;padding:7px 9px;font-size:12.5px;}',
      '.lg-sq{background:#f7fafc;border:1px solid #e4edf3;border-radius:12px;padding:12px 14px;margin:0 0 12px 46px;} .lg-sqsrch{display:flex;align-items:center;gap:8px;border:1.5px solid #d7dee5;background:#fff;border-radius:10px;padding:9px 12px;} .lg-sqsrch .ms{color:#9aa8b4;font-size:19px;} .lg-sqsrch input{border:none;outline:none;font:inherit;font-weight:600;font-size:13.5px;flex:1;background:none;} .lg-sqres{background:#fff;border:1px solid #eef2f5;border-radius:10px;margin-top:8px;padding:2px 12px;} .lg-sqres .row{display:flex;align-items:center;gap:10px;padding:8px 2px;border-bottom:1px solid #f2f5f7;} .lg-sqres .row:last-child{border-bottom:none;} .lg-sqres .av{width:32px;height:32px;border-radius:50%;background:#dfe7ec center/cover no-repeat;flex:none;} .lg-sqres .g{flex:1;min-width:0;} .lg-sqres .g b{font-size:13.5px;font-weight:800;display:block;} .lg-sqres .g span{font-size:11px;color:#8a99a6;font-weight:600;} .lg-sqhint{margin-top:10px;font-size:10.5px;font-weight:900;letter-spacing:.1em;text-transform:uppercase;color:#8a99a6;} .lg-sqadd2{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;} .lg-sqlist{margin-top:8px;} .lg-sqrow{display:flex;align-items:center;gap:8px;padding:9px 2px;border-bottom:1px solid #f0f3f6;font-size:13.5px;font-weight:700;} .lg-sqrow:last-child{border-bottom:none;} .lg-sqrow .sp{flex:1;} .lg-sqrow .x{color:#c0cad2;cursor:pointer;font-size:17px;} .lg-sqno{width:62px;padding:5px 6px;font-size:12.5px;flex:none;} .lg-sqpos{max-width:168px;padding:5px 7px;font-size:12px;} .lg-sqpos.fixed{border:none;background:none;color:#5b6b75;font-size:11.5px;font-weight:800;letter-spacing:.03em;text-transform:uppercase;padding:0 4px;} .lg-sqcap{width:26px;height:26px;border-radius:50%;border:1.5px solid #d7dee5;color:#9aa8b4;font-size:12px;font-weight:900;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;flex:none;} .lg-sqcap.on{background:#F2A900;border-color:#F2A900;color:#12212c;} .lg-sqph{position:relative;width:34px;height:44px;border-radius:7px 7px 3px 3px;background:#e6edf2 center/cover no-repeat;border:1.5px solid #d7dee5;flex:none;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;} .lg-sqph .ms{font-size:16px;color:#9aa8b4;} .lg-sqph.own{border-color:#F2A900;} .lg-sqph .x{position:absolute;top:-6px;right:-6px;width:17px;height:17px;border-radius:50%;background:#0b2136;color:#fff;font-size:12px;font-style:normal;line-height:17px;text-align:center;} .lg-gfx{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:10px 0 0;max-width:660px;padding:12px 14px;border:1px solid #e4edf3;border-radius:12px;background:#f7fafc;} .lg-gfx > .ms{color:#F2A900;font-size:22px;} .lg-gfx .g{flex:1;min-width:200px;} .lg-gfx .g b{display:block;font-size:13.5px;font-weight:800;} .lg-gfx .g span{font-size:11.5px;color:#8a99a6;font-weight:600;} .lg-tsheet .tabs{display:flex;gap:8px;align-items:center;margin:4px 0 0;} .lg-tsheet .tabs button{padding:9px 14px;border:1.5px solid #d7dee5;border-radius:9px;background:#fff;font:inherit;font-size:12.5px;font-weight:800;color:#0b2136;cursor:pointer;} .lg-tsheet .tabs button.on{background:#0b2136;border-color:#0b2136;color:#fff;} .lg-tsheet .tabs .count{margin-left:auto;font-size:11.5px;font-weight:800;color:#8a99a6;} .lg-tsheet .grid{margin-top:8px;border:1px solid #e4edf3;border-radius:12px;overflow:hidden;} .lg-tsheet .hd{padding:9px 14px;background:#f2f6fa;font-size:10.5px;font-weight:900;letter-spacing:.12em;text-transform:uppercase;color:#5b6b75;border-bottom:1px solid #e4edf3;} .lg-tsheet .row{display:flex;align-items:center;gap:10px;padding:8px 14px;border-bottom:1px solid #f0f3f6;} .lg-tsheet .row:last-child{border-bottom:none;} .lg-tsheet .row .no{width:30px;height:30px;flex:none;display:flex;align-items:center;justify-content:center;border-radius:7px;background:#eef2f5;color:#5b6b75;font-size:13px;font-weight:900;} .lg-tsheet .row.on .no{background:#0b2136;color:#fff;} .lg-tsheet .row .pos{width:150px;flex:none;font-size:11.5px;font-weight:800;letter-spacing:.03em;text-transform:uppercase;color:#5b6b75;} .lg-tsheet .row .pl{flex:1;min-width:0;padding:7px 9px;font-size:13px;} .lg-tsheet .row .cov{width:150px;flex:none;padding:7px 9px;font-size:11.5px;} .lg-tsheet .row .cap{width:26px;height:26px;flex:none;border-radius:50%;border:1.5px solid #d7dee5;color:#9aa8b4;font-size:12px;font-weight:900;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;} .lg-tsheet .row .cap.on{background:#F2A900;border-color:#F2A900;color:#12212c;} .lg-hex{display:flex;gap:6px;align-items:center;} .lg-hex .sw{width:38px;height:38px;flex:none;padding:2px;border:1.5px solid #d7dee5;border-radius:8px;background:#fff;cursor:pointer;} .lg-hex .lg-in{flex:1;min-width:0;text-transform:uppercase;} .lg-info{margin:10px 0 0;} .lg-info summary{display:inline-flex;align-items:center;gap:7px;padding:6px 12px 6px 9px;border:1px solid #dbe3ea;border-radius:20px;background:#fff;font-size:12.5px;font-weight:800;color:#41637f;cursor:pointer;list-style:none;} .lg-info summary::-webkit-details-marker{display:none;} .lg-info summary .ms{font-size:17px;color:#1980AD;} .lg-info[open] summary{background:#eaf4fa;border-color:#bcdcec;} .lg-info p{margin:8px 0 0;padding:12px 14px;border-radius:12px;background:#eaf4fa;font-size:12.5px;line-height:1.55;font-weight:600;color:#2c5570;} .lg-tsheet .coach{display:flex;align-items:center;gap:10px;margin:10px 0 0;} .lg-tsheet .coach label{font-size:10.5px;font-weight:900;letter-spacing:.12em;text-transform:uppercase;color:#5b6b75;width:56px;flex:none;} .lg-tsheet .coach .lg-in{flex:1;max-width:320px;}',
      '.lg-maed{background:#f7fafc;border:1px solid #e4edf3;border-radius:12px;padding:14px 16px;margin-bottom:14px;} .lg-maed .ttl{font-size:11px;font-weight:900;letter-spacing:.06em;text-transform:uppercase;color:#8a99a6;margin-bottom:12px;} .lg-maed .fe-byetog{display:inline-flex;align-items:center;gap:8px;font-size:13px;font-weight:700;color:#43525c;cursor:pointer;} .lg-maed .fe-byetog input{width:16px;height:16px;}',
      '.edrow{display:flex;align-items:center;gap:10px;flex-wrap:wrap;} .edrow .lg-sel{flex:1;min-width:150px;} .edrow .vv{font-weight:800;color:#8a99a6;} .edrow2{display:flex;align-items:flex-end;gap:10px;flex-wrap:wrap;margin-top:11px;} .edrow2 .f{display:flex;flex-direction:column;gap:5px;} .edrow2 .f label{font-size:11px;font-weight:800;color:#43525c;} .edrow2 .f .lg-in,.edrow2 .f .lg-sel{padding:8px 10px;font-size:13px;} .edfoot{display:flex;align-items:center;gap:10px;margin-top:14px;} .edfoot .sp{flex:1;}',
      /* match centre + per-fixture actions */
      '.lg-fx2{grid-template-columns:1fr auto 1fr auto;} .lg-fx2 .acts{display:flex;align-items:center;gap:0;} .lg-mcbtn{border:none;background:none;color:#9aa8b4;cursor:pointer;padding:4px;border-radius:8px;} .lg-mcbtn:hover{color:var(--ffp-blue);background:#f4f7f9;} .lg-mcbtn.del:hover{color:var(--ffp-red);background:#fdeff0;} .lg-mcbtn .ms{font-size:20px;} .lg-bye .acts{margin-left:auto;display:flex;align-items:center;}',
      '.lg-mchd{display:flex;align-items:center;justify-content:center;gap:16px;padding:16px 4px;border-bottom:1px solid var(--ffp-border);} .lg-mchd .tm{display:flex;align-items:center;gap:9px;font-size:15px;font-weight:800;} .lg-mchd .tm.a{flex-direction:row-reverse;} .lg-mchd .scr{font-size:26px;font-weight:900;color:var(--ffp-text);min-width:80px;text-align:center;}',
      '.lg-mcadd{display:flex;gap:8px;flex-wrap:wrap;align-items:center;padding:14px 2px;border-bottom:1px solid var(--ffp-border);} .lg-mcadd .lg-sel{width:auto;flex:1;min-width:120px;padding:8px 10px;font-size:13px;} .lg-mcadd .lg-in{padding:8px 10px;font-size:13px;}',
      '.lg-mcrow{display:flex;align-items:center;gap:10px;padding:11px 2px;border-bottom:1px solid #f0f3f6;font-size:13px;} .lg-mcrow .mn{width:34px;font-weight:800;color:#9aa8b4;} .lg-mcrow .kd{font-size:10px;font-weight:900;letter-spacing:.04em;padding:3px 8px;border-radius:6px;background:#eef2f5;color:#5b6b75;} .lg-mcrow .kd.try{background:#e3f0ff;color:#0b4a8f;} .lg-mcrow .kd.penalty,.lg-mcrow .kd.drop_goal{background:#fff1e3;color:#b45309;} .lg-mcrow .kd.yellow_card{background:#fff7d6;color:#8a6d00;} .lg-mcrow .kd.red_card{background:#ffe0e0;color:#a11111;} .lg-mcrow .pl{font-weight:700;} .lg-mcrow .tn{color:#8a99a6;font-weight:600;} .lg-mcrow .rs{margin-left:auto;font-weight:900;} .lg-mcrow .x{color:#c0cad2;cursor:pointer;font-size:17px;}',
      '.lg-mctabs{display:flex;gap:20px;border-bottom:1px solid var(--ffp-border);margin:8px 0 4px;} .lg-mctabs button{background:none;border:none;font:inherit;font-size:13.5px;font-weight:800;color:var(--ffp-text-muted);padding:11px 0;border-bottom:2.5px solid transparent;cursor:pointer;} .lg-mctabs button.on{color:var(--ffp-blue);border-bottom-color:var(--ffp-blue);}',
      '.lg-mcfields{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px;margin-top:6px;} .lg-mcf{display:flex;flex-direction:column;gap:5px;} .lg-mcf label{font-size:12px;font-weight:800;color:#43525c;} .lg-mcf .lg-in{padding:9px 11px;}',
      '.lg-livebtn{color:#d6353b;border-color:#f3c6c6;background:#fdeff0;} .lg-mcstat.final{font-size:12px;font-weight:800;color:#5b6b75;background:#eef2f5;padding:8px 12px;border-radius:10px;}',
      '.lg-teamstat .hd{display:grid;grid-template-columns:1fr 1.4fr 1fr;align-items:center;padding:8px 2px 12px;border-bottom:1px solid var(--ffp-border);} .lg-teamstat .hd span{font-size:13px;font-weight:800;text-align:center;} .lg-teamstat .hd span:first-child{text-align:left;} .lg-teamstat .hd span:last-child{text-align:right;}',
      '.lg-tsrow{display:grid;grid-template-columns:1fr 1.4fr 1fr;align-items:center;gap:10px;padding:9px 2px;border-bottom:1px solid #f0f3f6;} .lg-tsrow .lab{text-align:center;font-size:12.5px;font-weight:700;color:#43525c;} .lg-tsrow .lg-in{padding:8px 10px;text-align:center;}',
      '.lg-per{display:flex;align-items:center;gap:10px;margin-bottom:14px;} .lg-per .sp{flex:1;} .lg-perchip{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:900;letter-spacing:.04em;text-transform:uppercase;padding:7px 12px;border-radius:20px;background:#eef2f5;color:#5b6b75;} .lg-perchip.live{background:#fdeaea;color:#d6353b;} .lg-perchip.live .d{width:7px;height:7px;border-radius:50%;background:#d6353b;} .lg-perchip.ht{background:#fff4d6;color:#8a6d00;} .lg-perchip.ft{background:#e3f6ec;color:#0a8f5f;} .lg-perset{display:flex;align-items:center;gap:10px;margin-bottom:14px;font-size:13px;font-weight:700;color:var(--ffp-text-muted);}',
      '.lg-trk{background:#f7fafc;border:1px solid #e4edf3;border-radius:12px;padding:14px 16px;margin-bottom:18px;} .lg-trk-clock{display:flex;align-items:center;gap:12px;margin-bottom:14px;} .lg-trk-clock .t{font-size:30px;font-weight:900;font-variant-numeric:tabular-nums;color:var(--ffp-text);} .lg-trk-clock .sp{flex:1;}',
      '.lg-trk-grp{margin-bottom:12px;} .lg-trk-lab{font-size:11px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#8a99a6;margin-bottom:6px;} .lg-trk-btns{display:flex;gap:10px;} .lg-trk-b{flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;border:1.5px solid #d7dee5;background:#fff;border-radius:10px;padding:11px 10px;font:inherit;font-size:13.5px;font-weight:800;color:var(--ffp-text);cursor:pointer;} .lg-trk-b span{font-size:12px;font-weight:900;color:#8a99a6;} .lg-trk-b.on{border-color:var(--ffp-blue);background:#eaf4fb;color:var(--ffp-blue);} .lg-trk-b.on span{color:var(--ffp-blue);}',
      '.lg-trk-apply{display:flex;align-items:center;gap:12px;margin-top:4px;flex-wrap:wrap;} .lg-trk-apply .sum{flex:1;font-size:12.5px;font-weight:700;color:var(--ffp-text-muted);min-width:180px;}',
      '.lgf-phase{font-size:10.5px;font-weight:900;letter-spacing:.14em;text-transform:uppercase;color:#8a99a8;align-self:center;margin-right:4px;}',
      '.lgf-sec{border-top:1px solid var(--ffp-border);padding-top:18px;margin-top:22px;}',
      '.lgf-sec:first-child{border-top:none;padding-top:0;margin-top:0;}',
      '.lgf-sech{display:inline-block;font-size:11px;font-weight:900;letter-spacing:.12em;text-transform:uppercase;color:#fff;background:#19313e;border-radius:8px;padding:7px 13px;margin-bottom:14px;}',
      '.lgf-hint{font-size:12px;font-weight:700;color:#5c6f7c;margin-top:6px;}',
      '.lgf-row{display:flex;align-items:center;gap:12px;padding:13px 2px;border-top:1px solid var(--ffp-border);cursor:pointer;}',
      '.lgf-row:last-of-type{border-bottom:1px solid var(--ffp-border);}',
      '.lgf-row.on{box-shadow:inset 3px 0 0 #17789f;padding-left:12px;}',
      '.lgf-row .cv{color:#5c6f7c;font-size:20px;} .lgf-row.on .cv{color:#17789f;}',
      '.lgf-row .g{flex:1;min-width:0;}',
      '.lgf-row .g b{display:block;font-size:14px;font-weight:800;color:#12232f;}',
      '.lgf-row.on .g b{color:#17789f;}',
      '.lgf-row .g span{display:block;font-size:12px;font-weight:600;color:#5c6f7c;margin-top:2px;}',
      '.lgf-row .st{flex:none;font-size:12px;font-weight:800;color:#5c6f7c;} .lgf-row .st.done{color:#12232f;}',
      '.lgf-edit{padding:16px 0 20px 14px;border-bottom:1px solid var(--ffp-border);}',
      '.lgf-acts{display:flex;gap:10px;margin-top:16px;flex-wrap:wrap;}',
      /* The split. Rows are hairline-separated strips on the panel, never cards,
         and every flex field carries min-width:0 + an explicit height, or Chrome
         holds an input at its ~224px default width and it overlaps its neighbour. */
      '.lgs-row{display:flex;align-items:center;gap:10px;padding:9px 0;border-top:1px solid var(--ffp-border);}',
      '.lgs-row.hd{border-top:none;padding:2px 0 7px;font-size:11px;font-weight:900;letter-spacing:.05em;text-transform:uppercase;color:#7c8b97;}',
      '.lgs-row .lgs-nm{flex:1 1 auto;min-width:0;width:auto;}',
      '.lgs-row .lgs-tk{flex:0 0 96px;min-width:0;width:96px;}',
      '.lgs-row .lgs-lg{flex:0 0 130px;min-width:0;width:130px;}',
      '.lgs-row .lgs-x{flex:0 0 32px;min-width:0;width:32px;text-align:center;}',
      '.lgs-row input.lg-in,.lgs-row select.lg-sel{max-width:100%;box-sizing:border-box;height:40px;padding:0 12px;line-height:40px;}',
      '.lgs-row input[type=number]{-moz-appearance:textfield;} .lgs-row input[type=number]::-webkit-outer-spin-button,.lgs-row input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none;margin:0;}',
      '.lgs-row button.lgs-x{border:0;background:none;padding:0;cursor:pointer;color:#9aa9b4;font-size:19px;line-height:1;} .lgs-row button.lgs-x:hover{color:#c0392b;}',
      '.lgs-add{border:0;background:none;padding:11px 0 0;font:inherit;font-size:13px;font-weight:800;color:var(--ffp-blue);cursor:pointer;display:inline-flex;align-items:center;gap:6px;} .lgs-add .ms{font-size:18px;}',
      '.lgs-note{display:flex;align-items:center;gap:7px;margin-top:11px;font-size:12.5px;font-weight:700;color:#5c6f7c;} .lgs-note .ms{font-size:17px;flex:none;} .lgs-note.ok{color:#12a05f;} .lgs-note.warn{color:#c0392b;}',
      '.lgs-draw{display:flex;align-items:center;gap:14px;margin-top:18px;padding:16px 0 2px;border-top:1px solid var(--ffp-border);}',
      '.lgs-draw>.ms{font-size:27px;color:#9aa9b4;flex:none;} .lgs-draw.ready>.ms{color:var(--ffp-blue);} .lgs-draw.done>.ms{color:#12a05f;}',
      '.lgs-draw .g{flex:1;min-width:0;} .lgs-draw .g b{display:block;font-size:14px;font-weight:900;color:#12232f;}',
      '.lgs-draw .g span{display:block;font-size:12.5px;font-weight:650;color:#5c6f7c;margin-top:3px;line-height:1.45;}',
      '.lgs-draw .lg-btn{flex:none;}',
      '@media(max-width:620px){.lgs-row{flex-wrap:wrap;} .lgs-row .lgs-nm{flex:1 1 100%;width:100%;} .lgs-row.hd{display:none;} .lgs-draw{flex-wrap:wrap;}}',
      '.lg-3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;}',
      '.bp-blk .bp-r{display:flex;align-items:center;gap:9px;padding:9px 0;border-bottom:1px solid var(--ffp-border);}',
      '.bp-blk .bp-r:first-of-type{border-top:1px solid var(--ffp-border);}',
      '/* an input renders 45px and a select 43px in this shell; they have never sat on one line before */',
      '.bp-blk .bp-r .lg-in,.bp-blk .bp-r .lg-sel{height:44px;box-sizing:border-box;}',
      '.bp-blk .bp-t{width:182px;flex:none;min-width:0;}',
      '.bp-blk .bp-mid{flex:1;min-width:0;display:flex;align-items:center;gap:8px;flex-wrap:wrap;}',
      '.bp-blk .bp-k{width:148px;flex:none;min-width:0;}',
      '.bp-blk .bp-n{width:72px;flex:none;min-width:0;text-align:center;}',
      '.bp-blk .bp-pts .bp-n{width:60px;}',
      '.bp-blk .bp-w{font-size:13px;font-weight:700;color:#5c6f7c;white-space:nowrap;}',
      '.bp-blk .bp-pts{flex:none;display:flex;align-items:center;gap:7px;}',
      '.bp-blk .bp-x{flex:none;font-size:19px;color:#93a3ae;cursor:pointer;}',
      '.bp-blk .bp-add{margin-top:12px;}',
      '.bp-blk .bp-none{font-size:13px;font-weight:600;color:#5c6f7c;padding:11px 0;border-top:1px solid var(--ffp-border);border-bottom:1px solid var(--ffp-border);}',
      '.lg-seg button.on{background:#17789f;border-color:#17789f;}'
    ].join('\n');
    document.head.appendChild(css);
  }

  async function loadSports() { if (S.sports) return S.sports; var r = await sb().from('lt_sport_schemas').select('key,name,icon,match_activities,player_fields,team_match_fields,scoring_kinds,game_rules,period_minutes,period_count,break_minutes,slot_minutes,turnaround_minutes,surface_word,surface_word_plural').eq('active', true).order('sort'); S.sports = r.data || []; return S.sports; }
  // ---- Taxonomy (shared window.FFP_TAX — activity / gender / city / country) ----
  async function taxReady() { try { if (window.FFP_TAX_READY) await window.FFP_TAX_READY; } catch (e) {} return window.FFP_TAX || {}; }
  function actNames() { return ((window.FFP_TAX && window.FFP_TAX.activities) || []).map(function (a) { return a && a.n ? a.n : a; }); }
  function genderNames() { return ((window.FFP_TAX && window.FFP_TAX.genders) || ['Male', 'Female']).filter(function (g) { return g !== 'Prefer not to say'; }); }
  function cityNames() { var t = window.FFP_TAX; return (t && t.allCities) ? t.allCities() : []; }
  function countryNames() { var t = window.FFP_TAX; return t && t.cities ? Object.keys(t.cities) : []; }
  function dlOpts(arr) { return (arr || []).map(function (x) { return '<option value="' + esc(x) + '">'; }).join(''); }
  // The sport can only ever be a value from the activity taxonomy: the database
  // refuses anything else, so the form must not be able to offer anything else.
  // A stored value that has since left the list is kept at the top rather than
  // silently dropped when an old event is opened.

  /* ── THE SPORT PICKER ──────────────────────────────────────────────────
     Reads taxonomy_items list_key='sport', whose value is the scoring
     schema's own key. It used to read the 185-entry ACTIVITY list and then
     guess the sport from the activity, which is how American football came
     out scored as Australian rules. A sport that is stored but no longer on
     the list is kept at the top rather than silently dropped. */

  /* The database refuses with a reason - "unknown sport: quidditch", "a bonus
     rule is worth 1 to 10 points". Showing "Save failed" throws that away and
     leaves the organiser guessing. Postgres codes and RLS noise are not for
     them, so only a readable message is passed through. */
  function said(e) {
    var m = (e && (e.message || e.msg || e.details)) || '';
    m = String(m).replace(/^.*violates row-level security.*$/i, '');
    if (!m || /^[A-Z0-9_]+$/.test(m) || m.length > 160) return '';
    return m.charAt(0).toUpperCase() + m.slice(1);
  }
  /* Three sources, best first. The taxonomy is what admin edits, but it is
     one fetch that can fail; lt_sport_schemas is a SEPARATE live query this
     loader already makes for the hint, so it covers a taxonomy outage; and
     the hardcoded list in ffp-taxonomy.js covers both being unreachable.
     An organiser must never be unable to choose a sport. */

  /* ── HOW THIS COMPETITION IS RUN ────────────────────────────────────────
     The ruleset and the match length are the competition's DEFAULTS. A match
     still overrides its own from the scorer, and a division can override the
     competition; this is what both fall back to.

     The rulesets on offer come from the SPORT (lt_sport_schemas.game_rules
     .variants), so a sport with one ruleset shows no picker and nothing about
     which sports have rulesets is written down here. The database validates
     the choice as well, so a stale page cannot store one the scorer would not
     understand. */
  function sportVariants(k) {
    var s = (S.sports || []).find(function (x) { return x.key === k; });
    var v = s && s.game_rules && s.game_rules.variants;
    if (!v) return [];
    return Object.keys(v).map(function (id) {
      return { id: id, label: (v[id] && v[id].label) || id, note: (v[id] && v[id].note) || '' }; });
  }
  var LEN_COUNTS = [['', 'Sport default'], ['1', 'One period'], ['2', 'Two halves'], ['4', 'Four quarters']];
  function rulesBlock(ev) {
    var vs = sportVariants(ev.sport_key), out = '';
    if (vs.length > 1) {
      var cur = vs.find(function (x) { return x.id === ev.rules_variant; }) || vs[0];
      out += '<div class="lg-fld"><div class="lg-lab">Ruleset</div>'
        + '<select class="lg-sel" id="lgr-variant" onchange="FFPLeague.rulesHint()">'
        +   vs.map(function (x) {
              return '<option value="' + esc(x.id) + '"' + (x.id === cur.id ? ' selected' : '')
                   + '>' + esc(x.label) + '</option>'; }).join('')
        + '</select><div class="lgf-hint" id="lgr-varianthint">' + esc(cur.note) + '</div></div>';
    }
    var cnt = ev.period_count == null ? '' : String(ev.period_count);
    return out + '<div class="lg-2">'
      + '<div class="lg-fld"><div class="lg-lab">Minutes a period</div>'
      +   '<input class="lg-in" id="lgr-min" type="number" min="1" max="60" placeholder="Sport default" value="'
      +   (ev.period_minutes == null ? '' : ev.period_minutes) + '"></div>'
      + '<div class="lg-fld"><div class="lg-lab">How many</div><select class="lg-sel" id="lgr-cnt">'
      +   LEN_COUNTS.map(function (x) {
            return '<option value="' + x[0] + '"' + (cnt === x[0] ? ' selected' : '') + '>' + x[1] + '</option>'; }).join('')
      +   '</select></div></div>'
      + '<div class="lgf-hint">Left empty, a match runs to whatever the sport plays. '
      + 'A single match can still be changed from the scorer.</div>';
  }
  function rulesHint() {
    var s = document.getElementById('lgr-variant'), h = document.getElementById('lgr-varianthint');
    if (!s || !h) return;
    var ev = (S.detail && S.detail.event) || {};
    var x = sportVariants(ev.sport_key).find(function (y) { return y.id === s.value; });
    h.textContent = (x && x.note) || '';
  }
  /* The three keys are always sent, so clearing a field back to empty actually
     clears it - the save RPCs use `p ? key` for exactly this reason. */
  function rulesPayload() {
    var p = { period_minutes: v('lgr-min') || null, period_count: v('lgr-cnt') || null };
    var s = document.getElementById('lgr-variant');
    if (s) p.rules_variant = s.value || null;
    return p;
  }

  function sportList() {
    var t = (window.FFP_TAX && window.FFP_TAX.sports) || [];
    if (t.length) return t;
    var s = (S.sports || []).map(function (x) { return { key: x.key, label: x.name || x.key }; });
    return s.length ? s : [];
  }
  function sportOpts(cur) {
    var a = sportList().slice();
    if (cur && !a.some(function (s) { return s.key === cur; })) a.unshift({ key: cur, label: cur });
    return a.map(function (s) {
      return '<option value="' + esc(s.key) + '"' + (s.key === cur ? ' selected' : '')
           + '>' + esc(s.label) + '</option>'; }).join('');
  }
  /* a direct lookup now the key is stored, instead of matching the activity
     against every schema's match_activities and hoping */
  function schemaNameForSport(k) {
    var s = (S.sports || []).find(function (x) { return x.key === k; });
    return s ? s.name : 'Generic points';
  }

  function actOpts(cur) {
    var a = actNames().slice();
    if (cur && a.indexOf(cur) < 0) a.unshift(cur);
    return a.map(function (n) {
      return '<option value="' + esc(n) + '"' + (n === cur ? ' selected' : '') + '>' + esc(n) + '</option>';
    }).join('');
  }
  function schemaForActivity(act) { var s = (S.sports || []).find(function (x) { return (x.match_activities || []).some(function (a) { return String(a).toLowerCase() === String(act || '').toLowerCase(); }); }); return s ? s.name : 'Generic points'; }
  /* A league no longer carries a sport until the organiser picks one: it used
     to be born as Football (soccer), which is how a netball league came to be
     labelled Football. */
  function sportSetHint(k) {
    return k ? 'Scoring and stats set: ' + schemaNameForSport(k)
             : 'Pick a sport and the scoring and stats set follows.';
  }
  function sportHint() { var a = (document.getElementById('lg-sport') || {}).value; var h = document.getElementById('lg-sporthint'); if (h) h.textContent = sportSetHint(a); }

  // ---------- LIST ----------
  async function renderList() {
    injectCss(); var el = root(); if (!el) return;
    var r; try { r = await sb().rpc('league_my_events'); } catch (e) { r = { error: e }; }
    var list = (r && r.data) || [];
    // Archived leagues are out of the way by default, but never out of reach.
    var arch = list.filter(function (ev) { return ev.status === 'archived'; });
    if (!S.showArchived) list = list.filter(function (ev) { return ev.status !== 'archived'; });
    var cards = list.map(function (ev) {
      var cov = ev.cover_url || ev.logo_url;
      return '<div class="lg-card" onclick="FFPLeague.open(\'' + ev.id + '\')"><div class="lg-cover" style="' + (cov ? 'background-image:url(\'' + esc(cov) + '\')' : '') + '"><div class="scr"></div><div class="bd ' + esc(ev.status) + '">' + esc((ev.status || 'draft').toUpperCase()) + '</div></div><div class="lg-cbody"><b>' + esc(ev.name) + '</b><span>' + esc([ev.city, ev.sport].filter(Boolean).join(', ')) + '</span></div></div>';
    }).join('');
    var newCard = S.creating
      ? '<div class="lg-card" style="cursor:default"><div class="lg-cover"><div class="scr"></div></div><div class="lg-cbody"><input class="lg-in" id="lg-newname" placeholder="League name" autofocus onkeydown="if(event.key===\'Enter\')FFPLeague.doCreate()"><div style="display:flex;gap:8px;margin-top:8px"><button class="lg-btn pri" onclick="FFPLeague.doCreate()">Create</button><button class="lg-btn ghost" onclick="FFPLeague.cancelCreate()">Cancel</button></div></div></div>'
      : '<div class="lg-new" onclick="FFPLeague.startCreate()">' + ic('add') + 'Create a league</div>';
    el.innerHTML = '<div class="lg-wrap"><div class="lg-head"><div><div class="lg-h1">Leagues</div><div class="lg-sub">Season table + fixtures.</div></div></div><div class="lg-grid">' + cards + newCard + '</div>'
      + (arch.length ? '<div class="lg-archrow"><button class="lg-btn ghost" onclick="FFPLeague.toggleArchived()">'
          + ic(S.showArchived ? 'visibility_off' : 'inventory_2')
          + (S.showArchived ? 'Hide archived' : arch.length + ' archived') + '</button></div>' : '')
      + '</div>';
    if (S.creating) { var i = document.getElementById('lg-newname'); if (i) i.focus(); }
  }
  function startCreate() { S.creating = true; renderList(); }
  function cancelCreate() { S.creating = false; renderList(); }
  async function doCreate() {
    var nm = (document.getElementById('lg-newname') || {}).value; if (!nm || !nm.trim()) return;
    var r; try { r = await sb().rpc('league_event_save', { p_id: null, p: { name: nm.trim() } }); } catch (e) { r = { error: e }; }
    if (r.error) { toast('Could not create', 'error'); return; }
    S.creating = false; open(r.data);
  }

  async function open(id) {
    /* renderTab has no 'details' branch - the tab was renamed to
       'information' and this was never updated, so opening a league, or
       saving anything (both saveDetails and saveSport call open()), left
       every branch unmatched and the body blank. */
    S.eventId = id; S.view = 'editor'; S.tab = 'information'; S.divEdit = null; S.entAdd = false;
    S.plan = null; S._autoPlanned = false;   // a different event, a different playing day
    var r; try { r = await sb().rpc('league_detail', { p_league: id }); } catch (e) { r = { error: e }; }
    S.detail = (r && r.data) || null;
    S.divId = (S.detail && S.detail.divisions && S.detail.divisions[0] && S.detail.divisions[0].id) || null;
    renderEditor();
  }

  function renderEditor() {
    injectCss(); var el = root(); if (!el || !S.detail) return;
    var ev = S.detail.event || {};
    el.innerHTML = '<div class="lg-wrap"><div class="lg-head"><div><div class="lg-h1">' + esc(ev.name) + '<span class="lg-pill ' + esc(ev.status) + '">' + esc((ev.status || 'draft').toUpperCase()) + '</span></div><div class="lg-sub">' + esc([ev.city, ev.sport_key].filter(Boolean).join(', ')) + '</div></div>'
      + '<button class="lg-btn" onclick="FFPLeague.back()">' + ic('arrow_back') + 'All leagues</button></div>'
      + '<div class="lg-nav"><span class="lgf-phase">Set up</span>' + tabBtn('information', 'Information') + tabBtn('setup', 'Setup') + tabBtn('divisions', 'Divisions') + tabBtn('entrants', evNouns().Many) + tabBtn('venues', 'Venues') + tabBtn('officials', 'Officials') + tabBtn('sponsors', 'Sponsors') + tabBtn('matchday', 'Match day') + tabBtn('schedule', 'Schedule') + tabBtn('fixtures', 'Fixtures & results') + tabBtn('table', 'Table') + '</div><div id="lg-tab"></div></div>';
    renderTab();
  }
  function tabBtn(id, label) { return '<button class="' + (S.tab === id ? 'on' : '') + '" onclick="FFPLeague.tab(\'' + id + '\')">' + label + '</button>'; }
  /* ══════════════════════════════════════════════════════════════════════
     KEEP THE ORGANISER WHERE THEY WERE

     Every tab here redraws itself by replacing the whole panel, so after a
     drag, a save, a toggle or a refresh the page sprang back to the top and
     any sideways-scrolling grid back to the left -- and the organiser had to
     scroll down and across again to find what they had just changed.

     This is the one place every tab re-renders through, so it is the one
     place that has to remember. It restores only when the SAME tab is drawn
     again; a different tab lands at the top, which is what anyone expects.

     The panel is held at its old height while the new one is built, because
     a panel that empties to "Loading..." collapses the page, the browser
     clamps the scroll to zero, and nothing can be restored afterwards.
     ══════════════════════════════════════════════════════════════════════ */
  function renderTab() {
    var host = document.getElementById('lg-tab'); if (!host) return;

    var same = S._drawnTab === S.tab;
    var sc = document.scrollingElement || document.documentElement;
    var keepY = same ? (window.pageYOffset || sc.scrollTop || 0) : 0;
    var keepX = [];
    if (same) {
      try {
        Array.prototype.forEach.call(host.querySelectorAll('.sc'), function (el) { keepX.push(el.scrollLeft); });
        var h = host.offsetHeight;
        if (h > 0) host.style.minHeight = h + 'px';
      } catch (e) { /* a redraw must never fail over this */ }
    }
    S._drawnTab = S.tab;

    var restore = function () {
      try {
        /* A DIFFERENT TAB LANDS AT THE TOP. It used to get there by accident,
           because the old panel emptied and the page collapsed under the
           scroll; now that the height is held, it has to be said. */
        if (!same) window.scrollTo(0, 0);
        if (same && keepY > 0) window.scrollTo(0, keepY);
        if (same && keepX.length) {
          Array.prototype.forEach.call(host.querySelectorAll('.sc'), function (el, i) {
            if (keepX[i]) el.scrollLeft = keepX[i];
          });
        }
      } catch (e) { /* noop */ }
      host.style.minHeight = '';
    };
    /* after the browser has laid the new panel out, not before */
    var settle = function () {
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(function () { requestAnimationFrame(restore); });
      else setTimeout(restore, 0);
    };

    var out = drawTab(host);
    if (out && typeof out.then === 'function') out.then(settle, settle); else settle();
    return out;
  }

  function drawTab(host) {
    if (S.tab === 'information') return renderInformation(host);
    if (S.tab === 'setup') return renderSetup(host);
    if (S.tab === 'divisions') return renderDivisions(host);
    if (S.tab === 'entrants') return renderEntrants(host);
    if (S.tab === 'fixtures') return S.matchOpen ? renderMatchCentre() : renderFixtures(host);
    if (S.tab === 'venues') return renderVenues(host);
    if (S.tab === 'officials') return renderOfficials(host);
    if (S.tab === 'matchday') return renderMatchDay(host);
    if (S.tab === 'schedule') return renderSchedule(host);
    if (S.tab === 'sponsors') return renderSponsors(host);
    if (S.tab === 'table') return renderTable(host);
  }
  /* ───────────────────────── MATCH DAY ─────────────────────────
     The screen an organiser stands on during a round. It asks league_day,
     which hands over to THIS sport's own league function, so the words that
     come back are the sport's own: pitch or court, referee or umpire. This is
     the leagues console's own copy; it shares nothing with the tournaments
     file, and nothing in it decides anything about a sport. */
  var MD_DCOL = ['#1B4A73','#7A4FA3','#0F7A6B','#B23A48','#8A5A00',
                 '#5B3E8E','#0F6E7A','#2F6B2F','#A4454F','#B06A00'];
  var MD_KIND = { clash: 'CLASH', result: 'NO RESULT', finish: 'STILL LIVE',
                  official: 'OFFICIAL', sheet: 'TEAM SHEET', surface: 'NO GROUND',
                  entrants: 'NO TEAMS' };

  function mdDayLabel(ymd) {
    var a = String(ymd || '').split('-'); if (a.length !== 3) return 'Today';
    var dt = new Date(Date.UTC(+a[0], +a[1] - 1, +a[2], 12, 0, 0));
    var D = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    var M = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return D[dt.getUTCDay()] + ' ' + dt.getUTCDate() + ' ' + M[dt.getUTCMonth()] + ' ' + dt.getUTCFullYear();
  }
  function mdShiftDay(ymd, delta) {
    var a = String(ymd || '').split('-'); if (a.length !== 3) return ymd;
    var dt = new Date(Date.UTC(+a[0], +a[1] - 1, +a[2], 12, 0, 0));
    dt.setUTCDate(dt.getUTCDate() + delta);
    return dt.toISOString().slice(0, 10);
  }

  async function renderMatchDay(host) {
    host.innerHTML = '<div class="lg-empty">Loading the day\u2026</div>';
    /* THE CHOSEN DAY BELONGS TO THE EVENT BEING LOOKED AT. Keeping it across
       events is how this screen ended up reporting 1 December at a tournament
       that played in October, and then calling that empty day a clean one. */
    if (S.mdFor !== S.eventId) { S.mdFor = S.eventId; S.mdDay = null; }

    var d = await mdFetch(S.mdDay);
    if (!d) { host.innerHTML = '<div class="lg-empty">Could not load the day.</div>'; return; }

    /* land on a day that actually has matches rather than on an empty one */
    if (!S.mdDay && !(d.headline && d.headline.total) && (d.days || []).length) {
      var pick = mdNearestDay(d.days, d.day);
      if (pick && pick !== d.day) { var d2 = await mdFetch(pick); if (d2) d = d2; }
    }
    S.mdDay = d.day || S.mdDay;
    S.md = d;

    if (d.unsupported) {
      host.innerHTML = mdHead(d) + mdDays(d)
        + '<div class="lg-empty">There is no match day panel for this sport yet.</div>';
      return;
    }
    host.innerHTML = mdHead(d) + mdDays(d) + mdGrid(d) + mdJobs(d) + mdSurfaces(d) + mdDivisions(d) + mdKey(d);
  }

  async function mdFetch(day) {
    var r; try {
      r = await sb().rpc('league_day', { p_event: S.eventId, p_day: day || null, p_now: null });
    } catch (e) { r = { error: e }; }
    return (r && !r.error) ? (r.data || {}) : null;
  }
  /* the next day that has matches, or the last one if they are all behind us */
  function mdNearestDay(days, from) {
    var up = (days || []).filter(function (x) { return x.matches > 0 && x.day >= from; });
    if (up.length) return up[0].day;
    var back = (days || []).filter(function (x) { return x.matches > 0; });
    return back.length ? back[back.length - 1].day : null;
  }
  function mdDayShort(ymd) {
    var a = String(ymd || '').split('-'); if (a.length !== 3) return '';
    var dt = new Date(Date.UTC(+a[0], +a[1] - 1, +a[2], 12, 0, 0));
    var D = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    var M = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return D[dt.getUTCDay()] + ' ' + dt.getUTCDate() + ' ' + M[dt.getUTCMonth()];
  }
  /* EVERY DAY THIS EVENT PLAYS ON, so nobody has to find them with the arrows. */
  function mdDays(d) {
    var days = (d.days || []).filter(function (x) { return x.matches > 0; });
    if (days.length < 2) return '';
    return '<div class="md-strip">' + days.map(function (x) {
      return '<button class="md-dbtn' + (x.day === d.day ? ' on' : '') + '"'
        + ' onclick="FFPLeague.mdPick(\'' + x.day + '\')">'
        + '<b>' + esc(mdDayShort(x.day)) + '</b>'
        + '<s>' + (x.played || 0) + ' OF ' + x.matches + '</s></button>';
    }).join('') + '</div>';
  }

  /* THE WHOLE DAY, the element the approved panel leads on: one row per
     surface, one column per slot, so the organiser sees the shape of the day
     before they read a word. Hatched means that division has nobody entered.
     Two matches in one cell is a clash and is drawn as one. */
  function mdGrid(d) {
    var ms = (d.matches || []).filter(function (m) { return m.at; });
    if (!ms.length) return '';
    /* a round tag wears its division's colour, as approved, so a court
       hosting three divisions in a day can be read down the column */
    var ready = {}, dcol = {};
    (d.divisions || []).forEach(function (x, i) {
      ready[x.division_id] = !!x.ready;
      dcol[x.division_id] = MD_DCOL[i % MD_DCOL.length];
    });

    var slots = [];
    ms.forEach(function (m) { if (slots.indexOf(m.at) < 0) slots.push(m.at); });
    slots.sort();

    var rows = (d.surfaces || []).map(function (x) {
      return { key: x.field_id, name: x.name, code: x.screen_code };
    });
    if (ms.some(function (m) { return !m.field_id; })) {
      rows.push({ key: null, name: 'No ' + surfWord() + ' yet', code: '' });
    }
    if (!rows.length || !slots.length) return '';

    var now = d.as_at || '';
    var nowSlot = null;
    slots.forEach(function (t) { if (t <= now) nowSlot = t; });

    var head = '<tr><th class="cl">' + esc(Surf().toUpperCase()) + '</th>'
      + slots.map(function (t) {
          return '<th' + (t === nowSlot ? ' class="now"' : '') + '>' + esc(t)
            + (t === nowSlot ? '<span class="nw">PLAYING NOW</span>' : '') + '</th>';
        }).join('') + '</tr>';

    var body = rows.map(function (r) {
      return '<tr><td class="cl"><b>' + esc(r.name) + '</b>'
        + (r.code ? '<s>' + esc(r.code) + '</s>' : '') + '</td>'
        + slots.map(function (t) {
            var cell = ms.filter(function (m) {
              return m.at === t && (m.field_id || null) === (r.key || null); });
            var cls = (t === nowSlot ? 'now' : '');
            if (!cell.length) return '<td class="free ' + cls + '"><s>free</s></td>';
            if (cell.length > 1) cls += ' dbl';
            return '<td class="' + cls + '">' + cell.map(function (m) {
              var k = m.status === 'final' ? 'c-done'
                    : m.status === 'live' ? 'c-live'
                    : (ready[m.division_id] === false ? 'c-none'
                    : (m.late ? 'c-late' : 'c-wait'));
              var named = m.home && m.away && !/^TBD$/.test(m.home) && !/^TBD$/.test(m.away);
              return '<div class="' + k + '">'
                + '<b class="tag" style="color:' + (dcol[m.division_id] || 'var(--ffp-blue)')
                  + '">' + esc(m.label || '') + '</b>'
                + (named ? '<u class="who">' + esc(m.home) + '<br>' + esc(m.away) + '</u>' : '')
                + (m.score ? '<em class="sc2">' + esc(m.score) + '</em>' : '')
                + '</div>';
            }).join('') + '</td>';
          }).join('') + '</tr>';
    }).join('');

    return '<div class="md-sh"><h3>THE WHOLE DAY</h3><p>'
      + rows.length + ' ' + esc(rows.length === 1 ? surfWord() : surfWord(true))
      + ' down, ' + slots.length + ' slots across</p><span class="ln"></span></div>'
      + '<div class="md-dy"><div class="sc"><table class="md-g"><thead>' + head
      + '</thead><tbody>' + body + '</tbody></table></div></div>';
  }

  /* the key, at the foot of the panel as approved */
  function mdKey() {
    return ''
      + '<div class="md-key">'
      + '<span><i style="background:#E8F5EF;box-shadow:inset 0 0 0 1px #BFE0D2"></i>PLAYED</span>'
      + '<span><i style="background:#FFF4DC;box-shadow:inset 0 0 0 2px #F2A900"></i>BEING PLAYED</span>'
      + '<span><i style="background:#FDF6E6;box-shadow:inset 0 0 0 1px #E8D9B0"></i>PAST ITS TIME</span>'
      + '<span><i style="background:#fff;box-shadow:inset 0 0 0 1px var(--ffp-border-mid)"></i>TO COME</span>'
      + '<span><i style="background:repeating-linear-gradient(135deg,#EEF2F6 0 6px,#F7F9FB 6px 12px);box-shadow:inset 0 0 0 1px var(--ffp-border-mid)"></i>NOBODY ENTERED</span>'
      + '</div>';
  }

  function mdHead(d) {
    var h = d.headline || {};
    var sw = (d.surface_word || 'pitch').toUpperCase();
    var empty = (d.divisions || []).filter(function (x) { return !x.ready; })
                 .reduce(function (a, x) { return a + (x.matches || 0); }, 0);
    var cn = function (v, lab, tone) {
      return '<div class="md-cn' + (tone ? ' ' + tone : '') + '"><u>' + (v || 0) + '</u><s>'
           + esc(lab) + '</s></div>';
    };
    return '<div class="md-top"><div class="md-day">'
      + '<button class="sc-ic" title="The day before" onclick="FFPLeague.mdDay(-1)">' + ic('chevron_left') + '</button>'
      + '<b>' + esc(mdDayLabel(d.day || S.mdDay)) + '</b>'
      + '<button class="sc-ic" title="The day after" onclick="FFPLeague.mdDay(1)">' + ic('chevron_right') + '</button>'
      + (d.as_at ? '<span class="tz">as at ' + esc(d.as_at) + ', ' + esc(d.timezone || '') + '</span>' : '')
      + '<span class="sp"></span>'
      + '<button class="lg-btn sm" onclick="FFPLeague.mdRefresh()">' + ic('refresh') + 'Refresh</button>'
      + '</div><div class="md-cnt">'
      + cn(h.played, 'PLAYED', 'ok')
      + cn(h.live, 'ON THE ' + sw, 'warn')
      + cn(h.late, 'LATE', 'warn')
      + cn(h.clashes, 'CLASHES', 'warn')
      + cn(empty, 'NO TEAMS', 'blue')
      + cn(h.total, 'TODAY')
      + '</div></div>';
  }

  function mdJobs(d) {
    var t = d.todo || [];
    /* NO MATCHES IS NOT THE SAME AS NOTHING WRONG. Saying every match has what
       it needs, on a day with no matches at all, is how this panel told an
       organiser their tournament was fine when it was not even being read. */
    if (!(d.headline && d.headline.total)) {
      var near = mdNearestDay(d.days, d.day);
      return '<div class="md-sh"><h3>NOTHING ON THIS DAY</h3><span class="ln"></span></div>'
        + '<div class="md-none">' + ic('event_busy') + '<div class="g">'
        + '<b>No matches are scheduled on ' + esc(mdDayLabel(d.day)) + '.</b>'
        + (near && near !== d.day
            ? '<p>The nearest day with matches is ' + esc(mdDayLabel(near)) + '.</p>'
              + '<a class="lg-btn sm" onclick="FFPLeague.mdPick(\'' + near + '\')">Go to that day</a>'
            : '<p>Nothing on this event has a date and time yet. Set them on the Schedule tab.</p>')
        + '</div></div>';
    }
    if (!t.length) {
      return '<div class="md-sh"><h3>NOTHING NEEDS YOU</h3><span class="ln"></span></div>'
        + '<div class="md-clear">' + ic('check_circle')
        + '<b>Every match today has a time, a ' + esc(d.surface_word || 'pitch')
        + ' and somebody to run it.</b></div>';
    }
    return '<div class="md-sh"><h3>NEEDS ATTENTION</h3><p>' + t.length
      + (t.length === 1 ? ' job' : ' jobs') + ', soonest first</p><span class="ln"></span></div>'
      + '<div class="md-rail">' + t.map(mdJob).join('') + '</div>';
  }
  function mdJob(j) {
    var act = j.action || '';
    var btn = j.match_id
      ? '<button class="lg-btn sm" onclick="FFPLeague.mdGo(\'' + j.match_id + '\')">Open match</button>'
      : '<button class="lg-btn sm" onclick="FFPLeague.tab(\'entrants\')">Add ' + esc(evNouns().Many) + '</button>';
    return '<div class="md-jb k-' + esc(act) + '">'
      + '<div class="tm"><u>' + esc(j.at || '') + '</u><s>' + esc(MD_KIND[act] || act.toUpperCase()) + '</s></div>'
      + '<i class="dot"></i>'
      + '<div class="mid">'
      + (j.surface || j.label ? '<span class="where">' + esc(j.surface || j.label) + '</span>' : '')
      + '<b>' + esc(j.match || '') + '</b>'
      + '<p>' + esc(j.need || '') + '</p></div>'
      + '<div class="acts">' + btn + '</div></div>';
  }

  function mdSurfaces(d) {
    var list = d.surfaces || [];
    if (!list.length) return '';
    return '<div class="md-sh"><h3>EVERY ' + esc((d.surface_word || 'pitch').toUpperCase())
      + ' IN USE TODAY</h3><span class="ln"></span></div>'
      + '<div class="md-board"><div class="md-bh"><span>' + esc(Surf()) + '</span>'
      + '<span>ON NOW</span><span>NEXT UP</span><span>SCORER</span></div>'
      + list.map(function (x) {
          var on = x.on_now, nx = x.next;
          var edge = on ? ' e-live' : ((nx && nx.late) ? ' e-late' : '');
          return '<div class="md-row' + edge + '">'
            + '<div class="c"><b>' + esc(x.name || '') + '</b><s>'
              + esc(x.screen_code || '') + '&nbsp;&nbsp;' + (x.played || 0) + ' of ' + (x.matches || 0) + '</s></div>'
            + '<div class="on">' + (on
                ? '<u>' + esc(on.match || '') + '</u><s>' + esc([on.label, on.score].filter(Boolean).join(', ')) + '</s>'
                : '<u class="free">' + esc(Surf()) + ' free</u>') + '</div>'
            + '<div class="nx">' + (nx
                ? '<u>' + esc([nx.at, (/^TBD v TBD$/.test(nx.match || '') ? 'Not decided yet' : nx.match)]
                    .filter(Boolean).join('  ')) + '</u>'
                  + '<s' + (nx.late ? ' class="bad"' : '') + '>'
                  + esc(nx.late ? 'Past its time, nobody on yet' : (nx.label || '')) + '</s>'
                : '<u class="free">Nothing more today</u>') + '</div>'
            + '<div class="rf">' + (x.scorer
                ? '<u>' + esc(x.scorer) + '</u>'
                : '<u class="none">Nobody</u>') + '</div>'
            + '</div>';
        }).join('') + '</div>';
  }

  function mdDivisions(d) {
    var v = d.divisions || [];
    if (!v.length) return '';
    return '<div class="md-sh"><h3>DIVISIONS</h3><span class="ln"></span></div>'
      + '<div class="md-divs">' + v.map(function (x, i) {
          return '<div class="md-dv lg-d' + (i % 10) + '">'
            + '<div class="r1"><i></i><b>' + esc(x.division || '') + '</b>'
            + '<span class="' + (x.ready ? 'ok' : 'no') + '">'
            + (x.ready ? 'RUNNING' : 'NOBODY IN IT') + '</span></div>'
            + '<div class="mt">'
            + '<div><u' + (x.ready ? '' : ' class="bad"') + '>' + (x.entrants || 0) + '</u><s>IN</s></div>'
            + '<div><u>' + (x.matches || 0) + '</u><s>MATCHES</s></div>'
            + '<div><u>' + (x.today || 0) + '</u><s>TODAY</s></div>'
            + '</div>' + mdPips(x) + mdNote(x) + '</div>';
        }).join('') + '</div>';
  }

  /* ONE MARK PER MATCH, filled when it is played. A thin bar at 1 of 48 says
     nothing; 48 marks with one filled says it exactly. */
  function mdPips(x) {
    var total = x.matches || 0;
    if (!total || total > 120) return '';
    var done = x.played || 0, out = [];
    for (var i = 0; i < total; i++) {
      out.push('<i class="' + (i < done ? 'won' : (x.ready ? 'todo' : '')) + '"></i>');
    }
    return '<div class="pips">' + out.join('') + '</div>';
  }
  function mdNote(x) {
    if (!x.ready) {
      return '<div class="nt bad">' + (x.matches || 0)
        + ' matches are booked and not one entry is in. Add them or hand the slots back.</div>';
    }
    var left = (x.matches || 0) - (x.played || 0);
    return '<div class="nt">' + (x.entrants || 0) + ' in, ' + (x.played || 0)
      + ' played, ' + left + ' to go.</div>';
  }

  function mdDay(delta) { S.mdDay = mdShiftDay(S.mdDay, delta); renderTab(); }
  function mdPick(day) { S.mdDay = day; renderTab(); }
  function mdRefresh() { renderTab(); }
  function mdGo(id) { openMatch(id); }

  function renderSponsors(host) {
    if (window.FFPSponsors) window.FFPSponsors.render(host, { scope: 'league', eventId: S.eventId,
      // the editor needs the clubs so it can offer a board per team.
      // A board belongs to ONE owner: the event's own, or a club's.
      entrants: (S._entrants || []) });
    else host.innerHTML = '<div style="padding:20px;color:#8a99a8;">Sponsor editor unavailable.</div>';
  }

  // ---------- shared helpers (rounds / logos / venues) ----------
  var MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  var ROLES = ['Referee','Assistant referee','Umpire','Touch judge','Line judge','Timekeeper','Scorer','TMO'];
  var CAPS = [['official', 'Match official'], ['scorer', 'Scorer only'], ['both', 'Match official + Scorer']];
  function capOpts(sel) { return CAPS.map(function (c) { return '<option value="' + c[0] + '"' + (c[0] === sel ? ' selected' : '') + '>' + c[1] + '</option>'; }).join(''); }
  function isScorerRole(r) { r = String(r || '').toLowerCase(); return r === 'scorer' || r === 'both'; }
  function fmtDay(d) { return DOW[d.getDay()] + ' ' + d.getDate() + ' ' + MON[d.getMonth()]; }
  function fmtTime(d) { return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }
  // ── the competition's clock ─────────────────────────────────────────────
  // A kick-off belongs to the place the match is played, not to the desk it is
  // typed at. new Date('2026-10-04T19:30:00') is read in the BROWSER's zone, so
  // a Dubai fixture entered from Australia landed four hours out. Everything
  // below reads and writes wall-clock time in the competition's own zone.
  function evTz() {
    return (S.detail && S.detail.event && S.detail.event.timezone) || 'UTC';
  }
  // what the clock on the wall in `tz` reads at instant `at`, as UTC-shaped parts
  function tzParts(at, tz) {
    var f = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short' });
    var o = {};
    f.formatToParts(new Date(at)).forEach(function (x) { o[x.type] = x.value; });
    o.hour = (o.hour === '24') ? '00' : o.hour;
    return o;
  }
  function tzOffsetMs(at, tz) {
    var p = tzParts(at, tz);
    var asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
    return asUtc - new Date(at).getTime();
  }
  // 'YYYY-MM-DD' + 'HH:MM' read in tz  ->  an ISO instant
  function zoneToISO(dateStr, timeStr, tz) {
    if (!dateStr) return null;
    var d = String(dateStr).split('-'), t = String(timeStr || '00:00').split(':');
    var wall = Date.UTC(+d[0], +d[1] - 1, +d[2], +t[0] || 0, +t[1] || 0, 0);
    var ms = wall - tzOffsetMs(wall, tz);
    ms = wall - tzOffsetMs(ms, tz);   // second pass settles a DST boundary
    return new Date(ms).toISOString();
  }
  function zoneDate(iso, tz) { var p = tzParts(iso, tz); return p.year + '-' + p.month + '-' + p.day; }
  function zoneTime(iso, tz) { var p = tzParts(iso, tz); return p.hour + ':' + p.minute; }
  function zoneDay(iso, tz) {
    var p = tzParts(iso, tz);
    return DOW[new Date(Date.UTC(+p.year, +p.month - 1, +p.day)).getUTCDay()] + ' ' + (+p.day) + ' ' + MON[+p.month - 1];
  }
  function crest(o, big) {
    o = o || {}; var nm = o.name || 'TBD'; var cls = 'lg-crest' + (big ? ' big' : '');
    if (o.logo) return '<span class="' + cls + '" style="background-image:url(\'' + esc(o.logo) + '\')"></span>';
    return '<span class="' + cls + '">' + esc(nm.replace(/[^A-Za-z ]/g, '').split(' ').map(function (w) { return w[0] || ''; }).join('').slice(0, 2).toUpperCase() || '?') + '</span>';
  }
  function roundRange(list) {
    // a round spans days on the competition's calendar, not the viewer's
    var tz = evTz();
    var ds = list.map(function (f) { return f.scheduled_at ? new Date(f.scheduled_at).getTime() : null; }).filter(Boolean);
    if (!ds.length) return 'Not scheduled';
    var mn = Math.min.apply(null, ds), mx = Math.max.apply(null, ds);
    var pn = tzParts(mn, tz), px = tzParts(mx, tz);
    if (pn.year === px.year && pn.month === px.month && pn.day === px.day) return zoneDay(mn, tz) + ', 1 day';
    var dayMs = function (p) { return Date.UTC(+p.year, +p.month - 1, +p.day); };
    var days = Math.round((dayMs(px) - dayMs(pn)) / 86400000) + 1;
    var span = (pn.month === px.month && pn.year === px.year)
      ? ((+pn.day) + '–' + (+px.day) + ' ' + MON[+px.month - 1])
      : ((+pn.day) + ' ' + MON[+pn.month - 1] + ' – ' + (+px.day) + ' ' + MON[+px.month - 1]);
    return span + ', ' + days + ' days';
  }
  function surfaceOpts(fields, selId) {
    var groups = {}; var order = [];
    (fields || []).forEach(function (x) { var g = x.venue || 'Other'; if (!groups[g]) { groups[g] = []; order.push(g); } groups[g].push(x); });
    var body = order.map(function (g) {
      return '<optgroup label="' + esc(g) + '">' + groups[g].map(function (x) {
        return '<option value="' + x.id + '"' + (selId && x.id === selId ? ' selected' : '') + '>' + esc(x.name) + '</option>';
      }).join('') + '</optgroup>';
    }).join('');
    return '<option value="">Surface…</option>' + body;
  }
  function togRound(btn) {
    btn.classList.toggle('collapsed');
    var b = btn.nextElementSibling; if (b && b.classList.contains('lg-rbody')) b.classList.toggle('hidden');
  }
  // ── COURT SCOREBOARD ───────────────────────────────────────────────────
  // A scoreboard is set up by typing an address into a TV's browser with a
  // remote, so the court's five-character code is the thing that matters. The
  // full /display/<uuid> link is no use to anyone holding a remote control.
  var SCREEN_BASE = 'scoreboard.findfitpeople.com';   // the scoreboard address (Vercel, ffp-app)
  var GFX_BASE    = 'gfx.findfitpeople.com';     // the broadcast graphics source, same code, all day
  function screenPanel(code, court, permanent) {
    var url = SCREEN_BASE + '/' + code;
    var old = document.getElementById('lg-scr'); if (old) old.remove();
    var bk = document.createElement('div'); bk.id = 'lg-scr'; bk.className = 'lg-cfm';
    bk.innerHTML = '<div class="lg-cfm-in lg-scr">'
      + '<span class="ms lg-cfm-ic" style="color:var(--ffp-blue)">cast</span>'
      + '<div class="lg-cfm-t">Scoreboard, ' + esc(court) + '</div>'
      + '<div class="lg-scrlab">On the TV, open a browser and go to</div>'
      + '<div class="lg-scrurl" id="lg-scrurl">' + esc(url) + '</div>'
      + '<div class="lg-scrnote">' + (permanent ? 'This is the ' + surfWord() + '\'s own screen. The code never changes, and it shows every match played on this ' + surfWord() + '.' : 'This screen is for this event only.') + '</div>'
      + '<div class="lg-scrlab">Streaming this ' + surfWord() + '? The graphics source is</div>'
      + '<div class="lg-scrurl gfx" id="lg-gfxurl">' + esc(GFX_BASE + '/f/' + code) + '</div>'
      + '<div class="lg-scrnote">Paste that into OBS, vMix or a YoloBox once, at 1920x1080. It follows the '
      +   surfWord() + ' all day on its own, so it picks up each match as it starts.</div>'
      + '<div class="lg-scrsteps">'
      +   '<div><b>1</b><span>Open the browser on the TV, or on a stick plugged into it.</span></div>'
      +   '<div><b>2</b><span>Type that address and leave it. The board keeps its own screen awake.</span></div>'
      +   '<div><b>3</b><span>Casting from a tablet instead? Tap the board, turn on 16:9, then full screen.</span></div>'
      + '</div>'
      + '<div class="lg-cfm-a"><button class="lg-btn ghost" id="lg-scr-x">Close</button>'
      +   '<button class="lg-btn" id="lg-scr-c">' + ic('content_copy') + 'Copy TV address</button>'
      +   '<button class="lg-btn pri" id="lg-gfx-c">' + ic('content_copy') + 'Copy graphics</button></div>'
      + '</div>';
    document.body.appendChild(bk);
    bk.querySelector('#lg-scr-x').onclick = function () { bk.remove(); };
    bk.querySelector('#lg-scr-c').onclick = function () { copyScreen('lg-scrurl'); };
    bk.querySelector('#lg-gfx-c').onclick = function () { copyScreen('lg-gfxurl'); };
  }
  function copyScreen(id) {
    var el = document.getElementById(id); if (!el) return;
    var t = el.textContent || '';
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t);
      else {
        var ta = document.createElement('textarea');
        ta.value = t; document.body.appendChild(ta); ta.select();
        document.execCommand('copy'); document.body.removeChild(ta);
      }
      toast('Address copied', 'success');
    } catch (e) { toast('Could not copy, type it instead', 'error'); }
  }

  function roundHead(label, count, range) {
    return '<div class="lg-rnd" onclick="FFPLeague.togRound(this)"><span class="ms chev">expand_more</span><span class="rt">' + esc(label) + '</span><span class="rc">' + count + (count === 1 ? ' match' : ' matches') + '</span><span class="sp"></span><span class="rd"><span class="ms" style="font-size:14px;vertical-align:-2px">event</span> ' + esc(range) + '</span></div>';
  }
  function entOpts(sel, skip) {
    return '<option value="">Select…</option>' + (S._entrants || []).filter(function (e) { return e.id !== skip; }).map(function (e) {
      return '<option value="' + e.id + '"' + (sel === e.id ? ' selected' : '') + '>' + esc(e.name) + '</option>';
    }).join('');
  }
  async function loadEntrants() { var r; try { r = await sb().rpc('league_roster', { p_division: S.divId }); } catch (e) { r = null; } S._entrants = (r && r.data) || []; return S._entrants; }

  // ---------- OFFICIALS & CREW ----------
  /* TWO different kinds of person, and the panel must never let them read as
     one list (Grant, locked).
       OFFICIALS  an FFP account OR just a name and photo. Picked per match on
                  the Schedule tab. Nothing opens on their phone.
       CREW       Scorers and Livestream GFX. They sign in to an FFP app, so
                  they can ONLY be picked from real FFP accounts - lt_official_add
                  raises crew_needs_ffp_account otherwise - and each one carries
                  an access scope: the whole event, or chosen days / matches. */
  var CREW_KINDS = [['scorer', 'Scorers', 'opens FFP Scorer'],
                    ['livestream', 'Livestream GFX', 'opens FFP GFX']];
  function isCrewRole(r) { r = String(r || '').toLowerCase(); return r === 'scorer' || r === 'both' || r === 'livestream'; }
  function crewKind(r) { return String(r || '').toLowerCase() === 'livestream' ? 'livestream' : 'scorer'; }
  function fmtDay(s) {
    try { return new Date(String(s) + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }); }
    catch (e) { return String(s); }
  }
  function accessLabel(o) {
    if (String(o.access || 'full') !== 'limited') return 'Full access';
    var d = (o.days || []).length, m = (o.matches || []).length;
    if (d && !m) return d === 1 ? fmtDay(o.days[0]) + ' only' : d + ' days only';
    if (m && !d) return m === 1 ? '1 match only' : m + ' matches only';
    if (d || m) return 'Limited';
    return 'Limited (nothing picked)';
  }
  function accSel(o) {
    var lim = String(o.access || 'full') === 'limited';
    return '<select class="lg-sel og-acc' + (lim ? ' on' : '') + '" onchange="FFPLeague.setAccess(\'' + o.id + '\',this.value)">'
      + '<option value="full"' + (lim ? '' : ' selected') + '>Full access</option>'
      + '<option value="limited"' + (lim ? ' selected' : '') + '>' + esc(lim ? accessLabel(o) : 'Limited…') + '</option>'
      + '</select>';
  }
  function ofAvatar(o) {
    return '<span class="lg-av" style="' + (o.photo ? 'background-image:url(\'' + esc(o.photo) + '\')' : '') + '">'
      + (o.photo ? '' : esc(String(o.name || o.email || '?').slice(0, 1).toUpperCase())) + '</span>';
  }

  async function renderOfficials(host) {
    host.innerHTML = '<div id="lg-ofwrap"><div class="lg-empty">Loading…</div></div>';
    var r; try { r = await sb().rpc('lt_officials_list', { p_scope: 'league', p_event: S.eventId }); } catch (e) { r = { error: e }; }
    var rows = (r && r.data) || []; S._officials = rows;
    try { var mg = await sb().rpc('lt_team_managers_list', { p_scope: 'league', p_event: S.eventId }); S._mgrs = (mg && mg.data) || []; } catch (e) { S._mgrs = []; }
    try { var tl = await sb().rpc('lt_team_list', { p_scope: 'league', p_event: S.eventId }); S._mgTeams = (((tl && tl.data) || {}).teams) || []; } catch (e) { S._mgTeams = []; }
    var wrap = document.getElementById('lg-ofwrap'); if (!wrap) return;
    wrap.innerHTML = poolHtml(rows.filter(function (o) { return !isCrewRole(o.role); }))
      + '<div class="og-crewwrap">'
      + '<div class="og-lead">' + ic('smartphone') + '<div><b>Crew</b><span>Picked from FFP members only. Set how much of the event each one can reach.</span></div></div>'
      + CREW_KINDS.map(function (k) {
          return crewSecHtml(k, rows.filter(function (o) { return isCrewRole(o.role) && crewKind(o.role) === k[0]; }));
        }).join('')
      + '</div>'
      + mgrSecHtml();
  }

  /* -- TEAM MANAGERS -----------------------------------------------------
     One row per ASSIGNMENT, not per person: the same member appears once for
     every team they manage, because that is exactly what the permission is.
     lt_member_search hands back a member id and a MASKED email, so the write
     is lt_team_manager_assign (member id in) and NOT the email-keyed
     lt_team_manager_add -- the dashboard never sees a real address. */
  function mgrSecHtml() {
    var open = !!S.mgAdd, rows = S._mgrs || [];
    return '<div class="og-sec og-mgr">'
      + '<div class="og-hd">' + ic('badge')
      + '<div class="t"><b>Team managers</b><span>An FFP member who can set one team&rsquo;s sheet, and nobody else&rsquo;s.</span></div>'
      + '<button class="lg-btn' + (open ? ' on' : '') + '" onclick="FFPLeague.mgOpen(' + (open ? 'false' : 'true') + ')">'
      + ic(open ? 'close' : 'add') + (open ? 'Cancel' : 'Add') + '</button></div>'
      + (open ? mgrAddHtml() : '')
      + (rows.length ? rows.map(mgrRowHtml).join('') : '<div class="lg-empty">No team managers yet.</div>')
      + '<div class="og-foot">They set their own team sheet in the FFP app. They cannot score, and they cannot touch another team.</div>'
      + '</div>';
  }

  function mgrRowHtml(m) {
    var bg = m.photo_url ? 'background-image:url(\'' + esc(m.photo_url) + '\')' : '';
    return '<div class="lg-row"><span class="lg-av" style="' + bg + '">'
      /* two initials, as the approved row shows -- not the one letter the
         officials avatar uses, where a pool entry may be a single name */
      + (m.photo_url ? '' : esc(String(m.name || '?').trim().split(/\s+/).slice(0, 2)
          .map(function (w) { return w[0] || ''; }).join('').toUpperCase())) + '</span>'
      + '<div class="g"><b>' + esc(m.name || 'Member') + '</b><span>' + esc(m.email || 'FFP member') + '</span></div>'
      + '<span class="og-team">' + ic('groups') + '<b>' + esc(m.team || 'Team') + '</b></span>'
      + '<span class="ms act" title="Remove" onclick="FFPLeague.mgRemove(\'' + m.id + '\')">close</span></div>';
  }

  function mgrAddHtml() {
    var ts = S._mgTeams || [];
    return '<div class="lg-offadd"><div class="og-two">'
      + '<div class="f"><label>FFP member</label><div class="lg-offsrch">'
      + '<input class="lg-in" id="lg-root-mgq" autocomplete="off" placeholder="Search FFP members by name or email" oninput="FFPLeague.mgSearch(this.value)">'
      + '<div id="lg-root-mgres" class="lg-offres"></div></div></div>'
      + '<div class="f"><label>Team they manage</label><select class="lg-sel" onchange="FFPLeague.mgTeam(this.value)">'
      + '<option value="">Choose a team&hellip;</option>'
      + ts.map(function (t) {
          return '<option value="' + t.entrant_id + '"' + (S.mgEnt === t.entrant_id ? ' selected' : '') + '>'
            + esc(t.name) + (t.division ? ' (' + esc(t.division) + ')' : '') + '</option>';
        }).join('')
      + '</select></div>'
      + '<button class="lg-btn pri" onclick="FFPLeague.mgAssign()">' + ic('check') + 'Assign</button>'
      + '</div><div class="og-note">' + ic('info')
      + 'They must already have an FFP account. A manager names real people on a sheet, so we know who they are before they can.</div></div>';
  }

  function mgOpen(on) { S.mgAdd = !!on; S.mgSel = null; S.mgEnt = null; S._mgRes = []; renderTab(); }
  function mgTeam(v) { S.mgEnt = v || null; }

  var _mgTmr;
  function mgSearch(q) {
    S.mgSel = null;
    clearTimeout(_mgTmr);
    if (!q || q.trim().length < 2) {
      S._mgRes = [];
      var b0 = document.getElementById('lg-root-mgres'); if (b0) b0.innerHTML = '';
      return;
    }
    _mgTmr = setTimeout(async function () {
      var r; try { r = await sb().rpc('lt_member_search', { p_q: q.trim() }); } catch (e) { r = null; }
      S._mgRes = (r && r.data) || [];
      var b = document.getElementById('lg-root-mgres'); if (!b) return;
      b.innerHTML = S._mgRes.length ? S._mgRes.map(function (m) {
        return '<button type="button" class="lg-offopt" onclick="FFPLeague.mgPick(\'' + m.id + '\')">'
          + '<span class="av" style="' + (m.photo ? 'background-image:url(\'' + esc(m.photo) + '\')' : '') + '"></span>'
          + '<span class="g"><b>' + esc(m.name) + '</b><span>' + esc([m.city, m.email_hint].filter(Boolean).join(', ')) + '</span></span>'
          + '<span class="pk">Select</span></button>';
      }).join('') : '<div class="lg-offnone">No FFP account for that name. They register at findfitpeople.com first.</div>';
    }, 300);
  }

  function mgPick(id) {
    var m = (S._mgRes || []).find(function (x) { return x.id === id; }); if (!m) return;
    S.mgSel = { id: m.id, name: m.name };
    var i = document.getElementById('lg-root-mgq'); if (i) i.value = m.name;
    var b = document.getElementById('lg-root-mgres');
    if (b) b.innerHTML = '<div class="lg-offpicked">' + ic('check') + esc(m.name) + ' selected</div>';
  }

  async function mgAssign() {
    if (!S.mgSel) { toast('Pick an FFP member first', 'error'); return; }
    if (!S.mgEnt) { toast('Pick the team they manage', 'error'); return; }
    var r; try {
      r = await sb().rpc('lt_team_manager_assign', { p_scope: 'league', p_event: S.eventId, p_entrant: S.mgEnt, p_member: S.mgSel.id });
    } catch (e) { r = { error: e }; }
    if (r && r.error) {
      var t = String(r.error.message || r.error);
      toast(/no_ffp_account/.test(t) ? 'That person has no FFP account'
          : /not_owner/.test(t) ? 'Only the organiser can assign managers'
          : /entrant_not_in_this_event/.test(t) ? 'That team is not in this event'
          : 'Could not assign', 'error');
      return;
    }
    S.mgAdd = false; S.mgSel = null; S.mgEnt = null; S._mgRes = [];
    toast('Manager assigned', 'success'); renderTab();
  }

  async function mgRemove(id) {
    var r; try { r = await sb().rpc('lt_team_manager_remove', { p_id: id }); } catch (e) { r = { error: e }; }
    if (r && r.error) { toast('Could not remove', 'error'); return; }
    toast('Removed', 'success'); renderTab();
  }

  function poolHtml(rows) {
    var open = S.ofMode === 'pool';
    return '<div class="og-sec">'
      + '<div class="og-hd">' + ic('shield') + '<div class="t"><b>Officials</b><span>An FFP account, or just a name and photo. Picked per match on the Schedule tab.</span></div>'
      + '<button class="lg-btn" onclick="FFPLeague.openAdd(' + (open ? 'null' : "'pool'") + ')">' + ic(open ? 'close' : 'add') + (open ? 'Cancel' : 'Add') + '</button></div>'
      + (open ? addFormHtml('pool') : '')
      + (rows.length
          ? '<div class="og-pool">' + rows.map(function (o) {
              return '<span class="og-chip' + (o.member_id ? '' : ' noacct') + '">' + ofAvatar(o)
                + '<b>' + esc(o.name || o.email || 'Official') + '</b>'
                + '<em class="ms" title="Photo" onclick="FFPLeague.ofPhoto(\'' + o.id + '\')">photo_camera</em>'
                + '<em class="ms" onclick="FFPLeague.removeOfficial(\'' + o.id + '\')">close</em></span>';
            }).join('') + '</div>'
          : '<div class="lg-empty">No officials yet.</div>')
      + '<div class="og-foot">They appear on the match sheet and the broadcast graphics. No app.</div>'
      + '</div>';
  }

  function crewSecHtml(k, rows) {
    var open = S.ofMode === k[0];
    return '<div class="og-crew">'
      + '<div class="og-ch"><b>' + esc(k[1]) + '</b><span class="og-app">' + esc(k[2]) + '</span><span class="sp"></span>'
      + '<button class="lg-btn' + (open ? ' on' : '') + '" onclick="FFPLeague.openAdd(' + (open ? 'null' : "'" + k[0] + "'") + ')">'
      + ic(open ? 'close' : 'add') + (open ? 'Cancel' : 'Add') + '</button></div>'
      + (open ? addFormHtml(k[0]) : '')
      + (rows.length ? rows.map(function (o) {
          return '<div class="lg-row">' + ofAvatar(o)
            + '<div class="g"><b>' + esc(o.name || 'Crew') + '</b><span>' + esc(o.email || 'FFP member') + '</span></div>'
            + accSel(o)
            + '<span class="ms act" onclick="FFPLeague.removeOfficial(\'' + o.id + '\')">close</span></div>'
            + (S.accFor === o.id ? accPickerHtml(o) : '');
        }).join('') : '<div class="lg-empty">Nobody yet.</div>')
      + '</div>';
  }

  /* One add form, reused. For the pool a typed name is enough; for crew the
     only way through is picking a real FFP member. */
  function addFormHtml(mode) {
    var crew = mode !== 'pool';
    return '<div class="lg-offadd"><div class="lg-offsrch">'
      + '<input class="lg-in" id="lg-ofname" autocomplete="off" placeholder="'
      + (crew ? 'Search FFP members by name or email' : 'Search FFP members, or type a new name')
      + '" oninput="FFPLeague.ofSearch(this.value)"><div id="lg-ofres" class="lg-offres"></div></div>'
      + (crew ? '<div class="og-note">' + ic('info') + 'They must already have an FFP account. Someone without one registers at findfitpeople.com first.</div>'
              : '<div class="lg-offrow"><button class="lg-btn pri" onclick="FFPLeague.addPoolOfficial()">' + ic('add') + 'Add to the pool</button></div>')
      + '</div>';
  }

  function openAdd(mode) { S.ofMode = mode || null; S._ofSel = null; S._ofRes = []; S.accFor = null; renderTab(); }

  var _ofTmr;
  function ofSearch(q) {
    S._ofSel = null;
    clearTimeout(_ofTmr);
    if (!q || q.trim().length < 2) { S._ofRes = []; var el0 = document.getElementById('lg-ofres'); if (el0) el0.innerHTML = ''; return; }
    _ofTmr = setTimeout(async function () {
      var r; try { r = await sb().rpc('lt_member_search', { p_q: q.trim() }); } catch (e) { r = null; }
      S._ofRes = (r && r.data) || [];
      var el = document.getElementById('lg-ofres'); if (!el) return;
      var crew = S.ofMode && S.ofMode !== 'pool';
      el.innerHTML = S._ofRes.length ? S._ofRes.map(function (m) {
        return '<button type="button" class="lg-offopt" onclick="FFPLeague.ofPick(\'' + m.id + '\')"><span class="av" style="' + (m.photo ? 'background-image:url(\'' + esc(m.photo) + '\')' : '') + '"></span><span class="g"><b>' + esc(m.name) + '</b><span>' + esc([m.city, m.email_hint].filter(Boolean).join(', ')) + '</span></span><span class="pk">' + (crew ? 'Add' : 'Select') + '</span></button>';
      }).join('') : '<div class="lg-offnone">' + (crew
        ? 'No FFP account for that name. They register at findfitpeople.com first.'
        : 'No FFP member found — you can still add this name.') + '</div>';
    }, 300);
  }

  async function ofPick(id) {
    var m = (S._ofRes || []).find(function (x) { return x.id === id; }); if (!m) return;
    if (S.ofMode && S.ofMode !== 'pool') { await addCrew(m); return; }   // crew: one tap adds
    S._ofSel = { member_id: m.id, name: m.name };
    var nmI = document.getElementById('lg-ofname'); if (nmI) nmI.value = m.name;
    var el = document.getElementById('lg-ofres'); if (el) el.innerHTML = '<div class="lg-offpicked">' + ic('check') + esc(m.name) + ' — FFP member linked</div>';
  }

  async function addCrew(m) {
    var role = S.ofMode;
    var r; try { r = await sb().rpc('lt_official_add', { p_scope: 'league', p_event: S.eventId, p_member: m.id, p_name: m.name, p_email: null, p_role: role }); }
    catch (e) { r = { error: e }; }
    if (r && r.error) {
      toast(/crew_needs_ffp_account/.test(String(r.error.message || r.error)) ? 'That person has no FFP account' : 'Could not add', 'error');
      return;
    }
    S.ofMode = null; S._ofSel = null; S._ofRes = [];
    toast('Added', 'success'); renderTab();
  }

  async function addPoolOfficial() {
    var sel = S._ofSel, nm = ((document.getElementById('lg-ofname') || {}).value || '').trim();
    if (!sel && !nm) return;
    var r; try {
      r = await sb().rpc('lt_official_add', sel && sel.member_id
        ? { p_scope: 'league', p_event: S.eventId, p_member: sel.member_id, p_name: sel.name || nm, p_email: null, p_role: 'official' }
        : { p_scope: 'league', p_event: S.eventId, p_member: null, p_name: nm, p_email: null, p_role: 'official' });
    } catch (e) { r = { error: e }; }
    if (r && r.error) { toast('Could not add', 'error'); return; }
    S.ofMode = null; S._ofSel = null; S._ofRes = [];
    toast('Added', 'success'); renderTab();
  }

  // ---- access scope ----
  async function setAccess(id, val) {
    if (val === 'full') {
      var r; try { r = await sb().rpc('lt_official_set_access', { p_id: id, p_access: 'full', p_days: null, p_matches: null }); } catch (e) { r = { error: e }; }
      if (r && r.error) { toast('Could not update', 'error'); return; }
      S.accFor = null; toast('Full access', 'success'); renderTab(); return;
    }
    var o = (S._officials || []).find(function (x) { return x.id === id; }) || {};
    S.accFor = id;
    S.accDays = (o.days || []).slice();
    S.accMatches = (o.matches || []).slice();
    if (!S._days) {
      try { var d = await sb().rpc('lt_event_days', { p_scope: 'league', p_event: S.eventId }); S._days = (d && d.data) || []; } catch (e) { S._days = []; }
      try { var mm = await sb().rpc('lt_event_matches', { p_scope: 'league', p_event: S.eventId }); S._matches = (mm && mm.data) || []; } catch (e) { S._matches = []; }
    }
    renderTab();
  }
  function accPickerHtml(o) {
    var days = S._days || [], ms = S._matches || [];
    return '<div class="og-pick">'
      + '<div class="og-pickh">What can ' + esc((o.name || 'they').split(' ')[0]) + ' reach?</div>'
      + (days.length ? '<div class="og-pl">Days</div>' + days.map(function (d) {
          var on = (S.accDays || []).indexOf(d.day) >= 0;
          return '<label class="og-opt"><input type="checkbox"' + (on ? ' checked' : '') + ' onchange="FFPLeague.accDay(\'' + d.day + '\')"><span>' + esc(fmtDay(d.day)) + '</span><em>' + d.n + ' matches</em></label>';
        }).join('') : '')
      + (ms.length ? '<div class="og-pl">Or single matches</div>' + ms.slice(0, 60).map(function (m) {
          var on = (S.accMatches || []).indexOf(m.id) >= 0;
          return '<label class="og-opt"><input type="checkbox"' + (on ? ' checked' : '') + ' onchange="FFPLeague.accMatch(\'' + m.id + '\')"><span>' + esc(m.home + ' v ' + m.away) + '</span><em>' + esc(m.division || '') + '</em></label>';
        }).join('') : '')
      + '<div class="og-pickb"><button class="lg-btn pri" onclick="FFPLeague.accSave()">' + ic('check') + 'Save access</button>'
      + '<button class="lg-btn" onclick="FFPLeague.accCancel()">Cancel</button></div></div>';
  }
  function accDay(d) { S.accDays = S.accDays || []; var i = S.accDays.indexOf(d); if (i >= 0) S.accDays.splice(i, 1); else S.accDays.push(d); }
  function accMatch(id) { S.accMatches = S.accMatches || []; var i = S.accMatches.indexOf(id); if (i >= 0) S.accMatches.splice(i, 1); else S.accMatches.push(id); }
  function accCancel() { S.accFor = null; renderTab(); }
  async function accSave() {
    var id = S.accFor; if (!id) return;
    if (!(S.accDays || []).length && !(S.accMatches || []).length) { toast('Pick at least one day or match', 'error'); return; }
    var r; try {
      r = await sb().rpc('lt_official_set_access', { p_id: id, p_access: 'limited', p_days: S.accDays || [], p_matches: S.accMatches || [] });
    } catch (e) { r = { error: e }; }
    if (r && r.error) { toast('Could not save access', 'error'); return; }
    S.accFor = null; toast('Access saved', 'success'); renderTab();
  }

  /* An official's photo. It shows beside them on the match screen in the app
     and fills their cell on the broadcast officials card. An official linked
     to an FFP account already falls back to their profile picture, so this is
     only needed for someone without one - or to override it. */
  function ofPhoto(id) {
    if (!window.FFPUpload) { toast('Uploader not ready — refresh', 'error'); return; }
    window.FFPUpload.pick({
      bucket: 'provider-logos', key: 'lgofficial-' + id + '-' + Date.now(),
      aspect: 1, outW: 400, outH: 400, title: 'Official photo (square)',
      onDone: function (url) {
        sb().rpc('lt_official_set_photo', { p_id: id, p_url: url }).then(function (r) {
          if (r && r.error) { toast(r.error.message || 'Could not save the photo', 'error'); return; }
          toast('Photo saved', 'success'); renderTab();
        });
      },
      onError: function () { toast('Upload failed', 'error'); }
    });
  }
  async function removeOfficial(id) { await sb().rpc('lt_official_remove', { p_id: id }); renderTab(); }

  // ---------- VENUES ----------
  async function renderVenues(host) {
    host.innerHTML = '<div class="lg-tool"><div><div class="lg-h1" style="font-size:18px">Venues and ' + surfWord(true) + '</div><div class="lg-sub">A venue can hold many ' + surfWord(true) + '</div></div><span class="sp"></span><button class="lg-btn pri" onclick="FFPLeague.addVenue()">' + ic('add') + 'Add venue</button></div>'
      + (S.venAdd ? venueEditor(null) : '') + '<div id="lg-venlist"><div class="lg-empty">Loading…</div></div>';
    var r; try { r = await sb().rpc('lt_venues_list', { p_scope: 'league', p_event: S.eventId }); } catch (e) { r = { error: e }; }
    var vs = (r && r.data) || []; var h2 = document.getElementById('lg-venlist');
    // The organiser's own venue courts (Partner > Courts & screens). A court
    // stood on one of them uses that court's permanent screen, so the TV on
    // the wall shows this event without being set up again.
    var mc; try { mc = await sb().rpc('vc_mine'); } catch (e) { mc = {}; }
    var mine = (mc && mc.data) || []; S._vcMine = mine;
    var provs = []; mine.forEach(function (c) { if (!provs.some(function (p) { return p.id === c.provider_id; })) provs.push({ id: c.provider_id, name: c.venue }); });
    var useBar = provs.length ? '<div class="lg-tool" style="margin-top:0">' + provs.map(function (p) {
        return '<button class="lg-btn" onclick="FFPLeague.useMyCourts(\'' + p.id + '\')">' + ic('connected_tv') + 'Add ' + surfWord(true) + ' from ' + esc(p.name) + '</button>';
      }).join('') + '</div>' : '';
    if (useBar) h2.insertAdjacentHTML('beforebegin', '<div id="lg-vcbar">' + useBar + '</div>');
    if (!vs.length && !S.venAdd) { h2.innerHTML = '<div class="lg-empty">No venues yet. Add a venue, then its ' + surfWord(true) + '.</div>'; return; }
    h2.innerHTML = vs.map(function (v) {
      if (S.venEdit === v.id) return venueEditor(v);
      var surfaces = (v.surfaces || []).map(function (s) {
        var link = (S._vcMine || []).length
          ? '<select class="lg-sel lg-vclink" title="Which screen shows this ' + surfWord() + '" onchange="FFPLeague.linkCourt(\'' + s.id + '\',this.value)">'
            + '<option value="">Event-only screen</option>'
            + S._vcMine.map(function (c) { var one = S._vcMine.every(function (x) { return x.provider_id === c.provider_id; }); return '<option value="' + c.id + '"' + (c.id === s.venue_court_id ? ' selected' : '') + '>' + esc(one ? c.name + ' screen' : c.name + ', ' + c.venue) + '</option>'; }).join('')
            + '</select>' : '';
        return '<div class="lg-surf"><span class="ms">sports_score</span>' + esc(s.name)
          + '<span class="sp"></span>' + link
          // The code a TV is set up with — see screenPanel().
          + (s.screen_code ? '<button class="lg-scrbtn' + (s.permanent ? ' perm' : '') + '" title="Scoreboard for this court" onclick="FFPLeague.screenPanel(\'' + esc(s.screen_code) + '\',\'' + esc(s.name) + '\',' + (s.permanent ? 'true' : 'false') + ')"><span class="ms">' + (s.permanent ? 'connected_tv' : 'cast') + '</span>' + esc(s.screen_code) + '</button>' : '')
          + '<span class="ms x" onclick="FFPLeague.removeSurface(\'' + s.id + '\')">delete</span></div>';
      }).join('');
      var vmeta = [v.city, (v.maps_url ? '<a class="lg-maplink" href="' + esc(v.maps_url) + '" target="_blank" rel="noopener">' + ic('map') + 'Map</a>' : '')].filter(Boolean).join(', ');
      var addS = (S.surfAdd === v.id)
        ? '<div class="lg-edit" style="margin-left:44px;border:none;padding-top:8px"><input class="lg-in" id="lg-sfname" placeholder="' + Surf() + ' name" style="max-width:260px" onkeydown="if(event.key===\'Enter\')FFPLeague.saveSurface(\'' + v.id + '\')"><button class="lg-btn pri" onclick="FFPLeague.saveSurface(\'' + v.id + '\')">' + ic('check') + 'Add</button><button class="lg-btn ghost" onclick="FFPLeague.cancelSurface()">Cancel</button></div>'
        : '<div class="lg-addsurf"><button class="lg-btn ghostb" onclick="FFPLeague.addSurface(\'' + v.id + '\')">' + ic('add') + Surf() + '</button></div>';
      return '<div class="lg-venue"><div class="lg-vh"><span class="lg-vpin"><span class="ms">location_on</span></span><div class="g"><b>' + esc(v.name) + '</b><span>' + vmeta + '</span></div><span class="ms act" onclick="FFPLeague.editVenue(\'' + v.id + '\')">edit</span><span class="ms act" onclick="FFPLeague.removeVenue(\'' + v.id + '\')">delete</span></div>'
        + (surfaces ? '<div class="lg-surfs">' + surfaces + '</div>' : '') + addS + '</div>';
    }).join('');
    var f = document.getElementById('lg-vname'); if (f) f.focus();
    var sf = document.getElementById('lg-sfname'); if (sf) sf.focus();
  }
  function venueEditor(v) {
    v = v || {};
    return '<div class="lg-edit"><input class="lg-in" id="lg-vname" placeholder="Venue name" value="' + esc(v.name || '') + '" style="flex:2;min-width:170px">'
      + '<input class="lg-in" id="lg-vcity" list="lg-cityl" placeholder="City" value="' + esc(v.city || '') + '" style="flex:1;min-width:110px"><datalist id="lg-cityl">' + dlOpts(cityNames()) + '</datalist>'
      + '<input class="lg-in" id="lg-vmaps" placeholder="Google Maps link (optional)" value="' + esc(v.maps_url || '') + '" style="flex:2;min-width:180px">'
      + '<button class="lg-btn pri" onclick="FFPLeague.saveVenue(\'' + (v.id || '') + '\')">' + ic('check') + 'Save</button>'
      + '<button class="lg-btn ghost" onclick="FFPLeague.cancelVenue()">Cancel</button></div>';
  }
  function addVenue() { S.venAdd = true; S.venEdit = null; renderTab(); }
  function editVenue(id) { S.venEdit = id; S.venAdd = false; renderTab(); }
  function cancelVenue() { S.venAdd = false; S.venEdit = null; renderTab(); }
  async function saveVenue(id) {
    var nm = v('lg-vname'); if (!nm || !nm.trim()) { toast('Name required', 'error'); return; }
    var r; try { r = await sb().rpc('lt_venue_save', { p_scope: 'league', p_event: S.eventId, p_id: id || null, p_name: nm.trim(), p_city: v('lg-vcity') || null, p_maps: v('lg-vmaps') || null }); } catch (e) { r = { error: e }; }
    if (r.error) { toast('Save failed', 'error'); return; } S.venAdd = false; S.venEdit = null; toast('Saved', 'success'); renderTab();
  }
  async function removeVenue(id) { await sb().rpc('lt_venue_remove', { p_id: id }); toast('Removed', 'success'); renderTab(); }
  function addSurface(vid) { S.surfAdd = vid; renderTab(); }
  async function useMyCourts(pid) {
    var r; try { r = await sb().rpc('lt_fields_from_venue', { p_scope: 'league', p_event: S.eventId, p_provider: pid }); } catch (e) { r = { error: e }; }
    if (r.error) { toast('Could not add the ' + surfWord(true), 'error'); return; }
    toast(r.data ? (r.data + ' ' + (r.data === 1 ? surfWord() : surfWord(true)) + ' added, on their own screens') : 'All your ' + surfWord(true) + ' are already here', 'success');
    renderTab();
  }
  async function linkCourt(fid, cid) {
    var r; try { r = await sb().rpc('lt_field_link', { p_field: fid, p_court: cid || null }); } catch (e) { r = { error: e }; }
    if (r.error) { toast('Could not change the screen', 'error'); return; }
    toast(cid ? 'Now on that ' + surfWord() + '\'s screen' : 'Back to an event-only screen', 'success');
    renderTab();
  }
  function cancelSurface() { S.surfAdd = null; renderTab(); }
  async function saveSurface(vid) {
    var nm = v('lg-sfname'); if (!nm || !nm.trim()) return;
    var r; try { r = await sb().rpc('lt_field_save', { p_scope: 'league', p_event: S.eventId, p_id: null, p_name: nm.trim(), p_start: null, p_venue: vid }); } catch (e) { r = { error: e }; }
    if (r.error) { toast('Add failed', 'error'); return; } S.surfAdd = null; toast('Added', 'success'); renderTab();
  }
  async function removeSurface(id) { await sb().rpc('lt_field_remove', { p_id: id }); renderTab(); }

  // ---------- SCHEDULE ----------
  /* The schedule belongs to the LEAGUE, not to one division. A court takes
     whatever fits, so every division is laid out together in one pass and each
     row carries its division's colour. Auto-plan is pressed once; after that
     the grid is edited by hand and Rebuild has to be asked for. */
  function hm(t) { return String(t || '').slice(0, 5); }
  function lgDateStr(iso) { return iso ? zoneDate(iso, evTz()) : ''; }
  function lgTimeStr(iso) { return iso ? zoneTime(iso, evTz()) : ''; }
  function lgIso(day, time) { return zoneToISO(day, time || '00:00', evTz()); }
  function lgDayLong(ymd) {
    var a = String(ymd).split('-'); if (a.length !== 3) return String(ymd);
    var p = new Date(Date.UTC(+a[0], +a[1] - 1, +a[2], 12, 0, 0));
    return ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][p.getUTCDay()]
      + ' ' + (+a[2]) + ' ' + MON[+a[1] - 1] + ' ' + a[0];
  }
  function tzLabel() { return String(evTz()).split('/').pop().replace(/_/g, ' '); }
  function dayKey(f) { return f.scheduled_at ? lgDateStr(f.scheduled_at) : ''; }
  function sportRow() {
    var k = (S.detail && S.detail.event && S.detail.event.sport_key) || null;
    return (S.sports || []).filter(function (s) { return s.key === k; })[0] || null;
  }
  /* NOT EVERYTHING IS A COURT. A football club plays on a pitch, an AFL club on
     an oval, a table tennis club on a table. The sport supplies the word and a
     venue may override it, so no label assumes. */
  function surfWord(plural) {
    var v = (S._fields || []).filter(function (x) { return x.surface_word; })[0];
    if (v) {
      var w = String(v.surface_word).trim();
      return plural ? (/(ch|sh|s|x|z)$/.test(w) ? w + 'es' : w + 's') : w;
    }
    var s = sportRow();
    var sw = s && (plural ? s.surface_word_plural : s.surface_word);
    return sw || (plural ? 'courts' : 'court');
  }
  function Surf(plural) { var w = surfWord(plural); return w.charAt(0).toUpperCase() + w.slice(1); }
  // an oval, a pitch: the article follows the word, not the other way round
  function aSurf(plural) { var w = surfWord(plural); return (/^[aeiou]/i.test(w) ? 'an ' : 'a ') + w; }

  /* THE SPORT KNOWS HOW LONG ITS MATCH TAKES, so nobody is asked to type it.
     A sport played to a clock states its periods and its break; one played to a
     score states how long a surface is held for. The organiser is left with the
     one thing the sport cannot know: the gap on that surface afterwards. */
  function matchMins() {
    var ev = (S.detail && S.detail.event) || {}, s = sportRow() || {};
    if (ev.plan_match_len) return +ev.plan_match_len;
    var pm = ev.period_minutes || s.period_minutes, pc = ev.period_count || s.period_count;
    if (pm && pc) return (pm * pc) + (+s.break_minutes || 0);
    return +s.slot_minutes || 30;
  }
  function matchMinsWhy() {
    var ev = (S.detail && S.detail.event) || {}, s = sportRow() || {};
    if (ev.plan_match_len) return 'Set by hand';
    var pm = ev.period_minutes || s.period_minutes, pc = ev.period_count || s.period_count;
    if (pm && pc) return pc + ' periods of ' + pm + ' min'
      + (s.break_minutes ? ', plus ' + s.break_minutes + ' at the break' : '') + ', from the sport';
    if (s.slot_minutes) return 'What ' + (s.name || 'this sport') + ' is usually given';
    return 'No sport set yet, so 30 min is assumed';
  }
  function turnMins() {
    var ev = (S.detail && S.detail.event) || {}, s = sportRow() || {};
    return ev.plan_turnaround != null ? +ev.plan_turnaround : (+s.turnaround_minutes || 0);
  }
  function mlenEdit() { S.mlenEdit = !S.mlenEdit; renderTab(); }
  function planNow() {
    var g = function (id, d) { var el = document.getElementById(id); var v2 = el ? String(el.value || '').trim() : ''; return v2 || d; };
    var ml = document.getElementById('lg-mlen');
    return { len: ml ? Math.max(5, +ml.value || matchMins()) : matchMins(),
             start: g('lg-dstart', '09:00'), end: g('lg-dend', '21:00'),
             days: Math.max(1, +g('lg-days', String(seasonDays())) || 1),
             gap: Math.max(0, +g('lg-rgap', '0') || 0), rest: Math.max(0, +g('lg-rest', '0') || 0),
             turn: Math.max(0, +g('lg-turn', String(turnMins())) || 0) };
  }
  function hm5(t) { return t ? String(t).slice(0, 5) : null; }
  /* THE PLAYING DAY IS A SETTING, NOT A FORM. It used to be typed into this tab
     and thrown away on reload, so nobody could rely on it and the schedule could
     never lay itself out. It lives on the event now and is saved as it is
     changed. */
  function planFromEvent(ev, defDays) {
    ev = ev || {};
    return { len:   matchMins(),
             start: hm5(ev.plan_day_start) || '09:00',
             end:   hm5(ev.plan_day_end)   || '21:00',
             days:  +ev.plan_days || defDays || 1,
             gap:   +ev.plan_round_gap || 0,
             rest:  +ev.plan_rest || 0,
             turn:  turnMins() };
  }
  var _planT = null;
  function planSave() {
    var P = S.plan || planNow();
    var ev = (S.detail && S.detail.event) || null;
    if (ev) {
      ev.plan_day_start = P.start; ev.plan_day_end = P.end;
      ev.plan_days = P.days; ev.plan_round_gap = P.gap; ev.plan_rest = P.rest;
      ev.plan_turnaround = P.turn;
      if (S.mlenEdit) ev.plan_match_len = P.len;
    }
    // a setting saved mid-typing is not worth a toast, and a failure is retried
    // by the next keystroke
    try {
      var patch = { plan_day_start: P.start, plan_day_end: P.end, plan_days: String(P.days),
        plan_round_gap: String(P.gap), plan_rest: String(P.rest), plan_turnaround: String(P.turn) };
      // only an explicit override is stored, so the sport keeps driving the rest
      if (S.mlenEdit) patch.plan_match_len = String(P.len);
      sb().rpc('league_event_save', { p_id: S.eventId, p: patch });
    } catch (e) {}
  }
  function planSet() { S.plan = planNow(); clearTimeout(_planT); _planT = setTimeout(planSave, 700); }
  // A league runs over a season, not an afternoon, so the day count starts at
  // the length of the season rather than at 1.
  function seasonDays() {
    var ev = (S.detail && S.detail.event) || {};
    if (!ev.starts_at || !ev.ends_at) return 1;
    var a = new Date(ev.starts_at + 'T12:00:00Z'), b = new Date(ev.ends_at + 'T12:00:00Z');
    var n = Math.round((b - a) / 86400000) + 1;
    return (n > 0 && n < 400) ? n : 1;
  }
  function setSchedDiv(v2) { S.schedDiv = v2 || ''; renderTab(); }
  function setSchedRound(v2) { S.schedRound = v2 || ''; renderTab(); }

  async function renderSchedule(host) {
    /* The sport supplies the match length and the word for a playing surface,
       and S.sports is only filled by the Setup tab, so a schedule opened first
       had no sport at all and fell back to "30 min" and "court". */
    await loadSports();
    var divs = S.detail.divisions || [];
    if (!S.divId && divs.length) S.divId = divs[0].id;
    var P = S.plan || (S.plan = planFromEvent(S.detail.event, seasonDays()));
    var fr; try { fr = await sb().rpc('lt_fields_list', { p_scope: 'league', p_event: S.eventId }); } catch (e) { fr = { error: e }; }
    var fields = (fr && fr.data) || []; S._fields = fields;
    host.innerHTML = '<div id="lg-schedtop"></div><div id="lg-schedlist"><div class="lg-empty">Loading…</div></div>';
    var top = document.getElementById('lg-schedtop'), box = document.getElementById('lg-schedlist');
    if (!divs.length) { box.innerHTML = '<div class="lg-empty">Add a division first.</div>'; return; }

    var divIx = {}, divNm = {};
    divs.forEach(function (d, i) { divIx[d.id] = i % 10; divNm[d.id] = d.name; });

    // Names are per division, so they are gathered per division and merged.
    var names = {};
    for (var i = 0; i < divs.length; i++) {
      var rr; try { rr = await sb().rpc('league_roster', { p_division: divs[i].id }); } catch (e) { rr = null; }
      ((rr && rr.data) || []).forEach(function (en) { names[en.id] = en.name; });
    }

    var mr; try {
      mr = await sb().from('league_fixtures')
        .select('id,division_id,stage,round,sort,status,home_entrant,away_entrant,scheduled_at,court,field_id')
        .eq('league_id', S.eventId);
    } catch (e) { mr = { error: e }; }
    // A bye is not a match: nobody turns up for it and it takes no court.
    var ms = ((mr && mr.data) || []).filter(function (m) {
      return m.status !== 'void' && m.status !== 'bye' && String(m.stage || '') !== 'bye';
    });
    if (!ms.length) { box.innerHTML = '<div class="lg-empty">No fixtures yet. Generate them on the <b>Fixtures &amp; results</b> tab.</div>'; return; }
    if (!fields.length) { box.innerHTML = '<div class="lg-empty">Add a venue and its ' + surfWord(true) + ' on the <b>Venues</b> tab and the schedule builds itself.</div>'; return; }
    if (!(S.detail.event && S.detail.event.starts_at)) {
      box.innerHTML = '<div class="lg-empty act"><div class="t">When does the season start?</div>'
        + '<div class="s">Set the season start on Information and every fixture is given a date, a time and ' + aSurf() + ' straight away.</div>'
        + '<div class="row"><button class="lg-btn pri" onclick="FFPLeague.tab(\'information\')">' + ic('event') + 'Go to Information</button></div></div>';
      return;
    }
    /* The schedule builds itself once the fixtures, the surfaces and the season
       start all exist. Only when nothing is placed, so an edited schedule is
       never moved. */
    if (!S._autoPlanned && !ms.some(function (m) { return m.scheduled_at; })) {
      S._autoPlanned = true;
      var ap; try {
        ap = await sb().rpc('league_autoplan_all', { p_league: S.eventId, p_match_len: P.len,
          p_day_start: P.start, p_day_end: P.end, p_days: P.days, p_round_gap: P.gap,
          p_rest: P.rest, p_divisions: null, p_tz: evTz(), p_turnaround: P.turn });
      } catch (e) { ap = null; }
      if (ap && !ap.error && ap.data && (ap.data.placed || 0) > 0) {
        toast(ap.data.placed + ' matches given a time and ' + aSurf(), 'success');
        return renderSchedule(host);
      }
    }

    var offr; try { offr = await sb().rpc('lt_officials_list', { p_scope: 'league', p_event: S.eventId }); } catch (e) { offr = null; }
    S._offs = (offr && offr.data) || [];
    var moMap = {};
    try {
      var mo = await sb().from('lt_match_officials').select('id,match_id,role,official_id')
        .eq('scope', 'league').in('match_id', ms.map(function (m) { return m.id; }));
      var offName = {}; S._offs.forEach(function (o) { offName[o.id] = o.name || o.email; });
      ((mo && mo.data) || []).forEach(function (x) {
        (moMap[x.match_id] = moMap[x.match_id] || []).push({ id: x.id, official_id: x.official_id, role: x.role, name: offName[x.official_id] || 'Official' });
      });
    } catch (e) {}
    ms.forEach(function (m) {
      m._names = names; m._offs = moMap[m.id] || [];
      m._dix = divIx[m.division_id] || 0; m._dnm = divNm[m.division_id] || '';
    });
    S._sched = ms;

    var fById = {}; fields.forEach(function (f) { fById[f.id] = f; });
    var placed = function (m) { return !!(m.scheduled_at && m.field_id && fById[m.field_id]); };
    var built = ms.length > 0 && ms.every(placed);
    var shown = ms.filter(function (m) {
      return (!S.schedDiv || m.division_id === S.schedDiv)
          && (!S.schedRound || String(m.round == null ? '' : m.round) === String(S.schedRound));
    });
    S._rounds = []; ms.forEach(function (m) {
      if (m.round != null && S._rounds.indexOf(m.round) < 0) S._rounds.push(m.round); });
    S._rounds.sort(function (a, b) { return a - b; });

    /* A LEAGUE IS NOT A TOURNAMENT DAY. A tournament fills several courts at
       once for a weekend, so a court is the thing worth grouping by. A league
       plays one or two matches on a date and runs for weeks, so grouping by
       court gave a whole dark band to a single row. The date is the frame here;
       the round and the surface are facts on the row, where they read fastest.
       There is no main field in a league either, so that control is gone. */
    var days = {}, loose = [];
    shown.forEach(function (m) {
      if (!placed(m)) { loose.push(m); return; }
      var d = dayKey(m); (days[d] = days[d] || []).push(m);
    });
    var dayList = Object.keys(days).sort();

    top.innerHTML = schedTop(built, divs, P) + (built ? divKey(divs) : '');

    var roundWord = function (list) {
      var rs = []; list.forEach(function (m) { if (m.round != null && rs.indexOf(m.round) < 0) rs.push(m.round); });
      rs.sort(function (a, b) { return a - b; });
      if (!rs.length) return '';
      return rs.length === 1 ? 'Round ' + rs[0] : 'Rounds ' + rs[0] + ' to ' + rs[rs.length - 1];
    };

    var html = '';
    dayList.forEach(function (d) {
      var list = days[d];
      list.sort(function (a, b) { return new Date(a.scheduled_at) - new Date(b.scheduled_at) || fxRank(a) - fxRank(b); });
      var rw = roundWord(list);
      // A fixture is created on the Fixtures tab, where the round and the
      // entrants are chosen properly. This screen places what already exists.
      html += '<div class="sc-ch"><b>' + esc(lgDayLong(d)) + '</b>'
        + (rw ? '<span class="mn">' + esc(rw) + '</span>' : '')
        + '<span class="ct">' + list.length + (list.length === 1 ? ' match, ' : ' matches, ') + esc(tzLabel()) + ' time</span></div>'
        + list.map(function (m) { return schedRow(m); }).join('');
    });

    if (loose.length) {
      // Nothing here has a date yet, so the round IS the order: these were
      // generated a round at a time and that is how an organiser reads them.
      loose.sort(function (a, b) { return fxRank(a) - fxRank(b) || (a.round || 0) - (b.round || 0) || (a.sort || 0) - (b.sort || 0); });
      html += '<div class="sc-ch warn"><b>Not on the schedule yet</b>'
        + '<span class="ct">' + loose.length + (loose.length === 1 ? ' match has' : ' matches have')
        + ' no date, no time and no ' + surfWord() + '</span>'
        + '<button class="sc-add" onclick="FFPLeague.autoplan()">' + ic('auto_awesome') + 'Auto-plan now</button></div>';
      var lastR = '\u0000';
      loose.forEach(function (m) {
        var rl = fxLabel(m);
        if (rl !== lastR) { html += '<div class="sc-rd">' + esc(rl) + '</div>'; lastR = rl; }
        html += schedRow(m);
      });

    }
    if (!html) html = '<div class="lg-empty">Nothing matches that filter.</div>';
    box.innerHTML = html + (S.rb ? rbSheet() : '');
  }

  function divKey(divs) {
    if (divs.length < 2) return '';
    return '<div class="sc-key">' + divs.map(function (d, i) {
      return '<span class="k lg-d' + (i % 10) + '"><i></i>' + esc(d.name) + '</span>';
    }).join('') + '</div>';
  }

  function schedTop(built, divs, P) {
    var dopt = '<option value="">All divisions</option>' + divs.map(function (d) {
      return '<option value="' + d.id + '"' + (S.schedDiv === d.id ? ' selected' : '') + '>' + esc(d.name) + '</option>';
    }).join('');
    var N = evNouns();
    return '<div class="lg-tool">'
      + (divs.length > 1 ? '<select class="lg-sel" style="width:auto;min-width:170px" title="Filters what you are looking at. Auto-plan always builds every division." onchange="FFPLeague.setSchedDiv(this.value)">' + dopt + '</select>' : '')
      + ((S._rounds || []).length > 1
        ? '<select class="lg-sel" style="width:auto;min-width:130px" title="Filters what you are looking at." onchange="FFPLeague.setSchedRound(this.value)">'
          + '<option value="">All rounds</option>'
          + S._rounds.map(function (r) {
              return '<option value="' + r + '"' + (String(S.schedRound) === String(r) ? ' selected' : '') + '>Round ' + r + '</option>';
            }).join('') + '</select>' : '')
      + '<span class="sp"></span>'
      + (built
        ? '<button class="lg-btn ghost" onclick="FFPLeague.rebuildAsk()">' + ic('build') + 'Rebuild</button>'
        : '<button class="lg-btn pri" onclick="FFPLeague.autoplan()">' + ic('auto_awesome') + 'Auto-plan the season</button>')
      + '</div>'
      + '<div class="sc-plan">A match takes '
      + (S.mlenEdit
          ? '<input class="lg-in" id="lg-mlen" type="number" min="5" value="' + P.len + '" oninput="FFPLeague.planSet()"> min'
          : '<b class="mlen">' + matchMins() + ' min</b>')
      + '<button class="sc-mlenb" onclick="FFPLeague.mlenEdit()">' + (S.mlenEdit ? 'use the sport' : 'change') + '</button>, '
      + '<input class="lg-in" id="lg-turn" type="number" min="0" value="' + P.turn + '" oninput="FFPLeague.planSet()"> min between matches on ' + esc(aSurf()) + '</div>'
      + '<div class="sc-why">' + esc(matchMinsWhy()) + '</div>'
      + '<div class="sc-plan">Playing '
      + '<input class="lg-in w" id="lg-dstart" type="time" value="' + esc(P.start) + '" oninput="FFPLeague.planSet()"> to '
      + '<input class="lg-in w" id="lg-dend" type="time" value="' + esc(P.end) + '" oninput="FFPLeague.planSet()">, '
      + 'over <input class="lg-in" id="lg-days" type="number" min="1" value="' + P.days + '" oninput="FFPLeague.planSet()"> day(s)</div>'
      + '<div class="sc-plan"><input class="lg-in" id="lg-rgap" type="number" min="0" value="' + P.gap + '" oninput="FFPLeague.planSet()"> min between rounds, '
      + '<input class="lg-in" id="lg-rest" type="number" min="0" value="' + P.rest + '" oninput="FFPLeague.planSet()"> min rest between ' + N.poss + ' matches</div>';
  }

  /* REBUILD IS A CHOICE, NOT A BUTTON.
     It used to call autoplan and nothing else, so it only ever re-timed the
     matches — the teams never moved, and the draw itself was deterministic
     (circle method over seed/created_at), so it could not move even if asked.
     Now it asks WHAT to rebuild:
       times    — autoplan, the old behaviour, named honestly. Whole league.
       redraw   — league_fixtures_redraw. New pairings. One division.
       byes     — league_bye_order_set. Who sits out which round. One division.
     Played rounds are never touched by either of the last two: the database
     refuses it, and the UI locks them. */
  function rbDivId() {
    var ds = (S.detail && S.detail.divisions) || [];
    if (S.rbDiv && ds.some(function (d) { return d.id === S.rbDiv; })) return S.rbDiv;
    if (S.schedDiv) return S.schedDiv;
    return ds.length ? ds[0].id : null;
  }
  function rbDivName() {
    var ds = (S.detail && S.detail.divisions) || [], id = rbDivId();
    var d = ds.filter(function (x) { return x.id === id; })[0];
    return (d && d.name) || 'this division';
  }
  async function rbLoad() {
    var id = rbDivId(); if (!id) { S.rbInfo = null; return; }
    var r; try { r = await sb().rpc('league_rounds_info', { p_division: id }); } catch (e) { r = { error: e }; }
    S.rbInfo = (r && !r.error && r.data) || { teams: 0, played_rounds: 0, rounds: [] };
    S.rbByes = (S.rbInfo.rounds || []).map(function (x) {
      return { round: x.round, at: x.at, played: !!x.played, bye: x.bye_entrant, name: x.bye_name || '' };
    });
  }
  async function rebuildAsk() { S.rbDiv = rbDivId(); S.rb = 'menu'; await rbLoad(); renderTab(); }
  function rebuildCancel() { S.rb = null; S.rbInfo = null; S.rbByes = null; renderTab(); }
  async function rbSetDiv(id) { S.rbDiv = id; await rbLoad(); renderTab(); }
  function rbGo(which) { S.rb = which; renderTab(); }

  function rbSheet() {
    if (S.rb === 'byes') return rbByesSheet();
    if (S.rb === 'redraw') return rbRedrawSheet();
    return rbMenuSheet();
  }
  function rbUnplayed() { return (S.rbByes || []).filter(function (x) { return !x.played; }); }
  function rbSummary() {
    var i = S.rbInfo || {}, rs = (i.rounds || []).length, pl = i.played_rounds || 0;
    var n = (i.teams || 0) + ' teams, ' + rs + (rs === 1 ? ' round' : ' rounds');
    if (!rs) return n + '. No fixtures yet.';
    return n + '. ' + (pl ? (pl === 1 ? 'Round 1 has results entered.' : 'Rounds 1 to ' + pl + ' have results entered.')
                          : 'No results entered yet.');
  }
  function rbRow(icon, title, body, note, action, off) {
    return '<button class="rb-ch' + (off ? ' off' : '') + '"' + (off ? ' disabled' : ' onclick="FFPLeague.' + action + '"') + '>'
      + ic(icon)
      + '<span class="g"><b>' + esc(title) + '</b><span>' + esc(body) + '</span>'
      + (note ? '<em>' + esc(note) + '</em>' : '') + '</span>'
      + '<span class="ms go">chevron_right</span></button>';
  }
  function rbMenuSheet() {
    var i = S.rbInfo || {}, ds = (S.detail && S.detail.divisions) || [];
    var teams = i.teams || 0, rs = (i.rounds || []).length, free = rbUnplayed().length;
    var odd = teams % 2 === 1;
    // byes only exist with an odd field, and there must be two loose rounds to swap
    var byesOff = !odd ? 'With ' + teams + ' teams every team plays every round, so there are no byes.'
                : free < 2 ? 'Only ' + free + ' round' + (free === 1 ? '' : 's') + ' left without results, so there is nothing to swap.'
                : '';
    var redrawOff = !rs ? 'There are no fixtures to redraw yet.'
                  : free < 2 ? 'Every round has results. Nothing can move.' : '';
    var pl = i.played_rounds || 0;
    return '<div class="lg-cfm"><div class="lg-cfm-in rb-wide">'
      + '<div class="rb-t">Rebuild ' + esc(rbDivName()) + '</div>'
      + '<div class="rb-lead">' + esc(rbSummary()) + '</div>'
      + (ds.length > 1
          ? '<select class="lg-sel rb-dv" onchange="FFPLeague.rbSetDiv(this.value)">'
            + ds.map(function (d) { return '<option value="' + d.id + '"' + (d.id === rbDivId() ? ' selected' : '') + '>' + esc(d.name) + '</option>'; }).join('')
            + '</select>' : '')
      + rbRow('schedule', 'Times and ' + surfWord(true),
              'Keeps every fixture exactly as it is. Each match is given a new date, a new time and ' + aSurf() + '.',
              ds.length > 1 ? 'Covers every division at once.' : '', "autoplan(1)", false)
      + rbRow('shuffle', 'Redraw the fixtures',
              'New pairings. Everyone still plays everyone — who meets whom, and in which round, changes.',
              redrawOff || (pl ? 'Rounds 1 to ' + pl + ' have results and will not be touched.' : ''),
              "rbGo('redraw')", !!redrawOff)
      + rbRow('event_busy', 'Byes', 'Choose which team sits out each round.',
              byesOff, "rbGo('byes')", !!byesOff)
      + '<div class="rb-a one"><button class="lg-btn ghost" onclick="FFPLeague.rebuildCancel()">Cancel</button></div>'
      + '</div></div>';
  }

  /* BYES. Every round in an odd division rests exactly one team, so the list is
     a PERMUTATION: picking a team for a round swaps it with whoever held that
     round. It cannot be put into an invalid state, and the database re-checks
     the same thing before it moves anything. */
  function rbByesSheet() {
    var rows = (S.rbByes || []).map(function (x) {
      var opts = (x.played ? [x] : rbUnplayed()).map(function (o) {
        return '<option value="' + o.bye + '"' + (o.bye === x.bye ? ' selected' : '') + '>' + esc(o.name) + '</option>';
      }).join('');
      return '<div class="rb-by' + (x.played ? ' lock' : '') + '">'
        + '<span class="r">Round ' + x.round + '</span>'
        + '<span class="d">' + esc(x.at ? lgDayShort(x.at) : 'Not scheduled') + '</span>'
        + '<select class="lg-sel"' + (x.played ? ' disabled' : ' onchange="FFPLeague.rbByePick(' + x.round + ',this.value)"') + '>' + opts + '</select>'
        + '<span class="pl">' + (x.played ? 'Played' : '') + '</span></div>';
    }).join('');
    return '<div class="lg-cfm"><div class="lg-cfm-in rb-wide">'
      + '<div class="rb-t">Who sits out each round?</div>'
      + '<div class="rb-lead">' + esc(rbDivName()) + ', ' + ((S.rbInfo && S.rbInfo.teams) || 0)
      + ' teams. With an odd number of teams one team rests each round, and over the season each team rests once.</div>'
      + rows
      + '<div class="rb-note">' + ic('swap_horiz')
      + '<span>Pick a team for a round and it swaps with whoever had that round, so every team still rests exactly once. Rounds with results are locked.</span></div>'
      + '<div class="rb-a"><button class="lg-btn ghost" onclick="FFPLeague.rbGo(\'menu\')">Back</button>'
      + '<button class="lg-btn pri" onclick="FFPLeague.rbByesSave()">' + ic('check') + 'Save byes</button></div>'
      + '</div></div>';
  }
  function rbByePick(round, entrantId) {
    var list = S.rbByes || [];
    var target = list.filter(function (x) { return x.round === round; })[0];
    var holder = list.filter(function (x) { return x.bye === entrantId && !x.played; })[0];
    if (!target || !holder || target === holder) { renderTab(); return; }
    var b = target.bye, n = target.name;
    target.bye = holder.bye; target.name = holder.name;
    holder.bye = b; holder.name = n;
    renderTab();
  }
  async function rbByesSave() {
    var free = rbUnplayed();
    if (free.length < 2) { toast('Nothing to change', 'error'); return; }
    var r; try {
      r = await sb().rpc('league_bye_order_set', { p_division: rbDivId(),
        p_rounds: free.map(function (x) { return x.round; }),
        p_byes: free.map(function (x) { return x.bye; }) });
    } catch (e) { r = { error: e }; }
    if (r && r.error) { toast(/played/.test(r.error.message || '') ? 'A round with results cannot move' : 'Could not save the byes', 'error'); return; }
    S.rb = null; S.rbInfo = null; S.rbByes = null;
    toast('Byes updated', 'success'); refreshDetail();
  }

  function rbRedrawSheet() {
    var i = S.rbInfo || {}, pl = i.played_rounds || 0, rs = (i.rounds || []).length;
    // Only an ODD field rests anybody, so an even division must not be told its
    // resting teams will change. And the noun opens a sentence, so it is capitalised.
    var odd = ((i.teams || 0) % 2) === 1;
    var who = evNouns().many; who = who.charAt(0).toUpperCase() + who.slice(1);
    var body = (pl
      ? 'Rounds ' + (pl + 1) + ' to ' + rs + ' get new pairings'
        + (odd ? ', and the teams resting in those rounds change' : '') + '. '
      : 'Every round gets new pairings'
        + (odd ? ', and the team resting in each round changes' : '') + '. ')
      + who + ' and officials already told about ' + (pl ? 'those' : 'these')
      + ' matches will need telling again.';
    return '<div class="lg-cfm"><div class="lg-cfm-in">'
      + '<span class="ms lg-cfm-ic" style="color:var(--ffp-gold)">warning</span>'
      + '<div class="lg-cfm-t">Redraw ' + esc(rbDivName()) + '?</div>'
      + '<div class="lg-cfm-b">' + esc(body) + '</div>'
      + (pl ? '<div class="rb-kept">' + ic('lock') + '<span>Rounds 1 to ' + pl
              + ' have results entered. They are not touched.</span></div>' : '')
      + '<div class="lg-cfm-a"><button class="lg-btn ghost" onclick="FFPLeague.rbGo(\'menu\')">Cancel</button>'
      + '<button class="lg-btn pri" onclick="FFPLeague.rbRedraw()">Yes, redraw</button></div></div></div>';
  }
  async function rbRedraw() {
    var seed = Math.floor(Math.random() * 1000000000);
    var r; try { r = await sb().rpc('league_fixtures_redraw', { p_division: rbDivId(), p_seed: seed }); } catch (e) { r = { error: e }; }
    if (r && r.error) { toast('Could not redraw', 'error'); return; }
    var d = (r && r.data) || {};
    S.rb = null; S.rbInfo = null; S.rbByes = null;
    toast(d.mode === 'partial'
      ? (d.moved || 0) + ' matches moved, ' + (d.kept || 0) + ' played round' + ((d.kept || 0) === 1 ? '' : 's') + ' kept'
      : (d.created || 0) + ' fixtures redrawn', 'success');
    refreshDetail();
  }
  function lgDayShort(iso) {
    var ymd = lgDateStr(iso); var a = String(ymd).split('-'); if (a.length !== 3) return '';
    var p = new Date(Date.UTC(+a[0], +a[1] - 1, +a[2], 12, 0, 0));
    return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][p.getUTCDay()] + ' ' + (+a[2]) + ' ' + MON[+a[1] - 1];
  }

  function schedRow(m) {
    var names = m._names || {};
    var tv = lgTimeStr(m.scheduled_at);
    var open = S.schedOpen === m.id;
    var offTxt = (m._offs || []).map(function (o) {
      return ((SLOT_LABEL[o.role] || o.role || '') + ' ' + o.name).trim(); }).join(', ');
    /* WHO PLAYS WHO, IN WHAT ROUND. That is the line an organiser is looking
       for, so it leads. The division and round qualify it on the next line, and
       the officials get a line of their own rather than trailing off the end of
       that one. Where it is played is stated, venue over surface; changing it
       is a decision and belongs in the menu with the rest of them. */
    var sub = (m._dnm ? m._dnm + ', ' : '') + fxLabel(m);
    var place = schedPlace(m);
    var row = '<div class="sc-m lg-d' + (m._dix || 0) + (open ? ' open' : '') + '" data-id="' + m.id + '">'
      /* THE TIME IS SHOWN HERE AND CHANGED IN THE MENU, with the day, the
         surface and the officials. An input loose in the row meant a stray
         scroll over it re-timed a match, and every change rebuilt the list
         under the organiser's cursor. */
      + '<div class="t tm' + (tv ? '' : ' none') + '">' + esc(tv || 'No time') + '</div>'
      + '<div class="g"><b>' + esc(names[m.home_entrant] || 'TBD') + ' v ' + esc(names[m.away_entrant] || 'TBD') + '</b>'
      + '<span>' + esc(sub) + '</span>'
      + '<span class="off"' + (offTxt ? '' : ' style="display:none"') + '>' + esc(offTxt) + '</span></div>'
      + place
      + '<button class="sc-ic" title="More" onclick="FFPLeague.schedToggle(\'' + m.id + '\')">' + ic(open ? 'expand_less' : 'more_horiz') + '</button>'
      + '</div>';
    return open ? row + schedMore(m) : row;
  }

  function schedPlace(m) {
    var fld = (S._fields || []).filter(function (f) { return f.id === m.field_id; })[0] || null;
    return fld
      ? '<div class="v"><b>' + esc(fld.venue || 'Venue not set') + '</b><span>' + esc(fld.name || '') + '</span></div>'
      : '<div class="v none"><b>No ' + surfWord() + ' yet</b><span>Set it in the menu</span></div>';
  }

  /* THE MENU IS BUILT ON ITS OWN so it can be put in and taken out without
     touching anything else on the page. Every control that changes a match
     lives in here, the time included. */
  function schedMore(m) {
    var tv = lgTimeStr(m.scheduled_at);
    var dv = lgDateStr(m.scheduled_at) || ((S.detail.event && S.detail.event.starts_at) || '');
    var roleOpts = '<option value="">Role…</option>' + ROLES.map(function (r) { return '<option>' + r + '</option>'; }).join('');
    var offOpts = '<option value="">Official…</option>' + (S._offs || []).map(function (x) { return '<option value="' + x.id + '">' + esc(x.name || x.email) + '</option>'; }).join('');
    var tags = (m._offs || []).filter(function (o) { return SLOTS.indexOf(o.role) < 0; }).map(function (o) {
      return '<div class="lg-offtag"><span class="role">' + esc(o.role || 'Official') + '</span><span class="nm">' + esc(o.name) + '</span><span class="sp"></span><span class="ms x" onclick="FFPLeague.offRemove(\'' + o.id + '\')">close</span></div>';
    }).join('');
    return '<div class="sc-more" data-id="' + m.id + '">'
      + '<span class="lg-lab" style="margin:0">Time</span><input class="lg-in st-t" type="time" value="' + tv + '" onchange="FFPLeague.schedSet(\'' + m.id + '\')">'
      + '<span class="lg-lab" style="margin:0">Day</span><input class="lg-in st-d" type="date" value="' + dv + '" onchange="FFPLeague.schedSet(\'' + m.id + '\')">'
      + '<span class="lg-lab" style="margin:0">' + Surf() + '</span>'
      + '<select class="lg-sel st-f" onchange="FFPLeague.schedSet(\'' + m.id + '\')">' + surfaceOpts(S._fields, m.field_id) + '</select>'
      + '<button class="lg-btn sm" onclick="FFPLeague.openMatch(\'' + m.id + '\')">' + ic('scoreboard') + 'Match centre</button>'
      + '<span class="sp"></span>' + (tags ? '<div class="lg-offlist">' + tags + '</div>' : '')
      + offSlot(m, 'referee', 'Referee') + offSlot(m, 'ar1', 'Assistant 1') + offSlot(m, 'ar2', 'Assistant 2')
      + '</div>';
  }
  /* THE MATCH SHEET'S THREE STANDARD SLOTS. Grant: a Referee and two Assistant Referees,
     always there and ready to type into. A slot left empty writes NO ROW, so it is absent
     from _lt_match_officials and never reaches the FFP app or the broadcast graphics -
     "an empty field just will not show". Any other role an organiser added still appears
     as a tag above. The options come from lt_officials_list, which the database now
     returns A to Z. */
  var SLOTS = ['referee', 'ar1', 'ar2'];
  var SLOT_LABEL = { referee: 'Referee', ar1: 'Assistant 1', ar2: 'Assistant 2' };
  function offSlot(m, role, label) {
    var cur = (m._offs || []).filter(function (o) { return o.role === role; })[0];
    var sel = cur ? cur.official_id : '';
    return '<span class="lg-lab" style="margin:0">' + label + '</span>'
      + '<select class="lg-sel st-off" data-role="' + role + '" onchange="FFPLeague.offSet(\'' + m.id + '\')">'
      + '<option value="">Not set</option>'
      + (S._offs || []).map(function (x) {
          return '<option value="' + x.id + '"' + (x.id === sel ? ' selected' : '') + '>'
               + esc(x.name || x.email || 'Official') + '</option>'; }).join('')
      + '</select>';
  }
  async function offSet(matchId) {
    var row = document.querySelector('.sc-more[data-id="' + matchId + '"]'); if (!row) return;
    var pick = function (r) {
      var el = row.querySelector('.st-off[data-role="' + r + '"]');
      return (el && el.value) ? el.value : null;
    };
    var r;
    try {
      r = await sb().rpc('lt_match_officials_set', { p_scope: 'league', p_match: matchId,
            p_referee: pick('referee'), p_ar1: pick('ar1'), p_ar2: pick('ar2') });
    } catch (e) { r = { error: e }; }
    if (r.error) { toast('Could not save the officials', 'error'); return; }
    /* The officials just saved are put onto the match in memory and the row
       is redrawn on its own, so the menu stays open and the page stays put. */
    var m = (S._sched || []).filter(function (x) { return x.id === matchId; })[0];
    if (m) {
      var nameOf = {};
      (S._offs || []).forEach(function (o) { nameOf[o.id] = o.name || o.email || 'Official'; });
      var kept = (m._offs || []).filter(function (o) { return SLOTS.indexOf(o.role) < 0; });
      SLOTS.forEach(function (rl) {
        var v = pick(rl);
        if (v) kept.push({ id: null, official_id: v, role: rl, name: nameOf[v] || 'Official' });
      });
      m._offs = kept;
    }
    toast('Officials saved', 'success'); schedPatch(matchId);
  }

  /* KEEP THE ORGANISER'S PLACE. Where a rebuild is genuinely needed the page
     is put back exactly where it was, both the window and whatever the shell
     is scrolling. */
  function schedKeepPlace(fn) {
    var keep = [], el = document.getElementById('lg-tab');
    while (el && el !== document.body) { if (el.scrollTop > 0) keep.push([el, el.scrollTop]); el = el.parentElement; }
    var y = window.scrollY || document.documentElement.scrollTop || 0;
    fn();
    var put = function () {
      keep.forEach(function (k) { k[0].scrollTop = k[1]; });
      window.scrollTo(0, y);
    };
    put();
    if (window.requestAnimationFrame) window.requestAnimationFrame(put);
  }

  /* ONE ROW REDRAWN WHERE IT STANDS. The list is deliberately not re-sorted:
     moving a match out from under the cursor the moment it is edited is the
     thing that made this screen unusable. It sorts again next time the tab is
     drawn. */
  function schedPatch(id) {
    var m = (S._sched || []).filter(function (x) { return x.id === id; })[0];
    var row = document.querySelector('.sc-m[data-id="' + id + '"]');
    if (!m || !row) return;
    var tv = lgTimeStr(m.scheduled_at);
    var t = row.querySelector('.tm');
    if (t) { t.textContent = tv || 'No time'; t.className = 't tm' + (tv ? '' : ' none'); }
    var v = row.querySelector('.v');
    if (v) { var box = document.createElement('div'); box.innerHTML = schedPlace(m);
             if (box.firstChild) row.replaceChild(box.firstChild, v); }
    var off = row.querySelector('.g .off');
    if (off) {
      var txt = (m._offs || []).map(function (o) {
        return ((SLOT_LABEL[o.role] || o.role || '') + ' ' + o.name).trim(); }).join(', ');
      off.textContent = txt; off.style.display = txt ? '' : 'none';
    }
  }

  /* OPENING A ROW IS NOT A REASON TO REBUILD THE PAGE. The menu is inserted
     after the row and taken out again on its own, so nothing above it moves
     and the page stays exactly where it was. */
  function schedToggle(id) {
    var prev = S.schedOpen;
    if (prev) {
      var pm = document.querySelector('.sc-more[data-id="' + prev + '"]');
      if (pm && pm.parentNode) pm.parentNode.removeChild(pm);
      var pr = document.querySelector('.sc-m[data-id="' + prev + '"]');
      if (pr) { pr.classList.remove('open');
                var pb = pr.querySelector('.sc-ic'); if (pb) pb.innerHTML = ic('more_horiz'); }
    }
    if (prev === id) { S.schedOpen = null; return; }
    S.schedOpen = id;
    var row = document.querySelector('.sc-m[data-id="' + id + '"]');
    var m = (S._sched || []).filter(function (x) { return x.id === id; })[0];
    if (!row || !m) { schedKeepPlace(renderTab); return; }
    row.classList.add('open');
    var b = row.querySelector('.sc-ic'); if (b) b.innerHTML = ic('expand_less');
    row.insertAdjacentHTML('afterend', schedMore(m));
  }


  /* One press plans every division at once, so two divisions cannot be handed
     the same surface at the same moment. Pressed once; after that the grid is
     edited by hand and replanning has to be asked for. */
  async function autoplan(isRebuild) {
    var P = planNow(); S.plan = P;
    var args = { p_league: S.eventId, p_match_len: P.len, p_day_start: P.start, p_day_end: P.end,
                 p_days: P.days, p_round_gap: P.gap, p_rest: P.rest, p_divisions: null,
      p_tz: evTz(), p_turnaround: P.turn };
    var r; try { r = await sb().rpc('league_autoplan_all', args); } catch (e) { r = { error: e }; }
    S.rb = null; S.rbInfo = null; S.rbByes = null;
    if (r.error) { toast(/no_fields/.test(r.error.message || '') ? 'Add ' + aSurf() + ' first (Venues tab)' : 'Could not plan', 'error'); renderTab(); return; }
    var d = r.data || {}, n = d.placed || 0, over = d.over || 0;
    toast(n + (n === 1 ? ' match planned' : ' matches planned') + (over ? ', ' + over + ' ran past the last day' : ''), over ? 'error' : 'success');
    renderTab();
  }
  async function schedSet(id) {
    /* Time, day and surface all live in the menu now, so a closed menu means
       nothing was touched and the match keeps what it already had. */
    var more = document.querySelector('.sc-more[data-id="' + id + '"]');
    var cur = (S._sched || []).filter(function (x) { return x.id === id; })[0] || {};
    var val = function (sel) { var el = more && more.querySelector(sel); return el ? el.value : null; };
    var tv = val('.st-t'); if (tv === null) tv = lgTimeStr(cur.scheduled_at);
    var dv = val('.st-d'); if (dv === null) dv = lgDateStr(cur.scheduled_at);
    var fsel = more && more.querySelector('.st-f');
    var fid = fsel ? (fsel.value || null) : (cur.field_id || null);
    var was = lgDateStr(cur.scheduled_at);
    var base = dv || (S.detail.event && S.detail.event.starts_at) || lgDateStr(new Date().toISOString());
    var when = (tv || dv) ? lgIso(base, tv || '00:00') : null;
    var r; try {
      r = await sb().rpc('lt_match_schedule', { p_scope: 'league', p_match: id, p_when: when,
            p_field: fid, p_court: null, p_official: null });
    } catch (e) { r = { error: e }; }
    if (r && r.error) { toast('Could not reschedule', 'error'); return; }
    cur.scheduled_at = when; cur.field_id = fid;
    toast('Rescheduled', 'success');
    /* A change of DAY moves the match under a different heading, so the list
       has to be drawn again. Everything else is redrawn where it stands. */
    if (base !== was) { schedKeepPlace(renderTab); return; }
    schedPatch(id);
  }
  async function offAdd(matchId) {
    var row = document.querySelector('.sc-more[data-id="' + matchId + '"]'); if (!row) return;
    var role = (row.querySelector('.a-role') || {}).value || null, off = (row.querySelector('.a-off') || {}).value || null;
    if (!off) { toast('Pick an official', 'error'); return; }
    var r; try { r = await sb().rpc('lt_match_official_add', { p_scope: 'league', p_match: matchId, p_official: off, p_role: role }); } catch (e) { r = { error: e }; }
    if (r.error) { toast('Could not assign', 'error'); return; } toast('Assigned', 'success'); renderTab();
  }
  async function offRemove(id) {
    await sb().rpc('lt_match_official_remove', { p_id: id });
    schedKeepPlace(renderTab);
  }

  // ---------- DETAILS ----------
  async function renderInformation(host) {
    var ev = S.detail.event || {}; await loadSports(); await taxReady();
    host.innerHTML =
      '<div class="lg-fld"><div class="lg-lab">Status</div><div class="lg-seg lg-status4" id="lg-status">' + statusSegBtns(ev.status, 'FFPLeague') + '</div></div>'
      + '<div class="lg-fld"><div class="lg-lab">League name</div><input class="lg-in" id="lg-name" value="' + esc(ev.name) + '"></div>'
      + '<div class="lg-fld"><div class="lg-lab">Logo</div><div class="lg-logo" onclick="FFPLeague.pickImg(\'logo\')" style="' + (ev.logo_url ? 'background-image:url(\'' + esc(ev.logo_url) + '\')' : '') + '">' + (ev.logo_url ? '' : '<span class="ms">add_photo_alternate</span><span>Logo</span>') + '</div></div>'
      + '<div class="lg-fld"><div class="lg-lab">Banner (16:9, as shown in the app)</div><div class="lg-banner16" onclick="FFPLeague.pickImg(\'cover\')" style="' + (ev.cover_url ? 'background-image:url(\'' + esc(ev.cover_url) + '\')' : '') + '">' + (ev.cover_url ? '' : '<span class="ms">image</span><span>Add banner</span>') + '</div></div>'
      + '<div class="lg-2"><div class="lg-fld"><div class="lg-lab">City</div><input class="lg-in" id="lg-city" list="lg-cityl" value="' + esc(ev.city || '') + '"><datalist id="lg-cityl">' + dlOpts(cityNames()) + '</datalist></div><div class="lg-fld"><div class="lg-lab">Country</div><input class="lg-in" id="lg-country" list="lg-cntl" value="' + esc(ev.country || '') + '"><datalist id="lg-cntl">' + dlOpts(countryNames()) + '</datalist></div></div>'
      + '<div class="lg-2"><div class="lg-fld"><div class="lg-lab">Season starts</div><input class="lg-in" id="lg-start" type="date" value="' + esc(ev.starts_at || '') + '"></div><div class="lg-fld"><div class="lg-lab">Season ends</div><input class="lg-in" id="lg-end" type="date" value="' + esc(ev.ends_at || '') + '"></div></div>'
      + '<div class="lg-fld"><div class="lg-lab">About</div><textarea class="lg-in" id="lg-desc" rows="3">' + esc(ev.description || '') + '</textarea></div>'
      + '<div class="lg-fld"><div class="lg-lab">Rules</div><textarea class="lg-in" id="lg-rules" rows="3">' + esc(ev.rules || '') + '</textarea>'
      +   '<div id="lg-pdfwrap">' + rulesPdfHtml(ev) + '</div></div>'
      + '<button class="lg-btn pri" onclick="FFPLeague.saveDetails()">' + ic('check') + 'Save</button>'
      + endBlock(ev);
  }
  // ── SETUP ───────────────────────────────────────────────────────────────
  // How the league is RUN, and it is a division's business, not the whole
  // league's: Juniors can play a single round for 2/1/0 while the Open plays
  // home and away for 5/3/0. A division that has never been touched inherits
  // the league's numbers, which is what every existing league does.
  var FINALS_MODES = [['none', 'None', 'The table decides it. Nothing follows the season.'],
                      ['top2', 'Top 2, grand final', 'First and second meet in one final.'],
                      ['top4', 'Top 4, semi-finals', 'Top four play semi-finals, then a final.'],
                      ['top8', 'Top 8, quarter-finals', 'Top eight play quarters, semis, then a final.']];
  function lgFmt(d) {
    var ev = (S.detail && S.detail.event) || {};
    var pick = function (a, b, c) { return a != null && a !== '' ? a : (b != null && b !== '' ? b : c); };
    return { win: pick(d.win_pts, ev.win_pts, 3), draw: pick(d.draw_pts, ev.draw_pts, 1),
             loss: pick(d.loss_pts, ev.loss_pts, 0),
             sched: pick(d.schedule_mode, ev.schedule_mode, 'single'),
             finals: pick(d.finals_mode, ev.finals_mode, 'none'),
             third: !!pick(d.third_place, ev.third_place, false),
             bonus: bpInherited(d),
             own: (d.win_pts != null || d.draw_pts != null || d.loss_pts != null
                   || d.schedule_mode != null || d.finals_mode != null || d.third_place != null
                   || d.bonus_rules != null) };
  }

  /* ── BONUS POINTS ───────────────────────────────────────────────────────
     A rule is one sentence the organiser completes: a type, a number, a
     scoring kind where the type needs one, and what it is worth. The kinds
     come from the sport's own scoring_kinds - never typed - and the database
     validates the whole array again on save, so a stale page cannot store a
     rule the table is unable to evaluate.

     One wrinkle worth knowing: rugby's default counts ["try","penalty_try"]
     together, because a penalty try IS a try. The picker shows one kind, so
     leaving it alone keeps the pair, and changing it replaces the pair with
     the single kind chosen. */
  var BP_TYPES = [['kind_count', 'Scoring bonus'], ['losing_margin', 'Losing bonus'],
                  ['kind_diff', 'Scoring difference'], ['winning_margin', 'Winning margin']];
  function bpKinds() {
    var s = (S.detail && S.detail.schema) || {};
    return (s.scoring_kinds || []).filter(function (k) {
      return k && k.key && Number(k.points || 0) > 0;
    });
  }
  function bpInherited(d) {
    var ev = (S.detail && S.detail.event) || {}, sc = (S.detail && S.detail.schema) || {};
    var r = (d && d.bonus_rules) || ev.bonus_rules || sc.bonus_rules || [];
    return Array.isArray(r) ? r.slice(0, 8) : [];
  }
  function bpStart(d) {
    S._bp = bpInherited(d).map(function (r) { return JSON.parse(JSON.stringify(r)); });
  }
  /* read the rows back into the working copy BEFORE re-rendering, or changing
     a type would throw away the number beside it */
  function bpSync() {
    (S._bp || []).forEach(function (r, i) {
      var t = v('bp' + i + '-t'); if (t) r.type = t;
      var n = v('bp' + i + '-n'); if (n !== '' && n != null) r.n = +n;
      var p = v('bp' + i + '-p'); if (p !== '' && p != null) r.pts = +p;
      var k = v('bp' + i + '-k');
      if (k && !(r.kinds && r.kinds[0] === k)) r.kinds = [k];
    });
  }
  function bpRow(r, i) {
    var kinds = bpKinds();
    var kv = (r.kinds && r.kinds[0]) || (kinds[0] && kinds[0].key) || '';
    var ksel = '<select class="lg-sel bp-k" id="bp' + i + '-k">'
      + kinds.map(function (k) {
          return '<option value="' + esc(k.key) + '"' + (k.key === kv ? ' selected' : '')
               + '>' + esc(k.label || k.key) + '</option>'; }).join('')
      + '</select>';
    var n = '<input class="lg-in bp-n" id="bp' + i + '-n" type="number" min="1" value="' + (r.n || 1) + '">';
    var mid = r.type === 'losing_margin'
        ? '<span class="bp-w">lose by</span>' + n + '<span class="bp-w">or fewer</span>'
      : r.type === 'winning_margin'
        ? '<span class="bp-w">win by</span>' + n + '<span class="bp-w">or more</span>'
      : r.type === 'kind_diff'
        ? n + '<span class="bp-w">or more</span>' + ksel + '<span class="bp-w">than the opponent</span>'
        : n + '<span class="bp-w">or more</span>' + ksel;
    return '<div class="bp-r">'
      + '<select class="lg-sel bp-t" id="bp' + i + '-t" onchange="FFPLeague.bpType()">'
      +   BP_TYPES.map(function (t) {
            return '<option value="' + t[0] + '"' + (t[0] === r.type ? ' selected' : '')
                 + '>' + t[1] + '</option>'; }).join('')
      + '</select>'
      + '<div class="bp-mid">' + mid + '</div>'
      + '<div class="bp-pts"><input class="lg-in bp-n" id="bp' + i + '-p" type="number" min="1" value="'
      +   (r.pts || 1) + '"><span class="bp-w">pt</span></div>'
      + '<span class="ms bp-x" title="Remove" onclick="FFPLeague.bpDel(' + i + ')">close</span>'
      + '</div>';
  }
  function bpHtml() {
    return (S._bp || []).map(bpRow).join('')
      || '<div class="bp-none">No bonus points. Teams score on the win, draw and loss values above.</div>';
  }
  function bpRender() { var h = document.getElementById('bp-list'); if (h) h.innerHTML = bpHtml(); }
  function bpType() { bpSync(); bpRender(); }
  function bpDel(i) { bpSync(); (S._bp || []).splice(i, 1); bpRender(); }
  function bpAdd() {
    bpSync(); S._bp = S._bp || [];
    if (S._bp.length >= 8) { toast('Eight bonus points is the limit', 'error'); return; }
    var k = bpKinds()[0];
    S._bp.push(k ? { type: 'kind_count', n: 4, pts: 1, kinds: [k.key] }
                 : { type: 'losing_margin', n: 7, pts: 1 });
    bpRender();
  }
  /* what goes to the database. A scoring rule with no kind cannot be
     evaluated, so it is dropped here rather than being refused on save. */
  function bpRead() {
    bpSync();
    return (S._bp || []).map(function (r) {
      var o = { type: r.type, n: Math.max(1, +r.n || 1), pts: Math.max(1, +r.pts || 1) };
      if (r.type === 'kind_count' || r.type === 'kind_diff') {
        o.kinds = (r.kinds && r.kinds.length) ? r.kinds : null;
      }
      return o;
    }).filter(function (o) {
      return (o.type === 'kind_count' || o.type === 'kind_diff') ? !!o.kinds : true;
    });
  }
  function bpBlock(d) {
    bpStart(d);
    return '<div class="lg-fld bp-blk"><div class="lg-lab">Bonus points</div>'
      + '<div id="bp-list">' + bpHtml() + '</div>'
      + '<button class="lg-btn bp-add" onclick="FFPLeague.bpAdd()">' + ic('add') + 'Add a bonus point</button>'
      + '<div class="lgf-hint">Counted from what the scorer records. A scoring bonus reads the events '
      + 'logged in the match, named player or not. A margin bonus reads the final score.</div></div>';
  }

  /* -- THE SPLIT ----------------------------------------------------------
     Phase one is whatever Schedule says; then the table divides into groups and
     each group plays its own round-robin with the points carried across. Group
     count, names, sizes, legs and what happens to the points are ALL the
     organiser's -- nothing here is fixed.

     The block repaints ITSELF (#lgs-wrap), never the whole tab: re-rendering
     the tab would throw away points or bonus rules the organiser had typed and
     not yet saved. The DB validates the array again on save, so a stale page
     cannot store a shape league_split_draw is unable to read. */
  var CARRY = [['full', 'Carried in full', 'Every point from phase one comes across.'],
               ['half', 'Halved', 'Halved and rounded to the nearest point, as several leagues do.'],
               ['none', 'Reset to zero', 'Each group starts level.']];
  var SPLIT_ERR = {
    split_groups_not_array: 'The groups are not in a readable shape. Reload the page and set them again.',
    split_groups_too_many: 'Eight groups is the most a division can split into.',
    split_group_not_object: 'The groups are not in a readable shape. Reload the page and set them again.',
    split_group_needs_a_name: 'Every group needs a name.',
    split_group_name_too_long: 'A group name can be 40 characters at most.'
  };
  function splitSaid(m) {
    m = String(m || '');
    var k = m.split(':')[0];
    if (SPLIT_ERR[k]) return SPLIT_ERR[k];
    if (k === 'split_group_needs_at_least_two') return '"' + (m.split(':')[1] || 'That group') + '" needs at least two teams.';
    if (k === 'split_group_too_big') return '"' + (m.split(':')[1] || 'That group') + '" is too big.';
    return null;
  }

  function splitOf(d) {
    var ev = (S.detail && S.detail.event) || {};
    var g = d.split_groups != null ? d.split_groups : ev.split_groups;
    return { groups: Array.isArray(g) && g.length ? g : null,
             carry: d.split_carry || ev.split_carry || 'full' };
  }
  /* The default the moment an organiser switches it on: a top-4 Championship
     and everybody else in one group below it. */
  function splitDefault(d) {
    var n = Number(d.entrant_count || 0);
    var top = Math.min(4, Math.max(2, n - 2));
    var rest = Math.max(0, n - top);
    var out = [{ name: 'Championship', take: top, legs: 1 }];
    if (rest >= 2) out.push({ name: 'Plate', take: rest, legs: 1 });
    return out;
  }
  function splitRow(g, i, n) {
    return '<div class="lgs-row">'
      + '<input class="lg-in lgs-nm" id="lgs-n-' + i + '" maxlength="40" value="' + esc(g.name || '') + '" placeholder="Group name">'
      + '<input class="lg-in lgs-tk" id="lgs-t-' + i + '" type="number" min="2" max="64" value="' + (g.take || 0) + '">'
      + '<select class="lg-sel lgs-lg" id="lgs-l-' + i + '">'
      +   '<option value="1"' + (Number(g.legs) === 2 ? '' : ' selected') + '>Once</option>'
      +   '<option value="2"' + (Number(g.legs) === 2 ? ' selected' : '') + '>Twice</option></select>'
      + (n > 1 ? '<button class="lgs-x ms" title="Remove this group" onclick="FFPLeague.splitDrop(' + i + ')">close</button>'
               : '<span class="lgs-x"></span>')
      + '</div>';
  }
  function splitBlock(d) { return '<div id="lgs-wrap">' + splitInner(d) + '</div>'; }
  function splitInner(d) {
    var sp = splitOf(d), on = !!sp.groups;
    var head = '<div class="lg-fld"><div class="lg-lab">After the season, split the table?</div>'
      + '<div class="lg-seg" id="lgs-on">'
      +   '<button data-v="yes" class="' + (on ? 'on' : '') + '" onclick="FFPLeague.splitOn(true)">Yes</button>'
      +   '<button data-v="no" class="' + (on ? '' : 'on') + '" onclick="FFPLeague.splitOn(false)">No</button></div>'
      + '<div class="lgf-hint">When phase one is finished the table divides, and each group plays its own'
      +   ' round-robin with the points carried across.</div></div>';
    if (!on) return head;

    var n = Number(d.entrant_count || 0);
    var used = sp.groups.reduce(function (t, g) { return t + Number(g.take || 0); }, 0);
    var left = n - used;
    var carry = CARRY.find(function (c) { return c[0] === sp.carry; }) || CARRY[0];

    return head
      + '<div class="lg-fld"><div class="lg-lab">The groups</div>'
      +   '<div class="lgs-row hd"><span class="lgs-nm">Group name</span><span class="lgs-tk">Teams</span>'
      +     '<span class="lgs-lg">They play</span><span class="lgs-x"></span></div>'
      +   sp.groups.map(function (g, i) { return splitRow(g, i, sp.groups.length); }).join('')
      +   (sp.groups.length < 8 ? '<button class="lgs-add" onclick="FFPLeague.splitAdd()">' + ic('add') + 'Add a group</button>' : '')
      +   (n === 0
          ? '<div class="lgs-note">' + ic('info') + 'Add the teams and the sizes will check themselves.</div>'
          : left === 0
            ? '<div class="lgs-note ok">' + ic('check_circle') + 'All ' + n + ' teams are in a group.</div>'
            : left > 0
              ? '<div class="lgs-note">' + ic('info') + left + ' team' + (left === 1 ? '' : 's')
                + ' left over. They finish the season at the split.</div>'
              : '<div class="lgs-note warn">' + ic('warning') + 'The groups add up to ' + used + ', but there are only '
                + n + ' teams. The last group will take what is left.</div>')
      + '</div>'
      + '<div class="lg-fld"><div class="lg-lab">Points from phase one</div>'
      +   '<select class="lg-sel" id="lgs-carry" style="max-width:320px" onchange="FFPLeague.carryHint()">'
      +     CARRY.map(function (c) { return '<option value="' + c[0] + '"' + (c[0] === sp.carry ? ' selected' : '') + '>' + esc(c[1]) + '</option>'; }).join('')
      +   '</select><div class="lgf-hint" id="lgs-carryhint">' + esc(carry[2]) + '</div></div>'
      + splitDraw(d);
  }
  /* The press. Greyed until phase one is finished, and it says what is holding
     it up rather than just refusing. */
  function splitDraw(d) {
    var left = Number(d.phase_one_left == null ? -1 : d.phase_one_left);
    var drawn = Number(d.split_fixtures || 0) > 0;
    if (drawn) {
      return '<div class="lgs-draw done">' + ic('check_circle')
        + '<div class="g"><b>The split is drawn</b><span>' + d.split_fixtures
        + ' fixtures across the groups. Re-drawing is blocked once a split game has been played.</span></div>'
        + '<button class="lg-btn ghost" onclick="FFPLeague.splitRedraw(\'' + d.id + '\')">Draw it again</button></div>';
    }
    if (left > 0) {
      return '<div class="lgs-draw">' + ic('lock')
        + '<div class="g"><b>Draw the split</b><span>' + left + ' phase-one fixture'
        + (left === 1 ? ' is' : 's are') + ' still to be played. Who is in which group is not known until they are.</span></div>'
        + '<button class="lg-btn" disabled>Draw the split</button></div>';
    }
    return '<div class="lgs-draw ready">' + ic('call_split')
      + '<div class="g"><b>Draw the split</b><span>Phase one is finished. This reads the table, cuts the groups'
      + ' and generates each one’s fixtures. Save the format first if you have just changed it.</span></div>'
      + '<button class="lg-btn pri" onclick="FFPLeague.splitRedraw(\'' + d.id + '\')">' + ic('call_split') + 'Draw the split</button></div>';
  }

  /* Reading the rows back before a repaint, so editing one field never discards
     what was typed in another. */
  function splitRead() {
    var out = [], i = 0;
    while (document.getElementById('lgs-n-' + i)) {
      var nm = String((document.getElementById('lgs-n-' + i) || {}).value || '').trim();
      var tk = parseInt((document.getElementById('lgs-t-' + i) || {}).value, 10);
      var lg = parseInt((document.getElementById('lgs-l-' + i) || {}).value, 10);
      out.push({ name: nm, take: isNaN(tk) ? 0 : tk, legs: lg === 2 ? 2 : 1 });
      i += 1;
    }
    return out;
  }
  function splitDiv() { return (S.detail.divisions || []).find(function (x) { return x.id === S.divId; }); }
  function splitSync() {
    var d = splitDiv(); if (!d) return null;
    if (document.getElementById('lgs-n-0')) d.split_groups = splitRead();
    var c = document.getElementById('lgs-carry'); if (c) d.split_carry = c.value;
    return d;
  }
  function splitRepaint() {
    var d = splitDiv(); if (!d) return;
    var w = document.getElementById('lgs-wrap');
    if (w) { w.innerHTML = splitInner(d); } else { renderTab(); }
  }
  function splitOn(yes) {
    var d = splitSync(); if (!d) return;
    if (!yes) {
      if (Array.isArray(d.split_groups) && d.split_groups.length) d._splitWas = d.split_groups;
      d.split_groups = null;
    } else {
      d.split_groups = (Array.isArray(d.split_groups) && d.split_groups.length) ? d.split_groups
        : (Array.isArray(d._splitWas) && d._splitWas.length ? d._splitWas : splitDefault(d));
    }
    splitRepaint();
  }
  function splitAdd() {
    var d = splitSync(); if (!d) return;
    var cur = Array.isArray(d.split_groups) ? d.split_groups : [];
    if (cur.length >= 8) { toast('Eight groups is the most a division can split into', 'error'); return; }
    var used = cur.reduce(function (t, g) { return t + Number(g.take || 0); }, 0);
    cur.push({ name: 'Group ' + (cur.length + 1), take: Math.max(2, Number(d.entrant_count || 0) - used), legs: 1 });
    d.split_groups = cur; splitRepaint();
  }
  function splitDrop(i) {
    var d = splitSync(); if (!d) return;
    var cur = Array.isArray(d.split_groups) ? d.split_groups : [];
    cur.splice(i, 1);
    d.split_groups = cur.length ? cur : null; splitRepaint();
  }
  function carryHint() {
    var val = (document.getElementById('lgs-carry') || {}).value;
    var c = CARRY.find(function (x) { return x[0] === val; }) || CARRY[0];
    var h = document.getElementById('lgs-carryhint'); if (h) h.textContent = c[2];
  }
  async function splitRedraw(id) {
    var r; try { r = await sb().rpc('league_split_draw', { p_division: id }); } catch (e) { r = { error: e }; }
    if (!r || r.error) {
      var m = String((r && r.error && r.error.message) || '');
      if (m.indexOf('phase_one_unfinished') === 0) {
        toast(m.split(':')[1] + ' phase-one fixture(s) still to be played', 'error');
      } else if (m.indexOf('split_already_played') === 0) {
        toast('A split game has already been played, so it cannot be redrawn', 'error');
      } else {
        toast(splitSaid(m) || said(r && r.error) || 'Could not draw the split', 'error');
      }
      return;
    }
    var out = r.data || {}, gs = out.groups || [];
    toast((out.fixtures || 0) + ' fixtures drawn across ' + gs.length + ' group' + (gs.length === 1 ? '' : 's'), 'success');
    refreshDetail();
  }

  function lgFmtLine(d) {
    var f = lgFmt(d);
    var fin = (FINALS_MODES.find(function (x) { return x[0] === f.finals; }) || FINALS_MODES[0]);
    return (f.sched === 'home_away' ? 'Home & away' : 'Single round') + ', '
      + f.win + '/' + f.draw + '/' + f.loss + ' points, '
      + (f.bonus.length ? f.bonus.length + (f.bonus.length === 1 ? ' bonus point, ' : ' bonus points, ') : '')
      + (f.finals === 'none' ? 'no finals' : fin[1].toLowerCase())
      + (splitOf(d).groups ? ', splits into ' + splitOf(d).groups.length + ' groups' : '')
      + (d.entrant_count != null ? ', ' + d.entrant_count + ' ' + (d.entrant_count === 1 ? nouns(d).one : nouns(d).many) : '');
  }
  function lgDivFormat(d) {
    var f = lgFmt(d);
    var cur = FINALS_MODES.find(function (x) { return x[0] === f.finals; }) || FINALS_MODES[0];
    return '<div class="lgf-edit">'
      + '<div class="lg-fld"><div class="lg-lab">Schedule</div><div class="lg-seg" id="lgf-mode">'
      +   '<button data-v="single" class="' + (f.sched !== 'home_away' ? 'on' : '') + '" onclick="FFPLeague.seg(this,\'lgf-mode\')">Single round</button>'
      +   '<button data-v="home_away" class="' + (f.sched === 'home_away' ? 'on' : '') + '" onclick="FFPLeague.seg(this,\'lgf-mode\')">Home &amp; away</button></div>'
      +   '<div class="lgf-hint">' + (f.sched === 'home_away' ? 'Everyone plays everyone twice, home and away.' : 'Everyone plays everyone once.') + '</div></div>'
      + '<div class="lg-3">'
      +   '<div class="lg-fld"><div class="lg-lab">Win pts</div><input class="lg-in" id="lgf-win" type="number" value="' + f.win + '"></div>'
      +   '<div class="lg-fld"><div class="lg-lab">Draw pts</div><input class="lg-in" id="lgf-draw" type="number" value="' + f.draw + '"></div>'
      +   '<div class="lg-fld"><div class="lg-lab">Loss pts</div><input class="lg-in" id="lgf-loss" type="number" value="' + f.loss + '"></div></div>'
      + bpBlock(d)
      + '<div class="lg-fld"><div class="lg-lab">Finals series</div><select class="lg-sel" id="lgf-finals" onchange="FFPLeague.finalsHint()">'
      +   FINALS_MODES.map(function (x) { return '<option value="' + x[0] + '"' + (x[0] === f.finals ? ' selected' : '') + '>' + esc(x[1]) + '</option>'; }).join('')
      +   '</select><div class="lgf-hint" id="lgf-finalshint">' + esc(cur[2]) + '</div></div>'
      + (f.finals === 'none' ? '' :
          '<div class="lg-fld"><div class="lg-lab">3rd-place play-off</div><div class="lg-seg" id="lgf-third">'
          + '<button data-v="true" class="' + (f.third ? 'on' : '') + '" onclick="FFPLeague.seg(this,\'lgf-third\')">Yes</button>'
          + '<button data-v="false" class="' + (!f.third ? 'on' : '') + '" onclick="FFPLeague.seg(this,\'lgf-third\')">No</button></div></div>')
      + splitBlock(d)
      + '<div class="lgf-acts"><button class="lg-btn pri" onclick="FFPLeague.saveDivFormat(\'' + d.id + '\')">' + ic('check') + 'Save format</button>'
      +   (lgFmt(d).own ? '<button class="lg-btn ghost" onclick="FFPLeague.clearDivFormat(\'' + d.id + '\')">Use the league default</button>' : '')
      +   '</div></div>';
  }
  async function renderSetup(host) {
    await loadSports(); await taxReady(); await loadSheetSize();
    var ev = S.detail.event || {}, divs = S.detail.divisions || [];
    if (!S.divId && divs.length) S.divId = divs[0].id;
    var head = '<div class="lgf-sec">'
      + '<div class="lg-fld"><div class="lg-lab">Which sport is this league for?</div>'
      + '<select class="lg-sel" id="lg-sport" onchange="FFPLeague.sportHint()">'
      +   '<option value="">Choose a sport\u2026</option>'
      +   sportOpts(ev.sport_key)
      + '</select>'
      + '<div class="lgf-hint" id="lg-sporthint">' + esc(sportSetHint(ev.sport_key)) + '</div></div>'
      + rulesBlock(ev)
      + '<button class="lg-btn pri" onclick="FFPLeague.saveSport()">' + ic('check') + 'Save</button></div>'
      + sheetSizeHtml()
      + potmVoteHtml();
    if (!divs.length) {
      host.innerHTML = head + '<div class="lgf-sec"><div class="lgf-sech">Format, per division</div>'
        + '<div class="lg-empty" style="text-align:left;padding:4px 0">Add a division first, then set how each one is run.</div></div>';
      return;
    }
    var rows = divs.map(function (d) {
      var on = d.id === S.divId;
      var made = (d.fixture_count || 0) > 0;
      var row = '<div class="lgf-row' + (on ? ' on' : '') + '" onclick="FFPLeague.setSetupDiv(\'' + d.id + '\')">'
        + '<span class="ms cv">' + (on ? 'expand_more' : 'chevron_right') + '</span>'
        + '<div class="g"><b>' + esc(d.name) + '</b><span>' + esc(lgFmtLine(d)) + '</span></div>'
        + '<span class="st' + (made ? ' done' : '') + '">' + (made ? 'Fixtures made' : 'Not generated') + '</span></div>';
      return on ? row + lgDivFormat(d) : row;
    }).join('');
    host.innerHTML = head + '<div class="lgf-sec"><div class="lgf-sech">Format, per division</div>' + rows + '</div>';
  }
  /* --- TEAM SHEET SIZE ----------------------------------------------------
     The organiser's own numbers. The Abu Dhabi Community Football League names
     11 and 6 where football's own shape is 11 and 7. BOTH are typed; neither is
     worked out from the other (Grant: "require On Field input and On Bench
     input"). league_sheet_size reads from the same places league_set_sheet_size
     validates against, so this panel can never offer a number the save then
     refuses, and it carries the sport's own surface word -- a football league
     reads "On the pitch", a netball league "On the court". A sport with no
     positions of its own has no team sheet, and the section does not appear. */
  async function loadSheetSize() {
    await loadPotm();
    try { var r = await sb().rpc('league_sheet_size', { p_league: S.eventId }); S._sz = (r && r.data) || null; }
    catch (e) { S._sz = null; }
    return S._sz;
  }
  /* FANS' PLAYER OF THE MATCH. Two choices and nothing else: whether the
     people watching get a vote, and whether it closes on the whistle or
     fifteen minutes after it. Everything else about the award is already
     decided elsewhere -- who is eligible is the team sheet, and the coach's
     own pick is made on the sheet. */
  async function loadPotm() {
    try { var r = await sb().rpc('league_potm_settings', { p_league: S.eventId }); S._potm = (r && r.data) || null; }
    catch (e) { S._potm = null; }
    return S._potm;
  }
  function potmVoteHtml() {
    var d = S._potm;
    if (!d || d.error) return '';
    var on = !!d.on, close = d.close || 'whistle';
    return '<div class="og-sec">'
      + '<div class="og-hd">' + ic('how_to_vote')
      +   '<div class="t"><b>Player of the Match</b><span>Everyone named on either team sheet is eligible. '
      +   'Members vote in the FFP app, one vote each, and the winner is announced the moment voting closes.</span></div></div>'
      + '<div class="sz">'
      +   '<div class="f"><label>Fan voting</label>'
      +     '<select class="lg-sel" id="lg-pvon" onchange="FFPLeague.potmVoteSave()">'
      +       '<option value="on"' + (on ? ' selected' : '') + '>On for every match in this league</option>'
      +       '<option value="off"' + (on ? '' : ' selected') + '>Off</option>'
      +     '</select></div>'
      +   (on
          ? '<div class="f"><label>Voting closes</label>'
            + '<select class="lg-sel" id="lg-pvcl" onchange="FFPLeague.potmVoteSave()">'
            +   '<option value="whistle"' + (close === 'whistle' ? ' selected' : '') + '>At the full-time whistle</option>'
            +   '<option value="plus15"' + (close === 'plus15' ? ' selected' : '') + '>15 minutes after full time</option>'
            + '</select></div>'
          : '')
      + '</div>'
      /* the note answers the rule that is actually SET. Printing the case for
         fifteen minutes while the whistle is selected reads as a mistake. */
      + (on
        ? '<div class="szf">' + ic('schedule')
          + '<div>' + (close === 'plus15'
              ? 'Fifteen minutes gives anyone still at the ground, or watching the stream, time to vote after the whistle. '
              : 'Voting shuts on the whistle, so the winner is known while everyone is still at the ground. ')
          + 'Totals stay hidden until voting closes, so nobody votes the bandwagon.</div></div>'
        : '')
      + '</div>';
  }
  async function potmVoteSave() {
    var onEl = document.getElementById('lg-pvon');
    var clEl = document.getElementById('lg-pvcl');
    var on = onEl ? onEl.value === 'on' : null;
    var cl = clEl ? clEl.value : null;
    var r; try { r = (await sb().rpc('league_set_potm_vote',
      { p_league: S.eventId, p_on: on, p_close: cl })).data; } catch (e) { r = null; }
    if (!r || r.error) { toast('Could not save the voting settings', 'error'); return; }
    toast(r.on ? 'Fan voting on, closing ' + (r.close === 'plus15' ? '15 minutes after full time' : 'at the whistle')
               : 'Fan voting off', 'success');
    await loadPotm(); renderTab();
  }

  function sheetSizeHtml() {
    var d = S._sz;
    if (!d || d.error || !d.has_positions) return '';
    var surf = d.surface || 'field';
    return '<div class="og-sec">'
      + '<div class="og-hd">' + ic('groups')
      +   '<div class="t"><b>Team sheet size</b><span>How many start, and how many sit on the bench. The team sheet is the two added up.</span></div></div>'
      + '<div class="sz">'
      +   '<div class="f"><label>On the ' + esc(surf) + '</label>'
      +     '<input class="lg-in" id="lg-szf" type="text" inputmode="numeric" value="' + d.on_field + '" oninput="FFPLeague.sheetSizeTotal()" onchange="FFPLeague.sheetSizeSave()"></div>'
      +   '<div class="eq">+</div>'
      +   '<div class="f"><label>On the bench</label>'
      +     '<input class="lg-in" id="lg-szb" type="text" inputmode="numeric" value="' + d.bench + '" oninput="FFPLeague.sheetSizeTotal()" onchange="FFPLeague.sheetSizeSave()"></div>'
      +   '<div class="eq">=</div>'
      +   '<div class="out"><b id="lg-szt">' + (d.on_field + d.bench) + '</b><span>on the team sheet</span></div>'
      +   (d.is_default ? '' : '<button class="lg-btn def" onclick="FFPLeague.sheetSizeDefault()">' + ic('restart_alt')
      +     esc(szSportName()) + ' default, ' + d.sport_on_field + ' and ' + d.sport_bench + '</button>')
      + '</div>'
      + '<div class="szf">' + ic('lock_clock')
      +   '<div>Every division in this league uses these numbers. Changing them does not touch a sheet that is already set, so a match played last week keeps the names it had.</div></div>'
      + '</div>';
  }
  /* lt_sport_schemas names a sport so a picker can tell two apart -- "Football
     / Soccer". A label takes the name people use. */
  function szSportName() {
    var n = (S._sz && S._sz.sport_name) || 'Sport';
    return String(n).split('/')[0].trim();
  }
  function szNum(id) {
    var el = document.getElementById(id); if (!el) return null;
    var t = String(el.value).trim(); if (!t) return null;
    var n = Number(t); return isFinite(n) ? Math.round(n) : null;
  }
  function sheetSizeTotal() {
    var f = szNum('lg-szf'), b = szNum('lg-szb'), t = document.getElementById('lg-szt');
    if (t) t.textContent = (f === null || b === null) ? '—' : String(f + b);
  }
  /* the server's words, in the organiser's language */
  var SZ_SAID = {
    not_yours: 'This league is not yours to change',
    both_or_neither: 'Both numbers are needed',
    sport_has_no_positions: 'This sport has no team sheet',
    on_field_out_of_range: 'A SURF holds at most MAX',
    bench_out_of_range: 'The bench holds up to 30',
    smaller_than_a_sheet_already_set: 'A team sheet in this league already uses slot USED'
  };
  function szToast(r) {
    var m = (r && SZ_SAID[r.error]) || 'Could not save the team sheet size';
    m = m.replace('SURF', (S._sz && S._sz.surface) || 'side')
         .replace('MAX', String(r && r.max))
         .replace('USED', String(r && r.used_up_to));
    toast(m, 'error');
  }
  async function sheetSizeSave() {
    var f = szNum('lg-szf'), b = szNum('lg-szb');
    sheetSizeTotal();
    if (f === null || b === null) return;      /* the other number is still being typed */
    var r; try { r = (await sb().rpc('league_set_sheet_size', { p_league: S.eventId, p_on_field: f, p_bench: b })).data; } catch (e) { r = null; }
    if (!r || r.error) { szToast(r); await loadSheetSize(); renderTab(); return; }
    toast('Team sheet size saved, ' + r.on_field + ' and ' + r.bench, 'success');
    await loadSheetSize(); renderTab();
  }
  async function sheetSizeDefault() {
    var r; try { r = (await sb().rpc('league_set_sheet_size', { p_league: S.eventId, p_on_field: null, p_bench: null })).data; } catch (e) { r = null; }
    if (!r || r.error) { szToast(r); return; }
    toast('Back to the ' + szSportName() + ' default', 'success');
    await loadSheetSize(); renderTab();
  }
  async function saveSport() {
    var k = v('lg-sport');
    if (!k) { toast('Choose a sport first', 'error'); return; }
    var p = rulesPayload(); p.sport_key = k;
    var r; try { r = await sb().rpc('league_event_save', { p_id: S.eventId, p: p }); } catch (e) { r = { error: e }; }
    if (r.error) { toast(said(r.error) || 'Could not save the sport', 'error'); return; }
    toast('Saved', 'success'); open(S.eventId);
  }
  async function saveDivFormat(id) {
    var p = { win_pts: v('lgf-win'), draw_pts: v('lgf-draw'), loss_pts: v('lgf-loss'),
              schedule_mode: segVal('lgf-mode'), finals_mode: v('lgf-finals'),
              bonus_rules: bpRead() };
    if (document.getElementById('lgf-third')) p.third_place = segVal('lgf-third') === 'true';
    if (document.getElementById('lgs-on')) {
      var splitting = segVal('lgs-on') === 'yes';
      var groups = splitting ? splitRead() : null;
      if (splitting) {
        var bad = (groups || []).find(function (g) { return !g.name || Number(g.take) < 2; });
        if (!groups || !groups.length) { toast('Add at least one group, or turn the split off', 'error'); return; }
        if (bad) { toast(!bad.name ? 'Every group needs a name' : '"' + bad.name + '" needs at least two teams', 'error'); return; }
      }
      p.split_groups = groups;
      p.split_carry = splitting ? (v('lgs-carry') || 'full') : null;
    }
    var r; try { r = await sb().rpc('league_division_save', { p_league: S.eventId, p_id: id, p: p }); } catch (e) { r = { error: e }; }
    if (r.error) { toast(splitSaid(r.error && r.error.message) || said(r.error) || 'Could not save the format', 'error'); return; }
    toast('Format saved', 'success'); refreshDetail();
  }
  async function clearDivFormat(id) {
    var p = { win_pts: null, draw_pts: null, loss_pts: null, schedule_mode: null, finals_mode: null,
              third_place: null, bonus_rules: null, split_groups: null, split_carry: null };
    var r; try { r = await sb().rpc('league_division_save', { p_league: S.eventId, p_id: id, p: p }); } catch (e) { r = { error: e }; }
    if (r.error) { toast('Could not reset it', 'error'); return; }
    toast('Back to the league default', 'success'); refreshDetail();
  }

  function segVal(id) { var b = document.querySelector('#' + id + ' button.on'); return b ? b.getAttribute('data-v') : null; }
  var STATUSES = [['draft', 'Draft'], ['live', 'Go Live'], ['final', 'Completed']];
  function statusSegBtns(cur, ns) { cur = (cur === 'open' ? 'live' : cur) || 'draft'; return STATUSES.map(function (s) { return '<button data-v="' + s[0] + '" class="st-' + s[0] + (s[0] === cur ? ' on' : '') + '" onclick="' + ns + '.statusPick(this,\'' + s[0] + '\')">' + s[1] + '</button>'; }).join(''); }
  var STATUS_MSG = {
    live: ['confirmation_number', 'Go live?', 'This publishes the league to the FFP app — members can see it, register and follow it live. You can move it back to Draft anytime.', 'Yes, go live'],
    final: ['emoji_events', 'Mark as completed?', 'This closes the league — the final table and results become the landing view for members. Only do this once every match is played.', 'Yes, mark completed'],
    draft: ['visibility_off', 'Move back to Draft?', 'The league will be hidden from members in the FFP app until you go live again.', 'Yes, move to Draft']
  };
  function statusPick(btn, v) {
    if (segVal('lg-status') === v) return;                 // already this status, no-op
    var m = STATUS_MSG[v] || ['help', 'Change status?', '', 'Confirm'];
    showConfirm(m[0], m[1], m[2], m[3], v, function () {
      document.querySelectorAll('#lg-status button').forEach(function (b) { b.classList.remove('on'); });
      btn.classList.add('on');
      saveDetails();                                       // a status change is a real action — persist immediately
    });
  }
  /* WHERE AN EVENT ENDS. There was nowhere at all before this: a mistyped
     league sat in the list for ever. Three different jobs, and they are
     not interchangeable.
       ARCHIVE   hides it from members and from this list, keeps everything,
                 and Restore brings it back.
       CANCEL    keeps it in the app with a cancelled banner and shuts sign-ups,
                 because anyone already registered has to be told rather than
                 watch it disappear.
       DELETE    is the mistake case only: a draft with nobody in it. The
                 database refuses anything else, so this cannot destroy a
                 member's record even if the button were reached another way. */
  function endBlock(ev) {
    var st = ev.status || 'draft';
    if (st === 'archived' || st === 'cancelled') {
      return '<div class="lg-end"><div class="hd">This league is ' + esc(st) + '</div>'
        + '<div class="row"><div class="g"><b>Bring it back</b><span>'
        + (st === 'archived'
            ? 'It returns as a draft, hidden from members until you go live again. Nothing was lost.'
            : 'It returns as a draft and the cancelled banner comes off. Nothing was lost.')
        + '</span></div>'
        + '<button class="lg-btn" onclick="FFPLeague.eventState(\'draft\')">' + ic('undo') + 'Restore</button></div></div>';
    }
    var canDelete = st === 'draft';
    return '<div class="lg-end"><div class="hd">Ending this league</div>'
      + '<div class="row"><div class="g"><b>Archive it</b>'
      +   '<span>Hides it from members and from your list. Every entrant, fixture and result is kept, and you can bring it back.</span></div>'
      +   '<button class="lg-btn" onclick="FFPLeague.eventState(\'archived\')">' + ic('inventory_2') + 'Archive</button></div>'
      + '<div class="row"><div class="g"><b>Call it off</b>'
      +   '<span>Stays in the app with a cancelled banner and sign-ups close, so anyone already registered is told rather than finding it gone.</span></div>'
      +   '<button class="lg-btn" onclick="FFPLeague.eventState(\'cancelled\')">' + ic('event_busy') + 'Call it off</button></div>'
      + '<div class="row"><div class="g"><b>Delete it</b><span>' + (canDelete
            ? 'Only while it is a draft with nobody entered and nothing drawn. It is gone for good.'
            : 'Not available. This has been published or already holds entrants, so archive it instead.')
      +   '</span></div>'
      +   '<button class="lg-btn danger"' + (canDelete ? '' : ' disabled')
      +     ' onclick="FFPLeague.eventDelete()">' + ic('delete_forever') + 'Delete</button></div></div>';
  }
  async function eventState(state) {
    var ev = (S.detail && S.detail.event) || {}, nm = esc(ev.name || 'this league');
    var M = {
      archived:  ['inventory_2', 'Archive ' + nm + '?', 'It disappears from the FFP app and from your list. Every entrant, fixture and result is kept, and Restore brings it back as a draft.', 'Yes, archive it', 'final'],
      cancelled: ['event_busy', 'Call off ' + nm + '?', 'Members keep seeing it, with a cancelled banner, and sign-ups close. Nothing is deleted and you can restore it.', 'Yes, call it off', 'final'],
      draft:     ['undo', 'Restore ' + nm + '?', 'It comes back as a draft, hidden from members until you go live again.', 'Yes, restore it', 'draft']
    }[state];
    if (!M) return;
    showConfirm(M[0], M[1], M[2], M[3], M[4], async function () {
      var r; try { r = await sb().rpc('lt_event_set_state', { p_scope: 'league', p_id: S.eventId, p_state: state }); } catch (e) { r = { error: e }; }
      if (r.error) { toast(/not_owner/.test(r.error.message || '') ? 'Not your league' : 'Could not change it', 'error'); return; }
      toast(state === 'draft' ? 'Restored as a draft' : (state === 'archived' ? 'Archived' : 'Called off'), 'success');
      if (state === 'archived') { S.view = 'list'; renderList(); } else { refreshDetail(); }
    });
  }
  async function eventDelete() {
    var ev = (S.detail && S.detail.event) || {}, nm = esc(ev.name || 'this league');
    showConfirm('delete_forever', 'Delete ' + nm + '?',
      'This removes the league and everything set up on it. It cannot be undone.',
      'Yes, delete it', 'final', async function () {
      var r; try { r = await sb().rpc('lt_event_delete', { p_scope: 'league', p_id: S.eventId }); } catch (e) { r = { error: e }; }
      if (r.error) { toast(/not_owner/.test(r.error.message || '') ? 'Not your league' : 'Could not delete it', 'error'); return; }
      var d = r.data || {};
      if (d.ok === false) {
        toast(d.reason === 'not_draft'
            ? 'Only a draft can be deleted. Archive it instead.'
            : 'It already holds ' + (d.entrants || 0) + ' entrants and ' + (d.matches || 0) + ' matches. Archive it instead.', 'error');
        return;
      }
      toast('Deleted', 'success'); S.view = 'list'; renderList();
    });
  }
  function toggleArchived() { S.showArchived = !S.showArchived; renderList(); }
  function showConfirm(icon, title, body, okLabel, tone, onOk) {
    var old = document.getElementById('lg-cfm'); if (old) old.remove();
    var bk = document.createElement('div'); bk.id = 'lg-cfm'; bk.className = 'lg-cfm';
    bk.innerHTML = '<div class="lg-cfm-in"><span class="ms lg-cfm-ic tone-' + tone + '">' + icon + '</span><div class="lg-cfm-t">' + title + '</div><div class="lg-cfm-b">' + body + '</div><div class="lg-cfm-a"><button class="lg-btn ghost" id="lg-cfm-no">Cancel</button><button class="lg-btn pri st-' + tone + '" id="lg-cfm-yes">' + okLabel + '</button></div></div>';
    document.body.appendChild(bk);
    bk.querySelector('#lg-cfm-no').onclick = function () { bk.remove(); };
    bk.querySelector('#lg-cfm-yes').onclick = function () { bk.remove(); onOk(); };
    bk.onclick = function (e) { if (e.target === bk) bk.remove(); };
  }
  function v(id) { var e = document.getElementById(id); return e ? e.value : ''; }
  async function saveDetails() {
    // Sport, schedule, points and finals live on the Setup tab now, per division
    var p = { name: v('lg-name'), city: v('lg-city'), country: v('lg-country'),
      starts_at: v('lg-start') || null, ends_at: v('lg-end') || null,
      status: segVal('lg-status') || 'draft', description: v('lg-desc'), rules: v('lg-rules') };
    var r; try { r = await sb().rpc('league_event_save', { p_id: S.eventId, p: p }); } catch (e) { r = { error: e }; }
    if (r.error) { toast('Save failed', 'error'); return; } toast('Saved', 'success'); open(S.eventId);
  }

  // ---------- DIVISIONS (inline, no popups) ----------
  function renderDivisions(host) {
    var divs = S.detail.divisions || [];
    var rows = divs.map(function (d) {
      if (S.divEdit === d.id) return divEditor(d);
      return '<div class="lg-row">' + '<span class="ms drag">drag_indicator</span>' + '<div class="g"><b>' + esc(d.name) + '</b> <span>' + (d.kind === 'individual' ? 'Individual' : 'Team') + ', ' + (d.entrant_count || 0) + ' in</span></div>' + '<span class="ms act" onclick="FFPLeague.editDivision(\'' + d.id + '\')">edit</span></div>';
    }).join('');
    var adder = S.divEdit === 'new' ? divEditor(null) : '<button class="lg-btn" style="margin-top:12px" onclick="FFPLeague.editDivision(\'new\')">' + ic('add') + 'Add division</button>';
    host.innerHTML = rows + adder;
    var f = document.getElementById('lg-dvname'); if (f) f.focus();
  }
  function divEditor(d) {
    d = d || {}; var isTeam = (d.kind || 'team') !== 'individual';
    var gOpts = '<option value="">Open / any</option>' + genderNames().map(function (g) { return '<option' + (d.gender === g ? ' selected' : '') + '>' + esc(g) + '</option>'; }).join('');
    return '<div class="lg-edit' + (d.id && S.divDel === d.id ? ' lg-entform' : '') + '">'
      + '<input class="lg-in" id="lg-dvname" placeholder="Division name" value="' + esc(d.name || '') + '">'
      + '<div class="lg-seg" id="lg-dvkind"><button data-v="team" class="' + (isTeam ? 'on' : '') + '" onclick="FFPLeague.seg(this,\'lg-dvkind\')">Team</button><button data-v="individual" class="' + (!isTeam ? 'on' : '') + '" onclick="FFPLeague.seg(this,\'lg-dvkind\')">Individual</button></div>'
      + '<select class="lg-sel" id="lg-dvgender" style="width:auto">' + gOpts + '</select>'
      + '<input class="lg-in" id="lg-dvmin" type="number" placeholder="Min age" value="' + (d.min_age != null ? d.min_age : '') + '" style="width:88px">'
      + '<input class="lg-in" id="lg-dvmax" type="number" placeholder="Max age" value="' + (d.max_age != null ? d.max_age : '') + '" style="width:88px">'
      + divActs(d) + '</div>';
  }
  /* REMOVING A DIVISION. The same shape the entrant delete already uses: a
     ghost red Remove in the editor, a question that names exactly what goes,
     and a solid red confirm. A division that has fixtures is NOT deleted --
     the fixtures and the table are the record of matches that were played --
     so the question becomes a refusal that says what is in the way. */
  function divActs(d) {
    if (!d.id || S.divDel !== d.id) {
      return '<button class="lg-btn pri" onclick="FFPLeague.saveDivision(\'' + (d.id || '') + '\')">' + ic('check') + 'Save</button>'
        + '<button class="lg-btn ghost" onclick="FFPLeague.cancelDivision()">Cancel</button>'
        + (d.id ? '<span class="sp"></span><button class="lg-btn ghost danger" onclick="FFPLeague.askRemoveDivision(\'' + d.id + '\')">' + ic('delete') + 'Remove</button>' : '');
    }
    var u = S._divUse || {};
    if (u.loading) return '<span class="delq">Checking what is in ' + esc(d.name) + '…</span>';
    if (u.fixtures > 0) {
      return '<div class="acts"><span class="delq">' + esc(d.name) + ' cannot be removed</span>'
        + '<span class="sp"></span>'
        + '<button class="lg-btn" onclick="FFPLeague.cancelRemoveDivision()">Back</button></div>'
        + '<div class="msg">' + usageLine(u) + '</div>'
        + '<div class="note">Rename it, or move its ' + (d.kind === 'individual' ? 'players' : 'teams')
        + ' to another division and finish the season. Nothing that has been played is ever thrown away.</div>';
    }
    return '<div class="acts"><span class="delq">Remove ' + esc(d.name) + ' from the league?</span>'
      + '<span class="sp"></span>'
      + '<button class="lg-btn" onclick="FFPLeague.cancelRemoveDivision()">Keep it</button>'
      + '<button class="lg-btn danger solid" onclick="FFPLeague.removeDivision(\'' + d.id + '\')">' + ic('delete_forever') + 'Remove</button></div>'
      + '<div class="note">' + (u.entrants > 0
          ? usageLine(u) + ' Nothing has been drawn, so the division and those entries go together.'
          : 'Nothing has been drawn in this division and nobody is entered, so it goes on its own.') + '</div>';
  }
  function usageLine(u) {
    var p = [];
    if (u.entrants > 0) p.push(u.entrants + (u.entrants === 1 ? ' entry' : ' entries'));
    if (u.fixtures > 0) p.push(u.fixtures + (u.fixtures === 1 ? ' fixture drawn' : ' fixtures drawn'));
    if (u.played > 0) p.push(u.played + ' of them played');
    return p.length ? p.join(', ') + '.' : '';
  }
  async function askRemoveDivision(id) {
    S.divDel = id; S._divUse = { loading: true }; renderTab();
    var r; try { r = await sb().rpc('league_division_usage', { p_division: id }); } catch (e) { r = { error: e }; }
    S._divUse = (r && r.data) || { entrants: 0, fixtures: 0, played: 0 };
    renderTab();
  }
  function cancelRemoveDivision() { S.divDel = null; S._divUse = null; renderTab(); }
  async function removeDivision(id) {
    var r; try { r = await sb().rpc('league_division_remove', { p_division: id }); } catch (e) { r = { error: e }; }
    if (r.error) { toast('Could not remove it', 'error'); return; }
    S.divDel = null; S._divUse = null; S.divEdit = null;
    if (S.divId === id) S.divId = null;
    toast('Division removed', 'success'); refreshDetail();
  }
  function editDivision(id) { S.divEdit = id; S.divDel = null; S._divUse = null; renderTab(); }
  function cancelDivision() { S.divEdit = null; S.divDel = null; S._divUse = null; renderTab(); }
  async function saveDivision(id) {
    var nm = (document.getElementById('lg-dvname') || {}).value; if (!nm || !nm.trim()) { toast('Name required', 'error'); return; }
    var kind = segVal('lg-dvkind') || 'team';
    var p = { name: nm.trim(), kind: kind, team_size: kind === 'team' ? 5 : 1, gender: v('lg-dvgender') || 'any', min_age: v('lg-dvmin') || null, max_age: v('lg-dvmax') || null };
    var r; try { r = await sb().rpc('league_division_save', { p_league: S.eventId, p_id: id || null, p: p }); } catch (e) { r = { error: e }; }
    if (r.error) { toast('Save failed', 'error'); return; }
    S.divEdit = null; toast('Saved', 'success'); refreshDetail();
  }

  // ---------- ENTRANTS (inline) ----------
  async function renderEntrants(host) {
    var divs = S.detail.divisions || [];
    if (!divs.length) { host.innerHTML = '<div class="lg-empty">Add a division first.</div>'; return; }
    if (!S.divId) S.divId = divs[0].id;
    var N = nouns(curDv());
    var adder = S.entAdd
      ? '<div class="lg-edit"><input class="lg-in" id="lg-entname" placeholder="' + N.One + ' name" onkeydown="if(event.key===\'Enter\')FFPLeague.saveEntrant()"><button class="lg-btn pri" onclick="FFPLeague.saveEntrant()">' + ic('check') + 'Add</button><button class="lg-btn ghost" onclick="FFPLeague.cancelEntrant()">Cancel</button></div>'
      : '<button class="lg-btn" onclick="FFPLeague.addEntrant()">' + ic('add') + 'Add a ' + N.one + '</button>';
    host.innerHTML = '<div class="lg-tool"><select class="lg-sel" onchange="FFPLeague.setDiv(this.value,\'entrants\')">' + divOpts() + '</select><span class="sp"></span>' + (S.divId ? '<button class="lg-btn" onclick="FFPLeague.bulkAthletes()">' + ic('upload_file') + 'Bulk add</button>' : '') + '</div>' + adder + '<div id="lg-roster"><div class="lg-empty">Loading…</div></div>';
    var f = document.getElementById('lg-entname'); if (f) f.focus();
    var r; try { r = await sb().rpc('league_roster', { p_division: S.divId }); } catch (e) { r = { error: e }; }
    try { var sq = await sb().rpc('lt_squad_list', { p_scope: 'league', p_event: S.eventId }); S._squad = (sq && sq.data) || []; } catch (e) { S._squad = []; }
    try { var po = await sb().rpc('lt_position_list', { p_event: S.eventId }); S._pos = (po && po.data) || []; } catch (e) { S._pos = []; }
    var rows = (r && r.data) || []; var host2 = document.getElementById('lg-roster');
    host2.innerHTML = rows.length ? rows.map(function (en) {
      var flag = en.nationality ? ', ' + esc(en.nationality) : '';
      var isTeam = en.kind !== 'individual';
      var sqBtn = isTeam ? '<button class="lg-btn sm" onclick="FFPLeague.sqToggle(\'' + en.id + '\')">' + ic('groups') + 'Squad (' + squadFor(en.id).length + ')</button>' : '';
      var initial = en.logo ? '' : esc((en.name || '?').slice(0, 1));
      var bg = en.logo ? 'background-image:url(\'' + esc(en.logo) + '\')' : '';
      var crest = isTeam
        ? '<span class="lg-av lg-avedit" title="Add / change logo" onclick="FFPLeague.entLogo(\'' + en.id + '\')" style="' + bg + '">' + initial + '<span class="lg-avplus ms">add</span></span>'
        : '<span class="lg-av" style="' + bg + '">' + initial + '</span>';
      // Editing replaces the row in place, so the list never jumps.
      if (S.entEdit === en.id) return entEditHtml(en);
      var edBtn = '<span class="ms act" title="Edit details" onclick="FFPLeague.editEntrant(\'' + en.id + '\')">edit</span>';
      var row = '<div class="lg-row">' + crest + '<div class="g"><b>' + esc(en.name) + '</b> <span>' + esc(en.status) + (en.kind === 'individual' ? flag : '') + '</span></div>' + sqBtn + edBtn + '</div>';
      return row + (isTeam && S.sqOpen === en.id ? '<div class="lg-sq" id="lg-sq-' + en.id + '"><div class="lg-sqsrch">' + ic('search') + '<input id="lg-sqq-' + en.id + '" placeholder="Search FFP or type a name" value="' + esc((S._sqQ || {})[en.id] || '') + '" oninput="FFPLeague.sqSearch(\'' + en.id + '\',this.value)" onkeydown="FFPLeague.sqKey(\'' + en.id + '\',event)"></div><div id="lg-sqres-' + en.id + '">' + sqResHtml(en.id) + '</div></div>' : '');
    }).join('') : '<div class="lg-empty">No ' + N.many + ' yet. Members self-register in the app, or add them here.</div>';
    S._roster = rows;
  }

  // ---------- EDIT ONE ENTRANT ----------
  // An individual entrant is a member's own record, so their name and
  // nationality come from their FFP profile and are not the organiser's to
  // rewrite here — only the division, seed and status are.
  var ENT_STATUS = [['registered', 'Registered'], ['pending', 'Pending'], ['withdrawn', 'Withdrawn']];

  function entEditHtml(en) {
    var isTeam = en.kind !== 'individual';
    var opts = (S.detail.divisions || []).map(function (d) {
      return '<option value="' + d.id + '"' + (d.id === S.divId ? ' selected' : '') + '>' + esc(d.name) + '</option>';
    }).join('');
    var stOpts = ENT_STATUS.map(function (x) {
      return '<option value="' + x[0] + '"' + (x[0] === en.status ? ' selected' : '') + '>' + x[1] + '</option>';
    }).join('');
    var initial = en.logo ? '' : esc((en.name || '?').slice(0, 1));
    var bg = en.logo ? 'background-image:url(\'' + esc(en.logo) + '\')' : '';
    var crest = isTeam
      ? '<span class="lg-av lg-avedit" title="Add / change logo" onclick="FFPLeague.entLogo(\'' + en.id + '\')" style="' + bg + '">' + initial + '<span class="lg-avplus ms">add</span></span>'
      : '<span class="lg-av" style="' + bg + '">' + initial + '</span>';
    return '<div class="lg-edit lg-entform">' +
      '<span class="crest">' + crest + '</span>' +
      (isTeam
        ? '<div class="f gr"><label>Team name</label><input class="lg-in" id="lg-ee-name" value="' + esc(en.team_name || en.name || '') + '" onkeydown="if(event.key===\'Enter\')FFPLeague.saveEntrantEdit()"></div>'
        : '<div class="f gr"><label>Player</label><div class="ro">' + esc(en.name) + (en.nationality ? ', ' + esc(en.nationality) : '') + '</div></div>') +
      '<div class="f"><label>Division</label><select class="lg-sel" id="lg-ee-div">' + opts + '</select></div>' +
      '<div class="f sm"><label>Seed</label><input class="lg-in" id="lg-ee-seed" type="number" min="1" value="' + (en.seed == null ? '' : en.seed) + '"></div>' +
      '<div class="f"><label>Status</label><select class="lg-sel" id="lg-ee-status">' + stOpts + '</select></div>' +
      (en.kind !== 'individual'
        ? '<div class="f sm"><label>Code</label><input class="lg-in" id="lg-ee-code" maxlength="4" placeholder="KNI" value="' + esc(en.code || '') + '"></div>' +
          '<div class="f sm"><label>Home colour</label><div class="lg-hex"><input class="sw" type="color" value="' + esc(en.color1 || '#0C2E63') + '" oninput="FFPLeague.hexSync(\'lg-ee-c1\',this.value)"><input class="lg-in" id="lg-ee-c1" maxlength="7" placeholder="#000000" value="' + esc(en.color1 || '') + '"></div></div>' +
          '<div class="f sm"><label>Away colour</label><div class="lg-hex"><input class="sw" type="color" value="' + esc(en.color2 || '#1B57AE') + '" oninput="FFPLeague.hexSync(\'lg-ee-c2\',this.value)"><input class="lg-in" id="lg-ee-c2" maxlength="7" placeholder="#000000" value="' + esc(en.color2 || '') + '"></div></div>'
        : '') +
      (S.entDel === en.id
        ? '<div class="acts"><span class="delq">Remove ' + esc(en.name) + ' from the league?</span>' +
            '<span class="sp"></span>' +
            '<button class="lg-btn" onclick="FFPLeague.cancelRemoveEntrant()">Keep them</button>' +
            '<button class="lg-btn danger solid" onclick="FFPLeague.removeEntrant()">' + ic('delete_forever') + 'Remove</button></div>' +
          '<div class="note">Anything with fixtures or recorded stats is marked withdrawn instead, so results and the table stay intact.</div>'
        : '<div class="acts">' +
            '<button class="lg-btn pri" onclick="FFPLeague.saveEntrantEdit()">' + ic('check') + 'Save</button>' +
            '<button class="lg-btn ghost" onclick="FFPLeague.cancelEntrantEdit()">Cancel</button>' +
            '<span class="sp"></span>' +
            '<button class="lg-btn ghost danger" onclick="FFPLeague.askRemoveEntrant()">' + ic('delete') + 'Remove</button>' +
          '</div>') +
      '<div class="msg" id="lg-ee-msg"></div></div>';
  }

  // the swatch and the hex box are two views of one value
  function hexSync(id, val) { var el = document.getElementById(id); if (el) el.value = String(val || '').toUpperCase(); }
  function editEntrant(id) { S.entEdit = id; S.entDel = null; S.sqOpen = null; renderTab(); }
  function cancelEntrantEdit() { S.entEdit = null; S.entDel = null; renderTab(); }

  async function saveEntrantEdit() {
    var id = S.entEdit; if (!id) return;
    var en = (S._roster || []).find(function (x) { return x.id === id; }) || {};
    var g = function (k) { var el = document.getElementById(k); return el ? String(el.value || '').trim() : ''; };
    var msg = document.getElementById('lg-ee-msg');
    var patch = { division_id: g('lg-ee-div'), seed: g('lg-ee-seed'), status: g('lg-ee-status') };
    if (en.kind !== 'individual') {
      var nm = g('lg-ee-name');
      if (!nm) { if (msg) msg.textContent = 'The ' + nouns(en).one + ' needs a name'; return; }
      patch.team_name = nm;
      patch.code = g('lg-ee-code');
      patch.color1 = g('lg-ee-c1');
      patch.color2 = g('lg-ee-c2');
      var bad = [patch.color1, patch.color2].filter(function (c) { return c && !/^#[0-9a-fA-F]{6}$/.test(c); });
      if (bad.length) { if (msg) msg.textContent = 'Colours are hex codes like #101820'; return; }
    }
    var r; try { r = await sb().rpc('league_entrant_update', { p_id: id, p: patch }); } catch (e) { r = { error: e }; }
    if (r.error) { if (msg) msg.textContent = (r.error.message && r.error.message.indexOf('hex') > -1) ? r.error.message : 'Could not save'; return; }
    // The move is refused when a schedule already points at this team there,
    // so say which fixtures are in the way rather than failing silently.
    if (r.data && r.data.ok === false && r.data.reason === 'has_fixtures') {
      if (msg) msg.textContent = 'Already has ' + r.data.fixtures + ' fixtures in this division. Delete them first to move the ' + nouns(en).one + '.';
      return;
    }
    S.entEdit = null; toast('Saved', 'success');
    S._entrants = null; refreshDetail();
  }

  function askRemoveEntrant() { S.entDel = S.entEdit; renderTab(); }
  function cancelRemoveEntrant() { S.entDel = null; renderTab(); }

  async function removeEntrant() {
    var id = S.entEdit; if (!id) return;
    var r; try { r = await sb().rpc('league_entrant_remove', { p_id: id }); } catch (e) { r = { error: e }; }
    if (r.error) { var m = document.getElementById('lg-ee-msg'); if (m) m.textContent = 'Could not remove'; return; }
    toast((r.data && r.data.action === 'withdrawn')
      ? 'Marked withdrawn, ' + r.data.fixtures + ' fixtures kept'
      : 'Removed', 'success');
    S.entEdit = null; S.entDel = null; S._entrants = null; refreshDetail();
  }
  function squadFor(entId) { return (S._squad || []).filter(function (x) { return x.entrant_id === entId; }); }
  function sqResHtml(entId) {
    var q = ((S._sqQ || {})[entId] || ''); var res = ((S._sqRes || {})[entId] || []);
    var out = '';
    /* THE TYPED NAME IS ALWAYS ON OFFER.
       "Add name only" used to be an ELSE: it appeared only when the FFP
       search found NOBODY. Type a real person's name, the search matches
       somebody -- anybody -- and the only thing on screen is an Add button
       against a different person, so the name just typed cannot be saved at
       all. Checked against the live data: across a whole tournament, every
       squad member came from an FFP match and NOT ONE typed name had ever
       been saved. The matches and the typed name are now both offered, and
       Enter in the box adds the typed name. */
    if (res.length) out += '<div class="lg-sqhint">Already on FFP</div><div class="lg-sqres">' + res.map(function (r) {
      return '<div class="row"><span class="av" style="' + (r.photo ? 'background-image:url(\'' + esc(r.photo) + '\')' : '') + '"></span><div class="g"><b>' + esc(r.name) + '</b><span>' + esc([r.city, r.email_hint].filter(Boolean).join(', ')) + '</span></div><button class="lg-btn sm pri" onclick="FFPLeague.sqAddMember(\'' + entId + '\',\'' + r.id + '\')">Add</button></div>';
    }).join('') + '</div>';
    if (q.trim().length >= 2) out += '<div class="lg-sqadd2"><button class="lg-btn sm pri" onclick="FFPLeague.sqNameOnly(\'' + entId + '\')">' + ic('person_add') + 'Add &ldquo;' + esc(q.trim()) + '&rdquo;</button><button class="lg-btn sm" onclick="FFPLeague.sqInvite(\'' + entId + '\')">' + ic('mail') + 'Invite by email</button></div>';
    var list = squadFor(entId);
    out += '<div class="lg-sqlist">' + (list.length ? list.map(function (p) {
      var b = p.member_id ? '<span class="lg-scpill">FFP</span>' : (p.invite_email ? '<span class="lg-scpill inv">INVITED</span>' : '<span class="lg-scpill txt">NAME</span>');
      return '<div class="lg-sqrow">' + sqPhotoCell(p) + '<span class="nm">' + esc(p.name) + '</span>' + b + '<span class="sp"></span><span class="ms x" onclick="FFPLeague.sqRemove(\'' + p.id + '\')">close</span></div>';
    }).join('') : '<div class="lg-empty" style="padding:12px">No players yet.</div>') + '</div>';
    return out;
  }

  // ── player portrait. A club can upload its own shot \u2014 cropped to the
  //    passport shape every graphic uses \u2014 instead of the member's
  //    profile photo. The small x hands the player back to it. ───────────
  function sqPhotoCell(p) {
    var own = !!p.photo_url_own;
    var url = p.photo_url_own || p.photo || '';
    return '<span class="lg-sqph' + (own ? ' own' : '') + '" title="' + (own ? 'Club portrait' : 'Profile photo \u2014 click to upload the club&#39;s own') + '"'
      + ' style="' + (url ? "background-image:url('" + esc(url) + "')" : '') + '"'
      + ' onclick="FFPLeague.sqPhoto(\'' + p.id + '\')">'
      + (url ? '' : '<i class="ms">add_a_photo</i>')
      + (own ? '<em class="x" onclick="event.stopPropagation();FFPLeague.sqPhotoClear(\'' + p.id + '\')">&times;</em>' : '')
      + '</span>';
  }
  function sqPhoto(id) {
    if (!window.FFPUpload) { toast('Uploader not ready \u2014 refresh and retry', 'error'); return; }
    var row = (S._squad || []).filter(function (x) { return x.id === id; })[0] || {};
    window.FFPUpload.pick({
      bucket: 'listing-covers', key: 'squad-' + id, aspect: 7 / 9, outW: 700, outH: 900,
      title: 'Player portrait \u2014 ' + (row.name || 'player'),
      onDone: async function (url) {
        try { await sb().rpc('lt_squad_set_photo', { p_id: id, p_url: url }); }
        catch (e) { toast('Could not save the portrait', 'error'); return; }
        toast('Portrait saved', 'check'); _sqReload(row.entrant_id || S.sqOpen);
      },
      onError: function () { toast('Upload failed', 'error'); }
    });
  }
  async function sqPhotoClear(id) {
    var row = (S._squad || []).filter(function (x) { return x.id === id; })[0] || {};
    try { await sb().rpc('lt_squad_set_photo', { p_id: id, p_url: null }); }
    catch (e) { toast('Could not clear the portrait', 'error'); return; }
    _sqReload(row.entrant_id || S.sqOpen);
  }

  function paintSqRes(entId) { var el = document.getElementById('lg-sqres-' + entId); if (el) el.innerHTML = sqResHtml(entId); }
  function sqToggle(id) { S.sqOpen = (S.sqOpen === id) ? null : id; renderTab(); }
  var _sqTimer = {};
  function sqSearch(id, q) {
    S._sqQ = S._sqQ || {}; S._sqQ[id] = q; clearTimeout(_sqTimer[id]);
    if (q.trim().length < 2) { S._sqRes = S._sqRes || {}; S._sqRes[id] = []; paintSqRes(id); return; }
    _sqTimer[id] = setTimeout(async function () { var r; try { r = await sb().rpc('lt_member_search', { p_q: q.trim() }); } catch (e) { r = null; } S._sqRes = S._sqRes || {}; S._sqRes[id] = (r && r.data) || []; paintSqRes(id); }, 300);
  }
  /* THE SUPABASE CLIENT DOES NOT THROW ON A DATABASE ERROR -- it resolves with
     { data, error }. Every squad writer was wrapped in try/catch alone, so a
     refused write resolved normally, the catch never ran, no toast appeared,
     and the list was simply repainted from the old data. A failure looked
     EXACTLY like a success. That is why "it's not saving" came with no error
     on screen. This checks `error` as well as catching, and says what the
     database actually said. */
  function sqWhy(e) {
    var m = (e && (e.message || e.hint || e.details)) || '';
    if (/not_owner/.test(m)) return 'you are not listed as an organiser or scorer on this event';
    if (/empty_name/.test(m)) return 'type a name first';
    if (/duplicate|unique/i.test(m)) return 'that player is already in this squad';
    return m || 'the database refused it';
  }
  async function sqCall(fn, args, what) {
    var r = null;
    try { r = await sb().rpc(fn, args); }
    catch (e) { toast(what + ' \u2014 ' + sqWhy(e), 'error'); return false; }
    if (r && r.error) { toast(what + ' \u2014 ' + sqWhy(r.error), 'error'); return false; }
    return true;
  }
  function sqKey(id, ev) {
    if (!ev || ev.key !== 'Enter') return;
    ev.preventDefault();
    if ((((S._sqQ || {})[id]) || '').trim().length >= 2) sqNameOnly(id);
  }
  async function _sqReload(id) { try { var sq = await sb().rpc('lt_squad_list', { p_scope: 'league', p_event: S.eventId }); S._squad = (sq && sq.data) || []; } catch (e) {} if (!(S._pos || []).length) { try { var po = await sb().rpc('lt_position_list', { p_event: S.eventId }); S._pos = (po && po.data) || []; } catch (e) {} } S._sqQ = S._sqQ || {}; S._sqQ[id] = ''; S._sqRes = S._sqRes || {}; S._sqRes[id] = []; var inp = document.getElementById('lg-sqq-' + id); if (inp) inp.value = ''; paintSqRes(id); renderEntrants(root()); }
  async function sqAddMember(id, memberId) {
    if (!await sqCall('lt_squad_add_member', { p_scope: 'league', p_event: S.eventId, p_entrant: id, p_member: memberId }, 'Could not add them')) return;
    toast('Added to the squad', 'check'); _sqReload(id);
  }
  async function sqNameOnly(id) {
    var nm = ((S._sqQ || {})[id] || '').trim();
    if (!nm) { toast('Type a name first', 'error'); return; }
    if (!await sqCall('lt_squad_add', { p_scope: 'league', p_event: S.eventId, p_entrant: id, p_name: nm }, 'Could not add ' + nm)) return;
    toast(nm + ' added to the squad', 'check'); _sqReload(id);
  }
  async function sqInvite(id) { var txt = ((S._sqQ || {})[id] || '').trim(); var em = txt.indexOf('@') > -1 ? txt : prompt('Their FFP email (we\'ll link their account)'); if (!em || em.indexOf('@') < 0) return; var nm = txt.indexOf('@') > -1 ? '' : txt; if (!await sqCall('lt_squad_invite', { p_scope: 'league', p_event: S.eventId, p_entrant: id, p_name: nm, p_email: em }, 'Could not invite them')) return; try { var rf = (window.FFPAuth && FFPAuth.getRefresh && FFPAuth.getRefresh()) || null; if (rf) { var r = await fetch('https://ffp-passport-backend.vercel.app/api/lt/squad-invite', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh: rf, scope: 'league', event_id: S.eventId, name: nm, email: em }) }); var jd = await r.json().catch(function () { return {}; }); toast(jd && jd.linked ? 'Member linked' : 'Invited — email sent', 'check'); } } catch (e) { /* email best-effort */ } _sqReload(id); }
  async function sqRemove(sqid) {
    if (!await sqCall('lt_squad_remove', { p_id: sqid }, 'Could not take them out')) return;
    if (S.sqOpen) _sqReload(S.sqOpen);
  }
  function addEntrant() { S.entAdd = true; renderTab(); }
  function bulkAthletes() {
    var divs = ((S.detail && S.detail.divisions) || []).map(function (d) { return { id: d.id, name: d.name }; });
    if (!divs.length) { toast('Add a division first', 'error'); return; }
    _ensureBulkTool(function () {
      FFPBulkAthletes.open({ scope: 'league', eventId: S.eventId, eventName: (S.detail && S.detail.event && S.detail.event.name) || '', divisions: divs, divisionId: S.divId,
        teams: (S._entrants || []).map(function (e) { return { id: e.id, name: e.team_name || e.name || 'Team' }; }),
        defaultMode: 'team',
        onDone: function () { renderEntrants(root()); } });
    });
  }
  function _ensureBulkTool(cb) {
    if (window.FFPBulkAthletes) return cb();
    var ex = document.getElementById('ffp-bulk-js'); if (ex) { ex.addEventListener('load', cb); return; }
    var sc = document.createElement('script'); sc.id = 'ffp-bulk-js'; sc.src = 'ffp-bulk-athletes.js?v=3'; sc.onload = cb; sc.onerror = function () { toast('Could not load bulk tool', 'error'); }; document.head.appendChild(sc);
  }
  function cancelEntrant() { S.entAdd = false; renderTab(); }
  async function saveEntrant() {
    var nm = (document.getElementById('lg-entname') || {}).value; if (!nm || !nm.trim()) return;
    var kind = (S.detail.divisions.find(function (d) { return d.id === S.divId; }) || {}).kind || 'team';
    var r; try { r = await sb().rpc('league_entrant_add', { p_league: S.eventId, p_division: S.divId, p: { team_name: nm.trim(), kind: kind } }); } catch (e) { r = { error: e }; }
    if (r.error) { toast('Add failed', 'error'); return; } S.entAdd = false; toast('Added', 'success'); refreshDetail();
  }

  // ---------- FIXTURES & RESULTS ----------
  async function renderFixtures(host) {
    var divs = S.detail.divisions || [];
    if (!divs.length) { host.innerHTML = '<div class="lg-empty">Add a division first.</div>'; return; }
    if (!S.divId) S.divId = divs[0].id;
    var r; try { r = await sb().rpc('league_fixtures_list', { p_division: S.divId }); } catch (e) { r = { error: e }; }
    var fx = (r && r.data) || [];
    /* NO REGENERATE ONCE FIXTURES EXIST. league_fixtures_generate deletes every
       regular-stage row for the division with no status guard, so pressing it on
       a running division wipes results that are already entered (proven on live
       data: 6 final results -> 0). Auto-generate is offered ONLY when there is
       nothing to destroy. Changing a draw that already exists is its own job. */
    var genBtn = fx.length ? ''
      : '<button class="lg-btn" onclick="FFPLeague.doGen()">' + ic('auto_awesome') + 'Auto-generate fixtures</button>';
    await loadEntrants();
    var ffr; try { ffr = await sb().rpc('lt_fields_list', { p_scope: 'league', p_event: S.eventId }); } catch (e) { ffr = null; } S._fields = (ffr && ffr.data) || [];
    host.innerHTML = '<div class="lg-tool"><select class="lg-sel" onchange="FFPLeague.setDiv(this.value,\'fixtures\')">' + divOpts() + '</select><span class="sp"></span><button class="lg-btn" onclick="FFPLeague.addMatch(\'fixtures\')">' + ic('add') + 'Add match</button>' + genBtn + '<button class="lg-btn pri" onclick="FFPLeague.saveResults()">' + ic('check') + 'Save results</button></div>'
      + (S.addMatch === 'fixtures' ? matchEditor() : '') + '<div id="lg-fixlist"></div>';
    var host2 = document.getElementById('lg-fixlist');
    if (!fx.length) { host2.innerHTML = '<div class="lg-empty">No fixtures yet — auto-generate the round-robin, or add one manually.</div>'; return; }
    host2.innerHTML = fxGroups(fx).map(function (g) {
      var games = g.list.filter(function (f) { return !f.bye; });
      return roundHead(g.label, games.length, roundRange(games)) + '<div class="lg-rbody">' + g.list.map(fxRow).join('') + '</div>';
    }).join('');
  }
  // A computed (auto) bye is virtual (id "bye-…") — not editable/removable. A stored bye is a real row (stage='bye').
  function isVirtualBye(f) { return f.bye && typeof f.id === 'string' && f.id.indexOf('bye-') === 0; }
  function fxDateVal(f) { return f.scheduled_at ? zoneDate(f.scheduled_at, evTz()) : ''; }
  function delBtns(id) {
    if (S.delFx === id) return '<button class="lg-mcbtn del" title="Confirm delete" onclick="FFPLeague.delFx(\'' + id + '\')" style="color:var(--ffp-red)">' + ic('delete_forever') + '</button><button class="lg-mcbtn" title="Keep" onclick="FFPLeague.delCancel()">' + ic('close') + '</button>';
    return '<button class="lg-mcbtn del" title="Delete fixture" onclick="FFPLeague.delAsk(\'' + id + '\')">' + ic('delete') + '</button>';
  }
  function fxRow(f) {
    if (S.editFx === f.id) return fxEdit(f);
    if (isVirtualBye(f)) return '<div class="lg-bye">' + crest(f.home) + '<b>' + esc((f.home && f.home.name) || '') + '</b><span class="tag">BYE</span><span class="msg">no match this round</span></div>';
    if (f.bye) return '<div class="lg-bye" data-id="' + f.id + '">' + crest(f.home) + '<b>' + esc((f.home && f.home.name) || '') + '</b><span class="tag">BYE</span><div class="acts"><button class="lg-mcbtn" title="Edit bye" onclick="FFPLeague.editFx(\'' + f.id + '\')">' + ic('edit') + '</button>' + delBtns(f.id) + '</div></div>';
    var day = f.scheduled_at ? '<div class="fxday">' + zoneDay(f.scheduled_at, evTz()) + ', ' + zoneTime(f.scheduled_at, evTz()) + '</div>' : '';
    return '<div class="lg-fx2" data-id="' + f.id + '"><div class="tm a">' + esc((f.home && f.home.name) || 'TBD') + crest(f.home) + '</div>'
      + '<div class="mid">' + day + '<div class="sc"><input type="number" class="lg-hs" value="' + (f.home_score != null ? f.home_score : '') + '" placeholder="–"><span class="v">v</span><input type="number" class="lg-as" value="' + (f.away_score != null ? f.away_score : '') + '" placeholder="–"></div></div>'
      + '<div class="tm">' + crest(f.away) + esc((f.away && f.away.name) || 'TBD') + '</div>'
      + '<div class="acts"><button class="lg-mcbtn" title="Edit fixture" onclick="FFPLeague.editFx(\'' + f.id + '\')">' + ic('edit') + '</button>' + delBtns(f.id)
      + '<button class="lg-mcbtn" title="Match centre — enter scorers &amp; stats" onclick="FFPLeague.openMatch(\'' + f.id + '\')">' + ic('scoreboard') + '</button></div></div>';
  }
  function fxEdit(f) {
    var isBye = f.bye, teamH = (f.home && f.home.id) || '', teamA = (f.away && f.away.id) || '';
    // A pre-season friendly is played BEFORE round 1, so the editor picks the
    // stage. A bare round number could only ever say "Round 1", which is what
    // used to drag a pre-season match back into the round-robin on every save.
    var isPre = String(f.stage || '').toLowerCase() === 'preseason';
    var flds = '<div class="f"><label>Stage</label><select class="lg-sel fe-st" style="min-width:150px" onchange="FFPLeague.fxStageChange(this)">'
      + '<option value="regular"' + (isPre ? '' : ' selected') + '>Round</option>'
      + '<option value="preseason"' + (isPre ? ' selected' : '') + '>Pre-season</option>'
      + '</select></div>'
      + '<div class="f fe-rwrap"' + (isPre ? ' style="display:none"' : '') + '><label>Round</label>'
      + '<input class="lg-in fe-r" type="number" min="1" value="' + (isPre ? 1 : (f.round != null ? f.round : 1)) + '" style="width:90px"></div>';
    if (!isBye) flds += '<div class="f"><label>Date</label><input class="lg-in fe-d" type="date" value="' + fxDateVal(f) + '"></div>'
      + '<div class="f"><label>Time</label><input class="lg-in fe-t" type="time" value="' + (f.scheduled_at ? zoneTime(f.scheduled_at, evTz()) : '') + '"></div>'
      + '<div class="f" style="flex:1;min-width:160px"><label>Venue / surface</label><select class="lg-sel fe-f" style="width:100%">' + surfaceOpts(S._fields, f.field_id) + '</select></div>'
      + '<div class="f" style="flex:1;min-width:100%"><label>Livestream link</label><input class="lg-in fe-s" type="url" placeholder="YouTube, Twitch, Facebook…" value="' + esc(f.stream_url || '') + '"></div>';
    return '<div class="lg-maed" data-id="' + f.id + '"><div class="ttl">Edit ' + (isBye ? 'bye' : 'fixture') + '</div>'
      + '<div class="edrow"><select class="lg-sel fe-h" style="flex:1;min-width:150px">' + entOpts(teamH) + '</select>'
      + (isBye ? '<span class="vv">bye</span>' : '<span class="vv">v</span><select class="lg-sel fe-a" style="flex:1;min-width:150px">' + entOpts(teamA) + '</select>') + '</div>'
      + '<div class="edrow2">' + flds + '</div>'
      + '<div class="edfoot"><span class="sp"></span><button class="lg-btn ghost" onclick="FFPLeague.cancelEditFx()">Cancel</button><button class="lg-btn pri" onclick="FFPLeague.saveFx(\'' + f.id + '\',' + (isBye ? 'true' : 'false') + ')">' + ic('check') + 'Save</button></div></div>';
  }
  // Pre-season has no round number, so the field goes away with it
  function fxStageChange(sel) {
    var box = sel.closest('.lg-maed'); if (!box) return;
    var w = box.querySelector('.fe-rwrap'); if (!w) return;
    w.style.display = sel.value === 'preseason' ? 'none' : '';
  }
  function editFx(id) { S.editFx = id; S.delFx = null; renderTab(); }
  function cancelEditFx() { S.editFx = null; renderTab(); }
  function delAsk(id) { S.delFx = id; renderTab(); }
  function delCancel() { S.delFx = null; renderTab(); }
  async function delFx(id) {
    var r; try { r = await sb().rpc('lt_match_remove', { p_scope: 'league', p_match: id }); } catch (e) { r = { error: e }; }
    if (r && r.error) { toast('Could not delete', 'error'); return; }
    S.delFx = null; if (S.editFx === id) S.editFx = null; toast('Fixture deleted', 'success'); renderTab();
  }
  async function saveFx(id, isBye) {
    var box = document.querySelector('.lg-maed[data-id="' + id + '"]'); if (!box) return;
    var h = (box.querySelector('.fe-h') || {}).value || null;
    var a = isBye ? null : ((box.querySelector('.fe-a') || {}).value || null);
    var st = (box.querySelector('.fe-st') || {}).value || 'regular';
    // pre-season sits before round 1; never let `|| 1` swallow the 0
    var rdIn = +((box.querySelector('.fe-r') || {}).value);
    var rd = st === 'preseason' ? 0 : (rdIn > 0 ? rdIn : 1);
    if (!isBye && (!h || !a || h === a)) { toast('Pick two different ' + nouns(curDv()).many, 'error'); return; }
    if (isBye && !h) { toast('Pick a ' + nouns(curDv()).one, 'error'); return; }
    var r; try { r = await sb().rpc('lt_match_update', { p_scope: 'league', p_match: id, p_home: h, p_away: a, p_round: rd, p_stage: st }); } catch (e) { r = { error: e }; }
    if (r && r.error) { toast('Save failed', 'error'); return; }
    if (!isBye) {
      var dv = (box.querySelector('.fe-d') || {}).value, tv = (box.querySelector('.fe-t') || {}).value, fid = (box.querySelector('.fe-f') || {}).value || null;
      var when = (dv || tv) ? zoneToISO(dv || zoneDate(Date.now(), evTz()), tv || '00:00', evTz()) : null;
      try { await sb().rpc('lt_match_schedule', { p_scope: 'league', p_match: id, p_when: when, p_field: fid, p_court: null, p_official: null }); } catch (e) { /* non-blocking */ }
      var su = (box.querySelector('.fe-s') || {}).value;
      try { await sb().rpc('lt_match_set_stream', { p_scope: 'league', p_match: id, p_url: (su && su.trim()) ? su.trim() : null }); } catch (e) { /* non-blocking */ }
    }
    S.editFx = null; toast('Fixture saved', 'success'); renderTab();
  }
  function matchEditor() {
    var bye = S.addBye, pre = S.addPre && !bye;
    /* On the schedule the editor opens under a surface, where the tab no
       longer says which division this belongs to, so it asks. */
    var divs = (S.detail && S.detail.divisions) || [];
    var dsel = divs.length < 2 ? '' :
      '<select class="lg-sel" style="width:auto;min-width:170px;margin-bottom:9px" onchange="FFPLeague.setAddDiv(this.value)">'
      + divs.map(function (d) { return '<option value="' + d.id + '"' + (d.id === S.divId ? ' selected' : '') + '>' + esc(d.name) + '</option>'; }).join('')
      + '</select>';
    return '<div class="lg-maed"><div class="ttl">Add ' + (bye ? 'a bye' : (pre ? 'a preseason match' : 'a fixture')) + '</div>' + dsel
      + '<label class="fe-byetog"><input type="checkbox" id="lg-mm-pre" ' + (pre ? 'checked' : '') + ' onchange="FFPLeague.togglePre(this.checked)"> Preseason / friendly (doesn\'t count towards the table)</label>'
      + '<label class="fe-byetog"><input type="checkbox" id="lg-mm-bye" ' + (bye ? 'checked' : '') + ' onchange="FFPLeague.toggleBye(this.checked)"> This is a bye (' + nouns(curDv()).one + ' sits out this round)</label>'
      + '<div class="edrow" style="margin-top:11px"><select class="lg-sel" id="lg-mm-h" style="flex:1;min-width:150px">' + entOpts(null) + '</select>'
      + (bye ? '' : '<span class="vv">v</span><select class="lg-sel" id="lg-mm-a" style="flex:1;min-width:150px">' + entOpts(null) + '</select>') + '</div>'
      + '<div class="edrow2">' + (pre ? '' : '<div class="f"><label>Round</label><input class="lg-in" id="lg-mm-r" type="number" value="1" style="width:90px"></div>')
      + (bye ? '' : '<div class="f"><label>Date</label><input class="lg-in" id="lg-mm-d" type="date"></div><div class="f"><label>Time</label><input class="lg-in" id="lg-mm-t" type="time"></div><div class="f" style="flex:1;min-width:160px"><label>Venue / surface</label><select class="lg-sel" id="lg-mm-f" style="width:100%">' + surfaceOpts(S._fields, null) + '</select></div>')
      + '</div>'
      + '<div class="edfoot"><span class="sp"></span><button class="lg-btn ghost" onclick="FFPLeague.cancelMatch()">Cancel</button><button class="lg-btn pri" onclick="FFPLeague.saveMatch()">' + ic('check') + (bye ? 'Add bye' : (pre ? 'Add preseason match' : 'Add fixture')) + '</button></div></div>';
  }
  function addMatch(tab) { S.addMatch = tab; S.addBye = false; S.addPre = false; renderTab(); }
  // Changing the division changes who can be picked, so the roster is reloaded.
  async function setAddDiv(id) { S.divId = id; await loadEntrants(); renderTab(); }
  function cancelMatch() { S.addMatch = null; S.addBye = false; S.addPre = false; renderTab(); }
  function toggleBye(v) { S.addBye = v; if (v) S.addPre = false; renderTab(); }
  function togglePre(v) { S.addPre = v; if (v) S.addBye = false; renderTab(); }
  async function saveMatch() {
    var h = (document.getElementById('lg-mm-h') || {}).value || null, rd = +((document.getElementById('lg-mm-r') || {}).value) || 1;
    if (S.addBye) {
      if (!h) { toast('Pick a ' + nouns(curDv()).one, 'error'); return; }
      var rb; try { rb = await sb().rpc('lt_match_add', { p_scope: 'league', p_division: S.divId, p_round: rd, p_home: h, p_away: null, p_when: null, p_field: null, p_stage: 'bye' }); } catch (e) { rb = { error: e }; }
      if (rb.error) { toast('Could not add', 'error'); return; } S.addMatch = null; S.addBye = false; toast('Bye added', 'success'); renderTab(); return;
    }
    var pre = S.addPre;
    var a = (document.getElementById('lg-mm-a') || {}).value || null;
    if (!h || !a || h === a) { toast('Pick two different ' + nouns(curDv()).many, 'error'); return; }
    var dv = (document.getElementById('lg-mm-d') || {}).value, tv = (document.getElementById('lg-mm-t') || {}).value, fid = (document.getElementById('lg-mm-f') || {}).value || null;
    var when = (dv || tv) ? zoneToISO(dv || zoneDate(Date.now(), evTz()), tv || '00:00', evTz()) : null;
    /* Added from a surface on the schedule means it belongs there, after
       whatever is already on it that day. */
    var slot = String(S.addMatch || '');
    if (!fid && slot.indexOf('|') > -1) {
      var sday = slot.split('|')[0]; fid = slot.split('|')[1];
      var same = (S._sched || []).filter(function (x) { return x.field_id === fid && x.scheduled_at && lgDateStr(x.scheduled_at) === sday; });
      var lastMs = same.reduce(function (acc, x) { return Math.max(acc, new Date(x.scheduled_at).getTime()); }, 0);
      var mlen = Math.max(5, +((document.getElementById('lg-mlen') || {}).value) || 30);
      when = lastMs ? new Date(lastMs + mlen * 60000).toISOString() : lgIso(sday, '09:00');
    }
    var r; try { r = await sb().rpc('lt_match_add', { p_scope: 'league', p_division: S.divId, p_round: pre ? 0 : rd, p_home: h, p_away: a, p_when: when, p_field: fid, p_stage: pre ? 'preseason' : 'regular' }); } catch (e) { r = { error: e }; }
    if (r.error) { toast('Could not add', 'error'); return; } S.addMatch = null; S.addPre = false; toast(pre ? 'Preseason match added' : 'Fixture added', 'success'); renderTab();
  }
  // A pre-season friendly is not part of the round-robin, so it gets its own
  // section ahead of Round 1 and is never captioned "Round 1". The stage decides;
  // the round number is only a tiebreak inside a stage.
  function fxLabel(f) {
    if (f && f.round_label) return f.round_label;          // the RPC says so
    var st = String((f && f.stage) || 'regular').toLowerCase();
    if (st === 'preseason') return 'Pre-season';
    if (st === 'playoff') return 'Playoffs';
    if (st === 'semi') return 'Semi-finals';
    if (st === 'final') return 'Final';
    return 'Round ' + ((f && f.round) != null ? f.round : 1);
  }
  function fxRank(f) {
    if (f && f.stage_rank != null) return +f.stage_rank;
    var st = String((f && f.stage) || 'regular').toLowerCase();
    return st === 'preseason' ? 0 : st === 'playoff' ? 2 : st === 'semi' ? 3 : st === 'final' ? 4 : 1;
  }
  // Groups a fixture list into ordered sections: [{key, label, list}]
  function fxGroups(fx) {
    var by = {}, keys = [];
    fx.forEach(function (f) {
      var k = fxRank(f) + ':' + (fxRank(f) === 1 ? (f.round != null ? f.round : 1) : 0);
      if (!by[k]) { by[k] = { key: k, rank: fxRank(f), round: +(f.round || 0), label: fxLabel(f), list: [] }; keys.push(k); }
      by[k].list.push(f);
    });
    return keys.map(function (k) { return by[k]; }).sort(function (a, b) {
      return a.rank - b.rank || a.round - b.round;
    });
  }
  function roundLabel(rd) { return (+rd === 0) ? 'Pre-season' : 'Round ' + rd; }
  // ---------- MATCH CENTRE (organiser enters the scoring timeline) ----------
  var KIND_PTS = { try: 5, conversion: 2, penalty: 3, drop_goal: 3, goal: 1, point: 1, yellow_card: 0, red_card: 0 };
  var KIND_LBL = { try: 'Try', conversion: 'Conversion', penalty: 'Penalty', drop_goal: 'Drop goal', goal: 'Goal', point: 'Point', yellow_card: 'Yellow card', red_card: 'Red card' };
  function openMatch(id) { S.matchOpen = id; S.mcTab = 'timeline'; S._mcDiv = null; S.mcStatPlayer = null; if (S._trkInt) { clearInterval(S._trkInt); S._trkInt = null; } S._tracker = null; S._htSnap = null; S._mcSetTime = null; S._tsTeam = 'home'; S._ts = []; renderMatchCentre(); tsReload(); }
  function closeMatch() { S.matchOpen = null; if (S._trkInt) { clearInterval(S._trkInt); S._trkInt = null; } renderTab(); }
  async function renderMatchCentre() {
    var host = document.getElementById('lg-tab'); if (!host) return;
    host.innerHTML = '<div class="lg-empty">Loading match…</div>';
    var r; try { r = await sb().rpc('lt_match_detail', { p_scope: 'league', p_match: S.matchOpen }); } catch (e) { r = { error: e }; }
    var m = (r && r.data) || null;
    if (!m) { host.innerHTML = '<div class="lg-empty">Could not load.</div>'; return; }
    S._mc = m;
    if (mcIsSet(m)) { S._cfg = pbpCfg(m); pbpInit(m); return renderPBP(m, host); }
    var ev = m.events || [];
    var last = ev.length ? ev[ev.length - 1] : null;
    var score = last ? last.rs : '0–0';
    var teamOpts = '<option value="' + m.home.id + '">' + esc(m.home.name) + '</option><option value="' + m.away.id + '">' + esc(m.away.name) + '</option>';
    var kinds = mcScoringKinds();
    var kindOpts = kinds.map(function (k) { return '<option value="' + esc(k.key) + '" data-pts="' + (k.points || 0) + '">' + esc(k.label) + '</option>'; }).join('');
    var tab = S.mcTab || 'timeline';
    var liveBtn = m.status === 'final' ? '<span class="lg-mcstat final">Full time</span>'
      : (m.status === 'live' ? '<button class="lg-btn lg-livebtn" onclick="FFPLeague.setLive(\'scheduled\')">● LIVE</button>'
        : '<button class="lg-btn" onclick="FFPLeague.setLive(\'live\')">' + ic('sensors') + 'Go live</button>');
    host.innerHTML =
      '<div class="lg-tool"><button class="lg-btn" onclick="FFPLeague.closeMatch()">' + ic('arrow_back') + 'Back to fixtures</button><span class="sp"></span>' + liveBtn + '<button class="lg-btn pri" onclick="FFPLeague.saveResultFromEvents()">' + ic('check') + 'Save result</button></div>'
      + '<div class="lg-mchd"><div class="tm">' + crest(m.home) + '<b>' + esc(m.home.name) + '</b></div><div class="scr">' + esc(score) + '</div><div class="tm a"><b>' + esc(m.away.name) + '</b>' + crest(m.away) + '</div></div>'
      + '<div class="lg-mcstream" style="display:flex;gap:8px;align-items:center;margin:10px 0"><input class="lg-in" id="mc-stream" placeholder="Live stream URL (YouTube, Twitch, Facebook…)" value="' + esc(m.stream_url || '') + '" style="flex:1"><button class="lg-btn" onclick="FFPLeague.saveStream()">' + ic('live_tv') + 'Save stream</button></div>' + gfxRow(m)
      + '<div class="lg-mctabs"><button class="' + (tab === 'timeline' ? 'on' : '') + '" onclick="FFPLeague.mcTab(\'timeline\')">Scoring timeline</button><button class="' + (tab === 'subs' ? 'on' : '') + '" onclick="FFPLeague.mcTab(\'subs\')">Substitutions</button><button class="' + (tab === 'stats' ? 'on' : '') + '" onclick="FFPLeague.mcTab(\'stats\')">Player stats</button><button class="' + (tab === 'team' ? 'on' : '') + '" onclick="FFPLeague.mcTab(\'team\')">Team stats</button><button class="' + (tab === 'sheet' ? 'on' : '') + '" onclick="FFPLeague.mcTab(\'sheet\')">Team sheet</button></div>'
      + (tab === 'sheet' ? tsSheet(m)
        : tab === 'timeline'
        ? ('<div class="lg-mcadd">'
          + '<input class="lg-in" id="mc-min" type="number" placeholder="Min" style="width:70px">'
          + '<select class="lg-sel" id="mc-kind">' + kindOpts + '</select>'
          + '<select class="lg-sel" id="mc-team">' + teamOpts + '</select>'
          + '<select class="lg-sel" id="mc-player"></select>'
          + '<button class="lg-btn pri" onclick="FFPLeague.addEvent()">' + ic('add') + 'Add</button></div>'
          + '<div class="lg-sub" style="margin:6px 0 0">Order: time, action, team, player</div><div id="mc-list"></div>')
        : tab === 'subs'
        ? ('<div class="lg-mcadd">'
          + '<input class="lg-in" id="sub-min" type="number" placeholder="Min" style="width:70px">'
          + '<select class="lg-sel" id="sub-team">' + teamOpts + '</select>'
          + '<select class="lg-sel" id="sub-off"></select>'
          + '<select class="lg-sel" id="sub-on"></select>'
          + '<button class="lg-btn pri" onclick="FFPLeague.addSub()">' + ic('swap_horiz') + 'Record</button></div>'
          + '<div class="lg-sub" style="margin:6px 0 0">Player OFF ▼ – Player ON ▲</div><div id="mc-subs"></div>')
        : tab === 'stats' ? '<div id="mc-stats"><div class="lg-empty">Loading…</div></div>'
        : '<div id="mc-team"><div class="lg-empty">Loading…</div></div>');
    if (tab === 'timeline') {
      mcFillPlayers();
      document.getElementById('mc-team').addEventListener('change', mcFillPlayers);
      document.getElementById('mc-kind').addEventListener('change', mcFillPlayers);
      renderMcList();
    } else if (tab === 'subs') {
      mcFillSubPlayers();
      document.getElementById('sub-team').addEventListener('change', mcFillSubPlayers);
      renderMcSubs();
    } else if (tab === 'stats') { renderMcStats(); }
    else { renderMcTeam(); }
  }
  // ---------- RACKET PLAY-BY-PLAY (point-by-point) — padel/tennis + rally sports ----------
  var SET_SPORTS = ['padel', 'tennis', 'racket', 'volleyball'];
  function mcIsSet(m) { return SET_SPORTS.indexOf((m || {}).sport_key) > -1; }
  function setsWon(sets, side) { var n = 0; (sets || []).forEach(function (s) { if (s[0] == null || s[1] == null) return; if (side === 0 ? s[0] > s[1] : s[1] > s[0]) n++; }); return n; }
  function pbpCfg(m) {
    var a = ((m && m.activity) || '').toLowerCase(), sk = (m && m.sport_key) || '';
    if (sk === 'padel' || a.indexOf('padel') > -1) return { engine: 'tennis', golden: true, needSets: 2 };
    if (a.indexOf('table') > -1) return { engine: 'rally', target: 11, needGames: 3 };
    if (a.indexOf('badminton') > -1) return { engine: 'rally', target: 21, needGames: 2 };
    if (a.indexOf('squash') > -1) return { engine: 'rally', target: 11, needGames: 3, squash: true };
    if (a.indexOf('pickle') > -1) return { engine: 'rally', target: 11, needGames: 2 };
    if (a.indexOf('racquet') > -1 || a.indexOf('racket') > -1) return { engine: 'rally', target: 15, needGames: 2 };
    if (a.indexOf('volley') > -1) return { engine: 'rally', target: 25, needGames: 3 };
    if (sk === 'tennis' || a.indexOf('tennis') > -1) return { engine: 'tennis', golden: false, needSets: 2 };
    return { engine: 'rally', target: 11, needGames: 2 };
  }
  function ptL(x, y, tb, golden) { if (tb) return String(x); if (golden && x >= 3 && y >= 3) return '40'; if (x >= 3 && y >= 3) return x === y ? '40' : (x > y ? 'Ad' : '40'); return ['0', '15', '30', '40'][Math.min(x, 3)]; }
  function pbpInit(m) {
    var L = m.live, sets = Array.isArray(m.sets) ? m.sets.map(function (s) { return [s[0], s[1]]; }) : [];
    var b = { sets: sets, gh: 0, ga: 0, ph: 0, pa: 0, tb: false, server: 'home', done: m.status === 'final' };
    if (L && typeof L.ph === 'number') { b.gh = L.gh || 0; b.ga = L.ga || 0; b.ph = L.ph || 0; b.pa = L.pa || 0; b.tb = !!L.tb; b.server = L.server === 'away' ? 'away' : 'home'; if (Array.isArray(L.sets) && L.sets.length >= sets.length) b.sets = L.sets.map(function (s) { return [s[0], s[1]]; }); }
    S._live = b; S._lhist = [];
  }
  function pbpPersist() {
    clearTimeout(S._lTmr);
    S._lTmr = setTimeout(function () { var t = S._live; sb().rpc('lt_match_save_sets', { p_scope: 'league', p_match: S.matchOpen, p_sets: t.sets, p_home: setsWon(t.sets, 0), p_away: setsWon(t.sets, 1), p_live: { gh: t.gh, ga: t.ga, ph: t.ph, pa: t.pa, tb: t.tb, server: t.server, sets: t.sets } }); }, 350);
  }
  function pbpSnap() { S._lhist.push(JSON.stringify(S._live)); if (S._lhist.length > 300) S._lhist.shift(); }
  function pbpDone() { var need = S._cfg.engine === 'rally' ? S._cfg.needGames : S._cfg.needSets; if (setsWon(S._live.sets, 0) >= need || setsWon(S._live.sets, 1) >= need) S._live.done = true; }
  function pbpAward(side) {
    var t = S._live, cfg = S._cfg; if (t.done) return; pbpSnap();
    if (cfg.engine === 'rally') {
      var me = side === 'home' ? 'ph' : 'pa', op = side === 'home' ? 'pa' : 'ph';
      t[me]++; if (t[me] >= cfg.target && t[me] - t[op] >= 2) { t.sets.push([t.ph, t.pa]); t.ph = 0; t.pa = 0; pbpDone(); }
    } else {
      var g = cfg.golden, m2 = side === 'home' ? 'ph' : 'pa', o2 = side === 'home' ? 'pa' : 'ph', gm = side === 'home' ? 'gh' : 'ga', go = side === 'home' ? 'ga' : 'gh';
      t[m2]++;
      if (t.tb) { if (t[m2] >= 7 && t[m2] - t[o2] >= 2) { t.sets.push(side === 'home' ? [7, 6] : [6, 7]); t.gh = 0; t.ga = 0; t.ph = 0; t.pa = 0; t.tb = false; pbpDone(); } }
      else if (t[m2] >= 4 && (t[m2] - t[o2] >= 2 || (g && t[o2] >= 3))) { t[gm]++; t.ph = 0; t.pa = 0; t.server = t.server === 'home' ? 'away' : 'home'; if (t[gm] >= 6 && t[gm] - t[go] >= 2) { t.sets.push([t.gh, t.ga]); t.gh = 0; t.ga = 0; pbpDone(); } else if (t.gh === 6 && t.ga === 6) { t.tb = true; } }
    }
    pbpPersist(); renderPBP(S._mc, document.getElementById('lg-tab'));
  }
  function pbpUndo() { var h = S._lhist.pop(); if (h) { S._live = JSON.parse(h); pbpPersist(); renderPBP(S._mc, document.getElementById('lg-tab')); } }
  function pbpServer() { S._live.server = S._live.server === 'home' ? 'away' : 'home'; pbpPersist(); renderPBP(S._mc, document.getElementById('lg-tab')); }
  function pbpDecide(k) { if (k === 'let') return; var srv = S._live.server; pbpAward(k === 'stroke' ? srv : (srv === 'home' ? 'away' : 'home')); }
  async function pbpFinish() { var t = S._live; try { await sb().rpc('league_result_save', { p_fixture: S.matchOpen, p_home: setsWon(t.sets, 0), p_away: setsWon(t.sets, 1), p_sets: t.sets, p_status: 'final' }); toast('Result saved', 'success'); renderMatchCentre(); } catch (e) { toast('Could not save result', 'error'); } }
  var PBP_CSS = ".pbp-board{background:linear-gradient(158deg,#1c3e52,#0d1e2a);color:#fff;border-radius:16px;padding:16px 18px;margin-bottom:16px;max-width:660px}.pbp-hd{display:flex;align-items:center;padding:0 2px 8px;border-bottom:1px solid rgba(255,255,255,.12)}.pbp-hd .sp{flex:1}.pbp-hd .lb{width:60px;text-align:center;font-size:9px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:rgba(255,255,255,.5)}.pbp-hd .lb.g{width:52px}.pbp-hd .lb.p{width:60px}.pbp-r{display:flex;align-items:center;padding:12px 2px}.pbp-r+.pbp-r{border-top:1px solid rgba(255,255,255,.08)}.pbp-r .clr{width:5px;height:34px;border-radius:3px;margin-right:12px}.pbp-r.home .clr{background:linear-gradient(180deg,#25a6d8,#12557a)}.pbp-r.away .clr{background:linear-gradient(180deg,#6a7e8c,#243645)}.pbp-r .who{flex:1;min-width:0}.pbp-r .who b{font-size:16px;font-weight:800}.pbp-r .who .srv{display:block;font-size:10px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#7bf0bd;margin-top:2px}.pbp-r .cells{width:60px;display:flex;gap:8px;justify-content:center;font-size:15px;font-weight:700;color:rgba(255,255,255,.5)}.pbp-r .cells .w{color:#fff}.pbp-r .gm{width:52px;text-align:center;font-size:19px;font-weight:800}.pbp-r .pt{width:60px;text-align:center;font-size:34px;font-weight:900;line-height:1}.pbp-flags{text-align:center;margin-top:10px}.pbp-tag{display:inline-block;font-size:10px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;padding:5px 11px;border-radius:20px;background:rgba(242,169,0,.22);color:#ffe2a0}.pbp-serve{text-align:center;font-size:12px;font-weight:700;color:rgba(255,255,255,.82);margin-top:9px}.pbp-serve .ms{font-size:15px;vertical-align:-3px;color:#ffce4d;margin-right:4px}.pbp-clab{max-width:660px;text-align:center;font-size:11px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:#6b7f8b;margin:0 0 12px}.pbp-btns{max-width:660px;display:flex;gap:14px;margin-bottom:12px}.pbp-pb{flex:1;border:0;border-radius:18px;color:#fff;cursor:pointer;padding:26px 12px;display:flex;flex-direction:column;align-items:center;gap:8px;box-shadow:0 10px 24px rgba(15,34,48,.18)}.pbp-pb.home{background:linear-gradient(160deg,#25a6d8,#0f5578)}.pbp-pb.away{background:linear-gradient(160deg,#4a6172,#243645)}.pbp-pb:active{filter:brightness(1.07)}.pbp-pb:disabled{opacity:.5;cursor:default}.pbp-pb .pl{font-size:13px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;opacity:.9;display:flex;align-items:center;gap:6px}.pbp-pb .pl .ms{font-size:20px}.pbp-pb .nm{font-size:22px;font-weight:900}.pbp-decide{max-width:660px;display:flex;gap:10px;margin-bottom:12px}.pbp-decide button{flex:1;border:0;border-radius:12px;padding:13px;font:inherit;font-weight:800;cursor:pointer}.pbp-decide .let{background:rgba(25,128,173,.14);color:#1980AD}.pbp-decide .stroke{background:rgba(242,169,0,.2);color:#c47f00}.pbp-decide .nolet{background:#eef2f5;color:#5b6b75}.pbp-srow{max-width:660px;display:flex;gap:10px}.pbp-srow button{flex:1;border:1px solid var(--ffp-border-mid);background:#fff;border-radius:12px;padding:12px;font:inherit;font-weight:800;color:var(--ffp-text);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px}.pbp-srow button .ms{font-size:19px;color:#c47f00}";
  function renderPBP(m, host) {
    if (!document.getElementById('pbp-css')) { var st = document.createElement('style'); st.id = 'pbp-css'; st.textContent = PBP_CSS; document.head.appendChild(st); }
    var t = S._live, cfg = S._cfg, rally = cfg.engine === 'rally';
    var wonH = setsWon(t.sets, 0), wonA = setsWon(t.sets, 1);
    var dH = rally ? { c: t.sets.map(function (s) { return s[0]; }), gm: wonH, pt: t.ph } : { c: t.sets.map(function (s) { return s[0]; }), gm: t.gh, pt: ptL(t.ph, t.pa, t.tb, cfg.golden) };
    var dA = rally ? { c: t.sets.map(function (s) { return s[1]; }), gm: wonA, pt: t.pa } : { c: t.sets.map(function (s) { return s[1]; }), gm: t.ga, pt: ptL(t.pa, t.ph, t.tb, cfg.golden) };
    var flag = t.tb ? 'Tiebreak' : (!rally && t.ph >= 3 && t.pa >= 3 ? (cfg.golden ? 'Golden point' : (t.ph === t.pa ? 'Deuce' : 'Advantage')) : '');
    var serveName = t.server === 'home' ? m.home.name : m.away.name;
    var liveBtn = m.status === 'final' ? '<span class="lg-mcstat final">Full time</span>' : (m.status === 'live' ? '<button class="lg-btn lg-livebtn" onclick="FFPLeague.setLive(\'scheduled\')">● LIVE</button>' : '<button class="lg-btn" onclick="FFPLeague.setLive(\'live\')">' + ic('sensors') + 'Go live</button>');
    function row(side, d, nm, sv) { var cells = d.c.map(function (v, i) { return '<span class="' + (i === d.c.length - 1 ? 'w' : '') + '">' + v + '</span>'; }).join(''); return '<div class="pbp-r ' + side + '"><span class="clr"></span><span class="who"><b>' + esc(nm) + '</b>' + (sv ? '<span class="srv">● Serving</span>' : '') + '</span><span class="cells">' + cells + '</span><span class="gm">' + d.gm + '</span><span class="pt">' + d.pt + '</span></div>'; }
    var decide = cfg.squash ? '<div class="pbp-decide"><button class="let" onclick="FFPLeague.pbpDecide(\'let\')">Let</button><button class="stroke" onclick="FFPLeague.pbpDecide(\'stroke\')">Stroke</button><button class="nolet" onclick="FFPLeague.pbpDecide(\'nolet\')">No let</button></div>' : '';
    host.innerHTML =
      '<div class="lg-tool"><button class="lg-btn" onclick="FFPLeague.closeMatch()">' + ic('arrow_back') + 'Back</button><span class="sp"></span>' + liveBtn + '<button class="lg-btn pri" onclick="FFPLeague.pbpFinish()">' + ic('check') + 'Finish and save result</button></div>'
      + '<div class="pbp-board"><div class="pbp-hd"><span class="sp"></span><span class="lb">Sets</span><span class="lb g">' + (rally ? 'Games' : 'Gm') + '</span><span class="lb p">Pts</span></div>'
      + row('away', dA, m.away.name, t.server === 'away') + row('home', dH, m.home.name, t.server === 'home')
      + (flag ? '<div class="pbp-flags"><span class="pbp-tag">' + flag + '</span></div>' : '')
      + '<div class="pbp-serve">' + ic('sports_tennis') + esc(serveName) + ' to serve</div></div>'
      + '<div class="pbp-clab">Tap who won the ' + (rally ? 'rally' : 'point') + '</div>'
      + '<div class="pbp-btns"><button class="pbp-pb away" ' + (t.done ? 'disabled' : '') + ' onclick="FFPLeague.pbpAward(\'away\')"><span class="pl">' + ic('add') + 'Point</span><span class="nm">' + esc(m.away.name) + '</span></button>'
      + '<button class="pbp-pb home" ' + (t.done ? 'disabled' : '') + ' onclick="FFPLeague.pbpAward(\'home\')"><span class="pl">' + ic('add') + 'Point</span><span class="nm">' + esc(m.home.name) + '</span></button></div>'
      + decide
      + '<div class="pbp-srow"><button onclick="FFPLeague.pbpUndo()">' + ic('undo') + 'Undo</button><button onclick="FFPLeague.pbpServer()">' + ic('swap_horiz') + 'Change server</button></div>'
      + '<div class="lg-mcstream" style="display:flex;gap:8px;align-items:center;margin:14px 0 0;max-width:660px"><input class="lg-in" id="mc-stream" placeholder="Live stream URL (YouTube, Twitch, Facebook…)" value="' + esc(m.stream_url || '') + '" style="flex:1"><button class="lg-btn" onclick="FFPLeague.saveStream()">' + ic('live_tv') + 'Save stream</button></div>' + gfxRow(m)
      + '<div class="lg-sub" style="margin:10px 0 0">Point-by-point — every tap streams live to followers. Same board as the FFP App scorer.</div>';
  }


  // ── broadcast graphics. The overlay URL goes into the encoder once (YoloBox
  //    Web URL, or an OBS/vMix browser source); the control page is what the
  //    operator drives during the match. ────────────────────────────────────
  var GFX_BASE = 'https://app.findfitpeople.com/gfx/';
  function gfxRow(m) {
    if (!m || !m.id) return '';
    return '<div class="lg-gfx">'
      + '<span class="ms">smart_display</span>'
      + '<div class="g"><b>Broadcast graphics</b><span>Overlay URL goes in the encoder once, at 1920\u00d71080 (16:9 HD). Tries, cards and substitutions show themselves as the scorer records them \u2014 the control link is only needed when someone is running the graphics by hand.</span></div>'
      + '<button class="lg-btn" onclick="FFPLeague.gfxCopy(\'' + m.id + '\')">' + ic('content_copy') + 'Copy overlay URL</button>'
      + '<button class="lg-btn" onclick="FFPLeague.gfxLink(\'' + m.id + '\')">' + ic('link') + 'Copy control link</button>'
      + '<button class="lg-btn pri" onclick="FFPLeague.gfxOpen(\'' + m.id + '\')">' + ic('tune') + 'Open control</button>'
      + '</div>';
  }
  // The control page is run by a livestream operator who is not an FFP member,
  // so the organiser mints a key for this match and it travels in the link.
  async function gfxOpen(id) {
    var w = window.open('', '_blank');           // opened on the click, or the popup is blocked
    var r; try { r = await sb().rpc('gfx_key', { p_match: id }); } catch (e) { r = null; }
    var key = r && r.data;
    if (!key) { if (w) w.close(); toast((r && r.error && r.error.message) || 'Could not open the control page', 'error'); return; }
    var url = GFX_BASE + id + '/control?k=' + encodeURIComponent(key);
    if (w) { w.location = url; } else { window.open(url, '_blank', 'noopener'); }
  }
  async function gfxLink(id) {
    var r; try { r = await sb().rpc('gfx_key', { p_match: id }); } catch (e) { r = null; }
    var key = r && r.data;
    if (!key) { toast('Could not make the control link', 'error'); return; }
    var url = GFX_BASE + id + '/control?k=' + encodeURIComponent(key);
    try { navigator.clipboard.writeText(url); toast('Control link copied \u2014 send it to your operator', 'check'); }
    catch (e) { prompt('Control link', url); }
  }
  function gfxCopy(id) {
    var url = GFX_BASE + id;
    try { navigator.clipboard.writeText(url); toast('Overlay URL copied \u2014 add it at 1920\u00d71080 in YoloBox, OBS or vMix', 'check'); }
    catch (e) { prompt('Overlay URL', url); }
  }



  // ── TEAM SHEET. The 23 positions are fixed — 1 is the loosehead prop, 10 is
  //    the fly-half, always. What changes each match is WHO fills each
  //    position, picked from the club's squad. So the sheet reads
  //    position-first: one row per position, a player dropped into it. ──────────────────────
  function tsSquadFor(entId) { return (S._squad || []).filter(function (x) { return x.entrant_id === entId; }); }
  function tsUsed(entId, exceptNo) {
    var o = {}; (S._slots || []).forEach(function (x) {
      if (Number(x.number) !== Number(exceptNo) && x.squad_id) o[x.squad_id] = 1;
    }); return o;
  }
  function tsNamedCount() { return (S._slots || []).filter(function (x) { return !!x.squad_id; }).length; }
  async function tsReload() {
    var m = S._mc || {}; if (!m.id) return;
    var tm = (S._tsTeam === 'away' ? m.away : m.home) || {};
    if (!tm.id) return;
    try { var r = await sb().rpc('lt_teamsheet_slots', { p_match: m.id, p_entrant: tm.id }); S._slots = (r && r.data) || []; }
    catch (e) { S._slots = []; }
    try { var c = await sb().rpc('lt_staff_list', { p_match: m.id, p_entrant: tm.id }); S._coach = ((c && c.data) || [])[0] ? c.data[0].name : ''; }
    catch (e) { S._coach = ''; }
    if (!(S._squad || []).length) {
      try { var q = await sb().rpc('lt_squad_list', { p_scope: 'league', p_event: S.eventId }); S._squad = (q && q.data) || []; } catch (e) {}
    }
    if (S.mcTab === 'sheet') renderMatchCentre();
  }
  async function tsPut(num, squadId) {
    var m = S._mc || {}; var cur = (S._slots || []).filter(function (x) { return Number(x.number) === Number(num); })[0] || {};
    // Both sides have a number 11. Emptying a slot sends no squad id, so without
    // the entrant the database cannot tell whose 11 it is and used to delete the
    // other team's player. p_entrant is the side on screen.
    var tm = (S._tsTeam === 'away' ? m.away : m.home) || {};
    var r;
    try {
      r = await sb().rpc('lt_teamsheet_assign', { p_match: m.id, p_number: Number(num),
        p_squad: squadId || null, p_captain: null, p_position: cur.grp === 'replacements' ? (cur.position || null) : null,
        p_entrant: tm.id || null });
    } catch (e) { r = { error: e }; }
    if (r && r.error) { toast(r.error.message || 'Could not fill that position', 'error'); return; }
    tsReload();
  }
  async function tsCovers(num, pos) {
    var m = S._mc || {}; var cur = (S._slots || []).filter(function (x) { return Number(x.number) === Number(num); })[0] || {};
    if (!cur.squad_id) return;
    var r;
    try { r = await sb().rpc('lt_teamsheet_assign', { p_match: m.id, p_number: Number(num), p_squad: cur.squad_id, p_captain: null, p_position: pos || null }); }
    catch (e) { r = { error: e }; }
    // supabase-js RETURNS {error}; it does not throw. Without this the call
    // failed and the screen said nothing at all.
    if (r && r.error) { toast(r.error.message || 'Could not set the cover', 'error'); return; }
    tsReload();
  }
  async function tsCap(num) {
    var m = S._mc || {}; var cur = (S._slots || []).filter(function (x) { return Number(x.number) === Number(num); })[0] || {};
    if (!cur.squad_id) { toast('Put a player in that position first', 'error'); return; }
    var r;
    try { r = await sb().rpc('lt_teamsheet_assign', { p_match: m.id, p_number: Number(num), p_squad: cur.squad_id, p_captain: !cur.captain, p_position: cur.grp === 'replacements' ? (cur.position || null) : null }); }
    catch (e) { r = { error: e }; }
    if (r && r.error) { toast(r.error.message || 'Could not set the captain', 'error'); return; }
    tsReload();
  }
  function tsCoach() { return S._coach || ''; }
  async function tsSaveCoach(name) {
    var m = S._mc || {}; var tm = ((S._tsTeam === 'away' ? m.away : m.home) || {});
    if (!tm.id) return;
    try { await sb().rpc('lt_staff_set', { p_match: m.id, p_entrant: tm.id, p_name: name || '', p_role: 'Head coach' }); }
    catch (e) { toast('Could not save the coach', 'error'); return; }
    S._coach = name || ''; toast('Saved', 'check');
  }
  function tsTeam(which) { S._tsTeam = which; S._slots = []; renderMatchCentre(); tsReload(); }
  function tsSheet(m) {
    if (!m || !m.id) return '';
    var which = S._tsTeam || 'home';
    var tm = (which === 'away' ? m.away : m.home) || {};
    var slots = S._slots || [];
    if (!slots.length) return '<div class="lg-empty" style="padding:16px">No positions for this sport.</div>';
    var squad = tsSquadFor(tm.id);
    var allPos = (S._pos || []);

    var rows = slots.map(function (x) {
      var used = tsUsed(tm.id, x.number);
      var opts = '<option value="">&mdash; empty &mdash;</option>' + squad.map(function (p) {
        return '<option value="' + p.id + '"' + (p.id === x.squad_id ? ' selected' : '')
          + (used[p.id] ? ' disabled' : '') + '>' + esc(p.name) + '</option>';
      }).join('');
      var named = {};
      var cover = x.grp === 'replacements'
        ? '<select class="lg-sel cov" onchange="FFPLeague.tsCovers(' + x.number + ',this.value)"><option value="">Covers&hellip;</option>'
            + allPos.filter(function (y) { if (y.grp === 'replacements' || named[y.name]) return false; named[y.name] = 1; return true; })
                    .map(function (y) { return '<option value="' + esc(y.name) + '"' + (x.position === y.name ? ' selected' : '') + '>' + esc(y.name) + '</option>'; }).join('')
            + '</select>'
        : '';
      return '<div class="row' + (x.squad_id ? ' on' : '') + '">'
        + '<span class="no">' + x.number + '</span>'
        + '<span class="pos">' + esc(x.grp === 'replacements' ? 'Impact Bench' : x.position) + '</span>'
        + '<select class="lg-sel pl" onchange="FFPLeague.tsPut(' + x.number + ',this.value)">' + opts + '</select>'
        + cover
        + '<span class="cap' + (x.captain ? ' on' : '') + '" title="Captain" onclick="FFPLeague.tsCap(' + x.number + ')">C</span>'
        + '</div>';
    });

    var cut = slots.filter(function (x) { return x.grp !== 'replacements'; }).length;
    return '<div class="lg-tsheet">'
      + '<div class="tabs">'
      + '<button class="' + (which === 'home' ? 'on' : '') + '" onclick="FFPLeague.tsTeam(\'home\')">' + esc((m.home || {}).name || 'Home') + '</button>'
      + '<button class="' + (which === 'away' ? 'on' : '') + '" onclick="FFPLeague.tsTeam(\'away\')">' + esc((m.away || {}).name || 'Away') + '</button>'
      + '<span class="count">' + tsNamedCount() + ' named</span></div>'
      + '<details class="lg-info"><summary>' + ic('info') + 'About the team sheet</summary>'
      + '<p>The 23 positions are fixed &mdash; 2 is always the hooker, 9 always the scrum-half. Pick who fills each one today. Every player added to the club&#39;s squad under Entrants is in the list, and nobody can hold two positions at once. The livestream team sheet and try card are built from this.</p></details>'
      + '<div class="coach"><label>Coach</label><input class="lg-in" id="lg-ts-coach" placeholder="Head coach" value="' + esc(tsCoach()) + '" onblur="FFPLeague.tsSaveCoach(this.value)"></div>'
      + '<div class="grid"><div class="hd">Starting XV</div>' + rows.slice(0, cut).join('')
      + '<div class="hd">Impact Bench</div>' + rows.slice(cut).join('') + '</div></div>';
  }

  async function saveStream() {
    var el = document.getElementById('mc-stream'); if (!el) return;
    try { await sb().rpc('lt_match_set_stream', { p_scope: 'league', p_match: S.matchOpen, p_url: el.value.trim() }); toast('Stream link saved', 'success'); }
    catch (e) { toast('Could not save stream link', 'error'); }
  }
  async function setLive(status) {
    try { await sb().rpc('lt_match_status', { p_scope: 'league', p_match: S.matchOpen, p_status: status }); } catch (e) { toast('Could not update', 'error'); return; }
    toast(status === 'live' ? 'Match is now LIVE' : 'Match set to pending', 'success'); renderMatchCentre();
  }
  function mcTeamFields() { var m = S._mc || {}; var s = (S.sports || []).find(function (x) { return x.key === m.sport_key; }); return (s && s.team_match_fields) || []; }
  async function renderMcTeam() {
    var host = document.getElementById('mc-team'); if (!host) return; var m = S._mc || {}; await loadSports();
    var fields = mcTeamFields();
    if (!fields.length) { host.innerHTML = '<div class="lg-empty">This sport has no team match-stat fields.</div>'; return; } // sport-words-ok — a stat field, not a playing surface
    var gr; try { gr = await sb().rpc('lt_team_match_stats_get', { p_scope: 'league', p_match: S.matchOpen }); } catch (e) { gr = null; }
    var saved = (gr && gr.data) || {};
    var hv = saved[m.home.id] || {}, av = saved[m.away.id] || {};
    if (!S._mcDiv) { try { var dr = await sb().from('league_fixtures').select('division_id').eq('id', S.matchOpen).single(); S._mcDiv = dr.data && dr.data.division_id; } catch (e) {} }
    var fPoss = fields.filter(function (f) { return f.key === 'possession'; })[0];
    var fTerr = fields.filter(function (f) { return f.key === 'territory'; })[0];
    var hasPoss = !!fPoss, hasTerr = !!fTerr;
    host.innerHTML = mcPeriodHtml(m) + (hasPoss || hasTerr ? trkHtml(m, fPoss, fTerr) : '')
      + '<div class="lg-teamstat"><div class="hd"><span>' + esc(m.home.name) + '</span><span class="lab"></span><span>' + esc(m.away.name) + '</span></div>'
      + fields.map(function (f) {
        return '<div class="lg-tsrow" data-key="' + esc(f.key) + '"><input class="lg-in ts-h" type="number" value="' + (hv[f.key] != null ? hv[f.key] : '') + '" placeholder="0"><span class="lab">' + esc(f.label) + (f.pct ? ' %' : '') + '</span><input class="lg-in ts-a" type="number" value="' + (av[f.key] != null ? av[f.key] : '') + '" placeholder="0"></div>';
      }).join('')
      + '</div><button class="lg-btn pri" style="margin-top:12px" onclick="FFPLeague.saveTeamStats()">' + ic('check') + 'Save team stats</button>';
    if (hasPoss || hasTerr) { trkRefresh(); if (_trk().running && !S._trkInt) S._trkInt = setInterval(trkTick, 1000); }
  }
  // ---- live possession / territory tracker (manual start/stop; fills the % fields) ----
  function _trk() { if (!S._tracker) S._tracker = { running: false, poss: null, half: null, ph: 0, pa: 0, hh: 0, ha: 0, total: 0 }; return S._tracker; }
  function fmtClock(s) { s = s || 0; var m = Math.floor(s / 60), ss = s % 60; return (m < 10 ? '0' : '') + m + ':' + (ss < 10 ? '0' : '') + ss; }
  function trkPct(a, b) { var s = a + b; return s ? Math.round(a / s * 100) : 0; }
  function trkHtml(m, fPoss, fTerr) {
    var t = _trk();
    var terr = fTerr ? '<div class="lg-trk-grp"><div class="lg-trk-lab">' + esc(fTerr.label) + ' — which half the ball is in</div><div class="lg-trk-btns">'
      + '<button class="lg-trk-b" data-half="home" onclick="FFPLeague.trkHalf(\'home\')">' + esc(m.home.name) + ' half</button>'
      + '<button class="lg-trk-b" data-half="away" onclick="FFPLeague.trkHalf(\'away\')">' + esc(m.away.name) + ' half</button></div></div>' : '';
    return '<div class="lg-trk"><div class="lg-trk-clock"><div class="t" id="trk-clock">' + fmtClock(t.total) + '</div><span class="sp"></span>'
      + '<button class="lg-btn" id="trk-toggle" onclick="FFPLeague.trkToggle()">Start</button>'
      + '<button class="lg-btn ghost" onclick="FFPLeague.trkReset()">Reset</button></div>'
      + (fPoss ? '<div class="lg-trk-grp"><div class="lg-trk-lab">' + esc(fPoss.label) + ' — who has the ball</div><div class="lg-trk-btns">'
      + '<button class="lg-trk-b" data-poss="home" onclick="FFPLeague.trkPoss(\'home\')">' + esc(m.home.name) + ' <span>0%</span></button>'
      + '<button class="lg-trk-b" data-poss="away" onclick="FFPLeague.trkPoss(\'away\')">' + esc(m.away.name) + ' <span>0%</span></button></div></div>' : '')
      + terr
      + '<div class="lg-trk-apply"><span class="sum" id="trk-sum"></span><button class="lg-btn pri" onclick="FFPLeague.trkApply()">' + ic('done_all') + 'Apply to fields</button></div></div>';
  }
  function trkRefresh() {
    var t = _trk();
    var clk = document.getElementById('trk-clock'); if (!clk) return;
    clk.textContent = fmtClock(t.total);
    var tog = document.getElementById('trk-toggle'); if (tog) { tog.textContent = t.running ? 'Stop' : 'Start'; tog.classList.toggle('pri', !t.running); tog.classList.toggle('lg-livebtn', t.running); }
    var pHome = trkPct(t.ph, t.pa), pAway = (t.ph + t.pa) ? 100 - pHome : 0;
    document.querySelectorAll('.lg-trk-b[data-poss]').forEach(function (b) {
      var s = b.getAttribute('data-poss'); b.classList.toggle('on', t.poss === s);
      var sp = b.querySelector('span'); if (sp) sp.textContent = (s === 'home' ? pHome : pAway) + '%';
    });
    document.querySelectorAll('.lg-trk-b[data-half]').forEach(function (b) { b.classList.toggle('on', t.half === b.getAttribute('data-half')); });
    // territory = time in the OPPONENT's half: home territory = time in away half (t.ha)
    var teH = trkPct(t.ha, t.hh), teA = (t.hh + t.ha) ? 100 - teH : 0;
    var sum = document.getElementById('trk-sum'); if (sum) sum.textContent = 'Possession ' + pHome + '–' + pAway + '    Territory ' + teH + '–' + teA;
  }
  function trkTick() { var t = _trk(); if (!t.running) return; t.total++; if (t.poss === 'home') t.ph++; else if (t.poss === 'away') t.pa++; if (t.half === 'home') t.hh++; else if (t.half === 'away') t.ha++; trkRefresh(); }
  function trkToggle() { var t = _trk(); t.running = !t.running; if (S._trkInt) { clearInterval(S._trkInt); S._trkInt = null; } if (t.running) S._trkInt = setInterval(trkTick, 1000); trkRefresh(); }
  function trkReset() { if (S._trkInt) { clearInterval(S._trkInt); S._trkInt = null; } S._tracker = { running: false, poss: null, half: null, ph: 0, pa: 0, hh: 0, ha: 0, total: 0 }; renderMatchCentre(); }
  function trkPoss(s) { var t = _trk(); t.poss = s; trkRefresh(); }
  function trkHalf(s) { var t = _trk(); t.half = s; trkRefresh(); }
  // ---- match period — driven by the sport's own period_minutes / period_count ----
  /* THE CLOCK BELONGS TO THE SPORT, NOT TO RUGBY. lt_match_detail hands down
     period_minutes + period_count (match -> division -> event -> sport schema),
     so netball runs four 15s and sevens two 7s. Nothing here is hardcoded. */
  function mcPeriodCount(m) { return parseInt((m || {}).period_count, 10) || 2; }
  function mcPeriodMins(m) {
    var pm = parseInt((m || {}).period_minutes, 10) || 0;
    if (pm) return pm;
    return Math.max(1, Math.round(matchMins() / mcPeriodCount(m)));
  }
  function mcPeriods(m) {
    var n = mcPeriodCount(m);
    if (n === 4) return [['pre', 'Not started', false], ['q1', '1st quarter', true], ['qt1', 'Quarter-time', false], ['q2', '2nd quarter', true], ['ht', 'Half-time', false], ['q3', '3rd quarter', true], ['qt3', '3-quarter time', false], ['q4', '4th quarter', true], ['ft', 'Full time', false]];
    if (n <= 1) return [['pre', 'Not started', false], ['h1', 'Match', true], ['ft', 'Full time', false]];
    if (n === 2) return [['pre', 'Not started', false], ['h1', '1st half', true], ['ht', 'Half-time', false], ['h2', '2nd half', true], ['ft', 'Full time', false]];
    var ORD = ['', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'], seq = [['pre', 'Not started', false]];
    for (var i = 1; i <= n; i++) {
      seq.push(['p' + i, (ORD[i] || i + 'th') + ' period', true]);
      if (i < n) seq.push([i * 2 === n ? 'ht' : 'b' + i, i * 2 === n ? 'Half-time' : 'Break', false]);
    }
    seq.push(['ft', 'Full time', false]);
    return seq;
  }
  /* "Resume clock at" = the minutes already played, from the sport's own period
     length: 40:00 at rugby half-time, 15:00 at netball quarter-time. */
  function mcResumeAt(m) {
    var seq = mcPeriods(m), period = (S._mc && S._mc.period) || 'pre', mins = mcPeriodMins(m), done = 0;
    for (var i = 0; i < seq.length; i++) { if (seq[i][0] === period) break; if (seq[i][2]) done++; }
    var t = done * mins;
    return (t < 10 ? '0' : '') + t + ':00';
  }
  function mcPeriodHtml(m) {
    var seq = mcPeriods(m); var period = (S._mc && S._mc.period) || 'pre';
    var idx = 0; for (var i = 0; i < seq.length; i++) { if (seq[i][0] === period) { idx = i; break; } }
    var cur = seq[idx], next = seq[idx + 1];
    var chip = period === 'pre' ? '' : (cur[2] ? 'live' : (period === 'ft' ? 'ft' : 'ht'));
    var st = (S._mcSetTime == null ? mcResumeAt(m) : S._mcSetTime);
    var btn = '';
    if (next) {
      var nk = next[0], nlab = next[1], nplay = next[2];
      var label = nk === 'ft' ? 'Full-time' : (nplay ? (idx === 0 ? 'Kick off' : 'Start ' + nlab) : nlab);
      var cls = nk === 'ft' ? 'red' : (nplay ? 'pri' : 'gold');
      btn = '<button class="lg-btn ' + (cls === 'red' ? '' : cls) + '"' + (cls === 'red' ? ' style="background:#d6353b;border-color:#d6353b;color:#fff"' : '') + ' onclick="FFPLeague.mcSetPeriod(\'' + nk + '\')">' + esc(label) + '</button>';
    }
    var showSet = !cur[2] && period !== 'pre' && period !== 'ft';   // a break before a play period
    return '<div class="lg-per"><span class="lg-perchip ' + chip + '">' + (chip === 'live' ? '<span class="d"></span>' : '') + esc(cur[1]) + '</span><span class="sp"></span>' + btn + '</div>'
      + (showSet ? '<div class="lg-perset"><span>Resume clock at</span><input class="lg-in" id="mc-settime" value="' + esc(st) + '" onchange="FFPLeague._mcSetTime(this.value)" style="width:110px"></div>' : '');
  }
  function _mcSetTime(v) { S._mcSetTime = v; }
  function mcSaveHalf(half, key, hv, av) {
    var m = S._mc || {};
    try { sb().rpc('lt_team_stat_set', { p_scope: 'league', p_event: S.eventId, p_division: S._mcDiv, p_match: S.matchOpen, p_entrant: m.home.id, p_key: key, p_value: hv, p_half: half }); } catch (e) {}
    try { sb().rpc('lt_team_stat_set', { p_scope: 'league', p_event: S.eventId, p_division: S._mcDiv, p_match: S.matchOpen, p_entrant: m.away.id, p_key: key, p_value: av, p_half: half }); } catch (e) {}
  }
  function mcSaveHalves(half) {
    var t = _trk();
    if (half === 1) {
      S._htSnap = { ph: t.ph, pa: t.pa, hh: t.hh, ha: t.ha };
      var posH = trkPct(t.ph, t.pa), teH = trkPct(t.ha, t.hh);
      mcSaveHalf(1, 'possession', posH, (t.ph + t.pa) ? 100 - posH : 0);
      mcSaveHalf(1, 'territory', teH, (t.hh + t.ha) ? 100 - teH : 0);
    } else {
      var s = S._htSnap; if (!s) return;
      var dph = t.ph - s.ph, dpa = t.pa - s.pa, dhh = t.hh - s.hh, dha = t.ha - s.ha;
      var p2 = trkPct(dph, dpa), t2 = trkPct(dha, dhh);
      mcSaveHalf(2, 'possession', p2, (dph + dpa) ? 100 - p2 : 0);
      mcSaveHalf(2, 'territory', t2, (dhh + dha) ? 100 - t2 : 0);
    }
  }
  async function mcSetPeriod(p) {
    var t = _trk(), m = S._mc || {}; var seq = mcPeriods(m);
    var inf = null, firstPlay = ''; for (var i = 0; i < seq.length; i++) { if (seq[i][2] && !firstPlay) firstPlay = seq[i][0]; if (seq[i][0] === p) inf = seq[i]; }
    var isPlay = inf && inf[2];
    if (p === 'ht') { if (t.running) trkToggle(); mcSaveHalves(1); }
    else if (p === 'ft') { if (t.running) trkToggle(); mcSaveHalves(2); }
    else if (isPlay && p === firstPlay) { if (!t.running) trkToggle(); }
    else if (isPlay) { var q = String(S._mcSetTime || mcResumeAt(m)).split(':'); t.total = (parseInt(q[0] || '0', 10) * 60) + (parseInt(q[1] || '0', 10) || 0); if (!t.running) trkToggle(); }
    else if (p !== 'ft') { if (t.running) trkToggle(); }   // pre or a break
    try { await sb().rpc('lt_match_set_period', { p_scope: 'league', p_match: S.matchOpen, p_period: p }); } catch (e) {}
    if (p === 'ft') { if ((m.events || []).length) { try { await saveResultFromEvents(); } catch (e) {} } else { try { await sb().rpc('lt_match_status', { p_scope: 'league', p_match: S.matchOpen, p_status: 'final' }); } catch (e) {} } }
    else { try { await sb().rpc('lt_match_status', { p_scope: 'league', p_match: S.matchOpen, p_status: p === 'pre' ? 'scheduled' : 'live' }); } catch (e) {} }
    if (S._mc) S._mc.period = p;
    S._mcSetTime = null;
    renderMatchCentre();
  }
  function trkApply() {
    var t = _trk();
    var setRow = function (key, hVal, aVal) { var row = document.querySelector('.lg-tsrow[data-key="' + key + '"]'); if (!row) return; row.querySelector('.ts-h').value = hVal; row.querySelector('.ts-a').value = aVal; };
    if (t.ph + t.pa > 0) { var pH = trkPct(t.ph, t.pa); setRow('possession', pH, 100 - pH); }
    if (t.hh + t.ha > 0) { var teH = trkPct(t.ha, t.hh); setRow('territory', teH, 100 - teH); }
    toast('Applied — tap Save team stats to store', 'success');
  }
  async function saveTeamStats() {
    var m = S._mc || {}; var rows = Array.prototype.slice.call(document.querySelectorAll('.lg-tsrow')); var n = 0;
    for (var i = 0; i < rows.length; i++) {
      var key = rows[i].getAttribute('data-key');
      var hv = rows[i].querySelector('.ts-h').value, av = rows[i].querySelector('.ts-a').value;
      try { await sb().rpc('lt_team_stat_set', { p_scope: 'league', p_event: S.eventId, p_division: S._mcDiv, p_match: S.matchOpen, p_entrant: m.home.id, p_key: key, p_value: hv === '' ? null : +hv }); } catch (e) {}
      try { await sb().rpc('lt_team_stat_set', { p_scope: 'league', p_event: S.eventId, p_division: S._mcDiv, p_match: S.matchOpen, p_entrant: m.away.id, p_key: key, p_value: av === '' ? null : +av }); } catch (e) {}
      if (hv !== '' || av !== '') n++;
    }
    toast(n + ' team stats saved', 'success');
  }
  function mcTab(t) { S.mcTab = t; S.mcStatPlayer = null; renderMatchCentre(); if (t === 'sheet') tsReload(); }
  function mcSchemaFields() {
    var m = S._mc || {}; var s = (S.sports || []).find(function (x) { return x.key === m.sport_key; });
    return (s && s.player_fields) || [{ key: 'points', label: 'Points' }];
  }
  async function renderMcStats() {
    var host = document.getElementById('mc-stats'); if (!host) return;
    var m = S._mc || {}; await loadSports();
    // division for lt_player_stat_set
    if (!S._mcDiv) { try { var dr = await sb().from('league_fixtures').select('division_id').eq('id', S.matchOpen).single(); S._mcDiv = dr.data && dr.data.division_id; } catch (e) {} }
    var sr; try { sr = await sb().rpc('lt_match_stats', { p_scope: 'league', p_match: S.matchOpen }); } catch (e) { sr = null; }
    S._mcStats = (sr && sr.data) || {};
    var squads = [{ t: m.home, list: m.home_squad || [] }, { t: m.away, list: m.away_squad || [] }];
    var flat = []; squads.forEach(function (g) { g.list.forEach(function (p) { flat.push({ p: p, ent: g.t.id, team: g.t.name }); }); });
    if (!flat.length) { host.innerHTML = '<div class="lg-empty">Add players to the team rosters (Entrants tab) to record detailed stats.</div>'; return; }
    var fields = mcSchemaFields().concat(m.custom_fields || []);
    var pOpts = flat.map(function (x) { return '<option value="' + x.p.player_id + '">' + esc(x.p.name) + ', ' + esc(x.team) + '</option>'; }).join('');
    if (!S.mcStatPlayer) S.mcStatPlayer = flat[0].p.player_id;
    var cur = flat.find(function (x) { return x.p.player_id === S.mcStatPlayer; }) || flat[0];
    var saved = S._mcStats[S.mcStatPlayer] || {};
    host.innerHTML = '<div class="lg-sub" style="margin:4px 0 12px">Enter each player’s match stats for <b>' + esc(m.activity || 'this sport') + '</b>. These power the player &amp; team stat pages.</div>'
      + '<div class="lg-mcadd" style="border:none"><select class="lg-sel" id="mc-sp" onchange="FFPLeague.mcPickStatPlayer(this.value)" style="flex:1;min-width:180px">' + pOpts + '</select></div>'
      + '<div class="lg-mcfields">' + fields.map(function (f) {
        return '<div class="lg-mcf"><label>' + esc(f.label) + (f.custom ? ' <span class="ms" style="font-size:14px;color:#c0cad2;cursor:pointer;vertical-align:-2px" onclick="FFPLeague.removeCustomStat(\'' + esc(f.key) + '\')">close</span>' : '') + '</label><input class="lg-in mc-f" data-key="' + esc(f.key) + '" type="number" value="' + (saved[f.key] != null ? saved[f.key] : '') + '" placeholder="0"></div>';
      }).join('') + '</div>'
      + '<div style="display:flex;gap:10px;align-items:center;margin-top:12px"><button class="lg-btn pri" onclick="FFPLeague.saveStats()">' + ic('check') + 'Save ' + esc(cur.p.name.split(' ')[0]) + '’s stats</button><button class="lg-btn ghostb" onclick="FFPLeague.addCustomStat()">' + ic('add') + 'Add your own stat</button></div>';
    var sp = document.getElementById('mc-sp'); if (sp) sp.value = S.mcStatPlayer;
  }
  async function addCustomStat() {
    var label = prompt('New stat name (e.g. Turnovers, Kicks, Tackles)'); if (!label || !label.trim()) return;
    var r; try { r = await sb().rpc('lt_event_custom_stat', { p_scope: 'league', p_event: S.eventId, p_label: label.trim() }); } catch (e) { r = { error: e }; }
    if (r.error) { toast('Could not add', 'error'); return; }
    if (S._mc) S._mc.custom_fields = r.data; toast('Stat added', 'success'); renderMcStats();
  }
  async function removeCustomStat(key) {
    var r; try { r = await sb().rpc('lt_event_custom_stat_remove', { p_scope: 'league', p_event: S.eventId, p_key: key }); } catch (e) { r = { error: e }; }
    if (r && !r.error && S._mc) S._mc.custom_fields = r.data; renderMcStats();
  }
  function mcPickStatPlayer(v) { S.mcStatPlayer = v; renderMcStats(); }
  async function saveStats() {
    var m = S._mc || {};
    var pid = S.mcStatPlayer;
    var squads = (m.home_squad || []).concat(m.away_squad || []);
    var pl = squads.find(function (p) { return p.player_id === pid; }) || {};
    var ent = (m.home_squad || []).some(function (p) { return p.player_id === pid; }) ? m.home.id : m.away.id;
    var inputs = Array.prototype.slice.call(document.querySelectorAll('.mc-f'));
    var n = 0;
    for (var i = 0; i < inputs.length; i++) {
      var key = inputs[i].getAttribute('data-key'); var val = inputs[i].value;
      if (val === '' || val == null) continue;
      try { await sb().rpc('lt_player_stat_set', { p_scope: 'league', p_event: S.eventId, p_division: S._mcDiv, p_match: S.matchOpen, p_entrant: ent, p_player: pid, p_player_name: pl.name || null, p_key: key, p_value: +val }); n++; } catch (e) {}
    }
    toast(n + ' stats saved for ' + (pl.name || 'player'), 'success'); renderMcStats();
  }
  function mcSquadFor(entrantId) { var m = S._mc || {}; return (m.home && m.home.id === entrantId) ? (m.home_squad || []) : (m.away_squad || []); }
  function mcKindTeamOnly(k) { var f = mcScoringKinds().find(function (x) { return x.key === k; }); return !!(f && f.team_only); }
  function mcFillPlayers() {
    var sel = document.getElementById('mc-player'); if (!sel) return;
    var kEl = document.getElementById('mc-kind');
    if (kEl && mcKindTeamOnly(kEl.value)) { sel.innerHTML = '<option value="">Team score — no scorer</option>'; sel.disabled = true; return; }
    sel.disabled = false;
    var tid = document.getElementById('mc-team').value;
    var sq = mcSquadFor(tid);
    sel.innerHTML = sq.map(function (p) { return '<option value="' + p.player_id + '">' + esc(p.name) + '</option>'; }).join('') + '<option value="__other">Other (type name)…</option>';
  }
  function mcFillSubPlayers() {
    var offSel = document.getElementById('sub-off'), onSel = document.getElementById('sub-on'); if (!offSel || !onSel) return;
    var tid = document.getElementById('sub-team').value;
    var sq = mcSquadFor(tid);
    var opts = sq.map(function (p) { return '<option value="' + esc(p.name) + '">' + esc(p.name) + '</option>'; }).join('') + '<option value="__other">Other (type name)…</option>';
    offSel.innerHTML = '<option value="">Player OFF…</option>' + opts;
    onSel.innerHTML = '<option value="">Player ON…</option>' + opts;
  }
  function _subVal(id) { var s = document.getElementById(id); if (!s) return ''; var v = s.value; if (v === '__other') { v = (prompt('Player name') || '').trim(); } return v; }
  async function addSub() {
    var team = document.getElementById('sub-team').value;
    var off = _subVal('sub-off'), on = _subVal('sub-on');
    if (!off && !on) { toast('Pick who is coming off and/or on', 'error'); return; }
    var minute = parseInt((document.getElementById('sub-min') || {}).value, 10); if (isNaN(minute)) minute = null;
    var r; try { r = await sb().rpc('lt_sub_add', { p_scope: 'league', p_match: S.matchOpen, p_entrant: team, p_off: off || null, p_on: on || null, p_minute: minute }); } catch (e) { r = { error: e }; }
    if (r && r.error) { toast('Could not record', 'error'); return; }
    var mn = document.getElementById('sub-min'); if (mn) mn.value = '';
    renderMatchCentre();
  }
  function renderMcSubs() {
    var host = document.getElementById('mc-subs'); if (!host) return;
    var m = S._mc || {}; var subs = m.subs || [];
    if (!subs.length) { host.innerHTML = '<div class="lg-empty">No substitutions yet.</div>'; return; }
    host.innerHTML = subs.map(function (s) {
      var sideName = s.side === 'home' ? m.home.name : m.away.name;
      return '<div class="lg-mcrow"><span class="mn">' + (s.minute != null ? s.minute + "'" : '') + '</span><span class="kd">▲ ' + esc(s.on || '—') + ' – ▼ ' + esc(s.off || '—') + '</span><span class="tn">' + esc(sideName) + '</span><span class="ms x" onclick="FFPLeague.removeSub(\'' + s.id + '\')">close</span></div>';
    }).join('');
  }
  async function removeSub(id) { try { await sb().rpc('lt_sub_remove', { p_id: id }); } catch (e) {} renderMatchCentre(); }
  function mcScoringKinds() { var m = S._mc || {}; var s = (S.sports || []).find(function (x) { return x.key === m.sport_key; }); return (s && s.scoring_kinds) || [{ key: 'point', label: 'Point', points: 1 }]; }
  function mcKindLabel(k) { var f = mcScoringKinds().find(function (x) { return x.key === k; }); return f ? f.label : (k || '').replace(/_/g, ' '); }
  function renderMcList() {
    var host = document.getElementById('mc-list'); if (!host) return;
    var m = S._mc || {}; var ev = m.events || [];
    if (!ev.length) { host.innerHTML = '<div class="lg-empty">No scores yet — add them above. The app timeline and player stats update from these.</div>'; return; }
    host.innerHTML = ev.map(function (e) {
      var sideName = e.side === 'home' ? m.home.name : m.away.name;
      return '<div class="lg-mcrow"><span class="mn">' + (e.minute != null ? e.minute + "'" : '') + '</span><span class="kd ' + esc(e.kind) + '">' + esc(mcKindLabel(e.kind)) + '</span><span class="pl">' + esc(e.player) + '</span><span class="tn">' + esc(sideName) + '</span><span class="rs">' + esc(e.rs) + '</span><span class="ms x" onclick="FFPLeague.removeEvent(\'' + e.id + '\')">close</span></div>';
    }).join('');
  }
  async function addEvent() {
    var team = document.getElementById('mc-team').value;
    var psel = document.getElementById('mc-player'); var pv = psel.value;
    var pid = (pv && pv !== '__other') ? pv : null;
    var pname = null;
    if (pv === '__other') { pname = prompt('Player name'); if (!pname) return; }
    else { pname = psel.options[psel.selectedIndex] ? psel.options[psel.selectedIndex].text : null; }
    var ksel = document.getElementById('mc-kind'); var kind = ksel.value;
    var pts = parseInt(ksel.options[ksel.selectedIndex] ? ksel.options[ksel.selectedIndex].getAttribute('data-pts') : '0', 10); if (isNaN(pts)) pts = 0;
    if (mcKindTeamOnly(kind)) { pid = null; pname = null; }   // penalty try / own goal — team score, no named scorer
    var minute = parseInt((document.getElementById('mc-min') || {}).value, 10); if (isNaN(minute)) minute = null;
    var r; try { r = await sb().rpc('lt_event_add', { p_scope: 'league', p_match: S.matchOpen, p_entrant: team, p_player: pid, p_player_name: pname, p_minute: minute, p_kind: kind, p_points: pts }); } catch (e) { r = { error: e }; }
    if (r.error) { toast('Could not add', 'error'); return; }
    var mn = document.getElementById('mc-min'); if (mn) mn.value = '';
    renderMatchCentre();
  }
  async function removeEvent(id) { await sb().rpc('lt_event_remove', { p_id: id }); renderMatchCentre(); }
  async function saveResultFromEvents() {
    var m = S._mc || {}; var ev = m.events || [];
    if (!ev.length) { toast('Add scoring events first', 'error'); return; }
    var last = ev[ev.length - 1]; var hs = last.hs, as = last.as;
    var r; try { r = await sb().rpc('league_result_save', { p_fixture: S.matchOpen, p_home: hs, p_away: as, p_sets: null, p_status: 'final' }); } catch (e) { r = { error: e }; }
    if (r.error) { toast('Save failed', 'error'); return; } toast('Result saved: ' + hs + '–' + as, 'success');
  }

  async function doGen() {
    var r; try { r = await sb().rpc('league_fixtures_generate', { p_division: S.divId }); } catch (e) { r = { error: e }; }
    if (r.error) { toast('Could not generate', 'error'); return; } toast((r.data || 0) + ' fixtures created', 'success'); renderTab();
  }
  async function saveResults() {
    var rows = Array.prototype.slice.call(document.querySelectorAll('.lg-fx2')); var n = 0;
    for (var i = 0; i < rows.length; i++) { var el = rows[i]; var h = el.querySelector('.lg-hs').value, a = el.querySelector('.lg-as').value; if (h === '' || a === '') continue; try { await sb().rpc('league_result_save', { p_fixture: el.getAttribute('data-id'), p_home: +h, p_away: +a, p_sets: null, p_status: 'final' }); n++; } catch (e) {} }
    if (!n) { toast('Nothing to save \u2014 enter both scores on a fixture first', 'error'); return; }
    toast(n === 1 ? '1 result saved' : n + ' results saved', 'success'); renderTab();
  }

  // ---------- TABLE ----------
  async function renderTable(host) {
    var divs = S.detail.divisions || [];
    if (!divs.length) { host.innerHTML = '<div class="lg-empty">Add a division first.</div>'; return; }
    if (!S.divId) S.divId = divs[0].id;
    host.innerHTML = '<div class="lg-tool"><select class="lg-sel" onchange="FFPLeague.setDiv(this.value,\'table\')">' + divOpts() + '</select></div><div id="lg-tbl"><div class="lg-empty">Loading…</div></div>';
    var r; try { r = await sb().rpc('league_table', { p_division: S.divId }); } catch (e) { r = { error: e }; }
    var rows = ((r && r.data) || {}).rows || []; var host2 = document.getElementById('lg-tbl');
    if (!rows.length) { host2.innerHTML = '<div class="lg-empty">No results yet — the table fills as games are played.</div>'; return; }
    host2.innerHTML = '<div class="lg-tb head"><span>#</span><span class="nm">Entrant</span><span>P</span><span>W</span><span>D</span><span>+/-</span><span>Pts</span></div>'
      + rows.map(function (r2, i) { return '<div class="lg-tb"><span>' + (i + 1) + '</span><span class="nm">' + esc(r2.name) + '</span><span>' + r2.p + '</span><span>' + r2.w + '</span><span>' + r2.d + '</span><span>' + (r2.gd > 0 ? '+' + r2.gd : r2.gd) + '</span><span class="pts">' + r2.pts + '</span></div>'; }).join('');
  }


  // ---------- RULES PDF ----------
  // The typed Rules box carries the short version. Organisers also hand out a
  // real rulebook, so ONE PDF rides with the league: the file goes to the
  // event-docs bucket (PDF only, 20 MB, public read, write scoped to the
  // uploader's own folder) and its URL lands on league_set_rules_pdf, which the
  // detail RPC already returns inside `event`. Same shape as the logo/banner
  // uploads: pick, store, save, reopen.
  function rulesPdfHtml(ev) {
    if (S.pdfBusy) {
      return '<div class="lg-pdf">' + ic('description')
        + '<div class="g"><b>Uploading\u2026</b><span>' + esc(S.pdfBusy) + '</span></div></div>';
    }
    if (ev && ev.rules_pdf_url) {
      return '<div class="lg-pdf has">' + ic('description')
        + '<div class="g"><b>' + esc(ev.rules_pdf_name || 'Rules.pdf') + '</b>'
        + '<span>Entrants can open this from the app</span></div>'
        + '<a class="lg-btn" href="' + esc(ev.rules_pdf_url) + '" target="_blank" rel="noopener">'
        + ic('open_in_new') + 'View</a>'
        + '<span class="ms x" title="Remove" onclick="FFPLeague.removeRulesPdf()">close</span></div>';
    }
    return '<div class="lg-pdf">' + ic('description')
      + '<div class="g"><b>No rules PDF</b><span>PDF up to 20 MB, sits with the rules in the app</span></div>'
      + '<button class="lg-btn" onclick="FFPLeague.pickRulesPdf()">' + ic('upload_file') + 'Attach PDF</button></div>';
  }
  // Repaint just the strip, so an upload in progress does not wipe whatever the
  // organiser has typed into the other fields on this tab.
  function paintRulesPdf() {
    var h = document.getElementById('lg-pdfwrap');
    if (h) h.innerHTML = rulesPdfHtml((S.detail && S.detail.event) || {});
  }
  function pickRulesPdf() {
    var inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'application/pdf,.pdf'; inp.style.display = 'none';
    inp.addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0];
      if (inp.parentNode) inp.parentNode.removeChild(inp);
      if (f) uploadRulesPdf(f);
    });
    document.body.appendChild(inp); inp.click();
  }
  // The shared image uploader cannot carry this: it hardcodes image/jpeg and a
  // .jpg path, and rejects anything that is not an image. So this is a direct
  // owner-scoped storage write, which is what a provider session can do.
  async function uploadRulesPdf(f) {
    if (!((f.type === 'application/pdf') || /\.pdf$/i.test(f.name || ''))) { toast('That file is not a PDF', 'error'); return; }
    if (f.size > 20 * 1024 * 1024) { toast('That PDF is over 20 MB', 'error'); return; }
    var uid = pdfOwnerId();
    if (!uid) { toast('Please sign in again', 'error'); return; }
    S.pdfBusy = f.name; paintRulesPdf();
    var path = uid + '/lgrules-' + S.eventId + '-' + Date.now() + '.pdf';
    try {
      var up = await sb().storage.from('event-docs').upload(path, f, { contentType: 'application/pdf', upsert: true, cacheControl: '3600' });
      if (up && up.error) throw up.error;
      var pub = sb().storage.from('event-docs').getPublicUrl(path);
      var url = pub && pub.data && pub.data.publicUrl;
      if (!url) throw new Error('no_public_url');
      var r = await sb().rpc('league_set_rules_pdf', { p_event: S.eventId, p_url: url, p_name: f.name });
      if (r && r.error) throw r.error;
    } catch (e) { S.pdfBusy = null; paintRulesPdf(); toast('Upload failed', 'error'); return; }
    S.pdfBusy = null; toast('Rules PDF attached', 'success'); open(S.eventId);
  }
  async function removeRulesPdf() {
    var r; try { r = await sb().rpc('league_set_rules_pdf', { p_event: S.eventId, p_url: null, p_name: null }); } catch (e) { r = { error: e }; }
    if (r && r.error) { toast('Could not remove', 'error'); return; }
    toast('Rules PDF removed', 'success'); open(S.eventId);
  }
  // The storage path must begin with auth.uid(), which is the JWT `sub`. A
  // provider's record id is not always that value, and a mismatch is a 400 on
  // upload, so read the claim itself.
  function pdfOwnerId() {
    try {
      var tok = window.FFPAuth && window.FFPAuth.getToken && window.FFPAuth.getToken();
      if (tok) {
        var parts = String(tok).split('.');
        if (parts.length === 3) {
          var b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
          while (b64.length % 4) b64 += '=';
          var pl = JSON.parse(atob(b64));
          if (pl && pl.sub) return String(pl.sub);
        }
      }
    } catch (e) {}
    try { var m = window.FFPAuth && window.FFPAuth.getMember && window.FFPAuth.getMember(); return (m && m.id) || null; } catch (e2) { return null; }
  }
  function pickImg(kind) {
    if (!window.FFPUpload) { toast('Uploader not ready — refresh', 'error'); return; }
    var isLogo = kind === 'logo';
    window.FFPUpload.pick({ bucket: isLogo ? 'provider-logos' : 'listing-covers', key: (isLogo ? 'lglogo-' : 'lgcover-') + S.eventId + '-' + Date.now(),
      aspect: isLogo ? 1 : 16 / 9, outW: isLogo ? 512 : 1600, outH: isLogo ? 512 : 900, title: isLogo ? 'League logo (square)' : 'Banner (16:9)',
      onDone: function (url) { var p = {}; p[isLogo ? 'logo_url' : 'cover_url'] = url; sb().rpc('league_event_save', { p_id: S.eventId, p: p }).then(function () { toast('Saved', 'success'); open(S.eventId); }); },
      onError: function (e) { toast('Upload failed', 'error'); } });
  }
  function entLogo(id) {
    if (!window.FFPUpload) { toast('Uploader not ready — refresh', 'error'); return; }
    window.FFPUpload.pick({ bucket: 'provider-logos', key: 'lgteam-' + id + '-' + Date.now(), aspect: 1, outW: 400, outH: 400, title: 'Team logo (square)',
      onDone: function (url) { sb().rpc('league_entrant_set_logo', { p_id: id, p_logo: url }).then(function () { toast('Logo saved', 'success'); renderTab(); }); },
      onError: function () { toast('Upload failed', 'error'); } });
  }
  async function refreshDetail() { var r; try { r = await sb().rpc('league_detail', { p_league: S.eventId }); } catch (e) { r = { error: e }; } S.detail = (r && r.data) || S.detail; renderTab(); }
  function divOpts() { return (S.detail.divisions || []).map(function (d) { return '<option value="' + d.id + '"' + (d.id === S.divId ? ' selected' : '') + '>' + esc(d.name) + '</option>'; }).join(''); }

  window.FFPLeague = {
    mgOpen: mgOpen, mgSearch: mgSearch, mgPick: mgPick, mgTeam: mgTeam, mgAssign: mgAssign, mgRemove: mgRemove,
    rulesHint: rulesHint,
    open: open, startCreate: startCreate, cancelCreate: cancelCreate, doCreate: doCreate,
    back: function () { S.view = 'list'; renderList(); }, tab: function (t) { S.tab = t; S.matchOpen = null; renderEditor(); },
    setDiv: function (val, tab) { S.divId = val; S.tab = tab; S.entEdit = null; S.entDel = null; S.sqOpen = null; renderTab(); },
    seg: function (btn, id) { document.querySelectorAll('#' + id + ' button').forEach(function (b) { b.classList.remove('on'); }); btn.classList.add('on'); },
    statusPick: statusPick, mlenEdit: mlenEdit, eventState: eventState, eventDelete: eventDelete, toggleArchived: toggleArchived,
    saveDetails: saveDetails, sportHint: sportHint,
    saveSport: saveSport,
    sheetSizeTotal: sheetSizeTotal, sheetSizeSave: sheetSizeSave, sheetSizeDefault: sheetSizeDefault,
    bpAdd: bpAdd, bpDel: bpDel, bpType: bpType, saveDivFormat: saveDivFormat, clearDivFormat: clearDivFormat,
    splitOn: splitOn, splitAdd: splitAdd, splitDrop: splitDrop, carryHint: carryHint, splitRedraw: splitRedraw,
    setSetupDiv: function (id) { S.divId = id; renderTab(); },
    finalsHint: function () {
      var v2 = (document.getElementById('lgf-finals') || {}).value;
      var m = FINALS_MODES.find(function (x) { return x[0] === v2; }) || FINALS_MODES[0];
      var h = document.getElementById('lgf-finalshint'); if (h) h.textContent = m[2];
      var t = document.getElementById('lgf-third');
      if (t) t.parentNode.style.display = (v2 === 'none' ? 'none' : '');
    }, pickImg: pickImg, pickRulesPdf: pickRulesPdf, removeRulesPdf: removeRulesPdf, entLogo: entLogo, editDivision: editDivision, cancelDivision: cancelDivision, saveDivision: saveDivision,
    askRemoveDivision: askRemoveDivision, cancelRemoveDivision: cancelRemoveDivision, removeDivision: removeDivision,
    potmVoteSave: potmVoteSave,
    addEntrant: addEntrant, bulkAthletes: bulkAthletes, cancelEntrant: cancelEntrant, saveEntrant: saveEntrant,
    editEntrant: editEntrant, cancelEntrantEdit: cancelEntrantEdit, saveEntrantEdit: saveEntrantEdit,
    askRemoveEntrant: askRemoveEntrant, cancelRemoveEntrant: cancelRemoveEntrant, removeEntrant: removeEntrant,
    sqToggle: sqToggle, sqSearch: sqSearch, sqKey: sqKey, sqAddMember: sqAddMember, sqNameOnly: sqNameOnly, sqInvite: sqInvite, sqRemove: sqRemove,
    sqPhoto: sqPhoto, sqPhotoClear: sqPhotoClear,
    tsPut: tsPut, tsCovers: tsCovers, tsCap: tsCap, tsTeam: tsTeam, tsSaveCoach: tsSaveCoach, hexSync: hexSync,
    gfxOpen: gfxOpen, gfxCopy: gfxCopy, gfxLink: gfxLink,
    doGen: doGen, saveResults: saveResults,
    ofSearch: ofSearch, ofPick: ofPick, removeOfficial: removeOfficial, ofPhoto: ofPhoto,
    openAdd: openAdd, addPoolOfficial: addPoolOfficial,
    setAccess: setAccess, accDay: accDay, accMatch: accMatch, accSave: accSave, accCancel: accCancel, autoplan: autoplan, schedSet: schedSet, schedToggle: schedToggle,
    mdDay: mdDay, mdPick: mdPick, mdRefresh: mdRefresh, mdGo: mdGo, setSchedDiv: setSchedDiv, setSchedRound: setSchedRound, planSet: planSet, rebuildAsk: rebuildAsk, rebuildCancel: rebuildCancel,
    rbGo: rbGo, rbSetDiv: rbSetDiv, rbByePick: rbByePick, rbByesSave: rbByesSave, rbRedraw: rbRedraw,
    togRound: togRound, addMatch: addMatch, setAddDiv: setAddDiv, cancelMatch: cancelMatch, saveMatch: saveMatch, toggleBye: toggleBye, togglePre: togglePre,
    editFx: editFx, fxStageChange: fxStageChange, cancelEditFx: cancelEditFx, saveFx: saveFx, delAsk: delAsk, delCancel: delCancel, delFx: delFx,
    addVenue: addVenue, editVenue: editVenue, cancelVenue: cancelVenue, saveVenue: saveVenue, removeVenue: removeVenue,
    addSurface: addSurface, cancelSurface: cancelSurface, saveSurface: saveSurface, removeSurface: removeSurface, screenPanel: screenPanel, useMyCourts: useMyCourts, linkCourt: linkCourt, copyScreen: copyScreen,
    offAdd: offAdd, offRemove: offRemove, offSet: offSet,
    openMatch: openMatch, closeMatch: closeMatch, addEvent: addEvent, removeEvent: removeEvent, saveResultFromEvents: saveResultFromEvents, addSub: addSub, removeSub: removeSub,
    mcTab: mcTab, mcPickStatPlayer: mcPickStatPlayer, saveStats: saveStats, setLive: setLive, saveTeamStats: saveTeamStats, saveStream: saveStream,
    trkToggle: trkToggle, trkReset: trkReset, trkPoss: trkPoss, trkHalf: trkHalf, trkApply: trkApply, mcSetPeriod: mcSetPeriod, _mcSetTime: _mcSetTime,
    addCustomStat: addCustomStat, removeCustomStat: removeCustomStat,
    pbpAward: pbpAward, pbpUndo: pbpUndo, pbpServer: pbpServer, pbpDecide: pbpDecide, pbpFinish: pbpFinish
  };
  window.ffpRenderLeagues = function () { S.view = 'list'; S.creating = false; renderList(); };
})();
