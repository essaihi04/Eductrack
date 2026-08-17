import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  CalendarClock, ChevronLeft, ChevronRight, RefreshCw, CalendarX2,
  CheckCircle2, CircleSlash, Radio, Clock, ArrowRight,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';

// --- Dates ------------------------------------------------------------------
// Composantes locales : toISOString() renvoie la veille en UTC+1 entre minuit
// et 1h du matin, et la page affichait alors le mauvais jour.
const localISO = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (iso, n) => {
  const [y, m, d] = iso.split('-').map(Number);
  const x = new Date(y, m - 1, d + n);
  return localISO(x);
};
const prettyDate = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
};

// "HH:MM:SS" → minutes depuis minuit
const toMin = (t) => {
  if (!t) return null;
  const [h, m] = String(t).split(':').map(Number);
  return h * 60 + (m || 0);
};
const hhmm = (t) => (t ? String(t).slice(0, 5) : '');

// --- États d'un créneau -----------------------------------------------------
// Un créneau non suivi ne veut pas dire la même chose selon qu'il est passé,
// en cours ou à venir : c'est toute la lecture de la journée.
const SLOT_STATES = {
  tracked:  { label: 'Suivie',     cls: 'bg-teal-500/90 text-white border-teal-600',            dot: 'bg-teal-500' },
  live:     { label: 'En cours',   cls: 'bg-amber-400 text-amber-950 border-amber-500',         dot: 'bg-amber-400' },
  missed:   { label: 'Non suivie', cls: 'bg-rose-500/90 text-white border-rose-600',            dot: 'bg-rose-500' },
  upcoming: { label: 'À venir',    cls: 'bg-gray-100 text-gray-600 border-gray-300',            dot: 'bg-gray-300' },
};

const slotState = (slot, { isToday, isPast, nowMin }) => {
  if (slot.tracked) return 'tracked';
  if (isPast) return 'missed';
  if (!isToday) return 'upcoming'; // jour futur
  const s = toMin(slot.start_time);
  const e = toMin(slot.end_time);
  if (s == null || e == null) return 'upcoming';
  if (nowMin >= s && nowMin < e) return 'live';
  return nowMin >= e ? 'missed' : 'upcoming';
};

// --- Petits composants ------------------------------------------------------
const StatTile = ({ value, label, tone = 'ink' }) => {
  const tones = {
    ink: 'text-gray-800', teal: 'text-teal-600', rose: 'text-rose-600', amber: 'text-amber-600',
  };
  return (
    <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 min-w-[112px]">
      <div className={`text-2xl font-bold tabular-nums leading-none ${tones[tone]}`}>{value}</div>
      <div className="text-xs text-gray-500 mt-1.5">{label}</div>
    </div>
  );
};

const Legend = () => (
  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-gray-600">
    {Object.entries(SLOT_STATES).map(([k, s]) => (
      <span key={k} className="flex items-center gap-1.5">
        <span className={`w-2.5 h-2.5 rounded-sm ${s.dot}`} />{s.label}
      </span>
    ))}
    <span className="flex items-center gap-1.5">
      <span className="w-2.5 h-2.5 rounded-sm border border-dashed border-gray-400" />Sans emploi du temps
    </span>
  </div>
);

export default function CockpitJourneePage() {
  const [date, setDate] = useState(() => localISO(new Date()));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [jumped, setJumped] = useState(null); // date d'origine si on a sauté au dernier jour utile
  const firstLoad = useRef(true);

  // Heure courante, rafraîchie chaque minute pour la ligne « maintenant ».
  const [nowMin, setNowMin] = useState(() => {
    const n = new Date();
    return n.getHours() * 60 + n.getMinutes();
  });
  useEffect(() => {
    const t = setInterval(() => {
      const n = new Date();
      setNowMin(n.getHours() * 60 + n.getMinutes());
    }, 60_000);
    return () => clearInterval(t);
  }, []);

  const load = useCallback(async (d) => {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${apiUrl}/api/admin/dashboard/timetable-today?date=${d}`, {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Chargement impossible');
      const json = await res.json();

      // Au tout premier affichage seulement : si le jour du jour est vide mais
      // qu'un jour plus ancien contient des séances, on y va — une page vide à
      // l'ouverture passe pour un outil cassé. Jamais après, sinon la navigation
      // manuelle serait détournée.
      const empty = !(json.classes || []).length;
      if (firstLoad.current && empty && json.lastActiveDate && json.lastActiveDate !== d) {
        firstLoad.current = false;
        setJumped(d);
        setDate(json.lastActiveDate);
        return;
      }
      firstLoad.current = false;
      setData(json);
    } catch (e) {
      setError(e.message);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(date); }, [date, load]);

  const todayISO = localISO(new Date());
  const isToday = date === todayISO;
  const isPast = date < todayISO;

  const classes = data?.classes || [];
  const orphans = data?.classesWithoutTimetable || [];

  // Fenêtre horaire de la journée, déduite des créneaux réels : inutile
  // d'afficher 00h–24h quand les cours vont de 8h à 18h.
  const [dayStart, dayEnd] = useMemo(() => {
    const all = classes.flatMap(c => c.slots || []);
    const starts = all.map(s => toMin(s.start_time)).filter(v => v != null);
    const ends = all.map(s => toMin(s.end_time)).filter(v => v != null);
    if (!starts.length) return [8 * 60, 18 * 60];
    return [Math.min(...starts) - 15, Math.max(...ends) + 15];
  }, [classes]);

  const span = Math.max(dayEnd - dayStart, 60);
  const pct = (min) => ((min - dayStart) / span) * 100;

  const hourMarks = useMemo(() => {
    const marks = [];
    for (let h = Math.ceil(dayStart / 60); h * 60 <= dayEnd; h++) marks.push(h);
    return marks;
  }, [dayStart, dayEnd]);

  const showNow = isToday && nowMin >= dayStart && nowMin <= dayEnd;
  const g = data?.globalStats;

  return (
    <div className="p-4 md:p-6 space-y-5">

      {/* En-tête + navigation par jour */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <CalendarClock className="w-6 h-6 text-teal-600" />
            Journée
          </h1>
          <p className="text-sm text-gray-500 mt-0.5 capitalize">{prettyDate(date)}</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setDate(addDays(date, -1))}
            className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 text-gray-700"
            aria-label="Jour précédent"
          ><ChevronLeft className="w-4 h-4" /></button>

          <input
            type="date"
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700"
          />

          <button
            onClick={() => setDate(addDays(date, 1))}
            className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 text-gray-700"
            aria-label="Jour suivant"
          ><ChevronRight className="w-4 h-4" /></button>

          <button
            onClick={() => setDate(todayISO)}
            disabled={isToday}
            className="px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40"
          >Aujourd'hui</button>

          <button
            onClick={() => load(date)}
            className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 text-gray-700"
            aria-label="Rafraîchir"
          ><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button>
        </div>
      </div>

      {jumped && date !== jumped && (
        <div className="flex items-center gap-2 text-sm bg-amber-50 border border-amber-200 text-amber-900 rounded-lg px-4 py-2.5">
          <Clock className="w-4 h-4 shrink-0" />
          <span>
            Aucun cours le {prettyDate(jumped)}. Affichage du dernier jour avec des séances.
          </span>
          <button onClick={() => { setJumped(null); setDate(jumped); }} className="ml-auto underline shrink-0">
            Voir quand même
          </button>
        </div>
      )}

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-lg px-4 py-3 text-sm">{error}</div>
      )}

      {/* Compteurs */}
      {g && (
        <div className="flex flex-wrap gap-2.5">
          <StatTile value={g.totalSlots} label="créneaux" />
          <StatTile value={g.trackedSlots} label="suivis" tone="teal" />
          <StatTile value={g.untrackedSlots} label="non suivis" tone="rose" />
          <StatTile value={g.classesWithTimetable} label="classes à l'emploi du temps" />
          <StatTile value={g.classesWithoutTimetable ?? orphans.length} label="classes sans horaire" tone="amber" />
          {g.globalHealth != null && <StatTile value={`${g.globalHealth}`} label="santé moyenne" tone="teal" />}
        </div>
      )}

      <Legend />

      {/* Grille */}
      {loading && !data ? (
        <div className="py-20 text-center text-gray-400 text-sm">Chargement…</div>
      ) : !classes.length ? (
        <div className="py-16 text-center">
          <CalendarX2 className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-600 font-medium">Aucun cours programmé ce jour-là</p>
          <p className="text-sm text-gray-400 mt-1">
            Aucune des classes n'a de créneau à l'emploi du temps pour ce jour de la semaine.
          </p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <div className="min-w-[760px]">

              {/* Règle horaire */}
              <div className="relative h-8 border-b border-gray-200 bg-gray-50">
                <div className="absolute inset-y-0 left-0 w-40 border-r border-gray-200" />
                <div className="absolute inset-y-0 left-40 right-3">
                  {hourMarks.map(h => (
                    <div key={h} className="absolute top-0 bottom-0" style={{ left: `${pct(h * 60)}%` }}>
                      <div className="h-full border-l border-gray-200" />
                      <span className="absolute top-1.5 left-1 text-[10px] text-gray-400 tabular-nums">
                        {String(h).padStart(2, '0')}h
                      </span>
                    </div>
                  ))}
                  {showNow && (
                    <div className="absolute top-0 bottom-0 z-20" style={{ left: `${pct(nowMin)}%` }}>
                      <div className="h-full border-l-2 border-amber-500" />
                      <span className="absolute -top-0.5 -left-1 w-2 h-2 rounded-full bg-amber-500" />
                    </div>
                  )}
                </div>
              </div>

              {/* Une ligne par classe */}
              {classes.map(cls => (
                <div key={cls.id} className="relative flex border-b border-gray-100 last:border-b-0 hover:bg-gray-50/60">
                  <div className="w-40 shrink-0 px-3 py-3 border-r border-gray-200">
                    <div className="font-medium text-sm text-gray-800 truncate" title={cls.name}>{cls.name}</div>
                    <div className="text-[11px] text-gray-400 tabular-nums">
                      {cls.trackedCount}/{cls.totalSlots} suivis
                      {cls.avgHealth != null && ` · santé ${cls.avgHealth}`}
                    </div>
                  </div>

                  <div className="relative flex-1 mr-3 my-2" style={{ minHeight: 44 }}>
                    {/* Ligne « maintenant » répétée sur chaque rangée */}
                    {showNow && (
                      <div
                        className="absolute top-0 bottom-0 border-l-2 border-amber-500/40 z-0 pointer-events-none"
                        style={{ left: `${pct(nowMin)}%` }}
                      />
                    )}

                    {(cls.slots || []).map(slot => {
                      const s = toMin(slot.start_time);
                      const e = toMin(slot.end_time);
                      if (s == null || e == null) return null;
                      const state = slotState(slot, { isToday, isPast, nowMin });
                      const st = SLOT_STATES[state];
                      const width = Math.max(pct(e) - pct(s), 3.5);
                      return (
                        <div
                          key={slot.id}
                          className={`absolute top-0 h-full rounded-md border px-2 py-1 overflow-hidden z-10 ${st.cls} ${state === 'live' ? 'ring-2 ring-amber-300' : ''}`}
                          style={{ left: `${pct(s)}%`, width: `${width}%` }}
                          title={`${slot.subject?.name || 'Cours'} · ${hhmm(slot.start_time)}–${hhmm(slot.end_time)}${slot.room ? ` · ${slot.room}` : ''}\n${slot.teacher ? `${slot.teacher.first_name} ${slot.teacher.last_name}` : 'Professeur non assigné'}\n${st.label}`}
                        >
                          <div className="text-[11px] font-semibold leading-tight truncate">
                            {slot.subject?.name || 'Cours'}
                          </div>
                          <div className="text-[10px] opacity-90 leading-tight truncate tabular-nums">
                            {hhmm(slot.start_time)}–{hhmm(slot.end_time)}
                            {slot.teacher ? ` · ${slot.teacher.last_name}` : ''}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Classes sans emploi du temps — état explicite, pas une absence */}
      {orphans.length > 0 && (
        <details className="bg-white border border-dashed border-gray-300 rounded-xl">
          <summary className="cursor-pointer px-4 py-3 text-sm text-gray-700 flex items-center gap-2 select-none">
            <CircleSlash className="w-4 h-4 text-gray-400 shrink-0" />
            <span><strong className="tabular-nums">{orphans.length}</strong> classe{orphans.length > 1 ? 's' : ''} sans emploi du temps ce jour-là</span>
          </summary>
          <div className="px-4 pb-4 pt-1 grid gap-1.5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {orphans.map(c => (
              <Link
                key={c.id}
                to={`/classes/${c.id}/timetable`}
                className="group flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-gray-200 hover:border-teal-400 hover:bg-teal-50/40 text-sm"
              >
                <span className="truncate">
                  <span className="text-gray-800">{c.name}</span>
                  {c.level && <span className="text-gray-400 text-xs ml-1.5">{c.level}</span>}
                </span>
                <span className="text-teal-600 text-xs flex items-center gap-1 opacity-0 group-hover:opacity-100 shrink-0">
                  Saisir <ArrowRight className="w-3 h-3" />
                </span>
              </Link>
            ))}
          </div>
        </details>
      )}

      {/* Repères de lot : le survol enrichi et le détail au clic arrivent ensuite */}
      <p className="text-xs text-gray-400 flex items-center gap-1.5">
        <Radio className="w-3 h-3" />
        Lot 1 — la grille. Le survol enrichi (absents, à risque, prof) et le détail de séance suivront.
      </p>
    </div>
  );
}
