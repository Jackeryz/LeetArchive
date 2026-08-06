import { LeetCodeProblem, ProblemDifficulty, SubmissionDetails } from '../types/leetcode';
import { SubmissionDetectedPayload } from '../core/events';
import { logger } from '../utils/logger';

/**
 * Parser service to extract problem metadata, language, and submission status from LeetCode DOM.
 */
export class LeetCodeParser {
  /**
   * Extracts problem slug from a URL or window.location.pathname.
   */
  static extractProblemSlug(url?: string): string {
    const targetUrl = url || (typeof window !== 'undefined' ? window.location.pathname : '');
    const match = targetUrl.match(/\/problems\/([^/]+)/);
    return match ? match[1] : '';
  }

  /**
   * Formats a slug into a human-readable title fallback (e.g. "two-sum" -> "Two Sum").
   */
  static formatSlugToTitle(slug: string): string {
    if (!slug) return 'Unknown Problem';
    return slug
      .split('-')
      .map((word) => {
        if (/^\d+[a-z]+$/i.test(word)) {
          // Special case e.g. "3sum" -> "3Sum"
          return word.slice(0, 1) + word.slice(1, 2).toUpperCase() + word.slice(2).toLowerCase();
        }
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      })
      .join(' ');
  }

  /**
   * Extracts problem title from DOM or document.title, with slug fallback.
   */
  static extractProblemTitle(doc?: Document): string {
    const documentObj = doc || (typeof document !== 'undefined' ? document : null);
    if (!documentObj) return 'Unknown Problem';

    // Query title element in LeetCode problem header
    const titleEl = documentObj.querySelector(
      'a[href^="/problems/"], [data-cy="question-title"], h4, div[class*="title-"]',
    );
    if (titleEl && titleEl.textContent && titleEl.textContent.trim()) {
      // Clean up leading problem numbers e.g. "1. Two Sum" -> "Two Sum"
      const rawText = titleEl.textContent.trim();
      const cleaned = rawText.replace(/^\d+\.\s*/, '');
      if (cleaned) return cleaned;
    }

    // Fallback: Parse document.title e.g. "1. Two Sum - LeetCode"
    if (documentObj.title) {
      const parts = documentObj.title.split('-');
      if (parts.length > 0 && parts[0].trim()) {
        const cleaned = parts[0].trim().replace(/^\d+\.\s*/, '');
        if (cleaned) return cleaned;
      }
    }

    // Ultimate fallback: Format problem slug
    const slug = this.extractProblemSlug();
    return this.formatSlugToTitle(slug);
  }

  /**
   * Extracts problem difficulty ('Easy' | 'Medium' | 'Hard' | 'Unknown') from DOM. Best-effort.
   */
  static extractProblemDifficulty(doc?: Document): ProblemDifficulty {
    const documentObj = doc || (typeof document !== 'undefined' ? document : null);
    if (!documentObj) return 'Unknown';

    // 1. Specific class indicators
    if (documentObj.querySelector('[class*="text-difficulty-easy"], [class*="text-sd-easy"]')) {
      return 'Easy';
    }
    if (documentObj.querySelector('[class*="text-difficulty-medium"], [class*="text-sd-medium"]')) {
      return 'Medium';
    }
    if (documentObj.querySelector('[class*="text-difficulty-hard"], [class*="text-sd-hard"]')) {
      return 'Hard';
    }

    // 2. Text content scan inside difficulty badges/containers
    const badges = documentObj.querySelectorAll(
      'div[class*="difficulty"], span[class*="difficulty"], div[class*="text-sd-"]',
    );
    for (const badge of Array.from(badges)) {
      const text = badge.textContent?.trim().toLowerCase();
      if (text === 'easy') return 'Easy';
      if (text === 'medium') return 'Medium';
      if (text === 'hard') return 'Hard';
    }

    logger.debug('Difficulty badge not found in DOM, defaulting to Unknown');
    return 'Unknown';
  }

  /**
   * Extracts solution language from code editor selector or DOM. Best-effort.
   */
  static extractLanguage(doc?: Document): string {
    const documentObj = doc || (typeof document !== 'undefined' ? document : null);
    if (!documentObj) return 'Unknown';

    const langBtn = documentObj.querySelector(
      'button[id^="headlessui-listbox-button"], div[class*="language-select"], [data-cy="lang-select"]',
    );
    if (langBtn && langBtn.textContent) {
      const langText = langBtn.textContent.trim().toLowerCase();
      if (langText) return langText;
    }

    logger.debug('Language selector not found in DOM, defaulting to Unknown');
    return 'Unknown';
  }

  /**
   * Detects if an "Accepted" submission result panel is currently visible in DOM.
   */
  static detectAcceptedSubmission(doc?: Document): {
    isAccepted: boolean;
    elementId?: string;
    submissionId?: string;
  } {
    const documentObj = doc || (typeof document !== 'undefined' ? document : null);
    if (!documentObj) return { isAccepted: false };

    // Selector 1: Explicit e2e-locator attribute
    const e2eResult = documentObj.querySelector('[data-e2e-locator="submission-result"]');
    if (e2eResult && e2eResult.textContent?.includes('Accepted')) {
      const submissionId = e2eResult.getAttribute('data-submission-id') || undefined;
      logger.debug('Accepted result node detected via data-e2e-locator="submission-result"');
      return { isAccepted: true, elementId: e2eResult.id || undefined, submissionId };
    }

    // Selector 2: Elements with success text classes containing "Accepted"
    const successElements = documentObj.querySelectorAll(
      '[class*="text-sd-success"], [class*="text-success"], [class*="result"], [class*="status"]',
    );
    for (const el of Array.from(successElements)) {
      if (el.textContent && el.textContent.trim() === 'Accepted') {
        const submissionId = el.getAttribute('data-submission-id') || undefined;
        logger.debug('Accepted result node detected via class matching');
        return { isAccepted: true, elementId: el.id || undefined, submissionId };
      }
    }

    return { isAccepted: false };
  }

  /**
   * Extracts metadata payload when an Accepted submission is detected.
   */
  static extractSubmissionMetadata(doc?: Document): SubmissionDetectedPayload | null {
    const acceptedInfo = this.detectAcceptedSubmission(doc);
    if (!acceptedInfo.isAccepted) return null;

    const slug = this.extractProblemSlug();
    if (!slug) {
      logger.debug('Accepted node present but problem slug could not be parsed');
      return null;
    }

    const title = this.extractProblemTitle(doc);
    const difficulty = this.extractProblemDifficulty(doc);
    const language = this.extractLanguage(doc);
    const timestamp = Date.now();

    const payload: SubmissionDetectedPayload = {
      problemTitle: title,
      problemSlug: slug,
      difficulty,
      language,
      timestamp,
      submissionId: acceptedInfo.submissionId,
      rawElementId: acceptedInfo.elementId,
      url: typeof window !== 'undefined' ? window.location.href : undefined,
    };

    logger.debug('Extracted submission metadata:', payload);
    return payload;
  }

  /**
   * Extracts problem information (ID, Title, Difficulty, URL) from the current document context.
   */
  static extractProblemDetails(): LeetCodeProblem | null {
    logger.info('Extracting LeetCode problem details from DOM...');
    const slug = this.extractProblemSlug();
    if (!slug) return null;

    const title = this.extractProblemTitle();
    const difficulty = this.extractProblemDifficulty();

    return {
      id: slug,
      title,
      titleSlug: slug,
      difficulty,
      url: `https://leetcode.com/problems/${slug}/`,
    };
  }

  /**
   * Extracts current solution code from Monaco editor or DOM.
   */
  static extractCode(): string | null {
    logger.info('Extracting solution code from editor...');
    return '// Placeholder LeetCode Solution\n';
  }

  /**
   * Extracts submission details when an accepted notification appears.
   */
  static parseSubmission(): SubmissionDetails | null {
    const problem = this.extractProblemDetails();
    const code = this.extractCode();

    if (!problem || !code) return null;

    return {
      submissionId: Date.now().toString(),
      problem,
      language: this.extractLanguage(),
      extension: 'py',
      code,
      runtime: '35 ms',
      memory: '16.5 MB',
      timestamp: Date.now(),
      status: 'Accepted',
    };
  }
}
