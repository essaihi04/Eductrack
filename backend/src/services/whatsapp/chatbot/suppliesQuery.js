// Détection partagée entre le chatbot WhatsApp et l'assistant intégré au
// compte parent. Ce module reste volontairement pur afin que chaque canal
// puisse reconnaître la demande sans charger la logique d'envoi WhatsApp.
const SUPPLIES_KEYWORDS_RE = new RegExp(
  [
    'fourniture', 'fournitures', 'liste scolaire', 'liste de rentree', 'liste de rentrée',
    'materiel scolaire', 'matériel scolaire', 'affaires scolaires', 'cartable',
    'liste des affaires', 'papeterie', 'liste des livres', 'liste du materiel',
    'لوازم', 'اللوازم', 'اللوازم المدرسية', 'الادوات المدرسية', 'الأدوات المدرسية',
    'ادوات مدرسية', 'المستلزمات', 'مستلزمات', 'لائحة اللوازم', 'الكتب المدرسية',
    'lawazim', 'lwazim', 'adawat', 'lista dyal', 'cartabl',
  ].join('|'),
  'i',
);

export function isSuppliesQuery(text) {
  return SUPPLIES_KEYWORDS_RE.test(String(text || ''));
}
