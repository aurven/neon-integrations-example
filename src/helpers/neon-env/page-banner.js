'use strict';
function bannerScript(env) {
  const info = env ? { id: env.id, label: env.label, boHost: env.neon.bo.host } : null;
  const json = JSON.stringify(info).replace(/</g, '\\u003c');
  return `<script>(function(){var e=${json};window.__NEON_ENV__=e;console.log('[neon-env]', e);})();</script>`;
}
function injectBanner(html, env) {
  const m = html.match(/<head[^>]*>/i);
  if (!m) return html;
  const at = m.index + m[0].length;
  return html.slice(0, at) + bannerScript(env) + html.slice(at);
}
module.exports = { bannerScript, injectBanner };
