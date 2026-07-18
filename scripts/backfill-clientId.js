/**
 * scripts/backfill-clientId.js
 *
 * One-time migration: backfill clientId (ObjectId) into existing records in all
 * collections that currently only store client name as a plain text string.
 *
 * Collections updated:
 *   - content_tasks           (field: client → clientId)
 *   - lenstalk_shoots_v1      (field: client → clientId)
 *   - lenstalk_influencer_edits_v1 (field: client → clientId)
 *   - lenstalk_account_slips_v1   (field: client → clientId)
 *   - lenstalk_account_logs_v1    (field: client → clientId)
 *   - lenstalk_prm_v1             (field: clientName → clientId)
 *   - shoot_campaigns             (field: client → clientId)
 *
 * ⚠️  BEFORE RUNNING: Take a fresh backup! (GET /api/users/backup/download as super_admin)
 * ⚠️  Run once. Re-running is safe — already-backfilled records are skipped.
 *
 * Usage:
 *   node scripts/backfill-clientId.js
 *
 * OR via npm (add to package.json):
 *   "scripts": { "backfill-clients": "node scripts/backfill-clientId.js" }
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || process.env.DATABASE_URL;
if (!MONGO_URI) {
  console.error('❌ MONGO_URI not set. Check your .env file.');
  process.exit(1);
}

// Reusable schema for generic collections
const genericSchema = new mongoose.Schema({}, { strict: false });
function getCollection(name) {
  try { return mongoose.model(name); } catch { return mongoose.model(name, genericSchema, name); }
}

const COLLECTIONS_CLIENT_FIELD = [
  'content_tasks',
  'lenstalk_shoots_v1',
  'lenstalk_influencer_edits_v1',
  'lenstalk_account_slips_v1',
  'lenstalk_account_logs_v1',
  'shoot_campaigns',
];

const COLLECTIONS_CLIENTNAME_FIELD = [
  'lenstalk_prm_v1', // stores clientName instead of client
];

async function run() {
  console.log('\n🔌 Connecting to MongoDB Atlas...');
  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected\n');

  const db = mongoose.connection.db;

  // Load all clients into a name→_id map (case-insensitive key)
  const rawClients = await db.collection('clients').find({}).toArray();
  const clientMap = new Map(); // lowercase name → { _id, name }
  for (const c of rawClients) {
    const n = (c.name || c.clientName || '').trim().toLowerCase();
    if (n) clientMap.set(n, { _id: c._id, name: c.name || c.clientName });
  }
  console.log(`📋 Loaded ${clientMap.size} clients from DB\n`);

  let grandTotal = 0;
  let grandMatched = 0;
  let grandUnmatched = 0;

  // Process collections that use `client` field
  for (const colName of COLLECTIONS_CLIENT_FIELD) {
    const records = await db.collection(colName).find({ clientId: { $exists: false }, client: { $exists: true, $ne: '' } }).toArray();
    let matched = 0, unmatched = 0;

    for (const rec of records) {
      const rawName = (rec.client || '').trim().toLowerCase();
      const found = clientMap.get(rawName);
      if (found) {
        await db.collection(colName).updateOne({ _id: rec._id }, { $set: { clientId: found._id } });
        matched++;
      } else {
        unmatched++;
        console.warn(`  ⚠️  [${colName}] No client match for: "${rec.client}" (record _id: ${rec._id})`);
      }
    }

    console.log(`  ✅ ${colName}: ${records.length} records scanned → ${matched} matched, ${unmatched} unmatched`);
    grandTotal += records.length;
    grandMatched += matched;
    grandUnmatched += unmatched;
  }

  // Process collections that use `clientName` field (e.g. PRM)
  for (const colName of COLLECTIONS_CLIENTNAME_FIELD) {
    const records = await db.collection(colName).find({ clientId: { $exists: false }, clientName: { $exists: true, $ne: '' } }).toArray();
    let matched = 0, unmatched = 0;

    for (const rec of records) {
      const rawName = (rec.clientName || '').trim().toLowerCase();
      const found = clientMap.get(rawName);
      if (found) {
        await db.collection(colName).updateOne({ _id: rec._id }, { $set: { clientId: found._id } });
        matched++;
      } else {
        unmatched++;
        console.warn(`  ⚠️  [${colName}] No client match for clientName: "${rec.clientName}" (record _id: ${rec._id})`);
      }
    }

    console.log(`  ✅ ${colName}: ${records.length} records scanned → ${matched} matched, ${unmatched} unmatched`);
    grandTotal += records.length;
    grandMatched += matched;
    grandUnmatched += unmatched;
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`✅ BACKFILL COMPLETE`);
  console.log(`   Total records scanned : ${grandTotal}`);
  console.log(`   clientId backfilled   : ${grandMatched}`);
  console.log(`   Unmatched (orphaned)  : ${grandUnmatched}`);
  if (grandUnmatched > 0) {
    console.log(`\n   ⚠️  ${grandUnmatched} records could not be matched to any client.`);
    console.log(`      These are likely orphaned records from deleted/renamed clients.`);
    console.log(`      Run GET /api/integrity/check to investigate further.`);
  }
  console.log(`${'='.repeat(60)}\n`);

  await mongoose.disconnect();
  process.exit(0);
}

run().catch(err => {
  console.error('❌ Backfill failed:', err.message);
  process.exit(1);
});
