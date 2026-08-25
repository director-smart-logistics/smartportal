import { onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "../config/firebase";
import { COLLECTIONS } from "../types/firestore";

const settingsRef = () => db.collection(COLLECTIONS.SETTINGS);

interface ListSettingsRequest {
  category?: string;
  isPublic?: boolean;
}

interface SettingRequest {
  key: string;
  value?: string;
  type?: string;
  category?: string;
  description?: string;
  isPublic?: boolean;
  countryCode?: string;
}

/**
 * List all settings
 */
export const slListSettings = onCall(
  { cors: true },
  async (request: CallableRequest<ListSettingsRequest>) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { category, isPublic } = request.data || {};
    
    let query: FirebaseFirestore.Query = settingsRef();
    
    if (category) {
      query = query.where("category", "==", category);
    }
    
    if (isPublic !== undefined) {
      query = query.where("isPublic", "==", isPublic);
    }
    
    const snapshot = await query.get();
    const settings = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
    
    return { success: true, data: settings };
  }
);

/**
 * Get setting by key
 */
export const slGetSetting = onCall(
  { cors: true },
  async (request: CallableRequest<{ key: string }>) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { key } = request.data;
    if (!key) {
      throw new HttpsError("invalid-argument", "Setting key is required");
    }
    
    const snapshot = await settingsRef().where("key", "==", key).limit(1).get();
    
    if (snapshot.empty) {
      throw new HttpsError("not-found", "Setting not found");
    }
    
    const doc = snapshot.docs[0];
    return { success: true, data: { id: doc.id, ...doc.data() } };
  }
);

/**
 * Create new setting
 */
export const slCreateSetting = onCall(
  { cors: true },
  async (request: CallableRequest<SettingRequest>) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const callerRole = request.auth.token.role as string;
    if (!["SUPER_ADMIN", "ADMIN"].includes(callerRole)) {
      throw new HttpsError("permission-denied", "Admin access required");
    }

    const { key, value, type = "string", category = "general", description, isPublic = false, countryCode } = request.data;
    
    if (!key || value === undefined) {
      throw new HttpsError("invalid-argument", "Key and value are required");
    }
    
    const existing = await settingsRef().where("key", "==", key).limit(1).get();
    if (!existing.empty) {
      throw new HttpsError("already-exists", "Setting with this key already exists");
    }
    
    const settingData = {
      key,
      value: String(value),
      type,
      category,
      description: description || null,
      isPublic,
      countryCode: countryCode || null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    
    const docRef = await settingsRef().add(settingData);
    const doc = await docRef.get();
    
    return { success: true, data: { id: doc.id, ...doc.data() } };
  }
);

/**
 * Update setting by key
 */
export const slUpdateSetting = onCall(
  { cors: true },
  async (request: CallableRequest<SettingRequest>) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const callerRole = request.auth.token.role as string;
    if (!["SUPER_ADMIN", "ADMIN"].includes(callerRole)) {
      throw new HttpsError("permission-denied", "Admin access required");
    }

    const { key, value, type, category, description, isPublic, countryCode } = request.data;
    
    if (!key) {
      throw new HttpsError("invalid-argument", "Setting key is required");
    }
    
    const snapshot = await settingsRef().where("key", "==", key).limit(1).get();
    
    if (snapshot.empty) {
      throw new HttpsError("not-found", "Setting not found");
    }
    
    const docRef = snapshot.docs[0].ref;
    const updateData: Record<string, unknown> = {
      updatedAt: FieldValue.serverTimestamp(),
    };
    
    if (value !== undefined) updateData.value = String(value);
    if (type !== undefined) updateData.type = type;
    if (category !== undefined) updateData.category = category;
    if (description !== undefined) updateData.description = description;
    if (isPublic !== undefined) updateData.isPublic = isPublic;
    if (countryCode !== undefined) updateData.countryCode = countryCode;
    
    await docRef.update(updateData);
    const updated = await docRef.get();
    
    return { success: true, data: { id: updated.id, ...updated.data() } };
  }
);

/**
 * Delete setting by key (admin only)
 */
export const slDeleteSetting = onCall(
  { cors: true },
  async (request: CallableRequest<{ key: string }>) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const callerRole = request.auth.token.role as string;
    if (!["SUPER_ADMIN", "ADMIN"].includes(callerRole)) {
      throw new HttpsError("permission-denied", "Admin access required");
    }

    const { key } = request.data;
    
    if (!key) {
      throw new HttpsError("invalid-argument", "Setting key is required");
    }
    
    const snapshot = await settingsRef().where("key", "==", key).limit(1).get();
    
    if (snapshot.empty) {
      throw new HttpsError("not-found", "Setting not found");
    }
    
    await snapshot.docs[0].ref.delete();
    
    return { success: true, message: "Setting deleted successfully" };
  }
);

/**
 * Get multiple settings by keys
 */
export const slBulkGetSettings = onCall(
  { cors: true },
  async (request: CallableRequest<{ keys: string[] }>) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { keys } = request.data;
    
    if (!Array.isArray(keys) || keys.length === 0) {
      throw new HttpsError("invalid-argument", "Keys array is required");
    }
    
    const snapshot = await settingsRef().where("key", "in", keys.slice(0, 10)).get();
    
    const settings: Record<string, string> = {};
    snapshot.docs.forEach((doc) => {
      const data = doc.data();
      settings[data.key] = data.value;
    });
    
    return { success: true, data: settings };
  }
);
