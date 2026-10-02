 // ============================================================
// classes.js — Class Management
// Load order in the dashboard HTML (after the supabase-js tag):
//   <script src="school.js"></script>
//   <script src="teacher-profile.js"></script>
//   <script src="classes.js"></script>
// Everything about classes lives here: listing, creating, editing,
// deleting, the class-teacher link and the class details popup.
// It relies on the shared helpers in school.js (getData, saveData,
// showNotification, deleteRowFromBackend, updateDashboardStats, ...).
// ============================================================

// ---------- 1. Class teacher lookup ----------

// Looks up a teacher's current name from their id — the single place any
// part of the app should go to display "who teaches this class", so a
// teacher's name only ever needs to be correct in one record.
function getTeacherNameById(teacherId) {
    if (!teacherId) return '';
    const teacher = (getData('teachers') || []).find(t => t.id === teacherId);
    return teacher ? teacher.name : '';
}

// Resolves the display name for a class's teacher: prefers the real
// teacherId link, falls back to the legacy plain-text name for classes
// created before this system existed, and finally "—" if neither exists.
function resolveClassTeacherName(cls) {
    if (!cls) return '—';
    return getTeacherNameById(cls.teacherId) || cls.teacher || '—';
}

// ---------- 2. Loading and listing ----------

function loadClassesFromStorage() {
    console.log('Loading classes...');
    const classes = getData('classes') || [];
    window._classes = Array.isArray(classes) ? classes : [];
    renderClasses();
    populateClassFilter();
}

function renderClasses() {
    const container = document.getElementById('classesContainer');
    if (!container) return;
    container.innerHTML = '';
    renderClassOverview();

    const classes = window._classes || [];
    const filterValue = document.getElementById('formLevelFilter')?.value || '';
    const quickFilter = window._classQuickFilter || '';

    let displayClasses = classes;
    if (filterValue) {
        displayClasses = classes.filter(cls => cls.formLevel === filterValue);
    }

    if (quickFilter) {
        const studentList = getData('students') || [];
        displayClasses = displayClasses.filter(cls => quickFilter === 'noTeacher'
            ? resolveClassTeacherName(cls) === '—'
            : !studentList.some(s => s.class === cls.name));
        container.insertAdjacentHTML('beforeend',
            `<div class="cm-chip">Showing: ${quickFilter === 'noTeacher' ? 'Classes without a teacher' : 'Empty classes'}
                <button type="button" onclick="setClassQuickFilter('')">Clear</button></div>`);
    }

    if (displayClasses.length === 0) {
        container.insertAdjacentHTML('beforeend', quickFilter
            ? '<p>No classes match this filter.</p>'
            : '<p>No classes yet. Click "Add New Class" to create one.</p>');
        return;
    }

    const viewMode = document.getElementById('classViewModeSelect')?.value || 'cards';
    if (viewMode === 'dropdown') {
        const wrapper = document.createElement('div');
        wrapper.className = 'class-dropdown-wrapper';

        const sel = document.createElement('select');
        sel.id = 'classesDropdownSelect';
        sel.className = 'filter-select';
        const defaultOpt = document.createElement('option');
        defaultOpt.value = '';
        defaultOpt.textContent = 'Select Class';
        sel.appendChild(defaultOpt);

        displayClasses.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.id;
            opt.textContent = c.name;
            sel.appendChild(opt);
        });

        const detailBox = document.createElement('div');
        detailBox.id = 'classDropdownDetail';
        detailBox.style.marginTop = '1rem';

        const renderSelected = (classId) => {
            const cls = displayClasses.find(d => d.id === classId);
            if (!cls) {
                detailBox.innerHTML = '<p style="color:#999">Select a class to view details</p>';
                return;
            }
            const allStudents = getData('students') || [];
            const count = allStudents.filter(s => s.class === cls.name).length;
            detailBox.innerHTML = `
                <div class="class-card">
                    <div class="class-header">
                        <h2>${cls.name}</h2>
                        <span class="class-badge">${count} Students</span>
                    </div>
                    <div class="class-details">
                        <p><strong>Class Teacher:</strong> ${resolveClassTeacherName(cls)}</p>
                        <p><strong>Room:</strong> ${cls.room || '-'}</p>
                    </div>
                    <div class="class-actions">
                        <button class="btn-small btn-info" onclick="showViewClassDetails('${cls.id}')">View Details</button>
                        <button class="btn-small btn-warning" onclick="showEditClassForm('${cls.id}')">Edit</button>
                        <button class="btn-small btn-danger" onclick="deleteClassRecord(this, '${cls.id}')">Delete</button>
                    </div>
                </div>
            `;
        };

        sel.addEventListener('change', function() { renderSelected(this.value); });

        wrapper.appendChild(sel);
        wrapper.appendChild(detailBox);
        container.appendChild(wrapper);

        if (displayClasses.length > 0) {
            sel.value = displayClasses[0].id;
            renderSelected(displayClasses[0].id);
        }

        return;
    }

    const groupedByForm = {};
    displayClasses.forEach(cls => {
        const formLevel = cls.formLevel || 'Unassigned';
        if (!groupedByForm[formLevel]) {
            groupedByForm[formLevel] = [];
        }
        groupedByForm[formLevel].push(cls);
    });

    const sortedForms = Object.keys(groupedByForm).sort((a, b) => {
        if (a === 'Unassigned') return 1;
        if (b === 'Unassigned') return -1;
        return parseInt(a) - parseInt(b);
    });

    sortedForms.forEach(formLevel => {
        const classesForForm = groupedByForm[formLevel] || [];
        const details = document.createElement('details');
        details.className = 'form-group';

        const summary = document.createElement('summary');
        summary.className = 'form-group-summary';
        summary.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; width:100%; gap:1rem;">
                <div style="display:flex; gap:0.75rem; align-items:center;">
                    <h3 style="margin:0; color: #EA580C; font-size:1.05rem;">Form ${formLevel}</h3>
                    <span style="color:#666; font-size:0.95rem;">(${classesForForm.length} classes)</span>
                </div>
                <div style="color:#999; font-size:0.95rem;">Click to expand</div>
            </div>
        `;

        details.appendChild(summary);

        const grid = document.createElement('div');
        grid.className = 'classes-grid form-group-grid';

        classesForForm.forEach(cls => {
            const card = document.createElement('div');
            card.className = 'class-card';
            const allStudents = getData('students') || [];
            const count = allStudents.filter(s => s.class === cls.name).length;
            card.innerHTML = `
                <div class="class-header">
                    <h2>${cls.name}</h2>
                    <span class="class-badge">${count} Students</span>
                </div>
                <div class="class-details">
                    <p><strong>Class Teacher:</strong> ${resolveClassTeacherName(cls)}</p>
                    <p><strong>Room:</strong> ${cls.room || '-'}</p>
                </div>
                <div class="class-actions">
                    <button class="btn-small btn-info" onclick="showViewClassDetails('${cls.id}')">View Details</button>
                    <button class="btn-small btn-warning" onclick="showEditClassForm('${cls.id}')">Edit</button>
                    <button class="btn-small btn-danger" onclick="deleteClassRecord(this, '${cls.id}')">Delete</button>
                </div>
            `;
            grid.appendChild(card);
        });

        details.appendChild(grid);
        container.appendChild(details);
    });
}

function filterClassesByFormLevel(formLevel) {
    renderClasses();
}

// ---------- 3. Create / edit class form ----------

function openClassModal(editId = null) {
    const modal = document.getElementById('classModal');
    if (!modal) return;
    modal.setAttribute('aria-hidden', 'false');
    document.getElementById('classForm').reset && document.getElementById('classForm').reset();
    document.getElementById('modalTitle').textContent = editId ? 'Edit Class' : 'Create Class';
    modal.dataset.editId = editId || '';

    if (editId) {
        const classes = window._classes || getData('classes') || [];
        const cls = classes.find(c => c.id === editId);
        if (cls) {
            document.getElementById('classFormLevelInput').value = cls.formLevel || '';
            const classLetter = cls.name.split('-').pop() || '';
            document.getElementById('classNameInput').value = classLetter;
            document.getElementById('classRoomInput').value = cls.room || '';
            // cls.teacherId is the real link; cls.teacher is only kept as a
            // fallback for classes created before this existed, so an old
            // class can still show/select the right teacher by name once.
            populateClassTeacherSelect(cls.teacherId, cls.teacher);
            return;
        }
    }
    populateClassTeacherSelect('');
}

// Fills the "Class Teacher" dropdown inside the class form from the real,
// current list of teachers — a class can only ever point at an existing,
// fully-detailed teacher record, never a loose typed string.
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
        // One-time bridge for classes created before this system existed:
        // if the class only has a plain teacher name on file, try to match
        // it to a real teacher record so it displays correctly. Saving the
        // class again will store the proper teacherId going forward.
        const match = teachers.find(t => t.name === legacyTeacherName);
        if (match) toSelect = match.id;
    }
    select.value = toSelect;
}

// Lets someone add a brand-new teacher without leaving the "Create Class"
// flow. The class form's current values are held onto, the class modal
// steps aside for the teacher form, and once the teacher is saved the
// class modal reopens with that teacher already selected.
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

document.addEventListener('submit', function (e) {
    if (e.target && e.target.id === 'classForm') {
        e.preventDefault();
        const editId = document.getElementById('classModal').dataset.editId || null;
        const formLevel = document.getElementById('classFormLevelInput').value.trim();
        const name = document.getElementById('classNameInput').value.trim();
        if (!formLevel) return showNotification('Form level is required', 'warning');
        if (!name) return showNotification('Class name is required', 'warning');
        const room = document.getElementById('classRoomInput').value.trim();

        // The class stores a real reference to a teacher record (teacherId),
        // not a typed name — teacherName is kept alongside only so older
        // parts of the UI that read cls.teacher as plain text still work.
        const teacherId = document.getElementById('classTeacherSelect')?.value || '';
        const teachers = getData('teachers') || [];
        const teacherObj = teachers.find(t => t.id === teacherId);
        const teacherName = teacherObj ? teacherObj.name : '';

        const fullClassName = `Form ${formLevel}-${name}`;

        const clsObj = { name: fullClassName, formLevel, teacherId, teacher: teacherName, room };

        if (editId) {
            let classes = getData('classes') || [];
            const idx = classes.findIndex(c => c.id === editId);
            if (idx === -1) return showNotification('Class not found', 'error');
            classes[idx] = { ...classes[idx], ...clsObj };
            if (saveData('classes', classes)) {
                window._classes = classes;
                renderClasses();
                populateTimetableClassSelect();
                populateClassFilter();
                closeClassModal();
                showNotification('Class updated', 'success');
            } else showNotification('Error updating class', 'error');
        } else {
            addClassToStorage(clsObj);
            closeClassModal();
        }
    }
});

document.addEventListener('click', function (e) {
    const modal = document.getElementById('classModal');
    if (!modal) return;
    if (modal.getAttribute('aria-hidden') === 'false' && e.target === modal) closeClassModal();
});

// ---------- 4. Save / edit / delete ----------

// Next free class ID (C001, C002, ...). Uses the highest number in use rather
// than "how many classes exist + 1", so deleting a class can never cause the
// next one to reuse an existing ID and overwrite another class in Supabase.
function generateClassId(classes) {
    let max = 0;
    classes.forEach(c => {
        const m = /^C(\d+)$/.exec(String(c.id || ''));
        if (m) max = Math.max(max, Number(m[1]));
    });
    return 'C' + String(max + 1).padStart(3, '0');
}

function addClassToStorage(cls) {
    let classes = getData('classes') || [];
    if (!Array.isArray(classes)) classes = [];
    const nextId = generateClassId(classes);
    const newClass = { id: nextId, ...cls };
    classes.push(newClass);
    if (saveData('classes', classes)) {
        window._classes = classes;
        renderClasses();
        populateTimetableClassSelect();
        populateClassFilter();
        populateStudentClassSelect();
        showNotification('Class added successfully!', 'success');
        updateDashboardStats();
    } else {
        showNotification('Error saving class!', 'error');
    }
}

function showEditClassForm(id) {
    const classes = window._classes || getData('classes') || [];
    const idx = classes.findIndex(c => c.id === id);
    if (idx === -1) return showNotification('Class not found', 'error');
    openClassModal(id);
}

function deleteClassRecord(button, classId) {
    if (!confirm('Are you sure you want to delete this class?')) return;
    let classes = getData('classes') || [];
    classes = classes.filter(c => c.id !== classId);
    if (saveData('classes', classes)) {
        deleteRowFromBackend('classes', classId);
        window._classes = classes;
        if (button) button.closest('.class-card')?.remove();
        populateTimetableClassSelect();
        populateClassFilter();
        populateStudentClassSelect();
        showNotification('Class deleted', 'success');
        updateDashboardStats();
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
    title.textContent = `Class: ${cls.name} — Students (${rows.length})`;
    tbody.innerHTML = '';

    if (rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5">No students in this class.</td></tr>';
    } else {
        rows.forEach(r => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${r.student.name}</td>
                <td>${r.feeStatus}</td>
                <td>${r.midDisplay}</td>
                <td>${r.finDisplay}</td>
                <td>
                    <button class="btn-small btn-secondary" onclick="promptAddGrade('${r.student.id}')">Add/Edit Grade</button>
                    <button class="btn-small btn-info" onclick="viewStudentDetail('${r.student.id}')">View</button>
                </td>
            `;
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
// Four statistic cards on top (read-only) with clickable mini cards below them
// for managing classes and the academic year. Built once, refreshed whenever
// the class list is drawn.

function getClassOverviewStats() {
    const classes = Array.isArray(window._classes) ? window._classes : [];
    const rawStudents = getData('students');
    const students = Array.isArray(rawStudents) ? rawStudents : [];
    const classNames = new Set(classes.map(c => c.name));
    const inClasses = students.filter(s => classNames.has(s.class));
    const activeInClasses = inClasses.filter(s => (s.status || 'Active') === 'Active').length;

    const activeYear = parseInt(localStorage.getItem('lastProcessedAcademicYear'), 10) || new Date().getFullYear();
    const startYears = students
        .map(s => (s.dateAdded ? new Date(s.dateAdded).getFullYear() : NaN))
        .filter(y => !isNaN(y) && y <= activeYear);
    const firstYear = startYears.length ? Math.min(...startYears) : activeYear;

    return {
        totalClasses: classes.length,
        studentsInClasses: inClasses.length,
        activeInClasses,
        activeYear,
        firstYear,
        yearsOnRecord: activeYear - firstYear + 1,
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
        .cm-stat-sub { font-size: 0.78rem; color: var(--muted-text, #64748b); margin-top: 0.1rem; }
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
    const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 'es'}`;

    const stat = (icon, tone, label, value, sub) => `
        <div class="cm-stat">
            <div class="cm-stat-icon ${tone}"><span data-lucide="${icon}"></span></div>
            <div><div class="cm-stat-label">${label}</div><div class="cm-stat-value">${value}</div>
                ${sub ? `<div class="cm-stat-sub">${sub}</div>` : ''}</div>
        </div>`;
    const mini = (icon, title, sub, action, active) => `
        <button type="button" class="cm-mini${active ? ' active' : ''}" onclick="${action}">
            <span class="cm-mini-icon"><span data-lucide="${icon}"></span></span>
            <span class="cm-mini-text"><span class="cm-mini-title">${title}</span><span class="cm-mini-sub">${sub}</span></span>
            <span class="cm-mini-go"><span data-lucide="chevron-right"></span></span>
        </button>`;

    overview.innerHTML = `
        <div class="cm-stats">
            ${stat('layout-grid', 'orange', 'Total Classes', s.totalClasses.toLocaleString(), '')}
            ${stat('users', 'green', 'Students in Classes', s.studentsInClasses.toLocaleString(), `${s.activeInClasses.toLocaleString()} active`)}
            ${stat('calendar-range', 'slate', 'Academic Years', s.yearsOnRecord.toLocaleString(), `Since ${s.firstYear}`)}
            ${stat('calendar-check', 'amber', 'Active Year', s.activeYear, 'Current academic year')}
        </div>
        <div class="cm-minis">
            ${mini('plus', 'Add Class', 'Create a new class', 'openClassModal()', false)}
            ${mini('user-x', 'No Class Teacher', s.noTeacher ? plural(s.noTeacher, 'class') : 'All classes have a teacher', "setClassQuickFilter('noTeacher')", quick === 'noTeacher')}
            ${mini('inbox', 'Empty Classes', s.empty ? plural(s.empty, 'class') : 'No empty classes', "setClassQuickFilter('empty')", quick === 'empty')}
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
