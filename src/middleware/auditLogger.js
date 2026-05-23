/**
 * auditLogger.js
 * Lightweight audit logging middleware for Lenstalk OS.
 * 
 * Usage: router.post('/approve', auditLog('LEAVE_APPROVE', (req) => `${req.user?.name} approved leave for ${req.body?.employeeId}`), handler)
 * 
 * Writes asynchronously — never blocks the response.
 */

const getModel = require('../modules/generic/generic.model');

const COLLECTION = 'lenstalk_audit_logs_v1';

/**
 * Redact sensitive PII from log details
 */
function redactPII(text) {
  if (typeof text !== 'string') {
    try { text = JSON.stringify(text); } catch { return String(text); }
  }
  return text
    // Redact emails
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL REDACTED]')
    // Redact 10+ digit phone numbers (rudimentary)
    .replace(/\b\d{10,15}\b/g, '[PHONE REDACTED]')
    // Redact passwords/tokens if present in JSON-like structures
    .replace(/"(password|token|secret)":\s*"[^"]+"/gi, '"$1": "[REDACTED]"');
}

/**
 * Write a single audit log entry without blocking the request lifecycle.
 * @param {object} entry - { action, actor, details, module, ip }
 */
async function writeAuditLog(entry) {
  try {
    const AuditLog = getModel(COLLECTION);
    await AuditLog.create({
      action: entry.action,
      actor: entry.actor || 'system',
      details: redactPII(entry.details || ''),
      module: entry.module || 'General',
      ip: entry.ip || '—',
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    // Silent fail — audit logs must never break production
    console.warn('[AuditLog] Write failed silently:', err.message);
  }
}

/**
 * Middleware factory. Call in route definitions.
 * @param {string} action - e.g. 'LEAVE_APPROVE'
 * @param {function} getDetails - (req) => string describing the action
 * @param {string} module - module name for filtering, e.g. 'HR'
 */
function auditLog(action, getDetails, module = 'General') {
  return (req, res, next) => {
    // Capture response finish event to log after the action succeeds
    const originalJson = res.json.bind(res);
    res.json = function(body) {
      // Only log on success (2xx)
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const details = typeof getDetails === 'function' ? getDetails(req, body) : (getDetails || action);
        writeAuditLog({
          action,
          actor: req.user?.name || req.user?.loginId || 'Unknown',
          details,
          module,
          ip: req.ip || req.headers['x-forwarded-for'] || '—',
        });
      }
      return originalJson(body);
    };
    next();
  };
}

/**
 * Direct write — use in controllers that don't go through middleware chain easily.
 * e.g. after login: writeAuditLog({ action: 'USER_LOGIN', actor: user.name, details: '...', module: 'Auth', ip: req.ip })
 */
auditLog.write = writeAuditLog;

module.exports = auditLog;
