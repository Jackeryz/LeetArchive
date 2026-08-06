/**
 * GitHub API and authentication data types for LeetSync.
 */

export interface GitHubUser {
  login: string;
  id: number;
  avatar_url: string;
  html_url: string;
  name: string | null;
  email: string | null;
}

export interface GitHubRepository {
  id: number;
  name: string;
  full_name: string;
  owner: {
    login: string;
    avatar_url: string;
  };
  private: boolean;
  html_url: string;
  description: string | null;
  default_branch: string;
}

export interface CommitPayload {
  owner: string;
  repo: string;
  branch: string;
  path: string;
  content: string; // Base64 encoded or UTF-8
  commitMessage: string;
  sha?: string; // Present if updating an existing file
}

export interface GitHubCommitResult {
  commitSha: string;
  contentSha: string;
  htmlUrl: string;
}

export interface AuthState {
  isAuthenticated: boolean;
  accessToken: string | null;
  user: GitHubUser | null;
  selectedRepo: GitHubRepository | null;
}
