import { useState, useRef, useEffect } from 'react';
import { Building2, Check, ChevronDown, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

// Sélecteur d'établissement : permet à un compte rattaché à plusieurs écoles
// (ex: primaire + lycée) de basculer l'école active. Masqué si une seule école.
const SchoolSwitcher = ({ className = '' }) => {
  const { school, availableSchools, switchSchool } = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  if (!availableSchools || availableSchools.length < 2) return null;

  const handlePick = async (id) => {
    if (id === school?.id || busy) { setOpen(false); return; }
    setBusy(true);
    try {
      await switchSchool(id);
      // Recharge l'app pour que toutes les pages repartent sur la nouvelle école active.
      window.location.reload();
    } catch (e) {
      // eslint-disable-next-line no-alert
      alert(e.message || 'Changement d’école impossible');
      setBusy(false);
    }
  };

  return (
    <div className={`relative ${className}`} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Changer d'établissement"
        className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-sm font-medium hover:bg-accent transition-colors max-w-[200px]"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" /> : <Building2 className="w-4 h-4 text-primary shrink-0" />}
        <span className="truncate">{school?.name || 'Établissement'}</span>
        <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
      </button>

      {open && (
        <div className="absolute right-0 mt-1 w-64 rounded-xl border border-border bg-card shadow-lg z-50 overflow-hidden">
          <div className="px-3 py-2 text-xs font-semibold text-muted-foreground border-b border-border">Établissements</div>
          {availableSchools.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => handlePick(s.id)}
              className="flex items-center gap-2 w-full px-3 py-2.5 text-sm hover:bg-accent text-left"
            >
              {s.logo_url
                ? <img src={s.logo_url} alt="" className="w-6 h-6 rounded object-cover shrink-0" />
                : <div className="w-6 h-6 rounded bg-primary/10 flex items-center justify-center shrink-0"><Building2 className="w-3.5 h-3.5 text-primary" /></div>}
              <span className="flex-1 truncate">{s.name}</span>
              {s.id === school?.id && <Check className="w-4 h-4 text-primary shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default SchoolSwitcher;
