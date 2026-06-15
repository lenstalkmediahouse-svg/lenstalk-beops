const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const InfluencerCampaign = require('./influencerCampaign.model');
const { authenticate, restrictTo } = require('../../middleware/auth');
const getGenericModel = require('../generic/generic.model');
const auditLog = require('../../middleware/auditLogger');

// Rate limiter for public registration (5 per hour per IP)
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { message: 'Too many applications from this IP. Please try again after an hour.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ─── PUBLIC: Get dynamic configs for public application form ──────────────────
// MUST be declared BEFORE /public/:id to prevent 'configs' being matched as an :id param
router.get('/public/configs', async (req, res) => {
  try {
    const NicheModel = getGenericModel('lenstalk_influencer_niches_v1');
    const niches = await NicheModel.find().lean();
    res.json({
      niches: niches.map(n => n.name).sort(),
    });
  } catch (err) {
    console.error('[public/configs] error:', err.message);
    res.status(500).json({ message: 'Failed to load configurations.' });
  }
});

// ─── PUBLIC: Get campaign brief (no auth — for influencer form) ───────────────
router.get('/public/:id', async (req, res) => {
  try {
    const campaign = await InfluencerCampaign.findById(req.params.id).select(
      'campaignName brandType engagementRole platforms notes deliverables startingPayment toDate status isArchived category niche influencerNiche influencerNiches'
    );
    if (!campaign || campaign.isArchived) {
      return res.status(404).json({ message: 'Campaign not found.' });
    }
    const now = new Date();
    const expired = campaign.toDate && new Date(campaign.toDate) < now;
    res.json({
      _id:             campaign._id,
      campaignName:    campaign.campaignName,
      brandType:       campaign.brandType,
      engagementRole:  campaign.engagementRole,
      platforms:       campaign.platforms,
      notes:           campaign.notes,
      deliverables:    campaign.deliverables,
      startingPayment: campaign.startingPayment,
      toDate:          campaign.toDate,
      status:          campaign.status,
      // Campaign classification tags — shown in public apply form header
      category:         campaign.category,
      niche:            campaign.niche,
      influencerNiche:  campaign.influencerNiche,
      influencerNiches: Array.isArray(campaign.influencerNiches) ? campaign.influencerNiches : [],
      expired,
    });
  } catch (err) {
    if (err.name === 'CastError') return res.status(404).json({ message: 'Campaign not found.' });
    res.status(500).json({ message: err.message });
  }
});

// ─── PUBLIC: Register as influencer via link (rate-limited, no auth) ──────────
router.post('/public/:id/register', registerLimiter, async (req, res) => {
  try {
    const campaign = await InfluencerCampaign.findById(req.params.id);
    if (!campaign || campaign.isArchived) {
      return res.status(404).json({ message: 'Campaign not found.' });
    }
    // Check if application deadline has passed
    const deadline = campaign.linkDeadline || campaign.toDate;
    if (deadline && new Date(deadline) < new Date()) {
      return res.status(410).json({ message: 'This campaign is no longer accepting applications.' });
    }
    const { name, phone, email, location, platforms, handles, followers, profileLinks, role, quotedRate, notes, currentEngagement, totalFollowers, niche, niches, categories, influencerType } = req.body;
    if (!name?.trim() || !phone?.trim()) {
      return res.status(400).json({ message: 'Name and phone are required.' });
    }
    const newRegistration = { name, phone, email, location, platforms: platforms || [], handles: handles || {}, followers: followers || {}, profileLinks: profileLinks || {}, role: role || 'influencer', quotedRate: quotedRate || '', notes, currentEngagement, totalFollowers, niche, niches: niches || [], categories: categories || [], influencerType };
    await InfluencerCampaign.findByIdAndUpdate(req.params.id, { $push: { registrations: newRegistration } });
    res.status(201).json({ message: 'Application submitted successfully!' });
  } catch (err) {
    if (err.name === 'CastError') return res.status(404).json({ message: 'Campaign not found.' });
    res.status(500).json({ message: err.message });
  }
});

// ─── AUTHENTICATED: Get all campaigns ─────────────────────────────────────────
router.get('/', authenticate, async (req, res) => {
  try {
    const showArchived = req.query.archived === 'true';
    const campaigns = await InfluencerCampaign.find({ isArchived: showArchived })
      .sort({ createdAt: -1 })
      .select('campaignName client engagementRole brandType platforms status fromDate toDate linkDeadline source shootRef startingPayment notes deliverables influencers registrations createdAt archivedAt influencerNiche influencerNiches');
    res.json(campaigns);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── AUTHENTICATED: Get single campaign with full detail ──────────────────────
router.get('/:id', authenticate, async (req, res) => {
  try {
    const campaign = await InfluencerCampaign.findById(req.params.id);
    if (!campaign || campaign.isArchived) {
      return res.status(404).json({ message: 'Campaign not found.' });
    }
    res.json(campaign);
  } catch (err) {
    if (err.name === 'CastError') return res.status(404).json({ message: 'Campaign not found.' });
    res.status(500).json({ message: err.message });
  }
});

// ─── AUTHENTICATED: Create new campaign ───────────────────────────────────────
router.post('/', authenticate, async (req, res) => {
  try {
    const {
      campaignName, client, engagementRole, brandType, platforms,
      notes, deliverables, startingPayment, fromDate, toDate, linkDeadline, status, source, shootRef
    } = req.body;
    if (!campaignName?.trim()) {
      return res.status(400).json({ message: 'Campaign name is required.' });
    }
    const campaign = new InfluencerCampaign({
      campaignName:    campaignName.trim(),
      client:          client?.trim() || '',
      engagementRole:  engagementRole || 'influencer',
      brandType:       brandType?.trim() || '',
      platforms:       Array.isArray(platforms) ? platforms : [],
      notes:           notes?.trim() || '',
      deliverables:    deliverables?.trim() || '',
      startingPayment: Number(startingPayment) || 0,
      fromDate:        fromDate || null,
      toDate:          toDate || null,
      linkDeadline:    linkDeadline || null,
      status:          status || 'planning',
      source:          source || 'manual',
      shootRef:        shootRef || null,
      createdBy:       req.user?.name || req.user?.loginId || 'unknown',
    });
    await campaign.save();
    res.status(201).json(campaign);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── AUTHENTICATED: Update campaign details ────────────────────────────────────
router.patch('/:id', authenticate, async (req, res) => {
  try {
    const allowed = ['campaignName', 'client', 'engagementRole', 'brandType', 'category', 'niche', 'influencerNiche', 'influencerNiches', 'platforms', 'notes', 'deliverables', 'startingPayment', 'fromDate', 'toDate', 'linkDeadline', 'status'];
    const update = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) update[k] = req.body[k]; });
    const campaign = await InfluencerCampaign.findByIdAndUpdate(req.params.id, { $set: update }, { new: true });
    if (!campaign) return res.status(404).json({ message: 'Campaign not found.' });
    res.json(campaign);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── AUTHENTICATED: Edit a link registration (name, phone, email, etc.) ───────
router.patch('/:id/registrations/:regId', authenticate, async (req, res) => {
  try {
    const allowed = ['name', 'phone', 'email', 'location', 'totalFollowers', 'currentEngagement', 'quotedRate', 'notes', 'platforms', 'handles', 'followers', 'profileLinks', 'niche', 'niches', 'categories'];
    const updateSet = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) updateSet[`registrations.$.${k}`] = req.body[k]; });
    const updatedCampaign = await InfluencerCampaign.findOneAndUpdate(
      { _id: req.params.id, 'registrations._id': req.params.regId },
      { $set: updateSet },
      { new: true }
    );
    if (!updatedCampaign) return res.status(404).json({ message: 'Campaign or Registration not found.' });
    res.json(updatedCampaign);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── AUTHENTICATED: Soft-archive or permanently delete campaign ─────────────────
router.delete('/:id', authenticate, async (req, res) => {
  try {
    if (req.query.permanent === 'true') {
      // ZERO DATA LOSS — Permanent delete: SUPER ADMIN ONLY
      if (req.user?.primaryRole !== 'super_admin') {
        return res.status(403).json({ message: 'Forbidden: Permanent delete is restricted to Super Admin only.' });
      }
      const campaign = await InfluencerCampaign.findByIdAndDelete(req.params.id);
      if (!campaign) return res.status(404).json({ message: 'Campaign not found.' });

      auditLog.write({
        action: 'DATA_PERM_DELETE',
        actor: req.user?.name || 'Super Admin',
        details: `PERMANENT DELETE influencer campaign: ${campaign.campaignName} | ID: ${campaign._id}`,
        module: 'Ads & Creators',
        ip: req.ip || '—',
      });
      return res.json({ message: 'Campaign permanently deleted.' });
    } else {
      const campaign = await InfluencerCampaign.findByIdAndUpdate(
        req.params.id,
        { isArchived: true, archivedAt: new Date() },
        { new: true }
      );
      if (!campaign) return res.status(404).json({ message: 'Campaign not found.' });

      auditLog.write({
        action: 'DATA_ARCHIVE',
        actor: req.user?.name || 'Unknown',
        details: `Archived influencer campaign: ${campaign.campaignName} | ID: ${campaign._id}`,
        module: 'Ads & Creators',
        ip: req.ip || '—',
      });
      res.json({ message: 'Campaign safely archived (Zero Data Loss Policy enforced).' });
    }
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── AUTHENTICATED: Restore archived campaign — SUPER ADMIN ONLY ─────────────
router.patch('/:id/restore', authenticate, restrictTo('super_admin'), async (req, res) => {
  try {
    const campaign = await InfluencerCampaign.findByIdAndUpdate(
      req.params.id,
      { isArchived: false, archivedAt: null },
      { new: true }
    );
    if (!campaign) return res.status(404).json({ message: 'Campaign not found.' });

    auditLog.write({
      action: 'DATA_RESTORE',
      actor: req.user?.name || 'Super Admin',
      details: `Restored influencer campaign: ${campaign.campaignName} | ID: ${campaign._id}`,
      module: 'Ads & Creators',
      ip: req.ip || '—',
    });

    res.json({ message: 'Campaign restored successfully.', data: campaign });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── AUTHENTICATED: Permanent delete campaign — SUPER ADMIN ONLY ─────────────
router.delete('/:id/permanent', authenticate, restrictTo('super_admin'), async (req, res) => {
  try {
    let campaign;
    if (req.query.permanent === 'true') {
      campaign = await InfluencerCampaign.findByIdAndDelete(req.params.id);
      if (!campaign) return res.status(404).json({ message: 'Campaign not found.' });

      auditLog.write({
        action: 'DATA_PERM_DELETE',
        actor: req.user?.name || 'Super Admin',
        details: `PERMANENT DELETE influencer campaign: ${campaign.campaignName} | ID: ${campaign._id}`,
        module: 'Ads & Creators',
        ip: req.ip || '—',
      });

      return res.json({ message: 'Campaign permanently deleted.' });
    } else {
      campaign = await InfluencerCampaign.findByIdAndUpdate(req.params.id, { isArchived: true, archivedAt: new Date() }, { new: true });
      if (!campaign) return res.status(404).json({ message: 'Campaign not found.' });

      auditLog.write({
        action: 'DATA_ARCHIVE',
        actor: req.user?.name || 'Unknown',
        details: `Archived influencer campaign: ${campaign.campaignName} | ID: ${campaign._id}`,
        module: 'Ads & Creators',
        ip: req.ip || '—',
      });

      res.json({ message: 'Campaign safely archived (Zero Data Loss Policy enforced).' });
    }
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


// ─── AUTHENTICATED: Add manual influencer entry to campaign ───────────────────
router.post('/:id/influencers', authenticate, async (req, res) => {
  try {
    const { name, phone, email, location, platform, platforms, handle, handles, followers, profileLinks, totalFollowers, niche, niches, categories, agreedPayment, agencyFee, quotedRate, notes, status } = req.body;
    if (!name?.trim()) return res.status(400).json({ message: 'Influencer name is required.' });
    const newInfluencer = { 
      name, phone, email, location,
      platform, handle, followers, // legacy
      platforms: platforms || [], 
      handles: handles || {}, 
      profileLinks: profileLinks || {},
      totalFollowers, niche, 
      niches: niches || [], 
      categories: categories || [], 
      agreedPayment: Number(agreedPayment) || 0, 
      agencyFee: Number(agencyFee) || 0, 
      quotedRate, notes, 
      status: status || 'planning' 
    };
    const updatedCampaign = await InfluencerCampaign.findByIdAndUpdate(
      req.params.id,
      { $push: { influencers: newInfluencer } },
      { new: true }
    );
    if (!updatedCampaign) return res.status(404).json({ message: 'Campaign not found.' });
    res.status(201).json(updatedCampaign);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── AUTHENTICATED: Remove manual influencer entry ────────────────────────────
router.delete('/:id/influencers/:entryId', authenticate, async (req, res) => {
  try {
    const updatedCampaign = await InfluencerCampaign.findByIdAndUpdate(
      req.params.id,
      { $pull: { influencers: { _id: req.params.entryId } } },
      { new: true }
    );
    if (!updatedCampaign) return res.status(404).json({ message: 'Campaign not found.' });
    res.json(updatedCampaign);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── AUTHENTICATED: Promote link registration → confirmed influencer ──────────
router.patch('/:id/registrations/:regId/promote', authenticate, async (req, res) => {
  try {
    const campaign = await InfluencerCampaign.findById(req.params.id);
    if (!campaign) return res.status(404).json({ message: 'Campaign not found.' });
    const reg = campaign.registrations.id(req.params.regId);
    if (!reg) return res.status(404).json({ message: 'Registration not found.' });
    const { agreedPayment, agencyFee } = req.body;
    const mainPlatform = reg.platforms?.[0] || '';
    const newInfluencer = {
      name:          reg.name,
      phone:         reg.phone,
      email:         reg.email,
      location:      reg.location,
      platform:      mainPlatform,
      handle:        reg.handles?.[mainPlatform] || '',
      followers:     reg.followers?.[mainPlatform] || '',
      platforms:     reg.platforms || [],
      handles:       reg.handles || {},
      profileLinks:  reg.profileLinks || {},
      totalFollowers: reg.totalFollowers || '',
      niche:         reg.niche || '',
      niches:        reg.niches || [],
      categories:    reg.categories || [],
      agreedPayment: Number(agreedPayment) || 0,
      agencyFee:     Number(agencyFee) || 0,
      quotedRate:    reg.quotedRate || '',
      notes:         reg.notes || '',
      status:        'planning',
    };

    const updatedCampaign = await InfluencerCampaign.findOneAndUpdate(
      { _id: req.params.id, 'registrations._id': req.params.regId },
      {
        $set: {
          'registrations.$.agreedPayment': Number(agreedPayment) || 0,
          'registrations.$.agencyFee': Number(agencyFee) || 0,
          'registrations.$.promoted': true,
          'registrations.$.promotedAt': new Date()
        },
        $push: { influencers: newInfluencer }
      },
      { new: true }
    );
    res.json(updatedCampaign);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── AUTHENTICATED: Update registration status (shortlisted / rejected) ──────
router.patch('/:id/registrations/:regId/status', authenticate, async (req, res) => {
  try {
    const updatedCampaign = await InfluencerCampaign.findOneAndUpdate(
      { _id: req.params.id, 'registrations._id': req.params.regId },
      { $set: { 'registrations.$.reviewStatus': status } },
      { new: true }
    );
    if (!updatedCampaign) return res.status(404).json({ message: 'Campaign or Registration not found.' });
    res.json(updatedCampaign);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── AUTHENTICATED: Delete a registration ─────────────────────────────────────
router.delete('/:id/registrations/:regId', authenticate, async (req, res) => {
  try {
    const updatedCampaign = await InfluencerCampaign.findByIdAndUpdate(
      req.params.id,
      { $pull: { registrations: { _id: req.params.regId } } },
      { new: true }
    );
    if (!updatedCampaign) return res.status(404).json({ message: 'Campaign not found.' });
    res.json(updatedCampaign);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;

