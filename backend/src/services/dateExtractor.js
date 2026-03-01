// Extraire une date spécifique d'un message en français ou arabe
function extractDateFromMessage(message) {
  const lower = message.toLowerCase().trim();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  // Mots-clés relatifs
  if (lower.includes('aujourd\'hui') || lower.includes('اليوم')) {
    return today.toISOString().split('T')[0];
  }
  
  if (lower.includes('hier') || lower.includes('البارحة') || lower.includes('أمس')) {
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday.toISOString().split('T')[0];
  }
  
  if (lower.includes('demain') || lower.includes('غدا') || lower.includes('غدوة')) {
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  }
  
  // Avant-hier
  if (lower.includes('avant-hier') || lower.includes('avant hier') || lower.includes('أول أمس')) {
    const dayBefore = new Date(today);
    dayBefore.setDate(dayBefore.getDate() - 2);
    return dayBefore.toISOString().split('T')[0];
  }
  
  // Jours de la semaine en français
  const daysOfWeekFr = {
    'lundi': 1, 'mardi': 2, 'mercredi': 3, 'jeudi': 4, 'vendredi': 5, 'samedi': 6, 'dimanche': 0
  };
  
  // Jours de la semaine en arabe
  const daysOfWeekAr = {
    'الاثنين': 1, 'الثلاثاء': 2, 'الأربعاء': 3, 'الخميس': 4, 'الجمعة': 5, 'السبت': 6, 'الأحد': 0
  };
  
  // Chercher un jour de la semaine
  for (const [day, targetDay] of Object.entries(daysOfWeekFr)) {
    if (lower.includes(day)) {
      const currentDay = today.getDay();
      let diff = targetDay - currentDay;
      
      // Si "dernier" ou "passé", aller à la semaine précédente
      if (lower.includes('dernier') || lower.includes('passé') || lower.includes('dernière')) {
        diff = diff > 0 ? diff - 7 : diff;
      } else if (diff > 0) {
        // Par défaut, si le jour est dans le futur, prendre la semaine précédente
        diff -= 7;
      }
      
      const targetDate = new Date(today);
      targetDate.setDate(targetDate.getDate() + diff);
      return targetDate.toISOString().split('T')[0];
    }
  }
  
  for (const [day, targetDay] of Object.entries(daysOfWeekAr)) {
    if (lower.includes(day)) {
      const currentDay = today.getDay();
      let diff = targetDay - currentDay;
      
      if (lower.includes('الماضي') || lower.includes('الفارط')) {
        diff = diff > 0 ? diff - 7 : diff;
      } else if (diff > 0) {
        diff -= 7;
      }
      
      const targetDate = new Date(today);
      targetDate.setDate(targetDate.getDate() + diff);
      return targetDate.toISOString().split('T')[0];
    }
  }
  
  // Formats de dates: DD/MM, DD-MM, DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD
  const datePatterns = [
    /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/, // DD/MM/YYYY ou DD-MM-YYYY
    /(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/, // YYYY-MM-DD ou YYYY/MM/DD
    /(\d{1,2})[\/\-](\d{1,2})(?![\d\/\-])/   // DD/MM ou DD-MM (sans année)
  ];
  
  for (const pattern of datePatterns) {
    const match = message.match(pattern);
    if (match) {
      let year, month, day;
      
      if (pattern === datePatterns[0]) {
        // DD/MM/YYYY
        day = parseInt(match[1], 10);
        month = parseInt(match[2], 10);
        year = parseInt(match[3], 10);
      } else if (pattern === datePatterns[1]) {
        // YYYY-MM-DD
        year = parseInt(match[1], 10);
        month = parseInt(match[2], 10);
        day = parseInt(match[3], 10);
      } else {
        // DD/MM (sans année, utiliser l'année courante)
        day = parseInt(match[1], 10);
        month = parseInt(match[2], 10);
        year = today.getFullYear();
      }
      
      // Valider la date
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        const date = new Date(year, month - 1, day);
        if (!isNaN(date.getTime())) {
          return date.toISOString().split('T')[0];
        }
      }
    }
  }
  
  // Aucune date trouvée
  return null;
}

export { extractDateFromMessage };
