import { useState, useEffect } from 'react';
import { AlertCircle, MessageSquare, CheckSquare, Square, Eye } from 'lucide-react';
import { financeApi, formatMAD, formatDate } from '../../lib/financeApi';
import { useAuth } from '../../contexts/AuthContext';
import { useYear } from '../../contexts/YearContext';
import { supabase } from '../../lib/supabase';
import { PageHeader, KpiGrid, KpiCard, DataTable, Money, Badge, Drawer, Button } from '../../components/finance/ui';

export default function OverduePage() {
  const { school } = useAuth();
  const { year } = useYear();
  const [overdue, setOverdue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(new Set());
  const [sendingReminders, setSendingReminders] = useState(false);
  const [previewMessage, setPreviewMessage] = useState(null);

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [year]);

  const load = async () => {
    setLoading(true);
    try {
      await financeApi.markOverdue();
      const data = await financeApi.getOverdue(year);
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

          const phones = parentsOfStudent.map(p => p.phone_whatsapp);
          const sendRes = await fetch(`${apiUrl}/api/admin/whatsapp/send`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message,
              type: 'text',
              filter: { parent_phones: phones },
              category: 'financial'
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
  const studentsCount = new Set(overdue.map(o => o.student_id)).size;

  const columns = [
    { key: 'check', header: (
      <button onClick={selectAll}>
        {selected.size === overdue.length && overdue.length > 0
          ? <CheckSquare className="w-4 h-4 text-green-600" />
          : <Square className="w-4 h-4 text-gray-400" />}
      </button>
    ), render: (o) => (
      <button onClick={(e) => { e.stopPropagation(); toggle(o.id); }}>
        {selected.has(o.id) ? <CheckSquare className="w-4 h-4 text-green-600" /> : <Square className="w-4 h-4 text-gray-400" />}
      </button>
    ) },
    { key: 'number', header: 'N°', render: (o) => <span className="font-mono text-xs text-gray-700">{o.invoice_number}</span> },
    { key: 'student', header: 'Élève', render: (o) => <span className="font-medium">{o.student?.first_name} {o.student?.last_name}</span> },
    { key: 'class', header: 'Classe', render: (o) => <span className="text-gray-600">{o.student?.classes?.name || '—'}</span> },
    { key: 'period', header: 'Période', render: (o) => <span className="text-gray-600">{o.period_label || '—'}</span> },
    { key: 'due', header: 'Échéance', render: (o) => <span className="text-gray-600">{formatDate(o.due_date)}</span> },
    { key: 'days', header: 'Retard', align: 'right', render: (o) => (
      <Badge tone={o.days_overdue > 30 ? 'red' : o.days_overdue > 7 ? 'orange' : 'yellow'}>{o.days_overdue}j</Badge>
    ) },
    { key: 'remaining', header: 'Dû', align: 'right', render: (o) => <Money value={o.remaining} tone="red" /> },
  ];

  return (
    <div className="p-6 space-y-5">
      <PageHeader icon={AlertCircle} title="Factures en retard" color="red"
        subtitle={`${overdue.length} facture(s) à recouvrer`}
        onRefresh={load} loading={loading}
        actions={selected.size > 0 && (
          <>
            <Button variant="secondary" icon={Eye} onClick={() => setPreviewMessage(buildPreview())}>Aperçu</Button>
            <Button color="green" icon={MessageSquare} onClick={sendReminders} disabled={sendingReminders}>
              Relancer {selected.size} ({formatMAD(selectedTotal)})
            </Button>
          </>
        )} />

      <KpiGrid cols={3}>
        <KpiCard label="Total à recouvrer" value={formatMAD(totalOverdue)} tone="red" icon={AlertCircle} />
        <KpiCard label="Factures en retard" value={overdue.length} />
        <KpiCard label="Élèves concernés" value={studentsCount} />
      </KpiGrid>

      <DataTable columns={columns} rows={overdue}
        empty="🎉 Aucune facture en retard"
        rowKey={(o) => o.id} />

      <Drawer open={!!previewMessage} onClose={() => setPreviewMessage(null)}
        title="Aperçu de la relance WhatsApp" width="max-w-lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPreviewMessage(null)}>Fermer</Button>
            <Button color="green" icon={MessageSquare} disabled={sendingReminders}
              onClick={() => { setPreviewMessage(null); sendReminders(); }}>Envoyer maintenant</Button>
          </>
        }>
        <p className="text-xs text-gray-500">Exemple pour le 1er élève sélectionné · envoyé au numéro WhatsApp enregistré du parent.</p>
        <div className="bg-[#e7ffdb] p-4 rounded-2xl rounded-tl-sm border border-green-200 whitespace-pre-wrap text-sm text-gray-800">
          {previewMessage}
        </div>
        <p className="text-xs text-gray-500">
          📱 Canal : WhatsApp officiel de l'école (Cloud API Meta)<br/>
          👤 Destinataires : numéros WhatsApp des parents enregistrés dans <strong>Admin → Parents</strong>
        </p>
      </Drawer>
    </div>
  );
}
