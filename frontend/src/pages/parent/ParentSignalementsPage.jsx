import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useI18n } from '../../i18n';

const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const fetchJson = async (path) => {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  const res = await fetch(`${apiUrl}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error('Erreur');
  return res.json();
};

// Seules les couleurs sont figées ici : les libellés viennent du dictionnaire
// (psig.cat.* / psig.prio.* / psig.status.*).
const CATEGORIES = ['pedagogique', 'discipline', 'materiel', 'securite', 'sante', 'autre'];
const PRIORITIES = {
  basse: 'bg-gray-100 text-gray-700',
  normale: 'bg-blue-100 text-blue-700',
  haute: 'bg-amber-100 text-amber-700',
  urgente: 'bg-red-100 text-red-700',
};
const STATUS = {
  ouvert: 'bg-red-100 text-red-700',
  en_cours: 'bg-amber-100 text-amber-700',
  resolu: 'bg-green-100 text-green-700',
  ferme: 'bg-gray-100 text-gray-700',
};

const ParentSignalementsPage = () => {
  const { t, lang } = useI18n();
  const dateLocale = lang === 'ar' ? 'ar-MA' : 'fr-FR';
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try { setItems(await fetchJson('/api/parent/issues')); }
      catch (e) { setError(e.message); }
      finally { setLoading(false); }
    })();
  }, []);

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <div className="rounded-xl bg-gradient-to-br from-amber-600 to-orange-600 text-white p-6 shadow-lg mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2"><AlertTriangle className="w-7 h-7" /> {t('psig.title')}</h1>
        <p className="text-white/80 text-sm">{t('psig.subtitle')}</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40 text-gray-500">{t('common.loading')}</div>
      ) : error ? (
        <div className="p-6 text-red-600">{error}</div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center text-gray-500">
          {t('psig.empty')}
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((it) => {
            const st = STATUS[it.status]
              ? { label: t(`psig.status.${it.status}`), cls: STATUS[it.status] }
              : { label: it.status, cls: 'bg-gray-100 text-gray-600' };
            const pr = PRIORITIES[it.priority]
              ? { label: t(`psig.prio.${it.priority}`), cls: PRIORITIES[it.priority] }
              : { label: it.priority, cls: 'bg-gray-100 text-gray-600' };
            return (
              <div key={it.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-semibold text-gray-900">{it.title}</h3>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium whitespace-nowrap ${st.cls}`}>{st.label}</span>
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${pr.cls}`}>{pr.label}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">{CATEGORIES.includes(it.category) ? t(`psig.cat.${it.category}`) : it.category}</span>
                  {(it.children || []).map((c, i) => (
                    <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">👤 {c}</span>
                  ))}
                </div>
                {it.description && <p className="text-sm text-gray-700 mt-2 whitespace-pre-line">{it.description}</p>}
                <div className="text-xs text-gray-400 mt-2">
                  {it.classes?.name ? `${it.classes.name} · ` : ''}{new Date(it.created_at).toLocaleDateString(dateLocale, { day: '2-digit', month: 'long', year: 'numeric' })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ParentSignalementsPage;
