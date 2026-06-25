/**
 * Planificateur de FACTURATION automatique.
 *
 * Chaque jour à 06:00 (Africa/Casablanca), génère les factures de l'année
 * scolaire EN COURS pour toutes les écoles ayant des plans actifs :
 *   - le mois courant (dès le 1er du mois) ;
 *   - rattrapage de tous les mois écoulés non encore facturés.
 *
 * S'appuie sur generateInvoicesForMonth(), qui est IDEMPOTENT (saute tout
 * élève déjà facturé pour la période) → relancer chaque jour ne crée jamais
 * de doublon. Le bouton « Générer » manuel reste disponible pour les cas
 * particuliers (classe précise, jour d'échéance custom…).
 */
import cron from 'node-cron';
import { supabaseAdmin } from '../config/supabase.js';
import { generateInvoicesForMonth } from '../routes/finance.routes.js';

const ACADEMIC_MONTH_ORDER = [9, 10, 11, 12, 1, 2, 3, 4, 5, 6, 7, 8];
const calendarYearFor = (startYear, m) => (m >= 9 ? startYear : startYear + 1);

// Mois/année courants dans le fuseau de l'école (évite les bugs de bord de mois).
function nowInCasablanca() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Casablanca', year: 'numeric', month: 'numeric',
  }).formatToParts(new Date());
  return {
    year: Number(parts.find((p) => p.type === 'year').value),
    month: Number(parts.find((p) => p.type === 'month').value),
  };
}

export async function runMonthlyInvoiceGeneration() {
  const { year: curYear, month: curMonth } = nowInCasablanca();
  // Année scolaire courante : Sept(startYear) → Août(startYear+1)
  const startYear = curMonth >= 9 ? curYear : curYear - 1;
  const curIdx = ACADEMIC_MONTH_ORDER.indexOf(curMonth); // mois écoulés = [0..curIdx]

  // Écoles avec plans actifs + format(s) d'année scolaire utilisés
  const { data: plans } = await supabaseAdmin
    .from('student_fee_plans')
    .select('school_id, academic_year')
    .eq('status', 'active');
  if (!plans?.length) return { schools: 0, created: 0 };

  const bySchool = {};
  for (const p of plans) {
    const y1 = parseInt(String(p.academic_year).split(/[-/]/)[0], 10);
    if (y1 !== startYear) continue; // uniquement l'année scolaire en cours
    (bySchool[p.school_id] = bySchool[p.school_id] || new Set()).add(p.academic_year);
  }

  let totalCreated = 0;
  const schoolIds = Object.keys(bySchool);
  for (const schoolId of schoolIds) {
    for (const ay of bySchool[schoolId]) {
      for (let i = 0; i <= curIdx; i++) {
        const m = ACADEMIC_MONTH_ORDER[i];
        const year = calendarYearFor(startYear, m);
        try {
          const r = await generateInvoicesForMonth({ schoolId, academic_year: ay, month: m, year, userId: null });
          totalCreated += r.created_count;
          if (r.created_count > 0) {
            console.log(`[invoiceScheduler] ${schoolId} ${ay} ${m}/${year}: +${r.created_count} facture(s)`);
          }
        } catch (e) {
          console.error(`[invoiceScheduler] ${schoolId} ${ay} ${m}/${year}:`, e.message);
        }
      }
    }
  }
  if (totalCreated > 0) console.log(`[invoiceScheduler] Terminé : ${totalCreated} facture(s) créée(s) sur ${schoolIds.length} école(s).`);
  return { schools: schoolIds.length, created: totalCreated };
}

let cronJob = null;

export function startInvoiceScheduler() {
  // Vérifie chaque minute ; n'agit qu'à 06:00 (Casablanca) → une passe/jour.
  cronJob = cron.schedule('* * * * *', async () => {
    try {
      const t = new Date().toLocaleTimeString('en-GB', {
        hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Africa/Casablanca',
      });
      if (t !== '06:00') return;
      console.log('[invoiceScheduler] Génération mensuelle automatique (06:00)…');
      await runMonthlyInvoiceGeneration();
    } catch (e) {
      console.error('[invoiceScheduler] cron error:', e.message);
    }
  });
  console.log('[invoiceScheduler] Planificateur de facturation démarré (quotidien 06:00, idempotent).');
}

export function stopInvoiceScheduler() {
  if (cronJob) { cronJob.stop(); cronJob = null; }
}
