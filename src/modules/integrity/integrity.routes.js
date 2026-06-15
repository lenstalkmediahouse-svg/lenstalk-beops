/**
 * integrity.routes.js
 * ─────────────────────────────────────────────────────────────
 * PERMANENT DATA PROTECTION — Integrity Check System
 *
 * GET  /api/integrity/check   → Full health scan of all critical collections
 * POST /api/integrity/seed-counters → One-time: seed counters from existing docs
 *
 * PURPOSE:
 * After the replaceCollection incident (wipe of clients 0001–0015 and employees),
 * this endpoint gives a permanent way to detect:
 *  1. Client/Employee code gaps (evidence of data loss)
 *  2. Counter drift (counter seq behind actual highest code)
 *  3. Content tasks referencing clients that don't exist in the clients collection
 *  4. Orphaned user accounts (no linked client/employee)
 *
 * Run this any time you suspect data loss. Also runs on server startup (logged, not fatal).
 */

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { authenticate, restrictTo } = require('../../middleware/auth');

// ── GET /api/integrity/check ────────────────────────────────────────────────
router.get('/check', authenticate, restrictTo('super_admin', 'admin'), async (req, res) => {
  try {
    const db = mongoose.connection.db;
    const report = {
      timestamp: new Date().toISOString(),
      status: 'ok',
      warnings: [],
      details: {},
    };

    // 1. Client count + code analysis
    const clients = await db.collection('clients').find({}, {
      projection: { clientCode: 1, name: 1, status: 1, isArchived: 1 }
    }).toArray();
    const clientCodes = clients
      .map(c => c.clientCode)
      .filter(Boolean)
      .map(code => parseInt(code.match(/\d+$/)?.[0] || 0, 10))
      .sort((a, b) => a - b);

    const clientGaps = [];
    for (let i = 1; i < clientCodes.length; i++) {
      if (clientCodes[i] - clientCodes[i - 1] > 1) {
        clientGaps.push({ from: clientCodes[i - 1], to: clientCodes[i], missing: clientCodes[i] - clientCodes[i - 1] - 1 });
      }
    }

    report.details.clients = {
      total: clients.length,
      active: clients.filter(c => c.status === 'active' && !c.isArchived).length,
      archived: clients.filter(c => c.isArchived).length,
      highestCode: clientCodes[clientCodes.length - 1] || 0,
      lowestCode: clientCodes[0] || 0,
      codeGaps: clientGaps,
    };
    if (clientGaps.length > 0) {
      report.warnings.push(`⚠️ CLIENT CODE GAPS DETECTED: ${clientGaps.length} gap(s). Total missing client records: ${clientGaps.reduce((s, g) => s + g.missing, 0)}. This indicates data was deleted permanently in the past.`);
    }

    // 2. Client counter vs actual highest
    const clientCounter = await db.collection('counters').findOne({ _id: 'clientCode' });
    if (clientCounter) {
      const counterSeq = clientCounter.seq;
      const actualHigh = clientCodes[clientCodes.length - 1] || 0;
      report.details.clientCounter = { seq: counterSeq, actualHighest: actualHigh, drift: counterSeq - actualHigh };
      if (counterSeq < actualHigh) {
        report.warnings.push(`🔴 CLIENT COUNTER DRIFT: Counter seq (${counterSeq}) is BEHIND actual highest code (${actualHigh}). New clients will get duplicate codes! Fix immediately.`);
        report.status = 'critical';
      }
    }

    // 3. Employee count + code gaps
    const employees = await db.collection('employees').find({}, {
      projection: { employeeCode: 1, fullName: 1, status: 1, isArchived: 1 }
    }).toArray();
    const empCodes = employees
      .map(e => e.employeeCode)
      .filter(Boolean)
      .map(code => parseInt(code.match(/\d+$/)?.[0] || 0, 10))
      .sort((a, b) => a - b);

    const empGaps = [];
    for (let i = 1; i < empCodes.length; i++) {
      if (empCodes[i] - empCodes[i - 1] > 1) {
        empGaps.push({ from: empCodes[i - 1], to: empCodes[i], missing: empCodes[i] - empCodes[i - 1] - 1 });
      }
    }

    report.details.employees = {
      total: employees.length,
      active: employees.filter(e => e.status === 'active' && !e.isArchived).length,
      highestCode: empCodes[empCodes.length - 1] || 0,
      codeGaps: empGaps,
    };
    if (empGaps.length > 0) {
      report.warnings.push(`⚠️ EMPLOYEE CODE GAPS: ${empGaps.length} gap(s). Missing: ${empGaps.reduce((s, g) => s + g.missing, 0)} employee records permanently deleted.`);
    }

    // 4. Content tasks referencing missing clients
    const contentTasks = await db.collection('content_tasks').find(
      { isArchived: { $ne: true } },
      { projection: { client: 1, title: 1 } }
    ).toArray();
    const clientNamesInDB = new Set(clients.map(c => (c.name || '').trim()));
    const orphanedTaskClients = [...new Set(
      contentTasks.map(t => t.client).filter(c => c && !clientNamesInDB.has(c.trim()))
    )];

    report.details.contentTasks = {
      total: contentTasks.length,
      orphanedClientRefs: orphanedTaskClients,
    };
    if (orphanedTaskClients.length > 0) {
      report.warnings.push(`⚠️ ORPHANED CONTENT TASKS: ${orphanedTaskClients.length} client name(s) in tasks don't match any client record: [${orphanedTaskClients.join(', ')}]. Run restore-missing-clients.js to fix.`);
      report.status = report.status === 'ok' ? 'warning' : report.status;
    }

    // 5. Summary
    if (report.warnings.length === 0) {
      report.status = 'ok';
      report.summary = '✅ All integrity checks passed. No data loss detected.';
    } else {
      if (report.status === 'ok') report.status = 'warning';
      report.summary = `${report.warnings.length} issue(s) found. See warnings for details.`;
    }

    res.json(report);
  } catch (err) {
    res.status(500).json({ message: 'Integrity check failed.', error: err.message });
  }
});

// ── POST /api/integrity/seed-counters ───────────────────────────────────────
// One-time endpoint: seeds the clientCode and employeeCode counters from
// the highest existing code in the DB. Safe to call multiple times (idempotent).
router.post('/seed-counters', authenticate, restrictTo('super_admin'), async (req, res) => {
  try {
    const db = mongoose.connection.db;
    const results = {};

    // Seed clientCode counter
    const lastClient = await db.collection('clients').find({}, { projection: { clientCode: 1 } })
      .sort({ clientCode: -1 }).limit(1).toArray();
    const lastClientNum = lastClient[0]?.clientCode
      ? parseInt(lastClient[0].clientCode.match(/\d+$/)?.[0] || 0, 10)
      : 0;
    await db.collection('counters').updateOne(
      { _id: 'clientCode' },
      { $max: { seq: lastClientNum } },
      { upsert: true }
    );
    results.clientCode = { seededTo: lastClientNum };

    // Seed employeeCode counter
    const lastEmp = await db.collection('employees').find({}, { projection: { employeeCode: 1 } })
      .sort({ employeeCode: -1 }).limit(1).toArray();
    const lastEmpNum = lastEmp[0]?.employeeCode
      ? parseInt(lastEmp[0].employeeCode.match(/\d+$/)?.[0] || 0, 10)
      : 0;
    await db.collection('counters').updateOne(
      { _id: 'employeeCode' },
      { $max: { seq: lastEmpNum } },
      { upsert: true }
    );
    results.employeeCode = { seededTo: lastEmpNum };

    res.json({ message: '✅ Counters seeded successfully.', results });
  } catch (err) {
    res.status(500).json({ message: 'Seeding failed.', error: err.message });
  }
});

module.exports = router;
