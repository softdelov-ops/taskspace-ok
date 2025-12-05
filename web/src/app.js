import { initializeApp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import { getFirestore, collection, query, where, getDocs, updateDoc, deleteDoc, doc } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

//const app = initializeApp();
//const auth = getAuth();
//const db = getFirestore();

const loginBtn = document.getElementById("login-btn");
const authSection = document.getElementById("auth-section");
const notifSection = document.getElementById("notifications");
const notifCount = document.getElementById("notif-count");

loginBtn.addEventListener("click", () => {
  signInWithPopup(auth, new GoogleAuthProvider());
});

const user = "Prueba";
//onAuthStateChanged(auth, user => {
  if (user)
    authSection.innerHTML = `<span class="me-3">Hola, ${user.displayName} "</span><button class="btn btn-outline-danger" id="logout-btn">Cerrar sesión</button>`;
    document.getElementById("logout-btn").onclick = () => auth.signOut();
    notifSection.classList.remove("d-none");
    //loadTasks(user.uid);
 // }
//});

async function loadTasks(uid) {
  const tasksRef = collection(db, "tasks");
  const snapshot = await getDocs(query(tasksRef, where("userId", "==", uid)));

  const pending = document.getElementById("pending-tasks");
  const completed = document.getElementById("completed-tasks");
  pending.innerHTML = "";
  completed.innerHTML = "";

  let notifCounter = 0;

  snapshot.forEach(docSnap => {
    const task = docSnap.data();
    const card = document.createElement("div");
    card.className = "task-card mb-2 d-flex justify-content-between align-items-center";

    const title = document.createElement("span");
    title.className = "task-title";
    title.textContent = task.title;

    const button = document.createElement("button");
    button.className = "btn btn-sm";
    button.textContent = "✔";

    if (!task.done) {
      button.classList.add("btn-outline-success");
      button.onclick = () => updateDoc(doc(db, "tasks", docSnap.id), { done: true }).then(() => loadTasks(uid));
      pending.appendChild(card);
      notifCounter++;
    } else {
      button.classList.add("btn-outline-secondary");
      button.disabled = true;
      completed.appendChild(card);
    }

    card.appendChild(title);
    card.appendChild(button);
  });

  notifCount.textContent = notifCounter;
}
