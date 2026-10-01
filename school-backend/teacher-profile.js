// ============================================================
// teacher-profile.js — Teacher Personal + Login profile
// Load AFTER school.js:  <script src="teacher-profile.js"></script>
// It extends school.js without editing it.
// ============================================================

// ---------- 1. Supabase mapping (new columns) ----------
// Run once in Supabase SQL editor:
//   alter table teachers
//     add column if not exists gender text default '',
//     add column if not exists address text default '',
//     add column if not exists registration_date text default '';
(function () {
    const origFor = window.mapRowForSupabase;
    const origFrom = window.mapRowFromSupabase;
    window.mapRowForSupabase = function (table, item) {
        const row = origFor(table, item);
        if (table === 'teachers') {
            row.gender = item.gender || '';
            row.address = item.address || '';
            row.registration_date = item.registrationDate || '';
        }
        return row;
    };
    window.mapRowFromSupabase = function (table, row) {
        const obj = origFrom(table, row);
        if (table === 'teachers') {
            obj.gender = row.gender || '';
            obj.address = row.address || '';
            obj.registrationDate = row.registration_date || '';
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
            <p class="subtitle" style="font-size:0.78rem;">A login (username + temporary password) is created automatically for new teachers. Find it under the teacher's Login tab.</p>
        `);
    }
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
                </div>
                <div class="profile-panel" id="tpPanel-personal"></div>
                <div class="profile-panel" id="tpPanel-login" style="display:none;"></div>
            </div>
        </div>`);
})();

// ---------- 3. Helpers ----------
function tpEsc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
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
function createTeacherLogin(teacherId) {
    const teachers = getData('teachers') || [];
    const idx = teachers.findIndex(t => t.id === teacherId);
    if (idx === -1) return null;
    let users = getData('users') || [];
    if (!Array.isArray(users)) users = [];
    if (findTeacherUser(teachers[idx], users)) return null;

    const username = generateTeacherUsername(teachers[idx].name);
    const password = generateTempPassword();
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
        registrationDate: document.getElementById('teacherRegDateInput').value
    };
    if (!name) return showNotification('Teacher name is required', 'warning');

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
        const nextId = 'T' + String(teachers.length + 1).padStart(3, '0');
        savedTeacher = { id: nextId, ...fields };
        teachers.push(savedTeacher);
        if (!saveData('teachers', teachers)) return showNotification('Error saving teacher', 'error');
        const creds = createTeacherLogin(savedTeacher.id);
        loadTeachersFromStorage();
        showNotification(creds
            ? `Teacher added. Login: ${creds.username} / ${creds.password} (also on their Login tab)`
            : 'Teacher added successfully!', 'success');
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

// ---------- 7. Profile modal: Personal + Login ----------
function openTeacherProfile(teacherId, tab = 'personal') {
    const t = (getData('teachers') || []).find(x => x.id === teacherId);
    if (!t) return showNotification('Teacher not found', 'error');
    document.getElementById('teacherProfileTitle').textContent = `${t.name} — ${t.id}`;
    renderTeacherPersonalPanel(t);
    renderTeacherLoginPanel(t);
    showTeacherProfileTab(tab);
    document.getElementById('teacherProfileModal').setAttribute('aria-hidden', 'false');
}

function closeTeacherProfile() {
    document.getElementById('teacherProfileModal')?.setAttribute('aria-hidden', 'true');
}

function showTeacherProfileTab(tab) {
    ['personal', 'login'].forEach(k => {
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
            ${item('Full Name', t.name)}${item('Gender', t.gender)}${item('Phone Number', t.phone)}
            ${item('Email', t.email)}${item('Home Address', t.address)}${item('Employment Status', status)}
            ${item('Registration Date', reg)}
        </div>`;
}

function renderTeacherLoginPanel(t) {
    const panel = document.getElementById('tpPanel-login');
    const users = getData('users') || [];
    const user = findTeacherUser(t, users);

    if (!user) {
        panel.innerHTML = `
            <div class="info-box">This teacher has no login yet. Create one and a username and temporary password will be generated.</div>
            <button class="btn btn-primary" onclick="createLoginFromProfile('${t.id}')">Create Login</button>`;
        return;
    }
    if (!user.teacherId) { user.teacherId = t.id; saveData('users', users); }

    panel.innerHTML = `
        <div class="info-box"><strong>For the headmaster:</strong> if a teacher forgets their login, read it here or reset it. The password stays hidden until you click Show / Hide.</div>
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
        <p class="subtitle" style="margin-top:1rem; font-size:0.8rem;">Reset password generates a new temporary password and replaces the old one immediately.</p>`;
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

function createLoginFromProfile(teacherId) {
    const creds = createTeacherLogin(teacherId);
    const t = (getData('teachers') || []).find(x => x.id === teacherId);
    if (t) renderTeacherLoginPanel(t);
    loadTeachersFromStorage();
    if (creds) {
        showNotification(`Login created: ${creds.username} / ${creds.password}`, 'success');
        addActivity('🔑', `Login created for ${t.name}`);
    }
}

function resetTeacherPassword(teacherId) {
    const t = (getData('teachers') || []).find(x => x.id === teacherId);
    if (!t) return;
    if (!confirm(`Reset the password for ${t.name}? Their current password will stop working.`)) return;
    const users = getData('users') || [];
    const user = findTeacherUser(t, users);
    if (!user) return showNotification('No login found for this teacher', 'error');
    user.password = generateTempPassword();
    if (saveData('users', users)) {
        renderTeacherLoginPanel(t);
        showNotification(`New password for ${t.name}: ${user.password}`, 'success');
        addActivity('🔑', `Password reset for ${t.name}`);
    } else showNotification('Error resetting password', 'error');
}

function changeTeacherUsername(teacherId) {
    const teachers = getData('teachers') || [];
    const t = teachers.find(x => x.id === teacherId);
    if (!t) return;
    const users = getData('users') || [];
    const user = findTeacherUser(t, users);
    if (!user) return showNotification('No login found for this teacher', 'error');

    const input = prompt('New username:', user.username);
    if (input === null) return;
    const newName = input.trim();
    if (!newName) return showNotification('Username cannot be empty', 'warning');
    if (newName === user.username) return;
    if (users.some(u => u.username === newName && u !== user)) return showNotification('That username is already taken', 'error');

    user.username = newName;
    t.username = newName;
    if (saveData('users', users) && saveData('teachers', teachers)) {
        renderTeacherLoginPanel(t);
        loadTeachersFromStorage();
        showNotification('Username updated', 'success');
        addActivity('🔑', `Username changed for ${t.name}`);
    } else showNotification('Error updating username', 'error');
}

document.addEventListener('click', function (e) {
    const m = document.getElementById('teacherProfileModal');
    if (m && m.getAttribute('aria-hidden') === 'false' && e.target === m) closeTeacherProfile();
});

// Teachers table was already drawn by school.js before this file loaded,
// so redraw it with the new row layout.
if (typeof loadTeachersFromStorage === 'function') loadTeachersFromStorage();
