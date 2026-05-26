const mongoose = require('mongoose');
const config = require('./index');

const uri = config.mongoUri || config.databaseUrl;
if (!uri) {
  throw new Error('Missing MongoDB connection string. Set MONGO_URI, MONGODB_URI, or DATABASE_URL.');
}

mongoose.set('strictQuery', false);

mongoose.connection.on('connected', () => {
  console.log(`MongoDB connected to ${uri}`);
});

mongoose.connection.on('error', (err) => {
  console.error('MongoDB connection error:', err.message || err);
});

mongoose.connection.on('disconnected', () => {
  console.warn('MongoDB disconnected.');
});

const connectDB = async (attempt = 1) => {
  try {
    return await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      maxPoolSize: 10,
      autoIndex: false,
    });
  } catch (err) {
    if (attempt >= 5) {
      console.error(`MongoDB connect failed after ${attempt} attempts.`);
      throw err;
    }

    const retryDelayMs = Math.min(2000 * attempt, 10000);
    console.warn(`MongoDB connection failed (attempt ${attempt}). Retrying in ${retryDelayMs} ms...`, err.message || err);
    await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    return connectDB(attempt + 1);
  }
};

module.exports = connectDB;