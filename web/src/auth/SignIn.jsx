import React, { useContext, useState } from "react";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from "firebase/auth";
import { auth } from "../firebase";

export default function SignIn() {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");

  const login = async () => {
    await signInWithEmailAndPassword(auth, email, pw);
  };
  const signup = async () => {
    await createUserWithEmailAndPassword(auth, email, pw);
  };

  return (
    <div>
      <input placeholder="email" value={email} onChange={e=>setEmail(e.target.value)} />
      <input placeholder="password" type="password" value={pw} onChange={e=>setPw(e.target.value)} />
      <button onClick={login}>Entrar</button>
      <button onClick={signup}>Registrar</button>
    </div>
  );
}
