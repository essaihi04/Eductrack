import { useState, useEffect } from 'react';
import { Users, Search, AlertCircle, CheckCircle2, XCircle, Plus, X, Save, Wallet } from 'lucide-react';
import { financeApi, formatMAD, CATEGORY_LABELS, RECURRENCE_LABELS } from '../../lib/financeApi';
import { PageHeader, KpiGrid, KpiCard, FilterBar, Drawer, Button } from '../../components/finance/ui';
import {
  CardGrid, StudentCard, StudentRow, GridListToggle, StatusPill,
} from '../../components/directory/ui';
import { useYear } from '../../contexts/YearContext';
import { toDashYear } from '../../lib/schoolYear';
import StudentFinanceWorkspace from './StudentFinanceWorkspace';

const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const resolveAvatar = (u) => !u ? null : (u.startsWith('http') ? u : `${apiUrl}${u.startsWith('/') ? '' : '/'}${u}`);

export default function FinanceStudentsPage() {
  const { year } = useYear();
  const [students, setStudents] = useState([]);
  const [classes, setClasses] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ class_id: '', search: '' });
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'list'
  const [activeStudent, setActiveStudent] = useState(null); // espace finance ouvert (panneau latéral)
  const [selectedStudent, setSelectedStudent] = useState(null); // modale plan de frais

  useEffect(() => {
    loadClasses();
    loadTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year]);

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [filters.class_id, year]);

  // Garde la fiche ouverte alignée sur les données rechargées (ex : après un encaissement).
  useEffect(() => {
    if (!activeStudent) return;
    const fresh = students.find(s => s.id === activeStudent.id);
    if (fresh && fresh !== activeStudent) setActiveStudent(fresh);
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [students]);

  const load = async () => {
    setLoading(true);
    try {
      const data = await financeApi.listStudents({ class_id: filters.class_id, academic_year: year });
      setStudents(data.students || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const loadClasses = async () => {
    try {
      const data = await financeApi.listClasses(year);
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

  const totals = filtered.reduce((acc, s) => ({
    invoiced: acc.invoiced + Number(s.total_invoiced || 0),
    paid: acc.paid + Number(s.total_paid || 0),
    due: acc.due + Number(s.total_due || 0),
    overdue: acc.overdue + (s.overdue_count > 0 ? 1 : 0),
  }), { invoiced: 0, paid: 0, due: 0, overdue: 0 });

  // Pastille de statut financier affichée sur la carte/ligne d'un élève.
  const financeStatus = (s) => {
    if (Number(s.total_due) > 0) {
      return s.overdue_count > 0
        ? <StatusPill tone="red" icon={AlertCircle}>{formatMAD(s.total_due)} en retard</StatusPill>
        : <StatusPill tone="amber" icon={Wallet}>{formatMAD(s.total_due)} dû</StatusPill>;
    }
    if (s.has_plan) return <StatusPill tone="green" icon={CheckCircle2}>À jour</StatusPill>;
    return <StatusPill tone="gray" icon={XCircle}>Sans plan</StatusPill>;
  };

  return (
    <div className="p-6 space-y-5">
      {/* Espace finance plein écran de l'élève (remplit l'interface) */}
      {activeStudent ? (
        <StudentFinanceWorkspace
          student={activeStudent}
          allStudents={students}
          academicYear={toDashYear(year)}
          onClose={() => setActiveStudent(null)}
          onChanged={load}
          onOpenPlan={() => setSelectedStudent(activeStudent)}
        />
      ) : (
        <>
          <PageHeader icon={Users} title="Élèves — Finance" color="green"
            subtitle={`${filtered.length} élève(s)`} onRefresh={load} loading={loading} />

          <KpiGrid cols={4}>
            <KpiCard label="Total facturé" value={formatMAD(totals.invoiced)} tone="blue" />
            <KpiCard label="Encaissé" value={formatMAD(totals.paid)} tone="green" />
            <KpiCard label="Restant dû" value={formatMAD(totals.due)} tone="orange" />
            <KpiCard label="Élèves en retard" value={totals.overdue} tone="red" icon={AlertCircle} />
          </KpiGrid>

          <FilterBar>
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
          </FilterBar>

          {/* Bascule grille / liste */}
          <div className="flex items-center justify-end">
            <GridListToggle value={viewMode} onChange={setViewMode} />
          </div>

          {filtered.length === 0 ? (
            <p className="text-center py-10 text-gray-400">Aucun élève</p>
          ) : viewMode === 'grid' ? (
            <CardGrid min={180}>
              {filtered.map((s) => (
                <StudentCard
                  key={s.id}
                  name={`${s.first_name} ${s.last_name}`}
                  photo={resolveAvatar(s.avatar_url)}
                  gender={s.gender || ''}
                  classLabel={s.classes?.name || '—'}
                  status={financeStatus(s)}
                  onClick={() => setActiveStudent(s)}
                />
              ))}
            </CardGrid>
          ) : (
            <div>
              {filtered.map((s) => (
                <StudentRow
                  key={s.id}
                  name={`${s.first_name} ${s.last_name}`}
                  photo={resolveAvatar(s.avatar_url)}
                  gender={s.gender || ''}
                  classLabel={s.classes?.name || '—'}
                  sub={s.total_due > 0 ? `Reste dû ${formatMAD(s.total_due)}` : 'À jour'}
                  status={financeStatus(s)}
                  onClick={() => setActiveStudent(s)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {selectedStudent && (
        <StudentFeePlanModal
          student={selectedStudent}
          templates={templates}
          defaultYear={toDashYear(year)}
          onClose={() => setSelectedStudent(null)}
          onSaved={() => { setSelectedStudent(null); load(); }}
        />
      )}
    </div>
  );
}

function StudentFeePlanModal({ student, templates, onClose, onSaved, defaultYear }) {
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    academic_year: defaultYear || getCurrentYear(),
    template_id: '',
    sibling_discount_percent: 0,
    sibling_discount_type: 'percent',
    sibling_discount_amount: 0,
    scholarship_amount: 0,
    start_month: '',
    end_month: '',
    custom_discount_amount: 0,
    custom_discount_reason: '',
    custom_notes: '',
    custom_items: []
  });

  // Mois de l'année scolaire (ordre Sept → Août)
  const SCHOOL_MONTHS = [
    { v: 9, l: 'Septembre' }, { v: 10, l: 'Octobre' }, { v: 11, l: 'Novembre' },
    { v: 12, l: 'Décembre' }, { v: 1, l: 'Janvier' }, { v: 2, l: 'Février' },
    { v: 3, l: 'Mars' }, { v: 4, l: 'Avril' }, { v: 5, l: 'Mai' },
    { v: 6, l: 'Juin' }, { v: 7, l: 'Juillet' }, { v: 8, l: 'Août' },
  ];

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
          template_id: existing.template_id || '',
          sibling_discount_percent: existing.sibling_discount_percent || 0,
          sibling_discount_type: existing.sibling_discount_type || 'percent',
          sibling_discount_amount: existing.sibling_discount_amount || 0,
          scholarship_amount: existing.scholarship_amount || 0,
          start_month: existing.start_month || '',
          end_month: existing.end_month || '',
          custom_discount_amount: existing.custom_discount_amount || 0,
          custom_discount_reason: existing.custom_discount_reason || '',
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

  // Sélection d'un modèle : ses frais sont récupérés comme frais de l'élève
  // (modifiables). Le modèle reste mémorisé comme ÉTIQUETTE (template_id) pour
  // afficher quel modèle a été appliqué. On évite d'ajouter en double.
  const onSelectTemplate = (templateId) => {
    if (!templateId) { setForm({ ...form, template_id: '' }); return; }
    const existingKeys = new Set(form.custom_items.map(itemKey));
    const toAdd = templateItemsToCustom(templateId).filter(it => !existingKeys.has(itemKey(it)));
    if (toAdd.length === 0) {
      // Déjà présents : on met juste à jour l'étiquette du modèle appliqué.
      setForm({ ...form, template_id: templateId });
      return;
    }
    setForm({ ...form, template_id: templateId, custom_items: [...form.custom_items, ...toAdd] });
  };

  return (
    <Drawer open onClose={onClose} width="max-w-3xl" title="Plan de frais"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Annuler</Button>
          <Button color="green" icon={Save} onClick={save}>Enregistrer</Button>
        </>
      }>
        <p className="text-sm text-gray-500 -mt-1">{student.first_name} {student.last_name} · {student.classes?.name}</p>
        {loading ? <p className="text-gray-500">Chargement...</p> : (
          <div className="space-y-4">
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
                {form.template_id ? (
                  <p className="text-xs text-green-700 mt-1 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    Modèle appliqué : <strong>{templates.find(t => t.id === form.template_id)?.name || 'modèle'}</strong> — frais modifiables ci-dessous
                  </p>
                ) : (
                  <p className="text-xs text-gray-500 mt-1">Les frais du modèle sont ajoutés ci-dessous, modifiables par élève.</p>
                )}
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
                <p className="text-xs text-gray-500 mt-1">Répartie sur les mois facturés</p>
              </div>

              {/* Période de facturation propre à l'élève (entrée / sortie) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mois d'entrée</label>
                <select value={form.start_month} onChange={e => setForm({ ...form, start_month: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white">
                  <option value="">Début d'année (Sept.)</option>
                  {SCHOOL_MONTHS.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
                </select>
                <p className="text-xs text-gray-500 mt-1">Inscription en cours d'année : ne facture pas les mois avant l'entrée.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mois de sortie</label>
                <select value={form.end_month} onChange={e => setForm({ ...form, end_month: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white">
                  <option value="">Fin d'année (Juin/Août)</option>
                  {SCHOOL_MONTHS.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
                </select>
                <p className="text-xs text-gray-500 mt-1">Départ en cours d'année : arrête la facturation après ce mois.</p>
              </div>

              {/* Remise exceptionnelle libre (montant annuel + motif) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Remise exceptionnelle / année (MAD)</label>
                <input type="number" step="0.01" min="0" value={form.custom_discount_amount}
                  onChange={e => setForm({ ...form, custom_discount_amount: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
                <p className="text-xs text-gray-500 mt-1">Répartie sur les mois facturés</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Motif de la remise</label>
                <input type="text" value={form.custom_discount_reason}
                  onChange={e => setForm({ ...form, custom_discount_reason: e.target.value })}
                  placeholder="Ex : geste commercial, enfant du personnel…"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
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
    </Drawer>
  );
}
