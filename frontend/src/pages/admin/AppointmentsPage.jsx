import { useEffect, useMemo, useState } from 'react';
import {
  CalendarClock, Check, X, Building2, GraduationCap, User, MessageSquare, Smartphone,
} from 'lucide-react';
import {
  appointmentsApi, APPOINTMENT_STATUS, formatSlot, toDatetimeLocal, personName,
} from '../../lib/appointmentsApi';

/**
 * Arbitrage des demandes de rendez-vous (direction pédagogique + administration).
 *
 * C'est ici que le rendez-vous est ACCORDÉ : fixer la date et l'heure déclenche
 * automatiquement la notification du parent (push dans l'app, sinon WhatsApp).
 * Le responsable pédagogique ne voit que les classes de son périmètre.
 */
const FILTERS = [
  { key: 'a_traiter', label: 'À traiter' },
  { key: 'confirme', label: 'Confirmés' },
  { key: 'tous', label: 'Tous' },
];

export default function AppointmentsPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('a_traiter');
  const [drafts, setDrafts] = useState({});
  const [busy, setBusy] = useState(null);
  const [feedback, setFeedback] = useState('');

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try { setItems(await appointmentsApi.list()); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const visible = useMemo(() => {
    if (filter === 'a_traiter') return items.filter((a) => ['en_attente', 'propose'].includes(a.status));
    if (filter === 'confirme') return items.filter((a) => a.status === 'confirme');
    return items;
  }, [items, filter]);

  const draftOf = (a) => drafts[a.id] || {
    // Le créneau proposé par le professeur est pré-rempli : le staff n'a plus
    // qu'à valider (ou corriger) avant d'informer le parent.
    scheduled_at: toDatetimeLocal(a.scheduled_at || a.proposed_at),
    location: a.location || '',
    duration_minutes: a.duration_minutes || 30,
    note: '',
  };
  const setDraft = (id, patch) => setDrafts((d) => ({
    ...d,
    [id]: { ...draftOf(items.find((i) => i.id === id) || { id }), ...patch },
  }));

  const confirm = async (a) => {
    const draft = draftOf(a);
    if (!draft.scheduled_at) return alert('Choisissez la date et l\'heure du rendez-vous.');
    setBusy(a.id);
    try {
      const res = await appointmentsApi.confirm(a.id, {
        scheduled_at: new Date(draft.scheduled_at).toISOString(),
        duration_minutes: Number(draft.duration_minutes) || 30,
        location: draft.location || null,
        note: draft.note || null,
      });
      const channelLabel = {
        push: 'notification dans l\'app',
        whatsapp_free: 'WhatsApp',
        whatsapp_paid: 'WhatsApp',
        optout: 'app uniquement (parent désabonné de WhatsApp)',
      }[res.parent_channel] || res.parent_channel;
      setFeedback(`Rendez-vous confirmé — parent prévenu par ${channelLabel}.`);
      await load();
    } catch (e) { alert(e.message); }
    finally { setBusy(null); }
  };

  const decline = async (a) => {
    const note = prompt('Motif communiqué au parent (facultatif) :', '');
    if (note === null) return;
    setBusy(a.id);
    try {
      await appointmentsApi.decline(a.id, { note: note || null });
      setFeedback('Demande refusée — le parent a été prévenu.');
      await load();
    } catch (e) { alert(e.message); }
    finally { setBusy(null); }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <CalendarClock className="w-6 h-6" /> Rendez-vous des parents
        </h1>
        <p className="text-sm text-gray-500 max-w-3xl">
          Demandes reçues via l'application et WhatsApp. Fixez la date et l'heure : le parent
          est prévenu automatiquement (notification dans l'app, sinon WhatsApp).
        </p>
      </div>

      {feedback && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-2 text-sm flex items-center justify-between">
          {feedback}
          <button onClick={() => setFeedback('')}><X className="w-4 h-4" /></button>
        </div>
      )}

      <div className="flex gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-lg text-sm ${
              filter === f.key ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-gray-500">Chargement…</p>
      ) : visible.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
          <CalendarClock className="w-12 h-12 mx-auto text-gray-400 mb-3" />
          <p className="text-gray-600">Aucune demande dans cette vue</p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((a) => {
            const st = APPOINTMENT_STATUS[a.status] || { label: a.status, cls: 'bg-gray-100 text-gray-600' };
            const draft = draftOf(a);
            const actionable = !['annule', 'termine'].includes(a.status);
            return (
              <div key={a.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-gray-900">{a.subject}</h3>
                    <p className="text-sm text-gray-500 flex flex-wrap items-center gap-x-3 gap-y-1 mt-0.5">
                      <span className="inline-flex items-center gap-1"><User className="w-3.5 h-3.5" />{personName(a.parent) || 'Parent'}</span>
                      {a.student && <span>Élève : {personName(a.student)}{a.classes?.name ? ` (${a.classes.name})` : ''}</span>}
                      <span className="inline-flex items-center gap-1">
                        {a.target_type === 'teacher'
                          ? <><GraduationCap className="w-3.5 h-3.5" />{personName(a.teacher) || 'Professeur'}</>
                          : <><Building2 className="w-3.5 h-3.5" />Administration</>}
                      </span>
                      <span className="inline-flex items-center gap-1 text-gray-400">
                        {a.source === 'whatsapp' ? <><MessageSquare className="w-3.5 h-3.5" />WhatsApp</> : <><Smartphone className="w-3.5 h-3.5" />App</>}
                      </span>
                    </p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium whitespace-nowrap ${st.cls}`}>{st.label}</span>
                </div>

                {a.message && <p className="text-sm text-gray-700 mt-2 whitespace-pre-line">{a.message}</p>}

                <div className="flex flex-wrap gap-2 mt-2 text-xs">
                  {a.preferred_slot && (
                    <span className="px-2 py-1 rounded-lg bg-amber-50 text-amber-800 border border-amber-200">
                      🕐 Souhait du parent : {a.preferred_slot}
                    </span>
                  )}
                  {a.status === 'propose' && a.proposed_at && (
                    <span className="px-2 py-1 rounded-lg bg-blue-50 text-blue-800 border border-blue-200">
                      👨‍🏫 Proposé par le professeur : {formatSlot(a.proposed_at)}
                    </span>
                  )}
                  {a.proposed_note && (
                    <span className="px-2 py-1 rounded-lg bg-gray-50 text-gray-700 border border-gray-200">
                      💬 {a.proposed_note}
                    </span>
                  )}
                </div>

                {a.status === 'confirme' && a.scheduled_at && (
                  <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 mt-2">
                    ✅ {formatSlot(a.scheduled_at)}{a.location ? ` — ${a.location}` : ''}
                    {a.parent_notify_channel ? ` · parent prévenu (${a.parent_notify_channel})` : ''}
                  </p>
                )}

                {actionable && (
                  <div className="mt-3 grid gap-2 md:grid-cols-[200px_1fr_90px_auto_auto] items-center">
                    <input
                      type="datetime-local"
                      value={draft.scheduled_at}
                      onChange={(e) => setDraft(a.id, { scheduled_at: e.target.value })}
                      className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    />
                    <input
                      value={draft.location}
                      onChange={(e) => setDraft(a.id, { location: e.target.value })}
                      placeholder="Lieu (bureau, salle…)"
                      className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    />
                    <input
                      type="number"
                      min="5"
                      step="5"
                      value={draft.duration_minutes}
                      onChange={(e) => setDraft(a.id, { duration_minutes: e.target.value })}
                      className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      title="Durée en minutes"
                    />
                    <button
                      onClick={() => confirm(a)}
                      disabled={busy === a.id}
                      className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm disabled:opacity-50"
                    >
                      <Check className="w-4 h-4" /> {a.status === 'confirme' ? 'Replanifier' : 'Accorder'}
                    </button>
                    {a.status !== 'refuse' && (
                      <button
                        onClick={() => decline(a)}
                        disabled={busy === a.id}
                        className="inline-flex items-center justify-center gap-2 px-3 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 text-sm disabled:opacity-50"
                      >
                        <X className="w-4 h-4" /> Refuser
                      </button>
                    )}
                  </div>
                )}

                <p className="text-xs text-gray-400 mt-2">
                  Demandé le {new Date(a.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
