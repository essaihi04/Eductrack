import { useMemo, useState } from 'react';
import { MOROCCAN_CITIES } from '../../utils/moroccanCities';

const normalize = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase('fr')
  .trim();

export default function MoroccanCityInput({ value, onChange, className = '', id }) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const query = normalize(value);

  const suggestions = useMemo(() => (
    query
      ? MOROCCAN_CITIES.filter((city) => normalize(city).startsWith(query))
      : MOROCCAN_CITIES
  ), [query]);

  const choose = (city) => {
    onChange(city);
    setOpen(false);
    setActiveIndex(-1);
  };

  const handleKeyDown = (event) => {
    if (event.key === 'ArrowDown' && suggestions.length > 0) {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => Math.min(current + 1, suggestions.length - 1));
    } else if (event.key === 'ArrowUp' && suggestions.length > 0) {
      event.preventDefault();
      setActiveIndex((current) => Math.max(current - 1, 0));
    } else if (event.key === 'Enter' && open && activeIndex >= 0) {
      event.preventDefault();
      choose(suggestions[activeIndex]);
    } else if (event.key === 'Escape') {
      setOpen(false);
      setActiveIndex(-1);
    }
  };

  const listId = `${id || 'moroccan-city'}-suggestions`;

  return (
    <div className="relative">
      <input
        id={id}
        type="text"
        autoComplete="off"
        className={className}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
          setActiveIndex(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          setOpen(false);
          setActiveIndex(-1);
        }}
        onKeyDown={handleKeyDown}
        placeholder="Écrire ou rechercher une ville"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
      />

      {open && (
        <div
          id={listId}
          role="listbox"
          className="absolute z-40 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
        >
          {suggestions.length > 0 ? suggestions.map((city, index) => (
            <button
              key={city}
              id={`${listId}-${index}`}
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              className={`block w-full px-3 py-2 text-left text-sm hover:bg-blue-50 ${index === activeIndex ? 'bg-blue-50 text-blue-700' : 'text-gray-700'}`}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => choose(city)}
            >
              {city}
            </button>
          )) : (
            <p className="px-3 py-2 text-sm text-gray-500">
              Ville absente de la liste : vous pouvez conserver votre saisie manuelle.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
