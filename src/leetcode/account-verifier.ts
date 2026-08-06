import { AccountVerifiedPayload, ArchiveGeneratedPayload, EventBus } from '../core/events';
import { SettingsStorage } from '../storage/settings';
import { logger } from '../utils/logger';
import { LeetCodeAccountDetector } from './account-detector';

/**
 * Service responsible for verifying that the currently logged-in LeetCode user matches
 * the user's configured linked LeetCode account before publishing AccountVerified.
 */
export class AccountVerifier {
  private unsubscribe: (() => void) | null = null;
  private isListening: boolean = false;

  /**
   * Starts listening for ArchiveGenerated events on the EventBus.
   */
  start(): void {
    if (this.isListening) {
      logger.debug('[AccountVerifier] Already listening for ArchiveGenerated events.');
      return;
    }

    logger.debug('[AccountVerifier] Starting account verifier listener...');
    this.isListening = true;

    this.unsubscribe = EventBus.getInstance().subscribe<ArchiveGeneratedPayload>(
      'ArchiveGenerated',
      (event) => {
        this.verifyAndPublish(event.payload);
      },
    );
  }

  /**
   * Verifies the currently logged-in LeetCode account against configured settings
   * and emits AccountVerified upon successful match.
   */
  public async verifyAndPublish(
    archivePayload: ArchiveGeneratedPayload,
    doc?: Document | string,
  ): Promise<AccountVerifiedPayload | null> {
    logger.debug(
      `[AccountVerifier] ArchiveGenerated received for problem '${archivePayload.problemSlug}'`,
    );

    const settings = await SettingsStorage.getSettings();
    const configured = settings.leetcodeUsername;

    if (!configured || !configured.trim()) {
      logger.warn(
        `[AccountVerifier] Verification skipped: No configured/linked LeetCode username in settings for '${archivePayload.problemSlug}'`,
      );
      return null;
    }

    logger.debug('[AccountVerifier] Detecting current LeetCode account...');
    const detected = LeetCodeAccountDetector.detectCurrentAccount(doc);

    if (!detected) {
      logger.warn(
        `[AccountVerifier] Account verification failed: Could not detect currently logged-in LeetCode username for '${archivePayload.problemSlug}'`,
      );
      return null;
    }

    const configuredNorm = configured.trim().toLowerCase();
    const detectedNorm = detected.trim().toLowerCase();

    if (configuredNorm !== detectedNorm) {
      logger.warn(`[AccountVerifier] Detected: ${detected}`);
      logger.warn(`[AccountVerifier] Configured: ${configured}`);
      logger.warn('[AccountVerifier] Account verification failed');
      logger.warn('[AccountVerifier] Archive will not be published');
      return null;
    }

    logger.debug(`[AccountVerifier] Detected: ${detected}`);
    logger.debug(`[AccountVerifier] Configured: ${configured}`);
    logger.debug('[AccountVerifier] Account verified');

    const verifiedPayload: AccountVerifiedPayload = {
      username: detected.trim(),
      archive: archivePayload,
      verifiedAt: Date.now(),
    };

    logger.debug('[AccountVerifier] Publishing AccountVerified');
    EventBus.getInstance().publish('AccountVerified', verifiedPayload);
    return verifiedPayload;
  }

  /**
   * Stops listening for events and cleans up subscriptions.
   */
  stop(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.isListening = false;
    logger.debug('[AccountVerifier] Stopped account verifier listener.');
  }
}
