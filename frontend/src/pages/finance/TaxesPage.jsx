import { useState, useEffect } from 'react';
import { Scale, Plus, Trash2, Check, RotateCcw } from 'lucide-react';
import { financeApi, formatMAD, formatDate } from '../../lib/financeApi';

const TAX_TYPES = [
  { v: 'is_acompte', l: 'IS (acompte)' }, { v: 'taxe_pro', l: 'Taxe professionnelle' },
  { v: 'taxe_habitation', l: 'Taxe habitation' }, { v: 'stamp_duty', l: 'Droits de timbre' },
  { v: 'tva', l: 'TVA' }, { v: 'other', l: 'Autre' },
];
const typeLabel = (v) => TAX_TYPES.find(t => t.v === v)?.l || v;

export default function TaxesPage() {
  const [taxes, setTaxes] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const blank = { label: '', tax_type: 'is_acompte', account_id: '', period_label: '', due_date: new Date().toISOString().split('T')[0], amount: 0 };
  const [form, setForm] = useState(blank);

  useEffect(() => { load(); financeApi.getChart().then(d => setAccounts(d.accounts || [])).catch(() => {}); }, []);
  const load = async () => { try { const d = await financeApi.listTaxes(); setTaxes(d.taxes || []); } catch (e) { console.error(e); } };

  const expLines = accounts.filter(a => a.kind === 'expense' && a.node_type === 'line' && a.is_active);
  const sections = accounts.filter(a => a.kind === 'expense' && a.node_type === 'section');
  const accName = (id) => accounts.find(a => a.id === id)?.name || '—';

  const save = async () => { try { await financeApi.createTax(form); setShowForm(false); setForm(blank); load(); } catch (e) { alert('Erreur: ' + e.message); } };
  const remove = async (id) => { if (!confirm('Supprimer cette obligation ?')) return; try { await financeApi.deleteTax(id); load(); } catch (e) { alert(e.message); } };
  const pay = async (id) => { try { await financeApi.payTax(id); load(); } catch (e) { alert(e.message); } };
  const unpay = async (id) => { try { await financeApi.unpayTax(id); load(); } catch (e) { alert(e.message); } };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2"><Scale className="w-6 h-6 text-indigo-600" /> Impôts & taxes</h1>
          <p className="text-sm text-gray-500">IS, taxe professionnelle, timbre, TVA… Le paiement alimente la matrice.</p>
        </div>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"><Plus className="w-4 h-4" /> Nouvelle obligation</button>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-xs uppercase"><tr><th className="px-4 py-3 text-left">Libellé</th><th className="px-4 py-3 text-left">Type</th><th className="px-4 py-3 text-left">Période</th><th className="px-4 py-3 text-left">Échéance</th><th className="px-4 py-3 text-right">Montant</th><th className="px-4 py-3 text-center">Statut</th><th></th></tr></thead>
          <tbody className="divide-y divide-gray-100">
            {taxes.length === 0 && <tr><td colSpan="7" className="px-4 py-8 text-center text-gray-400">Aucune obligation</td></tr>}
            {taxes.map(t => (
              <tr key={t.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-800">{t.label}<div className="text-xs text-gray-400">{accName(t.account_id)}</div></td>
                <td className="px-4 py-3 text-gray-600">{typeLabel(t.tax_type)}</td>
                <td className="px-4 py-3 text-gray-600">{t.period_label || '—'}</td>
                <td className="px-4 py-3 text-gray-600">{formatDate(t.due_date)}</td>
                <td className="px-4 py-3 text-right font-semibold">{formatMAD(t.amount)}</td>
                <td className="px-4 py-3 text-center"><span className={`text-xs px-2 py-0.5 rounded-full ${t.status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{t.status === 'paid' ? 'Payée' : 'À payer'}</span></td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  {t.status === 'paid'
                    ? <button onClick={() => unpay(t.id)} className="text-xs inline-flex items-center gap-1 text-gray-500 hover:text-gray-800 mr-2"><RotateCcw className="w-3 h-3" /> Annuler</button>
                    : <button onClick={() => pay(t.id)} className="text-xs inline-flex items-center gap-1 text-green-600 hover:text-green-800 mr-2"><Check className="w-3 h-3" /> Payer</button>}
                  <button onClick={() => remove(t.id)} className="p-1.5 hover:bg-red-50 rounded inline-flex"><Trash2 className="w-4 h-4 text-red-500" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 space-y-3">
            <h2 className="text-lg font-semibold">Nouvelle obligation fiscale</h2>
            <div><label className="block text-xs font-medium text-gray-700 mb-1">Libellé *</label><input value={form.label} onChange={e => setForm({ ...form, label: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-xs font-medium text-gray-700 mb-1">Type</label><select value={form.tax_type} onChange={e => setForm({ ...form, tax_type: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg">{TAX_TYPES.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}</select></div>
              <div><label className="block text-xs font-medium text-gray-700 mb-1">Poste</label>
                <select value={form.account_id} onChange={e => setForm({ ...form, account_id: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg">
                  <option value="">— Poste —</option>
                  {sections.map(s => <optgroup key={s.id} label={s.name}>{expLines.filter(l => l.parent_id === s.id).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</optgroup>)}
                </select>
              </div>
              <div><label className="block text-xs font-medium text-gray-700 mb-1">Période</label><input value={form.period_label} onChange={e => setForm({ ...form, period_label: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" placeholder="ex. T1 2025" /></div>
              <div><label className="block text-xs font-medium text-gray-700 mb-1">Échéance</label><input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" /></div>
              <div><label className="block text-xs font-medium text-gray-700 mb-1">Montant</label><input type="number" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" /></div>
            </div>
            <div className="flex justify-end gap-2"><button onClick={() => setShowForm(false)} className="px-4 py-2 border border-gray-300 rounded-lg">Annuler</button><button onClick={save} disabled={!form.label} className="px-4 py-2 bg-indigo-600 text-white rounded-lg disabled:opacity-50">Enregistrer</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
