 /* =========================================================================
   teacher-attendance.js  —  "Attendance" section.
   Loads AFTER teacher-core.js. Teachers mark Present / Absent for their own
   classes. Saves to Supabase table `attendance` (upsert only, never deletes)
   and updates the headmaster's live-attendance feed (settings key
   'attendanceNotifications'). Late arrivals count as Absent.
   ========================================================================= */
(function () {
  'use strict';
  var T = window.Teacher;
  if (!T || !T.register) { console.error('teacher-attendance.js: teacher-core.js must load first.'); return; }
  var esc = T.esc;

  function slug(s) { return String(s).replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, ''); }
  function nice(d) { return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }); }
  function daysAgo(n) { var d = new Date(); d.setDate(d.getDate() - n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

  /* ---------- data ---------- */
  async function loadRegister(cls, date) {
    var r = await Promise.all([
      T.sb.from('students').select('id,name,gender,status').eq('class', cls),
      T.sb.from('attendance').select('id,student_id,status,note').eq('class', cls).eq('date', date)
    ]);
    if (r[0].error) throw new Error('Could not read students: ' + r[0].error.message);
    if (r[1].error) throw new Error('Could not read attendance: ' + r[1].error.message);
    var students = (r[0].data || []).filter(function (s) { return (s.status || 'Active') === 'Active'; })
      .sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
    var existing = {};
    (r[1].data || []).forEach(function (a) { if (!existing[a.student_id]) existing[a.student_id] = a; });
    return { students: students, existing: existing };
  }

  async function notifyHeadmaster(cls, date, present, total) {
    var res = await T.sb.from('settings').select('value').eq('key', 'attendanceNotifications').maybeSingle();
    var list = [];
    try { list = JSON.parse(res.data && res.data.value) || []; } catch (e) { list = []; }
    if (!Array.isArray(list)) list = [];
    var id = 'ATN_' + date + '_' + slug(cls);
    list = list.filter(function (n) { return n.id !== id; });
    list.push({ id: id, class: cls, date: date, teacher: T.teacher.name, presentCount: present, totalCount: total,
      timestamp: date === T.today() ? Date.now() : new Date(date + 'T23:00:00').getTime() });
    var up = await T.sb.from('settings').upsert({ key: 'attendanceNotifications', value: JSON.stringify(list.slice(-200)) });
    if (up.error) throw new Error(up.error.message);
  }

  async function loadHistory(cls) {
    var res = await T.sb.from('attendance').select('date,status').eq('class', cls).gte('date', daysAgo(30)).order('date', { ascending: false });
    if (res.error) throw new Error('Could not read history: ' + res.error.message);
    var map = {};
    (res.data || []).forEach(function (a) {
      var d = map[a.date] || (map[a.date] = { date: a.date, p: 0, a: 0 });
      if (T.norm(a.status) === 'present') d.p++; else d.a++;
    });
    return Object.keys(map).sort().reverse().map(function (k) { return map[k]; });
  }

  /* ---------- styles ---------- */
  function styles() {
    if (document.getElementById('at-styles')) return;
    var s = document.createElement('style');
    s.id = 'at-styles';
    s.textContent = [
      '.at-bar{display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end;margin-bottom:14px}',
      '.at-bar label{display:flex;flex-direction:column;gap:4px;font-size:.78rem;font-weight:600;color:var(--text-muted,#64748b)}',
      '.at-bar select,.at-bar input{font:inherit;font-size:.9rem;padding:9px 12px;min-height:42px;border:1.5px solid var(--border,#e2e8f0);border-radius:10px;background:#fff;color:var(--navy,#1e2a78)}',
      '.at-tabs{display:flex;gap:6px;margin-bottom:14px}',
      '.at-pill{border:1.5px solid var(--border,#e2e8f0);background:#fff;color:var(--navy,#1e2a78);border-radius:999px;padding:8px 15px;min-height:42px;font:inherit;font-size:.85rem;font-weight:600;cursor:pointer}',
      '.at-pill.on{background:var(--navy,#1e2a78);border-color:var(--navy,#1e2a78);color:#fff}.at-pill:disabled{opacity:.5;cursor:not-allowed}',
      '.at-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px}',
      '.at-stat{background:#fff;border:1px solid var(--border,#e2e8f0);border-radius:12px;padding:12px;text-align:center}',
      '.at-stat b{display:block;font-size:1.4rem;color:var(--navy,#1e2a78)}.at-stat span{font-size:.75rem;color:var(--text-muted,#64748b)}',
      '.at-stat.p b{color:#16a34a}.at-stat.a b{color:#dc2626}',
      '.at-note{background:#eef1fb;color:var(--navy,#1e2a78);border-radius:10px;padding:10px 14px;font-size:.85rem;margin-bottom:12px}',
      '.at-note.warn{background:#fff6ea}',
      '.at-row{display:flex;flex-wrap:wrap;align-items:center;gap:10px 14px;padding:11px 4px;border-bottom:1px solid var(--border,#e2e8f0)}',
      '.at-row:last-child{border-bottom:none}',
      '.at-av{width:38px;height:38px;border-radius:50%;background:#eef1fb;color:var(--navy,#1e2a78);display:flex;align-items:center;justify-content:center;font-weight:700;flex:none}',
      '.at-who{flex:1;min-width:140px;display:flex;flex-direction:column}.at-who span{font-size:.78rem;color:var(--text-muted,#64748b)}',
      '.at-toggle{display:flex;gap:6px}',
      '.at-opt{border:1.5px solid var(--border,#e2e8f0);background:#fff;border-radius:10px;padding:8px 16px;min-height:42px;min-width:84px;font:inherit;font-size:.85rem;font-weight:700;cursor:pointer;color:var(--text-muted,#64748b)}',
      '.at-opt.p.on{background:#16a34a;border-color:#16a34a;color:#fff}.at-opt.a.on{background:#dc2626;border-color:#dc2626;color:#fff}',
      '.at-reason{flex:1 1 100%;font:inherit;font-size:.85rem;padding:8px 12px;border:1.5px solid var(--border,#e2e8f0);border-radius:10px}',
      '.at-actions{display:flex;flex-wrap:wrap;gap:10px;justify-content:space-between;align-items:center;margin-top:14px}',
      '.at-hist{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:12px 4px;border-bottom:1px solid var(--border,#e2e8f0);cursor:pointer;background:none;border-left:0;border-right:0;border-top:0;width:100%;font:inherit;text-align:left}',
      '.at-empty{padding:2.5rem 1rem;text-align:center;color:var(--text-muted,#64748b)}.at-empty strong{display:block;color:var(--navy,#1e2a78);margin-bottom:6px}',
      '@media (max-width:600px){.at-stats{grid-template-columns:repeat(2,1fr)}.at-toggle{width:100%}.at-opt{flex:1}}'
    ].join('\n');
    document.head.appendChild(s);
  }

  /* ---------- render ---------- */
  async function render(el) {
    styles();
    if (!T.classes.length) {
      el.innerHTML = '<div class="page-header"><h2>Attendance</h2></div><div class="card"><div class="card-body"><div class="at-empty"><strong>No classes assigned to you yet</strong>Ask the headmaster to assign you a class on the main dashboard.</div></div></div>';
      return;
    }
    var S = { cls: T.classes[0].name, date: T.today(), tab: 'mark', students: [], existing: {}, marks: {}, notes: {}, history: [], saving: false, err: '' };

    async function fetchAll() {
      el.querySelector('#atBody').innerHTML = '<div class="tc-loading">Loading…</div>';
      try {
        if (S.tab === 'history') { S.history = await loadHistory(S.cls); }
        else {
          var r = await loadRegister(S.cls, S.date);
          S.students = r.students; S.existing = r.existing; S.marks = {}; S.notes = {};
          r.students.forEach(function (st) {
            var ex = r.existing[st.id];
            if (ex) { S.marks[st.id] = T.norm(ex.status) === 'present' ? 'present' : 'absent'; if (ex.note) S.notes[st.id] = ex.note; }
          });
        }
        S.err = '';
      } catch (e) { S.err = e.message; }
      paint();
    }

    function counts() {
      var p = 0, a = 0;
      S.students.forEach(function (st) { if (S.marks[st.id] === 'present') p++; else if (S.marks[st.id] === 'absent') a++; });
      return { p: p, a: a, u: S.students.length - p - a, total: S.students.length };
    }

    function paint() {
      var body = el.querySelector('#atBody');
      if (S.err) { body.innerHTML = '<div class="card"><div class="card-body"><strong>Something went wrong.</strong><p class="muted-text" style="margin-top:6px">' + esc(S.err) + '</p></div></div>'; return; }
      if (S.tab === 'history') {
        body.innerHTML = '<div class="card"><div class="card-header"><h3>Last 30 days · ' + esc(S.cls) + '</h3></div><div class="card-body">' +
          (S.history.length ? S.history.map(function (h) {
            var tot = h.p + h.a, rate = tot ? Math.round(h.p / tot * 100) : 0;
            return '<button class="at-hist" data-open="' + esc(h.date) + '"><span><strong>' + esc(nice(h.date)) + '</strong></span><span class="muted-text">' + h.p + ' present · ' + h.a + ' absent · ' + rate + '%</span></button>';
          }).join('') : '<div class="at-empty"><strong>No registers in the last 30 days</strong>Registers you submit will be listed here.</div>') + '</div></div>';
        return;
      }
      var c = counts(), already = Object.keys(S.existing).length > 0, past = S.date !== T.today();
      var note = (already ? '<div class="at-note">A register was already submitted for this date. Saving will update it.</div>' : '') +
                 (past && !already ? '<div class="at-note warn">You are marking a past date: ' + esc(nice(S.date)) + '.</div>' : '');
      if (!c.total) { body.innerHTML = note + '<div class="card"><div class="card-body"><div class="at-empty"><strong>No active students in ' + esc(S.cls) + '</strong>Students added to this class on the main dashboard will appear here.</div></div></div>'; return; }
      var rate = (c.p + c.a) ? Math.round(c.p / (c.p + c.a) * 100) : 0;
      var rows = S.students.map(function (st) {
        var m = S.marks[st.id];
        return '<div class="at-row"><div class="at-av">' + esc((st.name || '?').trim().charAt(0).toUpperCase()) + '</div>' +
          '<div class="at-who"><strong>' + esc(st.name) + '</strong><span>' + esc(st.id) + (st.gender ? ' · ' + esc(st.gender) : '') + '</span></div>' +
          '<div class="at-toggle"><button class="at-opt p ' + (m === 'present' ? 'on' : '') + '" data-mark="present" data-sid="' + esc(st.id) + '" aria-pressed="' + (m === 'present') + '">Present</button>' +
          '<button class="at-opt a ' + (m === 'absent' ? 'on' : '') + '" data-mark="absent" data-sid="' + esc(st.id) + '" aria-pressed="' + (m === 'absent') + '">Absent</button></div>' +
          (m === 'absent' ? '<input class="at-reason" data-note="' + esc(st.id) + '" maxlength="120" placeholder="Reason (optional), e.g. sick, late arrival" value="' + esc(S.notes[st.id] || '') + '">' : '') + '</div>';
      }).join('');
      body.innerHTML = note +
        '<div class="at-stats"><div class="at-stat p"><b>' + c.p + '</b><span>Present</span></div><div class="at-stat a"><b>' + c.a + '</b><span>Absent</span></div>' +
        '<div class="at-stat"><b>' + c.u + '</b><span>Not marked</span></div><div class="at-stat"><b>' + rate + '%</b><span>Attendance</span></div></div>' +
        '<div class="card"><div class="card-body">' + rows + '</div></div>' +
        '<div class="at-actions no-print"><div><button class="at-pill" data-act="allp">Mark all present</button> <button class="at-pill" data-act="reset">Clear</button></div>' +
        '<div><span class="muted-text" style="margin-right:10px">' + (c.u ? c.u + ' still to mark' : 'Ready to send') + '</span>' +
        '<button class="at-pill on" data-act="save"' + (c.u || S.saving ? ' disabled' : '') + '>' + (S.saving ? 'Saving…' : 'Save and send to headmaster') + '</button></div></div>';
    }

    async function save() {
      var c = counts();
      if (c.u || S.saving) return;
      if (!T.classes.some(function (x) { return x.name === S.cls; })) { T.toast('You can only mark your own classes.', 'error'); return; }
      S.saving = true; paint();
      var rows = S.students.map(function (st) {
        var ex = S.existing[st.id], m = S.marks[st.id];
        return { id: ex ? ex.id : 'ATT_' + S.date + '_' + slug(S.cls) + '_' + st.id, student_id: st.id, class: S.cls, date: S.date,
          status: m, teacher: T.teacher.name, note: m === 'absent' ? (S.notes[st.id] || '') : '' };
      });
      try {
        var up = await T.sb.from('attendance').upsert(rows, { onConflict: 'id' });
        if (up.error) throw new Error(up.error.message);
      } catch (e) { S.saving = false; paint(); T.toast('Not saved: ' + e.message, 'error'); return; }
      try { await notifyHeadmaster(S.cls, S.date, c.p, c.total); T.toast('Register sent: ' + c.p + '/' + c.total + ' present in ' + S.cls, 'success'); }
      catch (e) { T.toast('Register saved, but the headmaster’s live panel could not be updated.', 'error'); }
      S.saving = false;
      await fetchAll();
    }

    el.innerHTML = '<div class="page-header"><h2>Attendance</h2><p>Mark who is present. Anyone not marked present, including late arrivals, counts as absent.</p></div>' +
      '<div class="at-bar no-print"><label>Class<select id="atClass">' + T.classes.map(function (c) { return '<option>' + esc(c.name) + '</option>'; }).join('') + '</select></label>' +
      '<label id="atDateWrap">Date<input type="date" id="atDate" max="' + T.today() + '" value="' + S.date + '"></label></div>' +
      '<div class="at-tabs no-print"><button class="at-pill on" data-tab="mark">Mark register</button><button class="at-pill" data-tab="history">History</button></div><div id="atBody"></div>';

    function setTab(t) {
      S.tab = t;
      el.querySelectorAll('[data-tab]').forEach(function (b) { b.classList.toggle('on', b.dataset.tab === t); });
      el.querySelector('#atDateWrap').style.display = t === 'mark' ? '' : 'none';
      fetchAll();
    }
    el.addEventListener('change', function (e) {
      if (e.target.id === 'atClass') { S.cls = e.target.value; fetchAll(); }
      else if (e.target.id === 'atDate') { S.date = (e.target.value && e.target.value <= T.today()) ? e.target.value : T.today(); e.target.value = S.date; fetchAll(); }
    });
    el.addEventListener('input', function (e) { if (e.target.dataset.note) S.notes[e.target.dataset.note] = e.target.value.slice(0, 120); });
    el.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.dataset.tab) setTab(b.dataset.tab);
      else if (b.dataset.open) { S.date = b.dataset.open; el.querySelector('#atDate').value = S.date; setTab('mark'); }
      else if (b.dataset.mark) { S.marks[b.dataset.sid] = b.dataset.mark; paint(); }
      else if (b.dataset.act === 'allp') { S.students.forEach(function (st) { S.marks[st.id] = 'present'; }); paint(); }
      else if (b.dataset.act === 'reset') { S.marks = {}; S.notes = {}; paint(); }
      else if (b.dataset.act === 'save') save();
    });
    await fetchAll();
  }


  /* ---------- sidebar icon: thin outline SVG (matches the Overview icon, inherits the menu colour) ---------- */
  var NAV_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/></svg>';
  function paintNavIcon(title) { // safety net if the menu inserts the icon as plain text
    function fix() {
      document.querySelectorAll('.nav-item').forEach(function (b) {
        var t = b.querySelector('.nav-text'), i = b.querySelector('.nav-icon');
        if (t && i && t.textContent.trim() === title && i.innerHTML.indexOf('<svg') < 0) i.innerHTML = NAV_ICON;
      });
    }
    fix();
    var mo = new MutationObserver(fix);
    mo.observe(document.body, { childList: true, subtree: true });
    setTimeout(function () { mo.disconnect(); }, 15000);
  }

  T.register({ id: 'attendance', title: 'Attendance', icon: NAV_ICON, order: 20, render: render });
  paintNavIcon('Attendance');
})();
