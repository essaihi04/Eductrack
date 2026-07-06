/**
 * Liste des élèves absents — export PDF (paysage A4).
 *
 * Généré côté backend avec PDFKit + NotoNaskhArabic pour que les noms d'élèves
 * et de parents en arabe s'affichent correctement (le jsPDF côté navigateur ne
 * gérait ni les glyphes arabes ni le shaping RTL → charabia).
 *
 * Colonnes : Photo, Élève, Classe, Date, Créneau, Matière, Parent(s),
 * Téléphone, Abs. envoyée, Vue, Justifié, Commentaire.
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

/** Compte les caractères arabes vs latins (lettres uniquement). */
function scriptRatio(text) {
  const s = String(text || '');
  let ar = 0, latin = 0;
  for (const ch of s) {
    if (ARABIC_RE.test(ch)) ar++;
    else if (/[A-Za-zÀ-ÖØ-öø-ÿ]/.test(ch)) latin++;
  }
  return { ar, latin };
}

/**
 * Rendu d'un texte pouvant contenir de l'arabe.
 *  - Pas d'arabe → police latine (celle en cours), rendu standard.
 *  - Majoritairement arabe → NotoNaskh + features RTL (shaping joint correct).
 *  - Mixte latin+arabe → NotoNaskh sans RTL (garde le latin lisible en LTR).
 */
function smartText(doc, text, x, y, opts = {}) {
  const t = String(text == null ? '' : text);
  const { ar, latin } = scriptRatio(t);
  const prev = doc._font?.name || 'Helvetica';
  if (ar === 0) { doc.text(t, x, y, opts); return; }
  doc.font(ARABIC_FONT_NAME);
  const features = ar >= latin
    ? [...(opts.features || []), ...ARABIC_FEATURES]
    : opts.features;
  const finalOpts = features ? { ...opts, features } : opts;
  doc.text(t, x, y, finalOpts);
  try { doc.font(prev); } catch (_) { doc.font('Helvetica'); }
}

/** Hauteur d'un texte pour une largeur donnée (police adaptée à l'arabe). */
function measure(doc, text, width, fontSize) {
  const t = String(text == null ? '' : text);
  const prev = doc._font?.name || 'Helvetica';
  if (ARABIC_RE.test(t)) doc.font(ARABIC_FONT_NAME);
  const h = doc.fontSize(fontSize).heightOfString(t || ' ', { width });
  try { doc.font(prev); } catch (_) { doc.font('Helvetica'); }
  return h;
}

// ──── Charte ────────────────────────────────────────────────────────────────
const C = {
  primary: '#2563eb',   // blue-600 (identique au jsPDF d'origine)
  ink:     '#111827',
  muted:   '#6b7280',
  line:    '#e5e7eb',
  zebra:   '#f9fafb',
  ok:      '#16a34a',
  bad:     '#dc2626',
  warn:    '#d97706',
};

const PAGE_W = 841.89; // A4 paysage
const PAGE_H = 595.28;
const MARGIN = 28;
const CONTENT_W = PAGE_W - 2 * MARGIN;

const COLS = [
  { key: 'photo',    label: 'Photo',        width: 26,  align: 'center' },
  { key: 'student',  label: 'Élève',        width: 108, align: 'left' },
  { key: 'class',    label: 'Classe',       width: 66,  align: 'left' },
  { key: 'date',     label: 'Date',         width: 52,  align: 'center' },
  { key: 'slot',     label: 'Créneau',      width: 78,  align: 'left' },
  { key: 'subject',  label: 'Matière',      width: 92,  align: 'left' },
  { key: 'parents',  label: 'Parent(s)',    width: 86,  align: 'left' },
  { key: 'phone',    label: 'Téléphone',    width: 76,  align: 'left' },
  { key: 'notified', label: 'Abs. envoyée', width: 42,  align: 'center' },
  { key: 'seen',     label: 'Vue',          width: 30,  align: 'center' },
  { key: 'justified',label: 'Justifié',     width: 52,  align: 'center' },
  { key: 'comment',  label: 'Commentaire',  width: 78,  align: 'left' },
];
// Ajuste la dernière colonne pour occuper toute la largeur restante.
COLS[COLS.length - 1].width = CONTENT_W - COLS.slice(0, -1).reduce((a, c) => a + c.width, 0);

const FONT_SIZE = 7.2;
const CELL_PAD = 3;
const ROW_MIN_H = 20;
const HEADER_H = 18;

function frDate(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).split('-');
  return d && m && y ? `${d}/${m}/${y}` : String(iso);
}

/** Prépare les 12 valeurs texte d'une ligne (hors photo). */
function rowValues(r) {
  const slot = [...new Set((r.sessions || [])
    .map(s => s.end_time ? `${s.start_time}-${s.end_time}` : s.start_time)
    .filter(Boolean))].join(', ') || '—';
  const subject = [...new Set((r.sessions || [])
    .map(s => s.subject).filter(v => v && v !== '—'))].join(', ') || '—';
  const parents = (r.parents || []).map(p => p.name).filter(Boolean).join(', ') || '—';
  const phone = (r.parents || []).map(p => p.phone).filter(Boolean).join(', ') || '—';
  return {
    student: r.student_name || '',
    class: `${r.class_name || '—'}${r.class_level ? ` (${r.class_level})` : ''}`,
    date: frDate(r.date),
    slot,
    subject,
    parents,
    phone,
    notified: r.absence_notified ? 'Oui' : 'Non',
    seen: r.seen_by_parent ? 'Oui' : 'Non',
    justified: r.justified === null ? 'Non traité' : (r.justified ? 'Justifiée' : 'Non justifiée'),
    comment: r.justification_comment || '',
  };
}

function drawHeaderRow(doc, y) {
  doc.save();
  doc.rect(MARGIN, y, CONTENT_W, HEADER_H).fill(C.primary);
  doc.restore();
  doc.font('Helvetica-Bold').fontSize(FONT_SIZE).fillColor('#ffffff');
  let x = MARGIN;
  for (const col of COLS) {
    doc.text(col.label, x + CELL_PAD, y + 5.5, {
      width: col.width - 2 * CELL_PAD, align: col.align, lineBreak: false, ellipsis: true,
    });
    x += col.width;
  }
  return y + HEADER_H;
}

/**
 * Génère le PDF de la liste des élèves absents.
 * @param {object} p
 * @param {Array}  p.absences   lignes agrégées (student_name, sessions, parents…)
 * @param {{start,end}} p.period
 * @param {string} p.schoolName
 * @param {Buffer|null} p.logoBuffer
 * @param {Object<string,Buffer>} p.photos  buffer avatar par r.key
 * @returns {Promise<Buffer>}
 */
export function generateAbsencesListPdf({ absences = [], period = {}, schoolName = '', logoBuffer = null, photos = {} }) {
  return new Promise((resolve, reject) => {
    try {
      const chunks = [];
      const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: MARGIN, bufferPages: true });
      try { doc.registerFont(ARABIC_FONT_NAME, ARABIC_FONT_PATH); } catch (_) {}
      doc.on('data', c => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // ── En-tête ──
      let y = MARGIN;
      if (logoBuffer) {
        drawSchoolLogo(doc, logoBuffer, MARGIN, y, { fit: [30, 30], align: 'center', valign: 'center' });
      }
      const titleX = logoBuffer ? MARGIN + 38 : MARGIN;
      doc.font('Helvetica-Bold').fontSize(14).fillColor(C.ink);
      smartText(doc, schoolName || 'Liste des élèves absents', titleX, y, { width: CONTENT_W - 40 });
      doc.font('Helvetica-Bold').fontSize(12).fillColor(C.ink);
      doc.text('Liste des élèves absents', titleX, y + 16);
      const { start, end } = period;
      doc.font('Helvetica').fontSize(9).fillColor(C.muted);
      doc.text(start === end ? `Date : ${frDate(start)}` : `Période : ${frDate(start)} → ${frDate(end)}`,
        titleX, y + 31);
      doc.text(`${absences.length} élève(s) absent(s)`, MARGIN, y + 16, { width: CONTENT_W, align: 'right' });
      y += 48;

      // ── Tableau ──
      y = drawHeaderRow(doc, y);

      if (absences.length === 0) {
        doc.font('Helvetica').fontSize(10).fillColor(C.muted);
        doc.text('Aucune absence sur cette période.', MARGIN, y + 12, { width: CONTENT_W, align: 'center' });
      }

      absences.forEach((r, idx) => {
        const vals = rowValues(r);
        // Hauteur de la ligne = max des hauteurs de cellule (min ROW_MIN_H).
        let rowH = ROW_MIN_H;
        for (const col of COLS) {
          if (col.key === 'photo') continue;
          const h = measure(doc, vals[col.key], col.width - 2 * CELL_PAD, FONT_SIZE) + 2 * CELL_PAD;
          if (h > rowH) rowH = h;
        }

        // Saut de page si nécessaire.
        if (y + rowH > PAGE_H - MARGIN) {
          doc.addPage({ size: 'A4', layout: 'landscape', margin: MARGIN });
          y = MARGIN;
          y = drawHeaderRow(doc, y);
        }

        // Zébrures.
        if (idx % 2 === 1) {
          doc.save();
          doc.rect(MARGIN, y, CONTENT_W, rowH).fill(C.zebra);
          doc.restore();
        }

        let x = MARGIN;
        for (const col of COLS) {
          if (col.key === 'photo') {
            const buf = photos[r.key];
            if (buf) {
              try {
                const s = Math.min(col.width - 6, rowH - 4, 16);
                doc.save();
                doc.image(buf, x + (col.width - s) / 2, y + (rowH - s) / 2, { fit: [s, s] });
                doc.restore();
              } catch (_) { /* format non supporté : ignoré */ }
            }
            x += col.width;
            continue;
          }
          // Couleur spécifique pour certaines colonnes.
          let color = C.ink;
          if (col.key === 'notified') color = r.absence_notified ? C.ok : C.bad;
          else if (col.key === 'justified') color = r.justified === null ? C.warn : (r.justified ? C.ok : C.bad);
          doc.font('Helvetica').fontSize(FONT_SIZE).fillColor(color);
          smartText(doc, vals[col.key], x + CELL_PAD, y + CELL_PAD, {
            width: col.width - 2 * CELL_PAD, align: col.align,
          });
          x += col.width;
        }

        // Ligne de séparation.
        doc.save();
        doc.strokeColor(C.line).lineWidth(0.4);
        doc.moveTo(MARGIN, y + rowH).lineTo(MARGIN + CONTENT_W, y + rowH).stroke();
        doc.restore();
        y += rowH;
      });

      // ── Bordures verticales + pieds de page ──
      const range = doc.bufferedPageRange();
      for (let i = 0; i < range.count; i++) {
        doc.switchToPage(range.start + i);
        doc.font('Helvetica').fontSize(8).fillColor(C.muted);
        doc.text(`Page ${i + 1} / ${range.count}`, MARGIN, PAGE_H - 20, { width: CONTENT_W, align: 'right' });
        const gen = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
        doc.text(`Généré le ${gen}`, MARGIN, PAGE_H - 20, { width: CONTENT_W });
      }

      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}
