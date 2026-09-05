import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  RepositoryValidator,
  isMissingContentValidationError,
} from '../src/github/repository-validator';
import { ApiResponse } from '../src/github/api';

describe('RepositoryValidator & Fine-Grained PAT Authorization Probe', () => {
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
    expect(report.status).toBe('repository-not-found');
    expect(report.formattedOutput).toContain('Invalid repository format');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // Test 4: Invalid PAT
  it('Step 1 (Test 4): fails when PAT is invalid (HTTP 401 on GET /user)', async () => {
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
    expect(report.status).toBe('pat-invalid');
    expect(report.formattedOutput).toContain('✕ Invalid Personal Access Token');
  });

  it('Step 2: fails when repository metadata is not found (HTTP 404 on GET /repos/{owner}/{repo})', async () => {
    // 1st fetch: GET /user -> 200 OK
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ login: 'Jackeryz' }),
    });

    // 2nd fetch: GET /repos/Jackeryz/NonExistent -> 404
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 404,
      headers: new Headers(),
      json: async () => ({ message: 'Not Found' }),
    });

    const validator = new RepositoryValidator('github_pat_11AAAAAAA_valid');
    const report = await validator.validateRepositoryScope('Jackeryz/NonExistent');

    expect(report.isValid).toBe(false);
    expect(report.repoExists).toBe(false);
    expect(report.status).toBe('repository-not-found');
    expect(report.formattedOutput).toContain('✕ Repository not found');
  });

  // Test 1: Public repo + unscoped PAT (Primary Regression Test)
  it('Step 3 (Test 1): PRIMARY REGRESSION TEST ? fails when user owns public repo but PAT is not scoped to it (HTTP 403 on POST /git/blobs)', async () => {
    // 1st fetch: GET /user -> 200 OK (login: Jackeryz)
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ login: 'Jackeryz' }),
    });

    // 2nd fetch: GET /repos/Jackeryz/LeetArchive -> 200 OK public repository metadata
    // permissions.push is true because Jackeryz owns the repository publicly
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({
        id: 999,
        full_name: 'Jackeryz/LeetArchive',
        private: false,
        default_branch: 'main',
        permissions: { push: true, admin: true, pull: true },
      }),
    });

    // 3rd fetch: POST /repos/Jackeryz/LeetArchive/git/blobs with {} -> 403 Forbidden
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 403,
      headers: new Headers(),
      json: async () => ({
        message: 'Resource not accessible by personal access token',
        documentation_url: 'https://docs.github.com/rest/overview/resources-in-the-rest-api#authentication',
      }),
    });

    const validator = new RepositoryValidator('github_pat_11AAAAAAA_scoped_to_repo_A_only');
    const report = await validator.validateRepositoryScope('Jackeryz/LeetArchive');

    expect(report.isValid).toBe(false);
    expect(report.hasWritePermission).toBe(false);
    expect(report.status).toBe('repository-inaccessible');
    expect(report.formattedOutput).toContain('✕ Repository access unavailable');
    expect(report.formattedOutput).toContain(
      'Your Fine-grained PAT does not have access to:\nJackeryz/LeetArchive',
    );
    expect(report.formattedOutput).toContain(
      "Update your PAT's Repository access settings to include this repository, then validate again.",
    );
    expect(report.formattedOutput).not.toContain('Contents: Read & Write');
  });

  // Test 2: Public repo + correctly scoped PAT
  it('Step 3 (Test 2): POSITIVE AUTHORIZATION TEST ? succeeds when PAT has Contents:write authorization (HTTP 422 with missing content)', async () => {
    // 1st fetch: GET /user -> 200 OK (login: Jackeryz)
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ login: 'Jackeryz' }),
    });

    // 2nd fetch: GET /repos/Jackeryz/LeetArchive -> 200 OK metadata
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({
        id: 999,
        full_name: 'Jackeryz/LeetArchive',
        private: false,
        default_branch: 'main',
        permissions: { push: true, admin: false, pull: true },
      }),
    });

    // 3rd fetch: POST /repos/Jackeryz/LeetArchive/git/blobs with {} -> 422 Unprocessable Entity
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 422,
      headers: new Headers(),
      json: async () => ({
        message: 'Validation Failed',
        errors: [
          {
            resource: 'Blob',
            code: 'missing_field',
            field: 'content',
          },
        ],
        documentation_url: 'https://docs.github.com/rest/git/blobs#create-a-blob',
      }),
    });

    const validator = new RepositoryValidator('github_pat_11AAAAAAA_valid_scoped');
    const report = await validator.validateRepositoryScope('Jackeryz/LeetArchive');

    expect(report.isValid).toBe(true);
    expect(report.status).toBe('valid');
    expect(report.authenticatedUser).toBe('Jackeryz');
    expect(report.repoDetails?.fullName).toBe('Jackeryz/LeetArchive');
    expect(report.repoDetails?.defaultBranch).toBe('main');
    expect(report.hasWritePermission).toBe(true);
    expect(report.formattedOutput).toContain('✓ GitHub configuration verified');
    expect(report.formattedOutput).toContain('GitHub account:\n@Jackeryz');
    expect(report.formattedOutput).toContain('Repository:\nJackeryz/LeetArchive');
    expect(report.formattedOutput).toContain('Branch:\nmain');
    expect(report.formattedOutput).toContain('✓ Repository access');
    expect(report.formattedOutput).toContain('✓ Contents: Read & Write');
    expect(report.formattedOutput).toContain('LeetArchive is ready to archive your solutions.');
  });

  // Test 3: 422 with unexpected validation error
  it('Step 3 (Test 3): UNEXPECTED 422 ERROR ? fails conservatively when 422 does not indicate missing content', async () => {
    // 1st fetch: GET /user -> 200 OK
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ login: 'Jackeryz' }),
    });

    // 2nd fetch: GET /repos/Jackeryz/LeetArchive -> 200 OK metadata
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({
        id: 999,
        full_name: 'Jackeryz/LeetArchive',
        private: false,
        default_branch: 'main',
        permissions: { push: true, admin: false, pull: true },
      }),
    });

    // 3rd fetch: POST /repos/Jackeryz/LeetArchive/git/blobs with {} -> 422 with unrelated error
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 422,
      headers: new Headers(),
      json: async () => ({
        message: 'Validation Failed',
        errors: [
          {
            resource: 'Blob',
            code: 'invalid',
            field: 'encoding',
          },
        ],
      }),
    });

    const validator = new RepositoryValidator('github_pat_11AAAAAAA_valid');
    const report = await validator.validateRepositoryScope('Jackeryz/LeetArchive');

    expect(report.isValid).toBe(false);
    expect(report.hasWritePermission).toBe(false);
    expect(report.status).toBe('repository-inaccessible');
    expect(report.formattedOutput).toContain(
      '✕ Repository authorization verification failed',
    );
    expect(report.formattedOutput).not.toContain('Contents: Read & Write');
  });

  // Test 5: Unexpected API status (e.g. 500)
  it('Step 3 (Test 5): UNEXPECTED STATUS ? fails conservatively on HTTP 500 during write probe', async () => {
    // 1st fetch: GET /user -> 200 OK
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ login: 'Jackeryz' }),
    });

    // 2nd fetch: GET /repos/Jackeryz/LeetArchive -> 200 OK metadata
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({
        id: 999,
        full_name: 'Jackeryz/LeetArchive',
        private: false,
        default_branch: 'main',
        permissions: { push: true, admin: false, pull: true },
      }),
    });

    // 3rd fetch: POST /repos/Jackeryz/LeetArchive/git/blobs with {} -> 500 Internal Server Error
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      headers: new Headers(),
      json: async () => ({ message: 'Internal Server Error' }),
    });

    const validator = new RepositoryValidator('github_pat_11AAAAAAA_valid');
    const report = await validator.validateRepositoryScope('Jackeryz/LeetArchive');

    expect(report.isValid).toBe(false);
    expect(report.hasWritePermission).toBe(false);
    expect(report.status).toBe('repository-inaccessible');
    expect(report.formattedOutput).toContain('✕ Repository authorization error');
    expect(report.formattedOutput).not.toContain('Contents: Read & Write');
  });

  // Test 6: Request-body safety test
  it('Step 3 (Test 6): REQUEST-BODY SAFETY TEST ? verifies probe body is strictly {} without content or repo code', async () => {
    // 1st fetch: GET /user -> 200 OK
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ login: 'Jackeryz' }),
    });

    // 2nd fetch: GET /repos/Jackeryz/LeetArchive -> 200 OK metadata
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({
        id: 999,
        full_name: 'Jackeryz/LeetArchive',
        private: false,
        default_branch: 'main',
        permissions: { push: true, admin: false, pull: true },
      }),
    });

    // 3rd fetch: POST /repos/Jackeryz/LeetArchive/git/blobs -> 422
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 422,
      headers: new Headers(),
      json: async () => ({
        message: 'Validation Failed',
        errors: [{ resource: 'Blob', code: 'missing_field', field: 'content' }],
      }),
    });

    const validator = new RepositoryValidator('github_pat_11AAAAAAA_valid_scoped');
    await validator.validateRepositoryScope('Jackeryz/LeetArchive');

    expect(fetchMock).toHaveBeenCalledTimes(3);

    const probeCall = fetchMock.mock.calls[2];
    const [probeUrl, probeOptions] = probeCall;

    expect(probeUrl).toBe('https://api.github.com/repos/Jackeryz/LeetArchive/git/blobs');
    expect(probeOptions.method).toBe('POST');
    expect(probeOptions.body).toBe('{}');

    // Parse the payload and verify strict non-destructive properties
    const parsedPayload = JSON.parse(probeOptions.body);
    expect(parsedPayload).toEqual({});
    expect(parsedPayload.content).toBeUndefined();
    expect(Object.keys(parsedPayload)).toHaveLength(0);
  });

  // Test 7: Helper function tests for isMissingContentValidationError
  describe('isMissingContentValidationError helper unit tests', () => {
    it('returns true when GitHub returns missing_field error for content', () => {
      const resp: ApiResponse<unknown> = {
        data: null,
        status: 422,
        scopesHeader: null,
        errorMessage: 'Validation Failed',
        errorDetails: {
          message: 'Validation Failed',
          errors: [{ resource: 'Blob', code: 'missing_field', field: 'content' }],
        },
      };
      expect(isMissingContentValidationError(resp)).toBe(true);
    });

    it('returns true when GitHub errors array contains string missing content', () => {
      const resp: ApiResponse<unknown> = {
        data: null,
        status: 422,
        scopesHeader: null,
        errorMessage: 'Validation Failed',
        errorDetails: {
          message: 'Validation Failed',
          errors: ['content is required'],
        },
      };
      expect(isMissingContentValidationError(resp)).toBe(true);
    });

    it('returns false when 422 error is for a different field (e.g. encoding)', () => {
      const resp: ApiResponse<unknown> = {
        data: null,
        status: 422,
        scopesHeader: null,
        errorMessage: 'Validation Failed',
        errorDetails: {
          message: 'Validation Failed',
          errors: [{ resource: 'Blob', code: 'invalid', field: 'encoding' }],
        },
      };
      expect(isMissingContentValidationError(resp)).toBe(false);
    });

    it('returns false when status is not 422', () => {
      const resp: ApiResponse<unknown> = {
        data: null,
        status: 403,
        scopesHeader: null,
        errorMessage: 'Forbidden',
        errorDetails: { message: 'Resource not accessible by personal access token' },
      };
      expect(isMissingContentValidationError(resp)).toBe(false);
    });

    it('returns false when 422 has empty errors array and generic message', () => {
      const resp: ApiResponse<unknown> = {
        data: null,
        status: 422,
        scopesHeader: null,
        errorMessage: 'Unprocessable Entity',
        errorDetails: { message: 'Unprocessable Entity', errors: [] },
      };
      expect(isMissingContentValidationError(resp)).toBe(false);
    });
  });

  it('Step 4: fails when token lacks Contents write access (permissions.push is false)', async () => {
    // 1st fetch: GET /user -> 200 OK
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ login: 'octocat' }),
    });

    // 2nd fetch: GET /repos/octocat/ReadOnlyRepo -> 200 OK metadata (push is false)
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

    // 3rd fetch: POST /repos/octocat/ReadOnlyRepo/git/blobs -> 422
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 422,
      headers: new Headers(),
      json: async () => ({
        message: 'Validation Failed',
        errors: [{ resource: 'Blob', code: 'missing_field', field: 'content' }],
      }),
    });

    const validator = new RepositoryValidator('github_pat_11AAAAAAA_readonly');
    const report = await validator.validateRepositoryScope('octocat/ReadOnlyRepo');

    expect(report.isValid).toBe(false);
    expect(report.hasWritePermission).toBe(false);
    expect(report.status).toBe('read-only');
    expect(report.formattedOutput).toContain('✕ Write permission required');
    expect(report.formattedOutput).toContain('Contents → Read & Write');
  });
});
