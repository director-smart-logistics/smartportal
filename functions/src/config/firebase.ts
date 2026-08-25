import * as admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";

if (!admin.apps.length) {
  admin.initializeApp();
}

export const db = getFirestore(admin.app(), "portal");
export const auth = admin.auth();
export const storage = admin.storage();

export { admin };
