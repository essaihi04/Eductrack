import { useMemo, useState, useEffect } from 'react';
import { BookOpen, Calendar, CheckCircle, Clock, AlertCircle, Upload, FileText } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';

const StudentHomework = () => {
  const { profile } = useAuth();
  const [homework, setHomework] = useState([]);
  const [loading, setLoading] = useState(true);

  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';

  useEffect(() => {
    fetchHomework();
  }, []);

  const fetchHomework = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const res = await fetch(`${apiUrl}/api/students/me/homework`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setHomework(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error fetching homework:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (homeworkId) => {
    // Pour l'instant, juste une soumission simulée
    // Plus tard, on pourra ajouter l'upload de fichiers
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const res = await fetch(`${apiUrl}/api/students/me/homework/${homeworkId}/submit`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ fileUrl: null })
      });

      if (res.ok) {
        await fetchHomework();
      }
    } catch (error) {
      console.error('Error submitting homework:', error);
    }
  };

  const getTypeIcon = (type) => {
    const icons = {
      exercice: '📝',
      revision: '📚',
      projet: '🎯',
      recherche: '🔍',
      presentation: '🎤'
    };
    return icons[type] || '📄';
  };

  const getTypeLabel = (type) => {
    const labels = {
      exercice: 'Exercice',
      revision: 'Révision',
      projet: 'Projet',
      recherche: 'Recherche',
      presentation: 'Présentation'
    };
    return labels[type] || type;
  };

  const isOverdue = (dueDate) => {
    return new Date(dueDate) < new Date();
  };

  const getStatusBadge = (hw) => {
    const submission = hw.homework_submissions?.[0];
    
    if (submission && submission.status === 'submitted') {
      return {
        icon: CheckCircle,
        text: 'Soumis',
        className: 'bg-green-100 text-green-700'
      };
    }
    
    if (submission && submission.status === 'graded') {
      return {
        icon: CheckCircle,
        text: `Noté: ${submission.grade}/20`,
        className: 'bg-blue-100 text-blue-700'
      };
    }
    
    if (isOverdue(hw.due_date)) {
      return {
        icon: AlertCircle,
        text: 'En retard',
        className: 'bg-red-100 text-red-700'
      };
    }
    
    return {
      icon: Clock,
      text: 'À faire',
      className: 'bg-yellow-100 text-yellow-700'
    };
  };

  const getSubjectStyle = (subjectName) => {
    const palettes = [
      {
        headerBg: 'bg-indigo-50',
        headerBorder: 'border-indigo-200',
        headerText: 'text-indigo-800',
        chipBg: 'bg-indigo-100',
        chipText: 'text-indigo-800',
        accentBorder: 'border-indigo-400',
      },
      {
        headerBg: 'bg-emerald-50',
        headerBorder: 'border-emerald-200',
        headerText: 'text-emerald-800',
        chipBg: 'bg-emerald-100',
        chipText: 'text-emerald-800',
        accentBorder: 'border-emerald-400',
      },
      {
        headerBg: 'bg-sky-50',
        headerBorder: 'border-sky-200',
        headerText: 'text-sky-800',
        chipBg: 'bg-sky-100',
        chipText: 'text-sky-800',
        accentBorder: 'border-sky-400',
      },
      {
        headerBg: 'bg-fuchsia-50',
        headerBorder: 'border-fuchsia-200',
        headerText: 'text-fuchsia-800',
        chipBg: 'bg-fuchsia-100',
        chipText: 'text-fuchsia-800',
        accentBorder: 'border-fuchsia-400',
      },
      {
        headerBg: 'bg-amber-50',
        headerBorder: 'border-amber-200',
        headerText: 'text-amber-900',
        chipBg: 'bg-amber-100',
        chipText: 'text-amber-900',
        accentBorder: 'border-amber-400',
      },
      {
        headerBg: 'bg-rose-50',
        headerBorder: 'border-rose-200',
        headerText: 'text-rose-800',
        chipBg: 'bg-rose-100',
        chipText: 'text-rose-800',
        accentBorder: 'border-rose-400',
      },
    ];

    const s = String(subjectName || 'Sans matière');
    let hash = 0;
    for (let i = 0; i < s.length; i += 1) {
      hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
    }
    return palettes[hash % palettes.length];
  };

  const homeworkBySubject = useMemo(() => {
    const grouped = {};
    (homework || []).forEach((hw) => {
      const subject = hw?.subjects?.name || hw?.subject?.name || hw?.subject_name || 'Sans matière';
      if (!grouped[subject]) grouped[subject] = [];
      grouped[subject].push(hw);
    });
    return Object.entries(grouped)
      .map(([subject, items]) => {
        const pending = items.filter(h => !h.homework_submissions?.[0] || h.homework_submissions?.[0]?.status !== 'submitted');
        return { subject, items, pendingCount: pending.length };
      })
      .sort((a, b) => b.pendingCount - a.pendingCount || a.subject.localeCompare(b.subject));
  }, [homework]);

  if (loading) {
    return <div className="p-8">Chargement...</div>;
  }

  return (
    <div className="p-8 space-y-6">
      {/* En-tête */}
      <div>
        <h1 className="text-3xl font-bold">📘 Mes devoirs</h1>
        <p className="text-muted-foreground mt-2">
          {homework.filter(h => !h.homework_submissions?.[0]).length} devoir(s) à faire
        </p>
      </div>

      {/* Liste des devoirs */}
      <div className="grid gap-4">
        {homework.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <BookOpen className="w-16 h-16 mx-auto text-gray-400 mb-4" />
              <p className="text-gray-500">Aucun devoir pour le moment</p>
            </CardContent>
          </Card>
        ) : (
          homeworkBySubject.map(({ subject, items, pendingCount }) => (
            <div key={subject} className="space-y-3">
              {(() => {
                const style = getSubjectStyle(subject);
                return (
                  <div className={`p-4 rounded-xl border ${style.headerBg} ${style.headerBorder} flex items-center justify-between gap-3`}>
                    <div className="min-w-0">
                      <h2 className={`text-lg font-bold truncate ${style.headerText}`}>{subject}</h2>
                      <p className="text-xs text-muted-foreground mt-1">{items.length} devoir(s)</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-3 py-1 rounded-full font-semibold ${style.chipBg} ${style.chipText}`}>
                        {pendingCount > 0 ? `${pendingCount} à faire` : 'À jour'}
                      </span>
                    </div>
                  </div>
                );
              })()}

              {items
                .slice()
                .sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''))
                .map((hw) => {
                  const status = getStatusBadge(hw);
                  const StatusIcon = status.icon;
                  const submission = hw.homework_submissions?.[0];
                  const style = getSubjectStyle(subject);

                  return (
                    <Card
                      key={hw.id}
                      className={`border-l-4 ${
                        submission ? 'border-l-green-500' :
                        isOverdue(hw.due_date) ? 'border-l-red-500' : 'border-l-blue-500'
                      } ${style.accentBorder} transition-all hover:shadow-lg hover:-translate-y-0.5`}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-2xl">{getTypeIcon(hw.type)}</span>
                              <h3 className="text-lg font-semibold">{hw.title}</h3>
                              <span className="text-xs px-2 py-1 bg-gray-100 rounded">
                                {getTypeLabel(hw.type)}
                              </span>
                              <span className={`text-xs px-2 py-1 rounded flex items-center gap-1 ${status.className}`}>
                                <StatusIcon className="w-3 h-3" />
                                {status.text}
                              </span>
                            </div>

                            {hw.description && (
                              <p className="text-sm text-gray-600 mb-2">{hw.description}</p>
                            )}

                            <div className="flex items-center gap-4 text-sm text-gray-500">
                              <div className="flex items-center gap-1">
                                <Calendar className="w-4 h-4" />
                                <span>
                                  Date limite: {new Date(hw.due_date).toLocaleDateString('fr-FR', {
                                    day: 'numeric',
                                    month: 'long',
                                    year: 'numeric'
                                  })}
                                </span>
                              </div>
                              {hw.profiles && (
                                <span className="text-sm">
                                  Prof: {hw.profiles.first_name} {hw.profiles.last_name}
                                </span>
                              )}
                            </div>

                            {submission && submission.feedback && (
                              <div className="mt-3 p-3 bg-blue-50 rounded-lg">
                                <p className="text-sm font-medium text-blue-900 mb-1">Feedback du professeur:</p>
                                <p className="text-sm text-blue-800">{submission.feedback}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default StudentHomework;
