import { EventBus } from '../core/events';
import { LeetCodeObserver } from '../leetcode/observer';
import { logger } from '../utils/logger';

logger.info('LeetArchive Content Script Loaded on LeetCode');

const eventBus = EventBus.getInstance();
const observer = new LeetCodeObserver();

// Subscribe to SubmissionDetected events for modular decoupling
eventBus.subscribe('SubmissionDetected', (event) => {
  logger.info(`[EventBus] SubmissionDetected event emitted: ${JSON.stringify(event.payload)}`);
});

// Start monitoring DOM for accepted submissions
observer.start();

// Clean up observer when page unloads or navigates away
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    observer.stop();
  });
}
