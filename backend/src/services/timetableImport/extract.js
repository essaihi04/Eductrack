/**
 * Extraction : pages (images ou texte) → emplois du temps structurés.
 *
 * Une « page » = une image envoyée par le front (photo, capture, ou page de PDF
 * rendue en PNG côté navigateur), accompagnée éventuellement du texte de cette
 * page quand le PDF possédait une couche texte.
 *
 * Une page peut contenir PLUSIEURS classes (emploi du temps général de
 * l'établissement) et une classe peut s'étaler sur PLUSIEURS pages : les
 * résultats sont donc fusionnés par nom de classe à la fin.
 */
import {
  structureFromText, ocrToText, hasOcr, hasTextAi,
} from './aiProviders.js';
import { normalizeDay, normalizeTime, norm, timeToMinutes } from './normalize.js';

const SYSTEM_PROMPT = `Tu extrais des emplois du temps scolaires (établissements marocains, documents en français et/ou en arabe) et tu les convertis en JSON.

Réponds UNIQUEMENT avec un objet JSON de cette forme exacte :
{
  "timetables": [
    {
      "class_name": "nom de la classe tel qu'écrit sur le document (ex: 2BAC PC-1, 6ème A, الأولى إعدادي 3), ou null si absent",
      "slots": [
        {
          "day": "monday|tuesday|wednesday|thursday|friday|saturday",
          "start": "HH:MM",
          "end": "HH:MM",
          "subject": "matière telle qu'écrite (garde la langue d'origine)",
          "teacher": "nom du professeur tel qu'écrit, ou null",
          "room": "salle, ou null"
        }
      ]
    }
  ]
}

RÈGLES IMPORTANTES :
- Une seule entrée par créneau réellement occupé. N'invente JAMAIS un cours.
- Ignore les cellules vides, les pauses, la récréation et le déjeuner.
- Les colonnes sont en général les jours, les lignes les horaires — mais l'inverse existe : déduis-le du document.
- Si le document est en arabe, il se lit de droite à gauche : associe bien chaque cellule à sa colonne.
- Convertis toutes les heures au format 24h HH:MM (8h → 08:00, 8h30 → 08:30).
- Si un créneau couvre plusieurs lignes fusionnées, produis une seule entrée avec l'heure de début de la première ligne et l'heure de fin de la dernière.
- Si la page contient plusieurs classes, produis un objet par classe dans "timetables".
- Si la page ne contient aucun emploi du temps, renvoie {"timetables": []}.
- Recopie les libellés SANS les traduire ni les corriger : le rapprochement avec la base est fait ensuite.`;

/** Seuil au-delà duquel on considère que la couche texte du PDF est exploitable. */
const TEXT_THRESHOLD = 120;

/** Ajoute des minutes à une heure HH:MM, plafonné à 23:59. */
function addMinutes(time, minutes) {
  const total = Math.min(23 * 60 + 59, timeToMinutes(time) + minutes);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** Nettoie et valide un créneau renvoyé par l'IA. Renvoie null si inexploitable. */
function cleanSlot(raw) {
  const day = normalizeDay(raw?.day);
  const start = normalizeTime(raw?.start ?? raw?.start_time);
  const end = normalizeTime(raw?.end ?? raw?.end_time);
  const subject = String(raw?.subject || '').trim();

  if (!day || !start || !subject) return null;

  // Heure de fin absente ou incohérente (fin ≤ début) : on pose une séance
  // d'une heure plutôt qu'un créneau de durée nulle, qui casserait la grille.
  // L'admin corrige l'horaire dans l'écran de relecture.
  const safeEnd = end && timeToMinutes(end) > timeToMinutes(start)
    ? end
    : addMinutes(start, 60);

  return {
    day_of_week: day,
    start_time: start,
    end_time: safeEnd,
    subject_raw: subject.slice(0, 120),
    teacher_raw: (raw?.teacher ? String(raw.teacher).trim() : '').slice(0, 120) || null,
    room: (raw?.room ? String(raw.room).trim() : '').slice(0, 60) || null,
  };
}

/**
 * Analyse UNE page. `page` = { name, mimeType, buffer, text }.
 * Renvoie { timetables: [{ class_name, slots }], method, error }.
 */
export async function extractPage(page) {
  const layerText = String(page.text || '').trim();
  const usesOcr = layerText.length < TEXT_THRESHOLD;
  let method = usesOcr ? 'ocr' : 'texte';

  try {
    if (!hasTextAi()) throw new Error('NO_TEXT_AI');

    // 1) Obtenir le texte de la page : couche texte du PDF si elle existe
    //    (gratuit, exact), sinon OCR Mistral sur l'image.
    let text = layerText;
    if (usesOcr) {
      if (!page.buffer) throw new Error('NO_IMAGE');
      if (!hasOcr()) throw new Error('NO_OCR_PROVIDER');
      text = await ocrToText(page.buffer, page.mimeType || 'image/png');
      if (!text || text.length < 20) throw new Error('OCR_EMPTY');
    }

    // 2) Structurer ce texte en JSON via DeepSeek.
    const parsed = await structureFromText({
      text: `PAGE : ${page.name || 'sans nom'}\n\n${text}`,
      systemPrompt: SYSTEM_PROMPT,
    });

    const timetables = (parsed?.timetables || [])
      .map((t) => ({
        class_name: t?.class_name ? String(t.class_name).trim().slice(0, 120) : null,
        slots: (t?.slots || []).map(cleanSlot).filter(Boolean),
      }))
      .filter((t) => t.slots.length > 0);

    return { timetables, method };
  } catch (e) {
    return { timetables: [], method, error: describeError(e.message) };
  }
}

/** Traduit les codes internes en message lisible pour l'admin. */
function describeError(message) {
  switch (message) {
    case 'NO_TEXT_AI':
      return "DEEPSEEK_API_KEY n'est pas configurée sur le serveur : la structuration est impossible.";
    case 'NO_OCR_PROVIDER':
      return "Cette page est une image (photo ou PDF scanné) et MISTRAL_API_KEY n'est pas configurée : l'OCR est impossible.";
    case 'OCR_EMPTY':
      return "L'OCR n'a rien lu sur cette page — vérifiez qu'elle est nette et bien cadrée.";
    case 'NO_IMAGE':
      return 'Page sans image exploitable.';
    default:
      return message;
  }
}

/**
 * Fusionne les résultats de toutes les pages en groupes de classes.
 * Deux pages portant le même nom de classe sont fusionnées (emploi du temps
 * qui déborde sur une 2ᵉ page). Les créneaux en doublon (même jour + même
 * heure de début) ne sont conservés qu'une fois.
 */
export function mergePages(pageResults) {
  const groups = [];

  pageResults.forEach((page, pageIdx) => {
    page.timetables.forEach((tt) => {
      const key = tt.class_name ? norm(tt.class_name) : null;
      let group = key ? groups.find((g) => g.key === key) : null;

      if (!group) {
        group = {
          key: key || `__page_${pageIdx}_${groups.length}`,
          detected_class_name: tt.class_name,
          slots: [],
          pages: [],
        };
        groups.push(group);
      }

      if (!group.pages.includes(page.name)) group.pages.push(page.name);

      tt.slots.forEach((s) => {
        const dup = group.slots.find(
          (x) => x.day_of_week === s.day_of_week && x.start_time === s.start_time,
        );
        if (!dup) group.slots.push(s);
      });
    });
  });

  groups.forEach((g) => {
    g.slots.sort(
      (a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time),
    );
  });

  return groups;
}
