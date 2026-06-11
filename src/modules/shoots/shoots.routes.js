const express = require('express');
const router = express.Router();
const { authenticate, restrictTo } = require('../../middleware/auth');
const getModel = require('../generic/generic.model');

// H-1 FIX: Use lenstalk_shoots_v1 to match frontend ShootsPage collection
const Shoots = () => getModel('lenstalk_shoots_v1');

router.use(authenticate);

router.get('/', async (req, res) => {
  try {
    const Model = Shoots();
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.clientId) filter.clientId = req.query.clientId;
    // Cinematographers/employees only see shoots assigned to them
    if (['cinematographer', 'employee'].includes(req.user.primaryRole)) {
      filter['assignedTo'] = req.user._id.toString();
    }
    const shoots = await Model.find(filter).sort({ shootDate: -1 });
    res.json(shoots);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const Model = Shoots();
    const doc = await Model.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Shoot not found.' });
    res.json(doc);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.post('/', restrictTo('super_admin', 'admin', 'operations_head', 'hr'), async (req, res) => {
  try {
    const Model = Shoots();
    const doc = new Model({ ...req.body, createdBy: req.user._id });
    await doc.save();
    res.status(201).json(doc);
  } catch (err) { res.status(400).json({ message: err.message }); }
});

router.patch('/:id', authenticate, async (req, res) => {
  try {
    const Model = Shoots();
    const doc = await Model.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!doc) return res.status(404).json({ message: 'Shoot not found.' });
    res.json(doc);
  } catch (err) { res.status(400).json({ message: err.message }); }
});

router.delete('/:id', restrictTo('super_admin', 'admin', 'operations_head'), async (req, res) => {
  try {
    const Model = Shoots();
    if (req.query.permanent === 'true') {
      await Model.findByIdAndDelete(req.params.id);
      return res.json({ message: 'Shoot permanently deleted.' });
    } else {
      await Model.findByIdAndUpdate(req.params.id, { isArchived: true, archivedAt: new Date() });
      res.json({ message: 'Shoot safely archived (Zero Data Loss Policy enforced).' });
    }
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
