/**
 * One-time migration: upsert the 'Desconocida' route into the production
 * Firestore `routes` collection (smart-portal-admin project).
 *
 * Run with:
 *   npx ts-node scripts/add-desconocida-route.ts
 *
 * Prerequisites:
 *   gcloud auth application-default login
 */

import * as admin from 'firebase-admin';

admin.initializeApp({ projectId: 'smart-portal-admin' });

const db = admin.firestore();

async function main() {
  const ref = db.collection('routes').doc('desconocida');
  const snap = await ref.get();

  const payload = {
    id: 'desconocida',
    name: 'Desconocida',
    type: 'unknown',
    color: 'zinc-500',
    areas: ['Sin Ruta Asignada'],
    cantons: ['N/A'],
    province: 'N/A',
    status: 'active',
    active: true,
    description: 'Paquetes cuyo cliente aún no está registrado o no tiene ruta asignada.',
    originLocation: 'SmartLogistics',
    destinationLocation: 'Desconocida',
    totalPackages: 0,
    completedPackages: 0,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  if (snap.exists) {
    await ref.update(payload);
    console.log('✓ Route "Desconocida" updated (doc already existed).');
  } else {
    await ref.set({
      ...payload,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log('✓ Route "Desconocida" created successfully.');
  }

  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
