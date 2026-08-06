/**
 * Options for generating a problem README.md file.
 * Extensible for future sections (problem statement, constraints, examples, hints, tags, complexity, notes).
 */
export interface ReadmeOptions {
  problemTitle: string;
  problemSlug: string;
  difficulty: string;
  language: string;
  solutionFilename: string;
  timestamp?: number;
  problemStatement?: string;
  examples?: string[];
  constraints?: string[];
  hints?: string[];
  tags?: string[];
  complexity?: { time?: string; space?: string };
  notes?: string;
}

/**
 * Generates a clean, human-readable README.md for a solved LeetCode problem.
 * Designed modularly to easily append optional sections without architectural refactoring.
 */
export function generateReadme(options: ReadmeOptions): string {
  const dateObj = options.timestamp ? new Date(options.timestamp) : new Date();
  const localDate = dateObj.toLocaleDateString();
  const localTime = dateObj.toLocaleTimeString();
  const problemUrl = `https://leetcode.com/problems/${options.problemSlug}/`;

  let markdown = `# ${options.problemTitle}\n\n`;
  markdown += `- Difficulty: ${options.difficulty}\n`;
  markdown += `- Language: ${options.language}\n`;
  markdown += `- Solved On: ${localDate}\n`;
  markdown += `- Archived At: ${localTime}\n`;
  markdown += `- LeetCode: ${problemUrl}\n\n`;

  if (options.problemStatement) {
    markdown += `## Problem Statement\n\n${options.problemStatement}\n\n`;
  }
  if (options.examples && options.examples.length > 0) {
    markdown += `## Examples\n\n${options.examples.map((ex) => `- ${ex}`).join('\n')}\n\n`;
  }
  if (options.constraints && options.constraints.length > 0) {
    markdown += `## Constraints\n\n${options.constraints.map((c) => `- ${c}`).join('\n')}\n\n`;
  }
  if (options.hints && options.hints.length > 0) {
    markdown += `## Hints\n\n${options.hints.map((h) => `- ${h}`).join('\n')}\n\n`;
  }
  if (options.tags && options.tags.length > 0) {
    markdown += `## Tags\n\n${options.tags.map((t) => `\`${t}\``).join(', ')}\n\n`;
  }
  if (options.complexity) {
    markdown += `## Complexity Analysis\n\n`;
    if (options.complexity.time) markdown += `- Time Complexity: ${options.complexity.time}\n`;
    if (options.complexity.space) markdown += `- Space Complexity: ${options.complexity.space}\n`;
    markdown += `\n`;
  }
  if (options.notes) {
    markdown += `## Notes\n\n${options.notes}\n\n`;
  }

  markdown += `## Solution\n\nSee \`${options.solutionFilename}\`.\n`;

  return markdown;
}
