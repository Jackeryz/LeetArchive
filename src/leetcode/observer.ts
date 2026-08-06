import { SubmissionDetails } from '../types/leetcode';
import { logger } from '../utils/logger';
import { LeetCodeParser } from './parser';

/**
 * Monitors DOM mutations on LeetCode problem pages to trigger auto-sync on Accepted submissions.
 */
export class LeetCodeObserver {
  private observer: MutationObserver | null = null;
  private onAcceptedCallback: ((submission: SubmissionDetails) => void) | null = null;

  /**
   * Starts observing the DOM for accepted submission elements.
   * TODO: Implement robust selector queries for LeetCode dynamic result nodes.
   */
  start(onAccepted: (submission: SubmissionDetails) => void): void {
    logger.info('Starting LeetCode submission DOM observer...');
    this.onAcceptedCallback = onAccepted;

    this.observer = new MutationObserver((_mutations) => {
      // TODO: Check if any mutation matches target success locator
      this.checkSubmissionResult();
    });

    if (typeof document !== 'undefined' && document.body) {
      this.observer.observe(document.body, {
        childList: true,
        subtree: true,
      });
    }
  }

  /**
   * Checks if an "Accepted" submission notice is present and dispatches callback once.
   */
  private checkSubmissionResult(): void {
    // TODO: Verify if submission is newly accepted and extract submission payload
    const submission = LeetCodeParser.parseSubmission();
    if (submission && this.onAcceptedCallback) {
      logger.info('Detected accepted submission event!');
      // Prevent duplicate triggers
      // this.onAcceptedCallback(submission);
    }
  }

  /**
   * Stops observing the DOM.
   */
  stop(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
      logger.info('Stopped LeetCode submission observer.');
    }
  }
}
