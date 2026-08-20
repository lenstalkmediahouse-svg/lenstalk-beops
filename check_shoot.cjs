const mongoose = require('mongoose');

async function check() {
  await mongoose.connect('mongodb://127.0.0.1:27017/lenstalk'); // assuming standard local mongo
  const coll = mongoose.connection.collection('lenstalk_shoots_v1');
  const shoot = await coll.findOne({ shootCode: 'LM-SHT-CZKUX' });
  console.log(JSON.stringify(shoot, null, 2));
  process.exit(0);
}
check().catch(console.error);
