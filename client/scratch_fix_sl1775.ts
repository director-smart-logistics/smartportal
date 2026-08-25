import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, collection, query, where, getDocs, doc, updateDoc, setDoc } from 'firebase/firestore';

const firebaseConfig = {
  projectId: 'smart-portal-admin',
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const db = getFirestore(app);

async function main() {
  const tracking = 'SL1775-20260724100546118';
  console.log(`Checking package ${tracking}...`);

  const [snap1, snap2] = await Promise.all([
    getDocs(query(collection(db, 'packages'), where('trackingNumber', '==', tracking))),
    getDocs(query(collection(db, 'packages'), where('tracking', '==', tracking))),
  ]);

  const docs = [...snap1.docs, ...snap2.docs];
  console.log(`Found ${docs.length} matching package docs`);

  for (const d of docs) {
    const data = d.data();
    console.log(`Package doc ID ${d.id}:`, data);
    await updateDoc(doc(db, 'packages', d.id), {
      consolidacion: true,
      status: 'consolidated',
      manifestId: 'consolidacion_transitoria',
      manifestNumber: 'consolidacion_transitoria',
    });
    console.log(`Updated package doc ${d.id} with consolidacion: true`);

    const cItem = {
      tracking: tracking.toUpperCase(),
      slCode: data.slCode || 'SL1775',
      customerName: data.customerName || data.nombreCliente || 'JOHELY FRANCINY ARAYA BARBOZA',
      ruta: data.ruta || 'San Jose Escazu',
      weight: data.weight || data.peso || 0.18,
      price: data.price || data.precio || 8.0,
      currency: 'USD',
      description: data.description || '',
      permisos: false,
      origin: 'Miami, FL',
      manifestNumber: data.manifestNumber || '22-07-2026DAN',
      invoiceId: 'SL1775-20260724100546118',
      invoiceNumber: 'SL1775-20260724100546118',
      invoiceStatus: 'annulled',
      status: 'consolidated',
      movedAt: new Date().toISOString(),
    };

    await setDoc(doc(db, 'manifest_consolidation', tracking.toUpperCase()), cItem, { merge: true });
    console.log(`Upserted item into manifest_consolidation for ${tracking.toUpperCase()}`);
  }

  // Also check if customer SL1775 has consolidationEnabled: true
  const custSnap = await getDocs(query(collection(db, 'customers'), where('slCode', '==', 'SL1775')));
  for (const cDoc of custSnap.docs) {
    const cData = cDoc.data();
    console.log(`Customer SL1775 doc ${cDoc.id}: consolidationEnabled=${cData.consolidationEnabled}`);
    if (!cData.consolidationEnabled) {
      await updateDoc(doc(db, 'customers', cDoc.id), { consolidationEnabled: true });
      console.log(`Enabled consolidationEnabled for customer ${cDoc.id}`);
    }
  }

  console.log('Fix script complete.');
}

main().catch(console.error);
