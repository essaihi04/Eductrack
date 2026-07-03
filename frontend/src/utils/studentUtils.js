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

// Domaine email de l'école — même convention que l'import Excel (ClassesPage) :
// nom de l'école en minuscules, sans accents ni caractères spéciaux, + ".ma".
// Ex : « Groupe Scolaire Al Baida » → "groupescolairealbaida.ma".
export const schoolEmailDomain = (schoolName) => {
  const base = String(schoolName || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
  return `${base || 'ecole'}.ma`;
};

// Email d'un élève créé à la main — même convention que les élèves importés :
//   codemassar@nomecole.ma
// et si l'élève n'a pas encore de code Massar :
//   nom.prenom@nomecole.ma
export const generateStudentEmail = ({ massarCode, firstName, lastName, schoolName }) => {
  const domain = schoolEmailDomain(schoolName);
  const massar = String(massarCode || '').trim().replace(/\s+/g, '');
  if (massar) return `${massar}@${domain}`;
  const sanitize = (s) => String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
  const local = [sanitize(lastName), sanitize(firstName)].filter(Boolean).join('.');
  // Noms entièrement en arabe → local vide après nettoyage : repli horodaté.
  return `${local || `eleve${Date.now().toString().slice(-6)}`}@${domain}`;
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
