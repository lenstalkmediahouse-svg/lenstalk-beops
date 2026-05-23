const app = require('./src/app');
const config = require('./src/config');
const connectDB = require('./src/config/db');

const startServer = async () => {
  await connectDB();
  console.log(`✅ Database connected`);

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
