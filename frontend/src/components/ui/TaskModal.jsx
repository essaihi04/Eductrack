import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

/**
 * Fenêtre compacte pour les actions professeur.
 *
 * Sur ordinateur, son contenu est conçu pour tenir dans l'écran sans barre de
 * défilement. Sur un très petit écran, un défilement interne reste disponible
 * en dernier recours, sans jamais déplacer la page située derrière.
 */
export default function TaskModal({
  open,
  onClose,
  onSubmit,
  title,
  subtitle,
  children,
  footer,
  busy = false,
  closeLabel = 'Fermer',
  maxWidth = 'max-w-3xl',
}) {
  const dialogRef = useRef(null);
  const busyRef = useRef(busy);
  const onCloseRef = useRef(onClose);

  useEffect(() => { busyRef.current = busy; }, [busy]);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    if (!open) return undefined;

    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event) => {
      if (event.key === 'Escape' && !busyRef.current) onCloseRef.current?.();
      if (event.key !== 'Tab') return;

      const focusable = [...(dialogRef.current?.querySelectorAll(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
      ) || [])];
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);

    const focusFrame = window.requestAnimationFrame(() => {
      const firstField = dialogRef.current?.querySelector('input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])');
      (firstField || dialogRef.current)?.focus();
    });

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
      previousFocus?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  const Content = onSubmit ? 'form' : 'div';

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 p-3 backdrop-blur-[1px] sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose?.();
      }}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`flex max-h-[calc(100dvh-1.5rem)] w-full ${maxWidth} flex-col overflow-hidden rounded-2xl bg-white shadow-2xl sm:max-h-[calc(100dvh-2rem)]`}
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-gray-100 px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-gray-900 sm:text-xl">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-gray-500 sm:text-sm">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={() => !busy && onClose?.()}
            disabled={busy}
            aria-label={closeLabel}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-800 disabled:opacity-40"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <Content onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 md:overflow-visible sm:px-5">
            {children}
          </div>
          {footer && (
            <footer className="flex shrink-0 gap-2 border-t border-gray-100 bg-gray-50/80 px-4 py-3 sm:justify-end sm:px-5">
              {footer}
            </footer>
          )}
        </Content>
      </section>
    </div>
  );
}
