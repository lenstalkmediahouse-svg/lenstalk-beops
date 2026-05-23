const mongoose = require('mongoose');
require('dotenv').config({ path: '/Users/kanhasahoo/Documents/OPS FINAL/PUSH/lenstalk-ops-be/.env' });
const Employee = require('/Users/kanhasahoo/Documents/OPS FINAL/PUSH/lenstalk-ops-be/src/modules/employees/employee.model.js');
const User = require('/Users/kanhasahoo/Documents/OPS FINAL/PUSH/lenstalk-ops-be/src/modules/users/user.model.js');

async function check() {
  await mongoose.connect(process.env.MONGO_URI);
  const oldEmp = await Employee.findById('69f44bb4865f3f50be3e8e04');
  console.log("Old Emp exists?", !!oldEmp);
  if (oldEmp) console.log("Old Emp details:", oldEmp.email, oldEmp.employeeCode, oldEmp.status);
  
  process.exit(0);
}
check();
