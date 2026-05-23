const mongoose = require('mongoose');
require('dotenv').config({ path: '/Users/kanhasahoo/Documents/OPS FINAL/PUSH/lenstalk-ops-be/.env' });
const Employee = require('/Users/kanhasahoo/Documents/OPS FINAL/PUSH/lenstalk-ops-be/src/modules/employees/employee.model.js');
const User = require('/Users/kanhasahoo/Documents/OPS FINAL/PUSH/lenstalk-ops-be/src/modules/users/user.model.js');

async function runFix() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to DB. Starting cleanup...\n');

  // STEP 1: Find and delete ghost users
  const allUsers = await User.find({ primaryRole: 'employee', linkedEmployeeId: { $ne: null } });
  let ghostCount = 0;
  
  for (const user of allUsers) {
    const empExists = await Employee.findById(user.linkedEmployeeId);
    if (!empExists) {
      console.log(`Deleting Ghost User: ${user.email} (Login ID: ${user.loginId})`);
      await User.findByIdAndDelete(user._id);
      ghostCount++;
    }
  }
  console.log(`\nDeleted ${ghostCount} ghost users.\n`);

  // STEP 2: Find employees stuck in "Access Pending" and create their user accounts
  const pendingEmps = await Employee.find({ userId: null, status: { $ne: 'archived' } });
  let fixedCount = 0;

  for (const emp of pendingEmps) {
    if (!emp.employeeCode) {
      console.log(`Skipping employee ${emp.email} because they have no employeeCode.`);
      continue;
    }

    const loginId = emp.employeeCode;
    const tempPasswordHash = `Lenstalk@${emp.employeeCode.replace('LM-EMP-', '').replace(/^0+/, '') || '1'}`;
    
    // Check if somehow a user still exists for this loginId
    const existingUser = await User.findOne({ $or: [{ loginId }, { email: emp.email }] });
    
    if (existingUser) {
      console.log(`Cannot fix employee ${emp.email} - User with loginId ${loginId} or email already exists.`);
      // If the user exists and doesn't have an employee linked, link it now
      if (!existingUser.linkedEmployeeId) {
         existingUser.linkedEmployeeId = emp._id;
         await existingUser.save();
         emp.userId = existingUser._id;
         await emp.save();
         console.log(`Linked existing user to employee ${emp.email}`);
         fixedCount++;
      }
      continue;
    }

    // Create the new user
    const newUser = new User({
      name: emp.fullName,
      email: emp.email,
      mobile: emp.mobile || '',
      loginId,
      passwordHash: tempPasswordHash, // The pre-save hook will hash this
      primaryRole: 'employee',
      accessRoles: ['employee'],
      linkedEmployeeId: emp._id,
      status: 'active',
      isActive: true,
    });

    await newUser.save();
    
    // Link to employee
    emp.userId = newUser._id;
    await emp.save();

    console.log(`Created and linked User account for Employee: ${emp.fullName} (${emp.email}) - Login ID: ${loginId}`);
    fixedCount++;
  }

  console.log(`\nFixed ${fixedCount} employees stuck in "Access Pending".`);
  process.exit(0);
}

runFix().catch(console.error);
