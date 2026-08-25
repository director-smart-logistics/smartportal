import "./global.css";
import "@/i18n/config";
import "@/lib/debug-i18n"; // Debug i18n loading

import { lazy, Suspense } from "react";
import { I18nProvider } from "@/components/I18nProvider"; // Wrapper to ensure i18n is ready
import { Toaster } from "@/components/ui/toaster";
import { createRoot } from "react-dom/client";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { FirebaseAuthProvider } from "@/lib/context/FirebaseAuthContext";
import { FeatureFlagsProvider, useFeatureFlag } from "@/lib/context/FeatureFlagsContext";
import { ThemeProvider } from "@/lib/context/ThemeContext";
import { SettingsProvider } from "@/lib/context/SettingsContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { ErrorBoundaryWithRetry } from "@/components/ErrorBoundaryWithRetry";
import { PageLoader } from "@/components/PageLoader";
import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/lib/hooks/usePermissions";
import { useSessionMonitor } from "@/lib/hooks/useSessionMonitor";
import { PermissionsProvider } from "@/lib/context/PermissionsContext";
import { useLocale } from "./hooks/useLocale";
import { logAction } from "@/lib/services/audit-service";
import type { AuthUser } from "@/lib/firebase/auth";

// Lazy-loaded pages - each becomes a separate chunk
// Auth
const Login = lazy(() => import("./pages/auth/Login"));
const Register = lazy(() => import("./pages/auth/Register"));
const ForgotPassword = lazy(() => import("./pages/auth/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/auth/ResetPassword"));

// Core
const Dashboard = lazy(() => import("./pages/dashboard/Dashboard"));
const Packages = lazy(() => import("./pages/packages/Packages"));
const Profile = lazy(() => import("./pages/profile/Profile"));
const Tracking = lazy(() => import("./pages/tracking/Tracking"));

// Users
const Users = lazy(() => import("./pages/users/Users"));
const UserCreate = lazy(() => import("./pages/users/UserCreate"));
const UserEdit = lazy(() => import("./pages/users/UserEdit"));

// Customers
const Customers = lazy(() => import("./pages/customers/Customers"));
const CustomerDetail = lazy(() => import("./pages/customers/CustomerDetail"));
const TempCustomers = lazy(() => import('./pages/temp-customers/TempCustomers'));
const NovaLearning = lazy(() => import('./pages/nova-learning/NovaLearning'));

// Analytics
const Analytics = lazy(() => import("./pages/analytics/Analytics"));

// Distribution & Routes
const Entregas      = lazy(() => import("./pages/distribution/Distribution"));
const EntregasAdmin = lazy(() => import("./pages/distribution/EntregasAdmin"));
const RoutesManagement = lazy(() => import("./pages/routes/RoutesManagement"));
const RouteSessions    = lazy(() => import("./pages/routes/RouteSessions"));

// Invoices
const InvoiceGeneration = lazy(() => import("./pages/invoices/Invoices"));
const CreateInvoice = lazy(() => import("./pages/invoices/CreateInvoice"));

// Quotes
const Quotes = lazy(() => import("./pages/quotes/Quotes"));
const CreateQuote = lazy(() => import("./pages/quotes/CreateQuote"));

// Manifests
const Manifests = lazy(() => import("./pages/manifests/Manifests"));
const ManifestsAdmin = lazy(() => import("./pages/manifests/admin"));

// Settings & Tools
const SettingsPage = lazy(() => import("./pages/settings/Settings"));
const Scanner = lazy(() => import("./pages/scanner/Scanner"));
const ScannerBodega = lazy(() => import("./pages/scanner/ScannerBodega"));
const ScannerAdmin = lazy(() => import("./pages/scanner/ScannerAdmin"));
const ShippingLabels = lazy(() => import("./pages/shipping/ShippingLabels"));
const NovaProcessor = lazy(() => import("./pages/nova/Nova"));

// Payroll
const PayrollEmployees = lazy(() => import("./pages/payroll/PayrollEmployees"));
const PayrollDepartments = lazy(() => import("./pages/payroll/PayrollDepartments"));
const PayrollBenefits = lazy(() => import("./pages/payroll/PayrollBenefits"));
const PayrollRunWizard = lazy(() => import("./pages/payroll/PayrollRunWizard"));

// Release Notes
const ReleaseNotes = lazy(() => import("./pages/release-notes/ReleaseNotes"));

// Pre-Alerts
const PreAlerts = lazy(() => import("./pages/pre-alerts/PreAlerts"));

// Client Ledger
const ClientLedger = lazy(() => import("./pages/client-ledger/ClientLedger"));

// Invoice Recovery (trash)
const InvoiceRecovery = lazy(() => import("./pages/invoices/InvoiceRecovery"));

// Encomiendas
const EncomiendaManagement = lazy(() => import("./pages/encomiendas/EncomiendaManagement"));
const EncomiendaManifests = lazy(() => import("./pages/encomiendas/EncomiendaManifests"));
const EncomiendaDispatch = lazy(() => import("./pages/encomiendas/EncomiendaDispatch"));

// Consolidation
const ConsolidationManifests = lazy(() => import("./pages/consolidation/ConsolidationManifests"));
const ReturnedPackages = lazy(() => import("./pages/consolidation/ReturnedPackages"));

// GTI
const GTIManifests = lazy(() => import("./pages/gti/GTIManifests"));

// Errors
const NotFound = lazy(() => import("./pages/errors/NotFound"));
const Forbidden = lazy(() => import("./pages/errors/Forbidden"));
const ServerError = lazy(() => import("./pages/errors/ServerError"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15 * 1000, // Cache query results for 15 seconds to prevent redundant Firestore reads on fast tab switching
      gcTime: 5 * 60 * 1000, // Keep queries in memory for 5 minutes
      refetchOnMount: true, // Refetch on mount if stale
      refetchOnWindowFocus: false, // Don't refetch on window focus to avoid unnecessary requests
      retry: 1, // Only retry once on failure
    },
  },
});

// ── Audit page-view tracker (mounted once inside BrowserRouter) ──────────────
function AuditRouteTracker() {
  const location = useLocation();
  const { user, isAuthenticated } = useAuth();

  useEffect(() => {
    if (!isAuthenticated || !user) return;
    const u = user as AuthUser;
    logAction({
      userId: u.id ?? u.email ?? 'anonymous',
      userName: u.fullName ?? u.email ?? '',
      userEmail: u.email ?? '',
      userRole: u.role ?? '',
      action: 'page_view',
      category: 'navigation',
      resource: location.pathname,
      result: 'success',
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, isAuthenticated]);

  return null;
}

// Route returns feature flag guard
function RouteReturnsGuard({ children }: { children: React.ReactNode }) {
  const isEnabled = useFeatureFlag("routeReturnsModule");
  if (!isEnabled) {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
}

// Role-aware root redirect
function RootRedirect() {
  const { user, isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (user?.role === 'DELIVERY') return <Navigate to="/routes/sessions" replace />;
  return <Navigate to="/dashboard" replace />;
}

// Layout wrapper component
function AppRoutes() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const authRedirect = user?.role === 'DELIVERY' ? '/routes/sessions' : '/dashboard';
  const { t } = useLocale('common');
  
  // Monitor session for automatic logout on token expiration
  useSessionMonitor();

  if (isLoading) {
    return <PageLoader />;
  }

  return (
    <Suspense fallback={<PageLoader />}>
      <AuditRouteTracker />
      <Routes>
        {/* Public Routes */}
        <Route
          path="/login"
          element={
            isAuthenticated ? <Navigate to={authRedirect} replace /> : <Login />
          }
        />
        <Route
          path="/register"
          element={
            isAuthenticated ? <Navigate to={authRedirect} replace /> : <Register />
          }
        />
        <Route
          path="/forgot-password"
          element={
            isAuthenticated ? (
              <Navigate to="/dashboard" replace />
            ) : (
              <ForgotPassword />
            )
          }
        />
        <Route
          path="/reset-password"
          element={
            isAuthenticated ? (
              <Navigate to="/dashboard" replace />
            ) : (
              <ResetPassword />
            )
          }
        />

      {/* Protected Routes */}
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute resource="dashboard">
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/packages"
        element={
          <ProtectedRoute resource="packages">
            <Packages />
          </ProtectedRoute>
        }
      />
      <Route
        path="/manifests"
        element={
          <ProtectedRoute resource="manifests">
            <Manifests />
          </ProtectedRoute>
        }
      />
      <Route
        path="/manifests/admin"
        element={
          <ProtectedRoute resource="manifests">
            <ManifestsAdmin />
          </ProtectedRoute>
        }
      />
      <Route
        path="/temp-customers"
        element={
          <ProtectedRoute resource="customers">
            <TempCustomers />
          </ProtectedRoute>
        }
      />
      <Route
        path="/nova-learning"
        element={
          <ProtectedRoute resource="manifests">
            <NovaLearning />
          </ProtectedRoute>
        }
      />
      <Route
        path="/tracking"
        element={
          <ProtectedRoute resource="tracking">
            <Tracking />
          </ProtectedRoute>
        }
      />
      <Route
        path="/pre-alerts"
        element={
          <ProtectedRoute resource="tracking">
            <PreAlerts />
          </ProtectedRoute>
        }
      />
      <Route
        path="/users"
        element={
          <ProtectedRoute resource="users">
            <Users />
          </ProtectedRoute>
        }
      />
      <Route
        path="/users/create"
        element={
          <ProtectedRoute resource="users" action="create">
            <UserCreate />
          </ProtectedRoute>
        }
      />
      <Route
        path="/users/:id/edit"
        element={
          <ProtectedRoute resource="users" action="update">
            <UserEdit />
          </ProtectedRoute>
        }
      />
      <Route
        path="/customers"
        element={
          <ProtectedRoute resource="customers">
            <Customers />
          </ProtectedRoute>
        }
      />
      <Route
        path="/customers/:id"
        element={
          <ProtectedRoute resource="customers">
            <CustomerDetail />
          </ProtectedRoute>
        }
      />
      <Route
        path="/analytics"
        element={
          <ProtectedRoute resource="analytics">
            <Analytics />
          </ProtectedRoute>
        }
      />
      <Route
        path="/profile"
        element={
          <ProtectedRoute>
            <Profile />
          </ProtectedRoute>
        }
      />
      <Route
        path="/deliveries"
        element={
          <ProtectedRoute resource="deliveries">
            <EntregasAdmin />
          </ProtectedRoute>
        }
      />
      <Route
        path="/deliveries/legacy"
        element={
          <ProtectedRoute resource="deliveries">
            <Entregas />
          </ProtectedRoute>
        }
      />
      <Route
        path="/entregas"
        element={
          <ProtectedRoute resource="routes">
            <EntregasAdmin />
          </ProtectedRoute>
        }
      />
      <Route
        path="/routes"
        element={
          <ProtectedRoute resource="routes">
            <RoutesManagement />
          </ProtectedRoute>
        }
      />
      <Route
        path="/routes/sessions"
        element={
          <ProtectedRoute resource="routes">
            <RouteSessions />
          </ProtectedRoute>
        }
      />
      <Route
        path="/invoices"
        element={
          <ProtectedRoute resource="invoices">
            <InvoiceGeneration />
          </ProtectedRoute>
        }
      />
      <Route
        path="/invoices/create"
        element={
          <ProtectedRoute resource="invoices">
            <CreateInvoice />
          </ProtectedRoute>
        }
      />
      <Route
        path="/quotes"
        element={
          <ProtectedRoute resource="quotes">
            <Quotes />
          </ProtectedRoute>
        }
      />
      <Route
        path="/quotes/create"
        element={
          <ProtectedRoute resource="quotes">
            <CreateQuote />
          </ProtectedRoute>
        }
      />
      <Route
        path="/quotes/:id"
        element={
          <ProtectedRoute resource="quotes">
            <CreateQuote />
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute resource="settings">
            <SettingsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/scanner"
        element={
          <ProtectedRoute resource="scanner">
            <Scanner />
          </ProtectedRoute>
        }
      />
      <Route
        path="/scanner/bodega"
        element={
          <ScannerBodega />
        }
      />
      <Route
        path="/scanner/admin"
        element={
          <ProtectedRoute resource="scanner">
            <ScannerAdmin />
          </ProtectedRoute>
        }
      />      <Route
        path="/labels"
        element={
          <ProtectedRoute resource="shipping-labels">
            <ShippingLabels />
          </ProtectedRoute>
        }
      />
      <Route
        path="/nova"
        element={
          <ProtectedRoute resource="manifests">
            <NovaProcessor />
          </ProtectedRoute>
        }
      />

      {/* Payroll Routes */}
      <Route
        path="/payroll/departments"
        element={
          <ProtectedRoute resource="payroll">
            <PayrollDepartments />
          </ProtectedRoute>
        }
      />
      <Route
        path="/payroll/employees"
        element={
          <ProtectedRoute resource="payroll">
            <PayrollEmployees />
          </ProtectedRoute>
        }
      />
      {/* Legacy redirects — removed from nav */}
      <Route path="/payroll/attendance" element={<Navigate to="/payroll/employees" replace />} />
      <Route path="/payroll/reports" element={<Navigate to="/payroll/run" replace />} />
      <Route path="/payroll/weekly-report" element={<Navigate to="/payroll/run" replace />} />
      <Route path="/payroll/consolidated" element={<Navigate to="/payroll/run" replace />} />
      <Route path="/payroll/breaks" element={<Navigate to="/payroll/employees" replace />} />
      <Route path="/payroll/settings" element={<Navigate to="/settings" replace />} />
      {/* Unified Planilla page */}
      <Route
        path="/payroll/planilla"
        element={
          <ProtectedRoute resource="payroll">
            <PayrollBenefits />
          </ProtectedRoute>
        }
      />
      {/* Legacy benefit routes → unified page */}
      <Route path="/payroll/vacations" element={<Navigate to="/payroll/planilla" replace />} />
      <Route path="/payroll/christmas-bonus" element={<Navigate to="/payroll/planilla" replace />} />
      <Route path="/payroll/severance" element={<Navigate to="/payroll/planilla" replace />} />
      {/* Removed pages — stub redirects so deep-linked bookmarks don’t 404 */}
      {/* Payroll run wizard */}
      <Route
        path="/payroll/run"
        element={
          <ProtectedRoute resource="payroll">
            <PayrollRunWizard />
          </ProtectedRoute>
        }
      />

        {/* GTI Manifests */}
        <Route
          path="/gti/manifests"
          element={
            <ProtectedRoute resource="invoices">
              <GTIManifests />
            </ProtectedRoute>
          }
        />

        {/* Consolidation Manifests */}
        <Route
          path="/consolidation/manifests"
          element={
            <ProtectedRoute resource="invoices">
              <ConsolidationManifests />
            </ProtectedRoute>
          }
        />

        {/* Returned Packages */}
        <Route
          path="/consolidation/returned"
          element={
            <ProtectedRoute resource="invoices">
              <RouteReturnsGuard>
                <ReturnedPackages />
              </RouteReturnsGuard>
            </ProtectedRoute>
          }
        />

        {/* Encomiendas */}
        <Route
          path="/encomiendas/manifests"
          element={
            <ProtectedRoute resource="encomiendas">
              <EncomiendaManifests />
            </ProtectedRoute>
          }
        />
        <Route
          path="/encomiendas/salida"
          element={
            <ProtectedRoute resource="encomiendas">
              <EncomiendaDispatch />
            </ProtectedRoute>
          }
        />
        <Route
          path="/encomiendas"
          element={
            <ProtectedRoute resource="settings">
              <EncomiendaManagement />
            </ProtectedRoute>
          }
        />

        {/* Release Notes */}
        <Route
          path="/release"
          element={
            <ProtectedRoute resource="settings">
              <ReleaseNotes />
            </ProtectedRoute>
          }
        />

        {/* Client Ledger */}
        <Route
          path="/client-ledger"
          element={
            <ProtectedRoute resource="invoices">
              <ClientLedger />
            </ProtectedRoute>
          }
        />

        {/* Invoice Recovery — Papelera */}
        <Route
          path="/invoices/recovery"
          element={
            <ProtectedRoute resource="invoices">
              <InvoiceRecovery />
            </ProtectedRoute>
          }
        />

        {/* Error Routes */}
        <Route path="/403" element={<Forbidden />} />
        <Route path="/500" element={<ServerError />} />
        <Route path="/" element={<RootRedirect />} />

        {/* Catch-all */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}

const App = () => (
<BrowserRouter
future={{
v7_startTransition: false,
v7_relativeSplatPath: true,
}}
>
{/* Skip Navigation Link for Accessibility */}
<a 
  href="#main-content" 
  className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md focus:ring-2 focus:ring-ring focus:ring-offset-2"
>
  Skip to main content
</a>

<I18nProvider>
<ErrorBoundaryWithRetry onReset={() => queryClient.clear()}>
<QueryClientProvider client={queryClient}>
<TooltipProvider>
<ThemeProvider>
<FirebaseAuthProvider>
<SettingsProvider>
<PermissionsProvider>
<FeatureFlagsProvider>
<Toaster />
<Sonner />
<AppRoutes />
</FeatureFlagsProvider>
</PermissionsProvider>
</SettingsProvider>
</FirebaseAuthProvider>
</ThemeProvider>
</TooltipProvider>
</QueryClientProvider>
</ErrorBoundaryWithRetry>
</I18nProvider>
</BrowserRouter>
);

declare global {
var __APP_ROOT__: ReturnType<typeof createRoot> | undefined;
}

const rootElement = document.getElementById("root");
if (rootElement) {
  // Reuse existing root for HMR updates, create new one on first load
  if (!globalThis.__APP_ROOT__) {
    globalThis.__APP_ROOT__ = createRoot(rootElement);
  }
  globalThis.__APP_ROOT__.render(<App />);
}
