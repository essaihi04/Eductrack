import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { domainForPath, visibleGroups } from '../../pages/admin/adminNav';

// Barre d'onglets 2 niveaux affichée en haut de la zone de contenu pour les
// rôles admin (modèle FinanceShell). Niveau 1 = groupes du domaine (masqué si
// un seul groupe), niveau 2 = items du groupe actif. Rien n'est rendu sur les
// pages hors domaine (tableau de bord, profil…) ou pour les rôles non admin.
const ADMIN_ROLES = ['admin', 'school_admin', 'pedagogical_director', 'pedagogical_manager'];

export default function DomainTabs() {
  const { pathname } = useLocation();
  const { profile } = useAuth();
  const role = profile?.role;

  if (!ADMIN_ROLES.includes(role)) return null;

  const match = domainForPath(pathname, role);
  if (!match) return null;

  const { domain, group } = match;
  const groups = visibleGroups(domain, role);
  const DomainIcon = domain.icon;
  const hasGroups = groups.length > 1;

  return (
    <div className="-mx-4 md:-mx-8 mb-4 md:mb-6 bg-card border-b border-border">
      <div className="px-4 md:px-6 pt-6 md:pt-8">
        {/* Niveau 1 : groupes du domaine */}
        {hasGroups ? (
          <nav className="flex items-center gap-1 overflow-x-auto">
            {groups.map((g) => {
              const active = g.key === group.key;
              return (
                <NavLink
                  key={g.key}
                  to={g.items[0].path}
                  end={g.items[0].end}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                    active
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  }`}
                >
                  {g.label}
                </NavLink>
              );
            })}
          </nav>
        ) : (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <DomainIcon className="w-4 h-4" />
            <span className="font-medium text-gray-700">{domain.label}</span>
          </div>
        )}

        {/* Niveau 2 : items du groupe actif */}
        <nav className="flex items-center gap-1 mt-3 -mb-px overflow-x-auto">
          {group.items.map((tab) => {
            const TabIcon = tab.icon;
            return (
              <NavLink
                key={tab.path}
                to={tab.path}
                end={tab.end}
                className={({ isActive }) =>
                  `flex items-center gap-2 px-3 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                    isActive
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-gray-700 hover:border-gray-200'
                  }`
                }
              >
                {TabIcon && <TabIcon className="w-4 h-4" />}
                {tab.label}
              </NavLink>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
