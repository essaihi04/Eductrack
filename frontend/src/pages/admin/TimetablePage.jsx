import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Plus, Trash2, Copy, Clock } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card';

const DAYS = [
  { key: 'monday', label: 'Lundi' },
  { key: 'tuesday', label: 'Mardi' },
  { key: 'wednesday', label: 'Mercredi' },
  { key: 'thursday', label: 'Jeudi' },
  { key: 'friday', label: 'Vendredi' },
  { key: 'saturday', label: 'Samedi' },
];

const DEFAULT_SLOTS = [
  { start_time: '08:00', end_time: '10:00' },
  { start_time: '10:00', end_time: '12:00' },
  { start_time: '14:00', end_time: '16:00' },
  { start_time: '16:00', end_time: '18:00' },
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

const TimetablePage = () => {
  const { classId } = useParams();
  const navigate = useNavigate();
  const [className, setClassName] = useState('');
  const [subjects, setSubjects] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [classTeacherIds, setClassTeacherIds] = useState([]);
  const [grid, setGrid] = useState({});
  const [timeSlots, setTimeSlots] = useState([...DEFAULT_SLOTS]);
  const [perDayTimes, setPerDayTimes] = useState(false);
  const [dayTimes, setDayTimes] = useState({}); // { [dayKey]: [{ start_time, end_time }] }
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copyFromDay, setCopyFromDay] = useState('');

  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';

  const getToken = async () => {
    const { supabase } = await import('../../lib/supabase');
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token;
  };

  const subjectColorMap = {};
  subjects.forEach((s, i) => {
    subjectColorMap[s.id] = SUBJECT_COLORS[i % SUBJECT_COLORS.length];
  });

  // Profs candidats : on part des profs ASSIGNÉS à cette classe (class_teachers).
  // Si aucun prof n'est assigné à la classe, on retombe sur tous les profs de l'école.
  const classScopedTeachers = () => {
    if (classTeacherIds.length === 0) return teachers;
    const scoped = teachers.filter(t => classTeacherIds.includes(t.id));
    return scoped.length > 0 ? scoped : teachers;
  };

  // Profs autorisés pour une matière donnée : profs de la classe qui enseignent cette
  // matière (via teacher_subjects). Sans matière choisie, on montre les profs de la classe.
  // On garde toujours le prof déjà sélectionné, même s'il ne correspond plus, pour ne
  // pas perdre la donnée existante.
  const teachersForSubject = (subjectId, selectedTeacherId) => {
    const pool = classScopedTeachers();
    if (!subjectId) return pool;
    const matching = pool.filter(t => Array.isArray(t.subject_ids) && t.subject_ids.includes(subjectId));
    if (selectedTeacherId && !matching.some(t => t.id === selectedTeacherId)) {
      const sel = teachers.find(t => t.id === selectedTeacherId);
      if (sel) return [sel, ...matching];
    }
    return matching;
  };

  // Horaire effectif d'un créneau pour un jour donné : si les horaires par jour
  // sont activés et définis, on les utilise ; sinon on retombe sur le modèle commun.
  const slotTime = (dayKey, idx) => {
    if (perDayTimes && dayTimes[dayKey] && dayTimes[dayKey][idx]) return dayTimes[dayKey][idx];
    return timeSlots[idx] || { start_time: '08:00', end_time: '10:00' };
  };

  useEffect(() => {
    fetchData();
  }, [classId]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const token = await getToken();

      const [classRes, subjectsRes, teachersRes, classTeachersRes, timetableRes] = await Promise.all([
        fetch(`${apiUrl}/api/admin/classes`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${apiUrl}/api/admin/subjects`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${apiUrl}/api/admin/teachers`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${apiUrl}/api/admin/classes/${classId}/teachers`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${apiUrl}/api/admin/classes/${classId}/timetable`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      const classesData = await classRes.json();
      const cls = (Array.isArray(classesData) ? classesData : []).find(c => c.id === classId);
      setClassName(cls?.name || 'Classe');

      const subjectsData = await subjectsRes.json();
      setSubjects(Array.isArray(subjectsData) ? subjectsData : []);

      const teachersData = await teachersRes.json();
      setTeachers(Array.isArray(teachersData) ? teachersData : []);

      // Profs assignés à CETTE classe (pour ne proposer qu'eux dans l'emploi du temps)
      const classTeachersData = await classTeachersRes.json();
      setClassTeacherIds(
        (Array.isArray(classTeachersData) ? classTeachersData : [])
          .map(r => r.teacher_id)
          .filter(Boolean)
      );

      const timetableData = await timetableRes.json();

      // Build grid from existing data
      if (Array.isArray(timetableData) && timetableData.length > 0) {
        const newGrid = {};
        const slotsFromData = new Set();

        timetableData.forEach(slot => {
          const key = `${slot.day_of_week}_${slot.slot_order}`;
          newGrid[key] = {
            subject_id: slot.subject_id || slot.subject?.id || '',
            teacher_id: slot.teacher_id || slot.teacher?.id || '',
            room: slot.room || '',
          };
          slotsFromData.add(JSON.stringify({ start_time: slot.start_time?.slice(0, 5), end_time: slot.end_time?.slice(0, 5) }));
        });

        // Reconstruct time slots from data, par modèle commun + horaires par jour
        const maxSlotOrder = Math.max(...timetableData.map(s => s.slot_order));
        const template = [];
        const perDay = {};
        let differs = false;
        for (let i = 1; i <= maxSlotOrder; i++) {
          const anyRow = timetableData.find(s => s.slot_order === i);
          const tStart = anyRow?.start_time?.slice(0, 5) || DEFAULT_SLOTS[i - 1]?.start_time || '08:00';
          const tEnd = anyRow?.end_time?.slice(0, 5) || DEFAULT_SLOTS[i - 1]?.end_time || '10:00';
          template.push({ start_time: tStart, end_time: tEnd });
          DAYS.forEach(day => {
            const row = timetableData.find(s => s.slot_order === i && s.day_of_week === day.key);
            const st = row?.start_time?.slice(0, 5) || tStart;
            const en = row?.end_time?.slice(0, 5) || tEnd;
            (perDay[day.key] = perDay[day.key] || [])[i - 1] = { start_time: st, end_time: en };
            if (row && (st !== tStart || en !== tEnd)) differs = true;
          });
        }
        if (template.length > 0) setTimeSlots(template);
        setDayTimes(perDay);
        if (differs) setPerDayTimes(true);
        setGrid(newGrid);
      }
    } catch (error) {
      console.error('Error fetching timetable data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCellChange = (dayKey, slotIdx, field, value) => {
    const key = `${dayKey}_${slotIdx + 1}`;
    setGrid(prev => {
      const next = { ...prev[key], [field]: value };
      // À la sélection d'une matière : on aligne le prof sur ceux qui l'enseignent
      // PARMI les profs assignés à cette classe.
      if (field === 'subject_id') {
        const eligible = classScopedTeachers().filter(t => Array.isArray(t.subject_ids) && t.subject_ids.includes(value));
        if (!value) {
          next.teacher_id = '';
        } else if (eligible.length === 1) {
          // un seul prof pour cette matière → auto-sélection
          next.teacher_id = eligible[0].id;
        } else if (next.teacher_id && !eligible.some(t => t.id === next.teacher_id)) {
          // le prof déjà choisi n'enseigne pas cette matière → on le retire
          next.teacher_id = '';
        }
      }
      return { ...prev, [key]: next };
    });
    setSaved(false);
  };

  const handleTimeChange = (slotIdx, field, value) => {
    setTimeSlots(prev => prev.map((s, i) => i === slotIdx ? { ...s, [field]: value } : s));
    setSaved(false);
  };

  // Modifier l'horaire d'un créneau pour UN jour précis (horaires par jour)
  const handleDayTimeChange = (dayKey, slotIdx, field, value) => {
    setDayTimes(prev => {
      const base = prev[dayKey] ? prev[dayKey].map(s => ({ ...s })) : [];
      while (base.length < timeSlots.length) base.push({ ...timeSlots[base.length] });
      base[slotIdx] = { ...base[slotIdx], [field]: value };
      return { ...prev, [dayKey]: base };
    });
    setSaved(false);
  };

  // Active/désactive les horaires spécifiques par jour. À l'activation, on initialise
  // chaque jour avec le modèle commun pour que l'admin parte d'une base cohérente.
  const togglePerDayTimes = () => {
    setPerDayTimes(prev => {
      const next = !prev;
      if (next) {
        setDayTimes(dt => {
          const copy = { ...dt };
          DAYS.forEach(day => {
            if (!copy[day.key] || copy[day.key].length < timeSlots.length) {
              copy[day.key] = timeSlots.map((s, i) => copy[day.key]?.[i] || { ...s });
            }
          });
          return copy;
        });
      }
      return next;
    });
    setSaved(false);
  };

  const addTimeSlot = () => {
    const last = timeSlots[timeSlots.length - 1];
    const newSlot = { start_time: last?.end_time || '08:00', end_time: '18:00' };
    setTimeSlots([...timeSlots, newSlot]);
    setDayTimes(prev => {
      const copy = { ...prev };
      Object.keys(copy).forEach(k => { copy[k] = [...copy[k], { ...newSlot }]; });
      return copy;
    });
  };

  const removeTimeSlot = (idx) => {
    if (timeSlots.length <= 1) return;
    setTimeSlots(prev => prev.filter((_, i) => i !== idx));
    setDayTimes(prev => {
      const copy = { ...prev };
      Object.keys(copy).forEach(k => { copy[k] = copy[k].filter((_, i) => i !== idx); });
      return copy;
    });
    // Remove grid entries for this slot
    const newGrid = {};
    Object.entries(grid).forEach(([key, val]) => {
      const parts = key.split('_');
      const slotOrder = parseInt(parts[parts.length - 1]);
      if (slotOrder !== idx + 1) {
        const newOrder = slotOrder > idx + 1 ? slotOrder - 1 : slotOrder;
        newGrid[`${parts.slice(0, -1).join('_')}_${newOrder}`] = val;
      }
    });
    setGrid(newGrid);
  };

  const copyDay = (fromDay) => {
    if (!fromDay) return;
    const newGrid = { ...grid };
    DAYS.forEach(day => {
      if (day.key !== fromDay) {
        for (let i = 1; i <= timeSlots.length; i++) {
          const srcKey = `${fromDay}_${i}`;
          const dstKey = `${day.key}_${i}`;
          if (grid[srcKey]) {
            newGrid[dstKey] = { ...grid[srcKey] };
          }
        }
      }
    });
    setGrid(newGrid);
    // En mode horaires par jour, on copie aussi les horaires du jour source.
    if (perDayTimes && dayTimes[fromDay]) {
      setDayTimes(prev => {
        const copy = { ...prev };
        DAYS.forEach(day => {
          if (day.key !== fromDay) copy[day.key] = dayTimes[fromDay].map(s => ({ ...s }));
        });
        return copy;
      });
    }
    setCopyFromDay('');
    setSaved(false);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const token = await getToken();

      const slots = [];
      DAYS.forEach(day => {
        timeSlots.forEach((_, idx) => {
          const key = `${day.key}_${idx + 1}`;
          const cell = grid[key];
          if (cell?.subject_id) {
            const ts = slotTime(day.key, idx);
            slots.push({
              day_of_week: day.key,
              slot_order: idx + 1,
              start_time: ts.start_time,
              end_time: ts.end_time,
              subject_id: cell.subject_id || null,
              teacher_id: cell.teacher_id || null,
              room: cell.room || null,
            });
          }
        });
      });

      const res = await fetch(`${apiUrl}/api/admin/classes/${classId}/timetable`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ slots }),
      });

      if (!res.ok) throw new Error('Erreur de sauvegarde');
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (error) {
      console.error('Error saving timetable:', error);
      alert('Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/classes')} className="p-2 hover:bg-muted rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold">Emploi du temps — {className}</h1>
            <p className="text-sm text-muted-foreground">Configurez l'emploi du temps hebdomadaire de la classe</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={copyFromDay}
            onChange={(e) => setCopyFromDay(e.target.value)}
            className="text-sm border rounded-lg px-3 py-2"
          >
            <option value="">Copier un jour vers tous...</option>
            {DAYS.map(d => <option key={d.key} value={d.key}>{d.label}</option>)}
          </select>
          {copyFromDay && (
            <button
              onClick={() => copyDay(copyFromDay)}
              className="flex items-center gap-1 px-3 py-2 text-sm bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200"
            >
              <Copy className="w-4 h-4" /> Appliquer
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Sauvegarde...' : saved ? 'Sauvegardé ✓' : 'Sauvegarder'}
          </button>
        </div>
      </div>

      {/* Time slots config */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="w-4 h-4" /> Créneaux horaires {perDayTimes && <span className="text-xs font-normal text-muted-foreground">(modèle commun — ajustable par jour dans la grille)</span>}
              </CardTitle>
              <CardDescription>Définissez les horaires des séances de la journée</CardDescription>
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <input type="checkbox" checked={perDayTimes} onChange={togglePerDayTimes} className="rounded" />
              Horaires différents selon les jours
            </label>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3 items-end">
            {timeSlots.map((slot, idx) => (
              <div key={idx} className="flex items-center gap-1 p-2 border rounded-lg bg-muted/30">
                <span className="text-xs font-bold text-muted-foreground w-6">{idx + 1}</span>
                <input
                  type="time"
                  value={slot.start_time}
                  onChange={(e) => handleTimeChange(idx, 'start_time', e.target.value)}
                  className="text-sm border rounded px-2 py-1 w-28"
                />
                <span className="text-xs text-muted-foreground">→</span>
                <input
                  type="time"
                  value={slot.end_time}
                  onChange={(e) => handleTimeChange(idx, 'end_time', e.target.value)}
                  className="text-sm border rounded px-2 py-1 w-28"
                />
                {timeSlots.length > 1 && (
                  <button onClick={() => removeTimeSlot(idx)} className="p-1 text-red-500 hover:bg-red-50 rounded">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
            <button
              onClick={addTimeSlot}
              className="flex items-center gap-1 px-3 py-2 text-sm border-dashed border-2 rounded-lg text-muted-foreground hover:bg-muted/50"
            >
              <Plus className="w-4 h-4" /> Ajouter
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Timetable Grid */}
      <Card>
        <CardContent className="p-4">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="p-2 text-xs font-semibold text-muted-foreground text-left w-24">Horaire</th>
                  {DAYS.map(day => (
                    <th key={day.key} className="p-2 text-xs font-semibold text-center min-w-[150px]">
                      {day.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {timeSlots.map((ts, slotIdx) => (
                  <tr key={slotIdx} className="border-t">
                    <td className="p-2 align-top">
                      <div className="text-xs font-bold text-blue-700 bg-blue-50 rounded px-2 py-1 text-center">
                        {perDayTimes ? (
                          <>Séance<br />{slotIdx + 1}</>
                        ) : (
                          <>{ts.start_time}<br />{ts.end_time}</>
                        )}
                      </div>
                    </td>
                    {DAYS.map(day => {
                      const key = `${day.key}_${slotIdx + 1}`;
                      const cell = grid[key] || {};
                      const subjectColor = cell.subject_id ? subjectColorMap[cell.subject_id] || 'bg-gray-50 border-gray-200' : '';
                      const dt = slotTime(day.key, slotIdx);
                      const subjectTeachers = teachersForSubject(cell.subject_id, cell.teacher_id);
                      return (
                        <td key={day.key} className="p-1 align-top">
                          <div className={`border rounded-lg p-2 space-y-1.5 min-h-[80px] ${cell.subject_id ? subjectColor : 'bg-gray-50/50 border-dashed border-gray-200'}`}>
                            {perDayTimes && (
                              <div className="flex items-center gap-0.5">
                                <input
                                  type="time"
                                  value={dt.start_time}
                                  onChange={(e) => handleDayTimeChange(day.key, slotIdx, 'start_time', e.target.value)}
                                  className="w-full text-[10px] border rounded px-1 py-0.5 bg-white/80"
                                />
                                <input
                                  type="time"
                                  value={dt.end_time}
                                  onChange={(e) => handleDayTimeChange(day.key, slotIdx, 'end_time', e.target.value)}
                                  className="w-full text-[10px] border rounded px-1 py-0.5 bg-white/80"
                                />
                              </div>
                            )}
                            <select
                              value={cell.subject_id || ''}
                              onChange={(e) => handleCellChange(day.key, slotIdx, 'subject_id', e.target.value)}
                              className="w-full text-xs border rounded px-1.5 py-1 bg-white/80"
                            >
                              <option value="">— Matière —</option>
                              {subjects.map(s => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                              ))}
                            </select>
                            <select
                              value={cell.teacher_id || ''}
                              onChange={(e) => handleCellChange(day.key, slotIdx, 'teacher_id', e.target.value)}
                              disabled={!cell.subject_id}
                              title={!cell.subject_id ? 'Choisissez d\'abord une matière' : undefined}
                              className="w-full text-xs border rounded px-1.5 py-1 bg-white/80 disabled:opacity-50"
                            >
                              <option value="">— Prof —</option>
                              {subjectTeachers.map(t => (
                                <option key={t.id} value={t.id}>{t.first_name} {t.last_name}</option>
                              ))}
                            </select>
                            <input
                              type="text"
                              placeholder="Salle"
                              value={cell.room || ''}
                              onChange={(e) => handleCellChange(day.key, slotIdx, 'room', e.target.value)}
                              className="w-full text-xs border rounded px-1.5 py-1 bg-white/80"
                            />
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default TimetablePage;
