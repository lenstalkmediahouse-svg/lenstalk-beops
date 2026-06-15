/**
 * RESTORE MISSING CLIENTS
 * Reads all unique client names from content_tasks and adds any that
 * are missing from the `clients` collection.
 *
 * Run: node scripts/restore-missing-clients.js
 * Dry run: node scripts/restore-missing-clients.js --dry-run
 */

const mongoose = require('mongoose');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/lenstalk_ops';
const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  console.log(`🔍 Connecting to MongoDB... (${DRY_RUN ? 'DRY RUN — no changes will be made' : 'LIVE MODE'})`);
  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db;

  // Step 1: Get all unique client names from content_tasks (active, not archived)
  const contentTasksColl = db.collection('content_tasks');
  const tasks = await contentTasksColl.find({ isArchived: { $ne: true } }, { projection: { client: 1 } }).toArray();
  const clientsInTasks = [...new Set(tasks.map(t => t.client).filter(Boolean))].sort();

  console.log(`\n📋 Unique clients found in content_tasks (${clientsInTasks.length}):`);
  clientsInTasks.forEach(c => console.log(`  - "${c}"`));

  // Step 2: Get all existing clients in the clients collection
  const clientsColl = db.collection('clients');
  const existingClients = await clientsColl.find({}).toArray();
  const existingNames = existingClients.map(c => (c.clientName || c.name || '').trim().toLowerCase());

  console.log(`\n🗄️  Existing clients in DB (${existingClients.length}):`);
  existingClients.forEach(c => console.log(`  ✅ "${c.clientName || c.name}" [${c.status}]`));

  // Step 3: Find which ones are missing
  const toAdd = clientsInTasks.filter(name => !existingNames.includes(name.trim().toLowerCase()));

  console.log(`\n🚨 Missing clients that will be restored (${toAdd.length}):`);
  if (toAdd.length === 0) {
    console.log('  ✅ All clients already exist in the clients collection!');
    await mongoose.disconnect();
    return;
  }

  toAdd.forEach(c => {
    const taskCount = tasks.filter(t => t.client === c).length;
    console.log(`  ❌ "${c}" — ${taskCount} task(s) referencing this client`);
  });

  if (DRY_RUN) {
    console.log('\n🔒 DRY RUN — no changes made. Remove --dry-run to apply.');
    await mongoose.disconnect();
    return;
  }

  // Step 4: Insert missing clients
  // Find the last clientCode to continue numbering
  const lastClient = await clientsColl.findOne({}, { sort: { clientCode: -1 }, projection: { clientCode: 1 } });
  let nextNum = 1;
  if (lastClient?.clientCode) {
    const match = lastClient.clientCode.match(/\d+$/);
    if (match) nextNum = parseInt(match[0], 10) + 1;
  }

  const insertDocs = toAdd.map((name, i) => ({
    name: name,
    clientName: name,
    clientCode: `LM-CLT-${String(nextNum + i).padStart(4, '0')}`,
    status: 'active',
    isArchived: false,
    notes: 'Restored from content_tasks history on ' + new Date().toISOString(),
    createdAt: new Date(),
    updatedAt: new Date(),
  }));

  await clientsColl.insertMany(insertDocs);

  console.log(`\n✅ Successfully restored ${toAdd.length} clients:`);
  insertDocs.forEach(d => console.log(`  ✅ "${d.name}" → Code: ${d.clientCode}`));

  await mongoose.disconnect();
  console.log('\n🎉 Done! Refresh the app to see all clients restored in Client Management.');
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
