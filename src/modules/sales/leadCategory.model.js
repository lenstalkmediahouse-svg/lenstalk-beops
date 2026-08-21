/**
 * LeadCategory — folder grouping for Sales leads
 */
const mongoose = require('mongoose');

const leadCategorySchema = new mongoose.Schema(
  {
    name:        { type: String, required: true, trim: true },
    color:       { type: String, default: '#6366F1' }, // hex color
    description: { type: String, trim: true },
    createdById: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    isArchived:  { type: Boolean, default: false },
  },
  { timestamps: true }
);

leadCategorySchema.index({ isArchived: 1 });

module.exports = mongoose.model('LeadCategory', leadCategorySchema);
