const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const config = require('./src/config');
const User = require('./src/modules/users/user.model');

const demoUsers = [
  {
    name: 'Admin User',
    email: 'admin@lenstalkmedia.com',
    mobile: '+91-9999999999',
    loginId: 'admin',
    password: config.passwords.admin || 'LenstalkAdmin@2026',
    primaryRole: 'admin',
    accessRoles: ['admin', 'hr', 'operations_head', 'ads_manager', 'employee'],
  },
  {
    name: 'Super Admin',
    email: 'superadmin@lenstalkmedia.com',
    mobile: '+91-9999999998',
    loginId: 'superadmin',
    password: 'LenstalkAdmin@2026',
    primaryRole: 'super_admin',
    accessRoles: ['super_admin', 'admin', 'hr', 'operations_head', 'ads_manager', 'employee'],
  },
  {
    name: 'HR Manager',
    email: 'hr@lenstalkmedia.com',
    mobile: '+91-9999999997',
    loginId: 'hr_user',
    password: config.passwords.hr || 'LenstalkHr@2026',
    primaryRole: 'hr',
    accessRoles: ['hr', 'employee'],
  },
  {
    name: 'Operations Manager',
    email: 'ops@lenstalkmedia.com',
    mobile: '+91-9999999996',
    loginId: 'ops_user',
    password: config.passwords.ops || 'LenstalkOps@2026',
    primaryRole: 'operations_head',
    accessRoles: ['operations_head', 'employee'],
  },
  {
    name: 'Employee Demo',
    email: 'emp@lenstalkmedia.com',
    mobile: '+91-9999999995',
    loginId: 'employee',
    password: config.passwords.emp || 'LenstalkEmployee@2026',
    primaryRole: 'employee',
    accessRoles: ['employee'],
  }
];

mongoose.connect(config.mongoUri)
  .then(async () => {
    console.log('Connected to MongoDB. Seeding demo users...');
    for (const u of demoUsers) {
      const existing = await User.findOne({ loginId: u.loginId });
      const passwordHash = await bcrypt.hash(u.password, 12);
      if (existing) {
        existing.passwordHash = passwordHash;
        existing.status = 'active';
        existing.isActive = true;
        await existing.save();
        console.log(`Updated user: ${u.loginId}`);
      } else {
        const user = new User({
          name: u.name,
          email: u.email,
          mobile: u.mobile,
          loginId: u.loginId,
          passwordHash,
          primaryRole: u.primaryRole,
          accessRoles: u.accessRoles,
          status: 'active',
          isActive: true,
        });
        await user.save();
        console.log(`Created user: ${u.loginId}`);
      }
    }
    console.log('✅ Demo users seeded successfully!');
    process.exit(0);
  })
  .catch(err => {
    console.error('Seeding error:', err);
    process.exit(1);
  });
