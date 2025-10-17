import { getToken } from "firebase/messaging";
import { doc, updateDoc, arrayUnion } from "firebase/firestore";
import { messaging, db } from "../firebase";

export async function registerPushToken(uid) {
  try {
    const token = await getToken(messaging, { vapidKey: "TU_VAPID_KEY" });
    if (!token) return;
    await updateDoc(doc(db, "users", uid), { pushTokens: arrayUnion(token) });
  } catch (e) {
    console.error("No push token", e);
  }
}
