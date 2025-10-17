import React, { useContext, useEffect, useState } from "react";
import { AuthContext } from "./AuthProvider";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { db } from "../firebase";
import { registerPushToken } from "../push/registerPush";

export default function Profile() {
  const { user } = useContext(AuthContext);
  const [profile, setProfile] = useState({ name: "", phone: "", timezone: Intl.DateTimeFormat().resolvedOptions().timeZone });

  useEffect(() => {
    if (!user) return;
    (async () => {
      const ref = doc(db, "users", user.uid);
      const snap = await getDoc(ref);
      if (snap.exists()) setProfile(snap.data());
      else await setDoc(ref, { name: user.displayName || "", email: user.email, timezone: profile.timezone, pushTokens: [], phone: "", emailOptIn: true, whatsappOptIn: false });
      await registerPushToken(user.uid);
    })();
  }, [user]);

  const save = async () => {
    if (!user) return;
    await setDoc(doc(db, "users", user.uid), profile, { merge: true });
  };

  if (!user) return null;
  return (
    <div>
      <h3>Perfil</h3>
      <input value={profile.name} onChange={e=>setProfile({...profile, name:e.target.value})} placeholder="Nombre" />
      <input value={profile.phone} onChange={e=>setProfile({...profile, phone:e.target.value})} placeholder="Teléfono" />
      <label>
        <input type="checkbox" checked={profile.emailOptIn ?? true} onChange={e=>setProfile({...profile, emailOptIn: e.target.checked})} />
        Recibir email
      </label>
      <label>
        <input type="checkbox" checked={profile.whatsappOptIn ?? false} onChange={e=>setProfile({...profile, whatsappOptIn: e.target.checked})} />
        Recibir WhatsApp
      </label>
      <button onClick={save}>Guardar</button>
    </div>
  );
}
