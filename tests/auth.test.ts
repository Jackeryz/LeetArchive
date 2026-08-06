import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GitHubAuthService } from '../src/github/auth';
import { SecretsStorage } from '../src/storage/secrets';
import { SettingsStorage } from '../src/storage/settings';

const localStore: Record<string, unknown> = {};
const syncStore: Record<string, unknown> = {};

vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: (keys: string[], callback: (res: Record<string, unknown>) => void) => {
        const res: Record<string, unknown> = {};
        for (const k of keys) {
          res[k] = localStore[k];
        }
        callback(res);
      },
      set: (items: Record<string, unknown>, callback: () => void) => {
        Object.assign(localStore, items);
        callback();
      },
      remove: (keys: string[], callback: () => void) => {
        for (const k of keys) {
          delete localStore[k];
        }
        callback();
      },
    },
    sync: {
      get: (keys: string[], callback: (res: Record<string, unknown>) => void) => {
        const res: Record<string, unknown> = {};
        for (const k of keys) {
          res[k] = syncStore[k];
        }
        callback(res);
      },
      set: (items: Record<string, unknown>, callback: () => void) => {
        Object.assign(syncStore, items);
        callback();
      },
    },
  },
});

describe('GitHubAuthService', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    for (const key of Object.keys(localStore)) delete localStore[key];
    for (const key of Object.keys(syncStore)) delete syncStore[key];
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects malformed token before making API call', async () => {
    const service = new GitHubAuthService();
    const result = await service.validateToken('invalid_token');

    expect(result.user).toBeNull();
    expect(result.error).toContain('Token syntax format is invalid');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('validates a correct Fine-Grained PAT successfully (HTTP 200)', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ login: 'octocat', id: 1, avatar_url: 'https://github.com/octocat.png' }),
    });

    const service = new GitHubAuthService();
    const result = await service.validateToken('github_pat_11AAAAAAA_1234567890');

    expect(result.user?.login).toBe('octocat');
    expect(result.error).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('detects expired or revoked token (HTTP 401)', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      headers: new Headers(),
      json: async () => ({ message: 'Bad credentials' }),
    });

    const service = new GitHubAuthService();
    const result = await service.validateToken('github_pat_11AAAAAAA_expired');

    expect(result.user).toBeNull();
    expect(result.error).toContain('Personal Access Token is invalid, expired, or revoked');
  });

  it('handles network failure cleanly (fetch error)', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    const service = new GitHubAuthService();
    const result = await service.validateToken('github_pat_11AAAAAAA_valid');

    expect(result.user).toBeNull();
    expect(result.error).toContain('Network failure');
  });

  it('clears stored secrets, settings, and caches upon logout', async () => {
    await SecretsStorage.setToken('github_pat_11AAAAAAA_valid');
    await SettingsStorage.saveSettings({ selectedRepo: 'octocat/Hello-World' });

    const service = new GitHubAuthService();
    const state = await service.logout();

    expect(state.isAuthenticated).toBe(false);
    expect(await SecretsStorage.getToken()).toBeNull();
    const updatedSettings = await SettingsStorage.getSettings();
    expect(updatedSettings.selectedRepo).toBeNull();
  });
});
