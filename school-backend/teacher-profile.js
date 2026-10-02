 // ============================================================
// teacher-profile.js — Teacher Personal + Login + Attendance profile
// Load AFTER school.js:  <script src="teacher-profile.js"></script>
// It extends school.js without editing it.
// ============================================================

// ---------- 1. Supabase mapping (new columns) ----------
// Run once in Supabase SQL editor:
//   alter table teachers
//     add column if not exists gender text default '',
//     add column if not exists address text default '',
//     add column if not exists registration_date text default '',
//     add column if not exists emergency_contact_name text default '',
//     add column if not exists emergency_contact_phone text default '',
//     add column if not exists employee_number text default '';
(function () {
    const origFor = window.mapRowForSupabase;
    const origFrom = window.mapRowFromSupabase;
    window.mapRowForSupabase = function (table, item) {
        const row = origFor(table, item);
        if (table === 'teachers') {
            row.gender = item.gender || '';
            row.address = item.address || '';
            row.registration_date = item.registrationDate || '';
            row.emergency_contact_name = item.emergencyName || '';
            row.emergency_contact_phone = item.emergencyPhone || '';
            row.employee_number = item.employeeNumber || '';
        }
        return row;
    };
    window.mapRowFromSupabase = function (table, row) {
        const obj = origFrom(table, row);
        if (table === 'teachers') {
            obj.gender = row.gender || '';
            obj.address = row.address || '';
            obj.registrationDate = row.registration_date || '';
            obj.emergencyName = row.emergency_contact_name || '';
            obj.emergencyPhone = row.emergency_contact_phone || '';
            obj.employeeNumber = row.employee_number || '';
        }
        return obj;
    };
})();

// ---------- 2. Inject extra form fields + profile modal ----------
(function () {
    const form = document.getElementById('teacherForm');
    if (form && !document.getElementById('teacherGenderSelect')) {
        const actions = form.querySelector('.form-actions');
        actions.insertAdjacentHTML('beforebegin', `
            <div class="form-row"><label>Gender</label>
                <select id="teacherGenderSelect"><option value="">Select gender</option>
                <option value="Female">Female</option><option value="Male">Male</option></select></div>
            <div class="form-row"><label>Home Address</label>
                <input type="text" id="teacherAddressInput" placeholder="Home address"></div>
            <div class="form-row"><label>Employment Status</label>
                <select id="teacherStatusSelect"><option value="Active">Active</option>
                <option value="Inactive">Inactive</option></select></div>
            <div class="form-row"><label>Registration Date</label>
                <input type="date" id="teacherRegDateInput"></div>
            <div class="form-row"><label>Emergency Contact Name</label>
                <input type="text" id="teacherEmergencyNameInput" placeholder="e.g. spouse, parent or relative"></div>
            <div class="form-row"><label>Emergency Contact Phone</label>
                <input type="tel" id="teacherEmergencyPhoneInput" placeholder="e.g. 0771234567"></div>
            <div class="form-row"><label>Staff / Employee Number (optional)</label>
                <input type="text" id="teacherEmployeeNumberInput" placeholder="Only if the school issues staff numbers"></div>
        `);
    }

    document.head.insertAdjacentHTML('beforeend', `<style>
        .tp-att-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 1rem; }
        .tp-att-toolbar label { font-size: 0.78rem; color: var(--muted-text); text-transform: uppercase; letter-spacing: 0.04em; margin-right: 0.5rem; }
        .tp-att-toolbar select { padding: 0.45rem 0.7rem; border-radius: 8px; border: 1px solid var(--border-color, #e2e8f0); background: #fff; font: inherit; }
        .tp-att-cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.85rem; margin-bottom: 1.1rem; }
        .tp-att-card { border: 1px solid var(--border-color, #e2e8f0); border-radius: 12px; padding: 0.9rem 1rem; background: #fff; }
        .tp-att-card .tp-att-label { font-size: 0.74rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted-text); margin-bottom: 0.35rem; }
        .tp-att-card .tp-att-value { font-size: 1.7rem; font-weight: 700; line-height: 1.1; }
        .tp-att-card.present .tp-att-value { color: var(--success-color, #16a34a); }
        .tp-att-card.absent .tp-att-value { color: var(--danger-color, #dc2626); }
        .tp-att-card.late .tp-att-value { color: var(--warning-dark, #b45309); }
        .tp-att-card.rate .tp-att-value { color: var(--primary-color, #ea580c); }
        .tp-att-note { font-size: 0.78rem; color: var(--muted-text); margin: 0 0 1.1rem; }
        .tp-att-log { max-height: 320px; overflow-y: auto; border: 1px solid var(--border-color, #e2e8f0); border-radius: 12px; }
        .tp-att-log table { width: 100%; border-collapse: collapse; }
        .tp-att-log th { position: sticky; top: 0; background: var(--light-bg, #f8fafc); text-align: left; font-size: 0.74rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted-text); padding: 0.6rem 0.9rem; }
        .tp-att-log td { padding: 0.6rem 0.9rem; border-top: 1px solid var(--border-color, #e2e8f0); font-size: 0.9rem; }
        .tp-att-badge { display: inline-block; padding: 0.15rem 0.65rem; border-radius: 999px; font-size: 0.78rem; font-weight: 600; }
        .tp-att-badge.present { background: #dcfce7; color: #15803d; }
        .tp-att-badge.absent { background: #fee2e2; color: #b91c1c; }
        .tp-att-badge.late { background: #fef3c7; color: #b45309; }
        .tp-att-empty { text-align: center; color: var(--muted-text); padding: 2rem 1rem; }
        .tp-contact-actions { display: inline-flex; gap: 0.4rem; margin-left: 0.6rem; vertical-align: middle; }
        .tp-contact-btn { display: inline-block; padding: 0.12rem 0.6rem; border-radius: 999px; font-size: 0.74rem; font-weight: 600; text-decoration: none; background: var(--primary-tint-strong, #ffedd5); color: var(--primary-color, #ea580c); }
        .tp-contact-btn.wa { background: #dcfce7; color: #15803d; }
        .tp-contact-btn:hover { filter: brightness(0.95); }
        .tp-nci-btn { display: inline-flex; align-items: center; gap: 0.55rem; padding: 0.8rem 1.1rem; background: #fff; border: 1px solid var(--border-color, #e2e8f0); border-radius: 12px; font: inherit; font-weight: 600; white-space: nowrap; cursor: pointer; color: inherit; }
        .tp-nci-btn:hover { border-color: var(--primary-color, #ea580c); }
        .tp-nci-btn.ok { color: var(--success-color, #16a34a); }
        .tp-nci-count { background: #fee2e2; color: #b91c1c; font-size: 0.78rem; font-weight: 700; padding: 0.1rem 0.6rem; border-radius: 999px; }
        .tp-nci-list { max-height: 360px; overflow-y: auto; }
        .tp-nci-row { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; padding: 0.7rem 0; border-top: 1px solid var(--border-color, #e2e8f0); }
        .tp-nci-name { background: none; border: none; padding: 0; font: inherit; font-weight: 600; cursor: pointer; color: inherit; text-align: left; }
        .tp-nci-name:hover { color: var(--primary-color, #ea580c); }
        .tp-nci-dept { color: var(--muted-text); font-size: 0.82rem; margin-left: 0.5rem; }
        .tp-nci-ok { color: var(--success-color, #16a34a); font-weight: 600; padding: 0.5rem 0; }
        @media (max-width: 640px) { .tp-att-cards { grid-template-columns: repeat(2, 1fr); } }
    </style>`);

    document.body.insertAdjacentHTML('beforeend', `
        <div id="teacherProfileModal" class="modal" aria-hidden="true">
            <div class="modal-content profile-modal-content">
                <div class="modal-header">
                    <h3 id="teacherProfileTitle">Teacher Profile</h3>
                    <button class="modal-close" onclick="closeTeacherProfile()">✕</button>
                </div>
                <div class="profile-tabs" style="margin-bottom:0.75rem;">
                    <button id="tpTab-personal" class="profile-tab active" onclick="showTeacherProfileTab('personal')">Personal</button>
                    <button id="tpTab-login" class="profile-tab" onclick="showTeacherProfileTab('login')">Login</button>
                    <button id="tpTab-attendance" class="profile-tab" onclick="showTeacherProfileTab('attendance')">Attendance</button>
                </div>
                <div class="profile-panel" id="tpPanel-personal"></div>
                <div class="profile-panel" id="tpPanel-login" style="display:none;"></div>
                <div class="profile-panel" id="tpPanel-attendance" style="display:none;"></div>
            </div>
        </div>`);
})();

// ---------- 3. Helpers ----------
// Returns a short reason if the password is weak, or '' if fine.
// This only WARNS — the person may still keep their chosen password.
function passwordWeakness(pw) {
    if (!pw) return 'no password entered';
    const common = ['password', '12345678', '123456789', 'qwerty', 'abc12345', 'teacher', 'school123', '11111111'];
    if (pw.length < 6) return 'shorter than 6 characters';
    if (common.includes(pw.toLowerCase())) return 'this is a very common password';
    if (/^(.)\1+$/.test(pw)) return 'the same character repeated';
    if (pw.length < 8) return 'try 8 or more characters';
    if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return 'mix letters and numbers to make it stronger';
    return '';
}

// Asks the admin for a password, warns if weak, lets them keep it anyway.
function askForPassword(message) {
    const input = prompt(message);
    if (input === null) return null;
    if (!input.trim()) { showNotification('Password cannot be empty', 'warning'); return null; }
    const weak = passwordWeakness(input);
    if (weak && !confirm(`⚠ This password is weak (${weak}).\n\nPress OK to use it anyway, or Cancel to choose a different one.`)) return null;
    return input;
}
function tpEsc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Turns a local Zimbabwe number (0781968103) into international digits (263781968103)
function tpIntlPhone(raw) {
    let d = String(raw || '').replace(/\D/g, '');
    if (d.startsWith('00')) d = d.slice(2);
    else if (d.startsWith('0')) d = '263' + d.slice(1);
    return d.length >= 9 ? d : '';
}

// Small Call / WhatsApp buttons for a phone number ('' if the number is unusable)
function tpPhoneActions(raw) {
    const n = tpIntlPhone(raw);
    if (!n) return '';
    return `<span class="tp-contact-actions">
        <a class="tp-contact-btn" href="tel:+${n}" title="Call">Call</a>
        <a class="tp-contact-btn wa" href="https://wa.me/${n}" target="_blank" rel="noopener" title="Chat on WhatsApp">WhatsApp</a>
    </span>`;
}

// Next free system ID (T001, T002, ...). Uses the highest number ever seen, including
// IDs that only remain in attendance records, so a deleted teacher's ID is never reused.
function generateTeacherId() {
    const teachers = getData('teachers');
    const attendance = getData(TEACHER_ATTENDANCE_KEY);
    const used = [
        ...(Array.isArray(teachers) ? teachers.map(t => t.id) : []),
        ...(Array.isArray(attendance) ? attendance.map(r => r.teacherId || r.teacher_id) : [])
    ];
    let max = 0;
    used.forEach(id => {
        const m = /^T(\d+)$/.exec(String(id || ''));
        if (m) max = Math.max(max, Number(m[1]));
    });
    return 'T' + String(max + 1).padStart(3, '0');
}

// Returns an error message if another teacher already uses this email, phone or staff number, else ''

function findDuplicateTeacher(fields, excludeId) {
    const all = getData('teachers');
    const others = (Array.isArray(all) ? all : []).filter(t => t.id !== excludeId);
    const email = (fields.email || '').trim().toLowerCase();
    const phone = tpIntlPhone(fields.phone); // 0781968103 and +263781968103 count as the same number
    const staffNo = (fields.employeeNumber || '').trim().toLowerCase();
    for (const t of others) {
        if (email && (t.email || '').trim().toLowerCase() === email) return `That email is already used by ${t.name} (${t.id}).`;
        if (phone && tpIntlPhone(t.phone) === phone) return `That phone number is already used by ${t.name} (${t.id}).`;
        if (staffNo && (t.employeeNumber || '').trim().toLowerCase() === staffNo) return `That staff number is already used by ${t.name} (${t.id}).`;
    }
    return '';
}

// No 0/O or 1/l/I so a password read aloud isn't misread
function generateTempPassword(length = 8) {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    const arr = new Uint32Array(length);
    crypto.getRandomValues(arr);
    return Array.from(arr, n => chars[n % chars.length]).join('');
}

function generateTeacherUsername(name) {
    const parts = String(name || '').toLowerCase().replace(/[^a-z\s]/g, '').trim().split(/\s+/).filter(Boolean);
    const base = parts.length > 1 ? parts[0][0] + parts[parts.length - 1] : (parts[0] || 'teacher');
    const users = getData('users') || [];
    let candidate = base, n = 2;
    while (users.some(u => u.username === candidate)) candidate = base + n++;
    return candidate;
}

function findTeacherUser(teacher, users) {
    return users.find(u => u.teacherId === teacher.id) ||
        (teacher.username ? users.find(u => u.username === teacher.username) : null);
}

// Creates the login in the same `users` list the app already uses
function createTeacherLogin(teacherId, chosenUsername, chosenPassword) {
    const teachers = getData('teachers') || [];
    const idx = teachers.findIndex(t => t.id === teacherId);
    if (idx === -1) return null;
    let users = getData('users') || [];
    if (!Array.isArray(users)) users = [];
    if (findTeacherUser(teachers[idx], users)) return null;

    const username = (chosenUsername || '').trim() || generateTeacherUsername(teachers[idx].name);
    const password = chosenPassword || generateTempPassword();
    users.push({ id: 'U' + Date.now(), username, password, role: 'teacher', name: teachers[idx].name, teacherId });
    saveData('users', users);
    teachers[idx].username = username;
    saveData('teachers', teachers);
    return { username, password };
}

// ---------- 4. Teacher form (replaces school.js versions) ----------
window.openTeacherModal = function (editId = null, returnToClassModal = false) {
    const modal = document.getElementById('teacherModal');
    if (!modal) return;
    modal.setAttribute('aria-hidden', 'false');
    const form = document.getElementById('teacherForm');
    if (form) form.reset();

    modal.dataset.editId = editId || '';
    modal.dataset.returnToClassModal = returnToClassModal ? '1' : '';
    document.getElementById('teacherModalTitle').textContent = editId ? 'Edit Teacher' : 'Add Teacher';
    document.getElementById('teacherStatusSelect').value = 'Active';
    document.getElementById('teacherRegDateInput').value = new Date().toISOString().split('T')[0];

    if (editId) {
        const t = (getData('teachers') || []).find(x => x.id === editId);
        if (t) {
            document.getElementById('teacherNameInput').value = t.name || '';
            document.getElementById('teacherGenderSelect').value = t.gender || '';
            document.getElementById('teacherPhoneInput').value = t.phone || '';
            document.getElementById('teacherEmailInput').value = t.email || '';
            document.getElementById('teacherAddressInput').value = t.address || '';
            document.getElementById('teacherDepartmentInput').value = t.department || '';
            document.getElementById('teacherStatusSelect').value = t.status || 'Active';
            document.getElementById('teacherRegDateInput').value = t.registrationDate || '';
            document.getElementById('teacherEmergencyNameInput').value = t.emergencyName || '';
            document.getElementById('teacherEmergencyPhoneInput').value = t.emergencyPhone || '';
            document.getElementById('teacherEmployeeNumberInput').value = t.employeeNumber || '';
        }
    }
};

// Capture-phase handler runs before school.js's own teacherForm handler
// and stops it, so the teacher is only saved once, by this version.
document.addEventListener('submit', function (e) {
    if (!e.target || e.target.id !== 'teacherForm') return;
    e.preventDefault();
    e.stopPropagation();

    const modal = document.getElementById('teacherModal');
    const editId = modal?.dataset.editId || '';
    const returnToClassModal = modal?.dataset.returnToClassModal === '1';
    const name = document.getElementById('teacherNameInput').value.trim();
    const fields = {
        name,
        gender: document.getElementById('teacherGenderSelect').value,
        phone: document.getElementById('teacherPhoneInput').value.trim(),
        email: document.getElementById('teacherEmailInput').value.trim(),
        address: document.getElementById('teacherAddressInput').value.trim(),
        department: document.getElementById('teacherDepartmentInput').value.trim(),
        status: document.getElementById('teacherStatusSelect').value || 'Active',
        registrationDate: document.getElementById('teacherRegDateInput').value,
        emergencyName: document.getElementById('teacherEmergencyNameInput').value.trim(),
        emergencyPhone: document.getElementById('teacherEmergencyPhoneInput').value.trim(),
        employeeNumber: document.getElementById('teacherEmployeeNumberInput').value.trim()
    };
    if (!name) return showNotification('Teacher name is required', 'warning');
    const duplicate = findDuplicateTeacher(fields, editId);
    if (duplicate) return showNotification(duplicate, 'error');

    let teachers = getData('teachers') || [];
    if (!Array.isArray(teachers)) teachers = [];
    let savedTeacher;

    if (editId) {
        const idx = teachers.findIndex(t => t.id === editId);
        if (idx === -1) return showNotification('Teacher not found', 'error');
        teachers[idx] = { ...teachers[idx], ...fields };
        if (!saveData('teachers', teachers)) return showNotification('Error updating teacher', 'error');
        savedTeacher = teachers[idx];
        loadTeachersFromStorage();
        showNotification('Teacher updated successfully!', 'success');
        addActivity('✏️', `Teacher updated: ${name}`);
    } else {
        const nextId = generateTeacherId();
        savedTeacher = { id: nextId, ...fields };
        teachers.push(savedTeacher);
        if (!saveData('teachers', teachers)) return showNotification('Error saving teacher', 'error');
        loadTeachersFromStorage();
        showNotification('Teacher added successfully!', 'success');
        addActivity('👩‍🏫', `New teacher added: ${name}`);
    }

    updateDashboardStats();
    closeTeacherModal();

    if (returnToClassModal && savedTeacher) {
        const state = window._pendingClassFormState;
        openClassModal(state?.editId || null);
        if (state && !state.editId) {
            document.getElementById('classFormLevelInput').value = state.formLevel || '';
            document.getElementById('classNameInput').value = state.name || '';
            document.getElementById('classRoomInput').value = state.room || '';
        }
        populateClassTeacherSelect(savedTeacher.id);
        window._pendingClassFormState = null;
    }
}, true);

// ---------- 5. Table row: eye opens profile, calendar keeps schedule ----------
window.addTeacherRowToTable = function (teacher, tableBody) {
    const status = teacher.status || 'Active';
    const statusClass = status === 'Active' ? 'status-active' : 'status-inactive';
    const toggleIcon = status === 'Active' ? 'user-x' : 'user-check';
    const toggleTitle = status === 'Active' ? 'Deactivate' : 'Activate';
    const row = document.createElement('tr');
    row.innerHTML = `
        <td>${teacher.id}</td>
        <td>${tpEsc(teacher.name)}</td>
        <td>${tpEsc(teacher.department || '—')}</td>
        <td>${tpEsc(teacher.email || '—')}</td>
        <td>${tpEsc(teacher.phone || '—')}</td>
        <td><span class="status-badge ${statusClass}">${status}</span></td>
        <td><div class="table-actions">
            <button class="icon-action-btn action-view" title="View profile" onclick="openTeacherProfile('${teacher.id}')"><span data-lucide="eye"></span></button>
            <button class="icon-action-btn action-view" title="View schedule" onclick="viewTeacherDetail('${teacher.id}')"><span data-lucide="calendar-days"></span></button>
            <button class="icon-action-btn action-edit" title="Edit" onclick="editTeacherRecord('${teacher.id}')"><span data-lucide="pencil"></span></button>
            <button class="icon-action-btn action-toggle" title="${toggleTitle}" onclick="toggleTeacherStatus('${teacher.id}')"><span data-lucide="${toggleIcon}"></span></button>
            <button class="icon-action-btn action-delete" title="Delete" onclick="deleteTeacherRecord(this, '${teacher.id}')"><span data-lucide="trash-2"></span></button>
        </div></td>`;
    tableBody.appendChild(row);
    if (window.lucide) lucide.createIcons();
};

// ---------- 6. Delete teacher also removes their login ----------
window.deleteTeacherRecord = function (button, teacherId) {
    if (!confirm('Are you sure you want to delete this teacher? Their login will be removed too.')) return;
    const all = getData('teachers') || [];
    const removed = all.find(t => t.id === teacherId);
    const teachers = all.filter(t => t.id !== teacherId);
    if (!saveData('teachers', teachers)) return showNotification('Error deleting teacher!', 'error');

    deleteRowFromBackend('teachers', teacherId);
    const users = (getData('users') || []).filter(u =>
        u.teacherId !== teacherId && !(removed && removed.username && u.username === removed.username));
    saveData('users', users);

    button.closest('tr').remove();
    const tbody = document.getElementById('teachersTableBody');
    if (tbody && tbody.children.length === 0) {
        tbody.innerHTML = '<tr class="table-empty-row"><td colspan="7">No teachers added yet.</td></tr>';
    }
    showNotification('Teacher deleted successfully!', 'success');
    updateDashboardStats();
};

// ---------- 7. Profile modal: Personal + Login + Attendance ----------
const TEACHER_PROFILE_TABS = ['personal', 'login', 'attendance'];

function openTeacherProfile(teacherId, tab = 'personal') {
    const t = (getData('teachers') || []).find(x => x.id === teacherId);
    if (!t) return showNotification('Teacher not found', 'error');
    document.getElementById('teacherProfileTitle').textContent = `${t.name} — ${t.id}`;
    renderTeacherPersonalPanel(t);
    renderTeacherLoginPanel(t);
    renderTeacherAttendancePanel(t);
    showTeacherProfileTab(tab);
    document.getElementById('teacherProfileModal').setAttribute('aria-hidden', 'false');
}

function closeTeacherProfile() {
    document.getElementById('teacherProfileModal')?.setAttribute('aria-hidden', 'true');
}

function showTeacherProfileTab(tab) {
    TEACHER_PROFILE_TABS.forEach(k => {
        document.getElementById('tpTab-' + k)?.classList.toggle('active', k === tab);
        const p = document.getElementById('tpPanel-' + k);
        if (p) p.style.display = k === tab ? 'block' : 'none';
    });
}

function renderTeacherPersonalPanel(t) {
    const status = t.status || 'Active';
    const statusClass = status === 'Active' ? 'status-active' : 'status-inactive';
    const reg = t.registrationDate
        ? new Date(t.registrationDate).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
    const item = (l, v) => `<div class="profile-detail-item"><div class="pd-label">${l}</div><div class="pd-value">${tpEsc(v || '—')}</div></div>`;
    const phoneItem = (l, v) => `<div class="profile-detail-item"><div class="pd-label">${l}</div><div class="pd-value">${tpEsc(v || '—')}${tpPhoneActions(v)}</div></div>`;
    document.getElementById('tpPanel-personal').innerHTML = `
        <div class="profile-header">
            <div class="profile-avatar">${tpEsc((t.name || '?').trim().charAt(0).toUpperCase())}</div>
            <div class="profile-header-main">
                <h2>${tpEsc(t.name)}</h2>
                <div class="profile-header-meta"><span>${tpEsc(t.id)}</span><span>&middot;</span>
                    <span>${tpEsc(t.department || 'No department')}</span>
                    <span class="status-badge ${statusClass}">${tpEsc(status)}</span></div>
            </div>
            <div class="profile-header-actions">
                <button class="btn btn-small btn-warning" onclick="closeTeacherProfile(); editTeacherRecord('${t.id}');">Edit</button>
            </div>
        </div>
        <div class="profile-detail-grid">
            ${item('Full Name', t.name)}${item('Gender', t.gender)}${phoneItem('Phone Number', t.phone)}
            ${item('Email', t.email)}${item('Home Address', t.address)}${item('Employment Status', status)}
            ${item('Registration Date', reg)}${item('Emergency Contact', t.emergencyName)}${phoneItem('Emergency Phone', t.emergencyPhone)}${t.employeeNumber ? item('Staff Number', t.employeeNumber) : ''}
        </div>`;
}

function renderTeacherLoginPanel(t) {
    const panel = document.getElementById('tpPanel-login');
    const users = getData('users') || [];
    const user = findTeacherUser(t, users);

    if (!user) {
        panel.innerHTML = `<div class="info-box">No login has been created for this teacher yet.</div>`;
        return;
    }
    if (!user.teacherId) { user.teacherId = t.id; saveData('users', users); }

    panel.innerHTML = `
        <div class="profile-detail-grid" style="margin-bottom:1.1rem;">
            <div class="profile-detail-item"><div class="pd-label">Username</div><div class="pd-value">${tpEsc(user.username)}</div></div>
            <div class="profile-detail-item"><div class="pd-label">Password</div>
                <div class="pd-value"><span id="tpPassword" data-pw="${tpEsc(user.password)}" data-shown="0">••••••••</span></div></div>
        </div>
        <div style="display:flex; gap:0.6rem; flex-wrap:wrap;">
            <button class="btn btn-small btn-info" onclick="toggleTeacherPasswordView()">Show / Hide</button>
            <button class="btn btn-small btn-info" onclick="copyTeacherLogin('${t.id}')">Copy login</button>
            <button class="btn btn-small btn-warning" onclick="resetTeacherPassword('${t.id}')">Reset password</button>
            <button class="btn btn-small btn-warning" onclick="changeTeacherUsername('${t.id}')">Change username</button>
        </div>
`;
}

function toggleTeacherPasswordView() {
    const el = document.getElementById('tpPassword');
    if (!el) return;
    const shown = el.dataset.shown === '1';
    el.textContent = shown ? '••••••••' : el.dataset.pw;
    el.dataset.shown = shown ? '0' : '1';
}

function copyTeacherLogin(teacherId) {
    const t = (getData('teachers') || []).find(x => x.id === teacherId);
    const user = t && findTeacherUser(t, getData('users') || []);
    if (!user) return;
    const text = `Username: ${user.username}\nPassword: ${user.password}`;
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => showNotification('Login copied', 'success'));
    else prompt('Copy this login:', text);
}

// ---------- 8. Attendance tab ----------
// Teachers check themselves in from their own dashboard. Each check-in is saved as
//   { id, teacherId, date: 'YYYY-MM-DD', timeIn: 'HH:MM' }   under getData('teacherAttendance').
// The status is worked out here from the time:
//   checked in at or before TEACHER_CUTOFF -> Present
//   checked in after TEACHER_CUTOFF        -> Late (still counted as attended)
//   weekday with no check-in               -> Absent (derived, never stored)
const TEACHER_ATTENDANCE_KEY = 'teacherAttendance';
const TEACHER_CUTOFF = '08:00';
const TEACHER_HOLIDAYS = []; // school-closed weekdays to skip, e.g. ['2026-12-25']

function tpParseDate(value) {
    if (!value) return null;
    const s = String(value);
    const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s + 'T00:00:00') : new Date(s);
    return isNaN(d) ? null : d;
}

function tpDateKey(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function tpClassifyCheckIn(timeIn) {
    const t = String(timeIn || '').slice(0, 5);
    if (!/^\d{2}:\d{2}$/.test(t)) return '';
    return t <= TEACHER_CUTOFF ? 'present' : 'late';
}

// Full day-by-day log for one teacher: real check-ins plus derived absences.
// Returns [{ date: Date, status, timeIn, note }] newest first.
function getTeacherAttendanceLog(teacher) {
    const raw = getData(TEACHER_ATTENDANCE_KEY);
    const all = Array.isArray(raw) ? raw : [];
    const idOf = r => r.teacherId || r.teacher_id;

    const byDay = new Map();
    all.filter(r => idOf(r) === teacher.id).forEach(r => {
        const date = tpParseDate(r.date);
        const status = tpClassifyCheckIn(r.timeIn || r.time_in);
        if (date && status) byDay.set(tpDateKey(date), { date, status, timeIn: String(r.timeIn || r.time_in).slice(0, 5), note: r.note || '' });
    });

    // Absences only count from the day the school started using check-in (or the
    // teacher's registration date, if later) so old days are not wrongly marked absent.
    const allDates = all.map(r => tpParseDate(r.date)).filter(Boolean);
    if (allDates.length) {
        let start = new Date(Math.min(...allDates));
        const reg = tpParseDate(teacher.registrationDate);
        if (reg && reg > start) start = reg;
        const today = new Date(); today.setHours(0, 0, 0, 0); // today stays open until it has ended
        for (let d = new Date(start); d < today; d.setDate(d.getDate() + 1)) {
            const key = tpDateKey(d), dow = d.getDay();
            if (dow === 0 || dow === 6 || TEACHER_HOLIDAYS.includes(key) || byDay.has(key)) continue;
            byDay.set(key, { date: new Date(d), status: 'absent', timeIn: '', note: 'No check-in recorded' });
        }
    }
    return Array.from(byDay.values()).sort((a, b) => b.date - a.date);
}

function renderTeacherAttendancePanel(t, year) {
    const panel = document.getElementById('tpPanel-attendance');
    if (!panel) return;
    const all = getTeacherAttendanceLog(t);
    const currentYear = new Date().getFullYear();
    const years = Array.from(new Set([currentYear, ...all.map(r => r.date.getFullYear())])).sort((a, b) => b - a);
    const selected = year && years.includes(Number(year)) ? Number(year) : currentYear;
    const records = all.filter(r => r.date.getFullYear() === selected);

    const present = records.filter(r => r.status === 'present').length;
    const absent = records.filter(r => r.status === 'absent').length;
    const late = records.filter(r => r.status === 'late').length;
    const total = records.length;
    // A late teacher still came to school, so Late counts toward attendance.
    const rate = total ? Math.round(((present + late) / total) * 100) : 0;

    const card = (cls, label, value, tip) =>
        `<div class="tp-att-card ${cls}" title="${tip}"><div class="tp-att-label">${label}</div><div class="tp-att-value">${value}</div></div>`;
    const label = { present: 'Present', absent: 'Absent', late: 'Late' };

    const rows = records.map(r => `
        <tr>
            <td>${tpEsc(r.date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }))}</td>
            <td><span class="tp-att-badge ${r.status}">${label[r.status]}</span></td>
            <td>${tpEsc(r.timeIn || '—')}</td>
            <td>${tpEsc(r.note || '—')}</td>
        </tr>`).join('');

    panel.innerHTML = `
        <div class="tp-att-toolbar">
            <div><label for="tpAttYear">Academic year</label>
                <select id="tpAttYear" onchange="changeTeacherAttendanceYear('${t.id}', this.value)">
                    ${years.map(y => `<option value="${y}"${y === selected ? ' selected' : ''}>${y}</option>`).join('')}
                </select></div>
        </div>
        <div class="tp-att-cards">
            ${card('present', 'Present', present, 'Checked in by ' + TEACHER_CUTOFF)}
            ${card('absent', 'Absent', absent, 'No check-in on a school day')}
            ${card('late', 'Late', late, 'Checked in after ' + TEACHER_CUTOFF)}
            ${card('rate', 'Attendance rate', rate + '%', 'Present and late days out of all recorded days')}
        </div>
        <div class="tp-att-log">
            ${total ? `<table>
                <thead><tr><th>Date</th><th>Status</th><th>Time in</th><th>Note</th></tr></thead>
                <tbody>${rows}</tbody></table>`
            : `<div class="tp-att-empty">No attendance recorded for ${selected} yet.</div>`}
        </div>`;
}

function changeTeacherAttendanceYear(teacherId, year) {
    const t = (getData('teachers') || []).find(x => x.id === teacherId);
    if (t) renderTeacherAttendancePanel(t, year);
}

// "Not checked in" button next to the department filter. It opens a list of the
// active teachers who have not checked in today (school days only).
function getTeachersNotCheckedIn() {
    const now = new Date(), todayKey = tpDateKey(now), dow = now.getDay();
    const schoolDay = dow >= 1 && dow <= 5 && !TEACHER_HOLIDAYS.includes(todayKey);
    const rawTeachers = getData('teachers');
    const teachers = (Array.isArray(rawTeachers) ? rawTeachers : []).filter(t => (t.status || 'Active') !== 'Inactive');
    if (!schoolDay || !teachers.length) return null;

    const rawAtt = getData(TEACHER_ATTENDANCE_KEY);
    const checkedIn = new Set((Array.isArray(rawAtt) ? rawAtt : [])
        .filter(r => { const d = tpParseDate(r.date); return d && tpDateKey(d) === todayKey; })
        .map(r => r.teacherId || r.teacher_id));
    return teachers.filter(t => !checkedIn.has(t.id));
}

function ensureNotCheckedInUI() {
    let btn = document.getElementById('tpNciBtn');
    if (btn) return btn;
    const tbody = document.getElementById('teachersTableBody');
    if (!tbody) return null;

    btn = document.createElement('button');
    btn.id = 'tpNciBtn';
    btn.type = 'button';
    btn.addEventListener('click', openNotCheckedInList);

    // Sit beside the department filter; fall back to just above the table
    const search = document.querySelector('input[placeholder*="Search teachers"]');
    let row = search;
    while (row && !row.querySelector('select')) row = row.parentElement;
    const select = row && (row.querySelector('select[id*="epartment"]') || row.querySelector('select'));
    if (select) select.insertAdjacentElement('afterend', btn);
    else {
        const anchor = (tbody.closest('table') || tbody).parentElement;
        anchor.parentNode.insertBefore(btn, anchor);
    }

    document.body.insertAdjacentHTML('beforeend', `
        <div id="tpNciModal" class="modal" aria-hidden="true">
            <div class="modal-content" style="max-width:520px;">
                <div class="modal-header">
                    <h3>Not checked in today</h3>
                    <button class="modal-close" onclick="closeNotCheckedInList()">✕</button>
                </div>
                <div id="tpNciBody"></div>
            </div>
        </div>`);
    const modal = document.getElementById('tpNciModal');
    modal.addEventListener('click', e => { if (e.target === modal) closeNotCheckedInList(); });
    return btn;
}

function fillNotCheckedInList(missing) {
    const body = document.getElementById('tpNciBody');
    if (!body) return;
    body.innerHTML = (missing && missing.length)
        ? `<div class="tp-nci-list">${missing.map(t => `
            <div class="tp-nci-row">
                <div><button class="tp-nci-name" onclick="closeNotCheckedInList(); openTeacherProfile('${tpEsc(t.id)}', 'attendance')">${tpEsc(t.name)}</button>
                    <span class="tp-nci-dept">${tpEsc(t.department || '')}</span></div>
                ${tpPhoneActions(t.phone)}
            </div>`).join('')}</div>`
        : `<div class="tp-nci-ok">✓ Everyone has checked in today</div>`;
}

function openNotCheckedInList() {
    fillNotCheckedInList(getTeachersNotCheckedIn());
    document.getElementById('tpNciModal')?.setAttribute('aria-hidden', 'false');
}

function closeNotCheckedInList() {
    document.getElementById('tpNciModal')?.setAttribute('aria-hidden', 'true');
}

function renderNotCheckedIn() {
    const btn = ensureNotCheckedInUI();
    if (!btn) return;
    const missing = getTeachersNotCheckedIn();
    if (missing === null) { btn.style.display = 'none'; closeNotCheckedInList(); return; }
    btn.style.display = '';
    btn.className = 'tp-nci-btn' + (missing.length ? '' : ' ok');
    btn.innerHTML = missing.length
        ? `Not checked in <span class="tp-nci-count">${missing.length}</span>`
        : '✓ All checked in';
    if (document.getElementById('tpNciModal')?.getAttribute('aria-hidden') === 'false') fillNotCheckedInList(missing);
}

// ---------- Credential popup (create password / create login / change username) ----------
(function () {
    document.head.insertAdjacentHTML('beforeend', `<style>
        #credModal .modal-content { max-width: 440px; padding: 1.75rem; }
        .cred-head { text-align: center; margin-bottom: 1.25rem; }
        .cred-icon { width: 52px; height: 52px; border-radius: 14px; margin: 0 auto 0.8rem; display: flex; align-items: center; justify-content: center; background: var(--primary-tint-strong); color: var(--primary-color); }
        .cred-icon svg { width: 24px; height: 24px; stroke-width: 2px; }
        .cred-head h3 { font-size: 1.2rem; margin-bottom: 0.3rem; }
        .cred-head p { color: var(--muted-text); font-size: 0.88rem; margin: 0; }
        .cred-pw { position: relative; }
        .cred-pw input { padding-right: 2.8rem; }
        .cred-eye { position: absolute; right: 0.4rem; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer; color: var(--muted-text); padding: 0.4rem; display: flex; }
        .cred-eye svg { width: 18px; height: 18px; }
        .cred-meter { height: 6px; background: var(--light-bg); border-radius: 6px; margin-top: 0.55rem; overflow: hidden; }
        .cred-meter div { height: 100%; width: 0; border-radius: 6px; transition: width 0.25s ease, background 0.25s ease; }
        .cred-note { font-size: 0.8rem; margin: 0.4rem 0 0; min-height: 1.1rem; }
        .cred-error { color: var(--danger-color); font-size: 0.85rem; text-align: center; margin: 0.5rem 0 0; min-height: 1.1rem; }
    </style>`);
    document.body.insertAdjacentHTML('beforeend', `
    <div id="credModal" class="modal" aria-hidden="true">
        <div class="modal-content">
            <div class="cred-head">
                <div class="cred-icon"><span data-lucide="key-round"></span></div>
                <h3 id="credTitle">Create new password</h3>
                <p id="credSub"></p>
            </div>
            <div class="form-row" id="credUserRow">
                <label id="credUserLabel">Username</label>
                <input type="text" id="credUser" autocomplete="off">
            </div>
            <div id="credPwWrap">
                <div class="form-row">
                    <label>New password</label>
                    <div class="cred-pw">
                        <input type="password" id="credPw" autocomplete="new-password" placeholder="Choose a password you will remember">
                        <button type="button" class="cred-eye" id="credEye" title="Show / hide"><span data-lucide="eye"></span></button>
                    </div>
                    <div class="cred-meter"><div id="credBar"></div></div>
                    <p class="cred-note" id="credHint"></p>
                </div>
                <div class="form-row">
                    <label>Confirm password</label>
                    <input type="password" id="credPw2" autocomplete="new-password" placeholder="Type it again">
                    <p class="cred-note" id="credMatch"></p>
                </div>
            </div>
            <p class="cred-error" id="credError"></p>
            <div class="form-actions">
                <button type="button" class="btn btn-primary" id="credSave">Save</button>
                <button type="button" class="btn btn-secondary" id="credCancel">Cancel</button>
            </div>
        </div>
    </div>`);

    const $ = id => document.getElementById(id);
    let current = null;

    function strengthLevel(pw) {
        if (!pw) return 0;
        if (passwordWeakness(pw)) return 1;
        return (pw.length >= 10 && /[A-Z]/.test(pw) && /[a-z]/.test(pw) && /[0-9]/.test(pw)) ? 3 : 2;
    }
    function refresh() {
        const pw = $('credPw').value, pw2 = $('credPw2').value;
        const lvl = strengthLevel(pw);
        const bar = $('credBar'), hint = $('credHint');
        bar.style.width = ['0%', '33%', '66%', '100%'][lvl];
        bar.style.background = ['transparent', 'var(--danger-color)', 'var(--warning-color)', 'var(--success-color)'][lvl];
        const weak = passwordWeakness(pw);
        hint.textContent = !pw ? '' : (weak ? '⚠ Weak password: ' + weak + '. You can still use it.' : (lvl === 3 ? '✓ Strong password' : '✓ Good password'));
        hint.style.color = !pw ? '' : (weak ? 'var(--warning-dark)' : 'var(--success-color)');
        const m = $('credMatch');
        m.textContent = !pw2 ? '' : (pw === pw2 ? '✓ Passwords match' : 'Passwords do not match');
        m.style.color = !pw2 ? '' : (pw === pw2 ? 'var(--success-color)' : 'var(--danger-color)');
        $('credError').textContent = '';
    }
    $('credPw').addEventListener('input', refresh);
    $('credPw2').addEventListener('input', refresh);
    $('credEye').addEventListener('click', () => {
        const show = $('credPw').type === 'password';
        $('credPw').type = show ? 'text' : 'password';
        $('credPw2').type = show ? 'text' : 'password';
    });
    $('credCancel').addEventListener('click', () => window.closeCredModal());
    $('credModal').addEventListener('click', e => { if (e.target === $('credModal')) window.closeCredModal(); });
    $('credSave').addEventListener('click', () => {
        if (!current) return;
        const username = $('credUser').value.trim();
        const pw = $('credPw').value, pw2 = $('credPw2').value;
        const err = $('credError');
        if (current.askUsername && current.usernameRequired && !username) { err.textContent = 'Please enter a username.'; return; }
        if (current.askPassword) {
            if (!pw) { err.textContent = 'Please enter a password.'; return; }
            if (pw !== pw2) { err.textContent = 'The two passwords do not match.'; return; }
        }
        const result = current.onSave({ username, password: pw });
        if (result === true) closeCredModal();
        else if (typeof result === 'string') err.textContent = result;
    });
    window.closeCredModal = function () { $('credModal').setAttribute('aria-hidden', 'true'); current = null; };
    window.openCredModal = function (opts) {
        current = Object.assign({ askUsername: false, askPassword: true, usernameRequired: false, saveLabel: 'Save' }, opts);
        $('credTitle').textContent = current.title;
        $('credSub').textContent = current.subtitle || '';
        $('credUserRow').style.display = current.askUsername ? 'block' : 'none';
        $('credUserLabel').textContent = current.userLabel || 'Username';
        $('credUser').value = current.username || '';
        $('credUser').placeholder = current.userPlaceholder || '';
        $('credPwWrap').style.display = current.askPassword ? 'block' : 'none';
        $('credPw').value = ''; $('credPw2').value = '';
        $('credPw').type = 'password'; $('credPw2').type = 'password';
        $('credSave').textContent = current.saveLabel;
        refresh();
        $('credModal').setAttribute('aria-hidden', 'false');
        if (window.lucide) lucide.createIcons();
        setTimeout(() => { if (current) (current.askUsername ? $('credUser') : $('credPw')).focus(); }, 50);
    };
})();

function resetTeacherPassword(teacherId) {
    const t = (getData('teachers') || []).find(x => x.id === teacherId);
    if (!t) return;
    openCredModal({
        title: 'Create new password',
        subtitle: `Choose a new password for ${t.name}.`,
        saveLabel: 'Save password',
        onSave: ({ password }) => {
            const users = getData('users') || [];
            const user = findTeacherUser(t, users);
            if (!user) return 'No login found for this teacher.';
            user.password = password;
            if (!saveData('users', users)) return 'Could not save the password. Please try again.';
            renderTeacherLoginPanel(t);
            showNotification('Password updated for ' + t.name, 'success');
            addActivity('🔑', 'Password changed for ' + t.name);
            return true;
        }
    });
}

function changeTeacherUsername(teacherId) {
    const teachers = getData('teachers') || [];
    const t = teachers.find(x => x.id === teacherId);
    if (!t) return;
    const users = getData('users') || [];
    const user = findTeacherUser(t, users);
    if (!user) return showNotification('No login found for this teacher', 'error');
    openCredModal({
        title: 'Change username',
        subtitle: `Enter the new username for ${t.name}.`,
        askUsername: true, askPassword: false, usernameRequired: true,
        userLabel: 'New username', username: user.username,
        saveLabel: 'Save username',
        onSave: ({ username }) => {
            if (username === user.username) return true;
            if (users.some(u => u.username === username && u !== user)) return 'That username is already taken.';
            user.username = username;
            t.username = username;
            if (!(saveData('users', users) && saveData('teachers', teachers))) return 'Could not save. Please try again.';
            renderTeacherLoginPanel(t);
            loadTeachersFromStorage();
            showNotification('Username updated', 'success');
            addActivity('🔑', 'Username changed for ' + t.name);
            return true;
        }
    });
}

document.addEventListener('click', function (e) {
    const m = document.getElementById('teacherProfileModal');
    if (m && m.getAttribute('aria-hidden') === 'false' && e.target === m) closeTeacherProfile();
});

// Teachers table was already drawn by school.js before this file loaded,
// so redraw it with the new row layout.
// Keep the "not checked in" button in step with the table, and refresh it every minute
(function () {
    const original = window.loadTeachersFromStorage;
    if (typeof original === 'function') {
        window.loadTeachersFromStorage = function () {
            const result = original.apply(this, arguments);
            renderNotCheckedIn();
            return result;
        };
    }
    setInterval(renderNotCheckedIn, 60000);
})();

if (typeof loadTeachersFromStorage === 'function') loadTeachersFromStorage();
renderNotCheckedIn();
