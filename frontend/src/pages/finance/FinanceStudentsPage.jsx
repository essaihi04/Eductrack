import { useState, useEffect } from 'react';
import { Users, Search, RefreshCw, AlertCircle, CheckCircle2, XCircle, FileText, Plus, X, Save } from 'lucide-react';
import { financeApi, formatMAD, CATEGORY_LABELS, RECURRENCE_LABELS } from '../../lib/financeApi';
import { supabase } from '../../lib/supabase';

export default function FinanceStudentsPage() {
  const [students, setStudents] = useState([]);
  const [classes, setClasses] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ class_id: '', search: '' });
  const [selectedStudent, setSelectedStudent] = useState(null);

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
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/admin/classes`, {
        headers: { 'Authorization': `Bearer ${session?.access_token}` }
      });
      const data = await res.json();
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
                  <td className="px-4 py-3 font-medium">{s.first_name} {s.last_name}</td>
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
                    <button onClick={() => setSelectedStudent(s)}
                      className="px-3 py-1 text-xs bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100">
                      Plan de frais
                    </button>
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
        setForm({
          academic_year: existing.academic_year,
          template_id: existing.template_id || '',
          sibling_discount_percent: existing.sibling_discount_percent || 0,
          scholarship_amount: existing.scholarship_amount || 0,
          custom_notes: existing.custom_notes || '',
          custom_items: existing.custom_items || []
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Modèle de frais</label>
                <select value={form.template_id} onChange={e => setForm({ ...form, template_id: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg">
                  <option value="">Aucun (items personnalisés uniquement)</option>
                  {templates.filter(t => t.academic_year === form.academic_year).map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Réduction fratrie (%)</label>
                <input type="number" step="0.1" min="0" max="100" value={form.sibling_discount_percent}
                  onChange={e => setForm({ ...form, sibling_discount_percent: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
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
                <h3 className="font-semibold text-gray-800">Frais personnalisés (en plus du modèle)</h3>
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
