 (function(){
  // Same Supabase project used by school.js — this is what actually makes
  // login work on a browser that has never stored anything locally.
  const SUPABASE_URL = 'https://tnrxsrjzdshjuhvebkck.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRucnhzcmp6ZHNoanVodmVia2NrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyMjA1NTcsImV4cCI6MjA5Mjc5NjU1N30.4b6CAXXs21aIJKm1qi9bOuIE5zDfJiEQze9hoxSJ7ig';

  const supabaseClient = (window.supabase && window.supabase.createClient)
      ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
      : null;

  function getData(key){try{return JSON.parse(localStorage.getItem(key));}catch(e){return null}}
  function saveData(key,val){localStorage.setItem(key,JSON.stringify(val))}

  // Guests, teachers, and headmasters are all stored together as one JSON
  // array inside Supabase's "settings" table (key = 'users'). Pulling this
  // fresh on every login attempt means login works even on a browser that
  // has never had this data before — not just the one it was created on.
  async function fetchUsers() {
    if (!supabaseClient) {
      console.warn('Supabase client unavailable — falling back to local cache only.');
      return getData('users') || [];
    }
    try {
      const { data, error } = await supabaseClient
        .from('settings')
        .select('value')
        .eq('key', 'users')
        .maybeSingle();
      if (error || !data) {
        console.warn('Could not fetch users from Supabase, using local cache:', error?.message);
        return getData('users') || [];
      }
      const users = JSON.parse(data.value);
      saveData('users', users); // keep the local cache fresh too
      return users;
    } catch (e) {
      console.warn('Error fetching users from Supabase, using local cache:', e);
      return getData('users') || [];
    }
  }

  // Students live in their own real Supabase table (not the settings blob),
  // with `password` defaulting to their student ID — same as school.js sets
  // when a student is first added.
  async function fetchStudents() {
    if (!supabaseClient) {
      console.warn('Supabase client unavailable — falling back to local cache only.');
      return getData('students') || [];
    }
    try {
      const { data, error } = await supabaseClient.from('students').select('*');
      if (error || !data) {
        console.warn('Could not fetch students from Supabase, using local cache:', error?.message);
        return getData('students') || [];
      }
      const students = data.map(row => ({
        id: row.id, name: row.name, class: row.class, gender: row.gender, password: row.password
      }));
      saveData('students', students);
      return students;
    } catch (e) {
      console.warn('Error fetching students from Supabase, using local cache:', e);
      return getData('students') || [];
    }
  }

  // ===== ADMIN / GUEST LOGIN =====
  async function login(username, password) {
    const users = await fetchUsers();
    const user = users.find(u => u.username === username && u.password === password);
    if (user) {
      saveData('currentUser', user);
      window.location.href = (user.role === 'teacher') ? 'teacher.html' : 'index.html';
    } else {
      alert('Invalid credentials');
    }
  }

  document.addEventListener('DOMContentLoaded', () => {

    // ===== ADMIN LOGIN =====
    document.getElementById('btnLogin').addEventListener('click', () => {
      const u = document.getElementById('loginUser').value.trim();
      const p = document.getElementById('loginPass').value;
      login(u, p);
    });

    // ===== TEACHER LOGIN =====
    const tBtn = document.getElementById('btnTeacherLogin');
    if (tBtn) {
      tBtn.addEventListener('click', async () => {
        const u = prompt('Teacher username or name:');
        if (!u) return;
        const p = prompt('Password:');
        if (p === null) return;

        const users = await fetchUsers();
        const teacher = users.find(usr =>
          usr.role === 'teacher' &&
          usr.username.trim().toLowerCase() === u.trim().toLowerCase() &&
          usr.password === p
        );

        if (teacher) {
          saveData('currentUser', { id: teacher.id, name: teacher.name || teacher.username, role: 'teacher' });
          window.location.href = 'teacher.html';
        } else {
          alert('Invalid teacher credentials');
        }
      });
    }

    // ===== STUDENT LOGIN — open modal =====
    document.getElementById('btnStudentLogin').addEventListener('click', () => {
      document.getElementById('studentLoginModal').style.display = 'flex';
    });

    // ===== STUDENT LOGIN — cancel =====
    document.getElementById('btnCancelStudent').addEventListener('click', () => {
      document.getElementById('studentLoginModal').style.display = 'none';
    });

    // ===== STUDENT LOGIN — confirm =====
    document.getElementById('btnConfirmStudent').addEventListener('click', async () => {
      const studentId = document.getElementById('inputStudentId').value.trim();
      const password  = document.getElementById('inputStudentPass').value;

      if (!studentId || !password) {
        alert('Please enter your Student ID and password');
        return;
      }

      const students = await fetchStudents();
      const student = students.find(s => s.id === studentId && s.password === password);

      if (student) {
        saveData('currentUser', {
          id: student.id,
          name: student.name,
          studentId: student.id,
          className: student.class,
          role: 'student'
        });
        window.location.href = 'student.html';
      } else {
        alert('Invalid Student ID or password');
      }
    });

  });
})();
