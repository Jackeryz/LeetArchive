import { LeetCodeProblem } from '../../types/leetcode';
import { logger } from '../../utils/logger';

export class AutoReadmeFeature {
  /**
   * Auto-generates Markdown documentation for a LeetCode problem.
   */
  static generateReadme(problem: LeetCodeProblem, description: string = ''): string {
    logger.info(`AutoReadmeFeature generating README for #${problem.id} ${problem.title}`);
    return `# ${problem.id}. ${problem.title}\n\nDifficulty: **${problem.difficulty}**\n\nURL: [LeetCode Link](${problem.url})\n\n## Problem Description\n\n${description || 'No description provided.'}\n`;
  }
}
