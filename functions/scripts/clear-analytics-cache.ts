import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

initializeApp({
  projectId: 'smart-portal-admin',
});
const db = getFirestore('portal');

async function clearAnalyticsCache() {
  console.log("Fetching documents in monthly_analytics collection...");
  const snap = await db.collection('monthly_analytics').get();
  console.log(`Found ${snap.size} cached monthly analytics documents.`);

  for (const doc of snap.docs) {
    const data = doc.data();
    console.log(`- Doc ID: ${doc.id} | newCustomersCount: ${data.newCustomersCount}`);
    console.log(`  Deleting stale document ${doc.id}...`);
    await doc.ref.delete();
  }

  console.log("Successfully cleared stale monthly_analytics documents.");
  process.exit(0);
}

clearAnalyticsCache().catch(err => {
  console.error("Error clearing analytics cache:", err);
  process.exit(1);
});
