import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/Card';
import { supabase } from '../../lib/supabase';

const StudentGrades = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [homework, setHomework] = useState([]);
  const [controlGrades, setControlGrades] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;

        const [hwRes, cgRes] = await Promise.all([
          fetch(`${apiUrl}/api/students/me/homework`, {
            cache: 'no-store',
            headers: {
              Authorization: `Bearer ${token}`,
              'Cache-Control': 'no-cache'
            }
          }),
          fetch(`${apiUrl}/api/students/me/control-grades`, {
            cache: 'no-store',
            headers: {
              Authorization: `Bearer ${token}`,
              'Cache-Control': 'no-cache'
            }
          })
        ]);

        const hwData = await hwRes.json().catch(() => ([]));
        if (!hwRes.ok) {
          throw new Error(hwData?.error || `Erreur devoirs (${hwRes.status})`);
        }

        const cgData = await cgRes.json().catch(() => ([]));
        if (!cgRes.ok) {
          throw new Error(cgData?.error || `Erreur contrôles (${cgRes.status})`);
        }

        setHomework(Array.isArray(hwData) ? hwData : []);
        setControlGrades(Array.isArray(cgData) ? cgData : []);
      } catch (e) {
        setError(e?.message || 'Erreur inconnue');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const allGrades = useMemo(() => {
    const hwGrades = (homework || [])
      .map((hw) => {
        const submission = hw?.homework_submissions?.[0];
        const grade = submission?.grade;
        const numeric = typeof grade === 'number' ? grade : grade != null ? Number(grade) : null;
        return {
          id: hw.id,
          type: 'homework',
          title: hw.title,
          subject: hw?.subjects?.name || hw?.subject?.name || hw?.subject_name || 'Sans matière',
          grade: Number.isFinite(numeric) ? numeric : null,
          feedback: submission?.feedback || null,
          status: submission?.status || null,
          dueDate: hw?.due_date || null,
          submittedAt: submission?.submission_date || null,
        };
      })
      .filter((x) => x.grade !== null);

    const ctrlGrades = (controlGrades || [])
      .map((cg) => ({
        id: cg.id,
        type: 'control',
        title: cg.control_name || 'Contrôle',
        subject: cg.subject_name || 'Sans matière',
        grade: typeof cg.note === 'number' ? cg.note : cg.note != null ? Number(cg.note) : null,
        feedback: cg.appreciation || null,
        status: null,
        dueDate: cg.control_date || null,
        submittedAt: cg.control_date || cg.created_at || null,
      }))


    return [...hwGrades, ...ctrlGrades];
  }, [homework, controlGrades]);

  const summary = useMemo(() => {
    const gradedOnly = allGrades.filter((g) => g.grade !== null);
    if (!gradedOnly.length) {
      return { average: null, count: 0 };
    }
    const sum = gradedOnly.reduce((acc, g) => acc + g.grade, 0);
    return { average: sum / gradedOnly.length, count: gradedOnly.length };
  }, [allGrades]);

  const gradesBySubject = useMemo(() => {
    const grouped = {};
    allGrades.forEach((g) => {
      const subject = g.subject || 'Sans matière';
      if (!grouped[subject]) {
        grouped[subject] = [];
      }
      grouped[subject].push(g);
    });
    return grouped;
  }, [allGrades]);

  if (loading) {
    return <div className="flex items-center justify-center h-screen">Chargement...</div>;
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Mes résultats</h1>
          <p className="text-muted-foreground mt-2">Tes notes, lisibles en 5 secondes</p>
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

  if (allGrades.length === 0) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Mes résultats</h1>
          <p className="mt-1 text-sm text-muted-foreground">Notes, contrôles et progression au même endroit</p>
        </div>
        <Card className="border-dashed">
          <CardContent className="p-8 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-100 text-2xl">📝</div>
            <h2 className="mt-4 text-lg font-semibold">Aucune note publiée pour le moment</h2>
            <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
              Tes notes apparaîtront ici dès leur publication. En attendant, tu peux consulter ta progression ou tes bulletins.
            </p>
            <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
              <Link to="/student/level" className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Ma progression</Link>
              <Link to="/student/bulletins" className="rounded-xl border px-4 py-2 text-sm font-semibold hover:bg-accent">Mes bulletins</Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Mes résultats</h1>
        <p className="text-muted-foreground mt-1">Notes, contrôles et progression au même endroit</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>📊 Résumé</CardTitle>
          <CardDescription>La vue rapide (moyenne, progression, points à travailler)</CardDescription>
        </CardHeader>
        <CardContent>
          {summary.average === null ? (
            <div className="p-4 rounded-lg bg-muted">
              <p className="text-sm font-medium">Aucune note disponible pour le moment.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-lg bg-muted">
                <p className="text-xs text-muted-foreground">Moyenne</p>
                <p className="text-2xl font-bold mt-1">{summary.average.toFixed(1)}/20</p>
              </div>
              <div className="p-4 rounded-lg bg-muted">
                <p className="text-xs text-muted-foreground">Notes reçues</p>
                <p className="text-2xl font-bold mt-1">{summary.count}</p>
              </div>
              <div className="p-4 rounded-lg bg-muted">
                <p className="text-xs text-muted-foreground">Diagnostic</p>
                <p className="text-sm font-medium mt-2">
                  {summary.average >= 14 ? '🟢 Très bien' : summary.average >= 10 ? '🟡 Peut mieux faire' : '🔴 À renforcer'}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>🧩 Détails</CardTitle>
          <CardDescription>Par matière (devoirs + contrôles)</CardDescription>
        </CardHeader>
        <CardContent>
          {allGrades.length === 0 ? (
            <p className="text-sm text-muted-foreground">Pas de note disponible pour le moment.</p>
          ) : (
            <div className="space-y-6">
              {Object.entries(gradesBySubject).map(([subject, grades]) => (
                <div key={subject}>
                  <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <span>{subject}</span>
                    <span className="text-xs text-muted-foreground font-normal">
                      ({grades.length} note{grades.length > 1 ? 's' : ''})
                    </span>
                  </h3>
                  <div className="space-y-2">
                    {grades
                      .slice()
                      .sort((a, b) => (b.submittedAt || '').localeCompare(a.submittedAt || ''))
                      .map((g) => {
                        const color = g.grade === null ? 'text-muted-foreground' : g.grade >= 14 ? 'text-green-700' : g.grade >= 10 ? 'text-yellow-700' : 'text-red-700';
                        const isControl = g.type === 'control';
                        return (
                          <div key={g.id} className={`p-3 rounded-lg border bg-white ${isControl ? 'border-indigo-200' : ''}`}>
                            <div className="flex items-start justify-between gap-4">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className="text-sm font-semibold truncate">{g.title}</p>
                                  {isControl && (
                                    <span className="text-xs px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full font-medium">
                                      Contrôle
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">
                                  {g.submittedAt ? `Soumis le ${new Date(g.submittedAt).toLocaleDateString('fr-FR')}` : 'Soumission'}
                                </p>
                                {g.feedback && (
                                  <p className="text-xs text-gray-600 mt-2 line-clamp-2">💬 {g.feedback}</p>
                                )}
                              </div>
                              <div className={`text-lg font-bold ${color}`}>{g.grade === null ? 'Non noté' : `${g.grade}/20`}</div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default StudentGrades;
