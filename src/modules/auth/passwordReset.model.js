const mongoose = require('mongoose');

const passwordResetSchema = new mongoose.Schema({
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  tokenHash: { type: String, required: true },   // bcrypt-hashed token stored in DB
  expiresAt: { type: Date, required: true },
  used:      { type: Boolean, default: false },
}, { timestamps: true });

// Auto-expire documents after TTL
passwordResetSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('PasswordReset', passwordResetSchema);
