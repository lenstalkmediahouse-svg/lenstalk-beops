const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { authenticate, restrictTo } = require('../../middleware/auth');
const getModel = require('../generic/generic.model');
const Employee = require('../employees/employee.model');

/**
 * Performance Module
 * ──────────────────────────────────────────────────────────────────────────────
 * Handles monthly KPI scoring for employees.
 *
 * KPI Weights:
 *   Attendance        10%  ← auto-computed from attendance_records
 *   DPR Compliance    10%  ← auto-computed from dpr_entries
 *   Productivity      30%  ← auto-computed from content_tasks
 *   Deadline          20%  ← auto-computed from content_tasks (overdue vs on-time)
 *   SOP Follow        15%  ← HR fills manually
 *   Team Behaviour    15%  ← HR fills manually
 *
 * Grade:
 *   80+   → Excellent
 *   70-80 → Good
 *   60-70 → Needs Improvement
 *   <60   → Performance Review
 */

const KPI_WEIGHTS = {
  attendance:      0.10,
  dprCompliance:   0.10,
  productivity:    0.30,
  deadline:        0.20,
  sopFollow:       0.15,
  teamBehaviour:   0.15,
};

function computeGrade(score) {
  if (score >= 80) return 'Excellent';
  if (score >= 70) return 'Good';
  if (score >= 60) return 'Needs Improvement';
  return 'Performance Review';
}

function computeTotalKPI(scores) {
  const total =
    (scores.attendanceScore      || 0) * KPI_WEIGHTS.attendance +
    (scores.dprComplianceScore   || 0) * KPI_WEIGHTS.dprCompliance +
    (scores.productivityScore    || 0) * KPI_WEIGHTS.productivity +
    (scores.deadlineScore        || 0) * KPI_WEIGHTS.deadline +
    (scores.sopScore             || 0) * KPI_WEIGHTS.sopFollow +
    (scores.teamBehaviourScore   || 0) * KPI_WEIGHTS.teamBehaviour;
  return Math.round(total * 10) / 10;
}

router.use(authenticate);

// GET /api/performance/archived — returns all archived KPI records (Admin/Super Admin/HR only)
router.get('/archived', restrictTo('super_admin', 'admin', 'hr'), async (req, res) => {
  try {
    const Model = getModel('employee_performance');
    const records = await Model.find({ isArchived: true }).sort({ archivedAt: -1, month: -1 });
    res.json(records);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


router.get('/', async (req, res) => {
  try {
    const allowedRoles = ['super_admin', 'admin', 'hr'];
    if (!allowedRoles.includes(req.user.primaryRole)) {
      return res.status(403).json({ message: 'HR or Admin access required.' });
    }
    const Model = getModel('employee_performance');
    const filter = { isArchived: { $ne: true } };
    if (req.query.month) filter.month = req.query.month;
    if (req.query.employeeId) {
      const empObjectId = mongoose.isValidObjectId(req.query.employeeId) ? new mongoose.Types.ObjectId(req.query.employeeId) : null;
      filter.employeeId = empObjectId ? { $in: [req.query.employeeId, empObjectId] } : req.query.employeeId;
    }

    const records = await Model.find(filter).sort({ month: -1, employeeName: 1 });
    res.json(records);
  } catch (err) {
    console.error('Performance GET error:', err);
    res.status(500).json({ message: err.message });
  }
});

/**
 * GET /api/performance/employee/:employeeId/trend
 * Returns the last 3 performance records for an employee for trend charts.
 */
router.get('/employee/:employeeId/trend', async (req, res) => {
  try {
    const allowedRoles = ['super_admin', 'admin', 'hr'];
    if (!allowedRoles.includes(req.user.primaryRole)) {
      return res.status(403).json({ message: 'HR or Admin access required.' });
    }
    const { employeeId } = req.params;
    const Model = getModel('employee_performance');
    const empObjectId = mongoose.isValidObjectId(employeeId) ? new mongoose.Types.ObjectId(employeeId) : null;
    const empIdFilter = empObjectId ? { $in: [employeeId, empObjectId] } : employeeId;

    const records = await Model.find({
      employeeId: empIdFilter,
      isArchived: { $ne: true }
    }).sort({ month: -1 }).limit(3);
    
    res.json(records);
  } catch (err) {
    console.error('Performance trend error:', err);
    res.status(500).json({ message: err.message });
  }
});

/**
 * GET /api/performance/compute/:employeeId/:month
 * Auto-calculate scores from existing collections.
 * Returns computed scores WITHOUT saving them.
 */
router.get('/compute/:employeeId/:month', async (req, res) => {
  try {
    const allowedRoles = ['super_admin', 'admin', 'hr'];
    if (!allowedRoles.includes(req.user.primaryRole)) {
      return res.status(403).json({ message: 'HR or Admin access required.' });
    }

    const { employeeId, month } = req.params; // month = "YYYY-MM"
    const [year, monthNum] = month.split('-').map(Number);

    if (!year || !monthNum) {
      return res.status(400).json({ message: 'Invalid month format. Use YYYY-MM.' });
    }

    const emp = await Employee.findById(employeeId)
      .populate('userId', 'loginId status');
    if (!emp) return res.status(404).json({ message: 'Employee not found.' });

    // Build robust query filter for employeeId
    const empObjectId = mongoose.isValidObjectId(employeeId) ? new mongoose.Types.ObjectId(employeeId) : null;
    const empIdConditions = empObjectId 
      ? [{ employeeId }, { employeeId: empObjectId }]
      : [{ employeeId }];

    // ── Month date range ─────────────────────────────────────────────────────
    const startDate = `${year}-${String(monthNum).padStart(2, '0')}-01`;
    const endDate   = `${year}-${String(monthNum).padStart(2, '0')}-31`;
    const monthStr  = `${year}-${String(monthNum).padStart(2, '0')}`;

    // ── 1. Attendance Score (10%) ────────────────────────────────────────────
    const AttModel = getModel('attendance_records');
    const attRecords = await AttModel.find({
      $or: empIdConditions,
      date: { $gte: startDate, $lte: endDate },
      isArchived: { $ne: true },
    });

    const presentDays  = attRecords.filter(a => a.status === 'present').length;
    const halfDays     = attRecords.filter(a => a.status === 'half_day').length;
    const workingDays  = attRecords.filter(a => a.status !== 'holiday' && a.status !== 'comp_off').length;
    const attendanceScore = workingDays > 0
      ? Math.min(100, Math.round(((presentDays + halfDays * 0.5) / workingDays) * 100))
      : 0;

    // ── 2. DPR Compliance Score (10%) ────────────────────────────────────────
    const DPRModel = getModel('dpr_entries');
    const dprRecords = await DPRModel.find({
      $or: empIdConditions,
      date: { $regex: `^${monthStr}` },
      isArchived: { $ne: true },
    });
    const dprSubmitted = dprRecords.length;
    const baseWorkingDays = workingDays > 0 ? workingDays : 22;
    const dprComplianceScore = Math.min(100, Math.round((dprSubmitted / baseWorkingDays) * 100));

    // ── 3. Productivity Score (30%) ──────────────────────────────────────────
    const ContentModel = getModel('content_tasks');
    const assignedTasks = await ContentModel.find({
      isArchived: { $ne: true },
      $and: [
        {
          $or: [
            { assignedTo: emp.fullName },
            { assignedEmployee: employeeId },
            ...(empObjectId ? [{ assignedEmployee: empObjectId }] : [])
          ]
        },
        {
          $or: [
            { deadline: { $regex: `^${monthStr}` } },
            { createdAt: { $gte: new Date(startDate), $lte: new Date(`${year}-${String(monthNum).padStart(2,'0')}-31T23:59:59`) } }
          ]
        }
      ]
    });

    const completedTasks = assignedTasks.filter(t =>
      ['approved_by_admin', 'posted', 'approved'].includes(t.workflowStatus)
    ).length;
    const productivityScore = assignedTasks.length > 0
      ? Math.min(100, Math.round((completedTasks / assignedTasks.length) * 100))
      : 50;

    // ── 4. Deadline Score (20%) ──────────────────────────────────────────────
    const completedWithDeadline = assignedTasks.filter(t =>
      ['approved_by_admin', 'posted', 'approved'].includes(t.workflowStatus) && t.deadline
    );
    const onTimeTasks = completedWithDeadline.filter(t => {
      const deadline = new Date(t.deadline);
      const updatedAt = new Date(t.updatedAt || t.createdAt);
      return updatedAt <= deadline;
    }).length;

    const overdueActive = assignedTasks.filter(t => {
      if (['approved_by_admin', 'posted', 'approved', 'cancelled'].includes(t.workflowStatus)) return false;
      if (!t.deadline) return false;
      return new Date(t.deadline) < new Date();
    }).length;

    const deadlineScore = completedWithDeadline.length > 0
      ? Math.min(100, Math.round((onTimeTasks / completedWithDeadline.length) * 100) - overdueActive * 5)
      : overdueActive > 0 ? Math.max(0, 70 - overdueActive * 10) : 80;

    return res.json({
      employeeId,
      employeeName: emp.fullName,
      employeeCode: emp.employeeCode,
      department: emp.department,
      roleTitle: emp.roleTitle,
      month,
      attendanceScore:    Math.max(0, attendanceScore),
      dprComplianceScore: Math.max(0, dprComplianceScore),
      productivityScore:  Math.max(0, productivityScore),
      deadlineScore:      Math.max(0, deadlineScore),
      _debug: {
        presentDays, halfDays, workingDays,
        dprSubmitted, baseWorkingDays,
        totalTasks: assignedTasks.length, completedTasks,
        completedWithDeadline: completedWithDeadline.length, onTimeTasks, overdueActive,
      },
    });
  } catch (err) {
    console.error('Performance compute error:', err);
    res.status(500).json({ message: err.message });
  }
});

/**
 * GET /api/performance/dashboard-summary
 * Aggregated KPI data for all employees for a given month.
 * Used by Admin/Super Admin dashboard.
 * Query: ?month=YYYY-MM (defaults to current month)
 */
router.get('/dashboard-summary', async (req, res) => {
  try {
    const allowedRoles = ['super_admin', 'admin'];
    if (!allowedRoles.includes(req.user.primaryRole)) {
      return res.status(403).json({ message: 'Admin access required.' });
    }

    const month = req.query.month ||
      `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

    const Model = getModel('employee_performance');
    const records = await Model.find({
      month,
      isArchived: { $ne: true },
    }).sort({ totalKpiScore: -1 });

    const summary = {
      month,
      totalEmployees: records.length,
      excellent:           records.filter(r => r.kpiGrade === 'Excellent').length,
      good:                records.filter(r => r.kpiGrade === 'Good').length,
      needsImprovement:    records.filter(r => r.kpiGrade === 'Needs Improvement').length,
      performanceReview:   records.filter(r => r.kpiGrade === 'Performance Review').length,
      avgKpiScore: records.length > 0
        ? Math.round(records.reduce((s, r) => s + (r.totalKpiScore || 0), 0) / records.length * 10) / 10
        : 0,
      employees: records,
    };

    res.json(summary);
  } catch (err) {
    console.error('Performance dashboard summary error:', err);
    res.status(500).json({ message: err.message });
  }
});

/**
 * POST /api/performance
 * HR creates or upserts a monthly performance record for an employee.
 */
router.post('/', restrictTo('super_admin', 'admin', 'hr'), async (req, res) => {
  try {
    const {
      employeeId, month,
      sopScore, teamBehaviourScore, hrNotes,
      attendanceScore, dprComplianceScore, productivityScore, deadlineScore,
      redItems, amberItems, greenItems,
    } = req.body;

    if (!employeeId || !month) {
      return res.status(400).json({ message: 'employeeId and month are required.' });
    }

    const emp = await Employee.findById(employeeId);
    if (!emp) return res.status(404).json({ message: 'Employee not found.' });

    const scores = {
      attendanceScore:    Number(attendanceScore)    || 0,
      dprComplianceScore: Number(dprComplianceScore) || 0,
      productivityScore:  Number(productivityScore)  || 0,
      deadlineScore:      Number(deadlineScore)      || 0,
      sopScore:           Number(sopScore)            || 0,
      teamBehaviourScore: Number(teamBehaviourScore)  || 0,
    };

    const totalKpiScore = computeTotalKPI(scores);
    const kpiGrade      = computeGrade(totalKpiScore);

    const Model = getModel('employee_performance');

    // Upsert by employeeId + month
    const record = await Model.findOneAndUpdate(
      { employeeId: employeeId.toString(), month },
      {
        employeeId:    employeeId.toString(),
        employeeName:  emp.fullName,
        employeeCode:  emp.employeeCode,
        department:    emp.department,
        roleTitle:     emp.roleTitle,
        month,
        ...scores,
        totalKpiScore,
        kpiGrade,
        hrNotes:        hrNotes || '',
        hrReviewedAt:   new Date(),
        hrReviewedBy:   req.user?.name || req.user?.loginId || 'HR',
        redItems:       Array.isArray(redItems)   ? redItems   : [],
        amberItems:     Array.isArray(amberItems) ? amberItems : [],
        greenItems:     Array.isArray(greenItems) ? greenItems : [],
        isArchived:     false,
      },
      { new: true, upsert: true }
    );

    res.status(201).json(record);
  } catch (err) {
    console.error('Performance POST error:', err);
    res.status(500).json({ message: err.message });
  }
});

/**
 * PATCH /api/performance/:id
 * HR updates an existing performance record (e.g., adjusts manual scores).
 */
router.patch('/:id', restrictTo('super_admin', 'admin', 'hr'), async (req, res) => {
  try {
    const Model = getModel('employee_performance');
    const existing = await Model.findById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Performance record not found.' });

    // Merge updates
    const updated = { ...existing.toObject(), ...req.body };

    // Recompute total if any score changed
    const newTotal = computeTotalKPI({
      attendanceScore:    updated.attendanceScore,
      dprComplianceScore: updated.dprComplianceScore,
      productivityScore:  updated.productivityScore,
      deadlineScore:      updated.deadlineScore,
      sopScore:           updated.sopScore,
      teamBehaviourScore: updated.teamBehaviourScore,
    });
    updated.totalKpiScore = newTotal;
    updated.kpiGrade      = computeGrade(newTotal);
    updated.hrReviewedAt  = new Date();
    updated.hrReviewedBy  = req.user?.name || req.user?.loginId || 'HR';

    const record = await Model.findByIdAndUpdate(req.params.id, updated, { new: true });
    res.json(record);
  } catch (err) {
    console.error('Performance PATCH error:', err);
    res.status(500).json({ message: err.message });
  }
});

/**
 * DELETE /api/performance/:id
 * Soft-archive (HR/Admin) or permanent delete (Super Admin only).
 * Supports ?permanent=true for archive vault purge.
 */
router.delete('/:id', restrictTo('super_admin', 'admin', 'hr'), async (req, res) => {
  try {
    const Model = getModel('employee_performance');
    if (req.query.permanent === 'true') {
      if (req.user.primaryRole !== 'super_admin') {
        return res.status(403).json({ message: 'Permanent delete: Super Admin only.' });
      }
      await Model.findByIdAndDelete(req.params.id);
      return res.json({ message: 'Performance record permanently deleted.' });
    }
    // Soft archive
    const updated = await Model.findByIdAndUpdate(
      req.params.id,
      { isArchived: true, archivedAt: new Date() },
      { new: true }
    );
    if (!updated) return res.status(404).json({ message: 'Performance record not found.' });
    res.json({ message: 'Performance record archived.' });
  } catch (err) {
    console.error('Performance DELETE error:', err);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
