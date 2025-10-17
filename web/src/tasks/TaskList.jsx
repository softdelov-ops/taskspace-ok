import React, { useContext, useEffect, useState } from "react";
import { collection, query, where, onSnapshot, orderBy } from "firebase/firestore";
import { db } from "../firebase";
import { AuthContext } from "../auth/AuthProvider";
import TaskForm from "./TaskForm";

export default function TaskList() {
  const { user } = useContext(AuthContext);
  const [tasks, setTasks] = useState([]);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "tasks"), where("createdBy", "==", user.uid), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, snap => setTasks(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    return () => unsub();
  }, [user]);

  return (
    <div>
      <h3>Mis tareas</h3>
      <TaskForm />
      <ul>
        {tasks.map(t => (
          <li key={t.id}>
            <strong>{t.title}</strong> {t.dueAt && <span> - vence {new Date(t.dueAt.seconds * 1000).toLocaleString()}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
