import { useEffect, useState } from 'react';
import { Search, ArrowRightLeft, X, AlertTriangle, Check } from 'lucide-react';
import { enrollmentsApi } from '../../lib/enrollmentsApi';
import { nextLevel, baseLevel } from '../../lib/levelProgression';

// Flux de réinscription complet (extrait de l'ancienne page Inscriptions/Élèves) :
//  1. fenêtre de recherche : élèves non réinscrits de l'année précédente (propre
//     école) + élèves des établissements associés, avec réinscription en masse
//     d'un niveau entier ;
//  2. modale de confirmation (niveau + classe d'accueil optionnelle).
// Le composant reste monté en permanence : la modale de confirmation survit à la
// fermeture de la fenêtre de recherche.
export default function ReinscriptionFlow({ open, onClose, year, classes = [], levelOptions = [], candidates = [], onDone }) {
  const [crossSearch, setCrossSearch] = useState('');
  const [crossLevelFilter, setCrossLevelFilter] = useState('');
  const [crossLevels, setCrossLevels] = useState([]); // vrais niveaux des écoles associées
  const [crossTargetLevel, setCrossTargetLevel] = useState(''); // niveau cible (masse)
  const [crossResults, setCrossResults] = useState([]);
  const [crossSearching, setCrossSearching] = useState(false);
  // Confirmation individuelle
  const [reinscribeTarget, setReinscribeTarget] = useState(null);
  const [reinscribeLevel, setReinscribeLevel] = useState('');
  const [reinscribeClassId, setReinscribeClassId] = useState('');
  const [reinscribeBusy, setReinscribeBusy] = useState(false);
  const [reinscribeMsg, setReinscribeMsg] = useState(null); // { type, text }

  // À l'ouverture : reset + liste d'emblée les élèves des établissements associés.
  useEffect(() => {
    if (!open) return;
    setCrossSearch(''); setCrossLevelFilter(''); setCrossTargetLevel(''); setCrossResults([]);
    runCrossSearch('', '');
    enrollmentsApi.crossSchoolLevels()
      .then(({ levels }) => setCrossLevels(levels || []))
      .catch(() => setCrossLevels([]));
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [open]);

  // Recherche par nom ET/OU par niveau. Sans critère → tous les élèves associés.
  const runCrossSearch = async (q, level) => {
    setCrossSearching(true);
    try { setCrossResults(await enrollmentsApi.crossSchoolSearch((q ?? '').trim(), level ?? '')); }
    catch (e) { console.error('Recherche inter-écoles:', e); setCrossResults([]); }
    finally { setCrossSearching(false); }
  };

  // Liste fusionnée : candidats propre école + résultats des établissements associés.
  const q = crossSearch.trim().toLowerCase();
  const own = candidates
    .filter((e) => !crossLevelFilter || (e.class?.level || '') === crossLevelFilter)
    .filter((e) => {
      if (!q) return true;
      const name = `${e.student?.last_name || ''} ${e.student?.first_name || ''}`.toLowerCase();
      const massar = (e.student?.massar_code || '').toLowerCase();
      return name.includes(q) || massar.includes(q);
    })
    .map((e) => {
      const level = e.class?.level || '';
      return {
        key: 'own-' + (e.student?.id || e.id),
        source: 'own',
        raw: e,
        name: `${e.student?.last_name || ''} ${e.student?.first_name || ''}`.trim(),
        sub: `Cette école · ${e.class?.name || 'Sans classe'}${level ? ` (${level})` : ''}`,
        suggested: nextLevel(level),
      };
    });
  const cross = crossResults.map((s) => ({
    key: 'cross-' + s.id,
    source: 'cross',
    raw: s,
    name: `${s.first_name} ${s.last_name}`.trim(),
    sub: `${s.school?.name || 'Établissement'}${s.class?.name ? ` · ${s.class.name}` : ''}${s.current_level ? ` (${s.current_level})` : ''}`,
    suggested: s.suggested_level,
  }));
  const merged = [...own, ...cross];

  // Réinscrit en masse tout un niveau d'un établissement associé (ex : tous les 6AP).
  const reinscribeWholeLevel = async () => {
    if (!crossLevelFilter) return;
    const next = crossTargetLevel || nextLevel(crossLevelFilter) || crossLevelFilter;
    if (!window.confirm(`Réinscrire TOUS les élèves de niveau ${crossLevelFilter} des établissements associés vers ${next} (année ${year}) ? Ils seront déplacés vers cet établissement.`)) return;
    setCrossSearching(true);
    try {
      const r = await enrollmentsApi.reinscribeLevel({ source_level: crossLevelFilter, target_level: next, academic_year: year });
      onDone?.();
      onClose?.();
      alert(`${r.count} élève(s) de ${r.source_level} réinscrit(s) en ${r.target_level} pour ${r.academic_year}.`);
    } catch (e) {
      alert(e.message || 'Erreur lors de la réinscription en masse');
    } finally {
      setCrossSearching(false);
    }
  };

  // Prépare la confirmation depuis un résultat d'école associée.
  const openReinscribeFromCross = (s) => {
    setReinscribeTarget({
      id: s.id,
      name: `${s.first_name} ${s.last_name}`,
      school_name: s.school?.name || null,
      current_level: s.current_level,
      suggested_level: s.suggested_level,
      isCross: true,
    });
    setReinscribeLevel(s.suggested_level || s.current_level || '');
    setReinscribeClassId('');
    setReinscribeMsg(null);
    onClose?.();
  };

  // Prépare la confirmation pour un élève de la PROPRE école (année précédente).
  const openReinscribeOwn = (e) => {
    const lvl = e.class?.level || '';
    setReinscribeTarget({
      id: e.student?.id,
      name: `${e.student?.last_name || ''} ${e.student?.first_name || ''}`.trim(),
      school_name: null,
      current_level: lvl,
      suggested_level: nextLevel(lvl),
      isCross: false,
    });
    setReinscribeLevel(nextLevel(lvl) || lvl || '');
    setReinscribeClassId('');
    setReinscribeMsg(null);
    onClose?.();
  };

  const submitReinscribe = async () => {
    if (!reinscribeTarget) return;
    setReinscribeBusy(true); setReinscribeMsg(null);
    try {
      const payload = { student_id: reinscribeTarget.id, academic_year: year };
      if (reinscribeClassId) payload.target_class_id = reinscribeClassId;
      else if (reinscribeLevel) payload.target_level = reinscribeLevel;
      const r = await enrollmentsApi.reinscribe(payload);
      const name = reinscribeTarget.name;
      setReinscribeTarget(null);
      onDone?.();
      alert(`${name} réinscrit(e) en ${r.level} pour ${r.academic_year}.`);
    } catch (e) {
      setReinscribeMsg({ type: 'err', text: e.message || 'Erreur lors de la réinscription' });
    } finally {
      setReinscribeBusy(false);
    }
  };

  return (
    <>
      {/* Fenêtre de réinscription : année précédente + établissements associés */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b">
              <div className="flex items-center gap-2">
                <ArrowRightLeft className="w-5 h-5 text-violet-600" />
                <h3 className="font-semibold">Réinscription — {year}</h3>
              </div>
              <button onClick={onClose} className="p-1 rounded hover:bg-gray-100">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* Recherche + niveau — filtrent les DEUX sources (propre école + associés) */}
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-gray-400" />
                  <input
                    autoFocus
                    value={crossSearch}
                    onChange={(e) => { setCrossSearch(e.target.value); runCrossSearch(e.target.value, crossLevelFilter); }}
                    placeholder="Nom, prénom ou code Massar…"
                    className="w-full pl-8 pr-3 py-2 border rounded-lg text-sm"
                  />
                </div>
                <select
                  value={crossLevelFilter}
                  onChange={(e) => {
                    const lvl = e.target.value;
                    setCrossLevelFilter(lvl);
                    setCrossTargetLevel(nextLevel(lvl) || '');
                    runCrossSearch(crossSearch, lvl);
                  }}
                  className="border rounded-lg text-sm px-2 py-2 w-36"
                  title="Filtrer par niveau"
                >
                  <option value="">Niveau…</option>
                  {(crossLevels.length ? crossLevels : levelOptions).map((lvl) => <option key={lvl} value={lvl}>{lvl}</option>)}
                </select>
              </div>
              <p className="text-[11px] text-gray-400 -mt-2">
                Élèves non réinscrits de l'année précédente et élèves des établissements associés. Filtrez par niveau puis cliquez un élève ; « Réinscrire tout le niveau » récupère toute la promotion des établissements associés.
              </p>

              {crossLevelFilter && (
                <div className="flex items-center gap-2 bg-violet-50 border border-violet-200 rounded-lg p-2">
                  <span className="text-xs text-violet-800 shrink-0">Niveau cible</span>
                  <select
                    value={crossTargetLevel}
                    onChange={(e) => setCrossTargetLevel(e.target.value)}
                    className="border rounded-lg text-sm px-2 py-1.5 w-28"
                  >
                    <option value="">(même)</option>
                    {levelOptions.map((lvl) => <option key={lvl} value={lvl}>{lvl}</option>)}
                  </select>
                  <button
                    onClick={reinscribeWholeLevel}
                    disabled={crossSearching}
                    className="flex-1 flex items-center justify-center gap-2 bg-violet-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-violet-700 disabled:opacity-50"
                  >
                    <ArrowRightLeft className="w-4 h-4" />
                    Réinscrire tout {crossLevelFilter} → {crossTargetLevel || crossLevelFilter} ({crossResults.length})
                  </button>
                </div>
              )}

              {/* Liste fusionnée : année précédente + établissements associés */}
              <div className="border rounded-lg divide-y max-h-96 overflow-y-auto">
                {crossSearching && merged.length === 0 && (
                  <div className="p-3 text-sm text-gray-500">Chargement…</div>
                )}
                {!crossSearching && merged.length === 0 && (
                  <div className="p-3 text-sm text-gray-500">Aucun élève à réinscrire (année précédente ou établissements associés).</div>
                )}
                {merged.map((item) => (
                  <button key={item.key}
                    onClick={() => (item.source === 'own' ? openReinscribeOwn(item.raw) : openReinscribeFromCross(item.raw))}
                    className="flex items-center gap-3 w-full p-2.5 text-left hover:bg-violet-50">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{item.name}</div>
                      <div className="text-xs text-gray-500 truncate">{item.sub}</div>
                    </div>
                    {item.suggested && (
                      <span className="text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full shrink-0">→ {item.suggested}</span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 p-4 border-t">
              <button onClick={onClose} className="px-3 py-2 border rounded-lg text-sm hover:bg-gray-50">
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modale : confirmer la réinscription (niveau + classe optionnelle) */}
      {reinscribeTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
          onClick={() => { if (!reinscribeBusy) setReinscribeTarget(null); }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b">
              <div className="flex items-center gap-2">
                <ArrowRightLeft className="w-5 h-5 text-violet-600" />
                <h3 className="font-semibold">Réinscrire — {year}</h3>
              </div>
              <button onClick={() => { if (!reinscribeBusy) setReinscribeTarget(null); }} className="p-1 rounded hover:bg-gray-100">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-3">
              {reinscribeMsg && (
                <div className={`flex items-start gap-2 p-3 rounded-lg text-sm ${reinscribeMsg.type === 'ok' ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-red-50 border border-red-200 text-red-700'}`}>
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{reinscribeMsg.text}</span>
                </div>
              )}

              <div className="p-3 rounded-lg bg-violet-50 border border-violet-200">
                <div className="font-semibold text-sm">{reinscribeTarget.name}</div>
                <div className="text-xs text-gray-600">
                  {reinscribeTarget.school_name ? `${reinscribeTarget.school_name} · ` : ''}
                  {reinscribeTarget.current_level ? `Niveau actuel : ${reinscribeTarget.current_level}` : 'Niveau actuel inconnu'}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Niveau de réinscription (proposé automatiquement)</label>
                <select value={reinscribeLevel} onChange={(e) => { setReinscribeLevel(e.target.value); setReinscribeClassId(''); }}
                  className="w-full px-3 py-2 border rounded-lg text-sm">
                  {/* niveau proposé hors référentiel → gardé sélectionnable */}
                  {reinscribeLevel && !levelOptions.includes(reinscribeLevel) && (
                    <option value={reinscribeLevel}>{reinscribeLevel}</option>
                  )}
                  {levelOptions.map((lvl) => <option key={lvl} value={lvl}>{lvl}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Classe d'accueil (optionnel)</label>
                <select value={reinscribeClassId} onChange={(e) => setReinscribeClassId(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm">
                  <option value="">Niveau seul — à affecter à une classe plus tard</option>
                  {classes
                    // même niveau exact, ou même niveau de base (une classe « 1BAC »
                    // reste proposée quand on choisit « 1BAC Sciences Math »)
                    .filter((c) => !reinscribeLevel || c.level === reinscribeLevel
                      || (baseLevel(c.level) && baseLevel(c.level) === baseLevel(reinscribeLevel)))
                    .map((c) => <option key={c.id} value={c.id}>{c.name}{c.level ? ` (${c.level})` : ''}</option>)}
                </select>
                {!reinscribeClassId && (
                  <p className="text-[11px] text-gray-400 mt-1">
                    Aucune classe ne sera créée : l'élève est promu au niveau {reinscribeLevel || '—'}. L'affectation à une classe se fait ensuite côté administration.
                  </p>
                )}
              </div>

              <p className="text-xs text-gray-500">
                {reinscribeTarget.isCross
                  ? <>Cet élève vient d'un établissement associé : il sera <strong>déplacé</strong> ici (il quittera son école d'origine). Ses parents et son code Massar sont conservés.</>
                  : <>Élève inscrit l'an dernier : il sera <strong>réinscrit</strong> dans l'année active. Ses parents et son code Massar sont conservés.</>}
              </p>
            </div>

            <div className="flex justify-end gap-2 p-4 border-t">
              <button onClick={() => setReinscribeTarget(null)} disabled={reinscribeBusy}
                className="px-3 py-2 border rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50">
                Annuler
              </button>
              <button onClick={submitReinscribe} disabled={reinscribeBusy}
                className="px-4 py-2 bg-violet-600 text-white rounded-lg text-sm hover:bg-violet-700 disabled:opacity-50 flex items-center gap-1.5">
                {reinscribeBusy ? 'Réinscription…' : <><Check className="w-4 h-4" /> Réinscrire</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
