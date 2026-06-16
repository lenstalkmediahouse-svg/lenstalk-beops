const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { login, getMe, logout } = require('./auth.controller');
const { authenticate } = require('../../middleware/auth');
const User = require('../users/user.model');
const PasswordReset = require('./passwordReset.model');
const { sendPasswordResetEmail } = require('../../utils/mailer');

// forgotLimiter: max 3 password reset requests per IP per 30 minutes
const forgotLimiter = rateLimit({
  windowMs: 30 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many reset requests. Please wait 30 minutes.' },
});

// NOTE: loginLimiter is applied globally in app.js (20 req/15min per IP).
// No additional limiter needed here.
router.post('/login', login);
router.get('/me', authenticate, getMe);
router.post('/logout', authenticate, logout);

/**
 * POST /api/auth/forgot-password
 * Sends a reset link to the super_admin's registered email.
 * Always returns 200 to avoid email enumeration attacks.
 */
router.post('/forgot-password', forgotLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email is required.' });

    const enteredEmail = email.toLowerCase().trim();
    const configuredEmail = (process.env.EMAIL_USER || '').toLowerCase().trim();

    // Find the super_admin user (there is only one in the system)
    const user = await User.findOne({ primaryRole: 'super_admin' });

    // MED-8 FIX: Always return 200 to prevent user enumeration attacks.
    // We silently exit without sending an email if validation fails.
    if (!user) {
      return res.json({ message: `If a Super Admin account exists for this email, a reset link has been sent. Check your inbox.` });
    }

    // Validate: entered email must match EITHER the DB stored email OR the configured Gmail (EMAIL_USER)
    const dbEmail = (user.email || '').toLowerCase().trim();
    const emailMatches = enteredEmail === dbEmail || enteredEmail === configuredEmail;

    if (!emailMatches) {
      return res.json({ message: `If a Super Admin account exists for this email, a reset link has been sent. Check your inbox.` });
    }

    // Invalidate any existing tokens for this user
    await PasswordReset.deleteMany({ userId: user._id });

    // Validate email config before attempting to send
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      console.error('[Forgot Password] EMAIL_USER or EMAIL_PASS env vars are not set on server.');
      return res.status(500).json({ message: 'Email service is not configured on the server. Please contact the system administrator.' });
    }

    // Generate a secure random token
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = await bcrypt.hash(rawToken, 10);

    await PasswordReset.create({
      userId: user._id,
      tokenHash,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes
    });

    // Use production FRONTEND_URL from env — never fall back to localhost in prod
    const frontendBase = process.env.FRONTEND_URL || 'http://localhost:5173';
    const resetLink = `${frontendBase}/reset-password/${rawToken}_${user._id}`;

    // Always send to EMAIL_USER (Gmail) — reliable delivery regardless of DB email
    const sendTo = configuredEmail || dbEmail;
    console.log(`[Forgot Password] Sending reset to: ${sendTo} (userId: ${user._id})`);
    console.log(`[Forgot Password] FRONTEND_URL resolved to: ${frontendBase}`);
    console.log(`[Forgot Password] Reset link: ${resetLink}`);

    try {
      await sendPasswordResetEmail(sendTo, resetLink, user.name, String(user._id), user.loginId || '');
      console.log(`[Forgot Password] Email sent successfully to ${sendTo}`);
    } catch (emailErr) {
      console.error('[Forgot Password] Email send FAILED:', emailErr.message);
      // Clean up the token so it can't be used without the email being delivered
      await PasswordReset.findOneAndDelete({ userId: user._id });
      return res.status(500).json({ message: `Failed to send reset email: ${emailErr.message}. Please check server email configuration.` });
    }

    res.json({ message: `Reset link sent to ${sendTo}. Check your inbox — link expires in 30 minutes.` });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
});

/**
 * POST /api/auth/reset-password
 * Validates the token and updates the user's password.
 * Token format: <rawToken>_<userId>
 */
router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) return res.status(400).json({ message: 'Token and new password are required.' });
    if (newPassword.length < 8) return res.status(400).json({ message: 'Password must be at least 8 characters.' });

    // Parse token format: rawToken_userId
    const lastUnderscore = token.lastIndexOf('_');
    if (lastUnderscore === -1) return res.status(400).json({ message: 'Invalid reset token format.' });

    const rawToken = token.substring(0, lastUnderscore);
    const userId   = token.substring(lastUnderscore + 1);

    const resetRecord = await PasswordReset.findOne({ userId, used: false, expiresAt: { $gt: new Date() } });
    if (!resetRecord) return res.status(400).json({ message: 'Reset link has expired or already been used. Please request a new one.' });

    const valid = await bcrypt.compare(rawToken, resetRecord.tokenHash);
    if (!valid) return res.status(400).json({ message: 'Invalid reset token.' });

    const user = await User.findById(userId);
    if (!user || user.primaryRole !== 'super_admin') return res.status(403).json({ message: 'Access denied.' });

    // Update password (pre-save hook will hash it)
    user.passwordHash = newPassword;
    await user.save();

    // Mark token as used
    await PasswordReset.findByIdAndDelete(resetRecord._id);

    res.json({ message: 'Password reset successfully. You can now log in with your new password.' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;
