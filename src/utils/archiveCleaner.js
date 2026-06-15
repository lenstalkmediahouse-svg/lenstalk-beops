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
  if (mongoose.connection.readyState !== 1) {
    console.warn('⚠️ [Archive Cleaner] MongoDB is not connected; skipping cleanup.');
    return;
  }

  const cutoff = new Date(Date.now() - THIRTY_DAYS_MS);
  let totalDeleted = 0;

  console.log(`\n🧹 [Archive Cleaner] Starting cleanup — cutoff: ${cutoff.toISOString()}`);

  for (const colName of GENERIC_COLLECTIONS) {
    try {
      const Model = getModel(colName);
      // ROOT CAUSE FIX: Only delete records where archivedAt is EXPLICITLY set and older than 30 days.
      // REMOVED: updatedAt fallback — it was silently deleting records that were never explicitly archived.
      // Records with isArchived=true but missing/null archivedAt are KEPT SAFE.
      const result = await Model.deleteMany({
        isArchived: true,
        archivedAt: { $ne: null, $exists: true, $lt: cutoff },
      });
      if (result.deletedCount > 0) {
        console.log(`   ✅ ${colName}: deleted ${result.deletedCount} expired archived records`);
        totalDeleted += result.deletedCount;
      }
    } catch (err) {
      console.error(`   ⚠️  ${colName}: cleanup failed — ${err.message}`);
    }
  }

  // Clean archived employees (via Employee model)
  try {
    const Employee = require('../modules/employees/employee.model');
    // ROOT CAUSE FIX: Only delete if archivedAt is explicitly set (not just updatedAt).
    const result = await Employee.deleteMany({
      $or: [{ isArchived: true }, { status: 'archived' }],
      archivedAt: { $ne: null, $exists: true, $lt: cutoff },
    });
    if (result.deletedCount > 0) {
      console.log(`   ✅ employees: deleted ${result.deletedCount} expired archived records`);
      totalDeleted += result.deletedCount;
    }
  } catch (err) {
    console.error(`   ⚠️  employees: cleanup failed — ${err.message}`);
  }

  // Clean archived clients (via Client model)
  try {
    const Client = require('../modules/clients/client.model');
    // ROOT CAUSE FIX: Only delete if archivedAt is explicitly set (not just updatedAt).
    const result = await Client.deleteMany({
      $or: [{ isArchived: true }, { status: 'archived' }],
      archivedAt: { $ne: null, $exists: true, $lt: cutoff },
    });
    if (result.deletedCount > 0) {
      console.log(`   ✅ clients: deleted ${result.deletedCount} expired archived records`);
      totalDeleted += result.deletedCount;
    }
  } catch (err) {
    console.error(`   ⚠️  clients: cleanup failed — ${err.message}`);
  }

  console.log(`🧹 [Archive Cleaner] Done. Total deleted: ${totalDeleted}\n`);
}

/**
 * Schedule the cleanup to run once per day (every 24 hours).
 * Call this from server.js after DB connects.
 */
function scheduleArchiveCleanup() {
  const INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
  // Delay first run by 5 minutes after startup (don't run immediately on boot)
  setTimeout(() => {
    runArchiveCleanup();
    setInterval(runArchiveCleanup, INTERVAL_MS);
  }, 5 * 60 * 1000);
  console.log('📅 [Archive Cleaner] Scheduled — first run in 5 min, then every 24h. Only explicit 30-day archived records will be deleted.');
}

module.exports = { scheduleArchiveCleanup, runArchiveCleanup };
