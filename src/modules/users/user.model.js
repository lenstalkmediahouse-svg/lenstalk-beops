const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    mobile: { type: String, trim: true },
    loginId: { type: String, required: true, unique: true, trim: true },
    passwordHash: { type: String, required: true },
    primaryRole: {
      type: String,
      required: true,
      enum: ['super_admin', 'admin', 'hr', 'operations_head', 'ads_manager_creators', 'employee', 'cinematographer', 'client', 'smm', 'prm', 'accountant'],
    },
    accessRoles: [{ type: String }],
    linkedEmployeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', default: null },
    linkedClientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', default: null },
    linkedClientName: { type: String, default: '' },   // stores exact client name for portal data isolation
    assignedBrands: [{ type: String }],                 // SMM: brands/clients this user can manage
    status: { type: String, enum: ['active', 'inactive', 'suspended'], default: 'active' },
    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

// Indexes
userSchema.index({ primaryRole: 1 });
userSchema.index({ linkedEmployeeId: 1 });
userSchema.index({ linkedClientId: 1 });

// Password hashing pre-save
userSchema.pre('save', async function () {
  if (!this.isModified('passwordHash')) return;
  const salt = await bcrypt.genSalt(12);
  this.passwordHash = await bcrypt.hash(this.passwordHash, salt);
});

// Compare password
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.passwordHash);
};

// Remove sensitive fields from JSON
userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.passwordHash;
  return obj;
};

module.exports = mongoose.model('User', userSchema);
