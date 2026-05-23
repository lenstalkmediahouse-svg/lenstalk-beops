const dotenv = require('dotenv');
dotenv.config();

module.exports = {
  port: process.env.PORT || 4000,
  mongoUri: process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/lenstalk-os',
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET || 'LenstalkDemoJwtSecret2026ChangeMe',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  nodeEnv: process.env.NODE_ENV || 'development',
  frontendUrl: process.env.APP_URL || 'http://localhost:5174' || 'https://lenstalk-ops.vercel.app/',
  cookieName: process.env.COOKIE_NAME || 'lenstalk_session',
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  passwords: {
    admin: process.env.DEMO_ADMIN_PASSWORD || 'LenstalkAdmin@2026',
    hr: process.env.DEMO_HR_PASSWORD || 'LenstalkHr@2026',
    ops: process.env.DEMO_OPERATIONS_PASSWORD || 'LenstalkOps@2026',
    ads: process.env.DEMO_ADS_MANAGER_PASSWORD || 'LenstalkAds@2026',
    emp: process.env.DEMO_EMPLOYEE_PASSWORD || 'LenstalkEmployee@2026',
    cinema: process.env.DEMO_CINEMATOGRAPHER_PASSWORD || 'LenstalkCinema@2026',
    client: process.env.DEMO_CLIENT_PASSWORD || 'LenstalkClient@2026',
  }
};
