 const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const Store = require('../models/store');

const ADMIN = {
    username: 'admin',
    password: bcrypt.hashSync('admin123', 10)
};

// ── ADMIN LOGIN ──
router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    if (username === ADMIN.username && bcrypt.compareSync(password, ADMIN.password)) {
        const token = jwt.sign({ username, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '8h' });
        return res.json({ token, role: 'admin', name: 'Administrator' });
    }
    return res.status(401).json({ error: 'Invalid username or password' });
});

// ── TEACHER LOGIN ──
router.post('/teacher-login', async (req, res) => {
    try {
        const { username, password } = req.body;
        console.log('Teacher login attempt:', username);

        const record = await Store.findOne({ where: { key: 'teachers' } });
        const teachers = record ? JSON.parse(record.value) : [];
        console.log('Teachers found:', teachers.map(t => t.name + '|' + t.id));

        const teacher = teachers.find(t =>
            t.email === username || t.name === username || 
            t.id === username || t.username === username
        );
        console.log('Matched:', teacher ? teacher.name : 'NONE');

        if (!teacher) return res.status(401).json({ error: 'Teacher not found' });

        const correctPassword = teacher.password || String(teacher.id);
        if (password !== correctPassword) {
            return res.status(401).json({ error: 'Incorrect password' });
        }

        const token = jwt.sign(
            { id: teacher.id, name: teacher.name, role: 'teacher' },
            process.env.JWT_SECRET,
            { expiresIn: '8h' }
        );
        res.json({ token, role: 'teacher', name: teacher.name, id: teacher.id });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

// ── STUDENT LOGIN ──
router.post('/student-login', async (req, res) => {
    try {
        const { studentId, password } = req.body;
        const record = await Store.findOne({ where: { key: 'students' } });
        const students = record ? JSON.parse(record.value) : [];
        console.log('Looking for student ID:', studentId);

       const student = students.find(s => s.id === studentId || s.studentId === studentId);
        if (!student) return res.status(401).json({ error: 'Student ID not found' });

         let passwordMatch = false;
        if (student.password && student.password.startsWith('$2')) {
    // bcrypt hashed password
    passwordMatch = await bcrypt.compare(password, student.password);
        } else {
    // plain text password (old students)
            passwordMatch = password === (student.password || student.id || student.studentId);
        }
        if (!passwordMatch) {
            return res.status(401).json({ error: 'Incorrect password' });
        }
        const token = jwt.sign({ id: student.id, role: 'student' }, process.env.JWT_SECRET, { expiresIn: '8h' });
        res.json({ token, role: 'student', name: student.name, studentId: student.id, id: student.id, className: student.class || '' });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;