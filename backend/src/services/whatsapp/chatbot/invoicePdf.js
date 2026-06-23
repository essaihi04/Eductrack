/**
 * Génération d'une facture PDF (pdfkit) destinée à être envoyée
 * en pièce jointe sur WhatsApp.
 *
 * Support arabe : la police Noto Naskh Arabic est embarquée, et les features
 * OpenType `rtla` + `rclt` sont activées pour que fontkit (utilisé en interne
 * par pdfkit) applique automatiquement le shaping et l'ordre RTL.
 */

import PDFDocument from 'pdfkit';
import path from 'path';
import { fileURLToPath } from 'url';
import { supabaseAdmin } from '../../../config/supabase.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ARABIC_FONT_PATH = path.join(__dirname, 'fonts', 'NotoNaskhArabic-Regular.ttf');
const ARABIC_FONT_NAME = 'ArabicFont';

// Plage Unicode arabe (lettres + ponctuation)
const ARABIC_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

function hasArabic(text) {
  return ARABIC_RE.test(String(text || ''));
}

// OpenType features qui activent le shaping arabe correct dans fontkit
// (utilisé en interne par pdfkit) : 'rtla' = right-to-left alternates,
// 'rclt' = required contextual alternates. Avec ces features, pdfkit/fontkit
// applique correctement les ligatures et l'ordre RTL.
const ARABIC_FEATURES = ['rtla', 'rclt'];

/**
 * Wrapper qui choisit la police selon le contenu et écrit dans le PDF.
 * Conserve la signature de doc.text() en y ajoutant la sélection auto.
 */
function smartText(doc, text, x, y, options = {}) {
  const t = String(text == null ? '' : text);
  const useArabic = hasArabic(t);
  const previousFont = doc._font?.name || 'Helvetica';
  if (useArabic) {
    doc.font(ARABIC_FONT_NAME);
  }
  const finalOptions = useArabic
    ? { ...options, features: [...(options.features || []), ...ARABIC_FEATURES] }
    : options;
  if (x !== undefined && y !== undefined) {
    doc.text(t, x, y, finalOptions);
  } else {
    doc.text(t, finalOptions);
  }
  if (useArabic) {
    // Retour à la police précédente pour ne pas affecter les écritures suivantes
    try { doc.font(previousFont); } catch (_) { doc.font('Helvetica'); }
  }
}

/**
 * Rend une chaîne qui MÉLANGE arabe et latin (ex. « nom arabe — Classe »).
 * Contrairement à smartText, chaque segment est écrit avec SA police : les
 * lettres arabes en Noto Naskh, le reste (latin/chiffres/ponctuation) dans la
 * police de base. Sinon, forcer tout le texte en police arabe affiche des
 * carrés (.notdef) là où la police arabe n'a pas de glyphe latin.
 * Réservé aux en-têtes simples (pas de gestion width/ellipsis).
 */
function smartMixedText(doc, text, x, y, options = {}) {
  const t = String(text == null ? '' : text);
  const baseFont = doc._font?.name || 'Helvetica';
  if (!hasArabic(t)) {
    // Aucun arabe : un seul appel, police de base.
    if (x !== undefined && y !== undefined) doc.text(t, x, y, options);
    else doc.text(t, options);
    return;
  }
  // Découpe en segments consécutifs arabe / non-arabe (les espaces se
  // rattachent au segment courant pour éviter les micro-segments).
  const runs = [];
  for (const ch of [...t]) {
    const isAr = ARABIC_RE.test(ch);
    const isSpace = /\s/.test(ch);
    if (runs.length && (isSpace || runs[runs.length - 1].ar === isAr)) {
      runs[runs.length - 1].text += ch;
    } else {
      runs.push({ ar: isAr, text: ch });
    }
  }
  runs.forEach((run, i) => {
    const isLast = i === runs.length - 1;
    doc.font(run.ar ? ARABIC_FONT_NAME : baseFont);
    const opt = { ...options, continued: !isLast };
    if (run.ar) opt.features = [...(options.features || []), ...ARABIC_FEATURES];
    if (i === 0 && x !== undefined && y !== undefined) doc.text(run.text, x, y, opt);
    else doc.text(run.text, opt);
  });
  try { doc.font(baseFont); } catch (_) { doc.font('Helvetica'); }
}

const STATUS_LABEL = {
  issued: 'Émise',
  partial: 'Partiellement payée',
  paid: 'Payée',
  overdue: 'En retard',
  cancelled: 'Annulée',
};

const STATUS_COLOR = {
  issued: '#1e40af',
  partial: '#92400e',
  paid: '#15803d',
  overdue: '#991b1b',
  cancelled: '#6b7280',
};

function fmtMoney(amount, currency = 'MAD') {
  const n = Number(amount || 0);
  // `toLocaleString('fr-FR')` insère U+202F (NARROW NO-BREAK SPACE) entre
  // les milliers, ce que Helvetica (police par défaut de pdfkit) ne sait
  // pas rendre — il affiche alors un `/`. On normalise tous les types
  // d'espaces (\u00A0, \u202F, \u2009, etc.) en espaces ASCII classiques.
  const raw = n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const normalized = raw.replace(/[\u00A0\u202F\u2009\u2007\u200A]/g, ' ');
  return `${normalized} ${currency}`;
}

function fmtDate(d) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  } catch (_) {
    return String(d);
  }
}

/**
 * Récupère une facture complète (lignes + école) pour générer le PDF.
 */
export async function fetchInvoiceForPdf(invoiceId) {
  const { data: invoice, error } = await supabaseAdmin
    .from('invoices')
    .select(`
      id, invoice_number, period_label, total, amount_paid, status,
      due_date, currency, created_at, issue_date, notes, school_id, student_id,
      lines:invoice_lines(description, category, quantity, unit_price, amount, sort_order),
      student:profiles!invoices_student_id_fkey(first_name, last_name, classes!fk_profiles_class(name, level)),
      school:schools(name, address, phone, logo_url)
    `)
    .eq('id', invoiceId)
    .maybeSingle();

  if (error) throw error;
  return invoice;
}

/**
 * Génère un Buffer PDF de la facture.
 * @returns {Promise<Buffer>}
 */
export function buildInvoicePdfBuffer(invoice) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 50, info: {
        Title: `Facture ${invoice.invoice_number || ''}`,
        Author: invoice.school?.name || 'Eductrack',
        Subject: 'Facture',
      }});

      // Police arabe (chargée à la demande, déclenche une exception si TTF
      // manquant — capturée plus bas pour éviter de bloquer la génération)
      try {
        doc.registerFont(ARABIC_FONT_NAME, ARABIC_FONT_PATH);
      } catch (fontErr) {
        console.warn('[invoicePdf] Police arabe non chargée:', fontErr.message);
      }

      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const school = invoice.school || {};
      const student = invoice.student || {};
      const lines = (invoice.lines || []).slice().sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
      const currency = invoice.currency || 'MAD';
      const remaining = Number(invoice.total || 0) - Number(invoice.amount_paid || 0);
      const status = invoice.status || 'issued';

      // ───── Header école ─────
      doc.fontSize(20).fillColor('#0f172a');
      smartText(doc, school.name || 'École', undefined, undefined, { align: 'left' });
      doc.fontSize(10).fillColor('#475569');
      if (school.address) smartText(doc, school.address);
      const contactBits = [];
      if (school.phone) contactBits.push(`Tél : ${school.phone}`);
      if (school.email) contactBits.push(`Email : ${school.email}`);
      if (contactBits.length) doc.text(contactBits.join(' • '));
      doc.moveDown(0.5);

      // Ligne séparatrice
      doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#cbd5e1').lineWidth(1).stroke();
      doc.moveDown(0.8);

      // ───── Titre facture ─────
      doc.fontSize(18).fillColor('#0f172a').text('FACTURE', { align: 'right' });
      doc.fontSize(10).fillColor('#334155');
      doc.text(`N° ${invoice.invoice_number || '—'}`, { align: 'right' });
      if (invoice.issue_date || invoice.created_at) {
        doc.text(`Émise le : ${fmtDate(invoice.issue_date || invoice.created_at)}`, { align: 'right' });
      }
      if (invoice.due_date) doc.text(`Échéance : ${fmtDate(invoice.due_date)}`, { align: 'right' });

      // Badge statut
      const statusText = STATUS_LABEL[status] || status;
      const statusColor = STATUS_COLOR[status] || '#334155';
      doc.fillColor(statusColor).fontSize(11).text(`Statut : ${statusText}`, { align: 'right' });

      doc.moveDown(1.5);

      // ───── Bloc élève ─────
      const blockY = doc.y;
      doc.fontSize(10).fillColor('#64748b').text('Facturé à :', 50, blockY);
      doc.fontSize(12).fillColor('#0f172a');
      smartMixedText(
        doc,
        `${student.first_name || ''} ${student.last_name || ''}`.trim() || '—',
        50, blockY + 14,
      );
      doc.fontSize(10).fillColor('#475569');
      if (student.classes?.name) {
        smartMixedText(doc, `Classe : ${student.classes.name}${student.classes.level ? ` (${student.classes.level})` : ''}`, 50, blockY + 32);
      }
      if (invoice.period_label) {
        smartText(doc, `Période : ${invoice.period_label}`, 50, blockY + 48);
      }
      doc.moveDown(3);

      // ───── Tableau lignes ─────
      const tableTop = doc.y + 5;
      const colDesc = 50;
      const colQty = 320;
      const colUnit = 380;
      const colAmount = 470;

      // Header row
      doc.rect(50, tableTop, 495, 22).fill('#0f172a');
      doc.fillColor('#ffffff').fontSize(10);
      doc.text('Description', colDesc + 8, tableTop + 6);
      doc.text('Qté', colQty, tableTop + 6, { width: 50, align: 'right' });
      doc.text('P.U.', colUnit, tableTop + 6, { width: 80, align: 'right' });
      doc.text('Montant', colAmount, tableTop + 6, { width: 75, align: 'right' });

      let y = tableTop + 22;
      doc.fillColor('#0f172a').fontSize(10);

      if (lines.length === 0) {
        doc.fillColor('#64748b').text('— Aucune ligne détaillée —', colDesc + 8, y + 8);
        y += 28;
      } else {
        lines.forEach((l, idx) => {
          if (idx % 2 === 0) {
            doc.rect(50, y, 495, 22).fill('#f8fafc');
          }
          doc.fillColor('#0f172a');
          smartText(doc, String(l.description || '—'), colDesc + 8, y + 6, { width: 260, ellipsis: true });
          doc.text(String(l.quantity ?? 1), colQty, y + 6, { width: 50, align: 'right' });
          doc.text(fmtMoney(l.unit_price ?? l.amount, currency), colUnit, y + 6, { width: 80, align: 'right' });
          doc.text(fmtMoney(l.amount, currency), colAmount, y + 6, { width: 75, align: 'right' });
          y += 22;
        });
      }

      // Bordure tableau
      doc.rect(50, tableTop, 495, y - tableTop).strokeColor('#cbd5e1').lineWidth(0.5).stroke();

      // ───── Totaux ─────
      y += 15;
      const labelsX = 360;
      const valuesX = 470;

      doc.fontSize(11).fillColor('#334155');
      doc.text('Total', labelsX, y, { width: 100, align: 'right' });
      doc.fillColor('#0f172a').text(fmtMoney(invoice.total, currency), valuesX, y, { width: 75, align: 'right' });
      y += 18;

      doc.fillColor('#334155').text('Payé', labelsX, y, { width: 100, align: 'right' });
      doc.fillColor('#15803d').text(fmtMoney(invoice.amount_paid || 0, currency), valuesX, y, { width: 75, align: 'right' });
      y += 18;

      doc.rect(355, y - 3, 195, 28).fill(remaining > 0 ? '#fee2e2' : '#dcfce7');
      doc.fillColor(remaining > 0 ? '#991b1b' : '#15803d').fontSize(12);
      doc.text('Reste à payer', labelsX, y + 5, { width: 100, align: 'right' });
      doc.text(fmtMoney(remaining, currency), valuesX, y + 5, { width: 75, align: 'right' });
      y += 32;

      // ───── Notes ─────
      if (invoice.notes) {
        y += 10;
        doc.fontSize(10).fillColor('#64748b').text('Notes :', 50, y);
        doc.fontSize(10).fillColor('#334155');
        smartText(doc, invoice.notes, 50, y + 14, { width: 495 });
      }

      // ───── Footer ─────
      const footerY = doc.page.height - 70;
      doc.moveTo(50, footerY).lineTo(545, footerY).strokeColor('#e2e8f0').stroke();
      doc.fontSize(8).fillColor('#94a3b8').text(
        `Document généré automatiquement le ${fmtDate(new Date())} via Eductrack — ${school.name || ''}`,
        50, footerY + 8, { align: 'center', width: 495 },
      );

      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * Helper qui combine fetch + génération.
 */
export async function generateInvoicePdfById(invoiceId) {
  const inv = await fetchInvoiceForPdf(invoiceId);
  if (!inv) return null;
  const buffer = await buildInvoicePdfBuffer(inv);
  const fileName = `Facture_${inv.invoice_number || invoiceId}.pdf`;
  return { buffer, fileName, invoice: inv };
}

// ── Reçu combiné d'un LOT d'encaissement (plusieurs élèves / services) ────────
const CATEGORY_FR = {
  registration: 'Inscription', tuition: 'Scolarité', transport: 'Transport',
  canteen: 'Cantine', insurance: 'Assurance', activity: 'Activités',
  supplies: 'Fournitures', uniform: 'Uniforme', other: 'Autre',
};

/**
 * Récupère un lot d'encaissement (tous les paiements confirmés du batch),
 * regroupés par élève, pour générer un reçu unique.
 */
export async function fetchBatchForReceipt(batchId) {
  const { data: payments, error } = await supabaseAdmin
    .from('payments')
    .select(`
      id, amount, payment_date, method, reference, receipt_number, created_at,
      student:profiles!payments_student_id_fkey(id, first_name, last_name, classes!fk_profiles_class(name)),
      invoice:invoices(period_label, service_category),
      school:schools(name, address, phone, logo_url),
      cashier:profiles!payments_recorded_by_fkey(first_name, last_name)
    `)
    .eq('batch_id', batchId)
    .eq('status', 'confirmed')
    .order('created_at', { ascending: true });
  if (error) throw error;
  if (!payments || payments.length === 0) return null;

  const first = payments[0];
  const byStudent = new Map();
  for (const p of payments) {
    const sid = p.student?.id || 'unknown';
    if (!byStudent.has(sid)) {
      byStudent.set(sid, {
        name: `${p.student?.first_name || ''} ${p.student?.last_name || ''}`.trim() || '—',
        className: p.student?.classes?.name || '',
        lines: [], total: 0,
      });
    }
    const s = byStudent.get(sid);
    s.lines.push({
      service: p.invoice?.service_category ? (CATEGORY_FR[p.invoice.service_category] || p.invoice.service_category) : 'Mensualité',
      period: p.invoice?.period_label || '',
      amount: Number(p.amount || 0),
    });
    s.total += Number(p.amount || 0);
  }

  return {
    batch_id: batchId,
    school: first.school || {},
    payment_date: first.payment_date,
    method: first.method,
    reference: first.reference,
    cashier: first.cashier ? `${first.cashier.first_name || ''} ${first.cashier.last_name || ''}`.trim() : '',
    students: [...byStudent.values()],
    total: payments.reduce((s, p) => s + Number(p.amount || 0), 0),
    count: payments.length,
  };
}

const METHOD_FR = { cash: 'Espèces', check: 'Chèque', transfer: 'Virement', card_pos: 'Carte', other: 'Autre' };

/** Génère un Buffer PDF du reçu combiné d'un lot. */
export function buildBatchReceiptPdfBuffer(batch) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 50, info: { Title: 'Reçu d\'encaissement', Author: batch.school?.name || 'Eductrack' } });
      try { doc.registerFont(ARABIC_FONT_NAME, ARABIC_FONT_PATH); } catch (e) { /* police arabe optionnelle */ }
      const chunks = [];
      doc.on('data', c => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const school = batch.school || {};
      // En-tête école
      doc.fontSize(20).fillColor('#0f172a');
      smartText(doc, school.name || 'École', undefined, undefined, { align: 'left' });
      doc.fontSize(10).fillColor('#475569');
      if (school.address) smartText(doc, school.address);
      if (school.phone) doc.text(`Tél : ${school.phone}`);
      doc.moveDown(0.5);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#cbd5e1').lineWidth(1).stroke();
      doc.moveDown(0.8);

      // Titre
      doc.fontSize(18).fillColor('#0f172a').text('REÇU D\'ENCAISSEMENT', { align: 'right' });
      doc.fontSize(10).fillColor('#334155');
      doc.text(`Date : ${fmtDate(batch.payment_date)}`, { align: 'right' });
      doc.text(`Mode : ${METHOD_FR[batch.method] || batch.method || '—'}`, { align: 'right' });
      if (batch.reference) doc.text(`Référence : ${batch.reference}`, { align: 'right' });
      doc.moveDown(1.2);

      // Par élève
      let y = doc.y;
      for (const st of batch.students) {
        doc.fontSize(12).fillColor('#0f172a');
        smartMixedText(doc, `${st.name}${st.className ? ` — ${st.className}` : ''}`, 50, y);
        y = doc.y + 4;
        // En-tête tableau
        doc.rect(50, y, 495, 20).fill('#0f172a');
        doc.fillColor('#ffffff').fontSize(9);
        doc.text('Service', 58, y + 6);
        doc.text('Période', 250, y + 6);
        doc.text('Montant', 470, y + 6, { width: 70, align: 'right' });
        y += 20;
        st.lines.forEach((l, idx) => {
          if (idx % 2 === 0) doc.rect(50, y, 495, 18).fill('#f8fafc');
          doc.fillColor('#0f172a').fontSize(9);
          smartText(doc, l.service, 58, y + 5, { width: 180, ellipsis: true });
          doc.text(l.period || '—', 250, y + 5, { width: 180 });
          doc.text(fmtMoney(l.amount, 'MAD'), 470, y + 5, { width: 70, align: 'right' });
          y += 18;
        });
        // Sous-total élève
        doc.fillColor('#334155').fontSize(9.5);
        doc.text('Sous-total', 360, y + 4, { width: 100, align: 'right' });
        doc.fillColor('#0f172a').text(fmtMoney(st.total, 'MAD'), 470, y + 4, { width: 70, align: 'right' });
        y += 26;
        if (y > 720) { doc.addPage(); y = 50; }
      }

      // Total général
      doc.rect(345, y, 200, 30).fill('#dcfce7');
      doc.fillColor('#15803d').fontSize(13);
      doc.text('TOTAL', 360, y + 8, { width: 90, align: 'right' });
      doc.text(fmtMoney(batch.total, 'MAD'), 460, y + 8, { width: 80, align: 'right' });
      y += 40;

      if (batch.cashier) { doc.fontSize(9).fillColor('#64748b').text(`Encaissé par : ${batch.cashier}`, 50, y); }

      const footerY = doc.page.height - 60;
      doc.fontSize(8).fillColor('#94a3b8').text(
        `Reçu généré le ${fmtDate(new Date())} via Eductrack — ${school.name || ''}`,
        50, footerY, { align: 'center', width: 495 },
      );
      doc.end();
    } catch (e) { reject(e); }
  });
}

export async function generateBatchReceiptPdfById(batchId) {
  const batch = await fetchBatchForReceipt(batchId);
  if (!batch) return null;
  const buffer = await buildBatchReceiptPdfBuffer(batch);
  return { buffer, fileName: `Recu_${batchId.slice(0, 8)}.pdf`, batch };
}
