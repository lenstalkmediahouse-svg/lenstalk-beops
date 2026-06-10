const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const Employee = require('./src/modules/employees/employee.model.js');
const User = require('./src/modules/users/user.model.js');

async function check() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB");

    const user = await User.findOne({ email: 'tapaswini.thelsm@gmail.com' });
    console.log("User document:");
    console.log(JSON.stringify(user, null, 2));

    if (user && user.linkedEmployeeId) {
      const emp = await Employee.findById(user.linkedEmployeeId);
      console.log("Linked Employee via linkedEmployeeId:", emp);
    }
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}
check();
