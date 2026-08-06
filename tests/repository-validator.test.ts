import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RepositoryValidator } from '../src/github/repository-validator';
import { GitHubRepositoryService } from '../src/github/repository';

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
    expect(report.errors[0]).toContain('Invalid repository format');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('validates accessible target repository with full push permissions (HTTP 200)', async () => {
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
  });

  it('handles missing or inaccessible repository (HTTP 404)', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ login: 'octocat' }),
    });

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
    expect(report.errors[0]).toContain('was not found or is not accessible');
  });

  it('detects missing write permissions on read-only repository', async () => {
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
    expect(report.errors[0]).toContain('lacks Write');
  });

  it('detects renamed repository and adds a warning', async () => {
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
        full_name: 'octocat/New-Renamed-Repo',
        private: false,
        default_branch: 'main',
        permissions: { push: true, admin: false, pull: true },
      }),
    });

    const validator = new RepositoryValidator('github_pat_11AAAAAAA_valid');
    const report = await validator.validateRepositoryScope('octocat/Old-Repo-Name');

    expect(report.isValid).toBe(true);
    expect(report.repoDetails?.fullName).toBe('octocat/New-Renamed-Repo');
    expect(report.warnings.some((w) => w.includes('was renamed on GitHub'))).toBe(true);
  });

  it('handles GitHub API rate limiting (HTTP 403 / 429)', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 403,
      headers: new Headers(),
      json: async () => ({ message: 'API rate limit exceeded' }),
    });

    const validator = new RepositoryValidator('github_pat_11AAAAAAA_valid');
    const report = await validator.validateRepositoryScope('octocat/Hello-World');

    expect(report.isValid).toBe(false);
    expect(report.errors[0]).toContain('rate limit exceeded');
  });

  it('handles server errors gracefully (HTTP 500+)', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      headers: new Headers(),
      json: async () => ({ message: 'Internal Server Error' }),
    });

    const validator = new RepositoryValidator('github_pat_11AAAAAAA_valid');
    const report = await validator.validateRepositoryScope('octocat/Hello-World');

    expect(report.isValid).toBe(false);
    expect(report.errors[0]).toContain('GitHub API service error');
  });

  it('GitHubRepositoryService fetches repository details via GET /repos/{owner}/{repo}', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({
        id: 99,
        name: 'my-single-repo',
        full_name: 'octocat/my-single-repo',
        owner: { login: 'octocat', avatar_url: 'https://github.com/octocat.png' },
        private: true,
        html_url: 'https://github.com/octocat/my-single-repo',
        description: 'Single scoped repo',
        default_branch: 'main',
      }),
    });

    const service = new GitHubRepositoryService('github_pat_single');
    const repoDetails = await service.getRepositoryDetails('octocat', 'my-single-repo');

    expect(repoDetails).not.toBeNull();
    expect(repoDetails?.full_name).toBe('octocat/my-single-repo');
  });
});
