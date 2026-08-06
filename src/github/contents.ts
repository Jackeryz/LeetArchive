import { GitHubApiBase } from './api';
import { CommitPayload, GitHubCommitResult } from '../types/github';
import { SecurityValidation } from '../security/validation';
import { utf8ToBase64 } from '../utils/helpers';
import { logger } from '../utils/logger';

export class GitHubContentsService extends GitHubApiBase {
  /**
   * Retrieves SHA of an existing file in the repository (returns null if 404).
   */
  async getFileSha(
    owner: string,
    repo: string,
    path: string,
    branch: string,
  ): Promise<string | null> {
    const sanitizedPath = SecurityValidation.sanitizeFilePath(path);
    logger.info(`Getting SHA for ${owner}/${repo}/${sanitizedPath} on branch ${branch}...`);

    const response = await this.fetchApi<{ sha: string }>(
      `/repos/${owner}/${repo}/contents/${sanitizedPath}?ref=${branch}`,
    );
    return response.data?.sha || null;
  }

  /**
   * Creates or updates a single file content in the repository via PUT /contents endpoint.
   */
  async putFileContent(payload: CommitPayload): Promise<GitHubCommitResult> {
    const sanitizedPath = SecurityValidation.sanitizeFilePath(payload.path);
    const encodedContent = utf8ToBase64(payload.content);

    logger.info(
      `Uploading file ${sanitizedPath} to ${payload.owner}/${payload.repo}:${payload.branch}...`,
    );

    const body = {
      message: payload.commitMessage,
      content: encodedContent,
      branch: payload.branch,
      sha: payload.sha,
    };

    const response = await this.fetchApi<{
      commit: { sha: string };
      content: { sha: string; html_url: string };
    }>(`/repos/${payload.owner}/${payload.repo}/contents/${sanitizedPath}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });

    return {
      commitSha: response.data?.commit?.sha || 'mock-commit-sha',
      contentSha: response.data?.content?.sha || 'mock-content-sha',
      htmlUrl:
        response.data?.content?.html_url || `https://github.com/${payload.owner}/${payload.repo}`,
    };
  }
}
