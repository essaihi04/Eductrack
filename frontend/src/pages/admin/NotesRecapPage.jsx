import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ClipboardList, RefreshCw, FileDown, Printer, AlertTriangle, EyeOff,
  GraduationCap, CalendarRange, ListChecks,
} from 'lucide-react';
import { Card, CardContent } from '../../components/ui/Card';
import { supabase } from '../../lib/supabase';
import { saveBlob, openBlob } from '../../lib/download';
import { useYear } from '../../contexts/YearContext';
import { sameYear } from '../../lib/schoolYear';

// ── Récap des notes par contrôle ────────────────────────────────────────────
// Onglet dédié : on choisit une CLASSE, un SEMESTRE et un CONTRÔLE (contrôle 1,
// 2, 3, activités…), et on obtient les notes de ce contrôle pour TOUTES les
// matières : lignes = élèves, colonnes = matières, moyenne par élève et
// moyenne de la classe par matière.
//
// Une matière n'a de colonne que si elle a ce contrôle avec au moins une note
// — une matière qui s'arrête au contrôle 2 ne figure pas dans le récap du 3.
// Les matières encore vides restent affichables d'une case à cocher.
// Impression et PDF viennent du backend (PDFKit + police arabe).

const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const num2 = (v) => (v == null || v === '' || isNaN(Number(v))
  ? '—'
  : (Math.round(Number(v) * 100) / 100).toFixed(2).replace('.', ','));

const noteClass = (v) => {
  if (v == null || v === '') return 'text-muted-foreground';
  return Number(v) < 10 ? 'text-red-600' : 'text-foreground';
};

export default function NotesRecapPage() {
  const { year } = useYear();
  const [params, setParams] = useSearchParams();
  const [classes, setClasses] = useState([]);
  const [classId, setClassId] = useState(params.get('class') || '');
  const [semester, setSemester] = useState(Number(params.get('semester')) === 2 ? 2 : null);

  const [data, setData] = useState(null);   // { students, groups, academic_year, class }
  const [groupKey, setGroupKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');     // 'print' | 'pdf'
  const [showEmpty, setShowEmpty] = useState(false); // matières sans note saisie
  const activeClasses = useMemo(
    () => classes.filter((cls) => !cls.academic_year || sameYear(cls.academic_year, year)),
    [classes, year],
  );

  const authHeaders = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return { Authorization: `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' };
  };

  const api = async (path) => {
    const res = await fetch(`${apiUrl}${path}`, { headers: await authHeaders() });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
    return json;
  };

  // Classes + semestre en cours (calendrier de l'école)
  useEffect(() => {
    (async () => {
      try {
        const cls = await api('/api/admin/classes');
        setClasses(Array.isArray(cls) ? cls : []);
      } catch (e) { setError(e.message); }
      if (semester === null) {
        try {
          const cur = await api('/api/bulletins/current-semester');
          setSemester(cur?.semester === 2 ? 2 : 1);
        } catch { setSemester(1); }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (classId && !activeClasses.some((cls) => cls.id === classId)) {
      setClassId('');
      return;
    }
    if (!classId && activeClasses.length > 0) setClassId(activeClasses[0].id);
  }, [activeClasses, classId]);

  // L'URL garde la sélection (lien partageable / retour depuis la saisie)
  useEffect(() => {
    if (!classId || !semester) return;
    setParams({ class: classId, semester: String(semester) }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, semester]);

  // Chargement du récap de la classe × semestre
  useEffect(() => {
    if (!classId || !semester) { setData(null); return; }
    let alive = true;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const json = await api(`/api/admin/notes/recap?class_id=${classId}&semester=${semester}`);
        if (!alive) return;
        setData(json);
        // On ouvre sur le premier contrôle réellement noté (les colonnes
        // officielles créées d'office mais vides ne passent pas devant).
        const groups = json.groups || [];
        setGroupKey((groups.find((g) => g.note_count > 0) || groups[0])?.key || '');
      } catch (e) {
        if (alive) { setError(e.message); setData(null); }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, semester]);

  const className = classes.find((c) => c.id === classId)?.name || 'Classe';

  const group = useMemo(
    () => (data?.groups || []).find((g) => g.key === groupKey) || null,
    [data, groupKey],
  );

  // Colonnes affichées : par défaut, seules les matières où au moins une note
  // est saisie. Si AUCUNE n'a de note, on montre quand même les colonnes vides.
  const columns = useMemo(() => {
    if (!group) return [];
    const noted = group.columns.filter((c) => c.note_count > 0);
    return (showEmpty || noted.length === 0) ? group.columns : noted;
  }, [group, showEmpty]);
  const hiddenCount = group ? group.columns.length - columns.length : 0;

  const noteByKey = useMemo(() => {
    const m = {};
    (group?.notes || []).forEach((n) => { m[`${n.control_id}_${n.student_id}`] = n.note; });
    return m;
  }, [group]);

  // Moyenne d'un élève, pondérée par les coefficients quand ils existent.
  const avgOf = (studentId) => {
    let sum = 0;
    let coef = 0;
    columns.forEach((c) => {
      const v = noteByKey[`${c.control_id}_${studentId}`];
      if (v == null || v === '') return;
      const k = Number(c.coefficient) || 1;
      sum += Number(v) * k;
      coef += k;
    });
    return coef ? sum / coef : null;
  };

  // Moyenne de la classe pour une matière.
  const classAvgOf = (controlId) => {
    const vals = (data?.students || [])
      .map((s) => noteByKey[`${controlId}_${s.id}`])
      .filter((v) => v != null && v !== '')
      .map(Number);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };

  const weighted = columns.some((c) => Number(c.coefficient) !== 1);

  // Impression / téléchargement : même PDF backend (une page A4 paysage).
  const getPdf = async () => {
    const res = await fetch(
      `${apiUrl}/api/admin/notes/recap-pdf?class_id=${classId}&semester=${semester}`
      + `&key=${encodeURIComponent(groupKey)}${showEmpty ? '&empty=1' : ''}`,
      { headers: await authHeaders() },
    );
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      throw new Error(json.error || `HTTP ${res.status}`);
    }
    return res.blob();
  };

  const fileName = () => {
    const safe = (s) => String(s || '').replace(/[^a-zA-Z0-9._-]+/g, '_');
    return `recap_${safe(className)}_${safe(group?.label)}_S${semester}.pdf`;
  };

  const run = async (kind) => {
    setBusy(kind);
    setError('');
    try {
      const blob = await getPdf();
      if (kind === 'print') await openBlob(blob, fileName());
      else await saveBlob(blob, fileName());
    } catch (e) { setError(e.message); }
    finally { setBusy(''); }
  };

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ClipboardList className="w-6 h-6 text-primary" /> Récap par contrôle
        </h1>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => run('print')}
            disabled={!group || !!busy}
            title="Ouvrir le PDF pour l'imprimer"
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium border border-border rounded-lg hover:bg-accent disabled:opacity-50"
          >
            {busy === 'print' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
            Imprimer
          </button>
          <button
            onClick={() => run('pdf')}
            disabled={!group || !!busy}
            title="Télécharger le récap en PDF"
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            {busy === 'pdf' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
            PDF
          </button>
        </div>
      </div>

      {/* Sélecteurs : classe · semestre · contrôle */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                <GraduationCap className="w-3.5 h-3.5 inline mr-1" />Classe
              </label>
              <select
                value={classId}
                onChange={(e) => setClassId(e.target.value)}
                className="px-3 py-2 border border-border rounded-lg bg-background min-w-[220px]"
              >
                <option value="">— choisir —</option>
                {activeClasses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}{c.level ? ` (${c.level})` : ''}{c.academic_year ? ` — ${c.academic_year}` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                <CalendarRange className="w-3.5 h-3.5 inline mr-1" />Semestre (الأسدس)
              </label>
              <div className="flex rounded-lg border border-border overflow-hidden">
                {[1, 2].map((s) => (
                  <button
                    key={s}
                    onClick={() => setSemester(s)}
                    className={`px-4 py-2 text-sm font-medium transition-colors ${
                      semester === s ? 'bg-indigo-600 text-white' : 'bg-background hover:bg-accent'
                    }`}
                  >
                    S{s}
                  </button>
                ))}
              </div>
            </div>
            <div className="min-w-[220px]">
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                <ListChecks className="w-3.5 h-3.5 inline mr-1" />Contrôle
              </label>
              <select
                value={groupKey}
                onChange={(e) => setGroupKey(e.target.value)}
                disabled={!data || !(data.groups || []).length}
                className="px-3 py-2 border border-border rounded-lg bg-background w-full disabled:opacity-50"
              >
                {!(data?.groups || []).length && <option value="">— aucun contrôle —</option>}
                {(data?.groups || []).map((g) => {
                  const noted = g.columns.filter((c) => c.note_count > 0).length;
                  return (
                    <option key={g.key} value={g.key}>
                      {g.label} — {noted} matière{noted > 1 ? 's' : ''} notée{noted > 1 ? 's' : ''}
                    </option>
                  );
                })}
              </select>
            </div>
            {data && (
              <div className="text-sm text-muted-foreground pb-2">
                {data.students.length} élève(s)
                {data.academic_year ? ` · Année ${data.academic_year}` : ''}
                {group ? ` · ${columns.length} matière(s) affichée(s)` : ''}
              </div>
            )}
          </div>

          {group && (
            <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-border">
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={showEmpty}
                  onChange={(e) => setShowEmpty(e.target.checked)}
                  className="w-3.5 h-3.5 accent-indigo-600"
                />
                Afficher les matières sans note
                {hiddenCount > 0 && (
                  <span className="text-amber-600">({hiddenCount} masquée{hiddenCount > 1 ? 's' : ''})</span>
                )}
              </label>
              <span className="text-[11px] text-muted-foreground">
                Le PDF suit ce choix.
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {error && (
        <p className="text-sm font-medium text-red-600 flex items-center gap-1.5">
          <AlertTriangle className="w-4 h-4" /> {error}
        </p>
      )}

      {loading && (
        <div className="flex justify-center p-10 text-muted-foreground gap-2">
          <RefreshCw className="w-6 h-6 animate-spin" /> Chargement du récap…
        </div>
      )}

      {!loading && !classId && (
        <p className="text-center text-muted-foreground py-10">
          Choisissez une classe pour afficher le récap d'un contrôle.
        </p>
      )}

      {!loading && classId && data && !group && (
        <div className="flex flex-col items-center justify-center gap-2 text-center py-12 px-6">
          <EyeOff className="w-8 h-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground max-w-md">
            Aucun contrôle pour le semestre {semester} dans cette classe. Les contrôles
            apparaissent ici dès qu'ils existent dans la grille de saisie — vérifiez aussi
            le semestre sélectionné.
          </p>
        </div>
      )}

      {!loading && group && (
        <Card>
          <CardContent className="pt-4 overflow-auto">
            {group.note_count === 0 && (
              <p className="mb-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                Aucune note n'est encore saisie pour {group.label} — le tableau montre les
                matières qui ont ce contrôle.
              </p>
            )}
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-indigo-600 text-white">
                  <th className="px-2 py-2 text-center font-semibold w-10 rounded-tl-lg">N°</th>
                  <th className="px-2 py-2 text-left font-semibold min-w-[180px]">Élève</th>
                  {columns.map((c) => (
                    <th key={c.control_id} className="px-2 py-2 text-center font-semibold min-w-[70px]">
                      <span className="block leading-tight">{c.subject_name}</span>
                      {weighted && (
                        <span className="block text-[10px] font-normal text-indigo-200">
                          Coef. {Number(c.coefficient)}
                        </span>
                      )}
                      {!c.published && (
                        <span className="block text-[10px] font-normal text-amber-200">non publié</span>
                      )}
                    </th>
                  ))}
                  <th className="px-2 py-2 text-center font-semibold w-24 rounded-tr-lg">Moyenne</th>
                </tr>
              </thead>
              <tbody>
                {data.students.map((s, idx) => {
                  const avg = avgOf(s.id);
                  return (
                    <tr key={s.id} className={idx % 2 ? 'bg-muted/40' : ''}>
                      <td className="px-2 py-1.5 text-center text-muted-foreground border-b border-border">
                        {s.import_order ?? idx + 1}
                      </td>
                      <td className="px-2 py-1.5 border-b border-border">
                        {`${s.last_name || ''} ${s.first_name || ''}`.trim()}
                      </td>
                      {columns.map((c) => {
                        const v = noteByKey[`${c.control_id}_${s.id}`];
                        return (
                          <td
                            key={c.control_id}
                            className={`px-2 py-1.5 text-center font-medium border-b border-border ${noteClass(v)}`}
                          >
                            {num2(v)}
                          </td>
                        );
                      })}
                      <td className={`px-2 py-1.5 text-center font-bold border-b border-border ${
                        avg == null ? 'text-muted-foreground' : avg < 10 ? 'text-red-600' : 'text-emerald-600'
                      }`}>
                        {num2(avg)}
                      </td>
                    </tr>
                  );
                })}
                <tr className="bg-indigo-50 font-semibold">
                  <td className="px-2 py-2 border-t-2 border-indigo-200" />
                  <td className="px-2 py-2 text-indigo-700 border-t-2 border-indigo-200">Moyenne de la classe</td>
                  {columns.map((c) => {
                    const a = classAvgOf(c.control_id);
                    return (
                      <td key={c.control_id} className={`px-2 py-2 text-center border-t-2 border-indigo-200 ${
                        a == null ? 'text-muted-foreground' : a < 10 ? 'text-red-600' : 'text-indigo-700'
                      }`}>
                        {num2(a)}
                      </td>
                    );
                  })}
                  <td className="px-2 py-2 text-center text-amber-700 border-t-2 border-indigo-200">
                    {num2((() => {
                      let sum = 0;
                      let coef = 0;
                      columns.forEach((c) => {
                        const a = classAvgOf(c.control_id);
                        if (a == null) return;
                        const k = Number(c.coefficient) || 1;
                        sum += a * k;
                        coef += k;
                      });
                      return coef ? sum / coef : null;
                    })())}
                  </td>
                </tr>
              </tbody>
            </table>

            <p className="text-[11px] text-muted-foreground mt-3">
              {weighted
                ? 'Moyennes pondérées par les coefficients de l\'établissement.'
                : 'Moyennes simples (aucun coefficient défini pour ce niveau).'}
              {' '}Les matières qui n'ont pas ce contrôle ne sont pas affichées.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
