"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.slGetUser = exports.slListUsers = exports.slSendEmailVerification = exports.slSendPasswordReset = exports.slDeleteUser = exports.slUpdateUser = exports.slCreateUser = void 0;
const https_1 = require("firebase-functions/v2/https");
const auth_1 = require("firebase-admin/auth");
const firestore_1 = require("firebase-admin/firestore");
const firebase_functions_1 = require("firebase-functions");
const auth = (0, auth_1.getAuth)();
const db = (0, firestore_1.getFirestore)();
// ============================================
// Helper Functions
// ============================================
async function createUserProfile(uid, data) {
    const userProfile = {
        uid,
        email: data.email,
        fullName: data.fullName,
        role: data.role,
        phone: data.phone || null,
        emailVerified: data.emailVerified,
        disabled: false,
        status: "active",
        createdAt: firestore_1.FieldValue.serverTimestamp(),
        updatedAt: firestore_1.FieldValue.serverTimestamp(),
        lastLoginAt: null,
    };
    await db.collection("users").doc(uid).set(userProfile);
    return userProfile;
}
async function updateUserProfile(uid, updates) {
    const updateData = {
        ...updates,
        updatedAt: firestore_1.FieldValue.serverTimestamp(),
    };
    await db.collection("users").doc(uid).update(updateData);
}
// ============================================
// Create User (Auth + Firestore)
// ============================================
exports.slCreateUser = (0, https_1.onCall)({ cors: true }, async (request) => {
    // Only admins can create users
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
    }
    // Check if caller is admin
    const callerDoc = await db.collection("users").doc(request.auth.uid).get();
    const callerRole = callerDoc.data()?.role;
    if (callerRole !== "ADMIN") {
        throw new https_1.HttpsError("permission-denied", "Only admins can create users");
    }
    const { email, password, fullName, role, phone, sendVerificationEmail } = request.data;
    // Validation
    if (!email || !password || !fullName || !role) {
        throw new https_1.HttpsError("invalid-argument", "Missing required fields");
    }
    if (password.length < 6) {
        throw new https_1.HttpsError("invalid-argument", "Password must be at least 6 characters");
    }
    try {
        // Create user in Firebase Auth
        const userRecord = await auth.createUser({
            email,
            password,
            displayName: fullName,
            emailVerified: false,
        });
        firebase_functions_1.logger.info("User created in Auth", { uid: userRecord.uid, email });
        // Create user profile in Firestore
        await createUserProfile(userRecord.uid, {
            email,
            fullName,
            role,
            phone,
            emailVerified: false,
        });
        firebase_functions_1.logger.info("User profile created", { uid: userRecord.uid });
        // Send verification email if requested
        if (sendVerificationEmail) {
            try {
                const link = await auth.generateEmailVerificationLink(email);
                firebase_functions_1.logger.info("Email verification link generated", { uid: userRecord.uid });
                // TODO: Send email via Resend or your email service
            }
            catch (emailError) {
                firebase_functions_1.logger.warn("Failed to generate verification link", { error: emailError });
            }
        }
        return {
            success: true,
            data: {
                uid: userRecord.uid,
                email: userRecord.email,
                fullName,
                role,
                emailVerified: false,
            },
            message: "User created successfully",
        };
    }
    catch (error) {
        firebase_functions_1.logger.error("Error creating user", { error: error.message });
        // Handle specific Auth errors
        if (error.code === "auth/email-already-exists") {
            throw new https_1.HttpsError("already-exists", "Email already in use");
        }
        if (error.code === "auth/invalid-email") {
            throw new https_1.HttpsError("invalid-argument", "Invalid email format");
        }
        if (error.code === "auth/weak-password") {
            throw new https_1.HttpsError("invalid-argument", "Password is too weak");
        }
        throw new https_1.HttpsError("internal", error.message || "Failed to create user");
    }
});
// ============================================
// Update User
// ============================================
exports.slUpdateUser = (0, https_1.onCall)({ cors: true }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
    }
    const callerDoc = await db.collection("users").doc(request.auth.uid).get();
    const callerRole = callerDoc.data()?.role;
    if (callerRole !== "ADMIN") {
        throw new https_1.HttpsError("permission-denied", "Only admins can update users");
    }
    const { uid, email, fullName, role, phone, disabled } = request.data;
    if (!uid) {
        throw new https_1.HttpsError("invalid-argument", "User ID is required");
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
        }
        if (phone !== undefined) {
            firestoreUpdates.phone = phone;
        }
        // Update Firebase Auth
        if (Object.keys(authUpdates).length > 0) {
            await auth.updateUser(uid, authUpdates);
            firebase_functions_1.logger.info("User updated in Auth", { uid });
        }
        // Update Firestore profile
        if (Object.keys(firestoreUpdates).length > 0) {
            await updateUserProfile(uid, firestoreUpdates);
            firebase_functions_1.logger.info("User profile updated", { uid });
        }
        return {
            success: true,
            message: "User updated successfully",
        };
    }
    catch (error) {
        firebase_functions_1.logger.error("Error updating user", { error: error.message });
        if (error.code === "auth/user-not-found") {
            throw new https_1.HttpsError("not-found", "User not found");
        }
        if (error.code === "auth/email-already-exists") {
            throw new https_1.HttpsError("already-exists", "Email already in use");
        }
        throw new https_1.HttpsError("internal", error.message || "Failed to update user");
    }
});
// ============================================
// Delete User (Auth + Firestore)
// ============================================
exports.slDeleteUser = (0, https_1.onCall)({ cors: true }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
    }
    const callerDoc = await db.collection("users").doc(request.auth.uid).get();
    const callerRole = callerDoc.data()?.role;
    if (callerRole !== "ADMIN") {
        throw new https_1.HttpsError("permission-denied", "Only admins can delete users");
    }
    const { uid } = request.data;
    if (!uid) {
        throw new https_1.HttpsError("invalid-argument", "User ID is required");
    }
    // Prevent self-deletion
    if (uid === request.auth.uid) {
        throw new https_1.HttpsError("failed-precondition", "Cannot delete your own account");
    }
    try {
        // Delete from Firebase Auth
        await auth.deleteUser(uid);
        firebase_functions_1.logger.info("User deleted from Auth", { uid });
        // Delete from Firestore
        await db.collection("users").doc(uid).delete();
        firebase_functions_1.logger.info("User profile deleted", { uid });
        return {
            success: true,
            message: "User deleted successfully",
        };
    }
    catch (error) {
        firebase_functions_1.logger.error("Error deleting user", { error: error.message });
        if (error.code === "auth/user-not-found") {
            throw new https_1.HttpsError("not-found", "User not found");
        }
        throw new https_1.HttpsError("internal", error.message || "Failed to delete user");
    }
});
// ============================================
// Send Password Reset Email
// ============================================
exports.slSendPasswordReset = (0, https_1.onCall)({ cors: true }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
    }
    const callerDoc = await db.collection("users").doc(request.auth.uid).get();
    const callerRole = callerDoc.data()?.role;
    if (callerRole !== "ADMIN") {
        throw new https_1.HttpsError("permission-denied", "Only admins can reset passwords");
    }
    const { email } = request.data;
    if (!email) {
        throw new https_1.HttpsError("invalid-argument", "Email is required");
    }
    try {
        const link = await auth.generatePasswordResetLink(email);
        firebase_functions_1.logger.info("Password reset link generated", { email });
        // TODO: Send email via Resend
        // For now, return the link (in production, send via email)
        return {
            success: true,
            message: "Password reset email sent",
            link, // Remove this in production
        };
    }
    catch (error) {
        firebase_functions_1.logger.error("Error generating password reset link", { error: error.message });
        if (error.code === "auth/user-not-found") {
            throw new https_1.HttpsError("not-found", "User not found");
        }
        throw new https_1.HttpsError("internal", error.message || "Failed to send password reset");
    }
});
// ============================================
// Send Email Verification
// ============================================
exports.slSendEmailVerification = (0, https_1.onCall)({ cors: true }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
    }
    const callerDoc = await db.collection("users").doc(request.auth.uid).get();
    const callerRole = callerDoc.data()?.role;
    if (callerRole !== "ADMIN") {
        throw new https_1.HttpsError("permission-denied", "Only admins can send verification emails");
    }
    const { uid } = request.data;
    if (!uid) {
        throw new https_1.HttpsError("invalid-argument", "User ID is required");
    }
    try {
        const userRecord = await auth.getUser(uid);
        if (userRecord.emailVerified) {
            throw new https_1.HttpsError("failed-precondition", "Email already verified");
        }
        const link = await auth.generateEmailVerificationLink(userRecord.email);
        firebase_functions_1.logger.info("Email verification link generated", { uid });
        // TODO: Send email via Resend
        return {
            success: true,
            message: "Verification email sent",
            link, // Remove this in production
        };
    }
    catch (error) {
        firebase_functions_1.logger.error("Error sending verification email", { error: error.message });
        if (error.code === "auth/user-not-found") {
            throw new https_1.HttpsError("not-found", "User not found");
        }
        throw new https_1.HttpsError("internal", error.message || "Failed to send verification email");
    }
});
// ============================================
// List Users (with pagination)
// ============================================
exports.slListUsers = (0, https_1.onCall)({ cors: true }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
    }
    const { limit = 100, pageToken } = request.data || {};
    try {
        // Get users from Auth
        const listUsersResult = await auth.listUsers(limit, pageToken);
        // Get user profiles from Firestore
        const uids = listUsersResult.users.map((u) => u.uid);
        const profileDocs = await Promise.all(uids.map((uid) => db.collection("users").doc(uid).get()));
        const users = listUsersResult.users.map((authUser, index) => {
            const profile = profileDocs[index].data();
            return {
                uid: authUser.uid,
                email: authUser.email,
                fullName: authUser.displayName || profile?.fullName || "",
                role: profile?.role || "CUSTOMER",
                phone: profile?.phone || authUser.phoneNumber,
                emailVerified: authUser.emailVerified,
                disabled: authUser.disabled,
                status: authUser.disabled ? "inactive" : (profile?.status || "active"),
                createdAt: authUser.metadata.creationTime,
                lastLoginAt: authUser.metadata.lastSignInTime,
            };
        });
        return {
            success: true,
            data: users,
            pagination: {
                nextPageToken: listUsersResult.pageToken,
                total: users.length,
            },
        };
    }
    catch (error) {
        firebase_functions_1.logger.error("Error listing users", { error: error.message });
        throw new https_1.HttpsError("internal", error.message || "Failed to list users");
    }
});
// ============================================
// Get User Details
// ============================================
exports.slGetUser = (0, https_1.onCall)({ cors: true }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
    }
    const { uid } = request.data;
    if (!uid) {
        throw new https_1.HttpsError("invalid-argument", "User ID is required");
    }
    try {
        const [authUser, profileDoc] = await Promise.all([
            auth.getUser(uid),
            db.collection("users").doc(uid).get(),
        ]);
        const profile = profileDoc.data();
        return {
            success: true,
            data: {
                uid: authUser.uid,
                email: authUser.email,
                fullName: authUser.displayName || profile?.fullName || "",
                role: profile?.role || "CUSTOMER",
                phone: profile?.phone || authUser.phoneNumber,
                emailVerified: authUser.emailVerified,
                disabled: authUser.disabled,
                status: authUser.disabled ? "inactive" : (profile?.status || "active"),
                createdAt: authUser.metadata.creationTime,
                lastLoginAt: authUser.metadata.lastSignInTime,
                customClaims: authUser.customClaims,
            },
        };
    }
    catch (error) {
        firebase_functions_1.logger.error("Error getting user", { error: error.message });
        if (error.code === "auth/user-not-found") {
            throw new https_1.HttpsError("not-found", "User not found");
        }
        throw new https_1.HttpsError("internal", error.message || "Failed to get user");
    }
});
//# sourceMappingURL=auth-management.js.map