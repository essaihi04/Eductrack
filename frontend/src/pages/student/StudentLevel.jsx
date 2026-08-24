import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/Card';
import { supabase } from '../../lib/supabase';

const StudentLevel = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState(null);
  const [history, setHistory] = useState([]);
  const [classRanking, setClassRanking] = useState(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setLoading(true);
        setError(null);

        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;

        const [statsRes, historyRes, rankingRes] = await Promise.all([
          fetch(`${apiUrl}/api/students/me/tracking-stats`, {
            headers: { Authorization: `Bearer ${token}` }
          }),
          fetch(`${apiUrl}/api/students/me/tracking-history?limit=200`, {
            headers: { Authorization: `Bearer ${token}` }
          }),
          fetch(`${apiUrl}/api/students/me/class-ranking`, {
            headers: { Authorization: `Bearer ${token}` }
          })
        ]);

        const data = await statsRes.json().catch(() => ({}));
        if (!statsRes.ok) {
          throw new Error(data?.error || `Erreur (${statsRes.status})`);
        }

        const historyData = await historyRes.json().catch(() => ([]));
        if (!historyRes.ok) {
          throw new Error(historyData?.error || `Erreur (${historyRes.status})`);
        }

        const rankingData = await rankingRes.json().catch(() => null);
        setClassRanking(rankingData);

        setStats(data);
        setHistory(Array.isArray(historyData) ? historyData : []);
      } catch (e) {
        setError(e?.message || 'Erreur inconnue');
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  const computed = useMemo(() => {
    const total = Number(stats?.total_sessions || 0);
    if (!total) {
      return {
        total: 0,
        overallScore: 0,
        presenceScore: 0,
        cahierScore: 0,
        writingScore: 0,
        vigilanceScore: 0,
        participationScore: 0,
        nextKey: 'presence',
      };
    }

    const presenceScore = (Number(stats?.present_count || 0) / total) * 100;
    const cahierScore = (Number(stats?.cahier_present_count || 0) / total) * 100;
    const writingScore = (Number(stats?.writing_count || 0) / total) * 100;

    const vigilanceScore = (
      (Number(stats?.concentre_count || 0) * 100 +
        Number(stats?.moyen_count || 0) * 50 +
        Number(stats?.distrait_count || 0) * 0) /
      total
    );

    const participationScore = (
      (Number(stats?.excellent_participation || 0) * 100 +
        Number(stats?.good_participation || 0) * 75 +
        Number(stats?.faible_participation || 0) * 50) /
      total
    );

    const overallScore = (
      presenceScore * 0.2 +
      cahierScore * 0.2 +
      writingScore * 0.2 +
      vigilanceScore * 0.2 +
      participationScore * 0.2
    );

    const parts = [
      { key: 'presence', label: 'Présence', value: presenceScore },
      { key: 'cahier', label: 'Cahier', value: cahierScore },
      { key: 'writing', label: 'Écriture', value: writingScore },
      { key: 'vigilance', label: 'Vigilance', value: vigilanceScore },
      { key: 'participation', label: 'Participation', value: participationScore },
    ];

    const nextKey = parts.reduce((min, cur) => (cur.value < min.value ? cur : min), parts[0])?.key;

    return {
      total,
      overallScore,
      presenceScore,
      cahierScore,
      writingScore,
      vigilanceScore,
      participationScore,
      nextKey,
    };
  }, [stats]);

  const nextActionText = useMemo(() => {
    switch (computed.nextKey) {
      case 'presence':
        return 'Arrive à l’heure et vise une présence parfaite cette semaine.';
      case 'cahier':
        return 'Pense au cahier à chaque séance (objectif: 100%).';
      case 'writing':
        return 'Écris l’essentiel pendant le cours (même 5 lignes).';
      case 'vigilance':
        return 'Choisis une place sans distractions pour rester concentré.';
      case 'participation':
        return 'Interviens au moins 1 fois par cours (une question suffit).';
      default:
        return 'Fais une action simple aujourd’hui pour monter.';
    }
  }, [computed.nextKey]);

  const scoreValue = Math.max(0, Math.min(100, Number.isFinite(computed.overallScore) ? computed.overallScore : 0));

  const bySubject = useMemo(() => {
    const items = Array.isArray(history) ? history : [];
    const grouped = {};

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
      if (!grouped[subject]) grouped[subject] = [];
      grouped[subject].push(t);
    });

    const compute = (subject, sessions) => {
      const total = sessions.length || 1;
      const present = sessions.filter(s => s.presence === 'present').length;
      const cahier = sessions.filter(s => !!s.cahier_present).length;
      const writing = sessions.filter(s => !!s.writing).length;

      const disciplineScore = sessions.reduce((acc, s) => acc + normalizeDisciplineScore(s.discipline), 0) / total;
      const participationScore = sessions.reduce((acc, s) => acc + normalizeParticipationScore(s.participation), 0) / total;

      const presenceScore = (present / total) * 100;
      const cahierScore = (cahier / total) * 100;
      const writingScore = (writing / total) * 100;

      const score = (
        presenceScore * 0.2 +
        cahierScore * 0.2 +
        writingScore * 0.2 +
        disciplineScore * 0.2 +
        participationScore * 0.2
      );

      const worst = [
        { key: 'presence', value: presenceScore },
        { key: 'cahier', value: cahierScore },
        { key: 'writing', value: writingScore },
        { key: 'vigilance', value: disciplineScore },
        { key: 'participation', value: participationScore },
      ].reduce((min, cur) => (cur.value < min.value ? cur : min));

      let action;
      switch (worst.key) {
        case 'presence':
          action = 'Arrive à l’heure et vise 100% de présence.';
          break;
        case 'cahier':
          action = 'Cahier prêt + notes organisées à chaque séance.';
          break;
        case 'writing':
          action = 'Écris l’essentiel (définitions + exemples).';
          break;
        case 'vigilance':
          action = 'Reste concentré (téléphone rangé, place calme).';
          break;
        case 'participation':
          action = 'Participe au moins une fois par séance.';
          break;
        default:
          action = 'Une action simple à la prochaine séance.';
      }

      return {
        subject,
        totalSessions: sessions.length,
        score,
        action
      };
    };

    return Object.entries(grouped)
      .map(([subject, sessions]) => compute(subject, sessions))
      .filter((x) => x.totalSessions > 0)
      .sort((a, b) => a.score - b.score);
  }, [history]);

  if (loading) {
    return <div className="flex items-center justify-center h-screen">Chargement...</div>;
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">🎯 Mon niveau</h1>
          <p className="text-muted-foreground mt-2">Ton niveau, en un coup d’œil</p>
        </div>
        <Card className="border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="text-red-700">🔴 Impossible de charger</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (!computed.total) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Ma progression</h1>
          <p className="mt-1 text-sm text-muted-foreground">Comprendre mes efforts sans fausse alerte</p>
        </div>
        <Card className="border-dashed">
          <CardContent className="p-7 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-100 text-2xl">📈</div>
            <h2 className="mt-4 text-lg font-semibold">Les indicateurs arrivent après les premières séances</h2>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
              Aucune séance n’est encore enregistrée. Un score à 0 % serait trompeur : pour le moment, il n’y a simplement pas assez de données.
            </p>
            <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
              <Link to="/my-grades" className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
                Voir mes notes
              </Link>
              <Link to="/student/badges" className="rounded-xl border px-4 py-2 text-sm font-semibold hover:bg-accent">
                Voir mes badges
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">🎯 Mon niveau</h1>
        <p className="text-muted-foreground mt-2">Ton niveau, en un coup d’œil</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>📈 Progression</CardTitle>
          <CardDescription>{computed.total ? `Basé sur ${computed.total} séance(s)` : 'Pas assez de données pour le moment'}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-medium">Score global</div>
            <div className="text-sm font-semibold">{scoreValue.toFixed(0)}%</div>
          </div>
          <div className="w-full h-3 rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-primary transition-all" style={{ width: `${scoreValue}%` }} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
            {[
              { label: '📅 Présence', value: computed.presenceScore },
              { label: '📘 Cahier', value: computed.cahierScore },
              { label: '✏️ Écriture', value: computed.writingScore },
              { label: '🧠 Vigilance', value: computed.vigilanceScore },
              { label: '🙋 Participation', value: computed.participationScore },
            ].map((m) => {
              const v = Math.max(0, Math.min(100, Number.isFinite(m.value) ? m.value : 0));
              const color = v >= 75 ? 'bg-green-500' : v >= 60 ? 'bg-yellow-500' : 'bg-red-500';
              return (
                <div key={m.label} className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{m.label}</span>
                    <span className="text-muted-foreground">{v.toFixed(0)}%</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                    <div className={`h-full ${color}`} style={{ width: `${v}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Classement de la classe */}
      {classRanking && classRanking.rank && (
        <>
          <Card className="border-indigo-200 bg-gradient-to-r from-indigo-50 to-blue-50">
            <CardHeader>
              <CardTitle>🏫 Classement de ta classe</CardTitle>
              <CardDescription>
                {classRanking.myClass?.className} parmi {classRanking.totalClasses} classe{classRanking.totalClasses > 1 ? 's' : ''}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-6 mb-6">
                <div
                  className={`w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold shadow-lg ${
                    classRanking.rank === 1 ? 'bg-yellow-400 text-yellow-900' :
                    classRanking.rank === 2 ? 'bg-gray-300 text-gray-800' :
                    classRanking.rank === 3 ? 'bg-orange-300 text-orange-900' :
                    'bg-blue-100 text-blue-800'
                  }`}
                >
                  {classRanking.rank === 1 ? '🥇' : classRanking.rank === 2 ? '🥈' : classRanking.rank === 3 ? '🥉' : `${classRanking.rank}e`}
                </div>
                <div>
                  <p className="text-2xl font-bold text-indigo-800">
                    {classRanking.rank}{classRanking.rank === 1 ? 'er' : 'e'} / {classRanking.totalClasses}
                  </p>
                  <p className="text-sm text-indigo-600">Score : {classRanking.myClass?.score}%</p>
                </div>
              </div>

              {/* Tableau de classement */}
              <div className="space-y-2">
                {classRanking.ranking.map((cls, i) => {
                  const isMyClass = cls.classId === classRanking.myClass?.classId;
                  return (
                    <div
                      key={cls.classId}
                      className={`flex items-center gap-3 p-2.5 rounded-lg border ${
                        isMyClass ? 'border-indigo-400 bg-indigo-100 shadow-sm' : 'border-gray-200 bg-white'
                      }`}
                    >
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                        i === 0 ? 'bg-yellow-400 text-yellow-900' :
                        i === 1 ? 'bg-gray-300 text-gray-800' :
                        i === 2 ? 'bg-orange-300 text-orange-900' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium truncate ${isMyClass ? 'text-indigo-800' : 'text-gray-800'}`}>
                          {cls.className} {isMyClass && '(ta classe)'}
                        </p>
                        <p className="text-xs text-muted-foreground">{cls.total} suivis</p>
                      </div>
                      <div className={`text-sm font-bold ${
                        cls.score >= 75 ? 'text-green-600' : cls.score >= 60 ? 'text-yellow-600' : 'text-red-600'
                      }`}>
                        {cls.score}%
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Forces et faiblesses de la classe */}
          {(classRanking.strengths.length > 0 || classRanking.weaknesses.length > 0) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {classRanking.strengths.length > 0 && (
                <Card className="border-green-200">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base text-green-700">💪 Points forts de ta classe</CardTitle>
                    <CardDescription>Ce qui vous a fait gagner des places</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {classRanking.strengths.map(s => (
                        <div key={s.key} className="flex items-center justify-between p-2 rounded-lg bg-green-50">
                          <span className="text-sm font-medium">{s.emoji} {s.label}</span>
                          <span className="text-xs font-bold text-green-700">+{s.diff}% vs moyenne</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
              {classRanking.weaknesses.length > 0 && (
                <Card className="border-red-200">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base text-red-700">📉 À améliorer</CardTitle>
                    <CardDescription>Ce qui freine votre classement</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {classRanking.weaknesses.map(w => (
                        <div key={w.key} className="flex items-center justify-between p-2 rounded-lg bg-red-50">
                          <span className="text-sm font-medium">{w.emoji} {w.label}</span>
                          <span className="text-xs font-bold text-red-700">{w.diff}% vs moyenne</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* Conseils */}
          {classRanking.tips.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>💡 Conseils pour ta classe</CardTitle>
                <CardDescription>Ce que tu peux faire pour aider ta classe</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {classRanking.tips.map((tip, i) => (
                    <div key={i} className={`p-3 rounded-lg text-sm font-medium ${
                      tip.type === 'champion' ? 'bg-yellow-50 text-yellow-800 border border-yellow-200' :
                      tip.type === 'podium' ? 'bg-blue-50 text-blue-800 border border-blue-200' :
                      tip.type === 'keep' ? 'bg-green-50 text-green-800 border border-green-200' :
                      'bg-orange-50 text-orange-800 border border-orange-200'
                    }`}>
                      {tip.type === 'champion' && '🏆 '}
                      {tip.type === 'podium' && '🎯 '}
                      {tip.type === 'keep' && '✅ '}
                      {tip.type === 'improve' && '⚠️ '}
                      {tip.text}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      <Card>
        <CardHeader>
          <CardTitle>✅ Prochaine action</CardTitle>
          <CardDescription>1 action simple pour monter</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="p-4 rounded-lg bg-muted">
            <p className="text-sm font-medium">{nextActionText}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>📚 Matières à renforcer</CardTitle>
          <CardDescription>Les matières où tu peux gagner le plus vite</CardDescription>
        </CardHeader>
        <CardContent>
          {bySubject.length === 0 ? (
            <p className="text-sm text-muted-foreground">Pas assez de données par matière pour le moment.</p>
          ) : (
            <div className="space-y-3">
              {bySubject.slice(0, 3).map((s) => {
                const score = Math.max(0, Math.min(100, Number.isFinite(s.score) ? s.score : 0));
                const color = score >= 75 ? 'text-green-700' : score >= 60 ? 'text-yellow-700' : 'text-red-700';
                return (
                  <div key={s.subject} className="p-3 rounded-lg border bg-white">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">{s.subject}</p>
                        <p className="text-xs text-muted-foreground mt-1">{s.totalSessions} séance(s)</p>
                        <p className="text-sm mt-2">{s.action}</p>
                      </div>
                      <div className={`text-base font-bold ${color}`}>{score.toFixed(0)}%</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default StudentLevel;
