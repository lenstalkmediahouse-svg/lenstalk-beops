const jwt = require('jsonwebtoken');
const config = require('./src/config');
const mongoose = require('mongoose');
const axios = require('axios');

async function test() {
  await mongoose.connect('mongodb+srv://lenstalkmediahouse_db_user:HefgSWSoVrSzP2ib@operation.b5fv3kv.mongodb.net/lenstalk_os?retryWrites=true&w=majority&appName=operation');
  const User = require('./src/modules/users/user.model');
  const user = await User.findOne({ primaryRole: 'super_admin' });
  
  if (!user) {
    console.log('No super admin found');
    process.exit(1);
  }
  
  const token = jwt.sign({ userId: user._id }, config.jwtSecret, { expiresIn: '1d' });
  
  try {
    const res = await axios.get('http://localhost:4000/api/hr-reports', {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('HR Reports Response Status:', res.status);
    console.log('HR Reports Data:', res.data.length);
  } catch (err) {
    console.error('HR Reports Error:', err.response ? err.response.status + ' ' + err.response.data.message : err.message);
  }
  
  try {
    const res2 = await axios.get('http://localhost:4000/api/performance/employee/6a1fe0a30c3a49480eca790c/trend', {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('Trend Response Status:', res2.status);
  } catch (err) {
    console.error('Trend Error:', err.response ? err.response.status + ' ' + err.response.data.message : err.message);
  }

  process.exit(0);
}
test();
