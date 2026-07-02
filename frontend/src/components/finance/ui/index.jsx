import { Link } from 'react-router-dom';
import { ArrowRight, Inbox, RefreshCw, X } from 'lucide-react';
import { formatMAD } from '../../../lib/financeApi';

// ── Kit UI Finance ─────────────────────────────────────────────────────────
// Composants partagés par toutes les pages finance. Style épuré / moderne SaaS,
// aligné sur les tokens du thème (bg-card, border-border, text-muted-foreground…).

// En-tête de page : titre, sous-titre, actions à droite.
export function PageHeader({ icon: Icon, title, subtitle, color = 'gray', actions, onRefresh, loading }) {
  const iconColors = {
    gray: 'text-gray-500', blue: 'text-blue-600', green: 'text-green-600',
    red: 'text-red-600', purple: 'text-purple-600', orange: 'text-orange-600',
  };
  return (
    <div className="flex items-start justify-between gap-4 flex-wrap">
      <div className="flex items-center gap-3">
        {Icon && <Icon className={`w-6 h-6 ${iconColors[color] || iconColors.gray}`} />}
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
          {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {actions}
        {onRefresh && (
          <button onClick={onRefresh} className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50" title="Actualiser">
            <RefreshCw className={`w-4 h-4 text-gray-500 ${loading ? 'animate-spin' : ''}`} />
          </button>
        )}
      </div>
    </div>
  );
}

// Carte KPI : un chiffre clé, optionnellement cliquable, avec ton de couleur.
const KPI_TONES = {
  green: 'text-green-700', blue: 'text-blue-700', orange: 'text-orange-700',
  red: 'text-red-700', purple: 'text-purple-700', gray: 'text-gray-900',
};
export function KpiCard({ icon: Icon, label, value, tone = 'gray', sub, href }) {
  const inner = (
    <div className="bg-card border border-border rounded-xl p-4 hover:border-gray-300 card-lift animate-rise h-full">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        {Icon && <Icon className="w-4 h-4 text-muted-foreground/60" />}
      </div>
      <p className={`text-2xl font-semibold mt-2 ${KPI_TONES[tone] || KPI_TONES.gray}`}>{value}</p>
      <div className="flex items-center justify-between mt-1">
        {sub ? <span className="text-xs text-muted-foreground">{sub}</span> : <span />}
        {href && <ArrowRight className="w-4 h-4 text-muted-foreground/50" />}
      </div>
    </div>
  );
  return href ? <Link to={href} className="block h-full">{inner}</Link> : inner;
}

// Grille de KPI réactive.
export function KpiGrid({ children, cols = 4 }) {
  const map = { 2: 'md:grid-cols-2', 3: 'md:grid-cols-3', 4: 'md:grid-cols-2 lg:grid-cols-4' };
  return <div className={`grid grid-cols-1 ${map[cols] || map[4]} gap-3`}>{children}</div>;
}

// Carte conteneur (section).
export function Card({ title, actions, children, className = '', bodyClassName = 'p-4' }) {
  return (
    <div className={`bg-card border border-border rounded-xl overflow-hidden ${className}`}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border">
          {title && <h2 className="text-sm font-semibold text-gray-800">{title}</h2>}
          {actions}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </div>
  );
}

// Barre de filtres réutilisable (wrapper de mise en page).
export function FilterBar({ children }) {
  return (
    <div className="bg-card border border-border rounded-xl p-3 flex flex-wrap items-center gap-2">
      {children}
    </div>
  );
}

// Tableau de données générique, piloté par des colonnes.
// columns: [{ key, header, align, className, render?(row) }]
// `compact` resserre le tableau (padding réduit + largeurs fixes) pour que
// beaucoup de colonnes tiennent sans défilement horizontal. Une colonne peut
// définir `width` (ex. '14%' ou 90) et `truncate` pour couper son texte.
export function DataTable({ columns, rows, rowKey = (r) => r.id, empty = 'Aucune donnée', onRowClick, compact = false }) {
  const cellPad = compact ? 'px-2.5 py-2' : 'px-4 py-3';
  const headPad = compact ? 'px-2.5 py-2' : 'px-4 py-3';
  return (
    <div className="bg-card border border-border rounded-xl overflow-x-auto">
      <table className={`w-full ${compact ? 'text-xs table-fixed' : 'text-sm'}`}>
        <thead className="bg-muted/40 text-muted-foreground text-xs uppercase tracking-wide">
          <tr>
            {columns.map((c) => (
              <th key={c.key} style={c.width ? { width: typeof c.width === 'number' ? `${c.width}px` : c.width } : undefined}
                className={`${headPad} font-medium ${c.align === 'right' ? 'text-right' : 'text-left'} ${c.thClassName || ''}`}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.length === 0 && (
            <tr><td colSpan={columns.length} className="px-4 py-10 text-center text-muted-foreground">{empty}</td></tr>
          )}
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={`hover:bg-muted/30 ${onRowClick ? 'cursor-pointer' : ''}`}
            >
              {columns.map((c) => (
                <td key={c.key} className={`${cellPad} ${c.align === 'right' ? 'text-right tabular-nums' : 'text-left'} ${c.truncate ? 'truncate' : ''} ${c.className || ''}`}>
                  {c.render ? c.render(row) : row[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Badge de statut cohérent.
const BADGE_TONES = {
  green: 'bg-green-50 text-green-700', blue: 'bg-blue-50 text-blue-700',
  yellow: 'bg-yellow-50 text-yellow-700', red: 'bg-red-50 text-red-700',
  gray: 'bg-gray-100 text-gray-600', purple: 'bg-purple-50 text-purple-700',
  orange: 'bg-orange-50 text-orange-700',
};
export function Badge({ tone = 'gray', children }) {
  return <span className={`inline-block px-2 py-0.5 text-xs rounded-full ${BADGE_TONES[tone] || BADGE_TONES.gray}`}>{children}</span>;
}

// Montant formaté (MAD), avec ton optionnel.
export function Money({ value, tone, className = '' }) {
  const tones = { green: 'text-green-600', red: 'text-red-600', gray: '' };
  return <span className={`tabular-nums font-medium ${tones[tone] || ''} ${className}`}>{formatMAD(value)}</span>;
}

// État vide illustré.
export function EmptyState({ icon: Icon = Inbox, title = 'Aucune donnée', hint, action }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-4">
      <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
        <Icon className="w-6 h-6 text-muted-foreground" />
      </div>
      <p className="text-sm font-medium text-gray-700">{title}</p>
      {hint && <p className="text-xs text-muted-foreground mt-1 max-w-xs">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// Tiroir latéral (remplace les modales centrées pour la saisie).
export function Drawer({ open, onClose, title, children, footer, width = 'max-w-md' }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className={`relative bg-card w-full ${width} h-full shadow-xl flex flex-col animate-in slide-in-from-right`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-muted rounded-lg"><X className="w-5 h-5 text-muted-foreground" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">{children}</div>
        {footer && <div className="px-5 py-4 border-t border-border flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

// Champ de formulaire (label + contrôle).
export function Field({ label, required, children, className = '' }) {
  return (
    <div className={className}>
      <label className="block text-xs font-medium text-gray-600 mb-1">
        {label}{required && <span className="text-red-500"> *</span>}
      </label>
      {children}
    </div>
  );
}

// Bouton principal (action).
export function Button({ variant = 'primary', color = 'blue', icon: Icon, children, className = '', ...props }) {
  const colors = {
    blue: 'bg-blue-600 hover:bg-blue-700', green: 'bg-green-600 hover:bg-green-700',
    red: 'bg-red-600 hover:bg-red-700', purple: 'bg-purple-600 hover:bg-purple-700',
  };
  const styles = variant === 'primary'
    ? `${colors[color]} text-white`
    : 'bg-card border border-gray-200 text-gray-700 hover:bg-gray-50';
  return (
    <button className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${styles} ${className}`} {...props}>
      {Icon && <Icon className="w-4 h-4" />}
      {children}
    </button>
  );
}
