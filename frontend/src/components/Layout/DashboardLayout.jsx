import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import MobileNav from './MobileNav';
import NotificationsBell from '../NotificationsBell';

const DashboardLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      {/* Sidebar desktop */}
      <div className="hidden md:block">
        <Sidebar />
      </div>

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

      {/* Header mobile */}
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

      {/* Main content */}
      <main className="md:ml-64 pt-14 md:pt-0 pb-20 md:pb-0 p-4 md:p-8">
        <div className="flex justify-between items-start">
          <div className="flex-1 min-w-0">
            <Outlet />
          </div>
          <div className="ml-4 hidden md:block">
            <NotificationsBell />
          </div>
        </div>
      </main>

      {/* Bottom nav mobile */}
      <MobileNav />
    </div>
  );
};

export default DashboardLayout;
