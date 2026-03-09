 const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const Store = require('../models/store');

// File upload setup
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const storage = multer.diskStorage({
    destination: uploadDir,
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage });

async function getStore(key) {
    const record = await Store.findOne({ where: { key } });
    return record ? JSON.parse(record.value) : [];
}
async function setStore(key, data) {
    await Store.upsert({ key, value: JSON.stringify(data) });
}

// ── GET TEACHER'S CLASS ──
router.get('/class', authMiddleware, async (req, res) => {
    try {
        const { teacherId } = req.query;
        const students = await getStore('students');
        const mine = students.filter(s => s.teacherId === teacherId);
        res.json({ students: mine });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

// ── CREATE STUDENT ACCOUNT ──
router.post('/create-student', authMiddleware, async (req, res) => {
    try {
        const { name, studentId, password, teacherId } = req.body;
        let students = await getStore('students');

        if (students.find(s => s.studentId === studentId)) {
            return res.json({ success: false, message: 'Student ID already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newStudent = {
            id: String(Date.now()),
            name,
            studentId,
            password: hashedPassword,
            teacherId,
            createdAt: new Date().toISOString()
        };

        students.push(newStudent);
        await setStore('students', students);
        res.json({ success: true, student: { name } });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

// ── SEND WORK ──
router.post('/send-work', authMiddleware, upload.single('file'), async (req, res) => {
    try {
        console.log('Send work hit. Body:', req.body, 'File:', req.file);
        const { title, dueDate, teacherId } = req.body;
        const students = await getStore('students');
        const myStudents = students.filter(s => s.teacherId === teacherId);

        if (myStudents.length === 0) {
            return res.json({ success: false, message: 'No students in your class' });
        }

        let work = await getStore('work');
        const newWork = {
            id: 'W' + Date.now(),
            title,
            dueDate,
            teacherId,
            studentIds: myStudents.map(s => s.id),
            filePath: req.file ? req.file.filename : null,
            createdAt: new Date().toISOString()
        };

        work.push(newWork);
        await setStore('work', work);
        res.json({ success: true, studentCount: myStudents.length });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

// ── GET SENT WORK ──
router.get('/sent-work', authMiddleware, async (req, res) => {
    try {
        const { teacherId } = req.query;
        const work = await getStore('work');
        const mine = work.filter(w => w.teacherId === teacherId);
        res.json({ work: mine });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

// ── DOWNLOAD WORK FILE ──
router.get('/download/:workId', authMiddleware, async (req, res) => {
    try {
        const work = await getStore('work');
        const item = work.find(w => w.id === req.params.workId);
        if (!item || !item.filePath) return res.status(404).json({ error: 'File not found' });
        const filePath = path.join(uploadDir, item.filePath);
        res.download(filePath);
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

// ── SUBMIT WORK ──
router.post('/submit-work', authMiddleware, async (req, res) => {
    try {
        const { workId, studentId } = req.body;
        let submissions = await getStore('submissions');
        if (!Array.isArray(submissions)) submissions = [];
        submissions.push({ workId, studentId, submittedAt: new Date().toISOString() });
        await setStore('submissions', submissions);
        res.json({ success: true });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

// ── REMOVE STUDENT ──
router.delete('/remove-student/:id', authMiddleware, async (req, res) => {
    try {
        let students = await getStore('students');
        students = students.filter(s => s.id !== req.params.id);
        await setStore('students', students);
        res.json({ success: true });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;