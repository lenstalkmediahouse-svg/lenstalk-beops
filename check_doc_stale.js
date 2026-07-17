const mongoose = require('mongoose');
const uri = 'mongodb+srv://lenstalkmediahouse_db_user:HefgSWSoVrSzP2ib@operation.b5fv3kv.mongodb.net/lenstalk_os?retryWrites=true&w=majority&appName=operation';
const Schema = new mongoose.Schema({}, { strict: false });
const Doc = mongoose.model('Doc', Schema, 'lenstalk_hr_documents_v1');
const Emp = mongoose.model('Emp', Schema, 'employees');

mongoose.connect(uri).then(async () => {
  // Find all received docs grouped by employee
  const receivedDocs = await Doc.find({ status: 'received', isArchived: { $ne: true } }).lean();
  
  const byEmp = {};
  for (const d of receivedDocs) {
    const key = String(d.employeeId);
    if (!byEmp[key]) byEmp[key] = [];
    byEmp[key].push(d.docType);
  }
  
  console.log('=== Employees with received documents ===\n');
  for (const [empId, types] of Object.entries(byEmp)) {
    const emp = await Emp.findById(empId).lean();
    const name = emp?.fullName || emp?.name || `Unknown (${empId})`;
    const pct = Math.round((types.length / 18) * 100);
    console.log(`${name} — ${types.length}/18 received (${pct}%)`);
    types.forEach(t => console.log(`  ✓ ${t}`));
    console.log('');
  }
  
  await mongoose.disconnect(); process.exit(0);
}).catch(e => { console.error(e.message); process.exit(1); });
