import { EventBus } from '../core/events';
import { LeetCodeObserver } from '../leetcode/observer';
import { SolutionExtractor } from '../leetcode/extractor';
import { logger } from '../utils/logger';

logger.info('LeetArchive Content Script Loaded on LeetCode');

const eventBus = EventBus.getInstance();
const observer = new LeetCodeObserver();
const extractor = new SolutionExtractor();

// Subscribe to SubmissionDetected events for modular decoupling
eventBus.subscribe('SubmissionDetected', (event) => {
  logger.info(`[EventBus] SubmissionDetected event emitted: ${JSON.stringify(event.payload)}`);
});

// Subscribe to SolutionExtracted events for modular decoupling
eventBus.subscribe('SolutionExtracted', (event) => {
  logger.info(`[EventBus] SolutionExtracted event emitted: ${JSON.stringify(event.payload)}`);
});

// Start monitoring DOM for accepted submissions and solution extraction
observer.start();
extractor.start();

// Clean up observer and extractor when page unloads or navigates away
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    observer.stop();
    extractor.stop();
  });
}
