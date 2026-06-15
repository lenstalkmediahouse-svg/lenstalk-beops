/**
 * Diagnostic Script: Find clients referenced in content_tasks
 * but missing from the clients collection.
 *
 * Run: node scripts/find-missing-clients.js
 */

const mongoose = require('mongoose');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/lenstalk_ops';

async function main() {
  console.log('🔍 Connecting to MongoDB...');
  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db;

  // Step 1: Get all client names used in content_tasks
  const contentTasksColl = db.collection('lenstalk_content_tasks');
  const tasks = await contentTasksColl.find({}, { projection: { client: 1 } }).toArray();
  const clientsInTasks = [...new Set(tasks.map(t => t.client).filter(Boolean))].sort();
  console.log(`\n📋 Unique client names found in content_tasks (${clientsInTasks.length}):`);
  clientsInTasks.forEach(c => console.log(`  - "${c}"`));

  // Step 2: Get all client names in the clients collection
  const clientsColl = db.collection('lenstalk_clients');
  const clientDocs = await clientsColl.find({}, { projection: { clientName: 1, name: 1, status: 1 } }).toArray();
  const clientsInDB = clientDocs.map(c => c.clientName || c.name).filter(Boolean);
  console.log(`\n🗄️  Clients in the clients collection (${clientDocs.length}):`);
  clientDocs.forEach(c => console.log(`  - "${c.clientName || c.name}" [status: ${c.status || 'N/A'}]`));

  // Step 3: Find the diff
  const missingFromDB = clientsInTasks.filter(name => !clientsInDB.includes(name));
  const inDBButNoTasks = clientsInDB.filter(name => !clientsInTasks.includes(name));

  console.log(`\n🚨 Clients in tasks but MISSING from clients collection (${missingFromDB.length}):`);
  if (missingFromDB.length === 0) {
    console.log('  ✅ None! All task clients exist in the clients collection.');
  } else {
    missingFromDB.forEach(c => {
      const taskCount = tasks.filter(t => t.client === c).length;
      console.log(`  ❌ "${c}" — has ${taskCount} task(s) in content_tasks`);
    });

    console.log('\n📝 INSERT SCRIPT (copy & run if you want to restore these clients):');
    console.log('---------------------------------------------------------------------');
    const insertDocs = missingFromDB.map(name => ({
      clientName: name,
      status: 'active',
      createdAt: new Date().toISOString(),
      restoredBy: 'diagnostic-script',
      note: 'Auto-restored from content_tasks reference',
    }));
    console.log(JSON.stringify(insertDocs, null, 2));
  }

  console.log(`\n⚠️  Clients in DB but with no tasks (${inDBButNoTasks.length}):`);
  inDBButNoTasks.forEach(c => console.log(`  - "${c}"`));

  await mongoose.disconnect();
  console.log('\n✅ Done.');
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
