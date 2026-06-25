import { useState, useEffect } from 'react';
import { LayoutGrid } from 'lucide-react';
import { financeApi } from '../../lib/financeApi';
import { PageHeader } from '../../components/finance/ui';
import { useYear } from '../../contexts/YearContext';
import { toDashYear } from '../../lib/schoolYear';

const SHORT = { 1: 'Jan', 2: 'Fév', 3: 'Mar', 4: 'Avr', 5: 'Mai', 6: 'Juin', 7: 'Juil', 8: 'Août', 9: 'Sept', 10: 'Oct', 11: 'Nov', 12: 'Déc' };

function currentAcademicYear() {
  const d = new Date(); const y = d.getFullYear();
  return d.getMonth() + 1 >= 9 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}
const fmt = (n) => { const v = Math.round(Number(n) || 0); return v === 0 ? '' : v.toLocaleString('fr-FR'); };

export default function PrevisionnelMatrixPage() {
  const { year: activeYear } = useYear();
  // Année pilotée par le sélecteur global de l'en-tête (plus de sélecteur local).
  const year = toDashYear(activeYear) || currentAcademicYear();
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
  const fcIdx = months.findIndex((m) => !m.is_real); // 1er mois prévisionnel (frontière réel/prév.)
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

  rows.push({ label: 'RÉSULTAT COMPTABLE (CA − Dépenses)', actual: data.result.actual, budget: data.result.budget, bold: true, cls: 'bg-indigo-100 text-indigo-900', result: true });
  rows.push({ label: 'RÉSULTAT ENCAISSÉ (encaissé − dépensé)', actual: data.resultCash?.actual || [], budget: data.resultCash?.budget || [], bold: true, cls: 'bg-emerald-100 text-emerald-900', result: true });

  const lineValues = (r) => {
    const e = eff(r.actual, r.budget);
    const cumule = sum(e);
    const totalBudget = sum(r.budget || []);
    const pct = r.denom ? (cumule / r.denom) * 100 : null;
    return { e, cumule, totalBudget, pct };
  };

  return (
    <div className="p-6 space-y-4">
      <div className="print:hidden">
        <PageHeader icon={LayoutGrid} title="Prévisionnel / Réel" color="blue"
          subtitle="Tableau de gestion annuel — Réel (mois passés) vs Prévisionnel (mois à venir)."
          onRefresh={load} />
      </div>

      <div className="flex gap-4 text-xs text-gray-500 print:hidden">
        <span className="flex items-center gap-1"><span className="w-3 h-3 bg-white border border-gray-300 inline-block" /> Réel (mois passés)</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 bg-blue-100 border border-blue-300 inline-block" /> Prévisionnel (mois à venir)</span>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full table-fixed text-[11px] border-collapse">
          <colgroup>
            <col className="w-[200px]" />
            {months.map((m) => <col key={m.month} />)}
            <col />
            <col />
            <col />
          </colgroup>
          <thead className="sticky top-0 z-10">
            <tr>
              <th className="px-2 py-2 text-left sticky left-0 bg-gray-100 z-20 border-b border-gray-200">Poste</th>
              {months.map((m, i) => (
                <th key={m.month} className={`px-2 py-2 text-right leading-tight border-b border-gray-200 ${i === fcIdx ? 'border-l-2 border-l-blue-400' : ''} ${m.is_real ? 'bg-gray-100 text-gray-600' : 'bg-blue-100 text-blue-700'}`}>{SHORT[m.month]}<br /><span className="font-normal text-[9px] opacity-70">{m.year}</span></th>
              ))}
              <th className="px-2 py-2 text-right bg-gray-100 font-bold border-b border-gray-200">Cumulé</th>
              <th className="px-2 py-2 text-right bg-gray-100 border-b border-gray-200">Budget</th>
              <th className="px-2 py-2 text-right bg-gray-100 border-b border-gray-200">%</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => {
              if (r.section) return (
                <tr key={idx} className={r.cls}><td className="px-2 py-1.5 sticky left-0" colSpan={months.length + 4}>{r.section}</td></tr>
              );
              if (r.subheader) return (
                <tr key={idx} className="bg-gray-50"><td className="px-2 py-1 font-semibold text-gray-600 sticky left-0 bg-gray-50" colSpan={months.length + 4}>{r.label}</td></tr>
              );
              const { e, cumule, totalBudget, pct } = lineValues(r);
              return (
                <tr key={idx} className={`border-t border-gray-50 ${r.cls || ''}`}>
                  <td className={`px-2 py-1 sticky left-0 bg-white ${r.bold ? 'font-bold' : ''} ${r.indent ? 'pl-4' : ''} ${r.muted ? 'text-gray-500' : 'text-gray-800'} ${r.cls || ''}`}>{r.label}</td>
                  {months.map((m, i) => (
                    <td key={i} className={`px-2 py-1.5 text-right tabular-nums ${i === fcIdx ? 'border-l-2 border-l-blue-400' : ''} ${m.is_real ? '' : 'bg-blue-50'} ${r.bold ? 'font-semibold' : ''} ${r.result && e[i] < 0 ? 'text-red-600' : ''}`}>{fmt(e[i])}</td>
                  ))}
                  <td className={`px-2 py-1.5 text-right tabular-nums font-bold ${r.result && cumule < 0 ? 'text-red-600' : ''}`}>{fmt(cumule)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-gray-500">{fmt(totalBudget)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-gray-500">{pct != null && pct !== 0 ? pct.toFixed(0) + '%' : ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
