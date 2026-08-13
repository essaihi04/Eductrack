/**
 * Conversion PDF → pages exploitables par l'import IA d'emploi du temps.
 *
 * Le rendu est fait dans le navigateur (canvas) plutôt que sur le serveur :
 * aucune dépendance native à installer, et cela fonctionne aussi dans les
 * WebView Electron et Capacitor.
 *
 * Pour chaque page on produit DEUX choses :
 *  - une image PNG : indispensable pour les PDF scannés et les photos ;
 *  - le texte de la couche texte, quand le PDF en a une. Le serveur préfère ce
 *    texte à l'image (plus fiable, et il passe par le modèle texte déjà
 *    configuré au lieu d'un modèle de vision).
 */
import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

/** Échelle de rendu : 2 donne un texte net pour l'OCR sans exploser la taille. */
const RENDER_SCALE = 2;
const MAX_WIDTH = 2200;

const canvasToBlob = (canvas) =>
  new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));

/**
 * @param {File} file  un PDF
 * @param {(done:number,total:number)=>void} onProgress
 * @returns {Promise<Array<{ name, blob, text, source, pageNumber }>>}
 */
export async function pdfToPages(file, onProgress) {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const pages = [];

  for (let n = 1; n <= pdf.numPages; n += 1) {
    const page = await pdf.getPage(n);

    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(RENDER_SCALE, MAX_WIDTH / base.width);
    const viewport = page.getViewport({ scale: Math.max(1, scale) });

    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const context = canvas.getContext('2d');
    // Fond blanc : un PDF transparent rendu sur canvas donne du noir sur noir.
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({ canvasContext: context, viewport }).promise;
    const blob = await canvasToBlob(canvas);

    let text = '';
    try {
      const content = await page.getTextContent();
      text = content.items.map((i) => i.str).join(' ').replace(/\s+/g, ' ').trim();
    } catch {
      // Page sans couche texte : l'image suffira, le serveur passera en vision.
      text = '';
    }

    pages.push({
      name: `${file.name} — page ${n}`,
      blob,
      text,
      source: text.length > 120 ? 'pdf-texte' : 'pdf-image',
      pageNumber: n,
    });

    // Libère la mémoire : un PDF de 20 pages en scale 2 sature vite un WebView.
    page.cleanup();
    canvas.width = 0;
    canvas.height = 0;

    if (onProgress) onProgress(n, pdf.numPages);
  }

  await pdf.destroy();
  return pages;
}

/**
 * Normalise une liste de fichiers hétérogènes (images + PDF) en une liste de
 * pages prêtes à être envoyées au serveur.
 */
export async function filesToPages(files, onProgress) {
  const pages = [];

  for (const file of files) {
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    if (isPdf) {
      const pdfPages = await pdfToPages(file, onProgress);
      pages.push(...pdfPages);
    } else {
      pages.push({ name: file.name, blob: file, text: '', source: 'image', pageNumber: 1 });
    }
  }

  return pages;
}
