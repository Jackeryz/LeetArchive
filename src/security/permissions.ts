import { logger } from '../utils/logger';

export interface ScopeCheckResult {
  hasRepoAccess: boolean;
  isFineGrained: boolean;
  scopes: string[];
  warning?: string;
}

export class PermissionSecurity {
  /**
   * Parses x-oauth-scopes header returned by GitHub API response.
   * Note: Fine-Grained PATs do NOT return x-oauth-scopes header in GitHub API responses.
   */
  static parseOAuthScopes(scopesHeader: string | null): string[] {
    if (!scopesHeader) return [];
    return scopesHeader.split(',').map((s) => s.trim());
  }

  /**
   * Evaluates permissions from API headers.
   * Documents limitations regarding GitHub Fine-Grained PAT scope inspection.
   */
  static evaluateScopes(scopesHeader: string | null): ScopeCheckResult {
    if (scopesHeader === null) {
      logger.info(
        'x-oauth-scopes header absent. Token may be a Fine-Grained PAT or GitHub App installation token.',
      );
      return {
        hasRepoAccess: true, // Will be verified via explicit repo endpoint write probe
        isFineGrained: true,
        scopes: [],
        warning:
          'Fine-Grained PAT detected: GitHub API does not publish scope headers for fine-grained tokens. Direct endpoint authorization will be probed.',
      };
    }

    const scopes = this.parseOAuthScopes(scopesHeader);
    const hasRepoAccess = scopes.includes('repo') || scopes.includes('public_repo');

    return {
      hasRepoAccess,
      isFineGrained: false,
      scopes,
    };
  }
}
