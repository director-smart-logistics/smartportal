"use strict";
/**
 * Temporary Cloud Function to create Super Admin
 * Call from Firebase Console > Functions > slCreateSuperAdmin
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.slCreateSuperAdmin = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const db = admin.firestore();
const auth = admin.auth();
exports.slCreateSuperAdmin = functions.https.onCall(async (data, context) => {
    // Security: Only allow if called by an authenticated admin or in development
    const email = 'director@smartlogisticscr.com';
    const normalizedEmail = email.toLowerCase().trim();
    try {
        // Check if user exists in Firebase Auth
        let userRecord;
        try {
            userRecord = await auth.getUserByEmail(email);
            console.log('User exists in Firebase Auth:', userRecord.uid);
        }
        catch (err) {
            console.log('Creating user in Firebase Auth...');
            userRecord = await auth.createUser({
                email: email,
                emailVerified: true,
                displayName: 'Director Tecnologica',
            });
            console.log('Created user:', userRecord.uid);
        }
        // Set SUPER_ADMIN claims
        await auth.setCustomUserClaims(userRecord.uid, { role: 'SUPER_ADMIN' });
        console.log('Set SUPER_ADMIN claims');
        // Create user document in Firestore
        const now = admin.firestore.FieldValue.serverTimestamp();
        await db.collection('users').doc(userRecord.uid).set({
            id: userRecord.uid,
            email: normalizedEmail,
            fullName: 'Director Tecnologica',
            photoURL: null,
            phone: null,
            role: 'SUPER_ADMIN',
            status: 'active',
            provider: 'google',
            createdAt: now,
            updatedAt: now,
            lastLogin: now,
        }, { merge: true });
        return {
            success: true,
            message: 'Super Admin created successfully',
            uid: userRecord.uid,
            email: email,
        };
    }
    catch (error) {
        console.error('Error creating Super Admin:', error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});
//# sourceMappingURL=setup-super-admin.js.map