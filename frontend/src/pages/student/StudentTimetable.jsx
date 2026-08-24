import { useCallback, useState, useEffect } from 'react';
import { Calendar, Clock, User, MapPin } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card';
import { supabase } from '../../lib/supabase';

const DAYS = [
  { key: 'monday', label: 'Lundi', short: 'Lun' },
  { key: 'tuesday', label: 'Mardi', short: 'Mar' },
  { key: 'wednesday', label: 'Mercredi', short: 'Mer' },
  { key: 'thursday', label: 'Jeudi', short: 'Jeu' },
  { key: 'friday', label: 'Vendredi', short: 'Ven' },
  { key: 'saturday', label: 'Samedi', short: 'Sam' },
];

const SUBJECT_COLORS = [
  { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', dot: 'bg-blue-500' },
  { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700', dot: 'bg-green-500' },
  { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700', dot: 'bg-purple-500' },
  { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', dot: 'bg-orange-500' },
  { bg: 'bg-pink-50', border: 'border-pink-200', text: 'text-pink-700', dot: 'bg-pink-500' },
  { bg: 'bg-teal-50', border: 'border-teal-200', text: 'text-teal-700', dot: 'bg-teal-500' },
  { bg: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo-700', dot: 'bg-indigo-500' },
  { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', dot: 'bg-amber-500' },
  { bg: 'bg-rose-50', border: 'border-rose-200', text: 'text-rose-700', dot: 'bg-rose-500' },
  { bg: 'bg-cyan-50', border: 'border-cyan-200', text: 'text-cyan-700', dot: 'bg-cyan-500' },
];

const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const StudentTimetable = () => {
  const [timetable, setTimetable] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeDay, setActiveDay] = useState(null);
  const [error, setError] = useState('');

  const fetchTimetable = useCallback(async () => {
    try {
      setError('');
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const res = await fetch(`${apiUrl}/api/students/me/timetable`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json().catch(() => ([]));
      if (!res.ok) throw new Error(data?.error || 'Impossible de charger ton emploi du temps.');
      setTimetable(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error fetching timetable:', error);
      setError(error?.message || 'Impossible de charger ton emploi du temps.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const today = dayNames[new Date().getDay()];
    setActiveDay(today === 'sunday' ? 'monday' : today);
    fetchTimetable();
  }, [fetchTimetable]);

  // Build color map by subject
  const subjectColorMap = {};
  const uniqueSubjects = [...new Set(timetable.map(s => s.subject?.id).filter(Boolean))];
  uniqueSubjects.forEach((id, i) => {
    subjectColorMap[id] = SUBJECT_COLORS[i % SUBJECT_COLORS.length];
  });

  // Group by day
  const byDay = {};
  DAYS.forEach(d => { byDay[d.key] = []; });
  timetable.forEach(slot => {
    if (byDay[slot.day_of_week]) {
      byDay[slot.day_of_week].push(slot);
    }
  });

  // Get today's day name
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const todayKey = dayNames[new Date().getDay()];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="mx-auto max-w-xl border-red-200 bg-red-50">
        <CardContent className="space-y-3 p-6 text-center">
          <p className="font-semibold text-red-800">Impossible de charger ton emploi du temps</p>
          <p className="text-sm text-red-700">{error}</p>
          <button type="button" onClick={fetchTimetable} className="rounded-xl bg-red-700 px-4 py-2 text-sm font-semibold text-white">Réessayer</button>
        </CardContent>
      </Card>
    );
  }

  if (timetable.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Calendar className="w-6 h-6" /> Mon emploi
          </h1>
          <p className="text-muted-foreground mt-1">Mes cours de la semaine</p>
        </div>
        <Card>
          <CardContent className="p-12 text-center">
            <Calendar className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-lg font-medium text-muted-foreground">Aucun emploi du temps configuré</p>
            <p className="text-sm text-muted-foreground mt-1">L'administration n'a pas encore créé l'emploi du temps de ta classe.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const activeDaySlots = byDay[activeDay] || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Calendar className="w-6 h-6" /> Mon emploi
        </h1>
        <p className="text-muted-foreground mt-1">Mes cours de la semaine</p>
      </div>

      {/* Day tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {DAYS.map(day => {
          const isToday = day.key === todayKey;
          const isActive = day.key === activeDay;
          const slotCount = byDay[day.key]?.length || 0;

          return (
            <button
              key={day.key}
              onClick={() => setActiveDay(day.key)}
              className={`flex-shrink-0 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                isActive
                  ? 'bg-primary text-primary-foreground shadow-md'
                  : isToday
                  ? 'bg-primary/10 text-primary border border-primary/30'
                  : 'bg-muted/50 text-muted-foreground hover:bg-muted'
              }`}
            >
              <span className="hidden sm:inline">{day.label}</span>
              <span className="sm:hidden">{day.short}</span>
              {slotCount > 0 && (
                <span className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full ${
                  isActive ? 'bg-white/20' : 'bg-muted-foreground/10'
                }`}>
                  {slotCount}
                </span>
              )}
              {isToday && !isActive && (
                <span className="ml-1 text-[10px]">●</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Day schedule */}
      <div key={activeDay}>
        {activeDaySlots.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <p className="text-muted-foreground">Pas de cours ce jour</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {activeDaySlots.map((slot, idx) => {
              const colors = subjectColorMap[slot.subject?.id] || SUBJECT_COLORS[0];
              const subjectName = slot.subject?.name || 'Matière libre';
              const teacherName = slot.teacher ? `${slot.teacher.first_name} ${slot.teacher.last_name}` : null;

              return (
                <div
                  key={slot.id || idx}
                >
                  <div className={`flex gap-4 p-4 rounded-xl border ${colors.bg} ${colors.border}`}>
                    {/* Time column */}
                    <div className="flex-shrink-0 text-center min-w-[60px]">
                      <p className={`text-sm font-bold ${colors.text}`}>
                        {slot.start_time?.slice(0, 5)}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {slot.end_time?.slice(0, 5)}
                      </p>
                    </div>

                    {/* Divider */}
                    <div className="flex flex-col items-center">
                      <div className={`w-3 h-3 rounded-full ${colors.dot}`}></div>
                      <div className={`w-0.5 flex-1 ${colors.dot} opacity-30`}></div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <p className={`font-semibold ${colors.text}`}>{subjectName}</p>
                      <div className="flex flex-wrap gap-3 mt-1.5 text-xs text-muted-foreground">
                        {teacherName && (
                          <span className="flex items-center gap-1">
                            <User className="w-3 h-3" /> {teacherName}
                          </span>
                        )}
                        {slot.room && (
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" /> {slot.room}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {(() => {
                            const [sh, sm] = (slot.start_time || '').split(':').map(Number);
                            const [eh, em] = (slot.end_time || '').split(':').map(Number);
                            const dur = (eh * 60 + em) - (sh * 60 + sm);
                            return dur > 0 ? `${Math.floor(dur / 60)}h${dur % 60 > 0 ? (dur % 60 + 'min') : ''}` : '';
                          })()}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Legend */}
      {uniqueSubjects.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-medium text-muted-foreground mb-2">Matières</p>
            <div className="flex flex-wrap gap-2">
              {uniqueSubjects.map(id => {
                const slot = timetable.find(s => s.subject?.id === id);
                const colors = subjectColorMap[id];
                return (
                  <span key={id} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${colors.bg} ${colors.text}`}>
                    <span className={`w-2 h-2 rounded-full ${colors.dot}`}></span>
                    {slot?.subject?.name}
                  </span>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default StudentTimetable;
