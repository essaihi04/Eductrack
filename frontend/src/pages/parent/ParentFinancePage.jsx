import { useEffect, useState } from 'react';
import { Wallet, FileText, CheckCircle2, AlertCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useI18n } from '../../i18n';

const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const fetchJson = async (path) => {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  const res = await fetch(`${apiUrl}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error('Erreur');
  return res.json();
};

// Seules les couleurs sont figées : le libellé vient du dictionnaire (pfin.status.*).
const FINANCE_STATUS = {
  paid: 'bg-green-100 text-green-700',
  partial: 'bg-orange-100 text-orange-700',
  issued: 'bg-blue-100 text-blue-700',
  pending: 'bg-blue-100 text-blue-700',
  overdue: 'bg-red-100 text-red-700',
  cancelled: 'bg-gray-100 text-gray-500',
};
const fmtMoney = (n, cur = 'MAD') =>
  `${Number(n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${cur}`;

const ParentFinancePage = () => {
  const { t, lang } = useI18n();
  const dateLocale = lang === 'ar' ? 'ar-MA' : 'fr-FR';
  const [children, setChildren] = useState([]);
  const [selected, setSelected] = useState(null);
  const [data, setData] = useState({ invoices: [], summary: null });
  const [loading, setLoading] = useState(true);
  const [loadingInv, setLoadingInv] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const kids = await fetchJson('/api/parent/children');
        setChildren(kids || []);
        if (kids && kids.length > 0) setSelected(kids[0].id);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!selected) return;
    (async () => {
      try {
        setLoadingInv(true);
        const fin = await fetchJson(`/api/parent/children/${selected}/invoices`);
        setData(fin && Array.isArray(fin.invoices) ? fin : { invoices: [], summary: null });
      } catch {
        setData({ invoices: [], summary: null });
      } finally {
        setLoadingInv(false);
      }
    })();
  }, [selected]);

  if (loading) return <div className="flex items-center justify-center h-64">{t('common.loading')}</div>;
  if (error) return <div className="p-6 text-red-600">{error}</div>;

  const { invoices = [], summary } = data;
  const cur = invoices[0]?.currency || 'MAD';

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="rounded-xl bg-gradient-to-br from-emerald-600 to-teal-600 text-white p-6 shadow-lg mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2"><Wallet className="w-7 h-7" /> {t('pfin.title')}</h1>
        <p className="text-white/80 text-sm">{t('pfin.subtitle')}</p>
      </div>

      {children.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center text-gray-500">
          {t('pfin.noChild')}
        </div>
      ) : (
        <>
          {/* Sélecteur d'enfant */}
          {children.length > 1 && (
            <div className="flex gap-2 flex-wrap mb-5">
              {children.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelected(c.id)}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition ${
                    selected === c.id ? 'bg-emerald-600 text-white shadow' : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {c.first_name} {c.last_name}
                </button>
              ))}
            </div>
          )}

          {loadingInv ? (
            <div className="flex items-center justify-center h-40 text-gray-500">{t('pfin.loadingInvoices')}</div>
          ) : (
            <>
              {summary && (
                <div className="grid grid-cols-3 gap-3 mb-5">
                  <SummaryCard label={t('pfin.total')} value={fmtMoney(summary.total, cur)} icon={FileText} color="text-blue-600" />
                  <SummaryCard label={t('pfin.paid')} value={fmtMoney(summary.paid, cur)} icon={CheckCircle2} color="text-green-600" />
                  <SummaryCard label={t('pfin.remaining')} value={fmtMoney(summary.remaining, cur)} icon={AlertCircle} color={summary.remaining > 0 ? 'text-red-600' : 'text-green-600'} />
                </div>
              )}

              {invoices.length === 0 ? (
                <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center text-gray-500">
                  {t('pfin.noInvoice')}
                </div>
              ) : (
                <div className="space-y-3">
                  {invoices.map((inv) => {
                    const st = FINANCE_STATUS[inv.status]
                      ? { label: t(`pfin.status.${inv.status}`), cls: FINANCE_STATUS[inv.status] }
                      : { label: inv.status, cls: 'bg-gray-100 text-gray-600' };
                    return (
                      <div key={inv.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-gray-900">{inv.period_label || inv.invoice_number || t('pfin.invoice')}</p>
                            <p className="text-xs text-gray-500">
                              {inv.invoice_number ? t('pfin.invoiceNumber', { n: inv.invoice_number }) : ''}
                              {inv.due_date ? ` • ${t('pfin.dueDate', { date: new Date(inv.due_date).toLocaleDateString(dateLocale) })}` : ''}
                            </p>
                          </div>
                          <span className={`text-xs px-2 py-1 rounded-full font-medium whitespace-nowrap ${st.cls}`}>{st.label}</span>
                        </div>
                        {Array.isArray(inv.lines) && inv.lines.length > 0 && (
                          <ul className="mt-3 text-sm text-gray-600 space-y-1">
                            {inv.lines.map((l) => (
                              <li key={l.id} className="flex justify-between">
                                <span>{l.label || l.description || t('pfin.line')}</span>
                                <span>{fmtMoney(l.total ?? l.amount ?? l.unit_price, inv.currency || cur)}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                        <div className="mt-3 grid grid-cols-3 gap-2 text-sm border-t border-gray-100 pt-3">
                          <div><span className="text-gray-500 text-xs block">{t('pfin.col.total')}</span>{fmtMoney(inv.total, inv.currency || cur)}</div>
                          <div><span className="text-gray-500 text-xs block">{t('pfin.col.paid')}</span><span className="text-green-700">{fmtMoney(inv.amount_paid, inv.currency || cur)}</span></div>
                          <div><span className="text-gray-500 text-xs block">{t('pfin.col.remaining')}</span><span className={inv.remaining > 0 ? 'text-red-600 font-semibold' : 'text-green-700'}>{fmtMoney(inv.remaining, inv.currency || cur)}</span></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
};

const SummaryCard = ({ label, value, icon: Icon, color }) => (
  <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
    <Icon className={`w-5 h-5 ${color}`} />
    <p className={`text-lg font-bold mt-1 ${color}`}>{value}</p>
    <p className="text-xs uppercase text-gray-500">{label}</p>
  </div>
);

export default ParentFinancePage;
