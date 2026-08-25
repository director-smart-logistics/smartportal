#!/usr/bin/env node
/**
 * Simple script to create Super Admin using firebase CLI directly
 * This uses exec to run firebase commands
 */

const { execSync } = require('child_process');

const email = 'director@smartlogisticscr.com';
const uid = 'IFmsMFAOpRhshTFFIGooQHmJHa92'; // From previous output

console.log('🔧 Setting SUPER_ADMIN claims for:', email);
console.log('   UID:', uid);

try {
  // Set custom claims using firebase CLI
  const result = execSync(
    `firebase auth:customClaims ${uid} --claims '{"role":"SUPER_ADMIN"}'`,
    { encoding: 'utf8', cwd: '/Users/jbricenoz/Workspace/smartlogistics/smart-portal-1/functions' }
  );
  console.log('✓ Custom claims set:', result);
} catch (err) {
  console.error('❌ Error setting claims:', err.stderr || err.message);
}

console.log('\n📝 Now create the Firestore document manually:');
console.log('   1. Go to: https://console.firebase.google.com/project/smart-portal-admin/firestore');
console.log('   2. Create collection: users');
console.log('   3. Document ID:', uid);
console.log('   4. Add these fields:');
console.log('');
console.log(JSON.stringify({
  id: uid,
  email: email,
  fullName: 'Director Tecnologica',
  photoURL: null,
  phone: null,
  role: 'SUPER_ADMIN',
  status: 'active',
  provider: 'google',
  createdAt: 'Timestamp (now)',
  updatedAt: 'Timestamp (now)',
  lastLogin: 'Timestamp (now)'
}, null, 2));
