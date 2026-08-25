import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useLocale } from "@/hooks/useLocale";
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
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  FileText,
  ClipboardList,
  Menu,
  X,
  ScanLine,
  Calculator,
  Bot,
  Building2,
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
  Printer,
  Gauge,
} from "lucide-react";
import { UserProfileDropdown } from "@/components/layouts/UserProfileDropdown";
import { Logo } from "@/components/ui/logo";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  roles: string[]; // Deprecated: kept for backward compatibility
  resource: string; // RBAC resource name
  section: string;
  subsection?: string; // New: for grouping within sections
  description?: string; // New: for descriptive text under menu items
  numberIndicator?: number; // New: for numbered circle indicators
}

interface NavSubSection {
  name: string;
  items: NavItem[];
  key: string;
}

interface NavSection {
  name: string;
  items: NavItem[];
  icon: React.ReactNode;
  key: string;
  subsections?: NavSubSection[]; // New: for hierarchical organization
}

export function Sidebar() {
  const { user } = useAuth();
  const { t } = useLocale(["menu", "payroll", "users", "dashboard"]);
  const location = useLocation();
  const {
    canView,
    permissions,
    getViewableResources,
    isLoading: permissionsLoading,
    error: permissionsError,
  } = usePermissions();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  // Check if we're on mobile
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener("resize", checkMobile);

    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Set initial section state based on screen size
  // Persist section states in sessionStorage to maintain user preferences
  const [expandedSections, setExpandedSections] = useState<
    Record<string, boolean>
  >(() => {
    // Try to load from sessionStorage first
    try {
      const saved = sessionStorage.getItem("sidebar-expanded-sections");
      if (saved) {
        const parsed = JSON.parse(saved);
        // Validate structure
        if (parsed && typeof parsed === "object") {
          return {
            operations: parsed.operations ?? true,
            tools: parsed.tools ?? true,
            management: parsed.management ?? true,
            hr: parsed.hr ?? true,
            system: parsed.system ?? true,
          };
        }
      }
    } catch (e) {
      // Fallback to default if parsing fails
    }

    // Default: expanded on desktop, collapsed on mobile
    const isInitialMobile = window.innerWidth < 768;
    return {
      operations: !isInitialMobile,
      tools: !isInitialMobile,
      management: !isInitialMobile,
      hr: !isInitialMobile,
      system: !isInitialMobile,
    };
  });

  // Persist section states to sessionStorage whenever they change
  useEffect(() => {
    try {
      sessionStorage.setItem(
        "sidebar-expanded-sections",
        JSON.stringify(expandedSections),
      );
    } catch (e) {
      // Ignore storage errors (e.g., private browsing)
    }
  }, [expandedSections]);

  // Collapse all sections when mobile sidebar opens (only on mobile, preserve desktop state)
  useEffect(() => {
    if (isMobileOpen && isMobile) {
      // Only collapse on mobile - desktop state should never be affected
      setExpandedSections((prev) => {
        // Check if we're actually on mobile before resetting
        if (window.innerWidth < 768) {
          return {
            operations: false,
            tools: false,
            management: false,
            hr: false,
            system: false,
          };
        }
        // If somehow this runs on desktop, preserve the state
        return prev;
      });
    }
  }, [isMobileOpen, isMobile]);

  const toggleSection = (sectionName: string) => {
    setExpandedSections((prev) => {
      const newState = {
        ...prev,
        [sectionName]: !prev[sectionName],
      };
      return newState;
    });
  };

  // Handle menu item click - minimal, friction-free behavior
  const handleMenuItemClick = (itemSection: string, isMobileNav: boolean) => {
    if (isMobileNav) {
      // Mobile: just close sidebar, don't touch section states
      setIsMobileOpen(false);
      return;
    }

    // Desktop behavior
    if (isCollapsed) {
      // Sidebar collapsed: expand sidebar and show the clicked section
      // This is necessary UX - user clicked an icon, they want to see the menu
      setIsCollapsed(false);
      setTimeout(() => {
        setExpandedSections((prev) => {
          // Only modify the clicked section, preserve all others
          if (prev[itemSection] === true) return prev; // Already expanded
          return { ...prev, [itemSection]: true };
        });
      }, 100);
    } else {
      // Sidebar expanded: ONLY expand the clicked section if it's collapsed
      // This allows users to see what they clicked without forcing other sections open
      setExpandedSections((prev) => {
        // If already expanded, no change needed
        if (prev[itemSection] === true) {
          return prev; // Return same reference to prevent re-render
        }
        // Expand only this section, preserve all others exactly as they are
        return { ...prev, [itemSection]: true };
      });
    }
  };

  const handleSectionIconClick = (sectionKey: string) => {
    // If collapsed, expand the sidebar and open this section
    if (isCollapsed) {
      // First, set the section to expanded
      setExpandedSections((prev) => ({
        ...prev,
        [sectionKey]: true,
      }));
      // Then expand the sidebar (small delay to ensure state is set)
      setTimeout(() => {
        setIsCollapsed(false);
      }, 10);
    } else {
      // If expanded, just toggle the section
      toggleSection(sectionKey);
    }
  };

  // Get role badge color
  const getRoleBgColor = () => {
    if (!user) return "bg-gray-100 text-gray-800";
    switch (user.role) {
      case "ADMIN":
        return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
      case "MANAGER":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
      case "STAFF":
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
      case "AGENT":
        return "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200";
      case "DELIVERY":
        return "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200";
    }
  };

  // Generate initials
  const initials =
    user?.fullName
      .split(" ")
      .map((part) => part[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) || "U";

  const navItems: NavItem[] = [
    // Operations - Inicio (formerly Panel de Control)
    {
      label: t("menu.inicio"),
      href: "/dashboard",
      icon: <LayoutDashboard className="h-4 w-4" />,
      roles: ["ADMIN", "MANAGER", "STAFF", "AGENT", "CUSTOMER"],
      resource: "dashboard",
      section: "operations",
    },
    // Operations - Nova con IA (ADMIN only)
    {
      label: t("menu.novaProcessor"),
      href: "/nova",
      icon: (
        <span className="relative">
          <FileSpreadsheet className="h-4 w-4" />
          <Sparkles className="h-2 w-2 absolute -top-0.5 -right-0.5 text-amber-500" />
        </span>
      ),
      roles: ["ADMIN"],
      resource: "manifests",
      section: "operations",
      description: t("menu.novaProcessorDesc"),
    },
    // Operations - Rastreo (moved to main level)
    {
      label: t("menu.tracking"),
      href: "/tracking",
      icon: <Map className="h-4 w-4" />,
      roles: ["ADMIN", "MANAGER", "STAFF", "AGENT", "CUSTOMER"],
      resource: "tracking",
      section: "operations",
      description: t("menu.consultas"),
    },
    // Operations - Datos subsection
    {
      label: t("menu.guias"),
      href: "/manifests",
      icon: <FileText className="h-4 w-4" />,
      roles: ["ADMIN", "MANAGER"],
      resource: "manifests",
      section: "operations",
      subsection: "datos",
      description: t("menu.cargaExcel"),
      numberIndicator: 1,
    },
    {
      label: t("menu.manifiestos"),
      href: "/packages",
      icon: <Package className="h-4 w-4" />,
      roles: ["ADMIN", "MANAGER", "STAFF", "AGENT", "CUSTOMER"],
      resource: "packages",
      section: "operations",
      subsection: "datos",
      description: t("menu.trackingsPaquetes"),
      numberIndicator: 2,
    },
    // Operations - Proceso subsection (Rastreo removed)
    {
      label: t("menu.invoices"),
      href: "/invoices",
      icon: <FileText className="h-4 w-4" />,
      roles: ["ADMIN", "MANAGER"],
      resource: "invoices",
      section: "operations",
      subsection: "proceso",
      description: t("menu.facturarPaquetes"),
    },
    {
      label: t("menu.quotes"),
      href: "/quotes",
      icon: <ClipboardList className="h-4 w-4" />,
      roles: ["ADMIN", "MANAGER", "AGENT"],
      resource: "quotes",
      section: "operations",
      subsection: "proceso",
      description: t("menu.cotizarServicios"),
    },
    // Operations - Logística subsection
    {
      label: t("menu.routes"),
      href: "/routes",
      icon: <Map className="h-4 w-4" />,
      roles: ["ADMIN", "MANAGER"],
      resource: "routes",
      section: "operations",
      subsection: "logistica",
      description: t("menu.administrarRutas"),
    },
    {
      label: t("menu.startRoute"),
      href: "/routes/sessions",
      icon: <Gauge className="h-4 w-4" />,
      roles: ["ADMIN", "MANAGER", "DELIVERY"],
      resource: "routes",
      section: "operations",
      subsection: "logistica",
      description: t("menu.startRouteDesc"),
    },
    {
      label: t("menu.deliveries"),
      href: "/deliveries",
      icon: <Truck className="h-4 w-4" />,
      roles: ["AGENT", "ADMIN", "MANAGER"],
      resource: "deliveries",
      section: "operations",
      subsection: "logistica",
      description: t("menu.entregasChoferes"),
    },
    {
      label: t("menu.encomiendaManifests"),
      href: "/encomiendas/manifests",
      icon: <Package className="h-4 w-4" />,
      roles: ["ADMIN", "MANAGER"],
      resource: "encomiendas",
      section: "operations",
      subsection: "logistica",
      description: t("menu.encomiendaManifestsDesc"),
    },
    // Tools
    {
      label: t("menu.shippingLabels"),
      href: "/labels",
      icon: <Printer className="h-4 w-4" />,
      roles: ["ADMIN", "MANAGER"],
      resource: "shipping-labels",
      section: "tools",
      description: t("menu.shippingLabelsDesc"),
    },
    {
      label: t("menu.scanner"),
      href: "/scanner",
      icon: <ScanLine className="h-4 w-4" />,
      roles: ["ADMIN", "MANAGER", "STAFF", "AGENT", "CUSTOMER"],
      resource: "scanner",
      section: "tools",
    },

    // Management
    {
      label: t("menu.customers"),
      href: "/customers",
      icon: <Users className="h-4 w-4" />,
      roles: ["ADMIN", "MANAGER"],
      resource: "customers",
      section: "management",
    },
    {
      label: t("users.manage"),
      href: "/users",
      icon: <Users className="h-4 w-4" />,
      roles: ["ADMIN", "MANAGER"],
      resource: "users",
      section: "management",
    },
    // HR/Payroll — 4 core routes
    {
      label: t("menu.departments"),
      href: "/payroll/departments",
      icon: <Building2 className="h-4 w-4" />,
      roles: ["ADMIN", "MANAGER"],
      resource: "payroll",
      section: "hr",
    },
    {
      label: t("menu.employees"),
      href: "/payroll/employees",
      icon: <Users className="h-4 w-4" />,
      roles: ["ADMIN", "MANAGER"],
      resource: "payroll",
      section: "hr",
    },
    {
      label: t("menu.benefits"),
      href: "/payroll/planilla",
      icon: <Palmtree className="h-4 w-4" />,
      roles: ["ADMIN", "MANAGER"],
      resource: "payroll",
      section: "hr",
    },
    {
      label: t("menu.runPayroll"),
      href: "/payroll/run",
      icon: <Sparkles className="h-4 w-4" />,
      roles: ["ADMIN", "MANAGER"],
      resource: "payroll",
      section: "hr",
    },
    {
      label: t("dashboard.statistics"),
      href: "/analytics",
      icon: <BarChart3 className="h-4 w-4" />,
      roles: ["ADMIN", "MANAGER"],
      resource: "analytics",
      section: "management",
    },
    {
      label: t("menu.settings"),
      href: "/settings",
      icon: <Settings className="h-4 w-4" />,
      roles: ["ADMIN", "CUSTOMER"],
      resource: "settings",
      section: "management",
    },
    {
      label: t("menu.encomiendas"),
      href: "/encomiendas",
      icon: <Truck className="h-4 w-4" />,
      roles: ["ADMIN", "MANAGER"],
      resource: "settings",
      section: "management",
      description: t("menu.encomiendasDesc"),
    },
  ];

  // Filter menu items based on database permissions (reactive)
  // Falls back to role-based filtering if permissions are loading, failed, or empty
  const filteredItems = navItems.filter((item) => {
    if (!user) return false;

    // Fallback to role-based filtering in these cases:
    // 1. Permissions are still loading
    // 2. Permissions failed to load (error exists)
    // 3. Permissions array is empty (might indicate no permissions or API issue)
    const hasPermissionsData =
      !permissionsLoading && !permissionsError && permissions.length > 0;

    if (!hasPermissionsData) {
      // Use legacy role-based filtering as fallback
      return item.roles.includes(user.role);
    }

    // Use database permissions (reactive to changes)
    return canView(item.resource) && item.roles.includes(user.role);
  });

  // Create sections with items and subsections
  const operationsItems = filteredItems.filter(
    (item) => item.section === "operations",
  );
  const mainItems = operationsItems.filter((item) => !item.subsection);
  const datosItems = operationsItems.filter(
    (item) => item.subsection === "datos",
  );
  const procesoItems = operationsItems.filter(
    (item) => item.subsection === "proceso",
  );
  const logisticaItems = operationsItems.filter(
    (item) => item.subsection === "logistica",
  );

  const sections: NavSection[] = [
    {
      name: t("menu.operations"),
      items: mainItems,
      icon: <Package className="h-5 w-5" />,
      key: "operations",
      subsections: [
        {
          name: t("menu.datos"),
          items: datosItems,
          key: "datos",
        },
        {
          name: t("menu.proceso"),
          items: procesoItems,
          key: "proceso",
        },
        {
          name: t("menu.logistica"),
          items: logisticaItems,
          key: "logistica",
        },
      ].filter((subsection) => subsection.items.length > 0),
    },
    {
      name: t("menu.tools"),
      items: filteredItems.filter((item) => item.section === "tools"),
      icon: <Settings className="h-5 w-5" />,
      key: "tools",
    },
    {
      name: t("menu.management"),
      items: filteredItems.filter((item) => item.section === "management"),
      icon: <Users className="h-5 w-5" />,
      key: "management",
    },
    {
      name: t("menu.hr"),
      items: filteredItems.filter((item) => item.section === "hr"),
      icon: <UserCog className="h-5 w-5" />,
      key: "hr",
    },
  ].filter(
    (section) =>
      section.items.length > 0 ||
      (section.subsections && section.subsections.length > 0),
  );

  // Render skeleton loader for menu items
  const renderMenuSkeleton = () => (
    <div className="space-y-4 px-2 py-4">
      {[...Array(4)].map((_, idx) => (
        <div key={idx} className="space-y-2 animate-pulse">
          <div className="h-6 bg-sidebar-accent/30 rounded-md w-24"></div>
          <div className="space-y-1 pl-2">
            {[...Array(3)].map((_, itemIdx) => (
              <div
                key={itemIdx}
                className="h-8 bg-sidebar-accent/20 rounded-lg"
              ></div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );

  // Render navigation content (shared between desktop and mobile)
  const renderNavContent = (isMobile = false) => (
    <>
      {/* Navigation */}
      <nav
        className="flex-1 overflow-y-auto overflow-x-hidden px-2 py-4 space-y-2"
        aria-label="Main application navigation"
        role="navigation"
      >
        {permissionsLoading
          ? renderMenuSkeleton()
          : sections.map((section, idx) => {
              // Use section.key instead of deriving from translated name
              const sectionKey = section.key;
              const isExpanded = expandedSections[sectionKey] === true;

              return (
                <div key={idx}>
                  {/* Collapsed state - show icon only (desktop/tablet only) */}
                  {isCollapsed && !isMobile ? (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() => handleSectionIconClick(section.key)}
                            className={cn(
                              "w-full flex items-center justify-center p-3 rounded-lg",
                              "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent",
                              "active:scale-[0.98]",
                              "transition-all duration-200",
                              "focus:outline-none focus:ring-2 focus:ring-ring",
                            )}
                            data-testid={`section-icon-${section.key}`}
                            aria-label={section.name}
                          >
                            {section.icon}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="ml-2">
                          <p className="font-medium">{section.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {t("menu.clickToExpand", { defaultValue: "Click to expand" })}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  ) : (
                    /* Expanded state OR Mobile - show icon + name + chevron */
                    <button
                      onClick={() => toggleSection(sectionKey)}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2.5 text-sm font-semibold text-sidebar-foreground/70",
                        "hover:text-sidebar-foreground hover:bg-sidebar-accent/50 rounded-md",
                        "active:scale-[0.98] active:bg-sidebar-accent",
                        "transition-all duration-200 ease-in-out",
                        "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1",
                        isExpanded && "text-sidebar-foreground",
                      )}
                      data-testid={`section-${section.name.toLowerCase()}`}
                      id={`nav-section-${idx}`}
                      aria-expanded={isExpanded}
                      aria-controls={`section-items-${idx}`}
                    >
                      {section.icon}
                      <span className="flex-1 text-left transition-all duration-200">
                        {section.name}
                      </span>
                      <ChevronDown
                        className={cn(
                          "h-4 w-4 transition-transform duration-300 ease-out",
                          isExpanded && "rotate-180",
                        )}
                        aria-hidden="true"
                      />
                    </button>
                  )}

                  <div
                    id={`section-items-${idx}`}
                    className={cn(
                      "space-y-1 overflow-hidden transition-all duration-300 ease-in-out",
                      isCollapsed && !isMobile && "space-y-2",
                      !isCollapsed &&
                        !isMobile &&
                        "ml-[22px] pl-3 border-l-2 border-sidebar-border/50",
                      isMobile &&
                        "ml-[22px] pl-3 border-l-2 border-sidebar-border/50",
                      isExpanded
                        ? "max-h-[1000px] opacity-100 mt-2 pt-1"
                        : "max-h-0 opacity-0 mt-0",
                    )}
                    role="group"
                    aria-labelledby={
                      !isCollapsed || isMobile
                        ? `nav-section-${idx}`
                        : undefined
                    }
                  >
                    {/* Render main section items */}
                    {section.items.map((item) =>
                      isCollapsed && !isMobile ? (
                        <TooltipProvider key={item.href}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Link
                                to={item.href}
                                onClick={() =>
                                  handleMenuItemClick(item.section, false)
                                }
                                className={cn(
                                  "flex items-center justify-center p-2 rounded-lg transition-colors",
                                  "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus:outline-none focus:ring-1 focus:ring-ring",
                                  location.pathname === item.href
                                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                                    : "text-sidebar-foreground",
                                )}
                                data-testid={`nav-${item.href.slice(1)}`}
                                aria-current={
                                  location.pathname === item.href
                                    ? "page"
                                    : undefined
                                }
                                aria-label={item.label}
                              >
                                {item.icon}
                              </Link>
                            </TooltipTrigger>
                            <TooltipContent side="right" className="ml-2">
                              {item.label}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ) : (
                        <Link
                          key={item.href}
                          to={item.href}
                          onClick={() =>
                            handleMenuItemClick(item.section, isMobile)
                          }
                          className={cn(
                            "group flex items-center gap-3 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                            "hover:bg-sidebar-accent focus:outline-none focus:ring-1 focus:ring-ring",
                            location.pathname === item.href
                              ? "bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                              : "text-sidebar-foreground hover:text-sidebar-accent-foreground",
                          )}
                          data-testid={`nav-${item.href.slice(1)}`}
                          aria-current={
                            location.pathname === item.href ? "page" : undefined
                          }
                        >
                          <span aria-hidden="true">{item.icon}</span>
                          <span>{item.label}</span>
                        </Link>
                      ),
                    )}

                    {/* Render subsections */}
                    {section.subsections &&
                      section.subsections.map((subsection) => (
                        <div key={subsection.key} className="mt-3">
                          {/* Subsection header */}
                          {!isCollapsed && (
                            <div className="px-4 py-1 text-xs font-semibold text-sidebar-foreground/60 uppercase tracking-wide">
                              {subsection.name}
                            </div>
                          )}

                          {/* Subsection items */}
                          {subsection.items.map((item) =>
                            isCollapsed && !isMobile ? (
                              <TooltipProvider key={item.href}>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Link
                                      to={item.href}
                                      onClick={() =>
                                        handleMenuItemClick(item.section, false)
                                      }
                                      className={cn(
                                        "flex items-center justify-center p-2 rounded-lg transition-colors",
                                        "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus:outline-none focus:ring-1 focus:ring-ring",
                                        location.pathname === item.href
                                          ? "bg-sidebar-primary text-sidebar-primary-foreground"
                                          : "text-sidebar-foreground",
                                      )}
                                      data-testid={`nav-${item.href.slice(1)}`}
                                      aria-current={
                                        location.pathname === item.href
                                          ? "page"
                                          : undefined
                                      }
                                      aria-label={item.label}
                                    >
                                      {item.icon}
                                    </Link>
                                  </TooltipTrigger>
                                  <TooltipContent side="right" className="ml-2">
                                    <div className="flex flex-col gap-1">
                                      <div className="flex items-center gap-2">
                                        {item.numberIndicator && (
                                          <span className="flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-primary rounded-full">
                                            {item.numberIndicator}
                                          </span>
                                        )}
                                        <span>{item.label}</span>
                                      </div>
                                      {item.description && (
                                        <p className="text-xs text-muted-foreground">
                                          {item.description}
                                        </p>
                                      )}
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            ) : (
                              <div key={item.href} className="px-2">
                                <Link
                                  to={item.href}
                                  onClick={() =>
                                    handleMenuItemClick(item.section, isMobile)
                                  }
                                  className={cn(
                                    "group flex items-center gap-3 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                                    "hover:bg-sidebar-accent focus:outline-none focus:ring-1 focus:ring-ring",
                                    location.pathname === item.href
                                      ? "bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                                      : "text-sidebar-foreground hover:text-sidebar-accent-foreground",
                                  )}
                                  data-testid={`nav-${item.href.slice(1)}`}
                                  aria-current={
                                    location.pathname === item.href
                                      ? "page"
                                      : undefined
                                  }
                                >
                                  <div className="flex items-center gap-2 flex-1">
                                    {item.numberIndicator && (
                                      <span className="flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-primary rounded-full flex-shrink-0">
                                        {item.numberIndicator}
                                      </span>
                                    )}
                                    <span aria-hidden="true">{item.icon}</span>
                                    <div className="flex flex-col">
                                      <span>{item.label}</span>
                                      {item.description && (
                                        <span
                                          className={cn(
                                            "text-xs transition-colors",
                                            location.pathname === item.href
                                              ? "text-sidebar-primary-foreground group-hover:text-sidebar-accent-foreground"
                                              : "text-sidebar-foreground/60 group-hover:text-sidebar-accent-foreground",
                                          )}
                                        >
                                          {item.description}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </Link>
                              </div>
                            ),
                          )}
                        </div>
                      ))}
                  </div>
                </div>
              );
            })}
      </nav>
    </>
  );

  return (
    <>
      {/* Mobile Navigation */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 bg-sidebar border-b border-sidebar-border">
        <div className="flex items-center justify-between p-4">
          <Link to="/" className="flex items-center">
            <Logo showText={true} size="sm" />
          </Link>
          <Sheet open={isMobileOpen} onOpenChange={setIsMobileOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="text-sidebar-foreground"
                aria-label={t("menu.openMenu", { defaultValue: "Open menu" })}
              >
                <Menu className="h-6 w-6" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-80 p-0 flex flex-col h-full bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
              <SheetHeader className="border-b border-sidebar-border p-4 flex-shrink-0">
                <SheetTitle className="flex items-center justify-between">
                  <Logo showText={true} size="sm" />
                </SheetTitle>
              </SheetHeader>
              <div className="flex-1 overflow-y-auto overflow-x-hidden">
                {renderNavContent(true)}
              </div>
              <div className="border-t border-sidebar-border p-2 flex-shrink-0">
                <UserProfileDropdown />
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {/* Desktop Sidebar */}
      <aside
        className={cn(
          "bg-sidebar text-sidebar-foreground border-r h-screen sticky top-0 overflow-hidden hidden md:flex flex-col transition-all duration-300 ease-in-out",
          isCollapsed ? "w-20" : "w-64",
        )}
        data-testid="sidebar"
        role="navigation"
        aria-label="Main navigation"
      >
        {/* Header */}
        <div
          className={cn(
            "border-b border-sidebar-border transition-all duration-300 ease-in-out",
            isCollapsed ? "p-3" : "p-4",
          )}
        >
          <Link
            to="/"
            className={cn(
              "flex items-center transition-all duration-300",
              isCollapsed && "justify-center",
            )}
          >
            <Logo showText={!isCollapsed} size="md" />
          </Link>
        </div>

        {renderNavContent()}

        {/* Footer with User Profile and Collapse Button */}
        <div className="border-t border-sidebar-border space-y-2 p-2">
          {/* User Profile - Expanded */}
          {!isCollapsed && <UserProfileDropdown />}

          {/* User Profile - Collapsed */}
          {isCollapsed && user && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    className="w-full flex items-center justify-center p-2 rounded-lg hover:bg-sidebar-accent transition-all duration-300"
                    aria-label={`${user.fullName} - ${user.role}`}
                  >
                    <Avatar className="h-10 w-10 transition-all duration-300">
                      <AvatarFallback className="bg-primary text-primary-foreground font-semibold text-sm">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="ml-2">
                  <div className="flex flex-col gap-1">
                    <p className="font-medium text-sm">{user.fullName}</p>
                    <p className="text-xs text-muted-foreground">
                      {user.email}
                    </p>
                    <p
                      className={cn(
                        "text-xs px-2 py-0.5 rounded w-fit font-medium mt-1",
                        getRoleBgColor(),
                      )}
                    >
                      {user.role}
                    </p>
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          {/* Collapse/Expand Button */}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className={cn(
              "flex items-center w-full px-2 py-2 rounded-lg transition-all duration-300",
              "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent focus:outline-none focus:ring-1 focus:ring-ring",
              isCollapsed ? "justify-center" : "justify-start",
            )}
            data-testid="sidebar-toggle"
            aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-pressed={isCollapsed}
          >
            {isCollapsed ? (
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            ) : (
              <>
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                <span className="ml-2 text-xs font-medium transition-opacity duration-300">
                  Collapse
                </span>
              </>
            )}
          </button>
        </div>
      </aside>
    </>
  );
}
