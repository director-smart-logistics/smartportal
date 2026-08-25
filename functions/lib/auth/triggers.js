"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onUserDelete = exports.onUserCreate = void 0;
const v1_1 = require("firebase-functions/v1");
const firebase_1 = require("../config/firebase");
const audit_service_1 = require("../audit/audit-service");
exports.onUserCreate = v1_1.auth.user().onCreate(async (user) => {
    const { uid, email, displayName, photoURL, phoneNumber, providerData } = user;
    console.log(`New user created: ${uid} (${email})`);
    const userDoc = await firebase_1.db.collection("users").doc(uid).get();
    if (userDoc.exists) {
        void (0, audit_service_1.logAuthAuditEvent)(uid, "user_registered", {
            email,
            displayName,
            provider: providerData?.[0]?.providerId ?? "email",
        });
        return;
    }
    const now = firebase_1.admin.firestore.FieldValue.serverTimestamp();
    const isGoogleProvider = providerData?.some((p) => p.providerId === "google.com");
    // Check if the admin pre-registered this email via slCreateUser
    const normalizedEmail = (email || "").trim().toLowerCase();
    let role = "VIEWER";
    let status = "pending_approval";
    let pendingData = null;
    if (normalizedEmail) {
        const pendingSnap = await firebase_1.db.collection("pending_registrations").doc(normalizedEmail).get();
        if (pendingSnap.exists) {
            pendingData = pendingSnap.data();
            role = pendingData.role || "VIEWER";
            status = "active";
            console.log(`Pre-registered user found: ${normalizedEmail} — role=${role}`);
        }
    }
    // Set custom claims so the token carries the role immediately
    await firebase_1.admin.auth().setCustomUserClaims(uid, { role });
    await firebase_1.db.collection("users").doc(uid).set({
        id: uid,
        email: normalizedEmail || null,
        fullName: pendingData?.fullName || displayName || email?.split("@")[0] || "User",
        photoURL: photoURL || null,
        phone: pendingData?.phone || phoneNumber || null,
        role,
        status,
        provider: isGoogleProvider ? "google" : "email",
        createdAt: now,
        updatedAt: now,
        lastLogin: null,
    });
    // Clean up the pending registration now that the user has been created
    if (pendingData && normalizedEmail) {
        await firebase_1.db.collection("pending_registrations").doc(normalizedEmail).delete();
        console.log(`Pending registration cleared for: ${normalizedEmail}`);
    }
    console.log(`User profile created for: ${uid} (${status}, role=${role})`);
    void (0, audit_service_1.logAuthAuditEvent)(uid, "user_registered", {
        email,
        displayName,
        provider: providerData?.[0]?.providerId ?? "email",
        role,
        status,
    });
});
exports.onUserDelete = v1_1.auth.user().onDelete(async (user) => {
    const { uid, email } = user;
    console.log(`User deleted from Auth: ${uid} (${email})`);
    const now = firebase_1.admin.firestore.FieldValue.serverTimestamp();
    const normalizedEmail = (email || "").trim().toLowerCase();
    // Use set+merge so this doesn't fail if slDeleteUser already hard-deleted the doc
    const userRef = firebase_1.db.collection("users").doc(uid);
    const userSnap = await userRef.get();
    if (userSnap.exists) {
        await userRef.set({ status: "deleted", updatedAt: now, deletedAt: now }, { merge: true });
        console.log(`User profile marked as deleted: ${uid}`);
    }
    // Clean up any pending_registration entry for this email
    if (normalizedEmail) {
        const pendingRef = firebase_1.db.collection("pending_registrations").doc(normalizedEmail);
        const pendingSnap = await pendingRef.get();
        if (pendingSnap.exists) {
            await pendingRef.delete();
            console.log(`Pending registration cleared on Auth delete: ${normalizedEmail}`);
        }
    }
    await firebase_1.db.collection("auditLogs").add({
        userId: uid,
        action: "USER_DELETED",
        entity: "users",
        entityId: uid,
        oldValues: { status: "active" },
        newValues: { status: "deleted" },
        createdAt: now,
    });
    void (0, audit_service_1.logAuthAuditEvent)(uid, "user_deleted_auth", { email });
});
//# sourceMappingURL=triggers.js.map