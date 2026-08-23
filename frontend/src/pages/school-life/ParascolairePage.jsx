import { useState, useEffect } from 'react';
import { motion as Motion } from 'framer-motion';
import { Sparkles, Plus, Trash2, MapPin, Calendar, Send, X, Tag } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useYear } from '../../contexts/YearContext';
import { schoolLifeApi, fetchClasses, mediaUrl } from '../../lib/schoolLifeApi';
import { useI18n } from '../../i18n';

const CATEGORIES = [
  { value: 'club', label: 'Club' },
  { value: 'sortie', label: 'Sortie' },
  { value: 'evenement', label: 'Événement' },
  { value: 'atelier', label: 'Atelier' },
  { value: 'activite', label: 'Activité' },
];
const catLabel = (v, t) => t(`slife.activities.cat.${v}`) || CATEGORIES.find((c) => c.value === v)?.label || v;

const ParascolairePage = () => {
  const { profile } = useAuth();
  const { t, lang } = useI18n();
  const { year } = useYear();
  const canManage = ['admin', 'school_admin', 'pedagogical_director', 'pedagogical_manager', 'teacher'].includes(profile?.role);
  const isAdmin = ['admin', 'school_admin', 'pedagogical_director', 'pedagogical_manager'].includes(profile?.role);
  const canDelete = (ownerId) => isAdmin || (ownerId && ownerId === profile?.id);

  const [items, setItems] = useState([]);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', category: 'activite', location: '', start_date: '', end_date: '', class_id: '', capacity: '', notify: true });
  const [photo, setPhoto] = useState(null);

  const load = async () => {
    setLoading(true);
    try { setItems(await schoolLifeApi.listActivities()); } catch (e) { console.error(e); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (!canManage) return;
    fetchClasses(year).then((rows) => {
      setClasses(rows);
      setForm((current) => rows.some((cls) => cls.id === current.class_id)
        ? current
        : { ...current, class_id: '' });
    });
  }, [canManage, year]);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await schoolLifeApi.createActivity({ fields: { ...form, notify: form.notify ? 'true' : 'false' }, photo });
      setForm({ title: '', description: '', category: 'activite', location: '', start_date: '', end_date: '', class_id: '', capacity: '', notify: true });
      setPhoto(null);
      setShowForm(false);
      await load();
    } catch (e) { alert(e.message); }
    setSaving(false);
  };

  const remove = async (id) => {
    if (!confirm('Supprimer cette activité ?')) return;
    try { await schoolLifeApi.deleteActivity(id); await load(); } catch (e) { alert(e.message); }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Sparkles className="w-7 h-7 text-primary" /> {t('slife.activities.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('slife.activities.subtitle')}</p>
        </div>
        {canManage && (
          <button onClick={() => setShowForm((s) => !s)} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg">
            {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />} {showForm ? 'Annuler' : 'Nouvelle'}
          </button>
        )}
      </div>

      {showForm && canManage && (
        <form onSubmit={submit} className="bg-card border border-border rounded-xl p-4 mb-6 space-y-3">
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Titre" required className="w-full border border-border rounded-lg px-3 py-2 bg-background" />
          <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Description" rows={3} className="w-full border border-border rounded-lg px-3 py-2 bg-background" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="border border-border rounded-lg px-3 py-2 bg-background">
              {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
            <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Lieu" className="border border-border rounded-lg px-3 py-2 bg-background" />
            <input type="datetime-local" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} className="border border-border rounded-lg px-3 py-2 bg-background" />
            <input type="datetime-local" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} className="border border-border rounded-lg px-3 py-2 bg-background" />
            <select value={form.class_id} onChange={(e) => setForm({ ...form, class_id: e.target.value })} className="border border-border rounded-lg px-3 py-2 bg-background">
              <option value="">Toutes les classes</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <input type="number" min="0" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} placeholder="Places (optionnel)" className="border border-border rounded-lg px-3 py-2 bg-background" />
          </div>
          <input type="file" accept="image/*" onChange={(e) => setPhoto(e.target.files[0])} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.notify} onChange={(e) => setForm({ ...form, notify: e.target.checked })} />
            <Send className="w-4 h-4" /> Notifier les parents (WhatsApp + app)
          </label>
          <button disabled={saving} className="bg-primary text-primary-foreground px-4 py-2 rounded-lg w-full">{saving ? 'Enregistrement...' : 'Créer'}</button>
        </form>
      )}

      {loading ? (
        <p className="text-muted-foreground">{t('common.loading')}</p>
      ) : items.length === 0 ? (
        <p className="text-muted-foreground text-center py-10">{t('slife.activities.empty')}</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {items.map((a) => (
            <Motion.div key={a.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="bg-card border border-border rounded-xl overflow-hidden">
              {a.photo_url && <img src={mediaUrl(a.photo_url)} alt="" className="w-full h-40 object-cover" />}
              <div className="p-4">
                <div className="flex items-start justify-between">
                  <h3 className="font-semibold">{a.title}</h3>
                  {canDelete(a.created_by) && <button onClick={() => remove(a.id)} className="text-destructive p-1"><Trash2 className="w-4 h-4" /></button>}
                </div>
                <span className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full mt-1"><Tag className="w-3 h-3" /> {catLabel(a.category, t)}</span>
                {a.description && <p className="text-sm mt-2">{a.description}</p>}
                <div className="text-xs text-muted-foreground mt-2 space-y-1">
                  {a.location && <p className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {a.location}</p>}
                  {a.start_date && <p className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {new Date(a.start_date).toLocaleString(lang === 'ar' ? 'ar-MA' : 'fr-FR')}</p>}
                  {a.classes?.name && <p>{t('slife.class')} : {a.classes.name}</p>}
                </div>
              </div>
            </Motion.div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ParascolairePage;
