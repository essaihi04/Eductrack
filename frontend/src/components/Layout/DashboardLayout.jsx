import { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import MobileNav from './MobileNav';
import DomainTabs from './DomainTabs';
import NotificationsBell from '../NotificationsBell';

const DashboardLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isLandscape, setIsLandscape] = useState(false);
  const location = useLocation();

  // Détecter l'orientation du téléphone
  useEffect(() => {
    const checkOrientation = () => {
      // Détecter le mode paysage : largeur > hauteur ET hauteur < 600px (typique mobile)
      const isMobileLandscape = window.innerWidth > window.innerHeight && window.innerHeight < 600;
      
      console.log('[DashboardLayout] Orientation check:', {
        width: window.innerWidth,
        height: window.innerHeight,
        isMobileLandscape,
        pathname: location.pathname
      });
      
      setIsLandscape(isMobileLandscape);
      
      // Fermer automatiquement la sidebar en mode paysage
      if (isMobileLandscape) {
        setSidebarOpen(false);
      }
    };

    checkOrientation();
    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);

    return () => {
      window.removeEventListener('resize', checkOrientation);
      window.removeEventListener('orientationchange', checkOrientation);
    };
  }, [location.pathname]);

  // Vérifier si on est sur une page de suivi
  const isTrackingPage = location.pathname.includes('/teacher/suivi') || 
                         location.pathname.includes('/teacher/session-tracking') ||
                         location.pathname.includes('/teacher/control-tracking') ||
                         location.pathname.includes('/teacher/rapide');

  return (
    <div className="min-h-screen bg-background">
      {/* Sidebar desktop - Masquée en mode paysage sur les pages de suivi */}
      {!(isLandscape && isTrackingPage) && (
        <div className="hidden md:block">
          <Sidebar />
        </div>
      )}

      {/* Sidebar mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="relative z-50">
            <Sidebar onClose={() => setSidebarOpen(false)} />
          </div>
        </div>
      )}

      {/* Header mobile - Masqué en mode paysage sur les pages de suivi */}
      {!(isLandscape && isTrackingPage) && (
        <div className="md:hidden fixed top-0 left-0 right-0 z-30 bg-card border-b border-border flex items-center justify-between px-4 h-14">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-lg hover:bg-accent"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="font-bold text-primary text-lg">Eductrack</span>
          <NotificationsBell />
        </div>
      )}

      {/* Bouton flottant pour afficher la sidebar en mode paysage */}
      {isLandscape && isTrackingPage && (
        <button
          onClick={() => setSidebarOpen(true)}
          className="fixed top-2 left-2 z-50 p-2 bg-primary text-white rounded-lg shadow-lg hover:bg-primary/90"
          aria-label="Ouvrir le menu"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      )}

      {/* Main content */}
      <main className={`${!(isLandscape && isTrackingPage) ? 'md:ml-64' : ''} ${isLandscape && isTrackingPage ? 'pt-0' : 'pt-14 md:pt-0'} ${!(isLandscape && isTrackingPage) ? 'pb-20 md:pb-0' : 'pb-0'} ${isLandscape && isTrackingPage ? 'p-2' : 'p-4 md:p-8'}`}>
        {!(isLandscape && isTrackingPage) && <DomainTabs />}
        <div className="flex justify-between items-start">
          <div className="flex-1 min-w-0">
            <Outlet />
          </div>
          <div className="ml-4 hidden md:block">
            <NotificationsBell />
          </div>
        </div>
      </main>

      {/* Bottom nav mobile - Masqué en mode paysage sur les pages de suivi */}
      {!(isLandscape && isTrackingPage) && <MobileNav />}
    </div>
  );
};

export default DashboardLayout;
