import { LeetCodeProblem, SubmissionDetails } from '../types/leetcode';
import { logger } from '../utils/logger';

/**
 * Parser service to extract solution code, problem metadata, and runtime metrics from LeetCode.
 */
export class LeetCodeParser {
  /**
   * Extracts problem information (ID, Title, Difficulty, URL) from the current document context.
   * TODO: Implement DOM selectors and GraphQL query fallback for new LeetCode UI.
   */
  static extractProblemDetails(): LeetCodeProblem | null {
    logger.info('Extracting LeetCode problem details from DOM...');
    // TODO: Query DOM elements or window.__NEXT_DATA__
    return {
      id: '1',
      title: 'Two Sum',
      titleSlug: 'two-sum',
      difficulty: 'Easy',
      url: 'https://leetcode.com/problems/two-sum/',
    };
  }

  /**
   * Extracts current solution code from Monaco editor or DOM.
   * TODO: Extract code from Monaco Editor instance or text container.
   */
  static extractCode(): string | null {
    logger.info('Extracting solution code from editor...');
    // TODO: Inspect DOM for Monaco lines or query editor state
    return '// Placeholder LeetCode Solution\n';
  }

  /**
   * Extracts submission details when an accepted notification appears.
   * TODO: Full implementation to collect runtime, memory, and code upon submission.
   */
  static parseSubmission(): SubmissionDetails | null {
    const problem = this.extractProblemDetails();
    const code = this.extractCode();

    if (!problem || !code) return null;

    return {
      submissionId: Date.now().toString(),
      problem,
      language: 'python3',
      extension: 'py',
      code,
      runtime: '35 ms',
      memory: '16.5 MB',
      timestamp: Date.now(),
      status: 'Accepted',
    };
  }
}
