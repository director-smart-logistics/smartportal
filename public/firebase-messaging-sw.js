// Import and configure the Firebase SDK inside the service worker.
// Since the service worker runs in the background, it uses importScripts.
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

// Helper to get parameters from search query
const params = new URLSearchParams(self.location.search);

// Initialize Firebase in the service worker dynamically using passed config
firebase.initializeApp({
  apiKey: params.get('apiKey') || '',
  authDomain: params.get('authDomain') || '',
  projectId: params.get('projectId') || '',
  storageBucket: params.get('storageBucket') || '',
  messagingSenderId: params.get('messagingSenderId') || '',
  appId: params.get('appId') || ''
});

const messaging = firebase.messaging();

// Handle background messages and trigger browser notification drawer
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  
  const notificationTitle = payload.notification?.title || 'Notificación de SmartLogistics';
  const notificationOptions = {
    body: payload.notification?.body || 'Nueva alerta de manifiesto o facturación.',
    icon: '/logo.png',
    badge: '/favicon.svg',
    data: payload.data || {}
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
