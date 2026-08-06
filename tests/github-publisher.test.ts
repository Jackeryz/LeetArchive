import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import {
  GitHubPublisher,
  encodeBase64Utf8,
  parseAndLogGitHubApiError,
} from '../src/github/publisher';
import { SecretsStorage } from '../src/storage/secrets';
import { SettingsStorage } from '../src/storage/settings';
import { AccountVerifiedPayload, ArchivePublishedPayload, EventBus } from '../src/core/events';

describe('Base64 UTF-8 Encoding', () => {
  it('correctly encodes ASCII and Unicode strings to base64', () => {
    expect(encodeBase64Utf8('hello world')).toBe('aGVsbG8gd29ybGQ=');
    expect(encodeBase64Utf8('🚀 LeetCode Solution')).toBe('8J+agCBMZWV0Q29kZSBTb2x1dGlvbg==');
  });
});

describe('GitHub API Error Parsing (parseAndLogGitHubApiError)', () => {
  it('parses JSON response and returns message and documentation_url', async () => {
    const mockRes = {
      status: 401,
      statusText: 'Unauthorized',
      text: async () =>
        JSON.stringify({
          message: 'Bad credentials',
          documentation_url: 'https://docs.github.com/rest',
        }),
    } as Response;

    const msg = await parseAndLogGitHubApiError(mockRes, 'https://api.github.com/user');
    expect(msg).toBe('Bad credentials');
  });

  it('handles raw non-JSON text responses gracefully', async () => {
    const mockRes = {
      status: 500,
      statusText: 'Internal Error',
      text: async () => 'Raw HTML Error Page',
    } as Response;

    const msg = await parseAndLogGitHubApiError(mockRes, 'https://api.github.com/user');
    expect(msg).toBe('Raw HTML Error Page');
  });
});

describe('GitHubPublisher', () => {
  let publisher: GitHubPublisher;
  let eventBus: EventBus;

  const sampleVerifiedPayload: AccountVerifiedPayload = {
    username: 'username_xyz',
    verifiedAt: 1700000000000,
    archive: {
      problemTitle: 'Two Sum',
      problemSlug: 'two-sum',
      difficulty: 'Easy',
      language: 'python3',
      timestamp: 1700000000000,
      archiveMode: 'folder',
      files: [
        { path: 'Two Sum/README.md', content: '# Two Sum' },
        { path: 'Two Sum/solution.py', content: 'def twoSum(): pass' },
      ],
    },
  };

  beforeEach(() => {
    eventBus = EventBus.getInstance();
    eventBus.clearAllListeners();
    publisher = new GitHubPublisher();
  });

  afterEach(() => {
    publisher.stop();
    eventBus.clearAllListeners();
    vi.restoreAllMocks();
  });

  it('publishes archive successfully for new files and emits ArchivePublished event', async () => {
    vi.spyOn(SecretsStorage, 'getToken').mockResolvedValue('github_pat_valid123');
    vi.spyOn(SettingsStorage, 'getSettings').mockResolvedValue({
      githubToken: 'github_pat_valid123',
      selectedRepo: 'octocat/leetcode-solutions',
      branch: 'main',
      folderStructure: 'difficulty',
      autoSync: true,
      syncReadme: true,
      leetcodeUsername: 'username_xyz',
    });

    // Mock fetch for GET (404 file not found) and PUT (201 created)
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      const method = init?.method || 'GET';

      if (method === 'GET') {
        return {
          ok: false,
          status: 404,
          statusText: 'Not Found',
          text: async () => 'File not found',
        } as Response;
      }

      if (method === 'PUT') {
        return {
          ok: true,
          status: 201,
          statusText: 'Created',
          json: async () => ({ commit: { sha: 'commit_sha_123456' } }),
        } as Response;
      }

      return { ok: false, status: 500 } as Response;
    });

    let emittedPublishedPayload: ArchivePublishedPayload | null = null;
    eventBus.subscribe<ArchivePublishedPayload>('ArchivePublished', (event) => {
      emittedPublishedPayload = event.payload;
    });

    publisher.start();
    const result = await publisher.publishArchive(sampleVerifiedPayload);

    expect(result).not.toBeNull();
    expect(result?.repository).toBe('octocat/leetcode-solutions');
    expect(result?.branch).toBe('main');
    expect(result?.commitSha).toBe('commit_sha_123456');
    expect(result?.committedFiles).toBe(2);

    expect(emittedPublishedPayload).not.toBeNull();
    expect(fetchSpy).toHaveBeenCalledTimes(4); // 2 GET checks + 2 PUT uploads
  });

  it('retrieves existing file SHA when updating existing files', async () => {
    vi.spyOn(SecretsStorage, 'getToken').mockResolvedValue('github_pat_valid123');
    vi.spyOn(SettingsStorage, 'getSettings').mockResolvedValue({
      githubToken: 'github_pat_valid123',
      selectedRepo: 'octocat/leetcode-solutions',
      branch: 'main',
      folderStructure: 'difficulty',
      autoSync: true,
      syncReadme: true,
      leetcodeUsername: 'username_xyz',
    });

    let putBodies: any[] = [];

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      const method = init?.method || 'GET';

      if (method === 'GET') {
        return {
          ok: true,
          status: 200,
          json: async () => ({ sha: 'existing_file_sha_999' }),
        } as Response;
      }

      if (method === 'PUT') {
        if (init?.body) {
          putBodies.push(JSON.parse(init.body as string));
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ commit: { sha: 'updated_commit_sha' } }),
        } as Response;
      }

      return { ok: false, status: 500 } as Response;
    });

    const result = await publisher.publishArchive(sampleVerifiedPayload);

    expect(result).not.toBeNull();
    expect(putBodies.length).toBe(2);
    expect(putBodies[0].sha).toBe('existing_file_sha_999');
    expect(putBodies[1].sha).toBe('existing_file_sha_999');
  });

  it('detects default branch using GitHub API when branch is unconfigured and saves it', async () => {
    vi.spyOn(SecretsStorage, 'getToken').mockResolvedValue('github_pat_valid123');
    vi.spyOn(SettingsStorage, 'getSettings').mockResolvedValue({
      githubToken: 'github_pat_valid123',
      selectedRepo: 'octocat/leetcode-solutions',
      branch: '',
      folderStructure: 'difficulty',
      autoSync: true,
      syncReadme: true,
      leetcodeUsername: 'username_xyz',
    });
    const saveSettingsSpy = vi.spyOn(SettingsStorage, 'saveSettings').mockResolvedValue();

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      const urlStr = String(_url);
      const method = init?.method || 'GET';

      // Branch detection GET call
      if (method === 'GET' && urlStr.endsWith('/repos/octocat/leetcode-solutions')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ default_branch: 'develop' }),
        } as Response;
      }

      if (method === 'GET') {
        return { ok: false, status: 404 } as Response;
      }

      if (method === 'PUT') {
        return {
          ok: true,
          status: 201,
          json: async () => ({ commit: { sha: 'commit_develop_sha' } }),
        } as Response;
      }

      return { ok: false, status: 500 } as Response;
    });

    const result = await publisher.publishArchive(sampleVerifiedPayload);

    expect(result).not.toBeNull();
    expect(result?.branch).toBe('develop');
    expect(saveSettingsSpy).toHaveBeenCalledWith({ branch: 'develop' });
  });

  it('aborts upload gracefully when PAT token is missing', async () => {
    vi.spyOn(SecretsStorage, 'getToken').mockResolvedValue(null);
    vi.spyOn(SettingsStorage, 'getSettings').mockResolvedValue({
      githubToken: null,
      selectedRepo: 'octocat/leetcode-solutions',
      branch: 'main',
      folderStructure: 'difficulty',
      autoSync: true,
      syncReadme: true,
    });

    const result = await publisher.publishArchive(sampleVerifiedPayload);
    expect(result).toBeNull();
  });

  it('aborts upload gracefully when target repository is not configured', async () => {
    vi.spyOn(SecretsStorage, 'getToken').mockResolvedValue('github_pat_valid123');
    vi.spyOn(SettingsStorage, 'getSettings').mockResolvedValue({
      githubToken: 'github_pat_valid123',
      selectedRepo: null,
      branch: 'main',
      folderStructure: 'difficulty',
      autoSync: true,
      syncReadme: true,
    });

    const result = await publisher.publishArchive(sampleVerifiedPayload);
    expect(result).toBeNull();
  });

  it('handles 401 Unauthorized errors during upload cleanly', async () => {
    vi.spyOn(SecretsStorage, 'getToken').mockResolvedValue('invalid_pat');
    vi.spyOn(SettingsStorage, 'getSettings').mockResolvedValue({
      githubToken: 'invalid_pat',
      selectedRepo: 'octocat/leetcode-solutions',
      branch: 'main',
      folderStructure: 'difficulty',
      autoSync: true,
      syncReadme: true,
    });

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      const method = init?.method || 'GET';
      if (method === 'GET') {
        return { ok: false, status: 404, text: async () => 'Not Found' } as Response;
      }
      if (method === 'PUT') {
        return {
          ok: false,
          status: 401,
          statusText: 'Unauthorized',
          text: async () =>
            JSON.stringify({
              message: 'Bad credentials',
              documentation_url: 'https://docs.github.com/rest',
            }),
        } as Response;
      }
      return { ok: false, status: 500, text: async () => 'Server error' } as Response;
    });

    const result = await publisher.publishArchive(sampleVerifiedPayload);
    expect(result).toBeNull();
  });

  it('handles 404 Repository or Branch not found errors cleanly', async () => {
    vi.spyOn(SecretsStorage, 'getToken').mockResolvedValue('github_pat_valid123');
    vi.spyOn(SettingsStorage, 'getSettings').mockResolvedValue({
      githubToken: 'github_pat_valid123',
      selectedRepo: 'octocat/nonexistent',
      branch: 'main',
      folderStructure: 'difficulty',
      autoSync: true,
      syncReadme: true,
    });

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      const method = init?.method || 'GET';
      if (method === 'GET') {
        return { ok: false, status: 404, text: async () => 'Not Found' } as Response;
      }
      if (method === 'PUT') {
        return {
          ok: false,
          status: 404,
          statusText: 'Not Found',
          text: async () =>
            JSON.stringify({
              message: 'Not Found',
              documentation_url: 'https://docs.github.com/rest',
            }),
        } as Response;
      }
      return { ok: false, status: 500, text: async () => 'Server error' } as Response;
    });

    const result = await publisher.publishArchive(sampleVerifiedPayload);
    expect(result).toBeNull();
  });
});
