const mongoose = require('mongoose');
async function check() {
  await mongoose.connect('mongodb+srv://kanhasahoo:Piki9438914652@lenstalk.wntigps.mongodb.net/lenstalk_ops?retryWrites=true&w=majority&appName=lenstalk');
  const coll = mongoose.connection.collection('lenstalk_shoots_v1');
  const shoots = await coll.find({ shootCode: /CZKUX/i }).toArray();
  console.log("Found shoots with CZKUX:", JSON.stringify(shoots, null, 2));
  process.exit(0);
}
check().catch(console.error);
