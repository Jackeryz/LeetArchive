import { ApiResponse, GitHubApiBase } from './api';
import { PermissionSecurity } from '../security/permissions';
import { SecurityValidation } from '../security/validation';
import { TokenSecurity } from '../security/token';
import { logger } from '../utils/logger';

export interface GitHubValidationErrorItem {
  resource?: string;
  field?: string;
  code?: string;
  message?: string;
}

export interface GitHubErrorPayload {
  message?: string;
  errors?: Array<GitHubValidationErrorItem | string>;
  documentation_url?: string;
}

/**
 * Verifies whether an HTTP 422 error from POST /repos/{owner}/{repo}/git/blobs
 * specifically corresponds to the intentionally omitted required `content` field.
 *
 * An empty payload `{}` passes authorization when the PAT has Contents: write,
 * but fails schema validation because `content` is required.
 */
export function isMissingContentValidationError(resp: ApiResponse<unknown>): boolean {
  if (resp.status !== 422) {
    return false;
  }

  const details = resp.errorDetails as GitHubErrorPayload | null | undefined;
  if (details && Array.isArray(details.errors) && details.errors.length > 0) {
    const hasContentMissing = details.errors.some((err) => {
      if (typeof err === 'string') {
        const lower = err.toLowerCase();
        return (
          lower.includes('content') &&
          (lower.includes('missing') || lower.includes('required') || lower.includes('empty'))
        );
      }
      if (typeof err === 'object' && err !== null) {
        const isContentField = err.field === 'content';
        const isMissingCode =
          err.code === 'missing_field' ||
          err.code === 'missing' ||
          err.code === 'required' ||
          (typeof err.message === 'string' &&
            (err.message.toLowerCase().includes('missing') ||
              err.message.toLowerCase().includes('required')));
        return isContentField && (isMissingCode || !err.code);
      }
      return false;
    });

    if (hasContentMissing) {
      return true;
    }
  }

  const msg = (resp.errorMessage || details?.message || '').toLowerCase();
  if (
    msg.includes('content') &&
    (msg.includes('missing') || msg.includes('required') || msg.includes('validation failed'))
  ) {
    return true;
  }

  return false;
}

export type ValidationStatus =
  'pat-invalid' | 'repository-not-found' | 'repository-inaccessible' | 'read-only' | 'valid';

export interface RepositoryValidationReport {
  isValid: boolean;
  status: ValidationStatus;
  tokenValid: boolean;
  repoExists: boolean;
  hasWritePermission: boolean;
  hasMetadataAccess: boolean;
  isTargetScoped: boolean;
  tokenType: string;
  authenticatedUser: string | null;
  contentsProbeStatus?: number;
  repoDetails: {
    fullName: string;
    owner: string;
    repo: string;
    isPrivate: boolean;
    defaultBranch: string;
    url: string;
  } | null;
  errors: string[];
  warnings: string[];
  formattedOutput: string;
}

/**
 * Validates target repository accessibility under least-privilege principles.
 * Directly verifies that the supplied PAT has authorization to access the repository's
 * Contents API, avoiding false positives from public visibility or repository ownership.
 */
export class RepositoryValidator extends GitHubApiBase {
  /**
   * Performs a comprehensive 5-step validation of the GitHub publishing configuration:
   * 1. Validate PAT (GET /user)
   * 2. Verify Repository existence & metadata (GET /repos/{owner}/{repo})
   * 3. Probe Contents:write authorization via non-destructive canary (POST /repos/{owner}/{repo}/git/blobs with {})
   * 4. Verify Write Permission (Contents: Read & Write)
   * 5. Detect Default Branch & finalize report
   */
  async validateRepositoryScope(
    repoFullName: string,
    _targetBranch: string = 'main',
  ): Promise<RepositoryValidationReport> {
    const report: RepositoryValidationReport = {
      isValid: false,
      status: 'repository-not-found',
      tokenValid: false,
      repoExists: false,
      hasWritePermission: false,
      hasMetadataAccess: false,
      isTargetScoped: true,
      tokenType: 'FineGrainedPAT',
      authenticatedUser: null,
      contentsProbeStatus: undefined,
      repoDetails: null,
      errors: [],
      warnings: [],
      formattedOutput: '',
    };

    const sanitizedRepo = SecurityValidation.sanitizeRepoName(repoFullName);
    if (!SecurityValidation.isValidRepoFormat(sanitizedRepo)) {
      const err = `❌ Invalid repository format: '${repoFullName}'. Expected 'owner/repo'.`;
      report.status = 'repository-not-found';
      report.errors.push(err);
      report.formattedOutput = err;
      return report;
    }

    const [owner, repo] = sanitizedRepo.split('/');
    logger.info(`Beginning comprehensive configuration validation for: ${owner}/${repo}`);
    logger.info(
      `[Diagnostic] Validator initialized with token fingerprint: ${TokenSecurity.maskToken(this.getToken())} (length: ${this.getToken().length})`,
    );

    // STEP 1: Validate PAT Authentication (GET /user)
    logger.info('[Diagnostic] Step 1: Calling GET /user...');
    const userResp = await this.fetchApi<{ login: string }>('/user');
    logger.info(
      `[Diagnostic] Step 1 Response: GET /user -> HTTP ${userResp.status} (login: ${userResp.data?.login || 'null'}, error: ${userResp.errorMessage || 'none'})`,
    );

    if (userResp.status !== 200 || !userResp.data) {
      report.status = 'pat-invalid';
      const step1Error = `✕ Invalid Personal Access Token\n\nGitHub rejected this token.\nCheck that the token is valid and has not expired.`;
      report.errors.push(step1Error);
      report.formattedOutput = step1Error;
      return report;
    }
    report.tokenValid = true;
    report.authenticatedUser = userResp.data.login;

    // Check scope warnings if headers present
    const scopeCheck = PermissionSecurity.evaluateScopes(userResp.scopesHeader);
    if (scopeCheck.warning) {
      report.warnings.push(scopeCheck.warning);
    }

    // STEP 2: Query Repository Metadata (GET /repos/{owner}/{repo})
    logger.info(`[Diagnostic] Step 2: Calling GET /repos/${owner}/${repo}...`);
    const repoResp = await this.fetchApi<{
      id: number;
      full_name: string;
      private: boolean;
      default_branch: string;
      permissions?: { push: boolean; admin: boolean; pull: boolean };
    }>(`/repos/${owner}/${repo}`);
    logger.info(
      `[Diagnostic] Step 2 Response: GET /repos/${owner}/${repo} -> HTTP ${repoResp.status} (private: ${repoResp.data?.private}, permissions.push: ${repoResp.data?.permissions?.push})`,
    );

    if (repoResp.status === 404) {
      report.status = 'repository-not-found';
      const step2Error = `✕ Repository not found\n\nWe couldn't find:\n${owner}/${repo}\n\nCheck the repository name and try again.`;
      report.errors.push(step2Error);
      report.formattedOutput = step2Error;
      return report;
    }

    if (repoResp.status === 403 || (repoResp.status !== 200 && repoResp.status !== 404)) {
      report.status = 'repository-inaccessible';
      const step2Error = `✕ Repository access unavailable\n\nYour Fine-grained PAT does not have access to:\n${owner}/${repo}\n\nUpdate your PAT's Repository access settings to include this repository, then validate again.`;
      report.errors.push(step2Error);
      report.formattedOutput = step2Error;
      return report;
    }

    if (!repoResp.data) {
      report.status = 'repository-not-found';
      const step2Error = `✕ Repository not found\n\nWe couldn't find:\n${owner}/${repo}\n\nCheck the repository name and try again.`;
      report.errors.push(step2Error);
      report.formattedOutput = step2Error;
      return report;
    }

    report.repoExists = true;
    report.hasMetadataAccess = Boolean(repoResp.data.id && repoResp.data.full_name);

    // STEP 3: Non-Destructive Contents:write Authorization Canary Probe
    // POST /repos/{owner}/{repo}/git/blobs with intentionally invalid body: {}
    // The request omits the required 'content' field and will NEVER create a blob, commit, or file.
    logger.info(`Step 3: Probing Contents write authorization canary for ${owner}/${repo}...`);
    const probeResp = await this.fetchApi<unknown>(`/repos/${owner}/${repo}/git/blobs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    report.contentsProbeStatus = probeResp.status;
    logger.info(
      `Step 3 Response: POST /repos/${owner}/${repo}/git/blobs -> HTTP ${probeResp.status} (${probeResp.errorMessage || 'none'})`,
    );

    if (probeResp.status === 401) {
      // Case C: Invalid or revoked PAT
      report.status = 'pat-invalid';
      report.isValid = false;
      const step3Error = `✕ Invalid Personal Access Token\n\nGitHub rejected this token during authorization check.\nCheck that the token is valid and has not expired.`;
      report.errors.push(step3Error);
      report.formattedOutput = step3Error;
      return report;
    }

    if (probeResp.status === 403) {
      // Case A: PAT does not have repository authorization
      report.status = 'repository-inaccessible';
      report.isValid = false;
      const step3Error = `✕ Repository access unavailable\n\nYour Fine-grained PAT does not have access to:\n${owner}/${repo}\n\nUpdate your PAT's Repository access settings to include this repository, then validate again.`;
      report.errors.push(step3Error);
      report.formattedOutput = step3Error;
      return report;
    }

    if (probeResp.status === 422) {
      // Case B: Verify that the response represents the expected missing 'content' parameter
      const isMissingContent = isMissingContentValidationError(probeResp);
      if (!isMissingContent) {
        // Unexpected 422 error: do NOT treat as authorized
        report.status = 'repository-inaccessible';
        report.isValid = false;
        const step3Error = `✕ Repository authorization verification failed\n\nUnexpected validation response while probing repository permissions for:\n${owner}/${repo}\n\nPlease check your Fine-grained PAT permissions and try again.`;
        report.errors.push(step3Error);
        report.formattedOutput = step3Error;
        return report;
      }
      // Successfully cleared repository authorization barrier!
      report.hasWritePermission = true;
    } else {
      // Case D: Any other unexpected status (e.g. 500, 404, etc.)
      report.status = 'repository-inaccessible';
      report.isValid = false;
      const step3Error = `✕ Repository authorization error (${probeResp.errorMessage || 'HTTP ' + probeResp.status})\n\nUnable to verify repository write permissions. Try again later.`;
      report.errors.push(step3Error);
      report.formattedOutput = step3Error;
      return report;
    }

    // STEP 4: Verify Contents Write Permission
    if (repoResp.data.permissions && repoResp.data.permissions.push === false) {
      report.status = 'read-only';
      report.hasWritePermission = false;
      report.isValid = false;
      const step4Error = `✕ Write permission required\n\nLeetArchive needs:\nContents → Read & Write\n\nfor this repository.\n\nUpdate your Fine-grained PAT permissions and validate again.`;
      report.errors.push(step4Error);
      report.formattedOutput = step4Error;
      return report;
    }

    // STEP 5: Detect Default Branch & Finalize Report
    const defaultBranch = repoResp.data.default_branch || 'main';
    const finalFullName = repoResp.data.full_name || `${owner}/${repo}`;
    const [finalOwner, finalRepo] = finalFullName.split('/');

    report.repoDetails = {
      fullName: finalFullName,
      owner: finalOwner,
      repo: finalRepo,
      isPrivate: repoResp.data.private,
      defaultBranch: defaultBranch,
      url: `https://github.com/${finalFullName}`,
    };

    if (finalFullName.toLowerCase() !== sanitizedRepo.toLowerCase()) {
      report.warnings.push(
        `Repository '${sanitizedRepo}' was renamed on GitHub to '${finalFullName}'.`,
      );
    }

    report.status = 'valid';
    report.hasWritePermission = true;
    report.isValid = true;

    // Success Screen Output
    report.formattedOutput = `✓ GitHub configuration verified\n\nGitHub account:\n@${report.authenticatedUser}\n\nRepository:\n${finalFullName}\n\nBranch:\n${defaultBranch}\n\nPermissions:\n✓ Repository access\n✓ Contents: Read & Write\n\nLeetArchive is ready to archive your solutions.`;

    logger.info(
      `[Diagnostic] Final Validator Outcome: status=${report.status}, isValid=${report.isValid}`,
    );
    return report;
  }
}
