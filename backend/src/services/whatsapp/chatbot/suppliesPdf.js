/**
 * Génération du PDF « fournitures scolaires » envoyé au parent sur WhatsApp.
 *
 * Le parent ne reçoit JAMAIS le PDF importé par l'école (qui couvre tous les
 * niveaux) : on régénère ici un document propre, aux couleurs de l'école
 * (logo + nom), contenant UNIQUEMENT le niveau demandé.
 *
 * Le document s'adapte à la langue de la liste : une liste rédigée en arabe
 * produit un PDF entièrement arabe, lu de droite à gauche (titres, cases à
 * cocher, quantités et consignes sont alors inversés).
 *
 * Mise en page : bandeau d'en-tête, badge de niveau, articles regroupés par
 * catégorie avec cases à cocher, encadré de consignes, pied de page paginé.
 */

import PDFDocument from 'pdfkit';
import { supabaseAdmin } from '../../../config/supabase.js';
import { fetchSchoolLogoBuffer, drawSchoolLogo } from '../../schoolLogo.js';
import {
  registerArabicFont, isArabicDominant,
  drawMixedParagraph, mixedParagraphHeight, mixedTextWidth,
} from './pdfText.js';

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

// Libellés du document, en français ou en arabe selon la langue de la liste.
const LABELS = {
  fr: {
    title: 'Fournitures scolaires',
    level: (l) => `Niveau : ${l}`,
    year: (y) => `Année ${y}`,
    subtitle: 'Liste à préparer pour la rentrée. Merci d\'étiqueter chaque article au nom de l\'élève.',
    items: (n) => `${n} article${n > 1 ? 's' : ''}`,
    notes: 'À retenir',
    empty: 'Aucun article n\'est renseigné pour ce niveau.',
    generated: (d, s) => `Document généré le ${d} par ${s} via Eductrack.`,
    footer: (s, l) => `${s} — Fournitures ${l}`,
    page: (n, total) => `Page ${n}/${total}`,
    defaultGroup: 'Fournitures',
  },
  ar: {
    title: 'لائحة اللوازم المدرسية',
    level: (l) => `المستوى : ${l}`,
    year: (y) => `السنة الدراسية ${y}`,
    subtitle: 'يرجى تحضير هذه اللوازم قبل الدخول المدرسي وكتابة اسم التلميذ على كل أداة.',
    items: (n) => (n === 1 ? 'مادة واحدة' : `${n} مواد`),
    notes: 'ملاحظات مهمة',
    empty: 'لا توجد لوازم مسجلة لهذا المستوى.',
    generated: (d, s) => `وثيقة أُنشئت بتاريخ ${d} من طرف ${s} عبر Eductrack.`,
    footer: (s, l) => `${s} — لوازم ${l}`,
    page: (n, total) => `صفحة ${n}/${total}`,
    defaultGroup: 'اللوازم',
  },
};

/** Nom de fichier sûr (WhatsApp + systèmes de fichiers). */
function safeFileName(parts) {
  return parts
    .filter(Boolean)
    .join('_')
    .normalize('NFD')
    .replace(/[^\w-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 80);
}

function fmtDate(d, rtl) {
  try {
    return rtl
      ? new Date(d).toLocaleDateString('fr-FR')
      : new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  } catch (_) {
    return '';
  }
}

/**
 * La liste est-elle rédigée en arabe ? On agrège tout le contenu visible du
 * niveau (titres de groupes, articles, consignes) pour décider du sens de
 * lecture de TOUT le document.
 */
function isArabicSection(section) {
  const bits = [section?.level_label];
  for (const g of section?.content?.groups || []) {
    bits.push(g.title);
    for (const it of g.items || []) bits.push(it.label, it.note);
  }
  bits.push(...(section?.content?.notes || []));
  return isArabicDominant(bits.filter(Boolean).join(' '));
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
function drawHeader(doc, { school, logoBuffer, academicYear, L, rtl }) {
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
    const initials = String(school.name || 'É').trim().split(/\s+/).slice(0, 2)
      .map((w) => [...w][0]).join('').toUpperCase();
    doc.fillColor(INDIGO);
    drawMixedParagraph(doc, initials, {
      x: logoBox.x, y: logoBox.y + 18, width: logoBox.size, size: 22, align: 'center',
    });
  }

  const badgeW = academicYear ? 132 : 0;
  const textX = PAGE_MARGIN + logoBox.size + 16;
  const textW = pageW - textX - PAGE_MARGIN - badgeW - 10;

  doc.fillColor(WHITE);
  const nameH = drawMixedParagraph(doc, school.name || 'École', {
    x: textX, y: 28, width: textW, size: 17, maxLines: 2, rtl: isArabicDominant(school.name),
  });
  doc.fillColor('#C7D2FE');
  const contact = [school.address, school.phone && `${school.phone}`].filter(Boolean).join('  •  ');
  if (contact) {
    drawMixedParagraph(doc, contact, {
      x: textX, y: 30 + Math.max(nameH, 20), width: textW, size: 9, maxLines: 1,
      rtl: isArabicDominant(contact),
    });
  }

  // Badge année scolaire, aligné à droite
  if (academicYear) {
    const badgeX = pageW - PAGE_MARGIN - badgeW;
    card(doc, badgeX, 34, badgeW, 26, { fill: '#312E81', stroke: '#6366F1', radius: 13 });
    doc.fillColor(WHITE);
    drawMixedParagraph(doc, L.year(academicYear), {
      x: badgeX + 8, y: 41, width: badgeW - 16, size: 9.5, align: 'center', maxLines: 1, rtl,
    });
  }
}

/** Pied de page (appelé sur chaque page à la fin, quand la pagination est connue). */
function drawFooter(doc, { school, levelLabel, pageNumber, pageCount, L, rtl }) {
  const y = doc.page.height - 46;
  const w = doc.page.width - 2 * PAGE_MARGIN;

  // Écrire sous la marge basse ferait ajouter une page vide par PDFKit :
  // on neutralise la marge le temps de dessiner le pied de page.
  const savedBottom = doc.page.margins.bottom;
  doc.page.margins.bottom = 0;

  doc.moveTo(PAGE_MARGIN, y).lineTo(PAGE_MARGIN + w, y).strokeColor(BORDER).lineWidth(1).stroke();
  doc.fillColor(MUTED);

  // En lecture arabe, l'identité de l'école passe à droite et la pagination à gauche.
  const idW = w * 0.7;
  const pageW = w * 0.3;
  const idX = rtl ? PAGE_MARGIN + pageW : PAGE_MARGIN;
  const pageX = rtl ? PAGE_MARGIN : PAGE_MARGIN + idW;

  drawMixedParagraph(doc, L.footer(school.name || 'École', levelLabel), {
    x: idX, y: y + 8, width: idW, size: 8, maxLines: 1, rtl, align: rtl ? 'right' : 'left',
  });
  drawMixedParagraph(doc, L.page(pageNumber, pageCount), {
    x: pageX, y: y + 8, width: pageW, size: 8, maxLines: 1, rtl, align: rtl ? 'left' : 'right',
  });

  doc.page.margins.bottom = savedBottom;
}

/**
 * Construit le PDF d'un niveau.
 *
 * @param {object} p
 * @param {object} p.school        { name, address, phone, logo_url }
 * @param {Buffer|null} p.logoBuffer
 * @param {object} p.section       { level_label, level_code, content: { groups, notes } }
 * @param {string} [p.title]       titre principal (défaut : selon la langue)
 * @param {string} [p.academicYear]
 * @returns {Promise<Buffer>}
 */
export function buildSuppliesPdfBuffer({ school = {}, logoBuffer = null, section, title, academicYear }) {
  return new Promise((resolve, reject) => {
    try {
      const rtl = isArabicSection(section);
      const L = rtl ? LABELS.ar : LABELS.fr;
      const levelLabel = section?.level_label || (rtl ? 'جميع المستويات' : 'Tous les niveaux');
      const docTitle = title || L.title;

      const doc = new PDFDocument({
        size: 'A4',
        margin: PAGE_MARGIN,
        bufferPages: true, // pagination "page n/N" écrite en fin de génération
        info: {
          Title: `${docTitle} — ${levelLabel}`,
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
      const contentRight = PAGE_MARGIN + contentW;
      const bottomLimit = doc.page.height - 70; // garde la place du pied de page
      const align = rtl ? 'right' : 'left';
      // Le sens de lecture se décide TEXTE PAR TEXTE : une liste française peut
      // contenir un article en arabe (et inversement), qui doit garder son ordre.
      const dirOf = (t) => isArabicDominant(t);

      drawHeader(doc, { school, logoBuffer, academicYear, L, rtl });
      let y = HEADER_H + 34;

      /** Ajoute une page et y redessine le bandeau. */
      const newPage = () => {
        doc.addPage();
        drawHeader(doc, { school, logoBuffer, academicYear, L, rtl });
        y = HEADER_H + 30;
      };
      const ensureSpace = (needed) => { if (y + needed > bottomLimit) newPage(); };

      // ───── Titre + badge de niveau ─────
      doc.fillColor(INK);
      y += drawMixedParagraph(doc, docTitle, {
        x: PAGE_MARGIN, y, width: contentW, size: 22, align, rtl,
      }) + 10;

      const badgeText = L.level(levelLabel);
      // Largeur mesurée segment par segment (un libellé arabe est plus large que
      // ce que mesurerait la police latine → le texte débordait de la pastille).
      const badgeW = Math.min(contentW, mixedTextWidth(doc, badgeText, { size: 11 }) + 32);
      const badgeH = mixedParagraphHeight(doc, badgeText, { width: badgeW - 32, size: 11 }) + 14;
      const badgeX = rtl ? contentRight - badgeW : PAGE_MARGIN;
      card(doc, badgeX, y, badgeW, badgeH, { fill: SAFRAN_SOFT, stroke: SAFRAN, radius: badgeH / 2 });
      doc.fillColor('#92400E');
      drawMixedParagraph(doc, badgeText, {
        x: badgeX + 16, y: y + 7, width: badgeW - 32, size: 11, align, rtl,
      });
      y += badgeH + 12;

      doc.fillColor(SLATE);
      y += drawMixedParagraph(doc, L.subtitle, {
        x: PAGE_MARGIN, y, width: contentW, size: 9.5, align, rtl,
      }) + 10;

      doc.moveTo(PAGE_MARGIN, y).lineTo(contentRight, y).strokeColor(BORDER).lineWidth(1).stroke();
      y += 18;

      // ───── Groupes d'articles ─────
      const groups = section?.content?.groups || [];
      const notes = section?.content?.notes || [];

      if (groups.length === 0) {
        doc.fillColor(SLATE);
        y += drawMixedParagraph(doc, L.empty, {
          x: PAGE_MARGIN, y, width: contentW, size: 11, align, rtl,
        }) + 14;
      }

      // Trois colonnes : case à cocher, libellé, quantité. En lecture arabe la
      // case passe à droite et la quantité à gauche. Un écart de 10 pt sépare
      // chaque colonne du libellé (sans lui, le texte touchait la case).
      const qtyW = 62;
      const checkSize = 12;
      const GAP = 10;
      const checkX = rtl ? contentRight - 12 - checkSize : PAGE_MARGIN + 12;
      const qtyX = rtl ? PAGE_MARGIN + 10 : contentRight - qtyW - 10;
      const labelX = rtl ? qtyX + qtyW + GAP : checkX + checkSize + GAP;
      const labelW = rtl
        ? (checkX - GAP) - labelX
        : (qtyX - GAP) - labelX;

      groups.forEach((group) => {
        const items = group.items || [];
        if (items.length === 0) return;

        // En-tête du groupe. Réserver une hauteur forfaitaire ne suffisait pas :
        // un titre pouvait tenir en bas de page pendant que ses articles
        // partaient sur la suivante. On mesure donc les deux premiers articles
        // et on n'écrit le titre que si le bloc « titre + ces articles » tient.
        const rowHeightOf = (item) => {
          const l = item?.label || '';
          const n = item?.note || '';
          return Math.max(24, mixedParagraphHeight(doc, l, { width: labelW, size: 10.5 })
            + (n ? mixedParagraphHeight(doc, n, { width: labelW, size: 8.5 }) : 0)
            + 12) + 6;
        };
        const headerH = 34;
        const keepWithHeader = items.slice(0, 2).reduce((sum, it) => sum + rowHeightOf(it), 0);
        ensureSpace(headerH + keepWithHeader);
        const countText = L.items(items.length);
        card(doc, PAGE_MARGIN, y, contentW, 28, { fill: INDIGO_SOFT, radius: 6 });
        doc.rect(rtl ? contentRight - 4 : PAGE_MARGIN, y + 4, 4, 20).fill(INDIGO);
        doc.fillColor(INDIGO);
        const groupTitle = group.title || L.defaultGroup;
        drawMixedParagraph(doc, groupTitle, {
          x: rtl ? PAGE_MARGIN + 90 : PAGE_MARGIN + 16,
          y: y + 8, width: contentW - 106, size: 12, align, maxLines: 1, rtl: dirOf(groupTitle),
        });
        drawMixedParagraph(doc, countText, {
          x: rtl ? PAGE_MARGIN + 14 : contentRight - 90,
          y: y + 10, width: 76, size: 9, align: rtl ? 'left' : 'right', maxLines: 1, rtl,
        });
        y += 34;

        items.forEach((item, idx) => {
          const label = item.label || '';
          const note = item.note || '';
          const labelH = mixedParagraphHeight(doc, label, { width: labelW, size: 10.5 });
          const noteH = note ? mixedParagraphHeight(doc, note, { width: labelW, size: 8.5 }) : 0;
          const rowH = Math.max(24, labelH + noteH + 12);

          ensureSpace(rowH + 6);

          if (idx % 2 === 0) {
            card(doc, PAGE_MARGIN, y, contentW, rowH, { fill: '#F8FAFC', radius: 4 });
          }

          // Case à cocher
          doc.roundedRect(checkX, y + (rowH - checkSize) / 2, checkSize, checkSize, 3)
            .lineWidth(1).strokeColor('#CBD5E1').stroke();

          doc.fillColor(INK);
          drawMixedParagraph(doc, label, {
            x: labelX, y: y + 6, width: labelW, size: 10.5, align, rtl: dirOf(label),
          });
          if (note) {
            doc.fillColor(MUTED);
            drawMixedParagraph(doc, note, {
              x: labelX, y: y + 6 + labelH, width: labelW, size: 8.5, align, rtl: dirOf(note),
            });
          }

          if (item.quantity) {
            card(doc, qtyX, y + (rowH - 18) / 2, qtyW, 18, { fill: WHITE, stroke: BORDER, radius: 9 });
            doc.fillColor(INDIGO);
            drawMixedParagraph(doc, String(item.quantity), {
              x: qtyX + 4, y: y + (rowH - 18) / 2 + 5, width: qtyW - 8, size: 9,
              align: 'center', maxLines: 1, rtl,
            });
          }

          y += rowH + 2;
        });

        y += 12;
      });

      // ───── Consignes ─────
      if (notes.length > 0) {
        const noteW = contentW - 48;
        const noteHeights = notes.map((n) => mixedParagraphHeight(doc, n, { width: noteW, size: 9.5 }) + 6);
        const titleH = mixedParagraphHeight(doc, L.notes, { width: contentW - 40, size: 11 });
        const bulletX = rtl ? contentRight - 24 : PAGE_MARGIN + 24;
        const noteX = rtl ? PAGE_MARGIN + 14 : PAGE_MARGIN + 34;

        // L'encadré se pagine : dessiné d'un bloc, une longue série de consignes
        // débordait de la page et passait par-dessus le pied de page.
        let i = 0;
        let firstBox = true;
        while (i < notes.length) {
          const headH = firstBox ? titleH + 14 : 10;
          if (y + headH + noteHeights[i] + 12 > bottomLimit) newPage();

          // Consignes tenant dans la page (au moins une, même trop haute :
          // sinon la boucle ne se terminerait jamais).
          const slice = [];
          let boxH = headH + 8;
          while (i < notes.length && (slice.length === 0 || y + boxH + noteHeights[i] + 8 <= bottomLimit)) {
            boxH += noteHeights[i];
            slice.push(notes[i]);
            i += 1;
          }
          boxH += 8;

          card(doc, PAGE_MARGIN, y, contentW, boxH, { fill: SAFRAN_SOFT, radius: 8 });
          doc.rect(rtl ? contentRight - 4 : PAGE_MARGIN, y, 4, boxH).fill(SAFRAN);
          if (firstBox) {
            doc.fillColor('#92400E');
            drawMixedParagraph(doc, L.notes, {
              x: PAGE_MARGIN + 20, y: y + 9, width: contentW - 40, size: 11, align, rtl,
            });
          }

          let ny = y + headH + 4;
          slice.forEach((n) => {
            doc.circle(bulletX, ny + 5, 2).fill('#B45309');
            doc.fillColor('#7C2D12');
            drawMixedParagraph(doc, n, { x: noteX, y: ny, width: noteW, size: 9.5, align, rtl: dirOf(n) });
            ny += mixedParagraphHeight(doc, n, { width: noteW, size: 9.5 }) + 6;
          });

          y += boxH + 14;
          firstBox = false;
        }
      }

      // ───── Mention de génération ─────
      ensureSpace(26);
      doc.fillColor(MUTED);
      drawMixedParagraph(doc, L.generated(fmtDate(new Date(), rtl), school.name || 'Eductrack'), {
        x: PAGE_MARGIN, y, width: contentW, size: 8, align, rtl,
      });

      // ───── Pieds de page (pagination connue seulement maintenant) ─────
      const range = doc.bufferedPageRange();
      for (let i = 0; i < range.count; i += 1) {
        doc.switchToPage(range.start + i);
        drawFooter(doc, {
          school, levelLabel, pageNumber: i + 1, pageCount: range.count, L, rtl,
        });
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
  // ⚠️ La table `schools` n'a pas de colonne `email` : sélectionner un champ
  // inexistant fait échouer TOUTE la requête (école sans nom ni logo dans le PDF).
  const { data: school, error } = await supabaseAdmin
    .from('schools')
    .select('name, address, phone, logo_url')
    .eq('id', schoolId)
    .maybeSingle();
  if (error) console.warn('[suppliesPdf] école introuvable:', error.message);

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
