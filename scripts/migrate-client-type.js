require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const Client = require('../src/modules/clients/client.model');

const DRY_RUN = process.argv.includes('--dry-run');
const FILTER = {
  clientType: { $exists: true, $nin: [null, ''] },
  $or: [{ projectType: { $exists: false } }, { projectType: null }, { projectType: '' }],
};

(async () => {
  await connectDB();
  const col = Client.collection;
  const count = await col.countDocuments(FILTER);
  if (DRY_RUN) {
    console.log(`[DRY-RUN] clients: ${count} document(s) would change`);
    console.log('(DRY-RUN — no changes written)');
  } else {
    const res = await col.updateMany(FILTER, [{ $set: { projectType: '$clientType' } }]);
    console.log(`clients: ${res.modifiedCount} updated`);
  }
  await mongoose.disconnect();
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
