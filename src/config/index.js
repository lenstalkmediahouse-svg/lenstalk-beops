const dotenv = require('dotenv');
dotenv.config();

const isProduction = process.env.NODE_ENV === 'production';
const envMongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || process.env.DATABASE_URL;
const defaultMongoUri = isProduction ? undefined : 'mongodb://localhost:27017/lenstalk-os';

module.exports = {
  port: parseInt(process.env.PORT || '4000', 10),
  mongoUri: envMongoUri || defaultMongoUri,
  mongoFallbackUri: process.env.MONGO_FALLBACK_URI || 'mongodb://localhost:27017/lenstalk-os',
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET || (isProduction ? undefined : 'LenstalkDemoJwtSecret2026ChangeMe'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',
  nodeEnv: process.env.NODE_ENV || 'development',
  // Accepts either APP_URL or FRONTEND_URL — both are supported
  frontendUrl: process.env.FRONTEND_URL || process.env.APP_URL || 'https://lenstalk-ops.vercel.app',
  cookieName: process.env.COOKIE_NAME || 'lenstalk_session',
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  emailUser: process.env.EMAIL_USER || '',
  emailPass: process.env.EMAIL_PASS || '',
  passwords: {
    admin: process.env.DEMO_ADMIN_PASSWORD || (isProduction ? undefined : 'LenstalkAdmin@2026'),
    hr: process.env.DEMO_HR_PASSWORD || (isProduction ? undefined : 'LenstalkHr@2026'),
    ops: process.env.DEMO_OPERATIONS_PASSWORD || (isProduction ? undefined : 'LenstalkOps@2026'),
    ads: process.env.DEMO_ADS_MANAGER_PASSWORD || (isProduction ? undefined : 'LenstalkAds@2026'),
    emp: process.env.DEMO_EMPLOYEE_PASSWORD || (isProduction ? undefined : 'LenstalkEmployee@2026'),
    cinema: process.env.DEMO_CINEMATOGRAPHER_PASSWORD || (isProduction ? undefined : 'LenstalkCinema@2026'),
    client: process.env.DEMO_CLIENT_PASSWORD || (isProduction ? undefined : 'LenstalkClient@2026'),
  }
};

