/**
 * pdfHelper.js — shared PDF utilities
 * Provides a unified kop surat (letterhead) matching the Purchase Request layout.
 */

const fs    = require('fs');
const path  = require('path');
const https = require('https');
const http  = require('http');

const BULAN = ['Januari','Februari','Maret','April','Mei','Juni',
               'Juli','Agustus','September','Oktober','November','Desember'];

/**
 * Format a Date/ISO-string to "d MMMM YYYY" in Bahasa Indonesia.
 */
const fmtDateID = (d) => {
  const dt = new Date(d);
  return `${dt.getDate()} ${BULAN[dt.getMonth()]} ${dt.getFullYear()}`;
};

/**
 * Convert a full URL → local filesystem path.
 */
const urlToFilePath = (url) => {
  try {
    const pathname = new URL(url).pathname;
    return path.join(process.cwd(), pathname);
  } catch (_) { return null; }
};

/**
 * Fetch an image URL and return a Buffer.
 * Returns null on any error (404, network, etc.)
 */
const fetchImageBuffer = (url) => new Promise((resolve) => {
  try {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, { timeout: 5000 }, (res) => {
      if (res.statusCode !== 200) { res.resume(); resolve(null); return; }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', () => resolve(null));
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  } catch (_) { resolve(null); }
});

/**
 * Load an image — tries filesystem first, falls back to HTTP fetch.
 * Returns a file path string OR Buffer, or null if unavailable.
 */
const loadImage = async (url) => {
  if (!url) return null;
  // 1) Try filesystem
  const filePath = urlToFilePath(url);
  if (filePath && fs.existsSync(filePath)) return filePath;
  // 2) Fallback: fetch via HTTP (same container)
  const buf = await fetchImageBuffer(url);
  return buf || null;
};

/**
 * drawKopSurat (async)
 * Draws the standard company letterhead on the current PDFKit page.
 *
 * @param {PDFDocument} doc       – PDFKit document
 * @param {object}      settings  – CompanySetting record
 * @param {string}      backendUrl – e.g. "http://localhost:5000"
 * @param {number}      ML        – left/right margin (default 50)
 * @returns {number} y            – cursor Y after the divider + ready for title
 */
const drawKopSurat = async (doc, settings, backendUrl, ML = 50) => {
  const PW     = doc.page.width - ML * 2;
  const DARK   = '#1a1a1a';
  const GRAY   = '#555555';
  const BORDER = '#333333';

  let y     = 45;
  let logoW = 0;

  // ── Logo ────────────────────────────────────────────────────────────────────
  if (settings.companyLogo) {
    const logoUrl = settings.companyLogo.startsWith('http')
      ? settings.companyLogo
      : `${backendUrl}${settings.companyLogo}`;
    const imgSource = await loadImage(logoUrl);
    if (imgSource) {
      try {
        doc.image(imgSource, ML, y, { fit: [65, 65] });
        logoW = 75;
      } catch (_) {}
    }
  }

  const nameX = ML + logoW;
  const nameW = PW  - logoW;

  // ── Company name ───────────────────────────────────────────────────────────
  doc.font('Helvetica-Bold').fontSize(16).fillColor(DARK)
     .text(settings.companyName || 'IT Support', nameX, y + 4, { width: nameW });

  // ── Address ────────────────────────────────────────────────────────────────
  const addrParts = [settings.companyAddress, settings.companyCity].filter(Boolean);
  if (addrParts.length) {
    doc.font('Helvetica').fontSize(8).fillColor(GRAY)
       .text(addrParts.join(', '), nameX, y + 24, { width: nameW });
  }

  // ── Phone / Email ──────────────────────────────────────────────────────────
  if (settings.companyPhone || settings.companyEmail) {
    const contact = [
      settings.companyPhone ? `Telp: ${settings.companyPhone}` : '',
      settings.companyEmail ? `Email: ${settings.companyEmail}` : '',
    ].filter(Boolean).join('  |  ');
    doc.font('Helvetica').fontSize(8).fillColor(GRAY)
       .text(contact, nameX, y + 36, { width: nameW });
  }

  y = 118;

  // ── Double divider ─────────────────────────────────────────────────────────
  doc.moveTo(ML, y).lineTo(ML + PW, y).strokeColor(BORDER).lineWidth(2).stroke();
  y += 2;
  doc.moveTo(ML, y).lineTo(ML + PW, y).strokeColor(BORDER).lineWidth(0.5).stroke();
  y += 14;

  return y;
};

/**
 * drawDocTitle
 * Draws a centred, underlined document title (bold 16 pt) matching the PR style.
 */
const drawDocTitle = (doc, title, y, ML = 50) => {
  const PW   = doc.page.width - ML * 2;
  const DARK = '#1a1a1a';

  doc.font('Helvetica-Bold').fontSize(16).fillColor(DARK);
  const titleW = doc.widthOfString(title);
  const titleX = ML + (PW - titleW) / 2;
  doc.text(title, titleX, y);

  doc.moveTo(titleX, y + 19).lineTo(titleX + titleW, y + 19)
     .strokeColor(DARK).lineWidth(1.5).stroke();

  return y + 34;
};

module.exports = { drawKopSurat, drawDocTitle, fmtDateID, urlToFilePath, loadImage };
