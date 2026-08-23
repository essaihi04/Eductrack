import { createElement, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle, Bell, BookOpen, Bot, Bus, CalendarClock, CheckCircle2,
  ChevronRight, FileText, GraduationCap, Image as ImageIcon, Search,
  Sparkles, User, Users2, Wallet,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import {
  parentPathForChild, preferredParentChild, rememberParentChild,
} from '../../lib/parentNavigation';
import { useT } from '../../i18n';

const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const ParentDashboard = () => {
  const navigate = useNavigate();
  const t = useT();
  const [children, setChildren] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      setLoading(true);
      setError('');
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${apiUrl}/api/parent/children`, {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (!res.ok) throw new Error(t('pdash.loadError'));
      const data = await res.json();
      const kids = Array.isArray(data) ? data : [];
      const preferred = preferredParentChild(kids);
      setChildren(kids);
      setSelectedId(preferred);
      rememberParentChild(preferred);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const selectChild = (childId) => {
    setSelectedId(childId);
    rememberParentChild(childId);
  };

  const selectedChild = useMemo(
    () => children.find((child) => child.id === selectedId) || children[0] || null,
    [children, selectedId]
  );

  const openForChild = (path) => navigate(parentPathForChild(path, selectedChild?.id));

  if (loading) return <div className="flex items-center justify-center h-64">{t('common.loading')}</div>;
  if (error) {
    return (
      <div className="p-6 text-center">
        <p className="text-red-600">{error}</p>
        <button onClick={load} className="mt-3 text-sm font-medium text-primary hover:underline">
          {t('common.retry')}
        </button>
      </div>
    );
  }

  return (
    <div className="p-1 md:p-2 max-w-6xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900">{t('pdash.title')}</h1>
        <p className="text-gray-600 mt-1">{t('pdash.subtitle')}</p>
      </header>

      {children.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center">
          <User className="w-10 h-10 mx-auto text-gray-400 mb-3" />
          <p className="text-gray-700 font-medium">{t('pdash.noChild')}</p>
          <p className="text-gray-500 text-sm mt-1">{t('pdash.noChildHint')}</p>
        </div>
      ) : (
        <>
          {children.length > 1 && (
            <section aria-label={t('pdash.chooseChild')}>
              <p className="text-sm font-semibold text-gray-700 mb-2">{t('pdash.chooseChild')}</p>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {children.map((child) => (
                  <button
                    key={child.id}
                    type="button"
                    onClick={() => selectChild(child.id)}
                    className={`shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition ${
                      selectedChild?.id === child.id
                        ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                        : 'border-gray-200 bg-white text-gray-700 hover:border-primary/40'
                    }`}
                  >
                    {child.first_name} {child.last_name}
                  </button>
                ))}
              </div>
            </section>
          )}

          {selectedChild && (
            <ChildFocus
              child={selectedChild}
              t={t}
              onOpen={() => {
                rememberParentChild(selectedChild.id);
                navigate(`/parent/children/${selectedChild.id}`);
              }}
            />
          )}

          <section>
            <div className="mb-3">
              <h2 className="text-lg font-bold text-gray-900">{t('pdash.essential')}</h2>
              <p className="text-sm text-gray-500">{t('pdash.essentialHint')}</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <ActionCard
                icon={GraduationCap}
                title={t('pdash.action.followup')}
                hint={t('pdash.action.followupHint')}
                color="bg-blue-100 text-blue-700"
                onClick={() => navigate(`/parent/children/${selectedChild.id}`)}
              />
              <ActionCard
                icon={Wallet}
                title={t('pnav.finance')}
                hint={t('pdash.action.financeHint')}
                color="bg-emerald-100 text-emerald-700"
                onClick={() => openForChild('/parent/finance')}
              />
              <ActionCard
                icon={Bell}
                title={t('pdash.notifications')}
                hint={t('pdash.notificationsHint')}
                color="bg-purple-100 text-purple-700"
                onClick={() => navigate('/parent/notifications')}
              />
              <ActionCard
                icon={Bot}
                title={t('passist.title')}
                hint={t('pdash.action.assistantHint')}
                color="bg-violet-100 text-violet-700"
                onClick={() => openForChild('/parent/assistant')}
              />
            </div>
          </section>

          <section>
            <div className="mb-3">
              <h2 className="text-lg font-bold text-gray-900">{t('pdash.services')}</h2>
              <p className="text-sm text-gray-500">{t('pdash.servicesHint')}</p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
              <ServiceButton icon={FileText} label={t('pnav.bulletins')} onClick={() => openForChild('/parent/bulletins')} />
              <ServiceButton icon={Bus} label={t('pnav.transport')} onClick={() => openForChild('/parent/transport')} />
              <ServiceButton icon={CalendarClock} label={t('pnav.appointments')} onClick={() => openForChild('/parent/appointments')} />
              <ServiceButton icon={AlertCircle} label={t('nav.reports')} onClick={() => openForChild('/parent/signalements')} />
              <ServiceButton icon={ImageIcon} label={t('nav.lifeBook')} onClick={() => navigate('/school-life/cahier-de-vie')} />
              <ServiceButton icon={Sparkles} label={t('nav.extracurricular')} onClick={() => navigate('/school-life/parascolaire')} />
              <ServiceButton icon={Search} label={t('nav.lostFound')} onClick={() => navigate('/school-life/objets-perdus')} />
              <ServiceButton icon={Users2} label={t('pnav.polls')} onClick={() => navigate('/school-life/sondages')} />
            </div>
          </section>
        </>
      )}
    </div>
  );
};

const ChildFocus = ({ child, onOpen, t }) => {
  const summary = child.summary || {};
  const presence = summary.presence_rate;
  const presenceColor = presence === null || presence === undefined
    ? 'text-gray-400'
    : presence >= 90 ? 'text-green-600'
    : presence >= 75 ? 'text-blue-600'
    : presence >= 50 ? 'text-orange-600' : 'text-red-600';

  return (
    <section className="rounded-2xl border border-primary/15 bg-gradient-to-br from-white to-primary/5 p-4 md:p-5 shadow-sm">
      <div className="flex flex-col md:flex-row md:items-center gap-4">
        <div className="flex items-center gap-3 min-w-0 md:w-64">
          {child.avatar_url ? (
            <img
              src={child.avatar_url.startsWith('http') ? child.avatar_url : `${apiUrl}${child.avatar_url}`}
              alt={`${child.first_name} ${child.last_name}`}
              className="w-14 h-14 rounded-full object-cover shrink-0 border-2 border-white shadow"
            />
          ) : (
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 text-white flex items-center justify-center font-bold text-lg shrink-0">
              {(child.first_name?.[0] || '').toUpperCase()}{(child.last_name?.[0] || '').toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">{t('pdash.selectedChild')}</p>
            <h2 className="font-bold text-gray-900 truncate">{child.first_name} {child.last_name}</h2>
            <p className="text-sm text-gray-500 truncate">
              {child.class ? `${child.class.name}${child.class.level ? ` • ${child.class.level}` : ''}` : t('pdash.noClass')}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 flex-1">
          <Metric icon={CheckCircle2} color={presenceColor} label={t('pdash.metric.presence')} value={presence == null ? '—' : `${presence}%`} />
          <Metric icon={BookOpen} color="text-purple-600" label={t('pdash.metric.homework')} value={summary.pending_homework ?? 0} />
          <Metric icon={GraduationCap} color="text-gray-700" label={t('pdash.metric.sessions')} value={summary.total_sessions ?? 0} />
        </div>

        <button
          type="button"
          onClick={onOpen}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          {t('pdash.openFollowup')} <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {(summary.overdue_homework > 0 || summary.upcoming_homework > 0 || summary.absent_count > 0) && (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-primary/10 pt-3">
          {summary.overdue_homework > 0 && (
            <StatusBadge className="text-red-700 bg-red-50 border-red-200" icon={AlertCircle}>
              {t(summary.overdue_homework > 1 ? 'pdash.badge.overdueMany' : 'pdash.badge.overdueOne', { n: summary.overdue_homework })}
            </StatusBadge>
          )}
          {summary.upcoming_homework > 0 && (
            <StatusBadge className="text-blue-700 bg-blue-50 border-blue-200" icon={BookOpen}>
              {t('pdash.badge.upcoming', { n: summary.upcoming_homework })}
            </StatusBadge>
          )}
          {summary.absent_count > 0 && (
            <StatusBadge className="text-orange-700 bg-orange-50 border-orange-200" icon={AlertCircle}>
              {t(summary.absent_count > 1 ? 'pdash.badge.absentMany' : 'pdash.badge.absentOne', { n: summary.absent_count })}
            </StatusBadge>
          )}
        </div>
      )}
    </section>
  );
};

const ActionCard = ({ icon, title, hint, color, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="group flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 text-left shadow-sm transition hover:border-primary/30 hover:shadow-md"
  >
    <span className={`rounded-xl p-3 ${color}`}>{createElement(icon, { className: 'w-5 h-5' })}</span>
    <span className="min-w-0 flex-1">
      <span className="block font-semibold text-gray-900">{title}</span>
      <span className="block text-xs text-gray-500 mt-0.5">{hint}</span>
    </span>
    <ChevronRight className="w-4 h-4 shrink-0 text-gray-400 transition group-hover:text-primary" />
  </button>
);

const ServiceButton = ({ icon, label, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white p-3 text-center text-sm font-medium text-gray-700 shadow-sm transition hover:border-primary/30 hover:bg-primary/5 hover:text-primary"
  >
    {createElement(icon, { className: 'w-5 h-5' })}
    <span>{label}</span>
  </button>
);

const StatusBadge = ({ className, icon, children }) => (
  <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${className}`}>
    {createElement(icon, { className: 'w-3.5 h-3.5' })} {children}
  </span>
);

const Metric = ({ icon, color, label, value }) => (
  <div className="rounded-xl bg-white/80 p-2 text-center shadow-sm">
    {createElement(icon, { className: `w-4 h-4 mx-auto ${color}` })}
    <p className={`text-base font-bold mt-1 ${color}`}>{value}</p>
    <p className="text-[10px] uppercase tracking-wide text-gray-500 line-clamp-2">{label}</p>
  </div>
);

export default ParentDashboard;
