import { useEffect, useState } from 'react';
import { CalendarClock, Plus, X, MapPin, User, Building2, GraduationCap } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import {
  appointmentsApi, APPOINTMENT_STATUS, formatSlot, personName,
} from '../../lib/appointmentsApi';

const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const EMPTY_FORM = {
  student_id: '',
  target_type: 'administration',
  teacher_id: '',
  subject: '',
  message: '',
  preferred_slot: '',
};

export default function ParentAppointmentsPage() {
  const [items, setItems] = useState([]);
  const [children, setChildren] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const [appts, kidsRes] = await Promise.all([
        appointmentsApi.list(),
        fetch(`${apiUrl}/api/parent/children`, {
          headers: { Authorization: `Bearer ${session?.access_token}` },
        }).then((r) => (r.ok ? r.json() : [])),
      ]);
      setItems(appts);
      setChildren(kidsRes || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // Les professeurs proposés dépendent de la classe de l'enfant sélectionné.
  useEffect(() => {
    if (!form.student_id || form.target_type !== 'teacher') { setTeachers([]); return; }
    appointmentsApi.classTeachers(form.student_id)
      .then(setTeachers)
      .catch(() => setTeachers([]));
  }, [form.student_id, form.target_type]);

  const openForm = () => {
    setForm({ ...EMPTY_FORM, student_id: children[0]?.id || '' });
    setError('');
    setShowForm(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await appointmentsApi.create({
        student_id: form.student_id || null,
        target_type: form.target_type,
        teacher_id: form.target_type === 'teacher' ? form.teacher_id : null,
        subject: form.subject,
        message: form.message || null,
        preferred_slot: form.preferred_slot || null,
      });
      setShowForm(false);
      await load();
    } catch (e2) {
      setError(e2.message);
    } finally {
      setSaving(false);
    }
  };

  const cancel = async (appt) => {
    if (!confirm('Annuler cette demande de rendez-vous ?')) return;
    try {
      await appointmentsApi.cancel(appt.id, {});
      await load();
    } catch (e) { alert(e.message); }
  };

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <div className="rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white p-6 shadow-lg mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <CalendarClock className="w-7 h-7" /> Mes rendez-vous
        </h1>
        <p className="text-white/80 text-sm">
          Demandez un rendez-vous avec l'administration ou un professeur. L'école vous
          confirmera la date et l'heure par notification.
        </p>
      </div>

      <button
        onClick={openForm}
        disabled={children.length === 0}
        className="mb-6 inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
      >
        <Plus className="w-4 h-4" /> Demander un rendez-vous
      </button>

      {loading ? (
        <div className="flex items-center justify-center h-40 text-gray-500">Chargement…</div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center text-gray-500">
          Vous n'avez encore demandé aucun rendez-vous.
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((a) => {
            const st = APPOINTMENT_STATUS[a.status] || { label: a.status, cls: 'bg-gray-100 text-gray-600' };
            return (
              <div key={a.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-semibold text-gray-900">{a.subject}</h3>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium whitespace-nowrap ${st.cls}`}>{st.label}</span>
                </div>

                <div className="flex flex-wrap gap-2 mt-2 text-xs">
                  <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 inline-flex items-center gap-1">
                    {a.target_type === 'teacher'
                      ? <><GraduationCap className="w-3 h-3" /> {personName(a.teacher) || 'Professeur'}</>
                      : <><Building2 className="w-3 h-3" /> Administration</>}
                  </span>
                  {a.student && (
                    <span className="px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 inline-flex items-center gap-1">
                      <User className="w-3 h-3" /> {personName(a.student)}
                    </span>
                  )}
                </div>

                {a.status === 'confirme' && a.scheduled_at && (
                  <div className="mt-3 rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-800">
                    <div className="font-semibold">📅 {formatSlot(a.scheduled_at)}</div>
                    {a.location && (
                      <div className="inline-flex items-center gap-1 mt-1">
                        <MapPin className="w-3.5 h-3.5" /> {a.location}
                      </div>
                    )}
                    {a.decision_note && <p className="mt-1">{a.decision_note}</p>}
                  </div>
                )}

                {a.status === 'refuse' && a.decision_note && (
                  <p className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
                    {a.decision_note}
                  </p>
                )}

                {a.message && <p className="text-sm text-gray-700 mt-2 whitespace-pre-line">{a.message}</p>}
                {a.preferred_slot && (
                  <p className="text-xs text-gray-500 mt-1">Votre souhait : {a.preferred_slot}</p>
                )}

                <div className="flex items-center justify-between mt-3">
                  <span className="text-xs text-gray-400">
                    Demandé le {new Date(a.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}
                    {a.source === 'whatsapp' ? ' · via WhatsApp' : ''}
                  </span>
                  {['en_attente', 'propose', 'confirme'].includes(a.status) && (
                    <button onClick={() => cancel(a)} className="text-xs text-red-600 hover:underline">
                      Annuler
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <form onSubmit={submit} className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="font-bold text-gray-900">Demander un rendez-vous</h2>
              <button type="button" onClick={() => setShowForm(false)}><X className="w-5 h-5 text-gray-500" /></button>
            </div>

            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Enfant concerné</label>
                <select
                  value={form.student_id}
                  onChange={(e) => setForm({ ...form, student_id: e.target.value, teacher_id: '' })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                  required
                >
                  {children.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.first_name} {c.last_name}{c.class?.name ? ` — ${c.class.name}` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Avec qui ?</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { value: 'administration', label: 'Administration', icon: Building2 },
                    { value: 'teacher', label: 'Un professeur', icon: GraduationCap },
                  ].map(({ value, label, icon: Icon }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setForm({ ...form, target_type: value, teacher_id: '' })}
                      className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border text-sm ${
                        form.target_type === value
                          ? 'border-indigo-600 bg-indigo-50 text-indigo-700 font-medium'
                          : 'border-gray-300 text-gray-700'
                      }`}
                    >
                      <Icon className="w-4 h-4" /> {label}
                    </button>
                  ))}
                </div>
              </div>

              {form.target_type === 'teacher' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Professeur</label>
                  <select
                    value={form.teacher_id}
                    onChange={(e) => setForm({ ...form, teacher_id: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
                    required
                  >
                    <option value="">— Choisir —</option>
                    {teachers.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}{t.subjects?.length ? ` (${t.subjects.join(', ')})` : ''}
                      </option>
                    ))}
                  </select>
                  {teachers.length === 0 && (
                    <p className="text-xs text-amber-600 mt-1">
                      Aucun professeur n'est rattaché à la classe de cet enfant.
                    </p>
                  )}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Objet du rendez-vous</label>
                <input
                  value={form.subject}
                  onChange={(e) => setForm({ ...form, subject: e.target.value })}
                  placeholder="Ex. résultats du 1er semestre"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Détails (facultatif)</label>
                <textarea
                  value={form.message}
                  onChange={(e) => setForm({ ...form, message: e.target.value })}
                  rows={3}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Créneau souhaité (facultatif)</label>
                <input
                  value={form.preferred_slot}
                  onChange={(e) => setForm({ ...form, preferred_slot: e.target.value })}
                  placeholder="Ex. jeudi matin, après 16h…"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                />
                <p className="text-xs text-gray-500 mt-1">
                  L'école fixe l'horaire définitif et vous le confirme par notification.
                </p>
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>

            <div className="flex justify-end gap-2 p-4 border-t">
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-gray-600">Annuler</button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                {saving ? 'Envoi…' : 'Envoyer la demande'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
