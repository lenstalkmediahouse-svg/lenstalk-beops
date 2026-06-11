const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

mongoose.connect(process.env.MONGO_URI || 'mongodb+srv://kanhasahoo:Piki9438914652@lenstalk.wntigps.mongodb.net/lenstalk_ops?retryWrites=true&w=majority&appName=lenstalk')
  .then(async () => {
    console.log('Connected to DB');
    const User = require('./src/modules/users/user.model');
    const Employee = require('./src/modules/employees/employee.model');

    const allUsers = await User.find({ primaryRole: { $ne: 'client' } });
    console.log('Total non-client Users:', allUsers.length);
    const allEmps = await Employee.find();
    console.log('Total Employees:', allEmps.length);
    
    for (const u of allUsers) {
      if (!u.linkedEmployeeId) {
        console.log(`[ISSUE] User ${u.loginId} (${u.name}) has NO linkedEmployeeId`);
      } else {
        const empExists = await Employee.findById(u.linkedEmployeeId);
        if (!empExists) {
          console.log(`[ISSUE] User ${u.loginId} (${u.name}) has linkedEmployeeId ${u.linkedEmployeeId} BUT Employee record is MISSING!`);
        }
      }
    }

    console.log('Checking Employee table specifically for Puja Naik...');
    const puja = await Employee.findOne({ $or: [{ fullName: /puja/i }, { email: /puja/i }] });
    if (puja) {
      console.log('Puja Found in Employee table:', puja.fullName, '| Status:', puja.status, '| isArchived:', puja.isArchived);
    } else {
      console.log('Puja NOT FOUND in Employee table');
    }

    process.exit(0);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
