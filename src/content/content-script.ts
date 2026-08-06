import { EventBus } from '../core/events';
import { LeetCodeObserver } from '../leetcode/observer';
import { SolutionExtractor } from '../leetcode/extractor';
import { ArchiveGenerator } from '../leetcode/archive-generator';
import { AccountVerifier } from '../leetcode/account-verifier';
import { GitHubPublisher } from '../github/publisher';
import { logger } from '../utils/logger';

logger.info('LeetArchive Content Script Loaded on LeetCode');

const eventBus = EventBus.getInstance();
const observer = new LeetCodeObserver();
const extractor = new SolutionExtractor();
const archiveGenerator = new ArchiveGenerator();
const accountVerifier = new AccountVerifier();
const publisher = new GitHubPublisher();

// Subscribe to SubmissionDetected events for modular decoupling
eventBus.subscribe('SubmissionDetected', (event) => {
  logger.info(`[EventBus] SubmissionDetected event emitted: ${JSON.stringify(event.payload)}`);
});

// Subscribe to SolutionExtracted events for modular decoupling
eventBus.subscribe('SolutionExtracted', (event) => {
  logger.info(`[EventBus] SolutionExtracted event emitted: ${JSON.stringify(event.payload)}`);
});

// Subscribe to ArchiveGenerated events for modular decoupling
eventBus.subscribe('ArchiveGenerated', (event) => {
  logger.info(`[EventBus] ArchiveGenerated event emitted: ${JSON.stringify(event.payload)}`);
});

// Subscribe to AccountVerified events for modular decoupling
eventBus.subscribe('AccountVerified', (event) => {
  logger.info(`[EventBus] AccountVerified event emitted: ${JSON.stringify(event.payload)}`);
});

// Subscribe to ArchivePublished events for modular decoupling
eventBus.subscribe('ArchivePublished', (event) => {
  logger.info(`[EventBus] ArchivePublished event emitted: ${JSON.stringify(event.payload)}`);
});

// Start monitoring DOM for accepted submissions, extraction, archiving, verification, and publishing
observer.start();
extractor.start();
archiveGenerator.start();
accountVerifier.start();
publisher.start();

// Clean up listeners when page unloads or navigates away
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    observer.stop();
    extractor.stop();
    archiveGenerator.stop();
    accountVerifier.stop();
    publisher.stop();
  });
}
