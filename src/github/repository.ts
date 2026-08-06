import { GitHubApiBase } from './api';
import { RepositoryModel } from '../models/repository';
import { GitHubRepository } from '../types/github';
import { logger } from '../utils/logger';

export class GitHubRepositoryService extends GitHubApiBase {
  /**
   * Fetches detailed information for a specific repository via GET /repos/{owner}/{repo}.
   */
  async getRepositoryDetails(owner: string, repo: string): Promise<RepositoryModel | null> {
    logger.info(`Querying repository details for ${owner}/${repo}...`);
    const response = await this.fetchApi<GitHubRepository>(`/repos/${owner}/${repo}`);
    if (response.status === 200 && response.data) {
      return new RepositoryModel(response.data);
    }
    return null;
  }
}
