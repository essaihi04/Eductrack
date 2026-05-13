// Utilitaires pour la détection automatique du type de tournée selon l'heure.
// 4 directions :
//   morning_pickup   : ramassage matin   (5h-10h59)
//   noon_dropoff     : retour midi       (11h-13h29)
//   afternoon_pickup : ramassage après-midi (13h30-15h59)
//   evening_dropoff  : retour soir       (16h-23h59)

export const DIRECTIONS = {
  morning_pickup: {
    key: 'morning_pickup',
    label: 'Ramassage matin',
    short: '☀️ Matin',
    icon: '☀️',
    isPickup: true,
    color: 'amber',
    typicalRange: '6h - 10h',
    description: 'Aller chercher les élèves',
  },
  noon_dropoff: {
    key: 'noon_dropoff',
    label: 'Retour midi',
    short: '🍽️ Midi',
    icon: '🍽️',
    isPickup: false,
    color: 'sky',
    typicalRange: '11h - 13h',
    description: 'Ramener les élèves à la maison',
  },
  afternoon_pickup: {
    key: 'afternoon_pickup',
    label: 'Ramassage après-midi',
    short: '🌤️ Après-midi',
    icon: '🌤️',
    isPickup: true,
    color: 'orange',
    typicalRange: '13h - 16h',
    description: 'Aller chercher les élèves',
  },
  evening_dropoff: {
    key: 'evening_dropoff',
    label: 'Retour soir',
    short: '🌙 Soir',
    icon: '🌙',
    isPickup: false,
    color: 'indigo',
    typicalRange: '17h - 18h',
    description: 'Ramener les élèves à la maison',
  },
};

// Renvoie la direction la plus probable selon l'heure courante (avec souplesse ±1h)
export function suggestDirectionByTime(now = new Date()) {
  const h = now.getHours() + now.getMinutes() / 60;
  if (h >= 5 && h < 11) return 'morning_pickup';
  if (h >= 11 && h < 13.5) return 'noon_dropoff';
  if (h >= 13.5 && h < 16) return 'afternoon_pickup';
  return 'evening_dropoff';
}

// Indique si la direction est un ramassage (sinon : un retour/dropoff)
export function isPickupDirection(direction) {
  return direction === 'morning_pickup' || direction === 'afternoon_pickup';
}

// Libellé court (compat. ancien code avec 2 directions)
export function directionShort(direction) {
  return DIRECTIONS[direction]?.short || direction;
}

// Libellé complet
export function directionLabel(direction) {
  return DIRECTIONS[direction]?.label || direction;
}
