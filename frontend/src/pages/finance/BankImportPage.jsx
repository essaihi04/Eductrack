import { useState, useEffect, useRef } from 'react';
import { Building2, Upload, Trash2, ArrowLeft, Check, RotateCcw, Plus, Wand2 } from 'lucide-react';
import { financeApi, formatMAD, formatDate } from '../../lib/financeApi';
import { PageHeader } from '../../components/finance/ui';

function expenseGroups(accounts) {
  const sections = accounts.filter(a => a.kind === 'expense' && a.node_type === 'section');
  const lines = accounts.filter(a => a.kind === 'expense' && a.node_type === 'line' && a.is_active);
  return { sections, lines };
}
function AccountSelect({ accounts, value, onChange, className = '' }) {
  const { sections, lines } = expenseGroups(accounts);
  return (
    <select value={value || ''} onChange={e => onChange(e.target.value || null)} className={`border border-gray-200 rounded px-2 py-1 text-xs ${className}`}>
      <option value="">— Poste —</option>
      {sections.map(s => <optgroup key={s.id} label={s.name}>{lines.filter(l => l.parent_id === s.id).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</optgroup>)}
    </select>
  );
}

export default function BankImportPage() {
  const [tab, setTab] = useState('statements');
  const [accounts, setAccounts] = useState([]);
  useEffect(() => { financeApi.getChart().then(d => setAccounts(d.accounts || [])).catch(() => {}); }, []);
  return (
    <div className="p-6 space-y-5">
      <PageHeader icon={Building2} title="Relevés bancaires" color="purple"
        subtitle="Importez le relevé (PDF), affectez chaque ligne à un poste et comptabilisez. Les débits alimentent les dépenses du Prévisionnel/Réel." />
      <div className="flex gap-2 border-b border-gray-200">
        {[['statements', 'Relevés'], ['rules', 'Règles de catégorisation']].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 ${tab === k ? 'border-purple-600 text-purple-600' : 'border-transparent text-gray-500'}`}>{l}</button>
        ))}
      </div>
      {tab === 'statements' ? <StatementsTab accounts={accounts} /> : <RulesTab accounts={accounts} />}
    </div>
  );
}

function StatementsTab({ accounts }) {
  const [statements, setStatements] = useState([]);
  const [sel, setSel] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [meta, setMeta] = useState({ account_label: 'Banque', period_start: '', period_end: '' });
  const fileRef = useRef();

  useEffect(() => { load(); }, []);
  const load = async () => { try { const d = await financeApi.listStatements(); setStatements(d.statements || []); } catch (e) { console.error(e); } };
  const open = async (id) => { try { setSel(await financeApi.getStatement(id)); } catch (e) { alert(e.message); } };

  const doUpload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return alert('Choisissez d’abord un relevé PDF.');
    const fd = new FormData();
    fd.append('file', file);
    Object.entries(meta).forEach(([k, v]) => v && fd.append(k, v));
    setUploading(true);
    try {
      const d = await financeApi.uploadStatement(fd);
      if (fileRef.current) fileRef.current.value = '';
      load();
      if (!d.parsed) alert('Relevé importé mais aucune ligne détectée. Ajoutez-les manuellement ou réessayez avec un PDF plus net.');
      setSel({ statement: d.statement, transactions: d.transactions });
    }
    catch (e) { alert('Erreur: ' + e.message); }
    finally { setUploading(false); }
  };
  const removeStmt = async (id) => { if (!confirm('Supprimer ce relevé et ses écritures ?')) return; try { await financeApi.deleteStatement(id); setSel(null); load(); } catch (e) { alert(e.message); } };

  if (sel) return <StatementDetail sel={sel} accounts={accounts} reload={() => open(sel.statement.id)} back={() => { setSel(null); load(); }} onDelete={() => removeStmt(sel.statement.id)} />;

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap items-end gap-3">
        <div><label className="block text-xs font-medium text-gray-700 mb-1">Banque</label><input value={meta.account_label} onChange={e => setMeta({ ...meta, account_label: e.target.value })} className="px-3 py-2 border border-gray-300 rounded-lg" /></div>
        <div><label className="block text-xs font-medium text-gray-700 mb-1">Du</label><input type="date" value={meta.period_start} onChange={e => setMeta({ ...meta, period_start: e.target.value })} className="px-3 py-2 border border-gray-300 rounded-lg" /></div>
        <div><label className="block text-xs font-medium text-gray-700 mb-1">Au</label><input type="date" value={meta.period_end} onChange={e => setMeta({ ...meta, period_end: e.target.value })} className="px-3 py-2 border border-gray-300 rounded-lg" /></div>
        <div><label className="block text-xs font-medium text-gray-700 mb-1">Relevé PDF</label><input ref={fileRef} type="file" accept="application/pdf" className="text-sm" /></div>
        <button onClick={doUpload} disabled={uploading} className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"><Upload className="w-4 h-4" /> {uploading ? 'Import…' : 'Importer'}</button>
      </div>
      <p className="text-xs text-gray-400">Les lignes sont lues automatiquement par OCR (DeepSeek), puis classées par vos règles. Vérifiez et corrigez chaque ligne avant de comptabiliser : les débits affectés à un poste alimentent les dépenses du Prévisionnel/Réel.</p>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-xs uppercase"><tr><th className="px-4 py-3 text-left">Banque</th><th className="px-4 py-3 text-left">Période</th><th className="px-4 py-3 text-left">Fichier</th><th className="px-4 py-3 text-left">Importé le</th><th></th></tr></thead>
          <tbody className="divide-y divide-gray-100">
            {statements.length === 0 && <tr><td colSpan="5" className="px-4 py-8 text-center text-gray-400">Aucun relevé importé</td></tr>}
            {statements.map(s => (
              <tr key={s.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => open(s.id)}>
                <td className="px-4 py-3 font-medium text-gray-800">{s.account_label}</td>
                <td className="px-4 py-3 text-gray-600">{s.period_start ? `${formatDate(s.period_start)} → ${formatDate(s.period_end)}` : '—'}</td>
                <td className="px-4 py-3 text-gray-500 text-xs">{s.source_filename || '—'}</td>
                <td className="px-4 py-3 text-gray-500">{formatDate(s.created_at)}</td>
                <td className="px-4 py-3"><button onClick={(e) => { e.stopPropagation(); removeStmt(s.id); }} className="p-1.5 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4 text-red-500" /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatementDetail({ sel, accounts, reload, back, onDelete }) {
  const { statement, transactions } = sel;
  const upd = async (id, patch) => { try { await financeApi.updateBankTxn(id, patch); reload(); } catch (e) { alert(e.message); } };
  const post = async (id) => { try { await financeApi.postBankTxn(id); reload(); } catch (e) { alert(e.message); } };
  const unpost = async (id) => { try { await financeApi.unpostBankTxn(id); reload(); } catch (e) { alert(e.message); } };
  const applyRules = async () => { try { const r = await financeApi.applyBankRules(statement.id); reload(); alert(`${r.updated} ligne(s) catégorisée(s).`); } catch (e) { alert(e.message); } };
  const postAll = async () => { try { const r = await financeApi.postAllBankTxns(statement.id); reload(); alert(`${r.posted} débit(s) comptabilisé(s).`); } catch (e) { alert(e.message); } };

  const debits = transactions.filter(t => t.direction === 'debit');
  const totalDebit = debits.reduce((a, t) => a + Number(t.amount), 0);
  const nPosted = debits.filter(t => t.status === 'posted').length;
  const nCateg = debits.filter(t => t.status === 'categorized').length;
  const nTodo = debits.filter(t => t.status === 'unmatched').length;
  const postedAmount = debits.filter(t => t.status === 'posted').reduce((a, t) => a + Number(t.amount), 0);
  const pct = debits.length ? Math.round((nPosted / debits.length) * 100) : 0;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <button onClick={back} className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"><ArrowLeft className="w-4 h-4" /> Retour</button>
        <div className="flex items-center gap-2">
          <button onClick={applyRules} className="flex items-center gap-1 px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"><Wand2 className="w-4 h-4" /> Appliquer les règles</button>
          <button onClick={postAll} className="flex items-center gap-1 px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700"><Check className="w-4 h-4" /> Tout comptabiliser</button>
          <button onClick={onDelete} className="p-2 border border-red-200 text-red-600 rounded-lg hover:bg-red-50"><Trash2 className="w-4 h-4" /></button>
        </div>
      </div>
      <h2 className="text-lg font-semibold text-gray-800">{statement.account_label} · {transactions.length} ligne(s) · débits {formatMAD(totalDebit)}</h2>

      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="px-2 py-1 rounded-full bg-amber-100 text-amber-700">{nTodo} à traiter</span>
          <span className="px-2 py-1 rounded-full bg-blue-100 text-blue-700">{nCateg} catégorisé(s)</span>
          <span className="px-2 py-1 rounded-full bg-green-100 text-green-700">{nPosted} comptabilisé(s)</span>
          <span className="ml-auto text-gray-500">Dépenses comptabilisées : <strong className="text-gray-800">{formatMAD(postedAmount)}</strong> / {formatMAD(totalDebit)}</span>
        </div>
        <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full bg-green-500 transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-xs uppercase"><tr><th className="px-3 py-2 text-left">Date</th><th className="px-3 py-2 text-left">Libellé</th><th className="px-3 py-2 text-right">Montant</th><th className="px-3 py-2 text-left">Sens</th><th className="px-3 py-2 text-left">Poste</th><th className="px-3 py-2 text-center">Statut</th><th></th></tr></thead>
          <tbody className="divide-y divide-gray-100">
            {transactions.length === 0 && <tr><td colSpan="7" className="px-4 py-8 text-center text-gray-400">Aucune transaction extraite. Vérifiez le PDF ou ajoutez manuellement.</td></tr>}
            {transactions.map(t => {
              const posted = t.status === 'posted';
              return (
                <tr key={t.id} className={`hover:bg-gray-50 ${t.status === 'ignored' ? 'opacity-50' : ''}`}>
                  <td className="px-3 py-2 text-gray-600">{formatDate(t.txn_date)}</td>
                  <td className="px-3 py-2 text-gray-800 max-w-xs truncate" title={t.label}>{t.label}</td>
                  <td className="px-3 py-2 text-right font-medium">{formatMAD(t.amount)}</td>
                  <td className="px-3 py-2">
                    <select disabled={posted} value={t.direction} onChange={e => upd(t.id, { direction: e.target.value })} className="border border-gray-200 rounded px-2 py-1 text-xs">
                      <option value="debit">Débit</option><option value="credit">Crédit</option>
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    {t.direction === 'debit'
                      ? <AccountSelect accounts={accounts} value={t.account_id} onChange={v => upd(t.id, { account_id: v, status: v ? 'categorized' : 'unmatched' })} />
                      : <span className="text-xs text-gray-400">recette (encaissement)</span>}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${posted ? 'bg-green-100 text-green-700' : t.status === 'categorized' ? 'bg-blue-100 text-blue-700' : t.status === 'ignored' ? 'bg-gray-100 text-gray-500' : 'bg-amber-100 text-amber-700'}`}>
                      {posted ? 'Comptabilisé' : t.status === 'categorized' ? 'Catégorisé' : t.status === 'ignored' ? 'Ignoré' : 'À traiter'}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {t.direction === 'debit' && (posted
                      ? <button onClick={() => unpost(t.id)} className="text-xs inline-flex items-center gap-1 text-gray-500 hover:text-gray-800"><RotateCcw className="w-3 h-3" /> Annuler</button>
                      : <button onClick={() => post(t.id)} disabled={!t.account_id} className="text-xs inline-flex items-center gap-1 text-green-600 hover:text-green-800 disabled:opacity-40"><Check className="w-3 h-3" /> Comptabiliser</button>)}
                    {!posted && <button onClick={() => upd(t.id, { status: t.status === 'ignored' ? 'unmatched' : 'ignored' })} className="text-xs text-gray-400 hover:text-gray-700 ml-2">{t.status === 'ignored' ? 'Rétablir' : 'Ignorer'}</button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RulesTab({ accounts }) {
  const [rules, setRules] = useState([]);
  const [form, setForm] = useState({ pattern: '', match_type: 'contains', direction: 'debit', account_id: '', priority: 100 });
  useEffect(() => { load(); }, []);
  const load = async () => { try { const d = await financeApi.listBankRules(); setRules(d.rules || []); } catch (e) { console.error(e); } };
  const add = async () => { if (!form.pattern || !form.account_id) return alert('Mot-clé et poste requis'); try { await financeApi.createBankRule(form); setForm({ ...form, pattern: '' }); load(); } catch (e) { alert(e.message); } };
  const remove = async (id) => { try { await financeApi.deleteBankRule(id); load(); } catch (e) { alert(e.message); } };
  const accName = (id) => accounts.find(a => a.id === id)?.name || '—';

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">Quand le libellé d'une transaction contient le mot-clé, elle est affectée automatiquement au poste (ex. « CNSS » → CNSS et AMO, « GASOIL » → Gasoil).</p>
      <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap items-end gap-3">
        <div><label className="block text-xs font-medium text-gray-700 mb-1">Mot-clé contenu</label><input value={form.pattern} onChange={e => setForm({ ...form, pattern: e.target.value })} className="px-3 py-2 border border-gray-300 rounded-lg" placeholder="CNSS, GASOIL, LOYER…" /></div>
        <div><label className="block text-xs font-medium text-gray-700 mb-1">Poste</label>
          <AccountSelect accounts={accounts} value={form.account_id} onChange={v => setForm({ ...form, account_id: v })} className="!text-sm !py-2" />
        </div>
        <button onClick={add} className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"><Plus className="w-4 h-4" /> Ajouter</button>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-xs uppercase"><tr><th className="px-4 py-3 text-left">Mot-clé</th><th className="px-4 py-3 text-left">Poste</th><th className="px-4 py-3 text-left">Sens</th><th></th></tr></thead>
          <tbody className="divide-y divide-gray-100">
            {rules.length === 0 && <tr><td colSpan="4" className="px-4 py-8 text-center text-gray-400">Aucune règle</td></tr>}
            {rules.map(r => (
              <tr key={r.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-800">{r.pattern}</td>
                <td className="px-4 py-3 text-gray-600">{accName(r.account_id)}</td>
                <td className="px-4 py-3 text-gray-600">{r.direction === 'credit' ? 'Crédit' : 'Débit'}</td>
                <td className="px-4 py-3 text-right"><button onClick={() => remove(r.id)} className="p-1.5 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4 text-red-500" /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
