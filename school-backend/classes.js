 // ============================================================
// classes.js — Class Management (Phase 1: safer + simpler)
// Load order in the dashboard HTML (after the supabase-js tag):
//   <script src="school.js"></script>
//   <script src="teacher-profile.js"></script>
//   <script src="classes.js"></script>
// Relies on shared helpers in school.js (getData, saveData,
// showNotification, deleteRowFromBackend, updateDashboardStats, ...).
// ============================================================

// ---------- 0. Safety helper ----------
// Every piece of text that comes from data (class names, rooms, teacher and
// student names) must go through cmEsc() before it is placed in HTML.
function cmEsc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, c =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- 1. Class teacher lookup ----------

function getTeacherNameById(teacherId) {
    if (!teacherId) return '';
    const teacher = (getData('teachers') || []).find(t => t.id === teacherId);
    return teacher ? teacher.name : '';
}

function resolveClassTeacherName(cls) {
    if (!cls) return '—';
    return getTeacherNameById(cls.teacherId) || cls.teacher || '—';
}

// ---------- 2. Loading and listing ----------

function loadClassesFromStorage() {
    const classes = getData('classes') || [];
    window._classes = Array.isArray(classes) ? classes : [];
    renderClasses();
    populateClassFilter();
}

function cmSortedClasses(list) {
    return list.slice().sort((a, b) =>
        String(a.name).localeCompare(String(b.name), undefined, { numeric: true }));
}

function cmFormList(classes) {
    const set = new Set(classes.map(c => String(c.formLevel || 'Unassigned')));
    return Array.from(set).sort((a, b) => {
        if (a === 'Unassigned') return 1;
        if (b === 'Unassigned') return -1;
        return parseInt(a) - parseInt(b);
    });
}

// Layout: one tab per Form (Form 1 ... Form 6) with a search box, and a compact
// table underneath. Nine classes in a Form is nine neat rows, not nine big cards,
// and only one Form is on screen at a time.
function cmInitials(name) {
    const words = String(name || '').split(/\s+/)
        .filter(w => w && !/^(mr|mrs|ms|miss|dr|prof)\.?$/i.test(w));
    return words.slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
}

function renderClasses() {
    const container = document.getElementById('classesContainer');
    if (!container) return;

    // Old controls that the tabs replace
    const viewMode = document.getElementById('classViewModeSelect');
    if (viewMode) { viewMode.value = 'cards'; viewMode.style.display = 'none'; }
    const formFilter = document.getElementById('formLevelFilter');
    if (formFilter) formFilter.style.display = 'none';

    // The old card grid laid its children out in columns; the board needs the full width.
    container.style.display = 'block';
    container.innerHTML = '';
    renderClassOverview();

    const classes = window._classes || [];
    if (classes.length === 0) {
        container.innerHTML = '<p>No classes yet. Click "Add New Class" to create one.</p>';
        return;
    }

    const quick = window._classQuickFilter || '';
    const forms = cmFormList(classes);
    if (!forms.includes(window._classFormView)) window._classFormView = forms[0];

    const counts = {};
    classes.forEach(c => {
        const f = String(c.formLevel || 'Unassigned');
        counts[f] = (counts[f] || 0) + 1;
    });

    const chip = quick
        ? `<div class="cm-chip">Showing: ${quick === 'noTeacher' ? 'Classes without a teacher' : 'Empty classes'}
            <button type="button" onclick="setClassQuickFilter('')">Clear</button></div>`
        : '';
    const tabs = forms.map(f => `
        <button type="button" class="cm-tab" data-class-action="form" data-id="${cmEsc(f)}">
            ${f === 'Unassigned' ? 'Unassigned' : 'Form ' + cmEsc(f)} <span>${counts[f]}</span>
        </button>`).join('');

    container.innerHTML = `
        <div class="cm-board">
            ${chip}
            <div class="cm-tools">
                <div class="cm-tabs">${tabs}</div>
                <label class="cm-search-wrap">
                    <span data-lucide="search"></span>
                    <input id="cmClassSearch" class="cm-search" type="search"
                        placeholder="Search class, teacher or room" value="${cmEsc(window._classSearch || '')}">
                </label>
            </div>
            <div id="cmClassTable"></div>
        </div>`;
    renderClassTable();
}

// Fills only the table card, so typing in the search box never loses focus.
function renderClassTable() {
    const holder = document.getElementById('cmClassTable');
    if (!holder) return;
    const classes = window._classes || [];
    const students = getData('students') || [];
    const quick = window._classQuickFilter || '';
    const search = (window._classSearch || '').trim().toLowerCase();
    const searching = !!(search || quick);

    const counts = {};
    students.forEach(s => { counts[s.class] = (counts[s.class] || 0) + 1; });

    // Searching or using a quick filter looks across ALL forms
    let list = searching
        ? classes
        : classes.filter(c => String(c.formLevel || 'Unassigned') === window._classFormView);
    if (quick === 'noTeacher') list = list.filter(c => resolveClassTeacherName(c) === '—');
    if (quick === 'empty') list = list.filter(c => !counts[c.name]);
    if (search) {
        list = list.filter(c =>
            String(c.name).toLowerCase().includes(search) ||
            resolveClassTeacherName(c).toLowerCase().includes(search) ||
            String(c.room || '').toLowerCase().includes(search));
    }
    list = cmSortedClasses(list);

    document.querySelectorAll('.cm-tab').forEach(t =>
        t.classList.toggle('active', !searching && t.dataset.id === window._classFormView));

    const totalStudents = list.reduce((sum, c) => sum + (counts[c.name] || 0), 0);
    const view = window._classFormView;
    const title = search ? 'Search results'
        : quick === 'noTeacher' ? 'Classes without a teacher'
        : quick === 'empty' ? 'Empty classes'
        : (view === 'Unassigned' ? 'Unassigned classes' : 'Form ' + cmEsc(view));
    const sub = `${list.length} ${list.length === 1 ? 'class' : 'classes'} · ${totalStudents} student${totalStudents === 1 ? '' : 's'}`;

    let body;
    if (list.length === 0) {
        body = '<div class="cm-empty">No classes found.</div>';
    } else {
        const rows = list.map(c => {
            const teacher = resolveClassTeacherName(c);
            const n = counts[c.name] || 0;
            const badge = cmEsc(String(c.name).replace(/^Form\s*/i, '').replace('-', ''));
            const id = cmEsc(c.id);
            return `<tr>
                <td data-label="Class">
                    <button type="button" class="cm-class-link" data-class-action="view" data-id="${id}">
                        <span class="cm-badge">${badge}</span>
                        <span class="cm-class-name">${cmEsc(c.name)}</span>
                    </button>
                </td>
                <td data-label="Class Teacher">${teacher === '—'
                    ? '<span class="cm-pill warn">No teacher</span>'
                    : `<span class="cm-person"><span class="cm-avatar">${cmEsc(cmInitials(teacher))}</span>${cmEsc(teacher)}</span>`}</td>
                <td data-label="Room">${c.room ? cmEsc(c.room) : '<span class="cm-dash">—</span>'}</td>
                <td data-label="Students">${n
                    ? `<span class="cm-pill">${n} student${n === 1 ? '' : 's'}</span>`
                    : '<span class="cm-pill muted">Empty</span>'}</td>
                <td class="cm-actions">
                    <div class="table-actions">
                        <button type="button" class="icon-action-btn action-view" title="View students" aria-label="View students" data-class-action="view" data-id="${id}"><span data-lucide="eye"></span></button>
                        <button type="button" class="icon-action-btn action-edit" title="Edit class" aria-label="Edit class" data-class-action="edit" data-id="${id}"><span data-lucide="pencil"></span></button>
                        <button type="button" class="icon-action-btn action-delete" title="Delete class" aria-label="Delete class" data-class-action="delete" data-id="${id}"><span data-lucide="trash-2"></span></button>
                    </div>
                </td>
            </tr>`;
        }).join('');
        body = `<table class="cm-table">
            <thead><tr><th>Class</th><th>Class Teacher</th><th>Room</th><th>Students</th><th class="cm-th-actions">Actions</th></tr></thead>
            <tbody>${rows}</tbody>
        </table>`;
    }

    holder.innerHTML = `
        <div class="cm-card">
            <div class="cm-card-head"><h3>${title}</h3><span>${sub}</span></div>
            ${body}
        </div>`;
    if (window.lucide) lucide.createIcons();
}

function filterClassesByFormLevel() {
    renderClasses();
}

// One click handler for every Edit / View / Delete button, so no data is ever
// placed inside an inline onclick="..." string.
document.addEventListener('click', function (e) {
    const btn = e.target.closest('[data-class-action]');
    if (!btn) return;
    const id = btn.dataset.id;
    switch (btn.dataset.classAction) {
        case 'form':
            window._classFormView = id;
            window._classSearch = '';
            window._classQuickFilter = '';
            renderClasses();
            break;
        case 'view': showViewClassDetails(id); break;
        case 'edit': showEditClassForm(id); break;
        case 'delete': deleteClassRecord(btn, id); break;
        case 'grade': promptAddGrade(id); break;
        case 'student': viewStudentDetail(id); break;
    }
});

document.addEventListener('input', function (e) {
    if (e.target && e.target.id === 'cmClassSearch') {
        window._classSearch = e.target.value;
        renderClassTable();
    }
});

// ---------- 3. Create / edit class form ----------

function openClassModal(editId = null) {
    const modal = document.getElementById('classModal');
    if (!modal) return;
    modal.setAttribute('aria-hidden', 'false');
    const form = document.getElementById('classForm');
    if (form && form.reset) form.reset();
    document.getElementById('modalTitle').textContent = editId ? 'Edit Class' : 'Create Class';
    modal.dataset.editId = editId || '';

    if (editId) {
        const classes = window._classes || getData('classes') || [];
        const cls = classes.find(c => c.id === editId);
        if (cls) {
            document.getElementById('classFormLevelInput').value = cls.formLevel || '';
            document.getElementById('classNameInput').value = (cls.name || '').replace(/^Form\s*\d+-/i, '');
            document.getElementById('classRoomInput').value = cls.room || '';
            populateClassTeacherSelect(cls.teacherId, cls.teacher);
            return;
        }
    }
    populateClassTeacherSelect('');
}

function populateClassTeacherSelect(selectedId, legacyTeacherName) {
    const select = document.getElementById('classTeacherSelect');
    if (!select) return;
    const teachers = getData('teachers') || [];

    select.innerHTML = '<option value="">No teacher assigned</option>';
    teachers.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = t.department ? `${t.name} (${t.department})` : t.name;
        select.appendChild(opt);
    });

    let toSelect = selectedId || '';
    if (!toSelect && legacyTeacherName) {
        const match = teachers.find(t => t.name === legacyTeacherName);
        if (match) toSelect = match.id;
    }
    select.value = toSelect;
}

function addTeacherFromClassModal() {
    window._pendingClassFormState = {
        editId: document.getElementById('classModal').dataset.editId || '',
        formLevel: document.getElementById('classFormLevelInput').value,
        name: document.getElementById('classNameInput').value,
        room: document.getElementById('classRoomInput').value
    };
    document.getElementById('classModal').setAttribute('aria-hidden', 'true');
    openTeacherModal(null, true);
}

function closeClassModal() {
    const modal = document.getElementById('classModal');
    if (!modal) return;
    modal.setAttribute('aria-hidden', 'true');
    modal.dataset.editId = '';
}

// When a class is renamed (e.g. Form 1-A -> Form 1-B) everything that points
// at the old name must follow, otherwise students "disappear" from the class.
function renameClassEverywhere(oldName, newName) {
    if (!oldName || oldName === newName) return;
    ['students', 'timetables', 'fees', 'attendance', 'grades', 'teachers'].forEach(key => {
        const list = getData(key);
        if (!Array.isArray(list)) return;
        let changed = false;
        list.forEach(item => {
            if (item && item.class === oldName) { item.class = newName; changed = true; }
        });
        if (changed) saveData(key, list);
    });
    if (typeof loadStudentsFromStorage === 'function') loadStudentsFromStorage();
}

function refreshAfterClassChange() {
    renderClasses();
    populateTimetableClassSelect();
    populateClassFilter();
    populateStudentClassSelect();
    updateDashboardStats();
}

document.addEventListener('submit', function (e) {
    if (!e.target || e.target.id !== 'classForm') return;
    e.preventDefault();

    const editId = document.getElementById('classModal').dataset.editId || null;
    const formLevel = document.getElementById('classFormLevelInput').value.trim();
    let name = document.getElementById('classNameInput').value.trim();
    const room = document.getElementById('classRoomInput').value.trim();

    if (!/^[1-6]$/.test(formLevel)) return showNotification('Please choose a Form from 1 to 6', 'warning');
    if (!name) return showNotification('Class name is required (for example: A)', 'warning');
    if (!/^[A-Za-z0-9 ]{1,10}$/.test(name)) {
        return showNotification('Class name can only use letters and numbers (up to 10 characters)', 'warning');
    }
    if (room.length > 30) return showNotification('Room is too long (30 characters maximum)', 'warning');
    if (name.length === 1) name = name.toUpperCase();

    const fullClassName = `Form ${formLevel}-${name}`;

    let classes = getData('classes') || [];
    if (!Array.isArray(classes)) classes = [];

    // No two classes may share a name — students are matched by class name.
    const duplicate = classes.find(c =>
        c.id !== editId && String(c.name).toLowerCase() === fullClassName.toLowerCase());
    if (duplicate) return showNotification(`${fullClassName} already exists`, 'warning');

    const teacherId = document.getElementById('classTeacherSelect')?.value || '';
    const teacherObj = (getData('teachers') || []).find(t => t.id === teacherId);
    const clsObj = {
        name: fullClassName,
        formLevel,
        teacherId,
        teacher: teacherObj ? teacherObj.name : '',
        room
    };

    if (editId) {
        const idx = classes.findIndex(c => c.id === editId);
        if (idx === -1) return showNotification('Class not found', 'error');
        const oldName = classes[idx].name;
        classes[idx] = { ...classes[idx], ...clsObj };
        if (saveData('classes', classes)) {
            window._classes = classes;
            renameClassEverywhere(oldName, fullClassName);
            refreshAfterClassChange();
            closeClassModal();
            showNotification('Class updated', 'success');
        } else {
            showNotification('Error updating class', 'error');
        }
    } else {
        addClassToStorage(clsObj);
        closeClassModal();
    }
});

document.addEventListener('click', function (e) {
    const modal = document.getElementById('classModal');
    if (!modal) return;
    if (modal.getAttribute('aria-hidden') === 'false' && e.target === modal) closeClassModal();
});

// ---------- 4. Save / edit / delete ----------

// Unique id that two people adding a class at the same moment cannot share.
function generateClassId(classes) {
    let id;
    do {
        id = 'C' + Date.now().toString(36).toUpperCase() +
            Math.floor(Math.random() * 1296).toString(36).toUpperCase().padStart(2, '0');
    } while (classes.some(c => c.id === id));
    return id;
}

function addClassToStorage(cls) {
    let classes = getData('classes') || [];
    if (!Array.isArray(classes)) classes = [];
    const newClass = { id: generateClassId(classes), ...cls };
    classes.push(newClass);
    if (saveData('classes', classes)) {
        window._classes = classes;
        refreshAfterClassChange();
        showNotification('Class added successfully!', 'success');
    } else {
        showNotification('Error saving class!', 'error');
    }
}

function showEditClassForm(id) {
    const classes = window._classes || getData('classes') || [];
    if (!classes.some(c => c.id === id)) return showNotification('Class not found', 'error');
    openClassModal(id);
}

function deleteClassRecord(button, classId) {
    let classes = getData('classes') || [];
    const cls = classes.find(c => c.id === classId);
    if (!cls) return showNotification('Class not found', 'error');

    // A class that still has students must not be deleted: they would be left
    // with a class that no longer exists.
    const studentCount = (getData('students') || []).filter(s => s.class === cls.name).length;
    if (studentCount > 0) {
        return showNotification(
            `${cls.name} still has ${studentCount} student${studentCount === 1 ? '' : 's'}. Move them to another class first.`,
            'warning');
    }

    if (!confirm(`Delete ${cls.name}? This cannot be undone.`)) return;

    classes = classes.filter(c => c.id !== classId);
    if (saveData('classes', classes)) {
        deleteRowFromBackend('classes', classId);
        window._classes = classes;
        refreshAfterClassChange();
        showNotification('Class deleted', 'success');
    } else {
        showNotification('Error deleting class', 'error');
    }
}

// ---------- 5. Class details popup (students in the class) ----------

function showViewClassDetails(id) {
    openClassDetailsModal(id);
}

function openClassDetailsModal(classId) {
    const classes = window._classes || getData('classes') || [];
    const cls = classes.find(c => c.id === classId);
    if (!cls) return showNotification('Class not found', 'error');

    const students = getData('students') || [];
    const fees = getData('fees') || [];
    const grades = getData('grades') || [];

    const rows = students.filter(s => s.class === cls.name).map(s => {
        const fee = fees.find(f => f.studentId === s.id);
        const feeStatus = fee && fee.status === 'paid' ? 'Paid' : 'Pending';
        const mid = grades.find(g => g.studentId === s.id && (g.examType || '').toLowerCase() === 'midterm');
        const fin = grades.find(g => g.studentId === s.id && (g.examType || '').toLowerCase() === 'final');
        const midDisplay = mid ? (mid.marks + ' (' + (mid.grade || '') + ')') : '-';
        const finDisplay = fin ? (fin.marks + ' (' + (fin.grade || '') + ')') : '-';
        return { student: s, feeStatus, midDisplay, finDisplay };
    });

    const tbody = document.getElementById('classStudentsTableBody');
    const title = document.getElementById('classDetailsTitle');
    if (!tbody || !title) return;
    // school.js reads this title to find the class — keep the "Class: name — ..." shape.
    title.textContent = `Class: ${cls.name} — Students (${rows.length})`;
    tbody.innerHTML = '';

    if (rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5">No students in this class.</td></tr>';
    } else {
        rows.forEach(r => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${cmEsc(r.student.name)}</td>
                <td>${cmEsc(r.feeStatus)}</td>
                <td>${cmEsc(r.midDisplay)}</td>
                <td>${cmEsc(r.finDisplay)}</td>
                <td>
                    <button class="btn-small btn-secondary" data-class-action="grade" data-id="${cmEsc(r.student.id)}">Add/Edit Grade</button>
                    <button class="btn-small btn-info" data-class-action="student" data-id="${cmEsc(r.student.id)}">View</button>
                </td>`;
            tbody.appendChild(tr);
        });
    }

    const modal = document.getElementById('classDetailsModal');
    if (modal) modal.setAttribute('aria-hidden', 'false');
}

function closeClassDetailsModal() {
    const modal = document.getElementById('classDetailsModal');
    if (modal) modal.setAttribute('aria-hidden', 'true');
}

// ---------- 6. Overview: statistics cards and quick actions ----------

function getClassOverviewStats() {
    const classes = Array.isArray(window._classes) ? window._classes : [];
    const rawStudents = getData('students');
    const students = Array.isArray(rawStudents) ? rawStudents : [];
    const classNames = new Set(classes.map(c => c.name));
    const inClasses = students.filter(s => classNames.has(s.class));
    const activeInClasses = inClasses.filter(s => (s.status || 'Active') === 'Active').length;
    // Active students whose class no longer exists (office needs to place them).
    const unplaced = students.filter(s => (s.status || 'Active') === 'Active' && !classNames.has(s.class)).length;
    const activeYear = parseInt(localStorage.getItem('lastProcessedAcademicYear'), 10) || new Date().getFullYear();

    return {
        totalClasses: classes.length,
        formCount: new Set(classes.map(c => String(c.formLevel || ''))).size,
        studentsInClasses: inClasses.length,
        activeInClasses,
        unplaced,
        activeYear,
        noTeacher: classes.filter(c => resolveClassTeacherName(c) === '—').length,
        empty: classes.filter(c => !students.some(s => s.class === c.name)).length
    };
}

function injectClassOverviewStyles() {
    if (document.getElementById('cmStyles')) return;
    document.head.insertAdjacentHTML('beforeend', `<style id="cmStyles">
        .cm-overview { margin-bottom: 1.25rem; }
        .cm-stats, .cm-minis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; }
        .cm-stats { margin-bottom: 1rem; }
        .cm-minis { gap: 0.75rem; }
        .cm-stat { display: flex; align-items: center; gap: 0.9rem; background: #fff; border: 1px solid var(--border-color, #e2e8f0); border-radius: 16px; padding: 1.1rem 1.25rem; box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04); }
        .cm-stat-icon { flex: none; width: 52px; height: 52px; border-radius: 14px; display: flex; align-items: center; justify-content: center; }
        .cm-stat-icon svg { width: 24px; height: 24px; }
        .cm-stat-icon.orange { background: #ffedd5; color: #ea580c; }
        .cm-stat-icon.green { background: #dcfce7; color: #16a34a; }
        .cm-stat-icon.slate { background: #e2e8f0; color: #475569; }
        .cm-stat-icon.amber { background: #fef3c7; color: #b45309; }
        .cm-stat-label { font-size: 0.85rem; color: var(--muted-text, #64748b); }
        .cm-stat-value { font-size: 1.75rem; font-weight: 700; line-height: 1.15; }
        .cm-stat-sub { font-size: 0.78rem; color: var(--muted-text, #64748b); margin-top: 0.1rem; min-height: 1em; }
        .cm-mini { display: flex; align-items: center; gap: 0.75rem; text-align: left; background: #fff; border: 1px solid var(--border-color, #e2e8f0); border-radius: 14px; padding: 0.8rem 1rem; cursor: pointer; font: inherit; color: inherit; transition: border-color 0.15s, box-shadow 0.15s, transform 0.15s; }
        .cm-mini:hover { border-color: var(--primary-color, #ea580c); box-shadow: 0 4px 12px rgba(234, 88, 12, 0.12); transform: translateY(-1px); }
        .cm-mini.active { border-color: var(--primary-color, #ea580c); background: #fff7ed; }
        .cm-mini-icon { flex: none; width: 38px; height: 38px; border-radius: 10px; background: #fff7ed; color: #ea580c; display: flex; align-items: center; justify-content: center; }
        .cm-mini-icon svg { width: 18px; height: 18px; }
        .cm-mini-text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
        .cm-mini-title { font-weight: 700; font-size: 0.92rem; }
        .cm-mini-sub { font-size: 0.78rem; color: var(--muted-text, #64748b); }
        .cm-mini-go { flex: none; color: #94a3b8; display: flex; }
        .cm-mini-go svg { width: 18px; height: 18px; }
        .cm-chip { display: inline-flex; align-items: center; gap: 0.6rem; background: #fff7ed; color: #c2410c; border: 1px solid #fed7aa; border-radius: 999px; padding: 0.3rem 0.5rem 0.3rem 0.9rem; font-size: 0.85rem; font-weight: 600; margin-bottom: 1rem; }
        .cm-chip button { border: none; background: #fff; border-radius: 999px; padding: 0.15rem 0.7rem; font: inherit; font-size: 0.78rem; font-weight: 700; cursor: pointer; color: #c2410c; }
        .cm-ay-summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.75rem; margin-bottom: 1.1rem; }
        .cm-ay-box { border: 1px solid var(--border-color, #e2e8f0); border-radius: 12px; padding: 0.8rem 1rem; background: var(--light-bg, #f8fafc); }
        .cm-ay-box .cm-stat-value { font-size: 1.4rem; }
        .cm-board { width: 100%; }
        .cm-tools { display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap; margin-bottom: 1rem; }
        .cm-tabs { display: flex; gap: 0.5rem; flex-wrap: wrap; }
        .cm-tab { display: inline-flex; align-items: center; gap: 0.4rem; border: 1px solid var(--border-color, #e2e8f0); background: #fff; border-radius: 999px; padding: 0.45rem 0.95rem; font: inherit; font-weight: 600; font-size: 0.9rem; cursor: pointer; color: #475569; transition: all 0.15s; }
        .cm-tab span { background: #f1f5f9; border-radius: 999px; padding: 0.05rem 0.5rem; font-size: 0.78rem; }
        .cm-tab:hover { border-color: #ea580c; color: #ea580c; }
        .cm-tab.active { background: #ea580c; border-color: #ea580c; color: #fff; box-shadow: 0 2px 8px rgba(234, 88, 12, 0.25); }
        .cm-tab.active span { background: rgba(255, 255, 255, 0.25); color: #fff; }
        .cm-search-wrap { position: relative; display: block; flex: 0 1 320px; min-width: 220px; }
        .cm-search-wrap > span { position: absolute; left: 0.8rem; top: 50%; transform: translateY(-50%); color: #94a3b8; display: flex; pointer-events: none; }
        .cm-search-wrap svg { width: 16px; height: 16px; }
        .cm-search { width: 100%; box-sizing: border-box; padding: 0.6rem 0.9rem 0.6rem 2.3rem; border: 1px solid var(--border-color, #e2e8f0); border-radius: 12px; font: inherit; font-size: 0.9rem; background: #fff; }
        .cm-search:focus { outline: none; border-color: #ea580c; box-shadow: 0 0 0 3px rgba(234, 88, 12, 0.12); }
        .cm-card { width: 100%; background: #fff; border: 1px solid var(--border-color, #e2e8f0); border-radius: 16px; box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04); overflow: hidden; }
        .cm-card-head { display: flex; align-items: baseline; justify-content: space-between; gap: 1rem; flex-wrap: wrap; padding: 1rem 1.25rem; border-bottom: 1px solid #f1f5f9; }
        .cm-card-head h3 { margin: 0; font-size: 1.05rem; color: #0f172a; }
        .cm-card-head span { color: #64748b; font-size: 0.85rem; }
        .cm-table { width: 100%; border-collapse: collapse; table-layout: auto; }
        .cm-table th { text-align: left; font-size: 0.74rem; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; padding: 0.7rem 1.25rem; background: #f8fafc; border-bottom: 1px solid #f1f5f9; white-space: nowrap; }
        .cm-table td { padding: 0.8rem 1.25rem; border-bottom: 1px solid #f1f5f9; vertical-align: middle; font-size: 0.93rem; }
        .cm-table tbody tr:last-child td { border-bottom: none; }
        .cm-table tbody tr:hover { background: #fffaf5; }
        .cm-th-actions, .cm-actions { text-align: right; width: 1%; white-space: nowrap; }
        .cm-actions .table-actions { display: inline-flex; gap: 0.35rem; }
        .cm-class-link { display: inline-flex; align-items: center; gap: 0.75rem; border: none; background: none; padding: 0; font: inherit; cursor: pointer; color: inherit; text-align: left; }
        .cm-class-link:hover .cm-class-name { color: #ea580c; }
        .cm-badge { flex: none; width: 40px; height: 40px; border-radius: 12px; background: #fff7ed; color: #ea580c; font-weight: 700; font-size: 0.9rem; display: flex; align-items: center; justify-content: center; }
        .cm-class-name { font-weight: 600; white-space: nowrap; }
        .cm-person { display: inline-flex; align-items: center; gap: 0.6rem; }
        .cm-avatar { flex: none; width: 30px; height: 30px; border-radius: 50%; background: #e2e8f0; color: #475569; font-size: 0.72rem; font-weight: 700; display: flex; align-items: center; justify-content: center; }
        .cm-pill { display: inline-block; padding: 0.2rem 0.65rem; border-radius: 999px; background: #dcfce7; color: #15803d; font-size: 0.8rem; font-weight: 600; white-space: nowrap; }
        .cm-pill.muted { background: #f1f5f9; color: #64748b; }
        .cm-pill.warn { background: #fef3c7; color: #b45309; }
        .cm-dash { color: #94a3b8; }
        .cm-empty { padding: 2rem 1.25rem; color: #64748b; text-align: center; }
        @media (max-width: 700px) {
            .cm-search-wrap { flex: 1 1 100%; }
            .cm-table thead { display: none; }
            .cm-table, .cm-table tbody, .cm-table tr, .cm-table td { display: block; width: 100%; box-sizing: border-box; }
            .cm-table tr { padding: 0.75rem 1rem; border-bottom: 1px solid #f1f5f9; }
            .cm-table td { border: none; padding: 0.3rem 0; display: flex; justify-content: space-between; align-items: center; gap: 1rem; width: 100%; }
            .cm-table td::before { content: attr(data-label); color: #64748b; font-size: 0.78rem; }
            .cm-table td.cm-actions { width: 100%; justify-content: flex-end; }
            .cm-table td.cm-actions::before { content: none; }
        }
        @media (max-width: 1100px) { .cm-stats, .cm-minis { grid-template-columns: repeat(2, 1fr); } }
        @media (max-width: 560px) { .cm-stats, .cm-minis, .cm-ay-summary { grid-template-columns: 1fr; } }
    </style>`);
}

// Creates the overview holder once, above the page's existing toolbar
function ensureClassOverview() {
    let overview = document.getElementById('classOverview');
    if (overview) return overview;
    const container = document.getElementById('classesContainer');
    if (!container) return null;

    injectClassOverviewStyles();
    overview = document.createElement('div');
    overview.id = 'classOverview';
    overview.className = 'cm-overview';

    let anchor = container;
    const filter = document.getElementById('formLevelFilter');
    if (filter) {
        let el = filter;
        while (el.parentElement && el.parentElement !== container.parentElement) el = el.parentElement;
        if (el.parentElement === container.parentElement) anchor = el;
    }
    anchor.parentNode.insertBefore(overview, anchor);
    return overview;
}

function renderClassOverview() {
    const overview = ensureClassOverview();
    if (!overview) return;
    const s = getClassOverviewStats();
    const quick = window._classQuickFilter || '';
    const plural = n => `${n} ${n === 1 ? 'class' : 'classes'}`;

    const stat = (icon, tone, label, value, sub) => `
        <div class="cm-stat">
            <div class="cm-stat-icon ${tone}"><span data-lucide="${icon}"></span></div>
            <div><div class="cm-stat-label">${label}</div><div class="cm-stat-value">${value}</div>
                <div class="cm-stat-sub">${sub || ''}</div></div>
        </div>`;
    const mini = (icon, title, sub, action, active) => `
        <button type="button" class="cm-mini${active ? ' active' : ''}" onclick="${action}">
            <span class="cm-mini-icon"><span data-lucide="${icon}"></span></span>
            <span class="cm-mini-text"><span class="cm-mini-title">${title}</span><span class="cm-mini-sub">${sub}</span></span>
            <span class="cm-mini-go"><span data-lucide="chevron-right"></span></span>
        </button>`;

    overview.innerHTML = `
        <div class="cm-stats">
            ${stat('layout-grid', 'orange', 'Total Classes', s.totalClasses.toLocaleString(), `Across ${s.formCount} form${s.formCount === 1 ? '' : 's'}`)}
            ${stat('users', 'green', 'Students in Classes', s.studentsInClasses.toLocaleString(), `${s.activeInClasses.toLocaleString()} active`)}
            ${stat('user-minus', 'amber', 'Not in a Class', s.unplaced.toLocaleString(), s.unplaced ? 'Need a class' : 'Everyone placed ✓')}
            ${stat('calendar-check', 'slate', 'Active Year', s.activeYear, 'Current academic year')}
        </div>
        <div class="cm-minis">
            ${mini('plus', 'Add Class', 'Create a new class', 'openClassModal()', false)}
            ${mini('user-x', 'No Class Teacher', s.noTeacher ? plural(s.noTeacher) : 'All set ✓', "setClassQuickFilter('noTeacher')", quick === 'noTeacher')}
            ${mini('inbox', 'Empty Classes', s.empty ? plural(s.empty) : 'None ✓', "setClassQuickFilter('empty')", quick === 'empty')}
            ${mini('calendar-days', 'Academic Year', `${s.activeYear} · Active`, 'openAcademicYearPanel()', false)}
        </div>`;
    if (window.lucide) lucide.createIcons();
}

// Clicking the same mini card twice switches the filter off again
function setClassQuickFilter(filter) {
    window._classQuickFilter = window._classQuickFilter === filter ? '' : filter;
    renderClasses();
}

// ---------- 7. Academic year panel ----------

function ensureAcademicYearModal() {
    if (document.getElementById('cmAcademicModal')) return;
    injectClassOverviewStyles();
    document.body.insertAdjacentHTML('beforeend', `
        <div id="cmAcademicModal" class="modal" aria-hidden="true">
            <div class="modal-content" style="max-width:560px;">
                <div class="modal-header">
                    <h3>Academic Year</h3>
                    <button class="modal-close" onclick="closeAcademicYearPanel()">✕</button>
                </div>
                <div id="cmAcademicBody"></div>
            </div>
        </div>`);
    const modal = document.getElementById('cmAcademicModal');
    modal.addEventListener('click', e => { if (e.target === modal) closeAcademicYearPanel(); });
}

function openAcademicYearPanel() {
    ensureAcademicYearModal();
    const s = getClassOverviewStats();
    const classes = Array.isArray(window._classes) ? window._classes : [];
    const rawStudents = getData('students');
    const students = Array.isArray(rawStudents) ? rawStudents : [];
    const lastRollover = parseInt(localStorage.getItem('lastProcessedAcademicYear'), 10) || s.activeYear;
    const graduates = students.filter(st => st.status === 'Graduated').length;

    const rows = [1, 2, 3, 4, 5, 6].map(level => {
        const classCount = classes.filter(c => String(c.formLevel) === String(level)).length;
        const studentCount = students.filter(st => {
            const parsed = typeof parseClassName === 'function' ? parseClassName(st.class) : null;
            return parsed && parsed.level === level && (st.status || 'Active') === 'Active';
        }).length;
        return `<tr><td>Form ${level}</td><td>${classCount}</td><td>${studentCount}</td></tr>`;
    }).join('');

    const box = (label, value) => `<div class="cm-ay-box"><div class="cm-stat-label">${label}</div><div class="cm-stat-value">${value}</div></div>`;
    document.getElementById('cmAcademicBody').innerHTML = `
        <div class="cm-ay-summary">
            ${box('Active Year', s.activeYear)}
            ${box('Last Rollover', lastRollover)}
            ${box('Graduates', graduates)}
        </div>
        <table class="table" style="margin:0;">
            <thead><tr><th>Form</th><th>Classes</th><th>Active Students</th></tr></thead>
            <tbody>${rows}</tbody>
        </table>`;
    document.getElementById('cmAcademicModal').setAttribute('aria-hidden', 'false');
}

function closeAcademicYearPanel() {
    document.getElementById('cmAcademicModal')?.setAttribute('aria-hidden', 'true');
}
