function isEmbedded() {
  try { return window.self !== window.top; } catch { return true; }
}

const BASE_URL = isEmbedded() ? '/neon/api/demo-integration' : '';

async function post(path, body) {
  const demo = window.CONFIG?.demo ? '?demo=true' : '';
  const response = await fetch(`${BASE_URL}/api/neon/taxonomy-builder/${path}${demo}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: window.CONFIG?.apiKey ?? '' },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  return { status: response.status, data };
}

export const previewTaxonomy = (body) => post('preview', body);
export const createTaxonomy = (body) => post('create', body);
