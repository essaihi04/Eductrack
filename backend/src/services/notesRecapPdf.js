/**
 * Récap d'UN contrôle pour TOUTES les matières d'une classe — export PDF
 * (A4 paysage, une seule page) : lignes = élèves, colonnes = matières.
 *
 * Seules les matières transmises dans `columns` sont dessinées : une matière
 * qui n'a pas ce contrôle (ex. arrêt au contrôle 2) n'a pas de colonne.
 *
 * Généré côté backend avec PDFKit + NotoNaskhArabic : les noms de matières et
 * d'élèves en arabe cassent avec jsPDF navigateur.
 */

import PDFDocument from 'pdfkit';
import { drawSchoolLogo } from './schoolLogo.js';
import { mixedLine, registerArabicFont } from './pdfText.js';

// ──── Charte (thème Encre & Safran) ─────────────────────────────────────────
const C = {
  primary: '#4338ca',
  accent:  '#b45309',
  ink:     '#111827',
  muted:   '#6b7280',
  line:    '#d1d5db',
  zebra:   '#f8fafc',
  head:    '#eef2ff',
  bad:     '#dc2626',
  good:    '#059669',
};

const PAGE_W = 841.89; // A4 paysage
const PAGE_H = 595.28;
const MARGIN = 26;
const CONTENT_W = PAGE_W - 2 * MARGIN;
const FOOTER_H = 44;

const num2 = (v) => {
  const n = Number(v);
  if (isNaN(n)) return '';
  return (Math.round(n * 100) / 100).toFixed(2).replace('.', ',');
};
const fmtDate = (d) => {
  if (!d) return '';
  const dt = new Date(`${String(d).slice(0, 10)}T00:00:00Z`);
  return isNaN(dt.getTime()) ? '' : dt.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
};

/**
 * Génère le PDF du récap d'un contrôle (toutes matières).
 * @param {object} p
 * @param {string} p.schoolName
 * @param {Buffer|null} p.logoBuffer
 * @param {string} p.className
 * @param {string} p.level
 * @param {string} p.filiere
 * @param {1|2}    p.semester
 * @param {string} p.academicYear
 * @param {string} p.controlLabel   ex. « Contrôle 1 · الفرض 1 »
 * @param {string} p.controlDate    date la plus ancienne du contrôle (ISO)
 * @param {Array}  p.students  [{ id, first_name, last_name, massar_code, import_order }]
 * @param {Array}  p.columns   [{ control_id, subject_name, coefficient }]
 * @param {Array}  p.notes     [{ control_id, student_id, note }]
 * @returns {Promise<Buffer>}
 */
export function generateNotesRecapPdf({
  schoolName = '', logoBuffer = null, className = '', level = '', filiere = '',
  semester = 1, academicYear = '', controlLabel = '', controlDate = null,
  students = [], columns = [], notes = [],
}) {
  return new Promise((resolve, reject) => {
    try {
      const chunks = [];
      const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: MARGIN, bufferPages: true });
      registerArabicFont(doc);
      doc.on('data', c => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const noteByKey = {};
      notes.forEach(n => { noteByKey[`${n.control_id}_${n.student_id}`] = n.note; });
      const weighted = columns.some(c => Number(c.coefficient) !== 1);

      // ── En-tête ──
      let y = MARGIN;
      if (logoBuffer) {
        drawSchoolLogo(doc, logoBuffer, MARGIN, y, { fit: [38, 38], align: 'center', valign: 'center' });
      }
      const titleX = logoBuffer ? MARGIN + 46 : MARGIN;
      mixedLine(doc, schoolName || 'Établissement', titleX, y, {
        width: CONTENT_W - 220, fontSize: 13, latinFont: 'Helvetica-Bold', color: C.ink,
      });
      mixedLine(doc, `Récapitulatif des notes — ${controlLabel}`, titleX, y + 17, {
        width: CONTENT_W - 220, fontSize: 11.5, latinFont: 'Helvetica-Bold', color: C.primary,
      });
      const sub = [
        `Classe : ${className}${level ? ` (${level})` : ''}`,
        filiere ? `Filière : ${filiere}` : null,
        `Semestre ${semester}`,
        academicYear ? `Année scolaire : ${academicYear}` : null,
        `${columns.length} matière${columns.length > 1 ? 's' : ''}`,
      ].filter(Boolean).join('   —   ');
      mixedLine(doc, sub, titleX, y + 33, { width: CONTENT_W - 60, fontSize: 9, color: C.muted });
      doc.font('Helvetica').fontSize(8).fillColor(C.muted);
      doc.text(controlDate ? `Date du contrôle : ${fmtDate(controlDate)}` : '', MARGIN, y + 2,
        { width: CONTENT_W, align: 'right' });
      y += 52;

      // ── Colonnes ──
      const nCol = Math.max(1, columns.length);
      const numW = 20;
      const avgW = 48;
      const colW = Math.min(70, Math.max(30, (CONTENT_W - numW - avgW - 170) / nCol));
      const studentW = CONTENT_W - numW - avgW - colW * nCol;

      // ── En-tête du tableau (nom de la matière + coefficient) ──
      const THEAD_H = 34;
      doc.save();
      doc.rect(MARGIN, y, CONTENT_W, THEAD_H).fill(C.primary);
      doc.restore();
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(7.5);
      doc.text('N°', MARGIN, y + 13, { width: numW, align: 'center' });
      doc.text('Élève', MARGIN + numW + 3, y + 13, { width: studentW - 6 });

      let x = MARGIN + numW + studentW;
      for (const col of columns) {
        doc.save();
        doc.rect(x, y, colW, THEAD_H).clip();
        // Le nom peut être long ou arabe → on réduit la police si nécessaire.
        const label = String(col.subject_name || '');
        const fs = label.length > 16 ? 5.8 : label.length > 11 ? 6.6 : 7.4;
        mixedLine(doc, label, x + 1, y + (weighted ? 8 : 13), {
          width: colW - 2, align: 'center', fontSize: fs, latinFont: 'Helvetica-Bold', color: '#ffffff',
        });
        if (weighted) {
          doc.font('Helvetica').fontSize(6).fillColor('#c7d2fe');
          doc.text(`Coef. ${num2(col.coefficient).replace(',00', '')}`, x + 1, y + 22, { width: colW - 2, align: 'center', lineBreak: false });
        }
        doc.restore();
        x += colW;
      }
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#ffffff');
      doc.text('Moyenne', x, y + 13, { width: avgW, align: 'center' });
      y += THEAD_H;

      // ── Corps : hauteur de ligne calculée pour tenir sur UNE page ──
      // (+1 ligne pour la moyenne de la classe en bas du tableau)
      const availH = PAGE_H - MARGIN - FOOTER_H - y;
      const n = Math.max(1, students.length) + 1;
      const rowH = Math.min(22, availH / n);
      const fs = rowH >= 18 ? 8 : rowH >= 15 ? 7.4 : rowH >= 12 ? 6.8 : 6;
      const textY = (rowY) => rowY + (rowH - fs) / 2 - 1;
      const tableTop = y;

      // Cumuls par matière pour la moyenne de la classe
      const sumByCtrl = {};
      const cntByCtrl = {};

      students.forEach((s, idx) => {
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
        let sum = 0;
        let coefSum = 0;
        for (const col of columns) {
          const v = noteByKey[`${col.control_id}_${s.id}`];
          if (v !== undefined && v !== null && v !== '') {
            const nv = Number(v);
            const k = Number(col.coefficient) || 1;
            sum += nv * k;
            coefSum += k;
            sumByCtrl[col.control_id] = (sumByCtrl[col.control_id] || 0) + nv;
            cntByCtrl[col.control_id] = (cntByCtrl[col.control_id] || 0) + 1;
            doc.font('Helvetica-Bold').fontSize(fs).fillColor(nv < 10 ? C.bad : C.ink);
            doc.text(num2(nv), cx, textY(y), { width: colW, align: 'center', lineBreak: false });
          } else {
            // Note manquante pour CET élève dans une matière qui a le contrôle.
            doc.font('Helvetica').fontSize(fs).fillColor(C.line);
            doc.text('—', cx, textY(y), { width: colW, align: 'center', lineBreak: false });
          }
          cx += colW;
        }
        if (coefSum > 0) {
          const avg = sum / coefSum;
          doc.font('Helvetica-Bold').fontSize(fs).fillColor(avg < 10 ? C.bad : C.good);
          doc.text(num2(avg), cx, textY(y), { width: avgW, align: 'center', lineBreak: false });
        }
        y += rowH;
      });

      // ── Ligne « Moyenne de la classe » ──
      const classRowY = y;
      doc.save();
      doc.rect(MARGIN, classRowY, CONTENT_W, rowH).fill(C.head);
      doc.restore();
      doc.font('Helvetica-Bold').fontSize(fs).fillColor(C.primary);
      doc.text('Moyenne de la classe', MARGIN + numW + 3, textY(classRowY), { width: studentW - 6, lineBreak: false });
      let cx = MARGIN + numW + studentW;
      let gSum = 0;
      let gCoef = 0;
      for (const col of columns) {
        const cnt = cntByCtrl[col.control_id] || 0;
        if (cnt) {
          const avg = sumByCtrl[col.control_id] / cnt;
          const k = Number(col.coefficient) || 1;
          gSum += avg * k;
          gCoef += k;
          doc.font('Helvetica-Bold').fontSize(fs).fillColor(avg < 10 ? C.bad : C.primary);
          doc.text(num2(avg), cx, textY(classRowY), { width: colW, align: 'center', lineBreak: false });
        }
        cx += colW;
      }
      if (gCoef > 0) {
        doc.font('Helvetica-Bold').fontSize(fs).fillColor(C.accent);
        doc.text(num2(gSum / gCoef), cx, textY(classRowY), { width: avgW, align: 'center', lineBreak: false });
      }
      y += rowH;

      // ── Quadrillage ──
      const tableBottom = y;
      doc.save();
      doc.strokeColor(C.line).lineWidth(0.5);
      for (let i = 0; i <= students.length + 1; i++) {
        const ly = tableTop + i * rowH;
        doc.moveTo(MARGIN, ly).lineTo(MARGIN + CONTENT_W, ly).stroke();
      }
      const xs = [MARGIN, MARGIN + numW, MARGIN + numW + studentW];
      for (let i = 1; i <= nCol; i++) xs.push(MARGIN + numW + studentW + i * colW);
      xs.push(MARGIN + CONTENT_W);
      for (const lx of xs) {
        doc.moveTo(lx, tableTop - THEAD_H).lineTo(lx, tableBottom).stroke();
      }
      doc.restore();

      // ── Pied de page ──
      const fy = PAGE_H - MARGIN - 24;
      doc.font('Helvetica').fontSize(7.5).fillColor(C.muted);
      const gen = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
      doc.text(
        `Généré le ${gen} — ${students.length} élève(s) · ${weighted ? 'moyenne pondérée par les coefficients' : 'moyenne simple'}`
        + ' · les matières sans ce contrôle ne sont pas affichées',
        MARGIN, fy, { width: CONTENT_W - 180 },
      );
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
