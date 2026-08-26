/**
 * Crée (ou vérifie) les templates utilitaires WhatsApp chez Meta.
 *
 *   node scripts/createWhatsAppTemplates.js          → crée les manquants
 *   node scripts/createWhatsAppTemplates.js --list   → liste l'existant, ne crée rien
 *
 * Lit WA_TOKEN et WA_WABA_ID depuis le .env du backend.
 * Meta examine ensuite chaque template : compter de quelques minutes à 24 h.
 */

import 'dotenv/config';
import { TEMPLATES, definitionFor, templateLanguages } from '../src/services/whatsapp/templates.js';

const API = process.env.WA_API_VERSION || 'v21.0';
const TOKEN = process.env.WA_TOKEN;
const WABA = process.env.WA_WABA_ID;
const LIST_ONLY = process.argv.includes('--list');

if (!TOKEN || !WABA) {
  console.error('✗ WA_TOKEN et WA_WABA_ID doivent être définis dans le .env.');
  process.exit(1);
}

const graph = (path, init = {}) =>
  fetch(`https://graph.facebook.com/${API}/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });

/** Templates déjà présents sur le WABA, par nom. */
async function fetchExisting() {
  const res = await graph(`${WABA}/message_templates?limit=200&fields=name,status,category,language`);
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error?.message || 'Lecture des templates impossible');
  // Un meme NOM porte plusieurs langues chez Meta : la cle doit inclure la langue.
  return new Map((json.data || []).map((t) => [`${t.name}:${t.language}`, t]));
}

/** Traduit une définition du registre en payload attendu par l'API Meta. */
function toMetaPayload(def) {
  const components = [
    {
      type: 'BODY',
      text: def.body,
      ...(def.example ? { example: { body_text: [def.example] } } : {}),
    },
  ];
  if (def.buttons?.length) components.push({ type: 'BUTTONS', buttons: def.buttons });
  return { name: def.name, category: def.category, language: def.language, components };
}

const run = async () => {
  const existing = await fetchExisting();
  console.log(`WABA ${WABA} — ${existing.size} template(s) déjà présent(s).\n`);

  const envLines = [];
  const refuses = [];
  for (const [key, tpl] of Object.entries(TEMPLATES)) {
    let toutesOk = true;

    // Une entree Meta par LANGUE, sous le meme nom de template.
    for (const langue of templateLanguages(tpl)) {
      const def = definitionFor(tpl, langue);
      const etiquette = `${def.name} [${langue}]`.padEnd(34);
      const already = existing.get(`${def.name}:${langue}`);

      if (already) {
        console.log(`• ${etiquette} deja present — statut ${already.status}`);
        // Un template REJECTED ou PENDING ne doit JAMAIS finir dans le .env :
        // l'envoi echouerait chez Meta (erreur 132001) au lieu de retomber sur
        // le repli prevu par le code. La ligne suggeree serait un piege.
        if (already.status !== 'APPROVED') {
          toutesOk = false;
          if (already.status === 'REJECTED') refuses.push(`${def.name} [${langue}]`);
        }
        continue;
      }
      if (LIST_ONLY) {
        console.log(`• ${etiquette} ABSENT (cle « ${key} »)`);
        toutesOk = false;
        continue;
      }

      const res = await graph(`${WABA}/message_templates`, {
        method: 'POST',
        body: JSON.stringify(toMetaPayload(def)),
      });
      const json = await res.json();
      if (res.ok) {
        console.log(`✓ ${etiquette} cree — statut ${json.status || 'PENDING'}`);
      } else {
        console.error(`✗ ${etiquette} ECHEC — ${json?.error?.error_user_msg || json?.error?.message}`);
        toutesOk = false;
      }
    }

    if (toutesOk) envLines.push(`${tpl.env}=${tpl.definition.name}`);
  }

  if (envLines.length) {
    console.log('\n─── À mettre dans le .env — ces templates sont APPROVED ───');
    console.log(envLines.join('\n'));
    console.log('\nLes templates encore PENDING sont volontairement absents de cette');
    console.log('liste : tant qu\'ils ne sont pas approuvés, l\'envoi échoue chez Meta');
    console.log('(erreur 132001). Relancez ce script après approbation.');
  }

  if (refuses.length) {
    console.log('\n─── REFUSÉS par Meta — ne les déclarez PAS dans le .env ───');
    refuses.forEach((r) => console.log(`  ✗ ${r}`));
    console.log('\nUn nom refusé déclaré dans le .env fait échouer chaque envoi AVANT');
    console.log('le repli du code. Retirez la variable correspondante.');
  }
};

run().catch((e) => {
  console.error('Erreur:', e.message);
  process.exit(1);
});
