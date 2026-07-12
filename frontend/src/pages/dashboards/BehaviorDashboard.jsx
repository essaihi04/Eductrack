import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Calendar, AlertCircle, TrendingUp, TrendingDown, Activity, 
  Users, AlertTriangle, CheckCircle, Target, Lightbulb, 
  ChevronRight, ChevronDown, ChevronUp, Heart, ThermometerSun, Eye,
  BookOpen, Phone, Moon, MessageSquare, X, RefreshCw,
  School, GraduationCap, FolderOpen
} from 'lucide-react';
import {
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  BarChart,
  Bar,
  Cell,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar
} from 'recharts';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

const presenceIcons = {
  present: '✔️',
  absent: '✖️',
  late: '⏱️',
  unknown: '—'
};

const vigilanceIcons = {
  vigilant: '👁️',
  bavarre: '💬'
};

const participationIcons = {
  faible: '😐',
  good: '🙋',
  excellent: '⭐'
};

const attitudeIcons = {
  correct: '✓',
  perturbateur: '⚠️',
  excellent: '⭐'
};

const boolIcon = (value) => {
  if (value === true) return '✔️';
  if (value === false) return '✖️';
  return '—';
};

const MetricCard = ({ label, value, subLabel, trend, accent = 'indigo', icon: Icon, percent }) => {
  const accentConfig = {
    indigo: { bg: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo-700', iconBg: 'bg-indigo-100', bar: 'bg-indigo-500', sub: 'bg-indigo-100 text-indigo-700' },
    green: { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700', iconBg: 'bg-green-100', bar: 'bg-green-500', sub: 'bg-green-100 text-green-700' },
    yellow: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', iconBg: 'bg-amber-100', bar: 'bg-amber-500', sub: 'bg-amber-100 text-amber-700' },
    red: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', iconBg: 'bg-red-100', bar: 'bg-red-500', sub: 'bg-red-100 text-red-700' },
    blue: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', iconBg: 'bg-blue-100', bar: 'bg-blue-500', sub: 'bg-blue-100 text-blue-700' },
    purple: { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700', iconBg: 'bg-purple-100', bar: 'bg-purple-500', sub: 'bg-purple-100 text-purple-700' }
  };
  const c = accentConfig[accent] || accentConfig.indigo;

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <Card className={`h-full border ${c.border} ${c.bg} hover:shadow-md transition-shadow`}>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wide">{label}</p>
            {Icon && (
              <div className={`p-1.5 rounded-lg ${c.iconBg}`}>
                <Icon className={`w-4 h-4 ${c.text}`} />
              </div>
            )}
          </div>
          <div className="flex items-baseline gap-2">
            <span className={`text-2xl font-bold ${c.text}`}>{value}</span>
            {trend !== undefined && trend !== null && (
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${trend >= 0 ? 'text-green-700 bg-green-100' : 'text-red-700 bg-red-100'}`}>
                {trend >= 0 ? '+' : ''}{trend}%
              </span>
            )}
          </div>
          {percent !== undefined && percent !== null && (
            <div className="w-full bg-white/60 rounded-full h-1.5">
              <div className={`${c.bar} h-1.5 rounded-full transition-all duration-500`} style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}></div>
            </div>
          )}
          {subLabel && <p className={`text-xs font-medium inline-flex px-2 py-0.5 rounded ${c.sub}`}>{subLabel}</p>}
        </CardContent>
      </Card>
    </motion.div>
  );
};

const StatusIndicator = ({ status }) => {
  const colors = {
    correct: 'bg-green-100 text-green-800',
    moyen: 'bg-yellow-100 text-yellow-800',
    perturbateur: 'bg-red-100 text-red-800',
    nonUtilise: 'bg-green-100 text-green-800',
    avertissement: 'bg-yellow-100 text-yellow-800',
    abusif: 'bg-red-100 text-red-800'
  };

  const labels = {
    correct: '🟢 Correct',
    moyen: '🟡 Bavard',
    perturbateur: '🔴 Perturbateur',
    nonUtilise: '🟢 Non utilisé',
    avertissement: '🟠 Utilisé',
    abusif: '🔴 Utilisé'
  };

  return (
    <span className={`px-3 py-1 rounded-full text-sm font-medium ${colors[status]}`}>
      {labels[status]}
    </span>
  );
};

const CorrelationSummary = ({ sessions }) => {
  // Deduplicate students across sessions for accurate KPIs
  const studentMap = {};
  let totalRecords = 0;

  sessions.forEach(session => {
    const data = session.summary;
    totalRecords += data.totalRecords;
    (data.studentRows || []).forEach(row => {
      const sid = row.studentId;
      if (!sid) return;
      if (!studentMap[sid]) studentMap[sid] = [];
      studentMap[sid].push(row);
    });
  });

  const uniqueStudentIds = Object.keys(studentMap);
  const uniqueStudentCount = uniqueStudentIds.length;
  const sessionCount = sessions.length;

  // Aggregate presence per unique student
  const presence = { present: 0, absent: 0, late: 0 };
  let sleeping = 0, phone = 0, cahier = 0, participation = 0;

  uniqueStudentIds.forEach(sid => {
    const rows = studentMap[sid];
    const presenceValues = rows.map(r => r.presence);
    const wasPresent = presenceValues.some(p => p === 'present');
    const wasLate = presenceValues.some(p => p === 'late');
    const wasExcused = presenceValues.some(p => p === 'excused');
    const allAbsent = presenceValues.every(p => p === 'absent');

    if (wasPresent) presence.present += 1;
    else if (wasLate) presence.late += 1;
    else if (allAbsent) presence.absent += 1;
    else if (wasExcused) presence.present += 1;

    // Behavior: count if ANY session had the issue
    if (rows.some(r => r.sleeping === true)) sleeping += 1;
    if (rows.some(r => r.phone_use === true)) phone += 1;
    if (rows.some(r => r.cahier_present === false)) cahier += 1;
    if (rows.some(r => r.participation === 'bon' || r.participation === 'good' || r.participation === 'excellent')) participation += 1;
  });

  const toPercent = (value, total) => Math.round((value / (total || 1)) * 100);

  const presPercent = toPercent(presence.present, uniqueStudentCount);
  const absPercent = toPercent(presence.absent, uniqueStudentCount);
  const latePercent = toPercent(presence.late, uniqueStudentCount);

  return (
    <Card className="bg-gradient-to-r from-slate-50 to-blue-50 border-slate-200">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="text-base">Résumé global des séances</CardTitle>
            <CardDescription>
              {sessionCount} séance{sessionCount > 1 ? 's' : ''} • {uniqueStudentCount} élève{uniqueStudentCount > 1 ? 's' : ''}
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <span className="text-xs font-bold px-2 py-1 rounded-full bg-green-100 text-green-700">{presPercent}% présents</span>
            {absPercent > 0 && <span className="text-xs font-bold px-2 py-1 rounded-full bg-red-100 text-red-700">{absPercent}% absents</span>}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-4">
          <div className="flex h-3 rounded-full overflow-hidden bg-gray-200">
            <div className="bg-green-500 transition-all" style={{ width: `${presPercent}%` }} title={`Présents: ${presPercent}%`}></div>
            <div className="bg-amber-400 transition-all" style={{ width: `${latePercent}%` }} title={`Retards: ${latePercent}%`}></div>
            <div className="bg-red-400 transition-all" style={{ width: `${absPercent}%` }} title={`Absents: ${absPercent}%`}></div>
          </div>
          <div className="flex justify-between mt-1 text-[10px] text-muted-foreground">
            <span>✅ {presence.present} présents</span>
            {presence.late > 0 && <span>⏰ {presence.late} retards</span>}
            <span>❌ {presence.absent} absents</span>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className={`text-center p-2.5 rounded-lg ${sleeping > 0 ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
            <p className="text-lg font-bold">{sleeping}</p>
            <p className="text-[10px] font-medium">😴 Dormance</p>
          </div>
          <div className={`text-center p-2.5 rounded-lg ${phone > 0 ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
            <p className="text-lg font-bold">{phone}</p>
            <p className="text-[10px] font-medium">📱 Téléphone</p>
          </div>
          <div className={`text-center p-2.5 rounded-lg ${cahier > 2 ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'}`}>
            <p className="text-lg font-bold">{cahier}</p>
            <p className="text-[10px] font-medium">📘 Cahier absent ({toPercent(cahier, uniqueStudentCount)}%)</p>
          </div>
          <div className={`text-center p-2.5 rounded-lg bg-blue-100 text-blue-800`}>
            <p className="text-lg font-bold">{participation}</p>
            <p className="text-[10px] font-medium">🙋 Participation+ ({toPercent(participation, uniqueStudentCount)}%)</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

const CorrelationCard = ({ session }) => {
  const { summary } = session;
  const formatHour = (time) => {
    if (!time) return '—';
    return time.slice(0, 5);
  };

  const toPercent = (value, total) => {
    if (total === 0) return '0';
    return ((value / total) * 100).toFixed(0);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {formatHour(session.startTime)} - {formatHour(session.endTime)}
        </CardTitle>
        <CardDescription>
          {session.teacher} {session.subject && `• ${session.subject}`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex justify-between">
          <span>Élèves suivis</span>
          <span className="font-medium">{[...new Set((summary.studentRows || []).map(r => r.studentId).filter(Boolean))].length || summary.totalRecords}</span>
        </div>
        <div>
          <p className="text-muted-foreground text-xs mb-1">Présence</p>
          <div className="flex gap-2 flex-wrap">
            <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full">
              {toPercent(summary.presence.present, summary.totalRecords)}% présents
            </span>
            <span className="px-2 py-1 bg-red-100 text-red-800 rounded-full">
              {summary.presence.absent} absents
            </span>
            {summary.presence.late > 0 && (
              <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full">
                {summary.presence.late} retards
              </span>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="p-2 rounded bg-red-50">
            <p className="text-xs text-red-500">😴 Dormance</p>
            <p className="text-lg font-semibold">{summary.sleepingIncidents}</p>
          </div>
          <div className="p-2 rounded bg-red-50">
            <p className="text-xs text-red-500">📱 Téléphone</p>
            <p className="text-lg font-semibold">{summary.phoneIncidents}</p>
          </div>
          <div className="p-2 rounded bg-amber-50">
            <p className="text-xs text-amber-600">📘 Cahier absent</p>
            <p className="text-lg font-semibold">{summary.cahierIncidents} ({toPercent(summary.cahierIncidents, summary.totalRecords)}%)</p>
          </div>
          <div className="p-2 rounded bg-amber-50">
            <p className="text-xs text-amber-600">🙋 Participation</p>
            <p className="text-lg font-semibold">{summary.participationIncidents} ({toPercent(summary.participationIncidents, summary.totalRecords)}%)</p>
          </div>
        </div>
        {summary.lastUpdate && (
          <p className="text-xs text-muted-foreground">
            Dernière mise à jour: {new Date(summary.lastUpdate).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
          </p>
        )}
      </CardContent>
    </Card>
  );
};

const SessionDashboard = ({ session, defaultExpanded = false }) => {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const { summary } = session;
  const total = summary.totalRecords || summary.studentRows?.length || 0;
  const metricTotals = summary.metricTotals || {};
  const studentRows = summary.studentRows || [];

  const toPercent = (value, base = total || 1) => {
    if (!base) return 0;
    return Math.round((value / base) * 100);
  };

  const presPct = toPercent(summary.presence.present, metricTotals.presence);
  const absPct = toPercent(summary.presence.absent, metricTotals.presence);
  const cahierPct = toPercent(summary.cahier.present, metricTotals.cahierPresent);
  const vigPct = toPercent(summary.vigilance.vigilant, metricTotals.vigilance);
  const partPct = toPercent(summary.participationLevels.good + summary.participationLevels.excellent, metricTotals.participation);
  const attPct = toPercent(summary.attitudeLevels.correct, metricTotals.attitude);

  // Quick badge helper
  const qBadge = (label, value, color) => (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${color}`}>
      {label} {value}
    </span>
  );

  // Presence color
  const presColor = presPct >= 90 ? 'bg-green-100 text-green-700' : presPct >= 75 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700';

  const formatTime = (t) => t ? t.slice(0, 5) : '—';

  const headers = [
    { key: 'studentName', label: 'Élève', className: 'text-left min-w-[140px]' },
    { key: 'presence', label: 'P', className: 'text-center w-10' },
    { key: 'cahier_present', label: '📘', className: 'text-center w-10' },
    { key: 'cahier_lesson', label: '✏️', className: 'text-center w-10' },
    { key: 'cahier_documents', label: '📄', className: 'text-center w-10' },
    { key: 'cahier_readability', label: '🔍', className: 'text-center w-10' },
    { key: 'vigilance', label: '👁️', className: 'text-center w-12' },
    { key: 'participation', label: '🙋', className: 'text-center w-12' },
    { key: 'mini_eval', label: '📝', className: 'text-center w-12' },
    { key: 'attitude', label: '🙂', className: 'text-center w-12' },
    { key: 'sleeping', label: '😴', className: 'text-center w-10' },
    { key: 'phone_use', label: '📱', className: 'text-center w-10' },
    { key: 'notes', label: '🗒️', className: 'text-left min-w-[120px]' }
  ];

  const renderCell = (row, key) => {
    switch (key) {
      case 'presence':
        return presenceIcons[row.presence] || '—';
      case 'cahier_present':
      case 'cahier_lesson':
      case 'cahier_documents':
      case 'cahier_readability':
        return boolIcon(
          key === 'cahier_present'
            ? row.cahier_present
            : key === 'cahier_lesson'
            ? row.cahier_lesson === 'complete'
            : key === 'cahier_documents'
            ? row.cahier_documents === 'correct'
            : row.cahier_readability === 'readable'
        );
      case 'vigilance':
        return vigilanceIcons[row.vigilance] || '—';
      case 'participation':
        return participationIcons[row.participation] || '—';
      case 'mini_eval':
        return row.mini_eval ?? '—';
      case 'attitude':
        return attitudeIcons[row.attitude] || '—';
      case 'sleeping':
        return row.sleeping ? '😴' : '🙂';
      case 'phone_use':
        return row.phone_use ? '📱' : '—';
      case 'notes':
        return row.notes?.length ? row.notes : row.comment || '—';
      default:
        return row[key] || '—';
    }
  };

  const getRowBg = (row, idx) => {
    if (row.presence === 'absent') return 'bg-red-50';
    if (row.sleeping) return 'bg-amber-50';
    if (row.phone_use) return 'bg-amber-50';
    return idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50';
  };

  return (
    <Card className="overflow-hidden">
      {/* Session header - always visible, clickable */}
      <div
        className="flex items-center gap-3 p-4 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        {/* Time badge */}
        <div className="flex-shrink-0 text-center bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 min-w-[90px]">
          <p className="text-xs font-bold text-blue-700">{formatTime(session.startTime)}</p>
          <p className="text-[10px] text-blue-500">{formatTime(session.endTime)}</p>
        </div>

        {/* Session info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-sm truncate">
              {session.subject || 'Matière non renseignée'}
            </p>
            {session.topic && (
              <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded truncate max-w-[200px]">
                {session.topic}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {session.teacher} • {total} élève{total > 1 ? 's' : ''}
          </p>
        </div>

        {/* Quick metrics badges */}
        <div className="hidden sm:flex items-center gap-1.5 flex-shrink-0 flex-wrap justify-end">
          {qBadge('✅', `${presPct}%`, presColor)}
          {summary.presence.absent > 0 && qBadge('❌', summary.presence.absent, 'bg-red-100 text-red-700')}
          {summary.sleepingIncidents > 0 && qBadge('😴', summary.sleepingIncidents, 'bg-orange-100 text-orange-700')}
          {summary.phoneIncidents > 0 && qBadge('📱', summary.phoneIncidents, 'bg-red-100 text-red-700')}
          {summary.notes?.count > 0 && qBadge('🗒️', summary.notes.count, 'bg-indigo-100 text-indigo-700')}
        </div>

        {/* Expand/collapse icon */}
        <div className="flex-shrink-0 text-muted-foreground">
          {expanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
        </div>
      </div>

      {/* Mobile quick badges */}
      {!expanded && (
        <div className="flex sm:hidden items-center gap-1.5 px-4 pb-3 flex-wrap">
          {qBadge('✅', `${presPct}%`, presColor)}
          {summary.presence.absent > 0 && qBadge('❌', summary.presence.absent, 'bg-red-100 text-red-700')}
          {summary.sleepingIncidents > 0 && qBadge('😴', summary.sleepingIncidents, 'bg-orange-100 text-orange-700')}
          {summary.phoneIncidents > 0 && qBadge('📱', summary.phoneIncidents, 'bg-red-100 text-red-700')}
        </div>
      )}

      {/* Expanded content */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-t px-4 pb-4 pt-3 space-y-4">
              {/* Detailed metrics grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-2">
                {[
                  { label: 'Présence', icon: '✅', value: `${summary.presence.present}/${metricTotals.presence || total}`, pct: presPct, good: 70, warn: 50 },
                  { label: 'Cahier', icon: '📘', value: `${summary.cahier.present}/${metricTotals.cahierPresent || total}`, pct: cahierPct, good: 70, warn: 50 },
                  { label: 'Vigilance', icon: '👁️', value: `${summary.vigilance.vigilant}/${metricTotals.vigilance || total}`, pct: vigPct, good: 70, warn: 50 },
                  { label: 'Particip.+', icon: '🙋', value: `${summary.participationLevels.good + summary.participationLevels.excellent}/${metricTotals.participation || total}`, pct: partPct, good: 40, warn: 20 },
                  { label: 'Attitude', icon: '🙂', value: `${summary.attitudeLevels.correct}/${metricTotals.attitude || total}`, pct: attPct, good: 70, warn: 50 },
                  { label: 'Dormance', icon: '😴', value: `${summary.sleepingIncidents}`, pct: total > 0 ? toPercent(summary.sleepingIncidents, total) : 0, inverted: true },
                  { label: 'Téléphone', icon: '📱', value: `${summary.phoneIncidents}`, pct: total > 0 ? toPercent(summary.phoneIncidents, total) : 0, inverted: true },
                  { label: 'Éval moy.', icon: '📝', value: summary.evaluation.count > 0 ? `${summary.evaluation.average}/100` : '—', pct: null, special: true },
                ].map((m) => {
                  const cls = m.special
                    ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                    : m.inverted
                    ? (m.pct <= 0 ? 'bg-green-50 border-green-200 text-green-700' : m.pct <= 10 ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-red-50 border-red-200 text-red-700')
                    : (m.pct >= (m.good || 70) ? 'bg-green-50 border-green-200 text-green-700' : m.pct >= (m.warn || 50) ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-red-50 border-red-200 text-red-700');
                  return (
                    <div key={m.label} className={`border rounded-lg p-2.5 ${cls}`}>
                      <p className="text-[10px] font-medium opacity-70">{m.icon} {m.label}</p>
                      <p className="text-sm font-bold mt-0.5">{m.value}</p>
                      {m.pct !== null && <p className="text-[10px] font-bold mt-0.5">{m.pct}%</p>}
                    </div>
                  );
                })}
              </div>

              {/* Student tracking table */}
              <div className="overflow-x-auto border rounded-lg">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      {headers.map((header) => (
                        <th
                          key={header.key}
                          className={`py-2 px-1.5 font-semibold text-muted-foreground ${header.className || ''}`}
                        >
                          {header.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {studentRows.length === 0 ? (
                      <tr>
                        <td colSpan={headers.length} className="py-4 text-center text-muted-foreground">
                          Aucun suivi enregistré pour cette séance.
                        </td>
                      </tr>
                    ) : (
                      studentRows.map((row, idx) => (
                        <tr
                          key={`${row.studentId || row.studentName}-${idx}`}
                          className={`${getRowBg(row, idx)} hover:bg-blue-50/50 transition-colors border-b border-gray-100`}
                        >
                          {headers.map((header) => (
                            <td key={header.key} className={`py-1.5 px-1.5 text-center ${header.key === 'studentName' ? 'text-left font-medium' : ''}`}>
                              {renderCell(row, header.key)}
                            </td>
                          ))}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
};

// Composant pour afficher le score de santé
const HealthScoreGauge = ({ score, status, size = 'md' }) => {
  const sizeClasses = {
    sm: 'w-16 h-16 text-lg',
    md: 'w-24 h-24 text-2xl',
    lg: 'w-32 h-32 text-3xl'
  };
  const statusColors = {
    green: 'from-green-400 to-green-600',
    orange: 'from-orange-400 to-orange-600',
    red: 'from-red-400 to-red-600',
    gray: 'from-gray-300 to-gray-400'
  };
  const bgColors = {
    green: 'bg-green-50 border-green-200',
    orange: 'bg-orange-50 border-orange-200',
    red: 'bg-red-50 border-red-200',
    gray: 'bg-gray-50 border-gray-200'
  };

  return (
    <div className={`${sizeClasses[size]} rounded-full bg-gradient-to-br ${statusColors[status]} flex items-center justify-center shadow-lg`}>
      <div className={`${size === 'sm' ? 'w-12 h-12' : size === 'md' ? 'w-18 h-18' : 'w-24 h-24'} rounded-full bg-white flex items-center justify-center`}>
        <span className="font-bold">{score !== null ? score : '—'}</span>
      </div>
    </div>
  );
};

// Composant pour les recommandations
const RecommendationCard = ({ recommendation, onAction }) => {
  const priorityColors = {
    high: 'border-l-red-500 bg-red-50',
    medium: 'border-l-orange-500 bg-orange-50',
    low: 'border-l-blue-500 bg-blue-50'
  };
  const priorityIcons = {
    high: AlertTriangle,
    medium: AlertCircle,
    low: Lightbulb
  };
  const Icon = priorityIcons[recommendation.priority] || Lightbulb;

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      className={`border-l-4 ${priorityColors[recommendation.priority]} p-4 rounded-r-lg`}
    >
      <div className="flex items-start gap-3">
        <Icon className={`w-5 h-5 mt-0.5 ${recommendation.priority === 'high' ? 'text-red-600' : recommendation.priority === 'medium' ? 'text-orange-600' : 'text-blue-600'}`} />
        <div className="flex-1">
          <h4 className="font-semibold text-sm">{recommendation.title}</h4>
          <p className="text-xs text-muted-foreground mt-1">{recommendation.description}</p>
          {recommendation.action && (
            <p className="text-xs font-medium text-primary mt-2 flex items-center gap-1">
              <Target className="w-3 h-3" />
              {recommendation.action}
            </p>
          )}
        </div>
      </div>
    </motion.div>
  );
};

// Composant pour les élèves à risque
const ProblemStudentCard = ({ student }) => {
  const navigate = useNavigate();
  const riskColors = {
    high: 'border-red-300 bg-red-50',
    medium: 'border-orange-300 bg-orange-50',
    low: 'border-yellow-300 bg-yellow-50'
  };

  return (
    <div
      className={`border ${riskColors[student.riskLevel]} rounded-lg p-3 ${student.studentId ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}
      onClick={() => student.studentId && navigate(`/students?student=${student.studentId}`)}
      title={student.studentId ? "Ouvrir la fiche de l'élève (notes, suivi, envoi parents)" : undefined}
    >
      <div className="flex justify-between items-start">
        <div>
          <p className="font-medium text-sm">{student.studentName}</p>
          <p className="text-xs text-muted-foreground">{student.className}</p>
        </div>
        <span className={`text-xs font-bold px-2 py-1 rounded-full ${
          student.riskLevel === 'high' ? 'bg-red-200 text-red-800' :
          student.riskLevel === 'medium' ? 'bg-orange-200 text-orange-800' :
          'bg-yellow-200 text-yellow-800'
        }`}>
          Score: {student.riskScore}
        </span>
      </div>
      {student.mainIssues.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {student.mainIssues.map((issue, idx) => (
            <span key={idx} className="text-xs bg-white px-2 py-0.5 rounded border">
              {issue}
            </span>
          ))}
        </div>
      )}
      <div className="grid grid-cols-4 gap-2 mt-2 text-xs">
        <div className="text-center">
          <p className="font-bold">{student.absences}</p>
          <p className="text-muted-foreground">Abs.</p>
        </div>
        <div className="text-center">
          <p className="font-bold">{student.phoneIncidents}</p>
          <p className="text-muted-foreground">📱</p>
        </div>
        <div className="text-center">
          <p className="font-bold">{student.sleepingIncidents}</p>
          <p className="text-muted-foreground">😴</p>
        </div>
        <div className="text-center">
          <p className="font-bold">{student.perturbateurIncidents}</p>
          <p className="text-muted-foreground">⚠️</p>
        </div>
      </div>
    </div>
  );
};

const BehaviorDashboard = () => {
  const { user } = useAuth();
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [dailyMetrics, setDailyMetrics] = useState(null);
  const [classMetrics, setClassMetrics] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [trends, setTrends] = useState([]);
  const [trendDays, setTrendDays] = useState(7);
  const [loading, setLoading] = useState(true);
  const [selectedClass, setSelectedClass] = useState(null);
  const [classDetails, setClassDetails] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  
  // Nouveaux états pour santé des classes et recommandations
  const [classHealthData, setClassHealthData] = useState(null);
  const [problemStudents, setProblemStudents] = useState(null);
  const [activeTab, setActiveTab] = useState('overview'); // 'overview', 'health', 'students', 'trends'
  const [refreshing, setRefreshing] = useState(false);

  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';

  useEffect(() => {
    setSelectedClass(null);
    setClassDetails(null);
    fetchAllData();
  }, [selectedDate, trendDays]);

  useEffect(() => {
    if (selectedClass) {
      fetchClassDetails(selectedClass.classId);
    }
  }, [selectedDate]);

  const getAuthToken = async () => {
    const { supabase } = await import('../../lib/supabase');
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token;
  };

  const fetchAllData = async () => {
    try {
      setLoading(true);
      const token = await getAuthToken();

      const [dailyRes, classesRes, alertsRes, trendsRes, healthRes, studentsRes] = await Promise.all([
        fetch(`${apiUrl}/api/admin/behavior/daily?date=${selectedDate}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch(`${apiUrl}/api/admin/behavior/classes?date=${selectedDate}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch(`${apiUrl}/api/admin/behavior/alerts?date=${selectedDate}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch(`${apiUrl}/api/admin/behavior/trends?days=${trendDays}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch(`${apiUrl}/api/admin/behavior/class-health?days=${trendDays}&date=${selectedDate}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch(`${apiUrl}/api/admin/behavior/problem-students?days=${trendDays}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
      ]);

      const dailyData = await dailyRes.json();
      const classesData = await classesRes.json();
      const alertsData = await alertsRes.json();
      const trendsData = await trendsRes.json();
      const healthData = await healthRes.json();
      const studentsData = await studentsRes.json();

      setDailyMetrics(dailyData);
      setClassMetrics(Array.isArray(classesData) ? classesData : []);
      setAlerts(Array.isArray(alertsData) ? alertsData : []);
      setTrends(Array.isArray(trendsData) ? trendsData : []);
      setClassHealthData(healthData);
      setProblemStudents(studentsData);
    } catch (error) {
      console.error('Erreur lors du chargement des données:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchAllData();
    setRefreshing(false);
  };

  const fetchClassDetails = async (classId, { skipLoader = false } = {}) => {
    try {
      if (!skipLoader) setDetailsLoading(true);
      const token = await getAuthToken();
      const res = await fetch(
        `${apiUrl}/api/admin/behavior/classes/${classId}/details?date=${selectedDate}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json();
      setClassDetails(data);
    } catch (error) {
      console.error('Erreur lors du chargement des suivis professeurs :', error);
      setClassDetails(null);
    } finally {
      if (!skipLoader) setDetailsLoading(false);
    }
  };

  const handleSelectClass = (cls) => {
    if (selectedClass?.classId === cls.classId) {
      setSelectedClass(null);
      setClassDetails(null);
      return;
    }
    setSelectedClass(cls);
    fetchClassDetails(cls.classId);
  };

  const activeClassMetrics = classMetrics.filter(cls => (cls.recordCount || 0) > 0);
  const trackedStudentsCount = activeClassMetrics.reduce((sum, c) => sum + (c.uniqueStudentCount || c.studentCount || 0), 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  const today = new Date().toISOString().split('T')[0];
  const isToday = selectedDate === today;

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Activity className="w-8 h-8 text-primary" />
            Tableau de Bord Comportement
          </h1>
          <p className="text-muted-foreground mt-1">Analyse comportementale et stratégie pédagogique</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-2 rounded-lg border hover:bg-muted transition-colors"
          >
            <RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
          <div className="flex items-center gap-2 bg-muted px-3 py-2 rounded-lg">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent text-sm border-0 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Navigation par onglets */}
      <div className="flex gap-2 border-b pb-2 overflow-x-auto">
        {[
          { id: 'overview', label: 'Vue du jour', icon: Eye },
          { id: 'health', label: 'Santé des classes', icon: Heart },
          { id: 'students', label: 'Élèves à risque', icon: Users },
          { id: 'trends', label: 'Tendances', icon: TrendingUp }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === tab.id
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Score global de santé */}
      {classHealthData?.summary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="md:col-span-1">
            <CardContent className="p-6 flex flex-col items-center justify-center">
              <p className="text-sm text-muted-foreground mb-2">Score Global</p>
              <HealthScoreGauge 
                score={classHealthData.summary.averageHealthScore} 
                status={
                  classHealthData.summary.averageHealthScore >= 70 ? 'green' :
                  classHealthData.summary.averageHealthScore >= 50 ? 'orange' : 'red'
                }
                size="lg"
              />
              <p className="text-xs text-muted-foreground mt-2">
                sur {classHealthData.summary.classesWithData} classe(s)
              </p>
            </CardContent>
          </Card>
          <Card className="md:col-span-3">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <ThermometerSun className="w-5 h-5" />
                Distribution de santé
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 gap-4">
                <div className="text-center p-3 bg-green-50 rounded-lg border border-green-200">
                  <p className="text-2xl font-bold text-green-700">{classHealthData.summary.healthDistribution.green}</p>
                  <p className="text-xs text-green-600">En bonne santé</p>
                </div>
                <div className="text-center p-3 bg-orange-50 rounded-lg border border-orange-200">
                  <p className="text-2xl font-bold text-orange-700">{classHealthData.summary.healthDistribution.orange}</p>
                  <p className="text-xs text-orange-600">À surveiller</p>
                </div>
                <div className="text-center p-3 bg-red-50 rounded-lg border border-red-200">
                  <p className="text-2xl font-bold text-red-700">{classHealthData.summary.healthDistribution.red}</p>
                  <p className="text-xs text-red-600">Critique</p>
                </div>
                <div className="text-center p-3 bg-gray-50 rounded-lg border border-gray-200">
                  <p className="text-2xl font-bold text-gray-700">{classHealthData.summary.healthDistribution.gray}</p>
                  <p className="text-xs text-gray-600">Sans données</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Recommandations globales */}
      {classHealthData?.globalRecommendations?.length > 0 && (
        <Card className="border-l-4 border-l-primary">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Lightbulb className="w-5 h-5 text-primary" />
              Recommandations Stratégiques
            </CardTitle>
            <CardDescription>Actions prioritaires pour améliorer la situation globale</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {classHealthData.globalRecommendations.map((rec, idx) => (
              <div key={idx} className={`p-3 rounded-lg ${
                rec.type === 'urgent' ? 'bg-red-50 border border-red-200' :
                rec.type === 'warning' ? 'bg-orange-50 border border-orange-200' :
                'bg-blue-50 border border-blue-200'
              }`}>
                <div className="flex items-start gap-3">
                  {rec.type === 'urgent' ? <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5" /> :
                   rec.type === 'warning' ? <AlertCircle className="w-5 h-5 text-orange-600 mt-0.5" /> :
                   <Target className="w-5 h-5 text-blue-600 mt-0.5" />}
                  <div>
                    <h4 className="font-semibold text-sm">{rec.title}</h4>
                    <p className="text-xs text-muted-foreground mt-1">{rec.description}</p>
                    <p className="text-xs font-medium text-primary mt-2">→ {rec.action}</p>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Contenu selon l'onglet actif */}
      <AnimatePresence mode="wait">
        {/* Onglet: Santé des classes — groupé par type/niveau/filière */}
        {activeTab === 'health' && classHealthData?.classes && (() => {
          const HEALTH_LABELS = {
            college: { label: 'Collège', icon: School, color: 'blue' },
            lycee: { label: 'Lycée', icon: GraduationCap, color: 'purple' }
          };
          const LEVEL_LABELS = {
            '1AC': '1ère Année Collège', '2AC': '2ème Année Collège', '3AC': '3ème Année Collège',
            'TC': 'Tronc Commun', '1BAC': '1ère Bac', '2BAC': '2ème Bac'
          };
          const FILIERE_LABELS = {
            tc_sciences: 'TC Sciences', tc_lettres: 'TC Lettres', tc_tech: 'TC Technologique',
            sciences_exp: 'Sciences Exp.', sciences_math: 'Sciences Math', sciences_eco: 'Sciences Éco.',
            lettres: 'Lettres', svt: 'SVT', pc: 'PC', sciences_math_a: 'Math A', sciences_math_b: 'Math B',
            eco: 'Éco.', sciences_humaines: 'Sc. Humaines'
          };

          // Group classes by school_type -> level -> filiere
          const grouped = {};
          const uncategorized = [];
          classHealthData.classes.forEach(cls => {
            if (!cls.school_type) { uncategorized.push(cls); return; }
            if (!grouped[cls.school_type]) grouped[cls.school_type] = {};
            const lvl = cls.level || 'Autre';
            if (!grouped[cls.school_type][lvl]) grouped[cls.school_type][lvl] = {};
            const fil = cls.filiere || '_none';
            if (!grouped[cls.school_type][lvl][fil]) grouped[cls.school_type][lvl][fil] = [];
            grouped[cls.school_type][lvl][fil].push(cls);
          });

          // Compute average health for a list of classes
          const avgHealth = (list) => {
            const withData = list.filter(c => c.healthScore !== null);
            if (withData.length === 0) return null;
            return Math.round(withData.reduce((s, c) => s + c.healthScore, 0) / withData.length);
          };
          const avgStatus = (score) => score === null ? 'gray' : score >= 70 ? 'green' : score >= 50 ? 'orange' : 'red';

          // Render a single health card
          const renderHealthCard = (cls) => (
            <Card 
              key={cls.classId} 
              className={`cursor-pointer transition-all hover:shadow-lg ${
                cls.healthStatus === 'red' ? 'border-red-300' :
                cls.healthStatus === 'orange' ? 'border-orange-300' :
                cls.healthStatus === 'green' ? 'border-green-300' : 'border-gray-200'
              }`}
              onClick={() => { setSelectedClass(cls); fetchClassDetails(cls.classId); }}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-bold text-sm">{cls.className}</h3>
                    <p className="text-xs text-muted-foreground">
                      {cls.level}{cls.filiere ? ` - ${FILIERE_LABELS[cls.filiere] || cls.filiere}` : ''} {' • '} {cls.teacher}
                    </p>
                  </div>
                  <HealthScoreGauge score={cls.healthScore} status={cls.healthStatus} size="sm" />
                </div>
                {cls.metrics && (
                  <div className="grid grid-cols-4 gap-2 text-xs mb-3">
                    <div className="text-center p-1 bg-muted rounded">
                      <p className="font-bold">{cls.metrics.presenceRate}%</p>
                      <p className="text-muted-foreground">Présence</p>
                    </div>
                    <div className="text-center p-1 bg-muted rounded">
                      <p className="font-bold">{cls.metrics.phoneRate}%</p>
                      <p className="text-muted-foreground">Tél.</p>
                    </div>
                    <div className="text-center p-1 bg-muted rounded">
                      <p className="font-bold">{cls.metrics.sleepingRate}%</p>
                      <p className="text-muted-foreground">Sommeil</p>
                    </div>
                    <div className="text-center p-1 bg-muted rounded">
                      <p className="font-bold">{cls.metrics.participationPositiveRate}%</p>
                      <p className="text-muted-foreground">Particip.</p>
                    </div>
                  </div>
                )}
                {cls.recommendations?.length > 0 && typeof cls.recommendations[0] === 'object' && (
                  <div className="space-y-1">
                    {cls.recommendations.slice(0, 2).map((rec, idx) => (
                      <div key={idx} className={`text-xs p-2 rounded ${
                        rec.priority === 'high' ? 'bg-red-50 text-red-700' :
                        rec.priority === 'medium' ? 'bg-orange-50 text-orange-700' :
                        'bg-blue-50 text-blue-700'
                      }`}>
                        <span className="font-medium">{rec.title}</span>
                      </div>
                    ))}
                  </div>
                )}
                {(!cls.recommendations || cls.recommendations.length === 0 || typeof cls.recommendations[0] === 'string') && cls.healthScore !== null && (
                  <p className="text-xs text-green-600 flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" />
                    Aucun problème majeur détecté
                  </p>
                )}
                {cls.healthScore === null && (
                  <p className="text-xs text-muted-foreground">Aucune donnée de suivi disponible</p>
                )}
              </CardContent>
            </Card>
          );

          return (
          <motion.div
            key="health"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-4"
          >
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Heart className="w-5 h-5 text-red-500" />
              Santé par Classe
              <span className="text-sm font-normal text-muted-foreground ml-2">
                (période: {trendDays} jours)
              </span>
            </h2>

            {/* Grouped by school type */}
            {Object.entries(grouped).map(([typeKey, levels]) => {
              const typeInfo = HEALTH_LABELS[typeKey] || { label: typeKey, icon: School, color: 'gray' };
              const TypeIcon = typeInfo.icon;
              const allClasses = Object.values(levels).flatMap(filieres => Object.values(filieres).flat());
              const typeAvg = avgHealth(allClasses);
              const typeStatus = avgStatus(typeAvg);

              const typeBg = typeKey === 'college' ? 'bg-blue-50 border-b border-blue-200' : 'bg-purple-50 border-b border-purple-200';
              const typeIconBg = typeKey === 'college' ? 'bg-blue-100' : 'bg-purple-100';
              const typeIconColor = typeKey === 'college' ? 'text-blue-600' : 'text-purple-600';

              return (
                <Card key={typeKey} className="overflow-hidden">
                  <div className={`${typeBg} px-5 py-3 flex items-center justify-between`}>
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${typeIconBg}`}>
                        <TypeIcon className={`w-5 h-5 ${typeIconColor}`} />
                      </div>
                      <div>
                        <h3 className="font-bold text-lg">{typeInfo.label}</h3>
                        <p className="text-xs text-muted-foreground">{allClasses.length} classe(s)</p>
                      </div>
                    </div>
                    <HealthScoreGauge score={typeAvg} status={typeStatus} size="sm" />
                  </div>
                  <CardContent className="p-4 space-y-4">
                    {Object.entries(levels).map(([levelKey, filieres]) => {
                      const levelClasses = Object.values(filieres).flat();
                      const levelAvg = avgHealth(levelClasses);
                      const levelStatus = avgStatus(levelAvg);
                      const filiereKeys = Object.keys(filieres);
                      const hasOnlyNone = filiereKeys.length === 1 && filiereKeys[0] === '_none';

                      return (
                        <div key={levelKey} className="border rounded-lg overflow-hidden">
                          <div className="flex items-center justify-between px-4 py-2 bg-muted/50">
                            <div className="flex items-center gap-2">
                              <FolderOpen className="w-4 h-4 text-muted-foreground" />
                              <span className="font-semibold text-sm">{LEVEL_LABELS[levelKey] || levelKey}</span>
                              <span className="text-xs bg-muted px-2 py-0.5 rounded-full">{levelClasses.length}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              {levelAvg !== null && (
                                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                                  levelStatus === 'green' ? 'bg-green-100 text-green-700' :
                                  levelStatus === 'orange' ? 'bg-orange-100 text-orange-700' :
                                  levelStatus === 'red' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'
                                }`}>
                                  Moy: {levelAvg}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="p-3">
                            {hasOnlyNone ? (
                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                {filieres['_none'].map(renderHealthCard)}
                              </div>
                            ) : (
                              <div className="space-y-3">
                                {Object.entries(filieres).map(([filKey, filClasses]) => (
                                  <div key={filKey}>
                                    {filKey !== '_none' && (
                                      <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1">
                                        <ChevronRight className="w-3 h-3" />
                                        {FILIERE_LABELS[filKey] || filKey}
                                        <span className="bg-muted px-1.5 py-0.5 rounded-full ml-1">{filClasses.length}</span>
                                      </p>
                                    )}
                                    {filKey === '_none' && (
                                      <p className="text-xs font-semibold text-muted-foreground mb-2">Sans filière</p>
                                    )}
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                      {filClasses.map(renderHealthCard)}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              );
            })}

            {/* Uncategorized classes */}
            {uncategorized.length > 0 && (
              <Card className="border-orange-300">
                <div className="bg-orange-50 border-b border-orange-200 px-5 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-orange-100">
                      <AlertCircle className="w-5 h-5 text-orange-600" />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg">Non classifiées</h3>
                      <p className="text-xs text-orange-600">{uncategorized.length} classe(s) sans type scolaire</p>
                    </div>
                  </div>
                  <HealthScoreGauge score={avgHealth(uncategorized)} status={avgStatus(avgHealth(uncategorized))} size="sm" />
                </div>
                <CardContent className="p-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {uncategorized.map(renderHealthCard)}
                  </div>
                </CardContent>
              </Card>
            )}
          </motion.div>
          );
        })()}

        {/* Onglet: Élèves à risque */}
        {activeTab === 'students' && (
          <motion.div
            key="students"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-4"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Users className="w-5 h-5 text-orange-500" />
                Élèves à Risque
                <span className="text-sm font-normal text-muted-foreground ml-2">
                  ({problemStudents?.problemStudentsCount || 0} élèves identifiés sur {trendDays} jours)
                </span>
              </h2>
            </div>

            {problemStudents?.students?.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {problemStudents.students.map(student => (
                  <ProblemStudentCard key={student.studentId} student={student} />
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="p-8 text-center">
                  <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
                  <h3 className="font-semibold text-lg">Aucun élève à risque détecté</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Sur les {trendDays} derniers jours, aucun élève ne présente de comportement préoccupant.
                  </p>
                </CardContent>
              </Card>
            )}

            {problemStudents?.students?.length > 0 && (
              <Card className="mt-4">
                <CardHeader>
                  <CardTitle className="text-lg">Analyse des problèmes récurrents</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {(() => {
                      const issues = problemStudents.students.flatMap(s => s.mainIssues);
                      const issueCounts = {};
                      issues.forEach(issue => {
                        issueCounts[issue] = (issueCounts[issue] || 0) + 1;
                      });
                      return Object.entries(issueCounts)
                        .sort((a, b) => b[1] - a[1])
                        .slice(0, 4)
                        .map(([issue, count]) => (
                          <div key={issue} className="text-center p-3 bg-muted rounded-lg">
                            <p className="text-2xl font-bold">{count}</p>
                            <p className="text-xs text-muted-foreground">{issue}</p>
                          </div>
                        ));
                    })()}
                  </div>
                </CardContent>
              </Card>
            )}
          </motion.div>
        )}

        {/* Onglet: Vue du jour (Overview) */}
        {activeTab === 'overview' && (
          <motion.div
            key="overview"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-6"
          >
            {/* Contexte enrichi */}
            <Card className="bg-gradient-to-r from-blue-50 to-purple-50 border-blue-200">
              <CardContent className="p-6">
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-blue-100">
                      <Calendar className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Date</p>
                      <p className="text-sm font-bold">{new Date(selectedDate).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-green-100">
                      <Users className="w-5 h-5 text-green-600" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Suivis enregistrés</p>
                      <p className="text-sm font-bold">{trackedStudentsCount} <span className="text-xs font-normal text-muted-foreground">élèves</span></p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-purple-100">
                      <School className="w-5 h-5 text-purple-600" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Classes actives</p>
                      <p className="text-sm font-bold">{activeClassMetrics.length} <span className="text-xs font-normal text-muted-foreground">/ {classMetrics.length}</span></p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-amber-100">
                      <AlertTriangle className="w-5 h-5 text-amber-600" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Alertes</p>
                      <p className="text-sm font-bold">{alerts.length} <span className="text-xs font-normal text-muted-foreground">du jour</span></p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-indigo-100">
                      <Target className="w-5 h-5 text-indigo-600" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Éval. moy.</p>
                      <p className="text-sm font-bold">{dailyMetrics?.overview?.averageEval !== null && dailyMetrics?.overview?.averageEval !== undefined ? `${dailyMetrics.overview.averageEval}/100` : '—'}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* KPIs */}
            <div className="space-y-4">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Activity className="w-5 h-5 text-primary" />
                Indicateurs Clés du Jour
              </h2>
              {dailyMetrics?.overview && dailyMetrics.overview.totalRecords > 0 ? (
                <div className="space-y-4">
                  {/* Indicateurs positifs */}
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                      <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                      Performance & Engagement
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      <MetricCard
                        label="Présence"
                        value={`${dailyMetrics.overview.presenceRate || 0}%`}
                        subLabel={`Absents ${dailyMetrics.overview.absenceRate || 0}%`}
                        accent="green"
                        icon={Users}
                        percent={dailyMetrics.overview.presenceRate || 0}
                      />
                      <MetricCard
                        label="Cahier conforme"
                        value={`${dailyMetrics.overview.cahierPresentRate || 0}%`}
                        subLabel={`Leçon ${dailyMetrics.overview.cahierLessonRate || 0}% • Docs ${dailyMetrics.overview.cahierDocsRate || 0}%`}
                        accent="purple"
                        icon={BookOpen}
                        percent={dailyMetrics.overview.cahierPresentRate || 0}
                      />
                      <MetricCard
                        label="Participation positive"
                        value={`${dailyMetrics.overview.participationPositiveRate || 0}%`}
                        subLabel={`Faible ${dailyMetrics.overview.participationWeakRate || 0}%`}
                        accent="blue"
                        icon={TrendingUp}
                        percent={dailyMetrics.overview.participationPositiveRate || 0}
                      />
                      <MetricCard
                        label="Attitude correcte"
                        value={`${dailyMetrics.overview.attitudeCorrectRate || 0}%`}
                        subLabel={`Perturbateur ${dailyMetrics.overview.attitudePerturbateurRate || 0}%`}
                        accent="green"
                        icon={CheckCircle}
                        percent={dailyMetrics.overview.attitudeCorrectRate || 0}
                      />
                    </div>
                  </div>

                  {/* Indicateurs de vigilance / risque */}
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                      Vigilance & Incidents
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      <MetricCard
                        label="Vigilance"
                        value={`${dailyMetrics.overview.vigilanceVigilantRate || 0}%`}
                        subLabel={`Bavard ${dailyMetrics.overview.vigilanceBavarreRate || 0}%`}
                        accent="yellow"
                        icon={Eye}
                        percent={dailyMetrics.overview.vigilanceVigilantRate || 0}
                      />
                      <MetricCard
                        label="Dormance"
                        value={`${dailyMetrics.overview.sleepingRate || 0}%`}
                        subLabel="Incidents sommeil"
                        accent={Number(dailyMetrics.overview.sleepingRate || 0) > 5 ? 'red' : 'yellow'}
                        icon={Moon}
                        percent={dailyMetrics.overview.sleepingRate || 0}
                      />
                      <MetricCard
                        label="Téléphone"
                        value={`${dailyMetrics.overview.phoneRate || 0}%`}
                        subLabel="Incidents téléphone"
                        accent={Number(dailyMetrics.overview.phoneRate || 0) > 10 ? 'red' : 'yellow'}
                        icon={Phone}
                        percent={dailyMetrics.overview.phoneRate || 0}
                      />
                      <MetricCard
                        label="Évaluation moyenne"
                        value={dailyMetrics.overview.averageEval !== null && dailyMetrics.overview.averageEval !== undefined ? `${dailyMetrics.overview.averageEval}/100` : '—'}
                        subLabel={`${dailyMetrics.overview.notesCount || 0} notes saisies`}
                        accent="indigo"
                        icon={Target}
                        percent={dailyMetrics.overview.averageEval}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <Card className="border-dashed">
                  <CardContent className="p-8 text-center">
                    <AlertCircle className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">Aucune donnée pour la date sélectionnée.</p>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Alertes */}
            {alerts.length > 0 && (
              <div>
                <h2 className="text-xl font-bold mb-4">🚨 Alertes du Jour</h2>
                <div className="space-y-3">
                  {alerts.map((alert) => (
                    <motion.div
                      key={alert.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                    >
                      <Card className={alert.level === 'attention' ? 'border-yellow-200 bg-yellow-50' : 'border-blue-200 bg-blue-50'}>
                        <CardContent className="p-4">
                          <div className="flex items-start gap-4">
                            <AlertCircle className={`w-5 h-5 mt-1 ${alert.level === 'attention' ? 'text-yellow-600' : 'text-blue-600'}`} />
                            <div className="flex-1">
                              <h3 className="font-semibold">{alert.title}</h3>
                              <p className="text-sm text-muted-foreground mt-1">{alert.description}</p>
                            </div>
                            <button className="px-3 py-1 bg-white rounded text-sm font-medium hover:bg-gray-100">
                              Détails
                            </button>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}

            {/* Vue par classe */}
            <div>
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                <Eye className="w-5 h-5 text-blue-500" />
                Vue par Classe - Comportement du Jour
                <span className="text-sm font-normal text-muted-foreground ml-2">
                  ({activeClassMetrics.length} classe{activeClassMetrics.length > 1 ? 's' : ''} active{activeClassMetrics.length > 1 ? 's' : ''})
                </span>
              </h2>
              {activeClassMetrics.length === 0 ? (
                <Card className="border-dashed">
                  <CardContent className="p-8 text-center">
                    <AlertCircle className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">Aucune classe active pour cette date.</p>
                  </CardContent>
                </Card>
              ) : (
              <Card>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b bg-muted/30">
                          <th className="text-left py-3 px-4 font-semibold text-xs uppercase tracking-wider">Classe</th>
                          <th className="text-center py-3 px-2 font-semibold text-xs uppercase tracking-wider">Élèves</th>
                          <th className="text-center py-3 px-2 font-semibold text-xs uppercase tracking-wider">Présence</th>
                          <th className="text-center py-3 px-2 font-semibold text-xs uppercase tracking-wider">Discipline</th>
                          <th className="text-center py-3 px-2 font-semibold text-xs uppercase tracking-wider">Particip.</th>
                          <th className="text-center py-3 px-2 font-semibold text-xs uppercase tracking-wider">Tél.</th>
                          <th className="text-center py-3 px-2 font-semibold text-xs uppercase tracking-wider">Sommeil</th>
                          <th className="text-center py-3 px-2 font-semibold text-xs uppercase tracking-wider">Cahier</th>
                          <th className="text-center py-3 px-2 font-semibold text-xs uppercase tracking-wider">Eval.</th>
                          <th className="text-center py-3 px-2 font-semibold text-xs uppercase tracking-wider"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeClassMetrics.map((cls) => {
                          const presRate = cls.presence?.present || 0;
                          const partRate = cls.participation?.positive || 0;
                          const sleepRate = cls.sleeping?.rate || 0;
                          const cahierRate = cls.cahier?.present || 0;
                          const evalAvg = cls.evaluation?.average;

                          const badge = (val, good = 70, warn = 50) => {
                            const color = val >= good ? 'text-green-700 bg-green-100' :
                              val >= warn ? 'text-amber-700 bg-amber-100' : 'text-red-700 bg-red-100';
                            return <span className={`text-xs font-bold px-2 py-1 rounded-full ${color}`}>{val}%</span>;
                          };
                          const badgeInv = (val, warn = 5, bad = 15) => {
                            const color = val <= warn ? 'text-green-700 bg-green-100' :
                              val <= bad ? 'text-amber-700 bg-amber-100' : 'text-red-700 bg-red-100';
                            return <span className={`text-xs font-bold px-2 py-1 rounded-full ${color}`}>{val}%</span>;
                          };

                          return (
                          <motion.tr
                            key={cls.classId}
                            className={`border-b hover:bg-muted/50 cursor-pointer transition-colors ${
                              selectedClass?.classId === cls.classId ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''
                            }`}
                            onClick={() => handleSelectClass(cls)}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                          >
                            <td className="py-3 px-4">
                              <div>
                                <p className="font-semibold text-sm">{cls.className}</p>
                                <p className="text-xs text-muted-foreground">
                                  {cls.level}{cls.teacher ? ` • ${cls.teacher}` : ' • Non assigné'}
                                </p>
                              </div>
                            </td>
                            <td className="py-3 px-2 text-center">
                              <span className="text-xs font-medium text-muted-foreground">{cls.uniqueStudentCount || cls.studentCount || 0}</span>
                            </td>
                            <td className="py-3 px-2 text-center">{badge(presRate)}</td>
                            <td className="py-3 px-2 text-center">
                              <StatusIndicator status={cls.discipline?.dominant} />
                            </td>
                            <td className="py-3 px-2 text-center">{badge(partRate, 40, 20)}</td>
                            <td className="py-3 px-2 text-center">
                              <StatusIndicator status={cls.phone?.dominant === 'nonUtilise' ? 'nonUtilise' : 'abusif'} />
                            </td>
                            <td className="py-3 px-2 text-center">{badgeInv(sleepRate)}</td>
                            <td className="py-3 px-2 text-center">{badge(cahierRate)}</td>
                            <td className="py-3 px-2 text-center">
                              {evalAvg !== null && evalAvg !== undefined ? (
                                <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                                  evalAvg >= 60 ? 'text-green-700 bg-green-100' : evalAvg >= 40 ? 'text-amber-700 bg-amber-100' : 'text-red-700 bg-red-100'
                                }`}>{evalAvg}</span>
                              ) : <span className="text-xs text-muted-foreground">—</span>}
                            </td>
                            <td className="py-3 px-2 text-center">
                              {selectedClass?.classId === cls.classId ? (
                                <ChevronDown className="w-4 h-4 text-blue-500 mx-auto" />
                              ) : (
                                <ChevronRight className="w-4 h-4 text-muted-foreground mx-auto" />
                              )}
                            </td>
                          </motion.tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
              )}

              {/* Détails classe sélectionnée — panneau complet */}
              {selectedClass && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-4"
                >
                  <Card className="border-blue-200 border-l-4 border-l-blue-500">
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="text-lg">{selectedClass.className}</CardTitle>
                          <CardDescription>
                            {selectedClass.level}{selectedClass.teacher ? ` • Prof: ${selectedClass.teacher}` : ''} • {selectedClass.uniqueStudentCount || selectedClass.studentCount || 0} élèves{selectedClass.sessionCount ? ` • ${selectedClass.sessionCount} séance${selectedClass.sessionCount > 1 ? 's' : ''}` : ''}
                          </CardDescription>
                        </div>
                        <button onClick={() => { setSelectedClass(null); setClassDetails(null); }} className="p-1.5 rounded-lg hover:bg-muted">
                          <X className="w-5 h-5 text-muted-foreground" />
                        </button>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-5">
                      {/* Résumé rapide en badges */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
                        {(() => {
                          const round1 = (n) => Math.round(n * 10) / 10;
                          const phoneNonUtilise = round1(Number(selectedClass.phone?.nonUtilise || 0));
                          const phoneUtilise = round1(Math.max(0, Math.min(100, 100 - phoneNonUtilise)));

                          return [
                          { label: 'Présence', value: `${selectedClass.presence?.present || 0}%`, color: (selectedClass.presence?.present || 0) >= 70 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800' },
                          { label: 'Absents', value: `${selectedClass.presence?.absent || 0}%`, color: (selectedClass.presence?.absent || 0) <= 10 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800' },
                          { label: 'Retards', value: `${selectedClass.presence?.late || 0}%`, color: 'bg-amber-100 text-amber-800' },
                          { label: 'Participation+', value: `${selectedClass.participation?.positive || 0}%`, color: (selectedClass.participation?.positive || 0) >= 40 ? 'bg-blue-100 text-blue-800' : 'bg-red-100 text-red-800' },
                          { label: 'Cahier', value: `${selectedClass.cahier?.present || 0}%`, color: (selectedClass.cahier?.present || 0) >= 60 ? 'bg-purple-100 text-purple-800' : 'bg-red-100 text-red-800' },
                          { label: 'Sommeil', value: `${selectedClass.sleeping?.rate || 0}%`, color: (selectedClass.sleeping?.rate || 0) <= 5 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800' },
                          { label: 'Téléphone', value: `${phoneUtilise}%`, color: phoneUtilise <= 10 ? 'bg-green-100 text-green-800' : phoneUtilise <= 20 ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800' },
                          { label: 'Éval.', value: selectedClass.evaluation?.average != null ? `${selectedClass.evaluation.average}/100` : '—', color: 'bg-indigo-100 text-indigo-800' }
                          ].map((item, i) => (
                          <div key={i} className={`text-center p-2 rounded-lg ${item.color}`}>
                            <p className="text-sm font-bold">{item.value}</p>
                            <p className="text-[10px] font-medium opacity-80">{item.label}</p>
                          </div>
                          ));
                        })()}
                      </div>

                      {/* Barres détaillées */}
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {/* Discipline */}
                        <div className="space-y-2 p-3 bg-muted/30 rounded-lg">
                          <h4 className="font-semibold text-sm flex items-center gap-2">
                            <Activity className="w-4 h-4 text-blue-500" /> Discipline
                          </h4>
                          {[
                            { label: 'Correct', value: selectedClass.discipline?.correct, color: 'bg-green-500' },
                            { label: 'Bavard', value: selectedClass.discipline?.moyen, color: 'bg-amber-500' },
                            { label: 'Perturbateur', value: selectedClass.discipline?.perturbateur, color: 'bg-red-500' }
                          ].map((item, i) => (
                            <div key={i} className="flex items-center gap-2">
                              <span className="text-xs w-24 text-muted-foreground">{item.label}</span>
                              <div className="flex-1 bg-gray-200 rounded-full h-2">
                                <div className={`${item.color} h-2 rounded-full transition-all`} style={{ width: `${item.value || 0}%` }}></div>
                              </div>
                              <span className="text-xs font-bold w-12 text-right">{item.value || 0}%</span>
                            </div>
                          ))}
                        </div>

                        {/* Téléphone */}
                        <div className="space-y-2 p-3 bg-muted/30 rounded-lg">
                          <h4 className="font-semibold text-sm flex items-center gap-2">
                            <Phone className="w-4 h-4 text-blue-500" /> Téléphone
                          </h4>
                          {(() => {
                            const round1 = (n) => Math.round(n * 10) / 10;
                            const nonUtilise = round1(Number(selectedClass.phone?.nonUtilise || 0));
                            const utilise = round1(Math.max(0, Math.min(100, 100 - nonUtilise)));

                            return [
                              { label: 'Non utilisé', value: nonUtilise, color: 'bg-green-500' },
                              { label: 'Utilisé', value: utilise, color: 'bg-red-500' }
                            ].map((item, i) => (
                              <div key={i} className="flex items-center gap-2">
                                <span className="text-xs w-24 text-muted-foreground">{item.label}</span>
                                <div className="flex-1 bg-gray-200 rounded-full h-2">
                                  <div className={`${item.color} h-2 rounded-full transition-all`} style={{ width: `${item.value || 0}%` }}></div>
                                </div>
                                <span className="text-xs font-bold w-12 text-right">{item.value || 0}%</span>
                              </div>
                            ));
                          })()}
                        </div>

                        {/* Attitude */}
                        <div className="space-y-2 p-3 bg-muted/30 rounded-lg">
                          <h4 className="font-semibold text-sm flex items-center gap-2">
                            <CheckCircle className="w-4 h-4 text-green-500" /> Attitude & Devoirs
                          </h4>
                          {[
                            { label: 'Att. correcte', value: selectedClass.attitude?.correct, color: 'bg-green-500' },
                            { label: 'Devoirs faits', value: selectedClass.homework?.doneRate, color: 'bg-purple-500' }
                          ].map((item, i) => (
                            <div key={i} className="flex items-center gap-2">
                              <span className="text-xs w-24 text-muted-foreground">{item.label}</span>
                              <div className="flex-1 bg-gray-200 rounded-full h-2">
                                <div className={`${item.color} h-2 rounded-full transition-all`} style={{ width: `${item.value || 0}%` }}></div>
                              </div>
                              <span className="text-xs font-bold w-12 text-right">{item.value || 0}%</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Suivi détaillé par session */}
                      <div>
                        {detailsLoading ? (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                            Chargement des suivis...
                          </div>
                        ) : !classDetails ? (
                          <p className="text-sm text-muted-foreground py-2">Chargement...</p>
                        ) : classDetails.sessions.length === 0 ? (
                          <p className="text-sm text-muted-foreground py-2">Aucun suivi enregistré par les professeurs pour cette date.</p>
                        ) : (
                          <div className="space-y-4">
                            <CorrelationSummary sessions={classDetails.sessions} />
                            <div>
                              <div className="flex items-center justify-between mb-3">
                                <h4 className="text-sm font-semibold flex items-center gap-2">
                                  <BookOpen className="w-4 h-4" /> Séances du jour ({classDetails.sessions.length})
                                </h4>
                                <span className="text-[10px] text-muted-foreground">Cliquez sur une séance pour voir le détail</span>
                              </div>
                              <div className="space-y-3">
                                {classDetails.sessions.map((session) => (
                                  <SessionDashboard key={session.sessionId} session={session} />
                                ))}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              )}
            </div>
          </motion.div>
        )}

        {/* Onglet: Tendances */}
        {activeTab === 'trends' && (
          <motion.div
            key="trends"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-6"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-blue-500" />
                Tendances
              </h2>
              <div className="flex gap-2">
                <button
                  onClick={() => setTrendDays(7)}
                  className={`px-3 py-1 rounded text-sm font-medium ${trendDays === 7 ? 'bg-blue-600 text-white' : 'bg-muted'}`}
                >
                  7 jours
                </button>
                <button
                  onClick={() => setTrendDays(30)}
                  className={`px-3 py-1 rounded text-sm font-medium ${trendDays === 30 ? 'bg-blue-600 text-white' : 'bg-muted'}`}
                >
                  30 jours
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Courbe de santé globale</CardTitle>
                  <CardDescription>Présence, vigilance et incidents sur {trendDays} jours</CardDescription>
                </CardHeader>
                <CardContent className="h-80">
                  {trends.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Pas encore de données sur cette période.</p>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={trends.map((trend) => ({
                        ...trend,
                        dateLabel: new Date(trend.date).toLocaleDateString('fr-FR', { month: 'short', day: 'numeric' })
                      }))}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="dateLabel" stroke="#94a3b8" />
                        <YAxis domain={[0, 100]} tickFormatter={(value) => `${value}%`} stroke="#94a3b8" />
                        <Tooltip formatter={(value) => `${value}%`} />
                        <Legend />
                        <Line type="monotone" dataKey="presenceRate" name="Présence" stroke="#22c55e" strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="vigilanceIncidentRate" name="Incidents vigilance" stroke="#f97316" strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="sleepingRate" name="Dormance" stroke="#ef4444" strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="phoneRate" name="Téléphone" stroke="#3b82f6" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Qualité pédagogique</CardTitle>
                  <CardDescription>Participation, cahier et évaluation moyenne</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {trends.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Pas encore de données sur cette période.</p>
                  ) : (
                    <>
                      <div className="h-40">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={trends.map((trend) => ({
                            ...trend,
                            dateLabel: new Date(trend.date).toLocaleDateString('fr-FR', { month: 'short', day: 'numeric' })
                          }))}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                            <XAxis dataKey="dateLabel" stroke="#94a3b8" />
                            <YAxis domain={[0, 100]} tickFormatter={(value) => `${value}%`} stroke="#94a3b8" />
                            <Tooltip formatter={(value) => `${value}%`} />
                            <Legend />
                            <Line type="monotone" dataKey="cahierRate" name="Cahier conforme" stroke="#a855f7" strokeWidth={2} dot={false} />
                            <Line type="monotone" dataKey="participationPositiveRate" name="Participation positive" stroke="#0ea5e9" strokeWidth={2} dot={false} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="h-40">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={trends.map((trend) => ({
                            ...trend,
                            dateLabel: new Date(trend.date).toLocaleDateString('fr-FR', { month: 'short', day: 'numeric' })
                          }))}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                            <XAxis dataKey="dateLabel" stroke="#94a3b8" />
                            <YAxis domain={[0, 100]} tickFormatter={(value) => `${value}/100`} stroke="#94a3b8" />
                            <Tooltip formatter={(value) => `${value}/100`} />
                            <Legend />
                            <Line type="monotone" dataKey="evaluationAverage" name="Évaluation moyenne" stroke="#14b8a6" strokeWidth={2} dot />
                            <Line type="monotone" dataKey="participationWeakRate" name="Participation faible" stroke="#f97316" strokeWidth={2} strokeDasharray="5 5" dot={false} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Comparaison des classes */}
            {classHealthData?.classes && (
              <Card>
                <CardHeader>
                  <CardTitle>Comparaison des scores de santé par classe</CardTitle>
                  <CardDescription>Score composite sur {trendDays} jours</CardDescription>
                </CardHeader>
                <CardContent className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={classHealthData.classes.filter(c => c.healthScore !== null).slice(0, 10)}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="className" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                      <YAxis domain={[0, 100]} stroke="#94a3b8" />
                      <Tooltip formatter={(value) => `${value}/100`} />
                      <Bar dataKey="healthScore" name="Score de santé">
                        {classHealthData.classes.filter(c => c.healthScore !== null).slice(0, 10).map((entry, index) => (
                          <Cell 
                            key={`cell-${index}`} 
                            fill={entry.healthStatus === 'green' ? '#22c55e' : entry.healthStatus === 'orange' ? '#f97316' : '#ef4444'} 
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default BehaviorDashboard;
