import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, Plus, Trash2, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { schoolLifeApi, fetchClasses } from '../../lib/schoolLifeApi';

const CATEGORIES = [
  { value: 'pedagogique', label: 'Pédagogique' },
  { value: 'discipline', label: 'Discipline' },
  { value: 'materiel', label: 'Matériel' },
  { value: 'securite', label: 'Sécurité' },
  { value: 'sante', label: 'Santé' },
  { value: 'autre', label: 'Autre' },
];
const PRIORITIES = [
  { value: 'basse', label: 'Basse', cls: 'bg-gray-100 text-gray-700' },
  { value: 'normale', label: 'Normale', cls: 'bg-blue-100 text-blue-700' },
  { value: 'haute', label: 'Haute', cls: 'bg-amber-100 text-amber-700' },
  { value: 'urgente', label: 'Urgente', cls: 'bg-red-100 text-red-700' },
];
const STATUS = {
  ouvert: { label: 'Ouvert', cls: 'bg-red-100 text-red-700' },
  en_cours: { label: 'En cours', cls: 'bg-amber-100 text-amber-700' },
  resolu: { label: 'Résolu', cls: 'bg-green-100 text-green-700' },
  ferme: { label: 'Fermé', cls: 'bg-gray-100 text-gray-700' },
};
const lbl = (arr, v) => arr.find((x) => x.value === v) || {};

const SignalementsPage = () => {
  const { profile } = useAuth();
  const [items, setItems] = useState([]);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ category: 'pedagogique', title: '', description: '', priority: 'normale', class_id: '' });

  const load = async () => {
    setLoading(true);
    try { setItems(await schoolLifeApi.listIssues(filter)); } catch (e) { console.error(e); }
    setLoading(false);
  };
  useEffect(() => { load(); }, [filter]);
  useEffect(() => { fetchClasses().then(setClasses); }, []);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await schoolLifeApi.createIssue({ ...form, class_id: form.class_id || null });
      setForm({ category: 'pedagogique', title: '', description: '', priority: 'normale', class_id: '' });
      setShowForm(false); await load();
    } catch (e) { alert(e.message); }
    setSaving(false);
  };
  const setStatus = async (id, status) => { try { await schoolLifeApi.updateIssue(id, { status }); await load(); } catch (e) { alert(e.message); } };
  const remove = async (id) => { if (!confirm('Supprimer ?')) return; try { await schoolLifeApi.deleteIssue(id); await load(); } catch (e) { alert(e.message); } };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><AlertTriangle className="w-7 h-7 text-primary" /> Signalements</h1>
          <p className="text-sm text-muted-foreground">Signaler et suivre les problèmes</p>
        </div>
        <button onClick={() => setShowForm((s) => !s)} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg">
          {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />} {showForm ? 'Annuler' : 'Signaler'}
        </button>
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        {['', 'ouvert', 'en_cours', 'resolu', 'ferme'].map((s) => (
          <button key={s} onClick={() => setFilter(s)} className={`px-3 py-1 rounded-full text-sm ${filter === s ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
            {s === '' ? 'Tous' : STATUS[s].label}
          </button>
        ))}
      </div>

      {showForm && (
        <form onSubmit={submit} className="bg-card border border-border rounded-xl p-4 mb-6 space-y-3">
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Titre du problème" required className="w-full border border-border rounded-lg px-3 py-2 bg-background" />
          <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Détails" rows={3} className="w-full border border-border rounded-lg px-3 py-2 bg-background" />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="border border-border rounded-lg px-3 py-2 bg-background">
              {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
            <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className="border border-border rounded-lg px-3 py-2 bg-background">
              {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
            <select value={form.class_id} onChange={(e) => setForm({ ...form, class_id: e.target.value })} className="border border-border rounded-lg px-3 py-2 bg-background">
              <option value="">Aucune classe</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <button disabled={saving} className="bg-primary text-primary-foreground px-4 py-2 rounded-lg w-full">{saving ? '...' : 'Envoyer le signalement'}</button>
        </form>
      )}

      {loading ? (
        <p className="text-muted-foreground">Chargement...</p>
      ) : items.length === 0 ? (
        <p className="text-muted-foreground text-center py-10">Aucun signalement.</p>
      ) : (
        <div className="space-y-3">
          {items.map((it) => (
            <motion.div key={it.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold">{it.title}</h3>
                  <div className="flex gap-2 mt-1 flex-wrap">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS[it.status]?.cls}`}>{STATUS[it.status]?.label}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${lbl(PRIORITIES, it.priority).cls}`}>{lbl(PRIORITIES, it.priority).label}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-muted">{lbl(CATEGORIES, it.category).label}</span>
                  </div>
                </div>
                <button onClick={() => remove(it.id)} className="text-destructive"><Trash2 className="w-4 h-4" /></button>
              </div>
              {it.description && <p className="text-sm mt-2">{it.description}</p>}
              <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
                <span>{it.reporter ? `${it.reporter.first_name || ''} ${it.reporter.last_name || ''}` : ''} {it.classes?.name ? `· ${it.classes.name}` : ''}</span>
                <select value={it.status} onChange={(e) => setStatus(it.id, e.target.value)} className="text-xs border border-border rounded px-2 py-1 bg-background">
                  <option value="ouvert">Ouvert</option>
                  <option value="en_cours">En cours</option>
                  <option value="resolu">Résolu</option>
                  <option value="ferme">Fermé</option>
                </select>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
};

export default SignalementsPage;
