import { useState, useEffect } from 'react';
import { Users, Search, RefreshCw, AlertCircle, CheckCircle2, XCircle, FileText, Plus, X, Save, CreditCard, Wallet } from 'lucide-react';
import { financeApi, formatMAD, formatDate, CATEGORY_LABELS, RECURRENCE_LABELS, METHOD_LABELS } from '../../lib/financeApi';
import { supabase } from '../../lib/supabase';

export default function FinanceStudentsPage() {
  const [students, setStudents] = useState([]);
  const [classes, setClasses] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ class_id: '', search: '' });
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [payStudent, setPayStudent] = useState(null);

  useEffect(() => {
    loadClasses();
    loadTemplates();
  }, []);

  useEffect(() => { load(); }, [filters.class_id]);

  const load = async () => {
    setLoading(true);
    try {
      const data = await financeApi.listStudents({ class_id: filters.class_id });
      setStudents(data.students || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const loadClasses = async () => {
    try {
      const data = await financeApi.listClasses();
      setClasses(Array.isArray(data) ? data : (data.classes || []));
    } catch (e) { console.error(e); }
  };

  const loadTemplates = async () => {
    try {
      const data = await financeApi.listTemplates();
      setTemplates(data.templates || []);
    } catch (e) { console.error(e); }
  };

  const filtered = filters.search
    ? students.filter(s => `${s.first_name} ${s.last_name}`.toLowerCase().includes(filters.search.toLowerCase()))
    : students;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <Users className="w-6 h-6" /> Élèves — Finance
        </h1>
        <p className="text-sm text-gray-500">{filtered.length} élève(s)</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[200px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" placeholder="Rechercher un élève..." value={filters.search}
            onChange={e => setFilters({ ...filters, search: e.target.value })}
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg" />
        </div>
        <select value={filters.class_id} onChange={e => setFilters({ ...filters, class_id: e.target.value })}
          className="px-3 py-2 border border-gray-300 rounded-lg">
          <option value="">Toutes classes</option>
          {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button onClick={load} className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-xs uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Élève</th>
                <th className="px-4 py-3 text-left">Classe</th>
                <th className="px-4 py-3 text-center">Plan</th>
                <th className="px-4 py-3 text-right">Facturé</th>
                <th className="px-4 py-3 text-right">Payé</th>
                <th className="px-4 py-3 text-right">Dû</th>
                <th className="px-4 py-3 text-center">Retards</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 && <tr><td colSpan="8" className="px-4 py-8 text-center text-gray-400">Aucun élève</td></tr>}
              {filtered.map(s => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">
                    <button onClick={() => setPayStudent(s)} className="text-left hover:text-blue-600 hover:underline">
                      {s.first_name} {s.last_name}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{s.classes?.name || '—'}</td>
                  <td className="px-4 py-3 text-center">
                    {s.has_plan
                      ? <CheckCircle2 className="w-4 h-4 text-green-500 inline" />
                      : <XCircle className="w-4 h-4 text-gray-300 inline" />}
                  </td>
                  <td className="px-4 py-3 text-right">{formatMAD(s.total_invoiced)}</td>
                  <td className="px-4 py-3 text-right text-green-600">{formatMAD(s.total_paid)}</td>
                  <td className={`px-4 py-3 text-right font-medium ${s.total_due > 0 ? 'text-orange-600' : 'text-gray-400'}`}>
                    {formatMAD(s.total_due)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {s.overdue_count > 0 ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-medium">
                        <AlertCircle className="w-3 h-3" /> {s.overdue_count}
                      </span>
                    ) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1.5">
                      <button onClick={() => setPayStudent(s)}
                        className="inline-flex items-center gap-1 px-3 py-1 text-xs bg-green-50 text-green-700 rounded-lg hover:bg-green-100">
                        <Wallet className="w-3.5 h-3.5" /> Paiements
                      </button>
                      <button onClick={() => setSelectedStudent(s)}
                        className="px-3 py-1 text-xs bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100">
                        Plan de frais
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selectedStudent && (
        <StudentFeePlanModal
          student={selectedStudent}
          templates={templates}
          onClose={() => setSelectedStudent(null)}
          onSaved={() => { setSelectedStudent(null); load(); }}
        />
      )}

      {payStudent && (
        <MonthlyPaymentsModal
          student={payStudent}
          onClose={() => setPayStudent(null)}
          onPaid={() => load()}
        />
      )}
    </div>
  );
}

function getCurrentAcademicYear() {
  const y = new Date().getFullYear();
  const m = new Date().getMonth();
  return m >= 7 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}

const MONTH_STATUS_META = {
  paid: { label: 'Payé', cls: 'bg-green-100 text-green-700' },
  partial: { label: 'Partiel', cls: 'bg-yellow-100 text-yellow-700' },
  overdue: { label: 'En retard', cls: 'bg-red-100 text-red-700' },
  unpaid: { label: 'Impayé', cls: 'bg-orange-100 text-orange-700' },
  pending: { label: 'Non facturé', cls: 'bg-gray-100 text-gray-600' }
};

function MonthlyPaymentsModal({ student, onClose, onPaid }) {
  const [academicYear, setAcademicYear] = useState(getCurrentAcademicYear());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState([]); // months cochés
  const [method, setMethod] = useState('cash');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [reference, setReference] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, [academicYear]);

  const load = async () => {
    setLoading(true);
    setSelected([]);
    try {
      const res = await financeApi.getMonthlyStatus(student.id, academicYear);
      setData(res);
    } catch (e) { console.error(e); setData(null); }
    finally { setLoading(false); }
  };

  const payableMonths = (data?.months || []).filter(m => m.remaining > 0);

  const toggle = (month) => {
    setSelected(prev => prev.includes(month) ? prev.filter(x => x !== month) : [...prev, month]);
  };

  const toggleAll = () => {
    if (selected.length === payableMonths.length) setSelected([]);
    else setSelected(payableMonths.map(m => m.month));
  };

  const selectedTotal = (data?.months || [])
    .filter(m => selected.includes(m.month))
    .reduce((s, m) => s + Number(m.remaining), 0);

  const submit = async () => {
    if (selected.length === 0) return;
    if (!confirm(`Encaisser ${selected.length} mois pour un total de ${formatMAD(selectedTotal)} ?`)) return;
    setSaving(true);
    try {
      const res = await financeApi.payMonths(student.id, {
        academic_year: academicYear,
        months: selected,
        payment_date: paymentDate,
        method,
        reference: reference || undefined
      });
      alert(`${res.paid_count} mois encaissé(s) · ${formatMAD(res.total_paid)}`);
      await load();
      onPaid?.();
    } catch (e) { alert('Erreur: ' + e.message); }
    finally { setSaving(false); }
  };

  const summary = data?.summary;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <CreditCard className="w-5 h-5" /> Paiements mensuels
            </h2>
            <p className="text-sm text-gray-500">{student.first_name} {student.last_name} · {student.classes?.name || '—'}</p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-6 space-y-4">
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-gray-700">Année scolaire</label>
            <input type="text" value={academicYear} onChange={e => setAcademicYear(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm w-32" />
          </div>

          {loading ? (
            <p className="text-gray-500 py-8 text-center">Chargement...</p>
          ) : !data?.plan_exists ? (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-4 text-sm">
              Aucun plan de frais actif pour cet élève sur {academicYear}. Définissez d'abord un « Plan de frais ».
            </div>
          ) : (
            <>
              {/* Bandeau récapitulatif */}
              {summary && (
                <div className={`rounded-lg p-4 flex items-center justify-between ${summary.all_paid ? 'bg-green-50 border border-green-200' : 'bg-blue-50 border border-blue-200'}`}>
                  {summary.all_paid ? (
                    <span className="flex items-center gap-2 text-green-700 font-semibold">
                      <CheckCircle2 className="w-5 h-5" /> Tout payé ✓ ({summary.paid_months}/{summary.total_months} mois)
                    </span>
                  ) : (
                    <div className="text-sm">
                      <span className="text-gray-600">Reste à payer : </span>
                      <span className="font-bold text-orange-600">{formatMAD(summary.remaining_total)}</span>
                      <span className="text-gray-400"> · Payé {formatMAD(summary.paid_total)} / {formatMAD(summary.expected_total)}</span>
                    </div>
                  )}
                  <span className="text-xs text-gray-500">{summary.paid_months}/{summary.total_months} mois payés</span>
                </div>
              )}

              {/* Grille des mois */}
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-600 text-xs uppercase">
                    <tr>
                      <th className="px-3 py-2 text-center w-10">
                        <input type="checkbox" checked={payableMonths.length > 0 && selected.length === payableMonths.length}
                          onChange={toggleAll} disabled={payableMonths.length === 0} />
                      </th>
                      <th className="px-3 py-2 text-left">Mois</th>
                      <th className="px-3 py-2 text-right">Montant</th>
                      <th className="px-3 py-2 text-right">Payé</th>
                      <th className="px-3 py-2 text-right">Reste</th>
                      <th className="px-3 py-2 text-center">Statut</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {(data.months || []).map(m => {
                      const meta = MONTH_STATUS_META[m.status] || MONTH_STATUS_META.pending;
                      const payable = m.remaining > 0;
                      return (
                        <tr key={m.month} className={selected.includes(m.month) ? 'bg-blue-50' : 'hover:bg-gray-50'}>
                          <td className="px-3 py-2 text-center">
                            {payable ? (
                              <input type="checkbox" checked={selected.includes(m.month)} onChange={() => toggle(m.month)} />
                            ) : <CheckCircle2 className="w-4 h-4 text-green-500 inline" />}
                          </td>
                          <td className="px-3 py-2 font-medium text-gray-800">{m.label}</td>
                          <td className="px-3 py-2 text-right text-gray-700">{formatMAD(m.total)}</td>
                          <td className="px-3 py-2 text-right text-green-600">{formatMAD(m.paid)}</td>
                          <td className={`px-3 py-2 text-right font-medium ${m.remaining > 0 ? 'text-orange-600' : 'text-gray-400'}`}>
                            {formatMAD(m.remaining)}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${meta.cls}`}>{meta.label}</span>
                          </td>
                        </tr>
                      );
                    })}
                    {(data.months || []).length === 0 && (
                      <tr><td colSpan="6" className="px-3 py-6 text-center text-gray-400">Aucune échéance dans ce plan</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Zone d'encaissement */}
              {selected.length > 0 && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Mode de paiement</label>
                      <select value={method} onChange={e => setMethod(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                        {Object.entries(METHOD_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Date</label>
                      <input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Référence (optionnel)</label>
                    <input type="text" value={reference} onChange={e => setReference(e.target.value)}
                      placeholder="N° chèque, virement..." className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="sticky bottom-0 bg-white border-t border-gray-200 px-6 py-4 flex items-center justify-between gap-2">
          <div className="text-sm">
            {selected.length > 0 && (
              <span className="text-gray-600">{selected.length} mois sélectionné(s) · <span className="font-bold text-green-700">{formatMAD(selectedTotal)}</span></span>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">Fermer</button>
            <button onClick={submit} disabled={selected.length === 0 || saving}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">
              <Wallet className="w-4 h-4" /> {saving ? 'Encaissement...' : 'Encaisser'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function StudentFeePlanModal({ student, templates, onClose, onSaved }) {
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    academic_year: getCurrentYear(),
    template_id: '',
    sibling_discount_percent: 0,
    sibling_discount_type: 'percent',
    sibling_discount_amount: 0,
    scholarship_amount: 0,
    custom_notes: '',
    custom_items: []
  });

  function getCurrentYear() {
    const y = new Date().getFullYear();
    const m = new Date().getMonth();
    return m >= 7 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
  }

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      const data = await financeApi.getStudentPlan(student.id, form.academic_year);
      const existing = data.plans?.[0];
      if (existing) {
        setPlan(existing);
        // Récupération automatique : si un modèle est encore attaché, on importe
        // ses frais comme items personnalisés et on détache le modèle, pour
        // permettre de modifier/supprimer chaque frais par élève.
        const existingItems = existing.custom_items || [];
        const keyOf = (it) => `${it.category}|${(it.name || '').trim().toLowerCase()}|${it.recurrence}|${Number(it.amount) || 0}`;
        const existingKeys = new Set(existingItems.map(keyOf));
        // Import des frais du modèle encore attaché, en évitant les doublons
        // avec les frais déjà personnalisés.
        const tplItems = existing.template_id
          ? (existing.template?.fee_template_items || [])
              .map(it => ({
                category: it.category,
                name: it.name,
                amount: Number(it.amount) || 0,
                recurrence: it.recurrence || 'one_time',
                due_month: it.due_month ?? null,
                start_month: it.start_month ?? 9,
                end_month: it.end_month ?? 6,
                is_optional: !!it.is_optional,
                enabled: it.enabled !== false,
              }))
              .filter(it => !existingKeys.has(keyOf(it)))
          : [];
        setForm({
          academic_year: existing.academic_year,
          template_id: '',
          sibling_discount_percent: existing.sibling_discount_percent || 0,
          sibling_discount_type: existing.sibling_discount_type || 'percent',
          sibling_discount_amount: existing.sibling_discount_amount || 0,
          scholarship_amount: existing.scholarship_amount || 0,
          custom_notes: existing.custom_notes || '',
          custom_items: [...tplItems, ...existingItems]
        });
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const save = async () => {
    try {
      await financeApi.saveStudentPlan(student.id, form);
      onSaved();
    } catch (e) { alert('Erreur: ' + e.message); }
  };

  const addItem = () => setForm({
    ...form,
    custom_items: [...form.custom_items, {
      category: 'other', name: '', amount: 0, recurrence: 'one_time', due_month: null, enabled: true
    }]
  });

  const updateItem = (idx, field, value) => {
    const items = [...form.custom_items];
    items[idx] = { ...items[idx], [field]: value };
    setForm({ ...form, custom_items: items });
  };

  const removeItem = (idx) => setForm({ ...form, custom_items: form.custom_items.filter((_, i) => i !== idx) });

  // Convertit les frais d'un modèle en items personnalisés (modifiables/supprimables par élève)
  const templateItemsToCustom = (templateId) => {
    const tpl = templates.find(t => t.id === templateId);
    return (tpl?.fee_template_items || []).map(it => ({
      category: it.category,
      name: it.name,
      amount: Number(it.amount) || 0,
      recurrence: it.recurrence || 'one_time',
      due_month: it.due_month ?? null,
      start_month: it.start_month ?? 9,
      end_month: it.end_month ?? 6,
      is_optional: !!it.is_optional,
      enabled: it.enabled !== false,
    }));
  };

  // Clé d'unicité d'un frais (catégorie|nom|récurrence|montant)
  const itemKey = (it) => `${it.category}|${(it.name || '').trim().toLowerCase()}|${it.recurrence}|${Number(it.amount) || 0}`;

  // Sélection d'un modèle : ses frais sont récupérés automatiquement comme
  // items personnalisés et le modèle est détaché (contrôle total par élève).
  // On évite d'ajouter en double les frais déjà présents (anti-doublement).
  const onSelectTemplate = (templateId) => {
    if (!templateId) { setForm({ ...form, template_id: '' }); return; }
    const existingKeys = new Set(form.custom_items.map(itemKey));
    const toAdd = templateItemsToCustom(templateId).filter(it => !existingKeys.has(itemKey(it)));
    if (toAdd.length === 0) {
      alert('Les frais de ce modèle sont déjà présents dans le plan.');
      return;
    }
    setForm({ ...form, template_id: '', custom_items: [...form.custom_items, ...toAdd] });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Plan de frais</h2>
            <p className="text-sm text-gray-500">{student.first_name} {student.last_name} · {student.classes?.name}</p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded"><X className="w-5 h-5" /></button>
        </div>

        {loading ? <p className="p-6 text-gray-500">Chargement...</p> : (
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Année scolaire</label>
                <input type="text" value={form.academic_year} onChange={e => setForm({ ...form, academic_year: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Importer un modèle de frais</label>
                <select value="" onChange={e => onSelectTemplate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg">
                  <option value="">Choisir un modèle à importer…</option>
                  {(() => {
                    const sameYear = templates.filter(t => t.academic_year === form.academic_year);
                    // Si aucun modèle pour l'année saisie, on montre tous les modèles
                    // (le filtre par année exacte cachait les modèles → « non récupérés »).
                    const list = sameYear.length ? sameYear : templates;
                    return list.map(t => (
                      <option key={t.id} value={t.id}>
                        {t.name}{t.academic_year !== form.academic_year ? ` (${t.academic_year})` : ''}
                      </option>
                    ));
                  })()}
                </select>
                <p className="text-xs text-gray-500 mt-1">Les frais du modèle sont ajoutés ci-dessous, modifiables par élève.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Réduction fratrie</label>
                <div className="flex gap-2">
                  {form.sibling_discount_type === 'amount' ? (
                    <input type="number" step="0.01" min="0" value={form.sibling_discount_amount}
                      onChange={e => setForm({ ...form, sibling_discount_amount: Number(e.target.value) })}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg" placeholder="Montant" />
                  ) : (
                    <input type="number" step="0.1" min="0" max="100" value={form.sibling_discount_percent}
                      onChange={e => setForm({ ...form, sibling_discount_percent: Number(e.target.value) })}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg" placeholder="Pourcentage" />
                  )}
                  <select value={form.sibling_discount_type}
                    onChange={e => setForm({ ...form, sibling_discount_type: e.target.value })}
                    className="px-2 py-2 border border-gray-300 rounded-lg bg-white">
                    <option value="percent">%</option>
                    <option value="amount">DH</option>
                  </select>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {form.sibling_discount_type === 'amount' ? 'Montant fixe déduit chaque mois' : 'Pourcentage du total mensuel'}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Bourse / année (MAD)</label>
                <input type="number" step="0.01" min="0" value={form.scholarship_amount}
                  onChange={e => setForm({ ...form, scholarship_amount: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
                <p className="text-xs text-gray-500 mt-1">Répartie sur 10 mensualités</p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <textarea rows="2" value={form.custom_notes} onChange={e => setForm({ ...form, custom_notes: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
            </div>

            <div className="border-t border-gray-200 pt-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-gray-800">Frais de l'élève</h3>
                <button onClick={addItem} className="flex items-center gap-1 px-3 py-1 text-xs bg-blue-50 text-blue-700 rounded-lg">
                  <Plus className="w-3 h-3" /> Ajouter
                </button>
              </div>
              <div className="space-y-2">
                {form.custom_items.map((it, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 p-2 bg-gray-50 rounded-lg">
                    <select value={it.category} onChange={e => updateItem(idx, 'category', e.target.value)}
                      className="col-span-3 px-2 py-1 text-sm border rounded">
                      {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                    <input type="text" value={it.name} onChange={e => updateItem(idx, 'name', e.target.value)}
                      placeholder="Nom" className="col-span-4 px-2 py-1 text-sm border rounded" />
                    <input type="number" value={it.amount} onChange={e => updateItem(idx, 'amount', Number(e.target.value))}
                      placeholder="Montant" className="col-span-2 px-2 py-1 text-sm border rounded" />
                    <select value={it.recurrence} onChange={e => updateItem(idx, 'recurrence', e.target.value)}
                      className="col-span-2 px-2 py-1 text-sm border rounded">
                      {Object.entries(RECURRENCE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                    <button onClick={() => removeItem(idx)} className="col-span-1 p-1 hover:bg-red-100 rounded">
                      <X className="w-4 h-4 text-red-500 mx-auto" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="sticky bottom-0 bg-white border-t border-gray-200 px-6 py-4 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">Annuler</button>
          <button onClick={save} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            <Save className="w-4 h-4" /> Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}
