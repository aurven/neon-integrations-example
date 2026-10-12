import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { previewTaxonomy, startJob, listJobs, getJob, cancelJob, downloadReport } from './api.js';

const CATEGORY_PLACEHOLDER = '# lines starting with # are ignored\nGruppoBello\n  Livello 1\n    Livello 2';
const TAG_PLACEHOLDER = 'Nuova Famiglia\n  Nuovo Tag';
const LABEL = { new: 'New', exists: 'Exists', created: 'Created', failed: 'Failed', skipped: 'Skipped', pending: 'Pending' };
const BIG_LINES = 2000;
const POLL_MS = 2000;
const ZERO = { created: 0, exists: 0, failed: 0, skipped: 0 };

function insertTab(e, value, setValue) {
  if (e.key !== 'Tab') return;
  e.preventDefault();
  const el = e.target;
  const { selectionStart: start, selectionEnd: end } = el;
  setValue(`${value.slice(0, start)}  ${value.slice(end)}`);
  requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = start + 2; });
}

function countLines(text) {
  if (!text) return 0;
  let n = 1;
  for (let i = 0; i < text.length; i += 1) if (text.charCodeAt(i) === 10) n += 1;
  return n;
}

const fmt = (n) => Number(n || 0).toLocaleString();

function elapsed(from, to) {
  if (!from) return '';
  const s = Math.max(0, Math.round(((to ? Date.parse(to) : Date.now()) - Date.parse(from)) / 1000));
  return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;
}

function countsLine(c) {
  return `${fmt(c.created)} created · ${fmt(c.exists)} existing · ${fmt(c.failed)} failed · ${fmt(c.skipped)} skipped`;
}

function Tree({ items }) {
  return (
    <ul className="tbw-tree">
      {items.map((i) => (
        <li key={`${i.kind}:${i.path}`} style={{ paddingLeft: `${(i.depth - 1) * 20}px` }}>
          <span className={`tbw-badge tbw-${i.status}`}>{LABEL[i.status] || i.status}</span>{' '}
          <span className={i.kind === 'family' ? 'tbw-family' : ''}>{i.name}</span>
        </li>
      ))}
    </ul>
  );
}

function OutlineField({ id, label, value, onChange, placeholder, disabled }) {
  const [fileName, setFileName] = useState(null);
  const [editing, setEditing] = useState(false);
  const fileRef = useRef(null);
  const lines = useMemo(() => countLines(value), [value]);
  const asChip = lines > BIG_LINES && !editing;

  function onFile(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { setFileName(file.name); setEditing(false); onChange(String(reader.result || '')); };
    reader.onerror = () => window.alert(`Could not read ${file.name}`);
    reader.readAsText(file, 'UTF-8');
  }

  function clear() { setFileName(null); setEditing(false); onChange(''); }

  return (
    <div className="tbw-field">
      <div className="tbw-field-head">
        <label className="tbw-label" htmlFor={id}>{label}</label>
        <button type="button" className="tbw-link" disabled={disabled} onClick={() => fileRef.current && fileRef.current.click()}>Load .txt file</button>
        <input ref={fileRef} type="file" accept=".txt,text/plain" hidden onChange={onFile} />
      </div>
      {asChip ? (
        <div className="tbw-chip" id={id}>
          {fmt(lines)} lines loaded{fileName ? ` from ${fileName}` : ''}
          {' · '}<button type="button" className="tbw-link" disabled={disabled} onClick={clear}>Clear</button>
          {' · '}<button type="button" className="tbw-link" disabled={disabled} onClick={() => setEditing(true)}>Edit</button>
        </div>
      ) : (
        <textarea id={id} className="tbw-outline" value={value} placeholder={placeholder} spellCheck={false} disabled={disabled}
          onChange={(e) => onChange(e.target.value)} onKeyDown={(e) => insertTab(e, value, onChange)} />
      )}
    </div>
  );
}

function ErrorList({ errors, errorCount }) {
  if (!errors || errors.length === 0) return null;
  const more = (errorCount || errors.length) - errors.length;
  return (
    <ul className="tbw-errors">
      {errors.map((err, i) => <li key={`${i}:${err}`}>{err}</li>)}
      {more > 0 && <li className="tbw-muted">…and {fmt(more)} more</li>}
    </ul>
  );
}

function SummaryPreview({ preview }) {
  return (
    <>
      <table className="tbw-levels">
        <thead><tr><th>Outline</th><th>Depth</th><th>Kind</th><th>Total</th><th>New</th><th>Exists</th></tr></thead>
        <tbody>
          {preview.levels.map((l) => (
            <tr key={`${l.outline}:${l.depth}`}>
              <td>{l.outline}</td><td>{l.depth}</td><td>{l.kind}</td><td>{fmt(l.total)}</td><td>{fmt(l.new)}</td><td>{fmt(l.exists)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="tbw-muted">{fmt(preview.total)} items. Showing the first {preview.sample.categories.length} categories and {preview.sample.tags.length} tags.</p>
      {preview.sample.categories.length > 0 && (<><h3>Categories (sample)</h3><Tree items={preview.sample.categories} /></>)}
      {preview.sample.tags.length > 0 && (<><h3>Tags (sample)</h3><Tree items={preview.sample.tags} /></>)}
    </>
  );
}

function JobPanel({ job, cancelling, onCancel, onClose }) {
  const [downloadError, setDownloadError] = useState(null);
  const pct = job.total ? Math.round((job.done / job.total) * 100) : 0;
  const running = job.state === 'running';
  async function onDownload() {
    setDownloadError(null);
    try { await downloadReport(job.jobId); } catch (e) { setDownloadError(e.message); }
  }
  return (
    <div className="tbw-job">
      <h2>Job <code>{job.jobId}</code> <span className={`tbw-badge tbw-${job.state}`}>{job.state}</span></h2>
      <div className="tbw-progress" role="progressbar" aria-valuemin={0} aria-valuemax={job.total} aria-valuenow={job.done}>
        <div style={{ width: `${pct}%` }} />
      </div>
      <p className="tbw-muted">
        {fmt(job.done)} / {fmt(job.total)} ({pct}%) · {countsLine(job.counts || ZERO)}
        {job.phase ? ` · ${job.phase}` : ''} · {elapsed(job.createdAt, job.finishedAt)}
      </p>
      {job.error && <p className="tbw-error">{job.error}</p>}
      {running ? (
        <button type="button" className="tbw-button tbw-secondary" disabled={cancelling} onClick={onCancel}>{cancelling ? 'Cancelling…' : 'Cancel'}</button>
      ) : (
        <>
          {job.failureCount > 0 && (
            <>
              <h3>Failures ({fmt(job.failureCount)})</h3>
              <ul className="tbw-failures">
                {(job.failures || []).map((f, i) => <li key={i}><code>{f.outline}</code> {f.path}: <span className="tbw-error">{f.error}</span></li>)}
              </ul>
              {job.failureCount > (job.failures || []).length && <p className="tbw-muted">…and {fmt(job.failureCount - (job.failures || []).length)} more in the full report</p>}
            </>
          )}
          <div className="tbw-actions">
            {job.state !== 'lost' && <button type="button" className="tbw-button" onClick={onDownload}>Download full report</button>}
            <button type="button" className="tbw-button tbw-secondary" onClick={onClose}>Close</button>
          </div>
          {downloadError && <p className="tbw-error">{downloadError}</p>}
        </>
      )}
    </div>
  );
}

function JobsList({ jobs, currentId, onOpen }) {
  if (!jobs.length) return null;
  return (
    <div className="tbw-jobs">
      <h3>Recent jobs</h3>
      <ul>
        {jobs.map((j) => (
          <li key={j.jobId}>
            <span className={`tbw-badge tbw-${j.state}`}>{j.state}</span>{' '}
            <code>{j.jobId}</code> <span className="tbw-muted">{j.envId} · {fmt(j.done)}/{fmt(j.total)} · {fmt(j.counts.failed)} failed · {new Date(j.createdAt).toLocaleString()}</span>{' '}
            {j.jobId !== currentId && <button type="button" className="tbw-link" onClick={() => onOpen(j.jobId)}>Open</button>}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function TaxonomyBuilderWidget() {
  const envLabel = window.CONFIG?.neonEnv?.label || window.CONFIG?.neonEnv?.id || 'current environment';
  const [categories, setCategories] = useState('');
  const [tags, setTags] = useState('');
  const [defaultLanguage, setDefaultLanguage] = useState('en-uk');
  const [preview, setPreview] = useState(null);
  const [previewError, setPreviewError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState(null);
  const [job, setJob] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  const [jobs, setJobs] = useState([]);
  const requestSeq = useRef(0);

  const refreshJobs = useCallback(async () => {
    try {
      const { status, data } = await listJobs();
      if (status === 200 && Array.isArray(data?.jobs)) setJobs(data.jobs);
    } catch { /* the list is informative only */ }
  }, []);

  useEffect(() => { refreshJobs(); }, [refreshJobs]);

  useEffect(() => {
    if (!categories.trim() && !tags.trim()) {
      requestSeq.current += 1;
      setLoading(false); setPreview(null); setPreviewError(null);
      return undefined;
    }
    const seq = ++requestSeq.current;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const { status, data } = await previewTaxonomy({ categories, tags, defaultLanguage: defaultLanguage.trim() || undefined });
        if (seq !== requestSeq.current) return;
        const ok = status === 200 && data && (data.mode === 'summary' ? Array.isArray(data.levels) : Array.isArray(data.categories));
        if (ok) { setPreview(data); setPreviewError(null); }
        else { setPreview(null); setPreviewError(data?.error || (data?.errors || []).join('; ') || `Preview failed (HTTP ${status})`); }
      } catch (e) {
        if (seq === requestSeq.current) { setPreview(null); setPreviewError(e.message); }
      } finally {
        if (seq === requestSeq.current) setLoading(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [categories, tags, defaultLanguage, refreshKey]);

  const jobId = job?.jobId;
  const jobRunning = job?.state === 'running';

  useEffect(() => {
    if (!jobId || !jobRunning) return undefined;
    let stopped = false;
    const timer = setInterval(async () => {
      try {
        const { status, data } = await getJob(jobId);
        if (stopped) return;
        if (status === 200 && data?.jobId === jobId) setJob(data);
        else if (status === 404) setJob((j) => (j && j.jobId === jobId ? { ...j, state: 'lost', error: 'Job not found (the server may have restarted). Re-run the outline: existing items are merged.' } : j));
      } catch { /* transient: next poll retries */ }
    }, POLL_MS);
    return () => { stopped = true; clearInterval(timer); };
  }, [jobId, jobRunning]);

  const wasRunning = useRef(false);
  useEffect(() => {
    if (wasRunning.current && !jobRunning) { setCancelling(false); refreshJobs(); setRefreshKey((k) => k + 1); }
    wasRunning.current = jobRunning;
  }, [jobRunning, refreshJobs]);

  useEffect(() => {
    if (!otherRunning) return undefined;
    const timer = setInterval(refreshJobs, 5000);
    return () => clearInterval(timer);
  }, [otherRunning, refreshJobs]);

  const errors = preview?.errors || [];
  const toCreate = preview?.toCreate || 0;
  const envId = window.CONFIG?.neonEnv?.id;
  const otherRunning = jobs.some((j) => j.state === 'running' && j.jobId !== jobId && (!envId || j.envId === envId));
  const busy = starting || jobRunning || otherRunning;
  const canCreate = !!preview && errors.length === 0 && toCreate > 0 && !loading && !busy;

  async function openJob(id) {
    setStartError(null);
    try {
      const { status, data } = await getJob(id);
      if (status === 200 && data?.jobId) setJob(data);
      else setStartError({ errors: [data?.error || `Could not open job (HTTP ${status})`] });
    } catch (e) { setStartError({ errors: [e.message] }); }
  }

  async function onCreate() {
    if (!canCreate) return;
    if (!window.confirm(`Create ${fmt(toCreate)} items in ${envLabel}? This runs as a background job.`)) return;
    setStarting(true);
    setStartError(null);
    try {
      const { status, data } = await startJob({ categories, tags, defaultLanguage: defaultLanguage.trim() || undefined });
      if (status === 202 && data?.jobId) {
        setJob({ jobId: data.jobId, state: 'running', total: data.total, done: 0, counts: ZERO, failures: [], failureCount: 0, createdAt: new Date().toISOString(), finishedAt: null, phase: null });
        refreshJobs();
      } else if (status === 409 && data?.jobId) {
        setStartError({ errors: [data.error], conflictJobId: data.jobId });
      } else {
        setStartError({ errors: data?.errors || [data?.error || `Start failed (HTTP ${status})`], errorCount: data?.errorCount });
        refreshJobs();
      }
    } catch (e) {
      setStartError({ errors: [e.message] });
    } finally {
      setStarting(false);
    }
  }

  async function onCancel() {
    if (!job || !window.confirm(`Cancel job ${job.jobId}? Items already created stay in Neon.`)) return;
    setCancelling(true);
    try {
      const { status, data } = await cancelJob(job.jobId);
      if (status === 200 && data?.jobId) setJob(data);
      else { setCancelling(false); if (status === 409) openJob(job.jobId); }
    } catch { setCancelling(false); }
  }

  return (
    <div className="tbw">
      <header className="tbw-header">
        <h1>Taxonomy Builder</h1>
        <span className="tbw-env">Environment: <strong>{envLabel}</strong></span>
      </header>
      <div className="tbw-body">
        <section className="tbw-form">
          <OutlineField id="tbw-categories" label="Categories (top level = family, indent to nest)" value={categories} onChange={(v) => { setCategories(v); setStartError(null); }} placeholder={CATEGORY_PLACEHOLDER} disabled={busy} />
          <OutlineField id="tbw-tags" label="Tags (top level = family, indented once = tag)" value={tags} onChange={(v) => { setTags(v); setStartError(null); }} placeholder={TAG_PLACEHOLDER} disabled={busy} />
          <label className="tbw-label" htmlFor="tbw-lang">Default language (new category families)</label>
          <input id="tbw-lang" className="tbw-input" disabled={busy} value={defaultLanguage} onChange={(e) => { setDefaultLanguage(e.target.value); setStartError(null); }} />
          <button type="button" className="tbw-button" disabled={!canCreate} onClick={onCreate}>
            {starting ? 'Starting…' : `Create ${fmt(toCreate)} item${toCreate === 1 ? '' : 's'}`}
          </button>
          {startError && (
            <div className="tbw-start-error">
              <ErrorList errors={startError.errors} errorCount={startError.errorCount} />
              {startError.conflictJobId && <button type="button" className="tbw-link" onClick={() => openJob(startError.conflictJobId)}>Open running job</button>}
            </div>
          )}
          <JobsList jobs={jobs} currentId={jobId} onOpen={openJob} />
        </section>
        <div className="tbw-right">
        {job && (
          <section className="tbw-preview">
            <JobPanel key={job.jobId} job={job} cancelling={cancelling} onCancel={onCancel} onClose={() => setJob(null)} />
          </section>
        )}
        <section className="tbw-preview" aria-live="polite">
          <h2>Preview {loading && <span className="tbw-muted">updating…</span>}</h2>
          {previewError && <p className="tbw-error">{previewError}</p>}
          {!preview && !previewError && <p className="tbw-muted">Type or load categories or tags to see the preview.</p>}
          {preview && (
            <>
              <ErrorList errors={errors} errorCount={preview.errorCount} />
              <p className="tbw-muted">{fmt(toCreate)} to create</p>
              {preview.mode === 'summary' ? <SummaryPreview preview={preview} /> : (
                <>
                  {preview.categories.length > 0 && (<><h3>Categories</h3><Tree items={preview.categories} /></>)}
                  {preview.tags.length > 0 && (<><h3>Tags</h3><Tree items={preview.tags} /></>)}
                </>
              )}
            </>
          )}
        </section>
        </div>
      </div>
    </div>
  );
}
