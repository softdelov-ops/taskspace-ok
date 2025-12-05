import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getMessaging } from "firebase/messaging";

const firebaseConfig = {
  apiKey: "AIzaSyCoArAyVAaAbOhe-oYos3j2mf0b_xUHBGs",
  authDomain: "taskspace-ok.firebaseapp.com",
  projectId: "taskspace-ok",
  storageBucket: "taskspace-ok.firebasestorage.app",
  messagingSenderId: "253102853621",
  appId: "1:253102853621:web:d4ea7bd5951dbe04a4a4bc"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const messaging = getMessaging(app);

