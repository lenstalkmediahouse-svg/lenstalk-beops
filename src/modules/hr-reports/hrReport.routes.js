const express = require('express');
const router = express.Router();
const { authenticate, restrictTo } = require('../../middleware/auth');
const getModel = require('../generic/generic.model');

/**
 * HR Daily Report Module
 * ──────────────────────────────────────────────────────────────────────────────
 * HR fills one consolidated report per day covering:
 *   - Staff attendance summary
 *   - DPR compliance
 *   - Operational updates (shoots, approvals, deadlines, sales, campaigns)
 *   - RAG flags (Red / Amber / Green items)
 *
 * NOTE: Accounts financial data is intentionally excluded (no amounts, no account logs).
 * Revenue Update is a plain text status note only.
 *
 * Visible to: HR (fill), Admin, Super Admin (view + download)
 */

router.use(authenticate);

const HRReport = () => getModel('hr_daily_reports');

/**
 * GET /api/hr-reports
 * List all HR daily reports (HR/Admin/Super Admin)
 * Query: ?date=YYYY-MM-DD&month=YYYY-MM&limit=30
 */
router.get('/', async (req, res) => {
  try {
    const allowed = ['super_admin', 'admin', 'hr'];
    if (!allowed.includes(req.user.primaryRole)) {
      return res.status(403).json({ message: 'HR or Admin access required.' });
    }

    const Model = HRReport();
    const filter = { isArchived: { $ne: true } };

    if (req.query.date)  filter.date  = req.query.date;
    if (req.query.month) filter.date  = { $regex: `^${req.query.month}` };

    const limit = Number(req.query.limit) || 60;
    const reports = await Model.find(filter).sort({ date: -1 }).limit(limit);
    res.json(reports);
  } catch (err) {
    console.error('HR Reports GET error:', err);
    res.status(500).json({ message: err.message });
  }
});

/**
 * GET /api/hr-reports/archived
 * Returns all archived HR Daily Reports (Admin/Super Admin only)
 */
router.get('/archived', restrictTo('super_admin', 'admin', 'hr'), async (req, res) => {
  try {
    const Model = HRReport();
    const reports = await Model.find({ isArchived: true }).sort({ archivedAt: -1, date: -1 });
    res.json(reports);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * GET /api/hr-reports/today
 * Quick fetch: today's report if it exists
 */
router.get('/today', async (req, res) => {
  try {
    const allowed = ['super_admin', 'admin', 'hr'];
    if (!allowed.includes(req.user.primaryRole)) {
      return res.status(403).json({ message: 'HR or Admin access required.' });
    }

    const today = new Date();
    const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    const Model = HRReport();
    const report = await Model.findOne({ date: dateStr, isArchived: { $ne: true } });
    res.json(report || null);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/', restrictTo('super_admin', 'admin', 'hr'), async (req, res) => {
  try {
    const {
      date,
      staffAttendance,
      dprCompliance,
      upcomingShoots,     // Array of: { client, date, time, location, team, status }
      deadlineItems,      // Array of: { title, client, dueDate, contentStatus, assignedTo }
      pendingApprovals,    // Array of: { title, client, type, submittedAt }
      adsCampaigns,       // Array of: { campaign, brand, status, creatorsCount, postsLive }
      salesPipeline,      // Array of: { client, stage, proposal, meetingDate, note }
      clientCampaigns,    // Array of: { client, campaignType, status, postsCount }
      teamIssues,         // Array of: { employee, issueType, severity, note }
      redFlags,
      amberFlags,
      greenUpdates,
      overallComment,
    } = req.body;

    if (!date) {
      return res.status(400).json({ message: 'date is required (YYYY-MM-DD).' });
    }

    const Model = HRReport();

    // Upsert by date — only one report per day
    const report = await Model.findOneAndUpdate(
      { date, isArchived: { $ne: true } },
      {
        date,
        reportedBy:   req.user?.name || req.user?.loginId || 'HR',
        reportedAt:   new Date(),
        staffAttendance: staffAttendance || { present: 0, absent: 0, halfDay: 0, onLeave: 0 },
        dprCompliance:   dprCompliance   || { submitted: 0, missing: 0, missingNames: [] },
        upcomingShoots:   Array.isArray(upcomingShoots)   ? upcomingShoots   : [],
        deadlineItems:    Array.isArray(deadlineItems)    ? deadlineItems    : [],
        pendingApprovals:  Array.isArray(pendingApprovals)  ? pendingApprovals  : [],
        adsCampaigns:     Array.isArray(adsCampaigns)     ? adsCampaigns     : [],
        salesPipeline:    Array.isArray(salesPipeline)    ? salesPipeline    : [],
        clientCampaigns:  Array.isArray(clientCampaigns)  ? clientCampaigns  : [],
        teamIssues:       Array.isArray(teamIssues)       ? teamIssues       : [],
        redFlags:         Array.isArray(redFlags)         ? redFlags         : [],
        amberFlags:       Array.isArray(amberFlags)       ? amberFlags       : [],
        greenUpdates:     Array.isArray(greenUpdates)     ? greenUpdates     : [],
        overallComment:   overallComment || '',
        isArchived:       false,
      },
      { new: true, upsert: true }
    );

    res.status(201).json(report);
  } catch (err) {
    console.error('HR Reports POST error:', err);
    res.status(500).json({ message: err.message });
  }
});

/**
 * PATCH /api/hr-reports/:id
 * Update an existing daily report.
 */
router.patch('/:id', restrictTo('super_admin', 'admin', 'hr'), async (req, res) => {
  try {
    const Model = HRReport();
    const report = await Model.findById(req.params.id);
    if (!report) return res.status(404).json({ message: 'Report not found.' });

    const updated = await Model.findByIdAndUpdate(
      req.params.id,
      { ...req.body, reportedBy: req.user?.name || req.user?.loginId, reportedAt: new Date() },
      { new: true }
    );
    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * DELETE /api/hr-reports/:id
 * Soft archive (HR/Admin) or permanent delete (Super Admin only).
 */
router.delete('/:id', restrictTo('super_admin', 'admin', 'hr'), async (req, res) => {
  try {
    const Model = HRReport();
    if (req.query.permanent === 'true') {
      if (req.user.primaryRole !== 'super_admin') {
        return res.status(403).json({ message: 'Permanent delete: Super Admin only.' });
      }
      await Model.findByIdAndDelete(req.params.id);
      return res.json({ message: 'Report permanently deleted.' });
    }
    await Model.findByIdAndUpdate(req.params.id, { isArchived: true, archivedAt: new Date() });
    res.json({ message: 'Report archived.' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
