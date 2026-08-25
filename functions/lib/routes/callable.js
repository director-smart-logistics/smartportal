"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.slBulkUpdatePackageStatus = exports.slListPackagesByRoute = exports.slSeedRoutes = exports.slDeleteRoute = exports.slUpdateRoute = exports.slCreateRoute = exports.slGetRoute = exports.slListRoutes = void 0;
const https_1 = require("firebase-functions/v2/https");
const v2_1 = require("firebase-functions/v2");
const firebase_1 = require("../config/firebase");
// ── SP2 automatic sync helper (fire-and-forget) ───────────────────────────────
function pushBulkStatusToSP2(packages) {
    const url = process.env.SP2_SHIPMENT_SYNC_URL ||
        'https://us-central1-smart-portal-2.cloudfunctions.net/slSyncShipmentsFromSp1';
    const secret = process.env.SP2_SYNC_SECRET || '';
    if (!secret)
        return;
    const syncable = packages.filter(p => !!p.trackingNumber && !!p.slCode);
    if (syncable.length === 0)
        return;
    fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-sync-secret': secret,
        },
        body: JSON.stringify({
            packages: syncable.map(p => ({
                trackingNumber: p.trackingNumber,
                slCode: p.slCode,
                status: p.status,
                weight: p.weight,
                description: p.description,
                ruta: p.ruta,
                manifestNumber: p.manifestNumber,
                requiresPermit: p.requiresPermit,
                cost: p.calculatedCost ?? p.cost,
                currency: p.currency,
            })),
        }),
    }).catch((err) => {
        v2_1.logger.warn('[pushBulkStatusToSP2] Non-blocking sync error', { error: err.message });
    });
}
// ── slListRoutes ───────────────────────────────────────────────────────────────
exports.slListRoutes = (0, https_1.onCall)({ cors: true }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
    }
    const { status, limit = 100 } = request.data || {};
    let query = firebase_1.db.collection("routes").limit(limit);
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
        .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
    return {
        success: true,
        data: routes,
        pagination: { total: routes.length, limit },
    };
});
// ── slGetRoute ─────────────────────────────────────────────────────────────────
exports.slGetRoute = (0, https_1.onCall)({ cors: true }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
    }
    const { routeId } = request.data;
    if (!routeId) {
        throw new https_1.HttpsError("invalid-argument", "routeId is required");
    }
    const doc = await firebase_1.db.collection("routes").doc(routeId).get();
    if (!doc.exists) {
        throw new https_1.HttpsError("not-found", "Route not found");
    }
    const data = doc.data();
    return {
        success: true,
        data: {
            id: doc.id,
            ...data,
            createdAt: data.createdAt?.toDate?.()?.toISOString() ?? null,
            updatedAt: data.updatedAt?.toDate?.()?.toISOString() ?? null,
        },
    };
});
// ── slCreateRoute ──────────────────────────────────────────────────────────────
exports.slCreateRoute = (0, https_1.onCall)({ cors: true }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
    }
    const callerRole = request.auth.token.role;
    if (!["SUPER_ADMIN", "ADMIN", "MANAGER"].includes(callerRole)) {
        throw new https_1.HttpsError("permission-denied", "Admin or Manager access required");
    }
    const data = request.data;
    if (!data.name) {
        throw new https_1.HttpsError("invalid-argument", "name is required");
    }
    const existing = await firebase_1.db.collection("routes").where("name", "==", data.name).limit(1).get();
    if (!existing.empty) {
        throw new https_1.HttpsError("already-exists", `A route named "${data.name}" already exists`);
    }
    const now = firebase_1.admin.firestore.FieldValue.serverTimestamp();
    const ref = firebase_1.db.collection("routes").doc();
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
});
// ── slUpdateRoute ──────────────────────────────────────────────────────────────
exports.slUpdateRoute = (0, https_1.onCall)({ cors: true }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
    }
    const callerRole = request.auth.token.role;
    if (!["SUPER_ADMIN", "ADMIN", "MANAGER"].includes(callerRole)) {
        throw new https_1.HttpsError("permission-denied", "Admin or Manager access required");
    }
    const { routeId, ...fields } = request.data;
    if (!routeId) {
        throw new https_1.HttpsError("invalid-argument", "routeId is required");
    }
    const doc = await firebase_1.db.collection("routes").doc(routeId).get();
    if (!doc.exists) {
        throw new https_1.HttpsError("not-found", "Route not found");
    }
    const updateData = {
        ...fields,
        updatedAt: firebase_1.admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: request.auth.uid,
    };
    // Remove undefined values
    Object.keys(updateData).forEach((k) => updateData[k] === undefined && delete updateData[k]);
    await firebase_1.db.collection("routes").doc(routeId).update(updateData);
    return { success: true, id: routeId, ...fields };
});
// ── slDeleteRoute ──────────────────────────────────────────────────────────────
exports.slDeleteRoute = (0, https_1.onCall)({ cors: true }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
    }
    const callerRole = request.auth.token.role;
    if (!["SUPER_ADMIN", "ADMIN"].includes(callerRole)) {
        throw new https_1.HttpsError("permission-denied", "Admin access required");
    }
    const { routeId } = request.data;
    if (!routeId) {
        throw new https_1.HttpsError("invalid-argument", "routeId is required");
    }
    const doc = await firebase_1.db.collection("routes").doc(routeId).get();
    if (!doc.exists) {
        throw new https_1.HttpsError("not-found", "Route not found");
    }
    await firebase_1.db.collection("routes").doc(routeId).delete();
    return { success: true, id: routeId };
});
// ── slSeedRoutes ───────────────────────────────────────────────────────────────
exports.slSeedRoutes = (0, https_1.onCall)({ cors: true }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
    }
    const callerRole = request.auth.token.role;
    if (!["SUPER_ADMIN", "ADMIN"].includes(callerRole)) {
        throw new https_1.HttpsError("permission-denied", "Admin access required");
    }
    const { routes } = request.data;
    if (!Array.isArray(routes) || routes.length === 0) {
        throw new https_1.HttpsError("invalid-argument", "routes array is required and must not be empty");
    }
    const now = firebase_1.admin.firestore.FieldValue.serverTimestamp();
    const batch = firebase_1.db.batch();
    let seeded = 0;
    for (const route of routes) {
        if (!route.name)
            continue;
        // Use name as doc ID slug for idempotency
        const slug = route.name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
        const ref = firebase_1.db.collection("routes").doc(slug);
        batch.set(ref, {
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
        }, { merge: true });
        seeded++;
    }
    await batch.commit();
    return { success: true, seeded };
});
// ── slListPackagesByRoute ──────────────────────────────────────────────────────
exports.slListPackagesByRoute = (0, https_1.onCall)({ cors: true }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
    }
    const { route, status, limit = 500 } = request.data;
    if (!route) {
        throw new https_1.HttpsError("invalid-argument", "route name is required");
    }
    let query = firebase_1.db.collection("packages").where("ruta", "==", route).limit(limit);
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
});
// ── slBulkUpdatePackageStatus ──────────────────────────────────────────────────
exports.slBulkUpdatePackageStatus = (0, https_1.onCall)({ cors: true }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
    }
    const callerRole = request.auth.token.role;
    if (!["SUPER_ADMIN", "ADMIN", "MANAGER"].includes(callerRole)) {
        throw new https_1.HttpsError("permission-denied", "Admin or Manager access required");
    }
    const { packageIds, status, extraFields = {} } = request.data;
    if (!Array.isArray(packageIds) || packageIds.length === 0) {
        throw new https_1.HttpsError("invalid-argument", "packageIds must be a non-empty array");
    }
    if (!status) {
        throw new https_1.HttpsError("invalid-argument", "status is required");
    }
    const now = firebase_1.admin.firestore.FieldValue.serverTimestamp();
    const CHUNK = 500; // Firestore batch limit
    let updated = 0;
    // Read package docs first so we have tracking/slCode for SP2 sync
    const allDocs = await Promise.all(packageIds.map((id) => firebase_1.db.collection("packages").doc(id).get()));
    const packageDataMap = new Map(allDocs.filter(d => d.exists).map(d => [d.id, d.data()]));
    for (let i = 0; i < packageIds.length; i += CHUNK) {
        const chunk = packageIds.slice(i, i + CHUNK);
        const batch = firebase_1.db.batch();
        for (const packageId of chunk) {
            const ref = firebase_1.db.collection("packages").doc(packageId);
            batch.update(ref, {
                status,
                ...extraFields,
                updatedAt: now,
                updatedBy: request.auth.uid,
            });
            updated++;
        }
        await batch.commit();
    }
    // Push all updated packages to SP2 automatically (fire-and-forget)
    pushBulkStatusToSP2(packageIds.map((id) => {
        const d = packageDataMap.get(id) ?? {};
        return {
            trackingNumber: d.trackingNumber ?? d.tracking ?? id,
            slCode: d.slCode,
            status,
            weight: d.weight,
            description: d.description,
            ruta: extraFields.ruta ?? d.ruta,
            manifestNumber: extraFields.manifestNumber ?? d.manifestNumber,
            requiresPermit: d.requiresPermit,
            calculatedCost: d.calculatedCost,
            cost: d.cost,
            currency: d.currency,
        };
    }));
    return { success: true, updated };
});
//# sourceMappingURL=callable.js.map