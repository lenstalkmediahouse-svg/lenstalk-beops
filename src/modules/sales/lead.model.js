const mongoose = require('mongoose');
const Counter  = require('../generic/counter.model');

const STAGES = [
  'NEW_LEAD',
  'RESEARCH',
  'TELECALLING',
  'MEETING_FIXED',
  'FOUNDER_REVIEW',
  'PROPOSAL_SENT',
  'NEGOTIATION',
  'WON',
  'LOST',
];

const activityLogSchema = new mongoose.Schema(
  {
    stage:    { type: String },
    note:     { type: String },
    byUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    at:       { type: Date, default: Date.now },
  },
  { _id: false }
);

const leadSchema = new mongoose.Schema(
  {
    leadCode: { type: String, unique: true, sparse: true },

    // Core lead info
    companyName:   { type: String, required: true, trim: true },
    contactPerson: { type: String, trim: true },
    email:         { type: String, trim: true, default: null },
    phone:         { type: String, required: true, trim: true },
    source: {
      type:    String,
      enum:    ['Manual', 'Referral', 'Instagram/Facebook', 'Walk-in', 'Other'],
      default: 'Manual',
    },

    stage:        { type: String, enum: STAGES, default: 'NEW_LEAD' },
    assignedToId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    categoryId:   { type: mongoose.Schema.Types.ObjectId, ref: 'LeadCategory', default: null },

    // Meeting info (embedded — no separate Meeting model)
    meetingDate: { type: Date, default: null },
    meetingStatus: {
      type:    String,
      enum:    ['NOT_SCHEDULED', 'NO_ANSWER', 'FOLLOW_UP', 'MEETING_FIXED', 'NOT_INTERESTED', 'COMPLETED'],
      default: 'NOT_SCHEDULED',
    },
    meetingNotes: { type: String, trim: true },

    // Proposal info (embedded — no separate Proposal model)
    proposalAmount:  { type: Number, default: null },
    proposalFileUrl: { type: String, trim: true },
    proposalStatus: {
      type:    String,
      enum:    ['NOT_SENT', 'SENT', 'VIEWED', 'NEGOTIATION'],
      default: 'NOT_SENT',
    },

    nextFollowUpDate: { type: Date, default: null },

    // Quick notes — visible as tooltip in lead table
    notes: { type: String, trim: true, default: '' },

    // Account Clearance — required before WON (from NEGOTIATION stage)
    // Existing leads default to 'not_required' so they are grandfathered.
    accountClearance: {
      status: {
        type: String,
        enum: ['not_required', 'pending', 'approved', 'rejected'],
        default: 'not_required',
      },
      requestedAt:  { type: Date, default: null },
      approvedBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      approvedAt:   { type: Date, default: null },
      rejectedAt:   { type: Date, default: null },
      note:         { type: String, trim: true },
    },

    // Embedded activity timeline — no separate LeadActivity collection
    activityLog: [activityLogSchema],

    // Set when stage transitions to WON
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', default: null },

    isArchived:  { type: Boolean, default: false },
    archivedAt:  { type: Date, default: null },
    createdById: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

// Indexes
leadSchema.index({ stage: 1 });
leadSchema.index({ assignedToId: 1 });
leadSchema.index({ isArchived: 1 });
leadSchema.index({ nextFollowUpDate: 1 });
leadSchema.index({ categoryId: 1 });

// Auto-generate leadCode on first save (same Counter pattern as Client + Employee)
leadSchema.pre('save', async function () {
  if (this.isNew && !this.leadCode) {
    let counter = await Counter.findById('leadCode');
    if (!counter) {
      const lastDoc = await this.constructor.findOne({}, { leadCode: 1 }).sort({ leadCode: -1 });
      let lastNum = 0;
      if (lastDoc && lastDoc.leadCode) {
        const match = lastDoc.leadCode.match(/\d+$/);
        if (match) lastNum = parseInt(match[0], 10);
      }
      await Counter.findOneAndUpdate(
        { _id: 'leadCode' },
        { $setOnInsert: { seq: lastNum } },
        { new: true, upsert: true }
      );
    }
    counter = await Counter.findByIdAndUpdate(
      'leadCode',
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );
    this.leadCode = `LM-LEAD-${String(counter.seq).padStart(4, '0')}`;
  }
});

module.exports = mongoose.model('Lead', leadSchema);
module.exports.STAGES = STAGES;
