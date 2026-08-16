// File d'attente de travaux, persistée dans Postgres (table `jobs`).
//
// Pourquoi pas Redis : le worker doit rester dans le process web, parce que les
// sockets Baileys y vivent en mémoire et ne sont pas partageables entre process.
// Un worker séparé ne pourrait pas envoyer de WhatsApp. Redis apporterait la
// persistance mais pas le découplage — Postgres, déjà là, suffit.
//
// Ce que ça apporte par rapport au fire-and-forget d'avant : un job interrompu
// (redémarrage PM2, crash, déploiement) REPREND tout seul au lieu d'être perdu
// silencieusement.
//
// Ce que ça n'apporte pas : du parallélisme réel. Un seul process, donc un job
// gourmand en CPU (PDFKit, sharp) ralentit les requêtes HTTP pendant qu'il
// tourne. Pour les envois WhatsApp et les appels IA — de l'attente réseau, pas
// du CPU — c'est sans conséquence, et c'est l'essentiel des traitements lourds.
//
// Migration : ADD_JOBS_QUEUE.sql

import { supabaseAdmin } from '../../config/supabase.js';

const POLL_INTERVAL_MS = 5_000;
const LEASE_SECONDS = 300;
// Un seul process : on plafonne bas pour ne pas noyer le serveur web. Les jobs
// d'une même lock_key sont de toute façon sérialisés entre eux.
const MAX_CONCURRENT = 3;

const handlers = new Map();
// jobId -> lock_key des jobs en cours dans CE process.
const active = new Map();

let timer = null;
let ticking = false;
let queueUnavailable = false;

// --- Enregistrement des types de jobs -------------------------------------

export function registerJobHandler(type, fn) {
  handlers.set(type, fn);
}

// --- Mise en file ----------------------------------------------------------

// Lève si la table n'existe pas (migration non exécutée) : l'appelant doit
// décider quoi faire — en général, exécuter le travail en direct comme avant.
export async function enqueueJob({
  type,
  payload = {},
  schoolId = null,
  createdBy = null,
  lockKey,
  maxAttempts = 3,
  runAfter = null,
}) {
  if (!type) throw new Error('enqueueJob: type requis');

  const { data, error } = await supabaseAdmin
    .from('jobs')
    .insert({
      type,
      payload,
      school_id: schoolId,
      created_by: createdBy,
      // Par défaut on sérialise par type + école.
      lock_key: lockKey || `${type}:${schoolId || ''}`,
      max_attempts: maxAttempts,
      ...(runAfter ? { run_after: runAfter } : {}),
    })
    .select('id')
    .single();

  if (error) throw error;

  // Ne pas attendre la prochaine tranche de 5 s quand un admin vient de cliquer.
  wakeJobRunner();
  return data.id;
}

// --- Utilitaires offerts aux handlers --------------------------------------

// Prolonge le bail. À appeler régulièrement par les jobs longs, sinon le job
// est considéré orphelin et repris en parallèle de lui-même.
export async function touchJob(jobId, progress = null) {
  const patch = {
    lease_until: new Date(Date.now() + LEASE_SECONDS * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (progress) patch.progress = progress;
  await supabaseAdmin.from('jobs').update(patch).eq('id', jobId);
}

// --- Boucle d'exécution ----------------------------------------------------

// Les jobs 'running' dont le bail a expiré appartenaient à un process qui n'est
// plus là : on les remet en attente. `attempts` a déjà été consommé à la prise,
// donc un job qui fait planter le process ne peut pas boucler indéfiniment.
async function recoverStaleJobs() {
  const { data, error } = await supabaseAdmin
    .from('jobs')
    .update({
      status: 'pending',
      lease_until: null,
      last_error: 'Interrompu (process arrêté) — repris automatiquement',
      updated_at: new Date().toISOString(),
    })
    .eq('status', 'running')
    .lt('lease_until', new Date().toISOString())
    .select('id, type');

  if (error) return;
  if (data?.length) {
    console.log(`[jobs] ${data.length} job(s) orphelin(s) repris : ${data.map((j) => j.type).join(', ')}`);
  }
}

async function claimJob() {
  const excludeKeys = [...new Set(active.values())];

  const { data, error } = await supabaseAdmin.rpc('claim_job', {
    p_exclude_keys: excludeKeys,
    p_lease_seconds: LEASE_SECONDS,
  });

  if (error) {
    // Migration non exécutée : on se tait après le premier avertissement, sinon
    // le log se remplit toutes les 5 secondes.
    if (!queueUnavailable) {
      queueUnavailable = true;
      console.warn(`[jobs] File indisponible (${error.message}) — exécutez ADD_JOBS_QUEUE.sql dans Supabase.`);
    }
    return null;
  }

  queueUnavailable = false;
  return Array.isArray(data) ? data[0] || null : data || null;
}

async function finishJob(job, error) {
  if (!error) {
    await supabaseAdmin
      .from('jobs')
      .update({
        status: 'done',
        lease_until: null,
        finished_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', job.id);
    return;
  }

  const message = String(error.message || error).slice(0, 2000);
  const exhausted = job.attempts >= job.max_attempts;

  await supabaseAdmin
    .from('jobs')
    .update({
      status: exhausted ? 'failed' : 'pending',
      lease_until: null,
      last_error: message,
      // Backoff linéaire : 1 min, 2 min, 3 min…
      ...(exhausted
        ? { finished_at: new Date().toISOString() }
        : { run_after: new Date(Date.now() + job.attempts * 60_000).toISOString() }),
      updated_at: new Date().toISOString(),
    })
    .eq('id', job.id);

  console.error(
    `[jobs] ${job.type} ${job.id} en échec (essai ${job.attempts}/${job.max_attempts})` +
      `${exhausted ? ' — abandonné' : ' — nouvelle tentative programmée'} : ${message}`
  );
}

async function runJob(job) {
  active.set(job.id, job.lock_key);
  try {
    const handler = handlers.get(job.type);
    if (!handler) throw new Error(`Aucun handler enregistré pour le type « ${job.type} »`);

    await handler(job.payload || {}, {
      jobId: job.id,
      attempt: job.attempts,
      touch: (progress) => touchJob(job.id, progress),
    });

    await finishJob(job, null);
  } catch (err) {
    await finishJob(job, err).catch((e) =>
      console.error('[jobs] impossible d\'enregistrer l\'échec :', e.message)
    );
  } finally {
    active.delete(job.id);
  }
}

async function tick() {
  if (ticking) return;
  ticking = true;
  try {
    await recoverStaleJobs();

    while (active.size < MAX_CONCURRENT) {
      const job = await claimJob();
      if (!job) break;
      // Détaché volontairement : le tick ne doit pas attendre la fin d'un job
      // qui peut durer une heure.
      runJob(job);
    }
  } catch (e) {
    console.error('[jobs] erreur de boucle :', e.message);
  } finally {
    ticking = false;
  }
}

// Déclenche un tour de boucle immédiatement (après une mise en file).
export function wakeJobRunner() {
  tick().catch(() => {});
}

export function startJobRunner() {
  if (timer) return;
  timer = setInterval(() => { tick().catch(() => {}); }, POLL_INTERVAL_MS);
  // Au démarrage : reprend ce qui a été interrompu par l'arrêt précédent.
  tick().catch(() => {});
  console.log(`[jobs] Worker démarré (${MAX_CONCURRENT} jobs max en parallèle, tick ${POLL_INTERVAL_MS / 1000}s).`);
}

export function stopJobRunner() {
  if (timer) { clearInterval(timer); timer = null; }
}
