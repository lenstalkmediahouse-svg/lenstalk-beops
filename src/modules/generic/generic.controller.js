
const getModel = require('./generic.model');

exports.getAll = async (req, res) => {
  try {
    const Model = getModel(req.params.module);
    
    // HIGH-2 FIX: Backend Brand Isolation for SMM users
    // Any collection that stores a 'client' field must be listed here
    // so SMM users can only read records for their assigned brands.
    let query = {};
    if (req.user?.primaryRole === 'smm') {
      const brandFilteredModules = [
        'content_tasks',           // Content Planner tasks
        'lenstalk_reports_v1',     // Performance reports
        'lenstalk_ads_v1',         // Ads data
        'lenstalk_shoots_v1',      // Shoot scheduler
        'lenstalk_ops_tasks_v1',   // OPS task manager
      ];
      if (brandFilteredModules.includes(req.params.module)) {
        query.client = { $in: req.user.assignedBrands || [] };
      }
    }

    const data = await Model.find(query);
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getById = async (req, res) => {
  try {
    const Model = getModel(req.params.module);
    const doc = await Model.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Not found' });
    res.status(200).json(doc);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.create = async (req, res) => {
  try {
    const Model = getModel(req.params.module);
    const doc = new Model(req.body);
    await doc.save();
    res.status(201).json(doc);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.update = async (req, res) => {
  try {
    const Model = getModel(req.params.module);
    const doc = await Model.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!doc) return res.status(404).json({ message: 'Not found' });
    res.status(200).json(doc);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.remove = async (req, res) => {
  try {
    const Model = getModel(req.params.module);
    let doc;
    if (req.query.permanent === 'true') {
      doc = await Model.findByIdAndDelete(req.params.id);
      if (!doc) return res.status(404).json({ message: 'Not found' });
      return res.status(200).json({ message: 'Item permanently deleted.' });
    } else {
      doc = await Model.findByIdAndUpdate(req.params.id, { isArchived: true, archivedAt: new Date().toISOString() }, { new: true });
      if (!doc) return res.status(404).json({ message: 'Not found' });
      res.status(200).json({ message: 'Item safely archived (Zero Data Loss Policy enforced).', data: doc });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * PUT /api/data/:module/replace
 *
 * Replaces the entire collection with the provided array.
 * Uses a simple delete-all + reinsert strategy.
 * For items that already have a valid MongoDB ObjectId _id, 
 * we preserve that _id so the frontend can track records correctly.
 * 
 * Returns the final DB state with canonical MongoDB _ids.
 */
exports.replaceCollection = async (req, res) => {
  // HIGH-1 FIX: replaceCollection is deprecated to prevent concurrency data-loss.
  // All modules should use atomic CRUD endpoints instead.
  return res.status(405).json({ 
    message: 'Method Not Allowed: Bulk replace operations have been deprecated for data safety. Please use atomic POST/PATCH endpoints.'
  });
};
