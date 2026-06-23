import { useState, useEffect } from 'react';
import {
  Wallet, Users, History, Search, Plus, X, CheckCircle2, AlertCircle,
  Printer, Ban, CreditCard, Layers,
} from 'lucide-react';
import { financeApi, formatMAD, METHOD_LABELS, CATEGORY_LABELS } from '../../lib/financeApi';
import { Drawer, Button } from '../../components/finance/ui';
import { Avatar, StatusPill } from '../../components/directory/ui';

const SCHOOL_MONTHS = [
  { v: 9, l: 'Sept.' }, { v: 10, l: 'Oct.' }, { v: 11, l: 'Nov.' }, { v: 12, l: 'Déc.' },
  { v: 1, l: 'Janv.' }, { v: 2, l: 'Févr.' }, { v: 3, l: 'Mars' }, { v: 4, l: 'Avril' },
  { v: 5, l: 'Mai' }, { v: 6, l: 'Juin' }, { v: 7, l: 'Juil.' }, { v: 8, l: 'Août' },
];

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

// ── Onglet Encaissement : mois × service, montant éditable par ligne ──────────
function CollectTab({ student, academicYear, onChanged }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState({}); // key -> { checked, amount }
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

  const toggle = (month, svc) => {
    const k = keyOf(month, svc.category);
    setSel(prev => {
      const cur = prev[k];
      if (cur?.checked) { const cp = { ...prev }; delete cp[k]; return cp; }
      return { ...prev, [k]: { checked: true, amount: String(svc.remaining), month, category: svc.category } };
    });
  };

  const setAmount = (month, category, value) =>
    setSel(prev => ({ ...prev, [keyOf(month, category)]: { ...prev[keyOf(month, category)], amount: value } }));

  const selectedItems = Object.values(sel).filter(s => s.checked);
  const selectedTotal = selectedItems.reduce((t, s) => t + (Number(s.amount) || 0), 0);

  const submit = async () => {
    if (selectedItems.length === 0) return;
    if (!confirm(`Encaisser ${selectedItems.length} ligne(s) — total ${formatMAD(selectedTotal)} ?`)) return;
    setSaving(true);
    try {
      const items = selectedItems.map(s => ({ month: s.month, category: s.category || null, amount: Number(s.amount) || undefined }));
      const res = await financeApi.payServices(student.id, {
        academic_year: academicYear, items, payment_date: paymentDate, method, reference: reference || undefined,
      });
      alert(`${res.paid_count} encaissement(s) · ${formatMAD(res.total_paid)}`);
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

      <p className="text-xs text-gray-500">
        Cochez les services à encaisser, mois par mois. Vous pouvez ne pas payer un service (ex. transport) un mois donné,
        et modifier le montant d'une ligne pour un paiement partiel.
      </p>

      <div className="space-y-3">
        {(data.months || []).map(m => (
          <div key={m.month} className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 bg-gray-50 text-sm">
              <span className="font-semibold text-gray-800">{m.label}</span>
              <span className="text-xs text-gray-500">Reste {formatMAD(m.remaining)}</span>
            </div>
            <div className="divide-y divide-gray-100">
              {m.services.map(svc => {
                const k = keyOf(m.month, svc.category);
                const payable = svc.remaining > 0;
                const checked = !!sel[k]?.checked;
                return (
                  <div key={k} className={`flex items-center gap-2 px-3 py-2 text-sm ${checked ? 'bg-green-50' : ''}`}>
                    {payable ? (
                      <input type="checkbox" checked={checked} onChange={() => toggle(m.month, svc)} className="w-4 h-4 accent-green-600" />
                    ) : <CheckCircle2 className="w-4 h-4 text-green-500" />}
                    <span className="flex-1 text-gray-800">{svc.label}</span>
                    <span className="text-xs text-gray-400">{formatMAD(svc.total)}</span>
                    {payable ? (
                      checked ? (
                        <input type="number" step="0.01" min="0" max={svc.remaining} value={sel[k].amount}
                          onChange={e => setAmount(m.month, svc.category, e.target.value)}
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

      {/* Zone d'encaissement */}
      {selectedItems.length > 0 && (
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
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Référence (optionnel)</label>
            <input type="text" value={reference} onChange={e => setReference(e.target.value)} placeholder="N° chèque, virement..." className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">{selectedItems.length} ligne(s) · <span className="font-bold text-green-700">{formatMAD(selectedTotal)}</span></span>
            <Button color="green" icon={Wallet} onClick={submit} disabled={saving}>
              {saving ? 'Encaissement...' : 'Encaisser'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Onglet Famille / paiement groupé ─────────────────────────────────────────
function FamilyTab({ student, allStudents, academicYear, onChanged }) {
  const [members, setMembers] = useState([student]); // l'élève + frères/sœurs ajoutés
  const [selectedIds, setSelectedIds] = useState(new Set([student.id]));
  const [search, setSearch] = useState('');
  const [months, setMonths] = useState([]);
  const [cats, setCats] = useState([]); // [] = tous les services
  const [method, setMethod] = useState('cash');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [reference, setReference] = useState('');
  const [preview, setPreview] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    // Frères/sœurs détectés via parent commun → ajoutés et cochés par défaut.
    (async () => {
      try {
        const res = await financeApi.getSiblings(student.id, academicYear);
        const sibs = res.siblings || [];
        if (sibs.length) {
          setMembers(prev => {
            const ids = new Set(prev.map(m => m.id));
            return [...prev, ...sibs.filter(s => !ids.has(s.id))];
          });
          setSelectedIds(prev => { const n = new Set(prev); sibs.forEach(s => n.add(s.id)); return n; });
        }
      } catch (e) { console.error(e); }
    })();
    /* eslint-disable-next-line */
  }, [student.id]);

  useEffect(() => { setPreview(null); }, [selectedIds, months, cats]);

  const toggleMember = (id) => setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleMonth = (m) => setMonths(p => p.includes(m) ? p.filter(x => x !== m) : [...p, m]);
  const toggleCat = (c) => setCats(p => p.includes(c) ? p.filter(x => x !== c) : [...p, c]);

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
    if (id === student.id) return; // l'élève principal reste
    setMembers(prev => prev.filter(m => m.id !== id));
    setSelectedIds(prev => { const n = new Set(prev); n.delete(id); return n; });
  };

  const payload = () => ({
    academic_year: academicYear,
    student_ids: [...selectedIds],
    months,
    categories: cats.length ? cats : ['all'],
    method, payment_date: paymentDate, reference: reference || undefined,
  });
  const canRun = selectedIds.size > 0 && months.length > 0;

  const runPreview = async () => {
    if (!canRun) return;
    setLoadingPreview(true);
    try { setPreview(await financeApi.payGroupPreview(payload())); }
    catch (e) { alert('Erreur: ' + e.message); }
    finally { setLoadingPreview(false); }
  };
  const runPay = async () => {
    if (!canRun) return;
    if (!confirm(`Encaisser pour ${preview?.students_with_due ?? '?'} élève(s) — total ${formatMAD(preview?.total_due || 0)} ?`)) return;
    setPaying(true);
    try {
      const res = await financeApi.payGroup(payload());
      alert(`Groupé : ${res.paid_count ?? res.receipts?.length ?? 0} encaissement(s) · ${formatMAD(res.total_paid || 0)}`);
      setPreview(null);
      onChanged?.();
    } catch (e) { alert('Erreur: ' + e.message); }
    finally { setPaying(false); }
  };

  return (
    <div className="space-y-4">
      {/* Membres de la famille */}
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
              {m.total_due != null && (
                <span className={`text-xs font-medium ${m.total_due > 0 ? 'text-orange-600' : 'text-gray-400'}`}>{formatMAD(m.total_due)}</span>
              )}
              {m.id !== student.id && (
                <button onClick={() => removeMember(m.id)} className="p-1 hover:bg-red-100 rounded"><X className="w-3.5 h-3.5 text-red-500" /></button>
              )}
            </div>
          ))}
        </div>

        {/* Ajouter un membre par recherche */}
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

      {/* Mois */}
      <div>
        <h4 className="text-sm font-semibold text-gray-800 mb-2">Mois à encaisser</h4>
        <div className="flex flex-wrap gap-1.5">
          {SCHOOL_MONTHS.map(m => (
            <button key={m.v} onClick={() => toggleMonth(m.v)}
              className={`px-2.5 py-1 rounded-md text-xs border ${months.includes(m.v) ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>
              {m.l}
            </button>
          ))}
        </div>
      </div>

      {/* Services */}
      <div>
        <h4 className="text-sm font-semibold text-gray-800 mb-2">Services <span className="font-normal text-gray-400">(aucun = tous)</span></h4>
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
            <button key={k} onClick={() => toggleCat(k)}
              className={`px-2.5 py-1 rounded-md text-xs border ${cats.includes(k) ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* Paramètres + actions */}
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

      {preview && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm flex items-center justify-between">
          <span>{preview.students_with_due} élève(s) à encaisser</span>
          <span className="font-bold text-green-700">{formatMAD(preview.total_due)}</span>
        </div>
      )}

      <div className="flex gap-2">
        <Button variant="secondary" icon={Layers} onClick={runPreview} disabled={!canRun || loadingPreview}>
          {loadingPreview ? 'Calcul...' : 'Aperçu'}
        </Button>
        <Button color="green" icon={Wallet} onClick={runPay} disabled={!canRun || paying || !preview || preview.students_with_due === 0}>
          {paying ? 'Encaissement...' : 'Encaisser le groupe'}
        </Button>
      </div>
    </div>
  );
}

// ── Onglet Historique : paiements + factures, annulations, impression ─────────
function HistoryTab({ student, academicYear, onChanged }) {
  const [payments, setPayments] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);

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
              return (
                <div key={p.id} className={`flex items-center gap-2 p-2 border rounded-lg text-sm ${cancelled ? 'border-gray-200 bg-gray-50 opacity-70' : 'border-gray-200'}`}>
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
                    <button onClick={() => cancelPayment(p)} title="Annuler le paiement" className="p-1 hover:bg-red-100 rounded">
                      <Ban className="w-4 h-4 text-red-500" />
                    </button>
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
                    <div className="font-medium text-gray-800 truncate">N° {inv.invoice_number} <span className="text-xs font-normal text-gray-400">· {inv.period_label || '—'}</span></div>
                    <div className="text-xs text-gray-500">{formatMAD(inv.total)} · payé {formatMAD(inv.amount_paid || 0)}</div>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${meta.cls}`}>{meta.label}</span>
                  <button onClick={() => printInvoice(inv)} title="Imprimer la facture" className="p-1 hover:bg-blue-100 rounded">
                    <Printer className="w-4 h-4 text-blue-600" />
                  </button>
                  {inv.status !== 'cancelled' && (
                    <button onClick={() => cancelInvoice(inv)} title="Annuler la facture" className="p-1 hover:bg-red-100 rounded">
                      <Ban className="w-4 h-4 text-red-500" />
                    </button>
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
