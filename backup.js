#!/usr/bin/env node
/**
 * LENSTALK OS — FREE MONGODB BACKUP SCRIPT
 * ==========================================
 * Exports all collections from MongoDB Atlas to local JSON files.
 * Free alternative to Atlas Continuous Backup.
 *
 * Usage:
 *   node backup.js              → Backup all collections
 *   node backup.js --restore    → List available backups
 *
 * Backup location: ./backups/YYYY-MM-DD_HH-MM-SS/
 * Each collection is saved as a separate .json file.
 *
 * Auto-run: Set up via launchd (see setup instructions at bottom).
 */

require('dotenv').config();
const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');

const MONGO_URI = process.env.MONGO_URI;
const DB_NAME   = 'lenstalk_os';
const BACKUP_DIR = path.join(__dirname, 'backups');

// Keep last N backups (older ones auto-deleted)
const MAX_BACKUPS_TO_KEEP = 14;

// ─────────────────────────────────────────────────────────────
async function backup() {
  if (!MONGO_URI) {
    console.error('❌ MONGO_URI not found in .env');
    process.exit(1);
  }

  const timestamp = new Date().toISOString()
    .replace('T', '_')
    .replace(/:/g, '-')
    .slice(0, 19);

  const backupPath = path.join(BACKUP_DIR, timestamp);
  fs.mkdirSync(backupPath, { recursive: true });

  const client = new MongoClient(MONGO_URI);
  let totalRecords = 0;
  let totalCollections = 0;

  try {
    console.log('🔌 Connecting to MongoDB Atlas...');
    await client.connect();
    const db = client.db(DB_NAME);

    const collections = await db.listCollections().toArray();
    console.log(`📦 Found ${collections.length} collections\n`);

    for (const col of collections) {
      const name = col.name;
      const docs = await db.collection(name).find({}).toArray();

      // Write each collection as a JSON file
      const filePath = path.join(backupPath, `${name}.json`);
      fs.writeFileSync(filePath, JSON.stringify(docs, null, 2), 'utf8');

      console.log(`  ✅ ${name.padEnd(45)} → ${docs.length} records`);
      totalRecords += docs.length;
      totalCollections++;
    }

    // Write a backup manifest
    const manifest = {
      backupDate: new Date().toISOString(),
      database: DB_NAME,
      totalCollections,
      totalRecords,
      collections: collections.map(c => c.name),
    };
    fs.writeFileSync(
      path.join(backupPath, '_manifest.json'),
      JSON.stringify(manifest, null, 2)
    );

    console.log(`\n✅ Backup complete!`);
    console.log(`   📁 Location : ${backupPath}`);
    console.log(`   📊 Collections: ${totalCollections}`);
    console.log(`   📝 Records    : ${totalRecords}`);

    // Auto-cleanup: delete old backups beyond MAX_BACKUPS_TO_KEEP
    cleanupOldBackups();

    return backupPath;

  } catch (err) {
    console.error('❌ Backup failed:', err.message);
    // Remove empty backup folder on failure
    try { fs.rmdirSync(backupPath); } catch (_) {}
    process.exit(1);
  } finally {
    await client.close();
  }
}

// ─────────────────────────────────────────────────────────────
function cleanupOldBackups() {
  if (!fs.existsSync(BACKUP_DIR)) return;

  const backups = fs.readdirSync(BACKUP_DIR)
    .filter(f => fs.statSync(path.join(BACKUP_DIR, f)).isDirectory())
    .sort() // ISO timestamps sort correctly alphabetically
    .reverse(); // newest first

  if (backups.length > MAX_BACKUPS_TO_KEEP) {
    const toDelete = backups.slice(MAX_BACKUPS_TO_KEEP);
    toDelete.forEach(folder => {
      const fullPath = path.join(BACKUP_DIR, folder);
      fs.rmSync(fullPath, { recursive: true, force: true });
      console.log(`🗑️  Deleted old backup: ${folder}`);
    });
  }
}

// ─────────────────────────────────────────────────────────────
function listBackups() {
  if (!fs.existsSync(BACKUP_DIR)) {
    console.log('No backups found yet. Run: node backup.js');
    return;
  }

  const backups = fs.readdirSync(BACKUP_DIR)
    .filter(f => fs.statSync(path.join(BACKUP_DIR, f)).isDirectory())
    .sort().reverse();

  if (backups.length === 0) {
    console.log('No backups found.');
    return;
  }

  console.log(`\n📂 Available backups (${backups.length}):\n`);
  backups.forEach((folder, i) => {
    const manifestPath = path.join(BACKUP_DIR, folder, '_manifest.json');
    if (fs.existsSync(manifestPath)) {
      const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      const size = getFolderSize(path.join(BACKUP_DIR, folder));
      console.log(`  ${i + 1}. ${folder}  |  ${m.totalRecords} records  |  ${m.totalCollections} collections  |  ${(size / 1024).toFixed(1)} KB`);
    } else {
      console.log(`  ${i + 1}. ${folder}`);
    }
  });

  console.log(`\n📁 Backup folder: ${BACKUP_DIR}\n`);
}

function getFolderSize(dir) {
  let size = 0;
  fs.readdirSync(dir).forEach(f => {
    size += fs.statSync(path.join(dir, f)).size;
  });
  return size;
}

// ─────────────────────────────────────────────────────────────
// MAIN
const args = process.argv.slice(2);
if (args.includes('--list') || args.includes('--restore')) {
  listBackups();
} else {
  backup();
}

/*
═══════════════════════════════════════════════════════
AUTO-BACKUP SETUP (Daily at 2 AM) — macOS launchd
═══════════════════════════════════════════════════════

Run this command once to enable daily automatic backups:

  node backup.js --setup-cron

OR manually:

1. Create the plist file:
   nano ~/Library/LaunchAgents/com.lenstalk.backup.plist

2. Paste the content from backup.plist (generated by --setup-cron)

3. Load it:
   launchctl load ~/Library/LaunchAgents/com.lenstalk.backup.plist

To check if it's running:
   launchctl list | grep lenstalk

To disable:
   launchctl unload ~/Library/LaunchAgents/com.lenstalk.backup.plist

═══════════════════════════════════════════════════════
*/
