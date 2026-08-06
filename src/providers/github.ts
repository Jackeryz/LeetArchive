import { SubmissionModel } from '../models/submission';
import { CommitPayload, GitHubCommitResult } from '../types/github';
import { logger } from '../utils/logger';

export interface ISyncProvider {
  name: string;
  uploadSubmission(
    submission: SubmissionModel,
    repoFullName: string,
    branch: string,
  ): Promise<GitHubCommitResult>;
}

export class GitHubProvider implements ISyncProvider {
  public name = 'GitHub';

  /**
   * Uploads a submission to GitHub using Git contents API.
   * TODO: Delegate commit payload assembly to github/commits.ts and git API calls to github/contents.ts.
   */
  async uploadSubmission(
    submission: SubmissionModel,
    repoFullName: string,
    branch: string,
  ): Promise<GitHubCommitResult> {
    logger.info(
      `GitHubProvider uploading ${submission.getFolderName()} to ${repoFullName}:${branch}`,
    );
    const [owner, repo] = repoFullName.split('/');

    const payload: CommitPayload = {
      owner,
      repo,
      branch,
      path: `Easy/${submission.getFolderName()}/solution.${submission.extension}`,
      content: submission.code,
      commitMessage: submission.getCommitMessage(),
    };

    // TODO: Connect to GitHubApiClient contents API
    return {
      commitSha: 'mock-sha-' + submission.submissionId,
      contentSha: 'mock-content-sha',
      htmlUrl: `https://github.com/${payload.owner}/${payload.repo}`,
    };
  }
}
