 // student-dashboard.js

const API = 'https://step-by-step-production-ad72.up.railway.app';

// ── AUTH CHECK ──
const currentUser = JSON.parse(localStorage.getItem('currentUser'));
const authToken   = localStorage.getItem('authToken');

if (!currentUser || currentUser.role !== 'student') {
  window.location.href = 'login.html';
}

// Fill sidebar info
document.getElementById('sidebarName').textContent = currentUser.name || 'Student';
document.getElementById('sidebarId').textContent   = currentUser.studentId || '';
document.getElementById('welcomeName').textContent  = (currentUser.name || 'Student').split(' ')[0];

// ── NAVIGATION ──
function showPage(name, btn) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + name).classList.add('active');
  btn.classList.add('active');

  if (name === 'work')          loadWork();
  if (name === 'grades')        loadGrades();
  if (name === 'timetable')     loadTimetable();
  if (name === 'fees')          loadFees();
  if (name === 'announcements') loadAnnouncements();
}

function logout() {
  localStorage.removeItem('currentUser');
  localStorage.removeItem('authToken');
  window.location.href = 'login.html';
}

// ── HELPERS ──
function getData(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch(e) { return null; }
}

function getBadge(status) {
  const map = {
    pending:   '<span class="badge badge-pending">Pending</span>',
    received:  '<span class="badge badge-submitted">Received</span>',
    overdue:   '<span class="badge badge-overdue">Overdue</span>'
  };
  return map[status] || map.pending;
}

function isOverdue(dueDate, status) {
  if (status === 'received') return false;
  return new Date(dueDate) < new Date();
}

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });
}

function getGradeLetter(score) {
  if (score >= 75) return 'A';
  if (score >= 60) return 'B';
  if (score >= 50) return 'C';
  return 'F';
}

function getGradeClass(score) {
  if (score >= 75) return 'grade-a';
  if (score >= 60) return 'grade-b';
  if (score >= 50) return 'grade-c';
  return 'grade-f';
}

// ── CHECK IF STUDENT HAS FULLY PAID ──
async function hasFullyPaid() {
  try {
    const res = await fetch(API + '/api/teacher/student-fees?studentId=' + currentUser.id, {
      headers: { 'Authorization': 'Bearer ' + authToken }
    });
    const data = await res.json();
    const totalDue  = data.totalDue  || 0;
    const totalPaid = data.totalPaid || 0;
    return totalDue > 0 && totalPaid >= totalDue;
  } catch(e) {
    console.warn('Could not check fees:', e);
    return false;
  }
}

// ── GET STUDENT'S WORK (fallback) ──
function getMyWork() {
  const allWork = getData('work') || [];
  const myId    = currentUser.id;
  const subs    = getData('submissions_' + myId) || {};

  return allWork
    .filter(w => w.studentIds && w.studentIds.includes(myId))
    .map(w => {
      let status = subs[w.id] || 'pending';
      if (status === 'pending' && isOverdue(w.dueDate, status)) status = 'overdue';
      return { ...w, status };
    })
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
}

async function loadFromBackend() {
  try {
    const res = await fetch(API + '/api/sync', {
      headers: { 'Authorization': 'Bearer ' + authToken }
    });
    const data = await res.json();
    Object.entries(data).forEach(([key, value]) => {
      if (value && value.length > 0) {
        localStorage.setItem(key, JSON.stringify(value));
      }
    });
  } catch(e) {
    console.warn('Could not load from backend:', e);
  }
}

// Load data then initialize
loadFromBackend().then(() => {
  loadOverview();
});

// ── OVERVIEW ──
function loadOverview() {
  const myWork    = getMyWork();
  const pending   = myWork.filter(w => w.status === 'pending' || w.status === 'overdue').length;
  const received  = myWork.filter(w => w.status === 'received').length;
  const anns      = (getData('announcements') || []).length;

  document.getElementById('statPending').textContent       = pending;
  document.getElementById('statSubmitted').textContent     = received;
  document.getElementById('statAnnouncements').textContent = anns;

  const overviewWork = document.getElementById('overviewWork');
  const recent       = myWork.slice(0, 3);

  if (recent.length === 0) {
    overviewWork.innerHTML = '<div class="empty"><div class="empty-icon">📭</div><p>No work assigned yet</p></div>';
  } else {
    overviewWork.innerHTML = recent.map(w => `
      <div class="overview-work-item">
        <div>
          <div class="work-title">${w.title}</div>
          <div class="work-meta">Due ${formatDate(w.dueDate)}</div>
        </div>
        ${getBadge(w.status)}
      </div>
    `).join('') + `<button class="btn btn-outline btn-sm" style="margin-top:12px;width:100%;" onclick="showPage('work', document.querySelectorAll('.nav-item')[1])">View All Work →</button>`;
  }

  const annsEl  = document.getElementById('overviewAnnouncements');
  const allAnns = (getData('announcements') || []).slice(0, 3);

  if (allAnns.length === 0) {
    annsEl.innerHTML = '<div class="empty"><div class="empty-icon">📭</div><p>No announcements</p></div>';
  } else {
    annsEl.innerHTML = allAnns.map(a => `
      <div class="overview-ann-item">
        <div class="work-title">${a.title}</div>
        <div class="work-meta">${(a.body || '').substring(0, 80)}${(a.body || '').length > 80 ? '...' : ''}</div>
      </div>
    `).join('');
  }
}

// ── WORK PAGE ──
let allMyWork = [];

async function loadWork() {
  try {
    const studentId = currentUser.id;
    const res = await fetch(API + '/api/teacher/student-work?studentId=' + studentId, {
      headers: { 'Authorization': 'Bearer ' + authToken }
    });
    const data = await res.json();
    const subs = getData('submissions_' + studentId) || {};
    allMyWork = (data.work || []).map(w => {
      let status = subs[w.id] || 'pending';
      if (status === 'pending' && isOverdue(w.dueDate, status)) status = 'overdue';
      return { ...w, status };
    }).sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
    renderWork(allMyWork);
  } catch(e) {
    console.error('Failed to load work:', e);
    allMyWork = getMyWork();
    renderWork(allMyWork);
  }
}

function renderWork(items) {
  const list = document.getElementById('workList');

  if (items.length === 0) {
    list.innerHTML = '<div class="empty"><div class="empty-icon">📭</div><p>No work found</p></div>';
    return;
  }

  list.innerHTML = items.map(w => `
    <div class="work-card" id="wcard-${w.id}">
      <div style="flex:1;">
        <div class="work-title">${w.title}</div>
        <div class="work-meta">Due: ${formatDate(w.dueDate)}</div>
      </div>
      ${getBadge(w.status)}
      <div class="work-actions">
        ${w.filePath ? `<button class="btn btn-outline btn-sm" onclick="downloadWork('${w.id}')">⬇ Download</button>` : ''}
        ${w.status !== 'received' ? `<button class="btn btn-success btn-sm" onclick="markReceived('${w.id}', '${w.title}')">✅ Received</button>` : '<span style="color:var(--accent2);font-size:13px;">✔ Received</span>'}
      </div>
    </div>
  `).join('');
}

function filterWork(filter, btn) {
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const filtered = filter === 'all' ? allMyWork : allMyWork.filter(w => w.status === filter);
  renderWork(filtered);
}

// ── DOWNLOAD (with fee gate) ──
async function downloadWork(workId) {
  const paid = await hasFullyPaid();
  if (!paid) {
    // Show a nice modal/alert instead of raw alert
    showFeeWarning();
    return;
  }
  const token = localStorage.getItem('authToken');
  window.open(API + '/api/teacher/download/' + workId + '?token=' + token, '_blank');
}

function showFeeWarning() {
  // Try to find an existing modal, else use alert
  const modal = document.getElementById('feeWarningModal');
  if (modal) {
    modal.classList.add('open');
  } else {
    alert('⚠️ You cannot download this work.\n\nPlease fully pay your school fees to access downloads.\n\nContact the admin or your teacher for assistance.');
  }
}

function closeFeeWarning() {
  const modal = document.getElementById('feeWarningModal');
  if (modal) modal.classList.remove('open');
}

// ── MARK RECEIVED ──
// Replace your markReceived function in student-dashboard.js with this:

async function markReceived(workId, title) {
  if (!confirm(`Mark "${title}" as received?`)) return;

  const myId = currentUser.id;

  // Save locally first
  const subs = getData('submissions_' + myId) || {};
  subs[workId] = 'received';
  localStorage.setItem('submissions_' + myId, JSON.stringify(subs));

  // Build submissions array
  let allSubmissions = [];
  try { allSubmissions = JSON.parse(localStorage.getItem('submissions')) || []; } catch(e){}
  if (!Array.isArray(allSubmissions)) allSubmissions = [];

  // Remove old entry for this student+work, then add new one
  allSubmissions = allSubmissions.filter(s => !(s.workId === workId && s.studentId === myId));
  allSubmissions.push({
    workId,
    studentId: myId,
    studentName: currentUser.name,
    className: currentUser.className,
    status: 'received',
    receivedAt: new Date().toISOString()
  });
  localStorage.setItem('submissions', JSON.stringify(allSubmissions));

  // Sync to backend with detailed error logging
  try {
    const payload = { key: 'submissions', data: allSubmissions };
    console.log('Syncing submissions payload:', JSON.stringify(payload).substring(0, 200));

    const syncRes = await fetch(API + '/api/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + authToken
      },
      body: JSON.stringify(payload)
    });

    if (!syncRes.ok) {
      const errText = await syncRes.text();
      console.error('Sync failed:', syncRes.status, errText);
    } else {
      console.log('Submissions synced successfully');
    }
  } catch(e) {
    console.warn('Sync submissions failed:', e);
  }

  loadWork();
  loadOverview();
}
// ── GRADES ──
function loadGrades() {
  const students = getData('students') || [];
  const student  = students.find(s => s.id === currentUser.id);
  const grades   = (student && student.grades) ? student.grades : [];
  const tbody    = document.getElementById('gradesBody');

  if (grades.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5">
      <div class="empty"><div class="empty-icon">📊</div><p>No grades recorded yet</p></div>
    </td></tr>`;
    return;
  }

  tbody.innerHTML = grades.map(g => {
    const letter = getGradeLetter(g.score);
    const cls    = getGradeClass(g.score);
    return `
      <tr>
        <td><strong>${g.subject}</strong></td>
        <td><div class="grade-pill ${cls}">${letter}</div></td>
        <td style="font-family:var(--mono);font-weight:600;">${g.score}%</td>
        <td style="color:var(--muted);">${g.term || '—'}</td>
        <td style="width:160px;">
          <div style="font-size:12px;color:var(--muted);">${g.score}%</div>
          <div class="progress-bar">
            <div class="progress-fill" style="width:${g.score}%;background:${g.score >= 75 ? 'var(--accent2)' : g.score >= 50 ? 'var(--accent)' : 'var(--danger)'}"></div>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// ── TIMETABLE ──
function loadTimetable() {
  const timetables = getData('studentTimetables') || [];
  const grid = document.getElementById('timetableGrid');
  if (!grid) return;

  const myEntries = timetables.filter(t => t.class === currentUser.className);

  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

  if (myEntries.length === 0) {
    grid.innerHTML = `<div class="empty" style="grid-column:1/-1">
      <div class="empty-icon">🗓️</div>
      <p>No timetable set for your class yet</p>
    </div>`;
    return;
  }

  const times = [...new Set(myEntries.map(e => e.start))].sort();

  grid.style.display = 'grid';
  grid.style.gridTemplateColumns = '80px repeat(5, 1fr)';
  grid.style.gridAutoRows = '75px';
  grid.style.gap = '4px';
  grid.style.width = '100%';

  let html = '<div class="tt-header" style="height:40px;grid-row:span 1"></div>';
  days.forEach(d => { html += `<div class="tt-header" style="height:40px;">${d}</div>`; });

  times.forEach(time => {
    html += `<div class="tt-time">${time}</div>`;
    days.forEach(day => {
      const slot = myEntries.find(e => e.day === day && e.start === time);
      if (slot) {
        html += `
          <div class="tt-cell has-class">
            <div class="subject">${slot.subject}</div>
            <div class="teacher-name">👤 ${slot.teacher}</div>
            <div class="teacher-name">🕐 ${slot.start} - ${slot.end}</div>
            <div class="teacher-name">🚪 Room ${slot.room || '-'}</div>
          </div>`;
      } else {
        html += `<div class="tt-cell"></div>`;
      }
    });
  });

  grid.innerHTML = html;
}

// ── FEES ──
async function loadFees() {
  const container = document.getElementById('feesContainer');
  if (!container) return;
  container.innerHTML = '<div class="loading"><div class="spinner"></div> Loading...</div>';

  try {
    const studentId = currentUser.id;
    const res = await fetch(API + '/api/teacher/student-fees?studentId=' + studentId, {
      headers: { 'Authorization': 'Bearer ' + authToken }
    });
    const data = await res.json();

    const totalDue  = data.totalDue  || 0;
    const totalPaid = data.totalPaid || 0;
    const balance   = Math.max(0, data.balance || 0);

    const balanceColor = balance <= 0 ? '#43e97b' : '#f5576c';
    const statusText   = totalPaid >= totalDue && totalDue > 0
                           ? '✅ Fully Paid'
                           : totalPaid > 0
                             ? '⚠️ Partial'
                             : '❌ Unpaid';
    const statusColor  = totalPaid >= totalDue && totalDue > 0
                           ? '#43e97b'
                           : totalPaid > 0
                             ? '#ffa502'
                             : '#f5576c';

    container.innerHTML = `
      <div style="display:flex; gap:1rem; flex-wrap:wrap; margin-bottom:1.5rem;">
        <div style="flex:1; min-width:140px; background:#f0f4ff; padding:1.2rem; border-radius:10px; text-align:center;">
          <div style="font-size:0.85rem; color:#666; margin-bottom:4px;">Total Fees Due</div>
          <div style="font-size:2rem; font-weight:700; color:#333;">$${totalDue}</div>
        </div>
        <div style="flex:1; min-width:140px; background:#f0fff4; padding:1.2rem; border-radius:10px; text-align:center;">
          <div style="font-size:0.85rem; color:#666; margin-bottom:4px;">Total Paid</div>
          <div style="font-size:2rem; font-weight:700; color:#43e97b;">$${totalPaid}</div>
        </div>
        <div style="flex:1; min-width:140px; background:#fff8f0; padding:1.2rem; border-radius:10px; text-align:center;">
          <div style="font-size:0.85rem; color:#666; margin-bottom:4px;">Balance</div>
          <div style="font-size:2rem; font-weight:700; color:${balanceColor};">$${balance}</div>
        </div>
        <div style="flex:1; min-width:140px; background:#fafafa; padding:1.2rem; border-radius:10px; text-align:center;">
          <div style="font-size:0.85rem; color:#666; margin-bottom:4px;">Status</div>
          <div style="font-size:1.1rem; font-weight:700; color:${statusColor};">${statusText}</div>
        </div>
      </div>

      <div class="card" style="padding:1rem;">
        <h4 style="margin:0 0 1rem 0;">📋 Payment History</h4>
        ${data.fees.length === 0
          ? '<div class="empty"><div class="empty-icon">💸</div><p>No payments recorded yet</p></div>'
          : `<table style="width:100%; border-collapse:collapse;">
              <thead>
                <tr style="background:#f5f5f5;">
                  <th style="padding:10px; text-align:left; border-bottom:2px solid #eee;">Amount</th>
                  <th style="padding:10px; text-align:left; border-bottom:2px solid #eee;">Term</th>
                  <th style="padding:10px; text-align:left; border-bottom:2px solid #eee;">Year</th>
                  <th style="padding:10px; text-align:left; border-bottom:2px solid #eee;">Date Paid</th>
                </tr>
              </thead>
              <tbody>
                ${data.fees.map(f => `
                  <tr style="border-bottom:1px solid #eee;">
                    <td style="padding:10px; font-weight:600; color:#43e97b;">$${f.amount}</td>
                    <td style="padding:10px;">${f.term || '—'}</td>
                    <td style="padding:10px;">${f.year || '—'}</td>
                    <td style="padding:10px; color:#666;">${f.datePaid}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>`
        }
      </div>
    `;
  } catch(e) {
    console.error('Failed to load fees:', e);
    container.innerHTML = '<div class="empty"><div class="empty-icon">❌</div><p>Could not load fee data. Please try again.</p></div>';
  }
}

// ── ANNOUNCEMENTS ──
function loadAnnouncements() {
  const announcements = getData('announcements') || [];
  const container     = document.getElementById('announcementsList');
  if (!container) return;

  const myAnnouncements = announcements.filter(a =>
    a.className === currentUser.className
  );

  if (myAnnouncements.length === 0) {
    container.innerHTML = `<div class="empty"><div class="empty-icon">📢</div><p>No announcements yet</p></div>`;
    return;
  }

  container.innerHTML = myAnnouncements
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .map(a => `
      <div class="announcement ${a.urgent ? 'urgent' : ''}">
        ${a.urgent ? '<span class="badge badge-overdue" style="margin-bottom:8px;display:inline-block;">URGENT</span>' : ''}
        <h4>${a.title}</h4>
        <p>${a.body || ''}</p>
        <div class="ann-date">${formatDate(a.date)}</div>
      </div>
    `).join('');
}

// ── INIT ──
loadOverview();
loadAnnouncements();