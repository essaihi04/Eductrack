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

// Générer un mot de passe sécurisé
export const generatePassword = () => {
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const numbers = '0123456789';
  const symbols = '!@#$%^&*';
  
  const allChars = uppercase + lowercase + numbers + symbols;
  let password = '';
  
  // Assurer au moins un caractère de chaque type
  password += uppercase[Math.floor(Math.random() * uppercase.length)];
  password += lowercase[Math.floor(Math.random() * lowercase.length)];
  password += numbers[Math.floor(Math.random() * numbers.length)];
  password += symbols[Math.floor(Math.random() * symbols.length)];
  
  // Remplir le reste aléatoirement
  for (let i = password.length; i < 12; i++) {
    password += allChars[Math.floor(Math.random() * allChars.length)];
  }
  
  // Mélanger le mot de passe
  return password.split('').sort(() => Math.random() - 0.5).join('');
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
