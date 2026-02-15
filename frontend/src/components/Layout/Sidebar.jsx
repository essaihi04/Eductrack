import { Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  LayoutDashboard,
  Users,
  BookOpen,
  BarChart3,
  Settings,
  LogOut,
  GraduationCap,
  UserCircle,
  Calendar,
  ClipboardList,
  Award,
  Edit,
  FileText,
  CheckSquare,
  Upload,
  Users2,
  School,
  Shield,
  GitCompare,
  Activity,
  MessageSquare
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { cn } from '../../lib/utils';

const Sidebar = () => {
  const location = useLocation();
  const { profile, signOut } = useAuth();

  const getMenuItems = () => {
    if (profile?.role === 'super_admin') {
      return [
        { icon: School, label: 'Écoles', path: '/superadmin/schools' },
        { icon: GitCompare, label: 'Comparaison', path: '/superadmin/compare' },
        { icon: Activity, label: 'Journal d\'audit', path: '/superadmin/audit' },
      ];
    }

    if (profile?.role === 'teacher') {
      return [
        { icon: BarChart3, label: 'Tableau de bord', path: '/teacher/dashboard' },
        { icon: Users, label: 'Élèves', path: '/students' },
        { icon: Calendar, label: 'Suivi Rapide', path: '/teacher/rapide' },
        { icon: CheckSquare, label: 'Planificateur', path: '/teacher/planificateur' },
        { icon: ClipboardList, label: 'Contrôles', path: '/teacher/controls' },
        { icon: Upload, label: 'Documents pédagogiques', path: '/teacher/documents' },
        { icon: FileText, label: 'Devoirs', path: '/teacher/devoirs' },
        { icon: FileText, label: 'Cahier de texte', path: '/teacher/cahier-de-texte' },
      ];
    }

    const commonItems = [
      { icon: LayoutDashboard, label: 'Tableau de bord', path: '/dashboard' },
    ];

    if (profile?.role === 'admin' || profile?.role === 'school_admin') {
      return [
        ...commonItems,
        { icon: BarChart3, label: 'Comportement', path: '/behavior' },
        { icon: Users, label: 'Élèves', path: '/students' },
        { icon: UserCircle, label: 'Professeurs', path: '/teachers' },
        { icon: GraduationCap, label: 'Classes', path: '/classes' },
        { icon: BookOpen, label: 'Matières', path: '/subjects' },
        { icon: FileText, label: 'Cahier de texte', path: '/cahier-de-texte' },
        { icon: Users2, label: 'Parents', path: '/parents' },
        { icon: MessageSquare, label: 'WhatsApp', path: '/whatsapp' },
      ];
    }

    // Student menu
    return [
      { icon: Calendar, label: '📅 Mon jour', path: '/dashboard' },
      { icon: BookOpen, label: '📋 Mon emploi', path: '/student/timetable' },
      { icon: GraduationCap, label: '🎯 Mon niveau', path: '/student/level' },
      { icon: ClipboardList, label: '📘 Mes devoirs', path: '/my-assignments' },
      { icon: BarChart3, label: '📝 Mes notes', path: '/my-grades' },
      { icon: FileText, label: '📂 Documents', path: '/student/documents' },
      { icon: Award, label: '🧠 Badges', path: '/student/badges' },
      { icon: Edit, label: '👤 Profil', path: '/profile' },
    ];
  };

  const menuItems = getMenuItems();

  return (
    <motion.aside
      initial={{ x: -300 }}
      animate={{ x: 0 }}
      className="fixed left-0 top-0 h-screen w-64 bg-card border-r border-border flex flex-col"
    >
      <div className="p-6 border-b border-border">
        {profile?.school?.logo_url && profile?.role !== 'super_admin' ? (
          <div className="flex flex-col items-center gap-2">
            <img
              src={`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}${profile.school.logo_url}`}
              alt={profile.school.name}
              className="w-full max-h-14 object-contain"
              onError={(e) => { e.target.style.display = 'none'; }}
            />
            <p className="text-xs text-muted-foreground truncate">
              {(profile?.role === 'admin' || profile?.role === 'school_admin') && 'Administration'}
              {profile?.role === 'teacher' && 'Espace Professeur'}
              {profile?.role === 'student' && 'Espace Élève'}
            </p>
          </div>
        ) : profile?.school?.name && profile?.role !== 'super_admin' ? (
          <div>
            <h1 className="text-xl font-bold text-primary flex items-center gap-2">
              <School className="w-7 h-7 flex-shrink-0" />
              <span className="truncate">{profile.school.name}</span>
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {(profile?.role === 'admin' || profile?.role === 'school_admin') && 'Administration'}
              {profile?.role === 'teacher' && 'Espace Professeur'}
              {profile?.role === 'student' && 'Espace Élève'}
            </p>
          </div>
        ) : (
          <div>
            <h1 className="text-2xl font-bold text-primary flex items-center gap-2">
              <GraduationCap className="w-8 h-8" />
              EduTrack
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {profile?.role === 'super_admin' && 'Super Administration'}
              {(profile?.role === 'admin' || profile?.role === 'school_admin') && 'Administration'}
              {profile?.role === 'teacher' && 'Espace Professeur'}
              {profile?.role === 'student' && 'Espace Élève'}
            </p>
          </div>
        )}
      </div>

      <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;

          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                'flex items-center gap-3 px-4 py-3 rounded-lg transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              )}
            >
              <Icon className="w-5 h-5" />
              <span className="font-medium">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-border">
        <Link
          to="/profile"
          className="flex items-center gap-3 mb-4 px-2 hover:bg-muted/50 rounded-lg transition-colors"
        >
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-2xl cursor-pointer hover:scale-105 transition-transform">
            {profile?.role === 'student' ? (profile?.avatar || '🙂') : <UserCircle className="w-6 h-6 text-primary" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium truncate">
              {profile?.first_name}
            </p>
            {profile?.role !== 'student' && (
              <p className="text-xs text-muted-foreground truncate">{profile?.email}</p>
            )}
          </div>
        </Link>

        <button
          onClick={signOut}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-muted-foreground hover:bg-destructive hover:text-destructive-foreground transition-colors"
        >
          <LogOut className="w-5 h-5" />
          <span className="font-medium">Déconnexion</span>
        </button>
      </div>
    </motion.aside>
  );
};

export default Sidebar;
