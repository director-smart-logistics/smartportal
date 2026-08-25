import { onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import { db, admin } from "../config/firebase";

function generateSlCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const nums = "0123456789";
  let code = "SL";
  for (let i = 0; i < 2; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  for (let i = 0; i < 4; i++) {
    code += nums.charAt(Math.floor(Math.random() * nums.length));
  }
  return code;
}

interface ListCustomersRequest {
  page?: number;
  limit?: number;
  sortOrder?: "asc" | "desc";
  q?: string;
  status?: string;
}

interface CreateCustomerRequest {
  fullName: string;
  email: string;
  phone?: string;
  dni?: string;
  address?: string;
  city?: string;
  country?: string;
  zipCode?: string;
  slCode?: string;
  notes?: string;
}

interface UpdateCustomerRequest {
  customerId: string;
  fullName?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  dni?: string;
  address?: string;
  city?: string;
  country?: string;
  zipCode?: string;
  ruta?: string | null;
  route?: string | null;
  zona?: string | null;
  timezone?: string | null;
  location?: {
    province?: string;
    canton?: string;
    district?: string;
    city?: string;
    country?: string;
  } | null;
  preferredRouteId?: string | null;
  status?: string;
  tier?: string;
  membershipTier?: string;
  preferredLanguage?: string;
  acceptMarketing?: boolean;
  consolidationEnabled?: boolean;
  electronicInvoiceRequired?: boolean;
  isVerified?: boolean;
  verifiedDni?: string | null;
  verifiedEmail?: string | null;
  verifiedPhone?: string | null;
  showPromoBanner?: boolean;
  showVerificationModal?: boolean;
  showVisitGuide?: boolean;
  deliveryAddress1?: string | null;
  deliveryAddress2?: string | null;
  deliveryAddress3?: string | null;
  notes?: string | null;
}

export const slListCustomers = onCall(
  { cors: true, memory: "512MiB", timeoutSeconds: 120 },
  async (request: CallableRequest<ListCustomersRequest>) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    try {
      const { page = 1, limit = 20, sortOrder = "desc", q, status } = request.data || {};

      // Use client's limit param for initial fetch, capped at 10000 for safety.
      // NOTE: Do NOT use orderBy("createdAt") here — Firestore excludes documents
      // that lack the indexed field entirely, causing synced customers without
      // createdAt to be invisible to the UI.
      const fetchLimit = Math.min(limit || 10000, 10000);
      let query: FirebaseFirestore.Query = db.collection("customers");

      if (status) {
        query = query.where("status", "==", status);
      }

      query = query.limit(fetchLimit);

      const snapshot = await query.get();

      let customers = snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          fullName: data.fullName,
          name: data.name,
          firstName: data.firstName,
          lastName: data.lastName,
          email: data.email,
          phone: data.phone,
          dni: data.dni,
          slCode: data.slCode,
          address: data.address,
          city: data.city,
          country: data.country,
          status: data.status,
          tier: data.tier,
          ruta: data.ruta || data.route || data.defaultRoute || null,
          consolidationEnabled: data.consolidationEnabled === true,
          electronicInvoiceRequired: data.electronicInvoiceRequired === true,
          createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
        };
      });

      if (q) {
        const searchLower = q.toLowerCase();
        customers = customers.filter((c) =>
          c.fullName?.toLowerCase().includes(searchLower) ||
          c.email?.toLowerCase().includes(searchLower) ||
          c.slCode?.toLowerCase().includes(searchLower) ||
          c.dni?.toLowerCase().includes(searchLower)
        );
      }

      customers.sort((a, b) => {
        const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return sortOrder === "asc" ? aTime - bTime : bTime - aTime;
      });

      const total = customers.length;
      const offset = (page - 1) * limit;
      const paginated = customers.slice(offset, offset + limit);

      return {
        success: true,
        data: paginated,
        pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
      };
    } catch (err: any) {
      console.error("slListCustomers error:", err?.message || err);
      throw new HttpsError("internal", err?.message || "Failed to list customers");
    }
  }
);

export const slGetCustomer = onCall(
  { cors: true },
  async (request: CallableRequest<{ customerId: string }>) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { customerId } = request.data;
    if (!customerId) {
      throw new HttpsError("invalid-argument", "Customer ID is required");
    }

    const customerDoc = await db.collection("customers").doc(customerId).get();

    if (!customerDoc.exists) {
      throw new HttpsError("not-found", "Customer not found");
    }

    const data = customerDoc.data();
    return {
      success: true,
      data: {
        id: customerDoc.id,
        ...data,
        createdAt: data?.createdAt?.toDate?.()?.toISOString() || null,
        updatedAt: data?.updatedAt?.toDate?.()?.toISOString() || null,
        memberSince: data?.memberSince?.toDate?.()?.toISOString() || null,
      },
    };
  }
);

export const slGetCustomerBySlCode = onCall(
  { cors: true },
  async (request: CallableRequest<{ slCode: string }>) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const slCode = request.data.slCode?.toUpperCase().trim();
    if (!slCode) {
      throw new HttpsError("invalid-argument", "SL Code is required");
    }

    const snapshot = await db.collection("customers")
      .where("slCode", "==", slCode)
      .limit(1)
      .get();

    if (snapshot.empty) {
      throw new HttpsError("not-found", "Customer not found");
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

export const slCreateCustomer = onCall(
  { cors: true },
  async (request: CallableRequest<CreateCustomerRequest>) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const data = request.data;

    if (!data.fullName || !data.email) {
      throw new HttpsError("invalid-argument", "fullName and email are required");
    }

    const existingEmail = await db.collection("customers")
      .where("email", "==", data.email)
      .limit(1)
      .get();

    if (!existingEmail.empty) {
      throw new HttpsError("already-exists", "A customer with this email already exists");
    }

    if (data.dni) {
      const existingDni = await db.collection("customers")
        .where("dni", "==", data.dni)
        .limit(1)
        .get();

      if (!existingDni.empty) {
        throw new HttpsError("already-exists", "A customer with this DNI already exists");
      }
    }

    let slCode = data.slCode;
    if (!slCode) {
      let isUnique = false;
      while (!isUnique) {
        slCode = generateSlCode();
        const existing = await db.collection("customers")
          .where("slCode", "==", slCode)
          .limit(1)
          .get();
        isUnique = existing.empty;
      }
    }

    const nameParts = data.fullName.trim().split(" ");
    const firstName = nameParts[0];
    const lastName = nameParts.slice(1).join(" ") || null;

    const now = admin.firestore.FieldValue.serverTimestamp();
    const customerRef = db.collection("customers").doc();

    const customerData = {
      id: customerRef.id,
      fullName: data.fullName,
      firstName,
      lastName,
      email: data.email,
      phone: data.phone || null,
      dni: data.dni || null,
      address: data.address || null,
      city: data.city || null,
      country: data.country || null,
      zipCode: data.zipCode || null,
      slCode,
      notes: data.notes || null,
      status: "active",
      tier: "basic",
      membershipTier: "basic",
      membershipExpires: null,
      acceptMarketing: false,
      consolidationEnabled: false,
      electronicInvoiceRequired: false,
      memberSince: now,
      createdAt: now,
      updatedAt: now,
      createdBy: request.auth.uid,
    };

    await customerRef.set(customerData);

    return {
      success: true,
      data: {
        ...customerData,
        id: customerRef.id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    };
  }
);

export const slUpdateCustomer = onCall(
  { cors: true },
  async (request: CallableRequest<UpdateCustomerRequest>) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { customerId, ...updateFields } = request.data;
    if (!customerId) {
      throw new HttpsError("invalid-argument", "Customer ID is required");
    }

    const customerDoc = await db.collection("customers").doc(customerId).get();
    if (!customerDoc.exists) {
      throw new HttpsError("not-found", "Customer not found");
    }

    if (updateFields.email && updateFields.email !== customerDoc.data()?.email) {
      const existingEmail = await db.collection("customers")
        .where("email", "==", updateFields.email)
        .limit(1)
        .get();

      if (!existingEmail.empty && existingEmail.docs[0].id !== customerId) {
        throw new HttpsError("already-exists", "A customer with this email already exists");
      }
    }

    const updateData: Record<string, unknown> = {
      ...updateFields,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: request.auth.uid,
    };

    if (updateFields.fullName) {
      const nameParts = updateFields.fullName.trim().split(" ");
      updateData.firstName = nameParts[0];
      updateData.lastName = nameParts.slice(1).join(" ") || null;
    }

    await db.collection("customers").doc(customerId).update(updateData);

    return { success: true, id: customerId, ...updateFields };
  }
);

export const slDeleteCustomer = onCall(
  { cors: true },
  async (request: CallableRequest<{ customerId: string }>) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const callerRole = request.auth.token.role as string;
    if (!["SUPER_ADMIN", "ADMIN"].includes(callerRole)) {
      throw new HttpsError("permission-denied", "Admin access required");
    }

    const { customerId } = request.data;
    if (!customerId) {
      throw new HttpsError("invalid-argument", "Customer ID is required");
    }

    const customerDoc = await db.collection("customers").doc(customerId).get();
    if (!customerDoc.exists) {
      throw new HttpsError("not-found", "Customer not found");
    }

    // Hard delete — remove the doc entirely. Operators rely on the customer
    // row disappearing from the list; soft-deactivation is achieved via a
    // status update, not this callable.
    await db.collection("customers").doc(customerId).delete();

    return { success: true, id: customerId, deleted: true };
  }
);
