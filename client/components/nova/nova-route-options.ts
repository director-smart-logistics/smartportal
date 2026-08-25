import { useQuery } from "@tanstack/react-query";
import { firebaseApi } from "@/lib/firebase/callable";

export interface RouteOption {
  name: string;
  bg: string;
  bgFaint: string;
  text: string;
  border: string;
  borderL: string;
  borderT: string;
  borderB: string;
  borderTFaint: string;
  ring: string;
}

/**
 * Static color map keyed by route name.
 * Tailwind CSS classes MUST be declared statically — they cannot be generated
 * at runtime from dynamic strings because Tailwind purges unknown classes.
 * New routes not present here fall back to the default zinc palette.
 */
const ROUTE_COLOR_MAP: Record<string, Omit<RouteOption, "name">> = {
  "San Jose Centro": {
    bg: "bg-purple-100/40 dark:bg-purple-800/15",
    bgFaint: "bg-purple-100/30 dark:bg-purple-800/10",
    text: "text-purple-700 dark:text-purple-300",
    border: "border-purple-300 dark:border-purple-700",
    borderL: "border-l-purple-400 dark:border-l-purple-600",
    borderT: "border-t-purple-400 dark:border-t-purple-500",
    borderB: "border-b-purple-400 dark:border-b-purple-500",
    borderTFaint: "border-t-purple-400/30 dark:border-t-purple-500/20",
    ring: "ring-purple-400",
  },
  "San Jose Escazu": {
    bg: "bg-fuchsia-100/40 dark:bg-fuchsia-800/15",
    bgFaint: "bg-fuchsia-100/30 dark:bg-fuchsia-800/10",
    text: "text-fuchsia-700 dark:text-fuchsia-300",
    border: "border-fuchsia-300 dark:border-fuchsia-700",
    borderL: "border-l-fuchsia-400 dark:border-l-fuchsia-600",
    borderT: "border-t-fuchsia-400 dark:border-t-fuchsia-500",
    borderB: "border-b-fuchsia-400 dark:border-b-fuchsia-500",
    borderTFaint: "border-t-fuchsia-400/30 dark:border-t-fuchsia-500/20",
    ring: "ring-fuchsia-400",
  },
  "San Jose Coronado": {
    bg: "bg-pink-100/40 dark:bg-pink-800/15",
    bgFaint: "bg-pink-100/30 dark:bg-pink-800/10",
    text: "text-pink-700 dark:text-pink-300",
    border: "border-pink-300 dark:border-pink-700",
    borderL: "border-l-pink-400 dark:border-l-pink-600",
    borderT: "border-t-pink-400 dark:border-t-pink-500",
    borderB: "border-b-pink-400 dark:border-b-pink-500",
    borderTFaint: "border-t-pink-400/30 dark:border-t-pink-500/20",
    ring: "ring-pink-400",
  },
  "Cartago 1": {
    bg: "bg-cyan-100/40 dark:bg-cyan-800/15",
    bgFaint: "bg-cyan-100/30 dark:bg-cyan-800/10",
    text: "text-cyan-700 dark:text-cyan-300",
    border: "border-cyan-300 dark:border-cyan-700",
    borderL: "border-l-cyan-400 dark:border-l-cyan-600",
    borderT: "border-t-cyan-400 dark:border-t-cyan-500",
    borderB: "border-b-cyan-400 dark:border-b-cyan-500",
    borderTFaint: "border-t-cyan-400/30 dark:border-t-cyan-500/20",
    ring: "ring-cyan-400",
  },
  "Cartago 2": {
    bg: "bg-blue-100/40 dark:bg-blue-800/15",
    bgFaint: "bg-blue-100/30 dark:bg-blue-800/10",
    text: "text-blue-700 dark:text-blue-300",
    border: "border-blue-300 dark:border-blue-700",
    borderL: "border-l-blue-400 dark:border-l-blue-600",
    borderT: "border-t-blue-400 dark:border-t-blue-500",
    borderB: "border-b-blue-400 dark:border-b-blue-500",
    borderTFaint: "border-t-blue-400/30 dark:border-t-blue-500/20",
    ring: "ring-blue-400",
  },
  Encomiendas: {
    bg: "bg-emerald-100/40 dark:bg-emerald-800/15",
    bgFaint: "bg-emerald-100/30 dark:bg-emerald-800/10",
    text: "text-emerald-700 dark:text-emerald-300",
    border: "border-emerald-300 dark:border-emerald-700",
    borderL: "border-l-emerald-400 dark:border-l-emerald-600",
    borderT: "border-t-emerald-400 dark:border-t-emerald-500",
    borderB: "border-b-emerald-400 dark:border-b-emerald-500",
    borderTFaint: "border-t-emerald-400/30 dark:border-t-emerald-500/20",
    ring: "ring-emerald-400",
  },
  Occidente: {
    bg: "bg-orange-100/40 dark:bg-orange-800/15",
    bgFaint: "bg-orange-100/30 dark:bg-orange-800/10",
    text: "text-orange-700 dark:text-orange-300",
    border: "border-orange-300 dark:border-orange-700",
    borderL: "border-l-orange-400 dark:border-l-orange-600",
    borderT: "border-t-orange-400 dark:border-t-orange-500",
    borderB: "border-b-orange-400 dark:border-b-orange-500",
    borderTFaint: "border-t-orange-400/30 dark:border-t-orange-500/20",
    ring: "ring-orange-400",
  },
  Alajuela: {
    bg: "bg-red-100/40 dark:bg-red-800/15",
    bgFaint: "bg-red-100/30 dark:bg-red-800/10",
    text: "text-red-700 dark:text-red-300",
    border: "border-red-300 dark:border-red-700",
    borderL: "border-l-red-400 dark:border-l-red-600",
    borderT: "border-t-red-400 dark:border-t-red-500",
    borderB: "border-b-red-400 dark:border-b-red-500",
    borderTFaint: "border-t-red-400/30 dark:border-t-red-500/20",
    ring: "ring-red-400",
  },
  Heredia: {
    bg: "bg-yellow-100/40 dark:bg-yellow-800/15",
    bgFaint: "bg-yellow-100/30 dark:bg-yellow-800/10",
    text: "text-yellow-700 dark:text-yellow-300",
    border: "border-yellow-300 dark:border-yellow-700",
    borderL: "border-l-yellow-400 dark:border-l-yellow-600",
    borderT: "border-t-yellow-400 dark:border-t-yellow-500",
    borderB: "border-b-yellow-400 dark:border-b-yellow-500",
    borderTFaint: "border-t-yellow-400/30 dark:border-t-yellow-500/20",
    ring: "ring-yellow-400",
  },

  Retira: {
    bg: "bg-teal-100/40 dark:bg-teal-800/15",
    bgFaint: "bg-teal-100/30 dark:bg-teal-800/10",
    text: "text-teal-700 dark:text-teal-300",
    border: "border-teal-300 dark:border-teal-700",
    borderL: "border-l-teal-400 dark:border-l-teal-600",
    borderT: "border-t-teal-400 dark:border-t-teal-500",
    borderB: "border-b-teal-400 dark:border-b-teal-500",
    borderTFaint: "border-t-teal-400/30 dark:border-t-teal-500/20",
    ring: "ring-teal-400",
  },
  Desconocida: {
    bg: "bg-zinc-200/40 dark:bg-zinc-700/15",
    bgFaint: "bg-zinc-200/30 dark:bg-zinc-700/10",
    text: "text-zinc-600 dark:text-zinc-400",
    border: "border-zinc-300 dark:border-zinc-600",
    borderL: "border-l-zinc-400 dark:border-l-zinc-500",
    borderT: "border-t-zinc-400 dark:border-t-zinc-500",
    borderB: "border-b-zinc-400 dark:border-b-zinc-500",
    borderTFaint: "border-t-zinc-400/30 dark:border-t-zinc-500/20",
    ring: "ring-zinc-400",
  },
};

const FALLBACK_COLORS: Omit<RouteOption, "name"> = {
  bg: "bg-zinc-200/40 dark:bg-zinc-700/15",
  bgFaint: "bg-zinc-200/30 dark:bg-zinc-700/10",
  text: "text-zinc-600 dark:text-zinc-400",
  border: "border-zinc-300 dark:border-zinc-600",
  borderL: "border-l-zinc-400 dark:border-l-zinc-500",
  borderT: "border-t-zinc-400 dark:border-t-zinc-500",
  borderB: "border-b-zinc-400 dark:border-b-zinc-500",
  borderTFaint: "border-t-zinc-400/30 dark:border-t-zinc-500/20",
  ring: "ring-zinc-400",
};

/** Build a RouteOption from a route name, looking up colors from the static map. */
export function buildRouteOption(name: string): RouteOption {
  return { name, ...(ROUTE_COLOR_MAP[name] ?? FALLBACK_COLORS) };
}

/**
 * Static fallback list — used as placeholder before Firestore data loads
 * and exported for backwards compatibility with non-hook consumers.
 */
export const ROUTE_OPTIONS: RouteOption[] = Object.entries(ROUTE_COLOR_MAP).map(
  ([name, colors]) => ({ name, ...colors }),
);

/**
 * Hook: loads active routes from the Firestore `routes` collection and maps
 * them to RouteOption shape using the static color map.
 * Falls back to ROUTE_OPTIONS while loading or on error.
 */
export function useRouteOptions(): RouteOption[] {
  const { data } = useQuery({
    queryKey: ["route-options"],
    queryFn: async () => {
      const res = await firebaseApi.routes.list({ status: "active" });
      if (!res.success || !res.data) return ROUTE_OPTIONS;
      const routes: Array<{ name?: string; status?: string }> =
        (res.data as any).data ?? res.data ?? [];
      const active = routes
        .filter(
          (r) =>
            r.name &&
            r.status !== "inactive" &&
            r.name !== "BB" &&
            r.name !== "Mayorista" &&
            r.name !== "Mayoristas",
        )
        .map((r) => buildRouteOption(r.name!));
      return active.length > 0 ? active : ROUTE_OPTIONS;
    },
    staleTime: 5 * 60 * 1000,
    placeholderData: ROUTE_OPTIONS,
  });
  return data ?? ROUTE_OPTIONS;
}

/** Shorten route names for compact badge display — data stays unchanged */
export function abbrevRoute(name: string): string {
  return name.replace(/^San Jose\s+/i, "SJ ");
}
