const express = require('express');
const router = express.Router();
const { authenticate, restrictTo } = require('../../middleware/auth');
const getModel = require('../generic/generic.model');

const Att = () => getModel('attendance_records');

router.use(authenticate);

router.get('/', async (req, res) => {
  try {
    const Model = Att();
    const filter = {};
    if (req.query.month) filter.month = req.query.month;
    if (req.query.employeeId) filter.employeeId = req.query.employeeId;
    const isAdminRole = ['super_admin', 'admin', 'hr', 'operations_head'].includes(req.user.primaryRole);

    // scope=personal: force userId filter regardless of role.
    // Used by HR/Operations users accessing their own "My Attendance" workspace tab.
    const isPersonalScope = req.query.scope === 'personal';

    if (isPersonalScope) {
      // Always scope to the logged-in user's own records
      filter.userId = req.user._id.toString();
    } else if (req.query.userId && isAdminRole) {
      // Admin filtering by a specific employee's userId
      filter.userId = req.query.userId;
    } else if (!isAdminRole) {
      // Non-privileged users only see their own records
      filter.userId = req.user._id.toString();
    }
    // Privileged roles without scope=personal or userId param get all records (HR panel)

    const records = await Model.find(filter).sort({ date: -1 });
    res.json(records);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.post('/', authenticate, async (req, res) => {
  try {
    const Model = Att();

    // Resolve employeeId: body > user.linkedEmployeeId > fallback
    // Priority: what HR/admin sends > what's linked on the user account > nothing (will use userId)
    const providedEmpId = req.body.employeeId || req.user.linkedEmployeeId || null;

    let targetUserId = req.user._id.toString(); // default to self (for userId field)

    if (providedEmpId && providedEmpId !== req.user._id.toString()) {
      // Resolve the correct userId for the target employee record
      const Employee = require('../employees/employee.model');
      const empData = await Employee.findById(providedEmpId);
      if (empData && empData.userId) {
        targetUserId = empData.userId.toString();
      }
    }

    const doc = new Model({
      ...req.body,
      userId:       targetUserId,
      // ✅ Use the resolved employee record _id (not the login user _id)
      employeeId:   providedEmpId || '',
      employeeName: req.body.employeeName || req.user.name,
      createdBy:    req.user._id,
    });

    // ✅ Prevent duplicate attendance entries for the same userId + date (server-side guard)
    // This blocks duplicates even if frontend loading state is bypassed or API is called directly.
    const dateStr = req.body.date;
    if (dateStr && targetUserId) {
      const existing = await Model.findOne({ userId: targetUserId, date: dateStr });
      if (existing) {
        return res.status(409).json({
          message: 'Attendance already recorded for this date.',
          existingId: existing._id,
        });
      }
    }

    await doc.save();
    res.status(201).json(doc);
  } catch (err) { res.status(400).json({ message: err.message }); }
});

router.patch('/:id', authenticate, async (req, res) => {
  try {
    const Model = Att();
    const doc = await Model.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!doc) return res.status(404).json({ message: 'Record not found.' });
    res.json(doc);
  } catch (err) { res.status(400).json({ message: err.message }); }
});

/**
 * POST /api/attendance/auto-mark-absents
 * HR triggers this to mark absent for all active employees who have no record on a given date.
 * Body: { date: 'YYYY-MM-DD', employeeIds: [...] }  (employeeIds = all active employees from HR)
 */
router.post('/auto-mark-absents', authenticate, async (req, res) => {
  const allowed = ['super_admin', 'admin', 'hr'];
  if (!allowed.includes(req.user.primaryRole)) {
    return res.status(403).json({ message: 'Only HR/Admin can trigger absent marking.' });
  }
  try {
    const Model = Att();
    const { date, employees } = req.body; // employees: [{ _id, fullName, employeeCode }]
    if (!date || !Array.isArray(employees) || employees.length === 0) {
      return res.status(400).json({ message: 'date and employees array required.' });
    }
    // Find which employees already have a record on this date
    const existing = await Model.find({ date: { $regex: `^${date}` } });
    const existingIds = new Set(existing.map(r => r.employeeId?.toString()));

    const Employee = require('../employees/employee.model');
    const created = [];
    for (const emp of employees) {
      if (!existingIds.has(emp._id?.toString())) {
        let targetUserId = null;
        // Try to get userId to ensure it shows in employee's My Attendance
        const empData = await Employee.findById(emp._id);
        if (empData && empData.userId) targetUserId = empData.userId.toString();

        const doc = new Model({
          userId: targetUserId,
          employeeId: emp._id,
          employeeName: emp.fullName || emp.name,
          employeeCode: emp.employeeCode || '',
          date,
          status: 'absent',
          source: 'auto_absent',
          checkInAt: '',
          checkOutAt: '',
          remarks: 'Auto-marked absent — no attendance logged',
          createdBy: req.user._id,
        });
        await doc.save();
        created.push(doc);
      }
    }
    res.json({ message: `${created.length} absent record(s) created for ${date}.`, created });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Soft-archive a record (marks isArchived:true so it appears in Archive Vault)
router.patch('/:id/archive', authenticate, restrictTo('super_admin', 'admin', 'hr'), async (req, res) => {
  try {
    const Model = Att();
    const doc = await Model.findByIdAndUpdate(req.params.id, { isArchived: true, archivedAt: new Date().toISOString() }, { new: true });
    if (!doc) return res.status(404).json({ message: 'Record not found.' });
    res.json(doc);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.delete('/:id', authenticate, restrictTo('super_admin', 'admin', 'hr'), async (req, res) => {
  try {
    const Model = Att();
    if (req.query.permanent === 'true') {
      await Model.findByIdAndDelete(req.params.id);
      return res.json({ message: 'Attendance record permanently deleted.' });
    } else {
      await Model.findByIdAndUpdate(req.params.id, { isArchived: true, archivedAt: new Date() });
      res.json({ message: 'Attendance record safely archived (Zero Data Loss Policy enforced).' });
    }
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
