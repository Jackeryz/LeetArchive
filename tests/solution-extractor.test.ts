import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { SolutionExtractor, normalizeCode } from '../src/leetcode/extractor';
import { EventBus, SolutionExtractedPayload, SubmissionDetectedPayload } from '../src/core/events';

// Global mocks for Node environment
if (typeof globalThis.window === 'undefined') {
  globalThis.window = {} as unknown as Window & typeof globalThis;
}

function createMockDocument(elementsList: any[] = []) {
  return {
    querySelectorAll: (selector: string) => {
      const matches: any[] = [];
      for (const el of elementsList) {
        const tag = (el.tagName || '').toLowerCase();
        const className = el.className || '';
        const role = el.attributes?.role || '';

        if (selector.includes('.view-line') && className.includes('view-line')) {
          matches.push(el);
        } else if (selector.includes('textarea') && tag === 'textarea') {
          matches.push(el);
        } else if (
          selector.includes('code') &&
          (tag === 'code' || tag === 'pre' || role === 'code')
        ) {
          matches.push(el);
        }
      }
      return matches;
    },
  } as unknown as Document;
}

describe('Code Normalization (normalizeCode)', () => {
  it('replaces Unicode non-breaking spaces (\\u00A0) with standard ASCII spaces', () => {
    const raw = 'def\u00A0twoSum(self,\u00A0nums):\n\u00A0\u00A0\u00A0\u00A0return []';
    const normalized = normalizeCode(raw);
    expect(normalized).toBe('def twoSum(self, nums):\n    return []\n');
  });

  it('converts Windows CRLF (\\r\\n) to Unix LF (\\n)', () => {
    const raw =
      'class Solution {\r\n    public int[] twoSum() {\r\n        return new int[]{};\r\n    }\r\n}';
    const normalized = normalizeCode(raw);
    expect(normalized).toBe(
      'class Solution {\n    public int[] twoSum() {\n        return new int[]{};\n    }\n}\n',
    );
  });

  it('removes trailing blank lines and guarantees a single trailing newline', () => {
    const raw = 'function test() {}\n\n\n   \n\t\n';
    const normalized = normalizeCode(raw);
    expect(normalized).toBe('function test() {}\n');
  });

  it('preserves leading indentation and internal blank lines', () => {
    const raw =
      'class Solution:\n    def solve(self):\n\n        # Internal comment\n        return True\n';
    const normalized = normalizeCode(raw);
    expect(normalized).toBe(
      'class Solution:\n    def solve(self):\n\n        # Internal comment\n        return True\n',
    );
  });

  it('returns null for empty or whitespace-only code strings', () => {
    expect(normalizeCode('')).toBeNull();
    expect(normalizeCode('   \r\n\t  \n')).toBeNull();
    expect(normalizeCode(null)).toBeNull();
  });
});

describe('SolutionExtractor', () => {
  let extractor: SolutionExtractor;
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = EventBus.getInstance();
    eventBus.clearAllListeners();
    extractor = new SolutionExtractor();
  });

  afterEach(() => {
    extractor.stop();
    eventBus.clearAllListeners();
    delete (globalThis.window as any).monaco;
    vi.restoreAllMocks();
  });

  it('extracts code via Strategy 1 (Monaco Global API) and normalizes CRLF and non-breaking spaces', () => {
    const rawCode =
      'class Solution:\r\n\u00A0\u00A0\u00A0\u00A0def twoSum(self, nums, target):\r\n\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0return []\r\n\r\n';
    const expectedCode =
      'class Solution:\n    def twoSum(self, nums, target):\n        return []\n';
    (globalThis.window as any).monaco = {
      editor: {
        getModels: () => [
          {
            getValue: () => rawCode,
          },
        ],
      },
    };

    const code = extractor.extractSolutionCode();
    expect(code).toBe(expectedCode);
  });

  it('extracts code via Strategy 2 (Monaco Editor DOM Lines)', () => {
    const mockLines = [
      {
        tagName: 'DIV',
        className: 'view-line',
        textContent: 'function twoSum(nums, target) {',
        cloneNode: function () {
          return { textContent: this.textContent, querySelectorAll: () => [] };
        },
      },
      {
        tagName: 'DIV',
        className: 'view-line',
        textContent: '    return [0, 1];',
        cloneNode: function () {
          return { textContent: this.textContent, querySelectorAll: () => [] };
        },
      },
      {
        tagName: 'DIV',
        className: 'view-line',
        textContent: '}',
        cloneNode: function () {
          return { textContent: this.textContent, querySelectorAll: () => [] };
        },
      },
    ];

    const mockDoc = createMockDocument(mockLines);
    const code = extractor.extractSolutionCode(mockDoc);
    expect(code).toBe('function twoSum(nums, target) {\n    return [0, 1];\n}\n');
  });

  it('extracts code via Strategy 3 (Textarea Input Fallback)', () => {
    const mockTextarea = {
      tagName: 'TEXTAREA',
      className: 'inputarea',
      value: 'public class Solution { public int[] twoSum() {} }',
    };

    const mockDoc = createMockDocument([mockTextarea]);
    const code = extractor.extractSolutionCode(mockDoc);
    expect(code).toBe('public class Solution { public int[] twoSum() {} }\n');
  });

  it('extracts code via Strategy 4 (Semantic Code / Pre Elements)', () => {
    const mockCodeEl = {
      tagName: 'PRE',
      className: '',
      textContent: 'fn main() { println!("Hello LeetCode"); }',
    };

    const mockDoc = createMockDocument([mockCodeEl]);
    const code = extractor.extractSolutionCode(mockDoc);
    expect(code).toBe('fn main() { println!("Hello LeetCode"); }\n');
  });

  it('rejects empty, whitespace-only, or placeholder code in validateCode', () => {
    expect(extractor.validateCode('')).toBe(false);
    expect(extractor.validateCode('   \n\t ')).toBe(false);
    expect(extractor.validateCode('// Placeholder LeetCode Solution\n')).toBe(false);
    expect(extractor.validateCode('valid code block')).toBe(true);
  });

  it('handles failed extraction gracefully when all strategies return invalid code', () => {
    const mockEmptyTextarea = {
      tagName: 'TEXTAREA',
      className: 'inputarea',
      value: '   ',
    };

    const mockDoc = createMockDocument([mockEmptyTextarea]);
    const code = extractor.extractSolutionCode(mockDoc);
    expect(code).toBeNull();
  });

  it('subscribes to SubmissionDetected and publishes SolutionExtracted event with accurate payload', () => {
    let emittedSolutionPayload: SolutionExtractedPayload | null = null;
    eventBus.subscribe<SolutionExtractedPayload>('SolutionExtracted', (event) => {
      emittedSolutionPayload = event.payload;
    });

    vi.spyOn(extractor, 'extractSolutionCode').mockReturnValue(
      'class Solution:\n    def twoSum(self, nums: List[int], target: int) -> List[int]:\n        pass',
    );

    const submissionPayload: SubmissionDetectedPayload = {
      problemTitle: 'Two Sum',
      problemSlug: 'two-sum',
      difficulty: 'Easy',
      language: 'python3',
      timestamp: 1700000000000,
      submissionId: '10001',
    };

    extractor.start();
    eventBus.publish('SubmissionDetected', submissionPayload);

    expect(emittedSolutionPayload).not.toBeNull();
    const result = emittedSolutionPayload as unknown as SolutionExtractedPayload;
    expect(result.problemTitle).toBe('Two Sum');
    expect(result.problemSlug).toBe('two-sum');
    expect(result.difficulty).toBe('Easy');
    expect(result.language).toBe('python3');
    expect(result.code).toContain('def twoSum');
  });

  it('handles multiple Accepted submissions across different languages', () => {
    const emittedEvents: SolutionExtractedPayload[] = [];
    eventBus.subscribe<SolutionExtractedPayload>('SolutionExtracted', (event) => {
      emittedEvents.push(event.payload);
    });

    extractor.start();

    const submissions: Array<{ slug: string; lang: string; code: string }> = [
      { slug: 'two-sum', lang: 'python3', code: 'def twoSum(): pass' },
      { slug: 'add-two-numbers', lang: 'cpp', code: 'int main() { return 0; }' },
      { slug: '3sum', lang: 'java', code: 'class Solution {}' },
    ];

    for (const sub of submissions) {
      vi.spyOn(extractor, 'extractSolutionCode').mockReturnValueOnce(sub.code);

      eventBus.publish('SubmissionDetected', {
        problemTitle: sub.slug,
        problemSlug: sub.slug,
        difficulty: 'Medium',
        language: sub.lang,
        timestamp: Date.now(),
      });
    }

    expect(emittedEvents.length).toBe(3);
    expect(emittedEvents[0].language).toBe('python3');
    expect(emittedEvents[1].language).toBe('cpp');
    expect(emittedEvents[2].language).toBe('java');
  });
});
