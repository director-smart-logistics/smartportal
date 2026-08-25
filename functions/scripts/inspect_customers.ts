import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (getApps().length === 0) {
  initializeApp({ projectId: 'smart-portal-admin' });
}
const db = getFirestore('portal');

async function main() {
  const allSnap = await db.collection('customers').get();
  console.log("Total customers in DB:", allSnap.size);

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  console.log("Start of current month:", startOfMonth.toISOString());

  let createdAtThisMonth = 0;
  let sp2CreatedAtThisMonth = 0;
  let memberSinceThisMonth = 0;

  const sampleDates: any[] = [];

  allSnap.docs.forEach((doc: any) => {
    const d = doc.data();

    // parse createdAt
    let ca: Date | null = null;
    if (d.createdAt?.toDate) ca = d.createdAt.toDate();
    else if (typeof d.createdAt === 'string') ca = new Date(d.createdAt);

    // parse sp2CreatedAt
    let sp2ca: Date | null = null;
    if (d.sp2CreatedAt?.toDate) sp2ca = d.sp2CreatedAt.toDate();
    else if (typeof d.sp2CreatedAt === 'string') sp2ca = new Date(d.sp2CreatedAt);

    // parse memberSince
    let ms: Date | null = null;
    if (d.memberSince?.toDate) ms = d.memberSince.toDate();
    else if (typeof d.memberSince === 'string') ms = new Date(d.memberSince);

    if (sampleDates.length < 10) {
      sampleDates.push({
        id: doc.id,
        name: d.fullName,
        createdAt_raw: d.createdAt,
        createdAt_parsed: ca,
        sp2CreatedAt_raw: d.sp2CreatedAt,
        sp2CreatedAt_parsed: sp2ca,
        memberSince_raw: d.memberSince,
        memberSince_parsed: ms
      });
    }

    if (ca && !isNaN(ca.getTime()) && ca >= startOfMonth) createdAtThisMonth++;
    if (sp2ca && !isNaN(sp2ca.getTime()) && sp2ca >= startOfMonth) sp2CreatedAtThisMonth++;
    if (ms && !isNaN(ms.getTime()) && ms >= startOfMonth) memberSinceThisMonth++;
  });

  console.log("Sample customer dates:", JSON.stringify(sampleDates, null, 2));

  console.log("\n--- Stats for July 2026 ---");
  console.log("  - createdAt >= startOfMonth:", createdAtThisMonth);
  console.log("  - sp2CreatedAt >= startOfMonth:", sp2CreatedAtThisMonth);
  console.log("  - memberSince >= startOfMonth:", memberSinceThisMonth);
}

main().catch(console.error);
