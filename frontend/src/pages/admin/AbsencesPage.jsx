import { useState, useEffect, useCallback } from 'react';
import { UserX, Search, Download, RefreshCw, Check, X, Phone, Calendar, MessageCircle, Eye } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { openBlob } from '../../lib/download';
import { useYear } from '../../contexts/YearContext';
import { schoolYearDateRange } from '../../lib/schoolYear';

const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const resolveAvatar = (u) => !u ? null : (u.startsWith('http') ? u : `${apiUrl}${u.startsWith('/') ? '' : '/'}${u}`);

// --- Helpers de période -----------------------------------------------------
const iso = (d) => d.toISOString().split('T')[0];
const startOfWeek = (d) => { const x = new Date(d); const day = (x.getDay() + 6) % 7; x.setDate(x.getDate() - day); return x; };
const endOfWeek = (d) => { const x = startOfWeek(d); x.setDate(x.getDate() + 6); return x; };
const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
const endOfMonth = (d) => new Date(d.getFullYear(), d.getMonth() + 1, 0);

const FILTERS = [
  { key: 'year', label: 'Année scolaire' },
  { key: 'day', label: 'Jour' },
  { key: 'week', label: 'Semaine' },
  { key: 'month', label: 'Mois' },
  { key: 'period', label: 'Période' },
];

const StudentAvatar = ({ row, size = 36 }) => {
  const url = resolveAvatar(row.avatar_url);
  const initials = (row.student_name || '').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  if (url) {
    return <img src={url} alt="" className="rounded-full object-cover border border-gray-200" style={{ width: size, height: size }} onError={(e) => { e.currentTarget.style.display = 'none'; }} />;
  }
  return <span className="rounded-full flex items-center justify-center bg-blue-100 text-blue-700 font-semibold border border-blue-200" style={{ width: size, height: size, fontSize: size * 0.35 }}>{initials || '👤'}</span>;
};

const Badge = ({ ok, yes = 'Oui', no = 'Non' }) => (
  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ok ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>{ok ? yes : no}</span>
);

export default function AbsencesPage() {
  const { year } = useYear();
  const initialSchoolRange = schoolYearDateRange(year);
  const [filter, setFilter] = useState('year');
  const [anchor, setAnchor] = useState(iso(new Date()));       // date de référence (jour/semaine/mois)
  const [periodStart, setPeriodStart] = useState(initialSchoolRange.start);
  const [periodEnd, setPeriodEnd] = useState(initialSchoolRange.end);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null); // key en cours d'édition
  const [draft, setDraft] = useState({});
  const [exporting, setExporting] = useState(false);

  const range = useCallback(() => {
    const d = new Date(anchor + 'T00:00:00');
    if (filter === 'year') return schoolYearDateRange(year);
    if (filter === 'day') return { start: anchor, end: anchor };
    if (filter === 'week') return { start: iso(startOfWeek(d)), end: iso(endOfWeek(d)) };
    if (filter === 'month') return { start: iso(startOfMonth(d)), end: iso(endOfMonth(d)) };
    return { start: periodStart, end: periodEnd };
  }, [filter, anchor, periodStart, periodEnd, year]);

  useEffect(() => {
    const next = schoolYearDateRange(year);
    setPeriodStart(next.start);
    setPeriodEnd(next.end);
  }, [year]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { start, end } = range();
      const res = await fetch(`${apiUrl}/api/admin/absences?start=${start}&end=${end}`, {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      const data = await res.json();
      setRows(Array.isArray(data.absences) ? data.absences : []);
    } catch (e) { console.error(e); setRows([]); }
    finally { setLoading(false); }
  }, [range]);

  useEffect(() => { load(); }, [load]);

  const filtered = rows.filter(r => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return r.student_name.toLowerCase().includes(q) || (r.class_name || '').toLowerCase().includes(q);
  });

  const startEdit = (r) => {
    setEditing(r.key);
    setDraft({ justified: r.justified, justification_comment: r.justification_comment || '', seen_by_parent: r.seen_by_parent });
  };

  const saveEdit = async (r) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${apiUrl}/api/admin/absences`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tracking_ids: r.tracking_ids,
          justified: draft.justified,
          justification_comment: draft.justification_comment,
          seen_by_parent: draft.seen_by_parent,
        }),
      });
      if (!res.ok) throw new Error('Échec');
      setRows(rows.map(x => x.key === r.key ? { ...x, ...draft, justification_source: 'manual' } : x));
      setEditing(null);
    } catch (e) { alert('Erreur: ' + e.message); }
  };

  // Le PDF est généré côté backend (PDFKit + police NotoNaskhArabic) afin que les
  // noms d'élèves/parents en arabe s'affichent correctement — jsPDF (Helvetica)
  // ne gère ni les glyphes arabes ni le shaping RTL. L'export couvre toute la
  // période affichée (le filtre de recherche local n'est pas appliqué).
  const exportPDF = async () => {
    setExporting(true);
    try {
      const { start, end } = range();
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${apiUrl}/api/admin/absences/export-pdf?start=${start}&end=${end}`, {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (!res.ok) throw new Error('Échec');
      const blob = await res.blob();
      await openBlob(blob, `eleves-absents-${start}${start !== end ? `_${end}` : ''}.pdf`);
    } catch (e) { console.error(e); alert('Erreur export PDF'); }
    finally { setExporting(false); }
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2"><UserX className="w-6 h-6 text-red-500" /> Élèves absents</h1>
          <p className="text-sm text-gray-500">Absences signalées, statut d'envoi aux parents et justification.</p>
        </div>
        <button onClick={exportPDF} disabled={exporting || filtered.length === 0}
          className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">
          {exporting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} Exporter PDF
        </button>
      </div>

      {/* Filtres période */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 p-1 bg-gray-100 rounded-lg">
          {FILTERS.map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium ${filter === f.key ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>
              {f.label}
            </button>
          ))}
        </div>
        {filter === 'year' ? (
          <div className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 font-medium">
            <Calendar className="w-4 h-4" /> {year}
          </div>
        ) : filter !== 'period' ? (
          <div className="flex items-center gap-1.5 text-sm">
            <Calendar className="w-4 h-4 text-gray-400" />
            <input type="date" value={anchor} onChange={e => setAnchor(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5" />
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-sm">
            <input type="date" value={periodStart} onChange={e => setPeriodStart(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5" />
            <span className="text-gray-400">→</span>
            <input type="date" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5" />
          </div>
        )}
        <div className="relative flex-1 min-w-[180px]">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher élève ou classe…"
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg" />
        </div>
        <button onClick={load} className="p-2 rounded-lg hover:bg-gray-100" title="Actualiser"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button>
      </div>

      <p className="text-sm text-gray-500">{filtered.length} absence(s)</p>

      {loading ? (
        <div className="flex justify-center py-16"><RefreshCw className="w-8 h-8 animate-spin text-red-500" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
          <UserX className="w-12 h-12 mx-auto text-gray-300 mb-3" />
          <p className="text-gray-600">Aucune absence sur cette période</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-gray-600">
                <th className="px-3 py-2 font-semibold">Élève</th>
                <th className="px-3 py-2 font-semibold">Classe</th>
                <th className="px-3 py-2 font-semibold">Date</th>
                <th className="px-3 py-2 font-semibold">Créneau</th>
                <th className="px-3 py-2 font-semibold">Matière</th>
                <th className="px-3 py-2 font-semibold">Parent(s)</th>
                <th className="px-3 py-2 font-semibold">Absence envoyée</th>
                <th className="px-3 py-2 font-semibold">Vue</th>
                <th className="px-3 py-2 font-semibold">Justifié</th>
                <th className="px-3 py-2 font-semibold">Commentaire</th>
                <th className="px-3 py-2 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(r => {
                const isEdit = editing === r.key;
                return (
                  <tr key={r.key} className="hover:bg-gray-50">
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <StudentAvatar row={r} />
                        <p className="font-medium text-gray-900">{r.student_name}</p>
                      </div>
                    </td>
                    <td className="px-3 py-2">{r.class_name}{r.class_level ? <span className="text-gray-400 text-xs"> ({r.class_level})</span> : ''}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.date}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-600">
                      {[...new Set(r.sessions.map(s => s.end_time ? `${s.start_time}–${s.end_time}` : s.start_time).filter(Boolean))].join(', ') || '—'}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-600">
                      {[...new Set(r.sessions.map(s => s.subject).filter(v => v && v !== '—'))].join(', ') || '—'}
                    </td>
                    <td className="px-3 py-2">
                      {r.parents.length === 0 ? <span className="text-gray-400">—</span> : r.parents.map((p, i) => (
                        <div key={i} className="text-xs">
                          <span className="font-medium">{p.name}</span>
                          {p.phone && <a href={`tel:${p.phone}`} className="ml-1 text-blue-600 inline-flex items-center gap-0.5"><Phone className="w-3 h-3" />{p.phone}</a>}
                        </div>
                      ))}
                    </td>
                    <td className="px-3 py-2"><Badge ok={r.absence_notified} yes="Envoyée" no="Non" /></td>
                    <td className="px-3 py-2">
                      {isEdit ? (
                        <label className="flex items-center gap-1 text-xs cursor-pointer">
                          <input type="checkbox" checked={!!draft.seen_by_parent} onChange={e => setDraft(d => ({ ...d, seen_by_parent: e.target.checked }))} /> Vue
                        </label>
                      ) : <Badge ok={r.seen_by_parent} yes="Vue" no="Non vue" />}
                    </td>
                    <td className="px-3 py-2">
                      {isEdit ? (
                        <select value={draft.justified === null || draft.justified === undefined ? '' : String(draft.justified)}
                          onChange={e => setDraft(d => ({ ...d, justified: e.target.value === '' ? null : e.target.value === 'true' }))}
                          className="border border-gray-300 rounded px-1.5 py-1 text-xs">
                          <option value="">Non traité</option>
                          <option value="true">Justifiée</option>
                          <option value="false">Non justifiée</option>
                        </select>
                      ) : (
                        r.justified === null
                          ? <span className="text-xs text-gray-400">Non traité</span>
                          : <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${r.justified ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{r.justified ? 'Justifiée' : 'Non justifiée'}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 max-w-[220px]">
                      {isEdit ? (
                        <input type="text" value={draft.justification_comment} onChange={e => setDraft(d => ({ ...d, justification_comment: e.target.value }))}
                          placeholder="Motif…" className="w-full border border-gray-300 rounded px-2 py-1 text-xs" />
                      ) : (
                        <span className="text-xs text-gray-600">
                          {r.justification_comment || '—'}
                          {r.justification_source === 'ai' && <span className="ml-1 text-[10px] px-1 rounded bg-purple-100 text-purple-600">IA</span>}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {isEdit ? (
                        <div className="flex gap-1 justify-end">
                          <button onClick={() => saveEdit(r)} className="p-1.5 rounded bg-green-100 text-green-700 hover:bg-green-200"><Check className="w-4 h-4" /></button>
                          <button onClick={() => setEditing(null)} className="p-1.5 rounded bg-gray-100 text-gray-500 hover:bg-gray-200"><X className="w-4 h-4" /></button>
                        </div>
                      ) : (
                        <button onClick={() => startEdit(r)} className="px-2 py-1 rounded bg-blue-50 text-blue-600 hover:bg-blue-100 text-xs font-medium">Modifier</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
