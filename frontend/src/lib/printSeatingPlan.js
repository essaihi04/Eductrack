// Impression du plan de classe : la salle vue de dessus (tableau, bureau,
// rangées de tables) avec la PHOTO de chaque élève à sa place exacte.
// Sert de trombinoscope de placement pour le professeur / les surveillants.
// Deux entrées : printSeatingPlan (une classe, depuis le plan de classe) et
// printClassSheets (plusieurs classes, depuis la Répartition — une page par
// classe, trombinoscope simple pour celles sans plan enregistré).
//
// Les photos sont d'abord converties en dataURL (canvas) pour qu'elles soient
// certaines d'être rendues dans la fenêtre d'impression ; si le CORS l'empêche,
// on retombe sur l'URL brute simplement préchargée (donc en cache).
// Élève sans photo → avatar illustré (garçon / fille / neutre), comme à l'écran.
import { printHtmlDocument } from './download';
import { resolveLogoUrl } from './schoolLogo';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fullName = (s) => `${s?.first_name || ''} ${s?.last_name || ''}`.trim();

// ── Photos ───────────────────────────────────────────────────────────────────
const _photoCache = new Map(); // src -> dataURL | src | null

function loadImage(src, crossOrigin) {
  return new Promise((resolve) => {
    const img = new Image();
    if (crossOrigin) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

// Retourne un src utilisable dans la fenêtre d'impression (dataURL de préférence).
async function printableSrc(src) {
  if (!src) return null;
  if (_photoCache.has(src)) return _photoCache.get(src);

  let out = null;
  const img = await loadImage(src, true);
  if (img) {
    try {
      // Réduction à 220px de large : un plan de 40 élèves reste léger.
      const scale = Math.min(1, 220 / (img.naturalWidth || 220));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round((img.naturalWidth || 220) * scale));
      canvas.height = Math.max(1, Math.round((img.naturalHeight || 220) * scale));
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      out = canvas.toDataURL('image/jpeg', 0.82);
    } catch {
      out = null; // image « tainted » (pas d'en-tête CORS)
    }
  }
  if (!out) {
    // Repli : on précharge sans crossOrigin → l'image sera servie par le cache.
    const plain = await loadImage(src, false);
    out = plain ? src : null;
  }
  _photoCache.set(src, out);
  return out;
}

// ── Avatar illustré (même repli qu'à l'écran, en SVG inline) ─────────────────
function avatarSvg(gender) {
  const g = String(gender || '').toUpperCase();
  if (g === 'M') {
    return `<svg viewBox="0 0 100 100" class="ph">
      <rect width="100" height="100" fill="#a5dbf7"/>
      <path d="M18 100c0-19 14-30 32-30s32 11 32 30z" fill="#2563eb"/>
      <circle cx="50" cy="44" r="20" fill="#f4c9a4"/>
      <path d="M30 42c0-14 9-22 20-22s20 8 20 22c0-6-4-9-8-9-2-3-6-4-12-4s-12 3-12 9c-4 0-8 2-8 4z" fill="#4b3621"/>
    </svg>`;
  }
  if (g === 'F') {
    return `<svg viewBox="0 0 100 100" class="ph">
      <rect width="100" height="100" fill="#f9bcd8"/>
      <path d="M18 100c0-19 14-30 32-30s32 11 32 30z" fill="#db2777"/>
      <path d="M26 50c0-22 8-32 24-32s24 10 24 32c0 8-3 16-3 16l-6-20c-2 6-26 6-30 0l-6 20s-3-8-3-16z" fill="#5b3a1a"/>
      <circle cx="50" cy="46" r="19" fill="#f4c9a4"/>
      <path d="M31 48c0-16 7-26 19-26s19 10 19 26c0-10-6-14-19-14s-19 4-19 14z" fill="#5b3a1a"/>
    </svg>`;
  }
  return `<svg viewBox="0 0 100 100" class="ph">
    <rect width="100" height="100" fill="#dbe2ea"/>
    <path d="M20 100c0-18 13-29 30-29s30 11 30 29z" fill="#94a3b8"/>
    <circle cx="50" cy="42" r="19" fill="#cbd5e1"/>
  </svg>`;
}

const STYLES = `
  *{box-sizing:border-box}
  body{font-family:Arial,Helvetica,sans-serif;margin:0;color:#1f2937;
    -webkit-print-color-adjust:exact;print-color-adjust:exact}
  .sheet{padding:10px 14px}
  .head{display:flex;align-items:center;gap:10px;border-bottom:2px solid #4f46e5;padding-bottom:6px;margin-bottom:10px}
  .head img.logo{width:44px;height:44px;object-fit:contain}
  .head h1{margin:0;font-size:17px;color:#4f46e5}
  .head p{margin:1px 0 0;font-size:11px;color:#6b7280}
  .head .right{margin-left:auto;text-align:right;font-size:11px;color:#6b7280}
  .board{max-width:640px;margin:0 auto 14px}
  .board .tableau{height:24px;border-radius:6px;background:#1e293b;color:#e2e8f0;font-size:11px;
    display:flex;align-items:center;justify-content:center;letter-spacing:1px}
  .board .desk{width:110px;height:24px;margin:6px 24px 0 auto;border-radius:6px;background:#c7d2fe;
    border:1px solid #a5b4fc;color:#3730a3;font-size:10px;display:flex;align-items:center;justify-content:center}
  .rows{display:flex;flex-direction:column;align-items:center;gap:10px}
  .row{display:flex;align-items:stretch;gap:10px;page-break-inside:avoid;break-inside:avoid}
  .row .rlabel{width:16px;font-size:9px;color:#9ca3af;align-self:center;text-align:right}
  .table{border:1px solid #d97706;background:#fef3c7;border-radius:8px;padding:4px;display:flex;gap:4px}
  .seat{width:74px;border-radius:6px;padding:3px 2px;text-align:center}
  .seat.taken{background:#fff;border:1px solid #fcd34d}
  .seat.free{border:1px dashed #fcd34d;background:#fffbeb;display:flex;align-items:center;justify-content:center}
  .seat .ph,.seat img.ph{width:42px;height:42px;border-radius:50%;object-fit:cover;background:#f1f5f9;display:block;margin:0 auto}
  .seat .nm{font-size:8.5px;line-height:1.15;margin-top:2px;word-break:break-word}
  .seat .nm b{display:block;font-weight:700}
  .seat.free span{font-size:8px;color:#d1a35a}
  .rest{margin-top:14px;page-break-inside:avoid;break-inside:avoid}
  .rest h3{font-size:11px;margin:0 0 4px;color:#b45309}
  .rest .list{display:flex;flex-wrap:wrap;gap:6px}
  .rest .it{display:flex;align-items:center;gap:4px;border:1px solid #e5e7eb;border-radius:6px;padding:2px 5px;font-size:9px}
  .rest .it .ph,.rest .it img.ph{width:22px;height:22px;border-radius:50%;object-fit:cover;display:block}
  .grid{display:flex;flex-wrap:wrap;gap:6px;justify-content:center}
  .grid .seat{border:1px solid #e5e7eb}
  .empty{text-align:center;font-size:11px;color:#9ca3af;padding:24px 0}
  .foot{margin-top:12px;border-top:1px solid #e5e7eb;padding-top:5px;font-size:8.5px;color:#9ca3af;text-align:center}
  .pagebreak{page-break-after:always;break-after:page;height:0}
  @page{size:A4 landscape;margin:7mm}
`;

// Charge les photos de tous les élèves concernés (en parallèle) et renvoie
// une fonction qui produit le <img> (ou l'avatar illustré) d'un élève.
async function buildPhotoRenderer(students, resolveSrc) {
  const photos = new Map();
  await Promise.all(students.map(async (s) => {
    if (photos.has(s.id)) return;
    const raw = resolveSrc ? resolveSrc(s.avatar_url) : s.avatar_url;
    const src = raw ? await printableSrc(raw) : null;
    if (src) photos.set(s.id, src);
  }));
  return (s) => (photos.has(s.id)
    ? `<img class="ph" src="${esc(photos.get(s.id))}" alt=""/>`
    : avatarSvg(s.gender));
}

// ── Une feuille = une classe ────────────────────────────────────────────────
// Avec un plan de placement : la salle vue de dessus, chaque élève à sa place.
// Sans plan enregistré : trombinoscope simple (grille de photos + noms).
function sheetHtml({ cls, config, assignments, students }, { photoHtml, school, printedAt }) {
  const byId = {};
  students.forEach((s) => { byId[s.id] = s; });
  const hasPlan = !!config && Object.keys(assignments || {}).length > 0;
  // Le plan enregistré peut être en retard sur la répartition (élève transféré
  // depuis) : on ne garde que les élèves encore dans la classe, une place max.
  const seatOf = {};
  const placedIds = new Set();
  if (hasPlan) {
    for (const [k, id] of Object.entries(assignments)) {
      if (!byId[id] || placedIds.has(id)) continue;
      seatOf[k] = id;
      placedIds.add(id);
    }
  }
  const unplaced = students.filter((s) => !placedIds.has(s.id));
  const logo = resolveLogoUrl(school);

  const seatHtml = (key) => {
    const s = byId[seatOf[key]];
    if (!s) return '<div class="seat free"><span>libre</span></div>';
    return `<div class="seat taken">
      ${photoHtml(s)}
      <div class="nm"><b>${esc(s.first_name || '')}</b>${esc(s.last_name || '')}</div>
    </div>`;
  };

  const planHtml = !hasPlan ? '' : `
    <div class="board">
      <div class="tableau">TABLEAU</div>
      <div class="desk">Bureau</div>
    </div>
    <div class="rows">
      ${Array.from({ length: config.rows }, (_, r) => `
        <div class="row">
          <div class="rlabel">R${r + 1}</div>
          ${Array.from({ length: config.tablesPerRow }, (_, t) => `
            <div class="table">
              ${Array.from({ length: config.seatsPerTable }, (_, s) => seatHtml(`${r}-${t}-${s}`)).join('')}
            </div>`).join('')}
        </div>`).join('')}
    </div>`;

  // Élèves hors plan : « non placés » s'il y a un plan, sinon toute la classe.
  const restHtml = unplaced.length === 0 ? '' : (hasPlan ? `
    <div class="rest">
      <h3>Élèves non placés (${unplaced.length})</h3>
      <div class="list">
        ${unplaced.map((s) => `<div class="it">${photoHtml(s)}<span>${esc(fullName(s))}</span></div>`).join('')}
      </div>
    </div>` : `
    <div class="grid">
      ${unplaced.map((s) => `<div class="seat taken">
        ${photoHtml(s)}
        <div class="nm"><b>${esc(s.first_name || '')}</b>${esc(s.last_name || '')}</div>
      </div>`).join('')}
    </div>`);

  const empty = students.length === 0 ? '<p class="empty">Aucun élève dans cette classe.</p>' : '';

  return `<div class="sheet">
    <div class="head">
      ${logo ? `<img class="logo" src="${esc(logo)}" alt=""/>` : ''}
      <div>
        <h1>${hasPlan ? 'Plan de classe' : 'Liste de la classe'} — ${esc(cls?.name || '')}</h1>
        <p>${esc(school?.name || '')}${cls?.level ? ` · ${esc(cls.level)}` : ''}</p>
      </div>
      <div class="right">
        ${hasPlan
    ? `${placedIds.size}/${students.length} élève${students.length > 1 ? 's' : ''} placé${placedIds.size > 1 ? 's' : ''}`
    : `${students.length} élève${students.length > 1 ? 's' : ''}`}<br/>
        Imprimé le ${esc(printedAt)}
      </div>
    </div>
    ${planHtml}
    ${restHtml}
    ${empty}
    <div class="foot">${hasPlan
    ? 'Vue de la salle depuis le fond de la classe — le tableau est en haut.'
    : 'Aucun plan de placement enregistré pour cette classe — ouvrez « Plan de classe » pour placer les élèves.'}</div>
  </div>`;
}

// Assemble les feuilles (une page par classe) et lance l'impression.
async function printSheets(sheets, { school, resolveSrc, title }) {
  const allStudents = sheets.flatMap((s) => s.students || []);
  const photoHtml = await buildPhotoRenderer(allStudents, resolveSrc);
  const printedAt = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const body = sheets
    .map((s) => sheetHtml({ ...s, students: s.students || [] }, { photoHtml, school, printedAt }))
    .join('<div class="pagebreak"></div>');

  const html = `<html><head><meta charset="utf-8"/><title>${esc(title)}</title>
    <style>${STYLES}</style></head><body>${body}</body></html>`;
  return printHtmlDocument(html, { title });
}

/**
 * Ouvre la fenêtre d'impression du plan d'UNE classe (depuis le plan de classe).
 * @param {object}   p
 * @param {object}   p.cls          classe { id, name, level, filiere }
 * @param {object}   p.config       { rows, tablesPerRow, seatsPerTable }
 * @param {object}   p.assignments  { "r-t-s": studentId }
 * @param {object[]} p.students     élèves de la classe
 * @param {object}   [p.school]     école (nom, logo) pour l'en-tête
 * @param {Function} [p.resolveSrc] résolution des avatar_url en URL absolue
 */
export async function printSeatingPlan({ cls, config, assignments, students, school, resolveSrc }) {
  return printSheets([{ cls, config, assignments, students }], {
    school,
    resolveSrc,
    title: `Plan de classe — ${cls?.name || ''}`.trim(),
  });
}

/**
 * Imprime PLUSIEURS classes en un seul document (une page par classe).
 * Chaque classe est rendue avec son plan de placement s'il existe, sinon en
 * trombinoscope. À utiliser depuis l'onglet Répartition.
 * @param {object}   p
 * @param {object[]} p.sheets  [{ cls, config, assignments, students }]
 * @param {object}   [p.school]
 * @param {Function} [p.resolveSrc]
 * @param {string}   [p.label]  ex. « 3AC » pour le titre du document
 */
export async function printClassSheets({ sheets, school, resolveSrc, label }) {
  const title = sheets.length === 1
    ? `Plan de classe — ${sheets[0].cls?.name || ''}`.trim()
    : `Plans de classe${label ? ` — ${label}` : ''} (${sheets.length} classes)`;
  return printSheets(sheets, { school, resolveSrc, title });
}
