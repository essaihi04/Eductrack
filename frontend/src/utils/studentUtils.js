// Générer un email basé sur le code massar (رقم التلميذ) et le nom de l'école
// Format: codemassar@nomecole.ma
export const generateEmail = (studentIdOrName, schoolNameOrId, schoolDomain) => {
  // Si un domaine d'école est fourni, utiliser codemassar@domaine
  if (schoolDomain) {
    const sanitizedId = String(studentIdOrName || '').trim().replace(/\s+/g, '');
    if (sanitizedId) {
      return `${sanitizedId}@${schoolDomain}`;
    }
  }
  // Fallback: utiliser nom+random@student.edu
  const sanitize = (str) => str.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/g, '');
  const first = sanitize(String(studentIdOrName || ''));
  const last = sanitize(String(schoolNameOrId || ''));
  const randomNum = Math.floor(Math.random() * 10000);
  return `${first}.${last}${randomNum}@student.edu`;
};

// Générer un mot de passe simple pour les élèves
// Format: PrénomAnnée (ex: Ahmed2025)
export const generatePassword = (firstName = '') => {
  const year = new Date().getFullYear();
  const cleanFirstName = firstName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z]/g, '')
    .trim();
  
  if (cleanFirstName) {
    // Première lettre en majuscule, reste en minuscule + année
    return cleanFirstName.charAt(0).toUpperCase() + cleanFirstName.slice(1).toLowerCase() + year;
  }
  
  // Fallback si pas de prénom
  return `Eleve${year}`;
};

// Créer un modèle Excel en arabe
export const createArabicExcelTemplate = () => {
  const template = [
    {
      'رقم التلميذ': '',
      'إسم التلميذ': '',
      'تاريخ الإزدياد': '',
      'الفرض الأول': '',
      'الفرض الثاني': '',
      'الأنشطة المندمجة': '',
      'ملاحظات الأستاذ': ''
    }
  ];
  return template;
};
