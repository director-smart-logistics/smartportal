import { onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { db, admin } from "../config/firebase";
import { getFirestore, FieldPath } from "firebase-admin/firestore";
import { initializeApp, getApps } from "firebase-admin/app";

// SP2 Firebase project configuration
const SP2_PROJECT_ID = "smart-portal-2";
let sp2Db: FirebaseFirestore.Firestore | null = null;

function getSp2Firestore(): FirebaseFirestore.Firestore {
  if (sp2Db) return sp2Db;
  const sp2AppName = "smart-portal-2-invoices";
  const existingApp = getApps().find(app => app.name === sp2AppName);
  if (existingApp) {
    sp2Db = getFirestore(existingApp);
  } else {
    const sp2App = initializeApp({ projectId: SP2_PROJECT_ID }, sp2AppName);
    sp2Db = getFirestore(sp2App);
  }
  return sp2Db;
}

// ── SP2 invoice status sync helper (fire-and-forget) ─────────────────────────
// Calls slSyncInvoicesFromSp1 in SP2 which maps invoice status → shipment status
// (sent→processed/Facturado, paid→route/En Ruta) and updates all linked shipments.
function pushInvoiceStatusToSP2(inv: Record<string, any>, invoiceId: string): void {
  const url    = process.env.SP2_INVOICE_SYNC_URL ||
                 'https://us-central1-smart-portal-2.cloudfunctions.net/slSyncInvoicesFromSp1';
  const secret = process.env.SP2_SYNC_SECRET || '';
  if (!secret) return;

  const status = String(inv.status || 'draft').toLowerCase();
  const isExcluded = ["draft", "annulled", "cancelled", "void"].includes(status);

  const payload = isExcluded ? {
    id:              invoiceId,
    invoiceNumber:   inv.invoiceNumber || invoiceId,
    slCode:          String(inv.slCode || inv.clientSlCode || "").trim(),
    clientName:      inv.clientName || "",
    status:          "deleted",
    amount:          0,
    subtotal:        0,
    deleted:         true,
  } : {
    id:              invoiceId,
    invoiceNumber:   inv.invoiceNumber || '',
    slCode:          String(inv.slCode || inv.clientSlCode || inv.customerId || '').trim(),
    clientName:      inv.clientName   || '',
    clientEmail:     inv.clientEmail  || '',
    status:          inv.status       || 'paid',
    amount:          inv.amount       ?? inv.totalAmount    ?? 0,
    subtotal:        inv.subtotal     ?? inv.subtotalAmount ?? 0,
    iva:             inv.iva          ?? inv.taxAmount      ?? 0,
    ivaRate:         inv.ivaRate      ?? 0,
    ivaEnabled:      inv.ivaEnabled   ?? false,
    currency:        inv.currency     || 'USD',
    exchangeRate:    inv.exchangeRate  ?? null,
    amountCRC:       inv.amountCRC    ?? null,
    trackingNumber:  inv.trackingNumber  || null,
    trackingNumbers: inv.trackingNumbers || null,
    isConsolidation: inv.isConsolidation ?? false,
    manifestNumber:  inv.manifestNumber  || null,
    manifestNumbers: inv.manifestNumbers || null,
    invoiceItems:    inv.invoiceItems    || inv.items || [],
    packageCount:    inv.packageCount    ?? null,
    invoiceDate:     inv.invoiceDate     || null,
    notes:           inv.notes           || null,
  };

  fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'x-sync-secret': secret },
    body:    JSON.stringify({ invoices: [payload] }),
  }).catch((err: Error) => {
    logger.warn('[pushInvoiceStatusToSP2] Non-blocking sync error', { error: err.message });
  });
}

function generateInvoiceNumber(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, "0");
  return `INV-${year}${month}-${random}`;
}

interface ListInvoicesRequest {
  page?: number;
  limit?: number;
  sortOrder?: "asc" | "desc";
  q?: string;
  status?: string;
}

interface InvoiceItem {
  packageId?: string;
  description?: string;
  quantity?: number;
  unitPrice?: number;
  /** Nova-format: amount is used when unitPrice is absent */
  amount?: number;
  subtotal?: number;
  weight?: number;
  [key: string]: unknown;
}

interface CreateInvoiceRequest {
  customerId: string;
  items: InvoiceItem[];
  taxRate?: number;
  discountPercentage?: number;
  currency?: string;
  dueDate?: string;
  notes?: string;
}

interface UpdateInvoiceRequest {
  invoiceId: string;
  status?: string;
  notes?: string;
  internalNotes?: string;
  paymentMethod?: string;
  paymentReference?: string;
  currency?: string;
  dueDate?: string;
  discountPercentage?: number;
  items?: InvoiceItem[];
  clientName?: string;
  clientEmail?: string;
  clientPhone?: string;
  clientDni?: string;
  manifestNumber?: string;
  origin?: string;
  destination?: string;
}

export const slListInvoices = onCall(
  { cors: true },
  async (request: CallableRequest<ListInvoicesRequest>) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { page = 1, limit = 20, sortOrder = "desc", q, status } = request.data || {};

    let query: FirebaseFirestore.Query = db.collection("invoices").orderBy("createdAt", "desc");

    if (status) {
      query = query.where("status", "==", status);
    }

    query = query.limit(500);

    const snapshot = await query.get();

    let invoices = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        invoiceNumber: data.invoiceNumber,
        customerId: data.customerId,
        status: data.status,
        totalAmount: data.totalAmount,
        subtotalAmount: data.subtotalAmount,
        taxAmount: data.taxAmount,
        currency: data.currency,
        invoiceDate: data.invoiceDate?.toDate?.()?.toISOString() || null,
        dueDate: data.dueDate?.toDate?.()?.toISOString() || null,
        paidAt: data.paidAt?.toDate?.()?.toISOString() || null,
        pdfUrl: data.pdfUrl,
        clientSlCode: data.clientSlCode,
        clientEmail: data.clientEmail,
        createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
      };
    });

    if (q) {
      const searchLower = q.toLowerCase();
      invoices = invoices.filter((inv) =>
        inv.invoiceNumber?.toLowerCase().includes(searchLower) ||
        inv.clientSlCode?.toLowerCase().includes(searchLower) ||
        inv.clientEmail?.toLowerCase().includes(searchLower)
      );
    }

    invoices.sort((a, b) => {
      const aTime = a.invoiceDate ? new Date(a.invoiceDate).getTime() : (a.createdAt ? new Date(a.createdAt).getTime() : 0);
      const bTime = b.invoiceDate ? new Date(b.invoiceDate).getTime() : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
      return sortOrder === "asc" ? aTime - bTime : bTime - aTime;
    });

    const total = invoices.length;
    const offset = (page - 1) * limit;
    const paginated = invoices.slice(offset, offset + limit);

    return {
      success: true,
      data: paginated,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }
);

export const slGetInvoice = onCall(
  { cors: true },
  async (request: CallableRequest<{ invoiceId: string }>) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { invoiceId } = request.data;
    if (!invoiceId) {
      throw new HttpsError("invalid-argument", "Invoice ID is required");
    }

    const invoiceDoc = await db.collection("invoices").doc(invoiceId).get();

    if (!invoiceDoc.exists) {
      // Diagnostic: surface the ID + DB id to distinguish "wrong DB" vs
      // "wrong id" vs "doc was just deleted" failure modes.
      logger.warn("[slGetInvoice] Invoice not found", {
        invoiceId,
        invoiceIdLength: invoiceId.length,
        databaseId: (db as any)?._databaseId?.database || "unknown",
        callerUid: request.auth.uid,
      });
      throw new HttpsError("not-found", "Invoice not found");
    }

    const data = invoiceDoc.data();

    const itemsSnapshot = await db.collection("invoices")
      .doc(invoiceId)
      .collection("items")
      .get();

    const items = await Promise.all(
      itemsSnapshot.docs.map(async (doc) => {
        const itemData = doc.data();
        let packageData: Record<string, any> | null = null;
        if (itemData.packageId) {
          try {
            const pkgDoc = await db.collection("packages").doc(itemData.packageId).get();
            if (pkgDoc.exists) {
              const pkg = pkgDoc.data() || {};
              packageData = {
                trackingNumber: pkg.trackingNumber || null,
                weight: pkg.weight || null,
                exchangeRate: pkg.exchangeRate || null,
                costCRC: pkg.costCRC || null,
                price: pkg.price || null,
                ruta: pkg.ruta || null,
                description: pkg.description || null,
              };
            }
          } catch {
            // Package fetch failure is non-fatal — item still returned without enrichment
          }
        }
        return {
          id: doc.id,
          ...itemData,
          ...(packageData ? { package: packageData } : {}),
          createdAt: itemData.createdAt?.toDate?.()?.toISOString() || null,
        };
      })
    );

    return {
      success: true,
      data: {
        id: invoiceDoc.id,
        ...data,
        items,
        invoiceDate: data?.invoiceDate?.toDate?.()?.toISOString() || null,
        dueDate: data?.dueDate?.toDate?.()?.toISOString() || null,
        sentAt: data?.sentAt?.toDate?.()?.toISOString() || null,
        paidAt: data?.paidAt?.toDate?.()?.toISOString() || null,
        createdAt: data?.createdAt?.toDate?.()?.toISOString() || null,
        updatedAt: data?.updatedAt?.toDate?.()?.toISOString() || null,
      },
    };
  }
);

export const slCreateInvoice = onCall(
  { cors: true },
  async (request: CallableRequest<CreateInvoiceRequest>) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const data = request.data;

    if (!data.customerId || !data.items || data.items.length === 0) {
      throw new HttpsError("invalid-argument", "customerId and items are required");
    }

    const customerDoc = await db.collection("customers").doc(data.customerId).get();
    if (!customerDoc.exists) {
      throw new HttpsError("not-found", "Customer not found");
    }
    const customerData = customerDoc.data();

    const invoiceNumber = generateInvoiceNumber();

    let subtotal = 0;
    const processedItems = data.items.map((item, index) => {
      const unitPrice = item.unitPrice ?? item.amount ?? 0;
      const qty = item.quantity ?? 1;
      const totalPrice = Math.round(qty * unitPrice * 100) / 100;
      subtotal += totalPrice;
      return {
        id: `item-${index}-${Date.now()}`,
        packageId: item.packageId || null,
        description: item.description || `Item ${index + 1}`,
        quantity: qty,
        unitPrice,
        totalPrice,
        weight: item.weight || null,
      };
    });

    const discountAmount = data.discountPercentage
      ? (subtotal * data.discountPercentage) / 100
      : 0;

    const taxableAmount = subtotal - discountAmount;
    const taxAmount = taxableAmount * (data.taxRate || 0);
    const totalAmount = taxableAmount + taxAmount;

    const now = admin.firestore.FieldValue.serverTimestamp();
    const invoiceRef = db.collection("invoices").doc();

    const dueDate = data.dueDate
      ? admin.firestore.Timestamp.fromDate(new Date(data.dueDate))
      : admin.firestore.Timestamp.fromDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));

    const invoiceData = {
      id: invoiceRef.id,
      customerId: data.customerId,
      invoiceNumber,
      status: "draft",
      totalAmount,
      subtotalAmount: subtotal,
      taxAmount,
      taxRate: data.taxRate || 0,
      discountAmount,
      discountPercentage: data.discountPercentage || 0,
      currency: data.currency || "USD",
      exchangeRate: null,
      invoiceDate: now,
      dueDate,
      sentAt: null,
      paidAt: null,
      notes: data.notes || null,
      internalNotes: null,
      pdfUrl: null,
      pdfPath: null,
      clientSlCode: customerData?.slCode || null,
      clientEmail: customerData?.email || null,
      clientDni: customerData?.dni || null,
      clientPhone: customerData?.phone || null,
      paymentMethod: null,
      paymentReference: null,
      createdAt: now,
      updatedAt: now,
      createdBy: request.auth.uid,
    };

    await invoiceRef.set(invoiceData);

    const batch = db.batch();
    processedItems.forEach((item) => {
      const itemRef = invoiceRef.collection("items").doc();
      batch.set(itemRef, {
        ...item,
        id: itemRef.id,
        invoiceId: invoiceRef.id,
        createdAt: now,
      });
    });
    await batch.commit();

    return {
      success: true,
      data: {
        ...invoiceData,
        id: invoiceRef.id,
        invoiceNumber,
        items: processedItems,
        invoiceDate: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    };
  }
);

export const slUpdateInvoice = onCall(
  { cors: true },
  async (request: CallableRequest<UpdateInvoiceRequest>) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { invoiceId, items, discountPercentage, dueDate, ...scalarFields } = request.data;
    if (!invoiceId) {
      throw new HttpsError("invalid-argument", "Invoice ID is required");
    }

    const invoiceRef = db.collection("invoices").doc(invoiceId);
    const invoiceDoc = await invoiceRef.get();
    if (!invoiceDoc.exists) {
      throw new HttpsError("not-found", "Invoice not found");
    }

    const existing = invoiceDoc.data() || {};

    // Permanence guard for annulled invoices: block active status transitions.
    const existingStatus = String(existing.status || "draft").toLowerCase();
    const isAnnulledStatus = ["annulled", "cancelled", "void"].includes(existingStatus);
    if (isAnnulledStatus && scalarFields.status !== undefined) {
      const targetStatus = String(scalarFields.status).toLowerCase();
      if (targetStatus !== "draft") {
        throw new HttpsError(
          "failed-precondition",
          "Cannot update status of an annulled/cancelled/void invoice unless reactivating to draft."
        );
      }
    }

    const now = admin.firestore.FieldValue.serverTimestamp();

    const updateData: Record<string, unknown> = {
      ...scalarFields,
      updatedAt: now,
    };

    // Due date
    if (dueDate !== undefined) {
      updateData.dueDate = dueDate
        ? admin.firestore.Timestamp.fromDate(new Date(dueDate))
        : null;
    }

    // Status side-effects
    if (scalarFields.status === "paid") updateData.paidAt = now;
    if (scalarFields.status === "sent") updateData.sentAt = now;

    // Recalculate totals when items or discount changes
    if (items !== undefined || discountPercentage !== undefined) {
      const effectiveDiscount = discountPercentage !== undefined ? discountPercentage : (existing.discountPercentage ?? 0);
      const effectiveTaxRate = existing.taxRate ?? 0;

      let subtotal = 0;
      let processedItems: Record<string, unknown>[] = [];

      if (items !== undefined && items.length > 0) {
        processedItems = items.map((item, index) => {
          // Support both SP format (unitPrice/quantity) and Nova format (amount/subtotal)
          const unitPrice = item.unitPrice ?? item.amount ?? item.subtotal ?? 0;
          const qty = item.quantity ?? 1;
          const totalPrice = Math.round(qty * unitPrice * 100) / 100;
          subtotal += totalPrice;
          return {
            packageId: item.packageId || null,
            description: item.description || `Item ${index + 1}`,
            quantity: qty,
            unitPrice: unitPrice,
            totalPrice,
            weight: item.weight || null,
          };
        });

        // Replace subcollection items
        const existingItems = await invoiceRef.collection("items").get();
        const batch = db.batch();
        existingItems.docs.forEach((d) => batch.delete(d.ref));
        processedItems.forEach((item, index) => {
          const itemRef = invoiceRef.collection("items").doc();
          batch.set(itemRef, {
            ...item,
            id: itemRef.id,
            invoiceId,
            createdAt: now,
          });
          processedItems[index] = { ...item, id: `item-${index}` };
        });
        await batch.commit();
      } else {
        // Keep existing items but recalc subtotal from them
        const existingItemsSnap = await invoiceRef.collection("items").get();
        existingItemsSnap.docs.forEach((d) => {
          subtotal += (d.data().totalPrice ?? 0);
        });
      }

      const discountAmount = (subtotal * effectiveDiscount) / 100;
      const taxableAmount = subtotal - discountAmount;
      const taxAmount = taxableAmount * effectiveTaxRate;
      const totalAmount = taxableAmount + taxAmount;

      // Prefer client-provided totals (already computed with IVA/CRC) over recalculated ones
      if (!('subtotalAmount' in updateData)) updateData.subtotalAmount = subtotal;
      updateData.discountPercentage = effectiveDiscount;
      updateData.discountAmount = discountAmount;
      if (!('taxAmount' in updateData)) updateData.taxAmount = taxAmount;
      if (!('totalAmount' in updateData)) updateData.totalAmount = totalAmount;
    }

    await invoiceRef.update(updateData);

    // ── Push to SP2 (fire-and-forget) ─────────────────────────────────────
    // BUG-A FIX 2026-05-15: previously this push ONLY ran on status change,
    // which left SP2 permanently desynced whenever items/totals/tracking
    // were edited (the most common edit case). We now push whenever ANY
    // field that affects what SP2 customers see has changed. The endpoint
    // is idempotent (keyed by sp1 doc.id), so over-syncing is safe.
    //
    // We skip drafts because SP2 explicitly excludes them; pushing a draft
    // would just be a no-op `skipped` outcome and burn quota.
    const itemsChanged   = items !== undefined;
    const totalsChanged  = (
      'totalAmount'    in updateData ||
      'subtotalAmount' in updateData ||
      'taxAmount'      in updateData ||
      'discountAmount' in updateData
    );
    const trackingChanged = (
      'trackingNumber'  in updateData ||
      'trackingNumbers' in updateData ||
      'manifestNumber'  in updateData ||
      'manifestNumbers' in updateData
    );
    const customerChanged = (
      'customerId'   in updateData ||
      'clientSlCode' in updateData ||
      'slCode'       in updateData ||
      'clientName'   in updateData ||
      'clientEmail'  in updateData ||
      'clientPhone'  in updateData ||
      'clientDni'    in updateData
    );
    const statusChanged  = !!scalarFields.status && scalarFields.status !== existing.status;
    const finalStatus    = scalarFields.status ?? existing.status ?? 'draft';

    if (finalStatus !== 'draft' && (statusChanged || itemsChanged || totalsChanged || trackingChanged || customerChanged)) {
      try {
        // Re-fetch the post-update doc so the payload reflects current state.
        // Cheaper than reconstructing the merge logic above and guarantees
        // SP2 sees exactly what SP1 just persisted.
        const refreshed = (await invoiceRef.get()).data() ?? existing;
        pushInvoiceStatusToSP2({ ...refreshed, status: finalStatus }, invoiceId);
        logger.info('[slUpdateInvoice] Pushed to SP2', {
          invoiceId, statusChanged, itemsChanged, totalsChanged, trackingChanged,
        });
      } catch (syncErr: any) {
        logger.warn('[slUpdateInvoice] Non-blocking SP2 sync failed', { error: syncErr.message });
      }
    }

    // Log admin audit event for tracing invoice edits/reassignments
    try {
      const token = request.auth.token as Record<string, unknown> | undefined;
      const callerRole = (token?.role as string) ?? "";
      const callerEmail = (token?.email as string) ?? "";
      const callerName = (token?.name as string) ?? callerEmail ?? "";

      const oldSlCode = (existing.clientSlCode || existing.slCode || "") as string;
      const newSlCode = (((scalarFields as any).clientSlCode || (scalarFields as any).slCode || "") as string).trim().toUpperCase();
      const slCodeChanged = newSlCode !== "" && newSlCode !== oldSlCode.trim().toUpperCase();

      await db.collection("audit_logs").add({
        userId: request.auth.uid,
        userName: callerName,
        userEmail: callerEmail,
        userRole: callerRole,
        action: slCodeChanged ? "invoice_reassigned" : "invoice_updated",
        category: "invoice",
        resource: "invoice",
        resourceId: invoiceId,
        result: "success",
        source: "server",
        metadata: {
          invoiceNumber: existing.invoiceNumber || "",
          slCodeChanged,
          oldSlCode,
          newSlCode,
          scalarFields,
        },
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (auditErr: any) {
      logger.warn("[slUpdateInvoice] Non-blocking audit logging failed", { error: auditErr.message });
    }

    return { success: true, id: invoiceId };
  }
);

export const slMarkInvoicePaid = onCall(
  { cors: true },
  async (request: CallableRequest<{ invoiceId: string; paymentMethod?: string; paymentReference?: string }>) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { invoiceId, paymentMethod, paymentReference } = request.data;

    if (!invoiceId) {
      throw new HttpsError("invalid-argument", "Invoice ID is required");
    }

    const invoiceDoc = await db.collection("invoices").doc(invoiceId).get();
    if (!invoiceDoc.exists) {
      throw new HttpsError("not-found", "Invoice not found");
    }

    const existing = invoiceDoc.data() || {};
    const existingStatus = String(existing.status || "draft").toLowerCase();
    const isAnnulledStatus = ["annulled", "cancelled", "void"].includes(existingStatus);
    if (isAnnulledStatus) {
      throw new HttpsError(
        "failed-precondition",
        "Cannot mark an annulled/cancelled/void invoice as paid. Reactivate it to draft status first."
      );
    }

    const now = admin.firestore.FieldValue.serverTimestamp();

    await db.collection("invoices").doc(invoiceId).update({
      status: "paid",
      paidAt: now,
      paymentMethod: paymentMethod || null,
      paymentReference: paymentReference || null,
      updatedAt: now,
    });

    // ── Sync 'paid' status to SP2 via invoice sync endpoint ──────────────────
    // slSyncInvoicesFromSp1 in SP2 maps paid → route and updates all shipments.
    try {
      const inv = invoiceDoc.data()!;
      // Stamp the final paid status on the payload before pushing
      pushInvoiceStatusToSP2({ ...inv, status: 'paid' }, invoiceId);
      logger.info('[slMarkInvoicePaid] Invoice status pushed to SP2', { invoiceId });
    } catch (syncErr: any) {
      logger.warn('[slMarkInvoicePaid] Non-blocking SP2 sync failed', {
        error: syncErr.message,
      });
    }

    return { success: true, invoiceId, status: "paid" };
  }
);

export const slDeleteInvoice = onCall(
  { cors: true },
  async (request: CallableRequest<{ invoiceId: string }>) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const callerRole = request.auth.token.role as string;
    if (!["SUPER_ADMIN", "ADMIN"].includes(callerRole)) {
      throw new HttpsError("permission-denied", "Admin access required");
    }

    const { invoiceId } = request.data;
    if (!invoiceId) {
      throw new HttpsError("invalid-argument", "Invoice ID is required");
    }

    const invoiceDoc = await db.collection("invoices").doc(invoiceId).get();
    if (!invoiceDoc.exists) {
      throw new HttpsError("not-found", "Invoice not found");
    }

    const invoiceData = invoiceDoc.data();
    if (invoiceData?.status === "paid") {
      throw new HttpsError("failed-precondition", "Cannot delete a paid invoice");
    }

    await db.collection("invoices").doc(invoiceId).update({
      status: "cancelled",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Push cancellation to SP2 (fire-and-forget)
    try {
      pushInvoiceStatusToSP2({ ...invoiceData, status: 'cancelled' }, invoiceId);
    } catch (syncErr: any) {
      logger.warn('[slDeleteInvoice] Non-blocking SP2 sync failed', { error: syncErr.message });
    }

    return { success: true, id: invoiceId };
  }
);

interface VerifyInvoicesSyncRequest {
  days?: number; // Check last N days (default 60)
}

export const slVerifyInvoicesSync = onCall(
  { cors: true },
  async (request: CallableRequest<VerifyInvoicesSyncRequest>) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }
    const callerRole = request.auth.token.role as string;
    if (!["SUPER_ADMIN", "ADMIN", "MANAGER"].includes(callerRole)) {
      throw new HttpsError("permission-denied", "Admin or Manager access required");
    }

    const { days = 60 } = request.data || {};
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - days);

    // 1. Fetch SP1 Invoices
    const sp1InvoicesSnap = await db.collection("invoices")
      .where("createdAt", ">=", admin.firestore.Timestamp.fromDate(sinceDate))
      .get();

    // Filter only active statuses that SHOULD be in SP2 (excludes draft, annulled, cancelled, void)
    const sp1Syncable = sp1InvoicesSnap.docs
      .map(doc => ({ id: doc.id, ...(doc.data() as any) }))
      .filter((inv: any) => inv.status && !["draft", "annulled", "cancelled", "void"].includes(inv.status));

    if (sp1Syncable.length === 0) {
      return { success: true, data: { unsynced: [], missingSlCode: [] } };
    }

    const missingSlCode: any[] = [];
    const eligibleForSp2: any[] = [];

    const isOrphanSlCode = (slCode: string | null | undefined): boolean => {
      if (!slCode) return true;
      return !/^SL\d+$/i.test(slCode.trim());
    };

    for (const inv of sp1Syncable) {
      const code = (inv.slCode || inv.clientSlCode || '').trim();
      if (!code) {
        missingSlCode.push(inv);
      } else if (isOrphanSlCode(code)) {
        missingSlCode.push({ ...inv, _syncError: 'ORPHAN_SL_CODE' });
      } else {
        eligibleForSp2.push(inv);
      }
    }

    // 2. Fetch SP2 Invoices in batches of 30 (Firestore IN query limit)
    const sp2Firestore = getSp2Firestore();
    const unsynced: any[] = [];
    
    const BATCH_SIZE = 30;
    for (let i = 0; i < eligibleForSp2.length; i += BATCH_SIZE) {
      const batch = eligibleForSp2.slice(i, i + BATCH_SIZE);
      const batchIds = batch.map(inv => inv.id);
      
      try {
        const sp2Snap = await sp2Firestore.collection("invoices")
          .where(FieldPath.documentId(), "in", batchIds)
          .get();
        
        const sp2Docs = new Map();
        sp2Snap.docs.forEach(doc => sp2Docs.set(doc.id, doc.data()));

        // Compare
        for (const sp1Inv of batch) {
          const sp2Inv = sp2Docs.get(sp1Inv.id);
          if (!sp2Inv) {
            // Missing entirely in SP2
            unsynced.push({ ...sp1Inv, _syncError: "MISSING_IN_SP2" });
          } else if (sp2Inv.status === "draft") {
            // It's in SP2 but stuck as draft
            unsynced.push({ ...sp1Inv, _syncError: "SP2_IS_DRAFT" });
          }
        }
      } catch (err) {
        logger.error("[slVerifyInvoicesSync] Error fetching from SP2", err);
        throw new HttpsError("internal", "Error comunicándose con SmartWeb (SP2).");
      }
    }

    const mapForUi = (inv: any) => ({
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      status: inv.status,
      clientSlCode: inv.slCode || inv.clientSlCode || "",
      clientName: inv.clientName || "",
      createdAt: inv.createdAt?.toDate?.()?.toISOString() || null,
      _syncError: inv._syncError,
    });

    return {
      success: true,
      data: {
        unsynced: unsynced.map(mapForUi),
        missingSlCode: missingSlCode.map(mapForUi),
      }
    };
  }
);
