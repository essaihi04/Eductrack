import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { cn } from '../../lib/utils';
import {
  LayoutDashboard,
  Calendar,
  BookOpen,
  GraduationCap,
  BarChart3,
  Users,
  ClipboardList,
  Award,
  FileText,
  CheckSquare,
  Upload,
  School,
  GitCompare,
  Activity,
  CalendarDays
} from 'lucide-react';

const MobileNav = () => {
  const location = useLocation();
  const { profile } = useAuth();

  const getNavItems = () => {
    if (profile?.role === 'super_admin') {
      return [
        { icon: School, label: 'Écoles', path: '/superadmin/schools' },
        { icon: GitCompare, label: 'Comparaison', path: '/superadmin/compare' },
        { icon: Activity, label: 'Audit', path: '/superadmin/audit' },
      ];
    }

    if (profile?.role === 'teacher') {
      return [
        { icon: BarChart3, label: 'Tableau', path: '/teacher/dashboard' },
        { icon: Users, label: 'Élèves', path: '/students' },
        { icon: Calendar, label: 'Suivi', path: '/teacher/rapide' },
        { icon: ClipboardList, label: 'Contrôles', path: '/teacher/controls' },
        { icon: CalendarDays, label: 'Planning', path: '/teacher/planificateur' },
      ];
    }

    if (profile?.role === 'admin' || profile?.role === 'school_admin') {
      return [
        { icon: LayoutDashboard, label: 'Accueil', path: '/dashboard' },
        { icon: Users, label: 'Élèves', path: '/students' },
        { icon: GraduationCap, label: 'Classes', path: '/classes' },
        { icon: BarChart3, label: 'Stats', path: '/behavior' },
        { icon: BookOpen, label: 'Matières', path: '/subjects' },
      ];
    }

    // Student
    return [
      { icon: Calendar, label: 'Mon jour', path: '/dashboard' },
      { icon: GraduationCap, label: 'Niveau', path: '/student/level' },
      { icon: ClipboardList, label: 'Devoirs', path: '/my-assignments' },
      { icon: BarChart3, label: 'Notes', path: '/my-grades' },
      { icon: Award, label: 'Badges', path: '/student/badges' },
    ];
  };

  const navItems = getNavItems();

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-card border-t border-border">
      <div className="flex items-center justify-around h-16">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                'flex flex-col items-center justify-center flex-1 h-full gap-1 text-xs transition-colors',
                isActive
                  ? 'text-primary'
                  : 'text-muted-foreground'
              )}
            >
              <Icon className={cn('w-5 h-5', isActive && 'text-primary')} />
              <span className="truncate max-w-[56px] text-center leading-tight">{item.label}</span>
              {isActive && (
                <span className="absolute bottom-0 w-8 h-0.5 bg-primary rounded-full" />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
};

export default MobileNav;
