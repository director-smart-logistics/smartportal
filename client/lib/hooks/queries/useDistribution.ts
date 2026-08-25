import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc, arrayUnion, increment } from 'firebase/firestore';
import { firebaseApi } from '@/lib/firebase/callable';
import { firestoreApi, getInvoiceByTracking } from '@/lib/firebase/firestore-client';
import { db } from '@/lib/firebase/config';

// Types for distribution/delivery
export interface RoutePackage {
  id: string;
  packageId: string;
  deliveryStatus: string;
  deliveryNotes: string | null;
  deliveredAt: Date | null;
  package: {
    id: string;
    trackingNumber: string;
    customerName: string;
    type: string;
    origin: string;
    destination: string;
    weight: number;
    description?: string;
    status: string;
    slCode?: string;
    ruta?: string;
    deliveryAddress?: string;
    deliveryAttemptCount?: number;
    customer: {
      id: string;
      fullName: string;
      email: string;
      phone: string;
      address?: string;
    } | null;
  };
}

export interface MyRoute {
  id: string;
  name: string;
  originLocation: string;
  destinationLocation: string;
  vehiclePlate: string | null;
  vehicleType: string | null;
  totalPackages: number;
  completedPackages: number;
  status: string;
  routePackages: RoutePackage[];
}

/**
 * Hook to fetch the delivery agent's assigned route with all packages.
 * Uses direct Firestore queries (no Cloud Function overhead).
 *
 * Data model:
 *  routes.assignedAgentId == userId  →  active routes for this agent
 *  packages.ruta == route.name       →  packages assigned to that route
 *
 * @param userId UID of the agent (or admin-selected agent)
 * @param options Query options
 */
export function useMyRoute(
  userId?: string,
  options?: { enabled?: boolean; refetchInterval?: number }
) {
  return useQuery<MyRoute[]>({
    queryKey: ['distribution', 'my-route', userId],
    queryFn: async () => {
      if (!userId) return [];

      // Step 1: fetch routes assigned to this agent
      const routesResult = await firestoreApi.routes.list({
        filters: [{ field: 'assignedAgentId', op: '==', value: userId }],
        orderByField: 'createdAt',
        orderDirection: 'asc',
        pageSize: 50,
      });

      const allRoutes = (routesResult.data ?? []) as any[];
      const activeRoutes = allRoutes.filter(
        (r: any) => r.status === 'active' || r.active === true
      );

      if (activeRoutes.length === 0) return [];

      // Step 2: parallel fetch packages per route (by ruta name field)
      const routesWithPkgs = await Promise.all(
        activeRoutes.map(async (route: any) => {
          const pkgsResult = await firestoreApi.packages.list({
            filters: [{ field: 'ruta', op: '==', value: route.name }],
            orderByField: 'createdAt',
            orderDirection: 'desc',
            pageSize: 500,
          });

          const packages = (pkgsResult.data ?? []) as any[];

          const routePackages: RoutePackage[] = packages.map((pkg: any) => ({
            id: pkg.id,
            packageId: pkg.id,
            deliveryStatus: pkg.status ?? 'unknown',
            deliveryNotes: pkg.notes ?? null,
            deliveredAt: pkg.deliveredAt ? new Date(pkg.deliveredAt) : null,
            package: {
              id: pkg.id,
              trackingNumber: pkg.trackingNumber ?? pkg.tracking ?? '',
              customerName: pkg.customerName ?? '',
              type: pkg.type ?? '',
              origin: pkg.origin ?? '',
              destination: pkg.destination ?? '',
              weight: pkg.weight ?? 0,
              description: pkg.description,
              status: pkg.status,
              slCode: pkg.slCode,
              ruta: pkg.ruta,
              deliveryAddress: pkg.deliveryAddress1 ?? pkg.customerAddress ?? pkg.address ?? undefined,
              customer: pkg.customerId
                ? {
                    id: pkg.customerId,
                    fullName: pkg.customerName ?? '',
                    email: pkg.customerEmail ?? '',
                    phone: pkg.customerPhone ?? '',
                    address: pkg.deliveryAddress1 ?? pkg.customerAddress ?? pkg.address ?? pkg.destination ?? '',
                  }
                : null,
            },
          }));

          const total = routePackages.length;
          const completed = routePackages.filter(
            (rp) => rp.deliveryStatus === 'delivered'
          ).length;

          return {
            id: route.id,
            name: route.name,
            originLocation: route.originLocation ?? '',
            destinationLocation: route.destinationLocation ?? '',
            vehiclePlate:
              route.vehiclePlate ??
              (Array.isArray(route.vehicles) && route.vehicles.length > 0
                ? route.vehicles[0].plate
                : null),
            vehicleType:
              route.vehicleType ??
              (Array.isArray(route.vehicles) && route.vehicles.length > 0
                ? route.vehicles[0].type
                : null),
            totalPackages: total,
            completedPackages: completed,
            status: route.status ?? 'active',
            routePackages,
          } as MyRoute;
        })
      );

      return routesWithPkgs;
    },
    staleTime: 5 * 60 * 1000,
    refetchInterval: options?.refetchInterval ?? false,
    enabled: options?.enabled !== false && !!userId,
  });
}

/**
 * Hook to update package delivery status.
 * Canonical statuses: 'delivered' for success, 'returned' for failed delivery.
 * Optionally stores a base64 signature image.
 */
export function useUpdatePackageStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      packageId,
      status,
      failureReason,
      notes,
      signatureData,
    }: {
      packageId: string;
      status: 'delivered' | 'returned';
      failureReason?: string;
      notes?: string;
      signatureData?: string;
    }) => {
      const result = await firebaseApi.packages.updateStatus(
        packageId,
        status,
        undefined,
        notes || failureReason
      );
      if (!result.success || result.error) throw new Error(result.error || 'Failed to update status');
      // Store signature alongside the package document if provided
      if (signatureData) {
        await firestoreApi.packages.update(packageId, {
          deliverySignature: signatureData,
          deliverySignedAt: new Date().toISOString(),
        });
      }
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['distribution', 'my-route'] });
      queryClient.invalidateQueries({ queryKey: ['distribution', 'by-route'] });
      queryClient.invalidateQueries({ queryKey: ['packages'] });
    },
  });
}

// ─── Shared helper to map a raw package doc → RoutePackage ───────────────────
function pkgDocToRoutePackage(pkg: any): RoutePackage {
  return {
    id: pkg.id,
    packageId: pkg.id,
    deliveryStatus: pkg.status ?? 'unknown',
    deliveryNotes: pkg.notes ?? null,
    deliveredAt: pkg.deliveredAt ? new Date(pkg.deliveredAt) : null,
    package: {
      id: pkg.id,
      trackingNumber: pkg.trackingNumber ?? pkg.tracking ?? '',
      customerName: pkg.customerName ?? '',
      type: pkg.type ?? '',
      origin: pkg.origin ?? '',
      destination: pkg.destination ?? '',
      weight: pkg.weight ?? 0,
      description: pkg.description,
      status: pkg.status,
      slCode: pkg.slCode,
      ruta: pkg.ruta,
      deliveryAddress: pkg.deliveryAddress1 ?? pkg.customerAddress ?? pkg.address ?? undefined,
      deliveryAttemptCount: pkg.deliveryAttemptCount ?? 0,
      customer: pkg.customerId
        ? {
            id: pkg.customerId,
            fullName: pkg.customerName ?? '',
            email: pkg.customerEmail ?? '',
            phone: pkg.customerPhone ?? '',
            address: pkg.deliveryAddress1 ?? pkg.customerAddress ?? pkg.address ?? pkg.destination ?? '',
          }
        : null,
    },
  };
}

function buildMyRoute(route: any, packages: any[]): MyRoute {
  const routePackages = packages.map(pkgDocToRoutePackage);
  return {
    id: route.id,
    name: route.name,
    originLocation: route.originLocation ?? '',
    destinationLocation: route.destinationLocation ?? '',
    vehiclePlate:
      route.vehiclePlate ??
      (Array.isArray(route.vehicles) && route.vehicles.length > 0
        ? route.vehicles[0].plate
        : null),
    vehicleType:
      route.vehicleType ??
      (Array.isArray(route.vehicles) && route.vehicles.length > 0
        ? route.vehicles[0].type
        : null),
    totalPackages: routePackages.length,
    completedPackages: routePackages.filter((rp) => rp.deliveryStatus === 'delivered').length,
    status: route.status ?? 'active',
    routePackages,
  };
}

/**
 * Real-time hook for Distribution page.
 * Uses Firestore onSnapshot instead of polling — zero latency updates.
 *
 * Agent mode: listens to routes (assignedAgentId) → packages (ruta)
 * Route mode:  listens to a single route doc     → packages (ruta)
 */
export function useRoutePackagesRealtime(
  mode: 'agent' | 'route',
  agentId?: string,
  routeId?: string,
  options?: { enabled?: boolean }
): { data: MyRoute[]; isLoading: boolean; error: Error | null } {
  const qc = useQueryClient();
  const queryKey = ['distribution', 'realtime', mode, agentId ?? '', routeId ?? ''];

  // routeDataMap: routeId → { route metadata, packages[] }
  const routeDataRef = useRef<Map<string, { route: any; packages: any[] }>>(new Map());
  // pkg onSnapshot unsubscribers keyed by routeId
  const pkgUnsubsRef = useRef<Map<string, () => void>>(new Map());

  const flushToCache = () => {
    const result: MyRoute[] = [];
    for (const [, { route, packages }] of routeDataRef.current) {
      result.push(buildMyRoute(route, packages));
    }
    qc.setQueryData(queryKey, result);
  };

  const subscribeToPkgs = (route: any) => {
    if (pkgUnsubsRef.current.has(route.id)) return; // already subscribed
    const pkgQ = query(collection(db, 'packages'), where('ruta', '==', route.name));
    const unsub = onSnapshot(
      pkgQ,
      (snap) => {
        const packages = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
        const entry = routeDataRef.current.get(route.id);
        if (entry) {
          entry.packages = packages;
          flushToCache();
        }
      },
      (err) => console.error('[RT] packages snapshot error:', err)
    );
    pkgUnsubsRef.current.set(route.id, unsub);
  };

  const unsubscribeStaleRoutes = (activeIds: Set<string>) => {
    for (const [id, unsub] of pkgUnsubsRef.current) {
      if (!activeIds.has(id)) {
        unsub();
        pkgUnsubsRef.current.delete(id);
        routeDataRef.current.delete(id);
      }
    }
  };

  useEffect(() => {
    const enabled = options?.enabled !== false;
    if (!enabled) return;

    // Initialize empty result immediately so UI renders skeleton
    qc.setQueryData(queryKey, undefined);

    let routeUnsub: (() => void) | null = null;

    if (mode === 'agent' && agentId) {
      // ── Agent mode: listen to routes then packages ─────────────────────
      const routesQ = query(
        collection(db, 'routes'),
        where('assignedAgentId', '==', agentId)
      );

      routeUnsub = onSnapshot(
        routesQ,
        (snap) => {
          const allRoutes = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
          const active = allRoutes.filter(
            (r) => r.status === 'active' || r.active === true
          );

          const activeIds = new Set(active.map((r: any) => r.id as string));
          unsubscribeStaleRoutes(activeIds);

          if (active.length === 0) {
            qc.setQueryData(queryKey, []);
            return;
          }

          active.forEach((route) => {
            if (!routeDataRef.current.has(route.id)) {
              routeDataRef.current.set(route.id, { route, packages: [] });
            } else {
              // Update route metadata in case it changed
              routeDataRef.current.get(route.id)!.route = route;
            }
            subscribeToPkgs(route);
          });
        },
        (err) => console.error('[RT] routes snapshot error:', err)
      );
    } else if (mode === 'route' && routeId) {
      // ── Route mode: listen to route doc then packages ───────────────────
      const routeDocRef = doc(db, 'routes', routeId);
      routeUnsub = onSnapshot(
        routeDocRef,
        (snap) => {
          if (!snap.exists()) {
            qc.setQueryData(queryKey, []);
            return;
          }
          const route = { id: snap.id, ...(snap.data() as any) };
          if (!routeDataRef.current.has(route.id)) {
            routeDataRef.current.set(route.id, { route, packages: [] });
          } else {
            routeDataRef.current.get(route.id)!.route = route;
          }
          subscribeToPkgs(route);
        },
        (err) => console.error('[RT] route doc snapshot error:', err)
      );
    }

    return () => {
      routeUnsub?.();
      for (const unsub of pkgUnsubsRef.current.values()) unsub();
      pkgUnsubsRef.current.clear();
      routeDataRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, agentId, routeId, options?.enabled]);

  const queryResult = useQuery<MyRoute[]>({
    queryKey,
    queryFn: () => [],
    staleTime: Infinity,
    enabled: options?.enabled !== false && !!(agentId || routeId),
  });

  return {
    data: queryResult.data ?? [],
    isLoading: queryResult.data === undefined && !!(agentId || routeId) && options?.enabled !== false,
    error: queryResult.error as Error | null,
  };
}

/**
 * Hook to fetch packages for a specific route by route ID (admin use).
 * Queries packages directly by ruta field without needing an assigned agent.
 */
export function usePackagesByRoute(
  routeId?: string,
  options?: { enabled?: boolean; refetchInterval?: number }
) {
  return useQuery<MyRoute[]>({
    queryKey: ['distribution', 'by-route', routeId],
    queryFn: async () => {
      if (!routeId) return [];

      const routeRes = (await firestoreApi.routes.get(routeId)) as any;
      const route = routeRes?.data ?? routeRes;
      if (!route?.name) return [];

      const pkgsResult = await firestoreApi.packages.list({
        filters: [{ field: 'ruta', op: '==', value: route.name }],
        orderByField: 'createdAt',
        orderDirection: 'desc',
        pageSize: 500,
      });

      const packages = (pkgsResult.data ?? []) as any[];

      const routePackages: RoutePackage[] = packages.map((pkg: any) => ({
        id: pkg.id,
        packageId: pkg.id,
        deliveryStatus: pkg.status ?? 'unknown',
        deliveryNotes: pkg.notes ?? null,
        deliveredAt: pkg.deliveredAt ? new Date(pkg.deliveredAt) : null,
        package: {
          id: pkg.id,
          trackingNumber: pkg.trackingNumber ?? pkg.tracking ?? '',
          customerName: pkg.customerName ?? '',
          type: pkg.type ?? '',
          origin: pkg.origin ?? '',
          destination: pkg.destination ?? '',
          weight: pkg.weight ?? 0,
          description: pkg.description,
          status: pkg.status,
          slCode: pkg.slCode,
          customer: pkg.customerId
            ? {
                id: pkg.customerId,
                fullName: pkg.customerName ?? '',
                email: pkg.customerEmail ?? '',
                phone: pkg.customerPhone ?? '',
                address: pkg.destination ?? '',
              }
            : null,
        },
      }));

      const total = routePackages.length;
      const completed = routePackages.filter((rp) => rp.deliveryStatus === 'delivered').length;

      return [
        {
          id: route.id,
          name: route.name,
          originLocation: route.originLocation ?? '',
          destinationLocation: route.destinationLocation ?? '',
          vehiclePlate:
            route.vehiclePlate ??
            (Array.isArray(route.vehicles) && route.vehicles.length > 0
              ? route.vehicles[0].plate
              : null),
          vehicleType:
            route.vehicleType ??
            (Array.isArray(route.vehicles) && route.vehicles.length > 0
              ? route.vehicles[0].type
              : null),
          totalPackages: total,
          completedPackages: completed,
          status: route.status ?? 'active',
          routePackages,
        },
      ] as MyRoute[];
    },
    staleTime: 5 * 60 * 1000,
    refetchInterval: options?.refetchInterval ?? false,
    enabled: options?.enabled !== false && !!routeId,
  });
}

/**
 * Records a failed delivery attempt on a package and all linked invoices.
 * Increments `deliveryAttemptCount` and appends an entry to `deliveryAttemptHistory`
 * with the timestamp, reason, notes and driver info. The package status is NOT
 * changed here — that is handled separately by useUpdatePackageStatus.
 */
export function useRecordDeliveryAttempt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      packageId,
      trackingNumber,
      reason,
      notes,
      driverId,
      driverName,
    }: {
      packageId:      string;
      trackingNumber: string;
      reason:         string;
      notes?:         string;
      driverId?:      string;
      driverName?:    string;
    }) => {
      const attemptAt = new Date().toISOString();
      const entry = {
        attemptAt,
        reason,
        notes:      notes      || null,
        driverId:   driverId   || null,
        driverName: driverName || null,
      };

      // 1. Stamp the package doc
      await updateDoc(doc(db, 'packages', packageId), {
        deliveryAttemptCount:   increment(1),
        deliveryAttemptHistory: arrayUnion(entry),
        lastDeliveryAttemptAt:  attemptAt,
      });

      // 2. Stamp every linked invoice
      const invoices = await getInvoiceByTracking(trackingNumber);
      if (invoices.length > 0) {
        await Promise.allSettled(
          invoices.map((inv: any) =>
            updateDoc(doc(db, 'invoices', inv.id as string), {
              deliveryAttemptCount:   increment(1),
              deliveryAttemptHistory: arrayUnion(entry),
              lastDeliveryAttemptAt:  attemptAt,
            }),
          ),
        );
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['distribution'] });
    },
  });
}

/**
 * Batch-updates multiple packages to delivered (or returned) in a single call.
 * Used for group delivery confirmation — marks all selected packages at once.
 */
export function useBatchUpdatePackageStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      packageIds,
      status,
      signatureData,
      paymentCollected,
    }: {
      packageIds: string[];
      status: 'delivered' | 'returned';
      signatureData?: string;
      paymentCollected?: boolean;
    }) => {
      await Promise.all(
        packageIds.map(async (packageId) => {
          const result = await firebaseApi.packages.updateStatus(
            packageId,
            status,
            undefined,
            undefined,
            signatureData,
            paymentCollected
          );
          if (!result.success || result.error) throw new Error(result.error ?? 'Failed to update status');
        })
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['distribution'] });
      queryClient.invalidateQueries({ queryKey: ['packages'] });
    },
  });
}
