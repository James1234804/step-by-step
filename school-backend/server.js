 const express = require('express');
const cors = require('cors');
const path = require('path');
const sequelize = require('./db');
const authMiddleware = require('./middleware/auth');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(express.static(__dirname));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'login.html'));
});



const Store = require('./models/store');
const { uploadBackup } = require('./backup');

async function getStore(key) {
    const record = await Store.findOne({ where: { key } });
    return record ? JSON.parse(record.value) : [];
}
async function setStore(key, data) {
    await Store.upsert({ key, value: JSON.stringify(data) });
}

// ── ROUTES ──
app.use('/api/auth', require('./routes/auth'));
app.use('/api/teacher', require('./routes/teacher'));

// ── SYNC ──
app.get('/api/sync', authMiddleware, async (req, res) => {
    try {
        const keys = ['students', 'teachers', 'classes', 'timetables','studentTimetables' ,'fees', 'attendance', 'work', 'submissions','announcements'];
        const result = {};
        for (const key of keys) {
            result[key] = await getStore(key);
        }
        res.json(result);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/sync', authMiddleware, async (req, res) => {
    try {
        const { key, data } = req.body;
        const allowed = ['students', 'teachers', 'classes', 'timetables', 'studentTimetables','fees', 'attendance', 'attendanceNotifications', 'work','announcements','submissions'];
        if (!allowed.includes(key)) {
            return res.status(400).json({ error: 'Unknown key' });
        }
        await setStore(key, data);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ── BACKUP ──
async function runDailyBackup() {
    try {
        const keys = ['students', 'teachers', 'classes', 'timetables', 'fees', 'attendance', 'work'];
        const data = {};
        for (const key of keys) {
            data[key] = await getStore(key);
        }
        await uploadBackup(data);
    } catch(e) {
        console.error('Daily backup error:', e.message);
    }
}

setInterval(runDailyBackup, 24 * 60 * 60 * 1000);
runDailyBackup();

sequelize.sync().then(() => {
    console.log('Database ready!');
    app.listen(3000, () => console.log('Server running on port 3000'));
});