import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  DndContext, DragOverlay, PointerSensor, TouchSensor, useSensor, useSensors,
  useDraggable, useDroppable, rectIntersection,
} from '@dnd-kit/core';
import { AnimatePresence, motion as Motion } from 'framer-motion';
import {
  Users, Search, Undo2, CheckCircle2, AlertTriangle, Shuffle, X, Loader2,
  Plus, CalendarOff, Award, TrendingUp, TrendingDown, Minus, Maximize2, Wand2,
  Printer,
} from 'lucide-react';
import { Avatar } from '../../components/directory/ui';
import StudentNotesModal from '../../components/StudentNotesModal';
import SeatingPlanModal from '../../components/students/SeatingPlanModal';
import SmartAssignModal from '../../components/students/SmartAssignModal';
import StudentDossierModal from '../../components/students/StudentDossierModal';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useYear } from '../../contexts/YearContext';
import { printClassSheets } from '../../lib/printSeatingPlan';
import { sameYear, toDashYear } from '../../lib/schoolYear';

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

// Filières proposables à la création rapide d'une classe, selon le niveau.
const LEVEL_FILIERES = {
  TC: ['tc_sciences', 'tc_lettres', 'tc_tech'],
  '1BAC': ['sciences_exp', 'sciences_math', 'sciences_eco', 'ste', 'stm', 'lettres'],
  '2BAC': ['svt', 'pc', 'sciences_math_a', 'sciences_math_b', 'eco', 'sciences_gestion', 'ste', 'stm', 'lettres', 'sciences_humaines'],
};

const levelRank = (lvl) => {
  const i = LEVEL_ORDER.indexOf(String(lvl || '').toUpperCase());
  return i === -1 ? 999 : i;
};
const schoolTypeForLevel = (lvl) => {
  const L = String(lvl || '').toUpperCase();
  if (['TPS', 'PS', 'MS', 'GS'].includes(L)) return 'maternelle';
  if (L.endsWith('AP')) return 'primaire';
  if (L.endsWith('AC')) return 'college';
  return 'lycee';
};
// Couleur d'une note /20 (mêmes seuils que la fiche élève).
const noteColor = (n) => {
  if (n == null) return 'text-gray-400';
  if (n >= 14) return 'text-emerald-600';
  if (n >= 12) return 'text-blue-600';
  if (n >= 10) return 'text-amber-600';
  return 'text-red-600';
};
const fmtNote = (n) => (n == null ? '—' : `${Number(n).toFixed(2).replace(/\.?0+$/, '')}/20`);
const fmtDate = (d) => {
  if (!d) return '';
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? '' : dt.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
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

// ── Mini-courbe de progression (notes de contrôles dans l'ordre chronologique) ──
function Sparkline({ points }) {
  if (!points || points.length < 2) {
    return <p className="text-[11px] text-muted-foreground italic">Pas encore assez de notes pour tracer la courbe.</p>;
  }
  const w = 224, h = 44, pad = 5;
  const xs = points.map((_, i) => pad + (i * (w - 2 * pad)) / (points.length - 1));
  const ys = points.map((p) => h - pad - (Math.max(0, Math.min(20, p.note)) / 20) * (h - 2 * pad));
  const poly = xs.map((x, i) => `${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ');
  const lastUp = points[points.length - 1].note >= points[0].note;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-11" aria-hidden="true">
      {/* Ligne repère 10/20 (seuil de la moyenne) */}
      <line x1={pad} x2={w - pad} y1={h - pad - (10 / 20) * (h - 2 * pad)} y2={h - pad - (10 / 20) * (h - 2 * pad)}
        stroke="currentColor" className="text-gray-300" strokeDasharray="3 3" strokeWidth="1" />
      <polyline points={poly} fill="none" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"
        stroke="currentColor" className={lastUp ? 'text-emerald-500' : 'text-red-400'} />
      {xs.map((x, i) => (
        <circle key={i} cx={x} cy={ys[i]} r={i === xs.length - 1 ? 3 : 1.8}
          fill="currentColor" className={lastUp ? 'text-emerald-600' : 'text-red-500'} />
      ))}
    </svg>
  );
}

// ── Carte de survol : aperçu rapide de la performance d'un élève ─────────────
function HoverCard({ hovered, stats, extra }) {
  const { student, style } = hovered;
  const perf = stats?.performance;
  const perfColor = perf == null ? 'text-gray-400'
    : perf >= 60 ? 'text-emerald-600' : perf >= 40 ? 'text-amber-600' : 'text-red-600';
  const TrendIcon = stats?.trendDir === 'up' ? TrendingUp : stats?.trendDir === 'down' ? TrendingDown : Minus;
  const trendColor = stats?.trendDir === 'up' ? 'text-emerald-600' : stats?.trendDir === 'down' ? 'text-red-500' : 'text-gray-400';
  return (
    <div style={style} className="fixed z-40 w-64 pointer-events-none">
      <div className="rounded-xl border border-border bg-card shadow-xl p-3 space-y-2">
        <div className="flex items-center gap-2">
          <Avatar name={fullName(student)} src={resolveAsset(student.avatar_url)} gender={student.gender} size="md" />
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">{fullName(student)}</p>
            <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
              <span className={perfColor}>
                {perf == null ? 'Performance —' : `Performance ${perf}%`}
              </span>
              <TrendIcon className={`w-3.5 h-3.5 ${trendColor}`} />
              {stats?.absences != null && (
                <span className="inline-flex items-center gap-0.5">
                  <CalendarOff className="w-3 h-3" /> {stats.absences} abs.
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-1.5 text-[11px]">
          <div className="rounded-lg bg-muted/60 px-2 py-1.5">
            <p className="text-muted-foreground">Dernière note</p>
            <p className={`font-semibold text-sm ${noteColor(extra?.last_note?.note)}`}>
              {fmtNote(extra?.last_note?.note)}
            </p>
            {extra?.last_note && (
              <p className="text-muted-foreground truncate">
                {extra.last_note.subject || ''} {extra.last_note.date ? `· ${fmtDate(extra.last_note.date)}` : ''}
              </p>
            )}
          </div>
          <div className="rounded-lg bg-muted/60 px-2 py-1.5">
            <p className="text-muted-foreground truncate">
              Moyenne {extra?.prev_year_label || 'année préc.'}
            </p>
            <p className={`font-semibold text-sm ${noteColor(extra?.prev_year_avg)}`}>
              {fmtNote(extra?.prev_year_avg)}
            </p>
          </div>
        </div>
        {extra?.regional_avg != null && (
          <div className="flex items-center gap-1.5 text-[11px] rounded-lg bg-indigo-50 border border-indigo-100 px-2 py-1.5">
            <Award className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
            <span className="text-indigo-700">Examen régional</span>
            <span className={`ml-auto font-semibold text-sm ${noteColor(extra.regional_avg)}`}>
              {fmtNote(extra.regional_avg)}
            </span>
          </div>
        )}
        <div>
          <p className="text-[11px] text-muted-foreground mb-0.5">Progression (contrôles de l'année)</p>
          <Sparkline points={extra?.curve} />
        </div>
        <p className="text-[10px] text-muted-foreground text-center border-t border-border pt-1.5">
          Double-clic : fiche complète (notes, appréciations, assiduité)
        </p>
      </div>
    </div>
  );
}

// ── Élève déplaçable (photo si présente, sinon avatar genré/initiales) ───────
function StudentChip({ student, selected, dimmed, highlighted, onToggle, onOpen, onHoverStart, onHoverEnd }) {
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
      onDoubleClick={() => onOpen(student)}
      onMouseEnter={(e) => onHoverStart(student, e.currentTarget)}
      onMouseLeave={onHoverEnd}
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
function ClassRoom({ cls, students, maxCount, loading, onOpenSeating, onPrint, printing, children }) {
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
        <button
          onClick={() => onPrint(cls)}
          disabled={loading || printing || count === 0}
          title="Imprimer la classe avec les photos des élèves (à leur place si un plan existe)"
          className="p-1 rounded-md text-muted-foreground hover:text-indigo-600 hover:bg-indigo-50
            shrink-0 self-center disabled:opacity-40"
        >
          {printing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
        </button>
        <button
          onClick={() => onOpenSeating(cls)}
          disabled={loading}
          title="Plan de classe (tables et placement)"
          className="p-1 -mr-1 rounded-md text-muted-foreground hover:text-indigo-600 hover:bg-indigo-50
            shrink-0 self-center disabled:opacity-40"
        >
          <Maximize2 className="w-4 h-4" />
        </button>
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

// ── Carte « + Nouvelle classe » : création rapide dans le niveau affiché ─────
// La classe créée apparaît aussitôt dans la grille → on y glisse les élèves.
function CreateClassCard({ level, year, onCreated, onError }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [filiere, setFiliere] = useState('');
  const [busy, setBusy] = useState(false);
  const filieres = LEVEL_FILIERES[String(level || '').toUpperCase()] || [];

  const submit = async (e) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      const created = await api('/api/admin/classes', {
        method: 'POST',
        body: JSON.stringify({
          name: trimmed,
          level,
          academicYear: year,
          school_type: schoolTypeForLevel(level),
          filiere: filiere || null,
        }),
      });
      onCreated(created);
      setName(''); setFiliere(''); setOpen(false);
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-2xl border-2 border-dashed border-border hover:border-indigo-400 hover:bg-indigo-50/40
          text-muted-foreground hover:text-indigo-600 transition-colors flex flex-col items-center justify-center
          gap-1.5 min-h-[140px] p-3"
      >
        <Plus className="w-6 h-6" />
        <span className="text-sm font-medium">Nouvelle classe {level}</span>
        <span className="text-[11px]">Créez la classe puis glissez-y les élèves</span>
      </button>
    );
  }
  return (
    <form onSubmit={submit} className="rounded-2xl border-2 border-dashed border-indigo-300 bg-indigo-50/40 p-3 flex flex-col gap-2">
      <p className="text-sm font-semibold text-indigo-700 flex items-center gap-1.5">
        <Plus className="w-4 h-4" /> Nouvelle classe — {level} · {year}
      </p>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={`Nom de la classe (ex. ${level} — D)`}
        className="px-2.5 py-1.5 text-sm rounded-lg border border-border bg-card focus:outline-none focus:ring-2 focus:ring-indigo-300"
      />
      {filieres.length > 0 && (
        <select
          value={filiere}
          onChange={(e) => setFiliere(e.target.value)}
          className="px-2.5 py-1.5 text-sm rounded-lg border border-border bg-card focus:outline-none focus:ring-2 focus:ring-indigo-300"
        >
          <option value="">Filière (optionnel)</option>
          {filieres.map((f) => (
            <option key={f} value={f}>{FILIERE_LABELS[f] || f}</option>
          ))}
        </select>
      )}
      <div className="flex gap-2 mt-auto">
        <button
          type="submit"
          disabled={!name.trim() || busy}
          className="flex-1 px-3 py-1.5 text-sm font-medium rounded-lg bg-indigo-600 text-white
            hover:bg-indigo-700 disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
        >
          {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Créer
        </button>
        <button
          type="button"
          onClick={() => { setOpen(false); setName(''); setFiliere(''); }}
          className="px-3 py-1.5 text-sm rounded-lg border border-border bg-card hover:bg-muted"
        >
          Annuler
        </button>
      </div>
    </form>
  );
}

// ── Choix des classes à imprimer (sélection multiple) ───────────────────────
// Une page par classe dans un seul document : plan de placement avec photos si
// la classe en a un, sinon trombinoscope (grille photo + nom).
function PrintPickerModal({ classes, countOf, level, busy, onPrint, onClose }) {
  const printable = classes.filter((c) => countOf(c) > 0);
  const [picked, setPicked] = useState(() => new Set(printable.map((c) => c.id)));
  const toggle = (id) => setPicked((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const allPicked = printable.length > 0 && picked.size === printable.length;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <Motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-card rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] flex flex-col overflow-hidden"
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <div className="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
            <Printer className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h2 className="font-semibold leading-tight">Imprimer les classes — {level}</h2>
            <p className="text-xs text-muted-foreground">Une page par classe, photos des élèves à leur place.</p>
          </div>
          <button onClick={onClose} className="ml-auto p-1.5 rounded-lg text-muted-foreground hover:bg-muted" aria-label="Fermer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-3 space-y-1.5">
          {printable.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              Aucune classe avec des élèves à imprimer pour ce niveau.
            </p>
          )}
          {printable.length > 0 && (
            <button
              onClick={() => setPicked(allPicked ? new Set() : new Set(printable.map((c) => c.id)))}
              className="text-xs text-indigo-600 hover:underline mb-1"
            >
              {allPicked ? 'Tout désélectionner' : 'Tout sélectionner'}
            </button>
          )}
          {printable.map((c) => (
            <label
              key={c.id}
              className={[
                'flex items-center gap-2.5 px-3 py-2 rounded-lg border cursor-pointer text-sm transition-colors',
                picked.has(c.id) ? 'border-indigo-300 bg-indigo-50/60' : 'border-border hover:bg-muted',
              ].join(' ')}
            >
              <input
                type="checkbox"
                checked={picked.has(c.id)}
                onChange={() => toggle(c.id)}
                className="w-4 h-4 accent-indigo-600"
              />
              <span className="font-medium truncate">{c.name}</span>
              {c.filiere && (
                <span className="text-[11px] text-muted-foreground truncate">
                  {FILIERE_LABELS[c.filiere] || c.filiere}
                </span>
              )}
              <span className="ml-auto text-xs text-muted-foreground shrink-0">
                {countOf(c)} élève{countOf(c) > 1 ? 's' : ''}
              </span>
            </label>
          ))}
        </div>

        <div className="flex items-center gap-2 px-4 py-3 border-t border-border">
          <span className="text-xs text-muted-foreground">
            {picked.size} classe{picked.size > 1 ? 's' : ''} sélectionnée{picked.size > 1 ? 's' : ''}
          </span>
          <button
            onClick={onClose}
            className="ml-auto px-3 py-1.5 text-sm rounded-lg border border-border hover:bg-muted"
          >
            Annuler
          </button>
          <button
            onClick={() => onPrint(printable.filter((c) => picked.has(c.id)))}
            disabled={picked.size === 0 || busy}
            className="px-3 py-1.5 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700
              disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
            {busy ? 'Préparation…' : 'Imprimer'}
          </button>
        </div>
      </Motion.div>
    </div>
  );
}

export default function ClassAssignmentPage() {
  const { year } = useYear();
  const { school } = useAuth();
  const [classes, setClasses] = useState([]);
  const [loadingClasses, setLoadingClasses] = useState(true);
  const [level, setLevel] = useState(null);
  const [studentsByClass, setStudentsByClass] = useState({});
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [search, setSearch] = useState('');
  const [dragged, setDragged] = useState(null); // { student, count }
  const [banner, setBanner] = useState(null);   // { type, text, undo? }
  const [statsByClass, setStatsByClass] = useState({});   // suivi séance : perf %, absences, tendance
  const [hoverByClass, setHoverByClass] = useState({});   // notes : dernière note, courbe, année préc., régional
  const [hovered, setHovered] = useState(null);           // { student, style } — carte de survol
  const [notesStudent, setNotesStudent] = useState(null); // fiche 360° (StudentNotesModal)
  const [seatingCls, setSeatingCls] = useState(null);     // plan de classe (SeatingPlanModal)
  const [smartAssign, setSmartAssign] = useState(false);  // répartition intelligente (SmartAssignModal)
  const [printPicker, setPrintPicker] = useState(false);  // choix des classes à imprimer
  const [printingIds, setPrintingIds] = useState(() => new Set()); // impressions en cours
  const [dossierStudent, setDossierStudent] = useState(null); // dossier 360° crèche→bac
  const [refreshKey, setRefreshKey] = useState(0);        // force le rechargement des élèves
  const bannerTimer = useRef(null);
  const hoverTimer = useRef(null);
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

  useEffect(() => () => { clearTimeout(bannerTimer.current); clearTimeout(hoverTimer.current); }, []);

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
      setHovered(null);
      try {
        const ids = visibleClasses.filter((c) => c.level === level).map((c) => c.id);
        const lists = await Promise.all(ids.map((id) => api(`/api/admin/classes/${id}/students`)));
        if (!alive) return;
        const map = {};
        ids.forEach((id, i) => { map[id] = lists[i] || []; });
        setStudentsByClass(map);
        // En arrière-plan (non bloquant) : stats de suivi + aperçu notes pour
        // alimenter la carte de survol. Chaque classe arrive dès qu'elle est prête.
        ids.forEach(async (id) => {
          const [stats, hover] = await Promise.all([
            api(`/api/admin/classes/${id}/students-stats`).catch(() => ({})),
            api(`/api/admin/classes/${id}/students-hover`).catch(() => ({})),
          ]);
          if (!alive) return;
          setStatsByClass((prev) => ({ ...prev, [id]: stats }));
          setHoverByClass((prev) => ({ ...prev, [id]: hover }));
        });
      } catch (e) {
        if (alive) showBanner({ type: 'error', text: `Chargement des élèves impossible : ${e.message}` }, 0);
      } finally {
        if (alive) setLoadingStudents(false);
      }
    })();
    return () => { alive = false; };
  }, [level, visibleClasses, showBanner, refreshKey]);

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

  // Carte de survol : apparaît après 350ms, positionnée sous la puce (ou
  // au-dessus s'il n'y a pas la place), masquée pendant un glisser.
  const hoverStart = useCallback((student, el) => {
    clearTimeout(hoverTimer.current);
    const rect = el.getBoundingClientRect();
    hoverTimer.current = setTimeout(() => {
      const width = 256;
      const left = Math.max(8, Math.min(rect.left + rect.width / 2 - width / 2, window.innerWidth - width - 8));
      const style = rect.bottom + 340 < window.innerHeight
        ? { left, top: rect.bottom + 8 }
        : { left, bottom: window.innerHeight - rect.top + 8 };
      setHovered({ student, style });
    }, 350);
  }, []);

  const hoverEnd = useCallback(() => {
    clearTimeout(hoverTimer.current);
    setHovered(null);
  }, []);

  const openStudent = useCallback((student) => {
    hoverEnd();
    setNotesStudent({ ...student, class_id: classOf(student.id) });
  }, [classOf, hoverEnd]);

  const handleDragStart = useCallback((event) => {
    const student = event.active.data.current?.student;
    if (!student) return;
    suppressClick.current = true;
    hoverEnd();
    const count = selected.has(student.id) ? selected.size : 1;
    setDragged({ student, count });
  }, [selected, hoverEnd]);

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

  // Impression d'une ou plusieurs classes : on récupère le plan de placement de
  // chacune (s'il existe) puis on génère un document, une page par classe.
  const printClasses = useCallback(async (list) => {
    if (!list.length) return;
    setPrintingIds(new Set(list.map((c) => c.id)));
    try {
      const sheets = await Promise.all(list.map(async (cls) => {
        const students = studentsByClass[cls.id]
          || await api(`/api/admin/classes/${cls.id}/students`).catch(() => []);
        let config = null;
        let assignments = null;
        try {
          const d = await api(`/api/admin/classes/${cls.id}/seating`);
          if (d && !d.missing_table && d.assignments && Object.keys(d.assignments).length) {
            config = { rows: d.rows || 4, tablesPerRow: d.tables_per_row || 4, seatsPerTable: d.seats_per_table || 2 };
            assignments = d.assignments;
          }
        } catch {
          // Pas de plan enregistré (ou migration absente) → trombinoscope.
        }
        return { cls, config, assignments, students };
      }));
      const ok = await printClassSheets({ sheets, school, resolveSrc: resolveAsset, label: level });
      if (ok) setPrintPicker(false);
    } catch (e) {
      showBanner({ type: 'error', text: `Impression impossible : ${e.message}` }, 0);
    } finally {
      setPrintingIds(new Set());
    }
  }, [studentsByClass, school, level, showBanner]);

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
              Glissez pour déplacer · clic = sélection multiple · survol = aperçu · double-clic = fiche complète.
            </p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {level && levelClasses.length > 0 && (
            <button
              onClick={() => setPrintPicker(true)}
              title="Imprimer une ou plusieurs classes avec les photos des élèves"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg
                border border-border bg-card hover:bg-muted"
            >
              <Printer className="w-4 h-4" /> Imprimer
            </button>
          )}
          {level && levelClasses.length >= 2 && (
            <button
              onClick={() => setSmartAssign(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg
                bg-indigo-600 text-white hover:bg-indigo-700"
            >
              <Wand2 className="w-4 h-4" /> Répartition IA
            </button>
          )}
          <div className="relative">
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
                onOpenSeating={setSeatingCls}
                onPrint={(c) => printClasses([c])}
                printing={printingIds.has(cls.id)}
              >
                {(studentsByClass[cls.id] || []).map((s) => (
                  <Motion.div key={s.id} layout transition={{ type: 'spring', stiffness: 500, damping: 35 }}>
                    <StudentChip
                      student={s}
                      selected={selected.has(s.id)}
                      highlighted={!!q && matches(s)}
                      dimmed={!!q && !matches(s)}
                      onToggle={guardedToggle}
                      onOpen={openStudent}
                      onHoverStart={hoverStart}
                      onHoverEnd={hoverEnd}
                    />
                  </Motion.div>
                ))}
              </ClassRoom>
            ))}
            <CreateClassCard
              level={level}
              year={year}
              onCreated={(created) => {
                setClasses((prev) => [...prev, created]);
                showBanner({ type: 'success', text: `Classe ${created.name} créée — glissez-y des élèves` });
              }}
              onError={(msg) => showBanner({ type: 'error', text: `Création impossible : ${msg}` }, 0)}
            />
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

      {/* Carte de survol : aperçu performance / notes de l'élève */}
      {hovered && !dragged && (
        <HoverCard
          hovered={hovered}
          stats={statsByClass[classOf(hovered.student.id)]?.[hovered.student.id]}
          extra={hoverByClass[classOf(hovered.student.id)]?.[hovered.student.id]}
        />
      )}

      {/* Fiche 360° (double-clic) : notes par matière, appréciations des profs,
          rang, assiduité, impression PDF, envoi aux parents */}
      {notesStudent && (
        <StudentNotesModal
          student={notesStudent}
          classLabel={levelClasses.find((c) => c.id === notesStudent.class_id)?.name || ''}
          activeYear={toDashYear(year)}
          onClose={() => setNotesStudent(null)}
          onOpenDossier={(s) => { setNotesStudent(null); setDossierStudent(s); }}
        />
      )}

      {/* Dossier élève 360° (crèche → bac) */}
      {dossierStudent && (
        <StudentDossierModal student={dossierStudent} onClose={() => setDossierStudent(null)} />
      )}

      {/* Plan de classe (tables, rangées, placement des élèves) */}
      {seatingCls && (
        <SeatingPlanModal
          cls={seatingCls}
          students={studentsByClass[seatingCls.id] || []}
          onClose={() => setSeatingCls(null)}
        />
      )}

      {/* Choix des classes à imprimer (sélection multiple) */}
      {printPicker && level && (
        <PrintPickerModal
          classes={levelClasses}
          level={level}
          countOf={(c) => (studentsByClass[c.id]?.length ?? c.student_count ?? 0)}
          busy={printingIds.size > 0}
          onPrint={printClasses}
          onClose={() => setPrintPicker(false)}
        />
      )}

      {/* Répartition intelligente (stratégies + analyse IA) */}
      {smartAssign && level && (
        <SmartAssignModal
          level={level}
          year={year}
          onClose={() => setSmartAssign(false)}
          onApplied={(moves) => {
            setRefreshKey((k) => k + 1);
            showBanner({ type: 'success', text: `Répartition appliquée — ${moves} élève${moves > 1 ? 's' : ''} déplacé${moves > 1 ? 's' : ''}` });
          }}
        />
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
