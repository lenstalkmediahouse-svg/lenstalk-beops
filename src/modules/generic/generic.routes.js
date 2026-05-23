const express = require('express');
const router = express.Router({ mergeParams: true });
const genericController = require('./generic.controller');
const { authenticate } = require('../../middleware/auth');
const auditLog = require('../../middleware/auditLogger');

// H-4 FIX: Collection-level role allowlist.
// Defines which roles can access which collections.
// Anything not listed here is restricted to admin/super_admin only.
const COLLECTION_ACCESS = {
  // Shared read-write collections (Ops + Admin)
  content_tasks:              ['super_admin', 'admin', 'operations_head', 'hr', 'ads_manager_creators', 'employee', 'cinematographer', 'client', 'Operations', 'HR System', 'Ads & Creators'],
  gear_requests:              ['super_admin', 'admin', 'operations_head', 'employee', 'cinematographer', 'Operations', 'Employee Workspace (With My Shoots)'],
  task_approvals:             ['super_admin', 'admin', 'operations_head', 'hr', 'employee', 'cinematographer', 'Operations', 'HR System'],
  shoot_campaigns:            ['super_admin', 'admin', 'operations_head', 'ads_manager_creators', 'client', 'Operations', 'Ads & Creators'],

  // Equipment & Shoots
  lenstalk_shoots_v1:         ['super_admin', 'admin', 'operations_head', 'hr', 'employee', 'cinematographer', 'Operations', 'HR System'],
  lenstalk_equipment_v1:      ['super_admin', 'admin', 'operations_head', 'employee', 'cinematographer', 'Operations'],

  // HR Documents (HR + Admin only)
  lenstalk_hr_documents_v1:   ['super_admin', 'admin', 'hr', 'HR System'],
  lenstalk_freelancers_v1:    ['super_admin', 'admin', 'hr', 'operations_head', 'HR System', 'Operations'],
  lenstalk_hiring_v1:         ['super_admin', 'admin', 'hr', 'HR System'],

  // ── HOLIDAYS ── was missing entirely — caused 403 for ALL non-admin roles
  // Every authenticated role can READ holidays (shown in Attendance calendar)
  // Only HR/Admin can write new holidays (enforced by HR panel UI, not here)
  lenstalk_holidays_v1:       ['super_admin', 'admin', 'hr', 'operations_head', 'employee', 'cinematographer', 'ads_manager_creators', 'HR System'],

  // Ops modules
  lenstalk_reports_v1:        ['super_admin', 'admin', 'operations_head', 'hr', 'ads_manager_creators', 'client', 'Operations', 'Ads & Creators'],
  lenstalk_ads_v1:            ['super_admin', 'admin', 'ads_manager_creators', 'client', 'Ads & Creators'],
  lenstalk_influencers_v1:    ['super_admin', 'admin', 'operations_head', 'ads_manager_creators', 'Ads & Creators'],
  lenstalk_influencer_niches_v1: ['super_admin', 'admin', 'operations_head', 'ads_manager_creators', 'Ads & Creators'],
  lenstalk_influencer_categories_v1: ['super_admin', 'admin', 'operations_head', 'ads_manager_creators', 'Ads & Creators'],
  // Client Portal needs READ access to see their own influencer campaigns
  lenstalk_influencer_manual_v1: ['super_admin', 'admin', 'operations_head', 'ads_manager_creators', 'client', 'Ads & Creators'],
  lenstalk_influencer_edits_v1:  ['super_admin', 'admin', 'operations_head', 'ads_manager_creators', 'client', 'Ads & Creators'],
  lenstalk_documents_v2:      ['super_admin', 'admin', 'operations_head', 'hr', 'ads_manager_creators', 'Document Generator'],

  // OPS & Personal Tasks
  lenstalk_ops_tasks_v1:      ['super_admin', 'admin', 'operations_head', 'hr', 'employee', 'cinematographer', 'ads_manager_creators', 'Operations', 'HR System', 'Employee Workspace (With My Shoots)', 'Employee Workspace (Without My Shoots)', 'Ads & Creators'],
  lenstalk_personal_tasks_v1: ['super_admin', 'admin', 'operations_head', 'hr', 'employee', 'cinematographer', 'ads_manager_creators', 'Employee Workspace (With My Shoots)', 'Employee Workspace (Without My Shoots)'],

  // Notifications — all authenticated users can read their own
  lenstalk_notifications_v1:  ['super_admin', 'admin', 'hr', 'operations_head', 'employee', 'cinematographer', 'ads_manager_creators', 'client'],

  // Audit Logs — admin/super_admin only (read-only via UI, write via system)
  lenstalk_audit_logs_v1:     ['super_admin', 'admin', 'Admin'],

  // Settings — all authenticated roles can read company settings
  lenstalk_company_settings:  ['super_admin', 'admin', 'hr', 'operations_head', 'employee', 'cinematographer', 'ads_manager', 'ads_creators', 'client'],

  // Credentials — admin only (sensitive data)
  lenstalk_credentials_v1:    ['super_admin', 'admin'],

  // Archive Vault — admin manages permanently, ops/hr can restore their own
  archive_vault:              ['super_admin', 'admin', 'hr', 'operations_head'],
};

// H-4 middleware: check that the user's role is allowed for this collection
function collectionRoleCheck(req, res, next) {
  const user = req.user;
  if (!user) return res.status(401).json({ message: 'Not authenticated.' });

  // Super admin and admin always pass
  if (['super_admin', 'admin'].includes(user.primaryRole)) return next();

  const collection = req.params.module;
  const allowedRoles = COLLECTION_ACCESS[collection];

  if (!allowedRoles) {
    // Collection not in allowlist — restrict to admin only
    return res.status(403).json({
      message: `Access denied. Collection "${collection}" is restricted to administrators only.`,
    });
  }

  // Check primary role OR any access role
  const userRoles = [user.primaryRole, ...(user.accessRoles || [])];
  const hasAccess = allowedRoles.some(r => userRoles.includes(r));

  if (!hasAccess) {
    return res.status(403).json({
      message: `Access denied. Your role does not have permission to access "${collection}".`,
    });
  }

  next();
}

router.use(authenticate);

// Sensitive collection map: collection name -> { action, module }
const AUDIT_WRITE_MAP = {
  lenstalk_hiring_v1:         { action: 'HIRING_UPDATE',      module: 'HR' },
  lenstalk_influencer_manual_v1: { action: 'CAMPAIGN_UPDATE', module: 'Ads & Creators' },
  lenstalk_influencer_edits_v1:  { action: 'CAMPAIGN_UPDATE', module: 'Ads & Creators' },
  lenstalk_ops_tasks_v1:      { action: 'TASK_UPDATE',         module: 'Operations' },
  lenstalk_notifications_v1:  { action: 'NOTIFICATION_SEND',  module: 'System' },
};

// Generic audit middleware: fires for POST/PATCH on watched collections only
function conditionalAudit(req, res, next) {
  const col = req.params.module;
  const entry = AUDIT_WRITE_MAP[col];
  if (!entry || !['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method)) return next();

  const originalJson = res.json.bind(res);
  res.json = function(body) {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      const verb = req.method === 'DELETE' ? 'deleted' : (req.method === 'POST' ? 'created' : 'updated');
      auditLog.write({
        action: entry.action,
        actor: req.user?.name || req.user?.loginId || 'System',
        details: `${req.user?.name || 'User'} ${verb} record in ${col}`,
        module: entry.module,
        ip: req.ip || '—',
      });
    }
    return originalJson(body);
  };
  next();
}

// IMPORTANT: collectionRoleCheck must be inline per-route (NOT router.use()) because
// req.params.module is only populated AFTER Express matches the route pattern /:module.
// Using router.use(collectionRoleCheck) causes req.params.module to always be undefined,
// making COLLECTION_ACCESS[undefined] = undefined → 403 for every non-admin user.
router.get('/:module',         collectionRoleCheck, genericController.getAll);
router.get('/:module/:id',     collectionRoleCheck, genericController.getById);
router.post('/:module',        collectionRoleCheck, conditionalAudit, genericController.create);
router.put('/:module/replace', collectionRoleCheck, conditionalAudit, genericController.replaceCollection);
router.patch('/:module/:id',   collectionRoleCheck, conditionalAudit, genericController.update);
router.delete('/:module/:id',  collectionRoleCheck, conditionalAudit, genericController.remove);

module.exports = router;
