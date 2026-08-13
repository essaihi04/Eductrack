/**
 * Couche IA de l'import d'emploi du temps. Deux briques, deux rôles distincts :
 *
 *   OCR  = Mistral (MISTRAL_API_KEY, endpoint /v1/ocr, modèle mistral-ocr-latest)
 *          Sert uniquement à transformer une page IMAGE (photo, capture, PDF
 *          scanné) en texte. Mistral OCR restitue les tableaux en markdown, ce
 *          qui conserve la structure lignes/colonnes de la grille — bien plus
 *          fiable qu'un modèle de vision généraliste sur ce type de document.
 *
 *   LLM  = DeepSeek (DEEPSEEK_API_KEY, déjà utilisé partout dans le projet)
 *          Sert à structurer le texte — qu'il vienne de la couche texte du PDF
 *          ou de l'OCR — en JSON exploitable.
 *
 * Conséquence : il n'y a qu'UN seul chemin de structuration. L'OCR n'est qu'un
 * pré-traitement optionnel, déclenché seulement quand la page n'a pas de texte.
 */
import OpenAI from 'openai';

const MISTRAL_OCR_URL = 'https://api.mistral.ai/v1/ocr';
const OCR_TIMEOUT_MS = 90_000;

export const hasOcr = () => Boolean(process.env.MISTRAL_API_KEY);
export const hasTextAi = () => Boolean(process.env.DEEPSEEK_API_KEY);

// ── Utilitaires ───────────────────────────────────────────────────────────

/** Extrait un objet JSON d'une réponse LLM (tolère ```json … ``` et le bavardage). */
export function parseJsonLoose(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : s;
  try {
    return JSON.parse(body);
  } catch (_) {
    // Dernier recours : première accolade équilibrée
    const start = body.indexOf('{');
    const end = body.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try { return JSON.parse(body.slice(start, end + 1)); } catch (_) { /* abandon */ }
    }
    return null;
  }
}

let _deepseek = null;
function deepseek() {
  if (!process.env.DEEPSEEK_API_KEY) return null;
  if (!_deepseek) {
    _deepseek = new OpenAI({ baseURL: 'https://api.deepseek.com', apiKey: process.env.DEEPSEEK_API_KEY });
  }
  return _deepseek;
}

// ── OCR Mistral : image de page → texte (markdown) ────────────────────────

/**
 * @param {Buffer} buffer   image de la page (PNG/JPEG) ou PDF complet
 * @param {string} mimeType type MIME correspondant
 * @returns {Promise<string>} texte markdown de la page (tableaux préservés)
 */
export async function ocrToText(buffer, mimeType = 'image/png') {
  const key = process.env.MISTRAL_API_KEY;
  if (!key) throw new Error('NO_OCR_PROVIDER');

  const dataUri = `data:${mimeType};base64,${buffer.toString('base64')}`;
  // L'API distingue une image d'un document : un PDF doit passer par
  // document_url, sinon il est rejeté.
  const document = mimeType === 'application/pdf'
    ? { type: 'document_url', document_url: dataUri }
    : { type: 'image_url', image_url: dataUri };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), OCR_TIMEOUT_MS);

  try {
    const res = await fetch(MISTRAL_OCR_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: process.env.MISTRAL_OCR_MODEL || 'mistral-ocr-latest',
        document,
        include_image_base64: false,
      }),
      signal: ctrl.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`OCR Mistral HTTP ${res.status} — ${body.slice(0, 200)}`);
    }

    const data = await res.json();
    return (data?.pages || []).map((p) => p.markdown || '').join('\n\n').trim();
  } finally {
    clearTimeout(timer);
  }
}

// ── Structuration DeepSeek : texte → JSON ─────────────────────────────────

export async function structureFromText({ text, systemPrompt }) {
  const client = deepseek();
  if (!client) throw new Error('NO_TEXT_AI');

  const completion = await client.chat.completions.create({
    model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: String(text).slice(0, 24_000) },
    ],
  });
  return parseJsonLoose(completion.choices?.[0]?.message?.content);
}
