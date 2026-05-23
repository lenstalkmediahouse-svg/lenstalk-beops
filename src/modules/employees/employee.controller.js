const Employee = require('./employee.model');
const User = require('../users/user.model');
const bcrypt = require('bcryptjs');

/**
 * GET /api/employees
 * List all employees (excluding archived unless ?archived=true)
 */
exports.getAll = async (req, res) => {
  try {
    const filter = {};
    if (req.query.archived !== 'true') filter.isArchived = { $ne: true };
    if (req.query.status) filter.status = req.query.status;
    if (req.query.department) filter.department = req.query.department;

    const employees = await Employee.find(filter)
      .populate('userId', 'loginId primaryRole accessRoles status lastLoginAt')
      .sort({ createdAt: -1 });

    res.json(employees);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * GET /api/employees/:id
 */
exports.getById = async (req, res) => {
  try {
    const emp = await Employee.findById(req.params.id)
      .populate('userId', 'loginId primaryRole accessRoles status lastLoginAt');
    if (!emp) return res.status(404).json({ message: 'Employee not found.' });
    res.json(emp);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * POST /api/employees
 * Create a new employee. Automatically creates a linked User record with
 * a temporary password so the employee appears in Access Control immediately.
 */
exports.create = async (req, res) => {
  try {
    const {
      fullName, email, mobile, roleTitle, department,
      joiningDate, employmentType, grossMonthly,
      leaveCL, leaveSL, leaveEL, leaveCompOff,
      skills, notes,
    } = req.body;

    if (!fullName || !email) {
      return res.status(400).json({ message: 'Full name and email are required.' });
    }

    // Check for duplicate email
    const existingEmp = await Employee.findOne({ email: email.trim().toLowerCase() });
    if (existingEmp) {
      return res.status(400).json({ message: 'An employee with this email already exists.' });
    }

    // Create Employee record
    const employee = new Employee({
      fullName: fullName.trim(),
      email: email.trim().toLowerCase(),
      mobile: mobile || '',
      roleTitle: roleTitle || '',
      department: department || 'General',
      joiningDate: joiningDate || new Date(),
      employmentType: employmentType || 'full_time',
      salaryStructure: {
        grossMonthly: Number(grossMonthly) || 0,
      },
      leaveBalance: {
        casual: Number(leaveCL) || 12,
        sick: Number(leaveSL) || 6,
        earned: Number(leaveEL) || 0,
        compOff: Number(leaveCompOff) || 0,
      },
      skills: skills || [],
      notes: notes || '',
      status: 'active',
    });

    await employee.save();

    // Auto-create linked User account — Login ID = Employee Code
    const loginId = employee.employeeCode; // e.g. LM-EMP-0001
    const tempPassword = `Lenstalk@${employee.employeeCode.replace('LM-EMP-', '').replace(/^0+/, '') || '1'}`;

    // Check if user already exists (unlikely but safe)
    const existingUser = await User.findOne({ $or: [{ loginId }, { email: employee.email }] });
    let user;
    if (!existingUser) {
      user = new User({
        name: fullName.trim(),
        email: employee.email,
        mobile: mobile || '',
        loginId,
        passwordHash: tempPassword, // pre-save hook hashes this
        primaryRole: 'employee',
        accessRoles: ['employee'],
        linkedEmployeeId: employee._id,
        status: 'active',
        isActive: true,
        createdBy: req.user._id,
      });
      await user.save();

      // Link back
      employee.userId = user._id;
      await employee.save();
    }

    const result = await Employee.findById(employee._id)
      .populate('userId', 'loginId primaryRole accessRoles status');

    res.status(201).json({
      employee: result,
      user: user ? { loginId: user.loginId, tempPassword } : null,
      message: `Employee created. Login ID: ${loginId} | Temp password: ${tempPassword} — Admin should update from Access Control.`,
    });
  } catch (err) {
    console.error('Create employee error:', err);
    res.status(500).json({ message: err.message });
  }
};

/**
 * PATCH /api/employees/:id
 * Update employee record
 */
exports.update = async (req, res) => {
  try {
    const {
      fullName, email, mobile, roleTitle, department,
      joiningDate, employmentType, grossMonthly,
      leaveCL, leaveSL, leaveEL, leaveCompOff,
      status, skills, notes,
    } = req.body;

    const emp = await Employee.findById(req.params.id);
    if (!emp) return res.status(404).json({ message: 'Employee not found.' });

    if (fullName) emp.fullName = fullName.trim();
    if (email) emp.email = email.trim().toLowerCase();
    if (mobile !== undefined) emp.mobile = mobile;
    if (roleTitle !== undefined) emp.roleTitle = roleTitle;
    if (department) emp.department = department;
    if (joiningDate) emp.joiningDate = joiningDate;
    if (employmentType) emp.employmentType = employmentType;
    if (grossMonthly !== undefined) emp.salaryStructure.grossMonthly = Number(grossMonthly);
    if (leaveCL !== undefined) emp.leaveBalance.casual = Number(leaveCL);
    if (leaveSL !== undefined) emp.leaveBalance.sick = Number(leaveSL);
    if (leaveEL !== undefined) emp.leaveBalance.earned = Number(leaveEL);
    if (leaveCompOff !== undefined) emp.leaveBalance.compOff = Number(leaveCompOff);
    if (status) emp.status = status;
    if (skills) emp.skills = skills;
    if (notes !== undefined) emp.notes = notes;

    await emp.save();

    // If name or email changed, sync to linked User too
    if (emp.userId && (fullName || email)) {
      await User.findByIdAndUpdate(emp.userId, {
        ...(fullName && { name: fullName.trim() }),
        ...(email && { email: email.trim().toLowerCase() }),
      });
    }

    const result = await Employee.findById(emp._id)
      .populate('userId', 'loginId primaryRole accessRoles status');
    res.json(result);
  } catch (err) {
    console.error('Update employee error:', err);
    res.status(500).json({ message: err.message });
  }
};

/**
 * POST /api/employees/:id/archive
 * Soft-archive an employee
 */
exports.archive = async (req, res) => {
  try {
    const emp = await Employee.findByIdAndUpdate(
      req.params.id,
      { status: 'archived', isArchived: true },
      { new: true }
    );
    if (!emp) return res.status(404).json({ message: 'Employee not found.' });

    // Deactivate linked user
    if (emp.userId) {
      await User.findByIdAndUpdate(emp.userId, { isActive: false, status: 'inactive' });
    }

    res.json({ message: `${emp.fullName} archived successfully.`, employee: emp });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * POST /api/employees/:id/restore
 * Restore a soft-archived employee
 */
exports.restore = async (req, res) => {
  try {
    const emp = await Employee.findByIdAndUpdate(
      req.params.id,
      { status: 'active', isArchived: false, $unset: { archivedAt: 1 } },
      { new: true }
    );
    if (!emp) return res.status(404).json({ message: 'Employee not found.' });

    // Re-activate linked user
    if (emp.userId) {
      await User.findByIdAndUpdate(emp.userId, { isActive: true, status: 'active' });
    } else {
      await User.updateMany({ linkedEmployeeId: emp._id }, { isActive: true, status: 'active' });
    }

    res.json({ message: `${emp.fullName} restored successfully.`, employee: emp });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * DELETE /api/employees/:id
 * Permanently delete employee and linked user
 */
exports.remove = async (req, res) => {
  try {
    const emp = await Employee.findById(req.params.id);
    if (!emp) return res.status(404).json({ message: 'Employee not found.' });

    // Delete linked user if present
    if (emp.userId) {
      await User.findByIdAndDelete(emp.userId);
    } else {
      await User.deleteMany({ linkedEmployeeId: emp._id });
    }

    await Employee.findByIdAndDelete(req.params.id);
    res.json({ message: 'Employee permanently deleted.' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
