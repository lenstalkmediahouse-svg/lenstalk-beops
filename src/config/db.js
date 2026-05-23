const mongoose = require('mongoose');
const config = require('./index');

const connectDB = async () => {
  await mongoose.connect(config.mongoUri);
  console.log('MongoDB Connected');
};

module.exports = connectDB;