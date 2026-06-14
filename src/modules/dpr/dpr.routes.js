const express = require('express');
const router = express.Router();
const { authenticate, restrictTo } = require('../../middleware/auth');
const getModel = require('../generic/generic.model');
const auditLog = require('../../middleware/auditLogger');

const DPR = () => getModel('dpr_entries');

router.use(authenticate);

router.get('/', async (req, res) => {
  try {
    const Model = DPR();
    const filter = {};
    if (req.query.date) filter.date = req.query.date;

    // Default: exclude archived records
    if (req.query.archived === 'true') {
      filter.isArchived = true;
    } else if (req.query.all !== 'true') {
      filter.isArchived = { $ne: true };
    }

    // scope=personal: force userId filter regardless of role.
    // Used by HR/Operations users accessing their own "My DPR" workspace tab.
    const isPersonalScope = req.query.scope === 'personal';
    const isPrivilegedRole = ['super_admin', 'admin', 'hr', 'operations_head'].includes(req.user.primaryRole);

    if (isPersonalScope || !isPrivilegedRole) {
      // Always scope to the logged-in user's own records
      filter.userId = req.user._id.toString();
    }
    // Privileged roles without scope=personal get all records (HR panel view)

    const entries = await Model.find(filter).sort({ date: -1 });
    res.json(entries);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.post('/', async (req, res) => {
  try {
    const Model = DPR();

    // Auto-resolve target user ID
    let targetUserId = req.user._id.toString();
    const providedEmpId = req.body.employeeId;
    let submitter = req.user.name;

    if (providedEmpId && providedEmpId !== req.user.linkedEmployeeId?.toString() && providedEmpId !== req.user._id.toString()) {
      // HR/Admin submitting on behalf of someone
      const Employee = require('../employees/employee.model');
      const empData = await Employee.findById(providedEmpId);
      if (empData && empData.userId) {
        targetUserId = empData.userId.toString();
      }
      submitter = `${req.user.name} (HR)`; // Add label as requested
    }

    const doc = new Model({ ...req.body, userId: targetUserId, submittedBy: submitter });
    await doc.save();
    res.status(201).json(doc);
  } catch (err) { res.status(400).json({ message: err.message }); }
});

router.patch('/:id', async (req, res) => {
  try {
    const Model = DPR();
    const doc = await Model.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!doc) return res.status(404).json({ message: 'DPR entry not found.' });
    res.json(doc);
  } catch (err) { res.status(400).json({ message: err.message }); }
});

router.delete('/:id', restrictTo('super_admin', 'admin', 'hr'), async (req, res) => {
  try {
    const Model = DPR();
    if (req.query.permanent === 'true') {
      // ZERO DATA LOSS — Permanent delete: SUPER ADMIN ONLY
      if (req.user?.primaryRole !== 'super_admin') {
        return res.status(403).json({ message: 'Forbidden: Permanent delete restricted to Super Admin only.' });
      }
      await Model.findByIdAndDelete(req.params.id);
      auditLog.write({ action: 'DATA_PERM_DELETE', actor: req.user?.name || 'Super Admin', details: `PERMANENT DELETE DPR entry | ID: ${req.params.id}`, module: 'HR System', ip: req.ip || '—' });
      return res.json({ message: 'DPR permanently deleted.' });
    } else {
      await Model.findByIdAndUpdate(req.params.id, { isArchived: true, archivedAt: new Date() });
      auditLog.write({ action: 'DATA_ARCHIVE', actor: req.user?.name || 'Unknown', details: `Archived DPR entry | ID: ${req.params.id}`, module: 'HR System', ip: req.ip || '—' });
      res.json({ message: 'DPR safely archived (Zero Data Loss Policy enforced).' });
    }
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
