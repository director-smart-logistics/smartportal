import { onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "../config/firebase";

// ── SP2 automatic sync helper (fire-and-forget) ───────────────────────────────
export interface Sp2BulkSyncResult {
  total: number; updated: number; created: number; skipped: number; errors: number;
  details: Array<{ tracking: string; outcome: string; reason?: string }>;
  error?: string;
}

/**
 * Route Management → SP2 (2026-09-28): the new status of every package is pushed to SP2 and AWAITED (a
 * fire-and-forget fetch can be cut when the function answers). `force` (Route Management's explicit admin
 * actions only) = forceSync: SP1 governs, SP2's regression guard must not keep a package "En ruta" or
 * "Facturado". Other callers keep the guard (e.g. a label reprint never moves a delivered package back).
 * One retry on a network/5xx error.
 * The per-package outcome goes back to the admin (why a package was skipped).
 */
export async function pushBulkStatusToSP2(
  packages: Array<{
    trackingNumber?: string;
    slCode?: string;
    status: string;
    weight?: number;
    description?: string;
    ruta?: string;
    manifestNumber?: string;
    requiresPermit?: boolean;
    calculatedCost?: number;
    cost?: number;
    currency?: string;
  }>,
  force: boolean,
): Promise<Sp2BulkSyncResult> {
  const url    = process.env.SP2_SHIPMENT_SYNC_URL ||
                 'https://us-central1-smart-portal-2.cloudfunctions.net/slSyncShipmentsFromSp1';
  const secret = process.env.SP2_SYNC_SECRET || '';
  const result: Sp2BulkSyncResult = { total: packages.length, updated: 0, created: 0, skipped: 0, errors: 0, details: [] };
  const noSl = packages.filter(p => !p.trackingNumber || !p.slCode);
  for (const p of noSl) { result.skipped++; result.details.push({ tracking: String(p.trackingNumber || ''), outcome: 'skipped', reason: 'Sin código SL en SP1' }); }
  const syncable = packages.filter(p => !!p.trackingNumber && !!p.slCode);
  if (!secret) { result.error = 'SP2_SYNC_SECRET no configurado'; result.errors += syncable.length; return result; }
  const body = (list: typeof syncable) => JSON.stringify({
    packages: list.map(p => ({
      trackingNumber: p.trackingNumber,
      slCode:         p.slCode,
      status:         p.status,
      weight:         p.weight,
      description:    p.description,
      ruta:           p.ruta,
      manifestNumber: p.manifestNumber,
      requiresPermit: p.requiresPermit,
      cost:           p.calculatedCost ?? p.cost,
      currency:       p.currency,
      ...(force ? { forceSync: true } : {}),
    })),
  });
  const CHUNK = 100;
  for (let i = 0; i < syncable.length; i += CHUNK) {
    const list = syncable.slice(i, i + CHUNK);
    let lastErr = '';
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-sync-secret': secret }, body: body(list) });
        if (!res.ok) { lastErr = `HTTP ${res.status}`; if (res.status < 500) break; continue; }
        const json: any = await res.json().catch(() => ({}));
        const s = json.summary || {};
        result.updated += s.updated || 0; result.created += s.created || 0; result.skipped += s.skipped || 0; result.errors += s.errors || 0;
        for (const r of (json.results || [])) if (r.outcome !== 'updated') result.details.push({ tracking: r.tracking, outcome: r.outcome, reason: r.reason });
        lastErr = '';
        break;
      } catch (err: any) {
        lastErr = err?.message || String(err);
      }
    }
    if (lastErr) {
      result.errors += list.length;
      result.error = lastErr;
      for (const p of list) result.details.push({ tracking: String(p.trackingNumber), outcome: 'error', reason: lastErr });
      logger.error('[pushBulkStatusToSP2] SP2 sync failed', { error: lastErr, count: list.length });
    }
  }
  return result;
}

// ── Types ──────────────────────────────────────────────────────────────────────

interface ListRoutesRequest {
  status?: string;
  limit?: number;
}

interface RouteVehicle {
  type: string;
  plate: string;
  capacity?: number;
  notes?: string;
  driverId?: string;
  driverName?: string;
}

interface CreateRouteRequest {
  name: string;
  description?: string;
  originLocation?: string;
  destinationLocation?: string;
  vehiclePlate?: string;
  vehicleType?: string;
  vehicles?: RouteVehicle[];
  estimatedDistance?: number;
  estimatedDuration?: string;
  status?: "active" | "inactive";
  areas?: string[];
  cantons?: string[];
  province?: string;
  color?: string;
  type?: "metropolitan" | "encomienda";
  assignedAgentId?: string | null;
  totalPackages?: number;
  completedPackages?: number;
}

interface UpdateRouteRequest extends Partial<CreateRouteRequest> {
  routeId: string;
}

interface SeedRoutesRequest {
  routes: CreateRouteRequest[];
}

interface ListPackagesByRouteRequest {
  route: string;
  status?: string;
  limit?: number;
}

interface BulkUpdateStatusRequest {
  packageIds: string[];
  status: string;
  extraFields?: Record<string, unknown>;
  /** Route Management: the admin's explicit status wins in SP2 (forceSync). */
  forceSp2?: boolean;
}

// ── slListRoutes ───────────────────────────────────────────────────────────────

export const slListRoutes = onCall(
  { cors: true },
  async (request: CallableRequest<ListRoutesRequest>) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { status, limit = 100 } = request.data || {};

    let query: FirebaseFirestore.Query = db.collection("routes").limit(limit);

    if (status && status !== "all") {
      query = query.where("status", "==", status);
    }

    const snapshot = await query.get();

    const routes = snapshot.docs
      .map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          // Normalize active (boolean) → status (string) for backwards compat
          status: data.status ?? (data.active === true ? "active" : data.active === false ? "inactive" : "active"),
          createdAt: data.createdAt?.toDate?.()?.toISOString() ?? null,
          updatedAt: data.updatedAt?.toDate?.()?.toISOString() ?? null,
        };
      })
      .sort((a: any, b: any) => (a.name ?? "").localeCompare(b.name ?? ""));

    return {
      success: true,
      data: routes,
      pagination: { total: routes.length, limit },
    };
  }
);

// ── slGetRoute ─────────────────────────────────────────────────────────────────

export const slGetRoute = onCall(
  { cors: true },
  async (request: CallableRequest<{ routeId: string }>) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { routeId } = request.data;
    if (!routeId) {
      throw new HttpsError("invalid-argument", "routeId is required");
    }

    const doc = await db.collection("routes").doc(routeId).get();

    if (!doc.exists) {
      throw new HttpsError("not-found", "Route not found");
    }

    const data = doc.data()!;
    return {
      success: true,
      data: {
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate?.()?.toISOString() ?? null,
        updatedAt: data.updatedAt?.toDate?.()?.toISOString() ?? null,
      },
    };
  }
);

// ── slCreateRoute ──────────────────────────────────────────────────────────────

export const slCreateRoute = onCall(
  { cors: true },
  async (request: CallableRequest<CreateRouteRequest>) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const callerRole = (request.auth.token as any).role as string;
    if (!["SUPER_ADMIN", "ADMIN", "MANAGER"].includes(callerRole)) {
      throw new HttpsError("permission-denied", "Admin or Manager access required");
    }

    const data = request.data;
    if (!data.name) {
      throw new HttpsError("invalid-argument", "name is required");
    }

    const existing = await db.collection("routes").where("name", "==", data.name).limit(1).get();
    if (!existing.empty) {
      throw new HttpsError("already-exists", `A route named "${data.name}" already exists`);
    }

    const now = FieldValue.serverTimestamp();
    const ref = db.collection("routes").doc();

    const routeData = {
      name: data.name,
      description: data.description ?? null,
      originLocation: data.originLocation ?? null,
      destinationLocation: data.destinationLocation ?? null,
      vehiclePlate: data.vehiclePlate ?? null,
      vehicleType: data.vehicleType ?? "van",
      vehicles: data.vehicles ?? [],
      estimatedDistance: data.estimatedDistance ?? null,
      estimatedDuration: data.estimatedDuration ?? null,
      status: data.status ?? "active",
      areas: data.areas ?? [],
      cantons: data.cantons ?? [],
      province: data.province ?? null,
      color: data.color ?? null,
      type: data.type ?? "metropolitan",
      assignedAgentId: data.assignedAgentId ?? null,
      totalPackages: data.totalPackages ?? 0,
      completedPackages: data.completedPackages ?? 0,
      createdAt: now,
      updatedAt: now,
      createdBy: request.auth.uid,
    };

    await ref.set(routeData);

    return {
      success: true,
      data: {
        id: ref.id,
        ...routeData,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    };
  }
);

// ── slUpdateRoute ──────────────────────────────────────────────────────────────

export const slUpdateRoute = onCall(
  { cors: true },
  async (request: CallableRequest<UpdateRouteRequest>) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const callerRole = (request.auth.token as any).role as string;
    if (!["SUPER_ADMIN", "ADMIN", "MANAGER"].includes(callerRole)) {
      throw new HttpsError("permission-denied", "Admin or Manager access required");
    }

    const { routeId, ...fields } = request.data;
    if (!routeId) {
      throw new HttpsError("invalid-argument", "routeId is required");
    }

    const doc = await db.collection("routes").doc(routeId).get();
    if (!doc.exists) {
      throw new HttpsError("not-found", "Route not found");
    }

    const updateData: Record<string, unknown> = {
      ...fields,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: request.auth.uid,
    };

    // Remove undefined values
    Object.keys(updateData).forEach((k) => updateData[k] === undefined && delete updateData[k]);

    await db.collection("routes").doc(routeId).update(updateData);

    return { success: true, id: routeId, ...fields };
  }
);

// ── slDeleteRoute ──────────────────────────────────────────────────────────────

export const slDeleteRoute = onCall(
  { cors: true },
  async (request: CallableRequest<{ routeId: string }>) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const callerRole = (request.auth.token as any).role as string;
    if (!["SUPER_ADMIN", "ADMIN"].includes(callerRole)) {
      throw new HttpsError("permission-denied", "Admin access required");
    }

    const { routeId } = request.data;
    if (!routeId) {
      throw new HttpsError("invalid-argument", "routeId is required");
    }

    const doc = await db.collection("routes").doc(routeId).get();
    if (!doc.exists) {
      throw new HttpsError("not-found", "Route not found");
    }

    await db.collection("routes").doc(routeId).delete();

    return { success: true, id: routeId };
  }
);

// ── slSeedRoutes ───────────────────────────────────────────────────────────────

export const slSeedRoutes = onCall(
  { cors: true },
  async (request: CallableRequest<SeedRoutesRequest>) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const callerRole = (request.auth.token as any).role as string;
    if (!["SUPER_ADMIN", "ADMIN"].includes(callerRole)) {
      throw new HttpsError("permission-denied", "Admin access required");
    }

    const { routes } = request.data;
    if (!Array.isArray(routes) || routes.length === 0) {
      throw new HttpsError("invalid-argument", "routes array is required and must not be empty");
    }

    const now = FieldValue.serverTimestamp();
    const batch = db.batch();
    let seeded = 0;

    for (const route of routes) {
      if (!route.name) continue;
      // Use name as doc ID slug for idempotency
      const slug = route.name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
      const ref = db.collection("routes").doc(slug);
      batch.set(
        ref,
        {
          name: route.name,
          description: route.description ?? null,
          originLocation: route.originLocation ?? null,
          destinationLocation: route.destinationLocation ?? null,
          vehiclePlate: route.vehiclePlate ?? null,
          vehicleType: route.vehicleType ?? "van",
          estimatedDistance: route.estimatedDistance ?? null,
          estimatedDuration: route.estimatedDuration ?? null,
          status: route.status ?? "active",
          areas: route.areas ?? [],
          cantons: route.cantons ?? [],
          province: route.province ?? null,
          color: route.color ?? null,
          type: route.type ?? "metropolitan",
          assignedAgentId: route.assignedAgentId ?? null,
          totalPackages: 0,
          completedPackages: 0,
          createdAt: now,
          updatedAt: now,
          seeded: true,
        },
        { merge: true }
      );
      seeded++;
    }

    await batch.commit();

    return { success: true, seeded };
  }
);

// ── slListPackagesByRoute ──────────────────────────────────────────────────────

export const slListPackagesByRoute = onCall(
  { cors: true },
  async (request: CallableRequest<ListPackagesByRouteRequest>) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { route, status, limit = 500 } = request.data;
    if (!route) {
      throw new HttpsError("invalid-argument", "route name is required");
    }

    let query: FirebaseFirestore.Query = db.collection("packages").where("ruta", "==", route).limit(limit);

    if (status) {
      query = query.where("status", "==", status);
    }

    const snapshot = await query.get();

    const packages = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        tracking: data.tracking ?? data.trackingNumber ?? null,
        slCode: data.slCode ?? null,
        customerName: data.customerName ?? data.nombreCliente ?? null,
        status: data.status ?? null,
        ruta: data.ruta ?? null,
        weight: data.weight ?? data.peso ?? null,
        value: data.value ?? data.precio ?? data.declaredValue ?? null,
        description: data.description ?? data.descripcion ?? null,
        manifiesto: data.manifiesto ?? data.manifestNumber ?? data.guia ?? null,
        createdAt: data.createdAt?.toDate?.()?.toISOString() ?? null,
        updatedAt: data.updatedAt?.toDate?.()?.toISOString() ?? null,
      };
    });

    return {
      success: true,
      data: packages,
      pagination: { total: packages.length, limit },
    };
  }
);

// ── slBulkUpdatePackageStatus ──────────────────────────────────────────────────

export const slBulkUpdatePackageStatus = onCall(
  { cors: true },
  async (request: CallableRequest<BulkUpdateStatusRequest>) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const callerRole = (request.auth.token as any).role as string;
    if (!["SUPER_ADMIN", "ADMIN", "MANAGER"].includes(callerRole)) {
      throw new HttpsError("permission-denied", "Admin or Manager access required");
    }

    const { packageIds, status, extraFields = {}, forceSp2 = false } = request.data;

    if (!Array.isArray(packageIds) || packageIds.length === 0) {
      throw new HttpsError("invalid-argument", "packageIds must be a non-empty array");
    }
    if (!status) {
      throw new HttpsError("invalid-argument", "status is required");
    }

    const now = FieldValue.serverTimestamp();
    const CHUNK = 500; // Firestore batch limit
    let updated = 0;

    // Read package docs first so we have tracking/slCode for SP2 sync
    const allDocs = await Promise.all(
      packageIds.map((id: string) => db.collection("packages").doc(id).get())
    );
    const packageDataMap = new Map(
      allDocs.filter(d => d.exists).map(d => [d.id, d.data() as Record<string, any>])
    );

    for (let i = 0; i < packageIds.length; i += CHUNK) {
      const chunk = packageIds.slice(i, i + CHUNK);
      const batch = db.batch();

      for (const packageId of chunk) {
        const ref = db.collection("packages").doc(packageId);
        batch.update(ref, {
          status,
          ...extraFields,
          updatedAt: now,
          updatedBy: request.auth!.uid,
        });
        updated++;
      }

      await batch.commit();
    }

    // Push all updated packages to SP2 and WAIT for its answer (the admin sees what was updated / skipped).
    const sp2 = await pushBulkStatusToSP2(
      packageIds.map((id: string) => {
        const d = packageDataMap.get(id) ?? {};
        return {
          trackingNumber: d.trackingNumber ?? d.tracking ?? id,
          slCode:         d.slCode,
          status,
          weight:         d.weight,
          description:    d.description,
          ruta:           (extraFields as any).ruta ?? d.ruta,
          manifestNumber: (extraFields as any).manifestNumber ?? d.manifestNumber,
          requiresPermit: d.requiresPermit,
          calculatedCost: d.calculatedCost,
          cost:           d.cost,
          currency:       d.currency,
        };
      }),
      forceSp2 === true
    );

    try {
      await db.collection("package_status_sync_logs").add({
        at: new Date().toISOString(), by: request.auth!.token.email || request.auth!.uid, status, count: packageIds.length,
        sp2: { updated: sp2.updated, created: sp2.created, skipped: sp2.skipped, errors: sp2.errors, error: sp2.error ?? null },
        notUpdated: sp2.details.slice(0, 200), source: "slBulkUpdatePackageStatus",
      });
    } catch (logErr) {
      logger.warn("[slBulkUpdatePackageStatus] log write failed", { error: (logErr as Error).message });
    }
    return { success: true, updated, sp2 };
  }
);
