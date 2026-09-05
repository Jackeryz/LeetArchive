import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AccountVerifiedPayload,
  ArchivePublishedPayload,
  ArchivePublishFailedPayload,
  EventBus,
} from '../src/core/events';
import { GitHubPublisher, encodeBase64Utf8 } from '../src/github/publisher';
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

  // Requirement A: First submission for a problem: target file does not exist, publisher creates it
  it('Requirement A: First submission creates new file when target does not exist (HTTP 404)', async () => {
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

    const putBodies: any[] = [];

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
        if (init?.body) {
          putBodies.push(JSON.parse(init.body as string));
        }
        return {
          ok: true,
          status: 201,
          statusText: 'Created',
          json: async () => ({ commit: { sha: 'commit_new_file_sha' } }),
        } as Response;
      }
      return { ok: false, status: 500 } as Response;
    });

    const result = await publisher.publishArchive(sampleVerifiedPayload, 'req_first_sub');

    expect(result).not.toBeNull();
    expect(result!.commitSha).toBe('commit_new_file_sha');
    expect(putBodies.length).toBe(2);
    // New files must NOT send a sha in PUT body
    expect(putBodies[0].sha).toBeUndefined();
    expect(putBodies[1].sha).toBeUndefined();
  });

  // Requirement B & E: Second/new submission for the SAME problem updates existing file with existing SHA and NEW content
  it('Requirement B & E: Second submission updates existing file using retrieved SHA and uploads NEW content', async () => {
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

    const newSolutionCode =
      'def twoSum(nums, target):\n    # Improved O(n) solution\n    seen = {}\n    for i, n in enumerate(nums):\n        if target - n in seen: return [seen[target - n], i]\n        seen[n] = i\n';

    const secondVerifiedPayload: AccountVerifiedPayload = {
      username: 'username_xyz',
      verifiedAt: 123456999,
      archive: {
        problemTitle: 'Two Sum',
        problemSlug: 'two-sum',
        difficulty: 'Easy',
        language: 'Python3',
        timestamp: 123456999,
        archiveMode: 'folder',
        files: [
          { path: 'Two Sum/README.md', content: '# Two Sum (Updated)' },
          { path: 'Two Sum/solution.py', content: newSolutionCode },
        ],
      },
    };

    const putCalls: Array<{ url: string; body: any }> = [];

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      const method = init?.method || 'GET';

      if (method === 'GET') {
        return {
          ok: true,
          status: 200,
          json: async () => ({ sha: 'blob_sha_from_previous_submission_123' }),
        } as Response;
      }

      if (method === 'PUT') {
        const parsedBody = JSON.parse((init?.body as string) || '{}');
        putCalls.push({ url: String(url), body: parsedBody });
        return {
          ok: true,
          status: 200,
          json: async () => ({ commit: { sha: 'updated_commit_sha_456' } }),
        } as Response;
      }

      return { ok: false, status: 500 } as Response;
    });

    const result = await publisher.publishArchive(secondVerifiedPayload, 'req_second_sub');

    expect(result).not.toBeNull();
    expect(result!.commitSha).toBe('updated_commit_sha_456');
    expect(putCalls.length).toBe(2);

    // Verify SHA was supplied for both existing files
    expect(putCalls[0].body.sha).toBe('blob_sha_from_previous_submission_123');
    expect(putCalls[1].body.sha).toBe('blob_sha_from_previous_submission_123');

    // Requirement E: Verify final PUT payload contains NEW solution content, NOT the old content
    const expectedBase64NewCode = encodeBase64Utf8(newSolutionCode);
    const oldBase64Code = encodeBase64Utf8('print("hello")');

    expect(putCalls[1].body.content).toBe(expectedBase64NewCode);
    expect(putCalls[1].body.content).not.toBe(oldBase64Code);
  });

  // Requirement C: Two different submissions for the same problem are both processed and second is not suppressed
  it('Requirement C: Two different submissions for the same problem are both processed sequentially via EventBus', async () => {
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

    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return {
        ok: true,
        status: 200,
        json: async () => ({ sha: 'existing_sha', commit: { sha: 'commit_sha_success' } }),
      } as Response;
    });

    const publishedEvents: ArchivePublishedPayload[] = [];
    eventBus.subscribe<ArchivePublishedPayload>('ArchivePublished', (event) => {
      publishedEvents.push(event.payload);
    });

    publisher.start();

    // Submission 1
    eventBus.publish('PushRequested', {
      requestId: 'req_sub1_twosum',
      verifiedPayload: sampleVerifiedPayload,
    });

    await new Promise((r) => setTimeout(r, 60));

    expect(publishedEvents.length).toBe(1);
    expect(publishedEvents[0].requestId).toBe('req_sub1_twosum');

    // Submission 2 for the SAME problem with updated code
    const secondPayload: AccountVerifiedPayload = {
      ...sampleVerifiedPayload,
      verifiedAt: Date.now() + 1000,
      archive: {
        ...sampleVerifiedPayload.archive,
        files: [
          { path: 'Two Sum/README.md', content: '# Two Sum v2' },
          { path: 'Two Sum/solution.py', content: 'def twoSum(): return [0, 1]' },
        ],
      },
    };

    eventBus.publish('PushRequested', {
      requestId: 'req_sub2_twosum',
      verifiedPayload: secondPayload,
    });

    await new Promise((r) => setTimeout(r, 60));

    // Both must be processed without being suppressed by deduplication
    expect(publishedEvents.length).toBe(2);
    expect(publishedEvents[1].requestId).toBe('req_sub2_twosum');
  });

  // Requirement D: A failed first publish followed by a new submission: publisher state recovers and second submission is publishable
  it('Requirement D: Publisher state recovers after failed first publish and second submission succeeds', async () => {
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

    let failFirstTime = true;

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      const method = init?.method || 'GET';
      if (failFirstTime) {
        return {
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          text: async () => 'GitHub 500 error',
        } as Response;
      }
      if (method === 'GET') {
        return {
          ok: true,
          status: 200,
          json: async () => ({ sha: 'recovered_sha' }),
        } as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ commit: { sha: 'recovered_commit_sha' } }),
      } as Response;
    });

    let failedEvent: ArchivePublishFailedPayload | null = null;
    let publishedEvent: ArchivePublishedPayload | null = null;

    eventBus.subscribe<ArchivePublishFailedPayload>('ArchivePublishFailed', (e) => {
      failedEvent = e.payload;
    });
    eventBus.subscribe<ArchivePublishedPayload>('ArchivePublished', (e) => {
      publishedEvent = e.payload;
    });

    publisher.start();

    // First push fails
    eventBus.publish('PushRequested', {
      requestId: 'req_fail_1',
      verifiedPayload: sampleVerifiedPayload,
    });

    await new Promise((r) => setTimeout(r, 60));

    expect(failedEvent).not.toBeNull();
    expect(publishedEvent).toBeNull();

    // Second push succeeds after failure
    failFirstTime = false;
    eventBus.publish('PushRequested', {
      requestId: 'req_success_2',
      verifiedPayload: sampleVerifiedPayload,
    });

    await new Promise((r) => setTimeout(r, 60));

    expect(publishedEvent).not.toBeNull();
    expect(publishedEvent!.commitSha).toBe('recovered_commit_sha');
    expect(publishedEvent!.requestId).toBe('req_success_2');
  });

  // User Critical Regression Test: Verify initial state (OLD_README, OLD_SOLUTION) is replaced by (NEW_README, NEW_SOLUTION)
  it('CRITICAL REGRESSION TEST: Second archive updates both README and solution with independent SHAs and NEW content', async () => {
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

    const oldReadme = '# Two Sum\nInitial README';
    const oldSolution = 'def twoSum(nums, target):\n    # OLD SOLUTION O(N^2)\n    return [0, 1]\n';
    const shaReadmeOld = 'sha_blob_readme_old_1111';
    const shaSolutionOld = 'sha_blob_solution_old_2222';

    const newReadme = '# Two Sum\nUpdated README with complexity';
    const newSolution =
      'def twoSum(nums, target):\n    # NEW SOLUTION O(N) with dict\n    seen = {}\n    for i, n in enumerate(nums):\n        if target - n in seen: return [seen[target - n], i]\n        seen[n] = i\n';

    const secondArchivePayload: AccountVerifiedPayload = {
      username: 'username_xyz',
      verifiedAt: 1700000005000,
      archive: {
        problemTitle: 'Two Sum',
        problemSlug: 'two-sum',
        difficulty: 'Easy',
        language: 'python3',
        timestamp: 1700000005000,
        archiveMode: 'folder',
        files: [
          { path: 'Two Sum/README.md', content: newReadme },
          { path: 'Two Sum/solution.py', content: newSolution },
        ],
      },
    };

    const getCalls: string[] = [];
    const putCalls: Array<{ url: string; body: any }> = [];
    let readmePutDone = false;
    let solutionPutDone = false;

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      const urlStr = String(url);
      const method = init?.method || 'GET';

      if (method === 'GET') {
        getCalls.push(urlStr);
        if (urlStr.includes('README.md')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              sha: readmePutDone ? 'sha_blob_readme_new_3333' : shaReadmeOld,
              content: Buffer.from(readmePutDone ? newReadme : oldReadme).toString('base64'),
            }),
          } as Response;
        }
        if (urlStr.includes('solution.py')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              sha: solutionPutDone ? 'sha_blob_solution_new_4444' : shaSolutionOld,
              content: Buffer.from(solutionPutDone ? newSolution : oldSolution).toString('base64'),
            }),
          } as Response;
        }
        return { ok: false, status: 404 } as Response;
      }

      if (method === 'PUT') {
        const parsedBody = JSON.parse((init?.body as string) || '{}');
        putCalls.push({ url: urlStr, body: parsedBody });
        if (urlStr.includes('README.md')) readmePutDone = true;
        if (urlStr.includes('solution.py')) solutionPutDone = true;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            commit: { sha: `commit_sha_${putCalls.length}` },
            content: { sha: `new_blob_sha_${putCalls.length}` },
          }),
        } as Response;
      }

      return { ok: false, status: 500 } as Response;
    });

    const result = await publisher.publishArchive(secondArchivePayload, 'req_regression_check');

    expect(result).not.toBeNull();
    expect(result!.committedFiles).toBe(2);

    // 1. Separate GET/SHA lookups for README and solution (both pre-PUT and post-PUT verification)
    const readmeGets = getCalls.filter((u) => u.includes('README.md'));
    const solutionGets = getCalls.filter((u) => u.includes('solution.py'));
    expect(readmeGets.length).toBeGreaterThanOrEqual(1);
    expect(solutionGets.length).toBeGreaterThanOrEqual(1);

    // 2. Both PUT calls must execute
    expect(putCalls.length).toBe(2);

    const readmePut = putCalls.find((p) => p.url.includes('README.md'));
    const solutionPut = putCalls.find((p) => p.url.includes('solution.py'));

    expect(readmePut).toBeDefined();
    expect(solutionPut).toBeDefined();

    // 3. Independent SHAs used in PUT
    expect(readmePut!.body.sha).toBe(shaReadmeOld);
    expect(solutionPut!.body.sha).toBe(shaSolutionOld);
    expect(solutionPut!.body.sha).not.toBe(shaReadmeOld);

    // 4. Content assertions: decoded PUT content matches NEW solution and does not contain OLD solution
    const decodedReadme = Buffer.from(readmePut!.body.content, 'base64').toString('utf8');
    const decodedSolution = Buffer.from(solutionPut!.body.content, 'base64').toString('utf8');

    expect(decodedReadme).toBe(newReadme);
    expect(decodedSolution).toBe(newSolution);

    expect(decodedSolution).not.toBe(oldSolution);
    expect(decodedSolution).not.toContain('OLD SOLUTION');
    expect(decodedSolution).toContain('NEW SOLUTION O(N)');
  });
});
