import { GitHubApiBase } from './api';
import { logger } from '../utils/logger';

export interface GitTreeItem {
  path: string;
  mode: '100644' | '100755' | '040000' | '160000' | '120000';
  type: 'blob' | 'tree' | 'commit';
  content?: string;
  sha?: string;
}

export class GitHubCommitsService extends GitHubApiBase {
  /**
   * Creates a multi-file tree for advanced atomic commits.
   * TODO: Implement POST /repos/{owner}/{repo}/git/trees
   */
  async createTree(
    owner: string,
    repo: string,
    baseTreeSha: string,
    treeItems: GitTreeItem[],
  ): Promise<string> {
    logger.info(`Creating Git tree with ${treeItems.length} items on ${owner}/${repo}...`);
    const response = await this.fetchApi<{ sha: string }>(`/repos/${owner}/${repo}/git/trees`, {
      method: 'POST',
      body: JSON.stringify({ base_tree: baseTreeSha, tree: treeItems }),
    });
    return response.data?.sha || 'mock-tree-sha';
  }

  /**
   * Creates a commit object referencing a tree.
   * TODO: Implement POST /repos/{owner}/{repo}/git/commits
   */
  async createCommit(
    owner: string,
    repo: string,
    message: string,
    treeSha: string,
    parentShas: string[],
  ): Promise<string> {
    logger.info(`Creating Git commit '${message}' on ${owner}/${repo}...`);
    const response = await this.fetchApi<{ sha: string }>(`/repos/${owner}/${repo}/git/commits`, {
      method: 'POST',
      body: JSON.stringify({ message, tree: treeSha, parents: parentShas }),
    });
    return response.data?.sha || 'mock-commit-sha';
  }
}
