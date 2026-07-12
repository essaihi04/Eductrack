import { useState, useEffect, useMemo } from 'react';
import { CalendarDays, Clock, User, MapPin } from 'lucide-react';
import { financeApi } from '../../lib/financeApi';
import { PageHeader, EmptyState } from '../../components/finance/ui';
import { useYear } from '../../contexts/YearContext';
import { toDashYear } from '../../lib/schoolYear';

// Emploi du temps de toutes les classes — VUE LECTURE SEULE côté finance.
// Aucune modification possible : la configuration reste réservée à l'administration.

const DAYS = [
  { key: 'monday', label: 'Lundi' },
  { key: 'tuesday', label: 'Mardi' },
  { key: 'wednesday', label: 'Mercredi' },
  { key: 'thursday', label: 'Jeudi' },
  { key: 'friday', label: 'Vendredi' },
  { key: 'saturday', label: 'Samedi' },
];

const SUBJECT_COLORS = [
  'bg-blue-100 border-blue-300 text-blue-800',
  'bg-green-100 border-green-300 text-green-800',
  'bg-purple-100 border-purple-300 text-purple-800',
  'bg-orange-100 border-orange-300 text-orange-800',
  'bg-pink-100 border-pink-300 text-pink-800',
  'bg-teal-100 border-teal-300 text-teal-800',
  'bg-indigo-100 border-indigo-300 text-indigo-800',
  'bg-amber-100 border-amber-300 text-amber-800',
  'bg-rose-100 border-rose-300 text-rose-800',
  'bg-cyan-100 border-cyan-300 text-cyan-800',
];

const hhmm = (t) => (t ? String(t).slice(0, 5) : '');

export default function TimetablesPage() {
  const { year } = useYear();
  const dashYear = toDashYear(year);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState('');

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year]);

  const load = async () => {
    setLoading(true);
    try {
      const data = await financeApi.listTimetables(dashYear);
      const list = Array.isArray(data) ? data : [];
      setClasses(list);
      // Sélectionner par défaut la première classe qui a un emploi du temps.
      const firstWithTt = list.find((c) => (c.timetable || []).length > 0) || list[0];
      setSelectedId((prev) => prev || firstWithTt?.id || '');
    } catch (e) {
      console.error(e);
      setClasses([]);
    } finally {
      setLoading(false);
    }
  };

  const selected = useMemo(
    () => classes.find((c) => c.id === selectedId) || null,
    [classes, selectedId]
  );

  // Couleur stable par matière pour la classe affichée.
  const subjectColorMap = useMemo(() => {
    const map = {};
    let i = 0;
    (selected?.timetable || []).forEach((s) => {
      const sid = s.subject?.id || s.subject_id;
      if (sid && !(sid in map)) {
        map[sid] = SUBJECT_COLORS[i % SUBJECT_COLORS.length];
        i += 1;
      }
    });
    return map;
  }, [selected]);

  // Créneaux (ordre + horaires) déduits de l'emploi du temps de la classe.
  const slots = useMemo(() => {
    const byOrder = new Map();
    (selected?.timetable || []).forEach((s) => {
      if (!byOrder.has(s.slot_order)) {
        byOrder.set(s.slot_order, {
          order: s.slot_order,
          start_time: hhmm(s.start_time),
          end_time: hhmm(s.end_time),
        });
      }
    });
    return [...byOrder.values()].sort((a, b) => a.order - b.order);
  }, [selected]);

  // Accès rapide à une cellule (jour + créneau).
  const cellAt = (dayKey, order) =>
    (selected?.timetable || []).find(
      (s) => s.day_of_week === dayKey && s.slot_order === order
    );

  return (
    <div className="space-y-6">
      <PageHeader
        icon={CalendarDays}
        title="Emplois du temps"
        subtitle="Consultation des emplois du temps de toutes les classes (lecture seule)"
        color="blue"
        onRefresh={load}
        loading={loading}
        actions={
          classes.length > 0 && (
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white"
            >
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {(c.timetable || []).length === 0 ? ' (non configuré)' : ''}
                </option>
              ))}
            </select>
          )
        }
      />

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : classes.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="Aucune classe"
          hint="Aucune classe n'est disponible pour l'année sélectionnée."
        />
      ) : slots.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="Emploi du temps non configuré"
          hint="Cette classe n'a pas encore d'emploi du temps. Il est défini par l'administration."
        />
      ) : (
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="p-2 text-xs font-semibold text-muted-foreground text-left w-24">Horaire</th>
                  {DAYS.map((day) => (
                    <th key={day.key} className="p-2 text-xs font-semibold text-center min-w-[150px]">
                      {day.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {slots.map((slot) => (
                  <tr key={slot.order} className="border-t">
                    <td className="p-2 align-top">
                      <div className="text-xs font-bold text-blue-700 bg-blue-50 rounded px-2 py-1 text-center">
                        {slot.start_time || '—'}
                        <br />
                        {slot.end_time || ''}
                      </div>
                    </td>
                    {DAYS.map((day) => {
                      const cell = cellAt(day.key, slot.order);
                      const sid = cell?.subject?.id || cell?.subject_id;
                      const color = sid ? subjectColorMap[sid] || 'bg-gray-50 border-gray-200' : '';
                      return (
                        <td key={day.key} className="p-1 align-top">
                          <div
                            className={`border rounded-lg p-2 min-h-[80px] ${
                              cell ? color : 'bg-gray-50/50 border-dashed border-gray-200'
                            }`}
                          >
                            {cell ? (
                              <div className="space-y-1">
                                <div className="text-xs font-semibold leading-tight">
                                  {cell.subject?.name || '—'}
                                </div>
                                {cell.teacher && (
                                  <div className="flex items-center gap-1 text-[11px] opacity-80">
                                    <User className="w-3 h-3 shrink-0" />
                                    <span className="truncate">
                                      {cell.teacher.first_name} {cell.teacher.last_name}
                                    </span>
                                  </div>
                                )}
                                {cell.room && (
                                  <div className="flex items-center gap-1 text-[11px] opacity-80">
                                    <MapPin className="w-3 h-3 shrink-0" />
                                    <span className="truncate">{cell.room}</span>
                                  </div>
                                )}
                                <div className="flex items-center gap-1 text-[10px] opacity-60">
                                  <Clock className="w-3 h-3 shrink-0" />
                                  {hhmm(cell.start_time)}–{hhmm(cell.end_time)}
                                </div>
                              </div>
                            ) : (
                              <span className="text-[11px] text-gray-400">—</span>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
