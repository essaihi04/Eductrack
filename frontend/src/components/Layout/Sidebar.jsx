import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Camera,
  Trash2,
  RefreshCw,
  X,
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
  MessageSquare,
  DollarSign,
  CreditCard,
  AlertCircle,
  Layers,
  TrendingDown,
  TrendingUp,
  UserCog,
  Wallet,
  Banknote,
  LayoutGrid,
  CalendarRange,
  CalendarClock,
  ListTree,
  Landmark,
  Scale,
  Building2,
  ShieldCheck,
  Bus,
  MapPin,
  Bell,
  Sparkles,
  Image as ImageIcon,
  Search,
  BarChart2,
  AlertTriangle,
  Home as HomeIcon
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useI18n } from '../../i18n';
import LanguageSwitcher from '../LanguageSwitcher';
import { cn } from '../../lib/utils';
import { resolveLogoUrl } from '../../lib/schoolLogo';
import { supabase } from '../../lib/supabase';

const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
import { FINANCE_POLES, poleForPath, tabForPath } from '../../pages/finance/financeNav';
import { adminSidebarDomains, domainForPath } from '../../pages/admin/adminNav';

const Sidebar = () => {
  const location = useLocation();
  const { profile, signOut, refreshProfile } = useAuth();
  const { t, dir } = useI18n();
  const isTeacher = profile?.role === 'teacher';
  // Libellé de l'espace affiché sous le nom de l'école (traduit).
  const spaceLabel = () => {
    if (profile?.role === 'super_admin') return t('space.superadmin');
    if (profile?.role === 'admin' || profile?.role === 'school_admin') return t('space.admin');
    if (profile?.role === 'teacher') return t('space.teacher');
    if (profile?.role === 'finance_manager') return t('space.finance');
    if (profile?.role === 'student') return t('space.student');
    return '';
  };

  // ── Gestion du logo de l'école par l'admin (clic sur le logo) ──
  const isSchoolAdmin = profile?.role === 'admin' || profile?.role === 'school_admin';
  const [logoModalOpen, setLogoModalOpen] = useState(false);
  const [logoBusy, setLogoBusy] = useState(''); // 'upload' | 'delete'
  const [logoError, setLogoError] = useState('');
  const logoInputRef = useRef(null);

  const logoHeaders = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return { 'Authorization': `Bearer ${session?.access_token}` };
  };

  const uploadLogo = async (file) => {
    if (!file) return;
    setLogoBusy('upload');
    setLogoError('');
    try {
      const form = new FormData();
      form.append('logo', file);
      const res = await fetch(`${apiUrl}/api/admin/school/logo`, {
        method: 'POST', headers: await logoHeaders(), body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      await refreshProfile();
      setLogoModalOpen(false);
    } catch (e) { setLogoError(e.message); }
    finally { setLogoBusy(''); if (logoInputRef.current) logoInputRef.current.value = ''; }
  };

  const deleteLogo = async () => {
    if (!window.confirm('Supprimer le logo de l\'école ? Il disparaîtra de l\'application et des documents PDF.')) return;
    setLogoBusy('delete');
    setLogoError('');
    try {
      const res = await fetch(`${apiUrl}/api/admin/school/logo`, {
        method: 'DELETE', headers: await logoHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      await refreshProfile();
      setLogoModalOpen(false);
    } catch (e) { setLogoError(e.message); }
    finally { setLogoBusy(''); }
  };

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
        { icon: BarChart3, label: t('nav.dashboard'), path: '/teacher/dashboard' },
        { icon: Users, label: t('nav.students'), path: '/students' },
        { icon: Calendar, label: t('nav.quickTracking'), path: '/teacher/rapide' },
        { icon: CheckSquare, label: t('nav.planner'), path: '/teacher/planificateur' },
        { icon: ClipboardList, label: t('nav.controls'), path: '/teacher/controls' },
        { icon: Upload, label: t('nav.teachingDocs'), path: '/teacher/documents' },
        { icon: FileText, label: t('nav.homework'), path: '/teacher/devoirs' },
        { icon: FileText, label: t('nav.textbook'), path: '/teacher/cahier-de-texte' },
        { icon: Edit, label: t('nav.appreciations'), path: '/teacher/appreciations' },
        { icon: CalendarClock, label: t('nav.parentAppointments'), path: '/teacher/appointments' },
        { section: t('nav.section.schoolLife'), isSection: true },
        { icon: ImageIcon, label: t('nav.lifeBook'), path: '/school-life/cahier-de-vie' },
        { icon: Sparkles, label: t('nav.extracurricular'), path: '/school-life/parascolaire' },
        { icon: Search, label: t('nav.lostFound'), path: '/school-life/objets-perdus' },
        { icon: AlertTriangle, label: t('nav.reports'), path: '/school-life/signalements' },
      ];
    }

    const commonItems = [
      { icon: LayoutDashboard, label: 'Tableau de bord', path: '/dashboard' },
    ];

    if (profile?.role === 'admin' || profile?.role === 'school_admin' || profile?.role === 'pedagogical_director' || profile?.role === 'pedagogical_manager') {
      const isPedagogical = profile?.role === 'pedagogical_director' || profile?.role === 'pedagogical_manager';
      const domains = adminSidebarDomains(profile.role).map((d) => ({
        icon: d.icon, label: d.label, path: d.path, domainKey: d.key,
      }));
      // 6 entrées max : Tableau de bord + Finance (1 entrée) + domaines repliés.
      // Les sous-onglets de chaque domaine s'ouvrent dans le contenu (DomainTabs).
      return [
        ...commonItems,
        // Finance — une seule entrée ; les pôles s'ouvrent dans FinanceShell.
        ...(isPedagogical ? [] : [
          { icon: Wallet, label: 'Finance', path: '/finance', financeRoot: true },
        ]),
        ...domains,
      ];
    }

    if (profile?.role === 'transport_manager') {
      return [
        { icon: LayoutDashboard, label: 'Tableau de bord', path: '/transport' },
        { icon: MapPin, label: 'Suivi en direct', path: '/transport/live' },
        { icon: Bus, label: 'Bus & élèves', path: '/transport/buses' },
        { icon: UserCircle, label: 'Chauffeurs', path: '/transport/drivers' },
        { icon: UserCog, label: 'Resp. transport', path: '/transport/managers' },
        { icon: MessageSquare, label: 'WhatsApp', path: '/whatsapp' },
      ];
    }

    if (profile?.role === 'parent') {
      return [
        { icon: Users2, label: 'Mes enfants', path: '/parent' },
        { icon: Wallet, label: 'Finance', path: '/parent/finance' },
        { icon: Bell, label: 'Notifications', path: '/parent/notifications' },
        { icon: FileText, label: 'Bulletins', path: '/parent/bulletins' },
        { icon: Bus, label: 'Transport', path: '/parent/transport' },
        { icon: CalendarClock, label: 'Rendez-vous', path: '/parent/appointments' },
        { section: 'Vie scolaire', isSection: true },
        { icon: ImageIcon, label: 'Cahier de vie', path: '/school-life/cahier-de-vie' },
        { icon: Sparkles, label: 'Parascolaire', path: '/school-life/parascolaire' },
        { icon: BarChart2, label: 'Sondages', path: '/school-life/sondages' },
        { icon: Search, label: 'Objets perdus', path: '/school-life/objets-perdus' },
        { icon: AlertTriangle, label: 'Signalements', path: '/parent/signalements' },
        { icon: Edit, label: 'Profil', path: '/profile' },
      ];
    }

    if (profile?.role === 'finance_manager') {
      // Compte finance : toute la navigation finance (pôles → onglets →
      // sous-onglets) vit dans la barre latérale, en accordéon. Le bandeau
      // d'onglets du haut est masqué (voir FinanceShell) pour gagner de l'espace.
      return [
        { financeNav: true },
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
      { icon: FileText, label: '📄 Bulletins', path: '/student/bulletins' },
      { icon: Edit, label: '👤 Profil', path: '/profile' },
    ];
  };

  const menuItems = getMenuItems();

  // Un chemin correspond-il exactement à une feuille de navigation finance ?
  const leafActive = (leaf) =>
    leaf.end ? location.pathname === leaf.path : location.pathname.startsWith(leaf.path);

  // Arborescence finance en accordéon (compte financier) : les pôles sont
  // toujours visibles ; le pôle actif déplie ses onglets, et l'onglet actif ses
  // sous-onglets. Remplace le bandeau d'onglets du haut de l'ancien FinanceShell.
  const renderFinanceNav = () => {
    const inFinance = location.pathname.startsWith('/finance');
    const activePole = inFinance ? poleForPath(location.pathname) : null;
    return (
      <div className="space-y-1">
        {FINANCE_POLES.map((pole) => {
          const PoleIcon = pole.icon;
          const isActivePole = activePole?.key === pole.key;
          const activeTab = isActivePole ? tabForPath(pole, location.pathname) : null;
          return (
            <div key={pole.key}>
              <Link
                to={pole.tabs[0].path}
                className={cn(
                  'flex items-center gap-3 px-4 py-2.5 rounded-lg transition-colors text-sm',
                  isActivePole
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )}
              >
                <PoleIcon className="w-5 h-5 flex-shrink-0" />
                <span className="font-medium truncate">{pole.label}</span>
              </Link>
              {isActivePole && (
                <div className="ml-4 mt-1 space-y-0.5 border-l border-border pl-2">
                  {pole.tabs.map((tab) => {
                    const TabIcon = tab.icon;
                    const isActiveTab = tab === activeTab;
                    const subTabs = tab.subTabs || [];
                    return (
                      <div key={tab.path}>
                        <Link
                          to={tab.path}
                          className={cn(
                            'flex items-center gap-2 px-3 py-1.5 rounded-md transition-colors text-[13px]',
                            isActiveTab
                              ? 'bg-accent text-accent-foreground font-medium'
                              : 'text-muted-foreground hover:bg-accent/60 hover:text-accent-foreground'
                          )}
                        >
                          {TabIcon && <TabIcon className="w-4 h-4 flex-shrink-0" />}
                          <span className="truncate">{tab.label}</span>
                        </Link>
                        {isActiveTab && subTabs.length > 0 && (
                          <div className="ml-4 mt-0.5 space-y-0.5 border-l border-border pl-2">
                            {subTabs.map((sub) => {
                              const SubIcon = sub.icon;
                              const active = leafActive(sub);
                              return (
                                <Link
                                  key={sub.path}
                                  to={sub.path}
                                  className={cn(
                                    'flex items-center gap-2 px-3 py-1 rounded-md transition-colors text-xs',
                                    active
                                      ? 'bg-primary/10 text-primary font-medium'
                                      : 'text-muted-foreground hover:bg-accent/60 hover:text-accent-foreground'
                                  )}
                                >
                                  {SubIcon && <SubIcon className="w-3.5 h-3.5 flex-shrink-0" />}
                                  <span className="truncate">{sub.label}</span>
                                </Link>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <motion.aside
      initial={{ x: dir === 'rtl' ? 300 : -300 }}
      animate={{ x: 0 }}
      className={cn(
        // `border-e` = bordure côté « fin de ligne » : à droite en français,
        // à gauche en arabe — la barre reste toujours contre le contenu.
        'fixed top-0 h-screen w-64 bg-card flex flex-col border-e border-border',
        dir === 'rtl' ? 'right-0' : 'left-0'
      )}
    >
      <div className="p-6 border-b border-border">
        {profile?.school?.logo_url && profile?.role !== 'super_admin' ? (
          <div className="flex flex-col items-center gap-2">
            {isSchoolAdmin ? (
              <button
                onClick={() => { setLogoError(''); setLogoModalOpen(true); }}
                title="Cliquer pour changer ou supprimer le logo"
                className="relative group w-full"
              >
                <img
                  src={resolveLogoUrl(profile.school)}
                  alt={profile.school.name}
                  className="w-full max-h-14 object-contain"
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
                <span className="absolute inset-0 hidden group-hover:flex items-center justify-center bg-black/40 rounded-lg">
                  <Camera className="w-5 h-5 text-white" />
                </span>
              </button>
            ) : (
              <img
                src={resolveLogoUrl(profile.school)}
                alt={profile.school.name}
                className="w-full max-h-14 object-contain"
                onError={(e) => { e.target.style.display = 'none'; }}
              />
            )}
            <p className="text-xs text-muted-foreground truncate">{spaceLabel()}</p>
          </div>
        ) : profile?.school?.name && profile?.role !== 'super_admin' ? (
          <div>
            <h1 className="text-xl font-bold text-primary flex items-center gap-2">
              <School className="w-7 h-7 flex-shrink-0" />
              <span className="truncate">{profile.school.name}</span>
            </h1>
            <p className="text-sm text-muted-foreground mt-1">{spaceLabel()}</p>
            {isSchoolAdmin && (
              <button
                onClick={() => { setLogoError(''); setLogoModalOpen(true); }}
                className="mt-2 flex items-center gap-1.5 text-xs text-primary hover:underline"
              >
                <Camera className="w-3.5 h-3.5" /> Ajouter un logo
              </button>
            )}
          </div>
        ) : (
          <div>
            <h1 className="text-2xl font-bold text-primary flex items-center gap-2">
              <GraduationCap className="w-8 h-8" />
              EduTrack
            </h1>
            <p className="text-sm text-muted-foreground mt-1">{spaceLabel()}</p>
          </div>
        )}
      </div>

      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {menuItems.map((item, idx) => {
          if (item.isSection) {
            return (
              <div key={`section-${idx}`} className="pt-4 pb-1 px-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
                  {item.section}
                </p>
              </div>
            );
          }
          if (item.financeNav) {
            return <div key="finance-nav">{renderFinanceNav()}</div>;
          }
          const Icon = item.icon;
          let isActive;
          if (item.poleKey) {
            isActive = location.pathname.startsWith('/finance') && poleForPath(location.pathname).key === item.poleKey;
          } else if (item.financeRoot) {
            isActive = location.pathname.startsWith('/finance');
          } else if (item.domainKey) {
            isActive = domainForPath(location.pathname, profile?.role)?.domain.key === item.domainKey;
          } else {
            isActive = location.pathname === item.path;
          }

          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                'flex items-center gap-3 px-4 py-2.5 rounded-lg transition-colors text-sm',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              )}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              <span className="font-medium truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-border">
        <Link
          to="/profile"
          className="flex items-center gap-3 mb-4 px-2 hover:bg-muted/50 rounded-lg transition-colors"
        >
          {profile?.avatar_url ? (
            <img
              src={profile.avatar_url.startsWith('http') ? profile.avatar_url : `${import.meta.env.VITE_API_URL || 'http://localhost:3000'}${profile.avatar_url}`}
              alt={t('nav.profilePhoto')}
              className="w-10 h-10 rounded-full object-cover cursor-pointer hover:scale-105 transition-transform border border-border"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-2xl cursor-pointer hover:scale-105 transition-transform">
              {profile?.role === 'student' ? (profile?.avatar || '🙂') : <UserCircle className="w-6 h-6 text-primary" />}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="font-medium truncate">
              {profile?.first_name}
            </p>
            {profile?.role !== 'student' && (
              <p className="text-xs text-muted-foreground truncate">{profile?.email}</p>
            )}
          </div>
        </Link>

        {/* Choix de la langue de l'interface (compte professeur). */}
        {isTeacher && <LanguageSwitcher className="mb-3" />}

        <button
          onClick={signOut}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-muted-foreground hover:bg-destructive hover:text-destructive-foreground transition-colors"
        >
          <LogOut className="w-5 h-5" />
          <span className="font-medium">{t('nav.logout')}</span>
        </button>
      </div>

      {/* Modale : gérer le logo de l'école (admin). Rendue en portail sur
          document.body : la sidebar est animée par framer-motion (transform),
          ce qui piège le z-index/fixed de tout enfant dans son propre contexte
          d'empilement → la modale passait SOUS les éléments de la page. */}
      {logoModalOpen && createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
          onClick={() => !logoBusy && setLogoModalOpen(false)}
        >
          <div className="bg-card rounded-xl shadow-xl w-full max-w-sm p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold flex items-center gap-2">
                <Camera className="w-4 h-4 text-primary" /> Logo de l'école
              </h3>
              <button
                onClick={() => setLogoModalOpen(false)}
                disabled={!!logoBusy}
                className="p-1 hover:bg-accent rounded disabled:opacity-50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center justify-center bg-muted/40 border border-dashed border-border rounded-lg p-4 min-h-[90px]">
              {profile?.school?.logo_url ? (
                <img
                  src={resolveLogoUrl(profile.school)}
                  alt="Logo actuel"
                  className="max-h-20 max-w-full object-contain"
                />
              ) : (
                <p className="text-sm text-muted-foreground">Aucun logo pour le moment</p>
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              Le logo apparaît dans la barre latérale, sur l'écran de connexion et sur tous les
              documents PDF (bulletins, factures, grilles de notes…). Formats image acceptés,
              il sera converti en PNG.
            </p>

            {logoError && <p className="text-sm font-medium text-red-600">{logoError}</p>}

            <input
              ref={logoInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => uploadLogo(e.target.files?.[0])}
            />
            <div className="flex gap-2">
              <button
                onClick={() => logoInputRef.current?.click()}
                disabled={!!logoBusy}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:opacity-90 disabled:opacity-50"
              >
                {logoBusy === 'upload' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {logoBusy === 'upload' ? 'Import…' : (profile?.school?.logo_url ? 'Remplacer' : 'Importer un logo')}
              </button>
              {profile?.school?.logo_url && (
                <button
                  onClick={deleteLogo}
                  disabled={!!logoBusy}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium border border-red-200 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50"
                >
                  {logoBusy === 'delete' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  Supprimer
                </button>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </motion.aside>
  );
};

export default Sidebar;
