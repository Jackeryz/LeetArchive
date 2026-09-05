import {
  AccountVerifiedPayload,
  ArchiveGeneratedPayload,
  ArchivePublishedPayload,
  ArchivePublishFailedPayload,
  EventBus,
  PushCancelledPayload,
  PushPromptRequestedPayload,
  PushRequestedPayload,
  SolutionExtractedPayload,
  SubmissionDetectedPayload,
} from '../core/events';
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

// Subscribe to events for debugging/logging safely without logging raw source code
eventBus.subscribe<SubmissionDetectedPayload>('SubmissionDetected', (event) => {
  logger.info(
    `[EventBus] SubmissionDetected: slug='${event.payload.problemSlug}', lang='${event.payload.language}', subId='${event.payload.submissionId || 'none'}'`,
  );
});

eventBus.subscribe<SolutionExtractedPayload>('SolutionExtracted', (event) => {
  const code = event.payload.code || '';
  logger.info(
    `[EventBus] SolutionExtracted: slug='${event.payload.problemSlug}', lang='${event.payload.language}', len=${code.length}`,
  );
});

eventBus.subscribe<ArchiveGeneratedPayload>('ArchiveGenerated', (event) => {
  logger.info(
    `[EventBus] ArchiveGenerated: slug='${event.payload.problemSlug}', mode='${event.payload.archiveMode}', files=${event.payload.files.length}`,
  );
});

eventBus.subscribe<AccountVerifiedPayload>('AccountVerified', (event) => {
  logger.info(
    `[EventBus] AccountVerified: username='${event.payload.username}', slug='${event.payload.archive.problemSlug}'`,
  );
});

eventBus.subscribe<PushPromptRequestedPayload>('PushPromptRequested', (event) => {
  logger.info(`[EventBus] PushPromptRequested: reqId='${event.payload.requestId}'`);
});

eventBus.subscribe<PushRequestedPayload>('PushRequested', (event) => {
  logger.info(
    `[EventBus] PushRequested: reqId='${event.payload.requestId}', slug='${event.payload.verifiedPayload.archive.problemSlug}', files=${event.payload.verifiedPayload.archive.files.length}`,
  );
});

eventBus.subscribe<PushCancelledPayload>('PushCancelled', (event) => {
  logger.info(
    `[EventBus] PushCancelled: reqId='${event.payload.requestId}', reason='${event.payload.reason}'`,
  );
});

eventBus.subscribe<ArchivePublishedPayload>('ArchivePublished', (event) => {
  logger.info(
    `[EventBus] ArchivePublished: repo='${event.payload.repository}', commitSha='${event.payload.commitSha}', committedFiles=${event.payload.committedFiles}`,
  );
});

eventBus.subscribe<ArchivePublishFailedPayload>('ArchivePublishFailed', (event) => {
  logger.info(
    `[EventBus] ArchivePublishFailed: reqId='${event.payload.requestId}', error='${event.payload.error}'`,
  );
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
