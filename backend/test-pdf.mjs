import { supabaseAdmin } from './src/config/supabase.js';
import { generateInvoicePdfById } from './src/services/whatsapp/chatbot/invoicePdf.js';
import fs from 'fs';

// Trouver une facture pour un élève au nom arabe
const { data: invs } = await supabaseAdmin
  .from('invoices')
  .select('id, invoice_number, student:profiles!invoices_student_id_fkey(first_name, last_name)')
  .limit(20);

const arabicInv = invs?.find(i => /[\u0600-\u06FF]/.test(i.student?.first_name + i.student?.last_name));
const target = arabicInv || invs?.[0];
console.log('Test invoice:', target);
if (!target) process.exit(0);

const result = await generateInvoicePdfById(target.id);
console.log('Generated PDF size:', result?.buffer?.length, 'fileName:', result?.fileName);
fs.writeFileSync('test-output.pdf', result.buffer);
console.log('Saved to test-output.pdf');
process.exit(0);
