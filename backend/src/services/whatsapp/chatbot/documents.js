/**
 * Documents officiels envoyés TELS QUELS sur WhatsApp.
 *
 * Seules les FOURNITURES sont régénérées par l'application (le document de
 * l'école couvre tous les niveaux, le parent ne doit recevoir que le sien —
 * voir supplies.js / suppliesPdf.js).
 *
 * Tous les autres documents — règlement intérieur, calendrier, dossier
 * d'inscription, menu de la cantine, circuit de transport — sont diffusés dans
 * leur mise en page d'origine : c'est le document officiel de l'établissement,
 * le reformater le dénaturerait (et une longue liste de règles rendue en
 * « consignes » était illisible).
 *
 * Le fichier envoyé est celui stocké à l'import (chatbot_documents.file_url).
 */

import { supabaseAdmin } from '../../../config/supabase.js';
import { sendText, sendDocument } from '../index.js';
import { normalizeText } from './knowledge.js';

/** Catégories diffusables telles quelles (« fournitures » en est exclue). */
export const DOCUMENT_LABELS = {
  reglement: { emoji: '📕', label: 'Règlement intérieur' },
  calendrier: { emoji: '📅', label: 'Calendrier scolaire' },
  inscription: { emoji: '📝', label: 'Dossier d\'inscription' },
  cantine: { emoji: '🍽️', label: 'Cantine' },
  transport: { emoji: '🚌', label: 'Transport scolaire' },
  autre: { emoji: '📄', label: 'Document de l\'école' },
};

// Mots-clés FR / arabe / darija latine, comparés sur le texte normalisé
// (sans accents ni diacritiques) — voir normalizeText().
const CATEGORY_PATTERNS = [
  ['reglement', [
    'reglement', 'reglement interieur', 'reglement de l ecole', 'reglement interne',
    'charte de l ecole', 'regles de l ecole', 'regles de vie', 'discipline de l ecole',
    'النظام الداخلي', 'القانون الداخلي', 'قانون المدرسة', 'ضوابط المدرسة', 'نظام المؤسسة',
    'reglama', 'qanoun dakhili',
  ]],
  ['calendrier', [
    'calendrier scolaire', 'calendrier de l annee', 'dates des vacances', 'vacances scolaires',
    'planning de l annee', 'date de la rentree', 'calendrier des examens',
    'الرزنامة', 'العطل المدرسية', 'تواريخ العطل', 'التقويم المدرسي', 'تاريخ الدخول المدرسي',
  ]],
  ['inscription', [
    'dossier d inscription', 'fiche d inscription', 'comment inscrire', 'documents pour l inscription',
    'papiers de l inscription', 'preinscription', 'formulaire d inscription',
    'ملف التسجيل', 'وثائق التسجيل', 'اوراق التسجيل', 'كيفية التسجيل', 'استمارة التسجيل',
  ]],
  ['cantine', [
    'menu de la cantine', 'menu de la semaine', 'tarif de la cantine', 'inscription cantine',
    'لائحة الوجبات', 'قائمة المطعم', 'ثمن المطعم',
  ]],
  ['transport', [
    'circuit du bus', 'itineraire du bus', 'points de ramassage', 'horaires du bus',
    'tarif du transport', 'inscription transport',
    'مسار الحافلة', 'محطات الحافلة', 'توقيت الحافلة', 'ثمن النقل',
  ]],
];

/**
 * Le message demande-t-il un document diffusable tel quel ?
 * @returns {string|null} catégorie (reglement, calendrier…)
 */
export function detectDocumentIntent(text) {
  const t = normalizeText(text);
  if (!t) return null;
  for (const [category, keywords] of CATEGORY_PATTERNS) {
    if (keywords.some((k) => t.includes(normalizeText(k)))) return category;
  }
  return null;
}

/**
 * Dernier document actif d'une catégorie, avec son fichier d'origine.
 * Le statut d'analyse est ignoré : même si le découpage a échoué, le PDF
 * importé reste parfaitement envoyable.
 */
export async function getOfficialDocument(schoolId, category) {
  if (!schoolId || !category) return null;
  const { data } = await supabaseAdmin
    .from('chatbot_documents')
    .select('id, title, category, academic_year, description, file_name, file_url')
    .eq('school_id', schoolId)
    .eq('category', category)
    .eq('is_active', true)
    .not('file_url', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1);
  return data?.[0] || null;
}

/** Nom de fichier lisible côté parent. */
function fileNameFor(doc) {
  const base = (doc.file_name || `${doc.title || 'Document'}.pdf`).trim();
  return base.toLowerCase().endsWith('.pdf') ? base : `${base}.pdf`;
}

function captionFor(doc, schoolName) {
  const { emoji, label } = DOCUMENT_LABELS[doc.category] || DOCUMENT_LABELS.autre;
  return [
    `${emoji} *${doc.title || label}*`,
    schoolName ? `🏫 ${schoolName}` : null,
    doc.academic_year ? `📅 Année ${doc.academic_year}` : null,
    doc.description || null,
    '',
    '_Document officiel de l\'école, tel qu\'il a été publié._',
  ].filter((l) => l !== null).join('\n');
}

/**
 * Envoie le document officiel d'une catégorie, dans sa version d'origine.
 *
 * @returns {Promise<boolean>} false si l'école n'a publié aucun document de
 *   cette catégorie (l'appelant enchaîne alors sur sa réponse habituelle).
 */
export async function sendOfficialDocument({ schoolId, phone, category, schoolName = null }) {
  const doc = await getOfficialDocument(schoolId, category);
  if (!doc) return false;

  const { label } = DOCUMENT_LABELS[doc.category] || DOCUMENT_LABELS.autre;
  await sendText(schoolId, phone, `📄 Je vous envoie *${doc.title || label}*…`);

  const res = await sendDocument(
    schoolId, phone, doc.file_url, fileNameFor(doc),
    captionFor(doc, schoolName), 'application/pdf',
  );

  if (!res?.success) {
    console.warn('[chatbot/documents] envoi impossible:', doc.title, res?.message || '');
    await sendText(
      schoolId, phone,
      '⚠️ Le document n\'a pas pu être envoyé. Réessayez dans quelques instants.',
    );
  }
  return true;
}

/**
 * Raccourci : détecte la catégorie demandée puis envoie le document.
 * @returns {Promise<boolean>} true si un document a été envoyé
 */
export async function tryOfficialDocument({ schoolId, phone, text, schoolName = null }) {
  const category = detectDocumentIntent(text);
  if (!category) return false;
  return sendOfficialDocument({ schoolId, phone, category, schoolName });
}
