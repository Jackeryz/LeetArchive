import { EventBus, SubmissionDetectedPayload } from '../core/events';
import { logger } from '../utils/logger';
import { LeetCodeParser } from './parser';

/**
 * Monitors DOM mutations on LeetCode problem pages to trigger auto-sync on Accepted submissions.
 * Handles SPA navigation transitions using standard browser events and prevents duplicate event emissions per submission,
 * while ensuring new submissions for the same problem are recognized and processed.
 */
export class LeetCodeObserver {
  private observer: MutationObserver | null = null;
  private onAcceptedCallback: ((payload: SubmissionDetectedPayload) => void) | null = null;
  private hasEmittedForCurrentSubmission: boolean = false;
  private lastEmittedSubmissionId: string | null = null;
  private currentUrl: string = '';
  private isObserving: boolean = false;
  private popstateHandler: (() => void) | null = null;
  private clickHandler: ((e: MouseEvent) => void) | null = null;
  private keydownHandler: ((e: KeyboardEvent) => void) | null = null;

  /**
   * Starts observing the DOM for accepted submission elements and sets up SPA navigation listeners.
   */
  start(onAccepted?: (payload: SubmissionDetectedPayload) => void): void {
    if (this.isObserving) {
      logger.debug('LeetCode submission observer is already running.');
      return;
    }

    logger.debug('Starting LeetCode submission DOM observer...');
    this.isObserving = true;
    this.onAcceptedCallback = onAccepted || null;
    this.currentUrl = typeof window !== 'undefined' ? window.location.href : '';
    this.hasEmittedForCurrentSubmission = false;
    this.lastEmittedSubmissionId = null;

    this.setupSpaNavigationListeners();
    this.setupSubmissionActionListeners();

    this.observer = new MutationObserver(() => {
      this.handleDomMutation();
    });

    if (typeof document !== 'undefined' && document.body) {
      this.observer.observe(document.body, {
        childList: true,
        subtree: true,
      });
    }

    // Immediate check upon starting
    this.checkSubmissionResult();
  }

  /**
   * Handles DOM mutations, checking for SPA URL changes and Accepted submission results.
   */
  private handleDomMutation(): void {
    if (!this.isObserving) return;

    if (typeof window !== 'undefined' && window.location.href !== this.currentUrl) {
      this.handleUrlChange(window.location.href);
    }

    this.checkSubmissionResult();
  }

  /**
   * Listens for SPA route changes via standard browser popstate and hashchange events.
   */
  private setupSpaNavigationListeners(): void {
    if (typeof window === 'undefined') return;

    this.popstateHandler = () => {
      this.handleUrlChange(window.location.href);
    };
    window.addEventListener('popstate', this.popstateHandler);
    window.addEventListener('hashchange', this.popstateHandler);
    logger.debug('Registered standard popstate & hashchange SPA navigation listeners.');
  }

  /**
   * Listens for user submission actions (click on Submit buttons or Ctrl/Cmd+Enter shortcut)
   * to proactively reset the submission lock for subsequent submissions on the same problem.
   */
  private setupSubmissionActionListeners(): void {
    if (typeof window === 'undefined') return;

    this.clickHandler = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const submitBtn = target.closest(
        '[data-e2e-locator="console-submit-button"], button[data-cy="submit-code-btn"], button',
      );
      if (submitBtn && submitBtn.textContent && submitBtn.textContent.includes('Submit')) {
        logger.debug('User clicked Submit button. Resetting submission detection lock.');
        this.resetSubmissionLock();
      }
    };

    this.keydownHandler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        logger.debug('User pressed submit shortcut (Ctrl/Cmd+Enter). Resetting submission lock.');
        this.resetSubmissionLock();
      }
    };

    window.addEventListener('click', this.clickHandler, true);
    window.addEventListener('keydown', this.keydownHandler, true);
  }

  /**
   * Handles SPA URL change events, resetting emission locks for new pages.
   */
  private handleUrlChange(newUrl: string): void {
    if (newUrl === this.currentUrl) return;

    logger.debug(`SPA navigation detected: ${this.currentUrl} -> ${newUrl}`);
    this.currentUrl = newUrl;
    this.resetSubmissionLock();
    this.lastEmittedSubmissionId = null;

    // Check if new page has an accepted result node
    this.checkSubmissionResult();
  }

  /**
   * Resets the emission lock to allow detecting new submissions.
   */
  public resetSubmissionLock(): void {
    if (this.hasEmittedForCurrentSubmission) {
      logger.debug('Resetting submission detection lock for new submission/page');
      this.hasEmittedForCurrentSubmission = false;
    }
  }

  /**
   * Scans DOM for an Accepted submission and dispatches SubmissionDetected event if not previously emitted.
   */
  public checkSubmissionResult(): void {
    const acceptedInfo = LeetCodeParser.detectAcceptedSubmission();

    if (!acceptedInfo.isAccepted) {
      // Reset lock if DOM transitions away from Accepted state (e.g. user submitted code again or pending)
      if (this.hasEmittedForCurrentSubmission) {
        logger.debug('DOM transitioned out of Accepted state. Resetting submission lock.');
        this.hasEmittedForCurrentSubmission = false;
      }
      return;
    }

    // Deduplication check: Allow if lock is reset OR if a new submissionId is present
    const isNewSubmissionId =
      Boolean(acceptedInfo.submissionId) &&
      acceptedInfo.submissionId !== this.lastEmittedSubmissionId;

    if (this.hasEmittedForCurrentSubmission && !isNewSubmissionId) {
      return;
    }

    const payload = LeetCodeParser.extractSubmissionMetadata();
    if (!payload) {
      logger.debug('Accepted result node present, but metadata extraction failed');
      return;
    }

    this.hasEmittedForCurrentSubmission = true;
    this.lastEmittedSubmissionId = acceptedInfo.submissionId || null;
    logger.debug(
      `Emitting SubmissionDetected event for problem '${payload.problemSlug}' (${payload.language}, submissionId=${payload.submissionId || 'unknown'})`,
    );

    // Publish event via EventBus
    EventBus.getInstance().publish('SubmissionDetected', payload);

    // Trigger optional direct callback
    if (this.onAcceptedCallback) {
      try {
        this.onAcceptedCallback(payload);
      } catch (err: unknown) {
        logger.error(
          `Error in onAcceptedCallback handler: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  /**
   * Stops observing the DOM and cleans up standard event listeners.
   */
  stop(): void {
    if (!this.isObserving) return;

    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }

    if (typeof window !== 'undefined') {
      if (this.popstateHandler) {
        window.removeEventListener('popstate', this.popstateHandler);
        window.removeEventListener('hashchange', this.popstateHandler);
        this.popstateHandler = null;
      }
      if (this.clickHandler) {
        window.removeEventListener('click', this.clickHandler, true);
        this.clickHandler = null;
      }
      if (this.keydownHandler) {
        window.removeEventListener('keydown', this.keydownHandler, true);
        this.keydownHandler = null;
      }
    }

    this.hasEmittedForCurrentSubmission = false;
    this.lastEmittedSubmissionId = null;
    this.onAcceptedCallback = null;
    this.isObserving = false;
    logger.debug('Stopped LeetCode submission observer and cleaned up resources.');
  }
}
