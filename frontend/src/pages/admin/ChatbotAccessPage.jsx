import { useState, useEffect, useMemo } from 'react';
import {
  Shield, AlertTriangle, Loader2, Save, Plus, Trash2, Pencil, X,
  MessageSquare, Image as ImageIcon, FileText, Bot, Eye, EyeOff,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card';

const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const getToken = async () => {
  const { supabase } = await import('../../lib/supabase');
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token;
};

const MENU_LABELS = {
  main: 'Menu principal',
  pedagogy: 'Suivi pédagogique',
  finance: 'Finance et paiements',
  schoollife: 'Vie scolaire',
  account: 'Configuration du compte',
};

const MENU_ORDER = ['main', 'pedagogy', 'finance', 'schoollife', 'account'];

const SENSITIVITY = {
  high: { label: 'Sensible', className: 'bg-red-100 text-red-700 border-red-200' },
  medium: { label: 'Nominatif', className: 'bg-amber-100 text-amber-700 border-amber-200' },
  low: { label: 'Général', className: 'bg-slate-100 text-slate-600 border-slate-200' },
};

const EMPTY_ENTRY = {
  title: '', body_text: '', menu_id: 'schoollife', emoji: '📌',
  show_in_menu: true, use_for_ai: false, keywords: '', is_active: true,
};

/**
 * Contrôle des données que le chatbot WhatsApp communique aux parents.
 *
 * Un interrupteur coupé agit sur trois plans à la fois : l'entrée disparaît du
 * menu, l'accès direct par numéro est refusé, et la donnée est retirée du
 * contexte envoyé au modèle en question libre.
 */
const ChatbotAccessPage = () => {
  const [capabilities, setCapabilities] = useState([]);
  const [entries, setEntries] = useState([]);
  const [dirty, setDirty] = useState({}); // capability_id -> is_enabled
  const [migrationNeeded, setMigrationNeeded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [editing, setEditing] = useState(null); // null | EMPTY_ENTRY | entrée existante
  const [file, setFile] = useState(null);
  const [busyEntry, setBusyEntry] = useState(false);

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    try {
      setLoading(true);
      const token = await getToken();
      const headers = { Authorization: `Bearer ${token}` };

      const [capRes, entriesRes] = await Promise.all([
        fetch(`${apiUrl}/api/admin/chatbot-access/capabilities`, { headers }),
        fetch(`${apiUrl}/api/admin/chatbot-access/entries`, { headers }),
      ]);

      const capData = await capRes.json();
      if (!capRes.ok) throw new Error(capData.error || 'Chargement impossible');

      setCapabilities(capData.capabilities || []);
      setMigrationNeeded(Boolean(capData.migration_needed));
      setEntries(entriesRes.ok ? await entriesRes.json() : []);
      setDirty({});
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // État affiché = valeur enregistrée, écrasée par la modification en attente.
  const valueOf = (cap) => (cap.id in dirty ? dirty[cap.id] : cap.is_enabled);

  const toggle = (cap) => {
    setDirty((prev) => {
      const next = { ...prev, [cap.id]: !valueOf(cap) };
      // Revenir à la valeur enregistrée annule la modification.
      if (next[cap.id] === cap.is_enabled) delete next[cap.id];
      return next;
    });
    setNotice('');
  };

  const save = async () => {
    const changes = Object.entries(dirty).map(([capability_id, is_enabled]) => ({ capability_id, is_enabled }));
    if (changes.length === 0) return;

    try {
      setSaving(true);
      setError('');
      const token = await getToken();
      const res = await fetch(`${apiUrl}/api/admin/chatbot-access/capabilities`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ changes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Enregistrement impossible');

      setCapabilities((prev) => prev.map((c) => (c.id in dirty ? { ...c, is_enabled: dirty[c.id] } : c)));
      setDirty({});
      setNotice('Modifications appliquées — effet immédiat sur le chatbot.');
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Contenus personnalisés ──────────────────────────────────────────────

  const saveEntry = async () => {
    if (!editing.title?.trim()) { setError('Le titre est obligatoire'); return; }
    if (!editing.body_text?.trim() && !file && !editing.media_url) {
      setError('Ajoutez un texte ou un fichier'); return;
    }

    try {
      setBusyEntry(true);
      setError('');
      const token = await getToken();

      const form = new FormData();
      ['title', 'body_text', 'menu_id', 'emoji'].forEach((k) => form.append(k, editing[k] ?? ''));
      ['show_in_menu', 'use_for_ai', 'is_active'].forEach((k) => form.append(k, String(Boolean(editing[k]))));
      form.append('keywords', Array.isArray(editing.keywords) ? editing.keywords.join(',') : (editing.keywords || ''));
      if (file) form.append('file', file);

      const isUpdate = Boolean(editing.id);
      const res = await fetch(
        `${apiUrl}/api/admin/chatbot-access/entries${isUpdate ? `/${editing.id}` : ''}`,
        { method: isUpdate ? 'PUT' : 'POST', headers: { Authorization: `Bearer ${token}` }, body: form },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Enregistrement impossible');

      setEditing(null);
      setFile(null);
      await fetchAll();
      setNotice(isUpdate ? 'Contenu mis à jour.' : 'Contenu ajouté au chatbot.');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyEntry(false);
    }
  };

  const deleteEntry = async (entry) => {
    if (!window.confirm(`Supprimer « ${entry.title} » ? Le contenu ne sera plus envoyé aux parents.`)) return;
    try {
      const token = await getToken();
      const res = await fetch(`${apiUrl}/api/admin/chatbot-access/entries/${entry.id}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Suppression impossible');
      await fetchAll();
    } catch (e) {
      setError(e.message);
    }
  };

  const grouped = useMemo(() => {
    const map = {};
    capabilities.forEach((c) => { (map[c.menu] = map[c.menu] || []).push(c); });
    return map;
  }, [capabilities]);

  const disabledCount = capabilities.filter((c) => !valueOf(c)).length;
  const pendingCount = Object.keys(dirty).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-24">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Shield className="w-6 h-6 text-primary" /> Données communiquées par le chatbot
        </h1>
        <p className="text-sm text-muted-foreground">
          Choisissez ce que le chatbot WhatsApp a le droit de transmettre aux parents,
          et ajoutez vos propres contenus.
        </p>
      </div>

      {migrationNeeded && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            Migration non exécutée : lancez <code>ADD_CHATBOT_ACCESS_CONTROL.sql</code> dans
            Supabase. En attendant, tout reste activé et vos modifications ne seront pas enregistrées.
          </span>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> <span>{error}</span>
        </div>
      )}
      {notice && (
        <div className="p-3 rounded-lg bg-green-50 border border-green-200 text-sm text-green-700">{notice}</div>
      )}

      <div className="flex items-start gap-2 p-3 rounded-lg bg-indigo-50 border border-indigo-200 text-sm text-indigo-900">
        <Bot className="w-4 h-4 mt-0.5 shrink-0" />
        <span>
          Couper une donnée agit sur <strong>trois plans</strong> : elle disparaît du menu,
          le numéro correspondant n'est plus reconnu, et elle est retirée du contexte envoyé
          à l'IA en question libre. Un parent ne peut donc pas la récupérer en reformulant.
          {disabledCount > 0 && <> Actuellement <strong>{disabledCount}</strong> donnée(s) coupée(s).</>}
        </span>
      </div>

      {MENU_ORDER.filter((m) => grouped[m]?.length).map((menuId) => (
        <Card key={menuId}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{MENU_LABELS[menuId]}</CardTitle>
            <CardDescription>
              {menuId === 'main'
                ? 'Couper une section masque tout son sous-menu.'
                : `${grouped[menuId].length} types de données`}
            </CardDescription>
          </CardHeader>
          <CardContent className="divide-y">
            {grouped[menuId].map((cap) => {
              const on = valueOf(cap);
              const changed = cap.id in dirty;
              const sens = SENSITIVITY[cap.sensitivity] || SENSITIVITY.low;
              return (
                <div key={cap.id} className={`flex items-start gap-3 py-3 ${changed ? 'bg-amber-50/60 -mx-4 px-4' : ''}`}>
                  <button
                    onClick={() => toggle(cap)}
                    role="switch"
                    aria-checked={on}
                    aria-label={`${on ? 'Désactiver' : 'Activer'} : ${cap.label}`}
                    className={`mt-0.5 relative w-11 h-6 rounded-full transition-colors shrink-0 ${on ? 'bg-green-500' : 'bg-gray-300'}`}
                  >
                    <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`text-sm font-medium ${on ? '' : 'text-muted-foreground line-through'}`}>
                        {cap.label}
                      </span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border ${sens.className}`}>{sens.label}</span>
                      {cap.aiScope && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded border bg-indigo-50 text-indigo-700 border-indigo-200">
                          aussi en question libre
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{cap.description}</p>
                  </div>
                  {on
                    ? <Eye className="w-4 h-4 text-green-600 shrink-0 mt-1" />
                    : <EyeOff className="w-4 h-4 text-gray-400 shrink-0 mt-1" />}
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}

      {/* ── Contenus ajoutés par l'école ── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">Contenus de l'école</CardTitle>
              <CardDescription>
                Texte, image ou PDF que vous ajoutez au chatbot : dans un menu, déclenché par mots-clés,
                et/ou comme source de connaissance pour l'IA.
              </CardDescription>
            </div>
            <button
              onClick={() => { setEditing({ ...EMPTY_ENTRY }); setFile(null); setError(''); }}
              className="flex items-center gap-1.5 px-3 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
            >
              <Plus className="w-4 h-4" /> Ajouter un contenu
            </button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {entries.length === 0 && (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Aucun contenu ajouté. Utilisez « Ajouter un contenu » pour publier un message, une image ou un PDF.
            </p>
          )}
          {entries.map((entry) => (
            <div key={entry.id} className="flex items-start gap-3 p-3 border rounded-lg">
              <span className="text-lg leading-none mt-0.5">{entry.emoji}</span>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`text-sm font-medium ${entry.is_active ? '' : 'text-muted-foreground line-through'}`}>
                    {entry.title}
                  </span>
                  {entry.show_in_menu && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                      menu : {MENU_LABELS[entry.menu_id]}
                    </span>
                  )}
                  {entry.keywords?.length > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">
                      mots-clés : {entry.keywords.join(', ')}
                    </span>
                  )}
                  {entry.use_for_ai && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700">source IA</span>
                  )}
                  {entry.media_type === 'image' && <ImageIcon className="w-3.5 h-3.5 text-blue-500" />}
                  {entry.media_type === 'document' && <FileText className="w-3.5 h-3.5 text-red-500" />}
                </div>
                {entry.body_text && (
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{entry.body_text}</p>
                )}
              </div>
              <button onClick={() => { setEditing({ ...entry, keywords: (entry.keywords || []).join(', ') }); setFile(null); }} className="p-1.5 hover:bg-muted rounded">
                <Pencil className="w-4 h-4" />
              </button>
              <button onClick={() => deleteEntry(entry)} className="p-1.5 text-red-500 hover:bg-red-50 rounded">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </CardContent>
      </Card>

      {editing && (
        <EntryEditor
          entry={editing}
          setEntry={setEditing}
          file={file}
          setFile={setFile}
          onCancel={() => { setEditing(null); setFile(null); }}
          onSave={saveEntry}
          busy={busyEntry}
        />
      )}

      {pendingCount > 0 && (
        <div className="fixed bottom-0 left-0 right-0 md:left-64 bg-background/95 backdrop-blur border-t p-3 flex items-center justify-between gap-3 z-20">
          <span className="text-sm text-muted-foreground">
            {pendingCount} modification(s) non enregistrée(s)
          </span>
          <div className="flex gap-2">
            <button onClick={() => setDirty({})} className="px-4 py-2 text-sm border rounded-lg hover:bg-muted">
              Annuler
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Enregistrer
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Éditeur de contenu ────────────────────────────────────────────────────

const EntryEditor = ({ entry, setEntry, file, setFile, onCancel, onSave, busy }) => {
  const set = (patch) => setEntry((e) => ({ ...e, ...patch }));

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-30" onClick={onCancel}>
      <div className="bg-background rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-background">
          <h2 className="font-semibold flex items-center gap-2">
            <MessageSquare className="w-5 h-5" />
            {entry.id ? 'Modifier le contenu' : 'Nouveau contenu'}
          </h2>
          <button onClick={onCancel} className="p-1 hover:bg-muted rounded"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-4 space-y-4">
          <div className="flex gap-3">
            <div className="w-20">
              <label className="text-xs font-medium">Emoji</label>
              <input
                value={entry.emoji || ''}
                onChange={(e) => set({ emoji: e.target.value })}
                className="w-full mt-1 border rounded-lg px-3 py-2 text-center"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs font-medium">Titre <span className="text-red-500">*</span></label>
              <input
                value={entry.title || ''}
                onChange={(e) => set({ title: e.target.value })}
                placeholder="Ex. Menu de la cantine"
                className="w-full mt-1 border rounded-lg px-3 py-2"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium">Message envoyé au parent</label>
            <textarea
              value={entry.body_text || ''}
              onChange={(e) => set({ body_text: e.target.value })}
              rows={5}
              placeholder="Le texte envoyé sur WhatsApp. Sert aussi de connaissance pour l'IA si l'option est cochée."
              className="w-full mt-1 border rounded-lg px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="text-xs font-medium">Fichier joint (image ou PDF)</label>
            <input
              type="file"
              accept="image/*,application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="w-full mt-1 text-sm"
            />
            {entry.file_name && !file && (
              <p className="text-xs text-muted-foreground mt-1">Fichier actuel : {entry.file_name}</p>
            )}
          </div>

          <div className="space-y-3 pt-2 border-t">
            <label className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" checked={Boolean(entry.show_in_menu)} onChange={(e) => set({ show_in_menu: e.target.checked })} className="mt-1 rounded" />
              <span className="text-sm">
                <strong>Afficher dans un menu</strong>
                <span className="block text-xs text-muted-foreground">Une nouvelle ligne apparaît dans le menu choisi.</span>
              </span>
            </label>

            {entry.show_in_menu && (
              <select
                value={entry.menu_id}
                onChange={(e) => set({ menu_id: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm ml-7"
                style={{ width: 'calc(100% - 1.75rem)' }}
              >
                {MENU_ORDER.map((m) => <option key={m} value={m}>{MENU_LABELS[m]}</option>)}
              </select>
            )}

            <div>
              <label className="text-xs font-medium">Mots-clés déclencheurs (séparés par des virgules)</label>
              <input
                value={typeof entry.keywords === 'string' ? entry.keywords : (entry.keywords || []).join(', ')}
                onChange={(e) => set({ keywords: e.target.value })}
                placeholder="cantine, repas, menu"
                className="w-full mt-1 border rounded-lg px-3 py-2 text-sm"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Dès qu'un parent écrit l'un de ces mots, le contenu part automatiquement. Laissez vide pour désactiver.
              </p>
            </div>

            <label className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" checked={Boolean(entry.use_for_ai)} onChange={(e) => set({ use_for_ai: e.target.checked })} className="mt-1 rounded" />
              <span className="text-sm">
                <strong>Source de connaissance pour l'IA</strong>
                <span className="block text-xs text-muted-foreground">Le texte alimente les réponses en question libre, sans être envoyé tel quel.</span>
              </span>
            </label>

            <label className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" checked={entry.is_active !== false} onChange={(e) => set({ is_active: e.target.checked })} className="mt-1 rounded" />
              <span className="text-sm"><strong>Actif</strong></span>
            </label>
          </div>
        </div>

        <div className="flex justify-end gap-2 p-4 border-t sticky bottom-0 bg-background">
          <button onClick={onCancel} className="px-4 py-2 text-sm border rounded-lg hover:bg-muted">Annuler</button>
          <button
            onClick={onSave}
            disabled={busy}
            className="flex items-center gap-2 px-5 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatbotAccessPage;
