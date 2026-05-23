const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,  // Gmail App Password (not account password)
  },
});

/**
 * Send a password reset email to the Super Admin.
 * @param {string} toEmail    - Recipient email
 * @param {string} resetLink  - Full URL with reset token
 * @param {string} userName   - Recipient display name
 * @param {string} userId     - Super Admin user ID (for security reference)
 * @param {string} loginId    - Super Admin login ID (for security reference)
 */
async function sendPasswordResetEmail(toEmail, resetLink, userName = 'Super Admin', userId = '', loginId = '') {
  const mailOptions = {
    from: process.env.MAIL_FROM || `"Lenstalk OS" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject: 'Lenstalk OS — Password Reset Request',
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Password Reset</title>
</head>
<body style="margin:0;padding:0;background:#f4f7fb;font-family:'Inter',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f7fb;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#1a1a2e 0%,#16213e 100%);padding:32px 40px;text-align:center;">
            <div style="font-size:24px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">Lenstalk<span style="color:#0099D9;">.</span>OS</div>
            <div style="font-size:12px;color:#94a3b8;margin-top:4px;letter-spacing:2px;text-transform:uppercase;">Media OS Workspace</div>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:40px;">
            <div style="font-size:20px;font-weight:700;color:#1a1a2e;margin-bottom:12px;">Password Reset Request</div>
            <p style="font-size:14px;color:#475569;line-height:1.7;margin:0 0 16px;">
              Hi <strong>${userName}</strong>,
            </p>
            <p style="font-size:14px;color:#475569;line-height:1.7;margin:0 0 24px;">
              We received a request to reset the password for your <strong>Super Admin</strong> account on Lenstalk OS. Click the button below to set a new password.
            </p>
            <!-- CTA Button -->
            <div style="text-align:center;margin:32px 0;">
              <a href="${resetLink}" style="display:inline-block;background:linear-gradient(135deg,#2196F3,#1565C0);color:#ffffff;text-decoration:none;padding:14px 36px;border-radius:10px;font-size:15px;font-weight:700;letter-spacing:0.3px;">
                Reset My Password →
              </a>
            </div>
            <!-- Warning box -->
            <div style="background:#FFF8F0;border:1px solid #FED7AA;border-radius:10px;padding:14px 18px;margin:24px 0;">
              <div style="font-size:12px;font-weight:700;color:#9A3412;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px;">⚠ Security Notice</div>
              <div style="font-size:13px;color:#7C2D12;line-height:1.6;">
                This link expires in <strong>30 minutes</strong>. If you did not request this reset, please ignore this email — your password remains unchanged.
              </div>
            </div>
            <!-- Security Reference Block -->
            <div style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:10px;padding:14px 18px;margin:20px 0;">
              <div style="font-size:11px;font-weight:700;color:#1D4ED8;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px;">🔐 Account Security Reference</div>
              <table style="width:100%;border-collapse:collapse;">
                ${userName ? `<tr><td style="font-size:12px;color:#64748B;padding:2px 0;">Account Name</td><td style="font-size:12px;font-weight:700;color:#1e40af;font-family:monospace;">${userName}</td></tr>` : ''}
                ${loginId ? `<tr><td style="font-size:12px;color:#64748B;padding:2px 0;">Login ID</td><td style="font-size:12px;font-weight:700;color:#1e40af;font-family:monospace;">${loginId}</td></tr>` : ''}
                ${userId ? `<tr><td style="font-size:12px;color:#64748B;padding:2px 0;">User ID</td><td style="font-size:12px;font-weight:700;color:#1e40af;font-family:monospace;">${userId}</td></tr>` : ''}
              </table>
            </div>
            <!-- Footer info -->
            <div style="border-top:1px solid #E2E8F0;padding-top:20px;margin-top:24px;">
              <p style="font-size:12px;color:#94a3b8;line-height:1.6;margin:0;">
                If the button above doesn't work, copy and paste this link into your browser:<br>
                <a href="${resetLink}" style="color:#2196F3;word-break:break-all;">${resetLink}</a>
              </p>
            </div>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#f8fafc;padding:20px 40px;text-align:center;border-top:1px solid #E2E8F0;">
            <div style="font-size:12px;color:#94a3b8;">© ${new Date().getFullYear()} Lenstalk Media. All rights reserved.</div>
            <div style="font-size:11px;color:#CBD5E1;margin-top:4px;">This is an automated security email. Do not reply.</div>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  };

  return transporter.sendMail(mailOptions);
}

module.exports = { sendPasswordResetEmail };
