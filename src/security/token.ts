import { logger } from '../utils/logger';

export type TokenType = 'ClassicPAT' | 'FineGrainedPAT' | 'GitHubAppToken' | 'Unknown';

export class TokenSecurity {
  /**
   * Identifies the type of GitHub token provided.
   */
  static classifyToken(token: string): TokenType {
    const clean = this.sanitizeToken(token);
    if (!clean) return 'Unknown';
    if (clean.startsWith('github_pat_')) return 'FineGrainedPAT';
    if (clean.startsWith('ghp_')) return 'ClassicPAT';
    if (clean.startsWith('ghs_')) return 'GitHubAppToken';
    return 'Unknown';
  }

  /**
   * Sanitizes token string by removing accidental whitespace, newlines, and tabs.
   */
  static sanitizeToken(token: string): string {
    if (!token) return '';
    return token.replace(/[\r\n\t ]+/g, '');
  }

  /**
   * Validates token syntax formatting.
   */
  static isValidTokenFormat(token: string): boolean {
    const clean = this.sanitizeToken(token);
    if (!clean) return false;
    return clean.startsWith('ghp_') || clean.startsWith('github_pat_') || clean.startsWith('ghs_');
  }

  /**
   * Masks token string for safe logging and UI display.
   */
  static maskToken(token: string): string {
    const clean = this.sanitizeToken(token);
    if (!clean || clean.length < 8) return '****';
    const prefix = clean.slice(0, 7);
    const suffix = clean.slice(-4);
    return `${prefix}...${suffix}`;
  }

  /**
   * Verifies if token requires additional repository scope checks.
   */
  static requiresRepoScopeVerification(token: string): boolean {
    const type = this.classifyToken(token);
    logger.info(`Token type evaluated as ${type}`);
    return type === 'FineGrainedPAT' || type === 'ClassicPAT';
  }
}
