import { logger } from '../utils/logger';

export class SecurityValidation {
  /**
   * Sanitizes file paths to prevent directory traversal vulnerabilities (e.g., ../../path).
   */
  static sanitizeFilePath(path: string): string {
    if (!path) return '';

    // Remove null bytes
    let sanitized = path.replace(/\0/g, '');

    // Replace backslashes with forward slashes
    sanitized = sanitized.replace(/\\/g, '/');

    // Prevent path traversal sequences
    sanitized = sanitized.replace(/\.\.\//g, '');

    // Trim leading and trailing slashes
    sanitized = sanitized.replace(/^\/+|\/+$/g, '');

    logger.debug(`Sanitized path '${path}' -> '${sanitized}'`);
    return sanitized;
  }

  /**
   * Sanitizes repository name input by trimming and removing unexpected newlines or control characters.
   */
  static sanitizeRepoName(repoFullName: string): string {
    if (!repoFullName) return '';
    return repoFullName.trim().replace(/[\r\n\t]+/g, '');
  }

  /**
   * Parses and validates a GitHub repository URL or short "owner/repo" string.
   * Supports:
   *  - https://github.com/Jackson/leetcode-solutions
   *  - https://github.com/Jackson/leetcode-solutions/
   *  - https://github.com/Jackson/leetcode-solutions.git
   *  - Jackson/leetcode-solutions
   */
  static parseGitHubRepoUrl(
    input: string,
  ): { owner: string; repo: string; fullName: string } | null {
    if (!input) return null;
    let clean = input.trim().replace(/[\r\n\t]+/g, '');

    // Remove query parameters or hash fragments
    clean = clean.split('?')[0].split('#')[0];

    // Remove trailing slashes
    clean = clean.replace(/\/+$/g, '');

    // Strip protocol and domain if present
    clean = clean.replace(/^(https?:\/\/)?(www\.)?github\.com\//i, '');

    // Remove .git suffix if present
    clean = clean.replace(/\.git$/i, '');

    // Remove leading slashes
    clean = clean.replace(/^\/+/g, '');

    const parts = clean.split('/');
    if (parts.length !== 2) return null;

    const owner = parts[0].trim();
    const repo = parts[1].trim();

    // Regex rules for valid GitHub username/organization and repository names
    const validOwnerRegex = /^[a-zA-Z0-9](?:[a-zA-Z0-9]|-)*[a-zA-Z0-9]$|^[a-zA-Z0-9]$/;
    const validRepoRegex = /^[a-zA-Z0-9_.-]+$/;

    if (!owner || !repo || !validOwnerRegex.test(owner) || !validRepoRegex.test(repo)) {
      return null;
    }

    return {
      owner,
      repo,
      fullName: `${owner}/${repo}`,
    };
  }

  /**
   * Validates target repository format "owner/repo".
   */
  static isValidRepoFormat(repoFullName: string): boolean {
    return Boolean(this.parseGitHubRepoUrl(repoFullName));
  }

  /**
   * Escapes unsafe HTML characters to prevent XSS in extension UI views.
   */
  static escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
