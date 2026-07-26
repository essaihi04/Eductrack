/**
 * Génération du PDF « fournitures scolaires » envoyé au parent sur WhatsApp.
 *
 * Le parent ne reçoit JAMAIS le PDF importé par l'école (qui couvre tous les
 * niveaux) : on régénère ici un document propre, aux couleurs de l'école
 * (logo + nom), contenant UNIQUEMENT le niveau demandé.
 *
 * Mise en page : bandeau d'en-tête, badge de niveau, articles regroupés par
 * catégorie avec cases à cocher, encadré de consignes, pied de page paginé.
 */

import PDFDocument from 'pdfkit';
import { supabaseAdmin } from '../../../config/supabase.js';
import { fetchSchoolLogoBuffer, drawSchoolLogo } from '../../schoolLogo.js';
import { registerArabicFont, hasArabic, smartText, smartMixedText, ARABIC_FONT_NAME } from './pdfText.js';

// Palette « Encre & Safran » (thème de l'application)
const INK = '#1E1B4B';
const INDIGO = '#4338CA';
const INDIGO_SOFT = '#EEF2FF';
const SAFRAN = '#F59E0B';
const SAFRAN_SOFT = '#FEF3C7';
const SLATE = '#475569';
const MUTED = '#94A3B8';
const BORDER = '#E2E8F0';
const WHITE = '#FFFFFF';

const PAGE_MARGIN = 40;
const HEADER_H = 104;

/** Nom de fichier sûr (WhatsApp + systèmes de fichiers). */
function safeFileName(parts) {
  return parts
    .filter(Boolean)
    .join('_')
    .normalize('NFD')
    .replace(/[^\w\-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 80);
}

function fmtDate(d) {
  try {
    return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  } catch (_) {
    return '';
  }
}

/** Hauteur nécessaire pour un texte, police choisie selon la langue. */
function measure(doc, text, width, size) {
  const base = doc._font?.name || 'Helvetica';
  if (hasArabic(text)) { try { doc.font(ARABIC_FONT_NAME); } catch (_) { /* police latine */ } }
  doc.fontSize(size);
  const h = doc.heightOfString(String(text || ''), { width });
  try { doc.font(base); } catch (_) { doc.font('Helvetica'); }
  return h;
}

/** Rectangle arrondi rempli (+ bordure optionnelle). */
function card(doc, x, y, w, h, { fill, stroke, radius = 8 } = {}) {
  doc.roundedRect(x, y, w, h, radius);
  if (fill && stroke) doc.fillAndStroke(fill, stroke);
  else if (fill) doc.fill(fill);
  else if (stroke) doc.stroke(stroke);
}

/**
 * Bandeau d'en-tête (répété sur chaque page) : logo, nom de l'école,
 * coordonnées et année scolaire.
 */
function drawHeader(doc, { school, logoBuffer, academicYear }) {
  const pageW = doc.page.width;

  doc.rect(0, 0, pageW, HEADER_H).fill(INK);
  doc.rect(0, HEADER_H, pageW, 5).fill(SAFRAN);

  // Pastille blanche + logo (ou initiales si l'école n'a pas de logo)
  const logoBox = { x: PAGE_MARGIN, y: 21, size: 62 };
  card(doc, logoBox.x, logoBox.y, logoBox.size, logoBox.size, { fill: WHITE, radius: 12 });
  const drawn = drawSchoolLogo(doc, logoBuffer, logoBox.x + 6, logoBox.y + 6, {
    fit: [logoBox.size - 12, logoBox.size - 12], align: 'center', valign: 'center',
  });
  if (!drawn) {
    const initials = String(school.name || 'É').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
    doc.fillColor(INDIGO).fontSize(22);
    smartText(doc, initials, logoBox.x, logoBox.y + 20, { width: logoBox.size, align: 'center' });
  }

  const textX = PAGE_MARGIN + logoBox.size + 16;
  const textW = pageW - textX - PAGE_MARGIN - 110;
  doc.fillColor(WHITE).fontSize(18);
  smartMixedText(doc, school.name || 'École', textX, 30, { width: textW, lineBreak: false });
  doc.fillColor('#C7D2FE').fontSize(9);
  const contact = [school.address, school.phone && `Tél. ${school.phone}`, school.email].filter(Boolean).join('  •  ');
  if (contact) smartMixedText(doc, contact, textX, 56, { width: textW, lineBreak: false });

  // Badge année scolaire, aligné à droite
  if (academicYear) {
    const badgeW = 96;
    const badgeX = pageW - PAGE_MARGIN - badgeW;
    card(doc, badgeX, 34, badgeW, 26, { fill: '#312E81', stroke: '#6366F1', radius: 13 });
    doc.fillColor(WHITE).fontSize(10);
    doc.text(`Année ${academicYear}`, badgeX, 42, { width: badgeW, align: 'center' });
  }
}

/** Pied de page (appelé sur chaque page à la fin, quand la pagination est connue). */
function drawFooter(doc, { school, levelLabel, pageNumber, pageCount }) {
  const y = doc.page.height - 46;
  const w = doc.page.width - 2 * PAGE_MARGIN;

  // Écrire sous la marge basse ferait ajouter une page vide par PDFKit :
  // on neutralise la marge le temps de dessiner le pied de page.
  const savedBottom = doc.page.margins.bottom;
  doc.page.margins.bottom = 0;

  doc.moveTo(PAGE_MARGIN, y).lineTo(PAGE_MARGIN + w, y).strokeColor(BORDER).lineWidth(1).stroke();
  doc.fontSize(8).fillColor(MUTED);
  smartMixedText(doc, `${school.name || 'École'} — Fournitures ${levelLabel}`, PAGE_MARGIN, y + 8, {
    width: w * 0.7, lineBreak: false,
  });
  doc.fillColor(MUTED).fontSize(8);
  doc.text(`Page ${pageNumber}/${pageCount}`, PAGE_MARGIN + w * 0.7, y + 8, { width: w * 0.3, align: 'right' });

  doc.page.margins.bottom = savedBottom;
}

/**
 * Construit le PDF d'un niveau.
 *
 * @param {object} p
 * @param {object} p.school        { name, address, phone, email, logo_url }
 * @param {Buffer|null} p.logoBuffer
 * @param {object} p.section       { level_label, level_code, content: { groups, notes } }
 * @param {string} [p.title]       titre principal (défaut : FOURNITURES SCOLAIRES)
 * @param {string} [p.academicYear]
 * @returns {Promise<Buffer>}
 */
export function buildSuppliesPdfBuffer({ school = {}, logoBuffer = null, section, title, academicYear }) {
  return new Promise((resolve, reject) => {
    try {
      const levelLabel = section?.level_label || 'Tous les niveaux';
      const doc = new PDFDocument({
        size: 'A4',
        margin: PAGE_MARGIN,
        bufferPages: true, // pagination "page n/N" écrite en fin de génération
        info: {
          Title: `${title || 'Fournitures scolaires'} — ${levelLabel}`,
          Author: school.name || 'Eductrack',
          Subject: 'Liste de fournitures scolaires',
        },
      });
      registerArabicFont(doc);

      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const pageW = doc.page.width;
      const contentW = pageW - 2 * PAGE_MARGIN;
      const bottomLimit = doc.page.height - 70; // garde la place du pied de page

      drawHeader(doc, { school, logoBuffer, academicYear });
      let y = HEADER_H + 34;

      /** Ajoute une page et y redessine le bandeau. */
      const newPage = () => {
        doc.addPage();
        drawHeader(doc, { school, logoBuffer, academicYear });
        y = HEADER_H + 30;
      };
      const ensureSpace = (needed) => { if (y + needed > bottomLimit) newPage(); };

      // ───── Titre + badge de niveau ─────
      doc.fillColor(INK).fontSize(23);
      smartMixedText(doc, (title || 'Fournitures scolaires').toUpperCase(), PAGE_MARGIN, y, { width: contentW });
      y += 32;

      doc.fontSize(11);
      const badgeText = `Niveau : ${levelLabel}`;
      const badgeW = Math.min(contentW, doc.widthOfString(badgeText) + 34);
      card(doc, PAGE_MARGIN, y, badgeW, 26, { fill: SAFRAN_SOFT, stroke: SAFRAN, radius: 13 });
      doc.fillColor('#92400E').fontSize(11);
      smartMixedText(doc, badgeText, PAGE_MARGIN + 16, y + 8, { width: badgeW - 24, lineBreak: false });
      y += 38;

      doc.fillColor(SLATE).fontSize(9.5);
      doc.text(
        'Liste à préparer pour la rentrée. Merci d\'étiqueter chaque article au nom de l\'élève.',
        PAGE_MARGIN, y, { width: contentW },
      );
      y += 22;

      doc.moveTo(PAGE_MARGIN, y).lineTo(PAGE_MARGIN + contentW, y).strokeColor(BORDER).lineWidth(1).stroke();
      y += 18;

      // ───── Groupes d'articles ─────
      const groups = section?.content?.groups || [];
      const notes = section?.content?.notes || [];

      if (groups.length === 0) {
        doc.fillColor(SLATE).fontSize(11);
        doc.text('Aucun article n\'est renseigné pour ce niveau.', PAGE_MARGIN, y, { width: contentW });
        y += 24;
      }

      const qtyW = 62;
      const labelX = PAGE_MARGIN + 34;
      const labelW = contentW - 34 - qtyW - 16;

      groups.forEach((group) => {
        const items = group.items || [];
        if (items.length === 0) return;

        // En-tête du groupe (on évite un titre orphelin en bas de page)
        ensureSpace(64);
        card(doc, PAGE_MARGIN, y, contentW, 28, { fill: INDIGO_SOFT, radius: 6 });
        doc.rect(PAGE_MARGIN, y + 4, 4, 20).fill(INDIGO);
        doc.fillColor(INDIGO).fontSize(12);
        smartMixedText(doc, group.title || 'Fournitures', PAGE_MARGIN + 16, y + 8, {
          width: contentW - 90, lineBreak: false,
        });
        doc.fillColor(INDIGO).fontSize(9);
        doc.text(`${items.length} article${items.length > 1 ? 's' : ''}`, PAGE_MARGIN, y + 10, {
          width: contentW - 14, align: 'right',
        });
        y += 34;

        items.forEach((item, idx) => {
          const label = item.label || '';
          const note = item.note || '';
          const labelH = measure(doc, label, labelW, 10.5);
          const noteH = note ? measure(doc, note, labelW, 8.5) + 2 : 0;
          const rowH = Math.max(24, labelH + noteH + 12);

          ensureSpace(rowH + 6);

          if (idx % 2 === 0) {
            card(doc, PAGE_MARGIN, y, contentW, rowH, { fill: '#F8FAFC', radius: 4 });
          }

          // Case à cocher
          doc.roundedRect(PAGE_MARGIN + 12, y + (rowH - 12) / 2, 12, 12, 3)
            .lineWidth(1).strokeColor('#CBD5E1').stroke();

          doc.fillColor(INK).fontSize(10.5);
          smartText(doc, label, labelX, y + 6, { width: labelW });
          if (note) {
            doc.fillColor(MUTED).fontSize(8.5);
            smartText(doc, note, labelX, y + 6 + labelH + 1, { width: labelW });
          }

          if (item.quantity) {
            const qx = PAGE_MARGIN + contentW - qtyW - 10;
            card(doc, qx, y + (rowH - 18) / 2, qtyW, 18, { fill: WHITE, stroke: BORDER, radius: 9 });
            doc.fillColor(INDIGO).fontSize(9);
            smartText(doc, String(item.quantity), qx, y + (rowH - 18) / 2 + 5, { width: qtyW, align: 'center' });
          }

          y += rowH + 2;
        });

        y += 12;
      });

      // ───── Consignes ─────
      if (notes.length > 0) {
        const noteHeights = notes.map((n) => measure(doc, n, contentW - 48, 9.5) + 6);
        const boxH = 34 + noteHeights.reduce((a, b) => a + b, 0);
        ensureSpace(boxH + 10);

        card(doc, PAGE_MARGIN, y, contentW, boxH, { fill: SAFRAN_SOFT, radius: 8 });
        doc.rect(PAGE_MARGIN, y, 4, boxH).fill(SAFRAN);
        doc.fillColor('#92400E').fontSize(11);
        doc.text('À retenir', PAGE_MARGIN + 20, y + 10, { width: contentW - 40 });

        let ny = y + 30;
        notes.forEach((n, i) => {
          doc.circle(PAGE_MARGIN + 24, ny + 5, 2).fill('#B45309');
          doc.fillColor('#7C2D12').fontSize(9.5);
          smartText(doc, n, PAGE_MARGIN + 34, ny, { width: contentW - 48 });
          ny += noteHeights[i];
        });
        y += boxH + 14;
      }

      // ───── Mention de génération ─────
      ensureSpace(24);
      doc.fillColor(MUTED).fontSize(8);
      // Le nom de l'école peut contenir de l'arabe → rendu segment par segment.
      smartMixedText(doc, `Document généré le ${fmtDate(new Date())} par ${school.name || 'l\'école'} via Eductrack.`,
        PAGE_MARGIN, y, { width: contentW, lineBreak: false });

      // ───── Pieds de page (pagination connue seulement maintenant) ─────
      const range = doc.bufferedPageRange();
      for (let i = 0; i < range.count; i += 1) {
        doc.switchToPage(range.start + i);
        drawFooter(doc, { school, levelLabel, pageNumber: i + 1, pageCount: range.count });
      }

      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * Charge l'école + son logo puis génère le PDF d'une section.
 * @returns {Promise<{buffer: Buffer, fileName: string}>}
 */
export async function generateSectionPdf({ schoolId, section, title, academicYear }) {
  const { data: school } = await supabaseAdmin
    .from('schools')
    .select('name, address, phone, email, logo_url')
    .eq('id', schoolId)
    .maybeSingle();

  const logoBuffer = await fetchSchoolLogoBuffer(school?.logo_url);
  const buffer = await buildSuppliesPdfBuffer({
    school: school || {},
    logoBuffer,
    section,
    title,
    academicYear,
  });

  const fileName = `${safeFileName([
    'Fournitures',
    section?.level_code || section?.level_label,
    academicYear,
  ])}.pdf`;

  return { buffer, fileName };
}
