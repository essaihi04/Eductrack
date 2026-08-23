import { createElement, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CalendarClock, Plus, X, MapPin, User, Building2, GraduationCap } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { preferredParentChild, rememberParentChild } from '../../lib/parentNavigation';
import {
  appointmentsApi, APPOINTMENT_STATUS, formatSlot, personName,
} from '../../lib/appointmentsApi';
import { useI18n } from '../../i18n';

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
  const { t, lang } = useI18n();
  const [searchParams] = useSearchParams();
  const dateLocale = lang === 'ar' ? 'ar-MA' : 'fr-FR';
  const slotOpts = { locale: dateLocale, at: t('appt.at') };
  const [items, setItems] = useState([]);
  const [children, setChildren] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [preferredChildId, setPreferredChildId] = useState('');
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
      const kids = Array.isArray(kidsRes) ? kidsRes : [];
      const preferred = preferredParentChild(kids, searchParams.get('childId'));
      setChildren(kids);
      setPreferredChildId(preferred);
      rememberParentChild(preferred);
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
    setForm({ ...EMPTY_FORM, student_id: preferredChildId || children[0]?.id || '' });
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
    if (!confirm(t('pappt.confirmCancel'))) return;
    try {
      await appointmentsApi.cancel(appt.id, {});
      await load();
    } catch (e) { alert(e.message); }
  };

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <div className="rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white p-6 shadow-lg mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <CalendarClock className="w-7 h-7" /> {t('pappt.title')}
        </h1>
        <p className="text-white/80 text-sm">{t('pappt.intro')}</p>
      </div>

      <button
        onClick={openForm}
        disabled={children.length === 0}
        className="mb-6 inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
      >
        <Plus className="w-4 h-4" /> {t('pappt.new')}
      </button>

      {loading ? (
        <div className="flex items-center justify-center h-40 text-gray-500">{t('common.loading')}</div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center text-gray-500">
          {t('pappt.empty')}
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((a) => {
            const st = APPOINTMENT_STATUS[a.status]
              ? { label: t(`appt.status.${a.status}`), cls: APPOINTMENT_STATUS[a.status].cls }
              : { label: a.status, cls: 'bg-gray-100 text-gray-600' };
            return (
              <div key={a.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-semibold text-gray-900">{a.subject}</h3>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium whitespace-nowrap ${st.cls}`}>{st.label}</span>
                </div>

                <div className="flex flex-wrap gap-2 mt-2 text-xs">
                  <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 inline-flex items-center gap-1">
                    {a.target_type === 'teacher'
                      ? <><GraduationCap className="w-3 h-3" /> {personName(a.teacher) || t('pappt.teacher')}</>
                      : <><Building2 className="w-3 h-3" /> {t('pappt.administration')}</>}
                  </span>
                  {a.student && (
                    <span className="px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 inline-flex items-center gap-1">
                      <User className="w-3 h-3" /> {personName(a.student)}
                    </span>
                  )}
                </div>

                {a.status === 'confirme' && a.scheduled_at && (
                  <div className="mt-3 rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-800">
                    <div className="font-semibold">📅 {formatSlot(a.scheduled_at, slotOpts)}</div>
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
                  <p className="text-xs text-gray-500 mt-1">{t('pappt.wish', { slot: a.preferred_slot })}</p>
                )}

                <div className="flex items-center justify-between mt-3">
                  <span className="text-xs text-gray-400">
                    {t('pappt.requestedOn', { date: new Date(a.created_at).toLocaleDateString(dateLocale, { day: '2-digit', month: 'long', year: 'numeric' }) })}
                    {a.source === 'whatsapp' ? t('pappt.viaWhatsapp') : ''}
                  </span>
                  {['en_attente', 'propose', 'confirme'].includes(a.status) && (
                    <button onClick={() => cancel(a)} className="text-xs text-red-600 hover:underline">
                      {t('pappt.cancel')}
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
              <h2 className="font-bold text-gray-900">{t('pappt.new')}</h2>
              <button type="button" onClick={() => setShowForm(false)}><X className="w-5 h-5 text-gray-500" /></button>
            </div>

            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('pappt.form.child')}</label>
                <select
                  value={form.student_id}
                  onChange={(e) => {
                    rememberParentChild(e.target.value);
                    setPreferredChildId(e.target.value);
                    setForm({ ...form, student_id: e.target.value, teacher_id: '' });
                  }}
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
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('pappt.form.with')}</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { value: 'administration', label: t('pappt.administration'), icon: Building2 },
                    { value: 'teacher', label: t('pappt.form.teacherOption'), icon: GraduationCap },
                  ].map(({ value, label, icon }) => (
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
                      {createElement(icon, { className: 'w-4 h-4' })} {label}
                    </button>
                  ))}
                </div>
              </div>

              {form.target_type === 'teacher' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('pappt.form.teacherLabel')}</label>
                  <select
                    value={form.teacher_id}
                    onChange={(e) => setForm({ ...form, teacher_id: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
                    required
                  >
                    <option value="">{t('pappt.form.pick')}</option>
                    {teachers.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}{t.subjects?.length ? ` (${t.subjects.join(', ')})` : ''}
                      </option>
                    ))}
                  </select>
                  {teachers.length === 0 && (
                    <p className="text-xs text-amber-600 mt-1">
                      {t('pappt.form.noTeacher')}
                    </p>
                  )}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('pappt.form.subject')}</label>
                <input
                  value={form.subject}
                  onChange={(e) => setForm({ ...form, subject: e.target.value })}
                  placeholder={t('pappt.form.subjectPlaceholder')}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('pappt.form.details')}</label>
                <textarea
                  value={form.message}
                  onChange={(e) => setForm({ ...form, message: e.target.value })}
                  rows={3}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('pappt.form.slot')}</label>
                <input
                  value={form.preferred_slot}
                  onChange={(e) => setForm({ ...form, preferred_slot: e.target.value })}
                  placeholder={t('pappt.form.slotPlaceholder')}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                />
                <p className="text-xs text-gray-500 mt-1">
                  {t('pappt.form.slotHint')}
                </p>
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>

            <div className="flex justify-end gap-2 p-4 border-t">
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-gray-600">{t('common.cancel')}</button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                {saving ? t('pappt.form.sending') : t('pappt.form.submit')}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
