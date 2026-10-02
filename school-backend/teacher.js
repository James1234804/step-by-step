 // ============================================================
// teacher.js — Teacher Dashboard
// Supabase-backed. This file no longer talks to the old Render
// backend (shallom-high-elite.onrender.com) — that server is dead,
// and every fetch() call to it was silently failing, meaning
// attendance, timetables, announcements and student credentials
// created from this page never actually reached the server. Only
// Send Work (file uploads) still depends on the old backend and is
// known to be broken — that's a separate fix, not done here.
// ============================================================

function showNotification(msg, type) {
    const el = document.createElement('div');
    el.className = `notification ${type || 'info'}`;
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3500);
}

// ---------- Supabase client (same project as the admin dashboard) ----------
const SUPABASE_URL = 'https://tnrxsrjzdshjuhvebkck.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRucnhzcmp6ZHNoanVodmVia2NrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyMjA1NTcsImV4cCI6MjA5Mjc5NjU1N30.4b6CAXXs21aIJKm1qi9bOuIE5zDfJiEQze9hoxSJ7ig';

const supabaseClient = (window.supabase && window.supabase.createClient)
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

if (!supabaseClient) {
    console.warn('Supabase client failed to initialize — check that the supabase-js <script> tag is in teacher.html and loaded before teacher.js.');
}

// Tables this page is allowed to sync with a safe full-array UPSERT.
// Same hard rule as the admin dashboard's school.js: upsert only ever
// adds/updates rows present locally. It can NEVER delete anything just
// because the local array looks empty — that was the exact bug that
// wiped real student data before. Deletions go through deleteRowFromBackend
// below, only from an actual "Delete" click.
const SYNC_KEYS = ['students', 'attendance', 'studentTimetables', 'announcements'];
// Tables this page only reads (owned/written by the admin dashboard).
const LOAD_ONLY_KEYS = ['teachers', 'classes'];

function mapRowForSupabase(table, item) {
    switch (table) {
        case 'students':
            return {
                id: item.id,
                name: item.name,
                class: item.class || '',
                gender: item.gender || '',
                password: item.password || '',
                status: item.status || 'Active',
                date_added: item.dateAdded || '',
                parent_name: item.parentName || '',
                phone: item.phone || '',
                enrollment_year: item.enrollmentYear || null
            };
        case 'attendance':
            return {
                id: item.id,
                student_id: item.studentId,
                class: item.class || '',
                date: item.date || '',
                status: item.status || '',
                teacher: item.teacher || item.createdBy || '',
                note: item.note || ''
            };
        case 'studentTimetables':
            return {
                id: item.id,
                class: item.class || '',
                day: item.day || '',
                subject: item.subject || '',
                teacher: item.teacher || '',
                start_time: item.start || '',
                end_time: item.end || '',
                room: item.room || ''
            };
        case 'announcements':
            return {
                id: item.id,
                title: item.title || '',
                body: item.body || '',
                urgent: !!item.urgent,
                class_name: item.className || '',
                teacher: item.teacher || '',
                date: item.date || ''
            };
        default:
            return item;
    }
}

function mapRowFromSupabase(table, row) {
    switch (table) {
        case 'students':
            return { id: row.id, name: row.name, class: row.class, gender: row.gender, password: row.password, status: row.status || 'Active', dateAdded: row.date_added || '', parentName: row.parent_name || '', phone: row.phone || '', enrollmentYear: row.enrollment_year || '' };
        case 'teachers':
            return { id: row.id, name: row.name, department: row.department, email: row.email, phone: row.phone, status: row.status, username: row.username, class: row.class };
        case 'classes':
            return { id: row.id, name: row.name, formLevel: row.form_level, teacher: row.teacher, teacherId: row.teacher_id || '', room: row.room };
        case 'attendance':
            return { id: row.id, studentId: row.student_id, class: row.class, date: row.date, status: row.status, teacher: row.teacher, note: row.note };
        case 'studentTimetables':
            return { id: row.id, class: row.class, day: row.day, subject: row.subject, teacher: row.teacher, start: row.start_time, end: row.end_time, room: row.room };
        case 'announcements':
            return { id: row.id, title: row.title, body: row.body, urgent: !!row.urgent, className: row.class_name, teacher: row.teacher, date: row.date };
        default:
            return row;
    }
}

// Supabase table names differ slightly from the localStorage keys for two
// of these (studentTimetables -> student_timetables); this maps that.
function backendTableName(key) {
    if (key === 'studentTimetables') return 'student_timetables';
    return key;
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

function saveData(key, data) {
    try {
        localStorage.setItem(key, JSON.stringify(data));
        if (SYNC_KEYS.includes(key)) syncToBackend(key, data);
        return true;
    } catch (e) {
        console.error('Error saving:', e);
        return false;
    }
}

// Safe upsert-only sync — see the big comment at the top of this file.
async function syncToBackend(key, data) {
    if (!supabaseClient) { console.warn(`Supabase client missing — could not sync "${key}"`); return; }
    if (!Array.isArray(data) || data.length === 0) {
        console.log(`(sync) "${key}": local array is empty — nothing upserted, remote data left untouched`);
        return;
    }
    try {
        const table = backendTableName(key);
        const rows = data.map(item => mapRowForSupabase(key, item));
        const { error } = await supabaseClient.from(table).upsert(rows, { onConflict: 'id' });
        if (error) {
            console.warn(`✗ Supabase upsert FAILED for "${key}":`, error.message);
            showNotification(`Warning: "${key}" may not have saved to the server.`, 'error');
        } else {
            console.log(`✓ Synced ${rows.length} record(s) to Supabase "${table}" table (upsert)`);
        }
    } catch (e) {
        console.warn(`✗ Supabase sync threw an error for "${key}":`, e);
    }
}

// The ONLY way a row is removed remotely — a specific, deliberate delete.
async function deleteRowFromBackend(key, id) {
    if (!supabaseClient || !id) return;
    const table = backendTableName(key);
    try {
        const { error } = await supabaseClient.from(table).delete().eq('id', id);
        if (error) console.warn(`✗ Supabase delete FAILED for "${table}" id=${id}:`, error.message);
        else console.log(`✓ Deleted "${table}" id=${id} from Supabase`);
    } catch (e) {
        console.warn(`✗ Supabase delete threw an error for "${table}":`, e);
    }
}

async function loadFromBackend() {
    if (!supabaseClient) return;
    const allKeys = [...SYNC_KEYS, ...LOAD_ONLY_KEYS];
    for (const key of allKeys) {
        try {
            const table = backendTableName(key);
            const { data, error } = await supabaseClient.from(table).select('*');
            if (error) { console.warn(`Could not load ${key} from Supabase:`, error.message); continue; }
            if (data) {
                const mapped = data.map(row => mapRowFromSupabase(key, row));
                localStorage.setItem(key, JSON.stringify(mapped));
                console.log(`✓ Loaded ${key} from Supabase (${mapped.length} records)`);
            }
        } catch (e) {
            console.warn(`Error loading ${key} from Supabase:`, e);
        }
    }
}

(function(){
  function ensureAuth(){
    const cur = getData('currentUser');
    if(!cur){ window.location.href='login.html'; return null }
    if(cur.role !== 'teacher' && cur.role !== 'headmaster'){ window.location.href='teacher.html'; return null; }
    return cur;
  }

  function addActivity(icon,text){
    let acts = getData('activities')||[]; if(!Array.isArray(acts)) acts=[];
    acts.unshift({id:String(Date.now()),icon,text,time:new Date().toLocaleString()});
    if(acts.length>12) acts=acts.slice(0,12);
    saveData('activities',acts);
  }

  document.addEventListener('DOMContentLoaded', async ()=>{
    await loadFromBackend();
    const user = ensureAuth(); if(!user) return;
    document.getElementById('teacherName').textContent = user.name || user.username || 'Teacher';

    try {
      const classInfoEl = document.getElementById('teacherClassInfo');
      if(classInfoEl){
        const classes = getData('classes')||[];
        const myClasses = (Array.isArray(classes)?classes:[]).filter(c=>c.teacher===user.name||c.teacher===user.username);
        if(myClasses.length===0){ classInfoEl.textContent=''; }
        else {
          const classNames = myClasses.map(c=>c.name).join(', ');
          const students = getData('students')||[];
          const firstCount = (Array.isArray(students)?students.filter(s=>s.class===myClasses[0].name).length:0);
          classInfoEl.textContent = `${classNames} — ${firstCount} students`;
        }
      }
    } catch(e){}

    document.getElementById('btnTeacherBack').addEventListener('click',()=>{ window.location.href='teacher.html' });
    document.getElementById('btnTeacherLogout').addEventListener('click',()=>{ localStorage.removeItem('currentUser'); window.location.href='login.html' });

    document.querySelectorAll('.tab').forEach(btn=>{
      btn.addEventListener('click',()=>{
        document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
        document.querySelectorAll('.tab-section').forEach(s=>s.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(btn.dataset.tab).classList.add('active');
      });
    });

    // ===========================
    // TIMETABLE — SECTION 1
    // Admin's timetable (READ ONLY)
    // ===========================
    function renderAdminTimetable(){
        const tbody = document.getElementById('ttAdminBody');
        const countEl = document.getElementById('ttAdminCount');
        if(!tbody) return;
        tbody.innerHTML = '';

        const allTimetables = getData('timetables') || [];
        if(!Array.isArray(allTimetables) || allTimetables.length === 0){
            tbody.innerHTML = '<tr class="empty-row"><td colspan="6">No schedule assigned by admin yet.</td></tr>';
            if(countEl) countEl.textContent = '';
            return;
        }

        const classes = getData('classes') || [];
        const myClasses = (Array.isArray(classes)?classes:[])
            .filter(c => c.teacher === user.name || c.teacher === user.username)
            .map(c => c.name);

        const mine = allTimetables.filter(t =>
            myClasses.includes(t.class) ||
            t.teacher === user.name ||
            t.teacher === user.username
        );

        if(mine.length === 0){
            tbody.innerHTML = '<tr class="empty-row"><td colspan="6">No schedule found for your class. Contact the admin.</td></tr>';
            if(countEl) countEl.textContent = '';
            return;
        }

        const dayOrder = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
        mine.sort((a,b) => dayOrder.indexOf(a.day) - dayOrder.indexOf(b.day) || (a.start||'').localeCompare(b.start||''));

        mine.forEach(r => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${r.day || '-'}</td>
                <td>${r.subject || '-'}</td>
                <td>${r.class || '-'}</td>
                <td>${r.start || '-'}</td>
                <td>${r.end || '-'}</td>
                <td>${r.room || '-'}</td>`;
            tbody.appendChild(tr);
        });

        if(countEl) countEl.textContent = `${mine.length} period${mine.length !== 1 ? 's' : ''}`;
    }

    renderAdminTimetable();

    // ===========================
    // TIMETABLE — SECTION 2
    // Student timetable (teacher creates for students)
    // ===========================
    function renderStudentTimetable(){
        const tbody = document.getElementById('ttBody');
        const countEl = document.getElementById('ttClassCount');
        if(!tbody) return;
        tbody.innerHTML = '';

        const tts = getData('studentTimetables') || [];
        const classes = getData('classes') || [];
        const myClass = classes.find(c => c.teacher === user.name || c.teacher === user.username);

        if(!myClass){
            tbody.innerHTML = '<tr class="empty-row"><td colspan="7">No class assigned to you yet.</td></tr>';
            return;
        }

        const mine = (Array.isArray(tts) ? tts : []).filter(x => x.class === myClass.name);

        if(mine.length === 0){
            tbody.innerHTML = '<tr class="empty-row"><td colspan="7">No student timetable entries yet. Add one above.</td></tr>';
            if(countEl) countEl.textContent = '';
            return;
        }

        const dayOrder = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
        mine.sort((a,b) => dayOrder.indexOf(a.day) - dayOrder.indexOf(b.day) || a.start.localeCompare(b.start));

        mine.forEach(r => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${r.day}</td>
                <td>${r.subject}</td>
                <td>${r.teacher}</td>
                <td>${r.start}</td>
                <td>${r.end}</td>
                <td>${r.room || '-'}</td>
                <td>
                    <button class="btn-small btn-warning" onclick="editTimetableEntry('${r.id}')">Edit</button>
                    <button class="btn-small btn-danger" onclick="deleteTimetableEntry('${r.id}')">Delete</button>
                </td>`;
            tbody.appendChild(tr);
        });

        if(countEl) countEl.textContent = `${mine.length} period${mine.length !== 1 ? 's' : ''}`;
    }

    function addStudentTimetableEntry(entry) {
        let timetables = getData('studentTimetables') || [];
        if(!Array.isArray(timetables)) timetables = [];
        timetables.push({ id: 'STT' + Date.now(), ...entry });
        if(saveData('studentTimetables', timetables)){
            showNotification('Entry added to student timetable!', 'success');
            renderStudentTimetable();
        }
    }

    window.editTimetableEntry = function(id) {
        let timetables = getData('studentTimetables') || [];
        const idx = timetables.findIndex(t => t.id === id);
        if(idx === -1) return showNotification('Entry not found', 'error');
        const current = timetables[idx];
        const day = prompt('Day:', current.day); if(!day) return;
        const subject = prompt('Subject:', current.subject); if(!subject) return;
        const teacher = prompt('Teacher:', current.teacher); if(!teacher) return;
        const start = prompt('Start time (e.g. 08:00):', current.start); if(!start) return;
        const end = prompt('End time (e.g. 08:45):', current.end); if(!end) return;
        const room = prompt('Room number:', current.room || '');
        timetables[idx] = { ...current, day, subject, teacher, start, end, room };
        if(saveData('studentTimetables', timetables)){
            renderStudentTimetable();
            showNotification('Entry updated!', 'success');
        }
    };

    window.deleteTimetableEntry = function(id) {
        if(!confirm('Delete this entry?')) return;
        let timetables = getData('studentTimetables') || [];
        timetables = timetables.filter(t => t.id !== id);
        if(saveData('studentTimetables', timetables)){
            deleteRowFromBackend('studentTimetables', id);
            renderStudentTimetable();
        }
    };

    const ttFormEl = document.getElementById('ttForm');
    if(ttFormEl){
        ttFormEl.addEventListener('submit', e => {
            e.preventDefault();
            const classes = getData('classes') || [];
            const myClass = classes.find(c => c.teacher === user.name || c.teacher === user.username);
            if(!myClass) return showNotification('No class assigned to you', 'error');
            const day = document.getElementById('ttDay').value;
            const subject = document.getElementById('ttSubject').value.trim();
            const teacher = document.getElementById('ttTeacher').value.trim() || user.name;
            const start = document.getElementById('ttStart').value;
            const end = document.getElementById('ttEnd').value;
            const room = document.getElementById('ttRoom').value.trim();
            if(!day || !subject || !start || !end) return showNotification('Fill all required fields', 'error');
            addStudentTimetableEntry({ class: myClass.name, day, subject, teacher, start, end, room });
            ttFormEl.reset();
        });
    }

    renderStudentTimetable();

    // ===========================
    // ATTENDANCE (marking students)
    // ===========================
    function loadAttendance(){ const a=getData('attendance')||[]; return Array.isArray(a)?a:[]; }

    function renderAttendance(dayFilter='all'){
      const tbody=document.getElementById('attBody'); if(!tbody) return;
      tbody.innerHTML='';
      let atts=loadAttendance().filter(x=>x.teacher===user.name||x.createdBy===user.username);
      if(dayFilter!=='all') atts=atts.filter(a=>getDayName(a.date)===dayFilter);
      if(atts.length===0){ tbody.innerHTML=`<tr class="empty-row"><td colspan="5">No attendance records for ${dayFilter==='all'?'any day':dayFilter}.</td></tr>`; return; }
      atts.forEach(a=>{
        const tr=document.createElement('tr');
        tr.innerHTML=`<td>${getDayName(a.date)}, ${a.date}</td><td>${a.studentName||a.studentId}</td><td>${a.class}</td><td><span class="att-status-badge ${a.status==='present'?'att-status-present':'att-status-absent'}">${a.status.toUpperCase()}</span></td><td>${a.teacher}</td>`;
        tbody.appendChild(tr);
      });
    }

    function populateAttendanceClassSelect(){
      const sel=document.getElementById('attClassSelect'); if(!sel) return;
      const classes=getData('classes')||[];
      const myClasses=(Array.isArray(classes)?classes:[]).filter(c=>c.teacher===user.name||c.teacher===user.username);
      sel.innerHTML='<option value="">Select Class</option>';
      myClasses.forEach(c=>{ const opt=document.createElement('option'); opt.value=c.name; opt.textContent=c.name; sel.appendChild(opt); });
    }
    populateAttendanceClassSelect();

    function getDayName(dateStr){ const d=new Date(dateStr+'T00:00:00'); return ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][d.getDay()]; }

    let currentDayFilter='all';
    let attToggleState={};

    document.getElementById('attLoadBtn').addEventListener('click',e=>{
      e.preventDefault();
      const date=document.getElementById('attDate').value;
      const cls=document.getElementById('attClassSelect').value;
      if(!date||!cls){ showNotification('Please select date and class', 'error'); return; }
      const students=getData('students')||[];
      const clsStudents=(Array.isArray(students)?students:[]).filter(s=>s.class===cls);
      if(clsStudents.length===0){ showNotification('No students in this class', 'error'); return; }
      attToggleState={};
      const listEl=document.getElementById('attStudentMarkingList'); listEl.innerHTML='';
      clsStudents.forEach(s=>{
        const div=document.createElement('div'); div.className='att-item';
        const chk=document.createElement('input'); chk.type='checkbox'; chk.id='att_'+s.id; chk.checked=true; attToggleState[s.id]=true;
        const label=document.createElement('label'); label.htmlFor='att_'+s.id; label.textContent=s.name+' ('+s.id+')';
        const badge=document.createElement('span'); badge.className='att-status-badge att-status-present'; badge.textContent='Present'; badge.id='status_'+s.id;
        chk.addEventListener('change',()=>{ attToggleState[s.id]=chk.checked; const b=document.getElementById('status_'+s.id); if(chk.checked){b.textContent='Present';b.className='att-status-badge att-status-present';}else{b.textContent='Absent';b.className='att-status-badge att-status-absent';} });
        div.appendChild(chk); div.appendChild(label); div.appendChild(badge); listEl.appendChild(div);
      });
      document.getElementById('attMarkingInfo').textContent=`${cls} — ${getDayName(date)}, ${date} (${clsStudents.length} students)`;
      document.getElementById('attMarkingCard').style.display='block';
    });

    document.getElementById('attSaveBtn').addEventListener('click',()=>{
      const date=document.getElementById('attDate').value;
      const cls=document.getElementById('attClassSelect').value;
      if(!date||!cls){ showNotification('Select date and class', 'error'); return; }
      const students=getData('students')||[];
      const clsStudents=(Array.isArray(students)?students:[]).filter(s=>s.class===cls);
      let atts=loadAttendance(); if(!Array.isArray(atts)) atts=[];
      clsStudents.forEach(s=>{
        const status=(attToggleState[s.id]===undefined?true:attToggleState[s.id])?'present':'absent';
        const existingIdx=atts.findIndex(a=>a.studentId===s.id&&a.date===date&&a.class===cls);
        const rec={id:'A'+Date.now()+'_'+s.id,studentId:s.id,studentName:s.name,class:cls,date,status,teacher:user.name,createdBy:user.username,time:new Date().toLocaleString()};
        if(existingIdx!==-1){atts[existingIdx]=rec;}else{atts.push(rec);}
      });
      try{
        if(saveData('attendance',atts)){
          const presentCount=Object.values(attToggleState).filter(v=>v).length;
          let notifications=getData('attendanceNotifications')||[]; if(!Array.isArray(notifications)) notifications=[];
          notifications.unshift({id:'N'+String(notifications.length+1).padStart(5,'0'),type:'attendance',teacher:user.name||user.username,class:cls,presentCount,totalCount:clsStudents.length,date,timestamp:new Date().toLocaleString(),message:`${user.name||user.username} marked attendance for ${cls}: ${presentCount}/${clsStudents.length} students present`,read:false});
          if(notifications.length>50) notifications=notifications.slice(0,50);
          localStorage.setItem('attendanceNotifications', JSON.stringify(notifications));
          showNotification('Attendance saved successfully', 'success');
          addActivity('📋',`Marked attendance for ${cls} on ${date}`);
          renderAttendance(currentDayFilter);
          document.getElementById('attMarkingCard').style.display='none';
          document.getElementById('attForm').reset();
          attToggleState={};
        }else{ showNotification('Error: Could not save attendance data', 'error'); }
      }catch(err){ console.error('Attendance save error:',err); showNotification('Error saving attendance: '+err.message, 'error'); }
    });

    document.getElementById('attCancelBtn').addEventListener('click',()=>{ document.getElementById('attMarkingCard').style.display='none'; attToggleState={}; });

    document.querySelectorAll('.day-btn').forEach(btn=>{
      btn.addEventListener('click',()=>{
        document.querySelectorAll('.day-btn').forEach(b=>b.classList.remove('active-day'));
        btn.classList.add('active-day');
        currentDayFilter=btn.dataset.day; renderAttendance(currentDayFilter);
      });
    });
    const allDaysBtn=document.querySelector('.day-btn[data-day="all"]');
    if(allDaysBtn) allDaysBtn.classList.add('active-day');
    renderAttendance();

    // ===========================
    // MY STUDENTS + CREDENTIALS
    // ===========================
    // A student's login is their existing student ID (the same id used
    // everywhere else — classes, fees, attendance) plus a password, set on
    // the student record itself. There is no separate "login ID" anymore —
    // the old version let a teacher type an arbitrary one, which could
    // drift out of sync with the real student record used by the rest of
    // the system. This only ever sets/resets the password.
    function renderTeacherStudents(){
      try{
        const listEl=document.getElementById('teacherStudentsList');
        const selectEl=document.getElementById('studentSelect');
        if(!listEl) return;
        listEl.innerHTML='';
        if(selectEl) selectEl.innerHTML='<option value="">Select a student...</option>';
        const classes=getData('classes')||[];
        const myClasses=(Array.isArray(classes)?classes:[]).filter(c=>c.teacher===user.name||c.teacher===user.username);
        if(myClasses.length===0){ listEl.innerHTML='<li style="color:#666;">No classes assigned to you.</li>'; return; }
        const students=getData('students')||[];
        const myClassNames=myClasses.map(c=>c.name);
        const myStudents=(Array.isArray(students)?students:[]).filter(s=>myClassNames.includes(s.class));
        myClasses.forEach(cls=>{
          const header=document.createElement('li'); header.style.fontWeight='700'; header.style.marginTop='0.5rem'; header.textContent=cls.name; listEl.appendChild(header);
          const clsStudents=myStudents.filter(s=>s.class===cls.name);
          if(clsStudents.length===0){
            const li=document.createElement('li'); li.style.color='#666'; li.textContent='No students in this class.'; listEl.appendChild(li);
          } else {
            clsStudents.forEach(s=>{
              const li=document.createElement('li'); li.style.padding='4px 0';
              const hasLogin = !!s.password;
              li.textContent=`${s.name} (${s.class}) — ID: ${s.id} ${hasLogin?'✅ Has login':'❌ No password set'}`;
              listEl.appendChild(li);
            });
          }
        });
        if(selectEl){
          myStudents.forEach(s=>{
            const opt=document.createElement('option');
            opt.value=s.id;
            opt.textContent=`${s.name} (${s.class}) — ID: ${s.id}`;
            selectEl.appendChild(opt);
          });
        }
      }catch(e){ console.warn('Could not render teacher students',e); }
    }
    renderTeacherStudents();

    const createStudentForm=document.getElementById('createStudentForm');
    if(createStudentForm){
      createStudentForm.addEventListener('submit',(e)=>{
        e.preventDefault();
        const studentDbId=document.getElementById('studentSelect').value;
        const password=document.getElementById('studentPassword').value;
        if(!studentDbId) return showNotification('Please select a student from the dropdown', 'error');
        if(!password) return showNotification('Please choose a password', 'error');

        let students = getData('students') || [];
        const idx = students.findIndex(s => s.id === studentDbId);
        if(idx === -1) return showNotification('Student not found', 'error');

        students[idx] = { ...students[idx], password };
        if(saveData('students', students)){
          showNotification(`Login saved for ${students[idx].name}. ID: ${students[idx].id}`, 'success');
          addActivity('🔑', `Set a password for ${students[idx].name}`);
          e.target.reset();
          renderTeacherStudents();
        } else {
          showNotification('Could not save — please try again', 'error');
        }
      });
    }

    // ===========================
    // SEND WORK — STILL BROKEN
    // ===========================
    // This still depends on the dead Render backend for file upload and
    // submission tracking (/api/teacher/send-work, /api/sync,
    // /api/teacher/sent-work). It is NOT fixed in this update — the file
    // upload side needs Supabase Storage set up, which is a separate job.
    // Left as-is on purpose rather than silently removed.
    const sendWorkForm = document.getElementById('sendWorkForm');
    if(sendWorkForm){
      sendWorkForm.addEventListener('submit', (e)=>{
        e.preventDefault();
        showNotification('Send Work is not connected yet — this feature is being rebuilt. Nothing was sent.', 'error');
      });
    }
    const sentWorkContainer = document.getElementById('sentWorkList');
    if (sentWorkContainer) {
      sentWorkContainer.innerHTML = '<p class="muted-text">Send Work isn\'t connected yet — coming soon.</p>';
    }

    // ===========================
    // ANNOUNCEMENTS
    // ===========================
    function loadAnnouncements() {
        const announcements = getData('announcements') || [];
        const myAnnouncements = announcements.filter(a =>
            a.teacher === user.name || a.teacher === user.username
        );
        renderAnnouncements(myAnnouncements);
    }

    function renderAnnouncements(list) {
        const container = document.getElementById('annList');
        if (!container) return;
        if (list.length === 0) {
            container.innerHTML = '<p class="muted-text">No announcements posted yet.</p>';
            return;
        }
        container.innerHTML = '';
        list.sort((a, b) => new Date(b.date) - new Date(a.date));
        list.forEach(a => {
            const div = document.createElement('div');
            div.className = `ann-card${a.urgent ? ' urgent' : ''}`;
            div.innerHTML = `
                <div class="ann-card-header">
                    <div>
                        ${a.urgent ? '<span class="badge badge-urgent" style="margin-bottom:6px;display:inline-block;">URGENT</span>' : ''}
                        <h4>${a.title}</h4>
                        <p>${a.body}</p>
                        <div class="ann-card-meta">Posted: ${new Date(a.date).toLocaleString()} — To: ${a.className}</div>
                    </div>
                    <button class="btn-small btn-danger" onclick="deleteAnnouncement('${a.id}')">Delete</button>
                </div>`;
            container.appendChild(div);
        });
    }

    window.deleteAnnouncement = function(id) {
        if (!confirm('Delete this announcement?')) return;
        let announcements = getData('announcements') || [];
        announcements = announcements.filter(a => a.id !== id);
        if (saveData('announcements', announcements)) {
            deleteRowFromBackend('announcements', id);
            loadAnnouncements();
        }
    };

    const annFormEl = document.getElementById('annForm');
    if (annFormEl) {
        annFormEl.addEventListener('submit', e => {
            e.preventDefault();
            const classes = getData('classes') || [];
            const myClass = classes.find(c =>
                c.teacher === user.name || c.teacher === user.username
            );
            if (!myClass) return showNotification('No class assigned to you', 'error');
            const title = document.getElementById('annTitle').value.trim();
            const body = document.getElementById('annBody').value.trim();
            const urgent = document.getElementById('annUrgent').checked;
            if (!title || !body) return showNotification('Please fill all fields', 'error');
            let announcements = getData('announcements') || [];
            if (!Array.isArray(announcements)) announcements = [];
            announcements.push({
                id: 'ANN' + Date.now(),
                title, body, urgent,
                className: myClass.name,
                teacher: user.name || user.username,
                date: new Date().toISOString()
            });
            if (saveData('announcements', announcements)) {
                loadAnnouncements();
                annFormEl.reset();
                showNotification('Announcement posted!', 'success');
            }
        });
    }

    loadAnnouncements();

  }); // end DOMContentLoaded
})();
