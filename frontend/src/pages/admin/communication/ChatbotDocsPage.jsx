import { useState, useEffect, useCallback, useRef } from 'react';
import {
  BookOpen, Upload, FileText, Trash2, RefreshCw, Eye, AlertTriangle,
  CheckCircle2, Loader2, ChevronDown, ChevronRight, ToggleLeft, ToggleRight, Info, Users,
} from 'lucide-react';
import { openBlob } from '../../../lib/download';
import { defaultYear, nextYearStr } from '../../../lib/schoolYear';

/**
 * Base de connaissances du chatbot WhatsApp.
 *
 * L'école importe un PDF général (typiquement la liste des fournitures de tous
 * les niveaux). Le backend en extrait le texte et le découpe PAR NIVEAU : quand
 * un parent demande les fournitures, le chatbot régénère un PDF aux couleurs de
 * l'école contenant UNIQUEMENT le niveau demandé.
 *
 * API : /api/admin/chatbot-docs
 */

// Seules les fournitures sont régénérées par niveau ; tous les autres documents
// sont envoyés au parent TELS QUELS (fichier d'origine) et alimentent l'IA.
const CATEGORIES = [
  { value: 'fournitures', label: '🎒 Fournitures scolaires', hint: 'Découpé par niveau, PDF régénéré pour le niveau demandé' },
  { value: 'reglement', label: '📋 Règlement intérieur', hint: 'Envoyé tel quel + utilisé par l\'IA' },
  { value: 'calendrier', label: '📅 Calendrier scolaire', hint: 'Envoyé tel quel + utilisé par l\'IA' },
  { value: 'inscription', label: '📝 Inscription / réinscription', hint: 'Envoyé tel quel + utilisé par l\'IA' },
  { value: 'cantine', label: '🍽️ Cantine', hint: 'Envoyé tel quel + utilisé par l\'IA' },
  { value: 'transport', label: '🚌 Transport scolaire', hint: 'Envoyé tel quel + utilisé par l\'IA' },
  { value: 'autre', label: '📄 Autre document', hint: 'Envoyé tel quel + utilisé par l\'IA' },
];

/** Le document est-il redécoupé par niveau (fournitures) ou diffusé tel quel ? */
const isAsIs = (doc) => doc?.category !== 'fournitures';

const categoryLabel = (value) => CATEGORIES.find((c) => c.value === value)?.label || value;

const STATUS_BADGE = {
  ready: { cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle2, label: 'Prêt' },
  processing: { cls: 'bg-amber-50 text-amber-700 border-amber-200', icon: Loader2, label: 'Analyse en cours' },
  error: { cls: 'bg-red-50 text-red-600 border-red-200', icon: AlertTriangle, label: 'Erreur' },
};

/**
 * Année scolaire à proposer pour une liste de fournitures : de mars à août,
 * la liste concerne la rentrée à venir (l'année active se termine), sinon
 * l'année en cours.
 */
const suppliesYear = (activeYear) => {
  const month = new Date().getMonth() + 1;
  if (month >= 3 && month <= 8) return nextYearStr(activeYear || defaultYear()) || '';
  return activeYear || defaultYear();
};

const itemCount = (section) =>
  (section?.content?.groups || []).reduce((sum, g) => sum + (g.items?.length || 0), 0);

export default function ChatbotDocsPage({ apiUrl, getAuthToken, academicYear }) {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);        // documentId ouvert
  const [sections, setSections] = useState({});          // documentId -> sections
  const [busyId, setBusyId] = useState(null);
  const [message, setMessage] = useState(null);          // { type, text }
  const [publicBot, setPublicBot] = useState(null);      // { public_chatbot_enabled, has_session }
  const [savingPublicBot, setSavingPublicBot] = useState(false);

  // Formulaire d'import
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('fournitures');
  // Une liste de fournitures se prépare pour la rentrée SUIVANTE : de mars à
  // août on propose donc l'année d'après, pas l'année active de l'application.
  const [year, setYear] = useState(() => suppliesYear(academicYear));
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  const authHeaders = useCallback(async () => {
    const token = await getAuthToken();
    return { Authorization: `Bearer ${token}` };
  }, [getAuthToken]);

  const fetchDocuments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${apiUrl}/api/admin/chatbot-docs`, { headers: await authHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Chargement impossible');
      setDocuments(data.documents || []);
    } catch (e) {
      setMessage({ type: 'error', text: e.message });
    } finally {
      setLoading(false);
    }
  }, [apiUrl, authHeaders]);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch(`${apiUrl}/api/admin/chatbot-docs/settings`, { headers: await authHeaders() });
      if (!res.ok) return;
      setPublicBot(await res.json());
    } catch {
      // réglage optionnel : on n'affiche pas d'erreur bloquante
    }
  }, [apiUrl, authHeaders]);

  useEffect(() => { fetchDocuments(); fetchSettings(); }, [fetchDocuments, fetchSettings]);
  useEffect(() => { if (academicYear && !year) setYear(suppliesYear(academicYear)); }, [academicYear, year]);

  const handleTogglePublicBot = async () => {
    setSavingPublicBot(true);
    setMessage(null);
    try {
      const next = !publicBot?.public_chatbot_enabled;
      const res = await fetch(`${apiUrl}/api/admin/chatbot-docs/settings`, {
        method: 'PATCH',
        headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
        body: JSON.stringify({ public_chatbot_enabled: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Modification impossible');
      setPublicBot((p) => ({ ...p, public_chatbot_enabled: data.public_chatbot_enabled }));
      setMessage({
        type: 'success',
        text: data.public_chatbot_enabled
          ? 'Les numéros inconnus reçoivent désormais les informations générales.'
          : 'Les numéros inconnus ne reçoivent plus aucune réponse.',
      });
    } catch (e) {
      setMessage({ type: 'error', text: e.message });
    } finally {
      setSavingPublicBot(false);
    }
  };

  const toggleExpand = async (doc) => {
    if (expanded === doc.id) { setExpanded(null); return; }
    setExpanded(doc.id);
    if (sections[doc.id]) return;
    try {
      const res = await fetch(`${apiUrl}/api/admin/chatbot-docs/${doc.id}`, { headers: await authHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Chargement impossible');
      setSections((s) => ({ ...s, [doc.id]: data.sections || [] }));
    } catch (e) {
      setMessage({ type: 'error', text: e.message });
    }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!file) { setMessage({ type: 'error', text: 'Choisissez un fichier PDF.' }); return; }
    setUploading(true);
    setMessage(null);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('title', title || file.name.replace(/\.pdf$/i, ''));
      form.append('category', category);
      if (year) form.append('academic_year', year);

      const res = await fetch(`${apiUrl}/api/admin/chatbot-docs`, {
        method: 'POST',
        headers: await authHeaders(),   // pas de Content-Type : le navigateur pose la boundary
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.details || 'Import impossible');

      const detected = (data.sections || []).length;
      setMessage(data.warning
        ? { type: 'error', text: data.warning }
        : { type: 'success', text: `Document importé — ${detected} niveau${detected > 1 ? 'x' : ''} détecté${detected > 1 ? 's' : ''}.` });

      setFile(null);
      setTitle('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      setSections((s) => ({ ...s, [data.document.id]: data.sections || [] }));
      await fetchDocuments();
      setExpanded(data.document.id);
    } catch (e) {
      setMessage({ type: 'error', text: e.message });
    } finally {
      setUploading(false);
    }
  };

  const handleReanalyze = async (doc) => {
    setBusyId(doc.id);
    setMessage(null);
    try {
      const res = await fetch(`${apiUrl}/api/admin/chatbot-docs/${doc.id}/reanalyze`, {
        method: 'POST', headers: await authHeaders(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Analyse impossible');
      setSections((s) => ({ ...s, [doc.id]: data.sections || [] }));
      setMessage(data.warning
        ? { type: 'error', text: data.warning }
        : { type: 'success', text: `Analyse relancée — ${(data.sections || []).length} niveau(x).` });
      await fetchDocuments();
    } catch (e) {
      setMessage({ type: 'error', text: e.message });
    } finally {
      setBusyId(null);
    }
  };

  const handleToggleActive = async (doc) => {
    setBusyId(doc.id);
    try {
      const res = await fetch(`${apiUrl}/api/admin/chatbot-docs/${doc.id}`, {
        method: 'PATCH',
        headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !doc.is_active }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Modification impossible');
      await fetchDocuments();
    } catch (e) {
      setMessage({ type: 'error', text: e.message });
    } finally {
      setBusyId(null);
    }
  };

  /**
   * Corrige l'année scolaire d'un document déjà importé : c'est elle qui est
   * imprimée sur le PDF envoyé aux parents, et le formulaire d'import a pu
   * proposer l'année active alors que la liste vise la rentrée suivante.
   */
  const handleYearChange = async (doc, value) => {
    const next = value.trim();
    if (next === (doc.academic_year || '')) return;
    setBusyId(doc.id);
    try {
      const res = await fetch(`${apiUrl}/api/admin/chatbot-docs/${doc.id}`, {
        method: 'PATCH',
        headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
        body: JSON.stringify({ academic_year: next }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Modification impossible');
      setMessage({
        type: 'success',
        text: next
          ? `Année scolaire du document mise à jour : ${next}.`
          : 'Année scolaire effacée : le PDF affichera la prochaine rentrée.',
      });
      await fetchDocuments();
    } catch (e) {
      setMessage({ type: 'error', text: e.message });
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (doc) => {
    if (!window.confirm(`Supprimer « ${doc.title} » ? Le chatbot ne pourra plus répondre à partir de ce document.`)) return;
    setBusyId(doc.id);
    try {
      const res = await fetch(`${apiUrl}/api/admin/chatbot-docs/${doc.id}`, {
        method: 'DELETE', headers: await authHeaders(),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Suppression impossible');
      setMessage({ type: 'success', text: 'Document supprimé.' });
      await fetchDocuments();
    } catch (e) {
      setMessage({ type: 'error', text: e.message });
    } finally {
      setBusyId(null);
    }
  };

  /**
   * Supprime UN niveau détecté, sans toucher au reste du document.
   * Utile quand l'analyse a inventé un niveau (une ligne d'article prise pour
   * un titre) ou quand l'école ne veut pas diffuser ce niveau : réimporter tout
   * le PDF pour retirer une seule section serait disproportionné.
   */
  const handleDeleteSection = async (doc, section) => {
    if (!window.confirm(
      `Supprimer le niveau « ${section.level_label} » de ce document ?\n\n`
      + "Le chatbot ne proposera plus ce niveau. Les autres niveaux sont conservés.",
    )) return;
    setBusyId(section.id);
    try {
      const res = await fetch(`${apiUrl}/api/admin/chatbot-docs/sections/${section.id}`, {
        method: 'DELETE', headers: await authHeaders(),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Suppression impossible');
      // Retrait local immédiat : pas de rechargement complet de la liste.
      setSections((s) => ({
        ...s,
        [doc.id]: (s[doc.id] || []).filter((x) => x.id !== section.id),
      }));
      setMessage({ type: 'success', text: `Niveau « ${section.level_label} » supprimé.` });
    } catch (e) {
      setMessage({ type: 'error', text: e.message });
    } finally {
      setBusyId(null);
    }
  };

  const handlePreview = async (section) => {
    try {
      const res = await fetch(`${apiUrl}/api/admin/chatbot-docs/sections/${section.id}/pdf`, {
        headers: await authHeaders(),
      });
      if (!res.ok) throw new Error('Génération du PDF impossible');
      await openBlob(await res.blob(), `Fournitures_${section.level_code || section.level_label}.pdf`);
    } catch (e) {
      setMessage({ type: 'error', text: e.message });
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="max-w-5xl mx-auto space-y-5">

        {/* Explication */}
        <div className="rounded-lg border border-indigo-200 bg-indigo-50/60 p-4 flex gap-3">
          <Info className="w-5 h-5 text-indigo-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-indigo-900 space-y-1">
            <p className="font-semibold">Documents du chatbot WhatsApp</p>
            <p className="text-indigo-800">
              <strong>Fournitures :</strong> le PDF importé (tous les niveaux) est découpé
              automatiquement par niveau. Le parent reçoit un PDF régénéré aux couleurs de l'école
              contenant <strong>uniquement le niveau demandé</strong> — jamais le document complet.
            </p>
            <p className="text-indigo-800">
              <strong>Tous les autres documents</strong> (règlement intérieur, calendrier,
              inscription…) sont envoyés <strong>tels quels</strong>, dans leur mise en page
              d'origine, et leur texte sert à l'IA pour répondre aux questions.
            </p>
          </div>
        </div>

        {/* Réponses aux numéros inconnus */}
        {publicBot && (
          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <Users className="w-4 h-4" /> Répondre aux numéros inconnus
                </h2>
                <p className="text-xs text-gray-600 mt-1">
                  Un numéro qui n'est rattaché à aucun élève reçoit <strong>uniquement les informations
                  générales</strong> ci-dessous (fournitures, règlement, horaires…). Notes, absences,
                  paiements et identifiants restent réservés aux parents enregistrés.
                </p>
                <p className="text-[11px] text-gray-400 mt-1">
                  Limite anti-abus : 20 messages par numéro et par jour.
                  {publicBot.has_session === false && ' — connectez d\'abord le numéro WhatsApp de l\'école.'}
                </p>
              </div>
              <button
                onClick={handleTogglePublicBot}
                disabled={savingPublicBot || publicBot.has_session === false}
                className="flex-shrink-0 p-1 disabled:opacity-40"
                title={publicBot.public_chatbot_enabled ? 'Désactiver' : 'Activer'}
              >
                {publicBot.public_chatbot_enabled
                  ? <ToggleRight className="w-9 h-9 text-emerald-600" />
                  : <ToggleLeft className="w-9 h-9 text-gray-400" />}
              </button>
            </div>
          </div>
        )}

        {/* Import */}
        <form onSubmit={handleUpload} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm space-y-3">
          <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <Upload className="w-4 h-4" /> Importer un document PDF
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <label className="text-xs font-semibold text-gray-600 block mb-1">Fichier PDF</label>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 file:mr-3 file:py-1 file:px-3 file:rounded-md file:border-0 file:bg-indigo-50 file:text-indigo-700 file:text-sm"
              />
              <p className="text-[11px] text-gray-500 mt-1">
                Le PDF doit contenir du texte sélectionnable (un scan/photo ne peut pas être lu).
              </p>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">Type de document</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2"
              >
                {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
              <p className="text-[11px] text-gray-500 mt-1">
                {CATEGORIES.find((c) => c.value === category)?.hint}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <label className="text-xs font-semibold text-gray-600 block mb-1">Titre</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Liste des fournitures scolaires"
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">Année scolaire</label>
              <input
                type="text"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                placeholder="2025-2026"
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={uploading || !file}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium disabled:opacity-50 hover:bg-indigo-700"
            >
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {uploading ? 'Analyse du document…' : 'Importer et analyser'}
            </button>
            {uploading && (
              <span className="text-xs text-gray-500">Extraction du texte et découpage par niveau, cela peut prendre 10 à 30 secondes.</span>
            )}
          </div>
        </form>

        {message && (
          <div className={`rounded-lg border px-4 py-3 text-sm ${
            message.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-700'
          }`}>
            {message.text}
          </div>
        )}

        {/* Liste des documents */}
        <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <BookOpen className="w-4 h-4" /> Documents importés ({documents.length})
            </h2>
            <button onClick={fetchDocuments} className="text-xs text-gray-500 hover:text-gray-800 inline-flex items-center gap-1">
              <RefreshCw className="w-3.5 h-3.5" /> Actualiser
            </button>
          </div>

          {loading ? (
            <div className="p-8 text-center text-gray-400 text-sm">
              <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" /> Chargement…
            </div>
          ) : documents.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-sm">
              Aucun document. Importez la liste des fournitures pour que le chatbot puisse répondre aux parents.
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {documents.map((doc) => {
                const badge = STATUS_BADGE[doc.status] || STATUS_BADGE.processing;
                const BadgeIcon = badge.icon;
                const isOpen = expanded === doc.id;
                return (
                  <li key={doc.id} className="px-4 py-3">
                    <div className="flex items-start gap-3">
                      <button onClick={() => toggleExpand(doc)} className="mt-0.5 text-gray-400 hover:text-gray-700">
                        {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </button>
                      <FileText className="w-5 h-5 text-indigo-500 flex-shrink-0 mt-0.5" />

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-gray-900 truncate">{doc.title}</span>
                          <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border ${badge.cls}`}>
                            <BadgeIcon className={`w-3 h-3 ${doc.status === 'processing' ? 'animate-spin' : ''}`} />
                            {badge.label}
                          </span>
                          {!doc.is_active && (
                            <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 border border-gray-200">
                              Désactivé
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
                          <span>{categoryLabel(doc.category)}</span>
                          <span>•</span>
                          <label className="inline-flex items-center gap-1">
                            <span className="sr-only">Année scolaire</span>
                            <input
                              defaultValue={doc.academic_year || ''}
                              onBlur={(e) => handleYearChange(doc, e.target.value)}
                              onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
                              placeholder="2026-2027"
                              title="Année scolaire imprimée sur le PDF envoyé aux parents"
                              className="w-24 px-1.5 py-0.5 rounded border border-transparent hover:border-gray-300 focus:border-indigo-400 focus:bg-white text-xs text-gray-700 bg-transparent"
                            />
                          </label>
                          <span>•</span>
                          {isAsIs(doc)
                            ? <span className="text-gray-600">Envoyé tel quel</span>
                            : <span>{`${doc.sections_count} niveau${doc.sections_count > 1 ? 'x' : ''}`}</span>}
                        </div>
                        {doc.error_message && (
                          <p className="text-xs text-red-600 mt-1">{doc.error_message}</p>
                        )}
                        {doc.levels?.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {doc.levels.map((l, i) => (
                              <span key={i} className="text-[11px] px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-100">
                                {l}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={() => handleToggleActive(doc)}
                          disabled={busyId === doc.id}
                          title={doc.is_active ? 'Désactiver pour le chatbot' : 'Activer pour le chatbot'}
                          className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500"
                        >
                          {doc.is_active
                            ? <ToggleRight className="w-5 h-5 text-emerald-600" />
                            : <ToggleLeft className="w-5 h-5" />}
                        </button>
                        <button
                          onClick={() => handleReanalyze(doc)}
                          disabled={busyId === doc.id}
                          title="Relancer l'analyse du PDF"
                          className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500"
                        >
                          <RefreshCw className={`w-4 h-4 ${busyId === doc.id ? 'animate-spin' : ''}`} />
                        </button>
                        <button
                          onClick={() => handleDelete(doc)}
                          disabled={busyId === doc.id}
                          title="Supprimer"
                          className="p-1.5 rounded-md hover:bg-red-50 text-red-500"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Document diffusé tel quel : rien à découper, on montre le fichier */}
                    {isOpen && isAsIs(doc) && (
                      <div className="mt-3 ml-11">
                        <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 flex items-center justify-between gap-3">
                          <p className="text-xs text-gray-600">
                            Le parent reçoit <strong>ce fichier tel quel</strong>, dans sa mise en page d'origine.
                            Son texte sert aussi à l'IA pour répondre aux questions.
                          </p>
                          {doc.file_url && (
                            <a
                              href={doc.file_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-gray-300 bg-white text-xs font-medium text-gray-700 hover:bg-gray-50 flex-shrink-0"
                            >
                              <Eye className="w-3.5 h-3.5" /> Ouvrir le document
                            </a>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Niveaux détectés (fournitures uniquement) */}
                    {isOpen && !isAsIs(doc) && (
                      <div className="mt-3 ml-11 space-y-2">
                        {(sections[doc.id] || []).length === 0 ? (
                          <p className="text-xs text-gray-400">Aucun niveau détecté dans ce document.</p>
                        ) : (
                          (sections[doc.id] || []).map((section) => (
                            <div key={section.id} className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-gray-800 truncate">
                                  {section.level_label}
                                  {section.level_code && (
                                    <span className="ml-2 text-[11px] text-indigo-600 font-semibold">{section.level_code}</span>
                                  )}
                                </p>
                                <p className="text-[11px] text-gray-500">
                                  {itemCount(section)} article(s)
                                  {section.content?.notes?.length ? ` • ${section.content.notes.length} consigne(s)` : ''}
                                </p>
                              </div>
                              <div className="flex items-center gap-1.5 flex-shrink-0">
                                <button
                                  onClick={() => handlePreview(section)}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-gray-300 bg-white text-xs font-medium text-gray-700 hover:bg-gray-50"
                                >
                                  <Eye className="w-3.5 h-3.5" /> Aperçu du PDF parent
                                </button>
                                <button
                                  onClick={() => handleDeleteSection(doc, section)}
                                  disabled={busyId === section.id}
                                  title="Supprimer ce niveau"
                                  className="p-1.5 rounded-md border border-gray-300 bg-white text-red-500 hover:bg-red-50 disabled:opacity-50"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
