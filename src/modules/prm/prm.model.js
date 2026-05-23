const mongoose = require('mongoose');

const rateCardItemSchema = new mongoose.Schema({
  service:     { type: String, required: true, trim: true },
  pricingType: { type: String, default: 'fixed', trim: true }, // fixed | hourly | per_day | per_piece | custom
  customUnit:  { type: String, default: '', trim: true },       // stores the custom pricing unit label (e.g. 'Per Sq Ft')
  amount:      { type: Number, default: 0, min: 0 },
  notes:       { type: String, default: '', trim: true },
}, { _id: true });

const prmSchema = new mongoose.Schema(
  {
    type:       { type: String, enum: ['freelancer', 'vendor'], required: true },
    name:       { type: String, required: true, trim: true },
    skill:      { type: String, default: '', trim: true },
    category:   { type: String, default: '', trim: true },
    phone:      { type: String, default: '', trim: true },
    email:      { type: String, default: '', trim: true, lowercase: true },
    address:    { type: String, default: '', trim: true },  // only shown in View modal, not table
    status:     { type: String, enum: ['active', 'inactive'], default: 'active' },
    notes:      { type: String, default: '', trim: true },
    rateCard:   { type: [rateCardItemSchema], default: [] },
    isArchived: { type: Boolean, default: false },
    createdBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

prmSchema.index({ type: 1, status: 1 });
prmSchema.index({ isArchived: 1 });

module.exports = mongoose.model('PRM', prmSchema);
