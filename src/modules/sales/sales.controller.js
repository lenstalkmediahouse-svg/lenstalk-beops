/**
 * Lenstalk OS — Sales Module Controller
 * Handles all lead CRUD + stage transitions + WON auto-client-creation.
 */
const Lead          = require('./lead.model');
const { STAGES }    = require('./lead.model');
const Client        = require('../clients/client.model');
const getGenericModel = require('../generic/generic.model');

const ALLOWED_ROLES = ['super_admin', 'admin', 'sales_executive', 'telecaller'];

function checkAccess(req, res) {
  const role        = req.user?.primaryRole;
  const accessRoles = req.user?.accessRoles || [];
  const allowed =
    ALLOWED_ROLES.includes(role) ||
    accessRoles.includes('Sales') ||
    accessRoles.includes('sales');
  if (!allowed) {
    res.status(403).json({ message: 'Access denied.' });
    return false;
  }
  return true;
}

/** Is this user an admin-level viewer (sees all leads)? */
function isAdminViewer(req) {
  const role = req.user?.primaryRole;
  return ['super_admin', 'admin'].includes(role);
}

/**
 * canAccessLead — true if non-admin user is assigned to OR created the lead.
 * Admins always return true.
 */
function canAccessLead(req, lead) {
  if (isAdminViewer(req)) return true;
  const uid = req.user._id.toString();
  const assignedId = lead.assignedToId?._id?.toString() || lead.assignedToId?.toString();
  const createdId  = lead.createdById?._id?.toString()  || lead.createdById?.toString();
  return assignedId === uid || createdId === uid;
}

/**
 * Write a notification to the existing generic notifications collection.
 */
async function writeNotification(message, type = 'info', targetRole = 'operations_head') {
  try {
    const NotifModel = getGenericModel('lenstalk_notifications_v1');
    await NotifModel.create({
      message,
      type,
      targetRole,
      read:      false,
      createdAt: new Date(),
    });
  } catch (err) {
    console.error('[Sales] Notification write failed:', err.message);
  }
}

// Notify all accountants (separate entry per role target)
async function notifyAccountants(message) {
  await writeNotification(message, 'warning', 'accountant');
}

/**
 * Internal: Auto-create a Client record when a lead is WON.
 */
async function _onWon(lead, byUserId) {
  try {
    const newClient = await Client.create({
      name:    lead.companyName,
      pocName: lead.contactPerson || '',
      pocMobile: lead.phone || '',
      status:  'active',
      notes:   `Auto-created from Sales lead ${lead.leadCode}`,
    });
    lead.clientId = newClient._id;
    await writeNotification(
      `Naya client onboard hua — ${lead.companyName} (${lead.leadCode}) — Sales se aaya`,
      'success'
    );
  } catch (err) {
    console.error('[Sales] WON client auto-create failed:', err.message);
    // Don't block the transition — log and continue
  }
}

// ── GET /api/sales/leads ──────────────────────────────────────────────────────
exports.getLeads = async (req, res) => {
  try {
    if (!checkAccess(req, res)) return;
    const { stage, search } = req.query;

    const filter = { isArchived: { $ne: true } };

    // Role-scoped: sales_executive / telecaller see only their own leads
    // (either assigned to them OR created by them)
    if (!isAdminViewer(req)) {
      filter.$and = [
        { $or: [{ assignedToId: req.user._id }, { createdById: req.user._id }] },
      ];
    }

    if (stage && STAGES.includes(stage)) filter.stage = stage;
    if (search) {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const searchOr = [
        { companyName:   { $regex: escaped, $options: 'i' } },
        { contactPerson: { $regex: escaped, $options: 'i' } },
        { leadCode:      { $regex: escaped, $options: 'i' } },
      ];
      // Merge with existing $and if scope is active, else set directly
      if (filter.$and) {
        filter.$and.push({ $or: searchOr });
      } else {
        filter.$or = searchOr;
      }
    }

    const leads = await Lead.find(filter)
      .populate('assignedToId', 'name email')
      .populate('createdById', 'name')
      .sort({ createdAt: -1 });

    res.json(leads);
  } catch (err) {
    console.error('[Sales] getLeads error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
};

// ── GET /api/sales/leads/:id ──────────────────────────────────────────────────
exports.getLeadById = async (req, res) => {
  try {
    if (!checkAccess(req, res)) return;
    const lead = await Lead.findById(req.params.id)
      .populate('assignedToId', 'name email')
      .populate('createdById', 'name')
      .populate('clientId', 'clientCode name');
    if (!lead) return res.status(404).json({ message: 'Lead not found.' });

    // Role-scoped: user must be assigned to OR creator of this lead
    if (!canAccessLead(req, lead)) {
      return res.status(403).json({ message: 'Access denied.' });
    }
    res.json(lead);
  } catch (err) {
    console.error('[Sales] getLeadById error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
};

// ── POST /api/sales/leads ─────────────────────────────────────────────────────
exports.createLead = async (req, res) => {
  try {
    if (!checkAccess(req, res)) return;
    const {
      companyName, contactPerson, phone, source,
      assignedToId, nextFollowUpDate, meetingDate,
      meetingStatus, meetingNotes, proposalAmount, proposalFileUrl, proposalStatus,
    } = req.body;

    if (!companyName?.trim()) return res.status(400).json({ message: 'Company name is required.' });
    if (!phone?.trim())       return res.status(400).json({ message: 'Phone number is required.' });

    const role = req.user?.primaryRole;
    // Auto-assign to self for field sales roles
    const selfAssign = ['sales_executive', 'telecaller'].includes(role);

    const lead = await Lead.create({
      companyName: companyName.trim(),
      contactPerson: contactPerson?.trim() || '',
      phone: phone.trim(),
      source: source || 'Manual',
      assignedToId: assignedToId || (selfAssign ? req.user._id : null),
      nextFollowUpDate: nextFollowUpDate || null,
      meetingDate: meetingDate || null,
      meetingStatus: meetingStatus || 'NOT_SCHEDULED',
      meetingNotes: meetingNotes?.trim() || '',
      proposalAmount: proposalAmount || null,
      proposalFileUrl: proposalFileUrl?.trim() || '',
      proposalStatus: proposalStatus || 'NOT_SENT',
      createdById: req.user._id,
      activityLog: [{
        stage: 'NEW_LEAD',
        note:  'Lead created',
        byUserId: req.user._id,
      }],
    });

    // Notify operations_head about new lead
    await writeNotification(
      `Naya lead add hua — ${lead.companyName} (${lead.leadCode}) — ${req.user.name || 'Sales Team'} dwara`,
      'info'
    );

    res.status(201).json(lead);
  } catch (err) {
    console.error('[Sales] createLead error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
};


// ── PATCH /api/sales/leads/:id ────────────────────────────────────────────────
exports.updateLead = async (req, res) => {
  try {
    if (!checkAccess(req, res)) return;
    const lead = await Lead.findById(req.params.id);
    if (!lead || lead.isArchived) return res.status(404).json({ message: 'Lead not found.' });

    // Ownership check — only assigned user, creator, or admin can edit
    if (!canAccessLead(req, lead)) {
      return res.status(403).json({ message: 'Access denied — not your lead.' });
    }

    // Only admins can re-assign a lead to someone else
    const EDITABLE = [
      'companyName', 'contactPerson', 'phone', 'source',
      'nextFollowUpDate', 'meetingDate', 'meetingStatus', 'meetingNotes',
      'proposalAmount', 'proposalFileUrl', 'proposalStatus',
    ];
    if (isAdminViewer(req)) EDITABLE.push('assignedToId');

    EDITABLE.forEach(f => {
      if (req.body[f] !== undefined) lead[f] = req.body[f];
    });

    await lead.save();
    res.json(lead);
  } catch (err) {
    console.error('[Sales] updateLead error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
};

// ── POST /api/sales/leads/:id/transition ──────────────────────────────────────
exports.transitionStage = async (req, res) => {
  try {
    if (!checkAccess(req, res)) return;
    const { toStage, note } = req.body;

    if (!toStage || !STAGES.includes(toStage)) {
      return res.status(400).json({ message: `Invalid stage. Must be one of: ${STAGES.join(', ')}` });
    }

    const lead = await Lead.findById(req.params.id);
    if (!lead || lead.isArchived) return res.status(404).json({ message: 'Lead not found.' });

    // Ownership check — only assigned user, creator, or admin can transition
    if (!canAccessLead(req, lead)) {
      return res.status(403).json({ message: 'Access denied — not your lead.' });
    }

    // Basic sanity validations (not a hard state machine — just key field checks)
    if (
      ['MEETING_FIXED', 'FOUNDER_REVIEW', 'PROPOSAL_SENT', 'NEGOTIATION', 'WON'].includes(toStage) &&
      !lead.meetingDate
    ) {
      return res.status(400).json({ message: 'Meeting date is required before moving past TELECALLING stage.' });
    }
    if (['PROPOSAL_SENT', 'NEGOTIATION', 'WON'].includes(toStage) && !lead.proposalAmount) {
      return res.status(400).json({ message: 'Proposal amount is required before moving to PROPOSAL_SENT or beyond.' });
    }

    const prevStage = lead.stage;
    lead.stage = toStage;
    lead.activityLog.push({
      stage:    toStage,
      note:     note || `Stage changed from ${prevStage} to ${toStage}`,
      byUserId: req.user._id,
      at:       new Date(),
    });

    // NEGOTIATION: auto-request account clearance
    if (toStage === 'NEGOTIATION' && prevStage !== 'NEGOTIATION') {
      lead.accountClearance = {
        status: 'pending',
        requestedAt: new Date(),
        approvedBy: null,
        approvedAt: null,
        rejectedAt: null,
        note: '',
      };
      await notifyAccountants(
        `Account clearance required — ${lead.companyName} (${lead.leadCode}) — Negotiation stage mein hai. Please approve/reject.`
      );
    }

    // WON: block if clearance is pending or rejected (unless 'not_required' = grandfathered)
    if (toStage === 'WON') {
      const cs = lead.accountClearance?.status;
      if (cs === 'pending') {
        return res.status(400).json({
          message: 'Account clearance is pending. Please wait for Accountant approval before marking WON.',
        });
      }
      if (cs === 'rejected') {
        return res.status(400).json({
          message: `Account clearance was rejected: "${lead.accountClearance?.note || 'No reason given'}". Please resolve with the Accounts team first.`,
        });
      }
      await _onWon(lead, req.user._id);
    }

    // LOST: soft-archive
    if (toStage === 'LOST') {
      lead.isArchived = true;
      lead.archivedAt = new Date();
    }

    await lead.save();

    // Fire notifications for key events
    if (toStage === 'MEETING_FIXED') {
      await writeNotification(`Meeting fixed — ${lead.companyName} (${lead.leadCode})`, 'info');
    }
    if (toStage === 'PROPOSAL_SENT') {
      await writeNotification(`Proposal sent — ${lead.companyName} (${lead.leadCode})`, 'info');
    }

    res.json(lead);
  } catch (err) {
    console.error('[Sales] transitionStage error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
};

// ── DELETE /api/sales/:id  →  soft-archive ────────────────────────────────────
exports.archiveLead = async (req, res) => {
  try {
    if (!checkAccess(req, res)) return;
    const lead = await Lead.findByIdAndUpdate(
      req.params.id,
      { isArchived: true, archivedAt: new Date() },
      { new: true }
    );
    if (!lead) return res.status(404).json({ message: 'Lead not found.' });
    res.json({ message: 'Lead archived.', lead });
  } catch (err) {
    console.error('[Sales] archiveLead error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
};

// ── GET /api/sales/archived  →  archived leads list (admin/super_admin only) ──
exports.getArchived = async (req, res) => {
  try {
    const role = req.user?.primaryRole;
    if (!['super_admin', 'admin'].includes(role)) {
      return res.status(403).json({ message: 'Admin access required.' });
    }
    const leads = await Lead.find({ isArchived: true })
      .populate('assignedToId', 'name')
      .populate('createdById',  'name')
      .sort({ archivedAt: -1 });
    res.json(leads);
  } catch (err) {
    console.error('[Sales] getArchived error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
};

// ── POST /api/sales/:id/restore  →  undo archive ──────────────────────────────
exports.restoreLead = async (req, res) => {
  try {
    const role = req.user?.primaryRole;
    if (!['super_admin', 'admin'].includes(role)) {
      return res.status(403).json({ message: 'Admin access required.' });
    }
    const lead = await Lead.findByIdAndUpdate(
      req.params.id,
      { isArchived: false, archivedAt: null },
      { new: true }
    );
    if (!lead) return res.status(404).json({ message: 'Lead not found.' });
    res.json({ message: 'Lead restored.', lead });
  } catch (err) {
    console.error('[Sales] restoreLead error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
};

// ── DELETE /api/sales/:id/permanent  →  hard-delete (super_admin only) ────────
exports.permanentDelete = async (req, res) => {
  try {
    const role = req.user?.primaryRole;
    if (role !== 'super_admin') {
      return res.status(403).json({ message: 'Only Super Admin can permanently delete leads.' });
    }
    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ message: 'Lead not found.' });
    if (!lead.isArchived) {
      return res.status(400).json({ message: 'Lead must be archived before permanent deletion.' });
    }
    await Lead.findByIdAndDelete(req.params.id);
    res.json({ message: `Lead "${lead.companyName}" permanently deleted.` });
  } catch (err) {
    console.error('[Sales] permanentDelete error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
};

// ── POST /api/sales/leads/:id/account-clearance ───────────────────────────────
exports.approveClearance = async (req, res) => {
  try {
    const role        = req.user?.primaryRole;
    const accessRoles = req.user?.accessRoles || [];
    const isAccountant = role === 'accountant' || accessRoles.includes('Accounts');
    const isAdmin      = ['super_admin', 'admin'].includes(role);

    if (!isAccountant && !isAdmin) {
      return res.status(403).json({ message: 'Only Accountants or Admins can approve account clearance.' });
    }

    const { approve, note } = req.body;
    if (typeof approve !== 'boolean') {
      return res.status(400).json({ message: '`approve` (boolean) is required.' });
    }

    const lead = await Lead.findById(req.params.id);
    if (!lead || lead.isArchived) return res.status(404).json({ message: 'Lead not found.' });

    if (lead.accountClearance?.status !== 'pending') {
      return res.status(400).json({ message: 'No pending clearance request for this lead.' });
    }

    if (approve) {
      lead.accountClearance.status     = 'approved';
      lead.accountClearance.approvedBy  = req.user._id;
      lead.accountClearance.approvedAt  = new Date();
      lead.accountClearance.note        = note || '';
      lead.activityLog.push({
        stage:    lead.stage,
        note:     `Account clearance APPROVED by ${req.user.name}${note ? ` — ${note}` : ''}`,
        byUserId: req.user._id,
        at:       new Date(),
      });
      // Notify sales team
      await writeNotification(
        `✅ Account clearance approved — ${lead.companyName} (${lead.leadCode}). Lead can now be moved to WON.`,
        'success', 'sales_executive'
      );
    } else {
      lead.accountClearance.status    = 'rejected';
      lead.accountClearance.rejectedAt = new Date();
      lead.accountClearance.note       = note || '';
      lead.activityLog.push({
        stage:    lead.stage,
        note:     `Account clearance REJECTED by ${req.user.name}${note ? ` — ${note}` : ''}`,
        byUserId: req.user._id,
        at:       new Date(),
      });
      // Notify sales team
      await writeNotification(
        `❌ Account clearance rejected — ${lead.companyName} (${lead.leadCode}). Reason: ${note || 'Not given'}`,
        'error', 'sales_executive'
      );
    }

    await lead.save();
    res.json(lead);
  } catch (err) {
    console.error('[Sales] approveClearance error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
};
