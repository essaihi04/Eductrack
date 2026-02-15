import { useMemo, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Calendar, ClipboardList, TrendingUp, Award, AlertCircle, Download, Eye } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card';
import { supabase } from '../../lib/supabase';
import { Link } from 'react-router-dom';
import DocumentViewerModal from '../../components/DocumentViewerModal';

const StatusCard = ({ icon: Icon, title, value, statusText, accentClasses }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    whileHover={{ scale: 1.02 }}
  >
    <Card className={accentClasses}>
      <CardContent className="p-6">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium">{title}</p>
            <h3 className="text-3xl font-bold mt-2">{value}</h3>
            <p className="text-xs mt-2 font-medium">{statusText}</p>
          </div>
          <div className="p-3 rounded-full bg-white/60">
            <Icon className="w-7 h-7" />
          </div>
        </div>
      </CardContent>
    </Card>
  </motion.div>
);

const StudentDashboard = () => {
  const [stats, setStats] = useState({
    attendanceRate: 0,
    homeworkCompletionRate: 0,
    averageGrade: 0,
    behaviorScore: 0,
    totalSessions: 0,
  });
  const [scoreBreakdown, setScoreBreakdown] = useState({
    presenceScore: 0,
    cahierScore: 0,
    homeworkScore: 0,
    behaviorScore: 0,
    gradesScore: 0,
  });
  const [recentTracking, setRecentTracking] = useState([]);
  const [pendingHomework, setPendingHomework] = useState([]);
  const [submittedHomework, setSubmittedHomework] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [isDocumentModalOpen, setIsDocumentModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tomorrow, setTomorrow] = useState(null);

  useEffect(() => {
    fetchDashboardData();
    fetchTomorrow();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      // Récupérer les statistiques de suivi
      const statsRes = await fetch(`${apiUrl}/api/students/me/tracking-stats`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const statsData = await statsRes.json();
      console.log('Données stats reçues:', statsData);

      // Récupérer l'historique récent
      const historyRes = await fetch(`${apiUrl}/api/students/me/tracking-history?limit=60`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const historyData = await historyRes.json();

      // Récupérer les devoirs
      const homeworkRes = await fetch(`${apiUrl}/api/students/me/homework`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const homeworkData = await homeworkRes.json();

      // Récupérer les documents pédagogiques
      const documentsRes = await fetch(`${apiUrl}/api/students/me/documents`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const documentsData = await documentsRes.json();
      console.log('Documents reçus:', documentsData);
      setDocuments(Array.isArray(documentsData) ? documentsData : []);

      // Filtrer les devoirs en attente (non soumis)
      const allHomework = Array.isArray(homeworkData) ? homeworkData : [];
      const pending = allHomework.filter(
        hw => !hw.homework_submissions || hw.homework_submissions.length === 0 || 
              (hw.homework_submissions[0] && hw.homework_submissions[0].status !== 'submitted')
      );
      const submitted = allHomework.filter(
        hw => hw.homework_submissions && hw.homework_submissions.length > 0 && 
              hw.homework_submissions[0].status === 'submitted'
      );
      setPendingHomework(pending.slice(0, 5)); // Afficher max 5 devoirs
      setSubmittedHomework(submitted.slice(0, 5)); // Afficher max 5 devoirs soumis
      const totalHomework = allHomework.length;
      const homeworkCompletionRate = totalHomework > 0 ? Math.round((submitted.length / totalHomework) * 100) : null;

      // Calculer le taux de présence
      const totalSessions = statsData.total_sessions || 1;
      const presentCount = statsData.present_count || 0;
      const attendanceRate = ((presentCount / totalSessions) * 100).toFixed(1);

      // Calculer le score de comportement (basé sur discipline/vigilance)
      const concentreCount = statsData.concentre_count || 0;
      const moyenCount = statsData.moyen_count || 0;
      const distraitCount = statsData.distrait_count || 0;
      const disciplineTotal = concentreCount + moyenCount + distraitCount;
      const behaviorScore = disciplineTotal > 0
        ? ((concentreCount * 100 + moyenCount * 50) / disciplineTotal).toFixed(0)
        : null;

      // Calculer la moyenne générale basée sur 5 critères :
      // 1. Présence (20%)
      // 2. Présence de cahier (20%)
      // 3. Écriture (20%)
      // 4. Vigilance (20%)
      // 5. Participation (20%)

      // 1. Score de présence
      const presenceScore = (presentCount / totalSessions) * 100;

      // 2. Score de présence de cahier
      const cahierPresentCount = statsData.cahier_present_count || 0;
      const cahierScore = (cahierPresentCount / totalSessions) * 100;

      // 3. Score d'écriture
      const writingCount = statsData.writing_count || 0;
      const writingScore = (writingCount / totalSessions) * 100;

      // 4. Score de vigilance (pondéré : concentré=100, moyen=50, distrait=0)
      const vigilanceScore = ((concentreCount * 100 + moyenCount * 50 + distraitCount * 0) / totalSessions);

      // 5. Score de participation (pondéré : excellent=100, bon=75, faible=50)
      const excellentParticipation = statsData.excellent_participation || 0;
      const goodParticipation = statsData.good_participation || 0;
      const faibleParticipation = statsData.faible_participation || 0;
      const participationScore = ((excellentParticipation * 100 + goodParticipation * 75 + faibleParticipation * 50) / totalSessions);

      // Moyenne finale (moyenne des 5 scores)
      const overallScore = (
        presenceScore * 0.20 +
        cahierScore * 0.20 +
        writingScore * 0.20 +
        vigilanceScore * 0.20 +
        participationScore * 0.20
      ).toFixed(1);

      console.log('Scores individuels:', {
        presenceScore,
        cahierScore,
        writingScore,
        vigilanceScore,
        participationScore,
        overallScore
      });

      setStats({
        attendanceRate,
        homeworkCompletionRate,
        averageGrade: overallScore,
        behaviorScore,
        totalSessions,
        hasDisciplineData: disciplineTotal > 0,
        hasHomeworkData: totalHomework > 0,
      });

      setScoreBreakdown({
        presenceScore: Number(presenceScore.toFixed(1)),
        cahierScore: Number(cahierScore.toFixed(1)),
        homeworkScore: homeworkCompletionRate !== null ? Number(homeworkCompletionRate.toFixed(1)) : null,
        behaviorScore: behaviorScore !== null ? Number(behaviorScore) : null,
        gradesScore: Number(overallScore),
      });

      setRecentTracking(Array.isArray(historyData) ? historyData : []);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTomorrow = async () => {
    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const res = await fetch(`${apiUrl}/api/students/me/tomorrow`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setTomorrow(data);
    } catch (error) {
      console.error('Error fetching tomorrow data:', error);
    }
  };

  const subjectsToday = useMemo(() => {
    const items = Array.isArray(recentTracking) ? recentTracking : [];
    const bySubject = {};

    const normalizeDisciplineScore = (value) => {
      const v = String(value || '').toLowerCase();
      if (!v) return 50;
      if (v.includes('concent') || v.includes('excellent')) return 100;
      if (v.includes('good') || v.includes('bon')) return 75;
      if (v.includes('moyen') || v.includes('average')) return 50;
      if (v.includes('distr') || v.includes('poor')) return 0;
      return 50;
    };

    const normalizeParticipationScore = (value) => {
      const v = String(value || '').toLowerCase();
      if (!v) return 50;
      if (v.includes('excellent')) return 100;
      if (v.includes('good') || v.includes('bon')) return 75;
      if (v.includes('faible')) return 50;
      return 50;
    };

    items.forEach((t) => {
      const subject = t?.subject_name || 'Sans matière';
      if (!bySubject[subject]) {
        bySubject[subject] = [];
      }
      bySubject[subject].push(t);
    });

    const toPct = (num) => {
      const n = Number(num);
      return Number.isFinite(n) ? n : 0;
    };

    const compute = (subject, sessions) => {
      const total = sessions.length || 1;
      const present = sessions.filter(s => s.presence === 'present').length;
      const cahier = sessions.filter(s => !!s.cahier_present).length;
      const writing = sessions.filter(s => !!s.writing).length;
      const homeworkValues = sessions.filter(s => s.homework !== null && s.homework !== undefined);
      const homeworkTracked = homeworkValues.length > 0;
      const homeworkDone = homeworkValues.filter(s => String(s.homework || '').toLowerCase().includes('done')).length;
      const phoneUse = sessions.filter(s => !!s.phone_use).length;

      const disciplineScore = sessions.reduce((acc, s) => acc + normalizeDisciplineScore(s.discipline), 0) / total;
      const participationScore = sessions.reduce((acc, s) => acc + normalizeParticipationScore(s.participation), 0) / total;

      const presenceScore = (present / total) * 100;
      const cahierScore = (cahier / total) * 100;
      const writingScore = (writing / total) * 100;
      const homeworkScore = homeworkTracked && homeworkValues.length > 0
        ? (homeworkDone / homeworkValues.length) * 100
        : null;
      const phoneRate = (phoneUse / total) * 100;

      const score = (
        presenceScore * 0.2 +
        cahierScore * 0.2 +
        writingScore * 0.2 +
        toPct(disciplineScore) * 0.2 +
        toPct(participationScore) * 0.2
      );

      const factors = [];
      if (presenceScore < 90) factors.push({ key: 'presence', label: 'Présence', level: presenceScore });
      if (cahierScore < 80) factors.push({ key: 'cahier', label: 'Cahier', level: cahierScore });
      if (writingScore < 70) factors.push({ key: 'writing', label: 'Écriture', level: writingScore });
      if (toPct(disciplineScore) < 70) factors.push({ key: 'vigilance', label: 'Vigilance', level: toPct(disciplineScore) });
      if (toPct(participationScore) < 70) factors.push({ key: 'participation', label: 'Participation', level: toPct(participationScore) });
      if (homeworkTracked && homeworkScore !== null && homeworkScore < 70) {
        factors.push({ key: 'homework', label: 'Devoirs', level: homeworkScore });
      }
      if (phoneRate > 10) factors.push({ key: 'phone', label: 'Téléphone', level: 100 - phoneRate });

      const worst = [
        { key: 'presence', label: 'Présence', value: presenceScore },
        { key: 'cahier', label: 'Cahier', value: cahierScore },
        { key: 'writing', label: 'Écriture', value: writingScore },
        { key: 'vigilance', label: 'Vigilance', value: toPct(disciplineScore) },
        { key: 'participation', label: 'Participation', value: toPct(participationScore) },
      ].reduce((min, cur) => (cur.value < min.value ? cur : min));

      let recommendation;
      switch (worst.key) {
        case 'presence':
          recommendation = 'Objectif: présence parfaite sur cette matière (arriver à l’heure).';
          break;
        case 'cahier':
          recommendation = 'Prends le cahier systématiquement et note le plan + les exercices.';
          break;
        case 'writing':
          recommendation = 'Écris au moins 5 lignes clés (définitions + exemples).';
          break;
        case 'vigilance':
          recommendation = 'Réduis les distractions (place calme, téléphone rangé).';
          break;
        case 'participation':
          recommendation = 'Pose 1 question / réponds 1 fois par séance.';
          break;
        default:
          recommendation = 'Concentre-toi sur une action simple à la prochaine séance.';
      }

      return {
        subject,
        totalSessions: sessions.length,
        score,
        presenceScore,
        cahierScore,
        writingScore,
        disciplineScore: toPct(disciplineScore),
        participationScore: toPct(participationScore),
        homeworkScore,
        homeworkTracked,
        phoneRate,
        factors,
        recommendation,
      };
    };

    const computed = Object.entries(bySubject).map(([subject, sessions]) => compute(subject, sessions));

    return computed
      .slice()
      .sort((a, b) => a.score - b.score);
  }, [recentTracking]);

  const downloadDocumentFile = async (doc) => {
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;

    const res = await fetch(`${apiUrl}/api/documents/${doc.id}/download`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error || `Erreur téléchargement (${res.status})`);
    }

    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = doc.file_name || `document-${doc.id}`;
    document.body.appendChild(a);
    a.click();
    a.remove();

    window.URL.revokeObjectURL(url);
  };

  const markDocumentAsViewed = async (documentId) => {
    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      await fetch(`${apiUrl}/api/students/me/documents/${documentId}/view`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      setDocuments(documents.map(doc =>
        doc.id === documentId ? { ...doc, viewed: true } : doc
      ));
    } catch (error) {
      console.error('Error marking document as viewed:', error);
    }
  };

  const markDocumentAsDownloaded = async (documentId) => {
    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      await fetch(`${apiUrl}/api/students/me/documents/${documentId}/download`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      setDocuments(documents.map(doc =>
        doc.id === documentId ? { ...doc, downloaded: true } : doc
      ));
    } catch (error) {
      console.error('Error marking document as downloaded:', error);
    }
  };

  const handleDocumentClick = (doc) => {
    setSelectedDocument(doc);
    setIsDocumentModalOpen(true);
  };

  const handleDownload = (e, doc) => {
    e.stopPropagation();
    markDocumentAsDownloaded(doc.id);
    downloadDocumentFile(doc).catch((error) => {
      console.error('Error downloading document:', error);
    });
  };

  if (loading) {
    return <div className="flex items-center justify-center h-screen">Chargement...</div>;
  }

  const asNumber = (value) => {
    const n = typeof value === 'string' ? Number(value) : value;
    return Number.isFinite(n) ? n : 0;
  };

  const getStatus = (value, thresholds, texts, accents) => {
    const n = asNumber(value);
    if (n >= thresholds.good) {
      return { text: texts.good, classes: accents.good };
    }
    if (n >= thresholds.warn) {
      return { text: texts.warn, classes: accents.warn };
    }
    return { text: texts.bad, classes: accents.bad };
  };

  const attendanceStatus = getStatus(
    stats.attendanceRate,
    { good: 90, warn: 75 },
    { good: '🟢 OK aujourd’hui', warn: '🟡 À améliorer', bad: '🔴 Attention' },
    {
      good: 'border-green-200 bg-green-50 text-green-800',
      warn: 'border-yellow-200 bg-yellow-50 text-yellow-800',
      bad: 'border-red-200 bg-red-50 text-red-800',
    }
  );

  const homeworkStatus = stats.homeworkCompletionRate === null
    ? { text: '— Pas de devoirs', classes: 'border-gray-200 bg-gray-50 text-gray-600' }
    : getStatus(
      stats.homeworkCompletionRate,
      { good: 90, warn: 70 },
      { good: '🟢 À jour', warn: '🟡 Presque', bad: '🔴 En retard' },
      {
        good: 'border-green-200 bg-green-50 text-green-800',
        warn: 'border-yellow-200 bg-yellow-50 text-yellow-800',
        bad: 'border-red-200 bg-red-50 text-red-800',
      }
    );

  const scoreStatus = getStatus(
    stats.averageGrade,
    { good: 75, warn: 60 },
    { good: '🟢 Bien', warn: '🟡 Peut mieux faire', bad: '🔴 À renforcer' },
    {
      good: 'border-green-200 bg-green-50 text-green-800',
      warn: 'border-yellow-200 bg-yellow-50 text-yellow-800',
      bad: 'border-red-200 bg-red-50 text-red-800',
    }
  );

  const behaviorStatus = stats.behaviorScore === null
    ? { text: '— Pas encore suivi', classes: 'border-gray-200 bg-gray-50 text-gray-600' }
    : getStatus(
      stats.behaviorScore,
      { good: 80, warn: 60 },
      { good: '🟢 OK', warn: '🟡 À surveiller', bad: '🔴 Attention' },
      {
        good: 'border-green-200 bg-green-50 text-green-800',
        warn: 'border-yellow-200 bg-yellow-50 text-yellow-800',
        bad: 'border-red-200 bg-red-50 text-red-800',
      }
    );

  const lastSession = recentTracking?.[0];
  const presencePill = lastSession?.presence === 'present'
    ? { text: '🟢 Présence', classes: 'bg-green-100 text-green-800' }
    : lastSession?.presence === 'absent'
      ? { text: '🔴 Présence', classes: 'bg-red-100 text-red-800' }
      : lastSession?.presence
        ? { text: '🟡 Présence', classes: 'bg-yellow-100 text-yellow-800' }
        : { text: '🟡 Présence', classes: 'bg-yellow-100 text-yellow-800' };

  const cahierPill = lastSession?.cahier_present
    ? { text: '🟢 Cahier', classes: 'bg-green-100 text-green-800' }
    : { text: '🟡 Cahier', classes: 'bg-yellow-100 text-yellow-800' };

  const homeworkValue = String(lastSession?.homework || '').toLowerCase();
  const homeworkPill = homeworkValue.includes('done')
    ? { text: '🟢 Devoir', classes: 'bg-green-100 text-green-800' }
    : homeworkValue
      ? { text: '🔴 Devoir', classes: 'bg-red-100 text-red-800' }
      : { text: '🟡 Devoir', classes: 'bg-yellow-100 text-yellow-800' };

  const phonePill = lastSession?.phone_use
    ? { text: '🔴 Téléphone', classes: 'bg-red-100 text-red-800' }
    : { text: '🟢 Téléphone', classes: 'bg-green-100 text-green-800' };

  const disciplineValue = String(lastSession?.discipline || '').toLowerCase();
  const vigilancePill = disciplineValue.includes('concent')
    ? { text: '🟢 Vigilance', classes: 'bg-green-100 text-green-800' }
    : disciplineValue.includes('distr')
      ? { text: '🔴 Vigilance', classes: 'bg-red-100 text-red-800' }
      : { text: '🟡 Vigilance', classes: 'bg-yellow-100 text-yellow-800' };

  const participationValue = String(lastSession?.participation || '').toLowerCase();
  const participationPill = participationValue.includes('excellent')
    ? { text: '🟢 Participation', classes: 'bg-green-100 text-green-800' }
    : participationValue
      ? { text: '🟡 Participation', classes: 'bg-yellow-100 text-yellow-800' }
      : { text: '🟡 Participation', classes: 'bg-yellow-100 text-yellow-800' };

  const scoreValue = Math.max(0, Math.min(100, asNumber(stats.averageGrade)));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">📅 Mon jour</h1>
        <p className="text-muted-foreground mt-2">Voici ton état aujourd’hui</p>
        <div className="flex flex-wrap gap-2 mt-4">
          <span className={`px-3 py-1 rounded-full text-xs font-medium ${presencePill.classes}`}>{presencePill.text}</span>
          <span className={`px-3 py-1 rounded-full text-xs font-medium ${cahierPill.classes}`}>{cahierPill.text}</span>
          <span className={`px-3 py-1 rounded-full text-xs font-medium ${homeworkPill.classes}`}>{homeworkPill.text}</span>
          <span className={`px-3 py-1 rounded-full text-xs font-medium ${phonePill.classes}`}>{phonePill.text}</span>
          <span className={`px-3 py-1 rounded-full text-xs font-medium ${vigilancePill.classes}`}>{vigilancePill.text}</span>
        </div>
      </div>

      {/* Carte Demain */}
      {tomorrow && tomorrow.sessions && tomorrow.sessions.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="border-indigo-200 bg-gradient-to-r from-indigo-50 to-blue-50">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-indigo-700 text-lg">
                    📅 Demain — {tomorrow.dayLabel} {tomorrow.date ? new Date(tomorrow.date + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }) : ''}
                  </CardTitle>
                  <CardDescription className="text-indigo-600/70">
                    {tomorrow.sessions.length} séance{tomorrow.sessions.length > 1 ? 's' : ''}
                  </CardDescription>
                </div>
                <Link to="/student/timetable" className="text-xs px-3 py-1.5 bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 transition-colors font-medium">
                  Voir emploi
                </Link>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Sessions timeline */}
              <div className="space-y-2">
                {tomorrow.sessions.map((s, i) => (
                  <div key={i} className="flex items-center gap-3 p-2.5 bg-white/70 rounded-lg border border-indigo-100">
                    <div className="text-center min-w-[50px]">
                      <p className="text-xs font-bold text-indigo-600">{s.startTime}</p>
                      <p className="text-[10px] text-indigo-400">{s.endTime}</p>
                    </div>
                    <div className="w-0.5 h-8 bg-indigo-300 rounded-full"></div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">{s.subject}</p>
                      <p className="text-xs text-gray-500">
                        {s.teacher || ''}
                        {s.room ? ` • ${s.room}` : ''}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Preparations */}
              {tomorrow.preparations && tomorrow.preparations.length > 0 && (
                <div className="pt-2 border-t border-indigo-100">
                  <p className="text-xs font-semibold text-indigo-700 mb-2">🎯 À préparer :</p>
                  <div className="space-y-1.5">
                    {tomorrow.preparations.map((p, i) => {
                      const priorityStyles = {
                        high: 'bg-red-50 border-red-200 text-red-700',
                        medium: 'bg-orange-50 border-orange-200 text-orange-700',
                        low: 'bg-blue-50 border-blue-200 text-blue-700'
                      };
                      const icons = { homework: '📝', document: '📄' };
                      return (
                        <div key={i} className={`flex items-center gap-2 p-2 rounded-lg border text-xs ${priorityStyles[p.priority] || priorityStyles.low}`}>
                          <span>{icons[p.type] || '📋'}</span>
                          <span className="font-medium">{p.subject}</span>
                          <span className="text-muted-foreground">—</span>
                          <span className="truncate">{p.title}</span>
                          {p.priority === 'high' && <span className="ml-auto text-[10px] font-bold">EN RETARD</span>}
                          {p.priority === 'medium' && <span className="ml-auto text-[10px] font-bold">À RENDRE</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Smart message */}
              {tomorrow.message && (
                <p className="text-xs text-indigo-600 font-medium pt-1">{tomorrow.message}</p>
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatusCard
          icon={Calendar}
          title="Présence"
          value={`${stats.attendanceRate}%`}
          statusText={attendanceStatus.text}
          accentClasses={attendanceStatus.classes}
        />
        <StatusCard
          icon={ClipboardList}
          title="Devoirs"
          value={stats.homeworkCompletionRate !== null ? `${stats.homeworkCompletionRate}%` : '—'}
          statusText={homeworkStatus.text}
          accentClasses={homeworkStatus.classes}
        />
        <StatusCard
          icon={TrendingUp}
          title="Score"
          value={`${stats.averageGrade}%`}
          statusText={scoreStatus.text}
          accentClasses={scoreStatus.classes}
        />
        <StatusCard
          icon={Award}
          title="Vigilance"
          value={stats.behaviorScore !== null ? `${stats.behaviorScore}%` : '—'}
          statusText={behaviorStatus.text}
          accentClasses={behaviorStatus.classes}
        />
      </div>

      <Card className="border-primary/20">
        <CardHeader>
          <CardTitle>🎯 Score scolaire</CardTitle>
          <CardDescription>Score du jour : {scoreValue.toFixed(0)}%</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="w-full h-3 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${scoreValue}%` }}
            />
          </div>
          <div className="grid grid-cols-5 gap-3 mt-5 text-center">
            <div className="flex flex-col items-center gap-1">
              <span className="text-lg">📅</span>
              <span className={`text-xs font-medium ${scoreBreakdown.presenceScore >= 75 ? 'text-green-600' : scoreBreakdown.presenceScore >= 60 ? 'text-yellow-600' : 'text-red-600'}`}>●</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <span className="text-lg">📘</span>
              <span className={`text-xs font-medium ${scoreBreakdown.cahierScore >= 75 ? 'text-green-600' : scoreBreakdown.cahierScore >= 60 ? 'text-yellow-600' : 'text-red-600'}`}>●</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <span className="text-lg">✏️</span>
              <span className={`text-xs font-medium ${scoreBreakdown.homeworkScore >= 75 ? 'text-green-600' : scoreBreakdown.homeworkScore >= 60 ? 'text-yellow-600' : 'text-red-600'}`}>●</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <span className="text-lg">🧠</span>
              <span className={`text-xs font-medium ${scoreBreakdown.behaviorScore >= 75 ? 'text-green-600' : scoreBreakdown.behaviorScore >= 60 ? 'text-yellow-600' : 'text-red-600'}`}>●</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <span className="text-lg">📝</span>
              <span className={`text-xs font-medium ${scoreBreakdown.gradesScore >= 75 ? 'text-green-600' : scoreBreakdown.gradesScore >= 60 ? 'text-yellow-600' : 'text-red-600'}`}>●</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>📚 Par matière</CardTitle>
          <CardDescription>Ce qui baisse ton score, matière par matière</CardDescription>
        </CardHeader>
        <CardContent>
          {subjectsToday.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune donnée par matière pour le moment.</p>
          ) : (
            <div className="space-y-4">
              {subjectsToday.map((s) => {
                const score = Math.max(0, Math.min(100, Number.isFinite(s.score) ? s.score : 0));
                const scoreColor = score >= 75 ? 'text-green-700' : score >= 60 ? 'text-yellow-700' : 'text-red-700';
                return (
                  <div key={s.subject} className="p-4 rounded-lg border bg-white">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">{s.subject}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {s.totalSessions} séance(s) analysée(s)
                        </p>
                        <div className="flex flex-wrap gap-2 mt-3">
                          {s.factors.length === 0 ? (
                            <span className="text-xs px-2 py-1 bg-green-100 text-green-800 rounded-full font-medium">🟢 Rien d’inquiétant</span>
                          ) : (
                            s.factors.slice(0, 6).map((f) => (
                              <span key={f.key} className="text-xs px-2 py-1 bg-red-100 text-red-800 rounded-full font-medium">
                                🔻 {f.label}
                              </span>
                            ))
                          )}
                        </div>
                        <div className="mt-3 p-3 rounded-lg bg-muted">
                          <p className="text-xs font-medium">Recommandation</p>
                          <p className="text-sm mt-1">{s.recommendation}</p>
                        </div>
                      </div>
                      <div className={`text-lg font-bold ${scoreColor}`}>{score.toFixed(0)}%</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {documents.length > 0 && (
          <Card className="border-blue-200 bg-blue-50">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-blue-700">📂 Documents</CardTitle>
                  <CardDescription>
                    {documents.filter(d => !d.viewed).length > 0 && (
                      <span className="text-orange-600 font-medium">
                        {documents.filter(d => !d.viewed).length} nouveau(x) document(s)
                      </span>
                    )}
                  </CardDescription>
                </div>
                {documents.filter(d => !d.viewed).length > 0 && (
                  <div className="flex items-center gap-2 px-3 py-1 bg-orange-100 text-orange-700 rounded-full text-sm font-medium">
                    <AlertCircle className="w-4 h-4" />
                    Nouveau
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {documents.slice(0, 5).map((doc) => {
                  const typeIcons = {
                    cours: '📖',
                    exercice: '✏️',
                    devoir: '📝',
                    rattrapage: '🔄',
                    approfondissement: '📚'
                  };

                  const estimatedMinutes =
                    doc.document_type === 'approfondissement' ? 25 :
                    doc.document_type === 'devoir' ? 20 :
                    doc.document_type === 'cours' ? 15 :
                    doc.document_type === 'rattrapage' ? 15 :
                    doc.document_type === 'exercice' ? 10 :
                    10;

                  const impactScore =
                    doc.document_type === 'approfondissement' ? 5 :
                    doc.document_type === 'devoir' ? 4 :
                    doc.document_type === 'cours' ? 3 :
                    doc.document_type === 'rattrapage' ? 3 :
                    doc.document_type === 'exercice' ? 2 :
                    1;

                  return (
                    <div
                      key={doc.id}
                      onClick={() => handleDocumentClick(doc)}
                      className={`p-3 rounded-lg border cursor-pointer transition-all hover:shadow-md ${
                        !doc.viewed
                          ? 'bg-white border-orange-300 hover:border-orange-400'
                          : 'bg-white border-gray-200 hover:border-blue-300'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3 flex-1">
                          <span className="text-2xl">{typeIcons[doc.document_type] || '📄'}</span>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-semibold text-gray-900">{doc.title}</p>
                              {!doc.viewed && (
                                <span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-xs rounded-full font-medium">
                                  Nouveau
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-gray-600 mt-1">
                              {doc.subjects?.name || 'Matière non spécifiée'} • {doc.classes?.name || ''}
                            </p>
                            {doc.description && (
                              <p className="text-xs text-gray-500 mt-1 line-clamp-2">{doc.description}</p>
                            )}
                            <div className="flex items-center gap-4 mt-2 text-xs font-medium text-gray-700">
                              <span>⏱️ {estimatedMinutes} min</span>
                              <span>🎯 +{impactScore}%</span>
                            </div>
                            <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                              <span>📅 {new Date(doc.created_at).toLocaleDateString('fr-FR')}</span>
                              {doc.viewed && (
                                <span className="flex items-center gap-1 text-green-600">
                                  <Eye className="w-3 h-3" /> Vu
                                </span>
                              )}
                              {doc.downloaded && (
                                <span className="flex items-center gap-1 text-blue-600">
                                  <Download className="w-3 h-3" /> Téléchargé
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={(e) => handleDownload(e, doc)}
                          className="p-2 hover:bg-blue-100 rounded-lg transition-colors"
                          title="Télécharger"
                        >
                          <Download className="w-5 h-5 text-blue-600" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {submittedHomework && submittedHomework.length > 0 && (
          <Card className="border-green-200 bg-green-50">
            <CardHeader>
              <CardTitle className="text-green-700">🎉 Impact positif aujourd’hui</CardTitle>
              <CardDescription>
                <span className="font-medium">+5% score scolaire</span>
                <span className="mx-2">•</span>
                <span className="font-medium">+1 badge en cours</span>
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {submittedHomework.map((hw) => {
                  const submissionDate = hw.homework_submissions?.[0]?.submission_date;
                  const formattedDate = submissionDate
                    ? new Date(submissionDate).toLocaleDateString('fr-FR')
                    : 'date inconnue';

                  return (
                    <div key={hw.id} className="p-2 bg-white rounded border border-green-200">
                      <p className="text-sm font-medium text-green-700">✓ {hw.title}</p>
                      <p className="text-xs text-gray-600">Soumis le {formattedDate}</p>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Devoirs en attente</CardTitle>
            <CardDescription>À rendre bientôt</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {pendingHomework.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun devoir en attente</p>
              ) : (
                pendingHomework.map((hw) => {
                  const isOverdue = new Date(hw.due_date) < new Date();
                  const typeIcons = {
                    exercice: '📝',
                    revision: '📚',
                    projet: '🎯',
                    recherche: '🔍',
                    presentation: '🎤'
                  };
                  
                  return (
                    <Link
                      key={hw.id}
                      to="/my-assignments"
                      className={`block p-3 border rounded-lg transition-colors ${
                        isOverdue ? 'border-red-200 bg-red-50 hover:bg-red-100' : 'border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-2">
                          <span className="text-xl">{typeIcons[hw.type] || '📄'}</span>
                          <div>
                            <p className="text-sm font-medium text-gray-900">{hw.title}</p>
                            <p className="text-xs text-gray-600 mt-1">
                              Date limite: {new Date(hw.due_date).toLocaleDateString('fr-FR', {
                                day: 'numeric',
                                month: 'short'
                              })}
                            </p>
                          </div>
                        </div>
                        {isOverdue && (
                          <span className="text-xs px-2 py-1 bg-red-100 text-red-700 rounded">
                            En retard
                          </span>
                        )}
                      </div>
                    </Link>
                  );
                })
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Historique récent</CardTitle>
            <CardDescription>10 dernières séances</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentTracking.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun suivi enregistré</p>
              ) : (
                recentTracking.map((tracking, idx) => (
                  <div key={idx} className="p-3 border border-gray-200 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-medium text-gray-900">{tracking.session_date}</p>
                      <p className={`text-sm font-medium ${
                        tracking.presence === 'present' ? 'text-green-600' :
                        tracking.presence === 'absent' ? 'text-red-600' :
                        'text-yellow-600'
                      }`}>
                        {tracking.presence === 'present' ? 'Présent' :
                         tracking.presence === 'absent' ? 'Absent' :
                         'Retard'}
                      </p>
                    </div>
                    <div className="grid grid-cols-3 gap-3 text-xs">
                      <div>
                        <p className="text-gray-600">Participation</p>
                        <p className="font-medium text-gray-900 capitalize">{tracking.participation || '—'}</p>
                      </div>
                      <div>
                        <p className="text-gray-600">Vigilance</p>
                        <p className="font-medium text-gray-900 capitalize">{tracking.discipline || '—'}</p>
                      </div>
                      <div>
                        <p className="text-gray-600">Écriture</p>
                        <p className="font-medium text-gray-900">{tracking.writing ? '✓' : '○'}</p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Assistant IA Personnel</CardTitle>
            <CardDescription>Conseils et aide personnalisée</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="p-4 bg-primary/10 rounded-lg">
                <p className="text-sm font-medium mb-2">💡 Conseil du jour</p>
                <p className="text-sm text-muted-foreground">
                  Planifie 30 minutes de révision chaque jour pour améliorer tes résultats en mathématiques.
                </p>
              </div>
              <div className="p-4 bg-green-500/10 rounded-lg">
                <p className="text-sm font-medium mb-2">🎯 Objectif de la semaine</p>
                <p className="text-sm text-muted-foreground">
                  Rendre tous tes devoirs à temps et participer activement en classe.
                </p>
              </div>
              <button className="w-full p-3 bg-accent hover:bg-accent/80 rounded-lg text-sm font-medium transition-colors">
                Demander de l'aide à l'IA
              </button>
            </div>
          </CardContent>
        </Card>
      </div>

      {stats.totalSessions > 0 && stats.attendanceRate < 80 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Card className="border-orange-500">
            <CardContent className="p-6">
              <div className="flex items-start gap-4">
                <AlertCircle className="w-6 h-6 text-orange-500 mt-1" />
                <div>
                  <h3 className="font-semibold text-lg mb-2">Attention à ton assiduité</h3>
                  <p className="text-sm text-muted-foreground">
                    Ton taux de présence est en dessous de 80%. Essaie d'être plus régulier pour ne pas prendre de retard dans tes cours.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      <DocumentViewerModal
        document={selectedDocument}
        isOpen={isDocumentModalOpen}
        onClose={() => setIsDocumentModalOpen(false)}
        onView={markDocumentAsViewed}
        onDownload={(doc) => {
          if (!doc) return;
          markDocumentAsDownloaded(doc.id);
          downloadDocumentFile(doc).catch((error) => {
            console.error('Error downloading document:', error);
          });
        }}
      />
    </div>
  );
};

export default StudentDashboard;
