/**
 * Génération d'une facture PDF (pdfkit) destinée à être envoyée
 * en pièce jointe sur WhatsApp.
 *
 * NOTE arabe : pdfkit n'effectue pas le RTL/shaping arabe. Les noms en
 * arabe seront tout de même rendus glyphe par glyphe (lisibles pour la
 * plupart des prénoms simples). Pour un rendu parfait, il faudrait
 * embarquer une police Naskh + arabic-reshaper + bidi-js.
 */

import PDFDocument from 'pdfkit';
import { supabaseAdmin } from '../../../config/supabase.js';

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
  return `${n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
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
      doc.fontSize(20).fillColor('#0f172a').text(school.name || 'École', { align: 'left' });
      doc.fontSize(10).fillColor('#475569');
      if (school.address) doc.text(school.address);
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
      doc.fontSize(12).fillColor('#0f172a').text(
        `${student.first_name || ''} ${student.last_name || ''}`.trim() || '—',
        50, blockY + 14,
      );
      doc.fontSize(10).fillColor('#475569');
      if (student.classes?.name) {
        doc.text(`Classe : ${student.classes.name}${student.classes.level ? ` (${student.classes.level})` : ''}`, 50, blockY + 32);
      }
      if (invoice.period_label) {
        doc.text(`Période : ${invoice.period_label}`, 50, blockY + 48);
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
          doc.text(String(l.description || '—'), colDesc + 8, y + 6, { width: 260, ellipsis: true });
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
        doc.fontSize(10).fillColor('#334155').text(invoice.notes, 50, y + 14, { width: 495 });
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
