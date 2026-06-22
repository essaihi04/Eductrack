import { useState, useEffect } from 'react';
import { Wallet, Users, Plus, Trash2, Check, RotateCcw, ArrowLeft, Save } from 'lucide-react';
import { financeApi, formatMAD } from '../../lib/financeApi';
import { PageHeader, Drawer, Button, Field } from '../../components/finance/ui';
import { useYear } from '../../contexts/YearContext';
import { toDashYear } from '../../lib/schoolYear';

const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
const ORDER = [9, 10, 11, 12, 1, 2, 3, 4, 5, 6, 7, 8];
function currentAcademicYear() {
  const d = new Date(); const y = d.getFullYear();
  return d.getMonth() + 1 >= 9 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}
function yearOptions() {
  const cur = currentAcademicYear(); const y1 = parseInt(cur.split('-')[0], 10);
  return [`${y1 - 1}-${y1}`, cur, `${y1 + 1}-${y1 + 2}`];
}
const calYearFor = (acad, month) => { const [a, b] = acad.split('-').map(Number); return month >= 9 ? a : b; };

export default function PayrollPage() {
  const [tab, setTab] = useState('payroll');
  return (
    <div className="p-6 space-y-5">
      <PageHeader icon={Wallet} title="Paie" color="purple"
        subtitle="Salaires, CNSS + AMO et IR — alimentent la Masse salariale du Prévisionnel/Réel." />
      <div className="flex gap-2 border-b border-gray-200">
        {[['payroll', 'Bulletins de paie'], ['employees', 'Employés']].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 ${tab === k ? 'border-purple-600 text-purple-600' : 'border-transparent text-gray-500'}`}>{l}</button>
        ))}
      </div>
      {tab === 'employees' ? <EmployeesTab /> : <PayrollTab />}
    </div>
  );
}

// ── Employés ───────────────────────────────────────────────────────────────
function EmployeesTab() {
  const [list, setList] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [edit, setEdit] = useState(null);
  const blank = { full_name: '', role_label: '', employment_type: 'permanent', base_salary: 0, cnss_number: '', is_active: true };
  const [form, setForm] = useState(blank);

  useEffect(() => { load(); }, []);
  const load = async () => { try { const d = await financeApi.listEmployees(); setList(d.employees || []); } catch (e) { console.error(e); } };

  const openNew = () => { setEdit(null); setForm(blank); setShowForm(true); };
  const openEdit = (e) => { setEdit(e); setForm({ ...e }); setShowForm(true); };
  const save = async () => {
    try {
      if (edit) await financeApi.updateEmployee(edit.id, form);
      else await financeApi.createEmployee(form);
      setShowForm(false); load();
    } catch (e) { alert('Erreur: ' + e.message); }
  };
  const remove = async (id) => { if (!confirm('Supprimer cet employé ?')) return; try { await financeApi.deleteEmployee(id); load(); } catch (e) { alert(e.message); } };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-gray-500 flex items-center gap-1"><Users className="w-4 h-4" /> {list.length} employé(s)</p>
        <Button color="purple" icon={Plus} onClick={openNew}>Nouvel employé</Button>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-xs uppercase">
            <tr><th className="px-4 py-3 text-left">Nom</th><th className="px-4 py-3 text-left">Fonction</th><th className="px-4 py-3 text-left">Type</th><th className="px-4 py-3 text-right">Salaire de base</th><th className="px-4 py-3 text-center">Actif</th><th></th></tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {list.length === 0 && <tr><td colSpan="6" className="px-4 py-8 text-center text-gray-400">Aucun employé</td></tr>}
            {list.map(e => (
              <tr key={e.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => openEdit(e)}>
                <td className="px-4 py-3 font-medium text-gray-800">{e.full_name}</td>
                <td className="px-4 py-3 text-gray-600">{e.role_label || '—'}</td>
                <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full ${e.employment_type === 'permanent' ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'}`}>{e.employment_type === 'permanent' ? 'Permanent' : 'Vacataire'}</span></td>
                <td className="px-4 py-3 text-right text-gray-700">{formatMAD(e.base_salary)}</td>
                <td className="px-4 py-3 text-center">{e.is_active ? '✓' : '—'}</td>
                <td className="px-4 py-3"><button onClick={(ev) => { ev.stopPropagation(); remove(e.id); }} className="p-1.5 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4 text-red-500" /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Drawer open={showForm} onClose={() => setShowForm(false)} title={`${edit ? 'Modifier' : 'Nouvel'} employé`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowForm(false)}>Annuler</Button>
            <Button color="purple" onClick={save} disabled={!form.full_name}>Enregistrer</Button>
          </>
        }>
        <Field label="Nom complet" required>
          <input value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Fonction">
            <input value={form.role_label || ''} onChange={e => setForm({ ...form, role_label: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
          </Field>
          <Field label="Type">
            <select value={form.employment_type} onChange={e => setForm({ ...form, employment_type: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg">
              <option value="permanent">Permanent</option><option value="vacataire">Vacataire</option>
            </select>
          </Field>
          <Field label="Salaire de base">
            <input type="number" step="0.01" value={form.base_salary} onChange={e => setForm({ ...form, base_salary: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
          </Field>
          <Field label="N° CNSS">
            <input value={form.cnss_number || ''} onChange={e => setForm({ ...form, cnss_number: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-600"><input type="checkbox" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} /> Actif</label>
      </Drawer>
    </div>
  );
}

// ── Bulletins de paie ────────────────────────────────────────────────────
function PayrollTab() {
  const { year: activeYear } = useYear();
  const [year, setYear] = useState(toDashYear(activeYear) || currentAcademicYear());
  const [runs, setRuns] = useState([]);
  const [newMonth, setNewMonth] = useState(ORDER[0]);
  const [run, setRun] = useState(null);
  const [lines, setLines] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadRuns(); }, [year]);
  const loadRuns = async () => { try { const d = await financeApi.listPayrollRuns(year); setRuns(d.runs || []); } catch (e) { console.error(e); } };

  const openRun = async (id) => { try { const d = await financeApi.getPayrollRun(id); setRun(d.run); setLines(d.lines || []); } catch (e) { alert(e.message); } };
  const createRun = async () => {
    try { const d = await financeApi.createPayrollRun(calYearFor(year, newMonth), newMonth); setRun(d.run); setLines(d.lines || []); loadRuns(); }
    catch (e) { alert('Erreur: ' + e.message); }
  };

  const setLine = (id, field, val) => setLines(prev => prev.map(l => l.id === id ? { ...l, [field]: val } : l));
  const totals = lines.reduce((a, l) => ({ s: a.s + Number(l.salary || 0), c: a.c + Number(l.cnss_amo || 0), i: a.i + Number(l.ir || 0) }), { s: 0, c: 0, i: 0 });

  const saveLines = async () => {
    setSaving(true);
    try { await financeApi.savePayrollLines(run.id, lines); await openRun(run.id); loadRuns(); }
    catch (e) { alert('Erreur: ' + e.message); }
    finally { setSaving(false); }
  };
  const post = async () => { try { await financeApi.postPayrollRun(run.id); await openRun(run.id); loadRuns(); alert('Bulletin comptabilisé.'); } catch (e) { alert(e.message); } };
  const unpost = async () => { try { await financeApi.unpostPayrollRun(run.id); await openRun(run.id); loadRuns(); } catch (e) { alert(e.message); } };
  const removeRun = async (id) => { if (!confirm('Supprimer ce bulletin ?')) return; try { await financeApi.deletePayrollRun(id); if (run?.id === id) setRun(null); loadRuns(); } catch (e) { alert(e.message); } };

  if (run) {
    const posted = run.status === 'posted';
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <button onClick={() => { setRun(null); loadRuns(); }} className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"><ArrowLeft className="w-4 h-4" /> Retour</button>
          <div className="flex items-center gap-2">
            <span className={`text-xs px-2 py-1 rounded-full ${posted ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{posted ? 'Comptabilisé' : 'Brouillon'}</span>
            {!posted && <button onClick={saveLines} disabled={saving} className="flex items-center gap-1 px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"><Save className="w-4 h-4" /> Enregistrer</button>}
            {posted
              ? <button onClick={unpost} className="flex items-center gap-1 px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"><RotateCcw className="w-4 h-4" /> Dé-comptabiliser</button>
              : <button onClick={post} className="flex items-center gap-1 px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700"><Check className="w-4 h-4" /> Comptabiliser</button>}
          </div>
        </div>
        <h2 className="text-lg font-semibold text-gray-800">Bulletin — {MONTHS[run.month - 1]} {run.year}</h2>

        <div className="bg-white rounded-xl border border-gray-200 overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-xs uppercase">
              <tr><th className="px-4 py-2 text-left">Employé</th><th className="px-4 py-2 text-right">Salaire</th><th className="px-4 py-2 text-right">CNSS + AMO</th><th className="px-4 py-2 text-right">IR</th><th className="px-4 py-2 text-right">Total</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {lines.length === 0 && <tr><td colSpan="5" className="px-4 py-8 text-center text-gray-400">Aucun employé actif. Ajoutez des employés dans l'onglet « Employés ».</td></tr>}
              {lines.map(l => (
                <tr key={l.id}>
                  <td className="px-4 py-2 text-gray-800">{l.employee_name}</td>
                  {['salary', 'cnss_amo', 'ir'].map(f => (
                    <td key={f} className="px-2 py-1 text-right">
                      {posted ? formatMAD(l[f]) : <input type="number" step="0.01" value={l[f] ?? 0} onChange={e => setLine(l.id, f, e.target.value)} className="w-28 px-2 py-1 text-right border border-gray-200 rounded focus:border-indigo-400" />}
                    </td>
                  ))}
                  <td className="px-4 py-2 text-right font-semibold text-gray-700">{formatMAD(Number(l.salary || 0) + Number(l.cnss_amo || 0) + Number(l.ir || 0))}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50 font-semibold text-gray-800">
              <tr><td className="px-4 py-2">Totaux</td><td className="px-4 py-2 text-right">{formatMAD(totals.s)}</td><td className="px-4 py-2 text-right">{formatMAD(totals.c)}</td><td className="px-4 py-2 text-right">{formatMAD(totals.i)}</td><td className="px-4 py-2 text-right">{formatMAD(totals.s + totals.c + totals.i)}</td></tr>
            </tfoot>
          </table>
        </div>
        <p className="text-xs text-gray-400">La comptabilisation crée 3 écritures (Salaires, CNSS + AMO, IR) sur la Masse salariale du tableau Prévisionnel/Réel.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <select value={year} onChange={e => setYear(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg">
          {yearOptions().map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <div className="flex items-center gap-2">
          <select value={newMonth} onChange={e => setNewMonth(Number(e.target.value))} className="px-3 py-2 border border-gray-300 rounded-lg">
            {ORDER.map(m => <option key={m} value={m}>{MONTHS[m - 1]} {calYearFor(year, m)}</option>)}
          </select>
          <button onClick={createRun} className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"><Plus className="w-4 h-4" /> Bulletin du mois</button>
        </div>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-xs uppercase">
            <tr><th className="px-4 py-3 text-left">Mois</th><th className="px-4 py-3 text-center">Statut</th><th className="px-4 py-3 text-right">Salaires</th><th className="px-4 py-3 text-right">CNSS+AMO</th><th className="px-4 py-3 text-right">IR</th><th className="px-4 py-3 text-right">Total</th><th></th></tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {runs.length === 0 && <tr><td colSpan="7" className="px-4 py-8 text-center text-gray-400">Aucun bulletin pour cette année</td></tr>}
            {runs.map(r => (
              <tr key={r.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => openRun(r.id)}>
                <td className="px-4 py-3 font-medium text-gray-800">{MONTHS[r.month - 1]} {r.year}</td>
                <td className="px-4 py-3 text-center"><span className={`text-xs px-2 py-0.5 rounded-full ${r.status === 'posted' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{r.status === 'posted' ? 'Comptabilisé' : 'Brouillon'}</span></td>
                <td className="px-4 py-3 text-right text-gray-700">{formatMAD(r.total_salary)}</td>
                <td className="px-4 py-3 text-right text-gray-700">{formatMAD(r.total_cnss_amo)}</td>
                <td className="px-4 py-3 text-right text-gray-700">{formatMAD(r.total_ir)}</td>
                <td className="px-4 py-3 text-right font-semibold text-gray-800">{formatMAD(r.total)}</td>
                <td className="px-4 py-3"><button onClick={(ev) => { ev.stopPropagation(); removeRun(r.id); }} className="p-1.5 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4 text-red-500" /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
