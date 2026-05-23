const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');

const config = require('./config');
// Start cron jobs
require('./cron/renderSheduler');

// Route imports
const authRoutes       = require('./modules/auth/auth.routes');
const userRoutes       = require('./modules/users/user.routes');
const employeeRoutes   = require('./modules/employees/employee.routes');
const clientRoutes     = require('./modules/clients/clients.routes');
const salaryRoutes     = require('./modules/salary/salary.routes');
const attendanceRoutes = require('./modules/attendance/attendance.routes');
const leavesRoutes     = require('./modules/leaves/leaves.routes');
const shootsRoutes     = require('./modules/shoots/shoots.routes');
const tasksRoutes      = require('./modules/tasks/tasks.routes');
const dprRoutes        = require('./modules/dpr/dpr.routes');
const pdfRoutes        = require('./modules/pdf/pdf.routes');
const genericRoutes    = require('./modules/generic/generic.routes');
// C-1 FIX: New atomic business routes replacing replaceCollection
const businessRoutes   = require('./modules/generic/business.routes');
// PRM Module
const prmRoutes        = require('./modules/prm/prm.routes');
// Candidates Module (Public application routes)
const candidatesRoutes = require('./modules/candidates/candidates.routes');
// Influencer Campaigns Module (Link-based campaign registration)
const influencerCampaignRoutes = require('./modules/influencer-campaigns/influencerCampaign.routes');

const app = express();

// Security & parsing middleware
app.use(helmet({
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));
// M-9 FIX: Restrict CORS to known origins only, with optional allow-all override
const trimTrailingSlash = origin => origin?.replace(/\/+$|^\s+|\s+$/g, '');
const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:3000',
  'http://localhost:4173',
  'https://lenstalk-ops.vercel.app',
  process.env.FRONTEND_URL, // set in .env for production domain
].filter(Boolean).map(trimTrailingSlash);
const ALLOW_ALL_CORS = process.env.CORS_ALLOW_ALL === 'true';
const loginCors = cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
});
const generalCors = cors({
  origin: function (origin, callback) {
    // Allow server-to-server requests (no origin), allowed frontend origins, or opt-in global CORS
    if (!origin || ALLOW_ALL_CORS || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS: Origin ${origin} not allowed.`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
});

app.use((req, res, next) => {
  if (req.originalUrl === '/api/auth/login') {
    return loginCors(req, res, next);
  }
  return generalCors(req, res, next);
});
app.use(compression());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const rateLimit = require('express-rate-limit');
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // limit each IP to 500 requests per windowMs
  message: { message: 'Too many requests from this IP, please try again after 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ── API Routes ──────────────────────────────────────────
app.use('/api', globalLimiter);
app.use('/api/auth',        authRoutes);
app.use('/api/users',       userRoutes);
app.use('/api/employees',   employeeRoutes);
app.use('/api/clients',     clientRoutes);
app.use('/api/salary',      salaryRoutes);
app.use('/api/attendance',  attendanceRoutes);
app.use('/api/leaves',      leavesRoutes);
app.use('/api/shoots',      shootsRoutes);
app.use('/api/tasks',       tasksRoutes);
app.use('/api/dpr',         dprRoutes);
app.use('/api/pdf',         pdfRoutes);
// C-1 FIX: Atomic business routes (content-tasks, task-approvals, shoot-campaigns)
// NOTE: influencer-campaigns MUST be registered BEFORE businessRoutes (/api wildcard)
app.use('/api/influencer-campaigns',  influencerCampaignRoutes);
app.use('/api',                       businessRoutes);
app.use('/api/prm',                   prmRoutes);
app.use('/api/candidates',            candidatesRoutes);
app.use('/api/data',                  genericRoutes); // Generic router for misc schemaless data

// ── Public: Influencer Self-Registration (no auth required) ──────────────────
const getGenericModel = require('./modules/generic/generic.model');
app.post('/api/public/influencer-register', async (req, res) => {
  try {
    const {
      name, phone, email, whatsapp, isWhatsAppSame, isAgencyAccount, agency, notes,
      // New multi-platform fields
      platform,      // primary platform name
      platforms,     // array of all platform names
      handles,       // { Instagram: "@xyz", YouTube: "@abc" }
      followers,     // { Instagram: "45K", YouTube: "10K" }
      profileLinks,  // { Instagram: "https://..." }
      location,      // NEW: city/state
      niches,        // ["Lifestyle & Fashion", "Tech"]
      categories,    // ["Premium", "Standard"]
      // Legacy / extra fields
      baseRate, type,
      // Old flat fallbacks (in case old client sends them)
      handle: legacyHandle, followerCount: legacyFollowerCount, niche: legacyNiche,
    } = req.body;

    if (!name?.trim()) return res.status(400).json({ message: 'Full name is required.' });
    if (!phone?.trim()) return res.status(400).json({ message: 'Mobile number is required.' });

    const InfluencerModel = getGenericModel('lenstalk_influencers_v1');

    // ── Resolve primary platform & handle ────────────────────────────────────
    const primaryPlatform = platform || 'Instagram';
    const primaryHandle = (handles && handles[primaryPlatform])
      ? handles[primaryPlatform].trim()
      : (legacyHandle?.trim() || '');

    // ── Duplicate check: same primary handle OR same email ───────────────────
    const normalizedHandle = primaryHandle.toLowerCase().replace(/^@/, '');
    const duplicateQuery = [];
    if (normalizedHandle) {
      duplicateQuery.push({ handle: { $regex: new RegExp(`^@?${normalizedHandle}$`, 'i') } });
    }
    if (email?.trim()) {
      duplicateQuery.push({ email: { $regex: new RegExp(`^${email.trim()}$`, 'i') } });
    }
    if (duplicateQuery.length > 0) {
      const existing = await InfluencerModel.findOne({ $or: duplicateQuery });
      if (existing) {
        const field = existing.handle?.toLowerCase().replace(/^@/, '') === normalizedHandle
          ? 'social handle'
          : 'email address';
        return res.status(409).json({
          message: `This ${field} is already registered. If you believe this is an error, please contact us directly.`,
        });
      }
    }

    // ── Resolve WhatsApp ──────────────────────────────────────────────────────
    const resolvedWhatsApp = isWhatsAppSame ? phone.trim() : (whatsapp?.trim() || phone.trim());

    // ── Resolve backward-compat flat fields ───────────────────────────────────
    const resolvedFollowerCount = (followers && followers[primaryPlatform])
      ? followers[primaryPlatform]
      : (legacyFollowerCount || '');
    const resolvedNiche = (Array.isArray(niches) && niches.length > 0)
      ? niches[0]
      : (legacyNiche || 'Other');

    // ── Save document ─────────────────────────────────────────────────────────
    const doc = await InfluencerModel.create({
      name:             name.trim(),
      // Primary platform flat fields (backward compat for table display)
      handle:           primaryHandle.startsWith('@') ? primaryHandle : (primaryHandle ? `@${primaryHandle}` : ''),
      platform:         primaryPlatform,
      followerCount:    resolvedFollowerCount,
      niche:            resolvedNiche,
      // Full multi-platform structured data
      platforms:        Array.isArray(platforms) && platforms.length > 0 ? platforms : [primaryPlatform],
      handles:          handles || {},
      followers:        followers || {},
      profileLinks:     profileLinks || {},
      location:         location?.trim() || '',
      niches:           Array.isArray(niches) ? niches : [],
      categories:       Array.isArray(categories) ? categories : [],
      // Other fields
      baseRate:         baseRate || '',
      type:             type || 'micro',
      email:            email?.trim() || '',
      phone:            phone?.trim() || '',
      whatsapp:         resolvedWhatsApp,
      isAgencyAccount:  !!isAgencyAccount,
      agency:           agency?.trim() || '',
      registrationStatus: 'registered',
      status:           'active',
      notes:            notes?.trim() || '',
    });

    res.status(201).json({ message: 'Registration submitted successfully!', id: doc._id });
  } catch (err) {
    console.error('Public influencer registration error:', err);
    res.status(500).json({ message: 'Registration failed. Please try again.' });
  }
});


// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: `Route ${req.originalUrl} not found.` });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled Error:', err);
  res.status(err.status || 500).json({
    message: err.message || 'Internal server error.',
    ...(config.nodeEnv === 'development' && { stack: err.stack }),
  });
});

module.exports = app;
