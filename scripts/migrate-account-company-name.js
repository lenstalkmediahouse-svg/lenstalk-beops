/**
 * Lenstalk OPS — Migrate Account Company Name
 * Usage:  node scripts/migrate-account-company-name.js [--dry-run]
 *
 * Collections: lenstalk_account_logs_v1, lenstalk_account_slips_v1
 * Rule: Where clientName is non-empty AND (companyName is empty OR equals 'Lenstalk Media')
 *       → set companyName = clientName
 * Does NOT delete clientName.
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');

const DRY_RUN = process.argv.includes('--dry-run');
const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;

if (!MONGO_URI) {
  console.error('ERROR: MONGO_URI not set in environment / .env');
  process.exit(1);
}

async function migrateCollection(db, collectionName) {
  const col = db.collection(collectionName);
  const docs = await col.find({
    $or: [
      { companyName: { $exists: false } },
      { companyName: '' },
      { companyName: 'Lenstalk Media' },
    ],
    clientName: { $exists: true, $ne: '' },
  }).toArray();

  console.log(`\n[${collectionName}] ${docs.length} document(s) to migrate`);

  let written = 0, errors = 0;
  for (const doc of docs) {
    if (DRY_RUN) {
      console.log(`  [DRY-RUN] ${doc._id}: companyName "${doc.companyName}" → "${doc.clientName}"`);
    } else {
      try {
        await col.updateOne(
          { _id: doc._id },
          { $set: { companyName: doc.clientName } }
        );
        written++;
      } catch (err) {
        console.error(`  ERROR ${doc._id}: ${err.message}`);
        errors++;
      }
    }
  }

  if (!DRY_RUN) {
    console.log(`  Written: ${written}  Errors: ${errors}`);
  }
  return docs.length;
}

async function run() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB');

  const db = mongoose.connection.db;

  const logsCount  = await migrateCollection(db, 'lenstalk_account_logs_v1');
  const slipsCount = await migrateCollection(db, 'lenstalk_account_slips_v1');

  console.log('\n── Summary ─────────────────────────');
  console.log(`  account_logs:  ${logsCount} to migrate`);
  console.log(`  account_slips: ${slipsCount} to migrate`);
  if (DRY_RUN) console.log('  (DRY-RUN — no changes written)');

  await mongoose.disconnect();
  console.log('Done.');
}

run().catch(err => { console.error(err); process.exit(1); });
