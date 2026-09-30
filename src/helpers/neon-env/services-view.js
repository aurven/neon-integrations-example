'use strict';
/**
 * Pure view-model for the /services dashboard's registry banner.
 * Keeps registry internals (env list, raw load error) away from anonymous visitors.
 * Spec: docs/superpowers/specs/2026-09-30-multi-neon-env-design.md §1 (Amendment 12)
 */
const ANONYMOUS_REGISTRY_WARNING = 'Neon environment registry unusable — running in legacy mode (see server log)';

function servicesRegistryView(registry, isAdmin, currentEnvId) {
  const neonEnvs = isAdmin
    ? registry.list().map((e) => ({ id: e.id, label: e.label, boHost: e.neon.bo.host, current: e.id === currentEnvId }))
    : [];

  let registryWarning = null;
  if (registry.loadError) {
    registryWarning = isAdmin
      ? `Neon environment registry unusable, running in legacy mode: ${registry.loadError}`
      : ANONYMOUS_REGISTRY_WARNING;
  }

  return { neonEnvs, registryWarning };
}

module.exports = { servicesRegistryView, ANONYMOUS_REGISTRY_WARNING };
