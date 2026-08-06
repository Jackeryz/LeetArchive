import { TokenSecurity } from '../security/token';
import { logger } from '../utils/logger';

export class SecretsStorage {
  private static SECRET_KEY = 'leetarchive_github_secret_token';

  /**
   * Securely stores token credentials in chrome.storage.local.
   */
  static async setToken(token: string): Promise<void> {
    if (typeof chrome === 'undefined' || !chrome.storage) return;

    logger.info(`Storing credential (${TokenSecurity.maskToken(token)})`);
    return new Promise((resolve) => {
      chrome.storage.local.set({ [this.SECRET_KEY]: token }, () => resolve());
    });
  }

  /**
   * Retrieves stored token.
   */
  static async getToken(): Promise<string | null> {
    if (typeof chrome === 'undefined' || !chrome.storage) return null;

    return new Promise((resolve) => {
      chrome.storage.local.get([this.SECRET_KEY], (res) => {
        resolve((res[this.SECRET_KEY] as string) || null);
      });
    });
  }

  /**
   * Clears stored credentials.
   */
  static async clearSecrets(): Promise<void> {
    if (typeof chrome === 'undefined' || !chrome.storage) return;

    return new Promise((resolve) => {
      chrome.storage.local.remove([this.SECRET_KEY], () => resolve());
    });
  }
}
