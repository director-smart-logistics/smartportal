import { useState, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import { useTheme } from "@/lib/context/ThemeContext";
import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BarChart,
  Bar,
  ComposedChart,
  Area,
  AreaChart,
  Line,
  LineChart,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  Calendar,
  Download,
  RefreshCw,
  DollarSign,
  Receipt,
  Users,
  CheckCircle,
  Megaphone,
  AlertCircle,
  Globe,
  Star,
  HelpCircle,
  Package,
  PackageCheck,
  Truck,
  Brain,
  Sparkles,
  Loader2,
  Target,
  Lightbulb,
} from "lucide-react";
import {
  useCourierAnalytics,
  useAIInsights,
  useMonthlyAnalytics,
} from "@/lib/hooks/queries/useAnalytics";
import {
  Tooltip as UITooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 });
const formatCurrency = (v: number) => fmt.format(v);
const formatPct = (v: number) => `${v.toFixed(1)}%`;
const formatChange = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;

const STATUS_LABELS: Record<string, string> = {
  received: "Recibido en Miami", transit: "En Tránsito", "pre-alerted": "Pre-Alertado",
  consolidated: "Consolidado", customs: "Aduanas CR", held: "Retenido",
  route: "En Ruta", pickup: "Para Retirar",
  delivered: "Entregado", returned: "Devuelto", processed: "Facturado",
};

const labelStatus = (s: string) => STATUS_LABELS[s] || s;

const formatMonthLabel = (mStr: string) => {
  const parts = mStr.split("-");
  if (parts.length !== 2) return mStr;
  const year = parts[0];
  const month = parts[1];
  const monthNames: Record<string, string> = {
    "01": "Ene", "02": "Feb", "03": "Mar", "04": "Abr", "05": "May", "06": "Jun",
    "07": "Jul", "08": "Ago", "09": "Sep", "10": "Oct", "11": "Nov", "12": "Dic"
  };
  return `${monthNames[month] || month} ${year}`;
};

const generateMonthOptions = () => {
  const options = [];
  const date = new Date();
  const monthNames = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
  ];
  for (let i = 0; i < 12; i++) {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const monthStr = month < 10 ? `0${month}` : `${month}`;
    const value = `${year}-${monthStr}`;
    const label = `${monthNames[month - 1]} ${year}`;
    options.push({ value, label });
    date.setMonth(date.getMonth() - 1);
  }
  return options;
};

const MONTH_OPTIONS = generateMonthOptions();

// ─── KPI Card ─────────────────────────────────────────────────────────────────

interface KPICardProps {
  title: string;
  value: string;
  change?: number | null;
  icon: React.ReactNode;
  sub?: string;
  highlight?: boolean;
  tooltipText?: string;
  comparisonLabel?: string;
  breakdown?: React.ReactNode;
}

function KPICard({ title, value, change, icon, sub, highlight, tooltipText, comparisonLabel, breakdown }: KPICardProps) {
  const hasChange = change !== undefined && change !== null;
  const positive  = hasChange ? change! >= 0 : true;
  return (
    <Card className={`p-4 flex flex-col justify-between relative overflow-hidden transition-all duration-300 hover:shadow-md hover:border-foreground/10 min-h-[145px] ${highlight ? "border-red-500/20 bg-red-500/5 dark:border-red-500/10 dark:bg-red-950/10" : ""}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground font-semibold flex items-center gap-1.5">
          {title}
          {tooltipText && (
            <TooltipProvider>
              <UITooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-3 w-3 text-muted-foreground/60 cursor-pointer hover:text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent className="max-w-[220px] text-xs">
                  {tooltipText}
                </TooltipContent>
              </UITooltip>
            </TooltipProvider>
          )}
        </span>
        <span className="text-muted-foreground/80">{icon}</span>
      </div>

      {/* Main Value and MoM Badge */}
      <div className="flex items-baseline justify-between mt-2 mb-1">
        <span className="text-2xl font-bold text-foreground tracking-tight">{value}</span>
        {change === null ? (
          <span className="text-[9px] text-muted-foreground italic bg-muted/50 px-1.5 py-0.5 rounded">Sin período anterior</span>
        ) : hasChange ? (
          <span className={`inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded ${positive ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-red-500/10 text-red-500"}`}>
            {positive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {formatChange(change!)}
          </span>
        ) : null}
      </div>

      {/* Breakdown or Footer */}
      {breakdown ? (
        <div className="border-t border-muted pt-2.5 mt-auto">
          {breakdown}
        </div>
      ) : (
        <div className="flex items-center justify-between text-[10px] text-muted-foreground mt-auto pt-2 border-t border-muted/30">
          <span>{comparisonLabel ? `vs ${comparisonLabel}` : ""}</span>
          <span className="font-semibold text-foreground/80">{sub}</span>
        </div>
      )}
    </Card>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function KPISkeleton() {
  return (
    <Card className="p-4 flex flex-col gap-3">
      <div className="flex justify-between"><div className="h-3 w-24 bg-muted rounded animate-pulse" /><div className="h-4 w-4 bg-muted rounded animate-pulse" /></div>
      <div className="h-6 w-32 bg-muted rounded animate-pulse" />
      <div className="h-3 w-20 bg-muted rounded animate-pulse" />
    </Card>
  );
}

function ChartSkeleton({ h = 200 }: { h?: number }) {
  return <div className={`bg-muted/50 rounded animate-pulse w-full`} style={{ height: h }} />;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Analytics() {
  const { theme } = useTheme();
  const [monthA, setMonthA] = useState(MONTH_OPTIONS[0]?.value || "2026-07");
  const [monthB, setMonthB] = useState(MONTH_OPTIONS[1]?.value || "2026-06");
  const [activeView, setActiveView] = useState("dashboard");
  const [selectedRoute, setSelectedRoute] = useState<string | null>(null);
  const [selectedCourier, setSelectedCourier] = useState<string | null>(null);

  // Main MoM Query
  const { data: m, isLoading, error, refetch, isFetching } = useCourierAnalytics(monthA, monthB, {
    enabled: true,
  });

  // Decoupled 6-Month Trend Query (always relative to real current calendar month Julio 2026)
  const { data: trendData } = useMonthlyAnalytics(MONTH_OPTIONS[0]?.value || "2026-07", {
    enabled: true,
  });

  const ai = useAIInsights();

  const getMonthLabel = (mVal: string) => {
    return MONTH_OPTIONS.find(opt => opt.value === mVal)?.label || mVal;
  };

  const isDark = theme === "dark";
  const palette = isDark 
    ? ["#F3F4F6", "#D1D5DB", "#9CA3AF", "#6B7280", "#4B5563", "#374151"]
    : ["#111827", "#1F2937", "#374151", "#4B5563", "#6B7280", "#9CA3AF"];

  const routeColors = isDark 
    ? [
        "#FB7185", // Rose 400
        "#60A5FA", // Blue 400
        "#34D399", // Emerald 400
        "#A78BFA", // Violet 400
        "#FBBF24", // Amber 400
        "#FB923C", // Orange 400
        "#22D3EE", // Cyan 400
        "#F472B6", // Pink 400
        "#818CF8", // Indigo 400
        "#C084FC", // Purple 400
        "#FACC15", // Yellow 400
        "#2DD4BF", // Teal 400
        "#A3E635", // Lime 400
        "#94A3B8"  // Slate 400
      ]
    : [
        "#E11D48", // Rose 600
        "#2563EB", // Blue 600
        "#059669", // Emerald 600
        "#7C3AED", // Violet 600
        "#D97706", // Amber 600
        "#EA580C", // Orange 600
        "#0891B2", // Cyan 600
        "#DB2777", // Pink 600
        "#4F46E5", // Indigo 600
        "#9333EA", // Purple 600
        "#CA8A04", // Yellow 600
        "#0D9488", // Teal 600
        "#65A30D", // Lime 600
        "#475569"  // Slate 600
      ];

  const chartColors = {
    primary: isDark ? "#F3F4F6" : "#111827",
    secondary: isDark ? "#9CA3AF" : "#6B7280",
    grid: isDark ? "#374151" : "#E5E7EB",
    tooltipBg: isDark ? "#1F2937" : "#FFFFFF",
    tooltipBorder: isDark ? "#4B5563" : "#D1D5DB",
    area: isDark ? "#F3F4F6" : "#1F2937",
    bar: isDark ? "#D1D5DB" : "#374151",
    barAlt: isDark ? "#9CA3AF" : "#6B7280",
  };

  const handleExport = () => {
    if (!m) return;
    const blob = new Blob([JSON.stringify({ monthA, monthB, generatedAt: m.generatedAt, metrics: m }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `analytics-${monthA}-vs-${monthB}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const chartTick = { fontSize: 10, fill: isDark ? "#9CA3AF" : "#6B7280" };
  const tooltipStyle = { fontSize: 12, backgroundColor: chartColors.tooltipBg, border: `1px solid ${chartColors.tooltipBorder}` };

  // Parse trend data with formatted labels for composed line/area chart (decoupled)
  const trendWithLabels = useMemo(() => {
    return (trendData?.revenueTrend || []).map(d => ({
      ...d,
      label: formatMonthLabel(d.period),
    }));
  }, [trendData]);

  // Parse 6-month route package counts for line chart
  const routeTrendData = useMemo(() => {
    const rawTrend = trendData?.revenueTrend || [];
    
    // 1. Gather all unique real route names across all months
    const routesSet = new Set<string>();
    rawTrend.forEach(mPoint => {
      (mPoint.packagesByRoute || []).forEach(r => {
        const routeName = String(r.route || '').trim();
        const routeLower = routeName.toLowerCase();
        // Filter out placeholder routes
        if (
          !['desconocida', 'mayorista', 'costa rica', 'bb', 'por definir'].includes(routeLower) &&
          routeName !== 'ALAJUELA' &&
          routeName !== ''
        ) {
          routesSet.add(routeName);
        }
      });
    });
    const activeRoutes = Array.from(routesSet);

    // 2. Map each period to its route counts
    const chartData = rawTrend.map(mPoint => {
      const point: Record<string, any> = {
        period: formatMonthLabel(mPoint.period)
      };
      // Initialize all routes to 0
      activeRoutes.forEach(rName => {
        point[rName] = 0;
      });
      // Populate counts
      (mPoint.packagesByRoute || []).forEach(r => {
        const rName = String(r.route || '').trim();
        if (routesSet.has(rName)) {
          point[rName] = r.count;
        }
      });
      return point;
    });

    return { chartData, activeRoutes };
  }, [trendData]);

  const courierTrendData = useMemo(() => {
    const rawTrend = trendData?.revenueTrend || [];
    
    // 1. Gather all unique domestic courier names across all months
    const couriersSet = new Set<string>();
    rawTrend.forEach(mPoint => {
      (mPoint.packagesByEncomienda || []).forEach(s => {
        const name = String(s.name || '').trim();
        if (name && name !== 'Sin servicio') {
          couriersSet.add(name);
        }
      });
    });
    const activeCouriers = Array.from(couriersSet);

    // 2. Map each period to its courier counts
    const chartData = rawTrend.map(mPoint => {
      const point: Record<string, any> = {
        period: formatMonthLabel(mPoint.period)
      };
      // Initialize all couriers to 0
      activeCouriers.forEach(cName => {
        point[cName] = 0;
      });
      // Populate counts
      (mPoint.packagesByEncomienda || []).forEach(s => {
        const cName = String(s.name || '').trim();
        if (activeCouriers.includes(cName)) {
          point[cName] = s.count;
        }
      });
      return point;
    });

    return { chartData, activeCouriers };
  }, [trendData]);

  // Consolidate comparative routes from both months for the route invoice table
  const comparativeRoutes = useMemo(() => {
    const routesMap = new Map<string, {
      route: string;
      amountA: number;
      paidAmountA: number;
      pctPaidA: number;
      amountB: number;
      paidAmountB: number;
      pctPaidB: number;
    }>();

    if (m) {
      (m.invoicesByRoute || []).forEach((r: any) => {
        const routeName = String(r.route || '').trim();
        const routeLower = routeName.toLowerCase();
        if (
          ['desconocida', 'mayorista', 'costa rica', 'bb', 'por definir'].includes(routeLower) ||
          routeName === 'ALAJUELA'
        ) {
          return;
        }
        routesMap.set(r.route, {
          route: r.route,
          amountA: r.amount,
          paidAmountA: r.paidAmount,
          pctPaidA: r.pctPaid,
          amountB: 0,
          paidAmountB: 0,
          pctPaidB: 0,
        });
      });

      (m.execPrevInvoicesByRoute || []).forEach((r: any) => {
        const routeName = String(r.route || '').trim();
        const routeLower = routeName.toLowerCase();
        if (
          ['desconocida', 'mayorista', 'costa rica', 'bb', 'por definir'].includes(routeLower) ||
          routeName === 'ALAJUELA'
        ) {
          return;
        }
        const existing = routesMap.get(r.route);
        if (existing) {
          existing.amountB = r.amount;
          existing.paidAmountB = r.paidAmount;
          existing.pctPaidB = r.pctPaid;
        } else {
          routesMap.set(r.route, {
            route: r.route,
            amountA: 0,
            paidAmountA: 0,
            pctPaidA: 0,
            amountB: r.amount,
            paidAmountB: r.paidAmount,
            pctPaidB: r.pctPaid,
          });
        }
      });
    }

    return Array.from(routesMap.values()).sort((a, b) => b.amountA - a.amountA);
  }, [m]);

  const maxAmount = useMemo(() => {
    if (comparativeRoutes.length === 0) return 1;
    return Math.max(...comparativeRoutes.map(r => Math.max(r.amountA, r.amountB)), 1);
  }, [comparativeRoutes]);

  const getRouteColor = (routeName: string) => {
    const idx = routeTrendData.activeRoutes.indexOf(routeName);
    if (idx >= 0) {
      return routeColors[idx % routeColors.length];
    }
    return "#ef4444";
  };

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 space-y-6 relative min-h-[500px]">
        {isLoading && (
          <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background/60 backdrop-blur-md transition-all duration-300">
            <div className="max-w-md p-8 rounded-2xl border bg-card/85 shadow-2xl flex flex-col items-center text-center space-y-5 animate-in fade-in zoom-in-95 duration-200">
              <div className="relative flex items-center justify-center">
                <RefreshCw className="h-10 w-10 text-red-600 animate-spin" />
                <div className="absolute inset-0 rounded-full border border-red-600/10 animate-ping" />
              </div>
              <div className="space-y-2">
                <h3 className="font-bold text-base text-foreground">Cargando Reporte de Analíticas</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Estamos consultando los servicios y preparando los datos para mostrarte el reporte... esto puede tardar un poco
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Reporte Unificado de Analíticas</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Visualización ejecutiva, operativa y demográfica consolidada · {m ? `Sincronizado ${new Date(m.generatedAt).toLocaleTimeString()}` : "Cargando..."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <div className="flex items-center gap-1.5 bg-muted/50 p-1 rounded-lg border">
              <Select value={monthA} onValueChange={setMonthA}>
                <SelectTrigger className="w-32 h-8 border-none bg-transparent shadow-none text-xs font-semibold focus:ring-0">
                  <Calendar className="h-3.5 w-3.5 mr-1.5 shrink-0 text-muted-foreground" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTH_OPTIONS.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <span className="text-[10px] text-muted-foreground font-bold px-0.5">vs</span>
              <Select value={monthB} onValueChange={setMonthB}>
                <SelectTrigger className="w-32 h-8 border-none bg-transparent shadow-none text-xs font-semibold focus:ring-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTH_OPTIONS.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button size="sm" variant="outline" className="h-10 w-10 p-0" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            </Button>
            <Button size="sm" variant="outline" className="h-10 text-xs font-semibold" onClick={handleExport} disabled={!m}>
              <Download className="h-4 w-4 mr-2" />
              Exportar
            </Button>
          </div>
        </div>

        {/* ── Error Banner ── */}
        {error && (
          <Alert variant="destructive" className="rounded-xl border border-red-500/20 bg-red-500/5">
            <AlertCircle className="h-4 w-4 text-red-500" />
            <AlertDescription className="text-red-600 dark:text-red-400 font-semibold">
              Error al cargar datos de analíticas: {(error as Error).message}
            </AlertDescription>
          </Alert>
        )}

        {/* ── Tabs (Main Dashboard vs AI Insights) ── */}
        <Tabs value={activeView} onValueChange={setActiveView} className="space-y-6">
          <TabsList className="h-11 bg-muted/60 p-1 rounded-full border max-w-xs grid grid-cols-2">
            <TabsTrigger value="dashboard" className="rounded-full font-bold text-xs data-[state=active]:bg-red-600 data-[state=active]:text-white"><TrendingUp className="h-3.5 w-3.5 mr-2" />Dashboard</TabsTrigger>
            <TabsTrigger value="ai" className="rounded-full font-bold text-xs data-[state=active]:bg-red-600 data-[state=active]:text-white"><Brain className="h-3.5 w-3.5 mr-2" />Insights IA</TabsTrigger>
          </TabsList>

          {/* ════════════════ MAIN DASHBOARD ════════════════ */}
          <TabsContent value="dashboard" className="space-y-6 mt-0">
            
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              {isLoading ? Array(5).fill(0).map((_, i) => <KPISkeleton key={i} />) : (
                <>
                  <KPICard 
                    title="Ingresos Cobrados" 
                    value={formatCurrency(m?.paidRevenue ?? 0)} 
                    change={m?.revenueMoM} 
                    icon={<DollarSign className="h-4 w-4 text-red-500" />} 
                    highlight 
                    tooltipText="Suma de montos recaudados de facturas pagadas dentro del mes principal seleccionado."
                    breakdown={
                      <div className="grid grid-cols-2 gap-2 text-[10px] text-muted-foreground leading-tight">
                        <div>
                          <div className="font-semibold text-foreground/80">Regulares</div>
                          <div className="text-[12px] font-bold text-foreground mt-0.5">{formatCurrency(m?.regularPaidRevenue ?? 0)}</div>
                          <div className="text-[9px] mt-0.5 opacity-80">Prev: {formatCurrency(m?.execPrevRegularPaidRevenue ?? 0)}</div>
                        </div>
                        <div className="border-l pl-2 border-muted/60">
                          <div className="font-semibold text-foreground/80">Con Permiso</div>
                          <div className="text-[12px] font-bold text-foreground mt-0.5">{formatCurrency(m?.permitPaidRevenue ?? 0)}</div>
                          <div className="text-[9px] mt-0.5 opacity-80">Prev: {formatCurrency(m?.execPrevPermitPaidRevenue ?? 0)}</div>
                        </div>
                      </div>
                    }
                  />
                  <KPICard 
                    title="Paquetes Procesados" 
                    value={(m?.totalPackages ?? 0).toLocaleString()} 
                    change={m?.packagesMoM} 
                    icon={<Package className="h-4 w-4 text-red-500" />} 
                    tooltipText="Total de paquetes con manifiesto asignado (excluyendo trackings internos) procesados en el período. Desglosados en Regulares y Con Permiso."
                    breakdown={
                      <div className="grid grid-cols-2 gap-2 text-[10px] text-muted-foreground leading-tight">
                        <div>
                          <div className="font-semibold text-foreground/80">Regulares</div>
                          <div className="text-[12px] font-bold text-foreground mt-0.5">{(m?.regularPackages ?? 0).toLocaleString()}</div>
                          <div className="text-[9px] mt-0.5 opacity-80">Prev: {(m?.execPrevRegularPackages ?? 0).toLocaleString()}</div>
                        </div>
                        <div className="border-l pl-2 border-muted/60">
                          <div className="font-semibold text-foreground/80">Con Permiso</div>
                          <div className="text-[12px] font-bold text-foreground mt-0.5">{(m?.permitPackages ?? 0).toLocaleString()}</div>
                          <div className="text-[9px] mt-0.5 opacity-80">Prev: {(m?.execPrevPermitPackages ?? 0).toLocaleString()}</div>
                        </div>
                      </div>
                    }
                  />
                  <KPICard 
                    title="Kilos Movidos" 
                    value={`${(m?.totalWeight ?? 0).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg`} 
                    change={m?.weightMoM} 
                    icon={<Truck className="h-4 w-4 text-red-500" />} 
                    tooltipText="Suma del peso en kilogramos de todos los paquetes del período con manifiesto asignado (excluyendo trackings internos)."
                    breakdown={
                      <div className="grid grid-cols-2 gap-2 text-[10px] text-muted-foreground leading-tight">
                        <div>
                          <div className="font-semibold text-foreground/80">Regulares</div>
                          <div className="text-[12px] font-bold text-foreground mt-0.5">{(m?.regularWeight ?? 0).toFixed(1)} kg</div>
                          <div className="text-[9px] mt-0.5 opacity-80">Prev: {(m?.execPrevRegularWeight ?? 0).toFixed(1)} kg</div>
                        </div>
                        <div className="border-l pl-2 border-muted/60">
                          <div className="font-semibold text-foreground/80">Con Permiso</div>
                          <div className="text-[12px] font-bold text-foreground mt-0.5">{(m?.permitWeight ?? 0).toFixed(1)} kg</div>
                          <div className="text-[9px] mt-0.5 opacity-80">Prev: {(m?.execPrevPermitWeight ?? 0).toFixed(1)} kg</div>
                        </div>
                      </div>
                    }
                  />
                  <KPICard 
                    title="Base de Clientes" 
                    value={(m?.demographics?.totalCustomers ?? 0).toLocaleString()} 
                    icon={<Users className="h-4 w-4 text-red-500" />} 
                    tooltipText="Cantidad de clientes totales activos (excluyendo inactivos y eliminados). Desglosados en nuevos registrados recientemente vs legacy."
                    breakdown={
                      <div className="grid grid-cols-2 gap-2 text-[10px] text-muted-foreground leading-tight">
                        <div>
                          <div className="font-semibold text-foreground/80">Recientes</div>
                          <div className="text-[12px] font-bold text-foreground mt-0.5">{(m?.recentCustomersCount ?? 0).toLocaleString()}</div>
                          <div className="text-[9px] mt-0.5 opacity-80">Código SL26+</div>
                        </div>
                        <div className="border-l pl-2 border-muted/60">
                          <div className="font-semibold text-foreground/80">Legacy</div>
                          <div className="text-[12px] font-bold text-foreground mt-0.5">{(m?.legacyCustomersCount ?? 0).toLocaleString()}</div>
                          <div className="text-[9px] mt-0.5 opacity-80">Históricos</div>
                        </div>
                      </div>
                    }
                  />
                  <KPICard 
                    title="Pre-alertas Registradas" 
                    value={(m?.preAlertsCount ?? 0).toLocaleString()} 
                    change={m?.preAlertsMoM} 
                    icon={<PackageCheck className="h-4 w-4 text-red-500" />} 
                    tooltipText="Total de pre-alertas creadas por clientes antes del arribo del paquete a bodega de Miami."
                    breakdown={
                      <div className="grid grid-cols-2 gap-2 text-[10px] text-muted-foreground leading-tight">
                        <div>
                          <div className="font-semibold text-foreground/80">Regulares</div>
                          <div className="text-[12px] font-bold text-foreground mt-0.5">{(m?.regularPreAlerts ?? 0).toLocaleString()}</div>
                          <div className="text-[9px] mt-0.5 opacity-80">Prev: {(m?.execPrevRegularPreAlerts ?? 0).toLocaleString()}</div>
                        </div>
                        <div className="border-l pl-2 border-muted/60">
                          <div className="font-semibold text-foreground/80">Con Permiso</div>
                          <div className="text-[12px] font-bold text-foreground mt-0.5">{(m?.permitPreAlerts ?? 0).toLocaleString()}</div>
                          <div className="text-[9px] mt-0.5 opacity-80">Prev: {(m?.execPrevPermitPreAlerts ?? 0).toLocaleString()}</div>
                        </div>
                      </div>
                    }
                  />
                </>
              )}
            </div>

            {/* Main Charts & courier grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Composed historical 6-month trend chart */}
              <Card className="p-4 lg:col-span-2 flex flex-col justify-between">
                <div>
                  <h3 className="text-xs font-bold mb-4 text-foreground flex items-center gap-2 uppercase tracking-wider">
                    <TrendingUp className="h-4 w-4 text-red-500" />
                    Tendencia de los Últimos 6 Meses
                  </h3>
                  {isLoading ? <ChartSkeleton h={220} /> : (
                    <ResponsiveContainer width="100%" height={220}>
                      <ComposedChart data={trendWithLabels} margin={{ top: 10, right: -5, left: -20, bottom: 0 }}>
                        <defs>
                          <linearGradient id="gradRev" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={chartColors.area} stopOpacity={0.15} />
                            <stop offset="95%" stopColor={chartColors.area} stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
                        <XAxis dataKey="label" tick={chartTick} />
                        <YAxis yAxisId="rev" tick={chartTick} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                        <YAxis yAxisId="pkg" orientation="right" tick={chartTick} />
                        <Tooltip contentStyle={tooltipStyle} formatter={(v: number, name) => name === "Ingresos" ? formatCurrency(v) : v} />
                        <Legend wrapperStyle={{ fontSize: 10, paddingTop: 10 }} />
                        <Area yAxisId="rev" type="monotone" dataKey="revenue" name="Ingresos" stroke={chartColors.area} fill="url(#gradRev)" strokeWidth={2} dot={{ r: 4 }} />
                        <Line yAxisId="pkg" type="monotone" dataKey="packages" name="Paquetes" stroke={chartColors.barAlt} strokeWidth={1.5} dot={{ r: 3 }} strokeDasharray="3 3" />
                      </ComposedChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </Card>

              {/* Courier Performance Card */}
              <Card className="p-4 flex flex-col justify-between">
                <div>
                  <div className="space-y-1 mb-4">
                    <h3 className="text-xs font-bold text-foreground flex items-center gap-2 uppercase tracking-wider">
                      <Globe className="h-4 w-4 text-red-500" />
                      Comportamiento por Courier
                    </h3>
                    <p className="text-[10px] text-muted-foreground font-semibold">
                      Cuota de mercado de paquetes procesados por transportista de origen.
                    </p>
                  </div>
                  {isLoading ? <ChartSkeleton h={220} /> : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b text-muted-foreground">
                            <th className="text-left py-2 font-semibold">Courier</th>
                            <th className="text-right py-2 font-semibold">Cuota</th>
                            <th className="text-right py-2 font-semibold">MoM</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(m?.shipperMoM || [])
                            .filter((s) => {
                              const pct = m?.packagesByShipper.find(x => x.name === s.name)?.pct ?? 0;
                              return pct > 0;
                            })
                            .map((s) => {
                              const marketShare = m?.packagesByShipper.find(x => x.name === s.name)?.pct ?? 0;
                              const changeVal = s.change;
                              const hasChange = changeVal !== null && changeVal !== undefined;
                              
                              return (
                                <tr key={s.name} className="border-b hover:bg-muted/30 transition-colors">
                                  <td className="py-2.5 font-bold text-foreground flex items-center gap-1.5">
                                    <span className={`h-2 w-2 rounded-full ${
                                      s.name === 'Amazon' ? 'bg-amber-500' :
                                      s.name === 'Shein' ? 'bg-zinc-800 dark:bg-zinc-200' :
                                      s.name === 'Temu' ? 'bg-orange-600' :
                                      s.name === 'USPS' ? 'bg-blue-600' :
                                      s.name === 'UPS' ? 'bg-amber-600' :
                                      s.name === 'DHL' ? 'bg-yellow-500' :
                                      s.name === 'FedEx' ? 'bg-purple-600' :
                                      s.name === 'SPX' ? 'bg-orange-500' : 'bg-muted-foreground'
                                    }`} />
                                    {s.name}
                                  </td>
                                  <td className="py-2.5 text-right font-medium text-foreground">{marketShare}%</td>
                                  <td className="py-2.5 text-right">
                                    {hasChange ? (
                                      <span className={`font-bold ${changeVal! >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>
                                        {formatChange(changeVal!)}
                                      </span>
                                    ) : (
                                      <span className="text-[10px] text-muted-foreground italic">N/A</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </Card>
            </div>

            {/* Operational and Route breakdowns */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Ops: Status & Volumes */}
              <Card className="p-4 flex flex-col justify-between">
                <div>
                  <h3 className="text-xs font-bold mb-4 text-foreground flex items-center gap-2 uppercase tracking-wider">
                    <Truck className="h-4 w-4 text-red-500" />
                    Desglose Operativo
                  </h3>
                  {isLoading ? <ChartSkeleton h={180} /> : (
                    <div className="space-y-3">
                      {(m?.packagesByStatus || []).slice(0, 5).map((s) => (
                        <div key={s.status} className="space-y-1">
                          <div className="flex justify-between text-xs font-semibold">
                            <span className="text-foreground">{labelStatus(s.status)}</span>
                            <span className="text-muted-foreground">{s.count} ({s.pct}%)</span>
                          </div>
                          <Progress value={s.pct} className="h-1.5" />
                        </div>
                      ))}
                      {(m?.packagesByStatus || []).length === 0 && (
                        <p className="text-xs text-muted-foreground text-center py-10">Sin datos operativos</p>
                      )}
                    </div>
                  )}
                </div>
              </Card>

              {/* Ops: Package Volumes by Route chart */}
              <Card className="p-4 flex flex-col justify-between">
                <div>
                  <h3 className="text-xs font-bold mb-4 text-foreground flex items-center gap-2 uppercase tracking-wider">
                    <Package className="h-4 w-4 text-red-500" />
                    Volumen por Ruta
                  </h3>
                  {isLoading ? <ChartSkeleton h={180} /> : (
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={m?.packagesByRoute || []} layout="vertical" margin={{ top: 0, right: 10, left: -10, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} horizontal={false} />
                        <XAxis type="number" tick={chartTick} />
                        <YAxis type="category" dataKey="route" tick={{ fontSize: 9, fill: isDark ? "#9CA3AF" : "#6B7280" }} width={80} />
                        <Tooltip contentStyle={tooltipStyle} />
                        <Bar dataKey="count" name="Paquetes" fill={chartColors.area} radius={[0, 3, 3, 0]}>
                          {(m?.packagesByRoute || []).map((_, i) => <Cell key={i} fill={palette[i % palette.length]} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </Card>

              {/* Demographics: Membership distribution */}
              <Card className="p-4 flex flex-col justify-between">
                <div>
                  <h3 className="text-xs font-bold mb-4 text-foreground flex items-center gap-2 uppercase tracking-wider">
                    <Star className="h-4 w-4 text-red-500" />
                    Nivel de Membresía
                  </h3>
                  {isLoading ? <ChartSkeleton h={180} /> : (
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={m?.demographics?.tiers || []} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
                        <XAxis dataKey="label" tick={{ fontSize: 9 }} />
                        <YAxis tick={chartTick} />
                        <Tooltip contentStyle={tooltipStyle} />
                        <Bar dataKey="count" name="Clientes" fill={chartColors.area} radius={[4, 4, 0, 0]}>
                          {(m?.demographics?.tiers || []).map((_, i) => <Cell key={i} fill={palette[i % palette.length]} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </Card>
            </div>

            {/* Route Volume History (Last 6 Months) */}
            <Card className="p-4 flex flex-col justify-between">
              <div>
                <h3 className="text-xs font-bold mb-4 text-foreground flex items-center justify-between uppercase tracking-wider">
                  <div className="flex items-center gap-2">
                    <Truck className="h-4 w-4 text-red-500" />
                    Historial de Volumen por Ruta (Últimos 6 Meses)
                  </div>
                  {selectedRoute && (
                    <Badge 
                      variant="outline" 
                      className="normal-case bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20 rounded-full px-2.5 py-0.5 flex items-center gap-1.5 cursor-pointer hover:bg-red-500/20 transition-all text-[9px] font-bold"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedRoute(null);
                      }}
                    >
                      <span>Filtrado: <strong>{selectedRoute}</strong></span>
                      <span className="text-[11px] leading-none hover:text-red-700">×</span>
                    </Badge>
                  )}
                </h3>
                {isLoading ? <ChartSkeleton h={380} /> : (
                  <ResponsiveContainer width="100%" height={380}>
                    <LineChart 
                      data={routeTrendData.chartData} 
                      margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
                      <XAxis dataKey="period" tick={chartTick} />
                      <YAxis tick={chartTick} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Legend 
                        wrapperStyle={{ fontSize: 10, paddingTop: 10, cursor: 'pointer' }}
                        onClick={(props: any, index: any, event: any) => {
                          const evt = event || index;
                          if (evt && typeof evt.stopPropagation === 'function') {
                            evt.stopPropagation();
                          }
                          const route = String(props.dataKey || props.value || '');
                          if (route) {
                            setSelectedRoute(prev => prev === route ? null : route);
                          }
                        }}
                      />
                      {routeTrendData.activeRoutes.map((rName, i) => {
                        const isSelected = selectedRoute === rName;
                        const isAnySelected = selectedRoute !== null;
                        const opacity = isAnySelected ? (isSelected ? 1.0 : 0.12) : 0.85;
                        const strokeWidth = isAnySelected ? (isSelected ? 3.5 : 0.8) : 2;
                        const dotRadius = isAnySelected ? (isSelected ? 5 : 0) : 4;

                        return (
                          <Line
                            key={rName}
                            type="monotone"
                            dataKey={rName}
                            stroke={routeColors[i % routeColors.length]}
                            strokeWidth={strokeWidth}
                            strokeOpacity={opacity}
                            dot={dotRadius > 0 ? { r: dotRadius } : false}
                            activeDot={{ r: 6 }}
                            onClick={(data: any, event: any) => {
                              if (event && typeof event.stopPropagation === 'function') {
                                event.stopPropagation();
                              }
                              setSelectedRoute(prev => prev === rName ? null : rName);
                            }}
                            className="cursor-pointer"
                          />
                        );
                      })}
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </Card>

            {/* Courier Volume History (Last 6 Months) */}
            <Card className="p-4 flex flex-col justify-between">
              <div>
                <h3 className="text-xs font-bold mb-4 text-foreground flex items-center justify-between uppercase tracking-wider">
                  <div className="flex items-center gap-2">
                    <PackageCheck className="h-4 w-4 text-red-500" />
                    Historial de Paquetes por Servicio de Encomienda (Últimos 6 Meses)
                  </div>
                  {selectedCourier && (
                    <Badge 
                      variant="outline" 
                      className="normal-case bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20 rounded-full px-2.5 py-0.5 flex items-center gap-1.5 cursor-pointer hover:bg-red-500/20 transition-all text-[9px] font-bold"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedCourier(null);
                      }}
                    >
                      <span>Filtrado: <strong>{selectedCourier}</strong></span>
                      <span className="text-[11px] leading-none hover:text-red-700">×</span>
                    </Badge>
                  )}
                </h3>
                {isLoading ? <ChartSkeleton h={500} /> : (
                  <ResponsiveContainer width="100%" height={500}>
                    <LineChart 
                      data={courierTrendData.chartData} 
                      margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
                      <XAxis dataKey="period" tick={chartTick} />
                      <YAxis tick={chartTick} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Legend 
                        wrapperStyle={{ fontSize: 10, paddingTop: 10, cursor: 'pointer' }}
                        onClick={(props: any, index: any, event: any) => {
                          const evt = event || index;
                          if (evt && typeof evt.stopPropagation === 'function') {
                            evt.stopPropagation();
                          }
                          const courier = String(props.dataKey || props.value || '');
                          if (courier) {
                            setSelectedCourier(prev => prev === courier ? null : courier);
                          }
                        }}
                      />
                      {courierTrendData.activeCouriers.map((cName, i) => {
                        const isSelected = selectedCourier === cName;
                        const isAnySelected = selectedCourier !== null;
                        const opacity = isAnySelected ? (isSelected ? 1.0 : 0.12) : 0.85;
                        const strokeWidth = isAnySelected ? (isSelected ? 3.5 : 0.8) : 2;
                        const dotRadius = isAnySelected ? (isSelected ? 5 : 0) : 4;

                        return (
                          <Line
                            key={cName}
                            type="monotone"
                            dataKey={cName}
                            stroke={routeColors[(i + 4) % routeColors.length]}
                            strokeWidth={strokeWidth}
                            strokeOpacity={opacity}
                            dot={dotRadius > 0 ? { r: dotRadius } : false}
                            activeDot={{ r: 6 }}
                            onClick={(data: any, event: any) => {
                              if (event && typeof event.stopPropagation === 'function') {
                                event.stopPropagation();
                              }
                              setSelectedCourier(prev => prev === cName ? null : cName);
                            }}
                            className="cursor-pointer"
                          />
                        );
                      })}
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </Card>

            {/* User Registrations History (Last 6 Months) */}
            <Card className="p-4 flex flex-col justify-between">
              <div>
                <h3 className="text-xs font-bold mb-4 text-foreground flex items-center gap-2 uppercase tracking-wider">
                  <Users className="h-4 w-4 text-red-500" />
                  Nuevos Usuarios Registrados (Últimos 6 Meses)
                </h3>
                {isLoading ? <ChartSkeleton h={380} /> : (
                  <ResponsiveContainer width="100%" height={380}>
                    <AreaChart 
                      data={routeTrendData.chartData.map((d, idx) => {
                        const rawPoint = trendData?.revenueTrend?.[idx];
                        return {
                          period: d.period,
                          'Nuevos Usuarios': rawPoint?.newCustomers ?? 0
                        };
                      })} 
                      margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient id="colorNewUsers" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#ef4444" stopOpacity={0.25}/>
                          <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
                      <XAxis dataKey="period" tick={chartTick} />
                      <YAxis tick={chartTick} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Area 
                        type="monotone" 
                        dataKey="Nuevos Usuarios" 
                        stroke="#ef4444" 
                        strokeWidth={2.5}
                        fillOpacity={1} 
                        fill="url(#colorNewUsers)" 
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </Card>

            {/* Financial comparison & top client grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Comparative Routes Invoices list with Tendencia */}
              <Card className="p-4 lg:col-span-2 flex flex-col justify-between">
                <div>
                  <div className="space-y-1 mb-4">
                    <h3 className="text-xs font-bold text-foreground flex items-center gap-2 uppercase tracking-wider">
                      <Receipt className="h-4 w-4 text-red-500" />
                      Comparativa de Facturación por Ruta
                    </h3>
                    <p className="text-[10px] text-muted-foreground font-semibold flex items-center gap-1.5">
                      * Indica si el total facturado subió o mermó en relación al mes anterior. Selecciona una ruta para resaltarla en el gráfico.
                    </p>
                  </div>
                  {isLoading ? <ChartSkeleton h={180} /> : (
                    <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
                      {comparativeRoutes.map((r) => {
                        const isSelected = selectedRoute === r.route;
                        const routeColor = getRouteColor(r.route);
                        const diffAmt = r.amountA - r.amountB;
                        const diffPct = r.amountB > 0 ? (diffAmt / r.amountB) * 100 : 0;
                        const roundedPct = Math.round(diffPct * 10) / 10;

                        const trendBadge = diffAmt > 0 ? (
                          <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/15 gap-1 py-0.5 rounded-full text-[10px] font-bold">
                            <TrendingUp className="h-3 w-3" />
                            Subió +{roundedPct}%
                          </Badge>
                        ) : diffAmt < 0 ? (
                          <Badge className="bg-red-500/10 text-red-600 border border-red-500/20 hover:bg-red-500/15 gap-1 py-0.5 rounded-full text-[10px] font-bold">
                            <TrendingDown className="h-3 w-3" />
                            Mermó {roundedPct}%
                          </Badge>
                        ) : (
                          <Badge className="bg-muted text-muted-foreground border border-muted-foreground/10 hover:bg-muted/80 gap-1 py-0.5 rounded-full text-[10px] font-semibold">
                            Sin cambios
                          </Badge>
                        );

                        const pctB = (r.amountB / maxAmount) * 100;
                        const pctA = (r.amountA / maxAmount) * 100;

                        return (
                          <div
                            key={r.route}
                            onClick={() => setSelectedRoute(prev => prev === r.route ? null : r.route)}
                            className={`p-3 rounded-xl border transition-all duration-200 cursor-pointer ${
                              isSelected 
                                ? 'border-red-500 bg-red-500/[0.03] dark:bg-red-500/[0.02] shadow-sm'
                                : 'border-border bg-card/50 hover:bg-muted/40 hover:border-muted-foreground/30'
                            }`}
                          >
                            {/* Route Info & Trend Badge */}
                            <div className="flex items-center justify-between mb-2.5">
                              <div className="flex items-center gap-2">
                                <span 
                                  className="h-3 w-3 rounded-full shrink-0" 
                                  style={{ backgroundColor: routeColor }}
                                />
                                <span className="font-bold text-sm text-foreground">{r.route}</span>
                              </div>
                              {trendBadge}
                            </div>

                            {/* Visual comparison bars */}
                            <div className="space-y-2 mb-1.5">
                              {/* Previous Month Bar (Month B) */}
                              <div className="space-y-1">
                                <div className="flex justify-between text-[10px] text-muted-foreground">
                                  <span>{formatMonthLabel(monthB)} (Anterior)</span>
                                  <span className="font-medium">{formatCurrency(r.amountB)}</span>
                                </div>
                                <div className="h-1.5 w-full bg-muted/30 rounded-full overflow-hidden">
                                  <div 
                                    className="h-full bg-muted-foreground/30 dark:bg-muted-foreground/20 rounded-full transition-all duration-500" 
                                    style={{ width: `${pctB}%` }}
                                  />
                                </div>
                              </div>

                              {/* Current Month Bar (Month A) */}
                              <div className="space-y-1">
                                <div className="flex justify-between text-[10px] font-semibold text-foreground">
                                  <span>{formatMonthLabel(monthA)} (Actual)</span>
                                  <span>{formatCurrency(r.amountA)}</span>
                                </div>
                                <div className="h-2 w-full bg-muted/20 rounded-full overflow-hidden">
                                  <div 
                                    className="h-full rounded-full transition-all duration-500" 
                                    style={{ 
                                      width: `${pctA}%`,
                                      backgroundColor: routeColor
                                    }}
                                  />
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      {comparativeRoutes.length === 0 && (
                        <div className="py-8 text-center text-muted-foreground">Sin facturas registradas</div>
                      )}
                    </div>
                  )}
                </div>

                {/* AI Strategist Priority Banner */}
                <div className="mt-4 p-3 rounded-xl border border-red-200 bg-red-50/50 dark:border-red-950/20 dark:bg-red-950/10 flex items-start gap-2.5 text-xs">
                  <Megaphone className="h-4.5 w-4.5 text-red-500 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <span className="font-bold text-red-800 dark:text-red-400">Acción Recomendada:</span>
                    <p className="text-muted-foreground leading-relaxed text-[11px]">
                      {m && m.execCollectionRate < 80 
                        ? "Tasa de cobro por debajo del objetivo. Recomendamos enviar recordatorios masivos para facturas pendientes del período y activar recargos."
                        : "Rendimiento de cobro estable. Promocione campañas de lockers para optimizar la logística de última milla."
                      }
                    </p>
                  </div>
                </div>
              </Card>

              {/* Top Customers list by revenue */}
              <Card className="p-4 flex flex-col justify-between">
                <div>
                  <h3 className="text-xs font-bold mb-3 text-foreground flex items-center gap-2 uppercase tracking-wider">
                    <DollarSign className="h-4 w-4 text-red-500" />
                    Top Clientes por Ingresos
                  </h3>
                  {isLoading ? <ChartSkeleton h={220} /> : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b text-muted-foreground">
                            <th className="text-left py-2 font-semibold">Cliente</th>
                            <th className="text-right py-2 font-semibold">Monto</th>
                            <th className="text-right py-2 font-semibold">Facturas</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(m?.topByRevenue || []).slice(0, 7).map((c) => (
                            <tr key={c.slCode} className="border-b hover:bg-muted/30 transition-colors">
                              <td className="py-2.5 font-bold text-foreground">
                                {c.name ? <span title={c.slCode}>{c.name}</span> : c.slCode}
                                {c.name && <span className="block text-[9px] text-muted-foreground font-semibold">{c.slCode}</span>}
                              </td>
                              <td className="py-2.5 text-right font-bold text-foreground">{formatCurrency(c.revenue)}</td>
                              <td className="py-2.5 text-right text-muted-foreground font-semibold">{c.count}</td>
                            </tr>
                          ))}
                          {(m?.topByRevenue || []).length === 0 && (
                            <tr><td colSpan={3} className="py-4 text-center text-muted-foreground">Sin datos financieros</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </Card>
            </div>
          </TabsContent>

          {/* ════════════════ AI STRATEGIST INSIGHTS ════════════════ */}
          <TabsContent value="ai" className="space-y-6 mt-0">
            <Card className="p-5">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b pb-5">
                <div className="space-y-1">
                  <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                    <Brain className="h-5 w-5 text-red-500" /> Insights Estratégicos con IA
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Análisis profundo de Gemini sobre tus ingresos, operaciones y clientes para recomendar optimizaciones inmediatas.
                  </p>
                </div>
                <Button
                  onClick={() => m && ai.generate(m)}
                  disabled={ai.isLoading || isLoading || !m}
                  className="shrink-0 rounded-xl px-5 h-11 bg-red-500 text-white hover:bg-red-600 gap-2 font-bold text-xs"
                >
                  {ai.isLoading ? (
                    <><Loader2 className="h-4 w-4 animate-spin" />Analizando…</>
                  ) : (
                    <><Sparkles className="h-4 w-4" />Generar Insights</>
                  )}
                </Button>
              </div>

              {ai.error && (
                <Alert variant="destructive" className="mt-4 rounded-xl">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="font-semibold">{ai.error}</AlertDescription>
                </Alert>
              )}

              {!ai.insights && !ai.isLoading && !ai.error && (
                <div className="mt-6 text-center py-16 border border-dashed rounded-xl bg-muted/20">
                  <Brain className="h-12 w-12 mx-auto text-muted-foreground mb-4 animate-pulse" />
                  <p className="text-sm font-bold text-muted-foreground">
                    Haz clic en "Generar Insights" para iniciar el análisis sobre los meses comparados.
                  </p>
                </div>
              )}

              {ai.isLoading && (
                <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                  {Array(4).fill(0).map((_, i) => (
                    <Card key={i} className="p-4 space-y-3">
                      <div className="h-4 w-32 bg-muted rounded animate-pulse" />
                      <div className="h-3 w-full bg-muted rounded animate-pulse" />
                      <div className="h-3 w-4/5 bg-muted rounded animate-pulse" />
                    </Card>
                  ))}
                </div>
              )}

              {ai.insights && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-6 space-y-6">
                  {ai.insights.summary && (
                    <Card className="p-4 bg-red-500/5 border-red-500/20 rounded-xl">
                      <p className="text-sm font-bold text-foreground mb-1.5 flex items-center gap-2">
                        <Target className="h-4 w-4 text-red-500" /> Resumen Ejecutivo
                      </p>
                      <p className="text-xs text-muted-foreground leading-relaxed font-semibold">{ai.insights.summary}</p>
                    </Card>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {[
                      { key: "revenueInsights", label: "Ingresos & Finanzas", icon: <DollarSign className="h-4.5 w-4.5 text-red-500" /> },
                      { key: "operationalInsights", label: "Eficiencia Operacional", icon: <Truck className="h-4.5 w-4.5 text-red-500" /> },
                      { key: "marketingOpportunities", label: "Oportunidades de Mercadeo", icon: <Megaphone className="h-4.5 w-4.5 text-red-500" /> },
                      { key: "newServiceOpportunities", label: "Nuevos Servicios", icon: <Lightbulb className="h-4.5 w-4.5 text-red-500" /> },
                    ].map(({ key, label, icon }) => {
                      const items = (ai.insights as any)[key] as string[] || [];
                      return (
                        <Card key={key} className="p-4 space-y-3 rounded-xl transition-all duration-300 hover:shadow-sm">
                          <p className="text-xs font-bold text-foreground flex items-center gap-2">{icon}{label}</p>
                          <ul className="space-y-2.5">
                            {items.map((item, i) => (
                              <li key={i} className="flex gap-2.5 text-xs text-muted-foreground font-semibold">
                                <span className="mt-0.5 h-4 w-4 shrink-0 rounded-full bg-red-500/10 flex items-center justify-center text-[9px] font-bold text-red-600">{i + 1}</span>
                                <span className="leading-normal">{item}</span>
                              </li>
                            ))}
                          </ul>
                        </Card>
                      );
                    })}
                  </div>
                  <Card className="p-4 rounded-xl">
                    <p className="text-xs font-bold text-foreground flex items-center gap-2 mb-3">
                      <Target className="h-4.5 w-4.5 text-red-500" /> Prioridades Estratégicas
                    </p>
                    <ol className="space-y-2.5">
                      {(ai.insights.strategicPriorities || []).map((p, i) => (
                        <li key={i} className="flex gap-3 text-xs font-semibold">
                          <Badge variant="outline" className="shrink-0 h-5 w-5 p-0 flex items-center justify-center text-[10px] font-bold bg-muted text-foreground border-none">{i + 1}</Badge>
                          <span className="text-muted-foreground leading-normal mt-0.5">{p}</span>
                        </li>
                      ))}
                    </ol>
                  </Card>
                </motion.div>
              )}
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
