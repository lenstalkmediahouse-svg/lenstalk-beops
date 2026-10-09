const connectDB = require('./src/config/db');
const Client = require('./src/modules/clients/client.model');
const mongoose = require('mongoose');

async function migrate() {
  try {
    await connectDB();
    console.log('✅ Connected to DB');
    
    const clients = await Client.find({});
    console.log(`Found ${clients.length} total clients.`);
    
    let updatedCount = 0;
    for (const client of clients) {
      if (!client.projectType && client.clientType) {
        client.projectType = client.clientType;
        await client.save();
        updatedCount++;
      }
    }
    
    console.log(`✅ Migration complete. Updated ${updatedCount} clients.`);
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

migrate();
