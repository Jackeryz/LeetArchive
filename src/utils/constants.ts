/**
 * Constants and default settings for the LeetArchive extension.
 */

export const STORAGE_KEYS = {
  SETTINGS: 'leetarchive_settings',
  AUTH_STATE: 'leetarchive_auth_state',
  SYNC_HISTORY: 'leetarchive_sync_history',
} as const;

export const DEFAULT_SETTINGS = {
  githubToken: null,
  selectedRepo: null,
  branch: 'main',
  folderStructure: 'difficulty',
  autoSync: true,
  syncReadme: true,
} as const;

export const LEETCODE_DOM_SELECTORS = {
  SUBMISSION_SUCCESS: '[data-e2e-locator="submission-result"]',
  CODE_CONTAINER: '.monaco-editor',
  PROBLEM_TITLE: '[data-cy="question-title"]',
} as const;

export const LANGUAGE_EXTENSION_MAP: Record<string, string> = {
  cpp: 'cpp',
  'c++': 'cpp',
  c: 'c',
  csharp: 'cs',
  'c#': 'cs',
  java: 'java',
  python: 'py',
  python3: 'py',
  javascript: 'js',
  typescript: 'ts',
  php: 'php',
  swift: 'swift',
  kotlin: 'kt',
  golang: 'go',
  go: 'go',
  ruby: 'rb',
  scala: 'scala',
  rust: 'rs',
  racket: 'rkt',
  erlang: 'erl',
  elixir: 'ex',
  dart: 'dart',
  sql: 'sql',
};
