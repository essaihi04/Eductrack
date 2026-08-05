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
        setGroupKey(json.groups?.[0]?.key || '');
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
    (group?.columns || []).forEach((c) => {
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

  const weighted = (group?.columns || []).some((c) => Number(c.coefficient) !== 1);

  // Impression / téléchargement : même PDF backend (une page A4 paysage).
  const getPdf = async () => {
    const headers = await authHeaders();
    const res = await fetch(
      `${apiUrl}/api/admin/notes/recap-pdf?class_id=${classId}&semester=${semester}&key=${encodeURIComponent(groupKey)}`,
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
              {group ? ` · ${group.columns.length} matière${group.columns.length > 1 ? 's' : ''}` : ''}
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
            {data.groups.map((g) => (
              <button
                key={g.key}
                onClick={() => setGroupKey(g.key)}
                className={`px-2.5 py-1 text-xs font-medium rounded-full border transition-colors ${
                  g.key === groupKey ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-border hover:bg-accent'
                }`}
              >
                {g.label}
                <span className={g.key === groupKey ? 'text-indigo-200' : 'text-muted-foreground'}>
                  {' '}· {g.columns.length}
                </span>
              </button>
            ))}
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
              Aucune note saisie pour ce semestre dans cette classe — un contrôle n'apparaît ici
              qu'à partir du moment où au moins une matière a des notes.
            </p>
          </div>
        ) : (
          <div className="flex-1 overflow-auto p-4">
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="bg-indigo-600 text-white">
                  <th className="px-2 py-2 text-center font-semibold w-10 rounded-tl-lg">N°</th>
                  <th className="px-2 py-2 text-left font-semibold min-w-[180px]">Élève</th>
                  {group.columns.map((c) => (
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
                      {group.columns.map((c) => {
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
                  {group.columns.map((c) => {
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
                      group.columns.forEach((c) => {
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
