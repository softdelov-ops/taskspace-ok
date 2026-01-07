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

const DB_TYPE = 'realtime'; 
const dbRT = firebase.database();
const dbFS = firebase.firestore();

// ******************************************************
// 2. CAPA DE REPOSITORIO
// ******************************************************
const repo = {
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
    deleteTask: async (uid, id) => {
        if (DB_TYPE === 'realtime') return dbRT.ref(`users/${uid}/tasks/${id}`).remove();
        return dbFS.collection('users').doc(uid).collection('tasks').doc(id).delete();
    },
    bulkUpdate: async (uid, selection, action) => {
        const timestamp = Date.now();
        const selectionArr = Array.from(selection);
        if (DB_TYPE === 'realtime') {
            const updates = {};
            selectionArr.forEach(id => {
                const path = `users/${uid}/tasks/${id}`;
                if (action === 'delete') updates[path] = null;
                else {
                    updates[`${path}/isCompleted`] = (action === 'complete');
                    if (action === 'complete') updates[`${path}/completedAt`] = timestamp;
                    else updates[`${path}/completedAt`] = null;
                }
            });
            return dbRT.ref().update(updates);
        } else {
            const batch = dbFS.batch();
            const col = dbFS.collection('users').doc(uid).collection('tasks');
            selectionArr.forEach(id => {
                const ref = col.doc(id);
                if (action === 'delete') batch.delete(ref);
                else {
                    const data = { isCompleted: action === 'complete' };
                    data.completedAt = action === 'complete' ? timestamp : null;
                    batch.update(ref, data);
                }
            });
            return batch.commit();
        }
    },
    getSettings: async (uid) => {
        if (DB_TYPE === 'realtime') {
            const snap = await dbRT.ref(`users/${uid}/settings/prefs`).once('value');
            return snap.exists() ? snap.val() : null;
        } else {
            const doc = await dbFS.collection('users').doc(uid).get();
            return doc.exists ? doc.data().settings : null;
        }
    },
    getUserData: async (uid) => {
    const snap = await dbRT.ref(`users/${uid}`).once('value');
    return snap.exists() ? snap.val() : null;
    },
    saveProfile: async (uid, profile) => {
        return dbRT.ref(`users/${uid}/profile`).update(profile);
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
// Selección independiente por tipo de lista
let bulkSelection = { 
    type: null, // 'pending' o 'completed'
    ids: new Set() 
};
let userSettings = { bellEnabled: true, bellValue: 1, bellUnit: 'h', emailSummaryEnabled: false, emailSummaryUnit: 'mo' };

const state = {
    pending: { page: 1, filterType: 'none', filterValue: '', dateStart: '', dateEnd: '', sort: localStorage.getItem('pending_sort') || 'priority_date', limit: parseInt(localStorage.getItem('pending_limit')) || 5 },
    completed: { page: 1, filterType: 'none', filterValue: '', dateStart: '', dateEnd: '', sort: localStorage.getItem('completed_sort') || 'completion', limit: parseInt(localStorage.getItem('completed_limit')) || 5 }
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
    taskForm: document.getElementById('newTaskForm'),
    pendingHeader: document.getElementById('pendingTasksHeader'),
    completedHeader: document.getElementById('completedTasksHeader')
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
    let processedList = [...list];
    const s = state[type];

    if (s.filterType === 'name' && s.filterValue) {
        processedList = processedList.filter(t => t.name.toLowerCase().includes(s.filterValue.toLowerCase()));
    } else if (s.filterType === 'priority' && s.filterValue) {
        processedList = processedList.filter(t => t.priority === s.filterValue);
    } else if (s.filterType === 'dateRange' && s.dateStart && s.dateEnd) {
        const start = new Date(s.dateStart).getTime();
        const end = new Date(s.dateEnd).getTime();
        processedList = processedList.filter(t => {
            const targetTime = (type === 'pending') ? t.dateTime : t.completedAt;
            return targetTime >= start && targetTime <= end;
        });
    }

    processedList.sort((a, b) => {
        if (s.sort === 'priority_date') {
            const pMap = { urgente: 1, alta: 2, media: 3, baja: 4 };
            if (pMap[a.priority] !== pMap[b.priority]) return pMap[a.priority] - pMap[b.priority];
            return a.dateTime - b.dateTime;
        }
        if (s.sort === 'createdAt') return (b.createdAt || 0) - (a.createdAt || 0);
        if (s.sort === 'completion') return (b.completedAt || 0) - (a.completedAt || 0);
        if (s.sort === 'name') return a.name.localeCompare(b.name);
        if (s.sort === 'priority') {
            const pMap = { urgente: 1, alta: 2, media: 3, baja: 4 };
            return pMap[a.priority] - pMap[b.priority];
        }
        return a.dateTime - b.dateTime;
    });

    if(type === 'pending') els.pendingHeader.textContent = `Pendientes (${processedList.length})`;
    else els.completedHeader.textContent = `Completadas (${processedList.length})`;

    const totalPages = Math.ceil(processedList.length / s.limit) || 1;
    if (s.page > totalPages) s.page = totalPages;
    const paginated = processedList.slice((s.page - 1) * s.limit, s.page * s.limit);

  container.innerHTML = paginated.map(t => `
    <div class="card task-card shadow-sm position-relative overflow-hidden">
        <div class="position-absolute top-0 start-0 h-100 border-indicator bg-${getPriorityColor(t.priority)}"></div>
        <div class="card-body p-3 d-flex align-items-center">
            <input type="checkbox" class="form-check-input task-check-input me-3" 
                onchange="toggleBulk('${type}', '${t.id}', this.checked)" 
                ${bulkSelection.type === type && bulkSelection.ids.has(t.id) ? 'checked' : ''}>
            
            <div class="flex-grow-1" onclick="openEdit('${t.id}')" style="cursor:pointer">
                <div class="mb-0 ${t.isCompleted ? 'text-decoration-line-through text-muted' : 'fw-bold text-dark'}">
                    ${t.name}
                </div>
                <div class="d-flex align-items-center gap-2 mt-1">
                    <span class="badge bg-light text-secondary border fw-normal" style="font-size: 0.7rem">
                        <i class="bi bi-calendar3 me-1"></i> ${t.dt.toLocaleDateString()}
                    </span>
                    <span class="badge bg-light text-secondary border fw-normal" style="font-size: 0.7rem">
                        <i class="bi bi-clock me-1"></i> ${t.dt.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                    </span>
                </div>
            </div>

            <div class="d-flex">
                ${!t.isCompleted ? `
                    <button class="btn btn-action-task" onclick="quickAction('${t.id}', 'complete')" title="Completar">
                        <i class="bi bi-check2-circle fs-5 text-success"></i>
                    </button>
                ` : `
                    <button class="btn btn-action-task" onclick="quickAction('${t.id}', 'uncomplete')" title="Desmarcar">
                        <i class="bi bi-arrow-counterclockwise fs-5 text-warning"></i>
                    </button>
                `}
                <button class="btn btn-action-task" onclick="deleteTask('${t.id}')">
                    <i class="bi bi-trash3 fs-5 text-danger"></i>
                </button>
            </div>
        </div>
    </div>
`).join('') || '<div class="text-center p-4 text-muted"><i class="bi bi-inbox fs-1 d-block mb-2"></i>No hay tareas</div>';

    renderPagination(type, processedList.length, s.limit, s.page);
}

const renderAll = () => {
    processList('pending', tasks.filter(t => !t.isCompleted), els.pendingTasks);
    processList('completed', tasks.filter(t => t.isCompleted), els.completedTasks);
    updateBulkBarUI();
};

function handleFilterChange(type, filterType) {
    const s = state[type];
    s.filterType = filterType;
    s.page = 1;
    const container = document.getElementById(`filterInputContainer${type === 'pending' ? 'Pending' : 'Completed'}`);
    container.innerHTML = ''; 

    if (filterType === 'name') {
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'form-control form-control-sm';
        input.placeholder = 'Buscar nombre...';
        input.oninput = (e) => { s.filterValue = e.target.value; renderAll(); };
        container.appendChild(input);
    } else if (filterType === 'priority') {
        const select = document.createElement('select');
        select.className = 'form-select form-select-sm';
        select.innerHTML = `<option value="">Todas</option><option value="urgente">Urgente</option><option value="alta">Alta</option><option value="media">Media</option><option value="baja">Baja</option>`;
        select.onchange = (e) => { s.filterValue = e.target.value; renderAll(); };
        container.appendChild(select);
    } else if (filterType === 'dateRange') {
        container.innerHTML = `<input type="date" class="form-control form-control-sm" id="start-${type}"><input type="date" class="form-control form-control-sm" id="end-${type}">`;
        const dStart = document.getElementById(`start-${type}`);
        const dEnd = document.getElementById(`end-${type}`);
        const updateDates = () => { s.dateStart = dStart.value; s.dateEnd = dEnd.value; if(s.dateStart && s.dateEnd) renderAll(); };
        dStart.onchange = updateDates; dEnd.onchange = updateDates;
    }
    renderAll();
}

// ******************************************************
// 6. GESTIÓN DE SELECCIÓN Y ACCIONES MASIVAS
// ******************************************************

window.toggleBulk = (listType, id, isChecked) => {
    // Si se cambia de lista, se resetea la selección de la anterior por ser excluyentes
    if (bulkSelection.type && bulkSelection.type !== listType) {
        bulkSelection.ids.clear();
        // Desmarcar visualmente los checkboxes de "Marcar todo"
        document.getElementById('selectAllPending').checked = false;
        document.getElementById('selectAllCompleted').checked = false;
    }
    
    bulkSelection.type = listType;

    if (isChecked) {
        bulkSelection.ids.add(id);
    } else {
        bulkSelection.ids.delete(id);
        // Si no quedan IDs, el tipo vuelve a ser null
        if (bulkSelection.ids.size === 0) bulkSelection.type = null;
    }

    renderAll(); // Renderizamos para que los checkboxes reflejen el estado real
};

window.toggleSelectAll = (listType, isChecked) => {
    // Limpiar selección de la OTRA lista antes de marcar la actual
    if (bulkSelection.type !== listType) {
        bulkSelection.ids.clear();
        const otherType = listType === 'pending' ? 'Completed' : 'Pending';
        document.getElementById(`selectAll${otherType}`).checked = false;
    }

    bulkSelection.type = listType;
    const listTasks = tasks.filter(t => listType === 'pending' ? !t.isCompleted : t.isCompleted);

    if (isChecked) {
        listTasks.forEach(t => bulkSelection.ids.add(t.id));
    } else {
        bulkSelection.ids.clear();
        bulkSelection.type = null;
    }
    
    renderAll();
};

function updateBulkBarUI() {
    const count = bulkSelection.ids.size;
    const hasSelection = count > 0;

    if (hasSelection) {
        els.bulkBar.style.display = 'block';
        document.getElementById('selected-count').textContent = 
            `${count} seleccionadas (${bulkSelection.type === 'pending' ? 'Pendientes' : 'Completadas'})`;
        
        const isPending = bulkSelection.type === 'pending';
        const btnComplete = document.getElementById('bulk-complete-btn');
        const btnUncomplete = document.getElementById('bulk-uncomplete-btn');
        const btnDelete = document.getElementById('bulk-delete-btn');

        btnComplete.style.display = isPending ? 'inline-block' : 'none';
        btnUncomplete.style.display = !isPending ? 'inline-block' : 'none';

        // Activar botones solo si hay selección
        btnComplete.disabled = false;
        btnUncomplete.disabled = false;
        btnDelete.disabled = false;

        els.bulkBar.style.display = 'flex';
        els.bulkBar.classList.add('animate__animated', 'animate__slideInUp');
    } else {
        els.bulkBar.style.display = 'none';
        bulkSelection.type = null;
    }
    
}

window.processBulkAction = async (action) => {
    if (bulkSelection.ids.size === 0) return;
    await repo.bulkUpdate(firebaseUser.uid, bulkSelection.ids, action);
    bulkSelection.ids.clear();
    bulkSelection.type = null;
    document.querySelectorAll('.bulk-checkbox-main').forEach(cb => cb.checked = false);
    renderAll();
};



// ******************************************************
// 7. MODAL DE TAREAS Y ALERTAS
// ******************************************************
els.taskModal.addEventListener('shown.bs.modal', () => {
    els.taskName.focus();
});

// Función auxiliar para obtener fecha local en formato compatible con input datetime-local
/*function getLocalISOString(date = new Date()) {
    const offset = date.getTimezoneOffset() * 60000; // Desfase en milisegundos
    const localISOTime = (new Date(date - offset)).toISOString().slice(0, 16);
    return localISOTime;
}*/

function getLocalISOString(date = new Date()) {
    const offset = date.getTimezoneOffset() * 60000; 
    return (new Date(date - offset)).toISOString().slice(0, 16);
}

document.getElementById('add-task-btn').onclick = () => {
    els.taskForm.reset();
    document.getElementById('taskID').value = '';
    
    // Configura el mínimo y el valor por defecto como "Ahora"
    const nowLocal = getLocalISOString();
    document.getElementById('taskDateTime').value = nowLocal;
    document.getElementById('taskDateTime').min = nowLocal;
};

els.taskForm.onsubmit = async (e) => {
    e.preventDefault();
    const id = document.getElementById('taskID').value;
    const dtValue = document.getElementById('taskDateTime').value;
    const dt = new Date(dtValue).getTime();

    // Permite fechas iguales a la actual (Date.now()), pero no menores
    // Se resta un minuto (60000ms) para dar margen de tiempo al usuario mientras llena el formulario
    if (dt < (Date.now() - 60000) && !id) {
        alert("⚠️ La fecha de vencimiento debe ser hoy o una fecha futura.");
        return;
    }

    const data = {
        name: els.taskName.value,
        priority: document.getElementById('taskPriority').value,
        notes: document.getElementById('taskNotes').value,
        dateTime: dt,
        isCompleted: false,
        createdAt: id ? (tasks.find(t=>t.id===id)?.createdAt || Date.now()) : Date.now()
    };

    await repo.saveTask(firebaseUser.uid, id, data);
    bootstrap.Modal.getInstance(els.taskModal).hide();
    els.taskForm.reset();
};

window.openEdit = (id) => {
    const t = tasks.find(x => x.id === id);
    if (!t) return;

    const isDone = t.isCompleted;
    const nowLocal = getLocalISOString();
    
    // Rellenar campos
    document.getElementById('taskID').value = t.id;
    document.getElementById('taskName').value = t.name;
    const taskDateLocal = getLocalISOString(new Date(t.dateTime));
    document.getElementById('taskDateTime').value = taskDateLocal;
    document.getElementById('taskPriority').value = t.priority;
    document.getElementById('taskNotes').value = t.notes || '';

    // MODO SOLO LECTURA SI ESTÁ COMPLETADA
    const fields = ['taskName', 'taskDateTime', 'taskPriority', 'taskNotes'];
    fields.forEach(field => document.getElementById(field).disabled = isDone);
    
    document.getElementById('saveTaskBtn').style.display = isDone ? 'none' : 'block';
    document.getElementById('modalTitle').textContent = isDone ? 'Detalle de Tarea (Completada)' : 'Editar Tarea';

    if (!isDone) {
        // Permitir fecha igual a la actual pero no menor
        document.getElementById('taskDateTime').min = t.dateTime < Date.now() ? taskDateLocal : nowLocal;
    }

    new bootstrap.Modal(els.taskModal).show();
};

// IMPORTANTE: Resetear el estado de los campos al abrir para crear nueva tarea
document.getElementById('add-task-btn').onclick = () => {
    els.taskForm.reset();
    document.getElementById('taskID').value = '';
    document.getElementById('modalTitle').textContent = 'Nueva Tarea';
    
    // Habilitar campos
    document.getElementById('taskName').disabled = false;
    document.getElementById('taskDateTime').disabled = false;
    document.getElementById('taskPriority').disabled = false;
    document.getElementById('taskNotes').disabled = false;
    document.getElementById('saveTaskBtn').style.display = 'block';

    const nowLocal = getLocalISOString();
    document.getElementById('taskDateTime').value = nowLocal;
    document.getElementById('taskDateTime').min = nowLocal;
};

function updateAlerts() {
    if (!userSettings.bellEnabled || !tasks.length) {
        els.notifCount.style.display = 'none';
        return;
    }
    const mult = { m: 60000, h: 3600000, d: 86400000, w: 604800000, mo: 2592000000 };
    const threshold = Date.now() + (userSettings.bellValue * mult[userSettings.bellUnit]);
    const alerts = tasks.filter(t => !t.isCompleted && t.dateTime <= threshold);
    
    els.notifCount.textContent = alerts.length;
    els.notifCount.style.display = alerts.length > 0 ? 'block' : 'none';
    
    els.notifList.innerHTML = alerts.map(t => `
        <li class="dropdown-item border-bottom p-3">
            <div class="d-flex justify-content-between align-items-center">
                <div onclick="openEdit('${t.id}')" style="cursor:pointer" class="flex-grow-1">
                    <span class="text-danger fw-bold small">⚠️ ${t.name}</span><br>
                    <small class="text-muted">${t.dt.toLocaleString()}</small>
                </div>
                <div class="d-flex gap-1 ms-2">
                    <button class="btn btn-sm btn-success py-0 px-2" onclick="quickAction('${t.id}', 'complete')" title="Completar">
                        <i class="bi bi-check"></i>
                    </button>
                    <button class="btn btn-sm btn-danger py-0 px-2" onclick="deleteTask('${t.id}')" title="Eliminar">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
            </div>
        </li>
    `).join('') || '<li class="dropdown-item text-muted text-center py-2">Sin alertas</li>';
}

window.quickAction = async (id, action) => {
    // action puede ser 'complete' o 'uncomplete'
    await repo.bulkUpdate(firebaseUser.uid, [id], action);
};

// ******************************************************
// 8. CONFIGURACIÓN Y OTROS EVENTOS
// ******************************************************
window.prepareSettings = (type) => {
    document.getElementById('settingsListType').value = type;
    const sortSelect = document.getElementById('defaultSort');
    if (type === 'pending') {
        sortSelect.innerHTML = `<option value="priority_date">Prioridad > Vencimiento</option><option value="createdAt">Fecha de Creación</option><option value="name">Alfabético</option><option value="date">Vencimiento</option>`;
    } else {
        sortSelect.innerHTML = `<option value="completion">Fecha de Finalización</option><option value="name">Alfabético</option><option value="priority">Prioridad</option>`;
    }
    sortSelect.value = state[type].sort;
    document.getElementById('itemsPerPage').value = state[type].limit;
};

document.getElementById('settingsForm').onsubmit = (e) => {
    e.preventDefault();
    const type = document.getElementById('settingsListType').value;
    state[type].sort = document.getElementById('defaultSort').value;
    state[type].limit = parseInt(document.getElementById('itemsPerPage').value);
    state[type].page = 1;
    localStorage.setItem(`${type}_sort`, state[type].sort);
    localStorage.setItem(`${type}_limit`, state[type].limit);
    renderAll();
    bootstrap.Modal.getInstance(document.getElementById('settingsModal')).hide();
};

document.getElementById('bellEnabled').onchange = (e) => document.getElementById('bellConfigContainer').style.display = e.target.checked ? 'block' : 'none';
document.getElementById('emailSummaryEnabled').onchange = (e) => document.getElementById('emailSummaryConfigContainer').style.display = e.target.checked ? 'block' : 'none';

async function loadUserSettings() {

   // 1. Intentamos traer los datos de la base de datos
    const data = await repo.getUserData(firebaseUser.uid);
    const profile = data?.profile;

    // 2. Referencias a los elementos de la interfaz (Navbar)
    const navName = document.getElementById('user-display-name');
    const navPhoto = document.getElementById('user-photo');

    // 3. Si hay datos en la DB, los ponemos en el INICIO (Navbar)
    if (profile) {
       
        // Actualiza el Inicio (Navbar)
        if (profile.displayName) document.getElementById('user-display-name').textContent = profile.displayName;
        if (profile.photoURL) document.getElementById('user-photo').src = profile.photoURL;
        
        // Rellena el Modal
        document.getElementById('profileDisplayName').value = profile.displayName;
        document.getElementById('profileEmail').value = profile.email;
        document.getElementById('profilePreview').src = profile.photoURL;
    }

    // 4. También rellenamos los campos del MODAL para que coincidan
    const modalNameInput = document.getElementById('profileDisplayName');
    const modalEmailInput = document.getElementById('profileEmail');
    const modalPreview = document.getElementById('profilePreview');

    if (modalNameInput) modalNameInput.value = profile?.displayName || firebaseUser.displayName || "";
    if (modalEmailInput) modalEmailInput.value = profile?.email || firebaseUser.email || "";
    if (modalPreview) modalPreview.src = profile?.photoURL || firebaseUser.photoURL || "https://via.placeholder.com/80";
}

// Mostrar la imagen en el modal en cuanto se selecciona el archivo
// ESCUCHADOR PARA LA PREVISUALIZACIÓN Y COMPRESIÓN
document.getElementById('profileFile').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(event) {
        const img = new Image();
        img.onload = function() {
            // REDIMENSIONAR IMAGEN a 200x200 para que no pese nada
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = 200;
            canvas.height = 200;
            ctx.drawImage(img, 0, 0, 200, 200);
            
            // Guardar el resultado comprimido en la previsualización
            const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
            document.getElementById('profilePreview').src = dataUrl;
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
});
    
document.getElementById('profileSettingsForm').onsubmit = async (e) => {
   e.preventDefault();
    const statusText = document.getElementById('uploadStatus');
    const newName = document.getElementById('profileDisplayName').value;
    const newEmail = document.getElementById('profileEmail').value;
    const photoURL = document.getElementById('profilePreview').src; // La imagen ya comprimida

    statusText.classList.remove('d-none');

    try {
        // 1. Guardar en la Base de Datos
        await repo.saveProfile(firebaseUser.uid, { 
            displayName: newName, 
            photoURL: photoURL,
            email: newEmail 
        });

        // 2. ACTUALIZAR AREA DE INICIO (Navbar)
        if(document.getElementById('user-display-name')) {
            document.getElementById('user-display-name').textContent = newName;
        }
        if(document.getElementById('user-photo')) {
            document.getElementById('user-photo').src = photoURL;
        }
        if(document.getElementById('user-email')) {
            document.getElementById('user-email').textContent = newEmail;
        }

        // 3. Guardar otros ajustes (si los tienes)
        userSettings = {
            bellEnabled: document.getElementById('bellEnabled').checked,
            bellValue: parseInt(document.getElementById('bellValue').value),
            bellUnit: document.getElementById('bellUnit').value,
            emailSummaryEnabled: document.getElementById('emailSummaryEnabled').checked,
            emailSummaryUnit: document.getElementById('emailSummaryUnit').value
        };
        await repo.saveSettings(firebaseUser.uid, userSettings);

        // 4. CERRAR MODAL
        const modalEl = document.getElementById('profileSettingsModal');
        const modalInstance = bootstrap.Modal.getInstance(modalEl);
        if (modalInstance) modalInstance.hide();

        alert("¡Perfil actualizado en todas las áreas!");

    } catch (error) {
        console.error("Error:", error);
        alert("Error al guardar. Intenta con otra imagen.");
    } finally {
        statusText.classList.add('d-none');
    }
};

function renderPagination(type, totalItems, limit, currentPage) {
    const totalPages = Math.ceil(totalItems / limit) || 1;
    const container = document.getElementById(`${type}-pagination-container`);
    
    container.innerHTML = `
        <div class="pagination-container">
            <button class="btn-page" ${currentPage === 1 ? 'disabled' : ''} 
                onclick="changePage('${type}', ${currentPage - 1})">
                <i class="bi bi-chevron-left"></i>
            </button>
            <span class="page-info">
                ${currentPage} <span class="text-muted">/</span> ${totalPages}
            </span>
            <button class="btn-page" ${currentPage === totalPages ? 'disabled' : ''} 
                onclick="changePage('${type}', ${currentPage + 1})">
                <i class="bi bi-chevron-right"></i>
            </button>
        </div>
    `;
}

window.changePage = (type, page) => { state[type].page = page; renderAll(); };
document.getElementById('selectPendientes').onchange = (e) => handleFilterChange('pending', e.target.value);
document.getElementById('selectCompletadas').onchange = (e) => handleFilterChange('completed', e.target.value);
const getPriorityColor = (p) => ({ urgente: 'danger', alta: 'warning', media: 'info', baja: 'secondary' }[p]);
window.deleteTask = (id) => confirm('¿Eliminar?') && repo.deleteTask(firebaseUser.uid, id);

els.loginBtn.onclick = () => auth.signInWithPopup(new firebase.auth.GoogleAuthProvider());
els.logoutBtn.onclick = () => auth.signOut();
document.querySelectorAll('[data-bs-target="#settingsModal"]').forEach(btn => btn.onclick = () => prepareSettings(btn.getAttribute('data-list-type')));

document.getElementById('selectAllPending').onchange = (e) => toggleSelectAll('pending', e.target.checked);
document.getElementById('selectAllCompleted').onchange = (e) => toggleSelectAll('completed', e.target.checked);