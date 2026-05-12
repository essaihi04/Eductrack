import { useState, useEffect } from 'react';
import { AlertCircle, MessageSquare, RefreshCw, CheckSquare, Square } from 'lucide-react';
import { financeApi, formatMAD, formatDate } from '../../lib/financeApi';
import { supabase } from '../../lib/supabase';

export default function OverduePage() {
  const [overdue, setOverdue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(new Set());
  const [sendingReminders, setSendingReminders] = useState(false);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      await financeApi.markOverdue();
      const data = await financeApi.getOverdue();
      setOverdue(data.overdue || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const toggle = (id) => {
    const s = new Set(selected);
    if (s.has(id)) s.delete(id); else s.add(id);
    setSelected(s);
  };

  const selectAll = () => {
    if (selected.size === overdue.length) setSelected(new Set());
    else setSelected(new Set(overdue.map(o => o.id)));
  };

  const sendReminders = async () => {
    if (selected.size === 0) return;
    const selectedInvoices = overdue.filter(o => selected.has(o.id));
    const studentIds = [...new Set(selectedInvoices.map(i => i.student_id))];

    if (!confirm(`Envoyer ${studentIds.length} relance(s) WhatsApp ?`)) return;

    setSendingReminders(true);
    try {
      // Fetch parent phones for these students
      const { data: { session } } = await supabase.auth.getSession();
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';

      // Build messages per student
      let sentCount = 0;
      for (const studentId of studentIds) {
        const invs = selectedInvoices.filter(i => i.student_id === studentId);
        const student = invs[0]?.student;
        const totalDue = invs.reduce((s, i) => s + Number(i.remaining), 0);
        const message = `Bonjour,\n\nVous avez ${invs.length} facture(s) en retard pour ${student?.first_name} ${student?.last_name}:\n\n${invs.map(i => `• ${i.invoice_number} (${i.period_label || formatDate(i.due_date)}): ${formatMAD(i.remaining)} — ${i.days_overdue}j de retard`).join('\n')}\n\nTotal dû: ${formatMAD(totalDue)}\n\nMerci de régulariser dès que possible.`;

        // Récupérer le numéro WhatsApp du parent via API existante
        try {
          const recRes = await fetch(`${apiUrl}/api/admin/whatsapp/recipients-list?class_ids=${student?.class_id}`, {
            headers: { Authorization: `Bearer ${session?.access_token}` }
          });
          const recData = await recRes.json();
          const parentOfStudent = (recData.parents || []).find(p => p.children?.some(c => c.id === studentId));
          if (!parentOfStudent?.phone_whatsapp) continue;

          // Envoyer via WhatsApp send
          await fetch(`${apiUrl}/api/admin/whatsapp/send`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message,
              type: 'text',
              filter: { parent_phones: [parentOfStudent.phone_whatsapp] }
            })
          });
          sentCount++;
        } catch (e) { console.error('Erreur relance', studentId, e); }
      }

      alert(`${sentCount} relance(s) envoyée(s)`);
      setSelected(new Set());
    } catch (e) {
      alert('Erreur: ' + e.message);
    } finally {
      setSendingReminders(false);
    }
  };

  const totalOverdue = overdue.reduce((s, o) => s + Number(o.remaining), 0);
  const selectedTotal = overdue.filter(o => selected.has(o.id)).reduce((s, o) => s + Number(o.remaining), 0);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <AlertCircle className="w-6 h-6 text-red-600" /> Factures en retard
          </h1>
          <p className="text-sm text-gray-500">{overdue.length} facture(s) · {formatMAD(totalOverdue)} à recouvrer</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          {selected.size > 0 && (
            <button onClick={sendReminders} disabled={sendingReminders}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">
              <MessageSquare className="w-4 h-4" /> Relancer {selected.size} ({formatMAD(selectedTotal)})
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-xs uppercase">
              <tr>
                <th className="px-4 py-3 w-10">
                  <button onClick={selectAll}>
                    {selected.size === overdue.length && overdue.length > 0
                      ? <CheckSquare className="w-4 h-4 text-green-600" />
                      : <Square className="w-4 h-4 text-gray-400" />}
                  </button>
                </th>
                <th className="px-4 py-3 text-left">N°</th>
                <th className="px-4 py-3 text-left">Élève</th>
                <th className="px-4 py-3 text-left">Classe</th>
                <th className="px-4 py-3 text-left">Période</th>
                <th className="px-4 py-3 text-left">Échéance</th>
                <th className="px-4 py-3 text-center">Retard</th>
                <th className="px-4 py-3 text-right">Dû</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {overdue.length === 0 && (
                <tr><td colSpan="8" className="px-4 py-12 text-center text-gray-400">
                  🎉 Aucune facture en retard
                </td></tr>
              )}
              {overdue.map(o => (
                <tr key={o.id} className={`hover:bg-gray-50 ${selected.has(o.id) ? 'bg-red-50/30' : ''}`}>
                  <td className="px-4 py-3">
                    <button onClick={() => toggle(o.id)}>
                      {selected.has(o.id) ? <CheckSquare className="w-4 h-4 text-green-600" /> : <Square className="w-4 h-4 text-gray-400" />}
                    </button>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-700">{o.invoice_number}</td>
                  <td className="px-4 py-3 font-medium">{o.student?.first_name} {o.student?.last_name}</td>
                  <td className="px-4 py-3 text-gray-600">{o.student?.classes?.name || '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{o.period_label || '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{formatDate(o.due_date)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                      o.days_overdue > 30 ? 'bg-red-200 text-red-800' : o.days_overdue > 7 ? 'bg-orange-200 text-orange-800' : 'bg-yellow-200 text-yellow-800'
                    }`}>
                      {o.days_overdue}j
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-red-600">{formatMAD(o.remaining)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
