import { auth } from "firebase-functions/v1";
import { UserRecord } from "firebase-admin/auth";
import { db, admin } from "../config/firebase";
import { logAuthAuditEvent } from "../audit/audit-service";

export const onUserCreate = auth.user().onCreate(async (user: UserRecord) => {
  const { uid, email, displayName, photoURL, phoneNumber, providerData } = user;

  console.log(`New user created: ${uid} (${email})`);

  const userDoc = await db.collection("users").doc(uid).get();
  if (userDoc.exists) {
    void logAuthAuditEvent(uid, "user_registered", {
      email,
      displayName,
      provider: providerData?.[0]?.providerId ?? "email",
    });
    return;
  }

  const now = admin.firestore.FieldValue.serverTimestamp();
  const isGoogleProvider = providerData?.some((p) => p.providerId === "google.com");

  // Check if the admin pre-registered this email via slCreateUser
  const normalizedEmail = (email || "").trim().toLowerCase();
  let role = "VIEWER";
  let status = "pending_approval";
  let pendingData: Record<string, any> | null = null;

  if (normalizedEmail) {
    const pendingSnap = await db.collection("pending_registrations").doc(normalizedEmail).get();
    if (pendingSnap.exists) {
      pendingData = pendingSnap.data() as Record<string, any>;
      role = pendingData.role || "VIEWER";
      status = "active";
      console.log(`Pre-registered user found: ${normalizedEmail} — role=${role}`);
    }
  }

  // Set custom claims so the token carries the role immediately
  await admin.auth().setCustomUserClaims(uid, { role });

  await db.collection("users").doc(uid).set({
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
    await db.collection("pending_registrations").doc(normalizedEmail).delete();
    console.log(`Pending registration cleared for: ${normalizedEmail}`);
  }

  console.log(`User profile created for: ${uid} (${status}, role=${role})`);

  void logAuthAuditEvent(uid, "user_registered", {
    email,
    displayName,
    provider: providerData?.[0]?.providerId ?? "email",
    role,
    status,
  });
});

export const onUserDelete = auth.user().onDelete(async (user: UserRecord) => {
  const { uid, email } = user;

  console.log(`User deleted from Auth: ${uid} (${email})`);

  const now = admin.firestore.FieldValue.serverTimestamp();
  const normalizedEmail = (email || "").trim().toLowerCase();

  // Use set+merge so this doesn't fail if slDeleteUser already hard-deleted the doc
  const userRef = db.collection("users").doc(uid);
  const userSnap = await userRef.get();
  if (userSnap.exists) {
    await userRef.set(
      { status: "deleted", updatedAt: now, deletedAt: now },
      { merge: true }
    );
    console.log(`User profile marked as deleted: ${uid}`);
  }

  // Clean up any pending_registration entry for this email
  if (normalizedEmail) {
    const pendingRef = db.collection("pending_registrations").doc(normalizedEmail);
    const pendingSnap = await pendingRef.get();
    if (pendingSnap.exists) {
      await pendingRef.delete();
      console.log(`Pending registration cleared on Auth delete: ${normalizedEmail}`);
    }
  }

  await db.collection("auditLogs").add({
    userId: uid,
    action: "USER_DELETED",
    entity: "users",
    entityId: uid,
    oldValues: { status: "active" },
    newValues: { status: "deleted" },
    createdAt: now,
  });

  void logAuthAuditEvent(uid, "user_deleted_auth", { email });
});
