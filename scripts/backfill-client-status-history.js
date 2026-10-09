/**
 * Lenstalk OPS — Backfill Client Status History
 * Usage:  node scripts/backfill-client-status-history.js [--dry-run]
 *
 * For existing clients with no statusHistory:
 *  - Adds { status: 'active', changedAt: createdAt } as first entry
 *  - If current status is 'paused' or 'inactive', also adds
 *    { status: currentStatus, changedAt: updatedAt }
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');

const DRY_RUN = process.argv.includes('--dry-run');
const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;

if (!MONGO_URI) {
  console.error('ERROR: MONGO_URI not set in environment / .env');
  process.exit(1);
}

async function run() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB');

  const db = mongoose.connection.db;
  const col = db.collection('clients');

  const allClients = await col.find({}).toArray();
  let needsBackfill = 0;
  let alreadyDone  = 0;
  let written      = 0;
  let errors       = 0;

  for (const client of allClients) {
    if (Array.isArray(client.statusHistory) && client.statusHistory.length > 0) {
      alreadyDone++;
      continue;
    }

    needsBackfill++;
    const history = [];

    // First entry: active at creation time
    history.push({
      status: 'active',
      changedAt: client.createdAt || new Date('2024-01-01'),
    });

    // If currently paused or inactive, add a second entry
    if (['paused', 'inactive'].includes(client.status)) {
      history.push({
        status: client.status,
        changedAt: client.updatedAt || new Date(),
      });
    }

    if (DRY_RUN) {
      console.log(`[DRY-RUN] Would backfill: ${client.name || client.clientName || client._id} → ${JSON.stringify(history.map(h => h.status))}`);
    } else {
      try {
        await col.updateOne(
          { _id: client._id },
          { $set: { statusHistory: history } }
        );
        written++;
      } catch (err) {
        console.error(`  ERROR updating ${client._id}: ${err.message}`);
        errors++;
      }
    }
  }

  console.log('\n── Summary ─────────────────────────');
  console.log(`  Total clients:    ${allClients.length}`);
  console.log(`  Already done:     ${alreadyDone}`);
  console.log(`  Need backfill:    ${needsBackfill}`);
  if (!DRY_RUN) {
    console.log(`  Written:          ${written}`);
    console.log(`  Errors:           ${errors}`);
  } else {
    console.log('  (DRY-RUN — no changes written)');
  }

  await mongoose.disconnect();
  console.log('Done.');
}

run().catch(err => { console.error(err); process.exit(1); });
