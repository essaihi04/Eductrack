import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
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

  // Compte chargé (ou changé) : on applique sa langue mémorisée, sinon français.
  useEffect(() => {
    setLangState(readStored(account) || DEFAULT_LANG);
  }, [account]);

  const setLang = useCallback((next) => {
    if (!DICTS[next]) return;
    setLangState(next);
    const key = storageKey(account);
    if (key) {
      try { localStorage.setItem(key, next); } catch (_) { /* stockage indisponible */ }
    }
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
