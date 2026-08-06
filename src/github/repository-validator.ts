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
    owner: string;
    repo: string;
    isPrivate: boolean;
    defaultBranch: string;
  } | null;
  errors: string[];
  warnings: string[];
  formattedOutput: string;
}

/**
 * Validates target repository accessibility under least-privilege principles.
 * Ensures token can write to the specified target repository without requesting broader permissions.
 */
export class RepositoryValidator extends GitHubApiBase {
  /**
   * Performs a comprehensive 5-step validation of the GitHub publishing configuration:
   * 1. Validate PAT (GET /user)
   * 2. Verify Repository existence
   * 3. Verify Repository Access (Fine-grained PAT repository scope selection)
   * 4. Detect Default Branch
   * 5. Verify Write Permission (Contents: Read & Write)
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
      formattedOutput: '',
    };

    const sanitizedRepo = SecurityValidation.sanitizeRepoName(repoFullName);
    if (!SecurityValidation.isValidRepoFormat(sanitizedRepo)) {
      const err = `❌ Invalid repository format: '${repoFullName}'. Expected 'owner/repo'.`;
      report.errors.push(err);
      report.formattedOutput = err;
      return report;
    }

    const [owner, repo] = sanitizedRepo.split('/');
    logger.info(`Beginning comprehensive configuration validation for: ${owner}/${repo}`);

    // STEP 1: Validate PAT
    const userResp = await this.fetchApi<{ login: string }>('/user');
    if (userResp.status !== 200 || !userResp.data) {
      const step1Error = '❌ Invalid GitHub Personal Access Token';
      report.errors.push(step1Error);
      report.formattedOutput = step1Error;
      return report;
    }
    report.tokenValid = true;

    // Check scope warnings if headers present
    const scopeCheck = PermissionSecurity.evaluateScopes(userResp.scopesHeader);
    if (scopeCheck.warning) {
      report.warnings.push(scopeCheck.warning);
    }

    // STEP 2 & STEP 3: Query Repository with PAT
    const repoResp = await this.fetchApi<{
      id: number;
      full_name: string;
      private: boolean;
      default_branch: string;
      permissions?: { push: boolean; admin: boolean; pull: boolean };
    }>(`/repos/${owner}/${repo}`);

    if (repoResp.status === 404) {
      // Differentiate Step 2 (Repo not found) vs Step 3 (PAT cannot access this repository)
      // Check unauthenticated GET request to see if repository exists publicly on GitHub
      let repoExistsPublicly = false;
      try {
        const publicCheck = await fetch(`https://api.github.com/repos/${owner}/${repo}`);
        if (publicCheck.status === 200) {
          repoExistsPublicly = true;
        }
      } catch (err: unknown) {
        logger.debug(
          `Public repo check failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      if (repoExistsPublicly) {
        // Repository exists publicly, but PAT returned 404 (Fine-grained PAT missing repo selection)
        const step3Error = `❌ Personal Access Token cannot access this repository.\n\nRepository:\n${owner}/${repo}\n\nGrant this repository access in your Fine-grained Personal Access Token.`;
        report.errors.push(step3Error);
        report.formattedOutput = step3Error;
        return report;
      } else {
        // Repository does not exist or is private without access
        const step2Error = `❌ Repository not found\n\nVerify the repository URL.`;
        report.errors.push(step2Error);
        report.formattedOutput = step2Error;
        return report;
      }
    }

    if (repoResp.status === 403 || (repoResp.status !== 200 && repoResp.status !== 404)) {
      const step3Error = `❌ Personal Access Token cannot access this repository.\n\nRepository:\n${owner}/${repo}\n\nGrant this repository access in your Fine-grained Personal Access Token.`;
      report.errors.push(step3Error);
      report.formattedOutput = step3Error;
      return report;
    }

    if (!repoResp.data) {
      const step2Error = `❌ Repository not found\n\nVerify the repository URL.`;
      report.errors.push(step2Error);
      report.formattedOutput = step2Error;
      return report;
    }

    report.repoExists = true;
    report.hasMetadataAccess = Boolean(repoResp.data.id && repoResp.data.full_name);

    // STEP 4: Detect Default Branch
    const defaultBranch = repoResp.data.default_branch || 'main';
    const finalFullName = repoResp.data.full_name || `${owner}/${repo}`;
    const [finalOwner, finalRepo] = finalFullName.split('/');

    report.repoDetails = {
      fullName: finalFullName,
      owner: finalOwner,
      repo: finalRepo,
      isPrivate: repoResp.data.private,
      defaultBranch: defaultBranch,
    };

    if (finalFullName.toLowerCase() !== sanitizedRepo.toLowerCase()) {
      report.warnings.push(
        `Repository '${sanitizedRepo}' was renamed on GitHub to '${finalFullName}'.`,
      );
    }

    // STEP 5: Verify Write Permission
    if (repoResp.data.permissions && repoResp.data.permissions.push === false) {
      const step5Error = `❌ Token does not have write access.\n\nRequired:\nContents → Read & Write`;
      report.errors.push(step5Error);
      report.formattedOutput = step5Error;
      return report;
    }

    report.hasWritePermission = true;
    report.isValid = true;

    // Success Screen Output
    report.formattedOutput = `✓ GitHub configuration verified\n\nRepository:\n${finalFullName}\n\nBranch:\n${defaultBranch}\n\nRepository access:\nVerified\n\nContents permission:\nRead & Write\n\nReady to archive LeetCode solutions.`;

    return report;
  }
}
