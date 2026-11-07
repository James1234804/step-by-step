
/* =========================================================================
   teacher-class.js  —  "My class" section.
   Loads AFTER teacher-core.js. READ-ONLY. Shows the logged-in teacher's own
   students with guardian contacts and a 30-day attendance rate.
   Never reads student passwords.
   ========================================================================= */
(function () {
  'use strict';
  var T = window.Teacher;
  if (!T || !T.register) { console.error('teacher-class.js: teacher-core.js must load first.'); return; }
  var esc = T.esc;

  /* ---------- sidebar icon (thin outline, matches the other menu icons) ---------- */
  var NAV_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>';
  function paintNavIcon() { // safety net: if the menu printed the icon as plain text, turn that text into the real icon
    function fix() {
      var w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null), hits = [], n;
      while ((n = w.nextNode())) { if (n.nodeValue.indexOf(NAV_ICON) !== -1) hits.push(n); }
      hits.forEach(function (node) {
        var parts = node.nodeValue.split(NAV_ICON), p = node.parentNode, frag = document.createDocumentFragment();
        parts.forEach(function (txt, i) {
          if (txt) frag.appendChild(document.createTextNode(txt));
          if (i < parts.length - 1) {
            var span = document.createElement('span');
            span.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;line-height:0';
            span.innerHTML = NAV_ICON;
            frag.appendChild(span);
          }
        });
        p.replaceChild(frag, node);
      });
    }
    fix();
    var mo = new MutationObserver(fix);
    mo.observe(document.body, { childList: true, subtree: true, characterData: true });
    setTimeout(function () { mo.disconnect(); }, 20000);
  }

  function daysAgo(n) { var d = new Date(); d.setDate(d.getDate() - n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  // Zimbabwe-friendly: "0712 345 678" -> "263712345678" (for WhatsApp links)
  function intl(p) { var d = String(p || '').replace(/\D/g, ''); if (!d) return ''; if (d.indexOf('263') === 0) return d; if (d.charAt(0) === '0') return '263' + d.slice(1); return d; }

  /* ---------- data ---------- */
  async function loadClass(cls) {
    var r = await Promise.all([
      T.sb.from('students').select('id,name,gender,status,parent_name,phone,enrollment_year').eq('class', cls),
      T.sb.from('attendance').select('student_id,status').eq('class', cls).gte('date', daysAgo(30))
    ]);
    if (r[0].error) throw new Error('Could not read students: ' + r[0].error.message);
    var rate = {};
    (r[1].data || []).forEach(function (a) {
      var x = rate[a.student_id] || (rate[a.student_id] = { p: 0, t: 0 });
      x.t++; if (T.norm(a.status) === 'present') x.p++;
    });
    var students = (r[0].data || []).filter(function (s) { return (s.status || 'Active') === 'Active'; })
      .sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); })
      .map(function (s) { var x = rate[s.id]; s.pct = x && x.t ? Math.round(x.p / x.t * 100) : null; return s; });
    return students;
  }

  /* ---------- styles ---------- */
  function styles() {
    if (document.getElementById('cl-styles')) return;
    var s = document.createElement('style');
    s.id = 'cl-styles';
    s.textContent = [
      '.cl-bar{display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end;margin-bottom:14px}',
      '.cl-bar label{display:flex;flex-direction:column;gap:4px;font-size:.78rem;font-weight:600;color:var(--text-muted,#64748b)}',
      '.cl-bar select,.cl-bar input{font:inherit;font-size:.9rem;padding:9px 12px;min-height:42px;border:1.5px solid var(--border,#e2e8f0);border-radius:10px;background:#fff;color:var(--navy,#1e2a78)}',
      '.cl-bar .grow{flex:1;min-width:180px}.cl-bar .grow input{width:100%}',
      '.cl-btn{border:1.5px solid var(--border,#e2e8f0);background:#fff;color:var(--navy,#1e2a78);border-radius:10px;padding:8px 14px;min-height:42px;font:inherit;font-size:.85rem;font-weight:600;cursor:pointer}',
      '.cl-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px}',
      '.cl-stat{background:#fff;border:1px solid var(--border,#e2e8f0);border-radius:12px;padding:12px;text-align:center}',
      '.cl-stat b{display:block;font-size:1.4rem;color:var(--navy,#1e2a78)}.cl-stat span{font-size:.75rem;color:var(--text-muted,#64748b)}',
      '.cl-row{display:grid;grid-template-columns:2.2fr 1.6fr 1.8fr 90px;gap:12px;align-items:center;padding:12px 4px;border-bottom:1px solid var(--border,#e2e8f0)}',
      '.cl-row:last-child{border-bottom:none}',
      '.cl-head{font-size:.75rem;font-weight:700;color:var(--text-muted,#64748b);padding-bottom:8px}',
      '.cl-who{display:flex;gap:12px;align-items:center;min-width:0}',
      '.cl-av{width:38px;height:38px;border-radius:50%;background:#eef1fb;color:var(--navy,#1e2a78);display:flex;align-items:center;justify-content:center;font-weight:700;flex:none}',
      '.cl-who div{display:flex;flex-direction:column;min-width:0}.cl-who span,.cl-sub{font-size:.78rem;color:var(--text-muted,#64748b)}',
      '.cl-contact{display:flex;gap:6px;flex-wrap:wrap;margin-top:4px}',
      '.cl-act{font-size:.75rem;font-weight:700;text-decoration:none;padding:5px 10px;border-radius:999px;background:#eef1fb;color:var(--navy,#1e2a78)}',
      '.cl-act.wa{background:#e3f6ea;color:#166534}',
      '.cl-pct{font-size:.8rem;font-weight:700;padding:4px 10px;border-radius:999px;text-align:center;justify-self:start}',
      '.cl-pct.g{background:#e3f6ea;color:#166534}.cl-pct.m{background:#fdf6d8;color:#854d0e}.cl-pct.b{background:#fee2e2;color:#b91c1c}.cl-pct.n{background:#eef1fb;color:var(--text-muted,#64748b)}',
      '.cl-empty{padding:2.5rem 1rem;text-align:center;color:var(--text-muted,#64748b)}.cl-empty strong{display:block;color:var(--navy,#1e2a78);margin-bottom:6px}',
      '@media (max-width:700px){.cl-stats{grid-template-columns:repeat(2,1fr)}.cl-row{grid-template-columns:1fr auto;gap:8px}.cl-head{display:none}.cl-gender,.cl-guard{grid-column:1/-1}.cl-guard{margin-top:-4px}}'
    ].join('\n');
    document.head.appendChild(s);
  }

  /* ---------- render ---------- */
  async function render(el) {
    styles();
    if (!T.classes.length) {
      el.innerHTML = '<div class="page-header"><h2>My class</h2></div><div class="card"><div class="card-body"><div class="cl-empty"><strong>No classes assigned to you yet</strong>Ask the headmaster to assign you a class on the main dashboard.</div></div></div>';
      return;
    }
    var S = { cls: T.classes[0].name, list: [], q: '' };

    function paint() {
      var q = T.norm(S.q), all = S.list;
      var shown = all.filter(function (s) { return !q || [s.name, s.id, s.parent_name, s.phone].some(function (v) { return T.norm(v).indexOf(q) !== -1; }); });
      var girls = all.filter(function (s) { return s.gender === 'Female'; }).length, boys = all.filter(function (s) { return s.gender === 'Male'; }).length;
      var withPct = all.filter(function (s) { return s.pct != null; });
      var avg = withPct.length ? Math.round(withPct.reduce(function (a, s) { return a + s.pct; }, 0) / withPct.length) + '%' : '—';
      var rows = shown.map(function (s) {
        var wa = intl(s.phone), cls = s.pct == null ? 'n' : s.pct >= 90 ? 'g' : s.pct >= 75 ? 'm' : 'b';
        return '<div class="cl-row"><div class="cl-who"><div class="cl-av">' + esc((s.name || '?').trim().charAt(0).toUpperCase()) + '</div><div><strong>' + esc(s.name) + '</strong><span>' + esc(s.id) + '</span></div></div>' +
          '<div class="cl-gender cl-sub">' + esc(s.gender || '—') + (s.enrollment_year ? ' · Enrolled ' + esc(s.enrollment_year) : '') + '</div>' +
          '<div class="cl-guard"><strong style="font-size:.88rem">' + esc(s.parent_name || 'No guardian on record') + '</strong><span class="cl-sub" style="display:block">' + esc(s.phone || 'No phone on record') + '</span>' +
          (wa ? '<div class="cl-contact no-print"><a class="cl-act" href="tel:+' + wa + '">Call</a><a class="cl-act wa" target="_blank" rel="noopener" href="https://wa.me/' + wa + '">WhatsApp</a></div>' : '') + '</div>' +
          '<span class="cl-pct ' + cls + '" title="Attendance, last 30 days">' + (s.pct == null ? 'No data' : s.pct + '%') + '</span></div>';
      }).join('');
      el.querySelector('#clBody').innerHTML =
        '<div class="cl-stats"><div class="cl-stat"><b>' + all.length + '</b><span>Students</span></div><div class="cl-stat"><b>' + girls + '</b><span>Girls</span></div>' +
        '<div class="cl-stat"><b>' + boys + '</b><span>Boys</span></div><div class="cl-stat"><b>' + avg + '</b><span>Attendance, 30 days</span></div></div>' +
        '<div class="card"><div class="card-body">' + (all.length
          ? '<div class="cl-row cl-head"><div>Student</div><div>Details</div><div>Guardian contact</div><div>Attendance</div></div>' + (rows || '<div class="cl-empty"><strong>No matches</strong>Try a different name, ID or phone number.</div>')
          : '<div class="cl-empty"><strong>No active students in ' + esc(S.cls) + '</strong>Students added to this class on the main dashboard will appear here.</div>') + '</div></div>';
    }

    async function fetchClass() {
      el.querySelector('#clBody').innerHTML = '<div class="tc-loading">Loading…</div>';
      try { S.list = await loadClass(S.cls); paint(); }
      catch (e) { el.querySelector('#clBody').innerHTML = '<div class="card"><div class="card-body"><strong>Something went wrong.</strong><p class="muted-text" style="margin-top:6px">' + esc(e.message) + '</p></div></div>'; }
    }

    el.innerHTML = '<div class="page-header"><h2>My <span>class</span></h2><p>Your students and how to reach their guardians.</p></div>' +
      '<div class="cl-bar no-print"><label>Class<select id="clClass">' + T.classes.map(function (c) { return '<option>' + esc(c.name) + '</option>'; }).join('') + '</select></label>' +
      '<label class="grow">Search<input id="clSearch" type="search" placeholder="Name, ID, guardian or phone"></label><button class="cl-btn" id="clPrint">Print list</button></div><div id="clBody"></div>';
    el.addEventListener('change', function (e) { if (e.target.id === 'clClass') { S.cls = e.target.value; S.q = ''; el.querySelector('#clSearch').value = ''; fetchClass(); } });
    el.addEventListener('input', function (e) { if (e.target.id === 'clSearch') { S.q = e.target.value; paint(); } });
    el.addEventListener('click', function (e) { if (e.target.id === 'clPrint') window.print(); });
    await fetchClass();
  }

  T.register({ id: 'class', title: 'My class', icon: NAV_ICON, order: 15, render: render });
  paintNavIcon();
})();
