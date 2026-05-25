/**
 * Génération d'un bulletin scolaire officiel (format marocain) en PDF.
 *
 * - Police arabe : Noto Naskh Arabic + OpenType features rtla/rclt
 * - Layout : en-tête ministère, infos école/élève, tableau matières, résumé
 * - Retourne un Buffer PDF prêt à être sauvegardé ou envoyé via WhatsApp
 */

import PDFDocument from 'pdfkit';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { computeMention } from './calculator.js';
import { supabaseAdmin } from '../../config/supabase.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Police arabe (même fichier que invoicePdf)
const ARABIC_FONT_PATH = path.join(__dirname, '..', 'whatsapp', 'chatbot', 'fonts', 'NotoNaskhArabic-Regular.ttf');
const ARABIC_FONT_NAME = 'ArabicFont';
const ARABIC_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
const ARABIC_FEATURES = ['rtla', 'rclt'];

function hasArabic(text) { return ARABIC_RE.test(String(text || '')); }

function smartText(doc, text, x, y, opts = {}) {
  const t = String(text == null ? '' : text);
  const useAr = hasArabic(t);
  const prev = doc._font?.name || 'Helvetica';
  if (useAr) doc.font(ARABIC_FONT_NAME);
  const finalOpts = useAr ? { ...opts, features: [...(opts.features || []), ...ARABIC_FEATURES] } : opts;
  if (x !== undefined && y !== undefined) doc.text(t, x, y, finalOpts);
  else doc.text(t, finalOpts);
  if (useAr) { try { doc.font(prev); } catch (_) { doc.font('Helvetica'); } }
}

function fmtNum(n) {
  if (n == null) return '—';
  return Number(n).toFixed(2);
}

// Couleurs
const C = {
  primary: '#1e3a5f',    // bleu foncé ministère
  accent: '#2563eb',
  headerBg: '#f0f4f8',
  tableBorder: '#c0c8d0',
  tableHeaderBg: '#1e3a5f',
  tableHeaderFg: '#ffffff',
  tableAltRow: '#f8fafc',
  mentionTB: '#15803d',
  mentionB: '#1d4ed8',
  mentionAB: '#ca8a04',
  mentionP: '#6b7280',
  mentionF: '#dc2626',
};

const PAGE_W = 595.28;  // A4
const PAGE_H = 841.89;
const MARGIN = 40;
const CONTENT_W = PAGE_W - MARGIN * 2;

/**
 * Génère le PDF d'un bulletin scolaire.
 *
 * @param {Object} params
 * @param {Object} params.student       { first_name, last_name, massar_code, ... }
 * @param {Object} params.cls           { name, level, filiere }
 * @param {Array}  params.lines         [{ subject_name, controls_avg, activities_avg, note_20, coefficient, weighted_note, rank_in_class, appreciation }]
 * @param {number} params.generalAverage
 * @param {number} params.generalRank
 * @param {number} params.totalStudents
 * @param {number} params.classAverage
 * @param {Object} params.config        school_year_config row (or {})
 * @param {Object} params.school        { name, address, phone, ... }
 * @param {string} params.academicYear  "2025/2026"
 * @param {number} params.semester      1 or 2
 * @param {string} [params.notes]       commentaire global
 * @returns {Promise<Buffer>}
 */
export async function generateBulletinPdf({
  student, cls, lines, generalAverage, generalRank, totalStudents,
  classAverage, config = {}, school = {}, academicYear, semester, notes
}) {
  return new Promise((resolve, reject) => {
    try {
      const chunks = [];
      const doc = new PDFDocument({ size: 'A4', margin: MARGIN, bufferPages: true });

      // Register arabic font
      try { doc.registerFont(ARABIC_FONT_NAME, ARABIC_FONT_PATH); } catch (_) {}

      doc.on('data', c => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      let y = MARGIN;

      // ═══════════════════════════════════════════════════════════════
      // EN-TÊTE OFFICIEL
      // ═══════════════════════════════════════════════════════════════

      // Ligne 1 : Royaume du Maroc / المملكة المغربية
      doc.fontSize(9).fillColor(C.primary);
      smartText(doc, 'المملكة المغربية', PAGE_W - MARGIN - 200, y, { width: 200, align: 'right' });
      doc.font('Helvetica').fontSize(9).text('Royaume du Maroc', MARGIN, y, { width: 200 });
      y += 14;

      // Ligne 2 : Ministère
      smartText(doc, 'وزارة التربية الوطنية والتعليم الأولي والرياضة', PAGE_W - MARGIN - 250, y, { width: 250, align: 'right' });
      doc.font('Helvetica').fontSize(8).text("Ministère de l'Éducation Nationale", MARGIN, y, { width: 250 });
      y += 14;

      // Académie / Direction (depuis config)
      if (config.academy) {
        doc.font('Helvetica').fontSize(7).fillColor('#555').text(config.academy, MARGIN, y, { width: 250 });
        y += 10;
      }
      if (config.provincial_direction) {
        doc.font('Helvetica').fontSize(7).text(config.provincial_direction, MARGIN, y, { width: 250 });
        y += 10;
      }

      // Nom de l'école (centré, grand)
      y += 4;
      const schoolName = config.establishment_label || school.name || '';
      doc.font('Helvetica-Bold').fontSize(13).fillColor(C.primary);
      smartText(doc, schoolName, MARGIN, y, { width: CONTENT_W, align: 'center' });
      y += 22;

      // Ligne de séparation
      doc.moveTo(MARGIN, y).lineTo(PAGE_W - MARGIN, y).strokeColor(C.primary).lineWidth(1.5).stroke();
      y += 8;

      // Titre : BULLETIN SCOLAIRE
      doc.font('Helvetica-Bold').fontSize(14).fillColor(C.primary);
      const semLabel = semester === 1 ? 'Premier Semestre' : 'Deuxième Semestre';
      doc.text(`BULLETIN SCOLAIRE — ${semLabel}`, MARGIN, y, { width: CONTENT_W, align: 'center' });
      y += 18;
      smartText(doc, semester === 1 ? 'نتائج الدورة الأولى' : 'نتائج الدورة الثانية', MARGIN, y, { width: CONTENT_W, align: 'center' });
      y += 20;

      // ═══════════════════════════════════════════════════════════════
      // INFOS ÉLÈVE
      // ═══════════════════════════════════════════════════════════════
      const infoBoxY = y;
      doc.rect(MARGIN, infoBoxY, CONTENT_W, 52).fillAndStroke(C.headerBg, C.tableBorder);
      y = infoBoxY + 8;

      const col1 = MARGIN + 10;
      const col2 = MARGIN + CONTENT_W / 2 + 10;
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#333');

      doc.text('Élève :', col1, y);
      doc.font('Helvetica');
      smartText(doc, `${student.first_name || ''} ${student.last_name || ''}`.trim() || '—', col1 + 45, y);

      doc.font('Helvetica-Bold').text('Classe :', col2, y);
      doc.font('Helvetica');
      smartText(doc, cls.name || '', col2 + 50, y);
      y += 14;

      doc.font('Helvetica-Bold').text('Code Massar :', col1, y);
      doc.font('Helvetica').text(student.massar_code || '—', col1 + 80, y);

      doc.font('Helvetica-Bold').text('Année scolaire :', col2, y);
      doc.font('Helvetica').text(academicYear || '', col2 + 90, y);
      y += 14;

      if (cls.level) {
        doc.font('Helvetica-Bold').text('Niveau :', col1, y);
        doc.font('Helvetica').text(cls.level, col1 + 50, y);
      }
      if (cls.filiere) {
        doc.font('Helvetica-Bold').text('Filière :', col2, y);
        doc.font('Helvetica').text(cls.filiere, col2 + 50, y);
      }

      y = infoBoxY + 52 + 12;

      // ═══════════════════════════════════════════════════════════════
      // TABLEAU DES MATIÈRES
      // ═══════════════════════════════════════════════════════════════
      const colDefs = [
        { label: 'Matière',     arLabel: 'المادة',    w: 130, align: 'left' },
        { label: 'Moy. Ctrl',  arLabel: 'م.فروض',    w: 55,  align: 'center' },
        { label: 'Moy. Act.',  arLabel: 'م.أنشطة',   w: 55,  align: 'center' },
        { label: 'Note /20',   arLabel: 'النقطة',     w: 55,  align: 'center' },
        { label: 'Coef.',      arLabel: 'المعامل',    w: 40,  align: 'center' },
        { label: 'Note×Coef',  arLabel: 'مجموع',     w: 60,  align: 'center' },
        { label: 'Rang',       arLabel: 'الرتبة',     w: 40,  align: 'center' },
        { label: 'Appréciation', arLabel: 'ملاحظة',  w: 80,  align: 'left' },
      ];

      const tableX = MARGIN;
      const rowH = 18;
      const headerH = 28;

      // Header
      doc.rect(tableX, y, CONTENT_W, headerH).fill(C.tableHeaderBg);
      let cx = tableX;
      doc.font('Helvetica-Bold').fontSize(7).fillColor(C.tableHeaderFg);
      for (const col of colDefs) {
        doc.text(col.label, cx + 3, y + 4, { width: col.w - 6, align: col.align });
        cx += col.w;
      }
      // Arabic sub-header
      cx = tableX;
      for (const col of colDefs) {
        smartText(doc, col.arLabel, cx + 3, y + 15, { width: col.w - 6, align: col.align });
        cx += col.w;
      }
      doc.fillColor('#333');
      y += headerH;

      // Rows
      doc.fontSize(8);
      lines.forEach((line, idx) => {
        // Nouvelle page si on dépasse
        if (y + rowH > PAGE_H - 120) {
          doc.addPage();
          y = MARGIN;
        }

        const bg = idx % 2 === 0 ? '#ffffff' : C.tableAltRow;
        doc.rect(tableX, y, CONTENT_W, rowH).fill(bg);
        // Bordure
        doc.rect(tableX, y, CONTENT_W, rowH).strokeColor(C.tableBorder).lineWidth(0.3).stroke();

        cx = tableX;
        const vals = [
          line.subject_name,
          fmtNum(line.controls_avg),
          fmtNum(line.activities_avg),
          fmtNum(line.note_20),
          String(line.coefficient),
          fmtNum(line.weighted_note),
          line.rank_in_class != null ? String(line.rank_in_class) : '—',
          line.appreciation || line.appreciation_by_teacher || ''
        ];
        doc.fillColor('#333').font('Helvetica').fontSize(8);
        for (let i = 0; i < colDefs.length; i++) {
          const col = colDefs[i];
          smartText(doc, vals[i], cx + 3, y + 5, { width: col.w - 6, align: col.align });
          cx += col.w;
        }
        y += rowH;
      });

      // Ligne totale
      y += 2;
      doc.rect(tableX, y, CONTENT_W, rowH + 2).fill(C.headerBg).strokeColor(C.tableBorder).stroke();
      doc.font('Helvetica-Bold').fontSize(9).fillColor(C.primary);
      const totalCoef = lines.reduce((s, l) => s + Number(l.coefficient || 0), 0);
      const totalWeighted = lines.reduce((s, l) => s + (l.weighted_note != null ? Number(l.weighted_note) : 0), 0);
      doc.text('TOTAL', tableX + 5, y + 4, { width: 130 });
      doc.text(String(totalCoef), tableX + 130 + 55 + 55 + 55 + 3, y + 4, { width: 40, align: 'center' });
      doc.text(fmtNum(totalWeighted), tableX + 130 + 55 + 55 + 55 + 40 + 3, y + 4, { width: 60, align: 'center' });
      y += rowH + 8;

      // ═══════════════════════════════════════════════════════════════
      // RÉSUMÉ
      // ═══════════════════════════════════════════════════════════════
      if (y + 80 > PAGE_H - 60) { doc.addPage(); y = MARGIN; }

      const mention = computeMention(generalAverage);
      const mentionColor = generalAverage >= 16 ? C.mentionTB
        : generalAverage >= 14 ? C.mentionB
        : generalAverage >= 12 ? C.mentionAB
        : generalAverage >= 10 ? C.mentionP
        : C.mentionF;

      // Box résumé
      doc.rect(MARGIN, y, CONTENT_W, 65).fillAndStroke('#f8fafc', C.tableBorder);
      const sy = y + 8;

      doc.font('Helvetica-Bold').fontSize(11).fillColor(C.primary);
      doc.text(`Moyenne Générale : ${fmtNum(generalAverage)} / 20`, MARGIN + 15, sy);

      doc.font('Helvetica').fontSize(9).fillColor('#555');
      doc.text(`Rang : ${generalRank || '—'} / ${totalStudents || '—'}`, MARGIN + 15, sy + 18);
      doc.text(`Moyenne de classe : ${fmtNum(classAverage)}`, MARGIN + 220, sy + 18);

      if (mention) {
        doc.font('Helvetica-Bold').fontSize(10).fillColor(mentionColor);
        doc.text(`Mention : ${mention.fr}`, MARGIN + 15, sy + 36);
        smartText(doc, mention.ar, MARGIN + 200, sy + 36, { width: 150 });
      }

      y += 75;

      // Notes / commentaire
      if (notes) {
        doc.font('Helvetica').fontSize(8).fillColor('#555');
        doc.text('Observations :', MARGIN, y);
        y += 12;
        smartText(doc, notes, MARGIN, y, { width: CONTENT_W });
        y += 30;
      }

      // ═══════════════════════════════════════════════════════════════
      // PIED DE PAGE
      // ═══════════════════════════════════════════════════════════════
      const footerY = PAGE_H - 55;
      doc.moveTo(MARGIN, footerY).lineTo(PAGE_W - MARGIN, footerY).strokeColor('#ccc').lineWidth(0.5).stroke();

      doc.font('Helvetica').fontSize(7).fillColor('#999');
      doc.text(`Généré le ${new Date().toLocaleDateString('fr-FR')}`, MARGIN, footerY + 8);
      doc.text('EduTrack — Système de gestion scolaire', MARGIN, footerY + 18, { width: CONTENT_W, align: 'center' });

      // Signature zones
      if (y + 60 < footerY) {
        const sigY = footerY - 50;
        doc.font('Helvetica').fontSize(8).fillColor('#555');
        doc.text('Signature du Directeur', MARGIN + 20, sigY, { width: 150, align: 'center' });
        doc.text('Cachet de l\'établissement', PAGE_W - MARGIN - 170, sigY, { width: 150, align: 'center' });
        doc.moveTo(MARGIN + 20, sigY + 30).lineTo(MARGIN + 170, sigY + 30).strokeColor('#ccc').stroke();
        doc.moveTo(PAGE_W - MARGIN - 170, sigY + 30).lineTo(PAGE_W - MARGIN - 20, sigY + 30).strokeColor('#ccc').stroke();
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Helper réutilisable : génère le PDF d'un bulletin à partir de son ID.
 * Récupère toutes les données nécessaires (lignes, école, config, classe...)
 * et retourne `{ buffer, fileName }` prêt à être envoyé.
 *
 * Utilisé par : route GET /pdf/:id, envoi WhatsApp, chatbot.
 *
 * @param {string} bulletinId
 * @returns {Promise<{ buffer: Buffer, fileName: string, bulletin: object } | null>}
 */
export async function generateBulletinPdfById(bulletinId) {
  const { data: bulletin, error } = await supabaseAdmin
    .from('bulletins')
    .select(`
      *,
      profiles!bulletins_student_id_fkey(id, first_name, last_name, massar_code),
      bulletin_lines(*),
      classes!bulletins_class_id_fkey(id, name, level, filiere, school_id)
    `)
    .eq('id', bulletinId)
    .single();
  if (error || !bulletin) return null;

  const [{ data: config }, { data: school }, { data: allBulletins }] = await Promise.all([
    supabaseAdmin
      .from('school_year_config').select('*')
      .eq('school_id', bulletin.school_id)
      .eq('academic_year', bulletin.academic_year)
      .maybeSingle(),
    supabaseAdmin
      .from('schools').select('id, name, address, phone')
      .eq('id', bulletin.school_id).single(),
    supabaseAdmin
      .from('bulletins').select('general_average')
      .eq('class_id', bulletin.class_id)
      .eq('academic_year', bulletin.academic_year)
      .eq('semester', bulletin.semester),
  ]);

  const validAvgs = (allBulletins || [])
    .filter(b => b.general_average != null)
    .map(b => Number(b.general_average));
  const classAverage = validAvgs.length
    ? validAvgs.reduce((a, b) => a + b, 0) / validAvgs.length
    : null;

  const lines = (bulletin.bulletin_lines || [])
    .sort((a, b) => (a.display_order || 999) - (b.display_order || 999));

  const buffer = await generateBulletinPdf({
    student: bulletin.profiles || {},
    cls: bulletin.classes || {},
    lines,
    generalAverage: bulletin.general_average,
    generalRank: bulletin.general_rank,
    totalStudents: bulletin.total_students_in_class,
    classAverage: classAverage != null ? Math.round(classAverage * 100) / 100 : null,
    config: config || {},
    school: school || {},
    academicYear: bulletin.academic_year,
    semester: bulletin.semester,
    notes: bulletin.notes,
  });

  const rawName = `${bulletin.profiles?.last_name || ''}_${bulletin.profiles?.first_name || ''}`.replace(/\s+/g, '_');
  const asciiName = rawName.replace(/[^\x20-\x7E]/g, '').replace(/[^a-zA-Z0-9_\-]/g, '') || 'eleve';
  const fileName = `bulletin_${asciiName}_${bulletin.academic_year.replace('/', '-')}_S${bulletin.semester}.pdf`;

  return { buffer, fileName, bulletin };
}
