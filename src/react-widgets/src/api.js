const BASE_URL = '';

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
  return apiFetch('/api/neon/grid/articles');
}
