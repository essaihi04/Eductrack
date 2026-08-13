/**
 * Normalisation et rapprochement (matching) pour l'import d'emploi du temps.
 *
 * L'IA renvoie des libellés bruts tels qu'ils sont écrits sur le document
 * (« Maths », « الرياضيات », « M. ALAMI », « 2 BAC PC-1 »…). Ce module les
 * ramène vers les identifiants de la base : matières, professeurs, classes.
 */

// ── Normalisation de texte ────────────────────────────────────────────────

// Harakat (voyelles courtes) + tatweel : purement décoratifs pour la comparaison.
const ARABIC_DIACRITICS = /[ً-ْـٰ]/g;
// Accents latins (marques combinantes issues de la décomposition NFD).
const LATIN_ACCENTS = /[̀-ͯ]/g;
// Tout ce qui n'est ni latin, ni chiffre, ni lettre arabe devient un espace.
const PUNCTUATION = /[^a-z0-9؀-ۿ]+/g;

/**
 * Forme comparable d'un libellé : minuscules, sans accents ni diacritiques
 * arabes, ponctuation et espaces réduits. Unifie aussi les variantes de
 * lettres arabes (أ إ آ → ا, ة → ه, ى → ي) très fréquentes d'un document
 * à l'autre.
 */
export function norm(value) {
  return String(value == null ? '' : value)
    .toLowerCase()
    .normalize('NFD')
    .replace(LATIN_ACCENTS, '')
    .replace(ARABIC_DIACRITICS, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(PUNCTUATION, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Civilités et titres à retirer avant de comparer des noms de professeurs. */
const TITLES = /\b(m|mr|mme|mlle|pr|prof|professeur|monsieur|madame|mademoiselle|ustad|ostad|السيد|السيدة|الاستاذ|الاستاذه)\b/g;
export const normPerson = (v) => norm(v).replace(TITLES, ' ').trim().replace(/\s+/g, ' ');

// ── Jours ─────────────────────────────────────────────────────────────────

const DAY_ALIASES = {
  monday: ['monday', 'mon', 'lundi', 'lun', 'الاثنين', 'الإثنين', 'الاتنين', 'اثنين'],
  tuesday: ['tuesday', 'tue', 'mardi', 'mar', 'الثلاثاء', 'ثلاثاء'],
  wednesday: ['wednesday', 'wed', 'mercredi', 'mer', 'الاربعاء', 'الأربعاء', 'اربعاء'],
  thursday: ['thursday', 'thu', 'jeudi', 'jeu', 'الخميس', 'خميس'],
  friday: ['friday', 'fri', 'vendredi', 'ven', 'الجمعة', 'الجمعه', 'جمعة'],
  saturday: ['saturday', 'sat', 'samedi', 'sam', 'السبت', 'سبت'],
};

export const DAY_KEYS = Object.keys(DAY_ALIASES);

const DAY_LOOKUP = (() => {
  const map = new Map();
  for (const [key, aliases] of Object.entries(DAY_ALIASES)) {
    for (const a of aliases) map.set(norm(a), key);
  }
  return map;
})();

/** Libellé de jour (fr / ar / en, abrégé ou non) → clé anglaise, ou null. */
export function normalizeDay(value) {
  const n = norm(value);
  if (!n) return null;
  if (DAY_LOOKUP.has(n)) return DAY_LOOKUP.get(n);
  // Le libellé peut être noyé dans une cellule (« Lundi 08/09 »)
  for (const [alias, key] of DAY_LOOKUP.entries()) {
    if (alias.length >= 3 && n.includes(alias)) return key;
  }
  return null;
}

// ── Heures ────────────────────────────────────────────────────────────────

/**
 * Normalise une heure vers HH:MM. Accepte 8, 8h, 8h30, 8:30, 08.30, 8 h 30,
 * « 08H00 »… Renvoie null si inexploitable.
 */
export function normalizeTime(value) {
  const s = String(value == null ? '' : value).trim();
  if (!s) return null;
  const m = s.match(/^(\d{1,2})\s*(?:[:hH.,]\s*(\d{1,2}))?/);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  if (!Number.isFinite(h) || h < 0 || h > 23) return null;
  if (!Number.isFinite(min) || min < 0 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

export const timeToMinutes = (t) => {
  const [h, m] = String(t || '').split(':');
  return (parseInt(h, 10) || 0) * 60 + (parseInt(m, 10) || 0);
};

// ── Similarité ────────────────────────────────────────────────────────────

/** Distance de Levenshtein (itérative, deux lignes). */
function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[b.length];
}

/**
 * Score de ressemblance entre deux libellés, dans [0, 1].
 * Combine trois signaux, car aucun ne suffit seul sur des emplois du temps :
 *  - égalité / inclusion (« maths » ⊂ « mathematiques »)
 *  - recouvrement de mots (« alami mohamed » vs « mohamed alami »)
 *  - distance d'édition (fautes de frappe, OCR approximatif)
 */
export function similarity(a, b, { lenient = true } = {}) {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return 0;
  if (x === y) return 1;

  let best = 0;
  if (x.includes(y) || y.includes(x)) {
    best = Math.max(best, 0.88 * (Math.min(x.length, y.length) / Math.max(x.length, y.length)) + 0.12);
  }

  // Recouvrement de mots, avec tolérance aux abréviations : les emplois du
  // temps écrivent « Phys-Chim » pour « Physique-Chimie », « Angl » pour
  // « Anglais ». Un mot d'au moins 3 lettres qui préfixe l'autre compte comme
  // une correspondance. En dessous de 3 lettres on exige l'égalité, sinon
  // « ar » (arabe) attraperait « art ».
  const tx = [...new Set(x.split(' ').filter(Boolean))];
  const ty = [...new Set(y.split(' ').filter(Boolean))];
  if (tx.length && ty.length) {
    const tokenHit = (a, b) => (
      a === b || (Math.min(a.length, b.length) >= 3 && (a.startsWith(b) || b.startsWith(a)))
    );
    const inter = tx.filter((a) => ty.some((b) => tokenHit(a, b))).length;
    // Deux lectures du recouvrement :
    //  - sur le libellé le plus long : mesure stricte ;
    //  - sur le plus court, légèrement pénalisée : laisse passer les mots de
    //    remplissage du référentiel (« Français » vs « Langue Française »).
    //    Cette seconde lecture est volontairement désactivable : elle fait
    //    aussi ressembler « Éducation Physique et Sportive » à « Physique ».
    best = Math.max(best, inter / Math.max(tx.length, ty.length));
    if (lenient) {
      best = Math.max(best, 0.9 * (inter / Math.min(tx.length, ty.length)));
    }
  }

  const dist = levenshtein(x, y);
  best = Math.max(best, 1 - dist / Math.max(x.length, y.length));

  return Math.min(1, best);
}

/**
 * Meilleure correspondance d'un libellé brut dans une liste d'entités.
 * `candidates` : [{ id, labels: [string] }]. Renvoie
 * { id, score, status } où status = 'matched' | 'ambiguous' | 'unmatched'.
 */
export function bestMatch(raw, candidates, { accept = 0.72, ambiguousGap = 0.08 } = {}) {
  if (!raw || !candidates?.length) return { id: null, score: 0, status: 'unmatched' };

  const scored = candidates
    .map((c) => ({
      id: c.id,
      score: Math.max(0, ...c.labels.filter(Boolean).map((l) => similarity(raw, l))),
    }))
    .sort((a, b) => b.score - a.score);

  const top = scored[0];
  if (!top || top.score < accept) return { id: null, score: top?.score || 0, status: 'unmatched' };

  const second = scored[1];
  // Deux candidats quasi ex æquo (« Français » vs « Français renforcé ») :
  // on propose le meilleur mais on demande une validation humaine.
  if (second && top.score - second.score < ambiguousGap && second.score >= accept) {
    return { id: top.id, score: top.score, status: 'ambiguous' };
  }
  return { id: top.id, score: top.score, status: 'matched' };
}

// ── Équivalences arabe ↔ français des matières ────────────────────────────

/**
 * Beaucoup d'établissements saisissent leurs matières en français dans
 * l'application mais reçoivent des emplois du temps rédigés en arabe (ou
 * l'inverse). Sans passerelle, aucun libellé arabe ne peut se rattacher à une
 * matière existante. Cette table couvre le tronc commun marocain ; chaque
 * concept liste ses formes dans les deux langues, toutes utilisées comme
 * libellés de rapprochement.
 */
const SUBJECT_CONCEPTS = [
  { fr: ['mathematiques', 'maths', 'math'], ar: ['الرياضيات', 'رياضيات'] },
  { fr: ['physique chimie', 'physique', 'chimie'], ar: ['الفيزياء والكيمياء', 'الفيزياء', 'علوم فيزيائية'] },
  { fr: ['sciences de la vie et de la terre', 'svt'], ar: ['علوم الحياة والارض', 'علوم الحياة'] },
  { fr: ['langue arabe', 'arabe'], ar: ['اللغة العربية', 'العربية'] },
  { fr: ['langue francaise', 'francais'], ar: ['اللغة الفرنسية', 'الفرنسية'] },
  { fr: ['langue anglaise', 'anglais'], ar: ['اللغة الانجليزية', 'الانجليزية'] },
  { fr: ['education islamique', 'islamique'], ar: ['التربية الاسلامية', 'التربيه الاسلاميه'] },
  { fr: ['histoire geographie', 'histoire', 'geographie'], ar: ['التاريخ والجغرافيا', 'الاجتماعيات'] },
  { fr: ['philosophie', 'philo'], ar: ['الفلسفة'] },
  { fr: ['informatique'], ar: ['المعلوميات', 'الاعلاميات'] },
  { fr: ['education physique et sportive', 'eps', 'sport'], ar: ['التربية البدنية', 'التربيه البدنيه'] },
  { fr: ['economie et gestion', 'economie'], ar: ['الاقتصاد والتدبير', 'الاقتصاد'] },
  { fr: ['comptabilite'], ar: ['المحاسبة'] },
  { fr: ['sciences de l ingenieur', 'technologie'], ar: ['علوم المهندس', 'التكنولوجيا'] },
  { fr: ['education artistique', 'arts plastiques', 'dessin'], ar: ['التربية التشكيلية', 'التربية الفنية'] },
  { fr: ['musique', 'education musicale'], ar: ['التربية الموسيقية', 'الموسيقى'] },
];

/**
 * Libellés supplémentaires à utiliser pour rapprocher une matière : si son nom
 * correspond à un concept connu, on ajoute toutes les autres formes du concept
 * (arabes comme françaises). Renvoie un tableau, vide si aucun concept.
 */
export function subjectAliases(name) {
  const n = norm(name);
  if (!n) return [];

  // Comparaison STRICTE et sur TOUS les concepts, puis meilleur score : avec la
  // mesure indulgente, « Éducation Physique et Sportive » attrapait le concept
  // « physique-chimie » et héritait de ses libellés arabes.
  let best = null;
  for (const concept of SUBJECT_CONCEPTS) {
    const score = Math.max(
      ...concept.fr.map((f) => similarity(n, f, { lenient: false })),
      ...concept.ar.map((a) => (norm(a) === n ? 1 : 0)),
    );
    if (score >= 0.8 && (!best || score > best.score)) best = { concept, score };
  }

  return best ? [...best.concept.fr, ...best.concept.ar] : [];
}

// ── Regroupement des créneaux horaires en lignes de grille ────────────────

/**
 * La table class_timetable indexe les créneaux par `slot_order`, partagé entre
 * les jours. On construit donc un modèle de lignes à partir de l'union des
 * plages horaires rencontrées, en fusionnant celles qui ne diffèrent que de
 * quelques minutes (un document écrit rarement 08:00 partout).
 *
 * Renvoie { rows: [{ start_time, end_time }], indexOf(start, end) }.
 */
export function buildSlotRows(slots, { toleranceMin = 15 } = {}) {
  const rows = [];

  const ordered = [...slots].sort(
    (a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time)
      || timeToMinutes(a.end_time) - timeToMinutes(b.end_time),
  );

  for (const s of ordered) {
    const start = timeToMinutes(s.start_time);
    const end = timeToMinutes(s.end_time);
    const hit = rows.find(
      (r) => Math.abs(timeToMinutes(r.start_time) - start) <= toleranceMin
        && Math.abs(timeToMinutes(r.end_time) - end) <= toleranceMin,
    );
    if (!hit) rows.push({ start_time: s.start_time, end_time: s.end_time });
  }

  rows.sort((a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time));

  const indexOf = (startTime, endTime) => {
    const start = timeToMinutes(startTime);
    const end = timeToMinutes(endTime);
    let bestIdx = -1;
    let bestDist = Infinity;
    rows.forEach((r, i) => {
      const d = Math.abs(timeToMinutes(r.start_time) - start) + Math.abs(timeToMinutes(r.end_time) - end);
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    });
    return bestIdx;
  };

  return { rows, indexOf };
}
