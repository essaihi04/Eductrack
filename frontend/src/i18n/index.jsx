import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import fr from './fr';
import ar from './ar';

/**
 * Internationalisation de l'interface (français ↔ arabe).
 *
 * Choix d'implémentation :
 *  - dictionnaires plats `clé → texte` (fr.js / ar.js) ; une clé absente en
 *    arabe retombe sur le français, jamais sur la clé brute ;
 *  - la langue est mémorisée PAR COMPTE (localStorage `edutrack.lang.<id>`) :
 *    sur un poste partagé, le choix d'un professeur ne change pas l'interface
 *    du compte administratif qui se connecte ensuite ;
 *  - `dir` (ltr/rtl) est posé sur <html> : toute l'app bascule en arabe.
 */

const DICTS = { fr, ar };
export const LANGUAGES = [
  { code: 'fr', label: 'Français', short: 'FR' },
  { code: 'ar', label: 'العربية', short: 'ع' },
];

const STORAGE_PREFIX = 'edutrack.lang';
const DEFAULT_LANG = 'fr';

const storageKey = (account) => (account ? `${STORAGE_PREFIX}.${account}` : null);

const readStored = (account) => {
  const key = storageKey(account);
  if (!key) return null;
  try {
    const value = localStorage.getItem(key);
    return DICTS[value] ? value : null;
  } catch (_) {
    return null;
  }
};

/**
 * Enregistre la langue sur le profil serveur.
 *
 * Indispensable pour WhatsApp : les notifications proactives partent du
 * backend, qui n'a évidemment aucun accès au localStorage du navigateur.
 * Sans cet appel, un parent ayant choisi l'arabe dans l'app continuerait de
 * recevoir ses templates en français.
 */
const persistLang = async (lang) => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) return; // pas connecté : le localStorage suffit
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
    await fetch(`${apiUrl}/api/auth/profile`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ preferred_language: lang }),
    });
  } catch (_) {
    // Hors ligne ou serveur indisponible : l'interface reste dans la langue
    // choisie, la synchronisation se fera au prochain changement.
  }
};

/** Remplace les jetons `{{nom}}` par les valeurs fournies. */
const interpolate = (text, vars) => {
  if (!vars || typeof text !== 'string') return text;
  return text.replace(/\{\{(\w+)\}\}/g, (match, name) => (
    vars[name] === undefined || vars[name] === null ? match : String(vars[name])
  ));
};

const I18nContext = createContext({
  lang: DEFAULT_LANG,
  dir: 'ltr',
  setLang: () => {},
  t: (key) => fr[key] || key,
});

export const useI18n = () => useContext(I18nContext);

/** Raccourci pour les composants qui n'ont besoin que de la fonction de traduction. */
export const useT = () => useI18n().t;

export const LanguageProvider = ({ children }) => {
  const { profile } = useAuth();
  const account = profile?.id || profile?.email || null;
  const [lang, setLangState] = useState(DEFAULT_LANG);

  // Compte chargé (ou changé) : le profil SERVEUR fait autorité, car c'est lui
  // qui pilote la langue des envois WhatsApp. Le localStorage reste le repli
  // (premier rendu, hors ligne, compte non connecté).
  useEffect(() => {
    const duServeur = DICTS[profile?.preferred_language] ? profile.preferred_language : null;
    const local = readStored(account);
    setLangState(duServeur || local || DEFAULT_LANG);
    // Choix fait avant l'existence de la colonne : on le remonte une fois,
    // sinon ces comptes recevraient leurs WhatsApp en français indéfiniment.
    if (!duServeur && local && profile?.id) persistLang(local);
  }, [account, profile?.id, profile?.preferred_language]);

  const setLang = useCallback((next) => {
    if (!DICTS[next]) return;
    setLangState(next);
    const key = storageKey(account);
    if (key) {
      try { localStorage.setItem(key, next); } catch (_) { /* stockage indisponible */ }
    }
    // Le choix est aussi enregistré côté serveur : il détermine la langue des
    // messages et des templates WhatsApp, que le localStorage ne peut pas
    // atteindre. Envoi « au mieux » — un échec ne doit pas gêner l'affichage.
    persistLang(next);
  }, [account]);

  const dir = lang === 'ar' ? 'rtl' : 'ltr';

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
  }, [lang, dir]);

  const t = useCallback((key, vars) => {
    const dict = DICTS[lang] || fr;
    const text = dict[key] ?? fr[key] ?? key;
    return interpolate(text, vars);
  }, [lang]);

  const value = useMemo(() => ({ lang, dir, setLang, t }), [lang, dir, setLang, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};
