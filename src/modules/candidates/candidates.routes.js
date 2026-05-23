const express = require('express');
const router = express.Router();
const getModel = require('../generic/generic.model');
const rateLimit = require('express-rate-limit');

// Rate limiter: max 5 submissions per IP per 15 minutes (anti-spam for public forms)
const applyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many submissions from this IP. Please try again in 15 minutes.' },
});

/**
 * POST /api/candidates/apply
 * Public unauthenticated endpoint for candidates submitting applications via campaign links.
 * Enforces email duplication check against active/archived candidates in lenstalk_hiring_v1.
 */
router.post('/apply', applyLimiter, async (req, res) => {
  try {
    const { candidateName, appliedRole, mobile, email, applicationType, experienceText, cvLink } = req.body;

    if (!candidateName || !appliedRole || !email || !mobile) {
      return res.status(400).json({ message: 'Candidate Name, Applied Role, Email, and Mobile Number are required.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const HiringModel = getModel('lenstalk_hiring_v1');

    // Duplicate check by email — exact match on pre-lowercased field (safe, no ReDoS risk)
    const existing = await HiringModel.findOne({ email: cleanEmail });

    if (existing) {
      return res.status(409).json({
        message: 'An application with this email address already exists in the pipeline.'
      });
    }

    // Construct the candidate document with stage: 'applied' by default
    const newCandidate = new HiringModel({
      candidateName: candidateName.trim(),
      appliedRole: appliedRole.trim(),
      mobile: mobile ? mobile.trim() : '',
      email: cleanEmail,
      applicationType: applicationType || 'job',
      experienceText: experienceText ? experienceText.trim() : '',
      cvLink: cvLink ? cvLink.trim() : '',
      stage: 'applied',
      notes: 'Submitted via public application link.',
      createdAt: new Date().toISOString(),
      addedDate: new Date().toISOString(),
    });

    await newCandidate.save();

    return res.status(201).json({
      message: 'Application submitted successfully!',
      candidate: newCandidate
    });
  } catch (error) {
    console.error('Candidate application error:', error);
    return res.status(500).json({ message: 'Internal server error while submitting application.' });
  }
});

module.exports = router;
