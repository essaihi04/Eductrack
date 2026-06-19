/**
 * Plan comptable (chart of accounts) — helpers de seed/sync.
 *
 * Le seed des écoles existantes est fait par la migration SQL
 * (MIGRATION_FINANCE_ACCOUNTING.sql). Ce service couvre :
 *  - le seed paresseux d'une NOUVELLE école (1re lecture du plan) ;
 *  - le « sync-defaults » (ajout des postes du catalogue qui manquent),
 *    sans jamais écraser les personnalisations (ON CONFLICT DO NOTHING).
 *
 * Implémenté en JS (pas de fonction PL/pgSQL) pour rester compatible avec
 * les éditeurs SQL qui découpent sur « ; ».
 */
import { supabaseAdmin } from '../config/supabase.js';

/**
 * Matérialise le catalogue par défaut dans finance_account pour une école.
 * Idempotent : n'ajoute que les default_key manquants.
 * @returns {Promise<number>} nombre de comptes ajoutés
 */
export async function seedDefaultChartOfAccounts(schoolId) {
  if (!schoolId) return 0;

  // 1. Catalogue global
  const { data: catalog, error: catErr } = await supabaseAdmin
    .from('finance_account_default')
    .select('*')
    .order('sort_order');
  if (catErr) throw catErr;
  if (!catalog || catalog.length === 0) return 0;

  // 2. Comptes déjà présents pour l'école (par default_key)
  const { data: existing } = await supabaseAdmin
    .from('finance_account')
    .select('id, default_key')
    .eq('school_id', schoolId);
  const idByKey = {};
  (existing || []).forEach((a) => { if (a.default_key) idByKey[a.default_key] = a.id; });

  const sections = catalog.filter((d) => d.node_type === 'section');
  const lines = catalog.filter((d) => d.node_type === 'line');

  let added = 0;

  // 3. Sections manquantes d'abord (parent_id NULL)
  const missingSections = sections.filter((d) => !idByKey[d.default_key]);
  if (missingSections.length) {
    const rows = missingSections.map((d) => ({
      school_id: schoolId,
      parent_id: null,
      kind: d.kind,
      node_type: 'section',
      name: d.name,
      default_key: d.default_key,
      revenue_stream: d.revenue_stream,
      cash_or_bank: d.cash_or_bank || 'mixed',
      sort_order: d.sort_order,
      is_system: true,
    }));
    const { data: ins } = await supabaseAdmin
      .from('finance_account')
      .upsert(rows, { onConflict: 'school_id,default_key', ignoreDuplicates: true })
      .select('id, default_key');
    (ins || []).forEach((a) => { idByKey[a.default_key] = a.id; added += 1; });
  }

  // Recharge les sections au cas où certaines existaient déjà sans être dans idByKey
  if (sections.some((d) => !idByKey[d.default_key])) {
    const { data: secNow } = await supabaseAdmin
      .from('finance_account')
      .select('id, default_key')
      .eq('school_id', schoolId)
      .eq('node_type', 'section');
    (secNow || []).forEach((a) => { if (a.default_key) idByKey[a.default_key] = a.id; });
  }

  // 4. Lignes manquantes (parent_id résolu via default_key)
  const missingLines = lines.filter((d) => !idByKey[d.default_key]);
  if (missingLines.length) {
    const rows = missingLines.map((d) => ({
      school_id: schoolId,
      parent_id: idByKey[d.parent_default_key] || null,
      kind: d.kind,
      node_type: 'line',
      name: d.name,
      default_key: d.default_key,
      revenue_stream: d.revenue_stream,
      cash_or_bank: d.cash_or_bank || 'mixed',
      sort_order: d.sort_order,
      is_system: true,
    }));
    const { data: ins } = await supabaseAdmin
      .from('finance_account')
      .upsert(rows, { onConflict: 'school_id,default_key', ignoreDuplicates: true })
      .select('id');
    added += (ins || []).length;
  }

  return added;
}

/** Garantit qu'une école a son plan comptable (seed si vide). */
export async function ensureChartSeeded(schoolId) {
  if (!schoolId) return;
  const { count } = await supabaseAdmin
    .from('finance_account')
    .select('id', { count: 'exact', head: true })
    .eq('school_id', schoolId);
  if (!count || count === 0) {
    await seedDefaultChartOfAccounts(schoolId);
  }
}
