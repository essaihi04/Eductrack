import { useState, useEffect, Fragment } from 'react';
import { LayoutGrid, Download, Printer } from 'lucide-react';
import { financeApi } from '../../lib/financeApi';
import { PageHeader, Button } from '../../components/finance/ui';
import { addPrevisionnelSheet } from './previsionnelSheet';

const SHORT = { 1: 'Jan', 2: 'Fév', 3: 'Mar', 4: 'Avr', 5: 'Mai', 6: 'Juin', 7: 'Juil', 8: 'Août', 9: 'Sept', 10: 'Oct', 11: 'Nov', 12: 'Déc' };

function currentAcademicYear() {
  const d = new Date(); const y = d.getFullYear();
  return d.getMonth() + 1 >= 9 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}
function yearOptions() {
  const cur = currentAcademicYear(); const y1 = parseInt(cur.split('-')[0], 10);
  return [`${y1 - 1}-${y1}`, cur, `${y1 + 1}-${y1 + 2}`];
}
const fmt = (n) => { const v = Math.round(Number(n) || 0); return v === 0 ? '' : v.toLocaleString('fr-FR'); };

export default function PrevisionnelMatrixPage() {
  const [year, setYear] = useState(currentAcademicYear());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, [year]);
  const load = async () => {
    setLoading(true);
    try { setData(await financeApi.getAnnualMatrix(year)); }
    catch (e) { console.error(e); alert('Erreur: ' + e.message); }
    finally { setLoading(false); }
  };

  if (loading || !data) return <div className="p-6 text-gray-400">Chargement…</div>;

  const months = data.months || [];
  const eff = (actual = [], budget = []) => months.map((mo, i) => (mo.is_real ? Number(actual[i] || 0) : Number(budget[i] || 0)));
  const sum = (arr) => arr.reduce((s, v) => s + (Number(v) || 0), 0);

  // Dénominateurs (effectifs)
  const caEff = eff(data.revenue.totals.ca, data.revenue.totals.ca_budget);
  const caTotal = sum(caEff);
  const depEff = eff(data.expenses.total.actual, data.expenses.total.budget);
  const depTotal = sum(depEff);

  // Lignes à afficher : { label, actual, budget, kind:'rev'|'exp', style }
  const rows = [];
  rows.push({ section: 'RECETTES', cls: 'bg-green-100 text-green-900 font-bold' });
  data.revenue.encaissements.forEach((l) =>
    rows.push({ label: l.name, actual: l.actual, budget: l.budget, denom: caTotal, indent: true }));
  rows.push({ label: 'TOTAL ENCAISSEMENTS', actual: data.revenue.totals.encaissements, budget: data.revenue.totals.ca_budget, bold: true, denom: caTotal });
  rows.push({ label: 'TOTAL IMPAYÉS', actual: data.revenue.totals.impayes, budget: months.map(() => 0), bold: true, muted: true });
  rows.push({ label: "CA (chiffre d'affaires)", actual: data.revenue.totals.ca, budget: data.revenue.totals.ca_budget, bold: true, cls: 'bg-green-50' });

  rows.push({ section: 'DÉPENSES', cls: 'bg-red-100 text-red-900 font-bold' });
  data.expenses.sections.forEach((sec) => {
    rows.push({ label: sec.name, subheader: true });
    sec.lines.forEach((l) => rows.push({ label: l.name, actual: l.actual, budget: l.budget, denom: depTotal, indent: true }));
    rows.push({ label: `Sous-total ${sec.name}`, actual: sec.subtotal.actual, budget: sec.subtotal.budget, bold: true, denom: depTotal, cls: 'bg-red-50/50' });
  });
  rows.push({ label: 'TOTAL DÉPENSES', actual: data.expenses.total.actual, budget: data.expenses.total.budget, bold: true, cls: 'bg-red-50' });

  rows.push({ label: 'RÉSULTAT (CA − Dépenses)', actual: data.result.actual, budget: data.result.budget, bold: true, cls: 'bg-indigo-100 text-indigo-900', result: true });

  const lineValues = (r) => {
    const e = eff(r.actual, r.budget);
    const cumule = sum(e);
    const totalBudget = sum(r.budget || []);
    const pct = r.denom ? (cumule / r.denom) * 100 : null;
    return { e, cumule, totalBudget, pct };
  };

  const exportCSV = () => {
    const sep = ';';
    const head = ['Poste', ...months.map((m) => `${SHORT[m.month]} ${m.year}${m.is_real ? '' : ' (prev)'}`), 'Cumulé', 'Budget', '%'];
    const lines = [head.join(sep)];
    rows.forEach((r) => {
      if (r.section) { lines.push(r.section); return; }
      if (r.subheader) { lines.push(r.label); return; }
      const { e, cumule, totalBudget, pct } = lineValues(r);
      lines.push([r.label, ...e.map((v) => Math.round(v)), Math.round(cumule), Math.round(totalBudget), pct != null ? pct.toFixed(1) : ''].join(sep));
    });
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `Previsionnel_${year}.csv`;
    a.click();
  };

  // Export Excel coloré : Réel / Prévisionnel différenciés, sections colorées,
  // négatifs en rouge, barre de données sur le cumulé, ligne de résultat mise en avant.
  const exportXLSX = async () => {
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Edutrack';
    addPrevisionnelSheet(wb, year, data);

    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `Previsionnel_${year}.xlsx`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="p-6 space-y-4">
      <div className="print:hidden">
        <PageHeader icon={LayoutGrid} title="Prévisionnel / Réel" color="blue"
          subtitle="Tableau de gestion annuel — Réel (mois passés) vs Prévisionnel (mois à venir)."
          onRefresh={load}
          actions={
            <>
              <select value={year} onChange={(e) => setYear(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg">
                {yearOptions().map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
              <Button variant="secondary" icon={Download} onClick={exportXLSX}>Excel</Button>
              <Button variant="secondary" icon={Download} onClick={exportCSV}>CSV</Button>
              <Button variant="secondary" icon={Printer} onClick={() => window.print()}>Imprimer</Button>
            </>
          } />
      </div>

      <div className="flex gap-4 text-xs text-gray-500 print:hidden">
        <span className="flex items-center gap-1"><span className="w-3 h-3 bg-gray-100 border border-gray-200 inline-block" /> Réel</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 bg-blue-50 border border-blue-200 inline-block" /> Prévisionnel</span>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-auto">
        <table className="text-xs border-collapse min-w-max">
          <thead className="bg-gray-50 text-gray-600 sticky top-0 z-10">
            <tr>
              <th className="px-3 py-2 text-left sticky left-0 bg-gray-50 min-w-[210px]">Poste</th>
              {months.map((m) => (
                <th key={m.month} className={`px-2 py-2 text-right min-w-[72px] ${m.is_real ? '' : 'text-blue-600'}`}>{SHORT[m.month]}<br /><span className="font-normal text-[10px]">{m.year}</span></th>
              ))}
              <th className="px-3 py-2 text-right min-w-[90px] font-bold">Cumulé</th>
              <th className="px-3 py-2 text-right min-w-[90px]">Budget</th>
              <th className="px-2 py-2 text-right min-w-[56px]">%</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => {
              if (r.section) return (
                <tr key={idx} className={r.cls}><td className="px-3 py-1.5 sticky left-0" colSpan={months.length + 4}>{r.section}</td></tr>
              );
              if (r.subheader) return (
                <tr key={idx} className="bg-gray-50"><td className="px-3 py-1 font-semibold text-gray-600 sticky left-0 bg-gray-50" colSpan={months.length + 4}>{r.label}</td></tr>
              );
              const { e, cumule, totalBudget, pct } = lineValues(r);
              return (
                <tr key={idx} className={`border-t border-gray-50 ${r.cls || ''}`}>
                  <td className={`px-3 py-1 sticky left-0 bg-white ${r.bold ? 'font-bold' : ''} ${r.indent ? 'pl-7' : ''} ${r.muted ? 'text-gray-500' : 'text-gray-800'} ${r.cls || ''}`}>{r.label}</td>
                  {months.map((m, i) => (
                    <td key={i} className={`px-2 py-1 text-right tabular-nums ${m.is_real ? '' : 'bg-blue-50/60'} ${r.bold ? 'font-semibold' : ''} ${r.result && e[i] < 0 ? 'text-red-600' : ''}`}>{fmt(e[i])}</td>
                  ))}
                  <td className={`px-3 py-1 text-right tabular-nums font-bold ${r.result && cumule < 0 ? 'text-red-600' : ''}`}>{fmt(cumule)}</td>
                  <td className="px-3 py-1 text-right tabular-nums text-gray-500">{fmt(totalBudget)}</td>
                  <td className="px-2 py-1 text-right tabular-nums text-gray-500">{pct != null && pct !== 0 ? pct.toFixed(0) + '%' : ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
