import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RepositoryValidator } from '../src/github/repository-validator';

describe('RepositoryValidator & RepositoryService', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reports invalid repo format directly without API calls', async () => {
    const validator = new RepositoryValidator('github_pat_11AAAAAAA_valid');
    const report = await validator.validateRepositoryScope('invalidRepoName');

    expect(report.isValid).toBe(false);
    expect(report.formattedOutput).toContain('Invalid repository format');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('Step 1: fails when PAT is invalid (HTTP 401)', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      headers: new Headers(),
      json: async () => ({ message: 'Bad credentials' }),
    });

    const validator = new RepositoryValidator('invalid_pat');
    const report = await validator.validateRepositoryScope('octocat/Hello-World');

    expect(report.isValid).toBe(false);
    expect(report.tokenValid).toBe(false);
    expect(report.formattedOutput).toContain('❌ Invalid GitHub Personal Access Token');
  });

  it('Step 2: fails when repository is not found (authenticated 404 & unauthenticated 404)', async () => {
    // 1st fetch: /user
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ login: 'octocat' }),
    });

    // 2nd fetch (authenticated): /repos/octocat/NonExistentRepo -> 404
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 404,
      headers: new Headers(),
      json: async () => ({ message: 'Not Found' }),
    });

    // 3rd fetch (unauthenticated public check): https://api.github.com/repos/octocat/NonExistentRepo -> 404
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 404,
      headers: new Headers(),
      json: async () => ({ message: 'Not Found' }),
    });

    const validator = new RepositoryValidator('github_pat_11AAAAAAA_valid');
    const report = await validator.validateRepositoryScope('octocat/NonExistentRepo');

    expect(report.isValid).toBe(false);
    expect(report.repoExists).toBe(false);
    expect(report.formattedOutput).toContain('❌ Repository not found');
    expect(report.formattedOutput).toContain('Verify the repository URL.');
  });

  it('Step 3: detects Fine-grained PAT with incorrect repository selection (authenticated 404 & unauthenticated 200)', async () => {
    // 1st fetch: /user
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ login: 'octocat' }),
    });

    // 2nd fetch (authenticated): /repos/octocat/UnselectedRepo -> 404
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 404,
      headers: new Headers(),
      json: async () => ({ message: 'Not Found' }),
    });

    // 3rd fetch (unauthenticated public check): https://api.github.com/repos/octocat/UnselectedRepo -> 200 (repo exists publicly!)
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ id: 99, full_name: 'octocat/UnselectedRepo' }),
    });

    const validator = new RepositoryValidator('github_pat_11AAAAAAA_valid');
    const report = await validator.validateRepositoryScope('octocat/UnselectedRepo');

    expect(report.isValid).toBe(false);
    expect(report.formattedOutput).toContain(
      '❌ Personal Access Token cannot access this repository.',
    );
    expect(report.formattedOutput).toContain(
      'Grant this repository access in your Fine-grained Personal Access Token.',
    );
  });

  it('Step 5: fails when token lacks Contents write access (permissions.push is false)', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ login: 'octocat' }),
    });

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({
        id: 12345,
        full_name: 'octocat/ReadOnlyRepo',
        private: false,
        default_branch: 'main',
        permissions: { push: false, admin: false, pull: true },
      }),
    });

    const validator = new RepositoryValidator('github_pat_11AAAAAAA_valid');
    const report = await validator.validateRepositoryScope('octocat/ReadOnlyRepo');

    expect(report.isValid).toBe(false);
    expect(report.hasWritePermission).toBe(false);
    expect(report.formattedOutput).toContain('❌ Token does not have write access.');
    expect(report.formattedOutput).toContain('Required:\nContents → Read & Write');
  });

  it('validates successful 5-step configuration with default branch detection and write permissions', async () => {
    // 1st fetch: /user
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ login: 'octocat' }),
    });

    // 2nd fetch: /repos/octocat/Hello-World
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({
        id: 12345,
        full_name: 'octocat/Hello-World',
        private: true,
        default_branch: 'main',
        permissions: { push: true, admin: false, pull: true },
      }),
    });

    const validator = new RepositoryValidator('github_pat_11AAAAAAA_valid');
    const report = await validator.validateRepositoryScope('octocat/Hello-World');

    expect(report.isValid).toBe(true);
    expect(report.tokenValid).toBe(true);
    expect(report.repoExists).toBe(true);
    expect(report.hasWritePermission).toBe(true);
    expect(report.repoDetails?.fullName).toBe('octocat/Hello-World');
    expect(report.repoDetails?.defaultBranch).toBe('main');
    expect(report.formattedOutput).toContain('✓ GitHub configuration verified');
    expect(report.formattedOutput).toContain('Repository:\noctocat/Hello-World');
    expect(report.formattedOutput).toContain('Branch:\nmain');
    expect(report.formattedOutput).toContain('Contents permission:\nRead & Write');
    expect(report.formattedOutput).toContain('Ready to archive LeetCode solutions.');
  });
});
