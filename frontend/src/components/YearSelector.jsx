import { Calendar } from 'lucide-react';
import { useYear } from '../contexts/YearContext';

// Sélecteur d'année scolaire active, affiché en permanence dans l'en-tête.
const YearSelector = ({ className = '' }) => {
  const { year, setYear, years } = useYear();

  // Toujours proposer l'année active même si elle n'est pas (encore) dans la liste.
  const options = years.includes(year) ? years : [year, ...years];

  return (
    <div
      className={`flex items-center gap-1.5 rounded-lg border border-border bg-card px-2 py-1.5 text-sm ${className}`}
      title="Année scolaire active"
    >
      <Calendar className="w-4 h-4 text-primary shrink-0" />
      <select
        value={year}
        onChange={(e) => setYear(e.target.value)}
        className="bg-transparent font-medium text-foreground outline-none cursor-pointer pr-1"
        aria-label="Année scolaire"
      >
        {options.map((y) => (
          <option key={y} value={y}>{y}</option>
        ))}
      </select>
    </div>
  );
};

export default YearSelector;
