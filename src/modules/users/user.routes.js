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
 * HIGH-3 FIX: Added concurrency guard + 60s cooldown to prevent this heavy
 * sync function from running on every GET /api/users request.
 * Previously: N concurrent admin page loads → N parallel full-DB scans.
 * Now: At most 1 run per 60 seconds, skips if already running.
 */
let syncRunning = false;
let lastSyncAt = 0;
const SYNC_COOLDOWN_MS = 60 * 1000; // 60 seconds

async function syncMissingUsers(adminId) {
  const now = Date.now();
  if (syncRunning || (now - lastSyncAt) < SYNC_COOLDOWN_MS) return;
  syncRunning = true;
  lastSyncAt = now;
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
  } finally {
    syncRunning = false; // Release lock so next call after cooldown can run
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
    
    const { name, email, loginId, password, primaryRole, accessRoles, status, linkedClientName, assignedBrands, employeeCode } = req.body;
    
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
       assignedBrands: Array.isArray(assignedBrands) ? Array.from(new Set(assignedBrands.map(b => b?.trim()).filter(Boolean))) : [],
       // Store employeeCode so employee can login with HR code (e.g. LM-EMP-0017)
       employeeCode: employeeCode ? employeeCode.trim().toUpperCase() : '',
       createdBy: req.user._id,
    });

    await user.save();

    // MED-9 FIX: Only auto-create Employee record for roles that are actual HR staff.
    // Previously this ran for accountant, prm, smm etc., cluttering the HR employee list.
    const EMPLOYEE_ROLES = ['employee', 'cinematographer', 'hr', 'operations_head', 'ads_manager_creators'];
    if (EMPLOYEE_ROLES.includes(primaryRole)) {
      // Use the provided employeeCode if available, else use loginId as fallback
      const empCode = (employeeCode ? employeeCode.trim().toUpperCase() : null) || loginId;
      const employee = new Employee({
        employeeCode: empCode,
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
 * SECURITY: primaryRole can only be changed by super_admin — prevents privilege escalation.
 */
router.put('/:id', authenticate, async (req, res) => {
  try {
    if (!['super_admin', 'admin'].includes(req.user.primaryRole)) {
      return res.status(403).json({ message: 'Access denied.' });
    }

    const { name, email, loginId, primaryRole, accessRoles, status, isActive, linkedClientName, assignedBrands, employeeCode } = req.body;
    
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (name) user.name = name;
    if (email) user.email = email;
    if (loginId) user.loginId = loginId;

    // SECURITY: Only super_admin can promote/change primaryRole — prevents privilege escalation
    if (primaryRole) {
      if (req.user.primaryRole !== 'super_admin') {
        return res.status(403).json({ message: 'Forbidden: Only Super Admin can change a user\'s primary role.' });
      }
      user.primaryRole = primaryRole;
    }

    // accessRoles is FE-only (sidebar/workspace panels) — admin can update it freely
    if (accessRoles) user.accessRoles = accessRoles;
    if (status) user.status = status;
    if (isActive !== undefined) user.isActive = isActive;
    if (linkedClientName !== undefined) user.linkedClientName = linkedClientName || '';
    // Save employeeCode so employee can also login using their HR code
    if (employeeCode !== undefined) user.employeeCode = employeeCode ? employeeCode.trim().toUpperCase() : '';
    // Always update assignedBrands (even empty array to allow unlinking all brands) and deduplicate them
    if (assignedBrands !== undefined) {
      const rawBrands = Array.isArray(assignedBrands) ? assignedBrands : [];
      user.assignedBrands = Array.from(new Set(rawBrands.map(b => b?.trim()).filter(Boolean)));
    }
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
 * GET /api/users/backup/download
 * Download a full database backup as a single JSON file — SUPER ADMIN ONLY
 */
router.get('/backup/download', authenticate, async (req, res) => {
  try {
    if (req.user?.primaryRole !== 'super_admin') {
      return res.status(403).json({ message: 'Forbidden: Backups can only be downloaded by Super Admin.' });
    }

    const mongoose = require('mongoose');
    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();
    
    const backupData = {
      backupDate: new Date().toISOString(),
      database: db.databaseName,
      collections: {}
    };

    for (const col of collections) {
      const name = col.name;
      if (name.startsWith('system.')) continue;
      const docs = await db.collection(name).find({}).toArray();
      backupData.collections[name] = docs;
    }

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=lenstalk_db_backup_${new Date().toISOString().slice(0, 10)}.json`);
    res.status(200).send(JSON.stringify(backupData, null, 2));
  } catch (error) {
    console.error('Backup download error:', error);
    res.status(500).json({ message: 'Server error generating backup download.' });
  }
});

/**
 * DELETE /api/users/:id
 * Delete a user
 */
router.delete('/:id', authenticate, async (req, res) => {
  try {
    // Permanent delete — SUPER ADMIN ONLY
    if (req.query.permanent === 'true') {
      if (req.user?.primaryRole !== 'super_admin') {
        return res.status(403).json({ message: 'Forbidden: Permanent delete restricted to Super Admin only.' });
      }
      const auditLog = require('../../middleware/auditLogger');
      const user = await User.findByIdAndDelete(req.params.id);
      auditLog.write({ action: 'DATA_PERM_DELETE', actor: req.user?.name || 'Super Admin', details: `PERMANENT DELETE user | ID: ${req.params.id} | loginId: ${user?.loginId}`, module: 'Access Control', ip: req.ip || '—' });
      return res.json({ message: 'User permanently deleted.' });
    }
    // Soft deactivate — admin or super_admin
    if (!['super_admin', 'admin'].includes(req.user.primaryRole)) {
      return res.status(403).json({ message: 'Access denied.' });
    }
    const auditLog = require('../../middleware/auditLogger');
    await User.findByIdAndUpdate(req.params.id, { isActive: false, status: 'inactive' });
    auditLog.write({ action: 'DATA_ARCHIVE', actor: req.user?.name || 'Unknown', details: `Deactivated user | ID: ${req.params.id}`, module: 'Access Control', ip: req.ip || '—' });
    res.json({ message: 'User safely archived (Zero Data Loss Policy enforced).' });
  } catch (err) {
    res.status(500).json({ message: 'Server error deleting user.' });
  }
});

module.exports = router;
