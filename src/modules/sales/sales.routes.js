/**
 * Lenstalk OS — Sales Routes
 * All routes require authentication (via authenticate middleware in app.js or here).
 */
const express     = require('express');
const router      = express.Router();
const ctrl        = require('./sales.controller');
const { authenticate } = require('../../middleware/auth');

router.use(authenticate);

// ── Lead Categories ─────────────────────────────────────────────────────────
router.get('/categories',          ctrl.getCategories);
router.post('/categories',         ctrl.createCategory);
router.patch('/categories/:id',    ctrl.updateCategory);
router.delete('/categories/:id',   ctrl.deleteCategory);

// ── CSV Export / Import ──────────────────────────────────────────────────────
router.get('/export',              ctrl.exportCSV);
router.post('/import',             ctrl.importCSV);

// ── Leads list (role-scoped in controller) ───────────────────────────────────
router.get('/',                         ctrl.getLeads);
// Archived leads vault — MUST be before /:id
router.get('/archived',                 ctrl.getArchived);
// Single lead
router.get('/:id',                      ctrl.getLeadById);
// Create lead
router.post('/',                        ctrl.createLead);
// Basic field edits
router.patch('/:id',                    ctrl.updateLead);
// Stage transition
router.post('/:id/transition',          ctrl.transitionStage);
// Account clearance
router.post('/:id/account-clearance',   ctrl.approveClearance);
// Restore archived lead
router.post('/:id/restore',             ctrl.restoreLead);
// Permanent delete — super_admin only
router.delete('/:id/permanent',         ctrl.permanentDelete);
// Soft-archive
router.delete('/:id',                   ctrl.archiveLead);

module.exports = router;
