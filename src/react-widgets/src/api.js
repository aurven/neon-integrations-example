// Widgets run as iframes inside Neon. When embedded, API calls must be
// proxied through the parent app's prefix; standalone, paths stay root-relative.
function isEmbedded() {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

const BASE_URL = isEmbedded() ? '/neon/api/demo-integration' : '';

async function apiFetch(path) {
  const apiKey = window.CONFIG?.apiKey ?? '';
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: { apikey: apiKey }
  });
  if (!response.ok) {
    throw new Error(`API error ${response.status}: ${path}`);
  }
  return response.json();
}

export function fetchArticles() {
  const demo = window.CONFIG?.demo;
  const config = window.CONFIG?.gridConfigName;
  const query = window.CONFIG?.queryConfigName;
  const params = new URLSearchParams();
  if (demo) params.set('demo', 'true');
  if (config) params.set('config', config);
  if (query) params.set('query', query);
  const qs = params.toString();
  return apiFetch(`/api/neon/grid/articles${qs ? `?${qs}` : ''}`);
}

export function fetchStories() {
  const demo = window.CONFIG?.demo;
  const query = window.CONFIG?.queryConfigName;
  const params = new URLSearchParams();
  if (demo) params.set('demo', 'true');
  if (query) params.set('query', query);
  const qs = params.toString();
  return apiFetch(`/api/print-query-board/stories${qs ? `?${qs}` : ''}`);
}

export function fetchWorkfolders() {
  const config = window.CONFIG?.gridConfigName;
  const params = config ? `?config=${encodeURIComponent(config)}` : '';
  return apiFetch(`/api/neon/grid/workfolders${params}`);
}

export async function duplicateArticle(familyRef, { workFolder, name, type }) {
  const apiKey = window.CONFIG?.apiKey ?? '';
  const response = await fetch(`${BASE_URL}/api/neon/grid/duplicate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: apiKey },
    body: JSON.stringify({ familyRef, workFolder, name, type })
  });
  if (!response.ok) {
    throw new Error(`API error ${response.status}: /api/neon/grid/duplicate`);
  }
  return response.json();
}

export async function updateMetadata(familyRef, changes) {
  const apiKey = window.CONFIG?.apiKey ?? '';
  const response = await fetch(`${BASE_URL}/utilities/metadata/update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: apiKey },
    body: JSON.stringify({ familyRef, changes })
  });
  if (!response.ok) {
    throw new Error(`API error ${response.status}: /utilities/metadata/update`);
  }
  return response.json();
}
