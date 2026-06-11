const express = require('express');
const router = express.Router();
const { authenticate, restrictTo } = require('../../middleware/auth');
const getModel = require('../generic/generic.model');

const Salary = () => getModel('salary_slips');

router.use(authenticate);

// GET /api/salary
router.get('/', async (req, res) => {
  try {
    const Model = Salary();
    const filter = {};
    if (req.query.month) filter.month = req.query.month;
    if (req.query.employeeId) filter.employeeId = req.query.employeeId;
    // Employees only see their own slips
    if (!['super_admin', 'admin', 'hr'].includes(req.user.primaryRole)) {
      filter.userId = req.user._id.toString();
    }
    // Archive Vault: include archived; normal view: exclude archived
    if (req.query.include_archived === 'true') {
      filter.isArchived = true;
    } else {
      filter.isArchived = { $ne: true };
    }
    const slips = await Model.find(filter).sort({ createdAt: -1 });
    res.json(slips);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// POST /api/salary
router.post('/', restrictTo('super_admin', 'admin', 'hr'), async (req, res) => {
  try {
    const Model = Salary();
    const doc = new Model({ ...req.body, createdBy: req.user._id });
    await doc.save();
    res.status(201).json(doc);
  } catch (err) { res.status(400).json({ message: err.message }); }
});

// PATCH /api/salary/:id
router.patch('/:id', restrictTo('super_admin', 'admin', 'hr'), async (req, res) => {
  try {
    const Model = Salary();
    const doc = await Model.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!doc) return res.status(404).json({ message: 'Salary slip not found.' });
    res.json(doc);
  } catch (err) { res.status(400).json({ message: err.message }); }
});

// PATCH /api/salary/:id/mark-paid
router.patch('/:id/mark-paid', restrictTo('super_admin', 'admin', 'hr'), async (req, res) => {
  try {
    const Model = Salary();
    const doc = await Model.findByIdAndUpdate(
      req.params.id,
      { status: 'paid', payDate: new Date().toISOString().split('T')[0] },
      { new: true }
    );
    if (!doc) return res.status(404).json({ message: 'Salary slip not found.' });
    res.json(doc);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// POST /api/salary/mark-all-paid
router.post('/mark-all-paid', restrictTo('super_admin', 'admin', 'hr'), async (req, res) => {
  try {
    const Model = Salary();
    const { month } = req.body;
    const filter = { status: { $ne: 'paid' } };
    if (month) filter.month = month;
    const payDate = new Date().toISOString().split('T')[0];
    await Model.updateMany(filter, { status: 'paid', payDate });
    res.json({ message: 'All pending slips marked as paid.' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// PATCH /api/salary/:id/archive  — soft-archive (moves to Archive Vault)
router.patch('/:id/archive', restrictTo('super_admin', 'admin', 'hr'), async (req, res) => {
  try {
    const Model = Salary();
    const doc = await Model.findByIdAndUpdate(
      req.params.id,
      { isArchived: true, archivedAt: new Date().toISOString() },
      { new: true }
    );
    if (!doc) return res.status(404).json({ message: 'Salary slip not found.' });
    res.json(doc);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// PATCH /api/salary/:id/restore  — restore from archive
router.patch('/:id/restore', restrictTo('super_admin', 'admin', 'hr'), async (req, res) => {
  try {
    const Model = Salary();
    const doc = await Model.findByIdAndUpdate(
      req.params.id,
      { isArchived: false, archivedAt: null },
      { new: true }
    );
    if (!doc) return res.status(404).json({ message: 'Salary slip not found.' });
    res.json(doc);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// DELETE /api/salary/:id  — permanent delete (super_admin only)
router.delete('/:id', restrictTo('super_admin', 'admin', 'hr'), async (req, res) => {
  try {
    const Model = Salary();
    if (req.query.permanent === 'true') {
      await Model.findByIdAndDelete(req.params.id);
      return res.json({ message: 'Salary slip permanently deleted.' });
    } else {
      await Model.findByIdAndUpdate(req.params.id, { isArchived: true, archivedAt: new Date() });
      res.json({ message: 'Salary slip safely archived (Zero Data Loss Policy enforced).' });
    }
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
