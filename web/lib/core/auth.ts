/**
 * Authentication helper logic, ported from src/helpers/auth.js.
 *
 * This module contains only the framework-agnostic env-var comparison and
 * maintenance-gating logic. The original Fastify version also set an
 * `apikey` cookie on the reply (`reply.setCookie(...)`) as a side effect of
 * a successful authentication check. In the Next.js architecture, setting
 * that cookie is the responsibility of the caller (the auth middleware,
 * see Task 3) - this module deliberately has no side effects.
 */

export type AuthRole = 'admin' | 'limited' | null;

export interface AuthResult {
  authenticated: boolean;
  apikey: string | null;
  role: AuthRole;
}

/**
 * Checks an API key against the configured admin/limited keys.
 *
 * Mirrors the comparison logic from `authenticate()` in src/helpers/auth.js,
 * minus the `reply.setCookie(...)` side effect. The caller (Next.js
 * middleware) is responsible for setting the `apikey` cookie when
 * `authenticated` is true.
 *
 * @param apikey - The API key to check (from header, query param, or cookie)
 * @returns Authentication result with role information
 */
export function checkApiKey(apikey: string | null | undefined): AuthResult {
  // Admin key (full access)
  if (apikey && apikey === process.env.NEON_EXT_APIKEY) {
    return { authenticated: true, apikey, role: 'admin' };
  }

  // Limited key (restricted access)
  if (
    apikey &&
    process.env.NEON_EXT_APIKEY_LIMITED &&
    apikey === process.env.NEON_EXT_APIKEY_LIMITED
  ) {
    return { authenticated: true, apikey, role: 'limited' };
  }

  return { authenticated: false, apikey: null, role: null };
}

// Panels that require admin access
export const RESTRICTED_PANELS = ['methode', 'social-media', 'trello', 'smartocto'];

export interface ShouldShowMaintenanceOptions {
  /** Value of the `demo` query param, e.g. 'maintenance' for testing the maintenance view */
  demoQueryParam?: string;
  /** Role from the authentication result */
  role: AuthRole;
  /** Name of the panel being accessed */
  panelName: string;
}

/**
 * Determines whether a panel should show the maintenance page.
 *
 * Mirrors the logic from `shouldShowMaintenance()` in src/helpers/auth.js,
 * taking plain values instead of Fastify `request`/`auth` objects.
 */
export function shouldShowMaintenance({
  demoQueryParam,
  role,
  panelName,
}: ShouldShowMaintenanceOptions): boolean {
  // Query param for testing maintenance view
  if (demoQueryParam === 'maintenance') {
    return true;
  }
  // Limited users cannot access restricted panels
  if (role === 'limited' && RESTRICTED_PANELS.includes(panelName)) {
    return true;
  }
  return false;
}
