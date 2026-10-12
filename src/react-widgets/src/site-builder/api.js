function isEmbedded() {
  try { return window.self !== window.top; } catch { return true; }
}

const BASE_URL = isEmbedded() ? '/neon/api/demo-integration' : '';

async function post(path, body) {
  const demo = window.CONFIG?.demo ? '?demo=true' : '';
  const response = await fetch(`${BASE_URL}/api/neon/site-builder/${path}${demo}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: window.CONFIG?.apiKey ?? '' },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  return { status: response.status, data };
}

export const previewSite = (title, outline) => post('preview', { title, outline });
export const createSite = (title, outline) => post('create', { title, outline });
