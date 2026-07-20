/**
 * Remplaçant de window.prompt() — INDISPENSABLE dans les apps natives.
 *
 * Electron (desktop) et le WebView Capacitor (mobile) n'implémentent pas
 * prompt() : l'appel lève « prompt() is not supported » et l'action est
 * bloquée (ex : impossible de supprimer un frais faute de pouvoir saisir le
 * motif). alert() et confirm() fonctionnent, eux — seul prompt manque.
 *
 * Implémentation en DOM natif (pas de composant React) pour être appelable
 * depuis n'importe quel gestionnaire d'événement, sans provider ni contexte.
 *
 * Contrat identique à window.prompt, mais ASYNCHRONE :
 *   const motif = await askPrompt('Motif ?');
 *   if (motif === null) return;   // annulé
 *
 * @param {string} message  texte affiché (les \n sont respectés)
 * @param {string} [defaultValue] valeur pré-remplie
 * @param {{ okLabel?: string, cancelLabel?: string, placeholder?: string, type?: string }} [options]
 * @returns {Promise<string|null>} la saisie, ou null si annulé
 */
export function askPrompt(message, defaultValue = '', options = {}) {
  return new Promise((resolve) => {
    const { okLabel = 'Valider', cancelLabel = 'Annuler', placeholder = '', type = 'text' } = options;

    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 z-[9999] bg-black/40 flex items-center justify-center p-4';

    const box = document.createElement('div');
    box.className = 'bg-white rounded-2xl shadow-xl w-full max-w-md p-4 space-y-3';
    overlay.appendChild(box);

    const text = document.createElement('p');
    text.className = 'text-sm text-gray-700 whitespace-pre-line';
    text.textContent = message || '';
    box.appendChild(text);

    const input = document.createElement('input');
    input.type = type;
    input.value = defaultValue == null ? '' : String(defaultValue);
    input.placeholder = placeholder;
    input.className = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none';
    box.appendChild(input);

    const actions = document.createElement('div');
    actions.className = 'flex items-center justify-end gap-2';
    box.appendChild(actions);

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.textContent = cancelLabel;
    cancelBtn.className = 'px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg';
    actions.appendChild(cancelBtn);

    const okBtn = document.createElement('button');
    okBtn.type = 'button';
    okBtn.textContent = okLabel;
    okBtn.className = 'px-4 py-1.5 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium';
    actions.appendChild(okBtn);

    let done = false;
    const close = (value) => {
      if (done) return;
      done = true;
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      resolve(value);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); close(null); }
      else if (e.key === 'Enter' && document.activeElement === input) { e.preventDefault(); close(input.value); }
    };

    okBtn.addEventListener('click', () => close(input.value));
    cancelBtn.addEventListener('click', () => close(null));
    // Clic sur le fond (hors boîte) = annulation.
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(null); });
    document.addEventListener('keydown', onKey, true);

    document.body.appendChild(overlay);
    input.focus();
    input.select();
  });
}

export default askPrompt;
