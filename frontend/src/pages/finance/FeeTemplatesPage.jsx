import { useState, useEffect } from 'react';
import { Plus, Trash2, Edit2, Copy, Save, X, Layers, Calendar, Users } from 'lucide-react';
import { financeApi, formatMAD, CATEGORY_LABELS, RECURRENCE_LABELS } from '../../lib/financeApi';
import { supabase } from '../../lib/supabase';

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
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [classes, setClasses] = useState([]);
  const [applyingTemplateId, setApplyingTemplateId] = useState(null);
  const [selectedClassIds, setSelectedClassIds] = useState([]);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    load();
    loadClasses();
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const data = await financeApi.listTemplates();
      setTemplates(data.templates || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const loadClasses = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/admin/classes`, {
        headers: { 'Authorization': `Bearer ${session?.access_token}` }
      });
      const data = await res.json();
      setClasses(Array.isArray(data) ? data : (data.classes || []));
    } catch (e) { console.error(e); }
  };

  const startNew = () => {
    setEditing({
      name: '',
      description: '',
      academic_year: currentYearStr(),
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
    setSelectedClassIds(matches.map(c => c.id)); // pré-cocher les classes correspondantes
  };

  const toggleClass = (classId) => {
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
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Layers className="w-6 h-6" /> Modèles de frais
          </h1>
          <p className="text-sm text-gray-500">Créez des modèles réutilisables puis appliquez-les aux classes</p>
        </div>
        <button onClick={startNew} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
          <Plus className="w-4 h-4" /> Nouveau modèle
        </button>
      </div>

      {loading && <p className="text-sm text-gray-500">Chargement...</p>}

      {!loading && templates.length === 0 && (
        <div className="text-center py-12 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
          <Layers className="w-12 h-12 mx-auto text-gray-400 mb-3" />
          <p className="text-gray-600">Aucun modèle de frais</p>
          <p className="text-sm text-gray-400 mt-1">Créez votre premier modèle pour commencer la facturation</p>
        </div>
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
                  const allSelected = classes.length > 0 && selectedClassIds.length === classes.length;
                  return (
                    <div className="mt-3 p-3 bg-blue-50 rounded-lg space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-gray-700">
                          {selectedClassIds.length} / {classes.length} classe(s) sélectionnée(s)
                        </span>
                        <button
                          onClick={() => setSelectedClassIds(allSelected ? [] : classes.map(c => c.id))}
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
                            {matches.map(c => (
                              <label key={c.id} className="flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-emerald-50 cursor-pointer border-b border-gray-50">
                                <input
                                  type="checkbox"
                                  checked={selectedClassIds.includes(c.id)}
                                  onChange={() => toggleClass(c.id)}
                                  className="rounded"
                                />
                                <span className="flex-1 truncate">{c.name}</span>
                                <span className="text-[10px] text-gray-500">{c.level || ''}{c.filiere ? ` · ${c.filiere}` : ''}</span>
                              </label>
                            ))}
                          </>
                        )}
                        {others.length > 0 && (
                          <>
                            <div className="px-2 py-1 text-[10px] uppercase font-semibold text-gray-500 bg-gray-50">
                              Autres classes
                            </div>
                            {others.map(c => (
                              <label key={c.id} className="flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-gray-50 cursor-pointer border-b border-gray-50">
                                <input
                                  type="checkbox"
                                  checked={selectedClassIds.includes(c.id)}
                                  onChange={() => toggleClass(c.id)}
                                  className="rounded"
                                />
                                <span className="flex-1 truncate">{c.name}</span>
                                <span className="text-[10px] text-gray-500">{c.level || ''}{c.filiere ? ` · ${c.filiere}` : ''}</span>
                              </label>
                            ))}
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

      {/* Modal de formulaire */}
      {showForm && editing && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">{editing.id ? 'Modifier' : 'Nouveau'} modèle</h2>
              <button onClick={() => setShowForm(false)} className="p-1 hover:bg-gray-100 rounded"><X className="w-5 h-5" /></button>
            </div>

            <div className="p-6 space-y-4">
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
                  {editing.items.map((it, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-start p-3 bg-gray-50 rounded-lg">
                      <select value={it.category} onChange={e => updateItem(idx, 'category', e.target.value)}
                        className="col-span-3 px-2 py-1.5 text-sm border border-gray-300 rounded">
                        {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                      <input type="text" value={it.name} onChange={e => updateItem(idx, 'name', e.target.value)}
                        placeholder="Nom du frais"
                        className="col-span-3 px-2 py-1.5 text-sm border border-gray-300 rounded" />
                      <input type="number" value={it.amount} onChange={e => updateItem(idx, 'amount', e.target.value)}
                        placeholder="Montant"
                        className="col-span-2 px-2 py-1.5 text-sm border border-gray-300 rounded" />
                      <select value={it.recurrence} onChange={e => updateItem(idx, 'recurrence', e.target.value)}
                        className="col-span-2 px-2 py-1.5 text-sm border border-gray-300 rounded">
                        {Object.entries(RECURRENCE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                      {(it.recurrence === 'one_time' || it.recurrence === 'annual') && (
                        <select value={it.due_month || ''} onChange={e => updateItem(idx, 'due_month', e.target.value ? Number(e.target.value) : null)}
                          className="col-span-1 px-1 py-1.5 text-sm border border-gray-300 rounded" title="Mois d'échéance">
                          <option value="">Mois</option>
                          {[9,10,11,12,1,2,3,4,5,6,7,8].map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                      )}
                      {it.recurrence === 'monthly' && (
                        <div className="col-span-1 flex gap-1">
                          <input type="number" value={it.start_month} onChange={e => updateItem(idx, 'start_month', Number(e.target.value))}
                            className="w-full px-1 py-1.5 text-xs border border-gray-300 rounded" title="Mois début" min="1" max="12" />
                          <input type="number" value={it.end_month} onChange={e => updateItem(idx, 'end_month', Number(e.target.value))}
                            className="w-full px-1 py-1.5 text-xs border border-gray-300 rounded" title="Mois fin" min="1" max="12" />
                        </div>
                      )}
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

            <div className="sticky bottom-0 bg-white border-t border-gray-200 px-6 py-4 flex justify-end gap-2">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">Annuler</button>
              <button onClick={save} disabled={!editing.name || !editing.academic_year}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                <Save className="w-4 h-4" /> Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
