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

export const SUPPORTED_LEETCODE_LANGUAGES = [
  'cpp',
  'c++',
  'c',
  'csharp',
  'c#',
  'java',
  'python',
  'python3',
  'javascript',
  'typescript',
  'php',
  'swift',
  'kotlin',
  'golang',
  'go',
  'ruby',
  'scala',
  'rust',
  'racket',
  'erlang',
  'elixir',
  'dart',
  'sql',
  'mysql',
  'mssql',
  'oraclesql',
  'pandas',
  'pythondata',
] as const;

export const LANGUAGE_ALIAS_MAP: Record<string, string> = {
  'c++': 'cpp',
  'c#': 'csharp',
  golang: 'go',
};

/**
 * Validates raw extracted text against the supported LeetCode language whitelist.
 * Returns normalized language string if valid, or null if invalid.
 */
export function validateAndNormalizeLanguage(rawInput: string): string | null {
  if (!rawInput) return null;
  const cleaned = rawInput.trim().toLowerCase();
  if (!cleaned) return null;

  // Helper to resolve alias (e.g. 'c++' -> 'cpp')
  const normalize = (lang: string) => LANGUAGE_ALIAS_MAP[lang] || lang;

  // 1. Direct equality match
  for (const lang of SUPPORTED_LEETCODE_LANGUAGES) {
    if (cleaned === lang) {
      return normalize(lang);
    }
  }

  // 2. Token match for formatted names (e.g. "C++ (GCC 11.2)" -> "cpp", "Python3 (v3.10)" -> "python3")
  const firstToken = cleaned.split(/[\s(]/)[0];
  if (firstToken) {
    for (const lang of SUPPORTED_LEETCODE_LANGUAGES) {
      if (firstToken === lang) {
        return normalize(lang);
      }
    }
  }

  return null;
}

/**
 * Maps a language string to its standard solution filename (e.g. "python3" -> "solution.py", "java" -> "Solution.java").
 */
export function getSolutionFilename(language: string): string {
  const norm = validateAndNormalizeLanguage(language) || language.trim().toLowerCase();
  const ext =
    LANGUAGE_EXTENSION_MAP[norm] || LANGUAGE_EXTENSION_MAP[language.trim().toLowerCase()] || 'txt';

  if (norm === 'java' || ext === 'java') {
    return 'Solution.java';
  }
  return `solution.${ext}`;
}
