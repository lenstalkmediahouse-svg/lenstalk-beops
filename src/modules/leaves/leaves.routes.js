const express = require('express');
const router = express.Router();
const { authenticate, restrictTo } = require('../../middleware/auth');
const getModel = require('../generic/generic.model');
const auditLog = require('../../middleware/auditLogger');

const Leaves = () => getModel('leave_requests');
const Employee = require('../employees/employee.model');
const User = require('../users/user.model');

router.use(authenticate);

router.get('/', async (req, res) => {
  try {
    const Model = Leaves();
    const filter = { isArchived: { $ne: true } };
    if (req.query.status) filter.status = req.query.status;
    if (req.query.employeeId) filter.employeeId = req.query.employeeId;

    // scope=personal: force userId filter regardless of role.
    // Used by HR/Operations users accessing their own "My Leave" workspace tab.
    const isPersonalScope = req.query.scope === 'personal';
    const isPrivilegedRole = ['super_admin', 'admin', 'hr', 'operations_head'].includes(req.user.primaryRole);

    if (isPersonalScope) {
      // Always scope to the logged-in user's own records
      filter.userId = req.user._id.toString();
    } else if (req.query.userId && ['super_admin', 'admin', 'hr'].includes(req.user.primaryRole)) {
      // Allow admin/HR to view a specific employee's leaves via userId param
      filter.userId = req.query.userId;
    } else if (!isPrivilegedRole) {
      // Employees only see their own leaves
      filter.userId = req.user._id.toString();
    }
    // Privileged roles without scope=personal get all records (HR panel view)

    const leaves = await Model.find(filter).sort({ createdAt: -1 });
    res.json(leaves);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.post('/', async (req, res) => {
  try {
    const Model = Leaves();
    const isHR = ['super_admin', 'admin', 'hr'].includes(req.user.primaryRole);

    let targetUserId = req.user._id.toString();
    let targetStatus = 'pending';
    let hrNote = '';

    // If HR is creating leave on behalf of an employee (employeeId provided)
    if (isHR && req.body.employeeId) {
      // Lookup the linked User for this employee
      const emp = await Employee.findById(req.body.employeeId);
      if (emp && emp.userId) {
        targetUserId = emp.userId.toString();
      } else {
        // Fallback: find User by linkedEmployeeId
        const linkedUser = await User.findOne({ linkedEmployeeId: req.body.employeeId });
        if (linkedUser) targetUserId = linkedUser._id.toString();
      }
      // HR-applied leave = auto approved
      targetStatus = 'approved';
      hrNote = `Applied by HR (${req.user.name}) on behalf of employee.`;
    }

    const doc = new Model({
      ...req.body,
      userId: targetUserId,
      appliedBy: req.user.name,
      status: targetStatus,
      ...(hrNote ? { hrNote, approvedBy: req.user.name, approvedAt: new Date() } : {}),
    });
    await doc.save();
    res.status(201).json(doc);
  } catch (err) { res.status(400).json({ message: err.message }); }
});

router.patch('/:id', async (req, res) => {
  try {
    const Model = Leaves();
    const doc = await Model.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!doc) return res.status(404).json({ message: 'Leave not found.' });
    res.json(doc);
  } catch (err) { res.status(400).json({ message: err.message }); }
});

router.patch('/:id/approve', restrictTo('super_admin', 'admin', 'hr'), auditLog('LEAVE_APPROVE', (req) => `${req.user?.name} approved leave request ${req.params.id}`, 'HR'), async (req, res) => {
  try {
    const Model = Leaves();
    const doc = await Model.findByIdAndUpdate(
      req.params.id,
      { status: 'approved', approvedBy: req.user.name, approvedAt: new Date() },
      { new: true }
    );
    if (!doc) return res.status(404).json({ message: 'Leave not found.' });
    res.json(doc);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.patch('/:id/reject', restrictTo('super_admin', 'admin', 'hr'), auditLog('LEAVE_REJECT', (req) => `${req.user?.name} rejected leave request ${req.params.id}`, 'HR'), async (req, res) => {
  try {
    const Model = Leaves();
    const doc = await Model.findByIdAndUpdate(
      req.params.id,
      { status: 'rejected', rejectionReason: req.body.reason, rejectedBy: req.user.name, rejectedAt: new Date() },
      { new: true }
    );
    if (!doc) return res.status(404).json({ message: 'Leave not found.' });
    res.json(doc);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
