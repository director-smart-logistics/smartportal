import { onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { db, admin } from "../config/firebase";

// ── SP2 automatic sync helper (fire-and-forget) ───────────────────────────────
//
// Called after any SP1 status change so SP2 reflects the update in real time
// without waiting for a manual batch sync.
function pushStatusToSP2(
  pkg: {
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
    forceSync?: boolean;
    allowCreate?: boolean;
  }
): void {
  const url    = process.env.SP2_SHIPMENT_SYNC_URL ||
                 'https://us-central1-smart-portal-2.cloudfunctions.net/slSyncShipmentsFromSp1';
  const secret = process.env.SP2_SYNC_SECRET || '';

  if (!secret || !pkg.trackingNumber || !pkg.slCode) return;

  fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'x-sync-secret': secret,
    },
    body: JSON.stringify({
      packages: [{
        trackingNumber: pkg.trackingNumber,
        slCode:         pkg.slCode,
        status:         pkg.status,
        weight:         pkg.weight,
        description:    pkg.description,
        ruta:           pkg.ruta,
        manifestNumber: pkg.manifestNumber,
        requiresPermit: pkg.requiresPermit,
        cost:           pkg.calculatedCost ?? pkg.cost,
        currency:       pkg.currency,
        forceSync:      pkg.forceSync,
        allowCreate:    pkg.allowCreate,
      }],
    }),
  }).catch((err: Error) => {
    logger.warn('[pushStatusToSP2] Non-blocking sync error', {
      tracking: pkg.trackingNumber,
      error:    err.message,
    });
  });
}

// ── Search index helpers (mirrors client-side firestore-client.ts) ────────────
function generateSearchTokens(text: string): string[] {
  const normalized = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
  if (!normalized) return [];
  const words = normalized.split(/\s+/).filter((w) => w.length >= 1);
  const tokens = new Set<string>();
  for (const word of words) {
    for (let i = 1; i <= word.length; i++) {
      tokens.add(word.slice(0, i));
    }
  }
  return [...tokens];
}

function generateTrackingSuffixes(trackingNumber: string): string[] {
  const upper = trackingNumber.trim().toUpperCase();
  const set = new Set<string>([upper]);
  for (const len of [22, 20, 18, 15, 13, 12, 10]) {
    if (upper.length > len) set.add(upper.slice(-len));
  }
  const nums = upper.replace(/\D/g, "");
  if (nums.length >= 6) set.add(nums);
  if (upper.startsWith("420") && upper.length >= 30) {
    for (const off of [8, 9, 10]) {
      const s = upper.substring(off);
      if (/^9\d/.test(s)) set.add(s);
    }
  }
  return [...set].filter((s) => s.length >= 6);
}

function buildPackageSearchIndex(
  customerName: string,
  slCode: string | undefined,
  trackingNumber: string
): { searchTokens: string[]; trackingSuffixes: string[] } {
  const tokens = new Set<string>([
    ...generateSearchTokens(customerName),
    ...(slCode ? generateSearchTokens(slCode) : []),
  ]);
  return {
    searchTokens: [...tokens],
    trackingSuffixes: trackingNumber ? generateTrackingSuffixes(trackingNumber) : [],
  };
}

interface ListPackagesRequest {
  page?: number;
  limit?: number;
  sortOrder?: "asc" | "desc";
  q?: string;
  status?: string;
}

interface CreatePackageRequest {
  trackingNumber: string;
  customerId?: string;
  customerName: string;
  weight: number;
  origin?: string;
  destination?: string;
  description: string;
  type: string;
  category?: string;
  branch?: string;
  slCode?: string;
}

interface UpdatePackageRequest {
  packageId: string;
  status?: string;
  weight?: number;
  destination?: string;
  description?: string;
  invoiceId?: string;
  invoiceReady?: boolean;
  customerName?: string;
  slCode?: string;
  trackingNumber?: string;
  [key: string]: unknown;
}

export const slListPackages = onCall(
  { cors: true },
  async (request: CallableRequest<ListPackagesRequest>) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { page = 1, limit = 20, sortOrder = "desc", q, status } = request.data || {};

    const mapDoc = (doc: FirebaseFirestore.DocumentSnapshot) => {
      const data = doc.data() || {};
      return {
        id: doc.id,
        trackingNumber: data.trackingNumber || data.tracking || data.trackingId || doc.id,
        customerId: data.customerId,
        customerName: data.customerName,
        status: data.status,
        weight: data.weight,
        origin: data.origin,
        destination: data.destination,
        description: data.description,
        type: data.type,
        category: data.category,
        slCode: data.slCode,
        invoiceId: data.invoiceId,
        invoiceReady: data.invoiceReady,
        calculatedCost: data.calculatedCost ?? data.cost ?? null,
        costCRC: data.costCRC ?? null,
        exchangeRate: data.exchangeRate ?? null,
        ruta: data.ruta ?? null,
        isConsolidated: data.isConsolidated,
        manifestNumber: data.manifestNumber ?? null,
        flagStatus: data.flagStatus,
        daysInSystem: data.daysInSystem,
        createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
        updatedAt: data.updatedAt?.toDate?.()?.toISOString() || null,
      };
    };

    let packages: ReturnType<typeof mapDoc>[] = [];

    if (q) {
      const seenIds = new Set<string>();
      const qUpper = q.toUpperCase();
      const qLower = q.toLowerCase();

      const addSnap = (snap: FirebaseFirestore.QuerySnapshot) => {
        snap.docs.forEach((doc) => {
          if (!seenIds.has(doc.id)) {
            seenIds.add(doc.id);
            packages.push(mapDoc(doc));
          }
        });
      };
      const addDocSnap = (docSnap: FirebaseFirestore.DocumentSnapshot) => {
        if (docSnap.exists && !seenIds.has(docSnap.id)) {
          seenIds.add(docSnap.id);
          packages.push(mapDoc(docSnap));
        }
      };

      const isSlCode = /^SL\d+$/i.test(q);
      const isTrackingLike = /^[A-Z0-9]{4,}$/i.test(q.replace(/[-\s]/g, ""));

      // ── 1. Direct doc ID lookup (Nova stores tracking# as doc ID) ────────────
      const idSnaps = await Promise.all(
        [...new Set([qUpper, q, qLower])].map((v) =>
          db.collection("packages").doc(v).get()
        )
      );
      idSnaps.forEach(addDocSnap);

      // ── 2. Smart index-based fan-out (parallel, no collection scan) ──────────
      const indexPromises: Promise<void>[] = [];

      if (isSlCode) {
        // Exact slCode match
        indexPromises.push(
          db.collection("packages")
            .where("slCode", "==", qUpper)
            .orderBy("createdAt", "desc")
            .limit(100)
            .get()
            .then(addSnap)
        );
      } else if (isTrackingLike) {
        // trackingSuffixes index — partial/barcode matching (replaces 500-doc scan)
        indexPromises.push(
          db.collection("packages")
            .where("trackingSuffixes", "array-contains", qUpper)
            .orderBy("createdAt", "desc")
            .limit(100)
            .get()
            .then(addSnap)
        );
        // trackingNumber prefix range
        indexPromises.push(
          db.collection("packages")
            .where("trackingNumber", ">=", qUpper)
            .where("trackingNumber", "<", qUpper + "\uf8ff")
            .limit(30)
            .get()
            .then(addSnap)
        );
        // slCode range
        indexPromises.push(
          db.collection("packages")
            .where("slCode", ">=", qUpper)
            .where("slCode", "<", qUpper + "\uf8ff")
            .limit(30)
            .get()
            .then(addSnap)
        );
        // Exact field matches for tracking, trackingId fields
        for (const field of ["tracking", "trackingId"]) {
          for (const v of [qUpper, q, qLower]) {
            indexPromises.push(
              db.collection("packages")
                .where(field, "==", v)
                .limit(10)
                .get()
                .then(addSnap)
            );
          }
        }
      } else {
        // Name search via searchTokens prefix tokens (replaces 500-doc scan)
        const qNorm = qLower
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "");
        indexPromises.push(
          db.collection("packages")
            .where("searchTokens", "array-contains", qNorm)
            .orderBy("createdAt", "desc")
            .limit(100)
            .get()
            .then(addSnap)
        );
        // slCode range fallback
        indexPromises.push(
          db.collection("packages")
            .where("slCode", ">=", qUpper)
            .where("slCode", "<", qUpper + "\uf8ff")
            .limit(30)
            .get()
            .then(addSnap)
        );
      }

      await Promise.allSettled(indexPromises);
    } else {
      // ── No search query: paginated list ─────────────────────────────────────
      let listQuery: FirebaseFirestore.Query = db.collection("packages")
        .orderBy("createdAt", "desc")
        .limit(500);
      if (status) {
        listQuery = db.collection("packages")
          .where("status", "==", status)
          .orderBy("createdAt", "desc")
          .limit(500);
      }
      const snapshot = await listQuery.get();
      packages = snapshot.docs.map(mapDoc);
    }

    packages.sort((a, b) => {
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return sortOrder === "asc" ? aTime - bTime : bTime - aTime;
    });

    const total = packages.length;
    const offset = (page - 1) * limit;
    const paginated = packages.slice(offset, offset + limit);

    return {
      success: true,
      data: paginated,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }
);

export const slGetPackage = onCall(
  { cors: true },
  async (request: CallableRequest<{ packageId: string }>) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { packageId } = request.data;
    if (!packageId) {
      throw new HttpsError("invalid-argument", "Package ID is required");
    }

    const packageDoc = await db.collection("packages").doc(packageId).get();

    if (!packageDoc.exists) {
      throw new HttpsError("not-found", "Package not found");
    }

    const data = packageDoc.data();

    const historySnapshot = await db.collection("packages")
      .doc(packageId)
      .collection("trackingHistory")
      .orderBy("createdAt", "desc")
      .get();

    const trackingHistory = historySnapshot.docs.map((doc) => {
      const histData = doc.data();
      return {
        id: doc.id,
        status: histData.status,
        location: histData.location,
        notes: histData.notes,
        createdAt: histData.createdAt?.toDate?.()?.toISOString() || null,
      };
    });

    return {
      success: true,
      data: {
        id: packageDoc.id,
        ...data,
        trackingHistory,
        createdAt: data?.createdAt?.toDate?.()?.toISOString() || null,
        updatedAt: data?.updatedAt?.toDate?.()?.toISOString() || null,
      },
    };
  }
);

export const slGetPackageByTracking = onCall(
  { cors: true },
  async (request: CallableRequest<{ tracking: string }>) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { tracking } = request.data;
    if (!tracking) {
      throw new HttpsError("invalid-argument", "Tracking number is required");
    }

    const snapshot = await db.collection("packages")
      .where("trackingNumber", "==", tracking)
      .limit(1)
      .get();

    if (snapshot.empty) {
      throw new HttpsError("not-found", "Package not found");
    }

    const doc = snapshot.docs[0];
    const data = doc.data();
    return {
      success: true,
      data: {
        id: doc.id,
        ...data,
        createdAt: data?.createdAt?.toDate?.()?.toISOString() || null,
        updatedAt: data?.updatedAt?.toDate?.()?.toISOString() || null,
      },
    };
  }
);

export const slCreatePackage = onCall(
  { cors: true },
  async (request: CallableRequest<CreatePackageRequest>) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const data = request.data;

    if (!data.trackingNumber || !data.customerName) {
      throw new HttpsError("invalid-argument", "trackingNumber and customerName are required");
    }

    const existingTracking = await db.collection("packages")
      .where("trackingNumber", "==", data.trackingNumber)
      .limit(1)
      .get();

    if (!existingTracking.empty) {
      throw new HttpsError("already-exists", "A package with this tracking number already exists");
    }

    const now = admin.firestore.FieldValue.serverTimestamp();
    const packageRef = db.collection("packages").doc();

    const packageData = {
      id: packageRef.id,
      trackingNumber: data.trackingNumber,
      customerId: data.customerId || null,
      customerName: data.customerName,
      status: "pending",
      weight: data.weight,
      origin: data.origin || null,
      destination: data.destination || null,
      routeId: null,
      description: data.description,
      guideId: null,
      consolidatedId: null,
      isConsolidated: false,
      calculatedCost: null,
      costCalculationDate: null,
      type: data.type,
      category: data.category || "regular",
      branch: data.branch || "other",
      flagStatus: "normal",
      daysInSystem: 0,
      manifestNumber: null,
      invoiceId: null,
      invoiceReady: false,
      invoicePdfUrl: null,
      slCode: data.slCode || null,
      createdAt: now,
      updatedAt: now,
      createdBy: request.auth.uid,
    };

    const searchIndex = buildPackageSearchIndex(
      data.customerName,
      data.slCode,
      data.trackingNumber
    );

    await packageRef.set({ ...packageData, ...searchIndex });

    await packageRef.collection("trackingHistory").add({
      status: "pending",
      location: data.origin || "Origin",
      notes: "Package created",
      createdAt: now,
    });

    return {
      success: true,
      data: {
        ...packageData,
        id: packageRef.id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    };
  }
);

export const slUpdatePackage = onCall(
  { cors: true },
  async (request: CallableRequest<UpdatePackageRequest>) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { packageId, ...updateFields } = request.data;
    if (!packageId) {
      throw new HttpsError("invalid-argument", "Package ID is required");
    }

    const packageDoc = await db.collection("packages").doc(packageId).get();
    if (!packageDoc.exists) {
      throw new HttpsError("not-found", "Package not found");
    }

    const currentData = packageDoc.data();
    const now = admin.firestore.FieldValue.serverTimestamp();

    const updateData: Record<string, unknown> = {
      ...updateFields,
      updatedAt: now,
    };

    // Rebuild search index when customer name, slCode, or trackingNumber changes
    const needsReindex =
      updateFields.customerName != null ||
      updateFields.slCode != null ||
      updateFields.trackingNumber != null;
    if (needsReindex) {
      const newName = (updateFields.customerName as string) ?? currentData?.customerName ?? "";
      const newSlCode = (updateFields.slCode as string | undefined) ?? currentData?.slCode;
      const newTracking = (updateFields.trackingNumber as string) ?? currentData?.trackingNumber ?? "";
      const idx = buildPackageSearchIndex(newName, newSlCode, newTracking);
      updateData.searchTokens = idx.searchTokens;
      updateData.trackingSuffixes = idx.trackingSuffixes;
    }

    await db.collection("packages").doc(packageId).update(updateData);

    const slCodeChanged = updateFields.slCode !== undefined && updateFields.slCode !== currentData?.slCode;
    const statusChanged = updateFields.status !== undefined && updateFields.status !== currentData?.status;

    // Log admin audit event for tracing package edits/reassignments
    try {
      const token = request.auth.token as Record<string, unknown> | undefined;
      const callerRole = (token?.role as string) ?? "";
      const callerEmail = (token?.email as string) ?? "";
      const callerName = (token?.name as string) ?? callerEmail ?? "";

      await db.collection("audit_logs").add({
        userId: request.auth.uid,
        userName: callerName,
        userEmail: callerEmail,
        userRole: callerRole,
        action: slCodeChanged ? "package_reassigned" : "package_updated",
        category: "package",
        resource: "package",
        resourceId: packageId,
        result: "success",
        source: "server",
        metadata: {
          trackingNumber: (updateFields.trackingNumber as string | undefined) ?? currentData?.trackingNumber ?? currentData?.tracking ?? "",
          slCodeChanged,
          oldSlCode: currentData?.slCode || "",
          newSlCode: updateFields.slCode || "",
          updateFields,
        },
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (auditErr: any) {
      logger.warn("[slUpdatePackage] Non-blocking audit logging failed", { error: auditErr.message });
    }

    if (statusChanged) {
      await db.collection("packages").doc(packageId).collection("trackingHistory").add({
        status: updateFields.status,
        location: currentData?.destination || "Unknown",
        notes: `Status changed from ${currentData?.status} to ${updateFields.status}`,
        createdAt: now,
        updatedBy: request.auth.uid,
      });
    }

    if (slCodeChanged || statusChanged) {
      // Push to SP2 automatically (fire-and-forget)
      pushStatusToSP2({
        trackingNumber: (updateFields.trackingNumber as string | undefined) ?? currentData?.trackingNumber ?? currentData?.tracking ?? packageId,
        slCode:         (updateFields.slCode as string | undefined) ?? currentData?.slCode,
        status:         (updateFields.status as string | undefined) ?? currentData?.status ?? 'received',
        weight:         (updateFields.weight as number | undefined) ?? currentData?.weight,
        description:    (updateFields.description as string | undefined) ?? currentData?.description,
        ruta:           (updateFields.ruta as string | undefined) ?? currentData?.ruta,
        manifestNumber: (updateFields.manifestNumber as string | undefined) ?? currentData?.manifestNumber,
        requiresPermit: (updateFields.requiresPermit as boolean | undefined) ?? currentData?.requiresPermit,
        calculatedCost: (updateFields.calculatedCost as number | undefined) ?? currentData?.calculatedCost,
        cost:           (updateFields.cost as number | undefined) ?? currentData?.cost,
        currency:       (updateFields.currency as string | undefined) ?? currentData?.currency,
        forceSync:      slCodeChanged ? true : undefined,
        allowCreate:    slCodeChanged ? true : undefined,
      });
    }

    return { success: true, id: packageId, ...updateFields };
  }
);

export const slUpdatePackageStatus = onCall(
  { cors: true },
  async (
    request: CallableRequest<{
      packageId: string;
      status: string;
      location?: string;
      notes?: string;
      deliverySignature?: string;
      paymentCollected?: boolean;
    }>
  ) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { packageId, status, location, notes, deliverySignature, paymentCollected } = request.data;

    if (!packageId || !status) {
      throw new HttpsError("invalid-argument", "packageId and status are required");
    }

    const packageDoc = await db.collection("packages").doc(packageId).get();
    if (!packageDoc.exists) {
      throw new HttpsError("not-found", "Package not found");
    }

    const currentData = packageDoc.data();
    const now = admin.firestore.FieldValue.serverTimestamp();

    const updateData: Record<string, any> = {
      status,
      updatedAt: now,
    };

    if (deliverySignature) {
      updateData.deliverySignature = deliverySignature;
      updateData.deliverySignedAt = new Date().toISOString();
    }

    if (paymentCollected !== undefined) {
      updateData.paymentCollected = paymentCollected;
      if (paymentCollected) {
        updateData.paymentCollectedAt = new Date().toISOString();
      }
    }

    await db.collection("packages").doc(packageId).update(updateData);

    await db.collection("packages").doc(packageId).collection("trackingHistory").add({
      status,
      location: location || currentData?.destination || "Unknown",
      notes: notes || `Status changed to ${status}`,
      createdAt: now,
      updatedBy: request.auth.uid,
    });

    // Push to SP2 automatically (fire-and-forget)
    pushStatusToSP2({
      trackingNumber: currentData?.trackingNumber ?? currentData?.tracking ?? packageId,
      slCode:         currentData?.slCode,
      status,
      weight:         currentData?.weight,
      description:    currentData?.description,
      ruta:           currentData?.ruta,
      manifestNumber: currentData?.manifestNumber,
      requiresPermit: currentData?.requiresPermit,
      calculatedCost: currentData?.calculatedCost,
      cost:           currentData?.cost,
      currency:       currentData?.currency,
    });

    return { success: true, packageId, status };
  }
);

export const slDeletePackage = onCall(
  { cors: true },
  async (request: CallableRequest<{ packageId: string }>) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const callerRole = request.auth.token.role as string;
    if (!["SUPER_ADMIN", "ADMIN"].includes(callerRole)) {
      throw new HttpsError("permission-denied", "Admin access required");
    }

    const { packageId } = request.data;
    if (!packageId) {
      throw new HttpsError("invalid-argument", "Package ID is required");
    }

    const packageDoc = await db.collection("packages").doc(packageId).get();
    if (!packageDoc.exists) {
      throw new HttpsError("not-found", "Package not found");
    }

    await db.collection("packages").doc(packageId).update({
      status: "cancelled",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { success: true, id: packageId };
  }
);
