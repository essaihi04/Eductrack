import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { poleForPath, POLE_COLORS } from './financeNav';

// Coquille du module finance : affiche le titre du pôle actif et sa barre
// d'onglets, puis rend la page courante via <Outlet/>. La barre latérale
// gère le passage d'un pôle à l'autre (4 entrées).
export default function FinanceShell() {
  const { pathname } = useLocation();
  const pole = poleForPath(pathname);
  const colors = POLE_COLORS[pole.color] || POLE_COLORS.blue;
  const PoleIcon = pole.icon;

  return (
    <div className="min-h-full">
      <div className="bg-card border-b border-border sticky top-0 z-20">
        <div className="px-6 pt-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <PoleIcon className="w-4 h-4" />
            <span className="font-medium text-gray-700">{pole.label}</span>
          </div>
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
