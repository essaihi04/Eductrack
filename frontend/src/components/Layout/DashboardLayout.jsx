import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import NotificationsBell from '../NotificationsBell';

const DashboardLayout = () => {
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="ml-64 p-8">
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <Outlet />
          </div>
          <div className="ml-4">
            <NotificationsBell />
          </div>
        </div>
      </main>
    </div>
  );
};

export default DashboardLayout;
