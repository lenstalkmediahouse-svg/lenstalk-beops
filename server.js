const dns = require('dns');

// Force working public DNS servers
dns.setServers(['1.1.1.1', '8.8.8.8']);

// Prefer IPv4
dns.setDefaultResultOrder('ipv4first');

const app = require('./src/app');
const config = require('./src/config');
const connectDB = require('./src/config/db');

const startServer = async () => {
  try {
    await connectDB();

    console.log('✅ Database connected');

    app.listen(config.port, () => {
      console.log(`🚀 Lenstalk OS Backend running on port ${config.port}`);
      console.log(`Environment: ${config.nodeEnv}`);
      console.log(`Frontend URL: ${config.frontendUrl}`);
    });

  } catch (err) {
    console.error('❌ Failed to start server:', err);
    process.exit(1);
  }
};

startServer();