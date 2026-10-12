import { useEffect, useRef, useState } from 'react';
import { previewTaxonomy, createTaxonomy } from './api.js';

const CATEGORY_PLACEHOLDER = 'GruppoBello\n  Livello 1\n    Livello 2';
const TAG_PLACEHOLDER = 'Nuova Famiglia\n  Nuovo Tag';
const LABEL = { new: 'New', exists: 'Exists', created: 'Created', failed: 'Failed', skipped: 'Skipped' };

function insertTab(e, value, setValue) {
  if (e.key !== 'Tab') return;
  e.preventDefault();
  const el = e.target;
  const { selectionStart: start, selectionEnd: end } = el;
  setValue(`${value.slice(0, start)}  ${value.slice(end)}`);
  requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = start + 2; });
}

function Tree({ items, statusKey = 'status' }) {
  return (
    <ul className="tbw-tree">
      {items.map((i) => (
        <li key={`${i.kind}:${i.path}`} style={{ paddingLeft: `${(i.depth - 1) * 20}px` }}>
          <span className={`tbw-badge tbw-${i[statusKey]}`}>{LABEL[i[statusKey]] || i[statusKey]}</span>{' '}
          <span className={i.kind === 'family' ? 'tbw-family' : ''}>{i.name}</span>
          {(i.ref || i.id) && <code className="tbw-muted"> {i.ref || i.id}</code>}
          {i.error && <span className="tbw-error"> {i.error}</span>}
        </li>
      ))}
    </ul>
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
  const [creating, setCreating] = useState(false);
  const [report, setReport] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const requestSeq = useRef(0);

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
        if (status === 200 && data && Array.isArray(data.categories)) { setPreview(data); setPreviewError(null); }
        else { setPreview(null); setPreviewError(data?.error || (data?.errors || []).join('; ') || `Preview failed (HTTP ${status})`); }
      } catch (e) {
        if (seq === requestSeq.current) { setPreview(null); setPreviewError(e.message); }
      } finally {
        if (seq === requestSeq.current) setLoading(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [categories, tags, defaultLanguage, refreshKey]);

  const errors = preview?.errors || [];
  const toCreate = preview?.toCreate || 0;
  const canCreate = !!preview && errors.length === 0 && toCreate > 0 && !loading && !creating;

  async function onCreate() {
    if (!canCreate) return;
    if (!window.confirm(`Create ${toCreate} items in ${envLabel}?`)) return;
    setCreating(true);
    setReport(null);
    try {
      const { status, data } = await createTaxonomy({ categories, tags, defaultLanguage: defaultLanguage.trim() || undefined });
      if (data && data.counts && Array.isArray(data.categories) && Array.isArray(data.tags)) {
        setReport(data);
        if (data.counts.created > 0) setRefreshKey((k) => k + 1);
      } else {
        setReport({ errors: data?.errors || [data?.error || data?.message || `Create failed (HTTP ${status}). Check Neon before retrying: some items may have been created.`] });
      }
    } catch (e) {
      setReport({ errors: [e.message] });
    } finally {
      setCreating(false);
    }
  }

  const clearReport = (setter) => (e) => { setter(e.target.value); setReport(null); };

  return (
    <div className="tbw">
      <header className="tbw-header">
        <h1>Taxonomy Builder</h1>
        <span className="tbw-env">Environment: <strong>{envLabel}</strong></span>
      </header>
      <div className="tbw-body">
        <section className="tbw-form">
          <label className="tbw-label" htmlFor="tbw-categories">Categories (top level = family, indent to nest)</label>
          <textarea id="tbw-categories" className="tbw-outline" value={categories} placeholder={CATEGORY_PLACEHOLDER} spellCheck={false}
            onChange={clearReport(setCategories)} onKeyDown={(e) => insertTab(e, categories, setCategories)} />
          <label className="tbw-label" htmlFor="tbw-tags">Tags (top level = family, indented once = tag)</label>
          <textarea id="tbw-tags" className="tbw-outline" value={tags} placeholder={TAG_PLACEHOLDER} spellCheck={false}
            onChange={clearReport(setTags)} onKeyDown={(e) => insertTab(e, tags, setTags)} />
          <label className="tbw-label" htmlFor="tbw-lang">Default language (new category families)</label>
          <input id="tbw-lang" className="tbw-input" value={defaultLanguage} onChange={clearReport(setDefaultLanguage)} />
          <button type="button" className="tbw-button" disabled={!canCreate} onClick={onCreate}>
            {creating ? 'Creating…' : `Create ${toCreate} item${toCreate === 1 ? '' : 's'}`}
          </button>
        </section>
        <section className="tbw-preview" aria-live="polite">
          <h2>Preview {loading && <span className="tbw-muted">updating…</span>}</h2>
          {previewError && <p className="tbw-error">{previewError}</p>}
          {!preview && !previewError && <p className="tbw-muted">Type categories or tags to see the preview.</p>}
          {preview && (
            <>
              {errors.length > 0 && <ul className="tbw-errors">{errors.map((err) => <li key={err}>{err}</li>)}</ul>}
              <p className="tbw-muted">{toCreate} to create</p>
              {preview.categories.length > 0 && (<><h3>Categories</h3><Tree items={preview.categories} /></>)}
              {preview.tags.length > 0 && (<><h3>Tags</h3><Tree items={preview.tags} /></>)}
            </>
          )}
          {report && (
            <div className="tbw-report">
              <h2>Result</h2>
              {report.errors ? (
                <ul className="tbw-errors">{report.errors.map((err) => <li key={err}>{err}</li>)}</ul>
              ) : (
                <>
                  <p className="tbw-muted">{report.counts.created} created · {report.counts.exists} existing · {report.counts.failed} failed · {report.counts.skipped} skipped</p>
                  {report.categories.length > 0 && (<><h3>Categories</h3><Tree items={report.categories} /></>)}
                  {report.tags.length > 0 && (<><h3>Tags</h3><Tree items={report.tags} /></>)}
                </>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
