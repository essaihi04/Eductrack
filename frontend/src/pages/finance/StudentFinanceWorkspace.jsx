import { useState, useEffect } from 'react';
import {
  Wallet, Users, History, Search, Plus, X, CheckCircle2,
  Printer, Ban, CreditCard, Pencil, Save, ChevronDown, ChevronRight,
} from 'lucide-react';
import { financeApi, formatMAD, METHOD_LABELS, CATEGORY_LABELS } from '../../lib/financeApi';
import { Drawer, Button } from '../../components/finance/ui';
import { Avatar } from '../../components/directory/ui';

const STATUS_META = {
  paid: { label: 'Payé', cls: 'bg-green-100 text-green-700' },
  partial: { label: 'Partiel', cls: 'bg-yellow-100 text-yellow-700' },
  overdue: { label: 'En retard', cls: 'bg-red-100 text-red-700' },
  unpaid: { label: 'Impayé', cls: 'bg-orange-100 text-orange-700' },
  pending: { label: 'Non facturé', cls: 'bg-gray-100 text-gray-600' },
  issued: { label: 'Émise', cls: 'bg-blue-100 text-blue-700' },
  cancelled: { label: 'Annulée', cls: 'bg-gray-200 text-gray-500' },
};

const fullName = (s) => `${s.first_name || ''} ${s.last_name || ''}`.trim();
const keyOf = (month, category) => `${month}:${category || 'bundle'}`;

export default function StudentFinanceWorkspace({ student, allStudents = [], academicYear, onClose, onChanged, onOpenPlan }) {
  const [tab, setTab] = useState('collect');

  return (
    <Drawer open onClose={onClose} width="max-w-3xl"
      title={`Finance — ${fullName(student)}`}>
      <div className="flex items-center justify-between gap-2 -mt-1">
        <p className="text-sm text-gray-500 flex items-center gap-2">
          <CreditCard className="w-4 h-4" /> {student.classes?.name || '—'} · {academicYear}
        </p>
        {onOpenPlan && (
          <Button variant="secondary" onClick={onOpenPlan}>Plan de frais</Button>
        )}
      </div>

      {/* Onglets */}
      <div className="flex gap-1 border-b border-gray-200 mt-3 mb-4">
        {[
          { k: 'collect', label: 'Encaissement', icon: Wallet },
          { k: 'family', label: 'Famille / groupé', icon: Users },
          { k: 'history', label: 'Historique', icon: History },
        ].map(t => (
          <button key={t.k} onClick={() => setTab(t.k)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.k ? 'border-green-600 text-green-700' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'collect' && <CollectTab student={student} academicYear={academicYear} onChanged={onChanged} />}
      {tab === 'family' && <FamilyTab student={student} allStudents={allStudents} academicYear={academicYear} onChanged={onChanged} />}
      {tab === 'history' && <HistoryTab student={student} academicYear={academicYear} onChanged={onChanged} />}
    </Drawer>
  );
}

// ── Grille mois × service réutilisable ───────────────────────────────────────
// sel : { 'month:category' -> { checked, amount } }. Les services déjà payés
// (remaining<=0) sont verrouillés et marqués payés.
function MonthsServicesGrid({ months, sel, onToggle, onAmount }) {
  return (
    <div className="space-y-3">
      {(months || []).map(m => (
        <div key={m.month} className="border border-gray-200 rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 bg-gray-50 text-sm">
            <span className="font-semibold text-gray-800">{m.label}</span>
            <span className="text-xs text-gray-500">
              {m.remaining > 0 ? `Reste ${formatMAD(m.remaining)}` : <span className="text-green-600">Payé ✓</span>}
            </span>
          </div>
          <div className="divide-y divide-gray-100">
            {m.services.map(svc => {
              const k = keyOf(m.month, svc.category);
              const payable = svc.remaining > 0;
              const checked = !!sel[k]?.checked;
              return (
                <div key={k} className={`flex items-center gap-2 px-3 py-2 text-sm ${checked ? 'bg-green-50' : ''}`}>
                  {payable ? (
                    <input type="checkbox" checked={checked} onChange={() => onToggle(m.month, svc)} className="w-4 h-4 accent-green-600" />
                  ) : (
                    // Déjà payé : case cochée verrouillée (impossible à décocher)
                    <input type="checkbox" checked readOnly disabled className="w-4 h-4 accent-green-600" title="Payé" />
                  )}
                  <span className="flex-1 text-gray-800">{svc.label}</span>
                  <span className="text-xs text-gray-400">{formatMAD(svc.total)}</span>
                  {payable ? (
                    checked ? (
                      <input type="number" step="0.01" min="0" max={svc.remaining} value={sel[k].amount}
                        onChange={e => onAmount(m.month, svc.category, e.target.value)}
                        className="w-28 px-2 py-1 border border-gray-300 rounded text-right text-sm" />
                    ) : (
                      <span className="w-28 text-right font-medium text-orange-600">{formatMAD(svc.remaining)}</span>
                    )
                  ) : (
                    <span className="w-28 text-right text-xs text-green-600">Payé</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// Liste récapitulative live des lignes sélectionnées (mise à jour à chaque saisie).
function SelectionList({ items, title = 'Sélection' }) {
  const total = items.reduce((t, i) => t + (Number(i.amount) || 0), 0);
  if (items.length === 0) return null;
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <div className="px-3 py-1.5 bg-gray-50 text-xs font-semibold text-gray-600">{title} ({items.length})</div>
      <div className="divide-y divide-gray-100 max-h-48 overflow-y-auto">
        {items.map((i, idx) => (
          <div key={idx} className="flex items-center justify-between px-3 py-1.5 text-sm">
            <span className="text-gray-700 truncate">{i.label}</span>
            <span className="font-medium text-gray-800 tabular-nums">{formatMAD(i.amount)}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between px-3 py-1.5 bg-green-50 text-sm font-semibold">
        <span className="text-gray-700">Total</span>
        <span className="text-green-700">{formatMAD(total)}</span>
      </div>
    </div>
  );
}

// ── Onglet Encaissement : montant manuel réparti + mois × service ─────────────
function CollectTab({ student, academicYear, onChanged }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pool, setPool] = useState(''); // montant manuel global (optionnel)
  const [sel, setSel] = useState({});
  const [method, setMethod] = useState('cash');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [reference, setReference] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const load = async () => {
    setLoading(true);
    setSel({});
    try { setData(await financeApi.getMonthlyServicesStatus(student.id, academicYear)); }
    catch (e) { console.error(e); setData(null); }
    finally { setLoading(false); }
  };

  const checkedItems = Object.values(sel).filter(s => s.checked);
  const allocated = checkedItems.reduce((t, s) => t + (Number(s.amount) || 0), 0);
  const poolNum = Number(pool) || 0;
  const leftover = poolNum - allocated;

  // Coche un service : avec un montant manuel, on lui affecte automatiquement
  // ce qu'il reste du montant (sans dépasser son reste dû).
  const toggle = (month, svc) => {
    const k = keyOf(month, svc.category);
    setSel(prev => {
      if (prev[k]?.checked) { const cp = { ...prev }; delete cp[k]; return cp; }
      let amount = svc.remaining;
      if (poolNum > 0) {
        const already = Object.values(prev).filter(s => s.checked).reduce((t, s) => t + (Number(s.amount) || 0), 0);
        amount = Math.min(svc.remaining, Math.max(0, poolNum - already));
      }
      return { ...prev, [k]: { checked: true, amount: String(amount), month, category: svc.category } };
    });
  };
  const setAmount = (month, category, value) =>
    setSel(prev => ({ ...prev, [keyOf(month, category)]: { ...prev[keyOf(month, category)], amount: value } }));

  // Libellé d'une ligne sélectionnée (pour la liste live).
  const labelFor = (item) => {
    const mo = (data?.months || []).find(m => m.month === item.month);
    const svc = mo?.services.find(s => (s.category || 'bundle') === (item.category || 'bundle'));
    return `${mo?.label || item.month} — ${svc?.label || 'Service'}`;
  };
  const listItems = checkedItems.map(s => ({ label: labelFor(s), amount: s.amount }));

  const submit = async () => {
    if (checkedItems.length === 0) return;
    if (!confirm(`Encaisser ${checkedItems.length} ligne(s) — total ${formatMAD(allocated)} ?`)) return;
    setSaving(true);
    try {
      const items = checkedItems.map(s => ({ month: s.month, category: s.category || null, amount: Number(s.amount) || undefined }));
      const res = await financeApi.payServices(student.id, {
        academic_year: academicYear, items, payment_date: paymentDate, method, reference: reference || undefined,
      });
      alert(`${res.paid_count} encaissement(s) · ${formatMAD(res.total_paid)}`);
      setPool('');
      await load();
      onChanged?.();
    } catch (e) { alert('Erreur: ' + e.message); }
    finally { setSaving(false); }
  };

  if (loading) return <p className="text-gray-500 py-8 text-center">Chargement...</p>;
  if (!data?.plan_exists) return (
    <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-4 text-sm">
      Aucun plan de frais actif pour {academicYear}. Définissez d'abord un « Plan de frais ».
    </div>
  );

  const s = data.summary;
  return (
    <div className="space-y-4">
      {s && (
        <div className={`rounded-lg p-3 text-sm flex items-center justify-between ${s.all_paid ? 'bg-green-50 border border-green-200' : 'bg-blue-50 border border-blue-200'}`}>
          {s.all_paid ? (
            <span className="flex items-center gap-2 text-green-700 font-semibold"><CheckCircle2 className="w-4 h-4" /> Tout payé ✓</span>
          ) : (
            <span><span className="text-gray-600">Reste à payer : </span><span className="font-bold text-orange-600">{formatMAD(s.remaining_total)}</span></span>
          )}
          <span className="text-xs text-gray-500">{s.paid_months}/{s.total_months} mois payés</span>
        </div>
      )}

      {/* Montant manuel à répartir */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-2">
        <label className="block text-xs font-medium text-gray-600">Montant à encaisser (optionnel — réparti automatiquement)</label>
        <div className="flex items-center gap-2">
          <input type="number" step="0.01" min="0" value={pool} onChange={e => setPool(e.target.value)}
            placeholder="Ex : 1000" className="w-40 px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          {poolNum > 0 && (
            <span className="text-xs text-gray-600">
              Réparti : <strong>{formatMAD(allocated)}</strong> ·
              {leftover >= 0
                ? <> Reste à affecter : <strong className="text-blue-700">{formatMAD(leftover)}</strong></>
                : <strong className="text-red-600"> Dépassement de {formatMAD(-leftover)}</strong>}
            </span>
          )}
        </div>
        <p className="text-xs text-gray-400">
          Saisissez un montant puis cochez les services : il est soustrait automatiquement, ligne par ligne. Le reste
          peut être affecté à d'autres services. Vous pouvez aussi ajuster chaque montant à la main.
        </p>
      </div>

      <MonthsServicesGrid months={data.months} sel={sel} onToggle={toggle} onAmount={setAmount} />

      {/* Liste live + encaissement */}
      {checkedItems.length > 0 && (
        <div className="space-y-3">
          <SelectionList items={listItems} />
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Mode de paiement</label>
                <select value={method} onChange={e => setMethod(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                  {Object.entries(METHOD_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Date</label>
                <input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              </div>
            </div>
            <input type="text" value={reference} onChange={e => setReference(e.target.value)} placeholder="Référence (optionnel)" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">{checkedItems.length} ligne(s) · <span className="font-bold text-green-700">{formatMAD(allocated)}</span></span>
              <Button color="green" icon={Wallet} onClick={submit} disabled={saving}>
                {saving ? 'Encaissement...' : 'Encaisser'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Onglet Famille / groupé : par enfant, mois payés cochés/verrouillés ───────
function FamilyTab({ student, allStudents, academicYear, onChanged }) {
  const [members, setMembers] = useState([student]);
  const [selectedIds, setSelectedIds] = useState(new Set([student.id]));
  const [search, setSearch] = useState('');
  const [statusById, setStatusById] = useState({}); // id -> monthly-services-status
  const [selById, setSelById] = useState({}); // id -> { key -> {checked, amount, month, category} }
  const [loadingIds, setLoadingIds] = useState(new Set());
  const [method, setMethod] = useState('cash');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [reference, setReference] = useState('');
  const [paying, setPaying] = useState(false);

  // Frères/sœurs auto (parent commun)
  useEffect(() => {
    (async () => {
      try {
        const res = await financeApi.getSiblings(student.id, academicYear);
        const sibs = res.siblings || [];
        if (sibs.length) {
          setMembers(prev => { const ids = new Set(prev.map(m => m.id)); return [...prev, ...sibs.filter(s => !ids.has(s.id))]; });
          setSelectedIds(prev => { const n = new Set(prev); sibs.forEach(s => n.add(s.id)); return n; });
        }
      } catch (e) { console.error(e); }
    })();
    /* eslint-disable-next-line */
  }, [student.id]);

  // Charge le statut des enfants sélectionnés non encore chargés
  useEffect(() => {
    [...selectedIds].forEach(async (id) => {
      if (statusById[id] || loadingIds.has(id)) return;
      setLoadingIds(prev => new Set(prev).add(id));
      try {
        const d = await financeApi.getMonthlyServicesStatus(id, academicYear);
        setStatusById(prev => ({ ...prev, [id]: d }));
      } catch (e) { console.error(e); }
      finally { setLoadingIds(prev => { const n = new Set(prev); n.delete(id); return n; }); }
    });
    /* eslint-disable-next-line */
  }, [selectedIds]);

  const reloadStatus = async (id) => {
    try { const d = await financeApi.getMonthlyServicesStatus(id, academicYear); setStatusById(prev => ({ ...prev, [id]: d })); }
    catch (e) { console.error(e); }
  };

  const toggleMember = (id) => setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const memberIds = new Set(members.map(m => m.id));
  const searchResults = search.trim().length >= 2
    ? allStudents.filter(s => !memberIds.has(s.id) && fullName(s).toLowerCase().includes(search.toLowerCase())).slice(0, 6)
    : [];
  const addMember = (s) => {
    setMembers(prev => [...prev, s]);
    setSelectedIds(prev => new Set(prev).add(s.id));
    setSearch('');
  };
  const removeMember = (id) => {
    if (id === student.id) return;
    setMembers(prev => prev.filter(m => m.id !== id));
    setSelectedIds(prev => { const n = new Set(prev); n.delete(id); return n; });
  };

  const toggleSvc = (childId, month, svc) => {
    const k = keyOf(month, svc.category);
    setSelById(prev => {
      const childSel = { ...(prev[childId] || {}) };
      if (childSel[k]?.checked) delete childSel[k];
      else childSel[k] = { checked: true, amount: String(svc.remaining), month, category: svc.category };
      return { ...prev, [childId]: childSel };
    });
  };
  const setSvcAmount = (childId, month, category, value) => {
    const k = keyOf(month, category);
    setSelById(prev => ({ ...prev, [childId]: { ...(prev[childId] || {}), [k]: { ...(prev[childId]?.[k]), amount: value } } }));
  };

  // Liste live agrégée (tous enfants sélectionnés)
  const listItems = [];
  [...selectedIds].forEach(id => {
    const member = members.find(m => m.id === id);
    const data = statusById[id];
    Object.values(selById[id] || {}).filter(s => s.checked).forEach(s => {
      const mo = (data?.months || []).find(m => m.month === s.month);
      const svc = mo?.services.find(x => (x.category || 'bundle') === (s.category || 'bundle'));
      listItems.push({ label: `${member ? fullName(member) : ''} · ${mo?.label || s.month} — ${svc?.label || 'Service'}`, amount: s.amount });
    });
  });
  const grandTotal = listItems.reduce((t, i) => t + (Number(i.amount) || 0), 0);

  const runPay = async () => {
    if (listItems.length === 0) return;
    if (!confirm(`Encaisser ${listItems.length} ligne(s) pour la famille — total ${formatMAD(grandTotal)} ?`)) return;
    setPaying(true);
    try {
      let count = 0, total = 0;
      for (const id of [...selectedIds]) {
        const items = Object.values(selById[id] || {}).filter(s => s.checked)
          .map(s => ({ month: s.month, category: s.category || null, amount: Number(s.amount) || undefined }));
        if (items.length === 0) continue;
        const res = await financeApi.payServices(id, { academic_year: academicYear, items, payment_date: paymentDate, method, reference: reference || undefined });
        count += res.paid_count || 0; total += res.total_paid || 0;
        setSelById(prev => ({ ...prev, [id]: {} }));
        await reloadStatus(id);
      }
      alert(`Famille : ${count} encaissement(s) · ${formatMAD(total)}`);
      onChanged?.();
    } catch (e) { alert('Erreur: ' + e.message); }
    finally { setPaying(false); }
  };

  return (
    <div className="space-y-4">
      {/* Membres */}
      <div>
        <h4 className="text-sm font-semibold text-gray-800 mb-2">Membres concernés</h4>
        <div className="space-y-1.5">
          {members.map(m => (
            <div key={m.id} className={`flex items-center gap-2 p-2 border rounded-lg ${selectedIds.has(m.id) ? 'border-green-300 bg-green-50/50' : 'border-gray-200'}`}>
              <input type="checkbox" checked={selectedIds.has(m.id)} onChange={() => toggleMember(m.id)} className="w-4 h-4 accent-green-600" />
              <Avatar name={fullName(m)} size="sm" gender={m.gender || ''} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{fullName(m)}{m.id === student.id && <span className="text-xs text-gray-400"> (élève)</span>}</div>
                <div className="text-xs text-gray-500">{m.classes?.name || '—'}</div>
              </div>
              {statusById[m.id]?.summary && (
                <span className={`text-xs font-medium ${statusById[m.id].summary.remaining_total > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                  {statusById[m.id].summary.remaining_total > 0 ? `Reste ${formatMAD(statusById[m.id].summary.remaining_total)}` : 'À jour'}
                </span>
              )}
              {m.id !== student.id && (
                <button onClick={() => removeMember(m.id)} className="p-1 hover:bg-red-100 rounded"><X className="w-3.5 h-3.5 text-red-500" /></button>
              )}
            </div>
          ))}
        </div>
        {/* Ajouter par recherche */}
        <div className="relative mt-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Ajouter un frère/sœur (rechercher un élève)..."
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm" />
          {searchResults.length > 0 && (
            <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
              {searchResults.map(s => (
                <button key={s.id} onClick={() => addMember(s)} className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50">
                  <Avatar name={fullName(s)} size="sm" gender={s.gender || ''} />
                  <span className="flex-1 truncate">{fullName(s)}</span>
                  <span className="text-xs text-gray-400">{s.classes?.name || ''}</span>
                  <Plus className="w-4 h-4 text-green-600" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Par enfant : mois & services (payés cochés/verrouillés) */}
      {[...selectedIds].map(id => {
        const member = members.find(m => m.id === id);
        const data = statusById[id];
        return (
          <ChildSection key={id} member={member} data={data} loading={loadingIds.has(id)}
            sel={selById[id] || {}}
            onToggle={(month, svc) => toggleSvc(id, month, svc)}
            onAmount={(month, cat, val) => setSvcAmount(id, month, cat, val)} />
        );
      })}

      {/* Liste live + paiement (sans bouton « Aperçu ») */}
      {listItems.length > 0 && (
        <div className="space-y-3">
          <SelectionList items={listItems} title="Détail à encaisser" />
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Mode</label>
                <select value={method} onChange={e => setMethod(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                  {Object.entries(METHOD_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Date</label>
                <input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              </div>
            </div>
            <input type="text" value={reference} onChange={e => setReference(e.target.value)} placeholder="Référence (optionnel)" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">{listItems.length} ligne(s) · <span className="font-bold text-green-700">{formatMAD(grandTotal)}</span></span>
              <Button color="green" icon={Wallet} onClick={runPay} disabled={paying}>
                {paying ? 'Encaissement...' : 'Encaisser la famille'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Bloc d'un enfant (repliable) avec sa grille mois × service.
function ChildSection({ member, data, loading, sel, onToggle, onAmount }) {
  const [open, setOpen] = useState(true);
  if (!member) return null;
  return (
    <div className="border border-gray-200 rounded-lg">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center gap-2 px-3 py-2 text-left">
        {open ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
        <span className="font-medium text-sm flex-1">{fullName(member)}</span>
        {data?.summary && (
          <span className={`text-xs ${data.summary.remaining_total > 0 ? 'text-orange-600' : 'text-green-600'}`}>
            {data.summary.paid_months}/{data.summary.total_months} mois · {data.summary.remaining_total > 0 ? `reste ${formatMAD(data.summary.remaining_total)}` : 'à jour'}
          </span>
        )}
      </button>
      {open && (
        <div className="px-3 pb-3">
          {loading ? <p className="text-sm text-gray-400 py-3 text-center">Chargement...</p>
            : !data?.plan_exists ? <p className="text-sm text-amber-600 py-2">Aucun plan de frais pour cette année.</p>
            : <MonthsServicesGrid months={data.months} sel={sel} onToggle={onToggle} onAmount={onAmount} />}
        </div>
      )}
    </div>
  );
}

// ── Onglet Historique : détails + modification ───────────────────────────────
function HistoryTab({ student, academicYear, onChanged }) {
  const [payments, setPayments] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [editId, setEditId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const load = async () => {
    setLoading(true);
    try {
      const [p, i] = await Promise.all([
        financeApi.listPayments({ student_id: student.id, academic_year: academicYear, status: 'all' }),
        financeApi.listInvoices({ student_id: student.id, academic_year: academicYear }),
      ]);
      setPayments(p.payments || []);
      setInvoices(i.invoices || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const cancelPayment = async (p) => {
    const reason = prompt('Motif de l\'annulation du paiement ?');
    if (reason === null) return;
    try { await financeApi.cancelPayment(p.id, reason); await load(); onChanged?.(); }
    catch (e) { alert('Erreur: ' + e.message); }
  };
  const cancelInvoice = async (inv) => {
    const reason = prompt('Motif de l\'annulation de la facture ?');
    if (reason === null) return;
    try { await financeApi.cancelInvoice(inv.id, reason); await load(); onChanged?.(); }
    catch (e) { alert('Erreur: ' + e.message); }
  };
  const printInvoice = async (inv) => {
    try { await financeApi.openInvoicePdf(inv.id); }
    catch (e) { alert('Erreur impression: ' + e.message); }
  };

  const startEdit = (p) => {
    setEditId(p.id);
    setEditForm({ amount: String(p.amount), method: p.method, payment_date: (p.payment_date || '').slice(0, 10), reference: p.reference || '' });
  };
  const saveEdit = async (p) => {
    setSavingEdit(true);
    try {
      await financeApi.updatePayment(p.id, {
        amount: Number(editForm.amount), method: editForm.method,
        payment_date: editForm.payment_date, reference: editForm.reference,
      });
      setEditId(null);
      await load();
      onChanged?.();
    } catch (e) { alert('Erreur: ' + e.message); }
    finally { setSavingEdit(false); }
  };

  if (loading) return <p className="text-gray-500 py-8 text-center">Chargement...</p>;

  return (
    <div className="space-y-5">
      {/* Paiements */}
      <div>
        <h4 className="text-sm font-semibold text-gray-800 mb-2">Paiements ({payments.length})</h4>
        {payments.length === 0 ? <p className="text-sm text-gray-400">Aucun paiement</p> : (
          <div className="space-y-1.5">
            {payments.map(p => {
              const cancelled = p.status === 'cancelled';
              const expanded = expandedId === p.id;
              const editing = editId === p.id;
              const svcLabel = p.invoice?.service_category ? (CATEGORY_LABELS[p.invoice.service_category] || p.invoice.service_category) : 'Mensualité';
              return (
                <div key={p.id} className={`border rounded-lg text-sm ${cancelled ? 'border-gray-200 bg-gray-50 opacity-80' : 'border-gray-200'}`}>
                  <div className="flex items-center gap-2 p-2">
                    <button onClick={() => setExpandedId(expanded ? null : p.id)} className="p-0.5">
                      {expanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className={`font-medium ${cancelled ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                        {formatMAD(p.amount)} <span className="text-xs font-normal text-gray-400">· {METHOD_LABELS[p.method] || p.method}</span>
                      </div>
                      <div className="text-xs text-gray-500 truncate">
                        {new Date(p.payment_date).toLocaleDateString('fr-FR')} · Reçu {p.receipt_number || '—'}{p.invoice?.period_label ? ` · ${p.invoice.period_label}` : ''}
                      </div>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_META[cancelled ? 'cancelled' : 'paid'].cls}`}>
                      {cancelled ? 'Annulé' : 'Confirmé'}
                    </span>
                    {!cancelled && (
                      <>
                        <button onClick={() => startEdit(p)} title="Modifier" className="p-1 hover:bg-blue-100 rounded"><Pencil className="w-4 h-4 text-blue-600" /></button>
                        <button onClick={() => cancelPayment(p)} title="Annuler" className="p-1 hover:bg-red-100 rounded"><Ban className="w-4 h-4 text-red-500" /></button>
                      </>
                    )}
                  </div>

                  {/* Détails */}
                  {expanded && !editing && (
                    <div className="px-3 pb-3 pt-1 border-t border-gray-100 text-xs text-gray-600 grid grid-cols-2 gap-x-4 gap-y-1">
                      <div><span className="text-gray-400">Service : </span>{svcLabel}</div>
                      <div><span className="text-gray-400">Période : </span>{p.invoice?.period_label || '—'}</div>
                      <div><span className="text-gray-400">Facture : </span>N° {p.invoice?.invoice_number || '—'}</div>
                      <div><span className="text-gray-400">Référence : </span>{p.reference || '—'}</div>
                      <div><span className="text-gray-400">Encaissé par : </span>{p.cashier ? fullName(p.cashier) : '—'}</div>
                      {cancelled && <div className="col-span-2 text-red-500"><span className="text-gray-400">Motif annulation : </span>{p.cancellation_reason || '—'}</div>}
                    </div>
                  )}

                  {/* Édition */}
                  {editing && (
                    <div className="px-3 pb-3 pt-2 border-t border-gray-100 space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs text-gray-500 mb-0.5">Montant</label>
                          <input type="number" step="0.01" min="0" value={editForm.amount} onChange={e => setEditForm(f => ({ ...f, amount: e.target.value }))}
                            className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-0.5">Mode</label>
                          <select value={editForm.method} onChange={e => setEditForm(f => ({ ...f, method: e.target.value }))}
                            className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm">
                            {Object.entries(METHOD_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-0.5">Date</label>
                          <input type="date" value={editForm.payment_date} onChange={e => setEditForm(f => ({ ...f, payment_date: e.target.value }))}
                            className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-0.5">Référence</label>
                          <input type="text" value={editForm.reference} onChange={e => setEditForm(f => ({ ...f, reference: e.target.value }))}
                            className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" />
                        </div>
                      </div>
                      <div className="flex justify-end gap-2">
                        <button onClick={() => setEditId(null)} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Annuler</button>
                        <button onClick={() => saveEdit(p)} disabled={savingEdit}
                          className="flex items-center gap-1 px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">
                          <Save className="w-3.5 h-3.5" /> {savingEdit ? 'Enregistrement...' : 'Enregistrer'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Factures */}
      <div>
        <h4 className="text-sm font-semibold text-gray-800 mb-2">Factures ({invoices.length})</h4>
        {invoices.length === 0 ? <p className="text-sm text-gray-400">Aucune facture</p> : (
          <div className="space-y-1.5">
            {invoices.map(inv => {
              const meta = STATUS_META[inv.status] || STATUS_META.issued;
              return (
                <div key={inv.id} className="flex items-center gap-2 p-2 border border-gray-200 rounded-lg text-sm">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-800 truncate">N° {inv.invoice_number} <span className="text-xs font-normal text-gray-400">· {inv.period_label || '—'}{inv.service_category ? ` · ${CATEGORY_LABELS[inv.service_category] || inv.service_category}` : ''}</span></div>
                    <div className="text-xs text-gray-500">{formatMAD(inv.total)} · payé {formatMAD(inv.amount_paid || 0)}</div>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${meta.cls}`}>{meta.label}</span>
                  <button onClick={() => printInvoice(inv)} title="Imprimer la facture" className="p-1 hover:bg-blue-100 rounded"><Printer className="w-4 h-4 text-blue-600" /></button>
                  {inv.status !== 'cancelled' && (
                    <button onClick={() => cancelInvoice(inv)} title="Annuler la facture" className="p-1 hover:bg-red-100 rounded"><Ban className="w-4 h-4 text-red-500" /></button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
