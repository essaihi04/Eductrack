import { useEffect, useMemo, useState } from 'react';
import { LayoutDashboard, Users, UserCheck, UserPlus, UserX, TrendingUp, FolderX, School } from 'lucide-react';
import { PageHeader, KpiGrid, KpiCard, Card } from '../../../components/finance/ui';
import { useYear } from '../../../contexts/YearContext';
import { enrollmentsApi } from '../../../lib/enrollmentsApi';

// Tableau de bord « Inscriptions » du module finance : entonnoir de l'année
// active (réinscrits / nouveaux / non réinscrits) + quelques métriques dérivées
// du roster (répartition par niveau, élèves sans classe assignée). Lecture
// seule — les actions (ajouter un élève, réinscrire) vivent dans les deux
// autres onglets du pôle.
export default function InscriptionsDashboardPage() {
  const { year } = useYear();
  const [funnel, setFunnel] = useState(null);
  const [roster, setRoster] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([enrollmentsApi.getFunnel(year), enrollmentsApi.list(year)])
      .then(([f, r]) => { if (!cancelled) { setFunnel(f); setRoster(Array.isArray(r) ? r : []); } })
      .catch((e) => console.error(e))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [year]);

  const tauxReinscription = useMemo(() => {
    if (!funnel) return null;
    const base = (funnel.ri || 0) + (funnel.nr || 0);
    if (base === 0) return null;
    return Math.round(((funnel.ri || 0) / base) * 1000) / 10;
  }, [funnel]);

  const parNiveau = useMemo(() => {
    const counts = new Map();
    roster.forEach((e) => {
      const lvl = e.class?.level || 'Sans niveau';
      counts.set(lvl, (counts.get(lvl) || 0) + 1);
    });
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [roster]);

  const sansClasse = useMemo(() => roster.filter((e) => !e.class_id).length, [roster]);
  const maxNiveau = parNiveau.length ? parNiveau[0][1] : 0;

  return (
    <div className="p-6 space-y-5">
      <PageHeader
        icon={LayoutDashboard}
        title="Tableau de bord — Inscriptions"
        subtitle={`Année scolaire ${year}`}
        color="orange"
        onRefresh={() => {
          setLoading(true);
          Promise.all([enrollmentsApi.getFunnel(year), enrollmentsApi.list(year)])
            .then(([f, r]) => { setFunnel(f); setRoster(Array.isArray(r) ? r : []); })
            .finally(() => setLoading(false));
        }}
        loading={loading}
      />

      <KpiGrid cols={4}>
        <KpiCard icon={Users} label="Élèves actifs" value={funnel?.total ?? '—'} tone="blue" sub="Réinscrits + nouveaux" />
        <KpiCard icon={UserCheck} label="Réinscrits" value={funnel?.ri ?? '—'} tone="green" sub={`Année ${year}`} />
        <KpiCard icon={UserPlus} label="Nouveaux" value={funnel?.ni ?? '—'} tone="orange" sub="Jamais inscrits l'an dernier" />
        <KpiCard icon={UserX} label="Non réinscrits" value={funnel?.nr ?? '—'} tone="red" sub="Actifs l'an dernier, absents cette année" />
      </KpiGrid>

      <KpiGrid cols={3}>
        <KpiCard
          icon={TrendingUp}
          label="Taux de réinscription"
          value={tauxReinscription != null ? `${tauxReinscription}%` : '—'}
          tone={tauxReinscription != null && tauxReinscription < 80 ? 'red' : 'green'}
          sub="Réinscrits ÷ (réinscrits + non réinscrits)"
        />
        <KpiCard icon={FolderX} label="Sans classe assignée" value={sansClasse} tone={sansClasse > 0 ? 'orange' : 'gray'} sub="Dossier à finaliser" />
        <KpiCard icon={School} label="Niveaux représentés" value={parNiveau.length} tone="purple" />
      </KpiGrid>

      <Card title="Répartition par niveau">
        {parNiveau.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Aucun élève actif pour {year}.</p>
        ) : (
          <div className="space-y-2">
            {parNiveau.map(([lvl, count]) => (
              <div key={lvl} className="flex items-center gap-3">
                <span className="w-36 shrink-0 text-sm text-gray-700 truncate">{lvl}</span>
                <div className="flex-1 h-2.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-500 rounded-full"
                    style={{ width: `${maxNiveau ? (count / maxNiveau) * 100 : 0}%` }}
                  />
                </div>
                <span className="w-10 text-right text-sm font-medium tabular-nums">{count}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
