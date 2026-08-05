import { useState, useEffect, useMemo } from 'react';
import {
  X, RefreshCw, FileDown, Printer, AlertTriangle, ClipboardList, EyeOff,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { saveBlob, openBlob } from '../../lib/download';

// ── Récap des notes d'UN contrôle pour TOUTES les matières ──────────────────
// Ex. « Contrôle 1 » : lignes = élèves, colonnes = matières, moyenne par élève
// et moyenne de la classe par matière.
// Une matière n'apparaît que si elle a ce contrôle avec au moins une note :
// une matière qui s'arrête au contrôle 2 ne figure pas dans le récap du 3.
// Les matières encore vides restent affichables d'une case à cocher (saisie
// en cours), et un contrôle sans aucune note reste consultable.
// Impression et PDF viennent du backend (PDFKit + police arabe).

const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const num2 = (v) => (v == null || v === '' || isNaN(Number(v))
  ? '—'
  : (Math.round(Number(v) * 100) / 100).toFixed(2).replace('.', ','));

const noteClass = (v) => {
  if (v == null || v === '') return 'text-muted-foreground';
  return Number(v) < 10 ? 'text-red-600' : 'text-foreground';
};

export default function NotesRecapModal({ classId, className, semester, onClose }) {
  const [data, setData] = useState(null);   // { students, groups, academic_year, class }
  const [groupKey, setGroupKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');     // 'print' | 'pdf'
  const [showEmpty, setShowEmpty] = useState(false); // matières sans note saisie

  const authHeaders = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return { Authorization: `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' };
  };

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const headers = await authHeaders();
        const res = await fetch(`${apiUrl}/api/admin/notes/recap?class_id=${classId}&semester=${semester}`, { headers });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
        if (!alive) return;
        setData(json);
        // On ouvre sur le premier contrôle réellement noté (les colonnes
        // officielles créées d'office mais vides ne doivent pas s'afficher
        // en premier).
        const groups = json.groups || [];
        setGroupKey((groups.find((g) => g.note_count > 0) || groups[0])?.key || '');
      } catch (e) {
        if (alive) setError(e.message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [classId, semester]);

  const group = useMemo(
    () => (data?.groups || []).find((g) => g.key === groupKey) || null,
    [data, groupKey],
  );

  // Colonnes affichées : par défaut, seules les matières où au moins une note
  // est saisie (une matière qui s'arrête au contrôle 2 n'a rien au contrôle 3).
  // Si AUCUNE matière n'a de note, on montre quand même les colonnes vides.
  const columns = useMemo(() => {
    if (!group) return [];
    const noted = group.columns.filter((c) => c.note_count > 0);
    return (showEmpty || noted.length === 0) ? group.columns : noted;
  }, [group, showEmpty]);
  const hiddenCount = group ? group.columns.length - columns.length : 0;

  // note[control_id][student_id]
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
    const headers = await authHeaders();
    const res = await fetch(
      `${apiUrl}/api/admin/notes/recap-pdf?class_id=${classId}&semester=${semester}`
      + `&key=${encodeURIComponent(groupKey)}${showEmpty ? '&empty=1' : ''}`,
      { headers },
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

  const doPrint = async () => {
    setBusy('print');
    setError('');
    try {
      await openBlob(await getPdf(), fileName());
    } catch (e) { setError(e.message); }
    finally { setBusy(''); }
  };

  const doDownload = async () => {
    setBusy('pdf');
    setError('');
    try {
      await saveBlob(await getPdf(), fileName());
    } catch (e) { setError(e.message); }
    finally { setBusy(''); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4">
      <div className="bg-background rounded-2xl shadow-2xl w-full max-w-6xl h-[92vh] flex flex-col overflow-hidden">
        {/* En-tête */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <div className="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
            <ClipboardList className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h2 className="font-semibold leading-tight truncate">
              Récap des notes — {className}
            </h2>
            <p className="text-xs text-muted-foreground">
              Semestre {semester}
              {data?.academic_year ? ` · Année ${data.academic_year}` : ''}
              {group ? ` · ${columns.length} matière${columns.length > 1 ? 's' : ''}` : ''}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={doPrint}
              disabled={!group || !!busy}
              title="Ouvrir le PDF pour l'imprimer"
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium border border-border rounded-lg hover:bg-accent disabled:opacity-50"
            >
              {busy === 'print' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
              Imprimer
            </button>
            <button
              onClick={doDownload}
              disabled={!group || !!busy}
              title="Télécharger le récap en PDF"
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              {busy === 'pdf' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
              PDF
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg text-muted-foreground hover:bg-accent" aria-label="Fermer">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Choix du contrôle */}
        {(data?.groups || []).length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 px-4 py-2.5 border-b border-border bg-muted/30">
            <span className="text-xs font-medium text-muted-foreground mr-1">Contrôle :</span>
            {data.groups.map((g) => {
              const noted = g.columns.filter((c) => c.note_count > 0).length;
              return (
                <button
                  key={g.key}
                  onClick={() => setGroupKey(g.key)}
                  title={noted === 0
                    ? `${g.label} — aucune note saisie pour l'instant`
                    : `${g.label} — ${noted} matière(s) notée(s) sur ${g.columns.length}`}
                  className={`px-2.5 py-1 text-xs font-medium rounded-full border transition-colors ${
                    g.key === groupKey
                      ? 'bg-indigo-600 border-indigo-600 text-white'
                      : noted === 0 ? 'border-border text-muted-foreground hover:bg-accent' : 'border-border hover:bg-accent'
                  }`}
                >
                  {g.label}
                  <span className={g.key === groupKey ? 'text-indigo-200' : 'text-muted-foreground'}>
                    {' '}· {noted || '0'} matière{noted > 1 ? 's' : ''}
                  </span>
                </button>
              );
            })}
            <label className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={showEmpty}
                onChange={(e) => setShowEmpty(e.target.checked)}
                className="w-3.5 h-3.5 accent-indigo-600"
              />
              Afficher les matières sans note
              {hiddenCount > 0 && <span className="text-amber-600">({hiddenCount} masquée{hiddenCount > 1 ? 's' : ''})</span>}
            </label>
          </div>
        )}

        {error && (
          <p className="mx-4 mt-3 text-sm font-medium text-red-600 flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4" /> {error}
          </p>
        )}

        {loading ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground gap-2">
            <RefreshCw className="w-5 h-5 animate-spin" /> Chargement du récap…
          </div>
        ) : !group ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center px-6">
            <EyeOff className="w-8 h-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground max-w-md">
              Aucun contrôle pour le semestre {semester} dans cette classe. Les contrôles
              apparaissent ici dès qu'ils existent dans la grille de saisie — vérifiez aussi
              le semestre sélectionné.
            </p>
          </div>
        ) : (
          <div className="flex-1 overflow-auto p-4">
            {group.note_count === 0 && (
              <p className="mb-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                Aucune note n'est encore saisie pour {group.label} — le tableau montre les
                matières qui ont ce contrôle.
              </p>
            )}
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 z-10">
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
              {weighted ? 'Moyennes pondérées par les coefficients de l\'établissement.' : 'Moyennes simples (aucun coefficient défini pour ce niveau).'}
              {' '}Les matières qui n'ont pas ce contrôle ne sont pas affichées.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
