import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AccountVerifiedPayload,
  ArchivePublishedPayload,
  ArchivePublishFailedPayload,
  EventBus,
  PushRequestedPayload,
} from '../src/core/events';
import { GitHubPublisher } from '../src/github/publisher';
import { SecretsStorage } from '../src/storage/secrets';
import { SettingsStorage } from '../src/storage/settings';

describe('GitHubPublisher', () => {
  let publisher: GitHubPublisher;
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = EventBus.getInstance();
    eventBus.clearAllListeners();
    publisher = new GitHubPublisher();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    publisher.stop();
    eventBus.clearAllListeners();
  });

  const sampleVerifiedPayload: AccountVerifiedPayload = {
    username: 'username_xyz',
    verifiedAt: 123456789,
    archive: {
      problemTitle: 'Two Sum',
      problemSlug: 'two-sum',
      difficulty: 'Easy',
      language: 'Python3',
      timestamp: 123456789,
      archiveMode: 'folder',
      files: [
        { path: 'Two Sum/README.md', content: '# Two Sum' },
        { path: 'Two Sum/solution.py', content: 'print("hello")' },
      ],
    },
  };

  it('does NOT publish on AccountVerified events', async () => {
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

    const publishSpy = vi.spyOn(publisher, 'publishArchive');
    publisher.start();

    eventBus.publish('AccountVerified', sampleVerifiedPayload);
    await new Promise((r) => setTimeout(r, 20));

    expect(publishSpy).not.toHaveBeenCalled();
  });

  it('publishes solution archive when PushRequested event is received', async () => {
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

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
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

    const pushRequestedPayload: PushRequestedPayload = {
      requestId: 'req_12345',
      verifiedPayload: sampleVerifiedPayload,
    };
    eventBus.publish('PushRequested', pushRequestedPayload);

    await new Promise((r) => setTimeout(r, 50));

    expect(emittedPublishedPayload).not.toBeNull();
    expect(emittedPublishedPayload!.repository).toBe('octocat/leetcode-solutions');
    expect(emittedPublishedPayload!.commitSha).toBe('commit_sha_123456');
    expect(emittedPublishedPayload!.requestId).toBe('req_12345');
  });

  it('emits ArchivePublishFailed when upload fails and does not expose secrets', async () => {
    vi.spyOn(SecretsStorage, 'getToken').mockResolvedValue('github_pat_secret_key');
    vi.spyOn(SettingsStorage, 'getSettings').mockResolvedValue({
      githubToken: 'github_pat_secret_key',
      selectedRepo: 'octocat/leetcode-solutions',
      branch: 'main',
      folderStructure: 'difficulty',
      autoSync: true,
      syncReadme: true,
    });

    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return {
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: async () => JSON.stringify({ message: 'Bad credentials' }),
      } as Response;
    });

    let failedEvent: ArchivePublishFailedPayload | null = null;
    eventBus.subscribe<ArchivePublishFailedPayload>('ArchivePublishFailed', (event) => {
      failedEvent = event.payload;
    });

    publisher.start();
    const pushRequestedPayload: PushRequestedPayload = {
      requestId: 'req_failed',
      verifiedPayload: sampleVerifiedPayload,
    };
    eventBus.publish('PushRequested', pushRequestedPayload);

    await new Promise((r) => setTimeout(r, 50));

    expect(failedEvent).not.toBeNull();
    expect(failedEvent!.problemTitle).toBe('Two Sum');
    expect(failedEvent!.error).toContain('Bad credentials');
    expect(failedEvent!.error).not.toContain('github_pat_secret_key');
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

    const result = await publisher.publishArchive(sampleVerifiedPayload, 'req_update');

    expect(result).not.toBeNull();
    expect(putBodies.length).toBe(2);
    expect(putBodies[0].sha).toBe('existing_file_sha_999');
  });
});
