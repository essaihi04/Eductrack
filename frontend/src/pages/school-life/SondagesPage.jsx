import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { BarChart2, Plus, Trash2, X, Send, CheckCircle2, Lock } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useYear } from '../../contexts/YearContext';
import { schoolLifeApi, fetchClasses } from '../../lib/schoolLifeApi';

const SondagesPage = () => {
  const { profile } = useAuth();
  const { year } = useYear();
  const canManage = ['admin', 'school_admin', 'pedagogical_director', 'pedagogical_manager', 'teacher'].includes(profile?.role);
  const isAdmin = ['admin', 'school_admin', 'pedagogical_director', 'pedagogical_manager'].includes(profile?.role);
  const canDelete = (ownerId) => isAdmin || (ownerId && ownerId === profile?.id);

  const [polls, setPolls] = useState([]);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ question: '', description: '', target_audience: 'parents', class_id: '', closes_at: '', notify: true });
  const [options, setOptions] = useState(['', '']);

  const load = async () => {
    setLoading(true);
    try { setPolls(await schoolLifeApi.listPolls()); } catch (e) { console.error(e); }
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
    const opts = options.map((o) => o.trim()).filter(Boolean);
    if (opts.length < 2) return alert('Au moins 2 options');
    setSaving(true);
    try {
      await schoolLifeApi.createPoll({ ...form, options: opts, class_id: form.class_id || null });
      setForm({ question: '', description: '', target_audience: 'parents', class_id: '', closes_at: '', notify: true });
      setOptions(['', '']); setShowForm(false); await load();
    } catch (e) { alert(e.message); }
    setSaving(false);
  };

  const vote = async (poll, optId) => {
    try { await schoolLifeApi.votePoll(poll.id, optId); await load(); } catch (e) { alert(e.message); }
  };
  const toggle = async (poll) => { try { await schoolLifeApi.togglePoll(poll.id, !poll.is_active); await load(); } catch (e) { alert(e.message); } };
  const remove = async (id) => { if (!confirm('Supprimer ?')) return; try { await schoolLifeApi.deletePoll(id); await load(); } catch (e) { alert(e.message); } };

  const pct = (poll, optId) => (poll.total_votes ? Math.round(((poll.vote_counts?.[optId] || 0) / poll.total_votes) * 100) : 0);

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><BarChart2 className="w-7 h-7 text-primary" /> Sondages</h1>
          <p className="text-sm text-muted-foreground">Consultez les parents et la communauté</p>
        </div>
        {canManage && (
          <button onClick={() => setShowForm((s) => !s)} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg">
            {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />} {showForm ? 'Annuler' : 'Créer'}
          </button>
        )}
      </div>

      {showForm && canManage && (
        <form onSubmit={submit} className="bg-card border border-border rounded-xl p-4 mb-6 space-y-3">
          <input value={form.question} onChange={(e) => setForm({ ...form, question: e.target.value })} placeholder="Question" required className="w-full border border-border rounded-lg px-3 py-2 bg-background" />
          <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Description (optionnel)" rows={2} className="w-full border border-border rounded-lg px-3 py-2 bg-background" />
          {options.map((o, i) => (
            <div key={i} className="flex gap-2">
              <input value={o} onChange={(e) => setOptions(options.map((x, j) => (j === i ? e.target.value : x)))} placeholder={`Option ${i + 1}`} className="flex-1 border border-border rounded-lg px-3 py-2 bg-background" />
              {options.length > 2 && <button type="button" onClick={() => setOptions(options.filter((_, j) => j !== i))} className="text-destructive"><X className="w-4 h-4" /></button>}
            </div>
          ))}
          <button type="button" onClick={() => setOptions([...options, ''])} className="text-sm text-primary">+ Ajouter une option</button>
          <div className="grid grid-cols-2 gap-3">
            <select value={form.target_audience} onChange={(e) => setForm({ ...form, target_audience: e.target.value })} className="border border-border rounded-lg px-3 py-2 bg-background">
              <option value="parents">Parents</option>
              <option value="tous">Tous</option>
              <option value="profs">Professeurs</option>
            </select>
            <select value={form.class_id} onChange={(e) => setForm({ ...form, class_id: e.target.value })} className="border border-border rounded-lg px-3 py-2 bg-background">
              <option value="">Toutes les classes</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <input type="datetime-local" value={form.closes_at} onChange={(e) => setForm({ ...form, closes_at: e.target.value })} className="w-full border border-border rounded-lg px-3 py-2 bg-background" />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.notify} onChange={(e) => setForm({ ...form, notify: e.target.checked })} />
            <Send className="w-4 h-4" /> Notifier les parents (WhatsApp + app)
          </label>
          <button disabled={saving} className="bg-primary text-primary-foreground px-4 py-2 rounded-lg w-full">{saving ? '...' : 'Créer le sondage'}</button>
        </form>
      )}

      {loading ? (
        <p className="text-muted-foreground">Chargement...</p>
      ) : polls.length === 0 ? (
        <p className="text-muted-foreground text-center py-10">Aucun sondage.</p>
      ) : (
        <div className="space-y-4">
          {polls.map((poll) => {
            const closed = !poll.is_active || (poll.closes_at && new Date(poll.closes_at) < new Date());
            return (
              <motion.div key={poll.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-card border border-border rounded-xl p-4">
                <div className="flex items-start justify-between">
                  <h3 className="font-semibold">{poll.question}</h3>
                  {canManage && (
                    <div className="flex gap-2">
                      <button onClick={() => toggle(poll)} title={poll.is_active ? 'Clôturer' : 'Rouvrir'} className="text-muted-foreground"><Lock className="w-4 h-4" /></button>
                      {canDelete(poll.created_by) && <button onClick={() => remove(poll.id)} className="text-destructive"><Trash2 className="w-4 h-4" /></button>}
                    </div>
                  )}
                </div>
                {poll.description && <p className="text-sm text-muted-foreground mb-2">{poll.description}</p>}
                <div className="space-y-2 mt-2">
                  {(poll.options || []).map((opt) => {
                    const voted = poll.my_vote === opt.id;
                    return (
                      <button key={opt.id} disabled={closed} onClick={() => vote(poll, opt.id)} className={`w-full text-left border rounded-lg p-2 relative overflow-hidden ${voted ? 'border-primary' : 'border-border'} ${closed ? 'cursor-default' : 'hover:border-primary'}`}>
                        <div className="absolute inset-0 bg-primary/10" style={{ width: `${pct(poll, opt.id)}%` }} />
                        <div className="relative flex items-center justify-between text-sm">
                          <span className="flex items-center gap-2">{voted && <CheckCircle2 className="w-4 h-4 text-primary" />} {opt.label}</span>
                          <span className="text-muted-foreground">{pct(poll, opt.id)}%</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground mt-2">{poll.total_votes || 0} vote(s){closed ? ' · clôturé' : ''}</p>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default SondagesPage;
