import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/Card';
import { supabase } from '../../lib/supabase';

const categoryColors = {
  presence: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', bar: 'bg-blue-500', label: 'Présence' },
  homework: { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700', bar: 'bg-purple-500', label: 'Devoirs' },
  participation: { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', bar: 'bg-orange-500', label: 'Participation' },
  vigilance: { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700', bar: 'bg-green-500', label: 'Vigilance' },
  cahier: { bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-700', bar: 'bg-yellow-500', label: 'Cahier & Écriture' },
  global: { bg: 'bg-pink-50', border: 'border-pink-200', text: 'text-pink-700', bar: 'bg-pink-500', label: 'Global' },
};

const BadgeCard = ({ badge, earned = false }) => {
  const colors = categoryColors[badge.category] || categoryColors.global;

  return (
    <div
      className={`relative p-4 rounded-xl border-2 ${earned ? `${colors.border} ${colors.bg}` : 'border-gray-200 bg-white'} transition-all hover:shadow-md`}
    >
      {earned && (
        <div className="absolute -top-2 -right-2 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center text-white text-xs font-bold shadow">
          ✓
        </div>
      )}
      <div className="flex items-start gap-3">
        <div className={`text-3xl ${earned ? '' : 'grayscale opacity-60'}`}>
          {badge.emoji}
        </div>
        <div className="flex-1 min-w-0">
          <p className={`font-semibold text-sm ${earned ? colors.text : 'text-gray-700'}`}>{badge.name}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{badge.desc}</p>
          {!earned && (
            <div className="mt-2">
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-muted-foreground">{badge.progress}/{badge.target}</span>
                <span className={`font-medium ${badge.pct >= 75 ? 'text-green-600' : badge.pct >= 50 ? 'text-yellow-600' : 'text-gray-500'}`}>{badge.pct}%</span>
              </div>
              <div className="w-full h-2 rounded-full bg-gray-200 overflow-hidden">
                <div
                  style={{ width: `${badge.pct}%` }}
                  className={`h-full rounded-full ${colors.bar}`}
                />
              </div>
            </div>
          )}
          <span className={`inline-block mt-1.5 text-[10px] font-medium px-1.5 py-0.5 rounded ${colors.bg} ${colors.text}`}>
            {colors.label}
          </span>
        </div>
      </div>
    </div>
  );
};

const StudentBadges = () => {
  const [badges, setBadges] = useState({ earned: [], inProgress: [], totalSessions: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchBadges();
  }, []);

  const fetchBadges = async () => {
    try {
      setError('');
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const res = await fetch(`${apiUrl}/api/students/me/badges`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Impossible de charger tes badges.');
      setBadges({
        earned: Array.isArray(data?.earned) ? data.earned : [],
        inProgress: Array.isArray(data?.inProgress) ? data.inProgress : [],
        totalSessions: Number(data?.totalSessions || 0),
      });
    } catch (error) {
      console.error('Error fetching badges:', error);
      setError(error?.message || 'Impossible de charger tes badges.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-muted-foreground">Chargement des badges...</div>;
  }

  if (error) {
    return (
      <Card className="mx-auto max-w-xl border-red-200 bg-red-50">
        <CardContent className="space-y-3 p-6 text-center">
          <p className="font-semibold text-red-800">Impossible de charger tes badges</p>
          <p className="text-sm text-red-700">{error}</p>
          <button type="button" onClick={fetchBadges} className="rounded-xl bg-red-700 px-4 py-2 text-sm font-semibold text-white">Réessayer</button>
        </CardContent>
      </Card>
    );
  }

  if (badges.totalSessions === 0) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Mes badges</h1>
          <p className="mt-1 text-sm text-muted-foreground">Des encouragements basés sur tes efforts réels</p>
        </div>
        <Card className="border-dashed">
          <CardContent className="p-8 text-center">
            <div className="text-5xl">🚀</div>
            <h2 className="mt-4 text-lg font-semibold">Tes premiers badges arriveront bientôt</h2>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
              Dès qu’une séance sera enregistrée, ta présence, ta participation et ton travail feront progresser tes badges.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Mes badges</h1>
        <p className="text-muted-foreground mt-2">
          {badges.totalSessions > 0
            ? `${badges.earned.length} badge${badges.earned.length > 1 ? 's' : ''} gagné${badges.earned.length > 1 ? 's' : ''} sur ${badges.totalSessions} séance${badges.totalSessions > 1 ? 's' : ''}`
            : 'Commence à assister aux séances pour débloquer des badges !'
          }
        </p>
      </div>

      {/* Résumé rapide */}
      {badges.earned.length > 0 && (
        <div
          className="flex items-center gap-3 p-4 bg-gradient-to-r from-yellow-50 to-orange-50 border border-yellow-200 rounded-xl"
        >
          <div className="text-4xl">🏆</div>
          <div>
            <p className="font-bold text-yellow-800">{badges.earned.length} badge{badges.earned.length > 1 ? 's' : ''} débloqué{badges.earned.length > 1 ? 's' : ''} !</p>
            <p className="text-sm text-yellow-700">
              {badges.inProgress.length > 0
                ? `${badges.inProgress.length} en cours — continue comme ça !`
                : 'Tu as tout débloqué, bravo !'
              }
            </p>
          </div>
        </div>
      )}

      {/* Badges en cours */}
      {badges.inProgress.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>🔥 En cours</CardTitle>
            <CardDescription>Continue, tu es proche du prochain badge</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {badges.inProgress.map((badge) => (
                <BadgeCard key={badge.id} badge={badge} earned={false} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Badges gagnés */}
      <Card>
        <CardHeader>
          <CardTitle>🏆 Déjà gagnés</CardTitle>
          <CardDescription>
            {badges.earned.length > 0
              ? 'On les garde visibles, ça motive'
              : 'Aucun badge pour le moment — assiste aux cours et participe pour en gagner !'
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          {badges.earned.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {badges.earned.map((badge) => (
                <BadgeCard key={badge.id} badge={badge} earned={true} />
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="text-5xl mb-3">🎯</div>
              <p className="text-muted-foreground text-sm">
                Sois présent, participe, rends tes devoirs et les badges viendront !
              </p>
            </div>
          )}
        </CardContent>
      </Card>

    </div>
  );
};

export default StudentBadges;
