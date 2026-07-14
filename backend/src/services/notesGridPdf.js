/**
 * Grille des notes d'une classe × matière × semestre — export PDF (A4 portrait,
 * UNE SEULE PAGE) en deux modes :
 *   • blank  : cellules vides → feuille de saisie manuelle papier
 *   • filled : notes saisies + moyenne par élève
 *
 * Généré côté backend avec PDFKit + NotoNaskhArabic (les noms de contrôles
 * الفرض/الأنشطة et les noms arabes d'élèves cassent avec jsPDF navigateur).
 * La hauteur des lignes est calculée pour que TOUS les élèves tiennent sur
 * une page (la police se réduit en conséquence).
 */

import PDFDocument from 'pdfkit';
import path from 'path';
import { fileURLToPath } from 'url';
import { drawSchoolLogo } from './schoolLogo.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ──── Police arabe (même fichier que bulletins/factures) ────────────────────
const ARABIC_FONT_PATH = path.join(__dirname, 'whatsapp', 'chatbot', 'fonts', 'NotoNaskhArabic-Regular.ttf');
const ARABIC_FONT_NAME = 'ArabicFont';
const ARABIC_RE = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;
const ARABIC_FEATURES = ['rtla', 'rclt'];

// Découpe un texte en segments alternés latin / arabe (NotoNaskhArabic n'a
// PAS de glyphes latins : un texte mixte rendu d'un bloc affiche des carrés).
function scriptRuns(text) {
  const t = String(text == null ? '' : text);
  const runs = [];
  for (const ch of t) {
    const isAr = ARABIC_RE.test(ch);
    const last = runs[runs.length - 1];
    // Les séparateurs (espaces, ·, chiffres…) suivent le segment en cours.
    if (last && (isAr === last.ar || /[\s0-9.,:/()\-]/.test(ch))) last.t += ch;
    else runs.push({ t: ch, ar: isAr });
  }
  return runs;
}

/**
 * Rend un texte mixte latin+arabe sur UNE ligne : chaque segment avec la bonne
 * police (latin = police `latinFont`, arabe = NotoNaskh + shaping RTL).
 * Supporte align left/center/right dans la largeur donnée (pas de retour ligne).
 */
function mixedLine(doc, text, x, y, { width, align = 'left', fontSize = 8, latinFont = 'Helvetica', color = null } = {}) {
  const runs = scriptRuns(text);
  if (!runs.length) return;
  const widths = runs.map(r => {
    doc.font(r.ar ? ARABIC_FONT_NAME : latinFont).fontSize(fontSize);
    return doc.widthOfString(r.t, r.ar ? { features: ARABIC_FEATURES } : {});
  });
  const total = widths.reduce((a, b) => a + b, 0);
  let cx = x;
  if (width && align === 'center') cx = x + Math.max(0, (width - total) / 2);
  else if (width && align === 'right') cx = x + Math.max(0, width - total);
  runs.forEach((r, i) => {
    doc.font(r.ar ? ARABIC_FONT_NAME : latinFont).fontSize(fontSize);
    if (color) doc.fillColor(color);
    doc.text(r.t, cx, y, { lineBreak: false, ...(r.ar ? { features: ARABIC_FEATURES } : {}) });
    cx += widths[i];
  });
}

// ──── Charte ────────────────────────────────────────────────────────────────
const C = {
  primary: '#4338ca', // indigo (thème Encre & Safran)
  ink:     '#111827',
  muted:   '#6b7280',
  line:    '#d1d5db',
  zebra:   '#f8fafc',
  bad:     '#dc2626',
};

const PAGE_W = 595.28; // A4 portrait
const PAGE_H = 841.89;
const MARGIN = 28;
const CONTENT_W = PAGE_W - 2 * MARGIN;
const FOOTER_H = 46; // date de génération + zone signature

const num2 = (v) => {
  const n = Number(v);
  if (isNaN(n)) return '';
  return (Math.round(n * 100) / 100).toString().replace('.', ',');
};

/**
 * Génère le PDF de la grille de notes (une seule page).
 * @param {object} p
 * @param {'blank'|'filled'} p.mode
 * @param {string} p.schoolName
 * @param {Buffer|null} p.logoBuffer
 * @param {string} p.className
 * @param {string} p.level
 * @param {string} p.subjectName
 * @param {1|2} p.semester
 * @param {string} p.academicYear
 * @param {Array}  p.students  [{ id, first_name, last_name, massar_code, import_order }]
 * @param {Array}  p.controls  [{ id, name, date }]
 * @param {Array}  p.notes     [{ control_id, student_id, note }] (mode filled)
 * @returns {Promise<Buffer>}
 */
export function generateNotesGridPdf({
  mode = 'blank', schoolName = '', logoBuffer = null,
  className = '', level = '', subjectName = '', semester = 1, academicYear = '',
  students = [], controls = [], notes = [],
}) {
  return new Promise((resolve, reject) => {
    try {
      const chunks = [];
      const doc = new PDFDocument({ size: 'A4', layout: 'portrait', margin: MARGIN, bufferPages: true });
      try { doc.registerFont(ARABIC_FONT_NAME, ARABIC_FONT_PATH); } catch (_) {}
      doc.on('data', c => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const filled = mode === 'filled';
      const noteByKey = {};
      if (filled) notes.forEach(n => { noteByKey[`${n.control_id}_${n.student_id}`] = n.note; });

      // ── En-tête du document ──
      let y = MARGIN;
      if (logoBuffer) {
        drawSchoolLogo(doc, logoBuffer, MARGIN, y, { fit: [34, 34], align: 'center', valign: 'center' });
      }
      const titleX = logoBuffer ? MARGIN + 42 : MARGIN;
      mixedLine(doc, schoolName || 'Grille des notes', titleX, y, {
        width: CONTENT_W - 50, fontSize: 13, latinFont: 'Helvetica-Bold', color: C.ink,
      });
      mixedLine(doc, `Grille des notes — ${subjectName}`, titleX, y + 16, {
        width: CONTENT_W - 50, fontSize: 11, latinFont: 'Helvetica-Bold', color: C.primary,
      });
      const sub = [
        `Classe : ${className}${level ? ` (${level})` : ''}`,
        `Semestre ${semester}`,
        academicYear ? `Année : ${academicYear}` : null,
      ].filter(Boolean).join('   —   ');
      mixedLine(doc, sub, titleX, y + 31, { width: CONTENT_W - 50, fontSize: 9, color: C.muted });
      doc.font('Helvetica').fontSize(8).fillColor(C.muted);
      doc.text(filled ? 'Relevé des notes saisies' : 'Feuille de saisie manuelle (0–20)',
        MARGIN, y + 2, { width: CONTENT_W, align: 'right' });
      y += 50;

      // ── Colonnes ──
      const nCtrl = Math.max(1, controls.length);
      const numW = 22;
      const avgW = 46;
      const ctrlW = Math.min(85, Math.max(40, (CONTENT_W - numW - avgW - 150) / nCtrl));
      const studentW = CONTENT_W - numW - avgW - ctrlW * nCtrl;

      // ── En-tête du tableau (noms des contrôles sur 2 lignes possibles) ──
      const THEAD_H = 30;
      doc.save();
      doc.rect(MARGIN, y, CONTENT_W, THEAD_H).fill(C.primary);
      doc.restore();
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(7.5);
      doc.text('N°', MARGIN, y + 11, { width: numW, align: 'center' });
      doc.text('Élève', MARGIN + numW + 3, y + 11, { width: studentW - 6 });
      let x = MARGIN + numW + studentW;
      for (const c of controls) {
        // Nom du contrôle sur 2 lignes : partie latine puis partie arabe
        // (« Contrôle 1 · الفرض 1 » → « Contrôle 1 » / « الفرض 1 »), chaque
        // segment dans sa police (NotoNaskh n'a pas de glyphes latins).
        doc.save();
        doc.rect(x, y, ctrlW, THEAD_H).clip();
        const parts = String(c.name || '').split('·').map(p => p.trim()).filter(Boolean);
        if (parts.length >= 2) {
          mixedLine(doc, parts[0], x + 2, y + 4, { width: ctrlW - 4, align: 'center', fontSize: 6.8, latinFont: 'Helvetica-Bold', color: '#ffffff' });
          mixedLine(doc, parts.slice(1).join(' '), x + 2, y + 15, { width: ctrlW - 4, align: 'center', fontSize: 7.5, latinFont: 'Helvetica-Bold', color: '#ffffff' });
        } else {
          mixedLine(doc, c.name, x + 2, y + 10, { width: ctrlW - 4, align: 'center', fontSize: 6.8, latinFont: 'Helvetica-Bold', color: '#ffffff' });
        }
        doc.restore();
        x += ctrlW;
      }
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#ffffff');
      doc.text('Moy.', x, y + 11, { width: avgW, align: 'center' });
      y += THEAD_H;

      // ── Corps : hauteur de ligne calculée pour tenir sur UNE page ──
      const availH = PAGE_H - MARGIN - FOOTER_H - y;
      const n = Math.max(1, students.length);
      const rowH = Math.min(24, availH / n);
      const fs = rowH >= 18 ? 8 : rowH >= 15 ? 7.4 : rowH >= 12 ? 6.8 : 6;
      const textY = (rowY) => rowY + (rowH - fs) / 2 - 1;

      students.forEach((s, idx) => {
        // Zébrure
        if (idx % 2 === 1) {
          doc.save();
          doc.rect(MARGIN, y, CONTENT_W, rowH).fill(C.zebra);
          doc.restore();
        }
        doc.font('Helvetica').fontSize(fs).fillColor(C.muted);
        doc.text(String(s.import_order ?? idx + 1), MARGIN, textY(y), { width: numW, align: 'center', lineBreak: false });
        doc.save();
        doc.rect(MARGIN + numW, y, studentW, rowH).clip();
        mixedLine(doc, `${s.last_name || ''} ${s.first_name || ''}`.trim(), MARGIN + numW + 3, textY(y), {
          width: studentW - 6, fontSize: fs, color: C.ink,
        });
        doc.restore();

        let cx = MARGIN + numW + studentW;
        const vals = [];
        for (const c of controls) {
          if (filled) {
            const v = noteByKey[`${c.id}_${s.id}`];
            if (v !== undefined && v !== null && v !== '') {
              const nv = Number(v);
              vals.push(nv);
              doc.font('Helvetica-Bold').fontSize(fs).fillColor(nv < 10 ? C.bad : C.ink);
              doc.text(num2(nv), cx, textY(y), { width: ctrlW, align: 'center', lineBreak: false });
            }
          }
          cx += ctrlW;
        }
        if (filled && vals.length) {
          const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
          doc.font('Helvetica-Bold').fontSize(fs).fillColor(avg < 10 ? C.bad : C.primary);
          doc.text(num2(avg), cx, textY(y), { width: avgW, align: 'center', lineBreak: false });
        }
        y += rowH;
      });

      // ── Quadrillage (indispensable pour la saisie papier) ──
      const tableTop = y - rowH * students.length - THEAD_H;
      const tableBottom = y;
      doc.save();
      doc.strokeColor(C.line).lineWidth(0.5);
      // horizontales
      for (let i = 0; i <= students.length; i++) {
        const ly = tableTop + THEAD_H + i * rowH;
        doc.moveTo(MARGIN, ly).lineTo(MARGIN + CONTENT_W, ly).stroke();
      }
      // verticales
      const xs = [MARGIN, MARGIN + numW, MARGIN + numW + studentW];
      for (let i = 1; i <= nCtrl; i++) xs.push(MARGIN + numW + studentW + i * ctrlW);
      xs.push(MARGIN + CONTENT_W);
      for (const lx of xs) {
        doc.moveTo(lx, tableTop).lineTo(lx, tableBottom).stroke();
      }
      doc.restore();

      // ── Pied de page : date + signature ──
      const fy = PAGE_H - MARGIN - 24;
      doc.font('Helvetica').fontSize(8).fillColor(C.muted);
      const gen = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
      doc.text(`Généré le ${gen} — ${students.length} élève(s)`, MARGIN, fy);
      doc.text('Signature :', MARGIN + CONTENT_W - 160, fy, { width: 60 });
      doc.save();
      doc.strokeColor(C.muted).lineWidth(0.6);
      doc.moveTo(MARGIN + CONTENT_W - 100, fy + 8).lineTo(MARGIN + CONTENT_W, fy + 8).stroke();
      doc.restore();

      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}
