
const getModel = require('./generic.model');
const auditLog = require('../../middleware/auditLogger');

/**
 * CONFIRMED PERMISSION RULES (2026-06-14):
 *  - getAll: excludes isArchived records by default (pass ?archived=true to get archived, ?all=true to get everything)
 *  - remove: always soft-archives UNLESS permanent=true AND user is super_admin
 *  - permanent=true without super_admin → 403 Forbidden
 *
 * DATA PROTECTION (post-incident fix 2026-06-14):
 *  - replaceCollection is PERMANENTLY DISABLED (HTTP 405)
 *  - All deletes are soft-archive
 *  - Permanent delete requires super_admin + explicit ?permanent=true
 *  - All data mutations are now audit-logged
 */

exports.getAll = async (req, res) => {
  try {
    const Model = getModel(req.params.module);

    let query = {};

    // PHASE 5: Default exclude archived records.
    if (req.query.archived === 'true') {
      query.isArchived = true;
    } else if (req.query.all !== 'true') {
      query.isArchived = { $ne: true };
    }

    // HIGH-2: Brand isolation for SMM users
    if (req.user?.primaryRole === 'smm') {
      const brandFilteredModules = [
        'content_tasks', 'lenstalk_reports_v1', 'lenstalk_ads_v1',
        'lenstalk_shoots_v1', 'lenstalk_ops_tasks_v1',
      ];
      if (brandFilteredModules.includes(req.params.module)) {
        query.client = { $in: req.user.assignedBrands || [] };
      }
    }

    const data = await Model.find(query);
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getById = async (req, res) => {
  try {
    const Model = getModel(req.params.module);
    const doc = await Model.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Not found' });
    res.status(200).json(doc);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.create = async (req, res) => {
  try {
    const Model = getModel(req.params.module);
    const doc = new Model(req.body);
    await doc.save();

    // Audit log: creation
    auditLog.write({
      action: 'DATA_CREATE',
      actor: req.user?.name || req.user?.loginId || 'Unknown',
      details: `Created record in [${req.params.module}] | ID: ${doc._id} | Name: ${doc.name || doc.clientName || doc.title || '—'}`,
      module: req.params.module,
      ip: req.ip || '—',
    });

    res.status(201).json(doc);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.update = async (req, res) => {
  try {
    const Model = getModel(req.params.module);
    const doc = await Model.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!doc) return res.status(404).json({ message: 'Not found' });

    // Audit log: update
    auditLog.write({
      action: 'DATA_UPDATE',
      actor: req.user?.name || req.user?.loginId || 'Unknown',
      details: `Updated record in [${req.params.module}] | ID: ${doc._id} | Name: ${doc.name || doc.clientName || doc.title || '—'}`,
      module: req.params.module,
      ip: req.ip || '—',
    });

    res.status(200).json(doc);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.remove = async (req, res) => {
  try {
    const Model = getModel(req.params.module);
    let doc;

    if (req.query.permanent === 'true') {
      // ZERO DATA LOSS: Permanent delete → SUPER ADMIN ONLY
      if (req.user?.primaryRole !== 'super_admin') {
        return res.status(403).json({
          message: 'Forbidden: Permanent delete is restricted to Super Admin only. Use Archive to soft-delete records.'
        });
      }
      doc = await Model.findByIdAndDelete(req.params.id);
      if (!doc) return res.status(404).json({ message: 'Not found' });

      // Audit log: permanent delete
      auditLog.write({
        action: 'DATA_PERM_DELETE',
        actor: req.user?.name || req.user?.loginId || 'Super Admin',
        details: `PERMANENT DELETE in [${req.params.module}] | ID: ${req.params.id} | Name: ${doc.name || doc.clientName || doc.title || '—'}`,
        module: req.params.module,
        ip: req.ip || '—',
      });

      return res.status(200).json({ message: 'Item permanently deleted.' });
    } else {
      // Soft-archive: any authorized role can archive
      doc = await Model.findByIdAndUpdate(
        req.params.id,
        { isArchived: true, archivedAt: new Date().toISOString() },
        { new: true }
      );
      if (!doc) return res.status(404).json({ message: 'Not found' });

      // Audit log: soft archive
      auditLog.write({
        action: 'DATA_ARCHIVE',
        actor: req.user?.name || req.user?.loginId || 'Unknown',
        details: `Archived record in [${req.params.module}] | ID: ${doc._id} | Name: ${doc.name || doc.clientName || doc.title || '—'}`,
        module: req.params.module,
        ip: req.ip || '—',
      });

      res.status(200).json({ message: 'Item safely archived (Zero Data Loss Policy enforced).', data: doc });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * PUT /api/data/:module/replace
 * PERMANENTLY DISABLED — This endpoint caused mass data loss.
 * The replaceCollection strategy (delete-all + reinsert) destroyed historical client and employee records.
 * All modules must use atomic POST/PATCH endpoints instead.
 */
exports.replaceCollection = async (req, res) => {
  // Audit log this attempt — it should never be called
  auditLog.write({
    action: 'BLOCKED_REPLACE_COLLECTION',
    actor: req.user?.name || req.user?.loginId || 'Unknown',
    details: `BLOCKED attempt to use deprecated replaceCollection on [${req.params?.module}]. This endpoint caused historical data loss and is permanently disabled.`,
    module: req.params?.module || 'Unknown',
    ip: req.ip || '—',
  });

  return res.status(405).json({
    message: 'Method Not Allowed: Bulk replace operations are PERMANENTLY DISABLED. This endpoint caused historical data loss. Use atomic POST/PATCH endpoints.'
  });
};
