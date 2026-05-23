const mongoose = require('mongoose');
require('dotenv').config({ path: '/Users/kanhasahoo/Documents/OPS FINAL/PUSH/lenstalk-ops-be/.env' });
const Employee = require('/Users/kanhasahoo/Documents/OPS FINAL/PUSH/lenstalk-ops-be/src/modules/employees/employee.model.js');
const User = require('/Users/kanhasahoo/Documents/OPS FINAL/PUSH/lenstalk-ops-be/src/modules/users/user.model.js');

async function check() {
  await mongoose.connect(process.env.MONGO_URI);
  const emps = await Employee.find().sort({ createdAt: -1 }).limit(5);
  console.log("RECENT EMPLOYEES:");
  emps.forEach(e => console.log(e._id, e.email, e.employeeCode, e.userId));

  const users = await User.find().sort({ createdAt: -1 }).limit(5);
  console.log("\nRECENT USERS:");
  users.forEach(u => console.log(u._id, u.email, u.loginId, u.linkedEmployeeId));
  process.exit(0);
}
check();
