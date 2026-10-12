function isEmbedded() {
  try { return window.self !== window.top; } catch { return true; }
}

const BASE_URL = isEmbedded() ? '/neon/api/demo-integration' : '';
const apiKey = () => window.CONFIG?.apiKey ?? '';
const url = (path) => `${BASE_URL}/api/neon/taxonomy-builder/${path}${window.CONFIG?.demo ? '?demo=true' : ''}`;

async function request(method, path, body) {
  const headers = { apikey: apiKey() };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(url(path), { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  return { status: response.status, data };
}

const jobPath = (jobId, suffix = '') => `jobs/${encodeURIComponent(jobId)}${suffix}`;

export const previewTaxonomy = (body) => request('POST', 'preview', body);
export const startJob = (body) => request('POST', 'jobs', body);
export const listJobs = () => request('GET', 'jobs');
export const getJob = (jobId) => request('GET', jobPath(jobId));
export const cancelJob = (jobId) => request('POST', jobPath(jobId, '/cancel'), {});

export async function downloadReport(jobId) {
  const response = await fetch(url(jobPath(jobId, '/report')), { headers: { apikey: apiKey() } });
  if (!response.ok) throw new Error(`Report download failed (HTTP ${response.status})`);
  const blob = await response.blob();
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = `${jobId}-report.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}
