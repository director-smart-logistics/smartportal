import { useState, useEffect, useMemo, useCallback, memo } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useLocale } from "@/hooks/useLocale";
import { useFeatureFlag } from "@/lib/context/FeatureFlagsContext";
import { usePermissions } from "@/lib/hooks/usePermissions";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Package,
  Users,
  Settings,
  Map,
  BarChart3,
  Truck,
  FileText,
  ClipboardList,
  Menu,
  ScanLine,
  Warehouse,
  Building2,
  FolderOpen,
  UserCog,
  Clock,
  TrendingUp,
  Palmtree,
  Gift,
  Briefcase,
  DollarSign,
  Coffee,
  Sliders,
  FileSpreadsheet,
  Sparkles,
  Bell,
  Globe,
  LogOut,
  ChevronDown,
  Search,
  Printer,
  ScrollText,
  BellRing,
  Layers,
  BookOpen,
  RotateCcw,
  Gauge,
  Brain,
  Calculator,
  Bot,
  Undo2,
} from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { GlobalSearch } from "@/components/layouts/GlobalSearch";
import { auditService } from "@/lib/services/auditService";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Language } from "@/i18n/config";

// ── Nav item shape (mirrors Sidebar) ─────────────────────────────────────────

interface NavItemDef {
  label: string;
  href: string;
  icon: React.ReactNode;
  description?: string;
  resource: string;
  section: string;
  subsection?: string;
  roles: string[];
}

// ── Desktop nav link ──────────────────────────────────────────────────────────

function NavLink({
  href,
  icon,
  label,
  description,
  active,
  onClick,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  description?: string;
  active: boolean;
  onClick?: () => void;
}) {
  return (
    <Link
      to={href}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group nav-item-brand-hover flex items-start gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active ? "bg-primary/10 text-primary font-medium" : "text-foreground",
      )}
    >
      <span
        className={cn(
          "mt-0.5 shrink-0 nav-item-icon",
          active ? "text-primary" : "text-muted-foreground",
        )}
      >
        {icon}
      </span>
      <div className="flex flex-col min-w-0">
        <span className="font-medium leading-tight">{label}</span>
        {description && (
          <span className="text-xs text-muted-foreground leading-tight mt-0.5 line-clamp-1">
            {description}
          </span>
        )}
      </div>
    </Link>
  );
}

// ── Section grid for dropdown content ────────────────────────────────────────

function NavSection({
  title,
  items,
  active,
  onNavigate,
}: {
  title?: string;
  items: NavItemDef[];
  active: string;
  onNavigate?: () => void;
}) {
  if (items.length === 0) return null;
  return (
    <div>
      {title && (
        <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
          {title}
        </p>
      )}
      <ul className="space-y-0.5">
        {items.map((item) => (
          <li key={item.href}>
            <NavLink
              href={item.href}
              icon={item.icon}
              label={item.label}
              description={item.description}
              active={
                active === item.href || active.startsWith(item.href + "/")
              }
              onClick={onNavigate}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Mobile drawer nav ─────────────────────────────────────────────────────────

function MobileNavItem({
  item,
  active,
  onClick,
}: {
  item: NavItemDef;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <Link
      to={item.href}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
        active
          ? "bg-primary/10 text-primary"
          : "text-foreground hover:bg-accent hover:text-accent-foreground",
      )}
    >
      <span
        className={cn(
          "shrink-0",
          active ? "text-primary" : "text-muted-foreground",
        )}
      >
        {item.icon}
      </span>
      {item.label}
    </Link>
  );
}

// ── Main Navbar ───────────────────────────────────────────────────────────────

function AppNavbarInner() {
  const { user, logout } = useAuth();
  const { t, language, changeLanguage } = useLocale([
    "menu",
    "payroll",
    "users",
    "dashboard",
    "common",
  ]);
  const location = useLocation();
  const {
    canView,
    permissions,
    isLoading: permLoading,
    error: permError,
  } = usePermissions();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openSection, setOpenSection] = useState<string | null>(null);
  const [visible, setVisible] = useState(true);
  const [lastScrollTop, setLastScrollTop] = useState(0);

  // Hide mobile navbar on scroll down, show on scroll up
  useEffect(() => {
    const mainContent = document.getElementById('main-content');
    if (!mainContent) return;

    const handleScroll = () => {
      const currentScrollTop = mainContent.scrollTop;
      if (currentScrollTop > 48 && currentScrollTop > lastScrollTop) {
        setVisible(false);
      } else {
        setVisible(true);
      }
      setLastScrollTop(currentScrollTop);
    };

    mainContent.addEventListener('scroll', handleScroll, { passive: true });
    return () => mainContent.removeEventListener('scroll', handleScroll);
  }, [lastScrollTop]);

  // Close mobile drawer and desktop dropdowns on route change
  useEffect(() => {
    setMobileOpen(false);
    setOpenSection(null);
    setVisible(true);
  }, [location.pathname]);

  const handleLogout = useCallback(async () => {
    try {
      if (user) await auditService.logLogout(user.id);
      await logout();
    } catch (e) {
      console.error("Logout failed:", e);
    }
  }, [user, logout]);

  const handleLanguageToggle = useCallback(() => {
    const next: Language = language === "en" ? "es" : "en";
    changeLanguage(next);
  }, [language, changeLanguage]);

  const initials = useMemo(
    () =>
      user?.fullName
        .split(" ")
        .map((p) => p[0])
        .join("")
        .toUpperCase()
        .slice(0, 2) ?? "U",
    [user?.fullName],
  );

  // ── Build nav items (memoized — only rebuilds when t() or language changes) ─

  const allItems = useMemo<NavItemDef[]>(
    () => [
      // operations — main
      {
        label: t("menu.inicio"),
        href: "/dashboard",
        icon: <LayoutDashboard className="h-4 w-4" />,
        resource: "dashboard",
        section: "operations",
        roles: ["ADMIN", "MANAGER", "STAFF", "AGENT", "DELIVERY", "CUSTOMER"],
      },
      {
        label: "Nova",
        href: "/nova",
        icon: (
          <img src="/logo.svg" alt="Nova" className="h-4 w-4 object-contain" />
        ),
        description: t("menu.novaProcessorDesc"),
        resource: "manifests",
        section: "nova",
        roles: ["ADMIN"],
      },
      // operations — datos
      {
        label: t("menu.guias"),
        href: "/manifests",
        icon: <FileText className="h-4 w-4" />,
        description: t("menu.cargaExcel"),
        resource: "manifests",
        section: "operations",
        subsection: "datos",
        roles: ["ADMIN", "MANAGER"],
      },
      {
        label: "Administrar Manifiestos",
        href: "/manifests/admin",
        icon: <FolderOpen className="h-4 w-4" />,
        description: "Gestionar, editar, eliminar y mover paquetes entre manifiestos",
        resource: "manifests",
        section: "operations",
        subsection: "datos",
        roles: ["ADMIN", "MANAGER"],
      },
      {
        label: t("menu.manifiestos"),
        href: "/packages",
        icon: <Package className="h-4 w-4" />,
        description: t("menu.trackingsPaquetes"),
        resource: "packages",
        section: "operations",
        subsection: "datos",
        roles: ["ADMIN", "MANAGER", "STAFF", "AGENT", "CUSTOMER"],
      },
      {
        label: "Clientes Temporales",
        href: "/temp-customers",
        icon: <UserCog className="h-4 w-4" />,
        description: "Administrar SL-NAN-* creados por Nova",
        resource: "customers",
        section: "operations",
        subsection: "datos",
        roles: ["ADMIN", "MANAGER"],
      },
      {
        label: "Nova Learning",
        href: "/nova-learning",
        icon: <Brain className="h-4 w-4" />,
        description: "Datos de aprendizaje de matching",
        resource: "manifests",
        section: "operations",
        subsection: "datos",
        roles: ["ADMIN", "MANAGER"],
      },
      // operations — proceso
      {
        label: t("menu.invoices"),
        href: "/invoices",
        icon: <FileText className="h-4 w-4" />,
        description: t("menu.facturarPaquetes"),
        resource: "invoices",
        section: "operations",
        subsection: "proceso",
        roles: ["ADMIN", "MANAGER"],
      },
      {
        label: t("menu.clientLedger"),
        href: "/client-ledger",
        icon: <BookOpen className="h-4 w-4" />,
        description: t("menu.clientLedgerDesc"),
        resource: "invoices",
        section: "operations",
        subsection: "proceso",
        roles: ["ADMIN", "MANAGER"],
      },
      {
        label: t("menu.invoiceRecovery"),
        href: "/invoices/recovery",
        icon: <RotateCcw className="h-4 w-4" />,
        description: t("menu.invoiceRecoveryDesc"),
        resource: "invoices",
        section: "operations",
        subsection: "proceso",
        roles: ["ADMIN", "MANAGER"],
      },
      {
        label: t("menu.quotes"),
        href: "/quotes",
        icon: <ClipboardList className="h-4 w-4" />,
        description: t("menu.cotizarServicios"),
        resource: "quotes",
        section: "operations",
        subsection: "proceso",
        roles: ["ADMIN", "MANAGER", "AGENT"],
      },
      // operations — logistica
      {
        label: t("menu.routes"),
        href: "/routes",
        icon: <Map className="h-4 w-4" />,
        description: t("menu.administrarRutas"),
        resource: "routes",
        section: "operations",
        subsection: "logistica",
        roles: ["ADMIN", "MANAGER"],
      },
      {
        label: "Sesiones de Ruta",
        href: "/routes/sessions",
        icon: <Gauge className="h-4 w-4" />,
        description: "Check-in/out por chofer",
        resource: "routes",
        section: "operations",
        subsection: "logistica",
        roles: ["ADMIN", "MANAGER", "DELIVERY"],
      },
      {
        label: t("menu.deliveries"),
        href: "/deliveries",
        icon: <Truck className="h-4 w-4" />,
        description: t("menu.entregasChoferes"),
        resource: "deliveries",
        section: "operations",
        subsection: "logistica",
        roles: ["AGENT", "ADMIN", "MANAGER"],
      },
      {
        label: t("menu.encomiendaManifests"),
        href: "/encomiendas/manifests",
        icon: <Package className="h-4 w-4" />,
        description: t("menu.encomiendaManifestsDesc"),
        resource: "encomiendas",
        section: "operations",
        subsection: "logistica-manifests",
        roles: ["ADMIN", "MANAGER"],
      },
      {
        label: t("menu.encomiendaDispatch"),
        href: "/encomiendas/salida",
        icon: <Truck className="h-4 w-4" />,
        description: t("menu.encomiendaDispatchDesc"),
        resource: "encomiendas",
        section: "operations",
        subsection: "logistica-manifests",
        roles: ["ADMIN", "MANAGER"],
      },
      {
        label: "Consolidados",
        href: "/consolidation/manifests",
        icon: <Layers className="h-4 w-4" />,
        description: "Manifiestos de Consolidaciones",
        resource: "invoices",
        section: "operations",
        subsection: "logistica-manifests",
        roles: ["ADMIN", "MANAGER"],
      },
      {
        label: "Devoluciones de Ruta",
        href: "/consolidation/returned",
        icon: <Undo2 className="h-4 w-4" />,
        description: "Gestión de paquetes devueltos en ruta",
        resource: "invoices",
        section: "operations",
        subsection: "logistica-manifests",
        roles: ["ADMIN", "MANAGER"],
      },
      {
        label: "GTI",
        href: "/gti/manifests",
        icon: <FileText className="h-4 w-4" />,
        description: "Manifiestos de tiquetes GTI",
        resource: "invoices",
        section: "operations",
        subsection: "logistica-manifests",
        roles: ["ADMIN", "MANAGER"],
      },
      // tools — logistics
      {
        label: t("menu.shippingLabels"),
        href: "/labels",
        icon: <Printer className="h-4 w-4" />,
        description: t("menu.shippingLabelsDesc"),
        resource: "shipping-labels",
        section: "tools",
        subsection: "tools-logistica",
        roles: ["ADMIN", "MANAGER"],
      },
      {
        label: t("menu.tracking"),
        href: "/tracking",
        icon: <Map className="h-4 w-4" />,
        description: t("menu.trackingDesc"),
        resource: "tracking",
        section: "tools",
        subsection: "tools-logistica",
        roles: ["ADMIN", "MANAGER", "STAFF", "AGENT", "CUSTOMER"],
      },
      {
        label: t("menu.preAlerts"),
        href: "/pre-alerts",
        icon: <BellRing className="h-4 w-4" />,
        description: t("menu.preAlertsDesc"),
        resource: "tracking",
        section: "tools",
        subsection: "tools-logistica",
        roles: ["ADMIN", "MANAGER", "STAFF"],
      },


      // tools — bodega
      {
        label: t("menu.scannerBodega"),
        href: "/scanner/bodega",
        icon: <Warehouse className="h-4 w-4" />,
        description: t("menu.scannerBodegaDesc"),
        resource: "scanner",
        section: "tools",
        subsection: "tools-bodega",
        roles: ["ADMIN", "MANAGER", "STAFF", "AGENT"],
      },
      // management — clientes

      {
        label: t("menu.customers"),
        href: "/customers",
        icon: <Users className="h-4 w-4" />,
        description: t("menu.customersDesc"),
        resource: "customers",
        section: "management",
        subsection: "mgmt-clientes",
        roles: ["ADMIN", "MANAGER"],
      },
      // management — finanzas

      {
        label: t("dashboard.statistics"),
        href: "/analytics",
        icon: <BarChart3 className="h-4 w-4" />,
        description: t("menu.analyticsDesc"),
        resource: "analytics",
        section: "management",
        subsection: "mgmt-finanzas",
        roles: ["ADMIN", "MANAGER"],
      },
      // hr — 4 core routes (simplified architecture)
      {
        label: t("menu.departments"),
        href: "/payroll/departments",
        icon: <Building2 className="h-4 w-4" />,
        description: t("menu.departmentsDesc"),
        resource: "payroll",
        section: "hr",
        subsection: "hr-people",
        roles: ["ADMIN", "MANAGER"],
      },
      {
        label: t("menu.employees"),
        href: "/payroll/employees",
        icon: <Users className="h-4 w-4" />,
        description: t("menu.employeesDesc"),
        resource: "payroll",
        section: "hr",
        subsection: "hr-people",
        roles: ["ADMIN", "MANAGER"],
      },
      {
        label: t("menu.benefits"),
        href: "/payroll/planilla",
        icon: <Palmtree className="h-4 w-4" />,
        description: t("menu.benefitsDesc"),
        resource: "payroll",
        section: "hr",
        subsection: "hr-payroll",
        roles: ["ADMIN", "MANAGER"],
      },
      {
        label: t("menu.runPayroll"),
        href: "/payroll/run",
        icon: <Sparkles className="h-4 w-4" />,
        description: t("menu.runPayrollDesc"),
        resource: "payroll",
        section: "hr",
        subsection: "hr-payroll",
        roles: ["ADMIN", "MANAGER"],
      },
      // management — sistema
      {
        label: t("users.manage"),
        href: "/users",
        icon: <Users className="h-4 w-4" />,
        description: t("menu.usersDesc"),
        resource: "users",
        section: "management",
        subsection: "mgmt-sistema",
        roles: ["ADMIN", "MANAGER"],
      },
      {
        label: t("menu.settings"),
        href: "/settings",
        icon: <Settings className="h-4 w-4" />,
        description: t("menu.settingsDesc"),
        resource: "settings",
        section: "management",
        subsection: "mgmt-sistema",
        roles: ["ADMIN", "CUSTOMER"],
      },
      {
        label: t("menu.encomiendas"),
        href: "/encomiendas",
        icon: <Truck className="h-4 w-4" />,
        description: t("menu.encomiendasDesc"),
        resource: "settings",
        section: "management",
        subsection: "mgmt-plataforma",
        roles: ["ADMIN", "MANAGER"],
      },
      {
        label: t("menu.releaseNotes"),
        href: "/release",
        icon: <ScrollText className="h-4 w-4" />,
        description: t("menu.releaseNotesDesc"),
        resource: "settings",
        section: "management",
        subsection: "mgmt-plataforma",
        roles: ["ADMIN", "MANAGER"],
      },
      // eslint-disable-next-line react-hooks/exhaustive-deps
    ],
    [t, language],
  );

  const showRouteReturns = useFeatureFlag("routeReturnsModule");

  // Permission-aware filter — only recomputes when permissions or items change
  const filteredItems = useMemo(
    () =>
      allItems.filter((item) => {
        if (!user) return false;
        
        // Hide returns page link if feature flag is disabled
        if (item.href === "/consolidation/returned" && !showRouteReturns) {
          return false;
        }

        const hasPerms = !permLoading && !permError && permissions.length > 0;
        return hasPerms
          ? canView(item.resource) && item.roles.includes(user.role)
          : item.roles.includes(user.role);
      }),
    [allItems, user, canView, permissions, permLoading, permError, showRouteReturns],
  );

  const bySection = (sec: string, sub?: string) =>
    filteredItems.filter((i) => i.section === sec && i.subsection === sub);

  // Nova — standalone primary item
  const novaItem = filteredItems.find((i) => i.section === "nova");

  // operations subsections
  const opMain = bySection("operations");
  const opDatos = bySection("operations", "datos");
  const opProceso = bySection("operations", "proceso");
  const opLogis = bySection("operations", "logistica");
  const opLogisManifests = bySection("operations", "logistica-manifests");
  const allOps = [
    ...opMain,
    ...opDatos,
    ...opProceso,
    ...opLogis,
    ...opLogisManifests,
  ];

  const toolsLogistica = bySection("tools", "tools-logistica");
  const toolsBodega = bySection("tools", "tools-bodega");
  const toolItems = [...toolsLogistica, ...toolsBodega];
  const mgmtClientes = bySection("management", "mgmt-clientes");
  const mgmtFinanzas = bySection("management", "mgmt-finanzas");
  const mgmtSistema = bySection("management", "mgmt-sistema");
  const mgmtPlataforma = bySection("management", "mgmt-plataforma");
  const mgmtItems = [
    ...mgmtClientes,
    ...mgmtFinanzas,
    ...mgmtSistema,
    ...mgmtPlataforma,
  ];
  const hrPeople = bySection("hr", "hr-people");
  const hrTime = bySection("hr", "hr-time");
  const hrPayroll = bySection("hr", "hr-payroll");
  const hrBenefits = bySection("hr", "hr-benefits");
  const hrItems = [...hrPeople, ...hrTime, ...hrPayroll, ...hrBenefits];
  const sysItems = bySection("system");

  const active = location.pathname;

  // Precise active detection — exact match OR sub-path (e.g. /customers/123 activates /customers)
  const isActive = (href: string) =>
    active === href || active.startsWith(href + "/");

  // Section-level active flags for desktop dropdown trigger highlighting
  const isOpActive = allOps.some((i) => isActive(i.href));
  const isToolsActive = toolItems.some((i) => isActive(i.href));
  const isMgmtActive = mgmtItems.some((i) => isActive(i.href));
  const isHrActive = hrItems.some((i) => isActive(i.href));
  const isSysActive = sysItems.some((i) => isActive(i.href));

  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full border-b bg-background transition-all duration-300 md:translate-y-0",
        !visible ? "-translate-y-full h-0 border-b-0 overflow-hidden" : "translate-y-0 h-16"
      )}
      role="banner"
      aria-label="Main navigation"
    >
      <div className="flex h-16 items-center gap-4 px-4 lg:px-6">
        {/* ── Logo ── */}
        <Link
          to="/"
          className="flex items-center shrink-0 mr-2"
          aria-label="Go to home"
        >
          {/* Hide text on small/medium screens, show on xl+ */}
          <div className="xl:hidden">
            <Logo showText={false} size="md" />
          </div>
          <div className="hidden xl:block">
            <Logo showText size="md" />
          </div>
        </Link>

        {/* ── Desktop nav ── */}
        <TooltipProvider delayDuration={300}>
          <nav
            className="hidden md:flex items-center gap-0.5"
            aria-label="Main navigation"
          >
            {/* Nova — primary standalone button */}
            {novaItem && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link
                    to="/nova"
                    aria-current={active === "/nova" ? "page" : undefined}
                    className={cn(
                      "nav-ghost-hover flex items-center gap-1.5 h-9 rounded-lg px-2.5 text-sm font-medium transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      active === "/nova"
                        ? "bg-primary/10 text-primary"
                        : "text-foreground",
                    )}
                  >
                    <img
                      src="/logo.svg"
                      alt=""
                      aria-hidden="true"
                      className="h-4 w-4 object-contain shrink-0"
                    />
                    <span className="hidden xl:inline">Nova</span>
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="xl:hidden">
                  Nova
                </TooltipContent>
              </Tooltip>
            )}

            {/* Operations */}
            {allOps.length > 0 && (
              <DropdownMenu
                open={openSection === "operations"}
                onOpenChange={(o) => setOpenSection(o ? "operations" : null)}
              >
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className={cn(
                          "nav-ghost-hover h-9 gap-1.5 text-sm font-medium px-2.5",
                          isOpActive && "text-primary",
                        )}
                      >
                        <Package className="h-3.5 w-3.5 shrink-0" />
                        <span className="hidden xl:inline">
                          {t("menu.operations")}
                        </span>
                        <ChevronDown className="h-3 w-3 text-muted-foreground" />
                      </Button>
                    </DropdownMenuTrigger>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    {t("menu.operations")}
                  </TooltipContent>
                </Tooltip>
                <DropdownMenuContent align="start" className="p-0 w-auto">
                  <div className="grid grid-cols-5 gap-x-2 gap-y-0 p-3 w-[960px]">
                    <div className="space-y-1">
                      <NavSection
                        items={opMain}
                        active={active}
                        onNavigate={() => setOpenSection(null)}
                      />
                    </div>
                    <div className="space-y-1">
                      {opDatos.length > 0 && (
                        <NavSection
                          title={t("menu.datos")}
                          items={opDatos}
                          active={active}
                          onNavigate={() => setOpenSection(null)}
                        />
                      )}
                    </div>
                    <div className="space-y-1">
                      {opProceso.length > 0 && (
                        <NavSection
                          title={t("menu.proceso")}
                          items={opProceso}
                          active={active}
                          onNavigate={() => setOpenSection(null)}
                        />
                      )}
                    </div>
                    <div className="space-y-1">
                      {opLogis.length > 0 && (
                        <NavSection
                          title={t("menu.logistica")}
                          items={opLogis}
                          active={active}
                          onNavigate={() => setOpenSection(null)}
                        />
                      )}
                    </div>
                    <div className="space-y-1">
                      {opLogisManifests.length > 0 && (
                        <NavSection
                          title={t("menu.logisticaManifests")}
                          items={opLogisManifests}
                          active={active}
                          onNavigate={() => setOpenSection(null)}
                        />
                      )}
                    </div>
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {/* Tools */}
            {toolItems.length > 0 && (
              <DropdownMenu
                open={openSection === "tools"}
                onOpenChange={(o) => setOpenSection(o ? "tools" : null)}
              >
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className={cn(
                          "nav-ghost-hover h-9 gap-1.5 text-sm font-medium px-2.5",
                          isToolsActive && "text-primary",
                        )}
                      >
                        <Settings className="h-3.5 w-3.5 shrink-0" />
                        <span className="hidden xl:inline">
                          {t("menu.tools")}
                        </span>
                        <ChevronDown className="h-3 w-3 text-muted-foreground" />
                      </Button>
                    </DropdownMenuTrigger>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    {t("menu.tools")}
                  </TooltipContent>
                </Tooltip>
                <DropdownMenuContent align="start" className="p-0 w-auto">
                  <div className="grid grid-cols-2 gap-x-2 p-3 w-[360px]">
                    <NavSection
                      title={t("menu.toolsLogistica")}
                      items={toolsLogistica}
                      active={active}
                      onNavigate={() => setOpenSection(null)}
                    />
                    <NavSection
                      title={t("menu.toolsBodega")}
                      items={toolsBodega}
                      active={active}
                      onNavigate={() => setOpenSection(null)}
                    />
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {/* Management */}
            {mgmtItems.length > 0 && (
              <DropdownMenu
                open={openSection === "management"}
                onOpenChange={(o) => setOpenSection(o ? "management" : null)}
              >
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className={cn(
                          "nav-ghost-hover h-9 gap-1.5 text-sm font-medium px-2.5",
                          isMgmtActive && "text-primary",
                        )}
                      >
                        <Users className="h-3.5 w-3.5 shrink-0" />
                        <span className="hidden xl:inline">
                          {t("menu.management")}
                        </span>
                        <ChevronDown className="h-3 w-3 text-muted-foreground" />
                      </Button>
                    </DropdownMenuTrigger>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    {t("menu.management")}
                  </TooltipContent>
                </Tooltip>
                <DropdownMenuContent align="start" className="p-0 w-auto">
                  <div className="grid grid-cols-4 gap-x-2 p-3 w-[780px]">
                    <NavSection
                      title={t("menu.mgmtClientes")}
                      items={mgmtClientes}
                      active={active}
                      onNavigate={() => setOpenSection(null)}
                    />
                    <NavSection
                      title={t("menu.mgmtFinanzas")}
                      items={mgmtFinanzas}
                      active={active}
                      onNavigate={() => setOpenSection(null)}
                    />
                    <NavSection
                      title={t("menu.mgmtSistema")}
                      items={mgmtSistema}
                      active={active}
                      onNavigate={() => setOpenSection(null)}
                    />
                    <NavSection
                      title={t("menu.mgmtPlataforma")}
                      items={mgmtPlataforma}
                      active={active}
                      onNavigate={() => setOpenSection(null)}
                    />
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {/* HR */}
            {hrItems.length > 0 && (
              <DropdownMenu
                open={openSection === "hr"}
                onOpenChange={(o) => setOpenSection(o ? "hr" : null)}
              >
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className={cn(
                          "nav-ghost-hover h-9 gap-1.5 text-sm font-medium px-2.5",
                          isHrActive && "text-primary",
                        )}
                      >
                        <UserCog className="h-3.5 w-3.5 shrink-0" />
                        <span className="hidden xl:inline">{t("menu.hr")}</span>
                        <ChevronDown className="h-3 w-3 text-muted-foreground" />
                      </Button>
                    </DropdownMenuTrigger>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">{t("menu.hr")}</TooltipContent>
                </Tooltip>
                <DropdownMenuContent align="start" className="p-0 w-auto">
                  <div className="grid grid-cols-2 gap-x-2 p-3 w-[440px]">
                    <NavSection
                      title={t("menu.hrPeople")}
                      items={hrPeople}
                      active={active}
                      onNavigate={() => setOpenSection(null)}
                    />
                    <NavSection
                      title={t("menu.hrPayroll")}
                      items={hrPayroll}
                      active={active}
                      onNavigate={() => setOpenSection(null)}
                    />
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </nav>
        </TooltipProvider>

        {/* ── Spacer ── */}
        <div className="flex-1" />

        {/* ── Global Search ── */}
        <div className="hidden md:block">
          <GlobalSearch />
        </div>

        {/* ── Right controls ── */}
        <div className="flex items-center gap-1">
          {/* Language */}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLanguageToggle}
            className="hidden md:inline-flex gap-1.5 h-9 px-2.5 text-muted-foreground hover:text-foreground"
            aria-label={`Language: ${language.toUpperCase()}`}
          >
            <Globe className="h-4 w-4" />
            <span className="text-xs font-medium">
              {language.toUpperCase()}
            </span>
          </Button>

          {/* User profile */}
          {user && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="hidden md:inline-flex gap-2 h-9 px-2 rounded-full hover:bg-accent"
                  aria-label="User menu"
                >
                  <Avatar className="h-7 w-7">
                    <AvatarFallback className="bg-primary text-primary-foreground text-xs font-semibold">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden lg:block text-sm font-medium max-w-[120px] truncate">
                    {user.fullName.split(" ")[0]}
                  </span>
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel className="pb-2">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-9 w-9">
                      <AvatarFallback className="bg-primary text-primary-foreground font-semibold text-sm">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm font-semibold truncate">
                        {user.fullName}
                      </span>
                      <span className="text-xs text-muted-foreground truncate">
                        {user.email}
                      </span>
                      <span className="text-[10px] font-medium mt-0.5 text-primary/80">
                        {user.role}
                      </span>
                    </div>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link
                    to="/settings"
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <Settings className="h-4 w-4 text-muted-foreground" />
                    {t("menu.settings")}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleLogout}
                  className="text-destructive focus:text-destructive focus:bg-destructive/10 gap-2"
                >
                  <LogOut className="h-4 w-4" />
                  {t("common.logout") || "Cerrar sesión"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* ── Mobile hamburger ── */}
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden h-9 w-9"
                aria-label="Open mobile menu"
              >
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-80 p-0 flex flex-col">
              <SheetHeader className="border-b p-4 shrink-0">
                <SheetTitle>
                  <Logo showText size="sm" />
                </SheetTitle>
              </SheetHeader>

              <div className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
                {/* Mobile search */}
                <div className="px-1">
                  <GlobalSearch />
                </div>

                {/* Nova — top-level */}
                {novaItem && (
                  <Link
                    to="/nova"
                    onClick={() => setMobileOpen(false)}
                    aria-current={isActive("/nova") ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                      isActive("/nova")
                        ? "bg-primary/10 text-primary"
                        : "text-foreground hover:bg-accent hover:text-accent-foreground",
                    )}
                  >
                    <img
                      src="/logo.svg"
                      alt=""
                      aria-hidden="true"
                      className="h-5 w-5 object-contain shrink-0"
                    />
                    Nova
                  </Link>
                )}

                {/* Operations group */}
                {allOps.length > 0 && (
                  <MobileNavGroup
                    title={t("menu.operations")}
                    icon={<Package className="h-4 w-4" />}
                  >
                    {opMain.length > 0 && (
                      <>
                        {opMain.map((item) => (
                          <MobileNavItem
                            key={item.href}
                            item={item}
                            active={isActive(item.href)}
                            onClick={() => setMobileOpen(false)}
                          />
                        ))}
                      </>
                    )}
                    {opDatos.length > 0 && (
                      <>
                        <MobileSubLabel>{t("menu.datos")}</MobileSubLabel>
                        {opDatos.map((item) => (
                          <MobileNavItem
                            key={item.href}
                            item={item}
                            active={isActive(item.href)}
                            onClick={() => setMobileOpen(false)}
                          />
                        ))}
                      </>
                    )}
                    {opProceso.length > 0 && (
                      <>
                        <MobileSubLabel>{t("menu.proceso")}</MobileSubLabel>
                        {opProceso.map((item) => (
                          <MobileNavItem
                            key={item.href}
                            item={item}
                            active={isActive(item.href)}
                            onClick={() => setMobileOpen(false)}
                          />
                        ))}
                      </>
                    )}
                    {opLogis.length > 0 && (
                      <>
                        <MobileSubLabel>{t("menu.logistica")}</MobileSubLabel>
                        {opLogis.map((item) => (
                          <MobileNavItem
                            key={item.href}
                            item={item}
                            active={isActive(item.href)}
                            onClick={() => setMobileOpen(false)}
                          />
                        ))}
                      </>
                    )}
                  </MobileNavGroup>
                )}

                {toolItems.length > 0 && (
                  <MobileNavGroup
                    title={t("menu.tools")}
                    icon={<Settings className="h-4 w-4" />}
                  >
                    {toolItems.map((item) => (
                      <MobileNavItem
                        key={item.href}
                        item={item}
                        active={isActive(item.href)}
                        onClick={() => setMobileOpen(false)}
                      />
                    ))}
                  </MobileNavGroup>
                )}

                {mgmtItems.length > 0 && (
                  <MobileNavGroup
                    title={t("menu.management")}
                    icon={<Users className="h-4 w-4" />}
                  >
                    {mgmtItems.map((item) => (
                      <MobileNavItem
                        key={item.href}
                        item={item}
                        active={isActive(item.href)}
                        onClick={() => setMobileOpen(false)}
                      />
                    ))}
                  </MobileNavGroup>
                )}

                {hrItems.length > 0 && (
                  <MobileNavGroup
                    title={t("menu.hr")}
                    icon={<UserCog className="h-4 w-4" />}
                  >
                    {hrItems.map((item) => (
                      <MobileNavItem
                        key={item.href}
                        item={item}
                        active={isActive(item.href)}
                        onClick={() => setMobileOpen(false)}
                      />
                    ))}
                  </MobileNavGroup>
                )}

                {sysItems.length > 0 && (
                  <MobileNavGroup
                    title={t("menu.system")}
                    icon={<Sliders className="h-4 w-4" />}
                  >
                    {sysItems.map((item) => (
                      <MobileNavItem
                        key={item.href}
                        item={item}
                        active={isActive(item.href)}
                        onClick={() => setMobileOpen(false)}
                      />
                    ))}
                  </MobileNavGroup>
                )}
              </div>

              {/* Mobile footer */}
              {user && (
                <div className="border-t p-3 space-y-1 shrink-0">
                  <div className="flex items-center gap-3 px-3 py-2">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="bg-primary text-primary-foreground text-xs font-semibold">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm font-medium truncate">
                        {user.fullName}
                      </span>
                      <span className="text-xs text-muted-foreground truncate">
                        {user.role}
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="ml-auto h-8 w-8"
                      onClick={handleLanguageToggle}
                      aria-label="Toggle language"
                    >
                      <Globe className="h-4 w-4" />
                    </Button>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleLogout}
                    className="w-full justify-start gap-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                  >
                    <LogOut className="h-4 w-4" />
                    {t("common.logout") || "Cerrar sesión"}
                  </Button>
                </div>
              )}
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}

export const AppNavbar = memo(AppNavbarInner);

// ── Mobile helper sub-components ─────────────────────────────────────────────

function MobileNavGroup({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">
        {icon}
        {title}
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function MobileSubLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-3 pt-2 pb-0.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">
      {children}
    </p>
  );
}
