import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  X, Printer, MessageCircle, Bell, RefreshCw, Award, Users,
  TrendingUp, TrendingDown, CalendarOff, Clock3, GraduationCap, Minus,
  Activity, Hand, Eye, Smile, Smartphone, Moon, BookOpen, NotebookPen,
  ClipboardCheck, MessageSquareText,
} from 'lucide-react';
import { Avatar } from './directory/ui';
import { openBlob } from '../lib/download';

// ─────────────────────────────────────────────────────────────────────────────
// Fenêtre « Notes d'élève » (fiche élève admin) — bulletin détaillé calculé en
// direct : notes individuelles C1..Cn par matière, moyenne, coef, MxC,
// appréciation, rang, comparaison avec la moyenne de classe, assiduité.
// Actions : impression PDF (logo école), envoi WhatsApp / notification app
// aux parents.
// ─────────────────────────────────────────────────────────────────────────────

const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const getToken = async () => {
  const { supabase } = await import('../lib/supabase');
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token;
};

// Couleur d'une note /20 : vert ≥ 14, bleu ≥ 12, ambre ≥ 10, rouge < 10.
const noteColor = (n) => {
  if (n == null) return 'text-gray-300';
  if (n >= 14) return 'text-green-700';
  if (n >= 12) return 'text-blue-700';
  if (n >= 10) return 'text-amber-600';
  return 'text-red-600';
};
const noteBg = (n) => {
  if (n == null) return '';
  if (n >= 14) return 'bg-green-50';
  if (n >= 12) return 'bg-blue-50';
  if (n >= 10) return 'bg-amber-50';
  return 'bg-red-50';
};

const fmt = (n, digits = 2) => (n == null ? '—' : Number(n).toFixed(digits));

// Années scolaires proposées : année active + 3 précédentes (format tiret).
const yearOptions = (activeDashYear) => {
  const y1 = parseInt(String(activeDashYear || '').split('-')[0], 10);
  if (Number.isNaN(y1)) return [activeDashYear].filter(Boolean);
  return [0, 1, 2, 3].map((d) => `${y1 - d}-${y1 - d + 1}`);
};

// ── Suivi rapide : petites briques d'affichage ──────────────────────────────

// Barre segmentée (répartition bon / moyen / mauvais)
function SegmentBar({ segments }) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  if (!total) return <div className="h-1.5 rounded-full bg-gray-100" />;
  return (
    <div className="flex h-1.5 rounded-full overflow-hidden bg-gray-100">
      {segments.filter((s) => s.value > 0).map((s, i) => (
        <div key={i} className={s.color} style={{ width: `${(s.value / total) * 100}%` }} />
      ))}
    </div>
  );
}

// Carte d'une dimension du suivi : icône, libellé, valeur principale, barre.
function TrackCard({ icon: Icon, label, main, mainClass = 'text-gray-800', sub, segments }) {
  return (
    <div className="rounded-xl border border-gray-200 p-3 bg-white">
      <div className="text-[11px] text-gray-500 flex items-center gap-1 mb-1">
        <Icon className="w-3.5 h-3.5" /> {label}
      </div>
      <div className={`text-lg font-bold leading-tight ${mainClass}`}>{main}</div>
      {sub && <div className="text-[11px] text-gray-400 mt-0.5">{sub}</div>}
      {segments && <div className="mt-2"><SegmentBar segments={segments} /></div>}
    </div>
  );
}

const pctTxt = (v) => (v == null ? '—' : `${v}%`);
// Couleur d'un taux « positif » (plus haut = mieux)
const rateClass = (v) => (v == null ? 'text-gray-400' : v >= 80 ? 'text-green-700' : v >= 50 ? 'text-amber-600' : 'text-red-600');
// Couleur d'un compteur d'incidents (0 = bien)
const incidentClass = (n) => ((n || 0) > 0 ? 'text-red-600' : 'text-green-700');

export default function StudentNotesModal({ student, classLabel, activeYear, onClose }) {
  const [year, setYear] = useState(activeYear);
  const [semester, setSemester] = useState(() => {
    // Sept→janvier = S1, février→août = S2
    const m = new Date().getMonth() + 1;
    return m >= 9 || m === 1 ? 1 : 2;
  });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [printing, setPrinting] = useState(false);
  const [sending, setSending] = useState(null); // 'whatsapp' | 'app' | null
  const [sendResult, setSendResult] = useState(null); // { type: 'success'|'error', text }

  const load = useCallback(async () => {
    if (!student?.id) return;
    setLoading(true);
    setError(null);
    setSendResult(null);
    try {
      const token = await getToken();
      const params = new URLSearchParams({ academic_year: year, semester: String(semester) });
      if (student.class_id) params.set('class_id', student.class_id);
      const res = await fetch(`${apiUrl}/api/bulletins/student-notes/${student.id}?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erreur de chargement');
      setData(json);
    } catch (e) {
      setError(e.message);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [student?.id, student?.class_id, year, semester]);

  useEffect(() => { load(); }, [load]);

  // Fermeture par Échap
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const maxC = Math.max(1, data?.max_controls || 0);
  const hasActivities = (data?.max_activities || 0) > 0;

  // Lignes avec au moins une épreuve OU un coefficient (bulletin complet du niveau)
  const lines = useMemo(() => data?.lines || [], [data]);
  const withNote = lines.filter((l) => l.note_20 != null);
  const totalCoef = withNote.reduce((s, l) => s + (l.coefficient || 0), 0);
  const totalMxC = withNote.reduce((s, l) => s + (l.weighted_note || 0), 0);

  // ── Impression PDF (logo école inclus côté backend) ──────────────────────
  const printPdf = async () => {
    setPrinting(true);
    setSendResult(null);
    try {
      const token = await getToken();
      const res = await fetch(`${apiUrl}/api/bulletins/preview`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_id: student.id,
          class_id: student.class_id || data?.class?.id,
          academic_year: year,
          semester,
          include_tracking: true, // résumé du suivi rapide dans « Observations »
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || 'Erreur de génération du PDF');
      }
      const blob = await res.blob();
      await openBlob(blob, `notes_${(student.last_name || '')}_${(student.first_name || '')}_S${semester}.pdf`);
    } catch (e) {
      setSendResult({ type: 'error', text: `Impression : ${e.message}` });
    } finally {
      setPrinting(false);
    }
  };

  // ── Envoi aux parents (WhatsApp ou notification app) ─────────────────────
  const send = async (channel) => {
    setSending(channel);
    setSendResult(null);
    try {
      const token = await getToken();
      const res = await fetch(`${apiUrl}/api/bulletins/student-notes/${student.id}/send`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          class_id: student.class_id || data?.class?.id,
          academic_year: year,
          semester,
          channels: [channel],
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erreur d'envoi");
      if (channel === 'whatsapp') {
        const wa = json.whatsapp || {};
        if (wa.error) setSendResult({ type: 'error', text: `WhatsApp : ${wa.error}` });
        else if (wa.sent > 0) setSendResult({ type: 'success', text: `✓ Bulletin PDF envoyé par WhatsApp à ${wa.sent} parent${wa.sent > 1 ? 's' : ''}` });
        else setSendResult({ type: 'error', text: `WhatsApp : aucun envoi (${(wa.errors || []).map((e) => e.error).join(', ') || 'téléphone manquant'})` });
      } else {
        const app = json.app || {};
        setSendResult(app.notified > 0
          ? { type: 'success', text: `✓ Notification envoyée dans l'app à ${app.notified} parent${app.notified > 1 ? 's' : ''}` }
          : { type: 'error', text: 'Aucun parent notifié' });
      }
    } catch (e) {
      setSendResult({ type: 'error', text: e.message });
    } finally {
      setSending(null);
    }
  };

  const avg = data?.general_average;
  const vsClass = avg != null && data?.class_average != null ? avg - data.class_average : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4">
      {/* Fond */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[95vh] flex flex-col overflow-hidden">
        {/* ── En-tête ── */}
        <div className="bg-gradient-to-r from-indigo-600 to-indigo-500 text-white px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <Avatar
                name={`${student.first_name} ${student.last_name}`}
                src={student.avatar_url}
                size="lg"
                gender={student.gender || ''}
              />
              <div className="min-w-0">
                <h2 className="text-lg font-bold truncate flex items-center gap-2">
                  <GraduationCap className="w-5 h-5 shrink-0" />
                  Notes d'élève — {student.first_name} {student.last_name}
                </h2>
                <p className="text-indigo-100 text-sm truncate">
                  {classLabel || data?.class?.name || '—'}
                  {student.massar_code ? ` · MASSAR ${student.massar_code}` : ''}
                </p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-lg transition-colors shrink-0" aria-label="Fermer">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Filtres année / semestre */}
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <label className="text-xs text-indigo-100">Année scolaire</label>
            <select
              value={year}
              onChange={(e) => setYear(e.target.value)}
              className="text-sm rounded-lg px-2 py-1.5 text-gray-800 bg-white/95 border-0"
            >
              {yearOptions(activeYear).map((y) => (
                <option key={y} value={y}>{y.replace('-', '/')}</option>
              ))}
            </select>
            <label className="text-xs text-indigo-100 ml-2">Semestre</label>
            <select
              value={semester}
              onChange={(e) => setSemester(Number(e.target.value))}
              className="text-sm rounded-lg px-2 py-1.5 text-gray-800 bg-white/95 border-0"
            >
              <option value={1}>1er semestre</option>
              <option value={2}>2e semestre</option>
            </select>
            <button
              onClick={load}
              className="ml-auto p-1.5 hover:bg-white/20 rounded-lg transition-colors"
              title="Actualiser"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* ── Corps ── */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center h-48">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <p className="text-red-600 font-medium">{error}</p>
              <button onClick={load} className="mt-3 text-sm text-indigo-600 hover:underline">Réessayer</button>
            </div>
          ) : (
            <>
              {/* KPIs */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
                <div className={`rounded-xl border p-3 ${noteBg(avg)} border-gray-200`}>
                  <div className="text-[11px] text-gray-500 flex items-center gap-1"><Award className="w-3.5 h-3.5" /> Moyenne générale</div>
                  <div className={`text-2xl font-bold ${noteColor(avg)}`}>{fmt(avg)}<span className="text-sm font-normal text-gray-400">/20</span></div>
                </div>
                <div className="rounded-xl border border-gray-200 p-3">
                  <div className="text-[11px] text-gray-500">Mention</div>
                  <div className="text-lg font-semibold text-gray-800 mt-1">{data?.mention?.fr || '—'}</div>
                  {data?.mention?.ar && <div className="text-xs text-gray-400" dir="rtl">{data.mention.ar}</div>}
                </div>
                <div className="rounded-xl border border-gray-200 p-3">
                  <div className="text-[11px] text-gray-500 flex items-center gap-1"><Users className="w-3.5 h-3.5" /> Rang</div>
                  <div className="text-2xl font-bold text-indigo-700">
                    {data?.general_rank || '—'}
                    {data?.total_students ? <span className="text-sm font-normal text-gray-400">/{data.total_students}</span> : null}
                  </div>
                </div>
                <div className="rounded-xl border border-gray-200 p-3">
                  <div className="text-[11px] text-gray-500">Moyenne classe</div>
                  <div className="text-2xl font-bold text-gray-700">{fmt(data?.class_average)}</div>
                  {vsClass != null && (
                    <div className={`text-[11px] flex items-center gap-0.5 ${vsClass >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                      {vsClass > 0 ? <TrendingUp className="w-3 h-3" /> : vsClass < 0 ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                      {vsClass >= 0 ? '+' : ''}{vsClass.toFixed(2)} vs classe
                    </div>
                  )}
                </div>
                <div className="rounded-xl border border-gray-200 p-3">
                  <div className="text-[11px] text-gray-500 flex items-center gap-1"><CalendarOff className="w-3.5 h-3.5" /> Absences</div>
                  <div className={`text-2xl font-bold ${(data?.attendance?.absent || 0) > 0 ? 'text-red-600' : 'text-green-700'}`}>
                    {data?.attendance?.absent ?? 0}
                  </div>
                  {(data?.attendance?.excused || 0) > 0 && (
                    <div className="text-[11px] text-gray-400">dont {data.attendance.excused} justifiée{data.attendance.excused > 1 ? 's' : ''}</div>
                  )}
                </div>
                <div className="rounded-xl border border-gray-200 p-3">
                  <div className="text-[11px] text-gray-500 flex items-center gap-1"><Clock3 className="w-3.5 h-3.5" /> Retards</div>
                  <div className={`text-2xl font-bold ${(data?.attendance?.late || 0) > 0 ? 'text-amber-600' : 'text-green-700'}`}>
                    {data?.attendance?.late ?? 0}
                  </div>
                </div>
              </div>

              {/* Tableau des notes */}
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-gray-100 text-gray-600">
                        <th className="text-left px-3 py-2 font-semibold sticky left-0 bg-gray-100 min-w-[140px]">Matières</th>
                        {Array.from({ length: maxC }, (_, i) => (
                          <th key={i} className="px-2 py-2 font-semibold text-center min-w-[54px]">C{i + 1}/20</th>
                        ))}
                        {hasActivities && <th className="px-2 py-2 font-semibold text-center min-w-[54px]" title="Moyenne des activités (25%)">Act./20</th>}
                        <th className="px-2 py-2 font-semibold text-center bg-gray-200/70 min-w-[62px]">Moy/20</th>
                        <th className="px-2 py-2 font-semibold text-center min-w-[62px]" title="Moyenne de la classe dans cette matière">Moy. cl.</th>
                        <th className="px-2 py-2 font-semibold text-center min-w-[46px]">Coef</th>
                        <th className="px-2 py-2 font-semibold text-center min-w-[62px]" title="Moyenne × coefficient">MxC</th>
                        <th className="px-2 py-2 font-semibold text-center min-w-[52px]">Rang</th>
                        <th className="text-left px-3 py-2 font-semibold min-w-[160px]">Appréciations</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((l, idx) => {
                        const details = l.controls_detail || [];
                        return (
                          <tr key={l.subject_name} className={idx % 2 ? 'bg-gray-50/60' : 'bg-white'}>
                            <td className="px-3 py-2 font-semibold text-gray-800 sticky left-0 bg-inherit uppercase text-xs">
                              {l.subject_name}
                            </td>
                            {Array.from({ length: maxC }, (_, i) => {
                              const d = details[i];
                              return (
                                <td key={i} className={`px-2 py-2 text-center font-medium ${d?.note != null ? noteColor(d.note) : 'text-gray-300'} ${d ? '' : 'bg-gray-50'}`}
                                  title={d ? `${d.name || `Contrôle ${i + 1}`}${d.date ? ` — ${new Date(d.date).toLocaleDateString('fr-FR')}` : ''}` : undefined}
                                >
                                  {d?.note != null ? Number(d.note).toFixed(d.note % 1 ? 2 : 0) : d ? '·' : ''}
                                </td>
                              );
                            })}
                            {hasActivities && (
                              <td className={`px-2 py-2 text-center ${noteColor(l.activities_avg)}`}>{l.activities_avg != null ? fmt(l.activities_avg) : ''}</td>
                            )}
                            <td className={`px-2 py-2 text-center font-bold ${noteColor(l.note_20)} ${noteBg(l.note_20)}`}>
                              {fmt(l.note_20)}
                            </td>
                            <td className="px-2 py-2 text-center text-gray-500">{fmt(l.class_avg)}</td>
                            <td className="px-2 py-2 text-center text-gray-600 font-medium">{l.coefficient}</td>
                            <td className="px-2 py-2 text-center font-semibold text-gray-700">{fmt(l.weighted_note)}</td>
                            <td className="px-2 py-2 text-center text-indigo-600 font-medium">{l.subject_rank || '—'}</td>
                            <td className="px-3 py-2 text-xs text-gray-600 italic">{l.appreciation || ''}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-indigo-50 border-t-2 border-indigo-200 font-bold text-gray-800">
                        <td className="px-3 py-2.5 sticky left-0 bg-indigo-50">Moyenne générale</td>
                        <td colSpan={maxC + (hasActivities ? 1 : 0)} />
                        <td className={`px-2 py-2.5 text-center text-base ${noteColor(avg)}`}>{fmt(avg)}</td>
                        <td className="px-2 py-2.5 text-center text-gray-500 font-medium">{fmt(data?.class_average)}</td>
                        <td className="px-2 py-2.5 text-center">{totalCoef || '—'}</td>
                        <td className="px-2 py-2.5 text-center">{totalMxC ? totalMxC.toFixed(2) : '—'}</td>
                        <td colSpan={2} />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* Légende */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-gray-400">
                <span>Note matière = moyenne contrôles × 75 % + moyenne activités × 25 %</span>
                <span className="text-green-700">■ ≥ 14</span>
                <span className="text-blue-700">■ 12–14</span>
                <span className="text-amber-600">■ 10–12</span>
                <span className="text-red-600">■ &lt; 10</span>
                <span>« · » = épreuve prévue, note non saisie</span>
              </div>

              {/* ── Suivi rapide en classe (session_tracking) ── */}
              <div className="pt-1">
                <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2 mb-2">
                  <Activity className="w-4 h-4 text-indigo-600" />
                  Suivi rapide en classe
                  {data?.tracking?.sessions_tracked ? (
                    <span className="text-[11px] font-normal text-gray-400">
                      {data.tracking.sessions_tracked} relevé{data.tracking.sessions_tracked > 1 ? 's' : ''} de séance sur la période
                    </span>
                  ) : null}
                </h3>

                {!data?.tracking || !data.tracking.sessions_tracked ? (
                  <div className="text-sm text-gray-400 border border-dashed border-gray-200 rounded-xl p-4 text-center">
                    Aucun suivi de séance enregistré sur cette période.
                  </div>
                ) : (() => {
                  const t = data.tracking;
                  const presTotal = t.presence.present + t.presence.absent + t.presence.late + t.presence.excused;
                  return (
                    <>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
                        <TrackCard
                          icon={ClipboardCheck} label="Présence séances"
                          main={pctTxt(t.rates?.presence)} mainClass={rateClass(t.rates?.presence)}
                          sub={`${t.presence.present} présent · ${t.presence.late} retard · ${t.presence.absent} absent${t.presence.excused ? ` · ${t.presence.excused} justifié` : ''}`}
                          segments={[
                            { value: t.presence.present, color: 'bg-green-500' },
                            { value: t.presence.late + t.presence.excused, color: 'bg-amber-400' },
                            { value: t.presence.absent, color: 'bg-red-500' },
                          ]}
                        />
                        <TrackCard
                          icon={Hand} label="Participation"
                          main={pctTxt(t.rates?.participation_positive)} mainClass={rateClass(t.rates?.participation_positive)}
                          sub={t.participation.tracked ? `${t.participation.excellent} excellent · ${t.participation.bon} bon · ${t.participation.faible} faible` : 'Non suivi'}
                          segments={[
                            { value: t.participation.excellent, color: 'bg-green-500' },
                            { value: t.participation.bon, color: 'bg-blue-400' },
                            { value: t.participation.faible, color: 'bg-red-400' },
                          ]}
                        />
                        <TrackCard
                          icon={Eye} label="Vigilance"
                          main={pctTxt(t.rates?.discipline_concentre)} mainClass={rateClass(t.rates?.discipline_concentre)}
                          sub={t.discipline.tracked ? `${t.discipline.concentre} concentré · ${t.discipline.moyen} moyen · ${t.discipline.distrait} distrait` : 'Non suivi'}
                          segments={[
                            { value: t.discipline.concentre, color: 'bg-green-500' },
                            { value: t.discipline.moyen, color: 'bg-amber-400' },
                            { value: t.discipline.distrait, color: 'bg-red-400' },
                          ]}
                        />
                        <TrackCard
                          icon={Smile} label="Attitude"
                          main={pctTxt(t.rates?.attitude_correcte)} mainClass={rateClass(t.rates?.attitude_correcte)}
                          sub={t.attitude.tracked ? `${t.attitude.correct + t.attitude.excellent} correcte · ${t.attitude.perturbateur} perturbatrice` : 'Non suivi'}
                          segments={[
                            { value: t.attitude.correct + t.attitude.excellent, color: 'bg-green-500' },
                            { value: t.attitude.perturbateur, color: 'bg-red-400' },
                          ]}
                        />
                        <TrackCard
                          icon={Smartphone} label="Téléphone en classe"
                          main={`${t.phone.used}×`} mainClass={incidentClass(t.phone.used)}
                          sub={t.phone.tracked ? `sur ${t.phone.tracked} séances suivies` : 'Non suivi'}
                        />
                        <TrackCard
                          icon={Moon} label="Somnolence"
                          main={`${t.sleeping.count}×`} mainClass={incidentClass(t.sleeping.count)}
                          sub={t.sleeping.tracked ? `sur ${t.sleeping.tracked} séances suivies` : 'Non suivi'}
                        />
                        <TrackCard
                          icon={BookOpen} label="Devoirs"
                          main={pctTxt(t.rates?.homework_done)} mainClass={rateClass(t.rates?.homework_done)}
                          sub={t.homework.tracked ? `${t.homework.done} fait · ${t.homework.partial} partiel · ${t.homework.not_done} non fait` : 'Non suivi'}
                          segments={[
                            { value: t.homework.done, color: 'bg-green-500' },
                            { value: t.homework.partial, color: 'bg-amber-400' },
                            { value: t.homework.not_done, color: 'bg-red-400' },
                          ]}
                        />
                        <TrackCard
                          icon={NotebookPen} label="Cahier"
                          main={pctTxt(t.rates?.cahier_present)} mainClass={rateClass(t.rates?.cahier_present)}
                          sub={t.cahier.tracked ? `${t.cahier.present} présent · ${t.cahier.absent} absent` : 'Non suivi'}
                          segments={[
                            { value: t.cahier.present, color: 'bg-green-500' },
                            { value: t.cahier.absent, color: 'bg-red-400' },
                          ]}
                        />
                        {t.mini_eval.count > 0 && (
                          <TrackCard
                            icon={Award} label="Mini-évaluations"
                            main={`${t.mini_eval.avg}/10`} mainClass={noteColor((t.mini_eval.avg || 0) * 2)}
                            sub={`${t.mini_eval.count} évaluation${t.mini_eval.count > 1 ? 's' : ''}`}
                          />
                        )}
                      </div>

                      {/* Derniers commentaires des professeurs */}
                      {t.comments?.length > 0 && (
                        <div className="mt-3 border border-gray-200 rounded-xl p-3 bg-gray-50/60">
                          <div className="text-[11px] font-semibold text-gray-500 flex items-center gap-1 mb-2">
                            <MessageSquareText className="w-3.5 h-3.5" /> Derniers commentaires des professeurs
                          </div>
                          <ul className="space-y-1.5">
                            {t.comments.map((c, i) => (
                              <li key={i} className="text-xs text-gray-600">
                                <span className="text-gray-400">
                                  {c.date ? new Date(c.date).toLocaleDateString('fr-FR') : ''}
                                  {c.subject ? ` · ${c.subject}` : ''} —{' '}
                                </span>
                                <span className="italic">{c.text}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            </>
          )}
        </div>

        {/* ── Pied : actions ── */}
        <div className="border-t border-gray-200 bg-gray-50 px-4 sm:px-6 py-3">
          {sendResult && (
            <div className={`mb-2 text-sm px-3 py-2 rounded-lg ${sendResult.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
              {sendResult.text}
            </div>
          )}
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              onClick={printPdf}
              disabled={printing || loading || !!error}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
            >
              {printing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
              Imprimer PDF
            </button>
            <button
              onClick={() => send('whatsapp')}
              disabled={!!sending || loading || !!error}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm font-medium"
            >
              {sending === 'whatsapp' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <MessageCircle className="w-4 h-4" />}
              Envoyer WhatsApp
            </button>
            <button
              onClick={() => send('app')}
              disabled={!!sending || loading || !!error}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 text-sm font-medium"
            >
              {sending === 'app' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Bell className="w-4 h-4" />}
              Notifier via l'app
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
