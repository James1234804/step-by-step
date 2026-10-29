// ============================================================
// records.js — Student fee history, year closing and clearance letters
// Add-on for fees.js. Load it AFTER fees.js:
//   <script src="school.js"></script>
//   <script src="fees.js"></script>
//   <script src="records.js"></script>
//
// It adds a "Records" tab to the Fees & Finance section. Needs the new tables
// from the updated fees.sql (fee_year_closures, fee_clearances).
//
// How it judges a student:
//  - Each year (and the form the student was in that year) is judged ON ITS OWN.
//    Form 1 debt is not merged into Form 2. A student is CLEARED only when
//    every year on record is paid in full.
//  - Students who left, graduated or were removed from the student list are
//    still found, because every payment keeps the student's name, ID and class.
//  - "Close year" freezes a year's figures into a permanent snapshot, so later
//    changes to fee items cannot rewrite history.
// ============================================================
(function () {
    'use strict';

    const CFG = {
        schoolName: 'Shallom High School',   // keep the same as in fees.js
        terms: ['Term 1', 'Term 2', 'Term 3'],
        issueRoles: ['admin', 'headmaster', 'headmistress', 'principal', 'bursar', 'accountant'],
        closeRoles: ['admin', 'headmaster', 'headmistress', 'principal'],
        maxList: 150
    };

    const R = {
        root: null, modal: null, active: false, loaded: false, err: '', busy: false,
        structures: [], assignments: [], payments: [], closures: [],
        pbs: new Map(), students: [], recs: [], q: '', f: ''
    };

    // ---------- helpers ----------
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const db = () => (typeof supabaseClient !== 'undefined' && supabaseClient) ? supabaseClient : null;
    const notify = (m, t) => { if (typeof showNotification === 'function') showNotification(m, t || 'info'); else console.log(m); };
    const sum = (a, f) => a.reduce((x, y) => x + f(y), 0);
    const termIdx = t => CFG.terms.indexOf(t);
    const symbol = () => (typeof getCurrencySymbol === 'function') ? getCurrencySymbol() : '$';
    const fmt = c => (c < 0 ? '-' : '') + symbol() + (Math.abs(c) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const showDate = s => { if (!s) return '—'; const [y, m, d] = String(s).slice(0, 10).split('-'); return d + '/' + m + '/' + y; };
    const curYear = () => new Date().getFullYear();
    const curTermIdx = () => Math.min(2, Math.floor(new Date().getMonth() / 4)); // same split as fees.js

    const user = () => getData('currentUser') || {};
    const role = () => String(user().role || '').toLowerCase();
    const actor = () => String(user().name || user().username || 'unknown').slice(0, 80);
    const can = { issue: () => CFG.issueRoles.includes(role()), close: () => CFG.closeRoles.includes(role()) };

    function levelFromClass(cls) {
        const p = (typeof parseClassName === 'function') ? parseClassName(cls) : null;
        if (p && p.level) return p.level;
        const m = /form\s*(\d)/i.exec(String(cls || ''));
        return m ? parseInt(m[1], 10) : null;
    }

    // ---------- data ----------
    async function loadAll() {
        const c = db();
        if (!c) { R.err = 'Supabase is not connected.'; return; }
        try {
            const [st, as, pay, cl] = await Promise.all([
                c.from('fee_structures').select('*'),
                c.from('fee_assignments').select('*'),
                c.from('fee_payments').select('*'),
                c.from('fee_year_closures').select('*').order('year')
            ]);
            const err = st.error || as.error || pay.error || cl.error;
            if (err) {
                R.err = /relation|does not exist|42P01|schema cache/i.test(err.message + (err.code || ''))
                    ? 'The records tables are missing. Run the updated fees.sql in the Supabase SQL editor, then refresh.'
                    : 'Could not load records: ' + err.message;
                return;
            }
            R.structures = st.data || []; R.assignments = as.data || [];
            R.payments = pay.data || []; R.closures = cl.data || [];
            R.err = ''; R.loaded = true;
        } catch (e) { R.err = 'Could not reach the server. Check your connection.'; }
    }

    // Every student ever: current list + anyone who only appears in payments or closed-year snapshots.
    function buildStudents() {
        const map = new Map();
        (getData('students') || []).forEach(s => map.set(s.id, {
            id: s.id, name: s.name, class: s.class, status: s.status || 'Active',
            enrol: parseInt(s.enrollmentYear, 10) || null,
            end: parseInt(s.graduationYear || s.leftYear, 10) || null,
            parent: s.parentName, phone: s.phone
        }));
        const orphan = (id, name, cls) => { if (!map.has(id)) map.set(id, { id, name, class: cls, status: 'Removed', enrol: null, end: null }); };
        R.payments.forEach(p => orphan(p.student_id, p.student_name, p.class));
        R.closures.forEach(c => (c.snapshot || []).forEach(r => orphan(r.id, r.name, r.class)));
        return Array.from(map.values());
    }

    function prepare() {
        R.pbs = new Map();
        R.payments.forEach(p => { if (!R.pbs.has(p.student_id)) R.pbs.set(p.student_id, []); R.pbs.get(p.student_id).push(p); });
        R.students = buildStudents();
        R.recs = R.students.map(recordOf);
    }

    // ---------- per-student, per-year maths (integer cents) ----------
    function yearsFor(st) {
        const cur = curYear(), set = new Set();
        (R.pbs.get(st.id) || []).forEach(p => set.add(p.year));
        R.closures.forEach(c => { if ((c.snapshot || []).some(r => r.id === st.id)) set.add(c.year); });
        const lvl = levelFromClass(st.class);
        let start = st.enrol;
        if (!start && st.status === 'Active' && lvl) start = cur - (lvl - 1);
        if (start && start >= 2000) {
            const last = set.size ? Math.max.apply(null, Array.from(set)) : start;
            const end = st.status === 'Active' ? cur : Math.max(st.end || last, start);
            for (let y = start; y <= Math.min(end, cur); y++) set.add(y);
        }
        return Array.from(set).sort((a, b) => a - b);
    }

    function formAt(st, year, mine) {
        const pc = mine.find(p => p.class);
        if (pc) { const l = levelFromClass(pc.class); return { n: l, text: pc.class }; }
        const lvl = levelFromClass(st.class);
        if (lvl && st.status === 'Active') { const n = lvl - (curYear() - year); if (n >= 1 && n <= 6) return { n, text: 'Form ' + n }; }
        return { n: null, text: '—' };
    }

    function computeYear(st, y, full) {
        const mine = (R.pbs.get(st.id) || []).filter(p => p.year === y);
        const f = formAt(st, y, mine);
        const closure = R.closures.find(c => c.year === y);
        let items = [], billed = 0, paid = 0, late = 0, formText = f.text, closed = false;

        if (closure) {
            closed = true;
            const snap = (closure.snapshot || []).find(r => r.id === st.id);
            if (snap) {
                items = (snap.items || []).map(a => ({ term: a[0], name: a[1], category: a[2], amount_cents: a[3] }));
                billed = snap.billed; paid = snap.paid;
                if (snap.form && snap.form !== '—') formText = snap.form;
            }
            const t = Date.parse(closure.closed_at);
            mine.forEach(p => {
                const rec = Date.parse(p.recorded_at), rv = p.reversed_at ? Date.parse(p.reversed_at) : null;
                if (p.status === 'valid' && rec > t) { paid += p.amount_cents; late += p.amount_cents; }
                if (p.status === 'reversed' && rec <= t && rv && rv > t) paid -= p.amount_cents;
            });
        } else {
            const through = full ? 2 : (y === curYear() ? curTermIdx() : 2);
            items = R.structures.filter(x => x.active && x.year === y && termIdx(x.term) <= through &&
                (x.form_level == null || x.form_level === f.n) &&
                (!x.optional || R.assignments.some(a => a.student_id === st.id && a.structure_id === x.id)));
            billed = sum(items, i => i.amount_cents);
            paid = sum(mine.filter(p => p.status === 'valid'), p => p.amount_cents);
        }
        const valid = mine.filter(p => p.status === 'valid');
        const terms = CFG.terms.map(t => ({
            term: t, billed: sum(items.filter(i => i.term === t), i => i.amount_cents),
            paid: sum(valid.filter(p => p.term === t), p => p.amount_cents)
        }));
        return {
            year: y, formText, billed, paid, balance: billed - paid, items, pays: mine, terms, closed, late,
            partial: (!closed && !full && y === curYear()) ? CFG.terms[curTermIdx()] : null
        };
    }

    function recordOf(st) {
        const rows = yearsFor(st).map(y => computeYear(st, y, false)).filter(r => r.billed > 0 || r.paid > 0);
        const owed = sum(rows, r => Math.max(0, r.balance));
        return { st, rows, owed, verdict: !rows.length ? 'No records' : (owed > 0 ? 'Owes' : 'Cleared') };
    }

    // ---------- print ----------
    const PRINT_CSS = 'body{font-family:Arial,sans-serif;color:#111;margin:32px;font-size:13px}h1{margin:0;font-size:20px}h2{margin:18px 0 6px;font-size:15px}' +
        '.top{display:flex;justify-content:space-between;border-bottom:3px solid #EA580C;padding-bottom:10px;margin-bottom:14px}' +
        'table{border-collapse:collapse;width:100%;margin:6px 0}th,td{border:1px solid #ccc;padding:6px 8px;text-align:left}th{background:#f3f4f6}' +
        '.num{text-align:right}.muted{color:#666}.rev td{text-decoration:line-through;color:#999}.tot td{font-weight:bold;background:#fafafa}' +
        '.box{padding:12px 14px;border-radius:6px;font-size:15px;font-weight:bold;margin:12px 0}.okb{background:#DCFCE7;color:#15803D}.badb{background:#FEE2E2;color:#B91C1C}' +
        '.sign{margin-top:50px;display:flex;justify-content:space-between}.sign div{border-top:1px solid #333;width:40%;padding-top:4px;text-align:center}';
    function printDoc(title, inner) {
        const html = '<!doctype html><html><head><meta charset="utf-8"><title>' + esc(title) + '</title><style>' + PRINT_CSS + '</style></head><body>' + inner + '</body></html>';
        const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
        const w = window.open(url, '_blank');
        if (!w) notify('Please allow pop-ups to print.', 'warning');
        else w.addEventListener('load', () => { try { w.print(); } catch (e) { /* print manually */ } });
        setTimeout(() => URL.revokeObjectURL(url), 60000);
    }
    const docHeader = sub => '<div class="top"><div><h1>' + esc(CFG.schoolName) + '</h1><div class="muted">' + esc(sub) + '</div></div><div class="muted">Printed ' + esc(new Date().toLocaleString()) + '</div></div>';

    function yearDetailHtml(r, forPrint) {
        const tbl = forPrint ? '' : ' class="rx-t"';
        return '<table' + tbl + '><tr><th>Term</th><th>Charge</th><th class="num">Amount</th></tr>' +
            (r.items.length ? r.items.map(i => '<tr><td>' + esc(i.term) + '</td><td>' + esc(i.name) + ' (' + esc(i.category) + ')</td><td class="num">' + esc(fmt(i.amount_cents)) + '</td></tr>').join('') : '<tr><td colspan="3">No charges on record</td></tr>') +
            '<tr class="tot"><td colspan="2">Total billed</td><td class="num">' + esc(fmt(r.billed)) + '</td></tr></table>' +
            '<table' + tbl + '><tr><th>Date</th><th>Receipt</th><th>Term</th><th>Method</th><th class="num">Amount</th></tr>' +
            (r.pays.length ? r.pays.slice().sort((a, b) => String(a.paid_on).localeCompare(String(b.paid_on))).map(p => '<tr class="' + (p.status === 'reversed' ? 'rev' : '') + '"><td>' + esc(showDate(p.paid_on)) + '</td><td>' + esc(p.receipt_no) + (p.status === 'reversed' ? ' (reversed)' : '') + '</td><td>' + esc(p.term) + '</td><td>' + esc(p.method) + '</td><td class="num">' + esc(fmt(p.amount_cents)) + '</td></tr>').join('') : '<tr><td colspan="5">No payments</td></tr>') +
            '<tr class="tot"><td colspan="4">Total paid</td><td class="num">' + esc(fmt(r.paid)) + '</td></tr></table>' +
            (r.late > 0 ? '<p class="muted">Includes ' + esc(fmt(r.late)) + ' paid after this year was closed.</p>' : '');
    }

    function letterHtml(rec, ref) {
        const st = rec.st, ok = rec.verdict === 'Cleared';
        return docHeader(ok ? 'Fee Clearance Letter' : 'Statement of Fees — NOT CLEARED') +
            '<table><tr><th>Student</th><td>' + esc(st.name) + '</td><th>Student ID</th><td>' + esc(st.id) + '</td></tr>' +
            '<tr><th>Last class</th><td>' + esc(st.class || '—') + '</td><th>Reference</th><td>' + esc(ref) + '</td></tr></table>' +
            '<div class="box ' + (ok ? 'okb' : 'badb') + '">' + (ok ? 'CLEARED — all fees on record have been paid in full.' : 'NOT CLEARED — outstanding balance of ' + esc(fmt(rec.owed)) + '.') + '</div>' +
            '<h2>Summary by year</h2><table><tr><th>Year</th><th>Form / class</th><th class="num">Billed</th><th class="num">Paid</th><th class="num">Balance</th><th>Result</th></tr>' +
            rec.rows.map(r => '<tr><td>' + r.year + '</td><td>' + esc(r.formText) + '</td><td class="num">' + esc(fmt(r.billed)) + '</td><td class="num">' + esc(fmt(r.paid)) + '</td><td class="num">' + esc(fmt(Math.max(0, r.balance))) + '</td><td>' + (r.balance > 0 ? 'Owes' : 'Cleared') + '</td></tr>').join('') + '</table>' +
            rec.rows.map(r => '<h2>' + r.year + ' — ' + esc(r.formText) + (r.closed ? ' (year closed)' : '') + (r.partial ? ' (billed through ' + esc(r.partial) + ')' : '') + '</h2>' + yearDetailHtml(r, true)).join('') +
            '<p class="muted">Issued by <strong>' + esc(actor()) + '</strong> on ' + esc(new Date().toLocaleString()) + '. Reference ' + esc(ref) + '.</p>' +
            '<div class="sign"><div>Issued by (bursar)</div><div>Headmaster / Principal</div></div>';
    }

    // ---------- styles ----------
    const CSS = '.rx-year{border:1px solid var(--line);border-radius:12px;padding:12px 14px;margin:12px 0}' +
        '.rx-yh{display:flex;flex-wrap:wrap;gap:8px;justify-content:space-between;align-items:center;margin-bottom:6px}' +
        '.rx-vd{padding:12px 14px;border-radius:10px;font-weight:700;margin:10px 0}.rx-vd.ok{background:#DCFCE7;color:#15803D}.rx-vd.bad{background:#FEE2E2;color:#B91C1C}.rx-vd.none{background:#F1F5F9;color:#64748B}' +
        '.rx-t{margin-bottom:8px}.rx-sum{font-size:.85rem;color:var(--mut)}';

    // ---------- views ----------
    const badge = v => '<span class="fx-b ' + ({ 'Cleared': 'paid', 'Owes': 'unpaid' }[v] || 'none') + '">' + esc(v) + '</span>';

    function shellHtml() {
        if (R.err && !R.loaded) return '<div class="fx-banner err">' + esc(R.err) + '</div>';
        if (!R.loaded) return '<div class="fx-empty">Loading records…</div>';
        return (R.err ? '<div class="fx-banner err">' + esc(R.err) + '</div>' : '') +
            '<div class="fx-filters"><input id="rx-q" data-rx-filter="q" placeholder="Search any student ever, by name or ID" value="' + esc(R.q) + '" style="min-width:260px">' +
            '<select id="rx-f" data-rx-filter="f"><option value="">All students</option>' +
            ['Owes', 'Cleared', 'Left / graduated', 'No records'].map(o => '<option' + (R.f === o ? ' selected' : '') + '>' + esc(o) + '</option>').join('') + '</select>' +
            '<button class="fx-btn" data-rx="refresh">Refresh</button>' +
            (can.close() ? '<button class="fx-btn dng" data-rx="open-close">Close a year…</button>' : '') + '</div>' +
            '<p class="fx-sub" style="margin:0 0 10px">Each year is judged on its own. A student is cleared only when every year on record is paid in full.' +
            (R.closures.length ? ' Closed years: ' + esc(R.closures.map(c => c.year).join(', ')) + '.' : '') + '</p>' +
            '<div id="rx-list">' + listHtml() + '</div>';
    }

    function listHtml() {
        const q = R.q.trim().toLowerCase();
        let list = R.recs.filter(r =>
            (!q || String(r.st.name).toLowerCase().includes(q) || String(r.st.id).toLowerCase().includes(q)) &&
            (!R.f || (R.f === 'Left / graduated' ? r.st.status !== 'Active' : r.verdict === R.f)));
        list.sort((a, b) => String(a.st.name).localeCompare(String(b.st.name)));
        const total = list.length;
        list = list.slice(0, CFG.maxList);
        return '<div class="fx-panel fx-scroll"><table><thead><tr><th>ID</th><th>Student</th><th>Last class</th><th>Status</th><th>Years</th><th class="num">Owing</th><th>Result</th><th></th></tr></thead><tbody>' +
            (list.length ? list.map(r => '<tr><td>' + esc(r.st.id) + '</td><td>' + esc(r.st.name) + '</td><td>' + esc(r.st.class || '—') + '</td><td>' + esc(r.st.status) + '</td><td>' + r.rows.length + '</td><td class="num">' + esc(fmt(r.owed)) + '</td><td>' + badge(r.verdict) + '</td>' +
                '<td><button class="fx-btn fx-sm pri" data-rx="open" data-id="' + esc(r.st.id) + '">Open record</button></td></tr>').join('')
                : '<tr><td colspan="8" class="fx-empty">No students match.</td></tr>') + '</tbody></table>' +
            (total > list.length ? '<p class="fx-sub">Showing the first ' + list.length + ' of ' + total + '. Type in the search box to narrow it down.</p>' : '') + '</div>';
    }

    // ---------- injection into the fees.js tab bar ----------
    function inject() {
        const root = R.root; if (!root) return;
        const tabs = root.querySelector('.fx-tabs'); if (!tabs) return;
        let b = tabs.querySelector('[data-rx-tab]');
        if (!b) {
            b = document.createElement('button');
            b.className = 'fx-tab'; b.setAttribute('role', 'tab'); b.setAttribute('data-rx-tab', '1'); b.textContent = 'Records';
            tabs.appendChild(b);
        }
        if (R.active) {
            tabs.querySelectorAll('.fx-tab').forEach(t => t.classList.remove('on'));
            b.classList.add('on');
            const body = tabs.nextElementSibling;
            if (body) body.innerHTML = shellHtml();
        }
    }
    async function refresh() {
        await loadAll(); if (R.loaded) prepare();
        if (R.active) inject();
    }

    // ---------- modals ----------
    function openModal(inner) {
        R.modal.innerHTML = '<div class="fx-dialog" role="dialog" aria-modal="true" style="width:min(860px,100%)">' + inner + '</div>';
        R.modal.classList.add('open');
    }
    function closeModal() { R.modal.classList.remove('open'); R.modal.innerHTML = ''; R.modal.dataset.id = ''; }
    const dlgTop = (t, sub) => '<div class="fx-dlg-top"><div><h3>' + esc(t) + '</h3><div class="fx-sub">' + esc(sub || '') + '</div></div><button class="fx-x" data-rx="close-modal" aria-label="Close">×</button></div>';

    function openRecord(id) {
        const rec = R.recs.find(r => r.st.id === id); if (!rec) return;
        R.modal.dataset.id = id;
        const v = rec.verdict;
        openModal(dlgTop(rec.st.name, rec.st.id + ' · ' + (rec.st.class || '—') + ' · ' + rec.st.status) +
            '<div class="rx-vd ' + (v === 'Cleared' ? 'ok' : v === 'Owes' ? 'bad' : 'none') + '">' +
            (v === 'Cleared' ? 'CLEARED — every year on record is paid in full.' : v === 'Owes' ? 'NOT CLEARED — owes ' + esc(fmt(rec.owed)) + ' in: ' + esc(rec.rows.filter(r => r.balance > 0).map(r => r.year + ' (' + r.formText + ')').join(', ')) : 'No fee records on file for this student.') + '</div>' +
            rec.rows.map(r => '<div class="rx-year"><div class="rx-yh"><b>' + r.year + ' · ' + esc(r.formText) + '</b>' + badge(r.balance > 0 ? 'Owes' : 'Cleared') +
                '<span class="rx-sum">Billed ' + esc(fmt(r.billed)) + ' · Paid ' + esc(fmt(r.paid)) + ' · Balance ' + esc(fmt(Math.max(0, r.balance))) + (r.closed ? ' · year closed' : '') + (r.partial ? ' · billed through ' + esc(r.partial) : '') + '</span></div>' +
                '<div class="rx-sum" style="margin-bottom:6px">' + r.terms.filter(t => t.billed || t.paid).map(t => esc(t.term) + ': billed ' + esc(fmt(t.billed)) + ', paid ' + esc(fmt(t.paid))).join(' &nbsp;|&nbsp; ') + '</div>' +
                '<div class="fx-scroll">' + yearDetailHtml(r, false) + '</div></div>').join('') +
            '<div class="fx-act" style="justify-content:flex-end;margin-top:12px"><button class="fx-btn" data-rx="close-modal">Close</button>' +
            (can.issue() && rec.rows.length ? '<button class="fx-btn pri" data-rx="letter" data-id="' + esc(id) + '">' + (v === 'Cleared' ? 'Issue clearance letter' : 'Print statement (not cleared)') + '</button>' : '') + '</div>');
    }

    async function issueLetter(id) {
        if (R.busy) return;
        if (!can.issue()) return notify('Your role cannot issue letters.', 'error');
        const c = db(); if (!c) return notify('Not connected to the server.', 'error');
        R.busy = true;
        try {
            await loadAll(); prepare(); // use the latest numbers
            const rec = R.recs.find(r => r.st.id === id);
            if (!rec || !rec.rows.length) return notify('No fee records on file for this student.', 'warning');
            const { data, error } = await c.from('fee_clearances').insert({
                student_id: rec.st.id, student_name: rec.st.name, verdict: rec.verdict, outstanding_cents: rec.owed, issued_by: actor(),
                detail: { class: rec.st.class || '', years: rec.rows.map(r => ({ year: r.year, form: r.formText, billed: r.billed, paid: r.paid })) }
            }).select().single();
            if (error) return notify('Letter was NOT issued: ' + error.message, 'error');
            const ref = 'CL-' + new Date().getFullYear() + '-' + String(data.id).padStart(6, '0');
            if (typeof addActivity === 'function') addActivity('📄', (rec.verdict === 'Cleared' ? 'Clearance letter ' : 'Fee statement ') + ref + ': ' + rec.st.name);
            printDoc('Clearance ' + ref, letterHtml(rec, ref));
            notify('Letter ' + ref + ' logged and ready to print.', 'success');
        } finally { R.busy = false; }
    }

    function openClose() {
        if (!can.close()) return notify('Only admin roles can close a year.', 'error');
        const closed = new Set(R.closures.map(c => c.year)), set = new Set();
        R.payments.forEach(p => set.add(p.year)); R.structures.forEach(s => set.add(s.year));
        const years = Array.from(set).filter(y => !closed.has(y) && y <= curYear()).sort((a, b) => b - a);
        if (!years.length) return notify('There are no open years to close.', 'info');
        openModal(dlgTop('Close a year', 'Permanent. Freezes that year\'s figures for every student.') +
            '<p>Closing locks what each student was billed and had paid for the year. Fee items for that year can no longer be added or archived. Late payments are still accepted and show as "paid after closing". <strong>This cannot be undone.</strong></p>' +
            '<div class="fx-form"><div><label for="rx-cy">Year to close</label><select id="rx-cy">' + years.map(y => '<option>' + y + '</option>').join('') + '</select></div>' +
            '<div><label for="rx-cy-c">Type the year to confirm</label><input id="rx-cy-c" inputmode="numeric" maxlength="4"></div></div>' +
            '<div class="fx-act" style="justify-content:flex-end;margin-top:12px"><button class="fx-btn" data-rx="close-modal">Cancel</button><button class="fx-btn dng" data-rx="confirm-close">Close year permanently</button></div>');
    }

    async function confirmClose() {
        if (R.busy || !can.close()) return;
        const c = db(); if (!c) return;
        const y = parseInt((document.getElementById('rx-cy') || {}).value, 10);
        if (String((document.getElementById('rx-cy-c') || {}).value || '').trim() !== String(y)) return notify('Type the year exactly to confirm.', 'warning');
        if (y === curYear() && !confirm(y + ' is not over yet. Closing it now bills the full year to every student. Continue?')) return;
        R.busy = true;
        try {
            await loadAll(); prepare(); // freshest payments before snapshotting
            if (R.closures.some(x => x.year === y)) return notify('That year is already closed.', 'warning');
            const rows = [];
            R.students.forEach(st => {
                if (!yearsFor(st).includes(y)) return;
                const r = computeYear(st, y, true);
                if (r.billed > 0 || r.paid > 0) rows.push({ id: st.id, name: st.name, class: st.class || '', form: r.formText, billed: r.billed, paid: r.paid, items: r.items.map(i => [i.term, i.name, i.category, i.amount_cents]) });
            });
            const { error } = await c.from('fee_year_closures').insert({
                year: y, closed_by: actor(), student_count: rows.length,
                total_billed_cents: sum(rows, r => r.billed), total_paid_cents: sum(rows, r => r.paid), snapshot: rows
            });
            if (error) return notify(error.code === '23505' ? 'That year is already closed.' : 'Not closed: ' + error.message, 'error');
            try { await c.from('fee_audit').insert({ action: 'year_closed', actor: actor(), detail: { year: y, students: rows.length } }); } catch (e) { /* non-fatal */ }
            await loadAll(); prepare();
            closeModal(); inject();
            notify('Year ' + y + ' closed with ' + rows.length + ' student records frozen.', 'success');
        } finally { R.busy = false; }
    }

    // ---------- events ----------
    function onClick(e) {
        if (e.target.closest('[data-rx-tab]')) { R.active = true; inject(); refresh(); return; }
        const t = e.target.closest('[data-rx]'); if (!t) return;
        switch (t.dataset.rx) {
            case 'refresh': refresh().then(() => notify('Records refreshed.', 'success')); break;
            case 'open': openRecord(t.dataset.id); break;
            case 'letter': issueLetter(t.dataset.id); break;
            case 'open-close': openClose(); break;
            case 'confirm-close': confirmClose(); break;
            case 'close-modal': closeModal(); break;
        }
    }
    let timer = null;
    function onInput(e) {
        const t = e.target; if (!t.dataset || !t.dataset.rxFilter) return;
        R[t.dataset.rxFilter] = t.value;
        clearTimeout(timer);
        timer = setTimeout(() => { const el = document.getElementById('rx-list'); if (el) el.innerHTML = listHtml(); }, t.tagName === 'INPUT' ? 180 : 0);
    }

    function attach(root) {
        R.root = root;
        root.addEventListener('click', e => { if (e.target.closest('[data-action="tab"]')) R.active = false; }, true); // leaving Records
        root.addEventListener('click', onClick);
        root.addEventListener('input', onInput);
        root.addEventListener('change', onInput);
        new MutationObserver(inject).observe(root, { childList: true }); // fees.js re-renders replace the tab bar
        inject();
    }

    function boot() {
        const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
        R.modal = document.createElement('div'); R.modal.className = 'fx fx-modal'; document.body.appendChild(R.modal);
        R.modal.addEventListener('click', onClick);
        R.modal.addEventListener('mousedown', e => { if (e.target === R.modal) closeModal(); });
        document.addEventListener('keydown', e => { if (e.key === 'Escape' && R.modal.classList.contains('open')) closeModal(); });
        let tries = 0;
        const wait = setInterval(() => { // fees.js builds #fx-root when the page loads
            const root = document.getElementById('fx-root');
            if (root || ++tries > 100) { clearInterval(wait); if (root) attach(root); else console.warn('records.js: fees.js section not found. Load records.js after fees.js.'); }
        }, 300);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
