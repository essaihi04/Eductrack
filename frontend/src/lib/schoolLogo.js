// Chargement du logo de l'école (uploadé par le super admin) pour l'insérer
// dans les PDF générés côté navigateur avec jsPDF (doc.addImage).
//
// Le logo_url pointe en général vers Supabase Storage (URL publique). On charge
// l'image dans un <canvas> pour obtenir un dataURL PNG exploitable par jsPDF,
// et on met le résultat en cache (les logos changent rarement).

const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:3000';

/** Résout l'URL absolue du logo à partir de l'objet école (ou d'une URL brute). */
export function resolveLogoUrl(schoolOrUrl) {
  let url = typeof schoolOrUrl === 'string' ? schoolOrUrl : schoolOrUrl?.logo_url;
  if (!url) return null;
  // Répare un schéma corrompu « https//… » (deux-points manquant) : sans lui, le
  // navigateur traite l'URL comme relative et la préfixe par l'origine du site.
  url = url.replace(/^(https?)\/\//i, '$1://');
  if (/^https?:\/\//i.test(url)) return url; // déjà absolue (Supabase Storage…)
  if (url.startsWith('//')) return `https:${url}`; // protocole-relative
  return `${apiBase}${url.startsWith('/') ? '' : '/'}${url}`; // chemin local hérité
}

const _cache = new Map(); // src -> { dataUrl, width, height } | null

/**
 * Charge le logo de l'école sous forme exploitable par jsPDF.
 * @returns {Promise<{ dataUrl: string, width: number, height: number } | null>}
 */
export async function loadLogoForPdf(school) {
  const src = resolveLogoUrl(school);
  if (!src) return null;
  if (_cache.has(src)) return _cache.get(src);

  const result = await new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        canvas.getContext('2d').drawImage(img, 0, 0);
        resolve({ dataUrl: canvas.toDataURL('image/png'), width: img.naturalWidth, height: img.naturalHeight });
      } catch (_) {
        resolve(null); // image « tainted » (CORS) ou format non décodable
      }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });

  _cache.set(src, result);
  return result;
}

/**
 * Dessine le logo dans un PDF jsPDF en respectant le ratio, contraint à une
 * boîte maxW × maxH. Retourne la largeur réellement dessinée (0 si rien).
 */
export function addLogoToPdf(doc, logo, x, y, maxW, maxH) {
  if (!logo) return 0;
  try {
    const ratio = logo.width / logo.height || 1;
    let w = maxW, h = maxW / ratio;
    if (h > maxH) { h = maxH; w = maxH * ratio; }
    doc.addImage(logo.dataUrl, 'PNG', x, y, w, h);
    return w;
  } catch (_) {
    return 0;
  }
}
