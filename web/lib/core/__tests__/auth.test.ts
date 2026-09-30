import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { checkApiKey, shouldShowMaintenance, RESTRICTED_PANELS } from '../auth';

describe('checkApiKey', () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    process.env.NEON_EXT_APIKEY = 'admin-key';
    process.env.NEON_EXT_APIKEY_LIMITED = 'limited-key';
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('returns admin role when apikey matches NEON_EXT_APIKEY', () => {
    expect(checkApiKey('admin-key')).toEqual({
      authenticated: true,
      apikey: 'admin-key',
      role: 'admin',
    });
  });

  it('returns limited role when apikey matches NEON_EXT_APIKEY_LIMITED', () => {
    expect(checkApiKey('limited-key')).toEqual({
      authenticated: true,
      apikey: 'limited-key',
      role: 'limited',
    });
  });

  it('returns unauthenticated for a non-matching key', () => {
    expect(checkApiKey('bogus-key')).toEqual({
      authenticated: false,
      apikey: null,
      role: null,
    });
  });

  it('returns unauthenticated for null/undefined/empty apikey', () => {
    expect(checkApiKey(null)).toEqual({ authenticated: false, apikey: null, role: null });
    expect(checkApiKey(undefined)).toEqual({ authenticated: false, apikey: null, role: null });
    expect(checkApiKey('')).toEqual({ authenticated: false, apikey: null, role: null });
  });

  it('does not authenticate limited key when NEON_EXT_APIKEY_LIMITED is not configured', () => {
    delete process.env.NEON_EXT_APIKEY_LIMITED;
    expect(checkApiKey('limited-key')).toEqual({
      authenticated: false,
      apikey: null,
      role: null,
    });
  });

  it('prefers admin match even if the limited key is also configured to the same value', () => {
    process.env.NEON_EXT_APIKEY_LIMITED = 'admin-key';
    expect(checkApiKey('admin-key')).toEqual({
      authenticated: true,
      apikey: 'admin-key',
      role: 'admin',
    });
  });
});

describe('shouldShowMaintenance', () => {
  it('returns true when demo query param is "maintenance" regardless of role', () => {
    expect(
      shouldShowMaintenance({ demoQueryParam: 'maintenance', role: 'admin', panelName: 'home' })
    ).toBe(true);
    expect(
      shouldShowMaintenance({ demoQueryParam: 'maintenance', role: null, panelName: 'home' })
    ).toBe(true);
  });

  it('returns true for limited role accessing a restricted panel', () => {
    for (const panel of RESTRICTED_PANELS) {
      expect(shouldShowMaintenance({ role: 'limited', panelName: panel })).toBe(true);
    }
  });

  it('returns false for limited role accessing a non-restricted panel', () => {
    expect(shouldShowMaintenance({ role: 'limited', panelName: 'home' })).toBe(false);
  });

  it('returns false for admin role on any panel', () => {
    for (const panel of [...RESTRICTED_PANELS, 'home']) {
      expect(shouldShowMaintenance({ role: 'admin', panelName: panel })).toBe(false);
    }
  });

  it('returns false when unauthenticated and panel is not restricted', () => {
    expect(shouldShowMaintenance({ role: null, panelName: 'home' })).toBe(false);
  });
});
