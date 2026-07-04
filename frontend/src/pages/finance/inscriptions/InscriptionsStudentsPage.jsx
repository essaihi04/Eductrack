import { useEffect, useMemo, useState } from 'react';
import { Users, Search, Plus, RefreshCw, Check, ArrowRightLeft, X, AlertTriangle, RotateCcw, Download } from 'lucide-react';
import { PageHeader, FilterBar, Button } from '../../../components/finance/ui';
import {
  CardGrid, StudentCard, StudentRow, GridListToggle, StatusPill, DetailDrawer, FieldRow,
} from '../../../components/directory/ui';
import StudentInscriptionModal from '../../../components/students/StudentInscriptionModal';
import { useAuth } from '../../../contexts/AuthContext';
import { useYear } from '../../../contexts/YearContext';
import { enrollmentsApi } from '../../../lib/enrollmentsApi';
import { inscriptionsApi } from '../../../lib/inscriptionsApi';
import { LEVEL_ORDER, nextLevel, distinctLevels } from '../../../lib/levelProgression';
import { prevYearStr, toDashYear } from '../../../lib/schoolYear';
import { printInscriptionFiche } from '../../../utils/inscriptionFiche';

// Statut d'inscription d'une ligne de roster (RI/NI/NR) → pastille.
function statusPill(status) {
  if (status === 'RI') return <StatusPill tone="green" icon={Check}>Réinscrit</StatusPill>;
  if (status === 'NI') return <StatusPill tone="blue" icon={Plus}>Nouveau</StatusPill>;
  return <StatusPill tone="red">Non réinscrit</StatusPill>;
}

// Page « Élèves » du pôle Inscriptions (finance) : reprend l'affichage en
// cartes de la fiche élève admin. La création d'un nouvel élève utilise la même
// fiche d'inscription complète que l'admin (photo, parents, documents, médical…)
// via StudentInscriptionModal ; la réinscription se fait dans l'onglet dédié.
export default function InscriptionsStudentsPage() {
  const { profile } = useAuth();
  const school = profile?.school || {};
  const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:3000';
  const { year } = useYear();
  const [roster, setRoster] = useState([]);
  const [prevRoster, setPrevRoster] = useState([]); // élèves de l'année précédente (candidats à récupérer)
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [viewMode, setViewMode] = useState('grid');
  const [activeEntry, setActiveEntry] = useState(null);
  const [ficheBusy, setFicheBusy] = useState(false); // téléchargement de la fiche d'inscription en cours

  const [showForm, setShowForm] = useState(false); // modale « Nouvel élève »

  // Modale « Récupérer un élève d'un autre établissement » (établissements
  // associés par le super admin) — recopiée de la fiche élève admin.
  const [crossOpen, setCrossOpen] = useState(false);
  const [crossSearch, setCrossSearch] = useState('');
  const [crossLevelFilter, setCrossLevelFilter] = useState('');
  const [crossLevels, setCrossLevels] = useState([]); // vrais niveaux des écoles associées
  const [crossTargetLevel, setCrossTargetLevel] = useState(''); // niveau cible (réinscription en masse)
  const [crossResults, setCrossResults] = useState([]);
  const [crossSearching, setCrossSearching] = useState(false);
  // Modale de confirmation de réinscription (élève d'un établissement associé).
  const [reinscribeTarget, setReinscribeTarget] = useState(null);
  const [reinscribeLevel, setReinscribeLevel] = useState('');
  const [reinscribeClassId, setReinscribeClassId] = useState('');
  const [reinscribeBusy, setReinscribeBusy] = useState(false);
  const [reinscribeMsg, setReinscribeMsg] = useState(null); // { type, text }
  const [undoing, setUndoing] = useState(false); // annulation de réinscription en cours

  // Année précédente, dans le même format (slash ou tiret) que l'année active.
  const prevYear = useMemo(() => {
    const p = prevYearStr(year);
    return p && String(year).includes('-') ? toDashYear(p) : p;
  }, [year]);

  const load = async () => {
    setLoading(true);
    try {
      // Roster de l'année active + roster de l'année précédente (pour proposer
      // la récupération des élèves pas encore réinscrits dans l'année active).
      const [data, prevData] = await Promise.all([
        enrollmentsApi.list(year),
        prevYear ? enrollmentsApi.list(prevYear).catch(() => []) : Promise.resolve([]),
      ]);
      setRoster(Array.isArray(data) ? data : []);
      setPrevRoster(Array.isArray(prevData) ? prevData : []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [year]);
  useEffect(() => {
    inscriptionsApi.listClasses(year).then((data) => setClasses(Array.isArray(data) ? data : []))
      .catch((e) => console.error(e));
  }, [year]);
  // Classes de l'année précédente : alimente la liste des niveaux du
  // formulaire d'inscription (une nouvelle année n'a souvent pas encore de classes).
  const [prevClasses, setPrevClasses] = useState([]);
  useEffect(() => {
    if (!prevYear) { setPrevClasses([]); return; }
    inscriptionsApi.listClasses(prevYear).then((data) => setPrevClasses(Array.isArray(data) ? data : []))
      .catch(() => setPrevClasses([]));
  }, [prevYear]);
  // Niveaux proposés dans la fiche d'inscription : ceux de l'année précédente
  // + ceux de l'année active, triés selon la progression scolaire.
  const levelOptions = useMemo(
    () => distinctLevels([...prevClasses, ...classes]),
    [prevClasses, classes],
  );

  // Identifiants des élèves déjà présents dans l'année active (réinscrits/nouveaux).
  const activeStudentIds = useMemo(
    () => new Set(roster.map((e) => e.student_id || e.student?.id).filter(Boolean)),
    [roster],
  );

  // Candidats à réinscrire : élèves inscrits l'an dernier (hors NR) mais pas
  // encore dans l'année active. Ils n'apparaissent PAS dans la liste (qui ne
  // montre que les élèves réinscrits) mais dans la fenêtre de réinscription.
  const candidates = useMemo(() => {
    return prevRoster
      .filter((e) => e.status !== 'NR')
      .filter((e) => {
        const sid = e.student_id || e.student?.id;
        return sid && !activeStudentIds.has(sid);
      })
      .map((e) => ({ ...e, _candidate: true }));
  }, [prevRoster, activeStudentIds]);

  // Liste unifiée de réinscription : élèves non réinscrits de l'année précédente
  // (propre école) + élèves des établissements associés, filtrés par le même
  // champ de recherche (nom/Massar) et le même niveau.
  const mergedReinscribe = useMemo(() => {
    const q = crossSearch.trim().toLowerCase();
    const lvl = crossLevelFilter;

    const own = candidates
      .filter((e) => !lvl || (e.class?.level || '') === lvl)
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

    return [...own, ...cross];
  }, [candidates, crossResults, crossSearch, crossLevelFilter]);

  // La liste n'affiche que les élèves réinscrits/inscrits pour l'année active
  // (vide pour une année neuve tant qu'aucune réinscription n'a été faite).
  const filtered = useMemo(() => {
    let list = [...roster];
    if (classFilter) list = list.filter((e) => e.class_id === classFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((e) => `${e.student?.first_name || ''} ${e.student?.last_name || ''}`.toLowerCase().includes(q));
    }
    return list;
  }, [roster, classFilter, search]);

  const openForm = () => setShowForm(true);

  // ── Récupération d'élèves d'un établissement associé ──────────────────────
  // Ouvre la modale et liste d'emblée les élèves des établissements associés.
  const openCrossModal = async () => {
    setCrossSearch(''); setCrossLevelFilter(''); setCrossTargetLevel(''); setCrossResults([]);
    setCrossOpen(true);
    runCrossSearch('', '');
    try { const { levels } = await enrollmentsApi.crossSchoolLevels(); setCrossLevels(levels || []); }
    catch { setCrossLevels([]); }
  };

  // Recherche par nom ET/OU par niveau. Sans critère → tous les élèves associés.
  const runCrossSearch = async (q, level) => {
    const name = (q ?? crossSearch).trim();
    const lvl = level ?? crossLevelFilter;
    setCrossSearching(true);
    try {
      setCrossResults(await enrollmentsApi.crossSchoolSearch(name, lvl));
    } catch (e) {
      console.error('Recherche inter-écoles:', e);
      setCrossResults([]);
    } finally {
      setCrossSearching(false);
    }
  };

  // Réinscrit en masse tout un niveau d'un établissement associé (ex : tous les 6AP).
  const reinscribeWholeLevel = async () => {
    if (!crossLevelFilter) return;
    const next = crossTargetLevel || nextLevel(crossLevelFilter) || crossLevelFilter;
    if (!window.confirm(`Réinscrire TOUS les élèves de niveau ${crossLevelFilter} des établissements associés vers ${next} (année ${year}) ? Ils seront déplacés vers cet établissement.`)) return;
    setCrossSearching(true);
    try {
      const r = await enrollmentsApi.reinscribeLevel({ source_level: crossLevelFilter, target_level: next, academic_year: year });
      await load();
      setCrossOpen(false);
      alert(`${r.count} élève(s) de ${r.source_level} réinscrit(s) en ${r.target_level} pour ${r.academic_year}.`);
    } catch (e) {
      alert(e.message || 'Erreur lors de la réinscription en masse');
    } finally {
      setCrossSearching(false);
    }
  };

  // Prépare la modale de confirmation depuis un résultat d'école associée.
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
    setCrossOpen(false);
  };

  // Prépare la modale pour un élève de la PROPRE école inscrit l'an dernier
  // (candidat non encore réinscrit dans l'année active).
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
    setCrossOpen(false);
  };

  // Annule la réinscription d'un élève de l'année active : le remet dans son
  // état précédent (classe/niveau) et supprime son inscription de l'année.
  const undoReinscription = async (entry) => {
    const name = `${entry.student?.last_name || ''} ${entry.student?.first_name || ''}`.trim();
    if (!window.confirm(`Annuler la réinscription de ${name} pour ${year} ? L'élève sera remis dans son état précédent (classe et niveau) et son inscription ${year} sera supprimée.`)) return;
    setUndoing(true);
    try {
      await enrollmentsApi.undoReinscribe(entry.student?.id, year);
      await load();
      setActiveEntry(null);
    } catch (e) {
      alert(e.message || "Erreur lors de l'annulation de la réinscription");
    } finally {
      setUndoing(false);
    }
  };

  // Télécharge la fiche d'inscription d'un élève inscrit : récupère le profil
  // complet (parents, documents, identité…) puis ouvre la même fiche que l'admin.
  const downloadFiche = async (entry) => {
    const sid = entry.student_id || entry.student?.id;
    if (!sid) return;
    setFicheBusy(true);
    try {
      const full = await inscriptionsApi.getStudent(sid);
      const student = { ...(entry.student || {}), ...full, class_id: entry.class_id ?? full.class_id };
      printInscriptionFiche({ student, school, classes, apiBase, academicYear: year });
    } catch (e) {
      alert(e.message || 'Erreur lors de la récupération de la fiche');
    } finally {
      setFicheBusy(false);
    }
  };

  const submitReinscribe = async () => {
    if (!reinscribeTarget) return;
    setReinscribeBusy(true); setReinscribeMsg(null);
    try {
      const payload = { student_id: reinscribeTarget.id, academic_year: year };
      if (reinscribeClassId) payload.target_class_id = reinscribeClassId;
      else if (reinscribeLevel) payload.target_level = reinscribeLevel;
      const r = await enrollmentsApi.reinscribe(payload);
      await load();
      const name = reinscribeTarget.name;
      setReinscribeTarget(null);
      alert(`${name} réinscrit(e) en ${r.level} pour ${r.academic_year}.`);
    } catch (e) {
      setReinscribeMsg({ type: 'err', text: e.message || 'Erreur lors de la réinscription' });
    } finally {
      setReinscribeBusy(false);
    }
  };

  return (
    <div className="p-6 space-y-5">
      <PageHeader
        icon={Users}
        title="Élèves"
        subtitle={`Année scolaire ${year} · ${roster.length} inscrit(s)${candidates.length ? ` · ${candidates.length} à réinscrire` : ''}`}
        color="orange"
        onRefresh={load}
        loading={loading}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              icon={ArrowRightLeft}
              onClick={openCrossModal}
              title="Réinscrire des élèves de l'année précédente ou d'un établissement associé"
            >
              Réinscription{candidates.length ? ` (${candidates.length})` : ''}
            </Button>
            <Button icon={Plus} onClick={openForm}>Nouvel élève</Button>
          </div>
        }
      />

      <FilterBar>
        <div className="flex-1 min-w-[200px] flex items-center gap-2 border border-border rounded-lg px-3 h-9 bg-card">
          <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un élève…"
            className="flex-1 bg-transparent outline-none text-sm"
          />
        </div>
        <select
          value={classFilter}
          onChange={(e) => setClassFilter(e.target.value)}
          className="border border-border rounded-lg px-3 h-9 text-sm bg-card"
        >
          <option value="">Toutes les classes</option>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <GridListToggle value={viewMode} onChange={setViewMode} />
      </FilterBar>

      {loading ? (
        <div className="flex justify-center p-10"><RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 space-y-3">
          <p className="text-sm text-muted-foreground">Aucun élève réinscrit pour {year}.</p>
          {candidates.length > 0 && (
            <Button variant="secondary" icon={ArrowRightLeft} onClick={openCrossModal} className="mx-auto">
              Réinscrire des élèves ({candidates.length} en attente)
            </Button>
          )}
        </div>
      ) : viewMode === 'grid' ? (
        <CardGrid>
          {filtered.map((e) => (
            <StudentCard
              key={'a' + e.id}
              name={`${e.student?.last_name || ''} ${e.student?.first_name || ''}`.trim()}
              className={e.class?.name || 'Sans classe'}
              photo={e.student?.avatar_url}
              gender={e.student?.gender || ''}
              status={statusPill(e.status)}
              onClick={() => setActiveEntry(e)}
            />
          ))}
        </CardGrid>
      ) : (
        <div>
          {filtered.map((e) => (
            <StudentRow
              key={'a' + e.id}
              name={`${e.student?.last_name || ''} ${e.student?.first_name || ''}`.trim()}
              className={e.class?.name || 'Sans classe'}
              sub={e.class?.level}
              photo={e.student?.avatar_url}
              gender={e.student?.gender || ''}
              status={statusPill(e.status)}
              onClick={() => setActiveEntry(e)}
            />
          ))}
        </div>
      )}

      {/* Fiche élève — lecture seule (édition pédagogique réservée à l'admin) */}
      <DetailDrawer open={!!activeEntry} onClose={() => setActiveEntry(null)} title={activeEntry ? `${activeEntry.student?.last_name || ''} ${activeEntry.student?.first_name || ''}`.trim() : ''}>
        {activeEntry && (
          <div>
            <FieldRow label="Classe" value={activeEntry.class?.name || '—'} />
            <FieldRow label="Niveau" value={activeEntry.class?.level || '—'} />
            <FieldRow label="Filière" value={activeEntry.class?.filiere || '—'} />
            <FieldRow label="Statut" value={activeEntry.status === 'RI' ? 'Réinscrit' : activeEntry.status === 'NI' ? 'Nouveau' : 'Non réinscrit'} />
            <FieldRow label="Code Massar" value={activeEntry.student?.massar_code || '—'} mono />

            {/* Télécharger la fiche d'inscription (identique à l'admin) */}
            <button
              onClick={() => downloadFiche(activeEntry)}
              disabled={ficheBusy}
              className="mt-5 w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {ficheBusy ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {ficheBusy ? 'Préparation…' : "Télécharger la fiche d'inscription"}
            </button>

            {/* Annuler la réinscription : remet l'élève dans son état initial */}
            {(activeEntry.status === 'RI' || activeEntry.status === 'NI') && (
              <div className="mt-5 pt-4 border-t border-border">
                <button
                  onClick={() => undoReinscription(activeEntry)}
                  disabled={undoing}
                  className="w-full flex items-center justify-center gap-2 border border-red-300 text-red-600 hover:bg-red-50 px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                >
                  {undoing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                  {undoing ? 'Annulation…' : 'Annuler la réinscription'}
                </button>
                <p className="text-[11px] text-muted-foreground mt-1.5 text-center">
                  Supprime l'inscription {year} et remet l'élève dans sa classe et son niveau précédents.
                </p>
              </div>
            )}
          </div>
        )}
      </DetailDrawer>

      {/* Nouvel élève — fiche d'inscription complète (identique à l'admin) */}
      <StudentInscriptionModal
        open={showForm}
        onClose={() => setShowForm(false)}
        classes={classes}
        levels={levelOptions}
        academicYear={year}
        onCreated={load}
      />

      {/* Fenêtre de réinscription : élèves de l'année précédente + établissements associés */}
      {crossOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setCrossOpen(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b">
              <div className="flex items-center gap-2">
                <ArrowRightLeft className="w-5 h-5 text-violet-600" />
                <h3 className="font-semibold">Réinscription — {year}</h3>
              </div>
              <button onClick={() => setCrossOpen(false)} className="p-1 rounded hover:bg-gray-100">
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
                  {(crossLevels.length ? crossLevels : LEVEL_ORDER).map((lvl) => <option key={lvl} value={lvl}>{lvl}</option>)}
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
                    {LEVEL_ORDER.map((lvl) => <option key={lvl} value={lvl}>{lvl}</option>)}
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
                {crossSearching && mergedReinscribe.length === 0 && (
                  <div className="p-3 text-sm text-gray-500">Chargement…</div>
                )}
                {!crossSearching && mergedReinscribe.length === 0 && (
                  <div className="p-3 text-sm text-gray-500">Aucun élève à réinscrire (année précédente ou établissements associés).</div>
                )}
                {mergedReinscribe.map((item) => (
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
              <button onClick={() => setCrossOpen(false)}
                className="px-3 py-2 border rounded-lg text-sm hover:bg-gray-50">
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
                  {LEVEL_ORDER.map((lvl) => <option key={lvl} value={lvl}>{lvl}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Classe d'accueil (optionnel)</label>
                <select value={reinscribeClassId} onChange={(e) => setReinscribeClassId(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm">
                  <option value="">Niveau seul — à affecter à une classe plus tard</option>
                  {classes
                    .filter((c) => !reinscribeLevel || c.level === reinscribeLevel)
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
    </div>
  );
}
