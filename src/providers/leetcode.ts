import { LeetCodeParser } from '../leetcode/parser';
import { SubmissionModel } from '../models/submission';
import { logger } from '../utils/logger';

export interface IPlatformProvider {
  name: string;
  isPlatformUrl(url: string): boolean;
  extractSubmission(): SubmissionModel | null;
}

export class LeetCodeProvider implements IPlatformProvider {
  public name = 'LeetCode';

  public isPlatformUrl(url: string): boolean {
    return url.includes('leetcode.com') || url.includes('leetcode.cn');
  }

  public extractSubmission(): SubmissionModel | null {
    logger.info('LeetCodeProvider parsing submission...');
    const rawDetails = LeetCodeParser.parseSubmission();
    if (!rawDetails) return null;
    return new SubmissionModel(rawDetails);
  }
}
