#!/usr/bin/env node
/**
 * Script to create Super Admin user using Firebase Admin SDK
 * 
 * Prerequisites:
 * 1. Install Firebase CLI: npm install -g firebase-tools
 * 2. Login: firebase login
 * 3. Set project: firebase use smart-portal-admin
 * 4. Run: node create-super-admin.js
 * 
 * Or use npx firebase-tools directly
 */

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const DATABASE_ID = 'portal';
const { getAuth } = require('firebase-admin/auth');

// Initialize with default credentials (requires firebase login)
// Or use service account if available
let app;
try {
  // Try to use application default credentials (works with firebase login)
  app = initializeApp({
    projectId: 'smart-portal-admin'
  });
} catch (err) {
  console.error('Failed to initialize Firebase Admin. Make sure you have:');
  console.error('1. Run: firebase login');
  console.error('2. Run: firebase use smart-portal-admin');
  console.error('Or set GOOGLE_APPLICATION_CREDENTIALS env var');
  process.exit(1);
}

const db = getFirestore(app, DATABASE_ID);
const auth = getAuth(app);

async function createSuperAdmin() {
  const email = 'director@smartlogisticscr.com';
  const fullName = 'Director Tecnologica';
  
  console.log('🔧 Creating Super Admin...');
  console.log('   Email:', email);
  
  try {
    // Step 1: Find or create Firebase Auth user
    let userRecord;
    try {
      userRecord = await auth.getUserByEmail(email);
      console.log('✓ Found existing Firebase Auth user:', userRecord.uid);
    } catch (err) {
      console.log('⏳ Creating new Firebase Auth user...');
      userRecord = await auth.createUser({
        email: email,
        emailVerified: true,
        displayName: fullName,
        // Random password - user will use Google Sign-In
        password: Math.random().toString(36).slice(-12) + 'A1!',
      });
      console.log('✓ Created Firebase Auth user:', userRecord.uid);
    }

    // Step 2: Set ADMIN custom claims
    await auth.setCustomUserClaims(userRecord.uid, { role: 'ADMIN' });
    console.log('✓ Set ADMIN claims');

    // Step 3: Create/Update Firestore document
    const userRef = db.collection('users').doc(userRecord.uid);
    const userDoc = await userRef.get();
    
    const userData = {
      id: userRecord.uid,
      email: email.toLowerCase().trim(),
      fullName: fullName,
      photoURL: userRecord.photoURL || null,
      phone: userRecord.phoneNumber || null,
      role: 'ADMIN',
      status: 'active',
      provider: 'google',
      updatedAt: new Date().toISOString(),
      lastLogin: new Date().toISOString(),
    };
    
    if (userDoc.exists) {
      // Update existing
      await userRef.update(userData);
      console.log('✓ Updated existing Firestore document');
    } else {
      // Create new
      userData.createdAt = new Date().toISOString();
      await userRef.set(userData);
      console.log('✓ Created Firestore document');
    }

    console.log('\n✅ Super Admin created successfully!');
    console.log('   UID:', userRecord.uid);
    console.log('   Email:', email);
    console.log('   Role: SUPER_ADMIN');
    console.log('\n📝 You can now login with Google using:', email);
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the function
createSuperAdmin();
