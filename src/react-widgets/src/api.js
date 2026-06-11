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
  const demo = window.CONFIG?.demo;
  const url = demo ? '/api/neon/grid/articles?demo=true' : '/api/neon/grid/articles';
  return apiFetch(url);
}

export function fetchStories() {
  const demo = window.CONFIG?.demo;
  const url = demo ? '/api/print-query-board/stories?demo=true' : '/api/print-query-board/stories';
  return apiFetch(url);
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
