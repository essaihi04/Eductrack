/**
 * Base de connaissances du chatbot WhatsApp.
 *
 * L'administration importe un PDF « général » (typiquement la liste des
 * fournitures scolaires de TOUS les niveaux). Ce module :
 *   1. extrait le texte du PDF (pdf-parse),
 *   2. le découpe PAR NIVEAU via DeepSeek (repli heuristique sans clé API),
 *   3. stocke chaque niveau dans chatbot_document_sections,
 *   4. retrouve la bonne section quand un parent pose une question.
 *
 * Le PDF envoyé au parent n'est JAMAIS le fichier d'origine : il est
 * régénéré pour le seul niveau demandé (voir suppliesPdf.js).
 */

import OpenAI from 'openai';
import { supabaseAdmin } from '../../../config/supabase.js';
import { LEVEL_ORDER } from '../../../utils/levelProgression.js';

const deepseek = new OpenAI({
  baseURL: 'https://api.deepseek.com',
  apiKey: process.env.DEEPSEEK_API_KEY || '',
  timeout: 120_000, // découpage d'un document entier : plus long qu'une réponse chat
  maxRetries: 1,
});

// Taille max de texte envoyée au LLM (au-delà : tronqué, l'admin peut découper
// son PDF ou corriger les sections à la main dans l'interface).
const MAX_TEXT_FOR_LLM = 30_000;

// ─────────────────────────────────────────────────────────────────────────
// Normalisation & alias de niveaux
// ─────────────────────────────────────────────────────────────────────────

// Marques à supprimer avant comparaison : accents latins (combinés par NFD),
// diacritiques arabes et tatweel. Construits depuis leurs codepoints pour ne pas
// glisser de caractères combinants invisibles dans le code source.
const MARKS_RE = new RegExp('[' + String.fromCharCode(0x0300) + '-' + String.fromCharCode(0x036F) + String.fromCharCode(0x064B) + '-' + String.fromCharCode(0x0652) + String.fromCharCode(0x0640) + ']', 'g');

/**
 * Normalise un texte pour la comparaison : minuscules, sans accents, arabe
 * unifié (hamza/ta marbouta/alif maqsura), ponctuation réduite aux espaces.
 */
export function normalizeText(input) {
  return String(input || '')
    .normalize('NFD')
    .replace(MARKS_RE, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/**
 * Alias de chaque niveau du référentiel marocain (FR / AR / darija).
 * Sert à reconnaître le niveau demandé par un parent en texte libre et à
 * rattacher les titres du PDF au bon code de niveau.
 */
const LEVEL_ALIASES = {
  TPS:  ['tps', 'toute petite section', 'tres petite section'],
  PS:   ['ps', 'petite section', 'قسم صغير'],
  MS:   ['ms', 'moyenne section', 'قسم متوسط'],
  GS:   ['gs', 'grande section', 'قسم كبير'],
  // Le primaire s'écrit aussi « AEP » (année d'enseignement primaire) selon les
  // écoles : les deux notations doivent tomber sur le même code.
  '1AP': ['1ap', '1 ap', '1aep', '1 aep', '1ere annee primaire', 'premiere annee primaire', '1ere primaire', 'cp',
    'الاولى ابتدائي', 'السنة الاولى ابتدائي', 'الاول ابتدائي', 'المستوى الاول ابتدائي'],
  '2AP': ['2ap', '2 ap', '2aep', '2 aep', '2eme annee primaire', 'deuxieme annee primaire', '2eme primaire', 'ce1',
    'الثانية ابتدائي', 'السنة الثانية ابتدائي', 'المستوى الثاني ابتدائي'],
  '3AP': ['3ap', '3 ap', '3aep', '3 aep', '3eme annee primaire', 'troisieme annee primaire', '3eme primaire', 'ce2',
    'الثالثة ابتدائي', 'السنة الثالثة ابتدائي', 'المستوى الثالث ابتدائي'],
  '4AP': ['4ap', '4 ap', '4aep', '4 aep', '4eme annee primaire', 'quatrieme annee primaire', '4eme primaire', 'cm1',
    'الرابعة ابتدائي', 'السنة الرابعة ابتدائي', 'المستوى الرابع ابتدائي'],
  '5AP': ['5ap', '5 ap', '5aep', '5 aep', '5eme annee primaire', 'cinquieme annee primaire', '5eme primaire', 'cm2',
    'الخامسة ابتدائي', 'السنة الخامسة ابتدائي', 'المستوى الخامس ابتدائي'],
  '6AP': ['6ap', '6 ap', '6aep', '6 aep', '6eme annee primaire', 'sixieme annee primaire', '6eme primaire',
    'السادسة ابتدائي', 'السنة السادسة ابتدائي', 'المستوى السادس ابتدائي'],
  '1AC': ['1ac', '1 ac', '1ere annee college', 'premiere annee college', '1ere college',
    'الاولى اعدادي', 'السنة الاولى اعدادي', 'الاولى ثانوي اعدادي'],
  '2AC': ['2ac', '2 ac', '2eme annee college', 'deuxieme annee college', '2eme college',
    'الثانية اعدادي', 'السنة الثانية اعدادي'],
  '3AC': ['3ac', '3 ac', '3eme annee college', 'troisieme annee college', '3eme college',
    'الثالثة اعدادي', 'السنة الثالثة اعدادي'],
  TC:   ['tc', 'tronc commun', 'الجذع المشترك', 'جذع مشترك'],
  '1BAC': ['1bac', '1 bac', '1ere bac', 'premiere bac', '1ere annee bac', 'premiere annee baccalaureat',
    'الاولى باكالوريا', 'الاولى باك', 'السنة الاولى باكالوريا'],
  '2BAC': ['2bac', '2 bac', '2eme bac', 'deuxieme bac', '2eme annee bac', 'terminale',
    'الثانية باكالوريا', 'الثانية باك', 'السنة الثانية باكالوريا'],
};

// Alias pré-normalisés, du plus long au plus court (le plus spécifique gagne).
const NORMALIZED_ALIASES = Object.entries(LEVEL_ALIASES).flatMap(([code, aliases]) =>
  aliases.map((a) => ({ code, alias: normalizeText(a) })),
).sort((a, b) => b.alias.length - a.alias.length);

/**
 * Cherche un alias dans un texte normalisé. Les alias courts (≤ 4 caractères,
 * type « ps », « tc », « 1ap ») exigent une frontière de mot pour éviter les
 * faux positifs (« temps », « ctc »…).
 */
function aliasMatches(normalizedText, normalizedAlias) {
  if (!normalizedAlias) return false;
  if (normalizedAlias.length <= 4) {
    return new RegExp(`(^| )${normalizedAlias}( |$)`).test(normalizedText);
  }
  return normalizedText.includes(normalizedAlias);
}

/**
 * Déduit le code de niveau (1AP, 2AC…) d'un libellé libre.
 * @returns {string|null}
 */
export function levelCodeFromLabel(label) {
  const t = normalizeText(label);
  if (!t) return null;
  const direct = LEVEL_ORDER.find((code) => normalizeText(code) === t);
  if (direct) return direct;
  const hit = NORMALIZED_ALIASES.find((a) => aliasMatches(t, a.alias));
  return hit ? hit.code : null;
}

/**
 * Trouve la section qui correspond au niveau évoqué par le parent.
 * Compare d'abord les libellés/alias réellement présents dans le document
 * (l'école peut nommer ses niveaux autrement), puis le référentiel national.
 *
 * @param {string} text     message du parent
 * @param {Array} sections  sections chargées depuis la DB
 * @returns {object|null}
 */
export function matchSectionFromText(text, sections) {
  const t = normalizeText(text);
  if (!t || !sections?.length) return null;

  // 1. Libellés et alias propres au document (les plus longs d'abord)
  const candidates = [];
  for (const s of sections) {
    const labels = [s.level_label, ...(s.aliases || [])].filter(Boolean);
    for (const l of labels) {
      const norm = normalizeText(l);
      if (norm) candidates.push({ section: s, alias: norm });
    }
  }
  candidates.sort((a, b) => b.alias.length - a.alias.length);
  const byLabel = candidates.find((c) => aliasMatches(t, c.alias));
  if (byLabel) return byLabel.section;

  // 2. Référentiel national → code de niveau
  const hit = NORMALIZED_ALIASES.find((a) => aliasMatches(t, a.alias));
  if (!hit) return null;
  return sections.find((s) => s.level_code === hit.code) || null;
}

/** Section correspondant au niveau d'un élève (classes.level ou nom de classe). */
export function matchSectionForLevel(levelOrClassName, sections) {
  if (!levelOrClassName || !sections?.length) return null;
  const code = levelCodeFromLabel(levelOrClassName);
  if (code) {
    const byCode = sections.find((s) => s.level_code === code);
    if (byCode) return byCode;
  }
  return matchSectionFromText(levelOrClassName, sections);
}

// ─────────────────────────────────────────────────────────────────────────
// Extraction du texte du PDF
// ─────────────────────────────────────────────────────────────────────────

/**
 * Extrait le texte d'un PDF (pdf-parse v2). Renvoie '' en cas d'échec —
 * typiquement un PDF « scanné » (images) sans couche texte.
 */
export async function extractPdfText(buffer) {
  try {
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    const result = await parser.getText();
    return (result?.text || '').replace(/\r/g, '').trim();
  } catch (e) {
    console.warn('[knowledge] extraction pdf-parse échouée:', e.message);
    return '';
  }
}

/**
 * Repère l'année scolaire écrite dans le document (« 2026-2027 », « 2026/2027 »,
 * « 2026 - 2027 »). Le document lui-même est la source la plus fiable : une
 * liste de fournitures est publiée pour la rentrée à venir, alors que le
 * formulaire d'import propose l'année active de l'application.
 *
 * @returns {string|null} année normalisée « YYYY-YYYY »
 */
export function detectAcademicYear(text) {
  const t = String(text || '').slice(0, 4000);
  const matches = [...t.matchAll(/(20\d{2})\s*[-–—/]\s*(20\d{2})/g)];
  for (const m of matches) {
    const a = parseInt(m[1], 10);
    const b = parseInt(m[2], 10);
    if (b === a + 1) return `${a}-${b}`;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────
// Découpage par niveau
// ─────────────────────────────────────────────────────────────────────────

const STRUCTURE_PROMPT = `Tu es un assistant qui structure les documents administratifs d'une école marocaine.

On te donne le TEXTE BRUT d'un document (souvent une liste de fournitures scolaires couvrant PLUSIEURS niveaux).

Ta tâche : découper ce document PAR NIVEAU SCOLAIRE et renvoyer un JSON STRICT :
{
  "document_title": "titre court du document",
  "sections": [
    {
      "level_code": "code du référentiel marocain ou null",
      "level_label": "le niveau tel qu'écrit dans le document",
      "aliases": ["autres écritures du même niveau, y compris en arabe"],
      "groups": [
        { "title": "catégorie (ex: Cahiers, Trousse, Sport)", "items": [
            { "label": "article", "quantity": "quantité ou ''", "note": "précision ou ''" }
        ] }
      ],
      "notes": ["consignes générales propres à ce niveau"]
    }
  ]
}

CODES DE NIVEAU AUTORISÉS : TPS, PS, MS, GS, 1AP, 2AP, 3AP, 4AP, 5AP, 6AP, 1AC, 2AC, 3AC, TC, 1BAC, 2BAC.
(1AP = 1ère année primaire, 1AC = 1ère année collège, TC = tronc commun, BAC = baccalauréat.)

RÈGLES :
- Une section PAR niveau trouvé. Si le document ne distingue aucun niveau, renvoie UNE seule section avec level_code = null et level_label = "Tous les niveaux".
- N'INVENTE RIEN : recopie uniquement les articles réellement présents dans le texte.
- Si un article n'a pas de quantité, mets "".
- Regroupe les articles en catégories logiques quand le document le fait ; sinon un seul groupe intitulé "Fournitures".
- Conserve la langue d'origine des articles (français ou arabe).
- Les consignes qui concernent TOUS les niveaux doivent être répétées dans le champ "notes" de chaque section.

FILTRAGE — un "item" est UNIQUEMENT une chose que le parent doit acheter ou apporter.
Ne mets JAMAIS dans "items" :
- un titre de rubrique ("Manuels", "Fournitures", "Trousse complète", "المقررات", "اللوازم", "Manuels — Français") : c'est un "title" de groupe ;
- une métadonnée du document ("Niveau : GS", "Source : liste.pdf", "Liste établie pour 2025/2026") ;
- un en-tête ou un pied de page (nom de l'école, "Année scolaire 2026-2027", numéro de page) ;
- un intitulé de matière seul ("Français", "Mathématiques", "الاجتماعيات") : c'est un "title" de groupe.
Ces lignes doivent être ignorées ou converties en titre de groupe, jamais recopiées en article.

MISE EN FORME DES ITEMS :
- Le texte du PDF est extrait ligne par ligne : un article coupé en deux par la mise en page ("... + cahier" puis "d'écriture)") doit être RECOLLÉ en un seul item.
- Retire les puces et tirets de début et de fin de ligne ("•", "-", "*").
- Un item doit être compréhensible seul, hors de son contexte de page.

- Réponds UNIQUEMENT avec le JSON, sans commentaire.`;

/**
 * Découpe le texte extrait en sections par niveau via DeepSeek.
 * @returns {Promise<{document_title: string|null, sections: Array}|null>} null si indisponible
 */
async function structureWithLLM(text) {
  if (!process.env.DEEPSEEK_API_KEY || !text) return null;
  try {
    const completion = await deepseek.chat.completions.create({
      model: 'deepseek-chat',
      temperature: 0,
      // Un document couvrant une dizaine de niveaux dépasse la sortie par défaut
      // (4096 jetons) : le JSON serait tronqué donc illisible → repli heuristique.
      max_tokens: 8000,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: STRUCTURE_PROMPT },
        { role: 'user', content: text.slice(0, MAX_TEXT_FOR_LLM) },
      ],
    });
    const raw = completion.choices[0]?.message?.content;
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.sections)) return null;
    return parsed;
  } catch (e) {
    console.error('[knowledge] structuration DeepSeek échouée:', e.message);
    return null;
  }
}

/**
 * Code de niveau d'une ligne, UNIQUEMENT si elle en est le titre.
 *
 * levelCodeFromLabel() est volontairement permissif : il sert à comprendre le
 * message d'un parent, où « ce2 » peut apparaître n'importe où. Appliqué au
 * découpage d'un document, il transformait « Calculator CE2 (deuxième
 * édition) » — un article — en titre de niveau. On exige donc que le libellé
 * de niveau OUVRE la ligne.
 *
 * @returns {string|null}
 */
function headingLevelCode(line) {
  const raw = String(line || '').trim().replace(/^[-–—•*\s]+/, '');
  if (!raw || raw.length > 80) return null;
  const t = normalizeText(raw);
  if (!t) return null;
  const startsWith = (needle) => needle && (t === needle || t.startsWith(`${needle} `));
  const direct = LEVEL_ORDER.find((code) => startsWith(normalizeText(code)));
  if (direct) return direct;
  const hit = NORMALIZED_ALIASES.find((a) => startsWith(a.alias));
  return hit ? hit.code : null;
}

/**
 * Découpe le texte en blocs, un par niveau, sur les lignes de titre.
 * Sert à traiter le document niveau par niveau au lieu d'un seul appel LLM.
 *
 * @returns {Array<{code: string, label: string, text: string}>}
 */
function splitBlocksByLevel(text) {
  const lines = String(text || '').split('\n');
  const blocks = [];
  let current = null;
  for (const line of lines) {
    const code = headingLevelCode(line);
    if (code) {
      current = { code, label: line.trim(), lines: [] };
      blocks.push(current);
      continue;
    }
    if (current) current.lines.push(line);
  }
  const usable = blocks
    .map((b) => ({ code: b.code, label: b.label, text: `${b.label}\n${b.lines.join('\n')}` }))
    .filter((b) => b.text.replace(/\s/g, '').length > 40);

  // Un même niveau peut apparaître plusieurs fois : sommaire en tête de
  // document, page « niveaux non couverts » en fin, rappel en pied de page.
  // Ces occurrences ne portent pas la liste, seulement le titre. On ne garde
  // donc, pour chaque niveau, que le bloc le plus fourni.
  const byCode = new Map();
  for (const b of usable) {
    const kept = byCode.get(b.code);
    if (!kept || b.text.length > kept.text.length) byCode.set(b.code, b);
  }
  return [...byCode.values()];
}

/**
 * Repli sans IA : découpe le texte sur les lignes qui ressemblent à un titre
 * de niveau. Le contenu est conservé en liste simple (l'admin peut corriger).
 */
function heuristicSplit(text) {
  const lines = String(text || '').split('\n').map((l) => l.trim()).filter(Boolean);
  const sections = [];
  let current = null;

  for (const line of lines) {
    // Titre de niveau : le libellé doit ouvrir la ligne (voir headingLevelCode).
    const code = headingLevelCode(line);
    if (code) {
      current = { level_code: code, level_label: line, aliases: [], items: [] };
      sections.push(current);
      continue;
    }
    if (current) current.items.push(line.replace(/^[-•*•]\s*/, ''));
  }

  if (sections.length === 0) {
    return [{
      level_code: null,
      level_label: 'Tous les niveaux',
      aliases: [],
      groups: [{ title: 'Fournitures', items: lines.map((l) => ({ label: l, quantity: '', note: '' })) }],
      notes: [],
    }];
  }

  return sections.map((s) => ({
    level_code: s.level_code,
    level_label: s.level_label,
    aliases: [],
    groups: [{ title: 'Fournitures', items: s.items.map((l) => ({ label: l, quantity: '', note: '' })) }],
    notes: [],
  }));
}

// ─────────────────────────────────────────────────────────────────────────
// Filtrage des fausses fournitures
//
// Le LLM recopie parfois des lignes qui ne sont PAS des articles : en-tête et
// pied de page du PDF, mention de source, numéro de page, année scolaire, ou
// le titre de catégorie lui-même (« Manuels », « المقررات »). Elles se
// retrouvaient telles quelles dans la liste du parent, avec une case à cocher.
// Le prompt seul ne suffit pas — on filtre donc aussi de façon déterministe.
// ─────────────────────────────────────────────────────────────────────────

/** Puces et tirets décoratifs laissés par l'extraction du PDF. */
const BULLET_RE = /^[\s\-–—•*·▪◦o]+|[\s\-–—•*·▪◦]+$/g;

/** Titres de rubrique courants : jamais un article à acheter. */
const HEADING_WORDS = [
  'manuels', 'fournitures', 'manuel', 'fourniture', 'important', 'trousse',
  'trousse complète', 'matériel', 'materiel', 'divers', 'liste', 'sommaire',
  'المقررات', 'اللوازم', 'الكتب', 'المواد',
];

/**
 * Une ligne à rejeter : métadonnée de document, en-tête/pied de page, ou
 * simple titre de rubrique. Rien qu'un parent puisse acheter.
 */
function isNotSupplyItem(label) {
  const t = String(label || '').trim();
  if (!t) return true;
  // Numéro de page seul (« 3 », « 4 / 12 »).
  if (/^\d+\s*(\/\s*\d+)?$/.test(t)) return true;
  // Année scolaire seule (« Année scolaire 2026-2027 »).
  if (/^(année|annee|العام|السنة)?\s*(scolaire|الدراسي[ةه]?)?\s*20\d{2}\s*[-–/]\s*20\d{2}\.?$/i.test(t)) return true;
  // Ligne de métadonnée du document source.
  if (/^niveau\s*[:：]/i.test(t) && /(source|liste établie|liste etablie)/i.test(t)) return true;
  if (/^source\s*[:：]/i.test(t)) return true;
  if (/(liste établie pour|liste etablie pour)/i.test(t)) return true;
  // Pied de page « ÉCOLE — Fournitures 1AP — CP (…) ».
  if (/—\s*fournitures\s+(TPS|PS|MS|GS|[1-6]AP|[1-3]AC|TC|[12]BAC)\b/i.test(t)) return true;
  // Titre de rubrique nu, éventuellement suivi de « : » ou d'une matière.
  const bare = t.replace(/[:：.]+$/, '').trim().toLowerCase();
  if (bare.length <= 40 && HEADING_WORDS.includes(bare)) return true;
  // « Manuels — Français », « المقررات — العربية » : titre composé, pas un article.
  if (bare.length <= 40 && /^(manuels?|fournitures?|المقررات|اللوازم)\s*[—–-]/.test(bare)) return true;
  return false;
}

/**
 * Recolle un fragment né d'un retour à la ligne du PDF d'origine
 * (« … + cahier » / « d'écriture) »). On reste prudent : uniquement un court
 * fragment qui commence en minuscule ou par une ponctuation fermante, après
 * un article qui ne se termine pas lui-même par une ponctuation forte.
 */
function looksLikeContinuation(fragment, previousLabel) {
  const f = String(fragment || '').trim();
  const p = String(previousLabel || '').trim();
  if (!f || !p) return false;
  if (f.length > 40) return false;
  if (!/^[a-zà-öø-ÿ)\]]/.test(f)) return false;
  if (/[.!?:；;]$/.test(p)) return false;
  return true;
}

/** Nettoie / borne une section renvoyée par le LLM avant insertion en base. */
function sanitizeSection(section, index) {
  const levelLabel = String(section?.level_label || '').trim() || 'Tous les niveaux';
  const levelCode = LEVEL_ORDER.includes(String(section?.level_code || '').toUpperCase())
    ? String(section.level_code).toUpperCase()
    : levelCodeFromLabel(levelLabel);

  const groups = (Array.isArray(section?.groups) ? section.groups : [])
    .map((g) => {
      const title = String(g?.title || 'Fournitures').trim().slice(0, 120);
      const titleKey = title.replace(/[:：.]+$/, '').trim().toLowerCase();

      const cleaned = (Array.isArray(g?.items) ? g.items : [])
        .map((it) => (typeof it === 'string'
          ? { label: it, quantity: '', note: '' }
          : {
            label: String(it?.label || '').trim().slice(0, 300),
            quantity: String(it?.quantity ?? '').trim().slice(0, 40),
            note: String(it?.note ?? '').trim().slice(0, 200),
          }))
        // Puces décoratives issues de l'extraction du PDF.
        .map((it) => ({ ...it, label: it.label.replace(BULLET_RE, '').trim() }))
        // Métadonnées, en-têtes/pieds de page, titres de rubrique.
        .filter((it) => it.label && !isNotSupplyItem(it.label))
        // Le titre du groupe répété en premier article.
        .filter((it) => it.label.replace(/[:：.]+$/, '').trim().toLowerCase() !== titleKey);

      // Recollage des fragments coupés par la mise en page d'origine.
      const items = [];
      for (const it of cleaned) {
        const prev = items[items.length - 1];
        if (prev && looksLikeContinuation(it.label, prev.label)) {
          prev.label = `${prev.label} ${it.label}`.replace(/\s+/g, ' ').slice(0, 300);
          continue;
        }
        items.push(it);
      }

      return { title, items };
    })
    .filter((g) => g.items.length > 0);

  const notes = (Array.isArray(section?.notes) ? section.notes : [])
    .map((n) => String(n || '').trim().slice(0, 400))
    .filter(Boolean);

  const aliases = [...new Set(
    (Array.isArray(section?.aliases) ? section.aliases : [])
      .map((a) => String(a || '').trim())
      .filter(Boolean)
      .slice(0, 12),
  )];

  const rawText = [
    levelLabel,
    ...groups.flatMap((g) => [g.title, ...g.items.map((i) => `${i.quantity} ${i.label} ${i.note}`.trim())]),
    ...notes,
  ].join('\n');

  return {
    level_code: levelCode,
    level_label: levelLabel,
    aliases,
    content: { groups, notes },
    raw_text: rawText,
    sort_order: levelCode ? LEVEL_ORDER.indexOf(levelCode) : 100 + index,
  };
}

/**
 * Analyse un document : extraction texte → découpage par niveau → écriture des
 * sections. Les anciennes sections du document sont remplacées.
 *
 * Le découpage par niveau ne concerne QUE les fournitures : ce sont les seules
 * à être régénérées en PDF pour un niveau précis. Un règlement intérieur, un
 * calendrier ou un dossier d'inscription est envoyé au parent tel quel (voir
 * documents.js) ; on se contente d'en extraire le texte pour les réponses IA.
 *
 * @param {object} p
 * @param {string} p.documentId
 * @param {string} p.schoolId
 * @param {Buffer} [p.buffer]  PDF source (sinon on réutilise source_text)
 * @returns {Promise<{sections: number, status: string, error?: string}>}
 */
export async function analyzeDocument({ documentId, schoolId, buffer = null }) {
  const { data: document } = await supabaseAdmin
    .from('chatbot_documents')
    .select('category, academic_year, source_text')
    .eq('id', documentId)
    .maybeSingle();

  const splitByLevel = (document?.category || 'fournitures') === 'fournitures';
  const text = buffer ? await extractPdfText(buffer) : (document?.source_text || '');

  if (!text || text.replace(/\s/g, '').length < 40) {
    const error = "Aucun texte lisible dans ce PDF (document scanné ?). Importez un PDF contenant du texte sélectionnable.";
    await supabaseAdmin
      .from('chatbot_documents')
      .update({ status: 'error', error_message: error, source_text: text || null, updated_at: new Date().toISOString() })
      .eq('id', documentId);
    return { sections: 0, status: 'error', error };
  }

  // Document diffusé tel quel : pas de découpage, pas d'appel au LLM.
  if (!splitByLevel) {
    await supabaseAdmin.from('chatbot_document_sections').delete().eq('document_id', documentId);
    const detected = detectAcademicYear(text);
    const update = {
      status: 'ready',
      error_message: null,
      source_text: text,
      updated_at: new Date().toISOString(),
    };
    if (detected && !document?.academic_year) update.academic_year = detected;
    await supabaseAdmin.from('chatbot_documents').update(update).eq('id', documentId);
    return {
      sections: 0,
      status: 'ready',
      as_is: true,
      academic_year: update.academic_year || document?.academic_year || null,
      detected_academic_year: detected,
    };
  }

  // Un document couvrant une douzaine de niveaux dépasse largement la sortie
  // maximale du LLM : le JSON revenait tronqué, donc illisible, et l'analyse
  // basculait silencieusement sur le repli heuristique (une seule rubrique
  // « Fournitures », titres de matières transformés en articles).
  //
  // On découpe donc d'abord par niveau de façon déterministe, puis on
  // structure CHAQUE niveau séparément : chaque réponse reste courte. Le
  // libellé du niveau vient du document, plus d'une supposition du modèle.
  const blocks = splitBlocksByLevel(text);
  let rawSections = [];

  if (blocks.length >= 2) {
    // Concurrence bornée : l'import est attendu par la requête HTTP, on ne
    // sérialise pas 12 appels réseau, sans pour autant saturer l'API.
    const results = new Array(blocks.length).fill(null);
    const CONCURRENCY = 4;
    let cursor = 0;
    const worker = async () => {
      while (cursor < blocks.length) {
        const i = cursor++;
        const block = blocks[i];
        const one = await structureWithLLM(block.text);
        const section = one?.sections?.[0];
        results[i] = section
          // Le découpage déterministe fait autorité sur le niveau.
          ? { ...section, level_code: block.code, level_label: section.level_label || block.label }
          : heuristicSplit(block.text)[0] || null;
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, blocks.length) }, worker));
    rawSections = results.filter(Boolean);
  }

  // Document sans titres de niveau exploitables : ancien comportement.
  if (rawSections.length === 0) {
    const structured = await structureWithLLM(text);
    rawSections = structured?.sections?.length ? structured.sections : heuristicSplit(text);
  }

  const sections = rawSections
    .map(sanitizeSection)
    .filter((s) => s.content.groups.length > 0 || s.content.notes.length > 0);

  if (sections.length === 0) {
    const error = "Le document n'a pas pu être découpé par niveau. Vérifiez son contenu ou saisissez les niveaux manuellement.";
    await supabaseAdmin
      .from('chatbot_documents')
      .update({ status: 'error', error_message: error, source_text: text, updated_at: new Date().toISOString() })
      .eq('id', documentId);
    return { sections: 0, status: 'error', error };
  }

  await supabaseAdmin.from('chatbot_document_sections').delete().eq('document_id', documentId);
  const { error: insertError } = await supabaseAdmin
    .from('chatbot_document_sections')
    .insert(sections.map((s) => ({ ...s, document_id: documentId, school_id: schoolId })));
  if (insertError) throw insertError;

  const update = {
    status: 'ready',
    error_message: null,
    source_text: text,
    updated_at: new Date().toISOString(),
  };

  // Année scolaire écrite dans le document : elle fait foi si l'admin n'en a pas
  // saisi (le formulaire propose l'année active, alors qu'une liste de
  // fournitures vise la rentrée suivante).
  const detectedYear = detectAcademicYear(text);
  if (detectedYear && !document?.academic_year) update.academic_year = detectedYear;

  await supabaseAdmin.from('chatbot_documents').update(update).eq('id', documentId);

  return {
    sections: sections.length,
    status: 'ready',
    academic_year: update.academic_year || document?.academic_year || null,
    detected_academic_year: detectedYear,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Lecture (chatbot)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Sections actives d'une école pour une catégorie donnée (fournitures par
 * défaut), triées par niveau. Le document le plus récent gagne quand plusieurs
 * documents couvrent le même niveau.
 */
export async function getActiveSections(schoolId, category = 'fournitures') {
  if (!schoolId) return [];
  const { data: docs } = await supabaseAdmin
    .from('chatbot_documents')
    .select('id, title, academic_year, created_at')
    .eq('school_id', schoolId)
    .eq('category', category)
    .eq('is_active', true)
    .eq('status', 'ready')
    .order('created_at', { ascending: false });

  if (!docs?.length) return [];
  const docById = new Map(docs.map((d) => [d.id, d]));

  const { data: sections } = await supabaseAdmin
    .from('chatbot_document_sections')
    .select('id, document_id, level_code, level_label, aliases, content, sort_order')
    .in('document_id', docs.map((d) => d.id))
    .order('sort_order', { ascending: true });

  // Dédoublonnage par niveau : on garde la section du document le plus récent.
  const docRank = new Map(docs.map((d, i) => [d.id, i])); // 0 = plus récent
  const byLevel = new Map();
  for (const s of sections || []) {
    const key = s.level_code || `label:${normalizeText(s.level_label)}`;
    const kept = byLevel.get(key);
    if (!kept || docRank.get(s.document_id) < docRank.get(kept.document_id)) {
      byLevel.set(key, { ...s, document: docById.get(s.document_id) || null });
    }
  }

  return [...byLevel.values()].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
}

/** Une section précise (avec son document) — utilisé pour l'aperçu admin. */
export async function getSectionById(sectionId) {
  const { data } = await supabaseAdmin
    .from('chatbot_document_sections')
    .select('id, document_id, school_id, level_code, level_label, aliases, content, document:chatbot_documents(id, title, category, academic_year)')
    .eq('id', sectionId)
    .maybeSingle();
  return data || null;
}

/**
 * Extraits pertinents des documents « généraux » (hors fournitures) pour
 * enrichir la réponse IA à une question libre. Renvoie [] si rien ne matche —
 * on n'alourdit alors pas le prompt.
 *
 * @returns {Promise<Array<{title: string, category: string, excerpt: string}>>}
 */
export async function getKnowledgeSnippets(
  schoolId,
  question,
  { maxDocs = 2, chunkSize = 900, includeSupplies = false } = {},
) {
  if (!schoolId || !question) return [];
  const tokens = [...new Set(normalizeText(question).split(' ').filter((w) => w.length >= 4))];
  if (tokens.length === 0) return [];

  let docsQuery = supabaseAdmin
    .from('chatbot_documents')
    .select('title, category, source_text')
    .eq('school_id', schoolId)
    .eq('is_active', true)
    .eq('status', 'ready');
  // Les fournitures sont servies en PDF par niveau : les inclure ici ferait
  // répondre l'IA en texte à la place de l'envoi du document.
  if (!includeSupplies) docsQuery = docsQuery.neq('category', 'fournitures');

  const { data: docs } = await docsQuery
    .order('created_at', { ascending: false })
    .limit(8);

  if (!docs?.length) return [];

  const scored = [];
  for (const doc of docs) {
    const text = doc.source_text || '';
    for (let i = 0; i < text.length; i += chunkSize) {
      const chunk = text.slice(i, i + chunkSize);
      const norm = normalizeText(chunk);
      const score = tokens.reduce((s, tok) => s + (norm.includes(tok) ? 1 : 0), 0);
      if (score > 0) scored.push({ title: doc.title, category: doc.category, excerpt: chunk.trim(), score });
    }
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, maxDocs)
    .map(({ title, category, excerpt }) => ({ title, category, excerpt }));
}
