const admin = require('firebase-admin');

if (admin.apps.length === 0) {
  admin.initializeApp({ projectId: 'smart-portal-admin' });
}
const db = admin.firestore();

async function run() {
  console.log('--- 1. Querying Manifest MEGA-MAN-29-07-2026 ---');
  try {
    const docSnap = await db.collection('manifests').doc('MEGA-MAN-29-07-2026').get();
    if (docSnap.exists) {
      const manifestData = docSnap.data();
      console.log('Manifest fields:');
      console.log('fusedFrom:', manifestData.fusedFrom);
      console.log('packages count:', manifestData.packages ? manifestData.packages.length : 0);
      
      const trackingsToFind = ['TBA333015613258', 'TBA333043912568', 'TBA333070542141', '1Z8V76X80398480603'];
      const matchingEmbedded = (manifestData.packages || []).filter(p => {
        const t = String(p.tracking || p.trackingNumber || '').toUpperCase();
        return trackingsToFind.includes(t);
      });
      console.log('Embedded packages matching targets:');
      matchingEmbedded.forEach(p => {
        console.log(`  Tracking: ${p.tracking} | nombre: ${p.nombre} | slCode: ${p.slCode} | ruta: ${p.ruta} | matchSource: ${p.matchSource} | matchScore: ${p.matchScore}`);
      });
    } else {
      console.log('Manifest MEGA-MAN-29-07-2026 not found');
    }
  } catch (err) {
    console.error('Failed to get manifest:', err.message);
  }

  console.log('\n--- 2. Querying Packages collection for target trackings ---');
  const trackings = ['TBA333015613258', 'TBA333043912568', 'TBA333070542141', '1Z8V76X80398480603'];
  for (const t of trackings) {
    try {
      const pkgSnap = await db.collection('packages').doc(t).get();
      if (pkgSnap.exists) {
        const pkg = pkgSnap.data();
        console.log(`Package ${t}:`);
        console.log(`  manifestNumber: ${pkg.manifestNumber} | slCode: ${pkg.slCode} | customerName: ${pkg.customerName} | ruta: ${pkg.ruta}`);
      } else {
        console.log(`Package ${t} doc not found in packages collection`);
      }
    } catch (err) {
      console.error(`Failed to get package ${t}:`, err.message);
    }
  }

  console.log('\n--- 3. Querying Invoices with manifestNumber = MEGA-MAN-29-07-2026 ---');
  try {
    const invSnap = await db.collection('invoices').where('manifestNumber', '==', 'MEGA-MAN-29-07-2026').get();
    console.log(`Found ${invSnap.size} invoices in Firestore for this manifest.`);
    invSnap.forEach((doc) => {
      const inv = doc.data();
      const hasTarget = (inv.trackingNumbers || []).some(t => trackings.includes(t)) || trackings.includes(inv.trackingNumber);
      if (hasTarget || inv.clientSlCode === 'SL26740' || inv.slCode === 'SL26740') {
        console.log(`Invoice ${inv.invoiceNumber} (Id: ${doc.id}, Client: ${inv.clientName} / ${inv.clientSlCode || inv.slCode}, Status: ${inv.status}):`);
        console.log('  Trackings:', inv.trackingNumbers || [inv.trackingNumber]);
      }
    });
  } catch (err) {
    console.error('Failed to query invoices:', err.message);
  }
  
  console.log('\n--- 4. Querying Pre-alerts for target trackings ---');
  for (const t of trackings) {
    try {
      const preAlerts = await db.collection('pre_alerts').where('trackingNumber', '==', t).get();
      console.log(`Tracking ${t} has ${preAlerts.size} pre-alerts.`);
      preAlerts.forEach(doc => {
        const pa = doc.data();
        console.log(`  Pre-alert ${doc.id}: slCode: ${pa.slCode} | displayName: ${pa.displayName} | status: ${pa.status}`);
      });
    } catch (err) {
      console.error(`Failed to get pre-alerts for ${t}:`, err.message);
    }
  }
}

run().then(() => process.exit(0)).catch(console.error);
