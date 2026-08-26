/**
 * Pages légales publiques (HTML) pour la validation de l'app Meta et l'usage
 * général : politique de confidentialité, conditions de service, et instructions
 * de suppression des données.
 *
 * Monté sous /api/legal (le préfixe /api est routé vers le backend par nginx).
 *   - https://etrack.ma/api/legal/privacy
 *   - https://etrack.ma/api/legal/terms
 *   - https://etrack.ma/api/legal/data-deletion
 *
 * ⚠️ Contenu = modèle raisonnable à relire/adapter avec tes mentions légales
 * réelles (raison sociale, adresse, etc.).
 */

import express from 'express';

const router = express.Router();

const CONTACT_EMAIL = process.env.LEGAL_CONTACT_EMAIL || 'contact@etrack.ma';
const APP_NAME = 'Bousole';
const UPDATED = '22 août 2026';

// Éditeur du service. La raison sociale EXACTE du Registre du Commerce doit
// apparaître sur le site : Meta refuse la vérification d'entreprise s'il ne
// retrouve pas le nom légal déclaré sur le domaine du site web.
const LEGAL_ENTITY = {
  name: 'BOUSOLE TECHNOLOGIE',
  form: 'Société à responsabilité limitée à associé unique (SARL AU)',
  capital: '100 000,00 MAD',
  address: '23 Bd Oukba Ibnou Nafii, Hay Mohammadi, Casablanca 20560, Maroc',
  rc: 'RC Casablanca n° 744197',
  ice: 'ICE 004005692000055',
  phone: '+212 641 998 700',
};

const page = (title, bodyHtml) => `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} — ${APP_NAME}</title>
<style>
  body { font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; line-height: 1.6;
         max-width: 760px; margin: 40px auto; padding: 0 20px; color: #1f2937; }
  h1 { color: #111827; } h2 { color: #374151; margin-top: 2rem; }
  a { color: #2563eb; } .muted { color: #6b7280; font-size: .9rem; }
  footer { margin-top: 3rem; border-top: 1px solid #e5e7eb; padding-top: 1rem; }
</style>
</head>
<body>
${bodyHtml}
<footer class="muted">
  <strong>${LEGAL_ENTITY.name}</strong> — ${LEGAL_ENTITY.form}, capital ${LEGAL_ENTITY.capital}.<br>
  Siège social : ${LEGAL_ENTITY.address}<br>
  ${LEGAL_ENTITY.rc} — ${LEGAL_ENTITY.ice}<br>
  ${APP_NAME} est un service édité par ${LEGAL_ENTITY.name}.<br>
  Contact : <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a> — Tél. ${LEGAL_ENTITY.phone}<br>
  Dernière mise à jour : ${UPDATED}
</footer>
</body>
</html>`;

router.get('/privacy', (_req, res) => {
  res.type('html').send(page('Politique de confidentialité', `
<h1>Politique de confidentialité</h1>
<p>${APP_NAME} est une plateforme de suivi scolaire destinée aux établissements,
à leur personnel et aux parents d'élèves. Cette politique décrit les données que
nous traitons et la manière dont elles sont protégées.</p>

<h2>Données collectées</h2>
<ul>
  <li>Informations de compte : nom, rôle, adresse e-mail, numéro de téléphone.</li>
  <li>Données scolaires des élèves : notes, présence, devoirs, vie scolaire,
      gérées pour le compte de l'établissement.</li>
  <li>Communications WhatsApp échangées entre l'établissement et les parents
      (messages, demandes d'information, pièces jointes envoyées par le parent).</li>
</ul>

<h2>Finalités</h2>
<ul>
  <li>Fournir le service de suivi scolaire et les notifications associées.</li>
  <li>Permettre la communication parent–établissement via WhatsApp.</li>
  <li>Générer les rapports et bulletins demandés par l'établissement.</li>
</ul>

<h2>Partage des données</h2>
<p>Nous ne vendons pas vos données. Elles ne sont accessibles qu'à votre
établissement et aux prestataires techniques strictement nécessaires au
fonctionnement du service (hébergement, messagerie WhatsApp de Meta).</p>

<h2>Conservation</h2>
<p>Les données sont conservées le temps de la relation avec l'établissement,
puis supprimées ou anonymisées conformément à ses obligations légales.</p>

<h2>Vos droits</h2>
<p>Vous pouvez demander l'accès, la rectification ou la suppression de vos
données en écrivant à <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>.
Voir aussi nos <a href="/api/legal/data-deletion">instructions de suppression des données</a>.</p>
`));
});

router.get('/terms', (_req, res) => {
  res.type('html').send(page('Conditions de service', `
<h1>Conditions de service</h1>
<p>En utilisant ${APP_NAME}, vous acceptez les présentes conditions.</p>
<h2>Usage du service</h2>
<p>${APP_NAME} est fourni aux établissements scolaires et à leurs utilisateurs
autorisés (personnel, parents). Vous vous engagez à un usage licite et conforme
à la finalité éducative du service.</p>
<h2>Messagerie WhatsApp</h2>
<p>Les communications via WhatsApp sont soumises aux conditions de Meta. Les
parents peuvent à tout moment cesser de recevoir les messages.</p>
<h2>Responsabilité</h2>
<p>Le service est fourni « en l'état ». L'établissement reste responsable de
l'exactitude des données scolaires qu'il saisit.</p>
<h2>Contact</h2>
<p>Pour toute question : <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>.</p>
`));
});

router.get('/data-deletion', (_req, res) => {
  res.type('html').send(page('Suppression des données', `
<h1>Suppression des données</h1>
<p>Pour demander la suppression de vos données personnelles traitées par
${APP_NAME} :</p>
<ol>
  <li>Envoyez un e-mail à <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>
      avec pour objet « Suppression de mes données ».</li>
  <li>Indiquez le nom, le numéro de téléphone et, le cas échéant, l'établissement
      concerné.</li>
  <li>Nous traitons la demande sous 30 jours et confirmons par e-mail.</li>
</ol>
<p>Remarque : certaines données scolaires appartiennent à l'établissement ; la
suppression peut nécessiter sa validation pour respecter ses obligations légales.</p>
`));
});

export default router;
