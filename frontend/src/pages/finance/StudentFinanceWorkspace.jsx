import { useState, useEffect, useMemo } from 'react';
import {
  Wallet, Users, History, Search, Plus, X, CheckCircle2,
  Printer, Ban, CreditCard, Pencil, Save, ChevronDown, ChevronRight, ArrowLeft, RotateCcw,
  LayoutGrid, List,
} from 'lucide-react';
import { financeApi, formatMAD, METHOD_LABELS, CATEGORY_LABELS } from '../../lib/financeApi';
import { Button } from '../../components/finance/ui';
import { Avatar } from '../../components/directory/ui';

const STATUS_META = {
  paid: { label: 'Payé', cls: 'bg-green-100 text-green-700' },
  partial: { label: 'Partiel', cls: 'bg-yellow-100 text-yellow-700' },
  overdue: { label: 'En retard', cls: 'bg-red-100 text-red-700' },
  unpaid: { label: 'Impayé', cls: 'bg-orange-100 text-orange-700' },
  pending: { label: 'Non facturé', cls: 'bg-gray-100 text-gray-600' },
  issued: { label: 'Émise', cls: 'bg-blue-100 text-blue-700' },
  cancelled: { label: 'Annulée', cls: 'bg-gray-200 text-gray-500' },
};

const fullName = (s) => `${s.first_name || ''} ${s.last_name || ''}`.trim();
const keyOf = (month, category) => `${month}:${category || 'bundle'}`;

// Couleur de l'en-tête d'un mois selon son statut de paiement.
const MONTH_HEAD = {
  paid: 'bg-green-100 text-green-800 border-green-300',
  partial: 'bg-orange-100 text-orange-800 border-orange-300',
  overdue: 'bg-red-200 text-red-900 border-red-400', // retard : rouge plus foncé
  unpaid: 'bg-red-50 text-red-700 border-red-200',
};

// Bordure de la carte entière du mois (vue « cartes ») selon le statut.
const MONTH_BORDER = {
  paid: 'border-green-300',
  partial: 'border-orange-300',
  overdue: 'border-red-400',
  unpaid: 'border-red-300',
};

// Libellé lisible d'un service (Scolarité, Transport…) à partir d'une ligne.
const serviceLabel = (svc) => svc?.label || (svc?.category ? (CATEGORY_LABELS[svc.category] || svc.category) : 'Mensualité');

// Première année d'une chaîne « 2026/2027 » ou « 2026-2027 ».
const firstYearNum = (y) => {
  const a = parseInt(String(y || '').split(/[/\-]/)[0], 10);
  return Number.isNaN(a) ? null : a;
};

export default function StudentFinanceWorkspace({ student, allStudents = [], academicYear, onClose, onChanged, onOpenPlan, initialTab = 'collect', headerActions = null }) {
  const [tab, setTab] = useState(initialTab);

  // Si l'utilisateur ouvre le même espace via un autre bouton (ex : Historique),
  // on suit l'onglet demandé.
  useEffect(() => { setTab(initialTab); }, [initialTab, student.id]);

  // ── Onglets d'années : consulter (et encaisser) les IMPAYÉS des années
  // précédentes sans quitter la page. Un badge rouge affiche le reste dû de
  // chaque année ; ✓ si l'année est soldée. L'année active vient de l'app.
  const [viewYear, setViewYear] = useState(academicYear);
  useEffect(() => { setViewYear(academicYear); }, [academicYear, student.id]);
  const yearTabs = useMemo(() => {
    const a = firstYearNum(academicYear);
    if (a === null) return [academicYear];
    const sep = String(academicYear).includes('-') ? '-' : '/';
    return [`${a - 1}${sep}${a}`, `${a}${sep}${a + 1}`, `${a + 1}${sep}${a + 2}`];
  }, [academicYear]);
  const [yearDues, setYearDues] = useState({}); // année -> reste dû (null = pas de plan)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(yearTabs.map(async (y) => {
        try {
          const d = await financeApi.getMonthlyServicesStatus(student.id, y);
          return [y, d?.plan_exists ? Number(d.summary?.remaining_total || 0) : null];
        } catch { return [y, null]; }
      }));
      if (!cancelled) setYearDues(Object.fromEntries(entries));
    })();
    return () => { cancelled = true; };
  }, [student.id, yearTabs]);

  return (
    <div className="space-y-4">
      {/* En-tête plein écran avec retour */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          {onClose && (
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg" title="Retour à la liste">
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <div>
            <h1 className="text-xl font-bold text-gray-900">Finance — {fullName(student)}</h1>
            <p className="text-sm text-gray-500 flex items-center gap-2">
              <CreditCard className="w-4 h-4" /> {student.classes?.name || '—'} · {viewYear}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {onOpenPlan && (
            <Button variant="secondary" onClick={onOpenPlan}>Plan de frais</Button>
          )}
          {headerActions}
        </div>
      </div>

      {/* Onglets + années (impayés des années précédentes visibles d'un coup d'œil) */}
      <div className="flex items-end justify-between gap-2 flex-wrap border-b border-gray-200">
        <div className="flex gap-1">
          {[
            { k: 'collect', label: 'Encaissement', icon: Wallet },
            { k: 'family', label: 'Famille / groupé', icon: Users },
            { k: 'history', label: 'Historique', icon: History },
          ].map(t => (
            <button key={t.k} onClick={() => setTab(t.k)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === t.k ? 'border-green-600 text-green-700' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              <t.icon className="w-4 h-4" /> {t.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5 pb-1.5">
          {yearTabs.map(y => {
            const due = yearDues[y];
            const active = viewYear === y;
            return (
              <button key={y} onClick={() => setViewYear(y)}
                title={due == null ? 'Pas de plan de frais cette année' : due > 0 ? `Reste dû : ${formatMAD(due)}` : 'Année soldée'}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                  active ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                }`}>
                {y}
                {due != null && due > 0 && (
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${active ? 'bg-white text-red-600' : 'bg-red-100 text-red-700'}`}>
                    {formatMAD(due)}
                  </span>
                )}
                {due != null && due <= 0 && <span className={active ? 'text-white' : 'text-green-600'}>✓</span>}
              </button>
            );
          })}
        </div>
      </div>

      {tab === 'collect' && <CollectTab key={`${student.id}:${viewYear}`} student={student} academicYear={viewYear} onChanged={onChanged} />}
      {tab === 'family' && <FamilyTab key={`${student.id}:${viewYear}`} student={student} allStudents={allStudents} academicYear={viewYear} onChanged={onChanged} />}
      {tab === 'history' && <HistoryTab key={`${student.id}:${viewYear}`} student={student} academicYear={viewYear} onChanged={onChanged} />}
    </div>
  );
}

// ── Grille mois × service réutilisable ───────────────────────────────────────
// sel : { 'month:category' -> { checked, amount } }. Les services déjà payés
// (remaining<=0) sont verrouillés et marqués payés.
// Deux vues (hors mode compact) : « cartes » = un mois par carte, défilement
// horizontal avec accroche ; « liste » = mois empilés (comportement historique).
function MonthsServicesGrid({ months, sel, onToggle, onAmount, compact = false, onCancelService, onAddService, onRestoreService, serviceCatalog }) {
  const [view, setView] = useState(() => {
    try { return localStorage.getItem('financeMonthsView') || 'cards'; } catch { return 'cards'; }
  });
  const switchView = (v) => { setView(v); try { localStorage.setItem('financeMonthsView', v); } catch { /* stockage indisponible */ } };
  const cards = !compact && view === 'cards';
  const dense = compact || cards; // largeurs réduites dans les colonnes famille et les cartes
  const amtCls = dense ? 'w-20 px-1.5 py-1 text-xs' : 'w-28 px-2 py-1 text-sm';
  // Ajout d'un service : mois en cours d'ajout + catégorie + montant.
  const [addMonth, setAddMonth] = useState(null);
  const [addCat, setAddCat] = useState('');
  const [addAmount, setAddAmount] = useState('');
  const [adding, setAdding] = useState(false);

  // Catalogue des services proposés à l'ajout : les services réellement
  // enregistrés dans le plan de l'élève (noms personnalisés) si fournis,
  // sinon repli sur les catégories génériques.
  const catalog = (serviceCatalog && serviceCatalog.length) ? serviceCatalog : Object.entries(CATEGORY_LABELS);

  const openAdd = (month, presentCats) => {
    const firstFree = (catalog.find(([c]) => !presentCats.has(c)) || [''])[0];
    setAddMonth(month); setAddCat(firstFree); setAddAmount('');
  };
  const submitAdd = async (month) => {
    if (!addCat) return;
    setAdding(true);
    // Transmet le nom enregistré du service pour conserver le libellé exact.
    const name = (catalog.find(([c]) => c === addCat) || [])[1];
    try { await onAddService(month, addCat, addAmount, name); setAddMonth(null); }
    finally { setAdding(false); }
  };

  return (
    <div className="space-y-2">
      {!compact && (
        <div className="flex items-center justify-end gap-1">
          {[{ k: 'cards', label: 'Cartes', icon: LayoutGrid }, { k: 'list', label: 'Liste', icon: List }].map(v => (
            <button key={v.k} onClick={() => switchView(v.k)}
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors ${
                view === v.k ? 'bg-green-100 text-green-700' : 'text-gray-500 hover:bg-gray-100'
              }`}>
              <v.icon className="w-3.5 h-3.5" /> {v.label}
            </button>
          ))}
        </div>
      )}
      {/* Vue « cartes » : grille qui s'étale sur plusieurs lignes — tous les mois
          de l'année sont visibles d'un coup, sans défilement horizontal. */}
      <div className={cards ? 'grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(300px,1fr))]' : 'space-y-2.5'}>
      {(months || []).map(m => {
        const head = MONTH_HEAD[m.status] || MONTH_HEAD.unpaid;
        const presentCats = new Set(m.services.map(s => s.category).filter(Boolean));
        const freeCats = catalog.filter(([c]) => !presentCats.has(c));
        // Totaux du mois (hors services exclus) pour le bandeau récapitulatif.
        const active = m.services.filter(s => !(s.status === 'excluded' || s.excluded));
        const monthTotal = active.reduce((t, s) => t + Number(s.total || 0), 0);
        const monthPaid = active.reduce((t, s) => t + Number(s.paid || 0), 0);
        // Sélection rapide : services encore payables du mois.
        const payables = active.filter(s => s.remaining > 0);
        const allChecked = payables.length > 0 && payables.every(s => sel[keyOf(m.month, s.category)]?.checked);
        const toggleMonth = () => {
          payables.forEach(s => {
            const isChecked = !!sel[keyOf(m.month, s.category)]?.checked;
            if (allChecked ? isChecked : !isChecked) onToggle(m.month, s);
          });
        };
        return (
          <div key={m.month} className={`border rounded-lg overflow-hidden ${cards ? `flex flex-col bg-white ${MONTH_BORDER[m.status] || MONTH_BORDER.unpaid}` : 'border-gray-200'}`}>
            <div className={`px-3 py-1.5 text-sm border-b ${head}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">{m.label}</span>
                <span className="text-xs font-medium">
                  {m.remaining > 0 ? `Reste ${formatMAD(m.remaining)}` : 'Payé ✓'}
                </span>
              </div>
              {cards && (
                <div className="flex items-center justify-between gap-2 mt-1">
                  <span className="text-[11px] opacity-80">Total {formatMAD(monthTotal)} · Payé {formatMAD(monthPaid)}</span>
                  {payables.length > 0 && onToggle && (
                    <button onClick={toggleMonth}
                      title={allChecked ? 'Décocher tous les services du mois' : 'Cocher tous les services restants du mois'}
                      className="text-[11px] font-semibold px-2 py-0.5 rounded bg-white/80 hover:bg-white border border-gray-300 flex-shrink-0">
                      {allChecked ? 'Tout décocher' : '⚡ Tout encaisser'}
                    </button>
                  )}
                </div>
              )}
            </div>
            <div className={`divide-y divide-gray-100 ${cards ? 'flex-1' : ''}`}>
              {m.services.map(svc => {
                const k = keyOf(m.month, svc.category);
                const excluded = svc.status === 'excluded' || svc.excluded;
                const payable = svc.remaining > 0;
                const checked = !!sel[k]?.checked;
                const hasPaid = Number(svc.paid) > 0;
                const billed = !!svc.invoice_id; // facturé : annulable / supprimable
                return (
                  <div key={k} className={`flex items-center gap-2 px-2.5 py-1.5 text-sm ${checked ? 'bg-green-50' : excluded ? 'bg-gray-50' : ''}`}>
                    {excluded ? (
                      <span className="w-4 h-4 flex-shrink-0" />
                    ) : payable ? (
                      <input type="checkbox" checked={checked} onChange={() => onToggle(m.month, svc)} className="w-4 h-4 accent-green-600 flex-shrink-0" />
                    ) : (
                      // Déjà payé : case cochée verrouillée (impossible à décocher)
                      <input type="checkbox" checked readOnly disabled className="w-4 h-4 accent-green-600 flex-shrink-0" title="Payé" />
                    )}
                    {/* Pastille de statut du service : vert payé, orange partiel, rouge non payé */}
                    {!excluded && (
                      <span title={!payable ? 'Payé' : hasPaid ? 'Partiellement payé' : 'Non payé'}
                        className={`w-2 h-2 rounded-full flex-shrink-0 ${!payable ? 'bg-green-500' : hasPaid ? 'bg-orange-500' : 'bg-red-500'}`} />
                    )}
                    <span className={`flex-1 min-w-0 truncate ${excluded ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
                      {serviceLabel(svc)}
                      {svc.extra && <span className="ml-1 text-[10px] px-1 py-0.5 rounded bg-purple-50 text-purple-600 align-middle no-underline">ajouté</span>}
                      {excluded && <span className="ml-1 text-[10px] px-1 py-0.5 rounded bg-gray-200 text-gray-500 align-middle no-underline">exclu</span>}
                    </span>
                    {!excluded && <span className="text-xs text-gray-400 flex-shrink-0">{formatMAD(svc.total)}</span>}
                    {excluded ? (
                      <span className={`${dense ? 'w-20' : 'w-28'} text-right text-xs text-gray-400 flex-shrink-0`}>Exclu</span>
                    ) : payable ? (
                      checked ? (
                        <input type="number" step="0.01" min="0" max={svc.remaining} value={sel[k].amount}
                          onChange={e => onAmount(m.month, svc.category, e.target.value)}
                          className={`${amtCls} border border-gray-300 rounded text-right flex-shrink-0`} />
                      ) : (
                        <span className={`${dense ? 'w-20 text-xs' : 'w-28'} text-right font-medium text-orange-600 flex-shrink-0`}>{formatMAD(svc.remaining)}</span>
                      )
                    ) : (
                      <span className={`${dense ? 'w-20' : 'w-28'} text-right text-xs text-green-600 font-medium flex-shrink-0`}>Payé ✓</span>
                    )}
                    {/* Facturé : impression rapide de la facture du service */}
                    {billed && (
                      <button onClick={() => financeApi.openInvoicePdf(svc.invoice_id).catch(e => alert('Erreur impression: ' + e.message))}
                        title="Imprimer la facture de ce service" className="p-1 hover:bg-blue-100 rounded flex-shrink-0">
                        <Printer className="w-3.5 h-3.5 text-blue-600" />
                      </button>
                    )}
                    {/* Exclu → réintégrer ; sinon annuler le paiement / supprimer / exclure avant paiement */}
                    {onRestoreService && excluded ? (
                      <button onClick={() => onRestoreService(m.month, svc)} title="Réintégrer ce service"
                        className="p-1 hover:bg-green-100 rounded flex-shrink-0"><RotateCcw className="w-3.5 h-3.5 text-green-600" /></button>
                    ) : onCancelService && !excluded && (billed || payable) ? (
                      <button onClick={() => onCancelService(m.month, svc)}
                        title={hasPaid ? 'Annuler le paiement de ce service' : (billed ? 'Supprimer ce service' : 'Exclure ce service (avant paiement)')}
                        className="p-1 hover:bg-red-100 rounded flex-shrink-0"><Ban className="w-3.5 h-3.5 text-red-500" /></button>
                    ) : null}
                  </div>
                );
              })}
            </div>

            {/* Ajouter un service à ce mois */}
            {onAddService && (
              addMonth === m.month ? (
                <div className={`px-2.5 py-2 bg-purple-50/40 border-t border-gray-100 ${cards ? 'space-y-1.5' : 'flex items-center gap-2'}`}>
                  <select value={addCat} onChange={e => setAddCat(e.target.value)} className={`${cards ? 'w-full' : 'flex-1'} px-2 py-1.5 border border-gray-300 rounded text-sm`}>
                    {freeCats.length === 0 && <option value="">Tous les services sont déjà présents</option>}
                    {freeCats.map(([c, v]) => <option key={c} value={c}>{v}</option>)}
                  </select>
                  <div className={cards ? 'flex items-center gap-1.5' : 'contents'}>
                    <input type="number" step="0.01" min="0" value={addAmount} onChange={e => setAddAmount(e.target.value)}
                      placeholder="Montant (auto si plan)" className={`${cards ? 'flex-1 min-w-0' : 'w-36'} px-2 py-1.5 border border-gray-300 rounded text-sm`} />
                    <button onClick={() => submitAdd(m.month)} disabled={adding || !addCat}
                      className="px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 flex-shrink-0">
                      {adding ? '...' : 'Ajouter'}
                    </button>
                    <button onClick={() => setAddMonth(null)} className="p-1.5 hover:bg-gray-200 rounded flex-shrink-0"><X className="w-4 h-4 text-gray-500" /></button>
                  </div>
                </div>
              ) : (
                <button onClick={() => openAdd(m.month, presentCats)}
                  className="w-full flex items-center justify-center gap-1 px-2.5 py-1.5 text-xs text-purple-700 hover:bg-purple-50 border-t border-gray-100">
                  <Plus className="w-3.5 h-3.5" /> Ajouter un service
                </button>
              )
            )}
          </div>
        );
      })}
      </div>
    </div>
  );
}

// Liste récapitulative live des lignes sélectionnées (mise à jour à chaque saisie).
// Avec onAmount, chaque montant est modifiable directement dans le récapitulatif
// (appliquer une remise au moment de l'encaissement, ligne par ligne).
function SelectionList({ items, title = 'Sélection', onAmount }) {
  const total = items.reduce((t, i) => t + (Number(i.amount) || 0), 0);
  if (items.length === 0) return null;
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <div className="px-3 py-1.5 bg-gray-50 text-xs font-semibold text-gray-600">{title} ({items.length})</div>
      <div className="divide-y divide-gray-100 max-h-48 overflow-y-auto">
        {items.map((i, idx) => (
          <div key={idx} className="flex items-center justify-between gap-2 px-3 py-1.5 text-sm">
            <span className="text-gray-700 truncate">{i.label}</span>
            {onAmount ? (
              <input type="number" step="0.01" min="0" value={i.amount}
                onChange={e => onAmount(i, e.target.value)}
                className="w-24 px-2 py-1 text-sm text-right border border-gray-300 rounded flex-shrink-0" />
            ) : (
              <span className="font-medium text-gray-800 tabular-nums">{formatMAD(i.amount)}</span>
            )}
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between px-3 py-1.5 bg-green-50 text-sm font-semibold">
        <span className="text-gray-700">Total</span>
        <span className="text-green-700">{formatMAD(total)}</span>
      </div>
    </div>
  );
}

// ── Tuiles mensuelles compactes (cockpit) ────────────────────────────────────
// Une tuile colorée par mois : RESTE à payer en grand + (CA : total du mois).
// Émeraude = payé, ambre = partiel, rouge = impayé (foncé si en retard),
// gris = rien à facturer. Un clic sélectionne/désélectionne le mois entier ;
// les montants restent ajustables ligne par ligne avant l'encaissement.
function MonthTiles({ months, isMonthChecked, focusMonth, onOpenMonth, onSelectAll, onClear, hasSelection }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-700">Mois de l'année</h3>
        <div className="flex items-center gap-2">
          <button type="button" onClick={onSelectAll}
            className="text-xs px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-medium">
            ⚡ Tous les mois
          </button>
          {hasSelection && (
            <button type="button" onClick={onClear} className="text-xs px-2.5 py-1 rounded-lg text-gray-500 hover:bg-gray-100">
              Tout désélectionner
            </button>
          )}
        </div>
      </div>
      <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(130px,1fr))]">
        {(months || []).map(m => {
          const active = (m.services || []).filter(s => !(s.status === 'excluded' || s.excluded));
          const total = active.reduce((t, s) => t + Number(s.total || 0), 0);
          const remaining = active.reduce((t, s) => t + Number(s.remaining || 0), 0);
          const openable = total > 0 || (m.services || []).length > 0;
          const checked = isMonthChecked(m);
          const focused = focusMonth === m.month;
          let cls;
          if (total <= 0) cls = 'bg-gray-100 text-gray-400';
          else if (remaining <= 0) cls = 'bg-emerald-500 text-white';
          else if (m.status === 'overdue') cls = 'bg-red-600 text-white';
          else if (remaining < total) cls = 'bg-amber-400 text-white';
          else cls = 'bg-red-400 text-white';
          return (
            <button key={m.month} type="button" disabled={!openable} onClick={() => onOpenMonth(focused ? null : m.month)}
              title={openable ? 'Ouvrir la page de ce mois (frais, remises, encaissement)' : 'Rien à facturer ce mois'}
              className={`relative rounded-xl px-3 py-2.5 text-left shadow-sm transition-transform ${cls} ${openable ? 'hover:scale-[1.03] cursor-pointer' : 'cursor-default'} ${focused ? 'ring-2 ring-offset-2 ring-emerald-600' : checked ? 'ring-2 ring-offset-1 ring-emerald-400' : ''}`}>
              {checked && <CheckCircle2 className="w-4 h-4 absolute top-1.5 right-1.5" />}
              <p className="text-xs font-semibold truncate opacity-90">{m.label}</p>
              <p className="text-lg font-bold leading-tight tabular-nums">{formatMAD(remaining)}</p>
              <p className="text-[10px] opacity-80 tabular-nums">(CA : {formatMAD(total)})</p>
            </button>
          );
        })}
      </div>
      <p className="text-[10px] text-gray-400">
        Cliquez sur un mois pour ouvrir sa page : sélection des frais, remises (DH ou %),
        application aux autres mois, ajout d'un frais.
      </p>
    </div>
  );
}

// ── Onglet Encaissement : montant manuel réparti + mois × service ─────────────
function CollectTab({ student, academicYear, onChanged }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pool, setPool] = useState(''); // montant manuel global (optionnel)
  const [sel, setSel] = useState({});
  const [method, setMethod] = useState('cash');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [reference, setReference] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  // Plan de frais complet (items personnalisés + modèle) : sert au catalogue
  // d'ajout rapide des services avec leur montant prédéfini.
  const [planData, setPlanData] = useState(null);

  const load = async () => {
    setLoading(true);
    setSel({});
    try { setData(await financeApi.getMonthlyServicesStatus(student.id, academicYear)); }
    catch (e) { console.error(e); setData(null); }
    finally { setLoading(false); }
    try {
      // Les plans sont stockés en année « tiret » (2026-2027).
      const pd = await financeApi.getStudentPlan(student.id, String(academicYear).replace('/', '-'));
      setPlanData(pd.plans?.[0] || null);
    } catch (e) { console.error(e); }
  };

  const checkedItems = Object.values(sel).filter(s => s.checked);
  const allocated = checkedItems.reduce((t, s) => t + (Number(s.amount) || 0), 0);
  const poolNum = Number(pool) || 0;
  const leftover = poolNum - allocated;

  // Mois OUVERT (page du mois) : cartes de frais + remises, façon cockpit.
  const [focusMonth, setFocusMonth] = useState(null);
  // Ajout d'un frais dans le mois ouvert.
  const [addOpen, setAddOpen] = useState(false);
  const [addCat, setAddCat] = useState('');
  const [addAmount, setAddAmount] = useState('');
  const [addingSvc, setAddingSvc] = useState(false);

  // Coche un service : avec un montant manuel, on lui affecte automatiquement
  // ce qu'il reste du montant (sans dépasser son reste dû).
  const toggle = (month, svc) => {
    const k = keyOf(month, svc.category);
    setSel(prev => {
      if (prev[k]?.checked) { const cp = { ...prev }; delete cp[k]; return cp; }
      let amount = svc.remaining;
      if (poolNum > 0) {
        const already = Object.values(prev).filter(s => s.checked).reduce((t, s) => t + (Number(s.amount) || 0), 0);
        amount = Math.min(svc.remaining, Math.max(0, poolNum - already));
      }
      return { ...prev, [k]: { checked: true, amount: String(amount), month, category: svc.category } };
    });
  };
  const setAmount = (month, category, value) =>
    setSel(prev => ({ ...prev, [keyOf(month, category)]: { ...prev[keyOf(month, category)], amount: value } }));

  // Remise persistée d'un service (facturé) : plan (expected) − facturé (total).
  const persistedRemise = (svc) =>
    svc.invoice_id && Number(svc.expected) > Number(svc.total)
      ? Math.round((Number(svc.expected) - Number(svc.total)) * 100) / 100
      : 0;

  // ── Remise (DH ou %) sur UN frais, appliquée à PLUSIEURS mois ──────────────
  // Un clic sur « % Remise » ouvre le sélecteur : par défaut le mois ouvert et
  // TOUS les mois suivants où ce frais reste dû (les mois déjà passés/soldés
  // restent décochables/cochables à la main). La remise est persistée (réduit
  // le dû) — elle n'encaisse rien.
  const [remiseModal, setRemiseModal] = useState(null); // { category, name }
  const [remiseVal, setRemiseVal] = useState('');
  const [remiseType, setRemiseType] = useState('amount'); // 'amount' (DH) | 'percent'
  const [remiseMonths, setRemiseMonths] = useState(new Set());
  const [applyingRemise, setApplyingRemise] = useState(false);

  // Mois où CE frais est encore dû (candidats à la remise), dans l'ordre de
  // l'année scolaire.
  const remiseCandidates = (category) =>
    (data?.months || []).filter(m => monthPayables(m).some(s => s.category === category));

  const openRemise = (svc) => {
    const cands = remiseCandidates(svc.category);
    const startIdx = (data?.months || []).findIndex(m => m.month === focusMonth);
    // Défaut : à partir du mois ouvert, tous les mois restants encore dus.
    const fromHere = cands.filter(m => (data?.months || []).findIndex(x => x.month === m.month) >= startIdx);
    setRemiseModal({ category: svc.category, name: serviceLabel(svc) });
    setRemiseType('amount');
    setRemiseVal('');
    setRemiseMonths(new Set((fromHere.length ? fromHere : cands).map(m => m.month)));
  };

  // Montant de la remise pour un mois donné (le % est recalculé sur son dû).
  const remiseAmountFor = (svc, type, value) => {
    const val = Math.max(0, Number(value) || 0);
    return type === 'percent'
      ? Math.min(svc.remaining, Math.round(svc.remaining * val) / 100)
      : Math.min(svc.remaining, val);
  };

  const submitRemise = async () => {
    if (!remiseModal) return;
    const items = [];
    (data?.months || []).filter(m => remiseMonths.has(m.month)).forEach(m => {
      const svc = monthPayables(m).find(x => x.category === remiseModal.category);
      if (!svc) return;
      const disc = remiseAmountFor(svc, remiseType, remiseVal);
      if (disc > 0) items.push({ month: m.month, category: remiseModal.category, discount: disc });
    });
    if (items.length === 0) { alert('Saisissez une remise et sélectionnez au moins un mois.'); return; }
    setApplyingRemise(true);
    try {
      const res = await financeApi.applyDiscount(student.id, { academic_year: academicYear, items });
      alert(`Remise appliquée à ${res.applied} frais (${remiseModal.name}).`);
      setRemiseModal(null);
      await load();
      onChanged?.();
    } catch (e) { alert('Erreur: ' + e.message); }
    finally { setApplyingRemise(false); }
  };

  // Ajout DIRECT d'un service du plan/modèle (montant prédéfini) au mois ouvert.
  const [quickAdding, setQuickAdding] = useState(null);
  const quickAddService = async (month, q) => {
    setQuickAdding(q.category);
    // Montant transmis explicitement : un accessoire du modèle absent du plan
    // n'a pas de montant calculable côté serveur pour ce mois.
    try { await addServiceToMonth(month, q.category, q.amount != null ? q.amount : '', q.name); }
    finally { setQuickAdding(null); }
  };

  // Sélection d'un mois ENTIER depuis une tuile : coche tous les services
  // restants du mois (ou décoche tout si déjà tous cochés).
  const monthPayables = (m) => (m.services || []).filter(s => !(s.status === 'excluded' || s.excluded) && s.remaining > 0);
  const isMonthChecked = (m) => {
    const p = monthPayables(m);
    return p.length > 0 && p.every(s => sel[keyOf(m.month, s.category)]?.checked);
  };
  const toggleMonth = (m) => {
    const p = monthPayables(m);
    if (p.length === 0) return;
    const all = isMonthChecked(m);
    p.forEach(s => {
      const checked = !!sel[keyOf(m.month, s.category)]?.checked;
      if (all ? checked : !checked) toggle(m.month, s);
    });
  };
  const selectAllMonths = () =>
    (data?.months || []).forEach(m => monthPayables(m).forEach(s => {
      if (!sel[keyOf(m.month, s.category)]?.checked) toggle(m.month, s);
    }));

  // Libellé d'une ligne sélectionnée (pour la liste live).
  const labelFor = (item) => {
    const mo = (data?.months || []).find(m => m.month === item.month);
    const svc = mo?.services.find(s => (s.category || 'bundle') === (item.category || 'bundle'));
    return `${mo?.label || item.month} — ${serviceLabel(svc)}`;
  };
  const listItems = checkedItems.map(s => ({ label: labelFor(s), amount: s.amount, month: s.month, category: s.category }));

  // Annuler / supprimer / exclure un service selon son état :
  //  - payé          → annule le paiement (le service redevient dû)
  //  - facturé impayé → supprime la facturation (retiré du dû)
  //  - pas facturé    → exclut le service avant paiement (marqueur)
  const cancelService = async (month, svc) => {
    const paid = Number(svc.paid) > 0;
    try {
      if (svc.invoice_id) {
        const verb = paid ? 'Annuler le paiement de' : 'Supprimer';
        const reason = prompt(`${verb} « ${serviceLabel(svc)} » ? Motif :`);
        if (reason === null) return;
        await financeApi.cancelServicePayment(student.id, {
          invoice_id: svc.invoice_id, reason, cancel_invoice: !paid,
        });
      } else {
        const reason = prompt(`Exclure « ${serviceLabel(svc)} » de ce mois (avant paiement) ? Motif :`);
        if (reason === null) return;
        await financeApi.cancelServicePayment(student.id, {
          reason, cancel_invoice: true, academic_year: academicYear, month, category: svc.category,
        });
      }
      await load();
      onChanged?.();
    } catch (e) { alert('Erreur: ' + e.message); }
  };

  // Réintègre un service exclu (supprime le marqueur d'exclusion).
  const restoreService = async (month, svc) => {
    if (!confirm(`Réintégrer « ${serviceLabel(svc)} » dans ce mois ?`)) return;
    try {
      await financeApi.restoreService(student.id, { academic_year: academicYear, month, category: svc.category });
      await load();
      onChanged?.();
    } catch (e) { alert('Erreur: ' + e.message); }
  };

  // Catalogue des services enregistrés dans le plan de l'élève (catégorie → nom
  // personnalisé), reconstruit depuis les mois. Sert à proposer à l'ajout les
  // vrais noms de services déjà enregistrés plutôt que des catégories génériques.
  const serviceCatalog = useMemo(() => {
    const map = new Map();
    (data?.months || []).forEach(m => (m.services || []).forEach(svc => {
      if (svc.category && !map.has(svc.category)) map.set(svc.category, serviceLabel(svc));
    }));
    return Array.from(map.entries());
  }, [data]);

  // Ajoute (facture) un service à un mois — montant auto (plan) ou manuel.
  const addServiceToMonth = async (month, category, amount, name) => {
    try {
      await financeApi.addService(student.id, {
        academic_year: academicYear, month, category, name: name || undefined,
        amount: amount !== '' ? Number(amount) : undefined,
      });
      await load();
      onChanged?.();
    } catch (e) { alert('Erreur: ' + e.message); throw e; }
  };

  const submit = async () => {
    if (checkedItems.length === 0) return;
    if (!confirm(`Encaisser ${checkedItems.length} ligne(s) — total ${formatMAD(allocated)} ?`)) return;
    setSaving(true);
    try {
      const items = checkedItems.map(s => ({ month: s.month, category: s.category || null, amount: Number(s.amount) || undefined }));
      const res = await financeApi.payServices(student.id, {
        academic_year: academicYear, items, payment_date: paymentDate, method, reference: reference || undefined,
        batch_id: crypto.randomUUID(),
      });
      alert(`${res.paid_count} encaissement(s) · ${formatMAD(res.total_paid)}`);
      setPool('');
      await load();
      onChanged?.();
    } catch (e) { alert('Erreur: ' + e.message); }
    finally { setSaving(false); }
  };

  if (loading) return <p className="text-gray-500 py-8 text-center">Chargement...</p>;
  if (!data?.plan_exists) return (
    <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-4 text-sm">
      Aucun plan de frais actif pour {academicYear}. Définissez d'abord un « Plan de frais ».
    </div>
  );

  const s = data.summary;

  // Couleur d'une pastille/tuile de mois selon son état de paiement.
  const monthColor = (m) => {
    const act = (m.services || []).filter(x => !(x.status === 'excluded' || x.excluded));
    const total = act.reduce((t, x) => t + Number(x.total || 0), 0);
    const remaining = act.reduce((t, x) => t + Number(x.remaining || 0), 0);
    if (total <= 0) return 'bg-gray-100 text-gray-400';
    if (remaining <= 0) return 'bg-emerald-500 text-white';
    if (m.status === 'overdue') return 'bg-red-600 text-white';
    if (remaining < total) return 'bg-amber-400 text-white';
    return 'bg-red-400 text-white';
  };

  // Panneau d'encaissement (récap modifiable + mode/date/référence) — partagé
  // entre la vue d'ensemble et la colonne droite de la page d'un mois.
  const paymentPanel = checkedItems.length === 0 ? (
    <div className="border border-dashed border-gray-300 rounded-lg p-4 text-center text-xs text-gray-400">
      Sélectionnez des frais pour préparer l'encaissement.
    </div>
  ) : (
    <div className="space-y-3">
      <SelectionList items={listItems} title="Paiement en cours" onAmount={(i, v) => setAmount(i.month, i.category, v)} />
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Mode de paiement</label>
            <select value={method} onChange={e => setMethod(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
              {Object.entries(METHOD_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Date</label>
            <input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          </div>
        </div>
        <input type="text" value={reference} onChange={e => setReference(e.target.value)} placeholder="Référence (optionnel)" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">{checkedItems.length} ligne(s) · <span className="font-bold text-green-700">{formatMAD(allocated)}</span></span>
          <Button color="green" icon={Wallet} onClick={submit} disabled={saving}>
            {saving ? 'Encaissement...' : 'Encaisser'}
          </Button>
        </div>
      </div>
    </div>
  );

  const focus = (data?.months || []).find(m => m.month === focusMonth);

  // ── PAGE DÉDIÉE DU MOIS : remplace toute la vue (aucun défilement) ─────────
  if (focus) {
    const active = focus.services.filter(x => !(x.status === 'excluded' || x.excluded));
    const monthTotal = active.reduce((t, x) => t + Number(x.total || 0), 0);
    const monthRemaining = active.reduce((t, x) => t + Number(x.remaining || 0), 0);
    const payables = monthPayables(focus);
    const allChecked = isMonthChecked(focus);
    const presentCats = new Set(focus.services.map(x => x.category).filter(Boolean));
    // Catalogue d'ajout direct : items du PLAN de l'élève (personnalisés) PUIS
    // accessoires du MODÈLE non repris dans le plan (transport, cantine… exclus
    // par l'application « frais de base seuls ») — chacun avec son montant
    // prédéfini. Repli : services déjà facturés d'autres mois.
    const catalogMap = new Map();
    if (planData) {
      (planData.custom_items || []).filter(it => it.enabled !== false)
        .forEach(it => { if (it.category && !catalogMap.has(it.category)) catalogMap.set(it.category, { category: it.category, name: it.name, amount: Number(it.amount) || 0 }); });
      (planData.template?.fee_template_items || [])
        .forEach(it => { if (it.category && !catalogMap.has(it.category)) catalogMap.set(it.category, { category: it.category, name: it.name, amount: Number(it.amount) || 0 }); });
    }
    serviceCatalog.forEach(([c, name]) => {
      if (catalogMap.has(c)) return;
      let amount = null;
      for (const mo of data.months) {
        const found = (mo.services || []).find(x => x.category === c && !(x.status === 'excluded' || x.excluded));
        if (found) { amount = found.total; break; }
      }
      catalogMap.set(c, { category: c, name, amount });
    });
    const planQuickAdd = [...catalogMap.values()].filter(q => !presentCats.has(q.category));
    // Tout autre frais (catégories hors plan/modèle) → petit formulaire.
    const otherCats = Object.entries(CATEGORY_LABELS)
      .filter(([c]) => !presentCats.has(c) && !catalogMap.has(c));
    const modalCandidates = remiseModal ? remiseCandidates(remiseModal.category) : [];

    return (
      <div className="space-y-3">
        {/* Bandeau : retour + pastilles de tous les mois (navigation sans défilement) */}
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setFocusMonth(null)}
            className="flex items-center gap-1 px-2.5 py-1.5 text-sm rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium">
            <ArrowLeft className="w-4 h-4" /> Mois
          </button>
          {(data.months || []).map(m => (
            <button key={m.month} onClick={() => setFocusMonth(m.month)} title={m.label}
              className={`w-9 h-9 rounded-full text-xs font-bold shadow-sm ${monthColor(m)} ${m.month === focus.month ? 'ring-2 ring-offset-1 ring-emerald-600' : ''}`}>
              {m.month}
            </button>
          ))}
        </div>

        <div className="grid lg:grid-cols-[minmax(0,1fr),330px] gap-4 items-start">
          {/* Page du mois : cartes de frais */}
          <div className="border-2 border-emerald-300 rounded-xl bg-white overflow-hidden shadow-sm">
            <div className="flex items-center justify-between gap-2 flex-wrap px-4 py-2.5 bg-emerald-50 border-b border-emerald-100">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-gray-800">{focus.label}</h3>
                <span className="text-xs text-gray-500">
                  CA {formatMAD(monthTotal)} · {monthRemaining > 0 ? `reste ${formatMAD(monthRemaining)}` : 'soldé ✓'}
                </span>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {payables.length > 0 && (
                  <button onClick={() => toggleMonth(focus)}
                    className="text-xs px-2.5 py-1 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 font-medium">
                    {allChecked ? 'Tout décocher' : '⚡ Tout sélectionner'}
                  </button>
                )}
              </div>
            </div>

            <div className="p-3 grid gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(200px,1fr))]">
              {focus.services.map(svc => {
                const k = keyOf(focus.month, svc.category);
                const entry = sel[k];
                const checked = !!entry?.checked;
                const excluded = svc.status === 'excluded' || svc.excluded;
                const payable = !excluded && svc.remaining > 0;
                const hasPaid = Number(svc.paid) > 0;
                const remiseDone = persistedRemise(svc);
                let cardCls = 'border-gray-200 bg-white hover:border-emerald-400 cursor-pointer';
                if (excluded) cardCls = 'border-gray-200 bg-gray-50 opacity-70';
                else if (!payable) cardCls = 'border-emerald-200 bg-emerald-50';
                else if (checked) cardCls = 'border-emerald-600 bg-emerald-500 text-white shadow cursor-pointer';
                return (
                  <div key={k} onClick={payable ? () => toggle(focus.month, svc) : undefined}
                    className={`relative border-2 rounded-xl p-3 text-center transition-colors ${cardCls}`}>
                    <div className="absolute top-1.5 right-1.5 flex items-center gap-0.5">
                      {svc.invoice_id && (
                        <button onClick={(e) => { e.stopPropagation(); financeApi.openInvoicePdf(svc.invoice_id).catch(err => alert('Erreur impression: ' + err.message)); }}
                          title="Imprimer la facture" className="p-1 rounded hover:bg-black/10">
                          <Printer className={`w-3.5 h-3.5 ${checked ? 'text-white' : 'text-blue-600'}`} />
                        </button>
                      )}
                      {excluded ? (
                        <button onClick={(e) => { e.stopPropagation(); restoreService(focus.month, svc); }}
                          title="Réintégrer ce frais" className="p-1 rounded hover:bg-green-100">
                          <RotateCcw className="w-3.5 h-3.5 text-green-600" />
                        </button>
                      ) : (svc.invoice_id || payable) && (
                        <button onClick={(e) => { e.stopPropagation(); cancelService(focus.month, svc); }}
                          title={hasPaid ? 'Annuler le paiement' : (svc.invoice_id ? 'Supprimer ce frais' : 'Exclure ce frais')}
                          className="p-1 rounded hover:bg-black/10">
                          <Ban className={`w-3.5 h-3.5 ${checked ? 'text-white' : 'text-red-500'}`} />
                        </button>
                      )}
                    </div>
                    {checked && <CheckCircle2 className="w-4 h-4 absolute top-1.5 left-1.5 text-white" />}
                    {!payable && !excluded && <CheckCircle2 className="w-4 h-4 absolute top-1.5 left-1.5 text-emerald-500" />}

                    <p className={`text-sm font-semibold truncate mt-1 ${excluded ? 'line-through text-gray-400' : ''}`}>
                      {serviceLabel(svc)}
                    </p>

                    {excluded ? (
                      <p className="text-xs text-gray-400 mt-1.5">Exclu</p>
                    ) : !payable ? (
                      <p className="text-sm font-bold text-emerald-600 mt-1.5">Payé ✓ <span className="font-normal text-xs text-gray-400">({formatMAD(svc.total)})</span></p>
                    ) : (
                      <>
                        {remiseDone > 0 ? (
                          <p className="mt-1.5 leading-tight">
                            <span className="text-xs line-through opacity-70">{formatMAD(svc.expected)}</span>{' '}
                            <span className="text-lg font-bold tabular-nums">{formatMAD(checked ? entry.amount : svc.remaining)}</span>
                          </p>
                        ) : (
                          <p className="text-lg font-bold tabular-nums mt-1.5">{formatMAD(checked ? entry.amount : svc.remaining)}</p>
                        )}
                        {hasPaid && <p className="text-[10px] opacity-80">déjà payé {formatMAD(svc.paid)}</p>}

                        <button onClick={(e) => {
                            e.stopPropagation();
                            openRemise(svc);
                          }}
                          title="Réduit le dû de ce frais sur les mois choisis — n'encaisse rien"
                          className={`mt-2 px-2.5 py-1 text-xs font-medium rounded-full ${checked ? 'bg-white text-emerald-700 hover:bg-emerald-50' : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'}`}>
                          % Remise{remiseDone > 0 ? ` (−${formatMAD(remiseDone)})` : ''}
                        </button>
                      </>
                    )}
                  </div>
                );
              })}

              {/* Services du plan non facturés ce mois : ajout direct, montant prédéfini */}
              {planQuickAdd.map(q => (
                <button key={q.category} type="button" disabled={quickAdding === q.category}
                  onClick={() => quickAddService(focus.month, q)}
                  title="Ajouter ce service du plan à ce mois (montant prédéfini du plan)"
                  className="border-2 border-dashed border-emerald-300 rounded-xl p-3 flex flex-col items-center justify-center gap-0.5 text-emerald-700 hover:bg-emerald-50 min-h-[90px] disabled:opacity-50">
                  <Plus className="w-4 h-4" />
                  <span className="text-sm font-semibold truncate max-w-full">{q.name}</span>
                  <span className="text-xs">
                    {quickAdding === q.category ? 'Ajout…' : (q.amount != null ? `${formatMAD(q.amount)} (plan)` : 'montant du plan')}
                  </span>
                </button>
              ))}

              {/* Tout autre frais (hors plan) : catégorie + montant */}
              {otherCats.length > 0 && (addOpen ? (
                <div className="border-2 border-dashed border-purple-300 rounded-xl p-3 space-y-1.5 bg-purple-50/40">
                  <select value={addCat} onChange={e => setAddCat(e.target.value)}
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded bg-white">
                    {otherCats.map(([c, v]) => <option key={c} value={c}>{v}</option>)}
                  </select>
                  <input type="number" step="0.01" min="0" value={addAmount} onChange={e => setAddAmount(e.target.value)}
                    placeholder="Montant" className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded" />
                  <div className="flex items-center gap-1.5">
                    <button disabled={addingSvc || !addCat}
                      onClick={async () => {
                        setAddingSvc(true);
                        const name = (otherCats.find(([c]) => c === addCat) || [])[1];
                        try { await addServiceToMonth(focus.month, addCat, addAmount, name); setAddOpen(false); }
                        finally { setAddingSvc(false); }
                      }}
                      className="flex-1 px-2 py-1.5 text-sm bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50">
                      {addingSvc ? '...' : 'Ajouter'}
                    </button>
                    <button onClick={() => setAddOpen(false)} className="p-1.5 rounded hover:bg-gray-200">
                      <X className="w-4 h-4 text-gray-500" />
                    </button>
                  </div>
                </div>
              ) : (
                <button onClick={() => { setAddOpen(true); setAddCat(otherCats[0]?.[0] || ''); setAddAmount(''); }}
                  className="border-2 border-dashed border-gray-300 rounded-xl p-3 flex flex-col items-center justify-center gap-1 text-sm text-purple-700 hover:border-purple-400 hover:bg-purple-50 min-h-[90px]">
                  <Plus className="w-5 h-5" /> Autre frais
                </button>
              ))}
            </div>
          </div>

          {/* Colonne paiement : toujours visible, aucun défilement nécessaire */}
          <div className="lg:sticky lg:top-3">{paymentPanel}</div>
        </div>

        {/* Remise d'un service sur un ou plusieurs mois */}
        {remiseModal && (
          <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setRemiseModal(null)}>
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-4 space-y-3" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-gray-800">Appliquer une remise</h3>
                  <p className="text-xs text-gray-500 mt-0.5">{remiseModal.name}</p>
                </div>
                <button onClick={() => setRemiseModal(null)} className="p-1 rounded hover:bg-gray-100">
                  <X className="w-4 h-4 text-gray-500" />
                </button>
              </div>
              <div className="flex items-center gap-2">
                <input type="number" min="0" step="0.01" autoFocus value={remiseVal}
                  onChange={e => setRemiseVal(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') submitRemise(); }}
                  className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg" placeholder="Montant de la remise" />
                <select value={remiseType} onChange={e => setRemiseType(e.target.value)}
                  className="px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white">
                  <option value="amount">DH</option>
                  <option value="percent">%</option>
                </select>
              </div>
              <p className="text-xs text-gray-500">La remise réduit le dû sans enregistrer d'encaissement.</p>
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input type="checkbox"
                  checked={modalCandidates.length > 0 && modalCandidates.every(m => remiseMonths.has(m.month))}
                  onChange={e => setRemiseMonths(e.target.checked ? new Set(modalCandidates.map(m => m.month)) : new Set())}
                  className="w-4 h-4 accent-emerald-600" />
                Tous les mois
              </label>
              <div className="grid grid-cols-3 gap-2 max-h-64 overflow-y-auto">
                {modalCandidates.map(m => {
                  const on = remiseMonths.has(m.month);
                  const svc = monthPayables(m).find(x => x.category === remiseModal.category);
                  return (
                    <button key={m.month} type="button"
                      onClick={() => setRemiseMonths(prev => { const n = new Set(prev); if (on) n.delete(m.month); else n.add(m.month); return n; })}
                      className={`rounded-xl px-2 py-2.5 text-center border-2 text-sm font-semibold transition-colors ${on ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-gray-200 bg-white text-gray-700 hover:border-emerald-300'}`}>
                      {m.label}
                      <span className={`block text-[10px] font-normal ${on ? 'opacity-80' : 'text-gray-400'}`}>
                        reste {formatMAD(svc?.remaining || 0)}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center justify-end gap-2 pt-1">
                <button onClick={() => setRemiseModal(null)} className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
                  Annuler
                </button>
                <button onClick={submitRemise} disabled={remiseMonths.size === 0 || applyingRemise || !(Number(remiseVal) > 0)}
                  className="px-4 py-1.5 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 font-medium">
                  {applyingRemise ? 'Application…' : `Valider (${remiseMonths.size})`}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Situation élève : chiffre d'affaires / payé / reste, d'un coup d'œil. */}
      {s && (
        <div className={`rounded-lg border overflow-hidden ${s.all_paid ? 'border-green-200' : 'border-gray-200'}`}>
          <div className="grid grid-cols-3 divide-x divide-gray-200 text-center">
            <div className="p-3 bg-gray-50">
              <p className="text-[11px] text-gray-500">Chiffre d'affaires</p>
              <p className="text-lg font-bold text-gray-800 tabular-nums">{formatMAD(s.expected_total)}</p>
            </div>
            <div className="p-3 bg-green-50/60">
              <p className="text-[11px] text-gray-500">Montant payé</p>
              <p className="text-lg font-bold text-green-700 tabular-nums">{formatMAD(s.paid_total)}</p>
            </div>
            <div className={`p-3 ${s.all_paid ? 'bg-green-50/60' : 'bg-orange-50/60'}`}>
              <p className="text-[11px] text-gray-500">Reste à payer</p>
              <p className={`text-lg font-bold tabular-nums ${s.all_paid ? 'text-green-700' : 'text-orange-600'}`}>
                {s.all_paid ? 'Tout payé ✓' : formatMAD(s.remaining_total)}
              </p>
            </div>
          </div>
          <div className="px-3 py-1 bg-white text-[11px] text-gray-400 text-right border-t border-gray-100">
            {s.paid_months}/{s.total_months} mois payés
          </div>
        </div>
      )}

      {/* Tuiles mensuelles : vue d'ensemble + ouverture de la page d'un mois. */}
      <MonthTiles months={data.months} isMonthChecked={isMonthChecked} focusMonth={focusMonth}
        onOpenMonth={setFocusMonth} onSelectAll={selectAllMonths} onClear={() => setSel({})}
        hasSelection={checkedItems.length > 0} />

      {/* Montant manuel à répartir */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-2">
        <label className="block text-xs font-medium text-gray-600">Montant à encaisser (optionnel — réparti automatiquement)</label>
        <div className="flex items-center gap-2">
          <input type="number" step="0.01" min="0" value={pool} onChange={e => setPool(e.target.value)}
            placeholder="Ex : 1000" className="w-40 px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          {poolNum > 0 && (
            <span className="text-xs text-gray-600">
              Réparti : <strong>{formatMAD(allocated)}</strong> ·
              {leftover >= 0
                ? <> Reste à affecter : <strong className="text-blue-700">{formatMAD(leftover)}</strong></>
                : <strong className="text-red-600"> Dépassement de {formatMAD(-leftover)}</strong>}
            </span>
          )}
        </div>
        <p className="text-xs text-gray-400">
          Saisissez un montant puis cochez les services : il est soustrait automatiquement, ligne par ligne. Le reste
          peut être affecté à d'autres services. Vous pouvez aussi ajuster chaque montant à la main.
        </p>
      </div>

      {/* La page d'un mois s'ouvre en vue dédiée via les tuiles ci-dessus. */}
      <p className="text-sm text-gray-400 italic text-center py-2">
        Cliquez sur un mois ci-dessus pour ouvrir sa page — frais, remises et encaissement.
      </p>

      {checkedItems.length > 0 && paymentPanel}
    </div>
  );
}

// ── Onglet Famille / groupé : par enfant, mois payés cochés/verrouillés ───────
function FamilyTab({ student, allStudents, academicYear, onChanged }) {
  const [members, setMembers] = useState([student]);
  const [selectedIds, setSelectedIds] = useState(new Set([student.id]));
  const [search, setSearch] = useState('');
  const [statusById, setStatusById] = useState({}); // id -> monthly-services-status
  const [selById, setSelById] = useState({}); // id -> { key -> {checked, amount, month, category} }
  const [loadingIds, setLoadingIds] = useState(new Set());
  const [method, setMethod] = useState('cash');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [reference, setReference] = useState('');
  const [paying, setPaying] = useState(false);

  // Frères/sœurs auto (parent commun)
  useEffect(() => {
    (async () => {
      try {
        const res = await financeApi.getSiblings(student.id, academicYear);
        const sibs = res.siblings || [];
        if (sibs.length) {
          setMembers(prev => { const ids = new Set(prev.map(m => m.id)); return [...prev, ...sibs.filter(s => !ids.has(s.id))]; });
          setSelectedIds(prev => { const n = new Set(prev); sibs.forEach(s => n.add(s.id)); return n; });
        }
      } catch (e) { console.error(e); }
    })();
    /* eslint-disable-next-line */
  }, [student.id]);

  // Charge le statut des enfants sélectionnés non encore chargés
  useEffect(() => {
    [...selectedIds].forEach(async (id) => {
      if (statusById[id] || loadingIds.has(id)) return;
      setLoadingIds(prev => new Set(prev).add(id));
      try {
        const d = await financeApi.getMonthlyServicesStatus(id, academicYear);
        setStatusById(prev => ({ ...prev, [id]: d }));
      } catch (e) { console.error(e); }
      finally { setLoadingIds(prev => { const n = new Set(prev); n.delete(id); return n; }); }
    });
    /* eslint-disable-next-line */
  }, [selectedIds]);

  const reloadStatus = async (id) => {
    try { const d = await financeApi.getMonthlyServicesStatus(id, academicYear); setStatusById(prev => ({ ...prev, [id]: d })); }
    catch (e) { console.error(e); }
  };

  const toggleMember = (id) => setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const memberIds = new Set(members.map(m => m.id));
  const searchResults = search.trim().length >= 1
    ? allStudents.filter(s => !memberIds.has(s.id) && fullName(s).toLowerCase().includes(search.toLowerCase())).slice(0, 6)
    : [];
  const addMember = (s) => {
    setMembers(prev => [...prev, s]);
    setSelectedIds(prev => new Set(prev).add(s.id));
    setSearch('');
  };
  const removeMember = (id) => {
    if (id === student.id) return;
    setMembers(prev => prev.filter(m => m.id !== id));
    setSelectedIds(prev => { const n = new Set(prev); n.delete(id); return n; });
  };

  const toggleSvc = (childId, month, svc) => {
    const k = keyOf(month, svc.category);
    setSelById(prev => {
      const childSel = { ...(prev[childId] || {}) };
      if (childSel[k]?.checked) delete childSel[k];
      else childSel[k] = { checked: true, amount: String(svc.remaining), month, category: svc.category };
      return { ...prev, [childId]: childSel };
    });
  };
  const setSvcAmount = (childId, month, category, value) => {
    const k = keyOf(month, category);
    setSelById(prev => ({ ...prev, [childId]: { ...(prev[childId] || {}), [k]: { ...(prev[childId]?.[k]), amount: value } } }));
  };

  // Liste live agrégée (tous enfants sélectionnés)
  const listItems = [];
  [...selectedIds].forEach(id => {
    const member = members.find(m => m.id === id);
    const data = statusById[id];
    Object.values(selById[id] || {}).filter(s => s.checked).forEach(s => {
      const mo = (data?.months || []).find(m => m.month === s.month);
      const svc = mo?.services.find(x => (x.category || 'bundle') === (s.category || 'bundle'));
      listItems.push({ label: `${member ? fullName(member) : ''} · ${mo?.label || s.month} — ${serviceLabel(svc)}`, amount: s.amount, childId: id, month: s.month, category: s.category });
    });
  });
  const grandTotal = listItems.reduce((t, i) => t + (Number(i.amount) || 0), 0);

  // Total sélectionné par enfant — affiché en direct sur sa carte (façon
  // « IMRANE 2 150 DH » : on voit la part de chaque enfant dans le paiement).
  const childSelectedTotal = (id) =>
    Object.values(selById[id] || {}).filter(s => s.checked).reduce((t, s) => t + (Number(s.amount) || 0), 0);

  const runPay = async () => {
    if (listItems.length === 0) return;
    if (!confirm(`Encaisser ${listItems.length} ligne(s) pour la famille — total ${formatMAD(grandTotal)} ?`)) return;
    setPaying(true);
    try {
      let count = 0, total = 0;
      // Un seul lot pour toute la famille → 1 reçu unique couvrant tous les élèves.
      const batchId = crypto.randomUUID();
      for (const id of [...selectedIds]) {
        const items = Object.values(selById[id] || {}).filter(s => s.checked)
          .map(s => ({ month: s.month, category: s.category || null, amount: Number(s.amount) || undefined }));
        if (items.length === 0) continue;
        const res = await financeApi.payServices(id, { academic_year: academicYear, items, payment_date: paymentDate, method, reference: reference || undefined, batch_id: batchId });
        count += res.paid_count || 0; total += res.total_paid || 0;
        setSelById(prev => ({ ...prev, [id]: {} }));
        await reloadStatus(id);
      }
      alert(`Famille : ${count} encaissement(s) · ${formatMAD(total)}`);
      onChanged?.();
    } catch (e) { alert('Erreur: ' + e.message); }
    finally { setPaying(false); }
  };

  return (
    <div className="space-y-4">
      {/* Membres */}
      <div>
        <h4 className="text-sm font-semibold text-gray-800 mb-2">Membres concernés</h4>
        <div className="space-y-1.5">
          {members.map(m => (
            <div key={m.id} className={`flex items-center gap-2 p-2 border rounded-lg ${selectedIds.has(m.id) ? 'border-green-300 bg-green-50/50' : 'border-gray-200'}`}>
              <input type="checkbox" checked={selectedIds.has(m.id)} onChange={() => toggleMember(m.id)} className="w-4 h-4 accent-green-600" />
              <Avatar name={fullName(m)} size="sm" gender={m.gender || ''} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{fullName(m)}{m.id === student.id && <span className="text-xs text-gray-400"> (élève)</span>}</div>
                <div className="text-xs text-gray-500">{m.classes?.name || '—'}</div>
              </div>
              {childSelectedTotal(m.id) > 0 && (
                <span className="text-sm font-bold text-emerald-700 tabular-nums px-2 py-0.5 bg-emerald-50 rounded-lg" title="Montant sélectionné pour cet enfant">
                  {formatMAD(childSelectedTotal(m.id))}
                </span>
              )}
              {statusById[m.id]?.summary && (
                <span className={`text-xs font-medium ${statusById[m.id].summary.remaining_total > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                  {statusById[m.id].summary.remaining_total > 0 ? `Reste ${formatMAD(statusById[m.id].summary.remaining_total)}` : 'À jour'}
                </span>
              )}
              {m.id !== student.id && (
                <button onClick={() => removeMember(m.id)} className="p-1 hover:bg-red-100 rounded"><X className="w-3.5 h-3.5 text-red-500" /></button>
              )}
            </div>
          ))}
        </div>
        {/* Ajouter par recherche */}
        <div className="relative mt-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Ajouter un frère/sœur (rechercher un élève)..."
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm" />
          {searchResults.length > 0 && (
            <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
              {searchResults.map(s => (
                <button key={s.id} onClick={() => addMember(s)} className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50">
                  <Avatar name={fullName(s)} size="sm" gender={s.gender || ''} />
                  <span className="flex-1 truncate">{fullName(s)}</span>
                  <span className="text-xs text-gray-400">{s.classes?.name || ''}</span>
                  <Plus className="w-4 h-4 text-green-600" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Par enfant : en colonnes si plusieurs (nom en haut, mois & services en bas) */}
      {(() => {
        const selArr = [...selectedIds];
        const multi = selArr.length > 1;
        return (
          <div className={multi ? 'flex gap-3 overflow-x-auto pb-2' : 'space-y-3'}>
            {selArr.map(id => {
              const member = members.find(m => m.id === id);
              const data = statusById[id];
              return (
                <div key={id} className={multi ? 'w-[300px] flex-shrink-0' : ''}>
                  <ChildSection member={member} data={data} loading={loadingIds.has(id)} column={multi}
                    sel={selById[id] || {}}
                    onToggle={(month, svc) => toggleSvc(id, month, svc)}
                    onAmount={(month, cat, val) => setSvcAmount(id, month, cat, val)} />
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* Liste live + paiement — montants modifiables (remise à l'entrée) */}
      {listItems.length > 0 && (
        <div className="space-y-3">
          <SelectionList items={listItems} title="Détail à encaisser"
            onAmount={(i, v) => setSvcAmount(i.childId, i.month, i.category, v)} />
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Mode</label>
                <select value={method} onChange={e => setMethod(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                  {Object.entries(METHOD_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Date</label>
                <input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              </div>
            </div>
            <input type="text" value={reference} onChange={e => setReference(e.target.value)} placeholder="Référence (optionnel)" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">{listItems.length} ligne(s) · <span className="font-bold text-green-700">{formatMAD(grandTotal)}</span></span>
              <Button color="green" icon={Wallet} onClick={runPay} disabled={paying}>
                {paying ? 'Encaissement...' : 'Encaisser la famille'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Bloc d'un enfant avec sa grille mois × service.
// column=true : carte verticale (nom + infos en haut, mois en bas) pour la vue multi-colonnes.
function ChildSection({ member, data, loading, sel, onToggle, onAmount, column = false }) {
  const [open, setOpen] = useState(true);
  if (!member) return null;
  const summary = data?.summary;
  const summaryLine = summary && (
    <span className={`text-xs ${summary.remaining_total > 0 ? 'text-orange-600' : 'text-green-600'}`}>
      {summary.paid_months}/{summary.total_months} mois · {summary.remaining_total > 0 ? `reste ${formatMAD(summary.remaining_total)}` : 'à jour'}
    </span>
  );
  const body = loading ? <p className="text-xs text-gray-400 py-3 text-center">Chargement...</p>
    : !data?.plan_exists ? <p className="text-xs text-amber-600 py-2">Aucun plan de frais pour cette année.</p>
    : <MonthsServicesGrid months={data.months} sel={sel} onToggle={onToggle} onAmount={onAmount} compact={column} />;

  if (column) {
    return (
      <div className="border border-gray-200 rounded-lg h-full flex flex-col">
        <div className="flex flex-col items-center text-center gap-1 p-3 border-b border-gray-100 bg-gray-50 rounded-t-lg">
          <Avatar name={fullName(member)} size="md" gender={member.gender || ''} />
          <div className="font-medium text-sm truncate w-full">{fullName(member)}</div>
          <div className="text-xs text-gray-500">{member.classes?.name || '—'}</div>
          {summaryLine}
        </div>
        <div className="p-2 flex-1">{body}</div>
      </div>
    );
  }

  return (
    <div className="border border-gray-200 rounded-lg">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center gap-2 px-3 py-2 text-left">
        {open ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
        <span className="font-medium text-sm flex-1">{fullName(member)}</span>
        {summaryLine}
      </button>
      {open && <div className="px-3 pb-3">{body}</div>}
    </div>
  );
}


// ── Onglet Historique : groupé par ENCAISSEMENT (1 opération = tous ses services) ──
// Les paiements créés dans la même opération (un par service) partagent la même
// date, le même mode, la même référence, le même caissier et la même minute de
// création : on les regroupe pour afficher « la facture avec tous ses services ».
function HistoryTab({ student, academicYear, onChanged }) {
  const [payments, setPayments] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedKey, setExpandedKey] = useState(null);
  const [editKey, setEditKey] = useState(null);
  const [editShared, setEditShared] = useState({});
  const [editAmounts, setEditAmounts] = useState({});
  const [savingEdit, setSavingEdit] = useState(false);
  const [batchDetails, setBatchDetails] = useState({}); // batchId -> { students, total, ... }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const load = async () => {
    setLoading(true);
    try {
      const [p, i] = await Promise.all([
        financeApi.listPayments({ student_id: student.id, academic_year: academicYear, status: 'all' }),
        financeApi.listInvoices({ student_id: student.id, academic_year: academicYear }),
      ]);
      setPayments(p.payments || []);
      setInvoices(i.invoices || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  // Regroupement par opération d'encaissement : par batch_id si présent
  // (lie aussi les frères/sœurs), sinon par signature (date|mode|réf|caissier|minute).
  const groups = useMemo(() => {
    const map = new Map();
    for (const p of payments) {
      const minute = (p.created_at || '').slice(0, 16);
      const key = p.batch_id ? `batch:${p.batch_id}` : `${p.payment_date}|${p.method}|${p.reference || ''}|${p.recorded_by || ''}|${minute}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(p);
    }
    return [...map.entries()].map(([key, lines]) => {
      const confirmed = lines.filter(l => l.status !== 'cancelled');
      return {
        key, lines,
        batchId: lines[0].batch_id || null,
        date: lines[0].payment_date,
        method: lines[0].method,
        reference: lines[0].reference,
        cashier: lines[0].cashier,
        created_at: lines[0].created_at,
        total: confirmed.reduce((s, l) => s + Number(l.amount || 0), 0),
        allCancelled: confirmed.length === 0,
        cancelledCount: lines.length - confirmed.length,
      };
    }).sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  }, [payments]);

  // Précharge le détail des lots (pour afficher « Famille (N élèves) » dans la liste).
  useEffect(() => {
    const ids = [...new Set(groups.map(g => g.batchId).filter(Boolean))].filter(id => !batchDetails[id]);
    if (ids.length === 0) return;
    (async () => {
      for (const id of ids) {
        try { const res = await financeApi.getPaymentBatch(id); setBatchDetails(prev => ({ ...prev, [id]: res.batch })); }
        catch (e) { console.error(e); }
      }
    })();
    /* eslint-disable-next-line */
  }, [groups]);

  // Au dépliage d'un lot, on récupère le détail complet (tous les élèves du lot).
  const toggleExpand = async (g) => {
    const willOpen = expandedKey !== g.key;
    setExpandedKey(willOpen ? g.key : null);
    if (willOpen && g.batchId && !batchDetails[g.batchId]) {
      try {
        const res = await financeApi.getPaymentBatch(g.batchId);
        setBatchDetails(prev => ({ ...prev, [g.batchId]: res.batch }));
      } catch (e) { console.error(e); }
    }
  };

  const svcLabel = (p) => p.invoice?.service_category ? (CATEGORY_LABELS[p.invoice.service_category] || p.invoice.service_category) : 'Mensualité';

  const cancelGroup = async (g) => {
    const reason = prompt(`Annuler cet encaissement (${g.lines.length} service(s)) ? Motif :`);
    if (reason === null) return;
    try {
      for (const l of g.lines) if (l.status !== 'cancelled') await financeApi.cancelPayment(l.id, reason);
      await load(); onChanged?.();
    } catch (e) { alert('Erreur: ' + e.message); }
  };
  const printGroup = async (g) => {
    try {
      // Lot → 1 reçu unique (tous les élèves + services) ; sinon facture(s) du lot.
      if (g.batchId) { await financeApi.openBatchReceiptPdf(g.batchId); return; }
      const ids = [...new Set(g.lines.map(l => l.invoice?.id).filter(Boolean))];
      for (const id of ids) await financeApi.openInvoicePdf(id);
    } catch (e) { alert('Erreur impression: ' + e.message); }
  };
  const cancelLine = async (p) => {
    const reason = prompt('Motif de l\'annulation de ce service ?');
    if (reason === null) return;
    try { await financeApi.cancelPayment(p.id, reason); await load(); onChanged?.(); }
    catch (e) { alert('Erreur: ' + e.message); }
  };

  const startEdit = (g) => {
    setEditKey(g.key);
    setExpandedKey(g.key);
    setEditShared({ payment_date: (g.date || '').slice(0, 10), method: g.method, reference: g.reference || '' });
    const amts = {}; g.lines.forEach(l => { if (l.status !== 'cancelled') amts[l.id] = String(l.amount); });
    setEditAmounts(amts);
  };
  const saveEdit = async (g) => {
    setSavingEdit(true);
    try {
      for (const l of g.lines) {
        if (l.status === 'cancelled') continue;
        await financeApi.updatePayment(l.id, {
          amount: Number(editAmounts[l.id]),
          method: editShared.method,
          payment_date: editShared.payment_date,
          reference: editShared.reference,
        });
      }
      setEditKey(null);
      await load(); onChanged?.();
    } catch (e) { alert('Erreur: ' + e.message); }
    finally { setSavingEdit(false); }
  };

  const printInvoice = async (inv) => {
    try { await financeApi.openInvoicePdf(inv.id); }
    catch (e) { alert('Erreur impression: ' + e.message); }
  };
  const cancelInvoice = async (inv) => {
    const reason = prompt('Motif de l\'annulation de la facture ?');
    if (reason === null) return;
    try { await financeApi.cancelInvoice(inv.id, reason); await load(); onChanged?.(); }
    catch (e) { alert('Erreur: ' + e.message); }
  };

  if (loading) return <p className="text-gray-500 py-8 text-center">Chargement...</p>;

  return (
    <div className="space-y-5">
      {/* Encaissements (groupés) */}
      <div>
        <h4 className="text-sm font-semibold text-gray-800 mb-2">Encaissements ({groups.length})</h4>
        {groups.length === 0 ? <p className="text-sm text-gray-400">Aucun encaissement</p> : (
          <div className="space-y-1.5">
            {groups.map(g => {
              const expanded = expandedKey === g.key;
              const editing = editKey === g.key;
              const detail = g.batchId ? batchDetails[g.batchId] : null;
              const nbStudents = detail?.students?.length || 1;
              const multi = nbStudents > 1; // encaissement famille (plusieurs élèves)
              return (
                <div key={g.key} className={`border rounded-lg text-sm ${g.allCancelled ? 'border-gray-200 bg-gray-50 opacity-80' : 'border-gray-200'}`}>
                  <div className="flex items-center gap-2 p-2">
                    <button onClick={() => toggleExpand(g)} className="p-0.5">
                      {expanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className={`font-medium ${g.allCancelled ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                        {formatMAD(g.total)} <span className="text-xs font-normal text-gray-400">· {METHOD_LABELS[g.method] || g.method}</span>
                        {multi && <span className="ml-1.5 text-xs font-medium text-purple-600">· Famille ({nbStudents} élèves)</span>}
                      </div>
                      <div className="text-xs text-gray-500 truncate">
                        {new Date(g.date).toLocaleDateString('fr-FR')} · {g.lines.length} service(s){g.reference ? ` · réf ${g.reference}` : ''}
                      </div>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_META[g.allCancelled ? 'cancelled' : 'paid'].cls}`}>
                      {g.allCancelled ? 'Annulé' : (g.cancelledCount > 0 ? `${g.cancelledCount} annulé(s)` : 'Confirmé')}
                    </span>
                    {!g.allCancelled && (
                      <>
                        {/* Édition/annulation par ligne réservées aux encaissements mono-élève */}
                        {!multi && <button onClick={() => startEdit(g)} title="Modifier l'encaissement" className="p-1 hover:bg-blue-100 rounded"><Pencil className="w-4 h-4 text-blue-600" /></button>}
                        <button onClick={() => printGroup(g)} title={g.batchId ? 'Imprimer le reçu (tous les élèves)' : 'Imprimer les factures'} className="p-1 hover:bg-blue-100 rounded"><Printer className="w-4 h-4 text-blue-600" /></button>
                        {!multi && <button onClick={() => cancelGroup(g)} title="Annuler l'encaissement" className="p-1 hover:bg-red-100 rounded"><Ban className="w-4 h-4 text-red-500" /></button>}
                      </>
                    )}
                  </div>

                  {/* Détail des services de l'encaissement */}
                  {expanded && (
                    <div className="px-3 pb-3 pt-1 border-t border-gray-100 space-y-2">
                      {multi ? (
                        <div className="space-y-3">
                          {(detail?.students || []).map((st, si) => (
                            <div key={si} className="border border-gray-100 rounded-lg">
                              <div className="px-3 py-1.5 bg-gray-50 text-sm font-medium flex items-center justify-between">
                                <span>{st.name}{st.className ? ` · ${st.className}` : ''}</span>
                                <span className="text-green-700">{formatMAD(st.total)}</span>
                              </div>
                              <div className="divide-y divide-gray-100">
                                {st.lines.map((l, li) => (
                                  <div key={li} className="flex items-center justify-between px-3 py-1.5 text-sm">
                                    <span className="text-gray-700">{l.service}{l.period ? ` — ${l.period}` : ''}</span>
                                    <span className="font-medium tabular-nums text-gray-800">{formatMAD(l.amount)}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                          <div className="text-xs text-gray-500 flex flex-wrap gap-x-4">
                            <span>Encaissé par : {g.cashier ? fullName(g.cashier) : '—'}</span>
                            {g.reference && <span>Référence : {g.reference}</span>}
                            <span className="text-purple-600">Reçu unique couvrant tous les élèves</span>
                          </div>
                        </div>
                      ) : (
                      <>
                      {editing && (
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <label className="block text-xs text-gray-500 mb-0.5">Date</label>
                            <input type="date" value={editShared.payment_date} onChange={e => setEditShared(s => ({ ...s, payment_date: e.target.value }))} className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-0.5">Mode</label>
                            <select value={editShared.method} onChange={e => setEditShared(s => ({ ...s, method: e.target.value }))} className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm">
                              {Object.entries(METHOD_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-0.5">Référence</label>
                            <input type="text" value={editShared.reference} onChange={e => setEditShared(s => ({ ...s, reference: e.target.value }))} className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" />
                          </div>
                        </div>
                      )}
                      <div className="border border-gray-100 rounded-lg divide-y divide-gray-100">
                        {g.lines.map(l => {
                          const cancelled = l.status === 'cancelled';
                          return (
                            <div key={l.id} className="flex items-center gap-2 px-2.5 py-1.5 text-sm">
                              <div className="flex-1 min-w-0">
                                <div className={`${cancelled ? 'line-through text-gray-400' : 'text-gray-800'}`}>{svcLabel(l)}</div>
                                <div className="text-xs text-gray-400 truncate">{l.invoice?.period_label || '—'} · Reçu {l.receipt_number || '—'}{l.invoice?.invoice_number ? ` · Fact. ${l.invoice.invoice_number}` : ''}</div>
                              </div>
                              {editing && !cancelled ? (
                                <input type="number" step="0.01" min="0" value={editAmounts[l.id] ?? ''} onChange={e => setEditAmounts(a => ({ ...a, [l.id]: e.target.value }))}
                                  className="w-24 px-2 py-1 border border-gray-300 rounded text-right text-sm" />
                              ) : (
                                <span className={`font-medium tabular-nums ${cancelled ? 'text-gray-400 line-through' : 'text-gray-800'}`}>{formatMAD(l.amount)}</span>
                              )}
                              {cancelled ? (
                                <span className="text-xs text-gray-400 w-16 text-right">Annulé</span>
                              ) : !editing ? (
                                <div className="flex items-center gap-1">
                                  {l.invoice?.id && <button onClick={() => printInvoice(l.invoice)} title="Imprimer cette facture" className="p-1 hover:bg-blue-100 rounded"><Printer className="w-3.5 h-3.5 text-blue-600" /></button>}
                                  <button onClick={() => cancelLine(l)} title="Annuler ce service" className="p-1 hover:bg-red-100 rounded"><Ban className="w-3.5 h-3.5 text-red-500" /></button>
                                </div>
                              ) : <span className="w-16" />}
                            </div>
                          );
                        })}
                      </div>

                      {editing ? (
                        <div className="flex justify-end gap-2">
                          <button onClick={() => setEditKey(null)} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Annuler</button>
                          <button onClick={() => saveEdit(g)} disabled={savingEdit} className="flex items-center gap-1 px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">
                            <Save className="w-3.5 h-3.5" /> {savingEdit ? 'Enregistrement...' : 'Enregistrer'}
                          </button>
                        </div>
                      ) : (
                        <div className="text-xs text-gray-500 flex flex-wrap gap-x-4">
                          <span>Encaissé par : {g.cashier ? fullName(g.cashier) : '—'}</span>
                          {g.reference && <span>Référence : {g.reference}</span>}
                        </div>
                      )}
                      </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Factures */}
      <div>
        <h4 className="text-sm font-semibold text-gray-800 mb-2">Factures ({invoices.length})</h4>
        {invoices.length === 0 ? <p className="text-sm text-gray-400">Aucune facture</p> : (
          <div className="space-y-1.5">
            {invoices.map(inv => {
              const meta = STATUS_META[inv.status] || STATUS_META.issued;
              return (
                <div key={inv.id} className="flex items-center gap-2 p-2 border border-gray-200 rounded-lg text-sm">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-800 truncate">N° {inv.invoice_number} <span className="text-xs font-normal text-gray-400">· {inv.period_label || '—'}{inv.service_category ? ` · ${CATEGORY_LABELS[inv.service_category] || inv.service_category}` : ''}</span></div>
                    <div className="text-xs text-gray-500">{formatMAD(inv.total)} · payé {formatMAD(inv.amount_paid || 0)}</div>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${meta.cls}`}>{meta.label}</span>
                  <button onClick={() => printInvoice(inv)} title="Imprimer la facture" className="p-1 hover:bg-blue-100 rounded"><Printer className="w-4 h-4 text-blue-600" /></button>
                  {inv.status !== 'cancelled' && (
                    <button onClick={() => cancelInvoice(inv)} title="Annuler la facture" className="p-1 hover:bg-red-100 rounded"><Ban className="w-4 h-4 text-red-500" /></button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
