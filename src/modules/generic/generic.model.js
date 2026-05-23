const mongoose = require('mongoose');

const getModel = (collectionName) => {
  if (mongoose.models[collectionName]) {
    return mongoose.models[collectionName];
  }
  const schema = new mongoose.Schema({}, { strict: false, timestamps: true });
  return mongoose.model(collectionName, schema, collectionName);
};

module.exports = getModel;
