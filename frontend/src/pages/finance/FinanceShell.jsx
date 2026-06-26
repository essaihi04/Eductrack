import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { FINANCE_POLES, poleForPath, tabForPath, POLE_COLORS } from './financeNav';

// Coquille du module finance : Finance est une seule entrée dans la barre
// latérale. Le passage d'un pôle à l'autre se fait ici (rangée de pôles), puis
// la rangée d'onglets du pôle actif, puis — si l'onglet en a — la rangée de
// sous-onglets, puis la page courante via <Outlet/>.
export default function FinanceShell() {
  const { pathname } = useLocation();
  const pole = poleForPath(pathname);
  const colors = POLE_COLORS[pole.color] || POLE_COLORS.blue;
  const activeTab = tabForPath(pole, pathname);
  const subTabs = activeTab?.subTabs || [];

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
          {/* Niveau 2 : onglets du pôle actif (un onglet à sous-onglets est
              actif dès qu'un de ses sous-onglets l'est) */}
          <nav className={`flex items-center gap-1 mt-3 overflow-x-auto ${subTabs.length ? '' : '-mb-px'}`}>
            {pole.tabs.map((tab) => {
              const TabIcon = tab.icon;
              const isActive = tab === activeTab;
              return (
                <NavLink
                  key={tab.path}
                  to={tab.path}
                  end={tab.end}
                  className={`flex items-center gap-2 px-3 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                    isActive
                      ? colors.tab
                      : 'border-transparent text-muted-foreground hover:text-gray-700 hover:border-gray-200'
                  }`}
                >
                  {TabIcon && <TabIcon className="w-4 h-4" />}
                  {tab.label}
                </NavLink>
              );
            })}
          </nav>
          {/* Niveau 3 : sous-onglets de l'onglet actif, le cas échéant */}
          {subTabs.length > 0 && (
            <nav className="flex items-center gap-1 mt-1 mb-2 overflow-x-auto">
              {subTabs.map((sub) => {
                const SubIcon = sub.icon;
                return (
                  <NavLink
                    key={sub.path}
                    to={sub.path}
                    end={sub.end}
                    className={({ isActive }) =>
                      `flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full whitespace-nowrap transition-colors ${
                        isActive
                          ? colors.soft
                          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                      }`
                    }
                  >
                    {SubIcon && <SubIcon className="w-3.5 h-3.5" />}
                    {sub.label}
                  </NavLink>
                );
              })}
            </nav>
          )}
        </div>
      </div>

      <Outlet />
    </div>
  );
}
