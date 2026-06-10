/**
 * Rapport de contrôle (PDF) — généré côté serveur avec PDFKit + police arabe,
 * cohérent avec le bulletin et l'emploi du temps (en-tête officiel établissement,
 * noms arabes rendus correctement).
 */

import PDFDocument from 'pdfkit';
import path from 'path';
import { fileURLToPath } from 'url';
import { supabaseAdmin } from '../../config/supabase.js';
import { getEstablishmentConfig } from '../establishmentHeader.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ARABIC_FONT_PATH = path.join(__dirname, '..', 'whatsapp', 'chatbot', 'fonts', 'NotoNaskhArabic-Regular.ttf');
const ARABIC_FONT_NAME = 'ArabicFont';

const PAGE_W = 595.28; // A4 portrait
const MARGIN = 40;
const CONTENT_W = PAGE_W - MARGIN * 2;

const C = {
  primary:   '#2563eb',
  primaryDk: '#1e3a8a',
  headerBg:  '#eff6ff',
  border:    '#cbd5e1',
  good:      '#059669',
  mid:       '#d97706',
  bad:       '#dc2626',
  gray:      '#475569',
  light:     '#f8fafc',
};

const ARABIC_RE = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;
const hasArabic = (t) => ARABIC_RE.test(String(t || ''));

function smartText(doc, text, x, y, opts = {}) {
  const t = String(text == null ? '' : text);
  const useAr = hasArabic(t);
  if (useAr) { try { doc.font(ARABIC_FONT_NAME); } catch (_) {} }
  const o = useAr ? { ...opts, features: ['rtla', 'rclt'] } : opts;
  if (x == null) doc.text(t, o); else doc.text(t, x, y, o);
  if (useAr) { try { doc.font('Helvetica'); } catch (_) {} }
}

const toNum = (v) => {
  if (v == null || v === '') return NaN;
  return typeof v === 'string' ? parseFloat(v.replace(',', '.')) : Number(v);
};

/**
 * Calcule les statistiques d'un contrôle à partir des notes.
 */
function computeStats(notes, totalStudents) {
  const vals = notes.map(n => toNum(n.note)).filter(v => !isNaN(v));
  const total = vals.length;
  const sum = vals.reduce((a, b) => a + b, 0);
  const avg = total ? sum / total : 0;
  const high = vals.filter(v => v >= 15).length;
  const medium = vals.filter(v => v >= 10 && v < 15).length;
  const low = vals.filter(v => v < 10).length;

  let dispersion = 'Faible';
  if (total > 0) {
    const variance = vals.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / total;
    const sd = Math.sqrt(variance);
    if (sd > 4) dispersion = 'Élevé'; else if (sd > 2) dispersion = 'Moyen';
  }

  return {
    average: avg, total, totalStudents,
    notedPercentage: totalStudents ? Math.round((total / totalStudents) * 100) : 0,
    successRate: total ? Math.round(((high + medium) / total) * 100) : 0,
    minNote: total ? Math.min(...vals) : 0,
    maxNote: total ? Math.max(...vals) : 0,
    dispersion,
    distribution: {
      high:   total ? Math.round((high / total) * 100) : 0,
      medium: total ? Math.round((medium / total) * 100) : 0,
      low:    total ? Math.round((low / total) * 100) : 0,
    },
  };
}

/**
 * Génère le buffer PDF du rapport de contrôle.
 */
export function generateControlReportPdf({ control, cls, subjectName, students, notesByStudent, establishment }) {
  return new Promise((resolve, reject) => {
    try {
      const est = establishment || {};
      const chunks = [];
      const doc = new PDFDocument({ size: 'A4', margin: 0, bufferPages: true });
      try { doc.registerFont(ARABIC_FONT_NAME, ARABIC_FONT_PATH); } catch (_) {}
      doc.on('data', c => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const stats = computeStats(
        students.map(s => ({ note: notesByStudent.get(s.id)?.note })).filter(n => n.note != null),
        students.length
      );

      // ── EN-TÊTE OFFICIEL ───────────────────────────────────────────────
      const BANNER_H = 86;
      doc.rect(0, 0, PAGE_W, BANNER_H).fill(C.primaryDk);
      doc.rect(0, BANNER_H - 4, PAGE_W, 4).fill(C.primary);

      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(14);
      smartText(doc, est.establishment || cls?.name || 'Établissement', MARGIN, 14, { width: CONTENT_W - 170 });

      let hy = 33;
      doc.font('Helvetica').fontSize(7.5).fillColor('#bfdbfe');
      if (est.academy) { smartText(doc, est.academy, MARGIN, hy, { width: CONTENT_W - 170 }); hy += 10; }
      if (est.provincial_direction) { smartText(doc, est.provincial_direction, MARGIN, hy, { width: CONTENT_W - 170 }); hy += 10; }

      doc.font('Helvetica-Bold').fontSize(11).fillColor('#ffffff');
      doc.text('RAPPORT DE CONTRÔLE', MARGIN, Math.max(hy + 2, 62), { width: CONTENT_W - 170 });

      // Bloc droit : année + date
      doc.font('Helvetica').fontSize(8.5).fillColor('#dbeafe');
      const annee = cls?.academic_year || est.academic_year;
      if (annee) doc.text(`Année : ${annee}`, PAGE_W - MARGIN - 160, 18, { width: 160, align: 'right' });
      doc.text(`Édité le ${new Date().toLocaleDateString('fr-FR')}`, PAGE_W - MARGIN - 160, 32, { width: 160, align: 'right' });

      let y = BANNER_H + 18;

      // ── INFOS GÉNÉRALES ────────────────────────────────────────────────
      doc.fillColor(C.primaryDk).font('Helvetica-Bold').fontSize(12).text('Informations générales', MARGIN, y);
      y += 20;

      const info = (label, value) => {
        doc.font('Helvetica-Bold').fontSize(9.5).fillColor(C.gray).text(label, MARGIN, y, { continued: false });
        doc.font('Helvetica').fontSize(9.5).fillColor('#111827');
        smartText(doc, String(value ?? '—'), MARGIN + 130, y, { width: CONTENT_W - 130 });
        y += 16;
      };
      info('Contrôle :', control.name);
      if (subjectName) info('Matière :', subjectName);
      info('Classe :', cls?.name);
      info('Date :', control.date ? new Date(control.date).toLocaleDateString('fr-FR') : '—');
      if (control.start_time || control.end_time)
        info('Horaire :', `${(control.start_time || '').slice(0,5)} - ${(control.end_time || '').slice(0,5)}`);
      if (control.description) info('Description :', control.description);

      y += 8;

      // ── STATISTIQUES ───────────────────────────────────────────────────
      doc.fillColor(C.primaryDk).font('Helvetica-Bold').fontSize(12).text('Statistiques', MARGIN, y);
      y += 20;

      const cardW = (CONTENT_W - 16) / 3;
      const cardH = 44;
      const statCards = [
        ['Moyenne', `${stats.average.toFixed(2)}/20`, C.primary],
        ['Élèves notés', `${stats.total}/${stats.totalStudents} (${stats.notedPercentage}%)`, C.gray],
        ['Taux de réussite', `${stats.successRate}%`, stats.successRate >= 50 ? C.good : C.bad],
        ['Note min', `${stats.minNote}/20`, C.bad],
        ['Note max', `${stats.maxNote}/20`, C.good],
        ['Dispersion', stats.dispersion, C.mid],
      ];
      statCards.forEach((s, i) => {
        const col = i % 3, row = Math.floor(i / 3);
        const cx = MARGIN + col * (cardW + 8);
        const cy = y + row * (cardH + 8);
        doc.roundedRect(cx, cy, cardW, cardH, 5).fill(C.light).strokeColor(C.border).lineWidth(0.5).stroke();
        doc.font('Helvetica').fontSize(8).fillColor(C.gray).text(s[0], cx + 8, cy + 7, { width: cardW - 16 });
        doc.font('Helvetica-Bold').fontSize(13).fillColor(s[2]);
        smartText(doc, s[1], cx + 8, cy + 21, { width: cardW - 16 });
      });
      y += cardH * 2 + 8 + 12;

      // ── RÉPARTITION DES NOTES ──────────────────────────────────────────
      doc.fillColor(C.primaryDk).font('Helvetica-Bold').fontSize(11).text('Répartition des notes', MARGIN, y);
      y += 16;
      const bars = [
        [`≥ 15/20`, stats.distribution.high, C.good],
        [`10 – 15/20`, stats.distribution.medium, C.mid],
        [`< 10/20`, stats.distribution.low, C.bad],
      ];
      bars.forEach(([label, pct, color]) => {
        doc.font('Helvetica').fontSize(9).fillColor(C.gray).text(label, MARGIN, y, { width: 80 });
        const barX = MARGIN + 85, barW = CONTENT_W - 85 - 45;
        doc.roundedRect(barX, y + 1, barW, 10, 3).fill('#e5e7eb');
        if (pct > 0) doc.roundedRect(barX, y + 1, Math.max(2, barW * pct / 100), 10, 3).fill(color);
        doc.font('Helvetica-Bold').fontSize(9).fillColor(color).text(`${pct}%`, barX + barW + 6, y, { width: 40 });
        y += 18;
      });
      y += 10;

      // ── TABLEAU DES NOTES PAR ÉLÈVE ────────────────────────────────────
      doc.fillColor(C.primaryDk).font('Helvetica-Bold').fontSize(11).text('Notes des élèves', MARGIN, y);
      y += 16;

      const colN = 28, colNote = 70, colName = CONTENT_W - colN - colNote;
      const drawHeaderRow = () => {
        doc.rect(MARGIN, y, CONTENT_W, 20).fill(C.headerBg);
        doc.fillColor(C.primaryDk).font('Helvetica-Bold').fontSize(9);
        doc.text('#', MARGIN + 6, y + 6, { width: colN - 6 });
        doc.text('Élève', MARGIN + colN + 4, y + 6, { width: colName - 8 });
        doc.text('Note', MARGIN + colN + colName, y + 6, { width: colNote, align: 'center' });
        y += 20;
      };
      drawHeaderRow();

      const sorted = [...students].sort((a, b) =>
        `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`, 'ar'));

      const rowH = 18;
      sorted.forEach((s, idx) => {
        if (y + rowH > 800) { // nouvelle page
          doc.addPage({ size: 'A4', margin: 0 });
          y = MARGIN;
          drawHeaderRow();
        }
        const noteData = notesByStudent.get(s.id);
        const noteVal = toNum(noteData?.note);
        const noteStr = isNaN(noteVal) ? '—' : `${noteVal}/20`;
        const noteColor = isNaN(noteVal) ? C.gray : noteVal >= 15 ? C.good : noteVal >= 10 ? C.mid : C.bad;

        if (idx % 2 === 1) doc.rect(MARGIN, y, CONTENT_W, rowH).fill(C.light);
        doc.fillColor(C.gray).font('Helvetica').fontSize(9).text(String(idx + 1), MARGIN + 6, y + 5, { width: colN - 6 });
        doc.fillColor('#111827');
        smartText(doc, `${s.last_name || ''} ${s.first_name || ''}`.trim(), MARGIN + colN + 4, y + 5, { width: colName - 8 });
        doc.font('Helvetica-Bold').fillColor(noteColor)
          .text(noteStr, MARGIN + colN + colName, y + 5, { width: colNote, align: 'center' });
        doc.strokeColor('#eef2f7').lineWidth(0.5).moveTo(MARGIN, y + rowH).lineTo(MARGIN + CONTENT_W, y + rowH).stroke();
        y += rowH;
      });

      // Cadre extérieur du tableau
      doc.rect(MARGIN, y - rowH * sorted.length - 20, CONTENT_W, rowH * sorted.length + 20)
        .strokeColor(C.border).lineWidth(0.8).stroke();

      // ── PIED DE PAGE ───────────────────────────────────────────────────
      const range = doc.bufferedPageRange();
      for (let i = 0; i < range.count; i++) {
        doc.switchToPage(range.start + i);
        doc.font('Helvetica').fontSize(7.5).fillColor('#94a3b8');
        doc.text(`EduTrack — Rapport de contrôle  •  Page ${i + 1}/${range.count}`,
          MARGIN, 812, { width: CONTENT_W, align: 'center' });
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Charge les données et génère le PDF pour un contrôle donné.
 * @returns {Promise<{ buffer: Buffer, fileName: string } | null>}
 */
export async function generateControlReportPdfForControl(controlId, teacherId) {
  // 1. Contrôle + classe
  const { data: control } = await supabaseAdmin
    .from('controls_plan')
    .select('id, name, date, start_time, end_time, description, class_id, teacher_id')
    .eq('id', controlId)
    .single();
  if (!control) return null;
  if (teacherId && control.teacher_id && control.teacher_id !== teacherId) {
    // un prof ne peut éditer que ses contrôles (admin : teacherId non transmis)
    return { forbidden: true };
  }

  const { data: cls } = await supabaseAdmin
    .from('classes')
    .select('id, name, level, filiere, academic_year, school_id')
    .eq('id', control.class_id)
    .single();

  // 2. Élèves de la classe
  const { data: students } = await supabaseAdmin
    .from('profiles')
    .select('id, first_name, last_name, massar_code')
    .eq('class_id', control.class_id)
    .eq('role', 'student');

  // 3. Notes du contrôle
  const { data: notes } = await supabaseAdmin
    .from('control_notes')
    .select('student_id, note, appreciation')
    .eq('control_id', controlId);
  const notesByStudent = new Map((notes || []).map(n => [n.student_id, n]));

  // 4. Matière du prof
  let subjectName = '';
  if (control.teacher_id) {
    const { data: ts } = await supabaseAdmin
      .from('teacher_subjects')
      .select('subjects(name)')
      .eq('teacher_id', control.teacher_id)
      .limit(1)
      .maybeSingle();
    subjectName = ts?.subjects?.name || '';
  }

  // 5. En-tête officiel
  const establishment = cls?.school_id
    ? await getEstablishmentConfig(cls.school_id, cls?.academic_year)
    : null;

  const buffer = await generateControlReportPdf({
    control, cls: cls || {}, subjectName,
    students: students || [], notesByStudent, establishment: establishment || {},
  });

  const safe = (control.name || 'controle').replace(/\s+/g, '_')
    .replace(/[^\x20-\x7E]/g, '').replace(/[^a-zA-Z0-9_\-]/g, '') || 'controle';
  return { buffer, fileName: `rapport_controle_${safe}.pdf` };
}
