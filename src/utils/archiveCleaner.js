/**
 * archiveCleaner.js
 * Runs daily to permanently delete:
 * 1. Generic collection items where isArchived=true AND archivedAt is older than 30 days
 * 2. Employees/Clients where isArchived=true or status='archived' AND archivedAt > 30 days
 */

const getModel = require('../modules/generic/generic.model');

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

// All generic collections that may have isArchived items
const GENERIC_COLLECTIONS = [
  'content_tasks',
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
  const cutoff = new Date(Date.now() - THIRTY_DAYS_MS);
  let totalDeleted = 0;

  console.log(`\n🧹 [Archive Cleaner] Starting cleanup — cutoff: ${cutoff.toISOString()}`);

  for (const colName of GENERIC_COLLECTIONS) {
    try {
      const Model = getModel(colName);
      const result = await Model.deleteMany({
        isArchived: true,
        $or: [
          { archivedAt: { $lt: cutoff } },
          { updatedAt: { $lt: cutoff } },
        ],
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
    const result = await Employee.deleteMany({
      $or: [{ isArchived: true }, { status: 'archived' }],
      $or: [
        { archivedAt: { $lt: cutoff } },
        { updatedAt: { $lt: cutoff } },
      ],
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
    const result = await Client.deleteMany({
      $or: [{ isArchived: true }, { status: 'archived' }],
      $or: [
        { archivedAt: { $lt: cutoff } },
        { updatedAt: { $lt: cutoff } },
      ],
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
  // Run immediately on startup, then every 24h
  runArchiveCleanup();
  setInterval(runArchiveCleanup, INTERVAL_MS);
  console.log('📅 [Archive Cleaner] Scheduled — runs every 24h. 30-day auto-delete is active.');
}

module.exports = { scheduleArchiveCleanup, runArchiveCleanup };
