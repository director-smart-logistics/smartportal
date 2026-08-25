import React, { createContext, useContext, useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { onSnapshot, doc } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { COLLECTIONS } from "@/lib/firebase/firestore-client";

interface Permission {
  resource: string;
  action: string;
  allowed: boolean;
}

const FALLBACK_ROLE_PERMISSIONS: Record<string, Permission[]> = {
  ADMIN: [
    { resource: '*', action: '*', allowed: true }, // Full access
  ],
  MANAGER: [
    { resource: 'dashboard', action: 'view', allowed: true },
    { resource: 'packages', action: 'view', allowed: true },
    { resource: 'packages', action: 'create', allowed: true },
    { resource: 'packages', action: 'update', allowed: true },
    { resource: 'packages', action: 'manage', allowed: true },
    { resource: 'tracking', action: 'view', allowed: true },
    { resource: 'manifests', action: 'view', allowed: true },
    { resource: 'manifests', action: 'create', allowed: true },
    { resource: 'manifests', action: 'update', allowed: true },
    { resource: 'manifests', action: 'manage', allowed: true },
    { resource: 'deliveries', action: 'view', allowed: true },
    { resource: 'deliveries', action: 'update', allowed: true },
    { resource: 'deliveries', action: 'manage', allowed: true },
    { resource: 'routes', action: 'view', allowed: true },
    { resource: 'routes', action: 'create', allowed: true },
    { resource: 'routes', action: 'update', allowed: true },
    { resource: 'routes', action: 'manage', allowed: true },
    { resource: 'invoices', action: 'view', allowed: true },
    { resource: 'invoices', action: 'create', allowed: true },
    { resource: 'invoices', action: 'update', allowed: true },
    { resource: 'invoices', action: 'manage', allowed: true },
    { resource: 'quotes', action: 'view', allowed: true },
    { resource: 'quotes', action: 'create', allowed: true },
    { resource: 'quotes', action: 'update', allowed: true },
    { resource: 'customers', action: 'view', allowed: true },
    { resource: 'customers', action: 'create', allowed: true },
    { resource: 'customers', action: 'update', allowed: true },
    { resource: 'analytics', action: 'view', allowed: true },
    { resource: 'users', action: 'view', allowed: true },
    { resource: 'scanner', action: 'view', allowed: true },
    { resource: 'calculator', action: 'view', allowed: true },
    { resource: 'ai', action: 'view', allowed: true },
    { resource: 'shipping-labels', action: 'view', allowed: true },
    { resource: 'shipping-labels', action: 'create', allowed: true },
  ],
  STAFF: [
    { resource: 'dashboard', action: 'view', allowed: true },
    { resource: 'packages', action: 'view', allowed: true },
    { resource: 'packages', action: 'create', allowed: true },
    { resource: 'packages', action: 'update', allowed: true },
    { resource: 'tracking', action: 'view', allowed: true },
    { resource: 'manifests', action: 'view', allowed: true },
    { resource: 'manifests', action: 'create', allowed: true },
    { resource: 'deliveries', action: 'view', allowed: true },
    { resource: 'routes', action: 'view', allowed: true },
    { resource: 'invoices', action: 'view', allowed: true },
    { resource: 'invoices', action: 'create', allowed: true },
    { resource: 'quotes', action: 'view', allowed: true },
    { resource: 'customers', action: 'view', allowed: true },
    { resource: 'scanner', action: 'view', allowed: true },
    { resource: 'calculator', action: 'view', allowed: true },
    { resource: 'ai', action: 'view', allowed: true },
    { resource: 'shipping-labels', action: 'view', allowed: true },
    { resource: 'shipping-labels', action: 'create', allowed: true },
  ],
  AGENT: [
    { resource: 'dashboard', action: 'view', allowed: true },
    { resource: 'packages', action: 'view', allowed: true },
    { resource: 'packages', action: 'create', allowed: true },
    { resource: 'tracking', action: 'view', allowed: true },
    { resource: 'deliveries', action: 'view', allowed: true },
    { resource: 'deliveries', action: 'update', allowed: true },
    { resource: 'scanner', action: 'view', allowed: true },
    { resource: 'calculator', action: 'view', allowed: true },
    { resource: 'ai', action: 'view', allowed: true },
    { resource: 'quotes', action: 'view', allowed: true },
    { resource: 'quotes', action: 'create', allowed: true },
    { resource: 'quotes', action: 'update', allowed: true },
  ],
  DELIVERY: [
    { resource: 'routes', action: 'view', allowed: true },
  ],
  VIEWER: [
    { resource: 'dashboard', action: 'view', allowed: true },
    { resource: 'packages', action: 'view', allowed: true },
    { resource: 'tracking', action: 'view', allowed: true },
  ],
};

interface PermissionsContextType {
  permissions: Permission[];
  isLoading: boolean;
}

const PermissionsContext = createContext<PermissionsContextType>({
  permissions: [],
  isLoading: true,
});

export const PermissionsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [prevUser, setPrevUser] = useState<any>(null);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Synchronously reset permissions and set loading to true when user changes,
  // preventing race conditions during page refresh / auth restoration.
  if (user?.id !== prevUser?.id || user?.role !== prevUser?.role) {
    setPrevUser(user);
    setIsLoading(true);
    setPermissions([]);
  }

  useEffect(() => {
    if (!user || !user.role) {
      setPermissions([]);
      setIsLoading(false);
      return;
    }

    // Admin always gets full access, no need to listen to firestore for it
    if (user.role === "ADMIN") {
      setPermissions([{ resource: "*", action: "*", allowed: true }]);
      setIsLoading(false);
      return;
    }

    // Delivery/Driver gets specific static permissions to bypass database loading/caching issues
    if (user.role === "DELIVERY") {
      setPermissions([
        { resource: "routes", action: "view", allowed: true },
        { resource: "routes", action: "update", allowed: true },
        { resource: "dashboard", action: "view", allowed: true },
        { resource: "dashboard", action: "update", allowed: true },
        { resource: "scanner", action: "view", allowed: true },
        { resource: "scanner", action: "update", allowed: true },
        { resource: "deliveries", action: "view", allowed: true },
        { resource: "deliveries", action: "update", allowed: true },
        { resource: "tracking", action: "view", allowed: true },
        { resource: "tracking", action: "update", allowed: true },
      ]);
      setIsLoading(false);
      return;
    }

    const roleDocRef = doc(db, COLLECTIONS.PERMISSIONS, user.role);

    // Listen to changes in the role permissions document
    const unsubscribe = onSnapshot(
      roleDocRef,
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          const resources = data.resources as Record<string, string[]> | undefined;
          
          if (resources) {
            // Convert map to array of Permissions
            const permsArray: Permission[] = [];
            Object.entries(resources).forEach(([resource, actions]) => {
              if (Array.isArray(actions)) {
                actions.forEach((action) => {
                  permsArray.push({ resource, action, allowed: true });
                });
              }
            });
            setPermissions(permsArray);
          } else {
            // Document exists but no resources field, use fallback
            setPermissions(FALLBACK_ROLE_PERMISSIONS[user.role] || FALLBACK_ROLE_PERMISSIONS.VIEWER);
          }
        } else {
          // Document does not exist, use fallback
          setPermissions(FALLBACK_ROLE_PERMISSIONS[user.role] || FALLBACK_ROLE_PERMISSIONS.VIEWER);
        }
        setIsLoading(false);
      },
      (error) => {
        console.error("Error listening to permissions:", error);
        // Fallback on error
        setPermissions(FALLBACK_ROLE_PERMISSIONS[user.role] || FALLBACK_ROLE_PERMISSIONS.VIEWER);
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  return (
    <PermissionsContext.Provider value={{ permissions, isLoading }}>
      {children}
    </PermissionsContext.Provider>
  );
};

export const usePermissionsContext = () => useContext(PermissionsContext);
