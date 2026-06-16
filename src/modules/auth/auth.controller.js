const jwt = require('jsonwebtoken');
const config = require('../../config');
const User = require('../users/user.model');
const auditLog = require('../../middleware/auditLogger');


/**
 * POST /auth/login
 */
const login = async (req, res) => {
  try {
    const { loginId, password } = req.body;
    const rawLoginId = typeof loginId === 'string' ? loginId.trim() : '';
    const normalizedLoginId = typeof loginId === 'string' ? loginId.trim().toLowerCase() : '';

    if (!rawLoginId || !password) {
      return res.status(400).json({ message: 'Login ID and password are required.' });
    }

    let user = await User.findOne({
      $or: [
        { loginId: { $in: [rawLoginId, normalizedLoginId] } },  // e.g. ashish_kumar
        { email: normalizedLoginId },                            // e.g. ashish@lenstalk.com
        { employeeCode: { $in: [rawLoginId, rawLoginId.toUpperCase(), rawLoginId.toLowerCase()] } }, // e.g. LM-EMP-0017
      ],
      // isActive must be true OR not set at all (backward-compat for legacy users)
      isActive: { $ne: false },
      status: { $nin: ['inactive', 'suspended'] },
    });



    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    // Update last login
    user.lastLoginAt = new Date();
    await user.save({ validateModifiedOnly: true });

    // Generate JWT
    const token = jwt.sign(
      { userId: user._id, role: user.primaryRole },
      config.jwtSecret,
      { expiresIn: config.jwtExpiresIn }
    );

    // Fire login audit log (async, non-blocking)
    auditLog.write({
      action: 'USER_LOGIN',
      actor: user.name || user.loginId,
      details: `${user.name || user.loginId} logged in (role: ${user.primaryRole})`,
      module: 'Auth',
      ip: req.ip || req.headers['x-forwarded-for'] || '—',
    });

    res.json({
      token,
      user: user.toJSON(),
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error during login.' });
  }
};

/**
 * GET /auth/me
 */
const getMe = async (req, res) => {
  try {
    res.json({ user: req.user });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
};

/**
 * POST /auth/logout
 */
const logout = async (req, res) => {
  // With JWT in localStorage, logout is client-side
  // Log the logout event if a user token was decoded
  if (req.user) {
    auditLog.write({
      action: 'USER_LOGOUT',
      actor: req.user.name || req.user.loginId,
      details: `${req.user.name || req.user.loginId} logged out`,
      module: 'Auth',
      ip: req.ip || req.headers['x-forwarded-for'] || '—',
    });
  }
  res.json({ message: 'Logged out successfully.' });
};

module.exports = { login, getMe, logout };
