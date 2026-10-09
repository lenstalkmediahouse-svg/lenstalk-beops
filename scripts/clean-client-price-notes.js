/**
 * Lenstalk OPS — Clean pricing info from auto-created client notes
 * Usage: node scripts/clean-client-price-notes.js [--dry-run]
 *
 * Removes " · Final price ₹X,XX,XXX" from client notes that were
 * auto-populated when a lead moved to WON stage.
 * This ensures Operations panel never sees Sales pricing.
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');

const DRY_RUN = process.argv.includes('--dry-run');
const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;

if (!MONGO_URI) {
  console.error('ERROR: MONGO_URI not set in environment / .env');
  process.exit(1);
}

// Matches: " · Final price ₹1,23,456" (with or without commas)
const PRICE_PATTERN = /\s*·\s*Final price ₹[\d,]+/gi;

async function run() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB\n');

  const db = mongoose.connection.db;
  const col = db.collection('clients');

  // Find all clients whose notes contain pricing info
  const affected = await col.find({
    notes: { $regex: 'Final price', $options: 'i' }
  }).toArray();

  console.log(`Found ${affected.length} client(s) with pricing in notes.\n`);

  let fixed = 0;
  for (const c of affected) {
    const original = c.notes || '';
    const cleaned  = original.replace(PRICE_PATTERN, '').trim();

    if (DRY_RUN) {
      console.log(`[DRY-RUN] "${c.name || c.clientName}":`);
      console.log(`  Before: ${original}`);
      console.log(`  After:  ${cleaned}\n`);
    } else {
      await col.updateOne({ _id: c._id }, { $set: { notes: cleaned, updatedAt: new Date() } });
      console.log(`  ✓ Cleaned: "${c.name || c.clientName}"`);
      fixed++;
    }
  }

  if (!DRY_RUN) console.log(`\n✅ ${fixed} client(s) cleaned.`);
  if (DRY_RUN) console.log('(DRY-RUN — no changes written)');

  await mongoose.disconnect();
  console.log('Done.');
}

run().catch(err => { console.error(err); process.exit(1); });
