const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

mongoose.connect(process.env.MONGO_URI || 'mongodb+srv://kanhasahoo:Piki9438914652@lenstalk.wntigps.mongodb.net/lenstalk_ops?retryWrites=true&w=majority&appName=lenstalk')
  .then(async () => {
    console.log('Connected to DB. Fixing employee codes...');
    const User = require('./src/modules/users/user.model');
    const Employee = require('./src/modules/employees/employee.model');

    const staffUsers = await User.find({ primaryRole: { $ne: 'client' } });
    
    for (const u of staffUsers) {
      if (!u.linkedEmployeeId) continue;

      const emp = await Employee.findById(u.linkedEmployeeId);
      if (emp) {
        // If the user's loginId looks like an employee code (LM-EMP-...) 
        // OR we just want to force the Employee code to match the user's loginId
        if (emp.employeeCode !== u.loginId && u.loginId.startsWith('LM-EMP-')) {
          console.log(`Fixing Employee Code for ${emp.fullName}: ${emp.employeeCode} -> ${u.loginId}`);
          emp.employeeCode = u.loginId;
          await emp.save();
        }
      }
    }

    console.log('Employee codes fixed!');
    process.exit(0);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
