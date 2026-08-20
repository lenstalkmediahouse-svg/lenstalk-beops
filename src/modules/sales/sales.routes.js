/**
 * Lenstalk OS — Sales Module Routes
 * Mirrors the prm.routes.js pattern: authenticate + role-check on each route.
 */
const express    = require('express');
const router     = express.Router();
const ctrl       = require('./sales.controller');
const { authenticate } = require('../../middleware/auth');

// All routes require a valid JWT
router.use(authenticate);

// Leads list (role-scoped in controller)
router.get('/',                         ctrl.getLeads);
// Archived leads vault (admin/super_admin only) — MUST be before /:id
router.get('/archived',                 ctrl.getArchived);
// Single lead
router.get('/:id',                      ctrl.getLeadById);
// Create lead
router.post('/',                        ctrl.createLead);
// Basic field edits
router.patch('/:id',                    ctrl.updateLead);
// Stage transition
router.post('/:id/transition',          ctrl.transitionStage);
// Account clearance approve/reject (accountant or admin only — enforced in controller)
router.post('/:id/account-clearance',   ctrl.approveClearance);
// Restore archived lead (admin/super_admin)
router.post('/:id/restore',             ctrl.restoreLead);
// Permanent delete — super_admin only
router.delete('/:id/permanent',         ctrl.permanentDelete);
// Soft-archive (isArchived: true)
router.delete('/:id',                   ctrl.archiveLead);

module.exports = router;
