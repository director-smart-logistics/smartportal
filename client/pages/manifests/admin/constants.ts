/**
 * Static constants for the Manifest Administration module.
 */

export interface ManifestTypeOption {
  value: string;
  label: string;
}

/**
 * Grid template column widths for the spreadsheet layout of the manifests list.
 * Column structure: Checkbox | Details | Manifest ID | Type/Flag | Total Packages | Total Weight | Total Price | Exchange Rate | Processed Date | Actions
 */
export const manifestsGridTemplateCols = 
  "40px 40px minmax(160px, 1.2fr) minmax(145px, 1.1fr) minmax(100px, 0.8fr) minmax(100px, 0.8fr) minmax(110px, 0.9fr) minmax(100px, 0.8fr) minmax(140px, 1.2fr) 140px";

/**
 * Available manifest hub and transportation type options.
 */
export const MANIFEST_TYPES: ManifestTypeOption[] = [
  { value: 'usa_air', label: 'USA Aéreo' },
  { value: 'usa_sea', label: 'USA Marítimo' },
  { value: 'mexico_air', label: 'México Aéreo' },
  { value: 'mexico_sea', label: 'México Marítimo' },
  { value: 'china_air', label: 'China Aéreo' },
  { value: 'china_sea', label: 'China Marítimo' },
  { value: 'colombia_air', label: 'Colombia Aéreo' },
  { value: 'colombia_sea', label: 'Colombia Marítimo' },
];

export interface ManifestTypeConfig {
  label: string;
  flag: string;
  className: string;
}

/**
 * Premium design details (labels, flags, and styled Tailwind classes)
 * for the different manifest types across USA, Colombia, Mexico, and China.
 */
export const TYPE_CONFIGS: Record<string, ManifestTypeConfig> = {
  usa_air: {
    label: 'USA Aéreo',
    flag: '🇺🇸',
    className: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/20 dark:text-blue-400 dark:border-blue-900/30'
  },
  usa_sea: {
    label: 'USA Marítimo',
    flag: '🇺🇸',
    className: 'bg-[hsl(var(--manifest-brand-subtle))] text-[hsl(var(--manifest-brand))] border-[hsl(var(--manifest-brand)/0.25)]'
  },
  mexico_air: {
    label: 'México Aéreo',
    flag: '🇲🇽',
    className: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/30'
  },
  mexico_sea: {
    label: 'México Marítimo',
    flag: '🇲🇽',
    className: 'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/20 dark:text-teal-400 dark:border-teal-900/30'
  },
  china_air: {
    label: 'China Aéreo',
    flag: '🇨🇳',
    className: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/20 dark:text-red-400 dark:border-red-900/30'
  },
  china_sea: {
    label: 'China Marítimo',
    flag: '🇨🇳',
    className: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-900/30'
  },
  colombia_air: {
    label: 'Colombia Aéreo',
    flag: '🇨🇴',
    className: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/20 dark:text-purple-400 dark:border-purple-900/30'
  },
  colombia_sea: {
    label: 'Colombia Marítimo',
    flag: '🇨🇴',
    className: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/20 dark:text-indigo-400 dark:border-indigo-900/30'
  },
};
