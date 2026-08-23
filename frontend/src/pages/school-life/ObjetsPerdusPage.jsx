import { useCallback, useState, useEffect } from 'react';
import { motion as Motion } from 'framer-motion';
import { Search, Plus, Trash2, MapPin, X, Send } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useI18n } from '../../i18n';
import { schoolLifeApi, mediaUrl } from '../../lib/schoolLifeApi';

const STATUS = {
  trouve: { labelKey: 'slife.lost.trouve', cls: 'bg-blue-100 text-blue-700' },
  reclame: { labelKey: 'slife.lost.reclame', cls: 'bg-amber-100 text-amber-700' },
  rendu: { labelKey: 'slife.lost.rendu', cls: 'bg-green-100 text-green-700' },
};

const ObjetsPerdusPage = () => {
  const { profile } = useAuth();
  const { t } = useI18n();
  const canManage = ['admin', 'school_admin', 'pedagogical_director', 'pedagogical_manager', 'teacher'].includes(profile?.role);
  const isAdmin = ['admin', 'school_admin', 'pedagogical_director', 'pedagogical_manager'].includes(profile?.role);
  const canDelete = (ownerId) => isAdmin || (ownerId && ownerId === profile?.id);

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', location_found: '', found_date: '' });
  const [photo, setPhoto] = useState(null);
  const [notify, setNotify] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setItems(await schoolLifeApi.listLostItems(filter)); } catch (e) { console.error(e); }
    setLoading(false);
  }, [filter]);
  useEffect(() => { load(); }, [load]);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await schoolLifeApi.createLostItem({ fields: { ...form, notify }, photo });
      setForm({ title: '', description: '', location_found: '', found_date: '' });
      setPhoto(null); setNotify(false); setShowForm(false); await load();
    } catch (e) { alert(e.message); }
    setSaving(false);
  };

  const setStatus = async (id, status) => {
    try { await schoolLifeApi.updateLostItem(id, { status }); await load(); } catch (e) { alert(e.message); }
  };
  const remove = async (id) => {
    if (!confirm('Supprimer ?')) return;
    try { await schoolLifeApi.deleteLostItem(id); await load(); } catch (e) { alert(e.message); }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Search className="w-7 h-7 text-primary" /> {t('slife.lost.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('slife.lost.subtitle')}</p>
        </div>
        {canManage && (
          <button onClick={() => setShowForm((s) => !s)} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg">
            {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />} {showForm ? 'Annuler' : 'Ajouter'}
          </button>
        )}
      </div>

      {(items.length > 0 || filter) && <div className="flex gap-2 mb-4">
        {['', 'trouve', 'reclame', 'rendu'].map((s) => (
          <button key={s} onClick={() => setFilter(s)} className={`px-3 py-1 rounded-full text-sm ${filter === s ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
            {t(s === '' ? 'slife.lost.all' : STATUS[s].labelKey)}
          </button>
        ))}
      </div>}

      {showForm && canManage && (
        <form onSubmit={submit} className="bg-card border border-border rounded-xl p-4 mb-6 space-y-3">
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Objet (ex: Veste bleue)" required className="w-full border border-border rounded-lg px-3 py-2 bg-background" />
          <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Description" rows={2} className="w-full border border-border rounded-lg px-3 py-2 bg-background" />
          <div className="grid grid-cols-2 gap-3">
            <input value={form.location_found} onChange={(e) => setForm({ ...form, location_found: e.target.value })} placeholder="Lieu trouvé" className="border border-border rounded-lg px-3 py-2 bg-background" />
            <input type="date" value={form.found_date} onChange={(e) => setForm({ ...form, found_date: e.target.value })} className="border border-border rounded-lg px-3 py-2 bg-background" />
          </div>
          <input type="file" accept="image/*" onChange={(e) => setPhoto(e.target.files[0])} />
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="w-4 h-4" />
            <Send className="w-4 h-4 text-primary" /> Prévenir les parents par WhatsApp
          </label>
          <button disabled={saving} className="bg-primary text-primary-foreground px-4 py-2 rounded-lg w-full">{saving ? '...' : 'Ajouter'}</button>
        </form>
      )}

      {loading ? (
        <p className="text-muted-foreground">{t('common.loading')}</p>
      ) : items.length === 0 ? (
        <p className="text-muted-foreground text-center py-10">{t('slife.lost.empty')}</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {items.map((it) => (
            <Motion.div key={it.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-card border border-border rounded-xl overflow-hidden">
              {it.photo_url ? <img src={mediaUrl(it.photo_url)} alt="" className="w-full h-32 object-cover" /> : <div className="w-full h-32 bg-muted flex items-center justify-center"><Search className="w-8 h-8 text-muted-foreground" /></div>}
              <div className="p-3">
                <div className="flex items-center justify-between">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS[it.status]?.cls}`}>{t(STATUS[it.status]?.labelKey || 'slife.lost.trouve')}</span>
                  {canDelete(it.reported_by) && <button onClick={() => remove(it.id)} className="text-destructive"><Trash2 className="w-4 h-4" /></button>}
                </div>
                <h3 className="font-semibold text-sm mt-1">{it.title}</h3>
                {it.description && <p className="text-xs text-muted-foreground">{it.description}</p>}
                {it.location_found && <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1"><MapPin className="w-3 h-3" /> {it.location_found}</p>}
                {canManage && (
                  <select value={it.status} onChange={(e) => setStatus(it.id, e.target.value)} className="mt-2 w-full text-xs border border-border rounded px-2 py-1 bg-background">
                    <option value="trouve">{t('slife.lost.trouve')}</option>
                    <option value="reclame">{t('slife.lost.reclame')}</option>
                    <option value="rendu">{t('slife.lost.rendu')}</option>
                  </select>
                )}
              </div>
            </Motion.div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ObjetsPerdusPage;
