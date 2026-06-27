// Génération de documents imprimables en double exemplaire (PDF via impression
// navigateur). Deux usages :
//   - Facture élève : exemplaire « École » + exemplaire « Parent ».
//   - Reçu de paiement salaire : exemplaire « École » + exemplaire « Employé »,
//     avec blocs de signature (employé + responsable financier).
// Chaque document porte le logo et le nom de l'école.
import { formatMAD, formatDate } from './financeApi';

const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

const STATUS_LABELS = { draft: 'Brouillon', issued: 'Émise', partial: 'Partielle', paid: 'Payée', overdue: 'En retard', cancelled: 'Annulée' };
const METHOD_LABELS = { cash: 'Espèces', check: 'Chèque', transfer: 'Virement', card_pos: 'Carte', bank: 'Banque', other: 'Autre' };

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function logoSrc(school) {
  const url = school?.logo_url;
  if (!url) return null;
  return url.startsWith('http') ? url : `${apiBase}${url.startsWith('/') ? '' : '/'}${url}`;
}

// En-tête commun : logo + identité de l'école.
function schoolHeader(school) {
  const src = logoSrc(school);
  return `
    <div class="school-header">
      ${src ? `<img src="${src}" alt="Logo" class="logo"/>` : ''}
      <div class="school-info">
        <h2>${esc(school?.name || 'École')}</h2>
        ${school?.address ? `<p>${esc(school.address)}</p>` : ''}
        ${school?.phone ? `<p>Tél : ${esc(school.phone)}</p>` : ''}
      </div>
    </div>`;
}

// Styles communs aux deux documents.
const BASE_STYLES = `
  *{box-sizing:border-box}
  body{font-family:Arial,sans-serif;margin:0;color:#1f2937}
  .sheet{padding:18px 26px}
  .copy{position:relative}
  .copy-tag{position:absolute;top:0;right:0;font-size:0.7em;font-weight:bold;letter-spacing:.5px;color:#6b7280;border:1px solid #d1d5db;border-radius:10px;padding:2px 10px;text-transform:uppercase}
  h1{margin:0;font-size:1.5em}
  h2{margin:0 0 4px;font-size:1.1em}
  h3{margin:14px 0 6px;color:#374151;font-size:0.95em}
  .school-header{display:flex;align-items:center;gap:14px;padding-bottom:10px;border-bottom:2px solid var(--accent);margin-bottom:12px}
  .school-header .logo{width:64px;height:64px;object-fit:contain}
  .school-info h2{color:var(--accent)}
  .school-info p{margin:1px 0;font-size:0.8em;color:#555}
  .doc-title{text-align:center;margin:10px 0}
  .doc-title h1{color:var(--accent)}
  .doc-title p{color:#666;margin:3px 0;font-size:0.9em}
  .meta{display:flex;flex-wrap:wrap;gap:8px;background:#f9fafb;padding:10px;border-radius:6px;margin:10px 0;font-size:0.82em}
  .meta div{flex:1;min-width:120px}
  .meta strong{display:block;color:#6b7280;font-size:0.85em;text-transform:uppercase;margin-bottom:1px}
  table{width:100%;border-collapse:collapse;margin-top:6px}
  th{background:var(--accent);color:#fff;padding:6px 8px;text-align:left;font-size:0.8em}
  td{padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:0.85em}
  .totals{margin-top:10px;margin-left:auto;width:62%}
  .totals .row{display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px dotted #e5e7eb;font-size:0.88em}
  .totals .total-line{font-weight:bold;font-size:1.05em;color:var(--accent);border-top:2px solid var(--accent);padding-top:7px;margin-top:3px}
  .totals .remaining{font-weight:bold;color:#dc2626}
  .signatures{display:flex;gap:30px;margin-top:26px}
  .signatures .sig{flex:1;text-align:center}
  .signatures .sig .line{height:46px;border-bottom:1px solid #9ca3af;margin-bottom:4px}
  .signatures .sig .label{font-size:0.8em;color:#374151;font-weight:bold}
  .signatures .sig .name{font-size:0.75em;color:#6b7280}
  .footer{margin-top:16px;padding-top:10px;border-top:1px solid #ccc;font-size:0.72em;color:#666;text-align:center}
  .cut{border:none;border-top:1px dashed #9ca3af;margin:14px 0 0;position:relative;text-align:center}
  .cut span{position:absolute;top:-9px;left:50%;transform:translateX(-50%);background:#fff;padding:0 8px;font-size:0.7em;color:#9ca3af}
  .badge{display:inline-block;padding:2px 9px;border-radius:12px;font-size:0.72em;font-weight:bold;text-transform:uppercase}
  .badge-paid{background:#d1fae5;color:#065f46}
  .badge-issued{background:#dbeafe;color:#1e40af}
  .badge-overdue{background:#fee2e2;color:#991b1b}
  .badge-partial{background:#fef3c7;color:#92400e}
  @media print { .sheet{padding:10px 16px} @page{margin:8mm} }
`;

// Ouvre une fenêtre d'impression contenant deux exemplaires séparés par une
// ligne de découpe, puis lance l'impression.
function printTwoCopies({ title, accent, copyHtml, labels }) {
  const html = `<html><head><meta charset="utf-8"/><title>${esc(title)}</title>
    <style>:root{--accent:${accent}}${BASE_STYLES}</style></head>
    <body>
      <div class="sheet">${copyHtml(labels[0])}</div>
      <hr class="cut"/><div style="text-align:center"><span style="font-size:0.7em;color:#9ca3af">✂ — — — — — — — — — — — — — — — — — — — — — — — — — — — —</span></div>
      <div class="sheet">${copyHtml(labels[1])}</div>
    </body></html>`;
  const w = window.open('', '_blank');
  if (!w) { alert("Veuillez autoriser les fenêtres pop-up pour imprimer."); return; }
  w.document.write(html);
  w.document.close();
  setTimeout(() => w.print(), 400);
}

// ── Facture élève (double exemplaire : École / Parent) ─────────────────────
export function printStudentInvoice(invoice, schoolFallback) {
  const school = invoice.school || schoolFallback || {};
  const linesHtml = (invoice.lines || []).map(l => `
    <tr><td>${esc(l.description)}</td><td style="text-align:right">${l.quantity || 1}</td>
    <td style="text-align:right">${formatMAD(l.unit_price)}</td><td style="text-align:right">${formatMAD(l.amount)}</td></tr>`).join('');
  const paymentsHtml = (invoice.payments || []).map(p => `
    <tr><td>${esc(p.receipt_number)}</td><td>${formatDate(p.payment_date)}</td>
    <td>${METHOD_LABELS[p.method] || p.method || ''}</td><td style="text-align:right">${formatMAD(p.amount)}</td></tr>`).join('');

  const copyHtml = (label) => `
    <div class="copy">
      <span class="copy-tag">Exemplaire ${esc(label)}</span>
      ${schoolHeader(school)}
      <div class="doc-title">
        <h1>FACTURE</h1>
        <p>N° <strong>${esc(invoice.invoice_number)}</strong> &nbsp;·&nbsp; <span class="badge badge-${invoice.status}">${STATUS_LABELS[invoice.status] || invoice.status}</span></p>
      </div>
      <div class="meta">
        <div><strong>Émise le</strong>${formatDate(invoice.issue_date)}</div>
        <div><strong>Échéance</strong>${formatDate(invoice.due_date)}</div>
        <div><strong>Période</strong>${esc(invoice.period_label || '—')}</div>
      </div>
      <div class="meta">
        <div><strong>Élève</strong>${esc(invoice.student?.first_name || '')} ${esc(invoice.student?.last_name || '')}</div>
        <div><strong>Classe</strong>${esc(invoice.student?.classes?.name || '—')}</div>
      </div>
      <table>
        <thead><tr><th>Description</th><th style="text-align:right">Qté</th><th style="text-align:right">Prix unit.</th><th style="text-align:right">Montant</th></tr></thead>
        <tbody>${linesHtml}</tbody>
      </table>
      <div class="totals">
        <div class="row"><span>Sous-total</span><span>${formatMAD(invoice.subtotal)}</span></div>
        ${Number(invoice.discount) > 0 ? `<div class="row"><span>Réduction</span><span style="color:#059669">- ${formatMAD(invoice.discount)}</span></div>` : ''}
        <div class="row total-line"><span>TOTAL</span><span>${formatMAD(invoice.total)}</span></div>
        <div class="row" style="color:#059669"><span>Déjà payé</span><span>${formatMAD(invoice.amount_paid)}</span></div>
        <div class="row remaining"><span>Reste à payer</span><span>${formatMAD(invoice.amount_due)}</span></div>
      </div>
      ${paymentsHtml ? `<h3>Historique des paiements</h3>
        <table><thead><tr><th>Reçu</th><th>Date</th><th>Mode</th><th style="text-align:right">Montant</th></tr></thead>
        <tbody>${paymentsHtml}</tbody></table>` : ''}
      <div class="signatures">
        <div class="sig"><div class="line"></div><div class="label">Cachet & signature de l'école</div></div>
        <div class="sig"><div class="line"></div><div class="label">Signature du parent</div></div>
      </div>
      <div class="footer">
        <p>Merci de régler cette facture avant la date d'échéance. Pour toute question, contactez l'administration de l'école.</p>
      </div>
    </div>`;

  printTwoCopies({
    title: `Facture ${invoice.invoice_number}`,
    accent: '#1e40af',
    labels: ['École', 'Parent'],
    copyHtml,
  });
}

// ── Reçu de paiement de salaire (double : École / Employé) ─────────────────
// p : { employeeName, month, year, salary, cnss_amo, ir, net_salary,
//       payment_method, paid_date, reference }
export function printPayrollReceipt(p, { school, financeManagerName } = {}) {
  const period = `${MONTHS[(p.month || 1) - 1] || ''} ${p.year || ''}`.trim();
  const hasBreakdown = p.salary != null || p.cnss_amo != null || p.ir != null;
  const methodLabel = p.payment_method === 'cash' ? 'Espèces' : (METHOD_LABELS[p.payment_method] || 'Banque');

  const copyHtml = (label) => `
    <div class="copy">
      <span class="copy-tag">Exemplaire ${esc(label)}</span>
      ${schoolHeader(school)}
      <div class="doc-title">
        <h1>REÇU DE PAIEMENT DE SALAIRE</h1>
        <p>Période : <strong>${esc(period)}</strong> &nbsp;·&nbsp; <span class="badge badge-paid">Payé</span></p>
      </div>
      <div class="meta">
        <div><strong>Employé(e)</strong>${esc(p.employeeName)}</div>
        <div><strong>Mode de paiement</strong>${esc(methodLabel)}</div>
        <div><strong>Date de paiement</strong>${p.paid_date ? formatDate(p.paid_date) : '—'}</div>
      </div>
      <table>
        <thead><tr><th>Désignation</th><th style="text-align:right">Montant</th></tr></thead>
        <tbody>
          ${hasBreakdown ? `
            <tr><td>Salaire brut</td><td style="text-align:right">${formatMAD(p.salary)}</td></tr>
            <tr><td>Cotisation CNSS + AMO</td><td style="text-align:right;color:#dc2626">- ${formatMAD(p.cnss_amo)}</td></tr>
            <tr><td>Impôt sur le revenu (IR)</td><td style="text-align:right;color:#dc2626">- ${formatMAD(p.ir)}</td></tr>
          ` : ''}
        </tbody>
      </table>
      <div class="totals">
        ${hasBreakdown ? `
          <div class="row"><span>Salaire brut</span><span>${formatMAD(p.salary)}</span></div>
          <div class="row"><span>Total retenues</span><span style="color:#dc2626">- ${formatMAD(Number(p.cnss_amo || 0) + Number(p.ir || 0))}</span></div>
        ` : ''}
        <div class="row total-line"><span>NET PAYÉ</span><span>${formatMAD(p.net_salary)}</span></div>
      </div>
      <div class="signatures">
        <div class="sig"><div class="line"></div><div class="label">Signature de l'employé(e)</div><div class="name">${esc(p.employeeName)}</div></div>
        <div class="sig"><div class="line"></div><div class="label">Signature du responsable financier</div><div class="name">${esc(financeManagerName || '')}</div></div>
      </div>
      <div class="footer">
        <p>Reçu attestant le règlement du salaire net de la période indiquée. ${esc(school?.name || '')}</p>
      </div>
    </div>`;

  printTwoCopies({
    title: `Reçu salaire — ${p.employeeName} ${period}`,
    accent: '#6d28d9',
    labels: ['École', 'Employé'],
    copyHtml,
  });
}
