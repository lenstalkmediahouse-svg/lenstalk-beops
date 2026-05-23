/**
 * Lenstalk OS — Role & Permission Constants
 * Defines the complete RBAC matrix for the platform.
 */

const ROLES = {
  SUPER_ADMIN: 'super_admin',
  ADMIN: 'admin',
  HR: 'hr',
  OPERATIONS_HEAD: 'operations_head',
  ADS_MANAGER: 'ads_manager',
  ADS_CREATORS: 'ads_creators',
  EMPLOYEE: 'employee',
  CINEMATOGRAPHER: 'cinematographer',
  CLIENT: 'client',
};

const PERMISSIONS = {
  // Employee
  EMPLOYEE_READ: 'employee.read',
  EMPLOYEE_CREATE: 'employee.create',
  EMPLOYEE_UPDATE: 'employee.update',
  EMPLOYEE_ARCHIVE: 'employee.archive',
  EMPLOYEE_DELETE: 'employee.delete',

  // Task
  TASK_READ: 'task.read',
  TASK_CREATE: 'task.create',
  TASK_UPDATE: 'task.update',
  TASK_ASSIGN: 'task.assign',
  TASK_REVIEW: 'task.review',
  TASK_SUBMIT_ADMIN_APPROVAL: 'task.submitForAdminApproval',
  TASK_ADMIN_APPROVE: 'task.adminApprove',

  // Shoot
  SHOOT_READ: 'shoot.read',
  SHOOT_CREATE: 'shoot.create',
  SHOOT_UPDATE: 'shoot.update',
  SHOOT_APPROVE_GEAR_OUT: 'shoot.approveGearOut',
  SHOOT_APPROVE_GEAR_IN: 'shoot.approveGearIn',

  // Document
  DOCUMENT_READ: 'document.read',
  DOCUMENT_GENERATE: 'document.generate',

  // Credential
  CREDENTIAL_MANAGE: 'credential.manage',

  // Report
  REPORT_READ: 'report.read',
  REPORT_CREATE: 'report.create',
  REPORT_PUBLISH: 'report.publish',

  // Ads
  ADS_READ: 'ads.read',
  ADS_WRITE: 'ads.write',

  // Creator / Influencer
  CREATOR_READ: 'creator.read',
  CREATOR_WRITE: 'creator.write',
  INFLUENCER_CAMPAIGN_READ: 'influencerCampaign.read',
  INFLUENCER_CAMPAIGN_WRITE: 'influencerCampaign.write',

  // HR
  LEAVE_MANAGE: 'leave.manage',
  ATTENDANCE_MANAGE: 'attendance.manage',
  SALARY_MANAGE: 'salary.manage',
  DPR_MANAGE: 'dpr.manage',
  HIRING_MANAGE: 'hiring.manage',

  // Client
  CLIENT_READ: 'client.read',
  CLIENT_CREATE: 'client.create',
  CLIENT_UPDATE: 'client.update',
  CLIENT_ARCHIVE: 'client.archive',

  // Equipment
  EQUIPMENT_READ: 'equipment.read',
  EQUIPMENT_CREATE: 'equipment.create',
  EQUIPMENT_UPDATE: 'equipment.update',

  // Admin
  AUDIT_READ: 'audit.read',
  SYSTEM_SETTINGS: 'system.settings',
  APPROVAL_MANAGE: 'approval.manage',
};

/**
 * Role → Permissions mapping.
 * Super Admin gets everything. Others get scoped permissions.
 */
const ROLE_PERMISSIONS = {
  [ROLES.SUPER_ADMIN]: Object.values(PERMISSIONS),
  [ROLES.ADMIN]: Object.values(PERMISSIONS),

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
    PERMISSIONS.SHOOT_APPROVE_GEAR_OUT,
    PERMISSIONS.SHOOT_APPROVE_GEAR_IN,
    PERMISSIONS.EQUIPMENT_READ,
    PERMISSIONS.EQUIPMENT_CREATE,
    PERMISSIONS.EQUIPMENT_UPDATE,
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

  [ROLES.ADS_MANAGER]: [
    PERMISSIONS.ADS_READ,
    PERMISSIONS.ADS_WRITE,
    PERMISSIONS.CREATOR_READ,
    PERMISSIONS.CREATOR_WRITE,
    PERMISSIONS.INFLUENCER_CAMPAIGN_READ,
    PERMISSIONS.INFLUENCER_CAMPAIGN_WRITE,
    PERMISSIONS.CLIENT_READ,
    PERMISSIONS.SHOOT_READ,
    PERMISSIONS.REPORT_READ,
  ],

  [ROLES.ADS_CREATORS]: [
    PERMISSIONS.ADS_READ,
    PERMISSIONS.ADS_WRITE,
    PERMISSIONS.CREATOR_READ,
    PERMISSIONS.CREATOR_WRITE,
    PERMISSIONS.INFLUENCER_CAMPAIGN_READ,
    PERMISSIONS.INFLUENCER_CAMPAIGN_WRITE,
    PERMISSIONS.CLIENT_READ,
    PERMISSIONS.SHOOT_READ,
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
};

/**
 * Sidebar navigation sections visible per role
 */
const ROLE_NAV_SECTIONS = {
  [ROLES.SUPER_ADMIN]: ['dashboard', 'hr', 'operations', 'ads-creators', 'employee', 'client', 'admin'],
  [ROLES.ADMIN]: ['dashboard', 'hr', 'operations', 'ads-creators', 'employee', 'client', 'admin'],
  [ROLES.HR]: ['dashboard', 'hr'],
  [ROLES.OPERATIONS_HEAD]: ['dashboard', 'operations'],
  [ROLES.ADS_MANAGER]: ['dashboard', 'ads-creators'],
  [ROLES.ADS_CREATORS]: ['dashboard', 'ads-creators'],
  [ROLES.EMPLOYEE]: ['dashboard', 'employee'],
  [ROLES.CINEMATOGRAPHER]: ['dashboard', 'employee'],
  [ROLES.CLIENT]: ['client'],
};

module.exports = { ROLES, PERMISSIONS, ROLE_PERMISSIONS, ROLE_NAV_SECTIONS };
