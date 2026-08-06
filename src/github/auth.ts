import { AuthState, GitHubUser } from '../types/github';
import { GitHubApiBase } from './api';
import { SecretsStorage } from '../storage/secrets';
import { SettingsStorage } from '../storage/settings';
import { TokenSecurity } from '../security/token';
import { logger } from '../utils/logger';

export class GitHubAuthService extends GitHubApiBase {
  constructor(token: string = '') {
    super(token);
  }

  /**
   * Validates a Personal Access Token (PAT) by making a GET /user API call.
   */
  async validateToken(token?: string): Promise<{ user: GitHubUser | null; error?: string }> {
    const targetToken = TokenSecurity.sanitizeToken(token || this.getToken());
    if (!TokenSecurity.isValidTokenFormat(targetToken)) {
      logger.warn('Token syntax format is invalid');
      return {
        user: null,
        error: 'Token syntax format is invalid. Fine-Grained PATs start with github_pat_',
      };
    }

    logger.info(`Validating token (${TokenSecurity.maskToken(targetToken)}) via GET /user...`);
    const api = targetToken === this.getToken() ? this : new GitHubApiBase(targetToken);
    const response = await api.fetchApi<GitHubUser>('/user');

    if (response.status === 200 && response.data) {
      logger.info(`Successfully authenticated as GitHub user: ${response.data.login}`);
      return { user: response.data };
    }

    const err = response.errorMessage || `Authentication failed with status ${response.status}`;
    logger.warn(`Token validation failed: ${err}`);
    return { user: null, error: err };
  }

  /**
   * Stores credentials securely.
   */
  async saveCredentials(token: string): Promise<void> {
    const sanitized = TokenSecurity.sanitizeToken(token);
    await SecretsStorage.setToken(sanitized);
  }

  /**
   * Logs out user and clears stored credentials & settings.
   */
  async logout(): Promise<AuthState> {
    await SecretsStorage.clearSecrets();
    await SettingsStorage.saveSettings({ selectedRepo: null });

    return {
      isAuthenticated: false,
      accessToken: null,
      user: null,
      selectedRepo: null,
    };
  }
}
