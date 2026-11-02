 /* =========================================================================
   teacher-core.js  —  loads FIRST on the teacher page.
   Provides: session check, Supabase connection, teacher lookup, the app
   shell (top bar + sidebar), the section registry, shared UI helpers, a
   single data layer (Teacher.db), and the Overview page.

   Section files (teacher-timetable.js, teacher-attendance.js, ...) load
   AFTER this file and call Teacher.register({ id, title, icon, order, render }).

   SECURITY NOTE: every read goes through Teacher.db / the helpers below, so
   when we move to the Render backend only this file changes. We never select
   the `password` column from any table.
   ========================================================================= */
(function () {
  'use strict';

  var SUPABASE_URL = 'https://tnrxsrjzdshjuhvebkck.supabase.co';
  // Public "anon" key (safe in the page by design). NEVER put the service_role key here.
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRucnhzcmp6ZHNoanVodmVia2NrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyMjA1NTcsImV4cCI6MjA5Mjc5NjU1N30.4b6CAXXs21aIJKm1qi9bOuIE5zDfJiEQze9hoxSJ7ig';

  /* ---------- small helpers ---------- */
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function pad(n) { return String(n).padStart(2, '0'); }
  function today() { var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  function dayName(dateStr) { return DAYS[new Date((dateStr || today()) + 'T00:00:00').getDay()]; }
  function norm(s) { return String(s == null ? '' : s).trim().toLowerCase(); }

  /* "08:00", "8:00", "8.30", "8am", "2:15 pm"  ->  minutes since midnight (NaN if unreadable) */
  function minutes(t) {
    var m = String(t == null ? '' : t).trim().toLowerCase().match(/^(\d{1,2})(?:[:.h](\d{2}))?\s*(am|pm)?$/);
    if (!m) return NaN;
    var h = +m[1], mi = +(m[2] || 0);
    if (m[3] === 'pm' && h < 12) h += 12;
    if (m[3] === 'am' && h === 12) h = 0;
    if (h > 23 || mi > 59) return NaN;
    return h * 60 + mi;
  }
  function fmtTime(t) {
    var m = minutes(t);
    return isNaN(m) ? String(t || '—') : pad(Math.floor(m / 60)) + ':' + pad(m % 60);
  }

  function readUser() {
    try { return JSON.parse(localStorage.getItem('currentUser')); } catch (e) { return null; }
  }

  /* The main dashboard saves timetable teachers as free text (a name) with no
     teacher_id, so "is this entry mine?" is answered by comparing names. */
  function isMine(nameText) {
    var me = T.teacher;
    if (!me || !nameText) return false;
    var n = norm(nameText);
    return n === norm(me.name) || (!!me.username && n === norm(me.username));
  }

  /* ---------- icons (inline SVG, no extra files) ---------- */
  var ICONS = {
    home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    check: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
    book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/>',
    menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
    chevron: '<path d="M15 18l-6-6 6-6"/>',
    refresh: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
    print: '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
    door: '<path d="M4 21V3h12v18"/><path d="M2 21h20"/><circle cx="13" cy="12" r=".8"/>'
  };
  function icon(name, size) {
    size = size || 20;
    if (!ICONS[name]) return '<span class="tc-ic-txt">' + esc(name || '•') + '</span>';
    return '<svg class="tc-ic" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICONS[name] + '</svg>';
  }

  /* ---------- toast + confirm (replace alert / confirm) ---------- */
  function toast(msg, type) {
    var wrap = document.getElementById('tcToasts');
    if (!wrap) return;
    var el = document.createElement('div');
    el.className = 'tc-toast ' + (type || 'info');
    el.textContent = msg;
    wrap.appendChild(el);
    setTimeout(function () { el.classList.add('out'); setTimeout(function () { el.remove(); }, 300); }, type === 'error' ? 6000 : 3500);
  }

  function confirmBox(message, okLabel) {
    return new Promise(function (resolve) {
      var back = document.createElement('div');
      back.className = 'tc-modal-back';
      back.innerHTML = '<div class="tc-modal" role="dialog" aria-modal="true"><p></p><div class="tc-modal-actions">' +
        '<button class="tc-btn ghost" data-r="0">Cancel</button><button class="tc-btn primary" data-r="1"></button></div></div>';
      back.querySelector('p').textContent = message;
      back.querySelector('[data-r="1"]').textContent = okLabel || 'Confirm';
      back.addEventListener('click', function (e) {
        var b = e.target.closest('[data-r]');
        if (!b && e.target !== back) return;
        back.remove();
        resolve(b ? b.dataset.r === '1' : false);
      });
      document.body.appendChild(back);
      var ok = back.querySelector('[data-r="1"]'); if (ok) ok.focus();
    });
  }

  /* ---------- reusable UI pieces for every section ---------- */
  var ui = {
    pageHeader: function (title, sub, actionsHtml) {
      return '<div class="tc-ph"><div><h2>' + esc(title) + '</h2>' + (sub ? '<p>' + esc(sub) + '</p>' : '') + '</div>' +
        (actionsHtml ? '<div class="tc-ph-actions no-print">' + actionsHtml + '</div>' : '') + '</div>';
    },
    stat: function (label, value, iconName, tone) {
      return '<div class="tc-stat ' + (tone || '') + '"><span class="tc-stat-ic">' + icon(iconName, 20) + '</span>' +
        '<div><div class="tc-stat-v">' + esc(value) + '</div><div class="tc-stat-l">' + esc(label) + '</div></div></div>';
    },
    empty: function (title, text) {
      return '<div class="tc-empty"><div class="tc-empty-ic">' + icon('calendar', 26) + '</div><strong>' + esc(title) + '</strong>' +
        (text ? '<p>' + esc(text) + '</p>' : '') + '</div>';
    },
    skeleton: function () {
      return '<div class="tc-skel tc-skel-h"></div><div class="tc-skel-row"><div class="tc-skel"></div><div class="tc-skel"></div><div class="tc-skel"></div></div><div class="tc-skel tc-skel-b"></div>';
    }
  };

  /* ---------- styles (all new styling lives here; teacher.css stays referenced) ---------- */
  function injectStyles() {
    var css = [
      ':root{--tc-navy:#0f2557;--tc-navy2:#1b3b82;--tc-orange:#ea580c;--tc-orange-soft:#fff3ea;--tc-bg:#f4f6fb;--tc-card:#fff;--tc-line:#e3e8f2;--tc-text:#1c2438;--tc-muted:#667089;--tc-green:#15803d;--tc-green-soft:#e7f6ec;--tc-red:#dc2626;--tc-r:14px;--tc-shadow:0 1px 2px rgba(15,37,87,.05),0 6px 20px rgba(15,37,87,.06)}',
      '.tc-app{min-height:100vh;background:var(--tc-bg);color:var(--tc-text);font-family:"Plus Jakarta Sans",system-ui,-apple-system,"Segoe UI",sans-serif;font-size:15px;line-height:1.5}',
      '.tc-app *{box-sizing:border-box}',
      '.tc-app button{font-family:inherit}',
      '.tc-app :focus-visible{outline:3px solid rgba(234,88,12,.45);outline-offset:2px}',
      '.tc-ic{flex:none;display:block}.tc-ic-txt{font-size:1.1rem;line-height:1}',
      /* top bar */
      '.tc-top{position:sticky;top:0;z-index:120;height:64px;background:#fff;border-bottom:1px solid var(--tc-line);display:flex;align-items:center;justify-content:space-between;padding:0 22px}',
      '.tc-top-l,.tc-top-r{display:flex;align-items:center;gap:12px;min-width:0}',
      '.tc-burger{display:none;width:40px;height:40px;border:1px solid var(--tc-line);background:#fff;border-radius:10px;color:var(--tc-navy);cursor:pointer;align-items:center;justify-content:center}',
      '.tc-logo{width:38px;height:38px;object-fit:contain;border-radius:8px}',
      '.tc-brand{font-weight:800;font-size:1.15rem;color:var(--tc-navy);letter-spacing:-.02em;white-space:nowrap}.tc-brand em{font-style:normal;color:var(--tc-orange)}',
      '.tc-role{font-size:.72rem;font-weight:700;color:var(--tc-navy2);background:#eaf0ff;border-radius:999px;padding:3px 11px}',
      '.tc-who{text-align:right;line-height:1.25;min-width:0}.tc-who b{display:block;font-size:.9rem;color:var(--tc-navy);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:220px}.tc-who span{font-size:.78rem;color:var(--tc-muted)}',
      '.tc-avatar{width:38px;height:38px;border-radius:50%;background:var(--tc-navy);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;flex:none}',
      /* layout + sidebar */
      '.tc-layout{display:flex;align-items:flex-start}',
      '.tc-side{position:sticky;top:64px;height:calc(100vh - 64px);width:248px;flex:none;background:#fff;border-right:1px solid var(--tc-line);display:flex;flex-direction:column;padding:16px 12px;transition:width .18s ease;overflow:hidden}',
      '.tc-nav{display:flex;flex-direction:column;gap:4px;flex:1;overflow-y:auto}',
      '.tc-nav-item{display:flex;align-items:center;gap:13px;width:100%;border:0;background:none;text-align:left;padding:11px 13px;border-radius:11px;color:var(--tc-muted);font-weight:600;font-size:.93rem;cursor:pointer;position:relative;white-space:nowrap}',
      '.tc-nav-item:hover{background:#f3f5fb;color:var(--tc-navy)}',
      '.tc-nav-item.active{background:var(--tc-orange-soft);color:var(--tc-orange)}',
      '.tc-nav-item.active::before{content:"";position:absolute;left:-12px;top:9px;bottom:9px;width:4px;border-radius:0 4px 4px 0;background:var(--tc-orange)}',
      '.tc-side-foot{border-top:1px solid var(--tc-line);padding-top:12px;display:flex;flex-direction:column;gap:4px}',
      '.tc-collapse svg{transition:transform .18s}',
      '.tc-collapsed .tc-side{width:72px}.tc-collapsed .tc-nav-text{display:none}.tc-collapsed .tc-collapse svg{transform:rotate(180deg)}',
      '.tc-overlay{display:none}',
      /* main */
      '.tc-main{flex:1;min-width:0;padding:30px 34px 60px;max-width:1240px}',
      '.tc-ph{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:22px}',
      '.tc-ph h2{margin:0;font-size:1.65rem;line-height:1.2;letter-spacing:-.02em;color:var(--tc-navy)}',
      '.tc-ph p{margin:4px 0 0;color:var(--tc-muted)}',
      '.tc-ph-actions{display:flex;gap:8px;flex-wrap:wrap}',
      /* buttons */
      '.tc-btn{display:inline-flex;align-items:center;gap:8px;border:1px solid var(--tc-line);background:#fff;color:var(--tc-navy);font-weight:700;font-size:.85rem;padding:9px 15px;border-radius:10px;cursor:pointer}',
      '.tc-btn:hover{background:#f3f5fb}.tc-btn.primary{background:var(--tc-orange);border-color:var(--tc-orange);color:#fff}.tc-btn.primary:hover{background:#d44d0a}',
      '.tc-btn.ghost{background:transparent}',
      /* cards, stats */
      '.tc-card{background:var(--tc-card);border:1px solid var(--tc-line);border-radius:var(--tc-r);box-shadow:var(--tc-shadow);margin-bottom:22px;overflow:hidden}',
      '.tc-card-h{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:16px 20px;border-bottom:1px solid var(--tc-line)}',
      '.tc-card-h h3{margin:0;font-size:1.02rem;color:var(--tc-navy)}.tc-card-h span{font-size:.82rem;color:var(--tc-muted)}',
      '.tc-card-b{padding:6px 20px 12px}',
      '.tc-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:14px;margin-bottom:22px}',
      '.tc-stat{display:flex;align-items:center;gap:14px;background:#fff;border:1px solid var(--tc-line);border-radius:var(--tc-r);padding:16px 18px}',
      '.tc-stat-ic{width:42px;height:42px;border-radius:12px;background:#eaf0ff;color:var(--tc-navy2);display:flex;align-items:center;justify-content:center;flex:none}',
      '.tc-stat.orange .tc-stat-ic{background:var(--tc-orange-soft);color:var(--tc-orange)}.tc-stat.green .tc-stat-ic{background:var(--tc-green-soft);color:var(--tc-green)}',
      '.tc-stat-v{font-size:1.5rem;font-weight:800;color:var(--tc-navy);line-height:1.1}.tc-stat-l{font-size:.8rem;color:var(--tc-muted);margin-top:3px}',
      /* hero */
      '.tc-hero{display:grid;grid-template-columns:1.1fr 1fr;gap:26px;align-items:stretch;background:linear-gradient(120deg,var(--tc-navy) 0%,var(--tc-navy2) 100%);color:#fff;border-radius:18px;padding:28px 30px;margin-bottom:22px}',
      '.tc-hero h2{margin:0 0 6px;font-size:1.75rem;line-height:1.2;letter-spacing:-.02em}',
      '.tc-hero p{margin:0;color:rgba(255,255,255,.78)}',
      '.tc-hero-next{background:rgba(255,255,255,.11);border:1px solid rgba(255,255,255,.2);border-radius:14px;padding:16px 18px;display:flex;flex-direction:column;justify-content:center;gap:4px}',
      '.tc-hero-next small{font-size:.8rem;color:rgba(255,255,255,.75);font-weight:600}',
      '.tc-hero-next strong{font-size:1.35rem;line-height:1.25}',
      '.tc-hero-next span{color:rgba(255,255,255,.85);font-size:.92rem}',
      '.tc-hero-live{display:inline-flex;align-items:center;gap:7px;font-size:.8rem;font-weight:700;color:#bbf7d0}.tc-hero-live::before{content:"";width:8px;height:8px;border-radius:50%;background:#4ade80;box-shadow:0 0 0 4px rgba(74,222,128,.25)}',
      /* lessons */
      '.tc-lesson{display:grid;grid-template-columns:96px 1fr auto;gap:14px;align-items:center;padding:13px 0;border-bottom:1px solid var(--tc-line)}',
      '.tc-lesson:last-child{border-bottom:0}',
      '.tc-lesson-t{font-weight:700;color:var(--tc-navy);font-variant-numeric:tabular-nums}.tc-lesson-t small{display:block;color:var(--tc-muted);font-weight:500}',
      '.tc-lesson-s{font-weight:700;color:var(--tc-text)}.tc-lesson-s small{display:block;color:var(--tc-muted);font-weight:500;font-size:.82rem}',
      '.tc-lesson.is-now{background:linear-gradient(90deg,var(--tc-green-soft),transparent);margin:0 -20px;padding-left:20px;padding-right:20px}',
      '.tc-lesson.is-done{opacity:.55}',
      '.tc-badge{font-size:.74rem;font-weight:700;padding:3px 10px;border-radius:999px;background:#eef1f8;color:var(--tc-muted);white-space:nowrap}',
      '.tc-badge.now{background:var(--tc-green-soft);color:var(--tc-green)}.tc-badge.next{background:var(--tc-orange-soft);color:var(--tc-orange)}',
      /* class tiles */
      '.tc-classes{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:14px;padding:16px 0 8px}',
      '.tc-class{border:1px solid var(--tc-line);border-radius:12px;padding:15px 16px;background:#fbfcff}',
      '.tc-class b{display:block;font-size:1.05rem;color:var(--tc-navy)}.tc-class span{display:block;color:var(--tc-muted);font-size:.84rem;margin-top:2px}',
      /* empty + skeleton */
      '.tc-empty{text-align:center;padding:34px 20px;color:var(--tc-muted)}.tc-empty strong{display:block;color:var(--tc-navy);margin:10px 0 4px;font-size:1rem}.tc-empty p{margin:0 auto;max-width:420px}',
      '.tc-empty-ic{width:54px;height:54px;border-radius:50%;background:#eaf0ff;color:var(--tc-navy2);display:inline-flex;align-items:center;justify-content:center}',
      '.tc-skel{background:linear-gradient(90deg,#e9edf6 25%,#f4f6fb 50%,#e9edf6 75%);background-size:200% 100%;animation:tcShimmer 1.3s infinite;border-radius:12px;height:96px}',
      '.tc-skel-h{height:34px;width:42%;margin-bottom:20px}.tc-skel-b{height:220px;margin-top:14px}.tc-skel-row{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}',
      '@keyframes tcShimmer{to{background-position:-200% 0}}',
      '.tc-note{font-size:.8rem;color:var(--tc-muted);margin-top:6px}',
      '.tc-loading{padding:4rem 1rem;text-align:center;color:var(--tc-muted)}',
      '.tc-center{max-width:560px;margin:12vh auto;padding:0 20px}',
      /* toasts + modal */
      '#tcToasts{position:fixed;top:76px;right:20px;z-index:9999;display:flex;flex-direction:column;gap:8px;max-width:340px}',
      '.tc-toast{padding:12px 18px;border-radius:10px;font-size:.86rem;font-weight:700;color:#fff;box-shadow:var(--tc-shadow);animation:tcIn .25s ease;transition:opacity .3s}',
      '.tc-toast.success{background:#16a34a}.tc-toast.error{background:#dc2626}.tc-toast.info{background:var(--tc-navy);border-left:4px solid var(--tc-orange)}.tc-toast.out{opacity:0}',
      '@keyframes tcIn{from{opacity:0;transform:translateX(30px)}to{opacity:1;transform:none}}',
      '.tc-modal-back{position:fixed;inset:0;background:rgba(15,37,87,.45);display:flex;align-items:center;justify-content:center;z-index:9998;padding:16px;font-family:"Plus Jakarta Sans",system-ui,sans-serif}',
      '.tc-modal{background:#fff;border-radius:14px;padding:1.5rem;max-width:380px;width:100%;box-shadow:var(--tc-shadow)}',
      '.tc-modal p{font-size:.95rem;line-height:1.5;margin:0 0 1.25rem}',
      '.tc-modal-actions{display:flex;gap:.6rem;justify-content:flex-end}',
      /* mobile */
      '@media (max-width:860px){',
      ' .tc-burger{display:inline-flex}.tc-role,.tc-who{display:none}.tc-top{padding:0 14px}',
      ' .tc-side{position:fixed;left:0;top:64px;bottom:0;height:auto;z-index:140;width:262px!important;transform:translateX(-105%);transition:transform .2s;box-shadow:var(--tc-shadow)}',
      ' .tc-open .tc-side{transform:none}',
      ' .tc-open .tc-overlay{display:block;position:fixed;inset:64px 0 0 0;background:rgba(15,37,87,.35);z-index:130}',
      ' .tc-collapsed .tc-nav-text{display:inline}.tc-collapse{display:none}',
      ' .tc-main{padding:20px 16px 50px}',
      ' .tc-hero{grid-template-columns:1fr;padding:22px 20px}',
      ' .tc-lesson{grid-template-columns:78px 1fr}.tc-lesson .tc-badge{grid-column:2;justify-self:start}',
      ' .tc-skel-row{grid-template-columns:1fr}',
      '}',
      '@media (prefers-reduced-motion:reduce){.tc-skel{animation:none}.tc-toast{animation:none}}',
      '@media print{.tc-top,.tc-side,.tc-overlay,#tcToasts,.no-print{display:none!important}.tc-main{padding:0}.tc-card{box-shadow:none}.tc-app{background:#fff}}'
    ].join('\n');
    var s = document.createElement('style');
    s.id = 'tcStyles';
    s.textContent = css;
    document.head.appendChild(s);
  }

  /* ---------- app shell ---------- */
  function buildShell(root) {
    var collapsed = false;
    try { collapsed = localStorage.getItem('tcCollapsed') === '1'; } catch (e) {}
    var name = T.teacher.name || T.user.name || 'Teacher';
    root.innerHTML =
      '<div class="tc-app' + (collapsed ? ' tc-collapsed' : '') + '" id="tcApp">' +
        '<header class="tc-top">' +
          '<div class="tc-top-l">' +
            '<button class="tc-burger" id="tcMenu" aria-label="Open menu">' + icon('menu') + '</button>' +
            '<img class="tc-logo" src="shallom-logo.jpeg" alt="" onerror="this.style.display=\'none\'">' +
            '<span class="tc-brand">Step by Step <em>Academy</em></span>' +
            '<span class="tc-role">Teacher</span>' +
          '</div>' +
          '<div class="tc-top-r">' +
            '<div class="tc-who"><b id="tcName"></b><span id="tcClassInfo"></span></div>' +
            '<div class="tc-avatar" id="tcAvatar" aria-hidden="true"></div>' +
          '</div>' +
        '</header>' +
        '<div class="tc-layout">' +
          '<aside class="tc-side" id="tcSidebar" aria-label="Main menu">' +
            '<nav class="tc-nav" id="tcNav"></nav>' +
            '<div class="tc-side-foot">' +
              '<button class="tc-nav-item tc-collapse" id="tcCollapse" aria-label="Collapse menu">' + icon('chevron') + '<span class="tc-nav-text">Collapse</span></button>' +
              '<button class="tc-nav-item" id="tcLogout">' + icon('logout') + '<span class="tc-nav-text">Log out</span></button>' +
            '</div>' +
          '</aside>' +
          '<div class="tc-overlay" id="tcOverlay"></div>' +
          '<main class="tc-main" id="tcMain"></main>' +
        '</div>' +
        '<div id="tcToasts" aria-live="polite"></div>' +
      '</div>';

    document.getElementById('tcName').textContent = name;
    document.getElementById('tcAvatar').textContent = (name.replace(/^(mr|mrs|ms|miss|dr|prof|sir|madam)\.?\s+/i, '').trim().charAt(0) || 'T').toUpperCase();

    var app = document.getElementById('tcApp');
    document.getElementById('tcLogout').addEventListener('click', T.logout);
    document.getElementById('tcMenu').addEventListener('click', function () { app.classList.toggle('tc-open'); });
    document.getElementById('tcOverlay').addEventListener('click', function () { app.classList.remove('tc-open'); });
    document.getElementById('tcCollapse').addEventListener('click', function () {
      app.classList.toggle('tc-collapsed');
      try { localStorage.setItem('tcCollapsed', app.classList.contains('tc-collapsed') ? '1' : '0'); } catch (e) {}
    });
  }

  /* ---------- section registry + routing ---------- */
  var sections = [];
  var booted = false;
  var current = null;

  function register(sec) {
    if (!sec || !sec.id || typeof sec.render !== 'function') { console.warn('Teacher.register: need {id, title, render}'); return; }
    sec.order = sec.order == null ? 50 : sec.order;
    var i = sections.findIndex(function (x) { return x.id === sec.id; });
    if (i >= 0) sections[i] = sec; else sections.push(sec);
    if (booted) buildNav();
  }

  function buildNav() {
    sections.sort(function (a, b) { return a.order - b.order; });
    var nav = document.getElementById('tcNav');
    if (!nav) return;
    nav.innerHTML = '';
    sections.forEach(function (s) {
      var b = document.createElement('button');
      b.className = 'tc-nav-item' + (s.id === current ? ' active' : '');
      b.dataset.id = s.id;
      b.title = s.title || s.id;
      b.innerHTML = icon(s.icon || 'book') + '<span class="tc-nav-text"></span>';
      b.querySelector('.tc-nav-text').textContent = s.title || s.id;
      b.addEventListener('click', function () { go(s.id); });
      nav.appendChild(b);
    });
  }

  async function go(id) {
    var sec = sections.find(function (s) { return s.id === id; }) || sections[0];
    if (!sec) return;
    current = sec.id;
    if (location.hash !== '#' + sec.id) history.replaceState(null, '', '#' + sec.id);
    document.querySelectorAll('#tcNav .tc-nav-item').forEach(function (n) { n.classList.toggle('active', n.dataset.id === sec.id); });
    document.getElementById('tcApp').classList.remove('tc-open');
    var main = document.getElementById('tcMain');
    main.innerHTML = ui.skeleton();
    var holder = document.createElement('div');
    holder.id = 'page-' + sec.id;
    try {
      await sec.render(holder, T);
      if (current !== sec.id) return;           // user already moved to another section
      main.innerHTML = '';
      main.appendChild(holder);
      window.scrollTo(0, 0);
    } catch (e) {
      console.error('Section "' + sec.id + '" failed:', e);
      main.innerHTML = '<div class="tc-card"><div class="tc-card-b" style="padding:20px"><strong>This page could not load.</strong>' +
        '<p class="tc-note" style="font-size:.9rem">' + esc(e && e.message ? e.message : e) + '</p>' +
        '<button class="tc-btn" id="tcRetry">' + icon('refresh', 16) + 'Try again</button></div></div>';
      var r = document.getElementById('tcRetry'); if (r) r.addEventListener('click', function () { go(sec.id); });
    }
  }

  /* ---------- data layer: ALL reads go through here ---------- */
  var cache = {};
  function cached(key, fn, ttl) {
    var c = cache[key], now = Date.now();
    if (c && now - c.t < (ttl || 60000)) return c.p;
    var p = fn();
    cache[key] = { t: now, p: p };
    p.catch(function () { delete cache[key]; });
    return p;
  }

  async function dbSelect(table, columns, opts) {
    opts = opts || {};
    var q = T.sb.from(table).select(columns);
    if (opts.eq) Object.keys(opts.eq).forEach(function (k) { q = q.eq(k, opts.eq[k]); });
    if (opts.in) q = q.in(opts.in[0], opts.in[1]);
    var res = await q;
    if (res.error) throw new Error('Could not read "' + table + '": ' + res.error.message);
    return res.data || [];
  }

  function dayIndex(d) { var i = DAYS.map(norm).indexOf(norm(d)); return i === 0 ? 7 : i; }  // Mon=1 … Sun=7

  /* The teacher's own timetable rows (timetables store the teacher as a name). */
  function mySchedule() {
    return cached('schedule', async function () {
      var rows = await dbSelect('timetables', 'id,class,day,start_time,end_time,teacher,subject');
      return rows.filter(function (r) { return isMine(r.teacher); }).map(function (r) {
        return {
          id: r.id, class: r.class || '', day: r.day || '', dayKey: norm(r.day),
          start: fmtTime(r.start_time), end: fmtTime(r.end_time),
          startMin: minutes(r.start_time), endMin: minutes(r.end_time), subject: r.subject || ''
        };
      }).sort(function (a, b) {
        var d = dayIndex(a.day) - dayIndex(b.day);
        if (d) return d;
        return (isNaN(a.startMin) ? 9999 : a.startMin) - (isNaN(b.startMin) ? 9999 : b.startMin);
      });
    });
  }

  /* Students in the teacher's classes. Never selects the password column. */
  function myStudents() {
    return cached('students', async function () {
      var names = T.classes.map(function (c) { return c.name; });
      if (!names.length) return [];
      var rows = await dbSelect('students', 'id,name,class,gender,status', { in: ['class', names] });
      return rows.filter(function (s) { return (s.status || 'Active') === 'Active'; });
    });
  }

  /* Today's attendance rows for the teacher's classes (read only here). */
  function todayAttendance() {
    return cached('attendanceToday', async function () {
      var names = T.classes.map(function (c) { return c.name; });
      if (!names.length) return [];
      return dbSelect('attendance', 'student_id,class,date,status', { eq: { date: today() }, in: ['class', names] });
    }, 20000);
  }

  /* ---------- who is this teacher, and which classes are theirs ----------
     The login stores {id, name, username, role}. The id is the LOGIN id (e.g. U001),
     which differs from the teachers-table id (e.g. T001), so we match on username
     first (stable), then on name. */
  async function loadTeacher(user) {
    var list = await dbSelect('teachers', 'id,name,username,department,status');
    var hit;
    hit = list.find(function (t) { return user.id != null && String(t.id) === String(user.id); });
    if (hit) return { row: hit, by: 'teacher ID' };
    if (user.username) {
      hit = list.find(function (t) { return norm(t.username) === norm(user.username); }) ||
            list.find(function (t) { return norm(t.name) === norm(user.username); });
      if (hit) return { row: hit, by: 'username' };
    }
    if (user.name) {
      hit = list.find(function (t) { return norm(t.name) === norm(user.name); }) ||
            list.find(function (t) { return norm(t.username) === norm(user.name); });
      if (hit) return { row: hit, by: 'name' };
    }
    return null;
  }

  async function reloadClasses() {
    var rows = await dbSelect('classes', '*');
    var me = T.teacher;
    T.classes = rows.filter(function (c) {
      if (c.teacher_id) return String(c.teacher_id) === String(me.id);
      return isMine(c.teacher);   // older rows with no teacher_id
    }).sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
    var info = document.getElementById('tcClassInfo');
    if (info) info.textContent = T.classes.map(function (c) { return c.name; }).join(', ');
    return T.classes;
  }

  /* ---------- Overview ---------- */
  function greeting() { var h = new Date().getHours(); return h < 12 ? 'Good morning' : (h < 17 ? 'Good afternoon' : 'Good evening'); }

  async function renderHome(el) {
    var results = await Promise.all([
      mySchedule().catch(function () { return null; }),
      myStudents().catch(function () { return null; }),
      todayAttendance().catch(function () { return null; })
    ]);
    var sched = results[0], students = results[1], att = results[2];

    var d = new Date(), nowMin = d.getHours() * 60 + d.getMinutes();
    var todays = (sched || []).filter(function (l) { return l.dayKey === norm(dayName()); });
    function state(l) {
      if (isNaN(l.startMin) || isNaN(l.endMin)) return '';
      if (l.endMin <= nowMin) return 'done';
      if (l.startMin <= nowMin) return 'now';
      return 'upcoming';
    }
    var live = todays.find(function (l) { return state(l) === 'now'; });
    var next = todays.find(function (l) { return state(l) === 'upcoming'; });

    var nextBox;
    if (live) {
      nextBox = '<div class="tc-hero-next"><div class="tc-hero-live">In session</div><strong>' + esc(live.subject || 'Lesson') + ' · ' + esc(live.class) +
        '</strong><span>' + esc(live.start) + ' – ' + esc(live.end) + '</span></div>';
    } else if (next) {
      nextBox = '<div class="tc-hero-next"><small>Next lesson</small><strong>' + esc(next.subject || 'Lesson') + ' · ' + esc(next.class) +
        '</strong><span>' + esc(next.start) + ' – ' + esc(next.end) + '</span></div>';
    } else if (sched === null) {
      nextBox = '<div class="tc-hero-next"><small>Timetable</small><strong>Not available right now</strong><span>Check your connection and refresh.</span></div>';
    } else {
      nextBox = '<div class="tc-hero-next"><small>Today</small><strong>' + (todays.length ? 'All lessons done' : 'No lessons scheduled') +
        '</strong><span>' + (todays.length ? 'Nice work today.' : 'Enjoy the quiet.') + '</span></div>';
    }

    var dateLabel = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    var markedClasses = att ? T.classes.filter(function (c) { return att.some(function (r) { return r.class === c.name; }); }).length : null;

    var lessons = todays.length
      ? todays.map(function (l) {
          var s = state(l);
          var badge = s === 'now' ? '<span class="tc-badge now">In session</span>' : (next && l.id === next.id ? '<span class="tc-badge next">Next</span>' : (s === 'done' ? '<span class="tc-badge">Done</span>' : ''));
          return '<div class="tc-lesson ' + (s === 'now' ? 'is-now' : (s === 'done' ? 'is-done' : '')) + '">' +
            '<div class="tc-lesson-t">' + esc(l.start) + '<small>' + esc(l.end) + '</small></div>' +
            '<div class="tc-lesson-s">' + esc(l.subject || 'Lesson') + '<small>' + esc(l.class) + '</small></div>' + badge + '</div>';
        }).join('')
      : ui.empty(sched === null ? 'Timetable unavailable' : 'No lessons today', sched === null ? 'We could not read your timetable. Refresh to try again.' : 'Lessons added to your timetable on the main dashboard will show here on the right day.');

    var classTiles = T.classes.length
      ? '<div class="tc-classes">' + T.classes.map(function (c) {
          var count = students ? students.filter(function (s) { return s.class === c.name; }).length : null;
          return '<div class="tc-class"><b>' + esc(c.name) + '</b><span>' + esc(c.room ? 'Room ' + c.room : 'No room set') + '</span>' +
            '<span>' + (count === null ? '' : count + (count === 1 ? ' student' : ' students')) + '</span></div>';
        }).join('') + '</div>'
      : ui.empty('No classes assigned yet', 'Ask the headmaster to assign a class to you on the main dashboard.');

    el.innerHTML =
      '<section class="tc-hero"><div><h2>' + esc(greeting()) + ', ' + esc(T.teacher.name || 'Teacher') + '</h2><p>' + esc(dateLabel) + '</p></div>' + nextBox + '</section>' +
      '<div class="tc-stats">' +
        ui.stat('My classes', T.classes.length, 'book') +
        ui.stat('My students', students ? students.length : '—', 'users', 'orange') +
        ui.stat('Lessons today', sched ? todays.length : '—', 'clock') +
        ui.stat('Registers marked today', markedClasses === null ? '—' : markedClasses + ' of ' + T.classes.length, 'check', 'green') +
      '</div>' +
      '<div class="tc-card"><div class="tc-card-h"><h3>Today’s lessons</h3><span>' + esc(dayName()) + '</span></div><div class="tc-card-b">' + lessons + '</div></div>' +
      '<div class="tc-card"><div class="tc-card-h"><h3>My classes</h3></div><div class="tc-card-b">' + classTiles + '</div></div>' +
      (T.matchedBy === 'name' ? '<p class="tc-note">Your login is linked to your teacher record by name. If the headmaster renames you, log out and in again.</p>' : '');
  }

  /* ---------- public API ---------- */
  var T = {
    sb: null, user: null, teacher: null, classes: [], matchedBy: '',
    esc: esc, today: today, dayName: dayName, norm: norm, isMine: isMine,
    minutes: minutes, fmtTime: fmtTime, icon: icon, ui: ui, days: DAYS,
    toast: toast, confirm: confirmBox,
    register: register, go: go, reloadClasses: reloadClasses,
    has: function (id) { return sections.some(function (s) { return s.id === id; }); },
    db: { select: dbSelect },
    mySchedule: mySchedule, myStudents: myStudents, todayAttendance: todayAttendance,
    invalidate: function (key) { if (key) delete cache[key]; else cache = {}; },
    logout: function () { try { localStorage.removeItem('currentUser'); } catch (e) {} location.href = 'login.html'; }
  };
  window.Teacher = T;

  function fatal(root, title, detail) {
    root.innerHTML = '<div class="tc-app"><div class="tc-center"><div class="tc-card"><div class="tc-card-b" style="padding:22px"><h3 style="margin:0 0 8px;color:var(--tc-navy)">' + esc(title) +
      '</h3><p class="tc-note" style="font-size:.92rem">' + detail + '</p><button class="tc-btn primary" id="tcBackLogin" style="margin-top:12px">Back to login</button></div></div></div></div>';
    document.getElementById('tcBackLogin').addEventListener('click', T.logout);
  }

  async function boot() {
    var root = document.getElementById('tcRoot') || document.body;
    injectStyles();

    var user = readUser();
    if (!user || user.role !== 'teacher') { location.href = 'login.html'; return; }
    T.user = user;

    if (!(window.supabase && window.supabase.createClient)) {
      fatal(root, 'Cannot reach the database library', 'The Supabase script did not load. Check your internet connection and refresh.');
      return;
    }
    T.sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    root.innerHTML = '<div class="tc-app"><div class="tc-loading">Loading your dashboard…</div></div>';

    try {
      var found = await loadTeacher(user);
      if (!found) {
        fatal(root, 'Your login is not linked to a teacher record',
          'You are signed in as <strong>' + esc(user.name) + '</strong>, but no teacher with that username or name exists. ' +
          'Ask the headmaster to check your teacher profile on the main dashboard, then log in again.');
        return;
      }
      T.teacher = found.row;
      T.matchedBy = found.by;
      console.info('[teacher] linked to', found.row.id, 'by', found.by);

      buildShell(root);
      await reloadClasses();
    } catch (e) {
      console.error(e);
      fatal(root, 'Could not load your dashboard', esc(e.message || e));
      return;
    }

    // Built-in Overview, unless a section file already registered 'home'.
    if (!sections.some(function (s) { return s.id === 'home'; })) {
      register({ id: 'home', title: 'Overview', icon: 'home', order: 0, render: renderHome });
    }
    booted = true;
    buildNav();
    var want = (location.hash || '').replace('#', '');
    go(sections.some(function (s) { return s.id === want; }) ? want : sections[0].id);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
