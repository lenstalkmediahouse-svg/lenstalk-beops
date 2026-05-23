const mongoose = require('mongoose');

const employeeSchema = new mongoose.Schema(
  {
    employeeCode: { type: String, unique: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    fullName: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true },
    mobile: { type: String, trim: true },
    roleTitle: { type: String, trim: true },
    department: { type: String, trim: true },
    joiningDate: { type: Date },
    employmentType: { type: String, enum: ['full_time', 'part_time', 'intern', 'contract'], default: 'full_time' },
    salaryStructure: {
      grossMonthly: { type: Number, default: 0 },
      basic: { type: Number, default: 0 },
      hra: { type: Number, default: 0 },
      allowances: { type: Number, default: 0 },
    },
    status: { type: String, enum: ['active', 'inactive', 'terminated', 'archived'], default: 'active' },
    documentLinks: {
      offerLetterUrl: { type: String },
      selfDeclarationUrl: { type: String },
      nominationFormUrl: { type: String },
      idProofUrl: { type: String },
      otherDocs: [{ type: String }],
    },
    leaveBalance: {
      casual: { type: Number, default: 12 },
      sick: { type: Number, default: 6 },
      earned: { type: Number, default: 0 },
      compOff: { type: Number, default: 0 },
      lwp: { type: Number, default: 0 },
    },
    managerEmployeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', default: null },
    skills: [{ type: String }],
    notes: { type: String },
    isArchived: { type: Boolean, default: false },
  },
  { timestamps: true }
);

employeeSchema.index({ userId: 1 });
employeeSchema.index({ department: 1 });
employeeSchema.index({ status: 1 });

const Counter = require('../generic/counter.model');

// Auto-generate employee code before save
employeeSchema.pre('save', async function () {
  if (this.isNew && !this.employeeCode) {
    let counter = await Counter.findById('employeeCode');
    if (!counter) {
      const lastDoc = await this.constructor.findOne().sort({ employeeCode: -1 });
      let nextNum = 0;
      if (lastDoc && lastDoc.employeeCode) {
        const match = lastDoc.employeeCode.match(/\d+$/);
        if (match) nextNum = parseInt(match[0], 10);
      }
      await Counter.findOneAndUpdate(
        { _id: 'employeeCode' },
        { $setOnInsert: { seq: nextNum } },
        { new: true, upsert: true }
      );
    }
    counter = await Counter.findByIdAndUpdate(
      'employeeCode',
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );
    this.employeeCode = `LM-EMP-${String(counter.seq).padStart(4, '0')}`;
  }
});

module.exports = mongoose.model('Employee', employeeSchema);
