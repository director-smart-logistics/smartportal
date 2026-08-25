import { useAuth } from '@/hooks/useAuth';
import { usePermissionsContext } from '@/lib/context/PermissionsContext';

/**
 * Hook to manage user permissions based on role (real-time via context)
 */
export function usePermissions() {
  const { user } = useAuth();
  const { permissions, isLoading } = usePermissionsContext();

  /**
   * Check if user has permission for a specific resource and action
   * ADMIN role always returns true
   */
  const hasPermission = (resource: string, action: string = 'view'): boolean => {
    // ADMIN always has full access
    if (user?.role === 'ADMIN') return true;

    // Check if permission exists and is allowed
    return permissions.some(
      (p) => (p.resource === resource || p.resource === '*') && 
             (p.action === action || p.action === '*') && 
             p.allowed
    );
  };

  /**
   * Check if user can view a resource (shorthand)
   */
  const canView = (resource: string): boolean => {
    return hasPermission(resource, 'view');
  };

  /**
   * Check if user can create on a resource
   */
  const canCreate = (resource: string): boolean => {
    return hasPermission(resource, 'create');
  };

  /**
   * Check if user can update a resource
   */
  const canUpdate = (resource: string): boolean => {
    return hasPermission(resource, 'update');
  };

  /**
   * Check if user can delete a resource
   */
  const canDelete = (resource: string): boolean => {
    return hasPermission(resource, 'delete');
  };

  /**
   * Check if user can manage a resource (full control)
   */
  const canManage = (resource: string): boolean => {
    return hasPermission(resource, 'manage');
  };

  /**
   * Get all resources the user can view
   */
  const getViewableResources = (): string[] => {
    if (user?.role === 'ADMIN') {
      return ['dashboard', 'packages', 'tracking', 'deliveries', 'distribution', 'routes', 'invoices', 'manifests', 'reconciliation', 'customers', 'users', 'analytics', 'settings', 'scanner', 'calculator', 'ai', 'shipping-labels', 'payroll'];
    }

    return permissions
      .filter((p) => p.action === 'view' && p.allowed)
      .map((p) => p.resource);
  };

  return {
    permissions,
    isLoading,
    error: null,
    refetch: () => Promise.resolve(),
    hasPermission,
    canView,
    canCreate,
    canUpdate,
    canDelete,
    canManage,
    getViewableResources,
  };
}

