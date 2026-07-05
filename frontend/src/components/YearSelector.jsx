import { Calendar } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useYear } from '../contexts/YearContext';
import { useAuth } from '../contexts/AuthContext';

// Seuls ces rôles peuvent choisir l'année (écran /select-year). Doit rester
// aligné avec YEAR_SELECT_ROLES de YearSelectionPage.jsx. Pour les autres
// (parent, élève, enseignant) l'année bascule automatiquement en septembre
// (defaultYear) et le badge n'est pas affiché — il serait un cul-de-sac.
const YEAR_SELECT_ROLES = ['admin', 'school_admin', 'pedagogical_director', 'finance_manager', 'pedagogical_manager'];

// Badge d'année active (cliquable). Le choix de l'année se fait sur l'écran
// dédié /select-year (après connexion, façon Koolskools) — pas de dropdown ici.
const YearSelector = ({ className = '' }) => {
  const { year } = useYear();
  const { profile } = useAuth();
  const navigate = useNavigate();

  // Masqué pour les rôles sans droit de changer d'année.
  if (!profile || !YEAR_SELECT_ROLES.includes(profile.role)) return null;

  return (
    <button
      type="button"
      onClick={() => navigate('/select-year')}
      title="Changer d'année scolaire"
      className={`flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-sm font-medium hover:bg-accent transition-colors ${className}`}
    >
      <Calendar className="w-4 h-4 text-primary shrink-0" />
      <span>{year}</span>
    </button>
  );
};

export default YearSelector;
