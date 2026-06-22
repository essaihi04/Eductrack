import { useState, useEffect, Fragment } from 'react';
import { CalendarRange, Save, Copy } from 'lucide-react';
import { financeApi } from '../../lib/financeApi';
import { PageHeader, Button } from '../../components/finance/ui';
import { useYear } from '../../contexts/YearContext';
import { toDashYear } from '../../lib/schoolYear';

const MONTH_ORDER = [9, 10, 11, 12, 1, 2, 3, 4, 5, 6, 7, 8];
const SHORT = { 1: 'Jan', 2: 'Fév', 3: 'Mar', 4: 'Avr', 5: 'Mai', 6: 'Juin', 7: 'Juil', 8: 'Août', 9: 'Sept', 10: 'Oct', 11: 'Nov', 12: 'Déc' };

function currentAcademicYear() {
  const d = new Date(); const y = d.getFullYear();
  return d.getMonth() + 1 >= 9 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}
function yearOptions() {
  const cur = currentAcademicYear(); const y1 = parseInt(cur.split('-')[0], 10);
  return [`${y1 - 1}-${y1}`, cur, `${y1 + 1}-${y1 + 2}`];
}

export default function BudgetPage() {
  const { year: activeYear } = useYear();
  const [year, setYear] = useState(toDashYear(activeYear) || currentAcademicYear());
  const [accounts, setAccounts] = useState([]);
  const [grid, setGrid] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, [year]);
  const load = async () => {
    setLoading(true);
    try {
      const d = await financeApi.getBudget(year);
      setAccounts(d.accounts || []);
      const g = {};
      (d.budget || []).forEach(b => { (g[b.account_id] = g[b.account_id] || {})[b.month] = Number(b.amount) || 0; });
      setGrid(g);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const setCell = (accId, month, val) =>
    setGrid(prev => ({ ...prev, [accId]: { ...(prev[accId] || {}), [month]: val === '' ? '' : Number(val) } }));

  const save = async () => {
    setSaving(true);
    try {
      const rows = [];
      Object.entries(grid).forEach(([accId, months]) => {
        Object.entries(months).forEach(([m, amt]) => rows.push({ account_id: accId, month: Number(m), amount: Number(amt) || 0 }));
      });
      await financeApi.saveBudget(year, rows);
      alert('Budget enregistré.');
    } catch (e) { alert('Erreur: ' + e.message); }
    finally { setSaving(false); }
  };

  const copyPrev = async () => {
    if (!confirm('Copier le budget de l\'année précédente ?')) return;
    try { const r = await financeApi.copyBudgetPreviousYear(year); alert(`${r.copied} valeur(s) copiée(s).`); load(); }
    catch (e) { alert('Erreur: ' + e.message); }
  };

  const rowTotal = (accId) => MONTH_ORDER.reduce((s, m) => s + (Number(grid[accId]?.[m]) || 0), 0);

  const buildBlocks = (kind) => {
    const sections = accounts.filter(a => a.kind === kind && a.node_type === 'section');
    const lines = accounts.filter(a => a.kind === kind && a.node_type === 'line' && a.is_active);
    const blocks = sections.map(sec => ({ sec, lines: lines.filter(l => l.parent_id === sec.id) })).filter(b => b.lines.length > 0);
    const orphan = lines.filter(l => !sections.some(s => s.id === l.parent_id));
    if (orphan.length) blocks.push({ sec: { id: 'orphans', name: 'Autres' }, lines: orphan });
    return blocks;
  };

  const renderGroup = (kind, title, headColor) => (
    <Fragment key={kind}>
      <tr className={headColor}>
        <td className="px-3 py-1.5 font-bold sticky left-0" colSpan={MONTH_ORDER.length + 2}>{title}</td>
      </tr>
      {buildBlocks(kind).map(b => (
        <Fragment key={b.sec.id}>
          <tr className="bg-gray-50">
            <td className="px-3 py-1 font-semibold text-gray-600 sticky left-0 bg-gray-50" colSpan={MONTH_ORDER.length + 2}>{b.sec.name}</td>
          </tr>
          {b.lines.map(line => (
            <tr key={line.id} className="hover:bg-indigo-50/40 border-t border-gray-50">
              <td className="px-3 py-1 text-gray-700 sticky left-0 bg-white">{line.name}</td>
              {MONTH_ORDER.map(m => (
                <td key={m} className="px-1 py-0.5">
                  <input type="number" value={grid[line.id]?.[m] ?? ''} onChange={e => setCell(line.id, m, e.target.value)}
                    className="w-[78px] px-1 py-1 text-right border border-transparent hover:border-gray-200 focus:border-indigo-400 rounded" />
                </td>
              ))}
              <td className="px-3 py-1 text-right font-semibold text-gray-700">{rowTotal(line.id).toLocaleString('fr-FR')}</td>
            </tr>
          ))}
        </Fragment>
      ))}
    </Fragment>
  );

  return (
    <div className="p-6 space-y-4">
      <PageHeader icon={CalendarRange} title="Budget prévisionnel" color="purple"
        subtitle="Montants prévus par poste et par mois (année scolaire Sept → Août)."
        actions={
          <>
            <select value={year} onChange={e => setYear(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg">
              {yearOptions().map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <Button variant="secondary" icon={Copy} onClick={copyPrev}>Copier N-1</Button>
            <Button color="purple" icon={Save} onClick={save} disabled={saving}>Enregistrer</Button>
          </>
        } />

      {loading ? <p className="text-gray-400">Chargement…</p> : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-auto">
          <table className="text-xs border-collapse min-w-max">
            <thead className="bg-gray-50 text-gray-600 sticky top-0 z-10">
              <tr>
                <th className="px-3 py-2 text-left sticky left-0 bg-gray-50 min-w-[200px]">Poste</th>
                {MONTH_ORDER.map(m => <th key={m} className="px-2 py-2 text-right min-w-[80px]">{SHORT[m]}</th>)}
                <th className="px-3 py-2 text-right font-bold min-w-[100px]">Total</th>
              </tr>
            </thead>
            <tbody>
              {renderGroup('revenue', 'RECETTES', 'bg-green-100 text-green-900')}
              {renderGroup('expense', 'DÉPENSES', 'bg-red-100 text-red-900')}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
