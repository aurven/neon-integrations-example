// ===== DEMO DATA =====
// Source: examples/family_audit_example_3.json (items unwrapped from WebEventItem)
const DEMO_EVENTS = [
    {
        "type": "authoringmetric", "requestId": "f8334c61-6d1c-4eb5-90d7-efaf9631e8ff",
        "timestamp": "2026-04-10T15:30:07.955Z", "responseStatusCode": 200,
        "requestCall": "PUT /contents/nodes/lock", "resourceCall": "PUT /contents/nodes/lock",
        "requestQueryParameters": {}, "serviceId": "contents",
        "userName": "Aureliano", "userId": "62038d84-f161-3579-a5f1-7aba053f999a",
        "indexRetry": 0, "durationMs": 80,
        "involvedRefs": ["02a2-2004b0d44355-f548da67dbba-1000"], "externalRefs": [],
        "types": ["article"], "workflows": ["Story/Ready"], "workFolderPaths": ["/Convergent/News"]
    },
    {
        "type": "authoringmetric", "requestId": "9d4ff02e-a231-4687-ad3f-1e65f3f7b54f",
        "timestamp": "2026-04-10T12:46:17.078Z", "responseStatusCode": 200,
        "requestCall": "PUT /contents/nodes/unlock", "resourceCall": "PUT /contents/nodes/unlock",
        "requestQueryString": "unlockMode=UNDO", "requestQueryParameters": { "unlockMode": ["UNDO"] },
        "serviceId": "contents", "userName": "Aureliano", "userId": "62038d84-f161-3579-a5f1-7aba053f999a",
        "indexRetry": 0, "durationMs": 81,
        "involvedRefs": ["02a2-2004b0d44355-f548da67dbba-1000"], "externalRefs": [],
        "types": ["article"], "workflows": ["Story/Ready"], "workFolderPaths": ["/Convergent/News"]
    },
    {
        "type": "authoringmetric", "requestId": "6b0305f2-1e9e-4501-823d-f8f41c0b4e59",
        "timestamp": "2026-04-10T12:46:09.934Z", "responseStatusCode": 200,
        "requestCall": "PUT /contents/story/02a2-2004b0d44355-f548da67dbba-1000", "resourceCall": "PUT /contents/story/{id}",
        "requestQueryString": "saveMode=MINOR_CHECKIN&keepCheckedout=true",
        "requestQueryParameters": { "saveMode": ["MINOR_CHECKIN"], "keepCheckedout": ["true"] },
        "serviceId": "contents", "userName": "Aureliano", "userId": "62038d84-f161-3579-a5f1-7aba053f999a",
        "indexRetry": 0, "durationMs": 476,
        "involvedRefs": ["02a2-2004b0d44355-f548da67dbba-1000"], "externalRefs": [],
        "types": ["article"], "workflows": ["Story/Ready"], "workFolderPaths": ["/Convergent/News"]
    },
    {
        "type": "promotemetric", "requestId": "118b7a27-38a0-4ece-bfb3-e554d4f45b9c",
        "timestamp": "2026-04-10T12:05:57.684Z", "responseStatusCode": 200,
        "requestCall": "POST /contents/nodes/02a2-2004b0d44355-f548da67dbba-1000/promote/LIVE",
        "resourceCall": "POST /contents/nodes/{id}/promote/{viewStatus}",
        "requestQueryParameters": {}, "serviceId": "contents",
        "userName": "Aureliano", "userId": "62038d84-f161-3579-a5f1-7aba053f999a",
        "siteName": ["NextFrontier", "TheGlobe"],
        "indexRetry": 0, "durationMs": 706,
        "involvedRefs": ["02a2-2004b0d44355-f548da67dbba-1000"],
        "updatedRefs": ["02a2-2004b0d44355-f548da67dbba-1000"], "removedRefs": [], "publishedRefs": []
    },
    {
        "type": "authoringmetric", "requestId": "0ba68a19-6243-4f54-835c-a795a5b83e9b",
        "timestamp": "2026-04-10T07:44:18.134Z", "responseStatusCode": 200,
        "requestCall": "POST /workflow/instance/task/nextStepAssignment",
        "resourceCall": "POST /workflow/instance/task/nextStepAssignment",
        "requestQueryString": "objRef=02a2-2004b0d44355-f548da67dbba-1000",
        "requestQueryParameters": { "objRef": ["02a2-2004b0d44355-f548da67dbba-1000"] },
        "serviceId": "workflow", "userName": "Aureliano", "userId": "62038d84-f161-3579-a5f1-7aba053f999a",
        "indexRetry": 0, "durationMs": 335,
        "involvedRefs": ["02a2-2004b0d44355-f548da67dbba-1000"], "externalRefs": [],
        "types": ["article"], "workflows": ["Story/Ready"], "workFolderPaths": ["/Convergent/News"]
    },
    {
        "type": "authoringmetric", "requestId": "6bbf3e70-7f09-4b1f-a58c-98800a066e60",
        "timestamp": "2026-04-10T07:44:13.466Z", "responseStatusCode": 200,
        "requestCall": "POST /workflow/instance/task/nextStepAssignment",
        "resourceCall": "POST /workflow/instance/task/nextStepAssignment",
        "requestQueryString": "objRef=02a2-2004b0d44355-f548da67dbba-1000",
        "requestQueryParameters": { "objRef": ["02a2-2004b0d44355-f548da67dbba-1000"] },
        "serviceId": "workflow", "userName": "Aureliano", "userId": "62038d84-f161-3579-a5f1-7aba053f999a",
        "indexRetry": 0, "durationMs": 1201,
        "involvedRefs": ["02a2-2004b0d44355-f548da67dbba-1000"], "externalRefs": [],
        "types": ["article"], "workflows": ["Story/Edit"], "workFolderPaths": ["/Convergent/News"]
    },
    {
        "type": "authoringmetric", "requestId": "7a333ca5-4817-4d3f-9e9a-886ef4a16265",
        "timestamp": "2026-04-10T07:44:03.620Z", "responseStatusCode": 200,
        "requestCall": "PUT /contents/story/02a2-2004b0d44355-f548da67dbba-1000", "resourceCall": "PUT /contents/story/{id}",
        "requestQueryString": "saveMode=MAJOR_CHECKIN&keepCheckedout=true",
        "requestQueryParameters": { "saveMode": ["MAJOR_CHECKIN"], "keepCheckedout": ["true"] },
        "serviceId": "contents", "userName": "Aureliano", "userId": "62038d84-f161-3579-a5f1-7aba053f999a",
        "indexRetry": 0, "durationMs": 1605,
        "involvedRefs": ["02a2-2004b0d44355-f548da67dbba-1000"], "externalRefs": [],
        "types": ["article"], "workflows": ["Story/Created"], "workFolderPaths": ["/Convergent/News"]
    },
    {
        "type": "authoringmetric", "requestId": "3a09fb9f-5233-40a1-8500-c2fdab01c205",
        "timestamp": "2026-04-10T07:43:35.790Z", "responseStatusCode": 200,
        "requestCall": "PUT /contents/nodes/lock", "resourceCall": "PUT /contents/nodes/lock",
        "requestQueryParameters": {}, "serviceId": "contents",
        "userName": "Aureliano", "userId": "62038d84-f161-3579-a5f1-7aba053f999a",
        "indexRetry": 0, "durationMs": 336,
        "involvedRefs": ["02a2-2004b0d44355-f548da67dbba-1000"], "externalRefs": [],
        "types": ["article"], "workflows": ["Story/Created"], "workFolderPaths": ["/Convergent/News"]
    },
    {
        "type": "promotemetric", "requestId": "d3172f9d-8076-48f6-951d-6e84f2b98500",
        "timestamp": "2026-03-02T12:14:43.268Z", "responseStatusCode": 200,
        "requestCall": "DELETE /contents/nodes/02a2-2004b0d44355-f548da67dbba-1000/promote/PREVIEW",
        "resourceCall": "DELETE /contents/nodes/{id}/promote/{viewStatus}",
        "requestQueryParameters": {}, "serviceId": "contents",
        "userName": "Gita", "userId": "f52f7b97-277f-34b7-9d30-3fdf19d73aa9",
        "siteName": ["TheGlobe", "SportsArena"],
        "indexRetry": 0, "durationMs": 106,
        "involvedRefs": ["02a2-2004b0d44355-f548da67dbba-1000"],
        "removedRefs": ["02a2-2004b0d44355-f548da67dbba-1000"], "updatedRefs": [], "publishedRefs": []
    },
    {
        "type": "authoringmetric", "requestId": "c89d627d-64b8-46bb-9f07-a16410303e7c",
        "timestamp": "2026-02-26T14:19:46.246Z", "responseStatusCode": 200,
        "requestCall": "POST /contents/story", "resourceCall": "POST /contents/story",
        "requestQueryParameters": {}, "serviceId": "contents",
        "userName": "Gita", "userId": "f52f7b97-277f-34b7-9d30-3fdf19d73aa9",
        "indexRetry": 0, "durationMs": 2768,
        "involvedRefs": ["02a2-2004b0d44355-f548da67dbba-1000"], "externalRefs": [],
        "types": ["article"], "workFolderPaths": ["/Convergent/News"]
    }
];

// ===== NEON CONFIG SERVICE =====
// Wrapper around GET /neon/config/:type.
// Falls back silently — callers always get a valid (possibly empty) object.
// Replace the mock block with a real fetch once the config API is reachable from the panel.

const NeonConfig = (() => {
    // ── Mock data ──────────────────────────────────────────────────────────────
    // Matches the shape returned by GET /neon/config/usersGroups and
    // GET /neon/config/workflows from neon-config-connector.js.
    // TODO: remove mock and enable the real fetch below when the API is available.
    const MOCK_USERS_GROUPS = {
        users: [
            { id: '62038d84-f161-3579-a5f1-7aba053f999a', name: 'Aureliano', displayName: 'Aureliano Ventrella', profilePicUrl: null },
            { id: 'f52f7b97-277f-34b7-9d30-3fdf19d73aa9', name: 'Gita',      displayName: 'Gita Nathania',       profilePicUrl: null }
        ],
        groups: []
    };

    const MOCK_WORKFLOWS = {
        workflows: [
            { name: 'Story/Created',        color: '#ffd670' },
            { name: 'Story/Imported',       color: '#83c5be' },
            { name: 'Story/Revision',       color: '#ff70a6' },
            { name: 'Story/AutoRevision',   color: '#006d77' },
            { name: 'Story/Edit',           color: '#ff9770' },
            { name: 'Story/Ready',          color: '#70d6ff' },
            { name: 'Story/Archived',       color: '#6B7280' }
        ]
    };

    // ── In-memory cache ────────────────────────────────────────────────────────
    const _cache = {};

    async function _fetchConfig(type) {
        if (_cache[type]) return _cache[type];

        // ── Real fetch (disabled until API is accessible from panel context) ──
        // Uncomment and remove mock returns below when ready.
        //
        // try {
        //     const data = await PanelAPI.apiCallJson(`/neon/config/${type}`);
        //     _cache[type] = data?.data || data || {};
        //     return _cache[type];
        // } catch (err) {
        //     console.warn(`[NeonConfig] Could not load config '${type}':`, err.message);
        //     _cache[type] = {};
        //     return _cache[type];
        // }

        // ── Mock path ─────────────────────────────────────────────────────────
        if (type === 'usersGroups') _cache[type] = MOCK_USERS_GROUPS;
        else if (type === 'workflows') _cache[type] = MOCK_WORKFLOWS;
        else _cache[type] = {};
        return _cache[type];
    }

    // ── Public helpers ─────────────────────────────────────────────────────────

    /**
     * Pre-warm both configs. Called once at init so rendering is synchronous.
     */
    async function init() {
        await Promise.all([_fetchConfig('usersGroups'), _fetchConfig('workflows')]);
    }

    /**
     * Resolve a user by userId or userName.
     * Returns { displayName, profilePicUrl } or null if not found.
     */
    function getUser(userId, userName) {
        const users = _cache.usersGroups?.users || [];
        const match = users.find(u => u.id === userId) ||
                      users.find(u => u.name === userName || u.displayName === userName);
        return match || null;
    }

    /**
     * Get the configured color for a workflow name, or null if not configured.
     */
    function getWorkflowColor(workflowName) {
        const workflows = _cache.workflows?.workflows || [];
        const match = workflows.find(w => w.name === workflowName);
        return match?.color || null;
    }

    return { init, getUser, getWorkflowColor };
})();

// ===== EVENT LABEL MAP =====
// icon: Font Awesome 6 Free class string (fa-solid or fa-regular)
const EVENT_LABELS = {
    'POST /contents/story':                                   { label: 'Created',               icon: 'fa-solid fa-file-circle-plus', color: '#7c3aed' },
    'PUT /contents/nodes/lock':                               { label: 'Locked',                icon: 'fa-solid fa-lock',             color: '#6B7280' },
    'PUT /contents/nodes/unlock':                             { label: 'Unlocked',              icon: 'fa-solid fa-lock-open',        color: '#6B7280' },
    'PUT /contents/story/{id}':                               { label: 'Saved',                 icon: 'fa-solid fa-floppy-disk',      color: '#2847E2' },
    'POST /contents/story/{id}/contentitem/{contentItemId}':  { label: 'Changed from Site',     icon: 'fa-solid fa-edit',             color: '#2847E2' },
    'PUT /publication/publish/{id}':                          { label: 'Published',             icon: 'fa-solid fa-rocket',           color: '#16a34a' },
    'POST /contents/nodes/{id}/promote/{viewStatus}':         { label: 'Published',             icon: 'fa-solid fa-tower-broadcast',  color: '#16a34a' },
    'POST /contents/nodes/{id}/livepromote':                  { label: 'Published LIVE',        icon: 'fa-solid fa-tower-broadcast',  color: '#16a34a' },
    'DELETE /contents/nodes/{id}/promote/{viewStatus}':       { label: 'Unpublished from',      icon: 'fa-solid fa-circle-xmark',     color: '#6B7280' },
    'POST /workflow/instance/task/nextStepAssignment':        { label: 'Workflow change',       icon: 'fa-solid fa-code-branch',      color: '#0891b2' },
    '/psn/<notify>/test':                                     { label: 'Notification sent',     icon: 'fa-solid fa-satellite-dish',   color: '#d97706' },
    'POST /contents/rooms/{roomId}/story':                    { label: 'Collaboration saved',   icon: 'fa-solid fa-users',            color: '#7c3aed' },
    'POST /contents/rooms/{roomId}/join/{participantId}':     { label: 'Collaborator joined',   icon: 'fa-solid fa-user-plus',        color: '#0891b2' },
    'DELETE /contents/rooms/{roomId}/join/{participantId}':   { label: 'Collaborator left',     icon: 'fa-solid fa-user-minus',       color: '#6B7280' },
};

/**
 * Extract the viewStatus from requestCall for promote/unpublish events.
 * e.g. "POST /contents/nodes/02a2-.../promote/LIVE" -> "LIVE"
 */
function extractViewStatus(requestCall) {
    if (!requestCall) return null;
    const match = requestCall.match(/\/promote\/([A-Z_]+)$/);
    return match ? match[1] : null;
}

function getEventMeta(item) {
    const base = EVENT_LABELS[item.resourceCall];
    if (!base) return { label: item.resourceCall || 'Unknown', icon: 'fa-solid fa-gear', color: '#9ca3af' };

    // Append viewStatus for promote/unpublish events
    if (
        item.resourceCall === 'POST /contents/nodes/{id}/promote/{viewStatus}' ||
        item.resourceCall === 'DELETE /contents/nodes/{id}/promote/{viewStatus}'
    ) {
        const vs = extractViewStatus(item.requestCall);
        return vs ? { ...base, label: `${base.label} ${vs}` } : base;
    }

    return base;
}

// ===== FILTER CONFIG =====
// Maps each resourceCall to a filter category key
const RESOURCE_CALL_CATEGORY = {
    'PUT /contents/nodes/lock':                               'lock',
    'PUT /contents/nodes/unlock':                             'lock',
    'PUT /contents/story/{id}':                               'save',
    'POST /contents/story':                                   'create',
    'PUT /publication/publish/{id}':                          'publish',
    'POST /contents/nodes/{id}/promote/{viewStatus}':         'publish',
    'POST /contents/nodes/{id}/livepromote':                  'publish',
    'DELETE /contents/nodes/{id}/promote/{viewStatus}':       'unpublish',
    'POST /workflow/instance/task/nextStepAssignment':        'workflow',
    '/psn/<notify>/test':                                     'notification',
    'POST /contents/rooms/{roomId}/story':                    'collaboration',
    'POST /contents/rooms/{roomId}/join/{participantId}':     'collaboration',
    'DELETE /contents/rooms/{roomId}/join/{participantId}':   'collaboration',
};

function getEventCategory(item) {
    return RESOURCE_CALL_CATEGORY[item.resourceCall] || 'other';
}

// ===== STATE =====
const IS_DEMO = new URLSearchParams(window.location.search).get('demo') === 'true';
const state = {
    familyRef: new URLSearchParams(window.location.search).get('familyRef') || null,
    view: 'standard',
    events: [],
    activeFilters: new Set(['lock', 'save', 'create', 'publish', 'unpublish', 'workflow', 'notification', 'collaboration', 'other'])
};

// ===== UTILITIES =====
function esc(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function hashColor(str) {
    if (!str) return '#9ca3af';
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) & 0xffffffff;
    const hue = Math.abs(h) % 360;
    return `hsl(${hue}, 55%, 45%)`;
}

function getInitials(name) {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0][0].toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatRelTime(iso) {
    if (!iso) return '';
    const diff = Date.now() - new Date(iso).getTime();
    const sec = Math.floor(diff / 1000);
    if (sec < 60) return 'just now';
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min} min ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr} hour${hr !== 1 ? 's' : ''} ago`;
    const days = Math.floor(hr / 24);
    if (days < 30) return `${days} day${days !== 1 ? 's' : ''} ago`;
    return null;
}

function formatAbsTime(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleString(undefined, {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
}

function formatDateLabel(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString(undefined, {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
}

// ===== RENDERING =====
function renderEventHtml(item) {
    const meta = getEventMeta(item);
    const ok = item.responseStatusCode >= 200 && item.responseStatusCode < 300;

    // Resolve actor from config; fall back to raw userName / serviceId
    const userInfo = NeonConfig.getUser(item.userId, item.userName);
    const actorName = userInfo?.displayName || item.userName || item.serviceId || 'System';
    const avatarColor = hashColor(actorName);
    const initials = getInitials(actorName);
    const profilePicUrl = userInfo?.profilePicUrl || null;

    const avatarHtml = profilePicUrl
        ? `<img class="famaud-avatar famaud-avatar-img" src="${esc(profilePicUrl)}" alt="${esc(actorName)}" loading="lazy">`
        : `<span class="famaud-avatar" style="background:${avatarColor}">${esc(initials)}</span>`;

    // Workflow badges: grey chip with a small colored dot
    const workflowBadges = (item.workflows || []).map(w => {
        const wfColor = NeonConfig.getWorkflowColor(w);
        const dotStyle = wfColor ? `style="background:${wfColor}"` : '';
        return `<span class="famaud-badge famaud-badge-workflow"><span class="famaud-badge-workflow-dot" ${dotStyle}></span>${esc(w)}</span>`;
    }).join('');

    let advancedHtml = '';
    if (state.view === 'advanced') {
        const sites = (item.siteName || []).map(s =>
            `<span class="famaud-badge famaud-badge-site">${esc(s)}</span>`
        ).join('');
        const refs = (item.involvedRefs || []).filter(Boolean).map(r =>
            `<code class="famaud-ref">${esc(r)}</code>`
        ).join('');

        advancedHtml = `
        <div class="famaud-advanced">
            <code class="famaud-code">${esc(item.resourceCall)}</code>
            ${item.requestQueryString ? `<code class="famaud-code famaud-code-dim">${esc(item.requestQueryString)}</code>` : ''}
            <span class="famaud-meta-row">requestId: ${esc(item.requestId)}</span>
            <span class="famaud-meta-row">${esc(item.serviceId || '')}${item.localHostName ? ' · ' + esc(item.localHostName) : ''} · ${item.durationMs != null ? item.durationMs + 'ms' : ''}</span>
            ${refs}
            ${sites}
            ${item.deltaMsFromPublish != null ? `<span class="famaud-meta-row">+${item.deltaMsFromPublish}ms from publish</span>` : ''}
            ${item.indexRetry ? `<span class="famaud-meta-row">retry #${item.indexRetry}</span>` : ''}
        </div>`;
    }

    const chipsSites = state.view === 'advanced'
        ? (item.siteName || []).map(s => `<span class="famaud-badge famaud-badge-site">${esc(s)}</span>`).join('')
        : '';

    return `
    <div class="famaud-event${ok ? '' : ' famaud-event-err'}">
        <div class="famaud-dot" style="background:${meta.color}">
            <i class="famaud-dot-icon ${esc(meta.icon)}"></i>
        </div>
        <div class="famaud-card">
            <div class="famaud-card-inner">
                <div class="famaud-card-strip" style="background:${meta.color}"></div>
                <div class="famaud-card-header">
                    <div class="famaud-card-title-row">
                        <span class="famaud-label">${esc(meta.label)}</span>
                        ${!ok ? `<span class="famaud-badge famaud-badge-err">${item.responseStatusCode}</span>` : ''}
                    </div>
                    <span class="famaud-time-chip">
                        ${formatRelTime(item.timestamp) ? `<span class="famaud-time-rel">${esc(formatRelTime(item.timestamp))}</span>` : ''}
                        <span class="famaud-time-abs">${esc(formatAbsTime(item.timestamp))}</span>
                    </span>
                </div>
                <div class="famaud-card-actor">
                    ${workflowBadges}
                    <span class="famaud-card-actor-spacer"></span>
                    ${avatarHtml}
                    <span class="famaud-actor-name">${esc(actorName)}</span>
                </div>
                ${chipsSites ? `<div class="famaud-card-chips">${chipsSites}</div>` : ''}
                ${advancedHtml}
            </div>
        </div>
    </div>`;
}

function renderTimeline() {
    const content = document.getElementById('famaud-content');
    if (!state.events.length) {
        renderEmpty('No events found for this object.');
        return;
    }

    // Sort newest-first, then apply active filters
    const sorted = [...state.events]
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .filter(item => state.activeFilters.has(getEventCategory(item)));

    if (!sorted.length) {
        renderEmpty('No events match the current filters.');
        return;
    }

    // Group by date for separators
    let html = '<div class="famaud-timeline">';
    let lastDateKey = null;
    for (const item of sorted) {
        const dateKey = item.timestamp ? item.timestamp.slice(0, 10) : '';
        if (dateKey !== lastDateKey) {
            html += `<div class="famaud-date-sep">${esc(formatDateLabel(item.timestamp))}</div>`;
            lastDateKey = dateKey;
        }
        html += renderEventHtml(item);
    }
    html += '</div>';
    content.innerHTML = html;
}

function renderLoading() {
    document.getElementById('famaud-content').innerHTML = `
    <div class="famaud-state">
        <div class="famaud-spinner"></div>
        <div class="famaud-state-text">Loading audit events…</div>
    </div>`;
}

function renderEmpty(msg) {
    document.getElementById('famaud-content').innerHTML = `
    <div class="famaud-state">
        <div class="famaud-state-icon">📋</div>
        <div class="famaud-state-text">${esc(msg)}</div>
    </div>`;
}

function renderError(msg) {
    document.getElementById('famaud-content').innerHTML = `
    <div class="famaud-state">
        <div class="famaud-state-icon">⚠️</div>
        <div class="famaud-state-text">${esc(msg)}</div>
    </div>`;
}

// ===== DATA LOADING =====
async function loadEvents() {
    renderLoading();
    try {
        const data = await PanelAPI.apiCallJson(
            `/panels/family-audit/api/events?familyRef=${encodeURIComponent(state.familyRef)}`
        );
        // Neon family_audit may return: { results: [...] }, top-level array, or { items: [...] }
        let events = [];
        if (Array.isArray(data)) {
            events = data;
        } else if (Array.isArray(data.results)) {
            events = data.results.map(r => r.item || r);
        } else if (Array.isArray(data.items)) {
            events = data.items;
        }
        state.events = events;
        renderTimeline();
    } catch (err) {
        renderError('Failed to load audit events: ' + err.message);
    }
}

// ===== HEADER / VIEW TOGGLE =====
function initHeader() {
    document.querySelectorAll('.famaud-view-toggle').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.famaud-view-toggle').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.view = btn.dataset.view;
            if (state.events.length) renderTimeline();
        });
    });
}

// ===== FILTER BUTTONS =====
function initFilters() {
    document.querySelectorAll('.famaud-filter-btn[data-filter]').forEach(btn => {
        btn.addEventListener('click', () => {
            const key = btn.dataset.filter;
            if (state.activeFilters.has(key)) {
                state.activeFilters.delete(key);
                btn.classList.remove('active');
            } else {
                state.activeFilters.add(key);
                btn.classList.add('active');
            }
            renderTimeline();
        });
    });
}

// ===== POSTMESSAGE =====
function setupPostMessage() {
    window.addEventListener('message', (event) => {
        if (!event.data) return;
        if (event.data.key === 'getInfo') {
            const info = event.data.info;
            const ref = info?.originalNode?.familyRef || info?.familyRef;
            if (ref && ref !== state.familyRef) {
                state.familyRef = ref;
                loadEvents();
            }
        }
    });
    try {
        window.parent.postMessage({ type: 'panel-ready', info: { op: 'getInfo' } }, '*');
    } catch (_) {}
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', async () => {
    initHeader();
    initFilters();
    setupPostMessage();

    // Pre-warm config cache before first render so workflow colors and user
    // display names are available synchronously during renderEventHtml calls.
    await NeonConfig.init();

    if (IS_DEMO) {
        state.events = DEMO_EVENTS;
        renderTimeline();
    } else if (state.familyRef) {
        loadEvents();
    } else {
        renderEmpty('No object selected. Pass familyRef as query param or open inside Neon.');
    }
});
