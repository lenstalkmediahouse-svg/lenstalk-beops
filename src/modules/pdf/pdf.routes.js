const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/auth');

/**
 * POST /api/pdf/download
 * 
 * Accepts a base64-encoded PDF from the frontend and echoes it back
 * with proper Content-Disposition headers to force browser download
 * with the correct filename. This solves Safari's refusal to honor
 * the `download` attribute on blob: URLs.
 * 
 * Body: { data: "<base64 PDF string>", filename: "Report.pdf" }
 */
router.post('/download', authenticate, (req, res) => {
  try {
    const { data, filename } = req.body;

    if (!data || !filename) {
      return res.status(400).json({ message: 'Missing data or filename' });
    }

    // Strip data URI prefix if present (e.g. "data:application/pdf;base64,...")
    const base64Data = data.includes(',') ? data.split(',')[1] : data;
    const pdfBuffer = Buffer.from(base64Data, 'base64');

    const safeName = filename.endsWith('.pdf') ? filename : filename + '.pdf';

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${safeName}"`,
      'Content-Length': pdfBuffer.length,
      'Cache-Control': 'no-store',
    });

    res.send(pdfBuffer);
  } catch (err) {
    console.error('[PDF Proxy] Error:', err.message);
    res.status(500).json({ message: 'PDF download failed' });
  }
});

module.exports = router;
