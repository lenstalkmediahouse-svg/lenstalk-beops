const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const config = require('./src/config');
const User = require('./src/modules/users/user.model');

mongoose.connect(config.mongoUri)
  .then(async () => {
    const passwordHash = await bcrypt.hash('password', 12);
    const user = new User({
        name: 'Test Super Admin',
        email: 'superadmin_test@lenstalkmedia.com',
        mobile: '+91-0000000000',
        loginId: 'superadmin_test',
        passwordHash,
        primaryRole: 'super_admin',
        accessRoles: [
            'super_admin',
            'admin',
            'hr',
            'operations_head',
            'ads_manager',
            'employee'
        ],
        status: 'active',
        isActive: true,
      });
    await user.save();
    console.log('User created:', user);
    process.exit(0);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
