const mongoose = require('mongoose');

const Counter = require('../generic/counter.model');

const clientSchema = new mongoose.Schema(
  {
    clientCode:  { type: String, unique: true, sparse: true },
    name:        { type: String, required: true, trim: true },
    pocName:     { type: String, trim: true },
    pocMobile:   { type: String, trim: true },
    pocEmail:    { type: String, trim: true, lowercase: true },
    brandType:   { type: String, trim: true },
    engagementModel: {
      type: String,
      enum: ['retainer', 'one_time_project'],
      default: 'retainer',
    },
    planningMode: {
      type: String,
      enum: ['content_calendar', 'project_delivery'],
      default: 'content_calendar',
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'paused', 'archived'],
      default: 'active',
    },
    accountManagerEmployeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      default: null,
    },
    // Linked login user for this client
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    projectLabel: { type: String, trim: true },
    isArchived:   { type: Boolean, default: false },
    archivedAt:   { type: Date, default: null },
    notes:        { type: String, trim: true },
  },
  { timestamps: true }
);

clientSchema.index({ status: 1 });
clientSchema.index({ isArchived: 1 });

clientSchema.pre('save', async function () {
  if (this.isNew && !this.clientCode) {
    /**
     * PERMANENT FIX: Atomic counter — never resets even if client docs are deleted.
     * The old findOne().sort({clientCode:-1}) pattern caused gaps in numbering
     * whenever the collection was wiped (replaceCollection incident).
     * Now we use the same Counter collection that employees use.
     */
    let counter = await Counter.findById('clientCode');
    if (!counter) {
      // Bootstrap: seed counter from highest existing code (one-time migration)
      const lastDoc = await this.constructor.findOne({}, { clientCode: 1 }).sort({ clientCode: -1 });
      let lastNum = 0;
      if (lastDoc && lastDoc.clientCode) {
        const match = lastDoc.clientCode.match(/\d+$/);
        if (match) lastNum = parseInt(match[0], 10);
      }
      await Counter.findOneAndUpdate(
        { _id: 'clientCode' },
        { $setOnInsert: { seq: lastNum } },
        { new: true, upsert: true }
      );
    }
    counter = await Counter.findByIdAndUpdate(
      'clientCode',
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );
    this.clientCode = `LM-CLT-${String(counter.seq).padStart(4, '0')}`;
  }
});

module.exports = mongoose.model('Client', clientSchema);
