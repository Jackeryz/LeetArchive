import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { ArchiveGenerator } from '../src/leetcode/archive-generator';
import { generateReadme } from '../src/leetcode/readme';
import { getSolutionFilename } from '../src/utils/constants';
import { hashContent } from '../src/utils/helpers';
import { ArchiveGeneratedPayload, EventBus, SolutionExtractedPayload } from '../src/core/events';

describe('Language-to-Filename Mapping', () => {
  it('maps canonical languages to correct solution filenames', () => {
    expect(getSolutionFilename('python3')).toBe('solution.py');
    expect(getSolutionFilename('python')).toBe('solution.py');
    expect(getSolutionFilename('cpp')).toBe('solution.cpp');
    expect(getSolutionFilename('C++')).toBe('solution.cpp');
    expect(getSolutionFilename('java')).toBe('Solution.java');
    expect(getSolutionFilename('Java')).toBe('Solution.java');
    expect(getSolutionFilename('javascript')).toBe('solution.js');
    expect(getSolutionFilename('typescript')).toBe('solution.ts');
    expect(getSolutionFilename('golang')).toBe('solution.go');
    expect(getSolutionFilename('go')).toBe('solution.go');
    expect(getSolutionFilename('rust')).toBe('solution.rs');
  });
});

describe('README Generator', () => {
  it('generates clean base markdown with title, metadata, and solution reference', () => {
    const readme = generateReadme({
      problemTitle: 'Two Sum',
      problemSlug: 'two-sum',
      difficulty: 'Easy',
      language: 'python3',
      solutionFilename: 'solution.py',
      timestamp: 1700000000000,
    });

    expect(readme).toContain('# Two Sum');
    expect(readme).toContain('- Difficulty: Easy');
    expect(readme).toContain('- Language: python3');
    expect(readme).toContain('- LeetCode: https://leetcode.com/problems/two-sum/');
    expect(readme).toContain('## Solution\n\nSee `solution.py`.');
  });

  it('supports extensible optional sections for future enhancements', () => {
    const readme = generateReadme({
      problemTitle: 'Two Sum',
      problemSlug: 'two-sum',
      difficulty: 'Easy',
      language: 'python3',
      solutionFilename: 'solution.py',
      problemStatement: 'Given an array of integers nums and an integer target...',
      constraints: ['2 <= nums.length <= 10^4', '-10^9 <= nums[i] <= 10^9'],
      examples: ['Input: nums = [2,7,11,15], target = 9 -> Output: [0,1]'],
      tags: ['Array', 'Hash Table'],
      complexity: { time: 'O(N)', space: 'O(N)' },
      notes: 'Use a hash map for O(1) lookups.',
    });

    expect(readme).toContain('## Problem Statement');
    expect(readme).toContain('Given an array of integers');
    expect(readme).toContain('## Constraints');
    expect(readme).toContain('- 2 <= nums.length <= 10^4');
    expect(readme).toContain('## Examples');
    expect(readme).toContain('## Tags');
    expect(readme).toContain('`Array`');
    expect(readme).toContain('## Complexity Analysis');
    expect(readme).toContain('- Time Complexity: O(N)');
    expect(readme).toContain('## Notes');
    expect(readme).toContain('Use a hash map for O(1) lookups.');
  });
});

describe('ArchiveGenerator', () => {
  let generator: ArchiveGenerator;
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = EventBus.getInstance();
    eventBus.clearAllListeners();
    generator = new ArchiveGenerator();
  });

  afterEach(() => {
    generator.stop();
    eventBus.clearAllListeners();
    vi.restoreAllMocks();
  });

  it('generates Folder Mode virtual file structure by default', () => {
    const extractedPayload: SolutionExtractedPayload = {
      problemTitle: 'Two Sum',
      problemSlug: 'two-sum',
      difficulty: 'Easy',
      language: 'python3',
      code: 'class Solution:\n    def twoSum(self, nums, target):\n        return []',
      timestamp: 1700000000000,
    };

    const archive = generator.generateArchive(extractedPayload, 'folder');

    expect(archive).not.toBeNull();
    expect(archive?.archiveMode).toBe('folder');
    expect(archive?.files.length).toBe(2);
    expect(archive?.files[0].path).toBe('Two Sum/README.md');
    expect(archive?.files[0].content).toContain('# Two Sum');
    expect(archive?.files[1].path).toBe('Two Sum/solution.py');
    expect(archive?.files[1].content).toBe(extractedPayload.code);
  });

  it('generates Single-File Mode virtual file structure when requested', () => {
    const extractedPayload: SolutionExtractedPayload = {
      problemTitle: '3Sum',
      problemSlug: '3sum',
      difficulty: 'Medium',
      language: 'cpp',
      code: 'class Solution { public: vector<vector<int>> threeSum(vector<int>& nums) {} };',
      timestamp: 1700000000000,
    };

    const archive = generator.generateArchive(extractedPayload, 'single-file');

    expect(archive).not.toBeNull();
    expect(archive?.archiveMode).toBe('single-file');
    expect(archive?.files.length).toBe(1);
    expect(archive?.files[0].path).toBe('3Sum.cpp');
    expect(archive?.files[0].content).toBe(extractedPayload.code);
  });

  it('rejects archive generation when solution code is empty or whitespace-only', () => {
    const emptyPayload: SolutionExtractedPayload = {
      problemTitle: 'Two Sum',
      problemSlug: 'two-sum',
      difficulty: 'Easy',
      language: 'python3',
      code: '   \n\t  ',
      timestamp: 1700000000000,
    };

    const archive = generator.generateArchive(emptyPayload);
    expect(archive).toBeNull();
  });

  it('rejects archive generation when required metadata is missing', () => {
    const invalidPayload: SolutionExtractedPayload = {
      problemTitle: '',
      problemSlug: 'two-sum',
      difficulty: 'Easy',
      language: 'python3',
      code: 'def twoSum(): pass',
      timestamp: 1700000000000,
    };

    const archive = generator.generateArchive(invalidPayload);
    expect(archive).toBeNull();
  });

  it('subscribes to SolutionExtracted and publishes ArchiveGenerated event via EventBus', () => {
    let emittedArchive: ArchiveGeneratedPayload | null = null;
    eventBus.subscribe<ArchiveGeneratedPayload>('ArchiveGenerated', (event) => {
      emittedArchive = event.payload;
    });

    generator.start('folder');

    const solutionPayload: SolutionExtractedPayload = {
      problemTitle: 'Add Two Numbers',
      problemSlug: 'add-two-numbers',
      difficulty: 'Medium',
      language: 'java',
      code: 'class Solution { public ListNode addTwoNumbers(ListNode l1, ListNode l2) {} }',
      timestamp: 1700000000000,
    };

    eventBus.publish('SolutionExtracted', solutionPayload);

    expect(emittedArchive).not.toBeNull();
    const archive = emittedArchive as unknown as ArchiveGeneratedPayload;
    expect(archive.problemSlug).toBe('add-two-numbers');
    expect(archive.files.length).toBe(2);
    expect(archive.files[1].path).toBe('Add Two Numbers/Solution.java');
  });

  it('supports multiple languages (Python, Java, C++, TypeScript, Go, Rust)', () => {
    const testCases: Array<{ lang: string; expectedFilename: string }> = [
      { lang: 'python3', expectedFilename: 'Two Sum/solution.py' },
      { lang: 'java', expectedFilename: 'Two Sum/Solution.java' },
      { lang: 'cpp', expectedFilename: 'Two Sum/solution.cpp' },
      { lang: 'typescript', expectedFilename: 'Two Sum/solution.ts' },
      { lang: 'golang', expectedFilename: 'Two Sum/solution.go' },
      { lang: 'rust', expectedFilename: 'Two Sum/solution.rs' },
    ];

    for (const { lang, expectedFilename } of testCases) {
      const archive = generator.generateArchive(
        {
          problemTitle: 'Two Sum',
          problemSlug: 'two-sum',
          difficulty: 'Easy',
          language: lang,
          code: 'valid solution code',
          timestamp: Date.now(),
        },
        'folder',
      );

      expect(archive).not.toBeNull();
      expect(archive?.files[1].path).toBe(expectedFilename);
    }
  });

  it('Critical Check 1: Successive submissions for same problem generate archives strictly from CURRENT solution code without retaining previous state', () => {
    const code1 =
      'def twoSum(nums, target):\n    # First submission\n    for i in range(len(nums)):\n        for j in range(i+1, len(nums)):\n            if nums[i] + nums[j] == target: return [i, j]\n';
    const code2 =
      'def twoSum(nums, target):\n    # Second submission (hash map)\n    seen = {}\n    for i, n in enumerate(nums):\n        if target - n in seen: return [seen[target - n], i]\n        seen[n] = i\n';

    const hash1 = hashContent(code1);
    const hash2 = hashContent(code2);
    expect(hash1).not.toBe(hash2);

    // First archive generation
    const archive1 = generator.generateArchive({
      problemTitle: 'Two Sum',
      problemSlug: 'two-sum',
      difficulty: 'Easy',
      language: 'python3',
      code: code1,
      timestamp: 1700000000000,
    });
    expect(archive1).not.toBeNull();
    const solutionFile1 = archive1!.files.find((f) => f.path === 'Two Sum/solution.py');
    expect(solutionFile1).toBeDefined();
    expect(hashContent(solutionFile1!.content)).toBe(hash1);

    // Second archive generation for the same problem with new code
    const archive2 = generator.generateArchive({
      problemTitle: 'Two Sum',
      problemSlug: 'two-sum',
      difficulty: 'Easy',
      language: 'python3',
      code: code2,
      timestamp: 1700000005000,
    });
    expect(archive2).not.toBeNull();
    const solutionFile2 = archive2!.files.find((f) => f.path === 'Two Sum/solution.py');
    expect(solutionFile2).toBeDefined();

    // Critical Check: second archive must contain hash2, NOT hash1
    expect(hashContent(solutionFile2!.content)).toBe(hash2);
    expect(hashContent(solutionFile2!.content)).not.toBe(hash1);
    expect(solutionFile2!.content).toBe(code2);
  });
});
