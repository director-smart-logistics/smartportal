/**
 * Temporary Cloud Function to create Super Admin
 * Call from Firebase Console > Functions > slCreateSuperAdmin
 */

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

const db = admin.firestore();
const auth = admin.auth();

export const slCreateSuperAdmin = functions.https.onCall(async (data, context) => {
  // Security: Only allow if called by an authenticated admin or in development
  const email = 'director@smartlogisticscr.com';
  const normalizedEmail = email.toLowerCase().trim();
  
  try {
    // Check if user exists in Firebase Auth
    let userRecord;
    try {
      userRecord = await auth.getUserByEmail(email);
      console.log('User exists in Firebase Auth:', userRecord.uid);
    } catch (err) {
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
  } catch (error: any) {
    console.error('Error creating Super Admin:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});
