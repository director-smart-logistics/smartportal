const ROUTE_COLORS: Record<string, { bg: string; text: string }> = {
  "San Jose Centro": { bg: "bg-purple-100", text: "text-purple-800" },
  "San Jose Escazu": { bg: "bg-fuchsia-100", text: "text-fuchsia-800" },
  "San Jose Coronado": { bg: "bg-pink-100", text: "text-pink-800" },
  Heredia: { bg: "bg-blue-100", text: "text-blue-800" },
  Cartago: { bg: "bg-green-100", text: "text-green-800" },
  Alajuela: { bg: "bg-orange-100", text: "text-orange-800" },
  Guanacaste: { bg: "bg-amber-100", text: "text-amber-800" },
  Encomiendas: { bg: "bg-cyan-100", text: "text-cyan-800" },

  Retira: { bg: "bg-teal-100", text: "text-teal-800" },
  Desconocida: { bg: "bg-zinc-100", text: "text-zinc-700" },
};

const ROUTE_COLOR_PALETTE: Array<{ bg: string; text: string }> = [
  { bg: "bg-purple-100", text: "text-purple-800" },
  { bg: "bg-blue-100", text: "text-blue-800" },
  { bg: "bg-green-100", text: "text-green-800" },
  { bg: "bg-orange-100", text: "text-orange-800" },
  { bg: "bg-amber-100", text: "text-amber-800" },
  { bg: "bg-cyan-100", text: "text-cyan-800" },
  { bg: "bg-indigo-100", text: "text-indigo-800" },
  { bg: "bg-teal-100", text: "text-teal-800" },
  { bg: "bg-pink-100", text: "text-pink-800" },
  { bg: "bg-fuchsia-100", text: "text-fuchsia-800" },
  { bg: "bg-rose-100", text: "text-rose-800" },
  { bg: "bg-lime-100", text: "text-lime-800" },
  { bg: "bg-sky-100", text: "text-sky-800" },
  { bg: "bg-violet-100", text: "text-violet-800" },
];

export const getRouteColors = (name: string): { bg: string; text: string } => {
  if (!name) return { bg: "bg-slate-200", text: "text-slate-700" };
  if (ROUTE_COLORS[name]) return ROUTE_COLORS[name];
  const ci = Object.entries(ROUTE_COLORS).find(
    ([k]) => k.toLowerCase() === name.toLowerCase(),
  )?.[1];
  if (ci) return ci;
  const hash = name
    .toLowerCase()
    .split("")
    .reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return ROUTE_COLOR_PALETTE[hash % ROUTE_COLOR_PALETTE.length];
};

export const shortenRouteName = (name: string): string => {
  if (!name) return "";
  return name.replace(/^(san jose|san josé)\s+/i, "");
};
