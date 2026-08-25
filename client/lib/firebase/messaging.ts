import { messaging, db } from "./config";
import { getToken } from "firebase/messaging";
import { doc, updateDoc, arrayUnion } from "firebase/firestore";

// VAPID Key fetched from Firebase Console -> Project Settings -> Cloud Messaging -> Web configuration
const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY || "";

/**
 * Requests browser notification permission, registers the FCM Service Worker
 * dynamically with active Firebase credentials, and registers the generated push token
 * in the logged-in user's Firestore document.
 */
export async function requestAndRegisterFCMToken(userId: string) {
  if (typeof window === "undefined" || !messaging || !userId) return;

  try {
    // 1. Request browser permissions
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      console.warn("[FCM] Notification permission denied by the user.");
      return;
    }

    // 2. Build configuration query params to initialize the service worker dynamically
    const firebaseConfig = {
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "",
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "",
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "",
      storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "",
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
      appId: import.meta.env.VITE_FIREBASE_APP_ID || ""
    };
    
    const params = new URLSearchParams(firebaseConfig).toString();
    const swUrl = `/firebase-messaging-sw.js?${params}`;

    // Register service worker with custom scope
    const registration = await navigator.serviceWorker.register(swUrl, {
      scope: "/"
    });

    if (!VAPID_KEY) {
      console.warn("[FCM] VAPID Key missing. Push token retrieval skipped. Please add VITE_FIREBASE_VAPID_KEY to environment variables.");
      return;
    }

    // 3. Request push token
    const token = await getToken(messaging, {
      serviceWorkerRegistration: registration,
      vapidKey: VAPID_KEY
    });

    if (token) {
      console.log("[FCM] Token retrieved successfully:", token);
      
      // 4. Save token to user's doc in Firestore
      const userRef = doc(db, "users", userId);
      await updateDoc(userRef, {
        fcmTokens: arrayUnion(token)
      });
      console.log("[FCM] Token synced to Firestore for user:", userId);
    } else {
      console.warn("[FCM] No registration token received.");
    }
  } catch (err) {
    console.error("[FCM] Error during token registration:", err);
  }
}
