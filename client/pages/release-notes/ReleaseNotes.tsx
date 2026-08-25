import { useState, useMemo } from 'react';
import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { useLocale } from '@/hooks/useLocale';
import { cn } from '@/lib/utils';
import {
  Zap,
  Wrench,
  Gauge,
  ShieldCheck,
  Code2,
  AlertTriangle,
  Settings2,
  Search,
  Monitor,
  Server,
  Layers,
  Tag,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { CHANGELOG, type ChangelogEntry, type ChangelogLayer, type ChangelogType } from '@/data/changelog';

// ─── Type meta ────────────────────────────────────────────────────────────────
const TYPE_CONFIG: Record<
  ChangelogType,
  { icon: React.ReactNode; className: string; labelKey: string }
> = {
  feature:  { icon: <Zap className="w-3.5 h-3.5" />,          className: 'bg-blue-50 text-blue-700 border-blue-200',   labelKey: 'typeFeature' },
  fix:      { icon: <Wrench className="w-3.5 h-3.5" />,        className: 'bg-green-50 text-green-700 border-green-200', labelKey: 'typeFix' },
  perf:     { icon: <Gauge className="w-3.5 h-3.5" />,         className: 'bg-purple-50 text-purple-700 border-purple-200', labelKey: 'typePerf' },
  security: { icon: <ShieldCheck className="w-3.5 h-3.5" />,   className: 'bg-red-50 text-red-700 border-red-200',     labelKey: 'typeSecurity' },
  refactor: { icon: <Code2 className="w-3.5 h-3.5" />,         className: 'bg-slate-50 text-slate-700 border-slate-200', labelKey: 'typeRefactor' },
  breaking: { icon: <AlertTriangle className="w-3.5 h-3.5" />, className: 'bg-orange-50 text-orange-700 border-orange-200', labelKey: 'typeBreaking' },
  chore:    { icon: <Settings2 className="w-3.5 h-3.5" />,     className: 'bg-slate-50 text-slate-500 border-slate-200', labelKey: 'typeChore' },
};

const LAYER_CONFIG: Record<ChangelogLayer, { icon: React.ReactNode; className: string; labelKey: string }> = {
  fe:   { icon: <Monitor className="w-3.5 h-3.5" />,  className: 'bg-sky-50 text-sky-700 border-sky-200',    labelKey: 'layerFE' },
  be:   { icon: <Server className="w-3.5 h-3.5" />,   className: 'bg-teal-50 text-teal-700 border-teal-200', labelKey: 'layerBE' },
  both: { icon: <Layers className="w-3.5 h-3.5" />,   className: 'bg-violet-50 text-violet-700 border-violet-200', labelKey: 'layerBoth' },
};

// ─── Badge ────────────────────────────────────────────────────────────────────
function Badge({ icon, label, className }: { icon: React.ReactNode; label: string; className: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border', className)}>
      {icon}
      {label}
    </span>
  );
}

// ─── Entry card ───────────────────────────────────────────────────────────────
function EntryCard({ entry, isLatest, t }: { entry: ChangelogEntry; isLatest: boolean; t: (k: string) => string }) {
  const [expanded, setExpanded] = useState(false);
  const type  = TYPE_CONFIG[entry.type];
  const layer = LAYER_CONFIG[entry.layer];
  const hasDescription = !!entry.description;

  return (
    <article
      className={cn(
        'rounded-xl border bg-card transition-shadow hover:shadow-md',
        isLatest && 'ring-2 ring-red-500/20 border-red-200'
      )}
    >
      <div className="p-5">
        {/* Top row */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge icon={layer.icon} label={t(layer.labelKey)} className={layer.className} />
            <Badge icon={type.icon}  label={t(type.labelKey)}  className={type.className} />
            {isLatest && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border bg-red-50 text-red-600 border-red-200">
                {t('latestBadge')}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
            <span className="flex items-center gap-1">
              <Tag className="w-3 h-3" />
              v{entry.version}
            </span>
            <time dateTime={entry.date}>{entry.date}</time>
          </div>
        </div>

        {/* Title */}
        <h3 className="mt-3 text-base font-semibold text-foreground leading-snug">{entry.title}</h3>

        {/* Description (collapsible) */}
        {hasDescription && (
          <>
            <p className={cn('mt-2 text-sm text-muted-foreground leading-relaxed', !expanded && 'line-clamp-2')}>
              {entry.description}
            </p>
            {entry.description && entry.description.length > 120 && (
              <button
                onClick={() => setExpanded(v => !v)}
                className="mt-1 inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-700 font-medium transition-colors"
                aria-expanded={expanded}
              >
                {expanded ? (
                  <><ChevronUp className="w-3.5 h-3.5" /> Mostrar menos</>
                ) : (
                  <><ChevronDown className="w-3.5 h-3.5" /> Mostrar más</>
                )}
              </button>
            )}
          </>
        )}

        {/* Author */}
        {entry.author && (
          <p className="mt-3 text-xs text-muted-foreground/70">— {entry.author}</p>
        )}
      </div>
    </article>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function ReleaseNotes() {
  const { t } = useLocale('release-notes');

  const [layerFilter, setLayerFilter] = useState<ChangelogLayer | 'all'>('all');
  const [typeFilter,  setTypeFilter]  = useState<ChangelogType  | 'all'>('all');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return CHANGELOG.filter(e => {
      if (layerFilter !== 'all' && e.layer !== layerFilter) return false;
      if (typeFilter  !== 'all' && e.type  !== typeFilter)  return false;
      if (q && !e.title.toLowerCase().includes(q) && !(e.description?.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [layerFilter, typeFilter, search]);

  const layerTabs: { value: ChangelogLayer | 'all'; label: string }[] = [
    { value: 'all',  label: t('filterAll') },
    { value: 'fe',   label: t('filterFE')  },
    { value: 'be',   label: t('filterBE')  },
    { value: 'both', label: t('filterBoth') },
  ];

  const allTypes: (ChangelogType | 'all')[] = ['all', 'feature', 'fix', 'perf', 'security', 'breaking', 'refactor', 'chore'];

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">

        {/* Header */}
        <header className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-red-50 border border-red-100">
              <Layers className="w-5 h-5 text-red-600" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">{t('title')}</h1>
          </div>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </header>

        {/* Controls */}
        <div className="space-y-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input
              type="search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t('searchPlaceholder')}
              className="w-full h-10 pl-9 pr-4 rounded-lg border border-input bg-background text-sm text-foreground placeholder:text-muted-foreground focus:border-red-500 focus:outline-none transition-colors"
            />
          </div>

          {/* Layer filter tabs */}
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by layer">
            {layerTabs.map(tab => (
              <button
                key={tab.value}
                onClick={() => setLayerFilter(tab.value)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors',
                  layerFilter === tab.value
                    ? 'bg-red-600 text-white border-red-600'
                    : 'bg-background text-muted-foreground border-input hover:border-red-300 hover:text-red-600'
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Type filter select */}
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value as ChangelogType | 'all')}
            className="h-9 px-3 rounded-lg border border-input bg-background text-sm text-foreground focus:border-red-500 focus:outline-none transition-colors"
            aria-label={t('allTypes')}
          >
            {allTypes.map(type => (
              <option key={type} value={type}>
                {type === 'all' ? t('allTypes') : t(`type${type.charAt(0).toUpperCase()}${type.slice(1)}`)}
              </option>
            ))}
          </select>
        </div>

        {/* Results count */}
        <p className="text-xs text-muted-foreground">
          {t('entriesCount').replace('{{count}}', String(filtered.length))}
        </p>

        {/* Entries */}
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
            <Layers className="w-10 h-10 opacity-30" />
            <p className="text-sm">{t('noEntries')}</p>
          </div>
        ) : (
          <ol className="space-y-4" aria-label={t('title')}>
            {filtered.map((entry, idx) => (
              <li key={`${entry.version}-${entry.layer}-${idx}`}>
                <EntryCard entry={entry} isLatest={idx === 0 && layerFilter === 'all' && typeFilter === 'all' && !search} t={t} />
              </li>
            ))}
          </ol>
        )}
      </div>
    </DashboardLayout>
  );
}
