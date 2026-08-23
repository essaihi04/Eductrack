import { useEffect, useState } from 'react';
import { Bot, Sparkles } from 'lucide-react';
import { useParentAssistant } from '../../contexts/ParentAssistantContext';
import { useI18n } from '../../i18n';
import { ParentAssistantPanel } from '../../pages/parent/ParentAssistantPage';

const ParentAssistantWidget = () => {
  const { dir, t } = useI18n();
  const { isOpen, requestedChildId, openAssistant, closeAssistant } = useParentAssistant();
  const [hasOpened, setHasOpened] = useState(false);
  const side = dir === 'rtl' ? 'left-4 md:left-6' : 'right-4 md:right-6';

  useEffect(() => {
    if (isOpen) setHasOpened(true);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') closeAssistant();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [closeAssistant, isOpen]);

  return (
    <>
      {!isOpen && (
        <div className={`fixed bottom-20 md:bottom-6 ${side} z-[60] group`}>
          <div className={`absolute bottom-full mb-2 ${dir === 'rtl' ? 'left-0' : 'right-0'} hidden md:block whitespace-nowrap rounded-xl bg-gray-900 px-3 py-2 text-xs font-medium text-white opacity-0 shadow-lg transition group-hover:opacity-100`}>
            {t('passist.openHint')}
          </div>
          <button
            type="button"
            onClick={() => openAssistant()}
            aria-label={t('passist.open')}
            className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 via-violet-500 to-purple-600 text-white shadow-xl shadow-violet-500/30 transition hover:-translate-y-1 hover:shadow-2xl focus:outline-none focus:ring-4 focus:ring-violet-300"
          >
            <Bot className="h-7 w-7" />
            <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-emerald-500">
              <Sparkles className="h-2.5 w-2.5" />
            </span>
            <span className="absolute -bottom-1 -left-1 h-3.5 w-3.5 rounded-full border-2 border-white bg-emerald-400" />
          </button>
        </div>
      )}

      {isOpen && (
        <button
          type="button"
          className="fixed inset-0 z-[60] bg-black/30 md:hidden"
          onClick={closeAssistant}
          aria-label={t('passist.close')}
        />
      )}

      {hasOpened && (
        <section
          aria-label={t('passist.title')}
          aria-hidden={!isOpen}
          className={`fixed inset-x-2 bottom-20 top-16 z-[70] overflow-hidden rounded-2xl bg-card shadow-2xl ring-1 ring-black/10 transition-all duration-200 md:inset-auto md:bottom-6 md:h-[min(680px,calc(100vh-3rem))] md:w-[420px] ${side} ${
            isOpen ? 'translate-y-0 scale-100 opacity-100' : 'pointer-events-none translate-y-3 scale-95 opacity-0'
          }`}
        >
          <ParentAssistantPanel
            compact
            onClose={closeAssistant}
            requestedChildId={requestedChildId}
          />
        </section>
      )}
    </>
  );
};

export default ParentAssistantWidget;
