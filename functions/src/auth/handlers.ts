import { onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import { db, auth, admin } from "../config/firebase";
import { UserRole } from "../types";

/**
 * Sync Google user to Firestore after authentication
 * Called automatically after Google Sign-In
 */
export const slSyncGoogleUser = onCall(
  { cors: true },
  async (request: CallableRequest) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const uid = request.auth.uid;

    // Resolve email from token (fastest) or Auth record
    const normalizedEmail = (
      (request.auth.token.email as string) ||
      ""
    ).trim().toLowerCase();

    // --- 1. Always check pending_registrations first ---
    let pendingData: Record<string, any> | null = null;
    if (normalizedEmail) {
      const pendingSnap = await db
        .collection("pending_registrations")
        .doc(normalizedEmail)
        .get();
      if (pendingSnap.exists) {
        pendingData = pendingSnap.data() as Record<string, any>;
      }
    }

    // --- 2. Check if Firestore profile already exists ---
    const userDoc = await db.collection("users").doc(uid).get();

    // --- SECURITY LOGIC ---
    // - If user EXISTS in Firestore: Allow login (existing user)
    // - If user is NEW and has pendingData: Create with invited role
    // - If user is NEW and NO pendingData: REJECT (unauthorized)
    
    if (!userDoc.exists && !pendingData) {
      // NEW user without invitation → REJECT
      await auth.deleteUser(uid).catch(() => {});
      throw new HttpsError(
        "permission-denied",
        "Tu correo no está registrado en el sistema. Contacta al administrador para solicitar acceso."
      );
    }

    // If existing user without pendingData → validate status then allow
    if (userDoc.exists && !pendingData) {
      const existingData = userDoc.data() as Record<string, any>;
      const existingStatus = existingData?.status as string;
      const existingRole = existingData?.role as UserRole || "VIEWER";

      // Only users with 'active' status can log in
      if (existingStatus !== "active") {
        await auth.deleteUser(uid).catch(() => {});
        throw new HttpsError(
          "permission-denied",
          "Tu cuenta no está activa. Contacta al administrador."
        );
      }

      // Always re-sync claims so the token reflects the correct role
      const currentClaims = request.auth.token;
      if (currentClaims?.role !== existingRole) {
        await auth.setCustomUserClaims(uid, { role: existingRole });
      }
      const now = admin.firestore.FieldValue.serverTimestamp();
      await db.collection("users").doc(uid).update({
        lastLogin: now,
        updatedAt: now,
      });
      return {
        success: true,
        user: existingData,
        isNewUser: false,
      };
    }

    // --- 3. Resolve role & status ---
    let role: UserRole = "VIEWER";
    let status = "pending_approval";

    if (pendingData) {
      role = (pendingData.role as UserRole) || "VIEWER";
      status = "active";
    }

    // Set correct custom claims regardless of what onUserCreate may have set
    await auth.setCustomUserClaims(uid, { role });

    const firebaseUser = await auth.getUser(uid);
    const now = admin.firestore.FieldValue.serverTimestamp();

    const userData = {
      id: uid,
      email: normalizedEmail || firebaseUser.email || null,
      fullName:
        pendingData?.fullName ||
        firebaseUser.displayName ||
        (request.auth.token.name as string) ||
        null,
      photoURL: firebaseUser.photoURL || null,
      phone: pendingData?.phone || firebaseUser.phoneNumber || null,
      role,
      status,
      provider: "google",
      createdAt: userDoc.exists
        ? (userDoc.data()?.createdAt ?? now)
        : now,
      updatedAt: now,
      lastLogin: now,
    };

    // --- 4. Create or overwrite profile with correct data ---
    await db.collection("users").doc(uid).set(userData, { merge: true });

    // --- 5. Clean up pending_registration ---
    if (pendingData && normalizedEmail) {
      await db
        .collection("pending_registrations")
        .doc(normalizedEmail)
        .delete()
        .catch(() => {});
    }

    return {
      success: true,
      user: {
        ...userData,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastLogin: new Date().toISOString(),
      },
      isNewUser: !userDoc.exists,
    };
  }
);

/**
 * Get user profile
 */
export const slGetProfile = onCall(
  { cors: true },
  async (request: CallableRequest) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const uid = request.auth.uid;
    const userDoc = await db.collection("users").doc(uid).get();

    if (!userDoc.exists) {
      throw new HttpsError("not-found", "User not found");
    }

    const userData = userDoc.data();
    return {
      success: true,
      data: {
        id: uid,
        email: userData?.email,
        fullName: userData?.fullName,
        role: userData?.role || request.auth.token.role || "AGENT",
        status: userData?.status,
        createdAt: userData?.createdAt?.toDate?.()?.toISOString() || null,
      },
    };
  }
);

/**
 * Update last login timestamp
 */
export const slUpdateLastLogin = onCall(
  { cors: true },
  async (request: CallableRequest) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const uid = request.auth.uid;
    await db.collection("users").doc(uid).update({
      lastLogin: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { success: true, updated: true };
  }
);

/**
 * Set user role (admin only)
 */
export const slSetUserRole = onCall(
  { cors: true },
  async (request: CallableRequest<{ userId: string; role: UserRole }>) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const callerRole = request.auth.token.role as string;
    if (!["SUPER_ADMIN", "ADMIN"].includes(callerRole)) {
      throw new HttpsError("permission-denied", "Admin access required");
    }

    const { userId, role } = request.data;

    if (!userId || !role) {
      throw new HttpsError("invalid-argument", "userId and role are required");
    }

    const validRoles: UserRole[] = ["SUPER_ADMIN", "ADMIN", "AGENT", "DELIVERY", "VIEWER"];
    if (!validRoles.includes(role)) {
      throw new HttpsError("invalid-argument", `Invalid role. Must be one of: ${validRoles.join(", ")}`);
    }

    await auth.setCustomUserClaims(userId, { role });

    await db.collection("users").doc(userId).update({
      role,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { success: true, userId, role };
  }
);
