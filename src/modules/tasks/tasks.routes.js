const express = require('express');
const router = express.Router();
const { authenticate, restrictTo } = require('../../middleware/auth');
const getModel = require('../generic/generic.model');

const Tasks = () => getModel('content_tasks');

router.use(authenticate);

router.get('/', async (req, res) => {
  try {
    const Model = Tasks();
    const filter = {};
    if (req.query.status) filter.workflowStatus = req.query.status;
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
    await Model.findByIdAndDelete(req.params.id);
    res.json({ message: 'Task deleted.' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
