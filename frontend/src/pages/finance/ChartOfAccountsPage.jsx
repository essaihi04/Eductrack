import { useState, useEffect } from 'react';
import { ListTree, Plus, Trash2, RefreshCw, RotateCcw, Lock } from 'lucide-react';
import { financeApi } from '../../lib/financeApi';

const STREAMS = [
  { v: '', l: '—' },
  { v: 'tuition', l: 'Scolarité' },
  { v: 'transport', l: 'Transport' },
  { v: 'fi', l: 'Frais inscription' },
  { v: 'fr', l: 'Fournitures' },
  { v: 'other', l: 'Autres' },
];
const CASH = [{ v: 'mixed', l: 'Mixte' }, { v: 'cash', l: 'Espèces' }, { v: 'bank', l: 'Banque' }];

export default function ChartOfAccountsPage() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, []);
  const load = async () => {
    setLoading(true);
    try { const d = await financeApi.getChart(); setAccounts(d.accounts || []); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const patch = async (id, body) => {
    try {
      const d = await financeApi.updateAccount(id, body);
      setAccounts(prev => prev.map(a => a.id === id ? d.account : a));
    } catch (e) { alert('Erreur: ' + e.message); load(); }
  };

  const addLine = async (kind, sectionId) => {
    const name = prompt('Nom du nouveau poste :'); if (!name) return;
    try { await financeApi.createAccount({ kind, node_type: 'line', name, parent_id: sectionId, sort_order: 900 }); load(); }
    catch (e) { alert('Erreur: ' + e.message); }
  };
  const addSection = async (kind) => {
    const name = prompt('Nom de la nouvelle section :'); if (!name) return;
    try { await financeApi.createAccount({ kind, node_type: 'section', name, sort_order: 990 }); load(); }
    catch (e) { alert('Erreur: ' + e.message); }
  };
  const remove = async (id) => {
    if (!confirm('Supprimer ce poste ?')) return;
    try { await financeApi.deleteAccount(id); load(); }
    catch (e) { alert(e.message); }
  };
  const sync = async () => {
    setSaving(true);
    try { const r = await financeApi.syncDefaultAccounts(); alert(`${r.added} poste(s) ajouté(s).`); load(); }
    catch (e) { alert('Erreur: ' + e.message); }
    finally { setSaving(false); }
  };

  const renderKind = (kind, title, color) => {
    const sections = accounts.filter(a => a.kind === kind && a.node_type === 'section');
    const lines = accounts.filter(a => a.kind === kind && a.node_type === 'line');
    const orphan = lines.filter(l => !sections.some(s => s.id === l.parent_id));
    return (
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className={`px-4 py-3 flex items-center justify-between ${color}`}>
          <h2 className="font-semibold">{title}</h2>
          <button onClick={() => addSection(kind)} className="text-xs px-2 py-1 bg-white/70 rounded hover:bg-white">+ Section</button>
        </div>
        <div className="divide-y divide-gray-100">
          {sections.map(sec => (
            <div key={sec.id}>
              <div className="flex items-center gap-2 px-4 py-2 bg-gray-50">
                <input defaultValue={sec.name} onBlur={e => e.target.value !== sec.name && patch(sec.id, { name: e.target.value })}
                  className="font-semibold text-gray-700 bg-transparent flex-1 outline-none" />
                {sec.is_system && <Lock className="w-3 h-3 text-gray-400" title="Poste système" />}
                <button onClick={() => addLine(kind, sec.id)} className="text-xs text-blue-600 hover:underline">+ ligne</button>
              </div>
              {lines.filter(l => l.parent_id === sec.id).map(line => renderLine(line, kind))}
            </div>
          ))}
          {orphan.length > 0 && (
            <div>
              <div className="px-4 py-2 bg-gray-50 font-semibold text-gray-700">Autres</div>
              {orphan.map(line => renderLine(line, kind))}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderLine = (line, kind) => (
    <div key={line.id} className={`flex items-center gap-2 px-4 py-2 pl-8 ${line.is_active ? '' : 'opacity-40'}`}>
      <input defaultValue={line.name} onBlur={e => e.target.value !== line.name && patch(line.id, { name: e.target.value })}
        className="flex-1 text-sm text-gray-800 bg-transparent outline-none border-b border-transparent focus:border-gray-300" />
      {kind === 'revenue' ? (
        <select value={line.revenue_stream || ''} onChange={e => patch(line.id, { revenue_stream: e.target.value || null })}
          className="text-xs border border-gray-200 rounded px-1 py-0.5">
          {STREAMS.map(s => <option key={s.v} value={s.v}>{s.l}</option>)}
        </select>
      ) : (
        <select value={line.cash_or_bank || 'mixed'} onChange={e => patch(line.id, { cash_or_bank: e.target.value })}
          className="text-xs border border-gray-200 rounded px-1 py-0.5">
          {CASH.map(s => <option key={s.v} value={s.v}>{s.l}</option>)}
        </select>
      )}
      <label className="flex items-center gap-1 text-xs text-gray-500">
        <input type="checkbox" checked={line.is_active} onChange={e => patch(line.id, { is_active: e.target.checked })} /> actif
      </label>
      {line.is_system
        ? <Lock className="w-3 h-3 text-gray-300" title="Poste système (non supprimable)" />
        : <button onClick={() => remove(line.id)} className="p-1 hover:bg-red-50 rounded"><Trash2 className="w-3.5 h-3.5 text-red-500" /></button>}
    </div>
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <ListTree className="w-6 h-6 text-indigo-600" /> Plan comptable
          </h1>
          <p className="text-sm text-gray-500">Postes de recettes et de dépenses — renommez, ajoutez ou désactivez selon votre école.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={sync} disabled={saving} className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
            <RotateCcw className={`w-4 h-4 ${saving ? 'animate-spin' : ''}`} /> Restaurer les défauts
          </button>
          <button onClick={load} className="p-2 border border-gray-300 rounded-lg"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button>
        </div>
      </div>
      {loading ? <p className="text-gray-400">Chargement…</p> : (
        <div className="grid lg:grid-cols-2 gap-6">
          {renderKind('revenue', 'Recettes', 'bg-green-50 text-green-800')}
          {renderKind('expense', 'Dépenses', 'bg-red-50 text-red-800')}
        </div>
      )}
    </div>
  );
}
