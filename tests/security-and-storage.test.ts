import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TokenSecurity } from '../src/security/token';
import { SecurityValidation } from '../src/security/validation';
import { SecretsStorage } from '../src/storage/secrets';
import { SettingsStorage } from '../src/storage/settings';

// Mock chrome storage API
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

describe('TokenSecurity & Input Sanitization', () => {
  it('sanitizes token with accidental whitespace, tabs, and newlines', () => {
    const dirty = '  github_pat_11AAAAAAA_1234567890 \r\n\t ';
    expect(TokenSecurity.sanitizeToken(dirty)).toBe('github_pat_11AAAAAAA_1234567890');
    expect(TokenSecurity.isValidTokenFormat(dirty)).toBe(true);
  });

  it('correctly classifies Fine-Grained PATs, Classic PATs, and invalid tokens', () => {
    expect(TokenSecurity.classifyToken('github_pat_11AAAAAAA_1234567890')).toBe('FineGrainedPAT');
    expect(TokenSecurity.classifyToken('ghp_abcdef1234567890')).toBe('ClassicPAT');
    expect(TokenSecurity.classifyToken('ghs_abcdef1234567890')).toBe('GitHubAppToken');
    expect(TokenSecurity.classifyToken('bad_token')).toBe('Unknown');
  });

  it('masks tokens securely without exposing raw secrets', () => {
    expect(TokenSecurity.maskToken('github_pat_11AAAAAAA_1234567890')).toBe('github_...7890');
    expect(TokenSecurity.maskToken('short')).toBe('****');
  });
});

describe('SecurityValidation', () => {
  it('sanitizes repository names and validates owner/repo format', () => {
    expect(SecurityValidation.sanitizeRepoName('  octocat/Hello-World \n ')).toBe(
      'octocat/Hello-World',
    );
    expect(SecurityValidation.isValidRepoFormat('octocat/Hello-World')).toBe(true);
    expect(SecurityValidation.isValidRepoFormat('invalid-repo')).toBe(false);
    expect(SecurityValidation.isValidRepoFormat('')).toBe(false);
  });

  it('parses GitHub repository URLs and short owner/repo strings correctly', () => {
    const res1 = SecurityValidation.parseGitHubRepoUrl(
      'https://github.com/Jackson/leetcode-solutions',
    );
    expect(res1).toEqual({
      owner: 'Jackson',
      repo: 'leetcode-solutions',
      fullName: 'Jackson/leetcode-solutions',
    });

    const res2 = SecurityValidation.parseGitHubRepoUrl(
      'https://github.com/Jackson/leetcode-solutions/',
    );
    expect(res2).toEqual({
      owner: 'Jackson',
      repo: 'leetcode-solutions',
      fullName: 'Jackson/leetcode-solutions',
    });

    const res3 = SecurityValidation.parseGitHubRepoUrl(
      'https://github.com/Jackson/leetcode-solutions.git',
    );
    expect(res3).toEqual({
      owner: 'Jackson',
      repo: 'leetcode-solutions',
      fullName: 'Jackson/leetcode-solutions',
    });

    const res4 = SecurityValidation.parseGitHubRepoUrl('Jackson/leetcode-solutions');
    expect(res4).toEqual({
      owner: 'Jackson',
      repo: 'leetcode-solutions',
      fullName: 'Jackson/leetcode-solutions',
    });

    expect(SecurityValidation.parseGitHubRepoUrl('invalid-input')).toBeNull();
    expect(SecurityValidation.parseGitHubRepoUrl('https://github.com/')).toBeNull();
    expect(SecurityValidation.parseGitHubRepoUrl('')).toBeNull();
  });

  it('prevents path traversal sequences in file paths', () => {
    expect(SecurityValidation.sanitizeFilePath('../../etc/passwd')).toBe('etc/passwd');
    expect(SecurityValidation.sanitizeFilePath('\\windows\\system32')).toBe('windows/system32');
  });

  it('escapes unsafe HTML elements', () => {
    expect(SecurityValidation.escapeHtml('<script>alert("xss")</script>')).toBe(
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;',
    );
  });
});

describe('SecretsStorage & SettingsStorage', () => {
  beforeEach(() => {
    for (const key of Object.keys(localStore)) delete localStore[key];
    for (const key of Object.keys(syncStore)) delete syncStore[key];
  });

  it('stores, retrieves, and clears token securely', async () => {
    await SecretsStorage.setToken('github_pat_secret123');
    const token = await SecretsStorage.getToken();
    expect(token).toBe('github_pat_secret123');

    await SecretsStorage.clearSecrets();
    const cleared = await SecretsStorage.getToken();
    expect(cleared).toBeNull();
  });

  it('persists and retrieves user extension settings', async () => {
    await SettingsStorage.saveSettings({ selectedRepo: 'user/repo', branch: 'dev' });
    const settings = await SettingsStorage.getSettings();

    expect(settings.selectedRepo).toBe('user/repo');
    expect(settings.branch).toBe('dev');
    expect(settings.autoSync).toBe(true);
  });
});
