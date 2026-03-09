 // ===========================
// DOM ELEMENTS
// ===========================

const navLinks = document.querySelectorAll('.nav-link');
const menuItems = document.querySelectorAll('.menu-item');
const contentSections = document.querySelectorAll('.content-section');

// ===========================
// INITIALIZE ON PAGE LOAD
// ===========================

document.addEventListener('DOMContentLoaded', async function() {
    console.log('✓ Page loaded - initializing...');
    
    // Initialize currency selector
    const currencySelect = document.getElementById('currencySelect');
    if (currencySelect) {
        currencySelect.value = getCurrency();
        console.log('✓ Currency selector initialized to:', getCurrency());
    }
    
    initializeNavigation();
    initializeFilters();

    // Display logged-in user's name in navbar and wire logout
    try{
        const currentUser = getData('currentUser');
        const navUserEl = document.getElementById('navUsername') || document.querySelector('.user-profile .username');
        if(navUserEl && currentUser){ navUserEl.textContent = currentUser.name || currentUser.username || 'User'; }

        const logoutBtn = document.getElementById('btnLogout');
        if(logoutBtn){
            logoutBtn.addEventListener('click', function(){
                localStorage.removeItem('currentUser');
                window.location.href = 'login.html';
            });
        }
    }catch(e){console.warn('Error wiring logout or displaying user',e)}
    
    // Wire notification bell button
    const notificationBell = document.getElementById('notificationBell');
    if (notificationBell) {
        notificationBell.addEventListener('click', () => {
            const section = document.getElementById('dashboard-section');
            if (section) {
                navigateTo('dashboard');
                setTimeout(() => {
                    const notifContainer = document.getElementById('notificationsContainer');
                    if (notifContainer) {
                        notifContainer.scrollIntoView({ behavior: 'smooth' });
                    }
                }, 100);
            }
        });
    }
    
    // Small delay to ensure DOM is fully ready
    await loadFromBackend();
    setTimeout(() => {
        loadAllData();
    }, 100);
});

// Simple auth guard: require a logged-in user to view dashboard
document.addEventListener('DOMContentLoaded', function() {
    const current = getData('currentUser');
    if (!current) {
        window.location.href = 'login.html';
    }
});

// ===========================
// NAVIGATION FUNCTIONS
// ===========================

function initializeNavigation() {
    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const section = this.getAttribute('data-section');
            navigateTo(section);
        });
    });

    menuItems.forEach(item => {
        item.addEventListener('click', function(e) {
            e.preventDefault();
            const menu = this.getAttribute('data-menu');
            navigateTo(menu);
        });
    });
}

function navigateTo(section) {
    navLinks.forEach(link => link.classList.remove('active'));
    menuItems.forEach(item => item.classList.remove('active'));
    contentSections.forEach(section => section.classList.remove('active'));

    document.querySelector(`[data-section="${section}"]`)?.classList.add('active');
    document.querySelector(`[data-menu="${section}"]`)?.classList.add('active');

    const activeSection = document.getElementById(`${section}-section`);
    if (activeSection) {
        activeSection.classList.add('active');
        window.scrollTo(0, 0);
    }
}

// ===========================
// API FUNCTIONS
// ===========================
const API_URL = 'http://localhost:3000/api';

const BACKEND_KEYS = ['students', 'teachers', 'classes', 'timetables', 'fees', 'attendance'];

function saveData(key, data) {
    try {
        localStorage.setItem(key, JSON.stringify(data));
        if (BACKEND_KEYS.includes(key)) {
            syncToBackend(key, data);
        }
        return true;
    } catch (e) {
        console.error('Error saving:', e);
        return false;
    }
}

function getData(key) {
    try {
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : null;
    } catch (e) {
        console.error('Error reading:', e);
        return null;
    }
}

function getToken() {
    return localStorage.getItem('authToken') || '';
}

async function syncToBackend(key, data) {
    try {
        await fetch(`${API_URL}/sync`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getToken()}`
            },
            body: JSON.stringify({ key, data })
        });
    } catch (e) {
        console.warn('Backend sync failed:', e);
    }
}

async function loadFromBackend() {
    try {
        const res = await fetch(`${API_URL}/sync`, {
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });
        const allData = await res.json();
        Object.entries(allData).forEach(([key, value]) => {
            if (value && value.length > 0) {
                localStorage.setItem(key, JSON.stringify(value));
                console.log(`✓ Loaded ${key} from backend`);
            }
        });
    } catch (e) {
        console.warn('Could not load from backend, using localStorage:', e);
    }
}
 
// ===========================
// CURRENCY FUNCTIONS
// ===========================

function getCurrency() {
    const currency = localStorage.getItem('schoolCurrency') || 'USD';
    return currency;
}

function getCurrencySymbol(currency = null) {
    const curr = currency || getCurrency();
    return curr === 'ZWL' ? 'Z$' : '$';
}

function changeCurrency(newCurrency) {
    localStorage.setItem('schoolCurrency', newCurrency);
    console.log('✓ Currency changed to:', newCurrency);
}

function formatCurrency(amount, currency = null) {
    const curr = currency || getCurrency();
    const symbol = getCurrencySymbol(curr);
    
    if (amount === '-') return '-';
    
    const numAmount = parseInt(amount) || 0;
    if (curr === 'ZWL') {
        return symbol + numAmount.toLocaleString();
    } else {
        return symbol + numAmount.toLocaleString();
    }
}

// ===========================
// LOAD ALL DATA FROM STORAGE
// ===========================

function loadAllData() {
    console.log('=== LOADING ALL STORED DATA ===');
    loadStudentsFromStorage();
    loadTeachersFromStorage();
    loadClassesFromStorage();
    loadFeesFromStorage();
    updateFeeSummary();
    loadTimetablesFromStorage();
    populateTimetableClassSelect();

    loadAttendanceNotifications();

    const ttSelect = document.getElementById('timetableClassSelect');
    if (ttSelect) {
        ttSelect.addEventListener('change', function() {
            renderTimetableForClass(this.value);
        });
    }

    const addClassBtn = document.getElementById('addClassBtn');
    if (addClassBtn) {
        addClassBtn.addEventListener('click', function(e) {
            console.log('Add Class button clicked');
        });
    }

    loadGradesForMain();

    console.log('=== DATA LOAD COMPLETE ===');
    updateDashboardStats();
    loadActivitiesFromStorage();
}

// ===========================
// DASHBOARD STATS
// ===========================

function updateDashboardStats() {
    const students = getData('students') || [];
    const teachers = getData('teachers') || [];
    const classes = getData('classes') || [];
    const totalStudents = students.length || 0;
    const totalTeachers = teachers.length || 0;
    const totalClasses = classes.length || 0;

    const elStudents = document.getElementById('totalStudentsStat');
    const elTeachers = document.getElementById('totalTeachersStat');
    const elClasses = document.getElementById('totalClassesStat');

    if (elStudents) elStudents.textContent = totalStudents.toLocaleString();
    if (elTeachers) elTeachers.textContent = totalTeachers.toLocaleString();
    if (elClasses) elClasses.textContent = totalClasses.toLocaleString();

    animateStats();
}

// ===========================
// ATTENDANCE NOTIFICATIONS
// ===========================

function loadAttendanceNotifications() {
    const notificationsContainer = document.getElementById('notificationsContainer');
    if (!notificationsContainer) return;
    
    const notifications = getData('attendanceNotifications') || [];
    
    if (!Array.isArray(notifications) || notifications.length === 0) {
        notificationsContainer.innerHTML = '<p style="color: #999; text-align: center; padding: 2rem;">No attendance notifications yet</p>';
        updateNotificationBadge(0);
        const clearBtn = document.getElementById('clearNotificationsBtn');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                saveData('attendanceNotifications', []);
                loadAttendanceNotifications();
            });
        }
        return;
    }
    
    notificationsContainer.innerHTML = '';
    
    notifications.forEach(notification => {
        const div = document.createElement('div');
        div.className = 'notification-item';
        div.style.cssText = `
            padding: 1rem;
            border-left: 4px solid #667eea;
            background: #f9f9f9;
            margin-bottom: 0.75rem;
            border-radius: 4px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        `;
        
        const dayName = getDayNameFromDateStr(notification.date);
        const timeStr = new Date(notification.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        div.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                <div style="flex: 1;">
                    <h4 style="margin: 0 0 0.5rem 0; color: #333;">📋 Attendance Marked - <strong>${notification.class}</strong></h4>
                    <p style="margin: 0.25rem 0; color: #666; font-size: 0.95em;">
                        <strong>Teacher:</strong> ${notification.teacher}
                    </p>
                    <p style="margin: 0.25rem 0; color: #666; font-size: 0.95em;">
                        <strong>Present:</strong> <span style="color: #43e97b; font-weight: 600;">${notification.presentCount}/${notification.totalCount}</span> students
                    </p>
                    <p style="margin: 0.5rem 0 0 0; color: #999; font-size: 0.85em;">
                        ${dayName}, ${notification.date} at <strong>${timeStr}</strong>
                    </p>
                </div>
                <button class="btn-small" onclick="removeNotification(this, '${notification.id}')" style="margin-left: 0.5rem; padding: 4px 8px; background: #eee; border: none; border-radius: 4px; cursor: pointer;">✕</button>
            </div>
        `;
        
        notificationsContainer.appendChild(div);
    });
    
    updateNotificationBadge(notifications.length);
    
    const clearBtn = document.getElementById('clearNotificationsBtn');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            saveData('attendanceNotifications', []);
            loadAttendanceNotifications();
        });
    }
}

function getDayNameFromDateStr(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[d.getDay()];
}

function updateNotificationBadge(count) {
    const badge = document.getElementById('notificationCount');
    if (!badge) return;
    
    if (count > 0) {
        badge.textContent = count;
        badge.style.display = 'flex';
    } else {
        badge.style.display = 'none';
    }
}

function removeNotification(btn, notificationId) {
    let notifications = getData('attendanceNotifications') || [];
    notifications = notifications.filter(n => n.id !== notificationId);
    saveData('attendanceNotifications', notifications);
    loadAttendanceNotifications();
}

window.addEventListener('storage', (e) => {
    if (e.key === 'attendanceNotifications') {
        console.log('Attendance notifications updated from another tab');
        loadAttendanceNotifications();
    }
});


// ===========================
// CLASSES MANAGEMENT
// ===========================

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

    const classes = window._classes || [];
    const filterValue = document.getElementById('formLevelFilter')?.value || '';
    
    let displayClasses = classes;
    if (filterValue) {
        displayClasses = classes.filter(cls => cls.formLevel === filterValue);
    }
    
    if (displayClasses.length === 0) {
        container.innerHTML = '<p>No classes yet. Click "Add New Class" to create one.</p>';
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
                        <p><strong>Class Teacher:</strong> ${cls.teacher || '-'}</p>
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
                    <h3 style="margin:0; color: #667eea; font-size:1.05rem;">Form ${formLevel}</h3>
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
                    <p><strong>Class Teacher:</strong> ${cls.teacher || '-'}</p>
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

function showAddClassForm() {
    console.log('showAddClassForm invoked');
    const className = prompt('Enter class name (e.g., Form 1-A):');
    if (!className) return;
    const teacher = prompt('Enter class teacher name:');
    const room = prompt('Enter room number:');

    addClassToStorage({ name: className, teacher: teacher || '', room: room || '' });
}

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
            document.getElementById('classTeacherInput').value = cls.teacher || '';
            document.getElementById('classRoomInput').value = cls.room || '';
        }
    }
}

function closeClassModal() {
    const modal = document.getElementById('classModal');
    if (!modal) return;
    modal.setAttribute('aria-hidden', 'true');
    modal.dataset.editId = '';
}

document.addEventListener('submit', function(e) {
    if (e.target && e.target.id === 'classForm') {
        e.preventDefault();
        const editId = document.getElementById('classModal').dataset.editId || null;
        const formLevel = document.getElementById('classFormLevelInput').value.trim();
        const name = document.getElementById('classNameInput').value.trim();
        if (!formLevel) return showNotification('Form level is required', 'warning');
        if (!name) return showNotification('Class name is required', 'warning');
        const teacher = document.getElementById('classTeacherInput').value.trim();
        const room = document.getElementById('classRoomInput').value.trim();
        
        const fullClassName = `Form ${formLevel}-${name}`;

        const clsObj = { name: fullClassName, formLevel, teacher, room };

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

document.addEventListener('click', function(e) {
    const modal = document.getElementById('classModal');
    if (!modal) return;
    if (modal.getAttribute('aria-hidden') === 'false' && e.target === modal) closeClassModal();
});

function openUserModal() {
    const modal = document.getElementById('userModal');
    if (!modal) return;
    modal.setAttribute('aria-hidden', 'false');
    const form = document.getElementById('userForm');
    if (form && form.reset) form.reset();
    document.getElementById('userModalTitle').textContent = 'Create Guest User';

    const classSelect = document.getElementById('guestClassSelect');
    const roleSelect = document.getElementById('guestRole');
    const usernameInput = document.getElementById('guestUsername');
    if (classSelect) {
        classSelect.innerHTML = '<option value="">Select Class</option>';
        const classes = getData('classes') || [];
        (Array.isArray(classes) ? classes : []).forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.name;
            opt.textContent = c.name;
            classSelect.appendChild(opt);
        });
        if (roleSelect && !roleSelect.dataset._guestWired) {
            roleSelect.addEventListener('change', function() {
                if (this.value === 'teacher') {
                    document.getElementById('guestClassRow').style.display = 'block';
                    if (usernameInput) {
                        usernameInput.readOnly = true;
                        usernameInput.placeholder = 'Will match selected class';
                    }
                } else {
                    document.getElementById('guestClassRow').style.display = 'none';
                    if (usernameInput) {
                        usernameInput.readOnly = false;
                        usernameInput.placeholder = 'username';
                    }
                }
            });
            classSelect.addEventListener('change', function() {
                    if (roleSelect.value === 'teacher' && usernameInput) {
                        const clsName = this.value || '';
                        const classes = getData('classes') || [];
                        const cls = (Array.isArray(classes) ? classes : []).find(c => c.name === clsName);
                        const teacherName = cls ? (cls.teacher || '') : '';
                        usernameInput.value = teacherName || '';
                    }
                });
            roleSelect.dataset._guestWired = '1';
        }
        if (roleSelect && roleSelect.value === 'teacher') {
            document.getElementById('guestClassRow').style.display = 'block';
            if (usernameInput) usernameInput.readOnly = true;
        } else {
            document.getElementById('guestClassRow').style.display = 'none';
        }
    }
}

function closeUserModal() {
    const modal = document.getElementById('userModal');
    if (!modal) return;
    modal.setAttribute('aria-hidden', 'true');
}

document.addEventListener('submit', function(e) {
    if (e.target && e.target.id === 'userForm') {
        e.preventDefault();
        const name = document.getElementById('guestName').value.trim();
        let username = document.getElementById('guestUsername').value.trim();
        const password = document.getElementById('guestPassword').value;
        const role = document.getElementById('guestRole').value || 'guest';
        const selectedClass = document.getElementById('guestClassSelect')?.value || '';

        if (!name || !username || !password) return showNotification('Please fill all fields', 'warning');

        let users = getData('users') || [];
        if (!Array.isArray(users)) users = [];
        if (users.find(u => u.username === username)) return showNotification('Username already exists', 'error');

        const id = 'U' + String(users.length + 1).padStart(3, '0');
        if (role === 'teacher') {
            if (!selectedClass) return showNotification('Please select a class for the teacher', 'warning');
            const classes = getData('classes') || [];
            const cls = (Array.isArray(classes) ? classes : []).find(c => c.name === selectedClass);
            const classTeacherName = cls ? (cls.teacher || name) : name;
            if (!classTeacherName) return showNotification('Class teacher name is required', 'warning');
            username = classTeacherName;
        }

        const user = { id, username, password, role, name };
        users.push(user);
        if (saveData('users', users)) {
            showNotification('Guest created successfully', 'success');
            addActivity('👤', `Created guest user ${name} (${username})`);
            if (role === 'teacher') {
                let teachers = getData('teachers') || [];
                if (!Array.isArray(teachers)) teachers = [];
                let existing = teachers.find(t => t.username === username || t.name === username || t.name === name);
                if (!existing) {
                    const nextId = 'T' + String(teachers.length + 1).padStart(3, '0');
                    const newTeacher = { id: nextId, name: username, department: '', email: '', phone: '', status: 'Active', username: username, class: selectedClass };
                    teachers.push(newTeacher);
                    saveData('teachers', teachers);
                    addActivity('👩‍🏫', `Teacher account created for ${username} — class ${selectedClass}`);
                } else {
                    existing.username = username;
                    existing.class = selectedClass;
                    existing.name = username;
                    saveData('teachers', teachers);
                }
                loadTeachersFromStorage();
                updateDashboardStats();
            }
            closeUserModal();
        } else {
            showNotification('Error saving guest', 'error');
        }
    }
});

document.addEventListener('click', function(e) {
    const modal = document.getElementById('userModal');
    if (!modal) return;
    if (modal.getAttribute('aria-hidden') === 'false' && e.target === modal) closeUserModal();
});

function addClassToStorage(cls) {
    let classes = getData('classes') || [];
    if (!Array.isArray(classes)) classes = [];
    const nextId = 'C' + String(classes.length + 1).padStart(3, '0');
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
        const mid = grades.find(g => g.studentId === s.id && (g.examType||'').toLowerCase() === 'midterm');
        const fin = grades.find(g => g.studentId === s.id && (g.examType||'').toLowerCase() === 'final');
        const midDisplay = mid ? (mid.marks + ' (' + (mid.grade||'') + ')') : '-';
        const finDisplay = fin ? (fin.marks + ' (' + (fin.grade||'') + ')') : '-';
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

function promptAddGrade(studentId) {
    const examType = prompt('Enter exam type (Midterm or Final):');
    if (!examType) return;
    const marks = prompt('Enter marks (0-100):');
    if (marks === null) return;
    const m = parseInt(marks);
    if (isNaN(m) || m < 0) return showNotification('Invalid marks', 'error');
    const grade = calculateGrade(m);

    let grades = getData('grades') || [];
    if (!Array.isArray(grades)) grades = [];
    const existingIdx = grades.findIndex(g => g.studentId === studentId && (g.examType||'').toLowerCase() === examType.toLowerCase());
    const student = (getData('students') || []).find(s => s.id === studentId);
    if (existingIdx !== -1) {
        grades[existingIdx] = { ...grades[existingIdx], marks: m, grade, examType };
    } else {
        grades.push({ id: String(grades.length + 1).padStart(3,'0'), studentId, studentName: student?.name||'', class: student?.class||'', subject: '', examType, marks: m, grade });
    }
    if (saveData('grades', grades)) {
        showNotification('Grade saved', 'success');
        const currentClass = document.getElementById('classDetailsTitle')?.textContent?.split(':')[1]?.split('—')[0]?.trim();
        const classes = window._classes || getData('classes') || [];
        const cls = classes.find(c => c.name === currentClass);
        if (cls) openClassDetailsModal(cls.id);
        loadGradesForMain();
    } else {
        showNotification('Error saving grade', 'error');
    }
}

function viewStudentDetail(studentId) {
    openStudentProfile(studentId);
}

function showGradeForm() {
    const classes = getData('classes') || [];
    const students = getData('students') || [];

    if (!Array.isArray(classes) || classes.length === 0) {
        if (!students.length) return showNotification('No students available to grade', 'warning');
        const list = students.map((s, i) => `${i+1}. ${s.name} (${s.class})`).join('\n');
        const sel = prompt('Select student by number:\n\n' + list);
        if (!sel) return;
        const idx = parseInt(sel) - 1;
        if (isNaN(idx) || idx < 0 || idx >= students.length) return showNotification('Invalid selection', 'error');
        promptAddGrade(students[idx].id);
        return;
    }

    const classList = classes.map((c, i) => `${i+1}. ${c.name}`).join('\n');
    const classSel = prompt('Select class by number:\n\n' + classList);
    if (!classSel) return;
    const cidx = parseInt(classSel) - 1;
    if (isNaN(cidx) || cidx < 0 || cidx >= classes.length) return showNotification('Invalid class selection', 'error');

    const clsName = classes[cidx].name;
    const classStudents = students.filter(s => s.class === clsName);
    if (!classStudents.length) return showNotification('No students in selected class', 'warning');

    const list = classStudents.map((s, i) => `${i+1}. ${s.name}`).join('\n');
    const sel = prompt('Select student by number:\n\n' + list);
    if (!sel) return;
    const idx = parseInt(sel) - 1;
    if (isNaN(idx) || idx < 0 || idx >= classStudents.length) return showNotification('Invalid selection', 'error');

    promptAddGrade(classStudents[idx].id);
}

function loadGradesForMain() {
    const tbody = document.getElementById('mainGradesTableBody');
    if (!tbody) return;

    const grades = getData('grades') || [];
    if (!Array.isArray(grades) || grades.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#777;">No grades recorded</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    grades.forEach(g => {
        const tr = document.createElement('tr');
        const studentId = g.studentId || '-';
        const studentName = (getData('students')||[]).find(s=>s.id===g.studentId);
        const clsName = g.class || (studentName ? studentName.class : '-') || '-';
        const subject = g.subject || '-';
        const exam = g.examType || g.exam || '-';
        const gradeDisplay = g.grade || (g.marks !== undefined ? String(g.marks) : '-');
        const teacherName = g.teacher || g.createdBy || '-';

        tr.innerHTML = `
            <td>${g.id || '-'}</td>
            <td>${studentId}</td>
            <td>${clsName}</td>
            <td>${subject}</td>
            <td>${exam}</td>
            <td>${gradeDisplay}</td>
            <td>${teacherName}</td>
        `;
        tbody.appendChild(tr);
    });
}

function showAddTimetableEntry() {
    const classes = getData('classes') || [];
    if (!Array.isArray(classes) || classes.length === 0) return showNotification('No classes exist. Create a class first.', 'warning');

    const classList = classes.map((c, i) => `${i+1}. ${c.name}`).join('\n');
    const classSel = prompt('Select class by number:\n\n' + classList);
    if (!classSel) return;
    const cidx = parseInt(classSel) - 1;
    if (isNaN(cidx) || cidx < 0 || cidx >= classes.length) return showNotification('Invalid class selection', 'error');
    const className = classes[cidx].name;

    const days = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const daySel = prompt('Enter day (e.g. Monday):');
    if (!daySel) return;
    if (!days.map(d => d.toLowerCase()).includes(daySel.toLowerCase())) return showNotification('Invalid day', 'error');

    const subject = prompt('Enter subject name:');
    if (!subject) return showNotification('Subject required', 'warning');

    const start = prompt('Start time (e.g. 08:00):');
    if (!start) return showNotification('Start time required', 'warning');
    const end = prompt('End time (e.g. 08:45):');
    if (!end) return showNotification('End time required', 'warning');

    const teachers = getData('teachers') || [];
    let teacherName = '';
    if (Array.isArray(teachers) && teachers.length) {
        const tlist = teachers.map((t, i) => `${i+1}. ${t.name}`).join('\n');
        const tsel = prompt('Select teacher by number (or leave blank to type name):\n\n' + tlist);
        if (tsel) {
            const tidx = parseInt(tsel) - 1;
            if (!isNaN(tidx) && tidx >= 0 && tidx < teachers.length) teacherName = teachers[tidx].name;
        }
    }
    if (!teacherName) {
        const tname = prompt('Enter teacher name (optional):');
        teacherName = tname || '';
    }

    let timetables = getData('timetables') || [];
    if (!Array.isArray(timetables)) timetables = [];
    const id = String(timetables.length + 1).padStart(3, '0');
    const newEntry = { id, class: className, day: daySel, start, end, teacher: teacherName, subject };
    timetables.push(newEntry);
    if (saveData('timetables', timetables)) {
        window._timetables = timetables;
        showNotification('Timetable entry added', 'success');
        loadTimetablesFromStorage();
        populateTimetableClassSelect();
    } else {
        showNotification('Error saving timetable entry', 'error');
    }
}

function openStudentProfile(studentId) {
    const students = getData('students') || [];
    const student = students.find(s => s.id === studentId);
    if (!student) return showNotification('Student not found', 'error');

    const modal = document.getElementById('studentProfileModal');
    if (!modal) return showNotification('Profile modal missing', 'error');

    document.getElementById('studentProfileTitle').textContent = `${student.name} — ${student.id}`;

    const classes = getData('classes') || window._classes || [];
    const cls = classes.find(c => c.name === student.class);
    const classTeacher = cls ? (cls.teacher || '—') : '—';
    const overviewEl = document.getElementById('profileOverviewPanel');
    overviewEl.innerHTML = `
        <div style="display:flex; gap:1.25rem; flex-wrap:wrap;">
            <div style="min-width:220px;">
                <p><strong>Name:</strong> ${student.name}</p>
                <p><strong>ID:</strong> ${student.id}</p>
                <p><strong>Class:</strong> ${student.class}</p>
                <p><strong>Class Teacher:</strong> ${classTeacher}</p>
            </div>
            <div style="flex:1; min-width:220px;">
                <p><strong>Primary Parent/Guardian:</strong> —</p>
                <p><strong>Phone:</strong> —</p>
                <p style="margin-top:0.6rem;"><button class="btn btn-small btn-info" onclick="showStudentProfileTab('contacts')">Add/View Contacts</button></p>
            </div>
        </div>
    `;

    renderStudentAttendance(studentId);
    renderParentContacts(studentId);
    renderStudentFees(studentId);

    showStudentProfileTab('overview');

    modal.setAttribute('aria-hidden', 'false');
}

function closeStudentProfileModal() {
    const modal = document.getElementById('studentProfileModal');
    if (!modal) return;
    modal.setAttribute('aria-hidden', 'true');
}

function showStudentProfileTab(tab) {
    const tabs = ['overview', 'attendance', 'contacts', 'fees'];
    tabs.forEach(t => {
        const btn = document.getElementById(`profileTab-${t}`);
        const panel = document.getElementById(`profile${t.charAt(0).toUpperCase() + t.slice(1)}Panel`);
        if (btn) btn.classList.toggle('active', t === tab);
        if (panel) panel.style.display = t === tab ? 'block' : 'none';
    });
}

function renderStudentAttendance(studentId) {
    const panel = document.getElementById('profileAttendancePanel');
    if (!panel) return;

    const teacherRecords = (getData('attendance') || []).filter(r => r.studentId === studentId);
    const legacyRecords = (getData('attendanceRecords') || []).filter(r => r.studentId === studentId);

    const combined = [...teacherRecords, ...legacyRecords]
        .reduce((acc, cur) => {
            const key = `${cur.date}|${cur.class||''}`;
            if (!acc.map[key]) { acc.map[key] = true; acc.list.push(cur); }
            return acc;
        }, { map: {}, list: [] }).list
        .sort((a,b)=> new Date(b.date) - new Date(a.date));

    const total = combined.length;
    const presentCount = combined.filter(r => (r.status || '').toLowerCase() === 'present').length;
    const absentCount = total - presentCount;
    const attendancePct = total === 0 ? '-' : Math.round((presentCount / total) * 100) + '%';

    let html = `<div style="display:flex; gap:1rem; flex-wrap:wrap; align-items:center; margin-bottom:0.5rem;">
        <div style="min-width:160px;"><strong>Total records:</strong> ${total}</div>
        <div style="min-width:160px;"><strong>Present:</strong> ${presentCount}</div>
        <div style="min-width:160px;"><strong>Absent:</strong> ${absentCount}</div>
        <div style="min-width:160px;"><strong>Attendance %:</strong> ${attendancePct}</div>
    </div>`;

    if (combined.length === 0) {
        html += '<p style="color:#999; padding:0.75rem;">No attendance records yet (teacher-marked attendance appears here).</p>';
    } else {
        html += '<div class="attendance-list">';
        combined.forEach(r => {
            const teacher = r.teacher || r.markedBy || '-';
            const time = r.time ? ` — ${r.time}` : '';
            html += `
                <div class="attendance-item">
                    <div>
                        <div style="font-weight:700;">${new Date(r.date).toLocaleDateString()}</div>
                        <div style="color:#666; font-size:0.95rem;">Status: <strong>${(r.status||'').toUpperCase()}</strong> ${r.note?('- '+r.note):''}</div>
                        <div style="color:#999; font-size:0.85rem; margin-top:0.25rem;">Marked by: ${teacher}${time}</div>
                    </div>
                </div>
            `;
        });
        html += '</div>';
    }

    panel.innerHTML = html;
}

function renderParentContacts(studentId) {
    const panel = document.getElementById('profileContactsPanel');
    if (!panel) return;
    const contacts = (getData('parentContacts') || []).filter(c => c.studentId === studentId).sort((a,b)=>new Date(b.date)-new Date(a.date));

    let html = `
        <div style="display:flex; gap:0.5rem; flex-wrap:wrap; align-items:end;">
            <div style="flex:1; min-width:160px;">
                <label style="font-weight:600; font-size:0.9rem;">Contact Name</label>
                <input id="contactNameInput" placeholder="Parent/Guardian name" />
            </div>
            <div style="min-width:120px;">
                <label style="font-weight:600; font-size:0.9rem;">Relation</label>
                <input id="contactRelationInput" placeholder="e.g., Mother" />
            </div>
            <div style="min-width:160px;">
                <label style="font-weight:600; font-size:0.9rem;">Method</label>
                <select id="contactMethodInput">
                    <option value="phone">Phone</option>
                    <option value="email">Email</option>
                    <option value="visit">Visit</option>
                </select>
            </div>
            <div style="min-width:160px;">
                <label style="font-weight:600; font-size:0.9rem;">Phone</label>
                <input id="contactPhoneInput" placeholder="e.g., 0712345678" />
            </div>
            <div style="flex:1; min-width:220px;">
                <label style="font-weight:600; font-size:0.9rem;">Notes</label>
                <input id="contactNoteInput" placeholder="Short note" />
            </div>
            <div>
                <button class="btn btn-primary" style="margin-top:1.6rem;" onclick="addParentContact('${studentId}')">Add</button>
            </div>
        </div>
        <div class="contact-list" style="margin-top:1rem;">
    `;

    if (contacts.length === 0) {
        html += '<p style="color:#999; padding:0.75rem;">No contact logs yet</p>';
    } else {
        contacts.forEach(c => {
            html += `
                <div class="contact-item">
                    <div>
                        <div style="font-weight:700;">${c.contactName} <span style="font-weight:600; color:#666; font-size:0.9rem;">(${c.relation})</span></div>
                        <div style="color:#666; font-size:0.9rem;">${new Date(c.date).toLocaleString()} — ${c.method}${c.phone?(' • '+c.phone):''}</div>
                        <div style="margin-top:0.4rem; color:#333;">${c.notes || ''}</div>
                    </div>
                    <div style="min-width:80px; text-align:right;">
                        <button class="btn-small btn-danger" onclick="deleteParentContact('${c.id}','${studentId}')">Delete</button>
                    </div>
                </div>
            `;
        });
    }

    html += '</div>';
    panel.innerHTML = html;
}

function addParentContact(studentId) {
    const contactName = document.getElementById('contactNameInput')?.value.trim();
    const relation = document.getElementById('contactRelationInput')?.value.trim();
    const method = document.getElementById('contactMethodInput')?.value;
    const phone = document.getElementById('contactPhoneInput')?.value.trim();
    const notes = document.getElementById('contactNoteInput')?.value.trim();
    if (!contactName) return showNotification('Contact name is required', 'warning');

    const normalizedPhone = phone ? phone.replace(/[^0-9+]/g, '') : '';

    let contacts = getData('parentContacts') || [];
    if (!Array.isArray(contacts)) contacts = [];
    const id = 'P' + Date.now();
    contacts.push({ id, studentId, contactName, relation, method, phone: normalizedPhone, notes, date: new Date().toISOString() });
    saveData('parentContacts', contacts);
    renderParentContacts(studentId);
    addActivity('📞', `Contact log added for ${studentId}`);
    showNotification('Contact logged', 'success');
}

function deleteParentContact(contactId, studentId) {
    let contacts = getData('parentContacts') || [];
    contacts = contacts.filter(c => c.id !== contactId);
    saveData('parentContacts', contacts);
    renderParentContacts(studentId);
    showNotification('Contact log deleted', 'success');
}

function renderStudentFees(studentId) {
    const panel = document.getElementById('profileFeesPanel');
    if (!panel) return;
    const fees = (getData('fees') || []).filter(f => f.studentId === studentId);

    let html = '<div style="margin-top:0.25rem;">';
    if (fees.length === 0) {
        html += '<p style="color:#999;">No fee records for this student.</p>';
    } else {
        html += '<table class="table" style="margin-top:0.5rem;"><thead><tr><th>Amount</th><th>Status</th><th>Date</th></tr></thead><tbody>';
        fees.forEach(f => {
            html += `<tr><td>${formatCurrency(f.amount)}</td><td><span class="status-badge ${f.status==='paid'?'status-paid':'status-pending'}">${f.status}</span></td><td>${f.datePaid || '-'}</td></tr>`;
        });
        html += '</tbody></table>';
    }
    html += '</div>';
    panel.innerHTML = html;
}

document.addEventListener('click', function(e) {
    const modal = document.getElementById('studentProfileModal');
    if (!modal) return;
    if (modal.getAttribute('aria-hidden') === 'false' && e.target === modal) closeStudentProfileModal();
});

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

function loadStudentsFromStorage() {
    console.log('Loading students...');
    const students = getData('students');
    const tableBody = document.getElementById('studentsTableBody');
    
    if (!tableBody) {
        console.error('✗ Students table body not found!');
        return;
    }

    if (students && Array.isArray(students) && students.length > 0) {
        console.log('✓ Found ' + students.length + ' students in storage');
        tableBody.innerHTML = '';
        
        students.forEach(student => {
            addStudentRowToTable(student, tableBody);
        });
    } else {
        console.log('No students in storage');
    }
}

function loadTeachersFromStorage() {
    console.log('Loading teachers...');
    const teachers = getData('teachers');
    const tableBody = document.getElementById('teachersTableBody');
    
    if (!tableBody) {
        console.error('✗ Teachers table body not found!');
        return;
    }

    if (teachers && Array.isArray(teachers) && teachers.length > 0) {
        console.log('✓ Found ' + teachers.length + ' teachers in storage');
        tableBody.innerHTML = '';
        
        teachers.forEach(teacher => {
            addTeacherRowToTable(teacher, tableBody);
        });
    } else {
        console.log('No teachers in storage');
    }
}

function addStudentRowToTable(student, tableBody) {
    const newRow = document.createElement('tr');
    newRow.innerHTML = `
        <td>${student.id}</td>
        <td>${student.name}</td>
        <td>${student.class}</td>
        <td>
            <button class="btn-small btn-info" onclick="viewStudentDetail('${student.id}')">View</button>
            <button class="btn-small btn-warning" onclick="editRecord('student')">Edit</button>
            <button class="btn-small btn-danger" onclick="deleteStudentRecord(this, '${student.id}')">Delete</button>
        </td>
    `;
    tableBody.appendChild(newRow);
}

function addTeacherRowToTable(teacher, tableBody) {
    const newRow = document.createElement('tr');
    newRow.innerHTML = `
        <td>${teacher.id}</td>
        <td>${teacher.name}</td>
        <td>${teacher.department}</td>
        <td>${teacher.email}</td>
        <td>${teacher.phone}</td>
        <td><span class="status-badge status-active">Active</span></td>
        <td>
            <button class="btn-small btn-info" onclick="alert('View: ${teacher.name}')">View</button>
            <button class="btn-small btn-warning" onclick="editRecord('teacher')">Edit</button>
            <button class="btn-small btn-danger" onclick="deleteTeacherRecord(this, '${teacher.id}')">Delete</button>
        </td>
    `;
    tableBody.appendChild(newRow);
}

// ===========================
// ADD STUDENT FUNCTION
// ===========================

function showAddStudentForm() {
    openStudentModal();
}

function openStudentModal() {
    const modal = document.getElementById('studentModal');
    if (!modal) return showNotification('Student modal not found', 'error');
    const classes = getData('classes') || window._classes || [];
    if (!Array.isArray(classes) || classes.length === 0) {
        showNotification('No classes exist. Create a class first.', 'warning');
        return;
    }

    modal.setAttribute('aria-hidden', 'false');
    const form = document.getElementById('studentForm');
    if (form && form.reset) form.reset();
    document.getElementById('studentModalTitle').textContent = 'Add Student';
    populateStudentClassSelect();
}

function closeStudentModal() {
    const modal = document.getElementById('studentModal');
    if (!modal) return;
    modal.setAttribute('aria-hidden', 'true');
}

function populateStudentClassSelect() {
    const select = document.getElementById('studentClassSelect');
    if (!select) return;
    const classes = getData('classes') || window._classes || [];
    select.innerHTML = '<option value="">Select Class</option>';
    if (!Array.isArray(classes) || classes.length === 0) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = 'No classes available';
        select.appendChild(opt);
        select.disabled = true;
        return;
    }
    classes.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.name;
        opt.textContent = c.name;
        select.appendChild(opt);
    });
    select.disabled = false;
}

document.addEventListener('submit', function(e) {
    if (e.target && e.target.id === 'studentForm') {
        e.preventDefault();
        const name = document.getElementById('studentNameInput').value.trim();
        const studentClass = document.getElementById('studentClassSelect').value;
        if (!name || !studentClass) return showNotification('Please provide student name and class', 'warning');
        const classes = getData('classes') || [];
        if (!classes.find(c => c.name === studentClass)) return showNotification('Selected class does not exist', 'error');
        addStudentToTable(name, studentClass);
        closeStudentModal();
        showNotification('Student added successfully!', 'success');
    }
});

document.addEventListener('click', function(e) {
    const modal = document.getElementById('studentModal');
    if (!modal) return;
    if (modal.getAttribute('aria-hidden') === 'false' && e.target === modal) closeStudentModal();
});

function addStudentToTable(name, studentClass) {
    console.log('Adding student:', name);
    
    let students = getData('students') || [];
    
    if (!Array.isArray(students)) {
        students = [];
    }
    
    const nextId = String(students.length + 1).padStart(3, '0');
    
    const newStudent = {
        id: nextId,
        name: name,
        class: studentClass,
        password: nextId
    };
    students.push(newStudent);
    
    if (saveData('students', students)) {
        const tableBody = document.getElementById('studentsTableBody');
        addStudentRowToTable(newStudent, tableBody);
        console.log('✓ Student added successfully');
        loadClassesFromStorage();
        updateDashboardStats();
        addActivity('👤', `New student added: ${newStudent.name} (${newStudent.class})`);
    } else {
        showNotification('Error saving student!', 'error');
    }
}

// ===========================
// DELETE STUDENT FUNCTION
// ===========================

function deleteStudentRecord(button, studentId) {
    if (confirm('Are you sure you want to delete this student?')) {
        console.log('Deleting student:', studentId);
        
        let students = getData('students') || [];
        students = students.filter(s => s.id !== studentId);
        
        let fees = getData('fees') || [];
        fees = fees.filter(f => f.studentId !== studentId);

        let contacts = getData('parentContacts') || [];
        contacts = contacts.filter(c => c.studentId !== studentId);
        let attendanceLegacy = getData('attendanceRecords') || [];
        attendanceLegacy = attendanceLegacy.filter(a => a.studentId !== studentId);
        let attendanceTeacher = getData('attendance') || [];
        attendanceTeacher = attendanceTeacher.filter(a => a.studentId !== studentId);
        
        if (saveData('students', students) && saveData('fees', fees) && saveData('parentContacts', contacts) && saveData('attendanceRecords', attendanceLegacy) && saveData('attendance', attendanceTeacher)) {
            button.closest('tr').remove();
            
            loadFeesFromStorage();
            updateFeeSummary();
            loadClassesFromStorage();
            
            const modal = document.getElementById('studentProfileModal');
            if (modal) modal.setAttribute('aria-hidden', 'true');

            showNotification('Student deleted successfully!', 'success');
            console.log('✓ Student and related records deleted');
        } else {
            showNotification('Error deleting student!', 'error');
        }
    }
}

// ===========================
// ADD TEACHER FUNCTION
// ===========================

function showAddTeacherForm() {
    const name = prompt('Enter teacher name:');
    if (name) {
        const department = prompt('Enter department:');
        const email = prompt('Enter email:');
        const phone = prompt('Enter phone number:');
        
        if (name && department && email && phone) {
            addTeacherToTable(name, department, email, phone);
            showNotification('Teacher added successfully!', 'success');
        }
    }
}

function addTeacherToTable(name, department, email, phone) {
    console.log('Adding teacher:', name);
    
    let teachers = getData('teachers') || [];
    
    if (!Array.isArray(teachers)) {
        teachers = [];
    }
    
    const nextId = 'T' + String(teachers.length + 1).padStart(3, '0');
    
    const newTeacher = {
        id: nextId,
        name: name,
        department: department,
        email: email,
        phone: phone,
        status: 'Active'
    };
    
    teachers.push(newTeacher);
    
    if (saveData('teachers', teachers)) {
        const tableBody = document.getElementById('teachersTableBody');
        addTeacherRowToTable(newTeacher, tableBody);
        console.log('✓ Teacher added successfully');
        updateDashboardStats();
        addActivity('👩‍🏫', `New teacher added: ${newTeacher.name}`);
    } else {
        showNotification('Error saving teacher!', 'error');
    }
}

// ===========================
// DELETE TEACHER FUNCTION
// ===========================

function deleteTeacherRecord(button, teacherId) {
    if (confirm('Are you sure you want to delete this teacher?')) {
        console.log('Deleting teacher:', teacherId);
        
        let teachers = getData('teachers') || [];
        teachers = teachers.filter(t => t.id !== teacherId);
        
        if (saveData('teachers', teachers)) {
            button.closest('tr').remove();
            showNotification('Teacher deleted successfully!', 'success');
            console.log('✓ Teacher deleted');
            updateDashboardStats();
        } else {
            showNotification('Error deleting teacher!', 'error');
        }
    }
}

// ===========================
// OTHER FORM FUNCTIONS
// ===========================

function showAttendanceForm() {
    // Attendance UI removed for headmaster dashboard
}

// ===========================
// UTILITY FUNCTIONS
// ===========================

function calculateGrade(marks) {
    if (marks >= 90) return 'A';
    if (marks >= 80) return 'B';
    if (marks >= 70) return 'C';
    if (marks >= 60) return 'D';
    return 'F';
}

function deleteRecord(button) {
    if (confirm('Are you sure you want to delete this record?')) {
        button.closest('tr').remove();
        showNotification('Record deleted successfully!', 'success');
    }
}

function editRecord(type) {
    showNotification(`Edit ${type} functionality would open a form`, 'info');
}

// ===========================
// FILTER FUNCTIONS
// ===========================

function initializeFilters() {
    const studentSearch = document.getElementById('studentSearch');
    const classFilter = document.getElementById('classFilter');
    const teacherSearch = document.getElementById('teacherSearch');
    const departmentFilter = document.getElementById('departmentFilter');
    const gradeClassFilter = document.getElementById('gradeClassFilter');
    const examFilter = document.getElementById('examFilter');

    if (studentSearch) {
        studentSearch.addEventListener('keyup', filterStudents);
    }
    if (classFilter) {
        classFilter.addEventListener('change', filterStudents);
    }
    if (teacherSearch) {
        teacherSearch.addEventListener('keyup', filterTeachers);
    }
    if (departmentFilter) {
        departmentFilter.addEventListener('change', filterTeachers);
    }
    if (gradeClassFilter) {
        gradeClassFilter.addEventListener('change', filterGrades);
    }
    if (examFilter) {
        examFilter.addEventListener('change', filterGrades);
    }
}

function filterStudents() {
    const searchTerm = document.getElementById('studentSearch').value.toLowerCase();
    const classFilter = document.getElementById('classFilter').value;
    const tableBody = document.getElementById('studentsTableBody');
    const rows = tableBody.querySelectorAll('tr');

    rows.forEach(row => {
        const name = row.children[1].textContent.toLowerCase();
        const className = row.children[2].textContent;

        const matchesSearch = name.includes(searchTerm);
        const matchesClass = !classFilter || className === classFilter;

        row.style.display = matchesSearch && matchesClass ? '' : 'none';
    });
}

function filterTeachers() {
    const searchTerm = document.getElementById('teacherSearch').value.toLowerCase();
    const departmentFilter = document.getElementById('departmentFilter').value;
    const tableBody = document.getElementById('teachersTableBody');
    const rows = tableBody.querySelectorAll('tr');

    rows.forEach(row => {
        const name = row.children[1].textContent.toLowerCase();
        const department = row.children[2].textContent;

        const matchesSearch = name.includes(searchTerm);
        const matchesDept = !departmentFilter || department === departmentFilter;

        row.style.display = matchesSearch && matchesDept ? '' : 'none';
    });
}

function filterGrades() {
    const classFilter = document.getElementById('gradeClassFilter').value;
    const examFilter = document.getElementById('examFilter').value;
    const tableBody = document.getElementById('gradesTableBody');
    const rows = tableBody.querySelectorAll('tr');

    rows.forEach(row => {
        const className = row.children[1].textContent;
        const examType = row.children[3].textContent;

        const matchesClass = !classFilter || className === classFilter;
        const matchesExam = !examFilter || examType.toLowerCase() === examFilter;

        row.style.display = matchesClass && matchesExam ? '' : 'none';
    });
}

// ===========================
// NOTIFICATION SYSTEM
// ===========================

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 1rem 1.5rem;
        border-radius: 8px;
        font-weight: 600;
        z-index: 9999;
        animation: slideIn 0.3s ease;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    `;

    const colors = {
        success: { bg: '#43e97b', text: 'white' },
        error: { bg: '#f5576c', text: 'white' },
        warning: { bg: '#ffa502', text: 'white' },
        info: { bg: '#4facfe', text: 'white' }
    };

    const color = colors[type] || colors.info;
    notification.style.backgroundColor = color.bg;
    notification.style.color = color.text;

    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => {
            notification.remove();
        }, 300);
    }, 3000);
}

// ===========================
// RECENT ACTIVITIES
// ===========================

function addActivity(iconEmoji, text) {
    if (!window._activities || !Array.isArray(window._activities)) window._activities = [];
    const time = new Date().toLocaleString();
    const entry = { id: String(Date.now()), icon: iconEmoji, text: text, time };
    window._activities.unshift(entry);
    if (window._activities.length > 8) window._activities = window._activities.slice(0, 8);
    saveData('activities', window._activities);
    renderActivities();
}

function renderActivities() {
    const list = document.getElementById('recentActivitiesList');
    if (!list) return;
    list.innerHTML = '';
    const activities = window._activities || [];
    
    if (activities.length === 0) {
        list.innerHTML = '<p style="color: #999; text-align: center; padding: 2rem;">No activities yet</p>';
        const clearBtn = document.getElementById('clearActivitiesBtn');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                saveData('activities', []);
                loadActivitiesFromStorage();
            });
        }
        return;
    }
    
    activities.forEach(a => {
        const item = document.createElement('div');
        item.className = 'activity-item';
        item.style.display = 'flex';
        item.style.justifyContent = 'space-between';
        item.style.alignItems = 'flex-start';
        item.style.padding = '0.75rem';
        item.style.borderBottom = '1px solid #eee';
        
        const contentDiv = document.createElement('div');
        contentDiv.style.display = 'flex';
        contentDiv.style.flex = '1';
        contentDiv.style.gap = '0.75rem';
        
        const iconSpan = document.createElement('span');
        iconSpan.className = 'activity-icon';
        iconSpan.style.fontSize = '1.5rem';
        iconSpan.textContent = a.icon;
        
        const detailsDiv = document.createElement('div');
        detailsDiv.className = 'activity-details';
        detailsDiv.style.flex = '1';
        
        const textP = document.createElement('p');
        textP.className = 'activity-text';
        textP.style.margin = '0 0 0.25rem 0';
        textP.textContent = a.text;
        
        const timeP = document.createElement('p');
        timeP.className = 'activity-time';
        timeP.style.margin = '0';
        timeP.style.fontSize = '0.85em';
        timeP.style.color = '#999';
        timeP.textContent = a.time;
        
        detailsDiv.appendChild(textP);
        detailsDiv.appendChild(timeP);
        
        contentDiv.appendChild(iconSpan);
        contentDiv.appendChild(detailsDiv);
        
        const removeBtn = document.createElement('button');
        removeBtn.innerHTML = '✕';
        removeBtn.style.background = 'none';
        removeBtn.style.border = 'none';
        removeBtn.style.cursor = 'pointer';
        removeBtn.style.fontSize = '1.2rem';
        removeBtn.style.color = '#999';
        removeBtn.style.padding = '0 0.5rem';
        removeBtn.style.marginLeft = '0.5rem';
        removeBtn.title = 'Remove activity';
        removeBtn.addEventListener('click', () => {
            removeActivity(a.id);
        });
        
        item.appendChild(contentDiv);
        item.appendChild(removeBtn);
        list.appendChild(item);
    });
    
    const clearBtn = document.getElementById('clearActivitiesBtn');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            saveData('activities', []);
            loadActivitiesFromStorage();
        });
    }
}

function removeActivity(activityId) {
    let activities = getData('activities') || [];
    activities = activities.filter(a => a.id !== activityId);
    saveData('activities', activities);
    loadActivitiesFromStorage();
}

function loadActivitiesFromStorage() {
    const activities = getData('activities') || [];
    window._activities = Array.isArray(activities) ? activities : [];
    renderActivities();
}

// ===========================
// ANIMATIONS
// ===========================

const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            opacity: 0;
            transform: translateX(100%);
        }
        to {
            opacity: 1;
            transform: translateX(0);
        }
    }

    @keyframes slideOut {
        from {
            opacity: 1;
            transform: translateX(0);
        }
        to {
            opacity: 0;
            transform: translateX(100%);
        }
    }
`;
document.head.appendChild(style);

// ===========================
// STATS ANIMATION
// ===========================

function animateStats() {
    const statValues = document.querySelectorAll('.stat-value');
    statValues.forEach(stat => {
        const finalValue = parseInt(stat.textContent);
        if (!isNaN(finalValue)) {
            animateValue(stat, 0, finalValue, 1000);
        }
    });
}

function animateValue(element, start, end, duration) {
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        const value = Math.floor(progress * (end - start) + start);
        
        if (element.textContent.includes('%')) {
            element.textContent = value + '%';
        } else {
            element.textContent = value.toLocaleString();
        }
        
        if (progress < 1) {
            requestAnimationFrame(step);
        }
    };
    requestAnimationFrame(step);
}

window.addEventListener('load', animateStats);

// ===========================
// KEYBOARD SHORTCUTS
// ===========================

document.addEventListener('keydown', function(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        const searchInput = document.querySelector('.search-input');
        if (searchInput) {
            searchInput.focus();
        }
    }
});

// ===========================
// FEE MANAGEMENT
// ===========================

function loadFeesFromStorage() {
    const fees = getData('fees') || [];
    const students = getData('students') || [];
    const totalDue = parseInt(localStorage.getItem('totalFeesDue') || '0');
    const tableBody = document.getElementById('feesTableBody');
    if (!tableBody) return;

    tableBody.innerHTML = '';

    students.forEach(student => {
        const payments = fees.filter(f => f.studentId === student.id);
        const totalPaid = payments.reduce((sum, f) => sum + (parseInt(f.amount) || 0), 0);
        const balance = totalDue - totalPaid;

        let status = 'pending';
        if (totalPaid > 0 && totalPaid < totalDue) status = 'partial';
        if (totalPaid >= totalDue && totalDue > 0) status = 'paid';

        const statusColors = {
            paid: 'status-paid',
            partial: 'status-warning',
            pending: 'status-pending'
        };
        const statusLabels = {
            paid: 'Paid',
            partial: 'Partial',
            pending: 'Pending'
        };

        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${student.id}</td>
            <td>${student.name}</td>
            <td>${student.class}</td>
            <td>$${totalPaid} / $${totalDue}</td>
            <td><span class="status-badge ${statusColors[status]}">${statusLabels[status]}</span></td>
            <td>$${Math.max(0, balance)}</td>
            <td>
                <button class="btn-small btn-info" onclick="viewStudentFeeHistory('${student.id}')">History</button>
                <button class="btn-small btn-warning" onclick="updateFeeStatus('${student.id}')">+ Payment</button>
                <button class="btn-small btn-secondary" onclick="editStudentFees('${student.id}')">✏ Edit</button>
            </td>
        `;
        tableBody.appendChild(row);
    });

    updateFeeSummary();
}

// ===========================
// EDIT FEE RECORD
// ===========================

function editStudentFees(studentId) {
    const students = getData('students') || [];
    const student = students.find(s => s.id === studentId);
    if (!student) return showNotification('Student not found!', 'error');

    let fees = getData('fees') || [];
    const payments = fees.filter(f => f.studentId === studentId);
    const totalDue = parseInt(localStorage.getItem('totalFeesDue') || '0');
    const totalPaid = payments.reduce((sum, f) => sum + (parseInt(f.amount) || 0), 0);

    if (payments.length === 0) {
        showNotification(`${student.name} has no payment records to edit.`, 'info');
        return;
    }

    // Build a numbered list of payments to choose from
    const paymentList = payments.map((p, i) =>
        `${i + 1}. $${p.amount} — ${p.term || ''} ${p.year || ''} — ${p.datePaid || 'N/A'}`
    ).join('\n');

    const action = prompt(
        `Edit Fees for: ${student.name}\n` +
        `Total Paid: $${totalPaid} / $${totalDue}\n\n` +
        `Payment Records:\n${paymentList}\n\n` +
        `Enter the number of the payment to REMOVE,\n` +
        `or type "all" to clear ALL payments for this student,\n` +
        `or press Cancel to go back.`
    );

    if (!action) return; // cancelled

    if (action.trim().toLowerCase() === 'all') {
        // Confirm before wiping all payments
        if (!confirm(`Remove ALL ${payments.length} payment record(s) for ${student.name}? This cannot be undone.`)) return;

        fees = fees.filter(f => f.studentId !== studentId);
        if (saveData('fees', fees)) {
            loadFeesFromStorage();
            updateFeeSummary();
            addActivity('✏️', `Cleared all fee records for ${student.name}`);
            showNotification(`All fee records cleared for ${student.name}.`, 'success');
        } else {
            showNotification('Error clearing fee records!', 'error');
        }
        return;
    }

    // Remove a single payment by number
    const idx = parseInt(action) - 1;
    if (isNaN(idx) || idx < 0 || idx >= payments.length) {
        showNotification('Invalid selection. Please enter a valid number.', 'error');
        return;
    }

    const targetPayment = payments[idx];
    if (!confirm(`Remove payment of $${targetPayment.amount} (${targetPayment.term || ''} ${targetPayment.year || ''}, ${targetPayment.datePaid || 'N/A'}) for ${student.name}?`)) return;

    fees = fees.filter(f => f.id !== targetPayment.id);
    if (saveData('fees', fees)) {
        loadFeesFromStorage();
        updateFeeSummary();
        addActivity('✏️', `Removed $${targetPayment.amount} payment for ${student.name}`);
        showNotification(`Payment of $${targetPayment.amount} removed for ${student.name}.`, 'success');
    } else {
        showNotification('Error removing payment!', 'error');
    }
}
 
function showMarkFeeForm() {
    const students = getData('students') || [];
    if (students.length === 0) { showNotification('No students in the system yet!', 'warning'); return; }

    let studentOptions = students.map((s, i) => `${i+1}. ${s.name} (${s.class})`).join('\n');
    const studentChoice = prompt('Select student by number:\n\n' + studentOptions);
    if (!studentChoice) return;

    const studentIndex = parseInt(studentChoice) - 1;
    if (studentIndex < 0 || studentIndex >= students.length) { showNotification('Invalid selection!', 'error'); return; }

    const selectedStudent = students[studentIndex];

    const fees = getData('fees') || [];
    const totalDue = parseInt(localStorage.getItem('totalFeesDue') || '0');
    const payments = fees.filter(f => f.studentId === selectedStudent.id);
    const totalPaid = payments.reduce((sum, f) => sum + (parseInt(f.amount) || 0), 0);
    const balance = totalDue - totalPaid;

    const term = prompt(`Term (e.g. Term 1, Term 2):`);
    if (!term) return;

    const year = prompt(`Year (e.g. 2026):`) || new Date().getFullYear().toString();

    const amount = prompt(
        `Recording payment for: ${selectedStudent.name}\n` +
        `Total Due: $${totalDue}\n` +
        `Total Paid so far: $${totalPaid}\n` +
        `Balance: $${balance}\n\n` +
        `Enter amount being paid now:`
    );

    if (amount && !isNaN(amount) && parseInt(amount) > 0) {
        markFeePaid(selectedStudent, amount, term, year);
    } else {
        showNotification('Invalid amount', 'error');
    }
}

function markFeePaid(student, amount, term, year) {
    let fees = getData('fees') || [];
    if (!Array.isArray(fees)) fees = [];

    const totalDue = parseInt(localStorage.getItem('totalFeesDue') || '0');
    const payments = fees.filter(f => f.studentId === student.id);
    const totalPaidBefore = payments.reduce((sum, f) => sum + (parseInt(f.amount) || 0), 0);
    const totalPaidAfter = totalPaidBefore + parseInt(amount);

    let status = 'partial';
    if (totalPaidAfter >= totalDue) status = 'paid';
    if (totalPaidAfter === 0) status = 'pending';

    const today = new Date();
    const datePaid = (today.getMonth()+1).toString().padStart(2,'0') + '/' +
                     today.getDate().toString().padStart(2,'0') + '/' +
                     today.getFullYear();

    const newFee = {
        id: 'F' + Date.now(),
        studentId: student.id,
        studentName: student.name,
        class: student.class,
        amount: parseInt(amount),
        status: 'paid',
        term: term || '',
        year: year || today.getFullYear().toString(),
        datePaid: datePaid
    };

    fees.push(newFee);

    if (saveData('fees', fees)) {
        loadFeesFromStorage();
        updateFeeSummary();
        const balance = totalDue - totalPaidAfter;
        const msg = balance <= 0
            ? `✅ Fully paid! ${student.name} has paid all fees.`
            : `💰 Payment recorded! Balance remaining: $${balance}`;
        showNotification(msg, balance <= 0 ? 'success' : 'info');
        addActivity('💰', `Fee payment: ${student.name} — $${amount} (${term} ${year})`);
    } else {
        showNotification('Error saving fee record!', 'error');
    }
}

function deleteFeeRecord(button, studentId) {
    if (confirm('Delete this fee record?')) {
        console.log('Deleting fee for student:', studentId);
        
        let fees = getData('fees') || [];
        fees = fees.filter(f => f.studentId !== studentId);
        
        if (saveData('fees', fees)) {
            button.closest('tr').remove();
            updateFeeSummary();
            showNotification('Fee record deleted!', 'success');
            console.log('✓ Fee deleted');
        } else {
            showNotification('Error deleting fee record!', 'error');
        }
    }
}

async function saveTotalFees() {
    const amount = document.getElementById('totalFeesInput').value;
    if (!amount || isNaN(amount)) { showNotification('Enter a valid amount', 'warning'); return; }
    
    try {
        await fetch('http://localhost:3000/api/teacher/fee-settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
            body: JSON.stringify({ totalDue: parseInt(amount) })
        });
        localStorage.setItem('totalFeesDue', amount);
        document.getElementById('currentTotalFees').textContent = `Current: $${amount}`;
        showNotification('Total fees saved!', 'success');
        loadFeesFromStorage();
    } catch(e) {
        showNotification('Error saving fees setting', 'error');
    }
}

function loadTotalFees() {
    const saved = localStorage.getItem('totalFeesDue');
    if (saved) {
        const el = document.getElementById('currentTotalFees');
        if (el) el.textContent = `Current: $${saved}`;
        const input = document.getElementById('totalFeesInput');
        if (input) input.value = saved;
    }
}

function updateFeeSummary() {
    const fees = getData('fees') || [];
    const students = getData('students') || [];
    const totalDue = parseInt(localStorage.getItem('totalFeesDue') || '0');
    const totalCount = students.length;

    // Sum all payment amounts recorded
    let totalCollected = 0;
    fees.forEach(fee => {
        totalCollected += parseInt(fee.amount) || 0;
    });

    // Count students who have fully paid (their total payments >= totalDue)
    let fullyPaidCount = 0;
    students.forEach(student => {
        const studentPayments = fees.filter(f => f.studentId === student.id);
        const studentTotal = studentPayments.reduce((sum, f) => sum + (parseInt(f.amount) || 0), 0);
        if (totalDue > 0 && studentTotal >= totalDue) fullyPaidCount++;
    });

    // Outstanding = total expected - total collected, floored at 0
    const totalExpected = totalDue * totalCount;
    const totalOutstanding = Math.max(0, totalExpected - totalCollected);

    // Collection rate as % of total expected, capped hard at 100%
    let collectionRate = 0;
    if (totalExpected > 0) {
        collectionRate = Math.min(100, parseFloat(((totalCollected / totalExpected) * 100).toFixed(1)));
    }

    // Update text elements
    const totalFeesElement = document.getElementById('totalFeesCollected');
    const pendingFeesElement = document.getElementById('totalFeesPending');
    const rateElement = document.getElementById('feeCollectionRate');
    const fullyPaidElement = document.getElementById('fullyPaidCount');

    if (totalFeesElement) totalFeesElement.textContent = formatCurrency(totalCollected.toString());
    if (pendingFeesElement) pendingFeesElement.textContent = formatCurrency(totalOutstanding.toString());
    if (rateElement) rateElement.textContent = collectionRate + '%';
    if (fullyPaidElement) fullyPaidElement.textContent = fullyPaidCount + ' / ' + totalCount + ' students fully paid';

    // Animate progress bar (colour shifts green as rate improves)
    const progressBar = document.getElementById('feeCollectionBar');
    const progressLabel = document.getElementById('feeCollectionRateBar');
    if (progressBar) {
        progressBar.style.transition = 'width 0.8s ease';
        progressBar.style.width = collectionRate + '%';
        if (collectionRate >= 75) progressBar.style.background = '#43e97b';
        else if (collectionRate >= 40) progressBar.style.background = '#ffa502';
        else progressBar.style.background = '#f5576c';
    }
    if (progressLabel) progressLabel.textContent = collectionRate + '%';

    console.log('Fee Summary — Collected: ' + formatCurrency(totalCollected.toString()) + ' | Outstanding: ' + formatCurrency(totalOutstanding.toString()) + ' | Rate: ' + collectionRate + '%');
}

function updateFeeClassSummary(className) {
    const summaryEl = document.getElementById('feeClassSummary');
    const body = document.getElementById('feeClassSummaryBody');
    if (!summaryEl || !body) return;

    if (!className) {
        summaryEl.style.display = 'none';
        body.innerHTML = 'Select a class to view paid/pending students.';
        return;
    }

    const students = (getData('students') || []).filter(s => s.class === className);
    const fees = getData('fees') || [];

    const paid = [];
    const pending = [];

    students.forEach(s => {
        const fee = fees.find(f => f.studentId === s.id);
        if (fee && fee.status === 'paid') paid.push(`${s.name} (${formatCurrency(fee.amount)})`);
        else pending.push(s.name);
    });

    let html = `<p><strong>Class:</strong> ${className}</p>`;
    html += `<p><strong>Total students:</strong> ${students.length}</p>`;
    html += `<p><strong>Paid:</strong> ${paid.length}</p>`;
    if (paid.length > 0) html += `<p>${paid.join(', ')}</p>`;
    html += `<p><strong>Pending:</strong> ${pending.length}</p>`;
    if (pending.length > 0) html += `<p>${pending.join(', ')}</p>`;

    body.innerHTML = html;
    summaryEl.style.display = 'block';
}

function viewStudentFeeHistory(studentId) {
    const students = getData('students') || [];
    const student = students.find(s => s.id === studentId);
    if (!student) return;

    const fees = getData('fees') || [];
    const payments = fees.filter(f => f.studentId === studentId)
                         .sort((a, b) => new Date(b.datePaid) - new Date(a.datePaid));
    const totalDue = parseInt(localStorage.getItem('totalFeesDue') || '0');
    const totalPaid = payments.reduce((sum, f) => sum + (parseInt(f.amount) || 0), 0);
    const balance = totalDue - totalPaid;

    let html = `${student.name} — Fee History\n\n`;
    html += `Total Due: $${totalDue} | Total Paid: $${totalPaid} | Balance: $${Math.max(0, balance)}\n\n`;

    if (payments.length === 0) {
        html += 'No payments recorded yet.';
    } else {
        html += payments.map(p =>
            `• $${p.amount} — ${p.term || ''} ${p.year || ''} — ${p.datePaid}`
        ).join('\n');
    }

    alert(html);
}

// ===========================
// TIMETABLE MANAGEMENT
// ===========================

function loadTimetablesFromStorage() {
    console.log('Loading timetables...');
    const timetables = getData('timetables') || [];
    window._timetables = timetables;
    console.log('✓ Timetables loaded:', timetables.length);
}

function populateTimetableClassSelect() {
    const select = document.getElementById('timetableClassSelect');
    if (!select) return;

    const classes = getData('classes') || window._classes || [];

    select.innerHTML = '<option value="">Select Class</option>';
    classes.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.name;
        opt.textContent = c.name;
        select.appendChild(opt);
    });
}

function populateClassFilter() {
    const select = document.getElementById('classFilter');
    if (!select) return;

    const classes = getData('classes') || window._classes || [];
    const current = select.value || '';
    select.innerHTML = '';
    const defaultOpt = document.createElement('option');
    defaultOpt.value = '';
    defaultOpt.textContent = 'All Classes';
    select.appendChild(defaultOpt);

    classes.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.name;
        opt.textContent = c.name;
        select.appendChild(opt);
    });

    if (current) select.value = current;
    populateFeeClassFilter();
    populateStudentClassSelect();
}

function populateFeeClassFilter() {
    const select = document.getElementById('feeClassFilter');
    if (!select) return;

    const classes = getData('classes') || window._classes || [];
    const current = select.value || '';
    select.innerHTML = '';
    const defaultOpt = document.createElement('option');
    defaultOpt.value = '';
    defaultOpt.textContent = 'All Classes';
    select.appendChild(defaultOpt);

    classes.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.name;
        opt.textContent = c.name;
        select.appendChild(opt);
    });

    if (current) select.value = current;
}

function addTimetableEntry(entry) {
    let timetables = getData('timetables') || [];
    if (!Array.isArray(timetables)) timetables = [];

    const id = String(timetables.length + 1).padStart(3, '0');
    const newEntry = { id, ...entry };
    timetables.push(newEntry);

    if (saveData('timetables', timetables)) {
        window._timetables = timetables;
        showNotification('Timetable entry saved', 'success');
        addActivity('🗓️', `Timetable: ${entry.teacher} → ${entry.class} (${entry.subject}, ${entry.day} ${entry.start}-${entry.end})`);
        const classSelect = document.getElementById('timetableClassSelect');
        if (classSelect) renderTimetableForClass(classSelect.value);
    } else {
        showNotification('Error saving timetable', 'error');
    }
}

function renderTimetableForClass(className) {
    const tbody = document.getElementById('timetableTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const timetables = window._timetables || getData('timetables') || [];
    const entries = timetables.filter(t => t.class === className);

    if (entries.length === 0) {
        const r = document.createElement('tr');
        r.innerHTML = '<td colspan="7">No timetable entries for this class.</td>';
        tbody.appendChild(r);
        return;
    }

    entries.forEach(e => {
        const r = document.createElement('tr');
        r.innerHTML = `
            <td>${e.id}</td>
            <td>${e.day}</td>
            <td>${e.start}</td>
            <td>${e.end}</td>
            <td>${e.subject}</td>
            <td>${e.teacher}</td>
            <td>
                <button class="btn-small btn-warning" onclick="editTimetableEntry('${e.id}')">Edit</button>
                <button class="btn-small btn-danger" onclick="deleteTimetableEntry(this, '${e.id}')">Delete</button>
            </td>
        `;
        tbody.appendChild(r);
    });
}

function editTimetableEntry(id) {
    let timetables = getData('timetables') || [];
    const idx = timetables.findIndex(t => t.id === id);
    if (idx === -1) return showNotification('Entry not found', 'error');

    const current = timetables[idx];
    const day = prompt('Day:', current.day) || current.day;
    const start = prompt('Start time:', current.start) || current.start;
    const end = prompt('End time:', current.end) || current.end;
    const teacher = prompt('Teacher:', current.teacher) || current.teacher;
    const subject = prompt('Subject:', current.subject) || current.subject;

    timetables[idx] = { ...current, day, start, end, teacher, subject };
    if (saveData('timetables', timetables)) {
        window._timetables = timetables;
        showNotification('Timetable updated', 'success');
        const classSelect = document.getElementById('timetableClassSelect');
        if (classSelect) renderTimetableForClass(classSelect.value);
    } else {
        showNotification('Error updating timetable', 'error');
    }
}

function deleteTimetableEntry(button, id) {
    if (!confirm('Delete this timetable entry?')) return;
    let timetables = getData('timetables') || [];
    timetables = timetables.filter(t => t.id !== id);
    if (saveData('timetables', timetables)) {
        button.closest('tr').remove();
        window._timetables = timetables;
        showNotification('Entry deleted', 'success');
    } else {
        showNotification('Error deleting entry', 'error');
    }
}

function updateFeeStatus(studentId) {
    openPaymentModal(studentId);
}

// ===========================
// PAYMENT MODAL
// ===========================

function openPaymentModal(studentId) {
    const students = getData('students') || [];
    const student = students.find(s => s.id === studentId);
    if (!student) { showNotification('Student not found!', 'error'); return; }

    const fees = getData('fees') || [];
    const totalDue = parseInt(localStorage.getItem('totalFeesDue') || '0');
    const payments = fees.filter(f => f.studentId === student.id);
    const totalPaid = payments.reduce((sum, f) => sum + (parseInt(f.amount) || 0), 0);
    const balance = Math.max(0, totalDue - totalPaid);

    // Populate modal fields
    document.getElementById('paymentModalStudentName').textContent = student.name;
    document.getElementById('paymentModalClass').textContent = student.class;
    document.getElementById('paymentModalTotalDue').textContent = formatCurrency(totalDue.toString());
    document.getElementById('paymentModalTotalPaid').textContent = formatCurrency(totalPaid.toString());
    document.getElementById('paymentModalBalance').textContent = formatCurrency(balance.toString());
    document.getElementById('paymentModalBalance').style.color = balance <= 0 ? '#43e97b' : '#f5576c';

    // Suggest the remaining balance as default amount
    const amountInput = document.getElementById('paymentModalAmount');
    amountInput.value = balance > 0 ? balance : '';
    amountInput.max = balance > 0 ? balance : '';

    // Set default year
    document.getElementById('paymentModalYear').value = new Date().getFullYear();
    document.getElementById('paymentModalTerm').value = '';

    // Store studentId on the modal for submission
    document.getElementById('paymentModal').dataset.studentId = studentId;

    // Show payment history inside modal
    const historyBody = document.getElementById('paymentModalHistory');
    historyBody.innerHTML = '';
    if (payments.length === 0) {
        historyBody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#999; padding:12px;">No payments yet</td></tr>';
    } else {
        payments.slice().reverse().forEach(p => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="padding:8px;">${formatCurrency(p.amount.toString())}</td>
                <td style="padding:8px;">${p.term || '—'}</td>
                <td style="padding:8px;">${p.year || '—'}</td>
                <td style="padding:8px; color:#888;">${p.datePaid || '—'}</td>
            `;
            historyBody.appendChild(tr);
        });
    }

    document.getElementById('paymentModal').setAttribute('aria-hidden', 'false');
}

function closePaymentModal() {
    document.getElementById('paymentModal').setAttribute('aria-hidden', 'true');
}

function submitPaymentModal() {
    const studentId = document.getElementById('paymentModal').dataset.studentId;
    const students = getData('students') || [];
    const student = students.find(s => s.id === studentId);
    if (!student) return;

    const amount = parseInt(document.getElementById('paymentModalAmount').value);
    const term = document.getElementById('paymentModalTerm').value.trim();
    const year = document.getElementById('paymentModalYear').value.trim() || new Date().getFullYear().toString();

    if (!amount || amount <= 0) { showNotification('Please enter a valid amount', 'warning'); return; }
    if (!term) { showNotification('Please enter a term (e.g. Term 1)', 'warning'); return; }

    markFeePaid(student, amount, term, year);
    closePaymentModal();
}

// Close modal when clicking outside
document.addEventListener('click', function(e) {
    const modal = document.getElementById('paymentModal');
    if (!modal) return;
    if (modal.getAttribute('aria-hidden') === 'false' && e.target === modal) closePaymentModal();
});

// Initialize fee filters
setTimeout(() => {
    const feeSearch = document.getElementById('feeSearch');
    const feeStatusFilter = document.getElementById('feeStatusFilter');
    const feeClassFilter = document.getElementById('feeClassFilter');
    
    if (feeSearch) {
        feeSearch.addEventListener('keyup', filterFees);
    }
    if (feeStatusFilter) {
        feeStatusFilter.addEventListener('change', filterFees);
    }
    if (feeClassFilter) {
        feeClassFilter.addEventListener('change', function() {
            filterFees();
            updateFeeClassSummary(this.value);
        });
    }
}, 500);

function filterFees() {
    const searchTerm = document.getElementById('feeSearch')?.value.toLowerCase() || '';
    const statusFilter = document.getElementById('feeStatusFilter')?.value || '';
    const classFilter = document.getElementById('feeClassFilter')?.value || '';
    const tableBody = document.getElementById('feesTableBody');
    
    if (!tableBody) return;
    
    const rows = tableBody.querySelectorAll('tr');

    rows.forEach(row => {
        const name = row.children[1].textContent.toLowerCase();
        const cls = row.children[2].textContent;
        const status = row.children[4].textContent.toLowerCase();

        const matchesSearch = name.includes(searchTerm);
        const matchesStatus = !statusFilter || status.includes(statusFilter);
        const matchesClass = !classFilter || cls === classFilter;

        row.style.display = matchesSearch && matchesStatus && matchesClass ? '' : 'none';
    });
}

// ===========================
// EXPORT & PRINT
// ===========================

function exportTableToCSV(tableId, filename = 'export.csv') {
    const table = document.getElementById(tableId);
    let csv = [];
    
    const headers = [];
    table.querySelectorAll('th').forEach(header => {
        headers.push(header.textContent);
    });
    csv.push(headers.join(','));
    
    table.querySelectorAll('tbody tr').forEach(row => {
        const rowData = [];
        row.querySelectorAll('td').forEach((cell, index) => {
            if (index < headers.length - 1) {
                rowData.push('"' + cell.textContent.replace(/"/g, '""') + '"');
            }
        });
        csv.push(rowData.join(','));
    });
    
    const csvContent = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv.join('\n'));
    const link = document.createElement('a');
    link.setAttribute('href', csvContent);
    link.setAttribute('download', filename);
    link.click();
}

function printTable(tableId) {
    const printWindow = window.open('', '_blank');
    const table = document.getElementById(tableId);
    printWindow.document.write('<html><head><title>Print</title>');
    printWindow.document.write('<style>table { border-collapse: collapse; width: 100%; }');
    printWindow.document.write('th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }');
    printWindow.document.write('th { background-color: #667eea; color: white; }</style>');
    printWindow.document.write('</head><body>');
    printWindow.document.write(table.outerHTML);
    printWindow.document.write('</body></html>');
    printWindow.document.close();
    printWindow.print();
}