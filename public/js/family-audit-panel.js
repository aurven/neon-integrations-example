// ===== DEMO DATA =====
const DEMO_EVENTS = [
    {
        "type": "authoringmetric",
        "requestId": "6d40de14-4be8-409a-9b15-1ab3ec67e9f1",
        "timestamp": "2026-04-01T17:04:41.176Z",
        "responseStatusCode": 200,
        "requestCall": "PUT /contents/nodes/lock",
        "resourceCall": "PUT /contents/nodes/lock",
        "requestQueryParameters": {},
        "requestHostName": "neon-app-test-region-a.neon.test",
        "localHostName": "test-region-a-contents-67cd4d9864-ncszz",
        "serviceId": "contents",
        "userName": "Cristiano",
        "userId": "ac8820bb-5e38-3844-bdac-4f8e5a71f5c7",
        "indexRetry": 0,
        "durationMs": 115,
        "involvedRefs": ["02a3-20290d6820a4-d149a3a02a54-1000"],
        "externalRefs": [],
        "types": ["article"],
        "workflows": ["Story/Created"],
        "workFolderPaths": ["/Convergent/News"]
    },
    {
        "type": "authoringmetric",
        "requestId": "faa00434-3741-4cab-8b88-b2eaa31a12b5",
        "timestamp": "2026-04-01T17:04:50.527Z",
        "responseStatusCode": 200,
        "requestCall": "PUT /contents/story/02a3-20290d6820a4-d149a3a02a54-1000",
        "resourceCall": "PUT /contents/story/{id}",
        "requestQueryString": "saveMode=MAJOR_CHECKIN&keepCheckedout=true",
        "requestQueryParameters": { "saveMode": ["MAJOR_CHECKIN"], "keepCheckedout": ["true"] },
        "requestHostName": "neon-app-test-region-a.neon.test",
        "localHostName": "test-region-a-contents-67cd4d9864-ncszz",
        "serviceId": "contents",
        "userName": "Cristiano",
        "userId": "ac8820bb-5e38-3844-bdac-4f8e5a71f5c7",
        "indexRetry": 0,
        "durationMs": 503,
        "involvedRefs": ["02a3-20290d6820a4-d149a3a02a54-1000"],
        "externalRefs": [],
        "types": ["article"],
        "workflows": ["Story/Created"],
        "workFolderPaths": ["/Convergent/News"]
    },
    {
        "type": "authoringmetric",
        "requestId": "22d3efe0-1b4e-4d6e-aa92-3e7ccaa72df8",
        "timestamp": "2026-04-01T17:04:51.081Z",
        "responseStatusCode": 200,
        "requestCall": "PUT /contents/nodes/unlock",
        "resourceCall": "PUT /contents/nodes/unlock",
        "requestQueryString": "unlockMode=UNDO",
        "requestQueryParameters": { "unlockMode": ["UNDO"] },
        "requestHostName": "neon-app-test-region-a.neon.test",
        "localHostName": "test-region-a-contents-67cd4d9864-ncszz",
        "serviceId": "contents",
        "userName": "Cristiano",
        "userId": "ac8820bb-5e38-3844-bdac-4f8e5a71f5c7",
        "indexRetry": 0,
        "durationMs": 32,
        "involvedRefs": ["02a3-20290d6820a4-d149a3a02a54-1000"],
        "externalRefs": [],
        "types": ["article"],
        "workflows": ["Story/Created"],
        "workFolderPaths": ["/Convergent/News"]
    },
    {
        "type": "authoringmetric",
        "requestId": "b3f12a07-9c1e-4d88-a301-7e2b0f5c3a91",
        "timestamp": "2026-04-01T18:22:05.340Z",
        "responseStatusCode": 200,
        "requestCall": "PUT /contents/nodes/lock",
        "resourceCall": "PUT /contents/nodes/lock",
        "requestQueryParameters": {},
        "requestHostName": "neon-app-test-region-a.neon.test",
        "localHostName": "test-region-a-contents-67cd4d9864-ncszz",
        "serviceId": "contents",
        "userName": "Sofia",
        "userId": "f72c3d91-a4b7-4e50-9c2d-1f8e0a3b6d44",
        "indexRetry": 0,
        "durationMs": 98,
        "involvedRefs": ["02a3-20290d6820a4-d149a3a02a54-1000"],
        "externalRefs": [],
        "types": ["article"],
        "workflows": ["Story/Edit"],
        "workFolderPaths": ["/Convergent/News"]
    },
    {
        "type": "authoringmetric",
        "requestId": "c9e74b21-5f3a-4102-b8d7-2c3a1e7f9b05",
        "timestamp": "2026-04-01T18:22:48.912Z",
        "responseStatusCode": 200,
        "requestCall": "PUT /contents/story/02a3-20290d6820a4-d149a3a02a54-1000",
        "resourceCall": "PUT /contents/story/{id}",
        "requestQueryString": "saveMode=MAJOR_CHECKIN&keepCheckedout=true",
        "requestQueryParameters": { "saveMode": ["MAJOR_CHECKIN"], "keepCheckedout": ["true"] },
        "requestHostName": "neon-app-test-region-a.neon.test",
        "localHostName": "test-region-a-contents-67cd4d9864-ncszz",
        "serviceId": "contents",
        "userName": "Sofia",
        "userId": "f72c3d91-a4b7-4e50-9c2d-1f8e0a3b6d44",
        "indexRetry": 0,
        "durationMs": 441,
        "involvedRefs": ["02a3-20290d6820a4-d149a3a02a54-1000"],
        "externalRefs": [],
        "types": ["article"],
        "workflows": ["Story/Edit"],
        "workFolderPaths": ["/Convergent/News"]
    },
    {
        "type": "authoringmetric",
        "requestId": "d1a83c54-7b2e-4f60-95e1-3d4b2f8c0a17",
        "timestamp": "2026-04-01T18:23:01.205Z",
        "responseStatusCode": 200,
        "requestCall": "PUT /contents/nodes/unlock",
        "resourceCall": "PUT /contents/nodes/unlock",
        "requestQueryString": "unlockMode=UNDO",
        "requestQueryParameters": { "unlockMode": ["UNDO"] },
        "requestHostName": "neon-app-test-region-a.neon.test",
        "localHostName": "test-region-a-contents-67cd4d9864-ncszz",
        "serviceId": "contents",
        "userName": "Sofia",
        "userId": "f72c3d91-a4b7-4e50-9c2d-1f8e0a3b6d44",
        "indexRetry": 0,
        "durationMs": 28,
        "involvedRefs": ["02a3-20290d6820a4-d149a3a02a54-1000"],
        "externalRefs": [],
        "types": ["article"],
        "workflows": ["Story/Edit"],
        "workFolderPaths": ["/Convergent/News"]
    },
    {
        "type": "authoringmetric",
        "requestId": "e5c90271-1d4f-4a73-b6c8-4e5d3a9e1b28",
        "timestamp": "2026-04-01T18:23:04.667Z",
        "responseStatusCode": 200,
        "requestCall": "PUT /contents/story/02a3-20290d6820a4-d149a3a02a54-1000",
        "resourceCall": "PUT /contents/story/{id}",
        "requestQueryString": "saveMode=MAJOR_CHECKIN",
        "requestQueryParameters": { "saveMode": ["MAJOR_CHECKIN"] },
        "requestHostName": "neon-app-test-region-a.neon.test",
        "localHostName": "test-region-a-contents-67cd4d9864-ncszz",
        "serviceId": "contents",
        "userName": "Sofia",
        "userId": "f72c3d91-a4b7-4e50-9c2d-1f8e0a3b6d44",
        "indexRetry": 0,
        "durationMs": 388,
        "involvedRefs": ["02a3-20290d6820a4-d149a3a02a54-1000"],
        "externalRefs": [],
        "types": ["article"],
        "workflows": ["Story/Ready"],
        "workFolderPaths": ["/Convergent/News"]
    },
    {
        "type": "authoringmetric",
        "requestId": "a7d21b83-6c0e-4e95-8f3a-5f6e4b0d2c39",
        "timestamp": "2026-04-01T19:30:57.846Z",
        "responseStatusCode": 200,
        "requestCall": "PUT /contents/nodes/lock",
        "resourceCall": "PUT /contents/nodes/lock",
        "requestQueryParameters": {},
        "requestHostName": "neon-app-test-region-a.neon.test",
        "localHostName": "test-region-a-contents-67cd4d9864-wqmnb",
        "serviceId": "contents",
        "userName": "Marco",
        "userId": "3b9a0cf2-8e51-4b7c-a1f0-6c7d5e2f4b80",
        "indexRetry": 0,
        "durationMs": 87,
        "involvedRefs": ["02a3-20290d6820a4-d149a3a02a54-1000"],
        "externalRefs": [],
        "types": ["article"],
        "workflows": ["Story/Ready"],
        "workFolderPaths": ["/Convergent/News"]
    },
    {
        "type": "authoringmetric",
        "requestId": "b8e32c94-7d1f-4fa6-9041-6a7f5c1e3d40",
        "timestamp": "2026-04-01T19:31:08.193Z",
        "responseStatusCode": 200,
        "requestCall": "PUT /publication/publish/02a3-20290d6820a4-d149a3a02a54-1000",
        "resourceCall": "PUT /publication/publish/{id}",
        "requestQueryParameters": {},
        "requestHostName": "neon-app-test-region-a.neon.test",
        "localHostName": "test-region-a-publication-59bc7f8d74-rxkpl",
        "serviceId": "publication",
        "userName": "Marco",
        "userId": "3b9a0cf2-8e51-4b7c-a1f0-6c7d5e2f4b80",
        "indexRetry": 0,
        "durationMs": 1247,
        "involvedRefs": ["02a3-20290d6820a4-d149a3a02a54-1000"],
        "externalRefs": [],
        "types": ["article"],
        "workflows": ["Story/Ready"],
        "workFolderPaths": ["/Convergent/News"]
    },
    {
        "type": "authoringmetric",
        "requestId": "c9f43d05-8e20-4gb7-a152-7b8g6d2f4e51",
        "timestamp": "2026-04-01T19:31:09.441Z",
        "responseStatusCode": 200,
        "requestCall": "PUT /contents/nodes/unlock",
        "resourceCall": "PUT /contents/nodes/unlock",
        "requestQueryString": "unlockMode=UNDO",
        "requestQueryParameters": { "unlockMode": ["UNDO"] },
        "requestHostName": "neon-app-test-region-a.neon.test",
        "localHostName": "test-region-a-contents-67cd4d9864-wqmnb",
        "serviceId": "contents",
        "userName": "Marco",
        "userId": "3b9a0cf2-8e51-4b7c-a1f0-6c7d5e2f4b80",
        "indexRetry": 0,
        "durationMs": 24,
        "involvedRefs": ["02a3-20290d6820a4-d149a3a02a54-1000"],
        "externalRefs": [],
        "types": ["article"],
        "workflows": ["Story/Ready"],
        "workFolderPaths": ["/Convergent/News"]
    },
    {
        "type": "notificationpsn",
        "requestId": "d444ffbe-401e-4e2c-9ed6-361b343f159e",
        "timestamp": "2026-04-01T19:31:17.234Z",
        "responseStatusCode": 500,
        "resourceCall": "/psn/<notify>/test",
        "viewStatus": "LIVE",
        "localHostName": "eidos-psn-0",
        "serviceId": "psn",
        "siteName": ["TheGlobe"],
        "indexRetry": 0,
        "durationMs": 12,
        "wakeupId": "psn:eidos-psn-0_1775071875061",
        "involvedNodes": 1,
        "deltaMsFromPublish": 3082,
        "externalRefs": [null],
        "involvedRefs": ["02a3-20290d6820a4-d149a3a02a54-1000"]
    },
    {
        "type": "notificationpsn",
        "requestId": "266b0747-bc81-4dce-adb1-d03e20ca3238",
        "timestamp": "2026-04-01T19:36:12.532Z",
        "responseStatusCode": 500,
        "resourceCall": "/psn/<notify>/test",
        "viewStatus": "LIVE",
        "localHostName": "eidos-psn-0",
        "serviceId": "psn",
        "siteName": ["TheGlobe"],
        "indexRetry": 1,
        "durationMs": 0,
        "wakeupId": "psn:eidos-psn-0_1775072171601",
        "involvedNodes": 1,
        "deltaMsFromPublish": 305296,
        "externalRefs": [null],
        "involvedRefs": ["02a3-20290d6820a4-d149a3a02a54-1000"]
    },
    {
        "type": "notificationpsn",
        "requestId": "2a145535-3a5f-4c37-92ac-b8735e97b187",
        "timestamp": "2026-04-01T19:36:18.759Z",
        "responseStatusCode": 500,
        "resourceCall": "/psn/<notify>/test",
        "viewStatus": "LIVE",
        "localHostName": "eidos-psn-0",
        "serviceId": "psn",
        "siteName": ["NextFrontier"],
        "indexRetry": 1,
        "durationMs": 0,
        "wakeupId": "psn:eidos-psn-0_1775072178364",
        "involvedNodes": 1,
        "deltaMsFromPublish": 309613,
        "externalRefs": [null],
        "involvedRefs": ["02a3-20290d6820a4-d149a3a02a54-1000"]
    }
];

// ===== EVENT LABEL MAP =====
// icon: Font Awesome 6 Free class string (fa-solid or fa-regular)
const EVENT_LABELS = {
    'PUT /contents/nodes/lock':      { label: 'Locked',            icon: 'fa-solid fa-lock',           color: '#6B7280' },
    'PUT /contents/nodes/unlock':    { label: 'Unlocked',          icon: 'fa-solid fa-lock-open',      color: '#6B7280' },
    'PUT /contents/story/{id}':      { label: 'Saved',             icon: 'fa-solid fa-floppy-disk',    color: '#2847E2' },
    'PUT /publication/publish/{id}': { label: 'Published',         icon: 'fa-solid fa-rocket',         color: '#16a34a' },
    '/psn/<notify>/test':            { label: 'Notification sent', icon: 'fa-solid fa-satellite-dish', color: '#d97706' },
};

function getEventMeta(item) {
    if (item.resourceCall === 'PUT /contents/nodes/unlock') {
        const mode = (item.requestQueryParameters?.unlockMode || [])[0];
        if (mode === 'UNDO') {
            return { label: 'Unlocked (restored to last save)', icon: 'fa-solid fa-rotate-left', color: '#6B7280' };
        }
    }
    return EVENT_LABELS[item.resourceCall] || { label: item.resourceCall, icon: 'fa-solid fa-gear', color: '#9ca3af' };
}

// ===== STATE =====
const IS_DEMO = new URLSearchParams(window.location.search).get('demo') === 'true';
const state = {
    familyRef: new URLSearchParams(window.location.search).get('familyRef') || null,
    view: 'standard',
    events: []
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
    return formatAbsTime(iso);
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
    const actor = item.userName || item.serviceId || 'System';

    const workflowBadges = (item.workflows || []).map(w =>
        `<span class="famaud-badge famaud-badge-workflow">${esc(w)}</span>`
    ).join('');

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

    return `
    <div class="famaud-event${ok ? '' : ' famaud-event-err'}">
        <div class="famaud-dot" style="background:${meta.color}">
            <i class="famaud-dot-icon ${esc(meta.icon)}"></i>
        </div>
        <div class="famaud-body">
            <div class="famaud-top">
                <span class="famaud-label">${esc(meta.label)}</span>
                ${!ok ? `<span class="famaud-badge famaud-badge-err">${item.responseStatusCode}</span>` : ''}
                ${workflowBadges}
            </div>
            <div class="famaud-sub-line">
                <span class="famaud-actor">${esc(actor)}</span>
                <span class="famaud-sep">·</span>
                <span class="famaud-time" title="${esc(formatAbsTime(item.timestamp))}">${esc(formatRelTime(item.timestamp))}</span>
            </div>
            ${advancedHtml}
        </div>
    </div>`;
}

function renderTimeline() {
    const content = document.getElementById('famaud-content');
    if (!state.events.length) {
        renderEmpty('No events found for this object.');
        return;
    }

    // Sort newest-first
    const sorted = [...state.events].sort((a, b) =>
        new Date(b.timestamp) - new Date(a.timestamp)
    );

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
        // INTEGRATION POINT: proxied call to Neon metrics family_audit API
        // Replace with: const data = await PanelAPI.apiCallJson(`/panels/family-audit/api/events?familyRef=${encodeURIComponent(state.familyRef)}`);
        const data = await PanelAPI.apiCallJson(
            `/panels/family-audit/api/events?familyRef=${encodeURIComponent(state.familyRef)}`
        );
        state.events = (data.results || []).map(r => r.item || r);
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
document.addEventListener('DOMContentLoaded', () => {
    initHeader();
    setupPostMessage();

    if (IS_DEMO) {
        state.events = DEMO_EVENTS;
        renderTimeline();
    } else if (state.familyRef) {
        loadEvents();
    } else {
        renderEmpty('No object selected. Pass familyRef as query param or open inside Neon.');
    }
});
