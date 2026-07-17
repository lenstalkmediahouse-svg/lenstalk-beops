const mongoose = require('mongoose');
const uri = 'mongodb+srv://lenstalkmediahouse_db_user:HefgSWSoVrSzP2ib@operation.b5fv3kv.mongodb.net/lenstalk_os?retryWrites=true&w=majority&appName=operation';
const Schema = new mongoose.Schema({}, { strict: false });
const Emp = mongoose.model('Emp', Schema, 'employees');
const HREmp = mongoose.model('HREmp', Schema, 'lenstalk_hr_employees_v1');

mongoose.connect(uri).then(async () => {
  const orphanIds = ['6a2926a20cc6a288a6ce2f3f','6a2926a10cc6a288a6ce2f3e','6a2926a20cc6a288a6ce2f40','6a2926a20cc6a288a6ce2f41'];
  
  console.log('=== Checking orphaned employeeIds in employees collection ===');
  for (const id of orphanIds) {
    const e = await Emp.findById(id).lean();
    const h = await HREmp.findById(id).lean();
    console.log(`ID: ${id}`);
    console.log(`  employees collection: ${e ? (e.fullName || e.name) : 'NOT FOUND'}`);
    console.log(`  lenstalk_hr_employees_v1: ${h ? (h.fullName || h.name) : 'NOT FOUND'}`);
  }
  
  // Check Biswarupa specifically
  const biswarupa = await Emp.findOne({ $or: [{ fullName: /Biswarupa/i }, { fullName: /Vishwrupa/i }, { name: /Biswarupa/i }] }).lean();
  console.log('\nBiswarupa in employees:', biswarupa ? `${biswarupa.fullName || biswarupa.name} | _id: ${biswarupa._id}` : 'NOT FOUND');
  
  await mongoose.disconnect(); process.exit(0);
}).catch(e => { console.error(e.message); process.exit(1); });
