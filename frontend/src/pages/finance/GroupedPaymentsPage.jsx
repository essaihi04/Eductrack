import { useState, useEffect } from 'react';
import { Layers, Wallet, Eye, CheckCircle2 } from 'lucide-react';
import { financeApi, formatMAD, METHOD_LABELS, CATEGORY_LABELS } from '../../lib/financeApi';
import { PageHeader, Card, Button } from '../../components/finance/ui';
import { useYear } from '../../contexts/YearContext';
import { toDashYear } from '../../lib/schoolYear';

const SCHOOL_MONTHS = [
  { v: 9, l: 'Sept.' }, { v: 10, l: 'Oct.' }, { v: 11, l: 'Nov.' }, { v: 12, l: 'Déc.' },
  { v: 1, l: 'Janv.' }, { v: 2, l: 'Févr.' }, { v: 3, l: 'Mars' }, { v: 4, l: 'Avril' },
  { v: 5, l: 'Mai' }, { v: 6, l: 'Juin' }, { v: 7, l: 'Juil.' }, { v: 8, l: 'Août' },
];

export default function GroupedPaymentsPage() {
  const { year } = useYear();
  const [classes, setClasses] = useState([]);
  const [classId, setClassId] = useState('');
  const [months, setMonths] = useState([]);
  const [cats, setCats] = useState([]); // [] = tous les services
  const [method, setMethod] = useState('cash');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState('');

  const [preview, setPreview] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [result, setResult] = useState(null);
  const [paying, setPaying] = useState(false);

  useEffect(() => { loadClasses(); /* eslint-disable-next-line */ }, [year]);
  // Toute modification de la cible invalide l'aperçu/résultat.
  useEffect(() => { setPreview(null); setResult(null); }, [classId, months, cats, year]);

  const loadClasses = async () => {
    try {
      const res = await financeApi.listClasses(toDashYear(year));
      setClasses(Array.isArray(res) ? res : (res.classes || []));
    } catch (e) { console.error(e); }
  };

  const toggleMonth = (m) => setMonths((p) => p.includes(m) ? p.filter((x) => x !== m) : [...p, m]);
  const toggleCat = (c) => setCats((p) => p.includes(c) ? p.filter((x) => x !== c) : [...p, c]);

  const canRun = classId && months.length > 0;
  const payload = () => ({
    academic_year: toDashYear(year),
    class_id: classId,
    months,
    categories: cats.length ? cats : ['all'],
    method,
    payment_date: paymentDate,
    reference: reference || undefined,
  });

  const runPreview = async () => {
    if (!canRun) return;
    setLoadingPreview(true);
    setResult(null);
    try {
      setPreview(await financeApi.payGroupPreview(payload()));
    } catch (e) { alert('Erreur: ' + e.message); }
    finally { setLoadingPreview(false); }
  };

  const runPay = async () => {
    if (!canRun) return;
    const cls = classes.find((c) => c.id === classId)?.name || 'la classe';
    if (!confirm(`Encaisser pour ${preview?.students_with_due ?? '?'} élève(s) de ${cls} — total ${formatMAD(preview?.total_due || 0)} ?`)) return;
    setPaying(true);
    try {
      const res = await financeApi.payGroup(payload());
      setResult(res);
      setPreview(null);
    } catch (e) { alert('Erreur: ' + e.message); }
    finally { setPaying(false); }
  };

  return (
    <div className="p-6 space-y-5">
      <PageHeader icon={Layers} title="Paiements groupés" color="green"
        subtitle="Encaisser des mois / services pour toute une classe en une fois" />

      <Card title="Cible">
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Classe</label>
              <select value={classId} onChange={(e) => setClassId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                <option value="">Choisir une classe…</option>
                {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Mode de paiement</label>
              <select value={method} onChange={(e) => setMethod(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                {Object.entries(METHOD_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Mois à encaisser</label>
            <div className="flex flex-wrap gap-2">
              {SCHOOL_MONTHS.map((m) => (
                <button key={m.v} onClick={() => toggleMonth(m.v)}
                  className={`px-3 py-1.5 rounded-lg text-sm border ${months.includes(m.v) ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
                  {m.l}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Services <span className="text-gray-400">(aucun = tous les services dus)</span></label>
            <div className="flex flex-wrap gap-2">
              {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                <button key={k} onClick={() => toggleCat(k)}
                  className={`px-3 py-1.5 rounded-lg text-sm border ${cats.includes(k) ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
                  {v}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Date</label>
              <input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Référence (optionnel)</label>
              <input type="text" value={reference} onChange={(e) => setReference(e.target.value)}
                placeholder="N° bordereau, lot…" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <Button variant="secondary" icon={Eye} onClick={runPreview} disabled={!canRun || loadingPreview}>
              {loadingPreview ? 'Calcul…' : 'Aperçu'}
            </Button>
            <Button color="green" icon={Wallet} onClick={runPay} disabled={!canRun || paying || !preview || preview.students_with_due === 0}>
              {paying ? 'Encaissement…' : 'Encaisser le groupe'}
            </Button>
          </div>
        </div>
      </Card>

      {preview && (
        <Card title="Aperçu">
          {preview.students_with_due === 0 ? (
            <p className="text-sm text-gray-500">Aucun montant dû pour cette sélection.</p>
          ) : (
            <div className="flex items-center gap-6">
              <div>
                <div className="text-xs text-muted-foreground">Élèves concernés</div>
                <div className="text-2xl font-bold text-gray-900">{preview.students_with_due}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Total à encaisser</div>
                <div className="text-2xl font-bold text-green-700">{formatMAD(preview.total_due)}</div>
              </div>
            </div>
          )}
        </Card>
      )}

      {result && (
        <Card title="Résultat">
          <div className="flex items-center gap-3 text-green-700">
            <CheckCircle2 className="w-5 h-5" />
            <span className="font-medium">
              {result.students_paid} élève(s) · {result.receipts_count} reçu(s) · {formatMAD(result.total_paid)}
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-2">Les reçus sont visibles dans Paiements et Caisse.</p>
        </Card>
      )}
    </div>
  );
}
