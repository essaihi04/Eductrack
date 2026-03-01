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
  
  // Noms de mois en français et arabe → numéro
  const monthsFr = {
    'janvier': 1, 'février': 2, 'fevrier': 2, 'mars': 3, 'avril': 4,
    'mai': 5, 'juin': 6, 'juillet': 7, 'août': 8, 'aout': 8,
    'septembre': 9, 'octobre': 10, 'novembre': 11, 'décembre': 12, 'decembre': 12
  };
  const monthsAr = {
    'يناير': 1, 'فبراير': 2, 'مارس': 3, 'أبريل': 4, 'ابريل': 4,
    'ماي': 5, 'يونيو': 6, 'يوليوز': 7, 'غشت': 8, 'شتنبر': 9,
    'أكتوبر': 10, 'اكتوبر': 10, 'نونبر': 11, 'دجنبر': 12
  };

  // Chercher "DD mois" ou "DD mois YYYY" en français
  for (const [monthName, monthNum] of Object.entries(monthsFr)) {
    const patterns = [
      new RegExp(`(\\d{1,2})\\s+${monthName}\\s+(\\d{4})`),  // DD mois YYYY
      new RegExp(`(\\d{1,2})\\s+${monthName}(?!\\w)`)         // DD mois (sans année)
    ];
    for (const pattern of patterns) {
      const match = lower.match(pattern);
      if (match) {
        const day = parseInt(match[1], 10);
        const year = match[2] ? parseInt(match[2], 10) : today.getFullYear();
        if (day >= 1 && day <= 31) {
          const date = new Date(year, monthNum - 1, day);
          if (!isNaN(date.getTime())) {
            return date.toISOString().split('T')[0];
          }
        }
      }
    }
  }

  // Chercher "DD mois" en arabe
  for (const [monthName, monthNum] of Object.entries(monthsAr)) {
    const pattern = new RegExp(`(\\d{1,2})\\s+${monthName}`);
    const match = message.match(pattern);
    if (match) {
      const day = parseInt(match[1], 10);
      const year = today.getFullYear();
      if (day >= 1 && day <= 31) {
        const date = new Date(year, monthNum - 1, day);
        if (!isNaN(date.getTime())) {
          return date.toISOString().split('T')[0];
        }
      }
    }
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

// Extraire un mois spécifique d'un message (pour les requêtes mensuelles)
// Retourne { month: 1-12, year: YYYY } ou null
function extractMonthFromMessage(message) {
  const lower = message.toLowerCase().trim();
  const today = new Date();

  const monthsFr = {
    'janvier': 1, 'février': 2, 'fevrier': 2, 'mars': 3, 'avril': 4,
    'mai': 5, 'juin': 6, 'juillet': 7, 'août': 8, 'aout': 8,
    'septembre': 9, 'octobre': 10, 'novembre': 11, 'décembre': 12, 'decembre': 12
  };
  const monthsAr = {
    'يناير': 1, 'فبراير': 2, 'مارس': 3, 'أبريل': 4, 'ابريل': 4,
    'ماي': 5, 'يونيو': 6, 'يوليوز': 7, 'غشت': 8, 'شتنبر': 9,
    'أكتوبر': 10, 'اكتوبر': 10, 'نونبر': 11, 'دجنبر': 12
  };

  // Patterns: "mois 2", "moi 2" (faute de frappe), "شهر 2"
  const numMatch = lower.match(/\b(?:mois|moi|شهر|شهر رقم)\b\s*(?:de\s+)?(\d{1,2})\b/);
  if (numMatch) {
    const month = parseInt(numMatch[1], 10);
    if (month >= 1 && month <= 12) {
      return { month, year: today.getFullYear() };
    }
  }

  // "tout le mois de février", "tt le mois 2", "pour le mois de mars"
  const keywordsMonth = /\b(?:tout|tt|pour|كل|طول)\b.{0,10}\b(?:mois|moi)\b.{0,5}(\d{1,2})\b/;
  const kwMatch = lower.match(keywordsMonth);
  if (kwMatch) {
    const month = parseInt(kwMatch[1], 10);
    if (month >= 1 && month <= 12) {
      return { month, year: today.getFullYear() };
    }
  }

  // Nom de mois en lettres français: avec word boundary pour éviter faux positifs (mai dans semaine)
  for (const [monthName, monthNum] of Object.entries(monthsFr)) {
    const monthRegex = new RegExp(`\\b${monthName}\\b`);
    if (monthRegex.test(lower)) {
      // Vérifier qu'il y a un contexte mensuel (pas une date précise avec un jour)
      const hasDay = lower.match(new RegExp(`\\d{1,2}\\s+${monthName}`));
      if (!hasDay) {
        const yearMatch = lower.match(/\d{4}/);
        const year = yearMatch ? parseInt(yearMatch[0], 10) : today.getFullYear();
        return { month: monthNum, year };
      }
    }
  }

  // Nom de mois en arabe (avec word boundary)
  for (const [monthName, monthNum] of Object.entries(monthsAr)) {
    const monthRegex = new RegExp(`(?:^|\\s)${monthName}(?:\\s|$)`);
    if (monthRegex.test(message)) {
      const hasDay = message.match(new RegExp(`\\d{1,2}\\s+${monthName}`));
      if (!hasDay) {
        return { month: monthNum, year: today.getFullYear() };
      }
    }
  }

  return null;
}

export { extractDateFromMessage, extractMonthFromMessage };
