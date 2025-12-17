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
const rtdb = firebase.database();

// ******************************************************
// 2. VARIABLES GLOBALES Y DOM
// ******************************************************
let firebaseUser = null;
let tasks = [];
let unsubscribeTasks = null; 
const PENDING_SORT_KEY = 'taskspace_pending_sort';
const PENDING_PER_PAGE_KEY = 'taskspace_pending_per_page';
const COMPLETED_SORT_KEY = 'taskspace_completed_sort';
const COMPLETED_PER_PAGE_KEY = 'taskspace_completed_per_page';

let pendingSort = localStorage.getItem(PENDING_SORT_KEY) || 'priorityAscDateAsc';
let completedSort = localStorage.getItem(COMPLETED_SORT_KEY) || 'completedDateDesc';
let pendingItemsPerPage = parseInt(localStorage.getItem(PENDING_PER_PAGE_KEY)) || 10;
let completedItemsPerPage = parseInt(localStorage.getItem(COMPLETED_PER_PAGE_KEY)) || 10;

let pendingCurrentPage = 1;
let completedCurrentPage = 1;

let pendingFilter = { type: 'none', value: '', start: null, end: null };
let completedFilter = { type: 'none', value: '', start: null, end: null };

let bulkSelection = new Set();
let userSettings = {};

const els = {
    loginBtn: document.getElementById('login-btn'),
    logoutBtn: document.getElementById('logout-btn'),
    userProfileArea: document.getElementById('user-profile-area'),
    taskSection: document.getElementById('task-section'),
    notificationsArea: document.getElementById('notifications-area'),
    notifBell: document.getElementById('notification-bell'),
    notifList: document.getElementById('notification-list-content'),
    notifCount: document.getElementById('notif-count'),
    bulkBar: document.getElementById('bulk-action-bar'),
    taskModal: document.getElementById('taskModal'),
    newTaskForm: document.getElementById('newTaskForm'),
    profileForm: document.getElementById('profileSettingsForm'),
    pendingContainer: document.getElementById('pending-tasks'),
    completedContainer: document.getElementById('completed-tasks'),
    pendingPaginationContainer: document.getElementById('pending-pagination-container'), 
    completedPaginationContainer: document.getElementById('completed-pagination-container'), 
    bellEnabled: document.getElementById('bellEnabled'),
    bellValue: document.getElementById('bellValue'),
    bellUnit: document.getElementById('bellUnit'),
    bellContainer: document.getElementById('bellConfigContainer'),
    emailSummaryEnabled: document.getElementById('emailSummaryEnabled'),
    emailSummaryUnit: document.getElementById('emailSummaryUnit'),
    emailSummaryContainer: document.getElementById('emailSummaryConfigContainer'),
    settingsModal: document.getElementById('settingsModal'),
    settingsContent: document.getElementById('settings-content')
};

// ******************************************************
// 3. AUTENTICACIÓN
// ******************************************************
const signIn = () => auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()).catch(console.error);
const signOut = () => auth.signOut().then(() => { 
    tasks = []; 
    if (firebaseUser && unsubscribeTasks) {
         rtdb.ref(`users/${firebaseUser.uid}/tasks`).off('value');
    }
    updateUIForAuth(); 
    renderTasks(); 
});

auth.onAuthStateChanged(user => {
    firebaseUser = user;
    if (user) loadUserSettings().then(fetchTasks);
    else {
        updateUIForAuth();
        renderTasks();
    }
});

// ******************************************************
// 4. SETTINGS DE USUARIO (RTDB) 
// ******************************************************
const loadUserSettings = async () => {
    if (!firebaseUser) return;
    try {
        await rtdb.ref(`users/${firebaseUser.uid}/profile`).update({
            email: firebaseUser.email, 
            displayName: firebaseUser.displayName || firebaseUser.email.split('@')[0]
        });

        const ref = rtdb.ref(`users/${firebaseUser.uid}/settings/prefs`);
        const snapshot = await ref.once('value');
        const data = snapshot.val();

        if (data) {
            userSettings = data;
        } else {
            userSettings = {
                bellEnabled: true, bellValue: 1, bellUnit: 'h',
                emailSummaryEnabled: false, 
                emailSummaryUnit: 'mo' 
            };
            await ref.set(userSettings);
        }
    } catch (e) { console.error(e); }
    updateUIForAuth();
};

const saveUserSettings = async (settings) => {
    if (!firebaseUser) return;
    const payload = {
        bellEnabled: settings.bellEnabled,
        bellValue: settings.bellValue,
        bellUnit: settings.bellUnit,
        emailSummaryEnabled: settings.emailSummaryEnabled,
        emailSummaryUnit: settings.emailSummaryUnit
    };
    await rtdb.ref(`users/${firebaseUser.uid}/settings/prefs`).update(payload);
    userSettings = { ...userSettings, ...payload };
    updateNotifications();
    renderTasks();
};

// ******************************************************
// 5. GESTIÓN DE TAREAS (CRUD RTDB)
// ******************************************************
const fetchTasks = () => {
    if (!firebaseUser) return;
    if (unsubscribeTasks) unsubscribeTasks.off('value'); 

    const ref = rtdb.ref(`users/${firebaseUser.uid}/tasks`);
    unsubscribeTasks = ref;
    
    ref.on('value', (snapshot) => {
        const tasksObject = snapshot.val();
        tasks = [];
        if (tasksObject) {
            tasks = Object.keys(tasksObject).map(key => {
                const d = tasksObject[key];
                return {
                    id: key,
                    name: d.name,
                    dateTime: d.dateTime ? new Date(d.dateTime) : null,
                    priority: d.priority,
                    notes: d.notes || '',
                    isCompleted: d.isCompleted || false,
                    completedAt: d.completedAt ? new Date(d.completedAt) : null,
                    createdAt: d.createdAt ? new Date(d.createdAt) : new Date()
                };
            });
        }
        renderTasks();
        updateNotifications();
    });
};

const saveTask = async (data) => {
    if (!firebaseUser) return;
    const payload = {
        name: data.name,
        dateTime: data.dateTime ? data.dateTime.getTime() : null,
        priority: data.priority,
        notes: data.notes || '',
        isCompleted: data.isCompleted || false,
        completedAt: data.completedAt ? data.completedAt.getTime() : null,
        createdAt: data.createdAt ? data.createdAt.getTime() : firebase.database.ServerValue.TIMESTAMP 
    };

    const taskRef = rtdb.ref(`users/${firebaseUser.uid}/tasks`);
    if (data.id) await taskRef.child(data.id).update(payload);
    else await taskRef.push(payload);
};

window.toggleComplete = async (id) => {
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    const isCompleted = !task.isCompleted;
    const payload = { 
        isCompleted: isCompleted,
        completedAt: isCompleted ? new Date().getTime() : null
    };
    await rtdb.ref(`users/${firebaseUser.uid}/tasks/${id}`).update(payload);
};

window.deleteTask = async (id) => {
    if (confirm('¿Estás seguro?')) {
        await rtdb.ref(`users/${firebaseUser.uid}/tasks/${id}`).remove();
        bulkSelection.delete(id);
        updateBulkActionBar(); 
    }
};

window.processBulkAction = async (action) => { 
    if (!firebaseUser || bulkSelection.size === 0) return; 
    if (confirm(`¿Deseas procesar ${bulkSelection.size} tarea(s)?`)) { 
        const updates = {};
        bulkSelection.forEach(id => { 
            const path = `users/${firebaseUser.uid}/tasks/${id}`; 
            if (action === 'delete') updates[path] = null;
            else {
                updates[`${path}/isCompleted`] = (action === 'complete');
                updates[`${path}/completedAt`] = (action === 'complete') ? new Date().getTime() : null;
            }
        }); 
        await rtdb.ref().update(updates); 
        bulkSelection.clear(); 
        updateBulkActionBar(); 
    } 
};

// ******************************************************
// 6. NOTIFICACIONES
// ******************************************************
const getPriorityColor = (priority) => { 
    switch (priority) { 
        case 'urgente': return 'danger'; 
        case 'alta': return 'warning'; 
        case 'media': return 'info'; 
        default: return 'secondary'; 
    } 
};
const getPriorityBadge = (priority) => {
    switch (priority) {
        case 'urgente': return '<span class="badge bg-danger">🔥 Urgente</span>';
        case 'alta': return '<span class="badge bg-warning text-dark">⬆️ Alta</span>';
        case 'media': return '<span class="badge bg-info text-dark">⏺️ Media</span>';
        default: return '<span class="badge bg-secondary">⬇️ Baja</span>';
    }
};

const updateNotifications = () => {
    if (!firebaseUser || !userSettings.bellEnabled) {
        els.notifCount.style.display = 'none';
        els.notifList.innerHTML = `<li class="dropdown-item text-muted small py-3">Alertas desactivadas.</li>`;
        return;
    }
    const now = new Date();
    const alertTime = calculateAlertTime(now);
    const alerts = tasks.filter(t => !t.isCompleted && t.dateTime && t.dateTime.getTime() <= alertTime);

    els.notifCount.style.display = alerts.length ? 'block' : 'none';
    els.notifCount.textContent = alerts.length;
    els.notifList.innerHTML = alerts.map(t => `
        <li class="notification-item d-flex align-items-center justify-content-between">
            <div onclick="openEditModal('${t.id}')" style="cursor:pointer; flex: 1;">
                <div class="fw-bold text-dark">${t.name}</div>
                <div class="small text-primary">${t.dateTime.toLocaleString()}</div>
            </div>
        </li>
    `).join('') || '<li class="dropdown-item text-muted small py-3">Sin alertas.</li>';
};

const calculateAlertTime = (now) => {
    const { bellValue, bellUnit } = userSettings;
    const multipliers = { m: 60000, h: 3600000, d: 86400000, w: 604800000, mo: 2592000000 };
    return now.getTime() + (parseInt(bellValue) * (multipliers[bellUnit] || 0));
};

// ******************************************************
// 7. RENDERIZADO Y FILTROS
// ******************************************************
const filterTasksAndSort = (taskList, isCompleted) => {
    const filter = isCompleted ? completedFilter : pendingFilter;
    const sortKey = isCompleted ? completedSort : pendingSort;

    let list = taskList.filter(t => {
        if (filter.type === 'name') return t.name.toLowerCase().includes(filter.value.toLowerCase());
        if (filter.type === 'priority') return t.priority === filter.value;
        return true;
    });

    list.sort((a, b) => {
        if (sortKey === 'nameAsc') return a.name.localeCompare(b.name);
        if (sortKey === 'dateAsc') return (a.dateTime || 0) - (b.dateTime || 0);
        return 0;
    });
    return list;
};

const renderTasks = () => {
    if (!firebaseUser) {
        els.pendingContainer.innerHTML = '<div class="alert alert-info text-center mt-4">Inicia sesión.</div>';
        return;
    }
    const pTasks = filterTasksAndSort(tasks.filter(t => !t.isCompleted), false);
    const cTasks = filterTasksAndSort(tasks.filter(t => t.isCompleted), true);
    
    document.getElementById('pendingTasksHeader').textContent = `Pendientes (${pTasks.length})`;
    document.getElementById('completedTasksHeader').textContent = `Completadas (${cTasks.length})`;

    renderList(pTasks, els.pendingContainer, els.pendingPaginationContainer, pendingItemsPerPage, pendingCurrentPage, false);
    renderList(cTasks, els.completedContainer, els.completedPaginationContainer, completedItemsPerPage, completedCurrentPage, true);
};

const renderList = (list, container, pagContainer, perPage, page, isCompleted) => {
    const start = (page - 1) * perPage;
    const paginated = list.slice(start, start + perPage);
    container.innerHTML = paginated.map(t => {
        const border = t.isCompleted ? 'border-success' : `border-${getPriorityColor(t.priority)}`;
        return `
            <div class="card task-card mb-3 shadow-sm ${border} ${t.isCompleted ? 'completed' : ''}">
                <div class="card-body p-3 d-flex align-items-start">
                    <input type="checkbox" class="form-check-input me-3 mt-1" onchange="toggleBulkCheckbox('${t.id}', this.checked)" ${bulkSelection.has(t.id) ? 'checked' : ''}>
                    <div class="flex-grow-1" onclick="openEditModal('${t.id}')" style="cursor:pointer">
                        <h6 class="fw-bold mb-1">${t.name}</h6>
                        <small class="text-muted">${t.notes || 'Sin notas'}</small>
                    </div>
                    <div class="text-end">
                        ${getPriorityBadge(t.priority)}
                        <div class="mt-2">
                            <button class="btn btn-sm btn-outline-success" onclick="toggleComplete('${t.id}')"><i class="bi bi-check"></i></button>
                            <button class="btn btn-sm btn-outline-danger" onclick="deleteTask('${t.id}')"><i class="bi bi-trash"></i></button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('') || '<div class="alert alert-light text-center">Vacio</div>';
};

// ******************************************************
// 8. ACCIONES Y EVENTOS
// ******************************************************
window.openEditModal = (id) => {
    const t = tasks.find(x => x.id === id);
    if (!t) return;
    document.getElementById('taskID').value = t.id;
    document.getElementById('taskName').value = t.name;
    document.getElementById('taskPriority').value = t.priority;
    document.getElementById('taskNotes').value = t.notes;
    new bootstrap.Modal(els.taskModal).show();
};

els.newTaskForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = {
        id: document.getElementById('taskID').value,
        name: document.getElementById('taskName').value,
        priority: document.getElementById('taskPriority').value,
        notes: document.getElementById('taskNotes').value,
        dateTime: new Date(document.getElementById('taskDateTime').value)
    };
    await saveTask(data);
    bootstrap.Modal.getInstance(els.taskModal).hide();
});

window.toggleBulkCheckbox = (id, checked) => {
    if (checked) bulkSelection.add(id); else bulkSelection.delete(id);
    updateBulkActionBar();
};

const updateBulkActionBar = () => {
    els.bulkBar.style.display = bulkSelection.size > 0 ? 'block' : 'none';
    document.getElementById('selected-count').textContent = `${bulkSelection.size} seleccionadas`;
    document.getElementById('bulk-complete-btn').disabled = bulkSelection.size === 0;
};

els.loginBtn.addEventListener('click', signIn);
els.logoutBtn.addEventListener('click', signOut);

const updateUIForAuth = () => { 
    const isAuth = !!firebaseUser;
    els.loginBtn.classList.toggle('d-none', isAuth);
    els.userProfileArea.classList.toggle('d-none-auth', !isAuth);
    els.notificationsArea.classList.toggle('d-none-auth', !isAuth);
    els.taskSection.style.display = isAuth ? 'block' : 'none';
    if(isAuth) document.getElementById('user-display-name').textContent = firebaseUser.displayName;
};

// ******************************************************
// 9. INICIALIZACIÓN
// ******************************************************
document.addEventListener('DOMContentLoaded', updateUIForAuth);
setInterval(updateNotifications, 60000);