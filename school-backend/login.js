 (function(){
  function getData(key){try{return JSON.parse(localStorage.getItem(key));}catch(e){return null}}
  function saveData(key,val){localStorage.setItem(key,JSON.stringify(val))}

  async function login(username, password) {
    try {
      const res = await fetch('https://step-by-step-production-ad72.up.railway.app/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await res.json();

      if (data.token) {
        localStorage.setItem('authToken', data.token);
        saveData('currentUser', { username, name: data.name, role: data.role });
        if (data.role === 'teacher') {
          window.location.href = 'teacher.html';
        } else {
          window.location.href = 'index.html';
        }
        return;
      }
    } catch(e) {
      console.warn('Backend login failed, trying localStorage:', e);
    }

    const users = getData('users') || [];
    const user = users.find(u => u.username === username && u.password === password);
    if (user) {
      saveData('currentUser', user);
      if (user.role === 'teacher') {
        window.location.href = 'teacher.html';
      } else {
        window.location.href = 'index.html';
      }
    } else {
      alert('Invalid credentials');
    }
  }

  document.addEventListener('DOMContentLoaded', () => {

    // ── ADMIN LOGIN ──
    document.getElementById('btnLogin').addEventListener('click', () => {
      const u = document.getElementById('loginUser').value.trim();
      const p = document.getElementById('loginPass').value;
      login(u, p);
    });

    // ── TEACHER LOGIN ──
    // ── TEACHER LOGIN ──
const tBtn = document.getElementById('btnTeacherLogin');
if (tBtn) {
  tBtn.addEventListener('click', async () => {
    const u = prompt('Teacher username or name:');
    if (!u) return;
    const p = prompt('Password:');
    if (p === null) return;

    try {
      const res = await fetch('https://step-by-step-production-ad72.up.railway.app/api/auth/teacher-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: u.trim(), password: p })
      });
      const data = await res.json();
      if (data.token) {
        localStorage.setItem('authToken', data.token);
        localStorage.setItem('currentUser', JSON.stringify({
          id: data.id,
          name: data.name,
          role: 'teacher'
        }));
        window.location.href = 'teacher.html';
      } else {
        alert(data.error || 'Login failed');
      }
    } catch(e) {
      alert('Could not connect to server');
    }
  });
}

    // ── STUDENT LOGIN - open modal ──
    document.getElementById('btnStudentLogin').addEventListener('click', () => {
      document.getElementById('studentLoginModal').style.display = 'flex';
    });

    // ── STUDENT LOGIN - cancel ──
    document.getElementById('btnCancelStudent').addEventListener('click', () => {
      document.getElementById('studentLoginModal').style.display = 'none';
    });

    // ── STUDENT LOGIN - confirm ──
    document.getElementById('btnConfirmStudent').addEventListener('click', async () => {
      const studentId = document.getElementById('inputStudentId').value.trim();
      const password  = document.getElementById('inputStudentPass').value;

      if (!studentId || !password) {
        alert('Please enter your Student ID and password');
        return;
      }

      try {
        const res  = await fetch('https://step-by-step-production-ad72.up.railway.app/api/auth/student-login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ studentId, password })
        });
        const data = await res.json();

        if (data.token) {
          localStorage.setItem('authToken', data.token);
          localStorage.setItem('currentUser', JSON.stringify({
            id:        data.id,
            name:      data.name,
            studentId: data.studentId,
            className: data.className,
            role:      'student'
          }));
         window.location.href = 'student.html';
        } else {
          alert(data.error || 'Invalid Student ID or password');
        }
      } catch (e) {
        alert('Could not connect to server');
      }
    });

  });
})();