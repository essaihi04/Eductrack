import { useState, useEffect, useMemo } from 'react';
import {
  Wallet, Users, History, Search, Plus, X, CheckCircle2,
  Printer, Ban, CreditCard, Pencil, Save, ChevronDown, ChevronRight, ArrowLeft,
} from 'lucide-react';
import { financeApi, formatMAD, METHOD_LABELS, CATEGORY_LABELS } from '../../lib/financeApi';
import { Button } from '../../components/finance/ui';
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

// Couleur de l'en-tête d'un mois selon son statut de paiement.
const MONTH_HEAD = {
  paid: 'bg-green-100 text-green-800 border-green-300',
  partial: 'bg-orange-100 text-orange-800 border-orange-300',
  overdue: 'bg-red-200 text-red-900 border-red-400', // retard : rouge plus foncé
  unpaid: 'bg-red-50 text-red-700 border-red-200',
};

// Libellé lisible d'un service (Scolarité, Transport…) à partir d'une ligne.
const serviceLabel = (svc) => svc?.label || (svc?.category ? (CATEGORY_LABELS[svc.category] || svc.category) : 'Mensualité');

export default function StudentFinanceWorkspace({ student, allStudents = [], academicYear, onClose, onChanged, onOpenPlan }) {
  const [tab, setTab] = useState('collect');

  return (
    <div className="space-y-4">
      {/* En-tête plein écran avec retour */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          {onClose && (
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg" title="Retour à la liste">
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <div>
            <h1 className="text-xl font-bold text-gray-900">Finance — {fullName(student)}</h1>
            <p className="text-sm text-gray-500 flex items-center gap-2">
              <CreditCard className="w-4 h-4" /> {student.classes?.name || '—'} · {academicYear}
            </p>
          </div>
        </div>
        {onOpenPlan && (
          <Button variant="secondary" onClick={onOpenPlan}>Plan de frais</Button>
        )}
      </div>

      {/* Onglets */}
      <div className="flex gap-1 border-b border-gray-200">
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
    </div>
  );
}

// ── Grille mois × service réutilisable ───────────────────────────────────────
// sel : { 'month:category' -> { checked, amount } }. Les services déjà payés
// (remaining<=0) sont verrouillés et marqués payés.
function MonthsServicesGrid({ months, sel, onToggle, onAmount, compact = false, onCancelService, onAddService }) {
  const amtCls = compact ? 'w-16 px-1.5 py-1 text-xs' : 'w-28 px-2 py-1 text-sm';
  // Ajout d'un service : mois en cours d'ajout + catégorie + montant.
  const [addMonth, setAddMonth] = useState(null);
  const [addCat, setAddCat] = useState('');
  const [addAmount, setAddAmount] = useState('');
  const [adding, setAdding] = useState(false);

  const openAdd = (month, presentCats) => {
    const firstFree = Object.keys(CATEGORY_LABELS).find(c => !presentCats.has(c)) || '';
    setAddMonth(month); setAddCat(firstFree); setAddAmount('');
  };
  const submitAdd = async (month) => {
    if (!addCat) return;
    setAdding(true);
    try { await onAddService(month, addCat, addAmount); setAddMonth(null); }
    finally { setAdding(false); }
  };

  return (
    <div className="space-y-2.5">
      {(months || []).map(m => {
        const head = MONTH_HEAD[m.status] || MONTH_HEAD.unpaid;
        const presentCats = new Set(m.services.map(s => s.category).filter(Boolean));
        const freeCats = Object.entries(CATEGORY_LABELS).filter(([c]) => !presentCats.has(c));
        return (
          <div key={m.month} className="border border-gray-200 rounded-lg overflow-hidden">
            <div className={`flex items-center justify-between px-3 py-1.5 text-sm border-b ${head}`}>
              <span className="font-semibold">{m.label}</span>
              <span className="text-xs">
                {m.remaining > 0 ? `Reste ${formatMAD(m.remaining)}` : 'Payé ✓'}
              </span>
            </div>
            <div className="divide-y divide-gray-100">
              {m.services.map(svc => {
                const k = keyOf(m.month, svc.category);
                const payable = svc.remaining > 0;
                const checked = !!sel[k]?.checked;
                const hasPaid = Number(svc.paid) > 0;
                return (
                  <div key={k} className={`flex items-center gap-2 px-2.5 py-1.5 text-sm ${checked ? 'bg-green-50' : ''}`}>
                    {payable ? (
                      <input type="checkbox" checked={checked} onChange={() => onToggle(m.month, svc)} className="w-4 h-4 accent-green-600 flex-shrink-0" />
                    ) : (
                      // Déjà payé : case cochée verrouillée (impossible à décocher)
                      <input type="checkbox" checked readOnly disabled className="w-4 h-4 accent-green-600 flex-shrink-0" title="Payé" />
                    )}
                    <span className="flex-1 min-w-0 truncate text-gray-800">
                      {serviceLabel(svc)}
                      {svc.extra && <span className="ml-1 text-[10px] px-1 py-0.5 rounded bg-purple-50 text-purple-600 align-middle">ajouté</span>}
                    </span>
                    {!compact && <span className="text-xs text-gray-400">{formatMAD(svc.total)}</span>}
                    {payable ? (
                      checked ? (
                        <input type="number" step="0.01" min="0" max={svc.remaining} value={sel[k].amount}
                          onChange={e => onAmount(m.month, svc.category, e.target.value)}
                          className={`${amtCls} border border-gray-300 rounded text-right flex-shrink-0`} />
                      ) : (
                        <span className={`${compact ? 'w-16 text-xs' : 'w-28'} text-right font-medium text-orange-600 flex-shrink-0`}>{formatMAD(svc.remaining)}</span>
                      )
                    ) : (
                      <span className={`${compact ? 'w-16' : 'w-28'} text-right text-xs text-green-600 flex-shrink-0`}>Payé</span>
                    )}
                    {/* Annuler le paiement de ce service (admin) */}
                    {onCancelService && hasPaid && (
                      <button onClick={() => onCancelService(m.month, svc)} title="Annuler le paiement de ce service"
                        className="p-1 hover:bg-red-100 rounded flex-shrink-0"><Ban className="w-3.5 h-3.5 text-red-500" /></button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Ajouter un service à ce mois */}
            {onAddService && (
              addMonth === m.month ? (
                <div className="flex items-center gap-2 px-2.5 py-2 bg-purple-50/40 border-t border-gray-100">
                  <select value={addCat} onChange={e => setAddCat(e.target.value)} className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm">
                    {freeCats.length === 0 && <option value="">Tous les services sont déjà présents</option>}
                    {freeCats.map(([c, v]) => <option key={c} value={c}>{v}</option>)}
                  </select>
                  <input type="number" step="0.01" min="0" value={addAmount} onChange={e => setAddAmount(e.target.value)}
                    placeholder="Montant (auto si plan)" className="w-36 px-2 py-1.5 border border-gray-300 rounded text-sm" />
                  <button onClick={() => submitAdd(m.month)} disabled={adding || !addCat}
                    className="px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50">
                    {adding ? '...' : 'Ajouter'}
                  </button>
                  <button onClick={() => setAddMonth(null)} className="p-1.5 hover:bg-gray-200 rounded"><X className="w-4 h-4 text-gray-500" /></button>
                </div>
              ) : (
                <button onClick={() => openAdd(m.month, presentCats)}
                  className="w-full flex items-center justify-center gap-1 px-2.5 py-1.5 text-xs text-purple-700 hover:bg-purple-50 border-t border-gray-100">
                  <Plus className="w-3.5 h-3.5" /> Ajouter un service
                </button>
              )
            )}
          </div>
        );
      })}
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
    return `${mo?.label || item.month} — ${serviceLabel(svc)}`;
  };
  const listItems = checkedItems.map(s => ({ label: labelFor(s), amount: s.amount }));

  // Annule le paiement d'un service (mois×service) — le service redevient dû.
  const cancelService = async (month, svc) => {
    if (!svc.invoice_id) return;
    const reason = prompt(`Annuler le paiement de « ${serviceLabel(svc)} » ? Motif :`);
    if (reason === null) return;
    try {
      await financeApi.cancelServicePayment(student.id, { invoice_id: svc.invoice_id, reason });
      await load();
      onChanged?.();
    } catch (e) { alert('Erreur: ' + e.message); }
  };

  // Ajoute (facture) un service à un mois — montant auto (plan) ou manuel.
  const addServiceToMonth = async (month, category, amount) => {
    try {
      await financeApi.addService(student.id, {
        academic_year: academicYear, month, category,
        amount: amount !== '' ? Number(amount) : undefined,
      });
      await load();
      onChanged?.();
    } catch (e) { alert('Erreur: ' + e.message); throw e; }
  };

  const submit = async () => {
    if (checkedItems.length === 0) return;
    if (!confirm(`Encaisser ${checkedItems.length} ligne(s) — total ${formatMAD(allocated)} ?`)) return;
    setSaving(true);
    try {
      const items = checkedItems.map(s => ({ month: s.month, category: s.category || null, amount: Number(s.amount) || undefined }));
      const res = await financeApi.payServices(student.id, {
        academic_year: academicYear, items, payment_date: paymentDate, method, reference: reference || undefined,
        batch_id: crypto.randomUUID(),
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

      <MonthsServicesGrid months={data.months} sel={sel} onToggle={toggle} onAmount={setAmount}
        onCancelService={cancelService} onAddService={addServiceToMonth} />

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
      listItems.push({ label: `${member ? fullName(member) : ''} · ${mo?.label || s.month} — ${serviceLabel(svc)}`, amount: s.amount });
    });
  });
  const grandTotal = listItems.reduce((t, i) => t + (Number(i.amount) || 0), 0);

  const runPay = async () => {
    if (listItems.length === 0) return;
    if (!confirm(`Encaisser ${listItems.length} ligne(s) pour la famille — total ${formatMAD(grandTotal)} ?`)) return;
    setPaying(true);
    try {
      let count = 0, total = 0;
      // Un seul lot pour toute la famille → 1 reçu unique couvrant tous les élèves.
      const batchId = crypto.randomUUID();
      for (const id of [...selectedIds]) {
        const items = Object.values(selById[id] || {}).filter(s => s.checked)
          .map(s => ({ month: s.month, category: s.category || null, amount: Number(s.amount) || undefined }));
        if (items.length === 0) continue;
        const res = await financeApi.payServices(id, { academic_year: academicYear, items, payment_date: paymentDate, method, reference: reference || undefined, batch_id: batchId });
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

      {/* Par enfant : en colonnes si plusieurs (nom en haut, mois & services en bas) */}
      {(() => {
        const selArr = [...selectedIds];
        const multi = selArr.length > 1;
        return (
          <div className={multi ? 'flex gap-3 overflow-x-auto pb-2' : 'space-y-3'}>
            {selArr.map(id => {
              const member = members.find(m => m.id === id);
              const data = statusById[id];
              return (
                <div key={id} className={multi ? 'w-[300px] flex-shrink-0' : ''}>
                  <ChildSection member={member} data={data} loading={loadingIds.has(id)} column={multi}
                    sel={selById[id] || {}}
                    onToggle={(month, svc) => toggleSvc(id, month, svc)}
                    onAmount={(month, cat, val) => setSvcAmount(id, month, cat, val)} />
                </div>
              );
            })}
          </div>
        );
      })()}

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

// Bloc d'un enfant avec sa grille mois × service.
// column=true : carte verticale (nom + infos en haut, mois en bas) pour la vue multi-colonnes.
function ChildSection({ member, data, loading, sel, onToggle, onAmount, column = false }) {
  const [open, setOpen] = useState(true);
  if (!member) return null;
  const summary = data?.summary;
  const summaryLine = summary && (
    <span className={`text-xs ${summary.remaining_total > 0 ? 'text-orange-600' : 'text-green-600'}`}>
      {summary.paid_months}/{summary.total_months} mois · {summary.remaining_total > 0 ? `reste ${formatMAD(summary.remaining_total)}` : 'à jour'}
    </span>
  );
  const body = loading ? <p className="text-xs text-gray-400 py-3 text-center">Chargement...</p>
    : !data?.plan_exists ? <p className="text-xs text-amber-600 py-2">Aucun plan de frais pour cette année.</p>
    : <MonthsServicesGrid months={data.months} sel={sel} onToggle={onToggle} onAmount={onAmount} compact={column} />;

  if (column) {
    return (
      <div className="border border-gray-200 rounded-lg h-full flex flex-col">
        <div className="flex flex-col items-center text-center gap-1 p-3 border-b border-gray-100 bg-gray-50 rounded-t-lg">
          <Avatar name={fullName(member)} size="md" gender={member.gender || ''} />
          <div className="font-medium text-sm truncate w-full">{fullName(member)}</div>
          <div className="text-xs text-gray-500">{member.classes?.name || '—'}</div>
          {summaryLine}
        </div>
        <div className="p-2 flex-1">{body}</div>
      </div>
    );
  }

  return (
    <div className="border border-gray-200 rounded-lg">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center gap-2 px-3 py-2 text-left">
        {open ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
        <span className="font-medium text-sm flex-1">{fullName(member)}</span>
        {summaryLine}
      </button>
      {open && <div className="px-3 pb-3">{body}</div>}
    </div>
  );
}


// ── Onglet Historique : groupé par ENCAISSEMENT (1 opération = tous ses services) ──
// Les paiements créés dans la même opération (un par service) partagent la même
// date, le même mode, la même référence, le même caissier et la même minute de
// création : on les regroupe pour afficher « la facture avec tous ses services ».
function HistoryTab({ student, academicYear, onChanged }) {
  const [payments, setPayments] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedKey, setExpandedKey] = useState(null);
  const [editKey, setEditKey] = useState(null);
  const [editShared, setEditShared] = useState({});
  const [editAmounts, setEditAmounts] = useState({});
  const [savingEdit, setSavingEdit] = useState(false);
  const [batchDetails, setBatchDetails] = useState({}); // batchId -> { students, total, ... }

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

  // Regroupement par opération d'encaissement : par batch_id si présent
  // (lie aussi les frères/sœurs), sinon par signature (date|mode|réf|caissier|minute).
  const groups = useMemo(() => {
    const map = new Map();
    for (const p of payments) {
      const minute = (p.created_at || '').slice(0, 16);
      const key = p.batch_id ? `batch:${p.batch_id}` : `${p.payment_date}|${p.method}|${p.reference || ''}|${p.recorded_by || ''}|${minute}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(p);
    }
    return [...map.entries()].map(([key, lines]) => {
      const confirmed = lines.filter(l => l.status !== 'cancelled');
      return {
        key, lines,
        batchId: lines[0].batch_id || null,
        date: lines[0].payment_date,
        method: lines[0].method,
        reference: lines[0].reference,
        cashier: lines[0].cashier,
        created_at: lines[0].created_at,
        total: confirmed.reduce((s, l) => s + Number(l.amount || 0), 0),
        allCancelled: confirmed.length === 0,
        cancelledCount: lines.length - confirmed.length,
      };
    }).sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  }, [payments]);

  // Précharge le détail des lots (pour afficher « Famille (N élèves) » dans la liste).
  useEffect(() => {
    const ids = [...new Set(groups.map(g => g.batchId).filter(Boolean))].filter(id => !batchDetails[id]);
    if (ids.length === 0) return;
    (async () => {
      for (const id of ids) {
        try { const res = await financeApi.getPaymentBatch(id); setBatchDetails(prev => ({ ...prev, [id]: res.batch })); }
        catch (e) { console.error(e); }
      }
    })();
    /* eslint-disable-next-line */
  }, [groups]);

  // Au dépliage d'un lot, on récupère le détail complet (tous les élèves du lot).
  const toggleExpand = async (g) => {
    const willOpen = expandedKey !== g.key;
    setExpandedKey(willOpen ? g.key : null);
    if (willOpen && g.batchId && !batchDetails[g.batchId]) {
      try {
        const res = await financeApi.getPaymentBatch(g.batchId);
        setBatchDetails(prev => ({ ...prev, [g.batchId]: res.batch }));
      } catch (e) { console.error(e); }
    }
  };

  const svcLabel = (p) => p.invoice?.service_category ? (CATEGORY_LABELS[p.invoice.service_category] || p.invoice.service_category) : 'Mensualité';

  const cancelGroup = async (g) => {
    const reason = prompt(`Annuler cet encaissement (${g.lines.length} service(s)) ? Motif :`);
    if (reason === null) return;
    try {
      for (const l of g.lines) if (l.status !== 'cancelled') await financeApi.cancelPayment(l.id, reason);
      await load(); onChanged?.();
    } catch (e) { alert('Erreur: ' + e.message); }
  };
  const printGroup = async (g) => {
    try {
      // Lot → 1 reçu unique (tous les élèves + services) ; sinon facture(s) du lot.
      if (g.batchId) { await financeApi.openBatchReceiptPdf(g.batchId); return; }
      const ids = [...new Set(g.lines.map(l => l.invoice?.id).filter(Boolean))];
      for (const id of ids) await financeApi.openInvoicePdf(id);
    } catch (e) { alert('Erreur impression: ' + e.message); }
  };
  const cancelLine = async (p) => {
    const reason = prompt('Motif de l\'annulation de ce service ?');
    if (reason === null) return;
    try { await financeApi.cancelPayment(p.id, reason); await load(); onChanged?.(); }
    catch (e) { alert('Erreur: ' + e.message); }
  };

  const startEdit = (g) => {
    setEditKey(g.key);
    setExpandedKey(g.key);
    setEditShared({ payment_date: (g.date || '').slice(0, 10), method: g.method, reference: g.reference || '' });
    const amts = {}; g.lines.forEach(l => { if (l.status !== 'cancelled') amts[l.id] = String(l.amount); });
    setEditAmounts(amts);
  };
  const saveEdit = async (g) => {
    setSavingEdit(true);
    try {
      for (const l of g.lines) {
        if (l.status === 'cancelled') continue;
        await financeApi.updatePayment(l.id, {
          amount: Number(editAmounts[l.id]),
          method: editShared.method,
          payment_date: editShared.payment_date,
          reference: editShared.reference,
        });
      }
      setEditKey(null);
      await load(); onChanged?.();
    } catch (e) { alert('Erreur: ' + e.message); }
    finally { setSavingEdit(false); }
  };

  const printInvoice = async (inv) => {
    try { await financeApi.openInvoicePdf(inv.id); }
    catch (e) { alert('Erreur impression: ' + e.message); }
  };
  const cancelInvoice = async (inv) => {
    const reason = prompt('Motif de l\'annulation de la facture ?');
    if (reason === null) return;
    try { await financeApi.cancelInvoice(inv.id, reason); await load(); onChanged?.(); }
    catch (e) { alert('Erreur: ' + e.message); }
  };

  if (loading) return <p className="text-gray-500 py-8 text-center">Chargement...</p>;

  return (
    <div className="space-y-5">
      {/* Encaissements (groupés) */}
      <div>
        <h4 className="text-sm font-semibold text-gray-800 mb-2">Encaissements ({groups.length})</h4>
        {groups.length === 0 ? <p className="text-sm text-gray-400">Aucun encaissement</p> : (
          <div className="space-y-1.5">
            {groups.map(g => {
              const expanded = expandedKey === g.key;
              const editing = editKey === g.key;
              const detail = g.batchId ? batchDetails[g.batchId] : null;
              const nbStudents = detail?.students?.length || 1;
              const multi = nbStudents > 1; // encaissement famille (plusieurs élèves)
              return (
                <div key={g.key} className={`border rounded-lg text-sm ${g.allCancelled ? 'border-gray-200 bg-gray-50 opacity-80' : 'border-gray-200'}`}>
                  <div className="flex items-center gap-2 p-2">
                    <button onClick={() => toggleExpand(g)} className="p-0.5">
                      {expanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className={`font-medium ${g.allCancelled ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                        {formatMAD(g.total)} <span className="text-xs font-normal text-gray-400">· {METHOD_LABELS[g.method] || g.method}</span>
                        {multi && <span className="ml-1.5 text-xs font-medium text-purple-600">· Famille ({nbStudents} élèves)</span>}
                      </div>
                      <div className="text-xs text-gray-500 truncate">
                        {new Date(g.date).toLocaleDateString('fr-FR')} · {g.lines.length} service(s){g.reference ? ` · réf ${g.reference}` : ''}
                      </div>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_META[g.allCancelled ? 'cancelled' : 'paid'].cls}`}>
                      {g.allCancelled ? 'Annulé' : (g.cancelledCount > 0 ? `${g.cancelledCount} annulé(s)` : 'Confirmé')}
                    </span>
                    {!g.allCancelled && (
                      <>
                        {/* Édition/annulation par ligne réservées aux encaissements mono-élève */}
                        {!multi && <button onClick={() => startEdit(g)} title="Modifier l'encaissement" className="p-1 hover:bg-blue-100 rounded"><Pencil className="w-4 h-4 text-blue-600" /></button>}
                        <button onClick={() => printGroup(g)} title={g.batchId ? 'Imprimer le reçu (tous les élèves)' : 'Imprimer les factures'} className="p-1 hover:bg-blue-100 rounded"><Printer className="w-4 h-4 text-blue-600" /></button>
                        {!multi && <button onClick={() => cancelGroup(g)} title="Annuler l'encaissement" className="p-1 hover:bg-red-100 rounded"><Ban className="w-4 h-4 text-red-500" /></button>}
                      </>
                    )}
                  </div>

                  {/* Détail des services de l'encaissement */}
                  {expanded && (
                    <div className="px-3 pb-3 pt-1 border-t border-gray-100 space-y-2">
                      {multi ? (
                        <div className="space-y-3">
                          {(detail?.students || []).map((st, si) => (
                            <div key={si} className="border border-gray-100 rounded-lg">
                              <div className="px-3 py-1.5 bg-gray-50 text-sm font-medium flex items-center justify-between">
                                <span>{st.name}{st.className ? ` · ${st.className}` : ''}</span>
                                <span className="text-green-700">{formatMAD(st.total)}</span>
                              </div>
                              <div className="divide-y divide-gray-100">
                                {st.lines.map((l, li) => (
                                  <div key={li} className="flex items-center justify-between px-3 py-1.5 text-sm">
                                    <span className="text-gray-700">{l.service}{l.period ? ` — ${l.period}` : ''}</span>
                                    <span className="font-medium tabular-nums text-gray-800">{formatMAD(l.amount)}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                          <div className="text-xs text-gray-500 flex flex-wrap gap-x-4">
                            <span>Encaissé par : {g.cashier ? fullName(g.cashier) : '—'}</span>
                            {g.reference && <span>Référence : {g.reference}</span>}
                            <span className="text-purple-600">Reçu unique couvrant tous les élèves</span>
                          </div>
                        </div>
                      ) : (
                      <>
                      {editing && (
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <label className="block text-xs text-gray-500 mb-0.5">Date</label>
                            <input type="date" value={editShared.payment_date} onChange={e => setEditShared(s => ({ ...s, payment_date: e.target.value }))} className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-0.5">Mode</label>
                            <select value={editShared.method} onChange={e => setEditShared(s => ({ ...s, method: e.target.value }))} className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm">
                              {Object.entries(METHOD_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-0.5">Référence</label>
                            <input type="text" value={editShared.reference} onChange={e => setEditShared(s => ({ ...s, reference: e.target.value }))} className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" />
                          </div>
                        </div>
                      )}
                      <div className="border border-gray-100 rounded-lg divide-y divide-gray-100">
                        {g.lines.map(l => {
                          const cancelled = l.status === 'cancelled';
                          return (
                            <div key={l.id} className="flex items-center gap-2 px-2.5 py-1.5 text-sm">
                              <div className="flex-1 min-w-0">
                                <div className={`${cancelled ? 'line-through text-gray-400' : 'text-gray-800'}`}>{svcLabel(l)}</div>
                                <div className="text-xs text-gray-400 truncate">{l.invoice?.period_label || '—'} · Reçu {l.receipt_number || '—'}{l.invoice?.invoice_number ? ` · Fact. ${l.invoice.invoice_number}` : ''}</div>
                              </div>
                              {editing && !cancelled ? (
                                <input type="number" step="0.01" min="0" value={editAmounts[l.id] ?? ''} onChange={e => setEditAmounts(a => ({ ...a, [l.id]: e.target.value }))}
                                  className="w-24 px-2 py-1 border border-gray-300 rounded text-right text-sm" />
                              ) : (
                                <span className={`font-medium tabular-nums ${cancelled ? 'text-gray-400 line-through' : 'text-gray-800'}`}>{formatMAD(l.amount)}</span>
                              )}
                              {cancelled ? (
                                <span className="text-xs text-gray-400 w-16 text-right">Annulé</span>
                              ) : !editing ? (
                                <div className="flex items-center gap-1">
                                  {l.invoice?.id && <button onClick={() => printInvoice(l.invoice)} title="Imprimer cette facture" className="p-1 hover:bg-blue-100 rounded"><Printer className="w-3.5 h-3.5 text-blue-600" /></button>}
                                  <button onClick={() => cancelLine(l)} title="Annuler ce service" className="p-1 hover:bg-red-100 rounded"><Ban className="w-3.5 h-3.5 text-red-500" /></button>
                                </div>
                              ) : <span className="w-16" />}
                            </div>
                          );
                        })}
                      </div>

                      {editing ? (
                        <div className="flex justify-end gap-2">
                          <button onClick={() => setEditKey(null)} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Annuler</button>
                          <button onClick={() => saveEdit(g)} disabled={savingEdit} className="flex items-center gap-1 px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">
                            <Save className="w-3.5 h-3.5" /> {savingEdit ? 'Enregistrement...' : 'Enregistrer'}
                          </button>
                        </div>
                      ) : (
                        <div className="text-xs text-gray-500 flex flex-wrap gap-x-4">
                          <span>Encaissé par : {g.cashier ? fullName(g.cashier) : '—'}</span>
                          {g.reference && <span>Référence : {g.reference}</span>}
                        </div>
                      )}
                      </>
                      )}
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
