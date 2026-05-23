const mongoose = require('mongoose');
require('dotenv').config({ path: '/Users/kanhasahoo/Documents/OPS FINAL/PUSH/lenstalk-ops-be/.env' });
const User = require('/Users/kanhasahoo/Documents/OPS FINAL/PUSH/lenstalk-ops-be/src/modules/users/user.model.js');

async function check() {
  await mongoose.connect(process.env.MONGO_URI);
  const users = await User.find({ loginId: /LM-EMP/ });
  console.log("Users with LM-EMP:");
  users.forEach(u => console.log(u.loginId, u.email, u.linkedEmployeeId));
  process.exit(0);
}
check();
