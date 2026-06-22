import { Calendar } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useYear } from '../contexts/YearContext';

// Badge d'année active (cliquable). Le choix de l'année se fait sur l'écran
// dédié /select-year (après connexion, façon Koolskools) — pas de dropdown ici.
const YearSelector = ({ className = '' }) => {
  const { year } = useYear();
  const navigate = useNavigate();

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
