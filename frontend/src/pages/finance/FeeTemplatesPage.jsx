import { useState, useEffect } from 'react';
import { Plus, Trash2, Edit2, Copy, Save, Layers, Calendar, Users, Check, Sparkles } from 'lucide-react';
import { financeApi, formatMAD, CATEGORY_LABELS, RECURRENCE_LABELS } from '../../lib/financeApi';
import { PageHeader, EmptyState, Drawer, Button } from '../../components/finance/ui';
import { useYear } from '../../contexts/YearContext';
import { toDashYear } from '../../lib/schoolYear';

// Mois de l'année scolaire (sept → août) pour les sélecteurs de période.
const SCHOOL_MONTHS = [
  { v: 9, l: 'Sep' }, { v: 10, l: 'Oct' }, { v: 11, l: 'Nov' }, { v: 12, l: 'Déc' },
  { v: 1, l: 'Jan' }, { v: 2, l: 'Fév' }, { v: 3, l: 'Mar' }, { v: 4, l: 'Avr' },
  { v: 5, l: 'Mai' }, { v: 6, l: 'Juin' }, { v: 7, l: 'Juil' }, { v: 8, l: 'Août' },
];

const defaultItem = () => ({
  category: 'tuition',
  name: '',
  amount: 0,
  recurrence: 'monthly',
  due_month: null,
  start_month: 9,
  end_month: 6,
  is_optional: false
});

const currentYearStr = () => {
  const y = new Date().getFullYear();
  const m = new Date().getMonth();
  return m >= 7 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
};

export default function FeeTemplatesPage() {
  const { year } = useYear();
  const dashYear = toDashYear(year);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [classes, setClasses] = useState([]);
  const [applyingTemplateId, setApplyingTemplateId] = useState(null);
  const [selectedClassIds, setSelectedClassIds] = useState([]);
  const [applying, setApplying] = useState(false);
  const [assignments, setAssignments] = useState({}); // class_id -> [{template_id, template_name, count}]

  useEffect(() => {
    load();
    loadClasses();
    loadAssignments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year]);

  const load = async () => {
    setLoading(true);
    try {
      const data = await financeApi.listTemplates();
      // N'afficher que les modèles de l'année active.
      setTemplates((data.templates || []).filter(t => !t.academic_year || t.academic_year === dashYear));
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const loadClasses = async () => {
    try {
      const data = await financeApi.listClasses(year);
      setClasses(Array.isArray(data) ? data : (data.classes || []));
    } catch (e) { console.error(e); }
  };

  const loadAssignments = async () => {
    try {
      // Les plans/modèles sont stockés en année « tiret » (2025-2026) : utiliser
      // dashYear, sinon le format slash ne remonte aucune assignation.
      const data = await financeApi.getClassAssignments(dashYear);
      const map = {};
      (data.assignments || []).forEach(a => { map[a.class_id] = a.templates || []; });
      setAssignments(map);
    } catch (e) { console.error(e); }
  };

  // Modèle (différent de celui en cours d'application) couvrant déjà cette classe.
  const assignedOtherTemplate = (classId, currentTemplateId) => {
    const tpls = assignments[classId] || [];
    return tpls.find(t => t.template_id !== currentTemplateId) || null;
  };

  const startNew = () => {
    setEditing({
      name: '',
      description: '',
      academic_year: dashYear,
      level: '',
      school_type: '',
      items: [defaultItem()]
    });
    setShowForm(true);
  };

  const startEdit = (t) => {
    setEditing({
      ...t,
      items: (t.fee_template_items || []).sort((a, b) => a.sort_order - b.sort_order).map(it => ({ ...it }))
    });
    setShowForm(true);
  };

  const duplicate = (t) => {
    setEditing({
      ...t,
      id: undefined,
      name: `${t.name} (copie)`,
      items: (t.fee_template_items || []).map(it => ({ ...it, id: undefined }))
    });
    setShowForm(true);
  };

  const save = async () => {
    try {
      const payload = {
        name: editing.name,
        description: editing.description,
        academic_year: editing.academic_year,
        level: editing.level || null,
        school_type: editing.school_type || null,
        items: editing.items
      };
      if (editing.id) await financeApi.updateTemplate(editing.id, payload);
      else await financeApi.createTemplate(payload);
      setShowForm(false);
      setEditing(null);
      load();
    } catch (e) {
      alert('Erreur: ' + e.message);
    }
  };

  const remove = async (id) => {
    if (!confirm('Supprimer ce modèle ?')) return;
    try {
      await financeApi.deleteTemplate(id);
      load();
    } catch (e) { alert('Erreur: ' + e.message); }
  };

  const addItem = () => setEditing({ ...editing, items: [...editing.items, defaultItem()] });
  const removeItem = (idx) => setEditing({ ...editing, items: editing.items.filter((_, i) => i !== idx) });
  const updateItem = (idx, field, value) => {
    const items = [...editing.items];
    items[idx] = { ...items[idx], [field]: value };
    setEditing({ ...editing, items });
  };

  const normalize = (s) => String(s || '').toLowerCase().trim();

  const classMatchesTemplate = (cls, t) => {
    if (!t) return false;
    const lvl = normalize(t.level);
    const typ = normalize(t.school_type);
    const clsLvl = normalize(cls.level);
    const clsTyp = normalize(cls.school_type);
    if (lvl && clsLvl && (clsLvl === lvl || clsLvl.includes(lvl) || lvl.includes(clsLvl))) return true;
    if (typ && clsTyp && clsTyp === typ) return true;
    return false;
  };

  const sortedClassesFor = (t) => {
    const matches = classes.filter(c => classMatchesTemplate(c, t));
    const others = classes.filter(c => !classMatchesTemplate(c, t));
    const byName = (a, b) => String(a.name).localeCompare(String(b.name));
    return { matches: matches.sort(byName), others: others.sort(byName) };
  };

  const openApply = (templateId) => {
    const t = templates.find(x => x.id === templateId);
    const { matches } = sortedClassesFor(t);
    setApplyingTemplateId(templateId);
    // Pré-cocher les classes correspondantes SAUF celles déjà dans un autre modèle.
    setSelectedClassIds(matches.filter(c => !assignedOtherTemplate(c.id, templateId)).map(c => c.id));
  };

  const toggleClass = (classId) => {
    if (assignedOtherTemplate(classId, applyingTemplateId)) return; // verrouillée
    setSelectedClassIds(prev => prev.includes(classId) ? prev.filter(x => x !== classId) : [...prev, classId]);
  };

  const applyToSelected = async (templateId) => {
    if (selectedClassIds.length === 0) {
      alert('Sélectionnez au moins une classe');
      return;
    }
    setApplying(true);
    try {
      const t = templates.find(x => x.id === templateId);
      const res = await financeApi.applyTemplateToClasses(templateId, {
        class_ids: selectedClassIds,
        academic_year: t.academic_year
      });
      alert(`${res.created_count} plan(s) créé(s), ${res.skipped_count} ignoré(s) sur ${selectedClassIds.length} classe(s)`);
      setApplyingTemplateId(null);
      setSelectedClassIds([]);
      loadAssignments(); // rafraîchir les classes désormais assignées
    } catch (e) { alert('Erreur: ' + e.message); }
    finally { setApplying(false); }
  };

  const computeTotal = (items) => {
    let total = 0;
    for (const it of items || []) {
      const amt = Number(it.amount || 0);
      if (it.recurrence === 'monthly') {
        const sm = it.start_month || 9;
        const em = it.end_month || 6;
        const months = sm <= em ? (em - sm + 1) : ((12 - sm + 1) + em);
        total += amt * months;
      } else if (it.recurrence === 'quarterly') {
        total += amt * 4;
      } else {
        total += amt;
      }
    }
    return total;
  };

  return (
    <div className="p-6 space-y-5">
      <PageHeader icon={Layers} title="Modèles de frais" color="green"
        subtitle="Créez des modèles réutilisables puis appliquez-les aux classes"
        actions={<Button color="green" icon={Plus} onClick={startNew}>Nouveau modèle</Button>} />

      {loading && <p className="text-sm text-gray-500">Chargement...</p>}

      {!loading && templates.length === 0 && (
        <EmptyState icon={Layers} title="Aucun modèle de frais"
          hint="Créez votre premier modèle pour commencer la facturation"
          action={<Button color="green" icon={Plus} onClick={startNew}>Nouveau modèle</Button>} />
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {templates.map(t => {
          const total = computeTotal(t.fee_template_items);
          return (
            <div key={t.id} className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-800 truncate">{t.name}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    <Calendar className="inline w-3 h-3 mr-1" /> {t.academic_year}
                    {t.level && ` · ${t.level}`}
                  </p>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => duplicate(t)} className="p-1.5 hover:bg-gray-100 rounded" title="Dupliquer">
                    <Copy className="w-4 h-4 text-gray-500" />
                  </button>
                  <button onClick={() => startEdit(t)} className="p-1.5 hover:bg-gray-100 rounded" title="Modifier">
                    <Edit2 className="w-4 h-4 text-gray-500" />
                  </button>
                  <button onClick={() => remove(t.id)} className="p-1.5 hover:bg-red-50 rounded" title="Supprimer">
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </button>
                </div>
              </div>
              {t.description && <p className="text-sm text-gray-600 mt-2">{t.description}</p>}

              <div className="mt-3 pt-3 border-t border-gray-100">
                <p className="text-xs text-gray-500 mb-2">{(t.fee_template_items || []).length} item(s)</p>
                <div className="space-y-1">
                  {(t.fee_template_items || []).slice(0, 4).map(it => (
                    <div key={it.id} className="flex items-center justify-between text-xs">
                      <span className="text-gray-600 truncate">{it.name}</span>
                      <span className="text-gray-500 whitespace-nowrap ml-2">
                        {formatMAD(it.amount)} {it.recurrence === 'monthly' ? '/mois' : ''}
                      </span>
                    </div>
                  ))}
                  {(t.fee_template_items || []).length > 4 && (
                    <p className="text-xs text-gray-400">+ {t.fee_template_items.length - 4} autres</p>
                  )}
                </div>
              </div>

              <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-700">Total annuel estimé</span>
                <span className="text-sm font-bold text-blue-600">{formatMAD(total)}</span>
              </div>

              {applyingTemplateId === t.id ? (
                (() => {
                  const { matches, others } = sortedClassesFor(t);
                  const selectableIds = classes.filter(c => !assignedOtherTemplate(c.id, t.id)).map(c => c.id);
                  const allSelected = selectableIds.length > 0 && selectedClassIds.length === selectableIds.length;
                  // Rendu d'une ligne classe : grisée + verrouillée si déjà dans un autre modèle.
                  const classRow = (c, hover) => {
                    const locked = assignedOtherTemplate(c.id, t.id);
                    if (locked) {
                      return (
                        <div key={c.id} className="flex items-start gap-2 px-2 py-1.5 text-sm bg-gray-50 border-b border-gray-50 opacity-70 cursor-not-allowed"
                          title={`Déjà appliquée par le modèle « ${locked.template_name} »`}>
                          <input type="checkbox" checked={false} disabled readOnly className="rounded mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <span className="truncate text-gray-400 line-through">{c.name}</span>
                            <p className="text-[10px] text-amber-700 mt-0.5">
                              Déjà dans « {locked.template_name} ». Retirez-la de ce modèle pour pouvoir l'ajouter ici.
                            </p>
                          </div>
                          <span className="text-[10px] text-gray-400 whitespace-nowrap">{c.level || ''}{c.filiere ? ` · ${c.filiere}` : ''}</span>
                        </div>
                      );
                    }
                    return (
                      <label key={c.id} className={`flex items-center gap-2 px-2 py-1.5 text-sm ${hover} cursor-pointer border-b border-gray-50`}>
                        <input
                          type="checkbox"
                          checked={selectedClassIds.includes(c.id)}
                          onChange={() => toggleClass(c.id)}
                          className="rounded"
                        />
                        <span className="flex-1 truncate">{c.name}</span>
                        <span className="text-[10px] text-gray-500">{c.level || ''}{c.filiere ? ` · ${c.filiere}` : ''}</span>
                      </label>
                    );
                  };
                  return (
                    <div className="mt-3 p-3 bg-blue-50 rounded-lg space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-gray-700">
                          {selectedClassIds.length} / {selectableIds.length} classe(s) sélectionnée(s)
                        </span>
                        <button
                          onClick={() => setSelectedClassIds(allSelected ? [] : selectableIds)}
                          className="text-blue-700 hover:underline"
                        >
                          {allSelected ? 'Tout désélectionner' : 'Tout sélectionner'}
                        </button>
                      </div>

                      {classes.length === 0 && (
                        <p className="text-xs text-gray-500 italic">Aucune classe disponible. Créez-en dans Admin → Classes.</p>
                      )}

                      <div className="max-h-60 overflow-y-auto border border-blue-100 rounded bg-white">
                        {matches.length > 0 && (
                          <>
                            <div className="px-2 py-1 text-[10px] uppercase font-semibold text-emerald-700 bg-emerald-50 flex items-center gap-1">
                              <Sparkles className="w-3 h-3" /> Correspondance niveau/type
                            </div>
                            {matches.map(c => classRow(c, 'hover:bg-emerald-50'))}
                          </>
                        )}
                        {others.length > 0 && (
                          <>
                            <div className="px-2 py-1 text-[10px] uppercase font-semibold text-gray-500 bg-gray-50">
                              Autres classes
                            </div>
                            {others.map(c => classRow(c, 'hover:bg-gray-50'))}
                          </>
                        )}
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={() => applyToSelected(t.id)}
                          disabled={applying || selectedClassIds.length === 0}
                          className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                        >
                          <Check className="w-4 h-4" /> {applying ? 'Application...' : `Appliquer (${selectedClassIds.length})`}
                        </button>
                        <button
                          onClick={() => { setApplyingTemplateId(null); setSelectedClassIds([]); }}
                          className="px-3 py-1.5 text-sm text-gray-600 hover:bg-white rounded"
                        >
                          Annuler
                        </button>
                      </div>
                    </div>
                  );
                })()
              ) : (
                <button
                  onClick={() => openApply(t.id)}
                  className="mt-3 w-full flex items-center justify-center gap-2 px-3 py-2 text-sm bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100"
                >
                  <Users className="w-4 h-4" /> Appliquer à des classes
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Formulaire (tiroir latéral large) */}
      {showForm && editing && (
        <Drawer open={showForm} onClose={() => setShowForm(false)} width="max-w-3xl"
          title={`${editing.id ? 'Modifier' : 'Nouveau'} modèle`}
          footer={
            <>
              <Button variant="secondary" onClick={() => setShowForm(false)}>Annuler</Button>
              <Button color="green" icon={Save} onClick={save} disabled={!editing.name || !editing.academic_year}>Enregistrer</Button>
            </>
          }>
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nom *</label>
                  <input type="text" value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })}
                    placeholder="Ex: Scolarité Primaire CP"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Année scolaire *</label>
                  <input type="text" value={editing.academic_year} onChange={e => setEditing({ ...editing, academic_year: e.target.value })}
                    placeholder="2025-2026"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Niveau (optionnel)</label>
                  <input type="text" value={editing.level || ''} onChange={e => setEditing({ ...editing, level: e.target.value })}
                    placeholder="Ex: CP, 6ème, Terminale"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Type d'école (optionnel)</label>
                  <input type="text" value={editing.school_type || ''} onChange={e => setEditing({ ...editing, school_type: e.target.value })}
                    placeholder="Ex: primaire, collège"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea value={editing.description || ''} onChange={e => setEditing({ ...editing, description: e.target.value })}
                  rows="2" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
              </div>

              <div className="border-t border-gray-200 pt-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-gray-800">Frais inclus</h3>
                  <button onClick={addItem} className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100">
                    <Plus className="w-4 h-4" /> Ajouter
                  </button>
                </div>

                <div className="space-y-2">
                  {/* En-têtes de colonnes */}
                  <div className="grid grid-cols-12 gap-2 px-3 text-xs font-medium text-gray-500">
                    <span className="col-span-3">Service</span>
                    <span className="col-span-2">Nom du frais</span>
                    <span className="col-span-2">Montant</span>
                    <span className="col-span-2">Récurrence</span>
                    <span className="col-span-2">Période</span>
                    <span className="col-span-1" />
                  </div>
                  {editing.items.map((it, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-center p-3 bg-gray-50 rounded-lg">
                      <select value={it.category} onChange={e => updateItem(idx, 'category', e.target.value)}
                        className="col-span-3 px-2 py-1.5 text-sm border border-gray-300 rounded">
                        {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                      <input type="text" value={it.name} onChange={e => updateItem(idx, 'name', e.target.value)}
                        placeholder="Nom du frais"
                        className="col-span-2 px-2 py-1.5 text-sm border border-gray-300 rounded" />
                      <input type="number" value={it.amount} onChange={e => updateItem(idx, 'amount', e.target.value)}
                        placeholder="Montant"
                        className="col-span-2 px-2 py-1.5 text-sm border border-gray-300 rounded" />
                      <select value={it.recurrence} onChange={e => updateItem(idx, 'recurrence', e.target.value)}
                        className="col-span-2 px-2 py-1.5 text-sm border border-gray-300 rounded">
                        {Object.entries(RECURRENCE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                      {/* Période — toujours col-span-2 pour garder l'alignement */}
                      <div className="col-span-2">
                        {it.recurrence === 'monthly' ? (
                          <div className="flex items-center gap-1">
                            <select value={it.start_month || 9} onChange={e => updateItem(idx, 'start_month', Number(e.target.value))}
                              className="w-full px-1 py-1.5 text-sm border border-gray-300 rounded" title="Mois de début">
                              {SCHOOL_MONTHS.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
                            </select>
                            <span className="text-gray-400 text-xs">→</span>
                            <select value={it.end_month || 6} onChange={e => updateItem(idx, 'end_month', Number(e.target.value))}
                              className="w-full px-1 py-1.5 text-sm border border-gray-300 rounded" title="Mois de fin">
                              {SCHOOL_MONTHS.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
                            </select>
                          </div>
                        ) : (it.recurrence === 'one_time' || it.recurrence === 'annual') ? (
                          <select value={it.due_month || ''} onChange={e => updateItem(idx, 'due_month', e.target.value ? Number(e.target.value) : null)}
                            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded" title="Mois d'échéance">
                            <option value="">Mois d'échéance</option>
                            {SCHOOL_MONTHS.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
                          </select>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </div>
                      <button onClick={() => removeItem(idx)} className="col-span-1 flex items-center justify-center p-1.5 hover:bg-red-100 rounded">
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="mt-3 p-3 bg-blue-50 rounded-lg flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">Total annuel estimé</span>
                  <span className="text-lg font-bold text-blue-700">{formatMAD(computeTotal(editing.items))}</span>
                </div>
              </div>
            </div>
        </Drawer>
      )}
    </div>
  );
}
