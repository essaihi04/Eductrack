/**
 * Rapport pédagogique complet d'un élève — PDF moderne avec graphiques natifs.
 *
 * Génère un PDF A4 propre, lisible et sophistiqué :
 *   1. Bandeau d'en-tête (établissement, logo couleur, titre)
 *   2. Carte élève (nom, classe, période, code)
 *   3. KPIs synthétiques (4 cards : présence, participation, discipline, devoirs)
 *   4. Barres horizontales par matière (présence %)
 *   5. Radar comportement (participation / discipline / mini-éval)
 *   6. Courbe d'évolution journalière
 *   7. Tableau notes / contrôles
 *   8. Tableau détaillé par matière
 *   9. Analyse pédagogique IA (texte sanitizé)
 *  10. Pied de page numéroté avec établissement
 *
 * Toutes les chartes sont dessinées en primitives PDFKit — aucune dépendance
 * graphique externe (chartjs-node-canvas etc.) pour rester léger et déployable.
 *
 * Police :
 *   - Helvetica (Latin) pour la grande majorité du texte
 *   - NotoNaskhArabic auto-switch pour les noms / observations contenant de l'arabe
 */

import PDFDocument from 'pdfkit';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ──── Police arabe partagée avec bulletins/factures ────────────────────────
const ARABIC_FONT_PATH = path.join(__dirname, 'whatsapp', 'chatbot', 'fonts', 'NotoNaskhArabic-Regular.ttf');
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
  doc.text(t, x, y, finalOpts);
  if (useAr) doc.font(prev);
}

// ──── Charte graphique ──────────────────────────────────────────────────────
const C = {
  primary:    '#0f766e', // teal-700
  primaryLt:  '#14b8a6', // teal-500
  accent:     '#f59e0b', // amber-500
  ok:         '#10b981', // green-500
  warn:       '#f97316', // orange-500
  bad:        '#ef4444', // red-500
  ink:        '#0f172a',
  inkLt:      '#334155',
  muted:      '#64748b',
  line:       '#e2e8f0',
  bg:         '#f8fafc',
  bgCard:     '#ffffff',
};

const PAGE_W = 595.28;  // A4 portrait
const PAGE_H = 841.89;
const MARGIN = 36;
const CONTENT_W = PAGE_W - 2 * MARGIN;

// ──── Utilitaires ───────────────────────────────────────────────────────────

/** Nettoie un texte pour l'affichage Latin (préserve l'arabe géré par smartText). */
function cleanText(s) {
  if (s == null) return '';
  return String(s)
    .replace(/[━─]+/g, '—')
    .replace(/\*+/g, '')
    .replace(/[\u200B-\u200F\u202A-\u202E]/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/** Retourne une couleur selon un pourcentage 0-100. */
function colorByRate(pct) {
  if (pct == null) return C.muted;
  if (pct >= 80) return C.ok;
  if (pct >= 60) return C.primaryLt;
  if (pct >= 40) return C.accent;
  return C.bad;
}

function fmtPct(v) { return v == null ? '—' : `${v}%`; }
function fmtScore(v, max) { return v == null ? '—' : `${v}/${max}`; }
function frDate(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).split('-');
  return `${d}/${m}/${y}`;
}

// ──── Composants graphiques ────────────────────────────────────────────────

/** Carte rectangulaire arrondie (bg + border). */
function card(doc, x, y, w, h, { fill = C.bgCard, stroke = C.line, radius = 6 } = {}) {
  doc.save();
  doc.roundedRect(x, y, w, h, radius).fillAndStroke(fill, stroke);
  doc.restore();
}

/** KPI card : valeur + label + petite barre de progression facultative. */
function kpiCard(doc, x, y, w, h, { value, label, percent, color = C.primary, suffix = '' }) {
  card(doc, x, y, w, h, { fill: '#ffffff', stroke: C.line });
  // Bande supérieure colorée
  doc.save();
  doc.rect(x, y, w, 4).fill(color);
  doc.restore();

  // Valeur principale
  doc.font('Helvetica-Bold').fontSize(20).fillColor(C.ink);
  doc.text(String(value), x + 12, y + 14, { width: w - 24 });

  // Suffix (ex /5, %)
  if (suffix) {
    const valW = doc.widthOfString(String(value));
    doc.font('Helvetica').fontSize(11).fillColor(C.muted);
    doc.text(suffix, x + 12 + valW + 2, y + 23);
  }

  // Label
  doc.font('Helvetica').fontSize(8.5).fillColor(C.inkLt);
  doc.text(label.toUpperCase(), x + 12, y + h - 26, { width: w - 24, characterSpacing: 0.4 });

  // Mini progression bar
  if (percent != null) {
    const barX = x + 12;
    const barY = y + h - 12;
    const barW = w - 24;
    doc.save();
    doc.roundedRect(barX, barY, barW, 4, 2).fill(C.bg);
    doc.roundedRect(barX, barY, barW * Math.min(1, Math.max(0, percent / 100)), 4, 2).fill(color);
    doc.restore();
  }
}

/** Barre horizontale unique avec libellé et valeur. */
function hbar(doc, x, y, w, label, value, max, color) {
  const LABEL_W = 120;
  const VAL_W = 50;
  const BAR_W = w - LABEL_W - VAL_W - 10;

  // Label
  doc.font('Helvetica').fontSize(9).fillColor(C.inkLt);
  smartText(doc, cleanText(label), x, y + 2, { width: LABEL_W - 8, ellipsis: true });

  // Bar bg
  doc.save();
  doc.roundedRect(x + LABEL_W, y + 1, BAR_W, 10, 3).fill(C.bg);
  if (max > 0 && value != null) {
    const ratio = Math.max(0, Math.min(1, value / max));
    doc.roundedRect(x + LABEL_W, y + 1, BAR_W * ratio, 10, 3).fill(color || C.primaryLt);
  }
  doc.restore();

  // Valeur droite
  doc.font('Helvetica-Bold').fontSize(9).fillColor(C.ink);
  const txt = max === 100 ? `${value ?? 0}%` : `${value ?? 0}/${max}`;
  doc.text(txt, x + LABEL_W + BAR_W + 6, y + 1, { width: VAL_W, align: 'right' });
}

/** Donut chart simple (3 segments max : présent / retard / absent). */
function donut(doc, cx, cy, rOuter, rInner, segments, { centerText, centerSubText } = {}) {
  const total = segments.reduce((a, s) => a + (s.value || 0), 0) || 1;
  let startAngle = -Math.PI / 2;

  for (const seg of segments) {
    const angle = (seg.value / total) * 2 * Math.PI;
    if (angle <= 0) continue;
    drawArc(doc, cx, cy, rOuter, rInner, startAngle, startAngle + angle, seg.color);
    startAngle += angle;
  }

  // Texte central
  if (centerText != null) {
    doc.font('Helvetica-Bold').fontSize(16).fillColor(C.ink);
    const tw = doc.widthOfString(String(centerText));
    doc.text(String(centerText), cx - tw / 2, cy - 10);
  }
  if (centerSubText) {
    doc.font('Helvetica').fontSize(8).fillColor(C.muted);
    const tw = doc.widthOfString(centerSubText);
    doc.text(centerSubText, cx - tw / 2, cy + 8);
  }
}

/** Trace un anneau partiel (segment de donut). */
function drawArc(doc, cx, cy, rOuter, rInner, start, end, color) {
  doc.save();
  const steps = Math.max(8, Math.ceil(((end - start) * 180) / Math.PI / 4));
  doc.path('');
  // Outer arc
  doc.moveTo(cx + rOuter * Math.cos(start), cy + rOuter * Math.sin(start));
  for (let i = 1; i <= steps; i++) {
    const a = start + ((end - start) * i) / steps;
    doc.lineTo(cx + rOuter * Math.cos(a), cy + rOuter * Math.sin(a));
  }
  // Inner arc reverse
  for (let i = steps; i >= 0; i--) {
    const a = start + ((end - start) * i) / steps;
    doc.lineTo(cx + rInner * Math.cos(a), cy + rInner * Math.sin(a));
  }
  doc.closePath().fill(color);
  doc.restore();
}

/** Mini-radar 3 axes (participation / discipline / mini-éval). */
function radar3(doc, cx, cy, radius, values, labels, maxValues) {
  const axes = 3;
  // Grille
  doc.save();
  doc.strokeColor(C.line).lineWidth(0.6);
  for (let k = 1; k <= 3; k++) {
    const r = (radius * k) / 3;
    const pts = [];
    for (let i = 0; i < axes; i++) {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / axes;
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
    doc.polygon(...pts).stroke();
  }
  // Axes
  for (let i = 0; i < axes; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / axes;
    doc.moveTo(cx, cy).lineTo(cx + radius * Math.cos(a), cy + radius * Math.sin(a)).stroke();
  }
  doc.restore();

  // Polygone valeurs
  const pts = [];
  for (let i = 0; i < axes; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / axes;
    const v = values[i] == null ? 0 : (values[i] / (maxValues[i] || 1));
    const r = radius * Math.max(0, Math.min(1, v));
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  doc.save();
  doc.fillOpacity(0.25);
  doc.polygon(...pts).fill(C.primaryLt);
  doc.fillOpacity(1).strokeColor(C.primary).lineWidth(1.5).polygon(...pts).stroke();
  // Points
  for (const [px, py] of pts) doc.circle(px, py, 2.5).fill(C.primary);
  doc.restore();

  // Labels axes
  doc.font('Helvetica-Bold').fontSize(8).fillColor(C.inkLt);
  for (let i = 0; i < axes; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / axes;
    const tx = cx + (radius + 16) * Math.cos(a);
    const ty = cy + (radius + 16) * Math.sin(a) - 4;
    const lbl = labels[i] + (values[i] != null ? ` ${values[i]}/${maxValues[i]}` : '');
    const w = doc.widthOfString(lbl);
    doc.text(lbl, tx - w / 2, ty);
  }
}

/** Courbe (sparkline) d'évolution journalière. */
function lineChart(doc, x, y, w, h, series, { yMax = 100, color = C.primary, dates = [] } = {}) {
  // Bg + axes
  doc.save();
  doc.roundedRect(x, y, w, h, 4).fill('#ffffff').strokeColor(C.line).lineWidth(0.5).stroke();
  doc.restore();

  // Y grid (4 lignes)
  doc.save();
  doc.strokeColor(C.line).lineWidth(0.4).dash(2, { space: 2 });
  for (let i = 1; i < 4; i++) {
    const yy = y + (h / 4) * i;
    doc.moveTo(x + 6, yy).lineTo(x + w - 6, yy).stroke();
  }
  doc.undash();
  doc.restore();

  // Filter valid points
  const valid = series.map((v, i) => ({ v, i })).filter(p => p.v != null);
  if (valid.length === 0) {
    doc.font('Helvetica').fontSize(9).fillColor(C.muted);
    doc.text('Pas de données pour cette période', x, y + h / 2 - 6, { width: w, align: 'center' });
    return;
  }

  const n = series.length;
  const xAt = (i) => x + 10 + (w - 20) * (n === 1 ? 0.5 : i / (n - 1));
  const yAt = (v) => y + h - 8 - ((h - 16) * Math.max(0, Math.min(1, v / yMax)));

  // Line
  doc.save();
  doc.strokeColor(color).lineWidth(1.5);
  let started = false;
  for (const p of valid) {
    const px = xAt(p.i);
    const py = yAt(p.v);
    if (!started) { doc.moveTo(px, py); started = true; }
    else doc.lineTo(px, py);
  }
  doc.stroke();
  doc.restore();

  // Points
  for (const p of valid) {
    doc.circle(xAt(p.i), yAt(p.v), 2.2).fill(color);
  }

  // Dates labels (uniquement extrémités + max 3)
  if (dates.length) {
    doc.font('Helvetica').fontSize(7).fillColor(C.muted);
    const indices = n <= 3 ? dates.map((_, i) => i) : [0, Math.floor(n / 2), n - 1];
    for (const i of indices) {
      const lbl = frDate(dates[i]).slice(0, 5); // dd/mm
      const tw = doc.widthOfString(lbl);
      doc.text(lbl, xAt(i) - tw / 2, y + h - 6);
    }
  }
}

/** Tableau générique compact. */
function table(doc, x, y, cols, rows, { headerColor = C.primary, zebra = true } = {}) {
  const colWidths = cols.map(c => c.width);
  const totalW = colWidths.reduce((a, b) => a + b, 0);
  const rowH = 18;

  // Header
  doc.save();
  doc.rect(x, y, totalW, rowH).fill(headerColor);
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#ffffff');
  let cx = x;
  for (const col of cols) {
    doc.text(col.label, cx + 6, y + 5, { width: col.width - 12, align: col.align || 'left' });
    cx += col.width;
  }
  doc.restore();

  // Rows
  let cy = y + rowH;
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    if (zebra && r % 2 === 1) {
      doc.save();
      doc.rect(x, cy, totalW, rowH).fill(C.bg);
      doc.restore();
    }
    doc.font('Helvetica').fontSize(8.5).fillColor(C.ink);
    cx = x;
    for (let i = 0; i < cols.length; i++) {
      const col = cols[i];
      const v = cleanText(String(row[i] ?? '—'));
      smartText(doc, v, cx + 6, cy + 5, {
        width: col.width - 12,
        align: col.align || 'left',
        ellipsis: true,
        lineBreak: false,
      });
      cx += col.width;
    }
    // Ligne séparatrice
    doc.save();
    doc.strokeColor(C.line).lineWidth(0.3);
    doc.moveTo(x, cy + rowH).lineTo(x + totalW, cy + rowH).stroke();
    doc.restore();
    cy += rowH;
  }

  // Bordure globale
  doc.save();
  doc.strokeColor(C.line).lineWidth(0.6).rect(x, y, totalW, cy - y).stroke();
  doc.restore();

  return cy;
}

// ──── Génération principale ────────────────────────────────────────────────

/**
 * Génère le PDF de rapport pédagogique d'un élève.
 *
 * @param {object} payload
 * @param {object} payload.periodData    Objet renvoyé par collectStudentPeriodData
 * @param {object} payload.aiReport      { fr?: string, ar?: string } — texte IA
 * @returns {Promise<Buffer>}
 */
export function generateStudentReportPdf({ periodData, aiReport }) {
  return new Promise((resolve, reject) => {
    try {
      const chunks = [];
      const doc = new PDFDocument({ size: 'A4', margin: MARGIN, bufferPages: true });
      try { doc.registerFont(ARABIC_FONT_NAME, ARABIC_FONT_PATH); } catch (_) {}

      doc.on('data', c => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      drawDocument(doc, periodData, aiReport);
      drawFooters(doc, periodData);
      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

function drawDocument(doc, periodData, aiReport) {
  const st = periodData.student;
  const os = periodData.overallStats;

  // ═══════════════ HEADER BAND ═══════════════
  doc.save();
  doc.rect(0, 0, PAGE_W, 92).fill(C.primary);
  doc.restore();

  // Logo placeholder (cercle blanc avec initiales école)
  const initials = (st.schoolName || 'E').split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
  doc.save();
  doc.circle(MARGIN + 18, 46, 18).fill('#ffffff');
  doc.font('Helvetica-Bold').fontSize(13).fillColor(C.primary);
  const tw = doc.widthOfString(initials);
  doc.text(initials, MARGIN + 18 - tw / 2, 39);
  doc.restore();

  // School + title
  doc.font('Helvetica-Bold').fontSize(15).fillColor('#ffffff');
  smartText(doc, cleanText(st.schoolName) || 'Établissement scolaire', MARGIN + 50, 24, { width: CONTENT_W - 60 });
  doc.font('Helvetica').fontSize(10).fillColor('#e0f2fe');
  doc.text('Rapport pédagogique individuel', MARGIN + 50, 46, { width: CONTENT_W - 60 });
  // Date génération à droite
  doc.font('Helvetica').fontSize(9).fillColor('#cffafe');
  const genDate = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  doc.text(`Généré le ${genDate}`, MARGIN, 66, { width: CONTENT_W, align: 'right' });

  let y = 110;

  // ═══════════════ STUDENT CARD ═══════════════
  card(doc, MARGIN, y, CONTENT_W, 58, { fill: '#ffffff', stroke: C.line });
  // Barre latérale colorée
  doc.save();
  doc.rect(MARGIN, y, 4, 58).fill(C.accent);
  doc.restore();

  doc.font('Helvetica-Bold').fontSize(13).fillColor(C.ink);
  smartText(doc, cleanText(`${st.firstName || ''} ${st.lastName || ''}`).trim() || 'Élève', MARGIN + 14, y + 9);

  doc.font('Helvetica').fontSize(9).fillColor(C.muted);
  const classLine = `Classe : ${cleanText(st.className) || '—'}${st.level ? `   •   Niveau : ${st.level}` : ''}`;
  smartText(doc, classLine, MARGIN + 14, y + 28);

  doc.font('Helvetica').fontSize(8.5).fillColor(C.inkLt);
  const p = periodData.period;
  doc.text(`Période analysée : ${frDate(p.startDate)} → ${frDate(p.endDate)}   •   ${os.totalDays} jour(s)   •   ${os.totalSessions} séance(s)`,
    MARGIN + 14, y + 42);

  y += 70;

  // ═══════════════ KPI ROW (4 cards) ═══════════════
  const kpiW = (CONTENT_W - 24) / 4;
  const kpiH = 64;
  const presencePct = os.presenceRate;
  const partPct = os.avgParticipation != null ? Math.round((os.avgParticipation / 5) * 100) : null;
  const discPct = os.avgDiscipline != null ? Math.round((os.avgDiscipline / 5) * 100) : null;
  const hwPct = os.homeworkRate;

  kpiCard(doc, MARGIN, y, kpiW, kpiH,
    { value: fmtPct(presencePct), label: 'Présence', percent: presencePct, color: colorByRate(presencePct) });
  kpiCard(doc, MARGIN + (kpiW + 8), y, kpiW, kpiH,
    { value: os.avgParticipation ?? '—', suffix: ' /5', label: 'Participation', percent: partPct, color: colorByRate(partPct) });
  kpiCard(doc, MARGIN + 2 * (kpiW + 8), y, kpiW, kpiH,
    { value: os.avgDiscipline ?? '—', suffix: ' /5', label: 'Discipline', percent: discPct, color: colorByRate(discPct) });
  kpiCard(doc, MARGIN + 3 * (kpiW + 8), y, kpiW, kpiH,
    { value: fmtPct(hwPct), label: 'Devoirs faits', percent: hwPct, color: colorByRate(hwPct) });

  y += kpiH + 16;

  // ═══════════════ VISUALS ROW : Donut + Radar ═══════════════
  const visualH = 150;
  const halfW = (CONTENT_W - 12) / 2;

  // ─ Donut présence
  card(doc, MARGIN, y, halfW, visualH, { fill: '#ffffff', stroke: C.line });
  doc.font('Helvetica-Bold').fontSize(10).fillColor(C.inkLt);
  doc.text('RÉPARTITION DE PRÉSENCE', MARGIN + 14, y + 12, { characterSpacing: 0.4 });

  const pr = os.presence || {};
  const donutSegs = [
    { value: pr.present || 0, color: C.ok, label: 'Présent' },
    { value: pr.late || 0,    color: C.accent, label: 'Retard' },
    { value: pr.absent || 0,  color: C.bad, label: 'Absent' },
  ];
  donut(doc, MARGIN + 56, y + 90, 38, 22, donutSegs, {
    centerText: fmtPct(presencePct),
    centerSubText: 'présence',
  });
  // Légende
  let lx = MARGIN + 116;
  let ly = y + 56;
  for (const s of donutSegs) {
    doc.save();
    doc.roundedRect(lx, ly, 9, 9, 2).fill(s.color);
    doc.restore();
    doc.font('Helvetica').fontSize(9).fillColor(C.ink);
    doc.text(`${s.label} : ${s.value}`, lx + 14, ly - 1);
    ly += 16;
  }

  // ─ Radar comportement
  card(doc, MARGIN + halfW + 12, y, halfW, visualH, { fill: '#ffffff', stroke: C.line });
  doc.font('Helvetica-Bold').fontSize(10).fillColor(C.inkLt);
  doc.text('PROFIL COMPORTEMENTAL', MARGIN + halfW + 26, y + 12, { characterSpacing: 0.4 });

  radar3(doc,
    MARGIN + halfW + 12 + halfW / 2,
    y + visualH / 2 + 14,
    44,
    [os.avgParticipation, os.avgDiscipline, os.avgMiniEval],
    ['Particip.', 'Discipl.', 'Mini-éval'],
    [5, 5, 10],
  );

  y += visualH + 16;

  // ═══════════════ BAR CHART : présence par matière ═══════════════
  if (Object.keys(periodData.subjectStats || {}).length > 0) {
    const entries = Object.entries(periodData.subjectStats);
    const blockH = 28 + entries.length * 14 + 10;
    if (y + blockH > PAGE_H - 60) { doc.addPage(); y = MARGIN; }

    card(doc, MARGIN, y, CONTENT_W, blockH, { fill: '#ffffff', stroke: C.line });
    doc.font('Helvetica-Bold').fontSize(10).fillColor(C.inkLt);
    doc.text('TAUX DE PRÉSENCE PAR MATIÈRE', MARGIN + 14, y + 12, { characterSpacing: 0.4 });

    let by = y + 32;
    for (const [name, stat] of entries) {
      const pct = stat.totalTracked > 0
        ? Math.round((stat.presence.present / stat.totalTracked) * 100)
        : null;
      hbar(doc, MARGIN + 14, by, CONTENT_W - 28, name, pct, 100, colorByRate(pct));
      by += 14;
    }
    y += blockH + 14;
  }

  // ═══════════════ COURBE D'ÉVOLUTION ═══════════════
  if ((periodData.dailyEvolution || []).length > 1) {
    const evoH = 130;
    if (y + evoH > PAGE_H - 60) { doc.addPage(); y = MARGIN; }
    card(doc, MARGIN, y, CONTENT_W, evoH, { fill: '#ffffff', stroke: C.line });
    doc.font('Helvetica-Bold').fontSize(10).fillColor(C.inkLt);
    doc.text('ÉVOLUTION JOURNALIÈRE — PRÉSENCE (%)', MARGIN + 14, y + 12, { characterSpacing: 0.4 });

    const dates = periodData.dailyEvolution.map(d => d.date);
    const series = periodData.dailyEvolution.map(d => d.presenceRate);
    lineChart(doc, MARGIN + 14, y + 32, CONTENT_W - 28, evoH - 42, series, {
      yMax: 100, color: C.primary, dates,
    });
    y += evoH + 14;
  }

  // ═══════════════ NOTES / CONTRÔLES ═══════════════
  if ((os.grades || []).length > 0) {
    if (y + 60 > PAGE_H - 60) { doc.addPage(); y = MARGIN; }
    doc.font('Helvetica-Bold').fontSize(11).fillColor(C.ink);
    doc.text('Notes & contrôles', MARGIN, y);
    y += 16;

    const cols = [
      { label: 'Matière',  width: 130, align: 'left' },
      { label: 'Chapitre', width: 220, align: 'left' },
      { label: 'Note',     width: 80,  align: 'center' },
      { label: 'Date',     width: 93,  align: 'center' },
    ];
    const rows = os.grades.map(g => [
      g.subject || '—',
      g.topic || '—',
      `${g.note}/${g.max}`,
      frDate(g.date),
    ]);
    y = table(doc, MARGIN, y, cols, rows.slice(0, 12), { headerColor: C.primary }) + 14;
  }

  // ═══════════════ TABLEAU MATIÈRES DÉTAILLÉ ═══════════════
  if (Object.keys(periodData.subjectStats || {}).length > 0) {
    if (y + 60 > PAGE_H - 60) { doc.addPage(); y = MARGIN; }
    doc.font('Helvetica-Bold').fontSize(11).fillColor(C.ink);
    doc.text('Détail par matière', MARGIN, y);
    y += 16;

    const cols = [
      { label: 'Matière',     width: 130, align: 'left' },
      { label: 'Séances',     width: 56,  align: 'center' },
      { label: 'Présence',    width: 70,  align: 'center' },
      { label: 'Particip.',   width: 60,  align: 'center' },
      { label: 'Mini-éval',   width: 60,  align: 'center' },
      { label: 'Chapitres',   width: 147, align: 'left' },
    ];
    const rows = Object.entries(periodData.subjectStats).map(([name, s]) => [
      name,
      String(s.totalSessions),
      `${s.presence.present}/${s.totalTracked}`,
      s.avgParticipation != null ? `${s.avgParticipation}/5` : '—',
      s.avgMiniEval != null ? `${s.avgMiniEval}/10` : '—',
      (s.topics || []).join(' • ') || '—',
    ]);
    y = table(doc, MARGIN, y, cols, rows, { headerColor: C.primaryLt }) + 14;
  }

  // ═══════════════ ANALYSE PÉDAGOGIQUE (IA) ═══════════════
  // Rendu multi-bloc : on parse les sections (*Titre*) pour faire un titre gras
  // + paragraphes. Chaque ligne passe par smartText pour gérer l'arabe (nom de
  // l'enfant / école) sans mojibake.
  const aiBlocks = parseAiBlocks(aiReport);
  if (aiBlocks.length > 0) {
    if (y + 80 > PAGE_H - 60) { doc.addPage(); y = MARGIN; }
    doc.font('Helvetica-Bold').fontSize(11).fillColor(C.ink);
    doc.text('Analyse pédagogique', MARGIN, y);
    y += 14;

    // Encadré global avec barre latérale
    const blockX = MARGIN + 14;
    const blockW = CONTENT_W - 24;
    // Pré-calcul hauteur pour dessiner la card en une fois
    let measuredH = 12;
    for (const b of aiBlocks) {
      if (b.type === 'h2') {
        measuredH += 18;
      } else {
        const h = doc.font('Helvetica').fontSize(9.5).heightOfString(b.text, { width: blockW });
        measuredH += h + 4;
      }
    }
    if (y + measuredH > PAGE_H - 50) { doc.addPage(); y = MARGIN; }

    card(doc, MARGIN, y, CONTENT_W, measuredH + 8, { fill: C.bg, stroke: C.line });
    doc.save();
    doc.rect(MARGIN, y, 3, measuredH + 8).fill(C.primary);
    doc.restore();

    let ay = y + 10;
    for (const b of aiBlocks) {
      if (ay > PAGE_H - 50) {
        doc.addPage();
        ay = MARGIN;
      }
      if (b.type === 'h2') {
        doc.font('Helvetica-Bold').fontSize(10).fillColor(C.primary);
        smartText(doc, b.text, blockX, ay, { width: blockW });
        ay += 16;
      } else {
        doc.font('Helvetica').fontSize(9.5).fillColor(C.inkLt);
        smartText(doc, b.text, blockX, ay, { width: blockW, align: 'left' });
        const h = doc.heightOfString(b.text, { width: blockW });
        ay += h + 4;
      }
    }
    y += measuredH + 16;
  }

  // ═══════════════ AXES DE PROGRÈS (si difficultés) ═══════════════
  if ((os.difficultySubjects || []).length > 0) {
    if (y + 50 > PAGE_H - 60) { doc.addPage(); y = MARGIN; }
    doc.font('Helvetica-Bold').fontSize(11).fillColor(C.ink);
    doc.text('Axes de progrès recommandés', MARGIN, y);
    y += 14;
    card(doc, MARGIN, y, CONTENT_W, 36, { fill: '#fef3c7', stroke: '#fde68a' });
    doc.font('Helvetica').fontSize(9).fillColor('#92400e');
    smartText(doc,
      `Matière(s) à renforcer : ${os.difficultySubjects.join(', ')}.  Un accompagnement ciblé est conseillé sur les chapitres récents.`,
      MARGIN + 12, y + 11, { width: CONTENT_W - 24 });
    y += 50;
  }
}

/** Pied de page numéroté sur toutes les pages. */
function drawFooters(doc, periodData) {
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    const yFooter = PAGE_H - 24;
    doc.save();
    doc.strokeColor(C.line).lineWidth(0.5);
    doc.moveTo(MARGIN, yFooter - 6).lineTo(PAGE_W - MARGIN, yFooter - 6).stroke();
    doc.restore();
    doc.font('Helvetica').fontSize(8).fillColor(C.muted);
    const left = cleanText(periodData.student?.schoolName) || 'Eductrack';
    doc.text(left, MARGIN, yFooter, { width: CONTENT_W / 2 });
    doc.text(`Page ${i + 1} / ${range.count}`, MARGIN + CONTENT_W / 2, yFooter,
      { width: CONTENT_W / 2, align: 'right' });
  }
}

/**
 * Parse le texte IA (FR uniquement pour le PDF Latin) en blocs structurés
 * `{ type: 'h2'|'p', text }`. Une ligne de la forme `*Titre*` (markdown WhatsApp)
 * devient un titre h2. Les listes sont préservées mais rendues comme paragraphes.
 *
 * Règles de nettoyage :
 *  - Emojis WhatsApp courants → puces ASCII (•) ou symboles latins (✓ ✗ !)
 *  - Lignes de séparation `━━━` ignorées
 *  - On NE strip PAS l'arabe : smartText gère le rendu plus tard.
 */
function parseAiBlocks(aiReport) {
  if (!aiReport) return [];
  let raw = '';
  if (typeof aiReport === 'string') raw = aiReport;
  else raw = aiReport.fr || aiReport.ar || '';
  if (!raw) return [];

  // Coupe la partie arabe si présente (séparateur ━━━) — le PDF rend la version FR
  // (l'arabe complet apparaîtrait en pavé RTL difficile à intégrer dans la mise
  // en page actuelle ; le nom arabe dans une ligne FR reste géré par smartText).
  raw = raw.split(/━{3,}|─{3,}/)[0];

  // Remplacements emoji → texte/symboles Latin1-compatibles.
  // On garde la STRUCTURE (puces) mais on retire les pictogrammes décoratifs.
  const EMOJI_MAP = [
    [/✅/gu, '✓ '], [/❌/gu, '✗ '], [/⚠️|⚠/gu, '! '],
    [/💪|🎉|👏|🌟|⭐/gu, ''],          // valorisation
    [/📌|💡|🎯/gu, '→ '],              // conseil/objectif
    [/📊|📈|📉|📚|📖|📝|📋|📓/gu, ''],
    [/🏫|🎒|🎓|👤|👥/gu, ''],
    [/📅|🗓️|🗓|⏰|🕐/gu, ''],
    [/🙋|✍️|🧪|📞|😴/gu, ''],
    [/▸|►|❯/gu, '• '],
  ];
  let txt = String(raw);
  for (const [re, rep] of EMOJI_MAP) txt = txt.replace(re, rep);
  // Vire le RESTE des emojis pictographiques que PDFKit Latin1 ne peut pas rendre,
  // tout en PRÉSERVANT l'arabe (\u0600-\u06FF) et la ponctuation latine.
  txt = txt.replace(
    /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F100}-\u{1F1FF}\u{1F900}-\u{1F9FF}\u{2700}-\u{27BF}]/gu,
    ''
  );
  // Caractères de contrôle bidi
  txt = txt.replace(/[\u200B-\u200F\u202A-\u202E]/g, '');
  // Lignes de séparation graphique ASCII restantes
  txt = txt.replace(/^[\s—\-–=•·]{4,}$/gm, '');

  // Découpe en blocs
  const lines = txt.split('\n').map(l => l.trimEnd());
  const blocks = [];
  let buffer = [];
  const flushParagraph = () => {
    if (buffer.length === 0) return;
    const t = buffer.join(' ').replace(/\s+/g, ' ').trim();
    if (t) blocks.push({ type: 'p', text: t });
    buffer = [];
  };

  for (const line of lines) {
    const l = line.trim();
    if (!l) {
      flushParagraph();
      continue;
    }
    // Titre style "*Synthèse*" ou "**Synthèse**"
    const titleMatch = l.match(/^\*+\s*([^*]+?)\s*\*+\s*:?\s*$/);
    if (titleMatch) {
      flushParagraph();
      blocks.push({ type: 'h2', text: titleMatch[1].trim() });
      continue;
    }
    // Bullet "- xxx" ou "1. xxx" → on garde la ligne en tant que paragraphe propre
    if (/^[-•·]\s+/.test(l) || /^\d+[\.\)]\s+/.test(l)) {
      flushParagraph();
      // Normalise les puces variées en •
      const clean = l.replace(/^[-•·]\s+/, '• ').replace(/^(\d+)[\.\)]\s+/, '$1. ');
      blocks.push({ type: 'p', text: clean });
      continue;
    }
    // Sinon : continuation paragraphe — on supprime le markdown gras restant
    buffer.push(l.replace(/\*+/g, ''));
  }
  flushParagraph();

  return blocks;
}
