import React, { useState, useContext } from "react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import { AuthContext } from "../auth/AuthProvider";

export default function TaskForm({ onCreated }) {
  const { user } = useContext(AuthContext);
  const [title, setTitle] = useState("");
  const [dueAt, setDueAt] = useState("");

  const create = async () => {
    if (!user) return;
    const task = { title, description: "", dueAt: dueAt ? new Date(dueAt) : null, createdBy: user.uid, status: "todo", createdAt: serverTimestamp() };
    const ref = await addDoc(collection(db, "tasks"), task);
    if (onCreated) onCreated(ref.id);
    setTitle(""); setDueAt("");
  };

  return (
    <div>
      <input placeholder="Título" value={title} onChange={e=>setTitle(e.target.value)} />
      <input type="datetime-local" value={dueAt} onChange={e=>setDueAt(e.target.value)} />
      <button onClick={create}>Crear tarea</button>
    </div>
  );
}
