import { useState, useEffect } from 'react';
import { AlertCircle, MessageSquare, RefreshCw, CheckSquare, Square, Eye } from 'lucide-react';
import { financeApi, formatMAD, formatDate } from '../../lib/financeApi';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';

export default function OverduePage() {
  const { school } = useAuth();
  const [overdue, setOverdue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(new Set());
  const [sendingReminders, setSendingReminders] = useState(false);
  const [previewMessage, setPreviewMessage] = useState(null);

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

  const buildMessage = (student, invs) => {
    const totalDue = invs.reduce((s, i) => s + Number(i.remaining), 0);
    const schoolName = school?.name || 'École';
    const schoolPhone = school?.phone ? `\nTél : ${school.phone}` : '';
    const lines = invs.map(i =>
      `• Facture ${i.invoice_number}${i.period_label ? ` (${i.period_label})` : ''}\n  Échéance : ${formatDate(i.due_date)} — ${i.days_overdue} j de retard\n  Reste à payer : ${formatMAD(i.remaining)}`
    ).join('\n\n');

    return `🏫 *${schoolName}*\n\nBonjour,\n\nNous vous informons que ${invs.length === 1 ? 'la facture suivante est en retard' : `${invs.length} factures sont en retard`} pour votre enfant *${student?.first_name} ${student?.last_name}* (classe ${student?.classes?.name || '—'}) :\n\n${lines}\n\n💰 *Total dû : ${formatMAD(totalDue)}*\n\nMerci de procéder au règlement dans les meilleurs délais.\n\nPour toute question ou modalité de paiement, n'hésitez pas à contacter l'administration.${schoolPhone}\n\nCordialement,\nService Financier`;
  };

  const buildPreview = () => {
    if (selected.size === 0) return null;
    const selectedInvoices = overdue.filter(o => selected.has(o.id));
    const firstStudentId = selectedInvoices[0]?.student_id;
    const invs = selectedInvoices.filter(i => i.student_id === firstStudentId);
    return buildMessage(invs[0]?.student, invs);
  };

  const sendReminders = async () => {
    if (selected.size === 0) return;
    const selectedInvoices = overdue.filter(o => selected.has(o.id));
    const studentIds = [...new Set(selectedInvoices.map(i => i.student_id))];

    if (!confirm(`Envoyer ${studentIds.length} relance(s) WhatsApp via le canal officiel de l'école ?`)) return;

    setSendingReminders(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';

      const results = { sent: 0, skipped: 0, errors: [] };

      for (const studentId of studentIds) {
        const invs = selectedInvoices.filter(i => i.student_id === studentId);
        const student = invs[0]?.student;
        const message = buildMessage(student, invs);

        try {
          // Récupérer le numéro WhatsApp officiel du parent (table parent_contacts via recipients-list)
          const recRes = await fetch(`${apiUrl}/api/admin/whatsapp/recipients-list?class_ids=${student?.class_id}`, {
            headers: { Authorization: `Bearer ${session?.access_token}` }
          });
          const recData = await recRes.json();
          const parentsOfStudent = (recData.parents || []).filter(p =>
            p.children?.some(c => c.id === studentId) && p.phone_whatsapp
          );

          if (parentsOfStudent.length === 0) {
            results.skipped++;
            results.errors.push(`${student?.first_name} ${student?.last_name} : aucun parent avec WhatsApp`);
            continue;
          }

          // Envoyer à tous les parents enregistrés (mère + père si dispo)
          const phones = parentsOfStudent.map(p => p.phone_whatsapp);
          const sendRes = await fetch(`${apiUrl}/api/admin/whatsapp/send`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message,
              type: 'text',
              filter: { parent_phones: phones }
            })
          });

          if (sendRes.ok) {
            results.sent++;
          } else {
            const errData = await sendRes.json().catch(() => ({}));
            results.errors.push(`${student?.first_name} ${student?.last_name} : ${errData.error || 'échec envoi'}`);
          }
        } catch (e) {
          results.errors.push(`${student?.first_name} ${student?.last_name} : ${e.message}`);
        }
      }

      const errorDetails = results.errors.length > 0 ? `\n\nDétails :\n${results.errors.slice(0, 5).join('\n')}${results.errors.length > 5 ? `\n... (${results.errors.length - 5} autres)` : ''}` : '';
      alert(`✅ ${results.sent} relance(s) envoyée(s)\n⚠️ ${results.skipped} ignorée(s) (pas de WhatsApp)${errorDetails}`);
      setSelected(new Set());
      setPreviewMessage(null);
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
            <>
              <button onClick={() => setPreviewMessage(buildPreview())}
                className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 border border-blue-200">
                <Eye className="w-4 h-4" /> Aperçu du message
              </button>
              <button onClick={sendReminders} disabled={sendingReminders}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">
                <MessageSquare className="w-4 h-4" /> Relancer {selected.size} ({formatMAD(selectedTotal)})
              </button>
            </>
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

      {previewMessage && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-green-600" /> Aperçu de la relance WhatsApp
                </h2>
                <p className="text-xs text-gray-500 mt-1">Exemple pour le 1er élève sélectionné · Envoyé via WhatsApp au numéro enregistré du parent</p>
              </div>
              <button onClick={() => setPreviewMessage(null)} className="p-1 hover:bg-gray-100 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              <div className="bg-[#e7ffdb] p-4 rounded-2xl rounded-tl-sm border border-green-200 whitespace-pre-wrap text-sm text-gray-800 font-sans">
                {previewMessage}
              </div>
              <p className="text-xs text-gray-500 mt-3">
                📱 Canal : WhatsApp officiel de l'école (Cloud API Meta)<br/>
                👤 Destinataires : numéros WhatsApp des parents enregistrés dans <strong>Admin → Parents</strong>
              </p>
            </div>
            <div className="border-t border-gray-200 px-6 py-3 flex justify-end gap-2">
              <button onClick={() => setPreviewMessage(null)} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">Fermer</button>
              <button onClick={() => { setPreviewMessage(null); sendReminders(); }} disabled={sendingReminders}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">
                Envoyer maintenant
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
