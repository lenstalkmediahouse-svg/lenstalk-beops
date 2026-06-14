/**
 * Lenstalk OS — Role & Permission Constants
 * Defines the complete RBAC matrix for the platform.
 *
 * CONFIRMED RULES (2026-06-14):
 *  - Module access = View + Add + Edit + Archive (full operational access)
 *  - Restore          → super_admin ONLY, via Archive Vault
 *  - Permanent Delete → super_admin ONLY, via Archive Vault
 *  - Admin            → all operational modules (full), NO Super Admin Panel, NO Archive Vault
 *  - Accounts module  → Accountant, Admin, Super Admin ONLY
 */

const ROLES = {
  SUPER_ADMIN:        'super_admin',
  ADMIN:              'admin',
  HR:                 'hr',
  OPERATIONS_HEAD:    'operations_head',
  ADS_MANAGER_CREATORS: 'ads_manager_creators', // unified role (was ads_manager + ads_creators)
  EMPLOYEE:           'employee',
  CINEMATOGRAPHER:    'cinematographer',
  CLIENT:             'client',
  ACCOUNTANT:         'accountant',
  SMM:                'smm',
  PRM:                'prm',
};

const PERMISSIONS = {
  // Employee
  EMPLOYEE_READ:    'employee.read',
  EMPLOYEE_CREATE:  'employee.create',
  EMPLOYEE_UPDATE:  'employee.update',
  EMPLOYEE_ARCHIVE: 'employee.archive',
  // Restore & Delete are super_admin exclusive — defined here for completeness but only granted to super_admin
  EMPLOYEE_RESTORE: 'employee.restore',
  EMPLOYEE_DELETE:  'employee.delete',

  // Task
  TASK_READ:                    'task.read',
  TASK_CREATE:                  'task.create',
  TASK_UPDATE:                  'task.update',
  TASK_ASSIGN:                  'task.assign',
  TASK_REVIEW:                  'task.review',
  TASK_SUBMIT_ADMIN_APPROVAL:   'task.submitForAdminApproval',
  TASK_ADMIN_APPROVE:           'task.adminApprove',

  // Shoot
  SHOOT_READ:            'shoot.read',
  SHOOT_CREATE:          'shoot.create',
  SHOOT_UPDATE:          'shoot.update',
  SHOOT_ARCHIVE:         'shoot.archive',
  SHOOT_APPROVE_GEAR_OUT:'shoot.approveGearOut',
  SHOOT_APPROVE_GEAR_IN: 'shoot.approveGearIn',

  // Document
  DOCUMENT_READ:     'document.read',
  DOCUMENT_GENERATE: 'document.generate',

  // Credential
  CREDENTIAL_MANAGE: 'credential.manage',

  // Report
  REPORT_READ:    'report.read',
  REPORT_CREATE:  'report.create',
  REPORT_PUBLISH: 'report.publish',

  // Ads & Creators (unified)
  ADS_READ:                    'ads.read',
  ADS_WRITE:                   'ads.write',
  CREATOR_READ:                'creator.read',
  CREATOR_WRITE:               'creator.write',
  INFLUENCER_CAMPAIGN_READ:    'influencerCampaign.read',
  INFLUENCER_CAMPAIGN_WRITE:   'influencerCampaign.write',

  // HR
  LEAVE_MANAGE:      'leave.manage',
  ATTENDANCE_MANAGE: 'attendance.manage',
  SALARY_MANAGE:     'salary.manage',
  DPR_MANAGE:        'dpr.manage',
  HIRING_MANAGE:     'hiring.manage',

  // Client
  CLIENT_READ:    'client.read',
  CLIENT_CREATE:  'client.create',
  CLIENT_UPDATE:  'client.update',
  CLIENT_ARCHIVE: 'client.archive',

  // Equipment
  EQUIPMENT_READ:   'equipment.read',
  EQUIPMENT_CREATE: 'equipment.create',
  EQUIPMENT_UPDATE: 'equipment.update',
  EQUIPMENT_ARCHIVE:'equipment.archive',

  // Accounts (Accountant / Admin / Super Admin only)
  ACCOUNTS_READ:    'accounts.read',
  ACCOUNTS_WRITE:   'accounts.write',

  // PRM
  PRM_READ:   'prm.read',
  PRM_WRITE:  'prm.write',

  // Admin (available to admin + super_admin)
  AUDIT_READ:       'audit.read',
  SYSTEM_SETTINGS:  'system.settings',
  APPROVAL_MANAGE:  'approval.manage',

  // Super Admin exclusive
  ARCHIVE_VAULT:    'archive.vault',
  RESTORE:          'archive.restore',
  PERM_DELETE:      'archive.permanentDelete',
};

/**
 * Role → Permissions mapping.
 *
 * KEY RULES:
 *   • super_admin → everything (all permissions)
 *   • admin       → everything EXCEPT Archive Vault, Restore, Permanent Delete
 *   • All other roles → scoped to their module only; no Restore or Permanent Delete
 */
const ROLE_PERMISSIONS = {
  [ROLES.SUPER_ADMIN]: Object.values(PERMISSIONS), // all permissions

  [ROLES.ADMIN]: Object.values(PERMISSIONS).filter(p =>
    p !== PERMISSIONS.ARCHIVE_VAULT &&
    p !== PERMISSIONS.RESTORE &&
    p !== PERMISSIONS.PERM_DELETE &&
    p !== PERMISSIONS.EMPLOYEE_RESTORE &&
    p !== PERMISSIONS.EMPLOYEE_DELETE
  ),

  [ROLES.HR]: [
    PERMISSIONS.EMPLOYEE_READ,
    PERMISSIONS.EMPLOYEE_CREATE,
    PERMISSIONS.EMPLOYEE_UPDATE,
    PERMISSIONS.EMPLOYEE_ARCHIVE,
    PERMISSIONS.LEAVE_MANAGE,
    PERMISSIONS.ATTENDANCE_MANAGE,
    PERMISSIONS.SALARY_MANAGE,
    PERMISSIONS.DPR_MANAGE,
    PERMISSIONS.HIRING_MANAGE,
    PERMISSIONS.DOCUMENT_READ,
    PERMISSIONS.DOCUMENT_GENERATE,
    PERMISSIONS.REPORT_READ,
    PERMISSIONS.SHOOT_READ,
  ],

  [ROLES.OPERATIONS_HEAD]: [
    PERMISSIONS.CLIENT_READ,
    PERMISSIONS.CLIENT_CREATE,
    PERMISSIONS.CLIENT_UPDATE,
    PERMISSIONS.CLIENT_ARCHIVE,
    PERMISSIONS.TASK_READ,
    PERMISSIONS.TASK_CREATE,
    PERMISSIONS.TASK_UPDATE,
    PERMISSIONS.TASK_ASSIGN,
    PERMISSIONS.TASK_REVIEW,
    PERMISSIONS.TASK_SUBMIT_ADMIN_APPROVAL,
    PERMISSIONS.SHOOT_READ,
    PERMISSIONS.SHOOT_CREATE,
    PERMISSIONS.SHOOT_UPDATE,
    PERMISSIONS.SHOOT_ARCHIVE,
    PERMISSIONS.SHOOT_APPROVE_GEAR_OUT,
    PERMISSIONS.SHOOT_APPROVE_GEAR_IN,
    PERMISSIONS.EQUIPMENT_READ,
    PERMISSIONS.EQUIPMENT_CREATE,
    PERMISSIONS.EQUIPMENT_UPDATE,
    PERMISSIONS.EQUIPMENT_ARCHIVE,
    PERMISSIONS.REPORT_READ,
    PERMISSIONS.REPORT_CREATE,
    PERMISSIONS.REPORT_PUBLISH,
    PERMISSIONS.DOCUMENT_READ,
    PERMISSIONS.DOCUMENT_GENERATE,
    PERMISSIONS.ADS_READ,
    PERMISSIONS.CREATOR_READ,
    PERMISSIONS.INFLUENCER_CAMPAIGN_READ,
    PERMISSIONS.EMPLOYEE_READ,
  ],

  // Unified ads_manager_creators role
  [ROLES.ADS_MANAGER_CREATORS]: [
    PERMISSIONS.ADS_READ,
    PERMISSIONS.ADS_WRITE,
    PERMISSIONS.CREATOR_READ,
    PERMISSIONS.CREATOR_WRITE,
    PERMISSIONS.INFLUENCER_CAMPAIGN_READ,
    PERMISSIONS.INFLUENCER_CAMPAIGN_WRITE,
    PERMISSIONS.CLIENT_READ,
    PERMISSIONS.SHOOT_READ,
    PERMISSIONS.REPORT_READ,
    PERMISSIONS.DOCUMENT_READ,
    PERMISSIONS.DOCUMENT_GENERATE,
  ],

  [ROLES.EMPLOYEE]: [
    PERMISSIONS.TASK_READ,
    PERMISSIONS.TASK_REVIEW,
    PERMISSIONS.SHOOT_READ,
  ],

  [ROLES.CINEMATOGRAPHER]: [
    PERMISSIONS.TASK_READ,
    PERMISSIONS.TASK_REVIEW,
    PERMISSIONS.SHOOT_READ,
    PERMISSIONS.EQUIPMENT_READ,
  ],

  [ROLES.CLIENT]: [
    PERMISSIONS.CLIENT_READ,
    PERMISSIONS.TASK_READ,
    PERMISSIONS.ADS_READ,
    PERMISSIONS.CREATOR_READ,
    PERMISSIONS.INFLUENCER_CAMPAIGN_READ,
    PERMISSIONS.REPORT_READ,
  ],

  // Accountant — Accounts module access only
  [ROLES.ACCOUNTANT]: [
    PERMISSIONS.ACCOUNTS_READ,
    PERMISSIONS.ACCOUNTS_WRITE,
    PERMISSIONS.DOCUMENT_READ,
    PERMISSIONS.DOCUMENT_GENERATE,
    PERMISSIONS.REPORT_READ,
  ],

  // SMM — Operations + Ads visibility (brand-scoped by backend query)
  [ROLES.SMM]: [
    PERMISSIONS.TASK_READ,
    PERMISSIONS.TASK_CREATE,
    PERMISSIONS.TASK_UPDATE,
    PERMISSIONS.CLIENT_READ,
    PERMISSIONS.REPORT_READ,
    PERMISSIONS.ADS_READ,
    PERMISSIONS.CREATOR_READ,
    PERMISSIONS.INFLUENCER_CAMPAIGN_READ,
    PERMISSIONS.SHOOT_READ,
  ],

  // PRM — Partner & Resource Management only
  [ROLES.PRM]: [
    PERMISSIONS.PRM_READ,
    PERMISSIONS.PRM_WRITE,
  ],
};

/**
 * Sidebar navigation sections visible per role.
 * Frontend navigation.jsx uses accessRoles (module names) as the primary source.
 * This is kept in sync for backend reference and audit purposes.
 */
const ROLE_NAV_SECTIONS = {
  [ROLES.SUPER_ADMIN]:          ['dashboard', 'hr', 'operations', 'ads-creators', 'accounts', 'prm', 'employee', 'client', 'admin', 'super-admin'],
  [ROLES.ADMIN]:                ['dashboard', 'hr', 'operations', 'ads-creators', 'accounts', 'prm', 'employee', 'client', 'admin'],
  [ROLES.HR]:                   ['dashboard', 'hr', 'employee'],
  [ROLES.OPERATIONS_HEAD]:      ['dashboard', 'operations', 'employee'],
  [ROLES.ADS_MANAGER_CREATORS]: ['dashboard', 'ads-creators', 'employee'],
  [ROLES.EMPLOYEE]:             ['dashboard', 'employee'],
  [ROLES.CINEMATOGRAPHER]:      ['dashboard', 'employee'],
  [ROLES.CLIENT]:               ['client'],
  [ROLES.ACCOUNTANT]:           ['dashboard', 'accounts', 'employee'],
  [ROLES.SMM]:                  ['dashboard', 'operations', 'employee'],
  [ROLES.PRM]:                  ['dashboard', 'prm', 'employee'],
};

module.exports = { ROLES, PERMISSIONS, ROLE_PERMISSIONS, ROLE_NAV_SECTIONS };
