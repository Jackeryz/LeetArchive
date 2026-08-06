/**
 * LeetCode problem, submission, and language metadata types for LeetSync.
 */

export type ProblemDifficulty = 'Easy' | 'Medium' | 'Hard' | 'Unknown';

export interface LeetCodeProblem {
  id: string;
  title: string;
  titleSlug: string;
  difficulty: ProblemDifficulty;
  url: string;
  category?: string;
  tags?: string[];
}

export interface SubmissionDetails {
  submissionId: string;
  problem: LeetCodeProblem;
  language: string;
  extension: string;
  code: string;
  runtime?: string; // e.g. "45 ms"
  runtimePercentile?: number; // e.g. 88.5
  memory?: string; // e.g. "16.4 MB"
  memoryPercentile?: number;
  timestamp: number;
  status: 'Accepted';
}

export interface SyncLogEntry {
  id: string;
  submissionId: string;
  problemTitle: string;
  difficulty: ProblemDifficulty;
  repoFullName: string;
  filePath: string;
  commitSha: string;
  timestamp: number;
  status: 'success' | 'failed';
  errorDetails?: string;
}

export interface UserExtensionSettings {
  githubToken: string | null;
  selectedRepo: string | null; // "owner/repo"
  branch: string;
  folderStructure: 'difficulty' | 'flat' | 'tag';
  autoSync: boolean;
  syncReadme: boolean;
}
