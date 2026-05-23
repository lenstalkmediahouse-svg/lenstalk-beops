const mongoose = require('mongoose');

// ── Manual Influencer Entry (added by admin inside a campaign) ─────────────────
const influencerEntrySchema = new mongoose.Schema({
  name:          { type: String, required: true, trim: true },
  phone:         { type: String, trim: true },
  email:         { type: String, trim: true, lowercase: true },
  location:      { type: String, trim: true },
  platforms:     [{ type: String }],
  handles:       { type: mongoose.Schema.Types.Mixed, default: {} },
  followers:     { type: mongoose.Schema.Types.Mixed, default: {} },
  profileLinks:  { type: mongoose.Schema.Types.Mixed, default: {} },
  totalFollowers:{ type: String, trim: true },
  niches:        [{ type: String, trim: true }],
  categories:    [{ type: String, trim: true }],
  
  // Backward compatibility fields
  platform:      { type: String, trim: true },
  handle:        { type: String, trim: true },
  niche:         { type: String, trim: true },

  agreedPayment: { type: Number, default: 0 },
  agencyFee:     { type: Number, default: 0 },   // INTERNAL — never shown externally
  quotedRate:    { type: String, trim: true, default: '' },
  
  notes:         { type: String, trim: true },
  status:        { type: String, enum: ['planning', 'active', 'paused', 'completed', 'cancelled'], default: 'planning' },
  addedAt:       { type: Date, default: Date.now },
}, { _id: true });

// ── Public Link Registration (influencer self-applies via link) ────────────────
const registrationSchema = new mongoose.Schema({
  name:          { type: String, required: true, trim: true },
  phone:         { type: String, required: true, trim: true },
  email:         { type: String, trim: true, lowercase: true },
  location:      { type: String, trim: true },
  platforms:     [{ type: String }],
  handles:       { type: mongoose.Schema.Types.Mixed, default: {} },
  followers:     { type: mongoose.Schema.Types.Mixed, default: {} },
  profileLinks:  { type: mongoose.Schema.Types.Mixed, default: {} },
  role:          { type: String, default: 'influencer' },
  niche:         { type: String, trim: true },          // Legacy niche field
  niches:        [{ type: String, trim: true }],
  categories:    [{ type: String, trim: true }],
  influencerType:{ type: String, trim: true },          // e.g. Fashion Influencer, Tech Influencer etc.
  totalFollowers:{ type: String, trim: true },          // overall followers count
  currentEngagement: { type: String, trim: true },      // current engagement rate/box
  quotedRate:    { type: String, trim: true, default: '' },
  notes:         { type: String, trim: true },
  registeredAt:  { type: Date, default: Date.now },
  reviewStatus:  { type: String, enum: ['pending', 'shortlisted', 'rejected'], default: 'pending' },
  agreedPayment: { type: Number, default: 0 },
  agencyFee:     { type: Number, default: 0 },
  promoted:      { type: Boolean, default: false },
  promotedAt:    { type: Date },
}, { _id: true });


// ── Main Campaign Schema ───────────────────────────────────────────────────────
const influencerCampaignSchema = new mongoose.Schema({
  campaignName:    { type: String, required: true, trim: true },
  client:          { type: String, trim: true },           // INTERNAL — hidden from influencer
  engagementRole:  { type: String, default: 'influencer' },
  brandType:       { type: String, trim: true },           // Shown to influencer via public form
  category:        { type: String, trim: true },
  niche:           { type: String, trim: true },
  influencerNiche: { type: String, trim: true },
  influencerNiches: [{ type: String, trim: true }],   // Multi-niche support
  platforms:       [{ type: String }],                     // Required platforms for this campaign
  notes:           { type: String, trim: true },           // Brand brief + budget hint
  deliverables:    { type: String, trim: true },           // e.g. "3 Reels + 5 Stories"
  startingPayment: { type: Number, default: 0 },           // "Starting from ₹X" shown to influencer
  fromDate:        { type: Date },
  toDate:          { type: Date },                         // Campaign end date
  linkDeadline:    { type: Date },                         // Application link closes on this date
  status:          { type: String, enum: ['planning', 'active', 'paused', 'completed', 'cancelled'], default: 'planning' },
  source:          { type: String, enum: ['manual', 'from_shoot', 'link_campaign'], default: 'manual' },
  shootRef:        { type: String },                       // Original shoot _id if source = from_shoot
  createdBy:       { type: String },
  isArchived:      { type: Boolean, default: false },
  archivedAt:      { type: Date },
  influencers:     [influencerEntrySchema],                // Manual influencer entries
  registrations:   [registrationSchema],                   // Public link form submissions
}, { timestamps: true });

module.exports = mongoose.model('InfluencerCampaign', influencerCampaignSchema);
