import { SettingsStorage } from '../storage/settings';
import { EventBus } from '../core/events';
import { logger } from '../utils/logger';

logger.info('LeetArchive Background Service Worker Initialized');

const eventBus = EventBus.getInstance();

if (typeof chrome !== 'undefined' && chrome.runtime) {
  chrome.runtime.onInstalled.addListener((details) => {
    logger.info(`Extension installed/updated. Reason: ${details.reason}`);
    SettingsStorage.getSettings();
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    logger.info(`Service worker received message action: ${message.action}`);

    switch (message.action) {
      case 'GET_STATUS':
        sendResponse({ status: 'active', message: 'LeetArchive service worker running' });
        return false;

      default:
        logger.warn(`Unknown action received: ${message.action}`);
        return false;
    }
  });
}

eventBus.subscribe('SyncRequested', async (event) => {
  logger.info(`EventBus SyncRequested triggered at ${event.timestamp}`);
});
