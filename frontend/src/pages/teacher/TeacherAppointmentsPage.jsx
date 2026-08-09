import { useEffect, useState } from 'react';
import { CalendarClock, Send, User, MapPin } from 'lucide-react';
import {
  appointmentsApi, APPOINTMENT_STATUS, formatSlot, toDatetimeLocal, personName,
} from '../../lib/appointmentsApi';
import { useI18n } from '../../i18n';

/**
 * Espace professeur : les demandes de rendez-vous des parents.
 * Le professeur PROPOSE un créneau ; la validation finale — et la notification
 * du parent — restent à la charge de l'administration.
 */
export default function TeacherAppointmentsPage() {
  const { t, lang } = useI18n();
  // Dates et statuts rendus dans la langue de l'interface.
  const slotOpts = { locale: lang === 'ar' ? 'ar-MA' : 'fr-FR', at: t('appt.at') };
  const statusOf = (code) => ({
    label: t(`appt.status.${code}`),
    cls: APPOINTMENT_STATUS[code]?.cls || 'bg-gray-100 text-gray-600',
  });
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState({});   // id → { proposed_at, note }
  const [busy, setBusy] = useState(null);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try { setItems(await appointmentsApi.list()); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const draftOf = (a) => drafts[a.id] || { proposed_at: toDatetimeLocal(a.proposed_at), note: a.proposed_note || '' };
  const setDraft = (id, patch) => setDrafts((d) => ({
    ...d,
    [id]: { ...draftOf(items.find((i) => i.id === id) || { id }), ...patch },
  }));

  const propose = async (a) => {
    const draft = draftOf(a);
    if (!draft.proposed_at) return alert(t('appt.pickDate'));
    setBusy(a.id);
    try {
      await appointmentsApi.propose(a.id, {
        proposed_at: new Date(draft.proposed_at).toISOString(),
        note: draft.note || null,
      });
      await load();
    } catch (e) { alert(e.message); }
    finally { setBusy(null); }
  };

  const declare = async (a) => {
    const note = prompt(t('appt.messageToAdmin'), '');
    if (note === null) return;
    setBusy(a.id);
    try {
      await appointmentsApi.unavailable(a.id, { note: note || null });
      await load();
    } catch (e) { alert(e.message); }
    finally { setBusy(null); }
  };

  const pending = items.filter((a) => ['en_attente', 'propose'].includes(a.status));
  const past = items.filter((a) => !['en_attente', 'propose'].includes(a.status));

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <CalendarClock className="w-6 h-6" /> {t('appt.title')}
        </h1>
        <p className="text-sm text-gray-500 max-w-2xl">
          {t('appt.intro')}
        </p>
      </div>

      {loading ? (
        <p className="text-gray-500">{t('common.loading')}</p>
      ) : items.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
          <CalendarClock className="w-12 h-12 mx-auto text-gray-400 mb-3" />
          <p className="text-gray-600">{t('appt.empty')}</p>
        </div>
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">{t('appt.toProcess', { n: pending.length })}</h2>
            {pending.length === 0 && <p className="text-sm text-gray-500">{t('appt.nothingPending')}</p>}
            {pending.map((a) => {
              const st = statusOf(a.status);
              const draft = draftOf(a);
              return (
                <div key={a.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-gray-900">{a.subject}</h3>
                      <p className="text-sm text-gray-500 flex items-center gap-1 mt-0.5">
                        <User className="w-3.5 h-3.5" />
                        {personName(a.parent) || t('appt.parent')}
                        {a.student ? t('appt.studentSuffix', { name: personName(a.student) }) : ''}
                        {a.classes?.name ? ` (${a.classes.name})` : ''}
                      </p>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full font-medium whitespace-nowrap ${st.cls}`}>{st.label}</span>
                  </div>

                  {a.message && <p className="text-sm text-gray-700 mt-2 whitespace-pre-line">{a.message}</p>}
                  {a.preferred_slot && (
                    <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2">
                      {t('appt.preferredSlot', { slot: a.preferred_slot })}
                    </p>
                  )}
                  {a.status === 'propose' && a.proposed_at && (
                    <p className="text-sm text-blue-700 mt-2">
                      {t('appt.youProposed')} <strong>{formatSlot(a.proposed_at, slotOpts)}</strong> {t('appt.awaitingValidation')}
                    </p>
                  )}

                  <div className="mt-3 grid gap-2 sm:grid-cols-[220px_1fr_auto_auto] items-center">
                    <input
                      type="datetime-local"
                      value={draft.proposed_at}
                      onChange={(e) => setDraft(a.id, { proposed_at: e.target.value })}
                      className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    />
                    <input
                      value={draft.note}
                      onChange={(e) => setDraft(a.id, { note: e.target.value })}
                      placeholder={t('appt.notePlaceholder')}
                      className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    />
                    <button
                      onClick={() => propose(a)}
                      disabled={busy === a.id}
                      className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm disabled:opacity-50"
                    >
                      <Send className="w-4 h-4" /> {a.status === 'propose' ? t('appt.modify') : t('appt.propose')}
                    </button>
                    <button
                      onClick={() => declare(a)}
                      disabled={busy === a.id}
                      className="inline-flex items-center justify-center gap-2 px-3 py-2 border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 text-sm disabled:opacity-50"
                      title={t('appt.unavailableHint')}
                    >
                      {t('appt.unavailable')}
                    </button>
                  </div>
                </div>
              );
            })}
          </section>

          {past.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">{t('appt.history')}</h2>
              {past.map((a) => {
                const st = APPOINTMENT_STATUS[a.status] ? statusOf(a.status) : { label: a.status, cls: 'bg-gray-100 text-gray-600' };
                return (
                  <div key={a.id} className="rounded-xl border border-gray-200 bg-white p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-medium text-gray-900">{a.subject}</h3>
                        <p className="text-sm text-gray-500">{personName(a.parent)}{a.student ? ` — ${personName(a.student)}` : ''}</p>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded-full font-medium whitespace-nowrap ${st.cls}`}>{st.label}</span>
                    </div>
                    {a.scheduled_at && (
                      <p className="text-sm text-emerald-700 mt-2">
                        📅 {formatSlot(a.scheduled_at, slotOpts)}
                        {a.location && <span className="inline-flex items-center gap-1 ml-2"><MapPin className="w-3.5 h-3.5" />{a.location}</span>}
                      </p>
                    )}
                  </div>
                );
              })}
            </section>
          )}
        </>
      )}
    </div>
  );
}
