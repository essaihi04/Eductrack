// Construction de la feuille Excel « Prévisionnel / Réel » (matrice annuelle).
// Partagé entre la page Prévisionnel/Réel (export simple) et la page Rapports
// (export complet : cette matrice en 1er onglet + les onglets de détail).

const SHORT = { 1: 'Jan', 2: 'Fév', 3: 'Mar', 4: 'Avr', 5: 'Mai', 6: 'Juin', 7: 'Juil', 8: 'Août', 9: 'Sept', 10: 'Oct', 11: 'Nov', 12: 'Déc' };

// Transforme la réponse de /reports/annual-matrix en lignes affichables + helpers.
export function buildMatrix(data) {
  const months = data.months || [];
  const eff = (actual = [], budget = []) => months.map((mo, i) => (mo.is_real ? Number(actual[i] || 0) : Number(budget[i] || 0)));
  const sum = (arr) => arr.reduce((s, v) => s + (Number(v) || 0), 0);

  const caEff = eff(data.revenue.totals.ca, data.revenue.totals.ca_budget);
  const caTotal = sum(caEff);
  const depEff = eff(data.expenses.total.actual, data.expenses.total.budget);
  const depTotal = sum(depEff);

  const rows = [];
  rows.push({ section: 'RECETTES' });
  data.revenue.encaissements.forEach((l) =>
    rows.push({ label: l.name, actual: l.actual, budget: l.budget, denom: caTotal, indent: true }));
  rows.push({ label: 'TOTAL ENCAISSEMENTS', actual: data.revenue.totals.encaissements, budget: data.revenue.totals.ca_budget, bold: true, denom: caTotal });
  rows.push({ label: 'TOTAL IMPAYÉS', actual: data.revenue.totals.impayes, budget: months.map(() => 0), bold: true, muted: true });
  rows.push({ label: "CA (chiffre d'affaires)", actual: data.revenue.totals.ca, budget: data.revenue.totals.ca_budget, bold: true });

  rows.push({ section: 'DÉPENSES' });
  data.expenses.sections.forEach((sec) => {
    rows.push({ label: sec.name, subheader: true });
    sec.lines.forEach((l) => rows.push({ label: l.name, actual: l.actual, budget: l.budget, denom: depTotal, indent: true }));
    rows.push({ label: `Sous-total ${sec.name}`, actual: sec.subtotal.actual, budget: sec.subtotal.budget, bold: true, denom: depTotal });
  });
  rows.push({ label: 'TOTAL DÉPENSES', actual: data.expenses.total.actual, budget: data.expenses.total.budget, bold: true });

  rows.push({ label: 'RÉSULTAT COMPTABLE (CA − Dépenses)', actual: data.result.actual, budget: data.result.budget, bold: true, result: true });
  rows.push({ label: 'RÉSULTAT ENCAISSÉ (encaissé − dépensé)', actual: data.resultCash?.actual || [], budget: data.resultCash?.budget || [], bold: true, result: true });

  const lineValues = (r) => {
    const e = eff(r.actual, r.budget);
    const cumule = sum(e);
    const totalBudget = sum(r.budget || []);
    const pct = r.denom ? (cumule / r.denom) * 100 : null;
    return { e, cumule, totalBudget, pct };
  };

  return { months, rows, lineValues };
}

// Ajoute la feuille matrice colorée au classeur fourni. Ne crée ni ne télécharge
// le classeur — l'appelant s'en charge.
export function addPrevisionnelSheet(wb, year, data) {
  const { months, rows, lineValues } = buildMatrix(data);

  const C = {
    headText: 'FFFFFFFF', slate: 'FF334155',
    realHead: 'FF334155', prevHead: 'FF2563EB', prevFill: 'FFEFF6FF',
    sectionRev: 'FFDCFCE7', sectionRevTx: 'FF166534',
    sectionExp: 'FFFEE2E2', sectionExpTx: 'FF991B1B',
    sub: 'FFF1F5F9', result: 'FF4F46E5', total: 'FFE2E8F0', border: 'FFE5E7EB',
  };
  const MONEY = '#,##0;[Red]-#,##0';
  const thin = { style: 'thin', color: { argb: C.border } };
  const borders = { top: thin, left: thin, bottom: thin, right: thin };
  const ncol = months.length + 4; // Poste + mois + Cumulé + Budget + %

  const ws = wb.addWorksheet(`Prévisionnel ${year}`, {
    views: [{ state: 'frozen', xSplit: 1, ySplit: 3, showGridLines: false }],
    properties: { tabColor: { argb: C.result } },
  });
  ws.getColumn(1).width = 32;
  months.forEach((_, i) => { ws.getColumn(2 + i).width = 11; });
  ws.getColumn(months.length + 2).width = 13;
  ws.getColumn(months.length + 3).width = 13;
  ws.getColumn(months.length + 4).width = 8;

  // Titre + période
  ws.mergeCells(1, 1, 1, ncol);
  const t = ws.getCell('A1');
  t.value = `PRÉVISIONNEL / RÉEL — ${year}`;
  t.font = { bold: true, size: 16, color: { argb: C.headText } };
  t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.result } };
  t.alignment = { vertical: 'middle', indent: 1 };
  ws.getRow(1).height = 30;
  ws.mergeCells(2, 1, 2, ncol);
  const sub = ws.getCell('A2');
  sub.value = 'Cellules bleutées = Prévisionnel (mois à venir) · cellules claires = Réel (mois écoulés)';
  sub.font = { italic: true, size: 10, color: { argb: C.slate } };
  sub.alignment = { indent: 1 };

  // En-têtes (ligne 3) : mois colorés selon Réel/Prévisionnel
  const headRow = ws.getRow(3);
  headRow.getCell(1).value = 'Poste';
  months.forEach((m, i) => { headRow.getCell(2 + i).value = `${SHORT[m.month]} ${String(m.year).slice(2)}`; });
  headRow.getCell(months.length + 2).value = 'Cumulé';
  headRow.getCell(months.length + 3).value = 'Budget';
  headRow.getCell(months.length + 4).value = '%';
  for (let i = 1; i <= ncol; i++) {
    const cell = headRow.getCell(i);
    const isPrevMonth = i >= 2 && i <= months.length + 1 && !months[i - 2].is_real;
    cell.font = { bold: true, color: { argb: C.headText }, size: 10 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isPrevMonth ? C.prevHead : C.realHead } };
    cell.alignment = { vertical: 'middle', horizontal: i === 1 ? 'left' : 'right', indent: i === 1 ? 1 : 0 };
    cell.border = borders;
  }
  headRow.height = 22;

  let firstDataRow = null, lastDataRow = null;
  rows.forEach((r) => {
    if (r.section) {
      const rowIdx = ws.lastRow.number + 1;
      ws.mergeCells(rowIdx, 1, rowIdx, ncol);
      const isRev = /RECETTE/i.test(r.section);
      const cell = ws.getCell(rowIdx, 1);
      cell.value = r.section;
      cell.font = { bold: true, size: 11, color: { argb: isRev ? C.sectionRevTx : C.sectionExpTx } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isRev ? C.sectionRev : C.sectionExp } };
      cell.alignment = { vertical: 'middle', indent: 1 };
      ws.getRow(rowIdx).height = 18;
      return;
    }
    if (r.subheader) {
      const rowIdx = ws.lastRow.number + 1;
      ws.mergeCells(rowIdx, 1, rowIdx, ncol);
      const cell = ws.getCell(rowIdx, 1);
      cell.value = r.label;
      cell.font = { bold: true, size: 10, color: { argb: C.slate } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.sub } };
      cell.alignment = { vertical: 'middle', indent: 1 };
      return;
    }
    const { e, cumule, totalBudget, pct } = lineValues(r);
    const row = ws.addRow([
      (r.indent ? '   ' : '') + r.label,
      ...e.map((v) => Math.round(v)),
      Math.round(cumule), Math.round(totalBudget),
      pct != null ? Number(pct.toFixed(1)) / 100 : null,
    ]);
    const idx = row.number;
    if (firstDataRow == null) firstDataRow = idx;
    lastDataRow = idx;
    const isResult = r.result;
    const isTotal = r.bold && !isResult;
    for (let i = 1; i <= ncol; i++) {
      const cell = row.getCell(i);
      cell.border = borders;
      const isPrevMonth = i >= 2 && i <= months.length + 1 && !months[i - 2].is_real;
      if (isResult) {
        cell.font = { bold: true, color: { argb: C.headText } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.result } };
      } else if (isTotal) {
        cell.font = { bold: true, color: { argb: C.slate } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.total } };
      } else if (isPrevMonth) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.prevFill } };
      }
      if (i === 1) cell.alignment = { horizontal: 'left', indent: 1 };
      else if (i === ncol) { cell.numFmt = '0.0%'; cell.alignment = { horizontal: 'right' }; }
      else { cell.numFmt = MONEY; cell.alignment = { horizontal: 'right' }; }
    }
  });

  // Barre de données sur la colonne Cumulé
  if (firstDataRow != null) {
    const col = months.length + 2;
    const letter = ws.getColumn(col).letter;
    ws.addConditionalFormatting({
      ref: `${letter}${firstDataRow}:${letter}${lastDataRow}`,
      rules: [{ type: 'dataBar', cfvo: [{ type: 'num', value: 0 }, { type: 'max' }], color: { argb: 'FFB5D4F4' } }],
    });
  }

  return ws;
}
