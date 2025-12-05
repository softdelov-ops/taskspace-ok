importScripts('https://www.gstatic.com/firebasejs/10.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.0.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyCoArAyVAaAbOhe-oYos3j2mf0b_xUHBGs",
  authDomain: "taskspace-ok.firebaseapp.com",
  projectId: "taskspace-ok",
  storageBucket: "taskspace-ok.firebasestorage.app",
  messagingSenderId: "253102853621",
  appId: "1:253102853621:web:d4ea7bd5951dbe04a4a4bc"
});

const messaging = firebase.messaging();
messaging.onBackgroundMessage(payload => {
  const { title, body } = payload.notification;
  self.registration.showNotification(title, { body });
});
