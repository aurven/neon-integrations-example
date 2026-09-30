'use strict';
/**
 * Inline console banner + fetch logger injected into every HTML page.
 * Spec: docs/superpowers/specs/2026-09-30-multi-neon-env-design.md §3
 */

// Runs in the browser, before any other script. `e` = { id, label, boHost } | null.
const CLIENT_JS = `
var tag = '[neon-env]';
if (e) console.log('%c🟢 ' + tag + ' ' + e.id + ' (' + e.label + ') → bo: ' + e.boHost, 'background:#0a7d32;color:#fff;padding:2px 6px;border-radius:3px;font-weight:bold');
else console.log('%c⚪ ' + tag + ' no Neon environment resolved for this page', 'background:#666;color:#fff;padding:2px 6px;border-radius:3px');
if (!window.fetch || window.fetch.__neonEnvWrapped) return;
var orig = window.fetch;
var wrapped = function (input, init) {
  var method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
  var url = typeof input === 'string' ? input : (input && input.url) || String(input);
  var sameOrigin = true;
  try { sameOrigin = new URL(url, location.href).origin === location.origin; } catch (err) {}
  return orig.apply(this, arguments).then(function (res) {
    if (!sameOrigin) return res;
    var got = res && res.headers && res.headers.get('X-Neon-Env');
    if (!got) console.log(tag + ' (no env header) → ' + method + ' ' + url);
    else if (e && got !== e.id) console.error(tag + ' MISMATCH: page is ' + e.id + ' but ' + method + ' ' + url + ' answered from ' + got);
    else console.log(tag + ' ' + got + ' → ' + method + ' ' + url);
    return res;
  });
};
wrapped.__neonEnvWrapped = true;
window.fetch = wrapped;
`;

function bannerScript(env) {
  const info = env ? { id: env.id, label: env.label, boHost: env.neon.bo.host } : null;
  const json = JSON.stringify(info).replace(/</g, '\\u003c');
  return `<script>(function(){var e=${json};window.__NEON_ENV__=e;${CLIENT_JS}})();</script>`;
}

function injectBanner(html, env) {
  const m = html.match(/<head[^>]*>/i);
  if (!m) return html;
  const at = m.index + m[0].length;
  return html.slice(0, at) + bannerScript(env) + html.slice(at);
}

module.exports = { bannerScript, injectBanner };
