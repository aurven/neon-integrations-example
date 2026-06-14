/* ============================================================
   Planning Board — standalone JS
   Served at /js/planning-board.js (standalone)
   and /neon/api/demo-integration/js/planning-board.js (embedded)

   Expects a global CONFIG object injected by the .hbs template:
     const CONFIG = { neonAppUrl: '...', apiKey: '...' };
   ============================================================ */

// =============================================
// CONSTANTS
// =============================================

// Granular Neon workflow statuses — each maps to a kanban column
const NEON_STATUSES = [
    { id: 'story-created',  label: 'Story/Created',  color: '#6b7280', kanbanCol: 'todo' },
    { id: 'story-imported', label: 'Story/Imported',  color: '#2847E2', kanbanCol: 'todo' },
    { id: 'story-edit',     label: 'Story/Edit',      color: '#7c3aed', kanbanCol: 'inprogress' },
    { id: 'story-review',   label: 'Story/Review',    color: '#d97706', kanbanCol: 'review' },
    { id: 'story-ready',    label: 'Story/Ready',     color: '#16a34a', kanbanCol: 'ready' },
];

// Base kanban columns (done + print appended conditionally)
const BASE_KANBAN_COLUMNS = [
    { id: 'todo',       label: 'To Do',            color: '#2847E2' },
    { id: 'inprogress', label: 'In Progress',       color: '#7c3aed' },
    { id: 'review',     label: 'Review',            color: '#d97706' },
    { id: 'ready',      label: 'Ready to Publish',  color: '#16a34a' },
];
const DONE_COL  = { id: 'done',  label: 'Done',            color: '#0d9488' };
const PRINT_COL = { id: 'print', label: 'Ready for Print',  color: '#5b21b6' };

const CONTENT_TYPES = ['Article', 'Breaking News', 'Gallery', 'Video', 'Live Blog', 'Interview'];

const USERS = [
    { id: 'user1', name: 'Marco Rossi',    initials: 'MR', color: '#2847E2' },
    { id: 'user2', name: 'Laura Bianchi',  initials: 'LB', color: '#7c3aed' },
    { id: 'user3', name: 'Antonio Ricci',  initials: 'AR', color: '#d97706' },
    { id: 'user4', name: 'Sara Esposito',  initials: 'SE', color: '#16a34a' },
    { id: 'user5', name: 'Giovanni Conti', initials: 'GC', color: '#ef4444' },
];

const MONTHS       = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAYS_SHORT   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

// =============================================
// DEMO DATA
// =============================================
const DEMO_TASKS = [
    {
        id: 't1',
        title: 'Elections 2026: live coverage setup',
        status: 'story-edit',
        priority: 2,
        assignees: ['user1', 'user2'],
        dueDate: '2026-04-03',
        shift: 'morning',
        eligibleForPrint: false,
        contentType: 'Live Blog',
        articleRef: 'elections-live-001',
        comment: 'Coordinate with graphics for real-time map embed.',
        article: {
            headline: 'Elections 2026: Live Coverage',
            wordCount: 1240,
            pictureCount: 3,
            readingTime: '5 min',
            publicationStatus: [
                { site: 'TheGlobe', status: 'draft' },
                { site: 'Mobile',   status: 'draft' }
            ]
        }
    },
    {
        id: 't2',
        title: 'Morning briefing: economic indicators',
        status: 'story-created',
        priority: 4,
        assignees: ['user3'],
        dueDate: '2026-04-02',
        shift: 'morning',
        eligibleForPrint: true,
        contentType: 'Article',
        articleRef: 'econ-brief-042',
        comment: '',
        article: {
            headline: 'Q1 Economic Indicators Summary',
            wordCount: 820,
            pictureCount: 1,
            readingTime: '3 min',
            publicationStatus: [
                { site: 'TheGlobe', status: 'draft' }
            ]
        }
    },
    {
        id: 't3',
        title: 'Sports gallery: Champions League recap',
        status: 'story-review',
        priority: 5,
        assignees: ['user4'],
        dueDate: '2026-04-02',
        shift: 'night',
        eligibleForPrint: false,
        contentType: 'Gallery',
        articleRef: 'sport-gallery-cl28',
        comment: 'Waiting for agency photo rights confirmation.',
        article: {
            headline: 'Champions League Quarter Final Gallery',
            wordCount: 180,
            pictureCount: 24,
            readingTime: '1 min',
            publicationStatus: [
                { site: 'TheGlobe', status: 'in-review' }
            ]
        }
    },
    {
        // story-ready + published live → Done column
        id: 't4',
        title: 'Breaking: parliament vote on budget',
        status: 'story-ready',
        priority: 1,
        assignees: ['user1'],
        dueDate: '2026-04-01',
        shift: 'morning',
        eligibleForPrint: false,
        contentType: 'Breaking News',
        articleRef: 'parliament-budget-v1',
        comment: '',
        article: {
            headline: 'Parliament Passes Emergency Budget',
            wordCount: 450,
            pictureCount: 2,
            readingTime: '2 min',
            publicationStatus: [
                { site: 'TheGlobe', status: 'published' },
                { site: 'Mobile',   status: 'published' }
            ]
        }
    },
    {
        id: 't5',
        title: 'Video interview: climate researcher',
        status: 'story-imported',
        priority: 6,
        assignees: ['user2', 'user5'],
        dueDate: '2026-04-05',
        shift: 'morning',
        eligibleForPrint: false,
        contentType: 'Interview',
        articleRef: null,
        comment: 'Raw footage due from camera crew by 14:00.',
        article: null
    },
    {
        id: 't6',
        title: 'Night desk: tech sector roundup',
        status: 'story-edit',
        priority: 7,
        assignees: ['user3', 'user4'],
        dueDate: '2026-04-02',
        shift: 'night',
        eligibleForPrint: false,
        contentType: 'Article',
        articleRef: 'tech-roundup-0401',
        comment: 'Include AI regulation angle.',
        article: {
            headline: 'Tech Sector Weekly: AI Regulation Looms',
            wordCount: 1100,
            pictureCount: 2,
            readingTime: '4 min',
            publicationStatus: [
                { site: 'TheGlobe', status: 'draft' }
            ]
        }
    },
    {
        // story-ready + published live + eligibleForPrint → Ready for Print column
        id: 't7',
        title: 'Print edition: weekend culture supplement',
        status: 'story-ready',
        priority: 3,
        assignees: ['user5'],
        dueDate: '2026-04-04',
        shift: 'morning',
        eligibleForPrint: true,
        contentType: 'Article',
        articleRef: 'culture-supp-wk14',
        comment: 'Layout approved by print editor.',
        article: {
            headline: 'Weekend Culture Supplement — Week 14',
            wordCount: 2800,
            pictureCount: 8,
            readingTime: '11 min',
            publicationStatus: [
                { site: 'Print',    status: 'ready' },
                { site: 'TheGlobe', status: 'published' }
            ]
        }
    },
    {
        // story-created, no assignees → To Do (backlog-like)
        id: 't8',
        title: 'Social media clips: football highlights',
        status: 'story-created',
        priority: 8,
        assignees: [],
        dueDate: '2026-04-06',
        shift: 'night',
        eligibleForPrint: false,
        contentType: 'Video',
        articleRef: null,
        comment: 'Waiting on rights clearance.',
        article: null
    },
    {
        // overdue — dueDate in the past, status story-review
        id: 't9',
        title: 'Editorial: Europe migration policy',
        status: 'story-review',
        priority: 2,
        assignees: ['user1', 'user3'],
        dueDate: '2026-03-31',
        shift: 'morning',
        eligibleForPrint: true,
        contentType: 'Article',
        articleRef: 'editorial-migration-p1',
        comment: 'Pending legal review before publishing.',
        article: {
            headline: 'Europe\'s Migration Policy at a Crossroads',
            wordCount: 1650,
            pictureCount: 3,
            readingTime: '6 min',
            publicationStatus: [
                { site: 'TheGlobe', status: 'in-review' }
            ]
        }
    },
    {
        // story-ready, not yet published → Ready to Publish column
        id: 't10',
        title: 'Infographic: energy prices tracker',
        status: 'story-ready',
        priority: 5,
        assignees: ['user2'],
        dueDate: '2026-04-07',
        shift: 'morning',
        eligibleForPrint: false,
        contentType: 'Gallery',
        articleRef: 'energy-tracker-apr',
        comment: 'Data from energy ministry API, updated daily.',
        article: {
            headline: 'Energy Prices: April Tracker',
            wordCount: 320,
            pictureCount: 5,
            readingTime: '2 min',
            publicationStatus: [
                { site: 'TheGlobe', status: 'ready' }
            ]
        }
    }
];

// =============================================
// STATE
// =============================================
const IS_DEMO = new URLSearchParams(window.location.search).get('demo') === 'true';

const state = {
    tasks:        [],
    activeQuery:  'all',
    activeView:   'kanban',
    calendarMode: 'month',
    currentDate:  new Date(),
    myTasksMode:  false,
    selectedTask: null,
    currentUser:  { id: 'user1', name: 'Marco Rossi' },
    // keyed by combo instance id → array of selected user ids
    comboSelections: {}
};

// =============================================
// API HELPERS
// =============================================
async function apiPut(path, body) {
    try {
        return await PanelAPI.apiCallJson(path, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
    } catch (err) {
        showToast(err.message || 'API error', 'error');
        throw err;
    }
}

async function apiPost(path, body) {
    try {
        return await PanelAPI.apiCallJson(path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
    } catch (err) {
        showToast(err.message || 'API error', 'error');
        throw err;
    }
}

// INTEGRATION POINT: fetch tasks from Neon workflow API
async function loadTasksFromNeon() {
    try {
        // const data = await PanelAPI.apiCallJson('/widgets/planning-board/tasks');
        // state.tasks = data;
        console.log('[Planning Board] Live mode: INTEGRATION POINT — replace with real Neon API call');
        state.tasks = [];
        renderMainContent();
    } catch (err) {
        showToast('Failed to load tasks', 'error');
    }
}

// =============================================
// TOAST
// =============================================
function showToast(message, type = 'success') {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// =============================================
// MODAL
// =============================================
function showModal(html) {
    document.getElementById('modalContainer').innerHTML = html;
}
function closeModal() {
    document.getElementById('modalContainer').innerHTML = '';
}

// =============================================
// HEADER / VIEW SWITCHER
// =============================================
function initHeader() {
    document.querySelectorAll('.pb-view-pill-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            state.activeView = btn.dataset.view;
            document.querySelectorAll('.pb-view-pill-btn').forEach(b =>
                b.classList.toggle('active', b.dataset.view === state.activeView)
            );
            renderMainContent();
        });
    });

    document.getElementById('myTasksBtn').addEventListener('click', () => {
        state.myTasksMode = !state.myTasksMode;
        document.getElementById('myTasksBtn').classList.toggle('active', state.myTasksMode);
        renderMainContent();
    });

    document.getElementById('addTaskBtn').addEventListener('click', () => showNewTaskModal());
}

// =============================================
// QUERY SWITCHER
// =============================================
function initQuerySwitcher() {
    document.querySelectorAll('.pb-query-tab[data-query]').forEach(tab => {
        tab.addEventListener('click', () => {
            const q = tab.dataset.query;
            if (q === 'add') return;
            state.activeQuery = q;
            document.querySelectorAll('.pb-query-tab').forEach(t =>
                t.classList.toggle('active', t.dataset.query === state.activeQuery)
            );
            renderMainContent();
            showToast(`Filter: ${tab.textContent.trim()}`);
        });
    });
}

// =============================================
// FILTERS
// =============================================
function getFilteredTasks() {
    let tasks = state.tasks;

    if (state.myTasksMode) {
        tasks = tasks.filter(t => t.assignees.includes(state.currentUser.id));
    }

    const now = new Date(); now.setHours(0, 0, 0, 0);

    switch (state.activeQuery) {
        case 'morning':
            tasks = tasks.filter(t => t.shift === 'morning');
            break;
        case 'night':
            tasks = tasks.filter(t => t.shift === 'night');
            break;
        case 'urgent':
            tasks = tasks.filter(t => t.priority <= 3);
            break;
        case 'overdue':
            tasks = tasks.filter(t => {
                if (!t.dueDate) return false;
                const col = getKanbanColForTask(t);
                if (col === 'done' || col === 'print') return false;
                return new Date(t.dueDate) < now;
            });
            break;
    }

    return tasks;
}

// =============================================
// COLUMN MEMBERSHIP
// =============================================
function getKanbanColForTask(task) {
    if (task.status === 'story-ready') {
        const isPublishedLive = (task.article?.publicationStatus || []).some(ps => ps.status === 'published');
        if (!isPublishedLive) return 'ready';
        if (task.eligibleForPrint) return 'print';
        return 'done';
    }
    const ns = NEON_STATUSES.find(s => s.id === task.status);
    return ns ? ns.kanbanCol : 'todo';
}

// =============================================
// MAIN CONTENT DISPATCHER
// =============================================
function renderMainContent() {
    const el = document.getElementById('pbMainContent');
    if (state.activeView === 'kanban') {
        el.innerHTML = renderKanbanHtml();
    } else {
        el.innerHTML = renderCalendarHtml();
    }
}

function initMainContent() {
    document.getElementById('pbMainContent').addEventListener('click', e => {
        const card = e.target.closest('.pb-card[data-task-id]');
        if (card) { openDetailPanel(card.dataset.taskId); return; }

        const calPill = e.target.closest('.pb-cal-pill[data-task-id]');
        if (calPill) { openDetailPanel(calPill.dataset.taskId); return; }

        const dayTask = e.target.closest('.pb-cal-day-task[data-task-id]');
        if (dayTask) { openDetailPanel(dayTask.dataset.taskId); return; }

        // Add task button — only present in To Do column
        const addBtn = e.target.closest('.pb-add-col-btn[data-status]');
        if (addBtn) { showNewTaskModal(); return; }

        const modeBtn = e.target.closest('.pb-cal-mode-btn[data-mode]');
        if (modeBtn) { setCalMode(modeBtn.dataset.mode); return; }

        const navBtn = e.target.closest('[data-calnav]');
        if (navBtn) { calNavigate(parseInt(navBtn.dataset.calnav, 10)); return; }

        const todayBtn = e.target.closest('[data-caltoday]');
        if (todayBtn) { calNavigate(0); return; }
    });
}

// =============================================
// KANBAN RENDER
// =============================================
function renderKanbanHtml() {
    const tasks = getFilteredTasks();
    const columns = [...BASE_KANBAN_COLUMNS];
    if (tasks.some(t => getKanbanColForTask(t) === 'done'))  columns.push(DONE_COL);
    if (tasks.some(t => getKanbanColForTask(t) === 'print')) columns.push(PRINT_COL);
    const cols = columns.map(col => renderColumnHtml(col, tasks)).join('');
    return `<div class="pb-kanban">${cols}</div>`;
}

function renderColumnHtml(col, tasks) {
    const colTasks = tasks
        .filter(t => getKanbanColForTask(t) === col.id)
        .sort((a, b) => a.priority - b.priority);

    const cardsHtml = colTasks.length > 0
        ? colTasks.map(t => renderCardHtml(t)).join('')
        : `<div class="pb-empty-col">No tasks</div>`;

    // "Add task" button only in the To Do column
    const footerHtml = col.id === 'todo'
        ? `<div class="pb-column-footer"><button class="pb-add-col-btn" data-status="todo">+ Add task</button></div>`
        : '';

    return `
    <div class="pb-column">
        <div class="pb-column-header">
            <span class="pb-status-dot" style="background:${col.color}"></span>
            <span class="pb-column-name">${esc(col.label)}</span>
            <span class="pb-column-count">${colTasks.length}</span>
        </div>
        <div class="pb-column-body">${cardsHtml}</div>
        ${footerHtml}
    </div>`;
}

function renderCardHtml(task) {
    const today    = new Date(); today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
    let dueCls = '';
    if (task.dueDate) {
        const due = new Date(task.dueDate);
        const col = getKanbanColForTask(task);
        if (col !== 'done' && col !== 'print') {
            if (due < today) dueCls = 'overdue';
            else if (due <= tomorrow) dueCls = 'due-soon';
        }
    }

    const dueDateHtml = task.dueDate
        ? `<span class="pb-due-chip ${dueCls}">${formatDate(task.dueDate)}</span>`
        : '';

    const avatarsHtml = task.assignees.slice(0, 3).map(uid => {
        const u = getUserById(uid);
        return u ? `<span class="pb-avatar" style="background:${getUserColor(u)}" title="${esc(u.name)}">${u.initials}</span>` : '';
    }).join('');

    const priCls = task.priority <= 3 ? 'pb-priority-high' : task.priority <= 6 ? 'pb-priority-medium' : 'pb-priority-low';

    // chips: content type + priority + print eligibility
    const chipsHtml = [
        task.contentType ? `<span class="pb-badge">${esc(task.contentType)}</span>` : '',
        `<span class="pb-priority-badge ${priCls}">P${task.priority}</span>`,
        task.eligibleForPrint ? `<span class="pb-badge" style="background:#f5f3ff;color:#5b21b6;border-color:#ddd6fe;">Print</span>` : ''
    ].filter(Boolean).join('');

    // status dot uses Neon status colour
    const ns = NEON_STATUSES.find(s => s.id === task.status);
    const dotColor = ns ? ns.color : '#6b7280';

    const isMyTask  = task.assignees.includes(state.currentUser.id);
    const myTaskCls = state.myTasksMode ? (isMyTask ? 'my-task' : 'dimmed') : '';

    return `
    <div class="pb-card ${myTaskCls}" data-task-id="${task.id}">
        <div style="display:flex;align-items:flex-start;gap:0.375rem;margin-bottom:0.375rem;">
            <span class="pb-status-dot" style="background:${dotColor};margin-top:0.25rem;flex-shrink:0;"></span>
            <div class="pb-card-title" style="margin:0;">${esc(task.title)}</div>
        </div>
        <div class="pb-card-chips">${chipsHtml}</div>
        <div class="pb-card-footer">
            <div>${dueDateHtml}</div>
            <div class="pb-card-avatars">${avatarsHtml}</div>
        </div>
    </div>`;
}

// =============================================
// CALENDAR RENDER
// =============================================
function renderCalendarHtml() {
    return `<div class="pb-calendar">${renderCalendarNav()}${renderCalendarGrid()}</div>`;
}

function renderCalendarNav() {
    const label = getCalendarLabel();
    const modeBtns = ['month','week','day'].map(m =>
        `<button class="pb-cal-mode-btn ${state.calendarMode === m ? 'active' : ''}" data-mode="${m}">${m.charAt(0).toUpperCase()+m.slice(1)}</button>`
    ).join('');
    return `
    <div class="pb-cal-nav">
        <div class="pb-cal-mode-switcher">${modeBtns}</div>
        <div class="pb-cal-period">
            <button class="btn-icon" data-calnav="-1">&#8249;</button>
            <span class="pb-cal-label">${label}</span>
            <button class="btn-icon" data-calnav="1">&#8250;</button>
            <button class="btn-secondary" style="font-size:0.8rem;padding:0.25rem 0.625rem;" data-caltoday="1">Today</button>
        </div>
    </div>`;
}

function renderCalendarGrid() {
    if (state.calendarMode === 'month') return `<div class="pb-cal-body">${renderMonthGrid()}</div>`;
    if (state.calendarMode === 'week')  return `<div class="pb-cal-body">${renderWeekGrid()}</div>`;
    return `<div class="pb-cal-body">${renderDayGrid()}</div>`;
}

function renderMonthGrid() {
    const tasks = getFilteredTasks();
    const year = state.currentDate.getFullYear();
    const month = state.currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay  = new Date(year, month + 1, 0);
    const startOffset = firstDay.getDay();
    const todayStr_ = todayStr();

    const headers = DAYS_SHORT.map(d => `<div class="pb-cal-day-header">${d}</div>`).join('');
    let cells = headers;

    for (let i = 0; i < startOffset; i++) {
        cells += `<div class="pb-cal-cell empty"></div>`;
    }
    for (let d = 1; d <= lastDay.getDate(); d++) {
        const dateStr = `${year}-${pad(month+1)}-${pad(d)}`;
        const dayTasks = tasks.filter(t => t.dueDate === dateStr);
        const isToday  = dateStr === todayStr_;
        const dateLabel = isToday
            ? `<span class="pb-cal-date today">${d}</span>`
            : `<span class="pb-cal-date">${d}</span>`;
        const pillsHtml = dayTasks.slice(0, 3).map(t => calPillHtml(t)).join('');
        const moreHtml  = dayTasks.length > 3
            ? `<div class="pb-cal-more">+${dayTasks.length - 3} more</div>` : '';
        cells += `
        <div class="pb-cal-cell ${isToday ? 'today' : ''}">
            ${dateLabel}${pillsHtml}${moreHtml}
        </div>`;
    }

    return `<div class="pb-cal-month-grid">${cells}</div>`;
}

function renderWeekGrid() {
    const tasks = getFilteredTasks();
    const d = state.currentDate;
    const dayOfWeek = d.getDay();
    const mon = new Date(d); mon.setDate(d.getDate() - ((dayOfWeek + 6) % 7));
    const todayStr_ = todayStr();

    const headers = [];
    const cells   = [];
    for (let i = 0; i < 7; i++) {
        const day     = new Date(mon); day.setDate(mon.getDate() + i);
        const dateStr = dateToStr(day);
        const isToday = dateStr === todayStr_;
        const dayName = DAYS_SHORT[day.getDay()];
        headers.push(`<div class="pb-cal-day-header">${dayName} ${day.getDate()}</div>`);
        const dayTasks  = tasks.filter(t => t.dueDate === dateStr);
        const pillsHtml = dayTasks.slice(0, 3).map(t => calPillHtml(t)).join('');
        const moreHtml  = dayTasks.length > 3 ? `<div class="pb-cal-more">+${dayTasks.length - 3}</div>` : '';
        cells.push(`<div class="pb-cal-cell ${isToday ? 'today' : ''}">${pillsHtml}${moreHtml}</div>`);
    }

    return `<div class="pb-cal-week-grid">${headers.join('')}${cells.join('')}</div>`;
}

function renderDayGrid() {
    const tasks    = getFilteredTasks();
    const dateStr  = dateToStr(state.currentDate);
    const dayTasks = tasks.filter(t => t.dueDate === dateStr);
    const morning  = dayTasks.filter(t => t.shift === 'morning');
    const night    = dayTasks.filter(t => t.shift === 'night');
    const neither  = dayTasks.filter(t => t.shift !== 'morning' && t.shift !== 'night');

    function slotHtml(label, slotTasks) {
        if (slotTasks.length === 0) return '';
        const taskRows = slotTasks.map(t => {
            const ns = NEON_STATUSES.find(s => s.id === t.status);
            const dotColor = ns ? ns.color : '#6b7280';
            const u = t.assignees.length > 0 ? getUserById(t.assignees[0]) : null;
            const avatarHtml = u ? `<span class="pb-avatar" style="background:${getUserColor(u)}">${u.initials}</span>` : '';
            return `<div class="pb-cal-day-task" data-task-id="${t.id}">
                <span class="pb-status-dot" style="background:${dotColor}"></span>
                <span class="pb-cal-day-task-title">${esc(t.title)}</span>
                ${avatarHtml}
            </div>`;
        }).join('');
        return `<div>
            <div class="pb-cal-slot-header">${label}</div>
            <div class="pb-cal-slot-tasks">${taskRows}</div>
        </div>`;
    }

    const content = morning.length + night.length + neither.length === 0
        ? `<div style="color:var(--text-muted);font-size:0.875rem;padding:2rem 0;">No tasks due on this day.</div>`
        : [slotHtml('Morning', morning), slotHtml('Night', night), slotHtml('Other', neither)].join('');

    return `<div class="pb-cal-day-view">${content}</div>`;
}

function calPillHtml(task) {
    const ns = NEON_STATUSES.find(s => s.id === task.status);
    const color = ns ? ns.color : '#6b7280';
    return `<div class="pb-cal-pill" data-task-id="${task.id}"
        style="background:${color}"
        title="${esc(task.title)}">${esc(task.title)}</div>`;
}

// =============================================
// ASSIGNEE COMBOBOX
// =============================================
function hashColor(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) & 0xffffffff;
    const hue = Math.abs(h) % 360;
    return `hsl(${hue}, 55%, 45%)`;
}

function getUserColor(user) {
    return user.color || hashColor(user.id);
}

// Render the combobox HTML (stateless — called on every open/change)
function renderAssigneeCombo(comboId, selectedIds, filterText) {
    const chips = selectedIds.map(uid => {
        const u = getUserById(uid);
        if (!u) return '';
        const color = getUserColor(u);
        return `<span class="pb-combo-chip">
            <span class="pb-avatar" style="background:${color};width:16px;height:16px;font-size:0.4375rem;">${u.initials}</span>
            ${esc(u.name)}
            <button class="pb-combo-chip-remove" onclick="comboRemove('${comboId}','${uid}')" title="Remove">&#x2715;</button>
        </span>`;
    }).join('');

    const q = (filterText || '').toLowerCase();
    const available = USERS.filter(u =>
        !selectedIds.includes(u.id) && u.name.toLowerCase().includes(q)
    );

    const options = available.length > 0
        ? available.map(u => `
            <div class="pb-combo-option" onclick="comboSelect('${comboId}','${u.id}')">
                <span class="pb-avatar" style="background:${getUserColor(u)}">${u.initials}</span>
                ${esc(u.name)}
            </div>`).join('')
        : `<div class="pb-combo-empty">No users found</div>`;

    return `
    <div class="pb-combo-root" id="${comboId}">
        <div class="pb-combo-box" onclick="focusComboInput('${comboId}')">
            ${chips}
            <input class="pb-combo-input"
                   id="${comboId}-input"
                   placeholder="${selectedIds.length === 0 ? 'Add assignees…' : ''}"
                   oninput="comboFilter('${comboId}')"
                   onfocus="comboOpen('${comboId}')"
                   autocomplete="off">
        </div>
        <div class="pb-combo-dropdown" id="${comboId}-dropdown" style="display:none;">
            ${options}
        </div>
    </div>`;
}

function focusComboInput(comboId) {
    const input = document.getElementById(`${comboId}-input`);
    if (input) { input.focus(); comboOpen(comboId); }
}

function comboOpen(comboId) {
    const dd = document.getElementById(`${comboId}-dropdown`);
    if (dd) dd.style.display = 'block';
}

function comboClose(comboId) {
    const dd = document.getElementById(`${comboId}-dropdown`);
    if (dd) dd.style.display = 'none';
}

function comboFilter(comboId) {
    const input  = document.getElementById(`${comboId}-input`);
    const filter = input ? input.value : '';
    const sel    = state.comboSelections[comboId] || [];
    const dd     = document.getElementById(`${comboId}-dropdown`);
    if (!dd) return;
    const q  = filter.toLowerCase();
    const available = USERS.filter(u => !sel.includes(u.id) && u.name.toLowerCase().includes(q));
    dd.innerHTML = available.length > 0
        ? available.map(u => `
            <div class="pb-combo-option" onclick="comboSelect('${comboId}','${u.id}')">
                <span class="pb-avatar" style="background:${getUserColor(u)}">${u.initials}</span>
                ${esc(u.name)}
            </div>`).join('')
        : `<div class="pb-combo-empty">No users found</div>`;
    dd.style.display = 'block';
}

function comboSelect(comboId, userId) {
    if (!state.comboSelections[comboId]) state.comboSelections[comboId] = [];
    if (!state.comboSelections[comboId].includes(userId)) {
        state.comboSelections[comboId] = [...state.comboSelections[comboId], userId];
    }
    refreshComboBox(comboId);
    // keep input focused
    const input = document.getElementById(`${comboId}-input`);
    if (input) { input.value = ''; input.focus(); comboFilter(comboId); }
}

function comboRemove(comboId, userId) {
    state.comboSelections[comboId] = (state.comboSelections[comboId] || []).filter(id => id !== userId);
    refreshComboBox(comboId);
}

function refreshComboBox(comboId) {
    const box = document.getElementById(comboId);
    if (!box) return;
    const input   = document.getElementById(`${comboId}-input`);
    const filterText = input ? input.value : '';
    const sel = state.comboSelections[comboId] || [];

    const chips = sel.map(uid => {
        const u = getUserById(uid);
        if (!u) return '';
        return `<span class="pb-combo-chip">
            <span class="pb-avatar" style="background:${getUserColor(u)};width:16px;height:16px;font-size:0.4375rem;">${u.initials}</span>
            ${esc(u.name)}
            <button class="pb-combo-chip-remove" onclick="comboRemove('${comboId}','${uid}')" title="Remove">&#x2715;</button>
        </span>`;
    }).join('');

    const comboBox = box.querySelector('.pb-combo-box');
    if (comboBox) {
        // Remove old chips, keep the input
        Array.from(comboBox.querySelectorAll('.pb-combo-chip')).forEach(c => c.remove());
        comboBox.insertAdjacentHTML('afterbegin', chips);
        const inp = comboBox.querySelector('.pb-combo-input');
        if (inp) inp.placeholder = sel.length === 0 ? 'Add assignees…' : '';
    }
}

// Close combobox when clicking outside
document.addEventListener('click', e => {
    document.querySelectorAll('.pb-combo-root').forEach(root => {
        if (!root.contains(e.target)) comboClose(root.id);
    });
});

// =============================================
// DETAIL PANEL
// =============================================
function initDetailPanel() {
    document.getElementById('detailOverlay').addEventListener('click', closeDetailPanel);
}

function openDetailPanel(taskId) {
    state.selectedTask = taskId;
    const task = state.tasks.find(t => t.id === taskId);
    if (task) {
        state.comboSelections['dp-combo'] = [...task.assignees];
    }
    renderDetailPanel();
    document.getElementById('detailPanel').classList.add('open');
    document.getElementById('detailOverlay').classList.add('open');
}

function closeDetailPanel() {
    state.selectedTask = null;
    document.getElementById('detailPanel').classList.remove('open');
    document.getElementById('detailOverlay').classList.remove('open');
}

function renderDetailPanel() {
    if (!state.selectedTask) return;
    const task = state.tasks.find(t => t.id === state.selectedTask);
    if (!task) return;

    const statusOptions = NEON_STATUSES.map(s =>
        `<option value="${s.id}" ${task.status === s.id ? 'selected' : ''}>${s.label}</option>`
    ).join('');

    const priorityOptions = Array.from({ length: 10 }, (_, i) =>
        `<option value="${i}" ${task.priority === i ? 'selected' : ''}>P${i}${i === 0 ? ' — No Priority' : i === 8 ? ' — Critical' : i === 9 ? ' — Breaking' : ''}</option>`
    ).join('');

    const ctOptions = CONTENT_TYPES.map(ct =>
        `<option value="${ct}" ${task.contentType === ct ? 'selected' : ''}>${ct}</option>`
    ).join('');

    const shiftOptions = ['morning','night'].map(s =>
        `<option value="${s}" ${task.shift === s ? 'selected' : ''}>${s.charAt(0).toUpperCase()+s.slice(1)}</option>`
    ).join('');

    const assigneeComboHtml = renderAssigneeCombo('dp-combo', state.comboSelections['dp-combo'] || [], '');

    const articleSectionHtml = task.article ? `
        <div class="pb-info-box">
            <div class="pb-info-box-title">${esc(task.article.headline)}</div>
            <div class="pb-stat-tiles">
                <div class="pb-stat-tile">
                    <div class="pb-stat-value">${task.article.wordCount.toLocaleString()}</div>
                    <div class="pb-stat-label">Words</div>
                </div>
                <div class="pb-stat-tile">
                    <div class="pb-stat-value">${task.article.pictureCount}</div>
                    <div class="pb-stat-label">Pictures</div>
                </div>
                <div class="pb-stat-tile">
                    <div class="pb-stat-value">${esc(task.article.readingTime)}</div>
                    <div class="pb-stat-label">Read time</div>
                </div>
            </div>
            <div>
                ${task.article.publicationStatus.map(ps => `
                <div class="pb-pub-status-row">
                    <span>${esc(ps.site)}</span>
                    <span><span class="pb-pub-dot ${pubStatusClass(ps.status)}"></span>${esc(ps.status)}</span>
                </div>`).join('')}
            </div>
            ${task.articleRef ? `<button class="btn-primary" style="width:100%;margin-top:0.875rem;" onclick="openArticle('${esc(task.articleRef)}')">Open Article</button>` : ''}
        </div>` : `<div class="pb-no-article">No article linked to this task yet.</div>`;

    const printSectionHtml = task.eligibleForPrint ? `
        <hr class="pb-section-divider">
        <div class="pb-section-heading">Print</div>
        <div class="pb-print-box">
            <div class="pb-print-box-title">Méthode — Print Object</div>
            <div style="font-size:0.8125rem;color:var(--text-secondary);line-height:1.5;">
                <div><strong>Edition:</strong> Weekend Print</div>
                <div><strong>Section:</strong> Front Page / Culture</div>
                <div><strong>Status:</strong> Layout Approved</div>
            </div>
            <button class="btn-methode" onclick="openInMethode('${esc(task.id)}')">Open in Méthode</button>
        </div>` : '';

    document.getElementById('detailPanel').innerHTML = `
    <div class="pb-detail-header">
        <textarea class="pb-detail-title" id="dp-title" rows="2">${esc(task.title)}</textarea>
        <button class="btn-icon" onclick="closeDetailPanel()" title="Close">&#x2715;</button>
    </div>
    <div class="pb-detail-body">
        <div class="pb-detail-field">
            <label class="pb-detail-label">Status</label>
            <select class="pb-detail-select" id="dp-status">${statusOptions}</select>
        </div>
        <div class="pb-detail-field">
            <label class="pb-detail-label">Priority</label>
            <select class="pb-detail-select" id="dp-priority">${priorityOptions}</select>
        </div>
        <div class="pb-detail-field">
            <label class="pb-detail-label">Content Type</label>
            <select class="pb-detail-select" id="dp-contentType">${ctOptions}</select>
        </div>
        <div class="pb-detail-field">
            <label class="pb-detail-label">Due Date</label>
            <input type="date" class="input-field" id="dp-dueDate" value="${task.dueDate || ''}">
        </div>
        <div class="pb-detail-field">
            <label class="pb-detail-label">Shift</label>
            <select class="pb-detail-select" id="dp-shift">${shiftOptions}</select>
        </div>
        <div class="pb-detail-field">
            <label class="pb-detail-label">Assignees</label>
            ${assigneeComboHtml}
        </div>
        <div class="pb-toggle-row pb-detail-field">
            <label class="pb-detail-label pb-toggle-label">Eligible for Print</label>
            <input type="checkbox" class="pb-checkbox" id="dp-eligibleForPrint" ${task.eligibleForPrint ? 'checked' : ''}>
        </div>
        <div class="pb-detail-field">
            <label class="pb-detail-label">Comment</label>
            <textarea class="input-field" id="dp-comment" rows="3" style="resize:vertical;">${esc(task.comment || '')}</textarea>
        </div>
        <hr class="pb-section-divider">
        <div class="pb-section-heading">Article</div>
        ${articleSectionHtml}
        ${printSectionHtml}
    </div>
    <div class="pb-detail-footer">
        <button class="btn-primary" style="flex:1;" onclick="saveDetailPanel()">Save Changes</button>
        <button class="btn-danger" onclick="deleteTask('${task.id}')">Delete</button>
    </div>`;
}

function saveDetailPanel() {
    const task = state.tasks.find(t => t.id === state.selectedTask);
    if (!task) return;

    task.title            = document.getElementById('dp-title').value.trim() || task.title;
    task.status           = document.getElementById('dp-status').value;
    task.priority         = parseInt(document.getElementById('dp-priority').value, 10);
    task.contentType      = document.getElementById('dp-contentType').value;
    task.dueDate          = document.getElementById('dp-dueDate').value || null;
    task.shift            = document.getElementById('dp-shift').value;
    task.eligibleForPrint = document.getElementById('dp-eligibleForPrint').checked;
    task.comment          = document.getElementById('dp-comment').value.trim();
    task.assignees        = [...(state.comboSelections['dp-combo'] || [])];

    // INTEGRATION POINT: await apiPut(`/widgets/planning-board/tasks/${task.id}`, task);

    showToast('Task updated');
    renderMainContent();
    renderDetailPanel();
}

function deleteTask(taskId) {
    if (!confirm('Delete this task?')) return;
    state.tasks = state.tasks.filter(t => t.id !== taskId);
    closeDetailPanel();
    renderMainContent();
    showToast('Task deleted');
}

function openArticle(articleRef) {
    if (!articleRef) return;
    const neonUrl = (typeof CONFIG !== 'undefined' && CONFIG.neonAppUrl) || '';
    if (!neonUrl) { showToast('Neon App URL not configured', 'error'); return; }
    window.open(`${neonUrl}/neon/app/neon.html#open/${articleRef}`, '_blank');
}

function openInMethode(taskId) {
    // INTEGRATION POINT: open Méthode/Swing with the linked print object reference
    showToast('Opening in Méthode…');
}

// =============================================
// NEW TASK MODAL
// =============================================
function showNewTaskModal() {
    // New tasks always start in To Do; allow status selection within To Do statuses only
    const todoStatuses = NEON_STATUSES.filter(s => s.kanbanCol === 'todo');
    const statusOptions = todoStatuses.map(s =>
        `<option value="${s.id}" ${s.id === 'story-created' ? 'selected' : ''}>${s.label}</option>`
    ).join('');

    const priorityOptions = Array.from({ length: 10 }, (_, i) =>
        `<option value="${i}" ${i === 5 ? 'selected' : ''}>P${i}${i === 0 ? ' — No Priority' : i === 8 ? ' — Critical' : i === 9 ? ' — Breaking' : ''}</option>`
    ).join('');

    const ctOptions = CONTENT_TYPES.map(ct =>
        `<option value="${ct}" ${ct === 'Article' ? 'selected' : ''}>${ct}</option>`
    ).join('');

    state.comboSelections['nt-combo'] = [];
    const assigneeComboHtml = renderAssigneeCombo('nt-combo', [], '');

    showModal(`
    <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
        <div class="modal-content">
            <h2 class="modal-title">New Task</h2>
            <div class="form-group">
                <label class="form-label">Title <span style="color:#ef4444;">*</span></label>
                <input type="text" class="input-field" id="nt-title" placeholder="Task title…" autofocus>
            </div>
            <div class="form-group">
                <label class="form-label">Content Type</label>
                <select class="input-field" id="nt-contentType">${ctOptions}</select>
            </div>
            <div class="form-group">
                <label class="form-label">Status</label>
                <select class="input-field" id="nt-status">${statusOptions}</select>
            </div>
            <div class="form-group">
                <label class="form-label">Priority</label>
                <select class="input-field" id="nt-priority">${priorityOptions}</select>
            </div>
            <div class="form-group">
                <label class="form-label">Due Date</label>
                <input type="date" class="input-field" id="nt-dueDate">
            </div>
            <div class="form-group">
                <label class="form-label">Shift</label>
                <select class="input-field" id="nt-shift">
                    <option value="morning">Morning</option>
                    <option value="night">Night</option>
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">Assignees</label>
                ${assigneeComboHtml}
            </div>
            <div class="form-group">
                <div class="pb-toggle-row">
                    <label class="form-label" style="margin:0;">Eligible for Print</label>
                    <input type="checkbox" class="pb-checkbox" id="nt-eligibleForPrint">
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">Comment</label>
                <textarea class="input-field" id="nt-comment" rows="3" placeholder="Optional notes…" style="resize:vertical;"></textarea>
            </div>
            <div class="modal-footer">
                <button class="btn-secondary" onclick="closeModal()">Cancel</button>
                <button class="btn-primary" onclick="createTask()">Create Task</button>
            </div>
        </div>
    </div>`);
}

function createTask() {
    const title = document.getElementById('nt-title').value.trim();
    if (!title) { showToast('Title is required', 'error'); return; }

    const task = {
        id:               't' + Date.now(),
        title,
        status:           document.getElementById('nt-status').value,
        priority:         parseInt(document.getElementById('nt-priority').value, 10),
        contentType:      document.getElementById('nt-contentType').value,
        dueDate:          document.getElementById('nt-dueDate').value || null,
        shift:            document.getElementById('nt-shift').value,
        eligibleForPrint: document.getElementById('nt-eligibleForPrint').checked,
        comment:          document.getElementById('nt-comment').value.trim(),
        assignees:        [...(state.comboSelections['nt-combo'] || [])],
        articleRef:       null,
        article:          null
    };

    state.tasks.push(task);
    // INTEGRATION POINT: await apiPost('/widgets/planning-board/tasks', task);

    showToast(`"${title}" created`);
    closeModal();
    renderMainContent();
}

// =============================================
// UTILITIES
// =============================================
function esc(str) {
    if (str === null || str === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
}

function pad(n) { return String(n).padStart(2, '0'); }

function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}

function dateToStr(date) {
    return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`;
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const [, m, d] = dateStr.split('-');
    return `${MONTHS_SHORT[parseInt(m,10)-1]} ${parseInt(d,10)}`;
}

function getUserById(userId) {
    return USERS.find(u => u.id === userId);
}

function getCalendarLabel() {
    const d = state.currentDate;
    if (state.calendarMode === 'month') return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
    if (state.calendarMode === 'week') {
        const day = d.getDay();
        const mon = new Date(d); mon.setDate(d.getDate() - ((day + 6) % 7));
        const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
        return `${formatDate(dateToStr(mon))} — ${formatDate(dateToStr(sun))} ${mon.getFullYear()}`;
    }
    return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function pubStatusClass(status) {
    const map = { published: 'pub-published', draft: 'pub-draft', 'in-review': 'pub-in-review', scheduled: 'pub-scheduled', ready: 'pub-ready' };
    return map[status] || 'pub-draft';
}

function setCalMode(mode) {
    state.calendarMode = mode;
    renderMainContent();
}

function calNavigate(direction) {
    if (direction === 0) {
        state.currentDate = new Date();
    } else {
        const d = new Date(state.currentDate);
        if (state.calendarMode === 'month')      d.setMonth(d.getMonth() + direction);
        else if (state.calendarMode === 'week')  d.setDate(d.getDate() + direction * 7);
        else                                     d.setDate(d.getDate() + direction);
        state.currentDate = d;
    }
    renderMainContent();
}

// =============================================
// INIT
// =============================================
document.addEventListener('DOMContentLoaded', () => {
    if (IS_DEMO) {
        state.tasks = DEMO_TASKS.map(t => ({ ...t, assignees: [...t.assignees] }));
    }

    initHeader();
    initQuerySwitcher();
    initMainContent();
    initDetailPanel();

    if (IS_DEMO) {
        renderMainContent();
    } else {
        loadTasksFromNeon();
    }
});
