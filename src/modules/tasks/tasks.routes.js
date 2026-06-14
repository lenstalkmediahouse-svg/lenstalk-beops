const express = require('express');
const router = express.Router();
const { authenticate, restrictTo } = require('../../middleware/auth');
const getModel = require('../generic/generic.model');
const auditLog = require('../../middleware/auditLogger');

const Tasks = () => getModel('content_tasks');

router.use(authenticate);

router.get('/', async (req, res) => {
  try {
    const Model = Tasks();
    const filter = {};
    if (req.query.status) filter.workflowStatus = req.query.status;

    // Default: exclude archived records
    if (req.query.archived === 'true') {
      filter.isArchived = true;
    } else if (req.query.all !== 'true') {
      filter.isArchived = { $ne: true };
    }
    // Employees only see tasks assigned to them
    if (['employee', 'cinematographer'].includes(req.user.primaryRole)) {
      filter['assignedTo'] = req.user._id.toString();
    }
    const tasks = await Model.find(filter).sort({ createdAt: -1 });
    res.json(tasks);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.post('/', async (req, res) => {
  try {
    const Model = Tasks();
    const doc = new Model({ ...req.body, createdBy: req.user._id, workflowStatus: req.body.workflowStatus || 'draft' });
    await doc.save();
    res.status(201).json(doc);
  } catch (err) { res.status(400).json({ message: err.message }); }
});

router.patch('/:id', async (req, res) => {
  try {
    const Model = Tasks();
    const doc = await Model.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!doc) return res.status(404).json({ message: 'Task not found.' });
    res.json(doc);
  } catch (err) { res.status(400).json({ message: err.message }); }
});

router.patch('/:id/submit', async (req, res) => {
  try {
    const Model = Tasks();
    const doc = await Model.findByIdAndUpdate(
      req.params.id,
      { workflowStatus: 'pending_admin_approval', submittedAt: new Date() },
      { new: true }
    );
    if (!doc) return res.status(404).json({ message: 'Task not found.' });
    res.json(doc);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.patch('/:id/approve', restrictTo('super_admin', 'admin', 'operations_head'), async (req, res) => {
  try {
    const Model = Tasks();
    const doc = await Model.findByIdAndUpdate(
      req.params.id,
      { workflowStatus: 'approved_by_admin', approvedAt: new Date(), approvedBy: req.user.name },
      { new: true }
    );
    if (!doc) return res.status(404).json({ message: 'Task not found.' });
    res.json(doc);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.patch('/:id/reject', restrictTo('super_admin', 'admin', 'operations_head'), async (req, res) => {
  try {
    const Model = Tasks();
    const doc = await Model.findByIdAndUpdate(
      req.params.id,
      { workflowStatus: 'rejected_by_admin', adminFeedback: req.body.feedback, rejectedAt: new Date() },
      { new: true }
    );
    if (!doc) return res.status(404).json({ message: 'Task not found.' });
    res.json(doc);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.delete('/:id', restrictTo('super_admin', 'admin'), async (req, res) => {
  try {
    const Model = Tasks();
    if (req.query.permanent === 'true') {
      // ZERO DATA LOSS — Permanent delete: SUPER ADMIN ONLY
      if (req.user?.primaryRole !== 'super_admin') {
        return res.status(403).json({ message: 'Forbidden: Permanent delete restricted to Super Admin only.' });
      }
      const doc = await Model.findByIdAndDelete(req.params.id);
      auditLog.write({ action: 'DATA_PERM_DELETE', actor: req.user?.name || 'Super Admin', details: `PERMANENT DELETE task | ID: ${req.params.id}`, module: 'Tasks', ip: req.ip || '—' });
      return res.json({ message: 'Task permanently deleted.' });
    } else {
      const doc = await Model.findByIdAndUpdate(req.params.id, { isArchived: true, archivedAt: new Date() }, { new: true });
      auditLog.write({ action: 'DATA_ARCHIVE', actor: req.user?.name || 'Unknown', details: `Archived task | ID: ${req.params.id}`, module: 'Tasks', ip: req.ip || '—' });
      res.json({ message: 'Task safely archived (Zero Data Loss Policy enforced).' });
    }
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
