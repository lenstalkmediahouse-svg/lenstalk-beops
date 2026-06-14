#!/usr/bin/env node
/**
 * LENSTALK OS — AUTO BACKUP SETUP
 * Sets up a daily automatic backup at 2:00 AM using macOS launchd.
 * Completely free — no paid services needed.
 *
 * Run once:  node setup-auto-backup.js
 * Remove:    node setup-auto-backup.js --remove
 */

const fs   = require('fs');
const path = require('path');
const os   = require('os');
const { execSync } = require('child_process');

const PLIST_NAME = 'com.lenstalk.backup';
const PLIST_PATH = path.join(os.homedir(), 'Library', 'LaunchAgents', `${PLIST_NAME}.plist`);
const BACKUP_SCRIPT = path.resolve(__dirname, 'backup.js');
const LOG_PATH = path.join(__dirname, 'backups', 'backup.log');

const args = process.argv.slice(2);

// ─── REMOVE ──────────────────────────────────────────────────
if (args.includes('--remove')) {
  try {
    execSync(`launchctl unload "${PLIST_PATH}" 2>/dev/null || true`);
    if (fs.existsSync(PLIST_PATH)) fs.unlinkSync(PLIST_PATH);
    console.log('✅ Auto-backup removed. Daily backup is now DISABLED.');
  } catch (e) {
    console.log('Done. Auto-backup plist removed.');
  }
  process.exit(0);
}

// ─── INSTALL ─────────────────────────────────────────────────
// Ensure backup log directory exists
fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });

// Find node executable path
let nodePath;
try {
  nodePath = execSync('which node').toString().trim();
} catch {
  nodePath = '/usr/local/bin/node';
}

// Find .env path
const envPath = path.join(__dirname, '.env');

const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${PLIST_NAME}</string>

  <key>ProgramArguments</key>
  <array>
    <string>${nodePath}</string>
    <string>${BACKUP_SCRIPT}</string>
  </array>

  <key>WorkingDirectory</key>
  <string>${__dirname}</string>

  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/usr/local/bin:/usr/bin:/bin</string>
  </dict>

  <!-- Run daily at 02:00 AM -->
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>2</integer>
    <key>Minute</key>
    <integer>0</integer>
  </dict>

  <key>StandardOutPath</key>
  <string>${LOG_PATH}</string>
  <key>StandardErrorPath</key>
  <string>${LOG_PATH}</string>

  <!-- Run on next opportunity if missed (e.g. Mac was off at 2 AM) -->
  <key>RunAtLoad</key>
  <false/>
</dict>
</plist>
`;

// Write plist
fs.writeFileSync(PLIST_PATH, plistContent, 'utf8');
console.log(`✅ Plist written to: ${PLIST_PATH}`);

// Unload first (in case old version loaded)
try { execSync(`launchctl unload "${PLIST_PATH}" 2>/dev/null`); } catch (_) {}

// Load the plist
try {
  execSync(`launchctl load "${PLIST_PATH}"`);
  console.log('✅ Auto-backup loaded into launchd!');
} catch (e) {
  console.error('⚠️  launchctl load failed:', e.message);
}

// Verify
try {
  const result = execSync(`launchctl list | grep lenstalk`).toString().trim();
  console.log(`\n✅ Confirmed running: ${result}`);
} catch {
  console.log('\n✅ Setup complete. (Use: launchctl list | grep lenstalk to verify)');
}

console.log(`
═══════════════════════════════════════════════════
  ✅ LENSTALK OS AUTO-BACKUP ACTIVE
═══════════════════════════════════════════════════
  Schedule : Every day at 2:00 AM
  Script   : ${BACKUP_SCRIPT}
  Log file : ${LOG_PATH}
  Backups  : ${path.join(__dirname, 'backups')} (last 14 kept)
═══════════════════════════════════════════════════

  Commands:
  • Run backup now  : node backup.js
  • List backups    : node backup.js --list
  • Remove schedule : node setup-auto-backup.js --remove
═══════════════════════════════════════════════════
`);
