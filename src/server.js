const app = require('./app');
const config = require('./config');
const connectDB = require('./config/db');
const { scheduleArchiveCleanup } = require('./utils/archiveCleaner');

const startServer = async () => {
  try {
    await connectDB();
    console.log(`✅ Database connected`);
  } catch (err) {
    console.warn(`⚠️ Database initialization warning: ${err.message}`);
  }

  // Start 30-day archive auto-delete scheduler
  try {
    scheduleArchiveCleanup();
  } catch (err) {
    console.warn(`⚠️ Archive cleanup scheduling failed: ${err.message}`);
  }

  app.listen(config.port, () => {
    console.log(`\n🚀 Lenstalk OS Backend running on port ${config.port}`);
    console.log(`   Environment: ${config.nodeEnv}`);
    console.log(`   Frontend URL: ${config.frontendUrl}\n`);
  });
};

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
