"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.slSendEmailVerification = exports.slSendPasswordReset = exports.slDeleteUser = exports.slUpdateUser = exports.slGetUser = exports.slListUsers = exports.slCreateUser = void 0;
const https_1 = require("firebase-functions/v2/https");
const firebase_1 = require("../config/firebase");
const firebase_functions_1 = require("firebase-functions");
const email_service_1 = require("../email/email-service");
// ============================================
// Create User (Auth + Firestore)
// ============================================
exports.slCreateUser = (0, https_1.onCall)({ cors: true }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
    }
    const callerRole = request.auth.token.role;
    if (callerRole !== "ADMIN") {
        throw new https_1.HttpsError("permission-denied", "Only admins can create users");
    }
    const { email, fullName, role, phone } = request.data;
    if (!email || !fullName || !role) {
        throw new https_1.HttpsError("invalid-argument", "Missing required fields");
    }
    const normalizedEmail = email.trim().toLowerCase();
    try {
        // Store a pre-registration entry — the actual Firebase Auth user is created
        // automatically when the user first signs in with Google. The onUserCreate
        // trigger will pick this up and assign the correct role and claims.
        const pendingRef = firebase_1.db.collection("pending_registrations").doc(normalizedEmail);
        const existing = await pendingRef.get();
        if (existing.exists) {
            throw new https_1.HttpsError("already-exists", "A pending registration already exists for this email");
        }
        await pendingRef.set({
            email: normalizedEmail,
            fullName,
            role,
            phone: phone || null,
            createdBy: request.auth.uid,
            createdAt: firebase_1.admin.firestore.FieldValue.serverTimestamp(),
        });
        firebase_functions_1.logger.info("Pending registration created", { email: normalizedEmail, role });
        // Fire-and-forget welcome email — does not block the response
        (0, email_service_1.sendWelcomeEmail)({ fullName, email: normalizedEmail, role }).catch((err) => firebase_functions_1.logger.warn("[slCreateUser] Welcome email failed", { email: normalizedEmail, error: err?.message }));
        return {
            success: true,
            data: {
                email: normalizedEmail,
                fullName,
                role,
            },
            message: "User pre-registered successfully. They will gain access on first Google sign-in.",
        };
    }
    catch (error) {
        firebase_functions_1.logger.error("Error creating user", { error: error.message });
        if (error.code === "already-exists")
            throw error;
        if (error.code === "auth/invalid-email") {
            throw new https_1.HttpsError("invalid-argument", "Invalid email format");
        }
        throw new https_1.HttpsError("internal", error.message || "Failed to create user");
    }
});
// ============================================
// List Users
// ============================================
exports.slListUsers = (0, https_1.onCall)({ cors: true }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
    }
    const { page = 1, limit = 20, sortOrder = "desc" } = request.data || {};
    try {
        const snapshot = await firebase_1.db.collection("users")
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
    }
    catch (error) {
        firebase_functions_1.logger.error("Error listing users", { error: error.message });
        throw new https_1.HttpsError("internal", "Failed to list users");
    }
});
// ============================================
// Get User
// ============================================
exports.slGetUser = (0, https_1.onCall)({ cors: true }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
    }
    const { userId } = request.data;
    if (!userId) {
        throw new https_1.HttpsError("invalid-argument", "User ID is required");
    }
    try {
        const [authUser, userDoc] = await Promise.all([
            firebase_1.auth.getUser(userId),
            firebase_1.db.collection("users").doc(userId).get(),
        ]);
        if (!userDoc.exists) {
            throw new https_1.HttpsError("not-found", "User not found");
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
    }
    catch (error) {
        firebase_functions_1.logger.error("Error getting user", { error: error.message });
        if (error.code === "auth/user-not-found") {
            throw new https_1.HttpsError("not-found", "User not found");
        }
        throw new https_1.HttpsError("internal", "Failed to get user");
    }
});
// ============================================
// Update User
// ============================================
exports.slUpdateUser = (0, https_1.onCall)({ cors: true }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
    }
    const { userId, email, fullName, phone, role, disabled } = request.data;
    if (!userId) {
        throw new https_1.HttpsError("invalid-argument", "User ID is required");
    }
    const callerRole = request.auth.token.role;
    const isAdmin = callerRole === "ADMIN";
    if (!isAdmin) {
        throw new https_1.HttpsError("permission-denied", "Only admins can update users");
    }
    try {
        const authUpdates = {};
        const firestoreUpdates = {};
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
            await firebase_1.auth.setCustomUserClaims(userId, { role });
        }
        if (phone !== undefined) {
            firestoreUpdates.phone = phone;
        }
        // Update Firebase Auth
        if (Object.keys(authUpdates).length > 0) {
            await firebase_1.auth.updateUser(userId, authUpdates);
        }
        // Update Firestore
        if (Object.keys(firestoreUpdates).length > 0) {
            firestoreUpdates.updatedAt = firebase_1.admin.firestore.FieldValue.serverTimestamp();
            await firebase_1.db.collection("users").doc(userId).update(firestoreUpdates);
        }
        firebase_functions_1.logger.info("User updated successfully", { userId });
        return { success: true, message: "User updated successfully" };
    }
    catch (error) {
        firebase_functions_1.logger.error("Error updating user", { error: error.message });
        if (error.code === "auth/user-not-found") {
            throw new https_1.HttpsError("not-found", "User not found");
        }
        if (error.code === "auth/email-already-exists") {
            throw new https_1.HttpsError("already-exists", "Email already in use");
        }
        throw new https_1.HttpsError("internal", "Failed to update user");
    }
});
// ============================================
// Delete User
// ============================================
exports.slDeleteUser = (0, https_1.onCall)({ cors: true }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
    }
    const callerRole = request.auth.token.role;
    if (callerRole !== "ADMIN") {
        throw new https_1.HttpsError("permission-denied", "Only admins can delete users");
    }
    const { userId } = request.data;
    if (!userId) {
        throw new https_1.HttpsError("invalid-argument", "User ID is required");
    }
    if (userId === request.auth.uid) {
        throw new https_1.HttpsError("failed-precondition", "Cannot delete your own account");
    }
    try {
        // Fetch the user record to get email before deleting
        let userEmail = null;
        try {
            const authRecord = await firebase_1.auth.getUser(userId);
            userEmail = authRecord.email?.trim().toLowerCase() || null;
        }
        catch (lookupErr) {
            if (lookupErr.code !== "auth/user-not-found")
                throw lookupErr;
            // Auth user already gone — still clean up Firestore below
        }
        // Delete from Firebase Auth (removes Google Auth account)
        await firebase_1.auth.deleteUser(userId).catch((err) => {
            if (err.code !== "auth/user-not-found")
                throw err;
            firebase_functions_1.logger.warn("Auth user not found during delete (already removed)", { userId });
        });
        // Delete Firestore user profile
        await firebase_1.db.collection("users").doc(userId).delete();
        // Clean up any pending_registration entry for this email
        if (userEmail) {
            await firebase_1.db.collection("pending_registrations").doc(userEmail).delete().catch(() => {
                // No-op if entry doesn't exist
            });
        }
        firebase_functions_1.logger.info("User deleted successfully", { userId, email: userEmail });
        return { success: true, message: "User deleted successfully" };
    }
    catch (error) {
        firebase_functions_1.logger.error("Error deleting user", { error: error.message });
        if (error.code === "auth/user-not-found") {
            throw new https_1.HttpsError("not-found", "User not found");
        }
        throw new https_1.HttpsError("internal", "Failed to delete user");
    }
});
// ============================================
// Send Password Reset Email
// ============================================
exports.slSendPasswordReset = (0, https_1.onCall)({ cors: true }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
    }
    const callerRole = request.auth.token.role;
    if (callerRole !== "ADMIN") {
        throw new https_1.HttpsError("permission-denied", "Only admins can reset passwords");
    }
    const { email } = request.data;
    if (!email) {
        throw new https_1.HttpsError("invalid-argument", "Email is required");
    }
    try {
        const link = await firebase_1.auth.generatePasswordResetLink(email);
        firebase_functions_1.logger.info("Password reset link generated", { email });
        return {
            success: true,
            message: "Password reset link generated",
            link,
        };
    }
    catch (error) {
        firebase_functions_1.logger.error("Error generating password reset link", { error: error.message });
        if (error.code === "auth/user-not-found") {
            throw new https_1.HttpsError("not-found", "User not found");
        }
        throw new https_1.HttpsError("internal", "Failed to generate password reset link");
    }
});
// ============================================
// Send Email Verification
// ============================================
exports.slSendEmailVerification = (0, https_1.onCall)({ cors: true }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
    }
    const callerRole = request.auth.token.role;
    if (callerRole !== "ADMIN") {
        throw new https_1.HttpsError("permission-denied", "Only admins can send verification emails");
    }
    const { userId } = request.data;
    if (!userId) {
        throw new https_1.HttpsError("invalid-argument", "User ID is required");
    }
    try {
        const userRecord = await firebase_1.auth.getUser(userId);
        if (userRecord.emailVerified) {
            throw new https_1.HttpsError("failed-precondition", "Email already verified");
        }
        const link = await firebase_1.auth.generateEmailVerificationLink(userRecord.email);
        firebase_functions_1.logger.info("Email verification link generated", { userId });
        return {
            success: true,
            message: "Verification link generated",
            link,
        };
    }
    catch (error) {
        firebase_functions_1.logger.error("Error generating verification link", { error: error.message });
        if (error.code === "auth/user-not-found") {
            throw new https_1.HttpsError("not-found", "User not found");
        }
        throw new https_1.HttpsError("internal", "Failed to generate verification link");
    }
});
//# sourceMappingURL=index.js.map