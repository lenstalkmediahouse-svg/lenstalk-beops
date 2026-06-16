const app = require('./app');
const config = require('./config');
const connectDB = require('./config/db');
const { scheduleArchiveCleanup } = require('./utils/archiveCleaner');

const startServer = async () => {
  // Start the HTTP server FIRST — so Render's health check passes
  // and the process doesn't get killed before DB connects.
  const server = app.listen(config.port, () => {
    console.log(`\n🚀 Lenstalk OS Backend running on port ${config.port}`);
    console.log(`   Environment: ${config.nodeEnv}`);
    console.log(`   Frontend URL: ${config.frontendUrl}\n`);
  });

  // Connect to MongoDB (with internal retry logic in connectDB)
  try {
    await connectDB();
    console.log(`✅ Database connected`);

    // One-time data cleanup: deduplicate assignedBrands for all existing users
    try {
      const User = require('./modules/users/user.model');
      const users = await User.find({ assignedBrands: { $exists: true, $not: { $size: 0 } } });
      let updatedCount = 0;
      for (const u of users) {
        if (Array.isArray(u.assignedBrands)) {
          const originalLength = u.assignedBrands.length;
          const uniqueBrands = Array.from(new Set(u.assignedBrands.map(b => b?.trim()).filter(Boolean)));
          if (uniqueBrands.length !== originalLength) {
            u.assignedBrands = uniqueBrands;
            await u.save();
            updatedCount++;
          }
        }
      }
      if (updatedCount > 0) {
        console.log(`🧹 Cleaned up duplicate assignedBrands for ${updatedCount} users.`);
      }
    } catch (migErr) {
      console.warn(`⚠️ One-time duplicate assignedBrands cleanup failed: ${migErr.message}`);
    }

    // Start 30-day archive auto-delete scheduler after DB is connected.
    try {
      scheduleArchiveCleanup();
    } catch (err) {
      console.warn(`⚠️ Archive cleanup scheduling failed: ${err.message}`);
    }
  } catch (err) {
    // Log the error but do NOT exit — the 503 middleware in app.js
    // will reject API calls until DB reconnects. Render keeps the
    // process alive and the /api/health endpoint stays reachable.
    console.error('⚠️  Initial DB connection failed — server running in degraded mode:', err.message);
  }
};

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

