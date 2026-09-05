import {
  AccountVerifiedPayload,
  EventBus,
  PushCancelledPayload,
  PushPromptRequestedPayload,
  PushRequestedPayload,
} from '../core/events';
import { SettingsStorage } from '../storage/settings';
import { logger } from '../utils/logger';

/**
 * Coordinator responsible for translating AccountVerified events into the appropriate next action
 * based on user-configured PushBehavior ('ask' | 'automatic' | 'never').
 * Contains no GitHub API or DOM logic.
 */
export class PushDecisionCoordinator {
  private unsubscribe: (() => void) | null = null;
  private isListening: boolean = false;

  /**
   * Starts listening for AccountVerified events on the EventBus.
   */
  start(): void {
    if (this.isListening) {
      logger.debug('[PushDecisionCoordinator] Already listening for AccountVerified events.');
      return;
    }

    logger.debug('[PushDecisionCoordinator] Starting decision coordinator listener...');
    this.isListening = true;

    this.unsubscribe = EventBus.getInstance().subscribe<AccountVerifiedPayload>(
      'AccountVerified',
      (event) => {
        void this.handleAccountVerified(event.payload);
      },
    );
  }

  /**
   * Translates an AccountVerified event into PushPromptRequested ('ask'), PushRequested ('automatic'),
   * or PushCancelled ('never') based on user settings.
   */
  public async handleAccountVerified(
    payload: AccountVerifiedPayload,
  ): Promise<'ask' | 'automatic' | 'never'> {
    const settings = await SettingsStorage.getSettings();
    const pushBehavior = settings.pushBehavior || 'ask';
    const requestId = `req_${payload.verifiedAt || Date.now()}_${payload.archive.problemSlug}`;

    logger.info(
      `[PushDecisionCoordinator] AccountVerified received for '${payload.archive.problemSlug}'. PushBehavior: '${pushBehavior}'`,
    );

    if (pushBehavior === 'automatic') {
      logger.info(
        `[PushDecisionCoordinator] Automatic mode: Publishing PushRequested for '${payload.archive.problemSlug}'`,
      );
      const pushPayload: PushRequestedPayload = {
        requestId,
        verifiedPayload: payload,
      };
      EventBus.getInstance().publish('PushRequested', pushPayload);
      return 'automatic';
    }

    if (pushBehavior === 'never') {
      logger.info(
        `[PushDecisionCoordinator] Never mode: Publishing PushCancelled for '${payload.archive.problemSlug}'`,
      );
      const cancelPayload: PushCancelledPayload = {
        requestId,
        problemTitle: payload.archive.problemTitle,
        problemSlug: payload.archive.problemSlug,
        reason: 'Push behavior configured as never',
      };
      EventBus.getInstance().publish('PushCancelled', cancelPayload);
      return 'never';
    }

    // Default 'ask' mode
    logger.info(
      `[PushDecisionCoordinator] Ask mode: Publishing PushPromptRequested for '${payload.archive.problemSlug}'`,
    );
    const promptPayload: PushPromptRequestedPayload = {
      requestId,
      verifiedPayload: payload,
      repository: settings.selectedRepo,
      branch: settings.branch || 'main',
    };
    EventBus.getInstance().publish('PushPromptRequested', promptPayload);
    return 'ask';
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
    logger.debug('[PushDecisionCoordinator] Stopped decision coordinator listener.');
  }
}
