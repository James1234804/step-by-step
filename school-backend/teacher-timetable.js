
/* =========================================================================
   teacher-timetable.js  —  "My timetable" section.
   Loads AFTER teacher-core.js. READ-ONLY: timetables are created and edited
   by the headmaster on the main dashboard; this page only displays the
   lessons assigned to the logged-in teacher, straight from Supabase.
   ========================================================================= */
(function () {
  'use strict';
  var T = window.Teacher;
  if (!T || !T.register) { console.error('teacher-timetable.js: teacher-core.js must load first.'); return; }
  var esc = T.esc;

  var ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  function pad(n) { return String(n).padStart(2, '0'); }
  function canonDay(d) {
    var n = T.norm(d).slice(0, 3);
    for (var i = 0; i < ORDER.length; i++) if (ORDER[i].toLowerCase().slice(0, 3) === n) return ORDER[i];
    return null;
  }
  // "08:00", "8:00", "8", "8:30 am", "1:15pm" -> minutes since midnight (null if unreadable)
  function toMin(s) {
    var m = String(s == null ? '' : s).trim().match(/^(\d{1,2})(?:[:.h](\d{2}))?\s*(am|pm)?$/i);
    if (!m) return null;
    var h = parseInt(m[1], 10), mi = m[2] ? parseInt(m[2], 10) : 0, ap = (m[3] || '').toLowerCase();
    if (ap === 'pm' && h < 12) h += 12;
    if (ap === 'am' && h === 12) h = 0;
    if (h > 23 || mi > 59) return null;
    return h * 60 + mi;
  }
  function fmt(min) { return pad(Math.floor(min / 60)) + ':' + pad(min % 60); }
  function nowMin() { var d = new Date(); return d.getHours() * 60 + d.getMinutes(); }

  /* ---------- data ---------- */
  async function load() {
    var res = await T.sb.from('timetables')
      .select('id,class,day,start_time,end_time,teacher,subject,room,teacher_id');
    if (res.error) throw new Error('Could not read the timetable: ' + res.error.message);
    var out = [], skipped = 0;
    (res.data || []).forEach(function (r) {
      var mine = (r.teacher_id && String(r.teacher_id) === String(T.teacher.id)) || T.isMine(r.teacher);
      if (!mine) return;
      var day = canonDay(r.day), s = toMin(r.start_time), e = toMin(r.end_time);
      if (!day || s == null) { skipped++; return; }
      if (e == null || e <= s) e = s + 45;
      out.push({ id: r.id, day: day, s: s, e: e, cls: r.class || '', subject: r.subject || 'Lesson', room: r.room || '' });
    });
    if (skipped) console.warn('Timetable: ' + skipped + ' entr' + (skipped === 1 ? 'y' : 'ies') + ' skipped (unreadable day or time).');
    return { lessons: out, skipped: skipped };
  }

  function byDay(lessons) {
    var map = {};
    ORDER.forEach(function (d) { map[d] = []; });
    lessons.forEach(function (l) { map[l.day].push(l); });
    ORDER.forEach(function (d) {
      var list = map[d].sort(function (a, b) { return a.s - b.s; });
      var maxEnd = -1, prev = null;
      list.forEach(function (l) {          // flag overlapping lessons so the headmaster can fix them
        if (prev && l.s < maxEnd) { l.clash = true; prev.clash = true; }
        if (l.e > maxEnd) { maxEnd = l.e; prev = l; }
      });
    });
    return map;
  }

  /* ---------- styles ---------- */
  function styles() {
    if (document.getElementById('tt-styles')) return;
    var s = document.createElement('style');
    s.id = 'tt-styles';
    s.textContent = [
      '.tt-bar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;margin-bottom:16px}',
      '.tt-seg,.tt-days{display:flex;gap:6px;flex-wrap:wrap}',
      '.tt-pill{border:1.5px solid var(--border,#e2e8f0);background:#fff;color:var(--navy,#1e2a78);border-radius:999px;padding:7px 14px;font:inherit;font-size:.85rem;font-weight:600;cursor:pointer}',
      '.tt-pill:hover{border-color:var(--orange,#ea8a1e)}',
      '.tt-pill.on{background:var(--navy,#1e2a78);border-color:var(--navy,#1e2a78);color:#fff}',
      '.tt-pill small{opacity:.7;margin-left:4px}',
      '.tt-pill:focus-visible{outline:2px solid var(--orange,#ea8a1e);outline-offset:2px}',
      '.tt-lesson{display:flex;align-items:center;gap:16px;padding:14px 4px;border-bottom:1px solid var(--border,#e2e8f0)}',
      '.tt-lesson:last-child{border-bottom:none}',
      '.tt-time{min-width:64px;display:flex;flex-direction:column;font-variant-numeric:tabular-nums}',
      '.tt-time b{font-size:1rem;color:var(--navy,#1e2a78)}.tt-time span{font-size:.8rem;color:var(--text-muted,#64748b)}',
      '.tt-body{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}',
      '.tt-body span{font-size:.85rem;color:var(--text-muted,#64748b)}',
      '.tt-lesson.now{background:#fff6ea;border-radius:10px;padding-left:12px;padding-right:12px;border-bottom-color:transparent}',
      '.tt-lesson.done{opacity:.55}',
      '.tt-badge{font-size:.72rem;font-weight:700;padding:4px 10px;border-radius:999px;background:#eef1fb;color:var(--navy,#1e2a78);white-space:nowrap}',
      '.tt-badge.now{background:var(--orange,#ea8a1e);color:#fff}',
      '.tt-badge.clash{background:#fee2e2;color:#b91c1c}',
      '.tt-empty{padding:2.5rem 1rem;text-align:center;color:var(--text-muted,#64748b)}',
      '.tt-empty strong{display:block;color:var(--navy,#1e2a78);margin-bottom:6px;font-size:1rem}',
      '.tt-today h3::after{content:" · Today";color:var(--orange,#ea8a1e);font-weight:600}',
      '@media (max-width:520px){.tt-lesson{gap:10px}.tt-time{min-width:54px}}'
    ].join('\n');
    document.head.appendChild(s);
  }

  /* ---------- render ---------- */
  function lessonHtml(l, status) {
    var meta = [l.cls, l.room ? 'Room ' + l.room : ''].filter(Boolean).map(esc).join(' · ');
    var badge = l.clash ? '<span class="tt-badge clash" title="Overlaps another of your lessons. Ask the headmaster to check.">Clash</span>'
      : status === 'now' ? '<span class="tt-badge now">Now</span>'
      : status === 'next' ? '<span class="tt-badge">Next</span>' : '';
    return '<div class="tt-lesson ' + (status === 'now' ? 'now' : status === 'done' ? 'done' : '') + '">' +
      '<div class="tt-time"><b>' + fmt(l.s) + '</b><span>' + fmt(l.e) + '</span></div>' +
      '<div class="tt-body"><strong>' + esc(l.subject) + '</strong><span>' + (meta || 'No class set') + '</span></div>' + badge + '</div>';
  }

  function statuses(list, isToday) {
    var out = list.map(function () { return ''; });
    if (!isToday) return out;
    var n = nowMin(), nextSet = false;
    list.forEach(function (l, i) {
      if (n >= l.e) out[i] = 'done';
      else if (n >= l.s) out[i] = 'now';
      else if (!nextSet) { out[i] = 'next'; nextSet = true; }
    });
    return out;
  }

  function dayCard(day, list, isToday) {
    var st = statuses(list, isToday);
    var body = list.length ? list.map(function (l, i) { return lessonHtml(l, st[i]); }).join('')
      : '<div class="tt-empty"><strong>No lessons on ' + esc(day) + '</strong>Lessons the headmaster adds to your timetable will appear here.</div>';
    return '<div class="card ' + (isToday ? 'tt-today' : '') + '"><div class="card-header"><h3>' + esc(day) + '</h3>' +
      '<span class="muted-text">' + list.length + (list.length === 1 ? ' lesson' : ' lessons') + '</span></div><div class="card-body">' + body + '</div></div>';
  }

  async function render(el) {
    styles();
    var state = { view: 'day', day: null, data: await load() };
    var todayName = T.dayName();
    state.day = ORDER.indexOf(todayName) >= 0 ? todayName : 'Monday';

    function draw() {
      var map = byDay(state.data.lessons);
      var total = state.data.lessons.length;
      var days = ORDER.filter(function (d) { return d !== 'Sunday' || map.Sunday.length; });
      var classes = {};
      state.data.lessons.forEach(function (l) { if (l.cls) classes[l.cls] = 1; });

      var header = '<div class="page-header"><h2>My <span>timetable</span></h2><p>' + total + (total === 1 ? ' lesson' : ' lessons') +
        ' a week across ' + Object.keys(classes).length + (Object.keys(classes).length === 1 ? ' class' : ' classes') + '. Set by the headmaster.</p></div>';

      var bar = '<div class="tt-bar no-print"><div class="tt-seg">' +
        '<button class="tt-pill ' + (state.view === 'day' ? 'on' : '') + '" data-view="day">Day</button>' +
        '<button class="tt-pill ' + (state.view === 'week' ? 'on' : '') + '" data-view="week">Full week</button></div>' +
        '<div class="tt-seg"><button class="tt-pill" data-act="refresh">Refresh</button><button class="tt-pill" data-act="print">Print</button></div></div>';

      var content = '';
      if (!total) {
        content = '<div class="card"><div class="card-body"><div class="tt-empty"><strong>No lessons on your timetable yet</strong>' +
          'When the headmaster adds lessons for you on the main dashboard, they will appear here.</div></div></div>';
      } else if (state.view === 'day') {
        content = '<div class="tt-days no-print" style="margin-bottom:14px">' + days.map(function (d) {
          return '<button class="tt-pill ' + (d === state.day ? 'on' : '') + '" data-day="' + d + '">' + d.slice(0, 3) +
            '<small>' + map[d].length + '</small></button>';
        }).join('') + '</div>' + dayCard(state.day, map[state.day], state.day === todayName);
      } else {
        content = days.map(function (d) { return dayCard(d, map[d], d === todayName); }).join('');
      }
      var note = state.data.skipped
        ? '<p class="muted-text" style="margin-top:10px">' + state.data.skipped + ' timetable entr' + (state.data.skipped === 1 ? 'y was' : 'ies were') + ' hidden because the day or start time could not be read. Ask the headmaster to check.</p>' : '';
      el.innerHTML = header + bar + content + note;
    }

    el.addEventListener('click', async function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.dataset.view) { state.view = b.dataset.view; draw(); }
      else if (b.dataset.day) { state.day = b.dataset.day; draw(); }
      else if (b.dataset.act === 'print') { window.print(); }
      else if (b.dataset.act === 'refresh') {
        b.disabled = true;
        try { state.data = await load(); draw(); T.toast('Timetable updated', 'success'); }
        catch (err) { T.toast(err.message, 'error'); b.disabled = false; }
      }
    });

    draw();
    var seen = false;
    var iv = setInterval(function () {       // keep Now / Next / Done current
      if (document.body.contains(el)) seen = true;
      else { if (seen) clearInterval(iv); return; }
      if (state.data.lessons.length && (state.view === 'week' || state.day === todayName)) draw();
    }, 60000);
  }

  T.register({ id: 'timetable', title: 'My timetable', icon: '🗓️', order: 10, render: render });
})();
