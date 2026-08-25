import { db } from '../../lib/firebase/config';
import { collection, query, where, limit, getDocs } from 'firebase/firestore';

async function test() {
  const q = query(collection(db, 'packages'), where('nombre', '==', 'PABLO PEREZ'), limit(1));
  const snap = await getDocs(q);
  console.log('empty:', snap.empty);
  if (!snap.empty) {
    console.log(snap.docs[0].data().slCode);
  }
}
test();
