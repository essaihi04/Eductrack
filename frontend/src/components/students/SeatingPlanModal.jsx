import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  DndContext, DragOverlay, PointerSensor, TouchSensor, useSensor, useSensors,
  useDraggable, useDroppable, rectIntersection,
} from '@dnd-kit/core';
import { motion as Motion } from 'framer-motion';
import {
  X, Loader2, Wand2, Eraser, Check, UploadCloud, AlertTriangle, Armchair, Users, Printer,
} from 'lucide-react';
import { Avatar } from '../directory/ui';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { printSeatingPlan } from '../../lib/printSeatingPlan';

// ─────────────────────────────────────────────────────────────────────────────
// Plan de classe — vue 2D « de dessus » d'une salle : tableau + bureau du prof
// en haut, tables disposées en rangées, élèves placés sur leur chaise (photo).
// Tout se règle : élèves par table (défaut 2), rangées (défaut 4), tables par
// rangée. Glisser-déposer depuis la liste « non placés » ou d'une place à
// l'autre (échange automatique si occupée). Sauvegarde automatique (800ms).
// Persistance : class_seating_plans (ADD_CLASS_SEATING.sql).
// ─────────────────────────────────────────────────────────────────────────────

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const resolveAsset = (u) => (!u ? null : (u.startsWith('http') ? u : `${API_URL}${u.startsWith('/') ? '' : '/'}${u}`));
const fullName = (s) => `${s.first_name || ''} ${s.last_name || ''}`.trim();

async function api(path, options = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session?.access_token}`,
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// Ne garde que les affectations valides : siège dans les bornes de la config,
// élève encore dans la classe, un seul siège par élève.
const sanitizeAssignments = (cfg, asg, students) => {
  const valid = new Set(students.map((s) => s.id));
  const out = {};
  const seen = new Set();
  for (const [k, sid] of Object.entries(asg || {})) {
    const m = /^(\d+)-(\d+)-(\d+)$/.exec(k);
    if (!m) continue;
    if (+m[1] >= cfg.rows || +m[2] >= cfg.tablesPerRow || +m[3] >= cfg.seatsPerTable) continue;
    if (!valid.has(sid) || seen.has(sid)) continue;
    out[k] = sid;
    seen.add(sid);
  }
  return out;
};

// ── Élève sur une chaise (draggable) ─────────────────────────────────────────
function SeatOccupant({ seatKey, student }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `seatstu:${seatKey}`,
    data: { student, fromKey: seatKey },
  });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`flex flex-col items-center gap-0.5 cursor-grab active:cursor-grabbing touch-manipulation select-none ${isDragging ? 'opacity-30' : ''}`}
    >
      <Avatar name={fullName(student)} src={resolveAsset(student.avatar_url)} gender={student.gender} size="md" />
      <span className="text-[9px] leading-tight text-center max-w-[3.6rem] truncate font-medium">
        {student.first_name}
      </span>
    </div>
  );
}

// ── Une chaise / place (zone de dépôt) ───────────────────────────────────────
function Seat({ seatKey, student, onRemove, highlight }) {
  const { setNodeRef, isOver } = useDroppable({ id: `seat:${seatKey}` });
  return (
    <div
      ref={setNodeRef}
      className={[
        'relative w-[4.2rem] h-[4.6rem] rounded-lg flex items-center justify-center transition-all',
        student
          ? 'bg-white border border-amber-200 shadow-sm'
          : 'border-2 border-dashed border-amber-300/80 bg-amber-50/50',
        isOver ? 'ring-2 ring-indigo-400 bg-indigo-50 scale-105' : '',
        highlight ? 'ring-2 ring-amber-400' : '',
      ].join(' ')}
    >
      {student ? (
        <>
          <SeatOccupant seatKey={seatKey} student={student} />
          <button
            onClick={() => onRemove(seatKey)}
            className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-white border border-border text-muted-foreground
              hover:text-red-600 hover:border-red-300 flex items-center justify-center shadow-sm"
            aria-label={`Retirer ${fullName(student)}`}
          >
            <X className="w-2.5 h-2.5" />
          </button>
        </>
      ) : (
        <Armchair className="w-5 h-5 text-amber-300" />
      )}
    </div>
  );
}

// ── Panneau latéral « Non placés » (aussi zone de dépôt pour retirer) ────────
// Composant séparé : useDroppable doit être appelé DANS le DndContext.
function PoolPanel({ unplaced, draggedFromSeat }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'pool' });
  return (
    <div
      ref={setNodeRef}
      className={[
        'w-56 sm:w-64 border-l border-border bg-card flex flex-col transition-colors',
        isOver ? 'bg-red-50' : '',
      ].join(' ')}
    >
      <div className="px-3 py-2.5 border-b border-border flex items-center gap-2">
        <Users className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm font-medium">Non placés</span>
        <span className="ml-auto text-xs text-muted-foreground">{unplaced.length}</span>
      </div>
      <div className="flex-1 overflow-auto p-2 space-y-1.5">
        {isOver && draggedFromSeat && (
          <p className="text-[11px] text-red-600 font-medium text-center py-1">
            Déposer ici pour retirer de sa place
          </p>
        )}
        {unplaced.map((s) => <PoolStudent key={s.id} student={s} />)}
        {unplaced.length === 0 && (
          <p className="text-[11px] text-muted-foreground text-center py-6">
            Tous les élèves sont placés
            <Check className="w-4 h-4 text-emerald-500 mx-auto mt-1" />
          </p>
        )}
      </div>
      <p className="px-3 py-2 text-[10px] text-muted-foreground border-t border-border">
        Glissez un élève sur une chaise. Déposer sur une place occupée échange les deux élèves.
      </p>
    </div>
  );
}

// ── Élève non placé (draggable, dans le panneau latéral) ─────────────────────
function PoolStudent({ student, dimmed }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `pool:${student.id}`,
    data: { student, fromKey: null },
  });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={[
        'flex items-center gap-1.5 px-1.5 py-1 rounded-lg border border-border bg-card text-xs',
        'cursor-grab active:cursor-grabbing touch-manipulation select-none hover:border-indigo-300 hover:bg-indigo-50/50',
        isDragging ? 'opacity-30' : '',
        dimmed ? 'opacity-40' : '',
      ].join(' ')}
    >
      <Avatar name={fullName(student)} src={resolveAsset(student.avatar_url)} gender={student.gender} size="sm" />
      <span className="truncate min-w-0 leading-tight">
        {student.first_name} <span className="text-muted-foreground">{(student.last_name || '').charAt(0)}.</span>
      </span>
    </div>
  );
}

export default function SeatingPlanModal({ cls, students, onClose }) {
  const { school } = useAuth();
  const [loading, setLoading] = useState(true);
  const [printing, setPrinting] = useState(false);
  const [config, setConfig] = useState({ seatsPerTable: 2, rows: 4, tablesPerRow: 4 });
  const [assignments, setAssignments] = useState({});
  const [missingTable, setMissingTable] = useState(false);
  const [saveState, setSaveState] = useState('idle'); // idle | saving | saved | error
  const [saveError, setSaveError] = useState('');
  const [dragged, setDragged] = useState(null);       // { student, fromKey }
  const saveTimer = useRef(null);
  const loaded = useRef(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );

  const studentById = useMemo(() => {
    const m = {};
    students.forEach((s) => { m[s.id] = s; });
    return m;
  }, [students]);

  const placedIds = useMemo(() => new Set(Object.values(assignments)), [assignments]);
  const unplaced = useMemo(() => students.filter((s) => !placedIds.has(s.id)), [students, placedIds]);
  const totalSeats = config.rows * config.tablesPerRow * config.seatsPerTable;

  // Fermeture à la touche Échap.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Chargement du plan existant.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await api(`/api/admin/classes/${cls.id}/seating`);
        if (!alive) return;
        const cfg = {
          seatsPerTable: data.seats_per_table || 2,
          rows: data.rows || 4,
          tablesPerRow: data.tables_per_row || 4,
        };
        setConfig(cfg);
        setAssignments(sanitizeAssignments(cfg, data.assignments, students));
        setMissingTable(!!data.missing_table);
      } catch (e) {
        if (alive) { setSaveState('error'); setSaveError(e.message); }
      } finally {
        if (alive) { setLoading(false); loaded.current = true; }
      }
    })();
    return () => { alive = false; clearTimeout(saveTimer.current); };
  }, [cls.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sauvegarde automatique (800ms après le dernier changement).
  useEffect(() => {
    if (!loaded.current || loading) return;
    if (missingTable) return; // migration non exécutée → pas de persistance
    clearTimeout(saveTimer.current);
    setSaveState('saving');
    saveTimer.current = setTimeout(async () => {
      try {
        await api(`/api/admin/classes/${cls.id}/seating`, {
          method: 'PUT',
          body: JSON.stringify({
            seats_per_table: config.seatsPerTable,
            rows: config.rows,
            tables_per_row: config.tablesPerRow,
            assignments,
          }),
        });
        setSaveState('saved');
      } catch (e) {
        setSaveState('error');
        setSaveError(e.message);
      }
    }, 800);
    return () => clearTimeout(saveTimer.current);
  }, [config, assignments, cls.id, loading, missingTable]);

  // Changement de configuration : les places supprimées libèrent leurs élèves.
  const updateConfig = useCallback((patch) => {
    setConfig((prev) => {
      const next = { ...prev, ...patch };
      setAssignments((asg) => sanitizeAssignments(next, asg, students));
      return next;
    });
  }, [students]);

  const removeSeat = useCallback((seatKey) => {
    setAssignments((prev) => {
      const next = { ...prev };
      delete next[seatKey];
      return next;
    });
  }, []);

  // Placement automatique : remplit les places vides dans l'ordre de lecture
  // (rangée par rangée) avec les élèves non placés, dans l'ordre de la liste.
  const autoPlace = useCallback(() => {
    setAssignments((prev) => {
      const next = { ...prev };
      const queue = students.filter((s) => !new Set(Object.values(prev)).has(s.id));
      for (let r = 0; r < config.rows && queue.length; r++) {
        for (let t = 0; t < config.tablesPerRow && queue.length; t++) {
          for (let s = 0; s < config.seatsPerTable && queue.length; s++) {
            const k = `${r}-${t}-${s}`;
            if (!next[k]) next[k] = queue.shift().id;
          }
        }
      }
      return next;
    });
  }, [students, config]);

  const clearAll = useCallback(() => setAssignments({}), []);

  // Impression : plan de la salle avec la photo de chaque élève à sa place.
  // Les photos sont chargées/converties avant d'ouvrir la fenêtre d'impression.
  const printPlan = useCallback(async () => {
    setPrinting(true);
    try {
      await printSeatingPlan({ cls, config, assignments, students, school, resolveSrc: resolveAsset });
    } catch (e) {
      setSaveState('error');
      setSaveError(`Impression impossible : ${e.message}`);
    } finally {
      setPrinting(false);
    }
  }, [cls, config, assignments, students, school]);

  const handleDragStart = useCallback((event) => {
    setDragged(event.active.data.current || null);
  }, []);

  const handleDragEnd = useCallback((event) => {
    const info = event.active.data.current;
    setDragged(null);
    if (!info || !event.over) return;
    const overId = String(event.over.id);

    if (overId === 'pool') {
      // Retirer de sa place (glissé vers le panneau latéral).
      if (info.fromKey) removeSeat(info.fromKey);
      return;
    }
    if (!overId.startsWith('seat:')) return;
    const targetKey = overId.slice(5);

    setAssignments((prev) => {
      const next = { ...prev };
      const occupant = next[targetKey]; // élève déjà assis là (ou undefined)
      if (info.fromKey) delete next[info.fromKey];
      // Place occupée : échange si on vient d'une place, sinon l'occupant
      // redevient « non placé » (on vient du panneau latéral).
      if (occupant && occupant !== info.student.id && info.fromKey) {
        next[info.fromKey] = occupant;
      }
      next[targetKey] = info.student.id;
      return next;
    });
  }, [removeSeat]);

  const saveBadge = missingTable ? (
    <span className="inline-flex items-center gap-1 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
      <AlertTriangle className="w-3 h-3" /> Non sauvegardé — exécutez ADD_CLASS_SEATING.sql
    </span>
  ) : saveState === 'saving' ? (
    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
      <UploadCloud className="w-3.5 h-3.5 animate-pulse" /> Enregistrement…
    </span>
  ) : saveState === 'saved' ? (
    <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600">
      <Check className="w-3.5 h-3.5" /> Enregistré
    </span>
  ) : saveState === 'error' ? (
    <span className="inline-flex items-center gap-1 text-[11px] text-red-600" title={saveError}>
      <AlertTriangle className="w-3.5 h-3.5" /> Échec : {saveError}
    </span>
  ) : null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4">
      <Motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 28 }}
        className="bg-slate-50 rounded-2xl shadow-2xl w-full max-w-6xl h-[94vh] flex flex-col overflow-hidden"
      >
        {/* En-tête */}
        <div className="flex items-center gap-3 px-4 py-3 bg-card border-b border-border">
          <div className="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
            <Armchair className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h2 className="font-semibold leading-tight truncate">Plan de classe — {cls.name}</h2>
            <p className="text-xs text-muted-foreground">
              {placedIds.size}/{students.length} élèves placés · {totalSeats} places
              {totalSeats < students.length && (
                <span className="text-amber-600"> — il manque {students.length - totalSeats} place{students.length - totalSeats > 1 ? 's' : ''}</span>
              )}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-3">
            {saveBadge}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
              aria-label="Fermer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Barre de réglages */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 bg-card/60 border-b border-border text-sm">
          <label className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Élèves / table</span>
            <select
              value={config.seatsPerTable}
              onChange={(e) => updateConfig({ seatsPerTable: +e.target.value })}
              className="px-2 py-1 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            >
              {[1, 2, 3, 4, 6].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Rangées</span>
            <select
              value={config.rows}
              onChange={(e) => updateConfig({ rows: +e.target.value })}
              className="px-2 py-1 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            >
              {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Tables / rangée</span>
            <select
              value={config.tablesPerRow}
              onChange={(e) => updateConfig({ tablesPerRow: +e.target.value })}
              className="px-2 py-1 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            >
              {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={autoPlace}
              disabled={unplaced.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg
                bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40"
            >
              <Wand2 className="w-3.5 h-3.5" /> Placement auto
            </button>
            <button
              onClick={printPlan}
              disabled={loading || printing || placedIds.size === 0}
              title="Imprimer le plan avec les photos des élèves à leur place"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-border
                bg-card hover:bg-muted disabled:opacity-40"
            >
              {printing
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Printer className="w-3.5 h-3.5" />}
              {printing ? 'Préparation…' : 'Imprimer'}
            </button>
            <button
              onClick={clearAll}
              disabled={placedIds.size === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-border
                bg-card hover:bg-muted disabled:opacity-40"
            >
              <Eraser className="w-3.5 h-3.5" /> Tout retirer
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground gap-2">
            <Loader2 className="w-5 h-5 animate-spin" /> Chargement du plan…
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={rectIntersection}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={() => setDragged(null)}
          >
            <div className="flex flex-1 min-h-0">
              {/* Salle de classe (vue de dessus) */}
              <div className="flex-1 overflow-auto p-4 sm:p-6">
                {/* Tableau + bureau du professeur */}
                <div className="max-w-3xl mx-auto mb-6">
                  <div className="h-9 rounded-lg bg-slate-800 text-slate-200 text-xs font-medium
                    flex items-center justify-center tracking-wide shadow-inner">
                    Tableau
                  </div>
                  <div className="flex justify-end mt-2 mr-6">
                    <div className="w-28 h-10 rounded-lg bg-indigo-200/70 border border-indigo-300 text-indigo-800
                      text-[11px] font-medium flex items-center justify-center shadow-sm">
                      Bureau
                    </div>
                  </div>
                </div>

                {/* Rangées de tables */}
                <div className="flex flex-col items-center gap-5 pb-6">
                  {Array.from({ length: config.rows }, (_, r) => (
                    <div key={r} className="flex items-center gap-3 sm:gap-5">
                      <span className="text-[10px] text-muted-foreground w-4 text-right shrink-0">R{r + 1}</span>
                      {Array.from({ length: config.tablesPerRow }, (_, t) => (
                        <div
                          key={t}
                          className="rounded-xl border border-amber-300 bg-amber-100 shadow-[0_3px_0_0_rgba(217,119,6,0.25)] p-1.5 flex gap-1.5"
                        >
                          {Array.from({ length: config.seatsPerTable }, (_, s) => {
                            const k = `${r}-${t}-${s}`;
                            const sid = assignments[k];
                            return (
                              <Seat
                                key={k}
                                seatKey={k}
                                student={sid ? studentById[sid] : null}
                                onRemove={removeSeat}
                              />
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>

              {/* Panneau latéral : élèves non placés (aussi zone « retirer ») */}
              <PoolPanel unplaced={unplaced} draggedFromSeat={!!dragged?.fromKey} />
            </div>

            {/* Fantôme qui suit le curseur */}
            <DragOverlay dropAnimation={null}>
              {dragged && (
                <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl border border-indigo-400 bg-card shadow-lg text-sm rotate-2">
                  <Avatar
                    name={fullName(dragged.student)}
                    src={resolveAsset(dragged.student.avatar_url)}
                    gender={dragged.student.gender}
                    size="sm"
                  />
                  <span className="font-medium">{fullName(dragged.student)}</span>
                </div>
              )}
            </DragOverlay>
          </DndContext>
        )}
      </Motion.div>
    </div>
  );
}
