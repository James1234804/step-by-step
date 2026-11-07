 /* =========================================================================
   teacher-timetable.js  —  "My timetable" section (v2).
   Loads AFTER teacher-core.js. READ-ONLY: the headmaster creates timetables on
   the main dashboard; this page only shows the logged-in teacher's own lessons
   from Supabase. Includes: Now/Next banner, weekly grid, subject colours.
   ========================================================================= */
(function () {
  'use strict';
  var T = window.Teacher;
  if (!T || !T.register) { console.error('teacher-timetable.js: teacher-core.js must load first.'); return; }
  var esc = T.esc;
  var ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  var PALETTE = [['#e8efff', '#1e40af'], ['#e3f6ea', '#166534'], ['#fff1e0', '#9a4a00'], ['#f0e8ff', '#5b21b6'],
                 ['#dff5f3', '#0f766e'], ['#ffe8ef', '#9d174d'], ['#fdf6d8', '#854d0e'], ['#e8edf3', '#334155']];
  var K = 1.1; // grid scale: pixels per minute

  function pad(n) { return String(n).padStart(2, '0'); }
  function colour(subject) {
    var n = T.norm(subject), h = 0;
    for (var i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) >>> 0;
    return PALETTE[h % PALETTE.length];
  }
  function canonDay(d) {
    var n = T.norm(d).slice(0, 3);
    for (var i = 0; i < ORDER.length; i++) if (ORDER[i].toLowerCase().slice(0, 3) === n) return ORDER[i];
    return null;
  }
  function toMin(s) { // "08:00", "8", "8:30 am", "1:15pm" -> minutes (null if unreadable)
    var m = String(s == null ? '' : s).trim().match(/^(\d{1,2})(?:[:.h](\d{2}))?\s*(am|pm)?$/i);
    if (!m) return null;
    var h = parseInt(m[1], 10), mi = m[2] ? parseInt(m[2], 10) : 0, ap = (m[3] || '').toLowerCase();
    if (ap === 'pm' && h < 12) h += 12;
    if (ap === 'am' && h === 12) h = 0;
    return (h > 23 || mi > 59) ? null : h * 60 + mi;
  }
  function fmt(min) { return pad(Math.floor(min / 60)) + ':' + pad(min % 60); }
  function nowMin() { var d = new Date(); return d.getHours() * 60 + d.getMinutes(); }
  function dur(m) {
    if (m < 1) return 'under a minute';
    if (m < 60) return m + ' min';
    var h = Math.floor(m / 60), r = m % 60;
    return h + ' h' + (r ? ' ' + r + ' min' : '');
  }

  /* ---------- data ---------- */
  async function load() {
    var res = await T.sb.from('timetables').select('id,class,day,start_time,end_time,teacher,subject,room,teacher_id');
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
    return { lessons: out, skipped: skipped };
  }

  function byDay(lessons) {
    var map = {};
    ORDER.forEach(function (d) { map[d] = []; });
    lessons.forEach(function (l) { map[l.day].push(l); });
    ORDER.forEach(function (d) {
      var list = map[d].sort(function (a, b) { return a.s - b.s; }), maxEnd = -1, prev = null;
      list.forEach(function (l) {
        if (prev && l.s < maxEnd) { l.clash = true; prev.clash = true; }
        if (l.e > maxEnd) { maxEnd = l.e; prev = l; }
      });
    });
    return map;
  }

  function findNow(map, today) {
    var n = nowMin();
    return map[today].find(function (l) { return l.s <= n && n < l.e; }) || null;
  }
  function findNext(map, today) {
    var n = nowMin(), ti = ORDER.indexOf(today);
    for (var o = 0; o <= 7; o++) {
      var d = ORDER[(ti + o) % 7], list = map[d];
      for (var i = 0; i < list.length; i++) {
        if (o === 0 && list[i].s <= n) continue;
        return { l: list[i], day: d, offset: o, mins: o * 1440 + list[i].s - n };
      }
    }
    return null;
  }

  /* ---------- styles ---------- */
  function styles() {
    if (document.getElementById('tt-styles')) return;
    var s = document.createElement('style');
    s.id = 'tt-styles';
    s.textContent = [
      '.tt-hero{display:flex;flex-wrap:wrap;gap:14px 24px;align-items:center;justify-content:space-between;background:linear-gradient(135deg,var(--navy,#1e2a78),#3b4ba8);color:#fff;border-radius:16px;padding:20px 22px;margin-bottom:16px}',
      '.tt-hero>div:first-child{flex:1;min-width:200px}.tt-hero small{opacity:.85;font-size:.82rem}',
      '.tt-hero h3{font-size:1.35rem;margin:3px 0 4px;color:#fff}',
      '.tt-count{background:var(--orange,#ea8a1e);color:#fff;border-radius:12px;padding:10px 16px;font-weight:700;white-space:nowrap}',
      '.tt-prog{height:5px;background:rgba(255,255,255,.25);border-radius:9px;margin-top:12px;overflow:hidden;max-width:320px}.tt-prog i{display:block;height:100%;background:#fff}',
      '.tt-bar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;margin-bottom:14px}',
      '.tt-seg,.tt-days{display:flex;gap:6px;flex-wrap:wrap}',
      '.tt-pill{border:1.5px solid var(--border,#e2e8f0);background:#fff;color:var(--navy,#1e2a78);border-radius:999px;padding:8px 15px;min-height:40px;font:inherit;font-size:.85rem;font-weight:600;cursor:pointer}',
      '.tt-pill:hover{border-color:var(--orange,#ea8a1e)}.tt-pill.on{background:var(--navy,#1e2a78);border-color:var(--navy,#1e2a78);color:#fff}',
      '.tt-pill small{opacity:.7;margin-left:5px}.tt-pill:focus-visible{outline:2px solid var(--orange,#ea8a1e);outline-offset:2px}',
      '.tt-lesson{display:flex;align-items:center;gap:14px;padding:12px 12px;margin:6px 0;border-radius:12px;border-left:4px solid}',
      '.tt-time{min-width:60px;display:flex;flex-direction:column;font-variant-numeric:tabular-nums}.tt-time b{font-size:1rem}.tt-time span{font-size:.8rem;opacity:.75}',
      '.tt-body{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}.tt-body span{font-size:.85rem;opacity:.85}',
      '.tt-lesson.now{box-shadow:0 0 0 2px var(--orange,#ea8a1e)}.tt-lesson.done{opacity:.5}',
      '.tt-badge{font-size:.72rem;font-weight:700;padding:4px 10px;border-radius:999px;background:#fff;color:var(--navy,#1e2a78);white-space:nowrap}',
      '.tt-badge.now{background:var(--orange,#ea8a1e);color:#fff}.tt-badge.clash{background:#fee2e2;color:#b91c1c}',
      '.tt-empty{padding:2.5rem 1rem;text-align:center;color:var(--text-muted,#64748b)}.tt-empty strong{display:block;color:var(--navy,#1e2a78);margin-bottom:6px;font-size:1rem}',
      '.tt-gridwrap{overflow-x:auto;background:#fff;border:1px solid var(--border,#e2e8f0);border-radius:14px}',
      '.tt-grid{display:grid;min-width:640px}',
      '.tt-h{padding:10px 6px;text-align:center;font-weight:700;font-size:.85rem;color:var(--navy,#1e2a78);border-bottom:1px solid var(--border,#e2e8f0)}',
      '.tt-h small{display:block;font-weight:500;opacity:.65}.tt-h.today{background:#fff6ea;color:var(--orange,#c96f0c)}',
      '.tt-gut,.tt-col{position:relative}.tt-gut span{position:absolute;right:6px;transform:translateY(-50%);font-size:.7rem;color:var(--text-muted,#64748b)}',
      '.tt-col{border-left:1px solid var(--border,#e2e8f0);background-image:linear-gradient(var(--border,#e2e8f0) 1px,transparent 1px)}',
      '.tt-col.today{background-color:#fffaf2}',
      '.tt-blk{position:absolute;left:3px;right:3px;border-radius:8px;border-left:3px solid;padding:4px 6px;overflow:hidden;font-size:.75rem;line-height:1.25}',
      '.tt-blk b{display:block;font-size:.8rem}.tt-blk.clash{outline:2px solid #dc2626}',
      '.tt-nowline{position:absolute;left:0;right:0;height:2px;background:#dc2626;z-index:2}',
      '.tt-legend{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}.tt-legend span{font-size:.78rem;font-weight:600;padding:4px 10px;border-radius:999px}',
      '@media (max-width:600px){.tt-hero{padding:16px}.tt-hero h3{font-size:1.15rem}.tt-pill{min-height:44px}.tt-lesson{gap:10px;padding:12px 10px}.tt-time{min-width:52px}}'
    ].join('\n');
    document.head.appendChild(s);
  }

  /* ---------- pieces ---------- */
  function heroHtml(map, today) {
    var n = nowMin(), now = findNow(map, today), nx = findNext(map, today), label, title, meta, big, prog = '', then = '';
    if (now) {
      label = 'Teaching now'; title = now.subject; meta = [now.cls, now.room ? 'Room ' + now.room : ''].filter(Boolean).join(' · ');
      big = 'Ends in ' + dur(now.e - n);
      prog = '<div class="tt-prog"><i style="width:' + Math.round((n - now.s) / (now.e - now.s) * 100) + '%"></i></div>';
      if (nx && nx.offset === 0) then = '<small>Then ' + esc(nx.l.subject) + ' at ' + fmt(nx.l.s) + '</small>';
    } else if (nx) {
      var l = nx.l;
      label = nx.offset === 0 ? 'Next lesson' : 'Done for today. Next lesson';
      title = l.subject; meta = [l.cls, l.room ? 'Room ' + l.room : ''].filter(Boolean).join(' · ');
      big = nx.offset === 0 ? 'Starts in ' + dur(nx.mins) : (nx.offset === 1 ? 'Tomorrow' : nx.day) + ' at ' + fmt(l.s);
    } else return '';
    return '<div><small>' + esc(label) + '</small><h3>' + esc(title) + '</h3><small>' + esc(meta || 'No class set') + '</small>' + prog + (then ? '<div style="margin-top:8px">' + then + '</div>' : '') +
      '</div><div class="tt-count">' + esc(big) + '</div>';
  }

  function lessonHtml(l, status) {
    var c = colour(l.subject), meta = [l.cls, l.room ? 'Room ' + l.room : ''].filter(Boolean).map(esc).join(' · ');
    var badge = l.clash ? '<span class="tt-badge clash" title="Overlaps another of your lessons">Clash</span>'
      : status === 'now' ? '<span class="tt-badge now">Now</span>' : status === 'next' ? '<span class="tt-badge">Next</span>' : '';
    return '<div class="tt-lesson ' + (status === 'now' ? 'now' : status === 'done' ? 'done' : '') + '" style="background:' + c[0] + ';color:' + c[1] + ';border-left-color:' + c[1] + '">' +
      '<div class="tt-time"><b>' + fmt(l.s) + '</b><span>' + fmt(l.e) + '</span></div>' +
      '<div class="tt-body"><strong>' + esc(l.subject) + '</strong><span>' + (meta || 'No class set') + '</span></div>' + badge + '</div>';
  }

  function dayHtml(day, list, isToday) {
    var n = nowMin(), nextSet = false;
    var body = list.length ? list.map(function (l) {
      var st = '';
      if (isToday) { if (n >= l.e) st = 'done'; else if (n >= l.s) st = 'now'; else if (!nextSet) { st = 'next'; nextSet = true; } }
      return lessonHtml(l, st);
    }).join('') : '<div class="tt-empty"><strong>No lessons on ' + esc(day) + '</strong>Lessons the headmaster adds to your timetable appear here.</div>';
    return '<div class="card"><div class="card-header"><h3>' + esc(day) + (isToday ? ' · Today' : '') + '</h3><span class="muted-text">' +
      list.length + (list.length === 1 ? ' lesson' : ' lessons') + '</span></div><div class="card-body">' + body + '</div></div>';
  }

  function gridHtml(map, days, today, lessons) {
    var lo = Math.floor(Math.min.apply(null, lessons.map(function (l) { return l.s; })) / 60) * 60;
    var hi = Math.ceil(Math.max.apply(null, lessons.map(function (l) { return l.e; })) / 60) * 60;
    if (hi - lo < 240) hi = lo + 240;
    var H = (hi - lo) * K, n = nowMin(), labels = '', hs = '', cols = '', subjects = {};
    for (var m = lo; m <= hi; m += 60) labels += '<span style="top:' + ((m - lo) * K) + 'px">' + fmt(m) + '</span>';
    days.forEach(function (d) {
      var isT = d === today;
      hs += '<div class="tt-h ' + (isT ? 'today' : '') + '">' + d.slice(0, 3) + '<small>' + map[d].length + '</small></div>';
      var blocks = map[d].map(function (l) {
        var c = colour(l.subject); subjects[l.subject] = c;
        return '<div class="tt-blk ' + (l.clash ? 'clash' : '') + '" style="top:' + ((l.s - lo) * K) + 'px;height:' + Math.max(22, (l.e - l.s) * K - 2) + 'px;background:' + c[0] + ';color:' + c[1] + ';border-left-color:' + c[1] + '" title="' +
          esc(l.subject + ' · ' + l.cls + ' · ' + fmt(l.s) + '-' + fmt(l.e)) + '"><b>' + esc(l.subject) + '</b>' + esc(l.cls) + (l.room ? ' · ' + esc(l.room) : '') + '</div>';
      }).join('');
      var line = (isT && n >= lo && n < hi) ? '<div class="tt-nowline" style="top:' + ((n - lo) * K) + 'px"></div>' : '';
      cols += '<div class="tt-col ' + (isT ? 'today' : '') + '" style="height:' + H + 'px;background-size:100% ' + (60 * K) + 'px">' + blocks + line + '</div>';
    });
    var legend = Object.keys(subjects).sort().map(function (s) {
      return '<span style="background:' + subjects[s][0] + ';color:' + subjects[s][1] + '">' + esc(s) + '</span>';
    }).join('');
    return '<div class="tt-gridwrap"><div class="tt-grid" style="grid-template-columns:48px repeat(' + days.length + ',minmax(104px,1fr))">' +
      '<div class="tt-h"></div>' + hs + '<div class="tt-gut" style="height:' + H + 'px">' + labels + '</div>' + cols + '</div></div><div class="tt-legend">' + legend + '</div>';
  }

  /* ---------- render ---------- */
  async function render(el) {
    styles();
    var today = T.dayName();
    var state = { view: window.innerWidth >= 900 ? 'week' : 'day', day: ORDER.indexOf(today) >= 0 ? today : 'Monday', data: await load() };

    function draw() {
      var lessons = state.data.lessons, total = lessons.length, map = byDay(lessons);
      var days = ORDER.filter(function (d) { return d !== 'Sunday' || map.Sunday.length; });
      var cl = {}; lessons.forEach(function (l) { if (l.cls) cl[l.cls] = 1; });
      var nc = Object.keys(cl).length;
      var html = '<div class="page-header"><h2>My <span>timetable</span></h2><p>' + total + (total === 1 ? ' lesson' : ' lessons') + ' a week across ' + nc + (nc === 1 ? ' class' : ' classes') + '. Set by the headmaster.</p></div>';
      if (!total) {
        html += '<div class="card"><div class="card-body"><div class="tt-empty"><strong>No lessons on your timetable yet</strong>When the headmaster adds lessons for you on the main dashboard, they will appear here.</div></div></div>';
      } else {
        html += '<div class="tt-hero" id="ttHero">' + heroHtml(map, today) + '</div>';
        html += '<div class="tt-bar no-print"><div class="tt-seg"><button class="tt-pill ' + (state.view === 'week' ? 'on' : '') + '" data-view="week">Week</button>' +
          '<button class="tt-pill ' + (state.view === 'day' ? 'on' : '') + '" data-view="day">Day</button></div>' +
          '<div class="tt-seg"><button class="tt-pill" data-act="refresh">Refresh</button><button class="tt-pill" data-act="print">Print</button></div></div>';
        if (state.view === 'day') {
          html += '<div class="tt-days no-print" style="margin-bottom:12px">' + days.map(function (d) {
            return '<button class="tt-pill ' + (d === state.day ? 'on' : '') + '" data-day="' + d + '">' + d.slice(0, 3) + '<small>' + map[d].length + '</small></button>';
          }).join('') + '</div><div id="ttMain">' + dayHtml(state.day, map[state.day], state.day === today) + '</div>';
        } else html += '<div id="ttMain">' + gridHtml(map, days, today, lessons) + '</div>';
      }
      if (state.data.skipped) html += '<p class="muted-text" style="margin-top:10px">' + state.data.skipped + ' timetable entr' + (state.data.skipped === 1 ? 'y was' : 'ies were') + ' hidden because the day or start time could not be read. Ask the headmaster to check.</p>';
      el.innerHTML = html;
    }

    el.addEventListener('click', async function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.dataset.view) { state.view = b.dataset.view; draw(); }
      else if (b.dataset.day) { state.day = b.dataset.day; draw(); }
      else if (b.dataset.act === 'print') window.print();
      else if (b.dataset.act === 'refresh') {
        b.disabled = true;
        try { state.data = await load(); draw(); T.toast('Timetable updated', 'success'); }
        catch (err) { T.toast(err.message, 'error'); b.disabled = false; }
      }
    });

    draw();
    var seen = false;
    var iv = setInterval(function () { // keep countdown, Now/Next and the red time line current
      if (document.body.contains(el)) seen = true; else { if (seen) clearInterval(iv); return; }
      if (!state.data.lessons.length) return;
      var map = byDay(state.data.lessons), hero = el.querySelector('#ttHero'), main = el.querySelector('#ttMain');
      if (hero) hero.innerHTML = heroHtml(map, today);
      if (state.view === 'day' && state.day === today && main) main.innerHTML = dayHtml(today, map[today], true);
      var line = el.querySelector('.tt-nowline');
      if (line) { var lo = Math.floor(Math.min.apply(null, state.data.lessons.map(function (l) { return l.s; })) / 60) * 60; line.style.top = ((nowMin() - lo) * K) + 'px'; }
    }, 30000);
  }

  T.register({ id: 'timetable', title: 'My timetable', icon: '🗓️', order: 10, render: render });
})();
