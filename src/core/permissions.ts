/**
 * Core permission definitions for Chrome extension and GitHub scopes.
 */

export const EXTENSION_PERMISSIONS = {
  storage: 'storage',
  activeTab: 'activeTab',
  scripting: 'scripting',
} as const;

export const REQUIRED_GITHUB_SCOPES = ['repo'] as const;

export const RECOMMENDED_FINE_GRAINED_PERMISSIONS = {
  contents: 'write',
  metadata: 'read',
} as const;
