 // ============================================================
// fees.js — Fees & Finance  (version 2: payments are applied to specific fee items)
// Standalone module. Load it AFTER school.js:
//   <script src="school.js"></script>
//   <script src="fees.js"></script>
//   <script src="records.js"></script>
//
// It builds the whole Fees & Finance section itself and talks to
// Supabase directly (tables from fees.sql). Nothing in school.js has to change.
//
// HOW PAYMENTS WORK
//  - Every fee item (Tuition, Examination, Transport...) is billed separately.
//  - When money is received, the cashier says which item(s) it pays for.
//    A $20 payment for "Science Practical" can never reduce tuition.
//  - Each item cannot be overpaid, and a payment is saved together with its
//    allocations in one database step (nothing half-saved).
//
// SECURITY MODEL
//  - Money is stored as integer cents. No floating-point maths on balances.
//  - Every piece of text is HTML-escaped. No inline onclick handlers.
//  - Payments are never deleted or edited. A mistake is a REVERSAL with a
//    reason, and every action is written to an audit table.
//  - fees.sql adds database triggers that lock payment details and block
//    deletes, so even a tampered browser cannot change a recorded amount.
//  - The role checks below are a convenience only. Login in this app lives
//    in the browser, so a determined user could fake it. Real role
//    enforcement needs Supabase Auth + RLS (see the notes in fees.sql).
// ============================================================
(function () {
    'use strict';

    // ---------- Configuration ----------
    const CFG = {
        schoolName: 'Shallom High School',
        // Ids tried in order to find the section to render into.
        sectionIds: ['fees-section', 'finance-section', 'fees-finance-section'],
        terms: ['Term 1', 'Term 2', 'Term 3'],
        methods: ['Cash', 'EcoCash', 'OneMoney', 'Bank Transfer', 'Swipe/POS', 'Cheque', 'Other'],
        categories: ['Tuition', 'Boarding', 'Transport', 'Levy', 'Sports', 'Examination', 'Other'],
        // Roles read from the logged-in user's "role" field.
        recordRoles: ['admin', 'headmaster', 'headmistress', 'principal', 'bursar', 'accountant'],
        reverseRoles: ['admin', 'headmaster', 'headmistress', 'principal'],
        maxAmountCents: 100000000000
    };

    // ---------- State ----------
    const now = new Date();
    const S = {
        root: null,
        modal: null,
        year: now.getFullYear(),
        term: CFG.terms[Math.min(2, Math.floor(now.getMonth() / 4))], // Jan-Apr, May-Aug, Sep-Dec
        tab: 'overview',
        structures: [],
        assignments: [],
        payments: [],
        allocations: [],
        allocByPay: new Map(),
        loaded: false,
        loadError: '',
        busy: false,
        f: { q: '', cls: '', status: '', method: '', pq: '' },
        arrears: []
    };

    // ---------- Small helpers ----------
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const db = () => (typeof supabaseClient !== 'undefined' && supabaseClient) ? supabaseClient : null;
    const notify = (m, t) => { if (typeof showNotification === 'function') showNotification(m, t || 'info'); else console.log(m); };
    const uid = p => (window.crypto && crypto.randomUUID) ? p + crypto.randomUUID() : p + Date.now() + Math.random().toString(16).slice(2);
    const termIdx = t => CFG.terms.indexOf(t);
    const sum = (arr, f) => arr.reduce((a, x) => a + f(x), 0);

    const symbol = () => (typeof getCurrencySymbol === 'function') ? getCurrencySymbol() : '$';
    const fmt = c => (c < 0 ? '-' : '') + symbol() + (Math.abs(c) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    // "123.45" -> 12345. Returns null for anything that is not a plain positive amount.
    function parseMoney(v) {
        const s = String(v == null ? '' : v).trim().replace(/,/g, '');
        if (!/^\d{1,9}(\.\d{1,2})?$/.test(s)) return null;
        const c = Math.round(parseFloat(s) * 100);
        return c > 0 && c <= CFG.maxAmountCents ? c : null;
    }
    function todayISO() {
        const d = new Date();
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }
    function validDate(s) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
        const [y, m, d] = s.split('-').map(Number);
        const dt = new Date(y, m - 1, d);
        return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d && y >= 2000 && s <= todayISO();
    }
    const showDate = s => { if (!s) return '—'; const [y, m, d] = String(s).slice(0, 10).split('-'); return d + '/' + m + '/' + y; };

    // ---------- Permissions ----------
    const user = () => getData('currentUser') || {};
    const role = () => String(user().role || '').toLowerCase();
    const actor = () => String(user().name || user().username || 'unknown').slice(0, 80);
    const can = {
        record: () => CFG.recordRoles.includes(role()),
        reverse: () => CFG.reverseRoles.includes(role()),
        structure: () => CFG.reverseRoles.includes(role())
    };

    // ---------- Data ----------
    const activeStudents = () => (getData('students') || []).filter(s => (s.status || 'Active') === 'Active');
    const findStudent = id => (getData('students') || []).find(s => s.id === id);

    function levelOf(stu) {
        const p = (typeof parseClassName === 'function') ? parseClassName(stu.class) : null;
        if (p) return p.level;
        return (typeof calculateCurrentFormLevel === 'function') ? calculateCurrentFormLevel(stu.enrollmentYear) : null;
    }

    function indexAllocations() {
        S.allocByPay = new Map();
        S.allocations.forEach(a => {
            if (!S.allocByPay.has(a.payment_id)) S.allocByPay.set(a.payment_id, []);
            S.allocByPay.get(a.payment_id).push(a);
        });
    }

    async function loadAll() {
        const c = db();
        if (!c) { S.loadError = 'Supabase is not connected. Check that supabase-js loads before school.js.'; return; }
        try {
            const [st, as, pay, al] = await Promise.all([
                c.from('fee_structures').select('*').order('year', { ascending: false }),
                c.from('fee_assignments').select('*'),
                c.from('fee_payments').select('*').order('recorded_at', { ascending: false }),
                c.from('fee_allocations').select('*')
            ]);
            const err = st.error || as.error || pay.error || al.error;
            if (err) {
                S.loadError = /relation|does not exist|42P01|schema cache/i.test(err.message + (err.code || ''))
                    ? 'The fees tables are missing or out of date. Run the latest fees.sql in the Supabase SQL editor, then refresh.'
                    : 'Could not load fee data: ' + err.message;
                return;
            }
            S.structures = st.data || [];
            S.assignments = as.data || [];
            S.payments = pay.data || [];
            S.allocations = al.data || [];
            indexAllocations();
            S.loadError = '';
            S.loaded = true;
        } catch (e) {
            S.loadError = 'Could not reach the server. Check your connection.';
        }
    }

    async function reloadPayments() {
        const c = db(); if (!c) return;
        const [pay, al] = await Promise.all([
            c.from('fee_payments').select('*').order('recorded_at', { ascending: false }),
            c.from('fee_allocations').select('*')
        ]);
        if (!pay.error && pay.data) S.payments = pay.data;
        if (!al.error && al.data) { S.allocations = al.data; indexAllocations(); }
    }

    async function audit(action, paymentId, detail) {
        const c = db(); if (!c) return;
        try {
            await c.from('fee_audit').insert({ action, payment_id: paymentId || null, actor: actor(), detail: detail || {} });
        } catch (e) { console.warn('Audit write failed', e); }
    }

    // ---------- Account maths (all integer cents) ----------
    function chargeItems(stu, year, throughTerm) {
        const lvl = levelOf(stu);
        return S.structures.filter(f =>
            f.active && f.year === year && termIdx(f.term) <= throughTerm &&
            (f.form_level == null || f.form_level === lvl) &&
            (!f.optional || S.assignments.some(a => a.student_id === stu.id && a.structure_id === f.id)));
    }
    // One account = every item billed, how much of each was paid, and what is still owing.
    function account(stu, year, throughTerm) {
        const items = chargeItems(stu, year, throughTerm);
        const pays = S.payments.filter(p => p.student_id === stu.id && p.year === year && p.status === 'valid');
        const billed = sum(items, i => i.amount_cents);
        const paid = sum(pays, p => p.amount_cents);
        const lines = items.map(i => {
            const lp = sum(pays, p => sum((S.allocByPay.get(p.id) || []).filter(x => x.structure_id === i.id), x => x.amount_cents));
            return { item: i, paid: lp, remaining: Math.max(0, i.amount_cents - lp) };
        }).sort((a, b) => termIdx(a.item.term) - termIdx(b.item.term) || a.item.name.localeCompare(b.item.name));
        const unallocated = paid - sum(lines, l => l.paid); // payments not tied to an active item
        return { items, pays, billed, paid, balance: billed - paid, lines, unallocated };
    }
    function statusOf(a) {
        if (a.billed === 0 && a.paid === 0) return 'No fees';
        if (a.balance <= 0) return 'Paid';
        return a.paid > 0 ? 'Partial' : 'Unpaid';
    }
    const lineStatus = l => l.remaining <= 0 ? 'Paid' : (l.paid > 0 ? 'Partial' : 'Unpaid');
    function accounts() {
        const t = termIdx(S.term);
        return activeStudents().map(stu => {
            const a = account(stu, S.year, t);
            return Object.assign({ stu, status: statusOf(a) }, a);
        });
    }
    const yearPayments = () => S.payments.filter(p => p.year === S.year && p.status === 'valid');
    const structureOf = id => S.structures.find(s => s.id === id);

    // "Tuition Term 1 $150.00, Examination $20.00" — what a payment was applied to.
    function allocText(p, withAmounts) {
        const al = S.allocByPay.get(p.id) || [];
        if (!al.length) return 'Unallocated';
        return al.map(x => { const f = structureOf(x.structure_id); return (f ? f.name + ' (' + f.term + ')' : 'Fee item') + (withAmounts === false ? '' : ' ' + fmt(x.amount_cents)); }).join(', ');
    }

    // ---------- CSV / print ----------
    function csvCell(v) {
        if (typeof v === 'number') return String(v);
        let s = String(v == null ? '' : v);
        if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // block spreadsheet formula injection
        return '"' + s.replace(/"/g, '""') + '"';
    }
    function downloadCSV(name, rows) {
        const body = '\ufeff' + rows.map(r => r.map(csvCell).join(',')).join('\r\n');
        const url = URL.createObjectURL(new Blob([body], { type: 'text/csv;charset=utf-8' }));
        const a = document.createElement('a');
        a.href = url; a.download = name;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
    }
    const money2 = c => Number((c / 100).toFixed(2));

    const PRINT_CSS = 'body{font-family:Arial,sans-serif;color:#111;margin:32px;font-size:13px}h1{margin:0;font-size:20px}h2{margin:18px 0 6px;font-size:15px}' +
        '.top{display:flex;justify-content:space-between;border-bottom:3px solid #EA580C;padding-bottom:10px;margin-bottom:14px}' +
        'table{border-collapse:collapse;width:100%;margin:6px 0}th,td{border:1px solid #ccc;padding:6px 8px;text-align:left}th{background:#f3f4f6}' +
        '.num{text-align:right}.tot td{font-weight:bold;background:#fafafa}.big{font-size:22px;font-weight:bold}.muted{color:#666}.rev{text-decoration:line-through;color:#999}' +
        '.sign{margin-top:46px;display:flex;justify-content:space-between}.sign div{border-top:1px solid #333;width:40%;padding-top:4px;text-align:center}';
    function printDoc(title, inner) {
        const html = '<!doctype html><html><head><meta charset="utf-8"><title>' + esc(title) + '</title><style>' + PRINT_CSS + '</style></head><body>' + inner + '</body></html>';
        const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
        const w = window.open(url, '_blank');
        if (!w) notify('Please allow pop-ups to print.', 'warning');
        else w.addEventListener('load', () => { try { w.print(); } catch (e) { /* user can print manually */ } });
        setTimeout(() => URL.revokeObjectURL(url), 60000);
    }
    const docHeader = sub => '<div class="top"><div><h1>' + esc(CFG.schoolName) + '</h1><div class="muted">' + esc(sub) + '</div></div><div class="muted">Printed ' + esc(new Date().toLocaleString()) + '</div></div>';

    function receiptHtml(p) {
        const stu = findStudent(p.student_id) || {};
        const a = stu.id ? account(stu, p.year, 2) : null;
        const al = S.allocByPay.get(p.id) || [];
        return docHeader('Official Fee Receipt') +
            '<p class="big">' + esc(fmt(p.amount_cents)) + '</p>' +
            '<table><tr><th>Receipt no.</th><td>' + esc(p.receipt_no) + '</td><th>Date paid</th><td>' + esc(showDate(p.paid_on)) + '</td></tr>' +
            '<tr><th>Student</th><td>' + esc(p.student_name) + ' (' + esc(p.student_id) + ')</td><th>Class</th><td>' + esc(p.class || '—') + '</td></tr>' +
            '<tr><th>Period</th><td>' + esc(p.term) + ' ' + esc(p.year) + '</td><th>Method</th><td>' + esc(p.method) + '</td></tr>' +
            '<tr><th>Reference</th><td>' + esc(p.reference || '—') + '</td><th>Received by</th><td>' + esc(p.recorded_by) + '</td></tr></table>' +
            '<h2>Payment applied to</h2><table><tr><th>Fee item</th><th>Term</th><th class="num">Amount</th></tr>' +
            (al.length ? al.map(x => { const f = structureOf(x.structure_id) || {}; return '<tr><td>' + esc(f.name || 'Fee item') + ' <span class="muted">(' + esc(f.category || '') + ')</span></td><td>' + esc(f.term || '') + '</td><td class="num">' + esc(fmt(x.amount_cents)) + '</td></tr>'; }).join('') : '<tr><td colspan="3">Not allocated to a specific item</td></tr>') +
            '<tr class="tot"><td colspan="2">Total received</td><td class="num">' + esc(fmt(p.amount_cents)) + '</td></tr></table>' +
            (p.status === 'reversed' ? '<p class="rev"><strong>REVERSED</strong> — ' + esc(p.reversal_reason) + '</p>' : '') +
            (a && p.status === 'valid' ? '<p class="muted">Balance on account for ' + esc(p.year) + ' after all valid payments: <strong>' + esc(fmt(Math.max(0, a.balance))) + '</strong></p>' : '') +
            '<div class="sign"><div>Received by</div><div>Parent / Guardian</div></div>';
    }
    function statementHtml(stu) {
        const a = account(stu, S.year, 2);
        const allPays = S.payments.filter(p => p.student_id === stu.id && p.year === S.year);
        return docHeader('Statement of Account — ' + S.year) +
            '<p><strong>' + esc(stu.name) + '</strong> (' + esc(stu.id) + ') — ' + esc(stu.class) + '</p>' +
            '<h2>Charges</h2><table><tr><th>Term</th><th>Item</th><th class="num">Billed</th><th class="num">Paid</th><th class="num">Owing</th></tr>' +
            (a.lines.length ? a.lines.map(l => '<tr><td>' + esc(l.item.term) + '</td><td>' + esc(l.item.name) + ' (' + esc(l.item.category) + ')</td><td class="num">' + esc(fmt(l.item.amount_cents)) + '</td><td class="num">' + esc(fmt(l.paid)) + '</td><td class="num">' + esc(fmt(l.remaining)) + '</td></tr>').join('') : '<tr><td colspan="5">No charges</td></tr>') +
            (a.unallocated > 0 ? '<tr><td colspan="3">Payments not tied to a specific item</td><td class="num">' + esc(fmt(a.unallocated)) + '</td><td></td></tr>' : '') +
            '<tr class="tot"><td colspan="2">Totals</td><td class="num">' + esc(fmt(a.billed)) + '</td><td class="num">' + esc(fmt(a.paid)) + '</td><td class="num">' + esc(fmt(Math.max(0, a.balance))) + '</td></tr></table>' +
            '<h2>Payments</h2><table><tr><th>Date</th><th>Receipt</th><th>Method</th><th>Applied to</th><th class="num">Amount</th></tr>' +
            (allPays.length ? allPays.map(p => '<tr class="' + (p.status === 'reversed' ? 'rev' : '') + '"><td>' + esc(showDate(p.paid_on)) + '</td><td>' + esc(p.receipt_no) + (p.status === 'reversed' ? ' (reversed)' : '') + '</td><td>' + esc(p.method) + '</td><td>' + esc(allocText(p)) + '</td><td class="num">' + esc(fmt(p.amount_cents)) + '</td></tr>').join('') : '<tr><td colspan="5">No payments</td></tr>') +
            '<tr class="tot"><td colspan="4">Total paid</td><td class="num">' + esc(fmt(a.paid)) + '</td></tr></table>' +
            '<p class="big">Balance: ' + esc(fmt(Math.max(0, a.balance))) + '</p>';
    }

    // ---------- Styles ----------
    const CSS = `
    .fx{--a:#EA580C;--ink:#0F172A;--mut:#64748B;--line:#E2E8F0;--bg:#F8FAFC;color:var(--ink)}
    .fx *{box-sizing:border-box}
    .fx-head{display:flex;flex-wrap:wrap;gap:12px;justify-content:space-between;align-items:center;margin-bottom:14px}
    .fx-head h2{margin:0;font-size:1.35rem}.fx-sub{color:var(--mut);font-size:.85rem;margin-top:2px}
    .fx-ctl{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
    .fx select,.fx input,.fx textarea{border:1px solid var(--line);border-radius:8px;padding:8px 10px;font:inherit;background:#fff;color:var(--ink);max-width:100%}
    .fx select:focus,.fx input:focus,.fx textarea:focus{outline:2px solid rgba(234,88,12,.35);border-color:var(--a)}
    .fx-btn{border:1px solid var(--line);background:#fff;border-radius:8px;padding:8px 14px;font-weight:600;cursor:pointer;color:var(--ink)}
    .fx-btn:hover{border-color:var(--a);color:var(--a)}.fx-btn:disabled{opacity:.5;cursor:not-allowed}
    .fx-btn.pri{background:var(--a);border-color:var(--a);color:#fff}.fx-btn.pri:hover{filter:brightness(.93);color:#fff}
    .fx-btn.dng{color:#B91C1C}.fx-btn.dng:hover{border-color:#B91C1C}
    .fx-sm{padding:5px 10px;font-size:.8rem}
    .fx-tabs{display:flex;gap:4px;overflow-x:auto;border-bottom:1px solid var(--line);margin-bottom:16px}
    .fx-tab{border:0;background:none;padding:10px 14px;font-weight:600;color:var(--mut);cursor:pointer;border-bottom:3px solid transparent;white-space:nowrap}
    .fx-tab.on{color:var(--a);border-bottom-color:var(--a)}
    .fx-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px;margin-bottom:16px}
    .fx-card{background:#fff;border:1px solid var(--line);border-radius:12px;padding:14px 16px}
    .fx-card .l{font-size:.78rem;color:var(--mut);text-transform:uppercase;letter-spacing:.04em}
    .fx-card .v{font-size:1.45rem;font-weight:700;margin-top:4px}.fx-card .s{font-size:.8rem;color:var(--mut);margin-top:2px}
    .fx-card.ok .v{color:#15803D}.fx-card.bad .v{color:#B91C1C}.fx-card.acc .v{color:var(--a)}
    .fx-bar{height:8px;background:#EEF2F7;border-radius:99px;overflow:hidden;margin-top:8px}.fx-bar i{display:block;height:100%;background:var(--a)}
    .fx-panel{background:#fff;border:1px solid var(--line);border-radius:12px;padding:14px 16px;margin-bottom:16px}
    .fx-panel h3{margin:0 0 10px;font-size:1rem}
    .fx-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:16px}
    .fx-scroll{overflow-x:auto}
    .fx table{border-collapse:collapse;width:100%;font-size:.88rem}
    .fx th{text-align:left;color:var(--mut);font-size:.75rem;text-transform:uppercase;letter-spacing:.04em;padding:8px 10px;border-bottom:1px solid var(--line);white-space:nowrap}
    .fx td{padding:9px 10px;border-bottom:1px solid #F1F5F9;vertical-align:middle}
    .fx td.num,.fx th.num{text-align:right;font-variant-numeric:tabular-nums}
    .fx tr.rev td{color:#94A3B8;text-decoration:line-through}.fx tr.rev td:last-child{text-decoration:none}
    .fx-act{display:flex;gap:6px;flex-wrap:wrap}
    .fx-b{display:inline-block;padding:2px 10px;border-radius:99px;font-size:.75rem;font-weight:700}
    .fx-b.paid{background:#DCFCE7;color:#15803D}.fx-b.partial{background:#FEF3C7;color:#B45309}
    .fx-b.unpaid{background:#FEE2E2;color:#B91C1C}.fx-b.none,.fx-b.rv{background:#F1F5F9;color:#64748B}
    .fx-filters{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}
    .fx-banner{padding:10px 14px;border-radius:10px;margin-bottom:12px;font-size:.88rem}
    .fx-banner.err{background:#FEE2E2;color:#991B1B}.fx-banner.warn{background:#FEF3C7;color:#92400E}
    .fx-empty{text-align:center;color:var(--mut);padding:24px}
    .fx-form{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;align-items:end}
    .fx-form label{display:block;font-size:.78rem;font-weight:600;color:var(--mut);margin-bottom:3px}
    .fx-form input,.fx-form select{width:100%}
    .fx-modal{position:fixed;inset:0;background:rgba(15,23,42,.55);display:none;align-items:flex-start;justify-content:center;padding:4vh 12px;overflow:auto;z-index:10000}
    .fx-modal.open{display:flex}
    .fx-dialog{background:#fff;border-radius:14px;width:min(720px,100%);padding:20px;box-shadow:0 20px 50px rgba(0,0,0,.25)}
    .fx-dialog h3{margin:0 0 4px}.fx-dlg-top{display:flex;justify-content:space-between;align-items:start;gap:10px;margin-bottom:12px}
    .fx-x{border:0;background:none;font-size:1.4rem;cursor:pointer;color:var(--mut);line-height:1}
    .fx-bal{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:10px 0}
    .fx-bal div{background:var(--bg);border-radius:10px;padding:8px 10px}.fx-bal b{display:block;font-size:1.05rem}.fx-bal span{font-size:.72rem;color:var(--mut);text-transform:uppercase}
    .fx-check{display:flex;gap:8px;align-items:center;padding:6px 0}.fx-check input{width:auto}
    .fx-pay-in{width:110px;text-align:right}
    .fx-paytotal{display:flex;justify-content:space-between;align-items:center;margin:10px 0;padding:10px 14px;background:var(--bg);border-radius:10px;font-size:1.05rem}
    .fx-paytotal b{font-size:1.25rem;color:var(--a)}
    `;

    // ---------- HTML building blocks ----------
    const badge = st => {
        const m = { 'Paid': 'paid', 'Partial': 'partial', 'Unpaid': 'unpaid', 'No fees': 'none' };
        return '<span class="fx-b ' + (m[st] || 'none') + '">' + esc(st) + '</span>';
    };
    const card = (l, v, s, tone) => '<div class="fx-card ' + (tone || '') + '"><div class="l">' + esc(l) + '</div><div class="v">' + esc(v) + '</div><div class="s">' + esc(s || '') + '</div></div>';
    const opts = (list, sel, blank) => (blank != null ? '<option value="">' + esc(blank) + '</option>' : '') +
        list.map(v => '<option value="' + esc(v) + '"' + (String(v) === String(sel) ? ' selected' : '') + '>' + esc(v) + '</option>').join('');
    const classNames = () => { const c = getData('classes') || []; return c.map(x => x.name).filter(Boolean).sort(); };
    const years = () => {
        const set = new Set([now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1, S.year]);
        S.structures.forEach(f => set.add(f.year));
        return Array.from(set).sort((a, b) => b - a);
    };
    const owingText = r => r.lines.filter(l => l.remaining > 0).map(l => l.item.name + (l.item.term !== S.term ? ' (' + l.item.term + ')' : '') + ' ' + fmt(l.remaining)).join('; ');

    function totals(A) {
        const billed = sum(A, r => r.billed);
        const collected = sum(A, r => r.paid);
        const outstanding = sum(A, r => Math.max(0, r.balance));
        const rate = billed > 0 ? Math.min(100, Math.round(collected / billed * 1000) / 10) : 0;
        const inArrears = A.filter(r => r.balance > 0).length;
        const today = sum(S.payments.filter(p => p.status === 'valid' && p.paid_on === todayISO()), p => p.amount_cents);
        return { billed, collected, outstanding, rate, inArrears, today };
    }

    // ---------- Tabs ----------
    function headerHtml() {
        return '<div class="fx-head"><div><h2>Fees &amp; Finance</h2><div class="fx-sub">' + esc(S.term) + ' ' + esc(S.year) + ' · amounts shown in ' + esc(symbol()) + '</div></div>' +
            '<div class="fx-ctl"><select id="fx-year" data-action="set-year" aria-label="Year">' + opts(years(), S.year) + '</select>' +
            '<select id="fx-term" data-action="set-term" aria-label="Term">' + opts(CFG.terms, S.term) + '</select>' +
            '<button class="fx-btn" data-action="refresh">Refresh</button></div></div>';
    }
    function bannersHtml() {
        let h = '';
        if (S.loadError) h += '<div class="fx-banner err">' + esc(S.loadError) + '</div>';
        else if (!can.record()) h += '<div class="fx-banner warn">Read-only: your account role ("' + esc(role() || 'none') + '") cannot record payments. Allowed roles are set in CFG at the top of fees.js.</div>';
        return h;
    }
    function tabsHtml() {
        const tabs = [['overview', 'Overview'], ['accounts', 'Student Accounts'], ['payments', 'Payments'], ['structures', 'Fee Structures'], ['arrears', 'Arrears'], ['reports', 'Reports']];
        return '<div class="fx-tabs" role="tablist">' + tabs.map(t => '<button class="fx-tab' + (S.tab === t[0] ? ' on' : '') + '" role="tab" data-action="tab" data-tab="' + t[0] + '">' + t[1] + '</button>').join('') + '</div>';
    }

    function overviewHtml() {
        const A = accounts(), T = totals(A);
        const recent = S.payments.filter(p => p.status === 'valid').slice(0, 6);
        const top = A.filter(r => r.balance > 0).sort((a, b) => b.balance - a.balance).slice(0, 5);
        return '<div class="fx-cards">' +
            card('Total billed', fmt(T.billed), 'Through ' + S.term, 'acc') +
            card('Collected', fmt(T.collected), 'All valid payments in ' + S.year, 'ok') +
            card('Outstanding', fmt(T.outstanding), T.inArrears + ' account(s) in arrears', 'bad') +
            '<div class="fx-card"><div class="l">Collection rate</div><div class="v">' + T.rate + '%</div><div class="fx-bar"><i style="width:' + T.rate + '%"></i></div></div>' +
            card('Collected today', fmt(T.today), showDate(todayISO())) + '</div>' +
            '<div class="fx-grid"><div class="fx-panel"><h3>Recent payments</h3>' +
            (recent.length ? '<div class="fx-scroll"><table><tbody>' + recent.map(p => '<tr><td>' + esc(p.student_name) + '<br><small style="color:#64748B">' + esc(p.receipt_no) + ' · ' + esc(allocText(p, false)) + '</small></td><td class="num">' + esc(fmt(p.amount_cents)) + '</td><td>' + esc(showDate(p.paid_on)) + '</td></tr>').join('') + '</tbody></table></div>' : '<div class="fx-empty">No payments recorded yet.</div>') + '</div>' +
            '<div class="fx-panel"><h3>Largest balances</h3>' +
            (top.length ? '<div class="fx-scroll"><table><tbody>' + top.map(r => '<tr><td>' + esc(r.stu.name) + '<br><small style="color:#64748B">' + esc(r.stu.class) + '</small></td><td class="num">' + esc(fmt(r.balance)) + '</td></tr>').join('') + '</tbody></table></div>' : '<div class="fx-empty">No outstanding balances.</div>') + '</div></div>';
    }

    function accountsHtml() {
        const q = S.f.q.toLowerCase();
        const rows = accounts().filter(r =>
            (!q || r.stu.name.toLowerCase().includes(q) || String(r.stu.id).toLowerCase().includes(q)) &&
            (!S.f.cls || r.stu.class === S.f.cls) && (!S.f.status || r.status === S.f.status));
        return '<div class="fx-filters"><input id="fx-f-q" data-filter="q" placeholder="Search name or ID" value="' + esc(S.f.q) + '">' +
            '<select id="fx-f-cls" data-filter="cls">' + opts(classNames(), S.f.cls, 'All classes') + '</select>' +
            '<select id="fx-f-status" data-filter="status">' + opts(['Paid', 'Partial', 'Unpaid', 'No fees'], S.f.status, 'All statuses') + '</select>' +
            '<button class="fx-btn" data-action="export-accounts">Export CSV</button></div>' +
            '<div class="fx-panel fx-scroll"><table><thead><tr><th>ID</th><th>Student</th><th>Class</th><th class="num">Billed</th><th class="num">Paid</th><th class="num">Balance</th><th>Status</th><th></th></tr></thead><tbody>' +
            (rows.length ? rows.map(r => '<tr><td>' + esc(r.stu.id) + '</td><td>' + esc(r.stu.name) + '</td><td>' + esc(r.stu.class) + '</td><td class="num">' + esc(fmt(r.billed)) + '</td><td class="num">' + esc(fmt(r.paid)) + '</td><td class="num">' + esc(fmt(Math.max(0, r.balance))) + '</td><td>' + badge(r.status) + '</td>' +
                '<td><div class="fx-act"><button class="fx-btn fx-sm" data-action="statement" data-id="' + esc(r.stu.id) + '">Statement</button>' +
                (can.record() && r.status !== 'Paid' ? '<button class="fx-btn fx-sm pri" data-action="open-pay" data-id="' + esc(r.stu.id) + '">Record payment</button>' : '') + '</div></td></tr>').join('')
                : '<tr><td colspan="8" class="fx-empty">No students match.</td></tr>') + '</tbody></table></div>';
    }

    function paymentsHtml() {
        const q = S.f.pq.toLowerCase();
        const rows = S.payments.filter(p => p.year === S.year &&
            (!q || p.student_name.toLowerCase().includes(q) || p.receipt_no.toLowerCase().includes(q) || String(p.reference || '').toLowerCase().includes(q)) &&
            (!S.f.method || p.method === S.f.method));
        return '<div class="fx-filters"><input id="fx-f-pq" data-filter="pq" placeholder="Search name, receipt or reference" value="' + esc(S.f.pq) + '">' +
            '<select id="fx-f-method" data-filter="method">' + opts(CFG.methods, S.f.method, 'All methods') + '</select>' +
            '<button class="fx-btn" data-action="export-payments">Export CSV</button></div>' +
            '<div class="fx-panel fx-scroll"><table><thead><tr><th>Receipt</th><th>Date</th><th>Student</th><th>Paid for</th><th>Method</th><th class="num">Amount</th><th>By</th><th></th></tr></thead><tbody>' +
            (rows.length ? rows.map(p => '<tr class="' + (p.status === 'reversed' ? 'rev' : '') + '"><td>' + esc(p.receipt_no) + '</td><td>' + esc(showDate(p.paid_on)) + '</td><td>' + esc(p.student_name) + '</td><td>' + esc(allocText(p, false)) + '</td><td>' + esc(p.method) + '</td><td class="num">' + esc(fmt(p.amount_cents)) + '</td><td>' + esc(p.recorded_by) + '</td>' +
                '<td><div class="fx-act"><button class="fx-btn fx-sm" data-action="receipt" data-id="' + esc(p.id) + '">Receipt</button>' +
                (p.status === 'valid' && can.reverse() ? '<button class="fx-btn fx-sm dng" data-action="open-reverse" data-id="' + esc(p.id) + '">Reverse</button>' : '') +
                (p.status === 'reversed' ? '<span class="fx-b rv" title="' + esc(p.reversal_reason) + '">Reversed</span>' : '') + '</div></td></tr>').join('')
                : '<tr><td colspan="8" class="fx-empty">No payments for ' + esc(S.year) + '.</td></tr>') + '</tbody></table></div>';
    }

    function structuresHtml() {
        const list = S.structures.filter(f => f.year === S.year).sort((a, b) => termIdx(a.term) - termIdx(b.term) || (a.form_level || 0) - (b.form_level || 0));
        const form = can.structure() ? '<div class="fx-panel"><h3>Add fee item</h3><div class="fx-form">' +
            '<div><label for="fx-s-term">Term</label><select id="fx-s-term">' + opts(CFG.terms, S.term) + '</select></div>' +
            '<div><label for="fx-s-level">Form level</label><select id="fx-s-level"><option value="">All forms</option>' + [1, 2, 3, 4, 5, 6].map(n => '<option value="' + n + '">Form ' + n + '</option>').join('') + '</select></div>' +
            '<div><label for="fx-s-cat">Category</label><select id="fx-s-cat">' + opts(CFG.categories, 'Tuition') + '</select></div>' +
            '<div><label for="fx-s-name">Name</label><input id="fx-s-name" maxlength="60" placeholder="e.g. Tuition"></div>' +
            '<div><label for="fx-s-amt">Amount</label><input id="fx-s-amt" inputmode="decimal" placeholder="0.00"></div>' +
            '<div><label class="fx-check"><input type="checkbox" id="fx-s-opt"> Optional</label></div>' +
            '<div><button class="fx-btn pri" data-action="add-structure">Add item</button></div></div>' +
            '<p class="fx-sub" style="margin:8px 0 0">Items apply to ' + esc(S.year) + '. Amounts are locked once saved: archive an item and add a corrected one instead. Optional items (boarding, transport) are switched on per student from their statement.</p></div>' : '';
        return form + '<div class="fx-panel fx-scroll"><h3>Fee structure ' + esc(S.year) + '</h3><table><thead><tr><th>Term</th><th>Level</th><th>Item</th><th>Type</th><th class="num">Amount</th><th>Status</th><th></th></tr></thead><tbody>' +
            (list.length ? list.map(f => '<tr class="' + (f.active ? '' : 'rev') + '"><td>' + esc(f.term) + '</td><td>' + (f.form_level ? 'Form ' + esc(f.form_level) : 'All') + '</td><td>' + esc(f.name) + ' <small style="color:#64748B">' + esc(f.category) + '</small></td><td>' + (f.optional ? 'Optional' : 'Compulsory') + '</td><td class="num">' + esc(fmt(f.amount_cents)) + '</td><td>' + (f.active ? 'Active' : 'Archived') + '</td>' +
                '<td>' + (f.active && can.structure() ? '<button class="fx-btn fx-sm dng" data-action="archive-structure" data-id="' + esc(f.id) + '">Archive</button>' : '') + '</td></tr>').join('')
                : '<tr><td colspan="7" class="fx-empty">No fee items for ' + esc(S.year) + ' yet. Add your first item above.</td></tr>') + '</tbody></table></div>';
    }

    function arrearsHtml() {
        const list = accounts().filter(r => r.balance > 0 && (!S.f.cls || r.stu.class === S.f.cls)).sort((a, b) => b.balance - a.balance);
        S.arrears = list.map(r => {
            const owing = owingText(r);
            return {
                r, owing, msg: 'Dear ' + (r.stu.parentName || 'Parent/Guardian') + ', this is a reminder from ' + CFG.schoolName + ' that the fees balance for ' + r.stu.name + ' (' + r.stu.class + ') up to ' + S.term + ' ' + S.year + ' is ' + fmt(r.balance) +
                    (owing ? ', made up of: ' + owing : '') + '. Kindly settle at your earliest convenience. Thank you.'
            };
        });
        return '<div class="fx-filters"><select id="fx-f-cls" data-filter="cls">' + opts(classNames(), S.f.cls, 'All classes') + '</select>' +
            '<button class="fx-btn" data-action="export-arrears">Export CSV</button></div>' +
            '<div class="fx-panel fx-scroll"><h3>Accounts owing — ' + fmt(sum(list, r => r.balance)) + ' in total</h3><table><thead><tr><th>Student</th><th>Class</th><th>Parent / phone</th><th>Owing for</th><th class="num">Balance</th><th>Reminder</th></tr></thead><tbody>' +
            (S.arrears.length ? S.arrears.map((x, i) => {
                const link = waLink(x.r.stu.phone, x.msg);
                return '<tr><td>' + esc(x.r.stu.name) + '</td><td>' + esc(x.r.stu.class) + '</td><td>' + esc(x.r.stu.parentName || '—') + '<br><small style="color:#64748B">' + esc(x.r.stu.phone || 'No phone') + '</small></td><td><small>' + esc(x.owing || '—') + '</small></td><td class="num">' + esc(fmt(x.r.balance)) + '</td>' +
                    '<td><div class="fx-act">' + (link ? '<a class="fx-btn fx-sm" href="' + esc(link) + '" target="_blank" rel="noopener noreferrer">WhatsApp</a>' : '') + '<button class="fx-btn fx-sm" data-action="copy-msg" data-i="' + i + '">Copy message</button></div></td></tr>';
            }).join('') : '<tr><td colspan="6" class="fx-empty">No accounts owe money. 🎉</td></tr>') + '</tbody></table></div>';
    }
    function waLink(phone, msg) {
        let d = String(phone || '').replace(/\D/g, '');
        if (!d) return null;
        if (d.startsWith('0')) d = '263' + d.slice(1);
        if (d.length < 9 || d.length > 15) return null;
        return 'https://wa.me/' + d + '?text=' + encodeURIComponent(msg);
    }

    function reportsHtml() {
        const A = accounts(), pays = yearPayments();
        const byClass = {};
        A.forEach(r => { const k = r.stu.class || '—'; const o = byClass[k] || (byClass[k] = { billed: 0, paid: 0, owed: 0, n: 0 }); o.billed += r.billed; o.paid += r.paid; o.owed += Math.max(0, r.balance); o.n++; });
        const group = key => { const m = {}; pays.forEach(p => { m[p[key]] = (m[p[key]] || 0) + p.amount_cents; }); return m; };
        const byType = {};
        pays.forEach(p => {
            let got = 0;
            (S.allocByPay.get(p.id) || []).forEach(x => { const f = structureOf(x.structure_id); const k = f ? f.category : 'Other'; byType[k] = (byType[k] || 0) + x.amount_cents; got += x.amount_cents; });
            if (p.amount_cents - got > 0) byType['Unallocated'] = (byType['Unallocated'] || 0) + (p.amount_cents - got);
        });
        const simple = (m, order) => { const keys = order ? order.filter(k => m[k]) : Object.keys(m); return keys.length ? keys.map(k => '<tr><td>' + esc(k) + '</td><td class="num">' + esc(fmt(m[k])) + '</td></tr>').join('') : '<tr><td colspan="2" class="fx-empty">No data</td></tr>'; };
        return '<div class="fx-filters"><button class="fx-btn" data-action="export-accounts">Export accounts CSV</button><button class="fx-btn" data-action="export-payments">Export payments CSV</button></div>' +
            '<div class="fx-panel fx-scroll"><h3>Collections by class — ' + esc(S.year) + '</h3><table><thead><tr><th>Class</th><th class="num">Students</th><th class="num">Billed</th><th class="num">Collected</th><th class="num">Outstanding</th><th class="num">Rate</th></tr></thead><tbody>' +
            (Object.keys(byClass).sort().map(k => { const o = byClass[k]; return '<tr><td>' + esc(k) + '</td><td class="num">' + o.n + '</td><td class="num">' + esc(fmt(o.billed)) + '</td><td class="num">' + esc(fmt(o.paid)) + '</td><td class="num">' + esc(fmt(o.owed)) + '</td><td class="num">' + (o.billed ? Math.min(100, Math.round(o.paid / o.billed * 100)) : 0) + '%</td></tr>'; }).join('') || '<tr><td colspan="6" class="fx-empty">No data</td></tr>') + '</tbody></table></div>' +
            '<div class="fx-grid"><div class="fx-panel"><h3>By fee type</h3><table><tbody>' + simple(byType) + '</tbody></table></div>' +
            '<div class="fx-panel"><h3>By term received</h3><table><tbody>' + simple(group('term'), CFG.terms) + '</tbody></table></div>' +
            '<div class="fx-panel"><h3>By payment method</h3><table><tbody>' + simple(group('method')) + '</tbody></table></div></div>';
    }

    // ---------- Render ----------
    function render() {
        if (!S.root) return;
        const ae = document.activeElement;
        const fid = ae && S.root.contains(ae) ? ae.id : null;
        const pos = ae && ae.selectionStart;
        let body = '';
        if (!S.loaded && !S.loadError) body = '<div class="fx-empty">Loading fee data…</div>';
        else if (S.loadError && !S.loaded) body = '';
        else body = ({ overview: overviewHtml, accounts: accountsHtml, payments: paymentsHtml, structures: structuresHtml, arrears: arrearsHtml, reports: reportsHtml }[S.tab] || overviewHtml)();
        S.root.innerHTML = headerHtml() + bannersHtml() + (S.loaded ? tabsHtml() : '') + '<div>' + body + '</div>';
        if (fid) {
            const el = document.getElementById(fid);
            if (el) { el.focus(); if (pos != null && el.setSelectionRange) { try { el.setSelectionRange(pos, pos); } catch (e) { /* not a text field */ } } }
        }
    }

    // ---------- Modals ----------
    function openModal(inner, wide) {
        S.modal.innerHTML = '<div class="fx-dialog" role="dialog" aria-modal="true"' + (wide ? ' style="width:min(860px,100%)"' : '') + '>' + inner + '</div>';
        S.modal.classList.add('open');
        const first = S.modal.querySelector('input,select,textarea,button[data-action]');
        if (first) first.focus();
    }
    function closeModal() { S.modal.classList.remove('open'); S.modal.innerHTML = ''; S.modal.dataset.id = ''; }
    const dlgTop = (t, sub) => '<div class="fx-dlg-top"><div><h3>' + esc(t) + '</h3><div class="fx-sub">' + esc(sub || '') + '</div></div><button class="fx-x" data-action="close-modal" aria-label="Close">×</button></div>';

    // ----- Record payment: the cashier chooses which fee item(s) the money is for -----
    function openPay(id) {
        if (!can.record()) return notify('Your role cannot record payments.', 'error');
        const stu = findStudent(id); if (!stu) return notify('Student not found.', 'error');
        const a = account(stu, S.year, 2);
        const fullBal = Math.max(0, a.balance);
        if (fullBal <= 0 || !a.lines.some(l => l.remaining > 0)) return notify('This account has nothing left to pay for ' + S.year + '.', 'info');
        S.modal.dataset.id = id;
        const rows = a.lines.map(l => {
            const it = l.item;
            const label = esc(it.term) + ' · ' + esc(it.name) + ' <small style="color:#64748B">' + esc(it.category) + '</small>';
            if (l.remaining <= 0) return '<tr><td>' + label + '</td><td class="num">' + esc(fmt(it.amount_cents)) + '</td><td class="num">' + esc(fmt(l.paid)) + '</td><td class="num">—</td><td style="text-align:right"><span class="fx-b paid">Paid</span></td></tr>';
            return '<tr><td>' + label + '</td><td class="num">' + esc(fmt(it.amount_cents)) + '</td><td class="num">' + esc(fmt(l.paid)) + '</td><td class="num"><b>' + esc(fmt(l.remaining)) + '</b></td>' +
                '<td><div class="fx-act" style="flex-wrap:nowrap;justify-content:flex-end"><input class="fx-pay-in" data-sid="' + esc(it.id) + '" inputmode="decimal" placeholder="0.00" aria-label="Amount to pay for ' + esc(it.name) + '">' +
                '<button class="fx-btn fx-sm" data-action="pay-full" data-sid="' + esc(it.id) + '" data-amt="' + (l.remaining / 100).toFixed(2) + '">Full</button></div></td></tr>';
        }).join('');
        openModal(dlgTop('Record payment', stu.name + ' · ' + stu.class) +
            '<div class="fx-bal"><div><span>Billed (' + esc(S.year) + ')</span><b>' + esc(fmt(a.billed)) + '</b></div><div><span>Paid</span><b>' + esc(fmt(a.paid)) + '</b></div><div><span>Balance</span><b>' + esc(fmt(fullBal)) + '</b></div></div>' +
            '<h4 style="margin:8px 0 4px">What is being paid for?</h4>' +
            '<p class="fx-sub" style="margin:0 0 6px">Type an amount next to each item the money is for, or press Full. Leave an item blank to pay nothing toward it.</p>' +
            '<div class="fx-scroll"><table><thead><tr><th>Fee item</th><th class="num">Billed</th><th class="num">Paid</th><th class="num">Owing</th><th class="num">Pay now</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
            '<div class="fx-act" style="justify-content:flex-end;margin-top:6px"><button class="fx-btn fx-sm" data-action="pay-all">Pay everything owing</button></div>' +
            '<div class="fx-paytotal"><span>Total being paid</span><b id="fx-p-total">' + esc(fmt(0)) + '</b></div>' +
            '<div class="fx-form"><div><label for="fx-p-term">Term received</label><select id="fx-p-term">' + opts(CFG.terms, S.term) + '</select></div>' +
            '<div><label for="fx-p-method">Method</label><select id="fx-p-method">' + opts(CFG.methods, 'Cash') + '</select></div>' +
            '<div><label for="fx-p-date">Date paid</label><input id="fx-p-date" type="date" max="' + todayISO() + '" value="' + todayISO() + '"></div>' +
            '<div style="grid-column:1/-1"><label for="fx-p-ref">Reference (EcoCash / bank ref)</label><input id="fx-p-ref" maxlength="60"></div>' +
            '<div style="grid-column:1/-1"><label for="fx-p-note">Note (optional)</label><input id="fx-p-note" maxlength="120"></div></div>' +
            '<p class="fx-sub">Each item cannot be overpaid. A receipt number is generated automatically.</p>' +
            '<div class="fx-act" style="justify-content:flex-end;margin-top:10px"><button class="fx-btn" data-action="close-modal">Cancel</button><button class="fx-btn pri" id="fx-p-save" data-action="submit-pay">Save payment</button></div>', true);
    }
    function payInputs() { return Array.prototype.slice.call(S.modal.querySelectorAll('.fx-pay-in')); }
    function updatePayTotal() {
        const el = document.getElementById('fx-p-total'); if (!el) return;
        let t = 0, bad = false;
        payInputs().forEach(i => { const v = i.value.trim(); if (!v) return; const c = parseMoney(v); if (c == null) bad = true; else t += c; });
        el.textContent = fmt(t) + (bad ? '  (check the amounts)' : '');
    }
    function fillFull(btn) {
        const inp = payInputs().find(i => i.dataset.sid === btn.dataset.sid);
        if (inp) inp.value = btn.dataset.amt;
    }

    async function nextReceipt() {
        const y = new Date().getFullYear();
        const c = db();
        const { data } = await c.from('fee_payments').select('receipt_no').like('receipt_no', 'RCT-' + y + '-%').order('receipt_no', { ascending: false }).limit(1);
        const last = data && data[0] ? parseInt(String(data[0].receipt_no).split('-')[2], 10) : 0;
        return 'RCT-' + y + '-' + String((isNaN(last) ? 0 : last) + 1).padStart(6, '0');
    }

    async function submitPay() {
        if (S.busy) return;
        if (!can.record()) return notify('Your role cannot record payments.', 'error');
        const c = db(); if (!c) return notify('Not connected to the server.', 'error');
        const stu = findStudent(S.modal.dataset.id); if (!stu) return notify('Student not found.', 'error');
        const val = id => (document.getElementById(id) || {}).value || '';
        const term = val('fx-p-term'), method = val('fx-p-method'), paidOn = val('fx-p-date');
        const ref = val('fx-p-ref').trim().slice(0, 60), note = val('fx-p-note').trim().slice(0, 120);

        if (!CFG.terms.includes(term)) return notify('Choose a valid term.', 'warning');
        if (!CFG.methods.includes(method)) return notify('Choose a valid payment method.', 'warning');
        if (!validDate(paidOn)) return notify('Enter a valid date that is not in the future.', 'warning');
        if (method !== 'Cash' && !ref) return notify('A reference is required for ' + method + ' payments.', 'warning');

        S.busy = true;
        const btn = document.getElementById('fx-p-save'); if (btn) btn.disabled = true;
        try {
            await reloadPayments(); // work from the latest numbers, not a stale screen
            const a = account(stu, S.year, 2);
            const allocs = []; let total = 0;
            for (const inp of payInputs()) {
                const v = inp.value.trim(); if (!v) continue;
                const line = a.lines.find(l => l.item.id === inp.dataset.sid);
                if (!line) return notify('A fee item changed while this window was open. Close it and try again.', 'error');
                const cents = parseMoney(v);
                if (cents == null) return notify('Enter a valid amount for ' + line.item.name + ', for example 20.00.', 'warning');
                if (cents > line.remaining) return notify(line.item.name + ' (' + line.item.term + ') only has ' + fmt(line.remaining) + ' owing. Overpayments are not allowed.', 'error');
                allocs.push({ structure_id: line.item.id, amount_cents: cents });
                total += cents;
            }
            if (!allocs.length) return notify('Type an amount next to at least one fee item.', 'warning');
            if (total > Math.max(0, a.balance)) return notify('Total is more than the balance of ' + fmt(Math.max(0, a.balance)) + '.', 'error');
            if (total > CFG.maxAmountCents) return notify('Amount is too large.', 'error');
            if (ref && S.payments.some(p => p.status === 'valid' && p.method === method && String(p.reference || '').toLowerCase() === ref.toLowerCase()))
                return notify('That ' + method + ' reference was already used on another payment.', 'error');

            let saved = null;
            for (let attempt = 0; attempt < 4 && !saved; attempt++) {
                const row = {
                    id: uid('FP'), receipt_no: await nextReceipt(), student_id: stu.id, student_name: stu.name, class: stu.class || '',
                    year: S.year, term, amount_cents: total, method, reference: ref || '', note: note || '',
                    paid_on: paidOn, recorded_by: actor()
                };
                // One database step saves the payment AND what it was applied to, or neither.
                const { error } = await c.rpc('fee_record_payment', { p: row, a: allocs });
                if (!error) saved = row;
                else if (error.code === '23505' && /receipt_no/.test(error.message)) continue; // someone else took that number; try the next
                else { console.warn(error); return notify('Payment was NOT saved: ' + error.message, 'error'); }
            }
            if (!saved) return notify('Could not get a unique receipt number. Please try again.', 'error');

            await audit('payment_recorded', saved.id, { receipt: saved.receipt_no, student: stu.id, amount_cents: total, method, term, year: S.year, allocations: allocs });
            if (typeof addActivity === 'function') addActivity('💰', 'Payment ' + saved.receipt_no + ': ' + stu.name + ' — ' + fmt(total));
            await reloadPayments();
            closeModal(); render();
            notify('Payment saved. Receipt ' + saved.receipt_no, 'success');
            printDoc('Receipt ' + saved.receipt_no, receiptHtml(Object.assign({ status: 'valid' }, saved)));
        } finally {
            S.busy = false;
            const b = document.getElementById('fx-p-save'); if (b) b.disabled = false;
        }
    }

    function openReverse(id) {
        if (!can.reverse()) return notify('Your role cannot reverse payments.', 'error');
        const p = S.payments.find(x => x.id === id); if (!p || p.status !== 'valid') return;
        S.modal.dataset.id = id;
        openModal(dlgTop('Reverse payment', p.receipt_no + ' · ' + p.student_name + ' · ' + fmt(p.amount_cents)) +
            '<p>Paid for: ' + esc(allocText(p)) + '</p>' +
            '<p>The payment stays on record, marked as reversed, and the balances for those items go back up. This cannot be undone.</p>' +
            '<div class="fx-form"><div style="grid-column:1/-1"><label for="fx-r-reason">Reason (required)</label><textarea id="fx-r-reason" rows="3" maxlength="200" style="width:100%"></textarea></div></div>' +
            '<div class="fx-act" style="justify-content:flex-end;margin-top:10px"><button class="fx-btn" data-action="close-modal">Cancel</button><button class="fx-btn dng" id="fx-r-save" data-action="submit-reverse">Reverse payment</button></div>');
    }
    async function submitReverse() {
        if (S.busy || !can.reverse()) return;
        const c = db(); if (!c) return;
        const id = S.modal.dataset.id;
        const reason = ((document.getElementById('fx-r-reason') || {}).value || '').trim().slice(0, 200);
        if (reason.length < 5) return notify('Please give a reason of at least 5 characters.', 'warning');
        S.busy = true;
        try {
            const { data, error } = await c.from('fee_payments')
                .update({ status: 'reversed', reversal_reason: reason, reversed_by: actor() })
                .eq('id', id).eq('status', 'valid').select();
            if (error) return notify('Reversal failed: ' + error.message, 'error');
            if (!data || !data.length) return notify('That payment was already reversed or could not be found.', 'warning');
            await audit('payment_reversed', id, { reason });
            await reloadPayments();
            closeModal(); render();
            notify('Payment reversed.', 'success');
        } finally { S.busy = false; }
    }

    function openStatement(id) {
        const stu = findStudent(id); if (!stu) return;
        S.modal.dataset.id = id;
        const a = account(stu, S.year, 2);
        const lvl = levelOf(stu);
        const optional = S.structures.filter(f => f.active && f.optional && f.year === S.year && (f.form_level == null || f.form_level === lvl));
        const all = S.payments.filter(p => p.student_id === id && p.year === S.year);
        openModal(dlgTop(stu.name + ' — Statement ' + S.year, stu.class + ' · ' + stu.id) +
            '<div class="fx-bal"><div><span>Billed</span><b>' + esc(fmt(a.billed)) + '</b></div><div><span>Paid</span><b>' + esc(fmt(a.paid)) + '</b></div><div><span>Balance</span><b>' + esc(fmt(Math.max(0, a.balance))) + '</b></div></div>' +
            '<h4>Charges</h4><div class="fx-scroll"><table><thead><tr><th>Term</th><th>Item</th><th class="num">Billed</th><th class="num">Paid</th><th class="num">Owing</th><th></th></tr></thead><tbody>' +
            (a.lines.length ? a.lines.map(l => '<tr><td>' + esc(l.item.term) + '</td><td>' + esc(l.item.name) + ' <small style="color:#64748B">' + esc(l.item.category) + '</small></td><td class="num">' + esc(fmt(l.item.amount_cents)) + '</td><td class="num">' + esc(fmt(l.paid)) + '</td><td class="num">' + esc(fmt(l.remaining)) + '</td><td>' + badge(lineStatus(l)) + '</td></tr>').join('') : '<tr><td colspan="6" class="fx-empty">No fees set for this student and year.</td></tr>') +
            (a.unallocated > 0 ? '<tr><td colspan="3"><small>Payments not tied to a specific item</small></td><td class="num">' + esc(fmt(a.unallocated)) + '</td><td colspan="2"></td></tr>' : '') + '</tbody></table></div>' +
            (optional.length ? '<h4>Optional fees</h4>' + optional.map(f => '<label class="fx-check"><input type="checkbox" data-action="toggle-assign" data-sid="' + esc(f.id) + '"' + (S.assignments.some(x => x.student_id === id && x.structure_id === f.id) ? ' checked' : '') + (can.structure() ? '' : ' disabled') + '> ' + esc(f.term) + ' · ' + esc(f.name) + ' — ' + esc(fmt(f.amount_cents)) + '</label>').join('') : '') +
            '<h4>Payments</h4><div class="fx-scroll"><table><tbody>' + (all.length ? all.map(p => '<tr class="' + (p.status === 'reversed' ? 'rev' : '') + '"><td>' + esc(showDate(p.paid_on)) + '</td><td>' + esc(p.receipt_no) + '</td><td>' + esc(p.method) + '</td><td><small>' + esc(allocText(p)) + '</small></td><td class="num">' + esc(fmt(p.amount_cents)) + '</td><td><button class="fx-btn fx-sm" data-action="receipt" data-id="' + esc(p.id) + '">Receipt</button></td></tr>').join('') : '<tr><td class="fx-empty">No payments yet.</td></tr>') + '</tbody></table></div>' +
            '<div class="fx-act" style="justify-content:flex-end;margin-top:12px"><button class="fx-btn" data-action="close-modal">Close</button>' +
            (can.record() && a.balance > 0 ? '<button class="fx-btn pri" data-action="open-pay" data-id="' + esc(id) + '">Record payment</button>' : '') +
            '<button class="fx-btn" data-action="print-statement" data-id="' + esc(id) + '">Print statement</button></div>', true);
    }

    async function toggleAssign(structureId, checked) {
        if (!can.structure()) return;
        const c = db(); const id = S.modal.dataset.id; if (!c || !id) return;
        let error;
        if (checked) ({ error } = await c.from('fee_assignments').insert({ id: uid('FA'), student_id: id, structure_id: structureId, created_by: actor() }));
        else ({ error } = await c.from('fee_assignments').delete().eq('student_id', id).eq('structure_id', structureId));
        if (error) notify('Could not update: ' + error.message, 'error');
        else await audit(checked ? 'optional_fee_added' : 'optional_fee_removed', null, { student: id, structure: structureId });
        const { data } = await c.from('fee_assignments').select('*');
        if (data) S.assignments = data;
        openStatement(id); render();
    }

    async function addStructure() {
        if (S.busy || !can.structure()) return notify('Your role cannot change the fee structure.', 'error');
        const c = db(); if (!c) return;
        const val = id => (document.getElementById(id) || {}).value || '';
        const name = val('fx-s-name').trim().slice(0, 60), term = val('fx-s-term'), cat = val('fx-s-cat');
        const lvl = val('fx-s-level') === '' ? null : parseInt(val('fx-s-level'), 10);
        const cents = parseMoney(val('fx-s-amt'));
        if (!name) return notify('Give the fee item a name.', 'warning');
        if (!CFG.terms.includes(term) || !CFG.categories.includes(cat)) return notify('Choose a valid term and category.', 'warning');
        if (lvl !== null && !(lvl >= 1 && lvl <= 6)) return notify('Invalid form level.', 'warning');
        if (cents == null) return notify('Enter a valid amount.', 'warning');
        if (S.structures.some(f => f.active && f.year === S.year && f.term === term && f.form_level === lvl && f.name.toLowerCase() === name.toLowerCase()))
            return notify('An active item with that name already exists for this term and level. Archive it first to replace it.', 'warning');
        S.busy = true;
        try {
            const row = { id: uid('FS'), year: S.year, term, form_level: lvl, category: cat, name, amount_cents: cents, optional: !!(document.getElementById('fx-s-opt') || {}).checked, active: true, created_by: actor() };
            const { error } = await c.from('fee_structures').insert(row);
            if (error) return notify('Not saved: ' + error.message, 'error');
            await audit('structure_added', null, row);
            S.structures.unshift(row); render(); notify('Fee item added.', 'success');
        } finally { S.busy = false; }
    }
    async function archiveStructure(id) {
        if (!can.structure()) return;
        const c = db(); const f = S.structures.find(x => x.id === id); if (!c || !f) return;
        if (!confirm('Archive "' + f.name + '"? It will stop being billed, so balances change for every student it applies to.')) return;
        const { error } = await c.from('fee_structures').update({ active: false }).eq('id', id);
        if (error) return notify('Could not archive: ' + error.message, 'error');
        await audit('structure_archived', null, { id, name: f.name, amount_cents: f.amount_cents });
        f.active = false; render(); notify('Fee item archived.', 'success');
    }

    // ---------- Exports ----------
    function exportAccounts() {
        const rows = [['Student ID', 'Name', 'Class', 'Billed', 'Paid', 'Balance', 'Status']];
        accounts().forEach(r => rows.push([r.stu.id, r.stu.name, r.stu.class, money2(r.billed), money2(r.paid), money2(Math.max(0, r.balance)), r.status]));
        downloadCSV('fee-accounts-' + S.year + '-' + S.term.replace(' ', '') + '.csv', rows);
    }
    function exportPayments() {
        const rows = [['Receipt', 'Date paid', 'Student ID', 'Student', 'Class', 'Term', 'Year', 'Method', 'Reference', 'Amount', 'Applied to', 'Status', 'Recorded by', 'Reversal reason']];
        S.payments.filter(p => p.year === S.year).forEach(p => rows.push([p.receipt_no, p.paid_on, p.student_id, p.student_name, p.class, p.term, p.year, p.method, p.reference || '', money2(p.amount_cents), allocText(p), p.status, p.recorded_by, p.reversal_reason || '']));
        downloadCSV('fee-payments-' + S.year + '.csv', rows);
    }
    function exportArrears() {
        const rows = [['Student ID', 'Name', 'Class', 'Parent', 'Phone', 'Balance', 'Owing for']];
        S.arrears.forEach(x => rows.push([x.r.stu.id, x.r.stu.name, x.r.stu.class, x.r.stu.parentName || '', x.r.stu.phone || '', money2(x.r.balance), x.owing]));
        downloadCSV('fee-arrears-' + S.year + '.csv', rows);
    }

    // ---------- Events ----------
    async function onAction(e) {
        const t = e.target.closest('[data-action]'); if (!t) return;
        const isInput = t.tagName === 'SELECT' || t.type === 'checkbox';
        if ((e.type === 'click') === isInput) return; // buttons react to click, selects/checkboxes to change
        const a = t.dataset.action, id = t.dataset.id;
        switch (a) {
            case 'tab': S.tab = t.dataset.tab; render(); break;
            case 'set-year': S.year = parseInt(t.value, 10) || S.year; render(); break;
            case 'set-term': S.term = CFG.terms.includes(t.value) ? t.value : S.term; render(); break;
            case 'refresh': await loadAll(); render(); notify('Refreshed.', 'success'); break;
            case 'open-pay': openPay(id); break;
            case 'pay-full': fillFull(t); updatePayTotal(); break;
            case 'pay-all': S.modal.querySelectorAll('[data-action="pay-full"]').forEach(fillFull); updatePayTotal(); break;
            case 'submit-pay': await submitPay(); break;
            case 'open-reverse': openReverse(id); break;
            case 'submit-reverse': await submitReverse(); break;
            case 'statement': openStatement(id); break;
            case 'print-statement': { const s = findStudent(id); if (s) printDoc('Statement ' + s.name, statementHtml(s)); break; }
            case 'receipt': { const p = S.payments.find(x => x.id === id); if (p) printDoc('Receipt ' + p.receipt_no, receiptHtml(p)); break; }
            case 'toggle-assign': await toggleAssign(t.dataset.sid, t.checked); break;
            case 'add-structure': await addStructure(); break;
            case 'archive-structure': await archiveStructure(id); break;
            case 'export-accounts': exportAccounts(); break;
            case 'export-payments': exportPayments(); break;
            case 'export-arrears': exportArrears(); break;
            case 'copy-msg': {
                const x = S.arrears[parseInt(t.dataset.i, 10)];
                if (x && navigator.clipboard) navigator.clipboard.writeText(x.msg).then(() => notify('Message copied.', 'success'), () => notify('Could not copy.', 'warning'));
                break;
            }
            case 'close-modal': closeModal(); break;
        }
    }

    let filterTimer = null;
    function onFilter(e) {
        const t = e.target; if (!t.dataset || !t.dataset.filter) return;
        S.f[t.dataset.filter] = t.value;
        clearTimeout(filterTimer);
        filterTimer = setTimeout(render, t.tagName === 'INPUT' ? 180 : 0);
    }

    // ---------- Startup ----------
    function findHost() {
        for (const id of CFG.sectionIds) { const el = document.getElementById(id); if (el) return el; }
        return null;
    }

    async function init() {
        const host = findHost();
        if (!host) { console.warn('fees.js: no Fees & Finance section found. Tried ids: ' + CFG.sectionIds.join(', ')); return; }

        const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);

        host.innerHTML = '<div class="fx" id="fx-root"></div>';
        S.root = document.getElementById('fx-root');
        S.modal = document.createElement('div');
        S.modal.className = 'fx fx-modal';
        document.body.appendChild(S.modal);

        ['click', 'change'].forEach(ev => { S.root.addEventListener(ev, onAction); S.modal.addEventListener(ev, onAction); });
        S.root.addEventListener('input', onFilter);
        S.root.addEventListener('change', onFilter);
        S.modal.addEventListener('input', e => { if (e.target.classList && e.target.classList.contains('fx-pay-in')) updatePayTotal(); });
        S.modal.addEventListener('mousedown', e => { if (e.target === S.modal) closeModal(); });
        document.addEventListener('keydown', e => { if (e.key === 'Escape' && S.modal.classList.contains('open')) closeModal(); });

        render();
        await loadAll();
        render();

        // Refresh whenever the person opens this section, so numbers are never stale.
        new MutationObserver(() => { if (host.classList.contains('active')) loadAll().then(render); })
            .observe(host, { attributes: true, attributeFilter: ['class'] });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
