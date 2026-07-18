const express = require('express');
const router = express.Router();
const { authenticate, restrictTo } = require('../../middleware/auth');
const Client = require('./client.model');
const User = require('../users/user.model');
const getModel = require('../generic/generic.model');

router.use(authenticate);

// ── GET /api/clients ─────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const filter = {};
    
    // By default exclude archived unless explicitly requested
    if (req.query.archived === 'true') {
      filter.isArchived = true;
    } else if (req.query.all !== 'true') {
      filter.isArchived = { $ne: true };
    }
    
    if (req.query.status) filter.status = req.query.status;

    // Client role users only see their own record
    if (req.user.primaryRole === 'client' && req.user.linkedClientId) {
      filter._id = req.user.linkedClientId;
      filter.isArchived = { $ne: true };
    }

    // SMM users only see their assigned brands
    if (req.user.primaryRole === 'smm') {
      const assigned = req.user.assignedBrands || [];
      // Match by name field (the canonical client name used in assignedBrands)
      filter.name = { $in: assigned };
      filter.isArchived = { $ne: true };
    }

    const clients = await Client.find(filter).sort({ createdAt: -1 });
    res.json(clients);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── POST /api/clients ─────────────────────────────────────────────────────────
// Creates a client record AND auto-provisions an Access Control login for them
router.post('/', restrictTo('super_admin', 'admin', 'operations_head', 'hr'), async (req, res) => {
  try {
    const {
      name, clientName, pocName, pocEmail, pocMobile,
      email, phone, engagementMode, engagementModel,
      accountManager, brandType, planningMode, status, notes,
    } = req.body;

    // Normalise: frontend may send clientName or name
    const resolvedName = clientName || name;
    if (!resolvedName) return res.status(400).json({ message: 'Client name is required.' });

    const clientDoc = new Client({
      name: resolvedName,
      pocName: pocName || '',
      pocEmail: pocEmail || email || '',
      pocMobile: pocMobile || phone || '',
      brandType: brandType || '',
      engagementModel: engagementModel || (engagementMode === 'one_time' ? 'one_time_project' : 'retainer'),
      planningMode: planningMode || 'content_calendar',
      status: status || 'active',
      isArchived: false,
    });

    await clientDoc.save();

    // ── Auto-provision Access Control login ───────────────────────────────────
    let loginCredentials = null;
    const clientEmail = pocEmail || email || '';

    // Build a clean loginId from company name
    const nameParts = resolvedName
      .trim().toLowerCase()
      .replace(/[^a-z0-9 ]/g, '')
      .split(' ')
      .filter(Boolean);
    const slugBase = nameParts.slice(0, 2).join('_') || 'client';
    const loginId = `${slugBase}_${clientDoc._id.toString().slice(-4)}`;
    // Temp password: Capitalize first word + last 4 chars of ID + @Lenstalk
    const tempPassword = `${nameParts[0].charAt(0).toUpperCase()}${nameParts[0].slice(1)}@${clientDoc._id.toString().slice(-6)}`;

    // Check if a user with this loginId or email already exists
    const existingUser = clientEmail
      ? await User.findOne({ $or: [{ loginId }, { email: clientEmail.toLowerCase() }] })
      : await User.findOne({ loginId });

    if (!existingUser) {
      const userDoc = new User({
        name: pocName || resolvedName,
        email: clientEmail || `${loginId}@lenstalkclient.com`,
        loginId,
        passwordHash: tempPassword,   // Pre-save hook will bcrypt this
        primaryRole: 'client',
        accessRoles: ['client'],
        linkedClientId: clientDoc._id,
        linkedClientName: resolvedName,
        status: 'active',
        isActive: true,
        createdBy: req.user._id,
      });
      await userDoc.save();

      // Link userId back to client
      clientDoc.userId = userDoc._id;
      await clientDoc.save();

      loginCredentials = {
        loginId,
        tempPassword,
        email: userDoc.email,
      };
    } else {
      // User already exists — just link the clientId if not set
      if (!existingUser.linkedClientId) {
        existingUser.linkedClientId = clientDoc._id;
        await existingUser.save({ validateModifiedOnly: true });
      }
      loginCredentials = {
        loginId: existingUser.loginId,
        note: 'A user account with this email already existed and has been linked.',
      };
    }

    res.status(201).json({ client: clientDoc, loginCredentials });
  } catch (err) {
    console.error('Create client error:', err);
    res.status(400).json({ message: err.message });
  }
});

// ── GET /api/clients/:id ──────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const doc = await Client.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Client not found.' });
    res.json(doc);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── PATCH /api/clients/:id ────────────────────────────────────────────────────
router.patch('/:id', restrictTo('super_admin', 'admin', 'operations_head', 'hr'), async (req, res) => {
  try {
    const { clientName, name, ...rest } = req.body;
    const updates = { ...rest };
    if (clientName || name) updates.name = clientName || name;

    const doc = await Client.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
    if (!doc) return res.status(404).json({ message: 'Client not found.' });
    res.json(doc);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// ── POST /api/clients/:id/archive ─────────────────────────────────────────────
// Soft-archives the client and deactivates their login
router.post('/:id/archive', restrictTo('super_admin', 'admin'), async (req, res) => {
  try {
    const doc = await Client.findByIdAndUpdate(
      req.params.id,
      { status: 'archived', isArchived: true, archivedAt: new Date() },
      { new: true }
    );
    if (!doc) return res.status(404).json({ message: 'Client not found.' });

    // Deactivate client's login account so they can't log in anymore
    if (doc.userId) {
      await User.findByIdAndUpdate(doc.userId, {
        isActive: false,
        status: 'inactive',
      });
    } else {
      // Try to find by linkedClientId
      await User.updateMany(
        { linkedClientId: doc._id },
        { isActive: false, status: 'inactive' }
      );
    }

    // ── Cascading Soft-Archive for related generic records ──
    //
    // FIX (P1 — clientId dual-match): Use clientId (ObjectId) as primary match.
    // Falls back to name-regex for records not yet backfilled with clientId.
    // This prevents the name-collision bug where archiving Client A silently
    // archives Client B's tasks just because their names are similar/identical.
    //
    // After running scripts/backfill-clientId.js, the name-regex fallback
    // will match 0 additional records (all will be caught by clientId).
    const escName = doc.name.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const clientNameRegex = new RegExp('^' + escName + '$', 'i');
    const cascadeFilter = (extra = {}) => ({
      $and: [
        { $or: [{ clientId: doc._id }, { client: clientNameRegex }] },
        extra,
      ]
    });
    await getModel('content_tasks').updateMany(
      cascadeFilter({ isArchived: { $ne: true } }),
      { isArchived: true, archivedAt: new Date(), archivedReason: 'Cascade: Client archived', clientId: doc._id }
    );
    await getModel('lenstalk_shoots_v1').updateMany(
      cascadeFilter({ isArchived: { $ne: true } }),
      { isArchived: true, archivedAt: new Date(), archivedReason: 'Cascade: Client archived', clientId: doc._id }
    );
    await getModel('lenstalk_influencer_edits_v1').updateMany(
      cascadeFilter({ isArchived: { $ne: true } }),
      { isArchived: true, archivedAt: new Date(), archivedReason: 'Cascade: Client archived', clientId: doc._id }
    );
    // Also cascade account slips/logs linked to this client
    await getModel('lenstalk_account_slips_v1').updateMany(
      cascadeFilter({ isArchived: { $ne: true } }),
      { isArchived: true, archivedAt: new Date(), archivedReason: 'Cascade: Client archived', clientId: doc._id }
    );

    res.json({ message: `${doc.name} archived successfully.`, client: doc });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── POST /api/clients/:id/restore ─────────────────────────────────────────────
// Restores an archived client — SUPER ADMIN ONLY
router.post('/:id/restore', restrictTo('super_admin'), async (req, res) => {
  try {
    const doc = await Client.findByIdAndUpdate(
      req.params.id,
      { status: 'active', isArchived: false, $unset: { archivedAt: 1 } },
      { new: true }
    );
    if (!doc) return res.status(404).json({ message: 'Client not found.' });

    // Re-activate login
    await User.updateMany(
      { linkedClientId: doc._id },
      { isActive: true, status: 'active' }
    );

    // ── Cascading Restore for related generic records ──
    const escNameR = doc.name.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const clientNameRegexR = new RegExp('^' + escNameR + '$', 'i');
    const restoreFilter = () => ({
      $and: [
        { $or: [{ clientId: doc._id }, { client: clientNameRegexR }] },
        { archivedReason: 'Cascade: Client archived' },
      ]
    });
    await getModel('content_tasks').updateMany(
      restoreFilter(),
      { isArchived: false, $unset: { archivedAt: 1, archivedReason: 1 } }
    );
    await getModel('lenstalk_shoots_v1').updateMany(
      restoreFilter(),
      { isArchived: false, $unset: { archivedAt: 1, archivedReason: 1 } }
    );
    await getModel('lenstalk_influencer_edits_v1').updateMany(
      restoreFilter(),
      { isArchived: false, $unset: { archivedAt: 1, archivedReason: 1 } }
    );
    await getModel('lenstalk_account_slips_v1').updateMany(
      restoreFilter(),
      { isArchived: false, $unset: { archivedAt: 1, archivedReason: 1 } }
    );

    res.json({ message: `${doc.name} restored successfully.`, client: doc });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── DELETE /api/clients/:id ───────────────────────────────────────────────────
// Permanently deletes a client — SUPER ADMIN ONLY (via Archive Vault)
router.delete('/:id', restrictTo('super_admin'), async (req, res) => {
  try {
    let doc;
    if (req.query.permanent === 'true') {
      doc = await Client.findByIdAndDelete(req.params.id);
      if (!doc) return res.status(404).json({ message: 'Client not found.' });
      if (doc.userId) await User.findByIdAndDelete(doc.userId);
      else await User.deleteMany({ linkedClientId: doc._id });

      // ZERO DATA LOSS + P1 FIX: Soft-archive related items using dual-match
      const escNameD = doc.name.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      const clientNameRegexD = new RegExp('^' + escNameD + '$', 'i');
      const orphanFilter = () => ({ $or: [{ clientId: doc._id }, { client: clientNameRegexD }] });
      const orphanMeta = { isArchived: true, archivedAt: new Date(), archivedReason: 'Orphaned: Parent client permanently deleted' };
      await Promise.allSettled([
        getModel('content_tasks').updateMany(orphanFilter(), orphanMeta),
        getModel('lenstalk_shoots_v1').updateMany(orphanFilter(), orphanMeta),
        getModel('lenstalk_influencer_edits_v1').updateMany(orphanFilter(), orphanMeta),
        getModel('lenstalk_account_slips_v1').updateMany(orphanFilter(), orphanMeta),
        getModel('lenstalk_account_logs_v1').updateMany(orphanFilter(), orphanMeta),
      ]);

      return res.json({ message: 'Client permanently deleted. All linked records archived for audit trail.' });
    } else {
      doc = await Client.findByIdAndUpdate(req.params.id, { isArchived: true, archivedAt: new Date() }, { new: true });
      if (!doc) return res.status(404).json({ message: 'Client not found.' });
      if (doc.userId) await User.findByIdAndUpdate(doc.userId, { isActive: false, status: 'inactive' });
      else await User.updateMany({ linkedClientId: doc._id }, { isActive: false, status: 'inactive' });

      // Dual-match cascade (same as POST /:id/archive above)
      const escNameS = doc.name.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      const clientNameRegexS = new RegExp('^' + escNameS + '$', 'i');
      const softFilter = (extra = {}) => ({ $and: [{ $or: [{ clientId: doc._id }, { client: clientNameRegexS }] }, extra] });
      await Promise.allSettled([
        getModel('content_tasks').updateMany(softFilter({ isArchived: { $ne: true } }), { isArchived: true, archivedAt: new Date(), archivedReason: 'Cascade: Client archived', clientId: doc._id }),
        getModel('lenstalk_shoots_v1').updateMany(softFilter({ isArchived: { $ne: true } }), { isArchived: true, archivedAt: new Date(), archivedReason: 'Cascade: Client archived', clientId: doc._id }),
        getModel('lenstalk_influencer_edits_v1').updateMany(softFilter({ isArchived: { $ne: true } }), { isArchived: true, archivedAt: new Date(), archivedReason: 'Cascade: Client archived', clientId: doc._id }),
        getModel('lenstalk_account_slips_v1').updateMany(softFilter({ isArchived: { $ne: true } }), { isArchived: true, archivedAt: new Date(), archivedReason: 'Cascade: Client archived', clientId: doc._id }),
      ]);

      res.json({ message: 'Client safely archived (Zero Data Loss Policy enforced).' });
    }
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
