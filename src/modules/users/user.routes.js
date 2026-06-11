const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const User = require('../users/user.model');
const Employee = require('../employees/employee.model');
const Client = require('../clients/client.model');
const { authenticate } = require('../../middleware/auth');

/**
 * PATCH /api/users/update-password
 * Allows super_admin/admin to update any user's password via loginId
 */
router.patch('/update-password', authenticate, async (req, res) => {
  try {
    const { loginId, newPassword } = req.body;
    
    if (!loginId || !newPassword) {
      return res.status(400).json({ message: 'loginId and newPassword are required.' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters.' });
    }

    // Only super_admin or admin can update passwords
    if (!['super_admin', 'admin'].includes(req.user.primaryRole)) {
      return res.status(403).json({ message: 'Only admins can update user passwords.' });
    }

    const user = await User.findOne({ loginId: loginId.trim() });
    if (!user) {
      return res.status(404).json({ message: `User with loginId "${loginId}" not found.` });
    }

    // Set new password — the pre-save hook will hash it
    user.passwordHash = newPassword;
    user.updatedBy = req.user._id;
    await user.save();

    res.json({ message: `Password updated for "${loginId}" successfully.` });
  } catch (error) {
    console.error('Password update error:', error);
    res.status(500).json({ message: 'Server error during password update.' });
  }
});

/**
 * Helper to auto-sync migrated employees or clients that are missing users
 */
async function syncMissingUsers(adminId) {
  try {
    // Sync missing employees
    const missingEmps = await Employee.find({ userId: { $exists: false }, isArchived: { $ne: true } });
    for (const emp of missingEmps) {
      if (!emp.fullName) continue; // skip if no name (malformed record)
      // Use employeeCode as loginId (consistent with new employee creation)
      const loginId = emp.employeeCode || (() => {
        const nameParts = emp.fullName.trim().toLowerCase().split(' ');
        const base = nameParts.length >= 2 ? `${nameParts[0]}_${nameParts[nameParts.length - 1]}` : nameParts[0];
        const suffix = (emp.employeeCode || '').replace('LM-EMP-', '').replace(/^0+/, '') || '1';
        return `${base}_${suffix}`;
      })();
      const empCodeSuffix = (emp.employeeCode || '').replace('LM-EMP-', '').replace(/^0+/, '') || '1';

      // check if exists
      const existing = await User.findOne({ $or: [{ loginId }, { email: emp.email }] });
      if (!existing) {
        const user = new User({
          name: emp.fullName, email: emp.email, mobile: emp.mobile,
          loginId, passwordHash: `Lenstalk@${empCodeSuffix}`,
          primaryRole: 'employee', accessRoles: ['employee'],
          linkedEmployeeId: emp._id, status: emp.status || 'active', isActive: true,
          createdBy: adminId,
        });
        await user.save();
        emp.userId = user._id;
        await emp.save();
      }
    }

    // Sync missing employees (reverse sync: User -> Employee for admin-created staff)
    const staffUsers = await User.find({ primaryRole: { $ne: 'client' }, isActive: true });
    const staffIds = staffUsers.filter(u => u.primaryRole !== 'super_admin').map(u => u._id);
    const existingEmps = await Employee.find({ userId: { $in: staffIds } }).select('userId');
    const existingEmpUserIds = new Set(existingEmps.map(e => e.userId?.toString()));

    for (const u of staffUsers) {
      if (u.primaryRole === 'super_admin') continue;
      if (!existingEmpUserIds.has(u._id.toString())) {
        if (!u.name) continue;
        const employee = new Employee({
          employeeCode: u.loginId,
          fullName: u.name,
          email: u.email || `${u.loginId}@lenstalkmedia.com`,
          mobile: u.mobile || '',
          roleTitle: u.primaryRole.replace(/_/g, ' '),
          department: 'Operations',
          joiningDate: new Date(),
          employmentType: 'full_time',
          status: u.status || 'active',
          userId: u._id
        });
        await employee.save();
        u.linkedEmployeeId = employee._id;
        await u.save();
      }
    }

    // Sync missing clients
    const missingClients = await Client.find({ userId: { $exists: false }, isArchived: { $ne: true } });
    for (const client of missingClients) {
      const resolvedName = client.name || client.clientName || 'Client';
      const nameParts = resolvedName.trim().toLowerCase().replace(/[^a-z0-9 ]/g, '').split(' ').filter(Boolean);
      const slugBase = nameParts.slice(0, 2).join('_') || 'client';
      const loginId = `${slugBase}_${client._id.toString().slice(-4)}`;
      const clientEmail = client.pocEmail || client.email || `${loginId}@lenstalkclient.com`;
      
      const existing = await User.findOne({ $or: [{ loginId }, { email: clientEmail }] });
      if (!existing) {
        const user = new User({
          name: client.pocName || resolvedName, email: clientEmail,
          loginId, passwordHash: `${nameParts[0].charAt(0).toUpperCase()}${nameParts[0].slice(1)}@${client._id.toString().slice(-6)}`,
          primaryRole: 'client', accessRoles: ['client'],
          linkedClientId: client._id, linkedClientName: resolvedName, status: client.status || 'active', isActive: true,
          createdBy: adminId,
        });
        await user.save();
        client.userId = user._id;
        await client.save();
      }
    }
  } catch (err) {
    console.error('Initial bulk sync error:', err);
  }
}

/**
 * GET /api/users
 * List all users (admin only)
 */
router.get('/', authenticate, async (req, res) => {
  try {
    if (!['super_admin', 'admin'].includes(req.user.primaryRole)) {
      return res.status(403).json({ message: 'Access denied.' });
    }
    
    // Attempt auto-sync of migrated records first
    await syncMissingUsers(req.user._id);

    // Fetch users and populate linkedClientId to get clientCode
    const users = await User.find({ isActive: { $ne: false } })
      .select('-passwordHash')
      .populate('linkedClientId', 'clientCode name clientName')
      .sort({ primaryRole: 1 });
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
});

/**
 * POST /api/users
 * Create a new user (admin only)
 */
router.post('/', authenticate, async (req, res) => {
  try {
    if (!['super_admin', 'admin'].includes(req.user.primaryRole)) {
      return res.status(403).json({ message: 'Access denied.' });
    }
    
    const { name, email, loginId, password, primaryRole, accessRoles, status, linkedClientName, assignedBrands } = req.body;
    
    if (!name || !email || !loginId || !password || !primaryRole) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters.' });
    }

    const existing = await User.findOne({ $or: [{ loginId: loginId.trim() }, { email: email.trim().toLowerCase() }] });
    if (existing) {
       return res.status(400).json({ message: 'User with this Email or Login ID already exists.' });
    }

    const user = new User({
       name, email, loginId,
       passwordHash: password,
       primaryRole,
       accessRoles: accessRoles || [primaryRole],
       status: status || 'active',
       linkedClientName: linkedClientName || '',
       assignedBrands: assignedBrands || [],
       createdBy: req.user._id,
    });

    await user.save();

    // Auto-create Employee record if it's a staff member (not client)
    if (primaryRole !== 'client') {
      const employee = new Employee({
        employeeCode: loginId,
        fullName: name,
        email: email,
        mobile: '',
        roleTitle: primaryRole.replace(/_/g, ' '),
        department: 'Operations',
        joiningDate: new Date(),
        employmentType: 'full_time',
        status: status || 'active',
        userId: user._id
      });
      await employee.save();
      user.linkedEmployeeId = employee._id;
      await user.save();
    }

    res.status(201).json(user.toJSON());
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ message: 'Server error creating user.' });
  }
});

/**
 * PUT /api/users/:id
 * Update user (admin only)
 */
router.put('/:id', authenticate, async (req, res) => {
  try {
    if (!['super_admin', 'admin'].includes(req.user.primaryRole)) {
      return res.status(403).json({ message: 'Access denied.' });
    }

    const { name, email, loginId, primaryRole, accessRoles, status, isActive, linkedClientName, assignedBrands } = req.body;
    
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (name) user.name = name;
    if (email) user.email = email;
    if (loginId) user.loginId = loginId;
    if (primaryRole) user.primaryRole = primaryRole;
    if (accessRoles) user.accessRoles = accessRoles;
    if (status) user.status = status;
    if (isActive !== undefined) user.isActive = isActive;
    if (linkedClientName !== undefined) user.linkedClientName = linkedClientName || '';
    // Always update assignedBrands (even empty array to allow unlinking all brands)
    if (assignedBrands !== undefined) user.assignedBrands = Array.isArray(assignedBrands) ? assignedBrands : [];
    user.updatedBy = req.user._id;

    await user.save();

    // Sync status change to linked employee if any
    if (status && user.linkedEmployeeId) {
      await Employee.findByIdAndUpdate(user.linkedEmployeeId, { status });
    }

    res.json(user.toJSON());
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ message: 'Server error updating user.' });
  }
});

/**
 * DELETE /api/users/:id
 * Delete a user
 */
router.delete('/:id', authenticate, async (req, res) => {
  try {
    if (!['super_admin', 'admin'].includes(req.user.primaryRole)) {
      return res.status(403).json({ message: 'Access denied.' });
    }
    if (req.query.permanent === 'true') {
      await User.findByIdAndDelete(req.params.id);
      res.json({ message: 'User permanently deleted.' });
    } else {
      await User.findByIdAndUpdate(req.params.id, { isActive: false, status: 'inactive' });
      res.json({ message: 'User safely archived (Zero Data Loss Policy enforced).' });
    }
  } catch (err) {
    res.status(500).json({ message: 'Server error deleting user.' });
  }
});

module.exports = router;
