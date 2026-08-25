import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';

export async function healManifestGhostPackages(
  manifestId: string,
  ghostTrackings: string[]
): Promise<void> {
  const docRef = doc(db, 'manifests', manifestId);
  const snap = await getDoc(docRef);
  if (!snap.exists()) throw new Error('El manifiesto no existe.');

  const data = snap.data();
  // Validar de nuevo que el manifiesto sea un Mega-Man en la DB antes de modificar
  const isMegaContainer = manifestId.toUpperCase().startsWith('ENC-MEGA-MAN-') ||
                          manifestId.toUpperCase().startsWith('SL-MEGA-MAN-') ||
                          manifestId.toUpperCase().startsWith('MEGA-MAN-') ||
                          data.isMegaMan === true ||
                          data.isFirestoreFusion === true;
  if (!isMegaContainer) {
    throw new Error('Solo se permite sanar manifiestos clasificados como Mega-Man.');
  }

  const currentPackages = Array.isArray(data.packages) ? data.packages : [];
  const ghostSet = new Set(ghostTrackings.map(t => t.toUpperCase()));

  const remainingPackages = currentPackages.filter(p => {
    const trk = String(p.tracking || p.trackingNumber || p.guia || '').toUpperCase();
    return !ghostSet.has(trk);
  });

  if (remainingPackages.length === currentPackages.length) return;

  const totalWeight = remainingPackages.reduce((sum, p) => sum + (p.weight || 0), 0);
  const totalPrice = remainingPackages.reduce((sum, p) => sum + (p.price || 0), 0);
  const routes = [...new Set(remainingPackages.map(p => p.ruta).filter(Boolean))];

  const customersMap = new Map();
  remainingPackages.forEach(p => {
    if (!p.slCode) return;
    const existing = customersMap.get(p.slCode);
    if (existing) {
      existing.packageCount++;
    } else {
      customersMap.set(p.slCode, {
        slCode: p.slCode,
        fullName: p.customerName || p.nombre || '',
        email: p.customerEmail || '',
        ruta: p.ruta || '',
        packageCount: 1,
      });
    }
  });

  await setDoc(docRef, {
    totalPackages: remainingPackages.length,
    totalWeight: Math.round(totalWeight * 100) / 100,
    totalPrice: Math.round(totalPrice * 100) / 100,
    totalCustomers: customersMap.size,
    routes,
    packages: remainingPackages,
    customers: Array.from(customersMap.values()),
    updatedAt: serverTimestamp(),
  }, { merge: true });
}
