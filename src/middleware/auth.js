const jwt = require('jsonwebtoken');
const config = require('../config');
const User = require('../modules/users/user.model');
const { ROLE_PERMISSIONS } = require('../config/roles');

/**
 * Authenticate JWT token from Authorization header
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Access denied. No token provided.' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, config.jwtSecret);

    const user = await User.findById(decoded.userId).select('-passwordHash');
    if (!user || user.isActive === false || ['inactive', 'suspended'].includes(user.status)) {
      return res.status(401).json({ message: 'User account is inactive or not found.' });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token expired.' });
    }
    return res.status(401).json({ message: 'Invalid token.' });
  }
};

/**
 * Authorize by required permissions
 * Usage: authorize('employee.read', 'employee.create')
 */
const authorize = (...requiredPermissions) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Not authenticated.' });
    }

    const userRole = req.user.primaryRole;
    const userPermissions = ROLE_PERMISSIONS[userRole] || [];

    const hasPermission = requiredPermissions.every((perm) =>
      userPermissions.includes(perm)
    );

    if (!hasPermission) {
      return res.status(403).json({
        message: 'Forbidden. You do not have the required permissions.',
        required: requiredPermissions,
      });
    }

    next();
  };
};

/**
 * Restrict to specific roles
 * Usage: restrictTo('admin', 'super_admin')
 */
const restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Not authenticated.' });
    }

    // Check primary role OR any access role
    const userRoles = [req.user.primaryRole, ...(req.user.accessRoles || [])];
    const hasRole = roles.some((role) => userRoles.includes(role));

    if (!hasRole) {
      return res.status(403).json({ message: 'Forbidden. Insufficient role.' });
    }

    next();
  };
};

module.exports = { authenticate, authorize, restrictTo };
