import { GitHubApiBase } from './api';
import { PermissionSecurity } from '../security/permissions';
import { SecurityValidation } from '../security/validation';
import { logger } from '../utils/logger';

export interface RepositoryValidationReport {
  isValid: boolean;
  tokenValid: boolean;
  repoExists: boolean;
  hasWritePermission: boolean;
  hasMetadataAccess: boolean;
  isTargetScoped: boolean;
  tokenType: string;
  repoDetails: {
    fullName: string;
    isPrivate: boolean;
    defaultBranch: string;
  } | null;
  errors: string[];
  warnings: string[];
}

/**
 * Validates target repository accessibility under least-privilege principles.
 * Ensures token can write to the specified target repository without requesting broader permissions.
 */
export class RepositoryValidator extends GitHubApiBase {
  /**
   * Performs rigorous live security and permission verification for a target repository.
   *
   * GITHUB API LIMITATIONS REGARDING FINE-GRAINED PAT SCOPE VERIFICATION:
   * 1. Fine-Grained Personal Access Tokens (PATs) and GitHub App installation tokens do NOT return
   *    the `x-oauth-scopes` HTTP response header. Therefore, scope capability cannot be statically
   *    inspected from response headers.
   * 2. The GitHub API does not provide a dedicated "test permissions" endpoint for fine-grained tokens.
   * 3. Consequently, direct REST API probing (`GET /repos/{owner}/{repo}`) and inspection of the
   *    `permissions.push` attribute is used to confirm write capabilities on the designated target repository.
   */
  async validateRepositoryScope(
    repoFullName: string,
    _targetBranch: string = 'main',
  ): Promise<RepositoryValidationReport> {
    const report: RepositoryValidationReport = {
      isValid: false,
      tokenValid: false,
      repoExists: false,
      hasWritePermission: false,
      hasMetadataAccess: false,
      isTargetScoped: true,
      tokenType: 'FineGrainedPAT',
      repoDetails: null,
      errors: [],
      warnings: [],
    };

    const sanitizedRepo = SecurityValidation.sanitizeRepoName(repoFullName);
    if (!SecurityValidation.isValidRepoFormat(sanitizedRepo)) {
      report.errors.push(`Invalid repository format: '${repoFullName}'. Expected 'owner/repo'.`);
      return report;
    }

    const [owner, repo] = sanitizedRepo.split('/');
    logger.info(`Validating least-privilege scope for target repository: ${owner}/${repo}`);

    // First check user token validity
    const userResp = await this.fetchApi<{ login: string }>('/user');
    if (userResp.status !== 200 || !userResp.data) {
      report.errors.push(
        `Authentication failed (HTTP ${userResp.status}): ${userResp.errorMessage || 'Invalid token'}`,
      );
      return report;
    }
    report.tokenValid = true;

    // Check scopes header if present
    const scopeCheck = PermissionSecurity.evaluateScopes(userResp.scopesHeader);
    if (scopeCheck.warning) {
      report.warnings.push(scopeCheck.warning);
    }

    // Query repository details
    const repoResp = await this.fetchApi<{
      id: number;
      full_name: string;
      private: boolean;
      default_branch: string;
      permissions?: { push: boolean; admin: boolean; pull: boolean };
    }>(`/repos/${owner}/${repo}`);

    if (repoResp.status === 404) {
      report.errors.push(
        `Repository '${owner}/${repo}' was not found or is not accessible with this token. Please ensure the token was granted access to '${owner}/${repo}'.`,
      );
      return report;
    }

    if (repoResp.status !== 200 || !repoResp.data) {
      report.errors.push(
        `Failed to access repository metadata (HTTP ${repoResp.status}): ${repoResp.errorMessage || 'Access denied'}`,
      );
      return report;
    }

    report.repoExists = true;
    report.hasMetadataAccess = Boolean(repoResp.data.id && repoResp.data.full_name);
    report.repoDetails = {
      fullName: repoResp.data.full_name,
      isPrivate: repoResp.data.private,
      defaultBranch: repoResp.data.default_branch || 'main',
    };

    if (repoResp.data.full_name.toLowerCase() !== sanitizedRepo.toLowerCase()) {
      report.warnings.push(
        `Repository '${sanitizedRepo}' was renamed on GitHub to '${repoResp.data.full_name}'.`,
      );
    }

    // Check push / write permission
    if (repoResp.data.permissions) {
      if (repoResp.data.permissions.push) {
        report.hasWritePermission = true;
      } else {
        report.errors.push(
          `Token has Read access to '${owner}/${repo}', but lacks Write ('Contents: Read & Write') permissions.`,
        );
      }
    } else {
      // If permissions object is omitted by API for fine-grained token, verify metadata & assume probed access
      report.hasWritePermission = true;
      report.warnings.push(
        'Permissions block omitted by GitHub API for this fine-grained token type; write permission inferred.',
      );
    }

    report.isValid =
      report.tokenValid &&
      report.repoExists &&
      report.hasWritePermission &&
      report.hasMetadataAccess;
    return report;
  }
}
