import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion as Motion } from 'framer-motion';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Legend,
} from 'recharts';
import {
  X, Loader2, FileText, Sparkles, Plus, Trash2, Save, AlertTriangle, Check,
  TrendingUp, TrendingDown, Minus, GraduationCap, ClipboardList, MessageSquareText,
  Users, Route, BarChart3, Printer, ListPlus,
} from 'lucide-react';
import { Avatar } from '../directory/ui';
import { supabase } from '../../lib/supabase';
import { printHtmlDocument } from '../../lib/download';

// ─────────────────────────────────────────────────────────────────────────────
// Dossier élève 360° — vue conseil pédagogique : parcours de la crèche au bac,
// courbes d'évolution générale et par matière, forces / faiblesses calculées,
// tests diagnostiques, observations des professeurs, contexte familial, et
// rapport détaillé généré à la demande par l'IA.
// Chaque section propose la SAISIE des données manquantes, à l'unité ou en
// vrac (coller plusieurs lignes d'un coup). Tables : ADD_STUDENT_DOSSIER.sql.
// ─────────────────────────────────────────────────────────────────────────────

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const resolveAsset = (u) => (!u ? null : (u.startsWith('http') ? u : `${API_URL}${u.startsWith('/') ? '' : '/'}${u}`));
const fullName = (s) => `${s?.first_name || ''} ${s?.last_name || ''}`.trim();

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

const fmt = (n, d = 2) => (n == null || Number.isNaN(Number(n)) ? '—' : Number(n).toFixed(d));
const noteColor = (n) => {
  if (n == null) return 'text-muted-foreground';
  if (n >= 14) return 'text-emerald-600';
  if (n >= 12) return 'text-blue-600';
  if (n >= 10) return 'text-amber-600';
  return 'text-red-600';
};
// Tri des années scolaires « 2018/2019 » ou « 2018-2019 ».
const yearKey = (y) => String(y || '').replace(/\D/g, '').slice(0, 4);

const CATEGORIES = {
  pedagogique: 'Pédagogique',
  comportement: 'Comportement',
  orientation: 'Orientation',
  famille: 'Famille',
  sante: 'Santé',
  autre: 'Autre',
};
const MASTERY = { acquis: 'Acquis', en_cours: 'En cours', non_acquis: 'Non acquis' };

const TABS = [
  { key: 'synthese', label: 'Synthèse', icon: BarChart3 },
  { key: 'parcours', label: 'Parcours', icon: Route },
  { key: 'resultats', label: 'Résultats', icon: GraduationCap },
  { key: 'diagnostics', label: 'Diagnostics', icon: ClipboardList },
  { key: 'observations', label: 'Observations', icon: MessageSquareText },
  { key: 'famille', label: 'Famille', icon: Users },
  { key: 'rapport', label: 'Rapport IA', icon: FileText },
];

// Petit rendu markdown (titres ##, listes, gras) — suffisant pour le rapport.
function renderReport(md) {
  return md.split('\n').map((line, i) => {
    const t = line.trim();
    if (!t) return <div key={i} className="h-2" />;
    if (t.startsWith('## ')) {
      return <h3 key={i} className="text-sm font-semibold text-indigo-700 mt-4 mb-1.5 pb-1 border-b border-indigo-100">{t.slice(3)}</h3>;
    }
    if (t.startsWith('# ')) return <h2 key={i} className="text-base font-semibold mt-3 mb-1">{t.slice(2)}</h2>;
    const bold = (s) => s.split(/(\*\*[^*]+\*\*)/g).map((p, j) => (
      p.startsWith('**') && p.endsWith('**')
        ? <strong key={j} className="font-semibold">{p.slice(2, -2)}</strong>
        : <span key={j}>{p}</span>
    ));
    if (/^[-*•]\s/.test(t)) {
      return <p key={i} className="text-[13px] leading-relaxed pl-4 relative before:content-['•'] before:absolute before:left-1 before:text-indigo-400">{bold(t.replace(/^[-*•]\s/, ''))}</p>;
    }
    return <p key={i} className="text-[13px] leading-relaxed">{bold(t)}</p>;
  });
}

// ── Zone de saisie en vrac : on colle plusieurs lignes, séparateur ; ou tab ──
function BulkPaste({ placeholder, columns, onParse, onSubmit, busy }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const rows = useMemo(() => (text.trim() ? onParse(text) : []), [text, onParse]);
  const valid = rows.filter((r) => r.__valid);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-border bg-card hover:bg-muted"
      >
        <ListPlus className="w-3.5 h-3.5" /> Saisie en vrac
      </button>
    );
  }
  return (
    <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-3 space-y-2">
      <p className="text-xs font-medium text-indigo-800">
        Collez plusieurs lignes (une par enregistrement) — colonnes séparées par « ; », une tabulation ou une virgule.
      </p>
      <p className="text-[11px] text-indigo-700/80 font-mono">{columns}</p>
      <textarea
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        placeholder={placeholder}
        className="w-full px-2.5 py-2 text-xs font-mono rounded-lg border border-border bg-card
          focus:outline-none focus:ring-2 focus:ring-indigo-300"
      />
      {rows.length > 0 && (
        <div className="max-h-32 overflow-auto rounded-lg border border-border bg-card">
          <table className="w-full text-[11px]">
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className={r.__valid ? '' : 'bg-red-50 text-red-600'}>
                  <td className="px-2 py-1 w-5">{r.__valid ? <Check className="w-3 h-3 text-emerald-600" /> : <X className="w-3 h-3" />}</td>
                  <td className="px-2 py-1">{r.__preview}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex items-center gap-2">
        <button
          onClick={() => onSubmit(valid).then(() => { setText(''); setOpen(false); })}
          disabled={!valid.length || busy}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg
            bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
          Ajouter {valid.length > 0 ? `${valid.length} ligne${valid.length > 1 ? 's' : ''}` : ''}
        </button>
        <button
          onClick={() => { setOpen(false); setText(''); }}
          className="px-3 py-1.5 text-xs rounded-lg border border-border bg-card hover:bg-muted"
        >
          Annuler
        </button>
      </div>
    </div>
  );
}

const splitCells = (line) => line.split(/\t|;|,(?![^(]*\))/).map((c) => c.trim());

export default function StudentDossierModal({ student, onClose }) {
  const [tab, setTab] = useState('synthese');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState(null);
  const [reportState, setReportState] = useState('idle');

  const reload = useCallback(async () => {
    const d = await api(`/api/admin/dossier/students/${student.id}`);
    setData(d);
    return d;
  }, [student.id]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const d = await api(`/api/admin/dossier/students/${student.id}`);
        if (alive) setData(d);
      } catch (e) {
        if (alive) setError(e.message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [student.id]);

  // ── Agrégations pour les courbes et la synthèse ───────────────────────────
  const analysis = useMemo(() => {
    if (!data) return null;

    // Moyenne générale par année : bulletins d'abord, sinon contrôles, plus le
    // parcours antérieur saisi à la main (crèche, autres écoles).
    const general = {};
    (data.external_records || []).forEach((r) => {
      if (r.general_average != null) {
        general[r.academic_year] = { year: r.academic_year, note: Number(r.general_average), source: 'antérieur' };
      }
    });
    const bulByYear = {};
    (data.bulletins || []).forEach((b) => {
      if (b.general_average == null) return;
      const e = bulByYear[b.academic_year] || (bulByYear[b.academic_year] = { sum: 0, n: 0 });
      e.sum += Number(b.general_average); e.n++;
    });
    Object.entries(bulByYear).forEach(([y, e]) => {
      general[y] = { year: y, note: e.sum / e.n, source: 'bulletin' };
    });
    const ctlByYear = {};
    (data.controls || []).forEach((c) => {
      if (!c.academic_year) return;
      const e = ctlByYear[c.academic_year] || (ctlByYear[c.academic_year] = { sum: 0, n: 0 });
      e.sum += c.note; e.n++;
    });
    Object.entries(ctlByYear).forEach(([y, e]) => {
      if (!general[y]) general[y] = { year: y, note: e.sum / e.n, source: 'contrôles' };
    });
    const generalCurve = Object.values(general)
      .sort((a, b) => yearKey(a.year).localeCompare(yearKey(b.year)))
      .map((p) => ({ ...p, note: Math.round(p.note * 100) / 100 }));

    // Moyennes par matière et par année (bulletins prioritaires sur contrôles).
    const subjYear = {};
    const bulById = {};
    (data.bulletins || []).forEach((b) => { bulById[b.id] = b; });
    (data.bulletin_lines || []).forEach((l) => {
      const b = bulById[l.bulletin_id];
      if (!b || l.note_20 == null) return;
      const k = `${b.academic_year}|${l.subject_name}`;
      const e = subjYear[k] || (subjYear[k] = { sum: 0, n: 0, fromBulletin: true });
      e.sum += Number(l.note_20); e.n++;
    });
    (data.controls || []).forEach((c) => {
      if (!c.subject || !c.academic_year) return;
      const k = `${c.academic_year}|${c.subject}`;
      if (subjYear[k]?.fromBulletin) return;
      const e = subjYear[k] || (subjYear[k] = { sum: 0, n: 0 });
      e.sum += c.note; e.n++;
    });
    const subjects = [...new Set(Object.keys(subjYear).map((k) => k.split('|')[1]))].sort((a, b) => a.localeCompare(b, 'fr'));
    const years = [...new Set(Object.keys(subjYear).map((k) => k.split('|')[0]))]
      .sort((a, b) => yearKey(a).localeCompare(yearKey(b)));
    const subjectCurve = years.map((y) => {
      const row = { year: y };
      subjects.forEach((s) => {
        const e = subjYear[`${y}|${s}`];
        if (e) row[s] = Math.round((e.sum / e.n) * 100) / 100;
      });
      return row;
    });

    // Moyenne globale par matière (toutes années) → forces / faiblesses.
    const subjAvg = subjects.map((s) => {
      let sum = 0, n = 0;
      years.forEach((y) => {
        const e = subjYear[`${y}|${s}`];
        if (e) { sum += e.sum / e.n; n++; }
      });
      return { subject: s, avg: n ? sum / n : null, years: n };
    }).filter((x) => x.avg != null).sort((a, b) => b.avg - a.avg);

    // Tendance : comparaison des deux dernières années disponibles.
    let trend = null;
    if (generalCurve.length >= 2) {
      const last = generalCurve[generalCurve.length - 1].note;
      const prev = generalCurve[generalCurve.length - 2].note;
      trend = { delta: last - prev, dir: last - prev > 0.5 ? 'up' : last - prev < -0.5 ? 'down' : 'flat' };
    }

    const overall = generalCurve.length
      ? generalCurve.reduce((a, p) => a + p.note, 0) / generalCurve.length
      : null;

    const att = Object.entries(data.attendance || {}).sort((a, b) => yearKey(a[0]).localeCompare(yearKey(b[0])));
    const totalAbs = att.reduce((a, [, v]) => a + (v.absences || 0), 0);
    const totalInc = att.reduce((a, [, v]) => a + (v.incidents || 0), 0);

    // Frise chronologique : parcours antérieur + inscriptions internes.
    const timeline = [
      ...(data.external_records || []).map((r) => ({
        id: `ext-${r.id}`, year: r.academic_year, level: r.level, place: r.school_name,
        avg: r.general_average, remarks: r.remarks, external: true, raw: r,
      })),
      ...(data.enrollments || []).map((e, i) => ({
        id: `enr-${i}`, year: e.academic_year, level: e.class?.level, place: e.class?.name,
        avg: bulByYear[e.academic_year] ? bulByYear[e.academic_year].sum / bulByYear[e.academic_year].n : null,
        status: e.status, external: false,
      })),
    ].sort((a, b) => yearKey(a.year).localeCompare(yearKey(b.year)));

    return {
      generalCurve, subjectCurve, subjects, subjAvg, trend, overall,
      strengths: subjAvg.slice(0, 3), weaknesses: [...subjAvg].reverse().slice(0, 3),
      attendance: att, totalAbs, totalInc, timeline,
    };
  }, [data]);

  // ── Actions de saisie ─────────────────────────────────────────────────────
  const post = useCallback(async (path, body, method = 'POST') => {
    setBusy(true);
    setError('');
    try {
      await api(path, { method, body: JSON.stringify(body) });
      await reload();
    } catch (e) {
      setError(e.message);
      throw e;
    } finally {
      setBusy(false);
    }
  }, [reload]);

  const del = useCallback(async (path) => {
    setBusy(true);
    try {
      await api(path, { method: 'DELETE' });
      await reload();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }, [reload]);

  const genReport = useCallback(async () => {
    setReportState('loading');
    setError('');
    try {
      const r = await api(`/api/admin/dossier/students/${student.id}/report`, { method: 'POST' });
      setReport(r);
      setReportState('done');
    } catch (e) {
      setError(e.message);
      setReportState('error');
    }
  }, [student.id]);

  const printReport = useCallback(() => {
    if (!report?.report) return;
    const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    const body = report.report.split('\n').map((l) => {
      const t = l.trim();
      if (!t) return '';
      if (t.startsWith('## ')) return `<h2>${esc(t.slice(3))}</h2>`;
      if (/^[-*•]\s/.test(t)) return `<li>${esc(t.replace(/^[-*•]\s/, ''))}</li>`;
      return `<p>${esc(t)}</p>`;
    }).join('');
    printHtmlDocument(
      `<h1>Rapport pédagogique — ${esc(fullName(data?.student || student))}</h1>
       <p class="meta">${esc(data?.current_class?.name || '')} · Généré le ${new Date(report.generated_at).toLocaleString('fr-FR')}</p>
       ${body}
       <style>body{font-family:system-ui,sans-serif;max-width:800px;margin:2rem auto;line-height:1.6;color:#1e293b}
       h1{font-size:20px;margin-bottom:4px}h2{font-size:14px;color:#4338ca;margin-top:20px;border-bottom:1px solid #e0e7ff;padding-bottom:4px}
       p{font-size:13px}li{font-size:13px}.meta{color:#64748b;font-size:12px;margin-bottom:20px}</style>`,
      { title: `Rapport — ${fullName(data?.student || student)}` },
    );
  }, [report, data, student]);

  const s = data?.student || student;
  const missing = data?.missing_tables?.length > 0;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4">
      <Motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 28 }}
        className="bg-slate-50 rounded-2xl shadow-2xl w-full max-w-5xl h-[95vh] flex flex-col overflow-hidden"
      >
        {/* En-tête */}
        <div className="flex items-center gap-3 px-4 py-3 bg-card border-b border-border">
          <Avatar name={fullName(s)} src={resolveAsset(s.avatar_url)} gender={s.gender} size="lg" />
          <div className="min-w-0">
            <h2 className="font-semibold leading-tight truncate">Dossier de {fullName(s)}</h2>
            <p className="text-xs text-muted-foreground">
              {data?.current_class ? `${data.current_class.name} · ${data.current_class.level || ''}` : 'Sans classe'}
              {s.massar_code ? ` · MASSAR ${s.massar_code}` : ''}
              {s.date_of_birth ? ` · né(e) le ${new Date(s.date_of_birth).toLocaleDateString('fr-FR')}` : ''}
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

        {/* Onglets */}
        <div className="flex gap-0.5 px-2 pt-2 bg-card border-b border-border overflow-x-auto">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={[
                  'inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t-lg whitespace-nowrap transition-colors',
                  active
                    ? 'bg-slate-50 text-indigo-700 border-x border-t border-border -mb-px'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
                ].join(' ')}
              >
                <Icon className="w-3.5 h-3.5" /> {t.label}
              </button>
            );
          })}
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground gap-2">
            <Loader2 className="w-5 h-5 animate-spin" /> Chargement du dossier…
          </div>
        ) : (
          <div className="flex-1 overflow-auto p-4 space-y-4">
            {missing && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                Certaines sections nécessitent la migration <code className="font-mono">ADD_STUDENT_DOSSIER.sql</code> (à exécuter dans Supabase).
              </p>
            )}
            {error && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
              </p>
            )}

            {tab === 'synthese' && <SyntheseTab data={data} analysis={analysis} />}
            {tab === 'parcours' && (
              <ParcoursTab data={data} analysis={analysis} busy={busy} onAdd={post} onDelete={del} studentId={s.id} />
            )}
            {tab === 'resultats' && <ResultatsTab data={data} analysis={analysis} />}
            {tab === 'diagnostics' && (
              <DiagnosticsTab data={data} busy={busy} onAdd={post} onDelete={del} studentId={s.id} />
            )}
            {tab === 'observations' && (
              <ObservationsTab data={data} busy={busy} onAdd={post} onDelete={del} studentId={s.id} />
            )}
            {tab === 'famille' && <FamilleTab data={data} busy={busy} onSave={post} studentId={s.id} />}
            {tab === 'rapport' && (
              <RapportTab
                report={report} state={reportState} onGenerate={genReport} onPrint={printReport}
              />
            )}
          </div>
        )}
      </Motion.div>
    </div>
  );
}

// ── Onglet Synthèse ──────────────────────────────────────────────────────────
function SyntheseTab({ data, analysis }) {
  if (!analysis) return null;
  const TrendIcon = analysis.trend?.dir === 'up' ? TrendingUp : analysis.trend?.dir === 'down' ? TrendingDown : Minus;
  const trendColor = analysis.trend?.dir === 'up' ? 'text-emerald-600' : analysis.trend?.dir === 'down' ? 'text-red-500' : 'text-muted-foreground';
  const gaps = [];
  if (!data.family) gaps.push('contexte familial');
  if (!data.diagnostics?.length) gaps.push('tests diagnostiques');
  if (!data.external_records?.length) gaps.push('parcours avant l\'école (crèche, maternelle…)');
  if (!data.observations?.length) gaps.push('observations des professeurs');

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <Stat label="Moyenne (toutes années)" value={fmt(analysis.overall)} accent={noteColor(analysis.overall)} />
        <Stat
          label="Tendance"
          value={analysis.trend ? `${analysis.trend.delta > 0 ? '+' : ''}${fmt(analysis.trend.delta, 1)}` : '—'}
          icon={<TrendIcon className={`w-4 h-4 ${trendColor}`} />}
        />
        <Stat label="Absences cumulées" value={analysis.totalAbs} />
        <Stat label="Années suivies" value={analysis.timeline.length} />
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <Section title="Points forts" icon={TrendingUp} tone="emerald">
          {analysis.strengths.length ? (
            <ul className="space-y-1">
              {analysis.strengths.map((x) => (
                <li key={x.subject} className="flex items-center justify-between text-xs">
                  <span>{x.subject}</span>
                  <span className={`font-semibold ${noteColor(x.avg)}`}>{fmt(x.avg)}/20</span>
                </li>
              ))}
            </ul>
          ) : <Empty>Pas encore de notes par matière.</Empty>}
        </Section>
        <Section title="Points de vigilance" icon={TrendingDown} tone="red">
          {analysis.weaknesses.length ? (
            <ul className="space-y-1">
              {analysis.weaknesses.map((x) => (
                <li key={x.subject} className="flex items-center justify-between text-xs">
                  <span>{x.subject}</span>
                  <span className={`font-semibold ${noteColor(x.avg)}`}>{fmt(x.avg)}/20</span>
                </li>
              ))}
            </ul>
          ) : <Empty>Pas encore de notes par matière.</Empty>}
        </Section>
      </div>

      <Section title="Évolution de la moyenne générale" icon={BarChart3}>
        {analysis.generalCurve.length >= 2 ? (
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={analysis.generalCurve} margin={{ top: 5, right: 10, bottom: 5, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 20]} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => [`${v}/20`, 'Moyenne']} />
                <ReferenceLine y={10} stroke="#f59e0b" strokeDasharray="4 4" />
                <Line type="monotone" dataKey="note" stroke="#4f46e5" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : <Empty>Il faut au moins deux années de données pour tracer la courbe. Ajoutez le parcours antérieur dans l'onglet « Parcours ».</Empty>}
      </Section>

      {gaps.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs font-semibold text-amber-800 flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4" /> Données manquantes pour une orientation fiable
          </p>
          <p className="text-[11px] text-amber-800/90 mt-1">
            Il manque : {gaps.join(', ')}. Renseignez-les dans les onglets correspondants — chaque section accepte
            aussi la saisie en vrac.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Onglet Parcours (crèche → bac) ───────────────────────────────────────────
function ParcoursTab({ data, analysis, busy, onAdd, onDelete, studentId }) {
  const [form, setForm] = useState({ academic_year: '', level: '', school_name: '', general_average: '', remarks: '' });

  const parseBulk = useCallback((text) => text.split('\n').filter((l) => l.trim()).map((line) => {
    const [academic_year, level, school_name, general_average, remarks] = splitCells(line);
    const ok = /\d{4}/.test(academic_year || '');
    return {
      academic_year, level, school_name,
      general_average: general_average || null,
      remarks: remarks || null,
      __valid: ok,
      __preview: ok
        ? `${academic_year} · ${level || '—'} · ${school_name || '—'} · ${general_average || '—'}`
        : `Année invalide : « ${line.slice(0, 40)} »`,
    };
  }), []);

  const submitBulk = useCallback(
    (rows) => onAdd(`/api/admin/dossier/students/${studentId}/external-records`, { items: rows }),
    [onAdd, studentId],
  );

  return (
    <div className="space-y-4">
      <Section title="Frise du parcours" icon={Route}>
        {analysis?.timeline?.length ? (
          <ol className="space-y-1.5">
            {analysis.timeline.map((t) => (
              <li key={t.id} className="flex items-center gap-2.5 text-xs">
                <span className="w-20 shrink-0 font-mono text-muted-foreground">{t.year}</span>
                <span className={`w-2 h-2 rounded-full shrink-0 ${t.external ? 'bg-slate-400' : 'bg-indigo-500'}`} />
                <span className="font-medium">{t.level || '—'}</span>
                <span className="text-muted-foreground truncate">{t.place || ''}</span>
                {t.external && <span className="text-[10px] bg-slate-100 text-slate-600 rounded-full px-1.5">antérieur</span>}
                {t.status && <span className="text-[10px] bg-indigo-50 text-indigo-700 rounded-full px-1.5">{t.status}</span>}
                <span className={`ml-auto font-semibold ${noteColor(t.avg)}`}>{t.avg != null ? `${fmt(t.avg)}/20` : ''}</span>
              </li>
            ))}
          </ol>
        ) : <Empty>Aucun parcours enregistré.</Empty>}
      </Section>

      <Section title="Parcours avant notre école (crèche, maternelle, autre établissement)" icon={Plus}>
        <div className="space-y-2">
          <div className="grid sm:grid-cols-5 gap-1.5">
            <input value={form.academic_year} onChange={(e) => setForm({ ...form, academic_year: e.target.value })}
              placeholder="2018/2019" className={inputCls} />
            <input value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })}
              placeholder="Niveau (GS…)" className={inputCls} />
            <input value={form.school_name} onChange={(e) => setForm({ ...form, school_name: e.target.value })}
              placeholder="Établissement" className={inputCls} />
            <input value={form.general_average} onChange={(e) => setForm({ ...form, general_average: e.target.value })}
              placeholder="Moyenne /20" type="number" step="0.01" className={inputCls} />
            <input value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })}
              placeholder="Remarques" className={inputCls} />
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onAdd(`/api/admin/dossier/students/${studentId}/external-records`, form)
                .then(() => setForm({ academic_year: '', level: '', school_name: '', general_average: '', remarks: '' }))
                .catch(() => {})}
              disabled={!/\d{4}/.test(form.academic_year) || busy}
              className={btnPrimary}
            >
              <Plus className="w-3.5 h-3.5" /> Ajouter
            </button>
            <BulkPaste
              columns="année ; niveau ; établissement ; moyenne ; remarques"
              placeholder={'2016/2017 ; Crèche ; Les Petits Pas ; ;\n2017/2018 ; PS ; École Al Amal ; 16.5 ; très bonne adaptation'}
              onParse={parseBulk}
              onSubmit={submitBulk}
              busy={busy}
            />
          </div>
        </div>
        {data.external_records?.length > 0 && (
          <ul className="mt-3 space-y-1">
            {data.external_records.map((r) => (
              <li key={r.id} className="flex items-center gap-2 text-xs border-t border-border pt-1.5">
                <span className="font-mono text-muted-foreground w-20">{r.academic_year}</span>
                <span className="font-medium">{r.level || '—'}</span>
                <span className="text-muted-foreground truncate">{r.school_name || ''}</span>
                <span className={`ml-auto font-semibold ${noteColor(r.general_average)}`}>
                  {r.general_average != null ? `${fmt(r.general_average)}/20` : '—'}
                </span>
                <button onClick={() => onDelete(`/api/admin/dossier/external-records/${r.id}`)}
                  className="text-muted-foreground hover:text-red-600" aria-label="Supprimer">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

// ── Onglet Résultats (courbes par matière + bulletins) ───────────────────────
const LINE_COLORS = ['#4f46e5', '#0d9488', '#d97706', '#db2777', '#2563eb', '#65a30d', '#dc2626', '#7c3aed'];

function ResultatsTab({ data, analysis }) {
  const [shown, setShown] = useState(() => new Set());
  const subjects = analysis?.subjects || [];
  const visible = shown.size ? [...shown] : subjects.slice(0, 5);

  return (
    <div className="space-y-4">
      <Section title="Évolution par matière" icon={GraduationCap}>
        {analysis?.subjectCurve?.length >= 2 && subjects.length ? (
          <>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {subjects.map((s) => {
                const on = visible.includes(s);
                return (
                  <button
                    key={s}
                    onClick={() => setShown((prev) => {
                      const next = new Set(prev.size ? prev : subjects.slice(0, 5));
                      if (next.has(s)) next.delete(s); else next.add(s);
                      return next;
                    })}
                    className={[
                      'text-[11px] px-2 py-0.5 rounded-full border transition-colors',
                      on ? 'text-white border-transparent' : 'bg-card border-border text-muted-foreground',
                    ].join(' ')}
                    style={on ? { backgroundColor: LINE_COLORS[subjects.indexOf(s) % LINE_COLORS.length] } : undefined}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={analysis.subjectCurve} margin={{ top: 5, right: 10, bottom: 5, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 20]} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <ReferenceLine y={10} stroke="#f59e0b" strokeDasharray="4 4" />
                  {visible.map((s) => (
                    <Line key={s} type="monotone" dataKey={s} strokeWidth={2} dot={{ r: 2 }}
                      stroke={LINE_COLORS[subjects.indexOf(s) % LINE_COLORS.length]} connectNulls />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </>
        ) : <Empty>Il faut au moins deux années de notes par matière.</Empty>}
      </Section>

      <Section title="Moyennes par matière (toutes années)" icon={BarChart3}>
        {analysis?.subjAvg?.length ? (
          <div className="space-y-1">
            {analysis.subjAvg.map((x) => (
              <div key={x.subject} className="flex items-center gap-2 text-xs">
                <span className="w-32 truncate">{x.subject}</span>
                <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                  <div className={`h-full rounded-full ${x.avg >= 12 ? 'bg-emerald-500' : x.avg >= 10 ? 'bg-amber-500' : 'bg-red-500'}`}
                    style={{ width: `${Math.min(100, (x.avg / 20) * 100)}%` }} />
                </div>
                <span className={`w-14 text-right font-semibold ${noteColor(x.avg)}`}>{fmt(x.avg)}/20</span>
              </div>
            ))}
          </div>
        ) : <Empty>Aucune note enregistrée.</Empty>}
      </Section>

      {data.bulletins?.length > 0 && (
        <Section title="Bulletins" icon={FileText}>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted-foreground border-b border-border">
                  <th className="text-left py-1.5">Année</th>
                  <th className="py-1.5">Sem.</th>
                  <th className="py-1.5">Moyenne</th>
                  <th className="py-1.5">Rang</th>
                  <th className="py-1.5">Mention</th>
                </tr>
              </thead>
              <tbody>
                {data.bulletins.map((b) => (
                  <tr key={b.id} className="border-b border-border/60">
                    <td className="py-1.5 font-mono">{b.academic_year}</td>
                    <td className="py-1.5 text-center">S{b.semester}</td>
                    <td className={`py-1.5 text-center font-semibold ${noteColor(b.general_average)}`}>{fmt(b.general_average)}</td>
                    <td className="py-1.5 text-center">{b.general_rank ? `${b.general_rank}/${b.total_students_in_class || '?'}` : '—'}</td>
                    <td className="py-1.5 text-center">{b.mention || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {data.exams?.length > 0 && (
        <Section title="Examens de certification" icon={GraduationCap}>
          <ul className="space-y-1 text-xs">
            {data.exams.map((e, i) => (
              <li key={i} className="flex items-center gap-2 border-b border-border/60 pb-1">
                <span className="font-mono text-muted-foreground">{e.academic_year}</span>
                <span className="text-[10px] bg-indigo-50 text-indigo-700 rounded-full px-1.5">{e.exam_type}</span>
                {e.scenario === 'mock' && <span className="text-[10px] bg-amber-50 text-amber-700 rounded-full px-1.5">blanc</span>}
                <span>{e.subject_name}</span>
                <span className={`ml-auto font-semibold ${noteColor(e.note)}`}>{fmt(e.note)}/20</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {analysis?.attendance?.length > 0 && (
        <Section title="Assiduité et comportement par année" icon={ClipboardList}>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-muted-foreground border-b border-border">
                <th className="text-left py-1.5">Année</th>
                <th className="py-1.5">Séances</th>
                <th className="py-1.5">Absences</th>
                <th className="py-1.5">Incidents</th>
                <th className="py-1.5">Performance</th>
              </tr>
            </thead>
            <tbody>
              {analysis.attendance.map(([y, a]) => (
                <tr key={y} className="border-b border-border/60">
                  <td className="py-1.5 font-mono">{y}</td>
                  <td className="py-1.5 text-center">{a.sessions}</td>
                  <td className={`py-1.5 text-center ${a.absences > 10 ? 'text-red-600 font-semibold' : ''}`}>{a.absences}</td>
                  <td className="py-1.5 text-center">{a.incidents}</td>
                  <td className="py-1.5 text-center">{a.performance != null ? `${a.performance}%` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}
    </div>
  );
}

// ── Onglet Diagnostics ───────────────────────────────────────────────────────
function DiagnosticsTab({ data, busy, onAdd, onDelete, studentId }) {
  const [form, setForm] = useState({ subject_name: '', score: '', max_score: '20', mastery: '', label: '', test_date: '', notes: '' });

  const parseBulk = useCallback((text) => text.split('\n').filter((l) => l.trim()).map((line) => {
    const [subject_name, score, mastery, label, test_date] = splitCells(line);
    const ok = !!(subject_name || '').trim();
    const m = { acquis: 'acquis', 'en cours': 'en_cours', en_cours: 'en_cours', 'non acquis': 'non_acquis', non_acquis: 'non_acquis' }[String(mastery || '').toLowerCase()];
    return {
      subject_name, score: score || null, mastery: m || null, label: label || null,
      test_date: test_date || null, max_score: 20,
      __valid: ok,
      __preview: ok ? `${subject_name} · ${score || '—'}/20 · ${MASTERY[m] || '—'}` : `Matière manquante : « ${line.slice(0, 40)} »`,
    };
  }), []);

  const submitBulk = useCallback(
    (rows) => onAdd(`/api/admin/dossier/students/${studentId}/diagnostics`, { items: rows }),
    [onAdd, studentId],
  );

  return (
    <div className="space-y-4">
      <Section title="Nouveau test diagnostique" icon={Plus}>
        <div className="space-y-2">
          <div className="grid sm:grid-cols-4 gap-1.5">
            <input value={form.subject_name} onChange={(e) => setForm({ ...form, subject_name: e.target.value })}
              placeholder="Matière *" className={inputCls} />
            <input value={form.score} onChange={(e) => setForm({ ...form, score: e.target.value })}
              placeholder="Score" type="number" step="0.01" className={inputCls} />
            <select value={form.mastery} onChange={(e) => setForm({ ...form, mastery: e.target.value })} className={inputCls}>
              <option value="">Maîtrise…</option>
              {Object.entries(MASTERY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <input value={form.test_date} onChange={(e) => setForm({ ...form, test_date: e.target.value })}
              type="date" className={inputCls} />
            <input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })}
              placeholder="Intitulé (ex. positionnement septembre)" className={`${inputCls} sm:col-span-2`} />
            <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Observations" className={`${inputCls} sm:col-span-2`} />
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onAdd(`/api/admin/dossier/students/${studentId}/diagnostics`, form)
                .then(() => setForm({ subject_name: '', score: '', max_score: '20', mastery: '', label: '', test_date: '', notes: '' }))
                .catch(() => {})}
              disabled={!form.subject_name.trim() || busy}
              className={btnPrimary}
            >
              <Plus className="w-3.5 h-3.5" /> Enregistrer
            </button>
            <BulkPaste
              columns="matière ; score ; maîtrise (acquis|en cours|non acquis) ; intitulé ; date"
              placeholder={'Mathématiques ; 12 ; en cours ; Positionnement septembre ; 2026-09-15\nFrançais ; 8 ; non acquis ; Positionnement septembre ; 2026-09-15'}
              onParse={parseBulk}
              onSubmit={submitBulk}
              busy={busy}
            />
          </div>
        </div>
      </Section>

      <Section title={`Tests enregistrés (${data.diagnostics?.length || 0})`} icon={ClipboardList}>
        {data.diagnostics?.length ? (
          <ul className="space-y-1">
            {data.diagnostics.map((t) => (
              <li key={t.id} className="flex items-center gap-2 text-xs border-b border-border/60 pb-1.5">
                <span className="font-mono text-muted-foreground w-20 shrink-0">{t.test_date || t.academic_year || '—'}</span>
                <span className="font-medium">{t.subject_name}</span>
                {t.label && <span className="text-muted-foreground truncate">{t.label}</span>}
                {t.mastery && (
                  <span className={[
                    'text-[10px] rounded-full px-1.5 shrink-0',
                    t.mastery === 'acquis' ? 'bg-emerald-50 text-emerald-700'
                      : t.mastery === 'en_cours' ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700',
                  ].join(' ')}>{MASTERY[t.mastery]}</span>
                )}
                <span className={`ml-auto font-semibold shrink-0 ${noteColor(t.score != null && t.max_score ? (t.score / t.max_score) * 20 : null)}`}>
                  {t.score != null ? `${fmt(t.score)}/${fmt(t.max_score, 0)}` : '—'}
                </span>
                <button onClick={() => onDelete(`/api/admin/dossier/diagnostics/${t.id}`)}
                  className="text-muted-foreground hover:text-red-600 shrink-0" aria-label="Supprimer">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </li>
            ))}
          </ul>
        ) : <Empty>Aucun test diagnostique enregistré.</Empty>}
      </Section>
    </div>
  );
}

// ── Onglet Observations ──────────────────────────────────────────────────────
function ObservationsTab({ data, busy, onAdd, onDelete, studentId }) {
  const [form, setForm] = useState({ category: 'pedagogique', content: '' });
  const [filter, setFilter] = useState('all');
  const list = (data.observations || []).filter((o) => filter === 'all' || o.category === filter);

  return (
    <div className="space-y-4">
      <Section title="Nouvelle observation" icon={Plus}>
        <div className="space-y-2">
          <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={inputCls}>
            {Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <textarea
            value={form.content}
            onChange={(e) => setForm({ ...form, content: e.target.value })}
            rows={3}
            placeholder="Remarque du professeur, du conseiller ou de l'administration…"
            className={`${inputCls} w-full`}
          />
          <button
            onClick={() => onAdd(`/api/admin/dossier/students/${studentId}/observations`, form)
              .then(() => setForm({ category: 'pedagogique', content: '' })).catch(() => {})}
            disabled={!form.content.trim() || busy}
            className={btnPrimary}
          >
            <Plus className="w-3.5 h-3.5" /> Enregistrer
          </button>
        </div>
      </Section>

      <Section title={`Observations (${data.observations?.length || 0})`} icon={MessageSquareText}>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {['all', ...Object.keys(CATEGORIES)].map((k) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={[
                'text-[11px] px-2 py-0.5 rounded-full border',
                filter === k ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-card border-border text-muted-foreground',
              ].join(' ')}
            >
              {k === 'all' ? 'Toutes' : CATEGORIES[k]}
            </button>
          ))}
        </div>
        {list.length ? (
          <ul className="space-y-2">
            {list.map((o) => (
              <li key={o.id} className="rounded-lg border border-border bg-card p-2.5">
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground mb-1">
                  <span className="bg-indigo-50 text-indigo-700 rounded-full px-1.5">{CATEGORIES[o.category] || o.category}</span>
                  <span>{o.author_name || 'Anonyme'}{o.author_role ? ` · ${o.author_role}` : ''}</span>
                  <span className="ml-auto">{o.created_at?.slice(0, 10)}</span>
                  <button onClick={() => onDelete(`/api/admin/dossier/observations/${o.id}`)}
                    className="hover:text-red-600" aria-label="Supprimer">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <p className="text-xs whitespace-pre-line">{o.content}</p>
              </li>
            ))}
          </ul>
        ) : <Empty>Aucune observation dans cette catégorie.</Empty>}
      </Section>
    </div>
  );
}

// ── Onglet Famille ───────────────────────────────────────────────────────────
const FAMILY_FIELDS = [
  { key: 'family_status', label: 'Situation familiale', placeholder: 'Parents ensemble / divorcés / veuf(ve)…' },
  { key: 'guardian', label: 'Tuteur effectif', placeholder: 'Père, mère, oncle…' },
  { key: 'siblings_count', label: 'Nombre de frères et sœurs', type: 'number' },
  { key: 'sibling_rank', label: 'Rang dans la fratrie', type: 'number' },
  { key: 'housing', label: 'Logement', placeholder: 'Avec les parents / internat / famille…' },
  { key: 'father_profession', label: 'Profession du père' },
  { key: 'mother_profession', label: 'Profession de la mère' },
  { key: 'orientation_wish', label: "Souhait d'orientation", placeholder: 'Filière visée par l\'élève / la famille' },
];

function FamilleTab({ data, busy, onSave, studentId }) {
  const [form, setForm] = useState(() => ({
    family_status: '', guardian: '', siblings_count: '', sibling_rank: '', housing: '',
    father_profession: '', mother_profession: '', family_support: '', health_notes: '',
    orientation_wish: '', notes: '', ...(data.family || {}),
  }));
  const [saved, setSaved] = useState(false);

  return (
    <div className="space-y-4">
      {data.parents?.length > 0 && (
        <Section title="Parents rattachés" icon={Users}>
          <ul className="space-y-1 text-xs">
            {data.parents.map((p) => (
              <li key={p.id} className="flex items-center gap-2 border-b border-border/60 pb-1">
                <span className="font-medium">{p.first_name} {p.last_name}</span>
                {p.relationship && <span className="text-[10px] bg-indigo-50 text-indigo-700 rounded-full px-1.5">{p.relationship}</span>}
                <span className="text-muted-foreground">{p.profession || ''}</span>
                <span className="ml-auto text-muted-foreground">{p.phone || ''}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Contexte familial et environnement" icon={Users}>
        <div className="grid sm:grid-cols-2 gap-2">
          {FAMILY_FIELDS.map((f) => (
            <label key={f.key} className="text-xs">
              <span className="text-muted-foreground block mb-0.5">{f.label}</span>
              <input
                type={f.type || 'text'}
                value={form[f.key] ?? ''}
                onChange={(e) => { setForm({ ...form, [f.key]: e.target.value }); setSaved(false); }}
                placeholder={f.placeholder || ''}
                className={`${inputCls} w-full`}
              />
            </label>
          ))}
          <label className="text-xs">
            <span className="text-muted-foreground block mb-0.5">Soutien familial</span>
            <select
              value={form.family_support ?? ''}
              onChange={(e) => { setForm({ ...form, family_support: e.target.value }); setSaved(false); }}
              className={`${inputCls} w-full`}
            >
              <option value="">—</option>
              <option value="fort">Fort</option>
              <option value="moyen">Moyen</option>
              <option value="faible">Faible</option>
            </select>
          </label>
        </div>
        <label className="text-xs block mt-2">
          <span className="text-muted-foreground block mb-0.5">Santé / besoins particuliers</span>
          <textarea rows={2} value={form.health_notes ?? ''}
            onChange={(e) => { setForm({ ...form, health_notes: e.target.value }); setSaved(false); }}
            className={`${inputCls} w-full`} />
        </label>
        <label className="text-xs block mt-2">
          <span className="text-muted-foreground block mb-0.5">Notes complémentaires</span>
          <textarea rows={2} value={form.notes ?? ''}
            onChange={(e) => { setForm({ ...form, notes: e.target.value }); setSaved(false); }}
            className={`${inputCls} w-full`} />
        </label>
        <button
          onClick={() => onSave(`/api/admin/dossier/students/${studentId}/family`, form, 'PUT')
            .then(() => setSaved(true)).catch(() => {})}
          disabled={busy}
          className={`${btnPrimary} mt-3`}
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : saved ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
          {saved ? 'Enregistré' : 'Enregistrer'}
        </button>
      </Section>
    </div>
  );
}

// ── Onglet Rapport IA ────────────────────────────────────────────────────────
function RapportTab({ report, state, onGenerate, onPrint }) {
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-3 flex items-center gap-3">
        <FileText className="w-5 h-5 text-indigo-600 shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-indigo-800">Rapport pédagogique détaillé</p>
          <p className="text-[11px] text-indigo-700/80">
            Généré à la demande à partir de toutes les données du dossier : profil, parcours, évolution,
            forces, faiblesses, assiduité, contexte familial, orientation et plan d'action.
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2 shrink-0">
          {report && (
            <button onClick={onPrint} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-border bg-card hover:bg-muted">
              <Printer className="w-3.5 h-3.5" /> Imprimer
            </button>
          )}
          <button onClick={onGenerate} disabled={state === 'loading'} className={btnPrimary}>
            {state === 'loading'
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Génération…</>
              : <><Sparkles className="w-3.5 h-3.5" /> {report ? 'Régénérer' : 'Générer le rapport'}</>}
          </button>
        </div>
      </div>

      {report ? (
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-[11px] text-muted-foreground mb-2">
            Généré le {new Date(report.generated_at).toLocaleString('fr-FR')}
          </p>
          <div className="space-y-0.5">{renderReport(report.report)}</div>
        </div>
      ) : state !== 'loading' && (
        <Empty>Aucun rapport généré pour le moment. Plus le dossier est rempli, plus le rapport est précis.</Empty>
      )}
    </div>
  );
}

// ── Petites briques d'affichage ──────────────────────────────────────────────
const inputCls = 'px-2 py-1.5 text-xs rounded-lg border border-border bg-card focus:outline-none focus:ring-2 focus:ring-indigo-300';
const btnPrimary = 'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40';

function Stat({ label, value, accent = '', icon }) {
  return (
    <div className="rounded-xl bg-card border border-border p-2.5">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={`text-lg font-semibold flex items-center gap-1.5 ${accent}`}>{value}{icon}</p>
    </div>
  );
}

function Section({ title, icon: Icon, tone, children }) {
  const toneCls = tone === 'emerald' ? 'text-emerald-600' : tone === 'red' ? 'text-red-500' : 'text-indigo-600';
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="text-xs font-semibold flex items-center gap-1.5 mb-2">
        {Icon && <Icon className={`w-4 h-4 ${toneCls}`} />} {title}
      </p>
      {children}
    </div>
  );
}

function Empty({ children }) {
  return <p className="text-[11px] text-muted-foreground italic py-2">{children}</p>;
}
