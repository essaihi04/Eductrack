import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  DndContext, DragOverlay, PointerSensor, TouchSensor, useSensor, useSensors,
  useDraggable, useDroppable, rectIntersection,
} from '@dnd-kit/core';
import { AnimatePresence, motion as Motion } from 'framer-motion';
import {
  Users, Search, Undo2, CheckCircle2, AlertTriangle, Shuffle, X, Loader2,
} from 'lucide-react';
import { Avatar } from '../../components/directory/ui';
import { supabase } from '../../lib/supabase';
import { useYear } from '../../contexts/YearContext';
import { sameYear } from '../../lib/schoolYear';

// ── Répartition des classes ──────────────────────────────────────────────────
// Onglet « Répartition » : déplacer des élèves d'une classe à l'autre au sein
// d'un même niveau, par glisser-déposer. Chaque classe est affichée comme une
// « salle » (grille d'élèves avec photo/avatar + jauge d'effectif). Le
// déplacement passe par PUT /api/admin/students/bulk-move qui synchronise
// aussi student_enrollments (roster finance) — jamais d'update direct ici.

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

// Ordre canonique des niveaux marocains pour trier les puces.
const LEVEL_ORDER = ['TPS', 'PS', 'MS', 'GS', '1AP', '2AP', '3AP', '4AP', '5AP', '6AP', '1AC', '2AC', '3AC', 'TC', '1BAC', '2BAC'];
const LEVEL_LABELS = {
  TPS: 'Très Petite Section', PS: 'Petite Section', MS: 'Moyenne Section', GS: 'Grande Section',
  '1AP': '1ère Année Primaire', '2AP': '2ème Année Primaire', '3AP': '3ème Année Primaire',
  '4AP': '4ème Année Primaire', '5AP': '5ème Année Primaire', '6AP': '6ème Année Primaire',
  '1AC': '1ère Année Collège', '2AC': '2ème Année Collège', '3AC': '3ème Année Collège',
  TC: 'Tronc Commun', '1BAC': '1ère Bac', '2BAC': '2ème Bac',
};
const FILIERE_LABELS = {
  tc_sciences: 'TC Sciences', tc_lettres: 'TC Lettres', tc_tech: 'TC Technologique',
  sciences_exp: 'Sciences Expérimentales', sciences_math: 'Sciences Mathématiques',
  sciences_eco: 'Sciences Éco et Gestion', ste: 'Sciences et Tech. Électriques',
  stm: 'Sciences et Tech. Mécaniques', lettres: 'Lettres', svt: 'SVT', pc: 'PC',
  sciences_math_a: 'Sciences Math A', sciences_math_b: 'Sciences Math B',
  eco: 'Sciences Économiques', sciences_gestion: 'Sciences de Gestion Comptable',
  sciences_humaines: 'Sciences Humaines',
};

const levelRank = (lvl) => {
  const i = LEVEL_ORDER.indexOf(String(lvl || '').toUpperCase());
  return i === -1 ? 999 : i;
};
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

// ── Élève déplaçable (photo si présente, sinon avatar genré/initiales) ───────
function StudentChip({ student, selected, dimmed, highlighted, onToggle }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: student.id,
    data: { student },
  });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={() => onToggle(student.id)}
      title={fullName(student)}
      className={[
        'flex items-center gap-1.5 px-1.5 py-1 rounded-lg border text-xs select-none',
        'cursor-grab active:cursor-grabbing touch-manipulation transition-colors',
        isDragging ? 'opacity-30' : '',
        selected
          ? 'border-indigo-400 bg-indigo-50 ring-1 ring-indigo-300'
          : 'border-border bg-card hover:border-indigo-300 hover:bg-indigo-50/50',
        highlighted ? 'ring-2 ring-amber-400 border-amber-300' : '',
        dimmed ? 'opacity-30' : '',
      ].join(' ')}
    >
      <Avatar
        name={fullName(student)}
        src={resolveAsset(student.avatar_url)}
        gender={student.gender}
        size="sm"
      />
      <span className="truncate min-w-0 leading-tight">
        {student.first_name} <span className="text-muted-foreground">{(student.last_name || '').charAt(0)}{student.last_name ? '.' : ''}</span>
      </span>
    </div>
  );
}

// ── Carte « salle de classe » (zone de dépôt) ────────────────────────────────
function ClassRoom({ cls, students, maxCount, loading, children }) {
  const { setNodeRef, isOver } = useDroppable({ id: cls.id });
  const count = students?.length ?? cls.student_count ?? 0;
  const pct = Math.min(100, Math.round((count / Math.max(maxCount, 1)) * 100));
  const crowded = count >= 40;
  return (
    <div
      ref={setNodeRef}
      className={[
        'rounded-2xl border bg-card p-3 flex flex-col gap-2 transition-all',
        isOver ? 'border-indigo-500 ring-2 ring-indigo-300 bg-indigo-50/60 scale-[1.01]' : 'border-border',
      ].join(' ')}
    >
      <div className="flex items-baseline justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-sm truncate">{cls.name}</p>
          {cls.filiere && (
            <p className="text-[11px] text-muted-foreground truncate">
              {FILIERE_LABELS[cls.filiere] || cls.filiere}
            </p>
          )}
        </div>
        <span className={`text-xs font-medium shrink-0 ${crowded ? 'text-amber-600' : 'text-muted-foreground'}`}>
          <Users className="w-3.5 h-3.5 inline -mt-0.5 mr-1" />
          {count} élève{count > 1 ? 's' : ''}
        </span>
      </div>
      <div className="h-1 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${crowded ? 'bg-amber-500' : 'bg-indigo-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {loading ? (
        <div className="flex items-center justify-center py-6 text-muted-foreground text-xs gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Chargement…
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 min-h-[52px] content-start">
          {children}
          {(!students || students.length === 0) && (
            <p className="col-span-full text-center text-[11px] text-muted-foreground py-4">
              Aucun élève — déposez ici
            </p>
          )}
        </div>
      )}
      <AnimatePresence>
        {isOver && (
          <Motion.p
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="text-[11px] text-indigo-600 font-medium text-center"
          >
            Déposer ici pour transférer vers {cls.name}
          </Motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function ClassAssignmentPage() {
  const { year } = useYear();
  const [classes, setClasses] = useState([]);
  const [loadingClasses, setLoadingClasses] = useState(true);
  const [level, setLevel] = useState(null);
  const [studentsByClass, setStudentsByClass] = useState({});
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [search, setSearch] = useState('');
  const [dragged, setDragged] = useState(null); // { student, count }
  const [banner, setBanner] = useState(null);   // { type, text, undo? }
  const bannerTimer = useRef(null);
  // Après un glisser-déposer, le navigateur émet quand même un « click » sur la
  // puce d'origine → sans ce garde-fou, chaque drag (dé)sélectionnait l'élève.
  const suppressClick = useRef(false);

  // Glisser au pointeur après 6px (le clic simple reste une sélection) ;
  // au tactile, appui long 200ms pour ne pas bloquer le scroll.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );

  // Classes de l'année active uniquement.
  const visibleClasses = useMemo(
    () => classes.filter((c) => !c.academic_year || sameYear(c.academic_year, year)),
    [classes, year],
  );
  const levels = useMemo(() => {
    const set = [...new Set(visibleClasses.map((c) => c.level).filter(Boolean))];
    return set.sort((a, b) => levelRank(a) - levelRank(b));
  }, [visibleClasses]);
  const levelClasses = useMemo(
    () => visibleClasses
      .filter((c) => c.level === level)
      .sort((a, b) => String(a.name).localeCompare(String(b.name), 'fr')),
    [visibleClasses, level],
  );
  const maxCount = useMemo(() => {
    const counts = levelClasses.map((c) => (studentsByClass[c.id]?.length ?? c.student_count ?? 0));
    return Math.max(30, ...counts);
  }, [levelClasses, studentsByClass]);

  const showBanner = useCallback((b, ms = 6000) => {
    clearTimeout(bannerTimer.current);
    setBanner(b);
    if (ms) bannerTimer.current = setTimeout(() => setBanner(null), ms);
  }, []);

  useEffect(() => () => clearTimeout(bannerTimer.current), []);

  // Charger les classes (avec effectifs) au montage / changement d'année.
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoadingClasses(true);
      try {
        const data = await api('/api/admin/classes');
        if (alive) setClasses(data || []);
      } catch (e) {
        if (alive) showBanner({ type: 'error', text: `Chargement des classes impossible : ${e.message}` }, 0);
      } finally {
        if (alive) setLoadingClasses(false);
      }
    })();
    return () => { alive = false; };
  }, [year, showBanner]);

  // Niveau par défaut = premier niveau disponible.
  useEffect(() => {
    if (!level || !levels.includes(level)) setLevel(levels[0] || null);
  }, [levels, level]);

  // Charger les élèves des classes du niveau sélectionné.
  useEffect(() => {
    if (!level) return;
    let alive = true;
    (async () => {
      setLoadingStudents(true);
      setSelected(new Set());
      try {
        const ids = visibleClasses.filter((c) => c.level === level).map((c) => c.id);
        const lists = await Promise.all(ids.map((id) => api(`/api/admin/classes/${id}/students`)));
        if (!alive) return;
        const map = {};
        ids.forEach((id, i) => { map[id] = lists[i] || []; });
        setStudentsByClass(map);
      } catch (e) {
        if (alive) showBanner({ type: 'error', text: `Chargement des élèves impossible : ${e.message}` }, 0);
      } finally {
        if (alive) setLoadingStudents(false);
      }
    })();
    return () => { alive = false; };
  }, [level, visibleClasses, showBanner]);

  const classOf = useCallback((studentId) => {
    for (const [cid, list] of Object.entries(studentsByClass)) {
      if (list.some((s) => s.id === studentId)) return cid;
    }
    return null;
  }, [studentsByClass]);

  // Déplacement optimiste + appel API + bandeau « Annuler ».
  const moveStudents = useCallback(async (studentIds, toClassId, { silent = false } = {}) => {
    // Origine de chaque élève (pour l'annulation) — on ne déplace que ceux qui changent de classe.
    const origins = {};
    const moving = studentIds.filter((id) => {
      const from = classOf(id);
      if (!from || from === toClassId) return false;
      origins[id] = from;
      return true;
    });
    if (moving.length === 0) return;

    const snapshot = studentsByClass;
    setStudentsByClass((prev) => {
      const next = {};
      for (const [cid, list] of Object.entries(prev)) next[cid] = list.filter((s) => !moving.includes(s.id));
      const movedStudents = moving.map((id) => Object.values(prev).flat().find((s) => s.id === id)).filter(Boolean);
      next[toClassId] = [...(next[toClassId] || []), ...movedStudents];
      return next;
    });
    setSelected(new Set());

    try {
      await api('/api/admin/students/bulk-move', {
        method: 'PUT',
        body: JSON.stringify({ studentIds: moving, classId: toClassId, academicYear: year }),
      });
      if (!silent) {
        const toName = levelClasses.find((c) => c.id === toClassId)?.name || 'la classe';
        const first = Object.values(snapshot).flat().find((s) => s.id === moving[0]);
        const label = moving.length === 1
          ? `${fullName(first)} déplacé(e) vers ${toName}`
          : `${moving.length} élèves déplacés vers ${toName}`;
        showBanner({ type: 'success', text: label, undo: { moving, origins } }, 8000);
      }
    } catch (e) {
      setStudentsByClass(snapshot);
      showBanner({ type: 'error', text: `Déplacement refusé : ${e.message}` }, 0);
    }
  }, [studentsByClass, classOf, year, levelClasses, showBanner]);

  const undoMove = useCallback(async (undo) => {
    setBanner(null);
    // Regrouper par classe d'origine puis re-déplacer.
    const byOrigin = {};
    undo.moving.forEach((id) => {
      const from = undo.origins[id];
      if (!byOrigin[from]) byOrigin[from] = [];
      byOrigin[from].push(id);
    });
    for (const [classId, ids] of Object.entries(byOrigin)) {
      await moveStudents(ids, classId, { silent: true });
    }
    showBanner({ type: 'success', text: 'Déplacement annulé' }, 4000);
  }, [moveStudents, showBanner]);

  const toggleSelect = useCallback((id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const handleDragStart = useCallback((event) => {
    const student = event.active.data.current?.student;
    if (!student) return;
    suppressClick.current = true;
    const count = selected.has(student.id) ? selected.size : 1;
    setDragged({ student, count });
  }, [selected]);

  const releaseClickGuard = useCallback(() => {
    // Le « click » résiduel arrive juste après dragend → on relâche au tick suivant.
    setTimeout(() => { suppressClick.current = false; }, 0);
  }, []);

  const handleDragEnd = useCallback((event) => {
    const student = event.active.data.current?.student;
    setDragged(null);
    releaseClickGuard();
    if (!student || !event.over) return;
    const ids = selected.has(student.id) ? [...selected] : [student.id];
    moveStudents(ids, event.over.id);
  }, [selected, moveStudents, releaseClickGuard]);

  const guardedToggle = useCallback((id) => {
    if (suppressClick.current) return;
    toggleSelect(id);
  }, [toggleSelect]);

  const q = search.trim().toLowerCase();
  const matches = useCallback((s) => !q || fullName(s).toLowerCase().includes(q), [q]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center">
            <Shuffle className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold leading-tight">Répartition des classes</h1>
            <p className="text-xs text-muted-foreground">
              Glissez un élève d'une classe à l'autre — cliquez pour en sélectionner plusieurs.
            </p>
          </div>
        </div>
        <div className="ml-auto relative">
          <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un élève…"
            className="pl-8 pr-8 py-1.5 text-sm rounded-lg border border-border bg-card focus:outline-none focus:ring-2 focus:ring-indigo-300 w-56"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Effacer la recherche"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Puces de niveau */}
      <div className="flex flex-wrap gap-2">
        {levels.map((lvl) => {
          const count = visibleClasses.filter((c) => c.level === lvl).length;
          const active = lvl === level;
          return (
            <button
              key={lvl}
              onClick={() => setLevel(lvl)}
              title={LEVEL_LABELS[lvl] || lvl}
              className={[
                'px-3 py-1.5 rounded-full text-sm font-medium border transition-colors',
                active
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-card text-muted-foreground border-border hover:border-indigo-300 hover:text-indigo-600',
              ].join(' ')}
            >
              {lvl} <span className={`text-xs ${active ? 'text-indigo-200' : 'text-muted-foreground'}`}>· {count}</span>
            </button>
          );
        })}
        {!loadingClasses && levels.length === 0 && (
          <p className="text-sm text-muted-foreground py-2">
            Aucune classe pour l'année {year}. Créez des classes (avec un niveau) dans l'onglet Classes.
          </p>
        )}
      </div>

      {selected.size > 0 && (
        <div className="flex items-center gap-2 text-sm bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-lg px-3 py-1.5">
          <Users className="w-4 h-4" />
          {selected.size} élève{selected.size > 1 ? 's' : ''} sélectionné{selected.size > 1 ? 's' : ''} — glissez-en un pour déplacer tout le groupe
          <button
            onClick={() => setSelected(new Set())}
            className="ml-auto underline hover:no-underline"
          >
            Tout désélectionner
          </button>
        </div>
      )}

      {loadingClasses ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
          <Loader2 className="w-5 h-5 animate-spin" /> Chargement des classes…
        </div>
      ) : level && levelClasses.length > 0 && (
        <DndContext
          sensors={sensors}
          collisionDetection={rectIntersection}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={() => { setDragged(null); releaseClickGuard(); }}
        >
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {levelClasses.map((cls) => (
              <ClassRoom
                key={cls.id}
                cls={cls}
                students={studentsByClass[cls.id]}
                maxCount={maxCount}
                loading={loadingStudents && !studentsByClass[cls.id]}
              >
                {(studentsByClass[cls.id] || []).map((s) => (
                  <Motion.div key={s.id} layout transition={{ type: 'spring', stiffness: 500, damping: 35 }}>
                    <StudentChip
                      student={s}
                      selected={selected.has(s.id)}
                      highlighted={!!q && matches(s)}
                      dimmed={!!q && !matches(s)}
                      onToggle={guardedToggle}
                    />
                  </Motion.div>
                ))}
              </ClassRoom>
            ))}
          </div>

          {/* Carte fantôme qui suit le curseur */}
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
                {dragged.count > 1 && (
                  <span className="text-xs bg-indigo-600 text-white rounded-full px-1.5 py-0.5 font-semibold">
                    +{dragged.count - 1}
                  </span>
                )}
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}

      {/* Bandeau résultat / annulation */}
      <AnimatePresence>
        {banner && (
          <Motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            className={[
              'fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2',
              'px-4 py-2.5 rounded-xl shadow-lg border text-sm bg-card',
              banner.type === 'error' ? 'border-red-300 text-red-700' : 'border-emerald-300 text-emerald-800',
            ].join(' ')}
          >
            {banner.type === 'error'
              ? <AlertTriangle className="w-4 h-4 shrink-0" />
              : <CheckCircle2 className="w-4 h-4 shrink-0" />}
            <span>{banner.text}</span>
            {banner.undo && (
              <button
                onClick={() => undoMove(banner.undo)}
                className="ml-2 inline-flex items-center gap-1 font-medium text-indigo-600 hover:text-indigo-800"
              >
                <Undo2 className="w-3.5 h-3.5" /> Annuler
              </button>
            )}
            <button
              onClick={() => setBanner(null)}
              className="ml-1 text-muted-foreground hover:text-foreground"
              aria-label="Fermer"
            >
              <X className="w-4 h-4" />
            </button>
          </Motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
