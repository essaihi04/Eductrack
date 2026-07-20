import { useState, useEffect } from 'react';
import { Banknote, Search, Wallet, CheckCircle2, X, User, Ban, ChevronRight } from 'lucide-react';
import { financeApi, formatMAD, METHOD_LABELS, CATEGORY_LABELS } from '../../lib/financeApi';
import { askPrompt } from '../../lib/prompt';
import { PageHeader, Card, EmptyState, Button, Badge } from '../../components/finance/ui';
import { useYear } from '../../contexts/YearContext';
import { toDashYear, toSlashYear } from '../../lib/schoolYear';

// Code couleur des tuiles mois (agrégat) : vert=payé, orange=partiel, rouge=impayé.
const MONTH_META = {
  paid:    { bg: 'bg-green-500 text-white',        ring: 'ring-green-500' },
  partial: { bg: 'bg-orange-400 text-orange-950',  ring: 'ring-orange-500' },
  overdue: { bg: 'bg-red-500 text-white',          ring: 'ring-red-500' },
  unpaid:  { bg: 'bg-red-500 text-white',          ring: 'ring-red-500' },
  pending: { bg: 'bg-white text-gray-500',         ring: 'ring-gray-300' },
};
const SERVICE_TONE = { paid: 'green', partial: 'orange', overdue: 'red', unpaid: 'red', pending: 'gray' };
const SERVICE_STATUS_LABEL = { paid: 'Payé', partial: 'Partiel', overdue: 'En retard', unpaid: 'Impayé', pending: 'Non facturé' };

const svcLabel = (s) => CATEGORY_LABELS[s.category] || s.label || 'Service';
const keyOf = (month, category) => `${month}:${category ?? 'all'}`;

export default function QuickCollectPage() {
  const { year, years } = useYear();
  const [activeYear, setActiveYear] = useState(year);
  const [classes, setClasses] = useState([]);
  const [students, setStudents] = useState([]);
  const [filters, setFilters] = useState({ class_id: '', search: '' });
  const [loadingStudents, setLoadingStudents] = useState(false);

  const [selectedStudent, setSelectedStudent] = useState(null);
  const [data, setData] = useState(null);
  const [loadingData, setLoadingData] = useState(false);
  const [openMonth, setOpenMonth] = useState(null); // mois déplié

  const [selected, setSelected] = useState([]); // [{month, category, remaining, label}]
  const [method, setMethod] = useState('cash');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState('');
  const [saving, setSaving] = useState(false);

  const yearTabs = (years && years.length)
    ? years
    : (() => {
        const cur = toSlashYear(activeYear);
        const start = parseInt(String(cur).split('/')[0], 10) || new Date().getFullYear();
        return [start - 1, start, start + 1].map((y) => `${y}/${y + 1}`);
      })();

  useEffect(() => { loadClasses(); /* eslint-disable-next-line */ }, [activeYear]);
  useEffect(() => { loadStudents(); /* eslint-disable-next-line */ }, [filters.class_id, activeYear]);
  useEffect(() => { if (selectedStudent) loadStatus(selectedStudent); /* eslint-disable-next-line */ }, [activeYear]);

  const loadClasses = async () => {
    try {
      const res = await financeApi.listClasses(toDashYear(activeYear));
      setClasses(Array.isArray(res) ? res : (res.classes || []));
    } catch (e) { console.error(e); }
  };

  const loadStudents = async () => {
    setLoadingStudents(true);
    try {
      const res = await financeApi.listStudents({ class_id: filters.class_id, academic_year: toDashYear(activeYear) });
      setStudents(res.students || []);
    } catch (e) { console.error(e); }
    finally { setLoadingStudents(false); }
  };

  const loadStatus = async (student) => {
    if (!student) return;
    setLoadingData(true);
    setSelected([]);
    try {
      const res = await financeApi.getMonthlyServicesStatus(student.id, toDashYear(activeYear));
      setData(res);
    } catch (e) { console.error(e); setData(null); }
    finally { setLoadingData(false); }
  };

  const pickStudent = (s) => { setSelectedStudent(s); setOpenMonth(null); loadStatus(s); };

  const filteredStudents = filters.search
    ? students.filter((s) => `${s.first_name} ${s.last_name}`.toLowerCase().includes(filters.search.toLowerCase()))
    : students;

  const months = data?.months || [];
  const summary = data?.summary;
  const openMonthData = months.find((m) => m.month === openMonth) || null;

  const isSelected = (month, category) => selected.some((x) => keyOf(x.month, x.category) === keyOf(month, category));

  const toggleService = (month, s) => {
    if (s.remaining <= 0) return;
    const k = keyOf(month, s.category);
    setSelected((prev) => prev.some((x) => keyOf(x.month, x.category) === k)
      ? prev.filter((x) => keyOf(x.month, x.category) !== k)
      : [...prev, { month, category: s.category, remaining: s.remaining, label: `${svcLabel(s)} ${openMonthData?.label || ''}`.trim() }]);
  };

  const selectedTotal = selected.reduce((s, x) => s + Number(x.remaining), 0);

  const submit = async () => {
    if (selected.length === 0 || !selectedStudent) return;
    if (!confirm(`Encaisser ${selected.length} service(s) — total ${formatMAD(selectedTotal)} ?`)) return;
    setSaving(true);
    try {
      const res = await financeApi.payServices(selectedStudent.id, {
        academic_year: toDashYear(activeYear),
        items: selected.map((x) => ({ month: x.month, category: x.category })),
        payment_date: paymentDate,
        method,
        reference: reference || undefined,
      });
      alert(`${res.paid_count} service(s) encaissé(s) · ${formatMAD(res.total_paid)}`);
      setReference('');
      await loadStatus(selectedStudent);
      loadStudents();
    } catch (e) { alert('Erreur: ' + e.message); }
    finally { setSaving(false); }
  };

  // Annulation d'un service : on annule le(s) paiement(s) confirmé(s) de sa facture.
  const cancelService = async (s) => {
    if (!s.invoice_id || s.paid <= 0) return;
    const reason = await askPrompt(`Annuler le paiement de "${svcLabel(s)}" ?\nMotif :`);
    if (!reason || !reason.trim()) return; // motif obligatoire (refusé sans lui)
    try {
      const { payments } = await financeApi.listPayments({ invoice_id: s.invoice_id });
      for (const p of (payments || [])) {
        if (p.status !== 'cancelled') await financeApi.cancelPayment(p.id, reason.trim());
      }
      await loadStatus(selectedStudent);
      loadStudents();
    } catch (e) { alert('Erreur: ' + e.message); }
  };

  return (
    <div className="p-6 space-y-5 pb-28">
      <PageHeader icon={Banknote} title="Encaissement rapide" color="green"
        subtitle="Élève → mois → service : encaissez ou annulez chaque service séparément" />

      <div className="flex items-center gap-2 flex-wrap">
        {yearTabs.map((y) => {
          const active = toSlashYear(y) === toSlashYear(activeYear);
          return (
            <button key={y} onClick={() => setActiveYear(y)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${active ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
              {toSlashYear(y)}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-5">
        {/* Sélection élève */}
        <Card title="Élèves" bodyClassName="p-0">
          <div className="p-3 space-y-2 border-b border-border">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input type="text" placeholder="Rechercher…" value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </div>
            <select value={filters.class_id} onChange={(e) => setFilters({ ...filters, class_id: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
              <option value="">Toutes les classes</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="max-h-[60vh] overflow-y-auto divide-y divide-border">
            {loadingStudents ? (
              <p className="p-4 text-sm text-gray-400">Chargement…</p>
            ) : filteredStudents.length === 0 ? (
              <p className="p-4 text-sm text-gray-400">Aucun élève</p>
            ) : filteredStudents.map((s) => (
              <button key={s.id} onClick={() => pickStudent(s)}
                className={`w-full text-left px-4 py-2.5 flex items-center justify-between gap-2 hover:bg-gray-50 ${selectedStudent?.id === s.id ? 'bg-green-50' : ''}`}>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-gray-800 truncate">{s.first_name} {s.last_name}</span>
                  <span className="block text-xs text-gray-400">{s.classes?.name || '—'}</span>
                </span>
                {Number(s.total_due) > 0
                  ? <span className="text-xs font-medium text-orange-600 whitespace-nowrap">{formatMAD(s.total_due)}</span>
                  : <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />}
              </button>
            ))}
          </div>
        </Card>

        {/* Grille mois + services */}
        <div className="space-y-4">
          {!selectedStudent ? (
            <Card><EmptyState icon={User} title="Sélectionnez un élève" hint="Choisissez un élève à gauche pour afficher ses mois et services." /></Card>
          ) : loadingData ? (
            <Card><p className="p-8 text-center text-gray-400">Chargement…</p></Card>
          ) : !data?.plan_exists ? (
            <Card>
              <div className="p-4 text-sm bg-amber-50 border border-amber-200 text-amber-800 rounded-lg">
                Aucun plan de frais actif pour <strong>{selectedStudent.first_name} {selectedStudent.last_name}</strong> sur {toSlashYear(activeYear)}.
                Définissez d'abord un « Plan de frais » dans la page Élèves.
              </div>
            </Card>
          ) : (
            <>
              <Card title={`${selectedStudent.first_name} ${selectedStudent.last_name} · ${selectedStudent.classes?.name || '—'}`}>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {months.map((m) => {
                    const meta = MONTH_META[m.status] || MONTH_META.pending;
                    const open = openMonth === m.month;
                    return (
                      <button key={m.month} onClick={() => setOpenMonth(open ? null : m.month)}
                        className={`relative rounded-xl border p-3 text-left transition-all hover:shadow-md ${meta.bg} ${open ? `ring-2 ring-offset-1 ${meta.ring}` : 'border-black/5'}`}>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold opacity-90 truncate">{m.label}</span>
                          <ChevronRight className={`w-4 h-4 opacity-70 transition-transform ${open ? 'rotate-90' : ''}`} />
                        </div>
                        <div className="text-lg font-bold mt-1 tabular-nums">{formatMAD(m.paid)}</div>
                        <div className="text-[11px] opacity-80 tabular-nums">CA : {formatMAD(m.expected)}</div>
                        {m.remaining > 0 && <div className="text-[11px] font-medium mt-0.5 tabular-nums">Reste {formatMAD(m.remaining)}</div>}
                      </button>
                    );
                  })}
                  {months.length === 0 && <p className="col-span-full text-center text-gray-400 py-6">Aucune échéance dans ce plan</p>}
                </div>
              </Card>

              {/* Services du mois déplié */}
              {openMonthData && (
                <Card title={`Services — ${openMonthData.label}`}>
                  <div className="divide-y divide-border">
                    {openMonthData.services.map((s) => {
                      const sel = isSelected(openMonthData.month, s.category);
                      const payable = s.remaining > 0;
                      return (
                        <div key={keyOf(openMonthData.month, s.category)}
                          className={`flex items-center gap-3 py-2.5 ${sel ? 'bg-green-50/60 -mx-4 px-4' : ''}`}>
                          {payable ? (
                            <input type="checkbox" checked={sel} onChange={() => toggleService(openMonthData.month, s)} className="w-4 h-4" />
                          ) : <CheckCircle2 className="w-4 h-4 text-green-500" />}
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-gray-800">{svcLabel(s)}</div>
                            <div className="text-xs text-gray-500 tabular-nums">
                              {formatMAD(s.paid)} / {formatMAD(s.total)}
                              {s.remaining > 0 && <span className="text-orange-600"> · reste {formatMAD(s.remaining)}</span>}
                            </div>
                          </div>
                          <Badge tone={SERVICE_TONE[s.status] || 'gray'}>{SERVICE_STATUS_LABEL[s.status] || s.status}</Badge>
                          {s.paid > 0 && s.invoice_id && (
                            <button onClick={() => cancelService(s)} className="p-1.5 hover:bg-red-50 rounded" title="Annuler ce service">
                              <Ban className="w-4 h-4 text-red-500" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                    {openMonthData.services.length === 0 && <p className="py-4 text-center text-gray-400 text-sm">Aucun service ce mois</p>}
                  </div>
                </Card>
              )}

              {/* Situation élève */}
              {summary && (
                <div className="grid grid-cols-3 gap-3">
                  <SituationCell label="Chiffre d'affaires" value={summary.expected_total} tone="text-gray-900" />
                  <SituationCell label="Montant payé" value={summary.paid_total} tone="text-green-600" />
                  <SituationCell label="Reste à payer" value={summary.remaining_total} tone={summary.remaining_total > 0 ? 'text-orange-600' : 'text-gray-400'} />
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Barre d'encaissement collante */}
      {selected.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-gray-200 shadow-[0_-4px_12px_rgba(0,0,0,0.06)]">
          <div className="max-w-6xl mx-auto px-6 py-3 flex flex-wrap items-center gap-3">
            <div className="text-sm">
              <span className="text-gray-600">{selected.length} service(s) · </span>
              <span className="font-bold text-green-700">{formatMAD(selectedTotal)}</span>
            </div>
            <div className="flex items-center gap-2 ml-auto flex-wrap">
              <select value={method} onChange={(e) => setMethod(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
                {Object.entries(METHOD_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              <input type="text" value={reference} onChange={(e) => setReference(e.target.value)}
                placeholder="Référence (optionnel)" className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-44" />
              <button onClick={() => setSelected([])} className="p-2 text-gray-400 hover:text-gray-600" title="Annuler la sélection">
                <X className="w-4 h-4" />
              </button>
              <Button color="green" icon={Wallet} onClick={submit} disabled={saving}>
                {saving ? 'Encaissement…' : 'Encaisser'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SituationCell({ label, value, tone }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-xl font-bold mt-1 tabular-nums ${tone}`}>{formatMAD(value)}</div>
    </div>
  );
}
