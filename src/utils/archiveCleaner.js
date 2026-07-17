/**
 * archiveCleaner.js
 * Runs daily to permanently delete:
 * 1. Generic collection items where isArchived=true AND archivedAt is explicitly set and older than 30 days
 * 2. Employees/Clients where isArchived=true or status='archived' AND archivedAt explicitly set > 30 days
 *
 * ROOT CAUSE FIX (2026-06-15):
 * Removed the `updatedAt` fallback which was silently deleting any record older than 30 days
 * that had isArchived=true — even if archivedAt was never set. This was a major source of data loss.
 * Now ONLY records with an EXPLICIT archivedAt date older than 30 days are permanently deleted.
 */

const mongoose = require('mongoose');
const getModel = require('../modules/generic/generic.model');

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

// All generic collections that may have isArchived items
const GENERIC_COLLECTIONS = [
  'content_tasks',
  'leave_requests',
  'dpr_entries',
  'lenstalk_influencer_niches_v1',
  'lenstalk_account_logs_v1',
  'gear_requests',
  'lenstalk_freelancers_v1',
  'lenstalk_hiring_v1',
  'lenstalk_leaves_v1',
  'lenstalk_salaries_v1',
  'lenstalk_dpr_v1',
  'lenstalk_hr_documents_v1',
  'lenstalk_shoots_v1',
  'lenstalk_equipment_v1',
  'lenstalk_reports_v1',
  'lenstalk_ads_v1',
  'lenstalk_influencers_v1',
  'lenstalk_influencer_manual_v1',
  'lenstalk_documents_v1',
  'lenstalk_ops_tasks_v1',
  'lenstalk_personal_tasks_v1',
];

async function runArchiveCleanup() {
  console.log(`\n🧹 [Archive Cleaner] Skipped. Auto-deletion is explicitly disabled.`);
}

/**
 * Schedule the cleanup to run once per day (every 24 hours).
 * Call this from server.js after DB connects.
 */
function scheduleArchiveCleanup() {
  console.log('📅 [Archive Cleaner] Auto-deletion is DISABLED as per Super Admin request. No data will be deleted automatically.');
}

module.exports = { scheduleArchiveCleanup, runArchiveCleanup };
