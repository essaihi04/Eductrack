import { useState, useEffect } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Calendar, Users, UserCheck, UserPlus, UserX, GraduationCap, RotateCcw, ArrowRight, RefreshCw, Check, AlertTriangle, LogOut } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useYear } from '../contexts/YearContext';
import { enrollmentsApi } from '../lib/enrollmentsApi';
import { nextYearStr } from '../lib/schoolYear';
import SchoolSwitcher from '../components/SchoolSwitcher';

const ADMIN_ROLES = ['admin', 'school_admin', 'pedagogical_director'];
// Rôles autorisés à voir cet écran d'accueil : administrateurs + responsable
// financier. Le financier choisit son année mais n'a pas les actions de
// réinscription/réinitialisation (réservées à l'administration).
const YEAR_SELECT_ROLES = [...ADMIN_ROLES, 'finance_manager'];

const Stat = ({ icon: Icon, label, value, tone }) => (
  <div className="flex flex-col items-center gap-1 p-3 rounded-xl bg-white/70 border border-border min-w-[110px]">
    <div className={`p-2 rounded-lg ${tone}`}><Icon className="w-5 h-5" /></div>
    <div className="text-2xl font-bold">{value}</div>
    <div className="text-xs text-muted-foreground">{label}</div>
  </div>
);

const YearSelectionPage = () => {
  const { profile, school: schoolCtx, loading, signOut } = useAuth();
  const { year, setYear, years } = useYear();
  const navigate = useNavigate();
  const toYear = nextYearStr(year);
  const school = schoolCtx || profile?.school;

  const [funnel, setFunnel] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null); // { type: 'ok'|'err', text }

  const loadFunnel = async (y) => {
    try { setFunnel(await enrollmentsApi.getFunnel(y)); } catch { setFunnel(null); }
  };

  useEffect(() => { if (year) loadFunnel(year); }, [year]);

  if (loading) {
    return <div className="flex items-center justify-center h-screen"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" /></div>;
  }
  // Réservé aux administrateurs et au responsable financier ; les autres rôles
  // vont directement au tableau de bord.
  if (!profile) return <Navigate to="/login" replace />;
  if (!YEAR_SELECT_ROLES.includes(profile.role)) return <Navigate to="/dashboard" replace />;
  const isAdmin = ADMIN_ROLES.includes(profile.role);

  const handleAuto = async () => {
    if (!window.confirm(`Créer automatiquement les classes de ${toYear} et y réinscrire tous les élèves de ${year} (niveau promu) ?`)) return;
    setBusy(true); setMsg(null);
    try {
      const r = await enrollmentsApi.autoReinscription(year);
      setMsg({ type: 'ok', text: `${r.classes_created} classe(s) créée(s), ${r.reinscrits} réinscrit(s), ${r.non_reinscrits} non réinscrit(s), ${r.fee_plans_copied} plan(s) de frais reconduit(s).` });
      setYear(toYear);
      await loadFunnel(toYear);
    } catch (e) {
      setMsg({ type: 'err', text: e.message || 'Erreur' });
    } finally { setBusy(false); }
  };

  const handleReset = async () => {
    if (!window.confirm(`Réinitialiser l'année ${year} ? Les élèves repartent dans leur classe précédente et les inscriptions de ${year} sont supprimées. (Les classes vides sont conservées.)`)) return;
    setBusy(true); setMsg(null);
    try {
      const r = await enrollmentsApi.reset(year);
      setMsg({ type: 'ok', text: `Réinitialisé : ${r.reverted} élève(s) remis dans leur classe précédente, ${r.deleted} inscription(s) supprimée(s).` });
      await loadFunnel(year);
    } catch (e) {
      setMsg({ type: 'err', text: e.message || 'Erreur' });
    } finally { setBusy(false); }
  };

  return (
    <div className="theme-school min-h-screen bg-gradient-to-b from-sky-50 to-white">
      {/* En-tête */}
      <header className="flex items-center justify-between px-4 md:px-8 h-16 border-b border-border bg-white/60 backdrop-blur">
        <div className="flex items-center gap-3">
          {school?.logo_url
            ? <img src={school.logo_url} alt="" className="w-9 h-9 rounded-lg object-cover" />
            : <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center"><GraduationCap className="w-5 h-5 text-primary" /></div>}
          <span className="font-bold text-lg">{school?.name || 'EduTrack'}</span>
        </div>
        <div className="flex items-center gap-3">
          <SchoolSwitcher />
          <button onClick={() => signOut()} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <LogOut className="w-4 h-4" /> Déconnexion
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 md:py-12 space-y-8">
        {/* Sélecteur d'année */}
        <div>
          <label className="flex items-center gap-2 text-sm font-semibold text-muted-foreground mb-2">
            <Calendar className="w-4 h-4 text-primary" /> Année scolaire
          </label>
          <select
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className="w-full md:w-64 border border-border rounded-xl px-4 py-3 text-lg font-semibold bg-white shadow-sm outline-none focus:ring-2 focus:ring-primary/30"
          >
            {(years.includes(year) ? years : [year, ...years]).map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>

        {/* Carte entonnoir */}
        <div className="rounded-2xl border border-border bg-white shadow-sm p-6 space-y-5">
          <h2 className="text-center text-lg font-semibold">Inscriptions {year}</h2>
          <div className="flex flex-wrap justify-center gap-3">
            <Stat icon={Users} label="Total" value={funnel?.total ?? 0} tone="bg-blue-100 text-blue-700" />
            <Stat icon={UserCheck} label="Réinscrits" value={funnel?.ri ?? 0} tone="bg-green-100 text-green-700" />
            <Stat icon={UserPlus} label="Nouveaux" value={funnel?.ni ?? 0} tone="bg-amber-100 text-amber-700" />
            <Stat icon={UserX} label="Non réinscrits" value={funnel?.nr ?? 0} tone="bg-red-100 text-red-700" />
          </div>

          {msg && (
            <div className={`flex items-start gap-2 p-3 rounded-lg text-sm ${msg.type === 'ok' ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-red-50 border border-red-200 text-red-700'}`}>
              {msg.type === 'ok' ? <Check className="w-4 h-4 mt-0.5 shrink-0" /> : <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />}
              <span>{msg.text}</span>
            </div>
          )}

          {/* Actions de réinscription — réservées à l'administration */}
          {isAdmin && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <button
                  onClick={handleAuto}
                  disabled={busy}
                  className="flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 text-white px-4 py-3 rounded-xl font-semibold disabled:opacity-50"
                >
                  {busy ? <RefreshCw className="w-5 h-5 animate-spin" /> : <GraduationCap className="w-5 h-5" />}
                  Tout réinscrire → {toYear}
                </button>
                <button
                  onClick={handleReset}
                  disabled={busy}
                  className="flex items-center justify-center gap-2 border border-red-300 text-red-600 hover:bg-red-50 px-4 py-3 rounded-xl font-semibold disabled:opacity-50"
                >
                  <RotateCcw className="w-5 h-5" /> Réinitialiser {year}
                </button>
              </div>
              <p className="text-xs text-muted-foreground text-center">
                « Tout réinscrire » crée les classes de {toYear} (niveau promu) et y déplace les élèves,
                en reconduisant parents, plan de frais et code Massar. Pour des ajustements fins
                (redoublants, départs), utilisez la page Réinscription.
              </p>
            </>
          )}
        </div>

        {/* Entrer dans l'app */}
        <div className="flex justify-center">
          <button
            onClick={() => navigate(isAdmin ? '/dashboard' : '/finance')}
            className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-white px-8 py-3 rounded-xl font-semibold text-lg shadow"
          >
            Entrer dans {year} <ArrowRight className="w-5 h-5" />
          </button>
        </div>
      </main>
    </div>
  );
};

export default YearSelectionPage;
