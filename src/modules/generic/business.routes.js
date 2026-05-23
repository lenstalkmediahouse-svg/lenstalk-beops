/**
 * Content Tasks, Task Approvals, Shoot Campaigns — Dedicated API Routes
 * C-1 FIX: Replaces replaceCollection (delete-all + reinsert) with atomic
 * per-document CRUD operations so concurrent multi-user edits don't cause data loss.
 */
const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/auth');
const getModel = require('../generic/generic.model');

// ── Helper to get models ──
const getContentTasksModel  = () => getModel('content_tasks');
const getTaskApprovalsModel = () => getModel('task_approvals');
const getShootCampaignsModel= () => getModel('shoot_campaigns');

// ────────────────────────────────────────────────
// CONTENT TASKS  /api/content-tasks
// ────────────────────────────────────────────────
router.get('/content-tasks', authenticate, async (req, res) => {
  try {
    const Model = getContentTasksModel();
    const filter = {};
    if (req.query.client) filter.client = req.query.client;
    if (req.query.assignedTo) filter.assignedTo = req.query.assignedTo;
    const docs = await Model.find(filter).sort({ createdAt: -1 });
    res.json(docs);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.post('/content-tasks', authenticate, async (req, res) => {
  try {
    const Model = getContentTasksModel();
    const doc = new Model({ ...req.body, createdAt: new Date() });
    await doc.save();
    res.status(201).json(doc);
  } catch (err) { res.status(400).json({ message: err.message }); }
});

router.patch('/content-tasks/:id', authenticate, async (req, res) => {
  try {
    const Model = getContentTasksModel();
    const doc = await Model.findByIdAndUpdate(req.params.id, { ...req.body, updatedAt: new Date() }, { new: true });
    if (!doc) return res.status(404).json({ message: 'Content task not found.' });
    res.json(doc);
  } catch (err) { res.status(400).json({ message: err.message }); }
});

router.delete('/content-tasks/:id', authenticate, async (req, res) => {
  try {
    const Model = getContentTasksModel();
    await Model.findByIdAndDelete(req.params.id);
    res.json({ message: 'Content task deleted.' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ────────────────────────────────────────────────
// TASK APPROVALS  /api/task-approvals
// ────────────────────────────────────────────────
router.get('/task-approvals', authenticate, async (req, res) => {
  try {
    const Model = getTaskApprovalsModel();
    const docs = await Model.find({}).sort({ submittedAt: -1 });
    res.json(docs);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.post('/task-approvals', authenticate, async (req, res) => {
  try {
    const Model = getTaskApprovalsModel();
    // Upsert: if same employee + title already pending, update it
    const existing = await Model.findOne({ employee: req.body.employee, title: req.body.title });
    if (existing) {
      const updated = await Model.findByIdAndUpdate(existing._id, {
        ...req.body, status: 'pending_approval', submittedAt: new Date(), rejectNote: '', approveNote: ''
      }, { new: true });
      return res.json(updated);
    }
    const doc = new Model({ ...req.body, submittedAt: new Date(), status: 'pending_approval' });
    await doc.save();
    res.status(201).json(doc);
  } catch (err) { res.status(400).json({ message: err.message }); }
});

router.patch('/task-approvals/:id', authenticate, async (req, res) => {
  try {
    const Model = getTaskApprovalsModel();
    const doc = await Model.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!doc) return res.status(404).json({ message: 'Task approval not found.' });
    res.json(doc);
  } catch (err) { res.status(400).json({ message: err.message }); }
});

router.delete('/task-approvals/:id', authenticate, async (req, res) => {
  try {
    const Model = getTaskApprovalsModel();
    await Model.findByIdAndDelete(req.params.id);
    res.json({ message: 'Task approval deleted.' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ────────────────────────────────────────────────
// SHOOT CAMPAIGNS  /api/shoot-campaigns
// ────────────────────────────────────────────────
router.get('/shoot-campaigns', authenticate, async (req, res) => {
  try {
    const Model = getShootCampaignsModel();
    const filter = {};
    if (req.query.shootCode) filter.shootCode = req.query.shootCode;
    const docs = await Model.find(filter).sort({ createdAt: -1 });
    res.json(docs);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.post('/shoot-campaigns', authenticate, async (req, res) => {
  try {
    const Model = getShootCampaignsModel();
    const doc = new Model({ ...req.body, createdAt: new Date() });
    await doc.save();
    res.status(201).json(doc);
  } catch (err) { res.status(400).json({ message: err.message }); }
});

router.post('/shoot-campaigns/bulk', authenticate, async (req, res) => {
  // Bulk upsert campaigns for a shoot (used when saving a shoot with influencers)
  try {
    const Model = getShootCampaignsModel();
    const { shootCode, campaigns } = req.body;
    if (!shootCode) return res.status(400).json({ message: 'shootCode is required.' });
    // Remove old campaigns for this shoot then insert new ones
    await Model.deleteMany({ shootCode });
    if (campaigns && campaigns.length > 0) {
      const inserted = await Model.insertMany(campaigns.map(c => ({ ...c, shootCode })));
      return res.json(inserted);
    }
    res.json([]);
  } catch (err) { res.status(400).json({ message: err.message }); }
});

router.patch('/shoot-campaigns/:id', authenticate, async (req, res) => {
  try {
    const Model = getShootCampaignsModel();
    const doc = await Model.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!doc) return res.status(404).json({ message: 'Shoot campaign not found.' });
    res.json(doc);
  } catch (err) { res.status(400).json({ message: err.message }); }
});

router.delete('/shoot-campaigns/:id', authenticate, async (req, res) => {
  try {
    const Model = getShootCampaignsModel();
    await Model.findByIdAndDelete(req.params.id);
    res.json({ message: 'Shoot campaign deleted.' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
