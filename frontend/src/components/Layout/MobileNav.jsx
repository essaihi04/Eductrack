import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useT } from '../../i18n';
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
  CalendarDays,
  Bus,
  MapPin,
  UserCog,
  Wallet,
  TrendingUp,
  Menu,
  X,
  Edit,
  CalendarClock,
  Bell
} from 'lucide-react';

const MobileNav = () => {
  const location = useLocation();
  const { profile } = useAuth();
  const t = useT();
  const [moreOpen, setMoreOpen] = useState(false);

  const teacherSecondaryItems = profile?.role === 'teacher' ? [
    { icon: ClipboardList, label: t('nav.controls'), path: '/teacher/controls' },
    { icon: CalendarDays, label: t('nav.planner'), path: '/teacher/planificateur' },
    { icon: FileText, label: t('nav.textbook'), path: '/teacher/cahier-de-texte' },
    { icon: Upload, label: t('nav.teachingDocs'), path: '/teacher/documents' },
    { icon: Edit, label: t('nav.appreciations'), path: '/teacher/appreciations' },
    { icon: CalendarClock, label: t('nav.parentAppointments'), path: '/teacher/appointments' },
  ] : [];

  const studentSecondaryItems = profile?.role === 'student' ? [
    { icon: FileText, label: 'Ressources', path: '/student/documents' },
    { icon: GraduationCap, label: 'Progression', path: '/student/level' },
    { icon: Award, label: 'Badges', path: '/student/badges' },
    { icon: FileText, label: 'Bulletins', path: '/student/bulletins' },
    { icon: Edit, label: 'Mon profil', path: '/profile' },
  ] : [];

  const secondaryItems = profile?.role === 'teacher'
    ? teacherSecondaryItems
    : studentSecondaryItems;

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
        { icon: BarChart3, label: t('mnav.dashboard'), path: '/teacher/dashboard' },
        { icon: Users, label: t('nav.teacher.classroom'), path: '/teacher/classroom' },
        { icon: BookOpen, label: t('nav.homework'), path: '/teacher/devoirs' },
        { icon: ClipboardList, label: t('nav.controls'), path: '/teacher/controls' },
        { icon: Menu, label: t('mnav.more'), path: '#teacher-more', more: true },
      ];
    }

    if (profile?.role === 'transport_manager') {
      return [
        { icon: LayoutDashboard, label: 'Tableau', path: '/transport' },
        { icon: MapPin, label: 'Suivi', path: '/transport/live' },
        { icon: Bus, label: 'Bus', path: '/transport/buses' },
        { icon: UserCog, label: 'Chauffeurs', path: '/transport/drivers' },
      ];
    }

    if (profile?.role === 'driver') {
      return [
        { icon: LayoutDashboard, label: 'Tableau', path: '/driver/dashboard' },
      ];
    }

    if (profile?.role === 'parent') {
      return [
        { icon: LayoutDashboard, label: t('pnav.home'), path: '/parent', childPaths: ['/parent/children'] },
        { icon: Bell, label: t('pnav.notifications'), path: '/parent/notifications' },
        { icon: Wallet, label: t('pnav.finance'), path: '/parent/finance' },
      ];
    }

    if (profile?.role === 'finance_manager') {
      return [
        { icon: LayoutDashboard, label: 'Accueil', path: '/dashboard' },
        { icon: Wallet, label: 'Finance', path: '/finance' },
      ];
    }

    if (profile?.role === 'admin' || profile?.role === 'school_admin' || profile?.role === 'pedagogical_director' || profile?.role === 'pedagogical_manager') {
      const isPedagogical = profile?.role === 'pedagogical_director' || profile?.role === 'pedagogical_manager';
      return [
        { icon: LayoutDashboard, label: 'Accueil', path: '/dashboard' },
        { icon: Users, label: 'Élèves', path: '/students' },
        { icon: GraduationCap, label: 'Classes', path: '/classes' },
        // La direction pédagogique peut faire le suivi de séance comme un prof
        ...(isPedagogical
          ? [{ icon: Calendar, label: 'Séance', path: '/teacher/rapide' }]
          : []),
        { icon: TrendingUp, label: 'Suivi profs', path: '/teacher-tracking' },
        { icon: BarChart3, label: 'Stats', path: '/behavior' },
        { icon: BookOpen, label: 'Matières', path: '/subjects' },
      ];
    }

    // Student
    if (profile?.role !== 'student') return []; // évite menu élève pour rôles inconnus
    return [
      { icon: Calendar, label: 'Accueil', path: '/dashboard' },
      { icon: BookOpen, label: 'Emploi', path: '/student/timetable' },
      { icon: ClipboardList, label: 'Devoirs', path: '/my-assignments' },
      { icon: BarChart3, label: 'Notes', path: '/my-grades' },
      { icon: Menu, label: 'Plus', path: '#student-more', more: true },
    ];
  };

  const navItems = getNavItems();

  if (!navItems || navItems.length === 0) return null;

  return (
    <>
      {(profile?.role === 'teacher' || profile?.role === 'student') && moreOpen && (
        <>
          <button
            type="button"
            aria-label={t('common.close')}
            className="md:hidden fixed inset-0 z-30 bg-black/25"
            onClick={() => setMoreOpen(false)}
          />
          <div className="md:hidden fixed inset-x-3 bottom-20 z-40 rounded-2xl border border-border bg-card p-3 shadow-xl">
            <div className="mb-2 flex items-center justify-between px-1">
              <p className="text-sm font-semibold">{t('mnav.more')}</p>
              <button
                type="button"
                aria-label={t('common.close')}
                onClick={() => setMoreOpen(false)}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {secondaryItems.map((item) => {
                const Icon = item.icon;
                const active = location.pathname.startsWith(item.path);
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setMoreOpen(false)}
                    className={cn(
                      'flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm',
                      active
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                    )}
                  >
                    <Icon className="h-4 w-4 flex-shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </>
      )}

      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-card border-t border-border">
      <div className="flex items-center justify-around h-16">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = item.more
            ? secondaryItems.some((secondary) => location.pathname.startsWith(secondary.path))
            : item.childPaths
              ? location.pathname === item.path || item.childPaths.some((path) => location.pathname === path || location.pathname.startsWith(`${path}/`))
              : location.pathname === item.path;
          if (item.more) {
            return (
              <button
                key={item.path}
                type="button"
                onClick={() => setMoreOpen((open) => !open)}
                className={cn(
                  'relative flex flex-1 flex-col items-center justify-center h-full gap-1 text-xs transition-colors',
                  isActive || moreOpen ? 'text-primary' : 'text-muted-foreground'
                )}
              >
                <Icon className="h-5 w-5" />
                <span className="truncate max-w-[56px] text-center leading-tight">{item.label}</span>
                {(isActive || moreOpen) && <span className="absolute bottom-0 w-8 h-0.5 bg-primary rounded-full" />}
              </button>
            );
          }
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                'relative flex flex-col items-center justify-center flex-1 h-full gap-1 text-xs transition-colors',
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
    </>
  );
};

export default MobileNav;
