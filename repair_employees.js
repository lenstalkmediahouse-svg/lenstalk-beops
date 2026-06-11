const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

mongoose.connect(process.env.MONGO_URI || 'mongodb+srv://kanhasahoo:Piki9438914652@lenstalk.wntigps.mongodb.net/lenstalk_ops?retryWrites=true&w=majority&appName=lenstalk')
  .then(async () => {
    console.log('Connected to DB. Starting repair...');
    const User = require('./src/modules/users/user.model');
    const Employee = require('./src/modules/employees/employee.model');

    const allUsers = await User.find({ primaryRole: { $ne: 'client' }, isActive: true });
    
    for (const u of allUsers) {
      if (u.primaryRole === 'super_admin') continue; // Skip super admin

      let empExists = null;
      if (u.linkedEmployeeId) {
        empExists = await Employee.findById(u.linkedEmployeeId);
      }

      if (!empExists) {
        console.log(`Fixing User ${u.loginId} (${u.name}) - creating missing Employee record...`);
        const employee = new Employee({
          fullName: u.name,
          email: u.email || `${u.loginId}@lenstalkmedia.com`,
          mobile: u.mobile || '',
          roleTitle: u.primaryRole.replace(/_/g, ' '),
          department: 'Operations',
          joiningDate: new Date(),
          employmentType: 'full_time',
          status: u.status || 'active',
          userId: u._id
        });
        await employee.save();
        u.linkedEmployeeId = employee._id;
        await u.save();
        console.log(`Created Employee ID: ${employee._id}`);
      }
    }

    console.log('Repair complete!');
    process.exit(0);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
