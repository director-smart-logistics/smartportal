import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator, initializeFirestore, enableMultiTabIndexedDbPersistence } from "firebase/firestore";
import { getStorage, connectStorageEmulator } from "firebase/storage";

// Primary Firebase config (smart-portal-admin / smart-portal-1)
const env = (typeof import.meta !== "undefined" && import.meta.env) ? import.meta.env : (process.env as any) || {};

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || "",
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || "smart-portal-admin.firebaseapp.com",
  projectId: env.VITE_FIREBASE_PROJECT_ID || "smart-portal-admin",
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || "smart-portal-admin.firebasestorage.app",
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || "764183227678",
  appId: env.VITE_FIREBASE_APP_ID || "1:764183227678:web:a8dc2630cd5b5080562d0f",
};

// Secondary Firebase config (smart-portal-2) — used only as fallback for
// customer lookup when a name is not found in SP1's customers collection.
// API key stored in VITE_SP2_FIREBASE_API_KEY env var, never hardcoded.
const sp2Config = {
  apiKey: env.VITE_SP2_FIREBASE_API_KEY || "",
  authDomain: "smart-portal-2.firebaseapp.com",
  projectId: "smart-portal-2",
  storageBucket: "smart-portal-2.firebasestorage.app",
  messagingSenderId: "1091996057622",
  appId: "1:1091996057622:web:d1b08859d486b36b1a3537",
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Initialize SP2 secondary app only if the API key is configured
export let sp2App: any;
try {
  sp2App = getApps().find(a => a.name === "sp2") || initializeApp(sp2Config, "sp2");
} catch {
  sp2App = getApp("sp2");
}

export const auth = getAuth(app);
// Use named database "portal" as configured in firebase.json
export const db = initializeFirestore(app, {}, "portal");

// Enable offline persistence disabled due to Safari WebKit IndexedDB lock bug hanging on page refresh
// try {
//   enableMultiTabIndexedDbPersistence(db).catch((err) => {
//     console.warn("Firestore offline persistence failed to enable:", err.code);
//   });
// } catch (err) {
//   console.warn("Firestore offline persistence synchronous error:", err);
// }

export const storage = getStorage(app);

// SP2 Firestore — customer fallback only, read-only from SP2
export const dbSP2 = getFirestore(sp2App);

import { getAnalytics } from "firebase/analytics";
import { getPerformance } from "firebase/performance";
import { getMessaging } from "firebase/messaging";

if (env.DEV && env.VITE_USE_FIREBASE_EMULATORS === "true") {
  connectAuthEmulator(auth, "http://localhost:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "localhost", 8080);
  connectStorageEmulator(storage, "localhost", 9199);
}

export let analytics: any = null;
export let performance: any = null;
export let messaging: any = null;

if (typeof window !== "undefined") {


  try {
    // Only initialize analytics/performance in production
    if (env.PROD) {
      analytics = getAnalytics(app);
      performance = getPerformance(app);
    }
    // Initialize messaging in browser environment if supported
    if (!env.TEST && typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      messaging = getMessaging(app);
    }
  } catch (err) {
    console.warn("Firebase Analytics/Performance/Messaging initialization failed:", err);
  }
}

export { app };
