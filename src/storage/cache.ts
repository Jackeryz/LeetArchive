import { SyncLogEntry } from '../types/leetcode';
import { STORAGE_KEYS } from '../utils/constants';

export class CacheStorage {
  static async getSyncHistory(): Promise<SyncLogEntry[]> {
    if (typeof chrome === 'undefined' || !chrome.storage) return [];
    return new Promise((resolve) => {
      chrome.storage.local.get([STORAGE_KEYS.SYNC_HISTORY], (res) => {
        resolve((res[STORAGE_KEYS.SYNC_HISTORY] as SyncLogEntry[]) || []);
      });
    });
  }

  static async appendSyncLog(log: SyncLogEntry): Promise<void> {
    if (typeof chrome === 'undefined' || !chrome.storage) return;
    const history = await this.getSyncHistory();
    history.unshift(log);
    const trimmed = history.slice(0, 50);

    return new Promise((resolve) => {
      chrome.storage.local.set({ [STORAGE_KEYS.SYNC_HISTORY]: trimmed }, () => resolve());
    });
  }
}
