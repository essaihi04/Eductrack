import { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import { enrollmentsApi } from '../lib/enrollmentsApi';
import { defaultYear } from '../lib/schoolYear';

const YearContext = createContext({});

const STORAGE_KEY = 'active_academic_year';

export const useYear = () => {
  const context = useContext(YearContext);
  if (!context) {
    throw new Error('useYear must be used within YearProvider');
  }
  return context;
};

export const YearProvider = ({ children }) => {
  const { user, profile } = useAuth();
  const [year, setYearState] = useState(() => localStorage.getItem(STORAGE_KEY) || defaultYear());
  const [years, setYears] = useState([]);
  const [loading, setLoading] = useState(false);

  const setYear = (y) => {
    setYearState(y);
    try { localStorage.setItem(STORAGE_KEY, y); } catch (_) { /* ignore */ }
  };

  useEffect(() => {
    // Charger la liste des années dès qu'un profil est disponible.
    if (!user || !profile) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { years: list, current } = await enrollmentsApi.listSchoolYears();
        if (cancelled) return;
        setYears(list || []);
        // Si aucune année stockée OU année stockée absente de la liste → année courante.
        const stored = localStorage.getItem(STORAGE_KEY);
        if (!stored || !(list || []).includes(stored)) {
          setYear(current || defaultYear());
        }
      } catch (e) {
        console.error('[YearContext] Erreur chargement années:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user, profile]);

  return (
    <YearContext.Provider value={{ year, setYear, years, loading }}>
      {children}
    </YearContext.Provider>
  );
};
