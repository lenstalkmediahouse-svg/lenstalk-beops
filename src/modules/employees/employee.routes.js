const express = require('express');
const router = express.Router();
const { authenticate, restrictTo } = require('../../middleware/auth');
const controller = require('./employee.controller');

// All employee routes require authentication
router.use(authenticate);

router.get('/', controller.getAll);
router.get('/eligible-cinematographers', controller.getEligibleCinematographers);
router.get('/:id', controller.getById);
router.post('/', restrictTo('super_admin', 'admin', 'hr'), controller.create);
router.patch('/:id', restrictTo('super_admin', 'admin', 'hr'), controller.update);
router.post('/:id/archive', restrictTo('super_admin', 'admin', 'hr'), controller.archive);
router.post('/:id/restore', restrictTo('super_admin'), controller.restore);           // Super Admin ONLY
router.delete('/:id', restrictTo('super_admin'), controller.remove);                   // Super Admin ONLY (perm delete via Archive Vault)

module.exports = router;
