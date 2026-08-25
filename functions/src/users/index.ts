import { onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import { db, auth, admin } from "../config/firebase";
import { logger } from "firebase-functions";
import { sendWelcomeEmail } from "../email/email-service";

type UserRole = "ADMIN" | "MANAGER" | "STAFF" | "AGENT" | "DELIVERY" | "CUSTOMER";

interface CreateUserRequest {
  email: string;
  fullName: string;
  role: UserRole;
  phone?: string;
}

interface UpdateUserRequest {
  userId: string;
  email?: string;
  fullName?: string;
  phone?: string;
  role?: UserRole;
  disabled?: boolean;
}

interface ListUsersRequest {
  page?: number;
  limit?: number;
  sortOrder?: "asc" | "desc";
}

// ============================================
// Create User (Auth + Firestore)
// ============================================

export const slCreateUser = onCall(
  { cors: true },
  async (request: CallableRequest<CreateUserRequest>) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const callerRole = request.auth.token.role as string;
    if (callerRole !== "ADMIN") {
      throw new HttpsError("permission-denied", "Only admins can create users");
    }

    const { email, fullName, role, phone } = request.data;

    if (!email || !fullName || !role) {
      throw new HttpsError("invalid-argument", "Missing required fields");
    }

    const normalizedEmail = email.trim().toLowerCase();

    try {
      // Store a pre-registration entry — the actual Firebase Auth user is created
      // automatically when the user first signs in with Google. The onUserCreate
      // trigger will pick this up and assign the correct role and claims.
      const pendingRef = db.collection("pending_registrations").doc(normalizedEmail);
      const existing = await pendingRef.get();
      if (existing.exists) {
        throw new HttpsError("already-exists", "A pending registration already exists for this email");
      }

      await pendingRef.set({
        email: normalizedEmail,
        fullName,
        role,
        phone: phone || null,
        createdBy: request.auth.uid,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      logger.info("Pending registration created", { email: normalizedEmail, role });

      // Fire-and-forget welcome email — does not block the response
      sendWelcomeEmail({ fullName, email: normalizedEmail, role }).catch((err) =>
        logger.warn("[slCreateUser] Welcome email failed", { email: normalizedEmail, error: err?.message })
      );

      return {
        success: true,
        data: {
          email: normalizedEmail,
          fullName,
          role,
        },
        message: "User pre-registered successfully. They will gain access on first Google sign-in.",
      };
    } catch (error: any) {
      logger.error("Error creating user", { error: error.message });

      if (error.code === "already-exists") throw error;
      if (error.code === "auth/invalid-email") {
        throw new HttpsError("invalid-argument", "Invalid email format");
      }

      throw new HttpsError("internal", error.message || "Failed to create user");
    }
  }
);

// ============================================
// List Users
// ============================================

export const slListUsers = onCall(
  { cors: true },
  async (request: CallableRequest<ListUsersRequest>) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { page = 1, limit = 20, sortOrder = "desc" } = request.data || {};

    try {
      const snapshot = await db.collection("users")
        .where("status", "!=", "deleted")
        .limit(500)
        .get();

      let users = snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          email: data.email,
          fullName: data.fullName,
          phone: data.phone,
          role: data.role,
          status: data.status,
          disabled: data.disabled || false,
          emailVerified: data.emailVerified || false,
          createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
          lastLogin: data.lastLogin?.toDate?.()?.toISOString() || null,
        };
      });

      users.sort((a, b) => {
        const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return sortOrder === "asc" ? aTime - bTime : bTime - aTime;
      });

      const total = users.length;
      const offset = (page - 1) * limit;
      const paginated = users.slice(offset, offset + limit);

      return {
        success: true,
        data: paginated,
        pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
      };
    } catch (error: any) {
      logger.error("Error listing users", { error: error.message });
      throw new HttpsError("internal", "Failed to list users");
    }
  }
);

// ============================================
// Get User
// ============================================

export const slGetUser = onCall(
  { cors: true },
  async (request: CallableRequest<{ userId: string }>) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { userId } = request.data;
    if (!userId) {
      throw new HttpsError("invalid-argument", "User ID is required");
    }

    try {
      const [authUser, userDoc] = await Promise.all([
        auth.getUser(userId),
        db.collection("users").doc(userId).get(),
      ]);

      if (!userDoc.exists) {
        throw new HttpsError("not-found", "User not found");
      }

      const data = userDoc.data();
      return {
        success: true,
        data: {
          id: userDoc.id,
          email: data?.email,
          fullName: data?.fullName,
          phone: data?.phone,
          role: data?.role,
          status: data?.status,
          disabled: authUser.disabled,
          emailVerified: authUser.emailVerified,
          createdAt: data?.createdAt?.toDate?.()?.toISOString() || null,
          lastLogin: data?.lastLogin?.toDate?.()?.toISOString() || null,
        },
      };
    } catch (error: any) {
      logger.error("Error getting user", { error: error.message });
      
      if (error.code === "auth/user-not-found") {
        throw new HttpsError("not-found", "User not found");
      }
      
      throw new HttpsError("internal", "Failed to get user");
    }
  }
);

// ============================================
// Update User
// ============================================

export const slUpdateUser = onCall(
  { cors: true },
  async (request: CallableRequest<UpdateUserRequest>) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { userId, email, fullName, phone, role, disabled } = request.data;
    if (!userId) {
      throw new HttpsError("invalid-argument", "User ID is required");
    }

    const callerRole = request.auth.token.role as string;
    const isAdmin = callerRole === "ADMIN";

    if (!isAdmin) {
      throw new HttpsError("permission-denied", "Only admins can update users");
    }

    try {
      const authUpdates: any = {};
      const firestoreUpdates: any = {};

      if (email !== undefined) {
        authUpdates.email = email;
        firestoreUpdates.email = email;
      }

      if (fullName !== undefined) {
        authUpdates.displayName = fullName;
        firestoreUpdates.fullName = fullName;
      }

      if (disabled !== undefined) {
        authUpdates.disabled = disabled;
        firestoreUpdates.disabled = disabled;
        firestoreUpdates.status = disabled ? "inactive" : "active";
      }

      if (role !== undefined) {
        firestoreUpdates.role = role;
        await auth.setCustomUserClaims(userId, { role });
      }

      if (phone !== undefined) {
        firestoreUpdates.phone = phone;
      }

      // Update Firebase Auth
      if (Object.keys(authUpdates).length > 0) {
        await auth.updateUser(userId, authUpdates);
      }

      // Update Firestore
      if (Object.keys(firestoreUpdates).length > 0) {
        firestoreUpdates.updatedAt = admin.firestore.FieldValue.serverTimestamp();
        await db.collection("users").doc(userId).update(firestoreUpdates);
      }

      logger.info("User updated successfully", { userId });

      return { success: true, message: "User updated successfully" };
    } catch (error: any) {
      logger.error("Error updating user", { error: error.message });

      if (error.code === "auth/user-not-found") {
        throw new HttpsError("not-found", "User not found");
      }
      if (error.code === "auth/email-already-exists") {
        throw new HttpsError("already-exists", "Email already in use");
      }

      throw new HttpsError("internal", "Failed to update user");
    }
  }
);

// ============================================
// Delete User
// ============================================

export const slDeleteUser = onCall(
  { cors: true },
  async (request: CallableRequest<{ userId: string }>) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const callerRole = request.auth.token.role as string;
    if (callerRole !== "ADMIN") {
      throw new HttpsError("permission-denied", "Only admins can delete users");
    }

    const { userId } = request.data;
    if (!userId) {
      throw new HttpsError("invalid-argument", "User ID is required");
    }

    if (userId === request.auth.uid) {
      throw new HttpsError("failed-precondition", "Cannot delete your own account");
    }

    try {
      // Fetch the user record to get email before deleting
      let userEmail: string | null = null;
      try {
        const authRecord = await auth.getUser(userId);
        userEmail = authRecord.email?.trim().toLowerCase() || null;
      } catch (lookupErr: any) {
        if (lookupErr.code !== "auth/user-not-found") throw lookupErr;
        // Auth user already gone — still clean up Firestore below
      }

      // Delete from Firebase Auth (removes Google Auth account)
      await auth.deleteUser(userId).catch((err: any) => {
        if (err.code !== "auth/user-not-found") throw err;
        logger.warn("Auth user not found during delete (already removed)", { userId });
      });

      // Delete Firestore user profile
      await db.collection("users").doc(userId).delete();

      // Clean up any pending_registration entry for this email
      if (userEmail) {
        await db.collection("pending_registrations").doc(userEmail).delete().catch(() => {
          // No-op if entry doesn't exist
        });
      }

      logger.info("User deleted successfully", { userId, email: userEmail });

      return { success: true, message: "User deleted successfully" };
    } catch (error: any) {
      logger.error("Error deleting user", { error: error.message });

      if (error.code === "auth/user-not-found") {
        throw new HttpsError("not-found", "User not found");
      }

      throw new HttpsError("internal", "Failed to delete user");
    }
  }
);

// ============================================
// Send Password Reset Email
// ============================================

export const slSendPasswordReset = onCall(
  { cors: true },
  async (request: CallableRequest<{ email: string }>) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const callerRole = request.auth.token.role as string;
    if (callerRole !== "ADMIN") {
      throw new HttpsError("permission-denied", "Only admins can reset passwords");
    }

    const { email } = request.data;
    if (!email) {
      throw new HttpsError("invalid-argument", "Email is required");
    }

    try {
      const link = await auth.generatePasswordResetLink(email);
      logger.info("Password reset link generated", { email });

      return {
        success: true,
        message: "Password reset link generated",
        link,
      };
    } catch (error: any) {
      logger.error("Error generating password reset link", { error: error.message });

      if (error.code === "auth/user-not-found") {
        throw new HttpsError("not-found", "User not found");
      }

      throw new HttpsError("internal", "Failed to generate password reset link");
    }
  }
);

// ============================================
// Send Email Verification
// ============================================

export const slSendEmailVerification = onCall(
  { cors: true },
  async (request: CallableRequest<{ userId: string }>) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const callerRole = request.auth.token.role as string;
    if (callerRole !== "ADMIN") {
      throw new HttpsError("permission-denied", "Only admins can send verification emails");
    }

    const { userId } = request.data;
    if (!userId) {
      throw new HttpsError("invalid-argument", "User ID is required");
    }

    try {
      const userRecord = await auth.getUser(userId);

      if (userRecord.emailVerified) {
        throw new HttpsError("failed-precondition", "Email already verified");
      }

      const link = await auth.generateEmailVerificationLink(userRecord.email!);
      logger.info("Email verification link generated", { userId });

      return {
        success: true,
        message: "Verification link generated",
        link,
      };
    } catch (error: any) {
      logger.error("Error generating verification link", { error: error.message });

      if (error.code === "auth/user-not-found") {
        throw new HttpsError("not-found", "User not found");
      }

      throw new HttpsError("internal", "Failed to generate verification link");
    }
  }
);

