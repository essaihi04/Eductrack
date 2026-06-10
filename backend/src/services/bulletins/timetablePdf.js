/**
 * Génération d'un emploi du temps hebdomadaire en PDF paysage.
 * Design élève : fond vert/emeraude, tableau clair, matière + prof + salle.
 */

import PDFDocument from 'pdfkit';
import path from 'path';
import { fileURLToPath } from 'url';
import { supabaseAdmin } from '../../config/supabase.js';
import { getEstablishmentConfig } from '../establishmentHeader.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ARABIC_FONT_PATH = path.join(__dirname, '..', 'whatsapp', 'chatbot', 'fonts', 'NotoNaskhArabic-Regular.ttf');
const ARABIC_FONT_NAME = 'ArabicFont';

// A4 Paysage
const PAGE_W = 841.89;
const PAGE_H = 595.28;
const MARGIN = 25;
const CONTENT_W = PAGE_W - MARGIN * 2;

// Palette émeraude — agréable pour les élèves
const C = {
  bannerBg:    '#064e3b',   // emerald-900
  bannerStrip: '#10b981',   // emerald-500
  headerCell:  '#065f46',   // emerald-800
  headerFg:    '#ffffff',
  dayCell:     '#059669',   // emerald-600
  dayFg:       '#ffffff',
  timeCell:    '#ecfdf5',   // emerald-50
  timeFg:      '#065f46',
  rowEven:     '#ffffff',
  rowOdd:      '#f0fdf4',   // emerald-50
  emptyCell:   '#f9fafb',
  border:      '#6ee7b7',   // emerald-300
  subject:     '#065f46',   // emerald-800 bold
  teacher:     '#374151',   // gray-700
  room:        '#9ca3af',   // gray-400
  footerBg:    '#064e3b',
  footerFg:    '#a7f3d0',
};

const DAY_ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const DAY_FR = {
  monday:    'Lundi',
  tuesday:   'Mardi',
  wednesday: 'Mercredi',
  thursday:  'Jeudi',
  friday:    'Vendredi',
  saturday:  'Samedi',
};

const ARABIC_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
function hasArabic(t) { return ARABIC_RE.test(String(t || '')); }

function smartCell(doc, text, x, y, w, opts = {}) {
  const t = String(text == null ? '' : text);
  if (!t) return;
  const useAr = hasArabic(t);
  if (useAr) doc.font(ARABIC_FONT_NAME);
  const finalOpts = useAr
    ? { ...opts, features: ['rtla', 'rclt'], width: w }
    : { ...opts, width: w };
  doc.text(t, x, y, finalOpts);
  if (useAr) { try { doc.font('Helvetica'); } catch (_) {} }
}

/**
 * Génère le PDF paysage de l'emploi du temps.
 *
 * @param {Object} params
 * @param {Object}  params.student        { first_name, last_name }
 * @param {Object}  params.cls            { name, academic_year, level }
 * @param {Object}  params.school         { name }
 * @param {Array}   params.timetableSlots []  (bruts depuis class_timetable)
 * @returns {Promise<Buffer>}
 */
export function generateTimetablePdf({ student, cls, school, timetableSlots, establishment }) {
  const est = establishment || {};
  return new Promise((resolve, reject) => {
    try {
      const chunks = [];
      const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 0, bufferPages: true });
      try { doc.registerFont(ARABIC_FONT_NAME, ARABIC_FONT_PATH); } catch (_) {}

      doc.on('data', c => chunks.push(c));
      doc.on('end',  () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // ── Organiser les créneaux ──────────────────────────────────────
      const byDay = {};
      (timetableSlots || []).forEach(s => {
        const day = s.day_of_week;
        if (!byDay[day]) byDay[day] = {};
        const key = `${(s.start_time || '').slice(0, 5)}|${(s.end_time || '').slice(0, 5)}`;
        byDay[day][key] = {
          subject: s.subject?.name || null,
          teacher: s.teacher
            ? `${s.teacher.first_name || ''} ${s.teacher.last_name || ''}`.trim()
            : null,
          room: s.room || null,
        };
      });

      // Créneaux horaires uniques (dédupliqués, triés par slot_order)
      const seen = new Set();
      const timeSlots = (timetableSlots || [])
        .slice()
        .sort((a, b) => (a.slot_order || 0) - (b.slot_order || 0))
        .reduce((acc, s) => {
          const key = `${(s.start_time || '').slice(0, 5)}|${(s.end_time || '').slice(0, 5)}`;
          if (!seen.has(key)) {
            seen.add(key);
            acc.push({
              key,
              start: (s.start_time || '').slice(0, 5),
              end:   (s.end_time   || '').slice(0, 5),
            });
          }
          return acc;
        }, []);

      // Jours ayant au moins un cours
      const activeDays = DAY_ORDER.filter(d => byDay[d] && Object.keys(byDay[d]).length > 0);

      // ── BANNIÈRE ────────────────────────────────────────────────────
      const BANNER_H = 80;
      doc.rect(0, 0, PAGE_W, BANNER_H).fill(C.bannerBg);
      doc.rect(0, BANNER_H - 4, PAGE_W, 4).fill(C.bannerStrip);

      // Logo placeholder circle
      const LOGO_X = MARGIN + 2;
      const LOGO_R = 28;
      const LOGO_CY = BANNER_H / 2 - 2;
      doc.circle(LOGO_X + LOGO_R, LOGO_CY, LOGO_R).fill(C.bannerStrip);
      doc.font('Helvetica-Bold').fontSize(10).fillColor(C.bannerBg);
      doc.text('EDT', LOGO_X + LOGO_R - 14, LOGO_CY - 6, { width: 28, align: 'center' });

      // Nom de l'établissement (config officielle > nom école)
      const nameX = LOGO_X + LOGO_R * 2 + 12;
      const nameW = CONTENT_W * 0.52;
      const schoolName = est.establishment || school?.name || 'École';
      doc.font('Helvetica-Bold').fontSize(15).fillColor('#ffffff');
      smartCell(doc, schoolName, nameX, 10, nameW, { lineBreak: false, ellipsis: true });

      // En-tête officiel : Académie / Direction provinciale (en arabe)
      let hY = 30;
      if (est.academy) {
        doc.font('Helvetica').fontSize(7).fillColor('#a7f3d0');
        smartCell(doc, est.academy, nameX, hY, nameW, { lineBreak: false, ellipsis: true });
        hY += 10;
      }
      if (est.provincial_direction) {
        doc.font('Helvetica').fontSize(7).fillColor('#a7f3d0');
        smartCell(doc, est.provincial_direction, nameX, hY, nameW, { lineBreak: false, ellipsis: true });
        hY += 10;
      }

      // Sous-titre
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#6ee7b7');
      doc.text('EMPLOI DU TEMPS HEBDOMADAIRE', nameX, Math.max(hY, 50), { width: nameW });

      // Infos élève (droite)
      const studentName = `${student.first_name || ''} ${student.last_name || ''}`.trim();
      doc.font('Helvetica-Bold').fontSize(12).fillColor('#ffffff');
      doc.text(`Eleve : ${studentName}`, PAGE_W - MARGIN - 240, 14, { width: 240, align: 'right' });
      doc.font('Helvetica').fontSize(10).fillColor('#6ee7b7');
      doc.text(`Classe : ${cls?.name || '—'}`, PAGE_W - MARGIN - 240, 34, { width: 240, align: 'right' });
      const annee = cls?.academic_year || est.academic_year;
      if (annee) {
        doc.text(`Annee : ${annee}`, PAGE_W - MARGIN - 240, 50, { width: 240, align: 'right' });
      }

      // ── CAS VIDE ────────────────────────────────────────────────────
      if (timeSlots.length === 0 || activeDays.length === 0) {
        doc.font('Helvetica').fontSize(13).fillColor('#374151');
        doc.text(
          "L'emploi du temps n'a pas encore ete configure pour cette classe.\nContactez l'administration.",
          MARGIN, BANNER_H + 60,
          { width: CONTENT_W, align: 'center' }
        );
        doc.end();
        return;
      }

      // ── TABLEAU ─────────────────────────────────────────────────────
      const TABLE_TOP    = BANNER_H + 8;
      const FOOTER_H     = 20;
      const HEADER_ROW_H = 26;
      const TIME_COL_W   = 58;
      const availW       = CONTENT_W - TIME_COL_W;
      const dayW         = Math.floor(availW / activeDays.length);
      const totalTableW  = TIME_COL_W + dayW * activeDays.length;
      const tableAvailH  = PAGE_H - TABLE_TOP - HEADER_ROW_H - FOOTER_H - 5;
      const rowH         = Math.max(38, Math.min(68, Math.floor(tableAvailH / timeSlots.length)));

      const tX = MARGIN;

      // En-tête du tableau ─ cellule "Horaire"
      doc.rect(tX, TABLE_TOP, TIME_COL_W, HEADER_ROW_H).fill(C.headerCell);
      doc.font('Helvetica-Bold').fontSize(8).fillColor(C.headerFg);
      doc.text('Horaire', tX + 3, TABLE_TOP + 8, { width: TIME_COL_W - 6, align: 'center' });

      // En-tête jours
      activeDays.forEach((day, i) => {
        const cx = tX + TIME_COL_W + i * dayW;
        doc.rect(cx, TABLE_TOP, dayW, HEADER_ROW_H).fill(C.dayCell);
        doc.font('Helvetica-Bold').fontSize(9).fillColor(C.dayFg);
        doc.text(DAY_FR[day], cx + 3, TABLE_TOP + 8, { width: dayW - 6, align: 'center' });
      });

      // Lignes de données
      timeSlots.forEach((slot, rowIdx) => {
        const rowY = TABLE_TOP + HEADER_ROW_H + rowIdx * rowH;
        const rowBg = rowIdx % 2 === 0 ? C.rowEven : C.rowOdd;

        // Cellule horaire
        doc.rect(tX, rowY, TIME_COL_W, rowH).fill(C.timeCell)
           .strokeColor(C.border).lineWidth(0.5).stroke();
        doc.font('Helvetica-Bold').fontSize(8).fillColor(C.timeFg);
        doc.text(slot.start, tX + 3, rowY + 8, { width: TIME_COL_W - 6, align: 'center' });
        doc.font('Helvetica').fontSize(7).fillColor('#6b7280');
        doc.text(slot.end,   tX + 3, rowY + 20, { width: TIME_COL_W - 6, align: 'center' });

        // Cellules jours
        activeDays.forEach((day, colIdx) => {
          const cx = tX + TIME_COL_W + colIdx * dayW;
          const cell = byDay[day]?.[slot.key];

          doc.rect(cx, rowY, dayW, rowH)
             .fill(cell ? rowBg : C.emptyCell)
             .strokeColor(C.border).lineWidth(0.5).stroke();

          if (cell) {
            let textY = rowY + 6;
            const pad = 5;

            // Matière
            if (cell.subject) {
              doc.font('Helvetica-Bold').fontSize(9).fillColor(C.subject);
              smartCell(doc, cell.subject, cx + pad, textY, dayW - pad * 2, { ellipsis: true, lineBreak: false });
              textY += 13;
            }
            // Professeur
            if (cell.teacher) {
              doc.font('Helvetica').fontSize(7.5).fillColor(C.teacher);
              smartCell(doc, `Prof: ${cell.teacher}`, cx + pad, textY, dayW - pad * 2, { ellipsis: true, lineBreak: false });
              textY += 11;
            }
            // Salle
            if (cell.room) {
              doc.font('Helvetica').fontSize(7).fillColor(C.room);
              doc.text(`Salle: ${cell.room}`, cx + pad, textY, { width: dayW - pad * 2, ellipsis: true, lineBreak: false });
            }
          }
        });
      });

      // Bordure extérieure du tableau
      doc.rect(tX, TABLE_TOP, totalTableW, HEADER_ROW_H + rowH * timeSlots.length)
         .strokeColor(C.headerCell).lineWidth(1).stroke();

      // ── PIED DE PAGE ────────────────────────────────────────────────
      const footerY = PAGE_H - FOOTER_H;
      doc.rect(0, footerY, PAGE_W, FOOTER_H).fill(C.footerBg);
      doc.font('Helvetica').fontSize(7).fillColor(C.footerFg);
      doc.text(
        `Genere le ${new Date().toLocaleDateString('fr-FR')}  |  EduTrack — Gestion scolaire intelligente`,
        MARGIN, footerY + 6,
        { width: CONTENT_W, align: 'center' }
      );

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Récupère toutes les données nécessaires depuis la DB et génère le PDF.
 *
 * @param {string} studentId
 * @returns {Promise<{ buffer: Buffer, fileName: string } | null>}
 */
export async function generateTimetablePdfForStudent(studentId) {
  const { data: student } = await supabaseAdmin
    .from('profiles')
    .select('id, first_name, last_name, class_id')
    .eq('id', studentId)
    .single();
  if (!student?.class_id) return null;

  const [{ data: cls }, { data: slots }] = await Promise.all([
    supabaseAdmin
      .from('classes')
      .select('id, name, level, filiere, academic_year, school_id')
      .eq('id', student.class_id)
      .single(),
    supabaseAdmin
      .from('class_timetable')
      .select('day_of_week, slot_order, start_time, end_time, room, subject:subjects(name), teacher:profiles!class_timetable_teacher_id_fkey(first_name, last_name)')
      .eq('class_id', student.class_id)
      .order('slot_order', { ascending: true }),
  ]);

  // En-tête officiel (académie / direction / établissement) — config référencée
  // automatiquement lors de l'import des listes d'élèves Massar.
  const establishment = cls?.school_id
    ? await getEstablishmentConfig(cls.school_id, cls?.academic_year)
    : null;

  const buffer = await generateTimetablePdf({
    student,
    cls:   cls || {},
    school: establishment?.school || {},
    establishment: establishment || {},
    timetableSlots: slots || [],
  });

  const safe = `${student.last_name || ''}_${student.first_name || ''}`
    .replace(/\s+/g, '_')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/[^a-zA-Z0-9_\-]/g, '') || 'eleve';
  const fileName = `emploi_du_temps_${safe}.pdf`;

  return { buffer, fileName };
}
