import { useEffect, useMemo, useState } from 'react';
import {
  BarChart3, TrendingUp, TrendingDown, Wallet, FileSpreadsheet, FileText,
  Banknote, CreditCard, Building2, FileCheck, MoreHorizontal, Receipt, LayoutGrid,
} from 'lucide-react';
import { financeApi, formatMAD, formatDate, METHOD_LABELS, EXPENSE_CATEGORIES } from '../../lib/financeApi';
import { PageHeader, KpiGrid, KpiCard, Card, Button } from '../../components/finance/ui';
import { addPrevisionnelSheet } from './previsionnelSheet';

// Année scolaire courante (sept → août), pour l'onglet Prévisionnel de l'export complet.
const currentAcademicYear = () => {
  const d = new Date(); const y = d.getFullYear();
  return d.getMonth() + 1 >= 9 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
};

// Bornes de période (jour / semaine / mois / trimestre / année / personnalisé)
const todayISO = () => new Date().toISOString().slice(0, 10);
const iso = (x) => x.toISOString().slice(0, 10);
const computeRange = (period, ref) => {
  const d = ref ? new Date(ref) : new Date();
  if (period === 'day') return { from: iso(d), to: iso(d) };
  if (period === 'week') {
    const day = (d.getDay() + 6) % 7; // lundi = 0
    const monday = new Date(d); monday.setDate(d.getDate() - day);
    const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
    return { from: iso(monday), to: iso(sunday) };
  }
  if (period === 'month') {
    return { from: iso(new Date(d.getFullYear(), d.getMonth(), 1)), to: iso(new Date(d.getFullYear(), d.getMonth() + 1, 0)) };
  }
  if (period === 'quarter') {
    const q = Math.floor(d.getMonth() / 3);
    return { from: iso(new Date(d.getFullYear(), q * 3, 1)), to: iso(new Date(d.getFullYear(), q * 3 + 3, 0)) };
  }
  if (period === 'year') {
    return { from: iso(new Date(d.getFullYear(), 0, 1)), to: iso(new Date(d.getFullYear(), 11, 31)) };
  }
  return { from: iso(d), to: iso(d) };
};

const METHOD_ICONS = { cash: Banknote, check: FileCheck, transfer: Building2, card_pos: CreditCard, other: MoreHorizontal };
const METHOD_ORDER = ['cash', 'check', 'transfer', 'card_pos', 'other'];

const PERIODS = [
  { key: 'day', label: "Aujourd'hui" },
  { key: 'week', label: 'Semaine' },
  { key: 'month', label: 'Mois' },
  { key: 'quarter', label: 'Trimestre' },
  { key: 'year', label: 'Année' },
  { key: 'custom', label: 'Personnalisé' },
];

// Granularité d'affichage de la ventilation
const GRANULARITIES = [
  { key: 'day', label: 'Par jour' },
  { key: 'month', label: 'Par mois' },
];

const ReportsPage = () => {
  const [period, setPeriod] = useState('month');
  const [custom, setCustom] = useState({ from: todayISO(), to: todayISO() });
  const [granularity, setGranularity] = useState('day');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const range = useMemo(
    () => (period === 'custom' ? custom : computeRange(period)),
    [period, custom]
  );

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [range.from, range.to]);

  const load = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await financeApi.getReportSummary(range.from, range.to);
      setData(res);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const periodLabel = `${formatDate(range.from)} — ${formatDate(range.to)}`;
  const fileBase = `rapport_finance_${range.from}_${range.to}`;
  const breakdown = granularity === 'month' ? (data?.by_month || []) : (data?.by_day || []);

  // Construit les feuilles de détail (synthèse, ventilations, recouvrement) dans
  // le classeur fourni. Réutilisé par l'export simple ET l'export complet.
  const buildReportSheets = (wb) => {
    // Palette
    const C = {
      indigo: 'FF4F46E5', green: 'FF10B981', red: 'FFEF4444', blue: 'FF3B82F6',
      orange: 'FFEA580C', amber: 'FFF59E0B', slate: 'FF334155',
      zebra: 'FFF1F5F9', headText: 'FFFFFFFF', border: 'FFE2E8F0',
    };
    const MONEY = '#,##0.00 "MAD";[Red]-#,##0.00 "MAD"';
    const thin = { style: 'thin', color: { argb: C.border } };
    const allBorders = { top: thin, left: thin, bottom: thin, right: thin };
    // Couleurs des barres de données (mini-graphes en cellule)
    const BAR = { green: 'FF9FE1CB', red: 'FFF7C1C1', blue: 'FFB5D4F4', amber: 'FFFAC775' };

    // Helper : construit une feuille « tableau » avec titre + en-tête coloré + zébrures
    const buildSheet = (name, tabColor, title, columns, rows, totals) => {
      const ws = wb.addWorksheet(name, {
        properties: { tabColor: { argb: tabColor }, defaultRowHeight: 18 },
        views: [{ state: 'frozen', ySplit: 3 }],
      });
      ws.columns = columns.map(c => ({ key: c.key, width: c.width || 18 }));
      const ncol = columns.length;
      const lastCol = String.fromCharCode(64 + ncol);

      // Ligne 1 : titre fusionné
      ws.mergeCells(`A1:${lastCol}1`);
      const titleCell = ws.getCell('A1');
      titleCell.value = title;
      titleCell.font = { bold: true, size: 14, color: { argb: C.headText } };
      titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: tabColor } };
      titleCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
      ws.getRow(1).height = 26;

      // Ligne 2 : période fusionnée
      ws.mergeCells(`A2:${lastCol}2`);
      const subCell = ws.getCell('A2');
      subCell.value = `Période : ${formatDate(range.from)} — ${formatDate(range.to)}`;
      subCell.font = { italic: true, size: 10, color: { argb: C.slate } };
      subCell.alignment = { vertical: 'middle', indent: 1 };
      ws.getRow(2).height = 18;

      // Ligne 3 : en-têtes de colonnes
      const headerRow = ws.getRow(3);
      columns.forEach((c, i) => {
        const cell = headerRow.getCell(i + 1);
        cell.value = c.header;
        cell.font = { bold: true, color: { argb: C.headText }, size: 11 };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: tabColor } };
        cell.alignment = { vertical: 'middle', horizontal: c.money ? 'right' : 'left' };
        cell.border = allBorders;
      });
      headerRow.height = 20;

      // Données
      rows.forEach((r, idx) => {
        const row = ws.addRow(columns.map(c => r[c.key]));
        const zebra = idx % 2 === 1;
        columns.forEach((c, i) => {
          const cell = row.getCell(i + 1);
          cell.border = allBorders;
          if (zebra) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.zebra } };
          if (c.money) { cell.numFmt = MONEY; cell.alignment = { horizontal: 'right' }; }
          else if (c.pct) { cell.numFmt = '0.0"%"'; cell.alignment = { horizontal: 'right' }; }
          else cell.alignment = { horizontal: c.center ? 'center' : 'left' };
        });
      });

      // Ligne de total (optionnelle)
      if (totals) {
        const row = ws.addRow(columns.map(c => totals[c.key]));
        columns.forEach((c, i) => {
          const cell = row.getCell(i + 1);
          cell.font = { bold: true, color: { argb: C.headText } };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.slate } };
          cell.border = allBorders;
          if (c.money) { cell.numFmt = MONEY; cell.alignment = { horizontal: 'right' }; }
          else if (c.pct) { cell.numFmt = '0.0"%"'; cell.alignment = { horizontal: 'right' }; }
          else cell.alignment = { horizontal: c.center ? 'center' : 'left' };
        });
        row.height = 19;
      }

      // Filtre automatique sur la ligne d'en-tête
      ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: ncol } };

      // Mises en forme conditionnelles : barres de données (mini-graphes) + échelles de couleur
      const firstData = 4;
      const lastData = 3 + rows.length;
      if (lastData >= firstData) {
        columns.forEach((c, i) => {
          const col = String.fromCharCode(65 + i);
          const ref = `${col}${firstData}:${col}${lastData}`;
          if (c.bar) {
            ws.addConditionalFormatting({ ref, rules: [{
              type: 'dataBar',
              cfvo: [{ type: 'num', value: 0 }, { type: 'max' }],
              color: { argb: c.barColor || BAR.blue },
            }] });
          }
          if (c.scale) {
            const stops = c.scale === 'rate'
              ? [{ type: 'num', value: 0 }, { type: 'num', value: 50 }, { type: 'num', value: 100 }]
              : [{ type: 'min' }, { type: 'percentile', value: 50 }, { type: 'max' }];
            ws.addConditionalFormatting({ ref, rules: [{
              type: 'colorScale',
              cfvo: stops,
              color: [{ argb: 'FFF8696B' }, { argb: 'FFFFEB84' }, { argb: 'FF63BE7B' }],
            }] });
          }
        });
      }
      return ws;
    };

    // ── Feuille 1 : Synthèse (mise en page « tableau de bord ») ──
    const ws = wb.addWorksheet('Synthèse', {
      properties: { tabColor: { argb: C.indigo } },
      views: [{ showGridLines: false }],
    });
    ws.columns = [{ width: 34 }, { width: 22 }, { width: 10 }];
    ws.mergeCells('A1:C1');
    const t = ws.getCell('A1');
    t.value = 'RAPPORT FINANCIER';
    t.font = { bold: true, size: 18, color: { argb: C.headText } };
    t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.indigo } };
    t.alignment = { vertical: 'middle', indent: 1 };
    ws.getRow(1).height = 34;
    ws.mergeCells('A2:C2');
    const t2 = ws.getCell('A2');
    t2.value = `Période : ${formatDate(range.from)} — ${formatDate(range.to)}   ·   Édité le ${formatDate(todayISO())}`;
    t2.font = { italic: true, size: 10, color: { argb: C.slate } };
    t2.alignment = { indent: 1 };
    ws.getRow(2).height = 18;

    // Bloc « cartes » indicateurs (libellé + montant coloré)
    const kpis = [
      ['Encaissements', data.income?.total, C.green],
      ['Dépenses', data.expense?.total, C.red],
      ['Résultat net', data.net, data.net >= 0 ? C.blue : C.orange],
      ['Reste à recouvrer (global)', data.recouvrement?.outstanding_total, C.amber],
    ];
    let rIdx = 4;
    kpis.forEach(([label, val, color]) => {
      const lc = ws.getCell(`A${rIdx}`);
      lc.value = label;
      lc.font = { bold: true, color: { argb: C.headText } };
      lc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
      lc.alignment = { vertical: 'middle', indent: 1 };
      lc.border = allBorders;
      const vc = ws.getCell(`B${rIdx}`);
      vc.value = Number(val || 0);
      vc.numFmt = MONEY;
      vc.font = { bold: true, size: 12 };
      vc.alignment = { horizontal: 'right' };
      vc.border = allBorders;
      ws.getRow(rIdx).height = 22;
      rIdx += 1;
    });
    // Barre de données comparant les indicateurs (mini-graphe)
    ws.addConditionalFormatting({
      ref: `B4:B${rIdx - 1}`,
      rules: [{ type: 'dataBar', cfvo: [{ type: 'num', value: 0 }, { type: 'max' }], color: { argb: BAR.blue } }],
    });

    // Sous-tableau recouvrement
    rIdx += 1;
    const recTitle = ws.getCell(`A${rIdx}`);
    recTitle.value = 'Recouvrement';
    recTitle.font = { bold: true, size: 12, color: { argb: C.slate } };
    rIdx += 1;
    const recRows = [
      ['Facturé sur la période', data.recouvrement?.invoiced_period],
      ['Encaissé sur la période', data.recouvrement?.collected_period],
      ['Total facturé (global)', data.recouvrement?.invoiced_total],
      ['Total encaissé (global)', data.recouvrement?.paid_total],
      ['Reste à recouvrer (global)', data.recouvrement?.outstanding_total],
    ];
    recRows.forEach(([label, val], i) => {
      const lc = ws.getCell(`A${rIdx}`);
      lc.value = label;
      lc.border = allBorders;
      if (i % 2 === 1) lc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.zebra } };
      const vc = ws.getCell(`B${rIdx}`);
      vc.value = Number(val || 0);
      vc.numFmt = MONEY;
      vc.alignment = { horizontal: 'right' };
      vc.border = allBorders;
      if (i % 2 === 1) vc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.zebra } };
      rIdx += 1;
    });
    const rateL = ws.getCell(`A${rIdx}`);
    rateL.value = 'Taux de recouvrement';
    rateL.font = { bold: true, color: { argb: C.headText } };
    rateL.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.slate } };
    rateL.border = allBorders;
    const rateV = ws.getCell(`B${rIdx}`);
    rateV.value = (data.recouvrement?.rate || 0) / 100;
    rateV.numFmt = '0.0%';
    rateV.font = { bold: true, color: { argb: C.headText } };
    rateV.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.slate } };
    rateV.alignment = { horizontal: 'right' };
    rateV.border = allBorders;

    // ── Feuille : Par mode de paiement ──
    buildSheet('Par mode', C.blue, 'Encaissements par mode de paiement',
      [
        { key: 'mode', header: 'Mode de paiement', width: 22 },
        { key: 'montant', header: 'Montant', width: 20, money: true, bar: true, barColor: BAR.green },
        { key: 'nb', header: 'Nb', width: 10, center: true },
      ],
      METHOD_ORDER.map(m => ({
        mode: METHOD_LABELS[m],
        montant: Number(data.income?.by_method?.[m]?.total || 0),
        nb: data.income?.by_method?.[m]?.count || 0,
      })),
      { mode: 'TOTAL', montant: Number(data.income?.total || 0), nb: data.income?.count || 0 },
    );

    // ── Feuille : Par jour ──
    buildSheet('Par jour', C.indigo, 'Ventilation par jour',
      [
        { key: 'date', header: 'Date', width: 14 },
        { key: 'income', header: 'Encaissé', width: 18, money: true, bar: true, barColor: BAR.green },
        { key: 'expense', header: 'Dépensé', width: 18, money: true, bar: true, barColor: BAR.red },
        { key: 'net', header: 'Net', width: 16, money: true, scale: true },
      ],
      (data.by_day || []).map(r => ({ date: r.date, income: r.income, expense: r.expense, net: r.net })),
      {
        date: 'TOTAL',
        income: (data.by_day || []).reduce((s, r) => s + r.income, 0),
        expense: (data.by_day || []).reduce((s, r) => s + r.expense, 0),
        net: (data.by_day || []).reduce((s, r) => s + r.net, 0),
      },
    );

    // ── Feuille : Par mois ──
    buildSheet('Par mois', C.indigo, 'Ventilation par mois',
      [
        { key: 'label', header: 'Mois', width: 18 },
        { key: 'income', header: 'Encaissé', width: 18, money: true, bar: true, barColor: BAR.green },
        { key: 'expense', header: 'Dépensé', width: 18, money: true, bar: true, barColor: BAR.red },
        { key: 'net', header: 'Net', width: 16, money: true, scale: true },
      ],
      (data.by_month || []).map(r => ({ label: r.label, income: r.income, expense: r.expense, net: r.net })),
      {
        label: 'TOTAL',
        income: (data.by_month || []).reduce((s, r) => s + r.income, 0),
        expense: (data.by_month || []).reduce((s, r) => s + r.expense, 0),
        net: (data.by_month || []).reduce((s, r) => s + r.net, 0),
      },
    );

    // ── Feuille : Encaissements détaillés ──
    buildSheet('Encaissements', C.green, 'Détail des encaissements',
      [
        { key: 'date', header: 'Date', width: 13 },
        { key: 'recu', header: 'Reçu', width: 16 },
        { key: 'eleve', header: 'Élève', width: 26 },
        { key: 'classe', header: 'Classe', width: 16 },
        { key: 'mode', header: 'Mode', width: 14 },
        { key: 'montant', header: 'Montant', width: 18, money: true, bar: true, barColor: BAR.green },
      ],
      (data.payments || []).map(p => ({
        date: p.payment_date, recu: p.receipt_number,
        eleve: p.student ? `${p.student.first_name} ${p.student.last_name}` : '—',
        classe: p.student?.classes?.name || '', mode: METHOD_LABELS[p.method] || p.method,
        montant: Number(p.amount || 0),
      })),
      { date: '', recu: '', eleve: '', classe: '', mode: 'TOTAL', montant: Number(data.income?.total || 0) },
    );

    // ── Feuille : Dépenses (si admin) ──
    if ((data.expenses || []).length > 0) {
      buildSheet('Dépenses', C.red, 'Détail des dépenses',
        [
          { key: 'date', header: 'Date', width: 13 },
          { key: 'cat', header: 'Catégorie', width: 18 },
          { key: 'desc', header: 'Description', width: 30 },
          { key: 'paid', header: 'Bénéficiaire', width: 20 },
          { key: 'mode', header: 'Mode', width: 14 },
          { key: 'montant', header: 'Montant', width: 18, money: true, bar: true, barColor: BAR.red },
        ],
        data.expenses.map(e => ({
          date: e.expense_date, cat: EXPENSE_CATEGORIES[e.category] || e.category,
          desc: e.description || '', paid: e.paid_to || '',
          mode: METHOD_LABELS[e.payment_method] || e.payment_method || '', montant: Number(e.amount || 0),
        })),
        { date: '', cat: '', desc: '', paid: '', mode: 'TOTAL', montant: Number(data.expense?.total || 0) },
      );
    }

    // ── Feuille : Recouvrement par classe ──
    buildSheet('Par classe', C.amber, 'Recouvrement par classe (global)',
      [
        { key: 'classe', header: 'Classe', width: 22 },
        { key: 'invoiced', header: 'Facturé', width: 18, money: true, bar: true, barColor: BAR.blue },
        { key: 'paid', header: 'Encaissé', width: 18, money: true, bar: true, barColor: BAR.green },
        { key: 'remaining', header: 'Reste', width: 18, money: true, bar: true, barColor: BAR.red },
        { key: 'rate', header: 'Taux', width: 12, pct: true, scale: 'rate' },
      ],
      (data.recouvrement?.by_class || []).map(c => ({
        classe: c.class_name, invoiced: c.invoiced, paid: c.paid, remaining: c.remaining, rate: c.rate,
      })),
      {
        classe: 'TOTAL',
        invoiced: Number(data.recouvrement?.invoiced_total || 0),
        paid: Number(data.recouvrement?.paid_total || 0),
        remaining: Number(data.recouvrement?.outstanding_total || 0),
        rate: data.recouvrement?.rate || 0,
      },
    );

    // ── Feuille : Recettes par flux (réel, période exacte) ──
    const revStream = data.by_stream?.revenue || [];
    if (revStream.length) {
      buildSheet('Recettes par flux', C.green, 'Recettes réelles par flux (sur la période)',
        [
          { key: 'flux', header: 'Flux', width: 24 },
          { key: 'billed', header: 'Facturé', width: 18, money: true, bar: true, barColor: BAR.blue },
          { key: 'collected', header: 'Encaissé', width: 18, money: true, bar: true, barColor: BAR.green },
          { key: 'impayes', header: 'Impayés', width: 18, money: true, bar: true, barColor: BAR.red },
        ],
        revStream.map(r => ({ flux: r.name, billed: r.billed, collected: r.collected, impayes: r.impayes })),
        {
          flux: 'TOTAL',
          billed: Number(data.by_stream?.billed_total || 0),
          collected: Number(data.by_stream?.collected_total || 0),
          impayes: Number(data.by_stream?.impayes_total || 0),
        },
      );
    }

    // ── Feuille : Dépenses par poste comptable (réel, période exacte) ──
    const expSections = data.by_stream?.expense_sections || [];
    if (expSections.length) {
      const flatRows = [];
      expSections.forEach(sec => sec.lines.forEach(l => flatRows.push({ section: sec.name, poste: l.name, montant: l.amount })));
      buildSheet('Dépenses par poste', C.red, 'Dépenses réelles par poste comptable (sur la période)',
        [
          { key: 'section', header: 'Section', width: 24 },
          { key: 'poste', header: 'Poste', width: 28 },
          { key: 'montant', header: 'Montant', width: 18, money: true, bar: true, barColor: BAR.red },
        ],
        flatRows,
        { section: 'TOTAL', poste: '', montant: Number(data.by_stream?.expense_total || 0) },
      );
    }
  };

  // Télécharge un classeur ExcelJS sous le nom donné.
  const downloadWorkbook = async (wb, name) => {
    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Export simple : synthèse + détails de la période choisie.
  const exportExcel = async () => {
    if (!data) return;
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Edutrack';
    wb.created = new Date();
    buildReportSheets(wb);
    await downloadWorkbook(wb, `${fileBase}.xlsx`);
  };

  // Export complet : matrice annuelle Prévisionnel/Réel (1er onglet) + détails de la période.
  const exportExcelComplet = async () => {
    if (!data) return;
    const ExcelJS = (await import('exceljs')).default;
    const year = currentAcademicYear();
    let matrix = null;
    try { matrix = await financeApi.getAnnualMatrix(year); }
    catch (e) { alert('Impossible de charger le tableau annuel : ' + e.message); return; }
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Edutrack';
    wb.created = new Date();
    addPrevisionnelSheet(wb, year, matrix);
    buildReportSheets(wb);
    await downloadWorkbook(wb, `finance_complet_${year}_${range.from}_${range.to}.xlsx`);
  };

  // ── Export PDF ───────────────────────────────────────────────────────────
  const exportPDF = async () => {
    if (!data) return;
    let jsPDF, autoTable;
    try {
      const jsPDFModule = await import('jspdf');
      const autoTableModule = await import('jspdf-autotable');
      jsPDF = jsPDFModule.default;
      autoTable = autoTableModule.default;
    } catch (e) {
      alert('Impossible de générer le PDF. Veuillez réessayer.');
      return;
    }

    const doc = new jsPDF('p', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    const M = 14;
    let y = M;

    doc.setFontSize(16); doc.setFont('helvetica', 'bold');
    doc.text('Rapport financier', M, y); y += 7;
    doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.setTextColor(110);
    doc.text(`Période : ${formatDate(range.from)} — ${formatDate(range.to)}`, M, y);
    doc.text(`Édité le ${formatDate(todayISO())}`, pageWidth - M, y, { align: 'right' });
    doc.setTextColor(0); y += 6;

    // Synthèse
    autoTable(doc, {
      startY: y, theme: 'grid',
      head: [['Indicateur', 'Montant']],
      body: [
        ['Encaissements', `${formatMAD(data.income?.total)}`],
        ['Dépenses', `${formatMAD(data.expense?.total)}`],
        ['Résultat net', `${formatMAD(data.net)}`],
        ['Reste à recouvrer (global)', `${formatMAD(data.recouvrement?.outstanding_total)}`],
        ['Taux de recouvrement', `${(data.recouvrement?.rate || 0).toFixed(1)} %`],
      ],
      headStyles: { fillColor: [16, 185, 129] },
      styles: { fontSize: 9 },
      columnStyles: { 1: { halign: 'right' } },
      margin: { left: M, right: M },
    });
    y = doc.lastAutoTable.finalY + 6;

    // Encaissements par mode
    autoTable(doc, {
      startY: y, theme: 'striped',
      head: [['Mode de paiement', 'Montant', 'Nb']],
      body: METHOD_ORDER.map(m => [
        METHOD_LABELS[m], formatMAD(data.income?.by_method?.[m]?.total), String(data.income?.by_method?.[m]?.count || 0),
      ]),
      headStyles: { fillColor: [59, 130, 246] },
      styles: { fontSize: 9 },
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
      margin: { left: M, right: M },
    });
    y = doc.lastAutoTable.finalY + 6;

    // Ventilation (jour ou mois selon granularité choisie)
    const isMonth = granularity === 'month';
    autoTable(doc, {
      startY: y, theme: 'striped',
      head: [[isMonth ? 'Mois' : 'Date', 'Encaissé', 'Dépensé', 'Net']],
      body: breakdown.map(r => [
        isMonth ? r.label : formatDate(r.date), formatMAD(r.income), formatMAD(r.expense), formatMAD(r.net),
      ]),
      headStyles: { fillColor: [99, 102, 241] },
      styles: { fontSize: 8 },
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
      margin: { left: M, right: M },
    });
    y = doc.lastAutoTable.finalY + 6;

    // Recouvrement par classe
    autoTable(doc, {
      startY: y, theme: 'grid',
      head: [['Classe', 'Facturé', 'Encaissé', 'Reste', 'Taux']],
      body: (data.recouvrement?.by_class || []).map(c => [
        c.class_name, formatMAD(c.invoiced), formatMAD(c.paid), formatMAD(c.remaining), `${c.rate.toFixed(0)} %`,
      ]),
      headStyles: { fillColor: [234, 88, 12] },
      styles: { fontSize: 8 },
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
      margin: { left: M, right: M },
    });
    y = doc.lastAutoTable.finalY + 6;

    // Recettes réelles par flux (période)
    const revStream = data.by_stream?.revenue || [];
    if (revStream.length) {
      autoTable(doc, {
        startY: y, theme: 'striped',
        head: [['Flux', 'Facturé', 'Encaissé', 'Impayés']],
        body: revStream.map(r => [r.name, formatMAD(r.billed), formatMAD(r.collected), formatMAD(r.impayes)]),
        foot: [['TOTAL', formatMAD(data.by_stream?.billed_total), formatMAD(data.by_stream?.collected_total), formatMAD(data.by_stream?.impayes_total)]],
        headStyles: { fillColor: [16, 185, 129] }, footStyles: { fillColor: [51, 65, 85] },
        styles: { fontSize: 8 },
        columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
        margin: { left: M, right: M },
      });
      y = doc.lastAutoTable.finalY + 6;
    }

    // Dépenses réelles par poste comptable (période)
    const expSections = data.by_stream?.expense_sections || [];
    if (expSections.length) {
      const body = [];
      expSections.forEach(sec => sec.lines.forEach(l => body.push([sec.name, l.name, formatMAD(l.amount)])));
      autoTable(doc, {
        startY: y, theme: 'striped',
        head: [['Section', 'Poste', 'Montant']],
        body,
        foot: [['TOTAL', '', formatMAD(data.by_stream?.expense_total)]],
        headStyles: { fillColor: [239, 68, 68] }, footStyles: { fillColor: [51, 65, 85] },
        styles: { fontSize: 8 },
        columnStyles: { 2: { halign: 'right' } },
        margin: { left: M, right: M },
      });
    }

    doc.save(`${fileBase}.pdf`);
  };

  const maxBar = Math.max(1, ...breakdown.flatMap(r => [r.income, r.expense]));

  return (
    <div className="p-6 space-y-5">
      <PageHeader icon={BarChart3} title="Rapports financiers" color="blue"
        subtitle="Synthèse recettes / dépenses / recouvrement — exportable par période, mois ou jour"
        actions={
          <>
            <Button variant="secondary" icon={FileSpreadsheet} onClick={exportExcel} disabled={!data}>Excel</Button>
            <Button variant="secondary" icon={LayoutGrid} onClick={exportExcelComplet} disabled={!data}>Excel complet</Button>
            <Button color="blue" icon={FileText} onClick={exportPDF} disabled={!data}>PDF</Button>
          </>
        } />

      {/* Filtres période + granularité */}
      <div className="flex flex-wrap items-center gap-2">
        {PERIODS.map((p) => (
          <button key={p.key} onClick={() => setPeriod(p.key)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition ${
              period === p.key ? 'bg-blue-600 text-white' : 'bg-card border border-gray-200 text-gray-700 hover:bg-gray-50'
            }`}>
            {p.label}
          </button>
        ))}
        {period === 'custom' && (
          <div className="flex items-center gap-2 ml-2">
            <input type="date" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })}
              className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm" />
            <span className="text-gray-400">→</span>
            <input type="date" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })}
              className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm" />
          </div>
        )}
        <span className="text-sm text-gray-500 ml-auto">{periodLabel}</span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40 text-gray-500">Chargement…</div>
      ) : error ? (
        <div className="p-6 text-red-600">{error}</div>
      ) : data ? (
        <>
          {/* Totaux */}
          <KpiGrid cols={4}>
            <KpiCard label="Encaissements" value={formatMAD(data.income?.total)} tone="green" icon={TrendingUp} sub={`${data.income?.count || 0} paiement(s)`} />
            <KpiCard label="Dépenses" value={formatMAD(data.expense?.total)} tone="red" icon={TrendingDown} sub={`${data.expense?.count || 0} sortie(s)`} />
            <KpiCard label="Résultat net" value={formatMAD(data.net)} tone={data.net >= 0 ? 'blue' : 'orange'} icon={Wallet} sub="encaissé − dépensé" />
            <KpiCard label="Reste à recouvrer" value={formatMAD(data.recouvrement?.outstanding_total)} tone="orange" icon={Receipt} sub={`Taux d'encaissement (réel): ${(data.recouvrement?.rate || 0).toFixed(0)}%`} />
          </KpiGrid>

          {/* Répartition par mode */}
          <Card title="Encaissements par mode de paiement">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {METHOD_ORDER.map((m) => {
                const Icon = METHOD_ICONS[m];
                const info = data.income?.by_method?.[m] || { total: 0, count: 0 };
                const pct = data.income?.total > 0 ? Math.round((info.total / data.income.total) * 100) : 0;
                return (
                  <div key={m} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                    <div className="flex items-center gap-2 text-gray-600 mb-1">
                      <Icon className="w-4 h-4" /><span className="text-xs font-medium">{METHOD_LABELS[m]}</span>
                    </div>
                    <p className="text-lg font-bold text-gray-900">{formatMAD(info.total)}</p>
                    <p className="text-xs text-gray-500">{info.count} · {pct}%</p>
                    <div className="h-1.5 bg-gray-200 rounded-full mt-2 overflow-hidden">
                      <div className="h-full bg-blue-500" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Ventilation jour / mois */}
          <div className="rounded-xl border border-gray-200 bg-card shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">Ventilation {granularity === 'month' ? 'par mois' : 'par jour'}</h2>
              <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
                {GRANULARITIES.map(g => (
                  <button key={g.key} onClick={() => setGranularity(g.key)}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition ${
                      granularity === g.key ? 'bg-card shadow-sm text-blue-700' : 'text-gray-500 hover:text-gray-700'
                    }`}>
                    {g.label}
                  </button>
                ))}
              </div>
            </div>
            {breakdown.length === 0 ? (
              <p className="text-center text-gray-500 py-6">Aucun mouvement sur cette période.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 border-b border-gray-100">
                      <th className="px-3 py-2 font-medium">{granularity === 'month' ? 'Mois' : 'Date'}</th>
                      <th className="px-3 py-2 font-medium">Évolution</th>
                      <th className="px-3 py-2 font-medium text-right">Encaissé</th>
                      <th className="px-3 py-2 font-medium text-right">Dépensé</th>
                      <th className="px-3 py-2 font-medium text-right">Net</th>
                    </tr>
                  </thead>
                  <tbody>
                    {breakdown.map((r, i) => (
                      <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{granularity === 'month' ? r.label : formatDate(r.date)}</td>
                        <td className="px-3 py-2 w-1/3">
                          <div className="flex items-center gap-1 h-4">
                            <div className="bg-emerald-400 rounded-sm h-3" style={{ width: `${(r.income / maxBar) * 100}%` }} title={`Encaissé: ${formatMAD(r.income)}`} />
                            <div className="bg-rose-400 rounded-sm h-3" style={{ width: `${(r.expense / maxBar) * 100}%` }} title={`Dépensé: ${formatMAD(r.expense)}`} />
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right text-emerald-700">{formatMAD(r.income)}</td>
                        <td className="px-3 py-2 text-right text-rose-700">{formatMAD(r.expense)}</td>
                        <td className={`px-3 py-2 text-right font-semibold ${r.net >= 0 ? 'text-gray-900' : 'text-red-600'}`}>{formatMAD(r.net)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Recouvrement par classe */}
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-5">
            <h2 className="font-semibold text-gray-900 mb-0.5">Taux d'encaissement par classe (réel)</h2>
            <p className="text-xs text-gray-400 mb-4">Encaissé / facturé — sur l'ensemble des factures</p>
            {(data.recouvrement?.by_class || []).length === 0 ? (
              <p className="text-center text-gray-500 py-6">Aucune facture.</p>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {data.recouvrement.by_class.map((c, i) => (
                  <div key={i}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="font-medium text-gray-700">{c.class_name}</span>
                      <span className={c.rate >= 80 ? 'text-green-600' : c.rate >= 50 ? 'text-yellow-600' : 'text-red-600'}>
                        {c.rate.toFixed(0)}%
                      </span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2">
                      <div className={`h-2 rounded-full ${c.rate >= 80 ? 'bg-green-500' : c.rate >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
                        style={{ width: `${Math.min(100, c.rate)}%` }} />
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      {formatMAD(c.paid)} / {formatMAD(c.invoiced)} · reste {formatMAD(c.remaining)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recettes réelles par flux (période exacte) */}
          {(data.by_stream?.revenue || []).length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-card shadow-sm p-5">
              <h2 className="font-semibold text-gray-900 mb-1">Recettes par flux</h2>
              <p className="text-xs text-gray-500 mb-4">Réel sur la période — facturé, encaissé et impayés par type de recette.</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 border-b border-gray-100">
                      <th className="px-3 py-2 font-medium">Flux</th>
                      <th className="px-3 py-2 font-medium text-right">Facturé</th>
                      <th className="px-3 py-2 font-medium text-right">Encaissé</th>
                      <th className="px-3 py-2 font-medium text-right">Impayés</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.by_stream.revenue.map((r, i) => (
                      <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="px-3 py-2 text-gray-700">{r.name}</td>
                        <td className="px-3 py-2 text-right text-gray-600">{formatMAD(r.billed)}</td>
                        <td className="px-3 py-2 text-right text-emerald-700">{formatMAD(r.collected)}</td>
                        <td className={`px-3 py-2 text-right ${r.impayes > 0 ? 'text-red-600' : 'text-gray-500'}`}>{formatMAD(r.impayes)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-gray-200 font-semibold text-gray-900">
                      <td className="px-3 py-2">TOTAL</td>
                      <td className="px-3 py-2 text-right">{formatMAD(data.by_stream.billed_total)}</td>
                      <td className="px-3 py-2 text-right">{formatMAD(data.by_stream.collected_total)}</td>
                      <td className="px-3 py-2 text-right">{formatMAD(data.by_stream.impayes_total)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* Dépenses réelles par poste comptable (période exacte) */}
          {(data.by_stream?.expense_sections || []).length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-card shadow-sm p-5">
              <h2 className="font-semibold text-gray-900 mb-1">Dépenses par poste</h2>
              <p className="text-xs text-gray-500 mb-4">Réel sur la période — regroupé par section et poste comptable.</p>
              <div className="space-y-4">
                {data.by_stream.expense_sections.map((sec, i) => (
                  <div key={i}>
                    <div className="flex items-center justify-between text-sm font-semibold text-gray-800 border-b border-gray-100 pb-1 mb-1">
                      <span>{sec.name}</span>
                      <span>{formatMAD(sec.subtotal)}</span>
                    </div>
                    {sec.lines.map((l, j) => (
                      <div key={j} className="flex items-center justify-between text-sm text-gray-600 py-0.5 pl-3">
                        <span>{l.name}</span>
                        <span className="tabular-nums">{formatMAD(l.amount)}</span>
                      </div>
                    ))}
                  </div>
                ))}
                <div className="flex items-center justify-between font-semibold text-gray-900 border-t border-gray-200 pt-2">
                  <span>TOTAL DÉPENSES</span>
                  <span>{formatMAD(data.by_stream.expense_total)}</span>
                </div>
              </div>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
};

export default ReportsPage;
