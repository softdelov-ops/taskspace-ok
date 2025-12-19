// --- CONFIGURACIÓN E INICIALIZACIÓN ---

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
const rtdb = firebase.database();

let firebaseUser = null;
let tasks = [];
let bulkSelection = new Set();
let userSettings = { bellEnabled: true, bellValue: 1, bellUnit: 'h', emailSummaryEnabled: false };

// --- ESTADO DE LISTAS (Persistencia) ---
const state = {
    pending: { page: 1, sort: localStorage.getItem('p_sort') || 'name', limit: parseInt(localStorage.getItem('p_limit')) || 5, filter: 'none' },
    completed: { page: 1, sort: localStorage.getItem('c_sort') || 'name', limit: parseInt(localStorage.getItem('c_limit')) || 5, filter: 'none' }
};

const els = {
    loginBtn: document.getElementById('login-btn'),
    taskSection: document.getElementById('task-section'),
    taskName: document.getElementById('taskName'),
    notifCount: document.getElementById('notif-count'),
    notifList: document.getElementById('notification-list-content'),
    bulkBar: document.getElementById('bulk-action-bar')
};

// --- AUTENTICACIÓN ---
auth.onAuthStateChanged(user => {
    firebaseUser = user;
    if (user) {
        document.getElementById('user-display-name').textContent = user.displayName;
        loadUserSettings();
        rtdb.ref(`users/${user.uid}/tasks`).on('value', snap => {
            const data = snap.val() || {};
            tasks = Object.keys(data).map(id => ({ id, ...data[id], dt: new Date(data[id].dateTime) }));
            renderAll();
            updateAlerts();
        });
    }
    toggleUI(!!user);
});

function toggleUI(isAuth) {
    els.loginBtn.classList.toggle('d-none', isAuth);
    document.querySelectorAll('.d-none-auth').forEach(el => el.classList.toggle('d-none', !isAuth));
    els.taskSection.style.display = isAuth ? 'block' : 'none';
}

// --- RENDERIZADO CON FILTROS Y PAGINACIÓN ---
function renderAll() {
    processList('pending', tasks.filter(t => !t.isCompleted), document.getElementById('pending-tasks'));
    processList('completed', tasks.filter(t => t.isCompleted), document.getElementById('completed-tasks'));
}

function processList(type, list, container) {
    let filtered = [...list];
    const s = state[type];

    // 1. Filtros
    if (s.filter === 'name') filtered.sort((a,b) => a.name.localeCompare(b.name));
    if (s.filter === 'priority') {
        const pMap = { urgente: 1, alta: 2, media: 3, baja: 4 };
        filtered.sort((a,b) => pMap[a.priority] - pMap[b.priority]);
    }

    // 2. Paginación
    const start = (s.page - 1) * s.limit;
    const paginated = filtered.slice(start, start + s.limit);

    container.innerHTML = paginated.map(t => `
        <div class="card task-card mb-2 border-${getPriorityColor(t.priority)} ${t.isCompleted ? 'completed bg-light' : ''}">
            <div class="card-body p-3">
                <div class="d-flex align-items-center">
                    <input type="checkbox" class="form-check-input me-3" onchange="toggleBulk('${t.id}', this.checked)" ${bulkSelection.has(t.id) ? 'checked' : ''}>
                    <div class="flex-grow-1" style="cursor:pointer" onclick="openEdit('${t.id}')">
                        <div class="fw-bold">${t.name}</div>
                        <div class="task-info-small">
                            <i class="bi bi-clock"></i> Vence: ${t.dt.toLocaleString()} <br>
                            <i class="bi bi-calendar-plus"></i> Creada: ${new Date(t.createdAt).toLocaleString()}
                        </div>
                    </div>
                    <div class="d-flex gap-1">
                        ${!t.isCompleted ? `<button class="btn btn-sm btn-outline-success border-0" onclick="updateStatus('${t.id}', true)"><i class="bi bi-check-circle"></i></button>` : ''}
                        <button class="btn btn-sm btn-outline-danger border-0" onclick="deleteTask('${t.id}')"><i class="bi bi-trash"></i></button>
                    </div>
                </div>
            </div>
        </div>
    `).join('') || '<p class="text-center text-muted">No hay tareas</p>';
    
    renderPagination(type, filtered.length, s.limit, s.page);
}

// --- VALIDACIÓN Y GUARDADO ---
document.getElementById('newTaskForm').onsubmit = async (e) => {
    e.preventDefault();
    const dt = new Date(document.getElementById('taskDateTime').value).getTime();
    
    // Validación: Fecha no menor a la actual
    if (dt < Date.now() && !document.getElementById('taskID').value) {
        alert("La fecha de vencimiento no puede ser anterior a la actual.");
        return;
    }

    const data = {
        name: document.getElementById('taskName').value,
        priority: document.getElementById('taskPriority').value,
        notes: document.getElementById('taskNotes').value,
        dateTime: dt,
        isCompleted: false,
        createdAt: document.getElementById('taskID').value ? tasks.find(t=>t.id===document.getElementById('taskID').value).createdAt : Date.now()
    };

    const ref = rtdb.ref(`users/${firebaseUser.uid}/tasks`);
    if (document.getElementById('taskID').value) {
        await ref.child(document.getElementById('taskID').value).update(data);
    } else {
        await ref.push(data);
    }
    bootstrap.Modal.getInstance(document.getElementById('taskModal')).hide();
};

// --- FOCO Y EDICIÓN ---
window.openEdit = (id) => {
    const t = tasks.find(x => x.id === id);
    document.getElementById('taskID').value = t.id;
    document.getElementById('taskName').value = t.name;
    document.getElementById('taskDateTime').value = new Date(t.dateTime).toISOString().slice(0, 16);
    document.getElementById('taskPriority').value = t.priority;
    document.getElementById('taskNotes').value = t.notes || '';
    
    new bootstrap.Modal(document.getElementById('taskModal')).show();
    setTimeout(() => document.getElementById('taskName').focus(), 500);
};

document.getElementById('add-task-btn').onclick = () => {
    document.getElementById('newTaskForm').reset();
    document.getElementById('taskID').value = '';
    setTimeout(() => document.getElementById('taskName').focus(), 500);
};

// --- ALERTAS (CAMPANA) ---
function updateAlerts() {
    if (!userSettings.bellEnabled) {
        els.notifCount.style.display = 'none';
        return;
    }
    const mult = { m: 60000, h: 3600000, d: 86400000 };
    const threshold = Date.now() + (userSettings.bellValue * mult[userSettings.bellUnit]);
    
    const alerts = tasks.filter(t => !t.isCompleted && t.dateTime <= threshold);
    els.notifCount.textContent = alerts.length;
    els.notifCount.style.display = alerts.length > 0 ? 'block' : 'none';
    
    els.notifList.innerHTML = alerts.map(t => `
        <li class="dropdown-item small border-bottom p-2" onclick="openEdit('${t.id}')">
            <span class="text-danger fw-bold">⚠️ Vence: ${t.name}</span><br>
            <small class="text-muted">${t.dt.toLocaleString()}</small>
        </li>
    `).join('') || '<li class="dropdown-item text-muted">Sin alertas próximas</li>';
}

// --- ACCIONES MASIVAS ---
window.processBulkAction = async (action) => {
    const updates = {};
    bulkSelection.forEach(id => {
        const path = `users/${firebaseUser.uid}/tasks/${id}`;
        if (action === 'delete') updates[path] = null;
        if (action === 'complete') updates[`${path}/isCompleted`] = true;
        if (action === 'uncomplete') updates[`${path}/isCompleted`] = false;
    });
    await rtdb.ref().update(updates);
    bulkSelection.clear();
    els.bulkBar.style.display = 'none';
};

// --- UTILS ---
const getPriorityColor = (p) => ({ urgente: 'danger', alta: 'warning', media: 'info', baja: 'secondary' }[p]);
window.deleteTask = (id) => confirm('¿Eliminar tarea?') && rtdb.ref(`users/${firebaseUser.uid}/tasks/${id}`).remove();
window.updateStatus = (id, stat) => rtdb.ref(`users/${firebaseUser.uid}/tasks/${id}`).update({ isCompleted: stat });

// --- CONFIGURACIÓN PERSISTENTE (MODAL LISTAS) ---
document.getElementById('settingsForm').onsubmit = (e) => {
    e.preventDefault();
    const type = document.getElementById('settingsListType').value;
    state[type].sort = document.getElementById('defaultSort').value;
    state[type].limit = parseInt(document.getElementById('itemsPerPage').value);
    
    localStorage.setItem(`${type === 'pending' ? 'p' : 'c'}_sort`, state[type].sort);
    localStorage.setItem(`${type === 'pending' ? 'p' : 'c'}_limit`, state[type].limit);
    
    renderAll();
    bootstrap.Modal.getInstance(document.getElementById('settingsModal')).hide();
};