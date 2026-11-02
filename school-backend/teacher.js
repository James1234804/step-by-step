  /* =========================================================================
   teacher-core.js  —  loads FIRST on the teacher page.
   Provides: session check, Supabase connection, teacher record lookup,
   sidebar + layout, section registry, and shared helpers (window.Teacher).
   Section files (teacher-timetable.js, teacher-attendance.js, ...) load AFTER
   this file and call Teacher.register({...}).
   ========================================================================= */
(function () {
  'use strict';

  var SUPABASE_URL = 'https://tnrxsrjzdshjuhvebkck.supabase.co';
  // Public "anon" key (safe to be in the page by design). NEVER put the service_role key here.
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRucnhzcmp6ZHNoanVodmVia2NrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyMjA1NTcsImV4cCI6MjA5Mjc5NjU1N30.4b6CAXXs21aIJKm1qi9bOuIE5zDfJiEQze9hoxSJ7ig';

  /* ---------- helpers ---------- */
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

  function readUser() {
    try { return JSON.parse(localStorage.getItem('currentUser')); } catch (e) { return null; }
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
        '<button class="btn secondary" data-r="0">Cancel</button><button class="btn primary" data-r="1"></button></div></div>';
      back.querySelector('p').textContent = message;
      back.querySelector('[data-r="1"]').textContent = okLabel || 'Confirm';
      back.addEventListener('click', function (e) {
        var b = e.target.closest('[data-r]');
        if (!b && e.target !== back) return;
        back.remove();
        resolve(b ? b.dataset.r === '1' : false);
      });
      document.body.appendChild(back);
    });
  }

  /* ---------- styles for the new shell (builds on teacher.css) ---------- */
  function injectStyles() {
    var s = document.createElement('style');
    s.textContent = [
      '.tc-menu{display:none;background:none;border:1.5px solid var(--border);border-radius:8px;width:38px;height:38px;font-size:1.1rem;cursor:pointer;color:var(--navy)}',
      '#tcToasts{position:fixed;top:76px;right:20px;z-index:9999;display:flex;flex-direction:column;gap:8px;max-width:340px}',
      '.tc-toast{padding:12px 18px;border-radius:10px;font-size:.85rem;font-weight:700;color:#fff;box-shadow:var(--shadow-lg);animation:slideIn .25s ease;transition:opacity .3s}',
      '.tc-toast.success{background:#16a34a}.tc-toast.error{background:#dc2626}.tc-toast.info{background:var(--navy);border-left:4px solid var(--orange)}.tc-toast.out{opacity:0}',
      '.tc-modal-back{position:fixed;inset:0;background:rgba(15,37,87,.45);display:flex;align-items:center;justify-content:center;z-index:9998;padding:16px}',
      '.tc-modal{background:#fff;border-radius:14px;padding:1.5rem;max-width:380px;width:100%;box-shadow:var(--shadow-lg)}',
      '.tc-modal p{font-size:.95rem;line-height:1.5;margin-bottom:1.25rem}',
      '.tc-modal-actions{display:flex;gap:.6rem;justify-content:flex-end}',
      '.tc-center{max-width:560px;margin:12vh auto;padding:0 20px}',
      '.tc-loading{padding:3rem;text-align:center;color:var(--text-muted)}',
      '.tc-list{list-style:none}.tc-list li{padding:10px 0;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;gap:12px}',
      '.tc-list li:last-child{border-bottom:none}',
      '@media (max-width:768px){',
      ' .tc-menu{display:inline-flex;align-items:center;justify-content:center}',
      ' .teacher-nav{padding:0 1rem}.nav-title,.nav-badge,.nav-user{display:none}',
      ' .sidebar{display:flex!important;position:fixed;left:0;top:64px;bottom:0;height:auto;z-index:150;width:260px;transform:translateX(-105%);transition:transform .2s;box-shadow:var(--shadow-lg)}',
      ' .sidebar.tc-open{transform:none}',
      ' .main{padding:0!important}',
      '}',
      '@media print{.teacher-nav,.sidebar,#tcToasts,.no-print{display:none!important}.main{padding:0}.card{box-shadow:none;margin:0 0 12px}}'
    ].join('\n');
    document.head.appendChild(s);
  }

  /* ---------- shell ---------- */
  function buildShell(root) {
    root.innerHTML =
      '<nav class="teacher-nav">' +
        '<div class="nav-left">' +
          '<button class="tc-menu" id="tcMenu" aria-label="Menu">☰</button>' +
          '<img src="shallom-logo.jpeg" class="nav-logo" alt="">' +
          '<h1 class="nav-title">Step by Step <span>Academy</span></h1>' +
          '<span class="nav-badge">Teacher</span>' +
        '</div>' +
        '<div class="nav-right">' +
          '<div class="nav-user"><span class="nav-user-name" id="tcName"></span><span class="nav-user-class" id="tcClassInfo"></span></div>' +
          '<button class="btn btn-danger" id="tcLogout">Logout</button>' +
        '</div>' +
      '</nav>' +
      '<div class="layout">' +
        '<aside class="sidebar" id="tcSidebar">' +
          '<div class="sidebar-section"><div class="sidebar-label">Menu</div><div id="tcNav"></div></div>' +
          '<div class="sidebar-footer"><button class="btn-logout" id="tcLogout2">🚪 Logout</button></div>' +
        '</aside>' +
        '<main class="main" id="tcMain"></main>' +
      '</div>' +
      '<div id="tcToasts" aria-live="polite"></div>';

    document.getElementById('tcLogout').addEventListener('click', T.logout);
    document.getElementById('tcLogout2').addEventListener('click', T.logout);
    document.getElementById('tcMenu').addEventListener('click', function () {
      document.getElementById('tcSidebar').classList.toggle('tc-open');
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
    if (booted) { buildNav(); }
  }

  function buildNav() {
    sections.sort(function (a, b) { return a.order - b.order; });
    var nav = document.getElementById('tcNav');
    if (!nav) return;
    nav.innerHTML = '';
    sections.forEach(function (s) {
      var b = document.createElement('button');
      b.className = 'nav-item' + (s.id === current ? ' active' : '');
      b.dataset.id = s.id;
      b.innerHTML = '<span class="nav-icon"></span><span class="nav-text"></span>';
      b.querySelector('.nav-icon').textContent = s.icon || '•';
      b.querySelector('.nav-text').textContent = s.title || s.id;
      b.addEventListener('click', function () { go(s.id); });
      nav.appendChild(b);
    });
  }

  async function go(id) {
    var sec = sections.find(function (s) { return s.id === id; }) || sections[0];
    if (!sec) return;
    current = sec.id;
    if (location.hash !== '#' + sec.id) history.replaceState(null, '', '#' + sec.id);
    document.querySelectorAll('#tcNav .nav-item').forEach(function (n) { n.classList.toggle('active', n.dataset.id === sec.id); });
    document.getElementById('tcSidebar').classList.remove('tc-open');
    var main = document.getElementById('tcMain');
    main.innerHTML = '<div class="tc-loading">Loading…</div>';
    var holder = document.createElement('div');
    holder.className = 'page active';
    holder.id = 'page-' + sec.id;
    try {
      await sec.render(holder, T);
      main.innerHTML = '';
      main.appendChild(holder);
    } catch (e) {
      console.error('Section "' + sec.id + '" failed:', e);
      main.innerHTML = '<div class="card" style="margin-top:28px"><div class="card-body"><strong>Something went wrong loading this page.</strong>' +
        '<p class="muted-text" style="margin-top:8px">' + esc(e && e.message ? e.message : e) + '</p></div></div>';
    }
  }

  /* ---------- data: who is this teacher, and which classes are theirs ---------- */
  async function loadTeacher(user) {
    var res = await T.sb.from('teachers').select('id,name,username,department,status');
    if (res.error) throw new Error('Could not read the teachers table: ' + res.error.message);
    var list = res.data || [];
    var hit = list.find(function (t) { return user.id != null && String(t.id) === String(user.id); });
    if (hit) return { row: hit, by: 'login ID' };
    hit = list.find(function (t) { return user.username && norm(t.username) === norm(user.username); });
    if (hit) return { row: hit, by: 'username' };
    hit = list.find(function (t) { return user.name && norm(t.name) === norm(user.name); });
    if (hit) return { row: hit, by: 'name (weakest match)' };
    return null;
  }

  async function reloadClasses() {
    var res = await T.sb.from('classes').select('*');
    if (res.error) throw new Error('Could not read the classes table: ' + res.error.message);
    var me = T.teacher;
    T.classes = (res.data || []).filter(function (c) {
      if (c.teacher_id) return String(c.teacher_id) === String(me.id);
      return norm(c.teacher) === norm(me.name);   // older rows with no teacher_id
    }).sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
    var info = document.getElementById('tcClassInfo');
    if (info) info.textContent = T.classes.map(function (c) { return c.name; }).join(', ');
    return T.classes;
  }

  /* ---------- built-in Overview (replaced later by teacher-today.js, same id 'home') ---------- */
  function renderHome(el) {
    var first = (T.teacher.name || 'Teacher').split(' ')[0];
    var dateLabel = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    var cls = T.classes.length
      ? '<ul class="tc-list">' + T.classes.map(function (c) {
          return '<li><strong>' + esc(c.name) + '</strong><span class="muted-text">' + esc(c.room ? 'Room ' + c.room : '') + '</span></li>';
        }).join('') + '</ul>'
      : '<p class="muted-text">No classes are assigned to you yet. Ask the headmaster to assign one on the main dashboard.</p>';
    el.innerHTML =
      '<div class="page-header"><h2>Welcome, <span>' + esc(first) + '</span></h2><p>' + esc(dateLabel) + '</p></div>' +
      '<div class="card"><div class="card-header"><h3>Your classes</h3></div><div class="card-body">' + cls + '</div></div>' +
      '<div class="card"><div class="card-header"><h3>Connection check</h3></div><div class="card-body">' +
        '<p class="muted-text">Connected to the school database. Your login is linked to teacher record <strong>' + esc(T.teacher.name) +
        '</strong> (ID ' + esc(T.teacher.id) + '), matched by ' + esc(T.matchedBy) + '.</p></div></div>';
  }

  /* ---------- public API ---------- */
  var T = {
    sb: null, user: null, teacher: null, classes: [], matchedBy: '',
    esc: esc, today: today, dayName: dayName, norm: norm,
    toast: toast, confirm: confirmBox,
    register: register, go: go, reloadClasses: reloadClasses,
    logout: function () { try { localStorage.removeItem('currentUser'); } catch (e) {} location.href = 'login.html'; }
  };
  window.Teacher = T;

  function fatal(root, title, detail) {
    root.innerHTML = '<div class="tc-center"><div class="card" style="margin:0"><div class="card-body"><h3 style="margin-bottom:8px">' + esc(title) +
      '</h3><p class="muted-text">' + detail + '</p><div class="form-actions"><button class="btn" id="tcBackLogin">Back to login</button></div></div></div></div>';
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

    root.innerHTML = '<div class="tc-loading">Loading your dashboard…</div>';

    try {
      var found = await loadTeacher(user);
      if (!found) {
        fatal(root, 'Your login is not linked to a teacher record',
          'You are signed in as <strong>' + esc(user.name) + '</strong> (ID ' + esc(user.id) + '), but no teacher with that ID or name exists. ' +
          'Ask the headmaster to check your teacher profile on the main dashboard.');
        return;
      }
      T.teacher = found.row;
      T.matchedBy = found.by;

      buildShell(root);
      document.getElementById('tcName').textContent = T.teacher.name || user.name || 'Teacher';
      await reloadClasses();
    } catch (e) {
      console.error(e);
      fatal(root, 'Could not load your dashboard', esc(e.message || e));
      return;
    }

    // Built-in Overview, unless a section file (e.g. teacher-today.js) already registered 'home'.
    if (!sections.some(function (s) { return s.id === 'home'; })) {
      register({ id: 'home', title: 'Overview', icon: '🏠', order: 0, render: renderHome });
    }
    booted = true;
    buildNav();
    var want = (location.hash || '').replace('#', '');
    go(sections.some(function (s) { return s.id === want; }) ? want : sections[0].id);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
