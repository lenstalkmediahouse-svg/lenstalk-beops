/**
 * backupCron.js — Server-side daily backup running inside the Render process.
 *
 * WHY server-side: The previous backup script ran on a local Mac — it failed
 * whenever the laptop was offline or Atlas IP whitelist changed. Since this
 * server is already whitelisted by Atlas, running the backup here guarantees
 * connectivity and removes the Mac dependency.
 *
 * Schedule: Daily at 11:30 PM IST (18:00 UTC).
 * Storage : Local disk at backups/<date>/snapshot.json
 *           (On Render free tier the disk is ephemeral — also writes a
 *            compressed summary to console so logs.render.com captures it.)
 *
 * Alert   : On failure, writes to audit log + console.error so Render alerts
 *           can catch it (configure Render log-based alert on "BACKUP_FAILED").
 */

const cron = require('node-cron');
const mongoose = require('mongoose');
const fs   = require('fs');
const path = require('path');
const auditLog = require('../middleware/auditLogger');

const BACKUP_DIR = path.join(__dirname, '../../backups');
const MAX_BACKUPS = 10; // keep last 10 daily snapshots (rotate older ones)

async function runBackup() {
  const startedAt = new Date();
  const dateStr = startedAt.toISOString().slice(0, 10);
  const timeStr = startedAt.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backupFolder = path.join(BACKUP_DIR, timeStr);

  console.log(`[BACKUP] ⏳ Starting daily backup — ${startedAt.toISOString()}`);

  try {
    const db = mongoose.connection.db;
    if (!db) throw new Error('MongoDB connection not available');

    const collections = await db.listCollections().toArray();
    const snapshot = {
      backupDate: startedAt.toISOString(),
      database: db.databaseName,
      collections: {},
      summary: {},
    };

    let totalRecords = 0;
    for (const col of collections) {
      const name = col.name;
      if (name.startsWith('system.')) continue;
      const docs = await db.collection(name).find({}).toArray();
      snapshot.collections[name] = docs;
      snapshot.summary[name] = docs.length;
      totalRecords += docs.length;
    }

    // Write to disk
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
    if (!fs.existsSync(backupFolder)) fs.mkdirSync(backupFolder, { recursive: true });

    const snapshotPath = path.join(backupFolder, 'snapshot.json');
    fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2), 'utf8');

    // Write readable log entry
    const logLine = `✅ Backup complete! | Date: ${timeStr} | Collections: ${collections.length} | Records: ${totalRecords}\n`;
    fs.appendFileSync(path.join(BACKUP_DIR, 'backup.log'), logLine, 'utf8');

    console.log(`[BACKUP] ✅ SUCCESS — ${collections.length} collections | ${totalRecords} records → ${snapshotPath}`);

    // Rotate old backups — keep only last MAX_BACKUPS folders
    const allBackups = fs.readdirSync(BACKUP_DIR)
      .filter(f => fs.statSync(path.join(BACKUP_DIR, f)).isDirectory())
      .sort(); // oldest first (ISO date prefix sorts correctly)
    if (allBackups.length > MAX_BACKUPS) {
      const toDelete = allBackups.slice(0, allBackups.length - MAX_BACKUPS);
      for (const old of toDelete) {
        fs.rmSync(path.join(BACKUP_DIR, old), { recursive: true, force: true });
        console.log(`[BACKUP] 🗑 Rotated old backup: ${old}`);
      }
    }

    auditLog.write({
      action: 'BACKUP_SUCCESS',
      actor: 'system-cron',
      details: `Daily backup completed | ${collections.length} collections | ${totalRecords} records | Path: ${snapshotPath}`,
      module: 'Backup Cron',
      ip: 'server',
    });
  } catch (err) {
    const errMsg = `[BACKUP] ❌ BACKUP_FAILED — ${err.message}`;
    console.error(errMsg);

    // Append failure to log
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
    fs.appendFileSync(
      path.join(BACKUP_DIR, 'backup.log'),
      `❌ Backup FAILED | Date: ${dateStr} | Error: ${err.message}\n`,
      'utf8'
    );

    // Alert via audit log — Render log-based alerts can catch "BACKUP_FAILED"
    auditLog.write({
      action: 'BACKUP_FAILED',
      actor: 'system-cron',
      details: `Daily backup FAILED: ${err.message}`,
      module: 'Backup Cron',
      ip: 'server',
    });
  }
}

/**
 * Schedule: 11:30 PM IST = 18:00 UTC daily.
 * Cron expression: '0 18 * * *' (UTC)
 */
function startBackupCron() {
  cron.schedule('0 18 * * *', () => {
    runBackup().catch(err => console.error('[BACKUP] Unhandled error in runBackup:', err.message));
  }, {
    timezone: 'UTC',
  });
  console.log('[BACKUP] 📅 Daily backup cron scheduled: 11:30 PM IST (18:00 UTC) every day');
}

module.exports = { startBackupCron, runBackup };
