const mongoose = require('mongoose');
async function check() {
  await mongoose.connect('mongodb+srv://lenstalkmediahouse_db_user:HefgSWSoVrSzP2ib@operation.b5fv3kv.mongodb.net/lenstalk_os?retryWrites=true&w=majority&appName=operation');
  const coll = mongoose.connection.collection('lenstalk_shoots_v1');
  const latest = await coll.find({}).sort({_id: -1}).limit(5).toArray();
  console.log("Latest 5 shoots:", JSON.stringify(latest, null, 2));
  process.exit(0);
}
check().catch(console.error);
