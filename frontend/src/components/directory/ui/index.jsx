import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  X, Search, LayoutGrid, List, Check, CheckCheck, Clock, Bell,
  MessageCircle, UserCheck, UserX, Users, GraduationCap, Plus,
} from 'lucide-react';

// ── Kit UI Annuaire ──────────────────────────────────────────────────────────
// Composants partagés par les vues « personnes » (Élèves, Classes, Enseignants,
// Parents). Inspirés des points forts de Koolskools mais modernisés : statuts
// en pastilles lisibles, toggle grille/liste, drawer master-detail, split G/F.
// Style aligné sur le kit finance (lucide-react + tokens bg-card/border-border).
// Aucune logique métier ici : ce sont des briques de présentation pures.

// Palette de tons : chaque ton = fond clair + texte foncé + accent.
// Classes Tailwind écrites en toutes lettres pour le JIT (pas d'interpolation).
const TONES = {
  blue:   { soft: 'bg-blue-100 text-blue-700',     dot: 'bg-blue-500',   text: 'text-blue-600',   border: 'border-blue-400',   grad: 'from-sky-200 to-blue-100',      ring: 'ring-blue-300' },
  green:  { soft: 'bg-green-100 text-green-700',    dot: 'bg-green-500',  text: 'text-green-600',  border: 'border-green-400',  grad: 'from-emerald-200 to-green-100', ring: 'ring-green-300' },
  amber:  { soft: 'bg-amber-100 text-amber-700',    dot: 'bg-amber-500',  text: 'text-amber-600',  border: 'border-amber-400',  grad: 'from-amber-200 to-yellow-100',  ring: 'ring-amber-300' },
  red:    { soft: 'bg-red-100 text-red-700',        dot: 'bg-red-500',    text: 'text-red-600',    border: 'border-red-400',    grad: 'from-rose-200 to-red-100',      ring: 'ring-red-300' },
  purple: { soft: 'bg-purple-100 text-purple-700',  dot: 'bg-purple-500', text: 'text-purple-600', border: 'border-purple-400', grad: 'from-violet-200 to-purple-100', ring: 'ring-purple-300' },
  pink:   { soft: 'bg-pink-100 text-pink-700',      dot: 'bg-pink-500',   text: 'text-pink-600',   border: 'border-pink-400',   grad: 'from-pink-200 to-rose-100',     ring: 'ring-pink-300' },
  teal:   { soft: 'bg-teal-100 text-teal-700',      dot: 'bg-teal-500',   text: 'text-teal-600',   border: 'border-teal-400',   grad: 'from-teal-200 to-cyan-100',     ring: 'ring-teal-300' },
  gray:   { soft: 'bg-gray-100 text-gray-600',      dot: 'bg-gray-400',   text: 'text-gray-500',   border: 'border-gray-300',   grad: 'from-gray-200 to-gray-100',     ring: 'ring-gray-300' },
};
const TONE_CYCLE = ['blue', 'teal', 'purple', 'amber', 'pink', 'green'];

export function toneFor(key = '') {
  // Ton stable dérivé d'une chaîne (nom de classe, nom de personne…).
  const s = String(key);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return TONE_CYCLE[h % TONE_CYCLE.length];
}

function initials(name = '') {
  return name
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

// Avatar : photo en priorité si fournie, repli sur initiales colorées
// (ton stable par nom) si pas de photo OU si l'URL est cassée / introuvable.
const AV_SIZES = { sm: 'w-8 h-8 text-xs', md: 'w-11 h-11 text-sm', lg: 'w-16 h-16 text-lg', xl: 'w-20 h-20 text-2xl' };
export function Avatar({ name = '', src, tone, size = 'md', className = '' }) {
  const [broken, setBroken] = useState(false);
  const t = TONES[tone] || TONES[toneFor(name)];
  const showPhoto = src && !broken;
  if (showPhoto) {
    return (
      <img
        src={src}
        alt={name}
        onError={() => setBroken(true)}
        className={`${AV_SIZES[size]} rounded-full object-cover bg-gray-100 flex-shrink-0 ${className}`}
        loading="lazy"
      />
    );
  }
  return (
    <div
      className={`${AV_SIZES[size]} ${t.soft} rounded-full flex items-center justify-center font-medium flex-shrink-0 ${className}`}
      title={name || undefined}
      aria-hidden="true"
    >
      {initials(name) || '?'}
    </div>
  );
}

// Pastille de statut : libellé explicite + icône + ton (jamais un code obscur).
export function StatusPill({ tone = 'gray', icon: Icon, children, className = '' }) {
  const t = TONES[tone] || TONES.gray;
  return (
    <span className={`text-xs ${t.soft} px-2 py-0.5 rounded-full inline-flex items-center gap-1 font-medium ${className}`}>
      {Icon && <Icon className="w-3 h-3" />}
      {children}
    </span>
  );
}

// Statut de réinscription prêt à l'emploi (Réinscrit / Non réinscrit).
export function ReinscriptionPill({ reinscrit, year }) {
  return reinscrit ? (
    <StatusPill tone="green" icon={UserCheck}>Réinscrit{year ? ` ${year}` : ''}</StatusPill>
  ) : (
    <StatusPill tone="red" icon={UserX}>Non réinscrit{year ? ` ${year}` : ''}</StatusPill>
  );
}

// Toggle grille ↔ liste.
export function GridListToggle({ value = 'grid', onChange }) {
  const btn = (v, Icon, label) => (
    <button
      type="button"
      onClick={() => onChange?.(v)}
      aria-label={label}
      aria-pressed={value === v}
      className={`w-8 h-8 inline-flex items-center justify-center rounded-md border transition-colors ${
        value === v
          ? 'bg-blue-50 text-blue-600 border-blue-300'
          : 'bg-card text-muted-foreground border-border hover:bg-gray-50'
      }`}
    >
      <Icon className="w-4 h-4" />
    </button>
  );
  return (
    <div className="flex items-center gap-1">
      {btn('grid', LayoutGrid, 'Vue grille')}
      {btn('list', List, 'Vue liste')}
    </div>
  );
}

// Barre d'outils : recherche + actions à droite.
export function Toolbar({ search, onSearch, placeholder = 'Rechercher…', children }) {
  return (
    <div className="flex items-center gap-2 mb-3 flex-wrap">
      <div className="flex-1 min-w-[160px] flex items-center gap-2 border border-border rounded-lg px-3 h-9 bg-card">
        <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        <input
          value={search ?? ''}
          onChange={(e) => onSearch?.(e.target.value)}
          placeholder={placeholder}
          className="flex-1 bg-transparent outline-none text-sm text-foreground placeholder:text-muted-foreground"
        />
      </div>
      {children}
    </div>
  );
}

// Barre d'actions groupées (apparaît quand des éléments sont sélectionnés).
export function BulkActionBar({ count = 0, onClear, children }) {
  if (!count) return null;
  return (
    <div className="flex items-center gap-3 bg-blue-50 text-blue-700 rounded-lg px-3 py-2 mb-3 text-sm flex-wrap">
      <span className="font-medium">{count} sélectionné{count > 1 ? 's' : ''}</span>
      <div className="flex items-center gap-2 flex-wrap">{children}</div>
      {onClear && (
        <button onClick={onClear} className="ml-auto p-1 hover:bg-blue-100 rounded" aria-label="Vider la sélection">
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

// Répartition garçons / filles (affichée directement sur la carte de classe).
export function GenderSplit({ boys = 0, girls = 0, className = '' }) {
  return (
    <div className={`flex items-center gap-3 text-sm ${className}`}>
      <span className="inline-flex items-center gap-1 text-blue-600">
        <span className="text-base leading-none">♂</span> {boys}
      </span>
      <span className="inline-flex items-center gap-1 text-pink-600">
        <span className="text-base leading-none">♀</span> {girls}
      </span>
    </div>
  );
}

// Canal de notification d'un parent : WhatsApp / Push / Désinscrit.
export function ChannelBadge({ channel = 'push' }) {
  if (channel === 'whatsapp') return <StatusPill tone="green" icon={MessageCircle}>WhatsApp</StatusPill>;
  if (channel === 'optout') return <StatusPill tone="gray" icon={X}>Désinscrit</StatusPill>;
  return <StatusPill tone="blue" icon={Bell}>Push</StatusPill>;
}

// Accusé de lecture d'une communication : Lu / Envoyé / En attente.
export function ReadReceipt({ status = 'sent' }) {
  if (status === 'read')
    return <span className="text-xs text-green-600 inline-flex items-center gap-1"><CheckCheck className="w-3.5 h-3.5" /> Lu</span>;
  if (status === 'pending')
    return <span className="text-xs text-muted-foreground inline-flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> En attente</span>;
  return <span className="text-xs text-muted-foreground inline-flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Envoyé</span>;
}

// Barre d'icônes d'actions rapides (Élèves, EDT, Devoirs, Message…).
export function ActionIconBar({ actions = [] }) {
  return (
    <div className="flex items-center gap-1.5">
      {actions.map(({ icon: Icon, label, onClick, tone }, i) => {
        const t = TONES[tone] || TONES.gray;
        return (
          <button
            key={i}
            type="button"
            onClick={(e) => { e.stopPropagation(); onClick?.(e); }}
            aria-label={label}
            title={label}
            className={`w-8 h-8 inline-flex items-center justify-center rounded-md border border-border bg-card hover:bg-gray-50 transition-colors ${t.text}`}
          >
            <Icon className="w-4 h-4" />
          </button>
        );
      })}
    </div>
  );
}

// Carte d'entité générique : accent coloré optionnel, en-tête, corps, actions.
// Sert de base aux cartes Classe / Élève / Enseignant / Parent.
export function EntityCard({
  accent, selected, selectable, onToggleSelect, onClick, header, children, footer, className = '',
}) {
  const t = accent ? TONES[accent] || TONES.gray : null;
  return (
    <div
      onClick={onClick}
      className={`relative bg-card border rounded-xl p-3 transition-colors ${
        selected ? 'border-blue-400 ring-1 ring-blue-200' : 'border-border hover:border-gray-300'
      } ${onClick ? 'cursor-pointer' : ''} ${className}`}
      style={t ? { borderTop: `3px solid currentColor` } : undefined}
    >
      {t && <span className={`absolute inset-x-0 top-0 h-[3px] rounded-t-xl ${t.dot}`} />}
      <div className="flex items-start justify-between gap-2">
        {selectable && (
          <input
            type="checkbox"
            checked={!!selected}
            onChange={(e) => { e.stopPropagation(); onToggleSelect?.(); }}
            onClick={(e) => e.stopPropagation()}
            className="mt-1 w-4 h-4 accent-blue-600 flex-shrink-0"
            aria-label="Sélectionner"
          />
        )}
        <div className="flex-1 min-w-0">{header}</div>
      </div>
      {children && <div className="mt-2">{children}</div>}
      {footer && <div className="mt-3">{footer}</div>}
    </div>
  );
}

// Grille réactive pour les cartes.
export function CardGrid({ children, min = 160 }) {
  return (
    <div
      className="grid gap-3"
      style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${min}px, 1fr))` }}
    >
      {children}
    </div>
  );
}

// Drawer master-detail : panneau coulissant à droite avec fond cliquable.
// La liste reste visible derrière → on enchaîne les fiches sans perdre le contexte.
export function DetailDrawer({ open, onClose, title, width = 360, children }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/30 z-40"
          />
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.22 }}
            style={{ width }}
            className="fixed top-0 right-0 h-full bg-card border-l border-border z-50 shadow-xl flex flex-col max-w-[90vw]"
          >
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h3 className="font-semibold text-foreground truncate">{title}</h3>
              <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-md" aria-label="Fermer">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">{children}</div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

// Petit utilitaire : ligne label/valeur pour les fiches du drawer.
export function FieldRow({ label, value, mono }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-t border-border text-sm first:border-t-0">
      <span className="text-muted-foreground">{label}</span>
      <span className={`text-foreground ${mono ? 'font-mono text-xs' : ''}`}>{value ?? '—'}</span>
    </div>
  );
}

// ── Cartes prêtes à l'emploi ────────────────────────────────────────────────
// Composants présentationnels : ils reçoivent des props génériques (pas d'objet
// Supabase brut), pour rester découplés de la logique métier des pages.

// Carte Classe : avatar coloré, effectif, split G/F, barre d'actions rapides.
export function ClassCard({ name, section, subtitle, count, boys, girls, actions = [], menu, onClick }) {
  const accent = toneFor(`${name}${section || ''}`);
  return (
    <EntityCard accent={accent} onClick={onClick}
      header={
        <div className="flex items-center justify-between">
          <Avatar name={name} tone={accent} />
          {menu}
        </div>
      }>
      <div className="font-medium text-foreground truncate">{name}{section ? ` · ${section}` : ''}</div>
      {subtitle && <div className="text-xs text-muted-foreground truncate">{subtitle}</div>}
      {count != null && <div className="text-xs text-muted-foreground mt-0.5">{count} élèves</div>}
      {(boys != null || girls != null) && <GenderSplit boys={boys || 0} girls={girls || 0} className="mt-2" />}
      {actions.length > 0 && <div className="mt-3"><ActionIconBar actions={actions} /></div>}
    </EntityCard>
  );
}

// Carte Élève : en-tête pastel en dégradé + vague, gros avatar à anneau blanc
// qui déborde, nom coloré et pastille de statut. Effet de survol (élévation).
export function StudentCard({
  name, className: classLabel, photo, status, selected, selectable, onToggleSelect, onClick, menu,
}) {
  const accent = toneFor(name);
  const t = TONES[accent] || TONES.gray;
  return (
    <div
      onClick={onClick}
      className={`group relative bg-card rounded-2xl overflow-hidden border transition-all duration-200 ${
        selected ? 'border-blue-400 ring-2 ring-blue-200' : 'border-border hover:border-transparent'
      } ${onClick ? 'cursor-pointer' : ''} hover:-translate-y-1 hover:shadow-xl`}
    >
      {/* En-tête pastel + vague décorative */}
      <div className={`relative h-16 bg-gradient-to-br ${t.grad}`}>
        <svg className="absolute -bottom-px left-0 w-full" viewBox="0 0 400 40" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0,40 L0,22 Q100,42 200,22 T400,22 L400,40 Z" style={{ fill: 'hsl(var(--card))' }} />
        </svg>
        {selectable && (
          <input
            type="checkbox"
            checked={!!selected}
            onChange={(e) => { e.stopPropagation(); onToggleSelect?.(); }}
            onClick={(e) => e.stopPropagation()}
            className="absolute top-2 left-2 w-4 h-4 accent-blue-600 z-10 cursor-pointer"
            aria-label="Sélectionner"
          />
        )}
        {menu && <div className="absolute top-1.5 right-1.5 z-10">{menu}</div>}
      </div>

      {/* Avatar débordant à anneau blanc */}
      <div className="flex flex-col items-center text-center px-3 pb-4 -mt-11">
        <div className="rounded-full ring-4 ring-white shadow-md transition-transform duration-200 group-hover:scale-105">
          <Avatar name={name} src={photo} tone={accent} size="xl" />
        </div>
        <div className={`font-semibold text-sm mt-2.5 truncate w-full ${t.text}`}>{name}</div>
        {classLabel && <div className="text-xs text-muted-foreground mt-0.5">{classLabel}</div>}
        {status && <div className="mt-1.5">{status}</div>}
      </div>
    </div>
  );
}

// Tuile « Ajouter ou importer » : 1re carte de la grille (même esprit que la
// StudentCard, mais en pointillés et cliquable pour créer/importer).
export function AddPersonCard({ label = 'Ajouter ou importer', onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex flex-col items-center justify-center gap-3 min-h-[180px] w-full rounded-2xl border-2 border-dashed border-gray-300 bg-card text-muted-foreground transition-all duration-200 hover:border-blue-400 hover:bg-blue-50/40 hover:-translate-y-1 hover:shadow-lg"
    >
      <span className="w-16 h-16 rounded-full bg-gradient-to-br from-amber-300 to-amber-400 text-white flex items-center justify-center shadow-md transition-transform duration-200 group-hover:scale-105">
        <Plus className="w-8 h-8" />
      </span>
      <span className="text-sm font-medium text-foreground">{label}</span>
    </button>
  );
}

// Ligne Élève (vue liste) : variante dense de la carte.
export function StudentRow({
  name, className: classLabel, sub, photo, status, right, selected, selectable, onToggleSelect, onClick,
}) {
  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-3 p-2 border rounded-lg bg-card mb-1.5 transition-colors ${
        selected ? 'border-blue-400 ring-1 ring-blue-200' : 'border-border hover:border-gray-300'
      } ${onClick ? 'cursor-pointer' : ''}`}
    >
      {selectable && (
        <input type="checkbox" checked={!!selected}
          onChange={(e) => { e.stopPropagation(); onToggleSelect?.(); }}
          onClick={(e) => e.stopPropagation()}
          className="w-4 h-4 accent-blue-600 flex-shrink-0" aria-label="Sélectionner" />
      )}
      <Avatar name={name} src={photo} size="sm" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-foreground truncate">{name}</div>
        <div className="text-xs text-muted-foreground truncate">{[classLabel, sub].filter(Boolean).join(' · ')}</div>
      </div>
      {status}
      {right}
    </div>
  );
}

// Carte Enseignant : avatar, matière, nb classes, charge horaire, actions.
export function TeacherCard({ name, subject, classesCount, hours, photo, actions = [], onClick, menu }) {
  const accent = toneFor(name);
  return (
    <EntityCard onClick={onClick}
      header={
        <div className="flex items-center gap-2.5">
          <Avatar name={name} src={photo} tone={accent} />
          <div className="min-w-0">
            <div className="font-medium text-sm text-foreground truncate">{name}</div>
            {subject && <StatusPill tone={accent}>{subject}</StatusPill>}
          </div>
          {menu && <div className="ml-auto">{menu}</div>}
        </div>
      }>
      {(classesCount != null || hours != null) && (
        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-2">
          {classesCount != null && <span className="inline-flex items-center gap-1"><LayoutGrid className="w-3.5 h-3.5" /> {classesCount} classes</span>}
          {hours != null && <span className="inline-flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {hours}h/sem</span>}
        </div>
      )}
      {actions.length > 0 && <div className="mt-3"><ActionIconBar actions={actions} /></div>}
    </EntityCard>
  );
}

// Carte Parent : avatar, enfant(s) liés, canal de notif + accusé de lecture.
export function ParentCard({ name, children: kids, photo, channel, readStatus, onClick, menu }) {
  const accent = toneFor(name);
  return (
    <EntityCard onClick={onClick}
      header={
        <div className="flex items-center gap-2.5">
          <Avatar name={name} src={photo} tone={accent} />
          <div className="min-w-0 flex-1">
            <div className="font-medium text-sm text-foreground truncate">{name}</div>
            {kids && <div className="text-xs text-muted-foreground truncate inline-flex items-center gap-1"><Users className="w-3 h-3" /> {kids}</div>}
          </div>
          {menu}
        </div>
      }>
      {(channel || readStatus) && (
        <div className="flex items-center justify-between mt-2">
          {channel ? <ChannelBadge channel={channel} /> : <span />}
          {readStatus && <ReadReceipt status={readStatus} />}
        </div>
      )}
    </EntityCard>
  );
}

// Icônes réexportées pour confort d'usage côté pages.
export { Users, GraduationCap, MessageCircle };
