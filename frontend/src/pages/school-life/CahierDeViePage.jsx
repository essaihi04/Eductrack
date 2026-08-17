import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Image as ImageIcon, Plus, Trash2, Calendar, Send, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useYear } from '../../contexts/YearContext';
import { schoolLifeApi, fetchClasses, mediaUrl } from '../../lib/schoolLifeApi';

const CahierDeViePage = () => {
  const { profile } = useAuth();
  const { year } = useYear();
  const canManage = ['admin', 'school_admin', 'pedagogical_director', 'pedagogical_manager', 'teacher'].includes(profile?.role);
  const isAdmin = ['admin', 'school_admin', 'pedagogical_director', 'pedagogical_manager'].includes(profile?.role);
  const canDelete = (ownerId) => isAdmin || (ownerId && ownerId === profile?.id);

  const [posts, setPosts] = useState([]);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: '', content: '', class_id: '', activity_date: '', notify: true });
  const [files, setFiles] = useState([]);

  const load = async () => {
    setLoading(true);
    try {
      const data = await schoolLifeApi.listFeed();
      setPosts(Array.isArray(data) ? data : []);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);
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
    if (!form.class_id) return alert('Sélectionnez une classe');
    setSaving(true);
    try {
      await schoolLifeApi.createFeedPost({
        fields: { ...form, notify: form.notify ? 'true' : 'false' },
        photos: files,
      });
      setForm({ title: '', content: '', class_id: '', activity_date: '', notify: true });
      setFiles([]);
      setShowForm(false);
      await load();
    } catch (e) { alert(e.message); }
    setSaving(false);
  };

  const remove = async (id) => {
    if (!confirm('Supprimer cette publication ?')) return;
    try { await schoolLifeApi.deleteFeedPost(id); await load(); } catch (e) { alert(e.message); }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><ImageIcon className="w-7 h-7 text-primary" /> Cahier de vie</h1>
          <p className="text-sm text-muted-foreground">Activités de classe & partage de photos (maternelle)</p>
        </div>
        {canManage && (
          <button onClick={() => setShowForm((s) => !s)} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg">
            {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />} {showForm ? 'Annuler' : 'Publier'}
          </button>
        )}
      </div>

      {showForm && canManage && (
        <form onSubmit={submit} className="bg-card border border-border rounded-xl p-4 mb-6 space-y-3">
          <select value={form.class_id} onChange={(e) => setForm({ ...form, class_id: e.target.value })} className="w-full border border-border rounded-lg px-3 py-2 bg-background" required>
            <option value="">— Classe —</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name} {c.level ? `(${c.level})` : ''}</option>)}
          </select>
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Titre (ex: Atelier peinture)" className="w-full border border-border rounded-lg px-3 py-2 bg-background" />
          <textarea value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} placeholder="Description de l'activité..." rows={3} className="w-full border border-border rounded-lg px-3 py-2 bg-background" />
          <div className="flex gap-3 flex-wrap items-center">
            <input type="date" value={form.activity_date} onChange={(e) => setForm({ ...form, activity_date: e.target.value })} className="border border-border rounded-lg px-3 py-2 bg-background" />
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="file" accept="image/*" multiple onChange={(e) => setFiles(Array.from(e.target.files))} />
            </label>
          </div>
          {files.length > 0 && <p className="text-xs text-muted-foreground">{files.length} photo(s) sélectionnée(s)</p>}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.notify} onChange={(e) => setForm({ ...form, notify: e.target.checked })} />
            <Send className="w-4 h-4" /> Notifier les parents (WhatsApp + app)
          </label>
          <button disabled={saving} className="bg-primary text-primary-foreground px-4 py-2 rounded-lg w-full">{saving ? 'Publication...' : 'Publier'}</button>
        </form>
      )}

      {loading ? (
        <p className="text-muted-foreground">Chargement...</p>
      ) : posts.length === 0 ? (
        <p className="text-muted-foreground text-center py-10">Aucune publication pour le moment.</p>
      ) : (
        <div className="space-y-4">
          {posts.map((p) => (
            <motion.div key={p.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold">{p.title || 'Activité de classe'}</h3>
                    <p className="text-xs text-muted-foreground flex items-center gap-2">
                      {p.classes?.name} {p.activity_date && <><Calendar className="w-3 h-3" /> {new Date(p.activity_date).toLocaleDateString('fr-FR')}</>}
                    </p>
                  </div>
                  {canDelete(p.author_id) && <button onClick={() => remove(p.id)} className="text-destructive p-1"><Trash2 className="w-4 h-4" /></button>}
                </div>
                {p.content && <p className="text-sm mt-2 whitespace-pre-wrap">{p.content}</p>}
              </div>
              {Array.isArray(p.media_urls) && p.media_urls.length > 0 && (
                <div className="grid grid-cols-3 gap-1 p-1">
                  {p.media_urls.map((u, i) => (
                    <a key={i} href={mediaUrl(u)} target="_blank" rel="noreferrer">
                      <img src={mediaUrl(u)} alt="" className="w-full h-28 object-cover rounded" />
                    </a>
                  ))}
                </div>
              )}
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
};

export default CahierDeViePage;
