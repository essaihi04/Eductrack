/**
 * Génère les documents PDF « officiels » de l'école destinés à être importés
 * dans Communication → Documents chatbot :
 *
 *   1. Fournitures scolaires — Maternelle & Primaire   (catégorie « fournitures »)
 *   2. Fournitures scolaires — Collège & Lycée         (catégorie « fournitures »)
 *   3. Règlement intérieur                             (catégorie « reglement »)
 *
 * Les deux listes de fournitures sont volontairement séparées : le découpage par
 * niveau se fait via DeepSeek, et un document de 15 niveaux d'un coup produit un
 * JSON trop long (voir knowledge.js). Le chatbot fusionne de toute façon les
 * niveaux de tous les documents « fournitures » actifs de l'école.
 *
 * Le PDF produit contient du VRAI TEXTE (pas d'image) : indispensable pour que
 * pdf-parse puisse l'extraire à l'import.
 *
 * Usage :
 *   node backend/scripts/genEcoleDocs.mjs [dossier de sortie]
 *   (défaut : <racine du projet>/documents-ecole)
 *
 * Contenu : modèle réaliste d'école privée marocaine. À relire et à adapter au
 * fonctionnement réel de l'établissement AVANT diffusion aux parents.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import PDFDocument from 'pdfkit';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const OUT_DIR = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(PROJECT_ROOT, 'documents-ecole');

// ─────────────────────────────────────────────────────────────────────────
// Paramètres de l'établissement
// ─────────────────────────────────────────────────────────────────────────

const SCHOOL = 'École Principale';
const YEAR = '2026-2027';

// Palette « Encre & Safran » (thème de l'application)
const INK = '#1E1B4B';
const INDIGO = '#4338CA';
const INDIGO_SOFT = '#EEF2FF';
const SAFRAN = '#F59E0B';
const SLATE = '#475569';
const MUTED = '#94A3B8';
const BORDER = '#E2E8F0';

const MARGIN = 46;

// ─────────────────────────────────────────────────────────────────────────
// Fournitures — un bloc par niveau
// ─────────────────────────────────────────────────────────────────────────

/** Consignes répétées sur chaque liste (l'IA les recopie dans chaque niveau). */
const COMMON_NOTES = [
  'Chaque article doit être étiqueté au nom et au prénom de l\'élève.',
  'Le cartable est vérifié le premier jour ; le matériel manquant doit être complété sous 7 jours.',
  'Les cahiers et livres sont couverts et étiquetés avant la rentrée.',
  'Aucun article de marque ou objet de valeur n\'est exigé par l\'école.',
];

const MATERNELLE_PRIMAIRE = [
  {
    level: 'PS — Petite Section',
    groups: [
      ['Cahiers & classeurs', [
        ['Cahier de dessin 24 x 32', '2'],
        ['Pochette à élastique A4', '1'],
        ['Chemise cartonnée avec rabats', '1'],
      ]],
      ['Trousse', [
        ['Boîte de crayons de couleur gros module', '1 boîte de 12'],
        ['Boîte de feutres lavables', '1 boîte de 12'],
        ['Bâton de colle 21 g', '3'],
        ['Ciseaux à bouts ronds', '1'],
      ]],
      ['Arts plastiques', [
        ['Gouache 5 couleurs', '1 boîte'],
        ['Pinceaux (n° 6 et n° 12)', '2'],
        ['Tablier de peinture à manches longues', '1'],
        ['Ramette de papier A4 80 g', '1'],
      ]],
      ['Vie quotidienne', [
        ['Sac à dos souple marqué au nom de l\'enfant', '1'],
        ['Serviette de table en tissu', '2'],
        ['Boîte de mouchoirs', '2'],
        ['Tenue de rechange complète dans un sac', '1'],
      ]],
    ],
  },
  {
    level: 'MS — Moyenne Section',
    groups: [
      ['Cahiers & classeurs', [
        ['Cahier de dessin 24 x 32', '2'],
        ['Cahier de travaux pratiques 17 x 22', '1'],
        ['Pochette à élastique A4', '1'],
      ]],
      ['Trousse', [
        ['Crayons de couleur', '1 boîte de 12'],
        ['Feutres lavables', '1 boîte de 12'],
        ['Crayon à papier HB', '4'],
        ['Gomme blanche', '2'],
        ['Bâton de colle 21 g', '3'],
        ['Ciseaux à bouts ronds', '1'],
      ]],
      ['Arts plastiques', [
        ['Gouache 6 couleurs', '1 boîte'],
        ['Pinceaux (n° 6 et n° 12)', '2'],
        ['Tablier de peinture', '1'],
        ['Pâte à modeler', '1 boîte'],
      ]],
      ['Vie quotidienne', [
        ['Boîte de mouchoirs', '2'],
        ['Serviette de table en tissu', '2'],
        ['Gourde en plastique rigide', '1'],
      ]],
    ],
  },
  {
    level: 'GS — Grande Section',
    groups: [
      ['Cahiers & classeurs', [
        ['Cahier 17 x 22, 96 pages, grands carreaux', '3'],
        ['Cahier de dessin 24 x 32', '2'],
        ['Ardoise blanche avec feutres effaçables', '1'],
        ['Pochette à élastique A4', '2'],
      ]],
      ['Trousse', [
        ['Crayons de couleur', '1 boîte de 12'],
        ['Feutres lavables', '1 boîte de 12'],
        ['Crayon à papier HB', '5'],
        ['Gomme blanche', '2'],
        ['Taille-crayon avec réservoir', '1'],
        ['Bâton de colle 21 g', '4'],
        ['Ciseaux à bouts ronds', '1'],
      ]],
      ['Arts plastiques', [
        ['Gouache 6 couleurs', '1 boîte'],
        ['Pinceaux (n° 6 et n° 12)', '2'],
        ['Tablier de peinture', '1'],
        ['Ramette de papier A4 80 g', '1'],
      ]],
      ['Sport', [
        ['Tenue de sport de l\'école', '1'],
        ['Chaussures de sport à scratch', '1 paire'],
      ]],
    ],
  },
  {
    level: '1AP — 1ère année primaire (1AEP)',
    groups: [
      ['Cahiers', [
        ['Cahier 17 x 22, 96 pages, grands carreaux (français)', '4'],
        ['Cahier 17 x 22, 96 pages (arabe)', '4'],
        ['Cahier 17 x 22, 48 pages (devoirs)', '2'],
        ['Cahier de dessin 24 x 32', '1'],
        ['Ardoise blanche + feutres effaçables', '1'],
      ]],
      ['Trousse', [
        ['Crayon à papier HB', '6'],
        ['Stylo bleu et stylo vert', '2'],
        ['Gomme blanche', '3'],
        ['Taille-crayon avec réservoir', '1'],
        ['Règle plate 20 cm', '1'],
        ['Bâton de colle 21 g', '4'],
        ['Ciseaux à bouts ronds', '1'],
        ['Crayons de couleur', '1 boîte de 12'],
        ['Feutres', '1 boîte de 12'],
      ]],
      ['Divers', [
        ['Protège-cahiers 17 x 22 (couleurs assorties)', '10'],
        ['Ramette de papier A4 80 g', '1'],
        ['Boîte de mouchoirs', '2'],
      ]],
      ['Sport', [
        ['Tenue de sport de l\'école', '1'],
        ['Chaussures de sport', '1 paire'],
      ]],
    ],
  },
  {
    level: '2AP — 2ème année primaire (2AEP)',
    groups: [
      ['Cahiers', [
        ['Cahier 17 x 22, 96 pages, grands carreaux', '6'],
        ['Cahier 17 x 22, 48 pages (devoirs)', '2'],
        ['Cahier de dessin 24 x 32', '1'],
        ['Ardoise blanche + feutres effaçables', '1'],
      ]],
      ['Trousse', [
        ['Crayon à papier HB', '6'],
        ['Stylos (bleu, vert, rouge)', '3'],
        ['Gomme blanche', '3'],
        ['Taille-crayon avec réservoir', '1'],
        ['Règle plate 20 cm', '1'],
        ['Bâton de colle 21 g', '4'],
        ['Ciseaux à bouts ronds', '1'],
        ['Crayons de couleur et feutres', '1 boîte de chaque'],
      ]],
      ['Divers', [
        ['Protège-cahiers 17 x 22', '10'],
        ['Chemise à élastique A4', '2'],
        ['Ramette de papier A4 80 g', '1'],
      ]],
      ['Sport', [
        ['Tenue de sport de l\'école', '1'],
        ['Chaussures de sport', '1 paire'],
      ]],
    ],
  },
  {
    level: '3AP — 3ème année primaire (3AEP)',
    groups: [
      ['Cahiers', [
        ['Cahier 21 x 29,7, 96 pages, grands carreaux', '5'],
        ['Cahier 17 x 22, 96 pages', '4'],
        ['Cahier de dessin 24 x 32', '1'],
        ['Cahier de textes', '1'],
      ]],
      ['Trousse', [
        ['Stylos (bleu, vert, rouge, noir)', '4'],
        ['Crayon à papier HB', '4'],
        ['Gomme et taille-crayon', '2'],
        ['Règle plate 30 cm', '1'],
        ['Équerre et rapporteur', '1 de chaque'],
        ['Bâton de colle 21 g', '3'],
        ['Ciseaux à bouts ronds', '1'],
        ['Crayons de couleur et feutres', '1 boîte de chaque'],
      ]],
      ['Divers', [
        ['Protège-cahiers (17 x 22 et 21 x 29,7)', '10'],
        ['Chemise à élastique A4', '2'],
        ['Ramette de papier A4 80 g', '1'],
        ['Dictionnaire de poche français', '1'],
      ]],
      ['Sport', [
        ['Tenue de sport de l\'école', '1'],
        ['Chaussures de sport', '1 paire'],
      ]],
    ],
  },
  {
    level: '4AP — 4ème année primaire (4AEP)',
    groups: [
      ['Cahiers', [
        ['Cahier 21 x 29,7, 96 pages, grands carreaux', '6'],
        ['Cahier 17 x 22, 96 pages', '3'],
        ['Cahier de textes', '1'],
        ['Cahier de dessin 24 x 32', '1'],
      ]],
      ['Trousse & géométrie', [
        ['Stylos (bleu, vert, rouge, noir)', '4'],
        ['Crayon à papier HB', '4'],
        ['Gomme et taille-crayon', '2'],
        ['Boîte de géométrie complète (règle, équerre, rapporteur, compas)', '1'],
        ['Bâton de colle 21 g', '3'],
        ['Ciseaux', '1'],
        ['Crayons de couleur et feutres', '1 boîte de chaque'],
      ]],
      ['Divers', [
        ['Protège-cahiers', '10'],
        ['Chemise à élastique A4', '2'],
        ['Ramette de papier A4 80 g', '1'],
        ['Dictionnaire français (Larousse junior ou équivalent)', '1'],
      ]],
      ['Sport', [
        ['Tenue de sport de l\'école', '1'],
        ['Chaussures de sport', '1 paire'],
      ]],
    ],
  },
  {
    level: '5AP — 5ème année primaire (5AEP)',
    groups: [
      ['Cahiers', [
        ['Cahier 21 x 29,7, 96 pages, grands carreaux', '6'],
        ['Cahier 17 x 22, 96 pages', '3'],
        ['Cahier de textes', '1'],
        ['Cahier de dessin 24 x 32', '1'],
      ]],
      ['Trousse & géométrie', [
        ['Stylos (bleu, vert, rouge, noir)', '4'],
        ['Crayon à papier HB', '4'],
        ['Gomme, taille-crayon, effaceur', '1 de chaque'],
        ['Boîte de géométrie complète', '1'],
        ['Calculatrice scolaire simple', '1'],
        ['Bâton de colle 21 g', '3'],
        ['Ciseaux', '1'],
      ]],
      ['Divers', [
        ['Protège-cahiers', '10'],
        ['Classeur A4 souple + intercalaires', '1'],
        ['Ramette de papier A4 80 g', '1'],
        ['Dictionnaire français et dictionnaire arabe', '1 de chaque'],
      ]],
      ['Sport', [
        ['Tenue de sport de l\'école', '1'],
        ['Chaussures de sport', '1 paire'],
      ]],
    ],
  },
  {
    level: '6AP — 6ème année primaire (6AEP)',
    groups: [
      ['Cahiers', [
        ['Cahier 21 x 29,7, 96 pages, grands carreaux', '7'],
        ['Cahier 17 x 22, 96 pages', '3'],
        ['Cahier de textes', '1'],
        ['Cahier de dessin 24 x 32', '1'],
      ]],
      ['Trousse & géométrie', [
        ['Stylos (bleu, vert, rouge, noir)', '4'],
        ['Crayon à papier HB', '4'],
        ['Gomme, taille-crayon, effaceur', '1 de chaque'],
        ['Boîte de géométrie complète', '1'],
        ['Calculatrice scientifique de base', '1'],
        ['Surligneurs', '2'],
      ]],
      ['Divers', [
        ['Protège-cahiers', '11'],
        ['Classeur A4 + intercalaires + pochettes transparentes', '1 lot'],
        ['Ramette de papier A4 80 g', '1'],
        ['Dictionnaires français et arabe', '1 de chaque'],
      ]],
      ['Sport', [
        ['Tenue de sport de l\'école', '1'],
        ['Chaussures de sport', '1 paire'],
      ]],
    ],
  },
];

const COLLEGE_LYCEE = [
  {
    level: '1AC — 1ère année collège',
    groups: [
      ['Cahiers par matière', [
        ['Cahier 21 x 29,7, 200 pages (mathématiques)', '1'],
        ['Cahier 21 x 29,7, 96 pages (français, arabe, anglais)', '3'],
        ['Cahier 21 x 29,7, 96 pages (SVT, physique-chimie)', '2'],
        ['Cahier 21 x 29,7, 96 pages (histoire-géo, éducation islamique)', '2'],
        ['Cahier de textes', '1'],
      ]],
      ['Trousse & géométrie', [
        ['Stylos (bleu, vert, rouge, noir)', '4'],
        ['Crayon à papier HB, gomme, taille-crayon', '1 lot'],
        ['Boîte de géométrie complète', '1'],
        ['Calculatrice scientifique', '1'],
        ['Surligneurs', '3'],
        ['Bâton de colle et ciseaux', '1 de chaque'],
      ]],
      ['Divers', [
        ['Protège-cahiers 21 x 29,7', '9'],
        ['Classeur A4 + intercalaires + pochettes', '1 lot'],
        ['Ramette de papier A4 80 g', '1'],
        ['Blouse blanche (travaux pratiques)', '1'],
      ]],
      ['Sport', [
        ['Tenue de sport de l\'école', '1'],
        ['Chaussures de sport', '1 paire'],
      ]],
    ],
  },
  {
    level: '2AC — 2ème année collège',
    groups: [
      ['Cahiers par matière', [
        ['Cahier 21 x 29,7, 200 pages (mathématiques)', '1'],
        ['Cahier 21 x 29,7, 96 pages (langues)', '3'],
        ['Cahier 21 x 29,7, 96 pages (sciences)', '2'],
        ['Cahier 21 x 29,7, 96 pages (matières littéraires)', '2'],
        ['Cahier de textes', '1'],
      ]],
      ['Trousse & géométrie', [
        ['Stylos (bleu, vert, rouge, noir)', '4'],
        ['Crayon à papier HB, gomme, taille-crayon', '1 lot'],
        ['Boîte de géométrie complète', '1'],
        ['Calculatrice scientifique', '1'],
        ['Surligneurs', '3'],
      ]],
      ['Divers', [
        ['Protège-cahiers 21 x 29,7', '9'],
        ['Classeur A4 + intercalaires + pochettes', '1 lot'],
        ['Ramette de papier A4 80 g', '1'],
        ['Blouse blanche (travaux pratiques)', '1'],
      ]],
      ['Sport', [
        ['Tenue de sport de l\'école', '1'],
        ['Chaussures de sport', '1 paire'],
      ]],
    ],
  },
  {
    level: '3AC — 3ème année collège',
    groups: [
      ['Cahiers par matière', [
        ['Cahier 21 x 29,7, 200 pages (mathématiques)', '1'],
        ['Cahier 21 x 29,7, 96 pages (langues)', '3'],
        ['Cahier 21 x 29,7, 96 pages (physique-chimie, SVT)', '2'],
        ['Cahier 21 x 29,7, 96 pages (matières littéraires)', '2'],
        ['Cahier de textes', '1'],
      ]],
      ['Trousse & géométrie', [
        ['Stylos (bleu, vert, rouge, noir)', '4'],
        ['Boîte de géométrie complète', '1'],
        ['Calculatrice scientifique', '1'],
        ['Surligneurs', '3'],
      ]],
      ['Divers', [
        ['Protège-cahiers 21 x 29,7', '9'],
        ['Classeur A4 + intercalaires + pochettes', '1 lot'],
        ['Ramette de papier A4 80 g', '1'],
        ['Blouse blanche (travaux pratiques)', '1'],
        ['Clé USB 16 Go (informatique)', '1'],
      ]],
      ['Sport', [
        ['Tenue de sport de l\'école', '1'],
        ['Chaussures de sport', '1 paire'],
      ]],
    ],
  },
  {
    level: 'TC — Tronc commun',
    groups: [
      ['Cahiers & classeurs', [
        ['Cahier 21 x 29,7, 200 pages (mathématiques)', '1'],
        ['Cahier 21 x 29,7, 200 pages (physique-chimie)', '1'],
        ['Cahier 21 x 29,7, 96 pages (autres matières)', '5'],
        ['Classeur A4 grand format + intercalaires', '2'],
        ['Feuilles simples et doubles A4 (paquets)', '2'],
      ]],
      ['Trousse & géométrie', [
        ['Stylos (bleu, vert, rouge, noir)', '4'],
        ['Boîte de géométrie complète', '1'],
        ['Calculatrice scientifique programmable', '1'],
        ['Surligneurs', '4'],
      ]],
      ['Travaux pratiques', [
        ['Blouse blanche marquée au nom de l\'élève', '1'],
        ['Clé USB 16 Go', '1'],
      ]],
      ['Sport', [
        ['Tenue de sport de l\'école', '1'],
        ['Chaussures de sport', '1 paire'],
      ]],
    ],
  },
  {
    level: '1BAC — 1ère année baccalauréat',
    groups: [
      ['Cahiers & classeurs', [
        ['Cahier 21 x 29,7, 200 pages (matières principales)', '2'],
        ['Cahier 21 x 29,7, 96 pages (autres matières)', '5'],
        ['Classeur A4 + intercalaires', '2'],
        ['Feuilles simples et doubles A4 (paquets)', '3'],
      ]],
      ['Trousse & géométrie', [
        ['Stylos (bleu, vert, rouge, noir)', '4'],
        ['Boîte de géométrie complète', '1'],
        ['Calculatrice scientifique programmable', '1'],
        ['Surligneurs', '4'],
      ]],
      ['Travaux pratiques', [
        ['Blouse blanche', '1'],
        ['Clé USB 16 Go', '1'],
      ]],
      ['Sport', [
        ['Tenue de sport de l\'école', '1'],
        ['Chaussures de sport', '1 paire'],
      ]],
    ],
  },
  {
    level: '2BAC — 2ème année baccalauréat',
    groups: [
      ['Cahiers & classeurs', [
        ['Cahier 21 x 29,7, 200 pages (matières de la filière)', '3'],
        ['Cahier 21 x 29,7, 96 pages (autres matières)', '4'],
        ['Classeur A4 + intercalaires (révisions examen)', '2'],
        ['Feuilles simples et doubles A4 (paquets)', '4'],
      ]],
      ['Trousse & géométrie', [
        ['Stylos (bleu, vert, rouge, noir)', '4'],
        ['Boîte de géométrie complète', '1'],
        ['Calculatrice scientifique programmable', '1'],
        ['Surligneurs', '4'],
      ]],
      ['Travaux pratiques', [
        ['Blouse blanche', '1'],
        ['Clé USB 16 Go', '1'],
      ]],
      ['Sport', [
        ['Tenue de sport de l\'école', '1'],
        ['Chaussures de sport', '1 paire'],
      ]],
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────
// Règlement intérieur
// ─────────────────────────────────────────────────────────────────────────

const REGLEMENT_INTRO =
  'Le présent règlement intérieur définit les règles de vie commune de l\'établissement ' + SCHOOL + '. '
  + 'L\'inscription d\'un élève vaut acceptation de ce règlement par l\'élève et par ses parents ou tuteurs. '
  + 'Il est applicable pendant toute l\'année scolaire ' + YEAR + ', dans l\'enceinte de l\'établissement, '
  + 'dans le transport scolaire et lors de toutes les activités organisées par l\'école.';

const REGLEMENT = [
  ['1. Horaires et organisation de la journée', [
    'L\'établissement ouvre ses portes à 8h00. Les cours du matin se déroulent de 8h30 à 12h30 et ceux de l\'après-midi de 14h30 à 17h30, du lundi au vendredi.',
    'Le samedi matin est réservé aux séances de soutien, aux activités des clubs et aux réunions avec les parents, selon le planning communiqué en début de trimestre.',
    'Les élèves doivent être présents dans la cour 10 minutes avant la première sonnerie. Les déplacements entre les salles se font dans le calme et sous la responsabilité de l\'enseignant.',
    'Aucun élève n\'est autorisé à quitter l\'établissement pendant les heures de cours sans une autorisation écrite de l\'administration remise au parent ou à la personne mandatée.',
  ]],
  ['2. Retards', [
    'Tout retard est enregistré dans l\'application et notifié aux parents le jour même.',
    'Un élève en retard de moins de 15 minutes est accepté en classe après passage à la vie scolaire, qui inscrit le retard sur son carnet.',
    'Au-delà de 15 minutes, l\'élève est accueilli en salle d\'étude et rejoint le cours suivant, afin de ne pas perturber la séance en cours.',
    'Trois retards non justifiés au cours d\'un même mois donnent lieu à une convocation des parents par la vie scolaire.',
  ]],
  ['3. Absences et justificatifs', [
    'Toute absence doit être signalée à l\'administration le matin même, par téléphone ou via l\'application, avant 9h00.',
    'Un justificatif écrit est remis au retour de l\'élève, dans un délai maximum de 48 heures. Une absence supérieure à trois jours consécutifs exige un certificat médical.',
    'Les absences aux contrôles et examens ne sont rattrapées que sur présentation d\'un justificatif recevable ; à défaut, la note de zéro est appliquée.',
    'Les absences répétées et non justifiées sont signalées à la direction et peuvent entraîner un conseil de discipline.',
  ]],
  ['4. Tenue vestimentaire et présentation', [
    'Le port de la tenue de l\'école (blouse ou uniforme selon le cycle) est obligatoire chaque jour de classe.',
    'La tenue de sport de l\'école est exigée pour les séances d\'éducation physique ; elle est apportée dans un sac séparé.',
    'La tenue doit rester propre, correcte et adaptée au cadre scolaire. Les bijoux voyants, le maquillage et les accessoires de mode sont interdits.',
    'La blouse blanche est obligatoire pour les travaux pratiques de sciences à partir du collège.',
  ]],
  ['5. Matériel scolaire et téléphone portable', [
    'L\'élève se présente en classe avec le matériel figurant sur la liste des fournitures de son niveau ; le cahier de textes est tenu à jour quotidiennement.',
    'L\'usage du téléphone portable est interdit dans l\'enceinte de l\'établissement, du portail à la sortie. Tout appareil utilisé est confisqué et remis au parent par l\'administration.',
    'L\'école décline toute responsabilité en cas de perte, de vol ou de détérioration d\'objets de valeur (téléphone, tablette, bijoux, sommes d\'argent).',
    'Le matériel de l\'établissement (mobilier, manuels, équipement informatique, matériel de laboratoire) est utilisé avec soin ; toute dégradation volontaire est facturée à la famille.',
  ]],
  ['6. Comportement et discipline', [
    'Le respect mutuel entre élèves, enseignants et personnel est la règle première de l\'établissement. La violence physique ou verbale, les insultes, le harcèlement et les moqueries sont strictement interdits.',
    'La fraude ou la tentative de fraude lors d\'un contrôle entraîne l\'annulation de l\'épreuve et une sanction disciplinaire.',
    'Il est interdit d\'introduire dans l\'établissement tout objet dangereux, produit illicite, cigarette ou substance nocive.',
    'L\'échelle des sanctions est la suivante : remarque orale, avertissement écrit inscrit au dossier, convocation des parents, exclusion temporaire de cours, conseil de discipline pouvant prononcer une exclusion définitive.',
    'Toute sanction est notifiée aux parents via l\'application et consignée dans le dossier de vie scolaire de l\'élève.',
  ]],
  ['7. Santé, sécurité et urgences', [
    'Les parents signalent à l\'inscription toute allergie, maladie chronique ou traitement en cours. Aucun médicament n\'est administré à l\'école sans ordonnance et autorisation écrite des parents.',
    'En cas de malaise, l\'élève est pris en charge à l\'infirmerie et les parents sont contactés immédiatement. En cas d\'urgence vitale, l\'école fait appel aux secours et prévient la famille sans délai.',
    'Les exercices d\'évacuation sont obligatoires et effectués au moins deux fois par an ; les consignes de sécurité sont affichées dans chaque salle.',
    'La fiche de contacts d\'urgence doit être tenue à jour par les parents dans l\'application tout au long de l\'année.',
  ]],
  ['8. Restauration scolaire', [
    'La cantine fonctionne les jours de classe, en deux services : primaire puis collège et lycée. L\'inscription se fait au trimestre ou à l\'année.',
    'Les menus sont communiqués aux familles chaque semaine ; les régimes particuliers signalés par écrit sont pris en compte dans la mesure du possible.',
    'Le respect du personnel de restauration, du calme et de la propreté du réfectoire fait partie des règles de vie évaluées en conduite.',
    'Toute désinscription de la cantine doit être signalée par écrit avant la fin du trimestre en cours.',
  ]],
  ['9. Transport scolaire', [
    'Le transport scolaire est un service optionnel, souscrit pour l\'année et facturé mensuellement avec les frais de scolarité.',
    'L\'élève attend le bus au point de ramassage indiqué, cinq minutes avant l\'heure ; le bus n\'attend pas au-delà de l\'horaire prévu.',
    'Pendant le trajet, l\'élève reste assis, porte sa ceinture et respecte les consignes de l\'accompagnateur. Tout manquement grave peut entraîner la suspension du service.',
    'Un changement de point de ramassage ou de personne autorisée à récupérer l\'élève doit être demandé par écrit à l\'administration.',
  ]],
  ['10. Relations école-famille', [
    'Le suivi de la scolarité (notes, absences, devoirs, remarques, factures) est consultable en continu par les parents dans l\'application de l\'école et sur WhatsApp.',
    'Des réunions parents-professeurs sont organisées à la fin de chaque trimestre ; un rendez-vous individuel peut être demandé à tout moment auprès de la vie scolaire.',
    'Les parents veillent à maintenir à jour leur numéro de téléphone : c\'est le canal officiel de notification de l\'établissement.',
    'Toute réclamation est adressée par écrit à la direction, qui répond dans un délai de sept jours ouvrables.',
  ]],
  ['11. Frais de scolarité', [
    'Les frais d\'inscription sont réglés au moment de l\'inscription ou de la réinscription et ne sont pas remboursables.',
    'Les mensualités sont payables avant le 10 de chaque mois, de septembre à juin, par les moyens de paiement acceptés par l\'établissement.',
    'Une facture est émise pour chaque échéance et un reçu est remis à chaque encaissement ; les documents sont également disponibles dans l\'application.',
    'En cas de retard de paiement, l\'administration prend contact avec la famille ; un impayé persistant peut suspendre l\'accès aux services optionnels (cantine, transport, activités).',
  ]],
  ['12. Activités et sorties pédagogiques', [
    'Les clubs et activités parascolaires sont ouverts à tous les élèves selon les places disponibles ; l\'inscription engage l\'élève pour le trimestre.',
    'Toute sortie pédagogique fait l\'objet d\'une information préalable et d\'une autorisation parentale écrite.',
    'Le règlement intérieur s\'applique intégralement pendant les sorties, les voyages et les activités organisées hors de l\'établissement.',
  ]],
];

// ─────────────────────────────────────────────────────────────────────────
// Mise en page
// ─────────────────────────────────────────────────────────────────────────

/** Bandeau d'en-tête de la première page. */
function drawHeader(doc, { title, subtitle }) {
  const w = doc.page.width;
  doc.rect(0, 0, w, 96).fill(INK);
  doc.rect(0, 96, w, 5).fill(SAFRAN);

  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(19)
    .text(title, MARGIN, 28, { width: w - MARGIN * 2 });
  doc.font('Helvetica').fontSize(11).fillColor('#C7D2FE')
    .text(subtitle, MARGIN, 56, { width: w - MARGIN * 2 });
  doc.font('Helvetica-Bold').fontSize(10).fillColor(SAFRAN)
    .text(`Année scolaire ${YEAR}`, MARGIN, 74, { width: w - MARGIN * 2 });

  doc.y = 124;
  doc.fillColor(INK);
}

/** Pied de page paginé, appliqué à chaque page à la fin de la génération. */
function drawFooters(doc, label) {
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i += 1) {
    doc.switchToPage(range.start + i);
    const y = doc.page.height - 34;
    doc.moveTo(MARGIN, y - 8).lineTo(doc.page.width - MARGIN, y - 8)
      .lineWidth(0.5).strokeColor(BORDER).stroke();
    doc.font('Helvetica').fontSize(8).fillColor(MUTED)
      .text(`${SCHOOL} — ${label}`, MARGIN, y, { width: 320, lineBreak: false })
      .text(`Page ${i + 1}/${range.count}`, doc.page.width - MARGIN - 90, y, {
        width: 90, align: 'right', lineBreak: false,
      });
  }
}

/** Saut de page si l'espace restant est insuffisant. */
function ensureSpace(doc, needed) {
  if (doc.y + needed > doc.page.height - 60) {
    doc.addPage();
    doc.y = MARGIN;
  }
}

/** Titre de niveau : c'est CETTE ligne que le découpage par niveau repère. */
function drawLevelTitle(doc, level) {
  ensureSpace(doc, 90);
  const w = doc.page.width - MARGIN * 2;
  const top = doc.y + 6;
  doc.roundedRect(MARGIN, top, w, 26, 5).fill(INDIGO_SOFT);
  doc.fillColor(INDIGO).font('Helvetica-Bold').fontSize(12)
    .text(level, MARGIN + 10, top + 8, { width: w - 20, lineBreak: false });
  doc.y = top + 36;
  doc.fillColor(INK);
}

function drawGroup(doc, title, items) {
  ensureSpace(doc, 54);
  doc.font('Helvetica-Bold').fontSize(10).fillColor(SLATE)
    .text(title, MARGIN + 6, doc.y, { width: doc.page.width - MARGIN * 2 - 12 });
  doc.moveDown(0.25);

  for (const [label, qty] of items) {
    ensureSpace(doc, 20);
    const y = doc.y;
    const textW = doc.page.width - MARGIN * 2 - 100;
    doc.font('Helvetica').fontSize(10).fillColor(INK)
      .text(`•  ${label}`, MARGIN + 14, y, { width: textW });
    if (qty) {
      doc.font('Helvetica-Bold').fontSize(9).fillColor(INDIGO)
        .text(qty, doc.page.width - MARGIN - 96, y + 1, { width: 92, align: 'right', lineBreak: false });
    }
    doc.y = Math.max(doc.y, y) + 2;
  }
  doc.moveDown(0.5);
}

function drawNotes(doc, notes, title = 'À retenir') {
  ensureSpace(doc, 40 + notes.length * 16);
  const w = doc.page.width - MARGIN * 2;
  const top = doc.y + 4;

  doc.font('Helvetica-Bold').fontSize(10).fillColor(SAFRAN)
    .text(title, MARGIN + 10, top + 8, { width: w - 20 });
  let y = doc.y + 4;
  doc.font('Helvetica').fontSize(9).fillColor(SLATE);
  for (const n of notes) {
    doc.text(`—  ${n}`, MARGIN + 10, y, { width: w - 20 });
    y = doc.y + 2;
  }
  const bottom = y + 6;
  doc.roundedRect(MARGIN, top, w, bottom - top, 5).lineWidth(0.8).strokeColor(SAFRAN).stroke();
  doc.y = bottom + 12;
  doc.fillColor(INK);
}

// ─────────────────────────────────────────────────────────────────────────
// Documents
// ─────────────────────────────────────────────────────────────────────────

function newDoc() {
  return new PDFDocument({ size: 'A4', margin: MARGIN, bufferPages: true });
}

async function writeDoc(doc, filePath) {
  return new Promise((resolve, reject) => {
    const stream = fs.createWriteStream(filePath);
    stream.on('finish', resolve);
    stream.on('error', reject);
    doc.pipe(stream);
    doc.end();
  });
}

async function buildSupplies({ fileName, cycleLabel, levels }) {
  const doc = newDoc();
  drawHeader(doc, {
    title: `Liste des fournitures scolaires — ${cycleLabel}`,
    subtitle: SCHOOL,
  });

  doc.font('Helvetica').fontSize(10).fillColor(SLATE).text(
    'Liste officielle à préparer pour la rentrée. Les articles sont regroupés par niveau : '
    + 'ne préparez que la liste correspondant au niveau de votre enfant.',
    MARGIN, doc.y, { width: doc.page.width - MARGIN * 2 },
  );
  doc.moveDown(1);

  for (const { level, groups } of levels) {
    drawLevelTitle(doc, level);
    for (const [title, items] of groups) drawGroup(doc, title, items);
    drawNotes(doc, COMMON_NOTES, 'Consignes générales');
  }

  drawFooters(doc, `Fournitures ${YEAR}`);
  const out = path.join(OUT_DIR, fileName);
  await writeDoc(doc, out);
  return out;
}

async function buildReglement() {
  const doc = newDoc();
  drawHeader(doc, { title: 'Règlement intérieur', subtitle: SCHOOL });

  doc.font('Helvetica').fontSize(10).fillColor(SLATE)
    .text(REGLEMENT_INTRO, MARGIN, doc.y, { width: doc.page.width - MARGIN * 2, align: 'justify' });
  doc.moveDown(1);

  for (const [title, rules] of REGLEMENT) {
    ensureSpace(doc, 70);
    const w = doc.page.width - MARGIN * 2;
    const top = doc.y + 4;
    doc.roundedRect(MARGIN, top, w, 24, 5).fill(INDIGO_SOFT);
    doc.fillColor(INDIGO).font('Helvetica-Bold').fontSize(11)
      .text(title, MARGIN + 10, top + 7, { width: w - 20, lineBreak: false });
    doc.y = top + 32;

    doc.font('Helvetica').fontSize(10).fillColor(INK);
    for (const rule of rules) {
      ensureSpace(doc, 34);
      doc.text(`•  ${rule}`, MARGIN + 10, doc.y, { width: w - 20, align: 'justify' });
      doc.moveDown(0.35);
    }
    doc.moveDown(0.5);
  }

  ensureSpace(doc, 80);
  drawNotes(doc, [
    'Ce règlement est remis à chaque famille à l\'inscription et affiché à l\'entrée de l\'établissement.',
    'Il peut être complété en cours d\'année par des notes de service communiquées aux parents.',
    `Signature des parents et de l'élève à la rentrée ${YEAR}.`,
  ], 'Application du règlement');

  drawFooters(doc, `Règlement intérieur ${YEAR}`);
  const out = path.join(OUT_DIR, `Reglement_interieur_${YEAR}.pdf`);
  await writeDoc(doc, out);
  return out;
}

// ─────────────────────────────────────────────────────────────────────────

fs.mkdirSync(OUT_DIR, { recursive: true });

const files = [
  await buildSupplies({
    fileName: `Fournitures_${YEAR}_Maternelle_Primaire.pdf`,
    cycleLabel: 'Maternelle & Primaire',
    levels: MATERNELLE_PRIMAIRE,
  }),
  await buildSupplies({
    fileName: `Fournitures_${YEAR}_College_Lycee.pdf`,
    cycleLabel: 'Collège & Lycée',
    levels: COLLEGE_LYCEE,
  }),
  await buildReglement(),
];

for (const f of files) {
  console.log(`✓ ${path.relative(PROJECT_ROOT, f)}  (${(fs.statSync(f).size / 1024).toFixed(0)} Ko)`);
}
