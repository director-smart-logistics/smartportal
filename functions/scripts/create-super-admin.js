/**
 * Script to create Super Admin user document in Firestore
 * Run: node scripts/create-super-admin.js
 * 
 * This creates the user document for director@smartlogisticscr.com
 * with SUPER_ADMIN role.
 */

const admin = require('firebase-admin');

// Initialize Firebase Admin
const serviceAccount = require('../serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'smart-portal-admin'
});

const db = admin.firestore();
const auth = admin.auth();

async function createSuperAdmin() {
  const email = 'director@smartlogisticscr.com';
  const normalizedEmail = email.toLowerCase().trim();
  
  try {
    // Check if user exists in Firebase Auth
    let userRecord;
    try {
      userRecord = await auth.getUserByEmail(email);
      console.log('✓ User exists in Firebase Auth:', userRecord.uid);
    } catch (err) {
      console.log('× User not found in Firebase Auth, creating...');
      userRecord = await auth.createUser({
        email: email,
        emailVerified: true,
        displayName: 'Director Tecnologica',
        password: Math.random().toString(36).slice(-12), // Random password, user will use Google Sign-In
      });
      console.log('✓ Created user in Firebase Auth:', userRecord.uid);
    }

    // Set custom claims
    await auth.setCustomUserClaims(userRecord.uid, { role: 'SUPER_ADMIN' });
    console.log('✓ Set SUPER_ADMIN claims');

    // Check if user document exists in Firestore
    const userDoc = await db.collection('users').doc(userRecord.uid).get();
    
    if (userDoc.exists) {
      console.log('✓ User document already exists in Firestore');
      // Update to ensure role is SUPER_ADMIN
      await db.collection('users').doc(userRecord.uid).update({
        role: 'SUPER_ADMIN',
        status: 'active',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      console.log('✓ Updated role to SUPER_ADMIN');
    } else {
      // Create user document
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
      });
      console.log('✓ Created user document in Firestore');
    }

    console.log('\n✅ Super Admin created successfully!');
    console.log('   Email:', email);
    console.log('   UID:', userRecord.uid);
    console.log('   Role: SUPER_ADMIN');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

createSuperAdmin();
