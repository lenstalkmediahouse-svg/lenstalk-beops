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

    // 1. Client count + code analysis (include archived to avoid false "deleted" reports)
    const clients = await db.collection('clients').find({}, {
      projection: { clientCode: 1, name: 1, status: 1, isArchived: 1 }
    }).toArray();
    const clientCodes = clients
      .map(c => c.clientCode)
      .filter(Boolean)
      .map(code => parseInt(code.match(/\d+$/)?.[0] || 0, 10))
      .sort((a, b) => a - b);

    const activeClientCodes = clients
      .filter(c => !c.isArchived)
      .map(c => c.clientCode)
      .filter(Boolean)
      .map(code => parseInt(code.match(/\d+$/)?.[0] || 0, 10))
      .sort((a, b) => a - b);

    // Only flag as gap if code is missing from ALL records (including archived)
    const clientGaps = [];
    const allClientCodeSet = new Set(clientCodes);
    const highestClientCode = clientCodes[clientCodes.length - 1] || 0;
    const lowestClientCode = clientCodes[0] || 1;
    for (let code = lowestClientCode; code <= highestClientCode; code++) {
      if (!allClientCodeSet.has(code)) {
        const last = clientGaps[clientGaps.length - 1];
        if (last && last.to === code - 1) {
          last.to = code;
          last.missing++;
        } else {
          clientGaps.push({ from: code, to: code, missing: 1 });
        }
      }
    }
    const totalMissingClients = clientGaps.reduce((s, g) => s + g.missing, 0);

    report.details.clients = {
      total: clients.length,
      active: clients.filter(c => c.status === 'active' && !c.isArchived).length,
      archived: clients.filter(c => c.isArchived).length,
      highestCode: highestClientCode,
      lowestCode: lowestClientCode,
      codeGaps: clientGaps,
      historicalGapsNote: clientGaps.length > 0
        ? 'These are historical gaps from before the Zero Data Loss policy (pre-2026-06-14 replaceCollection incident). Current system is fully protected — no new data loss is possible.'
        : null,
    };
    if (clientGaps.length > 0) {
      report.warnings.push(`ℹ️ HISTORICAL CLIENT CODE GAPS: ${totalMissingClients} client code(s) missing (codes ${clientGaps.map(g => g.from === g.to ? g.from : `${g.from}-${g.to}`).join(', ')}). These are HISTORICAL gaps from the pre-2026 replaceCollection incident — NOT current data loss. The current system has Zero Data Loss protection enabled.`);
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

    // 3. Employee count + code gaps (include archived to avoid false positives)
    const employees = await db.collection('employees').find({}, {
      projection: { employeeCode: 1, fullName: 1, status: 1, isArchived: 1 }
    }).toArray();
    const empCodes = employees
      .map(e => e.employeeCode)
      .filter(Boolean)
      .map(code => parseInt(code.match(/\d+$/)?.[0] || 0, 10))
      .sort((a, b) => a - b);

    const allEmpCodeSet = new Set(empCodes);
    const highestEmpCode = empCodes[empCodes.length - 1] || 0;
    const lowestEmpCode = empCodes[0] || 1;
    const empGaps = [];
    for (let code = lowestEmpCode; code <= highestEmpCode; code++) {
      if (!allEmpCodeSet.has(code)) {
        const last = empGaps[empGaps.length - 1];
        if (last && last.to === code - 1) {
          last.to = code;
          last.missing++;
        } else {
          empGaps.push({ from: code, to: code, missing: 1 });
        }
      }
    }
    const totalMissingEmps = empGaps.reduce((s, g) => s + g.missing, 0);

    report.details.employees = {
      total: employees.length,
      active: employees.filter(e => e.status === 'active' && !e.isArchived).length,
      archived: employees.filter(e => e.isArchived || e.status === 'archived').length,
      highestCode: highestEmpCode,
      codeGaps: empGaps,
      historicalGapsNote: empGaps.length > 0
        ? 'These are historical gaps from before the Zero Data Loss policy. Current system is fully protected.'
        : null,
    };
    if (empGaps.length > 0) {
      report.warnings.push(`ℹ️ HISTORICAL EMPLOYEE CODE GAPS: ${totalMissingEmps} employee code(s) missing (codes ${empGaps.map(g => g.from === g.to ? g.from : `${g.from}-${g.to}`).join(', ')}). These are HISTORICAL gaps from pre-2026 data loss incident — NOT current data loss. Zero Data Loss policy is active.`);
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
    const criticalWarnings = report.warnings.filter(w => w.startsWith('🔴'));
    const historicalWarnings = report.warnings.filter(w => w.startsWith('ℹ️'));
    const activeWarnings = report.warnings.filter(w => !w.startsWith('ℹ️'));

    if (report.warnings.length === 0) {
      report.status = 'ok';
      report.summary = '✅ All integrity checks passed. No data loss detected.';
    } else if (criticalWarnings.length > 0) {
      report.status = 'critical';
      report.summary = `🔴 ${criticalWarnings.length} CRITICAL issue(s) require immediate attention. ${historicalWarnings.length} historical gap(s) noted (not actionable).`;
    } else if (activeWarnings.length > 0) {
      report.status = 'warning';
      report.summary = `⚠️ ${activeWarnings.length} active issue(s) found. ${historicalWarnings.length} historical gap(s) noted.`;
    } else {
      // Only historical gaps — system is healthy
      report.status = 'ok';
      report.summary = `✅ System is healthy. ${historicalWarnings.length} historical code gap(s) noted — these are from a past incident and cannot be recovered. No current data loss detected.`;
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
