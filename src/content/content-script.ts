import { EventBus } from '../core/events';
import { LeetCodeObserver } from '../leetcode/observer';
import { SolutionExtractor } from '../leetcode/extractor';
import { ArchiveGenerator } from '../leetcode/archive-generator';
import { AccountVerifier } from '../leetcode/account-verifier';
import { PushDecisionCoordinator } from '../leetcode/push-decision-coordinator';
import { PushNotificationUI } from '../leetcode/push-notification-ui';
import { GitHubPublisher } from '../github/publisher';
import { logger } from '../utils/logger';

logger.info('LeetArchive Content Script Loaded on LeetCode');

const eventBus = EventBus.getInstance();
const observer = new LeetCodeObserver();
const extractor = new SolutionExtractor();
const archiveGenerator = new ArchiveGenerator();
const accountVerifier = new AccountVerifier();
const pushCoordinator = new PushDecisionCoordinator();
const pushUI = new PushNotificationUI();
const publisher = new GitHubPublisher();

// Subscribe to events for debugging/logging
eventBus.subscribe('SubmissionDetected', (event) => {
  logger.info(`[EventBus] SubmissionDetected event emitted: ${JSON.stringify(event.payload)}`);
});

eventBus.subscribe('SolutionExtracted', (event) => {
  logger.info(`[EventBus] SolutionExtracted event emitted: ${JSON.stringify(event.payload)}`);
});

eventBus.subscribe('ArchiveGenerated', (event) => {
  logger.info(`[EventBus] ArchiveGenerated event emitted: ${JSON.stringify(event.payload)}`);
});

eventBus.subscribe('AccountVerified', (event) => {
  logger.info(`[EventBus] AccountVerified event emitted: ${JSON.stringify(event.payload)}`);
});

eventBus.subscribe('PushPromptRequested', (event) => {
  logger.info(`[EventBus] PushPromptRequested event emitted: ${JSON.stringify(event.payload)}`);
});

eventBus.subscribe('PushRequested', (event) => {
  logger.info(`[EventBus] PushRequested event emitted: ${JSON.stringify(event.payload)}`);
});

eventBus.subscribe('PushCancelled', (event) => {
  logger.info(`[EventBus] PushCancelled event emitted: ${JSON.stringify(event.payload)}`);
});

eventBus.subscribe('ArchivePublished', (event) => {
  logger.info(`[EventBus] ArchivePublished event emitted: ${JSON.stringify(event.payload)}`);
});

eventBus.subscribe('ArchivePublishFailed', (event) => {
  logger.info(`[EventBus] ArchivePublishFailed event emitted: ${JSON.stringify(event.payload)}`);
});

// Start monitoring DOM and processing pipeline
observer.start();
extractor.start();
archiveGenerator.start();
accountVerifier.start();
pushCoordinator.start();
pushUI.start();
publisher.start();

// Clean up listeners when page unloads or navigates away
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    observer.stop();
    extractor.stop();
    archiveGenerator.stop();
    accountVerifier.stop();
    pushCoordinator.stop();
    pushUI.stop();
    publisher.stop();
  });
}
