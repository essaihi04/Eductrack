import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion as Motion } from 'framer-motion';
import {
  X, Loader2, Sparkles, Scale, Layers, BookOpen, Target, AlertTriangle,
  ArrowRight, Bot, ChevronDown, Wand2,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

// ─────────────────────────────────────────────────────────────────────────────
// Répartition intelligente — reclasse TOUS les élèves d'un niveau selon une
// stratégie choisie, avec aperçu avant/après (effectifs, moyennes, mixité)
// avant d'appliquer. Une couche IA (DeepSeek) analyse les données réelles du
// niveau (moyennes, matières, absences) et recommande les stratégies.
// Les placements exacts sont TOUJOURS calculés par les algorithmes locaux :
// l'IA analyse et recommande, elle ne décide pas seule des affectations.
// ─────────────────────────────────────────────────────────────────────────────

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
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

const STRATEGIES = {
  heterogene: {
    icon: Scale,
    title: 'Classes équilibrées (mélange)',
    desc: 'Forts, moyens et faibles répartis équitablement : toutes les classes ont une moyenne proche.',
  },
  homogene: {
    icon: Layers,
    title: 'Classes homogènes par niveau',
    desc: 'Les meilleurs ensemble, les élèves en difficulté ensemble : pédagogie et soutien ciblés par classe.',
  },
  matiere: {
    icon: BookOpen,
    title: 'Équilibre par matière',
    desc: 'Forts et faibles d\'une matière choisie mélangés dans chaque classe, pour combler les écarts par l\'entraide.',
  },
  poles: {
    icon: Target,
    title: 'Pôles par matière dominante',
    desc: 'Chaque classe regroupe des élèves qui excellent dans la même matière (pôles d\'affinité).',
  },
};

// Note de référence d'un élève : moyenne de contrôles, sinon performance
// de séance convertie /20, sinon 10 (neutre, milieu de classement).
const scoreOf = (s) => s.avg ?? (s.performance != null ? s.performance / 5 : null);

// Répartition « serpentin » : 1→A,B,C puis C,B,A… → moyennes équilibrées.
const serpentine = (sorted, classIds) => {
  const K = classIds.length;
  const map = {};
  sorted.forEach((s, i) => {
    const round = Math.floor(i / K);
    const pos = i % K;
    const col = round % 2 === 1 ? K - 1 - pos : pos;
    map[s.id] = classIds[col];
  });
  return map;
};

// Calcule l'affectation proposée { studentId: classId } pour une stratégie.
function buildProposal(strategy, subject, analytics) {
  const classIds = analytics.classes.map((c) => c.id);
  const K = classIds.length;
  if (K < 2 || !strategy) return null;
  const students = analytics.students;

  if (strategy === 'heterogene' || strategy === 'homogene' || strategy === 'matiere') {
    const val = strategy === 'matiere'
      ? (s) => s.bySubject?.[subject] ?? scoreOf(s) ?? 10
      : (s) => scoreOf(s) ?? 10;
    const sorted = [...students].sort((a, b) => val(b) - val(a));
    if (strategy === 'homogene') {
      // Blocs contigus : la 1re classe reçoit les meilleurs, etc.
      const map = {};
      const N = sorted.length;
      const base = Math.floor(N / K);
      const extra = N % K;
      let idx = 0;
      classIds.forEach((cid, i) => {
        const size = base + (i < extra ? 1 : 0);
        for (let j = 0; j < size; j++) map[sorted[idx++].id] = cid;
      });
      return map;
    }
    return serpentine(sorted, classIds);
  }

  if (strategy === 'poles') {
    const cap = Math.ceil(students.length / K);
    const remaining = classIds.map((cid) => ({ cid, free: cap }));
    const groups = {};
    const noData = [];
    students.forEach((s) => {
      const entries = Object.entries(s.bySubject || {});
      if (!entries.length) { noData.push(s); return; }
      entries.sort((a, b) => b[1] - a[1]);
      const dom = entries[0][0];
      (groups[dom] || (groups[dom] = [])).push(s);
    });
    const map = {};
    // Gros pôles d'abord, chaque pôle rempli en blocs dans la classe la plus libre.
    const ordered = Object.entries(groups).sort((a, b) => b[1].length - a[1].length);
    for (const [, list] of ordered) {
      list.sort((a, b) => (scoreOf(b) ?? 0) - (scoreOf(a) ?? 0));
      let i = 0;
      while (i < list.length) {
        remaining.sort((a, b) => b.free - a.free);
        const slot = remaining[0];
        const take = Math.min(Math.max(slot.free, 1), list.length - i);
        for (let j = 0; j < take; j++) map[list[i++].id] = slot.cid;
        slot.free -= take;
      }
    }
    noData.forEach((s) => {
      remaining.sort((a, b) => b.free - a.free);
      const slot = remaining[0];
      map[s.id] = slot.cid;
      slot.free--;
    });
    return map;
  }
  return null;
}

const fmt1 = (n) => (n == null ? '—' : Number(n).toFixed(1));

export default function SmartAssignModal({ level, year, onClose, onApplied }) {
  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState(null);
  const [error, setError] = useState('');
  const [strategy, setStrategy] = useState(null);
  const [subject, setSubject] = useState('');
  const [ai, setAi] = useState(null);         // { analyse, recommandations, vigilance }
  const [aiState, setAiState] = useState('idle'); // idle | loading | done | error
  const [aiError, setAiError] = useState('');
  const [applying, setApplying] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [openClass, setOpenClass] = useState(null); // détail dépliable

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await api(`/api/admin/levels/assignment-analytics?level=${encodeURIComponent(level)}&academicYear=${encodeURIComponent(year || '')}`);
        if (!alive) return;
        setAnalytics(data);
        if (data.subjects?.length) setSubject(data.subjects[0]);
      } catch (e) {
        if (alive) setError(e.message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [level, year]);

  const proposal = useMemo(
    () => (analytics && strategy ? buildProposal(strategy, subject, analytics) : null),
    [analytics, strategy, subject],
  );

  // Aperçu avant/après par classe : effectif, moyenne, filles, mouvements.
  const preview = useMemo(() => {
    if (!analytics) return null;
    const mk = () => { const m = {}; analytics.classes.forEach((c) => { m[c.id] = { count: 0, sum: 0, n: 0, girls: 0 }; }); return m; };
    const before = mk();
    analytics.students.forEach((s) => {
      const b = before[s.class_id];
      if (!b) return;
      b.count++;
      if (s.avg != null) { b.sum += s.avg; b.n++; }
      if (String(s.gender || '').toUpperCase() === 'F') b.girls++;
    });
    if (!proposal) return { before, after: null, moves: 0, byClass: null };
    const after = mk();
    const byClass = {};
    analytics.classes.forEach((c) => { byClass[c.id] = []; });
    let moves = 0;
    analytics.students.forEach((s) => {
      const target = proposal[s.id] ?? s.class_id;
      const a = after[target];
      if (!a) return;
      a.count++;
      if (s.avg != null) { a.sum += s.avg; a.n++; }
      if (String(s.gender || '').toUpperCase() === 'F') a.girls++;
      const moved = target !== s.class_id;
      if (moved) moves++;
      byClass[target].push({ ...s, moved });
    });
    Object.values(byClass).forEach((list) => list.sort((a, b) => (scoreOf(b) ?? 0) - (scoreOf(a) ?? 0)));
    return { before, after, moves, byClass };
  }, [analytics, proposal]);

  const runAi = useCallback(async () => {
    setAiState('loading');
    setAiError('');
    try {
      const data = await api('/api/admin/levels/ai-suggest', {
        method: 'POST',
        body: JSON.stringify({ level, academicYear: year }),
      });
      setAi(data);
      setAiState('done');
    } catch (e) {
      setAiState('error');
      setAiError(e.message);
    }
  }, [level, year]);

  const pickRecommendation = useCallback((rec) => {
    if (!STRATEGIES[rec.strategie]) return;
    setStrategy(rec.strategie);
    setConfirming(false);
    if (rec.strategie === 'matiere' && rec.matiere && analytics?.subjects?.length) {
      const found = analytics.subjects.find(
        (s) => s.toLowerCase() === String(rec.matiere).toLowerCase()
      ) || analytics.subjects.find(
        (s) => s.toLowerCase().includes(String(rec.matiere).toLowerCase())
      );
      if (found) setSubject(found);
    }
  }, [analytics]);

  const apply = useCallback(async () => {
    if (!proposal || !preview) return;
    setApplying(true);
    setError('');
    try {
      const groups = {};
      analytics.students.forEach((s) => {
        const t = proposal[s.id];
        if (t && t !== s.class_id) (groups[t] || (groups[t] = [])).push(s.id);
      });
      for (const [classId, ids] of Object.entries(groups)) {
        await api('/api/admin/students/bulk-move', {
          method: 'PUT',
          body: JSON.stringify({ studentIds: ids, classId, academicYear: year }),
        });
      }
      onApplied(preview.moves);
      onClose();
    } catch (e) {
      setError(`Application partielle ou échouée : ${e.message} — vérifiez la répartition puis réessayez.`);
      setApplying(false);
      setConfirming(false);
    }
  }, [proposal, preview, analytics, year, onApplied, onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4">
      <Motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 28 }}
        className="bg-slate-50 rounded-2xl shadow-2xl w-full max-w-5xl h-[94vh] flex flex-col overflow-hidden"
      >
        {/* En-tête */}
        <div className="flex items-center gap-3 px-4 py-3 bg-card border-b border-border">
          <div className="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
            <Wand2 className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h2 className="font-semibold leading-tight">Répartition intelligente — {level}</h2>
            <p className="text-xs text-muted-foreground">
              {analytics ? `${analytics.students.length} élèves · ${analytics.classes.length} classes · ${analytics.subjects.length} matières notées` : '…'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="ml-auto p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
            aria-label="Fermer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground gap-2">
            <Loader2 className="w-5 h-5 animate-spin" /> Analyse des données du niveau…
          </div>
        ) : !analytics || analytics.classes.length < 2 ? (
          <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground px-8 text-center">
            {error || 'Il faut au moins 2 classes dans ce niveau pour proposer une répartition.'}
          </div>
        ) : (
          <div className="flex-1 overflow-auto p-4 space-y-4">
            {/* Panneau IA */}
            <div className="rounded-2xl border border-indigo-200 bg-indigo-50/60 p-3">
              <div className="flex items-center gap-2">
                <Bot className="w-4 h-4 text-indigo-600" />
                <p className="text-sm font-semibold text-indigo-800">Analyse IA du niveau</p>
                {aiState !== 'done' && (
                  <button
                    onClick={runAi}
                    disabled={aiState === 'loading'}
                    className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg
                      bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60"
                  >
                    {aiState === 'loading'
                      ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Analyse en cours…</>
                      : <><Sparkles className="w-3.5 h-3.5" /> Analyser avec l'IA</>}
                  </button>
                )}
              </div>
              {aiState === 'idle' && (
                <p className="text-xs text-indigo-700/80 mt-1.5">
                  L'IA lit les notes, moyennes par matière et absences réelles de tous les élèves du niveau,
                  puis recommande les stratégies les plus adaptées. Les placements restent calculés par des règles
                  transparentes — l'IA conseille, vous décidez.
                </p>
              )}
              {aiState === 'error' && (
                <p className="text-xs text-red-600 mt-1.5 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" /> {aiError}
                </p>
              )}
              {aiState === 'done' && ai && (
                <div className="mt-2 space-y-2.5">
                  <p className="text-xs leading-relaxed text-indigo-900 whitespace-pre-line">{ai.analyse}</p>
                  {ai.recommandations?.length > 0 && (
                    <div className="grid sm:grid-cols-2 gap-2">
                      {ai.recommandations.map((r, i) => (
                        <button
                          key={i}
                          onClick={() => pickRecommendation(r)}
                          className={[
                            'text-left rounded-xl border p-2.5 transition-colors',
                            strategy === r.strategie
                              ? 'border-indigo-500 bg-white ring-1 ring-indigo-300'
                              : 'border-indigo-200 bg-white/70 hover:border-indigo-400',
                          ].join(' ')}
                        >
                          <p className="text-xs font-semibold text-indigo-800 flex items-center gap-1.5">
                            <span className="w-4 h-4 rounded-full bg-indigo-600 text-white text-[9px] flex items-center justify-center">{i + 1}</span>
                            {r.titre || STRATEGIES[r.strategie]?.title || r.strategie}
                            {r.matiere ? ` · ${r.matiere}` : ''}
                          </p>
                          <p className="text-[11px] text-indigo-900/80 mt-1">{r.raison}</p>
                        </button>
                      ))}
                    </div>
                  )}
                  {ai.vigilance?.length > 0 && (
                    <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2">
                      <p className="font-semibold mb-1 flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5" /> Élèves à suivre de près
                      </p>
                      <ul className="space-y-0.5">
                        {ai.vigilance.map((v, i) => (
                          <li key={i}><span className="font-medium">{v.eleve}</span> — {v.conseil}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Choix de la stratégie */}
            <div>
              <p className="text-sm font-semibold mb-2">Choisissez une stratégie de répartition</p>
              <div className="grid sm:grid-cols-2 gap-2.5">
                {Object.entries(STRATEGIES).map(([key, s]) => {
                  const Icon = s.icon;
                  const active = strategy === key;
                  return (
                    <button
                      key={key}
                      onClick={() => { setStrategy(key); setConfirming(false); }}
                      className={[
                        'text-left rounded-2xl border p-3 transition-all',
                        active
                          ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200'
                          : 'border-border bg-card hover:border-indigo-300',
                      ].join(' ')}
                    >
                      <p className="text-sm font-semibold flex items-center gap-2">
                        <Icon className={`w-4 h-4 ${active ? 'text-indigo-600' : 'text-muted-foreground'}`} />
                        {s.title}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-1">{s.desc}</p>
                      {key === 'matiere' && active && analytics.subjects.length > 0 && (
                        <select
                          value={subject}
                          onChange={(e) => setSubject(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          className="mt-2 w-full px-2 py-1 rounded-lg border border-border bg-card text-xs
                            focus:outline-none focus:ring-2 focus:ring-indigo-300"
                        >
                          {analytics.subjects.map((sub) => <option key={sub} value={sub}>{sub}</option>)}
                        </select>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Aperçu avant / après */}
            {proposal && preview?.after && (
              <div>
                <p className="text-sm font-semibold mb-2">
                  Aperçu — <span className="text-indigo-600">{preview.moves} déplacement{preview.moves > 1 ? 's' : ''}</span>
                </p>
                <div className="rounded-2xl border border-border bg-card overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-muted-foreground border-b border-border bg-muted/40">
                        <th className="text-left px-3 py-2 font-medium">Classe</th>
                        <th className="px-2 py-2 font-medium">Effectif</th>
                        <th className="px-2 py-2 font-medium">Moyenne</th>
                        <th className="px-2 py-2 font-medium">Filles</th>
                        <th className="px-2 py-2 font-medium"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {analytics.classes.map((c) => {
                        const b = preview.before[c.id];
                        const a = preview.after[c.id];
                        const avgB = b.n ? b.sum / b.n : null;
                        const avgA = a.n ? a.sum / a.n : null;
                        const open = openClass === c.id;
                        return (
                          <FragmentRow
                            key={c.id}
                            cls={c}
                            b={b} a={a} avgB={avgB} avgA={avgA}
                            open={open}
                            onToggle={() => setOpenClass(open ? null : c.id)}
                            students={preview.byClass[c.id]}
                          />
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {error && (
              <p className="text-xs text-red-600 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
              </p>
            )}
          </div>
        )}

        {/* Pied : application */}
        {!loading && analytics && analytics.classes.length >= 2 && (
          <div className="px-4 py-3 bg-card border-t border-border flex items-center gap-3">
            <p className="text-xs text-muted-foreground">
              {proposal
                ? 'Vérifiez l\'aperçu ci-dessus : rien n\'est modifié tant que vous n\'appliquez pas.'
                : 'Sélectionnez une stratégie (ou lancez l\'analyse IA) pour voir l\'aperçu.'}
            </p>
            <div className="ml-auto flex items-center gap-2">
              {confirming && (
                <span className="text-xs text-amber-700 font-medium">
                  Confirmer {preview?.moves} déplacement{preview?.moves > 1 ? 's' : ''} ?
                </span>
              )}
              <button
                onClick={() => (confirming ? apply() : setConfirming(true))}
                disabled={!proposal || applying || (preview?.moves ?? 0) === 0}
                className={[
                  'inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg disabled:opacity-40',
                  confirming ? 'bg-amber-600 text-white hover:bg-amber-700' : 'bg-indigo-600 text-white hover:bg-indigo-700',
                ].join(' ')}
              >
                {applying
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Application…</>
                  : confirming
                    ? <>Oui, appliquer</>
                    : <>Appliquer la répartition</>}
              </button>
              {confirming && !applying && (
                <button
                  onClick={() => setConfirming(false)}
                  className="px-3 py-2 text-sm rounded-lg border border-border bg-card hover:bg-muted"
                >
                  Non
                </button>
              )}
            </div>
          </div>
        )}
      </Motion.div>
    </div>
  );
}

// Ligne de classe + détail dépliable (liste des élèves proposés).
function FragmentRow({ cls, b, a, avgB, avgA, open, onToggle, students }) {
  const delta = (x, y) => (x == null || y == null ? null : y - x);
  const dAvg = delta(avgB, avgA);
  return (
    <>
      <tr className="border-b border-border/60 hover:bg-muted/30 cursor-pointer" onClick={onToggle}>
        <td className="px-3 py-2 font-medium">
          <span className="inline-flex items-center gap-1.5">
            <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${open ? '' : '-rotate-90'}`} />
            {cls.name}
          </span>
        </td>
        <td className="px-2 py-2 text-center">
          {b.count} <ArrowRight className="w-3 h-3 inline text-muted-foreground" /> <span className="font-semibold">{a.count}</span>
        </td>
        <td className="px-2 py-2 text-center">
          {fmt1(avgB)} <ArrowRight className="w-3 h-3 inline text-muted-foreground" />{' '}
          <span className="font-semibold">{fmt1(avgA)}</span>
          {dAvg != null && Math.abs(dAvg) >= 0.05 && (
            <span className={`ml-1 ${dAvg > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
              ({dAvg > 0 ? '+' : ''}{dAvg.toFixed(1)})
            </span>
          )}
        </td>
        <td className="px-2 py-2 text-center">
          {b.girls} <ArrowRight className="w-3 h-3 inline text-muted-foreground" /> <span className="font-semibold">{a.girls}</span>
        </td>
        <td className="px-2 py-2 text-center text-muted-foreground">
          {students.filter((s) => s.moved).length} arrivée{students.filter((s) => s.moved).length > 1 ? 's' : ''}
        </td>
      </tr>
      {open && (
        <tr className="border-b border-border/60 bg-muted/20">
          <td colSpan={5} className="px-3 py-2">
            <div className="flex flex-wrap gap-1.5">
              {students.map((s) => (
                <span
                  key={s.id}
                  className={[
                    'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[11px]',
                    s.moved ? 'border-indigo-300 bg-indigo-50 text-indigo-800' : 'border-border bg-card',
                  ].join(' ')}
                >
                  {s.moved && <ArrowRight className="w-3 h-3" />}
                  {fullName(s)}
                  <span className="text-muted-foreground">{s.avg != null ? fmt1(s.avg) : '—'}</span>
                </span>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
