"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.slSetUserRole = exports.slUpdateLastLogin = exports.slGetProfile = exports.slSyncGoogleUser = void 0;
const https_1 = require("firebase-functions/v2/https");
const firebase_1 = require("../config/firebase");
/**
 * Sync Google user to Firestore after authentication
 * Called automatically after Google Sign-In
 */
exports.slSyncGoogleUser = (0, https_1.onCall)({ cors: true }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
    }
    const uid = request.auth.uid;
    // Resolve email from token (fastest) or Auth record
    const normalizedEmail = (request.auth.token.email ||
        "").trim().toLowerCase();
    // --- 1. Always check pending_registrations first ---
    let pendingData = null;
    if (normalizedEmail) {
        const pendingSnap = await firebase_1.db
            .collection("pending_registrations")
            .doc(normalizedEmail)
            .get();
        if (pendingSnap.exists) {
            pendingData = pendingSnap.data();
        }
    }
    // --- 2. Check if Firestore profile already exists ---
    const userDoc = await firebase_1.db.collection("users").doc(uid).get();
    // --- SECURITY LOGIC ---
    // - If user EXISTS in Firestore: Allow login (existing user)
    // - If user is NEW and has pendingData: Create with invited role
    // - If user is NEW and NO pendingData: REJECT (unauthorized)
    if (!userDoc.exists && !pendingData) {
        // NEW user without invitation → REJECT
        await firebase_1.auth.deleteUser(uid).catch(() => { });
        throw new https_1.HttpsError("permission-denied", "Tu correo no está registrado en el sistema. Contacta al administrador para solicitar acceso.");
    }
    // If existing user without pendingData → validate status then allow
    if (userDoc.exists && !pendingData) {
        const existingData = userDoc.data();
        const existingStatus = existingData?.status;
        const existingRole = existingData?.role || "VIEWER";
        // Only users with 'active' status can log in
        if (existingStatus !== "active") {
            await firebase_1.auth.deleteUser(uid).catch(() => { });
            throw new https_1.HttpsError("permission-denied", "Tu cuenta no está activa. Contacta al administrador.");
        }
        // Always re-sync claims so the token reflects the correct role
        const currentClaims = request.auth.token;
        if (currentClaims?.role !== existingRole) {
            await firebase_1.auth.setCustomUserClaims(uid, { role: existingRole });
        }
        const now = firebase_1.admin.firestore.FieldValue.serverTimestamp();
        await firebase_1.db.collection("users").doc(uid).update({
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
    let role = "VIEWER";
    let status = "pending_approval";
    if (pendingData) {
        role = pendingData.role || "VIEWER";
        status = "active";
    }
    // Set correct custom claims regardless of what onUserCreate may have set
    await firebase_1.auth.setCustomUserClaims(uid, { role });
    const firebaseUser = await firebase_1.auth.getUser(uid);
    const now = firebase_1.admin.firestore.FieldValue.serverTimestamp();
    const userData = {
        id: uid,
        email: normalizedEmail || firebaseUser.email || null,
        fullName: pendingData?.fullName ||
            firebaseUser.displayName ||
            request.auth.token.name ||
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
    await firebase_1.db.collection("users").doc(uid).set(userData, { merge: true });
    // --- 5. Clean up pending_registration ---
    if (pendingData && normalizedEmail) {
        await firebase_1.db
            .collection("pending_registrations")
            .doc(normalizedEmail)
            .delete()
            .catch(() => { });
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
});
/**
 * Get user profile
 */
exports.slGetProfile = (0, https_1.onCall)({ cors: true }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
    }
    const uid = request.auth.uid;
    const userDoc = await firebase_1.db.collection("users").doc(uid).get();
    if (!userDoc.exists) {
        throw new https_1.HttpsError("not-found", "User not found");
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
});
/**
 * Update last login timestamp
 */
exports.slUpdateLastLogin = (0, https_1.onCall)({ cors: true }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
    }
    const uid = request.auth.uid;
    await firebase_1.db.collection("users").doc(uid).update({
        lastLogin: firebase_1.admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase_1.admin.firestore.FieldValue.serverTimestamp(),
    });
    return { success: true, updated: true };
});
/**
 * Set user role (admin only)
 */
exports.slSetUserRole = (0, https_1.onCall)({ cors: true }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
    }
    const callerRole = request.auth.token.role;
    if (!["SUPER_ADMIN", "ADMIN"].includes(callerRole)) {
        throw new https_1.HttpsError("permission-denied", "Admin access required");
    }
    const { userId, role } = request.data;
    if (!userId || !role) {
        throw new https_1.HttpsError("invalid-argument", "userId and role are required");
    }
    const validRoles = ["SUPER_ADMIN", "ADMIN", "AGENT", "DELIVERY", "VIEWER"];
    if (!validRoles.includes(role)) {
        throw new https_1.HttpsError("invalid-argument", `Invalid role. Must be one of: ${validRoles.join(", ")}`);
    }
    await firebase_1.auth.setCustomUserClaims(userId, { role });
    await firebase_1.db.collection("users").doc(userId).update({
        role,
        updatedAt: firebase_1.admin.firestore.FieldValue.serverTimestamp(),
    });
    return { success: true, userId, role };
});
//# sourceMappingURL=handlers.js.map