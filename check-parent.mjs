import { supabaseAdmin } from './src/config/supabase.js';

// Élève "Hajar El Fassi"
const { data: students } = await supabaseAdmin
  .from('profiles')
  .select('id, first_name, last_name, class_id, school_id')
  .eq('role', 'student')
  .ilike('last_name', '%El Fassi%');

console.log('=== ELEVES El Fassi ===');
for (const s of students || []) {
  console.log(JSON.stringify(s));
  if (!s.class_id) { console.log('  -> PAS DE CLASSE'); continue; }

  const { data: hw } = await supabaseAdmin
    .from('homework')
    .select('id, title, target_type, due_date, class_id')
    .eq('class_id', s.class_id);
  console.log(`  DEVOIRS pour la classe: ${hw?.length || 0}`);
  for (const h of hw || []) console.log('   - ' + JSON.stringify(h));

  const { data: tt } = await supabaseAdmin
    .from('class_timetable')
    .select('id, day_of_week, start_time')
    .eq('class_id', s.class_id);
  console.log(`  CRENEAUX emploi du temps: ${tt?.length || 0}`);

  const { data: inv } = await supabaseAdmin
    .from('invoices')
    .select('id, invoice_number, status, total, amount_paid')
    .eq('student_id', s.id);
  console.log(`  FACTURES: ${inv?.length || 0}`);
  for (const i of inv || []) console.log('   - ' + JSON.stringify(i));
}
process.exit(0);
