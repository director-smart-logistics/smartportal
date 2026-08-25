import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/lib/hooks/usePermissions";
import { PageLoader } from "@/components/PageLoader";
import type { UserRole } from "@/types";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRoles?: UserRole[]; // Deprecated: use resource instead
  resource?: string; // RBAC resource name (e.g., 'tracking', 'users')
  action?: string; // RBAC action (e.g., 'view', 'create', 'update', 'delete', 'manage'). Defaults to 'view'.
}

export function ProtectedRoute({
  children,
  requiredRoles,
  resource,
  action = "view",
}: ProtectedRouteProps) {
  const { isAuthenticated, user, isLoading: authLoading } = useAuth();
  const { hasPermission, isLoading: permissionsLoading } = usePermissions();
  const location = useLocation();

  // Show animated Hot Air Balloon logo loader while auth or permissions are loading
  if (authLoading || permissionsLoading) {
    return <PageLoader />;
  }

  // Redirect to login if not authenticated — preserve current URL so Login can redirect back
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // RBAC permission check (preferred method)
  if (resource && user) {
    if (!hasPermission(resource, action)) {
      console.warn(
        `[ProtectedRoute] Access denied: user ${user.role} cannot ${action} '${resource}'`,
      );
      return <Navigate to="/403" replace />;
    }
  }
  // Legacy role-based check (fallback)
  else if (requiredRoles && user && !requiredRoles.includes(user.role as any)) {
    console.warn(
      `[ProtectedRoute] Access denied: user role '${user.role}' not in required roles`,
    );
    return <Navigate to="/403" replace />;
  }

  return <>{children}</>;
}
