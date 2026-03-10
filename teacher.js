 const API_URL = 'https://step-by-step-production-ad72.up.railway.app/api';

function showNotification(msg, type) {
    alert(msg);
}

function getToken() {
    return localStorage.getItem('authToken') || '';
}

function authHeaders() {
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getToken()}`
    };
}

async function syncToBackend(key, data) {
    try {
        await fetch(`${API_URL}/sync`, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({ key, data })
        });
    } catch(e) {
        console.warn('Backend sync failed:', e);
    }
}

async function loadFromBackend() {
    try {
        const res = await fetch(`${API_URL}/sync`, { headers: authHeaders() });
        const allData = await res.json();
        Object.entries(allData).forEach(([key, value]) => {
            if (value && value.length > 0) {
                localStorage.setItem(key, JSON.stringify(value));
                console.log(`✓ Loaded ${key} from backend`);
            }
        });
    } catch(e) {
        console.warn('Could not load from backend, using localStorage:', e);
    }
}

(function(){
  function getData(key){try{return JSON.parse(localStorage.getItem(key));}catch(e){return null}}
  function saveData(key,val){try{localStorage.setItem(key,JSON.stringify(val));return true;}catch(e){console.error('Save error:',e);return false;}}

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
            syncToBackend('studentTimetables', timetables);
            alert('Entry added to student timetable!');
            renderStudentTimetable();
        }
    }

    window.editTimetableEntry = function(id) {
        let timetables = getData('studentTimetables') || [];
        const idx = timetables.findIndex(t => t.id === id);
        if(idx === -1) return alert('Entry not found');
        const current = timetables[idx];
        const day = prompt('Day:', current.day); if(!day) return;
        const subject = prompt('Subject:', current.subject); if(!subject) return;
        const teacher = prompt('Teacher:', current.teacher); if(!teacher) return;
        const start = prompt('Start time (e.g. 08:00):', current.start); if(!start) return;
        const end = prompt('End time (e.g. 08:45):', current.end); if(!end) return;
        const room = prompt('Room number:', current.room || '');
        timetables[idx] = { ...current, day, subject, teacher, start, end, room };
        if(saveData('studentTimetables', timetables)){
            syncToBackend('studentTimetables', timetables);
            renderStudentTimetable();
            alert('Entry updated!');
        }
    };

    window.deleteTimetableEntry = function(id) {
        if(!confirm('Delete this entry?')) return;
        let timetables = getData('studentTimetables') || [];
        timetables = timetables.filter(t => t.id !== id);
        if(saveData('studentTimetables', timetables)){
            syncToBackend('studentTimetables', timetables);
            renderStudentTimetable();
        }
    };

    const ttFormEl = document.getElementById('ttForm');
    if(ttFormEl){
        ttFormEl.addEventListener('submit', e => {
            e.preventDefault();
            const classes = getData('classes') || [];
            const myClass = classes.find(c => c.teacher === user.name || c.teacher === user.username);
            if(!myClass) return alert('No class assigned to you');
            const day = document.getElementById('ttDay').value;
            const subject = document.getElementById('ttSubject').value.trim();
            const teacher = document.getElementById('ttTeacher').value.trim() || user.name;
            const start = document.getElementById('ttStart').value;
            const end = document.getElementById('ttEnd').value;
            const room = document.getElementById('ttRoom').value.trim();
            if(!day || !subject || !start || !end) return alert('Fill all required fields');
            addStudentTimetableEntry({ class: myClass.name, day, subject, teacher, start, end, room });
            ttFormEl.reset();
        });
    }

    renderStudentTimetable();

    // ===========================
    // ATTENDANCE
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
      if(!date||!cls){ alert('Please select date and class'); return; }
      const students=getData('students')||[];
      const clsStudents=(Array.isArray(students)?students:[]).filter(s=>s.class===cls);
      if(clsStudents.length===0){ alert('No students in this class'); return; }
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
      if(!date||!cls){ alert('Select date and class'); return; }
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
          syncToBackend('attendance',atts);
          const presentCount=Object.values(attToggleState).filter(v=>v).length;
          let notifications=getData('attendanceNotifications')||[]; if(!Array.isArray(notifications)) notifications=[];
          notifications.unshift({id:'N'+String(notifications.length+1).padStart(5,'0'),type:'attendance',teacher:user.name||user.username,class:cls,presentCount,totalCount:clsStudents.length,date,timestamp:new Date().toLocaleString(),message:`${user.name||user.username} marked attendance for ${cls}: ${presentCount}/${clsStudents.length} students present`,read:false});
          if(notifications.length>50) notifications=notifications.slice(0,50);
          saveData('attendanceNotifications',notifications); syncToBackend('attendanceNotifications',notifications);
          alert('Attendance saved successfully');
          addActivity('📋',`Marked attendance for ${cls} on ${date}`);
          renderAttendance(currentDayFilter);
          document.getElementById('attMarkingCard').style.display='none';
          document.getElementById('attForm').reset();
          attToggleState={};
        }else{ alert('Error: Could not save attendance data'); }
      }catch(err){ console.error('Attendance save error:',err); alert('Error saving attendance: '+err.message); }
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
              const hasLogin=s.studentId&&s.password;
              li.textContent=`${s.name} (${s.class}) ${hasLogin?'✅ Has login':'❌ No login yet'}`;
              listEl.appendChild(li);
            });
          }
        });
        if(selectEl){
          myStudents.forEach(s=>{
            const opt=document.createElement('option');
            opt.value=s.id;
            opt.textContent=`${s.name} (${s.class})${s.studentId?' — has login':''}`;
            selectEl.appendChild(opt);
          });
        }
      }catch(e){ console.warn('Could not render teacher students',e); }
    }
    renderTeacherStudents();

    const createStudentForm=document.getElementById('createStudentForm');
    if(createStudentForm){
      createStudentForm.addEventListener('submit',async(e)=>{
        e.preventDefault();
        const studentDbId=document.getElementById('studentSelect').value;
        const studentId=document.getElementById('studentId').value.trim();
        const password=document.getElementById('studentPassword').value;
        if(!studentDbId){ alert('Please select a student from the dropdown'); return; }
        const res=await fetch('https://step-by-step-production-ad72.up.railway.app/api/teacher/set-credentials',{
          method:'POST', headers:authHeaders(),
          body:JSON.stringify({studentDbId,studentId,password})
        });
        const data=await res.json();
        if(data.success){
          alert(`Login credentials created for ${data.name}!\nThey can now log in with ID: ${studentId}`);
          e.target.reset();
          await loadFromBackend();
          renderTeacherStudents();
        } else { alert(data.message||'Failed to create credentials'); }
      });
    }

    // ===========================
    // SEND WORK
    // ===========================
    const sendWorkForm = document.getElementById('sendWorkForm');
    if(sendWorkForm){
      sendWorkForm.addEventListener('submit', async(e)=>{
        e.preventDefault();
        const currentUser = getData('currentUser');
        const teacherName = currentUser ? currentUser.name : null;
        const formData = new FormData();
        formData.append('title', document.getElementById('workTitle').value);
        formData.append('file', document.getElementById('workFile').files[0]);
        formData.append('dueDate', document.getElementById('dueDate').value);
        formData.append('teacherName', teacherName);
        const res = await fetch('https://step-by-step-production-ad72.up.railway.app/api/teacher/send-work', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${getToken()}` },
          body: formData
        });
        const data = await res.json();
        if(data.success){ alert(`Work sent to ${data.studentCount} students!`); e.target.reset(); loadSentWork(); }
        else { alert('Failed to send work: ' + (data.message||'')); }
      });
    }
    loadSentWork();

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
            syncToBackend('announcements', announcements);
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
            if (!myClass) return alert('No class assigned to you');
            const title = document.getElementById('annTitle').value.trim();
            const body = document.getElementById('annBody').value.trim();
            const urgent = document.getElementById('annUrgent').checked;
            if (!title || !body) return alert('Please fill all fields');
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
                syncToBackend('announcements', announcements);
                loadAnnouncements();
                annFormEl.reset();
                alert('Announcement posted!');
            }
        });
    }

    loadAnnouncements();

  }); // end DOMContentLoaded

  // ===========================
  // SENT WORK + WHO RECEIVED
  // Replace the entire loadSentWork function in teacher.js with this:

async function loadSentWork(){
    const currentUser = JSON.parse(localStorage.getItem('currentUser'));
    const teacherName = currentUser ? currentUser.name : null;
    if(!teacherName) return;

    // Refresh submissions from backend
    try {
      const syncRes = await fetch('https://step-by-step-production-ad72.up.railway.app/api/sync', { headers: authHeaders() });
      const syncData = await syncRes.json();
      if(syncData.submissions && syncData.submissions.length > 0){
        localStorage.setItem('submissions', JSON.stringify(syncData.submissions));
      }
    } catch(e) { console.warn('Could not refresh submissions:', e); }

    try {
      const res = await fetch(`https://step-by-step-production-ad72.up.railway.app/api/teacher/sent-work?teacherName=${encodeURIComponent(teacherName)}`, {
        headers: authHeaders()
      });
      const data = await res.json();
      const container = document.getElementById('sentWorkList'); if(!container) return;
      if(!data.work || data.work.length === 0){
        container.innerHTML = '<p class="muted-text">No assignments sent yet.</p>';
        return;
      }

      // Load all submissions from localStorage
      let allSubmissions = [];
      try { allSubmissions = JSON.parse(localStorage.getItem('submissions')) || []; } catch(e){}

      // Load dismissed work IDs (teacher hid them)
      let dismissed = [];
      try { dismissed = JSON.parse(localStorage.getItem('dismissedWork_' + teacherName)) || []; } catch(e){}

      container.innerHTML = '';

      // Filter out dismissed assignments
      const visible = data.work.filter(w => !dismissed.includes(w.id));

      if(visible.length === 0){
        container.innerHTML = '<p class="muted-text">No assignments to show. <button class="btn-small btn-warning" onclick="restoreDismissed()">Restore All</button></p>';
        return;
      }

      visible.forEach(w => {
        const receivedList = allSubmissions.filter(s => s.workId === w.id && s.status === 'received');
        const totalSent = w.studentIds ? w.studentIds.length : 0;

        const receivedHTML = receivedList.length === 0
          ? '<span style="color:#888;font-size:13px;">No students have marked received yet</span>'
          : receivedList.map(s =>
              `<span style="display:inline-block;background:#d4edda;color:#155724;padding:3px 10px;border-radius:20px;font-size:12px;margin:2px;">✅ ${s.studentName || s.studentId}</span>`
            ).join('');

        container.innerHTML += `
          <div class="work-card" id="wcard-sent-${w.id}" style="flex-direction:column;align-items:flex-start;gap:8px;">
            <div style="display:flex;justify-content:space-between;width:100%;align-items:center;">
              <div>
                <h4 style="margin:0 0 4px 0;">${w.title}</h4>
                <p style="margin:0;color:#888;font-size:13px;">Due: ${w.dueDate} &nbsp;|&nbsp; Sent to: ${totalSent} student${totalSent !== 1 ? 's' : ''}</p>
              </div>
              <div style="display:flex;align-items:center;gap:8px;">
                <span style="background:#e8f4fd;color:#1a6ea8;padding:4px 12px;border-radius:20px;font-size:13px;font-weight:600;">
                  ${receivedList.length}/${totalSent} received
                </span>
                <button 
                  onclick="dismissSentWork('${w.id}')" 
                  title="Hide this assignment"
                  style="background:#f5576c;color:#fff;border:none;border-radius:6px;padding:5px 10px;cursor:pointer;font-size:12px;">
                  ✕ Remove
                </button>
              </div>
            </div>
            <div style="margin-top:4px;">
              <div style="font-size:12px;color:#666;margin-bottom:4px;font-weight:600;">WHO RECEIVED:</div>
              <div>${receivedHTML}</div>
            </div>
          </div>`;
      });

      // Show restore button if any are dismissed
      if(dismissed.length > 0){
        container.innerHTML += `<p style="margin-top:8px;"><button class="btn-small btn-warning" onclick="restoreDismissed()">↩ Restore ${dismissed.length} hidden assignment${dismissed.length !== 1 ? 's' : ''}</button></p>`;
      }

    } catch(e) {
      console.warn('Could not load sent work:', e);
    }
  }

  // Hide an assignment card from view (stored locally per teacher)
  window.dismissSentWork = function(workId) {
    const currentUser = JSON.parse(localStorage.getItem('currentUser'));
    const teacherName = currentUser ? currentUser.name : null;
    if(!teacherName) return;
    const key = 'dismissedWork_' + teacherName;
    let dismissed = [];
    try { dismissed = JSON.parse(localStorage.getItem(key)) || []; } catch(e){}
    if(!dismissed.includes(workId)) dismissed.push(workId);
    localStorage.setItem(key, JSON.stringify(dismissed));
    // Remove card from DOM instantly
    const card = document.getElementById('wcard-sent-' + workId);
    if(card) card.remove();
    loadSentWork(); // refresh to update restore button count
  };

  // Restore all hidden assignments
  window.restoreDismissed = function() {
    const currentUser = JSON.parse(localStorage.getItem('currentUser'));
    const teacherName = currentUser ? currentUser.name : null;
    if(!teacherName) return;
    localStorage.removeItem('dismissedWork_' + teacherName);
    loadSentWork();
  };
})();