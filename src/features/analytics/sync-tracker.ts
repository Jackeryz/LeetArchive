import { CacheStorage } from '../../storage/cache';
import { SyncLogEntry } from '../../types/leetcode';
import { logger } from '../../utils/logger';

export class AnalyticsFeature {
  /**
   * Records sync telemetry locally.
   */
  static async recordSyncEvent(entry: SyncLogEntry): Promise<void> {
    logger.info(`AnalyticsFeature recording sync event: ${entry.status} for ${entry.problemTitle}`);
    await CacheStorage.appendSyncLog(entry);
  }

  /**
   * Retrieves aggregated sync success rate.
   */
  static async getSuccessRate(): Promise<number> {
    const history = await CacheStorage.getSyncHistory();
    if (history.length === 0) return 100;
    const successful = history.filter((h) => h.status === 'success').length;
    return Math.round((successful / history.length) * 100);
  }
}
