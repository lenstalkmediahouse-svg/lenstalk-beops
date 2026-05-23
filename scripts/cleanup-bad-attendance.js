/**
 * ONE-TIME CLEANUP SCRIPT
 * Removes bad attendance records for Ipsita Mahakud (May 2026)
 * where employeeId was incorrectly saved as the login userId
 * instead of the employee record _id.
 *
 * Run: node scripts/cleanup-bad-attendance.js
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const getModel = require('../src/modules/generic/generic.model');

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

async function cleanup() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(MONGO_URI);
  console.log('Connected.\n');

  const Att = getModel('attendance_records');
  const Employee = mongoose.model('Employee',
    new mongoose.Schema({}, { strict: false }), 'employees');

  // Find Ipsita Mahakud's employee record
  const ipsita = await Employee.findOne({
    fullName: { $regex: /ipsita\s+mahakud/i }
  });

  if (!ipsita) {
    console.log('❌ Employee "Ipsita Mahakud" not found in employees collection.');
    await mongoose.disconnect();
    return;
  }

  console.log(`✅ Found employee: ${ipsita.fullName}`);
  console.log(`   Employee _id  : ${ipsita._id}`);
  console.log(`   Linked userId : ${ipsita.userId || 'NOT LINKED'}\n`);

  // Find May 2026 bad records:
  // Bad records = date starts with "2026-05" AND employeeName matches Ipsita
  // AND employeeId is NOT her employee record _id (i.e. wrong / userId saved as employeeId)
  const badRecords = await Att.find({
    date:         { $regex: /^2026-05/ },
    employeeName: { $regex: /ipsita\s+mahakud/i },
    employeeId:   { $ne: ipsita._id.toString() },
  });

  console.log(`Found ${badRecords.length} bad record(s) for May 2026:`);
  badRecords.forEach((r, i) => {
    console.log(`  [${i + 1}] date=${r.date}  status=${r.status}  employeeId=${r.employeeId}  source=${r.source}`);
  });

  if (badRecords.length === 0) {
    console.log('\n✅ No bad records found. Checking ALL May 2026 records for Ipsita...\n');
    const allRecords = await Att.find({
      date: { $regex: /^2026-05/ },
      $or: [
        { employeeName: { $regex: /ipsita\s+mahakud/i } },
        { employeeId:   ipsita._id.toString() },
        { userId:       ipsita.userId?.toString() },
      ]
    }).sort({ date: -1 });

    if (allRecords.length === 0) {
      console.log('  No attendance records found for Ipsita in May 2026.');
    } else {
      console.log(`  Found ${allRecords.length} total record(s):`);
      allRecords.forEach((r, i) => {
        const empOk = r.employeeId?.toString() === ipsita._id.toString() ? 'OK' : 'WRONG';
        const usrOk = r.userId?.toString() === ipsita.userId?.toString() ? 'OK' : 'WRONG';
        console.log(`  [${i+1}] date=${r.date}  status=${r.status}  source=${r.source}  isArchived=${r.isArchived}`);
        console.log(`       employeeId=${r.employeeId} [${empOk}]`);
        console.log(`       userId=${r.userId} [${usrOk}]\n`);
      });
    }
    await mongoose.disconnect();
    return;
  }

  const ids = badRecords.map(r => r._id);
  const result = await Att.deleteMany({ _id: { $in: ids } });
  console.log(`\n🗑️  Deleted ${result.deletedCount} bad record(s).`);
  console.log('✅ Cleanup complete!');

  await mongoose.disconnect();
}

cleanup().catch(err => {
  console.error('Cleanup failed:', err.message);
  process.exit(1);
});
