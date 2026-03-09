const Store = require('./models/store');

async function fix() {
    const r = await Store.findOne({ where: { key: 'students' } });
    const students = JSON.parse(r.value);
    console.log('Students before:', students.map(s => s.name + '|' + s.teacherId));
    const updated = students.map(s => ({ ...s, teacherId: 'T002' }));
    await Store.upsert({ key: 'students', value: JSON.stringify(updated) });
    console.log('Done! All students linked to T002');
}

fix().catch(console.error);