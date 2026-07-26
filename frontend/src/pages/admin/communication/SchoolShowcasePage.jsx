import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Building2, Save, Upload, Trash2, Loader2, AlertTriangle, CheckCircle2,
  ToggleLeft, ToggleRight, Image as ImageIcon, Globe, ShieldAlert,
} from 'lucide-react';

/**
 * Vitrine de l'école — alimente les réponses du chatbot WhatsApp.
 *
 * Deux blocs :
 *  1. Informations générales : présentation, taux de réussite, atouts, langues,
 *     filières, contacts et réseaux sociaux.
 *  2. Rubriques illustrées : une image + un titre + une légende par élément
 *     (cantine, sport, salles, équipements, trophées, activités, élèves méritants).
 *
 * API : /api/admin/school-showcase
 */

const CATEGORIES = [
  { value: 'cantine', emoji: '🍽️', label: 'Cantine & restauration' },
  { value: 'sport', emoji: '⚽', label: 'Sport & activités physiques' },
  { value: 'salle', emoji: '🏫', label: 'Salles & locaux' },
  { value: 'equipement', emoji: '🖥️', label: 'Équipements (tableaux interactifs…)' },
  { value: 'trophee', emoji: '🏆', label: 'Trophées & distinctions' },
  { value: 'activite', emoji: '✨', label: 'Activités parascolaires' },
  { value: 'filiere', emoji: '📚', label: 'Filières & options' },
  { value: 'eleve_merite', emoji: '🎓', label: 'Élèves méritants' },
  { value: 'transport', emoji: '🚌', label: 'Transport scolaire' },
  { value: 'autre', emoji: '📌', label: 'Autres informations' },
];

const categoryOf = (value) => CATEGORIES.find((c) => c.value === value) || CATEGORIES[CATEGORIES.length - 1];

// Les listes sont saisies une entrée par ligne (plus simple qu'un éditeur de tags).
const listToText = (list) => (Array.isArray(list) ? list.join('\n') : '');

const EMPTY_PROFILE = {
  about: '', success_rate: '', success_rate_year: '', success_rate_note: '',
  advantages: '', languages: '', filieres: '',
  contact_phone: '', contact_whatsapp: '', contact_email: '', website_url: '',
  facebook_url: '', instagram_url: '', tiktok_url: '', youtube_url: '', maps_url: '',
};

const CONTACT_FIELDS = [
  ['contact_phone', '☎️ Téléphone', '+212 5 22 00 00 00'],
  ['contact_whatsapp', '💬 WhatsApp', '+212 6 00 00 00 00'],
  ['contact_email', '✉️ Email', 'contact@ecole.ma'],
  ['website_url', '🌐 Site web', 'https://…'],
  ['facebook_url', '📘 Facebook', 'https://facebook.com/…'],
  ['instagram_url', '📸 Instagram', 'https://instagram.com/…'],
  ['tiktok_url', '🎵 TikTok', 'https://tiktok.com/@…'],
  ['youtube_url', '▶️ YouTube', 'https://youtube.com/@…'],
  ['maps_url', '📍 Google Maps', 'https://maps.app.goo.gl/…'],
];

export default function SchoolShowcasePage({ apiUrl, getAuthToken }) {
  const [profile, setProfile] = useState(EMPTY_PROFILE);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [message, setMessage] = useState(null);   // { type, text }

  // Formulaire d'ajout
  const [category, setCategory] = useState('cantine');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [studentName, setStudentName] = useState('');
  const [grade, setGrade] = useState('');
  const [classLabel, setClassLabel] = useState('');
  const [gradeYear, setGradeYear] = useState('');
  const [image, setImage] = useState(null);
  const [adding, setAdding] = useState(false);
  const imageInputRef = useRef(null);

  const isStudentCategory = category === 'eleve_merite';

  const authHeaders = useCallback(async () => {
    const token = await getAuthToken();
    return { Authorization: `Bearer ${token}` };
  }, [getAuthToken]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const headers = await authHeaders();
      const [pRes, iRes] = await Promise.all([
        fetch(`${apiUrl}/api/admin/school-showcase/profile`, { headers }),
        fetch(`${apiUrl}/api/admin/school-showcase/items`, { headers }),
      ]);
      const pData = await pRes.json();
      const iData = await iRes.json();
      if (!pRes.ok) throw new Error(pData.error || 'Chargement impossible');
      if (!iRes.ok) throw new Error(iData.error || 'Chargement impossible');

      const p = pData.profile;
      setProfile(p ? {
        about: p.about || '',
        success_rate: p.success_rate ?? '',
        success_rate_year: p.success_rate_year || '',
        success_rate_note: p.success_rate_note || '',
        advantages: listToText(p.advantages),
        languages: listToText(p.languages),
        filieres: listToText(p.filieres),
        contact_phone: p.contact_phone || '',
        contact_whatsapp: p.contact_whatsapp || '',
        contact_email: p.contact_email || '',
        website_url: p.website_url || '',
        facebook_url: p.facebook_url || '',
        instagram_url: p.instagram_url || '',
        tiktok_url: p.tiktok_url || '',
        youtube_url: p.youtube_url || '',
        maps_url: p.maps_url || '',
      } : EMPTY_PROFILE);
      setItems(iData.items || []);
    } catch (e) {
      setMessage({ type: 'error', text: e.message });
    } finally {
      setLoading(false);
    }
  }, [apiUrl, authHeaders]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setSavingProfile(true);
    setMessage(null);
    try {
      const res = await fetch(`${apiUrl}/api/admin/school-showcase/profile`, {
        method: 'PUT',
        headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
        body: JSON.stringify(profile),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Enregistrement impossible');
      setMessage({ type: 'success', text: 'Informations générales enregistrées — le chatbot les utilise immédiatement.' });
    } catch (e) {
      setMessage({ type: 'error', text: e.message });
    } finally {
      setSavingProfile(false);
    }
  };

  const resetAddForm = () => {
    setTitle(''); setDescription('');
    setStudentName(''); setGrade(''); setClassLabel(''); setGradeYear('');
    setImage(null);
    if (imageInputRef.current) imageInputRef.current.value = '';
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!title.trim()) {
      setMessage({ type: 'error', text: 'Le titre est obligatoire.' });
      return;
    }
    setAdding(true);
    setMessage(null);
    try {
      const form = new FormData();
      form.append('category', category);
      form.append('title', title.trim());
      if (description.trim()) form.append('description', description.trim());
      if (image) form.append('image', image);
      if (isStudentCategory) {
        if (studentName.trim()) form.append('student_name', studentName.trim());
        if (grade.trim()) form.append('grade', grade.trim());
        if (classLabel.trim()) form.append('class_label', classLabel.trim());
        if (gradeYear.trim()) form.append('year', gradeYear.trim());
        // Données d'un mineur : pas de diffusion aux numéros inconnus par défaut.
        form.append('is_public', 'false');
      }

      const res = await fetch(`${apiUrl}/api/admin/school-showcase/items`, {
        method: 'POST',
        headers: await authHeaders(),   // pas de Content-Type : boundary posée par le navigateur
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.details || 'Ajout impossible');

      setMessage({ type: 'success', text: `« ${data.item.title} » ajouté à la rubrique ${categoryOf(category).label}.` });
      resetAddForm();
      await fetchAll();
    } catch (e) {
      setMessage({ type: 'error', text: e.message });
    } finally {
      setAdding(false);
    }
  };

  const patchItem = async (item, payload, { file = null } = {}) => {
    setBusyId(item.id);
    setMessage(null);
    try {
      let body;
      let headers = await authHeaders();
      if (file) {
        body = new FormData();
        Object.entries(payload).forEach(([k, v]) => body.append(k, String(v)));
        body.append('image', file);
      } else {
        headers = { ...headers, 'Content-Type': 'application/json' };
        body = JSON.stringify(payload);
      }
      const res = await fetch(`${apiUrl}/api/admin/school-showcase/items/${item.id}`, {
        method: 'PATCH', headers, body,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Modification impossible');
      await fetchAll();
    } catch (e) {
      setMessage({ type: 'error', text: e.message });
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (item) => {
    if (!window.confirm(`Supprimer « ${item.title} » ?`)) return;
    setBusyId(item.id);
    try {
      const res = await fetch(`${apiUrl}/api/admin/school-showcase/items/${item.id}`, {
        method: 'DELETE', headers: await authHeaders(),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Suppression impossible');
      await fetchAll();
    } catch (e) {
      setMessage({ type: 'error', text: e.message });
    } finally {
      setBusyId(null);
    }
  };

  const grouped = useMemo(() => {
    const map = new Map();
    for (const it of items) {
      if (!map.has(it.category)) map.set(it.category, []);
      map.get(it.category).push(it);
    }
    return CATEGORIES
      .filter((c) => map.has(c.value))
      .map((c) => ({ ...c, items: map.get(c.value) }));
  }, [items]);

  const field = (key) => ({
    value: profile[key],
    onChange: (e) => setProfile((p) => ({ ...p, [key]: e.target.value })),
  });

  const inputCls = 'w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400';

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* En-tête */}
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <Building2 className="w-4 h-4" /> Vitrine de l'école
          </h2>
          <p className="text-xs text-gray-600 mt-1">
            Ces informations et ces photos sont envoyées par le chatbot WhatsApp quand un parent —
            ou un visiteur, si vous avez activé les réponses aux numéros inconnus — demande à
            découvrir l'école (cantine, sport, équipements, résultats, filières, contacts).
          </p>
        </div>

        {message && (
          <div className={`rounded-lg border p-3 text-sm flex items-start gap-2 ${
            message.type === 'error'
              ? 'bg-red-50 border-red-200 text-red-700'
              : 'bg-emerald-50 border-emerald-200 text-emerald-700'}`}>
            {message.type === 'error'
              ? <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              : <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />}
            <span>{message.text}</span>
          </div>
        )}

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-gray-500 p-6 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" /> Chargement…
          </div>
        ) : (
          <>
            {/* ===== 1. Informations générales ===== */}
            <form onSubmit={handleSaveProfile} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm space-y-4">
              <h3 className="text-sm font-semibold text-gray-700">Informations générales</h3>

              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Présentation de l'école</label>
                <textarea
                  {...field('about')} rows={3} className={inputCls}
                  placeholder="École trilingue fondée en 1998, de la maternelle au baccalauréat…"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">Taux de réussite (%)</label>
                  <input {...field('success_rate')} className={inputCls} placeholder="98" inputMode="decimal" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">Année concernée</label>
                  <input {...field('success_rate_year')} className={inputCls} placeholder="2025-2026" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">Précision</label>
                  <input {...field('success_rate_note')} className={inputCls} placeholder="Baccalauréat, toutes filières" />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">
                    Langues d'enseignement <span className="font-normal text-gray-400">(une par ligne)</span>
                  </label>
                  <textarea {...field('languages')} rows={4} className={inputCls} placeholder={'Arabe\nFrançais\nAnglais'} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">
                    Atouts <span className="font-normal text-gray-400">(un par ligne)</span>
                  </label>
                  <textarea {...field('advantages')} rows={4} className={inputCls} placeholder={'École trilingue\nEffectifs limités à 24 élèves\nSuivi quotidien par WhatsApp'} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">
                    Filières disponibles <span className="font-normal text-gray-400">(une par ligne)</span>
                  </label>
                  <textarea {...field('filieres')} rows={4} className={inputCls} placeholder={'Sciences Mathématiques A et B\nSciences Physiques (BIOF)\nSVT'} />
                </div>
              </div>

              <div>
                <h4 className="text-xs font-semibold text-gray-600 mb-2 flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5" /> Contacts & réseaux sociaux
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {CONTACT_FIELDS.map(([key, label, placeholder]) => (
                    <div key={key}>
                      <label className="text-[11px] text-gray-500 block mb-1">{label}</label>
                      <input {...field(key)} className={inputCls} placeholder={placeholder} />
                    </div>
                  ))}
                </div>
              </div>

              <button
                type="submit" disabled={savingProfile}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
              >
                {savingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Enregistrer les informations
              </button>
            </form>

            {/* ===== 2. Ajout d'un élément illustré ===== */}
            <form onSubmit={handleAdd} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm space-y-3">
              <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <ImageIcon className="w-4 h-4" /> Ajouter une photo / un élément
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">Rubrique</label>
                  <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls}>
                    {CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>{c.emoji} {c.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">Titre *</label>
                  <input
                    value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls}
                    placeholder={isStudentCategory ? 'Majorante de 2BAC SM' : 'Réfectoire — repas équilibrés'}
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Légende / description</label>
                <textarea
                  value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className={inputCls}
                  placeholder="Menu varié préparé sur place, validé par une diététicienne."
                />
              </div>

              {isStudentCategory && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-3">
                  <p className="text-xs text-amber-800 flex items-start gap-1.5">
                    <ShieldAlert className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>
                      Nom, note et photo d'un élève sont des <strong>données personnelles d'un mineur</strong>.
                      Assurez-vous d'avoir l'accord de ses parents. Par sécurité, ces éléments ne sont
                      <strong> pas</strong> envoyés aux numéros inconnus : activez la diffusion publique
                      ci-dessous, élément par élément, en connaissance de cause.
                    </span>
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div>
                      <label className="text-[11px] text-gray-600 block mb-1">Nom de l'élève</label>
                      <input value={studentName} onChange={(e) => setStudentName(e.target.value)} className={inputCls} placeholder="Salma B." />
                    </div>
                    <div>
                      <label className="text-[11px] text-gray-600 block mb-1">Moyenne / note</label>
                      <input value={grade} onChange={(e) => setGrade(e.target.value)} className={inputCls} placeholder="18,45/20" />
                    </div>
                    <div>
                      <label className="text-[11px] text-gray-600 block mb-1">Classe</label>
                      <input value={classLabel} onChange={(e) => setClassLabel(e.target.value)} className={inputCls} placeholder="2BAC SM-A" />
                    </div>
                    <div>
                      <label className="text-[11px] text-gray-600 block mb-1">Année</label>
                      <input value={gradeYear} onChange={(e) => setGradeYear(e.target.value)} className={inputCls} placeholder="2025-2026" />
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Image (JPG / PNG, 8 Mo max)</label>
                <input
                  ref={imageInputRef} type="file" accept="image/*"
                  onChange={(e) => setImage(e.target.files?.[0] || null)}
                  className="block w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-indigo-50 file:text-indigo-700 file:text-sm hover:file:bg-indigo-100"
                />
                <p className="text-[11px] text-gray-400 mt-1">
                  Sans image, l'élément est envoyé en texte seul (utile pour une filière ou un atout).
                </p>
              </div>

              <button
                type="submit" disabled={adding}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
              >
                {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                Ajouter
              </button>
            </form>

            {/* ===== 3. Contenu publié ===== */}
            {grouped.length === 0 ? (
              <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
                Aucun élément pour le moment. Ajoutez une première photo ci-dessus.
              </div>
            ) : (
              grouped.map((group) => (
                <div key={group.value} className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
                  <div className="px-4 py-2.5 bg-indigo-50 border-b border-indigo-100 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-indigo-800">{group.emoji} {group.label}</h3>
                    <span className="text-xs text-indigo-600">{group.items.length} élément{group.items.length > 1 ? 's' : ''}</span>
                  </div>
                  <ul className="divide-y divide-gray-100">
                    {group.items.map((item) => (
                      <li key={item.id} className="p-3 flex items-start gap-3">
                        {item.image_url ? (
                          <img
                            src={item.image_url} alt={item.title}
                            className="w-20 h-20 object-cover rounded-lg border border-gray-200 flex-shrink-0"
                          />
                        ) : (
                          <div className="w-20 h-20 rounded-lg border border-dashed border-gray-300 flex items-center justify-center text-gray-300 flex-shrink-0">
                            <ImageIcon className="w-6 h-6" />
                          </div>
                        )}

                        <div className="flex-1 min-w-0 space-y-1.5">
                          <input
                            defaultValue={item.title}
                            onBlur={(e) => {
                              const v = e.target.value.trim();
                              if (v && v !== item.title) patchItem(item, { title: v });
                            }}
                            className="w-full text-sm font-semibold text-gray-900 px-1.5 py-0.5 rounded border border-transparent hover:border-gray-300 focus:border-indigo-400 focus:outline-none"
                          />
                          <textarea
                            defaultValue={item.description || ''}
                            rows={2}
                            placeholder="Légende…"
                            onBlur={(e) => {
                              const v = e.target.value.trim();
                              if (v !== (item.description || '')) patchItem(item, { description: v });
                            }}
                            className="w-full text-xs text-gray-600 px-1.5 py-0.5 rounded border border-transparent hover:border-gray-300 focus:border-indigo-400 focus:outline-none resize-none"
                          />
                          {item.extra?.student_name && (
                            <p className="text-[11px] text-gray-500">
                              🎓 {[item.extra.student_name, item.extra.class_label, item.extra.grade, item.extra.year]
                                .filter(Boolean).join(' • ')}
                            </p>
                          )}
                          <div className="flex items-center gap-3 flex-wrap pt-0.5">
                            <button
                              type="button"
                              onClick={() => patchItem(item, { is_published: !item.is_published })}
                              disabled={busyId === item.id}
                              className="inline-flex items-center gap-1 text-[11px] text-gray-600 hover:text-gray-900"
                              title="Visible par le chatbot pour les parents"
                            >
                              {item.is_published
                                ? <ToggleRight className="w-5 h-5 text-emerald-600" />
                                : <ToggleLeft className="w-5 h-5 text-gray-400" />}
                              Publié
                            </button>
                            <button
                              type="button"
                              onClick={() => patchItem(item, { is_public: !item.is_public })}
                              disabled={busyId === item.id}
                              className="inline-flex items-center gap-1 text-[11px] text-gray-600 hover:text-gray-900"
                              title="Visible aussi par les numéros inconnus (chatbot visiteur)"
                            >
                              {item.is_public
                                ? <ToggleRight className="w-5 h-5 text-indigo-600" />
                                : <ToggleLeft className="w-5 h-5 text-gray-400" />}
                              Visiteurs
                            </button>
                            <label className="text-[11px] text-indigo-600 hover:text-indigo-800 cursor-pointer">
                              Remplacer l'image
                              <input
                                type="file" accept="image/*" className="hidden"
                                onChange={(e) => {
                                  const f = e.target.files?.[0];
                                  if (f) patchItem(item, { title: item.title }, { file: f });
                                  e.target.value = '';
                                }}
                              />
                            </label>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleDelete(item)}
                          disabled={busyId === item.id}
                          title="Supprimer"
                          className="p-1.5 rounded-md hover:bg-red-50 text-red-500 flex-shrink-0"
                        >
                          {busyId === item.id
                            ? <Loader2 className="w-4 h-4 animate-spin" />
                            : <Trash2 className="w-4 h-4" />}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            )}
          </>
        )}
      </div>
    </div>
  );
}
