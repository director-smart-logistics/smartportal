export interface RouteColorSet {
  bg: string;
  border: string;
  text: string;
  gradient: string;
  swatch: string;
}

export const ROUTE_COLORS: Record<string, RouteColorSet> = {
  "San Jose Centro":   { bg: "bg-purple-100 dark:bg-purple-950/30",  border: "border-purple-300 dark:border-purple-700",   text: "text-purple-800 dark:text-purple-200",   gradient: "from-purple-600 to-purple-700",   swatch: "#9333ea" },
  "San Jose Escazu":   { bg: "bg-fuchsia-100 dark:bg-fuchsia-950/30", border: "border-fuchsia-300 dark:border-fuchsia-700", text: "text-fuchsia-800 dark:text-fuchsia-200", gradient: "from-fuchsia-500 to-fuchsia-600", swatch: "#d946ef" },
  "San Jose Coronado": { bg: "bg-pink-100 dark:bg-pink-950/30",       border: "border-pink-300 dark:border-pink-700",       text: "text-pink-800 dark:text-pink-200",       gradient: "from-pink-500 to-pink-600",       swatch: "#ec4899" },
  "Cartago 1":         { bg: "bg-cyan-100 dark:bg-cyan-950/30",       border: "border-cyan-300 dark:border-cyan-700",       text: "text-cyan-800 dark:text-cyan-200",       gradient: "from-cyan-500 to-cyan-600",       swatch: "#06b6d4" },
  "Cartago 2":         { bg: "bg-blue-100 dark:bg-blue-950/30",       border: "border-blue-300 dark:border-blue-700",       text: "text-blue-800 dark:text-blue-200",       gradient: "from-blue-600 to-blue-700",       swatch: "#2563eb" },
  "Encomiendas":       { bg: "bg-emerald-100 dark:bg-emerald-950/30", border: "border-emerald-300 dark:border-emerald-700", text: "text-emerald-800 dark:text-emerald-200", gradient: "from-emerald-600 to-emerald-700", swatch: "#059669" },
  "Occidente":         { bg: "bg-orange-100 dark:bg-orange-950/30",   border: "border-orange-300 dark:border-orange-700",   text: "text-orange-800 dark:text-orange-200",   gradient: "from-orange-500 to-orange-600",   swatch: "#f97316" },
  "Alajuela":          { bg: "bg-red-100 dark:bg-red-950/30",         border: "border-red-300 dark:border-red-700",         text: "text-red-800 dark:text-red-200",         gradient: "from-red-600 to-red-700",         swatch: "#dc2626" },
  "Heredia":           { bg: "bg-yellow-100 dark:bg-yellow-950/30",   border: "border-yellow-300 dark:border-yellow-700",   text: "text-yellow-800 dark:text-yellow-200",   gradient: "from-yellow-500 to-yellow-600",   swatch: "#eab308" },

  "Retira":            { bg: "bg-teal-100 dark:bg-teal-950/30",       border: "border-teal-300 dark:border-teal-700",       text: "text-teal-800 dark:text-teal-200",       gradient: "from-teal-600 to-teal-700",       swatch: "#0d9488" },
  "Desconocida":       { bg: "bg-zinc-100 dark:bg-zinc-800/30",      border: "border-zinc-300 dark:border-zinc-600",       text: "text-zinc-700 dark:text-zinc-300",       gradient: "from-zinc-500 to-zinc-700",       swatch: "#71717a" },
};

export const getRouteColor = (name: string): RouteColorSet =>
  ROUTE_COLORS[name] ?? { bg: "bg-muted/30", border: "border-border", text: "text-muted-foreground", gradient: "from-gray-500 to-gray-600", swatch: "#6b7280" };
