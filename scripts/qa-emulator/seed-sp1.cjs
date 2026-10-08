/**
 * SP1 part of the combined QA seed. Emulator only: refuses to run against anything else.
 * Creates the ADMIN invitation used by slSyncGoogleUser (portal/pending_registrations/{email}).
 */
'use strict';
const path = require('path');
const fnDir = path.join(__dirname, '../../functions');
const { initializeApp } = require(path.join(fnDir, 'node_modules/firebase-admin/lib/app'));
const { getFirestore } = require(path.join(fnDir, 'node_modules/firebase-admin/lib/firestore'));

const fsHost = process.env.FIRESTORE_EMULATOR_HOST || '';
const project = process.env.GCLOUD_PROJECT || '';
if (!/^(localhost|127\.0\.0\.1):/.test(fsHost) || !project.startsWith('demo-')) {
  console.error('❌ Not the local emulator with a demo project. Refusing to write.');
  process.exit(1);
}

const QA_ADMIN_EMAIL = 'admin@prueba.local';

(async () => {
  const db = getFirestore(initializeApp({ projectId: project }, 'qa-sp1-seed'), 'portal');
  await db.collection('pending_registrations').doc(QA_ADMIN_EMAIL).set({
    email: QA_ADMIN_EMAIL, role: 'ADMIN', fullName: 'Admin QA', createdAt: new Date().toISOString(),
  });
  console.log(`✅ SP1: invitación ADMIN para ${QA_ADMIN_EMAIL} (entrar con "Google" del emulador usando ese correo)`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
