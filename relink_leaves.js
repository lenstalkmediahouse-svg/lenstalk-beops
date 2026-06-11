const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

mongoose.connect(process.env.MONGO_URI || 'mongodb+srv://kanhasahoo:Piki9438914652@lenstalk.wntigps.mongodb.net/lenstalk_ops?retryWrites=true&w=majority&appName=lenstalk')
  .then(async () => {
    const User = require('./src/modules/users/user.model');
    const Employee = require('./src/modules/employees/employee.model');
    const getModel = require('./src/modules/generic/generic.model');
    const Leave = getModel('leaves');

    const allEmps = await Employee.find();
    for (const emp of allEmps) {
      if (!emp.userId) continue;
      const res = await Leave.updateMany(
        { $or: [{ employeeId: emp._id.toString() }, { userId: emp.userId.toString() }, { employeeName: emp.fullName }] },
        { $set: { employeeId: emp._id.toString() } }
      );
      if (res.modifiedCount > 0) {
        console.log(`Relinked ${res.modifiedCount} leaves for ${emp.fullName}`);
      }
    }
    process.exit(0);
  });
