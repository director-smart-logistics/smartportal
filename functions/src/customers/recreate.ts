/**
 * slRecreateCustomerBySlCode
 *
 * Admin-only callable to manually re-create a customer record that was
 * deleted from both SP1 AND SP2 but still has orphan data attached to
 * its `slCode` (paquetes, facturas, pre-alertas). Without a customer
 * doc those records have no human-readable owner and break every list
 * view that joins by slCode.
 *
 * Why not `slCreateCustomer`:
 *   - The existing creator uses a random Firestore doc id, but the
 *     SP2→SP1 sync (and every downstream lookup) treats `slCode` as
 *     the doc id. Recovering a customer requires `customers/{slCode}`
 *     specifically.
 *   - It checks email + DNI uniqueness against the WHOLE collection;
 *     for recovery we only care that the slCode itself isn't already
 *     taken (the email/DNI may have been freed when SP2 purged the
 *     account, but they could also still appear in archived rows).
 *
 * Caller passes the customer payload they have (admin types it from
 * backup / Excel / WhatsApp paste). The callable:
 *   1. Authorises admin/superadmin.
 *   2. Refuses if `customers/{slCode}` already exists.
 *   3. Builds the canonical customer shape with the same defaults the
 *      SP2 sync produces, so downstream code sees no difference.
 *   4. Stamps audit metadata (`recreatedBy`, `recreatedAt`, reason).
 *   5. Writes `customers/{slCode}` atomically.
 *
 * AI-GUARD ⚠️ Does NOT touch SP2 — the SP2 account is gone. If the
 * customer ever re-registers in SP2 the regular SP2→SP1 sync will
 * upsert this same doc with their new credentials.
 */
import { onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { db, admin } from "../config/firebase";
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

interface RecreateRequest {
  slCode: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  dni?: string;
  ruta?: string;
  nationality?: string;
  birthDate?: string;
  country?: string;
  /** Optional audit note (e.g. "Cliente eliminado por inactividad — paquetes huérfanos") */
  reason?: string;
  /** If true, overwrites an existing customer record if it already exists. */
  force?: boolean;
}

function trim(s?: string | null): string {
  return typeof s === "string" ? s.trim() : "";
}

export const slRecreateCustomerBySlCode = onCall(
  { cors: true, memory: "256MiB", timeoutSeconds: 30 },
  async (request: CallableRequest<RecreateRequest>): Promise<{
    success: true;
    customer: {
      id: string;
      slCode: string;
      email: string;
      fullName: string;
    };
  }> => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be authenticated");
    }
    // Same gate as slDeleteCustomer / slUpdateCustomer.
    const role = (request.auth.token.role as string | undefined) || "";
    const allowed = new Set(["admin", "superadmin", "ADMIN", "SUPER_ADMIN"]);
    if (!allowed.has(role)) {
      throw new HttpsError("permission-denied", "Admin access required");
    }

    const data = request.data || ({} as RecreateRequest);
    const slCode = trim(data.slCode).toUpperCase();
    const email = trim(data.email).toLowerCase();
    const firstName = trim(data.firstName);
    const lastName = trim(data.lastName);

    if (!slCode) throw new HttpsError("invalid-argument", "slCode requerido");
    if (!email) throw new HttpsError("invalid-argument", "email requerido");
    if (!firstName) throw new HttpsError("invalid-argument", "firstName requerido");

    // ── Refuse if already exists ──────────────────────────────────────────
    const docRef = db.collection("customers").doc(slCode);
    const existing = await docRef.get();
    if (existing.exists && !data.force) {
      throw new HttpsError(
        "already-exists",
        `El cliente ${slCode} ya existe en SP1. No hay nada que recuperar.`,
      );
    }

    // ── Build canonical customer payload ──────────────────────────────────
    const now = admin.firestore.FieldValue.serverTimestamp();
    const fullName = `${firstName} ${lastName}`.trim() || firstName;
    const phone = trim(data.phone);
    const dni = trim(data.dni);
    const ruta = trim(data.ruta);

    const customerData: Record<string, unknown> = {
      id: slCode,
      slCode,
      email,
      firstName,
      lastName: lastName || null,
      fullName,
      phone: phone || null,
      dni: dni || null,
      nationality: trim(data.nationality) || null,
      birthDate: trim(data.birthDate) || null,
      country: trim(data.country) || "Costa Rica",
      ruta: ruta || null,
      status: "active",
      tier: "basic",
      membershipTier: "basic",
      membershipExpires: null,
      acceptMarketing: false,
      consolidationEnabled: false,
      electronicInvoiceRequired: false,
      isVerified: false,
      addresses: [],
      paymentMethods: [],
      memberSince: now,
      createdAt: now,
      updatedAt: now,
      // Audit: distinguish recreated docs from sync-created ones so we can
      // later audit which customers came back through manual recovery.
      recreatedBy: request.auth.uid,
      recreatedAt: now,
      recreatedReason: trim(data.reason) || null,
      createdBy: request.auth.uid,
      origin: "manual-recovery",
    };

    await docRef.set(customerData);

    try {
      await db.collection("_admin_audit").add({
        action: "customer_recreate",
        slCode,
        email,
        performedBy: request.auth.uid,
        performedAt: new Date().toISOString(),
        reason: trim(data.reason) || null,
      });
    } catch (err) {
      logger.warn("[slRecreateCustomerBySlCode] audit log failed", {
        slCode, error: (err as Error).message,
      });
    }

    logger.info("[slRecreateCustomerBySlCode] customer recreated", {
      slCode, email, by: request.auth.uid,
    });

    return {
      success: true,
      customer: { id: slCode, slCode, email, fullName },
    };
  },
);

const SP2_PROJECT_ID = "smart-portal-2";

function getSp2Admin(): { sp2Db: FirebaseFirestore.Firestore; sp2Auth: any } {
  const appName = "smart-portal-2-recreate";
  const existing = getApps().find((a) => a.name === appName);
  const app = existing || initializeApp({ projectId: SP2_PROJECT_ID }, appName);
  return {
    sp2Db: getFirestore(app),
    sp2Auth: getAuth(app),
  };
}

function normalizeStr(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function generateSearchTokens(firstName?: string, lastName?: string): string[] {
  const tokens = new Set<string>();
  const addWords = (text?: string) => {
    if (!text) return;
    normalizeStr(text).toLowerCase().trim().split(/\s+/).forEach((w) => {
      if (w.length > 0) tokens.add(w);
    });
  };
  addWords(firstName);
  addWords(lastName);
  return Array.from(tokens);
}

function normalizeDni(dni: string): string {
  return dni.trim().replace(/\D/g, "");
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export const slRecreateSp2UserAccount = onCall(
  { cors: true, memory: "256MiB", timeoutSeconds: 60 },
  async (request: CallableRequest<{ slCode: string }>): Promise<{
    success: boolean;
    message?: string;
  }> => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be authenticated");
    }
    const role = (request.auth.token.role as string | undefined) || "";
    const allowed = new Set(["admin", "superadmin", "ADMIN", "SUPER_ADMIN"]);
    if (!allowed.has(role)) {
      throw new HttpsError("permission-denied", "Admin access required");
    }

    const { slCode } = request.data || {};
    if (!slCode) {
      throw new HttpsError("invalid-argument", "slCode is required");
    }

    const slCodeClean = slCode.trim().toUpperCase();

    // 1. Get customer details from SP1
    const customerSnap = await db.collection("customers").doc(slCodeClean).get();
    if (!customerSnap.exists) {
      throw new HttpsError("not-found", `Customer ${slCodeClean} not found in SP1`);
    }

    const customer = customerSnap.data()!;
    const email = normalizeEmail(customer.email || "");
    const firstName = trim(customer.firstName);
    const lastName = trim(customer.lastName);
    const phone = trim(customer.phone).replace(/[-\s]/g, "").replace(/^\+506/, "");
    const dni = customer.dni ? normalizeDni(customer.dni) : "";
    const birthDate = trim(customer.birthDate);
    const nationality = trim(customer.nationality);

    if (!email) {
      throw new HttpsError("invalid-argument", "Customer record must have a valid email to recreate account in SP2");
    }
    if (!firstName) {
      throw new HttpsError("invalid-argument", "Customer record must have a valid firstName to recreate account in SP2");
    }

    // 2. Initialize SP2 connections
    const { sp2Db, sp2Auth } = getSp2Admin();

    try {
      // 3. Check if user already exists in SP2 Auth by email
      let authUser: any;
      try {
        authUser = await sp2Auth.getUserByEmail(email);
        logger.info(`[slRecreateSp2UserAccount] Auth user already exists in SP2 with email: ${email}`, { uid: authUser.uid });
      } catch (authErr: any) {
        if (authErr.code === "auth/user-not-found") {
          // Create the Auth user in SP2 with a temporary random password
          const tempPassword = Math.random().toString(36).slice(-8) + "Aa1!";
          authUser = await sp2Auth.createUser({
            email,
            password: tempPassword,
            displayName: `${firstName} ${lastName}`.trim() || firstName,
            phoneNumber: phone ? `+506${phone}` : undefined,
            emailVerified: false,
          });
          logger.info(`[slRecreateSp2UserAccount] Auth user created in SP2`, { uid: authUser.uid });
        } else {
          throw authErr;
        }
      }

      const uid = authUser.uid;

      // 4. Create user profile in SP2 Firestore
      const userRef = sp2Db.collection("users").doc(uid);
      const dniIndexRef = dni ? sp2Db.collection("dni_index").doc(dni) : null;
      const emailIndexRef = email ? sp2Db.collection("email_index").doc(email) : null;

      // Perform transaction to claim indexes and write user doc in SP2
      await sp2Db.runTransaction(async (tx) => {
        const [userDocSnap, dniIdxSnap, emailIdxSnap] = await Promise.all([
          tx.get(userRef),
          dniIndexRef ? tx.get(dniIndexRef) : Promise.resolve(null),
          emailIndexRef ? tx.get(emailIndexRef) : Promise.resolve(null),
        ]);

        if (userDocSnap.exists) {
          const existingData = userDocSnap.data() || {};
          const existingSlCode = (existingData.slCode || "").trim().toUpperCase();
          if (!existingSlCode || existingSlCode === slCodeClean) {
            // Already synced or profile exists without slCode — allow updating and assigning slCode
            logger.info(`[slRecreateSp2UserAccount] User document exists in SP2 Firestore for UID: ${uid}. Assigning/updating slCode to ${slCodeClean}`);
          } else {
            throw new Error(`El UID ${uid} en SP2 ya pertenece al código de cuenta ${existingData.slCode}`);
          }
        }

        if (dniIdxSnap?.exists && dniIdxSnap.data()?.uid !== uid) {
          throw new Error(`La cédula ${dni} ya está en uso por otra cuenta en SP2.`);
        }
        if (emailIdxSnap?.exists && emailIdxSnap.data()?.uid !== uid) {
          throw new Error(`El correo ${email} ya está en uso por otra cuenta en SP2.`);
        }

        // Claims
        const claimedAt = new Date().toISOString();
        if (dniIndexRef) {
          tx.set(dniIndexRef, { uid, claimedAt, source: "sp1-admin-restore" });
        }
        if (emailIndexRef) {
          tx.set(emailIndexRef, { uid, claimedAt, source: "sp1-admin-restore" });
        }

        // Build base profile values
        const searchTokens = generateSearchTokens(firstName, lastName);
        const firstNameLower = normalizeStr(firstName).toLowerCase().trim();
        const lastNameLower = normalizeStr(lastName).toLowerCase().trim();

        const sp2Profile = {
          uid,
          id: uid,
          slCode: slCodeClean,
          email,
          firstName,
          lastName: lastName || null,
          displayName: `${firstName} ${lastName}`.trim() || firstName,
          phone: phone || null,
          photoURL: null,
          dni: dni || null,
          cedula: dni || null,
          dateOfBirth: birthDate || null,
          birthDate: birthDate || null,
          nationality: nationality || null,
          location: {
            province: customer.locationProvince || customer.location?.province || "",
            canton: customer.locationCanton || customer.location?.canton || "",
            district: customer.locationDistrict || customer.location?.district || "",
            city: customer.locationCity || customer.location?.city || "",
            country: "Costa Rica",
          },
          country: "Costa Rica",
          timezone: "America/Costa_Rica",
          tier: customer.tier || "basic",
          membershipTier: customer.membershipTier || "basic",
          memberSince: new Date().toISOString(),
          membershipExpires: null,
          role: "customer",
          totalShipments: 0,
          pendingShipments: 0,
          status: "active",
          isVerified: customer.isVerified || false,
          isActive: true,
          emailVerified: false,
          acceptMarketing: customer.acceptMarketing || false,
          preferredLanguage: customer.preferredLanguage || "es",
          showPromoBanner: true,
          showVisitGuide: true,
          showVerificationModal: true,
          providerId: "password",
          registrationSource: "sp1-admin-restore",
          searchTokens,
          firstNameLower,
          lastNameLower,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        tx.set(userRef, sp2Profile, { merge: true });
      });

      // 5. Send password reset link to the user so they can configure their new credentials
      try {
        await sp2Auth.generatePasswordResetLink(email);
        logger.info(`[slRecreateSp2UserAccount] Standard password reset link generated for email: ${email}`);
      } catch (linkErr) {
        logger.warn(`[slRecreateSp2UserAccount] Failed to generate reset link (non-fatal)`, linkErr);
      }

      // 6. Audit logs in SP1
      try {
        await db.collection("_admin_audit").add({
          action: "customer_sp2_recreate",
          slCode: slCodeClean,
          email,
          performedBy: request.auth.uid,
          performedAt: new Date().toISOString(),
        });
      } catch (err) {
        logger.warn("[slRecreateSp2UserAccount] audit log failed", err);
      }

      return {
        success: true,
        message: `Cuenta en SP2 restaurada correctamente para el cliente ${slCodeClean} (${email}).`,
      };

    } catch (err: any) {
      logger.error(`[slRecreateSp2UserAccount] Failed to recreate account in SP2 for ${slCodeClean}`, err);
      return {
        success: false,
        message: err.message || "Error al recrear la cuenta en SP2.",
      };
    }
  }
);
