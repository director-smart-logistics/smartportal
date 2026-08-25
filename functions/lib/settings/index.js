"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.slBulkGetSettings = exports.slDeleteSetting = exports.slUpdateSetting = exports.slCreateSetting = exports.slGetSetting = exports.slListSettings = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const firebase_1 = require("../config/firebase");
const firestore_2 = require("../types/firestore");
const settingsRef = () => firebase_1.db.collection(firestore_2.COLLECTIONS.SETTINGS);
/**
 * List all settings
 */
exports.slListSettings = (0, https_1.onCall)({ cors: true }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
    }
    const { category, isPublic } = request.data || {};
    let query = settingsRef();
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
});
/**
 * Get setting by key
 */
exports.slGetSetting = (0, https_1.onCall)({ cors: true }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
    }
    const { key } = request.data;
    if (!key) {
        throw new https_1.HttpsError("invalid-argument", "Setting key is required");
    }
    const snapshot = await settingsRef().where("key", "==", key).limit(1).get();
    if (snapshot.empty) {
        throw new https_1.HttpsError("not-found", "Setting not found");
    }
    const doc = snapshot.docs[0];
    return { success: true, data: { id: doc.id, ...doc.data() } };
});
/**
 * Create new setting
 */
exports.slCreateSetting = (0, https_1.onCall)({ cors: true }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
    }
    const callerRole = request.auth.token.role;
    if (!["SUPER_ADMIN", "ADMIN"].includes(callerRole)) {
        throw new https_1.HttpsError("permission-denied", "Admin access required");
    }
    const { key, value, type = "string", category = "general", description, isPublic = false, countryCode } = request.data;
    if (!key || value === undefined) {
        throw new https_1.HttpsError("invalid-argument", "Key and value are required");
    }
    const existing = await settingsRef().where("key", "==", key).limit(1).get();
    if (!existing.empty) {
        throw new https_1.HttpsError("already-exists", "Setting with this key already exists");
    }
    const settingData = {
        key,
        value: String(value),
        type,
        category,
        description: description || null,
        isPublic,
        countryCode: countryCode || null,
        createdAt: firestore_1.FieldValue.serverTimestamp(),
        updatedAt: firestore_1.FieldValue.serverTimestamp(),
    };
    const docRef = await settingsRef().add(settingData);
    const doc = await docRef.get();
    return { success: true, data: { id: doc.id, ...doc.data() } };
});
/**
 * Update setting by key
 */
exports.slUpdateSetting = (0, https_1.onCall)({ cors: true }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
    }
    const callerRole = request.auth.token.role;
    if (!["SUPER_ADMIN", "ADMIN"].includes(callerRole)) {
        throw new https_1.HttpsError("permission-denied", "Admin access required");
    }
    const { key, value, type, category, description, isPublic, countryCode } = request.data;
    if (!key) {
        throw new https_1.HttpsError("invalid-argument", "Setting key is required");
    }
    const snapshot = await settingsRef().where("key", "==", key).limit(1).get();
    if (snapshot.empty) {
        throw new https_1.HttpsError("not-found", "Setting not found");
    }
    const docRef = snapshot.docs[0].ref;
    const updateData = {
        updatedAt: firestore_1.FieldValue.serverTimestamp(),
    };
    if (value !== undefined)
        updateData.value = String(value);
    if (type !== undefined)
        updateData.type = type;
    if (category !== undefined)
        updateData.category = category;
    if (description !== undefined)
        updateData.description = description;
    if (isPublic !== undefined)
        updateData.isPublic = isPublic;
    if (countryCode !== undefined)
        updateData.countryCode = countryCode;
    await docRef.update(updateData);
    const updated = await docRef.get();
    return { success: true, data: { id: updated.id, ...updated.data() } };
});
/**
 * Delete setting by key (admin only)
 */
exports.slDeleteSetting = (0, https_1.onCall)({ cors: true }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
    }
    const callerRole = request.auth.token.role;
    if (!["SUPER_ADMIN", "ADMIN"].includes(callerRole)) {
        throw new https_1.HttpsError("permission-denied", "Admin access required");
    }
    const { key } = request.data;
    if (!key) {
        throw new https_1.HttpsError("invalid-argument", "Setting key is required");
    }
    const snapshot = await settingsRef().where("key", "==", key).limit(1).get();
    if (snapshot.empty) {
        throw new https_1.HttpsError("not-found", "Setting not found");
    }
    await snapshot.docs[0].ref.delete();
    return { success: true, message: "Setting deleted successfully" };
});
/**
 * Get multiple settings by keys
 */
exports.slBulkGetSettings = (0, https_1.onCall)({ cors: true }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
    }
    const { keys } = request.data;
    if (!Array.isArray(keys) || keys.length === 0) {
        throw new https_1.HttpsError("invalid-argument", "Keys array is required");
    }
    const snapshot = await settingsRef().where("key", "in", keys.slice(0, 10)).get();
    const settings = {};
    snapshot.docs.forEach((doc) => {
        const data = doc.data();
        settings[data.key] = data.value;
    });
    return { success: true, data: settings };
});
//# sourceMappingURL=index.js.map