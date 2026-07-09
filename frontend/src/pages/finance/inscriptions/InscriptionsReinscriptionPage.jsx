import { useState, useEffect } from 'react';
import { UserCheck, UserPlus, UserX, Users, ArrowRight, RefreshCw, GraduationCap, AlertTriangle, Check } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../../../components/ui/Card';
import { Avatar } from '../../../components/directory/ui';
import { useYear } from '../../../contexts/YearContext';
import { enrollmentsApi } from '../../../lib/enrollmentsApi';
import { inscriptionsApi } from '../../../lib/inscriptionsApi';
import { nextYearStr } from '../../../lib/schoolYear';
import { nextLevel, isTerminalLevel } from '../../../lib/levelProgression';

// Assistant de réinscription — copie du même assistant côté admin, adapté au
// module finance : les classes de l'année cible passent par /api/inscriptions
// (le responsable financier n'a pas accès à /api/admin/classes).
const getLevelLabel = (lvl) => lvl || '';

const Stat = ({ icon: Icon, label, value, tone }) => (
  <div className="flex items-center gap-3 p-4 rounded-lg bg-card border border-border">
    <div className={`p-2 rounded-lg ${tone}`}><Icon className="w-5 h-5" /></div>
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  </div>
);

const InscriptionsReinscriptionPage = () => {
  const { year, setYear } = useYear();
  const toYear = nextYearStr(year);

  const [funnel, setFunnel] = useState(null);
  const [loadingFunnel, setLoadingFunnel] = useState(true);

  const [wizardOpen, setWizardOpen] = useState(false);
  const [loadingWizard, setLoadingWizard] = useState(false);
  const [rows, setRows] = useState([]);
  const [targetClasses, setTargetClasses] = useState([]);
  const [options, setOptions] = useState({ carryFeePlan: true, keepMassar: true });
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const loadFunnel = async () => {
    setLoadingFunnel(true);
    try {
      const data = await enrollmentsApi.getFunnel(year);
      setFunnel(data);
    } catch (e) {
      console.error(e);
      setFunnel(null);
    } finally {
      setLoadingFunnel(false);
    }
  };

  useEffect(() => { loadFunnel(); /* eslint-disable-next-line */ }, [year]);

  const openWizard = async () => {
    setError('');
    setResult(null);
    setLoadingWizard(true);
    setWizardOpen(true);
    try {
      const [roster, classesNext] = await Promise.all([
        enrollmentsApi.list(year),
        inscriptionsApi.listClasses(toYear),
      ]);
      setTargetClasses(Array.isArray(classesNext) ? classesNext : []);

      const active = (roster || []).filter((e) => e.status !== 'NR');
      const built = active.map((e) => {
        const lvl = e.class?.level || '';
        const fil = e.class?.filiere || '';
        const targetLvl = nextLevel(lvl);
        let target = classesNext.find((c) => c.level === targetLvl && (c.filiere || '') === fil);
        if (!target) target = classesNext.find((c) => c.level === targetLvl);
        return {
          student_id: e.student?.id,
          name: `${e.student?.last_name || ''} ${e.student?.first_name || ''}`.trim(),
          avatar: e.student?.avatar,
          avatar_url: e.student?.avatar_url,
          currentClass: e.class?.name || '—',
          currentLevel: lvl,
          new_class_id: target?.id || '',
          status: isTerminalLevel(lvl) ? 'NR' : 'RI',
        };
      });
      setRows(built);
    } catch (e) {
      console.error(e);
      setError(e.message || 'Erreur lors du chargement');
    } finally {
      setLoadingWizard(false);
    }
  };

  const updateRow = (idx, patch) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const submit = async () => {
    setError('');
    setSubmitting(true);
    try {
      const mappings = rows.map((r) => ({
        student_id: r.student_id,
        new_class_id: r.status === 'NR' ? null : r.new_class_id,
        status: r.status,
      }));
      const missing = rows.filter((r) => r.status === 'RI' && !r.new_class_id);
      if (missing.length > 0) {
        setError(`${missing.length} élève(s) réinscrit(s) sans classe cible. Choisissez une classe ou marquez-les « Non réinscrit ».`);
        setSubmitting(false);
        return;
      }
      const res = await enrollmentsApi.reinscription({
        from_year: year,
        to_year: toYear,
        mappings,
        options,
      });
      setResult(res);
      await loadFunnel();
    } catch (e) {
      setError(e.message || 'Erreur lors de la réinscription');
    } finally {
      setSubmitting(false);
    }
  };

  const riCount = rows.filter((r) => r.status === 'RI').length;
  const nrCount = rows.filter((r) => r.status === 'NR').length;

  return (
    <div className="p-2 md:p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Users className="w-6 h-6 text-primary" /> Réinscription
        </h1>
        <div className="text-sm text-muted-foreground">Année active : <span className="font-semibold text-foreground">{year}</span></div>
      </div>

      <Card>
        <CardHeader><CardTitle>Inscriptions {year}</CardTitle></CardHeader>
        <CardContent>
          {loadingFunnel ? (
            <div className="flex justify-center p-6"><RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat icon={Users} label="Total" value={funnel?.total ?? 0} tone="bg-blue-100 text-blue-700" />
              <Stat icon={UserCheck} label="Réinscrits" value={funnel?.ri ?? 0} tone="bg-green-100 text-green-700" />
              <Stat icon={UserPlus} label="Nouveaux" value={funnel?.ni ?? 0} tone="bg-amber-100 text-amber-700" />
              <Stat icon={UserX} label="Non réinscrits" value={funnel?.nr ?? 0} tone="bg-red-100 text-red-700" />
            </div>
          )}
        </CardContent>
      </Card>

      {!wizardOpen && (
        <div className="flex flex-col items-center gap-3 py-6">
          <p className="text-sm text-muted-foreground text-center max-w-lg">
            Préparez l'année <strong>{toYear}</strong> : chaque élève est promu au niveau suivant,
            avec reconduction des parents, du plan de frais et du code Massar.
          </p>
          <button
            onClick={openWizard}
            className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-white px-6 py-3 rounded-lg font-semibold"
          >
            <GraduationCap className="w-5 h-5" /> Préparer l'inscription {toYear}
          </button>
        </div>
      )}

      {wizardOpen && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 flex-wrap">
              <span>{year}</span> <ArrowRight className="w-4 h-4" /> <span>{toYear}</span>
              <span className="text-sm font-normal text-muted-foreground ml-2">
                {riCount} réinscrit(s) · {nrCount} non réinscrit(s)
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {loadingWizard ? (
              <div className="flex justify-center p-8"><RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" /></div>
            ) : (
              <>
                {targetClasses.length === 0 && (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
                    <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>
                      Aucune classe pour l'année <strong>{toYear}</strong>. Demandez à un administrateur de
                      créer les classes cibles avant de lancer la réinscription.
                    </span>
                  </div>
                )}

                <div className="flex flex-wrap gap-4 text-sm">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={options.carryFeePlan}
                      onChange={(e) => setOptions((o) => ({ ...o, carryFeePlan: e.target.checked }))} />
                    Reconduire le plan de frais
                  </label>
                  <label className="flex items-center gap-2 text-muted-foreground">
                    <input type="checkbox" checked readOnly /> Reconduire les parents (automatique)
                  </label>
                  <label className="flex items-center gap-2 text-muted-foreground">
                    <input type="checkbox" checked readOnly /> Garder le code Massar (automatique)
                  </label>
                </div>

                <div className="overflow-x-auto border border-border rounded-lg">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-left">
                      <tr>
                        <th className="px-3 py-2">Élève</th>
                        <th className="px-3 py-2">Classe {year}</th>
                        <th className="px-3 py-2">Classe {toYear}</th>
                        <th className="px-3 py-2">Niveau {toYear}</th>
                        <th className="px-3 py-2">Statut</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r, idx) => (
                        <tr key={r.student_id} className="border-t border-border">
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              <Avatar name={r.name} src={r.avatar_url} size="sm" />
                              <span className="font-medium">{r.name}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">
                            {r.currentClass} {r.currentLevel && <span className="text-xs">({getLevelLabel(r.currentLevel)})</span>}
                          </td>
                          <td className="px-3 py-2">
                            <select
                              value={r.new_class_id}
                              disabled={r.status === 'NR'}
                              onChange={(e) => updateRow(idx, { new_class_id: e.target.value })}
                              className="w-full border rounded px-2 py-1 bg-background disabled:opacity-50"
                            >
                              <option value="">— choisir —</option>
                              {targetClasses.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.name} ({c.level}{c.filiere ? ` · ${c.filiere}` : ''})
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-3 py-2">
                            {(() => {
                              if (r.status === 'NR') return <span className="text-xs text-muted-foreground italic">—</span>;
                              const sel = targetClasses.find((c) => String(c.id) === String(r.new_class_id));
                              if (!sel) return <span className="text-xs text-muted-foreground">—</span>;
                              return (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium">
                                  {sel.level}{sel.filiere ? ` · ${sel.filiere}` : ''}
                                </span>
                              );
                            })()}
                          </td>
                          <td className="px-3 py-2">
                            <div className="inline-flex rounded-lg border border-border overflow-hidden">
                              <button
                                onClick={() => updateRow(idx, { status: 'RI' })}
                                className={`px-3 py-1 text-xs font-medium ${r.status === 'RI' ? 'bg-green-600 text-white' : 'bg-card text-muted-foreground'}`}
                              >RI</button>
                              <button
                                onClick={() => updateRow(idx, { status: 'NR' })}
                                className={`px-3 py-1 text-xs font-medium ${r.status === 'NR' ? 'bg-red-600 text-white' : 'bg-card text-muted-foreground'}`}
                              >NR</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {rows.length === 0 && (
                        <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">Aucun élève à réinscrire pour {year}.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {error && <p className="text-sm font-medium text-red-600">{error}</p>}
                {result && (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-green-50 border border-green-200 text-green-800 text-sm">
                    <Check className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>
                      {result.reinscrits} réinscrit(s), {result.non_reinscrits} non réinscrit(s),
                      {' '}{result.fee_plans_copied} plan(s) de frais reconduit(s).
                      {result.errors?.length > 0 && ` ${result.errors.length} erreur(s).`}
                      {' '}<button onClick={() => setYear(toYear)} className="underline font-medium">Basculer sur {toYear}</button>
                    </span>
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={submit}
                    disabled={submitting || rows.length === 0}
                    className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-white px-6 py-2.5 rounded-lg font-medium disabled:opacity-50"
                  >
                    {submitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    {submitting ? 'Réinscription…' : `Valider la réinscription vers ${toYear}`}
                  </button>
                  <button onClick={() => setWizardOpen(false)} className="px-6 py-2.5 rounded-lg font-medium border border-border hover:bg-accent">
                    Fermer
                  </button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default InscriptionsReinscriptionPage;
