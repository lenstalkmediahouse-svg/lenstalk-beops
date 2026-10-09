/**
 * Lenstalk OPS — Migrate Content Statuses
 * Usage:  node scripts/migrate-content-statuses.js [--dry-run]
 *
 * Maps deprecated status values to their D5 replacements:
 *   draft                  → planned
 *   shoot_scheduled        → scripted
 *   shot                   → scripted
 *   pending_client_approval→ approved_by_admin
 *   delayed                → planned  (overdue is now derived from deadline)
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');

const DRY_RUN = process.argv.includes('--dry-run');
const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;

if (!MONGO_URI) {
  console.error('ERROR: MONGO_URI not set in environment / .env');
  process.exit(1);
}

const MIGRATIONS = [
  { from: 'draft',                   to: 'planned' },
  { from: 'shoot_scheduled',         to: 'scripted' },
  { from: 'shot',                    to: 'scripted' },
  { from: 'pending_client_approval', to: 'approved_by_admin' },
  { from: 'delayed',                 to: 'planned' },
];

async function run() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB');

  const db = mongoose.connection.db;
  const col = db.collection('content_tasks');

  const summary = {};

  for (const { from, to } of MIGRATIONS) {
    const docs = await col.find({ workflowStatus: from, isArchived: { $ne: true } }).toArray();
    summary[from] = { count: docs.length, to };

    if (DRY_RUN) {
      console.log(`[DRY-RUN] "${from}" → "${to}": ${docs.length} document(s)`);
    } else {
      if (docs.length === 0) { console.log(`  "${from}" → "${to}": 0 documents (skipping)`); continue; }
      const result = await col.updateMany(
        { workflowStatus: from, isArchived: { $ne: true } },
        { $set: { workflowStatus: to, updatedAt: new Date() } }
      );
      console.log(`  "${from}" → "${to}": ${result.modifiedCount} updated`);
    }
  }

  console.log('\n── Summary ─────────────────────────');
  let total = 0;
  for (const [from, { count, to }] of Object.entries(summary)) {
    console.log(`  ${from.padEnd(30)} → ${to.padEnd(20)} (${count})`);
    total += count;
  }
  console.log(`  Total affected: ${total}`);
  if (DRY_RUN) console.log('  (DRY-RUN — no changes written)');

  await mongoose.disconnect();
  console.log('Done.');
}

run().catch(err => { console.error(err); process.exit(1); });
