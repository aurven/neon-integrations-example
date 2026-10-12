import { useEffect, useRef, useState } from 'react';
import { previewSite, createSite } from './api.js';

const PLACEHOLDER = 'Prima Sezione\n  Prima Sottosezione\nSeconda Sezione';
const STATUS_LABEL = { created: 'Created', failed: 'Failed', skipped: 'Skipped' };

export default function SiteBuilderWidget() {
  const envLabel = window.CONFIG?.neonEnv?.label || window.CONFIG?.neonEnv?.id || 'current environment';
  const [title, setTitle] = useState('');
  const [outline, setOutline] = useState('');
  const [preview, setPreview] = useState(null);
  const [previewError, setPreviewError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [report, setReport] = useState(null);
  const requestSeq = useRef(0);

  useEffect(() => {
    if (!title.trim()) { requestSeq.current += 1; setLoading(false); setPreview(null); setPreviewError(null); return undefined; }
    const seq = ++requestSeq.current;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const { status, data } = await previewSite(title, outline);
        if (seq !== requestSeq.current) return;
        if (status === 200) { setPreview(data); setPreviewError(null); }
        else { setPreview(null); setPreviewError(data.error || (data.errors || []).join('; ') || `Preview failed (${status})`); }
      } catch (e) {
        if (seq === requestSeq.current) { setPreview(null); setPreviewError(e.message); }
      } finally {
        if (seq === requestSeq.current) setLoading(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [title, outline]);

  function onOutlineKeyDown(e) {
    if (e.key !== 'Tab') return;
    e.preventDefault();
    const el = e.target;
    const { selectionStart: start, selectionEnd: end } = el;
    const next = `${outline.slice(0, start)}  ${outline.slice(end)}`;
    setOutline(next);
    requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = start + 2; });
  }

  const errors = preview?.errors || [];
  const canCreate = !!title.trim() && !!preview && errors.length === 0 && !loading && !creating;

  async function onCreate() {
    if (!canCreate) return;
    if (!window.confirm(`Create site "${preview.site.title}" in ${envLabel}?`)) return;
    setCreating(true);
    setReport(null);
    try {
      const { status, data } = await createSite(title, outline);
      if (status === 400) setReport({ errors: data.errors || [data.error] });
      else setReport(data);
    } catch (e) {
      setReport({ errors: [e.message] });
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="sbw">
      <header className="sbw-header">
        <h1>Site Builder</h1>
        <span className="sbw-env">Environment: <strong>{envLabel}</strong></span>
      </header>

      <div className="sbw-body">
        <section className="sbw-form">
          <label className="sbw-label" htmlFor="sbw-title">Site title</label>
          <input id="sbw-title" className="sbw-input" value={title} placeholder="Il Mio Nuovo Sito"
            onChange={(e) => { setTitle(e.target.value); setReport(null); }} />

          <label className="sbw-label" htmlFor="sbw-outline">Sections (one per line, indent to nest)</label>
          <textarea id="sbw-outline" className="sbw-outline" value={outline} placeholder={PLACEHOLDER} spellCheck={false}
            onChange={(e) => { setOutline(e.target.value); setReport(null); }} onKeyDown={onOutlineKeyDown} />

          <button type="button" className="sbw-button" disabled={!canCreate} onClick={onCreate}>
            {creating ? 'Creating…' : 'Create site'}
          </button>
        </section>

        <section className="sbw-preview" aria-live="polite">
          <h2>Preview {loading && <span className="sbw-muted">updating…</span>}</h2>
          {previewError && <p className="sbw-error">{previewError}</p>}
          {!preview && !previewError && <p className="sbw-muted">Type a site title to see the preview.</p>}
          {preview && (
            <>
              <dl className="sbw-site">
                <dt>Name</dt><dd><code>{preview.site.name || '—'}</code></dd>
                <dt>Live hostname</dt><dd><code>{preview.site.liveHostname || '—'}</code></dd>
              </dl>
              {errors.length > 0 && (
                <ul className="sbw-errors">{errors.map((err) => <li key={err}>{err}</li>)}</ul>
              )}
              <ul className="sbw-tree">
                {preview.sections.map((s) => (
                  <li key={s.path} style={{ paddingLeft: `${(s.depth - 1) * 20}px` }}>
                    <span className="sbw-node-title">{s.title}</span> <code className="sbw-muted">{s.path}</code>
                  </li>
                ))}
              </ul>
            </>
          )}

          {report && (
            <div className="sbw-report">
              <h2>Result</h2>
              {report.errors ? (
                <ul className="sbw-errors">{report.errors.map((err) => <li key={err}>{err}</li>)}</ul>
              ) : (
                <>
                  <p>
                    Site <code>{report.site.name}</code>: <span className={`sbw-badge sbw-${report.site.status}`}>{STATUS_LABEL[report.site.status] || report.site.status}</span>
                    {report.site.id && <> — id <code>{report.site.id}</code></>}
                    {report.site.error && <span className="sbw-error"> {report.site.error}</span>}
                  </p>
                  <p className="sbw-muted">{report.counts.created} created · {report.counts.failed} failed · {report.counts.skipped} skipped</p>
                  <ul className="sbw-tree">
                    {report.sections.map((s) => (
                      <li key={s.path} style={{ paddingLeft: `${(s.depth - 1) * 20}px` }}>
                        <span className={`sbw-badge sbw-${s.status}`}>{STATUS_LABEL[s.status]}</span> {s.title} <code className="sbw-muted">{s.path}</code>
                        {s.error && <span className="sbw-error"> {s.error}</span>}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
