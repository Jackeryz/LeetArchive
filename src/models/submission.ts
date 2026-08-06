import { LeetCodeProblem, SubmissionDetails } from '../types/leetcode';
import { getFileExtension, formatProblemFolderName } from '../utils/helpers';

export class SubmissionModel implements SubmissionDetails {
  public submissionId: string;
  public problem: LeetCodeProblem;
  public language: string;
  public extension: string;
  public code: string;
  public runtime?: string;
  public runtimePercentile?: number;
  public memory?: string;
  public memoryPercentile?: number;
  public timestamp: number;
  public status = 'Accepted' as const;

  constructor(details: SubmissionDetails) {
    this.submissionId = details.submissionId;
    this.problem = details.problem;
    this.language = details.language;
    this.extension = details.extension || getFileExtension(details.language);
    this.code = details.code;
    this.runtime = details.runtime;
    this.runtimePercentile = details.runtimePercentile;
    this.memory = details.memory;
    this.memoryPercentile = details.memoryPercentile;
    this.timestamp = details.timestamp || Date.now();
  }

  public getFolderName(): string {
    return formatProblemFolderName(this.problem.id, this.problem.title);
  }

  public getCommitMessage(): string {
    return `[Accepted] ${this.problem.id}. ${this.problem.title} (${this.language}) - Time: ${this.runtime || 'N/A'}, Memory: ${this.memory || 'N/A'}`;
  }
}
