import { EventBus } from '../core/events';
import { logger } from '../utils/logger';

logger.info('LeetArchive Content Script Loaded');

const eventBus = EventBus.getInstance();

eventBus.subscribe('SubmissionDetected', (event) => {
  logger.info(`EventBus SubmissionDetected: ${JSON.stringify(event.payload)}`);
});
