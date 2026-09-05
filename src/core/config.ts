import { PushBehavior, ThemePreference } from '../types/leetcode';

/**
 * Centralized application configuration for LeetArchive.
 */

export const APP_CONFIG = {
  name: 'LeetArchive',
  version: '1.0.0',
  githubApiBaseUrl: 'https://api.github.com',
  githubPatUrl: 'https://github.com/settings/tokens?type=beta',
  leetcodeBaseUrl: 'https://leetcode.com',
  leetcodeCnBaseUrl: 'https://leetcode.cn',
} as const;

export const DEFAULT_USER_SETTINGS = {
  githubToken: null,
  selectedRepo: null,
  branch: 'main',
  folderStructure: 'difficulty' as const,
  autoSync: true,
  syncReadme: true,
  leetcodeUsername: null as string | null,
  pushBehavior: 'ask' as PushBehavior,
  theme: 'system' as ThemePreference,
};
