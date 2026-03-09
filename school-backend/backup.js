 const fs = require('fs');
const path = require('path');

async function uploadBackup(data) {
    try {
        const backupFolder = path.join(__dirname, 'backups');
        
        // Create backups folder if it doesn't exist
        if (!fs.existsSync(backupFolder)) {
            fs.mkdirSync(backupFolder);
        }

        const date = new Date().toISOString().split('T')[0];
        const fileName = `shalom_backup_${date}.json`;
        const filePath = path.join(backupFolder, fileName);

        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        console.log(`✓ Backup saved locally: ${fileName}`);

        // Keep only last 30 backups
        const files = fs.readdirSync(backupFolder)
            .filter(f => f.endsWith('.json'))
            .sort();
        if (files.length > 30) {
            fs.unlinkSync(path.join(backupFolder, files[0]));
        }

        return true;
    } catch(e) {
        console.error('Backup failed:', e.message);
        return false;
    }
}

module.exports = { uploadBackup };