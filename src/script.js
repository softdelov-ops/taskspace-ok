// ******************************************************
// 1. CONFIGURACIÓN E INICIALIZACIÓN
// ******************************************************
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();

// --- SELECTOR DE BASE DE DATOS ---
// Cambia a 'firestore' o 'realtime' según prefieras
//const DB_TYPE = 'realtime'; 
const DB_TYPE = 'firestore'; 

const dbRT = firebase.database();
const dbFS = firebase.firestore();

// ******************************************************
// 2. CAPA DE REPOSITORIO (ABSTRACCIÓN DE BD)
// ******************************************************
const repo = {
    // Escuchar tareas en tiempo real
    listenTasks: (uid, callback) => {
        if (DB_TYPE === 'realtime') {
            return dbRT.ref(`users/${uid}/tasks`).on('value', snap => {
                const data = snap.val() || {};
                const list = Object.keys(data).map(id => ({ 
                    id, ...data[id], 
                    dt: new Date(data[id].dateTime) 
                }));
                callback(list);
            });
        } else {
            return dbFS.collection('users').doc(uid).collection('tasks')
                .onSnapshot(snap => {
                    const list = snap.docs.map(doc => {
                        const d = doc.data();
                        return { id: doc.id, ...d, dt: new Date(d.dateTime) };
                    });
                    callback(list);
                });
        }
    },

    // Guardar o Actualizar Tarea
    saveTask: async (uid, id, data) => {
        if (DB_TYPE === 'realtime') {
            if (id) return dbRT.ref(`users/${uid}/tasks/${id}`).update(data);
            return dbRT.ref(`users/${uid}/tasks`).push(data);
        } else {
            const col = dbFS.collection('users').doc(uid).collection('tasks');
            if (id) return col.doc(id).update(data);
            return col.add(data);
        }
    },

    // Eliminar Tarea
    deleteTask: async (uid, id) => {
        if (DB_TYPE === 'realtime') return dbRT.ref(`users/${uid}/tasks/${id}`).remove();
        return dbFS.collection('users').doc(uid).collection('tasks').doc(id).delete();
    },

    // Acciones Masivas (Batch)
    bulkUpdate: async (uid, selection, action) => {
        if (DB_TYPE === 'realtime') {
            const updates = {};
            selection.forEach(id => {
                const path = `users/${uid}/tasks/${id}`;
                if (action === 'delete') updates[path] = null;
                else updates[`${path}/isCompleted`] = (action === 'complete');
            });
            return dbRT.ref().update(updates);
        } else {
            const batch = dbFS.batch();
            const col = dbFS.collection('users').doc(uid).collection('tasks');
            selection.forEach(id => {
                const ref = col.doc(id);
                if (action === 'delete') batch.delete(ref);
                else batch.update(ref, { isCompleted: action === 'complete' });
            });
            return batch.commit();
        }
    },

    // Ajustes de Usuario
    getSettings: async (uid) => {
        if (DB_TYPE === 'realtime') {
            const snap = await dbRT.ref(`users/${uid}/settings/prefs`).once('value');
            return snap.exists() ? snap.val() : null;
        } else {
            const doc = await dbFS.collection('users').doc(uid).get();
            return doc.exists ? doc.data().settings : null;
        }
    },

    saveSettings: async (uid, settings) => {
        if (DB_TYPE === 'realtime') {
            return dbRT.ref(`users/${uid}/settings/prefs`).update(settings);
        } else {
            return dbFS.collection('users').doc(uid).set({ settings }, { merge: true });
        }
    }
};

// ******************************************************
// 3. VARIABLES DE ESTADO Y DOM
// ******************************************************
let firebaseUser = null;
let tasks = [];
let bulkSelection = new Set();
let userSettings = { bellEnabled: true, bellValue: 1, bellUnit: 'h', emailSummaryEnabled: false, emailSummaryUnit: 'mo' };

const state = {
    pending: { page: 1, filter: 'none', sort: localStorage.getItem('pending_sort') || 'date', limit: parseInt(localStorage.getItem('pending_limit')) || 5 },
    completed: { page: 1, filter: 'none', sort: localStorage.getItem('completed_sort') || 'date', limit: parseInt(localStorage.getItem('completed_limit')) || 5 }
};

const els = {
    loginBtn: document.getElementById('login-btn'),
    logoutBtn: document.getElementById('logout-btn'),
    taskSection: document.getElementById('task-section'),
    userProfileArea: document.getElementById('user-profile-area'),
    notificationsArea: document.getElementById('notifications-area'),
    notifCount: document.getElementById('notif-count'),
    notifList: document.getElementById('notification-list-content'),
    pendingTasks: document.getElementById('pending-tasks'),
    completedTasks: document.getElementById('completed-tasks'),
    bulkBar: document.getElementById('bulk-action-bar'),
    taskModal: document.getElementById('taskModal'),
    taskName: document.getElementById('taskName'),
    taskForm: document.getElementById('newTaskForm')
};

// ******************************************************
// 4. AUTENTICACIÓN
// ******************************************************
auth.onAuthStateChanged(user => {
    firebaseUser = user;
    if (user) {
        document.getElementById('user-display-name').textContent = user.displayName;
        loadUserSettings();
        listenToTasks();
    }
    updateUIAuth();
});

const updateUIAuth = () => {
    const isAuth = !!firebaseUser;
    els.loginBtn.classList.toggle('d-none', isAuth);
    els.userProfileArea.classList.toggle('d-none-auth', !isAuth);
    els.notificationsArea.classList.toggle('d-none-auth', !isAuth);
    els.taskSection.style.display = isAuth ? 'block' : 'none';
};

// ******************************************************
// 5. LÓGICA DE TAREAS Y FILTROS
// ******************************************************
function listenToTasks() {
    repo.listenTasks(firebaseUser.uid, (data) => {
        tasks = data;
        renderAll();
        updateAlerts();
    });
}

function processList(type, list, container) {
    let sortedList = [...list];
    const s = state[type];
    const activeSort = s.filter !== 'none' ? s.filter : s.sort;

    if (activeSort === 'name') sortedList.sort((a,b) => a.name.localeCompare(b.name));
    else if (activeSort === 'priority') {
        const pMap = { urgente: 1, alta: 2, media: 3, baja: 4 };
        sortedList.sort((a,b) => pMap[a.priority] - pMap[b.priority]);
    } else {
        sortedList.sort((a,b) => a.dateTime - b.dateTime);
    }

    const totalPages = Math.ceil(sortedList.length / s.limit) || 1;
    if (s.page > totalPages) s.page = totalPages;
    const paginated = sortedList.slice((s.page - 1) * s.limit, s.page * s.limit);

    container.innerHTML = paginated.map(t => `
        <div class="card task-card mb-2 border-start border-4 border-${getPriorityColor(t.priority)} ${t.isCompleted ? 'bg-light' : 'bg-white shadow-sm'}">
            <div class="card-body p-3 d-flex align-items-center">
                <input type="checkbox" class="form-check-input me-3" onchange="toggleBulk('${t.id}', this.checked)" ${bulkSelection.has(t.id) ? 'checked' : ''}>
                <div class="flex-grow-1" onclick="openEdit('${t.id}')" style="cursor:pointer">
                    <div class="${t.isCompleted ? 'text-decoration-line-through text-muted' : 'fw-bold'}">${t.name}</div>
                    <small class="text-muted"><i class="bi bi-clock"></i> ${t.dt.toLocaleString()}</small>
                </div>
                <button class="btn btn-sm text-danger" onclick="deleteTask('${t.id}')"><i class="bi bi-trash"></i></button>
            </div>
        </div>
    `).join('') || '<p class="text-center text-muted py-3">No hay tareas</p>';

    renderPagination(type, sortedList.length, s.limit, s.page);
}

const renderAll = () => {
    processList('pending', tasks.filter(t => !t.isCompleted), els.pendingTasks);
    processList('completed', tasks.filter(t => t.isCompleted), els.completedTasks);
};

// ******************************************************
// 6. VALIDACIÓN Y MODAL DE TAREAS
// ******************************************************
els.taskForm.onsubmit = async (e) => {
    e.preventDefault();
    const id = document.getElementById('taskID').value;
    const dtValue = document.getElementById('taskDateTime').value;
    const dt = new Date(dtValue).getTime();

    if (dt < Date.now()) {
        alert("⚠️ La fecha de vencimiento no puede ser anterior a la actual.");
        return;
    }

    const data = {
        name: els.taskName.value,
        priority: document.getElementById('taskPriority').value,
        notes: document.getElementById('taskNotes').value,
        dateTime: dt,
        isCompleted: false,
        createdAt: id ? tasks.find(t=>t.id===id).createdAt : Date.now()
    };

    await repo.saveTask(firebaseUser.uid, id, data);
    bootstrap.Modal.getInstance(els.taskModal).hide();
};

window.openEdit = (id) => {
    const t = tasks.find(x => x.id === id);
    if (!t) return;
    document.getElementById('taskID').value = t.id;
    document.getElementById('taskName').value = t.name;
    document.getElementById('taskDateTime').value = new Date(t.dateTime).toISOString().slice(0, 16);
    document.getElementById('taskPriority').value = t.priority;
    document.getElementById('taskNotes').value = t.notes || '';
    new bootstrap.Modal(els.taskModal).show();
};

// ******************************************************
// 7. CONFIGURACIÓN DE LISTAS
// ******************************************************
window.prepareSettings = (type) => {
    document.getElementById('settingsListType').value = type;
    document.getElementById('defaultSort').value = state[type].sort;
    document.getElementById('itemsPerPage').value = state[type].limit;
};

document.getElementById('settingsForm').onsubmit = (e) => {
    e.preventDefault();
    const type = document.getElementById('settingsListType').value;
    const newSort = document.getElementById('defaultSort').value;
    const newLimit = parseInt(document.getElementById('itemsPerPage').value);

    state[type].sort = newSort;
    state[type].limit = newLimit;
    state[type].page = 1;

    localStorage.setItem(`${type}_sort`, newSort);
    localStorage.setItem(`${type}_limit`, newLimit);

    renderAll();
    bootstrap.Modal.getInstance(document.getElementById('settingsModal')).hide();
};

// ******************************************************
// 8. PERFIL Y ALERTAS
// ******************************************************
document.getElementById('bellEnabled').onchange = (e) => {
    document.getElementById('bellConfigContainer').style.display = e.target.checked ? 'block' : 'none';
};

document.getElementById('emailSummaryEnabled').onchange = (e) => {
    document.getElementById('emailSummaryConfigContainer').style.display = e.target.checked ? 'block' : 'none';
};

async function loadUserSettings() {
    const data = await repo.getSettings(firebaseUser.uid);
    if (data) {
        userSettings = data;
        document.getElementById('bellEnabled').checked = userSettings.bellEnabled;
        document.getElementById('bellValue').value = userSettings.bellValue;
        document.getElementById('bellUnit').value = userSettings.bellUnit;
        document.getElementById('emailSummaryEnabled').checked = userSettings.emailSummaryEnabled;
        document.getElementById('emailSummaryUnit').value = userSettings.emailSummaryUnit || 'mo';
        
        document.getElementById('bellEnabled').dispatchEvent(new Event('change'));
        document.getElementById('emailSummaryEnabled').dispatchEvent(new Event('change'));
    }
}

document.getElementById('profileSettingsForm').onsubmit = async (e) => {
    e.preventDefault();
    userSettings = {
        bellEnabled: document.getElementById('bellEnabled').checked,
        bellValue: parseInt(document.getElementById('bellValue').value),
        bellUnit: document.getElementById('bellUnit').value,
        emailSummaryEnabled: document.getElementById('emailSummaryEnabled').checked,
        emailSummaryUnit: document.getElementById('emailSummaryUnit').value
    };
    await repo.saveSettings(firebaseUser.uid, userSettings);
    updateAlerts();
    bootstrap.Modal.getInstance(document.getElementById('profileSettingsModal')).hide();
};

function updateAlerts() {
    if (!userSettings.bellEnabled) {
        els.notifCount.style.display = 'none';
        return;
    }
    const mult = { m: 60000, h: 3600000, d: 86400000, w: 604800000, mo: 2592000000 };
    const threshold = Date.now() + (userSettings.bellValue * mult[userSettings.bellUnit]);
    const alerts = tasks.filter(t => !t.isCompleted && t.dateTime <= threshold);
    
    els.notifCount.textContent = alerts.length;
    els.notifCount.style.display = alerts.length > 0 ? 'block' : 'none';
    els.notifList.innerHTML = alerts.map(t => `
        <li class="dropdown-item small border-bottom p-2" onclick="openEdit('${t.id}')">
            <span class="text-danger fw-bold">⚠️ Vence: ${t.name}</span><br>
            <small>${t.dt.toLocaleString()}</small>
        </li>
    `).join('') || '<li class="dropdown-item text-muted">Sin alertas</li>';
}

// ******************************************************
// 9. ACCIONES MASIVAS Y PAGINACIÓN
// ******************************************************
window.toggleBulk = (id, checked) => {
    if (checked) bulkSelection.add(id); else bulkSelection.delete(id);
    const hasItems = bulkSelection.size > 0;
    els.bulkBar.style.display = hasItems ? 'block' : 'none';
    document.getElementById('selected-count').textContent = `${bulkSelection.size} seleccionadas`;
    
    // Habilitar/Deshabilitar botones de acción masiva
    document.getElementById('bulk-complete-btn').disabled = !hasItems;
    document.getElementById('bulk-uncomplete-btn').disabled = !hasItems;
    document.getElementById('bulk-delete-btn').disabled = !hasItems;
};

window.processBulkAction = async (action) => {
    await repo.bulkUpdate(firebaseUser.uid, bulkSelection, action);
    bulkSelection.clear();
    els.bulkBar.style.display = 'none';
};

function renderPagination(type, totalItems, limit, currentPage) {
    const totalPages = Math.ceil(totalItems / limit) || 1;
    const container = document.getElementById(`${type}-pagination-container`);
    container.innerHTML = `
        <button class="btn btn-sm btn-light me-2" ${currentPage === 1 ? 'disabled' : ''} onclick="changePage('${type}', ${currentPage - 1})">Ant.</button>
        <span class="small align-self-center">Pág ${currentPage}/${totalPages}</span>
        <button class="btn btn-sm btn-light ms-2" ${currentPage === totalPages ? 'disabled' : ''} onclick="changePage('${type}', ${currentPage + 1})">Sig.</button>
    `;
}

window.changePage = (type, page) => { state[type].page = page; renderAll(); };

document.getElementById('selectPendientes').onchange = (e) => { state.pending.filter = e.target.value; renderAll(); };
document.getElementById('selectCompletadas').onchange = (e) => { state.completed.filter = e.target.value; renderAll(); };

const getPriorityColor = (p) => ({ urgente: 'danger', alta: 'warning', media: 'info', baja: 'secondary' }[p]);
window.deleteTask = (id) => confirm('¿Eliminar?') && repo.deleteTask(firebaseUser.uid, id);

els.loginBtn.onclick = () => auth.signInWithPopup(new firebase.auth.GoogleAuthProvider());
els.logoutBtn.onclick = () => auth.signOut();