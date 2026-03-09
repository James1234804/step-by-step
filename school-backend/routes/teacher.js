 const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const Store = require('../models/store');

const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const storage = multer.diskStorage({
    destination: uploadDir,
    filename: (req, file, cb) => { cb(null, Date.now() + path.extname(file.originalname)); }
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
        const { teacherName } = req.query;
        const classes = await getStore('classes');
        const students = await getStore('students');

        const myClasses = classes.filter(c => c.teacher === teacherName);
        const myClassNames = myClasses.map(c => c.name);
        const myStudents = students.filter(s => myClassNames.includes(s.class));

        res.json({ students: myStudents });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

// ── SET STUDENT CREDENTIALS ──
router.post('/set-credentials', authMiddleware, async (req, res) => {
    try {
        const { studentDbId, studentId, password } = req.body;
        let students = await getStore('students');
        const idx = students.findIndex(s => s.id === studentDbId);
        if(idx === -1) return res.status(404).json({ error: 'Student not found' });
        if(students.find(s => s.studentId === studentId && s.id !== studentDbId)){
            return res.json({ success: false, message: 'Student ID already taken' });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        students[idx] = { ...students[idx], studentId, password: hashedPassword };
        await setStore('students', students);
        res.json({ success: true, name: students[idx].name });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

// ── SEND WORK ──
router.post('/send-work', authMiddleware, upload.single('file'), async (req, res) => {
    try {
        const { title, dueDate, teacherName } = req.body;
        console.log('Send work - teacherName:', teacherName);

        const classes = await getStore('classes');
        const students = await getStore('students');

        // Find classes assigned to this teacher
        const myClasses = classes.filter(c => c.teacher === teacherName);
        const myClassNames = myClasses.map(c => c.name);
        console.log('My classes:', myClassNames);

        // Find students in those classes
        const myStudents = students.filter(s => myClassNames.includes(s.class));
        console.log('My students count:', myStudents.length);

        if(myStudents.length === 0) {
            return res.json({ success: false, message: 'No students in your class' });
        }

        let work = await getStore('work');
        const newWork = {
            id: 'W' + Date.now(),
            title,
            dueDate,
            teacherName,
            classNames: myClassNames,
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

// ── GET SENT WORK (teacher) ──
router.get('/sent-work', authMiddleware, async (req, res) => {
    try {
        const { teacherName } = req.query;
        const work = await getStore('work');
        const mine = work.filter(w => w.teacherName === teacherName || w.teacherId === teacherName);
        res.json({ work: mine });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

// ── GET STUDENT WORK ──
router.get('/student-work', authMiddleware, async (req, res) => {
    try {
        const { studentId } = req.query;
        console.log('Getting work for studentId:', studentId);

        const students = await getStore('students');
        const student = students.find(s => s.id === studentId || s.studentId === studentId);
        if(!student) return res.json({ work: [] });

        const work = await getStore('work');
        // Show work where this student's id is in studentIds
        const myWork = work.filter(w => w.studentIds && w.studentIds.includes(student.id));
        console.log('Work found for student:', myWork.length);

        res.json({ work: myWork });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

// ── DOWNLOAD WORK FILE ──
router.get('/download/:workId', async (req, res) => {
    try {
        const token = req.query.token || (req.headers['authorization'] && req.headers['authorization'].split(' ')[1]);
        if(!token) return res.status(401).json({ error: 'Missing token' });
        const jwt = require('jsonwebtoken');
        jwt.verify(token, process.env.JWT_SECRET);
        const work = await getStore('work');
        const item = work.find(w => w.id === req.params.workId);
        if(!item || !item.filePath) return res.status(404).json({ error: 'File not found' });
        res.download(path.join(uploadDir, item.filePath));
    } catch(e) {
        res.status(403).json({ error: 'Invalid token' });
    }
});
// ── SUBMIT WORK ──
router.post('/submit-work', authMiddleware, async (req, res) => {
    try {
        const { workId, studentId } = req.body;
        let submissions = await getStore('submissions');
        if(!Array.isArray(submissions)) submissions = [];
        submissions.push({ workId, studentId, submittedAt: new Date().toISOString() });
        await setStore('submissions', submissions);
        res.json({ success: true });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

// ── GET STUDENT FEES ──
router.get('/student-fees', authMiddleware, async (req, res) => {
    try {
        const { studentId } = req.query;
        const students = await getStore('students');
        const student = students.find(s => s.id === studentId || s.studentId === studentId);
        if(!student) return res.json({ fees: [], totalDue: 0, totalPaid: 0, balance: 0 });

        const fees = await getStore('fees');
        const settingsRec = await Store.findOne({ where: { key: 'feeSettings' } });
        const settings = settingsRec ? JSON.parse(settingsRec.value) : { totalDue: 0 };
        const totalDue = settings.totalDue || 0;

        const studentFees = fees.filter(f => f.studentId === student.id);
        const totalPaid = studentFees.reduce((sum, f) => sum + (parseInt(f.amount) || 0), 0);
        const balance = totalDue - totalPaid;

        res.json({ fees: studentFees, totalDue, totalPaid, balance });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

// ── SAVE FEE SETTINGS ──
router.post('/fee-settings', authMiddleware, async (req, res) => {
    try {
        const { totalDue } = req.body;
        await Store.upsert({ key: 'feeSettings', value: JSON.stringify({ totalDue: parseInt(totalDue) }) });
        res.json({ success: true });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});
module.exports = router;