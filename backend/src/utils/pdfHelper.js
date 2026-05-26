/**
 * pdfHelper.js — shared PDF utilities
 * Provides a unified kop surat (letterhead) matching the Purchase Request layout.
 */

const fs   = require('fs');
const path = require('path');

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
 * drawKopSurat
 * Draws the standard company letterhead on the current PDFKit page,
 * identical to the Purchase Request PDF layout.
 *
 * @param {PDFDocument} doc       – PDFKit document
 * @param {object}      settings  – CompanySetting record
 * @param {string}      backendUrl – e.g. "http://localhost:5000"
 * @param {number}      ML        – left/right margin (default 50)
 * @returns {number} y            – cursor Y after the divider + ready for title
 */
const drawKopSurat = (doc, settings, backendUrl, ML = 50) => {
  const PW     = doc.page.width - ML * 2;
  const DARK   = '#1a1a1a';
  const GRAY   = '#555555';
  const BORDER = '#333333';

  let y     = 45;
  let logoW = 0;

  // ── Logo ────────────────────────────────────────────────────────────────────
  if (settings.companyLogo) {
    const logoPath = urlToFilePath(`${backendUrl}${settings.companyLogo}`);
    if (logoPath && fs.existsSync(logoPath)) {
      try {
        doc.image(logoPath, ML, y, { fit: [65, 65] });
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

  return y; // caller places the document title from here
};

/**
 * drawDocTitle
 * Draws a centred, underlined document title (bold 16 pt) matching the PR style.
 *
 * @param {PDFDocument} doc
 * @param {string}      title  – e.g. "SURAT PURCHASE ORDER"
 * @param {number}      y      – top of the title text
 * @param {number}      ML     – left margin
 * @returns {number}           – y after title + underline
 */
const drawDocTitle = (doc, title, y, ML = 50) => {
  const PW   = doc.page.width - ML * 2;
  const DARK = '#1a1a1a';

  doc.font('Helvetica-Bold').fontSize(16).fillColor(DARK);
  const titleW = doc.widthOfString(title);
  const titleX = ML + (PW - titleW) / 2;
  doc.text(title, titleX, y);

  // manual underline
  doc.moveTo(titleX, y + 19).lineTo(titleX + titleW, y + 19)
     .strokeColor(DARK).lineWidth(1.5).stroke();

  return y + 34;
};

module.exports = { drawKopSurat, drawDocTitle, fmtDateID, urlToFilePath };
