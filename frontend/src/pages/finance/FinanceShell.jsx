import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { FINANCE_POLES, poleForPath, POLE_COLORS } from './financeNav';

// Coquille du module finance : Finance est une seule entrée dans la barre
// latérale. Le passage d'un pôle à l'autre se fait ici (rangée de pôles), puis
// la rangée d'onglets du pôle actif, puis la page courante via <Outlet/>.
export default function FinanceShell() {
  const { pathname } = useLocation();
  const pole = poleForPath(pathname);
  const colors = POLE_COLORS[pole.color] || POLE_COLORS.blue;

  return (
    <div className="min-h-full">
      <div className="bg-card border-b border-border sticky top-0 z-20">
        <div className="px-6 pt-4">
          {/* Niveau 1 : pôles finance */}
          <nav className="flex items-center gap-1 overflow-x-auto">
            {FINANCE_POLES.map((p) => {
              const PoleTabIcon = p.icon;
              const active = p.key === pole.key;
              return (
                <NavLink
                  key={p.key}
                  to={p.tabs[0].path}
                  end={p.tabs[0].end}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                    active
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  }`}
                >
                  <PoleTabIcon className="w-4 h-4" />
                  {p.label}
                </NavLink>
              );
            })}
          </nav>
          {/* Niveau 2 : onglets du pôle actif */}
          <nav className="flex items-center gap-1 mt-3 -mb-px overflow-x-auto">
            {pole.tabs.map((tab) => {
              const TabIcon = tab.icon;
              return (
                <NavLink
                  key={tab.path}
                  to={tab.path}
                  end={tab.end}
                  className={({ isActive }) =>
                    `flex items-center gap-2 px-3 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                      isActive
                        ? colors.tab
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

      <Outlet />
    </div>
  );
}
