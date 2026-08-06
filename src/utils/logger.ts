/**
 * Prefixed logger utility for consistent logging across content scripts, service workers, and UI.
 */

const PREFIX = '[LeetArchive]';

export const logger = {
  info: (message: string, ...args: unknown[]): void => {
    console.log(`${PREFIX} ℹ️ ${message}`, ...args);
  },
  warn: (message: string, ...args: unknown[]): void => {
    console.warn(`${PREFIX} ⚠️ ${message}`, ...args);
  },
  error: (message: string, ...args: unknown[]): void => {
    console.error(`${PREFIX} ❌ ${message}`, ...args);
  },
  debug: (message: string, ...args: unknown[]): void => {
    const isDev =
      typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'development';
    if (isDev) {
      console.debug(`${PREFIX} 🐛 ${message}`, ...args);
    }
  },
};
