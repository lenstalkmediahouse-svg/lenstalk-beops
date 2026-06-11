const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

mongoose.connect(process.env.MONGO_URI || 'mongodb+srv://kanhasahoo:Piki9438914652@lenstalk.wntigps.mongodb.net/lenstalk_ops?retryWrites=true&w=majority&appName=lenstalk')
  .then(async () => {
    console.log('Hunting for original Employee records...');
    const Employee = require('./src/modules/employees/employee.model');

    const namesToFind = ['puja', 'suchismita', 'dheeraj', 'tapaswini', 'dibyajyoti'];

    for (const name of namesToFind) {
      const records = await Employee.find({ fullName: { $regex: name, $options: 'i' } });
      console.log(`\n--- Searching for: ${name} ---`);
      console.log(`Found ${records.length} records.`);
      
      for (const rec of records) {
        console.log(`ID: ${rec._id} | Name: ${rec.fullName} | Code: ${rec.employeeCode} | Gross: ${rec.salaryStructure?.grossMonthly} | Join Date: ${rec.joiningDate} | Archived: ${rec.isArchived} | Created At: ${rec.createdAt}`);
      }
    }

    process.exit(0);
  });
