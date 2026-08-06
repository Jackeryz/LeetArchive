import { SubmissionDetails } from '../types/leetcode';
import { logger } from '../utils/logger';

/**
 * Handles creation and formatting of submission objects.
 */
export class SubmissionHandler {
  /**
   * Generates a standardized commit message for a LeetCode submission.
   */
  static formatCommitMessage(submission: SubmissionDetails): string {
    const { problem, runtime, memory } = submission;
    let message = `Time: ${runtime || 'N/A'}, Memory: ${memory || 'N/A'} - LeetSync`;
    message = `[Accepted] ${problem.id}. ${problem.title} (${submission.language}) - ${message}`;
    return message;
  }

  /**
   * Validates if a submission object has all required fields.
   */
  static validateSubmission(
    submission: Partial<SubmissionDetails>,
  ): submission is SubmissionDetails {
    if (!submission.submissionId || !submission.code || !submission.problem) {
      logger.warn('Submission object is missing required fields', submission);
      return false;
    }
    return true;
  }
}
