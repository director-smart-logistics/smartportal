import { onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import { FieldValue } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { db } from "../config/firebase";

// ============================================
// Types
// ============================================

interface CreateLabelRequest {
  customerId: string;
  customerName: string;
  customerSlCode: string;
  recipientName: string;
  recipientAddress: string;
  recipientCity: string;
  recipientCountry?: string;
  recipientPhone?: string;
  packageIds: string[];
  deliveryMethod: "home_delivery" | "pickup" | "route";
  routeId?: string;
  routeName?: string;
  notes?: string;
  deliveryInstructions?: string;
}

interface ListLabelsRequest {
  page?: number;
  limit?: number;
  status?: string;
  customerId?: string;
  customerSlCode?: string;
  routeId?: string;
  dateFrom?: string;
  dateTo?: string;
  q?: string;
}

interface UpdateLabelStatusRequest {
  labelId: string;
  status: "pending" | "printed" | "in_transit" | "delivered" | "cancelled";
  notes?: string;
}

interface CancelLabelRequest {
  labelId: string;
  reason: string;
}

// ============================================
// Helper Functions
// ============================================

function generateLabelNumber(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const timestamp = now.getTime();
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, "0");
  
  return `LABEL-${year}${month}${day}-${timestamp}-${random}`;
}

function generateSearchTokens(data: {
  customerName: string;
  customerSlCode: string;
  labelNumber: string;
  trackingNumbers: string[];
}): string[] {
  const tokens = new Set<string>();
  
  // Customer name tokens
  const nameParts = data.customerName.toLowerCase().split(/\s+/);
  nameParts.forEach((part) => {
    if (part.length >= 2) {
      tokens.add(part);
      // Add prefixes
      for (let i = 2; i <= part.length; i++) {
        tokens.add(part.substring(0, i));
      }
    }
  });
  
  // SL Code
  tokens.add(data.customerSlCode.toLowerCase());
  
  // Label number
  tokens.add(data.labelNumber.toLowerCase());
  
  // Tracking numbers
  data.trackingNumbers.forEach((tracking) => {
    tokens.add(tracking.toLowerCase());
  });
  
  return Array.from(tokens);
}

// ============================================
// Create Shipping Label
// ============================================

export const slCreateShippingLabel = onCall(
  { cors: true },
  async (request: CallableRequest<CreateLabelRequest>) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const {
      customerId,
      customerName,
      customerSlCode,
      recipientName,
      recipientAddress,
      recipientCity,
      recipientCountry = "Costa Rica",
      recipientPhone,
      packageIds,
      deliveryMethod,
      routeId,
      routeName,
      notes,
      deliveryInstructions,
    } = request.data;

    // Validation
    if (!customerId || !customerName || !recipientName || !recipientAddress) {
      throw new HttpsError("invalid-argument", "Missing required fields");
    }

    if (!packageIds || packageIds.length === 0) {
      throw new HttpsError("invalid-argument", "At least one package is required");
    }

    try {
      // Fetch package details
      const packageDocs = await Promise.all(
        packageIds.map((id) => db.collection("packages").doc(id).get())
      );

      const packages = packageDocs
        .filter((doc) => doc.exists)
        .map((doc) => {
          const data = doc.data()!;
          return {
            id: doc.id,
            trackingNumber: data.trackingNumber || doc.id,
            description: data.description || "Package",
            weight: data.weight || 0,
            value: data.calculatedCost || 0,
          };
        });

      if (packages.length === 0) {
        throw new HttpsError("not-found", "No valid packages found");
      }

      // Calculate totals
      const totalWeight = packages.reduce((sum, pkg) => sum + (pkg.weight || 0), 0);
      const totalValue = packages.reduce((sum, pkg) => sum + (pkg.value || 0), 0);

      // Generate label number and barcode
      const labelNumber = generateLabelNumber();
      const barcodeData = labelNumber;

      // Generate search tokens
      const searchTokens = generateSearchTokens({
        customerName,
        customerSlCode,
        labelNumber,
        trackingNumbers: packages.map((p) => p.trackingNumber),
      });

      // Create label document
      const labelData = {
        labelNumber,
        customerId,
        customerName,
        customerSlCode,
        recipientName,
        recipientAddress,
        recipientCity,
        recipientCountry,
        recipientPhone: recipientPhone || null,
        packageIds,
        packageCount: packages.length,
        totalWeight,
        totalValue,
        packages,
        deliveryMethod,
        routeId: routeId || null,
        routeName: routeName || null,
        labelFormat: "thermal",
        barcodeData,
        status: "pending",
        notes: notes || null,
        deliveryInstructions: deliveryInstructions || null,
        createdAt: FieldValue.serverTimestamp(),
        createdBy: request.auth.uid,
        updatedAt: FieldValue.serverTimestamp(),
        searchTokens,
      };

      const labelRef = await db.collection("shippingLabels").add(labelData);

      logger.info("Shipping label created", {
        labelId: labelRef.id,
        labelNumber,
        customerId,
        packageCount: packages.length,
      });

      return {
        success: true,
        data: {
          id: labelRef.id,
          ...labelData,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      };
    } catch (error: any) {
      logger.error("Error creating shipping label", { error: error.message });
      throw new HttpsError("internal", error.message || "Failed to create shipping label");
    }
  }
);

// ============================================
// List Shipping Labels
// ============================================

export const slListShippingLabels = onCall(
  { cors: true },
  async (request: CallableRequest<ListLabelsRequest>) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const {
      page = 1,
      limit = 100,
      status,
      customerId,
      customerSlCode,
      routeId,
      dateFrom,
      dateTo,
      q,
    } = request.data || {};

    try {
      // Build query: where clauses MUST come before orderBy in Firestore
      let query: FirebaseFirestore.Query = db.collection("shippingLabels");

      // Apply equality filters first (composite index: field ASC + createdAt DESC)
      if (customerId) {
        query = query.where("customerId", "==", customerId);
      } else if (customerSlCode) {
        query = query.where("customerSlCode", "==", customerSlCode);
      } else if (routeId) {
        query = query.where("routeId", "==", routeId);
      } else if (status) {
        query = query.where("status", "==", status);
      }

      // Range filters on createdAt (must match orderBy field)
      if (dateFrom) {
        query = query.where("createdAt", ">=", new Date(dateFrom));
      }
      if (dateTo) {
        query = query.where("createdAt", "<=", new Date(dateTo));
      }

      query = query.orderBy("createdAt", "desc").limit(limit);

      const snapshot = await query.get();

      let labels = snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
          updatedAt: data.updatedAt?.toDate?.()?.toISOString() || null,
          printedAt: data.printedAt?.toDate?.()?.toISOString() || null,
          deliveredAt: data.deliveredAt?.toDate?.()?.toISOString() || null,
          cancelledAt: data.cancelledAt?.toDate?.()?.toISOString() || null,
        };
      });

      // Text search if query provided
      if (q) {
        const searchLower = q.toLowerCase();
        labels = labels.filter((label: any) =>
          label.searchTokens?.some((token: string) => token.includes(searchLower)) ||
          label.labelNumber?.toLowerCase().includes(searchLower) ||
          label.customerName?.toLowerCase().includes(searchLower)
        );
      }

      const total = labels.length;
      const offset = (page - 1) * limit;
      const paginated = labels.slice(offset, offset + limit);

      return {
        success: true,
        data: paginated,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (error: any) {
      // Firestore returns NOT_FOUND (code 5) when the collection has no index yet
      // (e.g. brand-new collection with zero documents). Return empty gracefully.
      if (error.code === 5 || (error.message || "").includes("NOT_FOUND")) {
        logger.warn("shippingLabels collection not found or no index — returning empty", { error: error.message });
        return {
          success: true,
          data: [],
          pagination: { total: 0, page, limit, totalPages: 0 },
        };
      }
      logger.error("Error listing shipping labels", { error: error.message });
      throw new HttpsError("internal", error.message || "Failed to list shipping labels");
    }
  }
);

// ============================================
// Update Label Status
// ============================================

export const slUpdateLabelStatus = onCall(
  { cors: true },
  async (request: CallableRequest<UpdateLabelStatusRequest>) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { labelId, status, notes } = request.data;

    if (!labelId || !status) {
      throw new HttpsError("invalid-argument", "Label ID and status are required");
    }

    try {
      const labelRef = db.collection("shippingLabels").doc(labelId);
      const labelDoc = await labelRef.get();

      if (!labelDoc.exists) {
        throw new HttpsError("not-found", "Label not found");
      }

      const updateData: any = {
        status,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: request.auth.uid,
      };

      // Add status-specific fields
      if (status === "printed" && !labelDoc.data()?.printedAt) {
        updateData.printedAt = FieldValue.serverTimestamp();
        updateData.printedBy = request.auth.uid;
      }

      if (status === "delivered" && !labelDoc.data()?.deliveredAt) {
        updateData.deliveredAt = FieldValue.serverTimestamp();
        updateData.deliveredBy = request.auth.uid;
      }

      if (notes) {
        updateData.notes = notes;
      }

      await labelRef.update(updateData);

      logger.info("Label status updated", {
        labelId,
        status,
        userId: request.auth.uid,
      });

      return {
        success: true,
        message: "Label status updated successfully",
      };
    } catch (error: any) {
      logger.error("Error updating label status", { error: error.message });
      throw new HttpsError("internal", error.message || "Failed to update label status");
    }
  }
);

// ============================================
// Cancel Shipping Label
// ============================================

export const slCancelShippingLabel = onCall(
  { cors: true },
  async (request: CallableRequest<CancelLabelRequest>) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { labelId, reason } = request.data;

    if (!labelId || !reason) {
      throw new HttpsError("invalid-argument", "Label ID and reason are required");
    }

    try {
      const labelRef = db.collection("shippingLabels").doc(labelId);
      const labelDoc = await labelRef.get();

      if (!labelDoc.exists) {
        throw new HttpsError("not-found", "Label not found");
      }

      const currentStatus = labelDoc.data()?.status;

      if (currentStatus === "delivered") {
        throw new HttpsError("failed-precondition", "Cannot cancel delivered labels");
      }

      if (currentStatus === "cancelled") {
        throw new HttpsError("failed-precondition", "Label is already cancelled");
      }

      await labelRef.update({
        status: "cancelled",
        cancelledAt: FieldValue.serverTimestamp(),
        cancelledBy: request.auth.uid,
        cancellationReason: reason,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: request.auth.uid,
      });

      logger.info("Label cancelled", {
        labelId,
        reason,
        userId: request.auth.uid,
      });

      return {
        success: true,
        message: "Label cancelled successfully",
      };
    } catch (error: any) {
      logger.error("Error cancelling label", { error: error.message });
      throw new HttpsError("internal", error.message || "Failed to cancel label");
    }
  }
);
