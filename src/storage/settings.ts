import { DEFAULT_USER_SETTINGS } from '../core/config';
import { STORAGE_KEYS } from '../utils/constants';
import { UserExtensionSettings } from '../types/leetcode';
import { logger } from '../utils/logger';

export class SettingsStorage {
  static async getSettings(): Promise<UserExtensionSettings> {
    if (typeof chrome === 'undefined' || !chrome.storage) {
      logger.warn('chrome.storage API unavailable, returning default settings');
      return { ...DEFAULT_USER_SETTINGS };
    }

    return new Promise((resolve) => {
      chrome.storage.sync.get([STORAGE_KEYS.SETTINGS], (result) => {
        const stored = result[STORAGE_KEYS.SETTINGS] as UserExtensionSettings;
        resolve({ ...DEFAULT_USER_SETTINGS, ...stored });
      });
    });
  }

  static async saveSettings(settings: Partial<UserExtensionSettings>): Promise<void> {
    if (typeof chrome === 'undefined' || !chrome.storage) return;

    const current = await this.getSettings();
    const updated = { ...current, ...settings };

    return new Promise((resolve) => {
      chrome.storage.sync.set({ [STORAGE_KEYS.SETTINGS]: updated }, () => {
        logger.info('Settings stored successfully in sync storage');
        resolve();
      });
    });
  }
}
