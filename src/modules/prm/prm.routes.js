const express = require('express');
const router = express.Router();
const PRM = require('./prm.model');
const getModel = require('../generic/generic.model');
const { authenticate } = require('../../middleware/auth');
const rateLimit = require('express-rate-limit');

// Rate limiter for public registration form — max 5 submissions per IP per 15 min
const applyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many submissions from this IP. Please try again in 15 minutes.' },
});
// Rate limiter for configs endpoint — max 60 requests per IP per minute
const configsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests.' },
});

const ALLOWED_ROLES = ['super_admin', 'admin', 'operations_head', 'prm'];

function checkAccess(req, res) {
  const role = req.user?.primaryRole;
  const accessRoles = req.user?.accessRoles || [];
  // Allow if primaryRole is in ALLOWED_ROLES, OR if user has 'prm' in their accessRoles (Admin-granted)
  const allowed = ALLOWED_ROLES.includes(role) || accessRoles.includes('prm') || accessRoles.includes('PRM');
  if (!allowed) {
    res.status(403).json({ message: 'Access denied.' });
    return false;
  }
  return true;
}

/**
 * GET /api/prm/configs
 * Public endpoint to fetch active skill types and custom pricing units for unauthenticated application forms.
 */
router.get('/configs', configsLimiter, async (req, res) => {
  try {
    const SkillModel = getModel('lenstalk_skill_types_v1');
    const PricingModel = getModel('lenstalk_pricing_types_v1');
    
    const [skills, pricing] = await Promise.all([
      SkillModel.find({}),
      PricingModel.find({})
    ]);

    res.json({ skills, pricing });
  } catch (err) {
    console.error('PRM configs fetch error:', err);
    res.status(500).json({ message: 'Server error fetching configurations.' });
  }
});

/**
 * POST /api/prm/apply
 * Public unauthenticated endpoint for vendors/freelancers submitting registrations via campaign links.
 * Enforces email/phone duplication check against active/archived PRM records.
 */
router.post('/apply', applyLimiter, async (req, res) => {
  try {
    const { type, name, skill, category, phone, email, address, notes, rateCard } = req.body;

    if (!type || !name || !phone) {
      return res.status(400).json({ message: 'Type, Name, and Phone number are required.' });
    }

    const cleanPhone = phone.trim();
    const cleanEmail = email ? email.trim().toLowerCase() : '';
    const filter = [{ phone: cleanPhone }];
    
    // Exact lowercase match — safe, no ReDoS risk
    if (cleanEmail) {
      filter.push({ email: cleanEmail });
    }

    // Duplicate check by phone or email
    const existing = await PRM.findOne({ $or: filter });

    if (existing) {
      return res.status(409).json({
        message: 'A profile with this phone number or email address already exists in the registry.'
      });
    }

    const record = new PRM({
      type, 
      name: name.trim(), 
      skill: skill ? skill.trim() : '', 
      category: category ? category.trim() : '', 
      phone: cleanPhone, 
      email: cleanEmail,
      address: address ? address.trim() : '',
      status: 'active', // Default to active
      notes: notes ? notes.trim() + ' (Submitted via public link)' : 'Submitted via public link', 
      rateCard: rateCard || [],
      createdBy: null, // Indicates system/public submission
    });

    await record.save();

    res.status(201).json({
      message: 'Registration submitted successfully!',
      record
    });
  } catch (err) {
    console.error('PRM public application error:', err);
    res.status(500).json({ message: 'Internal server error while submitting registration.' });
  }
});

/**
 * GET /api/prm
 * List PRM records (active or archived)
 */
router.get('/', authenticate, async (req, res) => {
  try {
    if (!checkAccess(req, res)) return;
    const { type, archived } = req.query;
    const filter = archived === 'true' ? { isArchived: true } : { isArchived: false };
    if (type) filter.type = type;
    const records = await PRM.find(filter).sort({ createdAt: -1 });
    res.json(records);
  } catch (err) {
    console.error('PRM fetch error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
});

/**
 * POST /api/prm
 * Create a new PRM record
 */
router.post('/', authenticate, async (req, res) => {
  try {
    if (!checkAccess(req, res)) return;
    const { type, name, skill, category, phone, email, address, status, notes, rateCard } = req.body;
    if (!type || !name) {
      return res.status(400).json({ message: 'Type and Name are required.' });
    }
    const record = new PRM({
      type, name, skill, category, phone, email, address,
      status: status || 'active', notes, rateCard: rateCard || [],
      createdBy: req.user._id,
    });
    await record.save();
    res.status(201).json(record);
  } catch (err) {
    console.error('PRM create error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
});

/**
 * PUT /api/prm/:id
 * Update a PRM record (including rate card)
 */
router.put('/:id', authenticate, async (req, res) => {
  try {
    if (!checkAccess(req, res)) return;
    const record = await PRM.findById(req.params.id);
    if (!record) return res.status(404).json({ message: 'Record not found.' });

    const fields = ['type', 'name', 'skill', 'category', 'phone', 'email', 'address', 'status', 'notes', 'rateCard'];
    fields.forEach(f => { if (req.body[f] !== undefined) record[f] = req.body[f]; });

    await record.save();
    res.json(record);
  } catch (err) {
    console.error('PRM update error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
});

/**
 * DELETE /api/prm/:id
 * Soft-archive a PRM record
 */
router.delete('/:id', authenticate, async (req, res) => {
  try {
    if (!checkAccess(req, res)) return;
    const record = await PRM.findByIdAndUpdate(
      req.params.id,
      { isArchived: true },
      { new: true }
    );
    if (!record) return res.status(404).json({ message: 'Record not found.' });
    res.json({ message: 'Archived successfully.', record });
  } catch (err) {
    console.error('PRM archive error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
});

/**
 * PATCH /api/prm/:id/restore
 * Restore an archived PRM record — SUPER ADMIN ONLY
 */
router.patch('/:id/restore', authenticate, async (req, res) => {
  try {
    if (req.user?.primaryRole !== 'super_admin') {
      return res.status(403).json({ message: 'Forbidden: Restore is restricted to Super Admin only.' });
    }
    const record = await PRM.findByIdAndUpdate(
      req.params.id,
      { isArchived: false },
      { new: true }
    );
    if (!record) return res.status(404).json({ message: 'Record not found.' });
    res.json({ message: 'Restored successfully.', record });
  } catch (err) {
    console.error('PRM restore error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
});

/**
 * DELETE /api/prm/:id/permanent
 * Permanently delete a PRM record — SUPER ADMIN ONLY
 */
router.delete('/:id/permanent', authenticate, async (req, res) => {
  try {
    if (req.user?.primaryRole !== 'super_admin') {
      return res.status(403).json({ message: 'Forbidden: Permanent delete is restricted to Super Admin only.' });
    }
    const record = await PRM.findByIdAndDelete(req.params.id);
    if (!record) return res.status(404).json({ message: 'Record not found.' });
    const auditLog = require('../../middleware/auditLogger');
    auditLog.write({ action: 'DATA_PERM_DELETE', actor: req.user?.name || 'Super Admin', details: `PERMANENT DELETE PRM record | ID: ${req.params.id}`, module: 'PRM Registry', ip: req.ip || '—' });
    res.json({ message: 'Record permanently deleted.' });
  } catch (err) {
    console.error('PRM permanent delete error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;
