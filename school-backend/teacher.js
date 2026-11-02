 /* =========================================================================
   teacher.js  —  the teacher dashboard core. Loads FIRST on teacher.html.
   (Styles are injected from this file, so there is no separate CSS to edit.)

   Provides: session check + inactivity logout, Supabase connection, teacher
   lookup, the app shell (top bar + sidebar), the section registry, shared UI
   helpers, a guarded data layer (Teacher.db) and the Overview page.

   Section files (teacher-timetable.js, teacher-attendance.js, ...) load AFTER
   this file and call Teacher.register({ id, title, icon, order, render }).

   SECURITY MODEL
   - Every value shown on screen is HTML-escaped. No inline event handlers.
   - All reads go through Teacher.db.select, which refuses to read any
     "password" column and refuses "*" on people tables, and times out.
   - Overview only READS. Nothing is stored in the browser except a UI
     preference (sidebar collapsed). Writes (e.g. attendance) will go to
     Supabase from the section files.
   - Honest limit: login is held in the browser and the page uses the public
     anon key, so a technical user could bypass these checks. Real protection
     needs Supabase Auth + Row Level Security (a separate, larger job).
   ========================================================================= */
(function () {
  'use strict';

  var SUPABASE_URL = 'https://tnrxsrjzdshjuhvebkck.supabase.co';
  // Public "anon" key (safe in the page by design). NEVER put the service_role key here.
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRucnhzcmp6ZHNoanVodmVia2NrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyMjA1NTcsImV4cCI6MjA5Mjc5NjU1N30.4b6CAXXs21aIJKm1qi9bOuIE5zDfJiEQze9hoxSJ7ig';

  var IDLE_LIMIT_MS = 30 * 60 * 1000;   // auto log-out after 30 minutes without activity
  var QUERY_TIMEOUT_MS = 12000;

  /* ---------- small helpers ---------- */
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function pad(n) { return String(n).padStart(2, '0'); }
  function isoDate(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function today() { return isoDate(new Date()); }
  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  function dayName(dateStr) { return DAYS[new Date((dateStr || today()) + 'T00:00:00').getDay()]; }
  function norm(s) { return String(s == null ? '' : s).trim().toLowerCase(); }
  function clip(s, n) { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n - 1) + '…' : s; }

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
  function shortDate(s) {
    var d = new Date(String(s).length === 10 ? s + 'T00:00:00' : s);
    return isNaN(d) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }

  function readUser() {
    try { return JSON.parse(localStorage.getItem('currentUser')); } catch (e) { return null; }
  }

  /* Timetables may store the teacher as a name (older rows) or with a teacher_id. */
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
    tick: '<path d="M20 6L9 17l-5-5"/>',
    book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/>',
    menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
    chevron: '<path d="M15 18l-6-6 6-6"/>',
    refresh: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
    print: '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
    door: '<path d="M4 21V3h12v18"/><path d="M2 21h20"/><circle cx="13" cy="12" r=".8"/>',
    bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>'
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

  /* ---------- styles ---------- */
  function injectStyles() {
    var css = [
      /* Palette: Blueberry (primary) + Cream Soda (warm accent). The old --tc-navy/--tc-orange names are
         kept as aliases so section files written against them keep working. */
      ':root{--tc-blue:#2B3A9E;--tc-blue-dark:#19226B;--tc-blue-soft:#ECEFFC;--tc-cream:#FFD6A5;--tc-cream-soft:#FFF4E5;--tc-amber:#E8913A;--tc-amber-dark:#8A4B0F;',
      '--tc-navy:var(--tc-blue-dark);--tc-navy2:var(--tc-blue);--tc-orange:var(--tc-amber);--tc-orange-soft:var(--tc-cream-soft);',
      '--tc-bg:#F7F6FB;--tc-card:#fff;--tc-line:#E4E6F2;--tc-text:#1B2040;--tc-muted:#667089;--tc-green:#15803D;--tc-green-soft:#E7F6EC;--tc-red:#DC2626;--tc-r:14px;--tc-shadow:0 1px 2px rgba(25,34,107,.05),0 6px 20px rgba(25,34,107,.07)}',
      '.tc-app{min-height:100vh;background:var(--tc-bg);color:var(--tc-text);font-family:"Plus Jakarta Sans",system-ui,-apple-system,"Segoe UI",sans-serif;font-size:15px;line-height:1.5}',
      '.tc-app *{box-sizing:border-box}',
      '.tc-app button{font-family:inherit}',
      '.tc-app :focus-visible{outline:3px solid rgba(43,58,158,.4);outline-offset:2px}',
      '.tc-ic{flex:none;display:block}.tc-ic-txt{font-size:1.1rem;line-height:1}',
      /* top bar */
      '.tc-top{position:sticky;top:0;z-index:120;height:64px;background:#fff;border-bottom:1px solid var(--tc-line);display:flex;align-items:center;justify-content:space-between;padding:0 22px}',
      '.tc-top-l,.tc-top-r{display:flex;align-items:center;gap:12px;min-width:0}',
      '.tc-burger{display:none;width:40px;height:40px;border:1px solid var(--tc-line);background:#fff;border-radius:10px;color:var(--tc-blue-dark);cursor:pointer;align-items:center;justify-content:center}',
      '.tc-logo{width:38px;height:38px;object-fit:contain;border-radius:8px}',
      '.tc-brand{font-weight:800;font-size:1.15rem;color:var(--tc-blue-dark);letter-spacing:-.02em;white-space:nowrap}.tc-brand em{font-style:normal;color:var(--tc-amber)}',
      '.tc-role{font-size:.72rem;font-weight:700;color:var(--tc-blue);background:var(--tc-blue-soft);border-radius:999px;padding:3px 11px}',
      '.tc-who{text-align:right;line-height:1.25;min-width:0}.tc-who b{display:block;font-size:.9rem;color:var(--tc-blue-dark);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:220px}.tc-who span{font-size:.78rem;color:var(--tc-muted)}',
      '.tc-avatar{width:38px;height:38px;border-radius:50%;background:var(--tc-blue);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;flex:none;box-shadow:0 0 0 3px var(--tc-cream)}',
      /* layout + sidebar */
      '.tc-layout{display:flex;align-items:flex-start}',
      '.tc-side{position:sticky;top:64px;height:calc(100vh - 64px);width:248px;flex:none;background:#fff;border-right:1px solid var(--tc-line);display:flex;flex-direction:column;padding:16px 12px;transition:width .18s ease;overflow:hidden}',
      '.tc-nav{display:flex;flex-direction:column;gap:4px;flex:1;overflow-y:auto}',
      '.tc-nav-item{display:flex;align-items:center;gap:13px;width:100%;border:0;background:none;text-align:left;padding:11px 13px;border-radius:11px;color:var(--tc-muted);font-weight:600;font-size:.93rem;cursor:pointer;position:relative;white-space:nowrap}',
      '.tc-nav-item:hover{background:var(--tc-blue-soft);color:var(--tc-blue-dark)}',
      '.tc-nav-item.active{background:var(--tc-cream-soft);color:var(--tc-blue-dark)}',
      '.tc-nav-item.active .tc-ic{color:var(--tc-blue)}',
      '.tc-nav-item.active::before{content:"";position:absolute;left:-12px;top:9px;bottom:9px;width:4px;border-radius:0 4px 4px 0;background:var(--tc-amber)}',
      '.tc-side-foot{border-top:1px solid var(--tc-line);padding-top:12px;display:flex;flex-direction:column;gap:4px}',
      '.tc-collapse svg{transition:transform .18s}',
      '.tc-collapsed .tc-side{width:72px}.tc-collapsed .tc-nav-text{display:none}.tc-collapsed .tc-collapse svg{transform:rotate(180deg)}',
      '.tc-overlay{display:none}',
      /* main */
      '.tc-main{flex:1;min-width:0;padding:30px 34px 60px;max-width:1240px}',
      '.tc-ph{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:22px}',
      '.tc-ph h2{margin:0;font-size:1.65rem;line-height:1.2;letter-spacing:-.02em;color:var(--tc-blue-dark)}',
      '.tc-ph p{margin:4px 0 0;color:var(--tc-muted)}',
      '.tc-ph-actions{display:flex;gap:8px;flex-wrap:wrap}',
      /* buttons */
      '.tc-btn{display:inline-flex;align-items:center;gap:8px;border:1px solid var(--tc-line);background:#fff;color:var(--tc-blue-dark);font-weight:700;font-size:.85rem;padding:9px 15px;border-radius:10px;cursor:pointer}',
      '.tc-btn:hover{background:var(--tc-blue-soft)}.tc-btn.primary{background:var(--tc-blue);border-color:var(--tc-blue);color:#fff}.tc-btn.primary:hover{background:var(--tc-blue-dark)}',
      '.tc-btn.ghost{background:transparent}.tc-btn.sm{padding:6px 12px;font-size:.78rem}',
      '.tc-btn:disabled{opacity:.5;cursor:not-allowed}.tc-btn:disabled:hover{background:#fff}',
      /* cards, stats */
      '.tc-card{background:var(--tc-card);border:1px solid var(--tc-line);border-radius:var(--tc-r);box-shadow:var(--tc-shadow);margin-bottom:22px;overflow:hidden}',
      '.tc-card-h{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:16px 20px;border-bottom:1px solid var(--tc-line)}',
      '.tc-card-h h3{margin:0;font-size:1.02rem;color:var(--tc-blue-dark)}.tc-card-h span{font-size:.82rem;color:var(--tc-muted)}',
      '.tc-card-b{padding:6px 20px 14px}',
      '.tc-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:14px;margin-bottom:22px}',
      '.tc-stat{display:flex;align-items:center;gap:14px;background:#fff;border:1px solid var(--tc-line);border-radius:var(--tc-r);padding:16px 18px}',
      '.tc-stat-ic{width:42px;height:42px;border-radius:12px;background:var(--tc-blue-soft);color:var(--tc-blue);display:flex;align-items:center;justify-content:center;flex:none}',
      '.tc-stat.cream .tc-stat-ic,.tc-stat.orange .tc-stat-ic{background:var(--tc-cream);color:var(--tc-amber-dark)}.tc-stat.green .tc-stat-ic{background:var(--tc-green-soft);color:var(--tc-green)}',
      '.tc-stat-v{font-size:1.5rem;font-weight:800;color:var(--tc-blue-dark);line-height:1.1}.tc-stat-l{font-size:.8rem;color:var(--tc-muted);margin-top:3px}',
      /* hero */
      '.tc-hero{display:grid;grid-template-columns:1.1fr 1fr;gap:26px;align-items:stretch;background:radial-gradient(circle at 94% 6%,rgba(255,214,165,.30),transparent 40%),linear-gradient(120deg,var(--tc-blue-dark) 0%,var(--tc-blue) 100%);color:#fff;border-radius:18px;padding:28px 30px;margin-bottom:22px}',
      '.tc-hero h2{margin:0 0 6px;font-size:1.75rem;line-height:1.2;letter-spacing:-.02em}',
      '.tc-hero p{margin:0;color:rgba(255,255,255,.8)}',
      '.tc-hero-next{background:var(--tc-cream);color:var(--tc-blue-dark);border-radius:14px;padding:16px 18px;display:flex;flex-direction:column;justify-content:center;gap:3px}',
      '.tc-hero-next small{font-size:.78rem;color:#7A4B12;font-weight:700;text-transform:uppercase;letter-spacing:.05em}',
      '.tc-hero-next strong{font-size:1.3rem;line-height:1.25}',
      '.tc-hero-next span{color:#4B3A22;font-size:.92rem}',
      '.tc-hero-live{display:inline-flex;align-items:center;gap:7px;font-size:.76rem;font-weight:800;color:#166534;text-transform:uppercase;letter-spacing:.05em}.tc-hero-live::before{content:"";width:9px;height:9px;border-radius:50%;background:#16A34A;box-shadow:0 0 0 4px rgba(22,163,74,.22)}',
      '.tc-count{align-self:flex-start;margin-top:6px;font-weight:800;font-size:.82rem;background:rgba(25,34,107,.1);border-radius:999px;padding:3px 12px}',
      /* week strip */
      '.tc-week{display:grid;grid-auto-flow:column;grid-auto-columns:1fr;gap:10px;padding:14px 0 8px}',
      '.tc-day{border:1px solid var(--tc-line);border-radius:12px;padding:10px 6px;text-align:center;background:#fbfbfe}',
      '.tc-day small{display:block;font-size:.72rem;font-weight:700;color:var(--tc-muted);text-transform:uppercase;letter-spacing:.05em}',
      '.tc-day b{display:block;font-size:1.15rem;color:var(--tc-blue-dark)}',
      '.tc-day span{font-size:.76rem;color:var(--tc-muted)}',
      '.tc-day.is-today{background:var(--tc-blue);border-color:var(--tc-blue)}.tc-day.is-today small,.tc-day.is-today span{color:rgba(255,255,255,.85)}.tc-day.is-today b{color:#fff}',
      '.tc-day.is-off{opacity:.6}',
      /* lessons */
      '.tc-lesson{display:grid;grid-template-columns:96px 1fr auto;gap:14px;align-items:center;padding:13px 0;border-bottom:1px solid var(--tc-line)}',
      '.tc-lesson:last-child{border-bottom:0}',
      '.tc-lesson-t{font-weight:700;color:var(--tc-blue-dark);font-variant-numeric:tabular-nums}.tc-lesson-t small{display:block;color:var(--tc-muted);font-weight:500}',
      '.tc-lesson-s{font-weight:700;color:var(--tc-text)}.tc-lesson-s small{display:block;color:var(--tc-muted);font-weight:500;font-size:.82rem}',
      '.tc-lesson-r{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end}',
      '.tc-lesson.is-now{background:linear-gradient(90deg,var(--tc-green-soft),transparent);margin:0 -20px;padding-left:20px;padding-right:20px}',
      '.tc-lesson.is-done .tc-lesson-t,.tc-lesson.is-done .tc-lesson-s{opacity:.55}',
      '.tc-badge{display:inline-flex;align-items:center;gap:5px;font-size:.74rem;font-weight:700;padding:3px 10px;border-radius:999px;background:#eef0f8;color:var(--tc-muted);white-space:nowrap}',
      '.tc-badge.now{background:var(--tc-green-soft);color:var(--tc-green)}.tc-badge.next{background:var(--tc-cream);color:var(--tc-amber-dark)}.tc-badge.ok{background:var(--tc-green-soft);color:var(--tc-green)}',
      /* class tiles */
      '.tc-classes{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:14px;padding:16px 0 8px}',
      '.tc-class{border:1px solid var(--tc-line);border-radius:12px;padding:15px 16px;background:#fbfbfe}',
      '.tc-class b{display:block;font-size:1.05rem;color:var(--tc-blue-dark)}.tc-class span{display:block;color:var(--tc-muted);font-size:.84rem;margin-top:2px}',
      '.tc-class-row{display:flex;justify-content:space-between;gap:8px;margin-top:10px;font-size:.84rem;color:var(--tc-text);font-weight:600}',
      '.tc-meter{height:7px;border-radius:99px;background:#E8EAF5;overflow:hidden;margin-top:6px}.tc-meter i{display:block;height:100%;background:var(--tc-blue);border-radius:99px}',
      /* quick actions + notices */
      '.tc-quick{display:flex;flex-wrap:wrap;gap:10px;padding:14px 0 6px}',
      '.tc-notice{padding:12px 0;border-bottom:1px solid var(--tc-line)}.tc-notice:last-child{border-bottom:0}',
      '.tc-notice b{display:block;color:var(--tc-blue-dark)}.tc-notice p{margin:2px 0 0;color:var(--tc-text);font-size:.9rem}.tc-notice small{color:var(--tc-muted)}',
      /* empty + skeleton */
      '.tc-empty{text-align:center;padding:34px 20px;color:var(--tc-muted)}.tc-empty strong{display:block;color:var(--tc-blue-dark);margin:10px 0 4px;font-size:1rem}.tc-empty p{margin:0 auto;max-width:420px}',
      '.tc-empty-ic{width:54px;height:54px;border-radius:50%;background:var(--tc-cream-soft);color:var(--tc-amber-dark);display:inline-flex;align-items:center;justify-content:center}',
      '.tc-skel{background:linear-gradient(90deg,#E9EBF6 25%,#F5F6FB 50%,#E9EBF6 75%);background-size:200% 100%;animation:tcShimmer 1.3s infinite;border-radius:12px;height:96px}',
      '.tc-skel-h{height:34px;width:42%;margin-bottom:20px}.tc-skel-b{height:220px;margin-top:14px}.tc-skel-row{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}',
      '@keyframes tcShimmer{to{background-position:-200% 0}}',
      '.tc-note{font-size:.8rem;color:var(--tc-muted);margin-top:6px}',
      '.tc-loading{padding:4rem 1rem;text-align:center;color:var(--tc-muted)}',
      '.tc-center{max-width:560px;margin:12vh auto;padding:0 20px}',
      /* toasts + modal */
      '#tcToasts{position:fixed;top:76px;right:20px;z-index:9999;display:flex;flex-direction:column;gap:8px;max-width:340px}',
      '.tc-toast{padding:12px 18px;border-radius:10px;font-size:.86rem;font-weight:700;color:#fff;box-shadow:var(--tc-shadow);animation:tcIn .25s ease;transition:opacity .3s}',
      '.tc-toast.success{background:#16a34a}.tc-toast.error{background:#dc2626}.tc-toast.info{background:var(--tc-blue-dark);border-left:4px solid var(--tc-cream)}.tc-toast.out{opacity:0}',
      '@keyframes tcIn{from{opacity:0;transform:translateX(30px)}to{opacity:1;transform:none}}',
      '.tc-modal-back{position:fixed;inset:0;background:rgba(25,34,107,.45);display:flex;align-items:center;justify-content:center;z-index:9998;padding:16px;font-family:"Plus Jakarta Sans",system-ui,sans-serif}',
      '.tc-modal{background:#fff;border-radius:14px;padding:1.5rem;max-width:380px;width:100%;box-shadow:var(--tc-shadow)}',
      '.tc-modal p{font-size:.95rem;line-height:1.5;margin:0 0 1.25rem}',
      '.tc-modal-actions{display:flex;gap:.6rem;justify-content:flex-end}',
      /* mobile */
      '@media (max-width:860px){',
      ' .tc-burger{display:inline-flex}.tc-role,.tc-who{display:none}.tc-top{padding:0 14px}',
      ' .tc-side{position:fixed;left:0;top:64px;bottom:0;height:auto;z-index:140;width:262px!important;transform:translateX(-105%);transition:transform .2s;box-shadow:var(--tc-shadow)}',
      ' .tc-open .tc-side{transform:none}',
      ' .tc-open .tc-overlay{display:block;position:fixed;inset:64px 0 0 0;background:rgba(25,34,107,.35);z-index:130}',
      ' .tc-collapsed .tc-nav-text{display:inline}.tc-collapse{display:none}',
      ' .tc-main{padding:20px 16px 50px}',
      ' .tc-hero{grid-template-columns:1fr;padding:22px 20px}',
      ' .tc-lesson{grid-template-columns:78px 1fr}.tc-lesson-r{grid-column:2;justify-content:flex-start}',
      ' .tc-week{grid-auto-flow:row;grid-template-columns:repeat(3,1fr)}',
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

  /* ---------- session safety: idle logout + logout in another tab ---------- */
  function startSessionGuard() {
    var last = Date.now(), warned = false;
    function bump() { last = Date.now(); warned = false; }
    ['mousemove', 'keydown', 'click', 'touchstart', 'scroll'].forEach(function (ev) {
      window.addEventListener(ev, bump, { passive: true });
    });
    setInterval(function () {
      var idle = Date.now() - last;
      if (idle >= IDLE_LIMIT_MS) T.logout();
      else if (idle >= IDLE_LIMIT_MS - 3 * 60 * 1000 && !warned) {
        warned = true;
        toast('You will be logged out in 3 minutes because of inactivity.', 'info');
      }
    }, 30000);
    window.addEventListener('storage', function (e) {
      if (e.key === 'currentUser' && !e.newValue) location.href = 'login.html';
    });
  }

  /* ---------- section registry + routing ---------- */
  var sections = [];
  var booted = false;
  var current = null;
  var homeTimer = null;

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
    clearInterval(homeTimer);
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
  function withTimeout(p, ms) {
    return Promise.race([p, new Promise(function (_, reject) {
      setTimeout(function () { reject(new Error('The server took too long to respond.')); }, ms);
    })]);
  }

  var PEOPLE_TABLES = ['students', 'teachers', 'users'];
  function assertSafeSelect(table, columns) {
    if (/\bpassword\b/i.test(columns)) throw new Error('Reading a password column is not allowed.');
    if (columns.trim() === '*' && PEOPLE_TABLES.indexOf(table) >= 0) throw new Error('Name the columns you need when reading "' + table + '".');
  }

  /* opts: eq {col:val}, in [col, [vals]], gte {col:val}, order [col, ascending], limit n */
  async function dbSelect(table, columns, opts) {
    opts = opts || {};
    assertSafeSelect(table, columns);
    var q = T.sb.from(table).select(columns);
    if (opts.eq) Object.keys(opts.eq).forEach(function (k) { q = q.eq(k, opts.eq[k]); });
    if (opts.in) q = q.in(opts.in[0], opts.in[1]);
    if (opts.gte) Object.keys(opts.gte).forEach(function (k) { q = q.gte(k, opts.gte[k]); });
    if (opts.order) q = q.order(opts.order[0], { ascending: opts.order[1] !== false });
    if (opts.limit) q = q.limit(opts.limit);
    var res = await withTimeout(q, QUERY_TIMEOUT_MS);
    if (res.error) throw new Error('Could not read "' + table + '": ' + res.error.message);
    return res.data || [];
  }

  function dayIndex(d) { var i = DAYS.map(norm).indexOf(norm(d)); return i === 0 ? 7 : i; }  // Mon=1 … Sun=7

  /* The teacher's own timetable rows. Matches on teacher_id when the row has one,
     otherwise on the name (older rows). Falls back gracefully if the newer
     teacher_id / room columns have not been added to Supabase yet. */
  function mySchedule() {
    return cached('schedule', async function () {
      var rows;
      try {
        rows = await dbSelect('timetables', 'id,class,day,start_time,end_time,teacher,teacher_id,subject,room');
      } catch (e) {
        rows = await dbSelect('timetables', 'id,class,day,start_time,end_time,teacher,subject');
      }
      return rows.filter(function (r) {
        if (r.teacher_id) return String(r.teacher_id) === String(T.teacher.id);
        return isMine(r.teacher);
      }).map(function (r) {
        return {
          id: r.id, class: r.class || '', day: r.day || '', dayKey: norm(r.day), room: r.room || '',
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

  /* Students in the teacher's classes. Never selects password or phone. */
  function myStudents() {
    return cached('students', async function () {
      var names = T.classes.map(function (c) { return c.name; });
      if (!names.length) return [];
      var rows = await dbSelect('students', 'id,name,class,gender,status', { in: ['class', names] });
      return rows.filter(function (s) { return (s.status || 'Active') === 'Active'; });
    });
  }

  /* Attendance for the teacher's classes over the last 10 days (read only here). */
  function recentAttendance() {
    return cached('attendanceRecent', async function () {
      var names = T.classes.map(function (c) { return c.name; });
      if (!names.length) return [];
      var since = new Date(); since.setDate(since.getDate() - 10);
      return dbSelect('attendance', 'student_id,class,date,status', { in: ['class', names], gte: { date: isoDate(since) }, limit: 3000 });
    }, 20000);
  }
  function todayAttendance() {
    return recentAttendance().then(function (rows) { return rows.filter(function (r) { return r.date === today(); }); });
  }

  /* School notices from the headmaster. Shown only when the table exists and has rows for teachers. */
  var NOTICE_AUDIENCES = ['all', 'everyone', 'teachers', 'teacher', 'staff', 'school'];
  function notices() {
    return cached('notices', async function () {
      var rows = await dbSelect('announcements', '*', { limit: 30 });
      return rows.map(function (r) {
        var aud = r.audience || r.target || r.recipient || r.role || r.for;
        var when = r.created_at || r.date || r.posted_at || '';
        return {
          aud: aud == null ? null : norm(aud),
          title: clip(r.title || r.heading || r.subject || 'Notice', 80),
          body: clip(r.message || r.body || r.text || r.content || r.description || '', 280),
          when: when, ts: Date.parse(when) || 0
        };
      }).filter(function (n) {
        return (n.aud === null || NOTICE_AUDIENCES.indexOf(n.aud) >= 0) && (n.title || n.body);
      }).sort(function (a, b) { return b.ts - a.ts; }).slice(0, 3);
    }, 120000);
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
    var rows = await dbSelect('classes', 'id,name,form_level,teacher,teacher_id,room');
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
  function untilText(mins) {
    if (mins < 1) return 'starting now';
    if (mins < 60) return 'in ' + mins + ' min';
    var h = Math.floor(mins / 60), m = mins % 60;
    return 'in ' + h + ' h' + (m ? ' ' + m + ' min' : '');
  }

  function classAttendance(att, className) {
    var rows = (att || []).filter(function (r) { return r.class === className; });
    if (!rows.length) return null;
    var last = rows.reduce(function (m, r) { return r.date > m ? r.date : m; }, '');
    var day = rows.filter(function (r) { return r.date === last; });
    var present = day.filter(function (r) { return norm(r.status) === 'present'; }).length;
    return { date: last, present: present, total: day.length, pct: day.length ? Math.round(present / day.length * 100) : 0 };
  }

  function weekStrip(sched) {
    var d = new Date(), dow = d.getDay() || 7;
    var count = {};
    sched.forEach(function (l) { count[l.dayKey] = (count[l.dayKey] || 0) + 1; });
    var n = count.saturday ? 6 : 5, html = '';
    for (var i = 0; i < n; i++) {
      var dt = new Date(d.getFullYear(), d.getMonth(), d.getDate() - dow + 1 + i);
      var c = count[norm(DAYS[(i + 1) % 7])] || 0;
      html += '<div class="tc-day' + (i + 1 === dow ? ' is-today' : '') + (c ? '' : ' is-off') + '"><small>' + esc(DAYS[(i + 1) % 7].slice(0, 3)) +
        '</small><b>' + dt.getDate() + '</b><span>' + (c ? c + (c === 1 ? ' lesson' : ' lessons') : 'Free') + '</span></div>';
    }
    return '<div class="tc-week">' + html + '</div>';
  }

  async function renderHome(el) {
    var results = await Promise.all([
      mySchedule().catch(function () { return null; }),
      myStudents().catch(function () { return null; }),
      recentAttendance().catch(function () { return null; }),
      notices().catch(function () { return null; })
    ]);
    var sched = results[0], students = results[1], att = results[2], news = results[3];

    function paint() {
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
      var markedToday = att ? T.classes.filter(function (c) { return att.some(function (r) { return r.class === c.name && r.date === today(); }); }).map(function (c) { return c.name; }) : null;
      var canMark = T.has('attendance');

      var nextBox;
      if (live) {
        nextBox = '<div class="tc-hero-next"><div class="tc-hero-live">In session</div><strong>' + esc(live.subject || 'Lesson') + ' · ' + esc(live.class) +
          '</strong><span>' + esc(live.start) + ' – ' + esc(live.end) + (live.room ? ' · Room ' + esc(live.room) : '') + '</span>' +
          '<span class="tc-count">Ends ' + esc(untilText(live.endMin - nowMin)) + '</span></div>';
      } else if (next) {
        nextBox = '<div class="tc-hero-next"><small>Next lesson</small><strong>' + esc(next.subject || 'Lesson') + ' · ' + esc(next.class) +
          '</strong><span>' + esc(next.start) + ' – ' + esc(next.end) + (next.room ? ' · Room ' + esc(next.room) : '') + '</span>' +
          '<span class="tc-count">Starts ' + esc(untilText(next.startMin - nowMin)) + '</span></div>';
      } else if (sched === null) {
        nextBox = '<div class="tc-hero-next"><small>Timetable</small><strong>Not available right now</strong><span>Check your connection and refresh.</span></div>';
      } else {
        nextBox = '<div class="tc-hero-next"><small>Today</small><strong>' + (todays.length ? 'All lessons done' : 'No lessons scheduled') +
          '</strong><span>' + (todays.length ? 'Nice work today.' : 'Enjoy the quiet.') + '</span></div>';
      }

      var dateLabel = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

      var lessons = todays.length
        ? todays.map(function (l) {
            var s = state(l);
            var badge = s === 'now' ? '<span class="tc-badge now">In session</span>'
              : (next && l.id === next.id ? '<span class="tc-badge next">Next</span>' : (s === 'done' ? '<span class="tc-badge">Done</span>' : ''));
            var reg;
            if (markedToday && markedToday.indexOf(l.class) >= 0) reg = '<span class="tc-badge ok">' + icon('tick', 13) + 'Register marked</span>';
            else if (canMark) reg = '<button class="tc-btn sm" data-act="register" data-class="' + esc(l.class) + '">Mark register</button>';
            else reg = '<button class="tc-btn sm" disabled title="Attendance opens soon">Mark register</button>';
            return '<div class="tc-lesson ' + (s === 'now' ? 'is-now' : (s === 'done' ? 'is-done' : '')) + '">' +
              '<div class="tc-lesson-t">' + esc(l.start) + '<small>' + esc(l.end) + '</small></div>' +
              '<div class="tc-lesson-s">' + esc(l.subject || 'Lesson') + '<small>' + esc(l.class) + (l.room ? ' · Room ' + esc(l.room) : '') + '</small></div>' +
              '<div class="tc-lesson-r">' + badge + reg + '</div></div>';
          }).join('')
        : ui.empty(sched === null ? 'Timetable unavailable' : 'No lessons today',
            sched === null ? 'We could not read your timetable. Refresh to try again.' : 'Lessons added to your timetable on the main dashboard will show here on the right day.');

      var classTiles = T.classes.length
        ? '<div class="tc-classes">' + T.classes.map(function (c) {
            var count = students ? students.filter(function (s) { return s.class === c.name; }).length : null;
            var ca = classAttendance(att, c.name);
            return '<div class="tc-class"><b>' + esc(c.name) + '</b><span>' + esc(c.room ? 'Room ' + c.room : 'No room set') + '</span>' +
              '<div class="tc-class-row"><span>' + (count === null ? '—' : count + (count === 1 ? ' student' : ' students')) + '</span>' +
              '<span>' + (ca ? ca.pct + '% present' : 'No register yet') + '</span></div>' +
              '<div class="tc-meter"><i style="width:' + (ca ? ca.pct : 0) + '%"></i></div>' +
              (ca ? '<span style="font-size:.76rem">Last register ' + esc(shortDate(ca.date)) + ': ' + ca.present + ' of ' + ca.total + ' present</span>' : '') + '</div>';
          }).join('') + '</div>'
        : ui.empty('No classes assigned yet', 'Ask the headmaster to assign a class to you on the main dashboard.');

      var others = sections.filter(function (s) { return s.id !== 'home'; });
      var quick = '<div class="tc-card"><div class="tc-card-h"><h3>Quick actions</h3></div><div class="tc-card-b"><div class="tc-quick">' +
        others.map(function (s) {
          return '<button class="tc-btn" data-act="go" data-id="' + esc(s.id) + '">' + icon(s.icon || 'book', 16) + esc(s.title || s.id) + '</button>';
        }).join('') +
        '<button class="tc-btn ghost" data-act="refresh">' + icon('refresh', 16) + 'Refresh</button></div></div></div>';

      var noticeCard = (news && news.length)
        ? '<div class="tc-card"><div class="tc-card-h"><h3>' + icon('bell', 16) + ' School notices</h3></div><div class="tc-card-b">' +
          news.map(function (n) {
            return '<div class="tc-notice"><b>' + esc(n.title) + '</b>' + (n.body ? '<p>' + esc(n.body) + '</p>' : '') +
              (n.ts ? '<small>' + esc(shortDate(n.when)) + '</small>' : '') + '</div>';
          }).join('') + '</div></div>'
        : '';

      el.innerHTML =
        '<section class="tc-hero"><div><h2>' + esc(greeting()) + ', ' + esc(T.teacher.name || 'Teacher') + '</h2><p>' + esc(dateLabel) + '</p></div>' + nextBox + '</section>' +
        '<div class="tc-stats">' +
          ui.stat('My classes', T.classes.length, 'book') +
          ui.stat('My students', students ? students.length : '—', 'users', 'cream') +
          ui.stat('Lessons today', sched ? todays.length : '—', 'clock') +
          ui.stat('Registers marked today', markedToday === null ? '—' : markedToday.length + ' of ' + T.classes.length, 'check', 'green') +
        '</div>' +
        '<div class="tc-card"><div class="tc-card-h"><h3>Today’s lessons</h3><span>' + esc(dayName()) + '</span></div><div class="tc-card-b">' + lessons + '</div></div>' +
        '<div class="tc-card"><div class="tc-card-h"><h3>This week</h3><span>Lessons per day</span></div><div class="tc-card-b">' + weekStrip(sched || []) + '</div></div>' +
        '<div class="tc-card"><div class="tc-card-h"><h3>My classes</h3></div><div class="tc-card-b">' + classTiles + '</div></div>' +
        noticeCard + (others.length ? quick : '') +
        (T.matchedBy === 'name' ? '<p class="tc-note">Your login is linked to your teacher record by name. If the headmaster renames you, log out and in again.</p>' : '');
    }

    paint();
    clearInterval(homeTimer);
    homeTimer = setInterval(function () {            // keeps countdowns and "in session" fresh, no refetch
      if (!el.isConnected) { clearInterval(homeTimer); return; }
      paint();
    }, 30000);

    el.addEventListener('click', function (e) {
      var b = e.target.closest('[data-act]');
      if (!b || b.disabled) return;
      var act = b.dataset.act;
      if (act === 'go') go(b.dataset.id);
      else if (act === 'register') { T.pendingClass = b.dataset.class; go('attendance'); }
      else if (act === 'refresh') { T.invalidate(); go('home'); }
    });
  }

  /* ---------- public API ---------- */
  var T = {
    sb: null, user: null, teacher: null, classes: [], matchedBy: '', pendingClass: '',
    esc: esc, today: today, dayName: dayName, norm: norm, isMine: isMine,
    minutes: minutes, fmtTime: fmtTime, icon: icon, ui: ui, days: DAYS,
    toast: toast, confirm: confirmBox,
    register: register, go: go, reloadClasses: reloadClasses,
    has: function (id) { return sections.some(function (s) { return s.id === id; }); },
    db: { select: dbSelect },
    mySchedule: mySchedule, myStudents: myStudents, todayAttendance: todayAttendance, recentAttendance: recentAttendance, notices: notices,
    invalidate: function (key) { if (key) delete cache[key]; else cache = {}; },
    logout: function () { try { localStorage.removeItem('currentUser'); } catch (e) {} location.href = 'login.html'; }
  };
  window.Teacher = T;

  function fatal(root, title, detail) {
    root.innerHTML = '<div class="tc-app"><div class="tc-center"><div class="tc-card"><div class="tc-card-b" style="padding:22px"><h3 style="margin:0 0 8px;color:var(--tc-blue-dark)">' + esc(title) +
      '</h3><p class="tc-note" style="font-size:.92rem">' + detail + '</p><button class="tc-btn primary" id="tcBackLogin" style="margin-top:12px">Back to login</button></div></div></div></div>';
    document.getElementById('tcBackLogin').addEventListener('click', T.logout);
  }

  async function boot() {
    var root = document.getElementById('tcRoot') || document.body;
    injectStyles();

    var user = readUser();
    if (!user || norm(user.role) !== 'teacher') { location.href = 'login.html'; return; }
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

      buildShell(root);
      await reloadClasses();
    } catch (e) {
      console.error(e);
      fatal(root, 'Could not load your dashboard', esc(e.message || e));
      return;
    }

    startSessionGuard();

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
