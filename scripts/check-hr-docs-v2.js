const mongoose = require('mongoose');

async function main() {
  const MONGO_URI = process.env.MONGODB_URI || require('../src/config').mongoUri;
  console.log('Connecting...');
  await mongoose.connect(MONGO_URI);
  console.log('Connected!\n');

  const docSchema = new mongoose.Schema({}, { strict: false });
  const DocModel = mongoose.models['lenstalk_hr_documents_v1'] || mongoose.model('lenstalk_hr_documents_v1', docSchema, 'lenstalk_hr_documents_v1');
  const EmpModel = mongoose.models['employees'] || mongoose.model('employees', docSchema, 'employees');

  // Count docs in different states
  const totalDocs = await DocModel.countDocuments({});
  const archivedDocs = await DocModel.countDocuments({ isArchived: true });
  const activeDocs = await DocModel.countDocuments({ isArchived: { $ne: true } });

  console.log('=== HR Documents Summary ===');
  console.log(`Total: ${totalDocs}`);
  console.log(`Active (not archived): ${activeDocs}`);
  console.log(`Archived: ${archivedDocs}`);
  
  // Show all docs with their employeeId
  const allDocs = await DocModel.find({}).lean();
  console.log('\n=== All Documents ===');
  allDocs.forEach(d => {
    console.log(`  _id: ${d._id} | employeeId: ${d.employeeId} | docType: ${d.docType} | isArchived: ${d.isArchived || false}`);
  });

  // Count active employees
  const activeEmps = await EmpModel.find({ isArchived: { $ne: true } }).lean();
  console.log('\n=== Active Employees ===');
  activeEmps.forEach(e => {
    console.log(`  _id: ${e._id} | name: ${e.fullName} | code: ${e.employeeCode}`);
  });

  await mongoose.disconnect();
}

main().catch(err => { console.error(err); process.exit(1); });
