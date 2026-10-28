
// ============================================================
// timetable.js — Timetable Management (standalone)
// Load order in the dashboard HTML (after the supabase-js tag):
//   <script src="school.js"></script>
//   <script src="teacher-profile.js"></script>
//   <script src="classes.js"></script>
//   <script src="timetable.js"></script>
//
// This file builds the whole "Timetable" section itself (it replaces whatever
// is inside #timetable-section), so no HTML needs to be edited. It relies on
// the shared helpers in school.js: getData, saveData, showNotification,
// deleteRowFromBackend. The old timetable functions in school.js are replaced
// by the versions at the bottom of this file (same names).
//
// Periods are stored in the "timetables" table:
//   { id, class, day, start, end, subject, teacher, teacherId, room }
// teacherId links to the Teachers list, so a renamed teacher stays linked.
// Older periods that only have a teacher name keep working.
// ============================================================

const TT_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const TT_SUBJECTS = [
    'Mathematics', 'English Language', 'Literature in English', 'Shona', 'Ndebele',
    'Physics', 'Chemistry', 'Biology', 'Combined Science', 'Geography', 'History',
    'Commerce', 'Accounting', 'Business Enterprise Skills', 'Computer Science',
    'Agriculture', 'Food and Nutrition', 'Fashion and Fabrics', 'Technical Graphics',
    'Building Studies', 'Metalwork', 'Woodwork', 'Heritage Studies',
    'Religious Studies', 'Physical Education', 'Art', 'Music', 'Library', 'Assembly'
];

// [accent, soft background] — each subject always gets the same colour
const TT_PALETTE = [
    ['#ea580c', '#ffedd5'], ['#2563eb', '#dbeafe'], ['#16a34a', '#dcfce7'],
    ['#9333ea', '#f3e8ff'], ['#0891b2', '#cffafe'], ['#db2777', '#fce7f3'],
    ['#ca8a04', '#fef9c3'], ['#475569', '#e2e8f0'], ['#0d9488', '#ccfbf1'],
    ['#4f46e5', '#e0e7ff']
];

window._tt = window._tt || { mode: 'class', cls: '', teacherId: '' };
let ttSeq = 0;

// ---------- 1. Small helpers ----------

function ttEsc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, c =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function ttToMin(t) {
    const m = /^(\d{1,2}):(\d{2})/.exec(String(t || ''));
    return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
}

function ttOverlap(a, b) {
    return ttToMin(a.start) < ttToMin(b.end) && ttToMin(b.start) < ttToMin(a.end);
}

function ttNewId() {
    return 'TT' + Date.now().toString(36).toUpperCase() +
        (ttSeq++).toString(36).toUpperCase() +
        Math.random().toString(36).slice(2, 4).toUpperCase();
}

function ttHours(minutes) {
    return (minutes / 60).toFixed(1).replace(/\.0$/, '');
}

function ttColor(subject) {
    const s = String(subject || '').trim().toLowerCase();
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return TT_PALETTE[h % TT_PALETTE.length];
}

function ttAll() {
    const t = getData('timetables');
    return Array.isArray(t) ? t : [];
}
function ttTeachers() {
    const t = getData('teachers');
    return Array.isArray(t) ? t : [];
}
function ttClasses() {
    const c = getData('classes');
    return Array.isArray(c) ? c : [];
}
function ttSortByName(list) {
    return list.slice().sort((a, b) =>
        String(a.name).localeCompare(String(b.name), undefined, { numeric: true }));
}
function ttSave(list) {
    const ok = saveData('timetables', list);
    if (ok) window._timetables = list;
    return ok;
}

// A teacher's current name (the linked record wins over the name saved on the period)
function ttTeacherName(e, teachers) {
    const t = e.teacherId && teachers.find(x => x.id === e.teacherId);
    return t ? t.name : (e.teacher || '');
}

// One key per real teacher, whether the period stores an id or only a name
function ttTeacherKey(e, teachers) {
    if (e.teacherId) return 'id:' + e.teacherId;
    const n = String(e.teacher || '').trim().toLowerCase();
    if (!n) return '';
    const t = teachers.find(x => String(x.name).trim().toLowerCase() === n);
    return t ? 'id:' + t.id : 'n:' + n;
}

function ttEntriesForTeacher(list, teacher) {
    const name = String(teacher.name).trim().toLowerCase();
    return list.filter(e => e.teacherId === teacher.id ||
        (!e.teacherId && e.teacher && String(e.teacher).trim().toLowerCase() === name));
}

// ---------- 2. Clash detection ----------

function ttDetectClashes(list, teachers) {
    const clashes = [];
    const byDay = {};
    list.forEach(e => { (byDay[e.day] = byDay[e.day] || []).push(e); });
    Object.keys(byDay).forEach(day => {
        const arr = byDay[day];
        const keys = arr.map(e => ttTeacherKey(e, teachers));
        for (let i = 0; i < arr.length; i++) {
            for (let j = i + 1; j < arr.length; j++) {
                if (!ttOverlap(arr[i], arr[j])) continue;
                if (arr[i].class === arr[j].class) clashes.push({ type: 'class', a: arr[i], b: arr[j] });
                if (keys[i] && keys[i] === keys[j]) clashes.push({ type: 'teacher', a: arr[i], b: arr[j] });
            }
        }
    });
    return clashes;
}

// What would a new/changed period run into?
function ttFindConflicts(others, cand, teachers) {
    const out = { class: [], teacher: [], room: [] };
    const key = ttTeacherKey(cand, teachers);
    const room = String(cand.room || '').trim().toLowerCase();
    others.forEach(o => {
        if (o.day !== cand.day || !ttOverlap(o, cand)) return;
        if (o.class === cand.class) out.class.push(o);
        if (key && ttTeacherKey(o, teachers) === key) out.teacher.push(o);
        if (room && String(o.room || '').trim().toLowerCase() === room && o.class !== cand.class) out.room.push(o);
    });
    return out;
}

function ttComputeStats(list, classes, teachers) {
    const classNames = new Set(classes.map(c => c.name));
    const scheduledClasses = new Set(list.map(e => e.class).filter(n => classNames.has(n)));
    const scheduledTeachers = teachers.filter(t => ttEntriesForTeacher(list, t).length).length;
    const minutes = list.reduce((s, e) => {
        const d = ttToMin(e.end) - ttToMin(e.start);
        return s + (d > 0 ? d : 0);
    }, 0);
    return {
        periods: list.length,
        minutes,
        classesTotal: classes.length,
        classesScheduled: scheduledClasses.size,
        teachersTotal: teachers.length,
        teachersScheduled: scheduledTeachers,
        clashes: ttDetectClashes(list, teachers),
        noTeacher: list.filter(e => !ttTeacherKey(e, teachers)).length
    };
}

// ---------- 3. Styles ----------

const TT_GRID_CSS = `
.tt-grid-wrap{overflow-x:auto}
.tt-grid{width:100%;border-collapse:separate;border-spacing:0;min-width:760px;table-layout:fixed}
.tt-grid th{background:#f8fafc;color:#64748b;font-size:.74rem;text-transform:uppercase;letter-spacing:.05em;padding:.7rem .6rem;border-bottom:1px solid #e2e8f0;text-align:center}
.tt-grid th.tt-time-h,.tt-grid th.tt-time{width:112px}
.tt-grid th.tt-time{text-transform:none;letter-spacing:0;font-size:.82rem;font-weight:600;color:#475569;background:#fff;border-bottom:1px solid #f1f5f9;border-right:1px solid #f1f5f9;white-space:nowrap}
.tt-grid td{padding:6px;border-bottom:1px solid #f1f5f9;vertical-align:top;height:74px}
.tt-grid tr:last-child td,.tt-grid tr:last-child th{border-bottom:none}
.tt-period{display:flex;flex-direction:column;gap:2px;width:100%;box-sizing:border-box;text-align:left;border:none;border-left:4px solid var(--c);background:var(--bg);border-radius:10px;padding:8px 10px;font:inherit;cursor:pointer;color:#0f172a;margin-bottom:4px;transition:transform .12s,box-shadow .12s}
.tt-period:hover{transform:translateY(-1px);box-shadow:0 4px 10px rgba(15,23,42,.1)}
.tt-period.clash{border-left-color:#dc2626;background:#fee2e2}
.tt-p-subject{font-weight:700;font-size:.88rem}
.tt-p-meta{font-size:.78rem;color:#475569}
.tt-p-room{font-size:.72rem;color:#64748b}
.tt-noteacher{color:#b45309;font-style:normal;font-weight:600}
.tt-empty{width:100%;height:100%;min-height:60px;border:1px dashed transparent;background:none;border-radius:10px;cursor:pointer;color:#cbd5e1;font-size:1.2rem;opacity:0}
.tt-empty:hover{opacity:1;border-color:#fdba74;color:#ea580c;background:#fff7ed}
`;

function ttInjectStyles() {
    if (document.getElementById('ttStyles')) return;
    document.head.insertAdjacentHTML('beforeend', `<style id="ttStyles">
${TT_GRID_CSS}
.tt-page{width:100%}
.tt-head{display:flex;align-items:flex-start;justify-content:space-between;gap:1rem;flex-wrap:wrap;margin-bottom:1.25rem}
.tt-title{margin:0;font-size:2rem;font-weight:700;color:#0f172a}
.tt-sub{margin:.25rem 0 0;color:#64748b;font-size:.95rem}
.tt-head-actions{display:flex;gap:.6rem;flex-wrap:wrap}
.tt-btn{display:inline-flex;align-items:center;gap:.45rem;border:1px solid var(--border-color,#e2e8f0);background:#fff;color:#334155;border-radius:12px;padding:.65rem 1.1rem;font:inherit;font-weight:600;font-size:.92rem;cursor:pointer;transition:all .15s}
.tt-btn:hover{border-color:#ea580c;color:#ea580c}
.tt-btn.primary{background:#ea580c;border-color:#ea580c;color:#fff}
.tt-btn.primary:hover{background:#c2410c;color:#fff}
.tt-btn.danger{color:#dc2626}
.tt-btn.danger:hover{border-color:#dc2626;color:#dc2626}
.tt-btn svg{width:16px;height:16px}
.tt-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:1rem;margin-bottom:1rem}
.tt-stat{display:flex;align-items:center;gap:.9rem;background:#fff;border:1px solid var(--border-color,#e2e8f0);border-radius:16px;padding:1.1rem 1.25rem;box-shadow:0 1px 2px rgba(15,23,42,.04)}
.tt-stat-icon{flex:none;width:52px;height:52px;border-radius:14px;display:flex;align-items:center;justify-content:center}
.tt-stat-icon svg{width:24px;height:24px}
.tt-stat-icon.orange{background:#ffedd5;color:#ea580c}
.tt-stat-icon.green{background:#dcfce7;color:#16a34a}
.tt-stat-icon.blue{background:#dbeafe;color:#2563eb}
.tt-stat-icon.red{background:#fee2e2;color:#dc2626}
.tt-stat-label{font-size:.85rem;color:#64748b}
.tt-stat-value{font-size:1.75rem;font-weight:700;line-height:1.15}
.tt-stat-sub{font-size:.78rem;color:#64748b;margin-top:.1rem}
.tt-alert{background:#fef2f2;border:1px solid #fecaca;color:#991b1b;border-radius:14px;padding:.9rem 1.1rem;margin-bottom:1rem}
.tt-alert strong{display:block;margin-bottom:.4rem}
.tt-alert ul{margin:0;padding:0;list-style:none}
.tt-alert li{display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:.3rem 0;font-size:.9rem}
.tt-alert button{border:1px solid #fca5a5;background:#fff;color:#b91c1c;border-radius:8px;padding:.2rem .7rem;font:inherit;font-size:.8rem;font-weight:600;cursor:pointer}
.tt-tabs{display:inline-flex;gap:.25rem;background:#f1f5f9;border-radius:12px;padding:.25rem;margin-bottom:1rem}
.tt-tab{border:none;background:none;border-radius:9px;padding:.5rem 1.1rem;font:inherit;font-weight:600;font-size:.9rem;color:#64748b;cursor:pointer}
.tt-tab.active{background:#fff;color:#ea580c;box-shadow:0 1px 3px rgba(15,23,42,.1)}
.tt-toolbar{display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap;margin-bottom:1rem}
.tt-select{min-width:240px;padding:.6rem .9rem;border:1px solid var(--border-color,#e2e8f0);border-radius:12px;font:inherit;background:#fff}
.tt-select:focus,.tt-input:focus{outline:none;border-color:#ea580c;box-shadow:0 0 0 3px rgba(234,88,12,.12)}
.tt-toolbar-info{color:#64748b;font-size:.88rem}
.tt-card{background:#fff;border:1px solid var(--border-color,#e2e8f0);border-radius:16px;box-shadow:0 1px 2px rgba(15,23,42,.04);overflow:hidden}
.tt-card-head{display:flex;align-items:baseline;justify-content:space-between;gap:1rem;flex-wrap:wrap;padding:1rem 1.25rem;border-bottom:1px solid #f1f5f9}
.tt-card-head h3{margin:0;font-size:1.05rem}
.tt-card-head span{color:#64748b;font-size:.85rem}
.tt-emptystate{padding:3rem 1.5rem;text-align:center;color:#64748b}
.tt-emptystate h3{margin:0 0 .4rem;color:#0f172a}
.tt-emptystate .tt-head-actions{justify-content:center;margin-top:1rem}
.tt-table{width:100%;border-collapse:collapse}
.tt-table th{text-align:left;font-size:.74rem;text-transform:uppercase;letter-spacing:.05em;color:#64748b;padding:.7rem 1.25rem;background:#f8fafc;border-bottom:1px solid #f1f5f9}
.tt-table td{padding:.8rem 1.25rem;border-bottom:1px solid #f1f5f9;font-size:.93rem}
.tt-table tbody tr{cursor:pointer}
.tt-table tbody tr:hover{background:#fffaf5}
.tt-table tbody tr:last-child td{border-bottom:none}
.tt-bar{height:8px;border-radius:999px;background:#f1f5f9;min-width:120px;overflow:hidden}
.tt-bar span{display:block;height:100%;background:#ea580c;border-radius:999px}
.tt-pill{display:inline-block;padding:.2rem .65rem;border-radius:999px;background:#dcfce7;color:#15803d;font-size:.8rem;font-weight:600}
.tt-pill.muted{background:#f1f5f9;color:#64748b}
.tt-form label.tt-label{display:block;font-size:.85rem;font-weight:600;color:#334155;margin:0 0 .3rem}
.tt-input{width:100%;box-sizing:border-box;padding:.6rem .8rem;border:1px solid var(--border-color,#e2e8f0);border-radius:10px;font:inherit;background:#fff}
.tt-row{display:grid;grid-template-columns:1fr 1fr;gap:.8rem;margin-bottom:.9rem}
.tt-field{margin-bottom:.9rem}
.tt-days{display:flex;flex-wrap:wrap;gap:.4rem}
.tt-chip input{position:absolute;opacity:0;pointer-events:none}
.tt-chip span{display:inline-block;padding:.4rem .8rem;border:1px solid var(--border-color,#e2e8f0);border-radius:999px;font-size:.85rem;font-weight:600;color:#475569;cursor:pointer;background:#fff}
.tt-chip input:checked + span{background:#ea580c;border-color:#ea580c;color:#fff}
.tt-hint{font-size:.8rem;color:#64748b;margin:.3rem 0 0}
.tt-error{background:#fef2f2;border:1px solid #fecaca;color:#991b1b;border-radius:10px;padding:.6rem .8rem;margin-bottom:.9rem;font-size:.88rem}
.tt-error ul{margin:.3rem 0 0;padding-left:1.1rem}
.tt-modal-actions{display:flex;justify-content:space-between;gap:.6rem;margin-top:1rem;flex-wrap:wrap}
.tt-modal-actions > div{display:flex;gap:.6rem}
.tt-targets{max-height:240px;overflow-y:auto;border:1px solid var(--border-color,#e2e8f0);border-radius:10px;padding:.5rem .8rem}
.tt-targets label{display:flex;align-items:center;gap:.5rem;padding:.3rem 0;font-size:.9rem}
.tt-targets .tt-group{margin:.5rem 0 .1rem;font-size:.75rem;text-transform:uppercase;letter-spacing:.05em;color:#94a3b8;font-weight:700}
.tt-links{display:flex;gap:1rem;margin:.4rem 0 .8rem}
.tt-links button{border:none;background:none;color:#ea580c;font:inherit;font-size:.82rem;font-weight:600;cursor:pointer;padding:0}
@media (max-width:1100px){.tt-stats{grid-template-columns:repeat(2,1fr)}}
@media (max-width:560px){.tt-stats,.tt-row{grid-template-columns:1fr}.tt-select{min-width:0;width:100%}}
</style>`);
}

// ---------- 4. Page skeleton ----------

function ttEnsureSkeleton() {
    const section = document.getElementById('timetable-section');
    if (!section) return null;
    if (document.getElementById('ttRoot')) return section;
    ttInjectStyles();
    section.innerHTML = `
        <div class="tt-page" id="ttRoot">
            <div class="tt-head">
                <div>
                    <h1 class="tt-title">Timetable</h1>
                    <p class="tt-sub">Plan the weekly periods for every class and teacher. Teachers see their own periods on their dashboard.</p>
                </div>
                <div class="tt-head-actions">
                    <button type="button" class="tt-btn" data-tt="print"><span data-lucide="printer"></span> Print</button>
                    <button type="button" class="tt-btn" data-tt="copy"><span data-lucide="copy"></span> Copy timetable</button>
                    <button type="button" class="tt-btn primary" data-tt="add"><span data-lucide="plus"></span> Add period</button>
                </div>
            </div>
            <div id="ttStats"></div>
            <div id="ttAlerts"></div>
            <div class="tt-tabs" id="ttTabs">
                <button type="button" class="tt-tab" data-tt="tab" data-mode="class">By Class</button>
                <button type="button" class="tt-tab" data-tt="tab" data-mode="teacher">By Teacher</button>
                <button type="button" class="tt-tab" data-tt="tab" data-mode="workload">Teacher Workload</button>
            </div>
            <div id="ttToolbar"></div>
            <div id="ttBody"></div>
        </div>`;
    return section;
}

// ---------- 5. Rendering ----------

function ttRender() {
    if (!ttEnsureSkeleton()) return;
    const list = ttAll();
    const classes = ttSortByName(ttClasses());
    const teachers = ttSortByName(ttTeachers());
    const state = window._tt;

    // Keep the selection valid (a class may have been renamed or deleted)
    if (!classes.some(c => c.name === state.cls)) {
        const withPeriods = classes.find(c => list.some(e => e.class === c.name));
        state.cls = (withPeriods || classes[0] || {}).name || '';
    }
    if (!teachers.some(t => t.id === state.teacherId)) {
        const busy = teachers.find(t => ttEntriesForTeacher(list, t).length);
        state.teacherId = (busy || teachers[0] || {}).id || '';
    }

    ttRenderStats(list, classes, teachers);
    document.querySelectorAll('#ttTabs .tt-tab').forEach(t =>
        t.classList.toggle('active', t.dataset.mode === state.mode));

    if (state.mode === 'teacher') ttRenderTeacherView(list, teachers);
    else if (state.mode === 'workload') ttRenderWorkload(list, teachers);
    else ttRenderClassView(list, classes, teachers);

    if (window.lucide) lucide.createIcons();
}

function ttRenderStats(list, classes, teachers) {
    const s = ttComputeStats(list, classes, teachers);
    const stat = (icon, tone, label, value, sub) => `
        <div class="tt-stat">
            <div class="tt-stat-icon ${tone}"><span data-lucide="${icon}"></span></div>
            <div><div class="tt-stat-label">${label}</div><div class="tt-stat-value">${value}</div>
                <div class="tt-stat-sub">${sub}</div></div>
        </div>`;
    const clashCount = s.clashes.length;
    document.getElementById('ttStats').innerHTML = `
        <div class="tt-stats">
            ${stat('calendar-clock', 'orange', 'Periods per week', s.periods.toLocaleString(), `${ttHours(s.minutes)} hours of teaching`)}
            ${stat('layout-grid', 'blue', 'Classes with a timetable', `${s.classesScheduled} <small style="font-size:1rem;color:#94a3b8">of ${s.classesTotal}</small>`,
                s.classesTotal - s.classesScheduled > 0 ? `${s.classesTotal - s.classesScheduled} still to plan` : 'All classes planned ✓')}
            ${stat('graduation-cap', 'green', 'Teachers scheduled', `${s.teachersScheduled} <small style="font-size:1rem;color:#94a3b8">of ${s.teachersTotal}</small>`,
                s.noTeacher ? `${s.noTeacher} period${s.noTeacher === 1 ? '' : 's'} without a teacher` : 'Every period has a teacher ✓')}
            ${stat(clashCount ? 'triangle-alert' : 'circle-check', clashCount ? 'red' : 'green', 'Clashes', clashCount,
                clashCount ? 'Needs fixing' : 'All clear ✓')}
        </div>`;

    const alerts = document.getElementById('ttAlerts');
    if (!clashCount) { alerts.innerHTML = ''; return; }
    const lines = s.clashes.slice(0, 4).map(c => {
        const a = c.a, b = c.b;
        const text = c.type === 'teacher'
            ? `${ttEsc(ttTeacherName(a, teachers) || 'A teacher')} is in ${ttEsc(a.class)} and ${ttEsc(b.class)} on ${ttEsc(a.day)} (${ttEsc(a.start)}–${ttEsc(a.end)})`
            : `${ttEsc(a.class)} has two periods at once on ${ttEsc(a.day)}: ${ttEsc(a.subject)} and ${ttEsc(b.subject)}`;
        return `<li><span>${text}</span><button type="button" data-tt="edit" data-id="${ttEsc(b.id)}">Fix</button></li>`;
    }).join('');
    alerts.innerHTML = `<div class="tt-alert"><strong>${clashCount} clash${clashCount === 1 ? '' : 'es'} found</strong>
        <ul>${lines}</ul>${clashCount > 4 ? `<div style="margin-top:.4rem;font-size:.82rem">…and ${clashCount - 4} more</div>` : ''}</div>`;
}

function ttGridHtml(entries, mode, teachers, clashIds) {
    const days = TT_DAYS.slice(0, 5);
    if (entries.some(e => e.day === 'Saturday')) days.push('Saturday');

    const slotMap = {};
    entries.forEach(e => { slotMap[e.start + '|' + e.end] = { start: e.start, end: e.end }; });
    const slots = Object.values(slotMap).sort((a, b) =>
        ttToMin(a.start) - ttToMin(b.start) || ttToMin(a.end) - ttToMin(b.end));

    const card = e => {
        const col = ttColor(e.subject);
        const tn = ttTeacherName(e, teachers);
        const meta = mode === 'class'
            ? (tn ? ttEsc(tn) : '<em class="tt-noteacher">No teacher</em>')
            : ttEsc(e.class);
        return `<button type="button" class="tt-period${clashIds.has(e.id) ? ' clash' : ''}"
                style="--c:${col[0]};--bg:${col[1]}" data-tt="edit" data-id="${ttEsc(e.id)}" title="Click to edit">
                <span class="tt-p-subject">${ttEsc(e.subject || 'Untitled')}</span>
                <span class="tt-p-meta">${meta}</span>
                ${e.room ? `<span class="tt-p-room">Room ${ttEsc(e.room)}</span>` : ''}
            </button>`;
    };

    const head = `<tr><th class="tt-time-h">Time</th>${days.map(d => `<th>${d}</th>`).join('')}</tr>`;
    const rows = slots.map(s => `<tr><th class="tt-time">${ttEsc(s.start)}–${ttEsc(s.end)}</th>${days.map(d => {
        const here = entries.filter(e => e.day === d && e.start === s.start && e.end === s.end);
        return here.length
            ? `<td>${here.map(card).join('')}</td>`
            : `<td><button type="button" class="tt-empty" data-tt="add-slot" data-day="${d}" data-start="${ttEsc(s.start)}" data-end="${ttEsc(s.end)}" title="Add a period">+</button></td>`;
    }).join('')}</tr>`).join('');

    return `<div class="tt-grid-wrap"><table class="tt-grid"><thead>${head}</thead><tbody>${rows}</tbody></table></div>`;
}

function ttRenderClassView(list, classes, teachers) {
    const state = window._tt;
    const toolbar = document.getElementById('ttToolbar');
    const body = document.getElementById('ttBody');

    if (!classes.length) {
        toolbar.innerHTML = '';
        body.innerHTML = `<div class="tt-card"><div class="tt-emptystate"><h3>No classes yet</h3>
            <p>Create your classes first, then come back to plan their timetables.</p></div></div>`;
        return;
    }

    const forms = {};
    classes.forEach(c => { (forms[c.formLevel || 'Other'] = forms[c.formLevel || 'Other'] || []).push(c); });
    const options = Object.keys(forms).sort((a, b) => parseInt(a) - parseInt(b)).map(f => `
        <optgroup label="${f === 'Other' ? 'Other' : 'Form ' + ttEsc(f)}">
            ${forms[f].map(c => {
                const n = list.filter(e => e.class === c.name).length;
                return `<option value="${ttEsc(c.name)}"${c.name === state.cls ? ' selected' : ''}>${ttEsc(c.name)} — ${n} period${n === 1 ? '' : 's'}</option>`;
            }).join('')}
        </optgroup>`).join('');

    const entries = list.filter(e => e.class === state.cls);
    const minutes = entries.reduce((s, e) => s + Math.max(0, ttToMin(e.end) - ttToMin(e.start)), 0);
    toolbar.innerHTML = `<div class="tt-toolbar">
        <select id="ttSelClass" class="tt-select" aria-label="Choose a class">${options}</select>
        <span class="tt-toolbar-info">${entries.length} period${entries.length === 1 ? '' : 's'} · ${ttHours(minutes)} hrs per week</span>
    </div>`;

    if (!entries.length) {
        body.innerHTML = `<div class="tt-card"><div class="tt-emptystate">
            <h3>No periods for ${ttEsc(state.cls)} yet</h3>
            <p>Add periods one by one, or copy a finished timetable from another class and then assign the teachers.</p>
            <div class="tt-head-actions">
                <button type="button" class="tt-btn primary" data-tt="add">+ Add first period</button>
                <button type="button" class="tt-btn" data-tt="copy">Copy from another class</button>
            </div></div></div>`;
        return;
    }

    const clashIds = new Set();
    ttDetectClashes(list, teachers).forEach(c => { clashIds.add(c.a.id); clashIds.add(c.b.id); });
    body.innerHTML = `<div class="tt-card" id="ttGridHolder" data-title="${ttEsc(state.cls)} — Timetable">
        <div class="tt-card-head"><h3>${ttEsc(state.cls)}</h3><span>Click a period to edit it, or a blank slot to add one</span></div>
        ${ttGridHtml(entries, 'class', teachers, clashIds)}</div>`;
}

function ttRenderTeacherView(list, teachers) {
    const state = window._tt;
    const toolbar = document.getElementById('ttToolbar');
    const body = document.getElementById('ttBody');

    if (!teachers.length) {
        toolbar.innerHTML = '';
        body.innerHTML = `<div class="tt-card"><div class="tt-emptystate"><h3>No teachers yet</h3>
            <p>Add teachers on the Teachers page first.</p></div></div>`;
        return;
    }

    const teacher = teachers.find(t => t.id === state.teacherId) || teachers[0];
    const entries = ttEntriesForTeacher(list, teacher);
    const minutes = entries.reduce((s, e) => s + Math.max(0, ttToMin(e.end) - ttToMin(e.start)), 0);
    toolbar.innerHTML = `<div class="tt-toolbar">
        <select id="ttSelTeacher" class="tt-select" aria-label="Choose a teacher">
            ${teachers.map(t => `<option value="${ttEsc(t.id)}"${t.id === teacher.id ? ' selected' : ''}>${ttEsc(t.name)}${t.department ? ' (' + ttEsc(t.department) + ')' : ''}</option>`).join('')}
        </select>
        <span class="tt-toolbar-info">${entries.length} period${entries.length === 1 ? '' : 's'} · ${ttHours(minutes)} hrs per week</span>
    </div>`;

    if (!entries.length) {
        body.innerHTML = `<div class="tt-card"><div class="tt-emptystate">
            <h3>${ttEsc(teacher.name)} has no periods yet</h3>
            <p>Add a period and pick this teacher, or assign them to periods you copied.</p>
            <div class="tt-head-actions"><button type="button" class="tt-btn primary" data-tt="add">+ Add period</button></div>
        </div></div>`;
        return;
    }

    const clashIds = new Set();
    ttDetectClashes(list, teachers).forEach(c => { clashIds.add(c.a.id); clashIds.add(c.b.id); });
    body.innerHTML = `<div class="tt-card" id="ttGridHolder" data-title="${ttEsc(teacher.name)} — Timetable">
        <div class="tt-card-head"><h3>${ttEsc(teacher.name)}</h3><span>Click a period to edit it</span></div>
        ${ttGridHtml(entries, 'teacher', teachers, clashIds)}</div>`;
}

function ttRenderWorkload(list, teachers) {
    document.getElementById('ttToolbar').innerHTML = '';
    const body = document.getElementById('ttBody');
    if (!teachers.length) {
        body.innerHTML = `<div class="tt-card"><div class="tt-emptystate"><h3>No teachers yet</h3>
            <p>Add teachers on the Teachers page first.</p></div></div>`;
        return;
    }
    const rows = teachers.map(t => {
        const mine = ttEntriesForTeacher(list, t);
        const minutes = mine.reduce((s, e) => s + Math.max(0, ttToMin(e.end) - ttToMin(e.start)), 0);
        return { t, periods: mine.length, minutes, classes: new Set(mine.map(e => e.class)).size };
    }).sort((a, b) => b.periods - a.periods || String(a.t.name).localeCompare(String(b.t.name)));
    const max = Math.max(1, ...rows.map(r => r.periods));

    body.innerHTML = `<div class="tt-card">
        <div class="tt-card-head"><h3>Teacher workload</h3><span>Click a teacher to open their timetable</span></div>
        <div class="tt-grid-wrap"><table class="tt-table">
            <thead><tr><th>Teacher</th><th>Department</th><th>Periods / week</th><th>Hours / week</th><th>Classes</th><th>Load</th></tr></thead>
            <tbody>${rows.map(r => `<tr data-tt="go-teacher" data-id="${ttEsc(r.t.id)}">
                <td><strong>${ttEsc(r.t.name)}</strong></td>
                <td>${ttEsc(r.t.department || '—')}</td>
                <td>${r.periods ? r.periods : '<span class="tt-pill muted">Not scheduled</span>'}</td>
                <td>${ttHours(r.minutes)}</td>
                <td>${r.classes}</td>
                <td><div class="tt-bar"><span style="width:${Math.round(r.periods / max * 100)}%"></span></div></td>
            </tr>`).join('')}</tbody>
        </table></div></div>`;
}

// ---------- 6. Add / edit period ----------

function ttEnsureModals() {
    if (document.getElementById('ttPeriodModal')) return;
    ttInjectStyles();
    document.body.insertAdjacentHTML('beforeend', `
        <datalist id="ttSubjects">${TT_SUBJECTS.map(s => `<option value="${ttEsc(s)}">`).join('')}</datalist>

        <div id="ttPeriodModal" class="modal" aria-hidden="true">
            <div class="modal-content" style="max-width:560px;">
                <div class="modal-header">
                    <h3 id="ttPeriodTitle">Add period</h3>
                    <button type="button" class="modal-close" data-tt="close-modal" data-modal="ttPeriodModal">✕</button>
                </div>
                <form id="ttForm" class="tt-form" novalidate>
                    <input type="hidden" id="ttFId">
                    <div id="ttFError"></div>
                    <div class="tt-row">
                        <div><label class="tt-label" for="ttFClass">Class</label><select id="ttFClass" class="tt-input"></select></div>
                        <div><label class="tt-label" for="ttFSubject">Subject</label>
                            <input id="ttFSubject" class="tt-input" list="ttSubjects" maxlength="40" placeholder="e.g. Mathematics" autocomplete="off"></div>
                    </div>
                    <div class="tt-field">
                        <label class="tt-label" for="ttFTeacher">Teacher</label>
                        <select id="ttFTeacher" class="tt-input"></select>
                    </div>
                    <div class="tt-field" id="ttFDayWrap"></div>
                    <div class="tt-row">
                        <div><label class="tt-label" for="ttFStart">Start time</label><input id="ttFStart" type="time" class="tt-input"></div>
                        <div><label class="tt-label" for="ttFEnd">End time</label><input id="ttFEnd" type="time" class="tt-input"></div>
                    </div>
                    <div class="tt-field">
                        <label class="tt-label" for="ttFRoom">Room (optional)</label>
                        <input id="ttFRoom" class="tt-input" maxlength="20" placeholder="e.g. B12">
                    </div>
                    <div class="tt-modal-actions">
                        <button type="button" class="tt-btn danger" id="ttFDelete" data-tt="delete-period">Delete</button>
                        <div>
                            <button type="button" class="tt-btn" data-tt="close-modal" data-modal="ttPeriodModal">Cancel</button>
                            <button type="submit" class="tt-btn primary">Save period</button>
                        </div>
                    </div>
                </form>
            </div>
        </div>

        <div id="ttCopyModal" class="modal" aria-hidden="true">
            <div class="modal-content" style="max-width:560px;">
                <div class="modal-header">
                    <h3>Copy a timetable</h3>
                    <button type="button" class="modal-close" data-tt="close-modal" data-modal="ttCopyModal">✕</button>
                </div>
                <form id="ttCopyForm" class="tt-form" novalidate>
                    <div id="ttCError"></div>
                    <div class="tt-field">
                        <label class="tt-label" for="ttCSource">Copy from</label>
                        <select id="ttCSource" class="tt-input"></select>
                    </div>
                    <div class="tt-field">
                        <label class="tt-label">Copy to</label>
                        <div class="tt-links"><button type="button" data-tt="copy-all">Select all</button><button type="button" data-tt="copy-none">Clear</button></div>
                        <div class="tt-targets" id="ttCTargets"></div>
                        <p class="tt-hint">Subjects, days and times are copied. Teachers and rooms are not, so nobody ends up in two places at once. Assign each class's teachers afterwards.</p>
                    </div>
                    <label style="display:flex;align-items:center;gap:.5rem;font-size:.9rem;margin-bottom:.5rem">
                        <input type="checkbox" id="ttCReplace"> Replace periods in classes that already have a timetable
                    </label>
                    <div class="tt-modal-actions">
                        <span></span>
                        <div>
                            <button type="button" class="tt-btn" data-tt="close-modal" data-modal="ttCopyModal">Cancel</button>
                            <button type="submit" class="tt-btn primary">Copy timetable</button>
                        </div>
                    </div>
                </form>
            </div>
        </div>`);
    ['ttPeriodModal', 'ttCopyModal'].forEach(id => {
        const m = document.getElementById(id);
        m.addEventListener('click', e => { if (e.target === m) ttCloseModal(id); });
    });
}

function ttCloseModal(id) {
    const m = document.getElementById(id);
    if (m) m.setAttribute('aria-hidden', 'true');
}

function ttShowError(boxId, messages) {
    const box = document.getElementById(boxId);
    if (!box) return;
    box.innerHTML = messages.length
        ? `<div class="tt-error">${messages.length === 1 ? ttEsc(messages[0])
            : '<strong>Please fix these:</strong><ul>' + messages.map(m => `<li>${ttEsc(m)}</li>`).join('') + '</ul>'}</div>`
        : '';
}

function ttOpenPeriodModal(opts) {
    opts = opts || {};
    ttEnsureModals();
    const state = window._tt;
    const list = ttAll();
    const editing = opts.id ? list.find(e => e.id === opts.id) : null;
    const classes = ttSortByName(ttClasses());
    const teachers = ttSortByName(ttTeachers());
    const g = id => document.getElementById(id);

    g('ttPeriodTitle').textContent = editing ? 'Edit period' : 'Add period';
    g('ttFId').value = editing ? editing.id : '';
    ttShowError('ttFError', []);

    // Class
    const classNames = classes.map(c => c.name);
    if (editing && !classNames.includes(editing.class)) classNames.push(editing.class);
    const selectedClass = editing ? editing.class : (opts.class || (state.mode === 'class' ? state.cls : '') || classNames[0] || '');
    g('ttFClass').innerHTML = classNames.map(n =>
        `<option value="${ttEsc(n)}"${n === selectedClass ? ' selected' : ''}>${ttEsc(n)}</option>`).join('');

    // Teacher
    let selectedTeacher = '';
    if (editing) {
        const key = ttTeacherKey(editing, teachers);
        const t = teachers.find(x => 'id:' + x.id === key);
        selectedTeacher = t ? t.id : '';
    } else if (opts.teacherId) selectedTeacher = opts.teacherId;
    else if (state.mode === 'teacher') selectedTeacher = state.teacherId;
    g('ttFTeacher').innerHTML = '<option value="">No teacher yet</option>' + teachers.map(t =>
        `<option value="${ttEsc(t.id)}"${t.id === selectedTeacher ? ' selected' : ''}>${ttEsc(t.name)}${t.department ? ' (' + ttEsc(t.department) + ')' : ''}</option>`).join('');

    // Days: tick several when adding, a single day when editing
    const wrap = g('ttFDayWrap');
    if (editing) {
        wrap.innerHTML = `<label class="tt-label" for="ttFDay">Day</label>
            <select id="ttFDay" class="tt-input">${TT_DAYS.map(d =>
                `<option${d === editing.day ? ' selected' : ''}>${d}</option>`).join('')}</select>`;
    } else {
        wrap.innerHTML = `<label class="tt-label">Days</label>
            <div class="tt-days" id="ttFDays">${TT_DAYS.map(d => `
                <label class="tt-chip"><input type="checkbox" value="${d}"${d === opts.day ? ' checked' : ''}><span>${d.slice(0, 3)}</span></label>`).join('')}</div>
            <p class="tt-hint">Tick every day this period happens, to add it in one go.</p>`;
    }

    g('ttFSubject').value = editing ? (editing.subject || '') : '';
    g('ttFStart').value = editing ? (editing.start || '') : (opts.start || '');
    g('ttFEnd').value = editing ? (editing.end || '') : (opts.end || '');
    g('ttFRoom').value = editing ? (editing.room || '') : '';
    g('ttFDelete').style.display = editing ? '' : 'none';
    g('ttPeriodModal').setAttribute('aria-hidden', 'false');
    setTimeout(() => g(editing || opts.day ? 'ttFSubject' : 'ttFClass').focus(), 50);
}

function ttSavePeriod() {
    const g = id => document.getElementById(id);
    const editId = g('ttFId').value;
    const cls = g('ttFClass').value;
    const subject = g('ttFSubject').value.trim();
    const teacherId = g('ttFTeacher').value;
    const start = g('ttFStart').value;
    const end = g('ttFEnd').value;
    const room = g('ttFRoom').value.trim();
    const days = editId
        ? [g('ttFDay').value]
        : Array.from(document.querySelectorAll('#ttFDays input:checked')).map(i => i.value);

    const errors = [];
    if (!cls) errors.push('Choose a class.');
    if (!subject) errors.push('Enter the subject.');
    if (!days.length) errors.push('Tick at least one day.');
    if (!start || !end) errors.push('Enter the start and end time.');
    else if (ttToMin(end) <= ttToMin(start)) errors.push('The end time must be after the start time.');
    if (errors.length) return ttShowError('ttFError', errors);

    const teachers = ttTeachers();
    const teacher = teachers.find(t => t.id === teacherId);
    const list = ttAll();
    const others = list.filter(e => e.id !== editId);
    const cands = days.map(day => ({
        id: editId || ttNewId(), class: cls, day, subject,
        teacher: teacher ? teacher.name : '', teacherId: teacher ? teacher.id : '',
        start, end, room
    }));

    const problems = [];
    const roomWarnings = [];
    cands.forEach(c => {
        const f = ttFindConflicts(others, c, teachers);
        f.class.forEach(o => problems.push(`${cls} already has ${o.subject || 'a period'} on ${c.day}, ${o.start}–${o.end}.`));
        f.teacher.forEach(o => problems.push(`${teacher ? teacher.name : 'This teacher'} is already teaching ${o.class} on ${c.day}, ${o.start}–${o.end}.`));
        f.room.forEach(o => roomWarnings.push(`Room ${room} is used by ${o.class} on ${c.day}, ${o.start}–${o.end}.`));
    });
    if (problems.length) return ttShowError('ttFError', problems);
    if (roomWarnings.length && !confirm(roomWarnings.slice(0, 3).join('\n') + '\n\nAdd it anyway?')) return;

    const next = editId
        ? list.map(e => e.id === editId ? { ...e, ...cands[0] } : e)
        : list.concat(cands);
    if (!ttSave(next)) return ttShowError('ttFError', ['Could not save. Please try again.']);

    if (window._tt.mode === 'class') window._tt.cls = cls;
    ttCloseModal('ttPeriodModal');
    ttRender();
    showNotification(editId ? 'Period updated' : `${cands.length} period${cands.length === 1 ? '' : 's'} added`, 'success');
    ttAfterChange(editId ? `Timetable updated: ${subject} (${cls})` : `Timetable: ${cands.length} ${subject} period${cands.length === 1 ? '' : 's'} added for ${cls}`);
}

function ttDeletePeriod() {
    const id = document.getElementById('ttFId').value;
    const list = ttAll();
    const e = list.find(x => x.id === id);
    if (!e) return;
    if (!confirm(`Delete ${e.subject} for ${e.class} (${e.day}, ${e.start}–${e.end})?`)) return;
    if (ttSave(list.filter(x => x.id !== id))) {
        deleteRowFromBackend('timetables', id);
        ttCloseModal('ttPeriodModal');
        ttRender();
        showNotification('Period deleted', 'success');
        ttAfterChange(`Timetable: ${e.subject} removed from ${e.class}`);
    } else {
        ttShowError('ttFError', ['Could not delete. Please try again.']);
    }
}

function ttAfterChange(activityText) {
    if (typeof renderTeacherStats === 'function') renderTeacherStats();
    if (activityText && typeof addActivity === 'function') addActivity('🗓️', activityText);
}

// ---------- 7. Copy a timetable ----------

function ttOpenCopyModal() {
    ttEnsureModals();
    const list = ttAll();
    const classes = ttSortByName(ttClasses());
    const withPeriods = classes.filter(c => list.some(e => e.class === c.name));
    if (!withPeriods.length) return showNotification('Add some periods to a class first, then you can copy them.', 'warning');
    if (classes.length < 2) return showNotification('You need at least two classes to copy between.', 'warning');

    const current = window._tt.mode === 'class' && withPeriods.some(c => c.name === window._tt.cls)
        ? window._tt.cls : withPeriods[0].name;
    document.getElementById('ttCSource').innerHTML = withPeriods.map(c =>
        `<option value="${ttEsc(c.name)}"${c.name === current ? ' selected' : ''}>${ttEsc(c.name)} — ${list.filter(e => e.class === c.name).length} periods</option>`).join('');
    document.getElementById('ttCReplace').checked = false;
    ttShowError('ttCError', []);
    ttRenderCopyTargets();
    document.getElementById('ttCopyModal').setAttribute('aria-hidden', 'false');
}

function ttRenderCopyTargets() {
    const list = ttAll();
    const source = document.getElementById('ttCSource').value;
    const groups = {};
    ttSortByName(ttClasses()).filter(c => c.name !== source).forEach(c => {
        (groups[c.formLevel || 'Other'] = groups[c.formLevel || 'Other'] || []).push(c);
    });
    document.getElementById('ttCTargets').innerHTML = Object.keys(groups)
        .sort((a, b) => parseInt(a) - parseInt(b)).map(f => `
            <div class="tt-group">${f === 'Other' ? 'Other' : 'Form ' + ttEsc(f)}</div>
            ${groups[f].map(c => {
                const n = list.filter(e => e.class === c.name).length;
                return `<label><input type="checkbox" value="${ttEsc(c.name)}"> ${ttEsc(c.name)}
                    ${n ? `<span class="tt-pill muted">${n} periods</span>` : ''}</label>`;
            }).join('')}`).join('');
}

function ttDoCopy() {
    const source = document.getElementById('ttCSource').value;
    const targets = Array.from(document.querySelectorAll('#ttCTargets input:checked')).map(i => i.value);
    const replace = document.getElementById('ttCReplace').checked;
    if (!targets.length) return ttShowError('ttCError', ['Tick at least one class to copy to.']);

    const list = ttAll();
    const src = list.filter(e => e.class === source);
    if (!src.length) return ttShowError('ttCError', ['That class has no periods to copy.']);

    const replacing = targets.filter(t => replace && list.some(e => e.class === t));
    if (replacing.length && !confirm(`This will replace the existing timetable for: ${replacing.join(', ')}.\n\nContinue?`)) return;

    let next = list.slice();
    const skipped = [];
    const removedIds = [];
    let added = 0;
    targets.forEach(t => {
        const existing = next.filter(e => e.class === t);
        if (existing.length && !replace) { skipped.push(t); return; }
        existing.forEach(e => removedIds.push(e.id));
        next = next.filter(e => e.class !== t);
        src.forEach(e => {
            next.push({ id: ttNewId(), class: t, day: e.day, subject: e.subject, teacher: '', teacherId: '', start: e.start, end: e.end, room: '' });
            added++;
        });
    });
    if (!added) return ttShowError('ttCError', [`Nothing was copied: ${skipped.join(', ')} already ${skipped.length === 1 ? 'has' : 'have'} periods. Tick "Replace" to overwrite.`]);

    if (!ttSave(next)) return ttShowError('ttCError', ['Could not save. Please try again.']);
    removedIds.forEach(id => deleteRowFromBackend('timetables', id));
    window._tt.mode = 'class';
    window._tt.cls = targets.find(t => !skipped.includes(t)) || window._tt.cls;
    ttCloseModal('ttCopyModal');
    ttRender();
    showNotification(`${added} periods copied.${skipped.length ? ' Skipped (already planned): ' + skipped.join(', ') + '.' : ''} Now assign the teachers.`, 'success');
    ttAfterChange(`Timetable copied from ${source} to ${targets.length - skipped.length} class(es)`);
}

// ---------- 8. Print ----------

function ttPrint() {
    const holder = document.getElementById('ttGridHolder');
    if (!holder) return showNotification('Open a class or teacher timetable first.', 'warning');
    const title = holder.dataset.title || 'Timetable';
    const w = window.open('', '_blank');
    if (!w) return showNotification('Allow pop-ups to print the timetable.', 'warning');
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${ttEsc(title)}</title>
        <style>body{font-family:Arial,Helvetica,sans-serif;margin:24px;color:#0f172a}
        h1{font-size:20px;margin:0 0 4px}p{margin:0 0 16px;color:#64748b;font-size:12px}
        .tt-card-head{display:none}.tt-grid{min-width:0}${TT_GRID_CSS}
        .tt-period{box-shadow:none;-webkit-print-color-adjust:exact;print-color-adjust:exact}.tt-empty{display:none}</style></head>
        <body><h1>${ttEsc(title)}</h1><p>Printed ${ttEsc(new Date().toLocaleDateString())}</p>${holder.innerHTML}</body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
}

// ---------- 9. Events ----------

document.addEventListener('click', function (e) {
    const el = e.target.closest('[data-tt]');
    if (!el) return;
    const state = window._tt;
    switch (el.dataset.tt) {
        case 'add': ttOpenPeriodModal({}); break;
        case 'add-slot': ttOpenPeriodModal({ day: el.dataset.day, start: el.dataset.start, end: el.dataset.end }); break;
        case 'edit': ttOpenPeriodModal({ id: el.dataset.id }); break;
        case 'copy': ttOpenCopyModal(); break;
        case 'print': ttPrint(); break;
        case 'delete-period': ttDeletePeriod(); break;
        case 'tab': state.mode = el.dataset.mode; ttRender(); break;
        case 'go-teacher': state.mode = 'teacher'; state.teacherId = el.dataset.id; ttRender(); break;
        case 'close-modal': ttCloseModal(el.dataset.modal); break;
        case 'copy-all': document.querySelectorAll('#ttCTargets input').forEach(i => { i.checked = true; }); break;
        case 'copy-none': document.querySelectorAll('#ttCTargets input').forEach(i => { i.checked = false; }); break;
    }
});

document.addEventListener('change', function (e) {
    if (!e.target) return;
    if (e.target.id === 'ttSelClass') { window._tt.cls = e.target.value; ttRender(); }
    else if (e.target.id === 'ttSelTeacher') { window._tt.teacherId = e.target.value; ttRender(); }
    else if (e.target.id === 'ttCSource') ttRenderCopyTargets();
});

document.addEventListener('submit', function (e) {
    if (!e.target) return;
    if (e.target.id === 'ttForm') { e.preventDefault(); ttSavePeriod(); }
    else if (e.target.id === 'ttCopyForm') { e.preventDefault(); ttDoCopy(); }
});

// ---------- 10. Names the rest of the app already calls ----------
// school.js (loadAllData) and classes.js call these. They replace the old
// versions in school.js, so those can be deleted from school.js.

function loadTimetablesFromStorage() {
    window._timetables = ttAll();
    ttRender();
}

function populateTimetableClassSelect() {
    ttRender();
}

function renderTimetableForClass(className) {
    if (className) { window._tt.mode = 'class'; window._tt.cls = className; }
    ttRender();
}

function showAddTimetableEntry() {
    ttOpenPeriodModal({});
}

function editTimetableEntry(id) {
    ttOpenPeriodModal({ id });
}
