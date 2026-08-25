import { initializeApp, applicationDefault, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

// Initialize Firebase Admin using application default credentials
if (getApps().length === 0) {
  initializeApp({
    credential: applicationDefault(),
    projectId: 'smart-portal-admin',
  });
}

const db = getFirestore('portal');
const auth = getAuth();

async function createAdminUser() {
  const uid = 'WGMLE2vXiWS9qB7QGr4qmsqvhFN2';
  const email = 'director@smartlogisticscr.com';
  
  const now = Timestamp.now();
  
  // User profile data based on DTO structure
  const userProfile = {
    id: uid,
    email: email,
    fullName: 'Dirección Tecnologica',
    phone: null,
    role: 'ADMIN',
    status: 'active',
    photoURL: 'https://lh3.googleusercontent.com/a/ACg8ocKw5DsBlctTJxNsbHqaSvSuVeudQK4emF1c-4tcDO4OkkbeAA=s96-c',
    lastLogin: now,
    createdAt: now,
    updatedAt: now,
  };
  
  try {
    // Create user document in Firestore
    await db.collection('users').doc(uid).set(userProfile);
    console.log(`✅ User profile created for ${email}`);
    
    // Set custom claims for the user in Firebase Auth
    await auth.setCustomUserClaims(uid, {
      role: 'ADMIN',
    });
    console.log(`✅ Custom claims set for ${email} with role: ADMIN`);
    
    // Verify the user was created
    const userDoc = await db.collection('users').doc(uid).get();
    console.log('User document:', userDoc.data());
    
  } catch (error) {
    console.error('Error creating admin user:', error);
    process.exit(1);
  }
}

createAdminUser()
  .then(() => {
    console.log('Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Failed:', error);
    process.exit(1);
  });
