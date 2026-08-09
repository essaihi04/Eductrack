import { Languages } from 'lucide-react';
import { useI18n, LANGUAGES } from '../i18n';
import { cn } from '../lib/utils';

/**
 * Bascule français ↔ arabe (bas de la barre latérale).
 * Le choix est mémorisé pour le compte connecté et bascule aussi la mise en
 * page en RTL quand l'arabe est sélectionné.
 */
const LanguageSwitcher = ({ className = '' }) => {
  const { lang, setLang, t } = useI18n();

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Languages className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />
      <div
        role="group"
        aria-label={t('lang.switch')}
        className="flex flex-1 rounded-lg border border-border overflow-hidden"
      >
        {LANGUAGES.map((option) => (
          <button
            key={option.code}
            type="button"
            onClick={() => setLang(option.code)}
            aria-pressed={lang === option.code}
            title={t('lang.switch')}
            className={cn(
              'flex-1 px-2 py-1.5 text-xs font-medium transition-colors',
              lang === option.code
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
};

export default LanguageSwitcher;
